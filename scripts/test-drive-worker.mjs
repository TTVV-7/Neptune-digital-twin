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
// grid itself, on every world (Mars's cells only with Mars's drop-ins: no other key lets them
// through). Visit tokens stay as the Worker before them read them, so a rollback keeps visits; the
// Moon and Mars are never limited, and a world that isn't one is the Earth. And the look a car
// travels with to the others in its room (live-protocol.js's checkLook, which the rooms use): every
// part a page sends, the underglow and the horn too, kept, anything else left out, a bad one turned
// away. And challenges: the fastest the game goes worked out from its own numbers; periods turning
// over at midnight UTC, on Monday and at a month's end; routes laid out as their shapes say, the
// Moon's and Mars's off their steep ground, each on its own heights; the rotation round the places,
// never twice in a row nor a day's place its week's or month's (nor a week's either month it's in),
// over years and with several keys, the same in every instance and another with another key; a time
// written only while its challenge is open, checked in the write; nine live, three on each world,
// fixed in D1 as they're first asked for (no more than three checked on their ground an ask), and
// staying so; times taken from a player with a visit of the right kind (an Earth challenge's an
// Earth visit), only bests kept, the boards with names and levels, each way of cheating turned away
// (too fast, out of order, missing points, longer than the visit, another period's, bad tokens, the
// wrong secret), too often (a player's 10 s, a visitor's day, then held till midnight writing
// nothing), the same run posted again answered as taken, the owner's runs off the boards, the cache
// and CHALLENGE_LOOKS; past boards kept with each player's final place, cached no longer than live
// ones, and a run finished just before midnight taken in the minute after; and the admin page's
// routes (ADMIN_EMAILS only): picks ahead fixing their period, back to the rotation, a live one
// changed only after a warning and then a new board, the old kept apart, nothing replaced where
// nothing changes, and busy places approved and unapproved.
// And username and password accounts: the rules for both, PBKDF2-SHA-256 (RFC 7914's vector) at
// 100,000 iterations, DriveLimits' tries per address and per username (counted as they're checked,
// so a burst sent at once gets no more; a robot check and a short wait, never a lock) kept only as
// salted hashes, every refusal costing 100,000 iterations however PASSWORD_ITERATIONS is set,
// migration 0008 on top of the others, signing up and in (a wrong password and a stranger alike, in
// answer and in time), taken and look-alike usernames, the name filter, changing the password (other
// sessions signed out), hashing again at a raised count, linking both ways and refusing a Google
// account with its own progress or pass, fresh proof (Google's token, the password) for every
// change to how an account signs in, the owner's accounts Google only, unlinking keeping a way in
// (two at once too), the pass and the player the same either way, signing out everywhere, and the
// admin page's counts by kind.
// TEST_DRIVE_WORKER_PORT=8796 moves the seven wrangler servers (that port and the next six).

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';
import { sessionCookies } from '../worker/sessions.js';
import { MAX_SCORE, RATE, SCORING, maxRate } from '../worker/drive/scores.js';
import { DRIVE_CARS, LIBRARY_VEHICLES, PASS_RIDES, WORKS_RIDES } from '../src/drive-app/catalog.js';
import { ACHIEVEMENTS, PLACINGS, shownTo } from '../src/drive-app/achievement-rules.js';
import { addressOf } from '../worker/drive/settings.js';
import { purchaseFor, purchaseSettings } from '../worker/drive/supporter.js';
import { VISIT_HOURS, makeVisit } from '../worker/drive/visits.js';
import { DEVICES, FUNNEL, MAX_COUNTS, METRICS, PROBLEMS, SEARCHES, checkCounts, deviceOf, dropinBucket, droveSteps, loadBucket, referrerOf } from '../src/drive-app/stats-protocol.js';
import { LOOK_PARTS, checkLook } from '../src/drive-app/live-protocol.js';
import { SPOTS } from '../src/drive-app/places.js';
import { CELL, PLACES_PER_POST, cellMiddle, cellOf, checkCell, checkPlaces, metresOn } from '../src/drive-app/dropin-cells.js';
import { VISITOR_PREFIX, nameCell, readTowns, topCells, topPlaces, townsFor } from '../worker/drive/dropins.js';
import { createStats } from '../src/drive-app/stats.js';
import {
	BOOSTED, COURSE, COURSES, COURSE_FASTEST, FASTEST, GRACE, HOOP_FEEL, HOOP_MISS, HOOP_NEAR, hoopNear, HOOP_STYLES, HOOP_WORLDS, KINDS, LEG_SLACK, TRICK_UP, describe as describeChallenge, fastestFor, hoopStyle, LINK_PATH, MAX_RUN, RANK_MOST, SHAPES, START_SLACK, TOP_SPEED,
	bearingTo, checkPasses, destination, kindFor, leastTime, legMinimum, makeRoute, nextPeriod, parsePeriod, periodOf, periodsAt, PERIODS, PERIOD_KINDS, randomFrom, rankText, formatTime,
} from '../src/drive-app/challenge-rules.js';
import { GROUNDS, REPOST, TIME_GAP, challengeBoard, challengeFor, challengeGhost, challengeLink, legFaults, legFaultsOn, listChallenges, lookKey, moonFaults, moonSteep, placeIn, postTime, rankIn, rotationPick, routeFaults, steepOn } from '../worker/drive/challenges.js';
import { setHeights } from '../src/drive-app/moon-height.js';
import { MOON_PLACES } from '../src/drive-app/moon-places.js';
import { MARS_PLACES } from '../src/drive-app/mars-places.js';
import { VESTA_PLACES } from '../src/drive-app/vesta-places.js';
import { CERES_PLACES } from '../src/drive-app/ceres-places.js';
import { OFF_EARTH, WORLD_IDS } from '../src/drive-app/worlds.js';
import {
	GHOST_BYTES, GHOST_DENSITY, GHOST_EVERY, GHOST_SAMPLES, GHOST_TEXT, PASS_SLACK, SAMPLE_SLACK, TURN, countFor, everyFor, ghostFault, ghostText, localOf, packGhost, readGhost, sampleTime,
} from '../src/drive-app/ghost-rules.js';
import { HANDLE, escapeHtml, handleOf, linkWords, liveKinds } from '../worker/drive/challenges.js';

const PORT = Number( process.env.TEST_DRIVE_WORKER_PORT ) || 8796;
const MAPS_KEY = 'test-maps-key-not-real';
// Turnstile's documented test secrets: always passes, always fails.
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const FAIL_SECRET = '2x0000000000000000000000000000000AA';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const DAILY = 5;
const PER_VISITOR = 2;
// A visit's token (visits.js), its id's last letter saying which kind: the Earth's, for a visit the
// Earth's caps let through; the owner's (ADMIN_EMAILS); a free world's (the Moon's, Mars's) for any
// other.
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
	let res;
	try {

		res = await fetch( server.base + path, { method, headers: sent, body, redirect: 'manual' } );

	} catch ( err ) {

		// wrangler dev can drop the first connection after its database was read from outside (server.d1,
		// as the challenges' tests look at what the Worker wrote): a GET, which changes nothing it can't
		// do again, is tried once more.
		if ( method !== 'GET' || err?.message !== 'fetch failed' ) throw err;
		await new Promise( resolve => setTimeout( resolve, 250 ) );
		res = await fetch( server.base + path, { method, headers: sent, body, redirect: 'manual' } );

	}

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
		assert.deepEqual( json, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, googleClientId: '', passwords: true, live: true, liveMoon: true, liveWorlds: { earth: { open: true }, moon: { open: true }, mars: { open: true }, vesta: { open: true }, ceres: { open: true } } } );
		assert.ok( ! text.includes( MAPS_KEY ) );

	} );

	test( 'tries with a password from one address are 10 a minute (PASSWORD_TRIES, from wrangler.drive.jsonc) before anything else is asked', async () => {

		let n = 0;
		// Each for another username, so none of them asks for a robot check.
		const tryFrom = ip => call( server, '/api/account/sign-in', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { username: `Nobody_${ ++ n }`, password: 'not a password at all' } ), ip } );
		// (The rate limiter's minutes are the wall clock's: started early in one, so the twelve are counted
		// in it.)
		const into = Date.now() % MINUTE;
		if ( into > 40 * SECOND ) await new Promise( resolve => setTimeout( resolve, MINUTE - into + 200 ) );
		const answers = [];
		// Two /64s of one /48 are one visitor.
		for ( let i = 0; i < 12; i ++ ) answers.push( await tryFrom( `2001:db8:4a:${ i % 2 }::1` ) );
		assert.deepEqual( answers.map( res => res.status ), [ ...Array( 10 ).fill( 401 ), 429, 429 ] );
		assert.deepEqual( answers[ 10 ].json, { error: 'Too many tries. Wait a minute and try again', reason: 'busy', retryAfter: 60 } );
		assert.equal( answers[ 10 ].headers.get( 'Retry-After' ), '60' );
		assert.equal( ( await tryFrom( '2001:db8:4b::1' ) ).status, 401 );

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
		assert.deepEqual( res.json, { results: [ { name: 'Furkapass, Obergoms, Wallis, Switzerland', lat: 46.5725, lon: 8.4153, type: 'mountain_pass', house: false } ], provider: 'osm', streetOnly: false } );
		assert.equal( res.headers.get( 'X-Search-Cache' ), 'miss' );
		assert.equal( res.headers.get( 'Cache-Control' ), 'public, max-age=86400' );
		const sent = searches.at( - 1 );
		assert.equal( sent.userAgent, 'WorldDrive/1.0 (+https://worlddrive.app)' );
		assert.deepEqual( sent.params, { q: 'furka pass', format: 'jsonv2', addressdetails: '1', limit: '6', 'accept-language': 'en' } );

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
		assert.deepEqual( json, { turnstileSiteKey: '0x4AAAAAAFs3k5sgUIQHSuGC', mapsOn: false, googleClientId: '', passwords: true, live: true, liveMoon: true, liveWorlds: { earth: { open: true }, moon: { open: true }, mars: { open: true }, vesta: { open: true }, ceres: { open: true } } } );

	} );

	test( 'a failed Turnstile check is a 403, with no key', async () => {

		const res = await visit( server, { ip: '198.51.100.9' } );
		assert.equal( res.status, 403 );
		assert.equal( res.json.error, 'The robot check didn\'t pass' );
		assert.equal( verifications.at( - 1 ).secret, FAIL_SECRET );
		// The Moon and Mars too: never limited, but still behind the robot check.
		for ( const world of OFF_EARTH ) {

			const free = await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN, world } ), ip: '198.51.100.9' } );
			assert.equal( free.status, 403, world );
			assert.equal( free.json.visit, undefined );

		}

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
		// Held till midnight UTC from then on by her own gap: her next try is turned away before it
		// writes anything or asks DriveLimits (what a script past the day's cap would cost otherwise,
		// one every 10 s all day), with the same word and how long till midnight.
		const midnight = ( Math.floor( ( fay.visitedAt + ( SCORES_DAILY + 1 ) * 11 * SECOND ) / DAY ) + 1 ) * DAY;
		const held = server.d1( `SELECT last_score_at, last_seen_at FROM players WHERE id = '${ fay.id }'` )[ 0 ];
		assert.equal( held.last_score_at, midnight - 10 * SECOND );
		const again = await score( fay, { score: 9990 }, { after: ( SCORES_DAILY + 3 ) * 11 * SECOND } );
		assert.deepEqual( [ again.status, again.json.error ], [ 429, 'That\'s all for today. Try again tomorrow' ] );
		assert.equal( Number( again.headers.get( 'Retry-After' ) ), Math.ceil( ( midnight - fay.visitedAt - ( SCORES_DAILY + 3 ) * 11 * SECOND ) / 1000 ) );
		assert.deepEqual( server.d1( `SELECT last_score_at, last_seen_at FROM players WHERE id = '${ fay.id }'` )[ 0 ], held );

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
const DAY_LINK = 'https://buy.stripe.com/test_dayMadeUp000000000000';
const DAY_LINK_ID = 'plink_1MadeUpDayPassLink00000';
const MONTH_LINK = 'https://buy.stripe.com/test_monthMadeUp0000000000';
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
			amount_total: 1999,
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

	return { id: `evt_refund_${ id }`, object: 'event', type: 'charge.refunded', livemode: live, data: { object: { id: `ch_${ id }`, object: 'charge', payment_intent: `pi_${ id }`, refunded: full, amount_refunded: full ? 1999 : 100 } } };

}

// A chargeback's money: taken back as it opens ('withdrawn'), or given back once it's won ('reinstated').
function dispute( id, funds ) {

	const status = funds === 'withdrawn' ? 'needs_response' : 'won';
	return { id: `evt_dispute_${ funds }_${ id }`, object: 'event', type: `charge.dispute.funds_${ funds }`, livemode: false, data: { object: { id: `dp_${ id }`, object: 'dispute', charge: `ch_${ id }`, payment_intent: `pi_${ id }`, amount: 1999, status } } };

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
				// wrangler.drive.jsonc's real links' ids aren't these tests' made-up ones: any link
				// counts here, and the day pass is its own made-up link.
				SUPPORTER_PAYMENT_LINK_ID: '',
				DAY_PASS_PAYMENT_LINK: DAY_LINK,
				SUPPORTER_MONTHLY_PAYMENT_LINK: MONTH_LINK,
				DAY_PASS_PAYMENT_LINK_ID: DAY_LINK_ID,
				STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
				SUPPORTER_EMAILS: ' Friend@Example.com, ',
				ADMIN_EMAILS: 'nobody@example.com, Boss@Example.com , chief@example.com',
				// Not wrangler.drive.jsonc's real Stripe portal link: /api/me as it is without one.
				SUPPORTER_MANAGE_LINK: '',
				// Where people drop in, held to fewer than wrangler.drive.jsonc's (dropins.js's) to see
				// each limit reached.
				DROPIN_PLACES_PER_VISIT: '4',
				DROPIN_PLACES_PER_VISITOR: '6',
				DROPIN_PLACES_DAILY: '12',
				DROPIN_ASKS_PER_VISIT: '5',
				// 8 Earth drives a visitor, not wrangler.drive.jsonc's 1, so an address here makes
				// several visits (the drop-in places' tests).
				PER_VISITOR_DAILY: '8',
				// PER_VISITOR_DAILY_SUPPORTER (30) and SUPPORTER_PRICE are wrangler.drive.jsonc's, and
				// SUPPORTER_PAYMENT_LINK_ID isn't set: the account is World Drive's own, so any paid
				// checkout on it counts.
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
		assert.deepEqual( res.json, { signedIn: false, supporter: false, purchase: { enabled: true, link: PASS_LINK, price: 'CA$19.99', monthly: { link: MONTH_LINK, price: 'CA$1.99/month' }, day: { link: DAY_LINK, price: 'CA$0.99' } } } );
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
		assert.deepEqual( alice.json, { signedIn: true, name: 'Alice Example', email: 'alice@example.com', google: true, username: null, contactEmail: '', supporter: false, purchase: { enabled: true, link: PASS_LINK, price: 'CA$19.99', monthly: { link: MONTH_LINK, price: 'CA$1.99/month' }, day: { link: DAY_LINK, price: 'CA$0.99' }, clientReferenceId: String( account.id ) } } );
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
			{ checkout_session: 'cs_test_alice', account_id: alice.id, email: 'alice@example.com', amount: 1999, currency: 'cad', payment_intent: 'pi_alice', status: 'paid', created_at: PASS_DAY, refunded_at: null },
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

	test( 'a day pass gives the pass for 24 hours from its payment, then nothing; a lifetime pass beside it lasts', async () => {

		const gus = await signIn( { sub: '1031', email: 'gus@example.com', name: 'Gus' } );
		const reference = gus.json.purchase.clientReferenceId;
		const hour = 60 * 60 * 1000;
		assert.equal( ( await webhook( server, checkout( 'gus_day', { reference, email: 'gus@example.com', link: DAY_LINK_ID } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT pass, created_at FROM purchases WHERE checkout_session = \'cs_test_gus_day\'' ), [ { pass: 'day', created_at: PASS_DAY } ] );
		const now = ( await me( gus.cookie ) ).json;
		assert.equal( now.supporter, true );
		assert.equal( now.dayPassUntil, PASS_DAY + 24 * hour );
		// Thirty drives that day, by the account, even with the address's own spent.
		const drive = time => call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json', Cookie: gus.cookie }, body: JSON.stringify( { token: TOKEN } ), ip: nextIp(), time } );
		assert.equal( ( await drive( PASS_DAY + hour ) ).json.left, 29 );
		// Still there a minute before the 24 hours are up; gone after.
		assert.equal( ( await me( gus.cookie, PASS_DAY + 24 * hour - 60000 ) ).json.supporter, true );
		const after = ( await me( gus.cookie, PASS_DAY + 24 * hour + 60000 ) ).json;
		assert.equal( after.supporter, false );
		assert.equal( after.dayPassUntil, undefined );
		// And it's the address that counts for its drives again.
		const left = ( await drive( PASS_DAY + 25 * hour ) ).json.left;
		assert.equal( left, 7 );
		// A lifetime pass bought beside it: the pass, with no end to say.
		assert.equal( ( await webhook( server, checkout( 'gus_life', { reference, email: 'gus@example.com' } ) ) ).status, 200 );
		const both = ( await me( gus.cookie ) ).json;
		assert.equal( both.supporter, true );
		assert.equal( both.dayPassUntil, undefined );
		assert.equal( ( await me( gus.cookie, PASS_DAY + 20 * DAY ) ).json.supporter, true );
		// (The suite's later tests count the purchases as they were.)
		server.d1( 'DELETE FROM purchases WHERE checkout_session IN ( \'cs_test_gus_day\', \'cs_test_gus_life\' )' );

	} );

	test( 'with only some links counted (SUPPORTER_PAYMENT_LINK_ID), the day pass\'s link still counts, as a day pass', () => {

		assert.deepEqual( purchaseFor( { GOOGLE_CLIENT_ID: CLIENT_ID, SUPPORTER_PAYMENT_LINK: PASS_LINK, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SUPPORTER_PAYMENT_LINK_ID: `${ PASS_LINK_ID }, plink_1Other`, DAY_PASS_PAYMENT_LINK: DAY_LINK, DAY_PASS_PAYMENT_LINK_ID: DAY_LINK_ID, DAY_PASS_PRICE: 'CA$0.99', SUPPORTER_PRICE: 'CA$9.99' }, null ),
			{ enabled: true, link: PASS_LINK, price: 'CA$9.99', day: { link: DAY_LINK, price: 'CA$0.99' } } );
		// Without its id, the day pass isn't offered (its checkouts couldn't be told from a lifetime pass's).
		assert.equal( purchaseFor( { GOOGLE_CLIENT_ID: CLIENT_ID, SUPPORTER_PAYMENT_LINK: PASS_LINK, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, DAY_PASS_PAYMENT_LINK: DAY_LINK }, null ).day, undefined );

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

	test( 'a subscription\'s pass lasts while Stripe says it\'s active; a legacy one-time pass stays for good', async () => {

		const dana = await signIn( { sub: '1010', email: 'dana@example.com', name: 'Dana' } );
		assert.equal( dana.json.supporter, false );
		const subscribe = ( id, sub, reference = null ) => {

			const event = checkout( id, { reference, email: `${ id }@example.com` } );
			Object.assign( event.data.object, { mode: 'subscription', subscription: sub, payment_intent: null } );
			return event;

		};
		const changed = ( sub, status, created, type = 'customer.subscription.updated' ) => ( {
			id: `evt_${ sub }_${ status }_${ created }`, object: 'event', type, livemode: false, created,
			data: { object: { id: sub, object: 'subscription', status } },
		} );
		const pass = async () => {

			const { json } = await me( dana.cookie );
			return [ json.supporter, json.subscribed ?? false ];

		};
		const T = Math.floor( PASS_DAY / 1000 );
		assert.equal( ( await webhook( server, subscribe( 'dana', 'sub_dana' ) ) ).status, 200 );
		// Dana's (as the page's client_reference_id would make it).
		server.d1( `UPDATE purchases SET account_id = ( SELECT id FROM accounts WHERE email = 'dana@example.com' ) WHERE checkout_session = 'cs_test_dana'` );
		assert.deepEqual( server.d1( 'SELECT subscription FROM purchases WHERE checkout_session = \'cs_test_dana\'' ), [ { subscription: 'sub_dana' } ] );
		assert.deepEqual( await pass(), [ true, true ] );
		// A failed renewal Stripe is still retrying keeps it; unpaid takes it away.
		assert.equal( ( await webhook( server, changed( 'sub_dana', 'past_due', T + 10 ) ) ).status, 200 );
		assert.deepEqual( await pass(), [ true, true ] );
		assert.equal( ( await webhook( server, changed( 'sub_dana', 'unpaid', T + 20 ) ) ).status, 200 );
		assert.deepEqual( await pass(), [ false, false ] );
		// An older event arriving late changes nothing.
		assert.equal( ( await webhook( server, changed( 'sub_dana', 'active', T + 15 ) ) ).status, 200 );
		assert.deepEqual( await pass(), [ false, false ] );
		// The card fixed: back. Cancelled: gone.
		assert.equal( ( await webhook( server, changed( 'sub_dana', 'active', T + 30 ) ) ).status, 200 );
		assert.deepEqual( await pass(), [ true, true ] );
		assert.equal( ( await webhook( server, changed( 'sub_dana', 'canceled', T + 40, 'customer.subscription.deleted' ) ) ).status, 200 );
		assert.deepEqual( await pass(), [ false, false ] );
		// A subscription that ended before its checkout arrived never gives the pass.
		const erin = await signIn( { sub: '1011', email: 'erin@example.com', name: 'Erin' } );
		assert.equal( ( await webhook( server, changed( 'sub_erin', 'canceled', T + 5, 'customer.subscription.deleted' ) ) ).status, 200 );
		assert.equal( ( await webhook( server, subscribe( 'erin', 'sub_erin' ) ) ).status, 200 );
		assert.equal( ( await me( erin.cookie ) ).json.supporter, false );
		// Nonsense ids and statuses are let go of.
		assert.equal( ( await webhook( server, changed( 'cus_nope', 'canceled', T + 50 ) ) ).status, 200 );
		assert.equal( ( await webhook( server, changed( 'sub_x', 'Not A Status!', T + 50 ) ) ).status, 200 );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM subscriptions WHERE id IN ( \'cus_nope\', \'sub_x\' )' )[ 0 ].n, 0 );
		// Alice's pass is a legacy one-time payment: hers for good, and no subscription to manage.
		const { json: aliceMe } = await me( alice.cookie );
		assert.equal( aliceMe.supporter, true );
		assert.equal( aliceMe.subscribed, undefined );
		// (The suite's later tests count the purchases as they were.)
		server.d1( 'DELETE FROM purchases WHERE checkout_session IN ( \'cs_test_dana\', \'cs_test_erin\' )' );

	} );

	test( 'a purchase keeps the tax in its total, NULL when Stripe sends none or nonsense', async () => {

		const bought = ( id, total_details ) => {

			const event = checkout( id, { email: 'tax@example.com' } );
			Object.assign( event.data.object, { total_details } );
			return event;

		};
		assert.equal( ( await webhook( server, bought( 'tax_some', { amount_discount: 0, amount_shipping: 0, amount_tax: 260 } ) ) ).status, 200 );
		assert.equal( ( await webhook( server, bought( 'tax_none', undefined ) ) ).status, 200 );
		assert.equal( ( await webhook( server, bought( 'tax_odd', { amount_tax: -1 } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT checkout_session, tax FROM purchases WHERE checkout_session LIKE \'cs_test_tax%\' ORDER BY 1' ), [
			{ checkout_session: 'cs_test_tax_none', tax: null },
			{ checkout_session: 'cs_test_tax_odd', tax: null },
			{ checkout_session: 'cs_test_tax_some', tax: 260 },
		] );
		server.d1( 'DELETE FROM purchases WHERE checkout_session LIKE \'cs_test_tax%\'' );

	} );

	test( 'every visit is counted for the admin page, those over a cap (sent to the Moon) too, by where it went (a link to the Moon or to Mars each its own, a plain load\'s orrery its own)', async () => {

		// On the suite's own day (others' visits that day are counted too: what these add is compared).
		const day = PASS_DAY;
		const key = new Date( day ).toISOString().slice( 0, 10 );
		const counts = () => Object.fromEntries( server.d1( `SELECT metric, key, n FROM stats_daily WHERE day = '${ key }' AND metric IN ( 'visit', 'visit_kind' )` ).map( r => [ `${ r.metric }:${ r.key }`, r.n ] ) );
		const before = counts();
		const ip = nextIp();
		const drive = body => call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN, ...body } ), ip, time: day } );
		for ( let i = 0; i < 8; i ++ ) assert.equal( ( await drive() ).status, 200 );
		assert.equal( ( await drive() ).status, 429 );
		assert.equal( ( await drive() ).status, 429 );
		assert.equal( ( await drive( { world: 'moon' } ) ).status, 200 );
		assert.equal( ( await drive( { world: 'mars' } ) ).status, 200 );
		// A plain load, which opens on the orrery (boot.js): free, and counted as the orrery's; a start
		// the Worker doesn't know is let go of (a link to the Moon, as before).
		const orrery = await drive( { world: 'moon', start: 'orrery' } );
		assert.equal( orrery.status, 200 );
		assert.equal( orrery.json.free, true );
		assert.equal( orrery.json.mapsKey, undefined );
		assert.equal( typeof orrery.json.visit, 'string' );
		assert.equal( ( await drive( { world: 'moon', start: 'nonsense' } ) ).status, 200 );
		const added = () => {

			const now = counts();
			return Object.fromEntries( Object.entries( now ).map( ( [ name, n ] ) => [ name, n - ( before[ name ] ?? 0 ) ] ).filter( ( [ , n ] ) => n ) );

		};
		for ( let tries = 0; tries < 30 && added()[ 'visit:all' ] !== 14; tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );
		assert.deepEqual( added(), { 'visit:all': 14, 'visit_kind:earth': 8, 'visit_kind:moon_visitor_cap': 2, 'visit_kind:moon_link': 2, 'visit_kind:mars_link': 1, 'visit_kind:orrery': 1 } );

	} );

	test( 'the globe\'s visit is free and never limited, counted as a visit on the globe; its Earth drive, asked for later, is counted by where it went and not as a visit again', async () => {

		const day = PASS_DAY + 3600000;
		const key = new Date( day ).toISOString().slice( 0, 10 );
		const counts = () => Object.fromEntries( server.d1( `SELECT metric, key, n FROM stats_daily WHERE day = '${ key }' AND metric IN ( 'visit', 'visit_kind' )` ).map( r => [ `${ r.metric }:${ r.key }`, r.n ] ) );
		const before = counts();
		const ip = nextIp();
		const ask = body => call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN, ...body } ), ip, time: day } );
		// As many globes as anyone likes, none of them an Earth drive: no key, and a free world's token.
		for ( let i = 0; i < 10; i ++ ) {

			const globe = await ask( { globe: true } );
			assert.equal( globe.status, 200 );
			assert.deepEqual( Object.keys( globe.json ).sort(), [ 'free', 'globe', 'visit', 'world' ] );
			assert.equal( globe.json.free, true );
			assert.equal( globe.json.world, 'earth' );
			assert.equal( globe.json.mapsKey, undefined );
			assert.match( globe.json.visit, /^v1\.[A-Za-z0-9_-]{21}m\./ );

		}

		// A free world's link wins over globe: true (its own kind).
		assert.equal( ( await ask( { globe: true, world: 'moon' } ) ).json.world, 'moon' );
		// Then the Earth's drives from the globe: the caps as ever (8 a visitor in this suite), the key,
		// and an Earth visit's token.
		for ( let i = 0; i < 8; i ++ ) {

			const earth = await ask( { fromGlobe: true } );
			assert.equal( earth.status, 200, earth.text );
			assert.equal( typeof earth.json.mapsKey, 'string' );
			assert.match( earth.json.visit, /^v1\.[A-Za-z0-9_-]{21}e\./ );

		}

		const over = await ask( { fromGlobe: true } );
		assert.equal( over.status, 429 );
		assert.equal( over.json.reason, 'visitor' );
		const added = () => {

			const now = counts();
			return Object.fromEntries( Object.entries( now ).map( ( [ name, n ] ) => [ name, n - ( before[ name ] ?? 0 ) ] ).filter( ( [ , n ] ) => n ) );

		};
		for ( let tries = 0; tries < 30 && added()[ 'visit_kind:moon_visitor_cap' ] !== 1; tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );
		// Eleven pages (ten globes and the Moon's link), not twenty: the Earth drives and the one over
		// the cap were each a page already counted.
		assert.deepEqual( added(), { 'visit:all': 11, 'visit_kind:globe': 10, 'visit_kind:moon_link': 1, 'visit_kind:earth': 8, 'visit_kind:moon_visitor_cap': 1 } );

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

	test( 'the Moon and Mars are never limited: a link to either spends no drive, and over the cap there\'s a visit for the Moon; a world that isn\'t one is the Earth; the owner is never limited', async () => {

		const ip = nextIp();
		const drive = ( { cookie, world, time = PASS_DAY } = {} ) => call( server, '/api/visit', {
			method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json', ...( cookie ? { Cookie: cookie } : {} ) },
			body: JSON.stringify( world ? { token: TOKEN, world } : { token: TOKEN } ), ip, time,
		} );
		// To the Moon or Mars: no key and nothing counted, however many times. The answer says which
		// world, that it's free, and moon: true as a page from before Mars (still in a browser's cache)
		// knows a free visit by.
		for ( let i = 0; i < 12; i ++ ) {

			for ( const world of OFF_EARTH ) {

				const res = await drive( { world } );
				assert.equal( res.status, 200, res.text );
				assert.deepEqual( Object.keys( res.json ).sort(), [ 'free', 'moon', 'visit', 'world' ] );
				assert.deepEqual( [ res.json.moon, res.json.free, res.json.world ], [ true, true, world ] );
				assert.match( res.json.visit, MOON_TOKEN );
				assert.ok( ! res.text.includes( MAPS_KEY ) );

			}

		}

		// A world that isn't one (or the Earth by name) is an Earth visit: the key, and one of the
		// address's drives.
		const pluto = await drive( { world: 'pluto' } );
		assert.deepEqual( [ pluto.status, pluto.json.mapsKey, pluto.json.left, pluto.json.moon ], [ 200, MAPS_KEY, 7, undefined ] );
		assert.match( pluto.json.visit, EARTH_TOKEN );
		assert.equal( ( await drive( { world: 'earth' } ) ).json.left, 6 );
		// Nor is a name every object has (the registry is looked in for its own worlds alone).
		for ( const [ world, left ] of [ [ '__proto__', 5 ], [ 'constructor', 4 ], [ 'toString', 3 ] ] ) {

			const res = await drive( { world } );
			assert.deepEqual( [ res.status, res.json.mapsKey, res.json.left, res.json.free ], [ 200, MAPS_KEY, left, undefined ], world );
			assert.match( res.json.visit, EARTH_TOKEN );

		}

		// So the rest of the address's 8 Earth drives are all still there.
		for ( let i = 2; i >= 0; i -- ) assert.equal( ( await drive() ).json.left, i );
		// Over the cap: no key, but a visit for the Moon (scores, stats).
		const over = await drive();
		assert.equal( over.status, 429 );
		assert.equal( over.json.reason, 'visitor' );
		assert.match( over.json.visit, MOON_TOKEN );
		assert.ok( ! over.text.includes( MAPS_KEY ) );
		// The Moon's and Mars's still open.
		assert.equal( ( await drive( { world: 'moon' } ) ).json.moon, true );
		assert.equal( ( await drive( { world: 'mars' } ) ).json.world, 'mars' );

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
		assert.match( ( await drive( { cookie: boss.cookie, world: 'mars' } ) ).json.visit, OWNER_TOKEN );

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
			'funnel:drove_5m': 1, 'funnel:': 1, 'device:watch': 1, 'device:Phone': 1, 'world:earth': 1, 'world:pluto': 1, 'play_world:pluto': 5, 'search:my street': 1,
			'search:51.5, -0.1': 1, 'dropin_time:3 s': 1, 'problem:boom': 1, 'board:close': 1, 'pass:steal': 1, 'level_up:9': 1, 'dropin:pluto': 1, 'search:pluto': 1, 'problem:pluto_failed': 1,
		} ) ).status, 204 );
		// No more than a post may add: 600 s of play, one load, the funnel's seven steps together, one device.
		assert.equal( ( await post( { 'play:go-kart': 1e9, 'load:direct': 5, 'funnel:globe': 50, 'device:computer': 3, 'device:tablet': 1 } ) ).status, 204 );
		// How far the visit got, on what, on which world, its searches (never what was typed), how long
		// the drop-in took, what went wrong, the leaderboard, the pass and levels.
		assert.equal( ( await post( {
			'funnel:pin': 1, 'funnel:dropin': 1, 'funnel:driving': 1, 'funnel:drove_1m': 1, 'device:phone': 1,
			'world:moon': 2, 'play_world:earth': 90.5, 'play_world:moon': 30, 'search:earth': 2, 'search:moon': 1, 'search:coordinates': 1, 'search:nothing': 1,
			'dropin_time:10-20 s': 1, 'problem:no_ground': 1, 'problem:drop_abandoned': 1, 'board:open': 1, 'board:named': 1, 'pass:open': 2, 'pass:buy': 1, 'level_up:all': 1,
			// And Mars's, as the Moon's.
			'dropin:mars': 1, 'world:mars': 1, 'play_world:mars': 12, 'search:mars': 3, 'problem:mars_failed': 1,
		} ) ).status, 204 );
		const day = new Date( STATS_DAY ).toISOString().slice( 0, 10 );
		assert.deepEqual( statsRows( day ), {
			'visit:all': 1, 'visit_hour:12': 1, 'visit_kind:earth': 1,
			'play:go-kart': 120 + 60 + 600, 'garage_edit:colour': 3, 'garage_edit:glow': 2, 'garage_edit:horn': 1, 'garage_open:all': 1, 'dropin:furka': 1, 'ride:go-kart': 1,
			'load:google.com': 1, 'load:direct': 1, 'load_time:2-5 s': 1, 'load_ms:total': 3456,
			'funnel:globe': FUNNEL.length, 'funnel:pin': 1, 'funnel:dropin': 1, 'funnel:driving': 1, 'funnel:drove_1m': 1, 'device:phone': 1, 'device:computer': 1,
			'world:moon': 2, 'play_world:earth': 90, 'play_world:moon': 30, 'search:earth': 2, 'search:moon': 1, 'search:coordinates': 1, 'search:nothing': 1,
			'dropin_time:10-20 s': 1, 'problem:no_ground': 1, 'problem:drop_abandoned': 1, 'board:open': 1, 'board:named': 1, 'pass:open': 2, 'pass:buy': 1, 'level_up:all': 1,
			'dropin:mars': 1, 'world:mars': 1, 'play_world:mars': 12, 'search:mars': 3, 'problem:mars_failed': 1,
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
			( 'cs_admin_1', ${ account( '1201' ) }, 'nia@example.com', 1999, 'cad', 'pi_admin_1', 'paid', ${ ADMIN_DAY - HOUR }, NULL ),
			( 'cs_admin_2', NULL, 'zed.admin@example.com', 1999, 'cad', 'pi_admin_2', 'paid', ${ ADMIN_DAY - HOUR }, NULL ),
			( 'cs_admin_3', ${ account( '1202' ) }, 'oto@example.com', 1999, 'cad', 'pi_admin_3', 'refunded', ${ ADMIN_DAY - 2 * DAY }, ${ ADMIN_DAY - DAY } ),
			( 'granted-admin', NULL, 'oto@example.com', NULL, NULL, NULL, 'granted', ${ ADMIN_DAY - 2 * DAY }, NULL ),
			( 'cs_admin_4', ${ account( '1203' ) }, 'pia@example.com', 999, 'usd', 'pi_admin_4', 'paid', ${ ADMIN_DAY - 10 * DAY }, NULL )` );
		// And the other kinds, each told apart: a 99-cent day pass Nia bought this morning (its 24 hours
		// still running, the tax in it known), a monthly pass Oto started two days ago (its subscription
		// active), Build Pro Pia bought yesterday, and a kind a later version might add.
		server.d1( `INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, payment_intent, status, created_at, refunded_at, subscription, pass, tax ) VALUES
			( 'cs_admin_day_00000001', ${ account( '1201' ) }, 'nia@example.com', 99, 'cad', 'pi_admin_5', 'paid', ${ ADMIN_DAY - 2 * HOUR }, NULL, NULL, 'day', 12 ),
			( 'cs_admin_month_000002', ${ account( '1202' ) }, 'oto@example.com', 299, 'cad', NULL, 'paid', ${ ADMIN_DAY - 2 * DAY + HOUR }, NULL, 'sub_admin_1', NULL, 39 ),
			( 'cs_admin_build_000003', ${ account( '1203' ) }, 'pia@example.com', 1500, 'cad', 'pi_admin_6', 'paid', ${ ADMIN_DAY - DAY }, NULL, NULL, 'build', NULL ),
			( 'cs_admin_odd_00000004', ${ account( '1203' ) }, 'pia@example.com', 100, 'cad', 'pi_admin_7', 'paid', ${ ADMIN_DAY - DAY - HOUR }, NULL, NULL, 'later', NULL )` );
		server.d1( `INSERT INTO subscriptions ( id, status, event_at, updated_at ) VALUES ( 'sub_admin_1', 'active', ${ ADMIN_DAY - 2 * DAY }, ${ ADMIN_DAY - 2 * DAY } )` );
		// Nia's nickname on the leaderboard, linked to her account.
		server.d1( `UPDATE players SET account_id = ${ account( '1201' ) } WHERE id = 'admin-player-01'` );
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
			// The passes by what they were, and their money (tax included) and the tax in it, by currency.
			[ today, 'purchases', 'lifetime', 2 ], [ today, 'purchases', 'day', 1 ], [ dayAt( ADMIN_DAY - 2 * DAY ), 'purchases', 'granted', 1 ], [ dayAt( ADMIN_DAY - 2 * DAY ), 'purchases', 'monthly', 1 ],
			// (Build Pro's, and a kind a later version adds, are the Build tab's or nobody's: not the game's money.)
			[ today, 'revenue', 'cad', 3998 + 99 ], [ dayAt( ADMIN_DAY - 2 * DAY ), 'revenue', 'cad', 299 ],
			[ today, 'tax', 'cad', 12 ], [ dayAt( ADMIN_DAY - 2 * DAY ), 'tax', 'cad', 39 ],
		] ) );
		assert.deepEqual( rows.map( ( [ day ] ) => day ), rows.map( ( [ day ] ) => day ).sort() );
		// The week before, added up by metric and key.
		assert.deepEqual( { ...previous, rows: sorted( previous.rows ) }, {
			from: dayAt( ADMIN_DAY - 13 * DAY ), to: dayAt( ADMIN_DAY - 7 * DAY ), first: { visit: null, funnel: null },
			rows: sorted( [ [ 'play', 'go-kart', 150 ], [ 'players', 'new', 1 ], [ 'scores', 'new_best', 1 ], [ 'accounts', 'new', 1 ], [ 'purchases', 'lifetime', 1 ], [ 'revenue', 'usd', 999 ] ] ),
		} );
		// The week's sales one by one, the newest first (the last recorded first of two at once), taken back too: what, when, what was paid, and
		// whose (the account and its nickname, or nobody yet), and never an email or a whole Stripe id.
		const nia = account( '1201' ), oto = account( '1202' );
		assert.deepEqual( res.json.sales, [
			{ at: ADMIN_DAY - HOUR, kind: 'lifetime', amount: 1999, currency: 'cad', tax: null, status: 'paid', refunded: false, subscription: null, until: null, running: false, account: null, nickname: null, ref: '' },
			{ at: ADMIN_DAY - HOUR, kind: 'lifetime', amount: 1999, currency: 'cad', tax: null, status: 'paid', refunded: false, subscription: null, until: null, running: false, account: nia, nickname: 'Admin Ada', ref: '' },
			{ at: ADMIN_DAY - 2 * HOUR, kind: 'day', amount: 99, currency: 'cad', tax: 12, status: 'paid', refunded: false, subscription: null, until: ADMIN_DAY + 22 * HOUR, running: true, account: nia, nickname: 'Admin Ada', ref: '00000001' },
			{ at: ADMIN_DAY - 2 * DAY + HOUR, kind: 'monthly', amount: 299, currency: 'cad', tax: 39, status: 'paid', refunded: false, subscription: 'active', until: null, running: false, account: oto, nickname: null, ref: 'h_000002' },
			// Given by hand to Oto's email: Oto's, as the pass is.
			{ at: ADMIN_DAY - 2 * DAY, kind: 'granted', amount: null, currency: null, tax: null, status: 'granted', refunded: false, subscription: null, until: null, running: false, account: oto, nickname: null, ref: '' },
			{ at: ADMIN_DAY - 2 * DAY, kind: 'lifetime', amount: 1999, currency: 'cad', tax: null, status: 'refunded', refunded: true, subscription: null, until: null, running: false, account: oto, nickname: null, ref: '' },
		] );
		assert.doesNotMatch( res.text, /@example\.com|pi_admin|sub_admin|cs_admin/ );
		// A day pass's 24 hours run out: no longer running.
		const later = ( await call( server, '/api/admin/stats?days=7', { headers: { Cookie: boss.cookie }, time: ADMIN_DAY + DAY } ) ).json.sales;
		assert.deepEqual( later.filter( s => s.kind === 'day' ).map( s => s.running ), [ false ] );
		// Now: three more players and accounts, three more with the pass (Nia's and Pia's bought, Oto's
		// given), and one bought by an email nobody has signed in with.
		// (All three with Google alone, so the kinds of account say so.)
		assert.deepEqual( totals, {
			players: was.players + 3, accounts: was.accounts + 3, kinds: { ...was.kinds, google: was.kinds.google + 3 }, supporters: was.supporters + 3, unclaimed: was.unclaimed + 1,
		} );
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
		assert.equal( ( await cy.post( { 'dropin:other': 6, 'dropin:moon': 1 }, [ 'earth:20015:0', 'earth:20014:3', 'pluto:1:1', 'earth:-1:0', 5, '48.87,2.30' ] ) ).status, 204 );
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

	test( 'where people drop in on Mars: a visit there (free, as the Moon\'s) posts its cells, counted under mars as its drop-ins are under dropin:mars; a Mars cell needs a Mars drop-in in the same post, whatever else the post counts', async () => {

		const day = PLACES_DAY + 13 * DAY;
		const ip = nextIp();
		const mars = await call( server, '/api/visit', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json' }, body: JSON.stringify( { token: TOKEN, world: 'mars' } ), ip, time: day } );
		assert.deepEqual( [ mars.status, mars.json.world, mars.json.free, mars.json.mapsKey ], [ 200, 'mars', true, undefined ] );
		assert.match( mars.json.visit, MOON_TOKEN );
		const post = ( counts, places, after ) => send( 'POST', '/api/stats', { visit: mars.json.visit, counts, places }, { ip, time: day + after } );
		// Curiosity's landing in Gale crater, and Olympus Mons's top, each a cell of Mars's grid (on its
		// 3,389.5 km sphere: 10,648 rows).
		const GALE = cellOf( 'mars', - 4.5895, 137.4417 );
		const OLYMPUS = cellOf( 'mars', 18.65, - 133.8 );
		assert.equal( GALE, 'mars:5052:18719' );
		assert.deepEqual( checkCell( OLYMPUS ), { world: 'mars', row: 6427, column: 2589, key: OLYMPUS } );
		assert.equal( ( await post( { 'dropin:mars': 1 }, [ GALE ], 10 * MINUTE ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ GALE ]: 1 } );
		assert.equal( statsRows( dayOf( day ) )[ 'dropin:mars' ], 1 );
		// A Mars cell with only the Moon's and the Earth's drop-ins counted beside it, or one that isn't a
		// world's: left out (its counts still counted). And an Earth cell from a Mars visit, as from the
		// Moon's: never.
		const CHAMPS = cellOf( 'earth', 48.87, 2.31 );
		assert.equal( ( await post( { 'dropin:moon': 1, 'dropin:other': 1 }, [ OLYMPUS ], 20 * MINUTE ) ).status, 204 );
		assert.equal( ( await post( { 'dropin:pluto': 1, 'dropin:other': 1 }, [ OLYMPUS, 'pluto:1:1' ], 30 * MINUTE ) ).status, 204 );
		assert.equal( ( await post( { 'dropin:other': 1 }, [ CHAMPS ], 40 * MINUTE ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ GALE ]: 1 } );
		// With its own drop-in, it's counted.
		assert.equal( ( await post( { 'dropin:mars': 1 }, [ OLYMPUS ], 50 * MINUTE ) ).status, 204 );
		assert.deepEqual( placeRows( day ), { [ GALE ]: 1, [ OLYMPUS ]: 1 } );

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
			// Each /64 its own 8 drives a day (this suite's): the second /64's first visit has 7
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

// --- username and password accounts ----------------------------------------------------------

// Wednesday 11 November 2026 at noon UTC: the accounts' Worker's day, unless a test says otherwise.
const ACCOUNT_DAY = Date.UTC( 2026, 10, 11, 12, 0, 0 );
// RFC 7914's PBKDF2-HMAC-SHA-256 test vector (section 11): "passwd", salt "salt", 1 iteration.
const PBKDF2_VECTOR = '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783';

// The PBKDF2-SHA-256 of `password` with `salt` (bytes) as the Worker makes it, base64url.
async function pbkdf2( password, salt, iterations ) {

	const key = await crypto.subtle.importKey( 'raw', encoder.encode( password ), 'PBKDF2', false, [ 'deriveBits' ] );
	return Buffer.from( await crypto.subtle.deriveBits( { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256 ) ).toString( 'base64url' );

}

// DriveLimits on node:sqlite in memory, as the drop-in places' own test has it: the object, and the
// database to look into.
async function memoryLimits() {

	await loadWorker();
	const { DriveLimits } = await import( '../worker/drive/limits.js' );
	const db = new DatabaseSync( ':memory:' );
	const sql = { exec: ( query, ...values ) => {

		const rows = db.prepare( query ).all( ...values ).map( row => ( { ...row } ) );
		return { toArray: () => rows, one: () => rows[ 0 ] };

	} };
	return { limits: new DriveLimits( { storage: { sql, transactionSync: run => run() } }, { TURNSTILE_SECRET: PASS_SECRET } ), db };

}

describe( 'Username and password rules', () => {

	test( 'usernames: 3 to 20 Latin letters, digits, _ or -, after NFKC, one whatever their case', async () => {

		const { cleanUsername, usernameKey } = await import( '../src/drive-app/password-rules.js' );
		for ( const good of [ 'abc', 'Racer_1', 'speed-demon', 'A'.repeat( 20 ), ' padded ' ] ) assert.ok( cleanUsername( good ), good );
		for ( const bad of [ 'ab', 'A'.repeat( 21 ), 'two words', 'émile', 'Rаcer', 'dot.ted', 'at@me', '', 42, null, 'x'.repeat( 65 ) ] ) assert.equal( cleanUsername( bad ), null, String( bad ) );
		// A full-width Ｒ is an R once normalised (NFKC), so it can't make a second "Racer_1".
		assert.equal( cleanUsername( 'Ｒacer＿1' ), 'Racer_1' );
		assert.equal( usernameKey( cleanUsername( 'Ｒacer＿1' ) ), usernameKey( 'RACER_1' ) );

	} );

	test( 'passwords: at least 8 characters, at most 128 bytes, not the commonest nor the username', async () => {

		const { passwordProblem, passwordText } = await import( '../src/drive-app/password-rules.js' );
		assert.equal( passwordProblem( 'correct horse battery staple' ), '' );
		assert.equal( passwordProblem( 'x9!kq2Lm' ), '' );
		assert.equal( passwordProblem( 'ünïcødé😀ok' ), '' );
		assert.match( passwordProblem( 'short1!' ), /at least 8/ );
		for ( const common of [ 'password', 'Password1', '12345678', 'qwertyuiop', 'iloveyou', 'WorldDrive', 'aaaaaaaaaaaa' ] ) assert.match( passwordProblem( common ), /commonest/, common );
		assert.match( passwordProblem( 'Racer_123', 'racer_123' ), /can't be your username/ );
		// 128 bytes is fine (a long passphrase); 129 isn't, and nor are 43 three-byte letters (129 bytes).
		assert.equal( passwordProblem( 'a'.repeat( 127 ) + 'b' ), '' );
		assert.match( passwordProblem( 'a'.repeat( 128 ) + 'b' ), /at most 128 bytes/ );
		assert.match( passwordProblem( '€'.repeat( 43 ) ), /at most 128 bytes/ );
		assert.equal( passwordProblem( 42 ), passwordProblem( null ) );
		// The same passphrase typed with a full-width letter is the same password.
		assert.equal( passwordText( 'Ｐassphrase one' ), 'Passphrase one' );

	} );

	test( 'hashing is PBKDF2-SHA-256 at the runtime\'s most, 100,000, unless set lower; on only with D1 and Turnstile', async () => {

		await loadWorker();
		const { ITERATIONS, hashPassword, iterationsFor, passwordsOn } = await import( '../worker/drive/logins.js' );
		assert.equal( ITERATIONS, 100000 );
		const vector = await hashPassword( 'passwd', encoder.encode( 'salt' ), 1 );
		assert.equal( Buffer.from( vector ).toString( 'hex' ), PBKDF2_VECTOR.slice( 0, 64 ) );
		assert.equal( iterationsFor( {} ), 100000 );
		assert.equal( iterationsFor( { PASSWORD_ITERATIONS: '20000' } ), 20000 );
		for ( const out of [ '100001', '600000', '9999', 'lots', '' ] ) assert.equal( iterationsFor( { PASSWORD_ITERATIONS: out } ), 100000, out );
		assert.equal( passwordsOn( { DB: {}, TURNSTILE_SECRET: 'x' } ), true );
		assert.equal( passwordsOn( { DB: {}, TURNSTILE_SECRET: 'x', PASSWORD_ACCOUNTS: 'off' } ), false );
		assert.equal( passwordsOn( { TURNSTILE_SECRET: 'x' } ), false );
		assert.equal( passwordsOn( { DB: {} } ), false );
		// What a hash costs here (the Worker's is measured against wrangler below): a guide only.
		const started = performance.now();
		await hashPassword( 'correct horse battery staple', new Uint8Array( 16 ), ITERATIONS );
		console.log( `# PBKDF2-SHA-256 x ${ ITERATIONS } in Node: ${ ( performance.now() - started ).toFixed( 1 ) } ms` );

	} );

	test( 'DriveLimits: tries counted as they\'re checked, then a robot check and a gap, a hard cap, kept only as salted hashes', async () => {

		const { limits, db } = await memoryLimits();
		const now = Date.UTC( 2026, 10, 12, 9 );
		const rules = { addressFails: 3, hardFails: 6, freeFails: 2, gap: 5000 };
		const check = ( ip, user, at = now, robot = false ) => limits.passwordCheck( ip, user, { now: at, robot, ...rules } );
		// Each try is counted as it's let through, with nothing to call after it: two for alice, from
		// two addresses, and the third, from a third, needs a robot check.
		assert.deepEqual( await check( '203.0.113.1', 'alice' ), { ok: true } );
		assert.deepEqual( await check( '203.0.113.2', 'alice', now + 1000 ), { ok: true } );
		assert.deepEqual( await check( '203.0.113.9', 'alice', now + 10000 ), { ok: false, reason: 'robot', visitor: false } );
		assert.deepEqual( await check( '203.0.113.9', 'alice', now + 10000, true ), { ok: true } );
		// Within the gap of this visitor's last try at alice, a few seconds' wait...
		assert.deepEqual( await check( '203.0.113.9', 'alice', now + 13000, true ), { ok: false, reason: 'wait', retryAfter: 2 } );
		// ...but never for a try from another address: a stranger's tries can't make the owner wait.
		assert.deepEqual( await check( '203.0.113.7', 'alice', now + 13000, true ), { ok: true } );
		// A try that got in is given back: the owner signing in again and again stays clear of it.
		for ( let i = 0; i < 5; i ++ ) {

			assert.deepEqual( await check( '198.51.100.1', 'bob', now + i ), { ok: true }, `bob ${ i }` );
			await limits.passwordSucceeded( '198.51.100.1', 'bob', { now: now + i } );

		}

		// A visitor's third try, whatever the usernames: from then on a robot check for each...
		await check( '203.0.113.1', 'bob' );
		await check( '203.0.113.1', 'carol' );
		// (This time it's the visitor's own tries that ask for it, so every try from it will till midnight.)
		assert.deepEqual( await check( '203.0.113.1', 'dave', now + 1000 ), { ok: false, reason: 'robot', visitor: true } );
		assert.deepEqual( await check( '203.0.113.1', 'dave', now + 1000, true ), { ok: true } );
		assert.deepEqual( await check( '203.0.113.1', 'erin', now + 1000, true ), { ok: true } );
		assert.deepEqual( await check( '203.0.113.1', 'fay', now + 1000, true ), { ok: true } );
		// ...and past the hard cap no more from it today, robot check or not; then tomorrow again.
		const out = await check( '203.0.113.1', 'gus', now + 1000, true );
		assert.equal( out.reason, 'address' );
		assert.equal( out.retryAfter, 15 * 3600 - 1 );
		assert.deepEqual( await check( '203.0.113.1', 'alice', now + 15 * HOUR ), { ok: true } );
		// Neither an address nor a username in what it keeps (and yesterday's gone).
		const kept = JSON.stringify( db.prepare( 'SELECT * FROM password_fails' ).all() );
		for ( const plain of [ '203.0.113', '198.51.100', 'alice', 'bob', 'carol' ] ) assert.ok( ! kept.includes( plain ), plain );
		assert.deepEqual( db.prepare( 'SELECT DISTINCT day FROM password_fails' ).all().map( row => row.day ), [ dayOf( now + 15 * HOUR ) ] );

	} );

	test( 'a refusal always costs the stand-in\'s 100,000 iterations, with PASSWORD_ITERATIONS lowered too, so its time never says a username is someone\'s', async () => {

		const { ITERATIONS, hashPassword, passwordSignIn } = await import( '../worker/drive/logins.js' );
		const salt = new Uint8Array( 16 ).fill( 7 );
		const hashed = async iterations => ( { account_id: 1, username: 'Real_One', password_hash: Buffer.from( await hashPassword( 'the real passphrase', salt, iterations ) ).toString( 'base64url' ), salt: Buffer.from( salt ).toString( 'base64url' ), iterations } );
		// The iterations every hash in one sign-in adds up to, and how long it took: PBKDF2 costs in
		// proportion to its iterations, so equal sums take equal time.
		const subtle = crypto.subtle;
		const deriveBits = subtle.deriveBits;
		let spent = 0;
		subtle.deriveBits = function ( params, ...rest ) {

			spent += params.iterations;
			return deriveBits.call( this, params, ...rest );

		};
		const updates = [];
		const attempt = async ( { row, username, password, iterations } ) => {

			const db = {
				prepare: sql => ( {
					bind: ( ...values ) => ( {
						first: async () => /FROM logins WHERE username_key/.test( sql ) && values[ 0 ] === 'real_one' ? row : null,
						run: async () => ( /UPDATE logins/.test( sql ) && updates.push( values ), { meta: { changes: 1 } } ),
					} ),
				} ),
				batch: async list => list.map( () => ( { meta: { changes: 1 }, results: [] } ) ),
			};
			const env = { DB: db, TURNSTILE_SECRET: 'x', ...( iterations ? { PASSWORD_ITERATIONS: String( iterations ) } : {} ) };
			const limits = { passwordCheck: async () => ( { ok: true } ), passwordSucceeded: async () => {}, passwordSignedIn: async () => ( { ok: true } ), take: async () => ( { ok: true } ) };
			const request = new Request( 'https://worlddrive.app/api/account/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.1' }, body: JSON.stringify( { username, password } ) } );
			spent = 0;
			const started = performance.now();
			let status = 200;
			try {

				await passwordSignIn( { request, env, limits, url: new URL( request.url ), now: Date.UTC( 2026, 10, 12 ) } );

			} catch ( err ) {

				status = err.status;

			}

			return { status, spent, ms: performance.now() - started };

		};

		try {

			const atMost = await hashed( ITERATIONS );
			const lowered = await hashed( 10000 );
			const tries = {
				wrong: await attempt( { row: atMost, username: 'Real_One', password: 'not the passphrase' } ),
				stranger: await attempt( { row: atMost, username: 'Nobody_Here', password: 'not the passphrase' } ),
				// PASSWORD_ITERATIONS lowered to spare CPU: an account hashed before at 100,000, one hashed
				// since at 10,000, and a username nobody has all cost the same to refuse.
				'lowered, old hash': await attempt( { row: atMost, username: 'Real_One', password: 'not the passphrase', iterations: 10000 } ),
				'lowered, new hash': await attempt( { row: lowered, username: 'Real_One', password: 'not the passphrase', iterations: 10000 } ),
				'lowered, stranger': await attempt( { row: lowered, username: 'Nobody_Here', password: 'not the passphrase', iterations: 10000 } ),
			};
			for ( const [ kind, { status, spent } ] of Object.entries( tries ) ) assert.deepEqual( { status, spent }, { status: 401, spent: ITERATIONS }, kind );
			console.log( `# refusals in Node: ${ Object.entries( tries ).map( ( [ kind, { ms } ] ) => `${ kind } ${ ms.toFixed( 1 ) } ms` ).join( ', ' ) }` );
			// The right password, lowered, costs only its own hash, and is hashed again at the lower count.
			const right = await attempt( { row: atMost, username: 'Real_One', password: 'the real passphrase', iterations: 10000 } );
			assert.equal( right.status, 200 );
			assert.equal( right.spent, ITERATIONS + 10000 );
			assert.equal( updates.at( - 1 )[ 2 ], 10000 );

		} finally {

			subtle.deriveBits = deriveBits;

		}

	} );

	test( 'PASSWORD_TRIES turns a burst away before DriveLimits is asked, and what DriveLimits said of a visitor for the day is never asked again here', async () => {

		const { passwordSignIn } = await import( '../worker/drive/logins.js' );
		const db = { prepare: () => ( { bind: () => ( { first: async () => null, run: async () => ( { meta: { changes: 1 } } ) } ) } ), batch: async list => list.map( () => ( { meta: { changes: 1 }, results: [] } ) ) };
		// Cloudflare's rate limiter, 10 a minute for each key, and DriveLimits saying what `answer` does.
		const keys = new Map();
		const tries = { limit: async ( { key } ) => ( keys.set( key, ( keys.get( key ) ?? 0 ) + 1 ), { success: keys.get( key ) <= 10 } ) };
		let answer = { ok: true };
		let checks = 0;
		const limits = { passwordCheck: async () => ( checks ++, answer ), passwordSucceeded: async () => {}, passwordSignedIn: async () => ( { ok: true } ), take: async () => ( { ok: true } ) };
		const attempt = async ( ip, { env = {}, now = Date.UTC( 2026, 10, 13, 9 ), username = 'Somebody' } = {} ) => {

			const request = new Request( 'https://worlddrive.app/api/account/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify( { username, password: 'a wrong passphrase' } ) } );
			try {

				await passwordSignIn( { request, env: { DB: db, TURNSTILE_SECRET: PASS_SECRET, PASSWORD_TRIES: tries, ...env }, limits, url: new URL( request.url ), now } );
				return { status: 200 };

			} catch ( err ) {

				return { status: err.status, reason: err.extra?.reason, retryAfter: err.headers?.[ 'Retry-After' ] };

			}

		};

		// Twelve at once from one /48 (two of its /64s): ten asked of DriveLimits, two turned away first.
		const burst = await Promise.all( Array.from( { length: 12 }, ( _, i ) => attempt( `2001:db8:5a:${ i % 2 }::1` ) ) );
		assert.deepEqual( burst.map( res => res.status ).sort(), [ ...Array( 10 ).fill( 401 ), 429, 429 ] );
		assert.deepEqual( burst.filter( res => res.status === 429 ).map( res => [ res.reason, res.retryAfter ] ), [ [ 'busy', '60' ], [ 'busy', '60' ] ] );
		assert.equal( checks, 10 );
		// The rate limiter's key is neither address nor /48 as it is, and another address has its own.
		assert.ok( [ ...keys.keys() ].every( key => /^[0-9a-f]{32}$/.test( key ) ) );
		assert.equal( ( await attempt( '2001:db8:5b::1' ) ).status, 401 );
		assert.equal( checks, 11 );

		// Past its free failures, DriveLimits asks this visitor for robot checks: said once, and from
		// then on its tries without one are turned away here, for this visitor alone...
		answer = { ok: false, reason: 'robot', visitor: true };
		assert.deepEqual( await attempt( '203.0.113.120' ), { status: 403, reason: 'robot', retryAfter: undefined } );
		for ( let i = 0; i < 5; i ++ ) assert.equal( ( await attempt( '203.0.113.120' ) ).reason, 'robot' );
		assert.equal( checks, 12 );
		// A username's robot check (not the visitor's) is remembered for this visitor and that username
		// alone: asked once, then its tries without one are turned away here...
		answer = { ok: false, reason: 'robot', visitor: false };
		for ( let i = 0; i < 5; i ++ ) assert.equal( ( await attempt( '203.0.113.121' ) ).reason, 'robot' );
		assert.equal( checks, 13 );
		// ...while another username from it, or the same from another visitor, is asked about afresh.
		answer = { ok: true };
		assert.equal( ( await attempt( '203.0.113.121', { username: 'Somebody_Else' } ) ).status, 401 );
		assert.equal( ( await attempt( '203.0.113.125' ) ).status, 401 );
		assert.equal( checks, 15 );
		// Past HARD_FAILS: a 429 till midnight from DriveLimits once, then from here.
		answer = { ok: false, reason: 'address', retryAfter: 3600 };
		assert.deepEqual( await attempt( '203.0.113.122' ), { status: 429, reason: 'address', retryAfter: '3600' } );
		assert.deepEqual( await attempt( '203.0.113.122', { now: Date.UTC( 2026, 10, 13, 9 ) + 1000 } ), { status: 429, reason: 'address', retryAfter: '3599' } );
		assert.equal( checks, 16 );
		// The next day it's a new visitor to the counts, and asked about again.
		answer = { ok: true };
		assert.equal( ( await attempt( '203.0.113.122', { now: Date.UTC( 2026, 10, 14, 9 ) } ) ).status, 401 );
		assert.equal( checks, 17 );

	} );

	test( 'signing in again and again with the right password: two DriveLimits requests and a hash each, then none at all past the day\'s 50', async () => {

		const { ITERATIONS, hashPassword, passwordSignIn, signOutEverywhere } = await import( '../worker/drive/logins.js' );
		// The real DriveLimits (in memory), each call to it counted.
		const real = ( await memoryLimits() ).limits;
		const calls = [];
		const limits = new Proxy( real, { get: ( target, name ) => typeof target[ name ] === 'function' ? ( ...args ) => ( calls.push( name ), target[ name ]( ...args ) ) : target[ name ] } );
		const salt = new Uint8Array( 16 ).fill( 3 );
		const row = { account_id: 5, username: 'Loop_Er', password_hash: Buffer.from( await hashPassword( 'my own passphrase', salt, ITERATIONS ) ).toString( 'base64url' ), salt: Buffer.from( salt ).toString( 'base64url' ), iterations: ITERATIONS };
		const account = { id: 5, google_sub: 'none:x', email: '', name: '', google: 0, username: 'Loop_Er' };
		const db = {
			prepare: sql => ( {
				bind: ( ...values ) => ( {
					first: async () => /FROM logins WHERE username_key/.test( sql ) ? ( values[ 0 ] === 'loop_er' ? row : null ) : /JOIN sessions/.test( sql ) ? account : null,
					run: async () => ( { meta: { changes: 1 } } ),
				} ),
			} ),
			batch: async list => list.map( () => ( { meta: { changes: 1 }, results: [] } ) ),
		};
		const env = { DB: db, TURNSTILE_SECRET: PASS_SECRET };
		const subtle = crypto.subtle;
		const deriveBits = subtle.deriveBits;
		let hashes = 0;
		subtle.deriveBits = function ( ...args ) {

			hashes ++;
			return deriveBits.apply( this, args );

		};
		const now = Date.UTC( 2026, 10, 15, 10 );
		const post = ( path, body, extra = {} ) => new Request( `https://worlddrive.app${ path }`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.140', ...extra }, body: JSON.stringify( body ) } );
		const outcome = async ( route, request, at ) => {

			try {

				return ( await route( { request, env, limits, url: new URL( request.url ), now: at } ) ).status;

			} catch ( err ) {

				return err.status;

			}

		};

		try {

			const statuses = [];
			const asked = [];
			const hashed = [];
			for ( let i = 0; i < 100; i ++ ) {

				const before = [ calls.length, hashes ];
				statuses.push( await outcome( passwordSignIn, post( '/api/account/sign-in', { username: 'Loop_Er', password: 'my own passphrase' } ), now + i * 6000 ) );
				asked.push( calls.length - before[ 0 ] );
				hashed.push( hashes - before[ 1 ] );

			}

			assert.deepEqual( statuses, [ ...Array( 50 ).fill( 200 ), ...Array( 50 ).fill( 429 ) ] );
			// Each sign-in: the check, then the try given back and the day's turn taken in one request.
			assert.deepEqual( calls.slice( 0, 4 ), [ 'passwordCheck', 'passwordSignedIn', 'passwordCheck', 'passwordSignedIn' ] );
			assert.deepEqual( asked.slice( 0, 50 ), Array( 50 ).fill( 2 ) );
			assert.deepEqual( hashed.slice( 0, 50 ), Array( 50 ).fill( 1 ) );
			// The 51st: DriveLimits says the day's sign-ins are used up, before any hashing...
			assert.equal( asked[ 50 ], 1 );
			assert.equal( hashed[ 50 ], 0 );
			// ...and from then on, nothing asked and nothing hashed, all day.
			assert.deepEqual( asked.slice( 51 ), Array( 49 ).fill( 0 ) );
			assert.deepEqual( hashed.slice( 51 ), Array( 49 ).fill( 0 ) );
			assert.equal( calls.length, 101 );

			// Changes alike: past the day's 30 (here signing out everywhere), DriveLimits says so once.
			const cookie = { Cookie: `__Host-wd_session=${ 'k'.repeat( 43 ) }` };
			const changed = [];
			const before = calls.length;
			for ( let i = 0; i < 40; i ++ ) changed.push( await outcome( signOutEverywhere, post( '/api/account/sign-out-everywhere', {}, cookie ), now + i * 6000 ) );
			assert.deepEqual( changed, [ ...Array( 30 ).fill( 204 ), ...Array( 10 ).fill( 429 ) ] );
			assert.equal( calls.length - before, 31 );

		} finally {

			subtle.deriveBits = deriveBits;

		}

	} );

	test( 'a username made by two at once: the batch that loses takes its account back with it', async () => {

		await loadWorker();
		const { newAccount } = await import( '../worker/drive/logins.js' );
		const sqlite = new DatabaseSync( ':memory:' );
		sqlite.exec( 'PRAGMA foreign_keys = ON' );
		const migrations = new URL( '../worker/drive/migrations/', import.meta.url );
		for ( const file of readdirSync( migrations ).sort() ) sqlite.exec( readFileSync( new URL( file, migrations ), 'utf8' ) );
		// D1's prepare, bind and batch (one transaction) on node:sqlite.
		const db = {
			prepare: sql => ( { bind: ( ...values ) => ( { sql, values } ) } ),
			batch: async list => {

				sqlite.exec( 'BEGIN' );
				try {

					const out = list.map( ( { sql, values } ) => {

						const statement = sqlite.prepare( sql );
						return /RETURNING|^\s*SELECT/i.test( sql ) ? { results: statement.all( ...values ) } : { meta: { changes: statement.run( ...values ).changes } };

					} );
					sqlite.exec( 'COMMIT' );
					return out;

				} catch ( err ) {

					sqlite.exec( 'ROLLBACK' );
					throw err;

				}

			},
		};
		const hash = { password_hash: 'h', salt: 's', iterations: 100000 };
		const first = await newAccount( db, { username: 'Twice_Made', key: 'twice_made', hash, now: 1 } );
		assert.ok( first );
		// The other got past the check for a taken username before the first was made: its insert
		// does nothing, and the account made for it is gone again in the same batch.
		assert.equal( await newAccount( db, { username: 'TWICE_MADE', key: 'twice_made', hash, now: 2 } ), null );
		assert.deepEqual( sqlite.prepare( 'SELECT id, google_sub LIKE \'none:%\' AS none FROM accounts' ).all().map( row => ( { ...row } ) ), [ { id: first, none: 1 } ] );
		assert.deepEqual( sqlite.prepare( 'SELECT account_id, username FROM logins' ).all().map( row => ( { ...row } ) ), [ { account_id: first, username: 'Twice_Made' } ] );

	} );

	test( 'migration 0008 goes on top of 0001 to 0007 with every account, session, purchase and player kept', () => {

		const db = new DatabaseSync( ':memory:' );
		db.exec( 'PRAGMA foreign_keys = ON' );
		const migrations = new URL( '../worker/drive/migrations/', import.meta.url );
		const all = readdirSync( migrations ).sort();
		const files = all.slice( 0, all.indexOf( '0008_password_logins.sql' ) + 1 );
		assert.deepEqual( files.slice( - 2 ), [ '0007_challenge_ghosts.sql', '0008_password_logins.sql' ] );
		for ( const file of files.slice( 0, - 1 ) ) db.exec( readFileSync( new URL( file, migrations ), 'utf8' ) );
		db.exec( `INSERT INTO accounts ( id, google_sub, email, name, created_at, last_login_at ) VALUES ( 7, '1001', 'alice@example.com', 'Alice', 1, 1 );
			INSERT INTO sessions ( token_hash, account_id, created_at, expires_at ) VALUES ( 'h', 7, 1, 2 );
			INSERT INTO purchases ( checkout_session, account_id, email, status, created_at ) VALUES ( 'cs_1', 7, 'alice@example.com', 'paid', 1 );
			INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at, account_id ) VALUES ( 'p', 'Alice', 'aiice', 's', 1, 1, 7 );` );
		db.exec( readFileSync( new URL( files.at( - 1 ), migrations ), 'utf8' ) );
		assert.equal( db.prepare( 'SELECT COUNT(*) AS n FROM sessions' ).get().n, 1 );
		assert.equal( db.prepare( 'SELECT account_id FROM purchases' ).get().account_id, 7 );
		assert.equal( db.prepare( 'SELECT account_id FROM players' ).get().account_id, 7 );
		db.exec( `INSERT INTO logins ( account_id, username, username_key, password_hash, salt, iterations, created_at, changed_at ) VALUES ( 7, 'Alice', 'alice', 'h', 's', 100000, 1, 1 )` );
		assert.throws( () => db.exec( `INSERT INTO logins ( account_id, username, username_key, password_hash, salt, iterations, created_at, changed_at ) VALUES ( 7, 'ALICE', 'alice', 'h', 's', 1, 1, 1 )` ) );
		// Only what's needed to sign in: no email, no address.
		assert.deepEqual( db.prepare( 'SELECT name FROM pragma_table_info( \'logins\' ) ORDER BY cid' ).all().map( row => row.name ),
			[ 'account_id', 'username', 'username_key', 'password_hash', 'salt', 'iterations', 'created_at', 'changed_at' ] );
		// An account deleted takes its login with it.
		db.exec( 'DELETE FROM accounts WHERE id = 7' );
		assert.equal( db.prepare( 'SELECT COUNT(*) AS n FROM logins' ).get().n, 0 );

	} );

	test( 'migration 0009 (achievements) goes on top of 0001 to 0008 with every player kept, their counts none yet, and a player removed taking their achievements with them', () => {

		const db = new DatabaseSync( ':memory:' );
		db.exec( 'PRAGMA foreign_keys = ON' );
		const migrations = new URL( '../worker/drive/migrations/', import.meta.url );
		const files = readdirSync( migrations ).sort();
		const at = files.indexOf( '0009_achievements.sql' );
		assert.ok( at > 0 );
		for ( const file of files.slice( 0, at ) ) db.exec( readFileSync( new URL( file, migrations ), 'utf8' ) );
		db.exec( `INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at, xp, streak ) VALUES ( 'p', 'Alice', 'aiice', 's', 1, 1, 500, 4 )` );
		db.exec( readFileSync( new URL( files[ at ], migrations ), 'utf8' ) );
		assert.deepEqual( { ...db.prepare( 'SELECT xp, streak, tallies, parties, party_marks FROM players' ).get() }, { xp: 500, streak: 4, tallies: '{}', parties: 0, party_marks: '[]' } );
		db.exec( `INSERT INTO achievements ( player_id, achievement, earned_at ) VALUES ( 'p', 'km-10', 1 )` );
		// One row an achievement a player, and nothing of an address or a name.
		assert.throws( () => db.exec( `INSERT INTO achievements ( player_id, achievement, earned_at ) VALUES ( 'p', 'km-10', 2 )` ) );
		assert.deepEqual( db.prepare( 'SELECT name FROM pragma_table_info( \'achievements\' ) ORDER BY cid' ).all().map( row => row.name ), [ 'player_id', 'achievement', 'earned_at' ] );
		db.exec( `DELETE FROM players WHERE id = 'p'` );
		assert.equal( db.prepare( 'SELECT COUNT(*) AS n FROM achievements' ).get().n, 0 );

	} );

} );

describe( 'World Drive username and password accounts', () => {

	let server;
	let keys;
	let googleKey;
	let addresses = 0;
	// A fresh address for each request that doesn't say: the per-visitor counts stay out of the way.
	const nextIp = () => `198.18.${ Math.floor( addresses / 250 ) }.${ ( addresses ++ ) % 250 + 1 }`;

	before( async () => {

		googleKey = await makeKey( 'drive-accounts-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		// Without PASSWORD_TRIES' 10 a minute from an address, so the tests can send hundreds of tries
		// from one to see what DriveLimits does with them (the World Drive Worker suite has it).
		server = await startWorker( {
			port: PORT + 6,
			config: 'wrangler.drive.jsonc',
			without: [ 'PASSWORD_TRIES' ],
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				TEST_CLOCK: 'header',
				DAILY_VISITS: '1000',
				GOOGLE_CLIENT_ID: CLIENT_ID,
				GOOGLE_JWKS_URL: keys.url,
				SUPPORTER_PAYMENT_LINK: PASS_LINK,
				// wrangler.drive.jsonc's real links' ids aren't these tests' made-up ones: any link
				// counts here, and the day pass is its own made-up link.
				SUPPORTER_PAYMENT_LINK_ID: '',
				DAY_PASS_PAYMENT_LINK: DAY_LINK,
				SUPPORTER_MONTHLY_PAYMENT_LINK: MONTH_LINK,
				DAY_PASS_PAYMENT_LINK_ID: DAY_LINK_ID,
				STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
				ADMIN_EMAILS: 'boss@example.com',
			},
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();

	} );

	const send = ( method, path, body, { cookie, ip = nextIp(), time = ACCOUNT_DAY, headers = {} } = {} ) => call( server, path, {
		method,
		headers: { Origin: server.base, 'Content-Type': 'application/json', ...( cookie ? { Cookie: cookie } : {} ), ...headers },
		body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify( body ),
		ip,
		time,
	} );
	const me = ( cookie, time = ACCOUNT_DAY ) => call( server, '/api/me', { headers: cookie ? { Cookie: cookie } : {}, time } );
	const cookieOf = res => {

		const token = /^__Host-wd_session=([\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) ?? '' )?.[ 1 ];
		return token ? `__Host-wd_session=${ token }` : null;

	};
	const signUp = async ( username, password, options = {} ) => {

		const res = await send( 'POST', '/api/account/sign-up', { username, password, token: TOKEN }, options );
		return { ...res, cookie: cookieOf( res ) };

	};
	const signIn = async ( username, password, { token, ...options } = {} ) => {

		const res = await send( 'POST', '/api/account/sign-in', { username, password, ...( token ? { token } : {} ) }, options );
		return { ...res, cookie: cookieOf( res ) };

	};
	const google = async ( claims, options = {} ) => {

		const res = await send( 'POST', '/api/session', { credential: await makeToken( googleKey, claims ) }, options );
		return { ...res, cookie: cookieOf( res ) };

	};
	const login = username => server.d1( `SELECT l.*, a.google_sub, a.email, a.name FROM logins l JOIN accounts a ON a.id = l.account_id WHERE l.username_key = '${ username.toLowerCase() }'` )[ 0 ];

	test( '/api/config says usernames and passwords are on', async () => {

		assert.equal( ( await call( server, '/api/config' ) ).json.passwords, true );

	} );

	test( 'every route is JSON from the site itself, of a sensible size and shape', async () => {

		const routes = [ [ 'POST', '/api/account/sign-up' ], [ 'POST', '/api/account/sign-in' ], [ 'POST', '/api/account/password' ], [ 'DELETE', '/api/account/password' ],
			[ 'POST', '/api/account/google' ], [ 'DELETE', '/api/account/google' ], [ 'POST', '/api/account/sign-out-everywhere' ] ];
		const body = JSON.stringify( { username: 'Someone', password: 'a long passphrase' } );
		for ( const [ method, path ] of routes ) {

			assert.equal( ( await call( server, path, { method, headers: { 'Content-Type': 'application/json' }, body } ) ).status, 403, `${ path }: no Origin` );
			assert.equal( ( await call( server, path, { method, headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body } ) ).status, 403, `${ path }: another site` );
			assert.equal( ( await call( server, path, { method, headers: { 'Content-Type': 'text/plain', Origin: server.base }, body } ) ).status, 415, `${ path }: not JSON` );
			assert.equal( ( await send( method, path, body, { headers: { 'Sec-Fetch-Site': 'cross-site' } } ) ).status, 403, `${ path }: cross-site` );

		}

		for ( const path of [ '/api/account/sign-up', '/api/account/sign-in' ] ) {

			assert.equal( ( await send( 'POST', path, { username: 'Someone', password: 'x'.repeat( 4100 ) } ) ).status, 413, `${ path }: too large` );
			assert.equal( ( await send( 'POST', path, '{nope' ) ).status, 400, `${ path }: bad JSON` );
			assert.equal( ( await send( 'POST', path, [ 'Someone', 'a long passphrase' ] ) ).status, 400, `${ path }: not an object` );

		}

		assert.equal( ( await send( 'POST', '/api/account/sign-in', { username: 42, password: 'a long passphrase' } ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/account/sign-in', { username: 'Someone' } ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/account/sign-in', { username: 'Someone', password: 'a long passphrase', token: 7 } ) ).status, 400 );
		assert.equal( ( await call( server, '/api/account/sign-in' ) ).status, 405 );
		// Those that carry Google's ID token take 16 kB, as /api/session does.
		for ( const [ method, path ] of [ [ 'POST', '/api/account/password' ], [ 'DELETE', '/api/account/password' ], [ 'POST', '/api/account/google' ], [ 'DELETE', '/api/account/google' ] ] ) {

			assert.equal( ( await send( method, path, { credential: 'x'.repeat( 16400 ) } ) ).status, 413, `${ path }: too large` );

		}

		// Signed out, the signed-in routes are 401.
		for ( const [ method, path ] of routes.slice( 2 ) ) assert.equal( ( await send( method, path, {} ) ).status, 401, path );

	} );

	test( 'signing up: a username and password checked, a robot check, then the account and a session', async () => {

		for ( const [ username, why ] of [ [ 'ab', 'short' ], [ 'way_too_long_for_a_name', 'long' ], [ 'two words', 'a space' ], [ 'Rаcer', 'a Cyrillic а' ], [ 7, 'a number' ] ] ) {

			const res = await signUp( username, 'a long passphrase' );
			assert.equal( res.status, 400, why );
			assert.match( res.json.error, /^Usernames are 3 to 20/, why );

		}

		// The nickname's filter: slurs, and names that pass for World Drive.
		for ( const username of [ 'admin', 'WorldDrive', 'support', 'the_admin_1', 'fuck_it' ] ) {

			const res = await signUp( username, 'a long passphrase' );
			assert.equal( res.status, 400, username );
			assert.equal( res.json.error, 'That username isn\'t allowed. Pick another', username );

		}

		for ( const [ password, pattern ] of [ [ 'short', /at least 8/ ], [ 'password1', /commonest/ ], [ 'Newbie_99', /username/ ], [ 'x'.repeat( 129 ), /at most 128/ ], [ null, /at most 128/ ] ] ) {

			const res = await signUp( 'Newbie_99', password );
			assert.equal( res.status, 400, String( password ) );
			assert.match( res.json.error, pattern );

		}

		const noRobot = await send( 'POST', '/api/account/sign-up', { username: 'Newbie_99', password: 'a long passphrase' } );
		assert.equal( noRobot.status, 403 );
		assert.equal( noRobot.json.reason, 'robot' );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM logins' )[ 0 ].n, 0, 'an account was made without everything right' );

		const made = await signUp( 'Racer_1', 'correct horse battery staple' );
		assert.equal( made.status, 200, made.text );
		assert.equal( made.headers.get( 'Set-Cookie' ), `${ made.cookie }; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure` );
		const signedIn = { signedIn: true, name: '', email: '', google: false, username: 'Racer_1', contactEmail: '', supporter: false };
		assert.deepEqual( { ...made.json, purchase: undefined }, { ...signedIn, purchase: undefined } );
		assert.equal( made.json.purchase.clientReferenceId, String( login( 'racer_1' ).account_id ) );
		assert.deepEqual( { ...( await me( made.cookie ) ).json, purchase: undefined }, { ...signedIn, purchase: undefined } );
		// What's kept: the username, a 16-byte salt and a 32-byte hash at 100,000 iterations, which is
		// the password's; never the password, an email or anything else.
		const row = login( 'racer_1' );
		assert.equal( row.username, 'Racer_1' );
		assert.equal( row.iterations, 100000 );
		assert.equal( Buffer.from( row.salt, 'base64url' ).length, 16 );
		assert.equal( Buffer.from( row.password_hash, 'base64url' ).length, 32 );
		assert.equal( row.password_hash, await pbkdf2( 'correct horse battery staple', Buffer.from( row.salt, 'base64url' ), 100000 ) );
		assert.match( row.google_sub, /^none:[\w-]{22}$/ );
		assert.equal( row.email, '' );
		assert.equal( row.created_at, ACCOUNT_DAY );
		assert.ok( ! JSON.stringify( server.d1( 'SELECT * FROM logins' ) ).includes( 'horse' ) );
		assert.ok( ! server.log().includes( 'horse' ), 'the password was logged' );

	} );

	test( 'usernames are one whatever their case or width: taken is taken', async () => {

		for ( const twin of [ 'racer_1', 'RACER_1', 'Ｒacer＿1' ] ) {

			const res = await signUp( twin, 'another long passphrase' );
			assert.equal( res.status, 409, twin );
			assert.equal( res.json.error, 'That username is taken' );

		}

		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM accounts WHERE google_sub LIKE \'none:%\'' )[ 0 ].n, 1, 'an account was left behind' );

	} );

	test( 'signing in: the right password, in any case of the username; a wrong one and a stranger alike', async () => {

		const right = await signIn( 'RACER_1', 'correct horse battery staple' );
		assert.equal( right.status, 200, right.text );
		assert.ok( right.cookie );
		assert.equal( right.json.username, 'Racer_1' );
		assert.equal( ( await me( right.cookie ) ).json.signedIn, true );
		// Wrong, unknown and impossible usernames: the same answer, and no cookie.
		const answers = [];
		for ( const [ username, password ] of [ [ 'Racer_1', 'correct horse battery stapler' ], [ 'Nobody_here', 'correct horse battery staple' ], [ 'no such user!', 'whatever it is' ] ] ) {

			const res = await signIn( username, password );
			assert.equal( res.status, 401, username );
			assert.equal( res.headers.get( 'Set-Cookie' ), null );
			answers.push( res.text );

		}

		assert.equal( new Set( answers ).size, 1 );
		assert.deepEqual( JSON.parse( answers[ 0 ] ), { error: 'Wrong username or password' } );
		// Last sign-in time kept on the account (the time, nothing of where from).
		await signIn( 'racer_1', 'correct horse battery staple', { time: ACCOUNT_DAY + HOUR } );
		assert.equal( server.d1( `SELECT last_login_at FROM accounts WHERE id = ${ login( 'racer_1' ).account_id }` )[ 0 ].last_login_at, ACCOUNT_DAY + HOUR );

	} );

	test( 'a stranger\'s username takes as long to be refused as a wrong password: both are hashed', async () => {

		assert.equal( ( await signUp( 'Timed_1', 'a passphrase to time' ) ).status, 200 );
		// Turns about, each a few times: the median of each.
		const times = { wrong: [], stranger: [] };
		for ( let i = 0; i < 4; i ++ ) {

			for ( const [ kind, username ] of [ [ 'wrong', 'Timed_1' ], [ 'stranger', `Stranger_${ i }` ] ] ) {

				const started = performance.now();
				// The next day each round, so the robot check never comes in.
				const res = await signIn( username, 'not the passphrase', { time: ACCOUNT_DAY + ( 10 + i ) * DAY } );
				times[ kind ].push( performance.now() - started );
				assert.equal( res.status, 401 );

			}

		}

		const median = list => list.sort( ( a, b ) => a - b )[ list.length >> 1 ];
		const [ wrong, stranger ] = [ median( times.wrong ), median( times.stranger ) ];
		console.log( `# a wrong password ${ wrong.toFixed( 1 ) } ms, a username nobody has ${ stranger.toFixed( 1 ) } ms (whole requests to wrangler dev)` );
		assert.ok( stranger > wrong * 0.5 && stranger < wrong * 2, `wrong ${ wrong } ms, stranger ${ stranger } ms` );

	} );

	test( 'a username\'s failures from many addresses ask for a robot check and a short wait, but never lock its owner out', async () => {

		const day = ACCOUNT_DAY + 2 * DAY;
		assert.equal( ( await signUp( 'Keeper_7', 'the owner\'s passphrase', { time: day } ) ).status, 200 );
		// A stranger guessing from five addresses.
		for ( let i = 0; i < 5; i ++ ) assert.equal( ( await signIn( 'keeper_7', `guess number ${ i }`, { time: day + i * SECOND } ) ).status, 401, `guess ${ i }` );
		// The sixth try needs a robot check, even with the right password...
		const asked = await signIn( 'Keeper_7', 'the owner\'s passphrase', { time: day + 10 * SECOND } );
		assert.equal( asked.status, 403 );
		assert.equal( asked.json.reason, 'robot' );
		assert.equal( asked.cookie, null );
		// ...and with one, the owner's in.
		const owner = await signIn( 'Keeper_7', 'the owner\'s passphrase', { token: TOKEN, time: day + 10 * SECOND } );
		assert.equal( owner.status, 200, owner.text );
		// The stranger, with robot checks of their own, is slowed to a try every 5 s from an address.
		const stranger = '203.0.113.71';
		assert.equal( ( await signIn( 'keeper_7', 'guess six', { token: TOKEN, ip: stranger, time: day + 20 * SECOND } ) ).status, 401 );
		const soon = await signIn( 'keeper_7', 'guess seven', { token: TOKEN, ip: stranger, time: day + 22 * SECOND } );
		assert.equal( soon.status, 429 );
		assert.equal( soon.json.reason, 'wait' );
		assert.equal( soon.headers.get( 'Retry-After' ), '3' );
		// The owner, on an address of their own, isn't kept waiting by it.
		assert.equal( ( await signIn( 'Keeper_7', 'the owner\'s passphrase', { token: TOKEN, time: day + 22 * SECOND } ) ).status, 200 );
		// The next day the username starts afresh.
		assert.equal( ( await signIn( 'Keeper_7', 'the owner\'s passphrase', { time: day + DAY } ) ).status, 200 );

	} );

	test( 'one address fails 20 times a day freely, then each try needs a robot check, and 200 at most; others, and tomorrow, are fine', async () => {

		const day = ACCOUNT_DAY + 3 * DAY;
		const ip = '2001:db8:77:1::1';
		for ( let i = 0; i < 20; i ++ ) assert.equal( ( await signIn( `Guess_${ i }`, 'a wrong password', { ip, time: day } ) ).status, 401, `try ${ i }` );
		// Another /64 of the same /48 is the same visitor: a robot check now, even with the right password...
		const asked = await signIn( 'Racer_1', 'correct horse battery staple', { ip: '2001:db8:77:2::9', time: day } );
		assert.equal( asked.status, 403 );
		assert.equal( asked.json.reason, 'robot' );
		assert.equal( ( await signIn( 'Guess_20', 'a wrong password', { ip, time: day } ) ).status, 403 );
		// ...and with one, someone else on that address (a school's, a phone carrier's) still gets in.
		assert.equal( ( await signIn( 'Racer_1', 'correct horse battery staple', { ip: '2001:db8:77:2::9', token: TOKEN, time: day } ) ).status, 200 );
		// Robot checks and all, the address is through after 200 tries that didn't get in.
		for ( let i = 20; i < 200; i ++ ) assert.equal( ( await signIn( `Guess_${ i }`, 'a wrong password', { ip, token: TOKEN, time: day } ) ).status, 401, `try ${ i }` );
		const out = await signIn( 'Racer_1', 'correct horse battery staple', { ip: '2001:db8:77:2::9', token: TOKEN, time: day } );
		assert.equal( out.status, 429 );
		assert.equal( out.json.reason, 'address' );
		assert.ok( Number( out.headers.get( 'Retry-After' ) ) > 0 );
		assert.equal( ( await signIn( 'Racer_1', 'correct horse battery staple', { ip: '2001:db8:78::1', time: day } ) ).status, 200 );
		assert.equal( ( await signIn( 'Racer_1', 'correct horse battery staple', { ip, time: day + DAY } ) ).status, 200 );

	} );

	test( 'tries sent all at once are counted as they come: 20 from an address, 5 for a username, no more without a robot check', async () => {

		const day = ACCOUNT_DAY + 7 * DAY;
		assert.equal( ( await signUp( 'Rushed_1', 'the rushed passphrase', { time: day } ) ).status, 200 );
		const tally = list => list.reduce( ( counts, res ) => ( counts[ res.status ] = ( counts[ res.status ] ?? 0 ) + 1, counts ), {} );
		// Forty wrong passwords from one address at once, for forty usernames.
		const fromOne = tally( await Promise.all( Array.from( { length: 40 }, ( _, i ) => signIn( `Burst_${ i }`, 'a wrong password', { ip: '203.0.113.80', time: day } ) ) ) );
		assert.deepEqual( fromOne, { 401: 20, 403: 20 }, JSON.stringify( fromOne ) );
		// Forty for one username from forty addresses at once: five, and the rest asked for a robot check.
		const atOne = tally( await Promise.all( Array.from( { length: 40 }, ( _, i ) => signIn( 'Rushed_1', `guess ${ i }`, { time: day } ) ) ) );
		assert.deepEqual( atOne, { 401: 5, 403: 35 }, JSON.stringify( atOne ) );
		// And a burst of solved robot checks from one address waits out the gap between each.
		const solved = tally( await Promise.all( Array.from( { length: 10 }, ( _, i ) => signIn( 'Rushed_1', `solved ${ i }`, { ip: '203.0.113.81', token: TOKEN, time: day } ) ) ) );
		assert.deepEqual( solved, { 401: 1, 429: 9 }, JSON.stringify( solved ) );

	} );

	test( 'a stranger failing every 5 s from a new address can\'t keep the owner waiting', async () => {

		const day = ACCOUNT_DAY + 8 * DAY;
		assert.equal( ( await signUp( 'Kept_Out', 'the owner\'s passphrase', { time: day } ) ).status, 200 );
		for ( let i = 0; i < 5; i ++ ) assert.equal( ( await signIn( 'kept_out', `guess ${ i }`, { time: day } ) ).status, 401 );
		const owner = '203.0.113.90';
		for ( let i = 0; i < 6; i ++ ) {

			const at = day + 5 * i * SECOND;
			assert.equal( ( await signIn( 'kept_out', `robot guess ${ i }`, { token: TOKEN, time: at } ) ).status, 401, `stranger ${ i }` );
			const res = await signIn( 'Kept_Out', 'the owner\'s passphrase', { token: TOKEN, ip: owner, time: at + 2500 } );
			assert.equal( res.status, 200, `owner ${ i }: ${ res.text }` );

		}

	} );

	test( 'one address makes 10 accounts a day at most', async () => {

		const day = ACCOUNT_DAY + 4 * DAY;
		const ip = '203.0.113.50';
		for ( let i = 0; i < 10; i ++ ) assert.equal( ( await signUp( `Maker_${ i }`, 'a long passphrase', { ip, time: day } ) ).status, 200, `account ${ i }` );
		const over = await signUp( 'Maker_10', 'a long passphrase', { ip, time: day } );
		assert.equal( over.status, 429 );
		assert.equal( ( await signUp( 'Maker_10', 'a long passphrase', { ip, time: day + DAY } ) ).status, 200 );

	} );

	test( 'one address signs in 50 times a day at most, with Google\'s sign-ins counted alike: each is a session kept a month', async () => {

		const day = ACCOUNT_DAY + 5 * DAY;
		const ip = '203.0.113.60';
		assert.equal( ( await google( { sub: '3501', email: 'often@example.com', name: 'Often' }, { ip, time: day } ) ).status, 200 );
		for ( let i = 0; i < 49; i ++ ) assert.equal( ( await signIn( 'Racer_1', 'correct horse battery staple', { ip, time: day } ) ).status, 200, `sign-in ${ i }` );
		const over = await signIn( 'Racer_1', 'correct horse battery staple', { ip, time: day } );
		assert.equal( over.status, 429 );
		assert.equal( over.cookie, null );
		assert.equal( ( await signIn( 'Racer_1', 'correct horse battery staple', { ip, time: day + DAY } ) ).status, 200 );

	} );

	test( 'an IPv6 visitor\'s 50 sign-ins are its /48\'s, not each /64\'s, with Google\'s counted alike', async () => {

		const day = ACCOUNT_DAY + 6 * DAY;
		for ( let i = 1; i <= 50; i ++ ) assert.equal( ( await signIn( 'Racer_1', 'correct horse battery staple', { ip: `2001:db8:7a:${ i.toString( 16 ) }::1`, time: day } ) ).status, 200, `sign-in ${ i }` );
		const over = await signIn( 'Racer_1', 'correct horse battery staple', { ip: '2001:db8:7a:ff::1', time: day } );
		assert.equal( over.status, 429 );
		assert.equal( over.cookie, null );
		assert.equal( ( await google( { sub: '3502', email: 'sixty@example.com', name: 'Sixty' }, { ip: '2001:db8:7a:fe::1', time: day } ) ).status, 429 );
		// Another /48 is another visitor.
		assert.equal( ( await signIn( 'Racer_1', 'correct horse battery staple', { ip: '2001:db8:7b::1', time: day } ) ).status, 200 );

	} );

	test( 'an IPv6 visitor\'s 20 players linked a day are its /48\'s, not each /64\'s', async () => {

		const u = await signUp( 'Link_Lots', 'a linking passphrase' );
		assert.equal( u.status, 200, u.text );
		const ip = nextIp();
		const visited = await send( 'POST', '/api/visit', { token: TOKEN }, { ip } );
		const player = await send( 'POST', '/api/player', { name: 'Lots Linked', visit: visited.json.visit }, { ip } );
		assert.equal( player.status, 201, player.text );
		const link = from => send( 'POST', '/api/player/link', { id: player.json.id, secret: player.json.secret }, { cookie: u.cookie, ip: from } );
		// Linked again, it's the same player each time, and each is one of the day's 20.
		for ( let i = 1; i <= 20; i ++ ) assert.equal( ( await link( `2001:db8:4c:${ i.toString( 16 ) }::1` ) ).status, 200, `link ${ i }` );
		assert.equal( ( await link( '2001:db8:4c:15::1' ) ).status, 429 );
		// Another of the /48's 65,536 /64s is the same visitor...
		assert.equal( ( await link( '2001:db8:4c:ffff::1' ) ).status, 429 );
		// ...and another /48 another.
		assert.equal( ( await link( '2001:db8:3c::1' ) ).status, 200 );

	} );

	test( 'linking Google with a robot check fits a long Google token and a long robot check\'s token', async () => {

		const day = ACCOUNT_DAY + 9 * DAY;
		const u = await signUp( 'Long_Link', 'the long link passphrase', { time: day } );
		// A stranger's five tries make the username ask for robot checks for the rest of the day.
		for ( let i = 0; i < 5; i ++ ) assert.equal( ( await signIn( 'long_link', `guess ${ i }`, { time: day } ) ).status, 401 );
		const claims = { sub: '3012', email: 'long.name.indeed@example.com', name: 'Long Name', picture: `https://lh3.googleusercontent.com/a/${ 'A'.repeat( 900 ) }=s96-c` };
		const credential = await makeToken( googleKey, claims );
		assert.ok( credential.length >= 1400, `${ credential.length }` );
		const password = 'the long link passphrase';
		const asked = await send( 'POST', '/api/account/google', { credential, password }, { cookie: u.cookie, time: day } );
		assert.equal( asked.status, 403 );
		assert.equal( asked.json.reason, 'robot' );
		const linked = await send( 'POST', '/api/account/google', { credential, password, token: 'T'.repeat( 2000 ) }, { cookie: u.cookie, time: day } );
		assert.equal( linked.status, 200, linked.text );
		assert.equal( linked.json.email, 'long.name.indeed@example.com' );
		// And a 128-byte password with a robot check's longest token, to take the password off.
		const longest = 'a long passphrase, said over and over: '.repeat( 4 ).slice( 0, 128 );
		const g = await google( { sub: '3013', email: 'lp@example.com', name: 'LP' }, { time: day } );
		assert.equal( ( await send( 'POST', '/api/account/password', { username: 'Longest_P', password: longest, credential: await makeToken( googleKey, { sub: '3013', email: 'lp@example.com' } ) }, { cookie: g.cookie, time: day } ) ).status, 200 );
		for ( let i = 0; i < 5; i ++ ) await signIn( 'longest_p', `guess ${ i }`, { time: day } );
		const removed = await send( 'DELETE', '/api/account/password', { password: longest, token: 'T'.repeat( 2048 ) }, { cookie: g.cookie, time: day } );
		assert.equal( removed.status, 200, removed.text );

	} );

	test( 'DriveLimits keeps no username and no address', () => {

		const kept = JSON.stringify( limitsRows( server ) );
		for ( const plain of [ 'racer_1', 'keeper_7', '2001:db8', '203.0.113', '198.18.' ] ) assert.ok( ! kept.toLowerCase().includes( plain ), plain );

	} );

	test( 'changing the password needs the current one, and signs the account\'s other sessions out', async () => {

		const made = await signUp( 'Changer', 'first passphrase here' );
		const phone = await signIn( 'Changer', 'first passphrase here' );
		const wrong = await send( 'POST', '/api/account/password', { current: 'not it at all', password: 'second passphrase here' }, { cookie: made.cookie } );
		assert.equal( wrong.status, 401 );
		assert.equal( wrong.json.error, 'That isn\'t your current password' );
		const weak = await send( 'POST', '/api/account/password', { current: 'first passphrase here', password: 'password' }, { cookie: made.cookie } );
		assert.equal( weak.status, 400 );
		assert.equal( ( await send( 'POST', '/api/account/password', { password: 'second passphrase here' }, { cookie: made.cookie } ) ).status, 400 );
		const changed = await send( 'POST', '/api/account/password', { current: 'first passphrase here', password: 'second passphrase here' }, { cookie: made.cookie } );
		assert.equal( changed.status, 200, changed.text );
		assert.equal( changed.json.username, 'Changer' );
		assert.equal( ( await me( made.cookie ) ).json.signedIn, true, 'this browser was signed out' );
		assert.equal( ( await me( phone.cookie ) ).json.signedIn, false, 'the other session stayed signed in' );
		assert.equal( ( await signIn( 'Changer', 'first passphrase here' ) ).status, 401 );
		assert.equal( ( await signIn( 'Changer', 'second passphrase here' ) ).status, 200 );

	} );

	test( 'a password hashed with fewer iterations is hashed again at its next sign-in', async () => {

		assert.equal( ( await signUp( 'Old_Hash', 'an older passphrase' ) ).status, 200 );
		const salt = randomBytes( 16 );
		server.d1( `UPDATE logins SET password_hash = '${ await pbkdf2( 'an older passphrase', salt, 10000 ) }', salt = '${ salt.toString( 'base64url' ) }', iterations = 10000 WHERE username_key = 'old_hash'` );
		assert.equal( ( await signIn( 'Old_Hash', 'not the passphrase' ) ).status, 401 );
		assert.equal( login( 'old_hash' ).iterations, 10000, 'hashed again on a wrong password' );
		assert.equal( ( await signIn( 'old_hash', 'an older passphrase', { time: ACCOUNT_DAY + MINUTE } ) ).status, 200 );
		const row = login( 'old_hash' );
		assert.equal( row.iterations, 100000 );
		assert.notEqual( row.salt, salt.toString( 'base64url' ) );
		assert.equal( row.changed_at, ACCOUNT_DAY + MINUTE );
		assert.equal( row.password_hash, await pbkdf2( 'an older passphrase', Buffer.from( row.salt, 'base64url' ), 100000 ) );
		assert.equal( ( await signIn( 'old_hash', 'an older passphrase' ) ).status, 200 );

	} );

	test( 'a Google account adds a username and password, and signs in either way to the one account', async () => {

		const g = await google( { sub: '3001', email: 'gina@example.com', name: 'Gina' } );
		assert.equal( g.status, 200 );
		assert.deepEqual( [ g.json.google, g.json.username ], [ true, null ] );
		const credential = await makeToken( googleKey, { sub: '3001', email: 'gina@example.com', name: 'Gina' } );
		// The name filter and the rules hold here too, and a username someone has is taken.
		assert.equal( ( await send( 'POST', '/api/account/password', { username: 'admin', password: 'gina\'s passphrase', credential }, { cookie: g.cookie } ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/account/password', { username: 'Gina_G', password: '12345678', credential }, { cookie: g.cookie } ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/account/password', { username: 'racer_1', password: 'gina\'s passphrase', credential }, { cookie: g.cookie } ) ).status, 409 );
		// The session alone isn't enough: Google's ID token for this account, as fresh proof.
		assert.equal( ( await send( 'POST', '/api/account/password', { username: 'Gina_G', password: 'gina\'s passphrase' }, { cookie: g.cookie } ) ).status, 401 );
		const someoneElse = await send( 'POST', '/api/account/password', { username: 'Gina_G', password: 'gina\'s passphrase', credential: await makeToken( googleKey, { sub: '3091', email: 'thief@example.com' } ) }, { cookie: g.cookie } );
		assert.equal( someoneElse.status, 403 );
		assert.equal( login( 'gina_g' ), undefined );
		const added = await send( 'POST', '/api/account/password', { username: 'Gina_G', password: 'gina\'s passphrase', credential }, { cookie: g.cookie } );
		assert.equal( added.status, 200, added.text );
		assert.deepEqual( [ added.json.google, added.json.username, added.json.email ], [ true, 'Gina_G', 'gina@example.com' ] );
		const byPassword = await signIn( 'gina_g', 'gina\'s passphrase' );
		assert.equal( byPassword.status, 200 );
		assert.equal( byPassword.json.email, 'gina@example.com' );
		assert.equal( byPassword.json.purchase.clientReferenceId, g.json.purchase.clientReferenceId );

	} );

	test( 'a username\'s account links Google, and signs in either way to the one account', async () => {

		const u = await signUp( 'Linker', 'the linker\'s passphrase' );
		const credential = await makeToken( googleKey, { sub: '3002', email: 'lin@example.com', name: 'Lin' } );
		const password = 'the linker\'s passphrase';
		assert.equal( ( await send( 'POST', '/api/account/google', { credential: 'not a token', password }, { cookie: u.cookie } ) ).status, 401 );
		// The session alone isn't enough: the password too, as fresh proof.
		assert.equal( ( await send( 'POST', '/api/account/google', { credential }, { cookie: u.cookie } ) ).status, 400 );
		const wrong = await send( 'POST', '/api/account/google', { credential, password: 'not the passphrase' }, { cookie: u.cookie } );
		assert.equal( wrong.status, 401 );
		assert.equal( wrong.json.error, 'That isn\'t your current password' );
		assert.equal( ( await me( u.cookie ) ).json.google, false );
		const linked = await send( 'POST', '/api/account/google', { credential, password }, { cookie: u.cookie } );
		assert.equal( linked.status, 200, linked.text );
		assert.deepEqual( [ linked.json.google, linked.json.username, linked.json.email ], [ true, 'Linker', 'lin@example.com' ] );
		const byGoogle = await google( { sub: '3002', email: 'lin@example.com', name: 'Lin' } );
		assert.equal( byGoogle.json.username, 'Linker' );
		assert.equal( byGoogle.json.purchase.clientReferenceId, u.json.purchase.clientReferenceId );
		// Linking it again changes nothing; another Google account is refused until this one's unlinked.
		assert.equal( ( await send( 'POST', '/api/account/google', { credential, password }, { cookie: u.cookie } ) ).status, 200 );
		const another = await send( 'POST', '/api/account/google', { credential: await makeToken( googleKey, { sub: '3009', email: 'x@example.com' } ), password }, { cookie: u.cookie } );
		assert.equal( another.status, 409 );
		assert.match( another.json.error, /Unlink it first/ );

	} );

	test( 'a Google account with progress or a pass of its own is never linked over; an empty one is taken in', async () => {

		const u = await signUp( 'Careful', 'a careful passphrase' );
		const accountId = Number( u.json.purchase.clientReferenceId );
		// One with a leaderboard player of its own.
		const withPlayer = await google( { sub: '3003', email: 'pat@example.com', name: 'Pat' } );
		const ip = nextIp();
		const visited = await send( 'POST', '/api/visit', { token: TOKEN }, { ip } );
		const player = await send( 'POST', '/api/player', { name: 'Pat Plays', visit: visited.json.visit }, { ip } );
		assert.equal( ( await send( 'POST', '/api/player/link', { id: player.json.id, secret: player.json.secret }, { cookie: withPlayer.cookie } ) ).status, 200 );
		// One with a pass bought.
		const withPass = await google( { sub: '3004', email: 'bea@example.com', name: 'Bea' } );
		assert.equal( ( await webhook( server, checkout( 'bea', { reference: withPass.json.purchase.clientReferenceId, email: 'bea@example.com' } ) ) ).status, 200 );
		// One with a username.
		const withLogin = await google( { sub: '3005', email: 'una@example.com', name: 'Una' } );
		await send( 'POST', '/api/account/password', { username: 'Una_U', password: 'una\'s passphrase', credential: await makeToken( googleKey, { sub: '3005', email: 'una@example.com' } ) }, { cookie: withLogin.cookie } );
		assert.equal( login( 'una_u' ).email, 'una@example.com' );
		for ( const [ sub, email ] of [ [ '3003', 'pat@example.com' ], [ '3004', 'bea@example.com' ], [ '3005', 'una@example.com' ] ] ) {

			const res = await send( 'POST', '/api/account/google', { credential: await makeToken( googleKey, { sub, email } ), password: 'a careful passphrase' }, { cookie: u.cookie } );
			assert.equal( res.status, 409, sub );
			assert.match( res.json.error, /has its own World Drive account/ );

		}

		assert.equal( ( await me( u.cookie ) ).json.google, false );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM accounts WHERE google_sub IN ( \'3003\', \'3004\', \'3005\' )' )[ 0 ].n, 3 );
		assert.equal( ( await me( withPass.cookie ) ).json.supporter, true );
		// An empty one (signed in once, nothing since) is linked, and its leftover account goes.
		const empty = await google( { sub: '3006', email: 'em@example.com', name: 'Em' } );
		const linked = await send( 'POST', '/api/account/google', { credential: await makeToken( googleKey, { sub: '3006', email: 'em@example.com', name: 'Em' } ), password: 'a careful passphrase' }, { cookie: u.cookie } );
		assert.equal( linked.status, 200, linked.text );
		assert.deepEqual( server.d1( 'SELECT id FROM accounts WHERE google_sub = \'3006\'' ), [ { id: accountId } ] );
		assert.equal( ( await me( empty.cookie ) ).json.signedIn, false, 'the empty account\'s session outlived it' );

	} );

	test( 'unlinking keeps at least one way in; a pass bought with the Google email stays', async () => {

		const solo = await signUp( 'Solo_One', 'solo\'s passphrase' );
		const noWay = await send( 'DELETE', '/api/account/password', { password: 'solo\'s passphrase' }, { cookie: solo.cookie } );
		assert.equal( noWay.status, 409 );
		const ollyToken = await makeToken( googleKey, { sub: '3007', email: 'olly@example.com', name: 'Olly' } );
		const gOnly = await google( { sub: '3007', email: 'olly@example.com', name: 'Olly' } );
		const stuck = await send( 'DELETE', '/api/account/google', { credential: ollyToken }, { cookie: gOnly.cookie } );
		assert.equal( stuck.status, 409 );
		assert.equal( ( await me( gOnly.cookie ) ).json.google, true );
		// Both: a pass paid with the Google email before signing in (nobody's), then Google unlinked.
		await send( 'POST', '/api/account/password', { username: 'Olly_O', password: 'olly\'s passphrase', credential: ollyToken }, { cookie: gOnly.cookie } );
		assert.equal( ( await webhook( server, checkout( 'olly', { email: 'olly@example.com' } ) ) ).status, 200 );
		assert.equal( ( await me( gOnly.cookie ) ).json.supporter, true );
		// Unlinking needs Google's ID token for it, not only the session (nor the password).
		assert.equal( ( await send( 'DELETE', '/api/account/google', {}, { cookie: gOnly.cookie } ) ).status, 401 );
		assert.equal( ( await send( 'DELETE', '/api/account/google', { password: 'olly\'s passphrase' }, { cookie: gOnly.cookie } ) ).status, 401 );
		assert.equal( ( await send( 'DELETE', '/api/account/google', { credential: await makeToken( googleKey, { sub: '3092', email: 'thief@example.com' } ) }, { cookie: gOnly.cookie } ) ).status, 403 );
		assert.equal( ( await me( gOnly.cookie ) ).json.google, true );
		const ollyPhone = await signIn( 'Olly_O', 'olly\'s passphrase' );
		const unlinked = await send( 'DELETE', '/api/account/google', { credential: ollyToken }, { cookie: gOnly.cookie } );
		assert.equal( unlinked.status, 200, unlinked.text );
		assert.deepEqual( [ unlinked.json.google, unlinked.json.email, unlinked.json.name, unlinked.json.username, unlinked.json.supporter ], [ false, '', '', 'Olly_O', true ] );
		assert.equal( ( await me( gOnly.cookie ) ).json.signedIn, true, 'this browser was signed out' );
		assert.equal( ( await me( ollyPhone.cookie ) ).json.signedIn, false, 'the other session stayed signed in' );
		assert.equal( ( await signIn( 'Olly_O', 'olly\'s passphrase' ) ).json.supporter, true );
		// Google signs in to an account of its own again now.
		const fresh = await google( { sub: '3007', email: 'olly@example.com', name: 'Olly' } );
		assert.deepEqual( [ fresh.json.username, fresh.json.supporter ], [ null, false ] );
		// And with Google linked, the username and password can go.
		const both = await google( { sub: '3001', email: 'gina@example.com', name: 'Gina' } );
		// It needs the password, or Google's ID token for the account, not only the session.
		assert.equal( ( await send( 'DELETE', '/api/account/password', {}, { cookie: both.cookie } ) ).status, 400 );
		assert.equal( ( await send( 'DELETE', '/api/account/password', { password: 'not gina\'s passphrase' }, { cookie: both.cookie } ) ).status, 401 );
		assert.equal( ( await send( 'DELETE', '/api/account/password', { credential: await makeToken( googleKey, { sub: '3093', email: 'thief@example.com' } ) }, { cookie: both.cookie } ) ).status, 403 );
		assert.equal( ( await me( both.cookie ) ).json.username, 'Gina_G' );
		const ginaPhone = await signIn( 'Gina_G', 'gina\'s passphrase' );
		assert.equal( ( await me( ginaPhone.cookie ) ).json.signedIn, true );
		const removed = await send( 'DELETE', '/api/account/password', { password: 'gina\'s passphrase' }, { cookie: both.cookie } );
		assert.equal( removed.status, 200 );
		assert.equal( removed.json.username, null );
		assert.equal( ( await signIn( 'Gina_G', 'gina\'s passphrase' ) ).status, 401 );
		assert.equal( ( await me( both.cookie ) ).json.signedIn, true, 'this browser was signed out' );
		assert.equal( ( await me( ginaPhone.cookie ) ).json.signedIn, false, 'the other session stayed signed in' );
		// Taken off with Google's ID token instead of the password: the other sessions end the same.
		const remyClaims = { sub: '3011', email: 'remy@example.com', name: 'Remy' };
		const remy = await google( remyClaims );
		assert.equal( ( await send( 'POST', '/api/account/password', { username: 'Remy_R', password: 'remy\'s passphrase', credential: await makeToken( googleKey, remyClaims ) }, { cookie: remy.cookie } ) ).status, 200 );
		const remyPhone = await signIn( 'Remy_R', 'remy\'s passphrase' );
		const remyTablet = await google( remyClaims );
		const byGoogle = await send( 'DELETE', '/api/account/password', { credential: await makeToken( googleKey, remyClaims ) }, { cookie: remy.cookie } );
		assert.equal( byGoogle.status, 200, byGoogle.text );
		assert.equal( byGoogle.json.username, null );
		assert.equal( ( await me( remy.cookie ) ).json.signedIn, true, 'this browser was signed out' );
		assert.equal( ( await me( remyPhone.cookie ) ).json.signedIn, false, 'the password\'s session stayed signed in' );
		assert.equal( ( await me( remyTablet.cookie ) ).json.signedIn, false, 'another Google session stayed signed in' );

	} );

	test( 'the pass, the player and its level are the same whichever way you sign in', async () => {

		const u = await signUp( 'Same_Me', 'same me passphrase' );
		assert.equal( ( await send( 'POST', '/api/account/google', { credential: await makeToken( googleKey, { sub: '3010', email: 'same@example.com', name: 'Same' } ), password: 'same me passphrase' }, { cookie: u.cookie } ) ).status, 200 );
		// A player linked while signed in with the username.
		const ip = nextIp();
		const visited = await send( 'POST', '/api/visit', { token: TOKEN }, { ip } );
		const player = await send( 'POST', '/api/player', { name: 'Same Me', visit: visited.json.visit }, { ip } );
		assert.equal( ( await send( 'POST', '/api/player/link', { id: player.json.id, secret: player.json.secret }, { cookie: u.cookie } ) ).status, 200 );
		// The pass bought while signed in with Google.
		const g = await google( { sub: '3010', email: 'same@example.com', name: 'Same' } );
		assert.equal( ( await webhook( server, checkout( 'same', { reference: g.json.purchase.clientReferenceId, email: 'other@example.com' } ) ) ).status, 200 );
		const byName = await signIn( 'same_me', 'same me passphrase' );
		assert.deepEqual( [ byName.json.supporter, ( await me( g.cookie ) ).json.supporter ], [ true, true ] );
		const [ row ] = server.d1( `SELECT account_id FROM players WHERE id = '${ player.json.id }'` );
		assert.equal( row.account_id, Number( byName.json.purchase.clientReferenceId ) );
		// The player's ⭐ on the board, by the account's pass.
		const run = { id: player.json.id, secret: player.json.secret, score: 1000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, runSeconds: 60, visit: visited.json.visit };
		const posted = await send( 'POST', '/api/score', run, { ip, time: ACCOUNT_DAY + MINUTE } );
		assert.equal( posted.status, 200, posted.text );
		const board = await call( server, '/api/leaderboard?period=all', { time: ACCOUNT_DAY + 2 * MINUTE } );
		assert.equal( board.json.rows.find( r => r.name === 'Same Me' ).supporter, true );

	} );

	test( 'a purchase Stripe sent without an email makes no username\'s account a supporter', async () => {

		assert.equal( ( await webhook( server, checkout( 'noemail', { email: null } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT account_id, email FROM purchases WHERE checkout_session = \'cs_test_noemail\'' ), [ { account_id: null, email: '' } ] );
		const u = await signUp( 'No_Email', 'no email passphrase' );
		assert.equal( u.json.supporter, false );
		assert.equal( ( await me( u.cookie ) ).json.supporter, false );

	} );

	test( 'a username\'s account keeps an email for receipts, given at sign-up or later; it never makes a purchase its own', async () => {

		const made = await send( 'POST', '/api/account/sign-up', { username: 'Receipts', password: 'the receipts passphrase', token: TOKEN, email: ' Ann@Example.com ' } );
		assert.equal( made.status, 200, made.text );
		assert.equal( made.json.contactEmail, 'ann@example.com' );
		assert.equal( made.json.email, '' );
		const cookie = cookieOf( made );
		assert.equal( ( await send( 'POST', '/api/account/sign-up', { username: 'Receipts2', password: 'the receipts passphrase', token: TOKEN, email: 'not an email' } ) ).status, 400 );
		// Changed, and taken off; signed out, nothing to change.
		const changed = await send( 'POST', '/api/account/email', { email: 'Other@Example.org' }, { cookie } );
		assert.equal( changed.status, 200, changed.text );
		assert.equal( changed.json.contactEmail, 'other@example.org' );
		assert.equal( ( await send( 'POST', '/api/account/email', { email: 'nope' }, { cookie } ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/account/email', { email: 'x@example.org' } ) ).status, 401 );
		// Someone else's purchase with that email (never checked) doesn't become this account's pass.
		server.d1( `INSERT INTO purchases ( checkout_session, email, status, created_at ) VALUES ( 'cs_receipts', 'other@example.org', 'paid', ${ Date.now() } )` );
		assert.equal( ( await me( cookie ) ).json.supporter, false );
		server.d1( 'DELETE FROM purchases WHERE checkout_session = \'cs_receipts\'' );
		assert.equal( ( await send( 'POST', '/api/account/email', { email: '' }, { cookie } ) ).json.contactEmail, '' );

	} );

	test( 'signing out everywhere ends every session of the account', async () => {

		const one = await signUp( 'Leaver', 'the leaver\'s passphrase' );
		const two = await signIn( 'Leaver', 'the leaver\'s passphrase' );
		// The account's player, made in the first browser, and handed to the second as it signed in.
		const ip = nextIp();
		const visited = await send( 'POST', '/api/visit', { token: TOKEN }, { ip } );
		const made = await send( 'POST', '/api/player', { name: 'Leaver Plays', visit: visited.json.visit }, { ip } );
		assert.equal( ( await send( 'POST', '/api/player/mine', { id: made.json.id, secret: made.json.secret }, { cookie: one.cookie } ) ).status, 200 );
		const handed = await send( 'POST', '/api/player/mine', {}, { cookie: two.cookie } );
		assert.equal( handed.json.player.id, made.json.id );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM player_keys WHERE player_id = '${ made.json.id }'` )[ 0 ].n, 1 );
		const out = await send( 'POST', '/api/account/sign-out-everywhere', {}, { cookie: one.cookie } );
		assert.equal( out.status, 204 );
		assert.match( out.headers.get( 'Set-Cookie' ), /^__Host-wd_session=; Max-Age=0;/ );
		assert.equal( ( await me( one.cookie ) ).json.signedIn, false );
		assert.equal( ( await me( two.cookie ) ).json.signedIn, false );
		assert.equal( ( await signIn( 'Leaver', 'the leaver\'s passphrase' ) ).status, 200 );
		// The key handed to the second browser went with it; the player's own secret didn't.
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM player_keys WHERE player_id = '${ made.json.id }'` )[ 0 ].n, 0 );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM players WHERE id = '${ made.json.id }'` )[ 0 ].n, 1 );

	} );

	test( 'a session alone can\'t take an account over: adding a password and unlinking Google each need Google\'s fresh proof', async () => {

		// A Google account with a pass, its session in a browser someone else gets hold of.
		const victim = await google( { sub: '3020', email: 'vic@example.com', name: 'Vic' } );
		assert.equal( ( await webhook( server, checkout( 'vic', { reference: victim.json.purchase.clientReferenceId, email: 'vic@example.com' } ) ) ).status, 200 );
		const thief = await send( 'POST', '/api/account/password', { username: 'Thief_X', password: 'the thief\'s passphrase' }, { cookie: victim.cookie } );
		assert.equal( thief.status, 401 );
		assert.equal( ( await send( 'DELETE', '/api/account/google', {}, { cookie: victim.cookie } ) ).status, 409 );
		assert.equal( ( await signIn( 'Thief_X', 'the thief\'s passphrase' ) ).status, 401 );
		const back = await google( { sub: '3020', email: 'vic@example.com', name: 'Vic' } );
		assert.deepEqual( [ back.json.username, back.json.supporter, back.json.purchase.clientReferenceId ], [ null, true, victim.json.purchase.clientReferenceId ] );
		// And a username's session can't link the holder's own Google account without the password.
		const named = await signUp( 'Named_Vic', 'named vic\'s passphrase' );
		const linked = await send( 'POST', '/api/account/google', { credential: await makeToken( googleKey, { sub: '3021', email: 'thief@example.com' } ), password: 'a guess at it' }, { cookie: named.cookie } );
		assert.equal( linked.status, 401 );
		assert.equal( ( await me( named.cookie ) ).json.google, false );

	} );

	test( 'taking the password off and unlinking Google at once always leaves a way in', async () => {

		const outcomes = [];
		for ( let i = 0; i < 6; i ++ ) {

			const username = `Both_${ i }`;
			const password = `both ${ i } passphrase`;
			const sub = String( 3030 + i );
			const credential = await makeToken( googleKey, { sub, email: `both${ i }@example.com`, name: `Both ${ i }` } );
			const u = await signUp( username, password );
			assert.equal( ( await send( 'POST', '/api/account/google', { credential, password }, { cookie: u.cookie } ) ).status, 200 );
			const [ removed, unlinked ] = await Promise.all( [
				send( 'DELETE', '/api/account/password', { password }, { cookie: u.cookie } ),
				send( 'DELETE', '/api/account/google', { credential }, { cookie: u.cookie } ),
			] );
			const [ row ] = server.d1( `SELECT google_sub NOT LIKE 'none:%' AS google, EXISTS ( SELECT 1 FROM logins WHERE account_id = accounts.id ) AS login FROM accounts WHERE id = ${ Number( u.json.purchase.clientReferenceId ) }` );
			assert.ok( row.google || row.login, `${ username } has no way in (${ removed.status }, ${ unlinked.status })` );
			assert.ok( [ removed.status, unlinked.status ].includes( 200 ) );
			outcomes.push( `${ removed.status }/${ unlinked.status }` );

		}

		console.log( `# password off / Google unlinked at once: ${ outcomes.join( ', ' ) }` );

	} );

	test( 'a forgotten password: the owner makes a one-time link (showing the account\'s email), which sets a new password once, signs out everywhere and signs in', async () => {

		const boss = await google( { sub: '3990', email: 'boss@example.com', name: 'Boss' } );
		const res = await send( 'POST', '/api/account/sign-up', { username: 'Forgetful_1', password: 'the old passphrase', email: 'Forget@Example.com', token: TOKEN } );
		const elsewhere = cookieOf( res );
		assert.equal( ( await me( elsewhere ) ).json.signedIn, true );

		// Only the owner makes links; a username nobody has is a 404.
		assert.equal( ( await send( 'POST', '/api/admin/reset-link', { username: 'Forgetful_1' } ) ).status, 401 );
		assert.equal( ( await send( 'POST', '/api/admin/reset-link', { username: 'Forgetful_1' }, { cookie: elsewhere } ) ).status, 403 );
		assert.equal( ( await send( 'POST', '/api/admin/reset-link', { username: 'Nobody_Here' }, { cookie: boss.cookie } ) ).status, 404 );
		const first = await send( 'POST', '/api/admin/reset-link', { username: 'forgetful_1' }, { cookie: boss.cookie } );
		assert.equal( first.status, 200, first.text );
		assert.deepEqual( { ...first.json, link: undefined }, { username: 'Forgetful_1', email: 'forget@example.com', google: false, link: undefined, expiresAt: ACCOUNT_DAY + 24 * HOUR } );
		const tokenOf = link => new URL( link ).searchParams.get( 'reset' );
		assert.match( first.json.link, /^http:\/\/[^/]+\/\?reset=[A-Za-z0-9_-]{43}$/ );
		// Only the token's hash is kept; a second link ends the first.
		const old = tokenOf( first.json.link );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM password_resets' )[ 0 ].n, 1 );
		assert.ok( ! JSON.stringify( server.d1( 'SELECT * FROM password_resets' ) ).includes( old ) );
		const second = await send( 'POST', '/api/admin/reset-link', { username: 'Forgetful_1' }, { cookie: boss.cookie } );
		const token = tokenOf( second.json.link );
		assert.equal( ( await send( 'POST', '/api/account/reset-check', { token: old } ) ).status, 410 );

		// Whose it is; a made-up or malformed one is gone too.
		const check = await send( 'POST', '/api/account/reset-check', { token } );
		assert.deepEqual( [ check.status, check.json ], [ 200, { username: 'Forgetful_1' } ] );
		for ( const bad of [ 'x'.repeat( 43 ), 'short', 42, null ] ) assert.equal( ( await send( 'POST', '/api/account/reset-check', { token: bad } ) ).status, 410, String( bad ) );

		// The password's rules as ever; then set, signed in here and out everywhere else.
		const weak = await send( 'POST', '/api/account/reset', { token, password: 'short' } );
		assert.equal( weak.status, 400 );
		const done = await send( 'POST', '/api/account/reset', { token, password: 'a brand new passphrase' } );
		assert.equal( done.status, 200, done.text );
		assert.equal( done.json.username, 'Forgetful_1' );
		assert.equal( ( await me( cookieOf( done ) ) ).json.signedIn, true );
		assert.equal( ( await me( elsewhere ) ).json.signedIn, false );
		assert.equal( ( await signIn( 'Forgetful_1', 'the old passphrase' ) ).status, 401 );
		assert.equal( ( await signIn( 'Forgetful_1', 'a brand new passphrase' ) ).status, 200 );
		// Once only.
		assert.equal( ( await send( 'POST', '/api/account/reset', { token, password: 'yet another passphrase' } ) ).status, 410 );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM password_resets' )[ 0 ].n, 0 );

		// And not after a day.
		const late = tokenOf( ( await send( 'POST', '/api/admin/reset-link', { username: 'Forgetful_1' }, { cookie: boss.cookie } ) ).json.link );
		assert.equal( ( await send( 'POST', '/api/account/reset', { token: late, password: 'a late passphrase' }, { time: ACCOUNT_DAY + 24 * HOUR + 1 } ) ).status, 410 );

	} );

	test( 'feature requests: a signed-in player sends a few a day; the owner lists them newest first, marks them done and deletes them', async () => {

		const boss = await google( { sub: '3991', email: 'boss@example.com', name: 'Boss' } );
		const u = await signUp( 'Idea_Haver', 'an idea haver passphrase' );
		// Signed out, nothing; nothing written, or too much, a 400.
		assert.equal( ( await send( 'POST', '/api/requests', { text: 'A monster truck' } ) ).status, 401 );
		assert.equal( ( await send( 'POST', '/api/requests', { text: '   ' }, { cookie: u.cookie } ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/requests', { text: 'x'.repeat( 1001 ) }, { cookie: u.cookie } ) ).status, 400 );
		for ( let i = 1; i <= 5; i ++ ) assert.equal( ( await send( 'POST', '/api/requests', { text: `  Idea ${ i }\r\nwith a second line  ` }, { cookie: u.cookie, time: ACCOUNT_DAY + i } ) ).status, 200 );
		assert.equal( ( await send( 'POST', '/api/requests', { text: 'Idea 6' }, { cookie: u.cookie, time: ACCOUNT_DAY + 6 } ) ).status, 429 );
		// The owner's only.
		assert.equal( ( await call( server, '/api/admin/requests', { headers: { Cookie: u.cookie }, time: ACCOUNT_DAY + HOUR } ) ).status, 403 );
		const list = await call( server, '/api/admin/requests', { headers: { Cookie: boss.cookie }, time: ACCOUNT_DAY + HOUR } );
		assert.equal( list.status, 200, list.text );
		assert.equal( list.json.open, 5 );
		assert.deepEqual( list.json.requests.map( r => r.text ), [ 5, 4, 3, 2, 1 ].map( i => `Idea ${ i }\nwith a second line` ) );
		assert.deepEqual( { ...list.json.requests[ 0 ], id: 0 }, { id: 0, name: 'Idea_Haver', text: 'Idea 5\nwith a second line', createdAt: ACCOUNT_DAY + 5, doneAt: null, supporter: false } );
		const [ first, second ] = list.json.requests;
		const done = await send( 'POST', '/api/admin/requests', { id: first.id, action: 'done' }, { cookie: boss.cookie, time: ACCOUNT_DAY + 2 * HOUR } );
		assert.equal( done.json.open, 4 );
		assert.equal( done.json.requests[ 0 ].doneAt, ACCOUNT_DAY + 2 * HOUR );
		assert.equal( ( await send( 'POST', '/api/admin/requests', { id: first.id, action: 'open' }, { cookie: boss.cookie } ) ).json.open, 5 );
		const gone = await send( 'POST', '/api/admin/requests', { id: second.id, action: 'delete' }, { cookie: boss.cookie } );
		assert.equal( gone.json.requests.length, 4 );
		assert.equal( ( await send( 'POST', '/api/admin/requests', { id: first.id, action: 'nope' }, { cookie: boss.cookie } ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/admin/requests', { id: first.id, action: 'delete' }, { cookie: u.cookie } ) ).status, 403 );

	} );

	test( 'the owner\'s Google account (ADMIN_EMAILS) never gets a password, and an account with one never reaches the admin page', async () => {

		const credential = await makeToken( googleKey, { sub: '3998', email: 'BOSS@example.com', name: 'Boss' } );
		const boss = await google( { sub: '3998', email: 'BOSS@example.com', name: 'Boss' } );
		assert.equal( ( await call( server, '/api/admin/stats?days=1', { headers: { Cookie: boss.cookie }, time: ACCOUNT_DAY + HOUR } ) ).status, 200 );
		const added = await send( 'POST', '/api/account/password', { username: 'Boss_Pw', password: 'the boss\'s passphrase', credential }, { cookie: boss.cookie } );
		assert.equal( added.status, 403 );
		assert.match( added.json.error, /sign in with Google only/ );
		// Nor is it linked to a username's account.
		const u = await signUp( 'Would_Be_Boss', 'would be boss passphrase' );
		const linked = await send( 'POST', '/api/account/google', { credential, password: 'would be boss passphrase' }, { cookie: u.cookie } );
		assert.equal( linked.status, 403 );
		assert.equal( ( await me( u.cookie ) ).json.google, false );
		// And should ADMIN_EMAILS ever name an account with a username, signing in with it reaches nothing.
		const withLogin = await google( { sub: '3997', email: 'boss@example.com', name: 'Boss' } );
		server.d1( `UPDATE accounts SET email = 'boss@example.com' WHERE id = ${ Number( u.json.purchase.clientReferenceId ) }` );
		assert.equal( ( await call( server, '/api/admin/stats?days=1', { headers: { Cookie: u.cookie }, time: ACCOUNT_DAY + HOUR } ) ).status, 403 );
		assert.equal( ( await call( server, '/api/admin/stats?days=1', { headers: { Cookie: withLogin.cookie }, time: ACCOUNT_DAY + HOUR } ) ).status, 200 );
		server.d1( `UPDATE accounts SET email = '' WHERE id = ${ Number( u.json.purchase.clientReferenceId ) }` );

	} );

	test( 'adding a username to a Google account is counted as making an account is, so taken usernames can\'t be tried freely', async () => {

		const day = ACCOUNT_DAY + 9 * DAY;
		const ip = '203.0.113.95';
		const g = await google( { sub: '3040', email: 'prober@example.com', name: 'Prober' }, { ip, time: day } );
		const credential = await makeToken( googleKey, { sub: '3040', email: 'prober@example.com', name: 'Prober' } );
		for ( let i = 0; i < 10; i ++ ) assert.equal( ( await send( 'POST', '/api/account/password', { username: i ? 'racer_1' : 'linker', password: 'the prober\'s passphrase', credential }, { cookie: g.cookie, ip, time: day } ) ).status, 409, `try ${ i }` );
		const over = await send( 'POST', '/api/account/password', { username: 'Unused_Name', password: 'the prober\'s passphrase', credential }, { cookie: g.cookie, ip, time: day } );
		assert.equal( over.status, 429 );
		assert.equal( ( await signUp( 'Unused_Name', 'a long passphrase', { ip, time: day } ) ).status, 429 );

	} );

	test( 'an empty Google account taken in while it gains a player: the player is never cut loose', async () => {

		for ( let i = 0; i < 4; i ++ ) {

			const sub = String( 3050 + i );
			const claims = { sub, email: `race${ i }@example.com`, name: `Race ${ i }` };
			const u = await signUp( `Racing_${ i }`, `racing ${ i } passphrase` );
			const empty = await google( claims );
			const ip = nextIp();
			const visited = await send( 'POST', '/api/visit', { token: TOKEN }, { ip } );
			const player = await send( 'POST', '/api/player', { name: `Racer Number ${ i }`, visit: visited.json.visit }, { ip } );
			const [ playerLink, googleLink ] = await Promise.all( [
				send( 'POST', '/api/player/link', { id: player.json.id, secret: player.json.secret }, { cookie: empty.cookie } ),
				send( 'POST', '/api/account/google', { credential: await makeToken( googleKey, claims ), password: `racing ${ i } passphrase` }, { cookie: u.cookie } ),
			] );
			const [ row ] = server.d1( `SELECT account_id FROM players WHERE id = '${ player.json.id }'` );
			if ( playerLink.status === 200 ) assert.notEqual( row.account_id, null, `round ${ i }: the player linked was cut loose (link ${ googleLink.status })` );
			if ( googleLink.status === 200 ) assert.deepEqual( server.d1( `SELECT id FROM accounts WHERE google_sub = '${ sub }'` ), [ { id: Number( u.json.purchase.clientReferenceId ) } ] );

		}

	} );

	test( 'a username made by two at once is one account, and nothing is left of the other', async () => {

		const answers = await Promise.all( Array.from( { length: 6 }, () => signUp( 'Twice_Made', 'the twice made passphrase' ) ) );
		assert.deepEqual( answers.map( res => res.status ).sort(), [ 200, 409, 409, 409, 409, 409 ] );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM accounts a WHERE google_sub LIKE \'none:%\' AND NOT EXISTS ( SELECT 1 FROM logins WHERE account_id = a.id )' )[ 0 ].n, 0 );

	} );

	test( 'the admin page counts accounts by how they sign in, and nothing else of them', async () => {

		const boss = await google( { sub: '3999', email: 'boss@example.com', name: 'Boss' } );
		const stats = await call( server, '/api/admin/stats?days=1', { headers: { Cookie: boss.cookie }, time: ACCOUNT_DAY + HOUR } );
		assert.equal( stats.status, 200, stats.text );
		const count = sql => server.d1( sql )[ 0 ].n;
		const kinds = {
			google: count( 'SELECT COUNT(*) AS n FROM accounts a WHERE google_sub NOT LIKE \'none:%\' AND NOT EXISTS ( SELECT 1 FROM logins WHERE account_id = a.id )' ),
			password: count( 'SELECT COUNT(*) AS n FROM accounts a JOIN logins l ON l.account_id = a.id WHERE google_sub LIKE \'none:%\'' ),
			both: count( 'SELECT COUNT(*) AS n FROM accounts a JOIN logins l ON l.account_id = a.id WHERE google_sub NOT LIKE \'none:%\'' ),
		};
		assert.deepEqual( stats.json.totals.kinds, kinds );
		assert.ok( kinds.google > 0 && kinds.password > 0 && kinds.both > 0, JSON.stringify( kinds ) );
		assert.equal( stats.json.totals.accounts, kinds.google + kinds.password + kinds.both );
		assert.ok( ! /racer_1|linker/i.test( stats.text ), 'a username on the admin page' );

	} );

	test( 'a username never shows on the boards: the nickname does', async () => {

		const board = await call( server, '/api/leaderboard?period=all', { time: ACCOUNT_DAY + 3 * MINUTE } );
		assert.equal( board.status, 200 );
		assert.ok( ! /Same_Me/.test( board.text ) );
		assert.ok( board.text.includes( 'Same Me' ) );

	} );

} );

// What DriveLimits keeps on `server` (limits.js), every table's rows, read from a copy of its
// Durable Object's SQLite file as wrangler stores it.
function limitsRows( server ) {

	for ( const file of listFiles( server.state ).filter( path => path.endsWith( '.sqlite' ) ) ) {

		const dir = mkdtempSync( join( tmpdir(), 'drive-limits-' ) );
		try {

			for ( const end of [ '', '-wal', '-shm' ] ) if ( existsSync( file + end ) ) copyFileSync( file + end, join( dir, `copy.sqlite${ end }` ) );
			const db = new DatabaseSync( join( dir, 'copy.sqlite' ) );
			try {

				if ( ! db.prepare( 'SELECT name FROM sqlite_master WHERE name = \'password_fails\'' ).get() ) continue;
				const tables = db.prepare( 'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'\\_%\' ESCAPE \'\\\' AND name NOT LIKE \'sqlite%\'' ).all();
				return Object.fromEntries( tables.map( ( { name } ) => [ name, db.prepare( `SELECT * FROM "${ name }"` ).all() ] ) );

			} finally {

				db.close();

			}

		} finally {

			rmSync( dir, { recursive: true, force: true } );

		}

	}

	throw new Error( 'No DriveLimits storage' );

}

describe( 'The Supporter Pass\'s settings', () => {

	const full = { GOOGLE_CLIENT_ID: CLIENT_ID, SUPPORTER_PAYMENT_LINK: PASS_LINK, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SUPPORTER_PRICE: ' CA$19.99 ' };

	test( 'buying is on only with the client id, an https link and a whsec_ secret (and a plink_ id, if any)', () => {

		assert.deepEqual( purchaseSettings( full ), { link: PASS_LINK, price: 'CA$19.99' } );
		assert.deepEqual( purchaseSettings( { ...full, SUPPORTER_PAYMENT_LINK_ID: PASS_LINK_ID } ), { link: PASS_LINK, price: 'CA$19.99' } );
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
		assert.deepEqual( purchaseFor( full, { id: 7 } ), { enabled: true, link: PASS_LINK, price: 'CA$19.99', clientReferenceId: '7' } );

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

// search.js by itself (called here, the Worker's cache and DriveLimits stood in for, DriveLimits'
// geocode count on node:sqlite): Google's Geocoding when GOOGLE_GEOCODING_KEY is set (a stand-in at
// GEOCODING_UPSTREAM), the daily cap, the short cache when Google couldn't be asked, and
// Nominatim's second try for an address with a house number.
describe( 'World Drive search by itself: Google\'s Geocoding, its cap, the brief cache, Nominatim\'s second try', () => {

	let stand;
	let standBase;
	const google = [];
	const osm = [];
	// What each stand-in answers: Google's (params) => body, Nominatim's (params) => array.
	let googleAnswer = () => ( { status: 'ZERO_RESULTS', results: [] } );
	let osmAnswer = () => [];
	let searchModule;
	let geocodes;
	const KEY = 'AIzaTestGeocodingKey000000000000000000';
	const NOON = Date.UTC( 2030, 2, 4, 12 );
	const ROUTE = { formatted_address: 'W 12th Ave, Vancouver, BC, Canada', geometry: { location: { lat: 49.2606, lng: - 123.1144 } }, types: [ 'route' ] };
	const HOUSE = { formatted_address: '453 W 12th Ave, Vancouver, BC V5Y 1V4, Canada', geometry: { location: { lat: 49.26105, lng: - 123.11389 } }, types: [ 'street_address' ], partial_match: false };
	const OSM_STREET = { display_name: 'West 12th Avenue, Mount Pleasant, Vancouver, British Columbia, Canada', lat: '49.2606', lon: '-123.1144', type: 'secondary', addresstype: 'road', address: { road: 'West 12th Avenue', city: 'Vancouver' } };
	const OSM_HOUSE = { display_name: '453, West 12th Avenue, Mount Pleasant, Vancouver, British Columbia, V5Y 1V4, Canada', lat: '49.26104', lon: '-123.11391', type: 'house', addresstype: 'place', address: { house_number: '453', road: 'West 12th Avenue', city: 'Vancouver' } };

	before( async () => {

		await loadWorker();
		searchModule = await import( '../worker/drive/search.js' );
		const { DriveLimits } = await import( '../worker/drive/limits.js' );
		const db = new DatabaseSync( ':memory:' );
		const sql = { exec: ( query, ...values ) => {

			const rows = db.prepare( query ).all( ...values ).map( row => ( { ...row } ) );
			return { toArray: () => rows, one: () => rows[ 0 ] };

		} };
		geocodes = new DriveLimits( { storage: { sql, transactionSync: run => run() } }, { TURNSTILE_SECRET: PASS_SECRET } );
		stand = createServer( ( req, res ) => {

			const url = new URL( req.url, 'http://stand' );
			const params = Object.fromEntries( url.searchParams );
			if ( url.pathname === '/geocode' ) {

				google.push( params );
				return send( res, 200, googleAnswer( params ) );

			}

			osm.push( params );
			send( res, 200, osmAnswer( params ) );

		} );
		await new Promise( resolve => stand.listen( 0, '127.0.0.1', resolve ) );
		standBase = `http://127.0.0.1:${ stand.address().port }`;

	} );

	after( () => stand?.close() );

	// Cloudflare's cache for one run of searches: what was put in it, by key.
	function newCache() {

		const kept = new Map();
		return {
			kept,
			match: async request => kept.has( request.url ) ? new Response( kept.get( request.url ).body, { headers: kept.get( request.url ).headers } ) : undefined,
			put: async ( request, response ) => kept.set( request.url, { body: await response.text(), headers: Object.fromEntries( response.headers ) } ),
		};

	}

	// A search as the Worker makes it: { status, json, text, maxAge, hit, cache }.
	async function ask( q, { env = {}, cache = newCache(), now = NOON, slot = () => ( { wait: 0 } ), ip = '203.0.113.7', account } = {} ) {

		const was = globalThis.caches;
		globalThis.caches = { default: cache };
		const waits = [];
		try {

			const res = await searchModule.search( {
				env: { SEARCH_UPSTREAM: `${ standBase }/search`, ...env },
				url: new URL( `https://worlddrive.app/api/search?q=${ encodeURIComponent( q ) }` ),
				request: new Request( 'https://worlddrive.app/api/search', { headers: { 'CF-Connecting-IP': ip } } ),
				account,
				ctx: { waitUntil: promise => waits.push( promise ) },
				limits: { searchSlot: slot, geocodeTurn: options => geocodes.geocodeTurn( options ) },
				now,
			} );
			await Promise.all( waits );
			const text = await res.text();
			return { status: res.status, json: JSON.parse( text ), text, maxAge: Number( /max-age=(\d+)/.exec( res.headers.get( 'Cache-Control' ) ?? '' )?.[ 1 ] ), hit: res.headers.get( 'X-Search-Cache' ) === 'hit', cache };

		} finally {

			globalThis.caches = was;

		}

	}

	const withGoogle = ( more = {} ) => ( { GOOGLE_GEOCODING_KEY: KEY, GEOCODING_UPSTREAM: `${ standBase }/geocode`, ...more } );

	test( 'addresses: a house number, a street written short, a postcode and a town told apart; the street written out; the second question', () => {

		const { hasHouseNumber, expandStreet, retryOf } = searchModule;
		for ( const q of [ '453 w 12th ave, vancouver', '10 downing street', '221b baker street, london', '1600 pennsylvania ave nw, washington', 'hauptstraße 5, berlin', '12-14 rue de rivoli, paris' ] ) assert.ok( hasHouseNumber( q ), q );
		for ( const q of [ 'furka pass', '10115 berlin', 'route 66', 'w 12th ave, vancouver', 'cn tower', '46.57, 8.42' ] ) assert.ok( ! hasHouseNumber( q ), q );
		assert.equal( expandStreet( '453 w 12th ave' ), '453 west 12th avenue' );
		assert.equal( expandStreet( '1600 pennsylvania ave. nw' ), '1600 pennsylvania avenue northwest' );
		assert.equal( expandStreet( '12 st clair ave e' ), '12 st clair avenue east' );
		assert.equal( expandStreet( '5 n park blvd' ), '5 north park boulevard' );
		assert.equal( expandStreet( '8 kings hwy' ), '8 kings highway' );
		for ( const [ short, long ] of [ [ 'rd', 'road' ], [ 'dr', 'drive' ], [ 'cres', 'crescent' ], [ 'pl', 'place' ], [ 'ct', 'court' ], [ 'ln', 'lane' ], [ 'pkwy', 'parkway' ], [ 'sq', 'square' ], [ 'terr', 'terrace' ], [ 'st', 'street' ] ] ) assert.equal( expandStreet( `9 oak ${ short }` ), `9 oak ${ long }` );
		assert.deepEqual( retryOf( '453 w 12th ave, vancouver' ), { street: '453 west 12th avenue', city: 'vancouver' } );
		// A state, province or country after the town: the whole query, so it still says which town.
		assert.deepEqual( retryOf( '453 w 12th ave, vancouver, bc' ), { q: '453 west 12th avenue, vancouver, bc' } );
		assert.deepEqual( retryOf( '123 main st, springfield, illinois' ), { q: '123 main street, springfield, illinois' } );
		assert.deepEqual( retryOf( '453 w 12th ave' ), { q: '453 west 12th avenue' } );
		assert.equal( retryOf( '10 downing street' ), null, 'nothing new to ask' );
		// A number in a place's own name isn't a house number.
		for ( const q of [ 'pier 39, san francisco', 'route 66, arizona', 'highway 1, big sur', 'studio 54, new york', 'area 51, nevada', 'terminal 5, heathrow' ] ) assert.ok( ! hasHouseNumber( q ), q );
		for ( const q of [ 'kalverstraat 10, amsterdam', 'via roma 10, milano', 'pier 39, hauptstraße 5, berlin' ] ) assert.ok( hasHouseNumber( q ), q );
		// A letter that is the street's name stays a letter (Washington's E Street; "Avenue E"); "St"
		// before more of the name is Saint.
		assert.equal( expandStreet( '100 e st nw' ), '100 e street northwest' );
		assert.equal( expandStreet( '5 n st' ), '5 n street' );
		assert.equal( expandStreet( '1 avenue e' ), '1 avenue e' );
		assert.equal( expandStreet( '10 rue st denis' ), '10 rue st denis' );
		assert.equal( expandStreet( '10 w main st' ), '10 west main street' );
		assert.deepEqual( retryOf( '100 e st nw, washington' ), { street: '100 e street northwest', city: 'washington' } );

	} );

	test( 'with a key, Google answers an address: its street address first, credited to Google, cached a day, the key never in the answer', async () => {

		google.length = 0;
		osm.length = 0;
		googleAnswer = () => ( { status: 'OK', results: [ ROUTE, HOUSE, { formatted_address: 'Nowhere', geometry: { location: { lat: 200, lng: 0 } }, types: [ 'route' ] } ] } );
		const first = await ask( '453 W 12th Ave, Vancouver', { env: withGoogle() } );
		assert.equal( first.status, 200 );
		assert.deepEqual( first.json, {
			results: [
				{ name: '453 W 12th Ave, Vancouver, BC V5Y 1V4, Canada', lat: 49.26105, lon: - 123.11389, type: 'street_address', house: true },
				{ name: 'W 12th Ave, Vancouver, BC, Canada', lat: 49.2606, lon: - 123.1144, type: 'route', house: false },
			],
			provider: 'google',
			streetOnly: false,
		} );
		assert.equal( first.maxAge, 86400 );
		assert.ok( ! first.text.includes( KEY ) );
		assert.deepEqual( google, [ { address: '453 w 12th ave, vancouver', language: 'en', key: KEY } ] );
		assert.deepEqual( osm, [], 'OpenStreetMap was asked too' );
		// Kept by the tidied query and that Google is set up.
		assert.deepEqual( [ ...first.cache.kept.keys() ], [ 'https://worlddrive.app/api/search?q=453%20w%2012th%20ave%2C%20vancouver&via=google' ] );
		const again = await ask( '453  w 12TH ave, Vancouver', { env: withGoogle(), cache: first.cache } );
		assert.ok( again.hit );
		assert.equal( again.json.results[ 0 ].type, 'street_address' );
		assert.equal( google.length, 1, 'a cached answer went to Google again' );

	} );

	test( 'Google refusing (REQUEST_DENIED and the rest) or not answering: OpenStreetMap answers, kept 10 minutes, logged once', async () => {

		google.length = 0;
		osm.length = 0;
		googleAnswer = () => ( { status: 'REQUEST_DENIED', error_message: 'This API project is not authorized to use this API.', results: [] } );
		osmAnswer = () => [ OSM_HOUSE ];
		const warned = [];
		const warn = console.warn;
		console.warn = message => warned.push( message );
		try {

			const res = await ask( '453 W 12th Ave, Vancouver', { env: withGoogle() } );
			assert.equal( res.json.provider, 'osm' );
			assert.equal( res.json.results[ 0 ].house, true );
			assert.equal( res.json.streetOnly, false );
			assert.equal( res.maxAge, 600 );
			assert.equal( ( await ask( '12 Main St, Vancouver', { env: withGoogle() } ) ).maxAge, 600 );
			assert.equal( google.length, 2 );
			assert.equal( warned.filter( m => /REQUEST_DENIED/.test( m ) ).length, 1, warned.join( '\n' ) );
			assert.ok( ! warned.join( ' ' ).includes( KEY ) );
			for ( const status of [ 'OVER_QUERY_LIMIT', 'INVALID_REQUEST', 'UNKNOWN_ERROR' ] ) {

				googleAnswer = () => ( { status, results: [] } );
				const refused = await ask( '7 Oak Rd, Leeds', { env: withGoogle() } );
				assert.deepEqual( [ refused.json.provider, refused.maxAge ], [ 'osm', 600 ], status );

			}

			// No answer at all (nothing listening there).
			const closed = createServer();
			await new Promise( resolve => closed.listen( 0, '127.0.0.1', resolve ) );
			const nobody = `http://127.0.0.1:${ closed.address().port }/geocode`;
			await new Promise( resolve => closed.close( resolve ) );
			const down = await ask( '7 Oak Rd, Leeds', { env: withGoogle( { GEOCODING_UPSTREAM: nobody } ) } );
			assert.deepEqual( [ down.status, down.json.provider, down.maxAge ], [ 200, 'osm', 600 ] );

		} finally {

			console.warn = warn;

		}

	} );

	test( 'Google finding nothing (ZERO_RESULTS): OpenStreetMap\'s answer, kept a day', async () => {

		googleAnswer = () => ( { status: 'ZERO_RESULTS', results: [] } );
		osmAnswer = () => [ OSM_HOUSE ];
		const res = await ask( '453 W 12th Ave, Vancouver', { env: withGoogle() } );
		assert.deepEqual( [ res.json.provider, res.maxAge ], [ 'osm', 86400 ] );

	} );

	test( 'GEOCODE_DAILY lookups a day for everyone, then OpenStreetMap (kept 10 minutes) until midnight UTC; a place\'s name goes to OpenStreetMap first', async () => {

		google.length = 0;
		osm.length = 0;
		googleAnswer = () => ( { status: 'OK', results: [ HOUSE ] } );
		osmAnswer = params => params.q === 'nowhere at all' ? [] : [ OSM_STREET ];
		const day = Date.UTC( 2030, 3, 1, 9 );
		const env = withGoogle( { GEOCODE_DAILY: '2' } );
		assert.equal( ( await ask( '1 A St, Vancouver', { env, now: day } ) ).json.provider, 'google' );
		// A place's name: OpenStreetMap first, and as it found something, Google isn't asked (nor counted).
		const named = await ask( 'Vancouver', { env, now: day } );
		assert.deepEqual( [ named.json.provider, named.maxAge ], [ 'osm', 86400 ] );
		// Nothing there: Google is (and counted).
		assert.equal( ( await ask( 'Nowhere at all', { env, now: day } ) ).json.provider, 'google' );
		assert.equal( google.length, 2 );
		const capped = await ask( '3 C St, Vancouver', { env, now: day + HOUR } );
		assert.deepEqual( [ capped.json.provider, capped.maxAge ], [ 'osm', 600 ] );
		assert.equal( google.length, 2, 'Google was asked past the day\'s cap' );
		assert.deepEqual( await geocodes.geocodeTurn( { now: day + HOUR, daily: 2 } ), { ok: false, reason: 'daily', retryAfter: 14 * 60 * 60 } );
		// The next day, Google again.
		assert.equal( ( await ask( '3 C St, Vancouver', { env, now: day + DAY } ) ).json.provider, 'google' );
		assert.equal( google.length, 3 );
		// 0 keeps Google off; unset, 300.
		assert.equal( ( await ask( '4 D St, Vancouver', { env: withGoogle( { GEOCODE_DAILY: '0' } ), now: day + 2 * DAY } ) ).json.provider, 'osm' );
		assert.equal( google.length, 3 );
		assert.equal( ( await ask( '4 D St, Vancouver', { env: withGoogle(), now: day + 2 * DAY } ) ).json.provider, 'google' );
		assert.deepEqual( await geocodes.geocodeTurn( { now: day + 2 * DAY, daily: 300 } ), { ok: true, left: 298 } );

	} );

	test( 'GEOCODE_PER_VISITOR lookups a day for each visitor (an address, an IPv6 one by its /48, or a Build account), then OpenStreetMap for it alone (kept 10 minutes)', async () => {

		google.length = 0;
		googleAnswer = () => ( { status: 'OK', results: [ HOUSE ] } );
		osmAnswer = () => [ OSM_STREET ];
		const day = Date.UTC( 2030, 5, 1, 9 );
		const env = withGoogle( { GEOCODE_PER_VISITOR: '2' } );
		const from = ( q, more = {} ) => ask( q, { env, now: day, ...more } ).then( res => [ res.json.provider, res.maxAge ] );
		assert.deepEqual( await from( '1 a b st, x', { ip: '198.51.100.1' } ), [ 'google', 86400 ] );
		assert.deepEqual( await from( '2 a b st, x', { ip: '198.51.100.1' } ), [ 'google', 86400 ] );
		// A script looping over made-up addresses from one address: OpenStreetMap, briefly kept.
		assert.deepEqual( await from( '3 a b st, x', { ip: '198.51.100.1' } ), [ 'osm', 600 ] );
		assert.deepEqual( await from( '4 a b st, x', { ip: '198.51.100.1' } ), [ 'osm', 600 ] );
		assert.equal( google.length, 2, 'Google was asked past a visitor\'s share' );
		// Everyone else still gets Google; one IPv6 /48 is one visitor; a Build account is its own.
		assert.deepEqual( await from( '5 a b st, x', { ip: '198.51.100.2' } ), [ 'google', 86400 ] );
		assert.deepEqual( await from( '6 a b st, x', { ip: '2001:db8:1:1::1' } ), [ 'google', 86400 ] );
		assert.deepEqual( await from( '7 a b st, x', { ip: '2001:db8:1:2::1' } ), [ 'google', 86400 ] );
		assert.deepEqual( await from( '8 a b st, x', { ip: '2001:db8:1:3::1' } ), [ 'osm', 600 ] );
		assert.deepEqual( await from( '9 a b st, x', { ip: '198.51.100.1', account: { id: 42 } } ), [ 'google', 86400 ] );
		assert.equal( google.length, 6 );
		// A refused visitor isn't counted towards everyone's day, nor itself.
		assert.deepEqual( await geocodes.geocodeTurn( { now: day, daily: 300, visitor: '198.51.100.1', perVisitor: 2 } ), { ok: false, reason: 'visitor', retryAfter: 15 * 60 * 60 } );
		assert.deepEqual( await geocodes.geocodeTurn( { now: day, daily: 300 } ), { ok: true, left: 293 } );
		// The next day, a fresh share.
		assert.deepEqual( await from( '3 a b st, x', { ip: '198.51.100.1', now: day + DAY } ), [ 'google', 86400 ] );
		// Unset, 30 each.
		google.length = 0;
		for ( let i = 0; i < 31; i ++ ) await ask( `${ i } c d st, x`, { env: withGoogle(), now: day + 2 * DAY, ip: '198.51.100.9' } );
		assert.equal( google.length, 30 );

	} );

	test( 'no key (or one that isn\'t a key): OpenStreetMap alone, as before, kept a day', async () => {

		google.length = 0;
		osm.length = 0;
		osmAnswer = () => [ OSM_HOUSE ];
		for ( const env of [ {}, { GOOGLE_GEOCODING_KEY: '' }, { GOOGLE_GEOCODING_KEY: 'your key here' } ] ) {

			const res = await ask( '453 W 12th Ave, Vancouver', { env } );
			assert.deepEqual( [ res.json.provider, res.maxAge, res.json.results[ 0 ].house ], [ 'osm', 86400, true ] );
			assert.deepEqual( [ ...res.cache.kept.keys() ], [ 'https://worlddrive.app/api/search?q=453%20w%2012th%20ave%2C%20vancouver&via=osm' ] );

		}

		assert.equal( google.length, 0 );
		assert.equal( osm.length, 3 );

	} );

	test( 'OpenStreetMap finding only the street for a house number is asked once more, the street written out (structured, with a town); the house first, else "street only"', async () => {

		osm.length = 0;
		osmAnswer = params => params.street ? [ OSM_HOUSE ] : [ OSM_STREET ];
		const found = await ask( '453 W 12th Ave, Vancouver' );
		assert.deepEqual( osm.map( params => params.q ?? `${ params.street } | ${ params.city }` ), [ '453 w 12th ave, vancouver', '453 west 12th avenue | vancouver' ] );
		assert.equal( osm[ 1 ].addressdetails, '1' );
		assert.deepEqual( found.json.results.map( r => [ r.name, r.house ] ), [ [ OSM_HOUSE.display_name, true ], [ OSM_STREET.display_name, false ] ] );
		assert.equal( found.json.streetOnly, false );

		// No town: the whole query, written out.
		osm.length = 0;
		osmAnswer = params => params.q === '453 west 12th avenue' ? [ OSM_HOUSE ] : [ OSM_STREET ];
		assert.equal( ( await ask( '453 W 12th Ave' ) ).json.results[ 0 ].house, true );
		assert.deepEqual( osm.map( params => params.q ), [ '453 w 12th ave', '453 west 12th avenue' ] );

		// Still only the street: it says so.
		osm.length = 0;
		osmAnswer = () => [ OSM_STREET ];
		const street = await ask( '453 W 12th Ave, Vancouver' );
		assert.deepEqual( [ street.json.results.length, street.json.streetOnly ], [ 1, true ] );
		assert.equal( osm.length, 2 );

		// A house the first time, or no house number: asked once.
		osm.length = 0;
		osmAnswer = () => [ OSM_HOUSE ];
		await ask( '453 W 12th Ave, Vancouver' );
		osmAnswer = () => [ OSM_STREET ];
		await ask( 'W 12th Ave, Vancouver' );
		assert.equal( osm.length, 2 );

		// The queue full for the second question: the first answer stands; a busy first is a 429.
		osm.length = 0;
		let turns = 0;
		const busySecond = () => ++ turns === 1 ? { wait: 0 } : { busy: true, retryAfter: 2 };
		const first = await ask( '453 W 12th Ave, Vancouver', { slot: busySecond } );
		assert.deepEqual( [ first.json.streetOnly, osm.length ], [ true, 1 ] );
		await assert.rejects( ask( '9 Oak Rd, Leeds', { slot: () => ( { busy: true, retryAfter: 2 } ) } ), err => err.status === 429 );

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
		assert.deepEqual( await ask( [ X ] ), { cells: [ X ], full: { earth: false, moon: false, mars: false, vesta: false, ceres: false }, done: false } );
		assert.deepEqual( await ask( [ X ] ), { cells: [], full: { earth: false, moon: false, mars: false, vesta: false, ceres: false }, done: false } );
		// Its third: done, though it has places to spare.
		assert.deepEqual( await ask( [ X ] ), { cells: [], full: { earth: false, moon: false, mars: false, vesta: false, ceres: false }, done: true } );
		// Asked again (by another Worker instance, which hasn't heard): a new place isn't counted.
		assert.deepEqual( await ask( [ Y ] ), { cells: [], full: { earth: false, moon: false, mars: false, vesta: false, ceres: false }, done: true } );
		assert.deepEqual( db.prepare( 'SELECT count, asks FROM place_visits' ).all().map( row => ( { ...row } ) ), [ { count: 1, asks: 4 } ] );

	} );

	test( 'each world\'s day is its own, Mars\'s too: its cells counted in its own total, and full when that reaches the day\'s', async () => {

		await loadWorker();
		const { DriveLimits } = await import( '../worker/drive/limits.js' );
		const db = new DatabaseSync( ':memory:' );
		const sql = { exec: ( query, ...values ) => {

			const rows = db.prepare( query ).all( ...values ).map( row => ( { ...row } ) );
			return { toArray: () => rows, one: () => rows[ 0 ] };

		} };
		const limits = new DriveLimits( { storage: { sql, transactionSync: run => run() } }, { TURNSTILE_SECRET: PASS_SECRET } );
		const now = Date.UTC( 2026, 10, 16, 12 );
		const ask = ( cells, visit ) => limits.places( '198.51.100.78', { now, visit, since: now - HOUR, cells, daily: 2, perVisitor: 100, perVisit: 10, gap: 10000, asks: 3 } );
		const [ gale, jezero, olympus ] = [ [ - 4.59, 137.44 ], [ 18.44, 77.45 ], [ 18.65, - 133.8 ] ].map( ( [ lat, lon ] ) => cellOf( 'mars', lat, lon ) );
		const paris = cellOf( 'earth', 48.87, 2.31 );
		assert.deepEqual( await ask( [ gale ], 'B'.repeat( 22 ) ), { cells: [ gale ], full: { earth: false, moon: false, mars: false, vesta: false, ceres: false }, done: false } );
		// Mars's day's two: the second, then none; the Earth's day still open.
		assert.deepEqual( await ask( [ jezero, olympus, paris ], 'C'.repeat( 22 ) ), { cells: [ jezero, paris ], full: { earth: false, moon: false, mars: true, vesta: false, ceres: false }, done: false } );
		assert.deepEqual( db.prepare( 'SELECT world, count FROM place_totals ORDER BY world' ).all().map( row => ( { ...row } ) ), [ { world: 'earth', count: 1 }, { world: 'mars', count: 2 } ] );
		// A world that isn't one: never counted.
		assert.deepEqual( ( await ask( [ 'pluto:1:1' ], 'D'.repeat( 22 ) ) ).cells, [] );

	} );

} );

describe( 'DriveLimits\' Earth visits by themselves', () => {

	test( 'a supporter\'s visits are counted by their account alone: the day\'s cap for everyone neither holds them nor counts them, even with the school\'s address used up', async () => {

		await loadWorker();
		const { DriveLimits } = await import( '../worker/drive/limits.js' );
		const db = new DatabaseSync( ':memory:' );
		const sql = { exec: ( query, ...values ) => {

			const rows = db.prepare( query ).all( ...values ).map( row => ( { ...row } ) );
			return { toArray: () => rows, one: () => rows[ 0 ] };

		} };
		const limits = new DriveLimits( { storage: { sql, transactionSync: run => run() } }, { TURNSTILE_SECRET: PASS_SECRET } );
		const now = Date.UTC( 2026, 10, 23, 12 );
		const free = ip => limits.visit( ip, { now, daily: 3, perVisitor: 1 } );
		const supporter = id => limits.visit( `account:${ id }`, { now, daily: null, perVisitor: 2 } );
		// The school's address has had its free drive, and the day's three are all gone.
		assert.equal( ( await free( '203.0.113.9' ) ).ok, true );
		assert.equal( ( await free( '203.0.113.9' ) ).reason, 'visitor' );
		assert.equal( ( await free( '198.51.100.1' ) ).ok, true );
		assert.equal( ( await free( '198.51.100.2' ) ).ok, true );
		assert.equal( ( await free( '198.51.100.3' ) ).reason, 'daily' );
		// Supporters at that school still drive, each to their own account's count.
		assert.deepEqual( await supporter( 7 ), { ok: true, left: 1 } );
		assert.deepEqual( await supporter( 7 ), { ok: true, left: 0 } );
		assert.equal( ( await supporter( 7 ) ).reason, 'visitor' );
		assert.deepEqual( await supporter( 8 ), { ok: true, left: 1 } );
		// And none of theirs counted towards the day's cap: still the three free ones.
		assert.equal( db.prepare( 'SELECT visits FROM days' ).get().visits, 3 );

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
			// (No database here, so no usernames and passwords.)
			assert.deepEqual( await config.json(), { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, googleClientId: '', passwords: false, live: true, liveMoon: true, liveWorlds: { earth: { open: true }, moon: { open: true }, mars: { open: true }, vesta: { open: true }, ceres: { open: true } } }, name );

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

// --- Google AdSense: /api/config's adsense and /ads.txt ---------------------------------------

// Made up, in AdSense's formats.
const AD_CLIENT = 'ca-pub-1234567890123456';
const AD_SLOT = '9876543210';

describe( 'World Drive Worker with AdSense set', () => {

	test( '/api/config has adsense only for a publisher id (and an ad unit\'s slot, or none) in their formats, and /ads.txt says the id, else is a 404', async () => {

		const worker = await loadWorker();
		const limits = { liveOpen: async () => ( { open: true, spent: 1 } ) };
		const base = { TURNSTILE_SITE_KEY: '1x00000000000000000000AA', LIMITS: { idFromName: id => id, get: () => limits } };
		const ask = async ( vars, path = '/api/config', init = {} ) => worker.fetch( new Request( `https://worlddrive.app${ path }`, init ), { ...base, ...vars }, {} );
		const configOf = async vars => ( await ( await ask( vars ) ).json() ).adsense;
		const LINE = 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n';

		// On: the id, and the slot or ''; spaces round them don't count.
		for ( const [ vars, adsense ] of [
			[ { ADSENSE_CLIENT: AD_CLIENT }, { client: AD_CLIENT, slot: '' } ],
			[ { ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: '' }, { client: AD_CLIENT, slot: '' } ],
			[ { ADSENSE_CLIENT: ` ${ AD_CLIENT } `, ADSENSE_SLOT: ` ${ AD_SLOT } ` }, { client: AD_CLIENT, slot: AD_SLOT } ],
			[ { ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: '123456' }, { client: AD_CLIENT, slot: '123456' } ],
			[ { ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: '123456789012' }, { client: AD_CLIENT, slot: '123456789012' } ],
		] ) {

			assert.deepEqual( await configOf( vars ), adsense, JSON.stringify( vars ) );
			const res = await ask( vars, '/ads.txt' );
			assert.equal( res.status, 200, JSON.stringify( vars ) );
			assert.equal( res.headers.get( 'Content-Type' ), 'text/plain; charset=utf-8' );
			assert.equal( await res.text(), LINE );
			const head = await ask( vars, '/ads.txt', { method: 'HEAD' } );
			assert.equal( head.status, 200 );
			assert.equal( await head.text(), '' );

		}

		// Off: unset, empty, or either one not in its format. Nothing about ads in the config at all.
		for ( const vars of [
			{}, { ADSENSE_CLIENT: '' }, { ADSENSE_CLIENT: '   ', ADSENSE_SLOT: AD_SLOT },
			{ ADSENSE_CLIENT: 'pub-1234567890123456' }, { ADSENSE_CLIENT: 'ca-pub-123456789012345' }, { ADSENSE_CLIENT: 'ca-pub-12345678901234567' },
			{ ADSENSE_CLIENT: 'ca-pub-12345678901234ab' }, { ADSENSE_CLIENT: 'CA-PUB-1234567890123456' }, { ADSENSE_CLIENT: `${ AD_CLIENT }\nbad` },
			{ ADSENSE_CLIENT: `<script>${ AD_CLIENT }` }, { ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: '12345' }, { ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: '1234567890123' },
			{ ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: 'slot-1234' }, { ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: '1234 5678' }, { ADSENSE_CLIENT: 1234567890123456 },
		] ) {

			const json = await ( await ask( vars ) ).json();
			assert.ok( ! ( 'adsense' in json ), JSON.stringify( vars ) );
			assert.deepEqual( Object.keys( json ).sort(), [ 'googleClientId', 'live', 'liveMoon', 'liveWorlds', 'mapsOn', 'passwords', 'turnstileSiteKey' ], JSON.stringify( vars ) );
			const res = await ask( vars, '/ads.txt' );
			assert.equal( res.status, 404, JSON.stringify( vars ) );
			assert.ok( ! ( await res.text() ).includes( 'google.com' ) );

		}

		// Nothing but reading it; and on www, sent to worlddrive.app as everything is.
		assert.equal( ( await ask( { ADSENSE_CLIENT: AD_CLIENT }, '/ads.txt', { method: 'POST' } ) ).status, 405 );
		const www = await worker.fetch( new Request( 'https://www.worlddrive.app/ads.txt' ), { ADSENSE_CLIENT: AD_CLIENT }, {} );
		assert.equal( www.status, 301 );
		assert.equal( www.headers.get( 'Location' ), 'https://worlddrive.app/ads.txt' );

	} );

	test( 'under wrangler dev with wrangler.drive.jsonc (its run_worker_first): /ads.txt reaches the Worker, even with a file of that name in the assets; off as the file has it, a 404', async () => {

		const vars = { GOOGLE_CLIENT_ID: '', TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET: PASS_SECRET };
		// A stale ads.txt among the built files never answers for the Worker.
		const assets = { 'ads.txt': 'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n' };
		let server = await startWorker( { port: PORT, config: 'wrangler.drive.jsonc', vars: { ...vars, ADSENSE_CLIENT: AD_CLIENT, ADSENSE_SLOT: AD_SLOT }, assets } );
		try {

			const config = await call( server, '/api/config' );
			assert.deepEqual( config.json.adsense, { client: AD_CLIENT, slot: AD_SLOT } );
			const txt = await call( server, '/ads.txt' );
			assert.equal( txt.status, 200 );
			assert.equal( txt.text, 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n' );
			assert.match( txt.headers.get( 'Content-Type' ), /^text\/plain/ );

		} finally {

			server.stop();

		}

		// With ADSENSE_CLIENT empty (the harness's default, whatever wrangler.drive.jsonc has): off.
		server = await startWorker( { port: PORT, config: 'wrangler.drive.jsonc', vars, assets } );
		try {

			const config = await call( server, '/api/config' );
			assert.equal( config.status, 200 );
			assert.ok( ! ( 'adsense' in config.json ), config.text );
			const txt = await call( server, '/ads.txt' );
			assert.equal( txt.status, 404 );
			assert.equal( txt.text, 'Not found' );

		} finally {

			server.stop();

		}

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
		assert.deepEqual( asked, [ { now: day, budgets: { earth: 1234, moon: 20000, mars: 4000, vesta: 3000, ceres: 3000 }, budget: 1234, moonBudget: 20000 } ] );
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
			// Every world 'unknown' then, but one known here without asking (switched off: Mars's budget
			// of 0) said as it is, so the page closes it from the start.
			const failing = await ( await worker.fetch( new Request( 'https://worlddrive.app/api/config', { headers: { 'X-Test-Time': String( day + MINUTE + 1 ) } } ), { ...env, LIVE_MARS_DAILY_BUDGET: '0' }, {} ) ).json();
			const unknown = { open: false, reason: 'unknown' };
			assert.deepEqual( failing.liveWorlds, { earth: unknown, moon: unknown, mars: { open: false }, vesta: unknown, ceres: unknown } );
			assert.deepEqual( [ failing.live, failing.liveReason, failing.liveMoon, failing.liveMoonReason ], [ false, 'unknown', false, 'unknown' ] );

		} finally {

			console.error = realError;

		}

		// Spent (every world's: the far worlds' too, or this Worker would still ask for them, every
		// FAR_OPEN_MS): off, saying why, and this Worker doesn't ask again that day (an ask is a request too).
		answer = { open: false, spent: 1234, worlds: { mars: { open: false, spent: 4000 }, vesta: { open: false, spent: 3000 }, ceres: { open: false, spent: 3000 } } };
		assert.deepEqual( await config( day + 2 * MINUTE ), { live: false, liveReason: 'budget' } );
		const asks = asked.length;
		assert.deepEqual( await config( day + 11 * HOUR ), { live: false, liveReason: 'budget' } );
		assert.equal( asked.length, asks );
		// The next day it asks again.
		answer = { open: true, spent: 1 };
		assert.deepEqual( await config( day + DAY ), { live: true, liveReason: undefined } );
		assert.equal( asked.length, asks + 1 );
		// A budget of 0 on every world, or LIVE off: off, without asking.
		const allOff = { LIVE_DAILY_BUDGET: '0', LIVE_MOON_DAILY_BUDGET: '0', LIVE_MARS_DAILY_BUDGET: '0', LIVE_VESTA_DAILY_BUDGET: '0', LIVE_CERES_DAILY_BUDGET: '0' };
		assert.deepEqual( await config( day + DAY, allOff ), { live: false, liveReason: undefined } );
		assert.deepEqual( await config( day + DAY, { LIVE: 'off' } ), { live: false, liveReason: undefined } );
		assert.equal( asked.length, asks + 1 );
		// The Earth's and the Moon's of 0 with the far worlds' open: off on the Earth (no reason), and
		// asked, for the far worlds (their budgets in the ask).
		const nearOff = await worker.fetch( new Request( 'https://worlddrive.app/api/config', { headers: { 'X-Test-Time': String( day + DAY + 1 ) } } ), { ...env, LIVE_DAILY_BUDGET: '0', LIVE_MOON_DAILY_BUDGET: '0' }, {} );
		const nearJson = await nearOff.json();
		assert.deepEqual( [ nearJson.live, nearJson.liveReason, nearJson.liveMoon ], [ false, undefined, false ] );
		assert.deepEqual( nearJson.liveWorlds, { earth: { open: false }, moon: { open: false }, mars: { open: true }, vesta: { open: true }, ceres: { open: true } } );
		assert.equal( asked.length, asks + 2 );
		assert.deepEqual( asked.at( - 1 ).budgets, { earth: 0, moon: 0, mars: 4000, vesta: 3000, ceres: 3000 } );

	} );

	test( '/api/config: the Moon\'s said apart (liveMoon), its rooms having a budget of their own: the Earth\'s spent and the Moon\'s open, still asked about for the Moon; both spent, not asked again that day; a Moon budget of 0, off there only', async () => {

		const worker = await loadWorker();
		const asked = [];
		let answer = { open: true, spent: 1, moon: { open: true, spent: 1 } };
		const limits = {
			liveOpen: async options => {

				asked.push( options );
				return answer;

			},
		};
		const env = { TEST_CLOCK: 'header', LIVE_DAILY_BUDGET: '1235', LIVE_MOON_DAILY_BUDGET: '321', LIMITS: { idFromName: id => id, get: () => limits } };
		// (And the Moon's reason, liveMoonReason, as the last answer said it.)
		let moonReason;
		const config = async ( time, more = {} ) => {

			const res = await worker.fetch( new Request( 'https://worlddrive.app/api/config', { headers: { 'X-Test-Time': String( time ) } } ), { ...env, ...more }, {} );
			const { live, liveReason, liveMoon, liveMoonReason } = await res.json();
			moonReason = liveMoonReason;
			return { live, liveReason, liveMoon };

		};
		const day = Date.UTC( 2030, 7, 1, 12 );
		assert.deepEqual( await config( day ), { live: true, liveReason: undefined, liveMoon: true } );
		assert.deepEqual( asked, [ { now: day, budgets: { earth: 1235, moon: 321, mars: 4000, vesta: 3000, ceres: 3000 }, budget: 1235, moonBudget: 321 } ] );
		// The Earth's spent: off there, saying why, and on on the Moon; asked again (for the Moon).
		answer = { open: false, spent: 1235, moon: { open: true, spent: 3 } };
		assert.deepEqual( await config( day + MINUTE ), { live: false, liveReason: 'budget', liveMoon: true } );
		assert.deepEqual( await config( day + 2 * MINUTE ), { live: false, liveReason: 'budget', liveMoon: true } );
		assert.equal( moonReason, undefined );
		assert.equal( asked.length, 3 );
		// The Moon's spent too: with the far worlds' budgets 0, neither asked about again that day.
		answer = { open: false, spent: 1235, moon: { open: false, spent: 321 } };
		const farOff = { LIVE_MARS_DAILY_BUDGET: '0', LIVE_VESTA_DAILY_BUDGET: '0', LIVE_CERES_DAILY_BUDGET: '0' };
		assert.deepEqual( await config( day + 3 * MINUTE, farOff ), { live: false, liveReason: 'budget', liveMoon: false } );
		assert.deepEqual( await config( day + HOUR, farOff ), { live: false, liveReason: 'budget', liveMoon: false } );
		assert.equal( moonReason, 'budget' );
		assert.equal( asked.length, 4 );
		// With the far worlds' open (the defaults), asked again, but at most once every FAR_OPEN_MS
		// (10 min) in this instance, the ask counted against the Earth's (spent) day.
		answer = { open: false, spent: 1235, moon: { open: false, spent: 321 }, worlds: { mars: { open: true, spent: 5 }, vesta: { open: true, spent: 1 }, ceres: { open: false, spent: 3000 } } };
		assert.deepEqual( await config( day + 2 * HOUR ), { live: false, liveReason: 'budget', liveMoon: false } );
		assert.equal( asked.length, 5 );
		for ( const later of [ MINUTE, 5 * MINUTE, 10 * MINUTE - 1 ] ) await config( day + 2 * HOUR + later );
		assert.equal( asked.length, 5 );
		await config( day + 2 * HOUR + 10 * MINUTE );
		assert.equal( asked.length, 6 );
		// (Ceres's said spent: its reason; Mars and Vesta open.)
		const far = await ( await worker.fetch( new Request( 'https://worlddrive.app/api/config', { headers: { 'X-Test-Time': String( day + 2 * HOUR + 11 * MINUTE ) } } ), env, {} ) ).json();
		assert.deepEqual( far.liveWorlds, { earth: { open: false, reason: 'budget' }, moon: { open: false, reason: 'budget' }, mars: { open: true }, vesta: { open: true }, ceres: { open: false, reason: 'budget' } } );
		assert.equal( asked.length, 6 );
		// All five known spent: not asked again that day.
		answer = { open: false, spent: 1235, moon: { open: false, spent: 321 }, worlds: { mars: { open: false, spent: 4000 }, vesta: { open: false, spent: 3000 }, ceres: { open: false, spent: 3000 } } };
		await config( day + 3 * HOUR );
		assert.equal( asked.length, 7 );
		await config( day + 5 * HOUR );
		assert.equal( asked.length, 7 );
		// The Moon's budget of 0: off there, the Earth's as it is (a new day, asked).
		answer = { open: true, spent: 1, moon: { open: true, spent: 1 } };
		assert.deepEqual( await config( day + DAY, { LIVE_MOON_DAILY_BUDGET: '0' } ), { live: true, liveReason: undefined, liveMoon: false } );
		// (Switched off there, not spent: no reason, so the page says nothing of lots of drivers.)
		assert.equal( moonReason, undefined );
		// And the Earth's of 0: on on the Moon.
		assert.deepEqual( await config( day + DAY + HOUR, { LIVE_DAILY_BUDGET: '0' } ), { live: false, liveReason: undefined, liveMoon: true } );

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
		// Mars's, as the Moon's: its drop-ins, the globe turned to it, its driving, its places searched
		// and its files not loading; a world that isn't one, none of them.
		assert.deepEqual( SEARCHES, [ 'earth', 'moon', 'mars', 'vesta', 'ceres', 'coordinates', 'nothing' ] );
		assert.deepEqual( PROBLEMS, [ 'no_ground', 'ride_failed', 'moon_failed', 'mars_failed', 'vesta_failed', 'ceres_failed', 'map_failed', 'map_session_ended', 'drop_abandoned' ] );
		assert.deepEqual( checkCounts( { 'dropin:mars': 2, 'world:mars': 1, 'play_world:mars': 30, 'search:mars': 4, 'problem:mars_failed': 1, 'dropin:pluto': 1, 'world:pluto': 1, 'play_world:pluto': 1, 'search:pluto': 1, 'problem:pluto_failed': 1 } ),
			[ [ 'dropin', 'mars', 2 ], [ 'world', 'mars', 1 ], [ 'play_world', 'mars', 30 ], [ 'search', 'mars', 4 ], [ 'problem', 'mars_failed', 1 ] ] );
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
		const rides = [ 'go-kart', ...LIBRARY_VEHICLES, ...WORKS_RIDES, ...DRIVE_CARS, ...PASS_RIDES ];
		const keysOf = {
			load: [ 'a'.repeat( 30 ) + '.' + 'b'.repeat( 33 ) ], load_time: [ 'under 2 s', '2-5 s', '5-10 s', '10-20 s', 'over 20 s' ], load_ms: [ 'total' ],
			dropin: [ ...SPOTS.map( spot => spot.id ), 'other', ...OFF_EARTH ], ride: rides, play: rides, play_with_others: [ 'all' ], garage_open: [ 'all' ], garage_edit: LOOK_PARTS,
			party: [ 'made', 'joined' ], funnel: FUNNEL, device: DEVICES, world: OFF_EARTH, play_world: WORLD_IDS, search: SEARCHES,
			dropin_time: [ 'under 5 s', '5-10 s', '10-20 s', '20-40 s', 'over 40 s' ], problem: PROBLEMS, board: [ 'open', 'named' ], pass: [ 'open', 'buy' ], level_up: [ 'all' ], ad: [ 'shown', 'blocked' ],
			challenge: [ 'open', 'start', 'finish', 'posted', 'nudge', 'nudge_open', 'share', 'link', 'link_start' ],
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

	test( 'a cell is about a kilometre each way at every latitude on every world, and holds what\'s in it', () => {

		assert.deepEqual( WORLD_IDS, [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ] );
		for ( const world of WORLD_IDS ) {

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
		// (Mars's grid on its 3,389.5 km sphere, as the Moon's on its: neither ever changes, or every cell
		// counted would move.)
		assert.equal( cellOf( 'mars', - 4.5895, 137.4417 ), 'mars:5052:18719' );

	} );

	test( 'only the grid\'s cells are taken, each with a drop-in in the same post, at most PLACES_PER_POST', () => {

		for ( const bad of [ null, 5, '', 'earth:1:1:1', 'earth:-1:0', 'earth:20015:0', 'earth:20014:3', 'moon:5458:0', 'moon:0:4', 'mars:10648:0', 'mars:0:4', 'pluto:1:1', 'Earth:1:1', 'Mars:1:1', 'earth:1.5:1', 'earth: 1:1', 'earth:123456:1', '48.87,2.30' ] ) {

			assert.equal( checkCell( bad ), null, String( bad ) );

		}

		assert.deepEqual( checkCell( 'earth:007:1' ), { world: 'earth', row: 7, column: 1, key: 'earth:7:1' } );
		assert.equal( cellOf( 'pluto', 1, 1 ), null );
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
		// Mars's cells by Mars's drop-ins alone: never through the Earth's or the Moon's, nor through a
		// drop-in at a world that isn't one (counted as the Earth's), however many.
		const gale = cellOf( 'mars', - 4.5895, 137.4417 );
		assert.deepEqual( keys( checkPlaces( [ golden, tycho, gale ], [ [ 'dropin', 'mars', 1 ] ] ) ), [ gale ] );
		assert.deepEqual( keys( checkPlaces( [ gale, tycho, golden ], [ [ 'dropin', 'other', 3 ], [ 'dropin', 'moon', 3 ] ] ) ), [ tycho, golden ] );
		assert.deepEqual( keys( checkPlaces( [ gale, golden ], [ [ 'dropin', 'pluto', 5 ] ] ) ), [ golden ] );
		assert.deepEqual( keys( checkPlaces( [ gale, 'pluto:1:1' ], [ [ 'dropin', 'mars', 1 ], [ 'dropin', 'pluto', 1 ] ] ) ), [ gale ] );

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
		// Mars's, the same, named up to 500 km off (it's about twice the Moon's size), its links to Mars.
		const curiosity = MARS_PLACES.find( p => p.id === 'mars-curiosity' );
		assert.deepEqual( named( 'mars', curiosity.lat, curiosity.lon ), { name: curiosity.name, region: curiosity.region, link: '/?spot=mars-curiosity', featured: true } );
		const nearest = ( lat, lon ) => MARS_PLACES.map( p => [ metresOn( 'mars', lat, lon, p.lat, p.lon ), p ] ).sort( ( a, b ) => a[ 0 ] - b[ 0 ] )[ 0 ];
		const olympus = MARS_PLACES.find( p => p.id === 'mars-olympus-mons' );
		for ( const metres of [ 120000, 300000, 450000 ] ) {

			const [ lat, lon ] = destination( 'mars', olympus.lat, olympus.lon, 70, metres );
			const [ far, place ] = nearest( lat, lon );
			const off = named( 'mars', lat, lon );
			assert.match( off.name, new RegExp( `^${ Math.round( far / 1000 ) } km [NESW]{1,2} of ${ place.name }$` ) );
			assert.deepEqual( [ off.region, off.featured, new URLSearchParams( off.link.slice( 2 ) ).get( 'world' ) ], [ '', false, 'mars' ] );

		}

		// Further than that from them all: its coordinates.
		const [ alone ] = [ [ 10, 10 ], [ 60, - 40 ], [ - 60, 100 ], [ 40, 160 ] ].filter( ( [ lat, lon ] ) => nearest( lat, lon )[ 0 ] > 500000 );
		assert.ok( alone );
		assert.match( named( 'mars', ...alone ).name, /^\d+\.\d\d° [NS], \d+\.\d\d° [EW]$/ );
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
		await assert.rejects( topCells( d1, { world: 'pluto', ...period } ), /No world pluto/ );
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

// --- challenges --------------------------------------------------------------------------

// Monday 16 November 2026, 15:00 UTC: a day, a week and a month under way. The month ends on Monday
// 30 November's night, a week after the next week starts.
const CHALLENGE_DAY = Date.UTC( 2026, 10, 16, 15, 0, 0 );
// CHALLENGE_MISSES's limit a minute (wrangler.drive.jsonc): a list, its four re-asks while a new
// period's routes are laid out, all fifteen boards and a time, with room to spare.
const CHALLENGE_MISSES = 24;
assert.equal( Number( /"name": "CHALLENGE_MISSES"[^}]*"limit": (\d+)/.exec( readFileSync( new URL( '../wrangler.drive.jsonc', import.meta.url ), 'utf8' ) )?.[ 1 ] ), CHALLENGE_MISSES );
const MOON_HEIGHTS = new URL( '../drive/public/moon/height.bin', import.meta.url );
const MARS_HEIGHTS = new URL( '../drive/public/mars/height.bin', import.meta.url );
const HEIGHTS_OF = { vesta: new URL( '../drive/public/vesta/height.bin', import.meta.url ), ceres: new URL( '../drive/public/ceres/height.bin', import.meta.url ) };

// The site's files as the Worker's ASSETS binding has them, for those that ask it: each world's
// heights by its own path (/moon/height.bin, /mars/height.bin, /vesta/..., /ceres/...), nothing else.
function heightsAssets() {

	const files = { '/moon/height.bin': MOON_HEIGHTS, '/mars/height.bin': MARS_HEIGHTS, '/vesta/height.bin': HEIGHTS_OF.vesta, '/ceres/height.bin': HEIGHTS_OF.ceres };
	return { fetch: async request => {

		const file = files[ new URL( request.url ).pathname ];
		return file ? new Response( readFileSync( file ) ) : new Response( 'Not found', { status: 404 } );

	} };

}

// `world`'s heights (one made in the page: the Moon's, Mars's, Vesta's, Ceres's) handed to the
// Worker's ground for it (challenges.js's GROUNDS: the Moon's is moon-height.js's own), as it hands
// them over itself.
function giveHeights( world ) {

	const bytes = readFileSync( { moon: MOON_HEIGHTS, mars: MARS_HEIGHTS, ...HEIGHTS_OF }[ world ] );
	GROUNDS[ world ].setHeights( new Int16Array( bytes.buffer, bytes.byteOffset, bytes.byteLength / 2 ) );

}

// A Moon (or Mars) route's points on steep ground that could have been elsewhere: all but the
// place's own pin (a sprint's or collectibles' start, a landmark's goal), which is where it is.
function movableFaults( route, world = 'moon' ) {

	const [ lat, lon ] = route.goal ? route.points[ 0 ] : [ route.start.lat, route.start.lon ];
	return [ [ route.start.lat, route.start.lon ], ...route.points ].filter( point => steepOn( world, ...point ) ).length - ( steepOn( world, lat, lon ) ? 1 : 0 );

}

// D1's shape over node:sqlite, the migrations applied: { db, DB, sql, pending } (sql: every statement
// run, as written; pending: the work left to finish after an answer, ctx.waitUntil's). `between(
// statements )` runs as a batch of writes comes, as another request's could land between one's reads
// and its writes.
function sqliteD1() {

	const db = new DatabaseSync( ':memory:' );
	const migrations = new URL( '../worker/drive/migrations/', import.meta.url );
	for ( const file of readdirSync( migrations ).sort() ) db.exec( readFileSync( new URL( file, migrations ), 'utf8' ) );
	const d1 = { db, between: () => {}, sql: [], pending: [] };
	const row = values => values && { ...values };
	const statement = ( sql, values = [] ) => ( {
		sql, values,
		bind: ( ...bound ) => statement( sql, bound ),
		first: async () => ( d1.sql.push( sql ), row( db.prepare( sql ).get( ...values ) ) ?? null ),
		all: async () => ( d1.sql.push( sql ), { results: db.prepare( sql ).all( ...values ).map( row ) } ),
		run: async () => ( d1.sql.push( sql ), { results: [], meta: { changes: Number( db.prepare( sql ).run( ...values ).changes ) } } ),
	} );
	d1.DB = {
		prepare: sql => statement( sql ),
		batch: async statements => {

			d1.between( statements );
			// (One transaction, as D1's batch is: all of it or none.)
			db.exec( 'SAVEPOINT batch' );
			try {

				const results = [];
				for ( const s of statements ) results.push( await ( /^\s*SELECT/i.test( s.sql ) ? s.all() : s.run() ) );
				db.exec( 'RELEASE batch' );
				return results;

			} catch ( err ) {

				db.exec( 'ROLLBACK TO batch' );
				db.exec( 'RELEASE batch' );
				throw err;

			}

		},
	};
	return d1;

}

// A period's kind from a challenge's row: 'day', 'week' or 'month'.
function periodKindOf( row ) {

	return row.period.slice( 0, row.period.indexOf( ':' ) );

}

// A run's post to postTime over `d1` (sqliteD1's) at `now`, as the page sends it.
function postOver( d1, body, now, ip = '198.51.100.7', settings = {} ) {

	// (With its run's ghost, as the page posts it, if it hasn't one.)
	const row = d1.db.prepare( 'SELECT world, kind, route FROM challenges WHERE id = ?' ).get( body.challenge );
	if ( row && body.ghost === undefined ) body = { ...body, ghost: fairGhost( { world: row.world, kind: row.kind, route: JSON.parse( row.route ) }, body.ms, body.passes ) };
	const request = new Request( 'https://worlddrive.app/api/challenges/time', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify( body ) } );
	return postTime( { request, url: new URL( request.url ), now, env: { DB: d1.DB, TURNSTILE_SECRET: PASS_SECRET, ...settings }, limits: { take: async () => ( { ok: true } ) }, ctx: { waitUntil: work => d1.pending.push( work ) } } );

}

// A player in `d1` (sqliteD1's): their id and secret.
function sqlitePlayer( d1, name ) {

	const id = `${ name.replace( /\W/g, '' ) }Player00000000`.slice( 0, 16 );
	const secret = name.toLowerCase().replace( /\W/g, '' ).padEnd( 32, 'x' ).slice( 0, 32 );
	d1.db.prepare( 'INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at ) VALUES ( ?, ?, ?, ?, 0, 0 )' ).run( id, name, name.toLowerCase(), createHash( 'sha256' ).update( secret ).digest( 'hex' ) );
	return { id, secret };

}

// Valid passes for a challenge's route ({ world, kind, route }): each leg `extra` ms slower than the
// fastest the game goes allows, the points in their order: { ms, passes }.
function fairRun( challenge, extra = 3000, order = null ) {

	const { world, route } = challenge;
	let from = [ route.start.lat, route.start.lon ];
	let fromRadius = START_SLACK;
	let at = 0;
	const passes = ( order ?? route.points.map( ( _, i ) => i ) ).map( index => {

		at += Math.ceil( legMinimum( world, from, fromRadius, route.points[ index ], route.radius ) ) + extra;
		from = route.points[ index ];
		fromRadius = route.radius;
		return [ index, at ];

	} );
	return { ms: at, passes };

}

// A ghost (ghost-rules.js's text) for a run of `ms` with `passes` on a challenge's route ({ world,
// kind, route }), as a car would drive it: from 99 m along toward its first point from the start
// (within START_SLACK), straight to each point as it's passed, at each to the point of its zone
// nearest where it came from (`inside` of its radius in), at a steady speed between, facing the way
// it goes. `alter( ghost )` changes the samples before they're packed (to make one that cheats).
// Any fair run's (fairRun's, each leg a second or more slower than the fastest allows) passes the
// Worker's checks.
function fairGhost( { world, route }, ms, passes, { inside = 0.95, alter = null } = {} ) {

	const every = everyFor( ms );
	const count = countFor( ms );
	const flat = ( lat, lon ) => localOf( world, route.start, lat, lon ).slice( 0, 2 );
	const toward = ( [ x, y ], [ tx, ty ], metres ) => {

		const d = Math.hypot( tx - x, ty - y );
		return d <= metres ? [ tx, ty ] : [ x + ( tx - x ) * metres / d, y + ( ty - y ) * metres / d ];

	};
	const valid = Array.isArray( passes ) ? passes.filter( pass => Array.isArray( pass ) && route.points[ pass[ 0 ] ] && Number.isFinite( pass[ 1 ] ) ) : [];
	const first = valid.length ? flat( ...route.points[ valid[ 0 ][ 0 ] ] ) : [ 0, 1 ];
	const marks = [ { at: 0, p: toward( [ 0, 0 ], first, START_SLACK - 1 ) } ];
	for ( const [ index, at ] of valid ) {

		const point = flat( ...route.points[ index ] );
		marks.push( { at, p: toward( point, marks.at( - 1 ).p, route.radius * inside ) } );

	}

	if ( marks.at( - 1 ).at < ms ) marks.push( { at: ms, p: marks.at( - 1 ).p } );
	const ghost = { every, count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
	for ( let i = 0; i < count; i ++ ) {

		const t = sampleTime( i, count, every, ms );
		let k = 1;
		while ( k < marks.length - 1 && marks[ k ].at < t ) k ++;
		const [ a, b ] = [ marks[ k - 1 ], marks[ k ] ];
		const u = b.at > a.at ? Math.min( 1, Math.max( 0, ( t - a.at ) / ( b.at - a.at ) ) ) : 1;
		ghost.east[ i ] = Math.round( ( a.p[ 0 ] + ( b.p[ 0 ] - a.p[ 0 ] ) * u ) * 100 );
		ghost.north[ i ] = Math.round( ( a.p[ 1 ] + ( b.p[ 1 ] - a.p[ 1 ] ) * u ) * 100 );
		ghost.up[ i ] = 150;
		ghost.yaw[ i ] = ( ( Math.round( Math.atan2( b.p[ 0 ] - a.p[ 0 ], - ( b.p[ 1 ] - a.p[ 1 ] ) ) / ( Math.PI * 2 ) * TURN ) % TURN ) + TURN ) % TURN;

	}

	alter?.( ghost );
	const bytes = new Uint8Array( GHOST_BYTES * 2 );
	const length = packGhost( ghost, bytes );
	return ghostText( bytes, length );

}

describe( 'World Drive challenges: hoop runs (the Moon\'s, since 2026-11-26)', () => {

	const place = name => MOON_PLACES.find( p => p.name === name );
	// The Moon's course mode flat out (m/s).
	const MOON_TOP = COURSE.boost / 3.6;
	const random = ( fill = 7 ) => randomFrom( new Uint8Array( 32 ).fill( fill ) );
	// Passes for a hoop run flown at `speed` m/s along each leg (the crow's way), each hoop hit, and
	// with those in `missed` missed (its penalty on the clock as it's missed): { ms, passes }.
	const flown = ( challenge, speed, missed = [] ) => {

		const { world, route } = challenge;
		let from = [ route.start.lat, route.start.lon ];
		let fromRadius = START_SLACK;
		let at = 0;
		const passes = route.points.map( ( point, index ) => {

			if ( missed.includes( index ) ) {

				at += HOOP_MISS;
				return [ index, at, 1 ];

			}

			at += Math.ceil( legMinimum( world, from, fromRadius, point, route.radius, speed ) );
			from = point;
			fromRadius = route.radius;
			return [ index, at ];

		} );
		return { ms: at, passes };

	};

	test( 'the Moon\'s, Mars\'s, Vesta\'s and Ceres\'s challenges are all hoop runs, the Earth\'s driven; an owner\'s hoop run only on those', () => {

		assert.deepEqual( HOOP_WORLDS, [ 'moon', 'mars', 'vesta', 'ceres' ] );
		assert.ok( KINDS.includes( 'hoops' ) );
		for ( const period of PERIODS ) for ( const u of [ 0, 0.3, 0.6, 0.99 ] ) {

			for ( const world of HOOP_WORLDS ) assert.equal( kindFor( period, u, world ), 'hoops' );
			assert.notEqual( kindFor( period, u, 'earth' ), 'hoops' );

		}

		assert.throws( () => makeRoute( { kind: 'hoops', size: 'week', world: 'earth', place: { name: 'Arc', lat: 48.87, lon: 2.29 } }, random() ) );

	} );

	test( 'each place\'s style from what it is, and a course laid out in it: hoops over the ground, trick hoops high, orbs off the line, the same from the same numbers', () => {

		assert.equal( hoopStyle( place( 'Copernicus crater' ) ), 'crater' );
		assert.equal( hoopStyle( place( 'Tranquility Base' ) ), 'landing' );
		assert.equal( hoopStyle( place( 'Hadley Rille' ) ), 'valley' );
		assert.equal( hoopStyle( place( 'Mons Huygens' ) ), 'mountain' );
		assert.equal( hoopStyle( place( 'Mare Imbrium' ) ), 'sea' );
		assert.equal( hoopStyle( place( 'South Pole-Aitken basin' ) ), 'basin' );
		assert.equal( hoopStyle( { name: 'Dropped pin' } ), 'crater' );
		// Every featured Moon place has a style, and every style comes up among them.
		assert.deepEqual( [ ...new Set( MOON_PLACES.map( hoopStyle ) ) ].sort(), Object.keys( HOOP_STYLES ).sort() );
		for ( const size of PERIODS ) for ( const name of [ 'Copernicus crater', 'Tranquility Base', 'Hadley Rille', 'Mons Huygens', 'Mare Imbrium', 'South pole' ] ) {

			const shape = SHAPES.moon[ size ].hoops;
			const route = makeRoute( { kind: 'hoops', size, world: 'moon', place: place( name ) }, random() );
			const style = HOOP_STYLES[ route.style ];
			assert.equal( route.style, hoopStyle( place( name ) ) );
			assert.equal( route.points.length, shape.hoops );
			assert.equal( route.radius, shape.radius );
			assert.equal( route.orbs.length, shape.orbs );
			assert.equal( route.tricks.length, shape.tricks );
			assert.deepEqual( [ route.start.lat, route.start.lon ], [ place( name ).lat, place( name ).lon ] );
			for ( const [ i, [ , , up ] ] of route.points.entries() ) {

				assert.ok( Number.isInteger( up ) && up >= 1 && up <= Math.max( style.up[ 1 ], TRICK_UP ), `${ name } hoop ${ i } ${ up } m up` );
				if ( route.tricks.includes( i ) ) assert.ok( up >= TRICK_UP );

			}

			// Never the first hoop or the finish a trick hoop; all different.
			assert.ok( route.tricks.every( i => i > 0 && i < shape.hoops - 1 ) && new Set( route.tricks ).size === route.tricks.length );
			// Each leg about its spacing (the style's share of the shape's).
			let [ lat, lon ] = [ route.start.lat, route.start.lon ];
			for ( const [ toLat, toLon ] of route.points ) {

				const leg = metresOn( 'moon', lat, lon, toLat, toLon );
				assert.ok( leg >= shape.spacing[ 0 ] * style.spacing - 1 && leg <= shape.spacing[ 1 ] * style.spacing + 1, `${ name } leg ${ leg }` );
				[ lat, lon ] = [ toLat, toLon ];

			}

			assert.deepEqual( makeRoute( { kind: 'hoops', size, world: 'moon', place: place( name ) }, random() ), route );

		}

		// A landing site's loops back round near its start.
		const loop = makeRoute( { kind: 'hoops', size: 'week', world: 'moon', place: place( 'Tranquility Base' ) }, random() );
		const [ endLat, endLon ] = loop.points.at( - 1 );
		assert.ok( metresOn( 'moon', loop.start.lat, loop.start.lon, endLat, endLon ) < 2500 );
		const challenge = { world: 'moon', kind: 'hoops', route: loop };
		assert.match( describeChallenge( challenge ), /^18 hoops · \d+\.\d km · 4 boost orbs · 2 trick hoops$/ );

	} );

	test( 'each world its own: Mars\'s hoops close and low, turning sharper, at a slower pace; Vesta\'s far apart, fewer and bigger, at the fastest; Ceres\'s heights jumping; their places\' styles', () => {

		const places = { moon: MOON_PLACES, mars: MARS_PLACES, vesta: VESTA_PLACES, ceres: CERES_PLACES };
		const find = ( world, name ) => places[ world ].find( p => p.name === name );
		assert.equal( hoopStyle( find( 'mars', 'Olympus Mons' ) ), 'mountain' );
		assert.equal( hoopStyle( find( 'mars', 'Valles Marineris' ) ), 'valley' );
		assert.equal( hoopStyle( find( 'mars', 'Jezero crater' ) ), 'landing' );
		assert.equal( hoopStyle( find( 'mars', 'Utopia Planitia' ) ), 'sea' );
		assert.equal( hoopStyle( find( 'mars', 'Hellas Planitia' ) ), 'basin' );
		assert.equal( hoopStyle( find( 'vesta', 'Rheasilvia' ) ), 'basin' );
		assert.equal( hoopStyle( find( 'vesta', 'Divalia Fossae' ) ), 'valley' );
		assert.equal( hoopStyle( find( 'ceres', 'Ahuna Mons' ) ), 'mountain' );
		assert.equal( hoopStyle( find( 'ceres', 'Occator' ) ), 'crater' );
		// Their paces: Mars slower than the Moon, Vesta faster; each checked against its own.
		assert.ok( COURSES.mars.boost < COURSES.moon.boost && COURSES.vesta.boost > COURSES.moon.boost );
		for ( const world of HOOP_WORLDS ) assert.equal( fastestFor( 'hoops', world ), COURSES[ world ].boost / 3.6 );
		assert.equal( COURSE_FASTEST, COURSES.vesta.boost / 3.6 );
		const legs = route => {

			let [ lat, lon ] = [ route.start.lat, route.start.lon ];
			return route.points.map( ( [ toLat, toLon ] ) => {

				const leg = metresOn( route.world, lat, lon, toLat, toLon );
				[ lat, lon ] = [ toLat, toLon ];
				return leg;

			} );

		};
		const mean = list => list.reduce( ( a, b ) => a + b, 0 ) / list.length;
		const lay = ( world, name ) => ( { ...makeRoute( { kind: 'hoops', size: 'week', world, place: find( world, name ) }, random() ), world } );
		const mars = lay( 'mars', 'Gusev crater' );
		const vesta = lay( 'vesta', 'Marcia' );
		const ceres = lay( 'ceres', 'Kerwan' );
		const moon = lay( 'moon', 'Copernicus crater' );
		assert.equal( mars.points.length, SHAPES.mars.week.hoops.hoops );
		assert.equal( vesta.points.length, SHAPES.vesta.week.hoops.hoops );
		assert.ok( vesta.points.length < moon.points.length );
		assert.ok( mean( legs( mars ) ) < mean( legs( moon ) ) && mean( legs( vesta ) ) > 2 * mean( legs( moon ) ) );
		assert.equal( vesta.radius, 24 );
		assert.ok( mean( mars.points.map( p => p[ 2 ] ) ) < mean( moon.points.map( p => p[ 2 ] ) ) );
		// Ceres's in its range, from near the ground to high up.
		const ups = ceres.points.filter( ( _, i ) => ! ceres.tricks.includes( i ) ).map( p => p[ 2 ] );
		assert.ok( ups.every( up => up >= HOOP_FEEL.ceres.upRange[ 0 ] && up <= HOOP_FEEL.ceres.upRange[ 1 ] ) );
		assert.ok( Math.max( ...ups ) - Math.min( ...ups ) > 60, JSON.stringify( ups ) );
		// A missed hoop's reach: more than any of a world's legs.
		for ( const world of HOOP_WORLDS ) for ( const size of PERIODS ) assert.ok( hoopNear( world ) > SHAPES[ world ][ size ].hoops.spacing[ 1 ] * Math.max( ...Object.values( HOOP_STYLES ).map( style => style.spacing ) ) );
		assert.equal( hoopNear( 'moon' ), HOOP_NEAR );
		// A Vesta run at its boost's top taken, the same at Mars's (slower) not quicker than Mars allows.
		const at = ( challenge, speed ) => {

			let from = [ challenge.route.start.lat, challenge.route.start.lon ];
			let fromRadius = START_SLACK;
			let t = 0;
			const passes = challenge.route.points.map( ( point, index ) => {

				t += Math.ceil( legMinimum( challenge.world, from, fromRadius, point, challenge.route.radius, speed ) );
				from = point;
				fromRadius = challenge.route.radius;
				return [ index, t ];

			} );
			return { ms: t, passes };

		};
		const onVesta = { world: 'vesta', kind: 'hoops', route: vesta };
		const fast = at( onVesta, COURSES.vesta.boost / 3.6 );
		assert.ok( checkPasses( onVesta, fast.ms, fast.passes ) );
		const onMars = { world: 'mars', kind: 'hoops', route: mars };
		const tooFast = at( onMars, COURSES.vesta.boost / 3.6 );
		assert.equal( checkPasses( onMars, tooFast.ms, tooFast.passes ), false );
		const fair = at( onMars, COURSES.mars.boost / 3.6 );
		assert.ok( checkPasses( onMars, fair.ms, fair.passes ) );

	} );

	test( 'a hoop run\'s time: checked against the course\'s top speed, a missed hoop taking HOOP_MISS and constraining nothing, the finish never missed', () => {

		assert.ok( COURSE.boost / 3.6 > FASTEST );
		assert.equal( fastestFor( 'hoops', 'moon' ), COURSE.boost / 3.6 );
		assert.equal( fastestFor( 'hoops' ), COURSE_FASTEST );
		assert.equal( fastestFor( 'sprint' ), FASTEST );
		const route = makeRoute( { kind: 'hoops', size: 'week', world: 'moon', place: place( 'Copernicus crater' ) }, random() );
		const challenge = { world: 'moon', kind: 'hoops', route };
		// At the cruise, and at the boost's top flat out: taken; quicker than that, not.
		for ( const speed of [ COURSE.cruise / 3.6, MOON_TOP ] ) {

			const { ms, passes } = flown( challenge, speed );
			assert.ok( checkPasses( challenge, ms, passes ), `${ speed } m/s` );

		}

		const quick = flown( challenge, MOON_TOP * 1.3 );
		assert.equal( checkPasses( challenge, quick.ms, quick.passes ), false );
		// The same passes as a sprint (the ground's FASTEST): too quick.
		const cruise = flown( challenge, COURSE.cruise / 3.6 );
		assert.equal( checkPasses( { ...challenge, kind: 'sprint' }, cruise.ms, cruise.passes ), false );
		// Missed hoops: with their penalty, taken; the next leg's from the last hoop hit (flown at the top
		// speed straight past one, quicker than the crow's way to it and on).
		const missed = flown( challenge, MOON_TOP, [ 3, 4, 9 ] );
		assert.ok( checkPasses( challenge, missed.ms, missed.passes ) );
		assert.equal( leastTime( challenge, missed.passes ) >= 3 * HOOP_MISS, true );
		// A miss without its penalty, a miss marked other than 1, a miss of the finish, or a sprint's
		// "miss": not.
		const cheap = structuredClone( missed );
		cheap.passes[ 3 ][ 1 ] = cheap.passes[ 2 ][ 1 ] + HOOP_MISS - 500;
		assert.equal( checkPasses( challenge, cheap.ms, cheap.passes ), false );
		const marked = structuredClone( missed );
		marked.passes[ 3 ][ 2 ] = 2;
		assert.equal( checkPasses( challenge, marked.ms, marked.passes ), false );
		const finish = flown( challenge, MOON_TOP, [ route.points.length - 1 ] );
		assert.equal( checkPasses( challenge, finish.ms, finish.passes ), false );
		const sprint = makeRoute( { kind: 'sprint', size: 'week', world: 'moon', place: place( 'Copernicus crater' ) }, random() );
		const run = fairRun( { world: 'moon', kind: 'sprint', route: sprint } );
		run.passes[ 2 ] = [ 2, run.passes[ 2 ][ 1 ], 1 ];
		assert.equal( checkPasses( { world: 'moon', kind: 'sprint', route: sprint }, run.ms, run.passes ), false );

	} );

	test( 'a hoop run\'s time posted: taken with a Moon visit, its ghost checked at the course\'s speed (missed hoops not looked for in it), its least time counting each miss', async () => {

		const d1 = sqliteD1();
		const { db } = d1;
		const starts = Date.UTC( 2026, 10, 16 );
		const now = starts + DAY;
		const route = makeRoute( { kind: 'hoops', size: 'week', world: 'moon', place: place( 'Copernicus crater' ) }, random() );
		const { lastInsertRowid: id } = db.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.run( 'week:2026-11-16', 'moon', 'hoops', 'Copernicus crater', '', JSON.stringify( route ), 'rotation', starts, starts + 7 * DAY, starts );
		const challenge = { world: 'moon', kind: 'hoops', route };
		const had = globalThis.caches;
		globalThis.caches = { default: { delete: async () => true, match: async () => undefined, put: async () => {} } };
		try {

			const post = async ( name, runId, { ms, passes }, ghost = undefined ) => {

				const { id: player, secret } = sqlitePlayer( d1, name );
				const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'moon' );
				return postOver( d1, { id: player, secret, visit, challenge: Number( id ), run: runId, ms, passes, vehicle: 'go-kart', ...( ghost === undefined ? {} : { ghost } ) }, now );

			};
			// Flown at 200 m/s, quicker than any car goes: taken.
			const run = flown( challenge, 200 );
			const taken = await post( 'Ann', 'a'.repeat( 16 ), run );
			assert.equal( taken.status, 200 );
			// With two hoops missed (the ghost flying past them well off their rings): taken too.
			const missed = flown( challenge, 200, [ 5, 6 ] );
			const off = fairGhost( challenge, missed.ms, missed.passes.filter( pass => ! pass[ 2 ] ) );
			assert.equal( ( await post( 'Bea', 'b'.repeat( 16 ), missed, off ) ).status, 200 );
			// A ghost flying faster than the course goes: turned away.
			const fast = flown( challenge, MOON_TOP );
			const cheat = fairGhost( challenge, fast.ms, fast.passes, { alter: ghost => {

				ghost.east[ 5 ] += 100000;

			} } );
			await assert.rejects( post( 'Cat', 'c'.repeat( 16 ), fast, cheat ), err => err.status === 400 );
			// Every hoop but the finish "missed", the ghost flying straight to the finish (as near its start
			// on a loop): its passes are possible, but it never came near the hoops it says it missed.
			const skipping = flown( challenge, 150, route.points.slice( 0, - 1 ).map( ( _, i ) => i ) );
			assert.ok( checkPasses( challenge, skipping.ms, skipping.passes ) );
			const straight = fairGhost( challenge, skipping.ms, skipping.passes.filter( pass => ! pass[ 2 ] ) );
			await assert.rejects( post( 'Dan', 'd'.repeat( 16 ), skipping, straight ), err => err.status === 400 && err.extra.fault === 'pass' );
			assert.deepEqual( db.prepare( 'SELECT player_id FROM challenge_times ORDER BY ms' ).all().map( r => r.player_id ), [ 'AnnPlayer0000000', 'BeaPlayer0000000' ] );
			assert.ok( HOOP_NEAR > SHAPES.moon.month.hoops.spacing[ 1 ] * Math.max( ...Object.values( HOOP_STYLES ).map( style => style.spacing ) ) );

		} finally {

			await Promise.all( d1.pending );
			globalThis.caches = had;

		}

	} );

} );

describe( 'World Drive challenges: the rules', () => {

	test( 'the fastest the game goes is worked out from its own numbers: the fastest ride, boosted', () => {

		// The constants in src/drive.js, as written there: the booster's push (a share of the top speed),
		// a drift's mini-turbos and a landed trick's burst, and the top speed of a ride with no tuning
		// of its own (the pickup's).
		const drive = readFileSync( new URL( '../src/drive.js', import.meta.url ), 'utf8' );
		const constant = name => new Function( `return ( ${ drive.match( new RegExp( `^const ${ name } = (.+);$`, 'm' ) )[ 1 ] } );` )();
		assert.equal( constant( 'BOOST_SPEED' ), BOOSTED, 'src/drive.js boosts to a different share of the top speed now: change BOOSTED in challenge-rules.js' );
		for ( const boost of constant( 'DRIFT_BOOSTS' ) ) assert.ok( boost.speed <= BOOSTED, 'a drift boost faster than the booster' );
		assert.ok( constant( 'TRICK_BOOST' ).speed <= BOOSTED, 'a trick\'s burst faster than the booster' );
		// Holding Shift without the booster raises the top speed by a share of its own: under it too.
		assert.ok( new Function( `return ( ${ drive.match( /spec\.topSpeed \* \( boost \? ([\d. /]+) : 1 \)/ )[ 1 ] } );` )() <= BOOSTED, 'Shift\'s boost faster than the booster' );
		// Every top speed (km/h) written anywhere a ride is tuned: drive.js's tuning by name (SPECS,
		// its default among them), the kart (vehicles.js), the cars (cars.js) and every file of the
		// pass's rides (rides/, whatever is added there). So a faster ride anywhere fails this.
		const read = path => readFileSync( new URL( path, import.meta.url ), 'utf8' );
		const speedsIn = text => [ ...text.matchAll( /topSpeed: (\d+(?:\.\d+)?)/g ) ].map( m => Number( m[ 1 ] ) );
		const rides = readdirSync( new URL( '../src/drive-app/rides/', import.meta.url ) ).filter( name => name.endsWith( '.js' ) ).map( name => read( `../src/drive-app/rides/${ name }` ) );
		const specs = drive.match( /^const SPECS = \{\n([\s\S]*?)^\};$/m )[ 1 ];
		const written = [ specs, read( '../src/drive-app/vehicles.js' ), read( '../src/drive-app/cars.js' ), read( '../src/drive-app/works.js' ), ...rides ].flatMap( speedsIn );
		assert.ok( written.length >= 4 + DRIVE_CARS.length + PASS_RIDES.length, String( written ) );
		// And every ride the game offers (the Worker takes a run of: the kart, the cars, the pass's rides
		// and the library's), its own top speed found as the game tunes it (specFor in drive.js: its
		// own, else drive.js's by name, else the default): so a ride that's tuned somewhere this can't
		// see fails here rather than going unchecked.
		const byName = Object.fromEntries( [ ...specs.matchAll( /^\t'?([\w-]+)'?: \{ topSpeed: (\d+(?:\.\d+)?),/gm ) ].map( m => [ m[ 1 ], Number( m[ 2 ] ) ] ) );
		const library = JSON.parse( read( '../public/library/library.json' ) );
		const own = {};
		// The cars and the construction rides: each entry's id, then its drive's top speed before the next id.
		for ( const [ , id, rest ] of [ read( '../src/drive-app/cars.js' ), read( '../src/drive-app/works.js' ) ].join( '\n' ).matchAll( /id: '([\w-]+)'([\s\S]*?)(?=id: '|$)/g ) ) {

			const speed = rest.match( /topSpeed: (\d+(?:\.\d+)?)/ );
			if ( speed ) own[ id ] = Number( speed[ 1 ] );

		}

		// The pass's rides: rides/index.js's id and the tuning it names, as one of rides/'s files sets it.
		const tunings = Object.fromEntries( rides.flatMap( text => [ ...text.matchAll( /export const (\w+) = \{\n\ttopSpeed: (\d+(?:\.\d+)?),/g ) ].map( m => [ m[ 1 ], Number( m[ 2 ] ) ] ) ) );
		for ( const [ , id, tuning ] of read( '../src/drive-app/rides/index.js' ).matchAll( /id: '([\w-]+)'[^\n]*drive: (\w+)/g ) ) own[ id ] = tunings[ tuning ];
		own[ 'go-kart' ] = Number( read( '../src/drive-app/vehicles.js' ).match( /id: 'go-kart',[\s\S]*?topSpeed: (\d+(?:\.\d+)?)/ )[ 1 ] );
		for ( const id of LIBRARY_VEHICLES ) own[ id ] = library.find( entry => entry.id === id )?.drive?.topSpeed ?? byName[ id ] ?? byName.default;
		const offered = [ 'go-kart', ...DRIVE_CARS, ...PASS_RIDES, ...LIBRARY_VEHICLES, ...WORKS_RIDES ];
		for ( const id of offered ) assert.ok( Number.isFinite( own[ id ] ) && own[ id ] > 0, `no top speed found for ${ id }` );
		assert.equal( Math.max( ...offered.map( id => own[ id ] ) ), TOP_SPEED, 'a ride is faster now: change TOP_SPEED in challenge-rules.js' );
		assert.equal( Math.max( ...written ), TOP_SPEED, 'a top speed somewhere is faster now: change TOP_SPEED in challenge-rules.js' );
		// 215 km/h twice over: 430 km/h, 119.4 m/s.
		assert.equal( Math.round( FASTEST * 10 ) / 10, 119.4 );

	} );

	test( 'no dailies by default (since 2026-11-22): a weekly and a monthly a world, CHALLENGE_PERIODS bringing others back; Daily winner retired, Weekly winner new', () => {

		assert.deepEqual( PERIOD_KINDS, [ 'week', 'month' ] );
		assert.deepEqual( periodsAt( CHALLENGE_DAY ).map( period => period.key ), [ 'week:2026-11-16', 'month:2026-11' ] );
		assert.deepEqual( liveKinds( {} ), [ 'week', 'month' ] );
		assert.deepEqual( liveKinds( { CHALLENGE_PERIODS: '' } ), [ 'week', 'month' ] );
		assert.deepEqual( liveKinds( { CHALLENGE_PERIODS: 'nonsense, year' } ), [ 'week', 'month' ] );
		assert.deepEqual( liveKinds( { CHALLENGE_PERIODS: 'month, Day ,week' } ), [ 'day', 'week', 'month' ] );
		assert.deepEqual( liveKinds( { CHALLENGE_PERIODS: 'month' } ), [ 'month' ] );
		// A day's period is still one (the daily boards and links from before).
		assert.equal( parsePeriod( 'day:2026-11-16' ).kind, 'day' );
		// Daily winner: still given by a daily board's final places (the last ones finish after the
		// dailies went), shown only to those who have it, and not in the count out of for the others.
		assert.ok( PLACINGS.some( a => a.id === 'daily-winner' ) );
		assert.ok( PLACINGS.some( a => a.id === 'weekly-winner' && a.period === 'week' && a.target === 1 ) );
		const retired = ACHIEVEMENTS.filter( a => a.retired ).map( a => a.id );
		assert.deepEqual( retired, [ 'daily-winner' ] );
		assert.equal( shownTo( new Set() ).length, ACHIEVEMENTS.length - 1 );
		assert.ok( ! shownTo( new Set( [ 'winner' ] ) ).some( a => a.id === 'daily-winner' ) );
		assert.equal( shownTo( new Set( [ 'daily-winner' ] ) ).length, ACHIEVEMENTS.length );

	} );

	test( 'periods: UTC days, weeks from Monday and calendar months, each ending where the next begins', () => {

		const keys = time => periodsAt( time, PERIODS ).map( period => period.key );
		assert.deepEqual( keys( CHALLENGE_DAY ), [ 'day:2026-11-16', 'week:2026-11-16', 'month:2026-11' ] );
		// Sunday night, Monday morning: a new day and week, the same month.
		assert.deepEqual( keys( Date.UTC( 2026, 10, 29, 23, 59, 59, 999 ) ), [ 'day:2026-11-29', 'week:2026-11-23', 'month:2026-11' ] );
		assert.deepEqual( keys( Date.UTC( 2026, 10, 30 ) ), [ 'day:2026-11-30', 'week:2026-11-30', 'month:2026-11' ] );
		// The month's last moment and the next's first, in the middle of a week.
		assert.deepEqual( keys( Date.UTC( 2026, 10, 30, 23, 59, 59, 999 ) ), [ 'day:2026-11-30', 'week:2026-11-30', 'month:2026-11' ] );
		assert.deepEqual( keys( Date.UTC( 2026, 11, 1 ) ), [ 'day:2026-12-01', 'week:2026-11-30', 'month:2026-12' ] );
		// A leap year's February, and a year's turn.
		assert.equal( periodOf( 'month', Date.UTC( 2028, 1, 29, 12 ) ).ends, Date.UTC( 2028, 2, 1 ) );
		assert.deepEqual( keys( Date.UTC( 2027, 0, 1 ) ), [ 'day:2027-01-01', 'week:2026-12-28', 'month:2027-01' ] );
		for ( const period of periodsAt( CHALLENGE_DAY, PERIODS ) ) {

			assert.ok( period.starts <= CHALLENGE_DAY && CHALLENGE_DAY < period.ends );
			assert.equal( nextPeriod( period ).starts, period.ends );
			assert.deepEqual( parsePeriod( period.key ), period );

		}

		// The leaderboard's week is the same week.
		assert.equal( periodOf( 'week', CHALLENGE_DAY ).key, `week:${ dayOf( CHALLENGE_DAY ) }` );
		for ( const key of [ 'week:2026-11-17', 'day:2026-02-30', 'month:2026-13', 'day:2026-11-16x', 'year:2026', '', null, 42 ] ) assert.equal( parsePeriod( key ), null, String( key ) );

	} );

	test( 'a route is laid out as its shape says, the same from the same numbers, its points on the world', async () => {

		const bytes = seq => Uint8Array.from( { length: 32 }, ( _, i ) => ( i * 29 + seq * 7 ) & 255 );
		const golden = { name: 'Golden Gate Bridge', lat: 37.8199, lon: - 122.4783, heading: 352 };
		for ( const world of WORLD_IDS ) {

			for ( const size of [ 'day', 'week', 'month' ] ) {

				for ( const kind of [ 'sprint', 'collect', 'landmark' ] ) {

					const shape = SHAPES[ world ][ size ][ kind ];
					const route = makeRoute( { kind, size, world, place: golden }, randomFrom( bytes( 1 ) ) );
					assert.deepEqual( makeRoute( { kind, size, world, place: golden }, randomFrom( bytes( 1 ) ) ), route, 'not the same from the same numbers' );
					assert.notDeepEqual( makeRoute( { kind, size, world, place: golden }, randomFrom( bytes( 2 ) ) ), route );
					assert.equal( route.radius, shape.radius );
					const metres = ( [ a, b ], [ c, d ] ) => metresOn( world, a, b, c, d );
					const start = [ route.start.lat, route.start.lon ];
					if ( kind === 'sprint' ) {

						assert.equal( route.points.length, shape.gates );
						// The first gate along the place's road, and each the shape's spacing from the last.
						assert.ok( Math.abs( ( bearingTo( world, ...start, ...route.points[ 0 ] ) - golden.heading + 540 ) % 360 - 180 ) < 0.5 );
						route.points.forEach( ( point, i ) => {

							const gap = metres( i ? route.points[ i - 1 ] : start, point );
							assert.ok( gap >= shape.spacing[ 0 ] - 1 && gap <= shape.spacing[ 1 ] + 1, `${ world } ${ size } gap ${ gap }` );

						} );

					} else if ( kind === 'collect' ) {

						assert.equal( route.points.length, shape.items );
						for ( const point of route.points ) {

							assert.ok( metres( start, point ) <= shape.within + 1 && metres( start, point ) >= 59 );
							assert.ok( route.points.every( other => other === point || metres( other, point ) >= shape.apart * 0.5 ) );

						}

					} else {

						// From a few kilometres off, to the place itself, named.
						assert.deepEqual( route.points, [ [ golden.lat, golden.lon ] ] );
						assert.equal( route.goal, golden.name );
						const far = metres( start, route.points[ 0 ] );
						assert.ok( far >= shape.distance[ 0 ] - 1 && far <= shape.distance[ 1 ] + 1, String( far ) );

					}

				}

			}

		}

	} );

	test( 'a time is checked against the route: every point once, in order where it must be, no leg quicker than the game can go', () => {

		const route = makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 7 ) ) );
		const sprint = { world: 'earth', kind: 'sprint', route };
		const { ms, passes } = fairRun( sprint, 0 );
		assert.ok( checkPasses( sprint, ms, passes ), 'as fast as the game goes' );
		// A frame's slack, and not more.
		const quicker = passes.map( ( [ i, at ], k ) => [ i, at - ( k + 1 ) * LEG_SLACK ] );
		assert.ok( checkPasses( sprint, quicker.at( - 1 )[ 1 ], quicker ) );
		const tooQuick = passes.map( ( [ i, at ], k ) => [ i, at - ( k + 1 ) * ( LEG_SLACK + 50 ) ] );
		assert.ok( ! checkPasses( sprint, tooQuick.at( - 1 )[ 1 ], tooQuick ) );
		// Out of order, a gate missed or twice, times going back, a time that isn't the last pass's,
		// not whole milliseconds, not a list.
		const swapped = passes.map( ( pass, i ) => i === 1 ? [ 2, pass[ 1 ] ] : i === 2 ? [ 1, pass[ 1 ] ] : pass );
		const fair = fairRun( sprint, 9000 );
		assert.ok( checkPasses( sprint, fair.ms, fair.passes ) );
		for ( const [ name, bad, total ] of [
			[ 'swapped', swapped, ms ], [ 'missing one', passes.slice( 0, - 1 ), passes.at( - 2 )[ 1 ] ], [ 'one twice', [ ...passes.slice( 0, - 1 ), passes.at( - 2 ) ], ms ],
			[ 'going back', fair.passes.map( ( [ i, at ], k ) => [ i, k === 3 ? at - 99999 : at ] ), fair.ms ], [ 'not the last', fair.passes, fair.ms + 1 ],
			[ 'fractions', fair.passes.map( ( [ i, at ] ) => [ i, at + 0.5 ] ), fair.ms + 0.5 ], [ 'strings', fair.passes.map( ( [ i, at ] ) => [ String( i ), at ] ), fair.ms ],
			[ 'too many', [ ...fair.passes, [ 6, fair.ms ] ], fair.ms ], [ 'not a list', 'fast', fair.ms ], [ 'nothing', [], 0 ],
		] ) assert.ok( ! checkPasses( sprint, total, bad ), name );
		// Collectibles in any order, each once; a landmark's one goal, from within START_SLACK of its start.
		const items = { world: 'moon', kind: 'collect', route: makeRoute( { kind: 'collect', size: 'day', world: 'moon', place: { name: 'Tycho', lat: - 43.31, lon: - 11.36 } }, randomFrom( new Uint8Array( 32 ).fill( 3 ) ) ) };
		const backwards = fairRun( items, 2000, items.route.points.map( ( _, i ) => items.route.points.length - 1 - i ) );
		assert.ok( checkPasses( items, backwards.ms, backwards.passes ) );
		const twice = backwards.passes.map( ( pass, i ) => i === 1 ? [ backwards.passes[ 0 ][ 0 ], pass[ 1 ] ] : pass );
		assert.ok( ! checkPasses( items, backwards.ms, twice ) );
		const landmark = { world: 'earth', kind: 'landmark', route: makeRoute( { kind: 'landmark', size: 'day', world: 'earth', place: { name: 'Eiffel Tower', lat: 48.86, lon: 2.2945, heading: 236 } }, randomFrom( new Uint8Array( 32 ).fill( 9 ) ) ) };
		const straight = fairRun( landmark, 0 );
		assert.equal( straight.ms, Math.ceil( ( metresOn( 'earth', landmark.route.start.lat, landmark.route.start.lon, 48.86, 2.2945 ) - START_SLACK - landmark.route.radius ) / FASTEST * 1000 ) );
		assert.ok( checkPasses( landmark, straight.ms, straight.passes ) );
		assert.ok( ! checkPasses( landmark, straight.ms - 200, [ [ 0, straight.ms - 200 ] ] ) );
		// Two hours at most.
		assert.ok( ! checkPasses( landmark, MAX_RUN + 1, [ [ 0, MAX_RUN + 1 ] ] ) );

	} );

	test( 'the rotation goes round the places, each once a round, the day never its week\'s or month\'s, and every instance picks the same', async () => {

		const env = { TURNSTILE_SECRET: PASS_SECRET };
		const other = { TURNSTILE_SECRET: '2x0000000000000000000000000000000AA' };
		for ( const world of WORLD_IDS ) {

			// A round of days: as many as there are places, each one once.
			const first = periodOf( 'day', CHALLENGE_DAY );
			const day = i => periodOf( 'day', first.starts + i * DAY );
			const picks = [];
			for ( let i = 0; i < 60; i ++ ) {

				const period = day( i );
				const pick = await rotationPick( env, period, world, [] );
				picks.push( pick );
				const week = await rotationPick( env, periodOf( 'week', period.starts ), world, [] );
				const month = await rotationPick( env, periodOf( 'month', period.starts ), world, [] );
				assert.notEqual( pick.place.id, week.place.id, `${ period.key } is its week's` );
				assert.notEqual( pick.place.id, month.place.id, `${ period.key } is its month's` );
				assert.notEqual( week.place.id, month.place.id );
				assert.ok( KINDS.includes( pick.kind ) && pick.source === 'rotation' );
				assert.deepEqual( await rotationPick( env, period, world, [] ), pick );

			}

			// Another key (another secret) another order: so the code alone doesn't say what's next.
			const elsewhere = await Promise.all( Array.from( { length: 10 }, ( _, i ) => rotationPick( other, day( i ), world, [] ) ) );
			assert.notDeepEqual( elsewhere.map( p => p.place.id ), picks.slice( 0, 10 ).map( p => p.place.id ) );
			// The places that come in 30 days: most of them, and none twice in a row.
			const ids = picks.map( p => p.place.id );
			for ( let i = 1; i < ids.length; i ++ ) assert.notEqual( ids[ i ], ids[ i - 1 ], `${ world } twice in a row` );
			assert.ok( new Set( ids.slice( 0, 30 ) ).size >= ( world === 'earth' ? 14 : 20 ), `${ new Set( ids ).size } places` );
			// Every kind comes up: on a world of hoop runs (the Moon's, since 2026-11-26) only those, and
			// elsewhere every other kind.
			assert.deepEqual( [ ...new Set( picks.map( p => p.kind ) ) ].sort(), HOOP_WORLDS.includes( world ) ? [ 'hoops' ] : KINDS.filter( kind => kind !== 'hoops' ).sort() );

		}

		// An approved place joins the rotation's places.
		const approved = [ { world: 'earth', cell_row: 14212, cell_column: 5052, name: 'Lombard Street', region: 'San Francisco', lat: 37.8021, lon: - 122.4187 } ];
		const seen = new Set();
		for ( let i = 0; i < 40; i ++ ) seen.add( ( await rotationPick( env, periodOf( 'day', CHALLENGE_DAY + i * DAY ), 'earth', approved ) ).place.id );
		assert.ok( seen.has( 'cell:earth:14212:5052' ) );

	} );

	test( 'the rotation\'s rules hold over years, with any key: never a place twice in a row, and the three live on a world always three places (a week that ends in the next month too)', async () => {

		// Three years of days, ten of weeks and thirty of months on each world, with four keys: the rare
		// ways a step aside could clash (a round's first after the last round's step aside, two periods
		// in a row stepping aside, a week across a month's end) all come up in that many.
		const secrets = [ PASS_SECRET, '2x0000000000000000000000000000000AA', 'another-secret-for-the-rotation-x', 'third-secret-zzz-9876' ];
		const from = Date.UTC( 2026, 10, 16 );
		let weeksAcross = 0;
		for ( const secret of secrets ) {

			const env = { TURNSTILE_SECRET: secret };
			const pick = async ( kind, time, world ) => ( await rotationPick( env, periodOf( kind, time ), world, [] ) ).place.id;
			for ( const world of WORLD_IDS ) {

				let last = null;
				for ( let i = 0; i < 3 * 366; i ++ ) {

					const time = from + i * DAY;
					const day = await pick( 'day', time, world );
					assert.notEqual( day, last, `${ secret } ${ world } ${ periodOf( 'day', time ).key }: twice in a row` );
					assert.notEqual( day, await pick( 'week', time, world ), `${ secret } ${ world } ${ periodOf( 'day', time ).key }: its week's` );
					assert.notEqual( day, await pick( 'month', time, world ), `${ secret } ${ world } ${ periodOf( 'day', time ).key }: its month's` );
					last = day;

				}

				last = null;
				for ( let week = periodOf( 'week', from ), i = 0; i < 10 * 53; i ++, week = nextPeriod( week ) ) {

					const id = await pick( 'week', week.starts, world );
					assert.notEqual( id, last, `${ secret } ${ world } ${ week.key }: twice in a row` );
					// The month it starts in and the one it ends in: both live beside it on some days.
					assert.notEqual( id, await pick( 'month', week.starts, world ), `${ secret } ${ world } ${ week.key }: its first month's` );
					assert.notEqual( id, await pick( 'month', week.ends - 1, world ), `${ secret } ${ world } ${ week.key }: its last month's` );
					if ( periodOf( 'month', week.starts ).key !== periodOf( 'month', week.ends - 1 ).key ) weeksAcross ++;
					last = id;

				}

				last = null;
				for ( let month = periodOf( 'month', from ), i = 0; i < 30 * 12; i ++, month = nextPeriod( month ) ) {

					const id = await pick( 'month', month.starts, world );
					assert.notEqual( id, last, `${ secret } ${ world } ${ month.key }: twice in a row` );
					last = id;

				}

			}

		}

		assert.ok( weeksAcross > 500, String( weeksAcross ) );

	} );

	test( 'a time is written only while its challenge is open, checked in the write itself: one finished between the check and the write is turned away, nothing of it kept', async () => {

		// The Worker's postTime on D1's shape over node:sqlite; `between` runs as a batch of writes
		// comes, as another request's (finishEnded writing the final places, a minute after the
		// period's end) could land between this one's reads and its writes.
		const d1 = sqliteD1();
		const { db } = d1;
		// Yesterday's sprint, over 30 s ago; two players, each with a run begun before midnight.
		const ends = Date.UTC( 2026, 10, 17 );
		const now = ends + 30 * SECOND;
		const route = makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 5 ) ) );
		const { lastInsertRowid: id } = db.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.run( 'day:2026-11-16', 'earth', 'sprint', 'Arc', '', JSON.stringify( route ), 'rotation', ends - DAY, ends, ends - DAY );
		const run = fairRun( { world: 'earth', kind: 'sprint', route }, 9000 );
		assert.ok( now - run.ms < ends );
		const posted = async ( name, runId ) => {

			const { id: player, secret } = sqlitePlayer( d1, name );
			const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, ends - HOUR, 'earth' );
			return postOver( d1, { id: player, secret, visit, challenge: Number( id ), run: runId, ms: run.ms, passes: run.passes, vehicle: 'go-kart' }, now );

		};
		// (The caches aren't Node's: a stand-in for the cleared rows.)
		const had = globalThis.caches;
		globalThis.caches = { default: { delete: async () => true, match: async () => undefined, put: async () => {} } };
		try {

			// Still open: taken, as the setup is right.
			const taken = await posted( 'Ann', 'r'.repeat( 16 ) );
			assert.equal( taken.status, 200 );
			assert.equal( ( await taken.json() ).rank, 1 );
			// Finished between this post's check and its write: turned away, as a post after its final places
			// would be, and nothing kept (no row, no driver counted).
			d1.between = statements => {

				if ( statements.some( s => /INSERT INTO challenge_times/.test( s.sql ) ) ) db.prepare( 'UPDATE challenges SET final_at = ? WHERE id = ?' ).run( now, id );

			};
			await assert.rejects( posted( 'Bea', 's'.repeat( 16 ) ), err => err.status === 403 && err.extra.reason === 'challenge' );
			assert.deepEqual( db.prepare( 'SELECT player_id FROM challenge_times' ).all().map( r => r.player_id ), [ 'AnnPlayer0000000' ] );
			assert.equal( db.prepare( 'SELECT drivers FROM challenges WHERE id = ?' ).get( id ).drivers, 1 );

		} finally {

			await Promise.all( d1.pending );
			globalThis.caches = had;

		}

	} );

	test( 'a new best is put into the board\'s order kept (placeIn), as reading it afresh would have it: the old one out, the new one in its place, RANK_MOST at most, one past them left out', () => {

		const order = Array.from( { length: 5 }, ( _, i ) => [ 1000 * ( i + 1 ), 10, `p${ i }` ] );
		// p3 bettering to second, at the same time as p1 but set later: after p1.
		assert.deepEqual( placeIn( order, { ms: 2000, created_at: 20 }, 'p3' ).map( entry => entry[ 2 ] ), [ 'p0', 'p1', 'p3', 'p2', 'p4' ] );
		// A newcomer first; the order given isn't changed; the same again changes nothing.
		const placed = placeIn( order, { ms: 500, created_at: 30 }, 'new' );
		assert.deepEqual( placed.map( entry => entry[ 2 ] ), [ 'new', 'p0', 'p1', 'p2', 'p3', 'p4' ] );
		assert.equal( order.length, 5 );
		assert.deepEqual( placeIn( placed, { ms: 500, created_at: 30 }, 'new' ), placed );
		assert.equal( rankIn( placed, { ms: 500, created_at: 30 }, 'new' ), 1 );
		// A full order: one coming in pushes the last out; one past the last stays out.
		const full = Array.from( { length: RANK_MOST }, ( _, i ) => [ 1000 + i, 10, `f${ String( i ).padStart( 4, '0' ) }` ] );
		const pushed = placeIn( full, { ms: 1, created_at: 10 }, 'quick' );
		assert.deepEqual( [ pushed.length, pushed[ 0 ][ 2 ], pushed.at( - 1 )[ 2 ] ], [ RANK_MOST, 'quick', `f${ String( RANK_MOST - 2 ).padStart( 4, '0' ) }` ] );
		assert.deepEqual( placeIn( full, { ms: 999999, created_at: 10 }, 'slow' ), full );
		assert.equal( rankIn( full, { ms: 999999, created_at: 10 }, 'slow' ), RANK_MOST + 1 );

	} );

	test( 'a rank is found in the board\'s order, read from its index alone and no more than RANK_MOST rows of it (no count of the rows ahead): a long board\'s last place is "1000+"', async () => {

		const d1 = sqliteD1();
		const { db } = d1;
		const now = CHALLENGE_DAY;
		const route = makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 7 ) ) );
		const { lastInsertRowid: id } = db.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.run( 'day:2026-11-16', 'earth', 'sprint', 'Arc', '', JSON.stringify( route ), 'rotation', now - HOUR, now + HOUR, now - HOUR );
		// A board of RANK_MOST + 200 times, all quicker than the run posted below.
		const run = fairRun( { world: 'earth', kind: 'sprint', route }, 9000 );
		const many = RANK_MOST + 200;
		db.exec( `INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at ) SELECT printf( 'board%011d', value ), printf( 'Driver %d', value ), printf( 'driver %d', value ), 'x', 0, 0 FROM json_each( '[${ Array.from( { length: many }, ( _, i ) => i ).join( ',' ) }]' )` );
		db.exec( `INSERT INTO challenge_times ( challenge_id, player_id, ms, passes, vehicle, run_id, visit, owner, created_at, first_at ) SELECT ${ id }, printf( 'board%011d', value ), ${ run.ms - 1 } - value, '[]', 'go-kart', printf( 'boardrun%011d', value ), 'v', 0, 0, 0 FROM json_each( '[${ Array.from( { length: many }, ( _, i ) => i ).join( ',' ) }]' )` );
		db.prepare( 'UPDATE challenges SET drivers = ? WHERE id = ?' ).run( many, id );
		const had = globalThis.caches;
		globalThis.caches = { default: { delete: async () => true, match: async () => undefined, put: async () => {} } };
		try {

			const { id: player, secret } = sqlitePlayer( d1, 'Last One' );
			const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' );
			d1.sql.length = 0;
			const res = await postOver( d1, { id: player, secret, visit, challenge: Number( id ), run: 'l'.repeat( 16 ), ms: run.ms, passes: run.passes, vehicle: 'go-kart' }, now );
			const answer = await res.json();
			// Last of RANK_MOST + 201: past the order's RANK_MOST, the page's "1000+".
			assert.deepEqual( [ answer.rank, answer.total, rankText( answer.rank ) ], [ RANK_MOST + 1, many + 1, `${ RANK_MOST }+` ] );
			assert.equal( rankText( RANK_MOST ), String( RANK_MOST ) );
			// The order: the board's index alone (it covers the query, in the order asked), RANK_MOST rows
			// at most; and no count of the rows ahead anywhere.
			const ordered = d1.sql.filter( sql => /FROM challenge_times WHERE challenge_id = \? AND owner = 0 ORDER BY/.test( sql ) );
			assert.equal( ordered.length, 1 );
			const plan = db.prepare( `EXPLAIN QUERY PLAN ${ ordered[ 0 ] }` ).all( id ).map( row => row.detail ).join( ' | ' );
			assert.match( plan, /^SEARCH challenge_times USING COVERING INDEX challenge_times_board \(challenge_id=\? AND owner=\?\)$/, plan );
			assert.match( ordered[ 0 ], new RegExp( `LIMIT ${ RANK_MOST }$` ) );
			assert.equal( db.prepare( ordered[ 0 ] ).all( id ).length, RANK_MOST );
			assert.ok( ! d1.sql.some( sql => /COUNT\(/.test( sql ) && /challenge_times/.test( sql ) ), d1.sql.join( '\n' ) );
			// And a quick one's: counted exactly.
			const { id: quick, secret: quickSecret } = sqlitePlayer( d1, 'Quick One' );
			const fast = fairRun( { world: 'earth', kind: 'sprint', route }, 9000 - Math.ceil( 210 / route.points.length ) );
			const rows = db.prepare( 'SELECT COUNT(*) AS n FROM challenge_times WHERE challenge_id = ? AND ms <= ? AND player_id != ?' ).get( id, fast.ms, quick ).n;
			const second = await ( await postOver( d1, { id: quick, secret: quickSecret, visit: await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' ), challenge: Number( id ), run: 'q'.repeat( 16 ), ms: fast.ms, passes: fast.passes, vehicle: 'go-kart' }, now, '198.51.100.8' ) ).json();
			assert.equal( second.rank, rows + 1 );
			assert.ok( second.rank < RANK_MOST, String( second.rank ) );

		} finally {

			await Promise.all( d1.pending );
			globalThis.caches = had;

		}

	} );

	test( 'a rank in a board\'s order: the times ahead counted by halving (the same time, who set it first; the same moment, the player\'s id), the player\'s own left out, the owner\'s the rank it would have, past RANK_MOST "1000+"', () => {

		const order = [ [ 1000, 5, 'a' ], [ 1000, 7, 'c' ], [ 1000, 7, 'e' ], [ 1200, 1, 'b' ], [ 1500, 2, 'mine' ], [ 1800, 3, 'd' ] ];
		assert.equal( rankIn( order, { ms: 900, created_at: 9 }, 'x' ), 1 );
		assert.equal( rankIn( order, { ms: 1000, created_at: 5 }, 'a' ), 1 );
		assert.equal( rankIn( order, { ms: 1000, created_at: 7 }, 'd' ), 3, 'the same moment: by the id' );
		assert.equal( rankIn( order, { ms: 1000, created_at: 7 }, 'e' ), 3 );
		assert.equal( rankIn( order, { ms: 1000, created_at: 8 }, 'x' ), 4 );
		// The player's own best as the order had it, beaten since: not counted ahead of the new one.
		assert.equal( rankIn( order, { ms: 1100, created_at: 9 }, 'mine' ), 4 );
		assert.equal( rankIn( order, { ms: 1500, created_at: 2 }, 'mine' ), 5 );
		assert.equal( rankIn( order, { ms: 9000, created_at: 9 }, 'mine' ), 6, 'last, its own old time left out' );
		assert.equal( rankIn( [], { ms: 1, created_at: 1 }, 'x' ), 1 );
		const full = Array.from( { length: RANK_MOST }, ( _, i ) => [ i, 0, `p${ i }` ] );
		assert.equal( rankIn( full, { ms: RANK_MOST + 5, created_at: 0 }, 'x' ), RANK_MOST + 1 );
		assert.equal( rankIn( full, { ms: RANK_MOST - 1.5, created_at: 0 }, 'x' ), RANK_MOST );

	} );

	test( 'what a look reads, by D1\'s own count of rows read: a player\'s rank costs a few rows however far down a board of 1,200 and however many players are asked as in turn; a finished board\'s, its final place; nothing counts the rows ahead; how long each is kept in Cloudflare\'s cache (a board\'s order 10 minutes, a finished board and a link to it a day, a ghost 30 days); and what a time posted writes', async t => {

		// workerd's own D1 (wrangler's getPlatformProxy, the database alone), with the migrations, and
		// the routes run here over it, every statement's meta.rows_read added up; Cloudflare's cache a
		// Map here (each put's Cache-Control kept, to look at).
		const { getPlatformProxy } = await import( 'wrangler' );
		const dir = mkdtempSync( join( tmpdir(), 'challenge-rows-' ) );
		writeFileSync( join( dir, 'wrangler.jsonc' ), JSON.stringify( { name: 'challenge-rows', compatibility_date: '2025-01-01', d1_databases: [ { binding: 'DB', database_name: 'rows', database_id: 'rows' } ] } ) );
		const proxy = await getPlatformProxy( { configPath: join( dir, 'wrangler.jsonc' ), persist: { path: join( dir, 'state' ) } } );
		const had = globalThis.caches;
		try {

			const raw = proxy.env.DB;
			const migrations = new URL( '../worker/drive/migrations/', import.meta.url );
			for ( const file of readdirSync( migrations ).sort() ) {

				const statements = readFileSync( new URL( file, migrations ), 'utf8' ).replace( /^\s*--.*$/gm, '' ).split( /;\s*$/m ).map( text => text.trim() ).filter( Boolean );
				await raw.batch( statements.map( text => raw.prepare( text ) ) );

			}

			let read = 0;
			let written = 0;
			const counted = result => ( read += result.meta.rows_read, written += result.meta.rows_written ?? 0, result );
			const wrap = statement => ( {
				statement,
				bind: ( ...values ) => wrap( statement.bind( ...values ) ),
				first: async () => counted( await statement.all() ).results[ 0 ] ?? null,
				all: async () => counted( await statement.all() ),
				run: async () => counted( await statement.run() ),
			} );
			const DB = { prepare: text => wrap( raw.prepare( text ) ), batch: async statements => ( await raw.batch( statements.map( s => s.statement ) ) ).map( counted ) };
			const kept = new Map();
			globalThis.caches = { default: {
				match: async request => kept.has( request.url ) ? new Response( kept.get( request.url ).body ) : undefined,
				put: async ( request, response ) => void kept.set( request.url, { body: await response.text(), control: response.headers.get( 'Cache-Control' ) } ),
				delete: async request => kept.delete( request.url ),
			} };
			// A day no other test asks for the fifteen on (this process keeps the fifteen it has fixed a minute).
			const now = Date.UTC( 2027, 2, 10, 12 );
			const env = { DB, TURNSTILE_SECRET: PASS_SECRET, CHALLENGE_PERIODS: 'day,week,month' };
			const ask = async ( handler, path ) => {

				const request = new Request( `https://worlddrive.app${ path }`, { headers: { 'CF-Connecting-IP': '198.51.100.70' } } );
				read = 0;
				const res = await handler( { request, url: new URL( request.url ), env, now, ctx: { waitUntil: () => {} } } );
				return { body: await res.json(), read };

			};
			// (Asked again if the first ask left some for the next: no more than three checked on their
			// ground an ask, should this process have the Moon's or Mars's heights already.)
			let ids = ( await ask( listChallenges, '/api/challenges' ) ).body.challenges.map( c => c.id );
			for ( let k = 0; k < 3 && ids.length < 15; k ++ ) ids = ( await ask( listChallenges, '/api/challenges' ) ).body.challenges.map( c => c.id );
			assert.equal( ids.length, 15 );
			// Each of the fifteen a board of 1,240: 1,200 quicker times, then 40 players at the bottom of all fifteen
			// (a script's own, asked as in turn); and a finished board of yesterday's, the same.
			const { meta: { last_row_id: past } } = await raw.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at, final_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
				.bind( 'day:2027-03-09', 'earth', 'sprint', 'Old', '', '{"start":{"lat":0,"lon":0},"points":[[0,0.01]],"radius":30}', 'rotation', now - 36 * HOUR, now - 12 * HOUR, now - 36 * HOUR, now - 11 * HOUR ).run();
			const many = 1200;
			const bottom = 40;
			const numbers = JSON.stringify( Array.from( { length: many + bottom }, ( _, i ) => i ) );
			await raw.prepare( 'INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at ) SELECT printf( \'rows%012d\', value ), printf( \'Rows %d\', value ), printf( \'rows %d\', value ), \'x\', 0, 0 FROM json_each( ? )' ).bind( numbers ).run();
			for ( const id of [ ...ids, past ] ) {

				await raw.prepare( 'INSERT INTO challenge_times ( challenge_id, player_id, ms, passes, vehicle, run_id, visit, owner, created_at, first_at ) SELECT ?1, printf( \'rows%012d\', value ), 60000 + value * 10, \'[]\', \'go-kart\', printf( \'rowsrun%012d\', value ), \'v\', 0, ?2, ?2 FROM json_each( ?3 )' ).bind( id, now - HOUR, numbers ).run();
				await raw.prepare( 'UPDATE challenges SET drivers = ? WHERE id = ?' ).bind( many + bottom, id ).run();

			}

			await raw.prepare( 'UPDATE challenge_times SET final_rank = ranked.place FROM ( SELECT player_id, ROW_NUMBER() OVER ( ORDER BY ms, created_at, player_id ) AS place FROM challenge_times WHERE challenge_id = ?1 ) AS ranked WHERE challenge_times.challenge_id = ?1 AND challenge_times.player_id = ranked.player_id' ).bind( past ).run();
			kept.clear();
			const player = i => `rows${ String( many + i ).padStart( 12, '0' ) }`;
			// The first look reads each board's order once (RANK_MOST rows of each, from the index) and the
			// list's tops.
			const first = await ask( listChallenges, `/api/challenges?id=${ player( 0 ) }` );
			assert.ok( first.body.challenges.every( c => c.me.rank === RANK_MOST + 1 ) );
			assert.ok( first.read <= 15 * ( RANK_MOST + 40 ), String( first.read ) );
			// Then a script's 40 players in turn, each missing the cache for its own rows: a few rows each,
			// not fifteen counts of the 1,000 ahead.
			for ( let i = 1; i < bottom; i ++ ) {

				const look = await ask( listChallenges, `/api/challenges?id=${ player( i ) }` );
				assert.ok( look.body.challenges.every( c => c.me.rank === RANK_MOST + 1 ), JSON.stringify( look.body.challenges.map( c => c.me ) ) );
				// (Two a board and a few: 24 with the nine of three worlds, 36 with the fifteen of five.)
				assert.ok( look.read <= 2 * ids.length + 6, `list ${ i }: ${ look.read } rows read` );

			}

			// A board's own row, the same: a row or two.
			for ( let i = 0; i < bottom; i ++ ) {

				const look = await ask( challengeBoard, `/api/challenges/board?challenge=${ ids[ 0 ] }&id=${ player( i ) }` );
				assert.equal( look.body.me.rank, RANK_MOST + 1 );
				assert.ok( look.read <= ( i ? 6 : 6 + 50 ), `board ${ i }: ${ look.read } rows read` );

			}

			// One well up the board: its rank exact, found in the same order.
			const up = await ask( challengeBoard, `/api/challenges/board?challenge=${ ids[ 0 ] }&id=${ player( - 700 ) }` );
			assert.equal( up.body.me.rank, many - 700 + 1 );
			assert.ok( up.read <= 6, String( up.read ) );
			// A finished board: kept a day, and each player's rank there their final place (no order read).
			const ended = await ask( challengeBoard, `/api/challenges/board?challenge=${ past }&id=${ player( 0 ) }` );
			assert.equal( ended.body.me.rank, many + 1 );
			assert.equal( kept.get( `https://worlddrive.app/api/challenges/board?challenge=${ past }` ).control, 'public, max-age=86400' );
			assert.equal( kept.get( `https://worlddrive.app/api/challenges/board?challenge=${ ids[ 0 ] }` ).control, 'public, max-age=60' );
			// A live board's order kept 10 minutes (ORDER_KEPT: a rank is found in it, so the board is read
			// whole once in 10 minutes in a place, whoever asks), and none for a finished one.
			assert.equal( kept.get( `https://worlddrive.app/api/challenges/order?challenge=${ ids[ 0 ] }` ).control, 'public, max-age=600' );
			assert.ok( ! kept.has( `https://worlddrive.app/api/challenges/order?challenge=${ past }` ) );
			for ( let i = 1; i < bottom; i ++ ) {

				const look = await ask( challengeBoard, `/api/challenges/board?challenge=${ past }&id=${ player( i ) }` );
				assert.equal( look.body.me.rank, many + i + 1 );
				assert.ok( look.read <= 6, `finished board ${ i }: ${ look.read } rows read` );

			}

			// A link's answer, kept as its board is: a live one's a minute, a finished one's a day (it can't
			// change); and a ghost by its run 30 days (a run's ghost never changes).
			await raw.prepare( 'UPDATE challenge_times SET handle = ? WHERE challenge_id = ? AND player_id = ?' ).bind( 'LiveHandle000001', ids[ 0 ], player( - 1200 ) ).run();
			await raw.prepare( 'UPDATE challenge_times SET handle = ? WHERE challenge_id = ? AND player_id = ?' ).bind( 'PastHandle000001', past, player( - 1200 ) ).run();
			assert.equal( ( await ask( challengeLink, `/api/challenges/link?challenge=${ ids[ 0 ] }&vs=LiveHandle000001` ) ).body.vs.name, 'Rows 0' );
			assert.equal( ( await ask( challengeLink, `/api/challenges/link?challenge=${ past }&vs=PastHandle000001` ) ).body.vs.rank, 1 );
			assert.equal( kept.get( `https://worlddrive.app/api/challenges/link?challenge=${ ids[ 0 ] }&vs=LiveHandle000001` ).control, 'public, max-age=60' );
			assert.equal( kept.get( `https://worlddrive.app/api/challenges/link?challenge=${ past }&vs=PastHandle000001` ).control, 'public, max-age=86400' );
			await raw.prepare( 'INSERT INTO challenge_ghosts ( challenge_id, player_id, run_id, ms, passes, vehicle, look, ghost, bytes, least_ms, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
				.bind( ids[ 0 ], player( - 1200 ), 'rowsrun000000000000', 60000, '[]', 'go-kart', '{}', 'AQ', 2, 10000, now ).run();
			assert.equal( ( await ask( challengeGhost, `/api/challenges/ghost?challenge=${ ids[ 0 ] }&run=rowsrun000000000000` ) ).body.run, 'rowsrun000000000000' );
			assert.equal( kept.get( `https://worlddrive.app/api/challenges/ghost?challenge=${ ids[ 0 ] }&run=rowsrun000000000000` ).control, 'public, max-age=2592000' );

			// What a time posted writes, by D1's own count of rows written (each row and each of its indexes'
			// entries): a player's first on a challenge, a better one, and one that isn't, each with its ghost.
			const challenge = ( await ask( listChallenges, '/api/challenges' ) ).body.challenges.find( c => c.world === 'earth' && c.period === 'day' );
			// Its board's 1,240 with their ghosts kept, as a big monthly's might be (each 1,000 characters,
			// as its count has it): the first ten's not plausible (their times' rows say ghost 1), the
			// rest's to race (2).
			const seeded = JSON.stringify( Array.from( { length: many + bottom }, ( _, i ) => i ) );
			await raw.prepare( 'INSERT OR IGNORE INTO challenge_ghosts ( challenge_id, player_id, run_id, ms, passes, vehicle, look, ghost, bytes, least_ms, created_at ) SELECT ?1, printf( \'rows%012d\', value ), printf( \'rowsrun%012d\', value ), 60000 + value * 10, \'[]\', \'go-kart\', \'{}\', \'AQ\', 1000, CASE WHEN value < 10 THEN 60000 ELSE 1000 END, ?2 FROM json_each( ?3 )' )
				.bind( challenge.id, now - HOUR, seeded ).run();
			await raw.prepare( 'UPDATE challenge_times SET ghost = CASE WHEN ( SELECT least_ms FROM challenge_ghosts g WHERE g.challenge_id = challenge_times.challenge_id AND g.player_id = challenge_times.player_id ) = 1000 THEN 2 ELSE 1 END WHERE challenge_id = ?' ).bind( challenge.id ).run();
			await raw.prepare( 'UPDATE challenges SET ghost_bytes = ( SELECT SUM( bytes ) FROM challenge_ghosts WHERE challenge_id = ?1 ) WHERE id = ?1' ).bind( challenge.id ).run();
			// A board's miss with every row's ghost kept reads its rows and their players, as one without
			// ghosts does (each row says whether it's one to race: no ghost's row read for it).
			kept.delete( `https://worlddrive.app/api/challenges/board?challenge=${ challenge.id }` );
			const ghosted = await ask( challengeBoard, `/api/challenges/board?challenge=${ challenge.id }` );
			assert.ok( ghosted.read <= 41, `a board's miss with its ghosts kept: ${ ghosted.read } rows read` );
			assert.deepEqual( ghosted.body.rows.filter( row => row.run ).map( row => row.name ), [ 'Rows 10' ] );
			// The list's miss: each challenge's top three and its one to race (the quickest with a ghost
			// to race, wherever it is: row 11 here, under ten not plausible), one row of its own index.
			kept.delete( `https://worlddrive.app/api/challenges/list?ids=${ ids.join( ',' ) }` );
			const listing = await ask( listChallenges, '/api/challenges' );
			const posted = listing.body.challenges.find( c => c.id === challenge.id );
			t.diagnostic( `a board's miss with its ghosts kept read ${ ghosted.read } rows, the list's ${ listing.read }` );
			// (Fifteen challenges' tops and races, and their players: 122 measured; 74 with the nine of
			// three worlds. About eight a challenge.)
			assert.ok( listing.read <= 8 * ids.length + 8, `the list's miss: ${ listing.read } rows read` );
			assert.ok( posted.top.every( row => ! row.run ) );
			assert.deepEqual( [ posted.race.name, posted.race.run, posted.race.ms ], [ 'Rows 10', 'rowsrun000000000010', 60100 ] );
			assert.ok( listing.body.challenges.filter( c => c.id !== challenge.id ).every( c => c.race === null ) );
			const secret = 'w'.repeat( 32 );
			await raw.prepare( 'INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at ) VALUES ( ?, ?, ?, ?, 0, 0 )' ).bind( 'writesPlayer0000', 'Writes', 'writes', createHash( 'sha256' ).update( secret ).digest( 'hex' ) ).run();
			const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' );
			const posting = async ( extra, at, run, settings = {}, status = 200 ) => {

				const timed = fairRun( challenge, extra );
				const request = new Request( 'https://worlddrive.app/api/challenges/time', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.71' }, body: JSON.stringify( {
					id: 'writesPlayer0000', secret, visit, challenge: challenge.id, run, ms: timed.ms, passes: timed.passes, vehicle: 'go-kart', ghost: fairGhost( challenge, timed.ms, timed.passes ),
				} ) } );
				[ read, written ] = [ 0, 0 ];
				// (What it leaves to finish after its answer counted with it, not with the next post.)
				const after = [];
				const res = await postTime( { request, url: new URL( request.url ), env: { ...env, ...settings }, now: at, limits: { take: async () => ( { ok: true } ) }, ctx: { waitUntil: work => after.push( work ) } } )
					.catch( err => new Response( JSON.stringify( err.extra ?? {} ), { status: err.status ?? 500 } ) );
				await Promise.all( after );
				assert.equal( res.status, status, await res.clone().text() );
				return { written, read, body: await res.json() };

			};
			const firstTime = await posting( 9000, now, 'writesRun0000001' );
			const better = await posting( 7000, now + MINUTE, 'writesRun0000002' );
			const slower = await posting( 8000, now + 2 * MINUTE, 'writesRun0000003' );
			t.diagnostic( `rows written by a time posted: a first ${ firstTime.written }, a new best ${ better.written }, one that isn't ${ slower.written }; read ${ firstTime.read }, ${ better.read }, ${ slower.read }` );
			assert.deepEqual( [ firstTime.body.isNewBest, better.body.isNewBest, slower.body.isNewBest ], [ true, true, false ] );
			// (A ghost's row has three index entries: its key, its run and its time, the last to find the
			// slowest to let go when a challenge's ghosts are full. A player's first time on any challenge
			// writes one row more: their first challenge finished, achievements.js.)
			assert.ok( firstTime.written <= 17 && better.written <= 14 && slower.written <= 2, JSON.stringify( [ firstTime.written, better.written, slower.written ] ) );
			assert.equal( ( await raw.prepare( 'SELECT COUNT(*) AS n FROM achievements WHERE player_id = ? AND achievement = \'challenges-1\'' ).bind( 'writesPlayer0000' ).first() ).n, 1 );
			// And what it reads, on a challenge keeping 1,240 slower ghosts: each ghost found by its key
			// (none of the slower ones looked at), the rank in the board's order kept in the cache (the
			// new best put into it, not the board's thousand read again).
			assert.ok( firstTime.read <= 40 && better.read <= 60 && slower.read <= 30, JSON.stringify( [ firstTime.read, better.read, slower.read ] ) );
			assert.equal( better.body.rank, 1 );
			assert.equal( JSON.parse( kept.get( `https://worlddrive.app/api/challenges/order?challenge=${ challenge.id }` ).body ).order[ 0 ][ 2 ], 'writesPlayer0000' );
			// One the gap turns away reads a few rows.
			const refused = await posting( 6500, now + 2 * MINUTE + SECOND, 'writesRun0000004', {}, 429 );
			assert.ok( refused.read <= 12 && refused.written === 0, JSON.stringify( [ refused.read, refused.written ] ) );
			// A new best while the challenge's ghosts are full: the slowest kept let go by its key (makeRoom
			// reads at most 64 by the index on their times), its time saying it has none now, the room
			// counted, and this one's kept. (makeRoom's look, 64 rows of the index and their rows, D1
			// counting both; the rest a few rows each, by their keys.)
			const full = ( await raw.prepare( 'SELECT ghost_bytes FROM challenges WHERE id = ?' ).bind( challenge.id ).first() ).ghost_bytes;
			const room = await posting( 6000, now + 3 * MINUTE, 'writesRun0000005', { CHALLENGE_GHOST_BUDGET: String( full - 500 ) } );
			t.diagnostic( `a new best letting a slower ghost go read ${ room.read } rows and wrote ${ room.written }` );
			assert.ok( room.read <= better.read + 2 * 64 + 25, String( room.read ) );
			const slowest = player( bottom - 1 );
			assert.equal( ( await raw.prepare( 'SELECT COUNT(*) AS n FROM challenge_ghosts WHERE challenge_id = ? AND player_id = ?' ).bind( challenge.id, slowest ).first() ).n, 0 );
			assert.equal( ( await raw.prepare( 'SELECT ghost FROM challenge_times WHERE challenge_id = ? AND player_id = ?' ).bind( challenge.id, slowest ).first() ).ghost, 0 );
			assert.equal( ( await raw.prepare( 'SELECT ghost FROM challenge_times WHERE challenge_id = ? AND player_id = ?' ).bind( challenge.id, 'writesPlayer0000' ).first() ).ghost, 2 );
			const after = await raw.prepare( 'SELECT ghost_bytes AS n, ( SELECT SUM( bytes ) FROM challenge_ghosts WHERE challenge_id = ?1 ) AS sum FROM challenges WHERE id = ?1' ).bind( challenge.id ).first();
			assert.equal( after.n, after.sum );
			assert.ok( after.n <= full - 500 );

		} finally {

			globalThis.caches = had;
			await proxy.dispose();
			rmSync( dir, { recursive: true, force: true } );

		}

	} );

	test( 'a visit posts CHALLENGE_TIMES_PER_VISIT times at most, from whatever addresses (one robot check buys that many); the visitor\'s day is counted by the /48; a try the visitor\'s day turns away gives the visit its count back', async () => {

		const d1 = sqliteD1();
		const { db } = d1;
		const now = CHALLENGE_DAY;
		const route = makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 11 ) ) );
		const { lastInsertRowid: id } = db.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.run( 'day:2026-11-16', 'earth', 'sprint', 'Arc', '', JSON.stringify( route ), 'rotation', now - HOUR, now + HOUR, now - HOUR );
		// DriveLimits as a stand-in: the addresses each turn is asked for, and a day that can be used up.
		const asked = [];
		let dayUsed = false;
		const limits = { take: async ( kind, ip ) => ( asked.push( [ kind, ip ] ), { ok: ! dayUsed, retryAfter: 100 } ) };
		const posting = ( body, at, ip ) => {

			const ghost = fairGhost( { world: 'earth', kind: 'sprint', route }, body.ms, body.passes );
			const request = new Request( 'https://worlddrive.app/api/challenges/time', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify( { ghost, ...body } ) } );
			return postTime( { request, url: new URL( request.url ), now: at, env: { DB: d1.DB, TURNSTILE_SECRET: PASS_SECRET, CHALLENGE_TIMES_PER_VISIT: '3' }, limits, ctx: { waitUntil: work => d1.pending.push( work ) } } );

		};
		const had = globalThis.caches;
		globalThis.caches = { default: { delete: async () => true, match: async () => undefined, put: async () => {} } };
		try {

			const racer = sqlitePlayer( d1, 'Visit Racer' );
			const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' );
			const visitId = visit.split( '.' )[ 1 ];
			const better = k => fairRun( { world: 'earth', kind: 'sprint', route }, 9000 - k * 100 );
			// Three, each a better best, every 10 s, each from another /64 of one /48: taken, and the
			// visitor's day asked by the /48 each time (one visitor, not three).
			for ( let k = 0; k < 3; k ++ ) {

				const run = better( k );
				const res = await posting( { ...racer, visit, challenge: Number( id ), run: `visitrun${ k }`.padEnd( 16, 'x' ), ms: run.ms, passes: run.passes, vehicle: 'go-kart' }, now + k * TIME_GAP, `2001:db8:5:${ k + 1 }::7` );
				assert.equal( res.status, 200 );

			}

			assert.deepEqual( asked, [ [ 'time', '2001:db8:5::/48' ], [ 'time', '2001:db8:5::/48' ], [ 'time', '2001:db8:5::/48' ] ] );
			assert.equal( db.prepare( 'SELECT times FROM visits WHERE id = ?' ).get( visitId ).times, 3 );
			// A fourth with the same visit, from anywhere: a 429 (reason 'visit'), nothing written, DriveLimits
			// not asked.
			const kept = () => [ db.prepare( 'SELECT ms, run_id FROM challenge_times WHERE player_id = ?' ).get( racer.id ), db.prepare( 'SELECT last_time_at FROM players WHERE id = ?' ).get( racer.id ).last_time_at, db.prepare( 'SELECT times FROM visits WHERE id = ?' ).get( visitId ).times ];
			const was = kept();
			for ( const ip of [ '203.0.113.9', '2001:db8:99::1' ] ) {

				const run = better( 5 );
				await assert.rejects( posting( { ...racer, visit, challenge: Number( id ), run: 'visitrun9'.padEnd( 16, 'x' ), ms: run.ms, passes: run.passes, vehicle: 'go-kart' }, now + 5 * TIME_GAP, ip ),
					err => err.status === 429 && err.extra.reason === 'visit' && err.extra.retryAfter > 60 * 60 );
				assert.deepEqual( kept(), was );

			}

			assert.equal( asked.length, 3 );
			// A new visit (another robot check) posts again.
			const next = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now, 'earth' );
			let run = better( 6 );
			assert.equal( ( await posting( { ...racer, visit: next, challenge: Number( id ), run: 'visitrun6'.padEnd( 16, 'x' ), ms: run.ms, passes: run.passes, vehicle: 'go-kart' }, now + 7 * TIME_GAP, '203.0.113.9' ) ).status, 200 );
			// The visitor's day used up: turned away (daily), held till midnight, and the visit's count as
			// it was (the try it took given back).
			dayUsed = true;
			run = better( 7 );
			await assert.rejects( posting( { ...racer, visit: next, challenge: Number( id ), run: 'visitrun7'.padEnd( 16, 'x' ), ms: run.ms, passes: run.passes, vehicle: 'go-kart' }, now + 9 * TIME_GAP, '203.0.113.9' ), err => err.status === 429 );
			assert.equal( db.prepare( 'SELECT times FROM visits WHERE id = ?' ).get( next.split( '.' )[ 1 ] ).times, 1 );
			assert.equal( db.prepare( 'SELECT last_time_at FROM players WHERE id = ?' ).get( racer.id ).last_time_at, Date.UTC( 2026, 10, 17 ) - TIME_GAP );

		} finally {

			await Promise.all( d1.pending );
			globalThis.caches = had;

		}

	} );

	test( 'a time posted is one of its address\'s CHALLENGE_MISSES (it reads D1 before the gap, the visit\'s times or the visitor\'s day can turn it away): past them a 429 before anything is read; each post asks once', async () => {

		const d1 = sqliteD1();
		const { db } = d1;
		const now = CHALLENGE_DAY;
		const route = makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 5 ) ) );
		const { lastInsertRowid: id } = db.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.run( 'day:2026-11-16', 'earth', 'sprint', 'Arc', '', JSON.stringify( route ), 'rotation', now - 2 * HOUR, now + HOUR, now - 2 * HOUR );
		const had = globalThis.caches;
		globalThis.caches = { default: { delete: async () => true, match: async () => undefined, put: async () => {} } };
		try {

			const who = sqlitePlayer( d1, 'Miss Post' );
			const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' );
			const run = fairRun( { world: 'earth', kind: 'sprint', route }, 4000 );
			const body = { ...who, visit, challenge: Number( id ), run: 'missRun'.padEnd( 16, '_' ), ms: run.ms, passes: run.passes, vehicle: 'go-kart' };
			const looks = { limit: async () => ( { success: true } ) };
			// The address's misses used up: turned away, and D1 never asked.
			const untouched = { prepare: () => assert.fail( 'D1 read' ), batch: () => assert.fail( 'D1 read' ) };
			const ghost = fairGhost( { world: 'earth', kind: 'sprint', route }, run.ms, run.passes );
			const request = new Request( 'https://worlddrive.app/api/challenges/time', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.44' }, body: JSON.stringify( { ...body, ghost } ) } );
			await assert.rejects( postTime( { request, url: new URL( request.url ), now, env: { DB: untouched, TURNSTILE_SECRET: PASS_SECRET, CHALLENGE_LOOKS: looks, CHALLENGE_MISSES: { limit: async () => ( { success: false } ) } }, limits: { take: async () => ( { ok: true } ) }, ctx: { waitUntil: () => {} } } ),
				err => err.status === 429 && err.extra?.retryAfter === 60 );
			// With misses to spare: one asked for the post, and it's taken.
			let asked = 0;
			const res = await postOver( d1, body, now, '198.51.100.44', { CHALLENGE_LOOKS: looks, CHALLENGE_MISSES: { limit: async () => ( asked ++, { success: true } ) } } );
			assert.equal( res.status, 200 );
			assert.equal( asked, 1 );

		} finally {

			await Promise.all( d1.pending );
			globalThis.caches = had;

		}

	} );

	test( 'a challenge\'s ghosts full (CHALLENGE_GHOST_BUDGET): a quicker best\'s lets the slowest kept go, slowest first, and is kept (slow runs posted to fill it keep no leader\'s out); one slower than every kept one goes without; the count stays what\'s kept; and a board hands out the quickest plausible row\'s run, not a made-up leader\'s', async () => {

		const d1 = sqliteD1();
		const { db } = d1;
		const now = CHALLENGE_DAY;
		const route = makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 7 ) ) );
		const challenge = { world: 'earth', kind: 'sprint', route };
		const { lastInsertRowid: id } = db.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.run( 'day:2026-11-16', 'earth', 'sprint', 'Arc', '', JSON.stringify( route ), 'rotation', now - 2 * HOUR, now + HOUR, now - 2 * HOUR );
		const had = globalThis.caches;
		globalThis.caches = { default: { delete: async () => true, match: async () => undefined, put: async () => {} } };
		try {

			// Three slow runs at the bottom (as a script posting the largest ghosts to fill it would), the
			// budget just room for them.
			const runs = { slow1: fairRun( challenge, 40000 ), slow2: fairRun( challenge, 45000 ), slow3: fairRun( challenge, 50000 ), quick: fairRun( challenge, 5000 ), slowest: fairRun( challenge, 60000 ), fake: fairRun( challenge, 1000 ) };
			const bytes = Object.fromEntries( Object.entries( runs ).map( ( [ name, run ] ) => [ name, fairGhost( challenge, run.ms, run.passes ).length ] ) );
			const settings = { CHALLENGE_GHOST_BUDGET: String( bytes.slow1 + bytes.slow2 + bytes.slow3 + 10 ) };
			let at = now;
			let ip = 20;
			const post = async name => {

				const who = sqlitePlayer( d1, `Racer ${ name }` );
				const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' );
				at += 20 * SECOND;
				const res = await postOver( d1, { ...who, visit, challenge: Number( id ), run: `${ name }Run`.padEnd( 16, '_' ), ms: runs[ name ].ms, passes: runs[ name ].passes, vehicle: 'go-kart' }, at, `198.51.100.${ ip ++ }`, settings )
					.catch( err => assert.fail( `${ name }: ${ err.status } ${ JSON.stringify( err.extra ) }` ) );
				assert.equal( res.status, 200, name );
				return who;

			};
			const kept = () => db.prepare( 'SELECT run_id FROM challenge_ghosts WHERE challenge_id = ? ORDER BY ms' ).all( id ).map( row => row.run_id.replace( /Run_*$/, '' ) );
			const counted = () => {

				const { n, sum } = db.prepare( 'SELECT ghost_bytes AS n, ( SELECT COALESCE( SUM( bytes ), 0 ) FROM challenge_ghosts WHERE challenge_id = ?1 ) AS sum FROM challenges WHERE id = ?1' ).get( id );
				assert.equal( n, sum );
				assert.equal( db.prepare( 'SELECT COUNT(*) AS n FROM challenge_ghosts WHERE challenge_id = ? AND bytes != length( ghost )' ).get( id ).n, 0 );
				// Each time's row says whether its ghost is kept (its ghost 1 or 2), and only those are.
				assert.equal( db.prepare( 'SELECT COUNT(*) AS n FROM challenge_times t WHERE t.challenge_id = ? AND ( t.ghost > 0 ) != EXISTS ( SELECT 1 FROM challenge_ghosts g WHERE g.challenge_id = t.challenge_id AND g.player_id = t.player_id )' ).get( id ).n, 0 );
				return n;

			};
			for ( const name of [ 'slow1', 'slow2', 'slow3' ] ) await post( name );
			assert.deepEqual( kept(), [ 'slow1', 'slow2', 'slow3' ] );
			assert.equal( counted(), bytes.slow1 + bytes.slow2 + bytes.slow3 );
			// A quicker one, past the budget: the slowest let go, its room given back, the quick one kept.
			await post( 'quick' );
			assert.deepEqual( kept(), [ 'quick', 'slow1', 'slow2' ] );
			assert.equal( counted(), bytes.quick + bytes.slow1 + bytes.slow2 );
			// One slower than every kept one: on the board, without its ghost; nothing let go for it.
			await post( 'slowest' );
			assert.deepEqual( kept(), [ 'quick', 'slow1', 'slow2' ] );
			assert.equal( db.prepare( 'SELECT COUNT(*) AS n FROM challenge_times WHERE challenge_id = ?' ).get( id ).n, 5 );
			// A made-up leader, a straight line from gate to gate at the game's top speed: taken, and kept
			// (it's the quickest), with the least its route allows along its passes.
			await post( 'fake' );
			assert.equal( kept()[ 0 ], 'fake' );
			counted();
			const least = leastTime( challenge, runs.fake.passes );
			assert.deepEqual( { ...db.prepare( 'SELECT ms, least_ms FROM challenge_ghosts WHERE run_id = ?' ).get( 'fakeRun'.padEnd( 16, '_' ) ) }, { ms: runs.fake.ms, least_ms: least } );
			assert.ok( runs.fake.ms < 2 * least && runs.quick.ms >= 2 * leastTime( challenge, runs.quick.passes ) );
			// (Its row says its ghost is kept but not one to race; quick's, one to race.)
			assert.deepEqual( db.prepare( 'SELECT run_id, ghost FROM challenge_times WHERE challenge_id = ? AND ghost > 0 ORDER BY ms' ).all( id ).map( row => [ row.run_id.replace( /Run_*$/, '' ), row.ghost ] ), [ [ 'fake', 1 ], [ 'quick', 2 ], [ 'slow1', 2 ], [ 'slow2', 2 ] ] );
			// The board hands out one run: the quickest row whose time could plausibly be driven and whose
			// ghost is kept (quick's), not the made-up leader's (on top, without its run), nor a slower one's.
			const request = new Request( `https://worlddrive.app/api/challenges/board?challenge=${ id }`, { headers: { 'CF-Connecting-IP': '198.51.100.90' } } );
			const shown = await ( await challengeBoard( { request, url: new URL( request.url ), env: { DB: d1.DB }, now: at, ctx: { waitUntil: () => {} } } ) ).json();
			assert.deepEqual( shown.rows.map( row => [ row.name, row.run ?? null ] ), [
				[ 'Racer fake', null ], [ 'Racer quick', 'quickRun'.padEnd( 16, '_' ) ], [ 'Racer slow1', null ], [ 'Racer slow2', null ], [ 'Racer slow3', null ], [ 'Racer slowest', null ],
			] );

		} finally {

			await Promise.all( d1.pending );
			globalThis.caches = had;

		}

	} );

	test( 'a run\'s id names one time on a challenge: another player\'s post with it is turned away (400), nothing of it written', async () => {

		const d1 = sqliteD1();
		const { db } = d1;
		const now = CHALLENGE_DAY;
		const route = makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 9 ) ) );
		const { lastInsertRowid: id } = db.prepare( 'INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.run( 'day:2026-11-16', 'earth', 'sprint', 'Arc', '', JSON.stringify( route ), 'rotation', now - HOUR, now + HOUR, now - HOUR );
		const had = globalThis.caches;
		globalThis.caches = { default: { delete: async () => true, match: async () => undefined, put: async () => {} } };
		try {

			const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' );
			const victim = sqlitePlayer( d1, 'Victim Racer' );
			const slow = fairRun( { world: 'earth', kind: 'sprint', route }, 9000 );
			assert.equal( ( await postOver( d1, { ...victim, visit, challenge: Number( id ), run: 'VictimRun_abc123', ms: slow.ms, passes: slow.passes, vehicle: 'go-kart' }, now ) ).status, 200 );
			// Copy Cat, quicker, with Victim's run's id (from a link to it): turned away, as a new row and as
			// a better best of their own alike.
			const copy = sqlitePlayer( d1, 'Copy Cat' );
			const quick = fairRun( { world: 'earth', kind: 'sprint', route }, 5000 );
			const copied = { ...copy, visit: await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now - HOUR, 'earth' ), challenge: Number( id ), run: 'VictimRun_abc123', ms: quick.ms, passes: quick.passes, vehicle: 'go-kart' };
			await assert.rejects( postOver( d1, copied, now, '198.51.100.9' ), err => err.status === 400 && err.extra.reason === 'run' );
			const own = fairRun( { world: 'earth', kind: 'sprint', route }, 9500 );
			assert.equal( ( await postOver( d1, { ...copied, run: 'CopyCatOwnRun_01', ms: own.ms, passes: own.passes }, now + 20 * SECOND, '198.51.100.9' ) ).status, 200 );
			await assert.rejects( postOver( d1, { ...copied, ms: quick.ms }, now + 40 * SECOND, '198.51.100.9' ), err => err.status === 400 && err.extra.reason === 'run' );
			assert.deepEqual( db.prepare( 'SELECT player_id, run_id FROM challenge_times ORDER BY ms' ).all().map( r => [ r.player_id, r.run_id ] ), [ [ victim.id, 'VictimRun_abc123' ], [ copy.id, 'CopyCatOwnRun_01' ] ] );
			assert.equal( db.prepare( 'SELECT drivers FROM challenges WHERE id = ?' ).get( id ).drivers, 2 );

		} finally {

			await Promise.all( d1.pending );
			globalThis.caches = had;

		}

	} );

	test( 'on the Moon, no gate on a crater\'s wall: each point on ground sloping under 20°, on its own heights', async () => {

		const bytes = readFileSync( MOON_HEIGHTS );
		setHeights( new Int16Array( bytes.buffer, bytes.byteOffset, bytes.byteLength / 2 ) );
		let checked = 0;
		let faults = 0;
		for ( const place of MOON_PLACES.slice( 0, 24 ) ) {

			for ( const kind of KINDS ) {

				const bytes = Uint8Array.from( { length: 16 }, ( _, i ) => place.id.charCodeAt( i % place.id.length ) * ( i + 1 ) );
				const route = makeRoute( { kind, size: 'week', world: 'moon', place }, randomFrom( bytes ), moonFaults );
				faults += movableFaults( route );
				checked += route.points.length;

			}

		}

		// Laid out again where one was: few left (on the roughest ground, the fewest of the tries).
		assert.ok( faults <= checked * 0.02, `${ faults } of ${ checked }` );

	} );

	test( 'on the Moon, the legs too: a route\'s way from gate to gate (and to a landmark) kept off crater walls and mountainsides where any of its tries is', async () => {

		const bytes = readFileSync( MOON_HEIGHTS );
		setHeights( new Int16Array( bytes.buffer, bytes.byteOffset, bytes.byteLength / 2 ) );
		// A leg is counted by its steep stretches (100 m rising or falling 20° or more): across
		// Shackleton's wall, from inside the crater, a dozen; along its rim, or from out on the plain to
		// its north, none.
		const rim = MOON_PLACES.find( p => p.name === 'Shackleton crater rim' );
		const from = bearing => legFaults( ...destination( 'moon', rim.lat, rim.lon, bearing, 1600 ), rim.lat, rim.lon );
		assert.ok( from( 90 ) >= 8, String( from( 90 ) ) );
		assert.equal( from( 0 ), 0 );
		const tycho = MOON_PLACES.find( p => p.id === 'moon-apollo-11' );
		assert.equal( legFaults( tycho.lat, tycho.lon, ...destination( 'moon', tycho.lat, tycho.lon, 45, 2000 ) ), 0, 'the Sea of Tranquillity is flat' );
		// Every Moon place's sprints and landmarks of each length, laid out as the Worker does (with its
		// check) and with their points alone checked: each leg's steep stretches.
		const lay = check => {

			let legs = 0;
			let steep = 0;
			let worst = 0;
			for ( const place of MOON_PLACES ) {

				for ( const size of [ 'day', 'week', 'month' ] ) {

					for ( const kind of [ 'sprint', 'landmark' ] ) {

						const seed = Uint8Array.from( { length: 16 }, ( _, i ) => ( place.id.charCodeAt( i % place.id.length ) * ( i + 7 ) + size.length * 31 + kind.length ) & 255 );
						const route = makeRoute( { kind, size, world: 'moon', place }, randomFrom( seed ), check );
						const points = [ [ route.start.lat, route.start.lon ], ...route.points ];
						for ( let i = 1; i < points.length; i ++ ) {

							const faults = legFaults( ...points[ i - 1 ], ...points[ i ] );
							legs ++;
							if ( faults ) steep ++;
							worst = Math.max( worst, faults );

						}

					}

				}

			}

			return { legs, steep, worst };

		};
		const checked = lay( moonFaults );
		const pointsAlone = lay( route => [ [ route.start.lat, route.start.lon ], ...route.points ].filter( point => moonSteep( ...point ) ).length );
		// No leg with more than 6 (the few left are sprints' on Shackleton's rim and Mons Hadley, where
		// none of a sprint's tries was clear; a landmark's drive is the clearest way in, below), and few
		// with any; far fewer than with the points alone checked.
		assert.ok( checked.worst <= 6, JSON.stringify( checked ) );
		assert.ok( checked.steep <= checked.legs * 0.03, JSON.stringify( checked ) );
		assert.ok( pointsAlone.worst > 10 && pointsAlone.steep > checked.steep * 1.4, JSON.stringify( { checked, pointsAlone } ) );

	} );

	test( 'on the Moon, a landmark\'s drive comes in the clearest way there is: laid out as the Worker lays them, every place over many periods, none crosses a steep stretch where a way in from another bearing at its distance wouldn\'t', async () => {

		const bytes = readFileSync( MOON_HEIGHTS );
		setHeights( new Int16Array( bytes.buffer, bytes.byteOffset, bytes.byteLength / 2 ) );
		const env = { TURNSTILE_SECRET: PASS_SECRET };
		// 20 days, 8 weeks and 4 months from today's, each place a landmark in each, with the Worker's own
		// random numbers for it (challengeFor: an HMAC of the period, the world, the kind and the place).
		const periods = [
			...Array.from( { length: 20 }, ( _, i ) => periodOf( 'day', CHALLENGE_DAY + i * DAY ) ),
			...Array.from( { length: 8 }, ( _, i ) => periodOf( 'week', CHALLENGE_DAY + i * 7 * DAY ) ),
			...Array.from( { length: 4 }, ( _, i ) => periodOf( 'month', Date.UTC( 2026, 10 + i, 2 ) ) ),
		];
		let legs = 0;
		let crossing = 0;
		let worst = 0;
		for ( const place of MOON_PLACES ) {

			for ( const period of periods ) {

				const route = JSON.parse( ( await challengeFor( env, period, 'moon', { place, kind: 'landmark', source: 'rotation' }, CHALLENGE_DAY ) ).route );
				const faults = moonFaults( route, 'landmark' );
				const stretches = legFaults( route.start.lat, route.start.lon, place.lat, place.lon );
				legs ++;
				worst = Math.max( worst, stretches );
				if ( stretches ) crossing ++;
				if ( ! faults ) continue;
				// Every other way in at its distance, every 5 degrees round from its own: none clearer. (Its
				// bearing and distance are whole degrees and metres, so they're told again from its start.)
				const distance = Math.round( metresOn( 'moon', place.lat, place.lon, route.start.lat, route.start.lon ) );
				const back = Math.round( bearingTo( 'moon', place.lat, place.lon, route.start.lat, route.start.lon ) );
				const [ lat0, lon0 ] = destination( 'moon', place.lat, place.lon, back, distance ).map( degrees => Math.round( degrees * 1e6 ) / 1e6 );
				assert.deepEqual( [ lat0, lon0 ], [ route.start.lat, route.start.lon ] );
				for ( let turn = 5; turn < 360; turn += 5 ) {

					const [ lat, lon ] = destination( 'moon', place.lat, place.lon, back + turn, distance ).map( degrees => Math.round( degrees * 1e6 ) / 1e6 );
					const other = moonFaults( { start: { lat, lon }, points: route.points }, 'landmark' );
					assert.ok( other >= faults, `${ place.name } ${ period.key }: ${ faults } faults coming in from ${ Math.round( back ) }°, ${ other } from ${ Math.round( back + turn ) }°` );

				}

			}

		}

		// Few cross anything at all (10 of the 1,664 here: Shackleton's rim and Mons Hadley on days whose
		// distance has no clear way in, from any bearing). Tried from 8 bearings spread round, as before,
		// 17 crossed, 13 of them where another bearing was clear, one 10 stretches up and down
		// Shackleton's wall.
		assert.ok( crossing <= legs * 0.01, `${ crossing } of ${ legs }` );
		assert.ok( worst <= 8, String( worst ) );

	} );

	test( 'on Mars, as on the Moon: its routes checked on its own heights (MOLA\'s, from /mars/height.bin, on its own made-up ground), no gate on ground sloping 20° or more and its legs kept off its canyons\' walls where any of its tries is', async () => {

		giveHeights( 'moon' );
		giveHeights( 'mars' );
		// Mars's own ground: Olympus Mons's top over 20 km up (higher than anything on the Moon), and down
		// Valles Marineris's south wall into Coprates Chasma, from the plateau to the canyon's floor 8 km
		// under it, steep stretch after steep stretch; along the floor, none. The Moon's ground at the
		// same latitudes and longitudes is nothing like it.
		const place = id => MARS_PLACES.find( p => p.id === id );
		const summit = place( 'mars-olympus-summit' );
		assert.ok( GROUNDS.mars.heightAt( summit.lat, summit.lon ) > 20000 );
		assert.ok( GROUNDS.moon.heightAt( summit.lat, summit.lon ) < 12000 );
		const canyon = place( 'mars-valles-marineris' );
		const south = metres => destination( 'mars', canyon.lat, canyon.lon, 180, metres );
		const wall = legFaultsOn( 'mars', ...south( 42000 ), ...south( 28000 ) );
		assert.ok( wall >= 50, String( wall ) );
		assert.equal( legFaultsOn( 'mars', canyon.lat, canyon.lon, ...destination( 'mars', canyon.lat, canyon.lon, 90, 2000 ) ), 0, 'the canyon\'s floor' );
		assert.notEqual( legFaultsOn( 'moon', ...south( 42000 ), ...south( 28000 ) ), wall );
		// Every Mars place's routes of each kind, laid out as the Worker does (its check on Mars's
		// heights): hardly a point left on steep ground.
		let checked = 0;
		let faults = 0;
		const check = ( route, kind, enough ) => routeFaults( 'mars', route, kind, enough );
		for ( const at of MARS_PLACES ) {

			for ( const kind of KINDS ) {

				const bytes = Uint8Array.from( { length: 16 }, ( _, i ) => at.id.charCodeAt( i % at.id.length ) * ( i + 1 ) );
				const route = makeRoute( { kind, size: 'week', world: 'mars', place: at }, randomFrom( bytes ), check );
				faults += movableFaults( route, 'mars' );
				checked += route.points.length;

			}

		}

		assert.ok( faults <= checked * 0.01, `${ faults } of ${ checked }` );
		// And their sprints' and landmarks' legs of each length: fewer steep ones than with the points
		// alone checked, and hardly any.
		const lay = check => {

			let legs = 0;
			let steep = 0;
			for ( const at of MARS_PLACES ) {

				for ( const size of [ 'day', 'week', 'month' ] ) {

					for ( const kind of [ 'sprint', 'landmark' ] ) {

						const seed = Uint8Array.from( { length: 16 }, ( _, i ) => ( at.id.charCodeAt( i % at.id.length ) * ( i + 7 ) + size.length * 31 + kind.length ) & 255 );
						const route = makeRoute( { kind, size, world: 'mars', place: at }, randomFrom( seed ), check );
						const points = [ [ route.start.lat, route.start.lon ], ...route.points ];
						for ( let i = 1; i < points.length; i ++ ) {

							legs ++;
							if ( legFaultsOn( 'mars', ...points[ i - 1 ], ...points[ i ] ) ) steep ++;

						}

					}

				}

			}

			return { legs, steep };

		};
		const legs = lay( check );
		const pointsAlone = lay( route => [ [ route.start.lat, route.start.lon ], ...route.points ].filter( point => steepOn( 'mars', ...point ) ).length );
		assert.ok( legs.steep <= legs.legs * 0.005 && legs.steep < pointsAlone.steep, JSON.stringify( { legs, pointsAlone } ) );
		// The Worker lays them out so: on Mars with Mars's heights from the site's own file (through
		// ASSETS), and the Moon's with the Moon's.
		const env = { TURNSTILE_SECRET: PASS_SECRET, ASSETS: heightsAssets() };
		const period = periodOf( 'week', CHALLENGE_DAY );
		const at = place( 'mars-curiosity' );
		const made = JSON.parse( ( await challengeFor( env, period, 'mars', { place: at, kind: 'sprint', source: 'rotation' }, CHALLENGE_DAY ) ).route );
		// (Its random numbers the Worker's own: an HMAC of the period, the world, the kind and the place.)
		const key = await derivedKey( PASS_SECRET, 'world-drive challenges v1' );
		const random = randomFrom( new Uint8Array( await crypto.subtle.sign( 'HMAC', key, encoder.encode( `route:${ period.key }:mars:sprint:${ at.lat },${ at.lon }` ) ) ) );
		assert.deepEqual( made, makeRoute( { kind: 'sprint', size: 'week', world: 'mars', place: at }, random, check ) );

	} );

	test( 'on Vesta and Ceres the slope checks measure against the level spheroid\'s up (level.js), not the radial: a point is steep as its ground leans 20° from what\'s level there, a leg as it rises along the level up; their places\' routes checked on it leave fewer points on steep ground than unchecked', async () => {

		const { levelFrame, pointOn } = await import( '../src/drive-app/level.js' );
		giveHeights( 'vesta' );
		giveHeights( 'ceres' );
		const tan = Math.tan( 20 * Math.PI / 180 );
		const minus = ( a, b ) => [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];
		const dot = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
		const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
		for ( const world of [ 'vesta', 'ceres' ] ) {

			const { heightAt } = GROUNDS[ world ];
			const ground = ( lat, lon ) => pointOn( world, lat, lon, heightAt( lat, lon, 30 ) );
			// A point: the ground's plane through the four points 15 m north, east, south and west, and the
			// angle of its normal from the level up there (what the radial check would say beside it).
			let [ points, agreed, near, radialOther ] = [ 0, 0, 0, 0 ];
			for ( let lat = - 80; lat <= 80; lat += 4 ) {

				for ( let lon = - 180; lon < 180; lon += 9 ) {

					points ++;
					const [ n, e, s, w ] = [ 0, 90, 180, 270 ].map( bearing => destination( world, lat, lon, bearing, 15 ) );
					const normal = cross( minus( ground( ...e ), ground( ...w ) ), minus( ground( ...n ), ground( ...s ) ) );
					const cos = dot( normal, levelFrame( world, lat, lon ).up ) / Math.hypot( ...normal );
					const leans = Math.sqrt( 1 - cos * cos ) / cos;
					const radial = Math.hypot( heightAt( ...n, 30 ) - heightAt( ...s, 30 ), heightAt( ...e, 30 ) - heightAt( ...w, 30 ) ) / 30 >= tan;
					if ( radial !== leans >= tan ) radialOther ++;
					if ( Math.abs( leans - tan ) < 0.02 ) {

						near ++;
						continue;

					}

					assert.equal( steepOn( world, lat, lon ), leans >= tan, `${ world } ${ lat }, ${ lon }: leans ${ ( Math.atan( leans ) * 180 / Math.PI ).toFixed( 1 ) }°` );
					agreed ++;

				}

			}

			assert.ok( agreed > points * 0.9, `${ world }: ${ agreed } of ${ points } (${ near } near 20°)` );
			// Vesta's level leans up to 12.6° off the radial: there the radial check would say otherwise
			// at many places; Ceres's hardly leans (4°), at few.
			if ( world === 'vesta' ) assert.ok( radialOther > points * 0.02, `${ world }: the radial says otherwise at ${ radialOther } of ${ points }` );
			// A leg of 100 m (one stretch of LEG_REACH): steep as it rises along the level up at its start
			// against how far it goes across it.
			let [ legs, steepLegs ] = [ 0, 0 ];
			for ( let lat = - 76; lat <= 76; lat += 8 ) {

				for ( let lon = - 175; lon < 180; lon += 25 ) {

					for ( const bearing of [ 0, 135 ] ) {

						const end = destination( world, lat, lon, bearing, 100 );
						const d = minus( ground( ...end ), ground( lat, lon ) );
						const { up } = levelFrame( world, lat, lon );
						const rise = dot( d, up );
						const across = Math.hypot( ...minus( d, up.map( v => v * rise ) ) );
						if ( Math.abs( Math.abs( rise ) / across - tan ) < 0.02 ) continue;
						legs ++;
						const steep = Math.abs( rise ) >= tan * across;
						if ( steep ) steepLegs ++;
						assert.equal( legFaultsOn( world, lat, lon, ...end ), steep ? 1 : 0, `${ world } ${ lat }, ${ lon } at ${ bearing }°: rises ${ rise.toFixed( 1 ) } m over ${ across.toFixed( 1 ) } m` );

					}

				}

			}

			assert.ok( legs > 400 && steepLegs > 0, `${ world }: ${ steepLegs } of ${ legs }` );
			// Every place's routes of each kind, laid out as the Worker does (checked on its heights), and
			// the same unchecked. Far rougher than the Moon's or Mars's (half of what's round Vesta's
			// places, unchecked, leans 20° or more; a tenth of Ceres's), so not "hardly any", as there,
			// but far fewer than without the check.
			const faultsOf = check => {

				let [ checked, faults ] = [ 0, 0 ];
				for ( const at of { vesta: VESTA_PLACES, ceres: CERES_PLACES }[ world ] ) {

					for ( const kind of KINDS ) {

						const bytes = Uint8Array.from( { length: 16 }, ( _, i ) => at.id.charCodeAt( i % at.id.length ) * ( i + 1 ) );
						const route = makeRoute( { kind, size: 'week', world, place: at }, randomFrom( bytes ), check );
						faults += movableFaults( route, world );
						checked += route.points.length;

					}

				}

				return { checked, faults };

			};
			const { checked, faults } = faultsOf( ( route, kind, enough ) => routeFaults( world, route, kind, enough ) );
			const unchecked = faultsOf( undefined ).faults;
			assert.ok( faults <= unchecked * 0.7, `${ world }: ${ faults } checked, ${ unchecked } unchecked` );
			assert.ok( faults <= checked * { vesta: 0.35, ceres: 0.05 }[ world ], `${ world }: ${ faults } of ${ checked }` );
			console.log( `# ${ world }: ${ agreed } points as the level says (${ near } near 20°, the radial otherwise at ${ radialOther }); ${ steepLegs } of ${ legs } legs steep; routes' points steep ${ faults } of ${ checked } (unchecked ${ unchecked })` );

		}

	} );

	test( 'the rotation keeps clear of what D1 has fixed: a year of days fixed as the Worker fixes them, with the owner\'s picks for weeks and months and places approved and unapproved on the way, never a place twice in a row nor two of the three live alike', async () => {

		// As liveChallenges fixes them: each day the periods not yet fixed, the longest first, each from
		// the owner's pick for it or the rotation's, clear of what's fixed (the live ones and the one
		// before). The owner picks every third week the place the rotation alone would give one of its
		// days, and every other month the place it would give its first week; a busy place is approved
		// on day 40 and another on day 200, and the first unapproved on day 300 (each reshuffling the
		// rotation's order, so what it would choose now isn't what was fixed). The rules' own test
		// (above) is the rotation alone, its list unchanged.
		const busy = [
			{ world: 'earth', cell_row: 14212, cell_column: 5052, name: 'Lombard Street', region: 'San Francisco', lat: 37.8021, lon: - 122.4187 },
			{ world: 'earth', cell_row: 15000, cell_column: 4000, name: 'Somewhere busy', region: '', lat: 41.2, lon: 12.1 },
			{ world: 'moon', cell_row: 300, cell_column: 400, name: 'A busy crater', region: '', lat: 12.5, lon: 30.25 },
			{ world: 'mars', cell_row: 5000, cell_column: 9000, name: 'A busy plain', region: '', lat: - 5.4, lon: - 27.9 },
		];
		for ( const secret of [ PASS_SECRET, 'another-secret-for-the-rotation-x' ] ) {

			const env = { TURNSTILE_SECRET: secret };
			for ( const world of WORLD_IDS ) {

				const rows = new Map();
				let approved = [];
				let clashes = 0;
				let fixings = 0;
				const pinned = ( period, chosen ) => {

					const { lat, lon } = chosen.place;
					const route = chosen.kind === 'landmark' ? { start: { lat: lat + 0.02, lon }, points: [ [ lat, lon ] ] } : { start: { lat, lon }, points: [] };
					return { period: period.key, world, kind: chosen.kind, place: chosen.place.name, route: JSON.stringify( route ), source: chosen.source, starts_at: period.starts, ends_at: period.ends, order: fixings ++ };

				};
				const placeOf = row => row && JSON.parse( row.route ).points[ 0 ] ? [ row.place, ...JSON.parse( row.route ).points[ 0 ] ] : row && [ row.place, JSON.parse( row.route ).start.lat, JSON.parse( row.route ).start.lon ];
				const same = ( a, b ) => a && b && ( a[ 0 ] === b[ 0 ] || metresOn( world, a[ 1 ], a[ 2 ], b[ 1 ], b[ 2 ] ) < 1000 );
				const from = Date.UTC( 2026, 10, 16 );
				for ( let i = 0; i < 365; i ++ ) {

					const now = from + i * DAY + 10 * HOUR;
					if ( i === 40 ) approved = busy.slice( 0, 1 ).concat( busy.slice( 2 ) );
					if ( i === 200 ) approved = busy;
					if ( i === 300 ) approved = busy.slice( 1 );
					const periods = periodsAt( now, PERIODS );
					const fixed = [ ...periods, ...periods.map( p => periodOf( p.kind, p.starts - 1 ) ) ].map( p => rows.get( p.key ) ).filter( Boolean );
					for ( const period of [ ...periods ].reverse() ) {

						if ( rows.has( period.key ) ) continue;
						const index = Math.round( period.starts / DAY );
						let chosen = null;
						// The owner's picks: the place the rotation alone would give a day in it.
						if ( period.kind === 'week' && index % 3 === 0 ) chosen = { ...await rotationPick( env, periodOf( 'day', period.starts + 2 * DAY ), world, approved ), source: 'owner' };
						if ( period.kind === 'month' && new Date( period.starts ).getUTCMonth() % 2 === 0 ) chosen = { ...await rotationPick( env, periodOf( 'day', period.starts + DAY ), world, approved ), source: 'owner' };
						chosen ??= await rotationPick( env, period, world, approved, fixed );
						const row = pinned( period, chosen );
						rows.set( period.key, row );
						fixed.push( row );

					}

					// Today's three: three places, and none the one before's of its kind. Each rule binds the
					// rotation's choice made after the other was fixed (the owner may choose what they like).
					const [ day, week, month ] = periods.map( p => rows.get( p.key ) );
					const label = `${ secret } ${ world } ${ day.period }`;
					const apart = ( a, b, what ) => {

						const later = a.order > b.order ? a : b;
						if ( later.source === 'rotation' ) assert.ok( ! same( placeOf( a ), placeOf( b ) ), `${ label }: ${ what }` );

					};
					apart( day, week, 'the day its week\'s' );
					apart( day, month, 'the day its month\'s' );
					apart( week, month, 'the week its month\'s' );
					for ( const row of [ day, week, month ] ) {

						const before = rows.get( periodOf( periodKindOf( row ), row.starts_at - 1 ).key );
						if ( before ) apart( row, before, `${ row.period } the one before's again` );

					}
					// (How often the rotation alone would have clashed, to know this has tested something.)
					const alone = await rotationPick( env, periodOf( 'day', now ), world, approved );
					if ( [ rows.get( periodOf( 'day', now - DAY ).key ), week, month ].some( row => same( [ alone.place.name, alone.place.lat, alone.place.lon ], placeOf( row ) ) ) ) clashes ++;

				}

				assert.ok( clashes >= 20, `${ secret } ${ world }: only ${ clashes } days the rotation alone would have clashed` );

			}

		}

	} );

	test( 'CHALLENGE_LOOKS and CHALLENGE_MISSES count an address by a keyed hash of it and the day, never the address itself (an IPv6 one by its /48, as the drop-in places count a visitor)', async () => {

		const env = { TURNSTILE_SECRET: PASS_SECRET };
		const from = ip => new Request( 'https://worlddrive.app/api/challenges', { headers: { 'CF-Connecting-IP': ip } } );
		const key = await lookKey( env, from( '198.51.100.7' ), CHALLENGE_DAY );
		assert.match( key, /^[0-9a-f]{32}$/ );
		assert.equal( await lookKey( env, from( '198.51.100.7' ), CHALLENGE_DAY + 8 * HOUR ), key, 'the same address the same day' );
		assert.notEqual( await lookKey( env, from( '198.51.100.7' ), CHALLENGE_DAY + DAY ), key, 'the next day' );
		assert.notEqual( await lookKey( env, from( '198.51.100.8' ), CHALLENGE_DAY ), key, 'another address' );
		assert.notEqual( await lookKey( { TURNSTILE_SECRET: 'another-secret-for-the-rotation-x' }, from( '198.51.100.7' ), CHALLENGE_DAY ), key, 'another secret' );
		// One /48 (65,536 /64s, which a free tunnel broker hands out) is one address to it; the next /48
		// another.
		const six = await lookKey( env, from( '2001:db8:1:2:aaaa::1' ), CHALLENGE_DAY );
		assert.equal( await lookKey( env, from( '2001:db8:1:2:bbbb:cccc:dddd:9' ), CHALLENGE_DAY ), six );
		assert.equal( await lookKey( env, from( '2001:db8:1:3::1' ), CHALLENGE_DAY ), six, 'another /64 of the /48' );
		assert.equal( await lookKey( env, from( '2001:db8:1:ffff:1::1' ), CHALLENGE_DAY ), six, 'another /64 of the /48' );
		assert.notEqual( await lookKey( env, from( '2001:db8:2:3::1' ), CHALLENGE_DAY ), six, 'another /48' );
		assert.equal( VISITOR_PREFIX, 48 );

	} );

} );

describe( 'World Drive challenge ghosts: the rules', () => {

	// A sprint at the Arc de Triomphe, a hunt for stars on the Moon, and a drive to a landmark on Mars
	// (the Pathfinder lander's), laid out as the Worker does.
	const sprint = { world: 'earth', kind: 'sprint', route: makeRoute( { kind: 'sprint', size: 'day', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 21 ) ) ) };
	const hunt = { world: 'moon', kind: 'collect', route: makeRoute( { kind: 'collect', size: 'week', world: 'moon', place: { name: 'Tycho', lat: - 43.31, lon: - 11.36 } }, randomFrom( new Uint8Array( 32 ).fill( 22 ) ) ) };
	const drive = { world: 'mars', kind: 'landmark', route: makeRoute( { kind: 'landmark', size: 'week', world: 'mars', place: { name: 'Ares Vallis', lat: 19.13, lon: - 33.22 } }, randomFrom( new Uint8Array( 32 ).fill( 23 ) ) ) };

	test( 'a ghost\'s frame is the scene\'s at the route\'s start: where a point is from it (localOf) is where 3d-tiles-renderer\'s object frame there puts it, to the millimetre, on the Earth\'s ellipsoid and the Moon\'s and Mars\'s spheres', async () => {

		const { Matrix4, Vector3 } = await import( 'three' );
		const { Ellipsoid, OBJECT_FRAME, WGS84_ELLIPSOID } = await import( '3d-tiles-renderer' );
		const moon = new Ellipsoid( 1737400, 1737400, 1737400 );
		const mars = new Ellipsoid( 3389500, 3389500, 3389500 );
		const rad = Math.PI / 180;
		for ( const [ world, ellipsoid, lat, lon ] of [
			[ 'earth', WGS84_ELLIPSOID, 46.5725, 8.4153 ], [ 'earth', WGS84_ELLIPSOID, - 33.86, 151.21 ], [ 'earth', WGS84_ELLIPSOID, 64.1, - 21.9 ], [ 'moon', moon, - 43.31, - 11.36 ], [ 'moon', moon, 0.67, 23.47 ],
			[ 'mars', mars, 18.65, - 133.8 ], [ 'mars', mars, - 4.5895, 137.4417 ], [ 'mars', mars, - 83.9, 160 ],
		] ) {

			const frame = new Matrix4();
			ellipsoid.getObjectFrame( lat * rad, lon * rad, 0, 0, 0, 0, frame, OBJECT_FRAME );
			frame.invert();
			for ( const [ dLat, dLon, height ] of [ [ 0.01, 0.02, 0 ], [ - 0.05, 0.03, 2500 ], [ 0.07, - 0.06, - 300 ] ] ) {

				const point = ellipsoid.getCartographicToPosition( ( lat + dLat ) * rad, ( lon + dLon ) * rad, height, new Vector3() ).applyMatrix4( frame );
				const [ east, north, up ] = localOf( world, { lat, lon }, lat + dLat, lon + dLon, height );
				// (The scene's x is west, y up and z north.)
				assert.ok( Math.abs( - point.x - east ) < 0.001 && Math.abs( point.z - north ) < 0.001 && Math.abs( point.y - up ) < 0.001, `${ world } ${ lat },${ lon }: ${ point.toArray() } ${ [ east, north, up ] }` );

			}

		}

		// Mars's frame is its sphere, never the Earth's ellipsoid (where a point 5 km off on Mars would be
		// nearly twice as far); a world that isn't one has none, and no ghost on it is taken.
		const [ east ] = localOf( 'mars', { lat: 0, lon: 0 }, 0, 5000 / ( 3389500 * rad ) );
		assert.ok( Math.abs( east - 5000 ) < 1, String( east ) );
		assert.equal( localOf( 'pluto', { lat: 0, lon: 0 }, 0, 0.1 ), null );
		const run = fairRun( drive, 3000 );
		assert.equal( ghostFault( { ...drive, world: 'pluto' }, run.ms, run.passes, fairGhost( drive, run.ms, run.passes ) ), 'world' );

	} );

	// Vesta's and Ceres's frames lean on their level spheroids (level.js): the scene's up is the
	// spheroid's normal, not the radial, and the scene's frame is moved to the car every recentre m
	// while it drives (the recorder's samples moved with it). A run recorded so is taken whatever its
	// recentres; the same run with its samples left where they were isn't.
	test( 'on Vesta and Ceres a ghost\'s frame is the level one (levelFrame): localOf is where it puts a point, and a run recorded across the scene\'s recentres (its samples moved with them) is taken, in a deep basin, on a leaning slope and in the air; one whose samples weren\'t moved, or off its gates or its start, isn\'t', async () => {

		const { Group, Matrix4, Object3D, Vector3 } = await import( 'three' );
		const { Ellipsoid, OBJECT_FRAME } = await import( '3d-tiles-renderer' );
		const { createRecorder } = await import( '../src/drive-app/challenge-ghost.js' );
		const { inFrame, levelFrame, levelled, pointOn } = await import( '../src/drive-app/level.js' );
		const { WORLDS } = await import( '../src/drive-app/worlds.js' );
		assert.deepEqual( WORLD_IDS.filter( levelled ), [ 'vesta', 'ceres' ] );
		assert.deepEqual( [ WORLDS.vesta.recentre, WORLDS.ceres.recentre ], [ 1000, 1500 ] );
		// The scene's matrix for the body at a place (main.js's placeBody): the inverse of the frame there,
		// x west, y up, z north.
		const basis = ( { origin, east, north, up } ) => new Matrix4().makeBasis( new Vector3( ...east ).negate(), new Vector3( ...up ), new Vector3( ...north ) ).setPosition( ...origin );
		const groupAt = ( world, lat, lon, height ) => {

			if ( levelled( world ) ) return basis( levelFrame( world, lat, lon, height ) ).invert();
			const R = WORLDS[ world ].radius;
			const m = new Matrix4();
			new Ellipsoid( R, R, R ).getObjectFrame( lat * Math.PI / 180, lon * Math.PI / 180, height, 0, 0, 0, m, OBJECT_FRAME );
			return m.invert();

		};
		// With no level (the Moon), levelFrame's basis is 3d-tiles-renderer's object frame.
		const R = WORLDS.moon.radius;
		const object = new Matrix4();
		new Ellipsoid( R, R, R ).getObjectFrame( 23 * Math.PI / 180, - 47 * Math.PI / 180, 0, 0, 0, 0, object, OBJECT_FRAME );
		const made = basis( levelFrame( 'moon', 23, - 47, 0 ) );
		assert.ok( object.elements.every( ( v, i ) => Math.abs( v - made.elements[ i ] ) < 1e-6 ) );
		// localOf on a levelled world: the point in the level frame at the start (height 0), where the
		// scene's own frame there puts it; along the level up from the pin, straight up in it, though
		// that's 12° off the radial at 40° N on Vesta.
		for ( const [ world, lat, lon ] of [ [ 'vesta', 40, 30 ], [ 'vesta', - 70, - 60 ], [ 'ceres', - 30, 100 ], [ 'ceres', 60, - 150 ] ] ) {

			const frame = basis( levelFrame( world, lat, lon, 0 ) ).invert();
			for ( const [ dLat, dLon, height ] of [ [ 0.01, 0.02, 0 ], [ - 0.05, 0.03, 2500 ], [ 0.07, - 0.06, - 30000 ] ] ) {

				const point = new Vector3( ...pointOn( world, lat + dLat, lon + dLon, height ) ).applyMatrix4( frame );
				const [ east, north, up ] = localOf( world, { lat, lon }, lat + dLat, lon + dLon, height );
				assert.ok( Math.abs( - point.x - east ) < 0.001 && Math.abs( point.z - north ) < 0.001 && Math.abs( point.y - up ) < 0.001, `${ world } ${ lat },${ lon }: ${ point.toArray() } ${ [ east, north, up ] }` );

			}

		}

		const level = levelFrame( 'vesta', 40, 30, 0 );
		const over = inFrame( level, level.origin.map( ( v, i ) => v + level.up[ i ] * 500 ) );
		assert.ok( Math.abs( over[ 0 ] ) < 1e-6 && Math.abs( over[ 1 ] ) < 1e-6 && Math.abs( over[ 2 ] - 500 ) < 1e-6 );
		const radial = localOf( 'vesta', { lat: 40, lon: 30 }, 40, 30, 500 );
		assert.ok( Math.hypot( radial[ 0 ], radial[ 1 ] ) > 50, String( radial ) );

		// A run: from `start` through `points` at `speed` m/s, the car's pivot `lift` m over the ground at
		// groundAt( lat, lon ) (and `hop` m more, up and down), recorded as the page does (the recorder,
		// packed at the route's start) in a scene moved to the car every `every` m (0: never), its samples
		// moved with it or not.
		const metres = ( world, a, b ) => {

			const [ p, q ] = [ pointOn( world, ...a ), pointOn( world, ...b ) ];
			return Math.hypot( p[ 0 ] - q[ 0 ], p[ 1 ] - q[ 1 ], p[ 2 ] - q[ 2 ] );

		};
		const record = ( { world, start, points, groundAt, speed = 30, lift = 0.6, every = 0, moved = true, hop = 0, packStart = start } ) => {

			const globe = { earth: new Group(), ellipsoid: new Ellipsoid( WORLDS[ world ].radius, WORLDS[ world ].radius, WORLDS[ world ].radius ) };
			const setGroup = matrix => {

				matrix.decompose( globe.earth.position, globe.earth.quaternion, globe.earth.scale );
				globe.earth.updateMatrixWorld( true );

			};
			setGroup( groupAt( world, start.lat, start.lon, groundAt( start.lat, start.lon ) ) );
			let origin = [ start.lat, start.lon ];
			const recorder = createRecorder();
			const pivot = new Object3D();
			const place = ( lat, lon, t ) => {

				pivot.position.set( ...pointOn( world, lat, lon, groundAt( lat, lon ) + lift + hop * Math.abs( Math.sin( t / 3 ) ) ) ).applyMatrix4( globe.earth.matrixWorld );
				pivot.updateMatrixWorld( true );

			};
			const path = [ [ start.lat, start.lon ], ...points ];
			const dt = 1 / 30;
			let ms = 0;
			let recentres = 0;
			const passes = [];
			place( start.lat, start.lon, 0 );
			recorder.start( pivot );
			for ( let leg = 1; leg < path.length; leg ++ ) {

				const [ a, b ] = [ path[ leg - 1 ], path[ leg ] ];
				const steps = Math.ceil( metres( world, a, b ) / speed / dt );
				for ( let k = 1; k <= steps; k ++ ) {

					ms += dt * 1000;
					const [ lat, lon ] = [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * k / steps, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * k / steps ];
					// main.js's recentre: the scene moved to the car before this frame's drive, by M.
					if ( every && metres( world, origin, [ lat, lon ] ) > every ) {

						const was = globe.earth.matrixWorld.clone();
						setGroup( groupAt( world, lat, lon, groundAt( lat, lon ) ) );
						if ( moved ) recorder.transform( globe.earth.matrixWorld.clone().multiply( was.invert() ) );
						origin = [ lat, lon ];
						recentres ++;

					}

					place( lat, lon, ms / 1000 );
					if ( k < steps ) recorder.frame( ms, pivot );

				}

				passes.push( [ leg - 1, Math.round( ms ) ] );
				if ( leg === path.length - 1 ) recorder.finish( Math.round( ms ), pivot );
				else recorder.frame( ms, pivot );

			}

			return { ghost: recorder.pack( globe, packStart, world ), ms: passes.at( - 1 )[ 1 ], passes, recentres };

		};
		const routeOf = ( world, start, legs, radius = 40 ) => {

			let at = [ start.lat, start.lon ];
			return { start, radius, points: legs.map( ( [ bearing, length ] ) => at = destination( world, ...at, bearing, length ) ) };

		};
		// Rheasilvia's floor 45 km under Vesta's sphere; 40° N on Vesta, where the level leans 12° off
		// the radial, 12 km over it; Ceres at 30° S.
		const deep = ( lat, lon ) => - 45000 + 300 * Math.sin( lat * 7 ) + 200 * Math.cos( lon * 5 );
		const rolling = ( lat, lon ) => 12000 + 800 * Math.sin( lat * 3 ) * Math.cos( lon * 2 );
		const gates = [ [ 10, 600 ], [ 40, 800 ], [ 80, 700 ], [ 120, 900 ] ];
		const cases = [
			{ name: 'Vesta, Rheasilvia, no recentre', world: 'vesta', start: { lat: - 70, lon: - 60 }, groundAt: deep, legs: gates, every: 0 },
			{ name: 'Vesta, Rheasilvia', world: 'vesta', start: { lat: - 70, lon: - 60 }, groundAt: deep, legs: gates, every: 1000 },
			{ name: 'Vesta, 40° N, a landmark 8.5 km off', world: 'vesta', start: { lat: 40, lon: 30 }, groundAt: rolling, legs: [ [ 200, 8500 ] ], every: 1000 },
			{ name: 'Vesta, 40° N, hopping up to 25 m', world: 'vesta', start: { lat: 40, lon: 30 }, groundAt: rolling, legs: gates.slice( 0, 3 ), every: 1000, hop: 25 },
			{ name: 'Ceres, 30° S', world: 'ceres', start: { lat: - 30, lon: 100 }, groundAt: ( lat, lon ) => - 3000 + 400 * Math.sin( lon * 9 ), legs: [ [ 300, 1200 ], [ 340, 1500 ], [ 20, 1400 ] ], every: 1500 },
			{ name: 'the Moon, as before', world: 'moon', start: { lat: 12, lon: 18 }, groundAt: ( lat ) => - 1500 + 200 * Math.sin( lat * 50 ), legs: gates.slice( 0, 2 ), every: 0 },
		];
		for ( const c of cases ) {

			const route = routeOf( c.world, c.start, c.legs );
			const run = record( { ...c, points: route.points } );
			assert.equal( ghostFault( { world: c.world, route }, run.ms, run.passes, run.ghost ), '', c.name );
			if ( c.every ) assert.ok( run.recentres >= 2, `${ c.name }: ${ run.recentres } recentres` );
			if ( ! c.every ) continue;
			// Its samples left where the scene was: off its start (and everything after).
			const stale = record( { ...c, points: route.points, moved: false } );
			assert.notEqual( ghostFault( { world: c.world, route }, stale.ms, stale.passes, stale.ghost ), '', `${ c.name }, not moved` );

		}

		// Not taken off its gates or its start: a gate 60 m off the path (radius 40) is a 'pass' fault, one
		// 38 m off passed; a run from 150 m off the pin a 'start' one, from 80 m taken.
		const c = cases[ 2 ];
		const route = routeOf( c.world, c.start, gates.slice( 0, 3 ) );
		const run = record( { ...c, points: route.points } );
		const shifted = by => ( { ...route, points: route.points.map( ( point, i ) => i === 1 ? destination( c.world, ...point, 90, by ) : point ) } );
		assert.equal( ghostFault( { world: c.world, route: shifted( 60 ) }, run.ms, run.passes, run.ghost ), 'pass' );
		assert.equal( ghostFault( { world: c.world, route: shifted( 38 ) }, run.ms, run.passes, run.ghost ), '' );
		for ( const [ off, fault ] of [ [ 150, 'start' ], [ 80, '' ] ] ) {

			const [ lat, lon ] = destination( c.world, c.start.lat, c.start.lon, 0, off );
			const from = record( { ...c, start: { lat, lon }, packStart: c.start, points: route.points } );
			assert.equal( ghostFault( { world: c.world, route }, from.ms, from.passes, from.ghost ), fault, `${ off } m off the pin` );

		}

	} );

	test( 'packed and unpacked as it was, a sample every GHOST_EVERY ms, half as often (and so on) past GHOST_SAMPLES; anything that isn\'t one refused', () => {

		assert.deepEqual( [ everyFor( 60000 ), countFor( 60000 ) ], [ 100, 602 ] );
		assert.deepEqual( [ everyFor( 5 * 60000 ), countFor( 5 * 60000 ) ], [ 100, 3002 ] );
		// Past GHOST_SAMPLES samples at 10 a second: every 200 ms, then 400.
		assert.equal( everyFor( ( GHOST_SAMPLES - 1 ) * GHOST_EVERY ), GHOST_EVERY );
		assert.equal( everyFor( GHOST_SAMPLES * GHOST_EVERY ), 2 * GHOST_EVERY );
		assert.deepEqual( [ everyFor( MAX_RUN ), countFor( MAX_RUN ) ], [ 3200, 2252 ] );
		for ( const ms of [ 500, 60000, GHOST_SAMPLES * GHOST_EVERY + 1234, MAX_RUN ] ) assert.ok( countFor( ms ) <= GHOST_SAMPLES + 1 && Math.floor( ms / everyFor( ms ) / 2 ) + 1 <= GHOST_SAMPLES, String( ms ) );
		const run = fairRun( sprint, 9000 );
		const text = fairGhost( sprint, run.ms, run.passes );
		const ghost = readGhost( text );
		assert.deepEqual( [ ghost.every, ghost.count ], [ 100, countFor( run.ms ) ] );
		// Every number back as it was, the angles too (packed as changes, the short way round).
		const bytes = new Uint8Array( GHOST_BYTES );
		const again = readGhost( ghostText( bytes, packGhost( ghost, bytes ) ) );
		for ( const key of [ 'east', 'north', 'up', 'yaw', 'pitch', 'roll' ] ) assert.deepEqual( [ ...again[ key ] ], [ ...ghost[ key ] ], key );
		const turned = { ...ghost, yaw: ghost.yaw.map( ( _, i ) => ( i * 300 ) % TURN ), roll: ghost.roll.map( ( _, i ) => i % 2 ? TURN - 1 : 0 ) };
		const back = readGhost( ghostText( bytes, packGhost( turned, bytes ) ) );
		assert.deepEqual( [ ...back.yaw ], [ ...turned.yaw ] );
		assert.deepEqual( [ ...back.roll ], [ ...turned.roll ] );
		// Too little room: not packed.
		assert.equal( packGhost( ghost, new Uint8Array( 100 ) ), - 1 );
		// Not one: not base64url, too long, another version, cut short, a byte too many, a count past
		// the most, a number too big for any sample, a place 60 km off or 30 km up. Each of the last
		// four whole and well made but for that one thing (as packGhost packs it: the interval 100,
		// two samples), so it's that the check is for that turns it away, and nothing before it: the
		// count is what keeps a post from having the Worker make arrays of hundreds of millions.
		const raw = Buffer.from( text, 'base64url' );
		const as = buffer => Buffer.from( buffer ).toString( 'base64url' );
		const still = ( count, set = () => {} ) => {

			const ghost = { every: GHOST_EVERY, count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
			set( ghost );
			const bytes = new Uint8Array( GHOST_BYTES );
			return Buffer.from( bytes.subarray( 0, packGhost( ghost, bytes ) ) );

		};
		assert.ok( readGhost( as( still( 2 ) ) ) && readGhost( as( still( GHOST_SAMPLES + 1 ) ) ) && readGhost( as( still( 2, g => g.east[ 0 ] = 60000 * 100 ) ) ) && readGhost( as( still( 2, g => g.up[ 1 ] = - 60000 * 100 ) ) ) );
		// (Up to 60 km up or down: a run on Olympus Mons is 20 km and more above the start's frame's
		// height 0, and Vesta's ground is from 50.7 km under its sphere to 30.3 km over it, which a start
		// on the level spheroid's frame can be most of either way.)
		assert.ok( readGhost( as( still( 2, g => g.up[ 1 ] = 22000 * 100 ) ) ) && readGhost( as( still( 2, g => g.up[ 1 ] = 60000 * 100 ) ) ) && readGhost( as( still( 2, g => g.up[ 1 ] = - 45000 * 100 ) ) ) );
		// (Sample 0's east as five bytes, a number four would hold: 0 written long.)
		const long = still( 2 );
		assert.deepEqual( [ ...long.subarray( 0, 4 ) ], [ 1, 0xc8, 0x01, 4 ] );
		for ( const [ name, bad ] of Object.entries( {
			'not base64url': `${ text.slice( 0, - 1 ) }+`, 'too long': 'A'.repeat( GHOST_TEXT + 4 ), empty: '', 'not text': 42,
			'another version': as( Buffer.concat( [ Buffer.from( [ 2 ] ), raw.subarray( 1 ) ] ) ),
			'cut short': as( raw.subarray( 0, raw.length - 3 ) ),
			'a byte too many': as( Buffer.concat( [ raw, Buffer.from( [ 0 ] ) ] ) ),
			'a count past the most': as( still( GHOST_SAMPLES + 2 ) ),
			'a number too big': as( Buffer.concat( [ long.subarray( 0, 4 ), Buffer.from( [ 0x80, 0x80, 0x80, 0x80, 0x00 ] ), long.subarray( 5 ) ] ) ),
			'a place 60 km off': as( still( 2, g => g.east[ 0 ] = 60000 * 100 + 1 ) ),
			'a place 60 km down': as( still( 2, g => g.up[ 1 ] = - 60000 * 100 - 1 ) ),
			'a place 60 km up': as( still( 2, g => g.up[ 1 ] = 60000 * 100 + 1 ) ),
		} ) ) assert.equal( readGhost( bad ), null, name );

	} );

	test( 'what a ghost must agree with for its time to be taken (ghostFault): from the start, through each point at its pass time, as long as the time, never faster between two samples than the game goes, R\'s jumps and no more', () => {

		const run = fairRun( sprint, 2000 );
		const fault = ( text, ms = run.ms, passes = run.passes, challenge = sprint ) => ghostFault( challenge, ms, passes, text );
		assert.equal( fault( fairGhost( sprint, run.ms, run.passes ) ), '' );
		const stars = fairRun( hunt, 3000, [ 3, 1, 0, 5, 2, 4, 9, 8, 7, 6 ] );
		assert.equal( fault( fairGhost( hunt, stars.ms, stars.passes ), stars.ms, stars.passes, hunt ), '' );
		// On Mars, in its sphere's frame: a fair drive to its landmark passes; the same samples read in
		// the Earth's frame (or the Moon's) miss the goal by kilometres.
		const landing = fairRun( drive, 3000 );
		const marsGhost = fairGhost( drive, landing.ms, landing.passes );
		assert.equal( fault( marsGhost, landing.ms, landing.passes, drive ), '' );
		assert.equal( fault( marsGhost, landing.ms, landing.passes, { ...drive, world: 'earth' } ), 'pass' );
		assert.equal( fault( marsGhost, landing.ms, landing.passes, { ...drive, world: 'moon' } ), 'pass' );
		// Not one, or sampled at another interval.
		assert.equal( fault( 'nonsense!' ), 'form' );
		assert.equal( fault( fairGhost( sprint, run.ms, run.passes, { alter: ghost => ghost.every = 200 } ) ), 'form' );
		// Packed denser than driving makes (GHOST_DENSITY bytes a sample on average): every sample
		// jittering half a metre each way and turning anywhere, within the speed rule and through every
		// gate, as a made-up run packed to take the most room of a challenge's ghosts would; a fair one
		// takes about six.
		const fair = fairGhost( sprint, run.ms, run.passes );
		const perSample = text => Math.floor( text.length * 3 / 4 ) / countFor( run.ms );
		const dense = fairGhost( sprint, run.ms, run.passes, { alter: ghost => {

			for ( let i = 1; i < ghost.count - 1; i ++ ) {

				const way = i % 2 ? 50 : - 50;
				ghost.east[ i ] += way;
				ghost.north[ i ] -= way;
				ghost.up[ i ] += way;
				ghost.yaw[ i ] = ( i * 397 ) % TURN;
				ghost.pitch[ i ] = ( i * 211 ) % TURN;
				ghost.roll[ i ] = ( i * 307 ) % TURN;

			}

		} } );
		assert.ok( perSample( fair ) < 7 && perSample( dense ) > GHOST_DENSITY, JSON.stringify( [ perSample( fair ), perSample( dense ) ] ) );
		assert.equal( fault( dense ), 'form' );
		// Not as long as the time: a sample short, or the time a second more than it.
		assert.equal( fault( fairGhost( sprint, run.ms, run.passes, { alter: ghost => {

			ghost.count --;
			for ( const key of [ 'east', 'north', 'up', 'yaw', 'pitch', 'roll' ] ) ghost[ key ] = ghost[ key ].subarray( 1 );

		} } ) ), 'time' );
		const longer = run.passes.map( ( [ i, at ], k ) => [ i, k === run.passes.length - 1 ? at + 1000 : at ] );
		assert.equal( fault( fairGhost( sprint, run.ms, run.passes ), run.ms + 1000, longer ), 'time' );
		// Its first sample (the car at GO) 150 m from the start.
		assert.equal( fault( fairGhost( sprint, run.ms, run.passes, { alter: ghost => ghost.north[ 0 ] = - 15000 } ) ), 'start' );
		// A point not passed at its pass time: the ghost 2 radii off to the side of the third gate there
		// (and either side of it); at a sample beside it, within PASS_SLACK past its radius, it's passed.
		const at = run.passes[ 2 ][ 1 ];
		const near = ( ghost, metres, from = - 1, to = 1 ) => {

			for ( let i = Math.floor( at / ghost.every ) + from; i <= Math.ceil( at / ghost.every ) + to; i ++ ) ghost.east[ i ] += metres * 100;

		};
		assert.equal( fault( fairGhost( sprint, run.ms, run.passes, { alter: ghost => near( ghost, sprint.route.radius * 2, - 6, 6 ) } ) ), 'speed' );
		const shifted = fairGhost( sprint, run.ms, run.passes, { alter: ghost => {

			// Moved over gradually, so it's no faster than the game: never near the gate.
			for ( let i = 0; i < ghost.count; i ++ ) ghost.east[ i ] += Math.round( Math.max( 0, 1 - Math.abs( sampleTime( i, ghost.count, ghost.every, run.ms ) - at ) / 3000 ) * sprint.route.radius * 2 * 100 );

		} } );
		assert.equal( fault( shifted ), 'pass' );
		assert.equal( fault( fairGhost( sprint, run.ms, run.passes, { inside: 1 + ( PASS_SLACK - 0.5 ) / sprint.route.radius } ) ), '' );
		// Faster between two samples than the game goes: standing at each gate for half of each leg and
		// covering it in the other half (its passes as fair as before)...
		const dash = fairGhost( sprint, run.ms, run.passes, { alter: ghost => {

			const east = Int32Array.from( ghost.east );
			const north = Int32Array.from( ghost.north );
			const marks = [ 0, ...run.passes.map( pass => pass[ 1 ] ) ];
			for ( let i = 0; i < ghost.count; i ++ ) {

				const t = sampleTime( i, ghost.count, ghost.every, run.ms );
				const k = Math.max( 1, marks.findIndex( m => m >= t ) );
				const [ a, b ] = [ marks[ k - 1 ], marks[ k ] ];
				const u = Math.max( 0, ( t - a ) / ( b - a ) * 2 - 1 );
				const from = Math.round( a / ghost.every );
				const to = b === run.ms ? ghost.count - 1 : Math.round( b / ghost.every );
				ghost.east[ i ] = Math.round( east[ from ] + ( east[ to ] - east[ from ] ) * u );
				ghost.north[ i ] = Math.round( north[ from ] + ( north[ to ] - north[ from ] ) * u );

			}

		} } );
		assert.equal( fault( dash ), 'speed' );
		// The game's own jumps, on a drive to a landmark 1 km straight north at 110 m/s (11 m a sample,
		// FASTEST's 11.9 in reach): R's few metres on (`hops`, at those seconds), each let off, four in a
		// run this long; R with no way on, or off the edge of the world, put back where it drove (`back`
		// s, at `at` s); and a jump forward of 20 m, which nothing in the game makes.
		const straight = ( { hops = [], hop = 4, back = 0, at = 3 } = {} ) => {

			const start = { lat: 48.8738, lon: 2.2962 };
			const goal = destination( 'earth', start.lat, start.lon, 0, 1000 );
			const challenge = { world: 'earth', kind: 'landmark', route: { start, points: [ goal.map( d => Math.round( d * 1e6 ) / 1e6 ) ], radius: 45, goal: 'Arc' } };
			const reach = localOf( 'earth', start, ...challenge.route.points[ 0 ] )[ 1 ];
			const v = 110;
			const ms = Math.ceil( ( ( reach - hops.length * hop ) / v + back ) * 1000 );
			const where = t => v * ( t - ( back && t >= at ? back : 0 ) ) + hops.filter( h => h <= t ).length * hop;
			const count = countFor( ms );
			const ghost = { every: everyFor( ms ), count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
			for ( let i = 0; i < count; i ++ ) ghost.north[ i ] = Math.round( where( sampleTime( i, count, ghost.every, ms ) / 1000 ) * 100 );
			const bytes = new Uint8Array( GHOST_BYTES );
			return ghostFault( challenge, ms, [ [ 0, ms ] ], ghostText( bytes, packGhost( ghost, bytes ) ) );

		};
		assert.equal( straight(), '' );
		assert.equal( straight( { hops: [ 2.05 ] } ), '' );
		assert.equal( straight( { hops: [ 1.05, 2.05, 3.05, 4.05 ] } ), '' );
		assert.equal( straight( { hops: [ 1.05, 2.05, 3.05, 4.05, 5.05 ] } ), 'speed' );
		assert.equal( straight( { hops: [ 2.05 ], hop: 20 } ), 'speed' );
		assert.equal( straight( { back: 1.5 } ), '' );
		assert.equal( straight( { back: 1.5, hops: [ 1.05, 2.05, 5.05 ] } ), '' );
		assert.equal( straight( { back: 1.5, hops: [ 1.05, 2.05, 5.05, 6.05 ] } ), 'speed' );

	} );

	test( 'a pass is checked at its pass time, give or take a sample, and within its radius and PASS_SLACK: a ghost that goes through a gate a second before it says it did, or passes PASS_SLACK and half a metre wide of it, is turned away', () => {

		// A sprint of one gate 500 m north of the start and a finish 1 km north, the car going straight
		// at 110 m/s, `wide` m east of the gate's middle (the finish's line), passing the gate when it's
		// level with it, said to at `late` ms after that.
		const start = { lat: 48.8738, lon: 2.2962 };
		const round = point => point.map( d => Math.round( d * 1e6 ) / 1e6 );
		const gate = round( destination( 'earth', start.lat, start.lon, 0, 500 ) );
		const goal = round( destination( 'earth', start.lat, start.lon, 0, 1000 ) );
		const challenge = { world: 'earth', kind: 'sprint', route: { start, points: [ gate, goal ], radius: 30 } };
		const [ gateEast, gateNorth ] = localOf( 'earth', start, ...gate );
		const [ goalEast, goalNorth ] = localOf( 'earth', start, ...goal );
		const v = 110;
		const by = ( { wide = 0, late = 0 } ) => {

			const x = gateEast + wide;
			const ms = Math.ceil( Math.hypot( goalNorth, goalEast - x ) / v * 1000 ) + 200;
			const count = countFor( ms );
			const ghost = { every: everyFor( ms ), count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
			for ( let i = 0; i < count; i ++ ) {

				// Up the line at x till 100 m past the gate, then over to the finish's middle, and waiting there.
				const along = Math.min( v * sampleTime( i, count, ghost.every, ms ) / 1000, goalNorth );
				ghost.east[ i ] = Math.round( ( x + ( goalEast - x ) * Math.max( 0, along - gateNorth - 100 ) / ( goalNorth - gateNorth - 100 ) ) * 100 );
				ghost.north[ i ] = Math.round( along * 100 );

			}

			const bytes = new Uint8Array( GHOST_BYTES );
			const level = Math.round( gateNorth / v * 1000 );
			return ghostFault( challenge, ms, [ [ 0, level + late ], [ 1, ms ] ], ghostText( bytes, packGhost( ghost, bytes ) ) );

		};
		assert.equal( by( {} ), '' );
		// Its pass said half a sample after it was level with the gate (55 m on): taken, by the sample
		// beside it; a second after (110 m on), or a second before, turned away: the ghost went
		// through the gate, but not when its pass says.
		assert.equal( by( { late: 50 } ), '' );
		assert.equal( by( { late: 1000 } ), 'pass' );
		assert.equal( by( { late: - 1000 } ), 'pass' );
		// Wide of the gate's middle: its radius and PASS_SLACK (3 m), less half a metre, taken; half a
		// metre more than that, not.
		assert.equal( PASS_SLACK, 3 );
		assert.equal( by( { wide: 30 + 3 - 0.5 } ), '' );
		assert.equal( by( { wide: 30 + 3 + 0.5 } ), 'pass' );

	} );

	test( 'up and down as across: no faster between two samples than the game goes but for its jumps (a fall stopped and put back, R onto ground metres higher); a jump back onto the path is to where it drove however long before (R after a flight of minutes puts the car back where it took off), never to where it didn\'t drive', () => {

		// A drive to a landmark `metres` straight north at `v` m/s, its height as `rise( t )` says, and
		// put back `back` s at `at` s (a fall stopped, R with no way on).
		const north = ( { metres = 1000, v = 110, rise = () => 0, back = 0, at = 0 } = {} ) => {

			const start = { lat: 48.8738, lon: 2.2962 };
			const goal = destination( 'earth', start.lat, start.lon, 0, metres );
			const challenge = { world: 'earth', kind: 'landmark', route: { start, points: [ goal.map( d => Math.round( d * 1e6 ) / 1e6 ) ], radius: 45, goal: 'Arc' } };
			const reach = localOf( 'earth', start, ...challenge.route.points[ 0 ] )[ 1 ];
			const ms = Math.ceil( ( reach / v + back ) * 1000 );
			const count = countFor( ms );
			const ghost = { every: everyFor( ms ), count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
			for ( let i = 0; i < count; i ++ ) {

				const t = sampleTime( i, count, ghost.every, ms ) / 1000;
				ghost.north[ i ] = Math.round( v * ( t - ( back && t >= at ? back : 0 ) ) * 100 );
				ghost.up[ i ] = Math.round( rise( t, i ) * 100 );

			}

			const bytes = new Uint8Array( GHOST_BYTES );
			return ghostFault( challenge, ms, [ [ 0, ms ] ], ghostText( bytes, packGhost( ghost, bytes ) ) );

		};
		assert.equal( north(), '' );
		// Falling as the Earth's gravity has it to 60 m/s (a fall from 200 m is about 63 at its end), and
		// on at that: taken.
		assert.equal( north( { rise: t => 300 - 4.905 * Math.min( t, 6.1 ) ** 2 - 60 * Math.max( 0, t - 6.1 ) } ), '' );
		// Falling 200 m (63 m/s at the end), stopped and put back up where it was: one of the jumps it's
		// let.
		assert.equal( north( { v: 50, rise: t => t < 2 || t > 8.39 ? 0 : - 4.905 * ( t - 2 ) ** 2 } ), '' );
		// Up and down 20 m from one sample to the next (nothing in the game does), every sample: not.
		assert.equal( north( { rise: ( t, i ) => i % 2 ? 20 : 0 } ), 'speed' );
		// A crawl of 1 km at 10 m/s, put back 30 s (to where it was half a minute before): taken; put
		// back 65 s and 90 s, as R does after a flight that long (it puts the car back where it last
		// drove on the ground, where it took off), taken too.
		assert.equal( north( { v: 10, back: 30, at: 50 } ), '' );
		assert.equal( north( { v: 10, back: 65, at: 80 } ), '' );
		assert.equal( north( { v: 10, back: 90, at: 95 } ), '' );

	} );

	test( 'R in the air after a flight of over a minute puts the car back where it took off, minutes back along its path: taken; a jump as far to where it never drove, refused', () => {

		// A landmark 8 km north (the longest a landmark's drive is): the car drives 300 m north at 30 m/s,
		// takes off and flies `flight` s north and up at 30 m/s, then R takes it back to where it took
		// off; it drives on to the goal. `aside` m east puts it back off its path instead.
		const fly = ( flight, aside = 0 ) => {

			const start = { lat: 46.5772, lon: 8.4152 };
			const goal = destination( 'earth', start.lat, start.lon, 0, 8000 ).map( d => Math.round( d * 1e6 ) / 1e6 );
			const challenge = { world: 'earth', kind: 'landmark', route: { start, points: [ goal ], radius: 45, goal: 'Furka' } };
			const reach = localOf( 'earth', start, ...goal )[ 1 ];
			const v = 30;
			const off = 10;
			const landed = off + flight;
			const ms = Math.ceil( ( landed + ( reach - off * v ) / v ) * 1000 );
			const count = countFor( ms );
			const ghost = { every: everyFor( ms ), count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
			for ( let i = 0; i < count; i ++ ) {

				const t = sampleTime( i, count, ghost.every, ms ) / 1000;
				const flying = t > off && t < landed;
				ghost.north[ i ] = Math.round( ( t <= off ? v * t : flying ? v * t : off * v + v * ( t - landed ) ) * 100 );
				ghost.east[ i ] = t >= landed ? aside * 100 : 0;
				ghost.up[ i ] = flying ? Math.round( Math.min( 120, ( t - off ) * 5 ) * 100 ) : 0;

			}

			const bytes = new Uint8Array( GHOST_BYTES );
			return ghostFault( challenge, ms, [ [ 0, ms ] ], ghostText( bytes, packGhost( ghost, bytes ) ) );

		};
		for ( const flight of [ 40, 59, 61, 66, 90, 200 ] ) assert.equal( fly( flight ), '', `${ flight } s` );
		assert.equal( fly( 66, 60 ), 'speed' );

	} );

	test( 'a ghost\'s bytes: a minute of a road\'s turns about 4 KB, five minutes about 20, a run of two hours (the longest taken) under GHOST_BYTES', t => {

		// A path along streets: 30 m/s with turns and braking, a bump now and then, the model bobbing.
		const drive = ms => {

			const count = countFor( ms );
			const every = everyFor( ms );
			const ghost = { every, count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
			let [ x, y, heading, speed ] = [ 0, 0, 0, 0 ];
			const random = randomFrom( new Uint8Array( 32 ).fill( 9 ) );
			for ( let i = 0; i < count; i ++ ) {

				const dt = ( sampleTime( i, count, every, ms ) - sampleTime( Math.max( 0, i - 1 ), count, every, ms ) ) / 1000;
				speed = Math.min( 40, Math.max( 5, speed + ( random() - 0.4 ) * 8 * dt ) );
				heading += Math.sin( i / 37 ) * 0.6 * dt + ( random() - 0.5 ) * 0.05;
				x += Math.sin( heading ) * speed * dt;
				y += Math.cos( heading ) * speed * dt;
				ghost.east[ i ] = Math.round( x * 100 );
				ghost.north[ i ] = Math.round( y * 100 );
				ghost.up[ i ] = Math.round( ( 2 + Math.sin( i / 11 ) * 3 + random() * 0.05 ) * 100 );
				ghost.yaw[ i ] = ( ( Math.round( heading / ( Math.PI * 2 ) * TURN ) % TURN ) + TURN ) % TURN;
				ghost.pitch[ i ] = ( Math.round( Math.sin( i / 11 ) * 4 ) + TURN ) % TURN;
				ghost.roll[ i ] = ( Math.round( ( random() - 0.5 ) * 3 ) + TURN ) % TURN;

			}

			const bytes = new Uint8Array( GHOST_BYTES );
			return packGhost( ghost, bytes );

		};
		const [ minute, five, longest ] = [ drive( 60000 ), drive( 5 * 60000 ), drive( MAX_RUN ) ];
		t.diagnostic( `a ghost's bytes: a minute ${ minute }, five minutes ${ five }, two hours ${ longest }` );
		// What checking one costs the Worker: a monthly sprint's 14 gates over about five minutes.
		const month = { world: 'earth', kind: 'sprint', route: makeRoute( { kind: 'sprint', size: 'month', world: 'earth', place: { name: 'Arc', lat: 48.8738, lon: 2.2962, heading: 0 } }, randomFrom( new Uint8Array( 32 ).fill( 23 ) ) ) };
		const run = fairRun( month, 18000 );
		const text = fairGhost( month, run.ms, run.passes );
		ghostFault( month, run.ms, run.passes, text );
		const from = performance.now();
		for ( let i = 0; i < 20; i ++ ) assert.equal( ghostFault( month, run.ms, run.passes, text ), '' );
		const each = ( performance.now() - from ) / 20;
		t.diagnostic( `checking a ${ Math.round( run.ms / 1000 ) } s ghost (${ text.length } characters): ${ each.toFixed( 2 ) } ms` );
		assert.ok( each < 10, String( each ) );
		assert.ok( minute > 2000 && minute < 6000, String( minute ) );
		assert.ok( five > 10000 && five < 30000, String( five ) );
		assert.ok( longest > 0 && longest < GHOST_BYTES, String( longest ) );

	} );

} );

describe( 'World Drive challenges', () => {

	let server;
	let keys;
	let googleKey;
	const addresses = [];
	const nextIp = () => {

		const ip = `198.20.${ Math.floor( addresses.length / 200 ) }.${ addresses.length % 200 + 1 }`;
		addresses.push( ip );
		return ip;

	};

	before( async () => {

		googleKey = await makeKey( 'drive-test-key-challenges' );
		keys = await serveKeys( [ googleKey.jwk ] );
		server = await startWorker( {
			port: PORT + 5,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
				TURNSTILE_VERIFY_URL: `${ upstreamBase }/siteverify`,
				TEST_CLOCK: 'header',
				DAILY_VISITS: '1000',
				PER_VISITOR_DAILY: '100',
				GOOGLE_CLIENT_ID: CLIENT_ID,
				GOOGLE_JWKS_URL: keys.url,
				// The owner's accounts: each test of the admin page's routes signs in as one of its own, as
				// ADMIN_LOOKS counts each account's asks.
				ADMIN_EMAILS: 'boss@example.com, chief@example.com, head@example.com, lead@example.com',
				// A visitor's times a day, held to fewer than challenges.js's 300 to see it reached.
				CHALLENGE_TIMES_PER_VISITOR_DAILY: '4',
				// The dailies too (gone by default since 2026-11-22: liveKinds), as these tests were written
				// with them, and they test the most periods at once.
				CHALLENGE_PERIODS: 'day,week,month',
			},
			// The towns busy places are named by, and the Moon's, Mars's, Vesta's and Ceres's heights their
			// routes are checked on, as the site has them.
			assets: {
				'places/towns.tsv': readFileSync( new URL( '../drive/public/places/towns.tsv', import.meta.url ) ),
				'moon/height.bin': readFileSync( MOON_HEIGHTS ),
				'mars/height.bin': readFileSync( MARS_HEIGHTS ),
				'vesta/height.bin': readFileSync( HEIGHTS_OF.vesta ),
				'ceres/height.bin': readFileSync( HEIGHTS_OF.ceres ),
				// The page itself, its link card's tags as the site has them (a link's page rewrites them).
				'index.html': readFileSync( new URL( '../drive/index.html', import.meta.url ) ),
			},
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();

	} );

	// A request as the page makes it: JSON, from the site itself.
	const send = ( method, path, body, { cookie, ip = nextIp(), time = CHALLENGE_DAY, headers = {} } = {} ) => call( server, path, {
		method,
		headers: { Origin: server.base, 'Content-Type': 'application/json', ...( cookie ? { Cookie: cookie } : {} ), ...headers },
		body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify( body ),
		ip,
		time,
	} );
	// The list, asked again (at most three times more, from another address) while it has fewer than
	// the fifteen: a period's first ask lays out only CHECKED_MOST checked routes (challenges.js), the
	// next ones the rest, three worlds' worth more at most.
	const list = async ( { time = CHALLENGE_DAY, id, ip = nextIp() } = {} ) => {

		let res = await call( server, `/api/challenges${ id ? `?id=${ id }` : '' }`, { ip, time } );
		for ( let k = 0; k < 3 && res.status === 200 && res.json.challenges.length < 3 * WORLD_IDS.length; k ++ ) res = await call( server, `/api/challenges${ id ? `?id=${ id }` : '' }`, { ip: nextIp(), time } );
		return res;

	};
	const board = ( challenge, { time = CHALLENGE_DAY, id, ip = nextIp() } = {} ) => call( server, `/api/challenges/board?challenge=${ challenge }${ id ? `&id=${ id }` : '' }`, { ip, time } );

	// A player with an address and a visit (`kind`: 'earth', 'moon' or 'owner') of their own, from
	// `time`: { id, secret, name, ip, visit, at, run } (run: an id for their runs, their own: a run's id
	// names one time on a board).
	async function player( name, { time = CHALLENGE_DAY, kind = 'earth' } = {} ) {

		const ip = nextIp();
		const visit = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, time, kind );
		const made = await send( 'POST', '/api/player', { name, visit }, { ip, time } );
		assert.equal( made.status, 201, made.text );
		return { ...made.json, ip, visit, at: time, run: `run${ String( addresses.length ).padStart( 13, '0' ) }` };

	}

	// `who`'s run of `challenge` ({ ms, passes }, fairRun's unless given), posted `after` ms into their
	// visit, from `ip` (theirs unless given), with its ghost (fairGhost's) and its id (the player's and
	// its time: the same run posted again has the same, another run another).
	function post( who, challenge, { run = fairRun( challenge ), after = 10 * MINUTE, visit = who.visit, vehicle = 'go-kart', body = {}, ip = who.ip } = {} ) {

		return send( 'POST', '/api/challenges/time', {
			id: who.id, secret: who.secret, visit, challenge: challenge.id, run: runOf( who, run ), ms: run.ms, passes: run.passes, vehicle,
			ghost: Array.isArray( run.passes ) ? fairGhost( challenge, run.ms, run.passes ) : 'x', ...body,
		}, { ip, time: who.at + after } );

	}

	// A run's id for `who`'s run of `ms`.
	const runOf = ( who, { ms } ) => `${ who.run }${ Number.isSafeInteger( ms ) ? ms : 0 }`;

	async function signIn( email ) {

		const res = await send( 'POST', '/api/session', { credential: await makeToken( googleKey, { email, sub: `sub-${ email }` } ) } );
		assert.equal( res.status, 200, res.text );
		return `__Host-wd_session=${ /^__Host-wd_session=([\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) )[ 1 ] }`;

	}

	let live;
	const earthDay = () => live.find( c => c.world === 'earth' && c.period === 'day' );
	const moonDay = () => live.find( c => c.world === 'moon' && c.period === 'day' );
	const marsDay = () => live.find( c => c.world === 'mars' && c.period === 'day' );

	test( 'the migration: the challenges\' tables, keyed as their asks read them, with nothing of an address', () => {

		const columns = table => server.d1( `PRAGMA table_info( ${ table } )` ).map( c => c.name );
		assert.deepEqual( columns( 'challenges' ), [ 'id', 'period', 'world', 'kind', 'place', 'region', 'route', 'source', 'starts_at', 'ends_at', 'drivers', 'created_at', 'replaced_at', 'final_at', 'ghost_bytes' ] );
		assert.deepEqual( columns( 'challenge_picks' ), [ 'period', 'world', 'kind', 'place', 'region', 'lat', 'lon', 'heading', 'created_at' ] );
		assert.deepEqual( columns( 'challenge_places' ), [ 'world', 'cell_row', 'cell_column', 'name', 'region', 'lat', 'lon', 'created_at' ] );
		assert.ok( columns( 'players' ).includes( 'last_time_at' ) );
		// Each visit's times taken (CHALLENGE_TIMES_PER_VISIT).
		assert.ok( columns( 'visits' ).includes( 'times' ) );
		const indexes = server.d1( 'SELECT name, sql FROM sqlite_master WHERE type = \'index\' AND tbl_name LIKE \'challenge%\'' );
		assert.match( indexes.find( i => i.name === 'challenges_live' ).sql, /UNIQUE INDEX challenges_live ON challenges \( period, world \) WHERE replaced_at IS NULL/ );
		assert.ok( indexes.some( i => i.name === 'challenge_times_board' ) );
		// A run's id names one time on a challenge (what part 2b's link to a run relies on).
		assert.match( indexes.find( i => i.name === 'challenge_times_run' ).sql, /UNIQUE INDEX challenge_times_run ON challenge_times \( challenge_id, run_id \)/ );
		// 0007 on top: each time's handle (unique on its challenge: a link finds one row), each best's
		// ghost, keyed by its time (gone with it) and found by its run, and each challenge's count of its
		// ghosts' characters (challenges.ghost_bytes, above: 0 to start).
		assert.deepEqual( columns( 'challenge_times' ), [ 'challenge_id', 'player_id', 'ms', 'passes', 'vehicle', 'run_id', 'visit', 'owner', 'created_at', 'first_at', 'final_rank', 'handle', 'ghost' ] );
		assert.match( indexes.find( i => i.name === 'challenge_times_handle' ).sql, /UNIQUE INDEX challenge_times_handle ON challenge_times \( challenge_id, handle \)/ );
		// Each time's ghost (0 none kept, 1 kept, 2 kept and one to race), and the times with one to
		// race in an index of their own (the list's race: one row, however far down the board).
		assert.match( indexes.find( i => i.name === 'challenge_times_raced' ).sql, /INDEX challenge_times_raced ON challenge_times \( challenge_id, ms, created_at, player_id \) WHERE ghost = 2 AND owner = 0/ );
		assert.deepEqual( columns( 'challenge_ghosts' ), [ 'challenge_id', 'player_id', 'run_id', 'ms', 'passes', 'vehicle', 'look', 'ghost', 'bytes', 'least_ms', 'created_at' ] );
		assert.match( indexes.find( i => i.name === 'challenge_ghosts_run' ).sql, /UNIQUE INDEX challenge_ghosts_run ON challenge_ghosts \( challenge_id, run_id \)/ );
		// (And by their times, the slowest found to let go when a challenge's are full.)
		assert.match( indexes.find( i => i.name === 'challenge_ghosts_ms' ).sql, /INDEX challenge_ghosts_ms ON challenge_ghosts \( challenge_id, ms \)/ );
		const keys = server.d1( 'PRAGMA foreign_key_list( challenge_ghosts )' );
		assert.deepEqual( keys.map( k => [ k.table, k.from, k.to, k.on_delete ] ), [ [ 'challenge_times', 'challenge_id', 'challenge_id', 'CASCADE' ], [ 'challenge_times', 'player_id', 'player_id', 'CASCADE' ] ] );
		for ( const table of [ 'challenges', 'challenge_times', 'challenge_picks', 'challenge_places', 'challenge_ghosts' ] ) assert.ok( ! columns( table ).some( name => /ip|address|email|account/.test( name ) ), table );

	} );

	test( 'fifteen live: the day\'s, the week\'s and the month\'s on each of the five worlds, fixed in D1 as they\'re first asked for (no more than three checked on their ground an ask, the rest by the next ones, more said till then), the same on every ask and as another instance works them out', async () => {

		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM challenges' )[ 0 ].n, 0 );
		// The first ask: a world at a time, each world's the longest first, three checked on their
		// ground at most (the Moon's month, week and day; Mars's month the fourth, and so it and every
		// checked one after it left), the Earth's all three (not checked: they cost next to nothing):
		// those fixed so far, the Moon's three together, and nothing kept as live. Each ask after fixes
		// the next world's three (Mars's, then Vesta's, then Ceres's), saying there's more till the last.
		const keys = world => [ `${ world } day:2026-11-16`, `${ world } week:2026-11-16`, `${ world } month:2026-11` ];
		const asks = [];
		for ( const [ k, worlds ] of [ [ 'earth', 'moon' ], [ 'earth', 'moon', 'mars' ], [ 'earth', 'moon', 'mars', 'vesta' ], [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ] ].entries() ) {

			const res = await call( server, '/api/challenges', { ip: nextIp(), time: CHALLENGE_DAY + k * MINUTE } );
			assert.equal( res.status, 200, res.text );
			assert.deepEqual( res.json.challenges.map( c => `${ c.world } ${ c.key }` ), worlds.flatMap( keys ), `ask ${ k + 1 }` );
			assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM challenges' )[ 0 ].n, 3 * worlds.length );
			if ( worlds.length < 5 ) assert.equal( res.json.more, true, `ask ${ k + 1 }` );
			asks.push( res );

		}

		const [ first, res ] = [ asks[ 0 ], asks.at( - 1 ) ];
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		live = res.json.challenges;
		assert.equal( res.json.now, CHALLENGE_DAY + 3 * MINUTE );
		assert.equal( 'more' in res.json, false );
		assert.equal( live.length, 15 );
		assert.deepEqual( first.json.challenges.map( c => c.id ), live.filter( c => first.json.challenges.some( f => f.id === c.id ) ).map( c => c.id ) );
		const rows = server.d1( 'SELECT id, period, world, kind, place, route, source, starts_at, ends_at FROM challenges ORDER BY id' );
		assert.equal( rows.length, 15 );
		const featured = { earth: [ ...SPOTS.map( s => s.name ), 'Eiffel Tower', 'Colosseum', 'Piccadilly Circus', 'Hollywood Boulevard', 'Copacabana' ], moon: MOON_PLACES.map( p => p.name ), mars: MARS_PLACES.map( p => p.name ), vesta: VESTA_PLACES.map( p => p.name ), ceres: CERES_PLACES.map( p => p.name ) };
		for ( const c of live ) {

			const row = rows.find( r => r.id === c.id );
			assert.deepEqual( JSON.parse( row.route ), c.route );
			assert.equal( row.source, 'rotation' );
			assert.ok( featured[ c.world ].includes( c.place ), c.place );
			assert.ok( KINDS.includes( c.kind ) );
			const period = parsePeriod( c.key );
			assert.equal( c.startsAt, period.starts );
			assert.equal( c.endsAt, period.ends );
			assert.equal( c.route.points.length, { sprint: SHAPES[ c.world ][ c.period ].sprint.gates, collect: SHAPES[ c.world ][ c.period ].collect.items, landmark: 1, hoops: SHAPES[ c.world ][ c.period ].hoops?.hoops }[ c.kind ] );
			assert.deepEqual( [ c.total, c.top, c.me ], [ 0, [], null ] );
			// As this process, another instance with the same secret, works it out: the place, the kind and
			// the route, the Moon's and Mars's checked on their heights too (each from its own file).
			const env = { TURNSTILE_SECRET: PASS_SECRET, ASSETS: heightsAssets() };
			const pick = await rotationPick( env, period, c.world, [] );
			assert.equal( pick.place.name, c.place );
			assert.equal( pick.kind, c.kind );
			const made = await challengeFor( env, period, c.world, pick, CHALLENGE_DAY );
			assert.deepEqual( JSON.parse( made.route ), c.route );
			// (A hoop run's hoops are flown over, and one on a slope is lifted clear of it by the page:
			// on the roughest ground, a rim or a pole, the fewest steep of the tries may be one or two.)
			if ( c.world === 'moon' ) assert.ok( movableFaults( c.route ) <= ( c.kind === 'hoops' ? 2 : 0 ), c.place );
			if ( c.world === 'mars' ) assert.ok( movableFaults( c.route, 'mars' ) <= ( c.kind === 'hoops' ? 2 : 0 ), c.place );

		}

		// The three on a world are three places.
		for ( const world of WORLD_IDS ) assert.equal( new Set( live.filter( c => c.world === world ).map( c => c.place ) ).size, 3 );
		// Asked again, later in the period, from anywhere: the same, nothing more fixed.
		const again = await list( { time: CHALLENGE_DAY + 8 * HOUR } );
		assert.deepEqual( again.json.challenges.map( c => [ c.id, c.place, c.kind ] ), live.map( c => [ c.id, c.place, c.kind ] ) );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM challenges' )[ 0 ].n, 15 );

	} );

	test( 'a live challenge stays as it was fixed, whatever the rotation would pick now', async () => {

		// What the rotation would now say is changed in D1 by hand (as a later version of the rotation, or
		// of the places, would): the live one is the one fixed.
		server.d1( `UPDATE challenges SET place = 'Fixed Place' WHERE id = ${ earthDay().id }` );
		const res = await list( { time: CHALLENGE_DAY + 2 * HOUR } );
		assert.equal( res.json.challenges.find( c => c.id === earthDay().id ).place, 'Fixed Place' );
		server.d1( `UPDATE challenges SET place = '${ earthDay().place.replace( /'/g, '\'\'' ) }' WHERE id = ${ earthDay().id }` );

	} );

	test( 'a time: taken with the visit\'s token from the leaderboard\'s player, on the board with their name and level; only a better one replaces it', async () => {

		const ann = await player( 'Ann Racer' );
		const slow = fairRun( earthDay(), 20000 );
		let res = await post( ann, earthDay(), { run: slow } );
		assert.equal( res.status, 200, res.text );
		// (With the best's run and its handle: what a link to it names it by, worked out here as the Worker
		// does with its secret.)
		const handle = await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, earthDay().id, ann.id );
		assert.deepEqual( { ...res.json, top: res.json.top.map( r => [ r.rank, r.name, r.ms ] ) }, { ms: slow.ms, rank: 1, total: 1, isNewBest: true, top: [ [ 1, 'Ann Racer', slow.ms ] ], run: runOf( ann, slow ), handle } );
		assert.equal( res.json.top !== undefined, true );
		// A slower one: nothing changes.
		res = await post( ann, earthDay(), { run: fairRun( earthDay(), 30000 ), after: 20 * MINUTE } );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( [ res.json.ms, res.json.isNewBest, res.json.total ], [ slow.ms, false, 1 ] );
		// A quicker one: the best.
		const quick = fairRun( earthDay(), 5000 );
		res = await post( ann, earthDay(), { run: quick, after: 30 * MINUTE } );
		assert.deepEqual( [ res.json.ms, res.json.isNewBest, res.json.total ], [ quick.ms, true, 1 ] );
		const rows = server.d1( `SELECT * FROM challenge_times WHERE challenge_id = ${ earthDay().id }` );
		assert.equal( rows.length, 1 );
		assert.deepEqual( [ rows[ 0 ].ms, JSON.parse( rows[ 0 ].passes ), rows[ 0 ].vehicle, rows[ 0 ].run_id, rows[ 0 ].owner, rows[ 0 ].final_rank ], [ quick.ms, quick.passes, 'go-kart', runOf( ann, quick ), 0, null ] );
		assert.equal( rows[ 0 ].first_at, CHALLENGE_DAY + 10 * MINUTE );
		assert.equal( rows[ 0 ].created_at, CHALLENGE_DAY + 30 * MINUTE );
		assert.equal( rows[ 0 ].visit, ann.visit.split( '.' )[ 1 ] );
		// Her first time on a challenge is her first challenge finished (achievements.js), written as the
		// time is, and only once however many times she posts.
		assert.deepEqual( server.d1( `SELECT achievement FROM achievements WHERE player_id = '${ ann.id }'` ).map( r => r.achievement ), [ 'challenges-1' ] );
		// A construction ride she hasn't earned is turned away (its ghost and its row would show it); the
		// time she has stays as it was.
		res = await post( ann, earthDay(), { run: fairRun( earthDay(), 4000 ), after: 31 * MINUTE, vehicle: 'hydrovac-truck' } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'ride' ] );
		assert.equal( server.d1( `SELECT ms FROM challenge_times WHERE challenge_id = ${ earthDay().id }` )[ 0 ].ms, quick.ms );
		// Others: the board in order, each with the leaderboard's level and title, and their own row.
		const bea = await player( 'Bea Fast' );
		res = await post( bea, earthDay(), { run: fairRun( earthDay(), 1000 ), vehicle: 'hypercar' } );
		assert.deepEqual( [ res.json.rank, res.json.total ], [ 1, 2 ] );
		const cy = await player( 'Cy Slow' );
		res = await post( cy, earthDay(), { run: fairRun( earthDay(), 40000 ) } );
		assert.deepEqual( [ res.json.rank, res.json.total, res.json.isNewBest ], [ 3, 3, true ] );
		const shown = await board( earthDay().id, { id: cy.id, time: CHALLENGE_DAY + HOUR } );
		assert.equal( shown.status, 200, shown.text );
		assert.deepEqual( shown.json.rows.map( r => [ r.rank, r.name, r.vehicle, r.level, r.title, r.date ] ), [
			[ 1, 'Bea Fast', 'hypercar', 1, 'rookie', '2026-11-16' ], [ 2, 'Ann Racer', 'go-kart', 1, 'rookie', '2026-11-16' ], [ 3, 'Cy Slow', 'go-kart', 1, 'rookie', '2026-11-16' ],
		] );
		assert.deepEqual( [ shown.json.total, shown.json.me.rank, shown.json.me.name ], [ 3, 3, 'Cy Slow' ] );
		assert.equal( shown.json.challenge.id, earthDay().id );
		// The list has the top three and your own.
		const listed = await list( { id: ann.id, time: CHALLENGE_DAY + HOUR } );
		const mine = listed.json.challenges.find( c => c.id === earthDay().id );
		assert.deepEqual( mine.top.map( r => r.name ), [ 'Bea Fast', 'Ann Racer', 'Cy Slow' ] );
		assert.deepEqual( [ mine.total, mine.me ], [ 3, { ms: quick.ms, rank: 2, run: runOf( ann, quick ), handle: await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, earthDay().id, ann.id ) } ] );
		// A Moon challenge's time with the same Earth visit: taken too. (Bea's: Ann's day, 4 times here,
		// is used up, the time refused for its ride above taking one as any time does.)
		res = await post( bea, moonDay(), { run: fairRun( moonDay(), 2000 ), after: 40 * MINUTE } );
		assert.equal( res.status, 200, res.text );
		res = await post( ann, moonDay(), { run: fairRun( moonDay(), 2000 ), after: 41 * MINUTE } );
		assert.deepEqual( [ res.status, res.json.error ], [ 429, 'That\'s all for today. Try again tomorrow' ] );

	} );

	test( 'a time refused for its ride costs what any other does: after the time gap and the visitor\'s day, never a loop of lookups', async () => {

		const dot = await player( 'Dot Locked' );
		// Twelve at once in a locked construction ride: the first is looked at (and refused for its
		// ride), the rest turned away at the gap (and then CHALLENGE_MISSES) before anything more is
		// read, as twelve in the go-kart would be.
		const answers = [];
		for ( let i = 0; i < 12; i ++ ) answers.push( await post( dot, earthDay(), { run: fairRun( earthDay(), 4000 ), after: 10 * MINUTE + i * 100, vehicle: 'hydrovac-truck' } ) );
		assert.deepEqual( answers.map( res => res.status ), [ 403, ...Array( 11 ).fill( 429 ) ] );
		assert.equal( answers[ 0 ].json.reason, 'ride' );
		assert.ok( answers.slice( 1 ).every( res => res.json.reason !== 'ride' ) );
		assert.deepEqual( server.d1( `SELECT ms FROM challenge_times WHERE player_id = '${ dot.id }'` ), [] );
		// The ride is checked after the gap and the visitor's daily turn (challenges.js's postTime).
		const source = readFileSync( new URL( '../worker/drive/challenges.js', import.meta.url ), 'utf8' );
		const postTime = source.slice( source.indexOf( 'export async function postTime' ) );
		const ride = postTime.indexOf( 'checkRide(' );
		assert.ok( ride > postTime.indexOf( 'last_time_at <= ?3' ) && ride > postTime.indexOf( 'takeTurn(' ) );

	} );

	test( 'a time comes with its run\'s ghost, checked with it and kept with the best (its look as a room takes it): fetched by its run, then from the cache; a slower run changes nothing; a new best with the best\'s own run id is refused; a new best\'s replaces it, the old run\'s gone', async () => {

		const c = moonDay();
		const nia = await player( 'Nia Ghost' );
		const slow = fairRun( c, 20000 );
		let res = await post( nia, c, { run: slow, body: { look: { colour: 'lava', glow: 'aqua', made: 'up' } } } );
		assert.equal( res.status, 200, res.text );
		const handle = await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, c.id, nia.id );
		assert.deepEqual( [ res.json.run, res.json.handle ], [ runOf( nia, slow ), handle ] );
		const kept = () => server.d1( `SELECT run_id, ms, passes, vehicle, look, ghost, created_at FROM challenge_ghosts WHERE challenge_id = ${ c.id } AND player_id = '${ nia.id }'` );
		let [ ghost ] = kept();
		assert.deepEqual( { ...ghost, passes: JSON.parse( ghost.passes ), look: JSON.parse( ghost.look ) }, {
			run_id: runOf( nia, slow ), ms: slow.ms, passes: slow.passes, vehicle: 'go-kart', look: { colour: 'lava', glow: 'aqua' }, ghost: fairGhost( c, slow.ms, slow.passes ), created_at: nia.at + 10 * MINUTE,
		} );
		assert.equal( server.d1( `SELECT handle FROM challenge_times WHERE challenge_id = ${ c.id } AND player_id = '${ nia.id }'` )[ 0 ].handle, handle );
		// A slower one: nothing changes.
		res = await post( nia, c, { run: fairRun( c, 30000 ), after: 20 * MINUTE } );
		assert.deepEqual( [ res.status, res.json.isNewBest, res.json.run ], [ 200, false, runOf( nia, slow ) ] );
		assert.deepEqual( kept(), [ ghost ] );
		// A new best under the best's own run id: refused, nothing written (a run's ghost is kept by its
		// id, and never changes).
		const quick = fairRun( c, 10000 );
		res = await post( nia, c, { run: quick, after: 30 * MINUTE, body: { run: runOf( nia, slow ) } } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 400, 'run' ] );
		assert.deepEqual( kept(), [ ghost ] );
		// A new best: its ghost in the old one's place, one row; the old run's ghost gone.
		res = await post( nia, c, { run: quick, after: 40 * MINUTE, body: { look: { colour: 'lava', glow: 'aqua' } } } );
		assert.deepEqual( [ res.status, res.json.isNewBest, res.json.run, res.json.handle ], [ 200, true, runOf( nia, quick ), handle ] );
		[ ghost ] = kept();
		assert.equal( kept().length, 1 );
		assert.deepEqual( [ ghost.run_id, ghost.ms, ghost.ghost ], [ runOf( nia, quick ), quick.ms, fairGhost( c, quick.ms, quick.passes ) ] );
		const ghostOf = ( run, ip = nextIp() ) => call( server, `/api/challenges/ghost?challenge=${ c.id }&run=${ run }`, { ip, time: CHALLENGE_DAY + HOUR } );
		res = await ghostOf( runOf( nia, slow ) );
		assert.equal( res.status, 404, res.text );
		// Fetched by its run: as posted, with what it's drawn with and compared with; from the cache the
		// next time, from anywhere.
		res = await ghostOf( runOf( nia, quick ) );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( res.json, { run: runOf( nia, quick ), ms: quick.ms, passes: quick.passes, vehicle: 'go-kart', look: { colour: 'lava', glow: 'aqua' }, ghost: ghost.ghost } );
		assert.equal( res.headers.get( 'X-Board-Cache' ), 'miss' );
		const again = await ghostOf( runOf( nia, quick ) );
		assert.deepEqual( [ again.headers.get( 'X-Board-Cache' ), again.text ], [ 'hit', res.text ] );
		assert.equal( ( await call( server, `/api/challenges/ghost?challenge=${ c.id }&run=short`, { time: CHALLENGE_DAY + HOUR } ) ).status, 400 );
		assert.equal( ( await call( server, `/api/challenges/ghost?challenge=x&run=${ runOf( nia, quick ) }`, { time: CHALLENGE_DAY + HOUR } ) ).status, 400 );

	} );

	test( 'a time whose ghost doesn\'t agree with it is refused (400, the fault said), nothing of it written or counted: not one, too big, missing, faster between two samples than the game goes, not through a gate at its pass time, not as long as the time', async () => {

		const oli = await player( 'Oli Fake' );
		const c = earthDay();
		const run = fairRun( c, 9000 );
		const at = run.passes[ 1 ][ 1 ];
		const middle = Math.floor( at / 100 ) - 5;
		const cases = {
			'not one': { ghost: 'not a ghost!', fault: 'form' },
			'too big': { ghost: 'A'.repeat( GHOST_TEXT + 4 ) },
			'missing': { ghost: undefined },
			'faster between two samples than the game goes': { ghost: fairGhost( c, run.ms, run.passes, { alter: ghost => {

				for ( let i = middle; i < ghost.count; i ++ ) ghost.north[ i ] += 5000;

			} } ), fault: 'speed' },
			'not through a gate at its pass time': { ghost: fairGhost( c, run.ms, run.passes, { alter: ghost => {

				for ( let i = 0; i < ghost.count; i ++ ) ghost.east[ i ] += Math.round( Math.max( 0, 1 - Math.abs( sampleTime( i, ghost.count, ghost.every, run.ms ) - at ) / 3000 ) * c.route.radius * 2 * 100 );

			} } ), fault: 'pass' },
			'not as long as the time': { ghost: fairGhost( c, run.ms + 2000, run.passes ), fault: 'time' },
		};
		for ( const [ name, { ghost, fault } ] of Object.entries( cases ) ) {

			const res = await post( oli, c, { run, body: { ghost } } );
			assert.equal( res.status, 400, `${ name }: ${ res.text }` );
			if ( fault ) assert.deepEqual( [ res.json.reason, res.json.fault ], [ 'ghost', fault ], name );

		}

		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM challenge_times WHERE player_id = '${ oli.id }'` )[ 0 ].n, 0 );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM challenge_ghosts WHERE player_id = '${ oli.id }'` )[ 0 ].n, 0 );
		assert.equal( server.d1( `SELECT last_time_at FROM players WHERE id = '${ oli.id }'` )[ 0 ].last_time_at, 0 );
		assert.deepEqual( server.d1( `SELECT times FROM visits WHERE player_id = '${ oli.id }'` ).map( v => v.times ), [ 0 ] );
		// Its ghost as driven: taken.
		assert.equal( ( await post( oli, c, { run } ) ).status, 200 );

	} );

	test( 'a challenge keeps CHALLENGE_GHOST_BUDGET of ghosts at most (16 MB, counted as each is written and let go): past it a new best is taken without its ghost; a better one\'s replacing it gives its room back; finished, none and nothing counted', async () => {

		const c = moonDay();
		const budget = 16 * 1024 * 1024;
		const counted = () => server.d1( `SELECT ghost_bytes AS n, ( SELECT COALESCE( SUM( length( ghost ) ), 0 ) FROM challenge_ghosts WHERE challenge_id = ${ c.id } ) AS kept FROM challenges WHERE id = ${ c.id }` )[ 0 ];
		// Counted as kept so far (the other tests' ghosts on it).
		let was = counted();
		assert.equal( was.n, was.kept );
		const zed = await player( 'Zed Budget' );
		const slow = fairRun( c, 25000 );
		let res = await post( zed, c, { run: slow } );
		assert.equal( res.status, 200, res.text );
		const text = fairGhost( c, slow.ms, slow.passes );
		assert.deepEqual( counted(), { n: was.n + text.length, kept: was.kept + text.length } );
		// The count so near the budget (as a script posting the largest ghosts all day would leave it) that
		// even the room the old one's ghost gives back isn't enough: a new best goes on the board, its
		// ghost not kept, the old one's let go and its room given back.
		was = counted();
		server.d1( `UPDATE challenges SET ghost_bytes = ${ budget - 100 + text.length } WHERE id = ${ c.id }` );
		const quicker = fairRun( c, 22000 );
		res = await post( zed, c, { run: quicker, after: 20 * MINUTE } );
		assert.deepEqual( [ res.status, res.json.isNewBest, res.json.ms, res.json.run ], [ 200, true, quicker.ms, runOf( zed, quicker ) ] );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM challenge_ghosts WHERE challenge_id = ${ c.id } AND player_id = '${ zed.id }'` )[ 0 ].n, 0 );
		assert.equal( counted().n, budget - 100 );
		assert.equal( ( await call( server, `/api/challenges/ghost?challenge=${ c.id }&run=${ runOf( zed, quicker ) }`, { ip: nextIp(), time: CHALLENGE_DAY + HOUR } ) ).status, 404 );
		// Room again: the next new best's ghost kept, and counted.
		server.d1( `UPDATE challenges SET ghost_bytes = ${ was.n - text.length } WHERE id = ${ c.id }` );
		const quickest = fairRun( c, 19000 );
		res = await post( zed, c, { run: quickest, after: 30 * MINUTE } );
		assert.equal( res.status, 200, res.text );
		const kept = fairGhost( c, quickest.ms, quickest.passes );
		assert.equal( server.d1( `SELECT ghost FROM challenge_ghosts WHERE challenge_id = ${ c.id } AND player_id = '${ zed.id }'` )[ 0 ].ghost, kept );
		assert.deepEqual( counted(), { n: was.n - text.length + kept.length, kept: was.kept - text.length + kept.length } );

	} );

	test( 'a time\'s handle is made as its first is written and kept with it: what the list, the board and a post hand out is the one kept (a link shared once still names it after the Worker\'s secret is changed), a new best keeps it; a board hands out its leader\'s run alone', async () => {

		const c = earthDay();
		const una = await player( 'Una Handle' );
		const first = fairRun( c, 12000 );
		let res = await post( una, c, { run: first } );
		assert.equal( res.status, 200, res.text );
		assert.equal( res.json.handle, await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, c.id, una.id ) );
		// As if made under the secret the Worker had before: kept, and handed out as it is.
		server.d1( `UPDATE challenge_times SET handle = 'MadeBeforeSecret' WHERE challenge_id = ${ c.id } AND player_id = '${ una.id }'` );
		const mine = ( await list( { id: una.id, time: CHALLENGE_DAY + 30 * MINUTE } ) ).json.challenges.find( x => x.id === c.id ).me;
		assert.equal( mine.handle, 'MadeBeforeSecret' );
		assert.equal( ( await board( c.id, { id: una.id, time: CHALLENGE_DAY + 30 * MINUTE } ) ).json.me.handle, 'MadeBeforeSecret' );
		const better = fairRun( c, 11000 );
		res = await post( una, c, { run: better, after: 20 * MINUTE } );
		assert.deepEqual( [ res.status, res.json.isNewBest, res.json.handle ], [ 200, true, 'MadeBeforeSecret' ] );
		assert.equal( server.d1( `SELECT handle FROM challenge_times WHERE challenge_id = ${ c.id } AND player_id = '${ una.id }'` )[ 0 ].handle, 'MadeBeforeSecret' );
		// The link shared before still names the best, now the better one.
		res = await call( server, `/api/challenges/link?challenge=${ c.id }&vs=MadeBeforeSecret`, { ip: nextIp(), time: CHALLENGE_DAY + HOUR } );
		assert.deepEqual( [ res.status, res.json.vs.name, res.json.vs.ms, res.json.vs.run ], [ 200, 'Una Handle', better.ms, runOf( una, better ) ] );
		// A board's rows (and the list's tops) say one run, raced from its row, and no other's: the
		// quickest row with its ghost kept and a time no quicker than twice the least its route allows
		// (Bea Fast's on top, a second a gate slower than the crow's way at the game's top speed,
		// boosted, isn't; the next is).
		const shown = await board( c.id, { time: CHALLENGE_DAY + 2 * HOUR } );
		assert.ok( shown.json.rows.length >= 3, shown.text );
		const raced = server.d1( `SELECT t.run_id FROM challenge_times t JOIN challenge_ghosts g ON g.challenge_id = t.challenge_id AND g.player_id = t.player_id
			WHERE t.challenge_id = ${ c.id } AND t.owner = 0 AND g.ms >= 2 * g.least_ms ORDER BY t.ms, t.created_at, t.player_id LIMIT 1` )[ 0 ].run_id;
		assert.equal( shown.json.rows[ 0 ].name, 'Bea Fast' );
		assert.ok( shown.json.rows[ 1 ].run, shown.text );
		assert.deepEqual( shown.json.rows.map( row => row.run ).filter( Boolean ), [ raced ] );
		const tops = ( await list( { time: CHALLENGE_DAY + 2 * HOUR } ) ).json.challenges.find( x => x.id === c.id ).top;
		assert.deepEqual( tops.map( row => row.run ).filter( Boolean ), [ raced ], JSON.stringify( tops ) );

	} );

	test( 'a "challenge a friend" link names a time by its handle, the Worker\'s own (the same however often it\'s bettered, another for another challenge or secret, nothing of who): the link\'s answer has the name, time and run, from the cache after, a new best clearing it; the list and the board say your own; a handle naming nobody is none; the board\'s rows their runs, the leader\'s ghost to race', async () => {

		const c = earthDay();
		const pip = await player( 'Pip Link' );
		const first = fairRun( c, 7000 );
		let res = await post( pip, c, { run: first } );
		assert.equal( res.status, 200, res.text );
		const { handle } = res.json;
		assert.match( handle, HANDLE );
		assert.equal( handle, await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, c.id, pip.id ) );
		assert.notEqual( handle, await handleOf( { TURNSTILE_SECRET: FAIL_SECRET }, c.id, pip.id ) );
		assert.notEqual( handle, await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, moonDay().id, pip.id ) );
		assert.ok( ! handle.includes( pip.id.slice( 0, 6 ) ) );
		const link = ( vs, ip = nextIp(), time = CHALLENGE_DAY + HOUR ) => call( server, `/api/challenges/link?challenge=${ c.id }${ vs === null ? '' : `&vs=${ encodeURIComponent( vs ) }` }`, { ip, time } );
		res = await link( handle );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( [ res.json.challenge.id, res.json.challenge.place, res.json.challenge.finalAt, res.json.challenge.route ], [ c.id, c.place, null, c.route ] );
		assert.deepEqual( { ...res.json.vs, level: undefined, title: undefined }, { name: 'Pip Link', ms: first.ms, vehicle: 'go-kart', date: '2026-11-16', run: runOf( pip, first ), ghost: true, level: undefined, title: undefined } );
		assert.equal( res.json.vs.level, 1 );
		// Nothing of who but the name and time the board shows: not the player's id, nor their secret.
		assert.ok( ! res.text.includes( pip.id ) && ! res.text.includes( pip.secret ), res.text );
		assert.equal( res.headers.get( 'X-Board-Cache' ), 'miss' );
		assert.equal( ( await link( handle ) ).headers.get( 'X-Board-Cache' ), 'hit' );
		// Bettered: the same handle, its answer the new best at once (here: the cache cleared).
		const second = fairRun( c, 6000 );
		res = await post( pip, c, { run: second, after: 20 * MINUTE } );
		assert.deepEqual( [ res.status, res.json.handle ], [ 200, handle ] );
		res = await link( handle );
		assert.deepEqual( [ res.json.vs.ms, res.json.vs.run, res.headers.get( 'X-Board-Cache' ) ], [ second.ms, runOf( pip, second ), 'miss' ] );
		// Your own: the list's and the board's, with the run (its ghost to race) and the handle (to share).
		const mine = ( await list( { id: pip.id, time: CHALLENGE_DAY + 2 * HOUR } ) ).json.challenges.find( x => x.id === c.id ).me;
		assert.deepEqual( [ mine.ms, mine.run, mine.handle ], [ second.ms, runOf( pip, second ), handle ] );
		const shown = await board( c.id, { id: pip.id, time: CHALLENGE_DAY + 2 * HOUR } );
		assert.deepEqual( [ shown.json.me.handle, shown.json.me.run ], [ handle, runOf( pip, second ) ] );
		// A handle naming nobody (mistyped, or that player removed), or none, or one that can't be one:
		// the challenge, with no time.
		for ( const vs of [ 'AAAAAAAAAAAAAAAA', null, 'x<y>', 'A'.repeat( 40 ) ] ) {

			res = await link( vs );
			assert.deepEqual( [ res.status, res.json.challenge.id, res.json.vs ], [ 200, c.id, null ], String( vs ) );

		}

		assert.equal( ( await call( server, `/api/challenges/link?challenge=99999&vs=${ handle }`, { ip: nextIp(), time: CHALLENGE_DAY + HOUR } ) ).status, 404 );
		assert.equal( ( await call( server, `/api/challenges/link?challenge=one&vs=${ handle }`, { ip: nextIp(), time: CHALLENGE_DAY + HOUR } ) ).status, 400 );
		// The board's one row with its run: its ghost, to race.
		const leader = shown.json.rows.find( row => row.run );
		assert.match( leader.run, /^[\w-]{16,32}$/ );
		res = await call( server, `/api/challenges/ghost?challenge=${ c.id }&run=${ leader.run }`, { ip: nextIp(), time: CHALLENGE_DAY + 2 * HOUR } );
		assert.deepEqual( [ res.status, res.json.ms ], [ 200, leader.ms ] );
		assert.equal( readGhost( res.json.ghost ).count, countFor( leader.ms ) );

	} );

	test( 'a link\'s page, /c, has a preview card of its own for chat apps: the time to beat, the place and the period in its title and description (escaped), the link its address; the page as it is for anything else; its answer the link\'s, from the cache; and the Worker runs for no other page (the home page is a file, served free and never turned away)', async () => {

		const c = earthDay();
		const page = ( query, ip = nextIp(), path = '/c' ) => call( server, `${ path }${ query }`, { ip, time: CHALLENGE_DAY + 3 * HOUR, headers: { Accept: 'text/html' } } );
		const tag = ( html, attribute, name ) => html.match( new RegExp( `<meta ${ attribute }="${ name }" content="([^"]*)"` ) )?.[ 1 ] ?? null;
		const pip = server.d1( `SELECT p.id, t.ms FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE p.name = 'Pip Link' AND t.challenge_id = ${ c.id }` )[ 0 ];
		const handle = await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, c.id, pip.id );
		let res = await page( `?challenge=${ c.id }&vs=${ handle }` );
		assert.equal( res.status, 200 );
		assert.match( res.headers.get( 'Content-Type' ), /text\/html/ );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		const title = `Beat Pip Link&#39;s ${ formatTime( pip.ms ) } on today&#39;s ${ escapeHtml( c.kind === 'landmark' ? `drive to ${ c.route.goal }` : `${ c.place } ${ { sprint: 'sprint', collect: 'star hunt' }[ c.kind ] }` ) }`;
		assert.equal( tag( res.text, 'property', 'og:title' ), title );
		assert.equal( tag( res.text, 'name', 'twitter:title' ), title );
		const description = tag( res.text, 'property', 'og:description' );
		// (When it ends, not how long is left: a chat app shows a link's card as it first fetched it.)
		assert.match( description, /^A daily .+ in World Drive, on till the end of Monday 16 November \(UTC\)\. Drive it in your browser and race Pip Link&#39;s ghost\.$/ );
		assert.equal( tag( res.text, 'name', 'twitter:description' ), description );
		assert.equal( tag( res.text, 'property', 'og:url' ), `https://worlddrive.app/c?challenge=${ c.id }&amp;vs=${ handle }` );
		// The rest of the page as it is (its picture, its script).
		assert.equal( tag( res.text, 'property', 'og:image' ), 'https://worlddrive.app/og/world-drive.png' );
		assert.match( res.text, /<script type="module"/ );
		// Its answer is the link's, from the cache: a crawler costs a look at it.
		assert.equal( ( await call( server, `/api/challenges/link?challenge=${ c.id }&vs=${ handle }`, { ip: nextIp(), time: CHALLENGE_DAY + 3 * HOUR } ) ).headers.get( 'X-Board-Cache' ), 'hit' );
		// Escaped: a place named with markup (as the owner might type one) is text in its tags.
		const place = c.place.replace( /'/g, '\'\'' );
		server.d1( `UPDATE challenges SET place = 'Fish <b>"&amp;"</b> ''Chips''' WHERE id = ${ c.id }` );
		try {

			// (A handle naming nobody: the challenge's own card, asked for afresh.)
			res = await page( `?challenge=${ c.id }&vs=CCCCCCCCCCCCCCCC` );
			assert.equal( tag( res.text, 'property', 'og:title' ), 'World Drive: today&#39;s challenge at Fish &lt;b&gt;&quot;&amp;amp;&quot;&lt;/b&gt; &#39;Chips&#39;' );
			assert.ok( ! res.text.includes( '<b>"' ), 'markup in the page' );

		} finally {

			server.d1( `UPDATE challenges SET place = '${ place }' WHERE id = ${ c.id }` );

		}

		// Anything else is the page as it is: no challenge asked, one that isn't, or another place's link.
		const plain = tag( readFileSync( new URL( '../drive/index.html', import.meta.url ), 'utf8' ), 'property', 'og:title' );
		for ( const query of [ '', '?challenge=99999&vs=AAAAAAAAAAAAAAAA', '?challenge=nope', '?spot=furka' ] ) {

			res = await page( query );
			assert.equal( res.status, 200, query );
			assert.equal( tag( res.text, 'property', 'og:title' ), plain, query );

		}

		// The home page with the same link is the file as it is, the Worker not asked (it runs for /api/*,
		// /c and /ads.txt alone, so on the Free plan a day's requests used up never turns the home page away).
		res = await page( `?challenge=${ c.id }&vs=${ handle }`, nextIp(), '/' );
		assert.equal( res.status, 200 );
		assert.equal( tag( res.text, 'property', 'og:title' ), plain );
		assert.notEqual( res.headers.get( 'Cache-Control' ), 'no-store' );
		const config = JSON.parse( readFileSync( new URL( '../wrangler.drive.jsonc', import.meta.url ), 'utf8' ).replace( /^\s*\/\/.*$/gm, '' ) );
		assert.deepEqual( config.assets.run_worker_first, [ '/api/*', LINK_PATH, '/ads.txt' ] );
		assert.equal( LINK_PATH, '/c' );

	} );

	test( 'a ghost and a link are held to the looks as the boards are: those that miss the cache and read D1 CHALLENGE_MISSES (24) a minute from an address (all of a /48 one); what the cache has still answered, and other addresses too', async () => {

		// (The rate limiter's minutes are the wall clock's: started early in one, so the 24 are counted
		// in it.)
		const into = Date.now() % MINUTE;
		if ( into > 40 * SECOND ) await new Promise( resolve => setTimeout( resolve, MINUTE - into + 200 ) );
		let n = 0;
		const from = () => `2001:db8:6a:${ ( ++ n ).toString( 16 ) }::5`;
		const c = moonDay();
		const time = CHALLENGE_DAY + 4 * HOUR;
		const nia = server.d1( `SELECT run_id FROM challenge_ghosts WHERE challenge_id = ${ c.id } LIMIT 1` )[ 0 ].run_id;
		// One in the cache (asked once from elsewhere first).
		assert.equal( ( await call( server, `/api/challenges/ghost?challenge=${ c.id }&run=${ nia }`, { ip: nextIp(), time } ) ).status, 200 );
		// Runs and handles that aren't, in turn, each from another /64 of the /48: each a miss.
		const answers = [];
		for ( let k = 0; k < 15; k ++ ) {

			answers.push( await call( server, `/api/challenges/ghost?challenge=${ c.id }&run=nothing${ String( k ).padStart( 9, '0' ) }`, { ip: from(), time } ) );
			answers.push( await call( server, `/api/challenges/link?challenge=${ c.id }&vs=${ String( k ).padStart( 16, 'B' ) }`, { ip: from(), time } ) );

		}

		const statuses = answers.map( answer => answer.status );
		assert.equal( statuses.indexOf( 429 ), CHALLENGE_MISSES, statuses.join( ' ' ) );
		assert.ok( statuses.slice( 0, CHALLENGE_MISSES ).every( status => status === 404 || status === 200 ), statuses.join( ' ' ) );
		assert.ok( statuses.slice( CHALLENGE_MISSES ).every( status => status === 429 ), statuses.join( ' ' ) );
		const cached = await call( server, `/api/challenges/ghost?challenge=${ c.id }&run=${ nia }`, { ip: from(), time } );
		assert.deepEqual( [ cached.status, cached.headers.get( 'X-Board-Cache' ) ], [ 200, 'hit' ] );
		assert.equal( ( await call( server, `/api/challenges/ghost?challenge=${ c.id }&run=nothingelsewhere`, { ip: '2001:db8:6b::5', time } ) ).status, 404 );

	} );

	test( 'turned away: a run quicker than the game goes, points out of order or missing, longer than the visit, or bad (400)', async () => {

		const dan = await player( 'Dan Cheat' );
		const c = earthDay();
		const fair = fairRun( c, 0 );
		const tooFast = fair.passes.map( ( [ i, at ], k ) => [ i, at - ( k + 1 ) * 500 ] );
		const swapped = fairRun( c, 9000 ).passes.map( ( pass, i, all ) => i === 0 ? [ 1, pass[ 1 ] ] : i === 1 ? [ 0, all[ 1 ][ 1 ] ] : pass );
		const okay = fairRun( c, 9000 );
		const bad = {
			'too fast': { run: { ms: tooFast.at( - 1 )[ 1 ], passes: tooFast } },
			'out of order': { run: { ms: okay.ms, passes: swapped } },
			'a gate missed': { run: { ms: okay.passes.at( - 2 )[ 1 ], passes: okay.passes.slice( 0, - 1 ) } },
			'not the last pass': { run: { ms: okay.ms + 5, passes: okay.passes } },
			// The visit began 1 minute before; the run says 10.
			'longer than the visit': { run: fairRun( c, 100000 ), after: MINUTE },
			'no passes': { body: { passes: undefined } },
			'a ride the game hasn\'t': { vehicle: 'tank' },
			'no run id': { body: { run: 'short' } },
			'not a challenge': { body: { challenge: 'one' } },
			'a fraction of a ms': { body: { ms: okay.ms + 0.5 } },
		};
		for ( const [ name, options ] of Object.entries( bad ) ) {

			// (Each from an address of its own: those checked against the challenge read it from D1, so
			// each is one of its address's CHALLENGE_MISSES, 24 a minute.)
			const res = await post( dan, c, { run: okay, ip: nextIp(), ...options } );
			assert.equal( res.status, 400, `${ name }: ${ res.text }` );

		}

		assert.equal( ( await send( 'POST', '/api/challenges/time', '{nope' ) ).status, 400 );
		assert.equal( ( await send( 'POST', '/api/challenges/time', [ 1 ] ) ).status, 400 );
		// A body bigger than a time with the biggest ghost and look can be: refused before it's read.
		assert.equal( ( await send( 'POST', '/api/challenges/time', { id: dan.id, secret: dan.secret, passes: 'x'.repeat( 3000 ), ghost: 'A'.repeat( GHOST_TEXT + 1024 ) } ) ).status, 413 );
		// Nothing of it kept, and none of it counted as a turn.
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM challenge_times WHERE player_id = '${ dan.id }'` )[ 0 ].n, 0 );
		assert.equal( ( await post( dan, c, { run: okay } ) ).status, 200 );

	} );

	test( 'turned away: no visit, one forged, run out or someone else\'s, the wrong secret, an Earth challenge with a Moon visit (403); not from the site (403, 415)', async () => {

		const eve = await player( 'Eve Moon', { kind: 'moon' } );
		const c = earthDay();
		const run = fairRun( c, 9000 );
		// The Earth's needs an Earth visit; the Moon's takes the Moon visit, and Mars's too (a free
		// world's visit, as both are), its ghost checked in Mars's sphere's frame.
		let res = await post( eve, c, { run } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'world' ] );
		assert.equal( ( await post( eve, moonDay(), { run: fairRun( moonDay(), 9000 ) } ) ).status, 200 );
		res = await post( eve, marsDay(), { run: fairRun( marsDay(), 9000 ), after: 11 * MINUTE } );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( [ res.json.rank, res.json.isNewBest ], [ 1, true ] );
		const fay = await player( 'Fay Token' );
		const gus = await player( 'Gus Other' );
		const [ , id, expires, signature ] = fay.visit.split( '.' );
		const forged = `v1.${ id }.${ expires }.${ signature.slice( 0, 10 ) }${ signature[ 10 ] === 'A' ? 'B' : 'A' }${ signature.slice( 11 ) }`;
		for ( const [ name, visit ] of [ [ 'none', null ], [ 'forged', forged ], [ 'someone else\'s', gus.visit ], [ 'another kind', `v1.${ id.slice( 0, - 1 ) }o.${ expires }.${ signature }` ] ] ) {

			res = await post( fay, c, { run, visit } );
			assert.deepEqual( [ res.status, res.json?.reason ], [ 403, 'visit' ], name );

		}

		// Run out: posted seven hours into the visit.
		res = await post( fay, c, { run, after: 7 * HOUR } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'visit' ] );
		res = await post( { ...fay, secret: 'x'.repeat( 32 ) }, c, { run } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'player' ] );
		const body = JSON.stringify( { id: fay.id, secret: fay.secret, visit: fay.visit, challenge: c.id, run: fay.run, ms: run.ms, passes: run.passes, vehicle: 'go-kart' } );
		const json = { 'Content-Type': 'application/json' };
		assert.equal( ( await call( server, '/api/challenges/time', { method: 'POST', headers: json, body, time: CHALLENGE_DAY + MINUTE } ) ).status, 403, 'no Origin' );
		assert.equal( ( await call( server, '/api/challenges/time', { method: 'POST', headers: { ...json, Origin: 'https://evil.example' }, body } ) ).status, 403, 'another site' );
		assert.equal( ( await call( server, '/api/challenges/time', { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'text/plain' }, body } ) ).status, 415, 'a form' );
		assert.equal( ( await call( server, '/api/challenges/time' ) ).status, 405 );
		assert.equal( ( await post( fay, c, { run } ) ).status, 200 );

	} );

	test( 'turned away: a challenge that isn\'t live (another period\'s, none at all), too often from a player, and past a visitor\'s day (429)', async () => {

		const gil = await player( 'Gil Often' );
		const c = earthDay();
		// Tomorrow's isn't fixed yet; the id after the six is no challenge.
		let res = await post( gil, { ...c, id: 999 }, { run: fairRun( c, 9000 ) } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'challenge' ] );
		// One every 10 s from a player.
		res = await post( gil, c, { run: fairRun( c, 30000 ) } );
		assert.equal( res.status, 200 );
		res = await post( gil, c, { run: fairRun( c, 20000 ), after: 10 * MINUTE + 3 * SECOND } );
		assert.equal( res.status, 429 );
		assert.equal( res.headers.get( 'Retry-After' ), '10' );
		// A visitor's day: 4 here (CHALLENGE_TIMES_PER_VISITOR_DAILY); Gil has had 1.
		for ( let i = 1; i <= 3; i ++ ) assert.equal( ( await post( gil, c, { run: fairRun( c, 20000 - i * 1000 ), after: 10 * MINUTE + i * 20 * SECOND } ) ).status, 200 );
		res = await post( gil, c, { run: fairRun( c, 9000 ), after: 10 * MINUTE + 100 * SECOND } );
		assert.equal( res.status, 429 );
		assert.equal( Number( res.headers.get( 'Retry-After' ) ), Math.ceil( ( Date.UTC( 2026, 10, 17 ) - CHALLENGE_DAY - 10 * MINUTE - 100 * SECOND ) / 1000 ) );
		// Held till midnight from then on by his own gap: his next tries are turned away before they
		// write anything or ask DriveLimits (a script past the day's cap would otherwise cost a write
		// and a Durable Object request every 10 s all day), with the reason and how long till midnight.
		const held = server.d1( `SELECT last_time_at, last_seen_at FROM players WHERE id = '${ gil.id }'` )[ 0 ];
		assert.equal( held.last_time_at, Date.UTC( 2026, 10, 17 ) - 10 * SECOND );
		for ( const after of [ 10 * MINUTE + 115 * SECOND, 10 * MINUTE + 300 * SECOND ] ) {

			res = await post( gil, c, { run: fairRun( c, 8000 ), after } );
			assert.deepEqual( [ res.status, res.json.reason, res.json.error ], [ 429, 'daily', 'That\'s all for today. Try again tomorrow' ] );
			assert.equal( Number( res.headers.get( 'Retry-After' ) ), Math.ceil( ( Date.UTC( 2026, 10, 17 ) - CHALLENGE_DAY - after ) / 1000 ) );
			assert.deepEqual( server.d1( `SELECT last_time_at, last_seen_at FROM players WHERE id = '${ gil.id }'` )[ 0 ], held );

		}

		// The best kept is the best taken.
		assert.equal( server.d1( `SELECT ms FROM challenge_times WHERE player_id = '${ gil.id }'` )[ 0 ].ms, fairRun( c, 17000 ).ms );

	} );

	test( 'the same run posted again (its answer lost on the way, the page trying again): answered as it was taken, from the cache, a new best still, nothing written or read again, from any address; another run inside the gap is still turned away, and the same run later is a post like any other', async () => {

		const lia = await player( 'Lia Again' );
		const c = moonDay();
		const run = fairRun( c, 6000 );
		const first = await post( lia, c, { run } );
		assert.equal( first.status, 200, first.text );
		assert.equal( first.json.isNewBest, true );
		const kept = () => [ server.d1( `SELECT last_time_at, last_seen_at FROM players WHERE id = '${ lia.id }'` )[ 0 ], server.d1( `SELECT drivers FROM challenges WHERE id = ${ c.id }` )[ 0 ].drivers ];
		const was = kept();
		// Two seconds on, inside the 10 s gap: the same answer, kept in Cloudflare's cache as it was taken
		// (so nothing of the board is read again).
		const again = await post( lia, c, { run, after: 10 * MINUTE + 2 * SECOND } );
		assert.equal( again.status, 200, again.text );
		assert.deepEqual( again.json, first.json );
		assert.equal( again.headers.get( 'X-Time-Cache' ), 'hit' );
		assert.deepEqual( kept(), was );
		// From other addresses too (the token and the player work from anywhere): the cache's answer
		// each time, nothing written.
		for ( let i = 0; i < 5; i ++ ) {

			const elsewhere = await post( lia, c, { run, after: 10 * MINUTE + 2 * SECOND, ip: nextIp() } );
			assert.deepEqual( [ elsewhere.status, elsewhere.headers.get( 'X-Time-Cache' ) ], [ 200, 'hit' ], elsewhere.text );

		}

		assert.deepEqual( kept(), was );
		// A burst of it from one address: CHALLENGE_LOOKS' 429, as for a burst of boards.
		const burst = nextIp();
		let limited = null;
		for ( let i = 0; i < 70 && ! limited; i ++ ) {

			const res = await post( lia, c, { run, after: 10 * MINUTE + 5 * SECOND, ip: burst } );
			if ( res.status === 429 ) limited = res;
			else assert.deepEqual( [ res.status, res.headers.get( 'X-Time-Cache' ) ], [ 200, 'hit' ] );

		}

		assert.ok( limited, 'never limited' );
		assert.equal( limited.json.retryAfter, 60 );
		// Another run (another id, or the same id with another time) inside the gap: a 429 as before.
		assert.equal( ( await post( lia, c, { run, after: 10 * MINUTE + 3 * SECOND, body: { run: 's'.repeat( 16 ) } } ) ).status, 429 );
		assert.equal( ( await post( lia, c, { run: fairRun( c, 5000 ), after: 10 * MINUTE + 4 * SECOND } ) ).status, 429 );
		assert.deepEqual( kept(), was );
		// Later than REPOST: a post like any other, the gap claimed (and so the next inside it turned
		// away) and the visitor's day counted, and not a new best.
		const later = await post( lia, c, { run, after: 10 * MINUTE + REPOST + SECOND } );
		assert.equal( later.status, 200, later.text );
		assert.deepEqual( [ later.json.isNewBest, later.json.ms, later.headers.get( 'X-Time-Cache' ) ], [ false, run.ms, null ] );
		assert.equal( kept()[ 0 ].last_time_at, lia.at + 10 * MINUTE + REPOST + SECOND );
		assert.equal( ( await post( lia, c, { run, after: 10 * MINUTE + REPOST + 3 * SECOND } ) ).status, 429 );

	} );

	test( 'the owner\'s runs are taken and answered with the place they\'d have, but kept off the boards', async () => {

		const boss = await player( 'Boss Tries', { kind: 'owner' } );
		const res = await post( boss, earthDay(), { run: fairRun( earthDay(), 600 ) } );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( [ res.json.rank, res.json.owner, res.json.isNewBest ], [ 1, true, true ] );
		assert.ok( ! res.json.top.some( r => r.name === 'Boss Tries' ) );
		const shown = await board( earthDay().id, { id: boss.id, time: CHALLENGE_DAY + 2 * HOUR } );
		assert.ok( ! shown.json.rows.some( r => r.name === 'Boss Tries' ) );
		assert.deepEqual( [ shown.json.me.owner, shown.json.me.rank ], [ true, 1 ] );
		// A link to it (the owner's own, to share) says the name and the time, and nothing of whose they
		// are: not that they're the owner's.
		const linked = await call( server, `/api/challenges/link?challenge=${ earthDay().id }&vs=${ res.json.handle }`, { ip: nextIp(), time: CHALLENGE_DAY + 2 * HOUR } );
		assert.deepEqual( [ linked.status, linked.json.vs.name, linked.json.vs.ms ], [ 200, 'Boss Tries', res.json.ms ] );
		assert.ok( ! ( 'owner' in linked.json.vs ) && ! /owner/.test( linked.text ), linked.text );
		// Not counted among its drivers either.
		assert.equal( server.d1( `SELECT drivers FROM challenges WHERE id = ${ earthDay().id }` )[ 0 ].drivers, shown.json.total );
		assert.ok( shown.json.rows.every( r => r.rank <= shown.json.total ) );

	} );

	test( 'lists and boards are kept in Cloudflare\'s cache, a new best clearing them; a burst from one address is a 429', async () => {

		const ip = nextIp();
		const first = await board( moonDay().id, { ip } );
		const second = await board( moonDay().id, { ip } );
		assert.equal( second.headers.get( 'X-Board-Cache' ), 'hit' );
		assert.equal( first.json.total, second.json.total );
		const hal = await player( 'Hal New' );
		// A player's own row kept too: none yet, twice.
		assert.deepEqual( [ ( await board( moonDay().id, { ip, id: hal.id } ) ).headers.get( 'X-Player-Cache' ), ( await board( moonDay().id, { ip, id: hal.id } ) ).json.me ], [ 'miss', null ] );
		assert.equal( ( await board( moonDay().id, { ip, id: hal.id } ) ).headers.get( 'X-Player-Cache' ), 'hit' );
		assert.equal( ( await post( hal, moonDay(), { run: fairRun( moonDay(), 9000 ) } ) ).status, 200 );
		const third = await board( moonDay().id, { ip, id: hal.id } );
		assert.deepEqual( [ third.headers.get( 'X-Board-Cache' ), third.headers.get( 'X-Player-Cache' ) ], [ 'miss', 'miss' ] );
		assert.equal( third.json.total, first.json.total + 1 );
		assert.equal( third.json.me.name, 'Hal New' );
		// CHALLENGE_LOOKS: 60 a minute from an address.
		const burst = nextIp();
		let limited = null;
		for ( let i = 0; i < 70 && ! limited; i ++ ) {

			const res = await list( { ip: burst } );
			if ( res.status === 429 ) limited = res;
			else assert.equal( res.status, 200 );

		}

		assert.ok( limited, 'never limited' );
		assert.equal( limited.headers.get( 'Retry-After' ), '60' );
		assert.equal( ( await list() ).status, 200, 'another address' );
		for ( const path of [ '/api/challenges?id=bad', '/api/challenges/board?challenge=x', '/api/challenges/board?challenge=0', '/api/challenges/board?challenge=1&id=nope' ] ) assert.equal( ( await call( server, path, { ip: nextIp(), time: CHALLENGE_DAY } ) ).status, 400, path );
		assert.equal( ( await call( server, '/api/challenges/board?challenge=999', { ip: nextIp(), time: CHALLENGE_DAY } ) ).status, 404 );

	} );

	test( 'admin: ADMIN_EMAILS only, the fifteen live and the fifteen next, and the places to choose from', async () => {

		assert.equal( ( await call( server, '/api/admin/challenges', { time: CHALLENGE_DAY } ) ).status, 401 );
		const someone = await signIn( 'someone@example.com' );
		assert.equal( ( await call( server, '/api/admin/challenges', { headers: { Cookie: someone }, time: CHALLENGE_DAY } ) ).status, 403 );
		assert.equal( ( await send( 'POST', '/api/admin/challenges', { action: 'approve', world: 'earth', cell: 'earth:1:1' }, { cookie: someone } ) ).status, 403 );
		const boss = await signIn( 'Boss@Example.com' );
		const res = await call( server, '/api/admin/challenges', { headers: { Cookie: boss }, time: CHALLENGE_DAY } );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( res.json.current.map( c => c.id ), live.map( c => c.id ) );
		assert.ok( res.json.current.every( c => c.source === 'rotation' ) );
		assert.equal( res.json.current.find( c => c.id === earthDay().id ).top[ 0 ].name, 'Bea Fast' );
		assert.deepEqual( res.json.upcoming.map( u => `${ u.world } ${ u.key } ${ u.source }` ).sort(), [
			'earth day:2026-11-17 rotation', 'earth month:2026-12 rotation', 'earth week:2026-11-23 rotation',
			'mars day:2026-11-17 rotation', 'mars month:2026-12 rotation', 'mars week:2026-11-23 rotation',
			'moon day:2026-11-17 rotation', 'moon month:2026-12 rotation', 'moon week:2026-11-23 rotation',
			'vesta day:2026-11-17 rotation', 'vesta month:2026-12 rotation', 'vesta week:2026-11-23 rotation',
		].concat( [ 'ceres day:2026-11-17 rotation', 'ceres month:2026-12 rotation', 'ceres week:2026-11-23 rotation' ] ).sort() );
		assert.equal( res.json.featured.earth.length, 17 );
		assert.equal( res.json.featured.moon.length, MOON_PLACES.length );
		assert.deepEqual( res.json.featured.mars.map( p => p.id ), MARS_PLACES.map( p => p.id ) );
		assert.deepEqual( res.json.featured.vesta.map( p => p.id ), VESTA_PLACES.map( p => p.id ) );
		assert.deepEqual( res.json.featured.ceres.map( p => p.id ), CERES_PLACES.map( p => p.id ) );
		assert.deepEqual( res.json.approved, [] );
		assert.deepEqual( Object.keys( res.json.busy ), WORLD_IDS );

	} );

	test( 'admin: a pick ahead is next up, and fixes its period when it comes; back to the rotation; bad picks turned away', async () => {

		const boss = await signIn( 'boss@example.com' );
		const admin = ( body, time = CHALLENGE_DAY ) => send( 'POST', '/api/admin/challenges', body, { cookie: boss, time } );
		// Tomorrow on the Earth: Lombard Street, by coordinates, a collect.
		let res = await admin( { action: 'pick', period: 'day:2026-11-17', world: 'earth', kind: 'collect', place: { name: 'Lombard Street', region: 'San Francisco, USA', lat: 37.8021, lon: - 122.4187, heading: 90 } } );
		assert.equal( res.status, 200, res.text );
		const next = res.json.upcoming.find( u => u.world === 'earth' && u.period === 'day' );
		assert.deepEqual( [ next.place, next.kind, next.source ], [ 'Lombard Street', 'collect', 'owner' ] );
		assert.deepEqual( res.json.picks.map( p => [ p.period, p.world, p.place ] ), [ [ 'day:2026-11-17', 'earth', 'Lombard Street' ] ] );
		// Next week on the Moon, a featured place; then back to the rotation.
		res = await admin( { action: 'pick', period: 'week:2026-11-23', world: 'moon', kind: 'landmark', place: { featured: 'moon-tycho' } } );
		assert.equal( res.json.upcoming.find( u => u.world === 'moon' && u.period === 'week' ).place, 'Tycho crater' );
		res = await admin( { action: 'unpick', period: 'week:2026-11-23', world: 'moon' } );
		assert.equal( res.json.upcoming.find( u => u.world === 'moon' && u.period === 'week' ).source, 'rotation' );
		// A month ahead, the date's own month.
		res = await admin( { action: 'pick', period: 'month:2027-01', world: 'moon', kind: 'sprint', place: { featured: 'moon-plato' } } );
		assert.equal( res.status, 200 );
		assert.ok( res.json.picks.some( p => p.period === 'month:2027-01' ) );
		// Bad ones: a period over, too far ahead, not one, the wrong world's place, a kind the game
		// hasn't, no place, coordinates off the world, a rude name, an unknown action.
		for ( const [ name, body ] of [
			[ 'yesterday', { action: 'pick', period: 'day:2026-11-15', world: 'earth', kind: 'sprint', place: { featured: 'spot:monaco' } } ],
			[ 'next year and more', { action: 'pick', period: 'month:2028-02', world: 'earth', kind: 'sprint', place: { featured: 'spot:monaco' } } ],
			[ 'a Tuesday week', { action: 'pick', period: 'week:2026-11-24', world: 'earth', kind: 'sprint', place: { featured: 'spot:monaco' } } ],
			[ 'the Moon\'s place on the Earth', { action: 'pick', period: 'day:2026-11-18', world: 'earth', kind: 'sprint', place: { featured: 'moon-tycho' } } ],
			[ 'the Moon\'s place on Mars', { action: 'pick', period: 'day:2026-11-18', world: 'mars', kind: 'sprint', place: { featured: 'moon-tycho' } } ],
			[ 'a kind', { action: 'pick', period: 'day:2026-11-18', world: 'earth', kind: 'drag', place: { featured: 'spot:monaco' } } ],
			[ 'no place', { action: 'pick', period: 'day:2026-11-18', world: 'earth', kind: 'sprint' } ],
			[ 'off the world', { action: 'pick', period: 'day:2026-11-18', world: 'earth', kind: 'sprint', place: { name: 'Nowhere', lat: 95, lon: 0 } } ],
			[ 'a rude name', { action: 'pick', period: 'day:2026-11-18', world: 'earth', kind: 'sprint', place: { name: 'shit road', lat: 1, lon: 1 } } ],
			[ 'a heading', { action: 'pick', period: 'day:2026-11-18', world: 'earth', kind: 'sprint', place: { name: 'Road', lat: 1, lon: 1, heading: 400 } } ],
			[ 'a world', { action: 'pick', period: 'day:2026-11-18', world: 'pluto', kind: 'sprint', place: { featured: 'spot:monaco' } } ],
			[ 'an action', { action: 'delete', period: 'day:2026-11-18', world: 'earth' } ],
		] ) assert.equal( ( await admin( body ) ).status, 400, name );

	} );

	test( 'yesterday\'s board is kept as it ended, each player\'s final place written; a time for it is turned away, but one finished just before midnight is taken in the minute after', async () => {

		const yesterday = earthDay();
		const before = server.d1( `SELECT player_id, ms, final_rank FROM challenge_times WHERE challenge_id = ${ yesterday.id } ORDER BY ms` );
		// A run finished at 23:59:50 and posted at 00:00:20 is taken; one begun after midnight isn't.
		const ivy = await player( 'Ivy Late', { time: Date.UTC( 2026, 10, 16, 23, 30 ) } );
		const late = fairRun( yesterday, 2000 );
		let res = await post( ivy, yesterday, { run: late, after: 30 * MINUTE + 20 * SECOND } );
		assert.equal( res.status, 200, res.text );
		const jay = await player( 'Jay Later', { time: Date.UTC( 2026, 10, 16, 23, 30 ) } );
		res = await post( jay, yesterday, { run: { ms: 5000, passes: [] }, after: 30 * MINUTE + 30 * SECOND } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'challenge' ] );
		res = await post( jay, yesterday, { run: late, after: 32 * MINUTE } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'challenge' ] );
		// The next ask after the minute gives yesterday's its final places: the fastest 1, the owner's none.
		// (After its answer has gone: it's no part of the list, so it waits for nothing, and nothing
		// going wrong in it can turn the list into an error.)
		const tomorrow = await list( { time: Date.UTC( 2026, 10, 17, 0, 5 ) } );
		for ( let tries = 0; ! server.d1( `SELECT final_at FROM challenges WHERE id = ${ yesterday.id }` )[ 0 ].final_at && tries < 50; tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );
		const after = server.d1( `SELECT p.name, t.ms, t.final_rank, t.owner FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE challenge_id = ${ yesterday.id } ORDER BY t.ms, t.created_at` );
		assert.equal( after.length, before.length + 1 );
		let place = 0;
		for ( const row of after ) assert.equal( row.final_rank, row.owner ? null : ++ place, row.name );
		// The placings those final places reach, written with them (achievements.js's placingQuery), from
		// final_rank alone: each player's are what their final places on every finished board make, the
		// owner's (no final_rank) none of them.
		const placed = server.d1( `SELECT t.player_id AS id, p.name, ( SELECT group_concat( a.achievement ) FROM ( SELECT achievement FROM achievements WHERE player_id = t.player_id AND achievement IN ( ${ PLACINGS.map( a => `'${ a.id }'` ).join( ', ' ) } ) ORDER BY achievement ) a ) AS feats,
			( SELECT json_group_array( json_array( r.final_rank, c.period ) ) FROM challenge_times r JOIN challenges c ON c.id = r.challenge_id WHERE r.player_id = t.player_id AND r.final_rank IS NOT NULL ) AS ranks
			FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE t.challenge_id = ${ yesterday.id }` );
		assert.ok( placed.some( row => row.feats?.includes( 'daily-winner' ) ) );
		for ( const row of placed ) {

			const ranks = JSON.parse( row.ranks );
			const want = PLACINGS.filter( a => ranks.some( ( [ rank, period ] ) => rank <= a.target && ( ! a.period || period.startsWith( `${ a.period }:` ) ) ) ).map( a => a.id ).sort().join( ',' );
			assert.equal( row.feats ?? '', want, row.name );

		}

		assert.ok( server.d1( `SELECT final_at FROM challenges WHERE id = ${ yesterday.id }` )[ 0 ].final_at >= Date.UTC( 2026, 10, 17, 0, 1 ) );
		// Each world's day finished; the week's and the month's go on.
		assert.deepEqual( server.d1( 'SELECT period FROM challenges WHERE final_at IS NOT NULL ORDER BY id' ).map( r => r.period ), WORLD_IDS.map( () => 'day:2026-11-16' ) );
		// Its board as it ended, a while later.
		const shown = await board( yesterday.id, { time: Date.UTC( 2026, 10, 18 ) } );
		assert.equal( shown.status, 200 );
		assert.equal( shown.json.rows[ 0 ].name, 'Bea Fast' );
		assert.ok( shown.json.challenge.finalAt );
		// And the new day's Earth challenge is the owner's pick for it, laid out as a collect round
		// Lombard Street; the week's and the month's as they were.
		const fixed = tomorrow.json.challenges.find( c => c.world === 'earth' && c.period === 'day' );
		assert.deepEqual( [ fixed.key, fixed.place, fixed.region, fixed.kind ], [ 'day:2026-11-17', 'Lombard Street', 'San Francisco, USA', 'collect' ] );
		assert.deepEqual( [ fixed.route.start.lat, fixed.route.start.lon ], [ 37.8021, - 122.4187 ] );
		assert.equal( server.d1( `SELECT source FROM challenges WHERE id = ${ fixed.id }` )[ 0 ].source, 'owner' );
		assert.deepEqual( tomorrow.json.challenges.filter( c => c.period !== 'day' ).map( c => c.id ), live.filter( c => c.period !== 'day' ).map( c => c.id ) );

	} );

	test( 'a link to yesterday\'s challenge: over, its time with its final place (kept a day), the page\'s card saying so; its ghosts gone with its final places, nothing to race', async () => {

		const yesterday = earthDay();
		const time = Date.UTC( 2026, 10, 17, 9 );
		assert.ok( server.d1( `SELECT final_at FROM challenges WHERE id = ${ yesterday.id }` )[ 0 ].final_at );
		// Gone with its final places, and none counted: nothing races a finished challenge.
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM challenge_ghosts WHERE challenge_id = ${ yesterday.id }` )[ 0 ].n, 0 );
		assert.equal( server.d1( `SELECT ghost_bytes FROM challenges WHERE id = ${ yesterday.id }` )[ 0 ].ghost_bytes, 0 );
		const cy = server.d1( `SELECT p.id, t.ms, t.final_rank, t.run_id FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE p.name = 'Cy Slow' AND t.challenge_id = ${ yesterday.id }` )[ 0 ];
		const handle = await handleOf( { TURNSTILE_SECRET: PASS_SECRET }, yesterday.id, cy.id );
		const res = await call( server, `/api/challenges/link?challenge=${ yesterday.id }&vs=${ handle }`, { ip: nextIp(), time } );
		assert.equal( res.status, 200, res.text );
		assert.ok( res.json.challenge.finalAt );
		assert.deepEqual( [ res.json.vs.name, res.json.vs.ms, res.json.vs.rank, res.json.vs.ghost ], [ 'Cy Slow', cy.ms, cy.final_rank, false ] );
		assert.equal( ( await call( server, `/api/challenges/ghost?challenge=${ yesterday.id }&run=${ cy.run_id }`, { ip: nextIp(), time } ) ).status, 404 );
		// Its page's card: over, with their time and place.
		const page = await call( server, `/c?challenge=${ yesterday.id }&vs=${ handle }`, { ip: nextIp(), time, headers: { Accept: 'text/html' } } );
		const title = page.text.match( /<meta property="og:title" content="([^"]*)"/ )[ 1 ];
		assert.equal( title, `Cy Slow finished in ${ formatTime( cy.ms ) } at ${ escapeHtml( yesterday.place ) }` );
		assert.match( page.text, new RegExp( `<meta property="og:description" content="The daily [^"]+ has ended, with Cy Slow #${ cy.final_rank } on its board\\. Try today&#39;s challenges, free in your browser\\."` ) );
		// The card's words, worked out alone: a live one with no time named, and one replaced.
		const live = { ...yesterday, startsAt: 0, endsAt: time + 2 * HOUR, finalAt: null, replacedAt: null };
		assert.match( linkWords( { challenge: live, vs: null }, time ).description, /, on till the end of [A-Z][a-z]+day \d+ [A-Z][a-z]+ \(UTC\)\. Drive it in your browser, free\.$/ );
		// A weekly's last day, and a monthly's; a time whose ghost isn't kept (CHALLENGE_GHOST_BUDGET):
		// beat it, no ghost promised.
		const week = { ...live, period: 'week', endsAt: Date.UTC( 2026, 10, 23 ) };
		const vs = { name: 'Ann Racer', ms: 21400, ghost: true };
		assert.match( linkWords( { challenge: week, vs }, time ).description, /^A weekly .+, on till the end of Sunday 22 November \(UTC\)\. Drive it in your browser and race Ann Racer's ghost\.$/ );
		assert.match( linkWords( { challenge: { ...live, period: 'month', endsAt: Date.UTC( 2026, 11, 1 ) }, vs: { ...vs, ghost: false } }, time ).description, /^A monthly .+, on till the end of Monday 30 November \(UTC\)\. Drive it in your browser and beat it\.$/ );
		assert.doesNotMatch( JSON.stringify( linkWords( { challenge: week, vs }, time ) ), / left/ );
		assert.match( linkWords( { challenge: { ...live, replacedAt: time }, vs: null }, time ).title, /is over$/ );
		// On another world, its words say which: "on the Moon", "on Mars" (no "the"); a world that isn't
		// one, nothing.
		const on = world => linkWords( { challenge: { ...live, world, kind: 'sprint', place: 'Somewhere', region: '' }, vs: null }, time );
		assert.deepEqual( [ on( 'moon' ).title, on( 'mars' ).title, on( 'earth' ).title, on( 'pluto' ).title ], [
			'World Drive: today\'s challenge at Somewhere on the Moon', 'World Drive: today\'s challenge at Somewhere on Mars', 'World Drive: today\'s challenge at Somewhere', 'World Drive: today\'s challenge at Somewhere',
		] );
		assert.match( on( 'mars' ).description, /^A daily checkpoint sprint at Somewhere on Mars in World Drive, / );

	} );

	test( 'admin: changing a live challenge with times on it warns first, then starts a new board, the old one kept apart and finished', async () => {

		const boss = await signIn( 'chief@example.com' );
		const time = Date.UTC( 2026, 10, 18, 10 );
		const now = ( await list( { time } ) ).json.challenges;
		const week = now.find( c => c.world === 'earth' && c.period === 'week' );
		const kim = await player( 'Kim Week', { time } );
		assert.equal( ( await post( kim, week, { run: fairRun( week, 5000 ) } ) ).status, 200 );
		const body = { action: 'pick', period: week.key, world: 'earth', kind: 'sprint', place: { featured: 'spot:furka' } };
		let res = await send( 'POST', '/api/admin/challenges', body, { cookie: boss, time: time + HOUR } );
		assert.deepEqual( [ res.status, res.json.reason, res.json.drivers ], [ 409, 'live', 1 ] );
		assert.equal( ( await list( { time: time + HOUR } ) ).json.challenges.find( c => c.id === week.id ).place, week.place );
		res = await send( 'POST', '/api/admin/challenges', { ...body, live: true }, { cookie: boss, time: time + HOUR } );
		assert.equal( res.status, 200, res.text );
		const replaced = res.json.current.find( c => c.world === 'earth' && c.period === 'week' );
		assert.notEqual( replaced.id, week.id );
		assert.deepEqual( [ replaced.place, replaced.kind, replaced.source, replaced.total ], [ 'Furka Pass', 'sprint', 'owner', 0 ] );
		// The old one: replaced, finished, its board kept; a time for it now turned away.
		const old = server.d1( `SELECT replaced_at, final_at FROM challenges WHERE id = ${ week.id }` )[ 0 ];
		assert.deepEqual( [ old.replaced_at, old.final_at ], [ time + HOUR, time + HOUR ] );
		assert.equal( server.d1( `SELECT final_rank FROM challenge_times WHERE challenge_id = ${ week.id } AND player_id = '${ kim.id }'` )[ 0 ].final_rank, 1 );
		// First on a finished weekly board: the weekly podium, and with it the vac truck.
		assert.ok( server.d1( `SELECT achievement FROM achievements WHERE player_id = '${ kim.id }'` ).some( r => r.achievement === 'weekly-podium' ) );
		res = await post( kim, week, { run: fairRun( week, 3000 ), after: HOUR + MINUTE } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'challenge' ] );
		assert.equal( ( await board( week.id, { time: time + 2 * HOUR } ) ).json.rows[ 0 ].name, 'Kim Week' );
		// One with no times on it changes without a word.
		const moonWeek = res = await send( 'POST', '/api/admin/challenges', { action: 'pick', period: now.find( c => c.world === 'moon' && c.period === 'week' ).key, world: 'moon', kind: 'collect', place: { featured: 'moon-apollo-11' } }, { cookie: boss, time: time + HOUR } );
		assert.equal( moonWeek.status, 200 );
		assert.equal( res.json.current.find( c => c.world === 'moon' && c.period === 'week' ).place, 'Tranquility Base' );

	} );

	test( 'admin: back to the rotation on a live one the rotation chose, or a pick of the place and kind it already is, changes nothing: no warning, the same challenge, its board going on', async () => {

		const boss = await signIn( 'lead@example.com' );
		const time = Date.UTC( 2026, 10, 18, 11 );
		const day = ( await list( { time } ) ).json.challenges.find( c => c.world === 'moon' && c.period === 'day' );
		const mo = await player( 'Mo Stays', { time } );
		assert.equal( ( await post( mo, day, { run: fairRun( day, 5000 ) } ) ).status, 200 );
		const admin = ( body, at ) => send( 'POST', '/api/admin/challenges', body, { cookie: boss, time: at } );
		const now = answer => answer.json.current.find( c => c.world === 'moon' && c.period === 'day' );
		let res = await admin( { action: 'unpick', period: day.key, world: 'moon' }, time + 11 * MINUTE );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( [ now( res ).id, now( res ).total, now( res ).source ], [ day.id, 1, 'rotation' ] );
		// A pick of what it already is: the same one, its board too, now said to be yours; and back.
		res = await admin( { action: 'pick', period: day.key, world: 'moon', kind: day.kind, place: { featured: MOON_PLACES.find( p => p.name === day.place ).id } }, time + 12 * MINUTE );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( [ now( res ).id, now( res ).total, now( res ).source ], [ day.id, 1, 'owner' ] );
		res = await admin( { action: 'unpick', period: day.key, world: 'moon' }, time + 13 * MINUTE );
		assert.deepEqual( [ res.status, now( res ).id, now( res ).source ], [ 200, day.id, 'rotation' ] );
		assert.deepEqual( server.d1( `SELECT replaced_at, final_at FROM challenges WHERE id = ${ day.id }` )[ 0 ], { replaced_at: null, final_at: null } );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM challenges WHERE period = '${ day.key }' AND world = 'moon'` )[ 0 ].n, 1 );
		// Another kind there is a change, warned about as any is.
		res = await admin( { action: 'pick', period: day.key, world: 'moon', kind: KINDS.find( kind => kind !== day.kind ), place: { featured: MOON_PLACES.find( p => p.name === day.place ).id } }, time + 14 * MINUTE );
		assert.deepEqual( [ res.status, res.json.reason, res.json.drivers ], [ 409, 'live', 1 ] );

	} );

	test( 'CHALLENGE_MISSES: the lists and boards that miss the cache and read D1, 24 a minute from an address (all of a /48\'s /64s one: room for the list and its four re-asks while a period\'s routes are laid out, all fifteen boards and a time), so past boards and players asked for in turn are turned away past it; what the cache has is still answered, and other addresses too', async () => {

		// (The rate limiter's minutes are the wall clock's: started early in one, so the 24 are counted
		// in it.)
		const into = Date.now() % MINUTE;
		if ( into > 40 * SECOND ) await new Promise( resolve => setTimeout( resolve, MINUTE - into + 200 ) );
		let n = 0;
		const from = () => `2001:db8:4d:${ ( ++ n ).toString( 16 ) }::5`;
		// The list as a page has it, cached (asked once from elsewhere first).
		assert.equal( ( await list() ).status, 200 );
		assert.equal( ( await list( { ip: from() } ) ).headers.get( 'X-Board-Cache' ), 'hit' );
		// Boards that aren't (or past ones: each read from D1 the first time it's asked for in a place) and
		// lists for players who aren't, in turn, each from another /64 of the /48: each a miss.
		const answers = [];
		for ( let k = 0; k < 20; k ++ ) {

			answers.push( await board( 5000 + k, { ip: from() } ) );
			answers.push( await list( { id: `script${ String( k ).padStart( 10, '0' ) }`, ip: from() } ) );

		}

		const statuses = answers.map( answer => answer.status );
		const first = statuses.indexOf( 429 );
		assert.equal( first, CHALLENGE_MISSES, statuses.join( ' ' ) );
		// (Room for what a page asks of a new period: the list, its RELOADS re-asks, every board and a time.)
		assert.ok( CHALLENGE_MISSES >= 1 + 4 + 3 * WORLD_IDS.length + 1 );
		assert.ok( statuses.slice( 0, CHALLENGE_MISSES ).every( status => status === 404 || status === 200 ), statuses.join( ' ' ) );
		assert.ok( statuses.slice( CHALLENGE_MISSES ).every( status => status === 429 ), statuses.join( ' ' ) );
		assert.deepEqual( [ answers[ first ].json.retryAfter, answers[ first ].headers.get( 'Retry-After' ) ], [ 60, '60' ] );
		// What the cache has costs nothing, and is still answered; another /48 is another address.
		assert.equal( ( await list( { ip: from() } ) ).status, 200 );
		assert.equal( ( await list( { id: 'scriptelsewhere0', ip: '2001:db8:4e::5' } ) ).status, 200 );

	} );

	test( 'a visitor\'s day of times is counted by the /48: a player posting from another /64 of it each time is turned away past CHALLENGE_TIMES_PER_VISITOR_DAILY all the same', async () => {

		const pia = await player( 'Pia Tunnel', { kind: 'moon' } );
		const c = live.find( c => c.world === 'moon' && c.period === 'month' );
		for ( let k = 0; k < 4; k ++ ) {

			const res = await post( pia, c, { run: fairRun( c, 9000 - k * 500 ), after: 10 * MINUTE + k * 20 * SECOND, ip: `2001:db8:4f:${ k + 1 }::9` } );
			assert.equal( res.status, 200, res.text );

		}

		// The fifth, from yet another /64: the visitor's day used up (till midnight UTC), and Pia held
		// till then.
		let res = await post( pia, c, { run: fairRun( c, 6000 ), after: 10 * MINUTE + 100 * SECOND, ip: '2001:db8:4f:aa::9' } );
		assert.deepEqual( [ res.status, res.json.error ], [ 429, 'That\'s all for today. Try again tomorrow' ] );
		res = await post( pia, c, { run: fairRun( c, 5000 ), after: 10 * MINUTE + 120 * SECOND, ip: '2001:db8:4f:bb::9' } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 429, 'daily' ] );

	} );

	test( 'admin: busy drop-in places approved for the rotation, and unapproved, by their cell; at most a hundred a world', async () => {

		const boss = await signIn( 'head@example.com' );
		const admin = body => send( 'POST', '/api/admin/challenges', body, { cookie: boss } );
		const cell = cellOf( 'earth', 45.83862, 4.95052 );
		let res = await admin( { action: 'approve', world: 'earth', cell } );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( res.json.approved.map( p => [ p.cell, p.name ] ), [ [ cell, '12 km NE of Lyon' ] ] );
		// Once only; and the cell can then be picked by it.
		res = await admin( { action: 'approve', world: 'earth', cell } );
		assert.equal( res.json.approved.length, 1 );
		res = await admin( { action: 'pick', period: 'day:2026-11-19', world: 'earth', kind: 'sprint', place: { cell } } );
		assert.equal( res.status, 200, res.text );
		assert.equal( res.json.picks.find( p => p.period === 'day:2026-11-19' ).place, '12 km NE of Lyon' );
		for ( const [ name, body ] of [ [ 'not a cell', { action: 'approve', world: 'earth', cell: 'earth:99999:1' } ], [ 'the other world\'s', { action: 'approve', world: 'moon', cell } ], [ 'coordinates', { action: 'approve', world: 'earth', cell: '45.8, 4.9' } ] ] ) {

			assert.equal( ( await admin( body ) ).status, 400, name );

		}

		res = await admin( { action: 'unapprove', world: 'earth', cell } );
		assert.deepEqual( res.json.approved, [] );
		// A hundred at most.
		server.d1( `INSERT INTO challenge_places ( world, cell_row, cell_column, name, region, lat, lon, created_at ) SELECT 'moon', value, 1, 'Somewhere', '', 0, 0, 0 FROM json_each( '[${ Array.from( { length: 100 }, ( _, i ) => i + 2000 ).join( ',' ) }]' )` );
		res = await admin( { action: 'approve', world: 'moon', cell: cellOf( 'moon', 1, 1 ) } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 409, 'full' ] );
		server.d1( 'DELETE FROM challenge_places' );

	} );

	// The challenges D1 has given their final places by `time`: asked for the list then (and again a
	// minute on and so on, as each instance finishes at most a dozen at a time, in the background),
	// till `done()` says so.
	async function finishing( time, done ) {

		let i = 0;
		for ( ; i < 6 && ! done(); i ++ ) {

			assert.equal( ( await list( { time: time + i * 61 * SECOND } ) ).status, 200 );
			for ( let tries = 0; tries < 20 && ! done(); tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );

		}

		assert.ok( done(), 'never finished' );
		// The Worker's background work settled (its finishing written) before the next test asks it
		// anything, after the database was read from outside.
		assert.equal( ( await list( { time: time + i * 61 * SECOND } ) ).status, 200 );

	}

	test( 'admin: the owner\'s picks from the live periods on, however far ahead, soonest first; each back to the rotation from the list', async () => {

		const boss = await signIn( 'boss@example.com' );
		const time = Date.UTC( 2026, 10, 20, 9 );
		const admin = body => send( 'POST', '/api/admin/challenges', body, { cookie: boss, time } );
		for ( const [ period, world, place ] of [ [ 'day:2027-06-01', 'earth', 'spot:monaco' ], [ 'month:2027-09', 'moon', 'moon-tycho' ], [ 'week:2027-03-01', 'earth', 'spot:furka' ] ] ) {

			assert.equal( ( await admin( { action: 'pick', period, world, kind: 'sprint', place: { featured: place } } ) ).status, 200 );

		}

		const res = await call( server, '/api/admin/challenges', { headers: { Cookie: boss }, time } );
		assert.equal( res.status, 200, res.text );
		const picks = res.json.picks;
		// All three, past the next 40 days of each kind; none of a period that's over (the 17th's, the
		// 19th's, made earlier); in the order they start.
		for ( const key of [ 'day:2027-06-01', 'month:2027-09', 'week:2027-03-01', 'month:2027-01' ] ) assert.ok( picks.some( p => p.period === key ), key );
		assert.ok( picks.every( p => parsePeriod( p.period ).ends > time ), JSON.stringify( picks ) );
		assert.deepEqual( picks.map( p => p.startsAt ), [ ...picks.map( p => p.startsAt ) ].sort( ( a, b ) => a - b ) );
		assert.deepEqual( picks.find( p => p.period === 'week:2027-03-01' ), { period: 'week:2027-03-01', world: 'earth', kind: 'sprint', place: 'Furka Pass', region: SPOTS.find( s => s.id === 'furka' ).region, lat: SPOTS.find( s => s.id === 'furka' ).lat, lon: SPOTS.find( s => s.id === 'furka' ).lon, heading: SPOTS.find( s => s.id === 'furka' ).heading ?? null, startsAt: Date.UTC( 2027, 2, 1 ) } );
		// Back to the rotation, each.
		for ( const [ period, world ] of [ [ 'day:2027-06-01', 'earth' ], [ 'month:2027-09', 'moon' ], [ 'week:2027-03-01', 'earth' ] ] ) {

			const back = await admin( { action: 'unpick', period, world } );
			assert.ok( ! back.json.picks.some( p => p.period === period ), period );

		}

	} );

	test( 'admin: back to the rotation on a live one the rotation chose leaves it as it is, its board going on, after a place is approved (which reshuffles the rotation) as before', async () => {

		const boss = await signIn( 'chief@example.com' );
		const time = Date.UTC( 2026, 10, 20, 10 );
		const day = ( await list( { time } ) ).json.challenges.find( c => c.world === 'moon' && c.period === 'day' );
		const pat = await player( 'Pat Stays', { time } );
		assert.equal( ( await post( pat, day, { run: fairRun( day, 5000 ) } ) ).status, 200 );
		const admin = body => send( 'POST', '/api/admin/challenges', body, { cookie: boss, time: time + 20 * MINUTE } );
		// A place approved: the rotation's order now isn't the one this day was fixed from.
		const cell = cellOf( 'moon', 12.5, 30.25 );
		assert.equal( ( await admin( { action: 'approve', world: 'moon', cell } ) ).status, 200 );
		try {

			const res = await admin( { action: 'unpick', period: day.key, world: 'moon' } );
			assert.equal( res.status, 200, res.text );
			const now = res.json.current.find( c => c.world === 'moon' && c.period === 'day' );
			assert.deepEqual( [ now.id, now.place, now.total, now.source ], [ day.id, day.place, 1, 'rotation' ] );
			assert.deepEqual( server.d1( `SELECT replaced_at, final_at FROM challenges WHERE id = ${ day.id }` )[ 0 ], { replaced_at: null, final_at: null } );

		} finally {

			await admin( { action: 'unapprove', world: 'moon', cell } );

		}

	} );

	test( 'a new week at Monday midnight UTC, the month going on: a weekly run finished on Sunday night taken in the minute after, none later; the new week fixed, the old one given its final places, the month not', async () => {

		const sunday = Date.UTC( 2026, 10, 29, 23 );
		const monday = Date.UTC( 2026, 10, 30 );
		const before = ( await list( { time: sunday } ) ).json.challenges;
		const week = before.find( c => c.world === 'earth' && c.period === 'week' );
		const month = before.find( c => c.world === 'earth' && c.period === 'month' );
		assert.deepEqual( [ week.key, month.key ], [ 'week:2026-11-23', 'month:2026-11' ] );
		// Finished at 23:59:50 or so, posted at 00:00:20: taken.
		const nia = await player( 'Nia Sunday', { time: sunday + 30 * MINUTE } );
		const run = fairRun( week, 10000 );
		assert.ok( run.ms > 25 * SECOND && run.ms < 10 * MINUTE, String( run.ms ) );
		let res = await post( nia, week, { run, after: 30 * MINUTE + 20 * SECOND } );
		assert.equal( res.status, 200, res.text );
		// After the minute: turned away, a quicker run or not.
		res = await post( nia, week, { run: fairRun( week, 9000 ), after: 31 * MINUTE + 30 * SECOND } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'challenge' ] );
		// Monday's list: a new week (and day) fixed, the month the same one.
		const after = ( await list( { time: monday + 30 * SECOND } ) ).json.challenges;
		const newWeek = after.find( c => c.world === 'earth' && c.period === 'week' );
		assert.deepEqual( [ newWeek.key, after.find( c => c.world === 'earth' && c.period === 'day' ).key ], [ 'week:2026-11-30', 'day:2026-11-30' ] );
		assert.notEqual( newWeek.id, week.id );
		assert.equal( after.find( c => c.world === 'earth' && c.period === 'month' ).id, month.id );
		// The old week given its final places (after GRACE), Nia's among them; the month not.
		const finished = id => server.d1( `SELECT final_at FROM challenges WHERE id = ${ id }` )[ 0 ].final_at !== null;
		await finishing( monday + GRACE + MINUTE, () => finished( week.id ) );
		assert.ok( server.d1( `SELECT final_rank FROM challenge_times WHERE challenge_id = ${ week.id } AND player_id = '${ nia.id }'` )[ 0 ].final_rank >= 1 );
		assert.ok( ! finished( month.id ) && ! finished( newWeek.id ) );

	} );

	test( 'a new month at its first midnight UTC, the week going on: a monthly run finished on the last night taken in the minute after, none later; the new month fixed, the old one given its final places, the week not', async () => {

		const last = Date.UTC( 2026, 10, 30, 23 );
		const first = Date.UTC( 2026, 11, 1 );
		const before = ( await list( { time: last } ) ).json.challenges;
		const week = before.find( c => c.world === 'moon' && c.period === 'week' );
		const month = before.find( c => c.world === 'moon' && c.period === 'month' );
		assert.deepEqual( [ week.key, month.key ], [ 'week:2026-11-30', 'month:2026-11' ] );
		const oz = await player( 'Oz Lastnight', { time: last + 30 * MINUTE, kind: 'moon' } );
		const run = fairRun( month, 10000 );
		assert.ok( run.ms > 25 * SECOND && run.ms < 10 * MINUTE, String( run.ms ) );
		let res = await post( oz, month, { run, after: 30 * MINUTE + 20 * SECOND } );
		assert.equal( res.status, 200, res.text );
		res = await post( oz, month, { run: fairRun( month, 9000 ), after: 31 * MINUTE + 30 * SECOND } );
		assert.deepEqual( [ res.status, res.json.reason ], [ 403, 'challenge' ] );
		const after = ( await list( { time: first + 30 * SECOND } ) ).json.challenges;
		const newMonth = after.find( c => c.world === 'moon' && c.period === 'month' );
		assert.equal( newMonth.key, 'month:2026-12' );
		assert.notEqual( newMonth.id, month.id );
		assert.equal( after.find( c => c.world === 'moon' && c.period === 'week' ).id, week.id );
		// The three live on the Moon still three places, the new month clear of the week going on.
		assert.equal( new Set( after.filter( c => c.world === 'moon' ).map( c => c.place ) ).size, 3 );
		const finished = id => server.d1( `SELECT final_at FROM challenges WHERE id = ${ id }` )[ 0 ].final_at !== null;
		await finishing( first + GRACE + MINUTE, () => finished( month.id ) );
		assert.ok( server.d1( `SELECT final_rank FROM challenge_times WHERE challenge_id = ${ month.id } AND player_id = '${ oz.id }'` )[ 0 ].final_rank >= 1 );
		assert.ok( ! finished( week.id ) && ! finished( newMonth.id ) );

	} );

	test( 'the rotation keeps clear of what\'s fixed, whoever chose it: with a place approved and the owner\'s picks for today and this week, tomorrow\'s and the day after\'s are neither the day before\'s nor the week\'s', async () => {

		const boss = await signIn( 'head@example.com' );
		const tuesday = Date.UTC( 2026, 11, 8, 10 );
		const admin = ( body, time = tuesday ) => send( 'POST', '/api/admin/challenges', body, { cookie: boss, time } );
		const today = ( await list( { time: tuesday } ) ).json.challenges.filter( c => c.world === 'earth' );
		assert.deepEqual( today.map( c => c.key ), [ 'day:2026-12-08', 'week:2026-12-07', 'month:2026-12' ] );
		// A busy place approved: the rotation's order reshuffled.
		const cell = cellOf( 'earth', 37.8021, - 122.4187 );
		assert.equal( ( await admin( { action: 'approve', world: 'earth', cell } ) ).status, 200 );
		try {

			// What the rotation alone (as it now is) would choose for Wednesday and Thursday: the owner
			// picks them for today and for the week.
			const approved = server.d1( 'SELECT * FROM challenge_places' );
			const env = { TURNSTILE_SECRET: PASS_SECRET };
			const wednesday = await rotationPick( env, periodOf( 'day', Date.UTC( 2026, 11, 9 ) ), 'earth', approved );
			const thursday = await rotationPick( env, periodOf( 'day', Date.UTC( 2026, 11, 10 ) ), 'earth', approved );
			const placeOf = pick => pick.place.id.startsWith( 'cell:' ) ? { cell: pick.place.id.slice( 5 ) } : { featured: pick.place.id };
			assert.equal( ( await admin( { action: 'pick', period: 'day:2026-12-08', world: 'earth', kind: 'sprint', place: placeOf( wednesday ), live: true } ) ).status, 200 );
			assert.equal( ( await admin( { action: 'pick', period: 'week:2026-12-07', world: 'earth', kind: 'collect', place: placeOf( thursday ), live: true } ) ).status, 200 );
			const named = periods => periods.map( c => c.place );
			// Wednesday: not Tuesday's (the owner's, the rotation's own choice for Wednesday) nor the week's.
			const wed = ( await list( { time: Date.UTC( 2026, 11, 9, 0, 10 ) } ) ).json.challenges.filter( c => c.world === 'earth' );
			assert.deepEqual( named( wed.slice( 1 ) ), [ thursday.place.name, today[ 2 ].place ] );
			assert.equal( wed[ 0 ].key, 'day:2026-12-09' );
			assert.ok( ! [ wednesday.place.name, thursday.place.name, today[ 2 ].place ].includes( wed[ 0 ].place ), JSON.stringify( named( wed ) ) );
			// Thursday: not Wednesday's, nor the week's (the rotation's own choice for Thursday).
			const thu = ( await list( { time: Date.UTC( 2026, 11, 10, 0, 10 ) } ) ).json.challenges.filter( c => c.world === 'earth' );
			assert.ok( ! [ wed[ 0 ].place, thursday.place.name, today[ 2 ].place ].includes( thu[ 0 ].place ), JSON.stringify( named( thu ) ) );

		} finally {

			await admin( { action: 'unapprove', world: 'earth', cell } );

		}

	} );

	test( 'a new week and its Monday fixed by the same ask: the week first, so the day keeps clear of it, the owner\'s pick for the week included; and the admin page\'s next day said so the evening before', async () => {

		const boss = await signIn( 'boss@example.com' );
		const sunday = Date.UTC( 2026, 11, 13, 12 );
		const monday = Date.UTC( 2026, 11, 14 );
		// Sunday's fixed (the day before Monday's), then what the rotation would give Monday's day on the
		// Earth if it were fixed before its week: as the Worker works it out, clear of what D1 has fixed
		// (Sunday, the month, the week before).
		assert.equal( ( await list( { time: sunday } ) ).status, 200 );
		const periods = [ 'day:2026-12-13', 'week:2026-12-07', 'month:2026-11', 'month:2026-12' ];
		const fixed = server.d1( `SELECT * FROM challenges WHERE period IN ( ${ periods.map( p => `'${ p }'` ).join( ', ' ) } ) AND replaced_at IS NULL` );
		const approved = server.d1( 'SELECT * FROM challenge_places' );
		const env = { TURNSTILE_SECRET: PASS_SECRET };
		const alone = await rotationPick( env, periodOf( 'day', monday ), 'earth', approved, fixed );
		// The owner picks that place for the new week.
		const place = alone.place.id.startsWith( 'cell:' ) ? { cell: alone.place.id.slice( 5 ) } : { featured: alone.place.id };
		const res = await send( 'POST', '/api/admin/challenges', { action: 'pick', period: 'week:2026-12-14', world: 'earth', kind: 'sprint', place }, { cookie: boss, time: sunday } );
		assert.equal( res.status, 200, res.text );
		// The admin page's next up, the evening before: the week the owner's pick, Monday clear of it.
		const next = ( await send( 'GET', '/api/admin/challenges', undefined, { cookie: boss, time: sunday + HOUR } ) ).json.upcoming.filter( u => u.world === 'earth' );
		const nextWeek = next.find( u => u.period === 'week' );
		const nextDay = next.find( u => u.period === 'day' );
		assert.deepEqual( [ nextWeek.key, nextWeek.place, nextWeek.source ], [ 'week:2026-12-14', alone.place.name, 'owner' ] );
		assert.equal( nextDay.key, 'day:2026-12-14' );
		assert.notEqual( nextDay.place, alone.place.name, 'the next day shown as the week\'s place' );
		// Monday's first ask fixes both: the week from the pick, then the day, clear of it, as next up said.
		const today = ( await list( { time: monday + 30 * SECOND } ) ).json.challenges.filter( c => c.world === 'earth' );
		assert.deepEqual( today.map( c => c.key ), [ 'day:2026-12-14', 'week:2026-12-14', 'month:2026-12' ] );
		assert.equal( today[ 1 ].place, alone.place.name );
		assert.notEqual( today[ 0 ].place, alone.place.name, 'the day fixed as its week\'s place' );
		assert.equal( today[ 0 ].place, nextDay.place );
		assert.equal( new Set( today.map( c => c.place ) ).size, 3 );

	} );

} );
