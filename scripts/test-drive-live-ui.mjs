// npm run test:drive-live-ui: driving with others (src/drive-app/live.js, ghosts.js and friends.js)
// in real browser pages on the test pad (the Vite dev server, no Maps key), talking to the real
// Worker's rooms (worker/drive/live.js under `wrangler dev`, LIVE on) through the dev server's
// proxy, two to four pages at once. Two drivers dropping in at the same spot share the area's room
// and see each other's ghost: following the other car INTERP_MS behind, within a few tens of
// centimetres, facing its way; its flame as it boosts; parked when it pauses; gone when it goes
// back to the globe and back when it drops in again; another ride and paint when it changes; its
// name from the leaderboard and ⭐ over it, a name with HTML in it shown as text; driven straight
// through without a bump, see-through up close; its honk and its trick's points over it; and
// gone, with what it was drawn with freed, when it leaves. The pickup (a skinned model) drawn where
// its ghost is; a flood of new rides and paint built for none of it; hidden, what's heard of it not
// piling up; Go to on the ground under a roof, not on it. A party: inviting makes a link, which
// opens on the globe with a banner to join the friend driving, who's dropped in beside; a driver
// at the same spot outside the party sees neither of them but does see another driver there; a
// ninth member is told it's full; a reload rejoins; leaving drops the link from the address. A
// full area's next shard, a busy one (tried again at the next drop-in there), a dropped connection
// coming back (and one gone quiet, passing nothing), another tab taking over, a visit run out, a
// touch screen's list, compact chip and horn, the room following the car into another area,
// only the page's own origin through the proxy, and the Worker restarted with LIVE off: open pages
// stop without a word and new ones show nothing of it, driving as ever. Alone in its room a page
// sends no states, and a driver joining sees it at once; the ghost following is measured at
// SEND_HZ, and only at STILL_HZ while the only other one in the room is on the globe. Who's driving
// now, on the globe (online.js): a driver dropping in shows as a dot within about a minute, on a page
// on the globe and in its panel's "Driving now" (named after the start spot near it, the busiest
// first); several drawn as one never overlapping, and a tap on them flying down till they part;
// tapping one flies there and pins it, the card saying how many, and Drive here puts you in their
// room, their ghost in sight; one in a party, or with nearby off, never shows, and a page just back
// on the globe doesn't count itself, even with another of its room in a dot of their own; a page
// asks while it's used, not once idle (asking at once at the next touch), not while the Garage is
// open, and not once its visit has run out. The day's budget spent (the Worker with a small
// LIVE_DAILY_BUDGET, spent by connecting): a page turned away says so once and shows nothing more of
// it, a party's link says why, and both drive as ever; with LIVE off, nothing of who's driving now
// either, not even an ask.
//
// Visit tokens are made here with Turnstile's documented test secret, as /api/visit makes them
// (the test pad has no visit of its own: main.js's dev-only seam hands each page one). The
// leaderboard players are made through the Worker; a supporter's ⭐ and a name with HTML in it are
// set in its database as the owner would in the D1 console. Between Vite and the Worker is a line
// the tests can cut, as a phone in a tunnel drops its connection. Every request off this machine
// is blocked.
//
// TEST_VITE_PORT picks Vite's port (5560), TEST_DRIVE_WORKER_PORT the Worker's (8960; the line is
// the next one up); TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { WebSocket } from 'ws';
import { FLAGS, INTERP_MS, NEARBY_SHARDS, PARTY_MAX, PROTOCOL, SEND_HZ, cellOf, makePartyCode, parseRoom, shardOf } from '../src/drive-app/live-protocol.js';
import { makeVisit } from '../worker/drive/visits.js';
import { startVite, startWorker } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5560;
const WORKER_PORT = Number( process.env.TEST_DRIVE_WORKER_PORT ) || 8960;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
// Turnstile's documented test secret, which always passes: the Worker's here.
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const HOUR = 60 * 60 * 1000;
// Small areas here (LIVE_NEARBY_MAX), to fill one and all its shards quickly.
const NEARBY_MAX = 4;
// The Worker as World Drive's own (wrangler.drive.jsonc) with no Maps key, so the page offers the
// test pad. LIVE is the file's ("on") until the last tests switch it off.
// TEST_CLOCK: the tests ask /api/online afresh, each at a time of its own (X-Test-Time), where pages
// get the answer kept for 30 s.
const VARS = {
	GOOGLE_MAPS_API_KEY: '', GOOGLE_CLIENT_ID: '', TURNSTILE_SECRET: PASS_SECRET, TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
	SUPPORTER_EMAILS: 'ana@example.com', LIVE_NEARBY_MAX: String( NEARBY_MAX ), TEST_CLOCK: 'header',
};
// Where the drivers drop in, a place 33 km north, and two more areas: one full but for its next
// shard, one busy.
const PAD = { name: 'Test Pad', lat: 46.5725, lon: 8.4153 };
const THERE = { name: 'Over There', lat: PAD.lat + 0.3, lon: PAD.lon };
const FULL = { name: 'Full Area', lat: 47.3, lon: 8.6 };
const BUSY = { name: 'Busy Area', lat: 45.9, lon: 7.2 };
// A name that got onto the board some other way (the owner's console): only ever shown as text.
const BO_SAYS = '<img src=x onerror=pwn()>Bo & <b>co</b>';

let chromium;
let browser;
let worker;
let line;
let vite;
// The leaderboard's players the pages have: Ana with the Supporter Pass, Bo with BO_SAYS for a name.
let ana;
let bo;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		( { chromium } = createRequire( '/opt/node-tools/' )( 'playwright' ) );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	worker = await startWorker( { port: WORKER_PORT, config: 'wrangler.drive.jsonc', vars: VARS } );
	line = await startLine( WORKER_PORT + 1, WORKER_PORT );
	vite = await startVite( PORT, { DRIVE_API: line.url }, 'vite.drive.config.js' );
	ana = await makePlayer( 'Ana' );
	bo = await makePlayer( 'Bo Rider' );
	// Ana's player linked to an account whose email has the pass (SUPPORTER_EMAILS); Bo renamed by hand.
	worker.d1( 'INSERT INTO accounts ( id, google_sub, email, name, created_at, last_login_at ) VALUES ( 1, \'test-ana\', \'ana@example.com\', \'Ana\', 0, 0 )' );
	worker.d1( `UPDATE players SET account_id = 1 WHERE id = '${ ana.id }'` );
	worker.d1( `UPDATE players SET name = '${ BO_SAYS }' WHERE id = '${ bo.id }'` );
	// Two to four pages draw at once here: none of them may be held back as if in the background.
	browser = await chromium.launch( { args: [
		'--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
		'--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
	] } );

} );

after( async () => {

	await browser?.close();
	vite?.stop();
	line?.stop();
	worker?.stop();

} );

// --- the Worker and the line to it ---------------------------------------------------------------

// A visit's token as /api/visit hands one out, made at `time`: good for six hours from then.
const visitToken = ( time = Date.now() ) => makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, time );

// A leaderboard player made through the Worker, as the page makes one: { id, secret, name }.
let addresses = 0;
async function makePlayer( name ) {

	const res = await fetch( `${ worker.base }/api/player`, {
		method: 'POST',
		headers: { Origin: worker.base, 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${ ++ addresses }` },
		body: JSON.stringify( { name, visit: await visitToken() } ),
	} );
	assert.equal( res.status, 201, await res.clone().text() );
	return res.json();

}

// Between the dev server's proxy and the Worker: every byte passed along untouched (the Host and
// Origin headers too), and cut() drops every WebSocket through it at once.
async function startLine( port, target ) {

	const sockets = new Set();
	const server = createServer( client => {

		const upstream = createConnection( target, '127.0.0.1' );
		const pair = { client, upstream, socket: false };
		sockets.add( pair );
		client.once( 'data', chunk => pair.socket = /^upgrade:\s*websocket/im.test( chunk.toString( 'latin1' ) ) );
		client.pipe( upstream );
		upstream.pipe( client );
		const done = () => {

			client.destroy();
			upstream.destroy();
			sockets.delete( pair );

		};
		for ( const end of [ client, upstream ] ) {

			end.on( 'error', done );
			end.on( 'close', done );

		}

	} );
	await new Promise( resolve => server.listen( port, '127.0.0.1', resolve ) );
	return {
		url: `http://127.0.0.1:${ port }`,
		cut() {

			for ( const pair of sockets ) if ( pair.socket ) pair.client.destroy();

		},
		// Every WebSocket through it stops passing anything, either way, and nothing's closed: a
		// network that drops everything without a word. (New ones go through as ever.)
		stall() {

			for ( const pair of sockets ) {

				if ( ! pair.socket ) continue;
				pair.client.unpipe( pair.upstream );
				pair.upstream.unpipe( pair.client );
				pair.client.pause();
				pair.upstream.pause();

			}

		},
		stop() {

			for ( const pair of sockets ) pair.client.destroy();
			server.close();

		},
	};

}

// The Worker again with `vars` over VARS, on the same port, once the last has let go of it.
async function restartWorker( vars ) {

	worker.stop();
	for ( let i = 0; i < 100; i ++ ) {

		const gone = await fetch( `${ worker.base }/api/config` ).then( () => false, () => true );
		if ( gone ) break;
		await new Promise( resolve => setTimeout( resolve, 200 ) );

	}

	worker = await startWorker( { port: WORKER_PORT, config: 'wrangler.drive.jsonc', vars: { ...VARS, ...vars } } );

}

// --- pages ---------------------------------------------------------------------------------------

// A page on the test pad's globe, handed `token` for driving with others (main.js's test seam,
// the dev server's only), with the leaderboard's `player` if any, boost pads off, and who's driving
// now asking and going idle as `online` says ({ poll, idle }, ms), if it says. rooms: the room of
// each connection it opens to one, in order; sent: what it has sent the rooms, { at, t } (t a
// message's type, or a keepalive's text), as Playwright saw each frame go.
async function livePage( { token, player = null, path = '/', touch = false, viewport = touch ? { width: 390, height: 760 } : { width: 900, height: 560 }, online = null } ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( ( { visit, player, online } ) => {

		window.worldDriveLiveTest = { visit, ...( online ? { online } : {} ) };
		localStorage.setItem( 'world-drive.pads', 'off' );
		if ( player ) localStorage.setItem( 'world-drive.player', JSON.stringify( player ) );

	}, { visit: token, player, online } );
	const page = await context.newPage();
	page.token = token;
	page.errors = [];
	page.rooms = [];
	page.sent = [];
	// When it asked /api/online (who's driving now, on the globe).
	page.onlineAsks = [];
	page.on( 'request', request => new URL( request.url() ).pathname === '/api/online' && page.onlineAsks.push( Date.now() ) );
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	// Console errors too, but for requests blocked here, a socket hung up on while still connecting
	// (switching rooms) and one the Worker turns away at the door (switched off), which the browser
	// reports as errors.
	page.on( 'console', message => message.type() === 'error' && ! /Failed to load resource|closed before the connection is established|WebSocket connection to .* failed/.test( message.text() ) && page.errors.push( message.text() ) );
	page.on( 'websocket', ws => {

		// (Not the dev server's own, for reloading the page as code changes.)
		const url = new URL( ws.url() );
		if ( url.pathname !== '/api/live' ) return;
		page.rooms.push( url.searchParams.get( 'room' ) );
		ws.on( 'framesent', ( { payload } ) => {

			let t = String( payload );
			try {

				t = JSON.parse( t ).t;

			} catch {

				// The keepalive's plain text.

			}

			page.sent.push( { at: Date.now(), t } );

		} );

	} );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
	await openTestPad( page, path );
	return page;

}

// To `path` and on into the test pad's globe (the Worker has no Maps key: "Drive the test pad").
async function openTestPad( page, path ) {

	await page.goto( BASE + path );
	await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

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
// When a page sent its car ('s'), from `since` (ms) on.
const statesSent = ( page, since = 0 ) => page.sent.filter( frame => frame.t === 's' && frame.at >= since ).map( frame => frame.at );

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
			livePage( { token: await visitToken(), player: ana } ),
			livePage( { token: await visitToken(), player: bo } ),
		] );

	} );

	after( async () => {

		await a?.context().close();
		await b?.context().close();

	} );

	test( 'alone, a driver sends no states; a second dropping in at the same spot shares its area and sees the first at once', async () => {

		// On the globe, out of a party, nothing's connected yet.
		assert.deepEqual( await live( a ), { status: 'off', room: null, party: null, you: null, others: [] } );
		assert.ok( await a.locator( '#globe-ui .friends' ).isVisible(), 'no "Drive with friends" on the globe' );
		assert.ok( await a.locator( '#globe-ui .friends .invite' ).isVisible() );
		assert.ok( await a.locator( '#globe-ui .friends input[type=checkbox]' ).isChecked(), 'nearby isn\'t on to begin with' );
		// A drops in first, alone in the area's room: its car is for nobody, so none of it is sent.
		await dropIn( a );
		await waitLive( a, cell );
		await placeCar( a, 0, 0, 0 );
		await a.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await a.waitForTimeout( 1200 );
		await a.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		await a.waitForTimeout( 1300 );
		assert.deepEqual( statesSent( a ), [], 'A sent its car to an empty room' );
		assert.ok( a.sent.some( frame => frame.t === 'hello' ) );
		await placeCar( a, 0, 0, 0 );
		// B drops in: A sends its car as it hears B join, and B draws it straight away.
		const quiet = Date.now();
		await dropIn( b );
		await waitLive( b, cell );
		const welcomed = Date.now();
		await placeCar( b, 4, - 14, 0 );
		await b.waitForFunction( () => window.drive.ghosts.list().some( g => g.visible ), null, { timeout: 30000 } );
		const seen = Date.now() - welcomed;
		console.log( `    A's ghost on B: ${ seen } ms after B was in` );
		assert.ok( seen < 1500, `B first drew A ${ seen } ms after it was in` );
		assert.ok( statesSent( a, quiet ).length >= 1 );
		const drawn = await ghosts( b );
		assert.equal( drawn.length, 1 );
		assert.equal( drawn[ 0 ].vehicle, 'go-kart' );
		// The names are the leaderboard's, looked up by the room: Ana has the pass; Bo's name has
		// HTML in it, which is only ever text.
		assert.equal( drawn[ 0 ].label, 'Ana⭐' );
		const label = await a.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.tag.querySelector( '.label' ).textContent );
		assert.equal( await label.jsonValue(), BO_SAYS );
		assert.equal( await a.evaluate( () => document.querySelectorAll( '#live-tags img, #live-tags .label b b' ).length ), 0 );
		// And each page is told what the others call it.
		assert.deepEqual( await a.evaluate( () => window.drive.live.self ), { name: 'Ana', star: true } );
		assert.deepEqual( await b.evaluate( () => window.drive.live.self ), { name: BO_SAYS, star: false } );
		// What B was told of A: in what, where.
		const told = await b.evaluate( () => [ ...window.drive.live.players.values() ][ 0 ] );
		assert.equal( told.vehicle, 'go-kart' );
		assert.equal( told.look.colour, 'blaze' );
		assert.equal( told.away, false );
		assert.equal( told.place.name, 'Test Pad' );
		assert.ok( Math.abs( told.place.lat - PAD.lat ) < 1e-4 && Math.abs( told.place.lon - PAD.lon ) < 1e-4, JSON.stringify( told.place ) );

		// The chip says who's here, and opens the list.
		await b.locator( '#drive-ui .live-chip', { hasText: 'Nearby · 2' } ).waitFor();
		await b.locator( '#drive-ui .live-chip' ).click();
		const row = b.locator( '#drive-ui .players li' );
		await row.first().waitFor();
		assert.equal( await row.count(), 1 );
		assert.match( await row.locator( '.what' ).textContent(), /^Go-kart · \d+ m$/ );
		// Its buttons say whose they are.
		assert.deepEqual( [ await row.locator( 'button.go' ).getAttribute( 'aria-label' ), await row.locator( 'button.hide' ).getAttribute( 'aria-label' ) ], [ 'Go to Ana', 'Hide Ana' ] );
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

	test( 'A drives: B\'s ghost follows INTERP_MS behind, within a few tens of centimetres, facing its way; A sends SEND_HZ a second', async () => {

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
		// (Each state comes with how long the room held it, so the error is the drawing's, not the
		// batching's: words a fifth of a second apart, curved between with their velocities, a few
		// tens of centimetres at 15 to 25 m/s.)
		assert.ok( at( errors, 0.5 ) < 0.3 && errors.at( - 1 ) < 1, summary );
		assert.ok( at( turns, 0.5 ) < 3 && turns.at( - 1 ) < 8, summary );
		// A sent its car SEND_HZ times a second as it drove (a little less, a frame late each time;
		// more only as what it's doing changes).
		const sent = statesSent( a, started + 500 ).filter( time => time < started + 3000 );
		const gaps = sent.slice( 1 ).map( ( time, i ) => time - sent[ i ] ).sort( ( x, y ) => x - y );
		console.log( `    A sent ${ sent.length } states in 2.5 s, ${ at( gaps, 0.5 ) } ms apart (median)` );
		assert.ok( at( gaps, 0.5 ) >= 1000 / SEND_HZ - 30 && sent.length <= 2.5 * SEND_HZ + 4, `${ sent.length } states, ${ at( gaps, 0.5 ) } ms apart` );

		// Stopped: there, to a few centimetres.
		await a.evaluate( () => Object.assign( window.drive.driver, { speed: 0 } ) );
		await a.waitForTimeout( 1500 );
		const [ here, there ] = await Promise.all( [ whereAll( a ), whereAll( b ) ] );
		assert.ok( distance( here.own, there.others[ 0 ].at ) < 0.3, `B draws A ${ distance( here.own, there.others[ 0 ].at ).toFixed( 2 ) } m from where it is` );

	} );

	test( 'A boosts: B\'s ghost has its flame, and the bursts of it lighting and running dry', async () => {

		await placeCar( a, 0, 0, 0 );
		// What B's ghost's effects set off, from A's flags changing.
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.fx, null, { timeout: 15000 } );
		const bursts = () => b.evaluate( () => window.drive.ghosts.list()[ 0 ].bursts );
		const before = await bursts();
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
		// Lit once, and run dry once, as A's booster was.
		const after = await bursts();
		assert.deepEqual( { ignite: after.ignite - before.ignite, cool: after.cool - before.cool }, { ignite: 1, cool: 1 }, JSON.stringify( { before, after } ) );

	} );

	test( 'A hidden on B while it drives: B keeps only the last of what it hears of A, not all of it', async () => {

		await b.evaluate( () => window.drive.ghosts.hide( 'Ana' ) );
		await placeCar( a, 0, 0, 0 );
		await a.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await b.waitForTimeout( 3000 );
		const kept = ( await ghosts( b ) )[ 0 ].snaps;
		await a.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		await b.evaluate( () => window.drive.ghosts.hide( 'Ana', false ) );
		assert.ok( kept <= 4, `${ kept } of A's states kept` );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.visible );

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
		assert.equal( await b.evaluate( () => [ ...window.drive.live.players.values() ][ 0 ].vehicle ), 'muscle-car' );

		// The pickup, a model from the library, as the muscle car is one of World Drive's own.
		await a.keyboard.press( 'Escape' );
		await a.locator( '#pause .vehicles .vehicle[data-id="pickup-truck"]' ).click();
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.vehicle === 'pickup-truck' && window.drive.ghosts.list()[ 0 ].visible, null, { timeout: 30000 } );
		await shot( b, 'live-3b-pickup' );
		// Its skinned body drawn where its ghost is, not where the file's own bones are.
		const apart = await b.evaluate( () => {

			const pivot = window.drive.ghosts.group.children.find( o => o.name.startsWith( 'ghost' ) );
			let skinned = null;
			pivot.traverse( o => skinned ??= o.isSkinnedMesh ? o : null );
			if ( ! skinned ) return 'no skinned mesh';
			pivot.updateMatrixWorld( true );
			const vertex = skinned.getVertexPosition( 0, pivot.position.clone() ).applyMatrix4( skinned.matrixWorld );
			return vertex.distanceTo( pivot.getWorldPosition( pivot.position.clone() ) );

		} );
		assert.ok( typeof apart === 'number' && apart < 10, `the pickup's body is drawn ${ apart } m from its ghost` );

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

		// A new ride or look twenty times a second for two seconds (from the console), then back to the
		// red kart: none of them held long enough for B to build, so B builds nothing.
		const look = await b.evaluate( () => [ ...window.drive.live.players.values() ][ 0 ].look );
		const builds = ( await ghosts( b ) )[ 0 ].builds;
		await a.evaluate( look => new Promise( resolve => {

			let i = 0;
			const timer = setInterval( () => {

				if ( ++ i <= 40 ) window.drive.live.setRide( i % 2 ? 'pickup-truck' : 'city-bus', { colour: i % 3 ? 'red' : 'blue' } );
				else {

					clearInterval( timer );
					window.drive.live.setRide( 'go-kart', look );
					resolve();

				}

			}, 50 );

		} ), look );
		await b.waitForTimeout( 2500 );
		const after = ( await ghosts( b ) )[ 0 ];
		assert.deepEqual( [ after.builds, after.vehicle, after.visible ], [ builds, 'go-kart', true ] );
		assert.ok( await b.evaluate( painted, red ) );

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

		// A is parked at the middle of the pad facing north, under a roof 7 m up (a deck, a shelter, a
		// tree's crown) on B's page; B is up the road past it.
		await b.evaluate( () => {

			const [ pad ] = window.drive.ground.getColliders();
			const roof = pad.children[ 0 ].clone();
			roof.name = 'test roof';
			roof.position.set( 0, 7, 0 );
			roof.scale.set( 20 / 4000, 20 / 2000, 1 );
			pad.add( roof );
			pad.updateMatrixWorld( true );

		} );
		await b.locator( '#drive-ui .live-chip' ).click();
		await b.locator( '#drive-ui .players button.go' ).click();
		await b.waitForFunction( () => window.drive.mode === 'driving' && Math.abs( window.drive.driver.north ) < 1 );
		assert.equal( await b.locator( '#drive-ui .players' ).isVisible(), false );
		const { east, north, heading, y } = await b.evaluate( () => window.drive.driver );
		await b.evaluate( () => {

			const [ pad ] = window.drive.ground.getColliders();
			pad.remove( pad.getObjectByName( 'test roof' ) );

		} );
		// A's right, facing north, is east; on the ground there, as A is, not on the roof.
		assert.ok( Math.abs( east - 5 ) < 0.3 && Math.abs( north ) < 0.3 && Math.abs( heading ) < 1, JSON.stringify( { east, north, heading } ) );
		assert.ok( Math.abs( y ) < 0.5, `B went to ${ y } m up` );

	} );

	test( 'A honks and lands a trick: over A\'s car on both pages, with a beep for B', async () => {

		await a.keyboard.press( 'Enter' );
		await a.waitForFunction( () => window.drive.mode === 'driving' );
		await placeCar( a, 0, 0, 0 );
		await placeCar( b, 6, - 12, 0 );
		// A key pressed lets the page make sound.
		await b.keyboard.press( 'KeyX' );
		const beeps = await b.evaluate( () => {

			window.honks = 0;
			window.drive.live.on( 'honk', () => window.honks ++ );
			return window.drive.friends.beeps;

		} );
		await a.keyboard.press( 'KeyH' );
		// Again at once: the page holds it back (and the room would drop it).
		await a.keyboard.press( 'KeyH' );
		assert.ok( await a.evaluate( () => ! document.querySelector( '.live-tag.self .honk' ).hidden ) );
		await b.waitForFunction( () => ! window.drive.ghosts.list()[ 0 ].tag.querySelector( '.honk' ).hidden, null, { timeout: 10000 } );
		assert.equal( await b.evaluate( () => window.drive.ghosts.list()[ 0 ].tag.querySelector( '.honk' ).textContent ), '📣' );
		await b.waitForFunction( beeps => window.drive.friends.beeps > beeps, beeps );
		await b.waitForTimeout( 500 );
		assert.equal( await b.evaluate( () => window.honks ), 1 );
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
		// Nobody to hear a horn: no H in the keys card.
		assert.equal( await a.evaluate( () => document.querySelector( '#drive-ui .live-key' ).hidden ), true );
		// (The models read from files for the rides before are let go of a while after the last ghost
		// in them went.)
		await b.waitForFunction( () => window.drive.ghosts.templates === 0, null, { timeout: 30000 } );
		const without = await memory();
		assert.equal( without.children, 0 );
		await toggle.check();
		assert.equal( await a.evaluate( () => document.querySelector( '#drive-ui .live-key' ).hidden ), false );
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

		a = await livePage( { token: await visitToken(), player: ana } );
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
		// You, by the name the others see.
		assert.equal( await a.locator( '#pause .friends .members' ).textContent(), 'You (Ana ⭐)' );
		assert.equal( await a.locator( '#pause .friends .invite' ).isVisible(), false );
		await shot( a, 'live-5-invite' );
		await a.keyboard.press( 'Escape' );
		await a.locator( '#drive-ui .live-chip', { hasText: 'Party · 1' } ).waitFor();

	} );

	test( 'the link opens on the globe with a banner, and Join drops in beside the friend', async () => {

		b = await livePage( { token: await visitToken(), path: `/?party=${ code }` } );
		await waitLive( b, `party:${ code }` );
		const banner = b.locator( '#globe-ui .party-banner' );
		await banner.locator( '.join' ).waitFor();
		assert.equal( await banner.locator( 'span' ).first().textContent(), 'Ana ⭐ is driving at Test Pad' );
		await shot( b, 'live-6-banner' );
		// On A's side, B has joined (on the globe), a guest.
		await a.waitForFunction( () => window.drive.live.players.size === 1 );
		const guest = ( await live( a ) ).others[ 0 ];
		assert.match( guest, /^Guest \d{4}$/ );
		assert.match( await b.locator( '#globe-ui .friends .members li' ).first().textContent(), new RegExp( `^You \\(${ guest }\\)$` ) );
		// With only B there, on the globe, A driving sends its car once every 2 s, not 5 a second.
		await a.waitForFunction( () => window.drive.mode === 'driving' );
		const since = Date.now();
		await a.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await a.waitForTimeout( 3000 );
		await a.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		const slow = statesSent( a, since ).length;
		assert.ok( slow >= 1 && slow <= 3, `A sent ${ slow } states in 3 s` );
		// Parked again, which B hears of within 2 s.
		await placeCar( a, 10, 20, 90 );
		await a.waitForTimeout( 2500 );
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
		await a.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.visible, null, { timeout: 30000 } );
		assert.equal( new URL( b.url() ).searchParams.get( 'party' ), code );
		// A was told B came, not to go where A already is.
		await a.locator( '#toast', { hasText: `${ guest } dropped in near you.` } ).waitFor();
		assert.equal( await a.locator( '#toast .toast-action' ).count(), 0 );
		await shot( b, 'live-7-joined' );

	} );

	test( 'a third driver at the same spot, out of the party, sees neither of them, but does see a fourth', async () => {

		const cell = cellOf( PAD.lat, PAD.lon );
		const c = await livePage( { token: await visitToken() } );
		await dropIn( c );
		await waitLive( c, cell );
		await placeCar( c, 0, 30, 180 );
		// Long enough for the party's cars to have come by, were they in this room.
		await c.waitForTimeout( 2500 );
		assert.deepEqual( ( await live( c ) ).others, [] );
		assert.equal( await c.evaluate( () => window.drive.ghosts.size ), 0 );
		await c.locator( '#drive-ui .live-chip', { hasText: 'Nearby · just you' } ).waitFor();

		const d = await livePage( { token: await visitToken() } );
		await dropIn( d );
		await waitLive( d, cell );
		await placeCar( d, - 6, 30, 180 );
		await c.waitForFunction( () => window.drive.ghosts.list().some( g => g.visible ), null, { timeout: 30000 } );
		await d.waitForFunction( () => window.drive.ghosts.list().some( g => g.visible ), null, { timeout: 30000 } );
		assert.equal( ( await live( c ) ).others.length, 1 );
		assert.equal( ( await live( d ) ).others.length, 1 );
		// And the party saw neither of them.
		for ( const page of [ a, b ] ) {

			assert.equal( ( await live( page ) ).others.length, 1 );
			assert.equal( await page.evaluate( () => window.drive.ghosts.size ), 1 );

		}

		await shot( c, 'live-7b-nearby' );
		for ( const page of [ c, d ] ) {

			assert.deepEqual( page.errors, [] );
			await page.context().close();

		}

	} );

	test( 'a ninth member is told the party is full, and drives on with those nearby', async () => {

		// Six more in the party (the room's most is eight).
		const fillers = await Promise.all( Array.from( { length: PARTY_MAX - 2 }, async () => connectAs( await visitToken(), `party:${ code }` ) ) );
		await a.waitForFunction( max => window.drive.live.players.size === max - 1, PARTY_MAX, { timeout: 15000 } );
		const ninth = await livePage( { token: await visitToken(), path: `/?party=${ code }` } );
		await ninth.locator( '#toast', { hasText: `That party is full: ${ PARTY_MAX } drivers at most.` } ).waitFor( { timeout: 15000 } );
		assert.equal( ( await live( ninth ) ).party, null );
		assert.equal( new URL( ninth.url() ).searchParams.has( 'party' ), false );
		assert.equal( await ninth.locator( '#globe-ui .party-banner' ).isHidden(), true );
		await dropIn( ninth );
		await waitLive( ninth, cellOf( PAD.lat, PAD.lon ) );
		// It was never in: nobody in the party heard of it.
		assert.equal( await a.evaluate( () => window.drive.live.players.size ), PARTY_MAX - 1 );
		assert.deepEqual( ninth.errors, [] );
		await ninth.context().close();
		for ( const ws of fillers ) ws.close();
		await a.waitForFunction( () => window.drive.live.players.size === 1, null, { timeout: 15000 } );

	} );

	test( 'a friend going somewhere else: a toast to join them', async () => {

		await a.keyboard.press( 'KeyM' );
		await a.waitForFunction( () => window.drive.mode === 'globe' );
		await dropIn( a, THERE );
		await placeCar( a, 0, 0, 0 );
		const toast = b.locator( '#toast', { hasText: 'went to Over There' } );
		await toast.waitFor( { timeout: 20000 } );
		assert.ok( await toast.locator( '.toast-action', { hasText: 'Join' } ).isVisible() );

	} );

	test( 'a reload rejoins the party, and Join finds the friend where they went', async () => {

		const first = ( await live( b ) ).you;
		await openTestPad( b, new URL( b.url() ).pathname + new URL( b.url() ).search );
		await waitLive( b, `party:${ code }` );
		assert.notEqual( ( await live( b ) ).you, first );
		const banner = b.locator( '#globe-ui .party-banner' );
		await banner.locator( 'span', { hasText: 'Ana ⭐ is driving at Over There' } ).waitFor( { timeout: 15000 } );
		// A saw B go and come back.
		await a.waitForFunction( () => window.drive.live.players.size === 1 );
		// A back to the globe and in again: the banner says so, and no toast says it again.
		await b.evaluate( () => document.getElementById( 'toast' ).textContent = '' );
		await a.keyboard.press( 'KeyM' );
		await banner.locator( 'span', { hasText: 'Waiting for your friends' } ).waitFor( { timeout: 15000 } );
		await dropIn( a, THERE );
		await placeCar( a, 0, 0, 0 );
		await banner.locator( 'span', { hasText: 'Ana ⭐ is driving at Over There' } ).waitFor( { timeout: 15000 } );
		await b.waitForTimeout( 500 );
		assert.doesNotMatch( await b.locator( '#toast' ).textContent(), /went to/ );
		await banner.locator( '.join' ).click();
		await b.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		await b.waitForFunction( () => window.drive.ghosts.list()[ 0 ]?.visible, null, { timeout: 30000 } );
		const [ here, there ] = await Promise.all( [ whereAll( a ), whereAll( b ) ] );
		assert.ok( distance( here.own, there.own ) < 7, `B dropped in ${ distance( here.own, there.own ).toFixed( 1 ) } m from A` );

	} );

	test( 'Leave party: back to the area, and the link out of the address', async () => {

		await b.keyboard.press( 'Escape' );
		await b.locator( '#pause .friends .leave' ).click();
		await waitLive( b, cellOf( THERE.lat, THERE.lon ) );
		assert.equal( new URL( b.url() ).searchParams.has( 'party' ), false );
		assert.equal( ( await live( b ) ).party, null );
		assert.ok( await b.locator( '#pause .friends .invite' ).isVisible() );
		await a.waitForFunction( () => window.drive.live.players.size === 0, null, { timeout: 15000 } );
		await a.waitForFunction( () => window.drive.ghosts.size === 0, null, { timeout: 15000 } );
		await b.keyboard.press( 'Escape' );

	} );

	test( 'a full area: the next of its shards; all of them full: "Nearby is busy"', async () => {

		// The area full (LIVE_NEARBY_MAX here) with drivers on the globe.
		const full = cellOf( FULL.lat, FULL.lon );
		const fillers = await Promise.all( Array.from( { length: NEARBY_MAX }, async () => connectAs( await visitToken(), full ) ) );
		await b.keyboard.press( 'KeyM' );
		await dropIn( b, FULL );
		await waitLive( b, shardOf( full, 1 ) );
		await b.locator( '#drive-ui .live-chip', { hasText: 'Nearby · just you' } ).waitFor();

		// Every shard of another area full.
		const busy = cellOf( BUSY.lat, BUSY.lon );
		const shards = Array.from( { length: NEARBY_SHARDS }, ( _, shard ) => shard ? shardOf( busy, shard ) : busy );
		for ( const shard of shards ) fillers.push( ...await Promise.all( Array.from( { length: NEARBY_MAX }, async () => connectAs( await visitToken(), shard ) ) ) );
		await b.keyboard.press( 'KeyM' );
		await dropIn( b, BUSY );
		const dropped = Date.now();
		await b.locator( '#drive-ui .live-chip', { hasText: 'Nearby is busy' } ).waitFor( { timeout: 20000 } );
		// On to the next as soon as each says it's full, not when its close arrives (in wrangler dev
		// that's seconds behind).
		assert.ok( Date.now() - dropped < 6000, `all four shards tried in ${ Date.now() - dropped } ms` );
		assert.deepEqual( await live( b ), { status: 'busy', room: null, party: null, you: null, others: [] } );
		// Every shard was tried, once each, in turn.
		assert.deepEqual( b.rooms.filter( room => room.startsWith( busy ) ), shards );
		// Its list says why nobody's there.
		await b.locator( '#drive-ui .live-chip' ).click();
		assert.equal( await b.locator( '#drive-ui .players .empty' ).textContent(), 'This area is full just now, so you\'re driving on your own here.' );
		await b.locator( '#drive-ui .live-chip' ).click();
		// The crowd gone, a drop-in there again tries its first room again.
		for ( const ws of fillers ) ws.close();
		await b.keyboard.press( 'KeyM' );
		await dropIn( b, BUSY );
		await waitLive( b, busy );

	} );

	test( 'a dropped connection comes back', async () => {

		await b.keyboard.press( 'KeyM' );
		await dropIn( b );
		await waitLive( b, cellOf( PAD.lat, PAD.lon ) );
		const first = ( await live( b ) ).you;
		line.cut();
		await b.waitForFunction( first => window.drive.live.status === 'live' && window.drive.live.you !== first, first, { timeout: 15000 } );
		// The same area again.
		assert.equal( ( await live( b ) ).room, cellOf( PAD.lat, PAD.lon ) );
		// And one that goes quiet without a word (nothing passes, nothing closes): its keepalive
		// unanswered for 10 s, it's taken as dropped, within 40 s.
		const second = ( await live( b ) ).you;
		const stalled = Date.now();
		line.stall();
		await b.waitForFunction( second => window.drive.live.status === 'live' && window.drive.live.you !== second, second, { timeout: 60000 } );
		console.log( `    back ${ Date.now() - stalled } ms after the line went quiet` );
		assert.equal( ( await live( b ) ).room, cellOf( PAD.lat, PAD.lon ) );

	} );

	test( 'another tab with the same visit: this one stops, and says so', async () => {

		await waitLive( b );
		const other = await connectAs( b.token, ( await live( b ) ).room );
		await b.locator( '#toast', { hasText: 'Driving with others moved to another tab.' } ).waitFor( { timeout: 15000 } );
		assert.equal( ( await live( b ) ).status, 'ended' );
		assert.equal( await b.locator( '#drive-ui .live-chip' ).isHidden(), true );
		// None of it shows any more: no empty "Drive with friends", nor a horn setting for no horn.
		assert.equal( await b.locator( '#pause .friends' ).isHidden(), true );
		assert.equal( await b.locator( '#globe-ui .friends' ).isHidden(), true );
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

describe( 'World Drive, driving with others ending, on a phone, and moving on', () => {

	test( 'a visit run out stops it, with a word that it\'s on again next visit', async () => {

		// A visit made six hours ago, less 12 s: the room closes it as it runs out.
		const token = await visitToken( Date.now() - 6 * HOUR + 12000 );
		const page = await livePage( { token, path: '/?party=ABCDEFG' } );
		await waitLive( page, 'party:ABCDEFG' );
		await page.locator( '#globe-ui .party-banner', { hasText: 'Waiting for your friends' } ).waitFor();
		await page.locator( '#toast', { hasText: 'It\'s on again on your next visit.' } ).waitFor( { timeout: 20000 } );
		assert.equal( ( await live( page ) ).status, 'ended' );
		assert.equal( await page.evaluate( () => window.drive.live.ended ), 'expired' );
		assert.equal( await page.locator( '#globe-ui .party-banner' ).isHidden(), true );
		// Nothing more is tried: the visit is over.
		const tried = page.rooms.length;
		await page.waitForTimeout( 2500 );
		assert.equal( page.rooms.length, tried );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'a touch screen: the chip and the list by tap, and the horn button', async () => {

		const [ a, phone ] = await Promise.all( [
			livePage( { token: await visitToken(), player: ana } ),
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
		// The chip as only its light and count, so the place's name keeps its room; its words are its
		// label.
		const chip = phone.locator( '#drive-ui .live-chip' );
		await chip.locator( '.short', { hasText: /^2$/ } ).waitFor();
		assert.equal( await chip.locator( '.long' ).isVisible(), false );
		assert.equal( await chip.getAttribute( 'aria-label' ), 'Nearby · 2' );
		const place = await phone.locator( '#drive-ui .place' ).evaluate( el => ( { width: el.getBoundingClientRect().width, cut: el.scrollWidth > el.clientWidth } ) );
		assert.ok( place.width > 100, JSON.stringify( place ) );
		await chip.tap();
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

	test( 'through the dev server\'s proxy, only the page\'s own origin gets in', async () => {

		const token = await visitToken();
		const attempt = origin => new Promise( resolve => {

			const ws = new WebSocket( `${ BASE.replace( /^http/, 'ws' ) }/api/live?room=party:ABCDEFJ`, [ PROTOCOL, token ], { headers: origin ? { Origin: origin } : {} } );
			ws.on( 'open', () => {

				resolve( ws.protocol );
				ws.close();

			} );
			ws.on( 'unexpected-response', ( req, res ) => resolve( res.statusCode ) );
			ws.on( 'error', () => resolve( 'error' ) );

		} );
		assert.equal( await attempt( BASE ), PROTOCOL );
		for ( const origin of [ 'https://evil.example', 'https://worlddrive.app', `http://localhost:${ PORT }`, null ] ) assert.equal( await attempt( origin ), 403, String( origin ) );

	} );

} );


// --- who's driving now, on the globe ---------------------------------------------------------------

// Where people are driving, as the Worker has it now: /api/online asked afresh (a time of its own, so
// not the answer kept for pages).
let freshAsks = 0;
async function onlineNow() {

	const res = await fetch( `${ worker.base }/api/online`, { headers: { 'X-Test-Time': String( Date.now() + ++ freshAsks ) } } );
	return res.json();

}

// A driver of the test's own, parked where it dropped in at `place` (as a page alone in its room
// sends no states, its room has only that), keeping its connection alive: its socket.
async function parkedAt( place ) {

	const ws = new WebSocket( `${ worker.base.replace( /^http/, 'ws' ) }/api/live?room=${ encodeURIComponent( cellOf( place.lat, place.lon ) ) }`, [ PROTOCOL, await visitToken() ], { headers: { Origin: worker.base } } );
	await new Promise( ( resolve, reject ) => {

		ws.on( 'open', () => ws.send( JSON.stringify( { t: 'hello', player: null, vehicle: 'go-kart', look: {}, place, away: false } ) ) );
		ws.on( 'message', data => data.toString().includes( '"welcome"' ) && resolve() );
		ws.on( 'close', code => reject( new Error( `closed with ${ code }` ) ) );
		ws.on( 'error', reject );

	} );
	ws.alive = setInterval( () => ws.readyState === WebSocket.OPEN && ws.send( 'ping' ), 20000 );
	return ws;

}

const near = ( a, b, km ) => Math.hypot( a.lat - b.lat, ( a.lon - b.lon ) * Math.cos( a.lat * Math.PI / 180 ) ) * 111.2 < km;

describe( 'World Drive, who\'s driving now on the globe', () => {

	// A drops in at Golden Gate Park (6.7 km from the Golden Gate Bridge's start spot, and well inside
	// its area: a dot is kept inside its room's, so one by an edge moves a little); C in a party at
	// Monaco, and D with nearby off at Sydney, neither of whom shows; and the test's own drivers
	// parked at Times Square (4), Shibuya (3), the Arc de Triomphe (2) and the Las Vegas Strip (1).
	const P = { name: 'Golden Gate Park', lat: 37.76, lon: - 122.47 };
	const MONACO = { name: 'Monaco', lat: 43.7366, lon: 7.4214 };
	const SYDNEY = { name: 'Sydney', lat: - 33.8523, lon: 151.2108 };
	const PARKED = [
		[ { name: 'Times Square', lat: 40.75765, lon: - 73.98577, height: 12 }, 4 ],
		[ { name: 'Shibuya', lat: 35.6595, lon: 139.7005, height: 38 }, 3 ],
		[ { name: 'Arc de Triomphe', lat: 48.8738, lon: 2.2962, height: 60 }, 2 ],
		[ { name: 'The Strip', lat: 36.1129, lon: - 115.1728, height: 620 }, 1 ],
	];
	let a;
	let c;
	let d;
	let b;
	let parked = [];
	let droppedAt;

	before( async () => {

		[ a, c, d ] = await Promise.all( [
			livePage( { token: await visitToken() } ),
			livePage( { token: await visitToken(), path: `/?party=${ makePartyCode( bytes => crypto.getRandomValues( bytes ) ) }` } ),
			livePage( { token: await visitToken() } ),
		] );
		await d.locator( '#globe-ui .friends input[type=checkbox]' ).uncheck();
		await Promise.all( [ dropIn( a, P ), dropIn( c, MONACO ), dropIn( d, SYDNEY ) ] );
		await waitLive( a, cellOf( P.lat, P.lon ) );
		droppedAt = Date.now();
		parked = await Promise.all( PARKED.flatMap( ( [ place, count ] ) => Array.from( { length: count }, () => parkedAt( place ) ) ) );

	} );

	after( async () => {

		for ( const ws of parked ) {

			clearInterval( ws.alive );
			ws.close();

		}

		for ( const page of [ a, b, c, d ] ) await page?.context().close();

	} );

	test( 'a driver dropping in is on the globe within about a minute: a dot on a page on the globe, and its panel\'s "Driving now", busiest first and named after the start spot near each; a party\'s and one with nearby off never', async () => {

		assert.equal( ( await live( d ) ).status, 'off' );
		assert.equal( ( await live( c ) ).room.startsWith( 'party:' ), true );
		// Her room says so at its first report, a minute after she connected.
		let now = await onlineNow();
		while ( ! now.areas.some( area => near( area, P, 1 ) ) && Date.now() - droppedAt < 80000 ) {

			await new Promise( resolve => setTimeout( resolve, 1000 ) );
			now = await onlineNow();

		}

		const there = Date.now() - droppedAt;
		console.log( `    A on the globe ${ there } ms after she was in her room` );
		assert.ok( there < 70000, `${ there } ms` );
		const dot = now.areas.find( area => near( area, P, 1 ) );
		assert.deepEqual( [ dot.lat, dot.lon, dot.count ], [ 37.76, - 122.47, 1 ] );

		// B opens the globe: the dots, and the panel's list.
		b = await livePage( { token: await visitToken(), viewport: { width: 1280, height: 720 } } );
		await b.waitForFunction( () => window.drive.online.areas.length >= 5, null, { timeout: 30000 } );
		console.log( `    on B's globe ${ Date.now() - droppedAt } ms after A was in` );
		const areas = await b.evaluate( () => window.drive.online.areas );
		assert.deepEqual( areas.find( area => near( area, P, 1 ) )?.count, 1 );
		assert.equal( areas.filter( area => near( area, MONACO, 20 ) || near( area, SYDNEY, 20 ) ).length, 0, JSON.stringify( areas ) );
		const section = b.locator( '#globe-ui .online' );
		await section.waitFor();
		assert.equal( await section.locator( '.summary' ).textContent(), '11 driving now. Tap a glowing dot to join them.' );
		const rows = await section.locator( '.areas li' ).evaluateAll( items => items.map( li => [ li.querySelector( 'b' ).textContent, li.querySelector( 'span' ).textContent ] ) );
		assert.deepEqual( rows, [
			[ 'Near Times Square', '4 drivers' ], [ 'Near Shibuya Crossing', '3 drivers' ], [ 'Near Arc de Triomphe', '2 drivers' ],
			[ 'Near Las Vegas Strip', '1 driver' ], [ 'Near Golden Gate Bridge', '1 driver' ],
		] );
		// No names, nothing anyone typed, no pids: the Worker says only where and how many.
		assert.deepEqual( Object.keys( now ).sort(), [ 'areas', 'on', 'total' ] );
		assert.ok( now.areas.every( area => Object.keys( area ).sort().join() === 'count,height,lat,lon' ), JSON.stringify( now ) );
		await shot( b, 'online-0-panel' );
		assert.deepEqual( [ a.errors, b.errors, c.errors, d.errors ], [ [], [], [], [] ] );

	} );

	test( 'back on the globe, a page doesn\'t count itself where it was driving, though its room hasn\'t said yet', async () => {

		await a.keyboard.press( 'KeyM' );
		await a.waitForFunction( () => window.drive.mode === 'globe' );
		await a.waitForFunction( () => window.drive.online.areas.length >= 4, null, { timeout: 20000 } );
		assert.ok( ( await onlineNow() ).areas.some( area => near( area, P, 1 ) ), 'her room has already said she went' );
		const mine = await a.evaluate( () => ( { areas: window.drive.online.areas, total: window.drive.online.total } ) );
		assert.equal( mine.areas.filter( area => near( area, P, 1 ) ).length, 0, JSON.stringify( mine ) );
		assert.equal( mine.total, 10 );
		// And she drops in there again.
		await dropIn( a, P );
		await waitLive( a, cellOf( P.lat, P.lon ) );

	} );

	test( 'the dots over the globe: one over each area facing the camera, sized by how many, none round the back; overlapping, one with both counts, which a tap flies down over till they part; never two overlapping', async () => {

		// North America from far out (and held there: left alone, the globe turns): Times Square's 4, and
		// the Strip and the park, 670 km apart, as one of 2 to the west of it; Shibuya's round the back of
		// the Earth.
		const view = ( lat, lon, distance ) => b.evaluate( ( [ lat, lon, distance ] ) => window.drive.globe.flyTo( { lat, lon, height: 0, distance, heading: 0, pitch: - 90 }, { duration: 0.3 } ), [ lat, lon, distance ] );
		const apart = dots => dots.every( ( dot, i ) => dots.slice( i + 1 ).every( other => Math.hypot( dot.x - other.x, dot.y - other.y ) >= ( dot.size + other.size ) / 2 ) );
		await view( 39, - 98, 2.5e7 );
		await b.evaluate( () => window.drive.globe.touched() );
		await b.waitForTimeout( 500 );
		const america = await b.evaluate( () => window.drive.online.dots );
		const times = america.find( dot => dot.count === 4 );
		const west = america.find( dot => dot.count === 2 && dot.x < times?.x - 50 );
		assert.equal( west?.label, '2 drivers driving round here: show them', JSON.stringify( america ) );
		assert.ok( america.every( dot => dot.count !== 3 ), JSON.stringify( america ) );
		assert.ok( apart( america ), JSON.stringify( america ) );
		// Tapping the 2: no pin, but down over the two of them, near enough that they part.
		const high = await b.evaluate( () => window.drive.globe.altitude() );
		await b.mouse.click( west.x, west.y );
		await b.waitForFunction( () => window.drive.globe.flight, null, { timeout: 5000 } );
		await b.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 10000 } );
		await b.evaluate( () => window.drive.globe.touched() );
		await b.waitForTimeout( 300 );
		assert.equal( await b.evaluate( () => window.drive.globe.pin ), null );
		assert.equal( await b.locator( '#globe-ui .pin-card' ).isHidden(), true );
		const low = await b.evaluate( () => window.drive.globe.altitude() );
		assert.ok( low < high / 3, `${ high } m to ${ low } m` );
		const parted = await b.evaluate( () => window.drive.online.dots );
		assert.deepEqual( parted.filter( dot => dot.label === '1 driver driving here' ).length, 2, JSON.stringify( parted ) );
		assert.ok( apart( parted ), JSON.stringify( parted ) );
		await shot( b, 'online-1-parted' );
		// Nearer, as the globe opens: each its own, bigger for more.
		await b.evaluate( () => window.drive.globe.flyTo( { ...window.drive.globe.orbit( 39, - 98 ), heading: 0 }, { duration: 0.3 } ) );
		await b.evaluate( () => window.drive.globe.touched() );
		await b.waitForTimeout( 500 );
		assert.ok( apart( await b.evaluate( () => window.drive.online.dots ) ) );
		const sizes = await b.locator( '.online-dot:not([hidden])' ).evaluateAll( dots => dots.map( dot => [ dot.textContent, dot.getBoundingClientRect().width ] ) );
		const width = text => sizes.find( ( [ t ] ) => t === text )[ 1 ];
		assert.ok( sizes.every( ( [ , w ] ) => w >= 32 ) && width( '4' ) > Math.min( ...sizes.map( ( [ , w ] ) => w ) ), JSON.stringify( sizes ) );
		assert.equal( await b.locator( '.online-dot:not([hidden])', { hasText: '4' } ).getAttribute( 'aria-label' ), '4 drivers driving here' );
		await shot( b, 'online-1-globe' );
		// A pointer over a dot shows it can be clicked; a drag that starts on one spins the globe as
		// anywhere else (the dots let the pointer through), and isn't a tap on it.
		const four = ( await b.evaluate( () => window.drive.online.dots ) ).find( dot => dot.count === 4 );
		const was = await b.evaluate( () => window.drive.globe.pose().lon );
		await b.mouse.move( four.x, four.y );
		assert.equal( await b.evaluate( () => window.drive.renderer.domElement.style.cursor ), 'pointer' );
		await b.mouse.down();
		await b.mouse.move( four.x - 250, four.y, { steps: 10 } );
		await b.mouse.up();
		await b.waitForTimeout( 300 );
		const now = await b.evaluate( () => window.drive.globe.pose().lon );
		assert.ok( Math.abs( now - was ) > 5, `${ was }° to ${ now }°` );
		assert.deepEqual( await b.evaluate( () => [ window.drive.globe.flight, window.drive.globe.pin ] ), [ null, null ] );
		// On a phone.
		const phone = await livePage( { token: await visitToken(), touch: true, viewport: { width: 375, height: 740 } } );
		await phone.waitForFunction( () => window.drive.online.areas.length >= 5, null, { timeout: 30000 } );
		await phone.evaluate( () => window.drive.globe.flyTo( { ...window.drive.globe.orbit( 30, - 98 ), heading: 0 }, { duration: 0.3 } ) );
		await phone.evaluate( () => window.drive.globe.touched() );
		await phone.waitForTimeout( 800 );
		const dots = await phone.evaluate( () => window.drive.online.dots );
		assert.ok( dots.length >= 2, JSON.stringify( dots ) );
		const sheet = await phone.locator( '#globe-ui .panel' ).evaluate( el => el.getBoundingClientRect().top );
		assert.ok( dots.every( dot => dot.y < sheet ), JSON.stringify( { dots, sheet } ) );
		for ( const box of await phone.locator( '.online-dot:not([hidden])' ).evaluateAll( els => els.map( el => el.getBoundingClientRect() ).map( r => [ r.width, r.height ] ) ) ) assert.ok( box[ 0 ] >= 32 && box[ 1 ] >= 32, JSON.stringify( box ) );
		await shot( phone, 'online-2-phone' );
		assert.deepEqual( phone.errors, [] );
		await phone.context().close();

	} );

	test( 'tapping a dot flies there and pins it, its card saying how many drive there now; Drive here drops in, into their room, their ghost in sight', async () => {

		// Nearer, so the park's dot is one of its own.
		await b.evaluate( p => window.drive.globe.flyTo( { lat: p.lat, lon: p.lon, height: 0, distance: 1.5e6, heading: 0, pitch: - 90 }, { duration: 0.3 } ), P );
		await b.waitForTimeout( 800 );
		const dots = await b.evaluate( () => window.drive.online.dots );
		const middle = { x: 640, y: 360 };
		const dot = dots.sort( ( x, y ) => Math.hypot( x.x - middle.x, x.y - middle.y ) - Math.hypot( y.x - middle.x, y.y - middle.y ) )[ 0 ];
		assert.deepEqual( [ dot.count, dot.label ], [ 1, '1 driver driving here' ] );
		await b.mouse.click( dot.x, dot.y );
		const card = b.locator( '#globe-ui .pin-card' );
		await card.waitFor();
		assert.equal( await card.locator( '.name' ).textContent(), '1 driver here' );
		assert.equal( await card.locator( '.coords' ).textContent(), 'Near Golden Gate Bridge · 37.7600° N, 122.4700° W' );
		// The flight down to it, the pin over the dot.
		await b.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 10000 } );
		await shot( b, 'online-3-pinned' );
		await card.locator( '.go' ).click();
		await b.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		// Shown near the start spot; but the park is 6.7 km from the bridge, so for the leaderboard and
		// the others it's a pin, known by where it is, not a "Near Golden Gate Bridge" of its own.
		assert.equal( await b.locator( '#drive-ui .place' ).textContent(), 'Near Golden Gate Bridge' );
		assert.match( await b.evaluate( () => window.drive.live.place.name ), /^37\.7\d° N, 122\.4\d° W$/ );
		await waitLive( b, cellOf( P.lat, P.lon ) );
		await b.waitForFunction( () => window.drive.ghosts.list().some( g => g.visible ), null, { timeout: 30000 } );
		const told = await b.evaluate( () => [ ...window.drive.live.players.values() ].map( p => p.place?.name ) );
		assert.deepEqual( told, [ 'Golden Gate Park' ] );
		// Driving, the globe's dots ask nothing.
		const asks = b.onlineAsks.length;
		await b.waitForTimeout( 1500 );
		assert.equal( b.onlineAsks.length, asks );
		assert.deepEqual( [ a.errors, b.errors ], [ [], [] ] );

	} );

	test( 'back on the globe, a page doesn\'t count itself though another in its room drives in a dot of their own', async () => {

		// A and B together by the park, and another driver in their room 3.8 km off, a dot of their own.
		const R = { name: 'Sunset', lat: 37.73, lon: - 122.49, height: 20 };
		parked.push( await parkedAt( R ) );
		const has = ( answer, place, count ) => answer.areas.some( area => near( area, place, 0.5 ) && area.count === count );
		// Their room says so at its next report, within about a minute.
		const joined = Date.now();
		let now = await onlineNow();
		while ( ! has( now, R, 1 ) && Date.now() - joined < 90000 ) {

			await new Promise( resolve => setTimeout( resolve, 1000 ) );
			now = await onlineNow();

		}

		assert.ok( has( now, R, 1 ) && has( now, P, 2 ), JSON.stringify( now ) );
		// And kept so for pages (the answer they get, kept 30 s), before A goes to the globe.
		const seen = Date.now();
		let kept = await ( await fetch( `${ worker.base }/api/online` ) ).json();
		while ( ! has( kept, R, 1 ) && Date.now() - seen < 40000 ) {

			await new Promise( resolve => setTimeout( resolve, 1000 ) );
			kept = await ( await fetch( `${ worker.base }/api/online` ) ).json();

		}

		await a.keyboard.press( 'KeyM' );
		await a.waitForFunction( () => window.drive.mode === 'globe' );
		await a.waitForFunction( r => window.drive.online.areas.some( area => Math.abs( area.lat - r.lat ) < 0.005 && Math.abs( area.lon - r.lon ) < 0.005 ), R, { timeout: 20000 } );
		assert.ok( has( await onlineNow(), P, 2 ), 'her room has already said she went' );
		const mine = await a.evaluate( () => ( { areas: window.drive.online.areas, total: window.drive.online.total } ) );
		assert.ok( has( mine, P, 1 ) && has( mine, R, 1 ), JSON.stringify( mine ) );
		assert.equal( mine.total, 12 );
		assert.deepEqual( [ a.errors, b.errors ], [ [], [] ] );

	} );

} );

describe( 'World Drive, when a page on the globe asks who\'s driving now', () => {

	test( 'every so often while it\'s used; not once nobody has touched it for a while, asking at once at the next touch; nothing while the Garage is open; and nothing more once the visit has run out', async () => {

		// Asking every second (and each answer here takes a moment), and idle after 5 s without a touch
		// (a minute and 10 minutes on the site).
		const page = await livePage( { token: await visitToken(), online: { poll: 1000, idle: 5000 } } );
		await page.waitForFunction( () => window.drive.online?.on && window.drive.mode === 'globe' );
		const asks = () => page.onlineAsks.length;
		const touch = () => page.keyboard.press( 'Shift' );
		const untilAsked = async ( than, within ) => {

			const from = Date.now();
			while ( asks() <= than && Date.now() - from < within ) await page.waitForTimeout( 50 );
			return Date.now() - from;

		};
		// Touched now and then: it asks again and again.
		let was = asks();
		for ( let i = 0; i < 8 && asks() < was + 2; i ++ ) {

			await touch();
			await page.waitForTimeout( 1000 );

		}

		assert.ok( asks() >= was + 2, `${ asks() - was } asks` );
		// Left alone: once it's idle, nothing.
		await page.waitForTimeout( 7000 );
		was = asks();
		await page.waitForTimeout( 4000 );
		assert.equal( asks(), was );
		// Touched again: at once.
		await touch();
		const waited = await untilAsked( was, 3000 );
		assert.ok( asks() > was && waited < 1500, `${ waited } ms` );
		// The Garage open over the globe: nothing, touched or not; closed, it asks again.
		await page.locator( '#globe-ui .garage-open' ).click();
		await page.waitForFunction( () => window.drive.garage.isOpen );
		was = asks();
		for ( let i = 0; i < 5; i ++ ) {

			await page.waitForTimeout( 600 );
			await touch();

		}

		assert.equal( asks(), was );
		await page.evaluate( () => window.drive.garage.close() );
		await touch();
		await untilAsked( was, 2500 );
		assert.ok( asks() > was );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

		// A visit that runs out while its page is on the globe: none of it shows, nor is asked, after.
		const ending = await livePage( { token: await visitToken( Date.now() - 6 * HOUR + 15000 ), online: { poll: 1000, idle: 60000 } } );
		await ending.waitForFunction( () => window.drive.online?.on && window.drive.mode === 'globe' );
		await ending.waitForFunction( () => ! window.drive.online.on, null, { timeout: 30000 } );
		assert.equal( await ending.locator( '#globe-ui .online' ).isHidden(), true );
		assert.equal( await ending.locator( '.online-dot:not([hidden])' ).count(), 0 );
		was = ending.onlineAsks.length;
		await ending.keyboard.press( 'Shift' );
		await ending.waitForTimeout( 2500 );
		assert.equal( ending.onlineAsks.length, was );
		assert.deepEqual( ending.errors, [] );
		await ending.context().close();

	} );

} );

describe( 'World Drive, driving with others switched off on the Worker', () => {

	test( 'LIVE off: an open page stops without a word, a new one shows none of it, and both drive as ever', async () => {

		const page = await livePage( { token: await visitToken(), path: '/?party=ABCDEFH' } );
		await waitLive( page, 'party:ABCDEFH' );
		assert.ok( await page.locator( '#globe-ui .friends' ).isVisible() );
		// The Worker deployed again with LIVE off: its connections drop, and it turns new ones away.
		await restartWorker( { LIVE: 'off' } );
		assert.equal( ( await ( await fetch( `${ BASE }/api/config` ) ).json() ).live, false );
		await page.waitForFunction( () => window.drive.live.ended === 'off', null, { timeout: 60000 } );
		assert.equal( await page.locator( '#globe-ui .friends' ).isHidden(), true );
		// Nor who's driving now: no dots, no "Driving now".
		await page.waitForFunction( () => ! window.drive.online.on );
		assert.equal( await page.locator( '#globe-ui .online' ).isHidden(), true );
		assert.equal( await page.locator( '.online-dot:not([hidden])' ).count(), 0 );
		assert.equal( await page.locator( '#globe-ui .party-banner' ).isHidden(), true );
		assert.doesNotMatch( await page.locator( '#toast' ).textContent(), /others/ );
		await dropIn( page );
		assert.equal( await page.locator( '#drive-ui .live-chip' ).isHidden(), true );
		assert.equal( await page.locator( '#drive-ui .live-key' ).isHidden(), true );
		await page.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await page.waitForFunction( () => window.drive.driver.speed > 2 );
		await page.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

		// A page loaded now: nothing of it at all, with a visit's token or not.
		const fresh = await livePage( { token: await visitToken(), path: '/?party=ABCDEFH' } );
		assert.equal( await fresh.evaluate( () => window.drive.live ), null );
		assert.equal( await fresh.evaluate( () => window.drive.online ), null );
		assert.equal( await fresh.locator( '#globe-ui .online' ).isHidden(), true );
		// (And the Worker says so too, asking nothing.)
		assert.deepEqual( await onlineNow(), { on: false, total: 0, areas: [] } );
		assert.equal( await fresh.locator( '#globe-ui .friends' ).isHidden(), true );
		assert.equal( await fresh.locator( '#globe-ui .party-banner' ).isHidden(), true );
		await dropIn( fresh );
		assert.equal( await fresh.locator( '#drive-ui .live-chip' ).isHidden(), true );
		assert.equal( await fresh.locator( '#pause .friends' ).count(), 1 );
		assert.equal( await fresh.locator( '#pause .friends' ).isHidden(), true );
		assert.equal( await fresh.locator( '#drive-ui .live-key' ).isHidden(), true );
		await fresh.keyboard.press( 'KeyH' );
		assert.equal( await fresh.evaluate( () => document.querySelectorAll( '#live-tags *' ).length ), 0 );
		assert.deepEqual( fresh.rooms, [] );
		assert.deepEqual( fresh.onlineAsks, [] );
		await fresh.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await fresh.waitForFunction( () => window.drive.driver.speed > 2 );
		await fresh.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		assert.deepEqual( fresh.errors, [] );
		await fresh.context().close();

	} );

} );

describe( 'World Drive, the day\'s budget for driving with others spent', () => {

	test( 'turned away for the budget: a toast once that it\'s back after midnight UTC, none of it shows, and driving goes on; a party\'s link on a new page says why', async () => {

		// The Worker again (LIVE on) with a budget of 40 Durable Object requests a day, which this test
		// then spends by connecting to rooms, as drivers do (page loads ask DriveLimits only every 30
		// s, so they spend little).
		const toast = 'Lots of drivers today: driving with others is back after midnight UTC.';
		await restartWorker( { LIVE_DAILY_BUDGET: '40' } );
		const page = await livePage( { token: await visitToken() } );
		assert.ok( await page.locator( '#globe-ui .friends' ).isVisible() );
		let opened = 0;
		for ( ; opened < 40; opened ++ ) {

			const ws = await connectAs( await visitToken(), `party:${ makePartyCode( bytes => crypto.getRandomValues( bytes ) ) }` ).catch( () => null );
			if ( ! ws ) break;
			ws.close();
			await page.waitForTimeout( 100 );

		}

		assert.ok( opened > 0 && opened < 40, `${ opened } connections got in` );
		// Dropping in, the page connects to the area's room and is turned away: it asks why, and stops.
		await dropIn( page );
		await page.waitForFunction( () => window.drive.live.ended === 'budget', null, { timeout: 30000 } );
		await page.locator( '#toast', { hasText: toast } ).waitFor();
		assert.equal( await page.locator( '#drive-ui .live-chip' ).isHidden(), true );
		assert.equal( await page.locator( '#drive-ui .live-key' ).isHidden(), true );
		assert.equal( await page.locator( '#pause .friends' ).isHidden(), true );
		await page.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await page.waitForFunction( () => window.drive.driver.speed > 2 );
		await page.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		// Back on the globe and in again: nothing more of it, nor another toast.
		await page.locator( '#drive-ui .to-globe' ).click();
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		assert.equal( await page.locator( '#globe-ui .friends' ).isHidden(), true );
		assert.equal( await page.locator( '#globe-ui .online' ).isHidden(), true );
		assert.equal( await page.evaluate( () => window.drive.online.on ), false );
		await page.evaluate( () => document.getElementById( 'toast' ).textContent = '' );
		await dropIn( page );
		await page.waitForTimeout( 1500 );
		assert.doesNotMatch( await page.locator( '#toast' ).textContent(), /others/ );
		assert.ok( page.rooms.length <= 1, JSON.stringify( page.rooms ) );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

		// A friend opening a party's link now: told why nothing comes of it, and drives alone.
		const friend = await livePage( { token: await visitToken(), path: '/?party=ABCDEFG' } );
		assert.equal( await friend.evaluate( () => window.drive.live ), null );
		await friend.locator( '#toast', { hasText: toast } ).waitFor();
		assert.equal( await friend.locator( '#globe-ui .friends' ).isHidden(), true );
		assert.equal( await friend.locator( '#globe-ui .party-banner' ).isHidden(), true );
		await dropIn( friend );
		assert.equal( await friend.locator( '#drive-ui .live-chip' ).isHidden(), true );
		await friend.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await friend.waitForFunction( () => window.drive.driver.speed > 2 );
		await friend.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		assert.deepEqual( friend.rooms, [] );
		assert.deepEqual( friend.errors, [] );
		await friend.context().close();

	} );

} );

// A connection of the test's own to a room, as another page would make, said hello from the globe:
// its socket. For a room to be full with, or to take over a page's visit.
function connectAs( token, room ) {

	const ws = new WebSocket( `${ worker.base.replace( /^http/, 'ws' ) }/api/live?room=${ encodeURIComponent( room ) }`, [ PROTOCOL, token ], { headers: { Origin: worker.base } } );
	return new Promise( ( resolve, reject ) => {

		ws.on( 'open', () => ws.send( JSON.stringify( { t: 'hello', player: null, vehicle: 'go-kart', look: {}, place: null, away: true } ) ) );
		ws.on( 'message', data => {

			const { t } = JSON.parse( data.toString() );
			if ( t === 'welcome' ) resolve( ws );
			else if ( t === 'full' ) reject( new Error( `${ room } is full` ) );

		} );
		ws.on( 'close', code => reject( new Error( `closed with ${ code }` ) ) );
		ws.on( 'error', reject );

	} );

}
