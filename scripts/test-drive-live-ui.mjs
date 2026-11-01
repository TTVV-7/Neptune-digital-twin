// npm run test:drive-live-ui: driving with others (src/drive-app/live.js, ghosts.js and friends.js)
// in real browser pages on the test pad (the Vite dev server with no Maps key), two and more at
// once. Two drivers dropping in at the same spot share the area's room and see each other's ghost:
// following the other car a quarter of a second behind, within a metre or so, facing its way;
// its flame as it boosts; parked when it pauses; gone when it goes back to the globe and back when
// it drops in again; another ride when it changes; its name and ⭐ over it, a name with HTML in it
// shown as text; driven straight through without a bump, see-through up close; its honk and its
// trick's points over it; and gone, with what it was drawn with freed, when it leaves. A party:
// inviting makes a link, which opens on the globe with a banner to join the friend driving, who's
// dropped in beside; leaving it drops the link from the address. A full area's next shard, a busy
// one, a dropped connection coming back, another tab taking over, a visit run out, the Worker
// switching it off, a touch screen's list and horn, and nothing of it at all when it's off.
//
// The rooms are a small stand-in for the Worker's (worker/drive/live.js), speaking
// live-protocol.js over Node's 'ws' behind Vite's proxy, so the tests can fill a room, close a
// connection with any code and see what it was told. LIVE_TEST_WORKER=<url> runs the same pages
// against a real Worker instead (wrangler dev, with driving with others on): each page's visit
// token comes from its /api/visit (Turnstile's test keys, as test-drive-worker.mjs sets it up), or
// from LIVE_TEST_VISITS (comma-separated), and the tests that need the stand-in's controls skip.
// Every request off this machine is blocked.
//
// TEST_VITE_PORT picks Vite's port (5560), TEST_DRIVE_WORKER_PORT the stand-in's (8960);
// TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import {
	CLOSE, FLAGS, FLUSH_MS, HELLO_MS, HONK_GAP, INTERP_MS, MAX_HELLO, MAX_MESSAGE, NEARBY_SHARDS, PING, PONG, PROTOCOL,
	cellOf, checkLook, checkPlace, checkState, checkTrick, checkVehicle, parseRoom, shardOf,
} from '../src/drive-app/live-protocol.js';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5560;
const ROOMS_PORT = Number( process.env.TEST_DRIVE_WORKER_PORT ) || 8960;
const REAL = process.env.LIVE_TEST_WORKER?.replace( /\/$/, '' ) || null;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const STAND_IN_ONLY = REAL ? 'needs the stand-in rooms (it fills rooms, closes connections and names players)' : false;
// What /api/config answers here, whichever rooms: maps off (the test pad), driving with others on.
const CONFIG = { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: false, googleClientId: '', live: true };
// Where the drivers drop in, and two more areas: one full but for its next shard, one busy.
const PAD = { name: 'Test Pad', lat: 46.5725, lon: 8.4153 };
const FULL = { name: 'Full Area', lat: 47.3, lon: 8.6 };
const BUSY = { name: 'Busy Area', lat: 45.9, lon: 7.2 };
// The leaderboard players the pages have, and what the stand-in calls them.
const ANA = { id: 'P-ana-0000000001', secret: 'A'.repeat( 32 ), name: 'Ana' };
const BO = { id: 'P-bo-00000000002', secret: 'B'.repeat( 32 ), name: 'Bo' };
const BO_SAYS = '<img src=x onerror=pwn()>Bo & <b>co</b>';
// A visit's token, as worker/drive/visits.js makes them.
const VISIT = /^v1\.[A-Za-z0-9_-]{22}\.\d{10}\.[A-Za-z0-9_-]{43}$/;

let chromium;
let browser;
let vite;
let rooms = null;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		( { chromium } = createRequire( '/opt/node-tools/' )( 'playwright' ) );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	if ( ! REAL ) {

		rooms = await startRooms( ROOMS_PORT );
		rooms.known.set( ANA.id, { secret: ANA.secret, name: 'Ana', star: true } );
		rooms.known.set( BO.id, { secret: BO.secret, name: BO_SAYS, star: false } );

	}

	vite = await startVite( PORT, { DRIVE_API: REAL ?? rooms.url }, 'vite.drive.config.js' );
	// Two or three pages draw at once here: none of them may be held back as if in the background.
	browser = await chromium.launch( { args: [
		'--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
		'--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
	] } );

} );

after( async () => {

	await browser?.close();
	vite?.stop();
	rooms?.stop();

} );

// --- the stand-in rooms ----------------------------------------------------------------------

// /api/config, and /api/live's rooms as live-protocol.js describes them: hello, welcome and join,
// what's moved every FLUSH_MS, everything else passed on, leave, and closing with its codes (full
// at a room's most, replaced when the same visit connects again, hello when none comes in time,
// protocol for anything it can't take). It doesn't keep an area's cars to those within view range.
async function startRooms( port ) {

	const rooms = new Map();
	const visits = new Map();
	const caps = new Map();
	const heard = [];
	const known = new Map();
	let guests = 1000;

	const server = createServer( ( req, res ) => {

		const config = req.url === '/api/config';
		res.writeHead( config ? 200 : 404, { 'Content-Type': 'application/json' } );
		res.end( JSON.stringify( config ? CONFIG : { error: 'Not here' } ) );

	} );
	const wss = new WebSocketServer( { noServer: true, handleProtocols: offered => offered.has( PROTOCOL ) ? PROTOCOL : false } );
	server.on( 'upgrade', ( req, socket, head ) => {

		const url = new URL( req.url, 'http://rooms' );
		const name = url.searchParams.get( 'room' );
		const offered = String( req.headers[ 'sec-websocket-protocol' ] ?? '' ).split( ',' ).map( p => p.trim() );
		if ( url.pathname !== '/api/live' || ! parseRoom( name ) || offered[ 0 ] !== PROTOCOL || ! VISIT.test( offered[ 1 ] ?? '' ) ) {

			socket.end( 'HTTP/1.1 403 Forbidden\r\n\r\n' );
			return;

		}

		wss.handleUpgrade( req, socket, head, ws => connected( ws, name, offered[ 1 ] ) );

	} );

	function roomOf( name ) {

		if ( ! rooms.has( name ) ) rooms.set( name, new Map() );
		return rooms.get( name );

	}

	function tell( room, message, except = null ) {

		const text = JSON.stringify( message );
		for ( const member of room.values() ) if ( member !== except ) member.ws.send( text );

	}

	function connected( ws, name, token ) {

		const member = { ws, token, room: name, pid: randomBytes( 6 ).toString( 'base64url' ), player: null, moved: false, honked: 0 };
		const before = visits.get( token );
		visits.set( token, member );
		before?.ws.close( CLOSE.replaced );
		const timer = setTimeout( () => member.player || ws.close( CLOSE.hello ), HELLO_MS );
		ws.on( 'message', ( data, binary ) => {

			try {

				said( member, binary ? null : data.toString() );

			} catch ( err ) {

				heard.push( { room: name, pid: member.pid, refused: err.message } );
				ws.close( CLOSE.protocol );

			}

		} );
		ws.on( 'close', () => {

			clearTimeout( timer );
			if ( visits.get( token ) === member ) visits.delete( token );
			const room = rooms.get( name );
			if ( room?.get( member.pid ) !== member ) return;
			room.delete( member.pid );
			tell( room, { t: 'leave', pid: member.pid } );

		} );

	}

	function said( member, text ) {

		if ( text === PING ) return member.ws.send( PONG );
		if ( typeof text !== 'string' ) throw new Error( 'not text' );
		const m = JSON.parse( text );
		heard.push( { room: member.room, pid: member.pid, token: member.token, ...m } );
		const room = roomOf( member.room );
		if ( ! member.player ) {

			if ( m.t !== 'hello' || text.length > MAX_HELLO ) throw new Error( 'hello first' );
			const vehicle = checkVehicle( m.vehicle );
			const look = checkLook( m.look );
			const place = m.place === null ? null : checkPlace( m.place );
			if ( ! vehicle || ! look || ( m.place !== null && ! place ) || typeof m.away !== 'boolean' ) throw new Error( 'a bad hello' );
			const max = caps.get( member.room ) ?? parseRoom( member.room ).max;
			if ( room.size >= max ) return member.ws.close( CLOSE.full );
			const who = m.player && known.get( m.player.id );
			const named = who && who.secret === m.player.secret ? who : { name: `Guest ${ guests ++ }`, star: false };
			member.player = { pid: member.pid, name: named.name, star: !! named.star, vehicle, look, place, away: m.away, s: null };
			member.ws.send( JSON.stringify( { t: 'welcome', you: member.pid, room: member.room, max, players: [ ...room.values() ].map( other => other.player ) } ) );
			tell( room, { t: 'join', player: member.player } );
			room.set( member.pid, member );
			return;

		}

		if ( text.length > MAX_MESSAGE ) throw new Error( 'too long' );
		const p = member.player;
		const { pid } = member;
		if ( m.t === 's' ) {

			p.s = checkState( m.s );
			if ( ! p.s ) throw new Error( 'a bad state' );
			p.away = false;
			member.moved = true;

		} else if ( m.t === 'look' ) {

			p.vehicle = checkVehicle( m.vehicle );
			p.look = checkLook( m.look );
			if ( ! p.vehicle || ! p.look ) throw new Error( 'a bad look' );
			tell( room, { t: 'look', pid, vehicle: p.vehicle, look: p.look }, member );

		} else if ( m.t === 'place' ) {

			p.place = checkPlace( m.place );
			if ( ! p.place ) throw new Error( 'a bad place' );
			p.away = false;
			tell( room, { t: 'place', pid, place: p.place }, member );

		} else if ( m.t === 'away' ) {

			p.away = true;
			p.s = null;
			tell( room, { t: 'away', pid }, member );

		} else if ( m.t === 'trick' ) {

			const score = checkTrick( m.score );
			if ( ! score ) throw new Error( 'a bad trick' );
			tell( room, { t: 'trick', pid, score }, member );

		} else if ( m.t === 'honk' ) {

			if ( Date.now() - member.honked < HONK_GAP ) return;
			member.honked = Date.now();
			tell( room, { t: 'honk', pid }, member );

		} else throw new Error( `what's ${ m.t }?` );

	}

	const flush = setInterval( () => {

		for ( const room of rooms.values() ) {

			const moved = [ ...room.values() ].filter( member => member.moved );
			if ( ! moved.length ) continue;
			const at = Date.now();
			for ( const member of room.values() ) {

				const s = moved.filter( other => other !== member ).map( other => [ other.pid, ...other.player.s ] );
				if ( s.length ) member.ws.send( JSON.stringify( { t: 'S', at, s } ) );

			}

			for ( const member of moved ) member.moved = false;

		}

	}, FLUSH_MS );

	await new Promise( resolve => server.listen( port, '127.0.0.1', resolve ) );
	return {
		url: `http://127.0.0.1:${ port }`,
		heard, known, rooms,
		// A room's most, for a full one.
		cap( name, max ) {

			caps.set( name, max );

		},
		// Close a visit's connection with `code`, as the room would.
		close( token, code ) {

			visits.get( token )?.ws.close( code );

		},
		member: token => visits.get( token ) ?? null,
		stop() {

			clearInterval( flush );
			for ( const client of wss.clients ) client.terminate();
			server.close();

		},
	};

}

// --- pages ---------------------------------------------------------------------------------

const listed = process.env.LIVE_TEST_VISITS?.split( ',' ).map( token => token.trim() ).filter( Boolean ) ?? [];

// A visit's token: made up for the stand-in, or a real one from the Worker.
async function visitToken() {

	if ( ! REAL ) return `v1.${ randomBytes( 16 ).toString( 'base64url' ) }.${ Math.floor( Date.now() / 1000 ) + 6 * 3600 }.${ randomBytes( 32 ).toString( 'base64url' ) }`;
	if ( listed.length ) return listed.shift();
	const res = await fetch( `${ REAL }/api/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: REAL }, body: JSON.stringify( { token: 'XXXX.DUMMY.TOKEN.XXXX' } ) } );
	const body = await res.json().catch( () => ( {} ) );
	assert.ok( typeof body.visit === 'string', `the Worker's /api/visit gave no visit token (${ res.status })` );
	return body.visit;

}

// A page on the test pad's globe, handed `token` for driving with others (main.js's test seam,
// the dev server's only), with the leaderboard's `player` if any, boost pads off.
async function livePage( { token, player = null, path = '/', touch = false, config = CONFIG, seam = true } ) {

	const viewport = touch ? { width: 390, height: 760 } : { width: 900, height: 560 };
	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( ( { visit, player, seam } ) => {

		if ( seam ) window.worldDriveLiveTest = { visit };
		localStorage.setItem( 'world-drive.pads', 'off' );
		if ( player ) localStorage.setItem( 'world-drive.player', JSON.stringify( player ) );

	}, { visit: token, player, seam } );
	const page = await context.newPage();
	page.token = token;
	page.errors = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	// Console errors too, but for requests blocked here and a socket hung up on while still
	// connecting (switching rooms), which the browser reports as errors.
	page.on( 'console', message => message.type() === 'error' && ! /Failed to load resource|closed before the connection is established/.test( message.text() ) && page.errors.push( message.text() ) );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
	await page.route( `${ BASE }/api/config`, route => route.fulfill( { contentType: 'application/json', body: JSON.stringify( config ) } ) );
	await page.goto( BASE + path );
	await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
	return page;

}

async function dropIn( page, place = PAD ) {

	await page.evaluate( p => {

		window.drive.dropIn( p );

	}, place );
	await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );

}

// The car at ( east, north ), facing `heading`, standing still.
function placeCar( page, east, north, heading = 0 ) {

	return page.evaluate( ( [ east, north, heading ] ) => {

		const d = window.drive.driver;
		for ( const code of [ ...d.keys ] ) d.release( code );
		Object.assign( d, { east, north, heading, course: heading, view: heading, speed: 0, vy: 0, y: 0, pitch: 0, roll: 0, grounded: true, air: null, boost: null } );

	}, [ east, north, heading ] );

}

const live = page => page.evaluate( () => ( { status: window.drive.live.status, room: window.drive.live.room, party: window.drive.live.party, you: window.drive.live.you, others: [ ...window.drive.live.players.values() ].map( p => p.name ) } ) );
const ghosts = page => page.evaluate( () => window.drive.ghosts.list().map( ( { tag, ...ghost } ) => ( { ...ghost, label: tag.querySelector( '.label' ).textContent, tagShown: ! tag.hidden } ) ) );
const waitLive = ( page, room ) => page.waitForFunction( room => window.drive.live.status === 'live' && ( ! room || window.drive.live.room === room ), room, { timeout: 30000 } );

// Where things are, Earth-centred, on a page: its own car and its ghosts (from their scene
// positions, through its earth's matrix as it is now).
function whereAll( page ) {

	return page.evaluate( () => {

		const { globe, entry, ghosts } = window.drive;
		const inverse = globe.earth.matrixWorld.clone().invert();
		const v = globe.earth.position.clone();
		const own = entry ? entry.pivot.getWorldPosition( v ).applyMatrix4( inverse ).toArray() : null;
		const others = ghosts.list().filter( g => g.position ).map( g => ( { pid: g.pid, at: v.fromArray( g.position ).applyMatrix4( inverse ).toArray() } ) );
		return { own, others };

	} );

}

const distance = ( a, b ) => Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] );

async function shot( page, name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

// --- driving with others -----------------------------------------------------------------------

describe( 'World Drive, driving with others', () => {

	let a;
	let b;
	const cell = cellOf( PAD.lat, PAD.lon );

	before( async () => {

		[ a, b ] = await Promise.all( [
			livePage( { token: await visitToken(), player: ANA } ),
			livePage( { token: await visitToken(), player: BO } ),
		] );

	} );

	after( async () => {

		await a?.context().close();
		await b?.context().close();

	} );

	test( 'two drivers dropping in at the same spot share its area and see each other', async () => {

		// On the globe, out of a party, nothing's connected yet.
		assert.deepEqual( await live( a ), { status: 'off', room: null, party: null, you: null, others: [] } );
		assert.ok( await a.locator( '#globe-ui .friends' ).isVisible(), 'no "Drive with friends" on the globe' );
		assert.ok( await a.locator( '#globe-ui .friends .invite' ).isVisible() );
		assert.ok( await a.locator( '#globe-ui .friends input[type=checkbox]' ).isChecked(), 'nearby isn\'t on to begin with' );
		await Promise.all( [ dropIn( a ), dropIn( b ) ] );
		await Promise.all( [ waitLive( a, cell ), waitLive( b, cell ) ] );
		await placeCar( a, 0, 0, 0 );
		await placeCar( b, 4, - 14, 0 );
		await b.waitForFunction( () => window.drive.ghosts.list().some( g => g.visible ), null, { timeout: 30000 } );
		const seen = await ghosts( b );
		assert.equal( seen.length, 1 );
		assert.equal( seen[ 0 ].vehicle, 'go-kart' );
		if ( ! REAL ) {

			// The room's names: Ana has the pass; Bo's name has HTML in it, which is only ever text.
			assert.equal( seen[ 0 ].label, 'Ana⭐' );
			const label = await a.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.tag.querySelector( '.label' ).textContent );
			assert.equal( await label.jsonValue(), BO_SAYS );
			assert.equal( await a.evaluate( () => document.querySelectorAll( '#live-tags img, #live-tags .label b b' ).length ), 0 );
			// What each said first: who, in what, where.
			const hello = rooms.heard.find( m => m.token === a.token && m.t === 'hello' );
			assert.deepEqual( hello.player, { id: ANA.id, secret: ANA.secret } );
			assert.equal( hello.vehicle, 'go-kart' );
			assert.equal( hello.look.colour, 'blaze' );
			assert.equal( hello.away, false );
			assert.equal( hello.place.name, 'Test Pad' );
			assert.ok( Math.abs( hello.place.lat - PAD.lat ) < 1e-4 && Math.abs( hello.place.lon - PAD.lon ) < 1e-4, JSON.stringify( hello.place ) );

		}

		// The chip says who's here, and opens the list.
		await b.locator( '#drive-ui .live-chip', { hasText: 'Nearby · 2' } ).waitFor();
		await b.locator( '#drive-ui .live-chip' ).click();
		const row = b.locator( '#drive-ui .players li' );
		await row.first().waitFor();
		assert.equal( await row.count(), 1 );
		assert.match( await row.locator( '.what' ).textContent(), /^Go-kart · \d+ m$/ );
		await shot( b, 'live-1-list' );
		// Hidden for this visit, and shown again.
		await row.locator( 'button.hide' ).click();
		await b.waitForFunction( () => ! window.drive.ghosts.list()[ 0 ].visible && window.drive.ghosts.list()[ 0 ].tag.hidden );
		assert.equal( await row.locator( 'button.hide' ).textContent(), 'Show' );
		await row.locator( 'button.hide' ).click();
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ].visible );
		await b.locator( '#drive-ui .live-chip' ).click();
		assert.equal( await b.locator( '#drive-ui .players' ).isVisible(), false );
		await shot( b, 'live-2-ghost' );

	} );

	test( 'A drives: B\'s ghost follows a quarter of a second behind, within a metre or so, facing its way', async () => {

		// Where A really is, each frame as it's sent, and where B draws it, each frame as it's drawn
		// (both Earth-centred, on the shared clock).
		await a.evaluate( () => {

			const { live, globe } = window.drive;
			const earth = globe.earth;
			const inverse = earth.matrixWorld.clone();
			const v = earth.position.clone();
			const q = earth.quaternion.clone();
			const turn = earth.quaternion.clone();
			const update = live.update;
			window.track = [];
			live.update = car => {

				update( car );
				const pivot = window.drive.entry?.pivot;
				if ( ! pivot || ! window.track ) return;
				inverse.copy( earth.matrixWorld ).invert();
				pivot.getWorldPosition( v ).applyMatrix4( inverse );
				turn.setFromRotationMatrix( earth.matrixWorld ).invert();
				pivot.getWorldQuaternion( q ).premultiply( turn );
				window.track.push( [ performance.timeOrigin + performance.now(), ...v.toArray(), ...q.toArray() ] );

			};

		} );
		await b.evaluate( () => {

			const { ghosts, globe } = window.drive;
			const earth = globe.earth;
			const inverse = earth.matrixWorld.clone();
			const v = earth.position.clone();
			const q = earth.quaternion.clone();
			const turn = earth.quaternion.clone();
			const update = ghosts.update;
			window.track = [];
			ghosts.update = ( dt, shown ) => {

				update( dt, shown );
				const ghost = ghosts.list().find( g => g.visible );
				if ( ! ghost || ! window.track ) return;
				inverse.copy( earth.matrixWorld ).invert();
				v.fromArray( ghost.position ).applyMatrix4( inverse );
				turn.setFromRotationMatrix( earth.matrixWorld ).invert();
				q.fromArray( ghost.quaternion ).premultiply( turn );
				window.track.push( [ performance.timeOrigin + performance.now(), ...v.toArray(), ...q.toArray() ] );

			};

		} );
		// Off to the north-east, and round to the right for a second on the way.
		await placeCar( a, 0, 0, 30 );
		const started = Date.now();
		await a.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await a.waitForTimeout( 1200 );
		await a.evaluate( () => window.drive.driver.press( 'KeyD' ) );
		await a.waitForTimeout( 1000 );
		await a.evaluate( () => window.drive.driver.release( 'KeyD' ) );
		await a.waitForTimeout( 800 );
		const { speed, heading } = await a.evaluate( () => {

			window.drive.driver.release( 'KeyW' );
			return { speed: window.drive.driver.speed, heading: window.drive.driver.heading };

		} );
		assert.ok( heading > 45, `A only turned to ${ heading }°` );
		assert.ok( speed > 5, `A only got to ${ speed } m/s` );
		await a.waitForTimeout( 600 );
		const truth = await a.evaluate( () => window.track );
		const drawn = await b.evaluate( () => window.track );
		await a.evaluate( () => window.track = null );
		await b.evaluate( () => window.track = null );

		// Each frame B drew while A was moving, against where A was INTERP_MS before.
		const errors = [];
		const turns = [];
		for ( const [ t, ...rest ] of drawn ) {

			const when = t - INTERP_MS;
			const i = truth.findIndex( row => row[ 0 ] > when );
			if ( when < started + 500 || i < 1 ) continue;
			const [ t0, ...s0 ] = truth[ i - 1 ];
			const [ t1, ...s1 ] = truth[ i ];
			const u = ( when - t0 ) / ( t1 - t0 );
			const p = [ 0, 1, 2 ].map( k => s0[ k ] + ( s1[ k ] - s0[ k ] ) * u );
			if ( distance( s0, s1 ) < 1e-3 ) continue;
			errors.push( distance( p, rest ) );
			// Its turn then, between the two (near enough to a slerp, a frame apart).
			const sign = Math.sign( [ 3, 4, 5, 6 ].reduce( ( sum, k ) => sum + s0[ k ] * s1[ k ], 0 ) ) || 1;
			const q = [ 3, 4, 5, 6 ].map( k => s0[ k ] + ( s1[ k ] * sign - s0[ k ] ) * u );
			const length = Math.hypot( ...q );
			const dot = Math.abs( q.reduce( ( sum, value, k ) => sum + value / length * rest[ k + 3 ], 0 ) );
			turns.push( 2 * Math.acos( Math.min( 1, dot ) ) * 180 / Math.PI );

		}

		errors.sort( ( x, y ) => x - y );
		turns.sort( ( x, y ) => x - y );
		const at = ( list, share ) => list[ Math.min( list.length - 1, Math.floor( list.length * share ) ) ];
		const summary = `${ errors.length } frames: median ${ at( errors, 0.5 )?.toFixed( 2 ) } m, 90 % ${ at( errors, 0.9 )?.toFixed( 2 ) } m, most ${ errors.at( - 1 )?.toFixed( 2 ) } m; turned ${ at( turns, 0.5 )?.toFixed( 1 ) }° (median), ${ turns.at( - 1 )?.toFixed( 1 ) }° at most`;
		console.log( `    ghost following: ${ summary }` );
		assert.ok( errors.length >= 8, `too few frames to tell: ${ summary }` );
		assert.ok( at( errors, 0.5 ) < 1 && at( errors, 0.9 ) < 1.5, summary );
		assert.ok( at( turns, 0.5 ) < 3 && turns.at( - 1 ) < 8, summary );

		// Stopped: there, to a few centimetres.
		await a.evaluate( () => Object.assign( window.drive.driver, { speed: 0 } ) );
		await a.waitForTimeout( 1500 );
		const [ here, there ] = await Promise.all( [ whereAll( a ), whereAll( b ) ] );
		assert.ok( distance( here.own, there.others[ 0 ].at ) < 0.3, `B draws A ${ distance( here.own, there.others[ 0 ].at ).toFixed( 2 ) } m from where it is` );

	} );

	test( 'A boosts: B\'s ghost has its flame', async () => {

		await placeCar( a, 0, 0, 0 );
		await a.evaluate( () => {

			const d = window.drive.driver;
			d.gauge = 1;
			d.press( 'ShiftLeft' );

		} );
		await b.waitForFunction( flag => {

			const ghost = window.drive.ghosts.list()[ 0 ];
			let flame = false;
			window.drive.ghosts.group.traverse( o => flame ||= o.name === 'drive-fx' && o.children[ 0 ].visible );
			return ghost?.fx && ghost.flags & flag && flame;

		}, FLAGS.firing, { timeout: 15000 } );
		await shot( b, 'live-3-boost' );
		await a.evaluate( () => window.drive.driver.release( 'ShiftLeft' ) );
		await b.waitForFunction( flag => ! ( window.drive.ghosts.list()[ 0 ].flags & flag ), FLAGS.firing, { timeout: 15000 } );

	} );

	test( 'A pauses: parked on B, and the list says so', async () => {

		await placeCar( a, 0, 0, 0 );
		await a.keyboard.press( 'Escape' );
		await a.waitForFunction( () => window.drive.mode === 'paused' );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.paused, null, { timeout: 15000 } );
		const before = ( await whereAll( b ) ).others[ 0 ].at;
		await b.waitForTimeout( 2500 );
		const seen = ( await ghosts( b ) )[ 0 ];
		assert.ok( seen.visible && seen.paused );
		assert.ok( distance( before, ( await whereAll( b ) ).others[ 0 ].at ) < 0.05, 'a parked ghost moved' );
		await b.locator( '#drive-ui .live-chip' ).click();
		await b.locator( '#drive-ui .players .what', { hasText: 'paused' } ).waitFor();
		await b.locator( '#drive-ui .live-chip' ).click();

	} );

	test( 'A changes ride: B\'s ghost is the new ride', async () => {

		await a.locator( '#pause .vehicles .vehicle[data-id="muscle-car"]' ).click();
		await a.waitForFunction( () => window.drive.mode === 'driving' && window.drive.entry.state.name === 'Muscle car', null, { timeout: 30000 } );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.vehicle === 'muscle-car' && window.drive.ghosts.list()[ 0 ].visible, null, { timeout: 30000 } );
		if ( ! REAL ) {

			const look = rooms.heard.filter( m => m.token === a.token && m.t === 'look' ).at( - 1 );
			assert.equal( look.vehicle, 'muscle-car' );

		}

		// The pickup, a model from the library, as the muscle car is one of World Drive's own.
		await a.keyboard.press( 'Escape' );
		await a.locator( '#pause .vehicles .vehicle[data-id="pickup-truck"]' ).click();
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.vehicle === 'pickup-truck' && window.drive.ghosts.list()[ 0 ].visible, null, { timeout: 30000 } );
		await shot( b, 'live-3b-pickup' );

		// And back in the kart, for what follows.
		await a.keyboard.press( 'Escape' );
		await a.locator( '#pause .vehicles .vehicle[data-id="go-kart"]' ).click();
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.vehicle === 'go-kart' && window.drive.ghosts.list()[ 0 ].visible, null, { timeout: 30000 } );

		// Painted racing red in the Garage, while paused: red on B too.
		const red = 0xd81e2c;
		const painted = hex => {

			let found = false;
			window.drive.ghosts.group.traverse( o => found ||= o.isMesh && o.material.color?.getHex() === hex );
			return found;

		};
		assert.equal( await b.evaluate( painted, red ), false );
		await a.keyboard.press( 'Escape' );
		await a.locator( '#pause .garage-open' ).click();
		await a.locator( '#garage [data-part="colour"] .choice[data-id="red"]' ).click();
		await a.locator( '#garage .done' ).click();
		await b.waitForFunction( painted, red, { timeout: 30000 } );
		await a.keyboard.press( 'Escape' );
		await a.waitForFunction( () => window.drive.mode === 'driving' );

	} );

	test( 'B drives straight through A\'s ghost: no bump, and see-through up close', async () => {

		await placeCar( a, 0, 0, 0 );
		await a.keyboard.press( 'Escape' );
		await a.waitForFunction( () => window.drive.mode === 'paused' );
		await placeCar( b, 0, - 25, 0 );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.paused );
		const run = await b.evaluate( () => new Promise( resolve => {

			const { driver: d, ghosts } = window.drive;
			const out = { air: false, faded: false, slowed: 0, north: [] };
			let last = 0;
			const update = ghosts.update;
			ghosts.update = ( dt, shown ) => {

				update( dt, shown );
				out.air ||= ! d.grounded || !! d.air;
				out.faded ||= ghosts.list()[ 0 ]?.faded;
				out.slowed = Math.max( out.slowed, last - d.speed );
				last = d.speed;
				out.north.push( d.north );
				if ( d.north > 15 || out.north.length > 600 ) {

					ghosts.update = update;
					d.release( 'KeyW' );
					resolve( out );

				}

			};
			d.press( 'KeyW' );

		} ) );
		assert.ok( run.north.at( - 1 ) > 15, `B didn't get past: ${ run.north.at( - 1 ) }` );
		assert.equal( run.air, false, 'B was thrown up' );
		assert.ok( run.slowed < 1, `B slowed by ${ run.slowed } m/s in a frame` );
		assert.ok( run.faded, 'the ghost wasn\'t see-through up close' );
		// Nothing in the scene the drive's rays look at is a ghost's.
		assert.equal( await b.evaluate( () => {

			const { ground, ghosts } = window.drive;
			let inside = 0;
			for ( const collider of ground.getColliders() ) ghosts.group.traverseAncestors( o => inside += o === collider );
			return inside;

		} ), 0 );

	} );

	test( 'Go to, from the list: beside A in this scene, facing A\'s way', async () => {

		// A is parked at the middle of the pad facing north; B is up the road past it.
		await b.locator( '#drive-ui .live-chip' ).click();
		await b.locator( '#drive-ui .players button.go' ).click();
		await b.waitForFunction( () => window.drive.mode === 'driving' && Math.abs( window.drive.driver.north ) < 1 );
		assert.equal( await b.locator( '#drive-ui .players' ).isVisible(), false );
		const { east, north, heading } = await b.evaluate( () => window.drive.driver );
		// A's right, facing north, is east.
		assert.ok( Math.abs( east - 5 ) < 0.3 && Math.abs( north ) < 0.3 && Math.abs( heading ) < 1, JSON.stringify( { east, north, heading } ) );

	} );

	test( 'A honks and lands a trick: over A\'s car on both pages, with a beep for B', async () => {

		await a.keyboard.press( 'Enter' );
		await a.waitForFunction( () => window.drive.mode === 'driving' );
		await placeCar( a, 0, 0, 0 );
		await placeCar( b, 6, - 12, 0 );
		// A key pressed lets the page make sound.
		await b.keyboard.press( 'KeyX' );
		const beeps = await b.evaluate( () => window.drive.friends.beeps );
		await a.keyboard.press( 'KeyH' );
		assert.ok( await a.evaluate( () => ! document.querySelector( '.live-tag.self .honk' ).hidden ) );
		await b.waitForFunction( () => ! window.drive.ghosts.list()[ 0 ].tag.querySelector( '.honk' ).hidden, null, { timeout: 10000 } );
		assert.equal( await b.evaluate( () => window.drive.ghosts.list()[ 0 ].tag.querySelector( '.honk' ).textContent ), '📣' );
		await b.waitForFunction( beeps => window.drive.friends.beeps > beeps, beeps );
		if ( ! REAL ) assert.equal( rooms.heard.filter( m => m.token === a.token && m.t === 'honk' ).length, 1 );
		await shot( b, 'live-4-honk' );

		// A backflip, landed at a fixed step (as in test-drive-ui.mjs): its points over A on B.
		const scored = await a.evaluate( () => {

			const { driver: d } = window.drive;
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: 40 / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, boost: null } );
			d.update( 1 / 60 );
			const before = d.score;
			d.hop();
			d.vy = 12;
			d.press( 'KeyS' );
			for ( let i = 0; i < 300; i ++ ) {

				d.update( 1 / 60 );
				if ( d.air && d.air.turned.x > Math.PI * 2 - 0.8 ) d.release( 'KeyS' );
				if ( d.grounded && ! d.air && i > 10 ) break;

			}

			return d.score - before;

		} );
		assert.ok( scored > 0, 'no backflip landed' );
		await b.waitForFunction( () => ! window.drive.ghosts.list()[ 0 ].tag.querySelector( '.pop' ).hidden, null, { timeout: 10000 } );
		const pop = await b.evaluate( () => window.drive.ghosts.list()[ 0 ].tag.querySelector( '.pop' ).textContent );
		assert.equal( pop, `+${ scored.toLocaleString( 'en-CA' ) }` );

	} );

	test( 'A goes back to the globe: gone on B; dropping in again: back', async () => {

		await a.keyboard.press( 'KeyM' );
		await a.waitForFunction( () => window.drive.mode === 'globe' );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.away && ! window.drive.ghosts.list()[ 0 ].visible, null, { timeout: 15000 } );
		await b.locator( '#drive-ui .live-chip' ).click();
		await b.locator( '#drive-ui .players .what', { hasText: 'on the globe' } ).waitFor();
		assert.ok( await b.locator( '#drive-ui .players button.go' ).isDisabled() );
		await b.locator( '#drive-ui .live-chip' ).click();
		// A's still in the area's room for a minute.
		assert.equal( ( await live( a ) ).room, cell );
		await dropIn( a );
		await placeCar( a, 0, 0, 0 );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.visible && ! window.drive.ghosts.list()[ 0 ].away, null, { timeout: 30000 } );

	} );

	test( 'A switches nearby off: A\'s ghost goes from B, and what it was drawn with is freed', async () => {

		// What B has drawn with, with A's ghost there and then without it.
		const memory = () => b.evaluate( () => new Promise( resolve => requestAnimationFrame( () => requestAnimationFrame( () => resolve( { ...window.drive.renderer.info.memory, children: window.drive.ghosts.group.children.length } ) ) ) ) );
		await a.keyboard.press( 'Escape' );
		const toggle = a.locator( '#pause .friends input[type=checkbox]' ).first();
		await toggle.uncheck();
		await b.waitForFunction( () => window.drive.ghosts.size === 0, null, { timeout: 15000 } );
		assert.equal( ( await live( a ) ).status, 'off' );
		assert.equal( await a.evaluate( () => localStorage.getItem( 'world-drive.nearby' ) ), 'off' );
		assert.equal( await a.locator( '#drive-ui .live-chip' ).isHidden(), true );
		const without = await memory();
		assert.equal( without.children, 0 );
		await toggle.check();
		await a.keyboard.press( 'Escape' );
		await waitLive( a, cell );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.visible && window.drive.ghosts.list()[ 0 ].fx, null, { timeout: 30000 } );
		const withGhost = await memory();
		assert.ok( withGhost.geometries > without.geometries, `${ withGhost.geometries } geometries with A's ghost, ${ without.geometries } without` );
		await a.keyboard.press( 'Escape' );
		await toggle.uncheck();
		await b.waitForFunction( () => window.drive.ghosts.size === 0, null, { timeout: 15000 } );
		const after = await memory();
		assert.deepEqual( { geometries: after.geometries, textures: after.textures, children: after.children }, { geometries: without.geometries, textures: without.textures, children: 0 } );
		assert.equal( await b.evaluate( () => document.querySelectorAll( '#live-tags .live-tag:not( .self )' ).length ), 0 );
		await toggle.check();
		await a.keyboard.press( 'Escape' );
		await waitLive( a, cell );

	} );

	test( 'nothing went wrong on either page', () => {

		assert.deepEqual( a.errors, [] );
		assert.deepEqual( b.errors, [] );

	} );

} );

describe( 'World Drive, a party', () => {

	let a;
	let b;
	let code;

	before( async () => {

		a = await livePage( { token: await visitToken(), player: ANA } );
		await dropIn( a );
		await placeCar( a, 10, 20, 90 );

	} );

	after( async () => {

		await a?.context().close();
		await b?.context().close();

	} );

	test( 'Invite friends makes a party with a link, in the address while you\'re in it', async () => {

		await a.keyboard.press( 'Escape' );
		await a.locator( '#pause .friends .invite' ).click();
		await a.waitForFunction( () => window.drive.live.party && window.drive.live.status === 'live', null, { timeout: 20000 } );
		code = await a.evaluate( () => window.drive.live.party );
		assert.match( code, /^[A-HJ-NP-Z2-9]{7}$/ );
		assert.equal( ( await live( a ) ).room, `party:${ code }` );
		assert.equal( await a.locator( '#pause .friends .link-text' ).inputValue(), `${ BASE }/?party=${ code }` );
		assert.equal( new URL( a.url() ).searchParams.get( 'party' ), code );
		assert.match( await a.locator( '#pause .friends .members' ).textContent(), /^You$/ );
		assert.equal( await a.locator( '#pause .friends .invite' ).isVisible(), false );
		await shot( a, 'live-5-invite' );
		await a.keyboard.press( 'Escape' );
		await a.locator( '#drive-ui .live-chip', { hasText: 'Party · 1' } ).waitFor();

	} );

	test( 'the link opens on the globe with a banner, and Join drops in beside the friend', async () => {

		b = await livePage( { token: await visitToken(), player: BO, path: `/?party=${ code }` } );
		await waitLive( b, `party:${ code }` );
		const banner = b.locator( '#globe-ui .party-banner' );
		await banner.locator( '.join' ).waitFor();
		assert.equal( await banner.locator( 'span' ).first().textContent(), REAL ? `${ ( await live( b ) ).others[ 0 ] } is driving at Test Pad` : 'Ana ⭐ is driving at Test Pad' );
		await shot( b, 'live-6-banner' );
		// On A's side, Bo has joined (on the globe).
		await a.waitForFunction( () => window.drive.live.players.size === 1 );
		await banner.locator( '.join' ).click();
		await b.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		assert.equal( await banner.isVisible(), false );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.visible, null, { timeout: 30000 } );
		const [ here, there ] = await Promise.all( [ whereAll( a ), whereAll( b ) ] );
		const apart = distance( here.own, there.own );
		assert.ok( apart > 3 && apart < 7, `B dropped in ${ apart.toFixed( 1 ) } m from A` );
		// Facing the same way as A (east).
		assert.ok( Math.abs( await b.evaluate( () => window.drive.driver.heading ) - 90 ) < 5 );
		await a.locator( '#drive-ui .live-chip', { hasText: 'Party · 2' } ).waitFor();
		assert.equal( new URL( b.url() ).searchParams.get( 'party' ), code );
		await shot( b, 'live-7-joined' );

	} );

	test( 'a friend going somewhere else: a toast to join them', async () => {

		await a.keyboard.press( 'KeyM' );
		await a.waitForFunction( () => window.drive.mode === 'globe' );
		await dropIn( a, { name: 'Over There', lat: PAD.lat + 0.3, lon: PAD.lon } );
		const toast = b.locator( '#toast', { hasText: 'went to Over There' } );
		await toast.waitFor( { timeout: 20000 } );
		assert.ok( await toast.locator( '.toast-action', { hasText: 'Join' } ).isVisible() );

	} );

	test( 'Leave party: back to the area, and the link out of the address', async () => {

		await b.keyboard.press( 'Escape' );
		await b.locator( '#pause .friends .leave' ).click();
		await waitLive( b, cellOf( PAD.lat, PAD.lon ) );
		assert.equal( new URL( b.url() ).searchParams.has( 'party' ), false );
		assert.equal( ( await live( b ) ).party, null );
		assert.ok( await b.locator( '#pause .friends .invite' ).isVisible() );
		await a.waitForFunction( () => window.drive.live.players.size === 0, null, { timeout: 15000 } );
		await b.keyboard.press( 'Escape' );

	} );

	test( 'a full area: the next of its shards; all of them full: "Nearby is busy"', { skip: STAND_IN_ONLY }, async () => {

		const full = cellOf( FULL.lat, FULL.lon );
		rooms.cap( full, 1 );
		const filler = await connectAs( await visitToken(), full );
		await b.keyboard.press( 'KeyM' );
		await dropIn( b, FULL );
		await waitLive( b, shardOf( full, 1 ) );
		await b.locator( '#drive-ui .live-chip', { hasText: 'Nearby · just you' } ).waitFor();
		filler.close();

		const busy = cellOf( BUSY.lat, BUSY.lon );
		for ( let shard = 0; shard < NEARBY_SHARDS; shard ++ ) rooms.cap( shard ? shardOf( busy, shard ) : busy, 0 );
		await b.keyboard.press( 'KeyM' );
		await dropIn( b, BUSY );
		await b.locator( '#drive-ui .live-chip', { hasText: 'Nearby is busy' } ).waitFor( { timeout: 20000 } );
		assert.deepEqual( await live( b ), { status: 'busy', room: null, party: null, you: null, others: [] } );
		// Every shard was tried, once.
		assert.deepEqual( rooms.heard.filter( m => m.token === b.token && m.t === 'hello' && m.room.startsWith( busy ) ).map( m => m.room ), [ busy, `${ busy }#1`, `${ busy }#2`, `${ busy }#3` ] );

	} );

	test( 'a dropped connection comes back', { skip: STAND_IN_ONLY }, async () => {

		await b.keyboard.press( 'KeyM' );
		await dropIn( b );
		await waitLive( b, cellOf( PAD.lat, PAD.lon ) );
		const first = ( await live( b ) ).you;
		rooms.close( b.token, CLOSE.idle );
		await b.waitForFunction( first => window.drive.live.status === 'live' && window.drive.live.you !== first, first, { timeout: 15000 } );

	} );

	test( 'another tab with the same visit: this one stops, and says so', async () => {

		await waitLive( b );
		const other = await connectAs( b.token, ( await live( b ) ).room );
		await b.locator( '#toast', { hasText: 'Driving with others moved to another tab.' } ).waitFor( { timeout: 15000 } );
		assert.equal( ( await live( b ) ).status, 'ended' );
		assert.equal( await b.locator( '#drive-ui .live-chip' ).isHidden(), true );
		other.close();
		// It stays stopped: nothing more is tried.
		await b.waitForTimeout( 2500 );
		assert.equal( ( await live( b ) ).status, 'ended' );
		// Single-player driving goes on.
		await b.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await b.waitForFunction( () => window.drive.driver.speed > 2 );
		await b.evaluate( () => window.drive.driver.release( 'KeyW' ) );

	} );

	test( 'nothing went wrong on either page', () => {

		assert.deepEqual( a.errors, [] );
		assert.deepEqual( b.errors, [] );

	} );

} );

describe( 'World Drive, driving with others ending and off', () => {

	test( 'a visit run out stops it, with a word to reload', { skip: STAND_IN_ONLY }, async () => {

		const page = await livePage( { token: await visitToken(), path: '/?party=ABCDEFG' } );
		await waitLive( page, 'party:ABCDEFG' );
		await page.locator( '#globe-ui .party-banner', { hasText: 'Waiting for your friends' } ).waitFor();
		rooms.close( page.token, CLOSE.expired );
		await page.locator( '#toast', { hasText: 'Reload for a fresh drive' } ).waitFor( { timeout: 10000 } );
		assert.equal( ( await live( page ) ).status, 'ended' );
		assert.equal( await page.locator( '#globe-ui .party-banner' ).isHidden(), true );
		await page.context().close();

	} );

	test( 'switched off on the Worker: it all goes, without a word', { skip: STAND_IN_ONLY }, async () => {

		const page = await livePage( { token: await visitToken(), path: '/?party=ABCDEFH' } );
		await waitLive( page, 'party:ABCDEFH' );
		rooms.close( page.token, CLOSE.off );
		await page.waitForFunction( () => window.drive.live.ended === 'off' );
		assert.equal( await page.locator( '#globe-ui .friends' ).isHidden(), true );
		assert.equal( await page.locator( '#globe-ui .party-banner' ).isHidden(), true );
		assert.doesNotMatch( await page.locator( '#toast' ).textContent(), /others/ );
		await page.context().close();

	} );

	test( 'a touch screen: the chip and the list by tap, and the horn button', async () => {

		const [ a, phone ] = await Promise.all( [
			livePage( { token: await visitToken(), player: ANA } ),
			livePage( { token: await visitToken(), touch: true } ),
		] );
		await Promise.all( [ dropIn( a ), dropIn( phone ) ] );
		const cell = cellOf( PAD.lat, PAD.lon );
		await Promise.all( [ waitLive( a, cell ), waitLive( phone, cell ) ] );
		await placeCar( a, 0, 0, 0 );
		await placeCar( phone, 3, - 12, 0 );
		const horn = phone.locator( '#drive-ui .horn' );
		assert.ok( await horn.isVisible(), 'no horn button on a touch screen' );
		assert.equal( await a.locator( '#drive-ui .horn' ).isVisible(), false );
		await phone.locator( '#drive-ui .live-chip', { hasText: 'Nearby · 2' } ).tap();
		await phone.locator( '#drive-ui .players li' ).first().waitFor();
		await shot( phone, 'live-8-phone-list' );
		await phone.locator( '#drive-ui .live-chip' ).tap();
		await horn.tap();
		assert.ok( await phone.evaluate( () => ! document.querySelector( '.live-tag.self .honk' ).hidden ) );
		await a.waitForFunction( () => ! window.drive.ghosts.list()[ 0 ]?.tag.querySelector( '.honk' ).hidden, null, { timeout: 10000 } );
		await shot( phone, 'live-9-phone-honk' );
		assert.deepEqual( phone.errors, [] );
		await a.context().close();
		await phone.context().close();

	} );

	test( 'driving into another area: the room follows after 5 s there', async () => {

		const page = await livePage( { token: await visitToken() } );
		await dropIn( page );
		const cell = cellOf( PAD.lat, PAD.lon );
		await waitLive( page, cell );
		// 25 km east, well into another area (parked there: the pad doesn't reach that far).
		await page.evaluate( () => Object.assign( window.drive.driver, { east: 25000 } ) );
		await page.keyboard.press( 'Escape' );
		const moved = Date.now();
		await page.waitForFunction( cell => window.drive.live.room && window.drive.live.room !== cell, cell, { timeout: 20000 } );
		const waited = Date.now() - moved;
		const { room } = await live( page );
		assert.equal( parseRoom( room )?.kind, 'near' );
		assert.ok( waited > 4500, `the room followed after ${ waited } ms` );
		await waitLive( page, room );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'off (no word from the Worker that it\'s on): nothing of it, and driving as ever', async () => {

		const page = await livePage( { token: await visitToken(), config: { ...CONFIG, live: undefined }, seam: false } );
		assert.equal( await page.evaluate( () => window.drive.live ), null );
		assert.equal( await page.locator( '#globe-ui .friends' ).isHidden(), true );
		await dropIn( page );
		assert.equal( await page.locator( '#drive-ui .live-chip' ).isHidden(), true );
		assert.equal( await page.locator( '#pause .friends' ).count(), 1 );
		assert.equal( await page.locator( '#pause .friends' ).isHidden(), true );
		assert.equal( await page.locator( '#drive-ui .live-key' ).isHidden(), true );
		await page.keyboard.press( 'KeyH' );
		assert.equal( await page.evaluate( () => document.querySelectorAll( '#live-tags *' ).length ), 0 );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

} );

// A connection of the test's own to a room, as another page would make, said hello: its socket.
// For a room to be full with, or to take over a page's visit.
function connectAs( token, room ) {

	const backend = ( REAL ?? rooms.url ).replace( /^http/, 'ws' );
	const ws = new WebSocket( `${ backend }/api/live?room=${ encodeURIComponent( room ) }`, [ PROTOCOL, token ], { headers: { Origin: REAL ?? BASE } } );
	return new Promise( ( resolve, reject ) => {

		ws.on( 'open', () => ws.send( JSON.stringify( { t: 'hello', player: null, vehicle: 'go-kart', look: {}, place: null, away: true } ) ) );
		ws.on( 'message', data => {

			if ( JSON.parse( data.toString() ).t === 'welcome' ) resolve( ws );

		} );
		ws.on( 'close', code => reject( new Error( `closed with ${ code }` ) ) );
		ws.on( 'error', reject );

	} );

}
