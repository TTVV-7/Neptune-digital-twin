// npm run test:drive-worker: World Drive's Worker (worker/drive/) against `wrangler dev` on this
// machine, with a throwaway Durable Object. Turnstile's documented test secrets stand in for the
// real one, a made-up Maps key for the real one, and a small server here answers as Turnstile's
// siteverify does for those test secrets and as Nominatim does, so nothing reaches Cloudflare,
// Google or OpenStreetMap. Checks: the key only ever comes back from a visit that passed Turnstile
// and was under the caps; the caps for everyone and per visitor, counted at once and starting again
// at midnight UTC; visitors stored only as hashes; same-origin and JSON checks; the search's
// validation, cache and one-request-a-second limit; and www going to worlddrive.app.
// TEST_DRIVE_WORKER_PORT=8796 moves the two wrangler servers (that port and the next).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { register } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startWorker } from './worker-harness.mjs';

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
		assert.deepEqual( json, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true } );
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
		assert.deepEqual( json, { mapsKey: MAPS_KEY, left: PER_VISITOR - 1 } );
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
		assert.deepEqual( json, { turnstileSiteKey: '0x4AAAAAAFs3k5sgUIQHSuGC', mapsOn: false } );

	} );

	test( 'a failed Turnstile check is a 403, with no key', async () => {

		const res = await visit( server, { ip: '198.51.100.9' } );
		assert.equal( res.status, 403 );
		assert.equal( res.json.error, 'The robot check didn\'t pass' );
		assert.equal( verifications.at( - 1 ).secret, FAIL_SECRET );

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
			assert.deepEqual( await config.json(), { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true }, name );

			const failed = await ask( { ...env, TURNSTILE_SECRET: FAIL_SECRET }, '198.51.100.30' );
			assert.equal( failed.status, 403, name );
			assert.ok( ! ( await failed.text() ).includes( MAPS_KEY ), name );

			const passed = await ask( env, '198.51.100.31' );
			assert.equal( passed.status, 200, name );
			assert.deepEqual( await passed.json(), { mapsKey: MAPS_KEY, left: 3 }, name );

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
