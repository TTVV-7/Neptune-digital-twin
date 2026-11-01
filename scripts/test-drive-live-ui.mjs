// npm run test:drive-live-ui: driving with others (src/drive-app/live.js, ghosts.js and friends.js)
// in real browser pages on the test pad (the Vite dev server, no Maps key), talking to the real
// Worker's rooms (worker/drive/live.js under `wrangler dev`, LIVE on) through the dev server's
// proxy, two to four pages at once. Two drivers dropping in at the same spot share the area's room
// and see each other's ghost: following the other car a quarter of a second behind, within half a
// metre or so, facing its way; its flame as it boosts; parked when it pauses; gone when it goes
// back to the globe and back when it drops in again; another ride and paint when it changes; its
// name from the leaderboard and ⭐ over it, a name with HTML in it shown as text; driven straight
// through without a bump, see-through up close; its honk and its trick's points over it; and
// gone, with what it was drawn with freed, when it leaves. A party: inviting makes a link, which
// opens on the globe with a banner to join the friend driving, who's dropped in beside; a driver
// at the same spot outside the party sees neither of them but does see another driver there; a
// ninth member is told it's full; a reload rejoins; leaving drops the link from the address. A
// full area's next shard, a busy one, a dropped connection coming back, another tab taking over, a
// visit run out, a touch screen's list and horn, the room following the car into another area,
// only the page's own origin through the proxy, and the Worker restarted with LIVE off: open pages
// stop without a word and new ones show nothing of it, driving as ever.
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
import { FLAGS, INTERP_MS, NEARBY_SHARDS, PARTY_MAX, PROTOCOL, cellOf, parseRoom, shardOf } from '../src/drive-app/live-protocol.js';
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
const VARS = {
	GOOGLE_MAPS_API_KEY: '', GOOGLE_CLIENT_ID: '', TURNSTILE_SECRET: PASS_SECRET, TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
	SUPPORTER_EMAILS: 'ana@example.com', LIVE_NEARBY_MAX: String( NEARBY_MAX ),
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
// the dev server's only), with the leaderboard's `player` if any, boost pads off. rooms: the room
// of each connection it opens to one, in order.
async function livePage( { token, player = null, path = '/', touch = false } ) {

	const viewport = touch ? { width: 390, height: 760 } : { width: 900, height: 560 };
	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( ( { visit, player } ) => {

		window.worldDriveLiveTest = { visit };
		localStorage.setItem( 'world-drive.pads', 'off' );
		if ( player ) localStorage.setItem( 'world-drive.player', JSON.stringify( player ) );

	}, { visit: token, player } );
	const page = await context.newPage();
	page.token = token;
	page.errors = [];
	page.rooms = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	// Console errors too, but for requests blocked here, a socket hung up on while still connecting
	// (switching rooms) and one the Worker turns away at the door (switched off), which the browser
	// reports as errors.
	page.on( 'console', message => message.type() === 'error' && ! /Failed to load resource|closed before the connection is established|WebSocket connection to .* failed/.test( message.text() ) && page.errors.push( message.text() ) );
	page.on( 'websocket', ws => {

		// (Not the dev server's own, for reloading the page as code changes.)
		const url = new URL( ws.url() );
		if ( url.pathname === '/api/live' ) page.rooms.push( url.searchParams.get( 'room' ) );

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
		// The names are the leaderboard's, looked up by the room: Ana has the pass; Bo's name has
		// HTML in it, which is only ever text.
		assert.equal( seen[ 0 ].label, 'Ana⭐' );
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

	test( 'A drives: B\'s ghost follows a quarter of a second behind, within half a metre or so, facing its way', async () => {

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
		// batching's: a few tens of centimetres at 15 to 25 m/s.)
		assert.ok( at( errors, 0.5 ) < 0.5 && at( errors, 0.9 ) < 1, summary );
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
		assert.equal( await b.evaluate( () => [ ...window.drive.live.players.values() ][ 0 ].vehicle ), 'muscle-car' );

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
		for ( const ws of fillers ) ws.close();

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

describe( 'World Drive, driving with others ending, on a phone, and moving on', () => {

	test( 'a visit run out stops it, with a word to reload', async () => {

		// A visit made six hours ago, less 12 s: the room closes it as it runs out.
		const token = await visitToken( Date.now() - 6 * HOUR + 12000 );
		const page = await livePage( { token, path: '/?party=ABCDEFG' } );
		await waitLive( page, 'party:ABCDEFG' );
		await page.locator( '#globe-ui .party-banner', { hasText: 'Waiting for your friends' } ).waitFor();
		await page.locator( '#toast', { hasText: 'Reload for a fresh drive' } ).waitFor( { timeout: 20000 } );
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
		await fresh.evaluate( () => window.drive.driver.press( 'KeyW' ) );
		await fresh.waitForFunction( () => window.drive.driver.speed > 2 );
		await fresh.evaluate( () => window.drive.driver.release( 'KeyW' ) );
		assert.deepEqual( fresh.errors, [] );
		await fresh.context().close();

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
