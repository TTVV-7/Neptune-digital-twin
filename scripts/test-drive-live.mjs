// npm run test:drive-live: driving with others, the Worker's half (worker/drive/live.js), against
// `wrangler dev` on this machine with throwaway Durable Objects and database, and WebSockets opened
// here as the page opens them (src/drive-app/live-protocol.js). Visit tokens are made here with
// Turnstile's documented test secret, as the Worker makes them; Google's keys are test keys served
// here. Checks: every connection turned away before the room (no upgrade, another site or none,
// a room that isn't one, no token, a forged, changed or expired one, the protocol not ours, LIVE
// off, a client's own internal headers); welcome, join and leave; names from the leaderboard's
// players (never the page's), guests, and a supporter's ⭐; states batched every FLUSH_MS, never
// echoed, rounded and checked, and in an area only within VIEW_RANGE; look, place, away, trick and
// honk relayed at once, honks spaced; the rate, the sizes and what's out of order; full rooms and
// the area's shards; a visit connecting again; keepalives answered; the hello deadline, a visit
// running out, and a room carrying on after it has hibernated. Then the room here in this process,
// on a stand-in for Cloudflare's runtime and clock: batches with nothing after them, being idle,
// waking up from its attachments, the alarm, LIVE switched off, the room emptying, a hello's name
// still being looked up, the attachment's size, and no timers.
// TEST_DRIVE_LIVE_PORT=8950 moves the two wrangler servers (that port and the next).

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createRequire } from 'node:module';
import { serialize } from 'node:v8';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker } from './worker-harness.mjs';
import {
	BURST, CLOSE, FLUSH_MS, HELLO_MS, HONK_GAP, IDLE_MS, MAX_HELLO, MAX_MESSAGE, PARTY_MAX, PING, PONG, PROTOCOL, VIEW_RANGE,
	cellOf, makePartyCode, packState, shardOf,
} from '../src/drive-app/live-protocol.js';
import { makeVisit } from '../worker/drive/visits.js';

const WebSocket = createRequire( import.meta.url )( 'ws' );
const PORT = Number( process.env.TEST_DRIVE_LIVE_PORT ) || 8950;
// Turnstile's documented test secrets: the Worker's, and another (tokens signed with it are forged).
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const FAIL_SECRET = '2x0000000000000000000000000000000AA';
const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
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

// Each car in the 'S' batches among `messages`, by pid: its latest state.
function cars( messages ) {

	const seen = {};
	for ( const m of messages ) {

		if ( m?.t === 'S' ) for ( const [ pid, ...s ] of m.s ) seen[ pid ] = s;

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
		assert.deepEqual( alice.welcome, { t: 'welcome', you: alice.pid, room, max: PARTY_MAX, players: [] } );
		assert.match( alice.pid, /^[A-Za-z0-9_-]{8}$/ );

		// Someone connected who hasn't said hello isn't anyone yet.
		const lurker = await connect( server, room );
		const bob = await join( server, room, { vehicle: 'muscle-car', look: { colour: 'blue', decal: 'flames', boost: 'confetti', number: 42 }, place: null, away: true } );
		assert.notEqual( bob.pid, alice.pid );
		const [ seen ] = bob.welcome.players;
		assert.deepEqual( bob.welcome.players, [ { pid: alice.pid, name: seen.name, star: false, vehicle: 'go-kart', look: { colour: 'red', number: 7 }, place: FURKA, away: false, s: null } ] );
		assert.match( seen.name, /^Guest \d{4}$/ );
		const joined = await alice.take( 'join' );
		assert.deepEqual( joined, { t: 'join', player: { pid: bob.pid, name: joined.player.name, star: false, vehicle: 'muscle-car', look: { colour: 'blue', decal: 'flames', boost: 'confetti', number: 42 }, place: null, away: true, s: null } } );
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
		assert.deepEqual( ( await watcher.take( 'join' ) ).player.name, 'Ghost Rider' );
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
		assert.deepEqual( first.s[ 0 ], [ alice.pid, ...carAt( 46.5725, 8.4153 ) ] );
		assert.ok( Math.abs( first.at - Date.now() ) < 5 * SECOND );

		// Three in quick succession, then a word from Bob after FLUSH_MS: one batch each way, Alice's
		// with only her latest, and nothing of hers to her.
		for ( const north of [ 10, 20, 30 ] ) alice.send( { t: 's', s: carAt( 46.5725, 8.4153, { north } ) } );
		await sleep( FLUSH_MS + 50 );
		// Bob is far away (a party has no range): 300 km.
		bob.send( { t: 's', s: carAt( 49.2, 8.4153 ) } );
		const toBob = await bob.take( 'S' );
		assert.deepEqual( toBob.s, [ [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 30 } ) ] ] );
		const toAlice = await alice.take( 'S' );
		assert.deepEqual( toAlice.s, [ [ bob.pid, ...carAt( 49.2, 8.4153 ) ] ] );
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

		assert.deepEqual( batches.bob.at( - 1 ).s[ 0 ], [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 122, speed: 20 } ) ] );
		assert.deepEqual( batches.alice.at( - 1 ).s[ 0 ], [ bob.pid, ...carAt( 49.2, 8.4153, { north: 22, speed: 20, flags: 128 | 2 } ) ] );
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
		assert.deepEqual( sent.slice( 4 ), [ 0, 0, 0.7071, 0.7071, 12.35, 0, 0, 129 ] );
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
		assert.deepEqual( seen, { pid: alice.pid, name: seen.name, star: false, vehicle: 'muscle-car', look: { colour: 'blue', finish: 'matte', rim: 'spokes', flame: 'blue', trail: 'stars', smoke: 'white', number: 0 }, place, away: true, s: null } );
		alice.send( { t: 'place', place: FURKA } );
		assert.deepEqual( ( await carol.take( 'place' ) ).place, FURKA );
		const later = await join( server, room );
		assert.equal( later.welcome.players.find( p => p.pid === alice.pid ).away, false );
		await Promise.all( [ alice, bob, carol, later ].map( page => page.close() ) );

	} );

	test( 'honks: one every HONK_GAP from each driver, the rest dropped without counting against the rate', async () => {

		const room = partyRoom();
		const alice = await join( server, room );
		const bob = await join( server, room );
		alice.send( { t: 'honk' } );
		assert.deepEqual( await bob.take( 'honk' ), { t: 'honk', pid: alice.pid } );
		// Twice BURST at once: none of them get through, and Alice isn't closed for them.
		for ( let i = 0; i < 2 * BURST; i ++ ) alice.send( { t: 'honk' } );
		await sleep( 200 );
		assert.equal( await bob.take( 'honk', 0 ), null );
		assert.equal( await alice.ended( 100 ), null );
		await sleep( HONK_GAP );
		alice.send( { t: 'honk' } );
		assert.ok( await bob.take( 'honk' ) );
		await Promise.all( [ alice.close(), bob.close() ] );

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

	test( 'keepalives are answered by the room itself, before hello too, and never count as messages', async () => {

		const page = await connect( server, partyRoom() );
		page.send( PING );
		assert.equal( await page.take( PONG ), PONG );
		// Many more than the rate allows of anything else.
		for ( let i = 0; i < 3 * BURST; i ++ ) page.send( PING );
		await sleep( 300 );
		assert.equal( ( await page.drain() ).filter( m => m === PONG ).length, 3 * BURST );
		page.send( HELLO );
		assert.ok( await page.take( 'welcome' ) );
		await page.close();

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
		assert.deepEqual( await ninth.take( 'full' ), { t: 'full', room } );
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
		assert.deepEqual( await turned.take( 'full' ), { t: 'full', room: area } );
		assert.equal( ( await turned.ended() ).code, CLOSE.full );
		assert.equal( ( await connect( server, shardOf( area, 0 ) ).then( page => page.ended() ) ).code, CLOSE.full );

		const next = await join( server, shardOf( area, 1 ) );
		assert.deepEqual( [ next.welcome.room, next.welcome.max, next.welcome.players ], [ `${ area }#1`, NEARBY_MAX, [] ] );
		await Promise.all( [ ...pages, next ].map( page => page.close() ) );

	} );

	test( 'the same visit connecting again closes the last with CLOSE.replaced, and the others see it leave and come back', async () => {

		const room = partyRoom();
		const watcher = await join( server, room );
		const token = await visitToken();
		const tab = await join( server, room, {}, { token } );
		await watcher.take( 'join' );
		const again = await join( server, room, { vehicle: 'pickup-truck' }, { token } );
		assert.deepEqual( await tab.ended(), { code: CLOSE.replaced, reason: 'replaced' } );
		assert.deepEqual( again.welcome.players.map( p => p.pid ), [ watcher.pid ] );
		assert.deepEqual( await watcher.take( 'leave' ), { t: 'leave', pid: tab.pid } );
		assert.equal( ( await watcher.take( 'join' ) ).player.vehicle, 'pickup-truck' );
		// The same visit in another room is fine there.
		const elsewhere = await join( server, partyRoom(), {}, { token } );
		assert.equal( await again.ended( 200 ), null );
		await Promise.all( [ watcher, again, elsewhere ].map( page => page.close() ) );

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

	test( 'a room that has hibernated carries on from where it was, its keepalives answered meanwhile', async () => {

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

// --- the room, here --------------------------------------------------------------------

// What wrangler dev can't show quickly: IDLE_MS is over a minute, and hibernation is the runtime's
// to decide. So DriveRoom runs here too, on a stand-in for its runtime: WebSockets that keep what
// they're sent and their attachment (structured-cloned, as Cloudflare does), an alarm, and a clock
// the test moves. 'cloudflare:workers' is stood in for as test-drive-worker.mjs does.

class FakeSocket {

	constructor() {

		this.readyState = WebSocket.OPEN;
		this.sent = [];
		this.attachment = null;
		this.closedWith = null;

	}

	send( text ) {

		if ( this.readyState !== WebSocket.OPEN ) throw new Error( 'closed' );
		this.sent.push( text );

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
		globalThis.WebSocketRequestResponsePair = class {

			constructor( request, response ) {

				Object.assign( this, { request, response } );

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
		delete globalThis.WebSocketRequestResponsePair;

	} );

	// The runtime's side of one room: its WebSockets, when each last had a keepalive answered, its
	// alarm, and whether its storage was emptied.
	function runtime() {

		const ctx = {
			sockets: [],
			pinged: new Map(),
			alarm: null,
			emptied: 0,
			autoResponse: null,
			acceptWebSocket( ws ) {

				this.sockets.push( ws );

			},
			getWebSockets() {

				return this.sockets.filter( ws => ws.readyState !== WebSocket.CLOSED );

			},
			setWebSocketAutoResponse( pair ) {

				this.autoResponse = pair;

			},
			getWebSocketAutoResponseTimestamp( ws ) {

				return ctx.pinged.has( ws ) ? new Date( ctx.pinged.get( ws ) ) : null;

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
	// A connection as /api/live hands it to `room` (checked there): the room's end of it.
	async function arrive( room, ctx, { visit = `visit-${ ++ visits }`, expires = clock + 6 * HOUR, name = 'party:ABCDEFG' } = {} ) {

		const headers = new Headers( { Upgrade: 'websocket', 'X-Live-Visit': visit, 'X-Live-Expires': String( expires ), 'X-Live-Room': name } );
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
			await room.alarm();

		}

		clock = until;

	}

	const say = ( room, ws, message ) => room.webSocketMessage( ws, typeof message === 'string' ? message : JSON.stringify( message ) );

	test( 'keepalives are the auto-response, PING answered with PONG', () => {

		const ctx = runtime();
		new DriveRoom( ctx, {} );
		assert.deepEqual( { ...ctx.autoResponse }, { request: PING, response: PONG } );

	} );

	test( 'a batch waits for FLUSH_MS and goes with the next message after; so does the alarm', async () => {

		const set = timers.set;
		const ctx = runtime();
		const room = new DriveRoom( ctx, {} );
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		alice.said();
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153 ) } );
		assert.deepEqual( bob.said(), [ { t: 'S', at: clock, s: [ [ alice.pid, ...carAt( 46.5725, 8.4153 ) ] ] } ] );
		clock += 30;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 1 } ) } );
		clock += 30;
		await say( room, alice, { t: 's', s: carAt( 46.5725, 8.4153, { north: 2 } ) } );
		assert.deepEqual( bob.said(), [] );
		clock += FLUSH_MS - 60;
		await say( room, bob, { t: 'honk' } );
		assert.deepEqual( bob.said(), [ { t: 'S', at: clock, s: [ [ alice.pid, ...carAt( 46.5725, 8.4153, { north: 2 } ) ] ] } ] );
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
		const room = new DriveRoom( ctx, {} );
		const start = clock;
		const alice = await hello( room, ctx );
		const bob = await hello( room, ctx );
		alice.said();
		// Alice only pings, every KEEPALIVE_MS, as an away page does; Bob says nothing at all.
		for ( let t = 25 * SECOND; t <= 2 * IDLE_MS; t += 25 * SECOND ) {

			await wait( room, ctx, start + t - clock );
			ctx.pinged.set( alice, clock );

		}

		assert.deepEqual( bob.closedWith, { code: CLOSE.idle, reason: 'idle' } );
		assert.equal( alice.closedWith, null );
		assert.deepEqual( alice.said(), [ { t: 'leave', pid: bob.pid } ] );
		// The alarm's next is Alice's: IDLE_MS after a keepalive of hers.
		assert.ok( ctx.alarm > clock && ctx.alarm <= ctx.pinged.get( alice ) + IDLE_MS );
		// Stopping, she's closed IDLE_MS after it.
		await wait( room, ctx, IDLE_MS );
		assert.deepEqual( alice.closedWith, { code: CLOSE.idle, reason: 'idle' } );
		assert.equal( ctx.alarm, null );
		assert.ok( ctx.emptied >= 1, 'the empty room deleted its storage' );

	} );

	test( 'the alarm: hello within HELLO_MS, and a visit run out; only set while there are connections', async () => {

		const ctx = runtime();
		const room = new DriveRoom( ctx, {} );
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
		const env = { LIVE: 'on' };
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
		const env = {};
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
		const room = new DriveRoom( ctx, {} );
		const look = Object.fromEntries( [ 'colour', 'finish', 'decal', 'rim', 'boost', 'flame', 'trail', 'smoke' ].map( part => [ part, 'x'.repeat( 24 ) ] ) );
		const ws = await hello( room, ctx, { visit: 'v'.repeat( 22 ), name: 'near:1365.79#3' }, { vehicle: 'police-cruiser', look: { ...look, number: 99 }, place: { name: '東'.repeat( 80 ), lat: - 89.123456, lon: 179.123456, height: 9999.9 } } );
		await say( room, ws, { t: 's', s: carAt( 46.5725, 8.4153, { speed: 343.21, flags: 4095 } ) } );
		const bytes = serialize( ws.attachment ).length;
		assert.ok( bytes < 1024, `${ bytes } bytes` );
		assert.equal( ws.attachment.place.name.length, 60 );
		// Nothing only for memory in it.
		assert.deepEqual( Object.keys( ws.attachment ).filter( key => [ 'moved', 'sent', 'pending', 'queue' ].includes( key ) ), [] );

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
		const room = new DriveRoom( ctx, { DB: db } );
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
		assert.equal( welcome.t, 'welcome' );
		assert.deepEqual( watcher.said().map( m => [ m.t, m.player?.name ?? m.pid, m.player?.star ] ), [ [ 'join', 'Looked Up', true ], [ 'look', welcome.you, undefined ], [ 'honk', welcome.you, undefined ] ] );

	} );

} );
