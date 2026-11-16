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
// a payment once, bank debits, bought before signing in, refunds, chargebacks, either delivered
// before their checkout, another link's checkouts, test-mode payments with a live link), the
// same-origin checks it alone goes without, SUPPORTER_EMAILS, 30 drives a day for a supporter, the
// ⭐ on the leaderboard, the owner's SQL, and buying off without its settings. And the play stats:
// each metric's keys checked and held to what a post may add, MAX_COUNTS a post, only with a visit's
// token, and the admin page's answer (ADMIN_EMAILS only): the counts a day with what the
// leaderboard's and the pass's tables say of each day (refunds left out), the as many days before
// added up, the totals now, and rows older than two years gone. And where people drop in: each
// drop-in's cell (about a kilometre each way) posted with its drop-in in the play stats, counted a
// day once for each visitor (an IPv6 one by its /48) and each visit (an Earth place only from a
// visit the Earth's caps let through, none from the owner's), held to a post's, a visit's (and no
// faster than a drop-in takes), a visitor's and each world's day's worth, a visit heard so many
// times, kept as counts of cells with nothing of who (DriveLimits' own storage read to see it), and
// the admin page's map and top places (named from the game's places and Natural Earth's towns, a
// start spot's cells one place) for a day, a week or a month, ADMIN_EMAILS only and ADMIN_LOOKS a
// minute, kept a while; topCells and topPlaces (the featured places alone too); the towns read
// without a request; the page keeping its places when a post doesn't get through; and the cells'
// grid itself. Visit tokens stay as the Worker before them read them, so a rollback keeps visits. And the look a car travels with to
// the others in its room (live-protocol.js's checkLook, which the rooms use): every part a page
// sends, the underglow and the horn too, kept, anything else left out, a bad one turned away.
// TEST_DRIVE_WORKER_PORT=8796 moves the five wrangler servers (that port and the next four).

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';
import { sessionCookies } from '../worker/sessions.js';
import { MAX_SCORE, RATE, SCORING, maxRate } from '../worker/drive/scores.js';
import { DRIVE_CARS, LIBRARY_VEHICLES, PASS_RIDES } from '../src/drive-app/catalog.js';
import { addressOf } from '../worker/drive/settings.js';
import { purchaseFor, purchaseSettings } from '../worker/drive/supporter.js';
import { VISIT_HOURS, makeVisit } from '../worker/drive/visits.js';
import { DEVICES, FUNNEL, MAX_COUNTS, METRICS, PROBLEMS, SEARCHES, checkCounts, deviceOf, dropinBucket, droveSteps, loadBucket, referrerOf } from '../src/drive-app/stats-protocol.js';
import { LOOK_PARTS, checkLook } from '../src/drive-app/live-protocol.js';
import { SPOTS } from '../src/drive-app/places.js';
import { CELL, PLACES_PER_POST, cellMiddle, cellOf, checkCell, checkPlaces, metresOn } from '../src/drive-app/dropin-cells.js';
import { VISITOR_PREFIX, nameCell, readTowns, topCells, topPlaces, townsFor } from '../worker/drive/dropins.js';
import { createStats } from '../src/drive-app/stats.js';

const PORT = Number( process.env.TEST_DRIVE_WORKER_PORT ) || 8796;
const MAPS_KEY = 'test-maps-key-not-real';
// Turnstile's documented test secrets: always passes, always fails.
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const FAIL_SECRET = '2x0000000000000000000000000000000AA';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const DAILY = 5;
const PER_VISITOR = 2;
// A visit's token (visits.js), its id's last letter saying which kind: the Earth's, for a visit the
// Earth's caps let through; the owner's (ADMIN_EMAILS); the Moon's for any other.
const EARTH_TOKEN = /^v1\.[\w-]{21}e\.\d{10}\.[\w-]{43}$/;
const OWNER_TOKEN = /^v1\.[\w-]{21}o\.\d{10}\.[\w-]{43}$/;
const MOON_TOKEN = /^v1\.[\w-]{21}m\.\d{10}\.[\w-]{43}$/;
// A token as the Worker before visits had kinds (20bf893's visits.js) took it: written so, and its
// signature the HMAC of its id and expiry with the key from the Worker's secret. Every token must be
// one of these, so a rollback to that Worker doesn't turn away the visits of every page open.
const OLD_WORKER_TOKEN = /^v1\.([A-Za-z0-9_-]{22})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
// base64url's letters, in order.
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// DriveLimits' tables of today's drop-in places (limits.js).
const PLACE_TABLES = [ 'place_seen', 'place_totals', 'place_visitors', 'place_visits' ];
const encoder = new TextEncoder();

// The UTC date of `time` (ms), e.g. 2026-10-30.
function dayOf( time ) {

	return new Date( time ).toISOString().slice( 0, 10 );

}

// An HMAC-SHA256 key derived from `secret` as the Worker derives its own (HKDF, with `label`).
async function derivedKey( secret, label ) {

	const base = await crypto.subtle.importKey( 'raw', encoder.encode( secret ), 'HKDF', false, [ 'deriveKey' ] );
	return crypto.subtle.deriveKey( { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array( 0 ), info: encoder.encode( label ) }, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, [ 'sign' ] );

}

// A visit's token as /api/visit made them before visits had kinds (20bf893's visits.js: its id 16
// random bytes), from `time`, signed with this suite's secret.
async function oldVisit( time ) {

	const id = randomBytes( 16 ).toString( 'base64url' );
	const expires = Math.floor( ( time + VISIT_HOURS * 60 * 60 * 1000 ) / 1000 );
	const signature = await crypto.subtle.sign( 'HMAC', await derivedKey( PASS_SECRET, 'world-drive visit token v1' ), encoder.encode( `${ id }.${ expires }` ) );
	return `v1.${ id }.${ expires }.${ Buffer.from( signature ).toString( 'base64url' ) }`;

}

// Whether the Worker before visits had kinds (20bf893's readVisit) would take `token` at `time`.
async function oldWorkerTakes( token, time ) {

	const match = token.match( OLD_WORKER_TOKEN );
	if ( ! match ) return false;
	const [ , id, expires, signature ] = match;
	const key = await derivedKey( PASS_SECRET, 'world-drive visit token v1' );
	const expected = Buffer.from( await crypto.subtle.sign( 'HMAC', key, encoder.encode( `${ id }.${ expires }` ) ) );
	return expected.equals( Buffer.from( signature, 'base64url' ) ) && time < Number( expires ) * 1000;

}

// What DriveLimits keeps for `text` on a day with `salt` (limits.js's places): an HMAC with its key,
// which only the Worker's secret makes (this suite's), in hex.
async function placesTag( salt, text ) {

	const signature = await crypto.subtle.sign( 'HMAC', await derivedKey( PASS_SECRET, 'world-drive drop-in places v1' ), encoder.encode( `${ salt }:${ text }` ) );
	return Buffer.from( signature ).toString( 'hex' );

}
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
				// Sign-in off whatever wrangler.drive.jsonc says: these suites test the site without it.
				GOOGLE_CLIENT_ID: '',
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
		assert.deepEqual( json, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, googleClientId: '', live: true } );
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
		// The visit's token, for posting scores (see the leaderboard's tests): the Earth's, the caps
		// checked.
		assert.match( token, EARTH_TOKEN );
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
				GOOGLE_CLIENT_ID: '',
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
		assert.deepEqual( json, { turnstileSiteKey: '0x4AAAAAAFs3k5sgUIQHSuGC', mapsOn: false, googleClientId: '', live: true } );

	} );

	test( 'a failed Turnstile check is a 403, with no key', async () => {

		const res = await visit( server, { ip: '198.51.100.9' } );
		assert.equal( res.status, 403 );
		assert.equal( res.json.error, 'The robot check didn\'t pass' );
		assert.equal( verifications.at( - 1 ).secret, FAIL_SECRET );
		// The Moon too: never limited, but still behind the robot check.
		const moon = await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN, world: 'moon' } ), ip: '198.51.100.9' } );
		assert.equal( moon.status, 403 );
		assert.equal( moon.json.visit, undefined );

	} );

} );

// --- the leaderboard -------------------------------------------------------------------

// Friday 30 October 2026 at noon UTC, and either side of the next Monday's midnight.
const NOON = Date.UTC( 2026, 9, 30, 12, 0, 0 );
const SUNDAY_NIGHT = Date.UTC( 2026, 10, 1, 23, 59, 30 );
const MONDAY_MORNING = Date.UTC( 2026, 10, 2, 0, 0, 30 );
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
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
		// The Earth's: a visit the caps let through (a Moon visit's ends in 'm', the owner's in 'o': the
		// Supporter Pass's tests).
		assert.equal( id.at( - 1 ), 'e' );
		assert.match( signature, /^[\w-]{43}$/ );
		const other = await visit( server, { ip: nextIp() } );
		assert.notEqual( other.json.visit.split( '.' )[ 1 ], id, 'two visits with one id' );
		// The Worker before visits had kinds takes it as its own (a rollback leaves open pages' visits
		// working), and doesn't once it has run out.
		assert.ok( await oldWorkerTakes( json.visit, EVENING ) );
		assert.ok( ! await oldWorkerTakes( json.visit, EVENING + 6 * HOUR ) );

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
			assert.deepEqual( json, { period, place: null, total: 1, rows: [ { rank: 1, name: 'Ace', score: 12430, tricks, place: 'Furka Pass', vehicle: 'go-kart', airTime: 2.4, date: '2026-10-30', level: 1, title: 'rookie' } ] } );

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
			// Its kind changed: the Moon's, the owner's.
			'another kind of visit': `v1.${ id.slice( 0, - 1 ) }m.${ expires }.${ signature }`,
			'the owner\'s kind of visit': `v1.${ id.slice( 0, - 1 ) }o.${ expires }.${ signature }`,
			'another version': `v2.${ id }.${ expires }.${ signature }`,
			// (The same signature's bytes: its last letter's two spare bits changed.)
			'its signature written another way': `v1.${ id }.${ expires }.${ signature.slice( 0, - 1 ) }${ BASE64URL[ BASE64URL.indexOf( signature.at( - 1 ) ) ^ 1 ] }`,
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
		// Every ride World Drive offers gets past the run's checks to the visit's (here a made-up token,
		// so nothing is kept and no turn is taken): its cars, the free one and the pass's, and the pass's
		// rides. Something else stops at the run.
		const madeUp = { visit: 'v1.made-up.0.0' };
		for ( const vehicle of [ ...DRIVE_CARS, ...PASS_RIDES ] ) {

			const res = await score( cat, { vehicle }, madeUp );
			assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'visit' ], vehicle );

		}

		assert.equal( ( await score( cat, { vehicle: 'tank' }, madeUp ) ).status, 400 );

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
		assert.deepEqual( json.me, { rank: 25, name: 'Cat', score: 3000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, date: '2026-10-30', level: 1, title: 'rookie' } );
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

// A Checkout Session event as Stripe sends it (only the fields read are filled in). live: a live-mode
// event, a real payment; without it a test-mode one, as PASS_LINK (a test link) makes.
function checkout( id, { type = 'checkout.session.completed', reference = null, email = 'alice@example.com', paid = true, link = PASS_LINK_ID, live = false } = {} ) {

	return {
		id: `evt_${ id }`,
		object: 'event',
		type,
		livemode: live,
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

function refund( id, { full = true, live = false } = {} ) {

	return { id: `evt_refund_${ id }`, object: 'event', type: 'charge.refunded', livemode: live, data: { object: { id: `ch_${ id }`, object: 'charge', payment_intent: `pi_${ id }`, refunded: full, amount_refunded: full ? 499 : 100 } } };

}

// A chargeback's money: taken back as it opens ('withdrawn'), or given back once it's won ('reinstated').
function dispute( id, funds ) {

	const status = funds === 'withdrawn' ? 'needs_response' : 'won';
	return { id: `evt_dispute_${ funds }_${ id }`, object: 'event', type: `charge.dispute.funds_${ funds }`, livemode: false, data: { object: { id: `dp_${ id }`, object: 'dispute', charge: `ch_${ id }`, payment_intent: `pi_${ id }`, amount: 499, status } } };

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
				ADMIN_EMAILS: 'nobody@example.com, Boss@Example.com , chief@example.com',
				// Where people drop in, held to fewer than wrangler.drive.jsonc's (dropins.js's) to see
				// each limit reached.
				DROPIN_PLACES_PER_VISIT: '4',
				DROPIN_PLACES_PER_VISITOR: '6',
				DROPIN_PLACES_DAILY: '12',
				DROPIN_ASKS_PER_VISIT: '5',
				// PER_VISITOR_DAILY (8), PER_VISITOR_DAILY_SUPPORTER (30) and SUPPORTER_PRICE ("CA$4.99")
				// are wrangler.drive.jsonc's, and SUPPORTER_PAYMENT_LINK_ID isn't set: the account is
				// World Drive's own, so any paid checkout on it counts.
			},
			// The towns drop-in places are named by, as the site has them.
			assets: { 'places/towns.tsv': readFileSync( new URL( '../drive/public/places/towns.tsv', import.meta.url ) ) },
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
	async function signIn( claims = {}, { credential, key = googleKey, cookie, time } = {} ) {

		const res = await send( 'POST', '/api/session', { credential: credential ?? await makeToken( key, claims ) }, { cookie, time } );
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

	test( 'the Moon is never limited: a link to it spends no drive, and over the cap there\'s a visit for it; the owner is never limited', async () => {

		const ip = nextIp();
		const drive = ( { cookie, world, time = PASS_DAY } = {} ) => call( server, '/api/visit', {
			method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json', ...( cookie ? { Cookie: cookie } : {} ) },
			body: JSON.stringify( world ? { token: TOKEN, world } : { token: TOKEN } ), ip, time,
		} );
		// To the Moon: no key and nothing counted, however many times.
		for ( let i = 0; i < 12; i ++ ) {

			const res = await drive( { world: 'moon' } );
			assert.equal( res.status, 200, res.text );
			assert.equal( res.json.moon, true );
			assert.match( res.json.visit, MOON_TOKEN );
			assert.ok( ! res.text.includes( MAPS_KEY ) );

		}

		// So the address's 8 Earth drives are all still there.
		for ( let i = 7; i >= 0; i -- ) assert.equal( ( await drive() ).json.left, i );
		// Over the cap: no key, but a visit for the Moon (scores, stats).
		const over = await drive();
		assert.equal( over.status, 429 );
		assert.equal( over.json.reason, 'visitor' );
		assert.match( over.json.visit, MOON_TOKEN );
		assert.ok( ! over.text.includes( MAPS_KEY ) );
		// The Moon's still open.
		assert.equal( ( await drive( { world: 'moon' } ) ).json.moon, true );

		// The owner (ADMIN_EMAILS, any case), from the same used-up address: never limited, and their
		// visits say they're the owner's (on the Moon too), so they post no drop-in places.
		const boss = await signIn( { sub: '1091', email: 'boss@example.com', name: 'Boss' }, { time: PASS_DAY } );
		for ( let i = 0; i < 40; i ++ ) {

			const res = await drive( { cookie: boss.cookie } );
			assert.equal( res.status, 200, `drive ${ i + 1 }: ${ res.text }` );
			assert.equal( res.json.mapsKey, MAPS_KEY );
			assert.equal( res.json.left, null );
			assert.match( res.json.visit, OWNER_TOKEN );

		}

		assert.match( ( await drive( { cookie: boss.cookie, world: 'moon' } ) ).json.visit, OWNER_TOKEN );

		// And anyone else there still isn't.
		assert.equal( ( await drive() ).status, 429 );

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
		assert.deepEqual( json.rows[ 0 ], { rank: 1, name: 'Star Driver', score: 9000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, date: '2026-11-03', level: 1, title: 'rookie', supporter: true } );
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

	test( 'a refund delivered before its checkout (Stripe still retrying that one): the pass never comes', async () => {

		const frank = await signIn( { sub: '1010', email: 'frank@example.com', name: 'Frank' } );
		const reference = frank.json.purchase.clientReferenceId;
		assert.equal( ( await webhook( server, refund( 'frank' ) ) ).status, 200 );
		assert.equal( ( await webhook( server, checkout( 'frank', { reference, email: 'frank@example.com' } ) ) ).status, 200 );
		assert.equal( ( await me( frank.cookie ) ).json.supporter, false );
		assert.deepEqual( server.d1( 'SELECT status, refunded_at FROM purchases WHERE checkout_session = \'cs_test_frank\'' ), [ { status: 'refunded', refunded_at: PASS_DAY } ] );

	} );

	test( 'a chargeback takes the pass away while the bank has the money; won, it\'s back; refunded, it stays gone', async () => {

		const has = async ( name, sub ) => {

			const person = await signIn( { sub, email: `${ name }@example.com`, name } );
			return async () => ( await me( person.cookie ) ).json.supporter;

		};
		const status = name => server.d1( `SELECT status FROM purchases WHERE checkout_session = 'cs_test_${ name }'` )[ 0 ]?.status;
		const pay = async ( name, sub ) => {

			const supporter = await has( name, sub );
			assert.equal( ( await webhook( server, checkout( name, { email: `${ name }@example.com` } ) ) ).status, 200 );
			return supporter;

		};

		// Opened and won.
		const grace = await pay( 'grace', '1011' );
		assert.equal( await grace(), true );
		assert.equal( ( await webhook( server, dispute( 'grace', 'withdrawn' ) ) ).status, 200 );
		assert.equal( await grace(), false );
		assert.equal( status( 'grace' ), 'disputed' );
		assert.equal( ( await webhook( server, dispute( 'grace', 'reinstated' ) ) ).status, 200 );
		assert.equal( await grace(), true );
		assert.deepEqual( server.d1( 'SELECT status, refunded_at FROM purchases WHERE checkout_session = \'cs_test_grace\'' ), [ { status: 'paid', refunded_at: null } ] );

		// Won, but refunded too, and the refund delivered first: it stays refunded.
		const heidi = await pay( 'heidi', '1012' );
		assert.equal( ( await webhook( server, dispute( 'heidi', 'withdrawn' ) ) ).status, 200 );
		assert.equal( ( await webhook( server, refund( 'heidi' ) ) ).status, 200 );
		assert.equal( ( await webhook( server, dispute( 'heidi', 'reinstated' ) ) ).status, 200 );
		assert.equal( await heidi(), false );
		assert.equal( status( 'heidi' ), 'refunded' );

		// The chargeback delivered before the checkout: in taken back, until it's won.
		const ivan = await has( 'ivan', '1013' );
		assert.equal( ( await webhook( server, dispute( 'ivan', 'withdrawn' ) ) ).status, 200 );
		assert.equal( ( await webhook( server, checkout( 'ivan', { email: 'ivan@example.com' } ) ) ).status, 200 );
		assert.equal( await ivan(), false );
		assert.equal( status( 'ivan' ), 'disputed' );
		assert.equal( ( await webhook( server, dispute( 'ivan', 'reinstated' ) ) ).status, 200 );
		assert.equal( await ivan(), true );

	} );

	// Play stats (stats.js): counts a day, from visits, for ADMIN_EMAILS only.
	const STATS_DAY = PASS_DAY + 3 * DAY;
	const statsRows = day => Object.fromEntries( server.d1( `SELECT metric, key, n FROM stats_daily WHERE day = '${ day }'` ).map( r => [ `${ r.metric }:${ r.key }`, r.n ] ) );

	test( 'play stats: each visit counted with its hour, and a visit\'s counts added up a day, within limits', async () => {

		const ip = nextIp();
		const visited = await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN } ), ip, time: STATS_DAY } );
		assert.equal( visited.status, 200, visited.text );
		const token = visited.json.visit;
		const post = ( counts, { visit = token, time = STATS_DAY + MINUTE, ...rest } = {} ) => send( 'POST', '/api/stats', { visit, counts }, { ip, time, ...rest } );

		assert.equal( ( await post( { 'play:go-kart': 120.7, 'garage_edit:colour': 3, 'garage_edit:glow': 2, 'garage_edit:horn': 1, 'garage_open:all': 1, 'dropin:furka': 1, 'ride:go-kart': 1, 'load:google.com': 1, 'load_time:2-5 s': 1, 'load_ms:total': 3456 } ) ).status, 204 );
		// What isn't a count it knows is left out: another metric, a ride or spot or part that isn't one, nothing, less than one;
		// and no other funnel step, device, world, search, bucket, problem or button, nor anything typed.
		assert.equal( ( await post( {
			'play:go-kart': 60, 'nope:x': 5, 'play:not-a-ride': 9, 'dropin:my-street': 1, 'garage_edit:engine': 2, 'garage_open:all': 0, 'party:made': - 3, 'load:<b>': 1,
			'funnel:drove_5m': 1, 'funnel:': 1, 'device:watch': 1, 'device:Phone': 1, 'world:earth': 1, 'world:mars': 1, 'play_world:mars': 5, 'search:my street': 1,
			'search:51.5, -0.1': 1, 'dropin_time:3 s': 1, 'problem:boom': 1, 'board:close': 1, 'pass:steal': 1, 'level_up:9': 1,
		} ) ).status, 204 );
		// No more than a post may add: 600 s of play, one load, the funnel's seven steps together, one device.
		assert.equal( ( await post( { 'play:go-kart': 1e9, 'load:direct': 5, 'funnel:globe': 50, 'device:computer': 3, 'device:tablet': 1 } ) ).status, 204 );
		// How far the visit got, on what, on which world, its searches (never what was typed), how long
		// the drop-in took, what went wrong, the leaderboard, the pass and levels.
		assert.equal( ( await post( {
			'funnel:pin': 1, 'funnel:dropin': 1, 'funnel:driving': 1, 'funnel:drove_1m': 1, 'device:phone': 1,
			'world:moon': 2, 'play_world:earth': 90.5, 'play_world:moon': 30, 'search:earth': 2, 'search:moon': 1, 'search:coordinates': 1, 'search:nothing': 1,
			'dropin_time:10-20 s': 1, 'problem:no_ground': 1, 'problem:drop_abandoned': 1, 'board:open': 1, 'board:named': 1, 'pass:open': 2, 'pass:buy': 1, 'level_up:all': 1,
		} ) ).status, 204 );
		const day = new Date( STATS_DAY ).toISOString().slice( 0, 10 );
		assert.deepEqual( statsRows( day ), {
			'visit:all': 1, 'visit_hour:12': 1,
			'play:go-kart': 120 + 60 + 600, 'garage_edit:colour': 3, 'garage_edit:glow': 2, 'garage_edit:horn': 1, 'garage_open:all': 1, 'dropin:furka': 1, 'ride:go-kart': 1,
			'load:google.com': 1, 'load:direct': 1, 'load_time:2-5 s': 1, 'load_ms:total': 3456,
			'funnel:globe': FUNNEL.length, 'funnel:pin': 1, 'funnel:dropin': 1, 'funnel:driving': 1, 'funnel:drove_1m': 1, 'device:phone': 1, 'device:computer': 1,
			'world:moon': 2, 'play_world:earth': 90, 'play_world:moon': 30, 'search:earth': 2, 'search:moon': 1, 'search:coordinates': 1, 'search:nothing': 1,
			'dropin_time:10-20 s': 1, 'problem:no_ground': 1, 'problem:drop_abandoned': 1, 'board:open': 1, 'board:named': 1, 'pass:open': 2, 'pass:buy': 1, 'level_up:all': 1,
		} );

		// Only with the visit's token, as JSON from the site itself.
		assert.equal( ( await post( { 'play:go-kart': 1 }, { visit: null } ) ).status, 403 );
		assert.equal( ( await post( { 'play:go-kart': 1 }, { visit: token.slice( 0, - 2 ) + 'xx' } ) ).status, 403 );
		assert.equal( ( await post( { 'play:go-kart': 1 }, { time: STATS_DAY + 7 * HOUR } ) ).status, 403, 'a visit run out' );
		assert.equal( ( await post( [ 1 ] ) ).status, 400 );
		// MAX_COUNTS counts a post at most: one more and it's turned away whole.
		assert.equal( ( await post( Object.fromEntries( Array.from( { length: MAX_COUNTS }, ( _, i ) => [ `x:${ i }`, 1 ] ) ) ) ).status, 204 );
		assert.equal( ( await post( Object.fromEntries( Array.from( { length: MAX_COUNTS + 1 }, ( _, i ) => [ `x:${ i }`, 1 ] ) ) ) ).status, 400 );
		assert.equal( ( await post( { 'play:go-kart': 1 }, { headers: { Origin: 'https://example.com' } } ) ).status, 403 );
		assert.equal( statsRows( day )[ 'play:go-kart' ], 780 );

	} );

	test( 'play stats: only a signed-in account in ADMIN_EMAILS sees them', async () => {

		const ask = ( cookie, days = '' ) => call( server, `/api/admin/stats${ days }`, { headers: cookie ? { Cookie: cookie } : {}, time: STATS_DAY + HOUR } );
		assert.equal( ( await ask() ).status, 401 );
		const eve = await signIn( { sub: '1090', email: 'eve@example.com', name: 'Eve' } );
		assert.equal( ( await ask( eve.cookie ) ).status, 403 );
		const boss = await signIn( { sub: '1091', email: 'boss@example.com', name: 'Boss' } );
		const res = await ask( boss.cookie, '?days=7' );
		assert.equal( res.status, 200, res.text );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		const day = new Date( STATS_DAY ).toISOString().slice( 0, 10 );
		assert.equal( res.json.to, day );
		assert.equal( res.json.from, new Date( STATS_DAY - 6 * DAY ).toISOString().slice( 0, 10 ) );
		assert.ok( res.json.rows.some( ( [ d, metric, key, n ] ) => d === day && metric === 'play' && key === 'go-kart' && n === 780 ) );
		// A day's rows only within the days asked for.
		assert.deepEqual( ( await call( server, '/api/admin/stats?days=1', { headers: { Cookie: boss.cookie }, time: STATS_DAY + 2 * DAY } ) ).json.rows, [] );

	} );

	test( 'play stats: the admin page is told each day\'s new players, new bests, accounts and passes (none taken back), the as many days before added up, and the totals now', async () => {

		// Well clear of the other tests' days.
		const ADMIN_DAY = PASS_DAY + 60 * DAY;
		const dayAt = time => new Date( time ).toISOString().slice( 0, 10 );
		// The boss's account made well before the days asked about (if no other test has), so it isn't one of their new accounts.
		await signIn( { sub: '1091', email: 'boss@example.com', name: 'Boss' }, { time: ADMIN_DAY - 20 * DAY } );
		const boss = await signIn( { sub: '1091', email: 'boss@example.com', name: 'Boss' }, { time: ADMIN_DAY } );
		const ask = ( days = 7 ) => call( server, `/api/admin/stats?days=${ days }`, { headers: { Cookie: boss.cookie }, time: ADMIN_DAY } );
		const was = ( await ask() ).json.totals;

		// Google accounts: one this morning, one three days ago, one in the week before.
		for ( const [ sub, name, time ] of [ [ '1201', 'nia', ADMIN_DAY - 2 * HOUR ], [ '1202', 'oto', ADMIN_DAY - 3 * DAY ], [ '1203', 'pia', ADMIN_DAY - 9 * DAY ] ] ) {

			assert.equal( ( await signIn( { sub, email: `${ name }@example.com`, name }, { time } ) ).status, 200 );

		}

		const account = sub => server.d1( `SELECT id FROM accounts WHERE google_sub = '${ sub }'` )[ 0 ].id;
		// Players: two today, one in the week before; and the scores log (each a new best): two today,
		// one yesterday, one in the week before.
		server.d1( `INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at ) VALUES
			( 'admin-player-01', 'Admin Ada', 'admin-ada', 'x', ${ ADMIN_DAY - HOUR }, ${ ADMIN_DAY - HOUR } ),
			( 'admin-player-02', 'Admin Bo', 'admin-bo', 'x', ${ ADMIN_DAY - 3 * HOUR }, ${ ADMIN_DAY - HOUR } ),
			( 'admin-player-03', 'Admin Cy', 'admin-cy', 'x', ${ ADMIN_DAY - 8 * DAY }, ${ ADMIN_DAY - 8 * DAY } )` );
		server.d1( `INSERT INTO scores ( player_id, score, tricks, place, vehicle, air_time, run_seconds, visit, created_at ) VALUES
			${ [ [ 1, HOUR ], [ 2, 2 * HOUR ], [ 1, DAY ], [ 3, 8 * DAY ] ].map( ( [ who, ago ] ) => `( 'admin-player-0${ who }', 100, 'Backflip!', 'Furka Pass', 'go-kart', 1, 60, 'v', ${ ADMIN_DAY - ago } )` ).join( ', ' ) }` );
		// Passes: two bought today (one by an email nobody has signed in with), one refunded, one given
		// by hand (to Oto's email), and one bought in US dollars in the week before.
		server.d1( `INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, payment_intent, status, created_at, refunded_at ) VALUES
			( 'cs_admin_1', ${ account( '1201' ) }, 'nia@example.com', 499, 'cad', 'pi_admin_1', 'paid', ${ ADMIN_DAY - HOUR }, NULL ),
			( 'cs_admin_2', NULL, 'zed.admin@example.com', 499, 'cad', 'pi_admin_2', 'paid', ${ ADMIN_DAY - HOUR }, NULL ),
			( 'cs_admin_3', ${ account( '1202' ) }, 'oto@example.com', 499, 'cad', 'pi_admin_3', 'refunded', ${ ADMIN_DAY - 2 * DAY }, ${ ADMIN_DAY - DAY } ),
			( 'granted-admin', NULL, 'oto@example.com', NULL, NULL, NULL, 'granted', ${ ADMIN_DAY - 2 * DAY }, NULL ),
			( 'cs_admin_4', ${ account( '1203' ) }, 'pia@example.com', 999, 'usd', 'pi_admin_4', 'paid', ${ ADMIN_DAY - 10 * DAY }, NULL )` );
		// And the page's counts: today's, two days of the week before, and older ones (one older than
		// two years).
		server.d1( `INSERT INTO stats_daily ( day, metric, key, n ) VALUES ( '${ dayAt( ADMIN_DAY ) }', 'funnel', 'globe', 3 ),
			( '${ dayAt( ADMIN_DAY - 8 * DAY ) }', 'play', 'go-kart', 100 ), ( '${ dayAt( ADMIN_DAY - 9 * DAY ) }', 'play', 'go-kart', 50 ),
			( '${ dayAt( ADMIN_DAY - 20 * DAY ) }', 'play', 'go-kart', 7 ), ( '${ dayAt( ADMIN_DAY - 729 * DAY ) }', 'visit', 'all', 1 ), ( '${ dayAt( ADMIN_DAY - 731 * DAY ) }', 'visit', 'all', 1 )` );

		const res = await ask();
		assert.equal( res.status, 200, res.text );
		const { from, to, rows, previous, totals, kept } = res.json;
		assert.deepEqual( [ from, to ], [ dayAt( ADMIN_DAY - 6 * DAY ), dayAt( ADMIN_DAY ) ] );
		const sorted = list => [ ...list ].sort( ( a, b ) => JSON.stringify( a ).localeCompare( JSON.stringify( b ) ) );
		const today = dayAt( ADMIN_DAY );
		// In the rows' shape, the counts' and the tables' alike, by day.
		assert.deepEqual( sorted( rows ), sorted( [
			[ today, 'funnel', 'globe', 3 ], [ today, 'players', 'new', 2 ], [ today, 'scores', 'new_best', 2 ], [ dayAt( ADMIN_DAY - DAY ), 'scores', 'new_best', 1 ],
			[ today, 'accounts', 'new', 1 ], [ dayAt( ADMIN_DAY - 3 * DAY ), 'accounts', 'new', 1 ],
			[ today, 'purchases', 'paid', 2 ], [ dayAt( ADMIN_DAY - 2 * DAY ), 'purchases', 'granted', 1 ], [ today, 'revenue', 'cad', 998 ],
		] ) );
		assert.deepEqual( rows.map( ( [ day ] ) => day ), rows.map( ( [ day ] ) => day ).sort() );
		// The week before, added up by metric and key.
		assert.deepEqual( { ...previous, rows: sorted( previous.rows ) }, {
			from: dayAt( ADMIN_DAY - 13 * DAY ), to: dayAt( ADMIN_DAY - 7 * DAY ), first: { visit: null, funnel: null },
			rows: sorted( [ [ 'play', 'go-kart', 150 ], [ 'players', 'new', 1 ], [ 'scores', 'new_best', 1 ], [ 'accounts', 'new', 1 ], [ 'purchases', 'paid', 1 ], [ 'revenue', 'usd', 999 ] ] ),
		} );
		// Now: three more players and accounts, three more with the pass (Nia's and Pia's bought, Oto's
		// given), and one bought by an email nobody has signed in with.
		assert.deepEqual( totals, { players: was.players + 3, accounts: was.accounts + 3, supporters: was.supporters + 3, unclaimed: was.unclaimed + 1 } );
		assert.deepEqual( kept, { stats: 730, scores: 35 } );

		// A year at most, compared with the year before it; rows older than two years go as it's asked.
		const year = ( await ask( 9999 ) ).json;
		assert.deepEqual( [ year.from, year.previous.from, year.previous.to ], [ dayAt( ADMIN_DAY - 364 * DAY ), dayAt( ADMIN_DAY - 729 * DAY ), dayAt( ADMIN_DAY - 365 * DAY ) ] );
		assert.deepEqual( year.previous.rows.find( ( [ metric ] ) => metric === 'visit' ), [ 'visit', 'all', 1 ] );
		// Its first day of visits is the period's first (so the page compares the play figures), and it has no funnel.
		assert.deepEqual( year.previous.first, { visit: year.previous.from, funnel: null } );
		for ( let tries = 0; server.d1( `SELECT day FROM stats_daily WHERE day = '${ dayAt( ADMIN_DAY - 731 * DAY ) }'` ).length && tries < 20; tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );
		assert.deepEqual( server.d1( `SELECT day FROM stats_daily WHERE metric = 'visit' AND day < '${ dayAt( ADMIN_DAY - 700 * DAY ) }'` ), [ { day: dayAt( ADMIN_DAY - 729 * DAY ) } ] );

	} );

	// Where people drop in (dropins.js): each drop-in's cell, posted with its play stats, counted a day.
	const PLACES_DAY = PASS_DAY + 90 * DAY;
	const placeRows = time => Object.fromEntries( server.d1( `SELECT world, cell_row, cell_column, n FROM dropins_daily WHERE day = '${ new Date( time ).toISOString().slice( 0, 10 ) }'` ).map( r => [ `${ r.world }:${ r.cell_row }:${ r.cell_column }`, r.n ] ) );
	const GOLDEN = cellOf( 'earth', 37.8199, - 122.4783 );
	const LYON = cellOf( 'earth', 45.76, 4.84 );
	const PARIS = cellOf( 'earth', 48.8738, 2.2962 );
	const TYCHO = cellOf( 'moon', - 43.31, - 11.36 );
	// A visit from `ip` (a new address unless given) at `time`: post( counts, places, after ) posts
	// its stats `after` ms into it.
	async function placesVisit( { ip = nextIp(), time = PLACES_DAY } = {} ) {

		const visited = await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN } ), ip, time } );
		assert.equal( visited.status, 200, visited.text );
		const post = ( counts, places, after = MINUTE ) => send( 'POST', '/api/stats', { visit: visited.json.visit, counts, ...( places === undefined ? {} : { places } ) }, { ip, time: time + after } );
		return { ip, token: visited.json.visit, post };

	}

	// What DriveLimits keeps (limits.js), read from a copy of its Durable Object's SQLite file as
	// wrangler stores it: `read( db )` with the copy open (node:sqlite), and what it gives.
	function limitsStorage( read ) {

		for ( const file of listFiles( server.state ).filter( path => path.endsWith( '.sqlite' ) ) ) {

			const dir = mkdtempSync( join( tmpdir(), 'drive-limits-' ) );
			try {

				for ( const end of [ '', '-wal', '-shm' ] ) if ( existsSync( file + end ) ) copyFileSync( file + end, join( dir, `copy.sqlite${ end }` ) );
				const db = new DatabaseSync( join( dir, 'copy.sqlite' ) );
				try {

					if ( db.prepare( 'SELECT name FROM sqlite_master WHERE name = \'place_seen\'' ).get() ) return read( db );

				} finally {

					db.close();

				}

			} finally {

				rmSync( dir, { recursive: true, force: true } );

			}

		}

		throw new Error( 'No DriveLimits storage' );

	}

	test( 'where people drop in: a drop-in\'s cell, posted with its drop-in, is counted a day, once for each visitor; one without its drop-in, or not a cell, isn\'t; and never more than a post carries', async () => {

		const ann = await placesVisit();
		assert.equal( ( await ann.post( { 'dropin:golden-gate': 1, 'ride:go-kart': 1 }, [ GOLDEN ] ) ).status, 204 );
		assert.deepEqual( placeRows( PLACES_DAY ), { [ GOLDEN ]: 1 } );
		// The play stats were counted as ever.
		assert.equal( statsRows( new Date( PLACES_DAY ).toISOString().slice( 0, 10 ) )[ 'dropin:golden-gate' ], 1 );
		// Again from the same visit, and from another visit from the same address: still once today.
		assert.equal( ( await ann.post( { 'dropin:golden-gate': 1 }, [ GOLDEN ], 2 * MINUTE ) ).status, 204 );
		const again = await placesVisit( { ip: ann.ip } );
		assert.equal( ( await again.post( { 'dropin:golden-gate': 1 }, [ GOLDEN ] ) ).status, 204 );
		assert.deepEqual( placeRows( PLACES_DAY ), { [ GOLDEN ]: 1 } );

		// Another visitor: counted; and their drop-in on the Moon.
		const bo = await placesVisit();
		assert.equal( ( await bo.post( { 'dropin:golden-gate': 1 }, [ GOLDEN ] ) ).status, 204 );
		assert.equal( ( await bo.post( { 'dropin:moon': 1 }, [ TYCHO ], 2 * MINUTE ) ).status, 204 );
		assert.deepEqual( placeRows( PLACES_DAY ), { [ GOLDEN ]: 2, [ TYCHO ]: 1 } );

		// Only as many on a world as the drop-ins counted there in the same post: none without one, a
		// Moon cell not with an Earth drop-in, one of two cells with one drop-in.
		assert.equal( ( await bo.post( { 'play:go-kart': 30 }, [ LYON ], 3 * MINUTE ) ).status, 204 );
		assert.equal( ( await bo.post( { 'dropin:other': 1 }, [ cellOf( 'moon', 10, 10 ) ], 4 * MINUTE ) ).status, 204 );
		assert.equal( ( await bo.post( { 'dropin:other': 1 }, [ LYON, PARIS ], 5 * MINUTE ) ).status, 204 );
		assert.deepEqual( placeRows( PLACES_DAY ), { [ GOLDEN ]: 2, [ TYCHO ]: 1, [ LYON ]: 1 } );

		// Not a list, or more than a post carries: the post is turned away whole, its counts too.
		const cy = await placesVisit();
		assert.equal( ( await cy.post( { 'dropin:other': 1 }, PARIS ) ).status, 400 );
		assert.equal( ( await cy.post( { 'dropin:other': 9 }, Array.from( { length: PLACES_PER_POST + 1 }, ( _, i ) => cellOf( 'earth', 10 + i, 10 ) ) ) ).status, 400 );
		assert.equal( ( await cy.post( { 'dropin:other': 1 }, { 0: PARIS } ) ).status, 400 );
		// What isn't a cell of the grid is left out: past its last row or a row's last column, another
		// world, negative, a number, coordinates themselves.
		assert.equal( ( await cy.post( { 'dropin:other': 6, 'dropin:moon': 1 }, [ 'earth:20015:0', 'earth:20014:3', 'mars:1:1', 'earth:-1:0', 5, '48.87,2.30' ] ) ).status, 204 );
		assert.equal( ( await cy.post( { 'dropin:moon': 1 }, [ 'moon:5458:0' ], 2 * MINUTE ) ).status, 204 );
		assert.deepEqual( placeRows( PLACES_DAY ), { [ GOLDEN ]: 2, [ TYCHO ]: 1, [ LYON ]: 1 } );
		// And only with a visit's token, as the stats are.
		assert.equal( ( await send( 'POST', '/api/stats', { visit: cy.token.slice( 0, - 2 ) + 'xx', counts: { 'dropin:other': 1 }, places: [ PARIS ] }, { ip: cy.ip, time: PLACES_DAY + MINUTE } ) ).status, 403 );
		assert.equal( ( await send( 'POST', '/api/stats', { visit: cy.token, counts: { 'dropin:other': 1 }, places: [ PARIS ] }, { ip: cy.ip, time: PLACES_DAY + 7 * HOUR } ) ).status, 403, 'a visit run out' );
		assert.equal( placeRows( PLACES_DAY )[ PARIS ], undefined );

	} );

	test( 'where people drop in: a visit\'s places come no faster than one each 10 s of it, and no more than a visit\'s, a visitor\'s and the day\'s worth (DROPIN_PLACES_*), each starting again at midnight UTC', async () => {

		// (This suite's settings: 4 a visit, 6 a visitor, 12 a day on each world.)
		const day = PLACES_DAY + DAY;
		const cells = Array.from( { length: 40 }, ( _, i ) => cellOf( 'earth', 20 + i * 0.1, 30 ) );
		const earth = n => ( { 'dropin:other': n } );
		const total = () => Object.values( placeRows( day ) ).reduce( ( a, b ) => a + b, 0 );

		// Three at once a second into the visit: one (it can't have driven more); 25 s in, two more.
		const dee = await placesVisit( { time: day } );
		assert.equal( ( await dee.post( earth( 3 ), cells.slice( 0, 3 ), SECOND ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ cells[ 0 ] ]: 1 } );
		assert.equal( ( await dee.post( earth( 3 ), cells.slice( 1, 4 ), 25 * SECOND ) ).status, 204 );
		assert.deepEqual( Object.keys( placeRows( day ) ).sort(), cells.slice( 0, 3 ).sort() );
		// Its fourth, and no more however long it goes on.
		assert.equal( ( await dee.post( earth( 3 ), cells.slice( 3, 6 ), HOUR ) ).status, 204 );
		assert.equal( total(), 4 );
		assert.ok( placeRows( day )[ cells[ 3 ] ] && ! placeRows( day )[ cells[ 4 ] ] );

		// The same visitor's next visit: two more, making the visitor's six.
		const deeAgain = await placesVisit( { ip: dee.ip, time: day } );
		assert.equal( ( await deeAgain.post( earth( 4 ), cells.slice( 10, 14 ), HOUR ) ).status, 204 );
		assert.equal( total(), 6 );

		// Others, up to the day's twelve; then nobody's, however new.
		const eli = await placesVisit( { time: day } );
		assert.equal( ( await eli.post( earth( 4 ), cells.slice( 20, 24 ), HOUR ) ).status, 204 );
		const fay = await placesVisit( { time: day } );
		assert.equal( ( await fay.post( earth( 4 ), cells.slice( 24, 28 ), HOUR ) ).status, 204 );
		assert.equal( total(), 12 );
		const gus = await placesVisit( { time: day } );
		assert.equal( ( await gus.post( earth( 1 ), [ cells[ 30 ] ], HOUR ) ).status, 204 );
		assert.equal( total(), 12 );
		// Their play stats still counted all the same.
		assert.equal( statsRows( new Date( day ).toISOString().slice( 0, 10 ) )[ 'dropin:other' ], 3 + 3 + 3 + 4 + 4 + 4 + 1 );
		// The Moon's day is its own (so Moon visits, which cost nothing but the robot check, can't
		// crowd out the Earth's places, nor the Earth's the Moon's): its places are still counted.
		const ivy = await placesVisit( { time: day } );
		const moonCells = Array.from( { length: 4 }, ( _, i ) => cellOf( 'moon', 10 + i * 0.2, 30 ) );
		assert.equal( ( await ivy.post( { 'dropin:moon': 4 }, moonCells, HOUR ) ).status, 204 );
		assert.equal( total(), 16 );
		assert.ok( moonCells.every( cell => placeRows( day )[ cell ] === 1 ) );

		// The next day it all starts again.
		const next = day + DAY;
		const hal = await placesVisit( { ip: dee.ip, time: next } );
		assert.equal( ( await hal.post( earth( 1 ), [ cells[ 0 ] ] ) ).status, 204 );
		assert.deepEqual( placeRows( next ), { [ cells[ 0 ] ]: 1 } );

	} );

	test( 'where people drop in: one visit\'s token sent from many addresses adds a cell once, and a visit\'s worth in all; a Moon visit\'s token, one over the caps or one from before visits had kinds, posts the Moon\'s places alone; the owner\'s, none', async () => {

		const day = PLACES_DAY + 10 * DAY;
		const post = ( token, counts, places, after, ip = nextIp() ) => send( 'POST', '/api/stats', { visit: token, counts, places }, { ip, time: day + after } );
		const EIFFEL = cellOf( 'earth', 48.8584, 2.2945 );
		const others = Array.from( { length: 4 }, ( _, i ) => cellOf( 'earth', 30 + i * 0.1, 40 ) );
		// One visit's token from four addresses, five minutes in: the Eiffel Tower once.
		const replayed = await placesVisit( { time: day } );
		for ( let i = 0; i < 4; i ++ ) assert.equal( ( await post( replayed.token, { 'dropin:other': 1 }, [ EIFFEL ], 5 * MINUTE + i * SECOND ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ EIFFEL ]: 1 } );
		// New cells from a fifth and a sixth: the visit's 4 (this suite's) in all, wherever from.
		assert.equal( ( await post( replayed.token, { 'dropin:other': 4 }, others, 6 * MINUTE ) ).status, 204 );
		assert.equal( ( await post( replayed.token, { 'dropin:other': 1 }, [ cellOf( 'earth', 31, 41 ) ], 7 * MINUTE ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ EIFFEL ]: 1, ...Object.fromEntries( others.slice( 0, 3 ).map( cell => [ cell, 1 ] ) ) } );

		// A Moon visit (no Earth caps checked, nothing spent but the robot check): the Moon's places,
		// never the Earth's, though its stats are counted as ever.
		const visitFor = ( ip, world ) => call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( world ? { token: TOKEN, world } : { token: TOKEN } ), ip, time: day } );
		const moon = await visitFor( nextIp(), 'moon' );
		assert.match( moon.json.visit, MOON_TOKEN );
		const CHAMPS = cellOf( 'earth', 48.87, 2.31 );
		const COPERNICUS = cellOf( 'moon', 9.62, - 20.08 );
		const dropins = () => statsRows( dayOf( day ) )[ 'dropin:other' ];
		const before = dropins();
		assert.equal( ( await post( moon.json.visit, { 'dropin:other': 1, 'dropin:moon': 1 }, [ CHAMPS, COPERNICUS ], HOUR ) ).status, 204 );
		assert.deepEqual( [ placeRows( day )[ CHAMPS ], placeRows( day )[ COPERNICUS ] ], [ undefined, 1 ] );
		assert.equal( dropins(), before + 1 );
		// A visit turned away by the caps (the address's 8 drives used): the Moon's too.
		const ip = nextIp();
		let over = null;
		for ( let i = 0; i < 9; i ++ ) over = await visitFor( ip );
		assert.equal( over.status, 429 );
		assert.match( over.json.visit, MOON_TOKEN );
		assert.equal( ( await post( over.json.visit, { 'dropin:other': 1 }, [ CHAMPS ], HOUR, ip ) ).status, 204 );
		assert.equal( placeRows( day )[ CHAMPS ], undefined );
		// A token from before visits had kinds (its id 16 random bytes), taken until it runs out (a page
		// open over the deploy): its stats, and the Moon's places alone, as it doesn't say.
		const old = await oldVisit( day );
		const TYCHO_RIM = cellOf( 'moon', - 42.9, - 11.2 );
		assert.equal( ( await post( old, { 'dropin:other': 1, 'dropin:moon': 1 }, [ CHAMPS, TYCHO_RIM ], HOUR ) ).status, 204 );
		assert.deepEqual( [ placeRows( day )[ CHAMPS ], placeRows( day )[ TYCHO_RIM ] ], [ undefined, 1 ] );
		assert.equal( dropins(), before + 3 );
		// The owner's (ADMIN_EMAILS), on the Earth or the Moon: their stats, and no places at all, so
		// the admin page's own Drive links don't add to the places it shows (nor to challenges' picks).
		const boss = await signIn( { sub: '1091', email: 'boss@example.com', name: 'Boss' }, { time: day } );
		const ownerVisit = async world => ( await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json', Cookie: boss.cookie }, body: JSON.stringify( world ? { token: TOKEN, world } : { token: TOKEN } ), ip: nextIp(), time: day } ) ).json.visit;
		const [ ownersEarth, ownersMoon ] = [ await ownerVisit(), await ownerVisit( 'moon' ) ];
		assert.match( ownersEarth, OWNER_TOKEN );
		assert.match( ownersMoon, OWNER_TOKEN );
		const ARC = cellOf( 'earth', 48.8738, 2.2962 );
		const PLATO = cellOf( 'moon', 51.6, - 9.4 );
		assert.equal( ( await post( ownersEarth, { 'dropin:other': 1, 'dropin:moon': 1 }, [ ARC, PLATO ], HOUR ) ).status, 204 );
		assert.equal( ( await post( ownersMoon, { 'dropin:moon': 1 }, [ PLATO ], HOUR ) ).status, 204 );
		assert.deepEqual( [ placeRows( day )[ ARC ], placeRows( day )[ PLATO ] ], [ undefined, undefined ] );
		assert.equal( dropins(), before + 4 );

	} );

	test( 'where people drop in: a visitor is an address, an IPv6 one by its /48: two /64s of one /48 add a cell once and share a visitor\'s places; another /48 is another visitor; the visit caps still count each /64', async () => {

		const day = PLACES_DAY + 12 * DAY;
		const visitFrom = ip => call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN } ), ip, time: day } );
		const post = ( token, ip, counts, places ) => send( 'POST', '/api/stats', { visit: token, counts, places }, { ip, time: day + HOUR } );
		// Two homes' /64s in one /48 (a tunnel broker's, say), and a /64 in another /48.
		const [ first, second, other ] = [ '2001:db8:aa:1::5', '2001:db8:aa:2::5', '2001:db8:ab:1::5' ];
		const visits = {};
		for ( const ip of [ first, second, other ] ) {

			const res = await visitFrom( ip );
			assert.equal( res.status, 200, res.text );
			// Each /64 its own 8 drives a day (wrangler.drive.jsonc's): the second /64's first visit has 7
			// left, as the first's.
			assert.equal( res.json.left, 7, ip );
			visits[ ip ] = res.json.visit;

		}

		const MARINA = cellOf( 'earth', 36.12, - 5.35 );
		for ( const ip of [ first, second, other ] ) assert.equal( ( await post( visits[ ip ], ip, { 'dropin:other': 1 }, [ MARINA ] ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ MARINA ]: 2 } );
		// The /48's visitor's places (this suite's 6), whichever /64 posts them: 1 so far, then 4 and 4
		// asked for, 5 more counted.
		const cells = Array.from( { length: 8 }, ( _, i ) => cellOf( 'earth', 37 + i * 0.1, - 5.35 ) );
		assert.equal( ( await post( visits[ first ], first, { 'dropin:other': 4 }, cells.slice( 0, 4 ) ) ).status, 204 );
		assert.equal( ( await post( visits[ second ], second, { 'dropin:other': 4 }, cells.slice( 4 ) ) ).status, 204 );
		assert.equal( cells.filter( cell => placeRows( day )[ cell ] ).length, 5 );

	} );

	test( 'where people drop in: DriveLimits hears a visit\'s places DROPIN_ASKS_PER_VISIT times a day at most, and once a visit can add no more, the Worker stops asking', async () => {

		const day = PLACES_DAY + 11 * DAY;
		// How many places DriveLimits has counted for `token`'s visit today, and how many times it has
		// heard it, from its storage (by the visit's HMAC, as it keeps it).
		const heard = async token => {

			const salt = limitsStorage( db => db.prepare( 'SELECT salt FROM days WHERE day = ?' ).get( dayOf( day ) ).salt );
			const tag = await placesTag( salt, `visit:${ token.split( '.' )[ 1 ] }` );
			return limitsStorage( db => ( { ...db.prepare( 'SELECT count, asks FROM place_visits WHERE day = ? AND visit = ?' ).get( dayOf( day ), tag ) } ) );

		};
		// A visit posting the same place again and again (this suite's 5 asks a visit): heard five
		// times, then never again, so a new place after that isn't counted.
		const X = cellOf( 'earth', 33, 44 );
		const jo = await placesVisit( { time: day } );
		for ( let i = 0; i < 5; i ++ ) assert.equal( ( await jo.post( { 'dropin:other': 1 }, [ X ], HOUR + i * SECOND ) ).status, 204 );
		assert.deepEqual( await heard( jo.token ), { count: 1, asks: 5 } );
		assert.equal( ( await jo.post( { 'dropin:other': 1 }, [ cellOf( 'earth', 33.2, 44 ) ], 2 * HOUR ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ X ]: 1 } );
		assert.deepEqual( await heard( jo.token ), { count: 1, asks: 5 } );
		// A visit whose places are all counted (this suite's 4): not asked about again.
		const kim = await placesVisit( { time: day } );
		const four = Array.from( { length: 4 }, ( _, i ) => cellOf( 'earth', 34 + i * 0.1, 44 ) );
		assert.equal( ( await kim.post( { 'dropin:other': 4 }, four, HOUR ) ).status, 204 );
		assert.equal( ( await kim.post( { 'dropin:other': 1 }, [ cellOf( 'earth', 35, 44 ) ], 2 * HOUR ) ).status, 204 );
		assert.deepEqual( await heard( kim.token ), { count: 4, asks: 1 } );
		assert.equal( Object.keys( placeRows( day ) ).length, 5 );

	} );

	test( 'where people drop in: kept only as counts of cells a day, with nothing of who, which visit or from where, and no finer than the cell', async () => {

		// The table: a day, a world, a cell and how many; nothing else.
		const [ { sql } ] = server.d1( 'SELECT sql FROM sqlite_master WHERE name = \'dropins_daily\'' );
		assert.deepEqual( server.d1( 'SELECT name FROM pragma_table_info( \'dropins_daily\' ) ORDER BY cid' ).map( r => r.name ), [ 'day', 'world', 'cell_row', 'cell_column', 'n' ] );
		assert.match( sql, /PRIMARY KEY \( world, day, cell_row, cell_column \)/ );
		// What DriveLimits keeps of today's: hashes and counts, never a cell or an address. (The
		// addresses this suite's visitors came from are 198.19.x.y.)
		const visitor = await placesVisit();
		const somewhere = cellOf( 'earth', - 12.3456, 130.8765 );
		assert.equal( ( await visitor.post( { 'dropin:other': 1 }, [ somewhere ] ) ).status, 204 );
		assert.equal( placeRows( PLACES_DAY )[ somewhere ], 1 );
		const id = visitor.token.split( '.' )[ 1 ];
		const files = listFiles( server.state );
		assert.ok( files.some( file => /\.sqlite$/.test( file ) ), `no storage in ${ files.join( ', ' ) }` );
		for ( const file of files ) {

			// (The rate limiters count the visit's posts by its id, as for all the play stats: on
			// Cloudflare in memory, here in wrangler's files.)
			const bytes = readFileSync( file ).toString( 'latin1' );
			for ( const text of [ somewhere, GOLDEN, TYCHO, visitor.ip, ...( file.includes( 'ratelimit' ) ? [] : [ id ] ) ] ) assert.ok( ! bytes.includes( text ), `${ text } is in ${ file }` );

		}

		// Nor anything a copy of DriveLimits' storage can rebuild who dropped in where from. The day's
		// salt is there (the visit caps need it), so a hash of it with an address (as the visit caps
		// keep a visitor), a visit's id or a cell could be tried against every address, visit and cell:
		// none is there. Its places' tables keep only HMACs made with a key from the Worker's secret,
		// which isn't in it, and have no rowids to pair a visit's row with its visitor's by the order
		// they went in.
		const today = dayOf( PLACES_DAY );
		const stored = limitsStorage( db => ( {
			salt: db.prepare( 'SELECT salt FROM days WHERE day = ?' ).get( today ).salt,
			tables: Object.fromEntries( db.prepare( 'SELECT name, sql FROM sqlite_master WHERE type = \'table\' AND name LIKE \'place%\'' ).all().map( row => [ row.name, row.sql ] ) ),
			values: PLACE_TABLES.flatMap( table => db.prepare( `SELECT * FROM ${ table }` ).all().flatMap( row => Object.values( row ).map( String ) ) ),
			seen: db.prepare( 'SELECT seen FROM place_seen WHERE day = ?' ).all( today ).map( row => row.seen ),
		} ) );
		assert.deepEqual( Object.keys( stored.tables ).sort(), PLACE_TABLES );
		for ( const sql of Object.values( stored.tables ) ) assert.match( sql, /\) WITHOUT ROWID$/ );
		const sha256 = text => createHash( 'sha256' ).update( text ).digest( 'hex' );
		const visitorHash = sha256( `${ stored.salt }:${ visitor.ip }` );
		const tries = [ visitorHash, id, somewhere, ...[
			visitor.ip, id, `visitor:${ visitor.ip }`, `visit:${ id }`, `visitor:${ visitorHash }`, `${ visitorHash }:${ somewhere }`, `${ visitor.ip }:${ somewhere }`,
			`${ id }:${ somewhere }`, `visitor:${ visitor.ip }:${ somewhere }`, `visit:${ id }:${ somewhere }`, `visitor:${ visitorHash }:${ somewhere }`,
		].map( text => sha256( `${ stored.salt }:${ text }` ) ) ];
		for ( const text of tries ) assert.ok( ! stored.values.includes( text ), `${ text } is in DriveLimits' places` );
		// (What is there: the HMACs, made with the key only the Worker can make.)
		assert.ok( stored.seen.includes( await placesTag( stored.salt, `visitor:${ visitor.ip }:${ somewhere }` ) ) );
		assert.ok( stored.seen.includes( await placesTag( stored.salt, `visit:${ id }:${ somewhere }` ) ) );

		// When a new UTC day starts (any call to DriveLimits: here a visit), the days before go with
		// their salt: no place of theirs is kept.
		const later = PLACES_DAY + 20 * DAY;
		assert.ok( limitsStorage( db => PLACE_TABLES.some( table => db.prepare( `SELECT COUNT(*) AS n FROM ${ table } WHERE day < ?` ).get( dayOf( later ) ).n > 0 ) ) );
		await placesVisit( { time: later } );
		assert.deepEqual( limitsStorage( db => PLACE_TABLES.map( table => db.prepare( `SELECT COUNT(*) AS n FROM ${ table } WHERE day < ?` ).get( dayOf( later ) ).n ) ), [ 0, 0, 0, 0 ] );
		assert.deepEqual( limitsStorage( db => db.prepare( 'SELECT day FROM days' ).all().map( row => row.day ) ), [ dayOf( later ) ] );

	} );

	test( 'where people drop in: a start spot\'s cells are one place in the top places, at its pin with its drop-ins added up; a cell further off is named by how far from it', async () => {

		const MERGE_DAY = PASS_DAY + 170 * DAY;
		const row = ( time, key, n ) => {

			const { world, row: cellRow, column } = checkCell( key );
			return `( '${ dayOf( time ) }', '${ world }', ${ cellRow }, ${ column }, ${ n } )`;

		};
		const middle = key => {

			const { world, row: cellRow, column } = checkCell( key );
			const { lat, lon } = cellMiddle( world, cellRow, column );
			return [ lat, lon ];

		};
		// The Arc de Triomphe's pin is 5 m from its cell's north edge: 11 m north of it is the next
		// row's cell, where its drop-ins start as often. A kilometre south-west is somewhere else.
		const ARC = cellOf( 'earth', 48.8738, 2.2962 );
		const ARC_NORTH = cellOf( 'earth', 48.8739, 2.2962 );
		const SOUTH_WEST = 'earth:15441:13332';
		assert.notEqual( ARC, ARC_NORTH );
		server.d1( `INSERT INTO dropins_daily ( day, world, cell_row, cell_column, n ) VALUES
			${ row( MERGE_DAY, ARC, 3 ) }, ${ row( MERGE_DAY, ARC_NORTH, 2 ) }, ${ row( MERGE_DAY, GOLDEN, 4 ) }, ${ row( MERGE_DAY, SOUTH_WEST, 1 ) },
			${ row( MERGE_DAY - DAY, ARC_NORTH, 6 ) }` );
		const owner = await signIn( { sub: '1095', email: 'nobody@example.com', name: 'Owner' }, { time: MERGE_DAY } );
		const ask = async days => ( await call( server, `/api/admin/dropins?days=${ days }`, { headers: { Cookie: owner.cookie }, time: MERGE_DAY } ) ).json;

		const today = await ask( 1 );
		// The map has each cell; the table each place once.
		assert.deepEqual( today.worlds.earth.heat, [ [ ...middle( GOLDEN ), 4 ], [ ...middle( ARC ), 3 ], [ ...middle( ARC_NORTH ), 2 ], [ ...middle( SOUTH_WEST ), 1 ] ] );
		assert.deepEqual( [ today.worlds.earth.dropins, today.worlds.earth.places ], [ 10, 4 ] );
		const arc = SPOTS.find( spot => spot.id === 'arc' );
		const [ first, second, third, ...rest ] = today.worlds.earth.top;
		assert.deepEqual( first, { lat: arc.lat, lon: arc.lon, n: 5, days: 1, cells: [ middle( ARC ), middle( ARC_NORTH ) ], name: 'Arc de Triomphe', region: arc.region, link: '/?spot=arc', featured: true } );
		assert.deepEqual( [ second.name, second.n, second.cells ], [ 'Golden Gate Bridge', 4, [ middle( GOLDEN ) ] ] );
		assert.deepEqual( [ third.name, third.n, third.featured, third.cells ], [ '1 km SW of Arc de Triomphe', 1, false, [ middle( SOUTH_WEST ) ] ] );
		assert.equal( new URLSearchParams( third.link.slice( 2 ) ).get( 'at' ), middle( SOUTH_WEST ).join( ',' ) );
		assert.deepEqual( rest, [] );
		// The week: the Arc's north cell's busy day too; on at least as many days as its busiest cell.
		const week = await ask( 7 );
		assert.deepEqual( week.worlds.earth.top.map( place => [ place.name, place.n, place.days ] ), [ [ 'Arc de Triomphe', 11, 2 ], [ 'Golden Gate Bridge', 4, 1 ], [ '1 km SW of Arc de Triomphe', 1, 1 ] ] );

	} );

	test( 'where people drop in: the admin page\'s map and top places, named from the game\'s places and the towns, for a day, a week or a month; ADMIN_EMAILS only, ADMIN_LOOKS a minute; rows older than two years go', async () => {

		const ADMIN_PLACES = PASS_DAY + 150 * DAY;
		const dayAt = time => new Date( time ).toISOString().slice( 0, 10 );
		const row = ( time, key, n ) => {

			const { world, row: cellRow, column } = checkCell( key );
			return `( '${ dayAt( time ) }', '${ world }', ${ cellRow }, ${ column }, ${ n } )`;

		};
		const NEAR_LYON = cellOf( 'earth', 45.84, 4.95 );
		const PACIFIC = cellOf( 'earth', 0, - 150 );
		const NEAR_COPERNICUS = cellOf( 'moon', 12.6, - 20.08 );
		server.d1( `INSERT INTO dropins_daily ( day, world, cell_row, cell_column, n ) VALUES
			${ row( ADMIN_PLACES, GOLDEN, 5 ) }, ${ row( ADMIN_PLACES, LYON, 3 ) }, ${ row( ADMIN_PLACES, NEAR_LYON, 1 ) }, ${ row( ADMIN_PLACES, PACIFIC, 1 ) },
			${ row( ADMIN_PLACES, TYCHO, 2 ) }, ${ row( ADMIN_PLACES, NEAR_COPERNICUS, 1 ) },
			${ row( ADMIN_PLACES - DAY, GOLDEN, 2 ) }, ${ row( ADMIN_PLACES - 10 * DAY, LYON, 50 ) },
			${ row( ADMIN_PLACES - 729 * DAY, PARIS, 4 ) }, ${ row( ADMIN_PLACES - 731 * DAY, PARIS, 9 ) }` );
		const chief = await signIn( { sub: '1093', email: 'chief@example.com', name: 'Chief' }, { time: ADMIN_PLACES } );
		const ask = ( days, cookie = chief.cookie ) => call( server, `/api/admin/dropins${ days === undefined ? '' : `?days=${ days }` }`, { headers: cookie ? { Cookie: cookie } : {}, time: ADMIN_PLACES } );

		// Signed out, or not an admin: nothing.
		assert.equal( ( await ask( 7, null ) ).status, 401 );
		const eve = await signIn( { sub: '1094', email: 'eve.places@example.com', name: 'Eve' }, { time: ADMIN_PLACES } );
		const refused = await ask( 7, eve.cookie );
		assert.equal( refused.status, 403 );
		assert.doesNotMatch( refused.text, /Lyon|Golden/ );

		// Today: each world's cells, the most first, and the top places named, with the game's link.
		const today = await ask( 1 );
		assert.equal( today.status, 200, today.text );
		assert.equal( today.headers.get( 'Cache-Control' ), 'no-store' );
		const { from, to, first, cell, kept, worlds } = today.json;
		assert.deepEqual( [ from, to, cell, kept ], [ dayAt( ADMIN_PLACES ), dayAt( ADMIN_PLACES ), CELL, 730 ] );
		assert.ok( first <= dayAt( ADMIN_PLACES - 729 * DAY ), first );
		const middle = key => {

			const { world, row: cellRow, column } = checkCell( key );
			const { lat, lon } = cellMiddle( world, cellRow, column );
			return [ lat, lon ];

		};
		assert.deepEqual( worlds.earth.heat, [ [ ...middle( GOLDEN ), 5 ], [ ...middle( LYON ), 3 ], ...[ PACIFIC, NEAR_LYON ].map( key => [ ...middle( key ), 1 ] ) ] );
		assert.deepEqual( [ worlds.earth.dropins, worlds.earth.places, worlds.moon.dropins, worlds.moon.places ], [ 10, 4, 3, 2 ] );
		const [ golden, lyon, ...rest ] = worlds.earth.top;
		// A start spot at its own pin, with its cells (here one).
		const spot = SPOTS.find( one => one.id === 'golden-gate' );
		assert.deepEqual( golden, { lat: spot.lat, lon: spot.lon, n: 5, days: 1, cells: [ middle( GOLDEN ) ], name: 'Golden Gate Bridge', region: 'San Francisco, USA', link: '/?spot=golden-gate', featured: true } );
		assert.deepEqual( [ lyon.name, lyon.region, lyon.featured ], [ 'Lyon', 'Rhône-Alpes, France', false ] );
		assert.equal( new URLSearchParams( lyon.link.slice( 2 ) ).get( 'name' ), 'Lyon' );
		assert.deepEqual( new URLSearchParams( lyon.link.slice( 2 ) ).get( 'at' ), middle( LYON ).join( ',' ) );
		assert.deepEqual( rest.map( place => place.name ).sort(), [ '0.00° N, 150.00° W', '12 km NE of Lyon' ] );
		const [ tycho, copernicus ] = worlds.moon.top;
		assert.deepEqual( [ tycho.name, tycho.region, tycho.link, tycho.featured ], [ 'Tycho crater', '85 km across, bright rays', '/?spot=moon-tycho', true ] );
		assert.deepEqual( [ copernicus.name, copernicus.region, copernicus.featured ], [ '91 km N of Copernicus crater', '', false ] );
		assert.deepEqual( Object.fromEntries( new URLSearchParams( copernicus.link.slice( 2 ) ) ), { at: middle( NEAR_COPERNICUS ).join( ',' ), name: '91 km N of Copernicus crater', world: 'moon' } );

		// The week: today's and yesterday's added up, with on how many days; the month: Lyon's busy day too.
		const week = ( await ask( 7 ) ).json;
		assert.deepEqual( [ week.from, week.worlds.earth.top[ 0 ].name, week.worlds.earth.top[ 0 ].n, week.worlds.earth.top[ 0 ].days ], [ dayAt( ADMIN_PLACES - 6 * DAY ), 'Golden Gate Bridge', 7, 2 ] );
		const month = ( await ask( 30 ) ).json;
		assert.deepEqual( month.worlds.earth.top.slice( 0, 2 ).map( place => [ place.name, place.n, place.days ] ), [ [ 'Lyon', 53, 2 ], [ 'Golden Gate Bridge', 7, 2 ] ] );
		// A year at most; and asked, rows older than two years go (as the play stats' do).
		const year = ( await ask( 9999 ) ).json;
		assert.equal( year.from, dayAt( ADMIN_PLACES - 364 * DAY ) );
		assert.equal( ( await ask( 'x' ) ).json.from, dayAt( ADMIN_PLACES - 29 * DAY ) );
		for ( let tries = 0; server.d1( `SELECT day FROM dropins_daily WHERE day = '${ dayAt( ADMIN_PLACES - 731 * DAY ) }'` ).length && tries < 20; tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );
		assert.deepEqual( server.d1( `SELECT day, n FROM dropins_daily WHERE day < '${ dayAt( ADMIN_PLACES - 700 * DAY ) }'` ), [ { day: dayAt( ADMIN_PLACES - 729 * DAY ), n: 4 } ] );

		// ADMIN_LOOKS: 30 asks a minute for an account, five of them asked already (its windows are
		// the clock's minutes, so a burst can run into the next one: at least the rest of the 30 before
		// the first turned away, and one within two minutes' worth). Today's answer is kept (below), so
		// these read nothing, but they're counted all the same: the account and its asks are checked
		// before an answer kept is given.
		const looks = [];
		while ( looks.length < 61 && looks.at( - 1 )?.status !== 429 ) looks.push( await ask( 1 ) );
		const statuses = looks.map( res => res.status );
		assert.equal( statuses.at( - 1 ), 429, statuses.join( ' ' ) );
		assert.ok( statuses.length - 1 >= 25 && statuses.slice( 0, - 1 ).every( status => status === 200 ), statuses.join( ' ' ) );
		assert.ok( looks.slice( 0, - 1 ).every( res => res.headers.get( 'X-Dropins-Cache' ) === 'hit' ) );
		assert.equal( looks.at( - 1 ).headers.get( 'Retry-After' ), '60' );
		assert.doesNotMatch( looks.at( - 1 ).text, /Lyon|Golden/ );

	} );

	test( 'where people drop in: an admin look\'s answer is kept 10 minutes (an hour past a month) for its period and day, given only to the owner, so the same look again reads nothing', async () => {

		// (A day of its own, 90 days and more after the other tests' places.)
		const KEPT_DAY = PASS_DAY + 300 * DAY;
		const add = ( time, key, n ) => {

			const { world, row, column } = checkCell( key );
			server.d1( `INSERT INTO dropins_daily ( day, world, cell_row, cell_column, n ) VALUES ( '${ dayOf( time ) }', '${ world }', ${ row }, ${ column }, ${ n } )
				ON CONFLICT ( world, day, cell_row, cell_column ) DO UPDATE SET n = n + excluded.n` );

		};
		const boss = await signIn( { sub: '1091', email: 'boss@example.com', name: 'Boss' }, { time: KEPT_DAY } );
		const ask = ( days, after, cookie = boss.cookie ) => call( server, `/api/admin/dropins?days=${ days }`, { headers: cookie ? { Cookie: cookie } : {}, time: KEPT_DAY + after } );
		const seen = res => [ res.status, res.headers.get( 'X-Dropins-Cache' ), res.json?.worlds?.earth.dropins ];
		add( KEPT_DAY, GOLDEN, 2 );
		assert.deepEqual( seen( await ask( 1, 0 ) ), [ 200, 'miss', 2 ] );
		// More drop-ins since: the look within 10 minutes is the one kept; after, it's worked out again.
		add( KEPT_DAY, LYON, 3 );
		assert.deepEqual( seen( await ask( 1, 5 * MINUTE ) ), [ 200, 'hit', 2 ] );
		// Kept or not, only for the owner: signed out, or anyone else, nothing.
		assert.equal( ( await ask( 1, 5 * MINUTE, null ) ).status, 401 );
		const eve = await signIn( { sub: '1097', email: 'eve.kept@example.com', name: 'Eve' }, { time: KEPT_DAY } );
		const refused = await ask( 1, 5 * MINUTE, eve.cookie );
		assert.equal( refused.status, 403 );
		assert.doesNotMatch( refused.text, /Golden/ );
		assert.deepEqual( seen( await ask( 1, 11 * MINUTE ) ), [ 200, 'miss', 5 ] );
		// Each period its own; one longer than a month an hour.
		assert.deepEqual( seen( await ask( 7, 11 * MINUTE ) ), [ 200, 'miss', 5 ] );
		assert.deepEqual( seen( await ask( 90, 11 * MINUTE ) ), [ 200, 'miss', 5 ] );
		add( KEPT_DAY, GOLDEN, 1 );
		assert.deepEqual( seen( await ask( 90, 40 * MINUTE ) ), [ 200, 'hit', 5 ] );
		assert.deepEqual( seen( await ask( 7, 40 * MINUTE ) ), [ 200, 'miss', 6 ] );
		assert.deepEqual( seen( await ask( 90, 72 * MINUTE ) ), [ 200, 'miss', 6 ] );
		// The next day, afresh.
		add( KEPT_DAY + DAY, GOLDEN, 4 );
		assert.deepEqual( seen( await ask( 7, DAY ) ), [ 200, 'miss', 10 ] );

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
				GOOGLE_CLIENT_ID: '',
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

	// SUPPORTER_PAYMENT_LINK is wrangler.drive.jsonc's, a live link: real payments, live events.
	test( 'only checkouts through SUPPORTER_PAYMENT_LINK_ID count', async () => {

		assert.equal( ( await webhook( server, checkout( 'elsewhere', { link: 'plink_1SomeOtherLink', live: true } ) ) ).status, 200 );
		assert.equal( ( await webhook( server, checkout( 'nolink', { link: null, live: true } ) ) ).status, 200 );
		assert.equal( ( await webhook( server, checkout( 'ours', { live: true } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT checkout_session FROM purchases' ).map( row => row.checkout_session ), [ 'cs_test_ours' ] );

	} );

	test( 'with a live link, a test-mode payment (a test card, free) never gives the pass, nor a test refund takes it', async () => {

		// What a test-mode endpoint's secret, set here by mistake, would bring.
		assert.equal( ( await webhook( server, checkout( 'testcard' ) ) ).status, 200 );
		const unmarked = checkout( 'unmarked' );
		delete unmarked.livemode;
		assert.equal( ( await webhook( server, unmarked ) ).status, 200 );
		assert.equal( ( await webhook( server, refund( 'ours' ) ) ).status, 200 );
		assert.equal( ( await webhook( server, dispute( 'ours', 'withdrawn' ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT checkout_session, status, refunded_at FROM purchases' ), [ { checkout_session: 'cs_test_ours', status: 'paid', refunded_at: null } ] );
		assert.deepEqual( server.d1( 'SELECT COUNT(*) AS n FROM reversals' ), [ { n: 0 } ] );
		// A live refund does.
		assert.equal( ( await webhook( server, refund( 'ours', { live: true } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT status FROM purchases' ), [ { status: 'refunded' } ] );

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

// DriveLimits by itself (limits.js), its SQLite storage stood in for by node:sqlite's: what can't be
// seen through one Worker instance, which stops asking for a visit once it's told it's done.
describe( 'DriveLimits\' drop-in places by itself', () => {

	test( 'a visit is heard DROPIN_ASKS_PER_VISIT times a day: past that, nothing more of it is counted, whichever Worker instance asks', async () => {

		await loadWorker();
		const { DriveLimits } = await import( '../worker/drive/limits.js' );
		const db = new DatabaseSync( ':memory:' );
		const sql = { exec: ( query, ...values ) => {

			const rows = db.prepare( query ).all( ...values ).map( row => ( { ...row } ) );
			return { toArray: () => rows, one: () => rows[ 0 ] };

		} };
		const limits = new DriveLimits( { storage: { sql, transactionSync: run => run() } }, { TURNSTILE_SECRET: PASS_SECRET } );
		const now = Date.UTC( 2026, 10, 16, 12 );
		const ask = cells => limits.places( '198.51.100.77', { now, visit: 'A'.repeat( 22 ), since: now - HOUR, cells, daily: 100, perVisitor: 100, perVisit: 10, gap: 10000, asks: 3 } );
		const X = cellOf( 'earth', 33, 44 );
		const Y = cellOf( 'earth', 34, 44 );
		assert.deepEqual( await ask( [ X ] ), { cells: [ X ], full: { earth: false, moon: false }, done: false } );
		assert.deepEqual( await ask( [ X ] ), { cells: [], full: { earth: false, moon: false }, done: false } );
		// Its third: done, though it has places to spare.
		assert.deepEqual( await ask( [ X ] ), { cells: [], full: { earth: false, moon: false }, done: true } );
		// Asked again (by another Worker instance, which hasn't heard): a new place isn't counted.
		assert.deepEqual( await ask( [ Y ] ), { cells: [], full: { earth: false, moon: false }, done: true } );
		assert.deepEqual( db.prepare( 'SELECT count, asks FROM place_visits' ).all().map( row => ( { ...row } ) ), [ { count: 1, asks: 4 } ] );

	} );

} );

describe( 'World Drive Worker with the key set as Google_maps_api', () => {

	test( 'takes the key under that name in any case, still only after Turnstile and the caps', async () => {

		const worker = await loadWorker();
		const counted = [];
		const limits = { visit: async ip => ( counted.push( ip ), { ok: true, left: 3 } ), liveOpen: async () => ( { open: true, spent: 1 } ) };
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
			assert.deepEqual( await config.json(), { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, googleClientId: '', live: true }, name );

			const failed = await ask( { ...env, TURNSTILE_SECRET: FAIL_SECRET }, '198.51.100.30' );
			assert.equal( failed.status, 403, name );
			assert.ok( ! ( await failed.text() ).includes( MAPS_KEY ), name );

			const passed = await ask( env, '198.51.100.31' );
			assert.equal( passed.status, 200, name );
			const { visit: token, ...rest } = await passed.json();
			assert.deepEqual( rest, { mapsKey: MAPS_KEY, left: 3 }, name );
			assert.match( token, EARTH_TOKEN );

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

describe( 'World Drive Worker asking whether driving with others is open today', () => {

	test( '/api/config: live while the budget lasts, asked at most every 30 s; spent, liveReason says so and it isn\'t asked again that day; DriveLimits failing, off with liveReason \'unknown\'; a budget of 0 or LIVE off: off', async () => {

		const worker = await loadWorker();
		const asked = [];
		let answer = { open: true, spent: 1 };
		const limits = {
			liveOpen: async options => {

				asked.push( options );
				if ( answer instanceof Error ) throw answer;
				return answer;

			},
		};
		const env = { TEST_CLOCK: 'header', LIVE_DAILY_BUDGET: '1234', LIMITS: { idFromName: id => id, get: () => limits } };
		const config = async ( time, more = {} ) => {

			const res = await worker.fetch( new Request( 'https://worlddrive.app/api/config', { headers: { 'X-Test-Time': String( time ) } } ), { ...env, ...more }, {} );
			const { live, liveReason } = await res.json();
			return { live, liveReason };

		};
		const day = Date.UTC( 2030, 5, 1, 12 );
		assert.deepEqual( await config( day ), { live: true, liveReason: undefined } );
		assert.deepEqual( asked, [ { now: day, budget: 1234 } ] );
		// An open answer holds for 30 s from when it was given (anyone can ask, and every page load
		// does): not asked again till then.
		for ( const later of [ 1, 10000, 29999 ] ) assert.deepEqual( await config( day + later ), { live: true, liveReason: undefined } );
		assert.equal( asked.length, 1 );
		await config( day + 30000 );
		assert.equal( asked.length, 2 );
		// Unset, it's 40,000 (a budget of its own, asked about afresh).
		await config( day + 30000, { LIVE_DAILY_BUDGET: undefined } );
		assert.deepEqual( [ asked.length, asked.at( - 1 ).budget ], [ 3, 40000 ] );

		// DriveLimits failing: off, to be safe, with liveReason 'unknown' (a page turned away tries
		// again rather than stopping).
		const realError = console.error;
		const logged = [];
		console.error = ( ...args ) => logged.push( args.join( ' ' ) );
		try {

			answer = new Error( 'DriveLimits is down' );
			assert.deepEqual( await config( day + MINUTE ), { live: false, liveReason: 'unknown' } );
			assert.deepEqual( logged, [ 'Live budget check Error DriveLimits is down' ] );

		} finally {

			console.error = realError;

		}

		// Spent: off, saying why, and this Worker doesn't ask again that day (an ask is a request too).
		answer = { open: false, spent: 1234 };
		assert.deepEqual( await config( day + 2 * MINUTE ), { live: false, liveReason: 'budget' } );
		const asks = asked.length;
		assert.deepEqual( await config( day + 11 * HOUR ), { live: false, liveReason: 'budget' } );
		assert.equal( asked.length, asks );
		// The next day it asks again.
		answer = { open: true, spent: 1 };
		assert.deepEqual( await config( day + DAY ), { live: true, liveReason: undefined } );
		assert.equal( asked.length, asks + 1 );
		// A budget of 0, or LIVE off: off, without asking.
		assert.deepEqual( await config( day + DAY, { LIVE_DAILY_BUDGET: '0' } ), { live: false, liveReason: undefined } );
		assert.deepEqual( await config( day + DAY, { LIVE: 'off' } ), { live: false, liveReason: undefined } );
		assert.equal( asked.length, asks + 1 );

	} );

	test( '/api/config: page loads arriving together as the answer runs out ask DriveLimits once in this Worker instance, the others open as it last heard; an ask that never comes back is given up on after 5 s', async () => {

		const worker = await loadWorker();
		let asked = 0;
		let hold = null;
		const limits = {
			liveOpen: async () => {

				asked ++;
				await hold;
				return { open: true, spent: 1 };

			},
		};
		const env = { TEST_CLOCK: 'header', LIMITS: { idFromName: id => id, get: () => limits } };
		const config = async time => ( await ( await worker.fetch( new Request( 'https://worlddrive.app/api/config', { headers: { 'X-Test-Time': String( time ) } } ), env, {} ) ).json() ).live;
		const day = Date.UTC( 2030, 6, 1, 12 );
		assert.equal( await config( day ), true );
		assert.equal( asked, 1 );
		// 30 s on: 20 at once, DriveLimits taking a while to say.
		let release;
		hold = new Promise( resolve => release = resolve );
		const burst = Array.from( { length: 20 }, () => config( day + 30000 ) );
		await new Promise( resolve => setTimeout( resolve, 20 ) );
		release();
		assert.deepEqual( new Set( await Promise.all( burst ) ), new Set( [ true ] ) );
		assert.equal( asked, 2 );
		// An ask that never comes back: open meanwhile, as last heard, and 5 s on it asks again.
		hold = new Promise( () => {} );
		config( day + 60000 );
		await new Promise( resolve => setTimeout( resolve, 10 ) );
		assert.deepEqual( [ await config( day + 64999 ), asked ], [ true, 3 ] );
		hold = null;
		assert.deepEqual( [ await config( day + 65000 ), asked ], [ true, 4 ] );

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

	test( 'are their address, or for IPv6 its /64, however it\'s written; for the drop-in places, its /48', () => {

		const of = ( ip, prefix ) => addressOf( new Request( 'https://worlddrive.app/api/visit', { headers: ip ? { 'CF-Connecting-IP': ip } : {} } ), prefix );
		assert.equal( of( '203.0.113.7' ), '203.0.113.7' );
		for ( const ip of [ '2001:db8:1234:5678:9abc:def0:1:2', '2001:DB8:1234:5678::1', '2001:0db8:1234:5678:0000:0000:0000:0001' ] ) assert.equal( of( ip ), '2001:db8:1234:5678::/64', ip );
		assert.equal( of( '2001:db8::' ), '2001:db8:0:0::/64' );
		assert.equal( of( '::ffff:192.0.2.1' ), '::ffff:192.0.2.1' );
		assert.equal( of( '' ), 'unknown' );
		// The drop-in places' visitors (dropins.js): every /64 of a /48 alike; an IPv4 address as ever.
		assert.equal( VISITOR_PREFIX, 48 );
		for ( const ip of [ '2001:db8:1234:5678:9abc:def0:1:2', '2001:DB8:1234:ffff::1', '2001:0db8:1234::' ] ) assert.equal( of( ip, VISITOR_PREFIX ), '2001:db8:1234::/48', ip );
		assert.equal( of( '2001:db8::1', VISITOR_PREFIX ), '2001:db8:0::/48' );
		assert.equal( of( '203.0.113.7', VISITOR_PREFIX ), '203.0.113.7' );

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

describe( 'Play stats\' counts', () => {

	test( 'a referrer is only its host, and this site\'s own or none is direct', () => {

		assert.equal( referrerOf( '', 'worlddrive.app' ), 'direct' );
		assert.equal( referrerOf( 'https://worlddrive.app/drive/furka-pass', 'worlddrive.app' ), 'direct' );
		assert.equal( referrerOf( 'https://www.Google.com/search?q=my+street', 'worlddrive.app' ), 'google.com' );
		assert.equal( referrerOf( 'android-app://com.reddit.frontpage/', 'worlddrive.app' ), 'com.reddit.frontpage' );
		assert.equal( referrerOf( 'not a url', 'worlddrive.app' ), null );

	} );

	test( 'load times in buckets, and counts held to what a post may add', () => {

		assert.deepEqual( [ 0, 1999, 2000, 9999, 25000 ].map( loadBucket ), [ 'under 2 s', 'under 2 s', '2-5 s', '5-10 s', 'over 20 s' ] );
		assert.deepEqual( checkCounts( { 'play:go-kart': 500, 'play:muscle-car': 500, 'party:made': 9 } ), [ [ 'play', 'go-kart', 500 ], [ 'play', 'muscle-car', 100 ], [ 'party', 'made', 5 ] ] );
		assert.equal( checkCounts( null ), null );
		assert.equal( checkCounts( 'x' ), null );
		assert.deepEqual( checkCounts( { 'constructor:x': 1, '__proto__:x': 1, 'toString:all': 1 } ), [] );

	} );

	test( 'the funnel, devices, searches, drop-in times and problems: only their own keys, each held to what a post may add', () => {

		assert.deepEqual( FUNNEL, [ 'globe', 'pin', 'dropin', 'driving', 'drove_1m', 'drove_10m', 'drove_30m' ] );
		assert.deepEqual( checkCounts( Object.fromEntries( [ ...FUNNEL, 'drove_2m', 'Globe' ].map( step => [ `funnel:${ step }`, 1 ] ) ) ), FUNNEL.map( step => [ 'funnel', step, 1 ] ) );
		// (Each step once a visit: seven in a post at most, all of them together.)
		assert.deepEqual( checkCounts( { 'funnel:globe': 5, 'funnel:pin': 5 } ), [ [ 'funnel', 'globe', 5 ], [ 'funnel', 'pin', 2 ] ] );
		assert.deepEqual( checkCounts( Object.fromEntries( [ ...DEVICES, 'watch' ].map( device => [ `device:${ device }`, 1 ] ) ) ), [ [ 'device', 'phone', 1 ] ] );
		assert.deepEqual( checkCounts( Object.fromEntries( [ ...SEARCHES, 'Furka Pass', '46.57, 8.41' ].map( kind => [ `search:${ kind }`, 30 ] ) ) ), [ [ 'search', 'earth', 30 ], [ 'search', 'moon', 10 ] ] );
		assert.deepEqual( checkCounts( Object.fromEntries( [ ...PROBLEMS, 'other' ].map( problem => [ `problem:${ problem }`, 1 ] ) ) ), PROBLEMS.map( problem => [ 'problem', problem, 1 ] ) );
		assert.deepEqual( checkCounts( { 'world:moon': 25, 'world:earth': 1, 'play_world:moon': 700, 'play_world:earth': 9, 'level_up:all': 11 } ), [ [ 'world', 'moon', 20 ], [ 'play_world', 'moon', 600 ], [ 'level_up', 'all', 10 ] ] );
		assert.deepEqual( checkCounts( { 'board:open': 1, 'board:named': 1, 'board:x': 1, 'pass:open': 1, 'pass:buy': 1, 'pass:refund': 1 } ), [ [ 'board', 'open', 1 ], [ 'board', 'named', 1 ], [ 'pass', 'open', 1 ], [ 'pass', 'buy', 1 ] ] );
		assert.deepEqual( [ 0, 4999, 5000, 19999, 20000, 39999, 40000, 1e6 ].map( dropinBucket ), [ 'under 5 s', 'under 5 s', '5-10 s', '10-20 s', '20-40 s', '20-40 s', 'over 40 s', 'over 40 s' ] );
		assert.deepEqual( checkCounts( Object.fromEntries( [ 'under 5 s', '5-10 s', '10-20 s', '20-40 s', 'over 40 s', '1 s' ].map( bucket => [ `dropin_time:${ bucket }`, 1 ] ) ) ).length, 5 );

	} );

	test( 'driving time passes the funnel\'s 1, 10 and 30 minutes once each; a device is told by its pointer and screen', () => {

		assert.deepEqual( droveSteps( 0, 59.9 ), [] );
		assert.deepEqual( droveSteps( 59.9, 60 ), [ 'drove_1m' ] );
		assert.deepEqual( droveSteps( 60, 61 ), [], 'passed already' );
		assert.deepEqual( droveSteps( 599.95, 1800.05 ), [ 'drove_10m', 'drove_30m' ] );
		assert.deepEqual( droveSteps( 1800, 99999 ), [] );
		// A mouse or a trackpad is a computer, whatever its screen; a finger, a tablet from 600 px across
		// its shorter side, else a phone.
		assert.equal( deviceOf( { coarse: false, width: 390, height: 844 } ), 'computer' );
		assert.equal( deviceOf( { coarse: true, width: 390, height: 844 } ), 'phone' );
		assert.equal( deviceOf( { coarse: true, width: 844, height: 390 } ), 'phone' );
		assert.equal( deviceOf( { coarse: true, width: 820, height: 1180 } ), 'tablet' );
		assert.equal( deviceOf( { coarse: true, width: 1366, height: 1024 } ), 'tablet' );
		for ( const device of [ 'computer', 'phone', 'tablet' ] ) assert.equal( METRICS.device.key( device ), device );

	} );

	test( 'every count a page can make fits in a post: MAX_COUNTS of the longest, and PLACES_PER_POST drop-in places, well under the Worker\'s 8 KB', () => {

		// Every key of every metric, as the page names them, and a referring site as long as one can be.
		const rides = [ 'go-kart', ...LIBRARY_VEHICLES, ...DRIVE_CARS, ...PASS_RIDES ];
		const keysOf = {
			load: [ 'a'.repeat( 30 ) + '.' + 'b'.repeat( 33 ) ], load_time: [ 'under 2 s', '2-5 s', '5-10 s', '10-20 s', 'over 20 s' ], load_ms: [ 'total' ],
			dropin: [ ...SPOTS.map( spot => spot.id ), 'other', 'moon' ], ride: rides, play: rides, play_with_others: [ 'all' ], garage_open: [ 'all' ], garage_edit: LOOK_PARTS,
			party: [ 'made', 'joined' ], funnel: FUNNEL, device: DEVICES, world: [ 'moon' ], play_world: [ 'earth', 'moon' ], search: SEARCHES,
			dropin_time: [ 'under 5 s', '5-10 s', '10-20 s', '20-40 s', 'over 40 s' ], problem: PROBLEMS, board: [ 'open', 'named' ], pass: [ 'open', 'buy' ], level_up: [ 'all' ],
		};
		assert.deepEqual( Object.keys( keysOf ).sort(), Object.keys( METRICS ).sort(), 'every metric' );
		const names = Object.entries( keysOf ).flatMap( ( [ metric, keys ] ) => keys.map( key => {

			assert.equal( METRICS[ metric ].key( key ), key, `${ metric }:${ key }` );
			return `${ metric }:${ key }`;

		} ) );
		// The longest MAX_COUNTS of them, each with the most it may hold, and a visit's token.
		const longest = names.sort( ( a, b ) => b.length - a.length ).slice( 0, MAX_COUNTS );
		// With as many drop-in places as a post carries, the longest there are (the Earth's equator's
		// last cells).
		const places = Array.from( { length: PLACES_PER_POST }, ( _, i ) => cellOf( 'earth', 0.004, 179.99 - i * 0.01 ) );
		assert.ok( places.every( place => place.length === 'earth:10007:40029'.length ), places.join( ' ' ) );
		const body = JSON.stringify( { visit: `v1.${ 'x'.repeat( 22 ) }.1800000000.${ 'y'.repeat( 43 ) }`, counts: Object.fromEntries( longest.map( name => [ name, 120000 ] ) ), places } );
		assert.ok( new TextEncoder().encode( body ).length < 8192 * 0.8, `${ body.length } bytes` );

	} );

} );

describe( 'Where people drop in: the cells', () => {

	test( 'a cell is about a kilometre each way at every latitude on both worlds, and holds what\'s in it', () => {

		for ( const world of [ 'earth', 'moon' ] ) {

			for ( let lat = - 89.95; lat < 90; lat += 7.3 ) {

				for ( const lon of [ - 179.99, - 37.2, 0, 81.7, 179.99 ] ) {

					const cell = checkCell( cellOf( world, lat, lon ) );
					assert.ok( cell, `${ world } ${ lat } ${ lon }` );
					const middle = cellMiddle( world, cell.row, cell.column );
					// The next row's and column's middles are a kilometre off (but a pole's few cells, a
					// little more), and anything in the cell is within its half-diagonal of its middle.
					const north = cellMiddle( world, cell.row + 1, 0 );
					assert.ok( Math.abs( metresOn( world, middle.lat, 0, north.lat, 0 ) - CELL ) < 2, `${ world } ${ lat } rows` );
					const east = cellMiddle( world, cell.row, cell.column + 1 );
					const across = metresOn( world, middle.lat, middle.lon, east.lat, east.lon );
					assert.ok( Math.abs( across - CELL ) < ( Math.abs( lat ) > 89.9 ? 200 : 2 ), `${ world } ${ lat }: ${ across } m across` );
					assert.ok( metresOn( world, lat, lon, middle.lat, middle.lon ) <= CELL * 0.75, `${ world } ${ lat } ${ lon } far from its middle` );
					assert.equal( cellOf( world, middle.lat, middle.lon ), cell.key );

				}

			}

		}

		// Both sides of the 180th meridian are one cell, and so are the poles' points round them.
		assert.equal( cellOf( 'earth', 10, 180 ), cellOf( 'earth', 10, - 180 ) );
		assert.equal( cellOf( 'earth', 90, 0 ), cellOf( 'earth', 89.9999, 0 ) );
		assert.equal( cellOf( 'earth', 37.8199, - 122.4783 ), 'earth:14212:5052' );
		assert.equal( cellOf( 'moon', - 43.31, - 11.36 ), 'moon:1415:3720' );

	} );

	test( 'only the grid\'s cells are taken, each with a drop-in in the same post, at most PLACES_PER_POST', () => {

		for ( const bad of [ null, 5, '', 'earth:1:1:1', 'earth:-1:0', 'earth:20015:0', 'earth:20014:3', 'moon:5458:0', 'moon:0:4', 'mars:1:1', 'Earth:1:1', 'earth:1.5:1', 'earth: 1:1', 'earth:123456:1', '48.87,2.30' ] ) {

			assert.equal( checkCell( bad ), null, String( bad ) );

		}

		assert.deepEqual( checkCell( 'earth:007:1' ), { world: 'earth', row: 7, column: 1, key: 'earth:7:1' } );
		assert.equal( cellOf( 'mars', 1, 1 ), null );
		assert.equal( cellOf( 'earth', 91, 1 ), null );
		assert.equal( cellOf( 'earth', Number.NaN, 1 ), null );

		const golden = cellOf( 'earth', 37.8199, - 122.4783 );
		const tycho = cellOf( 'moon', - 43.31, - 11.36 );
		const keys = places => places.map( place => place.key );
		assert.deepEqual( checkPlaces( undefined, [] ), [] );
		assert.equal( checkPlaces( golden, [] ), null );
		assert.equal( checkPlaces( Array( PLACES_PER_POST + 1 ).fill( golden ), [ [ 'dropin', 'other', 20 ] ] ), null );
		assert.deepEqual( keys( checkPlaces( [ golden, tycho ], [ [ 'dropin', 'golden-gate', 1 ] ] ) ), [ golden ] );
		assert.deepEqual( keys( checkPlaces( [ golden, tycho ], [ [ 'dropin', 'moon', 1 ] ] ) ), [ tycho ] );
		assert.deepEqual( keys( checkPlaces( [ golden, golden, tycho ], [ [ 'dropin', 'other', 2 ], [ 'dropin', 'moon', 1 ] ] ) ), [ golden, tycho ] );
		assert.deepEqual( keys( checkPlaces( [ golden ], [ [ 'play', 'go-kart', 60 ] ] ) ), [] );

	} );

	test( 'a cell is named from the game\'s places, else the towns, else its coordinates, across the 180th meridian too', () => {

		const towns = readTowns( readFileSync( new URL( '../drive/public/places/towns.tsv', import.meta.url ), 'utf8' ) );
		assert.ok( towns.count > 7000 );
		const named = ( world, lat, lon, list = towns ) => nameCell( world, lat, lon, list );
		assert.deepEqual( named( 'earth', 37.8166, - 122.4817 ), { name: 'Golden Gate Bridge', region: 'San Francisco, USA', link: '/?spot=golden-gate', featured: true } );
		assert.equal( named( 'earth', 48.8604, 2.2896 ).link, '/?at=48.86%2C2.2945&name=Eiffel+Tower&region=Paris%2C+France&heading=236' );
		assert.equal( named( 'earth', 45.7577, 4.8337 ).name, 'Lyon' );
		assert.equal( named( 'earth', 45.8386, 4.9505 ).name, '12 km NE of Lyon' );
		assert.equal( named( 'earth', 45.8386, 4.9505, null ).name, '45.84° N, 4.95° E' );
		assert.deepEqual( named( 'earth', - 0.5, - 150 ), { name: '0.50° S, 150.00° W', region: '', link: '/?at=-0.5%2C-150', featured: false } );
		// A cell beside a start spot's own, and not at the edge of its pin, is named by how far from it
		// (with a link to the cell, not the spot); one its pin is at the edge of is the spot's.
		const golden = checkCell( cellOf( 'earth', 37.8199, - 122.4783 ) );
		const west = cellMiddle( 'earth', golden.row, golden.column - 1 );
		assert.deepEqual( named( 'earth', west.lat, west.lon ), { name: '1 km W of Golden Gate Bridge', region: 'San Francisco, USA', link: `/?at=${ west.lat }%2C${ west.lon }&name=1+km+W+of+Golden+Gate+Bridge&region=San+Francisco%2C+USA`, featured: false } );
		assert.equal( named( 'earth', 48.8739, 2.2962 ).link, '/?spot=arc' );
		// The Moon's places: one by itself, one some way off it (with no region: a crater's words
		// aren't true of a place beside it), across the 180th meridian from Daedalus.
		assert.equal( named( 'moon', 26.13, 3.63 ).link, '/?spot=moon-apollo-15' );
		const offDaedalus = named( 'moon', - 5.9, - 179.9 );
		assert.deepEqual( [ offDaedalus.name, offDaedalus.region ], [ '21 km E of Daedalus crater', '' ] );
		assert.match( offDaedalus.link, /world=moon/ );
		// What a page would get from the link: the place pinned, by name.
		const link = new URLSearchParams( named( 'earth', 45.8386, 4.9505 ).link.slice( 2 ) );
		assert.deepEqual( Object.fromEntries( link ), { at: '45.8386,4.9505', name: '12 km NE of Lyon', region: 'Rhône-Alpes, France' } );

	} );

	test( 'topCells and topPlaces (for challenges): a world\'s most dropped-in cells and places over a period, the most first, then those on the most days', async () => {

		// D1's shape (prepare( sql ).bind( ...values ).all() giving { results }) over node:sqlite, with
		// the table as its migration makes it.
		const db = new DatabaseSync( ':memory:' );
		db.exec( readFileSync( new URL( '../worker/drive/migrations/0005_dropins.sql', import.meta.url ), 'utf8' ) );
		const asked = [];
		const d1 = { prepare: sql => ( { bind: ( ...values ) => ( { all: async () => {

			asked.push( { sql, values } );
			return { results: db.prepare( sql ).all( ...values ).map( row => ( { ...row } ) ) };

		} } ) } ) };
		const add = ( day, key, n ) => {

			const { world, row, column } = checkCell( key );
			db.prepare( 'INSERT INTO dropins_daily ( day, world, cell_row, cell_column, n ) VALUES ( ?, ?, ?, ?, ? )' ).run( day, world, row, column, n );

		};
		const A = cellOf( 'earth', 10, 10 );
		const B = cellOf( 'earth', 20, 20 );
		const C = cellOf( 'earth', 30, 30 );
		const MOON = cellOf( 'moon', 10, 10 );
		// A: 6 on one day; B: 6 over three days, so before A; C: 2. And C busy outside the period, and
		// the Moon's own.
		add( '2026-11-10', A, 6 );
		for ( const day of [ '2026-11-10', '2026-11-11', '2026-11-12' ] ) add( day, B, 2 );
		add( '2026-11-12', C, 2 );
		add( '2026-11-09', C, 50 );
		add( '2026-11-13', C, 50 );
		add( '2026-11-11', MOON, 9 );
		const period = { from: '2026-11-10', to: '2026-11-12' };
		const keys = cells => cells.map( cell => [ `${ cell.world }:${ cell.row }:${ cell.column }`, cell.n, cell.days ] );
		const earth = await topCells( d1, { world: 'earth', ...period } );
		assert.deepEqual( keys( earth ), [ [ B, 6, 3 ], [ A, 6, 1 ], [ C, 2, 1 ] ] );
		// One query, reading that world's rows for those days by the table's key and no others.
		const [ { sql, values } ] = asked;
		const plan = db.prepare( `EXPLAIN QUERY PLAN ${ sql }` ).all( ...values ).map( row => row.detail );
		assert.ok( plan.includes( 'SEARCH dropins_daily USING PRIMARY KEY (world=? AND day>? AND day<?)' ), plan.join( '; ' ) );
		assert.ok( ! plan.some( detail => /^SCAN dropins_daily/.test( detail ) ), plan.join( '; ' ) );
		const { row, column } = checkCell( B );
		assert.deepEqual( [ earth[ 0 ].lat, earth[ 0 ].lon ], Object.values( cellMiddle( 'earth', row, column ) ) );
		// Each end of the period counted, nothing past it; one day by itself.
		assert.deepEqual( keys( await topCells( d1, { world: 'earth', from: '2026-11-12', to: '2026-11-13' } ) ), [ [ C, 52, 2 ], [ B, 2, 1 ] ] );
		assert.deepEqual( keys( await topCells( d1, { world: 'earth', from: '2026-11-10', to: '2026-11-10' } ) ), [ [ A, 6, 1 ], [ B, 2, 1 ] ] );
		// The Moon's own; a world that isn't one is an error.
		assert.deepEqual( keys( await topCells( d1, { world: 'moon', ...period } ) ), [ [ MOON, 9, 1 ] ] );
		await assert.rejects( topCells( d1, { world: 'mars', ...period } ), /No world mars/ );
		// At least one, and at most 2,000.
		for ( const most of [ 1, 0, - 3, 'x' ] ) assert.deepEqual( keys( await topCells( d1, { world: 'earth', ...period, most } ) ), [ [ B, 6, 3 ] ], String( most ) );
		for ( let i = 0; i < 2100; i ++ ) add( '2026-11-20', cellOf( 'earth', - 60 + i * 0.01, 100 ), 1 );
		assert.equal( ( await topCells( d1, { world: 'earth', from: '2026-11-20', to: '2026-11-20', most: 5000 } ) ).length, 2000 );
		assert.equal( ( await topCells( d1, { world: 'earth', from: '2026-11-20', to: '2026-11-20' } ) ).length, 25 );

		// topPlaces: a start spot's cells one place (the Arc de Triomphe's, its pin 5 m from its cell's
		// edge), named, with the game's link; the rest named by the towns given, or coordinates.
		const ARC = cellOf( 'earth', 48.8738, 2.2962 );
		const ARC_NORTH = cellOf( 'earth', 48.8739, 2.2962 );
		add( '2026-11-21', ARC, 2 );
		add( '2026-11-21', ARC_NORTH, 2 );
		add( '2026-11-21', cellOf( 'earth', 0, - 150 ), 3 );
		add( '2026-11-21', cellOf( 'earth', 45.7577, 4.8337 ), 1 );
		const towns = readTowns( readFileSync( new URL( '../drive/public/places/towns.tsv', import.meta.url ), 'utf8' ) );
		const day = { world: 'earth', from: '2026-11-21', to: '2026-11-21' };
		const places = await topPlaces( d1, day, towns );
		assert.deepEqual( places.map( place => [ place.name, place.n, place.cells.length, place.featured ] ), [ [ 'Arc de Triomphe', 4, 2, true ], [ '0.00° N, 150.00° W', 3, 1, false ], [ 'Lyon', 1, 1, false ] ] );
		assert.equal( places[ 0 ].link, '/?spot=arc' );
		assert.deepEqual( ( await topPlaces( d1, { ...day, most: 1 } ) ).map( place => place.name ), [ 'Arc de Triomphe' ] );
		assert.match( ( await topPlaces( d1, day ) )[ 2 ].name, /^45\.76° N, 4\.83° E$/ );
		// The featured places alone (what a challenge picked by itself should be from: the busy cells
		// that aren't featured can be pushed up by many addresses), the busiest first, even past cells
		// busier than they are.
		add( '2026-11-21', cellOf( 'earth', 37.8199, - 122.4783 ), 1 );
		add( '2026-11-21', cellOf( 'earth', 10, 10 ), 9 );
		const featured = await topPlaces( d1, { ...day, featuredOnly: true }, towns );
		assert.deepEqual( featured.map( place => [ place.name, place.n, place.featured ] ), [ [ 'Arc de Triomphe', 4, true ], [ 'Golden Gate Bridge', 1, true ] ] );
		assert.deepEqual( ( await topPlaces( d1, { ...day, featuredOnly: true, most: 1 } ) ).map( place => place.name ), [ 'Arc de Triomphe' ] );

	} );

	test( 'the towns: read through the site\'s own files with or without a request (a scheduled challenge has none), and no region with letters Natural Earth lost', async () => {

		const text = readFileSync( new URL( '../drive/public/places/towns.tsv', import.meta.url ), 'utf8' );
		// No request, so no request's address: the site's own stands in, and the ASSETS binding is asked
		// for the file by its path.
		const fetched = [];
		const env = { ASSETS: { fetch: async request => {

			fetched.push( new URL( request.url ).pathname );
			return new Response( text );

		} } };
		const towns = await townsFor( env );
		assert.ok( towns?.count > 7000 );
		assert.deepEqual( fetched, [ '/places/towns.tsv' ] );
		// Read once per Worker instance.
		assert.equal( await townsFor( env, new URL( 'https://worlddrive.app/api/admin/dropins' ) ), towns );
		assert.equal( fetched.length, 1 );
		assert.equal( nameCell( 'earth', 45.8386, 4.9505, towns ).name, '12 km NE of Lyon' );
		// Natural Earth lost letters of some regions' names ("H? Chí Minh city"): those are their
		// country's alone, and none is left with a "?" (scripts/make-towns.mjs).
		const regions = text.slice( 0, text.indexOf( '\n\n' ) ).split( '\n' );
		assert.deepEqual( regions.filter( region => region.includes( '?' ) ), [] );
		assert.ok( ! text.includes( '?' ) );
		const saigon = nameCell( 'earth', 10.78, 106.7, towns );
		assert.deepEqual( [ saigon.name, saigon.region ], [ 'Ho Chi Minh City', 'Vietnam' ] );
		assert.equal( new URLSearchParams( saigon.link.slice( 2 ) ).get( 'region' ), 'Vietnam' );

	} );

	test( 'the About dialog says what\'s kept of an address with a place: a keyed hash for the day, which Cloudflare\'s backups can hold 30 days more', () => {

		const page = readFileSync( new URL( '../drive/index.html', import.meta.url ), 'utf8' );
		const said = page.match( /<p>To see how the game is played,[^<]*<\/p>/ )?.[ 0 ] ?? '';
		assert.match( said, /a keyed hash of their address and the place is kept that day and then deleted/ );
		assert.match( said, /Cloudflare's backups of the game's storage can hold it for up to 30 days more, and only someone with the game's own secret key could check an address against it/ );
		assert.doesNotMatch( said, /held that day only/ );

	} );

} );

describe( 'Where people drop in: the page\'s posts', () => {

	test( 'a post that doesn\'t get through keeps its places for the next with their drop-ins, as many as a post carries; one that does, never again this visit', async () => {

		// The page's stats with a stand-in for fetch, its timer and the page's events standing still.
		const answers = [ 429, 204, 503 ];
		const posts = [];
		const send = async ( url, init ) => {

			posts.push( JSON.parse( init.body ) );
			return { status: answers.shift() ?? 204 };

		};
		const globals = [ 'setInterval', 'document', 'addEventListener' ];
		const saved = Object.fromEntries( globals.map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) );
		Object.assign( globalThis, { setInterval: () => 0, document: { addEventListener() {} }, addEventListener() {} } );
		let stats;
		try {

			stats = createStats( { visit: 'v1.page-test', fetch: send } );

		} finally {

			for ( const name of globals ) {

				if ( saved[ name ] ) Object.defineProperty( globalThis, name, saved[ name ] );
				else delete globalThis[ name ];

			}

		}

		const EIFFEL = cellOf( 'earth', 48.8584, 2.2945 );
		const TIMES_SQUARE = cellOf( 'earth', 40.758, - 73.9855 );
		stats.add( 'dropin', 'other' );
		stats.dropped( 'earth', 48.8584, 2.2945 );
		await stats.post();
		assert.deepEqual( posts[ 0 ], { visit: 'v1.page-test', counts: { 'dropin:other': 1 }, places: [ EIFFEL ] } );
		// Turned away just now (429): kept, in front of the next drop-in's, with the drop-ins.
		assert.deepEqual( stats.places, [ EIFFEL ] );
		stats.add( 'dropin', 'manhattan' );
		stats.dropped( 'earth', 40.758, - 73.9855 );
		await stats.post();
		assert.deepEqual( posts[ 1 ], { visit: 'v1.page-test', counts: { 'dropin:other': 1, 'dropin:manhattan': 1 }, places: [ EIFFEL, TIMES_SQUARE ] } );
		// Through: never sent again this visit, however often dropped in at.
		stats.add( 'dropin', 'other' );
		stats.dropped( 'earth', 48.8584, 2.2945 );
		assert.deepEqual( stats.places, [] );
		// After a failed post (503 here) with more than a post carries waiting, no more than that.
		for ( let i = 0; i < PLACES_PER_POST; i ++ ) {

			stats.add( 'dropin', 'other' );
			stats.dropped( 'earth', 10 + i * 0.1, 20 );

		}

		await stats.post();
		const failed = posts[ 2 ].places;
		assert.equal( failed.length, PLACES_PER_POST );
		stats.add( 'dropin', 'other' );
		stats.dropped( 'earth', 12, 20 );
		assert.deepEqual( stats.places, failed );
		await stats.post();
		assert.deepEqual( posts[ 3 ].places, failed );
		assert.equal( posts[ 3 ].counts[ 'dropin:other' ], 2 + PLACES_PER_POST );

	} );

} );

describe( 'The look that travels', () => {

	test( 'every part a page sends is kept, the underglow and the horn too; anything else is left out; a bad one is turned away', () => {

		const look = { colour: 'candy', finish: 'shift', decal: 'camo', rim: 'chrome', glow: 'rainbow', boost: 'comet', flame: 'blue', trail: 'sparkle', smoke: 'white', horn: 'fanfare', number: 42 };
		assert.deepEqual( LOOK_PARTS, [ 'colour', 'finish', 'decal', 'rim', 'glow', 'boost', 'flame', 'trail', 'smoke', 'horn' ] );
		assert.deepEqual( checkLook( look ), look );
		// A page from before the underglow and the horn sends neither: what it sends is all there is.
		assert.deepEqual( checkLook( { colour: 'red', number: 7 } ), { colour: 'red', number: 7 } );
		// A part from a newer page is left out; an id this one doesn't know passes (the pages that
		// don't know it draw their own default), as long as it's an id.
		assert.deepEqual( checkLook( { glow: 'aurora', horn: 'kazoo', sparkles: 'yes', toString: 'x' } ), { glow: 'aurora', horn: 'kazoo' } );
		for ( const bad of [ { glow: 7 }, { horn: 'Air Horn!' }, { glow: 'x'.repeat( 25 ) }, { horn: '' }, { glow: [ 'pink' ] }, null, [ 'glow' ], 'pink' ] ) assert.equal( checkLook( bad ), null, JSON.stringify( bad ) );

	} );

} );
