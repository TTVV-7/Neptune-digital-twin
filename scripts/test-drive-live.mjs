// npm run test:drive-live: driving with others, the Worker's half (worker/drive/live.js), against
// `wrangler dev` on this machine with throwaway Durable Objects and database, and WebSockets opened
// here as the page opens them (src/drive-app/live-protocol.js). Visit tokens are made here with
// Turnstile's documented test secret, as the Worker makes them; Google's keys are test keys served
// here. Checks: every connection turned away before the room (no upgrade, another site or none,
// a room that isn't one, no token, a forged, changed or expired one, the protocol not ours, LIVE
// off, a client's own internal headers); welcome, join and leave; names from the leaderboard's
// players (never the page's), guests, and a supporter's ⭐; states batched every FLUSH_MS, never
// echoed, rounded and checked, and in an area only within VIEW_RANGE; a car alone in its room
// going to nobody and not kept, and its first state after a join going at once; a state held back
// going with its car's next; look, place, away, trick and honk relayed at once, honks spaced and
// held to the rate; a place's name that isn't text; the rate, the sizes and what's out of order;
// full rooms and the area's shards; a visit connecting again, in the same room or another, as the
// same guest; one visit connecting over and over (the rate limiter); a connection the room closed
// going on talking (a raw client that ignores the close: the room resets); keepalives answered and
// held to the rate; the hello deadline, a visit running out, and a room carrying on after it has
// hibernated. The day's budget (LIVE_DAILY_BUDGET, small here): each ask counting, a room adding
// what it spent, a room closing everyone as it's spent (CLOSE.off, BUDGET_SPENT), /api/live's 503
// and /api/config saying so, and a fresh day at midnight UTC (the tests' clock, X-Test-Time).
// Then the room here in this process, on a stand-in for Cloudflare's runtime and clock: batches with
// nothing after them, being idle, waking up from its attachments, the alarm, LIVE switched off, the
// room emptying, a hello's name still being looked up, the attachment's size, no timers; quiet when
// alone, held states; a visit gone to another room; a closed connection talking on; and what it
// spends: every billed request counted once, reported once a minute while there's enough to and
// every ten minutes otherwise (a lone driver), and as it empties, a replaced driver's spend kept,
// closing everyone when the day's is spent, and carrying on when DriveLimits fails; in a party across
// worlds, each world's spend counted against its own budget even with nobody left on it; each
// address's share (what its connections spent themselves, its connections closed past it, and
// /api/live remembering an address turned away; what one that went spent kept through hibernation,
// and one closed with nobody left reported at once; a party's driver past its share of the other
// world closed as it moves there; the owner's visits handed on as uncounted). And the page's
// side (src/drive-app/live.js) on stand-ins for the browser: turned away at the door, a connection
// gone quiet, a busy area tried again, and quiet with only those on the globe to see it. Then who's
// driving now, on the globe: Earth-centred metres to latitude, longitude and height and back (known
// points, and three.js's ellipsoid); a room's drivers as dots (together within DOT_SPREAD, at most
// ROOM_DOTS, rounded, inside the area, on its side of 180°); an area's room's dots with its reports
// (a party's never, those on the globe not counted, paused ones counted, a change within REPORT_MS
// though there's little to report, the dots taken off as it empties, after hibernating and after a
// failed report); DriveLimits keeping them, on Node's own SQLite (one row a room, the TTL, the 200
// busiest, each ask charged to the budget); /api/online on stand-ins (its cache, a burst asking
// once, DriveLimits failing, the budget spent, LIVE off); and the whole way round on a Worker of its
// own (the real Cache API, the TTL), on: false with LIVE off and the budget spent.
// Mars, Vesta and Ceres (protocol v3, next to v1 and v2): each world's areas, bands, frames
// (level.js's pointOn) and checks; v3's handshake and v1/v2 pages kept out of far areas; a v2 page in
// a party seeing a Mars driver as on the globe and away's globe to v3 only; each world's budget,
// table and dots its own (no Earth fallback), far asks charged to the Earth's while it's open, the
// share's floor, past-share v3 closed CLOSE.off/SHARE_SPENT (v2 CLOSE.rate), WORLD_OFF, the party's
// charge rule; the page's here(), per-world refusals and closing; online.js's "On other worlds" and
// self-discounted counts; and Mars's dots the whole way round.
// TEST_DRIVE_LIVE_PORT=8950 moves the four wrangler servers (that port and the next three).

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { register } from 'node:module';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { serialize } from 'node:v8';
import { after, before, describe, mock, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker } from './worker-harness.mjs';
import {
	BUDGET_SPENT, BURST, CLOSE, WORLD_OFF, DOT_SPREAD, FLAGS, FLUSH_MS, HELLO_MS, HONK_GAP, IDLE_MS, KEEPALIVE_MS, MAX_HELLO, MAX_MESSAGE, MOON_CELL_DEG, MOON_RADIUS,
	NEARBY_SHARDS, ONLINE_AREAS, PARTY_MAX, PING, PONG, PROTOCOL, PROTOCOL_WORLDS, ROOM_DOTS, SEND_HZ, STILL_HZ, VIEW_RANGE,
	boundsOf, cellOf, checkDot, checkPlace, checkState, dotsOf, fromMoonFrame, makePartyCode, packState, parseRoom, shardOf, toEcef, toGeodetic, toMoonFrame,
	CELL_DEGS, KNOWN_WORLDS, LIVE_WORLD_IDS, PAGE_PROTOCOLS, PLACE_HEIGHTS, PROTOCOL_ALL, SHARE_SPENT, STATE_RADII,
	fromFrame, knows, placeWorld, toBodyFrame, toFrame, versionOf, worldOfRoom,
} from '../src/drive-app/live-protocol.js';
import { pointOn } from '../src/drive-app/level.js';
import { WORLDS } from '../src/drive-app/worlds.js';
import { MOON_RADIUS as MOON_SPHERE } from '../src/drive-app/moon-height.js';
import { makeVisit } from '../worker/drive/visits.js';
import { partyMark } from '../worker/drive/achievements.js';
import { RIDE_FEATS } from '../src/drive-app/achievement-rules.js';

const WebSocket = createRequire( import.meta.url )( 'ws' );
const PORT = Number( process.env.TEST_DRIVE_LIVE_PORT ) || 8950;
// Turnstile's documented test secrets: the Worker's, and another (tokens signed with it are forged).
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const FAIL_SECRET = '2x0000000000000000000000000000000AA';
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// How often a room with anyone in it reports what it has spent (worker/drive/live.js's REPORT_MS),
// and what it counts: connecting, each message in (billed 20 to a request), each alarm, each report.
const REPORT_MS = 60 * SECOND;
const COST = { connect: 1, message: 1 / 20, alarm: 1, report: 1 };
// Small areas here, to fill one quickly.
const NEARBY_MAX = 4;
const FURKA = { name: 'Furka Pass', lat: 46.5725, lon: 8.4153, height: 2429 };
const HELLO = { t: 'hello', player: null, vehicle: 'go-kart', look: { colour: 'red', number: 7 }, place: FURKA, away: false };
// Who's driving now, on the globe: the Furka Pass's area (its room), and its dot with one driver
// there (to 0.01° and 10 m); and two more places, with theirs.
const FURKA_AREA = cellOf( FURKA.lat, FURKA.lon );
const FURKA_DOT = { lat: 46.57, lon: 8.42, height: 2430, count: 1 };
const MONACO = { name: 'Monaco harbour', lat: 43.73658, lon: 7.42144, height: 3 };
const MONACO_DOT = { lat: 43.74, lon: 7.42, height: 0, count: 1 };
const TIMES = { name: 'Times Square', lat: 40.75765, lon: - 73.98577, height: 12 };
const TIMES_DOT = { lat: 40.76, lon: - 73.99, height: 10, count: 1 };

const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );
// A visit's token as /api/visit hands one out (made at `time`), and the visit's id in it.
const visitToken = ( time = Date.now(), secret = PASS_SECRET ) => makeVisit( { TURNSTILE_SECRET: secret }, time );
const visitId = token => token.split( '.' )[ 1 ];
const partyRoom = () => `party:${ makePartyCode( bytes => crypto.getRandomValues( bytes ) ) }`;

// Earth-centred metres for a spot (degrees, and metres above the ellipsoid), WGS84 as the tiles are.
function ecef( lat, lon, height = 0 ) {

	const a = 6378137;
	const e2 = 6.69437999014e-3;
	const φ = lat * Math.PI / 180;
	const λ = lon * Math.PI / 180;
	const n = a / Math.sqrt( 1 - e2 * Math.sin( φ ) ** 2 );
	return { x: ( n + height ) * Math.cos( φ ) * Math.cos( λ ), y: ( n + height ) * Math.cos( φ ) * Math.sin( λ ), z: ( n * ( 1 - e2 ) + height ) * Math.sin( φ ) };

}

// A car's STATE there: level, still, its wheels down (or with `flags`), `north` m north of it.
function carAt( lat, lon, { north = 0, flags = 128, speed = 0 } = {} ) {

	return packState( ecef( lat + north / 111200, lon, 2430 ), { x: 0, y: 0, z: 0, w: 1 }, { x: speed, y: 0, z: 0 }, flags );

}

// The Moon: Tycho, and a car's STATE there in the Moon's own frame (Moon-centred metres), as a page
// driving there sends it: level, still unless `speed`, `north` m north.
const TYCHO = { name: 'Tycho crater (Moon)', lat: - 43.31, lon: - 11.36, height: - 1200, world: 'moon' };
const TYCHO_AREA = cellOf( TYCHO.lat, TYCHO.lon, 'moon' );
function moonCarAt( lat, lon, { north = 0, flags = 128, speed = 0, height = TYCHO.height } = {} ) {

	return packState( toMoonFrame( lat + north / ( MOON_RADIUS * Math.PI / 180 ), lon, height ), { x: 0, y: 0, z: 0, w: 1 }, { x: speed, y: 0, z: 0 }, flags );

}

// Mars, Vesta and Ceres: a spot on each, and a car's STATE there in that world's own frame (its
// body frame), as a page driving there sends it.
const GALE = { name: 'Gale crater (Mars)', lat: - 5.4, lon: 137.8, height: - 4500, world: 'mars' };
const GALE_AREA = cellOf( GALE.lat, GALE.lon, 'mars' );
const RHEASILVIA = { name: 'Rheasilvia (Vesta)', lat: - 75, lon: - 59, height: - 20000, world: 'vesta' };
const RHEASILVIA_AREA = cellOf( RHEASILVIA.lat, RHEASILVIA.lon, 'vesta' );
const OCCATOR = { name: 'Occator crater (Ceres)', lat: 19.8, lon: - 120.7, height: - 2000, world: 'ceres' };
const OCCATOR_AREA = cellOf( OCCATOR.lat, OCCATOR.lon, 'ceres' );
const SPOT_ON = { mars: GALE, vesta: RHEASILVIA, ceres: OCCATOR };
function worldCarAt( world, { north = 0, flags = 128, speed = 0, height = SPOT_ON[ world ].height } = {} ) {

	const { lat, lon } = SPOT_ON[ world ];
	return packState( toBodyFrame( lat + north / ( WORLDS[ world ].radius * Math.PI / 180 ), lon, height, world ), { x: 0, y: 0, z: 0, w: 1 }, { x: speed, y: 0, z: 0 }, flags );

}

// One page's connection: what it's been sent, in order (JSON parsed, plain text as it is), and how
// it closed.
class Page {

	constructor( ws ) {

		this.ws = ws;
		this.inbox = [];
		// Closed as the close frame arrives (it has the code): wrangler dev's runtime keeps the TCP
		// connection under it open for a few seconds after the room closes one, and only then does
		// ws say it's closed. (ws doesn't say when the frame comes, but its receiver does.)
		this.closed = new Promise( resolve => {

			const closed = ( code, reason ) => {

				this.closedAt ??= Date.now();
				resolve( { code, reason: String( reason ) } );

			};
			ws.on( 'close', closed );
			// (On open, before any frame is read.)
			ws.once( 'open', () => ws._receiver.on( 'conclude', closed ) );

		} );
		ws.on( 'message', ( data, binary ) => {

			const text = String( data );
			try {

				this.inbox.push( binary ? data : JSON.parse( text ) );

			} catch {

				this.inbox.push( text );

			}

		} );

	}

	send( message ) {

		this.ws.send( typeof message === 'string' || message instanceof Uint8Array ? message : JSON.stringify( message ) );

	}

	// The first message not taken yet that's of type `t` (or is the text `t`), waiting up to `ms`
	// for it; null if none comes.
	async take( t, ms = 3000 ) {

		const deadline = Date.now() + ms;
		for ( ;; ) {

			const i = this.inbox.findIndex( m => m === t || m?.t === t );
			if ( i >= 0 ) return this.inbox.splice( i, 1 )[ 0 ];
			if ( Date.now() > deadline ) return null;
			await sleep( 15 );

		}

	}

	// Everything not taken yet, `ms` from now.
	async drain( ms = 0 ) {

		await sleep( ms );
		return this.inbox.splice( 0 );

	}

	// How it's closed, within `ms`: { code, reason }, or null if it's still open.
	ended( ms = 3000 ) {

		return Promise.race( [ this.closed, sleep( ms ).then( () => null ) ] );

	}

	close() {

		this.ws.close();
		return this.closed;

	}

}

// A WebSocket to `room` as the page opens one: from the site itself, with the protocol and a fresh
// visit's token (unless `token`, `protocols` or `origin`: '' for none). A Page once it's open, or
// { status, body } when it's turned away.
// worlds: as a page that knows of the Moon (v2) connects, offering both versions; world: the
// ?world= it says (for a party, the world it's on).
// all: as a page since Mars, Vesta and Ceres have drivers connects (v3), offering all three.
async function connect( server, room, { token, protocols, origin = server.base, headers = {}, worlds = false, all = false, world = null } = {} ) {

	token ??= await visitToken();
	const query = room === null ? '' : `?room=${ encodeURIComponent( room ) }${ world ? `&world=${ world }` : '' }`;
	return new Promise( ( resolve, reject ) => {

		const offer = all ? [ ...PAGE_PROTOCOLS, token ] : worlds ? [ PROTOCOL_WORLDS, PROTOCOL, token ] : [ PROTOCOL, token ];
		const ws = new WebSocket( `${ server.base.replace( 'http', 'ws' ) }/api/live${ query }`, protocols ?? offer, { origin, headers } );
		const page = new Page( ws );
		ws.on( 'open', () => resolve( page ) );
		ws.on( 'unexpected-response', ( req, res ) => {

			let body = '';
			res.on( 'data', chunk => body += chunk );
			res.on( 'end', () => resolve( { status: res.statusCode, body } ) );

		} );
		ws.on( 'error', reject );

	} );

}

// A page in `room` that has said hello (HELLO, with `hello` over it): its welcome, and its pid.
async function join( server, room, hello = {}, options = {} ) {

	const page = await connect( server, room, options );
	assert.ok( page instanceof Page, `turned away: ${ JSON.stringify( page ) }` );
	page.send( { ...HELLO, ...hello } );
	page.welcome = await page.take( 'welcome' );
	assert.ok( page.welcome, `no welcome: ${ JSON.stringify( page.inbox ) }` );
	page.pid = page.welcome.you;
	return page;

}

// A connection to `room` made byte by byte, as a client that keeps to none of the rules would make
// one: it never answers a close, and goes on sending after it. { send( text ), frames (the text it
// was sent), closeFrame ({ code, at } once the room's close came), closed (the TCP connection gone,
// and when, closedAt) }.
function rawSocket( server, room, token ) {

	const { hostname, port } = new URL( server.base );
	const socket = createConnection( Number( port ), hostname );
	const raw = { frames: [], closeFrame: null, closed: false, closedAt: null };
	// A text frame, masked, as a client sends one.
	raw.send = text => {

		const payload = Buffer.from( text );
		const mask = randomBytes( 4 );
		const head = payload.length < 126 ? Buffer.from( [ 0x81, 0x80 | payload.length ] ) : Buffer.from( [ 0x81, 0x80 | 126, payload.length >> 8, payload.length & 255 ] );
		if ( ! socket.destroyed ) socket.write( Buffer.concat( [ head, mask, payload.map( ( b, i ) => b ^ mask[ i % 4 ] ) ] ) );

	};
	return new Promise( ( resolve, reject ) => {

		let buffer = Buffer.alloc( 0 );
		let upgraded = false;
		socket.once( 'connect', () => socket.write( [
			`GET /api/live?room=${ encodeURIComponent( room ) } HTTP/1.1`, `Host: ${ hostname }:${ port }`, 'Upgrade: websocket', 'Connection: Upgrade',
			`Sec-WebSocket-Key: ${ randomBytes( 16 ).toString( 'base64' ) }`, 'Sec-WebSocket-Version: 13', `Sec-WebSocket-Protocol: ${ PROTOCOL }, ${ token }`,
			`Origin: ${ server.base }`, '', '',
		].join( '\r\n' ) ) );
		socket.on( 'data', chunk => {

			buffer = Buffer.concat( [ buffer, chunk ] );
			if ( ! upgraded ) {

				const end = buffer.indexOf( '\r\n\r\n' );
				if ( end < 0 ) return;
				const status = buffer.subarray( 0, end ).toString().split( '\r\n' )[ 0 ];
				buffer = buffer.subarray( end + 4 );
				if ( ! / 101 /.test( status ) ) return reject( new Error( status ) );
				upgraded = true;
				resolve( raw );

			}

			// The room's frames, unmasked.
			while ( buffer.length >= 2 ) {

				const opcode = buffer[ 0 ] & 15;
				let length = buffer[ 1 ] & 127;
				let offset = 2;
				if ( length === 126 ) {

					if ( buffer.length < 4 ) break;
					length = buffer.readUInt16BE( 2 );
					offset = 4;

				}

				if ( buffer.length < offset + length ) break;
				const payload = buffer.subarray( offset, offset + length );
				buffer = buffer.subarray( offset + length );
				if ( opcode === 8 ) raw.closeFrame ??= { code: payload.length >= 2 ? payload.readUInt16BE( 0 ) : 1005, at: Date.now() };
				else if ( opcode === 1 ) raw.frames.push( payload.toString() );

			}

		} );
		socket.on( 'close', () => Object.assign( raw, { closed: true, closedAt: Date.now() } ) );
		socket.on( 'error', reject );

	} );

}

// Each car in the 'S' batches among `messages`, by pid: its latest state (without its age).
function cars( messages ) {

	const seen = {};
	for ( const m of messages ) {

		if ( m?.t === 'S' ) for ( const [ pid, ...s ] of m.s ) seen[ pid ] = s.slice( 0, 11 );

	}

	return seen;

}

// 'cloudflare:workers' (only there inside Cloudflare's runtime) stood in for, as test-drive-worker.mjs
// does, so the Worker's own modules can be imported here.
let stoodIn = false;
function standInForCloudflare() {

	if ( stoodIn ) return;
	stoodIn = true;
	const stub = 'export class DurableObject { constructor( ctx, env ) { this.ctx = ctx; this.env = env; } }';
	const hooks = `export async function resolve( specifier, context, next ) {
		if ( specifier === 'cloudflare:workers' ) return { url: 'data:text/javascript,' + encodeURIComponent( ${ JSON.stringify( stub ) } ), shortCircuit: true };
		return next( specifier, context );
	}`;
	register( `data:text/javascript,${ encodeURIComponent( hooks ) }` );

}

// /api/online's answer at `time` (the tests' clock, on a Worker with TEST_CLOCK: each time a fresh
// ask, as none is kept for it yet), or with time null as a page asks: { on, total, areas }.
async function online( server, time = null ) {

	const res = await fetch( `${ server.base }/api/online`, { headers: time === null ? {} : { 'X-Test-Time': String( time ) } } );
	assert.equal( res.status, 200 );
	return res.json();

}

// --- the Worker, in wrangler dev ---------------------------------------------------------

// Who's driving now, the whole way round (see its tests, after the others under wrangler dev): a
// Worker of its own, with its drivers connected from the start, as a room says where they are a
// minute after its first connected, so by the time their tests come that's been and gone.
const presence = {};

before( async () => {

	presence.server = await startWorker( {
		port: PORT + 3,
		config: 'wrangler.drive.jsonc',
		vars: { GOOGLE_CLIENT_ID: '', GOOGLE_MAPS_API_KEY: 'test-maps-key-not-real', TURNSTILE_SECRET: PASS_SECRET, TEST_CLOCK: 'header' },
	} );
	const { server } = presence;
	presence.at = Date.now();
	// Alice at the Furka Pass and Erin at Monaco, each alone in her area's room; Pat in a party at Times
	// Square, and Gil on the globe in the Times Square area's room: neither of those counted.
	presence.alice = await join( server, FURKA_AREA );
	presence.erin = await join( server, cellOf( MONACO.lat, MONACO.lon ), { place: MONACO } );
	presence.pat = await join( server, partyRoom(), { place: TIMES } );
	presence.gil = await join( server, cellOf( TIMES.lat, TIMES.lon ), { place: null, away: true } );
	// And Max at Gale crater, alone in Mars's area's room (a v3 page): counted on Mars only.
	presence.max = await join( server, GALE_AREA, { place: GALE }, { all: true } );
	// Their keepalives, as their pages send them.
	presence.alive = setInterval( () => {

		for ( const page of [ presence.alice, presence.erin, presence.pat, presence.gil, presence.max ] ) if ( page.ws.readyState === WebSocket.OPEN ) page.send( PING );

	}, 20 * SECOND );

} );

after( () => {

	clearInterval( presence.alive );
	for ( const page of [ presence.alice, presence.erin, presence.pat, presence.gil, presence.max ] ) page?.ws.terminate();
	presence.server?.stop();

} );

describe( 'Driving with others', () => {

	let server;
	let off;
	let keys;
	let googleKey;
	// A page that never says hello, and one whose visit runs out a moment after it does: opened
	// first, and looked at last, so the suite doesn't wait for them as long.
	let silent;
	let silentAt;
	let expiring;
	let expiringAt;
	// Two drivers who then say nothing for longer than it takes their room to hibernate.
	let sleepers;

	before( async () => {

		googleKey = await makeKey( 'live-test-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		[ server, off ] = await Promise.all( [
			startWorker( {
				port: PORT,
				config: 'wrangler.drive.jsonc',
				vars: {
					GOOGLE_MAPS_API_KEY: 'test-maps-key-not-real',
					TURNSTILE_SECRET: PASS_SECRET,
					TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
					GOOGLE_CLIENT_ID: CLIENT_ID,
					GOOGLE_JWKS_URL: keys.url,
					SUPPORTER_EMAILS: 'friend@example.com',
					LIVE_NEARBY_MAX: String( NEARBY_MAX ),
					// LIVE is wrangler.drive.jsonc's ("on"), and LIVE_PARTY_MAX unset: PARTY_MAX.
				},
			} ),
			startWorker( {
				port: PORT + 1,
				config: 'wrangler.drive.jsonc',
				vars: { GOOGLE_CLIENT_ID: '', GOOGLE_MAPS_API_KEY: 'test-maps-key-not-real', TURNSTILE_SECRET: PASS_SECRET, LIVE: 'off' },
			} ),
		] );

		silent = await connect( server, partyRoom() );
		silentAt = Date.now();
		// Its token runs out (to the second) two or three seconds from now.
		const token = await visitToken( Date.now() - 6 * HOUR + 3 * SECOND );
		expiringAt = Number( token.split( '.' )[ 2 ] ) * SECOND;
		expiring = await join( server, partyRoom(), {}, { token } );
		const room = partyRoom();
		sleepers = { room, alice: await join( server, room ), bob: await join( server, room, { vehicle: 'hovercraft' } ) };
		sleepers.alice.send( { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		sleepers.alice.send( { t: 'look', vehicle: 'city-bus', look: { colour: 'yellow' } } );
		sleepers.at = Date.now();

	} );

	after( () => {

		for ( const page of [ silent, expiring, sleepers?.alice, sleepers?.bob ] ) page?.ws.terminate();
		server?.stop();
		off?.stop();
		keys?.close();

	} );

	// A request as the page makes one to the rest of the API: JSON, from the site itself.
	const post = async ( path, body, headers = {} ) => {

		const res = await fetch( server.base + path, { method: 'POST', headers: { Origin: server.base, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify( body ) } );
		return { status: res.status, headers: res.headers, json: await res.json().catch( () => null ) };

	};

	// A leaderboard player, made through the API with a visit of its own: { id, secret, name }.
	let addresses = 0;
	async function player( name ) {

		const made = await post( '/api/player', { name, visit: await visitToken() }, { 'CF-Connecting-IP': `198.51.100.${ ++ addresses }` } );
		assert.equal( made.status, 201, JSON.stringify( made.json ) );
		return made.json;

	}

	test( '/api/online: on, and with LIVE=off on: false and nobody, kept 30 s by browsers too', async () => {

		const on = await fetch( `${ server.base }/api/online` );
		assert.equal( on.headers.get( 'Cache-Control' ), 'public, max-age=30' );
		assert.equal( ( await on.json() ).on, true );
		const res = await fetch( `${ off.base }/api/online` );
		assert.deepEqual( [ res.status, res.headers.get( 'Cache-Control' ), await res.json() ], [ 200, 'public, max-age=30', { on: false, total: 0, areas: [] } ] );
		// From another site's page: turned away, as everything is.
		assert.equal( ( await fetch( `${ server.base }/api/online`, { headers: { 'Sec-Fetch-Site': 'cross-site' } } ) ).status, 403 );

	} );

	test( 'config says driving with others is on, and off with LIVE=off', async () => {

		assert.equal( ( await ( await fetch( `${ server.base }/api/config` ) ).json() ).live, true );
		assert.equal( ( await ( await fetch( `${ off.base }/api/config` ) ).json() ).live, false );

	} );

	test( 'a connection is turned away before the room: no upgrade, another site, a bad room, no good token', async () => {

		const room = partyRoom();
		const token = await visitToken();
		// A plain GET.
		const plain = await fetch( `${ server.base }/api/live?room=${ room }`, { headers: { Origin: server.base } } );
		assert.equal( plain.status, 426 );
		assert.equal( ( await connect( server, room, { origin: '' } ) ).status, 403, 'no Origin' );
		assert.equal( ( await connect( server, room, { origin: 'https://evil.example' } ) ).status, 403, 'another site' );
		assert.equal( ( await connect( server, room, { origin: 'https://worlddrive.app.evil.example' } ) ).status, 403, 'a look-alike' );
		for ( const bad of [ null, '', 'lobby', 'party:abcdefg', 'party:ABCDEF', 'party:ABCDEFGH', 'party:ABCDEF0', 'near:1800.0', 'near:1277.99999', 'near:1277.1088#4', `${ room } ` ] ) {

			assert.equal( ( await connect( server, bad ) ).status, 400, `room ${ JSON.stringify( bad ) }` );

		}

		assert.equal( ( await connect( server, room, { protocols: [] } ) ).status, 400, 'no subprotocols' );
		assert.equal( ( await connect( server, room, { protocols: [ 'worlddrive-live.v0', token ] } ) ).status, 400, 'another protocol' );
		assert.equal( ( await connect( server, room, { protocols: [ token, PROTOCOL ] } ) ).status, 400, 'the token first' );
		assert.equal( ( await connect( server, room, { protocols: [ PROTOCOL ] } ) ).status, 401, 'no token' );
		const [ v, id, expires, signature ] = token.split( '.' );
		const turnedAway = {
			'not one': 'nope',
			'signed with another secret': await visitToken( Date.now(), FAIL_SECRET ),
			'its expiry changed': [ v, id, String( Number( expires ) + 3600 ), signature ].join( '.' ),
			'its id changed': [ v, `${ id.slice( 0, - 2 ) }${ id.at( - 2 ) === 'A' ? 'B' : 'A' }${ id.at( - 1 ) }`, expires, signature ].join( '.' ),
			// (The id's last letter says which kind of visit it is: visits.js.)
			'its kind changed': [ v, `${ id.slice( 0, - 1 ) }${ id.endsWith( 'e' ) ? 'm' : 'e' }`, expires, signature ].join( '.' ),
			'one from seven hours ago': await visitToken( Date.now() - 7 * HOUR ),
		};
		for ( const [ what, bad ] of Object.entries( turnedAway ) ) assert.equal( ( await connect( server, room, { token: bad } ) ).status, 401, what );

		// The room never heard of any of them: the first in it is alone.
		const first = await join( server, room );
		assert.deepEqual( first.welcome.players, [] );
		await first.close();

	} );

	test( 'with LIVE=off, every connection is turned away', async () => {

		const res = await connect( off, partyRoom() );
		assert.equal( res.status, 503 );
		assert.equal( JSON.parse( res.body ).error, 'Driving with others is off just now' );

	} );

	test( 'the room answers with the protocol, and what the page sends of its own internal headers counts for nothing', async () => {

		const room = partyRoom();
		const aliceToken = await visitToken();
		const alice = await join( server, room, {}, { token: aliceToken } );
		assert.equal( alice.ws.protocol, PROTOCOL );
		// As if Bob were Alice's visit, in another room, and long run out.
		const bob = await join( server, room, {}, { headers: { 'X-Live-Visit': visitId( aliceToken ), 'X-Live-Room': 'party:ZZZZZZZ', 'X-Live-Expires': '1000' } } );
		assert.equal( bob.welcome.room, room );
		assert.deepEqual( bob.welcome.players.map( p => p.pid ), [ alice.pid ] );
		bob.send( { t: 'honk' } );
		assert.deepEqual( await alice.take( 'honk' ), { t: 'honk', pid: bob.pid } );
		assert.equal( await alice.ended( 300 ), null, 'not replaced' );
		assert.equal( await bob.ended( 300 ), null, 'not expired' );
		await Promise.all( [ alice.close(), bob.close() ] );

	} );

	test( 'welcome, join and leave: everyone who has said hello, as guests without a player', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		assert.deepEqual( alice.welcome, { t: 'welcome', you: alice.pid, name: alice.welcome.name, star: false, room, max: PARTY_MAX, players: [] } );
		assert.match( alice.pid, /^[A-Za-z0-9_-]{8}$/ );
		// A guest is told what the others call them.
		assert.match( alice.welcome.name, /^Guest \d{4}$/ );

		// Someone connected who hasn't said hello isn't anyone yet.
		const lurker = await connect( server, room );
		const bob = await join( server, room, { vehicle: 'muscle-car', look: { colour: 'blue', decal: 'flames', boost: 'confetti', number: 42 }, place: null, away: true } );
		assert.notEqual( bob.pid, alice.pid );
		const [ seen ] = bob.welcome.players;
		// (A guest has no level or title: a player's are levels.js's, below.)
		assert.deepEqual( bob.welcome.players, [ { pid: alice.pid, name: alice.welcome.name, star: false, level: null, title: null, vehicle: 'go-kart', look: { colour: 'red', number: 7 }, place: FURKA, away: false, s: null } ] );
		assert.match( seen.name, /^Guest \d{4}$/ );
		const joined = await alice.take( 'join' );
		assert.deepEqual( joined, { t: 'join', player: { pid: bob.pid, name: bob.welcome.name, star: false, level: null, title: null, vehicle: 'muscle-car', look: { colour: 'blue', decal: 'flames', boost: 'confetti', number: 42 }, place: null, away: true, s: null } } );
		assert.match( joined.player.name, /^Guest \d{4}$/ );
		assert.deepEqual( lurker.inbox, [], 'nothing for a page before its hello' );

		await bob.close();
		assert.deepEqual( await alice.take( 'leave' ), { t: 'leave', pid: bob.pid } );
		// A page that never said hello leaves without a word.
		await lurker.close();
		assert.deepEqual( await alice.drain( 200 ), [] );
		await alice.close();

	} );

	test( 'names are the leaderboard\'s for a player whose secret checks out, never what the page says', async () => {

		const room = partyRoom();
		const rider = await player( 'Ghost Rider' );
		const watcher = await join( server, room );
		const named = await join( server, room, { player: { id: rider.id, secret: rider.secret }, name: 'Admin' } );
		// With their level and title (levels.js) as the leaderboard has them.
		const { player: seen } = await watcher.take( 'join' );
		assert.deepEqual( [ seen.name, seen.level, seen.title ], [ 'Ghost Rider', 1, 'rookie' ] );
		assert.deepEqual( [ named.welcome.name, named.welcome.star ], [ 'Ghost Rider', false ] );
		assert.match( named.welcome.players[ 0 ].name, /^Guest \d{4}$/ );

		// The wrong secret, someone who isn't a player, or not a player's shape at all: guests.
		const guests = [
			{ id: rider.id, secret: 'W'.repeat( 32 ) },
			{ id: 'Q'.repeat( 16 ), secret: rider.secret },
			{ id: rider.id },
			'Ghost Rider',
			[ rider.id, rider.secret ],
			42,
		];
		for ( const guest of guests ) {

			const page = await join( server, room, { player: guest } );
			const { player } = await watcher.take( 'join' );
			assert.match( player.name, /^Guest \d{4}$/, JSON.stringify( guest ) );
			assert.equal( player.star, false );
			assert.equal( player.level, null );
			await page.close();
			await watcher.take( 'leave' );

		}

		await Promise.all( [ watcher.close(), named.close() ] );

	} );

	test( 'a construction ride shows only with the achievement that unlocks it (the others see the pickup), and a party with someone else is counted once for each player in it', async () => {

		// A player and the visit they were made with, 10 km driven (the skid steer's achievement).
		const made = async name => {

			const visit = await visitToken();
			const res = await post( '/api/player', { name, visit }, { 'CF-Connecting-IP': `198.51.100.${ ++ addresses }` } );
			assert.equal( res.status, 201, JSON.stringify( res.json ) );
			return { ...res.json, visit };

		};

		const digger = await made( 'Digger Dee' );
		const plain = await made( 'Plain Pat' );
		const driven = await post( '/api/progress', { id: digger.id, secret: digger.secret, visit: digger.visit, report: { km: 10 } } );
		assert.deepEqual( driven.json.earned, [ 'first-drive', 'km-10' ] );
		const room = partyRoom();
		const watcher = await join( server, room );
		const credentials = who => ( { id: who.id, secret: who.secret } );
		// Earned: shown as it is. Not earned, or a guest: the default ride, whatever the page says.
		const dee = await join( server, room, { player: credentials( digger ), vehicle: 'skid-steer-loader-cad' } );
		assert.equal( ( await watcher.take( 'join' ) ).player.vehicle, 'skid-steer-loader-cad' );
		const pat = await join( server, room, { player: credentials( plain ), vehicle: 'hydrovac-truck' } );
		assert.equal( ( await watcher.take( 'join' ) ).player.vehicle, 'pickup-truck' );
		const guest = await join( server, room, { vehicle: 'wheel-loader' } );
		assert.equal( ( await watcher.take( 'join' ) ).player.vehicle, 'pickup-truck' );
		// And a ride changed later (look) the same.
		pat.send( { t: 'look', vehicle: 'crawler-dozer-20t', look: HELLO.look } );
		assert.equal( ( await watcher.take( 'look' ) ).vehicle, 'pickup-truck' );
		dee.send( { t: 'look', vehicle: 'go-kart', look: HELLO.look } );
		assert.equal( ( await watcher.take( 'look' ) ).vehicle, 'go-kart' );
		// The party had others in it: each player counted once (in the background, after the answers),
		// and the party achievement theirs; the guest has nothing to count.
		const counted = () => server.d1( `SELECT id, parties FROM players WHERE id IN ( '${ digger.id }', '${ plain.id }' ) ORDER BY id` );
		for ( let tries = 0; counted().some( row => row.parties < 1 ) && tries < 50; tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );
		assert.deepEqual( counted().map( row => row.parties ), [ 1, 1 ] );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM achievements WHERE achievement = 'party-1' AND player_id IN ( '${ digger.id }', '${ plain.id }' )` )[ 0 ].n, 2 );
		// Joining the same party again (a reconnect) doesn't count it again.
		await pat.close();
		await watcher.take( 'leave' );
		const again = await join( server, room, { player: credentials( plain ) } );
		await watcher.take( 'join' );
		await new Promise( resolve => setTimeout( resolve, 500 ) );
		assert.equal( server.d1( `SELECT parties FROM players WHERE id = '${ plain.id }'` )[ 0 ].parties, 1 );
		// Alone in a party, or in an area's room, nothing is counted.
		const lone = await made( 'Lone Lou' );
		const alone = await join( server, partyRoom(), { player: credentials( lone ) } );
		await new Promise( resolve => setTimeout( resolve, 500 ) );
		assert.equal( server.d1( `SELECT parties FROM players WHERE id = '${ lone.id }'` )[ 0 ].parties, 0 );
		await Promise.all( [ watcher.close(), dee.close(), guest.close(), again.close(), alone.close() ] );

	} );

	test( 'a party counts only with someone else: not one player in two tabs, nor a guest on the same address; another address does, once a party', async () => {

		const visitFor = async () => {

			const visit = await visitToken();
			const res = await post( '/api/player', { name: `Tabs ${ ++ addresses }`, visit }, { 'CF-Connecting-IP': `198.51.100.${ addresses }` } );
			assert.equal( res.status, 201, JSON.stringify( res.json ) );
			return { ...res.json, visit };

		};
		const sam = await visitFor();
		const who = { id: sam.id, secret: sam.secret };
		const from = ip => ( { headers: { 'CF-Connecting-IP': ip } } );
		const parties = () => server.d1( `SELECT parties FROM players WHERE id = '${ sam.id }'` )[ 0 ].parties;
		const settle = async want => {

			for ( let tries = 0; parties() !== want && tries < 50; tries ++ ) await new Promise( resolve => setTimeout( resolve, 100 ) );
			await new Promise( resolve => setTimeout( resolve, 300 ) );
			return parties();

		};
		// One player in two tabs (two visits, one address), in three parties: no one else.
		for ( let i = 0; i < 3; i ++ ) {

			const room = partyRoom();
			const tabs = [ await join( server, room, { player: who }, from( '203.0.113.7' ) ), await join( server, room, { player: who }, from( '203.0.113.7' ) ) ];
			await tabs[ 0 ].take( 'join' );
			await Promise.all( tabs.map( tab => tab.close() ) );

		}

		assert.equal( await settle( 0 ), 0 );
		// Nor with a guest on that address (a second tab with no nickname), nor the player on another.
		const first = partyRoom();
		const sams = [ await join( server, first, { player: who }, from( '203.0.113.7' ) ) ];
		sams.push( await join( server, first, {}, from( '203.0.113.7' ) ) );
		sams.push( await join( server, first, { player: who }, from( '203.0.113.8' ) ) );
		assert.equal( await settle( 0 ), 0 );
		// A guest from another address is someone else: counted, once.
		const friend = await join( server, first, {}, from( '192.0.2.44' ) );
		assert.equal( await settle( 1 ), 1 );
		await Promise.all( [ ...sams, friend ].map( page => page.close() ) );
		// Another party with someone else, then back to the first and to the second: each once.
		const second = partyRoom();
		const visitAgain = async room => {

			const pages = [ await join( server, room, { player: who }, from( '203.0.113.7' ) ), await join( server, room, {}, from( '192.0.2.45' ) ) ];
			await new Promise( resolve => setTimeout( resolve, 300 ) );
			await Promise.all( pages.map( page => page.close() ) );

		};
		await visitAgain( second );
		assert.equal( await settle( 2 ), 2 );
		for ( const room of [ first, second, first ] ) await visitAgain( room );
		assert.equal( await settle( 2 ), 2 );
		// What's kept: a short keyed hash a party (an HMAC with a key from the Worker's secret), never
		// its code, unlike another player's for the same one; and not the plain hash anyone with the
		// table could make for every code (32^7 of them) to find who drove together.
		const marks = JSON.parse( server.d1( `SELECT party_marks FROM players WHERE id = '${ sam.id }'` )[ 0 ].party_marks );
		assert.equal( marks.length, 2 );
		for ( const mark of marks ) assert.match( mark, /^[0-9a-f]{16}$/ );
		assert.ok( ! JSON.stringify( marks ).includes( first.slice( 6 ) ) && ! JSON.stringify( marks ).includes( second.slice( 6 ) ) );
		const env = { TURNSTILE_SECRET: PASS_SECRET };
		assert.ok( ! marks.includes( await partyMark( env, 'someone-else', first.slice( 6 ) ) ) );
		assert.ok( marks.includes( await partyMark( env, sam.id, first.slice( 6 ) ) ) );
		assert.ok( ! marks.includes( await partyMark( { TURNSTILE_SECRET: 'another-secret' }, sam.id, first.slice( 6 ) ) ) );
		const plain = createHash( 'sha256' ).update( `party:${ sam.id }:${ first.slice( 6 ) }` ).digest( 'hex' ).slice( 0, 16 );
		assert.ok( ! marks.includes( plain ) );

	} );

	test( 'the Moon\'s areas are rooms of their own: Moon drivers see each other\'s cars, in the Moon\'s frame, and never an Earth area\'s at the same latitude and longitude; a page from before the Moon had drivers is turned away from them', async () => {

		const moonRoom = cellOf( TYCHO.lat, TYCHO.lon, 'moon' );
		assert.match( moonRoom, /^moon:\d+\.\d+$/ );
		// A page speaking v1 only: not into a Moon area (in a party, a world it says is no world: it's
		// on the Earth); and a world that isn't one, from anyone.
		assert.equal( ( await connect( server, moonRoom ) ).status, 400 );
		assert.equal( ( await connect( server, partyRoom(), { worlds: true, world: 'mars' } ) ).status, 400 );
		assert.equal( ( await connect( server, `${ moonRoom.replace( /\.\d+$/, '' ) }.99999`, { worlds: true } ) ).status, 400 );
		const ann = await join( server, moonRoom, { place: TYCHO }, { worlds: true } );
		assert.equal( ann.ws.protocol, PROTOCOL_WORLDS );
		assert.equal( ann.welcome.room, moonRoom );
		const ben = await join( server, moonRoom, { place: TYCHO }, { worlds: true } );
		const joined = await ann.take( 'join' );
		assert.deepEqual( [ joined.player.world, joined.player.place ], [ 'moon', TYCHO ] );
		// Someone in the Earth's area at those numbers is in another room altogether.
		const earthly = await join( server, cellOf( TYCHO.lat, TYCHO.lon ), { place: { name: 'South Atlantic', lat: TYCHO.lat, lon: TYCHO.lon, height: 0 } }, { worlds: true } );
		assert.deepEqual( earthly.welcome.players, [] );
		// Ann drives: Ben has her car as she sent it, on the Moon; the Earth's area nothing.
		const car = moonCarAt( TYCHO.lat, TYCHO.lon, { speed: 4 } );
		ann.send( { t: 's', s: car } );
		assert.deepEqual( ( await ben.take( 'S' ) ).s[ 0 ].slice( 1, 12 ), car );
		// A state in the Earth's frame, or flown out of the Moon's bounds, is no car of hers.
		ann.send( { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		ann.send( { t: 's', s: moonCarAt( TYCHO.lat, TYCHO.lon, { height: 40000 } ) } );
		assert.equal( await ben.take( 'S', 600 ), null );
		assert.equal( await earthly.take( 'S', 100 ), null );
		assert.equal( await ann.ended( 100 ), null );
		await Promise.all( [ ann.close(), ben.close(), earthly.close() ] );

	} );

	test( 'Mars\'s, Vesta\'s and Ceres\'s areas are rooms of their own, for v3 pages: two on Mars see each other\'s cars in Mars\'s frame, none of an Earth area\'s at the same numbers; v1 and v2 pages are turned away from them; a v2 page in a party sees a Mars driver as on the globe', async () => {

		// v1 and v2 pages: not into a far area; a v3 page offering its versions out of order: no page.
		for ( const area of [ GALE_AREA, RHEASILVIA_AREA, OCCATOR_AREA ] ) {

			assert.equal( ( await connect( server, area ) ).status, 400, area );
			assert.equal( ( await connect( server, area, { worlds: true } ) ).status, 400, area );

		}

		assert.equal( ( await connect( server, GALE_AREA, { protocols: [ PROTOCOL_ALL, PROTOCOL, await visitToken() ] } ) ).status, 400 );
		assert.equal( ( await connect( server, partyRoom(), { all: true, world: 'pluto' } ) ).status, 400 );
		const ann = await join( server, GALE_AREA, { place: GALE }, { all: true } );
		assert.equal( ann.ws.protocol, PROTOCOL_ALL );
		assert.equal( ann.welcome.room, GALE_AREA );
		const ben = await join( server, GALE_AREA, { place: GALE }, { all: true } );
		const joined = await ann.take( 'join' );
		assert.deepEqual( [ joined.player.world, joined.player.place ], [ 'mars', GALE ] );
		// The Earth's area at those numbers is another room.
		const earthly = await join( server, cellOf( GALE.lat, GALE.lon ), { place: { name: 'Indian Ocean', lat: GALE.lat, lon: GALE.lon, height: 0 } }, { all: true } );
		assert.deepEqual( earthly.welcome.players, [] );
		const car = worldCarAt( 'mars', { speed: 4 } );
		ann.send( { t: 's', s: car } );
		assert.deepEqual( ( await ben.take( 'S' ) ).s[ 0 ].slice( 1, 12 ), car );
		// An Earth state, or a Vesta one, is no car of hers on Mars.
		ann.send( { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		ann.send( { t: 's', s: worldCarAt( 'vesta' ) } );
		assert.equal( await ben.take( 'S', 600 ), null );
		assert.equal( await earthly.take( 'S', 100 ), null );

		// Vesta: the same, in Vesta's frame (flying well over its ground too).
		const cal = await join( server, RHEASILVIA_AREA, { place: RHEASILVIA }, { all: true } );
		const dee = await join( server, RHEASILVIA_AREA, { place: RHEASILVIA }, { all: true } );
		await cal.take( 'join' );
		const flying = worldCarAt( 'vesta', { height: 30000, speed: 20 } );
		cal.send( { t: 's', s: flying } );
		assert.deepEqual( ( await dee.take( 'S' ) ).s[ 0 ].slice( 1, 12 ), flying );

		// A party across worlds: Max on Mars (v3), Vic on the Earth (v3), Old Olive (v2): Vic hears where
		// Max is, on Mars, and his car; Olive that he's on the globe, and nothing of his car.
		const room = partyRoom();
		const max = await join( server, room, { place: GALE }, { all: true, world: 'mars' } );
		const vic = await join( server, room, { place: MONACO }, { all: true } );
		const olive = await join( server, room, { place: MONACO }, { worlds: true } );
		const ofMax = page => page.welcome.players.find( p => p.pid === max.pid );
		assert.deepEqual( ( ( { world, place, away } ) => ( { world, place, away } ) )( ofMax( vic ) ), { world: 'mars', place: GALE, away: false } );
		assert.deepEqual( ( ( { world, place, away } ) => ( { world, place, away } ) )( ofMax( olive ) ), { world: undefined, place: null, away: true } );
		await max.take( 'join' );
		await max.take( 'join' );
		const marsCar = worldCarAt( 'mars' );
		max.send( { t: 's', s: marsCar } );
		assert.deepEqual( ( await vic.take( 'S' ) ).s[ 0 ].slice( 1, 12 ), marsCar );
		assert.equal( await olive.take( 'S', 600 ), null );
		// Max to Vesta's globe: Vic hears which globe; Olive that he's away, no globe.
		max.send( { t: 'away', world: 'mars', globe: 'vesta' } );
		assert.deepEqual( await vic.take( 'away' ), { t: 'away', pid: max.pid, globe: 'vesta' } );
		assert.deepEqual( await olive.take( 'away' ), { t: 'away', pid: max.pid } );
		await Promise.all( [ ann, ben, earthly, cal, dee, max, vic, olive ].map( page => page.close() ) );

	} );

	test( 'a party on the Moon counts for its players as one on the Earth does, and a friend going from the Earth to the Moon is heard of with the place\'s world', async () => {

		const made = async name => {

			const res = await post( '/api/player', { name, visit: await visitToken() }, { 'CF-Connecting-IP': `198.51.100.${ ++ addresses }` } );
			assert.equal( res.status, 201, JSON.stringify( res.json ) );
			return res.json;

		};
		const [ una, vic ] = [ await made( 'Lunar Una' ), await made( 'Lunar Vic' ) ];
		const parties = who => server.d1( `SELECT parties FROM players WHERE id = '${ who.id }'` )[ 0 ].parties;
		const room = partyRoom();
		const onMoon = { worlds: true, world: 'moon' };
		const a = await join( server, room, { player: { id: una.id, secret: una.secret }, place: TYCHO }, onMoon );
		const b = await join( server, room, { player: { id: vic.id, secret: vic.secret }, place: MONACO }, { worlds: true } );
		for ( let tries = 0; ( parties( una ) < 1 || parties( vic ) < 1 ) && tries < 50; tries ++ ) await sleep( 100 );
		assert.deepEqual( [ parties( una ), parties( vic ) ], [ 1, 1 ] );
		assert.deepEqual( [ b.welcome.players[ 0 ].world, b.welcome.players[ 0 ].place ], [ 'moon', TYCHO ] );
		// Vic goes to the Moon ("Lunar Vic went to Tycho crater (Moon)"): Una hears where, on the Moon.
		b.send( { t: 'place', place: TYCHO } );
		assert.deepEqual( await a.take( 'place' ), { t: 'place', pid: b.pid, place: TYCHO } );
		// And a party's room is never on the globe's map, the Moon's no more than the Earth's.
		await Promise.all( [ a.close(), b.close() ] );

	} );

	test( 'a ride unlocked after hello: the room shows it from the page\'s next hello (as the page says hello again when one unlocks)', async () => {

		const visit = await visitToken();
		const made = await post( '/api/player', { name: 'Late Lee', visit }, { 'CF-Connecting-IP': `198.51.100.${ ++ addresses }` } );
		const lee = { id: made.json.id, secret: made.json.secret };
		const room = partyRoom();
		const watcher = await join( server, room );
		const before = await join( server, room, { player: lee, vehicle: 'skid-steer-loader-cad' } );
		assert.equal( ( await watcher.take( 'join' ) ).player.vehicle, 'pickup-truck' );
		assert.deepEqual( ( await post( '/api/progress', { ...lee, visit, report: { km: 10 } } ) ).json.earned, [ 'first-drive', 'km-10' ] );
		// The page's rehello: a fresh connection, and hello again.
		await before.close();
		await watcher.take( 'leave' );
		const after = await join( server, room, { player: lee, vehicle: 'skid-steer-loader-cad' } );
		assert.equal( ( await watcher.take( 'join' ) ).player.vehicle, 'skid-steer-loader-cad' );
		await Promise.all( [ watcher.close(), after.close() ] );

	} );

	test( 'a construction ride is looked up only when one is picked, once a connection: a hello in any other ride reads nothing of achievements', async () => {

		const visit = await visitToken();
		const made = await post( '/api/player', { name: 'Look Lu', visit }, { 'CF-Connecting-IP': `198.51.100.${ ++ addresses }` } );
		const lu = { id: made.json.id, secret: made.json.secret };
		const room = partyRoom();
		const watcher = await join( server, room );
		// Hello in the go-kart, with no achievement: nothing is asked of them yet.
		const page = await join( server, room, { player: lu, vehicle: 'go-kart' } );
		assert.equal( ( await watcher.take( 'join' ) ).player.vehicle, 'go-kart' );
		// Earned after the hello (the console here, as a report would): the skid steer, picked now, is
		// looked up as it's picked, so it shows (were it read with the hello, it would be the pickup).
		server.d1( `INSERT INTO achievements ( player_id, achievement, earned_at ) VALUES ( '${ lu.id }', 'km-10', 1 )` );
		page.send( { t: 'look', vehicle: 'skid-steer-loader-cad', look: HELLO.look } );
		assert.equal( ( await watcher.take( 'look' ) ).vehicle, 'skid-steer-loader-cad' );
		// The answer is kept for the connection: back and forth asks no more (taken away at the console,
		// it still shows until the page's next hello).
		server.d1( `DELETE FROM achievements WHERE player_id = '${ lu.id }'` );
		page.send( { t: 'look', vehicle: 'go-kart', look: HELLO.look } );
		assert.equal( ( await watcher.take( 'look' ) ).vehicle, 'go-kart' );
		page.send( { t: 'look', vehicle: 'skid-steer-loader-cad', look: HELLO.look } );
		assert.equal( ( await watcher.take( 'look' ) ).vehicle, 'skid-steer-loader-cad' );
		// One not yet asked about, without its achievement: the pickup.
		page.send( { t: 'look', vehicle: 'wheel-loader', look: HELLO.look } );
		assert.equal( ( await watcher.take( 'look' ) ).vehicle, 'pickup-truck' );
		await Promise.all( [ watcher.close(), page.close() ] );

	} );

	test( 'a supporter\'s player has a ⭐ by its name', async () => {

		const room = partyRoom();
		const friend = await player( 'Star Friend' );
		// Signed in as someone in SUPPORTER_EMAILS, with the player linked to the account.
		const signedIn = await post( '/api/session', { credential: await makeToken( googleKey, { sub: '2001', email: 'friend@example.com', name: 'A Friend' } ) } );
		assert.equal( signedIn.status, 200 );
		assert.equal( signedIn.json.supporter, true );
		const cookie = /^(__Host-wd_session=[\w-]{43});/.exec( signedIn.headers.get( 'Set-Cookie' ) )[ 1 ];
		assert.equal( ( await post( '/api/player/link', { id: friend.id, secret: friend.secret }, { Cookie: cookie } ) ).status, 200 );
		const plain = await player( 'Plain Rider' );

		const watcher = await join( server, room );
		const star = await join( server, room, { player: { id: friend.id, secret: friend.secret } } );
		const joined = ( await watcher.take( 'join' ) ).player;
		assert.deepEqual( [ joined.name, joined.star ], [ 'Star Friend', true ] );
		assert.deepEqual( [ star.welcome.name, star.welcome.star ], [ 'Star Friend', true ] );
		assert.equal( star.welcome.players[ 0 ].star, false );
		const notStar = await join( server, room, { player: { id: plain.id, secret: plain.secret } } );
		const shown = Object.fromEntries( notStar.welcome.players.map( p => [ p.name, p.star ] ) );
		assert.equal( shown[ 'Star Friend' ], true );
		assert.equal( Object.values( shown ).filter( Boolean ).length, 1 );
		assert.equal( ( await watcher.take( 'join' ) ).player.star, false );
		await Promise.all( [ watcher.close(), star.close(), notStar.close() ] );

	} );

	test( 'states go out at most every FLUSH_MS, with only the latest of each car, and never back to their own', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		const bob = await join( server, room );
		await alice.take( 'join' );

		alice.send( { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		const first = await bob.take( 'S' );
		assert.equal( first.s.length, 1 );
		// The car's state, and how long the room had held it: it went with the message that brought it.
		assert.deepEqual( first.s[ 0 ], [ alice.pid, ...carAt( 46.5725, 8.4153 ), 0 ] );
		assert.ok( Math.abs( first.at - Date.now() ) < 5 * SECOND );

		// Three in quick succession, then a word from Bob after FLUSH_MS: one batch each way, Alice's
		// with only her latest, and nothing of hers to her.
		for ( const north of [ 10, 20, 30 ] ) alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north } ) } );
		await sleep( FLUSH_MS + 50 );
		// Bob is far away (a party has no range): 300 km.
		bob.send( { t: 's', s: carAt( 49.2, 8.4153 ) } );
		const toBob = await bob.take( 'S' );
		assert.deepEqual( toBob.s.map( entry => entry.slice( 0, 12 ) ), [ [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 30 } ) ] ] );
		// Alice's waited for Bob's word (FLUSH_MS and more); Bob's went at once.
		assert.ok( toBob.s[ 0 ][ 12 ] >= FLUSH_MS && toBob.s[ 0 ][ 12 ] < 5 * SECOND, `held ${ toBob.s[ 0 ][ 12 ] } ms` );
		const toAlice = await alice.take( 'S' );
		assert.deepEqual( toAlice.s, [ [ bob.pid, ...carAt( 49.2, 8.4153 ), 0 ] ] );
		assert.ok( toAlice.at - first.at >= FLUSH_MS );
		assert.deepEqual( ( await bob.drain( 200 ) ).filter( m => m.t === 'S' ), [] );

		// Both driving at 15 a second for a second and a half: the batches FLUSH_MS apart at least,
		// each car's latest in each, and nobody's own.
		const batches = { alice: [], bob: [] };
		for ( let i = 1; i <= 22; i ++ ) {

			alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 100 + i, speed: 20 } ) } );
			bob.send( { t: 's', s: carAt( 49.2, 8.4153, { north: i, speed: 20, flags: 128 | 2 } ) } );
			await sleep( 66 );

		}

		// The last of them goes with the next word after FLUSH_MS.
		await sleep( FLUSH_MS + 50 );
		alice.send( { t: 'trick', score: 10 } );
		await sleep( 200 );
		batches.alice = ( await alice.drain() ).filter( m => m.t === 'S' );
		batches.bob = ( await bob.drain() ).filter( m => m.t === 'S' );
		for ( const [ who, mine ] of [ [ 'alice', alice.pid ], [ 'bob', bob.pid ] ] ) {

			const list = batches[ who ];
			assert.ok( list.length >= 5 && list.length <= 16, `${ who } had ${ list.length }` );
			for ( let i = 1; i < list.length; i ++ ) assert.ok( list[ i ].at - list[ i - 1 ].at >= FLUSH_MS, `${ who }: ${ list[ i ].at - list[ i - 1 ].at } ms apart` );
			assert.ok( list.every( batch => batch.s.length === 1 && batch.s[ 0 ][ 0 ] !== mine ), `${ who } only had the other` );

		}

		assert.deepEqual( batches.bob.at( - 1 ).s[ 0 ].slice( 0, 12 ), [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 122, speed: 20 } ) ] );
		assert.deepEqual( batches.alice.at( - 1 ).s[ 0 ].slice( 0, 12 ), [ bob.pid, ...carAt( 49.2, 8.4153, { north: 22, speed: 20, flags: 128 | 2 } ) ] );
		// Each held, while both drive, for about as long as the gap between two of their messages
		// (the last may have waited for the trick).
		for ( const list of [ batches.alice, batches.bob ] ) {

			const ages = list.map( batch => batch.s[ 0 ][ 12 ] );
			assert.ok( ages.every( age => Number.isInteger( age ) && age >= 0 ) && ages.slice( 0, - 1 ).every( age => age < FLUSH_MS + 200 ), JSON.stringify( ages ) );

		}
		await Promise.all( [ alice.close(), bob.close() ] );

	} );

	test( 'alone in a room, a car\'s states go to nobody and aren\'t kept; its first after someone joins goes to them at once', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		// Connected, but no hello: not anyone yet.
		const lurker = await connect( server, room );
		for ( const north of [ 0, 10, 20 ] ) {

			alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north } ) } );
			await sleep( FLUSH_MS + 20 );

		}

		alice.send( { t: 'honk' } );
		await sleep( 200 );
		assert.deepEqual( [ ...await alice.drain(), ...await lurker.drain() ], [] );
		// Bob, joining, isn't shown where Alice was: no car until her page sends it.
		const bob = await join( server, room );
		assert.equal( bob.welcome.players[ 0 ].s, null );
		assert.ok( await alice.take( 'join' ) );
		// Bob's first, and Alice's first right after it (her page sends it as it hears the join):
		// each goes at once, with nothing after it to bring it.
		bob.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		assert.deepEqual( cars( [ await alice.take( 'S' ) ] ), { [ bob.pid ]: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 30 } ) } );
		const first = await bob.take( 'S', 1000 );
		assert.ok( first, 'Alice\'s first waited' );
		assert.deepEqual( cars( [ first ] ), { [ alice.pid ]: carAt( 46.5725, 8.4153, { north: 30 } ) } );
		// Bob goes: Alice is alone again, her last state forgotten, and what she sends goes nowhere.
		await bob.close();
		assert.ok( await alice.take( 'leave' ) );
		alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 40 } ) } );
		await sleep( 200 );
		assert.deepEqual( ( await alice.drain() ).filter( m => m.t === 'S' ), [] );
		const carol = await join( server, room );
		assert.equal( carol.welcome.players.find( p => p.pid === alice.pid ).s, null );
		assert.deepEqual( lurker.inbox, [] );
		await Promise.all( [ alice, lurker, carol ].map( page => page.close() ) );

	} );

	test( 'a state the batching held back goes with its car\'s next, if that came FLUSH_MS or more after it', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		const bob = await join( server, room );
		await alice.take( 'join' );
		alice.send( { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		assert.ok( await bob.take( 'S' ) );
		await sleep( FLUSH_MS + 50 );
		// Bob's first goes at once; Alice's next, just after that batch, is held back...
		bob.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		assert.ok( await alice.take( 'S' ) );
		alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 2, speed: 10 } ) } );
		assert.equal( await bob.take( 'S', FLUSH_MS ), null );
		// ... and goes with the one after it, a fifth of a second on as a page sends them: both, in
		// order.
		await sleep( 200 - FLUSH_MS );
		alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 3, speed: 10 } ) } );
		const both = await bob.take( 'S' );
		assert.deepEqual( both.s.map( entry => entry.slice( 0, 12 ) ), [
			[ alice.pid, ...carAt( 46.5725, 8.4153, { north: 2, speed: 10 } ) ],
			[ alice.pid, ...carAt( 46.5725, 8.4153, { north: 3, speed: 10 } ) ],
		] );
		assert.ok( both.s[ 0 ][ 12 ] >= FLUSH_MS && both.s[ 1 ][ 12 ] < FLUSH_MS, JSON.stringify( both.s.map( entry => entry[ 12 ] ) ) );
		await Promise.all( [ alice.close(), bob.close() ] );

	} );

	test( 'a state is rounded as packState rounds it, and one no car could be in is dropped, not passed on', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		const bob = await join( server, room );
		const p = ecef( 46.5725, 8.4153, 2430 );
		alice.send( { t: 's', s: [ p.x + 0.123456, p.y, p.z, 0.000049, 0, 0.7071067, 0.7071068, 12.3456, - 0.004, 0, 128 | 1 ] } );
		const sent = ( await bob.take( 'S' ) ).s[ 0 ];
		// (-0.004 rounds to -0, which JSON sends as 0.)
		assert.deepEqual( sent.slice( 4, 12 ), [ 0, 0, 0.7071, 0.7071, 12.35, 0, 0, 129 ] );
		assert.equal( sent[ 1 ], Math.round( ( p.x + 0.123456 ) * 100 ) / 100 );

		await sleep( FLUSH_MS + 20 );
		const good = carAt( 46.5725, 8.4153 );
		const nope = {
			'in orbit': [ p.x * 2, p.y * 2, p.z * 2, 0, 0, 0, 1, 0, 0, 0, 128 ],
			'at the Earth\'s centre': [ 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 128 ],
			'no turn at all': [ ...good.slice( 0, 3 ), 0, 0, 0, 0, 0, 0, 0, 128 ],
			'faster than anything': [ ...good.slice( 0, 7 ), 900, 0, 0, 128 ],
			'flags it hasn\'t': [ ...good.slice( 0, 10 ), 1 << 12 ],
			'flags not whole': [ ...good.slice( 0, 10 ), 1.5 ],
			'a NaN, as JSON sends it': [ ...good.slice( 0, 7 ), null, 0, 0, 128 ],
			'too short': good.slice( 0, 10 ),
			'not a list': { x: 1 },
		};
		for ( const s of Object.values( nope ) ) alice.send( { t: 's', s } );
		await sleep( FLUSH_MS + 20 );
		// Then a word from Bob: nothing of Alice's has moved, and she's still here.
		bob.send( { t: 'honk' } );
		assert.ok( await alice.take( 'honk' ) );
		assert.deepEqual( ( await bob.drain( 200 ) ).filter( m => m.t === 'S' ), [] );
		assert.equal( await alice.ended( 100 ), null );
		await Promise.all( [ alice.close(), bob.close() ] );

	} );

	test( 'in an area, a car only goes to those within VIEW_RANGE of it, and to everyone without a car yet', async () => {

		const room = cellOf( 46.5725, 8.4153 );
		assert.ok( VIEW_RANGE === 5000 );
		const [ alice, bob, carol, dave ] = [ await join( server, room ), await join( server, room ), await join( server, room ), await join( server, room ) ];
		// Bob 1 km north of Alice, Carol 8 km (7 from Bob), and Dave without a car (on the globe).
		const at = { alice: carAt( 46.5725, 8.4153 ), bob: carAt( 46.5725, 8.4153, { north: 1000 } ), carol: carAt( 46.5725, 8.4153, { north: 8000 } ) };
		alice.send( { t: 's', s: at.alice } );
		bob.send( { t: 's', s: at.bob } );
		carol.send( { t: 's', s: at.carol } );
		await sleep( FLUSH_MS + 50 );
		for ( const page of [ alice, bob, carol, dave ] ) await page.drain();
		// Everyone again, and once more after FLUSH_MS so the batch has gone with all three.
		alice.send( { t: 's', s: at.alice } );
		bob.send( { t: 's', s: at.bob } );
		carol.send( { t: 's', s: at.carol } );
		await sleep( FLUSH_MS + 50 );
		alice.send( { t: 's', s: at.alice } );
		await sleep( 300 );
		const got = {};
		for ( const [ name, page ] of Object.entries( { alice, bob, carol, dave } ) ) got[ name ] = Object.keys( cars( await page.drain() ) ).sort();
		assert.deepEqual( got, {
			alice: [ bob.pid ],
			bob: [ alice.pid ],
			carol: [],
			dave: [ alice.pid, bob.pid, carol.pid ].sort(),
		} );
		await Promise.all( [ alice, bob, carol, dave ].map( page => page.close() ) );

	} );

	test( 'look, place, away and tricks go to the others at once, and to whoever joins after', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		const bob = await join( server, room );
		await alice.take( 'join' );

		alice.send( { t: 'look', vehicle: 'muscle-car', look: { colour: 'blue', finish: 'matte', rim: 'spokes', flame: 'blue', trail: 'stars', smoke: 'white', number: 0, extra: 'dropped' } } );
		assert.deepEqual( await bob.take( 'look' ), { t: 'look', pid: alice.pid, vehicle: 'muscle-car', look: { colour: 'blue', finish: 'matte', rim: 'spokes', flame: 'blue', trail: 'stars', smoke: 'white', number: 0 } } );
		alice.send( { t: 'place', place: { name: 'Zürich <b>HB</b>', lat: 47.3781234567, lon: 8.540199, height: 408.04 } } );
		const place = { name: 'Zürich b HB /b', lat: 47.378123, lon: 8.540199, height: 408 };
		assert.deepEqual( await bob.take( 'place' ), { t: 'place', pid: alice.pid, place } );
		alice.send( { t: 'trick', score: 1200 } );
		assert.deepEqual( await bob.take( 'trick' ), { t: 'trick', pid: alice.pid, score: 1200 } );
		alice.send( { t: 's', s: carAt( 47.3781, 8.5402 ) } );
		assert.ok( await bob.take( 'S' ) );
		alice.send( { t: 'away' } );
		assert.deepEqual( await bob.take( 'away' ), { t: 'away', pid: alice.pid } );
		// Nothing of it back to Alice.
		assert.deepEqual( ( await alice.drain( 200 ) ).filter( m => m.pid === alice.pid ), [] );

		// Carol, joining now, sees Alice as she is: her ride and look, where she last was, and away
		// on the globe, with no car.
		const carol = await join( server, room );
		const seen = carol.welcome.players.find( p => p.pid === alice.pid );
		assert.deepEqual( seen, { pid: alice.pid, name: seen.name, star: false, level: null, title: null, vehicle: 'muscle-car', look: { colour: 'blue', finish: 'matte', rim: 'spokes', flame: 'blue', trail: 'stars', smoke: 'white', number: 0 }, place, away: true, s: null } );
		alice.send( { t: 'place', place: FURKA } );
		assert.deepEqual( ( await carol.take( 'place' ) ).place, FURKA );
		const later = await join( server, room );
		assert.equal( later.welcome.players.find( p => p.pid === alice.pid ).away, false );
		await Promise.all( [ alice, bob, carol, later ].map( page => page.close() ) );

	} );

	test( 'honks: one every HONK_GAP from each driver, the rest dropped; held to the rate as anything else is', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		const bob = await join( server, room );
		alice.send( { t: 'honk' } );
		assert.deepEqual( await bob.take( 'honk' ), { t: 'honk', pid: alice.pid } );
		// A few more at once: none of them get through, and Alice isn't closed for them.
		for ( let i = 0; i < 10; i ++ ) alice.send( { t: 'honk' } );
		await sleep( 200 );
		assert.equal( await bob.take( 'honk', 0 ), null );
		assert.equal( await alice.ended( 100 ), null );
		await sleep( HONK_GAP );
		alice.send( { t: 'honk' } );
		assert.ok( await bob.take( 'honk' ) );
		// But twice BURST at once is over the rate, honks or not.
		for ( let i = 0; i < 2 * BURST; i ++ ) alice.send( { t: 'honk' } );
		assert.deepEqual( await alice.ended(), { code: CLOSE.rate, reason: 'too many messages' } );
		assert.equal( ( await bob.take( 'leave' ) ).pid, alice.pid );
		await bob.close();

	} );

	test( 'a place whose name isn\'t text has no name, and nothing else changes', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		const bob = await join( server, room );
		for ( const name of [ { toString: 1 }, [ { toString: 0 } ], 7, null ] ) {

			alice.send( { t: 'place', place: { ...FURKA, name } } );
			assert.deepEqual( ( await bob.take( 'place' ) ).place, { ...FURKA, name: '' }, JSON.stringify( name ) );

		}

		// In a hello too.
		const carol = await join( server, room, { place: { ...FURKA, name: { toString: 1 } } } );
		assert.equal( ( await bob.take( 'join' ) ).player.place.name, '' );
		assert.deepEqual( await Promise.all( [ alice.ended( 100 ), bob.ended( 100 ), carol.ended( 100 ) ] ), [ null, null, null ] );
		await Promise.all( [ alice.close(), bob.close(), carol.close() ] );

	} );

	test( 'what doesn\'t check out closes the connection: a bad ride, look, place or trick', async () => {

		const room = partyRoom();
		const bad = [
			{ t: 'look', vehicle: 'tank', look: {} },
			{ t: 'look', vehicle: 'go-kart', look: { colour: 'Red Paint!' } },
			{ t: 'look', vehicle: 'go-kart', look: { number: 100 } },
			{ t: 'look', vehicle: 'go-kart' },
			{ t: 'place', place: { name: 'Nowhere', lat: 91, lon: 0, height: 0 } },
			{ t: 'place', place: null },
			{ t: 'trick', score: 0 },
			{ t: 'trick', score: 1.5 },
			{ t: 'trick', score: 1e8 },
		];
		const watcher = await join( server, room );
		for ( const message of bad ) {

			const page = await join( server, room );
			await watcher.take( 'join' );
			page.send( message );
			assert.deepEqual( await page.ended(), { code: CLOSE.protocol, reason: 'bad message' }, JSON.stringify( message ) );
			assert.deepEqual( await watcher.take( 'leave' ), { t: 'leave', pid: page.pid } );

		}

		// And in a hello: a ride that isn't one, a look or place that doesn't check out.
		for ( const hello of [ { vehicle: 'tank' }, { vehicle: undefined }, { look: null }, { look: { colour: 7 } }, { place: { name: 'x', lat: 0, lon: 200, height: 0 } } ] ) {

			const page = await connect( server, room );
			page.send( { ...HELLO, ...hello } );
			assert.deepEqual( await page.ended(), { code: CLOSE.protocol, reason: 'bad hello' }, JSON.stringify( hello ) );

		}

		assert.deepEqual( ( await watcher.drain( 100 ) ).filter( m => m.t === 'join' ), [] );
		await watcher.close();

	} );

	test( 'out of order or not the protocol\'s: closed with CLOSE.protocol', async () => {

		const room = partyRoom();
		const closes = async ( messages, { hello = false } = {} ) => {

			const page = hello ? await join( server, room ) : await connect( server, room );
			for ( const message of messages ) page.send( message );
			return ( await page.ended() )?.code;

		};
		assert.equal( await closes( [ { t: 's', s: carAt( 46.5725, 8.4153 ) } ] ), CLOSE.protocol, 'a state before hello' );
		assert.equal( await closes( [ { t: 'honk' } ] ), CLOSE.protocol, 'a honk before hello' );
		assert.equal( await closes( [ { ...HELLO }, { ...HELLO } ] ), CLOSE.protocol, 'two hellos at once' );
		assert.equal( await closes( [ { ...HELLO } ], { hello: true } ), CLOSE.protocol, 'a second hello' );
		assert.equal( await closes( [ new Uint8Array( [ 1, 2, 3 ] ) ], { hello: true } ), CLOSE.protocol, 'a binary frame' );
		assert.equal( await closes( [ '{"t":"honk"' ], { hello: true } ), CLOSE.protocol, 'not JSON' );
		assert.equal( await closes( [ 'honk' ], { hello: true } ), CLOSE.protocol, 'plain text' );
		assert.equal( await closes( [ [ 'honk' ] ], { hello: true } ), CLOSE.protocol, 'a list' );
		assert.equal( await closes( [ { type: 'honk' } ], { hello: true } ), CLOSE.protocol, 'no t' );
		assert.equal( await closes( [ { t: 'chat', text: 'hi' } ], { hello: true } ), CLOSE.protocol, 'a t it doesn\'t know' );
		assert.equal( await closes( [ { t: 'welcome' } ], { hello: true } ), CLOSE.protocol, 'the room\'s own' );

	} );

	test( 'messages longer than MAX_HELLO, then MAX_MESSAGE, in bytes as sent', async () => {

		const room = partyRoom();
		const padded = ( message, bytes, char = 'x' ) => {

			const base = JSON.stringify( { ...message, pad: '' } );
			const length = Buffer.byteLength( base );
			return JSON.stringify( { ...message, pad: char.repeat( Math.ceil( ( bytes - length ) / Buffer.byteLength( char ) ) ) } );

		};
		// A hello of MAX_HELLO bytes is fine; one more, or fewer characters taking more bytes, isn't.
		const fits = await connect( server, room );
		fits.send( padded( HELLO, MAX_HELLO ) );
		assert.ok( await fits.take( 'welcome' ) );
		const over = await connect( server, room );
		over.send( padded( HELLO, MAX_HELLO + 1 ) );
		assert.deepEqual( await over.ended(), { code: CLOSE.protocol, reason: 'too long' } );
		const wide = await connect( server, room );
		const euros = padded( HELLO, MAX_HELLO + 1, '€' );
		assert.ok( euros.length <= MAX_HELLO && Buffer.byteLength( euros ) > MAX_HELLO );
		wide.send( euros );
		assert.equal( ( await wide.ended() ).code, CLOSE.protocol );

		// After hello, MAX_MESSAGE.
		fits.send( padded( { t: 'honk' }, MAX_MESSAGE ) );
		assert.equal( await fits.ended( 200 ), null );
		fits.send( padded( { t: 'trick', score: 10 }, MAX_MESSAGE + 1 ) );
		assert.deepEqual( await fits.ended(), { code: CLOSE.protocol, reason: 'too long' } );

	} );

	test( 'more than BURST at once, or RATE a second for long, closes with CLOSE.rate', async () => {

		const room = partyRoom();
		const watcher = await join( server, room );
		const page = await join( server, room );
		await watcher.take( 'join' );
		// The hello was one: BURST - 1 more at once are fine, a few more than that aren't.
		const fine = await join( server, room );
		for ( let i = 0; i < BURST - 1; i ++ ) fine.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: i } ) } );
		assert.equal( await fine.ended( 300 ), null );
		for ( let i = 0; i < BURST + 5; i ++ ) page.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: i } ) } );
		assert.deepEqual( await page.ended(), { code: CLOSE.rate, reason: 'too many messages' } );
		assert.equal( ( await watcher.take( 'leave' ) ).pid, page.pid );

		// SEND_HZ and a little over, for a few seconds, is nowhere near it.
		const steady = await join( server, room );
		for ( let i = 0; i < 40; i ++ ) {

			steady.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: i } ) } );
			await sleep( 70 );

		}

		assert.equal( await steady.ended( 100 ), null );
		await Promise.all( [ watcher.close(), fine.close(), steady.close() ] );

	} );

	test( 'keepalives are answered by the room, before hello too, and held to the rate as anything else is', async () => {

		const page = await connect( server, partyRoom() );
		page.send( PING );
		assert.equal( await page.take( PONG ), PONG );
		page.send( HELLO );
		assert.ok( await page.take( 'welcome' ) );
		page.send( PING );
		assert.equal( await page.take( PONG ), PONG );
		// Many more than the rate allows, as a keepalive is a message billed as any other is.
		for ( let i = 0; i < 3 * BURST; i ++ ) page.send( PING );
		assert.deepEqual( await page.ended(), { code: CLOSE.rate, reason: 'too many messages' } );
		assert.ok( ( await page.drain() ).filter( m => m === PONG ).length < BURST );

	} );

	test( 'a party takes PARTY_MAX: the next is told it\'s full and closed with CLOSE.full', async () => {

		const room = partyRoom();
		const tokens = await Promise.all( Array.from( { length: PARTY_MAX }, () => visitToken() ) );
		const pages = [];
		for ( const token of tokens ) pages.push( await join( server, room, {}, { token } ) );
		assert.equal( pages.at( - 1 ).welcome.players.length, PARTY_MAX - 1 );
		await sleep( 200 );
		for ( const page of pages ) await page.drain();

		const ninth = await connect( server, room );
		assert.deepEqual( await ninth.take( 'full' ), { t: 'full', room, max: PARTY_MAX } );
		assert.deepEqual( await ninth.ended(), { code: CLOSE.full, reason: 'full' } );
		// A page that hasn't said hello holds its place too.
		await pages[ 0 ].close();
		const waiting = await connect( server, room );
		const tenth = await connect( server, room );
		assert.equal( ( await tenth.ended() ).code, CLOSE.full );
		// One of the eight connecting again isn't one more: it takes its own place.
		const again = await join( server, room, {}, { token: tokens[ 1 ] } );
		assert.equal( ( await pages[ 1 ].ended() ).code, CLOSE.replaced );
		assert.equal( again.welcome.players.length, PARTY_MAX - 2 );
		// Nobody heard of the ones turned away.
		const heard = ( await pages[ 2 ].drain( 200 ) ).map( m => m.t );
		assert.deepEqual( heard, [ 'leave', 'leave', 'join' ] );
		await Promise.all( [ ...pages.slice( 2 ), waiting, again ].map( page => page.close() ) );

	} );

	test( 'an area takes NEARBY_MAX (LIVE_NEARBY_MAX here), then its shards each as many; #0 is the area itself', async () => {

		// Zürich's area (the one in Furka Pass's is the test above's), and the same written otherwise.
		const area = cellOf( 47.3781, 8.5402 );
		const [ , band, col ] = area.match( /^near:(\d+)\.(\d+)$/ );
		const first = await join( server, `near:${ band }.0${ col }#0` );
		assert.deepEqual( [ first.welcome.room, first.welcome.max ], [ area, NEARBY_MAX ] );
		const pages = [ first ];
		for ( let i = 1; i < NEARBY_MAX; i ++ ) pages.push( await join( server, area ) );
		assert.equal( pages.at( - 1 ).welcome.players.length, NEARBY_MAX - 1 );
		const turned = await connect( server, area );
		assert.deepEqual( await turned.take( 'full' ), { t: 'full', room: area, max: NEARBY_MAX } );
		assert.equal( ( await turned.ended() ).code, CLOSE.full );
		assert.equal( ( await connect( server, shardOf( area, 0 ) ).then( page => page.ended() ) ).code, CLOSE.full );

		const next = await join( server, shardOf( area, 1 ) );
		assert.deepEqual( [ next.welcome.room, next.welcome.max, next.welcome.players ], [ `${ area }#1`, NEARBY_MAX, [] ] );
		await Promise.all( [ ...pages, next ].map( page => page.close() ) );

	} );

	test( 'the same visit connecting again closes the last with CLOSE.replaced, and the others see it leave and come back as the same guest', async () => {

		const room = partyRoom();
		const watcher = await join( server, room );
		const token = await visitToken();
		const tab = await join( server, room, {}, { token } );
		await watcher.take( 'join' );
		const again = await join( server, room, { vehicle: 'pickup-truck' }, { token } );
		assert.deepEqual( await tab.ended(), { code: CLOSE.replaced, reason: 'replaced' } );
		assert.deepEqual( again.welcome.players.map( p => p.pid ), [ watcher.pid ] );
		assert.deepEqual( await watcher.take( 'leave' ), { t: 'leave', pid: tab.pid } );
		const back = ( await watcher.take( 'join' ) ).player;
		assert.equal( back.vehicle, 'pickup-truck' );
		// A guest's name is its visit's: the same each time it connects (another visit's is its own).
		assert.match( tab.welcome.name, /^Guest \d{4}$/ );
		assert.deepEqual( [ again.welcome.name, back.name ], [ tab.welcome.name, tab.welcome.name ] );
		// The same visit in another room: it's there now, so this room lets go of it at once.
		const elsewhere = await join( server, partyRoom(), {}, { token } );
		assert.deepEqual( await again.ended(), { code: CLOSE.replaced, reason: 'replaced' } );
		assert.deepEqual( await watcher.take( 'leave' ), { t: 'leave', pid: again.pid } );
		assert.equal( elsewhere.welcome.name, tab.welcome.name );
		assert.equal( await elsewhere.ended( 300 ), null );
		await Promise.all( [ watcher, elsewhere ].map( page => page.close() ) );

	} );

	test( 'one visit connecting over and over: past 20 a minute, turned away (429) before the room or DriveLimits', async () => {

		// (Cloudflare's rate limiter counts by the minute: the first 20 always get in, and with 21 more
		// the next minute's are used up too.)
		const room = partyRoom();
		const token = await visitToken();
		const outcomes = [];
		while ( outcomes.length < 41 && outcomes.at( - 1 ) !== 429 ) {

			const page = await connect( server, room, { token } );
			outcomes.push( page instanceof Page ? 'in' : page.status );
			if ( page instanceof Page ) page.ws.terminate();

		}

		assert.deepEqual( outcomes.slice( 0, 20 ), Array( 20 ).fill( 'in' ) );
		assert.equal( outcomes.at( - 1 ), 429, JSON.stringify( outcomes ) );
		// Another visit's are its own.
		const other = await join( server, room );
		await other.close();

	} );

	test( 'a connection the room has closed that goes on sending, its close unanswered: the room resets, and everyone comes back in', async () => {

		const room = partyRoom();
		const honest = await join( server, room );
		const zombie = await rawSocket( server, room, await visitToken() );
		zombie.send( JSON.stringify( HELLO ) );
		assert.ok( await honest.take( 'join' ) );
		// Over the rate: the room closes it, and it doesn't stop.
		for ( let i = 0; i < 2 * BURST; i ++ ) zombie.send( JSON.stringify( { t: 'trick', score: 1 } ) );
		const deadline = Date.now() + 5000;
		while ( ! zombie.closeFrame && Date.now() < deadline ) await sleep( 20 );
		assert.equal( zombie.closeFrame?.code, CLOSE.rate );
		for ( let i = 0; i < 4 * BURST && ! zombie.closed; i ++ ) {

			zombie.send( JSON.stringify( { t: 'honk' } ) );
			await sleep( 5 );

		}

		while ( ! zombie.closed && Date.now() < deadline + 5000 ) await sleep( 20 );
		assert.ok( zombie.closed, 'the room never let go of it' );
		console.log( `    the zombie cut off ${ zombie.closedAt - zombie.closeFrame.at } ms after its close` );
		// Everyone else's connection dropped with the room, and they come straight back.
		assert.equal( ( await honest.ended() )?.code, 1006 );
		const again = await join( server, room );
		assert.deepEqual( again.welcome.players, [] );
		await again.close();

	} );

	test( 'a visit that runs out is closed with CLOSE.expired, by the room\'s alarm as it does', async () => {

		// (As it next says anything, too: that's the test of the room here below, as the alarm here
		// is set for the visit's end and always comes first.)
		assert.deepEqual( await expiring.ended( Math.max( 0, expiringAt - Date.now() ) + 3 * SECOND ), { code: CLOSE.expired, reason: 'expired' } );
		assert.ok( expiring.closedAt >= expiringAt && expiring.closedAt < expiringAt + 2 * SECOND, `${ expiring.closedAt - expiringAt } ms after` );

	} );

	test( 'no hello within HELLO_MS: closed with CLOSE.hello', async () => {

		const closed = await silent.ended( Math.max( 0, silentAt + HELLO_MS - Date.now() ) + 3 * SECOND );
		assert.deepEqual( closed, { code: CLOSE.hello, reason: 'no hello' } );
		const after = silent.closedAt - silentAt;
		assert.ok( after >= HELLO_MS - 200 && after < HELLO_MS + 2 * SECOND, `${ after } ms after` );

	} );

	test( 'a room that has hibernated carries on from where it was, its keepalives answered', async () => {

		// wrangler dev hibernates a room as Cloudflare does, 10 s after its last event: here the
		// alarm for the hello deadline, HELLO_MS after they connected. (Only the room's being as it
		// was can be seen from here, not whether it slept.)
		const { room, alice, bob } = sleepers;
		await sleep( Math.max( 0, sleepers.at + 2 * HELLO_MS + SECOND - Date.now() ) );
		alice.send( PING );
		assert.equal( await alice.take( PONG ), PONG );
		const carol = await join( server, room );
		const seen = Object.fromEntries( carol.welcome.players.map( p => [ p.pid, p ] ) );
		assert.deepEqual( Object.keys( seen ).sort(), [ alice.pid, bob.pid ].sort() );
		assert.deepEqual( [ seen[ alice.pid ].vehicle, seen[ alice.pid ].look, seen[ alice.pid ].s ], [ 'city-bus', { colour: 'yellow' }, carAt( 46.5725, 8.4153 ) ] );
		assert.equal( seen[ bob.pid ].vehicle, 'hovercraft' );
		assert.ok( await alice.take( 'join' ) && await bob.take( 'join' ) );
		bob.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: 50 } ) } );
		for ( const page of [ alice, carol ] ) assert.deepEqual( cars( [ await page.take( 'S' ) ] ), { [ bob.pid ]: carAt( 46.5725, 8.4153, { north: 50 } ) } );
		await carol.close();
		assert.deepEqual( await alice.take( 'leave' ), { t: 'leave', pid: carol.pid } );

	} );

} );

// --- the day's budget, in wrangler dev ---------------------------------------------------

describe( 'Driving with others\' daily budget', () => {

	// A Worker with a budget of BUDGET billed requests a day, and the tests' clock (TEST_CLOCK): a
	// request may say what time it is in X-Test-Time.
	const BUDGET = 30;
	// And the Moon's, its own.
	const MOON_BUDGET = 60;
	let tight;
	// Two drivers in a room from the start, one of them driving (so the room has enough to report
	// each minute), there when the day's budget runs out at the real time.
	let waiting;
	const at = time => ( { 'X-Test-Time': String( time ) } );
	const config = async ( time = null ) => ( await fetch( `${ tight.base }/api/config`, { headers: time ? at( time ) : {} } ) ).json();
	// /api/config asks DriveLimits at most once every 30 s in a Worker instance (an open answer is
	// kept that long from when it was given), so an ask is made counted here at a time of its own:
	// each a millisecond before the last, from a minute before the real time of the first (which is
	// on the same UTC day but in a minute after midnight).
	let asked = 0;
	let base = null;
	const ask = async () => config( ( base ??= Date.now() - MINUTE ) - ++ asked );

	before( async () => {

		tight = await startWorker( {
			port: PORT + 2,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_CLIENT_ID: '', GOOGLE_MAPS_API_KEY: 'test-maps-key-not-real', TURNSTILE_SECRET: PASS_SECRET, TEST_CLOCK: 'header', LIVE_DAILY_BUDGET: String( BUDGET ),
				LIVE_MOON_DAILY_BUDGET: String( MOON_BUDGET ), LIVE_VISIT_CONNECTS: '3', LIVE_ADDRESS_VISITS: '2',
				// (Each address's share the whole of a budget, as every connection here is from one: its
				// share is tested on its own, with the room and DriveLimits here.)
				LIVE_ADDRESS_SHARE: '1',
			},
		} );
		const room = partyRoom();
		waiting = { at: Date.now(), alice: await join( tight, room ), bob: await join( tight, room ) };
		let north = 0;
		waiting.driving = setInterval( () => waiting.alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: north ++, speed: 5 } ) } ), 250 );

	} );

	after( () => {

		clearInterval( waiting?.driving );
		for ( const page of [ waiting?.alice, waiting?.bob ] ) page?.ws.terminate();
		tight?.stop();

	} );

	test( 'a room adds what it spent to the day\'s as it empties', async () => {

		// Today, by the real clock: asked once as the Worker started, once for each of the two
		// waiting, and once each for these two.
		const room = partyRoom();
		const alice = await join( tight, room );
		const bob = await join( tight, room );
		for ( let i = 0; i < 18; i ++ ) alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north: i } ) } );
		await sleep( 300 );
		await Promise.all( [ alice.close(), bob.close() ] );
		await sleep( 500 );
		// Reported: two connections, 20 messages and the report itself: 4. So 5 asks and 4 make 9 (and
		// the waiting room's few states so far, not reported yet), and the 21st ask from here spends
		// the budget (without the report it would be the 25th).
		let opens = 0;
		while ( opens <= BUDGET && ( await ask() ).live ) opens ++;
		assert.equal( opens, BUDGET - 10, `${ opens } asks were open` );

	} );

	test( 'a room hearing the day\'s budget is spent closes everyone in it with CLOSE.off and BUDGET_SPENT', async () => {

		// At its first report, REPORT_MS after the first of them connected: Alice driving, there's more
		// than enough to report by then.
		const { alice, bob } = waiting;
		const wait = Math.max( 0, waiting.at + REPORT_MS - Date.now() ) + 5 * SECOND;
		const closed = await Promise.all( [ alice.ended( wait ), bob.ended( wait ) ] );
		assert.deepEqual( closed, [ { code: CLOSE.off, reason: BUDGET_SPENT }, { code: CLOSE.off, reason: BUDGET_SPENT } ] );
		assert.ok( alice.closedAt - waiting.at >= REPORT_MS - SECOND, `${ alice.closedAt - waiting.at } ms in` );
		// And the door's shut until midnight, and the globe shows nobody driving.
		assert.equal( ( await connect( tight, partyRoom() ) ).status, 503 );
		assert.deepEqual( ( ( { live, liveReason } ) => ( { live, liveReason } ) )( await config() ), { live: false, liveReason: BUDGET_SPENT } );
		// (Off on the Earth: but how many are on the Moon, whose budget is its own: nobody yet; and on
		// every world, the Earth's off, from the Moon's answer.)
		const W = on => ( { on, total: 0 } );
		assert.deepEqual( await online( tight, Date.now() ), { on: false, total: 0, areas: [], moon: 0, worlds: { earth: W( false ), moon: W( true ), mars: W( true ), vesta: W( true ), ceres: W( true ) } } );

	} );

	test( 'the Earth\'s budget spent, the Moon\'s rooms are open all the same (their budget is their own): /api/config says so, a Moon area and a party on the Moon let in, a party on the Earth not; the Moon\'s dots asked for', async () => {

		// (After the test before: today's Earth budget is spent, by the real clock.)
		const said = await config();
		assert.deepEqual( [ said.live, said.liveReason, said.liveMoon ], [ false, BUDGET_SPENT, true ] );
		const ann = await join( tight, TYCHO_AREA, { place: TYCHO }, { worlds: true } );
		assert.equal( ann.welcome.room, TYCHO_AREA );
		const room = partyRoom();
		const una = await join( tight, room, { place: TYCHO }, { worlds: true, world: 'moon' } );
		const turned = await connect( tight, room, { worlds: true } );
		assert.equal( turned.status, 503 );
		assert.equal( JSON.parse( turned.body ).reason, BUDGET_SPENT );
		// Let in on the Moon, a page (or a script) can't drive on the Earth all the same: a hello at the
		// Furka Pass closes it at once (not at the room's next report, a minute on), and Una never
		// hears of it; nor can Una go there.
		const sly = await connect( tight, room, { worlds: true, world: 'moon' } );
		assert.ok( sly instanceof Page, JSON.stringify( sly ) );
		sly.send( HELLO );
		assert.deepEqual( await sly.ended( 5 * SECOND ), { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.equal( await sly.take( 'welcome', 0 ), null );
		const vic = await join( tight, room, { place: TYCHO }, { worlds: true, world: 'moon' } );
		assert.equal( ( await una.take( 'join' ) ).player.pid, vic.pid );
		vic.send( { t: 'place', place: FURKA } );
		assert.deepEqual( await vic.ended( 5 * SECOND ), { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.equal( ( await una.take( 'leave' ) ).pid, vic.pid );
		assert.equal( una.inbox.some( m => m?.t === 'place' ), false );
		const moon = await ( await fetch( `${ tight.base }/api/online?world=moon` ) ).json();
		assert.deepEqual( [ moon.on, moon.total, moon.earth ], [ true, 0, 0 ] );
		assert.equal( ( await ( await fetch( `${ tight.base }/api/online` ) ).json() ).on, false );
		await Promise.all( [ ann.close(), una.close() ] );

	} );

	test( 'each ask counts against the day\'s budget; spent, /api/config says so and /api/live turns away with 503; at midnight UTC, a fresh day', async () => {

		// A day of its own, years on (the tests' clock). Last of these, as a new day forgets those before
		// it, today's included. BUDGET - 1 asks are open, and the next spends it; within 30 s of an open
		// answer, /api/config takes that and doesn't ask.
		const day = Date.UTC( 2031, 0, 15 );
		let opens = 0;
		while ( opens <= BUDGET && ( await config( day + 12 * HOUR + opens * MINUTE ) ).live ) {

			opens ++;
			if ( opens === 1 ) for ( let i = 0; i < 5; i ++ ) assert.equal( ( await config( day + 12 * HOUR + 1 + i * 5 * SECOND ) ).live, true );

		}

		assert.equal( opens, BUDGET - 1 );
		const spent = await config( day + 23 * HOUR );
		assert.deepEqual( [ spent.live, spent.liveReason ], [ false, BUDGET_SPENT ] );
		const turned = await connect( tight, partyRoom(), { token: await visitToken( day + 23 * HOUR ), headers: at( day + 23 * HOUR ) } );
		assert.equal( turned.status, 503 );
		assert.deepEqual( JSON.parse( turned.body ), { error: 'Lots of drivers today: driving with others is back after midnight UTC', reason: BUDGET_SPENT } );
		// To the last millisecond of that day; then midnight, and it's open, a connection getting in.
		assert.equal( ( await config( day + DAY - 1 ) ).live, false );
		const next = await config( day + DAY );
		assert.deepEqual( [ next.live, next.liveReason ], [ true, undefined ] );
		const page = await join( tight, partyRoom(), {}, { token: await visitToken( day + DAY ), headers: at( day + DAY ) } );
		assert.deepEqual( page.welcome.players, [] );
		await page.close();

	} );

	test( 'a visit connects at most LIVE_VISIT_CONNECTS times a day (3 here), then it\'s turned away (429)', async () => {

		// That fresh day, an hour on.
		const time = Date.UTC( 2031, 0, 16, 1 );
		const token = await visitToken( time );
		const room = partyRoom();
		for ( let i = 0; i < 3; i ++ ) {

			const page = await join( tight, room, {}, { token, headers: at( time ) } );
			page.ws.terminate();

		}

		for ( let i = 0; i < 2; i ++ ) assert.equal( ( await connect( tight, room, { token, headers: at( time ) } ) ).status, 429 );
		// Another visit's are its own.
		const other = await join( tight, room, {}, { token: await visitToken( time ), headers: at( time ) } );
		await other.close();

	} );

	test( 'visits not counted against the Earth\'s caps (the Moon\'s) connect from one address at most LIVE_ADDRESS_VISITS a day (2 here); the Earth\'s, the owner\'s and another address\'s aren\'t held to it; nothing of the address or the visit is kept', async () => {

		// That fresh day, two hours on.
		const time = Date.UTC( 2031, 0, 16, 2 );
		const from = ip => ( { 'CF-Connecting-IP': ip, ...at( time ) } );
		const moonVisit = kind => makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, time, kind );
		const [ first, second, third ] = [ await moonVisit( 'moon' ), await moonVisit( 'moon' ), await moonVisit( 'moon' ) ];
		const pages = [];
		for ( const token of [ first, second, first ] ) pages.push( await join( tight, TYCHO_AREA, { place: TYCHO }, { token, worlds: true, headers: from( '198.51.100.200' ) } ) );
		const refused = await connect( tight, TYCHO_AREA, { token: third, worlds: true, headers: from( '198.51.100.200' ) } );
		assert.equal( refused.status, 429 );
		assert.equal( JSON.parse( refused.body ).error, 'Too many drivers from here today' );
		// An IPv6 address in the same /48 is the same address.
		for ( const ip of [ '2001:db8:1:2::1', '2001:db8:1:3::1' ] ) pages.push( await join( tight, TYCHO_AREA, { place: TYCHO }, { token: await moonVisit( 'moon' ), worlds: true, headers: from( ip ) } ) );
		assert.equal( ( await connect( tight, TYCHO_AREA, { token: await moonVisit( 'moon' ), worlds: true, headers: from( '2001:db8:1:ffff::9' ) } ) ).status, 429 );
		// The Earth's visits (counted by their caps), and the owner's, from that address: let in.
		for ( const kind of [ 'earth', 'owner' ] ) pages.push( await join( tight, TYCHO_AREA, { place: TYCHO }, { token: await moonVisit( kind ), worlds: true, headers: from( '198.51.100.200' ) } ) );
		// Another address: its own.
		pages.push( await join( tight, TYCHO_AREA, { place: TYCHO }, { token: await moonVisit( 'moon' ), worlds: true, headers: from( '198.51.100.201' ) } ) );
		for ( const page of pages ) page.ws.terminate();

	} );

} );

// --- the room, here --------------------------------------------------------------------

// What wrangler dev can't show quickly: IDLE_MS is over a minute, and hibernation is the runtime's
// to decide. So DriveRoom runs here too, on a stand-in for its runtime: WebSockets that keep what
// they're sent and their attachment (structured-cloned, as Cloudflare does), an alarm, and a clock
// the test moves. 'cloudflare:workers' is stood in for as test-drive-worker.mjs does.

class FakeSocket {

	constructor() {

		this.readyState = WebSocket.OPEN;
		this.sent = [];
		this.pongs = 0;
		this.attachment = null;
		this.closedWith = null;

	}

	// (Keepalives' answers counted, not kept with the rest.)
	send( text ) {

		if ( this.readyState !== WebSocket.OPEN ) throw new Error( 'closed' );
		if ( text === PONG ) this.pongs ++;
		else this.sent.push( text );

	}

	close( code, reason ) {

		this.readyState = WebSocket.CLOSED;
		this.closedWith = { code, reason };

	}

	serializeAttachment( value ) {

		this.attachment = structuredClone( value );

	}

	deserializeAttachment() {

		return structuredClone( this.attachment );

	}

	// What it's been sent since this was last asked, JSON parsed.
	said() {

		return this.sent.splice( 0 ).map( text => JSON.parse( text ) );

	}

}

describe( 'A room, here on a stand-in for the runtime', () => {

	let DriveRoom;
	let live;
	let clock = Date.UTC( 2026, 10, 1, 12 );
	const realNow = Date.now;
	const RealResponse = globalThis.Response;
	const timers = { set: 0 };
	const realSetTimeout = globalThis.setTimeout;
	const realSetInterval = globalThis.setInterval;

	before( async () => {

		standInForCloudflare();
		( { DriveRoom, live } = await import( '../worker/drive/live.js' ) );
		globalThis.WebSocketPair = class {

			constructor() {

				this[ 0 ] = new FakeSocket();
				this[ 1 ] = new FakeSocket();

			}

		};
		Date.now = () => clock;
		// The room must never leave a timer behind: one would keep it from hibernating.
		globalThis.setTimeout = ( ...args ) => {

			timers.set ++;
			return realSetTimeout( ...args );

		};
		globalThis.setInterval = ( ...args ) => {

			timers.set ++;
			return realSetInterval( ...args );

		};

	} );

	after( () => {

		Date.now = realNow;
		globalThis.setTimeout = realSetTimeout;
		globalThis.setInterval = realSetInterval;
		delete globalThis.WebSocketPair;

	} );

	// The runtime's side of one room: its WebSockets, its alarm (and how many times it has gone off),
	// whether its storage was emptied, and why it was reset (abort), if it was: every connection to
	// it drops then.
	function runtime() {

		const ctx = {
			sockets: [],
			alarm: null,
			fired: 0,
			emptied: 0,
			aborted: null,
			acceptWebSocket( ws ) {

				this.sockets.push( ws );

			},
			getWebSockets() {

				return this.sockets.filter( ws => ws.readyState !== WebSocket.CLOSED );

			},
			abort( reason ) {

				this.aborted = reason;
				for ( const ws of this.sockets ) ws.readyState = WebSocket.CLOSED;

			},
			storage: {
				getAlarm: async () => ctx.alarm,
				setAlarm: async at => {

					ctx.alarm = at;

				},
				deleteAlarm: async () => {

					ctx.alarm = null;

				},
				deleteAll: async () => {

					ctx.emptied ++;

				},
			},
		};
		return ctx;

	}

	let visits = 0;
	// A connection as /api/live hands it to `room` (checked there), numbered `seq` among its visit's:
	// the room's end of it.
	async function arrive( room, ctx, { visit = `visit-${ ++ visits }`, expires = clock + 6 * HOUR, name = 'party:ABCDEFG', seq = 1, version = null, world = null, closed = null, from = null, uncounted = false, over = null } = {} ) {

		const headers = new Headers( {
			Upgrade: 'websocket', 'X-Live-Visit': visit, 'X-Live-Expires': String( expires ), 'X-Live-Room': name, 'X-Live-Seq': String( seq ),
			...( version ? { 'X-Live-Version': String( version ) } : {} ), ...( world ? { 'X-Live-World': world } : {} ), ...( closed ? { 'X-Live-Closed': closed } : {} ),
			...( from ? { 'X-Live-From': from } : {} ), ...( uncounted ? { 'X-Live-Uncounted': '1' } : {} ), ...( over ? { 'X-Live-Over': over } : {} ),
		} );
		// Node's Response doesn't take a 101.
		globalThis.Response = class {

			constructor( body, init ) {

				Object.assign( this, init );

			}

		};
		try {

			const res = await room.fetch( { headers } );
			assert.equal( res.status, 101 );
			assert.equal( res.headers[ 'Sec-WebSocket-Protocol' ], version === 3 ? PROTOCOL_ALL : version === 2 ? PROTOCOL_WORLDS : PROTOCOL );

		} finally {

			globalThis.Response = RealResponse;

		}

		return ctx.sockets.at( - 1 );

	}

	async function hello( room, ctx, options, extra = {} ) {

		const ws = await arrive( room, ctx, options );
		await room.webSocketMessage( ws, JSON.stringify( { ...HELLO, ...extra } ) );
		const [ welcome ] = ws.said();
		assert.equal( welcome.t, 'welcome' );
		ws.pid = welcome.you;
		ws.welcome = welcome;
		return ws;

	}

	// The clock `ms` on, with the alarm run whenever it's due, as the runtime runs it.
	async function wait( room, ctx, ms ) {

		const until = clock + ms;
		while ( ctx.alarm !== null && ctx.alarm <= until ) {

			clock = Math.max( clock, ctx.alarm );
			ctx.alarm = null;
			ctx.fired ++;
			await room.alarm();

		}

		clock = until;

	}

	const say = ( room, ws, message ) => room.webSocketMessage( ws, typeof message === 'string' ? message : JSON.stringify( message ) );
	// A page's keepalive, as it sends one.
	const ping = ( room, ws ) => say( room, ws, PING );
	// A page driving for `ms` with someone to see it (its car SEND_HZ times a second, at Furka, or as
	// `where` says for each step) and the pages `others` sending only their keepalive every
	// KEEPALIVE_MS, the clock (and the alarm) going on with them, until the room closes them: how many
	// messages they sent.
	async function drive( room, ctx, ws, ms, others = [], where = step => carAt( 46.5725, 8.4153, { north: step, speed: 10 } ) ) {

		const until = clock + ms;
		let sent = 0;
		for ( let step = 1; clock + 1000 / SEND_HZ <= until; step ++ ) {

			await wait( room, ctx, 1000 / SEND_HZ );
			if ( ws.closedWith ) break;
			await say( room, ws, { t: 's', s: where( step ) } );
			sent ++;
			if ( step % ( KEEPALIVE_MS * SEND_HZ / 1000 ) ) continue;
			for ( const other of others ) {

				await ping( room, other );
				sent ++;

			}

		}

		await wait( room, ctx, Math.max( 0, until - clock ) );
		return sent;

	}

	// The Worker asking a room to let go of a visit gone to another room, its connection there `seq`.
	const leaveFor = ( room, visit, seq ) => room.fetch( { headers: new Headers( { 'X-Live-Leave': visit, 'X-Live-Seq': String( seq ) } ) } );

	// DriveLimits as a room reaches it (env.LIMITS): each report it's sent (with an area's room's
	// dots, online), kept; open, or not, or failing, as the test says.
	function limitsStub() {

		// (Every world's amounts and budgets, and the floor, as a room since the far worlds says them,
		// are kept apart in `full`; `worlds`, if set, the far worlds' { open } it answers.)
		const stub = { reports: [], full: [], open: true, moonOpen: true, worlds: null, fail: false, over: null };
		stub.binding = {
			idFromName: name => name,
			get: () => ( {
				liveSpent: async ( amount, { now, budget, moon = 0, moonBudget, online, addresses, share, amounts, budgets, floor } ) => {

					if ( stub.fail ) throw new Error( 'DriveLimits is down' );
					stub.reports.push( { amount, now, budget, moon, moonBudget, ...( online ? { online: structuredClone( online ) } : {} ), ...( addresses ? { addresses: structuredClone( addresses ), share } : {} ) } );
					stub.full.push( { amounts: structuredClone( amounts ), budgets: structuredClone( budgets ), floor, ...( online ? { online: structuredClone( online ) } : {} ), ...( addresses ? { addresses: structuredClone( addresses ) } : {} ) } );
					return { open: stub.open, spent: 0, moon: { open: stub.moonOpen, spent: 0 }, ...( stub.worlds ? { worlds: structuredClone( stub.worlds ) } : {} ), ...( stub.over ? { over: stub.over } : {} ) };

				},
			} ),
		};
		return stub;

	}

	// The page closing `ws`, as the runtime hands that to the room.
	async function leave( room, ws ) {

		ws.readyState = WebSocket.CLOSED;
		await room.webSocketClose( ws, 1000, '', true );

	}

	const total = reports => reports.reduce( ( sum, report ) => sum + report.amount, 0 );

	test( 'keepalives: PING answered with PONG by the room, before hello too, and held to the rate as anything else is', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const ws = await arrive( room, ctx );
		await ping( room, ws );
		assert.equal( ws.pongs, 1 );
		await say( room, ws, HELLO );
		assert.equal( ws.said()[ 0 ].t, 'welcome' );
		// With the two so far, BURST at once is over the rate.
		for ( let i = 0; i < BURST && ! ws.closedWith; i ++ ) await ping( room, ws );
		assert.deepEqual( ws.closedWith, { code: CLOSE.rate, reason: 'too many messages' } );
		assert.equal( ws.pongs, BURST - 1 );

	} );

	test( 'a batch waits for FLUSH_MS and goes with the next message after; so does the alarm', async () => {

		const set = timers.set;
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		alice.said();
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		assert.deepEqual( bob.said(), [ { t: 'S', at: clock, s: [ [ alice.pid, ...carAt( 46.5725, 8.4153 ), 0 ] ] } ] );
		clock += 30;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 1 } ) } );
		clock += 30;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 2 } ) } );
		assert.deepEqual( bob.said(), [] );
		clock += FLUSH_MS - 60;
		await say( room, bob, { t: 'honk' } );
		// Alice's latest, held since it came in FLUSH_MS - 60 ms ago.
		assert.deepEqual( bob.said(), [ { t: 'S', at: clock, s: [ [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 2 } ), FLUSH_MS - 60 ] ] } ] );
		assert.deepEqual( alice.said(), [ { t: 'honk', pid: bob.pid } ] );

		// One more, and then nothing from anyone: the alarm takes it.
		clock += 10;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 3 } ) } );
		assert.deepEqual( bob.said(), [] );
		await wait( room, ctx, IDLE_MS - 1000 );
		assert.deepEqual( cars( bob.said() ), { [ alice.pid ]: carAt( 46.5725, 8.4153, { north: 3 } ) } );
		assert.equal( timers.set, set, 'no timers' );

	} );

	test( 'idle: no word for IDLE_MS closes a connection, and a keepalive answered for it is a word', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const start = clock;
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		alice.said();
		// Alice only pings, every KEEPALIVE_MS, as an away page does; Bob says nothing at all.
		let pinged = 0;
		for ( let t = 25 * SECOND; t <= 2 * IDLE_MS; t += 25 * SECOND ) {

			await wait( room, ctx, start + t - clock );
			await ping( room, alice );
			pinged = clock;

		}

		assert.deepEqual( bob.closedWith, { code: CLOSE.idle, reason: 'idle' } );
		assert.equal( alice.closedWith, null );
		assert.deepEqual( alice.said(), [ { t: 'leave', pid: bob.pid } ] );
		// The alarm's next is Alice's: IDLE_MS after a keepalive of hers.
		assert.ok( ctx.alarm > clock && ctx.alarm <= pinged + IDLE_MS );
		// Stopping, she's closed IDLE_MS after it.
		await wait( room, ctx, IDLE_MS );
		assert.deepEqual( alice.closedWith, { code: CLOSE.idle, reason: 'idle' } );
		assert.equal( ctx.alarm, null );
		assert.ok( ctx.emptied >= 1, 'the empty room deleted its storage' );

	} );

	test( 'the alarm: hello within HELLO_MS, and a visit run out; only set while there are connections', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const quiet = await arrive( room, ctx );
		assert.equal( ctx.alarm, clock + HELLO_MS );
		await wait( room, ctx, HELLO_MS - 1 );
		assert.equal( quiet.closedWith, null );
		await wait( room, ctx, 1 );
		assert.deepEqual( quiet.closedWith, { code: CLOSE.hello, reason: 'no hello' } );
		assert.equal( ctx.alarm, null );

		const short = await hello( room, ctx, { expires: clock + 3 * SECOND } );
		assert.equal( ctx.alarm, clock + 3 * SECOND );
		const long = await hello( room, ctx, { expires: clock + HOUR } );
		await wait( room, ctx, 3 * SECOND );
		assert.deepEqual( short.closedWith, { code: CLOSE.expired, reason: 'expired' } );
		assert.equal( long.closedWith, null );
		assert.deepEqual( long.said(), [ { t: 'leave', pid: short.pid } ] );
		// A visit run out, saying something before the alarm comes round.
		const late = await hello( room, ctx, { expires: clock + 2 * SECOND } );
		long.said();
		clock += 2 * SECOND;
		await say( room, late, { t: 'honk' } );
		assert.deepEqual( late.closedWith, { code: CLOSE.expired, reason: 'expired' } );
		assert.deepEqual( long.said(), [ { t: 'leave', pid: late.pid } ] );
		// The page closing: the others are told, and the empty room lets go of its alarm and storage.
		long.readyState = WebSocket.CLOSED;
		const emptied = ctx.emptied;
		await room.webSocketClose( long, 1000, '', true );
		assert.equal( ctx.alarm, null );
		assert.equal( ctx.emptied, emptied + 1 );

	} );

	test( 'LIVE switched off: each connection is closed with CLOSE.off as it next says anything, or at the alarm', async () => {

		const ctx = runtime();
		const env = { LIVE: 'on', LIMITS: limitsStub().binding };
		const room = new DriveRoom( ctx, env );
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		env.LIVE = 'off';
		await say( room, alice, { t: 'honk' } );
		assert.deepEqual( alice.closedWith, { code: CLOSE.off, reason: 'off' } );
		assert.equal( bob.closedWith, null );
		await wait( room, ctx, IDLE_MS );
		assert.deepEqual( bob.closedWith, { code: CLOSE.off, reason: 'off' } );

	} );

	test( 'a connection\'s construction rides are asked of D1 once, together: a burst of looks while it answers waits on that one ask and tells the others once, and every ride after asks nothing', async () => {

		// D1 as the room reaches it: a player's name for its hello, and any ask of their achievements
		// (achievements.js's unlockedRides), counted and held until the test lets it answer, as D1
		// far from a room does. They have the skid steer's (km-10) and no other.
		let release;
		const db = { asked: 0, held: new Promise( resolve => release = resolve ) };
		const achievements = async ( sql, args ) => {

			db.asked ++;
			await db.held;
			return [ 'km-10' ].filter( feat => args.includes( feat ) || sql.includes( `'${ feat }'` ) ).map( achievement => ( { achievement, ok: 1 } ) );

		};
		db.prepare = sql => ( {
			bind: ( ...args ) => ( {
				first: async () => ( /FROM players p WHERE p\.id/.test( sql ) ? { name: 'Rider', star: 0, xp: 0, title: null, account_id: null } : ( await achievements( sql, args ) )[ 0 ] ?? null ),
				all: async () => ( { results: await achievements( sql, args ) } ),
			} ),
		} );
		// (A party's count, written after the answer: nothing to see here.)
		db.batch = async () => [];
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding, DB: db } );
		const watcher = await hello( room, ctx );
		// Hello in the go-kart: nothing asked.
		const rider = await hello( room, ctx, {}, { player: { id: 'rider-xxxxxxxxxx', secret: 'x'.repeat( 32 ) } } );
		assert.equal( watcher.said().find( m => m.t === 'join' ).player.vehicle, 'go-kart' );
		assert.equal( db.asked, 0 );
		// As many looks as the rate lets through at once, all in locked rides before D1 has answered,
		// the last of them the skid steer (theirs): one ask, and the others told once, of the last.
		const works = Object.keys( RIDE_FEATS );
		for ( let i = 0; i < BURST - 2; i ++ ) await say( room, rider, { t: 'look', vehicle: works[ i % works.length ] === 'skid-steer-loader-cad' ? 'wheel-loader' : works[ i % works.length ], look: HELLO.look } );
		await say( room, rider, { t: 'look', vehicle: 'skid-steer-loader-cad', look: { colour: 'teal' } } );
		assert.equal( rider.closedWith, null );
		assert.equal( db.asked, 1 );
		assert.deepEqual( watcher.said(), [] );
		release();
		for ( let i = 0; i < 5; i ++ ) await new Promise( resolve => setImmediate( resolve ) );
		assert.equal( db.asked, 1 );
		assert.deepEqual( watcher.said(), [ { t: 'look', pid: rider.pid, vehicle: 'skid-steer-loader-cad', look: { colour: 'teal' } } ] );
		// Every construction ride in turn after: known already, nothing more asked; only the one
		// unlocked shows.
		clock += 10 * SECOND;
		for ( const vehicle of works ) {

			await say( room, rider, { t: 'look', vehicle, look: HELLO.look } );
			assert.equal( watcher.said()[ 0 ].vehicle, vehicle === 'skid-steer-loader-cad' ? vehicle : 'pickup-truck', vehicle );

		}

		assert.equal( db.asked, 1 );

	} );

	test( 'woken from hibernation, a room carries on from its connections\' attachments', async () => {

		const ctx = runtime();
		const env = { LIMITS: limitsStub().binding };
		const asleep = new DriveRoom( ctx, env );
		const area = { name: 'near:1365.1297' };
		const alice = await hello( asleep, ctx, area );
		const bob = await hello( asleep, ctx, area, { vehicle: 'hovercraft', look: { colour: 'teal' } } );
		// Dan says hello, and nothing more.
		const dan = await hello( asleep, ctx, area );
		const danHeard = clock;
		clock += SECOND;
		await say( asleep, alice, { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		clock += FLUSH_MS;
		await say( asleep, bob, { t: 's', s: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		await say( asleep, alice, { t: 'look', vehicle: 'city-bus', look: { colour: 'yellow' } } );
		await say( asleep, alice, { t: 'honk' } );
		for ( const ws of [ alice, bob, dan ] ) ws.said();

		// Taken out of memory: the next message wakes a new one, with only what the sockets kept.
		// Alice's honk is still spaced from her last.
		const room = new DriveRoom( ctx, env );
		clock += 100;
		await say( room, alice, { t: 'honk' } );
		assert.deepEqual( bob.said(), [] );
		clock += 30 * SECOND;
		const carol = await hello( room, ctx, area );
		const players = Object.fromEntries( carol.welcome.players.map( p => [ p.pid, p ] ) );
		assert.deepEqual( Object.keys( players ).sort(), [ alice.pid, bob.pid, dan.pid ].sort() );
		assert.deepEqual( [ players[ alice.pid ].vehicle, players[ alice.pid ].look, players[ alice.pid ].s ], [ 'city-bus', { colour: 'yellow' }, carAt( 46.5725, 8.4153 ) ] );
		assert.deepEqual( [ players[ bob.pid ].vehicle, players[ bob.pid ].s ], [ 'hovercraft', carAt( 46.5725, 8.4153, { north: 500 } ) ] );
		assert.equal( carol.welcome.max, 20 );
		// Moving on from there: Bob's car goes to the others, who all have it as new.
		await say( room, bob, { t: 's', s: carAt( 46.5725, 8.4153, { north: 600 } ) } );
		for ( const ws of [ alice, carol, dan ] ) assert.deepEqual( cars( ws.said() ), { [ bob.pid ]: carAt( 46.5725, 8.4153, { north: 600 } ) } );
		await say( room, alice, { t: 'honk' } );
		assert.deepEqual( bob.said().filter( m => m.t !== 'join' ), [ { t: 'honk', pid: alice.pid } ] );
		// The alarm set before is still there, and Dan's idle deadline is the one he had.
		assert.ok( ctx.alarm !== null );
		await wait( room, ctx, danHeard + IDLE_MS - 1 - clock );
		assert.equal( dan.closedWith, null );
		await wait( room, ctx, 1 );
		assert.deepEqual( dan.closedWith, { code: CLOSE.idle, reason: 'idle' } );
		assert.deepEqual( [ alice.closedWith, bob.closedWith, carol.closedWith ], [ null, null, null ] );

	} );

	test( 'an attachment stays well under 2 KB, the longest hello included', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		// (Someone else there, so the state is kept: alone, it would be dropped.)
		await hello( room, ctx );
		const look = Object.fromEntries( [ 'colour', 'finish', 'decal', 'rim', 'boost', 'flame', 'trail', 'smoke' ].map( part => [ part, 'x'.repeat( 24 ) ] ) );
		const ws = await hello( room, ctx, { visit: 'v'.repeat( 22 ), name: 'near:1365.79#3' }, { vehicle: 'police-cruiser', look: { ...look, number: 99 }, place: { name: '東'.repeat( 80 ), lat: - 89.123456, lon: 179.123456, height: 9999.9 } } );
		await say( room, ws, { t: 's', s: carAt( 46.5725, 8.4153, { speed: 343.21, flags: 4095 } ) } );
		const bytes = serialize( ws.attachment ).length;
		assert.ok( bytes < 1024, `${ bytes } bytes` );
		assert.equal( ws.attachment.place.name.length, 60 );
		assert.equal( ws.attachment.s[ 10 ], 4095 );
		// What it has spent is in it, and its number among its visit's; nothing only for memory is.
		assert.deepEqual( [ typeof ws.attachment.spent, typeof ws.attachment.reported, ws.attachment.seq ], [ 'number', 'number', 1 ] );
		assert.deepEqual( Object.keys( ws.attachment ).filter( key => [ 'moved', 'sent', 'sAt', 'held', 'pending', 'queue' ].includes( key ) ), [] );

	} );

	test( 'what comes in behind a hello still being looked up waits for it, in order', async () => {

		const ctx = runtime();
		// A database that answers when the test says, once it's been asked.
		let answer;
		let asked;
		const lookedUp = new Promise( resolve => asked = resolve );
		const first = () => {

			asked();
			return new Promise( resolve => answer = resolve );

		};
		const db = { prepare: () => ( { bind: () => ( { first } ) } ) };
		const room = new DriveRoom( ctx, { DB: db, LIMITS: limitsStub().binding } );
		const watcher = await hello( room, ctx );
		const ws = await arrive( room, ctx );
		const helloed = say( room, ws, { ...HELLO, player: { id: 'A'.repeat( 16 ), secret: 'B'.repeat( 32 ) } } );
		await lookedUp;
		await say( room, ws, { t: 'look', vehicle: 'muscle-car', look: {} } );
		await say( room, ws, { t: 'honk' } );
		assert.equal( ws.closedWith, null );
		assert.deepEqual( watcher.said(), [] );
		answer( { name: 'Looked Up', star: 1 } );
		await helloed;
		const [ welcome ] = ws.said();
		assert.deepEqual( [ welcome.t, welcome.name, welcome.star ], [ 'welcome', 'Looked Up', true ] );
		assert.deepEqual( watcher.said().map( m => [ m.t, m.player?.name ?? m.pid, m.player?.star ] ), [ [ 'join', 'Looked Up', true ], [ 'look', welcome.you, undefined ], [ 'honk', welcome.you, undefined ] ] );

	} );

	test( 'alone, a car\'s states are dropped; as someone joins, its first goes at once; as it\'s alone again, its last is forgotten', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const alice = await hello( room, ctx );
		for ( const north of [ 0, 10, 20 ] ) {

			await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north } ) } );
			clock += 200;

		}

		// Nobody to send them to, and none kept: Bob, joining, sees Alice with no car yet.
		const bob = await hello( room, ctx );
		assert.equal( bob.welcome.players[ 0 ].s, null );
		assert.deepEqual( alice.said().map( m => m.t ), [ 'join' ] );
		// Bob's first goes at once, and so does Alice's, sent as she heard him join, though it comes
		// within FLUSH_MS of that batch.
		await say( room, bob, { t: 's', s: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		assert.deepEqual( cars( alice.said() ), { [ bob.pid ]: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		clock += 10;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 30 } ) } );
		assert.deepEqual( bob.said(), [ { t: 'S', at: clock, s: [ [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 30 } ), 0 ] ] } ] );
		// After that, as ever: the next within FLUSH_MS waits.
		clock += 20;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 31 } ) } );
		assert.deepEqual( bob.said(), [] );

		// Bob goes, and Alice's last state goes with him: Carol, joining later, isn't shown it.
		await leave( room, bob );
		clock += 30 * SECOND;
		const carol = await hello( room, ctx );
		assert.equal( carol.welcome.players[ 0 ].s, null );
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 40 } ) } );
		assert.deepEqual( cars( carol.said() ), { [ alice.pid ]: carAt( 46.5725, 8.4153, { north: 40 } ) } );
		// Carol closed by the room (a second hello) leaves Alice alone too.
		await say( room, carol, HELLO );
		assert.equal( carol.closedWith.code, CLOSE.protocol );
		const dan = await hello( room, ctx );
		assert.equal( dan.welcome.players.find( p => p.pid === alice.pid ).s, null );

	} );

	test( 'a state held back FLUSH_MS or more goes with its car\'s next, oldest first; closer together, only the later', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		clock += 200;
		await say( room, bob, { t: 's', s: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		alice.said();
		bob.said();
		// Alice's next comes 30 ms after Bob's batch, and waits; her one after it, FLUSH_MS on, brings
		// both.
		clock += 30;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 2, speed: 10 } ) } );
		assert.deepEqual( bob.said(), [] );
		clock += FLUSH_MS;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 3, speed: 10 } ) } );
		assert.deepEqual( bob.said(), [ { t: 'S', at: clock, s: [
			[ alice.pid, ...carAt( 46.5725, 8.4153, { north: 2, speed: 10 } ), FLUSH_MS ],
			[ alice.pid, ...carAt( 46.5725, 8.4153, { north: 3, speed: 10 } ), 0 ],
		] } ] );
		// Two within FLUSH_MS of each other: the later only.
		clock += 30;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 4, speed: 10 } ) } );
		clock += 30;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 5, speed: 10 } ) } );
		clock += 50;
		await say( room, bob, { t: 'honk' } );
		assert.deepEqual( bob.said(), [ { t: 'S', at: clock, s: [ [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 5, speed: 10 } ), 50 ] ] } ] );

	} );

	test( 'what a room spends, in billed requests: reported once a minute while there\'s enough to, every few minutes when there\'s little, and as it empties, none of it lost', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding, LIVE_DAILY_BUDGET: '5000' } );
		const start = clock;
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		// Two hellos, then five minutes of Alice driving with Bob there, his page sending only its
		// keepalive, as one with nothing else to say does.
		let messages = 2 + await drive( room, ctx, alice, 5 * 60 * SECOND, [ bob ] );
		// A report REPORT_MS after the first connection, then never more than that apart (Bob's idle
		// check coming up to 10 s before one makes it then), and no alarm but those and the hello
		// deadline's: an alarm is a request too.
		const driving = limits.reports.map( report => report.now - start );
		assert.equal( driving[ 0 ], REPORT_MS );
		for ( let i = 1; i < driving.length; i ++ ) assert.ok( driving[ i ] - driving[ i - 1 ] <= REPORT_MS && driving[ i ] - driving[ i - 1 ] >= REPORT_MS - 10 * SECOND, JSON.stringify( driving ) );
		assert.ok( driving.length >= 5 && driving.at( - 1 ) > 4 * REPORT_MS, JSON.stringify( driving ) );
		assert.equal( ctx.fired, driving.length + 1 );
		assert.ok( limits.reports.every( report => report.budget === 5000 ) );

		// Then fifteen minutes parked, both sending only keepalives: less than REPORT_LEAST (5) a
		// minute, so the room's alarm comes as often as before for its checks, but reports only once
		// its own alarms (counted for the next) and the keepalives make that.
		const parked = clock;
		for ( let t = KEEPALIVE_MS; t <= 15 * 60 * SECOND; t += KEEPALIVE_MS ) {

			await wait( room, ctx, parked + t - clock );
			for ( const page of [ alice, bob ] ) await ping( room, page );
			messages += 2;

		}

		// (The first, the last of the driving, within the minute.)
		const quiet = limits.reports.slice( driving.length ).map( report => report.now - start );
		assert.ok( quiet.length >= 3 && quiet.length <= 5, JSON.stringify( quiet ) );
		assert.ok( quiet[ 0 ] - driving.at( - 1 ) <= REPORT_MS, JSON.stringify( quiet ) );
		for ( let i = 1; i < quiet.length; i ++ ) assert.ok( quiet[ i ] - quiet[ i - 1 ] >= 4 * REPORT_MS && quiet[ i ] - quiet[ i - 1 ] <= 10 * REPORT_MS, JSON.stringify( quiet ) );

		assert.ok( ctx.alarm > clock && ctx.alarm <= clock + REPORT_MS );

		// Both go: the room reports what's left as it empties, and every billed request is counted once.
		await leave( room, alice );
		await leave( room, bob );
		assert.equal( ctx.alarm, null );
		const spent = 2 * COST.connect + messages * COST.message + ctx.fired * COST.alarm + limits.reports.length * COST.report;
		assert.ok( Math.abs( total( limits.reports ) - spent ) < 1e-9, `${ total( limits.reports ) } reported, ${ spent } spent` );

	} );

	test( 'a driver alone in a room, only its keepalive: the room\'s alarm, and a report every few minutes', async () => {

		// Every KEEPALIVE_MS, and once a minute as a tab in the background is held to.
		const hour = {};
		for ( const every of [ KEEPALIVE_MS, 60 * SECOND ] ) {

			const ctx = runtime();
			const limits = limitsStub();
			const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
			const start = clock;
			const alone = await hello( room, ctx );
			let messages = 1;
			for ( let t = every; t <= HOUR; t += every ) {

				await wait( room, ctx, start + t - clock );
				await ping( room, alone );
				messages ++;

			}

			assert.equal( alone.closedWith, null );
			const reports = limits.reports.length;
			await leave( room, alone );
			const spent = COST.connect + messages * COST.message + ctx.fired * COST.alarm + limits.reports.length * COST.report;
			assert.ok( Math.abs( total( limits.reports ) - spent ) < 1e-9, `${ total( limits.reports ) } reported, ${ spent } spent` );
			console.log( `    alone an hour, a keepalive every ${ every / SECOND } s: ${ ctx.fired } alarms, ${ reports } reports, ${ spent.toFixed( 1 ) } billed requests` );
			hour[ every ] = spent;

		}

		// (It was about 150 and 190 when the room reported every minute.)
		assert.ok( hour[ KEEPALIVE_MS ] < 100 && hour[ 60 * SECOND ] < 125, JSON.stringify( hour ) );

	} );

	test( 'a connection turned away as the room is full, or closed by it, is counted too', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding, LIVE_PARTY_MAX: '2' } );
		const alice = await hello( room, ctx );
		// One that never says hello, and one told the room's full: connecting was a request all the same.
		const quiet = await arrive( room, ctx );
		const full = await arrive( room, ctx );
		assert.deepEqual( full.closedWith, { code: CLOSE.full, reason: 'full' } );
		// The quiet one closed at the hello deadline: its connecting goes on Alice's.
		await wait( room, ctx, HELLO_MS );
		assert.deepEqual( quiet.closedWith, { code: CLOSE.hello, reason: 'no hello' } );
		await ping( room, alice );
		await wait( room, ctx, REPORT_MS );
		await leave( room, alice );
		// Too little for a report in the minute: all of it as the room empties.
		assert.equal( limits.reports.length, 1 );
		const spent = 3 * COST.connect + 2 * COST.message + ctx.fired * COST.alarm + COST.report;
		assert.ok( Math.abs( total( limits.reports ) - spent ) < 1e-9, `${ total( limits.reports ) } reported, ${ spent } spent` );

	} );

	test( 'a connection the room has closed that goes on talking: each message counted, and past BURST of them the room resets, what it spent reported first', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding, LIVE_PARTY_MAX: '2' } );
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		let messages = 2;
		// One turned away as the room's full, saying something anyway: counted on Alice.
		const full = await arrive( room, ctx );
		for ( let i = 0; i < 5; i ++ ) await say( room, full, { t: 'honk' } );
		messages += 5;
		// Bob over the rate is closed; his page doesn't answer, and goes on.
		for ( let i = 0; i < BURST; i ++ ) await say( room, bob, { t: 'trick', score: 10 } );
		messages += BURST;
		assert.deepEqual( bob.closedWith, { code: CLOSE.rate, reason: 'too many messages' } );
		for ( let i = 0; i < BURST; i ++ ) await say( room, bob, { t: 'honk' } );
		messages += BURST;
		assert.deepEqual( [ ctx.aborted, limits.reports.length ], [ null, 0 ] );
		assert.deepEqual( alice.said().filter( m => m.t === 'honk' ), [] );
		// One more, and the room resets: everyone's connection to it drops.
		await say( room, bob, { t: 'honk' } );
		messages ++;
		assert.equal( ctx.aborted, 'a closed connection kept talking' );
		assert.equal( alice.readyState, WebSocket.CLOSED );
		assert.equal( limits.reports.length, 1 );
		const spent = 3 * COST.connect + messages * COST.message + COST.report;
		assert.ok( Math.abs( total( limits.reports ) - spent ) < 1e-9, `${ total( limits.reports ) } reported, ${ spent } spent` );

	} );

	test( 'a visit gone to another room: its connections here go (CLOSE.replaced); one of them still on its way in is turned away, one made after isn\'t', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const watcher = await hello( room, ctx );
		const tab = await hello( room, ctx, { visit: 'moving', seq: 3 } );
		watcher.said();
		// The Worker, as the visit's connection 5 goes to another room.
		assert.equal( ( await leaveFor( room, 'moving', 5 ) ).status, 204 );
		assert.deepEqual( tab.closedWith, { code: CLOSE.replaced, reason: 'replaced' } );
		assert.deepEqual( watcher.said(), [ { t: 'leave', pid: tab.pid } ] );
		// Its connection 4, made a moment before 5 and only coming in now: turned away.
		const late = await arrive( room, ctx, { visit: 'moving', seq: 4 } );
		assert.deepEqual( late.closedWith, { code: CLOSE.replaced, reason: 'replaced' } );
		// The page coming back here later (6): in, as ever.
		const back = await hello( room, ctx, { visit: 'moving', seq: 6 } );
		assert.equal( back.closedWith, null );
		assert.deepEqual( watcher.said().map( m => m.t ), [ 'join' ] );
		// A visit with nothing here: nothing happens.
		await leaveFor( room, 'nobody-here', 2 );
		assert.deepEqual( [ watcher.closedWith, back.closedWith ], [ null, null ] );

	} );

	test( 'a lone driver connecting again: what its last connection hadn\'t reported goes with its new one, not into memory', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const first = await hello( room, ctx, { visit: 'again' } );
		await ping( room, first );
		const second = await arrive( room, ctx, { visit: 'again', seq: 2 } );
		assert.deepEqual( first.closedWith, { code: CLOSE.replaced, reason: 'replaced' } );
		assert.ok( Math.abs( second.attachment.spent - ( 2 * COST.connect + 2 * COST.message ) ) < 1e-9, JSON.stringify( second.attachment ) );
		// So a room woken from hibernation (a new one, with only what the sockets kept) still has it.
		const woken = new DriveRoom( ctx, { LIMITS: limits.binding } );
		await say( woken, second, HELLO );
		await leave( woken, second );
		const spent = 2 * COST.connect + 3 * COST.message + COST.report;
		assert.ok( Math.abs( total( limits.reports ) - spent ) < 1e-9, `${ total( limits.reports ) } reported, ${ spent } spent` );

	} );

	test( 'the day\'s budget spent: the next report closes everyone with CLOSE.off and BUDGET_SPENT, and the room asks no more', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		await drive( room, ctx, alice, REPORT_MS, [ bob ] );
		assert.equal( limits.reports.length, 1 );
		assert.deepEqual( [ alice.closedWith, bob.closedWith ], [ null, null ] );
		limits.open = false;
		await drive( room, ctx, alice, REPORT_MS, [ bob ] );
		assert.deepEqual( alice.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.deepEqual( bob.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.equal( ctx.alarm, null );
		assert.ok( ctx.emptied >= 1 );
		// Their pages' closes as they come back: nothing more to report.
		for ( const ws of [ alice, bob ] ) await room.webSocketClose( ws, CLOSE.off, BUDGET_SPENT, true );
		assert.equal( limits.reports.length, 2 );

	} );

	test( 'DriveLimits failing: the room carries on as if open, tries again at its next alarm, and nothing it spent is lost', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const start = clock;
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		let messages = 2;
		const logged = [];
		const realError = console.error;
		console.error = ( ...args ) => logged.push( args.join( ' ' ) );
		try {

			limits.fail = true;
			messages += await drive( room, ctx, alice, REPORT_MS, [ bob ] );
			assert.deepEqual( [ alice.closedWith, bob.closedWith ], [ null, null ] );
			assert.equal( logged.length, 1 );
			assert.match( logged[ 0 ], /^Live budget report Error DriveLimits is down$/ );
			// Not again at once.
			assert.ok( ctx.alarm > clock );
			limits.fail = false;
			messages += await drive( room, ctx, alice, REPORT_MS, [ bob ] );
			assert.equal( logged.length, 1 );
			assert.deepEqual( limits.reports.map( report => report.now - start ), [ 2 * REPORT_MS ] );
			assert.deepEqual( [ alice.closedWith, bob.closedWith ], [ null, null ] );
			// The failed report's all in that one, its call included (and what came after, as they go).
			await leave( room, alice );
			await leave( room, bob );
			const spent = 2 * COST.connect + messages * COST.message + ctx.fired * COST.alarm + ( limits.reports.length + 1 ) * COST.report;
			assert.ok( Math.abs( total( limits.reports ) - spent ) < 1e-9, `${ total( limits.reports ) } reported, ${ spent } spent` );

		} finally {

			console.error = realError;

		}

	} );

	// --- who's driving now: an area's room's dots, in its reports ---

	// The dots in each report that had them (an area's room's), and when.
	const dotsIn = reports => reports.filter( report => report.online ).map( report => ( { at: report.now, room: report.online.room, dots: report.online.dots } ) );
	// The clock `ms` on, `pages` each sending its keepalive every KEEPALIVE_MS meanwhile, as pages with
	// nothing else to say do, the alarm going as it's due.
	async function idle( room, ctx, pages, ms ) {

		const until = clock + ms;
		while ( clock + KEEPALIVE_MS <= until ) {

			await wait( room, ctx, KEEPALIVE_MS );
			for ( const page of pages ) if ( ! page.closedWith ) await ping( room, page );

		}

		await wait( room, ctx, until - clock );

	}

	test( 'an area\'s room says where its drivers are with its reports: a lone driver DOTS_GAP after she connects, though it has little to report, then only as the room reports anyway; going, it takes its dot off. A party\'s room never says', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const start = clock;
		const alone = await hello( room, ctx, { name: FURKA_AREA } );
		await idle( room, ctx, [ alone ], 30 * MINUTE );
		const reported = dotsIn( limits.reports );
		// Every report of an area's room has its dots: the first DOTS_GAP (15 s) after she connected (a
		// room counts from its first connection as from a report), where she dropped in (her page sends no states alone), to about a kilometre and 10 m.
		assert.equal( reported.length, limits.reports.length );
		assert.ok( reported[ 0 ].at - start <= 16 * SECOND, `${ reported[ 0 ].at - start } ms` );
		assert.deepEqual( { ...reported[ 0 ], at: 0 }, { at: 0, room: FURKA_AREA, dots: [ FURKA_DOT ] } );
		// Nothing changing, then only the reports the room makes anyway: every few minutes for a lone
		// driver, never more than REPORT_MOST and its next alarm apart (well within ONLINE_TTL, 12).
		for ( let i = 1; i < reported.length; i ++ ) {

			const gap = reported[ i ].at - reported[ i - 1 ].at;
			assert.ok( gap >= 4 * REPORT_MS && gap <= 11 * MINUTE, JSON.stringify( reported.map( r => r.at - start ) ) );
			assert.deepEqual( reported[ i ].dots, [ FURKA_DOT ] );

		}

		assert.ok( reported.length >= 4, JSON.stringify( reported.map( r => r.at - start ) ) );
		// Going: the room's last report, as it empties, has none.
		await leave( room, alone );
		assert.deepEqual( dotsIn( limits.reports ).slice( reported.length ), [ { at: clock, room: FURKA_AREA, dots: [] } ] );

		// A party's room, the same: no dots, ever.
		const partyCtx = runtime();
		const partyLimits = limitsStub();
		const party = new DriveRoom( partyCtx, { LIMITS: partyLimits.binding } );
		const friend = await hello( party, partyCtx );
		const other = await hello( party, partyCtx );
		await drive( party, partyCtx, friend, 5 * MINUTE, [ other ] );
		await leave( party, friend );
		await leave( party, other );
		assert.ok( partyLimits.reports.length >= 5 );
		assert.ok( partyLimits.reports.every( report => ! ( 'online' in report ) ), JSON.stringify( partyLimits.reports.find( report => report.online ) ) );

	} );

	test( 'who\'s counted: those on the globe aren\'t, a paused driver is; a change goes in a report DOTS_SOON after it (no sooner than DOTS_GAP after the last), though there\'s little to report', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const start = clock;
		const alice = await hello( room, ctx, { name: FURKA_AREA } );
		// Bob's on the globe, still in the area's room (for a minute, as a page is).
		const bob = await hello( room, ctx, { name: FURKA_AREA }, { place: null, away: true } );
		await idle( room, ctx, [ alice, bob ], REPORT_MS );
		const [ first ] = dotsIn( limits.reports );
		assert.equal( dotsIn( limits.reports ).length, 1 );
		assert.ok( first.at - start <= 16 * SECOND, `${ first.at - start } ms` );
		assert.deepEqual( first.dots, [ FURKA_DOT ] );

		// He drops in beside her and parks (paused): two, at their mean, in a report DOTS_SOON (3 s)
		// after, with less than REPORT_LEAST (5) to report.
		let said = clock;
		await say( room, bob, { t: 'place', place: FURKA } );
		await say( room, bob, { t: 's', s: carAt( 46.5725, 8.4153, { north: 30, flags: FLAGS.paused | FLAGS.grounded } ) } );
		await idle( room, ctx, [ alice, bob ], REPORT_MS );
		let reported = dotsIn( limits.reports );
		assert.equal( reported.length, 2 );
		assert.ok( reported[ 1 ].at - said <= 4 * SECOND, `${ reported[ 1 ].at - said } ms` );
		assert.ok( limits.reports[ 1 ].amount < 5, `${ limits.reports[ 1 ].amount } reported` );
		assert.deepEqual( reported[ 1 ].dots, [ { ...FURKA_DOT, count: 2 } ] );

		// Back on the globe: one again, within seconds.
		said = clock;
		await say( room, bob, { t: 'away' } );
		await idle( room, ctx, [ alice, bob ], REPORT_MS );
		reported = dotsIn( limits.reports );
		assert.equal( reported.length, 3 );
		assert.ok( reported[ 2 ].at - said <= 4 * SECOND, `${ reported[ 2 ].at - said } ms` );
		// Back and forth faster than DOTS_GAP (15 s): the room reports no sooner than that after its
		// last, so a page coming and going can't have it report more than four times a minute.
		const before = dotsIn( limits.reports ).length;
		for ( let i = 0; i < 6; i ++ ) {

			await say( room, bob, i % 2 ? { t: 'away' } : { t: 'place', place: FURKA } );
			await wait( room, ctx, 5 * SECOND );

		}

		await idle( room, ctx, [ alice, bob ], REPORT_MS );
		const quick = dotsIn( limits.reports ).slice( before - 1 );
		for ( let i = 1; i < quick.length; i ++ ) assert.ok( quick[ i ].at - quick[ i - 1 ].at >= 15 * SECOND, JSON.stringify( quick.map( r => r.at ) ) );
		assert.deepEqual( quick.at( - 1 ).dots, [ FURKA_DOT ] );
		assert.deepEqual( reported[ 2 ].dots, [ FURKA_DOT ] );
		// And with nothing changing, no report for the minutes after that but what the room's alarms
		// add up to.
		// (Here at most the one the back and forth above spent enough for, REPORT_LEAST.)
		const settled = dotsIn( limits.reports ).length;
		await idle( room, ctx, [ alice, bob ], 3 * MINUTE );
		const after = dotsIn( limits.reports ).slice( settled );
		assert.ok( after.length <= 1, JSON.stringify( after ) );
		for ( const report of after ) assert.deepEqual( report.dots, [ FURKA_DOT ] );

	} );

	test( 'drivers in a room more than DOT_SPREAD apart are dots of their own, each at its drivers\' mean, rounded; a car the room has word of is where it is, a lone one from another area in the middle of this one', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const start = clock;
		const [ a, b, c ] = [ await hello( room, ctx, { name: FURKA_AREA } ), await hello( room, ctx, { name: FURKA_AREA } ), await hello( room, ctx, { name: FURKA_AREA } ) ];
		// A and B 1 km apart, C 3 km south of them.
		await say( room, a, { t: 's', s: carAt( 46.5725, 8.4153, { north: 500 } ) } );
		await say( room, b, { t: 's', s: carAt( 46.5725, 8.4153, { north: - 500 } ) } );
		await say( room, c, { t: 's', s: carAt( 46.5725, 8.4153, { north: - 3500 } ) } );
		await idle( room, ctx, [ a, b, c ], REPORT_MS );
		const [ first ] = dotsIn( limits.reports );
		assert.ok( first.at - start <= 16 * SECOND, `${ first.at - start } ms` );
		const south = toGeodetic( ...Object.values( ecef( 46.5725 - 3500 / 111200, 8.4153, 2430 ) ) );
		assert.deepEqual( first.dots, [ { lat: 46.57, lon: 8.42, height: 2430, count: 2 }, { lat: Math.round( south.lat * 100 ) / 100, lon: 8.42, height: 2430, count: 1 } ] );

		// Someone alone in a room drove into it from another area, so the room has no word of their car
		// and where they dropped in isn't in it: they're in the middle of the area.
		const loneCtx = runtime();
		const loneLimits = limitsStub();
		const lone = new DriveRoom( loneCtx, { LIMITS: loneLimits.binding } );
		const next = cellOf( FURKA.lat + 0.1, FURKA.lon );
		const driver = await hello( lone, loneCtx, { name: next } );
		await idle( lone, loneCtx, [ driver ], REPORT_MS );
		const { south: s, north, west, east } = boundsOf( next );
		const [ dot ] = dotsIn( loneLimits.reports )[ 0 ].dots;
		assert.deepEqual( dot, { lat: Math.round( ( s + north ) / 2 * 100 ) / 100, lon: Math.round( ( west + east ) / 2 * 100 ) / 100, height: 2430, count: 1 } );
		assert.equal( cellOf( dot.lat, dot.lon ), next );

	} );

	test( 'a room that empties, or closes everyone, takes its dots off as it goes; one closed for the day\'s budget, DriveLimits has let go of already', async () => {

		// LIVE switched off: closed at the alarm, which reports none.
		const ctx = runtime();
		const limits = limitsStub();
		const env = { LIVE: 'on', LIMITS: limits.binding };
		const room = new DriveRoom( ctx, env );
		const alice = await hello( room, ctx, { name: FURKA_AREA } );
		await idle( room, ctx, [ alice ], REPORT_MS );
		env.LIVE = 'off';
		await wait( room, ctx, REPORT_MS );
		assert.deepEqual( alice.closedWith, { code: CLOSE.off, reason: 'off' } );
		assert.deepEqual( dotsIn( limits.reports ).map( r => r.dots ), [ [ FURKA_DOT ], [] ] );
		await room.webSocketClose( alice, CLOSE.off, 'off', true );
		assert.equal( limits.reports.length, 2 );

		// The day's budget spent: everyone closed at the report, and as their closes come in, nothing
		// more to say (DriveLimits let go of the dots as it said so).
		const spentCtx = runtime();
		const spentLimits = limitsStub();
		const spent = new DriveRoom( spentCtx, { LIMITS: spentLimits.binding } );
		const bob = await hello( spent, spentCtx, { name: FURKA_AREA } );
		spentLimits.open = false;
		await idle( spent, spentCtx, [ bob ], REPORT_MS );
		assert.deepEqual( bob.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );
		await spent.webSocketClose( bob, CLOSE.off, BUDGET_SPENT, true );
		assert.equal( spentLimits.reports.length, 1 );

		// The last to go woke the room from hibernation to say so: it knows from what the connection kept
		// that it had dots up, and takes them off.
		const sleepCtx = runtime();
		const sleepLimits = limitsStub();
		const asleep = new DriveRoom( sleepCtx, { LIMITS: sleepLimits.binding } );
		const carol = await hello( asleep, sleepCtx, { name: FURKA_AREA } );
		await idle( asleep, sleepCtx, [ carol ], REPORT_MS );
		assert.equal( dotsIn( sleepLimits.reports ).length, 1 );
		await leave( new DriveRoom( sleepCtx, { LIMITS: sleepLimits.binding } ), carol );
		assert.deepEqual( dotsIn( sleepLimits.reports ).map( r => r.dots ), [ [ FURKA_DOT ], [] ] );

	} );

	test( 'woken from hibernation, a room knows which dots it last reported, so it doesn\'t report the same again; DriveLimits failing, they go with the next report', async () => {

		const ctx = runtime();
		const limits = limitsStub();
		const env = { LIMITS: limits.binding };
		const alice = await hello( new DriveRoom( ctx, env ), ctx, { name: FURKA_AREA } );
		await idle( new DriveRoom( ctx, env ), ctx, [ alice ], REPORT_MS );
		assert.equal( dotsIn( limits.reports ).length, 1 );
		// Each alarm and keepalive from now on in a room just woken: nothing new to say in the next two
		// minutes (its alarms and keepalives are under REPORT_LEAST).
		for ( let i = 0; i < 2 * MINUTE / KEEPALIVE_MS; i ++ ) await idle( new DriveRoom( ctx, env ), ctx, [ alice ], KEEPALIVE_MS );
		assert.equal( dotsIn( limits.reports ).length, 1 );

		// A second driver while DriveLimits is down: the report fails, and the next goes as soon as one
		// may, at the next alarm a minute on, with little to report.
		const realError = console.error;
		console.error = () => {};
		try {

			const room = new DriveRoom( ctx, env );
			const bob = await hello( room, ctx, { name: FURKA_AREA } );
			limits.fail = true;
			await idle( room, ctx, [ alice, bob ], REPORT_MS );
			assert.equal( dotsIn( limits.reports ).length, 1 );
			limits.fail = false;
			const failed = clock;
			await idle( room, ctx, [ alice, bob ], REPORT_MS );
			const reported = dotsIn( limits.reports );
			assert.equal( reported.length, 2 );
			assert.ok( reported[ 1 ].at - failed <= REPORT_MS );
			assert.deepEqual( reported[ 1 ].dots, [ { ...FURKA_DOT, count: 2 } ] );

		} finally {

			console.error = realError;

		}

	} );

	test( 'an attachment with the most dots a room reports is still well under 2 KB', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const pages = [];
		for ( let i = 0; i < 4; i ++ ) pages.push( await hello( room, ctx, { name: FURKA_AREA, visit: 'v'.repeat( 22 ) + i }, { place: { name: '東'.repeat( 80 ), lat: 46.5725, lon: 8.4153, height: 9999.9 } } ) );
		for ( const [ i, page ] of pages.entries() ) await say( room, page, { t: 's', s: carAt( 46.5725, 8.4153, { north: - 4000 * i } ) } );
		await idle( room, ctx, pages, REPORT_MS );
		const shown = JSON.parse( pages[ 0 ].attachment.shown );
		assert.equal( shown.length, ROOM_DOTS );
		const bytes = serialize( pages[ 0 ].attachment ).length;
		assert.ok( bytes < 1024, `${ bytes } bytes` );

	} );

	// --- the Moon ---

	const MOON_HELLO = { place: TYCHO };

	test( 'a Moon area\'s room takes Moon places and cars in the Moon\'s frame: an Earth state, or a place on the Earth, is no car\'s there', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const enter = () => hello( room, ctx, { name: TYCHO_AREA, version: 2 }, MOON_HELLO );
		const ann = await enter();
		const ben = await enter();
		assert.deepEqual( ann.said().map( m => [ m.t, m.player.world, m.player.place ] ), [ [ 'join', 'moon', TYCHO ] ] );
		assert.deepEqual( ben.welcome.players.map( p => [ p.world, p.place ] ), [ [ 'moon', TYCHO ] ] );
		// Driving on the Moon: Ben has her car, in the Moon's frame, as she sent it.
		const car = moonCarAt( TYCHO.lat, TYCHO.lon, { speed: 5 } );
		await say( room, ann, { t: 's', s: car } );
		assert.deepEqual( ben.said().filter( m => m.t === 'S' ).map( m => m.s[ 0 ].slice( 1, 12 ) ), [ car ] );
		// A state in the Earth's frame (or one far off the Moon's ground) is dropped, not passed on.
		await wait( room, ctx, FLUSH_MS );
		for ( const wrong of [ carAt( 46.5725, 8.4153 ), packState( toMoonFrame( TYCHO.lat, TYCHO.lon, 40000 ), { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, 128 ) ] ) {

			await say( room, ann, { t: 's', s: wrong } );
			await wait( room, ctx, FLUSH_MS );
			await ping( room, ben );
			assert.deepEqual( ben.said().filter( m => m.t === 'S' ), [] );
			assert.equal( ann.closedWith, null );

		}

		// A place on the Earth in the Moon's area: nothing changes, nobody's told.
		await say( room, ann, { t: 'place', place: FURKA } );
		assert.deepEqual( ben.said(), [] );
		// Nor does a hello there with an Earth place put that place in it: on the globe, as far as
		// anyone's told.
		const cal = await hello( room, ctx, { name: TYCHO_AREA, version: 2 }, { place: FURKA } );
		assert.deepEqual( ann.said().map( m => [ m.t, m.player.place, m.player.away ] ), [ [ 'join', null, true ] ] );
		assert.equal( cal.closedWith, null );

	} );

	test( 'a party across worlds: a page that knows of the Moon hears a Moon driver\'s world, place and car; a page from before hears only that they\'re on the globe, and none of their car, tricks or honks', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const old = await hello( room, ctx, { version: 1 } );
		const earthly = await hello( room, ctx, { version: 2 } );
		const moony = await hello( room, ctx, { version: 2, world: 'moon' }, MOON_HELLO );
		const join = ( ws => ws.said().find( m => m.t === 'join' && m.player.pid === moony.pid ).player );
		// Told of her as they're told: the new page with her world, place and all; the old one, on the
		// globe, nothing more.
		assert.deepEqual( ( ( { world, place, away } ) => ( { world, place, away } ) )( join( earthly ) ), { world: 'moon', place: TYCHO, away: false } );
		assert.deepEqual( ( ( { world, place, away, s } ) => ( { world, place, away, s } ) )( join( old ) ), { world: undefined, place: null, away: true, s: null } );
		assert.deepEqual( moony.welcome.players.map( p => [ p.world, p.place?.name ] ), [ [ undefined, FURKA.name ], [ undefined, FURKA.name ] ] );
		// Her car, a trick and a honk: to the new page, not to the old.
		await say( room, moony, { t: 's', s: moonCarAt( TYCHO.lat, TYCHO.lon ) } );
		await wait( room, ctx, FLUSH_MS );
		await say( room, moony, { t: 'trick', score: 1200 } );
		await say( room, moony, { t: 'honk' } );
		assert.deepEqual( earthly.said().map( m => m.t ), [ 'S', 'trick', 'honk' ] );
		assert.deepEqual( old.said(), [] );
		// An Earth driver's car goes to everyone (hers is checked against the Earth's frame).
		await say( room, earthly, { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		await wait( room, ctx, FLUSH_MS );
		await ping( room, moony );
		assert.deepEqual( [ old.said().map( m => m.t ), moony.said().map( m => m.t ) ], [ [ 'S' ], [ 'S' ] ] );
		// A Moon state from an Earth driver is no car of theirs.
		await say( room, earthly, { t: 's', s: moonCarAt( TYCHO.lat, TYCHO.lon ) } );
		await wait( room, ctx, FLUSH_MS );
		await ping( room, moony );
		assert.deepEqual( moony.said(), [] );
		// She comes to the Earth: the old page hears where, as of anyone on the Earth. Then the new
		// Earth page goes to the Moon ("Sam went to Tycho"): the new pages hear the place, with its
		// world; the old one that he's on the globe.
		await say( room, moony, { t: 'place', place: MONACO } );
		assert.deepEqual( old.said(), [ { t: 'place', pid: moony.pid, place: MONACO } ] );
		earthly.said();
		await say( room, earthly, { t: 'place', place: TYCHO } );
		assert.deepEqual( moony.said(), [ { t: 'place', pid: earthly.pid, place: TYCHO } ] );
		assert.deepEqual( old.said(), [ { t: 'away', pid: earthly.pid } ] );
		// And his last car, on the Earth, is no car of his on the Moon (none for someone joining).
		const late = await hello( room, ctx, { version: 2 } );
		assert.deepEqual( late.welcome.players.find( p => p.pid === earthly.pid ).s, null );
		old.said();
		moony.said();
		// Back on the globe (the Moon's, he says): on the globe to everyone.
		await say( room, earthly, { t: 'away', world: 'moon' } );
		assert.deepEqual( [ old.said(), late.said() ], [ [ { t: 'away', pid: earthly.pid } ], [ { t: 'away', pid: earthly.pid } ] ] );
		// A page from before says nothing of worlds: a 'world' in its place is no world (on the Earth).
		await say( room, old, { t: 'place', place: { ...TYCHO, height: 100 } } );
		assert.deepEqual( moony.said().filter( m => m.t === 'place' ).map( m => [ m.pid, m.place.world ] ), [ [ old.pid, undefined ] ] );

	} );

	test( 'what each world spends goes to its own budget, and a world\'s spent closes only those on it: in a party, the Moon\'s drive on when the Earth\'s is spent', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding, LIVE_DAILY_BUDGET: '5000', LIVE_MOON_DAILY_BUDGET: '700' } );
		const earthly = await hello( room, ctx, { version: 2 } );
		const moony = await hello( room, ctx, { version: 2, world: 'moon' }, MOON_HELLO );
		// The Moon driver driving a minute: her messages are the Moon's; the room's own (its alarm and
		// report) and the Earth driver's connecting, the Earth's (a party with anyone on the Earth).
		const onTheMoon = step => moonCarAt( TYCHO.lat, TYCHO.lon, { north: step, speed: 10 } );
		await drive( room, ctx, moony, REPORT_MS + 5 * SECOND, [ earthly ], onTheMoon );
		assert.equal( limits.reports.length, 1 );
		const [ report ] = limits.reports;
		assert.deepEqual( [ report.budget, report.moonBudget ], [ 5000, 700 ] );
		// (Her connection and hello, and her states up to the report a minute in, 5 a second: about 16.)
		assert.ok( report.moon > COST.connect + 290 * COST.message && report.moon < COST.connect + 310 * COST.message, `${ report.moon } for the Moon's` );
		// (His connection, hello and keepalives, and the room's alarms and report.)
		assert.ok( report.amount >= COST.connect + COST.alarm + COST.report && report.amount < 5, `${ report.amount } for the Earth's` );
		// The Earth's budget spent: only the Earth driver is closed, for the budget; she drives on.
		limits.open = false;
		await drive( room, ctx, moony, REPORT_MS, [], onTheMoon );
		assert.deepEqual( [ earthly.closedWith, moony.closedWith ], [ { code: CLOSE.off, reason: BUDGET_SPENT }, null ] );
		// Alone on the Moon, the party's own spend is the Moon's now.
		limits.reports.length = 0;
		await drive( room, ctx, moony, REPORT_MS, [], onTheMoon );
		assert.equal( limits.reports.at( - 1 ).amount, 0 );
		assert.ok( limits.reports.at( - 1 ).moon >= COST.alarm + COST.report );
		// And the Moon's spent too: she's closed.
		limits.moonOpen = false;
		await drive( room, ctx, moony, REPORT_MS, [], onTheMoon );
		assert.deepEqual( moony.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );

	} );

	test( 'the Earth\'s day spent: a party\'s driver let in on the Moon can\'t move onto the Earth (hello, place or away there closes it at once with CLOSE.off and BUDGET_SPENT), and what it spent is the Moon\'s; a report saying so is remembered, through hibernation too', async () => {

		const limits = limitsStub();
		limits.open = false;
		const ctx = runtime();
		const env = { LIMITS: limits.binding };
		const room = new DriveRoom( ctx, env );
		// A script let in on the Moon's budget saying hello at the Furka Pass: nobody hears of it.
		const una = await hello( room, ctx, { version: 2, world: 'moon', closed: 'earth' }, MOON_HELLO );
		const sly = await arrive( room, ctx, { version: 2, world: 'moon', closed: 'earth' } );
		await say( room, sly, HELLO );
		assert.deepEqual( sly.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.deepEqual( sly.said(), [] );
		assert.deepEqual( una.said(), [] );
		// Vic driving to Monaco, or Wes to the Earth's globe: closed then and there, before anyone hears.
		const vic = await hello( room, ctx, { version: 2, world: 'moon', closed: 'earth' }, MOON_HELLO );
		una.said();
		await say( room, vic, { t: 'place', place: MONACO } );
		assert.deepEqual( vic.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.deepEqual( una.said().map( m => m.t ), [ 'leave' ] );
		const wes = await hello( room, ctx, { version: 2, world: 'moon', closed: 'earth' }, MOON_HELLO );
		una.said();
		await say( room, wes, { t: 'away', world: 'earth' } );
		assert.deepEqual( wes.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.deepEqual( una.said().map( m => m.t ), [ 'leave' ] );
		// Moving about the Moon is fine.
		await say( room, una, { t: 'place', place: { ...TYCHO, name: 'Tycho again' } } );
		await say( room, una, { t: 'away', world: 'moon' } );
		assert.equal( una.closedWith, null );
		// Everything the three spent (connecting, hello and the rest), and Una's, is the Moon's: the
		// Earth's report is only the room's own alarm and report.
		await wait( room, ctx, REPORT_MS );
		const [ report ] = limits.reports;
		assert.ok( report.moon >= 4 * COST.connect, `${ report.moon } for the Moon's` );
		assert.ok( report.amount <= COST.alarm + COST.report, `${ report.amount } for the Earth's` );
		assert.equal( una.closedWith, null );

		// A party that heard of it only from its report: those who came in before (with nothing said
		// at the door) can't move onto the Earth after, even once the room has hibernated.
		const later = runtime();
		const asleep = new DriveRoom( later, env );
		limits.reports.length = 0;
		limits.open = true;
		const xan = await hello( asleep, later, { version: 2, world: 'moon', expires: clock + 3 * DAY }, MOON_HELLO );
		const yul = await hello( asleep, later, { version: 2, world: 'moon' }, MOON_HELLO );
		const zed = await hello( asleep, later, { version: 2 } );
		limits.open = false;
		await drive( asleep, later, xan, REPORT_MS + 5 * SECOND, [ yul, zed ], step => moonCarAt( TYCHO.lat, TYCHO.lon, { north: step, speed: 10 } ) );
		assert.deepEqual( [ xan.closedWith, yul.closedWith, zed.closedWith ], [ null, null, { code: CLOSE.off, reason: BUDGET_SPENT } ] );
		const woken = new DriveRoom( later, env );
		await say( woken, yul, { t: 'place', place: FURKA } );
		assert.deepEqual( yul.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );
		// And a new day is a new day.
		clock += DAY;
		await say( woken, xan, { t: 'place', place: FURKA } );
		assert.equal( xan.closedWith, null );

	} );

	test( 'each address\'s share: what each connection spent itself goes with the report by its address (from) and world, never what it carries for another nor the owner\'s; an address past its share on a world has its connections there closed (CLOSE.rate), the owner\'s and the others\' drive on', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		// Ana and the owner from one address, Ben from another on the Moon, and Cal, who sends a few
		// keepalives and goes: what Cal spent is carried by another for the budget, but is Cal's own.
		const ana = await hello( room, ctx, { version: 2, from: 'from-ana' } );
		const owner = await hello( room, ctx, { version: 2, from: 'from-ana', uncounted: true } );
		const ben = await hello( room, ctx, { version: 2, world: 'moon', from: 'from-ben' }, MOON_HELLO );
		const cal = await hello( room, ctx, { version: 2, from: 'from-cal' } );
		for ( let i = 0; i < 10; i ++ ) await ping( room, ana );
		for ( let i = 0; i < 20; i ++ ) await ping( room, owner );
		for ( let i = 0; i < 4; i ++ ) await ping( room, ben );
		for ( let i = 0; i < 6; i ++ ) await ping( room, cal );
		await leave( room, cal );
		await wait( room, ctx, REPORT_MS );
		assert.ok( limits.reports.length >= 1 );
		// Added up over the reports so far: each address's own, on its world.
		const byFrom = {};
		for ( const report of limits.reports ) for ( const { from, earth, moon } of report.addresses ?? [] ) {

			byFrom[ from ] ??= { earth: 0, moon: 0 };
			byFrom[ from ].earth += earth;
			byFrom[ from ].moon += moon;
			assert.equal( report.share, 8 );

		}

		const close = ( a, b ) => Math.abs( a - b ) < 1e-9;
		assert.deepEqual( Object.keys( byFrom ).sort(), [ 'from-ana', 'from-ben', 'from-cal' ] );
		assert.ok( close( byFrom[ 'from-ana' ].earth, COST.connect + 11 * COST.message ) && byFrom[ 'from-ana' ].moon === 0, JSON.stringify( byFrom ) );
		assert.ok( close( byFrom[ 'from-ben' ].moon, COST.connect + 5 * COST.message ) && byFrom[ 'from-ben' ].earth === 0, JSON.stringify( byFrom ) );
		assert.ok( close( byFrom[ 'from-cal' ].earth, COST.connect + 7 * COST.message ), JSON.stringify( byFrom ) );

		// Ana's address past its share on the Earth: Ana is closed at the next report, the owner (on the
		// same address) isn't, nor Ben; and an address past its share on the Moon closes nobody on the Earth.
		limits.over = { earth: [ 'from-ana' ], moon: [ 'from-cal', 'from-ana' ] };
		for ( const page of [ ana, owner, ben ] ) await ping( room, page );
		await drive( room, ctx, ben, REPORT_MS + 5 * SECOND, [ ana, owner ], step => moonCarAt( TYCHO.lat, TYCHO.lon, { north: step, speed: 10 } ) );
		assert.deepEqual( ana.closedWith, { code: CLOSE.rate, reason: 'too much from here today' } );
		assert.equal( owner.closedWith, null );
		assert.equal( ben.closedWith, null );
		limits.over = { earth: [], moon: [ 'from-ben' ] };
		await drive( room, ctx, ben, REPORT_MS + 5 * SECOND, [ owner ], step => moonCarAt( TYCHO.lat, TYCHO.lon, { north: step, speed: 10 } ) );
		assert.deepEqual( ben.closedWith, { code: CLOSE.rate, reason: 'too much from here today' } );
		assert.equal( owner.closedWith, null );

	} );

	test( 'in a party, an address past its share of the other world\'s day (OVER, from /api/live, or a report since) drives on the world it was let in on, and is closed (CLOSE.rate) as it says it\'s on that one, even after the room hibernates; never the owner\'s', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const env = { LIMITS: limits.binding };
		const room = new DriveRoom( ctx, env );
		const rate = { code: CLOSE.rate, reason: 'too much from here today' };
		const friend = await hello( room, ctx, { version: 2, from: 'from-friend' } );
		// Let in on the Earth (whose share it hasn't touched), its address past its Moon share: on the
		// Earth it drives on; dropping in on the Moon closes it.
		const sly = await hello( room, ctx, { version: 2, from: 'from-x', over: 'moon' } );
		await ping( room, sly );
		assert.equal( sly.closedWith, null );
		await say( room, sly, { t: 'place', place: TYCHO } );
		assert.deepEqual( sly.closedWith, rate );
		// Saying hello on the Moon straight away, or turning to the Moon's globe: closed as well.
		const slier = await arrive( room, ctx, { version: 2, from: 'from-x', over: 'moon' } );
		await say( room, slier, { ...HELLO, place: TYCHO } );
		assert.deepEqual( slier.closedWith, rate );
		const globe = await hello( room, ctx, { version: 2, from: 'from-x', over: 'moon' } );
		await say( room, globe, { t: 'away', world: 'moon' } );
		assert.deepEqual( globe.closedWith, rate );
		// The owner's visit on the same address isn't held to it.
		const owner = await hello( room, ctx, { version: 2, from: 'from-x', over: 'moon', uncounted: true } );
		await say( room, owner, { t: 'place', place: TYCHO } );
		assert.equal( owner.closedWith, null );

		// A report saying another address is past its Moon share: its connection on the Moon is closed,
		// the one on the Earth drives on there, but can't move onto the Moon, though the room hibernates.
		const una = await hello( room, ctx, { version: 2, world: 'moon', from: 'from-y' }, MOON_HELLO );
		const ed = await hello( room, ctx, { version: 2, from: 'from-y' } );
		limits.over = { earth: [], moon: [ 'from-y' ] };
		await drive( room, ctx, friend, REPORT_MS + 5 * SECOND, [ una, ed, owner ] );
		assert.ok( limits.reports.length >= 1 );
		assert.deepEqual( una.closedWith, rate );
		assert.equal( ed.closedWith, null );
		const woken = new DriveRoom( ctx, env );
		await say( woken, ed, { t: 'place', place: FURKA } );
		assert.equal( ed.closedWith, null );
		await say( woken, ed, { t: 'place', place: TYCHO } );
		assert.deepEqual( ed.closedWith, rate );
		assert.deepEqual( [ friend.closedWith, owner.closedWith ], [ null, null ] );

	} );

	// What each report says each address spent itself, added up: { from: { earth, moon } }.
	const spentBy = reports => {

		const byFrom = {};
		for ( const report of reports ) for ( const { from, earth, moon } of report.addresses ?? [] ) {

			byFrom[ from ] ??= { earth: 0, moon: 0 };
			byFrom[ from ].earth += earth;
			byFrom[ from ].moon += moon;

		}

		return byFrom;

	};

	test( 'what a connection spent itself is held to its address\'s share though it goes just before the room hibernates (kept in the attachment of one still there), or is closed with nobody left and never answers the close (reported then and there)', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const env = { LIMITS: limits.binding };
		const room = new DriveRoom( ctx, env );
		// A friend parked in the room, and from-x sending keepalives and going before any report.
		const friend = await hello( room, ctx, { version: 2, from: 'from-friend' } );
		const sly = await hello( room, ctx, { version: 2, from: 'from-x' } );
		for ( let i = 0; i < 30; i ++ ) await ping( room, sly );
		await leave( room, sly );
		assert.equal( limits.reports.length, 0 );
		// The room hibernates: a new one, with only what the sockets kept, makes the reports.
		const woken = new DriveRoom( ctx, env );
		await ping( woken, friend );
		await wait( woken, ctx, 10 * REPORT_MS );
		const close = ( a, b ) => Math.abs( a - b ) < 1e-9;
		const byFrom = spentBy( limits.reports );
		assert.ok( close( byFrom[ 'from-x' ]?.earth ?? 0, COST.connect + 31 * COST.message ), JSON.stringify( byFrom ) );

		// Alone, closed for too many messages, its page never answering the close: what it spent is
		// reported as it's closed, not kept in memory for a room that may hibernate first.
		const later = runtime();
		const alone = new DriveRoom( later, env );
		limits.reports.length = 0;
		const lone = await hello( alone, later, { version: 2, from: 'from-z' } );
		let messages = 1;
		while ( ! lone.closedWith && messages < 10 * BURST ) {

			await say( alone, lone, { t: 'honk' } );
			messages ++;

		}

		assert.deepEqual( lone.closedWith, { code: CLOSE.rate, reason: 'too many messages' } );
		assert.equal( limits.reports.length, 1 );
		assert.ok( close( spentBy( limits.reports )[ 'from-z' ]?.earth ?? 0, COST.connect + messages * COST.message ), JSON.stringify( limits.reports ) );

	} );

	test( 'a connection the room has closed that goes on sending: those messages are its address\'s too', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const alice = await hello( room, ctx, { version: 2, from: 'from-a' } );
		const bob = await hello( room, ctx, { version: 2, from: 'from-b' } );
		let messages = 1;
		while ( ! bob.closedWith && messages < 10 * BURST ) {

			await say( room, bob, { t: 'trick', score: 10 } );
			messages ++;

		}

		assert.deepEqual( bob.closedWith, { code: CLOSE.rate, reason: 'too many messages' } );
		// His page doesn't answer, and goes on (a few, under BURST: the room doesn't reset).
		for ( let i = 0; i < 5; i ++ ) await say( room, bob, { t: 'honk' } );
		messages += 5;
		assert.equal( ctx.aborted, null );
		await leave( room, alice );
		const close = ( a, b ) => Math.abs( a - b ) < 1e-9;
		const byFrom = spentBy( limits.reports );
		assert.ok( close( byFrom[ 'from-b' ]?.earth ?? 0, COST.connect + messages * COST.message ), JSON.stringify( byFrom ) );
		assert.ok( close( byFrom[ 'from-a' ]?.earth ?? 0, COST.connect + COST.message ), JSON.stringify( byFrom ) );

	} );

	test( '/api/live hands the room the owner\'s visits as uncounted (X-Live-Uncounted), and no other; and for a party, the other world whose share the address has spent (X-Live-Over)', async () => {

		const env = {
			TURNSTILE_SECRET: PASS_SECRET, LIVE_DAILY_BUDGET: '7791', LIVE_MOON_DAILY_BUDGET: '7792',
			ROOMS: { idFromName: name => name, get: () => ( { fetch: async request => {

				sent.push( request );
				return { status: 101 };

			} } ) },
		};
		const sent = [];
		let answer = { open: true, spent: 0, seq: 1 };
		const limits = { liveOpen: async () => answer };
		const open = async ( kind, room, ip, world = null ) => {

			const token = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, clock, kind );
			const url = new URL( `https://worlddrive.app/api/live?room=${ encodeURIComponent( room ) }${ world ? `&world=${ world }` : '' }` );
			const headers = new Headers( { Upgrade: 'websocket', Origin: url.origin, 'Sec-WebSocket-Protocol': `${ PROTOCOL_WORLDS }, ${ PROTOCOL }, ${ token }`, 'CF-Connecting-IP': ip } );
			await live( { request: { headers }, env, url, limits, now: clock } );
			return sent.at( - 1 ).headers;

		};
		const owner = await open( 'owner', TYCHO_AREA, '203.0.113.21' );
		assert.equal( owner.get( 'X-Live-Uncounted' ), '1' );
		for ( const kind of [ 'moon', 'earth' ] ) {

			const theirs = await open( kind, FURKA_AREA, '203.0.113.22' );
			assert.equal( theirs.get( 'X-Live-Uncounted' ), null, kind );
			assert.equal( theirs.get( 'X-Live-Over' ), '', kind );

		}

		// DriveLimits saying the address is past its Moon share, for a party on the Earth: handed on,
		// but never for the owner's.
		answer = { open: true, spent: 0, seq: 1, over: [ 'moon' ] };
		const party = await open( 'moon', 'party:ABCDEFG', '203.0.113.23', 'earth' );
		assert.equal( party.get( 'X-Live-Over' ), 'moon' );
		assert.equal( party.get( 'X-Live-Uncounted' ), null );
		assert.equal( ( await open( 'owner', 'party:ABCDEFG', '203.0.113.23', 'earth' ) ).get( 'X-Live-Over' ), '' );

	} );

	test( '/api/live: an address DriveLimits turned away for the day (past its share of a world, or its visits) is remembered by the Worker instance and turned away without asking again, only on that world (or only its Moon visits) and until midnight UTC; every visit but the owner\'s says its address and share, only the Moon\'s its visits', async () => {

		const asked = [];
		let answer = { open: true, spent: 0, refused: true, reason: 'share' };
		const limits = { liveOpen: async options => {

			asked.push( options );
			return answer;

		} };
		const env = { TURNSTILE_SECRET: PASS_SECRET, LIVE_DAILY_BUDGET: '7781', LIVE_MOON_DAILY_BUDGET: '7782' };
		const now = clock;
		const open = async ( kind, room, ip, { world = null, at = now } = {} ) => {

			const token = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, at, kind );
			const url = new URL( `https://worlddrive.app/api/live?room=${ encodeURIComponent( room ) }${ world ? `&world=${ world }` : '' }` );
			const headers = new Headers( { Upgrade: 'websocket', Origin: url.origin, 'Sec-WebSocket-Protocol': `${ PROTOCOL_WORLDS }, ${ PROTOCOL }, ${ token }`, 'CF-Connecting-IP': ip } );
			try {

				await live( { request: { headers }, env, url, limits, now: at } );
				return { status: 101 };

			} catch ( err ) {

				return { status: err.status, error: err.message };

			}

		};
		// Past its share on the Moon: turned away, and then without asking, whichever visit.
		assert.deepEqual( await open( 'moon', TYCHO_AREA, '203.0.113.7' ), { status: 429, error: 'Too many drivers from here today' } );
		assert.equal( asked.length, 1 );
		assert.equal( asked[ 0 ].share, 8 );
		assert.equal( typeof asked[ 0 ].address, 'string' );
		assert.equal( asked[ 0 ].addressVisits, 20 );
		assert.deepEqual( await open( 'moon', TYCHO_AREA, '203.0.113.7' ), { status: 429, error: 'Too many drivers from here today' } );
		assert.deepEqual( await open( 'earth', 'party:ABCDEFG', '203.0.113.7', { world: 'moon' } ), { status: 429, error: 'Too many drivers from here today' } );
		assert.equal( asked.length, 1 );
		// On the Earth it's asked (its share there is its own), with its address and share and no
		// count of visits (an Earth visit's are its caps).
		answer = { open: true, spent: 0, refused: true };
		assert.deepEqual( await open( 'earth', FURKA_AREA, '203.0.113.7' ), { status: 429, error: 'Too many connections' } );
		assert.equal( asked.length, 2 );
		assert.deepEqual( [ asked[ 1 ].world, asked[ 1 ].share, asked[ 1 ].address, asked[ 1 ].addressVisits ], [ 'earth', 8, asked[ 0 ].address, undefined ] );
		// The owner's isn't held to it, nor says its address; another address is asked.
		assert.equal( ( await open( 'owner', TYCHO_AREA, '203.0.113.7' ) ).status, 429 );
		assert.equal( asked.length, 3 );
		assert.deepEqual( [ asked[ 2 ].address, asked[ 2 ].share ], [ undefined, undefined ] );
		await open( 'moon', TYCHO_AREA, '203.0.113.8' );
		assert.equal( asked.length, 4 );
		// Past its Moon visits: its Moon visits are turned away without asking, on both worlds, its
		// Earth visits asked.
		answer = { open: true, spent: 0, refused: true, reason: 'address' };
		assert.equal( ( await open( 'moon', FURKA_AREA, '203.0.113.9' ) ).status, 429 );
		assert.equal( ( await open( 'moon', 'party:ABCDEFG', '203.0.113.9', { world: 'moon' } ) ).status, 429 );
		assert.equal( asked.length, 5 );
		await open( 'earth', FURKA_AREA, '203.0.113.9' );
		assert.equal( asked.length, 6 );
		// The next day, asked again.
		answer = { open: true, spent: 0, refused: true, reason: 'share' };
		await open( 'moon', TYCHO_AREA, '203.0.113.7', { at: now + DAY } );
		assert.equal( asked.length, 7 );

	} );

	test( 'in a party across worlds, what a driver spent is counted against the world it was on, even when nobody is left on that world to carry it (and through hibernation)', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const env = { LIMITS: limits.binding };
		const room = new DriveRoom( ctx, env );
		// Una on the Moon, and three on the Earth who each send thirty keepalives (within the burst)
		// and go, leaving only Una, on the Moon, to carry what they spent.
		const una = await hello( room, ctx, { version: 2, world: 'moon' }, MOON_HELLO );
		const earthly = [];
		for ( let i = 0; i < 3; i ++ ) earthly.push( await hello( room, ctx, { version: 2 } ) );
		for ( const ann of earthly ) for ( let i = 0; i < 30; i ++ ) await ping( room, ann );
		for ( const ann of earthly ) await leave( room, ann );
		// The room hibernates before it reports: what they left is kept in Una's attachment, apart.
		const woken = new DriveRoom( ctx, env );
		await wait( woken, ctx, REPORT_MS );
		const [ report ] = limits.reports;
		// Their connecting, hello and keepalives are the Earth's, and none of it the Moon's, whose share
		// is only Una's and the room's own alarms and report (the room's own world being the Moon's now
		// that only Una is in it).
		const theirs = 3 * ( COST.connect + 31 * COST.message );
		assert.ok( report.amount >= theirs - 1e-9, `${ report.amount } for the Earth's` );
		assert.ok( report.amount <= theirs + 1e-9, `${ report.amount } for the Earth's` );
		assert.ok( report.moon <= COST.connect + COST.message + 3 * COST.alarm + COST.report + 1e-9, `${ report.moon } for the Moon's` );
		assert.equal( una.closedWith, null );

		// Those let in on the Moon as the Earth's day was spent, moving onto the Earth (closed there and
		// then, shutClosed), with only Ben, who came in before, on the Earth: what they spent is the
		// Moon's, carried by Ben apart from his own, not the Earth's.
		const later = runtime();
		const closing = new DriveRoom( later, env );
		limits.reports.length = 0;
		const ben = await hello( closing, later, { version: 2 } );
		limits.open = false;
		const slys = [];
		for ( let i = 0; i < 3; i ++ ) slys.push( await hello( closing, later, { version: 2, world: 'moon', closed: 'earth' }, MOON_HELLO ) );
		for ( const sly of slys ) {

			for ( let i = 0; i < 30; i ++ ) await ping( closing, sly );
			await say( closing, sly, { t: 'away', world: 'earth' } );
			assert.deepEqual( sly.closedWith, { code: CLOSE.off, reason: BUDGET_SPENT } );

		}

		assert.equal( ben.closedWith, null );
		limits.open = true;
		await wait( closing, later, REPORT_MS );
		const [ second ] = limits.reports;
		const moons = 3 * ( COST.connect + 32 * COST.message );
		assert.ok( second.moon >= moons - 1e-9, `${ second.moon } for the Moon's` );
		assert.ok( second.moon <= moons + 1e-9, `${ second.moon } for the Moon's` );
		assert.ok( second.amount <= COST.connect + COST.message + 3 * COST.alarm + COST.report + 1e-9, `${ second.amount } for the Earth's` );

	} );

	test( 'a Moon area\'s room: all its spend is the Moon\'s, its dots are where its drivers are on the Moon, and LIVE_MOON_DAILY_BUDGET=0 switches off only the Moon\'s', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const ann = await hello( room, ctx, { name: TYCHO_AREA, version: 2 }, MOON_HELLO );
		const ben = await hello( room, ctx, { name: TYCHO_AREA, version: 2 }, MOON_HELLO );
		await drive( room, ctx, ann, REPORT_MS + 5 * SECOND, [ ben ], step => moonCarAt( TYCHO.lat, TYCHO.lon, { north: step, speed: 10 } ) );
		const [ report ] = limits.reports;
		assert.equal( report.amount, 0 );
		assert.ok( report.moon > 5 );
		assert.equal( report.online.room, TYCHO_AREA );
		const [ dot ] = report.online.dots;
		assert.equal( dot.count, 2 );
		assert.ok( Math.abs( dot.lat - TYCHO.lat ) < 0.03 && Math.abs( dot.lon - TYCHO.lon ) < 0.03, JSON.stringify( dot ) );
		// Its world's budget of 0: closed as they next say anything. An Earth budget of 0 doesn't.
		const earthCtx = runtime();
		const earthOff = new DriveRoom( earthCtx, { LIMITS: limits.binding, LIVE_DAILY_BUDGET: '0' } );
		const cal = await hello( earthOff, earthCtx, { name: TYCHO_AREA, version: 2 }, MOON_HELLO );
		await ping( earthOff, cal );
		assert.equal( cal.closedWith, null );
		const moonCtx = runtime();
		const moonOff = new DriveRoom( moonCtx, { LIMITS: limits.binding, LIVE_MOON_DAILY_BUDGET: '0' } );
		const dee = await arrive( moonOff, moonCtx, { name: TYCHO_AREA, version: 2 } );
		await ping( moonOff, dee );
		// (Off on that world only, the others open: WORLD_OFF, so a v3 page closes that world alone.)
		assert.deepEqual( dee.closedWith, { code: CLOSE.off, reason: WORLD_OFF } );

	} );


	// --- Mars, Vesta and Ceres (protocol v3) ---

	const helloOn = world => ( { place: SPOT_ON[ world ] } );

	test( 'v3: a Mars area\'s room answers v3 and takes Mars places and cars in Mars\'s frame; an Earth, Moon or Vesta state is no car there, nor an Earth place a place', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const enter = () => hello( room, ctx, { name: GALE_AREA, version: 3 }, helloOn( 'mars' ) );
		const ann = await enter();
		const ben = await enter();
		assert.deepEqual( ann.said().map( m => [ m.t, m.player.world, m.player.place ] ), [ [ 'join', 'mars', GALE ] ] );
		assert.deepEqual( ben.welcome.players.map( p => [ p.world, p.place ] ), [ [ 'mars', GALE ] ] );
		const car = worldCarAt( 'mars', { speed: 5 } );
		await say( room, ann, { t: 's', s: car } );
		assert.deepEqual( ben.said().filter( m => m.t === 'S' ).map( m => m.s[ 0 ].slice( 1, 12 ) ), [ car ] );
		await wait( room, ctx, FLUSH_MS );
		for ( const wrong of [ carAt( 46.5725, 8.4153 ), moonCarAt( TYCHO.lat, TYCHO.lon ), worldCarAt( 'vesta' ), worldCarAt( 'mars', { height: 60000 } ) ] ) {

			await say( room, ann, { t: 's', s: wrong } );
			await wait( room, ctx, FLUSH_MS );
			await ping( room, ben );
			assert.deepEqual( ben.said().filter( m => m.t === 'S' ), [] );
			assert.equal( ann.closedWith, null );

		}

		await say( room, ann, { t: 'place', place: FURKA } );
		await say( room, ann, { t: 'place', place: TYCHO } );
		assert.deepEqual( ben.said(), [] );
		// Moving about Mars: heard, with Mars's world.
		await say( room, ann, { t: 'place', place: { ...GALE, name: 'Mount Sharp', height: 5000 } } );
		assert.deepEqual( ben.said(), [ { t: 'place', pid: ann.pid, place: { ...GALE, name: 'Mount Sharp', height: 5000 } } ] );

	} );

	test( 'v3 in a party across five worlds: a v3 page hears a Mars driver\'s world, place, car, tricks and honks; a v2 or v1 page hears only that they\'re on the globe (away), and none of the rest; away\'s globe goes to v3 pages only', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limitsStub().binding } );
		const v1 = await hello( room, ctx, { version: 1 } );
		const v2 = await hello( room, ctx, { version: 2 } );
		const v3 = await hello( room, ctx, { version: 3 } );
		const max = await hello( room, ctx, { version: 3, world: 'mars' }, helloOn( 'mars' ) );
		const joinOf = ws => ws.said().find( m => m.t === 'join' && m.player.pid === max.pid ).player;
		const seen = ( { world, place, away, s } ) => ( { world, place, away, s } );
		assert.deepEqual( seen( joinOf( v3 ) ), { world: 'mars', place: GALE, away: false, s: null } );
		assert.deepEqual( seen( joinOf( v2 ) ), { world: undefined, place: null, away: true, s: null } );
		assert.deepEqual( seen( joinOf( v1 ) ), { world: undefined, place: null, away: true, s: null } );
		// Max's car, a trick and a honk: to the v3 page alone.
		await say( room, max, { t: 's', s: worldCarAt( 'mars' ) } );
		await wait( room, ctx, FLUSH_MS );
		await say( room, max, { t: 'trick', score: 1500 } );
		await say( room, max, { t: 'honk' } );
		assert.deepEqual( v3.said().map( m => m.t ), [ 'S', 'trick', 'honk' ] );
		assert.deepEqual( [ v2.said(), v1.said() ], [ [], [] ] );
		// A Mars state from an Earth driver (or an Earth state from Max) is no car of theirs.
		await say( room, v3, { t: 's', s: worldCarAt( 'mars' ) } );
		await say( room, max, { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		await wait( room, ctx, FLUSH_MS );
		await ping( room, v2 );
		assert.deepEqual( [ v2.said(), max.said() ], [ [], [] ] );
		// Max to Mars's globe after looking at Vesta's: v3 pages hear which globe; the others today's away.
		await say( room, max, { t: 'away', world: 'mars', globe: 'vesta' } );
		assert.deepEqual( v3.said(), [ { t: 'away', pid: max.pid, globe: 'vesta' } ] );
		// (v1 and v2 had Max away already: told so again, as on the Moon, with no globe.)
		assert.deepEqual( [ v2.said(), v1.said() ], [ [ { t: 'away', pid: max.pid } ], [ { t: 'away', pid: max.pid } ] ] );
		// And to someone joining, v3: away with the globe; v2: away, none.
		const late3 = await hello( room, ctx, { version: 3 } );
		const late2 = await hello( room, ctx, { version: 2 } );
		const inWelcome = ws => ( ( { away, globe, world } ) => ( { away, globe, world } ) )( ws.welcome.players.find( p => p.pid === max.pid ) );
		assert.deepEqual( inWelcome( late3 ), { away: true, globe: 'vesta', world: 'mars' } );
		assert.deepEqual( inWelcome( late2 ), { away: true, globe: undefined, world: undefined } );
		// The v3 Earth page goes to the Earth's globe looking at Ceres: v3 pages hear the globe; v2 and
		// v1 pages a plain away.
		for ( const ws of [ v1, v2, v3, max, late3, late2 ] ) ws.said();
		await say( room, v3, { t: 'away', world: 'earth', globe: 'ceres' } );
		assert.deepEqual( [ max.said(), late3.said() ], [ [ { t: 'away', pid: v3.pid, globe: 'ceres' } ], [ { t: 'away', pid: v3.pid, globe: 'ceres' } ] ] );
		assert.deepEqual( [ v1.said(), v2.said(), late2.said() ], [ [ { t: 'away', pid: v3.pid } ], [ { t: 'away', pid: v3.pid } ], [ { t: 'away', pid: v3.pid } ] ] );
		// Max drops in on Mars again: the place (clearing the globe) to v3; v2 and v1 that he's away (on
		// the globe, as far as they know, as a Moon place is to a v1 page).
		await say( room, max, { t: 'place', place: GALE } );
		assert.deepEqual( [ v3.said(), late3.said() ], [ [ { t: 'place', pid: max.pid, place: GALE } ], [ { t: 'place', pid: max.pid, place: GALE } ] ] );
		const away = [ { t: 'away', pid: max.pid } ];
		assert.deepEqual( [ v1.said(), v2.said(), late2.said() ], [ away, away, away ] );
		// A v2 page saying it's on Mars is not on Mars (a world it doesn't know): an Earth place, on the Earth.
		await say( room, v2, { t: 'place', place: { ...GALE, height: 100 } } );
		assert.deepEqual( max.said().filter( m => m.t === 'place' ).map( m => [ m.pid, m.place.world ] ), [ [ v2.pid, undefined ] ] );

	} );

	test( 'a far area\'s room spends only its own world\'s budget (amounts by world, every budget said, with the floor); its world spent closes everyone in it (BUDGET_SPENT); switched off there alone: WORLD_OFF, not \'off\'', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const ann = await hello( room, ctx, { name: RHEASILVIA_AREA, version: 3, from: 'from-ann' }, helloOn( 'vesta' ) );
		const ben = await hello( room, ctx, { name: RHEASILVIA_AREA, version: 3, from: 'from-ben' }, helloOn( 'vesta' ) );
		await drive( room, ctx, ann, REPORT_MS + 5 * SECOND, [ ben ], step => worldCarAt( 'vesta', { north: step, speed: 5 } ) );
		assert.equal( limits.full.length, 1 );
		const [ report ] = limits.full;
		assert.deepEqual( report.budgets, { earth: 40000, moon: 20000, mars: 4000, vesta: 3000, ceres: 3000 } );
		assert.equal( report.floor, 1000 );
		assert.deepEqual( [ report.amounts.earth, report.amounts.moon, report.amounts.mars ?? 0, report.amounts.ceres ?? 0 ], [ 0, 0, 0, 0 ] );
		assert.ok( report.amounts.vesta > 2 * COST.connect + COST.alarm + COST.report, JSON.stringify( report.amounts ) );
		// (Its dots go with it: Vesta's area's.)
		assert.equal( report.online.room, RHEASILVIA_AREA );
		assert.deepEqual( report.addresses.map( a => Object.keys( a ).sort() ), [ [ 'earth', 'from', 'moon', 'vesta' ], [ 'earth', 'from', 'moon', 'vesta' ] ] );
		// (And the legacy amount, the Earth's, nothing.)
		assert.deepEqual( [ limits.reports[ 0 ].amount, limits.reports[ 0 ].moon ], [ 0, 0 ] );
		// Mars spent: nothing here; Vesta spent: both closed for the budget.
		limits.worlds = { mars: { open: false }, vesta: { open: true }, ceres: { open: true } };
		await drive( room, ctx, ann, REPORT_MS, [ ben ], step => worldCarAt( 'vesta', { north: step, speed: 5 } ) );
		assert.deepEqual( [ ann.closedWith, ben.closedWith ], [ null, null ] );
		limits.worlds = { mars: { open: false }, vesta: { open: false }, ceres: { open: true } };
		await drive( room, ctx, ann, REPORT_MS, [ ben ], step => worldCarAt( 'vesta', { north: step, speed: 5 } ) );
		assert.deepEqual( [ ann.closedWith, ben.closedWith ], [ { code: CLOSE.off, reason: BUDGET_SPENT }, { code: CLOSE.off, reason: BUDGET_SPENT } ] );

		// Ceres switched off (its budget 0), the others on: a Ceres room's driver is closed with WORLD_OFF,
		// so a v3 page closes Ceres alone; with every budget 0 (or LIVE off), 'off'.
		const ceresCtx = runtime();
		const ceresOff = new DriveRoom( ceresCtx, { LIMITS: limits.binding, LIVE_CERES_DAILY_BUDGET: '0' } );
		const cal = await arrive( ceresOff, ceresCtx, { name: OCCATOR_AREA, version: 3 } );
		await ping( ceresOff, cal );
		assert.deepEqual( cal.closedWith, { code: CLOSE.off, reason: WORLD_OFF } );
		const allCtx = runtime();
		const allOff = new DriveRoom( allCtx, { LIMITS: limits.binding, LIVE_DAILY_BUDGET: '0', LIVE_MOON_DAILY_BUDGET: '0', LIVE_MARS_DAILY_BUDGET: '0', LIVE_VESTA_DAILY_BUDGET: '0', LIVE_CERES_DAILY_BUDGET: '0' } );
		const dee = await arrive( allOff, allCtx, { name: OCCATOR_AREA, version: 3 } );
		await ping( allOff, dee );
		assert.deepEqual( dee.closedWith, { code: CLOSE.off, reason: 'off' } );

	} );

	test( 'past its address\'s share of its world: a v3 connection is closed CLOSE.off with SHARE_SPENT (its page drives on alone there), a v2 one CLOSE.rate as before; the others drive on', async () => {

		const limits = limitsStub();
		const ctx = runtime();
		const room = new DriveRoom( ctx, { LIMITS: limits.binding } );
		const max = await hello( room, ctx, { version: 3, world: 'mars', from: 'from-x' }, helloOn( 'mars' ) );
		const old = await hello( room, ctx, { version: 2, from: 'from-y' } );
		const friend = await hello( room, ctx, { version: 3, from: 'from-z' } );
		limits.over = { earth: [ 'from-y' ], moon: [], mars: [ 'from-x' ], vesta: [], ceres: [] };
		await drive( room, ctx, friend, REPORT_MS + 5 * SECOND, [ max, old ] );
		assert.deepEqual( max.closedWith, { code: CLOSE.off, reason: SHARE_SPENT } );
		assert.deepEqual( old.closedWith, { code: CLOSE.rate, reason: 'too much from here today' } );
		assert.equal( friend.closedWith, null );
		// A v3 Earth driver from an address past its Mars share drives on on the Earth, but is closed
		// (SHARE_SPENT) as it drops in on Mars.
		const sly = await hello( room, ctx, { version: 3, from: 'from-w', over: 'mars' } );
		await ping( room, sly );
		assert.equal( sly.closedWith, null );
		await say( room, sly, { t: 'place', place: GALE } );
		assert.deepEqual( sly.closedWith, { code: CLOSE.off, reason: SHARE_SPENT } );

	} );

	test( 'a party\'s own alarms and reports are charged to the one world everyone in it is on; mixed, the Earth; with the Earth\'s budget 0, the open world most are on (ties in the worlds\' order)', async () => {

		const charged = async ( env, worlds ) => {

			const limits = limitsStub();
			const ctx = runtime();
			const room = new DriveRoom( ctx, { LIMITS: limits.binding, ...env } );
			const pages = [];
			for ( const world of worlds ) pages.push( await hello( room, ctx, { version: 3, ...( world === 'earth' ? {} : { world } ) }, world === 'earth' ? {} : helloOn( world ) ) );
			// Only keepalives (each page's own spend on its own world), a minute and more.
			await drive( room, ctx, pages[ 0 ], REPORT_MS + 5 * SECOND, pages.slice( 1 ), () => worlds[ 0 ] === 'earth' ? carAt( 46.5725, 8.4153 ) : worldCarAt( worlds[ 0 ] ) );
			const { amounts } = limits.full[ 0 ];
			// The room's own (its alarm and report, at least 2) on one world: the one whose amount isn't
			// only its drivers' (at most a connection, a hello and a few keepalives each, under 2.5 for those idle).
			return Object.entries( amounts ).filter( ( [ w, a ] ) => a > 0 && ( w !== worlds[ 0 ] ? a - worlds.filter( x => x === w ).length * ( COST.connect + 2 * COST.message ) >= 2 - 1e-9 : true ) ).map( ( [ w ] ) => w );

		};
		// All on Vesta: Vesta's.
		assert.deepEqual( await charged( {}, [ 'vesta', 'vesta' ] ), [ 'vesta' ] );
		// Mars and Ceres: the Earth's.
		const mixed = await charged( {}, [ 'mars', 'ceres' ] );
		assert.ok( mixed.includes( 'earth' ), JSON.stringify( mixed ) );
		// The Earth's budget 0: Ceres (two there, one on Mars).
		const most = await charged( { LIVE_DAILY_BUDGET: '0' }, [ 'mars', 'ceres', 'ceres' ] );
		assert.ok( most.includes( 'ceres' ) && ! most.includes( 'earth' ), JSON.stringify( most ) );
		// A tie: Mars before Ceres.
		const tie = await charged( { LIVE_DAILY_BUDGET: '0' }, [ 'ceres', 'mars' ] );
		assert.ok( tie.includes( 'mars' ) && ! tie.includes( 'earth' ), JSON.stringify( tie ) );

	} );

	test( '/api/live with v3: exactly [ v3, v2, v1, token ]; a far area only for a v3 page (v1 and v2 a 400), ?world= any world the version knows; the room told the version and world; a far world switched off, 503', async () => {

		const asked = [];
		const limits = { liveOpen: async options => ( asked.push( options ), { open: true, spent: 0, seq: 1, was: null, closed: [], over: [] } ) };
		const handed = [];
		const env = {
			TURNSTILE_SECRET: PASS_SECRET,
			ROOMS: { idFromName: name => name, get: name => ( { fetch: async request => ( handed.push( { name, headers: Object.fromEntries( request.headers ) } ), { status: 101 } ) } ) },
		};
		const now = clock;
		const open = async ( room, offer, { world = null, more = {} } = {} ) => {

			const token = await makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, now, 'earth' );
			const url = new URL( `https://worlddrive.app/api/live?room=${ encodeURIComponent( room ) }${ world ? `&world=${ world }` : '' }` );
			const headers = new Headers( { Upgrade: 'websocket', Origin: url.origin, 'Sec-WebSocket-Protocol': [ ...offer, token ].join( ', ' ), 'CF-Connecting-IP': `203.0.113.${ 40 + handed.length }` } );
			try {

				return ( await live( { request: { headers }, env: { ...env, ...more }, url, limits, now } ) ).status;

			} catch ( err ) {

				return err.status;

			}

		};
		const v1 = [ PROTOCOL ];
		const v2 = [ PROTOCOL_WORLDS, PROTOCOL ];
		const v3 = [ PROTOCOL_ALL, PROTOCOL_WORLDS, PROTOCOL ];
		for ( const area of [ GALE_AREA, RHEASILVIA_AREA, OCCATOR_AREA ] ) {

			assert.deepEqual( [ await open( area, v1 ), await open( area, v2 ) ], [ 400, 400 ], area );
			assert.equal( await open( area, v3 ), 101, area );
			assert.deepEqual( [ handed.at( - 1 ).name, handed.at( - 1 ).headers[ 'x-live-version' ], handed.at( - 1 ).headers[ 'x-live-world' ] ], [ area, '3', worldOfRoom( area ) ] );

		}

		// Malformed offers: v3 without v2, v3 last, v2 first with v3 after.
		for ( const offer of [ [ PROTOCOL_ALL, PROTOCOL ], [ PROTOCOL_WORLDS, PROTOCOL_ALL, PROTOCOL ], [ PROTOCOL_ALL ] ] ) assert.equal( await open( GALE_AREA, offer ), 400, offer.join() );
		// A party: ?world= any world the version knows.
		assert.equal( await open( 'party:ABCDEFG', v3, { world: 'vesta' } ), 101 );
		assert.deepEqual( [ handed.at( - 1 ).headers[ 'x-live-version' ], handed.at( - 1 ).headers[ 'x-live-world' ] ], [ '3', 'vesta' ] );
		assert.equal( await open( 'party:ABCDEFG', v3, { world: 'earth' } ), 101 );
		assert.deepEqual( [ await open( 'party:ABCDEFG', v2, { world: 'vesta' } ), await open( 'party:ABCDEFG', v3, { world: 'pluto' } ), await open( 'party:ABCDEFG', v1, { world: 'moon' } ) ], [ 400, 400, 400 ] );
		// v1 and v2 as before: the Moon's area for v2, the Earth's for both.
		assert.equal( await open( TYCHO_AREA, v2 ), 101 );
		assert.equal( handed.at( - 1 ).headers[ 'x-live-version' ], '2' );
		assert.equal( await open( FURKA_AREA, v1 ), 101 );
		assert.equal( handed.at( - 1 ).headers[ 'x-live-version' ], '1' );
		// The connection's ask is the world's own, with every budget and the floor.
		const vestaAsk = asked.find( a => a.world === 'vesta' );
		assert.deepEqual( [ vestaAsk.budgets, vestaAsk.floor, vestaAsk.share ], [ { earth: 40000, moon: 20000, mars: 4000, vesta: 3000, ceres: 3000 }, 1000, 8 ] );
		// Mars switched off: 503 there, Vesta still let in.
		const asks = asked.length;
		assert.equal( await open( GALE_AREA, v3, { more: { LIVE_MARS_DAILY_BUDGET: '0' } } ), 503 );
		assert.equal( asked.length, asks );
		assert.equal( await open( RHEASILVIA_AREA, v3, { more: { LIVE_MARS_DAILY_BUDGET: '0' } } ), 101 );

	} );
} );

// --- the page's side, here -------------------------------------------------------------------

// src/drive-app/live.js on stand-ins for what it uses of the browser: WebSockets the test opens,
// answers and closes as the room or the network would, /api/config answering as the test says, and
// its clock and timers moved by the test (node:test's mock timers, and performance.now).

describe( 'The page\'s side (src/drive-app/live.js), here on stand-ins for the browser', () => {

	let createLive;
	let Matrix4;
	let Object3D;
	let Vector3;
	let now = 0;
	// What /api/config answers, in turn (the last of them from then on; null: it can't be reached),
	// and how many times it's been asked.
	let configs = [ { live: true } ];
	let asked = 0;
	const sockets = [];
	const real = {};
	const PAD = { name: 'Test Pad', lat: 46.5725, lon: 8.4153, height: 2429 };
	const TOKEN = `v1.${ 'A'.repeat( 22 ) }.${ Math.floor( Date.now() / 1000 ) + 6 * 3600 }.${ 'B'.repeat( 43 ) }`;

	class PageSocket {

		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSING = 2;
		static CLOSED = 3;

		constructor( url, protocols ) {

			Object.assign( this, { url, protocols, room: new URL( url ).searchParams.get( 'room' ), world: new URL( url ).searchParams.get( 'world' ), readyState: 0, sent: [], listeners: new Map() } );
			sockets.push( this );

		}

		addEventListener( type, fn ) {

			if ( ! this.listeners.has( type ) ) this.listeners.set( type, [] );
			this.listeners.get( type ).push( fn );

		}

		send( text ) {

			if ( this.readyState !== 1 ) throw new Error( 'not open' );
			this.sent.push( text );

		}

		close() {

			this.readyState = 3;

		}

		// The room's (or the network's) side.
		emit( type, event = {} ) {

			for ( const fn of this.listeners.get( type ) ?? [] ) fn( event );

		}

		// (The protocol the room answered with: the one that knows of the Moon, unless it's said.)
		open( protocol = PROTOCOL_WORLDS ) {

			this.readyState = 1;
			this.protocol = protocol;
			this.emit( 'open' );

		}

		hear( message ) {

			this.emit( 'message', { data: typeof message === 'string' ? message : JSON.stringify( message ) } );

		}

		end( code ) {

			this.readyState = 3;
			this.emit( 'close', { code, reason: '' } );

		}

		// What the page has sent it: each message's t (a keepalive as its text).
		said() {

			return this.sent.map( text => text === PING ? PING : JSON.parse( text ).t );

		}

	}

	const welcome = ( ws, players = [] ) => ws.hear( { t: 'welcome', you: 'me000001', name: 'Guest 0001', star: false, room: ws.room, max: 20, players } );
	const friend = ( pid, more = {} ) => ( { pid, name: `Friend ${ pid }`, star: false, vehicle: 'go-kart', look: {}, place: null, away: true, s: null, ...more } );
	const settle = async () => {

		for ( let i = 0; i < 6; i ++ ) await new Promise( resolve => setImmediate( resolve ) );

	};
	// The clock `ms` on, in frames of 50 ms (each calling `frame`), the page's timers with it.
	async function advance( ms, frame = null ) {

		const until = now + ms;
		while ( now < until ) {

			const step = Math.min( 50, until - now );
			now += step;
			mock.timers.tick( step );
			frame?.();
			await settle();

		}

	}

	before( async () => {

		( { Matrix4, Object3D, Vector3 } = await import( 'three' ) );
		for ( const name of [ 'performance', 'location', 'localStorage', 'WebSocket', 'fetch' ] ) real[ name ] = Object.getOwnPropertyDescriptor( globalThis, name );
		mock.timers.enable( { apis: [ 'setTimeout', 'setInterval' ] } );
		Object.defineProperty( globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true } );
		globalThis.location = { protocol: 'https:', host: 'worlddrive.app' };
		globalThis.localStorage = { getItem: () => null, setItem: () => {} };
		globalThis.WebSocket = PageSocket;
		globalThis.fetch = async () => {

			asked ++;
			const answer = configs.length > 1 ? configs.shift() : configs[ 0 ];
			if ( answer === null ) throw new TypeError( 'Failed to fetch' );
			return new Response( JSON.stringify( answer ), { headers: { 'Content-Type': 'application/json' } } );

		};
		( { createLive } = await import( '../src/drive-app/live.js' ) );

	} );

	after( () => {

		mock.timers.reset();
		for ( const [ name, descriptor ] of Object.entries( real ) ) {

			if ( descriptor ) Object.defineProperty( globalThis, name, descriptor );
			else delete globalThis[ name ];

		}

	} );

	// A page on the globe, with nothing else of the browser's: its earth's frame is Earth's own (the
	// Moon's, the Moon's own), and its car (car()) is at the pad (on the Moon, at Tycho), moving north
	// at `speed` m/s each frame if it's told to. world(): which world it's on.
	function page( { world = () => 'earth', closed = [] } = {} ) {

		configs = [ { live: true } ];
		asked = 0;
		sockets.length = 0;
		const earth = { matrixWorld: new Matrix4(), updateWorldMatrix() {} };
		const spot = where => ( { getPositionToCartographic: ( p, out ) => Object.assign( out, { lat: where.lat * Math.PI / 180, lon: where.lon * Math.PI / 180, height: where.height } ) } );
		const moon = { group: { matrixWorld: new Matrix4(), updateWorldMatrix() {} }, ellipsoid: spot( TYCHO ) };
		const live = createLive( { earth, ellipsoid: spot( PAD ), moon, world, closed, visit: TOKEN, player: () => null, ride: { vehicle: 'go-kart', look: {} } } );
		const at = world() === 'moon' ? toMoonFrame( TYCHO.lat, TYCHO.lon, TYCHO.height ) : ecef( PAD.lat, PAD.lon, PAD.height );
		const pivot = new Object3D();
		pivot.position.set( at.x, at.y, at.z );
		const velocity = new Vector3();
		live.car = { pivot, velocity, flags: 128 };
		// A frame of driving at `speed` (m/s).
		live.drive = ( speed = 10 ) => {

			velocity.set( 0, 0, - speed );
			pivot.position.z += speed / 20;
			live.update( live.car );

		};
		return live;

	}

	const states = ws => ws.said().filter( t => t === 's' ).length;

	test( 'turned away at the door while the Worker says it\'s on: /api/config asked the first time only, and after 8 in a row it stops', async () => {

		const live = page();
		// (On the Earth alone: the Moon's off. Refusals are counted per world, and the visit's live ends
		// only when every open world has refused; with the Moon open, the Earth alone would close.)
		configs = [ { live: true, liveMoon: false } ];
		const ended = [];
		live.on( 'ended', reason => ended.push( reason ) );
		live.setPlace( PAD );
		for ( let i = 0; i < 20 && ! live.ended; i ++ ) {

			// Never let in (the browser can't say why: a token refused, say).
			sockets.at( - 1 ).end( 1006 );
			await advance( 31 * SECOND );

		}

		assert.deepEqual( ended, [ 'refused' ] );
		assert.equal( sockets.length, 8 );
		assert.equal( asked, 1 );
		await advance( 5 * MINUTE );
		assert.equal( sockets.length, 8 );

	} );

	test( 'turned away while DriveLimits can\'t say (liveReason \'unknown\'), or the Worker can\'t be reached: it keeps trying (asking every 5 minutes, or each time while it can\'t be reached), and gets back in', async () => {

		for ( const [ answer, asks ] of [ [ { live: false, liveReason: 'unknown' }, 3 ], [ null, 30 ] ] ) {

			const live = page();
			configs = [ answer ];
			live.setPlace( PAD );
			for ( let i = 0; i < 30; i ++ ) {

				sockets.at( - 1 ).end( 1006 );
				await advance( 31 * SECOND );

			}

			assert.equal( live.ended, null, JSON.stringify( answer ) );
			assert.equal( sockets.length, 31 );
			// Nearly fifteen minutes of them: asked at the first, then at the first five minutes on, and
			// ten (120 times otherwise); or, with no answer at all, each time.
			assert.equal( asked, asks, JSON.stringify( answer ) );
			// In again: and from then on, turned away is a new run of them.
			configs = [ { live: true } ];
			sockets.at( - 1 ).open();
			welcome( sockets.at( - 1 ) );
			assert.equal( live.status, 'live' );
			live.setNearby( false );

		}

		// Switched off, or the day's budget spent: over at once; or, the Worker restarting with LIVE
		// off, as soon as it answers again.
		for ( const [ answers, reason ] of [ [ [ { live: false } ], 'off' ], [ [ { live: false, liveReason: BUDGET_SPENT } ], 'budget' ], [ [ null, null, { live: false } ], 'off' ] ] ) {

			const live = page();
			configs = [ ...answers ];
			live.setPlace( PAD );
			for ( let i = 0; i < answers.length; i ++ ) {

				sockets.at( - 1 ).end( 1006 );
				await advance( 31 * SECOND );

			}

			assert.equal( live.ended, reason, JSON.stringify( answers ) );

		}

	} );

	test( 'a connection gone quiet (nothing heard after a keepalive for 10 s) is taken as dropped, and comes back', async () => {

		const live = page();
		live.setPlace( PAD );
		const ws = sockets.at( - 1 );
		ws.open();
		welcome( ws );
		// Alone, it sends nothing but its keepalive, KEEPALIVE_MS on; the room answers.
		await advance( KEEPALIVE_MS + 500 );
		assert.deepEqual( ws.said(), [ 'hello', PING ] );
		ws.hear( PONG );
		await advance( KEEPALIVE_MS );
		assert.deepEqual( ws.said(), [ 'hello', PING, PING ] );
		assert.equal( ws.readyState, 1 );
		// This one isn't answered, nor anything else heard: 10 s on, it's dropped, and tried again.
		await advance( 11 * SECOND );
		assert.equal( ws.readyState, 3 );
		assert.equal( live.status, 'retrying' );
		await advance( 1500 );
		assert.equal( sockets.length, 2 );
		assert.equal( sockets[ 1 ].room, ws.room );
		sockets[ 1 ].open();
		welcome( sockets[ 1 ] );
		assert.equal( live.status, 'live' );
		live.setNearby( false );

	} );

	test( 'an area all of whose rooms were full: tried again at the next drop-in there; alone in a shard, back to the first room; with others in it, staying', async () => {

		const cell = cellOf( PAD.lat, PAD.lon );
		const live = page();
		live.setPlace( PAD );
		for ( let shard = 0; shard < NEARBY_SHARDS; shard ++ ) {

			const ws = sockets.at( - 1 );
			assert.equal( ws.room, shard ? shardOf( cell, shard ) : cell );
			ws.open();
			ws.hear( { t: 'full', room: ws.room, max: 20 } );

		}

		assert.equal( live.status, 'busy' );
		const tried = sockets.length;
		await advance( MINUTE );
		assert.equal( sockets.length, tried );
		// Back to the globe and in again, in the same area: its first room again.
		live.setAway();
		live.setPlace( { ...PAD, lat: PAD.lat + 0.01 } );
		assert.equal( sockets.length, tried + 1 );
		assert.equal( sockets.at( - 1 ).room, cell );

		// The first full, in the next alone: in again, it's the first it tries.
		sockets.at( - 1 ).open();
		sockets.at( - 1 ).hear( { t: 'full', room: cell, max: 20 } );
		const alone = sockets.at( - 1 );
		assert.equal( alone.room, shardOf( cell, 1 ) );
		alone.open();
		welcome( alone );
		live.setAway();
		live.setPlace( PAD );
		assert.equal( sockets.at( - 1 ).room, cell );
		// The first full again; in the next with someone there: in again, it stays with them.
		sockets.at( - 1 ).open();
		sockets.at( - 1 ).hear( { t: 'full', room: cell, max: 20 } );
		const shared = sockets.at( - 1 );
		shared.open();
		welcome( shared, [ friend( 'friend01', { away: false, place: PAD } ) ] );
		const made = sockets.length;
		live.setAway();
		live.setPlace( PAD );
		assert.deepEqual( [ sockets.length, live.room ], [ made, shardOf( cell, 1 ) ] );
		live.setNearby( false );

	} );

	test( 'with only those on the globe in the room, the car goes at STILL_HZ; one dropping in has it at once, then SEND_HZ', async () => {

		const live = page();
		live.setPlace( PAD );
		const ws = sockets.at( - 1 );
		ws.open();
		welcome( ws, [ friend( 'friend01' ) ] );
		await advance( 10 * SECOND, () => live.drive() );
		const quiet = states( ws );
		assert.ok( quiet >= 4 && quiet <= 10 * STILL_HZ + 1, `${ quiet } states in 10 s` );
		// The friend drops in.
		ws.hear( { t: 'place', pid: 'friend01', place: PAD } );
		assert.equal( states( ws ), quiet + 1 );
		await advance( 2 * SECOND, () => live.drive() );
		const seen = states( ws ) - quiet - 1;
		assert.ok( seen >= 2 * SEND_HZ - 1 && seen <= 2 * SEND_HZ + 1, `${ seen } states in 2 s` );
		// Back to the globe, and it's slow again.
		ws.hear( { t: 'away', pid: 'friend01' } );
		const before = states( ws );
		await advance( 4 * SECOND, () => live.drive() );
		assert.ok( states( ws ) - before <= 4 * STILL_HZ + 1 );
		live.setNearby( false );

	} );

	// --- the Moon ---

	const sentOf = ( ws, t ) => ws.sent.filter( text => text !== PING ).map( text => JSON.parse( text ) ).filter( m => m.t === t );

	test( 'it offers the protocol that knows of every world, the one that knows of the Moon and the one before, then its token; on the Moon its area\'s room is the Moon\'s, the Earth\'s goes at once as its globe turns there, and a party is told which world it\'s on', async () => {

		let world = 'earth';
		const live = page( { world: () => world } );
		live.setPlace( PAD );
		const earthly = sockets.at( - 1 );
		assert.deepEqual( [ earthly.protocols, earthly.room, earthly.world ], [ [ PROTOCOL_ALL, PROTOCOL_WORLDS, PROTOCOL, TOKEN ], cellOf( PAD.lat, PAD.lon ), null ] );
		earthly.open();
		welcome( earthly );
		assert.deepEqual( sentOf( earthly, 'hello' )[ 0 ].world, 'earth' );
		// Back on the globe and turned to the Moon: the Earth's area is let go of now, not in a minute.
		live.setAway();
		world = 'moon';
		live.worldChanged();
		assert.equal( earthly.readyState, 3 );
		assert.equal( live.room, null );
		// Dropped in at Tycho: the Moon's area there.
		live.setPlace( TYCHO );
		const moony = sockets.at( - 1 );
		assert.deepEqual( [ moony.room, moony.world ], [ TYCHO_AREA, null ] );
		moony.open();
		welcome( moony );
		assert.deepEqual( sentOf( moony, 'hello' )[ 0 ].place, TYCHO );
		// A party, from the Moon: its room is told the page is on the Moon (its budget is the Moon's).
		live.joinParty( 'ABCDEFG' );
		const party = sockets.at( - 1 );
		assert.deepEqual( [ party.room, party.world ], [ 'party:ABCDEFG', 'moon' ] );
		party.open();
		welcome( party );
		// Back on the globe there, and turned to the Earth: the party is told, with the world.
		live.setAway();
		world = 'earth';
		live.worldChanged();
		assert.deepEqual( sentOf( party, 'away' ).map( m => m.world ), [ 'moon', 'earth' ] );
		live.leaveParty();
		live.setNearby( false );

	} );

	test( 'a room still running the code from before the Moon had drivers (it answers v1): on the Moon, the page is on the globe to it and sends no car', async () => {

		const live = page( { world: () => 'moon' } );
		live.joinParty( 'BCDEFGH' );
		live.setPlace( TYCHO );
		const ws = sockets.at( - 1 );
		ws.open( PROTOCOL );
		const [ hello ] = sentOf( ws, 'hello' );
		assert.deepEqual( [ hello.place, hello.away, hello.world ], [ null, true, undefined ] );
		welcome( ws, [ friend( 'friend01', { away: false, place: PAD } ) ] );
		await advance( 3 * SECOND, () => live.drive() );
		assert.equal( states( ws ), 0 );
		assert.deepEqual( sentOf( ws, 'place' ), [] );
		live.leaveParty();

	} );

	test( 'friends on the other world don\'t see this page\'s car: it goes at STILL_HZ (for their Join), and at SEND_HZ for one on its own world; their cars are checked in their world\'s frame', async () => {

		const live = page( { world: () => 'moon' } );
		live.joinParty( 'CDEFGHJ' );
		live.setPlace( TYCHO );
		const ws = sockets.at( - 1 );
		ws.open();
		const tychoCar = moonCarAt( TYCHO.lat, TYCHO.lon );
		welcome( ws, [ friend( 'earth001', { away: false, place: PAD, s: carAt( PAD.lat, PAD.lon ) } ) ] );
		assert.deepEqual( [ live.players.get( 'earth001' ).world, !! live.players.get( 'earth001' ).s ], [ 'earth', true ] );
		await advance( 10 * SECOND, () => live.drive() );
		const slow = states( ws );
		assert.ok( slow >= 4 && slow <= 10 * STILL_HZ + 1, `${ slow } states in 10 s` );
		// A friend on the Moon: at SEND_HZ. Her car's in the Moon's frame; an Earth one from her is none.
		ws.hear( { t: 'join', player: friend( 'moon0001', { away: false, place: TYCHO, world: 'moon', s: tychoCar } ) } );
		assert.deepEqual( live.players.get( 'moon0001' ).s, tychoCar );
		const before = states( ws );
		await advance( 2 * SECOND, () => live.drive() );
		const fast = states( ws ) - before;
		assert.ok( fast >= 2 * SEND_HZ - 1, `${ fast } states in 2 s` );
		const heard = [];
		live.on( 'states', ( { states: list } ) => heard.push( ...list.map( entry => entry.pid ) ) );
		ws.hear( { t: 'S', at: 1, s: [ [ 'moon0001', ...carAt( PAD.lat, PAD.lon ), 0 ], [ 'earth001', ...tychoCar, 0 ], [ 'moon0001', ...tychoCar, 0 ] ] } );
		assert.deepEqual( heard, [ 'moon0001' ] );
		live.leaveParty();

	} );

	test( 'a world\'s budget spent: alone there (closed), with others on the other world; both spent, over for the visit', async () => {

		let world = 'earth';
		const live = page( { world: () => world } );
		const closed = [];
		live.on( 'closed', ( { world: which, quiet } ) => closed.push( quiet ? `${ which }, quietly` : which ) );
		live.joinParty( 'DEFGHJK' );
		live.setPlace( PAD );
		const ws = sockets.at( - 1 );
		ws.open();
		welcome( ws );
		// The room closes it for the Earth's budget: on the Earth, it drives on alone, but the party isn't
		// dropped for a budget it needn't use: kept at once through the Moon's (the page away there, on
		// the globe to the others), sending no car from the Earth.
		ws.readyState = 3;
		ws.emit( 'close', { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.deepEqual( [ closed, live.closedHere, live.ended, live.world, live.gameWorld ], [ [ 'earth' ], true, null, 'moon', 'earth' ] );
		const through = sockets.at( - 1 );
		assert.deepEqual( [ through.room, through.world ], [ 'party:DEFGHJK', 'moon' ] );
		through.open();
		const [ hi ] = sentOf( through, 'hello' );
		assert.deepEqual( [ hi.place, hi.away, hi.world ], [ null, true, 'moon' ] );
		welcome( through, [ friend( 'friend02', { away: false, place: TYCHO, world: 'moon' } ) ] );
		await advance( 3 * SECOND, () => live.drive() );
		assert.equal( states( through ), 0 );
		const made = sockets.length;
		// On the Moon's globe: the same party room.
		live.setAway();
		world = 'moon';
		live.worldChanged();
		assert.equal( sockets.length, made );
		assert.equal( sockets.at( - 1 ), through );
		// Dropped, and turned away at the door as it comes back, with /api/config saying the Moon's is
		// spent too: over.
		configs = [ { live: false, liveReason: BUDGET_SPENT, liveMoon: false, liveMoonReason: BUDGET_SPENT } ];
		through.end( 1006 );
		for ( let i = 0; i < 10 && ! live.ended; i ++ ) {

			await advance( 5 * SECOND );
			if ( sockets.at( - 1 ) !== through && sockets.at( - 1 ).readyState === 0 ) sockets.at( - 1 ).end( 1006 );

		}

		assert.equal( live.ended, 'budget' );

		// Turned away on the Earth with /api/config saying only the Earth's is spent: closed there, not
		// over; and a Worker from before the Moon had rooms (no liveMoon) saying it's spent: over.
		for ( const [ answer, ended ] of [ [ { live: false, liveReason: BUDGET_SPENT, liveMoon: true }, null ], [ { live: false, liveReason: BUDGET_SPENT }, 'budget' ] ] ) {

			const again = page();
			configs = [ answer ];
			again.setPlace( PAD );
			sockets.at( - 1 ).end( 1006 );
			await advance( SECOND );
			assert.deepEqual( [ again.ended, again.closedHere ], [ ended, true ], JSON.stringify( answer ) );
			again.setNearby( false );

		}

		// Closed on the Earth from the start (/api/config said so as the page loaded): nothing tried
		// there; on the Moon, its area's room.
		let on = 'earth';
		const late = page( { world: () => on, closed: [ 'earth' ] } );
		late.setPlace( PAD );
		assert.deepEqual( [ sockets.length, late.status ], [ 0, 'closed' ] );
		on = 'moon';
		late.setAway();
		late.worldChanged();
		late.setPlace( TYCHO );
		assert.deepEqual( sockets.map( ws => ws.room ), [ TYCHO_AREA ] );
		late.setNearby( false );

		// The Moon switched off (its budget of 0: liveMoon false with no liveMoonReason): turned away
		// there, it's closed quietly (nothing said of lots of drivers), and it isn't over on the Earth.
		const quiet = page( { world: () => 'moon' } );
		const told = [];
		quiet.on( 'closed', ( { world: which, quiet: hush } ) => told.push( hush ? `${ which }, quietly` : which ) );
		configs = [ { live: true, liveMoon: false } ];
		quiet.setPlace( TYCHO );
		sockets.at( - 1 ).end( 1006 );
		await advance( SECOND );
		assert.deepEqual( [ told, quiet.ended, quiet.closedHere ], [ [ 'moon, quietly' ], null, true ] );
		quiet.setNearby( false );

	} );


	// --- five worlds (protocol v3) ---

	// A page with every world's frame (each body's group and its sphere, where its car would be at
	// that world's spot), on world(); config: what /api/config said.
	function pageOnWorlds( { world = () => 'earth', closed = [], config = null, answers = null } = {} ) {

		configs = answers ?? [ config ?? { live: true, liveMoon: true, liveWorlds: { earth: { open: true }, moon: { open: true }, mars: { open: true }, vesta: { open: true }, ceres: { open: true } } } ];
		asked = 0;
		sockets.length = 0;
		const group = () => ( { matrixWorld: new Matrix4(), updateWorldMatrix() {} } );
		const spot = where => ( { getPositionToCartographic: ( p, out ) => Object.assign( out, { lat: where.lat * Math.PI / 180, lon: where.lon * Math.PI / 180, height: where.height } ) } );
		const bodies = { moon: { group: group(), ellipsoid: spot( TYCHO ) }, mars: { group: group(), ellipsoid: spot( GALE ) }, vesta: { group: group(), ellipsoid: spot( RHEASILVIA ) }, ceres: { group: group(), ellipsoid: spot( OCCATOR ) } };
		const live = createLive( { earth: group(), ellipsoid: spot( PAD ), bodies, world, closed, visit: TOKEN, player: () => null, ride: { vehicle: 'go-kart', look: {} } } );
		const pivot = new Object3D();
		const velocity = new Vector3();
		live.car = { pivot, velocity, flags: 128 };
		// A frame of driving at `speed` m/s, at the game's world's spot.
		live.drive = ( speed = 10 ) => {

			const on = world();
			const at = on === 'earth' ? ecef( PAD.lat, PAD.lon, PAD.height ) : toFrame( ( { moon: TYCHO, ...SPOT_ON } )[ on ].lat, ( { moon: TYCHO, ...SPOT_ON } )[ on ].lon, ( { moon: TYCHO, ...SPOT_ON } )[ on ].height, on );
			velocity.set( 0, 0, - speed );
			pivot.position.set( at.x, at.y, at.z + ( pivot.userData.z = ( pivot.userData.z ?? 0 ) + speed / 20 ) );
			live.update( live.car );

		};
		return live;

	}

	test( 'v3 on Mars: its area\'s room is Mars\'s, the page offers v3 and says Mars as its world; a party from Mars says &world=mars; friends\' worlds and globes are read as v3 knows them; its car goes in Mars\'s frame, theirs checked in theirs', async () => {

		const { worldsOf } = await import( '../src/drive-app/live.js' );
		const all = { liveWorlds: { earth: { open: true }, moon: { open: true }, mars: { open: true }, vesta: { open: true }, ceres: { open: true } } };
		assert.deepEqual( worldsOf( all ), { earth: 'open', moon: 'open', mars: 'open', vesta: 'open', ceres: 'open' } );
		assert.deepEqual( worldsOf( { liveWorlds: { ...all.liveWorlds, vesta: { open: false, reason: BUDGET_SPENT }, ceres: { open: false } } } ), { earth: 'open', moon: 'open', mars: 'open', vesta: 'spent', ceres: 'off' } );
		// An older Worker (no liveWorlds): the Earth and the Moon from the legacy keys, the far worlds off.
		assert.deepEqual( worldsOf( { live: true, liveMoon: false, liveMoonReason: BUDGET_SPENT } ), { earth: 'open', moon: 'spent', mars: 'off', vesta: 'off', ceres: 'off' } );
		let world = 'mars';
		const live = pageOnWorlds( { world: () => world } );
		assert.equal( live.world, 'mars' );
		assert.deepEqual( live.openWorlds(), [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ] );
		live.setPlace( GALE );
		const area = sockets.at( - 1 );
		assert.deepEqual( [ area.room, area.world, area.protocols ], [ GALE_AREA, null, [ PROTOCOL_ALL, PROTOCOL_WORLDS, PROTOCOL, TOKEN ] ] );
		area.open( PROTOCOL_ALL );
		const [ hello ] = sentOf( area, 'hello' );
		assert.deepEqual( [ hello.place, hello.away, hello.world, hello.globe ], [ GALE, false, 'mars', undefined ] );
		// Friends: one on Vesta's globe, one driving on Ceres, one on a world v3 doesn't know (the Earth's).
		const marsCar = worldCarAt( 'mars' );
		welcome( area, [
			friend( 'f1', { away: true, world: 'earth', globe: 'vesta' } ),
			friend( 'f2', { away: false, place: OCCATOR, world: 'ceres' } ),
			friend( 'f3', { away: false, place: GALE, world: 'mars', s: marsCar } ),
			friend( 'f4', { away: false, place: { ...FURKA, world: 'pluto' }, world: 'pluto' } ),
		] );
		const p = pid => ( ( { world, globe, away } ) => ( { world, globe, away } ) )( live.players.get( pid ) );
		assert.deepEqual( [ p( 'f1' ), p( 'f2' ), p( 'f3' ) ], [ { world: 'earth', globe: 'vesta', away: true }, { world: 'ceres', globe: null, away: false }, { world: 'mars', globe: null, away: false } ] );
		assert.equal( p( 'f4' ).world, 'earth' );
		assert.deepEqual( live.players.get( 'f3' ).s, marsCar );
		// f2 to Mars's globe: away with that globe; then dropping in on Mars clears it.
		area.hear( { t: 'away', pid: 'f2', globe: 'mars' } );
		assert.deepEqual( p( 'f2' ), { world: 'ceres', globe: 'mars', away: true } );
		area.hear( { t: 'place', pid: 'f2', place: GALE } );
		assert.deepEqual( p( 'f2' ), { world: 'mars', globe: null, away: false } );
		// Its car: in Mars's frame, checked as Mars's; a state from f3 in the Earth's frame is none of hers.
		await advance( SECOND, () => live.drive() );
		const sent = sentOf( area, 's' ).at( - 1 ).s;
		assert.ok( checkState( sent, 'mars' ), JSON.stringify( sent ) );
		const heard = [];
		live.on( 'states', ( { states: list } ) => heard.push( ...list.map( entry => entry.pid ) ) );
		area.hear( { t: 'S', at: 1, s: [ [ 'f3', ...carAt( PAD.lat, PAD.lon ), 0 ], [ 'f3', ...marsCar, 0 ] ] } );
		assert.deepEqual( heard, [ 'f3' ] );
		// A party from Mars: &world=mars.
		live.joinParty( 'EFGHJKL' );
		const party = sockets.at( - 1 );
		assert.deepEqual( [ party.room, party.world ], [ 'party:EFGHJKL', 'mars' ] );
		party.open( PROTOCOL_ALL );
		welcome( party );
		// Back on the globe and turned to Vesta's: the party is told, with Vesta's world and globe.
		live.setAway();
		world = 'vesta';
		live.worldChanged();
		assert.deepEqual( sentOf( party, 'away' ).at( - 1 ), { t: 'away', world: 'vesta', globe: 'vesta' } );
		live.leaveParty();
		live.setNearby( false );

	} );

	test( 'v3 room on old code (answering v1 or v2): on Mars the page is on the globe to it and sends no car; a 400 for a Mars area from a Worker before v3 counts as a refusal on Mars alone', async () => {

		for ( const answered of [ PROTOCOL, PROTOCOL_WORLDS ] ) {

			const live = pageOnWorlds( { world: () => 'mars' } );
			live.joinParty( 'FGHJKLM' );
			live.setPlace( GALE );
			const ws = sockets.at( - 1 );
			ws.open( answered );
			const [ hello ] = sentOf( ws, 'hello' );
			assert.deepEqual( [ hello.place, hello.away, hello.globe ], [ null, true, undefined ], answered );
			welcome( ws, [ friend( 'friend01', { away: false, place: PAD } ) ] );
			await advance( 3 * SECOND, () => live.drive() );
			assert.equal( states( ws ), 0, answered );
			assert.deepEqual( sentOf( ws, 'place' ), [] );
			live.leaveParty();

		}

		// The Mars area turned away at the door 8 times while /api/config says Mars is open: Mars closed
		// (quietly), live not over; the Earth still open.
		let world = 'mars';
		const live = pageOnWorlds( { world: () => world } );
		const closed = [];
		live.on( 'closed', e => closed.push( e ) );
		live.setPlace( GALE );
		for ( let i = 0; i < 12 && ! live.closedWorlds.has( 'mars' ); i ++ ) {

			sockets.at( - 1 ).end( 1006 );
			await advance( 31 * SECOND );

		}

		assert.deepEqual( [ live.closedWorlds.has( 'mars' ), live.ended, live.world, live.closedHere ], [ true, null, 'earth', true ] );
		assert.deepEqual( closed.map( ( { world: w, quiet } ) => [ w, quiet ] ), [ [ 'mars', true ] ] );
		const made = sockets.length;
		await advance( MINUTE );
		assert.equal( sockets.length, made );
		// On the Earth: its area's room as ever.
		live.setAway();
		world = 'earth';
		live.worldChanged();
		live.setPlace( PAD );
		assert.equal( sockets.at( - 1 ).room, FURKA_AREA );
		live.setNearby( false );

		// With the Earth and the Moon open too, 8 refusals on the Earth close the Earth alone; only when
		// every open world has refused 8 times is live over for the visit ('refused').
		const earthly = page();
		earthly.setPlace( PAD );
		for ( let i = 0; i < 12 && ! earthly.closedWorlds.has( 'earth' ); i ++ ) {

			sockets.at( - 1 ).end( 1006 );
			await advance( 31 * SECOND );

		}

		assert.deepEqual( [ earthly.closedWorlds.has( 'earth' ), earthly.ended, earthly.world ], [ true, null, 'moon' ] );
		earthly.setNearby( false );

	} );

	test( 'per world closing: CLOSE.off with WORLD_OFF (switched off there alone) closes that world quietly; with SHARE_SPENT it closes it with the share toast\'s event, keeping the party through another open world; BUDGET_SPENT the same with the budget\'s; \'off\' ends live everywhere', async () => {

		const run = async ( reason, world = 'vesta' ) => {

			const live = pageOnWorlds( { world: () => world } );
			const closed = [];
			const ended = [];
			live.on( 'closed', e => closed.push( e ) );
			live.on( 'ended', e => ended.push( e ) );
			live.joinParty( 'GHJKLMN' );
			live.setPlace( SPOT_ON[ world ] );
			const party = sockets.at( - 1 );
			assert.deepEqual( [ party.room, party.world ], [ 'party:GHJKLMN', world ] );
			party.open( PROTOCOL_ALL );
			welcome( party );
			party.readyState = 3;
			party.emit( 'close', { code: CLOSE.off, reason } );
			return { live, closed, ended, party };

		};
		// Vesta switched off alone: Vesta closed quietly; the party back at once through the Earth (the
		// first open world), the page away there with Vesta's globe.
		const off = await run( WORLD_OFF );
		assert.deepEqual( off.closed, [ { world: 'vesta', quiet: true, share: false } ] );
		assert.deepEqual( [ off.ended, off.live.world, off.live.gameWorld, off.live.closedHere, [ ...off.live.closedWorlds ] ], [ [], 'earth', 'vesta', true, [ 'vesta' ] ] );
		const back = sockets.at( - 1 );
		assert.deepEqual( [ back.room, back.world ], [ 'party:GHJKLMN', null ] );
		back.open( PROTOCOL_ALL );
		const [ again ] = sentOf( back, 'hello' );
		assert.deepEqual( [ again.place, again.away, again.world, again.globe ], [ null, true, 'earth', 'vesta' ] );
		welcome( back );
		assert.equal( off.live.status, 'live' );
		// Driving on alone on Vesta: no car to the party (it's through the Earth's room).
		await advance( 3 * SECOND, () => off.live.drive() );
		assert.equal( states( back ), 0 );
		// Turned to Mars's globe (open): Mars is where its rooms are now; told so.
		off.live.setAway();
		off.live.leaveParty();
		off.live.setNearby( false );

		// Past its share on Mars: Mars closed, with share (the page toasts SHARE_TOAST), not quiet.
		const share = await run( SHARE_SPENT, 'mars' );
		assert.deepEqual( share.closed, [ { world: 'mars', quiet: false, share: true } ] );
		assert.deepEqual( [ share.ended, share.live.world, share.live.openWorlds() ], [ [], 'earth', [ 'earth', 'moon', 'vesta', 'ceres' ] ] );
		share.live.leaveParty();
		share.live.setNearby( false );
		// Ceres's budget spent: closed, not quiet, no share.
		const spent = await run( BUDGET_SPENT, 'ceres' );
		assert.deepEqual( spent.closed, [ { world: 'ceres', quiet: false, share: false } ] );
		assert.deepEqual( spent.ended, [] );
		spent.live.leaveParty();
		spent.live.setNearby( false );
		// 'off' (LIVE off, or every world's budget 0): over for the visit, every world.
		const all = await run( 'off', 'mars' );
		assert.deepEqual( all.ended, [ 'off' ] );
		all.live.setNearby( false );

	} );

	test( 'here(): on a closed world the rooms\' world is the last open one it was on, else the first open; with every live world closed, nothing (live over); a world closed from the start is never tried, and closing the last open world ends live', async () => {

		let world = 'mars';
		// Vesta and Ceres spent at load.
		const live = pageOnWorlds( { world: () => world, closed: [ 'vesta', 'ceres' ] } );
		assert.equal( live.world, 'mars' );
		live.setAway();
		world = 'vesta';
		live.worldChanged();
		// On spent Vesta: Mars's rooms (the last open world it was on).
		assert.deepEqual( [ live.world, live.gameWorld, live.closedHere ], [ 'mars', 'vesta', true ] );
		live.setPlace( RHEASILVIA );
		assert.deepEqual( [ sockets.length, live.status ], [ 0, 'closed' ] );
		// A party joined there goes through Mars, the page away (globe Vesta).
		live.joinParty( 'HJKLMNP' );
		const party = sockets.at( - 1 );
		assert.deepEqual( [ party.room, party.world ], [ 'party:HJKLMNP', 'mars' ] );
		party.open( PROTOCOL_ALL );
		const [ hello ] = sentOf( party, 'hello' );
		assert.deepEqual( [ hello.away, hello.world, hello.globe ], [ true, 'mars', 'vesta' ] );
		welcome( party, [ friend( 'm1', { away: false, place: GALE, world: 'mars' } ) ] );
		// Mars's budget spent now: the party goes on through the Earth (first open), still away.
		party.readyState = 3;
		party.emit( 'close', { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.deepEqual( [ live.world, [ ...live.closedWorlds ].sort(), live.ended ], [ 'earth', [ 'ceres', 'mars', 'vesta' ], null ] );
		const through = sockets.at( - 1 );
		assert.deepEqual( [ through.room, through.world ], [ 'party:HJKLMNP', null ] );
		through.open( PROTOCOL_ALL );
		welcome( through );
		// Then the Earth's and the Moon's spent: nothing open, over for the visit.
		through.readyState = 3;
		through.emit( 'close', { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.equal( live.world, 'moon' );
		const last = sockets.at( - 1 );
		last.open( PROTOCOL_ALL );
		welcome( last );
		last.readyState = 3;
		last.emit( 'close', { code: CLOSE.off, reason: BUDGET_SPENT } );
		assert.deepEqual( [ live.world, live.ended ], [ null, 'budget' ] );

	} );
} );

// --- the globe's Driving now, here ------------------------------------------------------------

// src/drive-app/online.js on stand-ins for the browser and the globe: /api/online answering as the
// test says, and the panel's "Driving now" as it's set.

describe( 'The globe\'s "Driving now" (src/drive-app/online.js), here on stand-ins for the browser', () => {

	let createOnline;
	const saved = {};

	before( async () => {

		for ( const key of [ 'window', 'document', 'fetch' ] ) saved[ key ] = Object.getOwnPropertyDescriptor( globalThis, key );
		globalThis.window = { addEventListener() {}, innerWidth: 400, innerHeight: 800 };
		globalThis.document = { visibilityState: 'visible' };
		( { createOnline } = await import( '../src/drive-app/online.js' ) );

	} );

	after( () => {

		for ( const [ key, descriptor ] of Object.entries( saved ) ) {

			if ( descriptor ) Object.defineProperty( globalThis, key, descriptor );
			else delete globalThis[ key ];

		}

	} );

	// A globe on `world` whose /api/online answers as `answers` says (by address): the panel's
	// "Driving now" as last set (shown()), live.js's stand-in, and turn( world ).
	function globe( { world = 'earth', answers, earthless = false } ) {

		let on = world;
		const set = [];
		globalThis.fetch = async url => ( { ok: true, headers: new Headers( { 'Content-Type': 'application/json' } ), json: async () => answers[ url ] } );
		const shape = {
			getCartographicToPosition: ( lat, lon, height, target ) => target.set( lat, lon, height ),
			getCartographicToNormal: ( lat, lon, target ) => target.set( 0, 0, 1 ),
		};
		const live = { players: new Map(), status: 'live', room: null, place: null, ended: null, visitEnds: Infinity, closedHere: false };
		const online = createOnline( {
			camera: {}, earth: {}, ellipsoid: shape, moon: { group: {}, ellipsoid: shape }, world: () => on, canvas: { addEventListener() {}, style: {} }, live,
			layer: { append() {}, hidden: false }, panel: { setOnline: shown => set.push( shown ), pinned: null, setPin() {} }, covers: [], mode: () => 'globe',
			onPick() {}, onZoom() {}, earthless,
		} );
		const shown = () => {

			const last = set.at( - 1 );
			return last && { summary: last.summary, rows: last.areas.map( row => `${ row.title } · ${ row.subtitle }` ) };

		};
		return { online, live, shown, turn: next => on = next };

	}

	test( 'nobody on the Earth and two on the Moon: it says so (not "be the first" over a row of two), and the row turns the globe there', async () => {

		const { online, shown } = globe( { answers: { '/api/online': { on: true, total: 0, areas: [], moon: 2 } } } );
		await online.refresh();
		assert.deepEqual( shown(), { summary: 'Nobody driving on the Earth right now: 2 drivers on the Moon.', rows: [ 'On the Moon · 2 drivers' ] } );
		// And nobody on either: as ever.
		const alone = globe( { answers: { '/api/online': { on: true, total: 0, areas: [], moon: 0 } } } );
		await alone.online.refresh();
		assert.deepEqual( alone.shown(), { summary: 'Nobody driving right now: be the first.', rows: [] } );

	} );

	test( 'the Earth\'s day spent: its own dots gone, but the row to the Moon stays while anyone\'s there, and it goes on asking for it', async () => {

		const answers = { '/api/online': { on: false, total: 0, areas: [], moon: 2 } };
		const { online, shown } = globe( { answers } );
		await online.refresh();
		assert.equal( online.on, false );
		assert.deepEqual( shown(), { summary: '2 drivers on the Moon right now.', rows: [ 'On the Moon · 2 drivers' ] } );
		answers[ '/api/online' ] = { on: false, total: 0, areas: [], moon: 1 };
		await online.refresh();
		assert.deepEqual( shown(), { summary: '1 driver on the Moon right now.', rows: [ 'On the Moon · 1 driver' ] } );
		// Nobody there: nothing shown at all.
		answers[ '/api/online' ] = { on: false, total: 0, areas: [] };
		await online.refresh();
		assert.equal( shown(), null );

	} );

	test( 'a visit with no Earth (moonOnly): no "On the Earth" row on the Moon, which would lead to the used-up screen', async () => {

		const moon = { on: true, total: 1, areas: [ { lat: - 43.31, lon: - 11.36, height: - 1200, count: 1 } ], earth: 3 };
		const { online, shown } = globe( { world: 'moon', earthless: true, answers: { '/api/online?world=moon': moon } } );
		await online.refresh();
		assert.deepEqual( shown().rows, [ 'Near Tycho crater · 1 driver' ] );
		// With the Earth, it's there.
		const both = globe( { world: 'moon', answers: { '/api/online?world=moon': moon } } );
		await both.online.refresh();
		assert.deepEqual( both.shown().rows, [ 'Near Tycho crater · 1 driver', 'On the Earth · 3 drivers' ] );

	} );

	test( 'just back on the globe from driving on the Moon and turned to the Earth: the one on the Moon it would count is this page itself, so it doesn\'t', async () => {

		const { online, live, shown, turn } = globe( { world: 'moon', answers: { '/api/online': { on: true, total: 0, areas: [], moon: 1 } } } );
		live.room = 'moon:0.0';
		online.left( { lat: - 43.31, lon: - 11.36 } );
		turn( 'earth' );
		await online.refresh();
		assert.deepEqual( [ shown(), online.elsewhere ], [ { summary: 'Nobody driving right now: be the first.', rows: [] }, 0 ] );

	} );


	test( 'across five worlds: on Mars its own dots (each a Mars place, so Drive here stays on Mars) and Mars\'s spot names; one other world with drivers, today\'s row; two or more, "On other worlds" (onOthers with the row); `worlds` self-discounted, kept when off, null when live is over; onCounts only on a change', async () => {

		let on = 'mars';
		const set = [];
		const counted = [];
		const others = [];
		const W = ( e, m, ma, v, c ) => ( { earth: { on: true, total: e }, moon: { on: true, total: m }, mars: { on: true, total: ma }, vesta: { on: v !== null, total: v ?? 0 }, ceres: { on: true, total: c } } );
		const answers = {
			'/api/online?world=mars': { on: true, total: 3, areas: [ { lat: - 5.4, lon: 137.8, height: - 4500, count: 3 } ], worlds: W( 0, 0, 3, 0, 0 ) },
			'/api/online': { on: true, total: 0, areas: [], moon: 2, worlds: W( 0, 2, 1, 4, 0 ) },
		};
		const fetched = [];
		globalThis.fetch = async url => ( fetched.push( url ), { ok: true, headers: new Headers( { 'Content-Type': 'application/json' } ), json: async () => answers[ url ] } );
		const shape = {
			getCartographicToPosition: ( lat, lon, height, target ) => target.set( lat, lon, height ),
			getCartographicToNormal: ( lat, lon, target ) => target.set( 0, 0, 1 ),
		};
		const live = { players: new Map(), status: 'live', room: null, place: null, ended: null, visitEnds: Infinity, closedHere: false, closedWorlds: new Set() };
		const body = { group: {}, ellipsoid: shape };
		const online = createOnline( {
			camera: {}, earth: {}, ellipsoid: shape, bodies: { moon: body, mars: body, vesta: body, ceres: body }, world: () => on, canvas: { addEventListener() {}, style: {} }, live,
			layer: { append() {}, hidden: false }, panel: { setOnline: shown => set.push( shown ), pinned: null, setPin() {} }, covers: [], mode: () => 'globe',
			onPick() {}, onZoom() {}, onOthers: row => others.push( row ), onCounts: w => counted.push( w ),
		} );
		await online.refresh();
		assert.equal( fetched.at( - 1 ), '/api/online?world=mars' );
		assert.equal( online.world, 'mars' );
		assert.equal( set.at( - 1 ).summary, '3 driving on Mars now. Tap a glowing dot to join them.' );
		// (A Mars dot's place is on Mars: a Mars dot never flies to the Earth.)
		assert.equal( set.at( - 1 ).areas[ 0 ].place.world, 'mars' );
		assert.equal( set.at( - 1 ).areas[ 0 ].title, 'Near Mount Sharp' );
		assert.deepEqual( online.worlds.mars, { on: true, total: 3 } );
		// Back on the globe from driving on Mars in its area's room, turned to the Earth: this page off
		// Mars's count, so the orrery agrees with the panel.
		live.room = GALE_AREA;
		online.left( { lat: GALE.lat, lon: GALE.lon } );
		on = 'earth';
		await online.refresh();
		const last = set.at( - 1 );
		assert.deepEqual( [ last.summary, last.areas.map( a => `${ a.title } · ${ a.subtitle }` ) ], [ 'Nobody driving on the Earth right now: 6 drivers on other worlds.', [ 'On other worlds · 6 drivers' ] ] );
		assert.deepEqual( online.worlds, { earth: { on: true, total: 0 }, moon: { on: true, total: 2 }, mars: { on: true, total: 0 }, vesta: { on: true, total: 4 }, ceres: { on: true, total: 0 } } );
		last.areas[ 0 ].onClick( { currentTarget: 'ROW' } );
		assert.deepEqual( others, [ 'ROW' ] );
		assert.equal( counted.length, 2 );
		// The same again: no onCounts.
		await online.refresh();
		assert.equal( counted.length, 2 );
		// Vesta off: one other world with drivers (the Moon): today's row.
		answers[ '/api/online' ] = { on: true, total: 0, areas: [], moon: 2, worlds: W( 0, 2, 0, null, 0 ) };
		await online.refresh();
		assert.deepEqual( set.at( - 1 ).areas.map( a => `${ a.title } · ${ a.subtitle }` ), [ 'On the Moon · 2 drivers' ] );
		assert.equal( counted.length, 3 );
		// The Earth off: its worlds kept, from the off answer (Mars's 5 still less this page, just back
		// from driving there: 4).
		answers[ '/api/online' ] = { on: false, total: 0, areas: [], moon: 2, worlds: { ...W( 0, 2, 5, null, 0 ), earth: { on: false, total: 0 } } };
		await online.refresh();
		assert.deepEqual( [ online.on, online.worlds.mars, set.at( - 1 ).summary ], [ false, { on: true, total: 4 }, '6 drivers on other worlds right now.' ] );
		// Live over for the visit: null, and onCounts( null ).
		live.ended = 'budget';
		online.update();
		assert.deepEqual( [ online.worlds, counted.at( - 1 ) ], [ null, null ] );

	} );
} );

// --- who's driving now -----------------------------------------------------------------------

describe( 'Who\'s driving now: where, as dots', () => {

	test( 'Earth-centred metres to latitude, longitude and height and back, exact to a millimetre: known points, and as three.js\'s ellipsoid has them', async () => {

		const a = 6378137;
		const b = 6356752.314245179;
		// Within `degrees` (1e-9° is 0.1 mm) and a millimetre of height.
		const near = ( got, want, what, degrees = 1e-9 ) => {

			assert.ok( Math.abs( got.lat - want.lat ) < degrees && Math.abs( got.lon - want.lon ) < degrees && Math.abs( got.height - want.height ) < 1e-3, `${ what }: ${ JSON.stringify( got ) }` );

		};
		near( toGeodetic( a, 0, 0 ), { lat: 0, lon: 0, height: 0 }, 'the equator at Greenwich' );
		near( toGeodetic( 0, a + 100, 0 ), { lat: 0, lon: 90, height: 100 }, '90° E, 100 m up' );
		near( toGeodetic( - a, 0, 0 ), { lat: 0, lon: 180, height: 0 }, 'the date line' );
		near( toGeodetic( 0, 0, b ), { lat: 90, lon: 0, height: 0 }, 'the North Pole' );
		near( toGeodetic( 0, 0, - b - 2000 ), { lat: - 90, lon: 0, height: 2000 }, '2 km over the South Pole' );
		// The Furka Pass, as the test's own sum (ecef above) has it.
		near( toGeodetic( ...Object.values( ecef( 46.5725, 8.4153, 2429 ) ) ), { lat: 46.5725, lon: 8.4153, height: 2429 }, 'the Furka Pass' );
		assert.deepEqual( Object.values( toEcef( 46.5725, 8.4153, 2429 ) ).map( v => v.toFixed( 3 ) ), Object.values( ecef( 46.5725, 8.4153, 2429 ) ).map( v => v.toFixed( 3 ) ) );

		// And three.js's (3d-tiles-renderer's WGS84 ellipsoid, the tiles' and the test globe's), from
		// below the Dead Sea to flying high, everywhere: to a millimetre (by the poles, its latitude is
		// the one that's a fraction of one out).
		const { WGS84_ELLIPSOID } = await import( '3d-tiles-renderer' );
		const { Vector3 } = await import( 'three' );
		let seed = 7;
		const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
		for ( let i = 0; i < 2000; i ++ ) {

			const [ lat, lon, height ] = [ random() * 180 - 90, random() * 360 - 180, random() * 25000 - 1000 ];
			const at = WGS84_ELLIPSOID.getCartographicToPosition( lat * Math.PI / 180, lon * Math.PI / 180, height, new Vector3() );
			const ours = toEcef( lat, lon, height );
			assert.ok( Math.hypot( ours.x - at.x, ours.y - at.y, ours.z - at.z ) < 1e-3 );
			const theirs = WGS84_ELLIPSOID.getPositionToCartographic( at, {} );
			const back = toGeodetic( at.x, at.y, at.z );
			near( back, { lat, lon, height }, `${ lat }, ${ lon }, ${ height }` );
			near( back, { lat: theirs.lat * 180 / Math.PI, lon: theirs.lon * 180 / Math.PI, height: theirs.height }, `three's ${ lat }, ${ lon }, ${ height }`, 1e-8 );

		}

	} );

	test( 'a room\'s drivers as dots: those within DOT_SPREAD of one another together, at most ROOM_DOTS, each at its drivers\' mean rounded to 0.01° and 10 m, inside its room\'s area, busiest first', () => {

		const at = ( north, east = 0, height = 2430 ) => toEcef( FURKA.lat + north / 111200, FURKA.lon + east / ( 111320 * Math.cos( FURKA.lat * Math.PI / 180 ) ), height );
		// Alone.
		assert.deepEqual( dotsOf( [ at( 0, 0, 2429 ) ], FURKA_AREA ), [ FURKA_DOT ] );
		assert.deepEqual( dotsOf( [], FURKA_AREA ), [] );
		// Two 1.5 km apart: one dot, at their mean (750 m north of the first).
		const mean = toGeodetic( ...Object.values( at( 750 ) ) );
		assert.deepEqual( dotsOf( [ at( 0 ), at( 1500 ) ], FURKA_AREA ), [ { lat: Math.round( mean.lat * 100 ) / 100, lon: 8.42, height: 2430, count: 2 } ] );
		// 2.5 km apart: two.
		assert.equal( dotsOf( [ at( 0 ), at( - 2500 ) ], FURKA_AREA ).length, 2 );
		assert.ok( DOT_SPREAD === 2000 && ROOM_DOTS === 3 );
		// Greedily: each joins the nearest dot begun within DOT_SPREAD of it (here the first, 1.8 km
		// off, though the second's first is 2.2 km off), or begins one.
		const greedy = dotsOf( [ at( 0 ), at( 0, 4000 ), at( 0, 1800 ), at( - 3000 ) ], FURKA_AREA );
		assert.deepEqual( greedy.map( dot => dot.count ), [ 2, 1, 1 ] );
		// Past ROOM_DOTS, each joins the nearest.
		const spread = dotsOf( [ at( 0 ), at( - 3000 ), at( - 6000 ), at( 0, 3000 ), at( - 6000, 300 ) ], FURKA_AREA );
		assert.equal( spread.length, ROOM_DOTS );
		assert.equal( spread.reduce( ( sum, dot ) => sum + dot.count, 0 ), 5 );
		assert.deepEqual( spread.map( dot => dot.count ), [ 2, 2, 1 ] );
		// Sorted busiest first, then from the south-west; and each inside the area (its edges at least
		// 0.002° away): a driver on the edge of it, or past it (drove out, and the room hasn't followed
		// yet), is still in its room's area, so dropping in on the dot puts you there.
		const { south, north, west, east } = boundsOf( FURKA_AREA );
		for ( const [ lat, lon ] of [ [ south, west ], [ north - 1e-9, east - 1e-9 ], [ north + 0.01, FURKA.lon ], [ FURKA.lat, west - 0.003 ] ] ) {

			const [ dot ] = dotsOf( [ toEcef( lat, lon, 100 ) ], FURKA_AREA );
			assert.equal( cellOf( dot.lat, dot.lon ), FURKA_AREA, JSON.stringify( dot ) );
			assert.ok( dot.lat - south >= 0.002 && north - dot.lat >= 0.002 && dot.lon - west >= 0.002 && east - dot.lon >= 0.002, JSON.stringify( dot ) );
			assert.deepEqual( [ dot.lat, dot.lon ].map( v => Math.round( v * 100 ) / 100 ), [ dot.lat, dot.lon ] );

		}

		// By 180°: a car just over it, in the area west of it still (its room hasn't followed yet), is
		// by the area's east edge, not its west; and two either side of it are one dot there.
		const last = cellOf( 0.05, 179.95 );
		assert.equal( boundsOf( last ).east, 180 );
		assert.equal( dotsOf( [ toEcef( 0.05, - 179.995 ) ], last )[ 0 ].lon, 179.99 );
		assert.deepEqual( dotsOf( [ toEcef( 0.05, 179.997 ), toEcef( 0.05, - 179.997 ) ], last ).map( dot => [ dot.lon, dot.count ] ), [ [ 179.99, 2 ] ] );

	} );

	test( 'a dot as sent: checked and rounded, or nothing', () => {

		assert.deepEqual( checkDot( { lat: 46.571234, lon: 8.4199, height: 2434.9, count: 3, name: 'not kept' } ), { lat: 46.57, lon: 8.42, height: 2430, count: 3 } );
		for ( const bad of [ null, 'dot', { ...FURKA_DOT, lat: 91 }, { ...FURKA_DOT, lon: - 181 }, { ...FURKA_DOT, count: 0 }, { ...FURKA_DOT, count: 1.5 }, { ...FURKA_DOT, count: '2' }, { ...FURKA_DOT, height: Infinity }, { lat: 1, lon: 2, count: 1 } ] ) {

			assert.equal( checkDot( bad ), null, JSON.stringify( bad ) );

		}

	} );

	test( 'the Moon\'s areas are as big as the Earth\'s, in its own frame; its dots on its sphere; its places and cars checked against its ground', () => {

		// Its sphere is moon.js's.
		assert.equal( MOON_RADIUS, MOON_SPHERE );
		// An area's height: 0.36° of the Moon is 10.9 km, as 0.1° of the Earth is 11.1 km; and as wide.
		const area = boundsOf( TYCHO_AREA );
		const tall = ( area.north - area.south ) * Math.PI / 180 * MOON_RADIUS;
		const wide = ( area.east - area.west ) * Math.PI / 180 * MOON_RADIUS * Math.cos( TYCHO.lat * Math.PI / 180 );
		assert.ok( Math.abs( tall - 10916 ) < 50 && wide > 10000 && wide < 12500, `${ tall } × ${ wide }` );
		assert.equal( MOON_CELL_DEG, 0.36 );
		assert.deepEqual( parseRoom( shardOf( TYCHO_AREA, 3 ) ), { kind: 'near', world: 'moon', cell: TYCHO_AREA, shard: 3, max: 20 } );
		for ( const bad of [ 'moon:500.0', 'moon:499.99999', `${ TYCHO_AREA }#4`, 'mars:1000.0', 'pluto:1.1' ] ) assert.equal( parseRoom( bad ), null, bad );
		// The same numbers on the Earth are another area altogether.
		assert.notEqual( cellOf( TYCHO.lat, TYCHO.lon ), TYCHO_AREA );
		// Moon-centred metres and back, to a millimetre; a dot where its drivers are, inside its area.
		const at = toMoonFrame( TYCHO.lat, TYCHO.lon, TYCHO.height );
		const back = fromMoonFrame( at.x, at.y, at.z );
		assert.ok( Math.abs( back.lat - TYCHO.lat ) < 1e-9 && Math.abs( back.lon - TYCHO.lon ) < 1e-9 && Math.abs( back.height - TYCHO.height ) < 1e-3 );
		assert.deepEqual( dotsOf( [ at, toMoonFrame( TYCHO.lat + 0.001, TYCHO.lon, TYCHO.height ) ], TYCHO_AREA ), [ { lat: - 43.31, lon: - 11.36, height: - 1200, count: 2 } ] );
		// A car on the Moon is no car on the Earth, and the other way round; a place's world is kept
		// only as the Moon's, with the Moon's heights.
		const car = moonCarAt( TYCHO.lat, TYCHO.lon );
		assert.deepEqual( [ !! checkState( car, 'moon' ), !! checkState( car ), !! checkState( carAt( 46.5725, 8.4153 ), 'moon' ) ], [ true, false, false ] );
		assert.deepEqual( checkPlace( { ...TYCHO, height: - 9000 } ), { ...TYCHO, height: - 9000 } );
		assert.equal( checkPlace( { ...TYCHO, height: - 9000, world: 'earth' } ), null );
		// (A world that isn't one is the Earth's; Mars's is kept, with its own heights.)
		assert.deepEqual( Object.keys( checkPlace( { ...FURKA, world: 'pluto' } ) ), [ 'name', 'lat', 'lon', 'height' ] );
		assert.deepEqual( checkPlace( { ...FURKA, world: 'mars' } ), { ...FURKA, world: 'mars' } );

	} );

} );

describe( 'Five worlds on the wire (live-protocol.js v3): areas, bands, frames and checks per world', () => {

	test( 'v3 next to v1 and v2: the page offers all three, newest first; versionOf reads a room\'s answer; KNOWN_WORLDS are literals (a sixth world is v4)', () => {

		assert.equal( PROTOCOL_ALL, 'worlddrive-live.v3' );
		assert.deepEqual( PAGE_PROTOCOLS, [ PROTOCOL_ALL, PROTOCOL_WORLDS, PROTOCOL ] );
		assert.ok( Object.isFrozen( PAGE_PROTOCOLS ) );
		assert.deepEqual( [ PROTOCOL, PROTOCOL_WORLDS, PROTOCOL_ALL, 'worlddrive-live.v4', '', undefined ].map( versionOf ), [ 1, 2, 3, 0, 0, 0 ] );
		assert.deepEqual( KNOWN_WORLDS, { 1: [ 'earth' ], 2: [ 'earth', 'moon' ], 3: [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ] } );
		assert.ok( Object.isFrozen( KNOWN_WORLDS ) && Object.values( KNOWN_WORLDS ).every( Object.isFrozen ) );
		assert.deepEqual( LIVE_WORLD_IDS, [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ] );
		// Which version knows which world.
		const table = [ 1, 2, 3 ].map( v => LIVE_WORLD_IDS.map( w => knows( v, w ) ) );
		assert.deepEqual( table, [ [ true, false, false, false, false ], [ true, true, false, false, false ], [ true, true, true, true, true ] ] );
		for ( const bad of [ 'pluto', 'constructor', '__proto__', null, undefined, 1 ] ) assert.equal( knows( 3, bad ), false, String( bad ) );

	} );

	test( 'each world\'s areas are about 11 km on a side, its own rooms (mars:, vesta:, ceres:), round-tripping through parseRoom and boundsOf; nothing falls back to the Earth', () => {

		assert.deepEqual( CELL_DEGS, { earth: 0.1, moon: 0.36, mars: 0.18, vesta: 2.4, ceres: 1.25 } );
		const SIDES = { earth: [ 11100, 6371009 ], moon: [ 10900, MOON_RADIUS ], mars: [ 10600, WORLDS.mars.radius ], vesta: [ 11000, WORLDS.vesta.radius ], ceres: [ 10300, WORLDS.ceres.radius ] };
		for ( const world of LIVE_WORLD_IDS ) {

			const [ side, radius ] = SIDES[ world ];
			const tall = CELL_DEGS[ world ] * Math.PI / 180 * radius;
			assert.ok( Math.abs( tall - side ) < 100, `${ world }: ${ tall } m` );
			// Random spots: the area holds the spot, its name parses back to itself, every shard too,
			// and its world is the world.
			let seed = 7;
			const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
			for ( let i = 0; i < 400; i ++ ) {

				const lat = random() * 179.8 - 89.9;
				const lon = random() * 359.8 - 179.9;
				const cell = cellOf( lat, lon, world );
				assert.equal( cell.split( ':' )[ 0 ], world === 'earth' ? 'near' : world );
				assert.equal( worldOfRoom( cell ), world );
				assert.ok( cell.length <= 40 );
				assert.deepEqual( parseRoom( cell ), { kind: 'near', world, cell, shard: 0, max: 20 }, cell );
				assert.deepEqual( parseRoom( shardOf( cell, 3 ) ), { kind: 'near', world, cell, shard: 3, max: 20 } );
				const b = boundsOf( cell );
				assert.ok( lat >= b.south - 1e-9 && lat <= b.north + 1e-9 && lon >= b.west - 1e-9 && lon <= b.east + 1e-9, `${ cell } ${ lat } ${ lon }` );

			}

		}

		assert.match( GALE_AREA, /^mars:\d+\.\d+$/ );
		assert.match( RHEASILVIA_AREA, /^vesta:\d+\.\d+$/ );
		assert.match( OCCATOR_AREA, /^ceres:\d+\.\d+$/ );
		// Past a world's last band or column, a fifth shard, another prefix: no room.
		for ( const bad of [ 'mars:1000.0', 'vesta:75.0', 'ceres:144.0', `${ GALE_AREA }#4`, 'pluto:1.1', 'Mars:1.1', 'constructor:1.1' ] ) assert.equal( parseRoom( bad ), null, bad );
		// The same numbers on two worlds are two rooms.
		assert.equal( new Set( LIVE_WORLD_IDS.map( w => cellOf( GALE.lat, GALE.lon, w ) ) ).size, 5 );
		// A world that isn't one throws (it is never taken for the Earth); worldOfRoom says null.
		for ( const bad of [ 'pluto', null, 'Mars' ] ) assert.throws( () => cellOf( 1, 2, bad ), TypeError, String( bad ) );
		assert.throws( () => boundsOf( 'pluto:1.1' ) );
		assert.throws( () => toFrame( 1, 2, 0, 'pluto' ) );
		assert.deepEqual( [ 'party:ABCDEFG', 'constructor:1.1', '', null ].map( worldOfRoom ), [ null, null, null, null ] );

	} );

	test( 'a car\'s STATE is checked against its own world\'s band, and no two worlds\' bands overlap: a car on one is never one on another', () => {

		assert.deepEqual( STATE_RADII, { earth: [ 6340000, 6400000 ], moon: [ MOON_RADIUS - 12000, MOON_RADIUS + 30000 ], mars: [ 3377000, 3442000 ], vesta: [ 207700, 334700 ], ceres: [ 438000, 528500 ] } );
		// Each far world's: its radius with its lowest ground less 3 km to its highest plus its flying margin.
		const MARGIN = { mars: 30000, vesta: 40000, ceres: 40000 };
		for ( const w of [ 'mars', 'vesta', 'ceres' ] ) assert.deepEqual( STATE_RADII[ w ], [ WORLDS[ w ].radius + WORLDS[ w ].lowest - 3000, WORLDS[ w ].radius + WORLDS[ w ].highest + MARGIN[ w ] ], w );
		const sorted = Object.values( STATE_RADII ).toSorted( ( a, b ) => a[ 0 ] - b[ 0 ] );
		for ( let i = 1; i < sorted.length; i ++ ) assert.ok( sorted[ i ][ 0 ] > sorted[ i - 1 ][ 1 ], JSON.stringify( sorted ) );
		// A car at each world's spot checks only there.
		const carsOn = { earth: carAt( 46.5725, 8.4153 ), moon: moonCarAt( TYCHO.lat, TYCHO.lon ), mars: worldCarAt( 'mars' ), vesta: worldCarAt( 'vesta' ), ceres: worldCarAt( 'ceres' ) };
		for ( const [ on, car ] of Object.entries( carsOn ) ) assert.deepEqual( LIVE_WORLD_IDS.map( w => !! checkState( car, w ) ), LIVE_WORLD_IDS.map( w => w === on ), on );
		// Flying: Vesta's car 38 km over its highest ground still is one; 45 km over, it isn't.
		assert.ok( checkState( worldCarAt( 'vesta', { height: WORLDS.vesta.highest + 38000 } ), 'vesta' ) );
		assert.equal( checkState( worldCarAt( 'vesta', { height: WORLDS.vesta.highest + 45000 } ), 'vesta' ), null );
		// A world that isn't one checks nothing (not the Earth's).
		assert.equal( checkState( carsOn.earth, 'pluto' ), null );

	} );

	test( 'the far worlds\' frames are level.js\'s pointOn exactly (a sphere of the world\'s radius, planetocentric), and back to a millimetre', () => {

		let seed = 11;
		const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
		for ( const world of [ 'moon', 'mars', 'vesta', 'ceres' ] ) {

			for ( let i = 0; i < 300; i ++ ) {

				const [ lat, lon, height ] = [ random() * 180 - 90, random() * 360 - 180, PLACE_HEIGHTS[ world ][ 0 ] + random() * ( PLACE_HEIGHTS[ world ][ 1 ] - PLACE_HEIGHTS[ world ][ 0 ] ) ];
				const at = toFrame( lat, lon, height, world );
				assert.deepEqual( [ at.x, at.y, at.z ], pointOn( world, lat, lon, height ), world );
				const back = fromFrame( at.x, at.y, at.z, world );
				assert.ok( Math.abs( back.lat - lat ) < 1e-9 && Math.abs( back.lon - lon ) < 1e-9 && Math.abs( back.height - height ) < 1e-3, `${ world } ${ lat } ${ lon } ${ height }` );

			}

		}

		// (The Earth's stays ECEF.)
		assert.deepEqual( toFrame( 46.5725, 8.4153, 2429 ), toEcef( 46.5725, 8.4153, 2429 ) );
		assert.throws( () => toBodyFrame( 1, 2, 0, 'earth' ) );

	} );

	test( 'a PLACE keeps its world for the Moon, Mars, Vesta and Ceres, checked against that world\'s heights; anything else is the Earth\'s with no world', () => {

		assert.deepEqual( PLACE_HEIGHTS, { earth: [ - 2000, 10000 ], moon: [ - 12000, 12000 ], mars: [ - 9500, 22500 ], vesta: [ - 52000, 32000 ], ceres: [ - 29000, 18500 ] } );
		for ( const spot of [ GALE, RHEASILVIA, OCCATOR ] ) {

			assert.deepEqual( checkPlace( spot ), spot );
			assert.equal( placeWorld( checkPlace( spot ) ), spot.world );
			const [ low, high ] = PLACE_HEIGHTS[ spot.world ];
			assert.ok( checkPlace( { ...spot, height: low } ) && checkPlace( { ...spot, height: high } ) );
			assert.equal( checkPlace( { ...spot, height: low - 1 } ), null );
			assert.equal( checkPlace( { ...spot, height: high + 1 } ), null );

		}

		// Olympus Mons's 21 km is Mars's, no place on the Earth; Rheasilvia's -20 km is no Earth place.
		assert.equal( checkPlace( { ...GALE, height: 21000, world: undefined } ), null );
		assert.equal( checkPlace( { ...RHEASILVIA, world: 'earth' } ), null );
		// No world, the Earth's, or one that isn't: the Earth's, no world kept.
		for ( const world of [ undefined, 'earth', 'pluto', 'MARS', 7 ] ) {

			const place = checkPlace( { ...FURKA, world } );
			assert.deepEqual( place, FURKA, String( world ) );
			assert.equal( placeWorld( place ), 'earth' );

		}

		assert.deepEqual( [ placeWorld( null ), placeWorld( { world: 'pluto' } ) ], [ 'earth', 'earth' ] );
		assert.equal( SHARE_SPENT, 'share' );
		assert.equal( WORLD_OFF, 'world off' );

	} );

	test( 'each far world\'s drivers as dots, on its own sphere, inside its own area', () => {

		for ( const [ world, spot, area ] of [ [ 'mars', GALE, GALE_AREA ], [ 'vesta', RHEASILVIA, RHEASILVIA_AREA ], [ 'ceres', OCCATOR, OCCATOR_AREA ] ] ) {

			const at = toFrame( spot.lat, spot.lon, spot.height, world );
			const near = toFrame( spot.lat + 0.001, spot.lon, spot.height, world );
			const [ dot ] = dotsOf( [ at, near ], area );
			assert.equal( dot.count, 2, world );
			assert.ok( checkDot( dot ), world );
			assert.ok( Math.abs( dot.lat - spot.lat ) < 0.011 && Math.abs( dot.lon - spot.lon ) < 0.011 && Math.abs( dot.height - spot.height ) <= 10, `${ world } ${ JSON.stringify( dot ) }` );
			const b = boundsOf( area );
			assert.ok( dot.lat >= b.south && dot.lat <= b.north && dot.lon >= b.west && dot.lon <= b.east );

		}

	} );

} );

// DriveLimits here, on Node's own SQLite standing in for its Durable Object storage (exec, with its
// cursor's toArray and one, and transactionSync): its SQL, run for real.
describe( 'DriveLimits keeping who\'s driving now, here on SQLite', () => {

	let DriveLimits;
	let DatabaseSync;
	const now = Date.UTC( 2030, 2, 3, 12 );
	const TTL = 12 * MINUTE;

	before( async () => {

		standInForCloudflare();
		( { DriveLimits } = await import( '../worker/drive/limits.js' ) );
		( { DatabaseSync } = await import( 'node:sqlite' ) );

	} );

	function fresh() {

		const db = new DatabaseSync( ':memory:' );
		const sql = {
			exec( query, ...bindings ) {

				const statement = db.prepare( query );
				const rows = /^\s*SELECT/i.test( query ) ? statement.all( ...bindings ).map( row => ( { ...row } ) ) : ( statement.run( ...bindings ), [] );
				return {
					toArray: () => rows,
					one() {

						assert.equal( rows.length, 1 );
						return rows[ 0 ];

					},
				};

			},
		};
		const storage = {
			sql,
			transactionSync( fn ) {

				db.exec( 'BEGIN' );
				try {

					const result = fn();
					db.exec( 'COMMIT' );
					return result;

				} catch ( err ) {

					db.exec( 'ROLLBACK' );
					throw err;

				}

			},
		};
		const limits = new DriveLimits( { storage }, {} );
		limits.rows = () => sql.exec( 'SELECT room, dots, at FROM live_online ORDER BY room' ).toArray();
		// A world's table of spends (live, live_moon, live_mars, ...), as rows.
		limits.table = name => sql.exec( `SELECT day, spent FROM ${ name } ORDER BY day` ).toArray();
		return limits;

	}

	const ask = ( limits, at = now, budget = 1000 ) => limits.liveOnline( { now: at, budget, ttl: TTL, most: ONLINE_AREAS } );
	const report = ( limits, room, dots, { at = now, budget = 1000, amount = 1 } = {} ) => limits.liveSpent( amount, { now: at, budget, online: { room, dots } } );
	const TIMES_AREA = cellOf( TIMES.lat, TIMES.lon );

	test( 'each area\'s room\'s dots as it last reported them, one row a room, those at one spot one area; none lets go of them; a party\'s, or what isn\'t a dot, kept nowhere', async () => {

		const limits = fresh();
		assert.deepEqual( ask( limits ), { open: true, total: 0, areas: [], elsewhere: 0 } );
		// The area's first room and its second shard, at the same spot: one area of three.
		await report( limits, FURKA_AREA, [ FURKA_DOT ] );
		await report( limits, shardOf( FURKA_AREA, 1 ), [ { ...FURKA_DOT, count: 2 } ] );
		await report( limits, TIMES_AREA, [ TIMES_DOT ] );
		assert.deepEqual( ask( limits ), { open: true, total: 4, areas: [ { ...FURKA_DOT, count: 3 }, TIMES_DOT ], elsewhere: 0 } );
		// A room's next report is all of what it says: Times Square's room now has two dots.
		const uptown = { lat: 40.78, lon: - 73.97, height: 30, count: 2 };
		await report( limits, TIMES_AREA, [ uptown, TIMES_DOT ] );
		assert.deepEqual( ask( limits ), { open: true, total: 6, areas: [ { ...FURKA_DOT, count: 3 }, uptown, TIMES_DOT ], elsewhere: 0 } );
		// None: its row goes.
		await report( limits, shardOf( FURKA_AREA, 1 ), [] );
		assert.deepEqual( ask( limits ).total, 4 );
		assert.deepEqual( limits.rows().map( row => row.room ), [ FURKA_AREA, TIMES_AREA ].sort() );
		// A party's, a name that's no room, and dots that aren't (or more than ROOM_DOTS): nothing, or
		// only what checks out.
		await report( limits, 'party:ABCDEFG', [ FURKA_DOT ] );
		await report( limits, 'near:999999.1', [ FURKA_DOT ] );
		await report( limits, cellOf( MONACO.lat, MONACO.lon ), [ { ...MONACO_DOT, count: 0 }, { lat: 'here' }, null ] );
		assert.deepEqual( limits.rows().map( row => row.room ), [ FURKA_AREA, TIMES_AREA ].sort() );
		await report( limits, cellOf( MONACO.lat, MONACO.lon ), [ { ...MONACO_DOT, name: 'Ana\'s house' }, MONACO_DOT, MONACO_DOT, MONACO_DOT ] );
		assert.deepEqual( JSON.parse( limits.rows().find( row => row.room === cellOf( MONACO.lat, MONACO.lon ) ).dots ), [ MONACO_DOT, MONACO_DOT, MONACO_DOT ] );
		// A report without online (a party's room, or before) changes nothing of it.
		await limits.liveSpent( 3, { now, budget: 1000 } );
		assert.equal( ask( limits ).total, 7 );

	} );

	test( 'a room\'s dots older than the TTL are left out, and deleted; a room still there says them again within it', async () => {

		const limits = fresh();
		await report( limits, FURKA_AREA, [ FURKA_DOT ], { at: now } );
		await report( limits, TIMES_AREA, [ TIMES_DOT ], { at: now + 5 * MINUTE } );
		assert.equal( ask( limits, now + TTL ).total, 2 );
		// Furka's room hasn't said for longer than the TTL (it went without a word): left out, and gone.
		assert.deepEqual( ask( limits, now + TTL + 1 ), { open: true, total: 1, areas: [ TIMES_DOT ], elsewhere: 0 } );
		assert.deepEqual( limits.rows().map( row => row.room ), [ TIMES_AREA ] );
		// Saying them again, it's back.
		await report( limits, FURKA_AREA, [ FURKA_DOT ], { at: now + TTL + 2 } );
		assert.equal( ask( limits, now + TTL + 3 ).total, 2 );

	} );

	test( 'at most ONLINE_AREAS (200) areas, the busiest, busiest first, with the total of them all', async () => {

		const limits = fresh();
		const all = [];
		for ( let i = 0; i < 260; i ++ ) {

			const lat = - 60 + i * 0.45;
			const lon = ( i * 37 ) % 340 - 170;
			const room = cellOf( lat, lon );
			const [ dot ] = dotsOf( [ toEcef( lat, lon, i ) ], room );
			dot.count = 1 + ( i * 7 ) % 5;
			await report( limits, room, [ dot ] );
			all.push( dot );

		}

		const found = ask( limits );
		assert.equal( found.total, all.reduce( ( sum, dot ) => sum + dot.count, 0 ) );
		assert.equal( found.areas.length, ONLINE_AREAS );
		assert.deepEqual( found.areas, all.sort( ( a, b ) => b.count - a.count || a.lat - b.lat || a.lon - b.lon ).slice( 0, ONLINE_AREAS ) );
		for ( let i = 1; i < found.areas.length; i ++ ) assert.ok( found.areas[ i - 1 ].count >= found.areas[ i ].count );

	} );

	test( 'each ask is counted against the day\'s budget for driving with others, in the same go: once it\'s spent, { open: false } and nothing more; a report that spends it lets go of its room\'s dots', async () => {

		const limits = fresh();
		await report( limits, FURKA_AREA, [ FURKA_DOT ], { budget: 10, amount: 5 } );
		const spentNow = async () => ( await limits.liveSpent( 0, { now, budget: 10 } ) ).spent;
		assert.equal( await spentNow(), 5 );
		for ( let i = 1; i <= 4; i ++ ) {

			assert.equal( ask( limits, now, 10 ).open, true );
			assert.equal( await spentNow(), 5 + i );

		}

		// The tenth request: spent, and it says nothing.
		assert.deepEqual( ask( limits, now, 10 ), { open: false } );
		assert.equal( await spentNow(), 10 );
		// A room reporting then (it closes everyone): its dots go with it.
		await report( limits, TIMES_AREA, [ TIMES_DOT ], { budget: 10, amount: 0 } );
		await report( limits, FURKA_AREA, [ FURKA_DOT ], { budget: 10, amount: 2 } );
		assert.deepEqual( limits.rows(), [] );
		// The next day, a fresh budget: asked, open.
		assert.deepEqual( ask( limits, now + DAY, 10 ), { open: true, total: 0, areas: [], elsewhere: 0 } );

	} );

	test( 'the Moon\'s areas\' dots are the Moon\'s: asked for the Moon, its own, with how many drive on the Earth; asked for the Earth, as before, with how many on the Moon', async () => {

		const limits = fresh();
		const tycho = { lat: - 43.31, lon: - 11.36, height: - 1200, count: 2 };
		await report( limits, FURKA_AREA, [ FURKA_DOT ] );
		await report( limits, TYCHO_AREA, [ tycho ] );
		await report( limits, shardOf( TYCHO_AREA, 1 ), [ { ...tycho, count: 1 } ] );
		assert.deepEqual( ask( limits ), { open: true, total: 1, areas: [ FURKA_DOT ], elsewhere: 3 } );
		assert.deepEqual( limits.liveOnline( { now, budget: 1000, moonBudget: 1000, world: 'moon', ttl: TTL, most: ONLINE_AREAS } ), { open: true, total: 3, areas: [ { ...tycho, count: 3 } ], elsewhere: 1 } );

	} );

	test( 'each world\'s budget is its own: a Moon room\'s spend, and asks for the Moon, count against the Moon\'s; the Earth\'s spent, the Moon is open, and /api/config\'s ask is counted against the Moon\'s then', async () => {

		const limits = fresh();
		const budgets = { budget: 10, moonBudget: 20 };
		const spent = async () => {

			const { spent: earth, moon } = await limits.liveSpent( 0, { now, ...budgets, moon: 0 } );
			return [ earth, moon.spent ];

		};
		// A Moon area's room reporting 5, and a party's report of 3 on the Earth and 4 on the Moon.
		await limits.liveSpent( 0, { now, ...budgets, moon: 5, online: { room: TYCHO_AREA, dots: [] } } );
		const both = await limits.liveSpent( 3, { now, ...budgets, moon: 4 } );
		assert.deepEqual( [ both.open, both.moon.open ], [ true, true ] );
		assert.deepEqual( await spent(), [ 3, 9 ] );
		// A connection to a room on the Moon, and an ask for the Moon's dots: the Moon's.
		assert.deepEqual( ( ( { open, closed } ) => ( { open, closed } ) )( await limits.liveOpen( { now, ...budgets, world: 'moon', visit: 'moon-visit', room: TYCHO_AREA } ) ), { open: true, closed: [] } );
		limits.liveOnline( { now, ...budgets, world: 'moon', ttl: TTL, most: ONLINE_AREAS } );
		assert.deepEqual( await spent(), [ 3, 11 ] );
		// /api/config's ask: the Earth's, and both said.
		assert.deepEqual( await limits.liveOpen( { now, ...budgets } ), { open: true, spent: 4, moon: { open: true, spent: 11 } } );
		// The Earth's spent: the Moon still open; the ask then the Moon's.
		const earthDone = await limits.liveSpent( 6, { now, ...budgets } );
		assert.deepEqual( [ earthDone.open, earthDone.moon.open ], [ false, true ] );
		assert.deepEqual( await limits.liveOpen( { now, ...budgets } ), { open: false, spent: 10, moon: { open: true, spent: 12 } } );
		assert.equal( ( await limits.liveOpen( { now, ...budgets, visit: 'earth-visit', room: FURKA_AREA } ) ).open, false );
		// A connection let in on the Moon hears that the Earth's is spent (its room lets it drive
		// nowhere else), and that look at the Earth's counts nothing; one moving room says so too.
		const [ earthBefore, moonBefore ] = await spent();
		const lunar = await limits.liveOpen( { now, ...budgets, world: 'moon', visit: 'moon-visit-2', room: TYCHO_AREA } );
		assert.deepEqual( [ lunar.open, lunar.closed ], [ true, [ 'earth' ] ] );
		const moved = await limits.liveOpen( { now, ...budgets, world: 'moon', visit: 'moon-visit-2', room: 'party:ABCDEFG' } );
		assert.deepEqual( [ moved.open, moved.closed, moved.was ], [ true, [ 'earth' ], TYCHO_AREA ] );
		assert.deepEqual( await spent(), [ earthBefore, moonBefore + 3 ] );
		// A Moon room's dots are kept while the Moon's open, whatever the Earth's.
		await limits.liveSpent( 0, { now, ...budgets, moon: 1, online: { room: TYCHO_AREA, dots: [ { lat: - 43.31, lon: - 11.36, height: - 1200, count: 1 } ] } } );
		assert.deepEqual( limits.rows().map( row => row.room ), [ TYCHO_AREA ] );
		// A caller that says nothing of the Moon (a room from before): all of it the Earth's.
		const old = fresh();
		await old.liveSpent( 4, { now, budget: 10 } );
		assert.deepEqual( ( ( { spent: e, moon } ) => [ e, moon.spent ] )( await old.liveSpent( 0, { now, budget: 10 } ) ), [ 4, 4 ] );

	} );

	test( 'visits not counted against the Earth\'s caps connect from one address at most `addressVisits` a day: each visit counted once, the next refused, a new day fresh; kept only as hashes', async () => {

		const limits = fresh();
		const open = ( visit, address, at = now ) => limits.liveOpen( { now: at, budget: 1000, moonBudget: 1000, world: 'moon', visit, room: TYCHO_AREA, address, addressVisits: 2 } );
		for ( const visit of [ 'visit-one-AAAAAAAAAAAAm', 'visit-two-AAAAAAAAAAAAm', 'visit-one-AAAAAAAAAAAAm' ] ) assert.equal( ( await open( visit, 'address-key-1' ) ).refused, undefined, visit );
		assert.deepEqual( ( ( { refused, reason } ) => ( { refused, reason } ) )( await open( 'visit-three-AAAAAAAAAAm', 'address-key-1' ) ), { refused: true, reason: 'address' } );
		// Not kept, the one refused: it can come in from another address.
		assert.equal( ( await open( 'visit-three-AAAAAAAAAAm', 'address-key-2' ) ).refused, undefined );
		// What's kept: hashes of the day's salt and each, never the address's key or a visit's id.
		const rows = JSON.stringify( limits.sql.exec( 'SELECT * FROM live_addresses' ).toArray() );
		assert.equal( JSON.parse( rows ).length, 3 );
		for ( const secret of [ 'address-key', 'visit-one', 'visit-two', 'visit-three' ] ) assert.ok( ! rows.includes( secret ), secret );
		// The next day, fresh (and the day before's rows gone).
		assert.equal( ( await open( 'visit-four-AAAAAAAAAAAm', 'address-key-1', now + DAY ) ).refused, undefined );
		assert.equal( limits.sql.exec( 'SELECT * FROM live_addresses' ).toArray().length, 1 );

	} );

	test( 'each address may spend only its share of each world\'s day (its budget over `share`): what its connections spent as rooms report it, past that on a world, is in over and turns it away there (\'share\'), not on the other world, nor another address, nor the owner (no address); malformed entries left out; kept only as hashes, gone with the day', async () => {

		const limits = fresh();
		const budgets = { budget: 80, moonBudget: 40 };
		const share = 4;
		let visits = 0;
		const open = ( world, address, at = now ) => limits.liveOpen( { now: at, ...budgets, world, visit: `visit-${ ++ visits }-AAAAAAAAAAm`, room: world === 'moon' ? TYCHO_AREA : FURKA_AREA, ...( address ? { address, share } : {} ) } );
		const refusal = async ( ...args ) => ( await open( ...args ) ).reason ?? null;
		// The Moon's share is 10 and the Earth's 20: address-key-1 at 6 on the Moon, address-key-2 at 3.
		const first = await limits.liveSpent( 0, { now, ...budgets, moon: 9, addresses: [ { from: 'address-key-1', earth: 0, moon: 6 }, { from: 'address-key-2', moon: 3 } ], share } );
		assert.equal( first.over, undefined );
		assert.equal( await refusal( 'moon', 'address-key-1' ), null );
		// Then 4 more on the Moon (10, its share) and 2 on the Earth: over on the Moon only.
		const second = await limits.liveSpent( 2, { now, ...budgets, moon: 5, addresses: [ { from: 'address-key-1', moon: 4, earth: 2 }, { from: 'address-key-2', moon: 1 } ], share } );
		assert.deepEqual( second.over, { earth: [], moon: [ 'address-key-1' ] } );
		assert.equal( await refusal( 'moon', 'address-key-1' ), 'share' );
		assert.equal( await refusal( 'earth', 'address-key-1' ), null );
		assert.equal( await refusal( 'moon', 'address-key-2' ), null );
		assert.equal( await refusal( 'moon', null ), null );
		// For a party's room let in on the Earth, its address past its Moon share is in over (the room
		// lets it drive on the Earth, not move onto the Moon); not for an area's, nor another address.
		const party = address => limits.liveOpen( { now, ...budgets, world: 'earth', visit: `visit-${ ++ visits }-AAAAAAAAAAm`, room: 'party:ABCDEFG', address, share } );
		const partied = await party( 'address-key-1' );
		assert.deepEqual( [ partied.open, partied.refused, partied.over ], [ true, undefined, [ 'moon' ] ] );
		assert.equal( ( await open( 'earth', 'address-key-1' ) ).over, undefined );
		assert.equal( ( await party( 'address-key-2' ) ).over, undefined );
		// What's malformed is left out: not an object, no from or not text, a from too long, past the
		// 64th, a negative or not a number.
		const junk = [ null, 7, { moon: 50 }, { from: 9, moon: 50 }, { from: 'x'.repeat( 129 ), moon: 50 }, { from: 'address-key-3', moon: - 50, earth: 'lots' } ];
		const many = Array.from( { length: 64 }, ( _, i ) => ( { from: `filler-${ i }`, moon: 0.1 } ) );
		const third = await limits.liveSpent( 0, { now, ...budgets, addresses: [ ...junk, ...many.slice( 0, 58 ), { from: 'address-key-4', moon: 50 } ], share } );
		assert.equal( third.over, undefined );
		assert.equal( await refusal( 'moon', 'address-key-3' ), null );
		assert.equal( await refusal( 'moon', 'address-key-4' ), null );
		// Without a share (a room from before), nothing is counted by address.
		assert.equal( ( await limits.liveSpent( 0, { now, ...budgets, addresses: [ { from: 'address-key-2', moon: 50 } ] } ) ).over, undefined );
		assert.equal( await refusal( 'moon', 'address-key-2' ), null );
		// What's kept: hashes of the day's salt and each, never the address's key.
		const rows = JSON.stringify( limits.sql.exec( 'SELECT * FROM live_address_spent' ).toArray() );
		assert.ok( JSON.parse( rows ).length >= 3 );
		for ( const secret of [ 'address-key', 'filler' ] ) assert.ok( ! rows.includes( secret ), secret );
		// The next day, fresh (and the day before's rows gone).
		assert.equal( await refusal( 'moon', 'address-key-1', now + DAY ), null );
		assert.equal( limits.sql.exec( 'SELECT * FROM live_address_spent' ).toArray().length, 0 );

	} );


	// --- five worlds ---

	// (DriveLimits' day, limits.js's dayOf.)
	const dayOf = time => new Date( time ).toISOString().slice( 0, 10 );
	const BUDGETS = { earth: 1000, moon: 500, mars: 40, vesta: 30, ceres: 30 };
	const GALE_DOT = { lat: - 5.4, lon: 137.8, height: - 4500, count: 2 };
	const VESTA_DOT = { lat: - 75, lon: - 59, height: - 20000, count: 1 };

	test( 'a report adds each world\'s amount to its own table: the Earth\'s and the Moon\'s every time, as always; a far world\'s only when it has something (a Mars-only report leaves the Earth\'s and the Moon\'s spends as they were, and writes no row for Vesta or Ceres)', async () => {

		const limits = fresh();
		const answer = await limits.liveSpent( 0, { now, budget: BUDGETS.earth, moonBudget: BUDGETS.moon, budgets: BUDGETS, amounts: { earth: 0, moon: 0, mars: 7 } } );
		assert.deepEqual( answer, { open: true, spent: 0, moon: { open: true, spent: 0 }, worlds: { earth: { open: true, spent: 0 }, moon: { open: true, spent: 0 }, mars: { open: true, spent: 7 }, vesta: { open: true, spent: 0 }, ceres: { open: true, spent: 0 } } } );
		const day = dayOf( now );
		assert.deepEqual( [ limits.table( 'live' ), limits.table( 'live_moon' ), limits.table( 'live_mars' ) ], [ [ { day, spent: 0 } ], [ { day, spent: 0 } ], [ { day, spent: 7 } ] ] );
		assert.deepEqual( [ limits.table( 'live_vesta' ), limits.table( 'live_ceres' ) ], [ [], [] ] );
		// A report with no far amount touches no far table.
		await limits.liveSpent( 3, { now, budget: BUDGETS.earth, moonBudget: BUDGETS.moon, budgets: BUDGETS, amounts: { earth: 3, moon: 1 } } );
		assert.deepEqual( [ limits.table( 'live' )[ 0 ].spent, limits.table( 'live_moon' )[ 0 ].spent, limits.table( 'live_mars' )[ 0 ].spent, limits.table( 'live_vesta' ).length ], [ 3, 1, 7, 0 ] );
		// Mars's spent: closed there only, the others open.
		const spent = await limits.liveSpent( 0, { now, budget: BUDGETS.earth, moonBudget: BUDGETS.moon, budgets: BUDGETS, amounts: { mars: 40 } } );
		assert.deepEqual( Object.fromEntries( Object.entries( spent.worlds ).map( ( [ w, { open } ] ) => [ w, open ] ) ), { earth: true, moon: true, mars: false, vesta: true, ceres: true } );
		// A room from before the far worlds (no budgets): answered as it always was, no worlds.
		assert.deepEqual( await limits.liveSpent( 1, { now, budget: BUDGETS.earth, moon: 1, moonBudget: BUDGETS.moon } ), { open: true, spent: 4, moon: { open: true, spent: 2 } } );

	} );

	test( 'each world\'s areas\' dots are its own: the Earth\'s ask has no Mars dot, Mars\'s none of the Earth\'s, every world\'s count in `worlds`; a far area\'s dots kept only while its own world is open', async () => {

		const limits = fresh();
		const reportOn = ( room, dots, amounts = {} ) => limits.liveSpent( 0, { now, budget: BUDGETS.earth, moonBudget: BUDGETS.moon, budgets: BUDGETS, amounts, online: { room, dots } } );
		await reportOn( FURKA_AREA, [ FURKA_DOT ] );
		await reportOn( GALE_AREA, [ GALE_DOT ], { mars: 1 } );
		await reportOn( RHEASILVIA_AREA, [ VESTA_DOT ], { vesta: 1 } );
		const askOn = world => limits.liveOnline( { now, budgets: BUDGETS, budget: BUDGETS.earth, moonBudget: BUDGETS.moon, world, ttl: TTL, most: ONLINE_AREAS } );
		const counts = { earth: { on: true, total: 1 }, moon: { on: true, total: 0 }, mars: { on: true, total: 2 }, vesta: { on: true, total: 1 }, ceres: { on: true, total: 0 } };
		assert.deepEqual( askOn( 'earth' ), { open: true, total: 1, areas: [ FURKA_DOT ], elsewhere: 0, worlds: counts } );
		assert.deepEqual( askOn( 'mars' ), { open: true, total: 2, areas: [ GALE_DOT ], elsewhere: 0, worlds: counts } );
		assert.deepEqual( askOn( 'vesta' ), { open: true, total: 1, areas: [ VESTA_DOT ], elsewhere: 0, worlds: counts } );
		assert.deepEqual( askOn( 'ceres' ), { open: true, total: 0, areas: [], elsewhere: 0, worlds: counts } );
		// A legacy ask (no budgets) never counts a far world's drivers in elsewhere, and says no worlds.
		assert.deepEqual( ask( limits ), { open: true, total: 1, areas: [ FURKA_DOT ], elsewhere: 0 } );
		// Vesta spent: its room's report lets go of its dots; Vesta's count 0 and off; the others as they were.
		await reportOn( RHEASILVIA_AREA, [ VESTA_DOT ], { vesta: 30 } );
		assert.deepEqual( limits.rows().map( row => row.room ).sort(), [ FURKA_AREA, GALE_AREA ].sort() );
		assert.deepEqual( askOn( 'earth' ).worlds.vesta, { on: false, total: 0 } );
		assert.deepEqual( askOn( 'vesta' ), { open: false } );
		// And a far ask throws for a world that isn't one (never the Earth's).
		assert.throws( () => limits.liveOnline( { now, budgets: BUDGETS, world: 'pluto', ttl: TTL, most: ONLINE_AREAS } ) );

	} );

	test( 'a far world\'s globe asked for (/api/online?world=mars) is counted against the Earth\'s while that\'s open, else the Moon\'s, else the world\'s own; never a far world\'s while either is open', () => {

		const limits = fresh();
		const budgets = { earth: 3, moon: 2, mars: 5, vesta: 5, ceres: 5 };
		const askOn = world => limits.liveOnline( { now, budgets, budget: budgets.earth, moonBudget: budgets.moon, world, ttl: TTL, most: ONLINE_AREAS } );
		const spends = () => [ 'live', 'live_moon', 'live_mars', 'live_vesta', 'live_ceres' ].map( name => limits.table( name )[ 0 ]?.spent ?? 0 );
		for ( const world of [ 'mars', 'vesta', 'ceres' ] ) assert.equal( askOn( world ).open, true, world );
		assert.deepEqual( spends(), [ 3, 0, 0, 0, 0 ] );
		// The Earth's spent: the Moon's.
		assert.equal( askOn( 'mars' ).open, true );
		assert.equal( askOn( 'vesta' ).open, true );
		assert.deepEqual( spends(), [ 3, 2, 0, 0, 0 ] );
		// Both spent: the asked world's own; open till that's spent, then { open: false }.
		for ( let i = 0; i < 4; i ++ ) assert.equal( askOn( 'mars' ).open, true );
		assert.deepEqual( askOn( 'mars' ), { open: false } );
		assert.deepEqual( spends(), [ 3, 2, 5, 0, 0 ] );
		// (Vesta's own then, and still open; the Earth's ask: { open: false }, adding to the Earth's.)
		assert.equal( askOn( 'vesta' ).open, true );
		assert.deepEqual( askOn( 'earth' ), { open: false } );
		assert.deepEqual( spends(), [ 4, 2, 5, 1, 0 ] );

	} );

	test( '/api/config\'s ask is counted against the Earth\'s (the Moon\'s once that\'s spent, the Earth\'s again once both are), every far world looked at and not counted; with budgets, every world\'s state in `worlds`', async () => {

		const limits = fresh();
		const budgets = { earth: 2, moon: 1, mars: 4, vesta: 0, ceres: 3 };
		const config = () => limits.liveOpen( { now, budgets, budget: budgets.earth, moonBudget: budgets.moon } );
		const spends = () => [ 'live', 'live_moon', 'live_mars', 'live_vesta', 'live_ceres' ].map( name => limits.table( name )[ 0 ]?.spent ?? 0 );
		const first = await config();
		assert.deepEqual( first, { open: true, spent: 1, moon: { open: true, spent: 0 }, worlds: { earth: { open: true, spent: 1 }, moon: { open: true, spent: 0 }, mars: { open: true, spent: 0 }, vesta: { open: false, spent: 0 }, ceres: { open: true, spent: 0 } } } );
		await config();
		assert.deepEqual( spends(), [ 2, 0, 0, 0, 0 ] );
		await config();
		assert.deepEqual( spends(), [ 2, 1, 0, 0, 0 ] );
		const both = await config();
		assert.deepEqual( spends(), [ 3, 1, 0, 0, 0 ] );
		assert.deepEqual( Object.fromEntries( Object.entries( both.worlds ).map( ( [ w, { open } ] ) => [ w, open ] ) ), { earth: false, moon: false, mars: true, vesta: false, ceres: true } );
		// A caller from before (no budgets): the Earth's and the Moon's only.
		assert.deepEqual( Object.keys( await limits.liveOpen( { now, budget: 2, moonBudget: 1 } ) ).sort(), [ 'moon', 'open', 'spent' ] );

	} );

	test( 'a connection\'s ask is counted against its own world; `closed` lists every other world spent or switched off, and a party\'s `over` every other world whose share its address is past', async () => {

		const limits = fresh();
		const budgets = { earth: 1000, moon: 1000, mars: 1000, vesta: 0, ceres: 2 };
		await limits.liveSpent( 0, { now, budget: budgets.earth, moonBudget: budgets.moon, budgets, amounts: { ceres: 2 } } );
		const connectOn = ( world, room, more = {} ) => limits.liveOpen( { now, budgets, budget: budgets.earth, moonBudget: budgets.moon, world, visit: `v-${ world }-${ room }`, room, ...more } );
		const mars = await connectOn( 'mars', GALE_AREA );
		assert.deepEqual( ( ( { open, spent, closed, seq, was } ) => ( { open, spent, closed, seq, was } ) )( mars ), { open: true, spent: 1, closed: [ 'vesta', 'ceres' ], seq: 1, was: null } );
		assert.deepEqual( limits.table( 'live' ), [ { day: dayOf( now ), spent: 0 } ] );
		// Ceres's spent: its connection's turned away.
		assert.equal( ( await connectOn( 'ceres', OCCATOR_AREA ) ).open, false );
		// An address past its share of Mars (a floor of 50 on a share of 1000/8 = 125: the 125): in a
		// party on the Earth, Mars is over; on Mars, turned away for its share.
		const address = 'from-a';
		const over = await limits.liveSpent( 0, { now, budget: budgets.earth, moonBudget: budgets.moon, budgets, amounts: { mars: 130 }, addresses: [ { from: address, mars: 130 } ], share: 8, floor: 50 } );
		assert.deepEqual( over.over, { earth: [], moon: [], mars: [ address ], vesta: [], ceres: [] } );
		const party = await connectOn( 'earth', 'party:ABCDEFG', { address, share: 8, floor: 50 } );
		assert.deepEqual( [ party.open, party.over, party.closed ], [ true, [ 'mars' ], [ 'vesta', 'ceres' ] ] );
		assert.deepEqual( ( ( { open, refused, reason } ) => ( { open, refused, reason } ) )( await connectOn( 'mars', GALE_AREA, { address, share: 8, floor: 50 } ) ), { open: true, refused: true, reason: 'share' } );

	} );

	test( 'each address\'s share of a world\'s day is the budget over LIVE_ADDRESS_SHARE, but never less than the floor (1000 a world by default in the Worker): on Vesta\'s 3000, 1000, not 375', async () => {

		const limits = fresh();
		const budgets = { earth: 40000, moon: 20000, mars: 4000, vesta: 3000, ceres: 3000 };
		const spend = ( from, vesta, floor ) => limits.liveSpent( 0, { now, budget: budgets.earth, moonBudget: budgets.moon, budgets, amounts: { vesta }, addresses: [ { from, vesta } ], share: 8, floor } );
		// Without a floor: 375 is past it.
		assert.deepEqual( ( await spend( 'a', 375, 0 ) ).over.vesta, [ 'a' ] );
		// With the floor: 999 isn't, 1000 is.
		assert.equal( ( await spend( 'b', 999, 1000 ) ).over, undefined );
		assert.deepEqual( ( await spend( 'b', 1, 1000 ) ).over.vesta, [ 'b' ] );
		// The Earth's share (40000 / 8 = 5000) is over the floor: as it was.
		const earth = await limits.liveSpent( 0, { now, budget: budgets.earth, moonBudget: budgets.moon, budgets, amounts: { earth: 4999 }, addresses: [ { from: 'c', earth: 4999 } ], share: 8, floor: 1000 } );
		assert.equal( earth.over, undefined );

	} );
} );

describe( '/api/online, here with stand-ins for DriveLimits and Cloudflare\'s cache', () => {

	let worker;
	// Cloudflare's cache (caches.default) as /api/online uses it: match and put, each kept as long as
	// its Cache-Control says, on a clock of its own.
	const kept = new Map();
	let cacheClock = 0;
	const cache = {
		async match( request ) {

			const entry = kept.get( request.url );
			return entry && cacheClock < entry.until ? entry.response.clone() : undefined;

		},
		async put( request, response ) {

			const age = Number( /max-age=(\d+)/.exec( response.headers.get( 'Cache-Control' ) ?? '' )?.[ 1 ] ?? 0 );
			kept.set( request.url, { response: response.clone(), until: cacheClock + age * SECOND } );

		},
	};

	before( async () => {

		standInForCloudflare();
		worker = ( await import( '../worker/drive/index.js' ) ).default;
		globalThis.caches = { default: cache };

	} );

	after( () => {

		delete globalThis.caches;

	} );

	// DriveLimits answering `answer` (or failing with it), once `hold` (a promise, if any) has
	// settled, and each ask it was asked.
	function limitsAnswering( answer ) {

		const limits = { answer, asked: [], hold: null };
		limits.binding = {
			idFromName: name => name,
			get: () => ( {
				liveOnline: async options => {

					limits.asked.push( options );
					await limits.hold;
					if ( limits.answer instanceof Error ) throw limits.answer;
					return limits.answer;

				},
			} ),
		};
		return limits;

	}

	// The Worker's clock (Date.now, which this Worker instance keeps what it heard by) going with the
	// cache's, from `start`, for test `t`.
	function clockFrom( t, start ) {

		t.mock.method( Date, 'now', () => start + cacheClock );

	}

	async function get( env, { path = '/api/online', headers = {}, method = 'GET' } = {} ) {

		const res = await worker.fetch( new Request( `https://worlddrive.app${ path }`, { method, headers } ), env, {} );
		return { status: res.status, keep: res.headers.get( 'Cache-Control' ), date: res.headers.get( 'Date' ), body: await res.json() };

	}

	test( 'the rooms\' dots, kept ONLINE_MS (30 s) in Cloudflare\'s cache under its address without the query, so a second ask within that never reaches DriveLimits; by browsers for as long, from its Date', async t => {

		kept.clear();
		cacheClock = 0;
		clockFrom( t, Date.now() );
		const areas = [ { ...FURKA_DOT, count: 3 }, TIMES_DOT ];
		const limits = limitsAnswering( { open: true, total: 4, areas } );
		const env = { LIVE_DAILY_BUDGET: '4321', LIMITS: limits.binding };
		const first = await get( env );
		assert.deepEqual( [ first.status, first.keep, first.body ], [ 200, 'public, max-age=30', { on: true, total: 4, areas, moon: 0 } ] );
		assert.ok( Math.abs( Date.parse( first.date ) - Date.now() ) < 5 * SECOND, first.date );
		assert.equal( limits.asked.length, 1 );
		assert.deepEqual( ( ( { budget, ttl, most } ) => ( { budget, ttl, most } ) )( limits.asked[ 0 ] ), { budget: 4321, ttl: 12 * MINUTE, most: ONLINE_AREAS } );
		assert.ok( Math.abs( limits.asked[ 0 ].now - Date.now() ) < 5 * SECOND );
		// Within 30 s: the one kept, whatever the query, DriveLimits not asked.
		limits.answer = { open: true, total: 0, areas: [] };
		for ( const [ path, later ] of [ [ '/api/online', SECOND ], [ '/api/online?fresh=1', 15 * SECOND ], [ `/api/online?${ Date.now() }`, 30 * SECOND - 1 ] ] ) {

			cacheClock = later;
			const again = await get( env, { path } );
			assert.deepEqual( [ again.body, again.date ], [ first.body, first.date ] );

		}

		assert.equal( limits.asked.length, 1 );
		// Then asked again.
		cacheClock = 30 * SECOND;
		assert.deepEqual( ( await get( env ) ).body, { on: true, total: 0, areas: [], moon: 0 } );
		assert.equal( limits.asked.length, 2 );
		// Another site's page: turned away, as from any route; and only GET.
		assert.equal( ( await get( env, { headers: { 'Sec-Fetch-Site': 'cross-site' } } ) ).status, 403 );
		assert.equal( ( await get( env, { method: 'POST', headers: { Origin: 'https://worlddrive.app', 'Content-Type': 'application/json' } } ) ).status, 405 );
		assert.equal( limits.asked.length, 2 );

	} );

	test( 'asks arriving together as the kept answer runs out ask DriveLimits once in this Worker instance: the others get what it last heard, a little old and kept nowhere; an ask that never comes back is given up on after 5 s', async t => {

		kept.clear();
		cacheClock = 0;
		// (An hour on, so nothing heard in the test before is still kept.)
		clockFrom( t, Date.now() + HOUR );
		const before = { on: true, total: 1, areas: [ FURKA_DOT ], moon: 0 };
		const now = { on: true, total: 2, areas: [ { ...FURKA_DOT, count: 2 } ], moon: 0 };
		const limits = limitsAnswering( { open: true, total: 1, areas: [ FURKA_DOT ] } );
		const env = { LIMITS: limits.binding };
		assert.deepEqual( ( await get( env ) ).body, before );
		// 30 s on, kept nowhere now: 20 at once, DriveLimits taking a while to say.
		cacheClock = 30 * SECOND;
		limits.answer = { open: true, total: 2, areas: now.areas };
		let release;
		limits.hold = new Promise( resolve => release = resolve );
		const burst = Array.from( { length: 20 }, () => get( env ) );
		await sleep( 20 );
		release();
		const answers = await Promise.all( burst );
		assert.equal( limits.asked.length, 2 );
		const fresh = answers.filter( answer => answer.body.total === 2 );
		assert.deepEqual( fresh.map( answer => [ answer.keep, answer.body ] ), [ [ 'public, max-age=30', now ] ] );
		assert.deepEqual( new Set( answers.filter( answer => answer.body.total !== 2 ).map( answer => JSON.stringify( [ answer.status, answer.keep, answer.body ] ) ) ), new Set( [ JSON.stringify( [ 200, 'public, max-age=0', before ] ) ] ) );
		// The new one is what's kept, here and in Cloudflare's cache.
		cacheClock = 31 * SECOND;
		assert.deepEqual( ( await get( env ) ).body, now );
		assert.deepEqual( await ( await cache.match( new Request( 'https://worlddrive.app/api/online' ) ) ).json(), now );
		assert.equal( limits.asked.length, 2 );

		// An ask that never comes back (its request cancelled, say): the others meanwhile get what
		// was last heard, and 5 s on one asks again.
		cacheClock = 62 * SECOND;
		limits.hold = new Promise( () => {} );
		get( env );
		await sleep( 10 );
		assert.equal( limits.asked.length, 3 );
		assert.deepEqual( [ ( await get( env ) ).keep, limits.asked.length ], [ 'public, max-age=0', 3 ] );
		cacheClock = 67 * SECOND;
		limits.hold = null;
		limits.answer = { open: true, total: 0, areas: [] };
		assert.deepEqual( ( await get( env ) ).body, { on: true, total: 0, areas: [], moon: 0 } );
		assert.equal( limits.asked.length, 4 );

	} );

	test( 'DriveLimits failing: nobody, on, kept only 10 s, never an error; the day\'s budget spent: on: false, and not asked again that day; LIVE off: on: false, asking nothing; the Earth\'s budget of 0: on: false, with how many are on the Moon (asked for the Moon, as its own answer is)', async () => {

		kept.clear();
		cacheClock = 0;
		const limits = limitsAnswering( new Error( 'DriveLimits is down' ) );
		const env = { TEST_CLOCK: 'header', LIVE_DAILY_BUDGET: '4322', LIMITS: limits.binding };
		const day = Date.UTC( 2031, 5, 1, 12 );
		const at = time => ( { 'X-Test-Time': String( time ) } );
		const realError = console.error;
		const logged = [];
		console.error = ( ...args ) => logged.push( args.join( ' ' ) );
		try {

			const failed = await get( env, { headers: at( day ) } );
			assert.deepEqual( [ failed.status, failed.keep, failed.body ], [ 200, 'public, max-age=10', { on: true, total: 0, areas: [], moon: 0 } ] );
			assert.deepEqual( logged, [ 'Live online Error DriveLimits is down' ] );

		} finally {

			console.error = realError;

		}

		// (The tests' clock keeps one for each time: asked again at once at another.)
		limits.answer = { open: false };
		const spent = await get( env, { headers: at( day + 1 ) } );
		assert.deepEqual( [ spent.keep, spent.body ], [ 'public, max-age=30', { on: false, total: 0, areas: [] } ] );
		const asks = limits.asked.length;
		// This Worker instance remembers: not asked again that day, kept or not; and as midnight UTC
		// comes, it's kept no later than that, when it's on again.
		for ( const [ later, keep ] of [ [ 2, 30 ], [ HOUR, 30 ], [ 12 * HOUR - 12 * SECOND, 12 ], [ 12 * HOUR - 300, 0 ] ] ) {

			const off = await get( env, { headers: at( day + later ) } );
			assert.deepEqual( [ off.keep, off.body ], [ `public, max-age=${ keep }`, { on: false, total: 0, areas: [] } ] );

		}

		assert.equal( limits.asked.length, asks );
		limits.answer = { open: true, total: 1, areas: [ FURKA_DOT ] };
		// The next day it asks again.
		assert.deepEqual( ( await get( env, { headers: at( day + DAY ) } ) ).body, { on: true, total: 1, areas: [ FURKA_DOT ], moon: 0 } );
		assert.equal( limits.asked.length, asks + 1 );
		// LIVE off: off, without asking.
		const off = await get( { ...env, LIVE: 'off' }, { headers: at( day + DAY + 1 ) } );
		assert.deepEqual( [ off.status, off.body ], [ 200, { on: false, total: 0, areas: [] } ] );
		assert.equal( limits.asked.length, asks + 1 );
		// The Earth's budget of 0: off there, nothing asked for the Earth, and how many are on the Moon
		// asked for (its own answer, counted against the Moon's), so the page can point there.
		const earthOff = await get( { ...env, LIVE_DAILY_BUDGET: '0' }, { headers: at( day + DAY + 2 ) } );
		assert.deepEqual( [ earthOff.status, earthOff.body ], [ 200, { on: false, total: 0, areas: [], moon: 1 } ] );
		assert.deepEqual( limits.asked.slice( asks + 1 ).map( options => options.world ), [ 'moon' ] );

	} );

	test( '?world=moon: the Moon\'s, asked of DriveLimits for the Moon and kept under its own address (any other query is the Earth\'s); spent on the Moon, off there and not on the Earth', async () => {

		kept.clear();
		cacheClock = 0;
		const limits = limitsAnswering( null );
		limits.binding.get = () => ( {
			liveOnline: async options => {

				limits.asked.push( options );
				if ( options.world === 'moon' ) return limits.moon;
				return { open: true, total: 1, areas: [ FURKA_DOT ], elsewhere: 2 };

			},
		} );
		const tycho = { lat: - 43.31, lon: - 11.36, height: - 1200, count: 2 };
		limits.moon = { open: true, total: 2, areas: [ tycho ], elsewhere: 1 };
		const env = { TEST_CLOCK: 'header', LIVE_DAILY_BUDGET: '4323', LIVE_MOON_DAILY_BUDGET: '777', LIMITS: limits.binding };
		const at = { 'X-Test-Time': String( Date.UTC( 2032, 1, 2, 12 ) ) };
		const moon = await get( env, { path: '/api/online?world=moon', headers: at } );
		assert.deepEqual( [ moon.keep, moon.body ], [ 'public, max-age=30', { on: true, total: 2, areas: [ tycho ], earth: 1 } ] );
		assert.deepEqual( ( ( { world, budget, moonBudget } ) => ( { world, budget, moonBudget } ) )( limits.asked[ 0 ] ), { world: 'moon', budget: 4323, moonBudget: 777 } );
		const earth = await get( env, { path: '/api/online?world=pluto', headers: at } );
		assert.deepEqual( earth.body, { on: true, total: 1, areas: [ FURKA_DOT ], moon: 2 } );
		assert.equal( limits.asked[ 1 ].world, 'earth' );
		// Each kept apart: asked again, neither reaches DriveLimits.
		assert.deepEqual( ( await get( env, { path: '/api/online?world=moon', headers: at } ) ).body, moon.body );
		assert.deepEqual( ( await get( env, { path: '/api/online', headers: at } ) ).body, earth.body );
		assert.equal( limits.asked.length, 2 );
		// The Moon's spent: off there for the day (with how many are on the Earth, as the Earth's own
		// answer says, and kept as that is), and the Earth's still on.
		limits.moon = { open: false };
		const later = { 'X-Test-Time': String( Date.UTC( 2032, 1, 2, 13 ) ) };
		assert.deepEqual( ( await get( env, { path: '/api/online?world=moon', headers: later } ) ).body, { on: false, total: 0, areas: [], earth: 1 } );
		const asks = limits.asked.length;
		assert.deepEqual( ( await get( env, { path: '/api/online', headers: later } ) ).body.on, true );
		assert.equal( limits.asked.length, asks );
		// Not asked again for the Moon that day (the tests' clock keeps an answer for each time, so the
		// Earth's is asked at each new one).
		const moonAsks = () => limits.asked.filter( options => options.world === 'moon' ).length;
		const lunar = moonAsks();
		assert.deepEqual( ( await get( env, { path: '/api/online?world=moon', headers: { 'X-Test-Time': String( Date.UTC( 2032, 1, 2, 14 ) ) } } ) ).body, { on: false, total: 0, areas: [], earth: 1 } );
		assert.equal( moonAsks(), lunar );
		// LIVE_MOON_DAILY_BUDGET of 0: off on the Moon without asking for it.
		assert.deepEqual( ( await get( { ...env, LIVE_MOON_DAILY_BUDGET: '0' }, { path: '/api/online?world=moon', headers: { 'X-Test-Time': String( Date.UTC( 2032, 1, 4 ) ) } } ) ).body.on, false );
		assert.equal( moonAsks(), lunar );

	} );


	test( '?world=mars, vesta or ceres: each far world\'s own answer (no legacy key), kept under its own address, asked of DriveLimits with every world\'s budget (it charges the ask to the Earth\'s while that\'s open), every world\'s counts passed on; off on Mars, the first other open world\'s counts; every world off, nothing', async () => {

		kept.clear();
		cacheClock = 0;
		const gale = { lat: - 5.4, lon: 137.8, height: - 4500, count: 3 };
		const counts = { earth: { on: true, total: 1 }, moon: { on: true, total: 0 }, mars: { on: true, total: 3 }, vesta: { on: true, total: 0 }, ceres: { on: false, total: 0 } };
		const limits = limitsAnswering( null );
		const answers = {
			earth: { open: true, total: 1, areas: [ FURKA_DOT ], elsewhere: 0, worlds: counts },
			mars: { open: true, total: 3, areas: [ gale ], elsewhere: 0, worlds: counts },
			// (A count that isn't one, or a world said nothing of, is none.)
			vesta: { open: true, total: 0, areas: [], elsewhere: 0, worlds: { ...counts, moon: { on: true, total: - 4 }, ceres: 'no' } },
		};
		limits.binding.get = () => ( {
			liveOnline: async options => {

				limits.asked.push( options );
				return answers[ options.world ];

			},
		} );
		const env = { TEST_CLOCK: 'header', LIVE_DAILY_BUDGET: '4324', LIVE_MARS_DAILY_BUDGET: '444', LIMITS: limits.binding };
		const at = { 'X-Test-Time': String( Date.UTC( 2032, 2, 2, 12 ) ) };
		const mars = await get( env, { path: '/api/online?world=mars', headers: at } );
		assert.deepEqual( [ mars.keep, mars.body ], [ 'public, max-age=30', { on: true, total: 3, areas: [ gale ], worlds: counts } ] );
		assert.deepEqual( ( ( { world, budgets } ) => ( { world, budgets } ) )( limits.asked[ 0 ] ), { world: 'mars', budgets: { earth: 4324, moon: 20000, mars: 444, vesta: 3000, ceres: 3000 } } );
		const vesta = await get( env, { path: '/api/online?world=vesta', headers: at } );
		assert.deepEqual( vesta.body, { on: true, total: 0, areas: [], worlds: { ...counts, moon: { on: true, total: 0 }, ceres: { on: false, total: 0 } } } );
		// The Earth's has the far worlds' counts too, and its legacy `moon` counts only the Moon.
		const earth = await get( env, { path: '/api/online', headers: at } );
		assert.deepEqual( earth.body, { on: true, total: 1, areas: [ FURKA_DOT ], moon: 0, worlds: counts } );
		// Each kept apart.
		for ( const [ path, body ] of [ [ '/api/online?world=mars', mars.body ], [ '/api/online?world=vesta', vesta.body ], [ '/api/online', earth.body ] ] ) assert.deepEqual( ( await get( env, { path, headers: at } ) ).body, body );
		assert.equal( limits.asked.length, 3 );

		// Mars switched off (a budget of 0): off there, asking nothing for Mars, with every world's counts
		// from the first other open world's answer (the Earth's), and no legacy key.
		const off = { ...env, LIVE_MARS_DAILY_BUDGET: '0' };
		const later = { 'X-Test-Time': String( Date.UTC( 2032, 2, 2, 13 ) ) };
		const marsOff = await get( off, { path: '/api/online?world=mars', headers: later } );
		assert.deepEqual( marsOff.body, { on: false, total: 0, areas: [], worlds: counts } );
		assert.deepEqual( limits.asked.slice( 3 ).map( options => options.world ), [ 'earth' ] );
		// Mars spent (DriveLimits says so): the same, and Mars not asked again that day.
		answers.mars = { open: false };
		const evening = { 'X-Test-Time': String( Date.UTC( 2032, 2, 2, 14 ) ) };
		assert.deepEqual( ( await get( env, { path: '/api/online?world=mars', headers: evening } ) ).body, { on: false, total: 0, areas: [], worlds: counts } );
		const asks = limits.asked.length;
		assert.deepEqual( ( await get( env, { path: '/api/online?world=mars', headers: { 'X-Test-Time': String( Date.UTC( 2032, 2, 2, 15 ) ) } } ) ).body.on, false );
		assert.deepEqual( limits.asked.slice( asks ).map( options => options.world ), [ 'earth' ] );
		// Every world off: nothing at all.
		const allOff = { ...env, LIVE_DAILY_BUDGET: '0', LIVE_MOON_DAILY_BUDGET: '0', LIVE_MARS_DAILY_BUDGET: '0', LIVE_VESTA_DAILY_BUDGET: '0', LIVE_CERES_DAILY_BUDGET: '0' };
		assert.deepEqual( ( await get( allOff, { path: '/api/online?world=ceres', headers: evening } ) ).body, { on: false, total: 0, areas: [] } );

	} );
} );

describe( 'Who\'s driving now, the Worker\'s whole way round', () => {

	// Each ask at a time of its own (the tests' clock), so it isn't one kept.
	let asked = 0;
	const fresh = ( later = 0 ) => online( presence.server, Date.now() + later + ++ asked );
	// Every world's count, as every answer has them: the Earth's `earth`, Mars's `mars` (Max, at
	// Gale, in Mars's area's room), the others none.
	const everywhere = ( earth, mars = 1 ) => ( { earth: { on: true, total: earth }, moon: { on: true, total: 0 }, mars: { on: true, total: mars }, vesta: { on: true, total: 0 }, ceres: { on: true, total: 0 } } );

	test( 'an area\'s room\'s driver is in /api/online within about a minute of connecting, where she dropped in; one in a party, or on the globe, never', async () => {

		let answer = await fresh();
		while ( ( answer.total < 2 || answer.worlds?.mars.total < 1 ) && Date.now() < presence.at + 90 * SECOND ) {

			await sleep( SECOND );
			answer = await fresh();

		}

		console.log( `    in /api/online ${ Math.round( ( Date.now() - presence.at ) / SECOND ) } s after connecting (a minute and the suite's other tests)` );
		// (The legacy `moon` counts only the Moon: Max on Mars is in `worlds` alone, and no Mars dot is
		// on the Earth's map.)
		assert.deepEqual( answer, { on: true, total: 2, areas: [ MONACO_DOT, FURKA_DOT ], moon: 0, worlds: everywhere( 2 ) } );

	} );

	test( '?world=mars: Mars\'s own drivers as dots on Mars\'s sphere, with every world\'s counts and no legacy key; kept under its own address', async () => {

		const res = await fetch( `${ presence.server.base }/api/online?world=mars`, { headers: { 'X-Test-Time': String( Date.now() + ++ asked ) } } );
		assert.equal( res.status, 200 );
		const mars = await res.json();
		// (Gale's -5.4° is its area's south edge: the dot kept just inside it.)
		assert.deepEqual( mars, { on: true, total: 1, areas: [ { lat: - 5.39, lon: 137.8, height: - 4500, count: 1 } ], worlds: everywhere( 2 ) } );
		// Vesta's: nobody there, but the same counts.
		const vesta = await ( await fetch( `${ presence.server.base }/api/online?world=vesta`, { headers: { 'X-Test-Time': String( Date.now() + ++ asked ) } } ) ).json();
		assert.deepEqual( vesta, { on: true, total: 0, areas: [], worlds: everywhere( 2 ) } );

	} );

	test( 'kept 30 s in Cloudflare\'s cache: asked as a page asks, the same answer as before, though a driver has gone since; asked afresh, she has', async () => {

		const res = await fetch( `${ presence.server.base }/api/online` );
		const first = { keep: res.headers.get( 'Cache-Control' ), date: res.headers.get( 'Date' ), body: await res.json() };
		assert.deepEqual( [ first.keep, first.body ], [ 'public, max-age=30', { on: true, total: 2, areas: [ MONACO_DOT, FURKA_DOT ], moon: 0, worlds: everywhere( 2 ) } ] );
		// Alice goes: her room says so as it empties.
		await presence.alice.close();
		await sleep( 1500 );
		assert.deepEqual( await fresh(), { on: true, total: 1, areas: [ MONACO_DOT ], moon: 0, worlds: everywhere( 1 ) } );
		// The same address, and with a query: the answer kept, made when the first was (its Date).
		for ( const path of [ '/api/online', '/api/online?again' ] ) {

			const again = await fetch( `${ presence.server.base }${ path }` );
			assert.deepEqual( [ again.headers.get( 'Date' ), await again.json() ], [ first.date, first.body ] );

		}

	} );

	test( 'a room\'s dots older than 12 minutes are left out and deleted: asked 13 minutes on, Erin\'s room (which won\'t say again for minutes) has none, and then nor has it now', async () => {

		assert.deepEqual( await fresh( 13 * MINUTE ), { on: true, total: 0, areas: [], moon: 0, worlds: everywhere( 0, 0 ) } );
		assert.deepEqual( await fresh(), { on: true, total: 0, areas: [], moon: 0, worlds: everywhere( 0, 0 ) } );

	} );

} );
