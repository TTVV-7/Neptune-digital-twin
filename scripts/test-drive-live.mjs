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
// closing everyone when the day's is spent, and carrying on when DriveLimits fails. And the page's
// side (src/drive-app/live.js) on stand-ins for the browser: turned away at the door, a connection
// gone quiet, a busy area tried again, and quiet with only those on the globe to see it.
// TEST_DRIVE_LIVE_PORT=8950 moves the three wrangler servers (that port and the next two).

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { register } from 'node:module';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { serialize } from 'node:v8';
import { after, before, describe, mock, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker } from './worker-harness.mjs';
import {
	BUDGET_SPENT, BURST, CLOSE, FLUSH_MS, HELLO_MS, HONK_GAP, IDLE_MS, KEEPALIVE_MS, MAX_HELLO, MAX_MESSAGE, NEARBY_SHARDS, PARTY_MAX, PING, PONG,
	PROTOCOL, SEND_HZ, STILL_HZ, VIEW_RANGE,
	cellOf, makePartyCode, packState, shardOf,
} from '../src/drive-app/live-protocol.js';
import { makeVisit } from '../worker/drive/visits.js';

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
async function connect( server, room, { token, protocols, origin = server.base, headers = {} } = {} ) {

	token ??= await visitToken();
	const query = room === null ? '' : `?room=${ encodeURIComponent( room ) }`;
	return new Promise( ( resolve, reject ) => {

		const ws = new WebSocket( `${ server.base.replace( 'http', 'ws' ) }/api/live${ query }`, protocols ?? [ PROTOCOL, token ], { origin, headers } );
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

// --- the Worker, in wrangler dev ---------------------------------------------------------

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
			'its id changed': [ v, `${ id.slice( 0, - 1 ) }${ id.endsWith( 'A' ) ? 'B' : 'A' }`, expires, signature ].join( '.' ),
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
			vars: { GOOGLE_CLIENT_ID: '', GOOGLE_MAPS_API_KEY: 'test-maps-key-not-real', TURNSTILE_SECRET: PASS_SECRET, TEST_CLOCK: 'header', LIVE_DAILY_BUDGET: String( BUDGET ), LIVE_VISIT_CONNECTS: '3' },
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
		// And the door's shut until midnight.
		assert.equal( ( await connect( tight, partyRoom() ) ).status, 503 );
		assert.deepEqual( ( ( { live, liveReason } ) => ( { live, liveReason } ) )( await config() ), { live: false, liveReason: BUDGET_SPENT } );

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
	let clock = Date.UTC( 2026, 10, 1, 12 );
	const realNow = Date.now;
	const RealResponse = globalThis.Response;
	const timers = { set: 0 };
	const realSetTimeout = globalThis.setTimeout;
	const realSetInterval = globalThis.setInterval;

	before( async () => {

		const stub = 'export class DurableObject { constructor( ctx, env ) { this.ctx = ctx; this.env = env; } }';
		const hooks = `export async function resolve( specifier, context, next ) {
			if ( specifier === 'cloudflare:workers' ) return { url: 'data:text/javascript,' + encodeURIComponent( ${ JSON.stringify( stub ) } ), shortCircuit: true };
			return next( specifier, context );
		}`;
		register( `data:text/javascript,${ encodeURIComponent( hooks ) }` );
		( { DriveRoom } = await import( '../worker/drive/live.js' ) );
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
	async function arrive( room, ctx, { visit = `visit-${ ++ visits }`, expires = clock + 6 * HOUR, name = 'party:ABCDEFG', seq = 1 } = {} ) {

		const headers = new Headers( { Upgrade: 'websocket', 'X-Live-Visit': visit, 'X-Live-Expires': String( expires ), 'X-Live-Room': name, 'X-Live-Seq': String( seq ) } );
		// Node's Response doesn't take a 101.
		globalThis.Response = class {

			constructor( body, init ) {

				Object.assign( this, init );

			}

		};
		try {

			const res = await room.fetch( { headers } );
			assert.equal( res.status, 101 );
			assert.equal( res.headers[ 'Sec-WebSocket-Protocol' ], PROTOCOL );

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
	// A page driving for `ms` with someone to see it (its car SEND_HZ times a second) and the pages
	// `others` sending only their keepalive every KEEPALIVE_MS, the clock (and the alarm) going on
	// with them, until the room closes them: how many messages they sent.
	async function drive( room, ctx, ws, ms, others = [] ) {

		const until = clock + ms;
		let sent = 0;
		for ( let step = 1; clock + 1000 / SEND_HZ <= until; step ++ ) {

			await wait( room, ctx, 1000 / SEND_HZ );
			if ( ws.closedWith ) break;
			await say( room, ws, { t: 's', s: carAt( 46.5725, 8.4153, { north: step, speed: 10 } ) } );
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

	// DriveLimits as a room reaches it (env.LIMITS): each report it's sent, kept; open, or not, or
	// failing, as the test says.
	function limitsStub() {

		const stub = { reports: [], open: true, fail: false };
		stub.binding = {
			idFromName: name => name,
			get: () => ( {
				liveSpent: async ( amount, { now, budget } ) => {

					if ( stub.fail ) throw new Error( 'DriveLimits is down' );
					stub.reports.push( { amount, now, budget } );
					return { open: stub.open, spent: 0 };

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

		constructor( url ) {

			Object.assign( this, { room: new URL( url ).searchParams.get( 'room' ), readyState: 0, sent: [], listeners: new Map() } );
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

		open() {

			this.readyState = 1;
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

	// A page on the globe, with nothing else of the browser's: its earth's frame is Earth's own, and
	// its car (car()) is at the pad, moving north at `speed` m/s each frame if it's told to.
	function page() {

		configs = [ { live: true } ];
		asked = 0;
		sockets.length = 0;
		const earth = { matrixWorld: new Matrix4(), updateWorldMatrix() {} };
		const ellipsoid = { getPositionToCartographic: ( p, out ) => Object.assign( out, { lat: PAD.lat * Math.PI / 180, lon: PAD.lon * Math.PI / 180, height: PAD.height } ) };
		const live = createLive( { earth, ellipsoid, visit: TOKEN, player: () => null, ride: { vehicle: 'go-kart', look: {} } } );
		const at = ecef( PAD.lat, PAD.lon, PAD.height );
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

} );
