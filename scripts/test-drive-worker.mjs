// npm run test:drive-worker: World Drive's Worker (worker/drive/) against `wrangler dev` on this
// machine, with a throwaway Durable Object. Turnstile's documented test secrets stand in for the
// real one, a made-up Maps key for the real one, and a small server here answers as Turnstile's
// siteverify does for those test secrets and as Nominatim does, so nothing reaches Cloudflare,
// Google or OpenStreetMap. Checks: the key only ever comes back from a visit that passed Turnstile
// and was under the caps; the caps for everyone and per visitor, counted at once and starting again
// at midnight UTC; visitors stored only as hashes; same-origin and JSON checks; the search's
// validation, cache and one-request-a-second limit; and www going to worlddrive.app. And the
// leaderboard, on a throwaway D1 database: nicknames and their rules (each made with a visit's
// token, one player a visit), renaming, scores posted with a visit's token, IPv6 visitors counted
// by their /64, each way of cheating it turns away (tokens forged, changed, expired or someone
// else's, the wrong secret, scores the game can't make, too many too fast), the boards (top 20,
// your own rank, one place, the cache), days and weeks starting at midnight UTC, and the tidying
// up after 35 days. And the Supporter Pass, with ID tokens signed by test keys standing in for
// Google's and webhooks signed with a made-up secret standing in for Stripe's: signing in (and
// every bad token turned away), the session cookie, /api/me, the webhook (signatures, five minutes,
// a payment once, bank debits, bought before signing in, refunds, another link's checkouts), the
// same-origin checks it alone goes without, SUPPORTER_EMAILS, 30 drives a day for a supporter, the
// ⭐ on the leaderboard, the owner's SQL, and buying off without its settings.
// TEST_DRIVE_WORKER_PORT=8796 moves the five wrangler servers (that port and the next four).

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { register } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';
import { sessionCookies } from '../worker/sessions.js';
import { MAX_SCORE, RATE, SCORING, maxRate } from '../worker/drive/scores.js';
import { addressOf } from '../worker/drive/settings.js';
import { purchaseFor, purchaseSettings } from '../worker/drive/supporter.js';
import { VISIT_HOURS, makeVisit } from '../worker/drive/visits.js';

const PORT = Number( process.env.TEST_DRIVE_WORKER_PORT ) || 8796;
const MAPS_KEY = 'test-maps-key-not-real';
// Turnstile's documented test secrets: always passes, always fails.
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const FAIL_SECRET = '2x0000000000000000000000000000000AA';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const DAILY = 5;
const PER_VISITOR = 2;
// 30 October 2026, 22:00 UTC: two hours before the counts start again.
const EVENING = Date.UTC( 2026, 9, 30, 22, 0, 0 );
const NEXT_DAY = Date.UTC( 2026, 9, 31, 0, 0, 5 );

// --- stand-ins for Turnstile and Nominatim -----------------------------------------------

const verifications = [];
const searches = [];
let turnstileDown = false;
let searchDown = false;

const upstream = createServer( async ( req, res ) => {

	const url = new URL( req.url, 'http://upstream' );
	if ( url.pathname === '/siteverify' ) {

		const form = await new Response( req, { headers: { 'Content-Type': req.headers[ 'content-type' ] } } ).formData();
		const call = Object.fromEntries( form );
		verifications.push( call );
		if ( turnstileDown ) return send( res, 500, { error: 'down' } );
		// What Turnstile answers for its test secrets.
		if ( call.secret === PASS_SECRET ) return send( res, 200, { success: true, 'error-codes': [], hostname: 'example.com' } );
		return send( res, 200, { success: false, 'error-codes': [ 'invalid-input-response' ] } );

	}

	if ( url.pathname === '/search' ) {

		searches.push( { time: Date.now(), q: url.searchParams.get( 'q' ), params: Object.fromEntries( url.searchParams ), userAgent: req.headers[ 'user-agent' ] } );
		if ( searchDown ) return send( res, 503, { error: 'down' } );
		const q = url.searchParams.get( 'q' );
		if ( q === 'furka pass' ) {

			return send( res, 200, [
				{ place_id: 1, osm_id: 99, display_name: 'Furkapass, Obergoms, Wallis, Switzerland', lat: '46.5725', lon: '8.4153', type: 'mountain_pass', addresstype: 'mountain_pass', importance: 0.5, boundingbox: [ '1', '2', '3', '4' ] },
				{ place_id: 2, display_name: 'Broken result', lat: 'north', lon: '8' },
				{ place_id: 3, display_name: 'Off the map', lat: '123', lon: '8' },
			] );

		}

		return send( res, 200, [ { display_name: `Somewhere called ${ q }`, lat: '10.5', lon: '-20.25', type: 'village' } ] );

	}

	send( res, 404, {} );

} );

function send( res, status, body ) {

	res.writeHead( status, { 'Content-Type': 'application/json' } );
	res.end( JSON.stringify( body ) );

}

let upstreamBase;
before( async () => {

	await new Promise( resolve => upstream.listen( 0, '127.0.0.1', resolve ) );
	upstreamBase = `http://127.0.0.1:${ upstream.address().port }`;

} );

after( () => upstream.close() );

// Every answer the Worker gave, to check the key was only in the ones it should be.
const answers = [];

async function call( server, path, { method = 'GET', body, headers = {}, ip, time } = {} ) {

	const sent = { ...headers };
	if ( ip ) sent[ 'CF-Connecting-IP' ] = ip;
	if ( time ) sent[ 'X-Test-Time' ] = String( time );
	const res = await fetch( server.base + path, { method, headers: sent, body, redirect: 'manual' } );
	const text = await res.text();
	answers.push( { path, status: res.status, text } );
	let json = null;
	try {

		json = JSON.parse( text );

	} catch {

		// Not JSON.

	}

	return { status: res.status, headers: res.headers, text, json };

}

// A visit as the page makes it: JSON, from the site itself, with a Turnstile token.
function visit( server, { ip = '198.51.100.1', time = EVENING, token = TOKEN } = {} ) {

	return call( server, '/api/visit', {
		method: 'POST',
		headers: { Origin: server.base, 'Content-Type': 'application/json' },
		body: JSON.stringify( { token } ),
		ip,
		time,
	} );

}

// --- the Worker with a passing Turnstile secret -------------------------------------------

describe( 'World Drive Worker', () => {

	let server;

	before( async () => {

		server = await startWorker( {
			port: PORT,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
				DAILY_VISITS: String( DAILY ),
				PER_VISITOR_DAILY: String( PER_VISITOR ),
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				SEARCH_UPSTREAM: `${ upstreamBase }/search`,
				TEST_CLOCK: 'header',
			},
		} );

	} );

	after( () => server?.stop() );

	test( 'config gives the Turnstile site key and says maps are on, but never the key', async () => {

		const { status, json, text } = await call( server, '/api/config' );
		assert.equal( status, 200 );
		assert.deepEqual( json, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, googleClientId: '' } );
		assert.ok( ! text.includes( MAPS_KEY ) );

	} );

	test( 'a visit must be JSON from the site itself, with a token, before Turnstile is asked', async () => {

		const before = verifications.length;
		const body = JSON.stringify( { token: TOKEN } );
		const json = { 'Content-Type': 'application/json' };
		assert.equal( ( await call( server, '/api/visit', { method: 'POST', headers: json, body } ) ).status, 403, 'no Origin' );
		assert.equal( ( await call( server, '/api/visit', { method: 'POST', headers: { ...json, Origin: 'https://evil.example' }, body } ) ).status, 403, 'another site' );
		assert.equal( ( await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'text/plain' }, body } ) ).status, 415, 'a form or plain text' );
		assert.equal( ( await call( server, '/api/visit', { method: 'POST', headers: { ...json, Origin: server.base }, body: '{nope' } ) ).status, 400, 'bad JSON' );
		assert.equal( ( await call( server, '/api/visit', { method: 'POST', headers: { ...json, Origin: server.base }, body: '{}' } ) ).status, 400, 'no token' );
		assert.equal( ( await call( server, '/api/visit', { method: 'POST', headers: { ...json, Origin: server.base }, body: JSON.stringify( { token: 42 } ) } ) ).status, 400, 'token not text' );
		assert.equal( ( await visit( server, { token: 'x'.repeat( 2049 ) } ) ).status, 400, 'token too long' );
		const get = await call( server, '/api/visit' );
		assert.equal( get.status, 405 );
		assert.equal( get.headers.get( 'Allow' ), 'POST' );
		assert.equal( ( await call( server, '/api/visit', { method: 'POST', headers: { ...json, Origin: server.base, 'Sec-Fetch-Site': 'cross-site' }, body } ) ).status, 403, 'cross-site fetch' );
		assert.equal( verifications.length, before, 'Turnstile was asked about a request that was turned away first' );

	} );

	test( 'a visit that passes Turnstile gets the key, and Turnstile hears the token and the address', async () => {

		const { status, json, headers } = await visit( server, { ip: '203.0.113.7' } );
		assert.equal( status, 200 );
		const { visit: token, ...rest } = json;
		assert.deepEqual( rest, { mapsKey: MAPS_KEY, left: PER_VISITOR - 1 } );
		// The visit's token, for posting scores (see the leaderboard's tests).
		assert.match( token, /^v1\./ );
		assert.equal( headers.get( 'Cache-Control' ), 'no-store' );
		assert.deepEqual( verifications.at( - 1 ), { secret: PASS_SECRET, response: TOKEN, remoteip: '203.0.113.7' } );

	} );

	test( 'each visitor gets PER_VISITOR_DAILY visits a day', async () => {

		// 203.0.113.7 has had one already.
		assert.equal( ( await visit( server, { ip: '203.0.113.7' } ) ).json.left, 0 );
		const over = await visit( server, { ip: '203.0.113.7' } );
		assert.equal( over.status, 429 );
		assert.equal( over.json.reason, 'visitor' );
		assert.equal( over.json.error, 'You\'ve had today\'s free drives' );
		assert.equal( over.json.mapsKey, undefined );
		// Two hours to midnight UTC.
		assert.equal( over.json.retryAfter, 2 * 60 * 60 );
		assert.equal( over.headers.get( 'Retry-After' ), String( 2 * 60 * 60 ) );
		// Someone else still can.
		assert.equal( ( await visit( server, { ip: '203.0.113.8' } ) ).status, 200 );

	} );

	test( 'everyone together gets DAILY_VISITS visits a day, counted at once', async () => {

		// Three so far today; two more fit, and of five at once only those two get in.
		const results = await Promise.all( [ 1, 2, 3, 4, 5 ].map( i => visit( server, { ip: `192.0.2.${ i }` } ) ) );
		const statuses = results.map( r => r.status ).sort();
		assert.deepEqual( statuses, [ 200, 200, 429, 429, 429 ] );
		for ( const over of results.filter( r => r.status === 429 ) ) {

			assert.equal( over.json.reason, 'daily' );
			assert.equal( over.json.error, 'Today\'s free drives are used up' );
			assert.ok( ! over.text.includes( MAPS_KEY ) );

		}

		assert.equal( ( await visit( server, { ip: '192.0.2.200' } ) ).json.reason, 'daily', 'a new visitor got in over the daily cap' );

	} );

	test( 'the counts start again at midnight UTC', async () => {

		const next = await visit( server, { ip: '203.0.113.7', time: NEXT_DAY } );
		assert.equal( next.status, 200 );
		assert.equal( next.json.left, PER_VISITOR - 1 );
		assert.equal( ( await visit( server, { ip: '192.0.2.1', time: NEXT_DAY } ) ).status, 200 );

	} );

	test( 'visitors are stored as hashes, never their addresses', async () => {

		const files = listFiles( server.state );
		assert.ok( files.some( file => /\.sqlite$/.test( file ) ), `no Durable Object storage in ${ files.join( ', ' ) }` );
		for ( const file of files ) {

			const bytes = readFileSync( file ).toString( 'latin1' );
			for ( const ip of [ '203.0.113.7', '203.0.113.8', '192.0.2.1', '192.0.2.200', '198.51.100.1' ] ) assert.ok( ! bytes.includes( ip ), `${ ip } is in ${ file }` );

		}

	} );

	test( 'when Turnstile can\'t be asked, the visit is refused without counting', async () => {

		turnstileDown = true;
		try {

			const res = await visit( server, { ip: '198.51.100.50', time: NEXT_DAY } );
			assert.equal( res.status, 503 );
			assert.ok( ! res.text.includes( MAPS_KEY ) );

		} finally {

			turnstileDown = false;

		}

		// Its two visits are all still there.
		assert.equal( ( await visit( server, { ip: '198.51.100.50', time: NEXT_DAY } ) ).json.left, PER_VISITOR - 1 );

	} );

	test( 'search passes on only good queries', async () => {

		const before = searches.length;
		for ( const q of [ '', ' ', 'a', 'x'.repeat( 121 ), '<script>alert(1)</script>', 'pizza 🍕', 'a;b', 'a|b', '{"q":1}' ] ) {

			const res = await call( server, `/api/search?q=${ encodeURIComponent( q ) }` );
			assert.equal( res.status, 400, `"${ q }" was let through` );

		}

		assert.equal( ( await call( server, '/api/search' ) ).status, 400 );
		assert.equal( ( await call( server, '/api/search?q=Paris', { headers: { 'Sec-Fetch-Site': 'cross-site' } } ) ).status, 403, 'another site used the search' );
		assert.equal( ( await call( server, '/api/search?q=Paris', { method: 'POST' } ) ).status, 405 );
		assert.equal( searches.length, before, 'a bad query reached OpenStreetMap' );

	} );

	test( 'search answers with name, lat, lon and type only, named as World Drive', async () => {

		const res = await call( server, `/api/search?q=${ encodeURIComponent( 'Furka Pass' ) }`, { headers: { 'Sec-Fetch-Site': 'same-origin' } } );
		assert.equal( res.status, 200 );
		assert.deepEqual( res.json, { results: [ { name: 'Furkapass, Obergoms, Wallis, Switzerland', lat: 46.5725, lon: 8.4153, type: 'mountain_pass' } ] } );
		assert.equal( res.headers.get( 'X-Search-Cache' ), 'miss' );
		const sent = searches.at( - 1 );
		assert.equal( sent.userAgent, 'WorldDrive/1.0 (+https://worlddrive.app)' );
		assert.deepEqual( sent.params, { q: 'furka pass', format: 'jsonv2', limit: '6', 'accept-language': 'en' } );

	} );

	test( 'search keeps answers in the cache, by the tidied query', async () => {

		const before = searches.length;
		for ( const q of [ 'furka pass', '  FURKA   Pass ' ] ) {

			const res = await call( server, `/api/search?q=${ encodeURIComponent( q ) }` );
			assert.equal( res.status, 200 );
			assert.equal( res.headers.get( 'X-Search-Cache' ), 'hit', q );
			assert.equal( res.json.results[ 0 ].name, 'Furkapass, Obergoms, Wallis, Switzerland' );

		}

		assert.equal( searches.length, before, 'a cached search went to OpenStreetMap again' );

	} );

	test( 'search sends at most one request a second, and turns people away when the queue is long', async () => {

		const before = searches.length;
		const queries = [ 'Lyon', 'Oslo', 'Lima', 'Hanoi', 'Quito', 'Perth', 'Accra', 'Dakar' ];
		const results = await Promise.all( queries.map( q => call( server, `/api/search?q=${ q }` ) ) );
		const passed = results.filter( r => r.status === 200 );
		const busy = results.filter( r => r.status === 429 );
		assert.equal( passed.length + busy.length, queries.length, results.map( r => r.status ).join( ' ' ) );
		assert.ok( passed.length >= 3 && busy.length >= 1, `${ passed.length } passed, ${ busy.length } turned away` );
		for ( const res of busy ) assert.ok( res.json.retryAfter >= 1 && res.headers.get( 'Retry-After' ) );
		const times = searches.slice( before ).map( s => s.time ).sort( ( a, b ) => a - b );
		assert.equal( times.length, passed.length );
		for ( let i = 1; i < times.length; i ++ ) assert.ok( times[ i ] - times[ i - 1 ] >= 950, `searches ${ times[ i ] - times[ i - 1 ] } ms apart` );

	} );

	test( 'a failed search isn\'t cached', async () => {

		await new Promise( resolve => setTimeout( resolve, 1100 ) );
		searchDown = true;
		try {

			assert.equal( ( await call( server, '/api/search?q=Bern' ) ).status, 502 );

		} finally {

			searchDown = false;

		}

		await new Promise( resolve => setTimeout( resolve, 1100 ) );
		const again = await call( server, '/api/search?q=Bern' );
		assert.equal( again.status, 200 );
		assert.equal( again.headers.get( 'X-Search-Cache' ), 'miss' );

	} );

	test( 'other /api paths are 404s, and the site itself comes from the assets', async () => {

		assert.equal( ( await call( server, '/api/nope' ) ).status, 404 );
		const page = await call( server, '/' );
		assert.equal( page.status, 200 );
		assert.match( page.text, /test site/ );

	} );

} );

// --- the Worker with a failing Turnstile secret and no Maps key --------------------------

describe( 'World Drive Worker, Turnstile failing and maps off', () => {

	let server;

	before( async () => {

		server = await startWorker( {
			port: PORT + 1,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: '',
				TURNSTILE_SECRET: FAIL_SECRET,
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				SEARCH_UPSTREAM: `${ upstreamBase }/search`,
			},
		} );

	} );

	after( () => server?.stop() );

	test( 'config says maps are off, with the site key from wrangler.drive.jsonc', async () => {

		const { json } = await call( server, '/api/config' );
		assert.deepEqual( json, { turnstileSiteKey: '0x4AAAAAAFs3k5sgUIQHSuGC', mapsOn: false, googleClientId: '' } );

	} );

	test( 'a failed Turnstile check is a 403, with no key', async () => {

		const res = await visit( server, { ip: '198.51.100.9' } );
		assert.equal( res.status, 403 );
		assert.equal( res.json.error, 'The robot check didn\'t pass' );
		assert.equal( verifications.at( - 1 ).secret, FAIL_SECRET );

	} );

} );

// --- the leaderboard -------------------------------------------------------------------

// Friday 30 October 2026 at noon UTC, and either side of the next Monday's midnight.
const NOON = Date.UTC( 2026, 9, 30, 12, 0, 0 );
const SUNDAY_NIGHT = Date.UTC( 2026, 10, 1, 23, 59, 30 );
const MONDAY_MORNING = Date.UTC( 2026, 10, 2, 0, 0, 30 );
const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
const DAY = 24 * HOUR;
const NAMES_DAILY = 4;
const SCORES_DAILY = 6;

describe( 'World Drive leaderboard', () => {

	let server;
	// Each player has an address of their own, so the limits per visitor are only met where a test
	// means to meet them.
	const addresses = [];
	const nextIp = () => {

		const ip = `198.18.${ Math.floor( addresses.length / 200 ) }.${ addresses.length % 200 + 1 }`;
		addresses.push( ip );
		return ip;

	};

	before( async () => {

		server = await startWorker( {
			port: PORT + 2,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
				DAILY_VISITS: '1000',
				PER_VISITOR_DAILY: '100',
				NAMES_PER_VISITOR_DAILY: String( NAMES_DAILY ),
				SCORES_PER_VISITOR_DAILY: String( SCORES_DAILY ),
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				SEARCH_UPSTREAM: `${ upstreamBase }/search`,
				TEST_CLOCK: 'header',
			},
		} );

	} );

	after( () => server?.stop() );

	// A POST as the page makes it: JSON, from the site itself.
	const send = ( path, body, { ip = nextIp(), time = NOON, headers = {} } = {} ) => call( server, path, {
		method: 'POST',
		headers: { Origin: server.base, 'Content-Type': 'application/json', ...headers },
		body: typeof body === 'string' ? body : JSON.stringify( body ),
		ip,
		time,
	} );

	// A name asked for as the page asks, with a visit of its own (from `ip`, at `time`), or with
	// `visit`, a token from before.
	async function named( name, { ip = nextIp(), time = NOON, visit: token = null } = {} ) {

		if ( ! token ) {

			const visited = await visit( server, { ip, time } );
			assert.equal( visited.status, 200, visited.text );
			token = visited.json.visit;

		}

		return { ...await send( '/api/player', { name, visit: token }, { ip, time } ), visit: token };

	}

	// A new player with an address and a visit of their own: { id, secret, name, ip, visit, visitedAt }.
	async function player( name, { time = NOON } = {} ) {

		const ip = nextIp();
		const made = await named( name, { ip, time } );
		assert.equal( made.status, 201, `${ name }: ${ made.text }` );
		return { ...made.json, ip, visit: made.visit, visitedAt: time };

	}

	// A score from `who` as the page posts it, `after` ms into their visit (the run as long).
	function score( who, run = {}, { after = 60 * SECOND, visit = who.visit } = {} ) {

		const body = { id: who.id, secret: who.secret, score: 1000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, runSeconds: after / SECOND, visit, ...run };
		return send( '/api/score', body, { ip: who.ip, time: who.visitedAt + after } );

	}

	const board = ( query, time = NOON + HOUR ) => call( server, `/api/leaderboard?${ new URLSearchParams( query ) }`, { time } );
	const names = async ( query, time ) => ( await board( query, time ) ).json.rows.map( row => `${ row.name } ${ row.score }` );

	let speed;
	let ace;
	let cat;

	test( 'a visit that passes comes with a token for posting scores, good for six hours', async () => {

		const { json } = await visit( server, { ip: nextIp() } );
		const [ version, id, expires, signature, ...rest ] = json.visit.split( '.' );
		assert.deepEqual( rest, [] );
		assert.equal( version, 'v1' );
		assert.match( id, /^[\w-]{22}$/ );
		assert.equal( Number( expires ), ( EVENING + 6 * HOUR ) / SECOND );
		assert.match( signature, /^[\w-]{43}$/ );
		const other = await visit( server, { ip: nextIp() } );
		assert.notEqual( other.json.visit.split( '.' )[ 1 ], id, 'two visits with one id' );

	} );

	test( 'a nickname makes a player: an id, a secret given only this once, the name tidied', async () => {

		const res = await named( '  Speed   Demon ' );
		assert.equal( res.status, 201 );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		assert.deepEqual( Object.keys( res.json ).sort(), [ 'id', 'name', 'secret' ] );
		assert.equal( res.json.name, 'Speed Demon' );
		assert.match( res.json.id, /^[\w-]{16}$/ );
		assert.match( res.json.secret, /^[\w-]{32}$/ );
		speed = res.json;
		for ( const name of [ 'Zoë', 'José_99', '東京ドライバー', 'drop table', 'x-_-y' ] ) {

			const made = await named( name );
			assert.equal( made.status, 201, name );
			assert.equal( made.json.name, name );

		}

	} );

	test( 'names are 3 to 16 letters, numbers, spaces, _ or -', async () => {

		const bad = [ '', 'ab', '  a  ', 'x'.repeat( 17 ), 'a😀b', 'dot.name', '<b>hi</b>', '<img src=x onerror=alert(1)>', 'Robert\'); DROP TABLE players;--', '1 OR 1=1', '_-_', 'a\u0000bc', 'zero​width', 42, null, [ 'abc' ], { name: 'abc' } ];
		// Letters that show as nothing, after a name or as all of one; marks on nothing, or stacked up.
		bad.push( 'Speed Demon\uFE0F', 'Speed\u034FDemon', '\u3164\u3164\u3164', 'Ace\u115F', 'Ace\uDB40\uDD00', '\u0301Ace', 'Ace \u0301x', `Zalgo${ '\u0301\u0302\u0303\u0304' }` );
		for ( const name of bad ) {

			const res = await send( '/api/player', { name } );
			assert.equal( res.status, 400, JSON.stringify( name ) );
			assert.equal( res.json.error, 'Names are 3 to 16 letters, numbers, spaces, _ or -' );

		}

		assert.equal( ( await send( '/api/player', [ 'Speedy' ] ) ).status, 400, 'an array' );
		assert.equal( ( await send( '/api/player', '{nope' ) ).status, 400, 'not JSON' );
		assert.equal( ( await send( '/api/player', { name: 'x'.repeat( 2000 ) } ) ).status, 413, 'a huge body' );
		const json = { 'Content-Type': 'application/json' };
		const body = JSON.stringify( { name: 'Sneaky' } );
		assert.equal( ( await call( server, '/api/player', { method: 'POST', headers: json, body } ) ).status, 403, 'no Origin' );
		assert.equal( ( await call( server, '/api/player', { method: 'POST', headers: { ...json, Origin: 'https://evil.example' }, body } ) ).status, 403, 'another site' );
		assert.equal( ( await call( server, '/api/player', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'text/plain' }, body } ) ).status, 415, 'a form' );
		assert.equal( ( await call( server, '/api/player' ) ).status, 405 );

	} );

	test( 'a name needs a visit that passed Turnstile, and one visit makes one player', async () => {

		// No visit, or a forged or expired one: nothing made, and nothing counted against the address.
		const ip = nextIp();
		const { visit: token } = await named( 'Visitor One', { ip } );
		const [ , id, expires, signature ] = token.split( '.' );
		const forged = signature.slice( 0, 10 ) + ( signature[ 10 ] === 'A' ? 'B' : 'A' ) + signature.slice( 11 );
		const bad = {
			'no visit': undefined,
			'not a visit': 'hello',
			'a forged signature': `v1.${ id }.${ expires }.${ forged }`,
			'signed with another secret': await makeVisit( { TURNSTILE_SECRET: FAIL_SECRET }, NOON ),
			'one from seven hours ago': await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, NOON - 7 * HOUR ),
		};
		for ( let round = 0; round < 3; round ++ ) {

			for ( const [ what, visit ] of Object.entries( bad ) ) {

				const res = await send( '/api/player', { name: `Robot ${ round }`, visit }, { ip } );
				assert.equal( res.status, 403, what );
				assert.deepEqual( res.json, { error: 'Forbidden', reason: 'visit' }, what );

			}

		}

		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM players WHERE name LIKE \'Robot%\'' )[ 0 ].n, 0 );
		// The visit that made Visitor One makes no one else...
		const again = await named( 'Visitor Two', { ip, visit: token } );
		assert.equal( again.status, 403 );
		assert.equal( again.json.reason, 'visit' );
		// ...but a name that's taken doesn't use a visit up, and the address still has its turns.
		const fresh = await visit( server, { ip } );
		assert.equal( ( await named( 'Visitor One', { ip, visit: fresh.json.visit } ) ).status, 409 );
		assert.equal( ( await named( 'Visitor Two', { ip, visit: fresh.json.visit } ) ).status, 201 );
		assert.deepEqual( server.d1( `SELECT p.name FROM visits v JOIN players p ON p.id = v.player_id WHERE v.id IN ( '${ id }', '${ fresh.json.visit.split( '.' )[ 1 ] }' ) ORDER BY p.name` ).map( row => row.name ), [ 'Visitor One', 'Visitor Two' ] );

	} );

	test( 'slurs, obvious abuse and names passing for World Drive are refused', async () => {

		// The last few with Cyrillic or Greek letters, or a dotless ı, standing in for Latin ones.
		for ( const name of [ 'N1GGA', 'fuuuck you', 'Sh1t_Head', 'K Y S', 'Admin', 'the_admin', '4dm1n', 'W0rld Drive', 'worlddrive', 'WorldDriveTeam', 'Moderator', 'Staff', 'Fuсk you', 'Аdmin', 'ΑDΜΙΝ', 'shıt head' ] ) {

			const res = await send( '/api/player', { name } );
			assert.equal( res.status, 400, name );
			assert.equal( res.json.error, 'That name isn\'t allowed. Pick another' );

		}

		// Rude words inside words that aren't.
		for ( const name of [ 'Scunthorpe', 'Badminton Ace', 'Cassandra', 'Niger Delta', 'Grape Ape' ] ) assert.equal( ( await named( name ) ).status, 201, name );

	} );

	test( 'names are unique whatever their case, with spaces, _ and - alike', async () => {

		// And whatever its accents, or with letters that look the same: Cyrillic ones for S, p, e
		// and o; Greek ones for Z and o; I for l, rn for m.
		for ( const name of [ 'speed demon', 'SPEED_DEMON', 'Speed-Demon', ' speed  demon ', 'Speed__Demon', 'ZOË', 'Zoe', 'Ѕрееd Dеmоn', 'Speed Dernon', 'Ζοë', 'Jose 99', 'drop tabIe' ] ) {

			const res = await named( name );
			assert.equal( res.status, 409, name );
			assert.equal( res.json.error, 'That name is taken' );

		}

	} );

	test( 'a visitor makes at most NAMES_PER_VISITOR_DAILY names a day', async () => {

		const ip = nextIp();
		for ( let i = 0; i < NAMES_DAILY; i ++ ) assert.equal( ( await named( `Busy Bee ${ i }`, { ip } ) ).status, 201 );
		const over = await named( 'Busy Bee 9', { ip } );
		assert.equal( over.status, 429 );
		assert.equal( over.json.retryAfter, 12 * 60 * 60 );
		assert.equal( over.headers.get( 'Retry-After' ), String( 12 * 60 * 60 ) );
		// Someone else can, and so can they tomorrow.
		assert.equal( ( await named( 'Busy Bee 9' ) ).status, 201 );
		assert.equal( ( await named( 'Busy Bee 10', { ip, time: NOON + DAY } ) ).status, 201 );
		// An IPv6 visitor is their /64: the other addresses in it are the same visitor.
		const home = '2001:db8:4:2';
		for ( let i = 1; i <= NAMES_DAILY; i ++ ) assert.equal( ( await named( `Busy Bee ${ 10 + i }`, { ip: `${ home }::${ i }` } ) ).status, 201 );
		assert.equal( ( await named( 'Busy Bee 20', { ip: `${ home }:0:ffff:1:2` } ) ).status, 429 );
		assert.equal( ( await named( 'Busy Bee 20', { ip: '2001:db8:4:3::1' } ) ).status, 201 );

	} );

	test( 'renaming needs the secret, and a name nobody else has', async () => {

		const rename = body => send( '/api/player/rename', body );
		const wrong = await rename( { id: speed.id, secret: 'x'.repeat( 32 ), name: 'Speedier' } );
		assert.equal( wrong.status, 403 );
		assert.deepEqual( wrong.json, { error: 'Forbidden', reason: 'player' } );
		assert.equal( ( await rename( { id: 'A'.repeat( 16 ), secret: speed.secret, name: 'Speedier' } ) ).status, 403, 'nobody' );
		assert.equal( ( await rename( { id: speed.id, name: 'Speedier' } ) ).status, 400, 'no secret' );
		assert.equal( ( await rename( { id: `${ speed.id.slice( 2 ) }'--`, secret: speed.secret, name: 'Speedier' } ) ).status, 400, 'not an id' );
		assert.equal( ( await rename( { id: speed.id, secret: speed.secret, name: 'zoë' } ) ).status, 409, 'someone else\'s' );
		assert.equal( ( await rename( { id: speed.id, secret: speed.secret, name: 'Admin' } ) ).status, 400 );
		// Their own name in another case is still theirs.
		const own = await rename( { id: speed.id, secret: speed.secret, name: 'SPEED demon' } );
		assert.equal( own.status, 200 );
		assert.deepEqual( own.json, { id: speed.id, name: 'SPEED demon' } );
		assert.equal( ( await rename( { id: speed.id, secret: speed.secret, name: 'Speedy Gonzo' } ) ).json.name, 'Speedy Gonzo' );
		// And the old one is free again.
		assert.equal( ( await named( 'Speed Demon' ) ).status, 201 );

	} );

	test( 'a score with a visit token goes on today\'s, this week\'s and the all-time board', async () => {

		ace = await player( 'Ace' );
		// Each of the tricks as drive.js names them.
		const tricks = '1080 Spin! + Frontflip ×2 + Barrel roll! + Wall bounce ×2 + Big air 2.4 s';
		const res = await score( ace, { score: 12430, tricks, airTime: 2.4 } );
		assert.equal( res.status, 200, res.text );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		const first = { best: 12430, rank: 1, isNewBest: true };
		assert.deepEqual( res.json, { ...first, today: first, week: first } );
		for ( const period of [ 'today', 'week', 'all' ] ) {

			const { status, json } = await board( { period } );
			assert.equal( status, 200 );
			assert.deepEqual( json, { period, place: null, total: 1, rows: [ { rank: 1, name: 'Ace', score: 12430, tricks, place: 'Furka Pass', vehicle: 'go-kart', airTime: 2.4, date: '2026-10-30' } ] } );

		}

	} );

	test( 'only each player\'s best counts, one score every 10 s', async () => {

		const soon = await score( ace, { score: 20000 }, { after: 65 * SECOND } );
		assert.equal( soon.status, 429 );
		assert.equal( soon.json.retryAfter, 5 );
		assert.equal( soon.headers.get( 'Retry-After' ), '5' );
		const lower = await score( ace, { score: 900 }, { after: 71 * SECOND } );
		assert.equal( lower.status, 200 );
		const kept = { best: 12430, rank: 1, isNewBest: false };
		assert.deepEqual( lower.json, { ...kept, today: kept, week: kept } );
		const higher = await score( ace, { score: 20000 }, { after: 82 * SECOND } );
		assert.equal( higher.json.best, 20000 );
		assert.equal( higher.json.isNewBest, true );
		// Two at once: only one is taken.
		const both = await Promise.all( [ 1, 2 ].map( () => score( ace, { score: 21000 }, { after: 93 * SECOND } ) ) );
		assert.deepEqual( both.map( res => res.status ).sort(), [ 200, 429 ] );
		assert.deepEqual( await names( { period: 'all' } ), [ 'Ace 21000' ] );

	} );

	test( 'cheating: no token, or a forged, changed, expired or someone else\'s', async () => {

		const bob = await player( 'Bob' );
		const [ , id, expires, signature ] = bob.visit.split( '.' );
		const changed = signature.slice( 0, 10 ) + ( signature[ 10 ] === 'A' ? 'B' : 'A' ) + signature.slice( 11 );
		const tokens = {
			'no token': null,
			'not a token': 'hello',
			'a forged signature': `v1.${ id }.${ expires }.${ changed }`,
			'a later expiry': `v1.${ id }.${ Number( expires ) + 3600 }.${ signature }`,
			'another visit\'s id': `v1.${ 'A'.repeat( 22 ) }.${ expires }.${ signature }`,
			'signed with another secret': await makeVisit( { TURNSTILE_SECRET: FAIL_SECRET }, bob.visitedAt ),
			'one from seven hours ago': await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, bob.visitedAt - 7 * HOUR ),
		};
		for ( const [ what, token ] of Object.entries( tokens ) ) {

			const res = await score( bob, { score: 5000 }, { visit: token } );
			assert.equal( res.status, 403, what );
			assert.deepEqual( res.json, { error: 'Forbidden', reason: 'visit' }, what );

		}

		// Their own, six hours on.
		assert.equal( ( await score( bob, { score: 5000, runSeconds: 60 }, { after: 6 * HOUR + SECOND } ) ).status, 403 );

		// A visit posts for one player: the first to use it.
		const eve = await player( 'Eve' );
		assert.equal( ( await score( bob, { score: 5000 } ) ).status, 200 );
		const replayed = await score( eve, { score: 9000 }, { visit: bob.visit } );
		assert.equal( replayed.status, 403 );
		assert.equal( replayed.json.reason, 'visit' );

		// The wrong secret, or nobody's id.
		for ( const who of [ { ...eve, secret: bob.secret }, { ...eve, id: 'Z'.repeat( 16 ) } ] ) {

			const res = await score( who, { score: 9000 } );
			assert.equal( res.status, 403 );
			assert.equal( res.json.reason, 'player' );

		}

		assert.deepEqual( await names( { period: 'all' } ), [ 'Ace 21000', 'Bob 5000' ] );

	} );

	test( 'cheating: scores and runs the game can\'t make', async () => {

		cat = await player( 'Cat' );
		const runs = {
			'a negative score': { score: - 1000 },
			'no score': { score: 0 },
			'part of a point': { score: 1234.5 },
			'not whole tens': { score: 12345 },
			'a score in words': { score: '12340' },
			'a huge score': { score: 1e12 },
			'more than a second could give': { score: 200000, runSeconds: 1 },
			'a run longer than the visit': { runSeconds: 600 },
			'no time at all': { runSeconds: 0 },
			'time going backwards': { runSeconds: - 5 },
			'longer than a visit lasts': { runSeconds: 6 * 3600 + 1 },
			'more air than run': { airTime: 61 },
			'negative air': { airTime: - 1 },
			'a vehicle the game hasn\'t got': { vehicle: 'tank' },
			'a vehicle World Drive doesn\'t offer': { vehicle: 'semi-tractor-w900' },
			'a trick the game hasn\'t got': { tricks: 'Moon jump!' },
			'a message instead of tricks': { tricks: 'you all suck' },
			'three quarters of a spin': { tricks: '270 Spin!' },
			'six tricks in a jump': { tricks: Array( 6 ).fill( 'Backflip!' ).join( ' + ' ) },
			'no tricks': { tricks: '' },
			'tricks as a list': { tricks: [ 'Backflip!' ] },
			'a place with markup': { place: '<script>alert(1)</script>' },
			'a place too long': { place: 'x'.repeat( 61 ) },
			'a rude place': { place: 'Fuck Street' },
			'no place': { place: '' },
			'no id': { id: undefined },
			'no secret': { secret: '' },
		};
		for ( const [ what, run ] of Object.entries( runs ) ) {

			const res = await score( cat, run );
			assert.equal( res.status, 400, what );
			assert.deepEqual( res.json, { error: 'Bad request' }, what );

		}

		assert.equal( ( await score( cat, { tricks: 'Backflip! + '.repeat( 200 ) } ) ).status, 413, 'a huge body' );
		const body = JSON.stringify( { id: cat.id, secret: cat.secret, score: 1000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1, runSeconds: 60, visit: cat.visit } );
		assert.equal( ( await call( server, '/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, time: NOON + 60 * SECOND } ) ).status, 403, 'no Origin' );
		assert.equal( ( await call( server, '/api/score', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'text/plain' }, body, time: NOON + 60 * SECOND } ) ).status, 415, 'a form' );
		// None of that counted as a score: a good one goes straight in.
		assert.equal( ( await score( cat, { score: 3000 } ) ).status, 200 );

	} );

	test( 'names and places are stored as text, never run as SQL', async () => {

		const bobby = await player( 'Little Bobby' );
		const place = 'O\'Brien\'s (old) -- DROP TABLE players';
		const res = await score( bobby, { score: 4000, place } );
		assert.equal( res.status, 200, res.text );
		const here = await board( { period: 'all', place } );
		assert.deepEqual( here.json.rows.map( row => [ row.name, row.place ] ), [ [ 'Little Bobby', place ] ] );
		assert.equal( here.json.place, place );
		for ( const sneaky of [ '\' OR \'1\'=\'1', 'x\'; DELETE FROM players; --', 'Furka%', '%' ] ) assert.equal( ( await board( { period: 'all', place: sneaky } ) ).status, 400, sneaky );
		assert.deepEqual( await names( { period: 'all' } ), [ 'Ace 21000', 'Bob 5000', 'Little Bobby 4000', 'Cat 3000' ] );

	} );

	test( 'the top 20, how many are on the board, and your own place below them', async () => {

		const crowd = [];
		for ( let i = 1; i <= 20; i ++ ) crowd.push( await player( `Racer ${ i }` ) );
		await Promise.all( crowd.map( ( who, i ) => score( who, { score: 50000 - i * 1000 } ) ) );
		// The same score as the last of them, later: it comes after.
		const late = await player( 'Late Racer' );
		await score( late, { score: 31000 }, { after: 90 * SECOND } );

		const { json } = await board( { period: 'all', id: cat.id } );
		assert.equal( json.total, 25 );
		assert.deepEqual( json.rows.map( row => row.rank ), Array.from( { length: 20 }, ( v, i ) => i + 1 ) );
		assert.deepEqual( json.rows.map( row => row.name ), crowd.map( who => who.name ) );
		assert.deepEqual( json.me, { rank: 25, name: 'Cat', score: 3000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, date: '2026-10-30' } );
		assert.equal( ( await board( { period: 'all', id: late.id } ) ).json.me.rank, 21 );
		assert.equal( 'me' in ( await board( { period: 'all' } ) ).json, false );
		assert.equal( ( await board( { period: 'all', id: 'Q'.repeat( 16 ) } ) ).json.me, null );
		assert.equal( ( await board( { period: 'all', id: '1; DROP' } ) ).status, 400 );
		assert.equal( ( await board( { period: 'yesterday' } ) ).status, 400 );
		assert.equal( ( await call( server, '/api/leaderboard?period=all', { headers: { 'Sec-Fetch-Site': 'cross-site' } } ) ).status, 403, 'another site' );
		assert.equal( ( await call( server, '/api/leaderboard', { method: 'POST' } ) ).status, 405 );

	} );

	test( 'boards are cached for a moment, and a new best clears them', async () => {

		await board( { period: 'week' } );
		const again = await board( { period: 'week' } );
		assert.equal( again.headers.get( 'X-Board-Cache' ), 'hit' );
		assert.equal( again.headers.get( 'Cache-Control' ), 'no-store' );
		assert.equal( again.json.rows[ 0 ].name, 'Racer 1' );
		// A player's own row is kept a moment too: its rank is a count of the rows ahead.
		const before = await board( { period: 'week', id: cat.id } );
		assert.equal( before.headers.get( 'X-Player-Cache' ), 'miss' );
		const kept = await board( { period: 'week', id: cat.id } );
		assert.equal( kept.headers.get( 'X-Player-Cache' ), 'hit' );
		assert.deepEqual( kept.json.me, before.json.me );
		assert.equal( kept.json.me.rank, 25 );
		const best = await score( cat, { score: 60000 }, { after: 10 * 60 * SECOND } );
		assert.equal( best.json.week.rank, 1 );
		const fresh = await board( { period: 'week', id: cat.id } );
		assert.equal( fresh.headers.get( 'X-Board-Cache' ), 'miss' );
		assert.equal( fresh.headers.get( 'X-Player-Cache' ), 'miss' );
		assert.equal( fresh.json.rows[ 0 ].name, 'Cat' );
		assert.deepEqual( [ fresh.json.me.rank, fresh.json.me.score ], [ 1, 60000 ] );
		// With an id the board can come from the cache; anyone's own row is their own.
		const mine = await board( { period: 'week', id: ace.id } );
		assert.equal( mine.headers.get( 'X-Board-Cache' ), 'hit' );
		assert.equal( mine.headers.get( 'X-Player-Cache' ), 'miss' );
		assert.equal( mine.json.me.name, 'Ace' );
		// A rename shows straight away, in the rows and in their own.
		const rename = name => send( '/api/player/rename', { id: cat.id, secret: cat.secret, name } );
		assert.equal( ( await rename( 'Cat Renamed' ) ).status, 200 );
		const renamed = await board( { period: 'week', id: cat.id } );
		assert.equal( renamed.headers.get( 'X-Player-Cache' ), 'miss' );
		assert.deepEqual( [ renamed.json.rows[ 0 ].name, renamed.json.me.name ], [ 'Cat Renamed', 'Cat Renamed' ] );
		assert.equal( ( await rename( 'Cat' ) ).status, 200 );

	} );

	test( 'a board of one place has each player\'s best there', async () => {

		// Ace's best is at the Furka Pass; at the Golden Gate Bridge they did less.
		const there = await score( ace, { score: 7000, place: 'Golden Gate Bridge' }, { after: 20 * 60 * SECOND } );
		assert.equal( there.status, 200 );
		assert.equal( there.json.isNewBest, false );
		const bridge = await board( { period: 'all', place: 'golden gate bridge' } );
		assert.equal( bridge.status, 200 );
		assert.equal( bridge.json.total, 1 );
		assert.deepEqual( bridge.json.rows.map( row => [ row.name, row.score, row.place ] ), [ [ 'Ace', 7000, 'Golden Gate Bridge' ] ] );
		const furka = await board( { period: 'today', place: 'FURKA PASS', id: ace.id } );
		assert.ok( furka.json.rows.every( row => row.place === 'Furka Pass' ) );
		assert.equal( furka.json.me.score, 21000 );
		assert.equal( furka.json.me.place, 'Furka Pass' );
		// Everyone but Little Bobby, who was at O'Brien's.
		assert.equal( furka.json.total, 24 );

	} );

	test( 'a visitor posts at most SCORES_PER_VISITOR_DAILY scores a day', async () => {

		const fay = await player( 'Fay' );
		for ( let i = 1; i <= SCORES_DAILY; i ++ ) assert.equal( ( await score( fay, { score: i * 100 }, { after: i * 11 * SECOND } ) ).status, 200, `score ${ i }` );
		const over = await score( fay, { score: 9990 }, { after: ( SCORES_DAILY + 1 ) * 11 * SECOND } );
		assert.equal( over.status, 429 );
		assert.equal( over.json.error, 'That\'s all for today. Try again tomorrow' );
		assert.ok( over.json.retryAfter > 11 * 3600, over.text );

	} );

	test( 'days start at midnight UTC, and weeks on Monday', async () => {

		const gus = await player( 'Gus', { time: SUNDAY_NIGHT - 60 * SECOND } );
		const sunday = await score( gus, { score: 8000 } );
		assert.deepEqual( sunday.json.today, { best: 8000, rank: 1, isNewBest: true } );
		const monday = await score( gus, { score: 5000 }, { after: MONDAY_MORNING - gus.visitedAt } );
		assert.equal( monday.status, 200, monday.text );
		assert.equal( monday.json.best, 8000 );
		assert.equal( monday.json.isNewBest, false );
		assert.deepEqual( monday.json.today, { best: 5000, rank: 1, isNewBest: true } );
		assert.deepEqual( monday.json.week, { best: 5000, rank: 1, isNewBest: true } );

		assert.deepEqual( await names( { period: 'today' }, MONDAY_MORNING ), [ 'Gus 5000' ] );
		assert.deepEqual( await names( { period: 'week' }, MONDAY_MORNING ), [ 'Gus 5000' ] );
		assert.deepEqual( await names( { period: 'today' }, SUNDAY_NIGHT ), [ 'Gus 8000' ] );
		assert.deepEqual( await names( { period: 'today' }, SUNDAY_NIGHT - DAY ), [] );
		// Sunday's week started on the Monday before, with Friday's scores.
		const week = await board( { period: 'week', id: gus.id }, SUNDAY_NIGHT );
		assert.equal( week.json.rows[ 0 ].name, 'Cat' );
		assert.equal( week.json.me.score, 8000 );
		assert.equal( ( await board( { period: 'all', id: gus.id }, MONDAY_MORNING ) ).json.me.score, 8000 );

	} );

	test( 'the log and the day and week boards go after 35 days; the all-time board stays', async () => {

		const hal = await player( 'Hal', { time: NOON + 36 * DAY } );
		assert.equal( ( await score( hal, { score: 1000 } ) ).status, 200 );
		// Boards of one place nobody has looked at, so they aren't in the cache.
		for ( const period of [ 'today', 'week' ] ) assert.equal( ( await board( { period, place: 'Golden Gate Bridge' } ) ).json.total, 0, period );
		assert.equal( ( await board( { period: 'all', place: 'Golden Gate Bridge' } ) ).json.total, 1 );
		// The log keeps what's under 35 days old (Gus's Sunday and Monday scores and Hal's), and
		// only the visits that haven't run out.
		const log = server.d1( 'SELECT p.name, s.score FROM scores s JOIN players p ON p.id = s.player_id ORDER BY s.created_at' );
		assert.deepEqual( log.map( row => `${ row.name } ${ row.score }` ), [ 'Gus 8000', 'Gus 5000', 'Hal 1000' ] );
		assert.deepEqual( server.d1( 'SELECT player_id FROM visits' ).map( row => row.player_id ), [ hal.id ] );
		assert.deepEqual( server.d1( 'SELECT DISTINCT period FROM best_scores ORDER BY period' ).map( row => row.period ), [ 'all', 'day:2026-11-01', 'day:2026-11-02', `day:${ new Date( NOON + 36 * DAY ).toISOString().slice( 0, 10 ) }`, 'week:2026-10-26', 'week:2026-11-02', 'week:2026-11-30' ] );

	} );

	test( 'secrets are kept only as hashes, and addresses not at all', async () => {

		const [ row ] = server.d1( `SELECT secret_hash FROM players WHERE id = '${ ace.id }'` );
		assert.equal( row.secret_hash, createHash( 'sha256' ).update( ace.secret ).digest( 'hex' ) );
		const files = listFiles( server.state );
		assert.ok( files.some( file => /\.sqlite$/.test( file ) ) );
		for ( const file of files ) {

			const bytes = readFileSync( file ).toString( 'latin1' );
			for ( const secret of [ speed.secret, ace.secret, cat.secret ] ) assert.ok( ! bytes.includes( secret ), `a secret is in ${ file }` );
			for ( const ip of addresses ) assert.ok( ! bytes.includes( ip ), `${ ip } is in ${ file }` );

		}

	} );

	test( 'the owner\'s SQL in docs/world-drive.md renames, removes a cheat\'s scores and removes a player', async () => {

		// (Boards, and each player's own row on them, are kept half a minute, as the docs say: so the
		// changes are looked for where nobody has looked yet.)
		const mine = async ( who, place = '' ) => ( await board( { period: 'all', place, id: who.id } ) ).json.me;
		// An abusive name, renamed: the old one is free again, the new one taken.
		server.d1( `UPDATE players SET name = 'Driver 4821', name_key = 'driver-4821' WHERE id = '${ ace.id }'` );
		assert.equal( ( await mine( ace ) ).name, 'Driver 4821' );
		assert.equal( ( await named( 'driver_4821' ) ).status, 409 );
		assert.equal( ( await named( 'Ace' ) ).status, 201 );
		// A cheat's scores, off every board.
		assert.equal( ( await mine( cat ) ).score, 60000 );
		server.d1( `DELETE FROM best_scores WHERE player_id = '${ cat.id }'; DELETE FROM scores WHERE player_id = '${ cat.id }'` );
		assert.equal( await mine( cat, 'Furka Pass' ), null );
		// A player and everything of theirs.
		server.d1( `DELETE FROM players WHERE id = '${ ace.id }'` );
		assert.deepEqual( server.d1( `SELECT ( SELECT COUNT(*) FROM best_scores WHERE player_id = '${ ace.id }' ) AS bests, ( SELECT COUNT(*) FROM scores WHERE player_id = '${ ace.id }' ) AS logged` ), [ { bests: 0, logged: 0 } ] );
		const gone = await score( ace, { score: 1000 }, { after: 5 * HOUR } );
		assert.equal( gone.status, 403 );
		assert.equal( gone.json.reason, 'player' );

	} );

} );

// --- the Supporter Pass ------------------------------------------------------------------

// Made up, in Stripe's and Google's formats: nothing here is a real link, secret or account.
const PASS_LINK = 'https://buy.stripe.com/test_7sYmadeUp00000000000';
const PASS_LINK_ID = 'plink_1MadeUpSupporterLink0000';
const WEBHOOK_SECRET = 'whsec_made_up_for_world_drive_tests_0123';
// Tuesday 3 November 2026 at noon UTC: everything on the Supporter Pass's Worker happens then,
// sessions included, unless a test says otherwise.
const PASS_DAY = Date.UTC( 2026, 10, 3, 12, 0, 0 );

// A Checkout Session event as Stripe sends it (only the fields read are filled in).
function checkout( id, { type = 'checkout.session.completed', reference = null, email = 'alice@example.com', paid = true, link = PASS_LINK_ID } = {} ) {

	return {
		id: `evt_${ id }`,
		object: 'event',
		type,
		data: { object: {
			id: `cs_test_${ id }`,
			object: 'checkout.session',
			mode: 'payment',
			payment_status: paid ? 'paid' : 'unpaid',
			amount_total: 499,
			currency: 'cad',
			client_reference_id: reference,
			customer_details: { email },
			customer_email: null,
			payment_intent: `pi_${ id }`,
			payment_link: link,
		} },
	};

}

function refund( id, { full = true } = {} ) {

	return { id: `evt_refund_${ id }`, object: 'event', type: 'charge.refunded', data: { object: { id: `ch_${ id }`, object: 'charge', payment_intent: `pi_${ id }`, refunded: full, amount_refunded: full ? 499 : 100 } } };

}

// Stripe's servers POSTing to the webhook: no Origin, no cookie, signed (or `signature` as given).
function webhook( server, event, { secret = WEBHOOK_SECRET, signature, headers = {}, time = PASS_DAY } = {} ) {

	const body = typeof event === 'string' ? event : JSON.stringify( event );
	return call( server, '/api/stripe/webhook', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Stripe-Signature': signature ?? stripeSignature( body, secret ), ...headers },
		body,
		time,
	} );

}

describe( 'World Drive Supporter Pass', () => {

	let server;
	let keys;
	let googleKey;
	let otherKey;
	let alice;
	const addresses = [];
	const nextIp = () => {

		const ip = `198.19.${ Math.floor( addresses.length / 200 ) }.${ addresses.length % 200 + 1 }`;
		addresses.push( ip );
		return ip;

	};

	before( async () => {

		googleKey = await makeKey( 'drive-test-key-1' );
		// Not in the key set, with the same id: tokens signed with it are forgeries.
		otherKey = await makeKey( 'drive-test-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		server = await startWorker( {
			port: PORT + 3,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				SEARCH_UPSTREAM: `${ upstreamBase }/search`,
				TEST_CLOCK: 'header',
				DAILY_VISITS: '1000',
				GOOGLE_CLIENT_ID: CLIENT_ID,
				GOOGLE_JWKS_URL: keys.url,
				SUPPORTER_PAYMENT_LINK: PASS_LINK,
				STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
				SUPPORTER_EMAILS: ' Friend@Example.com, ',
				// PER_VISITOR_DAILY (8), PER_VISITOR_DAILY_SUPPORTER (30) and SUPPORTER_PRICE ("CA$4.99")
				// are wrangler.drive.jsonc's, and SUPPORTER_PAYMENT_LINK_ID isn't set: the account is
				// World Drive's own, so any paid checkout on it counts.
			},
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();

	} );

	// A request as the page makes it: JSON, from the site itself, with this browser's cookie.
	const send = ( method, path, body, { cookie, ip = nextIp(), time = PASS_DAY, headers = {} } = {} ) => call( server, path, {
		method,
		headers: { Origin: server.base, 'Content-Type': 'application/json', ...( cookie ? { Cookie: cookie } : {} ), ...headers },
		body: body === undefined ? undefined : JSON.stringify( body ),
		ip,
		time,
	} );
	const me = ( cookie, time = PASS_DAY ) => call( server, '/api/me', { headers: cookie ? { Cookie: cookie } : {}, time } );

	// Signs in with an ID token for `claims` (or `credential` as given): the answer, and the cookie
	// to send back.
	async function signIn( claims = {}, { credential, key = googleKey, cookie } = {} ) {

		const res = await send( 'POST', '/api/session', { credential: credential ?? await makeToken( key, claims ) }, { cookie } );
		const token = /^__Host-wd_session=([\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) ?? '' )?.[ 1 ];
		return { ...res, token, cookie: token ? `__Host-wd_session=${ token }` : null };

	}

	// A leaderboard player with a visit of its own, and a run of `score` on the board at Furka Pass.
	async function player( name, score ) {

		const ip = nextIp();
		const visited = await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN } ), ip, time: PASS_DAY } );
		assert.equal( visited.status, 200, visited.text );
		const made = await send( 'POST', '/api/player', { name, visit: visited.json.visit }, { ip } );
		assert.equal( made.status, 201, made.text );
		const run = { id: made.json.id, secret: made.json.secret, score, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, runSeconds: 60, visit: visited.json.visit };
		const posted = await send( 'POST', '/api/score', run, { ip, time: PASS_DAY + 60 * SECOND } );
		assert.equal( posted.status, 200, posted.text );
		return made.json;

	}

	const board = ( query, time = PASS_DAY + HOUR ) => call( server, `/api/leaderboard?${ new URLSearchParams( query ) }`, { time } );

	test( 'signed out, /api/me says so, and how to buy', async () => {

		const res = await me();
		assert.equal( res.status, 200 );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		assert.deepEqual( res.json, { signedIn: false, supporter: false, purchase: { enabled: true, link: PASS_LINK, price: 'CA$4.99' } } );
		assert.equal( ( await call( server, '/api/config' ) ).json.googleClientId, CLIENT_ID );

	} );

	test( 'signing in: a session cookie, HttpOnly and SameSite=Lax, and /api/me signed in', async () => {

		alice = await signIn();
		assert.equal( alice.status, 200, alice.text );
		// wrangler dev hands the Worker every request as one to https://worlddrive.app (the route in
		// wrangler.drive.jsonc), so the cookie is as it is there: Secure, and __Host- (this exact host,
		// the whole site, never from http or another site).
		assert.equal( alice.headers.get( 'Set-Cookie' ), `__Host-wd_session=${ alice.token }; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure` );
		const [ account ] = server.d1( 'SELECT id, google_sub, email, name FROM accounts WHERE google_sub = \'1001\'' );
		assert.deepEqual( alice.json, { signedIn: true, name: 'Alice Example', email: 'alice@example.com', supporter: false, purchase: { enabled: true, link: PASS_LINK, price: 'CA$4.99', clientReferenceId: String( account.id ) } } );
		alice.id = account.id;
		assert.deepEqual( ( await me( alice.cookie ) ).json, alice.json );
		// Only the token's SHA-256 is kept.
		const [ session ] = server.d1( `SELECT token_hash, account_id, expires_at - created_at AS lasts FROM sessions WHERE account_id = ${ account.id }` );
		assert.deepEqual( session, { token_hash: createHash( 'sha256' ).update( alice.token ).digest( 'hex' ), account_id: account.id, lasts: 30 * DAY } );

	} );

	test( 'sign-in turns away a token for another site, expired, forged or not one at all', async () => {

		const now = Math.floor( Date.now() / 1000 );
		const bad = {
			'wrong audience': await makeToken( googleKey, { aud: 'someone-else.apps.googleusercontent.com' } ),
			'expired': await makeToken( googleKey, { iat: now - 7200, exp: now - 3600 } ),
			'forged signature': await makeToken( otherKey ),
			'not from Google': await makeToken( googleKey, { iss: 'https://accounts.example.com' } ),
			'unverified email': await makeToken( googleKey, { email_verified: false } ),
			'changed after signing': ( await makeToken( googleKey ) ).replace( /\.([^.]+)\./, ( m, claims ) => `.${ Buffer.from( JSON.stringify( { ...JSON.parse( Buffer.from( claims, 'base64url' ) ), sub: '1002' } ) ).toString( 'base64url' ) }.` ),
			'not a token': 'nope',
		};
		for ( const [ why, credential ] of Object.entries( bad ) ) {

			const res = await signIn( {}, { credential } );
			assert.equal( res.status, 401, why );
			assert.deepEqual( res.json, { error: 'Sign-in failed' }, why );
			assert.equal( res.headers.get( 'Set-Cookie' ), null, why );

		}

		assert.equal( ( await send( 'POST', '/api/session', [] ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/session', {} ) ).status, 401 );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM accounts' )[ 0 ].n, 1, 'an account was made from a bad token' );

	} );

	test( 'a visitor signs in at most 50 times a day; a bad token isn\'t counted', async () => {

		const ip = nextIp();
		const credential = await makeToken( googleKey, { sub: '1009', email: 'busy@example.com', name: 'Busy' } );
		const forged = await makeToken( otherKey, { sub: '1009', email: 'busy@example.com' } );
		assert.equal( ( await send( 'POST', '/api/session', { credential: forged }, { ip } ) ).status, 401 );
		for ( let i = 1; i <= 50; i ++ ) assert.equal( ( await send( 'POST', '/api/session', { credential }, { ip } ) ).status, 200, `sign-in ${ i }` );
		const over = await send( 'POST', '/api/session', { credential }, { ip } );
		assert.equal( over.status, 429 );
		assert.equal( over.headers.get( 'Set-Cookie' ), null );
		assert.ok( over.json.retryAfter > 0 );
		// From somewhere else, and the next day, it's fine.
		assert.equal( ( await send( 'POST', '/api/session', { credential } ) ).status, 200 );
		assert.equal( ( await send( 'POST', '/api/session', { credential }, { ip, time: PASS_DAY + DAY } ) ).status, 200 );

	} );

	test( 'a session lasts 30 days, and signing out ends it', async () => {

		assert.equal( ( await me( alice.cookie, PASS_DAY + 29 * DAY ) ).json.signedIn, true );
		assert.equal( ( await me( alice.cookie, PASS_DAY + 31 * DAY ) ).json.signedIn, false );
		// A cookie that isn't one of ours, or isn't the shape they're made in, is nobody.
		assert.equal( ( await me( `__Host-wd_session=${ 'x'.repeat( 43 ) }` ) ).json.signedIn, false );
		assert.equal( ( await me( `__Host-wd_session=${ alice.token }x` ) ).json.signedIn, false );
		assert.equal( ( await me( `wd_session=${ alice.token }` ) ).json.signedIn, false );
		assert.equal( ( await me( `__Host-twin_session=${ alice.token }` ) ).json.signedIn, false );
		assert.equal( ( await me( `theme=dark; __Host-wd_session=${ alice.token }` ) ).json.signedIn, true );

		const other = await signIn();
		const out = await send( 'DELETE', '/api/session', undefined, { cookie: other.cookie } );
		assert.equal( out.status, 204 );
		assert.equal( out.headers.get( 'Set-Cookie' ), '__Host-wd_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure' );
		assert.equal( ( await me( other.cookie ) ).json.signedIn, false );
		// Only that browser's: Alice's first session goes on.
		assert.equal( ( await me( alice.cookie ) ).json.signedIn, true );
		const get = await call( server, '/api/session' );
		assert.equal( get.status, 405 );
		assert.equal( get.headers.get( 'Allow' ), 'POST, DELETE' );

	} );

	test( 'only Stripe\'s webhook goes without the same-origin and JSON checks', async () => {

		const changes = [ [ 'POST', '/api/visit' ], [ 'POST', '/api/player' ], [ 'POST', '/api/player/rename' ], [ 'POST', '/api/player/link' ], [ 'POST', '/api/score' ], [ 'POST', '/api/session' ], [ 'DELETE', '/api/session' ] ];
		for ( const [ method, path ] of changes ) {

			const body = JSON.stringify( { credential: 'x', token: TOKEN } );
			const headers = { Cookie: alice.cookie };
			assert.equal( ( await call( server, path, { method, body, headers: { ...headers, 'Content-Type': 'application/json' } } ) ).status, 403, `${ method } ${ path } with no Origin` );
			assert.equal( ( await call( server, path, { method, body, headers: { ...headers, 'Content-Type': 'application/json', Origin: 'https://evil.example' } } ) ).status, 403, `${ method } ${ path } from another site` );
			assert.equal( ( await call( server, path, { method, body, headers: { ...headers, 'Content-Type': 'text/plain', Origin: server.base } } ) ).status, 415, `${ method } ${ path } as a form` );
			assert.equal( ( await call( server, path, { method, body, headers: { ...headers, 'Content-Type': 'application/json', Origin: server.base, 'Sec-Fetch-Site': 'cross-site' } } ) ).status, 403, `${ method } ${ path } cross-site` );

		}

		assert.equal( ( await me( alice.cookie ) ).json.signedIn, true, 'a cross-site request signed Alice out' );
		// The webhook, signed, with no Origin (and even marked cross-site): taken.
		assert.equal( ( await webhook( server, { id: 'evt_hello', type: 'customer.created', data: { object: {} } } ) ).status, 200 );
		assert.equal( ( await webhook( server, { id: 'evt_hello', type: 'customer.created', data: { object: {} } }, { headers: { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'text/plain' } } ) ).status, 200 );

	} );

	test( 'the webhook takes only what Stripe signed, in the last five minutes', async () => {

		const event = JSON.stringify( checkout( 'forged', { reference: String( alice.id ) } ) );
		const now = Math.floor( Date.now() / 1000 );
		const bad = {
			'no signature': '',
			'wrong secret': stripeSignature( event, 'whsec_someone_elses_secret' ),
			'stale': stripeSignature( event, WEBHOOK_SECRET, now - 360 ),
			'from the future': stripeSignature( event, WEBHOOK_SECRET, now + 360 ),
			'not hex': `t=${ now },v1=${ 'z'.repeat( 64 ) }`,
			'no time': stripeSignature( event, WEBHOOK_SECRET ).split( ',' )[ 1 ],
		};
		for ( const [ why, signature ] of Object.entries( bad ) ) {

			const res = await webhook( server, event, { signature } );
			assert.equal( res.status, 400, why );
			assert.deepEqual( res.json, { error: 'Bad request' }, why );

		}

		// Signed, then changed.
		assert.equal( ( await webhook( server, event.replace( 'alice@', 'mallory@' ), { signature: stripeSignature( event, WEBHOOK_SECRET ) } ) ).status, 400 );
		// While a secret is being rolled there are two v1s: either may match.
		const hello = '{"id":"evt_rolled","type":"customer.created"}';
		const ours = stripeSignature( hello, WEBHOOK_SECRET, now ).split( 'v1=' )[ 1 ];
		const theirs = stripeSignature( hello, 'whsec_the_old_one', now ).split( 'v1=' )[ 1 ];
		assert.equal( ( await webhook( server, hello, { signature: `t=${ now },v1=${ theirs },v1=${ ours }` } ) ).status, 200 );
		assert.equal( ( await webhook( server, hello, { signature: `t=${ now },v1=${ ours },v1=${ theirs }` } ) ).status, 200 );
		// Signed but not an event.
		assert.equal( ( await webhook( server, '{nope' ) ).status, 400 );
		assert.equal( ( await webhook( server, '[1,2]' ) ).status, 400 );
		// Too big to be one of Stripe's.
		const huge = JSON.stringify( { id: 'evt_big', type: 'customer.created', padding: 'x'.repeat( 300 * 1024 ) } );
		assert.equal( ( await webhook( server, huge ) ).status, 413 );
		assert.equal( ( await me( alice.cookie ) ).json.supporter, false );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM purchases' )[ 0 ].n, 0 );

	} );

	test( 'a paid checkout gives the account named on the link the pass, once', async () => {

		const event = checkout( 'alice', { reference: String( alice.id ) } );
		const res = await webhook( server, event );
		assert.equal( res.status, 200 );
		assert.deepEqual( res.json, { received: true } );
		assert.equal( ( await me( alice.cookie ) ).json.supporter, true );
		// The same event again (Stripe retries until it hears 200), and the same session once more.
		assert.equal( ( await webhook( server, event ) ).status, 200 );
		assert.equal( ( await webhook( server, { ...event, id: 'evt_alice_again', type: 'checkout.session.async_payment_succeeded' } ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT checkout_session, account_id, email, amount, currency, payment_intent, status, created_at, refunded_at FROM purchases' ), [
			{ checkout_session: 'cs_test_alice', account_id: alice.id, email: 'alice@example.com', amount: 499, currency: 'cad', payment_intent: 'pi_alice', status: 'paid', created_at: PASS_DAY, refunded_at: null },
		] );

	} );

	test( 'paying by bank debit: nothing until the money arrives, then the pass', async () => {

		const carol = await signIn( { sub: '1003', email: 'carol@example.com', name: 'Carol' } );
		const reference = carol.json.purchase.clientReferenceId;
		assert.equal( ( await webhook( server, checkout( 'carol', { reference, email: 'carol@example.com', paid: false } ) ) ).status, 200 );
		assert.equal( ( await me( carol.cookie ) ).json.supporter, false );
		assert.equal( ( await webhook( server, checkout( 'carol', { reference, email: 'carol@example.com', type: 'checkout.session.async_payment_succeeded' } ) ) ).status, 200 );
		assert.equal( ( await me( carol.cookie ) ).json.supporter, true );

	} );

	test( 'bought before signing in: whoever then signs in with the email paid with has it', async () => {

		// No account named (the bare link), and one that doesn't exist: both are the email's.
		assert.equal( ( await webhook( server, checkout( 'bob', { email: 'Bob@Example.com ' } ) ) ).status, 200 );
		assert.equal( ( await webhook( server, checkout( 'dan', { reference: '987654', email: 'dan@example.com' } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT checkout_session, account_id, email FROM purchases WHERE checkout_session IN ( \'cs_test_bob\', \'cs_test_dan\' ) ORDER BY 1' ), [
			{ checkout_session: 'cs_test_bob', account_id: null, email: 'bob@example.com' },
			{ checkout_session: 'cs_test_dan', account_id: null, email: 'dan@example.com' },
		] );
		const bob = await signIn( { sub: '1004', email: 'BOB@example.com', name: 'Bob' } );
		assert.equal( bob.json.supporter, true );
		assert.equal( ( await signIn( { sub: '1005', email: 'eve@example.com', name: 'Eve' } ) ).json.supporter, false );

	} );

	test( 'a full refund takes the pass away again; a partial one doesn\'t', async () => {

		const carol = await signIn( { sub: '1003', email: 'carol@example.com', name: 'Carol' } );
		assert.equal( ( await webhook( server, refund( 'carol', { full: false } ) ) ).status, 200 );
		assert.equal( ( await me( carol.cookie ) ).json.supporter, true );
		assert.equal( ( await webhook( server, refund( 'carol' ) ) ).status, 200 );
		assert.equal( ( await me( carol.cookie ) ).json.supporter, false );
		const [ row ] = server.d1( 'SELECT status, refunded_at FROM purchases WHERE checkout_session = \'cs_test_carol\'' );
		assert.deepEqual( row, { status: 'refunded', refunded_at: PASS_DAY } );
		// A refund of something else changes nothing.
		assert.equal( ( await webhook( server, refund( 'unknown' ) ) ).status, 200 );
		assert.equal( ( await me( alice.cookie ) ).json.supporter, true );

	} );

	test( 'SUPPORTER_EMAILS have the pass without paying, whatever the case', async () => {

		const friend = await signIn( { sub: '1006', email: 'friend@example.com', name: 'A Friend' } );
		assert.equal( friend.json.supporter, true );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM purchases WHERE email = \'friend@example.com\'' )[ 0 ].n, 0 );

	} );

	test( 'a supporter gets 30 drives a day, counted by their account; anyone else 8, by their address', async () => {

		const ip = nextIp();
		const drive = ( cookie, time = PASS_DAY ) => call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json', ...( cookie ? { Cookie: cookie } : {} ) }, body: JSON.stringify( { token: TOKEN } ), ip, time } );
		// Alice has the pass: 30, all from one address.
		for ( let i = 1; i <= 30; i ++ ) {

			const res = await drive( alice.cookie );
			assert.equal( res.status, 200, `drive ${ i }: ${ res.text }` );
			assert.equal( res.json.left, 30 - i );

		}

		const over = await drive( alice.cookie );
		assert.equal( over.status, 429 );
		assert.equal( over.json.reason, 'visitor' );
		// The address's own 8 are all still there, for anyone not signed in; and for someone signed
		// in without the pass (Carol, refunded), it's the address that counts.
		const carol = await signIn( { sub: '1003', email: 'carol@example.com', name: 'Carol' } );
		assert.equal( ( await drive() ).json.left, 7 );
		for ( let i = 6; i >= 0; i -- ) assert.equal( ( await drive( carol.cookie ) ).json.left, i );
		assert.equal( ( await drive( carol.cookie ) ).status, 429 );
		assert.equal( ( await drive() ).status, 429 );
		// The next day, Alice's 30 again.
		assert.equal( ( await drive( alice.cookie, PASS_DAY + DAY ) ).json.left, 29 );
		// Counted as a hash, like an address: the account's id isn't stored either.
		assert.ok( ! listFiles( server.state ).some( file => readFileSync( file ).toString( 'latin1' ).includes( `account:${ alice.id }` ) ) );

	} );

	test( 'linking a leaderboard player puts a ⭐ by its name for a supporter, and only then', async () => {

		const starred = await player( 'Star Driver', 9000 );
		const plain = await player( 'Plain Driver', 8000 );
		const eve = await player( 'Eve Drives', 7000 );
		// Signed out, the wrong secret, a player that doesn't exist: refused.
		assert.equal( ( await send( 'POST', '/api/player/link', { id: starred.id, secret: starred.secret } ) ).status, 401 );
		assert.equal( ( await send( 'POST', '/api/player/link', { id: starred.id, secret: 'W'.repeat( 32 ) }, { cookie: alice.cookie } ) ).status, 403 );
		assert.equal( ( await send( 'POST', '/api/player/link', { id: 'Q'.repeat( 16 ), secret: starred.secret }, { cookie: alice.cookie } ) ).status, 403 );
		assert.equal( ( await send( 'POST', '/api/player/link', { id: starred.id }, { cookie: alice.cookie } ) ).status, 400 );

		// The board, before: kept for half a minute, and linking clears it.
		assert.ok( ( await board( { period: 'all' } ) ).json.rows.every( row => ! ( 'supporter' in row ) ) );
		const linked = await send( 'POST', '/api/player/link', { id: starred.id, secret: starred.secret }, { cookie: alice.cookie } );
		assert.equal( linked.status, 200 );
		assert.deepEqual( linked.json, { id: starred.id, name: 'Star Driver' } );
		const eveAccount = await signIn( { sub: '1005', email: 'eve@example.com', name: 'Eve' } );
		assert.equal( ( await send( 'POST', '/api/player/link', { id: eve.id, secret: eve.secret }, { cookie: eveAccount.cookie } ) ).status, 200 );

		const { json } = await board( { period: 'all', id: starred.id } );
		const shown = Object.fromEntries( json.rows.map( row => [ row.name, row.supporter ?? false ] ) );
		assert.deepEqual( shown, { 'Star Driver': true, 'Plain Driver': false, 'Eve Drives': false } );
		assert.deepEqual( json.rows[ 0 ], { rank: 1, name: 'Star Driver', score: 9000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, date: '2026-11-03', supporter: true } );
		assert.equal( json.me.supporter, true );
		// The board of one place, too.
		assert.equal( ( await board( { period: 'all', place: 'Furka Pass' } ) ).json.rows.find( row => row.name === 'Star Driver' ).supporter, true );
		// A friend in SUPPORTER_EMAILS stars as well.
		const friend = await signIn( { sub: '1006', email: 'friend@example.com', name: 'A Friend' } );
		assert.equal( ( await send( 'POST', '/api/player/link', { id: plain.id, secret: plain.secret }, { cookie: friend.cookie } ) ).status, 200 );
		assert.equal( ( await board( { period: 'today' } ) ).json.rows.find( row => row.name === 'Plain Driver' ).supporter, true );

		// A refund takes it away: on a board made after it.
		assert.equal( ( await webhook( server, refund( 'alice' ) ) ).status, 200 );
		assert.equal( ( await board( { period: 'week' } ) ).json.rows.find( row => row.name === 'Star Driver' ).supporter, undefined );

	} );

	test( 'the purchases kept are only what Stripe sent', async () => {

		const sessions = server.d1( 'SELECT checkout_session FROM purchases ORDER BY 1' ).map( row => row.checkout_session );
		assert.deepEqual( sessions, [ 'cs_test_alice', 'cs_test_bob', 'cs_test_carol', 'cs_test_dan' ] );

	} );

	test( 'the owner\'s SQL in docs/world-drive.md grants and takes away a pass by hand', async () => {

		const eve = await signIn( { sub: '1005', email: 'eve@example.com', name: 'Eve' } );
		assert.equal( eve.json.supporter, false );
		// As written there: someone looked up, given the pass, and then not.
		const lookUp = () => server.d1( `SELECT a.id, a.email, a.name, p.checkout_session, p.status, p.refunded_at FROM accounts a
			LEFT JOIN purchases p ON p.account_id = a.id OR ( p.account_id IS NULL AND p.email = a.email ) WHERE a.email LIKE '%eve@%'` );
		assert.deepEqual( lookUp().map( row => [ row.email, row.checkout_session ] ), [ [ 'eve@example.com', null ] ] );
		server.d1( 'INSERT INTO purchases ( checkout_session, email, status, created_at ) VALUES ( \'granted-eve\', \'eve@example.com\', \'granted\', strftime( \'%s\', \'now\' ) * 1000 )' );
		assert.equal( ( await me( eve.cookie ) ).json.supporter, true );
		assert.deepEqual( lookUp().map( row => [ row.checkout_session, row.status, row.refunded_at ] ), [ [ 'granted-eve', 'granted', null ] ] );
		server.d1( 'UPDATE purchases SET status = \'refunded\', refunded_at = strftime( \'%s\', \'now\' ) * 1000 WHERE checkout_session = \'granted-eve\'' );
		assert.equal( ( await me( eve.cookie ) ).json.supporter, false );
		assert.equal( lookUp()[ 0 ].status, 'refunded' );
		assert.ok( lookUp()[ 0 ].refunded_at > Date.UTC( 2026, 0, 1 ) );

	} );

} );

// The webhook keeps payments whether or not buying is on, and with SUPPORTER_PAYMENT_LINK_ID set
// takes only that link's.
describe( 'World Drive Supporter Pass, with a link id and no sign-in', () => {

	let server;

	before( async () => {

		server = await startWorker( {
			port: PORT + 4,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
				SUPPORTER_PAYMENT_LINK_ID: PASS_LINK_ID,
			},
		} );

	} );

	after( () => server?.stop() );

	test( 'without GOOGLE_CLIENT_ID there\'s no signing in, and no buying', async () => {

		assert.deepEqual( ( await call( server, '/api/me' ) ).json, { signedIn: false, supporter: false, purchase: { enabled: false } } );
		assert.equal( ( await call( server, '/api/config' ) ).json.googleClientId, '' );
		const res = await call( server, '/api/session', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: '{"credential":"x"}' } );
		assert.equal( res.status, 503 );
		assert.equal( res.headers.get( 'Set-Cookie' ), null );

	} );

	test( 'only checkouts through SUPPORTER_PAYMENT_LINK_ID count', async () => {

		assert.equal( ( await webhook( server, checkout( 'elsewhere', { link: 'plink_1SomeOtherLink' } ) ) ).status, 200 );
		assert.equal( ( await webhook( server, checkout( 'nolink', { link: null } ) ) ).status, 200 );
		assert.equal( ( await webhook( server, checkout( 'ours' ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT checkout_session FROM purchases' ).map( row => row.checkout_session ), [ 'cs_test_ours' ] );

	} );

} );

describe( 'The Supporter Pass\'s settings', () => {

	const full = { GOOGLE_CLIENT_ID: CLIENT_ID, SUPPORTER_PAYMENT_LINK: PASS_LINK, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SUPPORTER_PRICE: ' CA$4.99 ' };

	test( 'buying is on only with the client id, an https link and a whsec_ secret (and a plink_ id, if any)', () => {

		assert.deepEqual( purchaseSettings( full ), { link: PASS_LINK, price: 'CA$4.99' } );
		assert.deepEqual( purchaseSettings( { ...full, SUPPORTER_PAYMENT_LINK_ID: PASS_LINK_ID } ), { link: PASS_LINK, price: 'CA$4.99' } );
		const off = {
			'no client id': { GOOGLE_CLIENT_ID: ' ' },
			'no link': { SUPPORTER_PAYMENT_LINK: '' },
			'a link that isn\'t https': { SUPPORTER_PAYMENT_LINK: 'http://buy.stripe.com/test_x' },
			'not a link': { SUPPORTER_PAYMENT_LINK: 'buy.stripe.com' },
			'no secret': { STRIPE_WEBHOOK_SECRET: undefined },
			'an API key for the secret': { STRIPE_WEBHOOK_SECRET: 'sk_live_made_up' },
			'a link id that isn\'t one': { SUPPORTER_PAYMENT_LINK_ID: 'https://buy.stripe.com/x' },
		};
		for ( const [ why, change ] of Object.entries( off ) ) assert.equal( purchaseSettings( { ...full, ...change } ), null, why );
		assert.deepEqual( purchaseFor( { ...full, STRIPE_WEBHOOK_SECRET: '' }, { id: 7 } ), { enabled: false } );
		assert.deepEqual( purchaseFor( full, { id: 7 } ), { enabled: true, link: PASS_LINK, price: 'CA$4.99', clientReferenceId: '7' } );

	} );

	test( 'the session cookie is Secure, __Host- and the whole site\'s on https', () => {

		const cookies = sessionCookies( 'wd_session' );
		const token = 'T'.repeat( 43 );
		const site = new URL( 'https://worlddrive.app/api/session' );
		assert.equal( cookies.write( site, token, 60 ), `__Host-wd_session=${ token }; Max-Age=60; Path=/; HttpOnly; SameSite=Lax; Secure` );
		const ask = cookie => cookies.read( new Request( site, { headers: { Cookie: cookie } } ), site );
		assert.equal( ask( `__Host-wd_session=${ token }` ), token );
		// Without the prefix it could have been set by another site on a sub-domain, or over http.
		assert.equal( ask( `wd_session=${ token }` ), null );
		assert.equal( ask( `__Host-twin_session=${ token }` ), null );
		assert.equal( ask( `__Host-wd_session=${ token }x` ), null );
		// Plain http only on this machine, for local development.
		assert.equal( cookies.write( new URL( 'http://127.0.0.1:8790/' ), token, 60 ), `wd_session=${ token }; Max-Age=60; Path=/; HttpOnly; SameSite=Lax` );
		assert.equal( cookies.write( new URL( 'http://worlddrive.app/' ), token, 60 ), `__Host-wd_session=${ token }; Max-Age=60; Path=/; HttpOnly; SameSite=Lax; Secure` );

	} );

} );

// --- the Worker called here ------------------------------------------------------------

// wrangler dev always addresses requests to itself, so www.worlddrive.app is checked by calling the
// Worker here, with 'cloudflare:workers' (only there inside Cloudflare's runtime) stood in for. So
// are other names for the key, which would each need a wrangler dev of their own.
let imported = null;
function loadWorker() {

	imported ??= ( async () => {

		const stub = 'export class DurableObject { constructor( ctx, env ) { this.ctx = ctx; this.env = env; } }';
		const hooks = `export async function resolve( specifier, context, next ) {
			if ( specifier === 'cloudflare:workers' ) return { url: 'data:text/javascript,' + encodeURIComponent( ${ JSON.stringify( stub ) } ), shortCircuit: true };
			return next( specifier, context );
		}`;
		register( `data:text/javascript,${ encodeURIComponent( hooks ) }` );
		return ( await import( '../worker/drive/index.js' ) ).default;

	} )();
	return imported;

}

describe( 'World Drive Worker addresses', () => {

	let worker;

	before( async () => {

		worker = await loadWorker();

	} );

	test( 'www.worlddrive.app goes to worlddrive.app, path and query kept', async () => {

		for ( const path of [ '/', '/api/config', '/api/search?q=Oslo' ] ) {

			const res = await worker.fetch( new Request( `https://www.worlddrive.app${ path }` ), {}, {} );
			assert.equal( res.status, 301 );
			assert.equal( res.headers.get( 'Location' ), `https://worlddrive.app${ path }` );

		}

	} );

	test( 'worlddrive.app itself is served', async () => {

		const asked = [];
		const env = { ASSETS: { fetch: request => ( asked.push( request.url ), new Response( 'site' ) ) } };
		const res = await worker.fetch( new Request( 'https://worlddrive.app/' ), env, {} );
		assert.equal( await res.text(), 'site' );
		assert.deepEqual( asked, [ 'https://worlddrive.app/' ] );

	} );

} );

describe( 'World Drive Worker with the key set as Google_maps_api', () => {

	test( 'takes the key under that name in any case, still only after Turnstile and the caps', async () => {

		const worker = await loadWorker();
		const counted = [];
		const limits = { visit: async ip => ( counted.push( ip ), { ok: true, left: 3 } ) };
		const ask = ( env, ip ) => worker.fetch( new Request( 'https://worlddrive.app/api/visit', {
			method: 'POST',
			headers: { Origin: 'https://worlddrive.app', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
			body: JSON.stringify( { token: TOKEN } ),
		} ), env, {} );

		for ( const name of [ 'Google_maps_api', 'GOOGLE_MAPS_API', 'google_maps_api_key' ] ) {

			const env = {
				[ name ]: MAPS_KEY,
				TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				LIMITS: { idFromName: id => id, get: () => limits },
			};
			const config = await worker.fetch( new Request( 'https://worlddrive.app/api/config' ), env, {} );
			assert.deepEqual( await config.json(), { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, googleClientId: '' }, name );

			const failed = await ask( { ...env, TURNSTILE_SECRET: FAIL_SECRET }, '198.51.100.30' );
			assert.equal( failed.status, 403, name );
			assert.ok( ! ( await failed.text() ).includes( MAPS_KEY ), name );

			const passed = await ask( env, '198.51.100.31' );
			assert.equal( passed.status, 200, name );
			const { visit: token, ...rest } = await passed.json();
			assert.deepEqual( rest, { mapsKey: MAPS_KEY, left: 3 }, name );
			assert.match( token, /^v1\./ );

		}

		// Only the visits that passed were counted.
		assert.deepEqual( counted, [ '198.51.100.31', '198.51.100.31', '198.51.100.31' ] );

		// GOOGLE_MAPS_API_KEY comes first; a blank one doesn't count.
		const both = { GOOGLE_MAPS_API_KEY: ' ', Google_maps_api: MAPS_KEY, LIMITS: { idFromName: id => id, get: () => limits } };
		assert.equal( ( await ( await worker.fetch( new Request( 'https://worlddrive.app/api/config' ), both, {} ) ).json() ).mapsOn, true );
		const none = { GOOGLE_MAPS_API_KEY: '', Google_maps_api: '', LIMITS: { idFromName: id => id, get: () => limits } };
		assert.equal( ( await ( await worker.fetch( new Request( 'https://worlddrive.app/api/config' ), none, {} ) ).json() ).mapsOn, false );

	} );

} );

describe( 'World Drive Worker without its database', () => {

	test( 'the leaderboard says it isn\'t set up yet', async () => {

		const worker = await loadWorker();
		const env = { LIMITS: { idFromName: id => id, get: () => ( {} ) } };
		const board = await worker.fetch( new Request( 'https://worlddrive.app/api/leaderboard?period=all' ), env, {} );
		assert.equal( board.status, 503 );
		const made = await worker.fetch( new Request( 'https://worlddrive.app/api/player', {
			method: 'POST',
			headers: { Origin: 'https://worlddrive.app', 'Content-Type': 'application/json' },
			body: JSON.stringify( { name: 'Nobody' } ),
		} ), env, {} );
		assert.equal( made.status, 503 );
		assert.deepEqual( await made.json(), { error: 'Not set up yet' } );

	} );

} );

describe( 'Visitors', () => {

	test( 'are their address, or for IPv6 its /64, however it\'s written', () => {

		const of = ip => addressOf( new Request( 'https://worlddrive.app/api/visit', { headers: ip ? { 'CF-Connecting-IP': ip } : {} } ) );
		assert.equal( of( '203.0.113.7' ), '203.0.113.7' );
		for ( const ip of [ '2001:db8:1234:5678:9abc:def0:1:2', '2001:DB8:1234:5678::1', '2001:0db8:1234:5678:0000:0000:0000:0001' ] ) assert.equal( of( ip ), '2001:db8:1234:5678::/64', ip );
		assert.equal( of( '2001:db8::' ), '2001:db8:0:0::/64' );
		assert.equal( of( '::ffff:192.0.2.1' ), '::ffff:192.0.2.1' );
		assert.equal( of( '' ), 'unknown' );

	} );

} );

describe( 'The leaderboard\'s limits', () => {

	test( 'are worked out from the game\'s own scoring', () => {

		// The constants in src/drive.js, as written there.
		const source = readFileSync( new URL( '../src/drive.js', import.meta.url ), 'utf8' );
		const constant = name => new Function( `return ( ${ source.match( new RegExp( `^const ${ name } = (.+);$`, 'm' ) )[ 1 ] } );` )();
		const game = { points: constant( 'POINTS' ), comboBonus: constant( 'COMBO_BONUS' ), multMax: constant( 'MULT_MAX' ), airRate: constant( 'AIR_RATE' ) };
		assert.deepEqual( game, SCORING, 'src/drive.js scores differently now: change SCORING in worker/drive/scores.js to match' );
		// About 44,000 points a second at most, 3 times that allowed, and no visit could ever give MAX_SCORE.
		assert.equal( Math.round( maxRate( SCORING ) ), 43855 );
		assert.equal( RATE, 3 * maxRate( SCORING ) );
		assert.ok( maxRate( SCORING ) * VISIT_HOURS * 3600 < MAX_SCORE );

	} );

} );

describe( 'The key', () => {

	test( 'was only ever in the answers to visits that passed', () => {

		const withKey = answers.filter( a => a.text.includes( MAPS_KEY ) );
		assert.ok( withKey.length >= 5 );
		for ( const answer of withKey ) {

			assert.equal( answer.path, '/api/visit' );
			assert.equal( answer.status, 200 );

		}

	} );

} );

function listFiles( dir ) {

	return readdirSync( dir ).flatMap( name => {

		const path = join( dir, name );
		return statSync( path ).isDirectory() ? listFiles( path ) : [ path ];

	} );

}
