// npm run test:drive-ui: World Drive (drive/index.html, src/drive-app/) in a real browser, on the
// Vite dev server with no Maps key: the test globe and the flat test pad stand in for Google's
// tiles. The globe and its panel; search (the Worker's /api/search answered here) only on Enter;
// typed coordinates; start spots; a tap on the globe; dropping in and driving; the play stats the
// page counts, seen in its posts (the funnel, the device, searches by kind and never what was typed,
// play time, a drop-in's time and one left for the globe); stunts (a wall
// throwing the kart into the air, a backflip landed for points, the DRIFT button); the vehicle
// picker and changing ride from the pause menu; M back to the globe and teleporting again with no
// reload; recent places and the picked ride kept across a reload; a phone with touch buttons;
// boosting flat out going supersonic in each free ride (the boom, the streaks, the tag and the
// wider view, and its end), and boost pads (off until the pause menu's switch turns them on, kept
// across a reload, and off again; put down on open ground as it drives and never on a roof, a car,
// a slope or from high up, moved onto sharper ground, a small one's 12 % and a big one's fill,
// dark then lit again, left lit with the gauge full, recycled; the tests that need them switch
// them on); water (the pad's sea given one even sea colour, as Google draws water), driven on as
// on the ground: off its edge at speed and slowly, down onto its surface and on across it, never
// sinking or put back; off a ramp, a spin landed on it scoring; slowly down a beach, out across the
// sea and back up onto the land; flown out and let down onto it, and R on it and by it putting it a
// few metres on, on the water; paused on it and driven on, and sending others no splash or spray;
// boost pads never on it; Google's other water colours, a bluish lawn among ball fields and a
// lagoon's turquoise; a canal's water by its wall never taken for dry;
// the open sea (the pad lowered 3 km, as Google's tiles are only the sea bed out there): the sea's
// height (EGM96's), a typed pin there started on the sea's own surface, driven on, curving away
// with the Earth, flown over and come down on, no boost pads on it, from an island out across it
// and back onto the island, and gone back on the globe, a drop-in on land having none; the map of
// where the sea and the big lakes are (Natural Earth's); the pad lowered under the water's
// surface, as Google draws the bed: more than 15 m in Santa Monica Bay and by its pier, the sea's
// surface; 14 m (the tide out), on the pad as before; on the Dead Sea's shore (land), never; in
// Lake Baikal, the lake's surface (455.5 m over the sea's), ridden on, floated on, and from an
// island out across it, not its bed; in a
// coast's square by the Ghoubbet, the pad with ground 20 m over the sea 100 m off it (the Assal
// depression's rim), on the pad as before; Lake Erie's surface gone out over land at Niagara's
// gorge and back by the lake; driven out from a coast past its water (the pad's) over a bed sloping
// down under the sea's height in the sea's colours, the sea's surface laid before the kart is under
// it, and flown out and let down onto it, R on it, none over a slope coloured as sand or with no
// picture, nor in Death Valley's square, and a big lake's only over its bed 15 m under it; with
// houses behind the beach, driven and reversed out, laid before it's under, and none with the kart
// in a hollow on the bed; driven past moored boats, between two jetties and through a marina, laid
// before it's under, and flown past them 20 m up, laid by the water's edge with no rays along the
// ground; laid by the frame loop's own look, driven with the keyboard; the look round a spot to see
// it's open to the water spread over frames, never more than 12 rays in one (all down), and with
// each first ray into new ground made slow, as a tile's is, no more than one of those a frame (with
// tiles 25, 15 or 10 m across), still laid before the kart is under; New Orleans' streets under the
// sea behind its levee among houses, driven into from the levee, flown over and started in, none,
// nor beside someone flying over them, nor, with its houses' fronts 20 m apart across a street,
// beside someone riding or flying over it where a bearing threads between them past every ray down,
// nor, with a boulevard across it, where five bearings thread between them past every ray down and
// along them (though, as a known limit, with the two houses facing each other across a street by
// it left empty, beside someone riding by them it's laid, in the scene and from the globe alike,
// and not beside someone flying over it), nor, laid out more sparsely, beside someone riding or
// flying over its street (with none laid, in the scene and from the globe alike), though flown over
// it the frame loop's look lays it; Go to
// beside a driver out on the sea's surface over the bed, or hopping or flying over it, laid there
// and on it with them, in the scene and by a drop-in, and not at a pin's height; with the surface
// laid already, beside someone flying over Lake Baikal's shelf, a sandy bed or between a harbour's
// moles, on it with them (and by a drop-in, your surface laid when you left),
// over Baikal's shelf in a square its shore crosses too, but not between moles a street's width
// apart, over a hollow inland or four squares from the lake's, nor over New Orleans' streets, nor by
// a drop-in from a sea laid on another coast; with none laid, beside someone riding on a surface of
// their own over a lake's shelf, a sandy bed or an inlet, on it with them, but not beside one on a
// levee at the sea's height, one in the air at that height, nor one riding over New Orleans' streets;
// and without the map, only ground deeper than any land or lake bed the sea's, for a
// drop-in and driven out from a coast;
// the screens the Worker's answers lead to (used up, robot check, maps off, the visit itself); and
// the leaderboard (its answers made here): the trophy and the panel, tabs, your own row, picking a
// name and renaming, a landed jump posting the run (the card asking the first time, never stopping
// the drive), each place's best posted as well as the day's, a dead connection changing nothing,
// and all of it on a phone. And the Supporter Pass's buying (its answers made here, Google's
// sign-in script stood in for): signing in from the pass's sheet, the pause menu and the used-up
// screen, Buy's link saying whose it is, unlocking when the window has focus again and on
// ?supporter=thanks, on every load for a supporter, signing out, the leaderboard player linked, the
// ⭐ on the board, and "Coming soon" with no sign-in or no Worker answering, the free game
// unchanged. Every request that isn't to the local server is blocked, so nothing reaches Google,
// Cloudflare, Stripe or OpenStreetMap.
// And the Garage's underglow under the kart as it drives: on the ground under it and round it, left
// out of its size, staying through a bump, fading out off the ground and flying, back as it lands.
//
// The rides: the pickup the default until another is picked, and the go-kart if its model doesn't
// load; the other tests drive the kart (see pickRide).
//
// Needs Playwright with Chromium, as test-accounts-ui.mjs does. TEST_VITE_PORT picks the port;
// TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { GOOGLE_STUB, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5521;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
// Answers the Worker's search would give.
const FURKA = { name: 'Furkapass, Obergoms, Goms, Valais, Switzerland', lat: 46.5725, lon: 8.4153, type: 'mountain_pass' };
const GOLDEN_GATE = { name: 'Golden Gate Bridge, San Francisco, California, United States', lat: 37.8199, lon: - 122.4783, type: 'bridge' };
// Stands in for Turnstile's script: it passes at once with the dummy token, as its test keys do.
const TURNSTILE_STUB = `window.turnstile = { render( el, options ) { window.turnstileOptions = options; setTimeout( () => options.callback( '${ TOKEN }' ), 50 ); return 'w1'; }, remove() {}, reset() {} };`;

let chromium;
let browser;
let vite;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		throw new Error( 'Playwright is needed: npm i -D playwright && npx playwright install chromium' );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	vite = await startVite( PORT, {}, 'vite.drive.config.js' );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

// A page with everything off this machine blocked, and the search answered here: searches says
// what was asked. ride: the ride picked unless one already is (see pickRide); null for the site's
// own default, the pickup.
async function newPage( { viewport = { width: 1280, height: 800 }, touch = false, api = {}, reducedMotion = 'no-preference', ride = 'go-kart' } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch, reducedMotion } );
	await pickRide( context, ride );
	const page = await context.newPage();
	page.searches = [];
	page.outside = [];
	page.errors = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => {

		page.outside.push( route.request().url().replace( /([?&](key|session)=)[^&]+/g, '$1...' ) );
		if ( route.request().url().startsWith( 'https://challenges.cloudflare.com/turnstile/' ) && api.turnstile ) return route.fulfill( { contentType: 'text/javascript', body: TURNSTILE_STUB } );
		route.abort();

	} );
	await page.route( `${ BASE }/api/search?*`, route => {

		const q = new URL( route.request().url() ).searchParams.get( 'q' );
		page.searches.push( q );
		if ( api.search ) return api.search( route, q );
		const results = /furka/i.test( q ) ? [ FURKA ] : /golden/i.test( q ) ? [ GOLDEN_GATE ] : [];
		route.fulfill( { contentType: 'application/json', body: JSON.stringify( { results } ) } );

	} );
	if ( api.config ) await page.route( `${ BASE }/api/config`, route => route.fulfill( { contentType: 'application/json', body: JSON.stringify( api.config ) } ) );
	if ( api.visit ) await page.route( `${ BASE }/api/visit`, route => api.visit( route ) );
	return page;

}

// The tests drive the go-kart, as they did before the pickup was the default: it's drawn in code,
// where the pickup is a model of 219,000 triangles, which Chromium's software renderer (no GPU here)
// draws at about one frame a second. Only where no ride is picked yet, so a ride picked in a test
// (and kept across a reload) stays picked. The pickup being the default has its own test.
async function pickRide( context, ride ) {

	if ( ride ) await context.addInitScript( ride => {

		try {

			if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', ride );

		} catch {

			// Storage blocked: the default it is.

		}

	}, ride );

}

async function openGlobe( page ) {

	await page.goto( BASE );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

}

const mode = page => page.evaluate( () => window.drive.mode );
const flown = page => page.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 60000 } );

async function driveHere( page ) {

	await page.locator( '.pin-card .go' ).click();
	await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );

}

async function shot( page, name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

describe( 'World Drive, desktop', () => {

	let page;

	before( async () => {

		page = await newPage();

	} );

	after( () => page?.context().close() );

	test( 'opens on the globe with its panel, on the test globe without a key', async () => {

		await openGlobe( page );
		const panel = page.locator( '#globe-ui .panel' );
		assert.ok( await panel.isVisible() );
		assert.match( await panel.locator( '.logo' ).textContent(), /World\s*Drive/ );
		assert.equal( await panel.locator( '.spots button' ).count(), 12 );
		// Then the cars (the muscle car free, then levels' and the Supporter Pass's, locked) and the
		// pass's rides (see test-drive-pro-ui.mjs).
		assert.deepEqual( await panel.locator( '.vehicle b' ).allTextContents(), [
			'Go-kart', 'Pickup', 'Muscle car', 'Golf cart', 'Tuk-tuk', 'Ice-cream van', 'Lawn tractor', 'Retro wedge', 'Formula racer',
			'Neon racer', 'Night cruiser', 'Dune buggy', 'Farm truck', 'Police cruiser', 'Hypercar', 'Cyber muscle',
			'Sports coupe', 'Monster truck', 'City bus', 'Hovercraft',
		] );
		assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Go-kart' );
		assert.match( await panel.locator( '.osm' ).textContent(), /Search © OpenStreetMap contributors/ );
		assert.equal( await page.locator( '#pin-card, .pin-card' ).isVisible(), false );
		assert.equal( await page.evaluate( () => !! window.drive.tiles ), false );
		// No Worker here: no robot check either, and no leaderboard.
		assert.deepEqual( page.outside, [] );
		assert.equal( await page.locator( '#globe-ui .board-open' ).isVisible(), false );
		await page.waitForTimeout( 500 );
		await shot( page, 'drive-1-globe' );

	} );

	test( 'search asks only on Enter, and a result flies the globe there with a pin', async () => {

		const input = page.locator( '.search input' );
		await input.click();
		await input.pressSequentially( 'Furka pass', { delay: 20 } );
		await page.waitForTimeout( 300 );
		assert.deepEqual( page.searches, [], 'searched while typing' );
		await input.press( 'Enter' );
		await page.locator( '.results button' ).first().waitFor();
		assert.deepEqual( page.searches, [ 'Furka pass' ] );
		assert.deepEqual( await page.locator( '.results button b' ).allTextContents(), [ 'Furkapass' ] );
		await shot( page, 'drive-2-search' );

		await page.locator( '.results button' ).first().click();
		assert.equal( await page.locator( '.results' ).isVisible(), false );
		await page.locator( '.pin-card' ).waitFor();
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Furkapass' );
		assert.match( await page.locator( '.pin-card .coords' ).textContent(), /46\.5725° N, 8\.4153° E/ );
		await flown( page );
		const pose = await page.evaluate( () => window.drive.globe.pose() );
		assert.ok( Math.abs( pose.lat - FURKA.lat ) < 0.01 && Math.abs( pose.lon - FURKA.lon ) < 0.01, JSON.stringify( pose ) );
		assert.ok( await page.locator( '#pin span' ).isVisible(), 'no pin on the globe' );
		await shot( page, 'drive-3-flown' );

	} );

	test( 'search says when there is nothing, and coordinates need no search', async () => {

		const input = page.locator( '.search input' );
		await input.fill( 'Nowhereville' );
		await input.press( 'Enter' );
		await page.locator( '.search-status', { hasText: 'Nothing found for "Nowhereville"' } ).waitFor();

		const asked = page.searches.length;
		await input.fill( '49.3054, -123.0491' );
		await input.press( 'Enter' );
		assert.equal( page.searches.length, asked, 'coordinates went to the search' );
		await page.waitForFunction( () => window.drive.panel.pinned?.name === '49.3054° N, 123.0491° W' );
		assert.equal( await page.locator( '.search-status' ).isVisible(), false );
		await flown( page );

		// A bridge found by the search starts on its deck, like the bridges among the spots.
		await input.fill( 'Golden Gate' );
		await input.press( 'Enter' );
		await page.locator( '.results button' ).first().click();
		assert.deepEqual( await page.evaluate( () => [ window.drive.panel.pinned.name, window.drive.panel.pinned.deck ] ), [ 'Golden Gate Bridge', true ] );
		await flown( page );

	} );

	test( 'a start spot drops in on the test pad and drives', async () => {

		await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
		await page.waitForFunction( () => window.drive.panel.pinned?.name === 'Golden Gate Bridge' );
		await flown( page );
		const navigations = await page.evaluate( () => performance.getEntriesByType( 'navigation' ).length );
		await page.locator( '.pin-card .go' ).click();
		assert.equal( await mode( page ), 'dropping' );
		assert.ok( await page.locator( '#loading' ).isVisible() );
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		assert.equal( await page.locator( '#loading' ).isVisible(), false );
		assert.ok( await page.locator( '#drive-ui .topbar' ).isVisible() );
		assert.equal( await page.locator( '#drive-ui .place' ).textContent(), 'Golden Gate Bridge' );
		assert.ok( await page.locator( '#drive-ui .keys' ).isVisible(), 'the keys card doesn\'t show as a drive starts' );
		assert.equal( await page.locator( '#globe-ui' ).isVisible(), false );
		const start = await page.evaluate( () => {

			const { driver, place } = window.drive;
			return { name: driver.entry.state.name, y: driver.y, east: driver.east, north: driver.north, heading: driver.heading, place };

		} );
		assert.equal( start.name, 'Go-kart' );
		assert.ok( Math.abs( start.y ) < 0.5, `started at y = ${ start.y }, not on the pad` );
		assert.deepEqual( [ start.east, start.north ], [ 0, 0 ] );
		// The pad is open all round, so the spot's own heading (along the bridge) is kept.
		assert.equal( start.heading, 352 );
		assert.equal( start.place.lat, 37.8199 );
		await page.waitForTimeout( 400 );
		await shot( page, 'drive-4-dropped' );

		await page.keyboard.down( 'KeyW' );
		await page.waitForFunction( () => window.drive.driver.speed > 5, null, { timeout: 20000 } );
		await page.keyboard.up( 'KeyW' );
		assert.ok( await page.evaluate( () => Number( document.querySelector( '#hud .dhud-number' ).textContent ) ) > 0 );
		await shot( page, 'drive-5-driving' );
		assert.equal( await page.evaluate( () => performance.getEntriesByType( 'navigation' ).length ), navigations );

	} );

	test( 'stunts: a wall throws the kart into the air, a backflip lands for points, DRIFT drifts', async () => {

		// Driven here at a fixed step, so it doesn't hang on the headless frame rate.
		const result = await page.evaluate( () => {

			const { driver: d, ground } = window.drive;
			const pad = ground.getColliders()[ 0 ];
			const step = ( seconds, each ) => {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					if ( each?.() === false ) return;

				}

			};
			const reset = kmh => {

				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: kmh / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, drifting: 0, driftHop: false, boost: null } );
				d.update( 1 / 60 );

			};
			// A wall 60 m wide and 6 m high across the road, 30 m north: a vertical slice of the pad.
			const land = pad.children.find( child => child.isMesh );
			const wall = land.clone();
			wall.material = land.material.clone();
			wall.material.side = 2;
			wall.rotation.set( 0, 0, 0 );
			wall.scale.set( 60 / 4000, 6 / 2000, 1 );
			wall.position.set( 0, 3, 30 );
			pad.add( wall );
			wall.updateMatrixWorld();

			const out = {};
			// Into it at 90 km/h: back off it and up, never through it, and down again on its wheels.
			reset( 90 );
			let launched = false, high = 0, through = 0;
			const corner = d.entry.pivot.position.clone();
			step( 6, () => {

				launched ||= d.air?.hits > 0;
				high = Math.max( high, d.y );
				const { min, max } = d.ownBox;
				for ( const x of [ min.x, max.x ] ) for ( const y of [ min.y, max.y ] ) for ( const z of [ min.z, max.z ] ) {

					corner.set( x, y, z ).applyMatrix4( d.entry.pivot.matrixWorld );
					if ( corner.y < 6 ) through = Math.max( through, corner.z - 30 );

				}

			} );
			Object.assign( out, { launched, high, through, down: d.grounded && ! d.air } );
			pad.remove( wall );

			// Thrown up, with a backflip held on S and let go in time: it lands on its wheels and scores.
			reset( 40 );
			const score = d.score;
			d.hop();
			d.vy = 12;
			d.press( 'KeyS' );
			step( 5, () => {

				if ( d.air && d.air.turned.x > Math.PI * 2 - 0.8 ) d.release( 'KeyS' );
				return ! d.grounded;

			} );
			Object.assign( out, { scored: d.score - score, tricks: document.querySelector( '#hud .dhud-tricks' ).textContent } );

			// The DRIFT button held with the mouse while steering right, then let go: a boost.
			reset( 60 );
			const button = document.querySelector( '#hud .dhud-drift-hold' );
			const pointer = type => button.dispatchEvent( new PointerEvent( type, { pointerId: 7, pointerType: 'mouse', bubbles: true } ) );
			pointer( 'pointerdown' );
			d.press( 'KeyD' );
			step( 2 );
			const chip = document.querySelector( '#hud .dhud-drift' );
			Object.assign( out, { button: button.offsetParent !== null, drifting: d.drifting, level: d.driftLevel, chip: ! chip.hidden && chip.dataset.level } );
			pointer( 'pointerup' );
			step( 0.1 );
			out.boost = !! d.boost;
			reset( 0 );
			return out;

		} );
		assert.ok( result.launched, 'the wall didn\'t throw it into the air' );
		assert.ok( result.high > 1.5, `only ${ result.high } m up` );
		assert.ok( result.through < 0.02, `${ result.through } m into the wall` );
		assert.ok( result.down, 'still in the air' );
		assert.ok( result.scored > 0 && /Backflip!/.test( result.tricks ), JSON.stringify( result ) );
		assert.ok( result.button && result.drifting === 1 && result.level >= 2 && result.chip === String( result.level ), JSON.stringify( result ) );
		assert.ok( result.boost, 'no boost after the drift' );
		await shot( page, 'drive-5b-stunts' );

	} );

	test( 'a bridge spot looks round its pin for the deck', async () => {

		// A deck 24 m wide and 40 m up, running north 6 to 30 m east of the pin, over the test pad.
		const found = await page.evaluate( () => {

			const { ground } = window.drive;
			const pad = ground.getColliders()[ 0 ];
			const deck = pad.children.find( child => child.isMesh ).clone();
			deck.scale.set( 24 / 4000, 600 / 2000, 1 );
			deck.position.set( - 18, 40, 0 );
			pad.add( deck );
			deck.updateMatrixWorld();
			const on = ground.deck( 0 );
			pad.remove( deck );
			return { on, off: ground.deck( 0 ) };

		} );
		assert.equal( found.off, null );
		// The nearest point with 4 m of deck all round it.
		assert.deepEqual( { ...found.on, y: Math.round( found.on.y * 100 ) / 100 }, { east: 12, north: 0, y: 40 } );
		const spots = await page.evaluate( async () => ( await import( '/src/drive-app/places.js' ) ).SPOTS.filter( spot => spot.deck ).map( spot => spot.id ) );
		assert.deepEqual( spots, [ 'lions-gate', 'golden-gate', 'sydney' ] );

	} );

	test( 'a pin on a roof starts on the street below it', async () => {

		// A flat roof 20 m square and 12 m up, right over the pin, on the open test pad.
		const found = await page.evaluate( () => {

			const { ground } = window.drive;
			const pad = ground.getColliders()[ 0 ];
			const roof = pad.children.find( child => child.isMesh ).clone();
			roof.scale.set( 20 / 4000, 20 / 2000, 1 );
			roof.position.set( 0, 12, 0 );
			pad.add( roof );
			roof.updateMatrixWorld();
			const y = ground.heightAt( 0, 0 );
			const on = ground.street( y );
			pad.remove( roof );
			return { y, on, off: ground.street( 0 ) };

		} );
		assert.equal( Math.round( found.y ), 12 );
		// Open ground already: it stays where it is.
		assert.equal( found.off, null );
		// The nearest point of the pad clear of the roof by a lane's width (4 m) all round.
		assert.ok( found.on, 'no street found' );
		assert.equal( Math.hypot( found.on.east, found.on.north ), 16, JSON.stringify( found.on ) );
		assert.ok( Math.abs( found.on.y ) < 0.05, JSON.stringify( found.on ) );

	} );

	test( 'something right in front of the start: it steps across the road', async () => {

		// A block 2.3 m wide and 2 m tall, 5 m north of the pin, from 0.3 m left of the middle to
		// 2 m right: a car parked in Google's photo, in front of a kart heading north.
		const found = await page.evaluate( () => {

			const { ground } = window.drive;
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh );
			const block = land.clone();
			block.material = land.material.clone();
			block.material.side = 2;
			block.rotation.set( 0, 0, 0 );
			block.scale.set( 2.3 / 4000, 2 / 2000, 1 );
			block.position.set( - 0.85, 1, 5 );
			pad.add( block );
			block.updateMatrixWorld();
			const result = { ahead: ground.clearAhead( 0, 0, 0.6 ), on: ground.sideStep( 0, 0, 0.6 ), east: ground.sideStep( 90, 0, 0.6 ) };
			pad.remove( block );
			result.off = ground.sideStep( 0, 0, 0.6 );
			return result;

		} );
		assert.ok( Math.abs( found.ahead - 5 ) < 0.01, `clear ${ found.ahead } m ahead` );
		// 1.5 m to the right still meets the block; 1.5 m to the left is clear.
		assert.deepEqual( found.on && { east: found.on.east, north: Math.round( found.on.north * 100 ) / 100, y: Math.round( found.on.y * 100 ) / 100 }, { east: - 1.5, north: 0, y: 0 } );
		// Heading east, or with nothing there, it stays at the pin.
		assert.equal( found.east, null );
		assert.equal( found.off, null );

	} );

	test( 'Esc pauses; the pause menu changes ride and drives on', async () => {

		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		assert.equal( await mode( page ), 'paused' );
		await shot( page, 'drive-6-paused' );
		await page.locator( '#pause .vehicle', { hasText: 'Pickup' } ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' && window.drive.driver.entry.state.name === 'Pickup', null, { timeout: 30000 } );
		assert.equal( await page.locator( '#pause' ).isVisible(), false );
		assert.equal( await page.evaluate( () => window.drive.models.entries.length ), 1, 'the old ride was left behind' );
		// The globe's picker follows.
		assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Pickup' );
		await page.waitForTimeout( 600 );
		await shot( page, 'drive-7-pickup' );

		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		await page.keyboard.press( 'Enter' );
		await page.waitForFunction( () => window.drive.mode === 'driving' );

	} );

	test( 'M goes back to the globe; another place drops in with no reload', async () => {

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		assert.equal( await page.evaluate( () => window.drive.models.entries.length ), 0 );
		await flown( page );
		assert.ok( await page.locator( '#globe-ui .panel' ).isVisible() );
		assert.equal( await page.locator( '#drive-ui' ).isVisible(), false );
		assert.ok( ( await page.evaluate( () => window.drive.globe.altitude() ) ) > 5e6, 'not back out in space' );
		const recent = await page.locator( '.recent button b' ).allTextContents();
		assert.deepEqual( recent, [ 'Golden Gate Bridge' ] );
		await shot( page, 'drive-8-back' );

		// The muscle car this time, at the place in Recent.
		await page.locator( '#globe-ui .vehicle', { hasText: 'Muscle car' } ).click();
		await page.locator( '.spots button', { hasText: 'Furka Pass' } ).click();
		await flown( page );
		await driveHere( page );
		const now = await page.evaluate( () => ( { name: window.drive.driver.entry.state.name, place: window.drive.place.name, navigations: performance.getEntriesByType( 'navigation' ).length } ) );
		assert.deepEqual( now, { name: 'Muscle car', place: 'Furka Pass', navigations: 1 } );
		await page.waitForTimeout( 600 );
		await shot( page, 'drive-9-muscle' );

		// The Globe button does what M does.
		await page.locator( '#drive-ui .to-globe' ).click();
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		await flown( page );
		assert.deepEqual( await page.locator( '.recent button b' ).allTextContents(), [ 'Furka Pass', 'Golden Gate Bridge' ] );

	} );

	test( 'a tap on the globe drops a pin there, and Esc clears it', async () => {

		await page.mouse.click( 820, 420 );
		await page.locator( '.pin-card' ).waitFor();
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Dropped pin' );
		assert.match( await page.locator( '.pin-card .coords' ).textContent(), /^\d+\.\d{4}° [NS], \d+\.\d{4}° [EW]$/ );
		await shot( page, 'drive-10-pin' );
		await page.keyboard.press( 'Escape' );
		await page.locator( '.pin-card' ).waitFor( { state: 'hidden' } );
		assert.equal( await page.locator( '#pin span' ).isVisible(), false );

	} );

	test( 'recent places and the picked ride are kept across a reload', async () => {

		await openGlobe( page );
		assert.deepEqual( await page.locator( '.recent button b' ).allTextContents(), [ 'Furka Pass', 'Golden Gate Bridge' ] );
		assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Muscle car' );
		assert.deepEqual( page.outside, [] );
		assert.deepEqual( page.errors, [] );

	} );

} );

// The play stats (src/drive-app/stats.js, docs/world-drive.md "Play stats"), seen in the page's
// posts to /api/stats, answered here. The dev server has no visit, so the stats alone are handed a
// test one (worldDriveStatsTest, main.js), and each test posts at once rather than waiting the 3
// minutes or for the page to go out of sight.
describe( 'World Drive play stats', () => {

	// A page that counts, its posts kept in page.posts.
	async function countingPage( options ) {

		const page = await newPage( options );
		page.posts = [];
		await page.addInitScript( () => {

			window.worldDriveStatsTest = { visit: 'v1.stats-test' };

		} );
		await page.route( `${ BASE }/api/stats`, route => {

			page.posts.push( JSON.parse( route.request().postData() ) );
			route.fulfill( { status: 204 } );

		} );
		return page;

	}

	// Everything the page has posted, posting what it has counted now: { 'metric:key': n }, and only
	// those of `metrics` if given.
	async function posted( page, ...metrics ) {

		await page.evaluate( () => window.drive.stats.post() );
		const all = {};
		for ( const { counts } of page.posts ) {

			for ( const [ name, n ] of Object.entries( counts ) ) {

				if ( ! metrics.length || metrics.includes( name.split( ':' )[ 0 ] ) ) all[ name ] = ( all[ name ] ?? 0 ) + n;

			}

		}

		return all;

	}

	test( 'a visit\'s funnel as it goes (the globe, a pin, a drop-in, driving), once each; its device; searches by kind, never what was typed; play time; a drop-in\'s time, and one left for the globe', async () => {

		const page = await countingPage();
		try {

			await openGlobe( page );
			assert.deepEqual( await posted( page, 'funnel', 'device', 'load' ), { 'funnel:globe': 1, 'device:computer': 1, 'load:direct': 1 } );
			assert.equal( page.posts[ 0 ].visit, 'v1.stats-test' );
			assert.equal( Object.keys( await posted( page, 'load_time' ) ).length, 1 );

			// A map search, one that finds nothing, and coordinates typed (pinned at once).
			const input = page.locator( '.search input' );
			await input.fill( 'Furka pass' );
			await input.press( 'Enter' );
			await page.locator( '.results button' ).first().waitFor();
			await input.fill( 'Nowhereville' );
			await input.press( 'Enter' );
			await page.locator( '.search-status', { hasText: 'Nothing found' } ).waitFor();
			await input.fill( '46.5725, 8.4153' );
			await input.press( 'Enter' );
			await page.waitForFunction( () => window.drive.panel.pinned );
			await flown( page );
			assert.deepEqual( await posted( page, 'search', 'funnel' ), { 'search:earth': 2, 'search:nothing': 1, 'search:coordinates': 1, 'funnel:globe': 1, 'funnel:pin': 1 } );
			assert.doesNotMatch( JSON.stringify( page.posts ), /furka|nowhere|46\.57|8\.41/i, 'what was typed' );

			// A start spot (pinned again: still one pin) and a drop-in there.
			await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
			await flown( page );
			await driveHere( page );
			const dropped = await posted( page, 'funnel', 'dropin', 'ride', 'dropin_time' );
			assert.deepEqual( Object.keys( dropped ).filter( name => name.startsWith( 'dropin_time:' ) ).length, 1, JSON.stringify( dropped ) );
			assert.deepEqual( Object.fromEntries( Object.entries( dropped ).filter( ( [ name ] ) => ! name.startsWith( 'dropin_time:' ) ) ), {
				'funnel:globe': 1, 'funnel:pin': 1, 'funnel:dropin': 1, 'funnel:driving': 1, 'dropin:golden-gate': 1, 'ride:go-kart': 1,
			} );

			// Play time, by ride and by world, in whole seconds as it's posted.
			await page.keyboard.down( 'KeyW' );
			await page.waitForFunction( () => window.drive.stats.counts[ 'play_world:earth' ] >= 1.5, null, { timeout: 60000 } );
			await page.keyboard.up( 'KeyW' );
			const played = await posted( page, 'play', 'play_world' );
			assert.ok( played[ 'play:go-kart' ] >= 1 && played[ 'play_world:earth' ] >= 1, JSON.stringify( played ) );
			assert.deepEqual( Object.keys( played ).sort(), [ 'play:go-kart', 'play_world:earth' ] );

			// Back to the globe, then a drop-in left for the globe before it's driving: a problem, and no
			// second drop-in in the funnel.
			await page.keyboard.press( 'KeyM' );
			await page.waitForFunction( () => window.drive.mode === 'globe' );
			await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
			await flown( page );
			await page.locator( '.pin-card .go' ).click();
			assert.equal( await mode( page ), 'dropping' );
			await page.keyboard.press( 'Escape' );
			await page.waitForFunction( () => window.drive.mode === 'globe' );
			assert.deepEqual( await posted( page, 'problem', 'funnel' ), { 'problem:drop_abandoned': 1, 'funnel:globe': 1, 'funnel:pin': 1, 'funnel:dropin': 1, 'funnel:driving': 1 } );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'on a phone, the device is a phone', async () => {

		const page = await countingPage( { viewport: { width: 390, height: 844 }, touch: true } );
		try {

			await openGlobe( page );
			assert.deepEqual( await posted( page, 'device', 'funnel' ), { 'device:phone': 1, 'funnel:globe': 1 } );

		} finally {

			await page.context().close();

		}

	} );

} );

describe( 'World Drive\'s default ride', () => {

	test( 'is the pickup until another is picked, and while the one picked is locked', async () => {

		const page = await newPage( { ride: null } );
		try {

			await openGlobe( page );
			const panel = page.locator( '#globe-ui' );
			assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Pickup' );
			// Its model is someone else's, credited under the rides.
			assert.match( await panel.locator( '.credit' ).textContent(), /^Model: "American pickup truck" by local\.yany, CC BY 4\.0/ );
			// The kart is still first in the row.
			assert.equal( await panel.locator( '.vehicle b' ).first().textContent(), 'Go-kart' );

			// A ride saved that can't be driven (the pass's): the pickup again.
			await page.evaluate( () => localStorage.setItem( 'world-drive.vehicle', 'monster-truck' ) );
			await openGlobe( page );
			assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Pickup' );

			// Picked, the kart stays picked.
			await panel.locator( '.vehicle', { hasText: 'Go-kart' } ).click();
			await openGlobe( page );
			assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Go-kart' );
			assert.deepEqual( page.errors, [] );
			assert.deepEqual( page.outside, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'a pickup that doesn\'t load is a drive in the go-kart, not none', async () => {

		const page = await newPage( { ride: null } );
		try {

			await page.route( `${ BASE }/library/pickup-truck.glb`, route => route.fulfill( { status: 404, body: '' } ) );
			await openGlobe( page );
			await page.evaluate( () => window.drive.dropIn( { name: 'Test pad', lat: 46.5725, lon: 8.4153 } ) );
			await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
			assert.equal( await page.evaluate( () => window.drive.driver.entry.state.name ), 'Go-kart' );
			assert.match( await page.locator( '#toast' ).textContent(), /The pickup didn't load .*, so here's the go-kart\./ );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

describe( 'World Drive on a phone', () => {

	let page;

	before( async () => {

		page = await newPage( { viewport: { width: 390, height: 844 }, touch: true } );

	} );

	after( () => page?.context().close() );

	test( 'the panel is a sheet along the bottom, and the touch buttons drive', async () => {

		await openGlobe( page );
		const sheet = await page.locator( '#globe-ui .panel' ).boundingBox();
		assert.ok( sheet.y > 844 * 0.45 && sheet.width === 390, JSON.stringify( sheet ) );
		await page.waitForTimeout( 500 );
		await shot( page, 'drive-phone-1-globe' );

		await page.locator( '.spots button', { hasText: 'Times Square' } ).tap();
		await page.locator( '.pin-card' ).waitFor();
		await flown( page );
		const card = await page.locator( '.pin-card' ).boundingBox();
		assert.ok( card.y + card.height <= sheet.y, 'the pin card is under the sheet' );
		// The globe flew so that the pin shows above its card, under the title.
		const marker = await page.locator( '#pin span' ).boundingBox();
		const title = await page.locator( '#globe-ui .intro' ).boundingBox();
		assert.ok( marker && marker.y + marker.height <= card.y && marker.y >= title.y + title.height, `pin at ${ JSON.stringify( marker ) }` );
		assert.equal( await page.locator( '#drive-ui .keys' ).isVisible(), false );
		await shot( page, 'drive-phone-2-pin' );
		await page.locator( '.pin-card .go' ).tap();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		assert.ok( await page.locator( '#hud .dhud-touch .gas' ).isVisible() );
		assert.equal( await page.locator( '#drive-ui .keys-toggle' ).isVisible(), false );

		// Hold the gas and steer right with two fingers.
		const press = ( selector, type, pointerId ) => page.locator( selector ).dispatchEvent( type, { pointerId, isPrimary: pointerId === 1, pointerType: 'touch', bubbles: true } );
		await press( '.dhud-touch .gas', 'pointerdown', 1 );
		await press( '.dhud-touch .right', 'pointerdown', 2 );
		await page.waitForFunction( () => window.drive.driver.speed > 3, null, { timeout: 20000 } );
		assert.ok( await page.evaluate( () => window.drive.driver.keys.has( 'KeyW' ) && window.drive.driver.keys.has( 'KeyD' ) ) );
		await shot( page, 'drive-phone-3-driving' );
		await press( '.dhud-touch .gas', 'pointerup', 1 );
		await press( '.dhud-touch .right', 'pointerup', 2 );
		assert.ok( await page.evaluate( () => ! window.drive.driver.keys.has( 'KeyW' ) && ! window.drive.driver.keys.has( 'KeyD' ) ) );
		const heading = await page.evaluate( () => window.drive.driver.heading );
		assert.notEqual( heading, 29, 'steering did nothing' );

		await page.locator( '#drive-ui .pause-open' ).tap();
		await page.locator( '#pause' ).waitFor();
		await shot( page, 'drive-phone-4-paused' );
		await page.locator( '#pause .to-globe' ).tap();
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		assert.deepEqual( page.errors, [] );

	} );

} );

// Boosting flat out with the gauge kept full, from a standstill on the test pad, at a fixed step:
// when it goes supersonic (and how fast it's going), the boom and streaks (the supersonic effects'
// particles: the free rides' classic flame has none of its own), the tag and the wider view a
// second on; then out of fuel and braking, when it ends.
function supersonic() {

	const { driver: d } = window.drive;
	const tag = document.querySelector( '#hud .dhud-sonic' );
	const step = () => {

		d.update( 1 / 60 );
		// The pad is flat and the same everywhere: keep to its middle.
		if ( d.north > 800 ) d.north -= 1000;

	};
	for ( const code of [ ...d.keys ] ) d.release( code );
	Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: 0, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, boost: null, firing: false, gauge: 1 } );
	step();
	const out = { name: d.entry.state.name, boostedTop: d.spec.topSpeed * 2, at: null, tagBefore: ! tag.hidden };
	d.press( 'KeyW' );
	d.press( 'KeyB' );
	for ( let i = 0; i < 900 && out.at === null; i ++ ) {

		d.gauge = 1;
		step();
		if ( d.supersonic ) out.at = Math.round( i / 60 * 100 ) / 100;

	}

	out.kmh = Math.round( d.speed * 3.6 );
	out.boom = d.fx.particles.alive;
	out.tag = ! tag.hidden && tag.textContent;
	for ( let i = 0; i < 60; i ++ ) {

		d.gauge = 1;
		step();

	}

	out.streaks = d.fx.particles.alive;
	out.warp = Math.round( d.warp * 100 ) / 100;
	out.still = d.supersonic;
	// Out of boost (B was only a tap: it fires till the gauge is empty), and braking.
	d.gauge = 0;
	d.release( 'KeyB' );
	d.release( 'KeyW' );
	d.press( 'KeyS' );
	out.endedAt = null;
	for ( let i = 0; i < 600 && out.endedAt === null; i ++ ) {

		step();
		if ( ! d.supersonic ) out.endedAt = Math.round( d.speed * 3.6 );

	}

	for ( let i = 0; i < 60; i ++ ) step();
	d.release( 'KeyS' );
	out.tagAfter = ! tag.hidden;
	out.warpAfter = Math.round( d.warp * 100 ) / 100;
	out.particlesAfter = d.fx.particles.alive;
	return out;

}

// Change ride from the pause menu, and drive on.
async function swapTo( page, name ) {

	await page.keyboard.press( 'Escape' );
	await page.locator( '#pause' ).waitFor();
	await page.locator( '#pause .vehicle', { hasText: name } ).click();
	await page.waitForFunction( ride => window.drive.mode === 'driving' && window.drive.driver.entry.state.name === ride, name, { timeout: 30000 } );

}

describe( 'World Drive boosts: supersonic and boost pads', () => {

	let page;

	before( async () => {

		page = await newPage();

	} );

	after( () => page?.context().close() );

	test( 'boosting flat out goes supersonic in every free ride: a boom, streaks, the tag, a wider view; it ends as it slows', async () => {

		await openGlobe( page );
		await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
		await flown( page );
		await driveHere( page );
		await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
		const rides = [];
		for ( const name of [ 'Go-kart', 'Pickup', 'Muscle car' ] ) {

			if ( name !== 'Go-kart' ) await swapTo( page, name );
			const ride = await page.evaluate( supersonic );
			rides.push( ride );
			console.log( 'supersonic:', JSON.stringify( ride ) );
			assert.equal( ride.name, name );
			assert.equal( ride.tagBefore, false );
			// At (or nearly at) the booster's top speed, a moment after reaching it.
			assert.ok( ride.at !== null && ride.kmh >= ride.boostedTop * 0.85 - 1, JSON.stringify( ride ) );
			assert.equal( ride.tag, 'OVERDRIVE' );
			// The boom (two rings and a flash) and then streaks of air going past.
			assert.ok( ride.boom >= 3 && ride.streaks >= 8, JSON.stringify( ride ) );
			assert.ok( ride.still && ride.warp > 0.9, JSON.stringify( ride ) );
			// Out of boost and braking, it ends once under three quarters of that top speed.
			assert.ok( ride.endedAt !== null && ride.endedAt < ride.boostedTop * 0.75 + 1 && ride.endedAt > ride.boostedTop * 0.6, JSON.stringify( ride ) );
			assert.ok( ! ride.tagAfter && ride.warpAfter < 0.15 && ride.particlesAfter === 0, JSON.stringify( ride ) );

		}

		// Each ride's own top speed: the muscle car's boosted top is well above the kart's.
		assert.ok( rides[ 2 ].boostedTop > rides[ 0 ].boostedTop );

		// Driven by the page itself, kept supersonic for a moment: the view widens, then narrows again.
		// (Waited for frame by frame, up to 600 of them: headless, they come slowly.)
		await page.evaluate( () => window.untilFrame = ( done, most = 600 ) => new Promise( resolve => {

			let left = most;
			const frame = () => done() || -- left <= 0 ? resolve() : requestAnimationFrame( frame );
			requestAnimationFrame( frame );

		} ) );
		const view = await page.evaluate( async () => {

			const { driver: d, camera } = window.drive;
			for ( const code of [ ...d.keys ] ) d.release( code );
			const top = d.spec.topSpeed / 3.6 * 2;
			// Driving's view first: headless frames come slowly, and it may still be widening from the
			// globe's when a run of rides has taken few of them.
			await window.untilFrame( () => Math.abs( camera.fov - 70 ) < 0.2 );
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, view: 0, speed: top, gauge: 1, firing: true, supersonic: false, nearTop: 0 } );
			const fov = camera.fov;
			const hold = () => {

				d.gauge = 1;
				d.firing = true;
				d.speed = top;
				if ( d.north > 800 ) d.north -= 1000;

			};
			await window.untilFrame( () => {

				hold();
				return camera.fov > fov + 8;

			} );
			return { before: fov, during: camera.fov, supersonic: d.supersonic };

		} );
		await shot( page, 'boost-supersonic' );
		const narrowed = await page.evaluate( async () => {

			const { driver: d, camera } = window.drive;
			Object.assign( d, { gauge: 0, firing: false, speed: 5 } );
			await window.untilFrame( () => camera.fov < 70.5 && ! d.supersonic );
			return { fov: camera.fov, supersonic: d.supersonic };

		} );
		console.log( 'field of view:', JSON.stringify( { ...view, after: narrowed.fov } ) );
		// Driving's 70°, nine more supersonic, and back.
		assert.ok( view.supersonic && view.during > 77, JSON.stringify( view ) );
		assert.ok( ! narrowed.supersonic && narrowed.fov < 70.6, JSON.stringify( narrowed ) );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'boost pads go down on open ground at the street\'s height as it drives: never on a roof, a car or a slope, nor from high up', async () => {

		await swapTo( page, 'Go-kart' );
		const result = await page.evaluate( () => {

			const { driver: d, ground, pads } = window.drive;
			// They're off until they're switched on.
			pads.enabled = true;
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh );
			// Flat tops cut from the pad: roofs 12 m up, cars' roofs 1.5 m up and a bus shelter 3 m
			// up, either side of the road north, each { east, north, wide, long, up }.
			const things = [];
			for ( let north = 25; north < 700; north += 28 ) {

				const side = things.length % 2 ? 1 : - 1;
				const kind = things.length % 3;
				const [ wide, long, up ] = [ [ 20, 20, 12 ], [ 2, 4.5, 1.5 ], [ 4, 8, 3 ] ][ kind ];
				things.push( { east: side * ( 9 + wide / 2 + ( kind === 1 ? 3 : 0 ) ), north, wide, long, up } );

			}

			const tops = things.map( thing => {

				const top = land.clone();
				top.material = land.material.clone();
				top.scale.set( thing.wide / 4000, thing.long / 2000, 1 );
				top.position.set( - thing.east, thing.up, thing.north );
				pad.add( top );
				top.updateMatrixWorld();
				return top;

			} );
			// A slope too, off to one side: tilted 12°.
			const slope = land.clone();
			slope.scale.set( 30 / 4000, 30 / 2000, 1 );
			slope.rotation.set( - Math.PI / 2 + 0.21, 0, 0 );
			slope.position.set( 40, 3.5, 300 );
			pad.add( slope );
			slope.updateMatrixWorld();

			pads.clear();
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: 80 / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, boost: null, firing: false, gauge: 1 } );
			// Pads are what's put down: each one as it lights for the first time at a spot.
			const placed = [];
			const seen = new Map();
			let mostAtOnce = 0;
			let closest = Infinity;
			for ( let i = 0; i < 31 * 60; i ++ ) {

				d.speed = 80 / 3.6;
				d.gauge = 1;
				d.update( 1 / 60 );
				pads.update( 1 / 60 );
				const lit = pads.pads.filter( p => p.state !== 'free' );
				mostAtOnce = Math.max( mostAtOnce, lit.length );
				for ( const p of lit ) {

					const key = `${ p.at.x.toFixed( 2 ) },${ p.at.z.toFixed( 2 ) }`;
					if ( seen.get( p ) !== key ) placed.push( { kind: p.kind, radius: p.radius, east: - p.at.x, north: p.at.z, y: p.at.y, ahead: p.at.z - d.north } );
					seen.set( p, key );
					for ( const q of lit ) if ( q !== p ) closest = Math.min( closest, Math.hypot( p.at.x - q.at.x, p.at.z - q.at.z ) );

				}

			}

			// What's put down over something, or on the slope.
			const over = placed.filter( p => things.some( t => Math.abs( p.east - t.east ) < t.wide / 2 + p.radius && Math.abs( p.north - t.north ) < t.long / 2 + p.radius )
				|| Math.abs( - p.east - 40 ) < 15 + p.radius && Math.abs( p.north - 300 ) < 15 + p.radius );
			const heights = [ ...new Set( placed.map( p => Math.round( p.y * 1000 ) / 1000 ) ) ];
			const ahead = placed.filter( p => p.ahead > 0 ).length;

			// Flying high, none are put down.
			pads.clear();
			Object.assign( d, { y: 60, lastSafe: { east: d.east, north: d.north, y: 0 } } );
			for ( let i = 0; i < 120; i ++ ) pads.update( 1 / 60 );
			const fromHigh = pads.pads.filter( p => p.state !== 'free' ).length;
			Object.assign( d, { y: 0, vy: 0, grounded: true } );
			d.update( 1 / 60 );

			// Sharper ground arriving under them (the pad raised 0.4 m): they move onto it.
			for ( let i = 0; i < 240; i ++ ) {

				d.update( 1 / 60 );
				pads.update( 1 / 60 );

			}

			const before = pads.pads.filter( p => p.state !== 'free' ).length;
			land.position.y += 0.4;
			land.updateMatrixWorld();
			for ( let i = 0; i < 30; i ++ ) pads.update( 1 / 60 );
			const risen = pads.pads.filter( p => p.state !== 'free' ).map( p => Math.round( p.at.y * 100 ) / 100 );
			land.position.y -= 0.4;
			land.updateMatrixWorld();
			for ( let i = 0; i < 30; i ++ ) pads.update( 1 / 60 );
			const settled = pads.pads.filter( p => p.state !== 'free' ).map( p => Math.round( p.at.y * 100 ) / 100 );

			for ( const top of [ ...tops, slope ] ) pad.remove( top );
			pads.clear();
			return { placed: placed.length, small: placed.filter( p => p.kind === 'small' ).length, big: placed.filter( p => p.kind === 'big' ).length, ahead, mostAtOnce, closest, over, heights, fromHigh, before, risen, settled };

		} );
		console.log( 'boost pads put down:', JSON.stringify( { ...result, over: result.over.length } ) );
		assert.ok( result.placed >= 25 && result.small > result.big && result.big >= 3, JSON.stringify( result ) );
		// Mostly ahead of it, never more than there are, and apart.
		assert.ok( result.ahead > result.placed * 0.6, JSON.stringify( result ) );
		assert.ok( result.mostAtOnce <= 12 && result.closest >= 15, JSON.stringify( result ) );
		// On the ground (the pad's at 0; the water at -2 is far behind), never on a roof, a car,
		// a shelter or the slope.
		assert.deepEqual( result.over, [] );
		assert.deepEqual( result.heights, [ 0 ] );
		assert.equal( result.fromHigh, 0 );
		assert.ok( result.before > 3 && result.risen.length >= 3 && result.risen.every( y => y === 0.4 ), JSON.stringify( result ) );
		assert.ok( result.settled.every( y => y === 0 ), JSON.stringify( result ) );

	} );

	test( 'driven over, a small pad tops up the gauge by 12 %, a big one fills it; it goes dark and lights again; full, it\'s left', async () => {

		const run = await page.evaluate( () => {

			const { driver: d, pads } = window.drive;
			pads.enabled = true;
			const label = document.querySelector( '#hud .dhud-boost b' );
			const taken = [];
			const add = d.addBoost;
			d.addBoost = share => {

				// What it gave, and whether that's what it had room for.
				const room = 1 - d.gauge;
				const got = add.call( d, share );
				taken.push( [ share, Math.round( got * 1000 ) / 1000, Math.abs( got - Math.min( share, room ) ) < 1e-9 ] );
				return got;

			};
			// Pads put down only where the test says, for now: from far behind, the others are gone.
			const at = gauge => {

				pads.clear();
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: 40 / 3.6, vy: 0, grounded: true, air: null, flying: false, boost: null, firing: false, gauge } );
				d.update( 1 / 60 );

			};
			const drive = ( seconds, each ) => {

				for ( let i = 0; i < seconds * 60; i ++ ) {

					d.update( 1 / 60 );
					pads.update( 1 / 60 );
					each?.();

				}

			};
			const out = {};

			// The booster still recharges by itself: an eighth of the gauge a second.
			at( 0.5 );
			d.speed = 0;
			drive( 1 );
			out.recharge = Math.round( ( d.gauge - 0.5 ) * 1000 ) / 1000;

			at( 0.5 );
			const small = pads.place( 'small', 0, 12 );
			let shown = '';
			drive( 1.5, () => shown ||= label.textContent.startsWith( '+' ) ? label.textContent : '' );
			out.small = { taken: taken.splice( 0 ), state: small.state, shown };
			// Back over it at once: dark, nothing.
			Object.assign( d, { north: 0, gauge: 0.5 } );
			drive( 1.5 );
			out.again = { taken: taken.splice( 0 ), state: small.state };
			// A few seconds on (parked well short of it), it's lit, and gives again.
			Object.assign( d, { north: 0, speed: 0 } );
			drive( 4.1 );
			out.relit = small.state;
			Object.assign( d, { north: 0, speed: 40 / 3.6, gauge: 0.5 } );
			drive( 1.5 );
			out.second = taken.splice( 0 );

			at( 0.2 );
			const big = pads.place( 'big', 0, 12 );
			drive( 1.5 );
			out.big = { taken: taken.splice( 0 ), gauge: Math.round( d.gauge * 1000 ) / 1000, state: big.state };

			// A full gauge leaves a pad lit for later.
			at( 1 );
			const spare = pads.place( 'small', 0, 12 );
			drive( 1.5 );
			out.full = { taken: taken.splice( 0 ), state: spare.state };
			// Far away, it's put down somewhere else.
			Object.assign( d, { north: 400 } );
			drive( 0.1 );
			out.left = spare.state === 'free' || Math.abs( spare.at.z - 12 ) > 1;

			d.addBoost = add;
			return out;

		} );
		console.log( 'boost pads driven over:', JSON.stringify( run ) );
		assert.ok( Math.abs( run.recharge - 0.125 ) < 0.01, JSON.stringify( run ) );
		assert.deepEqual( run.small, { taken: [ [ 0.12, 0.12, true ] ], state: 'used', shown: '+12%' } );
		assert.deepEqual( run.again, { taken: [], state: 'used' } );
		assert.equal( run.relit, 'lit' );
		assert.deepEqual( run.second, [ [ 0.12, 0.12, true ] ] );
		// The big one fills what was left (the gauge refilling a little on the way to it).
		assert.equal( run.big.taken.length, 1 );
		assert.ok( run.big.taken[ 0 ][ 0 ] === 1 && run.big.taken[ 0 ][ 1 ] > 0.6 && run.big.taken[ 0 ][ 2 ], JSON.stringify( run.big ) );
		assert.ok( run.big.gauge === 1 && run.big.state === 'used', JSON.stringify( run.big ) );
		assert.deepEqual( run.full, { taken: [], state: 'lit' } );
		assert.ok( run.left );

		// A picture: a small pad and a big one on the road ahead.
		await page.evaluate( () => {

			const { driver: d, pads } = window.drive;
			pads.clear();
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, view: 0, speed: 0, gauge: 0.4 } );
			pads.place( 'small', - 1.5, 9 );
			pads.place( 'big', 3, 18 );

		} );
		await page.waitForTimeout( 600 );
		await shot( page, 'boost-pads' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'boost pads are off at first; the pause menu turns them on, kept across a reload, and off again', async () => {

		// Driven on for 5 s: whether pads are on, shown and put down, and what's kept.
		const drove = () => page.evaluate( () => {

			const { driver: d, pads } = window.drive;
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, speed: 60 / 3.6, gauge: 0.5 } );
			for ( let i = 0; i < 300; i ++ ) {

				d.update( 1 / 60 );
				pads.update( 1 / 60 );

			}

			return { enabled: pads.enabled, shown: pads.group.visible, lit: pads.pads.filter( p => p.state !== 'free' ).length, kept: localStorage.getItem( 'world-drive.pads' ) };

		} );
		const goldenGate = async () => {

			await openGlobe( page );
			await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
			await flown( page );
			await driveHere( page );

		};
		// A browser that has never switched them on (the tests before this did): off, none put down.
		await openGlobe( page );
		await page.evaluate( () => localStorage.removeItem( 'world-drive.pads' ) );
		await goldenGate();
		assert.deepEqual( await drove(), { enabled: false, shown: false, lit: 0, kept: null } );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		const toggle = page.locator( '#pause .pads-toggle' );
		assert.equal( await toggle.isChecked(), false );
		await shot( page, 'boost-pads-switch' );
		// On from the pause menu, and pads come.
		await toggle.check();
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		const on = await drove();
		assert.ok( on.enabled && on.shown && on.lit > 3 && on.kept === 'on', JSON.stringify( on ) );

		// Still on after a reload; off again from the pause menu, and they go.
		await goldenGate();
		assert.equal( await page.evaluate( () => window.drive.pads.enabled ), true );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		assert.ok( await toggle.isChecked() );
		await toggle.uncheck();
		const off = await page.evaluate( () => {

			const { pads } = window.drive;
			return { enabled: pads.enabled, shown: pads.group.visible, lit: pads.pads.filter( p => p.state !== 'free' ).length, kept: localStorage.getItem( 'world-drive.pads' ) };

		} );
		assert.deepEqual( off, { enabled: false, shown: false, lit: 0, kept: 'off' } );
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		assert.deepEqual( await drove(), { enabled: false, shown: false, lit: 0, kept: 'off' } );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

} );

// The boost and driving effects: each moment's burst (drive-bursts.js and each style's own), the
// body leaning (drive.js), the camera's jolts, speed lines and overdrive's white edges
// (screen-fx.js), the gauge pulsing and flashing (drive-hud.js), and the pause menu's "Camera
// effects" switch, with a visitor's ask for less motion. Stepped by the test, a frame at a time.
function effects( style ) {

	const { driver: d, pads, scene, renderer } = window.drive;
	const root = () => scene.getObjectByName( 'drive-fx' );
	const memory = () => {

		const materials = new Set();
		let objects = 0;
		root().traverse( o => {

			objects ++;
			if ( o.material ) materials.add( o.material );

		} );
		return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, objects, materials: materials.size };

	};
	// Boost pads switched on (they're off until they are), and only where the test puts one: none
	// put down as it drives.
	pads.enabled = true;
	let padded = false;
	const step = ( frames, each ) => {

		for ( let i = 0; i < frames; i ++ ) {

			d.update( 1 / 60 );
			if ( padded ) pads.update( 1 / 60 );
			if ( d.north > 800 ) d.north -= 1000;
			if ( Math.abs( d.east ) > 800 ) d.east = 0;
			out.most = Math.max( out.most, d.fx.particles.alive );
			each?.( i );

		}

	};
	const reset = ( speed = 0 ) => {

		for ( const code of [ ...d.keys ] ) d.release( code );
		Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftLevel: 0, boost: null, firing: false, gauge: 1, supersonic: false, nearTop: 0 } );
		pads.clear();
		step( 1 );

	};
	// What the effects were asked to do, as they're asked.
	const calls = [];
	for ( const name of [ 'ignite', 'cool', 'tier', 'turbo', 'pickup' ] ) {

		const call = d.fx[ name ].bind( d.fx );
		d.fx[ name ] = ( ...args ) => {

			calls.push( name === 'tier' || name === 'turbo' ? `${ name } ${ args[ 0 ] }` : name );
			return call( ...args );

		};

	}

	const out = { most: 0, budget: d.fx.particles.budget, style };
	reset( 15 );
	const before = memory();

	// Lit at 55 km/h: its burst, the nose kicked up, and the view jolted wider and back.
	d.press( 'KeyW' );
	step( 10 );
	d.press( 'KeyB' );
	d.release( 'KeyB' );
	let punch = 0;
	let nod = 0;
	let squat = 0;
	step( 1 );
	out.lit = { alive: d.fx.particles.alive };
	step( 20, () => {

		punch = Math.max( punch, d.punch );
		nod = Math.max( nod, d.jolts.nod.value );
		squat = Math.max( squat, d.body.pitch.value );

	} );
	Object.assign( out.lit, { punch: Math.round( punch * 10 ) / 10, nod: Math.round( nod * 1000 ) / 1000, squat: Math.round( squat * 1000 ) / 1000 } );
	// Run dry: the exhaust glows on and cools; then, a while later, nothing's left.
	d.gauge = 0.01;
	step( 2 );
	out.dry = { firing: d.firing, alive: d.fx.particles.alive };
	d.release( 'KeyW' );
	step( 150 );
	out.dry.after = d.fx.particles.alive;
	out.dry.punch = Math.round( d.punch * 1000 ) / 1000;

	// A boost pad driven over: its burst, carried along with the vehicle (its chevrons at its
	// speed), and the vehicle lit up.
	reset( 12 );
	d.gauge = 0.5;
	pads.place( 'small', 0, 6 );
	let lit = false;
	let carried = 0;
	padded = true;
	step( 60, () => {

		lit ||= root().children.some( o => o.isSprite && o.visible && o.material.depthTest === false );
		for ( const p of root().getObjectByName( 'drive-bursts' ).userData.batch.items ) if ( p.kind === 3 && p.age < p.life ) carried = Math.max( carried, p.carry.length() / d.speed );

	} );
	padded = false;
	pads.clear();
	out.pad = { lit, gauge: Math.round( d.gauge * 100 ) / 100, carried: Math.round( carried * 100 ) / 100 };
	step( 120 );

	// On its wheels, the batches fade out down to the ground under it (the test pad's is at 0);
	// in the air, they're as they are.
	const floor = () => root().getObjectByName( 'drive-bursts' ).material.uniforms.uFloor.value;
	reset( 10 );
	step( 2 );
	out.floor = { wheels: Math.round( floor().y * 100 ) / 100, at: Math.round( floor().w * 100 ) / 100 };
	Object.assign( d, { y: 3, vy: 4, grounded: false } );
	step( 1 );
	out.floor.air = floor().w > 1e5;

	// A drift held through all three charge levels and let go: a burst at each and the mini-turbo.
	reset( 16 );
	d.press( 'KeyW' );
	d.press( 'Space' );
	d.press( 'KeyD' );
	step( 170, () => d.speed = Math.max( d.speed, 16 ) );
	let roll = 0;
	step( 1, () => roll = d.body.roll.value );
	d.release( 'Space' );
	d.release( 'KeyD' );
	punch = 0;
	step( 15, () => punch = Math.max( punch, d.punch ) );
	out.drift = { roll: Math.round( roll * 1000 ) / 1000, punch: Math.round( punch * 10 ) / 10 };
	step( 120 );

	// Floored from a standstill: the rear tyres spin and smoke, for a moment.
	reset( 0 );
	d.press( 'KeyW' );
	let spin = 0;
	let smoke = 0;
	step( 20, () => {

		spin = Math.max( spin, d.wheelspin );
		smoke = Math.max( smoke, root().children.filter( o => o.isSprite && o.visible && o.material.depthTest !== false ).length );

	} );
	step( 60 );
	out.launch = { spin: Math.round( spin * 100 ) / 100, smoke, after: Math.round( d.wheelspin * 100 ) / 100 };

	// Braking hard from 80 km/h: the nose dips; turning at 50, it leans out of the turn.
	reset( 80 / 3.6 );
	d.release( 'KeyW' );
	d.press( 'KeyS' );
	let dip = 0;
	step( 30, () => dip = Math.min( dip, d.body.pitch.value ) );
	d.release( 'KeyS' );
	reset( 50 / 3.6 );
	d.press( 'KeyW' );
	d.press( 'KeyD' );
	let lean = 0;
	step( 40, () => {

		d.speed = 50 / 3.6;
		lean = Math.max( lean, d.body.roll.value );

	} );
	out.body = { dip: Math.round( dip * 1000 ) / 1000, lean: Math.round( lean * 1000 ) / 1000 };
	// Stopped dead at 90 km/h by being put somewhere else (as R does): it doesn't lurch.
	reset( 25 );
	step( 30, () => d.speed = 25 );
	d.speed = 0;
	let lurch = 0;
	step( 30, () => lurch = Math.max( lurch, Math.abs( d.body.pitch.value ) ) );
	out.body.lurch = Math.round( lurch * 1000 ) / 1000;
	reset( 0 );
	step( 120 );
	out.settled = { pitch: Math.round( d.body.pitch.value * 1e4 ) / 1e4 || 0, roll: Math.round( d.body.roll.value * 1e4 ) / 1e4 || 0, alive: d.fx.particles.alive };

	// Lit again and again for a few seconds: nothing new made, and never more alive than its budget.
	reset( 20 );
	d.press( 'KeyW' );
	for ( let i = 0; i < 12; i ++ ) {

		d.gauge = 1;
		d.press( 'KeyB' );
		d.release( 'KeyB' );
		step( 25 );
		d.gauge = 0.001;
		step( 5 );

	}

	reset( 0 );
	out.grew = Object.fromEntries( Object.entries( memory() ).filter( ( [ key, value ] ) => value !== before[ key ] ).map( ( [ key, value ] ) => [ key, `${ before[ key ] } → ${ value }` ] ) );
	out.calls = [ ...new Set( calls ) ];
	return out;

}

describe( 'World Drive boost and driving effects', () => {

	let page;

	before( async () => {

		page = await newPage();

	} );

	after( () => page?.context().close() );

	test( 'the booster lighting and running dry, a pad, a drift\'s levels and its mini-turbo each have their burst; the body leans; the view is jolted; nothing new is made', async () => {

		await page.goto( `${ BASE }/?pro=1` );
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
		await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
		await flown( page );
		await driveHere( page );
		await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
		const results = [];
		for ( const style of [ 'classic', 'confetti', 'lightning' ] ) {

			const result = await page.evaluate( async ( { style, run } ) => {

				const { createDriveFx } = await import( '/src/drive-fx.js' );
				const { driver: d } = window.drive;
				d.fx.dispose();
				d.fx = createDriveFx( d.models.group.parent, { boost: style, flame: 'orange', trail: null }, { water: true, effects: d.effects } );
				return new Function( `return ( ${ run } )( ${ JSON.stringify( style ) } )` )();

			}, { style, run: effects.toString() } );
			console.log( 'effects:', JSON.stringify( result ) );
			results.push( result );

		}

		for ( const r of results ) {

			// Each moment set its effects off.
			assert.deepEqual( [ ...r.calls ].sort(), [ 'cool', 'ignite', 'pickup', 'tier 1', 'tier 2', 'tier 3', 'turbo 3' ], JSON.stringify( r ) );
			// Lit: a burst, the view punched a few degrees wider and nodded, the nose up.
			assert.ok( r.lit.alive >= 10 && r.lit.punch >= 3 && r.lit.nod > 0.1 && r.lit.squat > 0.03, JSON.stringify( r.lit ) );
			// Run dry: it glows on, then everything's gone, the punch rung out.
			assert.ok( ! r.dry.firing && r.dry.alive > 0 && r.dry.after === 0 && r.dry.punch === 0, JSON.stringify( r.dry ) );
			assert.ok( r.pad.lit && r.pad.gauge > 0.6 && r.pad.carried > 0.95, JSON.stringify( r.pad ) );
			// The plane under it: level, a few centimetres over the pad (through its rear tyres).
			assert.ok( r.floor.wheels > 0.99 && r.floor.at < 0 && r.floor.at > - 0.2 && r.floor.air, JSON.stringify( r.floor ) );
			// Drifting right it leans out of the turn; the mini-turbo jolts the view a little.
			assert.ok( r.drift.roll > 0 && r.drift.punch > 1, JSON.stringify( r.drift ) );
			assert.ok( r.launch.spin > 0.5 && r.launch.smoke > 4 && r.launch.after === 0, JSON.stringify( r.launch ) );
			assert.ok( r.body.dip < - 0.02 && r.body.lean > 0.02 && r.body.lurch < 0.005, JSON.stringify( r.body ) );
			assert.deepEqual( r.settled, { pitch: 0, roll: 0, alive: 0 } );
			assert.deepEqual( r.grew, {}, `${ r.style } made new things` );
			assert.ok( r.most <= r.budget, `${ r.style }: ${ r.most } alive, over its budget of ${ r.budget }` );

		}

		// Paused, the effects go with the drive; driving on, they're made again.
		await page.evaluate( () => window.before = window.drive.scene.getObjectByName( 'drive-fx' ) );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		const paused = await page.evaluate( () => ( { fx: window.drive.driver.fx, root: !! window.drive.scene.getObjectByName( 'drive-fx' ), mode: window.drive.mode } ) );
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		const again = await page.evaluate( () => {

			const after = window.drive.scene.getObjectByName( 'drive-fx' );
			return !! after && after !== window.before && !! window.drive.driver.fx;

		} );
		assert.deepEqual( { ...paused, again }, { fx: null, root: false, mode: 'paused', again: true } );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'every boost style lights with a burst of its own and streams its particles while boosting: thinner on a phone, and never more for a visitor asking for less motion', async () => {

		const result = await page.evaluate( async () => {

			const { createDriveFx } = await import( '/src/drive-fx.js' );
			const { BOOST_STYLES } = await import( '/src/drive-boosts.js' );
			const { driver: d } = window.drive;
			const world = d.models.group.parent;
			const kinds = { desktop: { detail: 1, calm: false }, phone: { detail: 0.6, calm: false }, calm: { detail: 1, calm: true } };
			// Lit at 60 km/h: how many particles are alive the frame after (its burst, and the bursts
			// every style has), and after two seconds of boosting (its stream alone: the bursts are
			// gone by then).
			const run = ( style, effects ) => {

				d.fx.dispose();
				d.fx = createDriveFx( world, { boost: style, flame: 'orange', trail: null }, { effects } );
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: 60 / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftLevel: 0, boost: null, firing: false, gauge: 1, supersonic: false, nearTop: 0 } );
				d.update( 1 / 60 );
				d.fireBooster();
				d.update( 1 / 60 );
				const lit = d.fx.particles.alive;
				for ( let i = 0; i < 120; i ++ ) {

					Object.assign( d, { gauge: 1, speed: 60 / 3.6 } );
					if ( d.north > 800 ) d.north -= 1000;
					d.update( 1 / 60 );

				}

				return { lit, streaming: d.fx.particles.alive };

			};
			const out = {};
			for ( const [ kind, effects ] of Object.entries( kinds ) ) {

				// The classic flame has no particles of its own: what's alive as it lights is the bursts'.
				const bursts = run( 'classic', effects ).lit;
				for ( const style of BOOST_STYLES ) {

					const { lit, streaming } = run( style, effects );
					( out[ style ] ??= {} )[ kind ] = { own: lit - bursts, streaming };

				}

			}

			d.fx.dispose();
			d.fx = createDriveFx( world, { boost: 'classic', flame: 'orange', trail: null }, { effects: d.effects } );
			return out;

		} );
		console.log( 'boost styles lit and boosting:', JSON.stringify( result ) );
		assert.ok( Object.keys( result ).length >= 21 );
		for ( const [ style, { desktop, phone, calm } ] of Object.entries( result ) ) {

			assert.ok( desktop.own > 0 && desktop.streaming > 5, `${ style }: ${ JSON.stringify( desktop ) }` );
			assert.ok( phone.own <= desktop.own && phone.own > 0 && phone.streaming > 5, `${ style } on a phone: ${ JSON.stringify( phone ) }` );
			assert.ok( calm.own <= desktop.own && calm.own > 0 && calm.streaming > 5, `${ style }, calm: ${ JSON.stringify( calm ) }` );

		}

		// These each throw fewer on a phone (a few of the first styles' strikes and hoops are the same
		// there); for a visitor asking for less motion, the galaxy's bright core, the comet's flare, the
		// flashes at the ends of lightning's forks and in the fireworks' starburst are left out, and
		// the neon laser's starburst has half as many beams.
		for ( const style of [ 'notes', 'petals', 'afterburner', 'frost', 'galaxy', 'dragon', 'butterflies', 'spooky', 'laser', 'slime' ] ) assert.ok( result[ style ].phone.own < result[ style ].desktop.own, style );
		for ( const style of [ 'galaxy', 'comet', 'lightning', 'fireworks', 'laser' ] ) assert.ok( result[ style ].calm.own < result[ style ].desktop.own, `${ style }, calm: ${ JSON.stringify( result[ style ] ) }` );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the flame\'s cone, core and glow are drawn in the order they were made from every side (the red flame\'s and the galaxy\'s cone under their core), and their bounds hold all of the flame on any ride', async () => {

		const result = await page.evaluate( async () => {

			const { createDriveFx } = await import( '/src/drive-fx.js' );
			const { driver: d, renderer, scene, camera } = window.drive;
			const world = d.models.group.parent;
			const Vector3 = camera.position.constructor;
			const flameOf = root => root.children.find( o => o.isGroup && o.children.length === 3 && o.children[ 2 ].isSprite ).children;
			// The kart boosting at 120 km/h, seen from the chase camera's place (behind it and over it)
			// and from all round it 3.5 m out, every 30°, as the Garage's turntable shows it: the order
			// the cone, the core and the glow are drawn in from each.
			const order = {};
			for ( const [ name, look ] of [ [ 'red', { boost: 'classic', flame: 'red', trail: null } ], [ 'galaxy', { boost: 'galaxy', flame: 'orange', trail: null } ], [ 'orange', { boost: 'classic', flame: 'orange', trail: null } ] ] ) {

				d.fx.dispose();
				d.fx = createDriveFx( world, look, { effects: d.effects } );
				const parts = flameOf( world.children.at( - 1 ) );
				const drawn = [];
				parts.forEach( ( part, i ) => part.onBeforeRender = () => drawn.push( [ 'cone', 'core', 'glow' ][ i ] ) );
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftLevel: 0, boost: null, supersonic: false } );
				for ( let i = 0; i < 60; i ++ ) {

					Object.assign( d, { gauge: 1, firing: true, speed: 120 / 3.6 } );
					d.update( 1 / 60 );

				}

				const nozzle = parts[ 2 ].getWorldPosition( new Vector3() );
				const turn = d.entry.pivot.getWorldQuaternion( camera.quaternion.clone() );
				const seen = new Set();
				for ( let angle = - 1; angle < 12; angle ++ ) {

					// -1: the chase camera's place.
					const way = angle < 0 ? new Vector3( 0, 1.6, 4.2 ) : new Vector3( Math.sin( angle * Math.PI / 6 ) * 3.5, 1.2, Math.cos( angle * Math.PI / 6 ) * 3.5 );
					camera.position.copy( nozzle ).add( way.applyQuaternion( turn ) );
					camera.lookAt( nozzle );
					camera.updateMatrixWorld();
					drawn.length = 0;
					renderer.render( scene, camera );
					seen.add( drawn.join( ' > ' ) );

				}

				order[ name ] = [ ...seen ];
				for ( const part of parts ) part.onBeforeRender = () => {};

			}

			// The flame on rides from a little one to a bus, at a drift boost's power and the
			// booster's as it lights (popping): how far any corner of either cone is outside its
			// bounds as three.js places them, which frustum culling goes by.
			const pivot = new d.entry.pivot.constructor();
			world.add( pivot );
			pivot.updateMatrixWorld( true );
			let outside = - Infinity;
			for ( const [ width, height, length ] of [ [ 0.6, 0.6, 1.2 ], [ 1.2, 1, 2 ], [ 2, 1.5, 4.5 ], [ 4, 4, 12 ] ] ) for ( const power of [ 0.55, 1 ] ) {

				const fx = createDriveFx( world, { boost: 'classic', flame: 'red', trail: null } );
				const [ outer, inner ] = flameOf( world.children.at( - 1 ) );
				const size = { width, height, length, rear: length / 2, scale: 1 };
				const wheels = [ new Vector3( - width / 3, 0.05, length / 3 ), new Vector3( width / 3, 0.05, length / 3 ) ];
				fx.ignite();
				for ( let i = 0; i < 20; i ++ ) {

					fx.update( { pivot, size, wheels, velocity: new Vector3(), flame: power, trail: 0, drifting: false, level: 0, grounded: true, dt: 1 / 60 } );
					outer.parent.updateMatrixWorld( true );
					for ( const cone of [ outer, inner ] ) {

						// As three.js works them out if they've none of their own.
						if ( ! cone.geometry.boundingSphere ) cone.geometry.computeBoundingSphere();
						const ball = cone.geometry.boundingSphere.clone().applyMatrix4( cone.matrixWorld );
						const { position } = cone.geometry.attributes;
						const at = new Vector3();
						for ( let v = 0; v < position.count; v ++ ) outside = Math.max( outside, at.fromBufferAttribute( position, v ).applyMatrix4( cone.matrixWorld ).distanceTo( ball.center ) - ball.radius );

					}

				}

				fx.dispose();

			}

			world.remove( pivot );
			d.fx.dispose();
			d.fx = createDriveFx( world, { boost: 'classic', flame: 'orange', trail: null }, { effects: d.effects } );
			Object.assign( d, { firing: false, speed: 0, east: 0, north: 0, heading: 0, course: 0 } );
			d.update( 1 / 60 );
			return { order, outside };

		} );
		console.log( 'the flame\'s parts drawn, from every side:', JSON.stringify( result ) );
		for ( const name of [ 'red', 'galaxy', 'orange' ] ) assert.deepEqual( result.order[ name ], [ 'cone > core > glow' ], name );
		assert.ok( result.outside < 1e-4, `a cone is ${ result.outside } m outside its bounds` );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the fireworks light without a flash of their own for a visitor asking for less motion: their starburst and the salvo of three rockets burst into as many sparks, with no flash', async () => {

		const result = await page.evaluate( async () => {

			const { createDriveFx } = await import( '/src/drive-fx.js' );
			const { SHAPES } = await import( '/src/drive-boosts.js' );
			const { driver: d } = window.drive;
			const world = d.models.group.parent;
			const Vector3 = d.entry.pivot.position.constructor;
			// Lit on a kart that stands still with the booster off after, so no rockets stream out
			// after the salvo: over the first half second, every flash (only the fireworks' bursts have
			// one) and every spark of a burst, each counted once.
			const pivot = new d.entry.pivot.constructor();
			world.add( pivot );
			pivot.updateMatrixWorld( true );
			const size = { width: 1.2, height: 1, length: 2, rear: 1, scale: 1 };
			const wheels = [ new Vector3( - 0.5, 0.05, 0.6 ), new Vector3( 0.5, 0.05, 0.6 ) ];
			const run = calm => {

				const fx = createDriveFx( world, { boost: 'fireworks', flame: 'orange', trail: null }, { effects: { detail: 1, calm } } );
				const root = world.children.at( - 1 );
				const batches = [];
				root.traverse( o => o.userData.batch && batches.push( o.userData.batch ) );
				const flashes = new Set();
				const sparks = new Set();
				fx.ignite();
				for ( let i = 0; i < 30; i ++ ) {

					fx.update( { pivot, size, wheels, velocity: new Vector3(), flame: 0, trail: 0, drifting: false, level: 0, grounded: true, dt: 1 / 60 } );
					for ( const batch of batches ) for ( const p of batch.items ) {

						if ( p.age >= p.life ) continue;
						if ( p.frame === SHAPES.burst ) flashes.add( p );
						if ( p.frame === SHAPES.star ) sparks.add( p );

					}

				}

				fx.dispose();
				return { flashes: flashes.size, sparks: sparks.size };

			};
			const out = { desktop: run( false ), calm: run( true ) };
			world.remove( pivot );
			return out;

		} );
		console.log( 'fireworks lit, the first half second:', JSON.stringify( result ) );
		// The starburst and three rockets, each a ball of 14 sparks round a flash; calm, the same
		// sparks and no flash at all.
		assert.deepEqual( result, { desktop: { flashes: 4, sparks: 56 }, calm: { flashes: 0, sparks: 56 } } );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'a ribbon trail pinned against a wall, boosting with W held, folds up behind the kart: it isn\'t drawn out as on the Garage\'s turntable', async () => {

		const result = await page.evaluate( async () => {

			const { createDriveFx } = await import( '/src/drive-fx.js' );
			const { driver: d, ground } = window.drive;
			const world = d.models.group.parent;
			const Vector3 = d.entry.pivot.position.constructor;
			// A wall 60 m wide and 6 m high across the road, 30 m north (as the stunts test has it), and
			// the kart 2 cm off it with the neon streak, boosting with W held for a second and a half:
			// once it's up against it, pressing on into it stops it there every frame.
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh );
			const wall = land.clone();
			wall.material = land.material.clone();
			wall.material.side = 2;
			wall.rotation.set( 0, 0, 0 );
			wall.scale.set( 60 / 4000, 6 / 2000, 1 );
			wall.position.set( 0, 3, 30 );
			pad.add( wall );
			wall.updateMatrixWorld();
			d.fx.dispose();
			d.fx = createDriveFx( world, { boost: 'classic', flame: 'orange', trail: { kind: 'neon', colour: 0xffffff } }, { effects: d.effects } );
			const root = world.children.at( - 1 );
			let ribbon = null;
			root.traverse( o => ribbon ??= o.geometry?.attributes.color?.itemSize === 4 ? o : null );
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { east: 0, north: 30 - d.front - 0.02, y: 0, heading: 0, course: 0, view: 0, speed: 0, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftLevel: 0, boost: null, supersonic: false } );
			d.press( 'KeyW' );
			let from = 0;
			let fastest = 0;
			for ( let i = 0; i < 90; i ++ ) {

				Object.assign( d, { gauge: 1, firing: true } );
				d.update( 1 / 60 );
				// Its last second, pinned there.
				if ( i === 29 ) from = d.north;
				if ( i >= 30 ) fastest = Math.max( fastest, Math.abs( d.speed ) );

			}

			// How far back what's drawn reaches, along the kart (its +Z).
			const { index, attributes: { position } } = ribbon.geometry;
			const at = new Vector3();
			let near = Infinity;
			let far = - Infinity;
			for ( let i = 0; i < ribbon.geometry.drawRange.count; i ++ ) {

				const { z } = d.entry.pivot.worldToLocal( at.fromBufferAttribute( position, index.getX( i ) ) );
				near = Math.min( near, z );
				far = Math.max( far, z );

			}

			const out = { shown: ribbon.visible && ribbon.geometry.drawRange.count > 0, fastest, moved: Math.abs( d.north - from ), reach: Math.round( ( far - near ) * 100 ) / 100 };
			d.release( 'KeyW' );
			Object.assign( d, { firing: false, speed: 0 } );
			pad.remove( wall );
			d.fx.dispose();
			d.fx = createDriveFx( world, { boost: 'classic', flame: 'orange', trail: null }, { effects: d.effects } );
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0 } );
			d.update( 1 / 60 );
			return out;

		} );
		console.log( 'the neon streak pinned against a wall:', JSON.stringify( result ) );
		// Held there, it's drawn, but laid in one spot behind the kart rather than streaming 3.5 m
		// back as on the turntable (see test-drive-pro-ui.mjs).
		assert.ok( result.shown && result.fastest < 0.05 && result.moved < 0.05, JSON.stringify( result ) );
		assert.ok( result.reach < 0.3, `the neon streak reaches ${ result.reach } m behind a kart that isn't going anywhere` );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the underglow: on the ground under the kart and round it, left out of its size; through a bump it stays, off the ground and flying it fades out, and it\'s back as it lands', async () => {

		const result = await page.evaluate( async () => {

			const { applyLook, lookFor } = await import( '/src/drive-app/paint.js' );
			const { liftGlow, setUnderglow } = await import( '/src/drive-app/underglow.js' );
			const { FLAGS } = await import( '/src/drive-app/live-protocol.js' );
			const { driver: d, entry } = window.drive;
			const kart = { id: 'go-kart', colour: 'blaze' };
			// Frames drawn (and the glow eased, as main.js does each) until `done`, for at most `seconds`
			// (the software renderer's frames come slowly).
			const until = async ( done, seconds ) => {

				const end = performance.now() + seconds * 1000;
				while ( ! done() && performance.now() < end ) await new Promise( requestAnimationFrame );

			};
			const round = v => Math.round( v * 100 ) / 100;
			const out = {};
			// Put on, it's left out of the kart's box (as drive.js and the others measure it).
			const Box3 = entry.footprint.constructor;
			const plain = new Box3().setFromObject( entry.pivot );
			applyLook( entry.pivot, { ...lookFor( kart ), glow: 'ice' }, kart );
			const glow = entry.pivot.userData.glow;
			out.same = new Box3().setFromObject( entry.pivot ).equals( plain );
			out.drawn = { parent: glow.parent === entry.pivot, additive: glow.material.blending === 2, depthWrite: glow.material.depthWrite, picture: !! glow.material.map };
			// Its points: the kart's footprint and as far again all round, just over the ground (measured
			// unturned, as drive.js measures the kart).
			const turn = entry.pivot.quaternion.clone();
			entry.pivot.quaternion.identity();
			entry.pivot.updateMatrixWorld( true );
			const own = new Box3().setFromObject( entry.pivot );
			const spread = new Box3().setFromBufferAttribute( glow.geometry.attributes.position ).applyMatrix4( glow.matrixWorld );
			entry.pivot.quaternion.copy( turn );
			entry.pivot.updateMatrixWorld( true );
			out.spread = [ own.min.x - spread.min.x, spread.max.x - own.max.x, own.min.z - spread.min.z, spread.max.z - own.max.z ].map( round );
			out.over = round( spread.min.y - own.min.y );
			await until( () => false, 0.5 );
			out.driving = { visible: glow.visible, lift: round( glow.userData.lift ) };
			// Flying, 40 m up (gliding down at 3 m/s): gone in about a second.
			const ground = { y: d.y };
			Object.assign( d, { y: d.y + 40, vy: 0, flying: true, grounded: false, air: null } );
			await until( () => glow.userData.lift === 0, 8 );
			out.flying = { visible: glow.visible, lift: round( glow.userData.lift ), flying: d.flying };
			Object.assign( d, { y: ground.y, vy: 0, flying: false, grounded: true, air: null } );
			await until( () => glow.userData.lift >= 0.995, 5 );
			out.landed = { visible: glow.visible, lift: round( glow.userData.lift ) };

			// The same by what a car's flags say (as a ghost's are), on one of its own: a bump (0.2 s off the
			// ground) leaves it be; a jump fades it out; down again it's back; sinking in water, gone.
			const other = new entry.pivot.constructor();
			other.add( entry.pivot.children[ 0 ].clone() );
			setUnderglow( other, 0xff2bc4 );
			const lift = ( flags, seconds ) => {

				for ( let t = 0; t < seconds - 1e-6; t += 0.05 ) liftGlow( other, flags, 0.05 );
				return round( other.userData.glow.userData.lift );

			};
			out.flags = [ lift( FLAGS.air, 0.2 ), lift( FLAGS.air, 0.4 ), lift( FLAGS.air, 0.6 ), lift( FLAGS.grounded, 0.8 ), lift( FLAGS.splash, 1 ), lift( FLAGS.paused | FLAGS.grounded, 0.8 ), lift( FLAGS.flying, 1.2 ) ];
			out.hidden = ! other.userData.glow.visible;
			// None takes it away.
			applyLook( entry.pivot, lookFor( kart ), kart );
			out.none = entry.pivot.userData.glow ?? null;
			return out;

		} );
		assert.equal( result.same, true );
		assert.deepEqual( result.drawn, { parent: true, additive: true, depthWrite: false, picture: true } );
		assert.ok( result.spread.every( side => side >= 0.55 && side <= 0.7 ), JSON.stringify( result ) );
		assert.ok( result.over > 0.03 && result.over < 0.08, JSON.stringify( result ) );
		assert.deepEqual( result.driving, { visible: true, lift: 1 } );
		assert.deepEqual( result.flying, { visible: false, lift: 0, flying: true } );
		assert.deepEqual( result.landed, { visible: true, lift: 1 } );
		// 0.2 s up: all of it; 0.6 s: fading; 1.2 s: gone; down: back; in water: gone; parked: back.
		const [ bump, fading, gone, back, water, parked, flown ] = result.flags;
		assert.ok( bump === 1 && fading > 0 && fading < 1 && gone === 0 && back > 0.95 && water === 0 && parked > 0.95 && flown === 0 && result.hidden, JSON.stringify( result.flags ) );
		assert.equal( result.none, null );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'boosting: speed lines thicken with the speed, overdrive flashes the edges of the view white, and the gauge pulses full, flashes run dry and fills up from a pad', async () => {

		await page.evaluate( () => window.untilFrame = ( done, most = 600 ) => new Promise( resolve => {

			let left = most;
			const frame = () => done() || -- left <= 0 ? resolve() : requestAnimationFrame( frame );
			requestAnimationFrame( frame );

		} ) );
		const run = await page.evaluate( async () => {

			const { driver: d, screenFx, scene, pads } = window.drive;
			const lines = scene.getObjectByName( 'speed-lines' );
			const bar = document.querySelector( '#hud .dhud-boost' );
			const whiteout = document.getElementById( 'whiteout' );
			const top = d.spec.topSpeed / 3.6 * 2;
			for ( const code of [ ...d.keys ] ) d.release( code );
			const out = {};
			// Driving at 80 km/h, no lines.
			// (Overdrive's view, from the tests before, eases out: it's put straight.)
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, view: 0, speed: 80 / 3.6, gauge: 1, firing: false, boost: null, supersonic: false, nearTop: 0, warp: 0 } );
			const hold = speed => () => {

				d.speed = speed;
				if ( d.north > 800 ) d.north -= 1000;

			};
			await window.untilFrame( () => ( hold( 80 / 3.6 )(), false ), 20 );
			await window.untilFrame( () => ( hold( 80 / 3.6 )(), screenFx.lines === 0 ), 120 );
			out.cruising = { lines: screenFx.lines, shown: lines.visible, ready: bar.classList.contains( 'ready' ), pulse: getComputedStyle( bar.querySelector( '.dhud-bar' ) ).animationName };
			// Boosting at 70 % of the booster's top, then at its top: thicker.
			d.firing = true;
			await window.untilFrame( () => {

				hold( top * 0.6 )();
				d.gauge = 0.9;
				return false;

			}, 30 );
			out.boosting = { lines: Math.round( screenFx.lines * 100 ) / 100, shown: lines.visible };
			let white = false;
			await window.untilFrame( () => {

				hold( top )();
				d.gauge = 0.9;
				white ||= whiteout.classList.contains( 'on' );
				return d.supersonic && white;

			} );
			out.overdrive = { lines: Math.round( screenFx.lines * 100 ) / 100, white, supersonic: d.supersonic };
			// Run dry: the gauge flashes.
			d.gauge = 0.004;
			let empty = false;
			await window.untilFrame( () => ( empty ||= bar.classList.contains( 'empty' ) ), 60 );
			out.dry = { empty, firing: d.firing };
			// A pad tops it up: it fills before your eyes, with a shine along it.
			Object.assign( d, { speed: 12, gauge: 0.4, supersonic: false, firing: false } );
			d.hud.setSupersonic( false );
			pads.enabled = true;
			pads.clear();
			pads.place( 'small', 0, d.north + 5 );
			let refill = null;
			await window.untilFrame( () => {

				d.speed = 12;
				if ( bar.classList.contains( 'refuel' ) ) refill = getComputedStyle( bar.querySelector( '.dhud-bar i' ) ).transitionProperty;
				return !! refill;

			}, 200 );
			out.refill = refill;
			// Slowed right down: the lines go.
			await window.untilFrame( () => ( d.speed = 5, screenFx.lines === 0 ), 300 );
			out.slow = { lines: screenFx.lines, shown: lines.visible };
			d.gauge = 1;
			await window.untilFrame( () => bar.classList.contains( 'ready' ), 60 );
			out.full = { ready: bar.classList.contains( 'ready' ), pulse: getComputedStyle( bar.querySelector( '.dhud-bar' ) ).animationName };
			return out;

		} );
		console.log( 'speed lines and the gauge:', JSON.stringify( run ) );
		assert.deepEqual( run.cruising, { lines: 0, shown: false, ready: true, pulse: 'dhud-ready' } );
		assert.ok( run.boosting.lines > 0.2 && run.boosting.shown, JSON.stringify( run.boosting ) );
		assert.ok( run.overdrive.supersonic && run.overdrive.white && run.overdrive.lines > run.boosting.lines, JSON.stringify( run.overdrive ) );
		assert.deepEqual( run.dry, { empty: true, firing: false } );
		assert.match( run.refill ?? '', /width/ );
		assert.deepEqual( run.slow, { lines: 0, shown: false } );
		assert.deepEqual( run.full, { ready: true, pulse: 'dhud-ready' } );
		await shot( page, 'effects-gauge' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the pause menu\'s "Camera effects" switch turns off the jolts, shakes, speed lines and white edges, kept across a reload, and on again', async () => {

		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		const toggle = page.locator( '#pause .camera-toggle' );
		assert.ok( await toggle.isChecked() );
		await shot( page, 'effects-switch' );
		await toggle.uncheck();
		assert.deepEqual( await page.evaluate( () => ( { motion: window.drive.driver.motion, enabled: window.drive.screenFx.enabled, kept: localStorage.getItem( 'world-drive.camera-fx' ) } ) ), { motion: false, enabled: false, kept: 'off' } );
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		const still = page => page.evaluate( async () => {

			const { driver: d, screenFx } = window.drive;
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, view: 0, speed: 20, gauge: 1, firing: false, boost: null, supersonic: false, nearTop: 0, shake: 0 } );
			const top = d.spec.topSpeed / 3.6 * 2;
			const out = { punch: 0, nod: 0, lines: 0, white: false, burst: 0 };
			d.press( 'KeyB' );
			out.burst = d.fx.particles.alive;
			await window.untilFrame( () => {

				d.gauge = 1;
				d.speed = top;
				if ( d.north > 800 ) d.north -= 1000;
				out.punch = Math.max( out.punch, Math.abs( d.punch ) );
				out.nod = Math.max( out.nod, Math.abs( d.jolts.nod.value ) );
				out.lines = Math.max( out.lines, screenFx.lines );
				out.white ||= document.getElementById( 'whiteout' ).classList.contains( 'on' );
				return d.supersonic && false;

			}, 90 );
			out.supersonic = d.supersonic;
			out.burst = d.fx.particles.alive > 0;
			d.firing = false;
			d.gauge = 1;
			d.speed = 0;
			return out;

		} );
		const off = await still( page );
		console.log( 'camera effects off:', JSON.stringify( off ) );
		// Still the bursts in the world, but nothing done to the view.
		assert.deepEqual( off, { punch: 0, nod: 0, lines: 0, white: false, burst: true, supersonic: true } );

		// Still off after a reload; on again from the pause menu.
		await page.goto( `${ BASE }/?pro=1` );
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
		await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
		await flown( page );
		await driveHere( page );
		assert.equal( await page.evaluate( () => window.drive.driver.motion ), false );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		assert.equal( await toggle.isChecked(), false );
		await toggle.check();
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		assert.deepEqual( await page.evaluate( () => ( { motion: window.drive.driver.motion, kept: localStorage.getItem( 'world-drive.camera-fx' ) } ) ), { motion: true, kept: 'on' } );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'asking for less motion: no jolts, shakes, speed lines or white edges whatever the switch says, fewer flashes, a steady gauge', async () => {

		const calm = await newPage( { reducedMotion: 'reduce' } );
		try {

			await calm.goto( `${ BASE }/?pro=1` );
			await calm.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
			await calm.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
			await flown( calm );
			await driveHere( calm );
			await calm.evaluate( () => window.untilFrame = ( done, most = 600 ) => new Promise( resolve => {

				let left = most;
				const frame = () => done() || -- left <= 0 ? resolve() : requestAnimationFrame( frame );
				requestAnimationFrame( frame );

			} ) );
			const run = await calm.evaluate( async () => {

				const { driver: d, pads, scene } = window.drive;
				const out = { motion: d.motion, calm: d.effects.calm, switch: document.querySelector( '#pause .camera-toggle' ).checked };
				for ( const code of [ ...d.keys ] ) d.release( code );
				// A hard hit's shake isn't put on the view.
				Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, view: 0, speed: 12, gauge: 0.4, firing: false, boost: null, supersonic: false, nearTop: 0 } );
				d.shake = 0.6;
				const look = new window.drive.camera.position.constructor();
				d.placeCamera( 0 );
				window.drive.camera.getWorldDirection( look );
				const shaken = look.clone();
				d.shake = 0;
				d.placeCamera( 0 );
				window.drive.camera.getWorldDirection( look );
				out.shaken = Math.round( shaken.angleTo( look ) * 1e4 ) / 1e4;
				// A pad's burst, without lighting the vehicle up.
				pads.enabled = true;
				pads.clear();
				pads.place( 'small', 0, d.north + 5 );
				let lit = false;
				let burst = 0;
				for ( let i = 0; i < 60; i ++ ) {

					d.speed = 12;
					d.update( 1 / 60 );
					pads.update( 1 / 60 );
					burst = Math.max( burst, d.fx.particles.alive );
					lit ||= scene.getObjectByName( 'drive-fx' ).children.some( o => o.isSprite && o.visible && o.material.depthTest === false );

				}

				Object.assign( out, { lit, burst } );
				d.gauge = 1;
				await window.untilFrame( () => document.querySelector( '#hud .dhud-boost' ).classList.contains( 'ready' ), 60 );
				out.pulse = getComputedStyle( document.querySelector( '#hud .dhud-boost .dhud-bar' ) ).animationName;
				return out;

			} );
			const off = await calm.evaluate( async () => {

				const { driver: d, screenFx } = window.drive;
				const top = d.spec.topSpeed / 3.6 * 2;
				const out = { punch: 0, lines: 0, white: false };
				Object.assign( d, { speed: top, gauge: 1, firing: false } );
				d.press( 'KeyB' );
				await window.untilFrame( () => {

					d.gauge = 1;
					d.speed = top;
					if ( d.north > 800 ) d.north -= 1000;
					out.punch = Math.max( out.punch, Math.abs( d.punch ) );
					out.lines = Math.max( out.lines, screenFx.lines );
					out.white ||= document.getElementById( 'whiteout' ).classList.contains( 'on' );
					return false;

				}, 90 );
				out.supersonic = d.supersonic;
				d.firing = false;
				d.speed = 0;
				return out;

			} );
			console.log( 'less motion:', JSON.stringify( { ...run, ...off } ) );
			assert.deepEqual( run, { motion: false, calm: true, switch: true, shaken: 0, lit: false, burst: run.burst, pulse: 'none' } );
			assert.ok( run.burst > 10, JSON.stringify( run ) );
			assert.deepEqual( off, { punch: 0, lines: 0, white: false, supersonic: true } );
			assert.deepEqual( calm.errors, [] );

		} finally {

			await calm.context().close();

		}

	} );

	test( 'the sonic boom\'s rings keep up with the vehicle, so they never white out the view; asking for less motion it has no flare, nor has the Garage\'s ▶ Boost', async () => {

		const calm = await newPage( { reducedMotion: 'reduce' } );
		try {

			await calm.goto( `${ BASE }/?pro=1` );
			await calm.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
			// The Garage's turntable has driving's effects: lit, no flare for this visitor.
			await calm.evaluate( () => window.drive.garage.open() );
			await calm.waitForFunction( () => window.drive.garage.preview?.model && window.drive.garage.preview.fx, null, { timeout: 20000 } );
			const garage = await calm.evaluate( async () => {

				const { SHAPES } = await import( '/src/drive-boosts.js' );
				const { preview } = window.drive.garage;
				let scene = preview.model;
				while ( scene.parent ) scene = scene.parent;
				const batches = [];
				scene.getObjectByName( 'drive-fx' ).traverse( o => o.userData.batch && batches.push( o.userData.batch ) );
				preview.boost();
				let flares = 0;
				let alive = 0;
				for ( let i = 0; i < 20; i ++ ) {

					await new Promise( resolve => requestAnimationFrame( resolve ) );
					alive = Math.max( alive, preview.fx.particles.alive );
					for ( const batch of batches ) for ( const p of batch.items ) if ( p.age < p.life && p.frame === SHAPES.flare ) flares ++;

				}

				return { alive, flares };

			} );
			assert.ok( garage.alive > 5 && garage.flares === 0, JSON.stringify( garage ) );
			await calm.keyboard.press( 'Escape' );

			await calm.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
			await flown( calm );
			await driveHere( calm );
			const boom = await calm.evaluate( async () => {

				const { SHAPES, FLAT } = await import( '/src/drive-boosts.js' );
				const { driver: d, renderer, scene, camera, screenFx } = window.drive;
				// Frame by frame by hand, each read back off the canvas.
				renderer.setAnimationLoop( null );
				const gl = renderer.getContext();
				const pixels = new Uint8Array( gl.drawingBufferWidth * gl.drawingBufferHeight * 4 );
				const bright = () => {

					gl.readPixels( 0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels );
					let count = 0;
					for ( let i = 0; i < pixels.length; i += 16 ) if ( ( 0.2126 * pixels[ i ] + 0.7152 * pixels[ i + 1 ] + 0.0722 * pixels[ i + 2 ] ) / 255 > 0.9 ) count ++;
					return Math.round( count / ( pixels.length / 16 ) * 100 );

				};
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, view: 0, speed: 20, gauge: 1, firing: false, boost: null, supersonic: false, nearTop: 0, warp: 0 } );
				for ( let i = 0; i < 120; i ++ ) d.update( 1 / 60 );
				const top = d.spec.topSpeed / 3.6 * 2;
				d.press( 'KeyW' );
				d.press( 'KeyB' );
				const tick = () => {

					d.speed = top;
					d.gauge = 1;
					d.update( 1 / 60 );
					screenFx.update( 1 / 60, true );

				};
				for ( let i = 0; i < 400 && ! d.supersonic; i ++ ) tick();
				const batches = [];
				scene.getObjectByName( 'drive-fx' ).traverse( o => o.userData.batch && batches.push( o.userData.batch ) );
				const fresh = batches.flatMap( batch => batch.items.filter( p => p.age < p.life && p.age < 0.05 ) );
				const rings = fresh.filter( p => p.mode === FLAT && ( p.frame === SHAPES.shock || p.frame === SHAPES.ring ) );
				const out = { supersonic: d.supersonic, rings: rings.length, kept: Math.round( Math.min( ...rings.map( p => p.carry.length() ) ) / top * 100 ) / 100, flares: fresh.filter( p => p.frame === SHAPES.flare ).length, frames: [] };
				for ( let k = 0; k < 24; k ++ ) {

					tick();
					camera.fov = 70 + 9 * d.warp + d.punch;
					camera.updateProjectionMatrix();
					renderer.render( scene, camera );
					out.frames.push( bright() );

				}

				d.release( 'KeyB' );
				d.release( 'KeyW' );
				return out;

			} );
			console.log( 'sonic boom:', JSON.stringify( boom ) );
			// Its four rings carried at 0.97 of the speed, so the camera is never inside one.
			assert.ok( boom.supersonic && boom.rings === 4 && boom.kept > 0.95 && boom.flares === 0, JSON.stringify( boom ) );
			// With them falling back through the camera the view went near white (over 50 % of it) for 6 frames, twice.
			assert.ok( Math.max( ...boom.frames ) < 50, `the view went white: ${ boom.frames.join( ' ' ) }` );
			assert.deepEqual( calm.errors, [] );

		} finally {

			await calm.context().close();

		}

	} );

	test( 'on a phone, the bursts are thinner and there are half as many speed lines', async () => {

		const phone = await newPage( { viewport: { width: 390, height: 844 }, touch: true } );
		try {

			await phone.goto( `${ BASE }/?pro=1` );
			await phone.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
			await phone.evaluate( () => window.drive.dropIn( { name: 'Test pad', lat: 37.8199, lon: - 122.4783, height: 0 } ) );
			await phone.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
			const run = await phone.evaluate( async () => {

				const { driver: d, scene } = window.drive;
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, view: 0, speed: d.spec.topSpeed / 3.6 * 1.6, gauge: 1, firing: false, boost: null } );
				d.press( 'KeyB' );
				await new Promise( resolve => setTimeout( resolve, 600 ) );
				return { detail: d.effects.detail, lines: scene.getObjectByName( 'speed-lines' ).geometry.instanceCount, shown: scene.getObjectByName( 'speed-lines' ).visible };

			} );
			assert.deepEqual( run, { detail: 0.6, lines: 24, shown: true } );
			await shot( phone, 'effects-phone' );
			assert.deepEqual( phone.errors, [] );

		} finally {

			await phone.context().close();

		}

	} );

} );

// Water on the test pad. water.js tells water from ground by how Google draws it: level, one even
// colour, the lowest thing round about. The pad's sea (2 m below its land, south of north = -280)
// is all of that once it has a picture of one sea colour, as Google's water has (Sydney Harbour's,
// measured); slabs cut from the pad make a ramp up to its edge and a beach down into it. In the
// page as window.waterKit, the driver stepped at a fixed rate as the stunts test steps it.
async function setUpWater( page ) {

	await page.evaluate( () => {

		const { driver: d, ground, pads, scene } = window.drive;
		const pad = ground.getColliders()[ 0 ];
		const land = pad.children.find( child => child.isMesh );
		const sea = pad.children.find( child => child.isMesh && child.position.y < - 1 );
		if ( ! sea.material.map ) {

			const canvas = Object.assign( document.createElement( 'canvas' ), { width: 64, height: 64 } );
			const ctx = canvas.getContext( '2d' );
			ctx.fillStyle = 'rgb(45,76,95)';
			ctx.fillRect( 0, 0, 64, 64 );
			// The page's own three.js, by way of the pads' pictures.
			const disc = pads.group.children[ 0 ].material;
			const map = new disc.map.constructor( canvas );
			map.colorSpace = disc.map.colorSpace;
			sea.material = new disc.constructor( { map } );

		}

		const $ = selector => document.querySelector( `#hud ${ selector }` );
		window.waterKit = {

			// A slab cut from the pad, `wide` by `long` m, its middle at ( east, north, up ), tilted
			// `tilt` rad (more than 0 rising to the south).
			slab( wide, long, east, north, up, tilt ) {

				const slab = land.clone();
				slab.material = land.material.clone();
				slab.scale.set( wide / 4000, long / 2000, 1 );
				slab.rotation.set( - Math.PI / 2 + tilt, 0, 0 );
				slab.position.set( - east, up, north );
				pad.add( slab );
				slab.updateMatrixWorld();
				return slab;

			},

			remove( slab ) {

				pad.remove( slab );

			},

			// At ( 0, north ) on whatever is there, facing `heading` at `kmh`.
			reset( north, heading, kmh = 0 ) {

				for ( const code of [ ...d.keys ] ) d.release( code );
				const y = d.groundAt( 0, north, 10 );
				Object.assign( d, { east: 0, north, y, heading, course: heading, view: heading, speed: kmh / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftHop: false, boost: null, firing: false, wetIn: 0, onWater: false, mult: 1 } );
				d.lastSafe = { east: 0, north, y };
				d.lastBase = null;
				d.update( 1 / 60 );

			},

			// Driven at a fixed step for `seconds`, or until `each` says false.
			step( seconds, each ) {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					if ( each?.() === false ) return;

				}

			},

			// What the HUD says: a word popped up (a hit's), the message and the tricks line.
			hud: () => ( {
				pop: $( '.dhud-pop' )?.textContent ?? null,
				flash: $( '.dhud-flash' ).hidden ? null : $( '.dhud-flash' ).textContent,
				tricks: $( '.dhud-tricks' ).hidden ? null : $( '.dhud-tricks' ).textContent,
			} ),

			// Sprites (spray, smoke, sparks) and foam on the water (flat quads) showing.
			fx() {

				const root = scene.getObjectByName( 'drive-fx' );
				const shown = root ? root.children.filter( o => o.visible ) : [];
				return { sprites: shown.filter( o => o.isSprite ).length, foam: shown.filter( o => o.isMesh && o.geometry.type === 'PlaneGeometry' ).length };

			},

		};

	} );

}

describe( 'World Drive water', () => {

	let page;

	before( async () => {

		page = await newPage();
		await openGlobe( page );
		await page.locator( '.spots button', { hasText: 'Neptune Terminals' } ).click();
		await flown( page );
		await driveHere( page );
		await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
		await setUpWater( page );

	} );

	after( () => page?.context().close() );

	test( 'off the edge into water, at speed and slowly: down onto its surface and on across it as on the ground, never sinking, splashing or put back', async () => {

		const result = await page.evaluate( () => {

			const { driver: d, water } = window.drive;
			const kit = window.waterKit;
			const out = { seaIsWater: water.at( 0, - 340, - 1 ), landIsWater: water.at( 0, - 200, 0 ) };
			// From ( 0, north ) south off the edge at `kmh` (held to `most`), the gas down, for
			// `seconds`: how low it went over the water, whether it was ever put back (a metre or more
			// north again in a frame), what the HUD said and the foam on the water.
			const off = ( north, kmh, most, seconds ) => {

				kit.reset( north, 180, kmh );
				d.press( 'KeyW' );
				const run = { flew: 0, low: Infinity, back: false, foam: 0, words: new Set() };
				let was = d.north;
				kit.step( seconds, () => {

					d.speed = Math.min( d.speed, most / 3.6 );
					if ( ! d.grounded || d.air ) run.flew += 1 / 60;
					if ( d.north < - 281 ) run.low = Math.min( run.low, d.y );
					if ( d.north > was + 1 ) run.back = true;
					was = d.north;
					const { pop, flash } = kit.hud();
					for ( const word of [ pop, flash ] ) if ( word ) run.words.add( word );
					run.foam = Math.max( run.foam, kit.fx().foam );

				} );
				d.release( 'KeyW' );
				return { ...run, words: [ ...run.words ], north: d.north, y: d.y, kmh: d.speed * 3.6, heading: d.heading, grounded: d.grounded && ! d.air, wet: water.at( d.east, d.north, d.y ) };

			};
			out.fast = off( - 200, 70, 200, 6 );
			out.slow = off( - 268, 14, 14, 8 );
			return out;

		} );
		console.log( 'water, off the edge:', JSON.stringify( result ) );
		assert.ok( result.seaIsWater !== null && Math.abs( result.seaIsWater + 2 ) < 0.01, 'the sea isn\'t water' );
		assert.equal( result.landIsWater, null );
		for ( const run of [ result.fast, result.slow ] ) {

			// Out over the water, on its surface: never under it, never back on the land.
			assert.ok( run.north < - 290 && run.grounded && Math.abs( run.y + 2 ) < 0.01 && run.low > - 2.01, JSON.stringify( run ) );
			assert.ok( run.wet !== null && Math.abs( run.wet + 2 ) < 0.01 && ! run.back, JSON.stringify( run ) );
			// Still going the way it went, with no splash's word, foam or "Back on dry land" (only
			// how long it was in the air off the edge, and the hint the first time it's in the air).
			assert.ok( Math.abs( ( run.heading % 360 + 360 ) % 360 - 180 ) < 5 && run.foam === 0, JSON.stringify( run ) );
			assert.ok( run.words.every( word => / s air$|^In the air: /.test( word ) ), JSON.stringify( run.words ) );

		}

		// At speed it flies off the edge and drives on far out; slowly it drops off and drives on.
		assert.ok( result.fast.flew > 0.3 && result.fast.north < - 330 && result.fast.kmh > 60, JSON.stringify( result.fast ) );
		assert.ok( result.slow.kmh > 13, JSON.stringify( result.slow ) );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'off a ramp over the water: a spin in the air comes down on the water and scores, as on the ground', async () => {

		const result = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const kit = window.waterKit;
			// 14 m long, rising 2.8 m to the edge.
			const ramp = kit.slab( 8, 14, 0, - 280 + 7 * Math.cos( 0.2 ), 7 * Math.sin( 0.2 ), 0.2 );
			kit.reset( - 230, 180, 80 );
			Object.assign( d, { mult: 3, lastTrick: d.clock, score: 5000 } );
			d.press( 'KeyW' );
			let top = 0, spun = false, landed = null;
			kit.step( 8, () => {

				top = Math.max( top, d.y );
				if ( d.air && ! spun && d.north < - 281 ) {

					d.release( 'KeyW' );
					d.press( 'KeyA' );
					spun = true;

				}

				if ( spun && ! d.air && d.grounded ) {

					landed = { north: d.north, y: d.y };
					return false;

				}

			} );
			d.release( 'KeyA' );
			const out = { top, spun, landed, score: d.score, hud: kit.hud() };
			kit.remove( ramp );
			return out;

		} );
		console.log( 'water, off a ramp:', JSON.stringify( result ) );
		assert.ok( result.top > 2.5 && result.spun && result.landed && result.landed.north < - 290 && Math.abs( result.landed.y + 2 ) < 0.01, JSON.stringify( result ) );
		// Landed: the spin it did pays out, and the score it had goes up.
		assert.ok( /Spin!/.test( result.hud.tricks ) && /\+/.test( result.hud.tricks ) && ! /lost/.test( result.hud.tricks ), JSON.stringify( result.hud ) );
		assert.ok( result.score > 5000, JSON.stringify( result ) );

	} );

	test( 'slowly down a beach into the sea, out across the water and back up the beach onto the land', async () => {

		const result = await page.evaluate( () => {

			const { driver: d, water } = window.drive;
			const kit = window.waterKit;
			// 20 m wide, from the land's edge down into the sea (under it from north = -300).
			const beach = kit.slab( 20, 40, 0, - 300, - 2, - 0.1 );
			const drive = ( seconds, until ) => {

				d.press( 'KeyW' );
				let low = Infinity;
				kit.step( seconds, () => {

					d.speed = Math.min( d.speed, 11 / 3.6 );
					low = Math.min( low, d.y );
					return ! until();

				} );
				d.release( 'KeyW' );
				return { north: d.north, y: d.y, low, wet: water.at( d.east, d.north, d.y ), flash: kit.hud().flash };

			};
			kit.reset( - 262, 180, 11 );
			const out = drive( 30, () => d.north < - 330 );
			// Turned round out there, and back.
			Object.assign( d, { heading: 0, course: 0, view: 0, speed: 0 } );
			out.back = drive( 30, () => d.north > - 262 );
			kit.remove( beach );
			return out;

		} );
		console.log( 'water, off a beach and back:', JSON.stringify( result ) );
		// Out past the beach's foot, on the water's surface, never under it.
		assert.ok( result.north < - 330 && Math.abs( result.y + 2 ) < 0.01 && result.low > - 2.01 && Math.abs( result.wet + 2 ) < 0.01, JSON.stringify( result ) );
		// Back up the beach onto the land, dry, driven all the way.
		assert.ok( result.back.north > - 262 && Math.abs( result.back.y ) < 0.05 && result.back.wet === null && result.back.low > - 2.01, JSON.stringify( result.back ) );
		assert.ok( result.flash !== 'Back on dry land' && result.back.flash !== 'Back on dry land', JSON.stringify( result ) );

	} );

	test( 'flown out over the water and let down, it lands on the surface and drives on; R on the water, and on its edge facing it, put it a few metres on, on the water', async () => {

		const result = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const kit = window.waterKit;
			kit.reset( - 250, 180, 60 );
			const out = {};
			// Up on F, out over the sea, and down again with it let go.
			d.press( 'KeyF' );
			kit.step( 4 );
			Object.assign( out, { flying: d.flying, overSea: d.north < - 300, high: d.y } );
			d.release( 'KeyF' );
			kit.step( 30, () => d.flying || ! d.grounded );
			Object.assign( out, { down: { north: d.north, y: d.y, flying: d.flying, grounded: d.grounded } } );
			d.press( 'KeyW' );
			kit.step( 1 );
			d.release( 'KeyW' );
			Object.assign( out, { drove: out.down.north - d.north, on: d.y } );
			// R out there: a few metres on, still on the water.
			const north = d.north;
			d.press( 'KeyR' );
			d.release( 'KeyR' );
			Object.assign( out, { afterR: { moved: north - d.north, y: d.y, speed: d.speed } } );
			// R on the edge facing the water: the few metres on are the water, and that's where it goes.
			kit.reset( - 277, 180 );
			kit.step( 0.2 );
			d.press( 'KeyR' );
			d.release( 'KeyR' );
			kit.step( 0.3 );
			Object.assign( out, { edgeR: { north: d.north, y: d.y } } );
			return out;

		} );
		console.log( 'water, flying and R:', JSON.stringify( result ) );
		assert.ok( result.flying && result.overSea && result.high > 5, JSON.stringify( result ) );
		assert.ok( result.down.north < - 300 && ! result.down.flying && result.down.grounded && Math.abs( result.down.y + 2 ) < 0.01, JSON.stringify( result.down ) );
		assert.ok( result.drove > 3 && Math.abs( result.on + 2 ) < 0.01, JSON.stringify( result ) );
		assert.ok( Math.abs( result.afterR.moved - 4 ) < 0.01 && Math.abs( result.afterR.y + 2 ) < 0.01 && result.afterR.speed === 0, JSON.stringify( result.afterR ) );
		assert.ok( result.edgeR.north < - 280 && Math.abs( result.edgeR.y + 2 ) < 0.01, JSON.stringify( result.edgeR ) );

	} );

	test( 'paused out on the water, it\'s parked there and drives on from there; what it sends others says it\'s on the ground, never sinking or throwing up spray', async () => {

		const result = await page.evaluate( async () => {

			const { driver: d } = window.drive;
			const kit = window.waterKit;
			const { flagsOf } = await import( '/src/drive-app/live.js' );
			const { FLAGS } = await import( '/src/drive-app/live-protocol.js' );
			kit.reset( - 320, 180, 30 );
			d.press( 'KeyW' );
			kit.step( 1 );
			d.release( 'KeyW' );
			kit.step( 1 );
			const flags = flagsOf( d, false );
			const out = {
				flags: { grounded: !! ( flags & FLAGS.grounded ), splash: !! ( flags & FLAGS.splash ), spray: !! ( flags & FLAGS.spray ) },
				before: { north: d.north, y: d.y },
			};
			d.stop();
			await new Promise( resolve => setTimeout( resolve, 100 ) );
			const paused = window.drive.mode;
			window.drive.resume();
			Object.assign( out, { paused, resumed: window.drive.mode, after: { north: d.north, y: d.y, grounded: d.grounded } } );
			d.press( 'KeyW' );
			kit.step( 1 );
			d.release( 'KeyW' );
			Object.assign( out, { drove: out.after.north - d.north, y: d.y } );
			return out;

		} );
		console.log( 'water, paused on it:', JSON.stringify( result ) );
		assert.deepEqual( result.flags, { grounded: true, splash: false, spray: false } );
		assert.ok( result.before.north < - 320 && Math.abs( result.before.y + 2 ) < 0.01, JSON.stringify( result ) );
		assert.ok( result.paused === 'paused' && result.resumed === 'driving', JSON.stringify( result ) );
		assert.ok( Math.abs( result.after.north - result.before.north ) < 0.05 && Math.abs( result.after.y + 2 ) < 0.01 && result.after.grounded, JSON.stringify( result.after ) );
		assert.ok( result.drove > 2 && Math.abs( result.y + 2 ) < 0.01, JSON.stringify( result ) );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'boost pads never go down on the water, even where it can be driven to', async () => {

		const result = await page.evaluate( () => {

			const { driver: d, pads } = window.drive;
			const kit = window.waterKit;
			// They're off until they're switched on.
			pads.enabled = true;
			const beach = kit.slab( 20, 40, 0, - 300, - 2, - 0.1 );
			// Stopped on the beach just over the sea, facing out to sea: most spots tried are on it.
			kit.reset( - 296, 180 );
			pads.clear();
			const placed = new Map();
			for ( let i = 0; i < 40 * 60; i ++ ) {

				d.speed = 0;
				pads.update( 1 / 60 );
				for ( const p of pads.pads ) if ( p.state !== 'free' ) placed.set( p.index + ':' + p.at.z.toFixed( 1 ), { x: p.at.x, north: p.at.z, y: p.at.y } );
				// Leave them free again, so spots keep being tried.
				if ( i % 60 === 59 ) pads.clear();

			}

			kit.remove( beach );
			pads.clear();
			const all = [ ...placed.values() ].map( p => ( { ...p, east: - p.x } ) );
			// On the sea, and how far from its shores: the land's edge and the beach.
			const sea = all.filter( p => p.y < - 1.99 );
			const shore = p => Math.min( - 280 - p.north, Math.hypot( Math.max( 0, Math.abs( p.east ) - 10 ), Math.max( 0, - 320 - p.north, p.north + 280 ) ) );
			return { placed: all.length, onLand: all.length - sea.length, onSea: sea.length, nearestShore: Math.min( ...sea.map( shore ) ) };

		} );
		console.log( 'water, boost pads:', JSON.stringify( result ) );
		assert.ok( result.onLand > 0, JSON.stringify( result ) );
		assert.equal( result.onSea, 0, JSON.stringify( result ) );

	} );

	test( 'water in Google\'s other colours is water; grass, sand and concrete are dry, mown grass can\'t be told, a bluish lawn among ball fields isn\'t water, and a lagoon\'s turquoise is never dry', async () => {

		const result = await page.evaluate( () => {

			const { water, pads, ground } = window.drive;
			const pad = ground.getColliders()[ 0 ];
			const sea = pad.children.find( child => child.isMesh && child.position.y < - 1 );
			const kit = window.waterKit;
			const before = sea.material;
			// The sea painted one colour (a new picture each time, as water.js keeps a copy of each).
			const paint = ( material, [ r, g, b ] ) => {

				const canvas = Object.assign( document.createElement( 'canvas' ), { width: 64, height: 64 } );
				const ctx = canvas.getContext( '2d' );
				ctx.fillStyle = `rgb(${ r },${ g },${ b })`;
				ctx.fillRect( 0, 0, 64, 64 );
				const disc = pads.group.children[ 0 ].material;
				const map = new disc.map.constructor( canvas );
				map.colorSpace = disc.map.colorSpace;
				return new disc.constructor( { map } );

			};
			const say = r => r.level !== null ? 'water' : r.dry ? 'dry' : 'unsure';
			const out = {};
			// Measured on Google's tiles: Hong Kong's harbour, the IJ in Amsterdam, the Thames; a
			// cricket field, Copacabana's sand, a pale pavement, a lawn.
			for ( const [ name, colour ] of Object.entries( { harbourTeal: [ 78, 117, 107 ], canalOlive: [ 76, 89, 82 ], riverBrown: [ 91, 90, 85 ], mownGrass: [ 82, 107, 91 ], sand: [ 205, 185, 165 ], concrete: [ 190, 188, 182 ], lawn: [ 90, 130, 60 ] } ) ) {

				sea.material = paint( sea.material, colour );
				out[ name ] = say( water.look( 0, - 340, - 1 ) );

			}

			// A lawn as bluish as Hong Kong's harbour (Central Park's, measured), level and even, with a
			// ball field on a level with it 35 m off: not water, as the harbour would be all round.
			sea.material = paint( sea.material, [ 81, 121, 112 ] );
			const field = kit.slab( 12, 12, 35 * Math.sin( Math.PI / 8 ), - 340 + 35 * Math.cos( Math.PI / 8 ), - 1.99, 0 );
			field.material = paint( field.material, [ 240, 180, 144 ] );
			out.lawnAmongFields = say( water.look( 0, - 340, - 1 ) );
			kit.remove( field );
			// A sandbar 1 m over the sea, 8 m across: uneven round its middle (the sea lower), so dry
			// in a grey, but not in a lagoon's turquoise, which only water is.
			const bar = kit.slab( 8, 8, 0, - 340, - 1, 0 );
			for ( const [ name, colour ] of Object.entries( { barGrey: [ 120, 120, 120 ], barTurquoise: [ 40, 170, 180 ] } ) ) {

				bar.material = paint( bar.material, colour );
				out[ name ] = say( water.look( 0, - 340, 0 ) );

			}

			kit.remove( bar );
			sea.material = before;
			return out;

		} );
		console.log( 'water, colours:', JSON.stringify( result ) );
		assert.deepEqual( result, { harbourTeal: 'water', canalOlive: 'water', riverBrown: 'water', mownGrass: 'unsure', sand: 'dry', concrete: 'dry', lawn: 'dry', lawnAmongFields: 'unsure', barGrey: 'dry', barTurquoise: 'unsure' } );

	} );

	test( 'a canal 25 m across: the water by its wall is never taken for dry ground, and its quays are', async () => {

		const result = await page.evaluate( () => {

			const { water } = window.drive;
			const kit = window.waterKit;
			// Two quays level with the land, 2 m over the sea, 25 m apart.
			const quays = [ kit.slab( 40, 40, - 32.5, - 340, 0, 0 ), kit.slab( 40, 40, 32.5, - 340, 0, 0 ) ];
			const say = r => r.level !== null ? 'water' : r.dry ? 'dry' : 'unsure';
			// 4 m off one wall: past it (13 m on), water by the other wall, which can't be told either.
			const out = { byWall: say( water.look( - 8.5, - 340, - 1 ) ), quay: say( water.look( - 30, - 340, 1 ) ) };
			for ( const quay of quays ) kit.remove( quay );
			return out;

		} );
		console.log( 'water, a canal:', JSON.stringify( result ) );
		assert.deepEqual( result, { byWall: 'unsure', quay: 'dry' } );

	} );

} );

// A pin typed in on the globe with the pad `depth` m under the water's surface there (the sea's, or
// a big lake's), as Google draws the bed out there: what the drop-in started on.
async function dropInOver( page, where, depth ) {

	if ( await mode( page ) !== 'globe' ) {

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe' );

	}

	await page.evaluate( depth => {

		const pad = window.drive.ground.getColliders()[ 0 ];
		pad.position.y = - depth;
		pad.updateMatrixWorld( true );

	}, depth );
	await page.locator( '.search input[name=q]' ).fill( where );
	await page.locator( '.search input[name=q]' ).press( 'Enter' );
	await flown( page );
	await driveHere( page );
	return page.evaluate( async () => {

		const { driver: d, sea, water, ground, place } = window.drive;
		const { seaLevel } = await import( '/src/drive-app/sea.js' );
		const toast = document.querySelector( '#toast' );
		return {
			toast: toast.hidden ? null : toast.textContent, sea: sea.active, colliders: ground.getColliders().length,
			height: place.height, level: await seaLevel( place.lat, place.lon ), y: d.y, look: water.look( d.east, d.north, d.y ),
		};

	} );

}

// Back on the globe with the pad where land is (and where it was, if dropInBeside moved it).
async function padBack( page ) {

	await page.keyboard.press( 'KeyM' );
	await page.waitForFunction( () => window.drive.mode === 'globe' );
	await page.evaluate( () => {

		const pad = window.drive.ground.getColliders()[ 0 ];
		pad.position.x = 0;
		pad.position.y = 0;
		pad.position.z = 0;
		pad.updateMatrixWorld( true );

	} );

}

// In the page: a picture of one colour for the pad's ground, and houses as boxes, in the page's own
// three.js (by way of the pads' pictures and the pad's own meshes). The houses are one mesh, its rays
// by a bounding volume hierarchy as Google's tiles' are (src/raycast.js), each [ west, east, south,
// north ] (m, east and north of the scene's middle), standing `high` m over `floor` (m, in the scene).
async function setUpPictures( page ) {

	await page.evaluate( () => {

		const { ground, pads } = window.drive;
		const pad = ground.getColliders()[ 0 ];
		const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
		window.padKit = {

			picture( colour ) {

				const canvas = Object.assign( document.createElement( 'canvas' ), { width: 64, height: 64 } );
				const ctx = canvas.getContext( '2d' );
				ctx.fillStyle = `rgb(${ colour.join( ',' ) })`;
				ctx.fillRect( 0, 0, 64, 64 );
				const disc = pads.group.children[ 0 ].material;
				const map = new disc.map.constructor( canvas );
				map.colorSpace = disc.map.colorSpace;
				return new disc.constructor( { map } );

			},

			async houses( boxes, floor, high ) {

				const { useFastRaycast } = await import( '/src/raycast.js' );
				const Geometry = Object.getPrototypeOf( land.geometry.constructor );
				const Attribute = land.geometry.getAttribute( 'position' ).constructor;
				const positions = [];
				// (In the scene x is west, z north and y up; each face counter-clockwise from outside.)
				const quad = ( a, b, c, d ) => positions.push( ...a, ...b, ...c, ...a, ...c, ...d );
				for ( const [ west, east, south, north ] of boxes ) {

					const [ x0, x1, top ] = [ - east, - west, floor + high ];
					quad( [ x0, top, south ], [ x0, top, north ], [ x1, top, north ], [ x1, top, south ] );
					quad( [ x0, floor, north ], [ x1, floor, north ], [ x1, top, north ], [ x0, top, north ] );
					quad( [ x1, floor, south ], [ x0, floor, south ], [ x0, top, south ], [ x1, top, south ] );
					quad( [ x1, floor, north ], [ x1, floor, south ], [ x1, top, south ], [ x1, top, north ] );
					quad( [ x0, floor, south ], [ x0, floor, north ], [ x0, top, north ], [ x0, top, south ] );

				}

				const geometry = new Geometry();
				geometry.setAttribute( 'position', new Attribute( positions, 3 ) );
				geometry.computeVertexNormals();
				const mesh = new land.constructor( geometry, new land.material.constructor( { color: 0x8a7a70, roughness: 1 } ) );
				useFastRaycast( mesh );
				pad.add( mesh );
				mesh.updateMatrixWorld();
				return mesh;

			},

		};

	} );

}

// A coast as Google draws it, on the pad where land is (driving there, the pad's sea is at the
// water's height: main.js's PAD_SEA): its land 2 m over the sea; its sea, Google's water in one even
// colour, `strip` m out from the shore (north = -280); then its bed, 1,200 m across, with the sea's
// picture on it (as dark as Google's out at sea, 12, 13, 19), sloping down from the water's height
// 1 in 20 for 400 m, 20 m under it at the end, and on, level, 1,200 m more. With `houses`, a
// promenade's width back from the shore, rows of houses 10 m high either side of the street down to
// the beach (east = 0), as along a seafront. In the page as window.coastKit, the driver stepped at a
// fixed rate as the water tests step it, with the open sea's surface following it and watched for as
// each frame has them (main.js's watchSea).
async function setUpCoast( page, { strip = 60, houses = false } = {} ) {

	await setUpPictures( page );
	await page.evaluate( async ( { strip, houses } ) => {

		document.querySelector( '#drive-ui .keys' ).hidden = true;
		const { driver: d, sea, ground, watchSea } = window.drive;
		const { picture } = window.padKit;
		const pad = ground.getColliders()[ 0 ];
		const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
		const water = pad.children.find( child => child.isMesh && child.position.y < - 1 );
		const kept = { scale: water.scale.clone(), position: water.position.clone(), material: water.material };
		water.scale.y = strip / 2000;
		water.position.z = - 280 - strip / 2;
		water.material = picture( [ 45, 76, 95 ] );
		water.updateMatrixWorld();
		const edge = - 280 - strip;
		const slope = Math.atan( 0.05 );
		const bed = land.clone();
		bed.scale.set( 1200 / 4000, 400 / Math.cos( slope ) / 2000, 1 );
		bed.rotation.set( - Math.PI / 2 - slope, 0, 0 );
		bed.position.set( 0, - 12, edge - 200 );
		const deep = land.clone();
		deep.scale.set( 1200 / 4000, 1200 / 2000, 1 );
		deep.position.set( 0, - 22, edge - 1000 );
		const added = [ bed, deep ];
		for ( const mesh of added ) {

			mesh.material = picture( [ 12, 13, 19 ] );
			pad.add( mesh );
			mesh.updateMatrixWorld();

		}

		// Two rows of houses 12 m wide with 4 m between them, from 15 m back from the shore, out to
		// 300 m either side of the street.
		if ( houses ) {

			const boxes = [];
			for ( let west = 6; west < 300; west += 16 ) {

				for ( const south of [ - 265, - 240 ] ) boxes.push( [ west, west + 12, south, south + 18 ], [ - west - 12, - west, south, south + 18 ] );

			}

			added.push( await window.padKit.houses( boxes, 0, 10 ) );

		}

		window.coastKit = {

			// The bed painted one colour (null: no picture, as the pad's own ground has).
			paint( colour ) {

				for ( const mesh of [ bed, deep ] ) mesh.material = colour ? picture( colour ) : land.material.clone();

			},

			// The bed's height under ( 0, north ), on its slope, and the water's.
			bedAt: north => - 2 - 0.05 * Math.min( 400, Math.max( 0, edge - north ) ),
			surface: - 2,

			// At ( 0, north ) on whatever is there, facing `heading` (out to sea, unless said) at `kmh`
			// (back, less than 0), with no water of its own laid (so it's watched for again).
			reset( north, kmh, heading = 180 ) {

				for ( const code of [ ...d.keys ] ) d.release( code );
				sea.clear();
				const y = d.groundAt( 0, north, 10 );
				Object.assign( d, { east: 0, north, y, heading, course: heading, view: heading, speed: kmh / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftHop: false, boost: null, firing: false, mult: 1 } );
				d.lastSafe = d.lastGood = d.recentGood = { east: 0, north, y };
				d.update( 1 / 60 );

			},

			// Driven at a fixed step for `seconds`, or until `each` says false.
			step( seconds, each ) {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					sea.follow( d.east, d.north, d.y );
					watchSea( 1 / 60 );
					if ( each?.() === false ) return;

				}

			},

			remove() {

				for ( const mesh of added ) mesh.removeFromParent();
				water.scale.copy( kept.scale );
				water.position.copy( kept.position );
				water.material = kept.material;
				water.updateMatrixWorld();

			},

		};
		// The sea's height and the map asked for: once they've come, the ground's looked at as it drives.
		watchSea( 1 );
		await new Promise( resolve => setTimeout( resolve, 200 ) );

	}, { strip, houses } );

}

// New Orleans behind its levee, on the pad where land is: the pad's land the levee's top, 2 m over
// the sea (Lake Pontchartrain's, which is the sea on the map); south of it (north = -280 on), 2.5 m
// under the sea, its streets, grey as asphalt, with houses along them whose roofs stand 3.5 m over
// the sea (6 m over the street), as in Lakeview: streets 10 m wide 60 m apart running south from the
// levee (east = 0, ±60, ±120), each block between them two rows of houses back to back, 16 m deep
// with 12 m of yards between, on lots 15 m along the street with 4 m between houses, and a street
// across every seven lots; the pad's own sea out of the way. With `rows`, the two rows of each block
// from and to that far (m) east of the street on its west side ([ [ 8, 24 ], [ 36, 52 ] ] as said:
// house fronts 16 m apart across a street); with `lot` and `house`, lots that long with houses that
// long on them (15 and 11 m as said); with `empty`, the lots whose north end is within [ south,
// north ] (m) left empty, all the way across the town (a boulevard, say); with `gone`, the houses
// whose middles are at those [ east, north ] (m), to within half a metre, left out. In the page as
// window.polderKit, the driver stepped as coastKit steps it.
async function setUpPolder( page, { rows = [ [ 8, 24 ], [ 36, 52 ] ], lot: length = 15, house = 11, empty = null, gone = [] } = {} ) {

	await setUpPictures( page );
	await page.evaluate( async ( { rows, length, house, empty, gone } ) => {

		document.querySelector( '#drive-ui .keys' ).hidden = true;
		const { driver: d, sea, ground, watchSea } = window.drive;
		const pad = ground.getColliders()[ 0 ];
		const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
		const water = pad.children.find( child => child.isMesh && child.position.y < - 1 );
		const kept = water.position.y;
		water.position.y = - 100;
		water.updateMatrixWorld();
		const streets = land.clone();
		streets.material = window.padKit.picture( [ 98, 100, 104 ] );
		streets.scale.set( 400 / 4000, 700 / 2000, 1 );
		streets.position.set( 0, - 4.5, - 630 );
		pad.add( streets );
		streets.updateMatrixWorld();
		const boxes = [];
		for ( const side of [ - 1, 1 ] ) {

			for ( let block = 0; block < 3; block ++ ) {

				for ( const [ a, b ] of rows ) {

					for ( let lot = 0, north = - 295; north > - 920; lot ++, north -= length ) {

						if ( lot % 7 === 6 || empty && north >= empty[ 0 ] && north <= empty[ 1 ] ) continue;
						const [ near, far ] = [ block * 60 + a, block * 60 + b ];
						const box = side > 0 ? [ near, far, north - house, north ] : [ - far, - near, north - house, north ];
						const middle = [ ( box[ 0 ] + box[ 1 ] ) / 2, ( box[ 2 ] + box[ 3 ] ) / 2 ];
						if ( gone.some( ( [ e, n ] ) => Math.abs( middle[ 0 ] - e ) < 0.5 && Math.abs( middle[ 1 ] - n ) < 0.5 ) ) continue;
						boxes.push( box );

					}

				}

			}

		}

		const houses = await window.padKit.houses( boxes, - 4.5, 6 );
		window.polderKit = {

			street: - 4.5,
			surface: - 2,

			// At ( east, north ) on whatever is there, facing `heading` (south, unless said) at `kmh`.
			reset( north, kmh, heading = 180, east = 0 ) {

				for ( const code of [ ...d.keys ] ) d.release( code );
				sea.clear();
				const y = d.groundAt( east, north, 10 );
				Object.assign( d, { east, north, y, heading, course: heading, view: heading, speed: kmh / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftHop: false, boost: null, firing: false, mult: 1 } );
				d.lastSafe = d.lastGood = d.recentGood = { east, north, y };
				d.update( 1 / 60 );

			},

			step( seconds, each ) {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					sea.follow( d.east, d.north, d.y );
					watchSea( 1 / 60 );
					if ( each?.() === false ) return;

				}

			},

			remove() {

				streets.removeFromParent();
				houses.removeFromParent();
				water.position.y = kept;
				water.updateMatrixWorld();

			},

		};
		watchSea( 1 );
		await new Promise( resolve => setTimeout( resolve, 200 ) );

	}, { rows, length, house, empty, gone } );

}

// Go to beside another driver (main.js's goTo) somewhere else: a drop-in at ( lat, lon ) with their
// height, `over` m over the water's surface there, with the pad `depth` m under that surface (as
// Google draws the bed), painted `colour` (null: no picture, as it has), and moved `shift` m north
// and `east` m west (so that what's that far south and east of its middle is under the pin); with
// `laid`, your own water's surface laid when you left, as goTo says it ({ lake: null } for the
// sea's). What the drop-in started on.
async function dropInBeside( page, lat, lon, depth, over, { beside = true, colour = [ 12, 13, 19 ], shift = 0, east = 0, laid = null } = {} ) {

	if ( await mode( page ) !== 'globe' ) {

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe' );

	}

	await setUpPictures( page );
	await page.evaluate( async ( { lat, lon, depth, over, beside, colour, shift, east, laid } ) => {

		const { ground, dropIn } = window.drive;
		const { seaLevel } = await import( '/src/drive-app/sea.js' );
		const pad = ground.getColliders()[ 0 ];
		const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
		window.padLand ??= land.material;
		land.material = colour ? window.padKit.picture( colour ) : window.padLand;
		pad.position.set( east, - depth, shift );
		pad.updateMatrixWorld( true );
		dropIn( { name: 'Beside a friend', lat, lon, height: await seaLevel( lat, lon ) + over, heading: 180, ...( beside ? { beside } : {} ), ...( laid ? { laid } : {} ) } );

	}, { lat, lon, depth, over, beside, colour, shift, east, laid } );
	await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
	return page.evaluate( async () => {

		const { driver: d, sea, ground, place } = window.drive;
		const { seaLevel } = await import( '/src/drive-app/sea.js' );
		return { sea: sea.active, colliders: ground.getColliders().length, height: place.height, level: await seaLevel( place.lat, place.lon ), y: d.y };

	} );

}

// Back as it was after dropInBeside or joinBeside: the pad's own ground, with no picture, and none of
// joinBeside's boxes.
async function padPlain( page ) {

	await page.evaluate( () => {

		const land = window.drive.ground.getColliders()[ 0 ].children.find( child => child.isMesh && child.position.y > - 1 );
		land.material = window.padLand ?? land.material;
		window.joinBoxes?.removeFromParent();
		window.joinBoxes = null;

	} );

}

// Go to or Join (main.js's goBeside) another driver somewhere else: from the globe, with none of the
// water's surface laid (unless `globe` is false: from where you're driving). Their car as live.js
// sends it, Earth-centred, at ( lat, lon ), level and facing south, `over` m over the water's surface
// there (the sea's height, and `rise` m over that for a big lake's), with `flags` (live-protocol.js's
// FLAGS: grounded, 128, unless said; flying is 8), so that the pin is 5 m to its right, west of it;
// or, with `dropped`, no car, only the place they dropped in there at that height (the pin). The pad `depth` m under that surface (as Google draws the bed), painted `colour` (null: no
// picture, as it has) and moved `shift` m north and `east` m west (so that what's that far south
// and east of its middle is under the pin), with `boxes` on it ([ west, east, south, north ] m
// from the pin, as padKit.houses has them), standing from `floor` to `top` m over the surface. What
// the drop-in started on; padPlain takes the picture and the boxes away.
async function joinBeside( page, lat, lon, depth, over, { rise = 0, flags = 128, dropped = false, colour = [ 12, 13, 19 ], shift = 0, east = 0, boxes = null, floor = - 30, top = 5, globe = true } = {} ) {

	if ( globe && await mode( page ) !== 'globe' ) {

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe' );

	}

	await setUpPictures( page );
	await page.evaluate( async ( { lat, lon, depth, over, rise, flags, dropped, colour, shift, east, boxes, floor, top } ) => {

		const { ground, camera, globe, goBeside } = window.drive;
		const { seaLevel } = await import( '/src/drive-app/sea.js' );
		const { toEcef } = await import( '/src/drive-app/live-protocol.js' );
		const pad = ground.getColliders()[ 0 ];
		const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
		window.padLand ??= land.material;
		land.material = colour ? window.padKit.picture( colour ) : window.padLand;
		pad.position.set( east, - depth, shift );
		pad.updateMatrixWorld( true );
		// (In the pad's own frame the water's surface is `depth` m over it.)
		window.joinBoxes?.removeFromParent();
		window.joinBoxes = boxes ? await window.padKit.houses( boxes, depth + floor, top - floor ) : null;
		// Its right (+X) west, up (+Y) up and back (+Z) north, Earth-centred.
		const V = camera.position.constructor;
		const [ la, lo ] = [ lat * Math.PI / 180, lon * Math.PI / 180 ];
		const west = new V( Math.sin( lo ), - Math.cos( lo ), 0 );
		const up = new V( Math.cos( la ) * Math.cos( lo ), Math.cos( la ) * Math.sin( lo ), Math.sin( la ) );
		const north = new V( - Math.sin( la ) * Math.cos( lo ), - Math.sin( la ) * Math.sin( lo ), Math.cos( la ) );
		const q = new camera.quaternion.constructor().setFromRotationMatrix( new globe.earth.matrixWorld.constructor().makeBasis( west, up, north ) );
		const height = await seaLevel( lat, lon ) + rise + over;
		const p = toEcef( lat, lon, height );
		await goBeside( dropped ? { place: { name: 'A friend', lat, lon, height } } : { place: { name: 'A friend' }, s: [ p.x, p.y, p.z, q.x, q.y, q.z, q.w, 0, 0, 0, flags ] } );

	}, { lat, lon, depth, over, rise, flags, dropped, colour, shift, east, boxes, floor, top } );
	await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
	return page.evaluate( async () => {

		const { driver: d, sea, ground, place } = window.drive;
		const { seaLevel } = await import( '/src/drive-app/sea.js' );
		return { sea: sea.active, lake: sea.lake?.name ?? null, colliders: ground.getColliders().length, height: place.height, level: await seaLevel( place.lat, place.lon ), y: d.y, lat: place.lat, lon: place.lon };

	} );

}

// The open sea. Out past what Google photographs of a coast, its tiles are the sea bed under the
// sea's picture (5 km down in the middle of the Pacific), with no surface: the test pad lowered
// 3 km stands in for it. A drop-in there starts on a surface of the sea's own (sea.js) at the
// sea's height there (EGM96's, drive/public/sea/egm96.bin), which is water like any other.
describe( 'World Drive, the open sea', () => {

	let page;

	before( async () => {

		page = await newPage();
		await openGlobe( page );

	} );

	after( () => page?.context().close() );

	test( 'the sea\'s height over the ellipsoid is EGM96\'s, to a few metres', async () => {

		const levels = await page.evaluate( async () => {

			const { seaLevel } = await import( '/src/drive-app/sea.js' );
			return Promise.all( [ [ 0, 0 ], [ 4.75, 78.75 ], [ - 8.25, 147.25 ], [ 34, - 118.5 ], [ 30, - 140 ], [ 90, 0 ], [ - 90, 0 ], [ 30, 180 ], [ 30, - 180 ] ].map( ( [ lat, lon ] ) => seaLevel( lat, lon ) ) );

		} );
		console.log( 'sea levels:', JSON.stringify( levels ) );
		// The full model there: 17.16 m at 0° 0°, its lowest south of India and its highest by New
		// Guinea, Santa Monica Bay, the middle of the Pacific, the poles; and 180° E is 180° W.
		const model = [ 17.16, - 106.99, 85.39, - 36.01, - 28.11, 13.61, - 29.53, - 7.5, - 7.5 ];
		levels.forEach( ( level, i ) => assert.ok( Math.abs( level - model[ i ] ) < 5, `${ level } vs ${ model[ i ] }` ) );
		assert.equal( levels[ 7 ], levels[ 8 ] );

	} );

	test( 'dropped in on the open sea: started on its surface at the sea\'s height, riding on it, the Earth curving away under it, flying and coming down on it, never a boost pad', async () => {

		// The sea bed 3 km down; the pin typed in, as anyone would.
		await page.evaluate( () => {

			const pad = window.drive.ground.getColliders()[ 0 ];
			pad.position.y = - 3000;
			pad.updateMatrixWorld( true );

		} );
		await page.locator( '.search input[name=q]' ).fill( '30, -140' );
		await page.locator( '.search input[name=q]' ).press( 'Enter' );
		await flown( page );
		await driveHere( page );
		await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
		await shot( page, 'drive-open-sea' );
		const result = await page.evaluate( () => {

			const { driver: d, water, sea, pads, place, ground } = window.drive;
			const toast = document.querySelector( '#toast' );
			const out = {
				toast: toast.hidden ? null : toast.textContent, sea: sea.active, colliders: ground.getColliders().length, height: place.height,
				start: { y: d.y, heading: d.heading }, look: water.look( 0, 0, 0 ), dry: water.look( 0, 0, 0 ).dry,
			};
			// They're off until they're switched on.
			pads.enabled = true;
			const step = ( seconds, each ) => {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					sea.follow( d.east, d.north );
					pads.update( 1 / 60 );
					if ( each?.() === false ) return;

				}

			};
			// Driven on for 6 s: on the water all the way.
			for ( const code of [ ...d.keys ] ) d.release( code );
			const drive = { low: Infinity, high: - Infinity, onWater: 0, pads: 0 };
			d.press( 'KeyW' );
			step( 6, () => {

				drive.low = Math.min( drive.low, d.y );
				drive.high = Math.max( drive.high, d.y );
				if ( water.at( d.east, d.north, d.y ) !== null ) drive.onWater += 1 / 60;
				drive.pads = Math.max( drive.pads, pads.pads.filter( p => p.state !== 'free' ).length );

			} );
			d.release( 'KeyW' );
			drive.north = d.north;
			out.drive = drive;
			// 5 km on, the sea is 2 m lower than where the scene is centred: the Earth curving away.
			Object.assign( d, { east: 0, north: 5000, speed: 10, grounded: true } );
			step( 1.5 );
			out.far = { y: d.y, look: water.look( d.east, d.north, d.y ).level, expected: - ( d.north ** 2 ) / ( 2 * 6371000 ) };
			// Up on F, and down again with it let go.
			d.press( 'KeyF' );
			step( 2 );
			const high = d.y - out.far.y;
			d.release( 'KeyF' );
			step( 20, () => ! d.grounded || d.flying );
			step( 0.5 );
			out.flew = { high, flying: d.flying, grounded: d.grounded, y: d.y, onWater: water.at( d.east, d.north, d.y ) !== null };
			pads.enabled = false;
			return out;

		} );
		console.log( 'the open sea:', JSON.stringify( result ) );
		assert.equal( result.toast, null );
		assert.ok( result.sea && result.colliders === 2, JSON.stringify( result ) );
		// The sea's height there (EGM96: 28 m under the ellipsoid), at the scene's y = 0.
		assert.ok( Math.abs( result.height + 28 ) < 1, `the sea at ${ result.height } m` );
		assert.ok( Math.abs( result.start.y ) < 0.01 && result.look.level !== null && Math.abs( result.look.level ) < 0.01 && ! result.dry, JSON.stringify( result ) );
		assert.ok( result.drive.north > 60 && result.drive.onWater > 5.5, JSON.stringify( result.drive ) );
		assert.ok( Math.abs( result.drive.low ) < 0.01 && Math.abs( result.drive.high ) < 0.01 && result.drive.pads === 0, JSON.stringify( result.drive ) );
		assert.ok( Math.abs( result.far.y - result.far.expected ) < 0.1 && result.far.expected < - 1.9 && Math.abs( result.far.look - result.far.y ) < 0.01, JSON.stringify( result.far ) );
		assert.ok( result.flew.high > 5 && ! result.flew.flying && result.flew.grounded && result.flew.onWater, JSON.stringify( result.flew ) );
		assert.ok( Math.abs( result.flew.y - result.far.y ) < 0.1, JSON.stringify( result.flew ) );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'from an island, driven off into the open sea it drives on across the sea\'s surface, and turned round, back up onto the island; back on the globe the sea goes, and a drop-in on land has none', async () => {

		const result = await page.evaluate( () => {

			const { driver: d, sea, ground, water } = window.drive;
			// An island 0.3 m over the sea, 40 m across, 20 m ahead: a slab cut from the pad, 3 km up
			// from it.
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh );
			const island = land.clone();
			const top = d.y + 0.3;
			island.scale.set( 40 / 4000, 40 / 2000, 1 );
			island.position.set( - d.east, top - pad.position.y, d.north + 40 );
			pad.add( island );
			island.updateMatrixWorld( true );
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { heading: 0, course: 0, view: 0, speed: 8, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, onWater: false } );
			const $ = selector => document.querySelector( `#hud ${ selector }` );
			const step = ( seconds, each ) => {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					sea.follow( d.east, d.north );
					if ( each?.() === false ) return;

				}

			};
			// Up onto the island, over it and off its far end, on till 40 m past it.
			const start = d.north;
			let onIsland = 0, was = d.north, putBack = false;
			d.press( 'KeyW' );
			step( 20, () => {

				if ( Math.abs( d.y - top ) < 0.05 ) onIsland += 1 / 60;
				if ( d.north < was - 1 ) putBack = true;
				was = d.north;
				return d.north < start + 100;

			} );
			const out = { islandAt: [ start + 20, start + 60 ], onIsland, putBack, off: { north: d.north, y: d.y, level: water.at( d.east, d.north, d.y ), grounded: d.grounded, flash: $( '.dhud-flash' ).hidden ? null : $( '.dhud-flash' ).textContent } };
			// Turned round out there, and back onto the island.
			Object.assign( d, { heading: 180, course: 180, view: 180 } );
			step( 20, () => d.north > start + 40 );
			d.release( 'KeyW' );
			step( 0.2 );
			out.back = { north: d.north, island: d.y - top };
			island.removeFromParent();
			return out;

		} );
		console.log( 'the open sea, an island:', JSON.stringify( result ) );
		// Over the island and on out across the sea, on its surface, never put back.
		assert.ok( result.onIsland > 1 && ! result.putBack && result.off.north > result.islandAt[ 1 ] + 30, JSON.stringify( result ) );
		assert.ok( result.off.level !== null && Math.abs( result.off.y - result.off.level ) < 0.01 && result.off.grounded && result.off.flash !== 'Back on dry land', JSON.stringify( result.off ) );
		// And back up onto it.
		assert.ok( Math.abs( result.back.island ) < 0.05 && result.back.north > result.islandAt[ 0 ] && result.back.north < result.islandAt[ 1 ], JSON.stringify( result.back ) );

		// M: the globe, and the sea gone with the place.
		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		const gone = await page.evaluate( () => {

			const { sea, ground } = window.drive;
			const pad = ground.getColliders()[ 0 ];
			const out = { sea: sea.active, colliders: ground.getColliders().length, inScene: !! sea.mesh.parent };
			pad.position.y = 0;
			pad.updateMatrixWorld( true );
			return out;

		} );
		assert.deepEqual( gone, { sea: false, colliders: 1, inScene: false } );
		// The pad back where land is: a drop-in there has no sea.
		await page.locator( '.spots button', { hasText: 'Neptune Terminals' } ).click();
		await flown( page );
		await driveHere( page );
		const land = await page.evaluate( () => {

			const { driver: d, sea, water, ground } = window.drive;
			return { sea: sea.active, colliders: ground.getColliders().length, y: d.y, dry: water.look( d.east, d.north, d.y ).dry };

		} );
		assert.deepEqual( land, { sea: false, colliders: 1, y: land.y, dry: true } );
		assert.ok( Math.abs( land.y ) < 0.01, JSON.stringify( land ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'the map of the sea and the big lakes: the sea and every sea joined to it, its coasts, each big lake by name (all of a square the lake), and land (the Dead Sea\'s shore, Death Valley, Lake Assal and Niagara Falls among it); only a pin by a big lake asks about one', async () => {

		const places = {
			'the middle of the Pacific': [ 30, - 140, 'sea' ], 'the Pacific at 180°': [ 30, 180, 'sea' ], 'Santa Monica Bay': [ 33.95, - 118.6, 'sea' ],
			'20 km off Waikiki': [ 21.08, - 157.85, 'sea' ], 'the Strait of Georgia': [ 49.2, - 123.55, 'sea' ], 'the Black Sea': [ 43, 34, 'sea' ],
			'Santa Monica Pier': [ 34.0065, - 118.4985, 'coast' ], 'Lake Baikal': [ 53.25, 108.1, 'Lake Baikal' ], 'the Caspian': [ 38.2, 51.2, 'the Caspian Sea' ],
			'Lake Superior': [ 47.7, - 87.5, 'Lake Superior' ], 'Lake Huron': [ 44.8, - 82.4, 'Lakes Michigan and Huron' ], 'Lake Titicaca': [ - 15.8, - 69.4, 'Lake Titicaca' ],
			'Olkhon, an island in Baikal': [ 53.15, 107.35, 'land' ], 'the Dead Sea\'s shore': [ 31.5, 35.48, 'land' ], 'Death Valley': [ 36.25, - 116.83, 'land' ],
			'Lake Assal': [ 11.65, 42.42, 'land' ], 'Denver': [ 39.74, - 104.99, 'land' ], 'Antarctica': [ - 89, 0, 'land' ],
			// The side of the Assal depression, 28 m under the sea: in the square the Ghoubbet's shore
			// crosses, so a coast's (the next test but one).
			'by the Ghoubbet': [ 11.6045, 42.5004, 'coast' ],
			// By Natural Earth's Lake Erie (which goes down the Niagara River), but the gorge below the
			// falls is 75 m under the lake: only a square all of which is the lake is the lake.
			'Niagara Falls': [ 43.08, - 79.07, 'land' ],
		};
		const seen = await page.evaluate( async places => {

			const { lakesNear, waterAt } = await import( '/src/drive-app/sea.js' );
			const kinds = {};
			for ( const [ name, [ lat, lon ] ] of Object.entries( places ) ) {

				const at = await waterAt( lat, lon );
				kinds[ name ] = at.kind === 'lake' ? at.lake.name : at.kind;

			}

			const near = ( lat, lon ) => lakesNear( lat, lon ).map( lake => lake.name );
			return { kinds, near: { baikal: near( 53.25, 108.1 ), huron: near( 44.8, - 82.4 ), pacific: near( 30, - 140 ), denver: near( 39.74, - 104.99 ) } };

		}, places );
		assert.deepEqual( seen.kinds, Object.fromEntries( Object.entries( places ).map( ( [ name, [ , , kind ] ] ) => [ name, kind ] ) ) );
		assert.deepEqual( seen.near, { baikal: [ 'Lake Baikal' ], huron: [ 'Lakes Michigan and Huron' ], pacific: [], denver: [] } );

	} );

	test( 'the pad more than 15 m under the sea\'s height on the sea or a coast (as Google draws the shelf\'s bed): started on the sea\'s surface; 14 m under it (Google\'s water with the tide out), on that as before; on land, however far under the sea (the Dead Sea\'s shore), never; deeper than any land or lake, anywhere', async () => {

		const shelf = await dropInOver( page, '33.95, -118.6', 200 );
		console.log( 'the shelf:', JSON.stringify( shelf ) );
		assert.ok( shelf.sea && shelf.colliders === 2 && shelf.toast === null && Math.abs( shelf.height - shelf.level ) < 0.01, JSON.stringify( shelf ) );
		assert.ok( Math.abs( shelf.y ) < 0.01 && Math.abs( shelf.look.level ) < 0.01 && ! shelf.look.dry, JSON.stringify( shelf ) );
		await shot( page, 'drive-open-sea-shelf' );
		const just = await dropInOver( page, '33.95, -118.6', 16 );
		assert.ok( just.sea && Math.abs( just.height - just.level ) < 0.01 && Math.abs( just.y ) < 0.01, JSON.stringify( just ) );
		const tide = await dropInOver( page, '33.95, -118.6', 14 );
		console.log( 'the tide out:', JSON.stringify( tide ) );
		assert.ok( ! tide.sea && tide.colliders === 1 && tide.toast === null && Math.abs( tide.y + 14 ) < 0.5, JSON.stringify( tide ) );
		// By the pier, the map's square astride the coast: the sea too.
		const coast = await dropInOver( page, '34.0065, -118.4985', 40 );
		assert.ok( coast.sea && Math.abs( coast.y ) < 0.01, JSON.stringify( coast ) );
		const shore = await dropInOver( page, '31.5, 35.48', 500 );
		console.log( 'the Dead Sea\'s shore:', JSON.stringify( shore ) );
		assert.ok( ! shore.sea && shore.colliders === 1 && shore.toast === null && Math.abs( shore.y + 500 ) < 0.5 && shore.look.dry, JSON.stringify( shore ) );
		// The drop-in's own question, with the ground that far under where the pad stands for the
		// water's surface: Death Valley 1 km down is still land; 2 km down, deeper than any land or
		// lake bed, it's the sea's, wherever.
		const asked = await page.evaluate( async () => {

			const { waterOver } = window.drive;
			const surface = async ( lat, lon, y ) => ( await waterOver( lat, lon, null, y ) )?.height ?? null;
			return { pacific: await surface( 30, - 140, - 1150 ), valley: await surface( 36.25, - 116.83, - 1000 ), deep: await surface( 36.25, - 116.83, - 2000 ) };

		} );
		assert.equal( asked.pacific, - 28 );
		assert.equal( asked.valley, null );
		assert.ok( Math.abs( asked.deep + 30 ) < 5, JSON.stringify( asked ) );
		await padBack( page );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'a big lake whose bed Google draws (the pad 200 m under Lake Baikal\'s surface): started on the lake\'s surface, 455.5 m over the sea\'s height, water like the sea: ridden on with no boost pads, a floating ride throwing up spray, and from an island driven off into it, on across its surface, not the bed; 14 m under it, on that as before', async () => {

		const lake = await dropInOver( page, '53.25, 108.1', 200 );
		console.log( 'Lake Baikal:', JSON.stringify( lake ) );
		assert.ok( lake.sea && lake.colliders === 2 && lake.toast === null && Math.abs( lake.height - lake.level - 455.5 ) < 0.01, JSON.stringify( lake ) );
		assert.ok( Math.abs( lake.y ) < 0.01 && Math.abs( lake.look.level ) < 0.01 && ! lake.look.dry, JSON.stringify( lake ) );
		await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
		await shot( page, 'drive-lake' );
		const result = await page.evaluate( async () => {

			const { createDriveFx } = await import( '/src/drive-fx.js' );
			const { driver: d, sea, pads, ground, scene, water } = window.drive;
			const spray = () => scene.getObjectByName( 'drive-fx' ).children.filter( o => o.isSprite && o.visible ).length;
			// The foam on the water among the effects (flat quads), made with them only for a ride
			// that floats.
			const foam = () => scene.getObjectByName( 'drive-fx' ).children.filter( o => o.isMesh && o.geometry.type === 'PlaneGeometry' ).length;
			const step = ( seconds, each ) => {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					sea.follow( d.east, d.north );
					pads.update( 1 / 60 );
					if ( each?.() === false ) return;

				}

			};
			for ( const code of [ ...d.keys ] ) d.release( code );
			// They're off until they're switched on.
			pads.enabled = true;
			const out = { low: Infinity, high: - Infinity, onWater: 0, pads: 0, spray: 0 };
			const watch = () => {

				out.low = Math.min( out.low, d.y );
				out.high = Math.max( out.high, d.y );
				if ( water.at( d.east, d.north, d.y ) !== null ) out.onWater += 1 / 60;
				out.pads = Math.max( out.pads, pads.pads.filter( p => p.state !== 'free' ).length );

			};
			// Driven on for 4 s, then 2 s more floating: the hovercraft's tuning on the kart, and its
			// effects made again as drive.js makes them for a ride that floats, with water's spray and
			// foam, which the kart's own don't have.
			d.press( 'KeyW' );
			step( 4, watch );
			out.foam = { kart: foam() };
			d.floats = true;
			d.fx.dispose();
			d.fx = createDriveFx( d.models.group.parent, d.spec.fx, { water: true, effects: d.effects } );
			out.foam.floats = foam();
			step( 2, () => {

				watch();
				out.spray = Math.max( out.spray, spray() );

			} );
			d.floats = false;
			d.fx.dispose();
			d.fx = createDriveFx( d.models.group.parent, d.spec.fx, { effects: d.effects } );
			pads.enabled = false;
			// An island 0.3 m over the lake, 40 m across, 20 m ahead: a slab cut from the pad. Over it
			// and off its far end, on till 40 m past it.
			const pad = ground.getColliders()[ 0 ];
			const island = pad.children.find( child => child.isMesh ).clone();
			const top = d.y + 0.3;
			island.scale.set( 40 / 4000, 40 / 2000, 1 );
			island.position.set( - d.east, top - pad.position.y, d.north + 40 );
			pad.add( island );
			island.updateMatrixWorld( true );
			Object.assign( d, { heading: 0, course: 0, view: 0, speed: 8, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, onWater: false } );
			const start = d.north;
			let onIsland = 0;
			step( 20, () => {

				if ( Math.abs( d.y - top ) < 0.05 ) onIsland += 1 / 60;
				return d.north < start + 100;

			} );
			d.release( 'KeyW' );
			step( 0.2 );
			out.island = { at: [ start + 20, start + 60 ], onIsland, north: d.north, lake: d.y - ( top - 0.3 ), bed: d.y - pad.position.y, wet: water.at( d.east, d.north, d.y ) !== null };
			island.removeFromParent();
			return out;

		} );
		console.log( 'Lake Baikal, driven on:', JSON.stringify( result ) );
		assert.ok( result.onWater > 5.5 && result.pads === 0 && Math.abs( result.low ) < 0.01 && Math.abs( result.high ) < 0.01, JSON.stringify( result ) );
		assert.ok( result.spray > 0 && result.foam.kart === 0 && result.foam.floats === 8, JSON.stringify( result ) );
		// Over the island and on out across the lake, on its surface (the lake's curve over 100 m is
		// a few centimetres), far over its bed.
		assert.ok( result.island.onIsland > 1 && result.island.north > result.island.at[ 1 ] + 30 && result.island.wet, JSON.stringify( result.island ) );
		assert.ok( Math.abs( result.island.lake ) < 0.05 && result.island.bed > 199, JSON.stringify( result.island ) );
		const near = await dropInOver( page, '53.25, 108.1', 14 );
		assert.ok( ! near.sea && near.colliders === 1 && near.toast === null && Math.abs( near.y + 14 ) < 0.5, JSON.stringify( near ) );
		// The drop-in's own question, with the bed as Google draws it, 1.6 km under the lake's surface.
		const deep = await page.evaluate( async () => ( await window.drive.waterOver( 53.25, 108.1, null, - 1640 ) ) );
		assert.ok( deep && deep.lake.name === 'Lake Baikal' && deep.over === 455.5 && Math.abs( deep.height - lake.level - 455.5 ) < 0.01, JSON.stringify( deep ) );
		await padBack( page );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'land in a coast\'s square walled off from the sea (the side of the Assal depression by the Ghoubbet): the pad 28 m under the sea with ground 20 m over it 100 m off, on the pad as before; with that ground 10 m over the sea, or 200 m off, the sea\'s surface', async () => {

		// A slab of ground 40 m across, `over` m over the sea's surface and `off` m east of the pin, cut
		// from the pad (28 m under the sea) as the islands are; then the pin dropped in on.
		const walled = async ( over, off ) => {

			await page.evaluate( ( { over, off } ) => {

				const pad = window.drive.ground.getColliders()[ 0 ];
				pad.getObjectByName( 'test-wall' )?.removeFromParent();
				const wall = pad.children.find( child => child.isMesh ).clone();
				wall.name = 'test-wall';
				wall.scale.set( 40 / 4000, 40 / 2000, 1 );
				wall.position.set( - off, over + 28, 0 );
				pad.add( wall );
				wall.updateMatrixWorld( true );

			}, { over, off } );
			return dropInOver( page, '11.6045, 42.5004', 28 );

		};
		const rim = await walled( 20, 100 );
		console.log( 'by the Ghoubbet, walled off:', JSON.stringify( rim ) );
		assert.ok( ! rim.sea && rim.colliders === 1 && rim.toast === null && Math.abs( rim.y + 28 ) < 0.5, JSON.stringify( rim ) );
		await shot( page, 'drive-open-sea-walled' );
		const low = await walled( 10, 100 );
		assert.ok( low.sea && low.colliders === 2 && Math.abs( low.height - low.level ) < 0.01 && Math.abs( low.y ) < 0.01, JSON.stringify( low ) );
		const far = await walled( 20, 200 );
		assert.ok( far.sea && far.colliders === 2 && Math.abs( far.y ) < 0.01, JSON.stringify( far ) );
		await page.evaluate( () => window.drive.ground.getColliders()[ 0 ].getObjectByName( 'test-wall' ).removeFromParent() );
		await padBack( page );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'the water\'s surface only by its own water: from Lake Erie\'s (the pad 40 m under it) out over land to Niagara\'s gorge, it\'s gone; back by the lake, in a hollow under its height it stays gone, and on ground over it it\'s there again', async () => {

		const lake = await dropInOver( page, '42.8, -79.1', 40 );
		assert.ok( lake.sea && lake.colliders === 2 && Math.abs( lake.height - lake.level - 173.4 ) < 0.01, JSON.stringify( lake ) );
		const seen = await page.evaluate( async () => {

			const { latLonToEnu } = await import( '/src/geo.js' );
			const { sea, ground, place } = window.drive;
			const now = () => ( { active: sea.active, shown: sea.shown, inScene: !! sea.mesh.parent, colliders: ground.getColliders().length } );
			// All at once, between frames (each frame lays it round the kart, back on the lake). `over`:
			// how far over the lake's height the vehicle is there, where the lake's surface is lower in
			// the scene's flat frame as the Earth curves away (31 m lower at Buffalo, 20 km off).
			const out = {};
			const go = ( name, lat, lon, over ) => {

				const { east, north } = latLonToEnu( lat, lon, place );
				sea.follow( east, north, over - ( east * east + north * north ) / ( 2 * 6371000 ) );
				out[ name ] = now();

			};
			// Below the falls, 6 squares from the lake's: 75 m under it.
			go( 'gorge', 43.0885, - 79.0712, - 75 );
			// Buffalo, a square from it: 3 m under the lake's height, then 3 m over it.
			go( 'hollow', 42.886, - 78.878, - 3 );
			go( 'buffalo', 42.887, - 78.878, 3 );
			go( 'lake', 42.8, - 79.1, 0 );
			return out;

		} );
		console.log( 'Lake Erie, out and back:', JSON.stringify( seen ) );
		assert.deepEqual( seen.gorge, { active: true, shown: false, inScene: false, colliders: 1 } );
		assert.deepEqual( seen.hollow, { active: true, shown: false, inScene: false, colliders: 1 } );
		assert.deepEqual( seen.buffalo, { active: true, shown: true, inScene: true, colliders: 2 } );
		assert.deepEqual( seen.lake, { active: true, shown: true, inScene: true, colliders: 2 } );
		await padBack( page );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'driven out from a coast past Google\'s water, its bed sloping down under the sea\'s height in the sea\'s colours: the sea\'s surface is there before the kart is under it, and on it goes at the sea\'s height, no lower, as it does flown out and let down; R out there; not over ground coloured as land or with no picture to read, nor by a depression inland; over a big lake, once its bed is 15 m under it', async () => {

		// Santa Monica Pier's square of the map, a coast's.
		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1 && Math.abs( coast.y ) < 0.01, JSON.stringify( coast ) );
		await setUpCoast( page );
		const result = await page.evaluate( () => {

			const { driver: d, sea, water, ground, watchSea } = window.drive;
			const kit = window.coastKit;
			const out = {};
			// What a look costs, on the land facing the sea: the ground under the kart and ahead of it
			// looked at, none of it under the water.
			kit.reset( - 250, 0 );
			const begun = performance.now();
			for ( let i = 0; i < 200; i ++ ) watchSea( 1 );
			out.look = { ms: ( performance.now() - begun ) / 200, laid: sea.active };
			// And one from Google's water with the bed 60 m ahead: rays round that on its bearings, as
			// many as it needs to find it open to the sea, spread over the frames after it (each frame's
			// rays counted, down and any along the ground, and timed), and the sea laid.
			const arc = [];
			const { under } = water;
			let rays = 0;
			let along = 0;
			water.under = ( ...args ) => {

				rays ++;
				return under( ...args );

			};
			// (Rays along the ground, main.js's skims, are the only rays cast level, not down: they're
			// cast beside another driver, not in this look, so none are counted here.)
			ground.cast = function ( origin, direction, far ) {

				if ( Math.abs( direction.y ) < 0.01 ) {

					rays ++;
					along ++;

				}

				return Object.getPrototypeOf( this ).cast.call( this, origin, direction, far );

			};
			for ( let i = 0; i < 20; i ++ ) {

				kit.reset( - 320, 0 );
				const look = { frames: 0, ms: 0, total: 0, most: 0, rays: 0, laid: false };
				for ( let frame = 0; frame < 30 && ! look.laid; frame ++ ) {

					const [ cast, started ] = [ rays, performance.now() ];
					watchSea( frame ? 1 / 60 : 1 );
					look.ms = Math.max( look.ms, performance.now() - started );
					look.total += performance.now() - started;
					look.most = Math.max( look.most, rays - cast );
					look.rays += rays - cast;
					look.frames = frame + 1;
					look.laid = sea.shown;

				}

				arc.push( look );

			}

			water.under = under;
			delete ground.cast;
			const middle = key => arc.map( look => look[ key ] ).sort( ( a, b ) => a - b )[ 10 ];
			out.arc = { ms: middle( 'ms' ), total: middle( 'total' ), rays: rays / 20, along, most: Math.max( ...arc.map( look => look.most ) ), frames: arc.map( look => look.frames ), laid: arc.every( look => look.laid ) };
			// Driven out at up to 50 km/h, over Google's water and on out over the bed.
			kit.reset( - 250, 40 );
			d.press( 'KeyW' );
			const drove = { low: Infinity, laid: null };
			kit.step( 60, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				drove.low = Math.min( drove.low, d.y );
				if ( sea.shown && ! drove.laid ) drove.laid = { north: d.north, y: d.y };
				return d.north > - 700;

			} );
			d.release( 'KeyW' );
			kit.step( 0.5 );
			out.drove = { ...drove, north: d.north, y: d.y, grounded: d.grounded && ! d.air, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( d.north ) };
			// R out there: a few metres on, on the water.
			const north = d.north;
			d.press( 'KeyR' );
			d.release( 'KeyR' );
			out.r = { moved: north - d.north, y: d.y, surface: water.at( d.east, d.north, d.y ) };
			// Flown out from the land, and let down over the bed, its picture the turquoise of clear
			// shallow water.
			kit.paint( [ 40, 170, 190 ] );
			kit.reset( - 250, 60 );
			d.press( 'KeyW' );
			d.press( 'KeyF' );
			const flew = { high: - Infinity, laid: null };
			kit.step( 40, () => {

				flew.high = Math.max( flew.high, d.y );
				if ( sea.shown && ! flew.laid ) flew.laid = { north: d.north, y: d.y };
				return d.north > - 560;

			} );
			d.release( 'KeyF' );
			kit.step( 30, () => d.flying || ! d.grounded );
			d.release( 'KeyW' );
			kit.step( 0.2 );
			out.flew = { ...flew, north: d.north, y: d.y, flying: d.flying, grounded: d.grounded, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( d.north ) };
			// The same slope coloured as sand, as dry land under the sea's height by a coast is (the
			// side of the Assal depression, in the Ghoubbet's coast square): no water over it, and the
			// kart on down it.
			kit.paint( [ 205, 185, 165 ] );
			kit.reset( - 250, 40 );
			d.press( 'KeyW' );
			const sand = { laid: false };
			kit.step( 40, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				sand.laid ||= sea.active;
				return d.north > - 600;

			} );
			d.release( 'KeyW' );
			out.sand = { ...sand, north: d.north, y: d.y, bed: kit.bedAt( d.north ) };
			// With no picture to read (the pad's own ground has none), it's taken for land, as water.js
			// takes it for not water.
			kit.paint( null );
			kit.reset( - 250, 40 );
			d.press( 'KeyW' );
			const unread = { laid: false };
			kit.step( 40, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				unread.laid ||= sea.active;
				return d.north > - 600;

			} );
			d.release( 'KeyW' );
			out.unread = { ...unread, north: d.north, y: d.y, bed: kit.bedAt( d.north ) };
			kit.remove();
			return out;

		} );
		console.log( 'out from a coast:', JSON.stringify( result ) );
		const { look, arc, drove, r, flew, sand, unread } = result;
		// A look (three spots: three rays, and the map and the sea's height read) takes a small share
		// of a millisecond, four times a second; on the land it lays nothing.
		assert.ok( look.ms < 1 && ! look.laid, JSON.stringify( look ) );
		// One that finds the bed and looks round it (36 rays down here on the pad, none along the
		// ground), a few milliseconds at most, once, spread over four frames or a few more, no frame
		// casting more than 12 of them.
		assert.ok( arc.laid && arc.total < 10 && arc.ms < 10 && arc.most <= 12 && arc.along === 0 && arc.frames.every( frames => frames >= Math.ceil( arc.rays / 12 ) && frames <= 20 ), JSON.stringify( arc ) );
		// Laid while the kart was still on Google's water at the sea's height, never under it, and
		// driven on over the bed, 18 m under it by the end, on the surface at the sea's height (a few
		// centimetres lower 400 m out, as the Earth curves away).
		assert.ok( drove.laid && drove.laid.north > - 345 && drove.laid.y > - 2.01, JSON.stringify( drove ) );
		assert.ok( drove.north < - 700 && drove.grounded && drove.surface !== null && Math.abs( drove.y - drove.surface ) < 0.01, JSON.stringify( drove ) );
		assert.ok( Math.abs( drove.surface + 2 ) < 0.2 && drove.low > drove.surface - 0.01 && drove.y > drove.bed + 15, JSON.stringify( drove ) );
		assert.ok( Math.abs( r.moved - 4 ) < 0.01 && r.surface !== null && Math.abs( r.y - r.surface ) < 0.01, JSON.stringify( r ) );
		// Flown out, the surface laid under it in the air, and down onto it.
		assert.ok( flew.laid && flew.laid.y > 0 && flew.high > 3, JSON.stringify( flew ) );
		assert.ok( flew.north < - 560 && ! flew.flying && flew.grounded && flew.surface !== null && Math.abs( flew.y - flew.surface ) < 0.01 && flew.y > flew.bed + 10, JSON.stringify( flew ) );
		assert.ok( Math.abs( flew.surface + 2 + flew.north ** 2 / ( 2 * 6371000 ) ) < 0.1, JSON.stringify( flew ) );
		// Coloured as sand, it's ground: driven on down it, with no water over it; and so with no
		// picture.
		assert.ok( ! sand.laid && sand.north < - 590 && sand.y < - 14 && Math.abs( sand.y - sand.bed ) < 0.3, JSON.stringify( sand ) );
		assert.ok( ! unread.laid && unread.north < - 590 && unread.y < - 14 && Math.abs( unread.y - unread.bed ) < 0.3, JSON.stringify( unread ) );
		await padBack( page );

		// Death Valley's square, land: the same slope down under the sea's height is ground, and the
		// kart goes on down it.
		const valley = await dropInOver( page, '36.25, -116.83', 0 );
		assert.ok( ! valley.sea && valley.colliders === 1, JSON.stringify( valley ) );
		await setUpCoast( page );
		const inland = await page.evaluate( () => {

			const { driver: d, sea } = window.drive;
			const kit = window.coastKit;
			kit.reset( - 250, 40 );
			d.press( 'KeyW' );
			let laid = false;
			kit.step( 40, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				laid ||= sea.active;
				return d.north > - 600;

			} );
			d.release( 'KeyW' );
			const out = { laid, north: d.north, y: d.y, bed: kit.bedAt( d.north ) };
			kit.remove();
			return out;

		} );
		console.log( 'a depression inland:', JSON.stringify( inland ) );
		assert.ok( ! inland.laid && inland.north < - 590 && inland.y < - 14 && Math.abs( inland.y - inland.bed ) < 0.3, JSON.stringify( inland ) );
		await padBack( page );

		// Lake Baikal's square, all of it the lake, the pad's water at the lake's height: flown out over
		// the same slope, the lake's surface is laid only once its bed is more than 15 m under it (as
		// for a drop-in), and the kart comes down on it.
		const baikal = await dropInOver( page, '53.25, 108.1', 0 );
		assert.ok( ! baikal.sea && baikal.colliders === 1, JSON.stringify( baikal ) );
		await setUpCoast( page );
		const lake = await page.evaluate( () => {

			const { driver: d, sea, water } = window.drive;
			const kit = window.coastKit;
			kit.reset( - 250, 60 );
			d.press( 'KeyW' );
			d.press( 'KeyF' );
			let laid = null;
			kit.step( 40, () => {

				if ( sea.shown && ! laid ) laid = { north: d.north, y: d.y };
				return d.north > - 700;

			} );
			d.release( 'KeyF' );
			kit.step( 30, () => d.flying || ! d.grounded );
			d.release( 'KeyW' );
			kit.step( 0.2 );
			const out = { laid, north: d.north, y: d.y, grounded: d.grounded && ! d.flying, surface: water.at( d.east, d.north, d.y ) };
			kit.remove();
			return out;

		} );
		console.log( 'flown out over a big lake:', JSON.stringify( lake ) );
		assert.ok( lake.laid && lake.laid.north < - 500 && lake.laid.y > 0, JSON.stringify( lake ) );
		// (Down far out, where the lake's surface is lower under the scene's flat frame as the Earth
		// curves away.)
		assert.ok( lake.grounded && lake.surface !== null && Math.abs( lake.y - lake.surface ) < 0.01, JSON.stringify( lake ) );
		assert.ok( Math.abs( lake.surface + 2 + lake.north ** 2 / ( 2 * 6371000 ) ) < 0.1, JSON.stringify( lake ) );
		await padBack( page );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'a seafront with houses a promenade\'s width behind the beach and Google\'s water only 10 m wide: driven straight out, and reversed out, the sea\'s surface is laid before the kart is 1.5 m under it; started out on the bed 5 m under the sea\'s height, in a hollow, nothing is laid, though the bed ahead is open to the sea', async () => {

		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page, { strip: 10, houses: true } );
		const result = await page.evaluate( () => {

			const { driver: d, sea, water } = window.drive;
			const kit = window.coastKit;
			// Down the street to the beach and on out to sea, at up to 50 km/h: forward, or facing the
			// land with S held.
			const out = ( kmh, heading, key ) => {

				kit.reset( - 250, kmh, heading );
				d.press( key );
				const drove = { low: Infinity, laid: null };
				kit.step( 120, () => {

					d.speed = Math.max( - 50 / 3.6, Math.min( d.speed, 50 / 3.6 ) );
					if ( sea.shown ) drove.laid ??= { north: d.north, y: d.y };
					else drove.low = Math.min( drove.low, d.y );
					return d.north > - 600;

				} );
				d.release( key );
				kit.step( 0.5 );
				return { ...drove, north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( d.north ) };

			};
			const ahead = out( 40, 180, 'KeyW' );
			const back = out( - 10, 0, 'KeyS' );
			// Started on the bed out past Google's water, 5.5 m under the water's height, and driven on.
			kit.reset( - 400, 30 );
			d.press( 'KeyW' );
			const hollow = { laid: false, start: kit.bedAt( d.north ), y: d.y };
			kit.step( 20, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				hollow.laid ||= sea.active;
				return d.north > - 600;

			} );
			d.release( 'KeyW' );
			Object.assign( hollow, { north: d.north, end: d.y, bed: kit.bedAt( d.north ) } );
			kit.remove();
			return { ahead, back, hollow };

		} );
		console.log( 'a seafront, out to sea:', JSON.stringify( result ) );
		const { ahead, back, hollow } = result;
		// Laid with the kart no more than 1.5 m under the water's height (2 m under the pad's land),
		// and on across it at that height, the bed far under it.
		for ( const drove of [ ahead, back ] ) {

			assert.ok( drove.laid && drove.low > - 3.5 && drove.laid.y > - 3.5, JSON.stringify( drove ) );
			assert.ok( drove.north < - 590 && drove.surface !== null && Math.abs( drove.y - drove.surface ) < 0.01 && Math.abs( drove.surface + 2 ) < 0.1 && drove.y > drove.bed + 10, JSON.stringify( drove ) );

		}

		// In the hollow, on along the bed: under the water's height, the water would be over it.
		assert.ok( Math.abs( hollow.y - hollow.start ) < 0.3 && hollow.start < - 7, JSON.stringify( hollow ) );
		assert.ok( ! hollow.laid && hollow.north < - 590 && Math.abs( hollow.end - hollow.bed ) < 0.3, JSON.stringify( hollow ) );
		await padBack( page );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'a harbour: driven out from a coast past a row of boats moored 90 m out (8 m long, 2.2, 2.5 or 3 m over the water, every 15 or 25 m, the way out through a gap 37 m wide), between two jetties 50 or 80 m apart (their decks 2.5 or 4 m over it, 200 m out), and through a marina (boats moored along each side of jetties 50 m apart), the sea\'s surface is laid before the kart is 1.5 m under it, at 50 and 25 km/h; and flown out 20 m over the water at 50 km/h past the boats 2.5 m over it, either pair of jetties and the marina, it\'s laid within 5 m past Google\'s water, the frame loop\'s look casting no rays along the ground (so that coming down among them you come down on it)', async () => {

		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page );
		const result = await page.evaluate( async () => {

			const { driver: d, sea, ground, watchSea } = window.drive;
			const kit = window.coastKit;
			// Boats 8 m by 3 m, their north ends at `north`, every `every` m from 150 m west to 150 m
			// east, but for the way out (east -22 to 15).
			const boats = ( north, every = 15 ) => {

				const out = [];
				for ( let east = - 150; east <= 150; east += every ) if ( Math.abs( east + 4 ) > 12 ) out.push( [ east, east + 8, north - 3, north ] );
				return out;

			};
			// Jetties 4 m wide `apart` m apart either side of the way out, from the shore 200 m out.
			const jetties = apart => [ [ apart / 2, apart / 2 + 4, - 480, - 280 ], [ - apart / 2 - 4, - apart / 2, - 480, - 280 ] ];
			const marina = [ - 125, - 75, - 25, 25, 75, 125 ].flatMap( east => [ [ east - 2, east + 2, - 480, - 280 ], ...[ - 352, - 364, - 376, - 388, - 400, - 412, - 424, - 436, - 448, - 460 ].flatMap( north => [ [ east + 3, east + 11, north - 3, north ], [ east - 11, east - 3, north - 3, north ] ] ) ] );
			// Each as boxes standing `over` m over the water (2 m under the pad's land) from under the bed.
			const HARBOUR = {
				'boats 2.5 m': [ boats( - 430 ), 2.5 ],
				'boats 2.2 m': [ boats( - 430 ), 2.2 ],
				'boats 3 m': [ boats( - 430 ), 3 ],
				'boats every 25 m': [ boats( - 430, 25 ), 2.5 ],
				'jetties 50 m apart': [ jetties( 50 ), 2.5 ],
				'jetties 80 m apart': [ jetties( 80 ), 2.5 ],
				'jetties 80 m apart, 4 m': [ jetties( 80 ), 4 ],
				'a marina': [ marina, 2.5 ],
			};
			// Those flown out over too.
			const FLOWN = [ 'boats 2.5 m', 'jetties 50 m apart', 'jetties 80 m apart', 'a marina' ];
			const out = {};
			const flown = {};
			for ( const [ name, [ boxes, over ] ] of Object.entries( HARBOUR ) ) {

				const things = await window.padKit.houses( boxes, - 30, 28 + over );
				for ( const kmh of [ 50, 25 ] ) {

					kit.reset( - 250, kmh );
					d.press( 'KeyW' );
					const drove = { low: Infinity, laid: null };
					kit.step( 60, () => {

						d.speed = Math.min( d.speed, kmh / 3.6 );
						if ( sea.shown ) drove.laid ??= { north: + d.north.toFixed( 1 ), y: + d.y.toFixed( 2 ) };
						else drove.low = Math.min( drove.low, d.y );
						return d.north > - 600 && ! drove.laid;

					} );
					d.release( 'KeyW' );
					out[ `${ name }, ${ kmh } km/h` ] = { ...drove, low: + drove.low.toFixed( 2 ), north: + d.north.toFixed( 1 ) };

				}

				// Flown out 20 m over the water at 50 km/h, 30 frames a second, the rays along the ground
				// (any ground.cast level, not down) counted.
				if ( FLOWN.includes( name ) ) {

					let along = 0;
					ground.cast = function ( origin, direction, far ) {

						if ( Math.abs( direction.y ) < 0.01 ) along ++;
						return Object.getPrototypeOf( this ).cast.call( this, origin, direction, far );

					};
					kit.reset( - 250, 50 );
					while ( ! sea.shown && d.north > - 700 ) {

						d.north -= 50 / 3.6 / 30;
						Object.assign( d, { y: kit.surface + 20, vy: 0, speed: 50 / 3.6, flying: true, grounded: false } );
						sea.follow( d.east, d.north, d.y );
						watchSea( 1 / 30 );

					}

					delete ground.cast;
					flown[ name ] = { laid: sea.shown ? { north: + d.north.toFixed( 1 ) } : null, along, north: + d.north.toFixed( 1 ) };

				}

				things.removeFromParent();

			}

			kit.remove();
			return { out, flown };

		} );
		console.log( 'a harbour, driven out:', JSON.stringify( result.out ) );
		console.log( 'a harbour, flown out:', JSON.stringify( result.flown ) );
		await padBack( page );
		// Laid with the kart no more than 1.5 m under the water's height (2 m under the pad's land).
		for ( const [ name, drove ] of Object.entries( result.out ) ) assert.ok( drove.laid && drove.low > - 3.5 && drove.laid.y > - 3.5, `${ name }: ${ JSON.stringify( drove ) }` );
		// Flown: laid no more than 5 m past Google's water (its edge at north -340), with no rays along.
		for ( const [ name, run ] of Object.entries( result.flown ) ) assert.ok( run.laid && run.laid.north > - 345 && run.along === 0, `${ name }, flown: ${ JSON.stringify( run ) }` );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'driven out from a coast with the keyboard, the frame loop\'s own look lays the sea\'s surface before the kart is 1.5 m under it, its look round the bed spread over frames (never more than 12 rays in one), and on it drives', async () => {

		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page );
		await page.evaluate( () => {

			const { driver: d, sea, water, ground } = window.drive;
			window.coastKit.reset( - 250, 0 );
			// Each frame as the page draws it: how low the kart went before the sea was laid, and
			// where it was laid; and the most rays any one frame cast round a spot to see it's open to
			// the water (down, and any along the ground: main.js's skims, the only rays cast level,
			// which this look doesn't cast), how many in all, and how many of them along.
			const seen = window.coastSeen = { low: Infinity, laid: null, done: false, rays: 0, most: 0, along: 0 };
			const under = window.coastUnder = water.under;
			let rays = 0;
			water.under = ( ...args ) => {

				rays ++;
				return under( ...args );

			};
			ground.cast = function ( origin, direction, far ) {

				if ( Math.abs( direction.y ) < 0.01 ) {

					rays ++;
					seen.along ++;

				}

				return Object.getPrototypeOf( this ).cast.call( this, origin, direction, far );

			};
			const look = () => {

				if ( sea.shown ) seen.laid ??= { north: d.north, y: d.y };
				else seen.low = Math.min( seen.low, d.y );
				seen.most = Math.max( seen.most, rays );
				seen.rays += rays;
				rays = 0;
				if ( ! seen.done ) requestAnimationFrame( look );

			};
			requestAnimationFrame( look );

		} );
		await page.keyboard.down( 'KeyW' );
		await page.waitForFunction( () => window.coastSeen.laid && window.drive.driver.north < - 500, null, { timeout: 120000 } );
		await page.keyboard.up( 'KeyW' );
		await shot( page, 'drive-out-from-a-coast' );
		const seen = await page.evaluate( () => {

			const { driver: d, water, ground } = window.drive;
			window.coastSeen.done = true;
			water.under = window.coastUnder;
			delete ground.cast;
			const out = { ...window.coastSeen, north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: window.coastKit.bedAt( d.north ) };
			window.coastKit.remove();
			return out;

		} );
		console.log( 'out from a coast, frame by frame:', JSON.stringify( seen ) );
		assert.ok( seen.laid && seen.low > - 3.5, JSON.stringify( seen ) );
		// Its look round the bed it found spread over frames: never more than 12 rays in one, all down.
		assert.ok( seen.rays >= 12 && seen.most <= 12 && seen.along === 0, JSON.stringify( seen ) );
		assert.ok( seen.surface !== null && Math.abs( seen.y - seen.surface ) < 0.05 && Math.abs( seen.surface + 2 ) < 0.2 && seen.y > seen.bed + 7, JSON.stringify( seen ) );
		await padBack( page );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'the look round a spot to see it\'s open to the water is spread over frames: driven out from a coast, out past houses behind the beach (forward and reversing) and down New Orleans\' street, no frame casts more than 12 of its rays, all of them down (none along the ground: those are only beside another driver); with each ray into ground no ray had reached as slow as a tile\'s first (5 ms, building its hierarchy), no more than one of those a frame, and the sea is still laid before the kart is 1.5 m under it, at 50 km/h, and at 100 km/h and 20 frames a second wherever in its quarter of a second the look falls; and with tiles 15 or 10 m across, each one\'s first ray 20 ms, at 100 and 300 km/h, still one a frame, and laid', async () => {

		// In the page: drives as each kit has them, at up to 50 km/h, each frame's rays round a spot
		// counted, with the most in one frame, how many in all and in how many frames, how low the
		// kart went before the sea was laid and where it was laid. With `countSlow`, the first ray into
		// each square `countSize` m across (25 unless said: a tile; near the camera they can be as
		// small as 10 m) takes that many ms more, as a tile's first ray does on Google's tiles, building
		// its bounding volume hierarchy (src/raycast.js: 5 ms is a tile of about 15,000 triangles here):
		// those counted too. (More than main.js's OPEN_MS, 4, so that no frame has two.)
		const counting = () => page.evaluate( () => {

			const { driver: d, sea, water, ground } = window.drive;
			const under = window.countUnder = water.under;
			const reached = new Set();
			let rays = 0;
			let fresh = 0;
			let squares = 0;
			let along = 0;
			// The first ray into ( east, north )'s square, slow: whether it was.
			const into = ( east, north ) => {

				const size = window.countSize ?? 25;
				const square = `${ Math.floor( east / size ) } ${ Math.floor( north / size ) }`;
				if ( ! window.countSlow || reached.has( square ) ) return false;
				reached.add( square );
				squares ++;
				const until = performance.now() + window.countSlow;
				while ( performance.now() < until );
				return true;

			};
			water.under = ( ...args ) => {

				rays ++;
				if ( into( args[ 0 ], args[ 1 ] ) ) fresh ++;
				return under( ...args );

			};
			// And any ray along the ground (main.js's skims, the only rays cast level, not down: beside
			// another driver, never in this look), counted, and into every square it passes through, as
			// a ray builds the hierarchy of every tile whose bounds it passes through. (`fresh` counts rays
			// into new ground, `squares` the squares.)
			ground.cast = function ( origin, direction, far ) {

				if ( Math.abs( direction.y ) < 0.01 ) {

					rays ++;
					along ++;
					let any = false;
					for ( let t = 0; t <= far; t ++ ) any = into( - origin.x - direction.x * t, origin.z + direction.z * t ) || any;
					if ( any ) fresh ++;

				}

				return Object.getPrototypeOf( this ).cast.call( this, origin, direction, far );

			};
			window.countSlow = 0;
			window.countDrive = ( kit, { north = - 250, kmh = 40, heading = 180, key = 'KeyW', end = - 600 } = {} ) => {

				kit.reset( north, kmh, heading );
				reached.clear();
				rays = fresh = squares = along = 0;
				d.press( key );
				const run = { most: 0, rays: 0, frames: 0, fresh: 0, mostFresh: 0, squares: 0, mostSquares: 0, low: Infinity, laid: null };
				kit.step( 120, () => {

					d.speed = Math.max( - 50 / 3.6, Math.min( d.speed, 50 / 3.6 ) );
					run.most = Math.max( run.most, rays );
					run.mostFresh = Math.max( run.mostFresh, fresh );
					run.mostSquares = Math.max( run.mostSquares, squares );
					run.rays += rays;
					run.fresh += fresh;
					run.squares += squares;
					if ( rays ) run.frames ++;
					rays = fresh = squares = 0;
					if ( sea.shown ) run.laid ??= { north: d.north, y: d.y };
					else run.low = Math.min( run.low, d.y );
					return d.north > end;

				} );
				d.release( key );
				return { ...run, along, north: d.north, y: d.y };

			};
			// The same, out from the coast at `fps` frames a second (as on a slow phone) and held at
			// `kmh`: each frame's rays counted, and how long the frame's look took, till the sea's laid.
			// Where in its quarter of a second the look falls is set by a look on the land first, and
			// `phase` s of the next gone by.
			window.countFrames = ( kit, { kmh, fps, phase } ) => {

				kit.reset( - 250, kmh );
				reached.clear();
				window.drive.watchSea( 1 );
				if ( phase ) window.drive.watchSea( phase );
				rays = fresh = squares = along = 0;
				d.press( 'KeyW' );
				const run = { phase, most: 0, rays: 0, fresh: 0, mostFresh: 0, squares: 0, mostSquares: 0, low: Infinity, laid: null, ms: 0 };
				for ( let i = 0; i < 20 * fps && ! run.laid && d.north > - 600; i ++ ) {

					d.speed = kmh / 3.6;
					d.update( 1 / fps );
					sea.follow( d.east, d.north, d.y );
					const begun = performance.now();
					window.drive.watchSea( 1 / fps );
					run.ms = Math.max( run.ms, performance.now() - begun );
					run.most = Math.max( run.most, rays );
					run.mostFresh = Math.max( run.mostFresh, fresh );
					run.mostSquares = Math.max( run.mostSquares, squares );
					run.rays += rays;
					run.fresh += fresh;
					run.squares += squares;
					rays = fresh = squares = 0;
					if ( sea.shown ) run.laid = { north: d.north, y: d.y, s: ( i + 1 ) / fps };
					else run.low = Math.min( run.low, d.y );

				}

				d.release( 'KeyW' );
				return { ...run, along, ms: + run.ms.toFixed( 1 ), north: d.north, y: d.y };

			};

		} );
		const uncounted = () => page.evaluate( () => {

			window.drive.water.under = window.countUnder;
			delete window.drive.ground.cast;

		} );

		// Out from Santa Monica Pier over the bed (36 rays to find it open), and again with every ray
		// slow.
		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page );
		await counting();
		const pier = await page.evaluate( () => {

			const kit = window.coastKit;
			const plain = window.countDrive( kit );
			window.countSlow = 5;
			const slow = window.countDrive( kit );
			// At 20 frames a second and 100 km/h, a look every five frames and the spot it finds 83 m
			// ahead, 7 m on from the last; the look's place in its quarter of a second five ways.
			const phone = [ 0, 0.05, 0.1, 0.15, 0.2 ].map( phase => window.countFrames( kit, { kmh: 100, fps: 20, phase } ) );
			// Tiles 15 and 10 m across, as Google's can be near the camera, each one's first ray 20 ms
			// (a tile of about 60,000 triangles), at 100 and 300 km/h and 20 frames a second.
			window.countSlow = 20;
			const small = [];
			for ( const size of [ 15, 10 ] ) for ( const kmh of [ 100, 300 ] ) {

				window.countSize = size;
				small.push( { size, ...window.countFrames( kit, { kmh, fps: 20, phase: 0.1 } ) } );

			}

			window.countSize = 25;
			window.countSlow = 0;
			kit.remove();
			return { plain, slow, phone, small };

		} );
		await uncounted();
		await padBack( page );
		// Past the houses behind a beach, forward and reversing.
		await dropInOver( page, '34.0065, -118.4985', 0 );
		await setUpCoast( page, { strip: 10, houses: true } );
		await counting();
		const seafront = await page.evaluate( () => {

			const kit = window.coastKit;
			const out = { ahead: window.countDrive( kit ), back: window.countDrive( kit, { kmh: - 10, heading: 0, key: 'KeyS' } ) };
			kit.remove();
			return out;

		} );
		await uncounted();
		await padBack( page );
		// Off New Orleans' levee and down its street, where every look finds ground under the sea
		// ahead and looks round it.
		await dropInOver( page, '30.03, -90.08', 0 );
		await setUpPolder( page );
		await counting();
		const polder = await page.evaluate( () => {

			const kit = window.polderKit;
			const out = window.countDrive( kit, { north: - 150, end: - 750 } );
			kit.remove();
			return out;

		} );
		await uncounted();
		await padBack( page );
		console.log( 'a look round a spot, frame by frame:', JSON.stringify( { pier, seafront, polder } ) );
		const { plain, slow, phone, small } = pier;
		// Off the pier: its 36 rays down over three frames or more, none along the ground, and the sea
		// laid as before, with the kart still on Google's water at the sea's height, never under it.
		assert.ok( plain.most <= 12 && plain.rays >= 36 && plain.frames >= 3 && plain.along === 0, JSON.stringify( plain ) );
		assert.ok( plain.laid && plain.laid.north > - 345 && plain.laid.y > - 2.01 && plain.low > - 2.01, JSON.stringify( plain ) );
		// Each ray into new ground slow: no more than one of those a frame (each ray down reaches one
		// tile first), so as many frames or more, and laid a few metres on, still on Google's water.
		assert.ok( slow.most <= 12 && slow.mostFresh === 1 && slow.mostSquares === 1 && slow.fresh >= 30 && slow.frames >= slow.fresh, JSON.stringify( slow ) );
		assert.ok( slow.laid && slow.laid.north > - 345 && slow.laid.y > - 2.01 && slow.low > - 2.01, JSON.stringify( slow ) );
		// At 20 frames a second and 100 km/h, wherever the looks fall: the look round the first spot
		// found carried on till it's known (not begun again round each newer spot), never more than 12
		// rays nor more than one slow one in a frame, and laid before the kart is 1.5 m under it; and so
		// with tiles 15 or 10 m across, at 100 and 300 km/h (at 300, the spot it finds farther out, and
		// open with fewer rays).
		for ( const run of phone ) assert.ok( run.most <= 12 && run.mostFresh === 1 && run.mostSquares === 1 && run.along === 0 && run.fresh >= 30 && run.laid && run.low > - 3.5 && run.laid.y > - 3.5, JSON.stringify( run ) );
		for ( const run of small ) assert.ok( run.most <= 12 && run.mostFresh === 1 && run.mostSquares === 1 && run.along === 0 && run.fresh >= 20 && run.laid && run.low > - 3.5 && run.laid.y > - 3.5, JSON.stringify( run ) );
		for ( const run of [ seafront.ahead, seafront.back ] ) assert.ok( run.most <= 12 && run.rays > 12 && run.along === 0 && run.laid && run.low > - 3.5 && run.laid.y > - 3.5, JSON.stringify( run ) );
		assert.ok( polder.most <= 12 && polder.rays > 0 && polder.along === 0 && ! polder.laid && polder.north < - 740, JSON.stringify( polder ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'New Orleans behind its levee (a coast\'s square by Lake Pontchartrain): driven off the levee down a street 2.5 m under the sea among houses whose roofs stand over it, flown over them and let down, and started in that street, nothing is laid; nor is it beside someone there at the sea\'s height, nor beside someone flying 3.5 m, 20 m or 200 m over the street (in this scene, even with the sea\'s surface already laid over it, or by the drop-in beside them, which starts on the street, with your own sea laid when you left or not), nor beside someone riding on a surface of their own over the street at the sea\'s height, there or 25 m from a crossing (in this scene, and joined from the globe)', async () => {

		const levee = await dropInOver( page, '30.03, -90.08', 0 );
		assert.ok( ! levee.sea && levee.colliders === 1, JSON.stringify( levee ) );
		await setUpPolder( page );
		const result = await page.evaluate( async () => {

			const { driver: d, sea, camera, moveCar, water, ground, watchSea, place } = window.drive;
			const { seaLevel } = await import( '/src/drive-app/sea.js' );
			const kit = window.polderKit;
			// What a look costs on the levee facing the streets, each finding ground under the sea ahead
			// and looking round it (its rays counted, down and any along the ground) to find it closed in.
			kit.reset( - 260, 0 );
			const { under } = water;
			let rays = 0;
			let along = 0;
			water.under = ( ...args ) => {

				rays ++;
				return under( ...args );

			};
			// (Rays along the ground, main.js's skims, are the only rays cast level, not down: they're
			// cast beside another driver, not in this look, so none are counted here.)
			ground.cast = function ( origin, direction, far ) {

				if ( Math.abs( direction.y ) < 0.01 ) {

					rays ++;
					along ++;

				}

				return Object.getPrototypeOf( this ).cast.call( this, origin, direction, far );

			};
			const times = [];
			for ( let i = 0; i < 50; i ++ ) {

				const begun = performance.now();
				watchSea( 1 );
				times.push( performance.now() - begun );

			}

			// (The middle one: the first copies the streets' picture, which the first time in a page
			// takes seconds in software rendering.)
			const look = { ms: times.sort( ( a, b ) => a - b )[ 25 ], rays: rays / 50, along, laid: sea.active };
			water.under = under;
			delete ground.cast;
			// Off the levee and down the street at up to 50 km/h.
			kit.reset( - 150, 40 );
			d.press( 'KeyW' );
			const drove = { laid: false };
			kit.step( 60, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				drove.laid ||= sea.active;
				return d.north > - 750;

			} );
			d.release( 'KeyW' );
			Object.assign( drove, { north: d.north, y: d.y } );
			// Flown off the levee over the houses at up to 50 km/h, let down and driven on.
			kit.reset( - 150, 40 );
			d.press( 'KeyW' );
			d.press( 'KeyF' );
			const flew = { laid: false, high: - Infinity };
			const air = () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				flew.high = Math.max( flew.high, d.y );
				flew.laid ||= sea.active;

			};
			kit.step( 30, () => {

				air();
				return d.north > - 300;

			} );
			d.release( 'KeyF' );
			kit.step( 60, () => {

				air();
				return d.flying || ! d.grounded;

			} );
			kit.step( 2, air );
			d.release( 'KeyW' );
			Object.assign( flew, { north: d.north, y: d.y, grounded: d.grounded && ! d.flying } );
			// Started in the street, and on down it.
			kit.reset( - 400, 30 );
			d.press( 'KeyW' );
			const inside = { laid: false, y: d.y };
			kit.step( 30, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				inside.laid ||= sea.active;
				return d.north > - 700;

			} );
			d.release( 'KeyW' );
			Object.assign( inside, { north: d.north, end: d.y } );
			// Go to beside someone in the street at the sea's height (on a ramp up to the levee, say):
			// put on the street, with no sea laid over it.
			kit.reset( - 150, 0 );
			const moved = moveCar( { local: new camera.position.constructor( 0, kit.surface, - 400 ), heading: 180 } );
			const beside = { at: - 400, moved, sea: sea.active, north: d.north, y: d.y };
			// So too beside someone riding on a surface of their own at the sea's height over that
			// street (as theirs laid within its reach covers it), their car 5 m east of the spot, over
			// the street too: on the street, as the houses close it in, with nothing laid over it. And
			// so 25 m from a crossing (north -365 and -415), where the rays down at 25, 50 and 75 m find
			// a quarter of the way round clear (down the crossing street, between two houses and the
			// yards behind them, and on into the next street), but the ray along each of those bearings
			// meets a house.
			const riders = [];
			for ( const north of [ - 400, - 365, - 415 ] ) {

				kit.reset( - 150, 0 );
				riders.push( { at: north, moved: moveCar( { local: new camera.position.constructor( 0, kit.surface + 0.1, north ), heading: 180, riding: [ 5, 0 ] } ), sea: sea.active, north: d.north, y: d.y } );

			}
			// And beside someone flying 3.5 m (at the roofs' height), 20 m or 200 m over that street:
			// nothing laid, and no ground within reach of them to put the car on, so Go to drops in
			// beside them instead (below). The same with the sea's surface already laid in this scene,
			// over the streets too (as driven out onto the lake and back: it covers the streets within
			// its reach): still no ground in reach of them to put the car on, not that surface among
			// the houses, which close the street in on both sides.
			const fliers = [];
			for ( const over of [ 3.5, 20, 200 ] ) {

				kit.reset( - 150, 0 );
				const flier = { over, moved: moveCar( { local: new camera.position.constructor( 0, kit.surface + over, - 400 ), heading: 180 } ), sea: sea.active };
				kit.reset( - 150, 0 );
				sea.start( { lat: place.lat, lon: place.lon, height: await seaLevel( place.lat, place.lon ) + 2, over: 0, lake: null, east: 0, north: - 150 } );
				const laid = { over, laid: sea.shown, moved: moveCar( { local: new camera.position.constructor( 0, kit.surface + over, - 400 ), heading: 180 } ), north: d.north, y: d.y };
				sea.clear();
				fliers.push( { flier, laid } );

			}

			return { look, drove, flew, inside, beside, riders, fliers };

		} );
		console.log( 'New Orleans behind its levee:', JSON.stringify( result ) );
		await shot( page, 'drive-polder' );
		// That drop-in, with the pad moved so that the street is under the pin, 2.5 m under the sea (a
		// drop-in takes the pad's own height for the water's surface), and the flier 20 m over it.
		const dropped = await dropInBeside( page, 30.03, - 90.08, - 2, 20, { colour: null, shift: 400 } );
		console.log( 'a drop-in beside a flier over New Orleans:', JSON.stringify( dropped ) );
		await shot( page, 'drive-polder-beside-a-flier' );
		// And so with your own sea's surface laid when you left (goTo's `laid`): the street, which the
		// houses close in, not that surface among them.
		const yours = await dropInBeside( page, 30.03, - 90.08, - 2, 20, { colour: null, shift: 400, laid: { lake: null } } );
		console.log( 'the same with your sea laid:', JSON.stringify( yours ) );
		await shot( page, 'drive-polder-beside-a-flier-your-sea-laid' );
		// And joined from the globe beside someone riding on a surface of their own over that street
		// at the sea's height: the street too, as the houses close it in.
		const riding = await joinBeside( page, 30.03, - 90.08, - 2, 0.1, { colour: null, shift: 400 } );
		console.log( 'a drop-in beside a rider over New Orleans:', JSON.stringify( riding ) );
		await shot( page, 'drive-polder-beside-a-rider' );
		// And 25 m from a crossing, the pin over the street at north -365 and -415 of the pad.
		const crossing = [];
		for ( const shift of [ 365, 415 ] ) crossing.push( { shift, ...await joinBeside( page, 30.03, - 90.08, - 2, 0.1, { colour: null, shift } ) } );
		console.log( 'a drop-in beside a rider over New Orleans 25 m from a crossing:', JSON.stringify( crossing ) );
		await shot( page, 'drive-polder-beside-a-rider-by-a-crossing' );
		await page.evaluate( () => window.polderKit.remove() );
		await padBack( page );
		const { look, drove, flew, inside, beside, riders, fliers } = result;
		// Each look a few rays down round the street ahead, none along the ground, a fraction of a
		// millisecond here, and nothing laid.
		assert.ok( ! look.laid && look.rays > 0 && look.rays < 48 && look.along === 0 && look.ms < 10, JSON.stringify( look ) );
		assert.ok( ! drove.laid && drove.north < - 740 && Math.abs( drove.y + 4.5 ) < 0.3, JSON.stringify( drove ) );
		// (Let down on a roof or in the street: dry either way.)
		assert.ok( ! flew.laid && flew.high > 20 && flew.north < - 400 && flew.grounded && ( Math.abs( flew.y + 4.5 ) < 0.3 || Math.abs( flew.y - 1.5 ) < 0.3 ), JSON.stringify( flew ) );
		assert.ok( ! inside.laid && Math.abs( inside.y + 4.5 ) < 0.3 && inside.north < - 690 && Math.abs( inside.end + 4.5 ) < 0.3, JSON.stringify( inside ) );
		assert.equal( riders.length, 3 );
		for ( const there of [ beside, ...riders ] ) assert.ok( there.moved && ! there.sea && Math.abs( there.north - there.at ) < 0.01 && Math.abs( there.y + 4.5 ) < 0.3, JSON.stringify( there ) );
		assert.equal( fliers.length, 3 );
		for ( const { flier, laid } of fliers ) {

			assert.ok( ! flier.moved && ! flier.sea, JSON.stringify( flier ) );
			assert.ok( laid.laid && ! laid.moved && laid.north > - 160, JSON.stringify( laid ) );

		}

		assert.equal( crossing.length, 2 );
		for ( const there of [ dropped, yours, riding, ...crossing ] ) assert.ok( ! there.sea && there.colliders === 1 && Math.abs( there.y + 2.5 ) < 0.3, JSON.stringify( there ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'New Orleans laid out with its houses\' fronts 20 m apart across a street (not 16 m): beside someone riding on a surface of their own at the sea\'s height over the street at north -321, where a bearing threads between the houses past every ray down along it (at 25, 50, 75 and 100 m), nothing is laid, in this scene and joined from the globe; nor beside someone flying 20 m over it with your sea\'s surface laid, in this scene or by the drop-in beside them', async () => {

		await dropInOver( page, '30.03, -90.08', 0 );
		await setUpPolder( page, { rows: [ [ 10, 24 ], [ 36, 50 ] ] } );
		const result = await page.evaluate( async () => {

			const { driver: d, sea, camera, moveCar, place } = window.drive;
			const { seaLevel } = await import( '/src/drive-app/sea.js' );
			const kit = window.polderKit;
			const V = camera.position.constructor;
			// Their car 5 m east of the spot, in the street too.
			kit.reset( - 150, 0 );
			const rider = { moved: moveCar( { local: new V( 0, kit.surface + 0.1, - 321 ), heading: 180, riding: [ 5, 0 ] } ), sea: sea.active, north: d.north, y: d.y };
			// With the sea's surface laid (round the levee, reaching the streets), beside one flying 20 m
			// over the same spot: no ground in reach of them, nor that surface among the houses.
			kit.reset( - 150, 0 );
			sea.start( { lat: place.lat, lon: place.lon, height: await seaLevel( place.lat, place.lon ) + 2, over: 0, lake: null, east: 0, north: - 150 } );
			const flier = { laid: sea.shown, moved: moveCar( { local: new V( 0, kit.surface + 20, - 321 ), heading: 180 } ), north: d.north, y: d.y };
			sea.clear();
			kit.reset( - 150, 0 );
			return { rider, flier };

		} );
		console.log( 'New Orleans with house fronts 20 m apart:', JSON.stringify( result ) );
		await shot( page, 'drive-polder-wide-street' );
		// From the globe, the pin over the street at north -321 of the pad: beside the rider, and beside
		// the flier with your own sea's surface laid when you left.
		const riding = await joinBeside( page, 30.03, - 90.08, - 2, 0.1, { colour: null, shift: 321 } );
		console.log( 'a drop-in beside a rider there:', JSON.stringify( riding ) );
		await shot( page, 'drive-polder-wide-street-beside-a-rider' );
		const yours = await dropInBeside( page, 30.03, - 90.08, - 2, 20, { colour: null, shift: 321, laid: { lake: null } } );
		console.log( 'a drop-in beside a flier there, your sea laid:', JSON.stringify( yours ) );
		await shot( page, 'drive-polder-wide-street-beside-a-flier-your-sea-laid' );
		await page.evaluate( () => window.polderKit.remove() );
		await padBack( page );
		const { rider, flier } = result;
		assert.ok( rider.moved && ! rider.sea && Math.abs( rider.north + 321 ) < 0.01 && Math.abs( rider.y + 4.5 ) < 0.3, JSON.stringify( rider ) );
		assert.ok( flier.laid && ! flier.moved && flier.north > - 160, JSON.stringify( flier ) );
		for ( const there of [ riding, yours ] ) assert.ok( ! there.sea && there.colliders === 1 && Math.abs( there.y + 2.5 ) < 0.3, JSON.stringify( there ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'New Orleans with a boulevard across it (the lots at north -625 to -655 left empty, so the houses\' fronts either side are 49 m apart): beside someone riding on a surface of their own at the sea\'s height where the street at east 0 meets it (6.25, -623.75), where five bearings a quarter of the way round run down the street, across the boulevard and along the yards behind the houses past every ray down and along them, with houses between them, nothing is laid, in this scene and joined from the globe; nor beside someone flying 20 m over it with your sea\'s surface laid, in this scene or by the drop-in beside them', async () => {

		await dropInOver( page, '30.03, -90.08', 0 );
		await setUpPolder( page, { empty: [ - 655, - 625 ] } );
		const result = await page.evaluate( async () => {

			const { driver: d, sea, camera, moveCar, place } = window.drive;
			const { seaLevel } = await import( '/src/drive-app/sea.js' );
			const kit = window.polderKit;
			const V = camera.position.constructor;
			// Their car 5 m east of the spot, on the boulevard.
			kit.reset( - 150, 0 );
			const rider = { moved: moveCar( { local: new V( - 6.25, kit.surface + 0.1, - 623.75 ), heading: 180, riding: [ 5, 0 ] } ), sea: sea.active, east: d.east, north: d.north, y: d.y };
			// With the sea's surface laid (round the levee, reaching the streets), beside one flying 20 m
			// over the same spot: no ground in reach of them, nor that surface among the houses.
			kit.reset( - 150, 0 );
			sea.start( { lat: place.lat, lon: place.lon, height: await seaLevel( place.lat, place.lon ) + 2, over: 0, lake: null, east: 0, north: - 150 } );
			const flier = { laid: sea.shown, moved: moveCar( { local: new V( - 6.25, kit.surface + 20, - 623.75 ), heading: 180 } ), north: d.north, y: d.y };
			sea.clear();
			kit.reset( - 150, 0 );
			return { rider, flier };

		} );
		console.log( 'New Orleans with a boulevard across it:', JSON.stringify( result ) );
		await shot( page, 'drive-polder-boulevard' );
		// From the globe, the pin over the street at ( 6.25, -623.75 ) of the pad: beside the rider, and
		// beside the flier with your own sea's surface laid when you left.
		const riding = await joinBeside( page, 30.03, - 90.08, - 2, 0.1, { colour: null, shift: 623.75, east: 6.25 } );
		console.log( 'a drop-in beside a rider there:', JSON.stringify( riding ) );
		await shot( page, 'drive-polder-boulevard-beside-a-rider' );
		const yours = await dropInBeside( page, 30.03, - 90.08, - 2, 20, { colour: null, shift: 623.75, east: 6.25, laid: { lake: null } } );
		console.log( 'a drop-in beside a flier there, your sea laid:', JSON.stringify( yours ) );
		await shot( page, 'drive-polder-boulevard-beside-a-flier-your-sea-laid' );
		await page.evaluate( () => window.polderKit.remove() );
		await padBack( page );
		const { rider, flier } = result;
		assert.ok( rider.moved && ! rider.sea && Math.abs( rider.east - 6.25 ) < 0.01 && Math.abs( rider.north + 623.75 ) < 0.01 && Math.abs( rider.y + 4.5 ) < 0.3, JSON.stringify( rider ) );
		assert.ok( flier.laid && ! flier.moved && flier.north > - 160, JSON.stringify( flier ) );
		for ( const there of [ riding, yours ] ) assert.ok( ! there.sea && there.colliders === 1 && Math.abs( there.y + 2.5 ) < 0.3, JSON.stringify( there ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'New Orleans with a boulevard across it and the two houses facing each other across the street at east 0 by it left empty (their middles at ( ±16, -615.5 )), as known: beside someone riding on a surface of their own at the sea\'s height where that street meets the crossing street by them ( 1.3, -594.7 ), a quarter of the way round threads out through the gap they leave and along the boulevard farther than the rays between bearings see, so it isn\'t taken for built up, and the sea\'s surface is laid and you\'re on it with them, in this scene and joined from the globe alike; beside someone flying 20 m over it with none laid, nothing is laid (the look for laying it afresh, out to 150 m, is closed there); and with those two houses there, beside the rider nothing is laid either', async () => {

		await dropInOver( page, '30.03, -90.08', 0 );
		const [ east, north ] = [ 1.3, - 594.7 ];
		// Beside someone riding there (their car 5 m east of the spot, in the street too), in this
		// scene with none laid: in the boulevard test's own town, then with the two houses left out.
		const beside = ( [ east, north ] ) => {

			const { driver: d, sea, camera, moveCar } = window.drive;
			const kit = window.polderKit;
			kit.reset( - 150, 0 );
			return { moved: moveCar( { local: new camera.position.constructor( - east, kit.surface + 0.1, north ), heading: 180, riding: [ 5, 0 ] } ), sea: sea.shown, east: d.east, north: d.north, y: d.y, surface: kit.surface };

		};
		await setUpPolder( page, { empty: [ - 655, - 625 ] } );
		const whole = await page.evaluate( beside, [ east, north ] );
		await shot( page, 'drive-polder-boulevard-beside-a-rider-by-the-crossing' );
		await page.evaluate( () => window.polderKit.remove() );
		await setUpPolder( page, { empty: [ - 655, - 625 ], gone: [ [ 16, - 615.5 ], [ - 16, - 615.5 ] ] } );
		const rider = await page.evaluate( beside, [ east, north ] );
		await shot( page, 'drive-polder-boulevard-gap-beside-a-rider' );
		// Beside one flying 20 m over it, none laid: the look for laying it afresh is closed there, so
		// it's a drop-in.
		const flier = await page.evaluate( ( [ east, north ] ) => {

			const { driver: d, sea, camera, moveCar } = window.drive;
			const kit = window.polderKit;
			kit.reset( - 150, 0 );
			const there = { moved: moveCar( { local: new camera.position.constructor( - east, kit.surface + 20, north ), heading: 180 } ), sea: sea.active, north: d.north };
			kit.reset( - 150, 0 );
			return there;

		}, [ east, north ] );
		console.log( 'New Orleans with a boulevard and a gap by it:', JSON.stringify( { whole, rider, flier } ) );
		// From the globe, the pin over the street at that spot of the pad, beside the rider.
		const riding = await joinBeside( page, 30.03, - 90.08, - 2, 0.1, { colour: null, shift: - north, east } );
		console.log( 'a drop-in beside a rider there:', JSON.stringify( riding ) );
		await shot( page, 'drive-polder-boulevard-gap-beside-a-rider-from-the-globe' );
		await page.evaluate( () => window.polderKit.remove() );
		await padBack( page );
		// The whole town: the kart put on the street beside them, nothing laid.
		assert.ok( whole.moved && ! whole.sea && Math.abs( whole.east - east ) < 0.01 && Math.abs( whole.north - north ) < 0.01 && Math.abs( whole.y + 4.5 ) < 0.3, JSON.stringify( whole ) );
		// With the gap: laid, and on it beside them (the water curving away 3 cm there).
		assert.ok( rider.moved && rider.sea && Math.abs( rider.east - east ) < 0.01 && Math.abs( rider.north - north ) < 0.01 && Math.abs( rider.y - rider.surface ) < 0.1, JSON.stringify( rider ) );
		assert.ok( ! flier.moved && ! flier.sea && flier.north > - 160, JSON.stringify( flier ) );
		// And from the globe the same: started on the sea's surface.
		assert.ok( riding.sea && riding.lake === null && riding.colliders === 2 && Math.abs( riding.height - riding.level ) < 0.01 && Math.abs( riding.y ) < 0.01, JSON.stringify( riding ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'New Orleans laid out more sparsely (lots 25 m along the street with houses 13 m long, so 12 m between them, and crossings 37 m across): beside someone riding on a surface of their own at the sea\'s height over the street at east 0 by a gap between two houses ( 6.25, -416.25 ), and beside someone flying 20 m over it with none of the sea\'s surface laid, nothing is laid, in this scene and joined from the globe; flown over it 20 m up, though, the frame loop\'s look round it, with its rays down alone, lays it (as known: rays along the ground there would close the way out from a harbour too)', async () => {

		await dropInOver( page, '30.03, -90.08', 0 );
		await setUpPolder( page, { lot: 25, house: 13 } );
		const result = await page.evaluate( async ( [ east, north ] ) => {

			const { driver: d, sea, camera, moveCar, watchSea } = window.drive;
			const kit = window.polderKit;
			const V = camera.position.constructor;
			// Their car 5 m east of the spot, in the street too.
			kit.reset( - 150, 0 );
			const rider = { moved: moveCar( { local: new V( - east, kit.surface + 0.1, north ), heading: 180, riding: [ 5, 0 ] } ), sea: sea.active, east: d.east, north: d.north, y: d.y };
			// Beside one flying 20 m over it, none laid: no ground in reach of them, so it's a drop-in.
			kit.reset( - 150, 0 );
			const flier = { moved: moveCar( { local: new V( - east, kit.surface + 20, north ), heading: 180 } ), sea: sea.active, north: d.north };
			// Flown 20 m over the spot, the frame loop's look under it carried on for a second: its rays
			// down alone, which thread between the houses here.
			kit.reset( north, 0, 180, east );
			Object.assign( d, { y: kit.surface + 20, flying: true, grounded: false, speed: 0 } );
			const flown = { laid: false };
			for ( let i = 0; i < 60 && ! flown.laid; i ++ ) {

				watchSea( 1 / 60 );
				flown.laid = sea.active;

			}

			kit.reset( - 150, 0 );
			return { rider, flier, flown };

		}, [ 6.25, - 416.25 ] );
		console.log( 'New Orleans laid out more sparsely:', JSON.stringify( result ) );
		await shot( page, 'drive-polder-sparse' );
		// From the globe, the pin over the street at that spot of the pad: beside the rider, and beside
		// the flier (flying: their wheels on nothing), with none of the sea's surface laid.
		const [ east, north ] = [ 6.25, - 416.25 ];
		const riding = await joinBeside( page, 30.03, - 90.08, - 2, 0.1, { colour: null, shift: - north, east } );
		console.log( 'a drop-in beside a rider there:', JSON.stringify( riding ) );
		await shot( page, 'drive-polder-sparse-beside-a-rider' );
		const flying = await joinBeside( page, 30.03, - 90.08, - 2, 20, { colour: null, shift: - north, east, flags: 8 } );
		console.log( 'a drop-in beside a flier there:', JSON.stringify( flying ) );
		await shot( page, 'drive-polder-sparse-beside-a-flier' );
		await page.evaluate( () => window.polderKit.remove() );
		await padBack( page );
		const { rider, flier, flown } = result;
		assert.ok( rider.moved && ! rider.sea && Math.abs( rider.east - east ) < 0.01 && Math.abs( rider.north - north ) < 0.01 && Math.abs( rider.y + 4.5 ) < 0.3, JSON.stringify( rider ) );
		assert.ok( ! flier.moved && ! flier.sea && flier.north > - 160, JSON.stringify( flier ) );
		assert.ok( flown.laid, JSON.stringify( flown ) );
		for ( const there of [ riding, flying ] ) assert.ok( ! there.sea && there.colliders === 1 && Math.abs( there.y + 2.5 ) < 0.3, JSON.stringify( there ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'Go to beside another driver out on the sea\'s surface where Google draws the bed, or in the air over it: in this scene (the bed 2 m and 7 m under them), it\'s laid there and you\'re on it with them, driving on, beside one hopping 1.5 m or 3 m over it, or flying 20 m over it, too, and one rolled onto its side 3 m over it (beside them at their height, not 5 m under or over it), and a flier with the surface already laid; and a drop-in beside one far off (the bed 7 m under), at the surface, 3 m or 20 m over it, on the surface with them, where a pin at that height starts on the bed', async () => {

		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page );
		const near = await page.evaluate( () => {

			const { driver: d, sea, water, camera, moveCar } = window.drive;
			const kit = window.coastKit;
			// From the land, to beside a car at ( 0, north ) `over` m over the water's surface there
			// (lower in the scene's flat frame as the Earth curves away).
			const to = ( north, over ) => {

				kit.reset( - 250, 0 );
				const local = new camera.position.constructor( 0, kit.surface - north * north / ( 2 * 6371000 ) + over, north );
				const moved = moveCar( { local, heading: 180 } );
				return { moved, sea: sea.shown, north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( north ) };

			};
			const out = { shallow: to( - 380, 0 ), hop: to( - 380, 1.5 ), over: to( - 480, 3 ), flier: to( - 480, 20 ), deeper: to( - 480, 0 ) };
			// And driven on from there, on across the surface.
			d.press( 'KeyW' );
			kit.step( 3 );
			d.release( 'KeyW' );
			out.on = { north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( d.north ) };
			// Beside a car facing out to sea and rolled `roll` degrees onto its side (a barrel roll: its
			// own right-hand side pointing down, or up), as goTo finds the spot beside it (besideOf),
			// from what it sends (live.js: where it is and how it's turned, Earth-centred): the spot,
			// and where you're put.
			const { globe, besideOf } = window.drive;
			const rolled = ( north, over, roll ) => {

				kit.reset( - 250, 0 );
				const local = new camera.position.constructor( 0, kit.surface - north * north / ( 2 * 6371000 ) + over, north );
				const quaternion = new camera.quaternion.constructor().setFromAxisAngle( new camera.position.constructor( 0, 0, 1 ), roll * Math.PI / 180 );
				globe.earth.updateWorldMatrix( true, false );
				const position = local.clone().applyMatrix4( globe.earth.matrixWorld.clone().invert() );
				quaternion.premultiply( new camera.quaternion.constructor().setFromRotationMatrix( globe.earth.matrixWorld ).invert() ).normalize();
				const own = {};
				globe.ellipsoid.getPositionToCartographic( position, own );
				const spot = besideOf( { s: [ position.x, position.y, position.z, quaternion.x, quaternion.y, quaternion.z, quaternion.w ] } );
				const at = { east: - spot.local.x, north: spot.local.z, y: spot.local.y, rise: spot.height - own.height, heading: spot.heading };
				const moved = moveCar( spot );
				return { at, of: north, moved, sea: sea.shown, north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( north ) };

			};
			Object.assign( out, { level: rolled( - 380, 3, 0 ), down: rolled( - 380, 3, - 90 ), up: rolled( - 380, 3, 90 ), downDeeper: rolled( - 480, 3, - 90 ) } );
			// With the surface laid here already (by a Go to beside someone out on it), beside a car
			// flying 20 m over the bed: on the surface under them, as before.
			kit.reset( - 250, 0 );
			moveCar( { local: new camera.position.constructor( 0, kit.surface - 380 * 380 / ( 2 * 6371000 ), - 380 ), heading: 180 } );
			const laid = sea.shown;
			const again = moveCar( { local: new camera.position.constructor( 0, kit.surface - 480 * 480 / ( 2 * 6371000 ) + 20, - 480 ), heading: 180 } );
			out.laidFlier = { laid, moved: again, sea: sea.shown, north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( - 480 ) };
			kit.remove();
			return out;

		} );
		console.log( 'Go to beside a driver out on the sea:', JSON.stringify( near ) );
		const { shallow, hop, over, flier, deeper, on } = near;
		// (On the surface, under them in the air: the car put there, not on the bed.)
		for ( const there of [ shallow, hop, over, flier, deeper ] ) assert.ok( there.moved && there.sea && there.surface !== null && Math.abs( there.y - there.surface ) < 0.01 && Math.abs( there.surface + 2 ) < 0.1 && there.y > there.bed + 1.9, JSON.stringify( there ) );
		assert.ok( on.north < deeper.north - 10 && on.surface !== null && Math.abs( on.y - on.surface ) < 0.01 && on.y > on.bed + 7, JSON.stringify( on ) );
		// Beside a car rolled onto its side, its own side pointing down at the bed or up: the spot 5 m
		// to the right of its heading (south, so west), at its height, as it is beside one not rolled;
		// and put on the surface there with it, laid, not on the bed 2 m or 7 m under it.
		const { level, down, up, downDeeper, laidFlier } = near;
		for ( const there of [ level, down, up, downDeeper ] ) {

			assert.ok( Math.abs( there.at.east + 5 ) < 0.05 && Math.abs( there.at.north - there.of ) < 0.05 && Math.abs( there.at.rise ) < 0.05 && Math.abs( there.at.heading - 180 ) < 0.5, JSON.stringify( there ) );
			assert.ok( there.moved && there.sea && there.surface !== null && Math.abs( there.y - there.surface ) < 0.01 && Math.abs( there.surface + 2 ) < 0.1 && there.y > there.bed + 1.9, JSON.stringify( there ) );

		}

		assert.ok( laidFlier.laid && laidFlier.moved && laidFlier.sea && laidFlier.surface !== null && Math.abs( laidFlier.y - laidFlier.surface ) < 0.01 && Math.abs( laidFlier.north + 480 ) < 0.01 && laidFlier.y > laidFlier.bed + 6.9, JSON.stringify( laidFlier ) );
		await padBack( page );
		// Far off: a drop-in, the pad 7 m under the sea's surface with the sea's picture on it.
		const friend = await dropInBeside( page, 33.95, - 118.6, 7, 0 );
		await shot( page, 'drive-beside-on-the-sea' );
		const pin = await dropInBeside( page, 33.95, - 118.6, 7, 0, { beside: false } );
		const above = await dropInBeside( page, 33.95, - 118.6, 7, 3 );
		const high = await dropInBeside( page, 33.95, - 118.6, 7, 20 );
		await shot( page, 'drive-beside-a-flier-over-the-sea' );
		await padPlain( page );
		await padBack( page );
		console.log( 'a drop-in beside a driver out on the sea:', JSON.stringify( { friend, pin, above, high } ) );
		for ( const there of [ friend, above, high ] ) assert.ok( there.sea && there.colliders === 2 && Math.abs( there.height - there.level ) < 0.01 && Math.abs( there.y ) < 0.01, JSON.stringify( there ) );
		assert.ok( ! pin.sea && pin.colliders === 1 && Math.abs( pin.y + 7 ) < 0.5, JSON.stringify( pin ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'Lake Baikal\'s surface laid by a drop-in (the pad 200 m under it): beside someone flying 5 m or 20 m over its shelf 10 m under it (too shallow for the surface to be laid there afresh), on the surface under them, as over its deep bed; joined from 12 km off with that surface yours, the drop-in beside one flying 20 m over such a shelf starts on the surface too, where from the globe, with none laid, it starts on the shelf, as a pin there does', async () => {

		const lake = await dropInOver( page, '53.25, 108.1', 200 );
		assert.ok( lake.sea && Math.abs( lake.y ) < 0.01, JSON.stringify( lake ) );
		await setUpPictures( page );
		const near = await page.evaluate( async () => {

			const { driver: d, sea, water, camera, moveCar, ground } = window.drive;
			const V = camera.position.constructor;
			// The sea's height and the map asked for first, as goTo asks for them before it moves the
			// car, and come.
			moveCar( { local: new V( 0, 20, 300 ), heading: 180 } );
			await new Promise( resolve => setTimeout( resolve, 500 ) );
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
			// The bed in the colours Google gives it out there, and a shelf of it 10 m under the lake's
			// surface, 200 m square, 100 m south of the start.
			window.padLand ??= land.material;
			land.material = window.padKit.picture( [ 12, 13, 19 ] );
			const shelf = land.clone();
			shelf.scale.set( 200 / 4000, 200 / 2000, 1 );
			shelf.position.set( 0, 190, - 100 );
			pad.add( shelf );
			shelf.updateMatrixWorld( true );
			window.lakeShelf = shelf;
			// From the start on the lake's surface, to beside a car at ( 0, north ) `over` m over it.
			const to = ( north, over ) => {

				moveCar( { local: new V( 0, 0, 0 ), heading: 180 } );
				const moved = moveCar( { local: new V( 0, over - north * north / ( 2 * 6371000 ), north ), heading: 180 } );
				return { moved, sea: sea.shown, north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ) };

			};
			return { deep: to( 300, 20 ), low: to( - 100, 5 ), high: to( - 100, 20 ) };

		} );
		console.log( 'beside a flier over Lake Baikal\'s shelf:', JSON.stringify( near ) );
		await shot( page, 'drive-beside-a-flier-over-a-lake-shelf' );
		// Joined from 12 km off (farther than Go to drives you): a drop-in beside them, the pad there
		// 10 m under the lake's surface in the bed's colours, as such a shelf, under someone flying
		// 20 m over it, their car as live.js sends it (Earth-centred), level and facing south.
		await page.evaluate( () => {

			const { camera, globe, ground } = window.drive;
			window.lakeShelf.removeFromParent();
			const pad = ground.getColliders()[ 0 ];
			pad.position.y = - 10;
			pad.updateMatrixWorld( true );
			globe.earth.updateWorldMatrix( true, false );
			const position = new camera.position.constructor( 0, 20 - 12000 * 12000 / ( 2 * 6371000 ), 12000 ).applyMatrix4( globe.earth.matrixWorld.clone().invert() );
			const quaternion = new camera.quaternion.constructor().setFromRotationMatrix( globe.earth.matrixWorld ).invert();
			window.lakeFlier = { s: [ position.x, position.y, position.z, quaternion.x, quaternion.y, quaternion.z, quaternion.w ] };
			window.drive.goBeside( window.lakeFlier );

		} );
		const landed = async () => {

			await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
			return page.evaluate( async () => {

				const { driver: d, sea, ground, place } = window.drive;
				const { seaLevel, waterAt } = await import( '/src/drive-app/sea.js' );
				return {
					sea: sea.active, lake: sea.lake?.name ?? null, colliders: ground.getColliders().length, height: place.height, level: await seaLevel( place.lat, place.lon ),
					y: d.y, beside: place.beside, at: ( await waterAt( place.lat, place.lon ) )?.lake?.name ?? null, north: place.lat,
				};

			} );

		};
		const far = await landed();
		await shot( page, 'drive-beside-a-flier-over-a-lake-shelf-far' );
		// And from the globe, with no surface of yours laid.
		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		await page.evaluate( () => window.drive.goBeside( window.lakeFlier ) );
		const globe = await landed();
		await padPlain( page );
		await padBack( page );
		console.log( 'a drop-in beside a flier over a shelf of Lake Baikal:', JSON.stringify( { far, globe } ) );
		const { deep, low, high } = near;
		for ( const [ there, north ] of [ [ deep, 300 ], [ low, - 100 ], [ high, - 100 ] ] ) assert.ok( there.moved && there.sea && there.surface !== null && Math.abs( there.y - there.surface ) < 0.01 && Math.abs( there.north - north ) < 0.01 && Math.abs( there.y ) < 0.1, JSON.stringify( there ) );
		assert.ok( far.beside && far.at === 'Lake Baikal' && far.north > 53.3 && far.sea && far.lake === 'Lake Baikal' && far.colliders === 2 && Math.abs( far.height - far.level - 455.5 ) < 0.01 && Math.abs( far.y ) < 0.01, JSON.stringify( far ) );
		assert.ok( globe.beside && globe.at === 'Lake Baikal' && ! globe.sea && globe.colliders === 1 && Math.abs( globe.y + 10 ) < 0.5, JSON.stringify( globe ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'the sea\'s surface laid (by a Go to beside someone out on it), beside someone flying 5 m or 20 m over a bed coloured as sand 7 m and 13 m under it (as a sandbank in that sea, coloured as only dry land is): on the surface under them; over a hollow as far under the sea 8 km inland, on land on the map, not', async () => {

		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page );
		const out = await page.evaluate( () => {

			const { driver: d, sea, water, camera, moveCar } = window.drive;
			const kit = window.coastKit;
			const at = ( north, over ) => new camera.position.constructor( 0, kit.surface - north * north / ( 2 * 6371000 ) + over, north );
			kit.reset( - 250, 0 );
			const first = moveCar( { local: at( - 480, 0 ), heading: 180 } );
			const laid = sea.shown;
			kit.paint( [ 194, 178, 128 ] );
			const runs = [];
			for ( const north of [ - 480, - 600 ] ) {

				for ( const over of [ 5, 20 ] ) {

					moveCar( { local: at( - 400, 0 ), heading: 180 } );
					const moved = moveCar( { local: at( north, over ), heading: 180 } );
					const bed = kit.bedAt( north );
					runs.push( { north, over, moved, sea: sea.shown, at: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed, land: water.land( 0, north, bed + 1, 2 ) } );

				}

			}

			return { first, laid, runs };

		} );
		await shot( page, 'drive-beside-a-flier-over-a-sandy-bed' );
		out.inland = await page.evaluate( async () => {

			const { driver: d, sea, camera, moveCar, ground, place } = window.drive;
			const kit = window.coastKit;
			// A hollow 7 m under the sea's surface 6 km north and 6 km east (by Westwood, inland), 200 m
			// square, in the sea's colours, under that surface as laid here: beside someone flying 20 m
			// over it, not on the surface, as it isn't the sea's on the map.
			const { enuToLocal, localToLatLon } = await import( '/src/geo.js' );
			const { waterAt } = await import( '/src/drive-app/sea.js' );
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
			const [ east, north ] = [ 6000, 6000 ];
			const curve = ( east * east + north * north ) / ( 2 * 6371000 );
			const hollow = land.clone();
			hollow.material = window.padKit.picture( [ 12, 13, 19 ] );
			hollow.scale.set( 200 / 4000, 200 / 2000, 1 );
			hollow.position.set( - east, kit.surface - curve - 7, north );
			pad.add( hollow );
			hollow.updateMatrixWorld( true );
			moveCar( { local: new camera.position.constructor( 0, kit.surface - 400 * 400 / ( 2 * 6371000 ), - 400 ), heading: 180 } );
			const { lat, lon } = localToLatLon( enuToLocal( east, north, 0 ), place );
			const inland = { moved: moveCar( { local: new camera.position.constructor( - east, kit.surface - curve + 20, north ), heading: 180 } ), sea: sea.shown, north: d.north, kind: ( await waterAt( lat, lon ) )?.kind };
			hollow.removeFromParent();
			return inland;

		} );
		console.log( 'beside a flier over a sandy bed:', JSON.stringify( out ) );
		await page.evaluate( () => {

			window.coastKit.paint( [ 12, 13, 19 ] );
			window.coastKit.remove();

		} );
		await padBack( page );
		assert.ok( out.first && out.laid && out.runs.length === 4, JSON.stringify( out ) );
		for ( const there of out.runs ) assert.ok( there.land && there.moved && there.sea && there.surface !== null && Math.abs( there.y - there.surface ) < 0.01 && Math.abs( there.at - there.north ) < 0.01 && Math.abs( there.surface + 2 ) < 0.1 && there.y > there.bed + 6.9, JSON.stringify( there ) );
		assert.ok( out.inland.kind === 'land' && ! out.inland.moved && out.inland.sea && Math.abs( out.inland.north + 400 ) < 0.01, JSON.stringify( out.inland ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'a harbour\'s mouth between two moles 160 m apart, out from the shore past Google\'s water (an inlet: the bed between them closed in on most sides within 150 m, so no surface is laid over it as you drive): with the sea\'s surface laid (by a Go to beside someone out past them), beside someone flying 5 m or 20 m over the bed between them, 7 m and 13 m under it, on the surface under them; with the moles 40 m apart, a street\'s width, it\'s taken for a street among houses, and it\'s a drop-in', async () => {

		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page );
		// Moles `apart` m apart, each 30 m wide, from the shore (north = -280) out to north = -800,
		// standing 5 m over the sea's surface; the sea's surface laid by a Go to beside someone out
		// past their ends; and Go to beside someone flying over the bed between them.
		const mouth = apart => page.evaluate( async apart => {

			const { driver: d, sea, water, camera, moveCar } = window.drive;
			const kit = window.coastKit;
			const at = ( north, over ) => new camera.position.constructor( 0, kit.surface - north * north / ( 2 * 6371000 ) + over, north );
			const half = apart / 2;
			window.moles = await window.padKit.houses( [ [ half, half + 30, - 800, - 280 ], [ - half - 30, - half, - 800, - 280 ] ], - 30, 33 );
			kit.reset( - 250, 0 );
			const first = moveCar( { local: at( - 950, 0 ), heading: 180 } );
			const laid = sea.shown;
			const runs = [];
			for ( const north of [ - 480, - 600 ] ) {

				for ( const over of [ 5, 20 ] ) {

					moveCar( { local: at( - 950, 0 ), heading: 180 } );
					const moved = moveCar( { local: at( north, over ), heading: 180 } );
					runs.push( { north, over, moved, sea: sea.shown, at: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( north ) } );

				}

			}

			return { apart, first, laid, runs };

		}, apart );
		const wide = await mouth( 160 );
		await shot( page, 'drive-beside-a-flier-in-a-harbour-mouth' );
		await page.evaluate( () => window.moles.removeFromParent() );
		const narrow = await mouth( 40 );
		await page.evaluate( () => {

			window.moles.removeFromParent();
			window.coastKit.remove();

		} );
		await padBack( page );
		console.log( 'beside a flier between a harbour\'s moles:', JSON.stringify( { wide, narrow } ) );
		for ( const { first, laid, runs } of [ wide, narrow ] ) assert.ok( first && laid && runs.length === 4, JSON.stringify( { first, laid, runs } ) );
		for ( const there of wide.runs ) assert.ok( there.moved && there.sea && there.surface !== null && Math.abs( there.y - there.surface ) < 0.01 && Math.abs( there.at - there.north ) < 0.01 && Math.abs( there.surface + 2 ) < 0.1 && there.y > there.bed + 6.9, JSON.stringify( there ) );
		for ( const there of narrow.runs ) assert.ok( ! there.moved && there.sea && Math.abs( there.at + 950 ) < 0.01, JSON.stringify( there ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'Lake Baikal\'s surface laid in a square of the lake (53.25° N, 108.452° E): beside someone flying 5 m or 20 m over its shelf 10 m under it in the next square east, which the lake\'s shore crosses (land on the map, as nearly all of a big lake\'s shelf is), on the surface under them, as in the lake\'s own square; over a shelf as far under it two squares from the lake\'s (53.25° N, 108.60° E, where the surface still reaches), or a hollow four squares from them (as Niagara\'s gorge is from Lake Ontario\'s), not; and joined from 24 km off with that lake\'s surface yours, the drop-in beside one flying 20 m over the shelf in that square starts on the surface, and laid there, beside one flying over the shelf two squares off, not either', async () => {

		const lake = await dropInOver( page, '53.25, 108.452', 200 );
		assert.ok( lake.sea && Math.abs( lake.y ) < 0.01, JSON.stringify( lake ) );
		await setUpPictures( page );
		const near = await page.evaluate( async () => {

			const { driver: d, sea, water, camera, moveCar, ground, place } = window.drive;
			const { enuToLocal, latLonToEnu, localToLatLon } = await import( '/src/geo.js' );
			const { waterAt } = await import( '/src/drive-app/sea.js' );
			const V = camera.position.constructor;
			// The sea's height and the map asked for first, as goBeside asks for them, and come.
			moveCar( { local: new V( 0, 20, 300 ), heading: 180 } );
			await new Promise( resolve => setTimeout( resolve, 500 ) );
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
			window.padLand ??= land.material;
			land.material = window.padKit.picture( [ 12, 13, 19 ] );
			const curve = ( east, north ) => ( east * east + north * north ) / ( 2 * 6371000 );
			// Ground 10 m under the lake's surface (as it curves away), 300 m square, round ( east, north ).
			const shelf = ( east, north ) => {

				const mesh = land.clone();
				mesh.scale.set( 300 / 4000, 300 / 2000, 1 );
				mesh.position.set( - east, 190 - curve( east, north ), north );
				pad.add( mesh );
				mesh.updateMatrixWorld( true );
				return mesh;

			};
			// From the start, to beside someone flying `over` m over ( east, north ); and whether the
			// lake's surface is there under them (drawn).
			const to = async ( east, north, over ) => {

				moveCar( { local: new V( 0, 0, 0 ), heading: 180 } );
				const hit = ground.cast( new V( - east, over - curve( east, north ) + 3, north ), new V( 0, - 1, 0 ), 12000 );
				const moved = moveCar( { local: new V( - east, over - curve( east, north ), north ), heading: 180 } );
				const { lat, lon } = localToLatLon( enuToLocal( east, north, 0 ), place );
				const at = await waterAt( lat, lon );
				return { east, north, over, lon, map: at?.lake?.name ?? at?.kind, drawn: hit?.object === sea.mesh, moved, sea: sea.shown, at: [ d.east, d.north ], y: d.y, surface: water.at( d.east, d.north, d.y ), curve: curve( east, north ) };

			};
			// Two squares from the lake's, 53.25° N, 108.60° E: land on the map, within sea.js's REACH
			// of the lake's squares, so the surface is there under them still.
			const two = latLonToEnu( 53.25, 108.6, place );
			const shelves = [ shelf( - 500, 0 ), shelf( 1000, 0 ), shelf( 16500, - 16700 ), shelf( two.east, two.north ) ];
			const runs = { own: await to( - 500, 0, 20 ), low: await to( 1000, 0, 5 ), high: await to( 1000, 0, 20 ), two: await to( two.east, two.north, 20 ), far: await to( 16500, - 16700, 20 ) };
			for ( const mesh of shelves ) mesh.removeFromParent();
			return runs;

		} );
		console.log( 'beside a flier over Lake Baikal\'s shelf in a square its shore crosses:', JSON.stringify( near ) );
		await shot( page, 'drive-beside-a-flier-over-a-lake-shore-square' );
		// Joined from 24 km off, Baikal's surface laid in a square of the lake at 53.25° N, 108.1° E:
		// someone flying 20 m over the shelf in the square east of 108.452° E's.
		await padBack( page );
		const laid = await dropInOver( page, '53.25, 108.1', 200 );
		const far = await joinBeside( page, 53.25, 108.467, 10, 20, { rise: 455.5, flags: 8, globe: false } );
		await shot( page, 'drive-beside-a-flier-over-a-lake-shore-square-far' );
		// With it laid there, in the shore square, beside one flying 20 m over a shelf 10 m under it
		// two squares from the lake's (53.25° N, 108.60° E): not, as with it laid in the lake's own.
		far.two = await page.evaluate( async () => {

			const { driver: d, sea, camera, moveCar, ground, place } = window.drive;
			const { latLonToEnu } = await import( '/src/geo.js' );
			const { waterAt } = await import( '/src/drive-app/sea.js' );
			const V = camera.position.constructor;
			const pad = ground.getColliders()[ 0 ];
			const land = pad.children.find( child => child.isMesh && child.position.y > - 1 );
			const { east, north } = latLonToEnu( 53.25, 108.6, place );
			const curve = ( east * east + north * north ) / ( 2 * 6371000 );
			// (The pad is 10 m under the surface here.)
			const shelf = land.clone();
			shelf.scale.set( 300 / 4000, 300 / 2000, 1 );
			shelf.position.set( - east, - curve, north );
			pad.add( shelf );
			shelf.updateMatrixWorld( true );
			const from = [ d.east, d.north ];
			const hit = ground.cast( new V( - east, 23 - curve, north ), new V( 0, - 1, 0 ), 12000 );
			const moved = moveCar( { local: new V( - east, 20 - curve, north ), heading: 180 } );
			shelf.removeFromParent();
			const at = await waterAt( 53.25, 108.6 );
			return { east, north, map: at?.lake?.name ?? at?.kind, drawn: hit?.object === sea.mesh, moved, sea: sea.shown, lake: sea.lake?.name ?? null, from, at: [ d.east, d.north ] };

		} );
		// Laid there, in a square that's land on the map, it's still only by the lake's own: out over
		// land four squares from them (53.1° N, 108.7° E), it's gone, as Niagara's gorge has none.
		far.inland = await page.evaluate( () => {

			const { sea } = window.drive;
			const shown = sea.shown;
			sea.follow( 15500, - 16700, 0 );
			return { shown, then: sea.shown };

		} );
		await padPlain( page );
		await padBack( page );
		console.log( 'a drop-in beside a flier over a shore square of Lake Baikal:', JSON.stringify( { laid, far } ) );
		const { own, low, high, two, far: inland } = near;
		assert.equal( own.map, 'Lake Baikal' );
		for ( const there of [ low, high, two, inland ] ) assert.equal( there.map, 'land' );
		for ( const there of [ own, low, high ] ) assert.ok( there.moved && there.sea && there.surface !== null && Math.abs( there.y - there.surface ) < 0.01 && Math.abs( there.at[ 0 ] - there.east ) < 0.01 && Math.abs( there.y + there.curve ) < 0.1, JSON.stringify( there ) );
		assert.ok( ! inland.moved && inland.sea && Math.abs( inland.at[ 0 ] ) < 0.01 && Math.abs( inland.at[ 1 ] ) < 0.01, JSON.stringify( inland ) );
		// Two squares off, the surface under them, but not that lake's water on the map: not put on it.
		assert.ok( two.drawn && ! two.moved && two.sea && Math.abs( two.lon - 108.6 ) < 0.001 && Math.abs( two.at[ 0 ] ) < 0.01 && Math.abs( two.at[ 1 ] ) < 0.01, JSON.stringify( two ) );
		assert.ok( laid.sea && Math.abs( laid.y ) < 0.01, JSON.stringify( laid ) );
		assert.ok( far.sea && far.lake === 'Lake Baikal' && far.colliders === 2 && Math.abs( far.height - far.level - 455.5 ) < 0.01 && Math.abs( far.y ) < 0.01, JSON.stringify( far ) );
		assert.ok( far.two.map === 'land' && far.two.drawn && ! far.two.moved && far.two.sea && far.two.lake === 'Lake Baikal' && Math.abs( far.two.at[ 0 ] - far.two.from[ 0 ] ) < 0.01 && Math.abs( far.two.at[ 1 ] - far.two.from[ 1 ] ) < 0.01, JSON.stringify( far ) );
		assert.ok( far.inland.shown && ! far.inland.then, JSON.stringify( far ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'the sea\'s surface laid off Santa Monica: joined from there to someone flying 20 m over a sandbank 7 m under the sea 14 km off (coloured as land), within reach of that surface as it\'s laid, the drop-in starts on the sea\'s surface with them; to someone flying 20 m over a field 3 m under the sea in New Orleans (a coast\'s square, 2,500 km off), on the field, laying nothing, as from the globe', async () => {

		const start = await dropInOver( page, '33.95, -118.6', 200 );
		assert.ok( start.sea && Math.abs( start.y ) < 0.01, JSON.stringify( start ) );
		const bank = await joinBeside( page, 33.85, - 118.5, 7, 20, { flags: 8, colour: [ 194, 178, 128 ], globe: false } );
		await shot( page, 'drive-beside-a-flier-over-a-sandbank-your-sea-laid' );
		const field = await joinBeside( page, 30.03, - 90.08, 3, 20, { flags: 8, colour: [ 86, 120, 60 ], globe: false } );
		await shot( page, 'drive-beside-a-flier-over-a-field-a-sea-laid-far-off' );
		const globe = await joinBeside( page, 30.03, - 90.08, 3, 20, { flags: 8, colour: [ 86, 120, 60 ] } );
		await padPlain( page );
		await padBack( page );
		console.log( 'a drop-in beside a flier with the sea laid off Santa Monica:', JSON.stringify( { bank, field, globe } ) );
		assert.ok( bank.sea && bank.lake === null && bank.colliders === 2 && Math.abs( bank.height - bank.level ) < 0.01 && Math.abs( bank.y ) < 0.01, JSON.stringify( bank ) );
		for ( const there of [ field, globe ] ) assert.ok( ! there.sea && there.colliders === 1 && Math.abs( there.y + 3 ) < 0.3, JSON.stringify( there ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'joined from the globe (none of the water\'s surface laid) beside someone riding on a surface of their own at its height, Google\'s ground well under them: over Lake Baikal\'s shelf 10 m under it, in a square of the lake and in one its shore crosses, over a bed coloured as sand 7 m under the sea by Santa Monica Pier (and so beside where they dropped in), and in an inlet 160 m wide there (closed in on most sides within 150 m), the drop-in starts on the surface beside them; beside one on a levee at the sea\'s height over a field 3 m under it, and one in the air at that height over the field, it starts on the field, laying nothing', async () => {

		const shelf = await joinBeside( page, 53.25, 108.1, 10, 0.1, { rise: 455.5 } );
		await shot( page, 'drive-beside-a-rider-over-a-lake-shelf' );
		const shore = await joinBeside( page, 53.25, 108.467, 10, 0.1, { rise: 455.5 } );
		const sand = await joinBeside( page, 34.0065, - 118.4985, 7, 0.1, { colour: [ 194, 178, 128 ] } );
		await shot( page, 'drive-beside-a-rider-over-a-sandy-bed' );
		const dropped = await joinBeside( page, 34.0065, - 118.4985, 7, 0, { colour: [ 194, 178, 128 ], dropped: true } );
		// Banks 30 m wide, 80 to 110 m east and west of the pin, 800 m long, 5 m over the sea.
		const inlet = await joinBeside( page, 34.0065, - 118.4985, 7, 0.1, { boxes: [ [ 80, 110, - 400, 400 ], [ - 110, - 80, - 400, 400 ] ] } );
		await shot( page, 'drive-beside-a-rider-in-an-inlet' );
		// A levee 28 m wide under their car (5 m east of the pin, 2 m east of the pin's edge), its
		// top at the sea's height, by a field 3 m under it.
		const levee = await joinBeside( page, 34.0065, - 118.4985, 3, 0.1, { colour: [ 86, 120, 60 ], boxes: [ [ 2, 30, - 10, 10 ] ], top: 0 } );
		await shot( page, 'drive-beside-a-rider-on-a-levee' );
		const air = await joinBeside( page, 34.0065, - 118.4985, 3, 0.1, { colour: [ 86, 120, 60 ], flags: 16 } );
		await padPlain( page );
		await padBack( page );
		console.log( 'a drop-in beside a rider on their own surface:', JSON.stringify( { shelf, shore, sand, dropped, inlet, levee, air } ) );
		for ( const there of [ shelf, shore ] ) assert.ok( there.sea && there.lake === 'Lake Baikal' && there.colliders === 2 && Math.abs( there.height - there.level - 455.5 ) < 0.01 && Math.abs( there.y ) < 0.01, JSON.stringify( there ) );
		for ( const there of [ sand, dropped, inlet ] ) assert.ok( there.sea && there.lake === null && there.colliders === 2 && Math.abs( there.height - there.level ) < 0.01 && Math.abs( there.y ) < 0.01, JSON.stringify( there ) );
		for ( const there of [ levee, air ] ) assert.ok( ! there.sea && there.colliders === 1 && there.y < - 2.5, JSON.stringify( there ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'driving by Santa Monica Pier with none of the sea\'s surface laid, Go to beside someone riding on a surface of their own over a bed coloured as sand 2 m under it, out past Google\'s water: on the surface beside them, laid, not on the bed under it', async () => {

		const coast = await dropInOver( page, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( page );
		const out = await page.evaluate( async () => {

			const { driver: d, sea, water, camera, globe, goBeside } = window.drive;
			const kit = window.coastKit;
			kit.paint( [ 194, 178, 128 ] );
			kit.reset( - 250, 0 );
			// Their car on their surface at ( 0, -380 ), level and facing south (as the scene's own
			// frame is turned: none), as live.js sends it.
			const north = - 380;
			const local = new camera.position.constructor( 0, kit.surface - north * north / ( 2 * 6371000 ) + 0.1, north );
			globe.earth.updateWorldMatrix( true, false );
			const position = local.applyMatrix4( globe.earth.matrixWorld.clone().invert() );
			const quaternion = new camera.quaternion.constructor().setFromRotationMatrix( globe.earth.matrixWorld ).invert();
			await goBeside( { s: [ position.x, position.y, position.z, quaternion.x, quaternion.y, quaternion.z, quaternion.w, 0, 0, 0, 128 ] } );
			const there = { mode: window.drive.mode, sea: sea.shown, east: d.east, north: d.north, y: d.y, surface: water.at( d.east, d.north, d.y ), bed: kit.bedAt( north ) };
			kit.paint( [ 12, 13, 19 ] );
			return there;

		} );
		await shot( page, 'drive-beside-a-rider-over-a-shallow-sandy-bed' );
		await page.evaluate( () => window.coastKit.remove() );
		await padBack( page );
		console.log( 'Go to beside a rider over a sandy bed 2 m under the sea:', JSON.stringify( out ) );
		assert.ok( out.mode === 'driving' && out.sea && out.surface !== null && Math.abs( out.y - out.surface ) < 0.01 && Math.abs( out.surface + 2 ) < 0.1 && Math.abs( out.east + 5 ) < 0.05 && Math.abs( out.north + 380 ) < 0.05 && out.y > out.bed + 1.9, JSON.stringify( out ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'without the map (it didn\'t load), the pad 200 m under the sea is ground as before, and only ground deeper than any land or lake bed is the sea\'s; driven out from a coast too', async () => {

		const other = await newPage();
		await other.route( `${ BASE }/sea/mask.bin`, route => route.fulfill( { status: 404, body: '' } ) );
		await openGlobe( other );
		const shelf = await dropInOver( other, '33.95, -118.6', 200 );
		assert.ok( ! shelf.sea && shelf.colliders === 1 && shelf.toast === null && Math.abs( shelf.y + 200 ) < 0.5, JSON.stringify( shelf ) );
		const deep = await dropInOver( other, '30, -140', 3000 );
		assert.ok( deep.sea && Math.abs( deep.height + 28 ) < 0.01 && Math.abs( deep.y ) < 0.01, JSON.stringify( deep ) );
		await padBack( other );
		// Out from Santa Monica Pier over the bed sloping down under the sea's height (setUpCoast),
		// with no map to say it's the sea's: on down the bed, as before.
		const coast = await dropInOver( other, '34.0065, -118.4985', 0 );
		assert.ok( ! coast.sea && coast.colliders === 1, JSON.stringify( coast ) );
		await setUpCoast( other );
		const out = await other.evaluate( () => {

			const { driver: d, sea } = window.drive;
			const kit = window.coastKit;
			kit.reset( - 250, 40 );
			d.press( 'KeyW' );
			let laid = false;
			kit.step( 40, () => {

				d.speed = Math.min( d.speed, 50 / 3.6 );
				laid ||= sea.active;
				return d.north > - 600;

			} );
			d.release( 'KeyW' );
			const at = { laid, north: d.north, y: d.y, bed: kit.bedAt( d.north ) };
			kit.remove();
			return at;

		} );
		assert.ok( ! out.laid && out.north < - 590 && Math.abs( out.y - out.bed ) < 0.3, JSON.stringify( out ) );
		await padBack( other );
		assert.deepEqual( other.errors, [] );
		assert.deepEqual( other.outside, [] );
		await other.context().close();

	} );

} );

describe( 'World Drive with its Worker', () => {

	test( 'over the daily cap: the used-up screen, with no globe', async () => {

		const page = await newPage( {
			api: {
				config: { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true },
				turnstile: true,
				visit: route => route.fulfill( { status: 429, contentType: 'application/json', body: JSON.stringify( { error: 'Today\'s free drives are used up', reason: 'daily', retryAfter: 5 * 3600 + 120 } ) } ),
			},
		} );
		await page.goto( BASE );
		await page.locator( '#notice[data-kind="used-up"]' ).waitFor();
		assert.equal( await page.locator( '#notice .title' ).textContent(), 'Today\'s free drives are used up' );
		assert.equal( await page.locator( '#notice .countdown' ).textContent(), 'Fresh drives in 5 h 2 min' );
		assert.equal( await page.evaluate( () => !! window.drive ), false, 'the globe started anyway' );
		assert.equal( await page.locator( 'canvas' ).count(), 0 );
		await shot( page, 'drive-notice-used-up' );
		await page.context().close();

	} );

	test( 'a failed robot check can be tried again; a passing one starts with the key, asking once', async () => {

		const visits = [];
		const page = await newPage( {
			api: {
				config: { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true },
				turnstile: true,
				visit: route => {

					const request = route.request();
					visits.push( { body: request.postDataJSON(), type: request.headers()[ 'content-type' ] } );
					if ( visits.length === 1 ) return route.fulfill( { status: 403, contentType: 'application/json', body: '{"error":"The robot check didn\'t pass"}' } );
					route.fulfill( { contentType: 'application/json', body: JSON.stringify( { mapsKey: 'test-key-not-real', left: 1 } ) } );

				},
			},
		} );
		await page.goto( BASE );
		await page.locator( '#notice[data-kind="robot"]' ).waitFor();
		assert.equal( await page.evaluate( () => window.turnstileOptions.sitekey ), '1x00000000000000000000AA' );
		await shot( page, 'drive-notice-robot' );
		await page.locator( '#notice button', { hasText: 'Try again' } ).click();
		// With the key the page starts on Google's tiles (blocked here, so they fail).
		await page.waitForFunction( () => window.drive?.tiles, null, { timeout: 30000 } );
		assert.equal( visits.length, 2 );
		for ( const visit of visits ) assert.deepEqual( visit, { body: { token: TOKEN }, type: 'application/json' } );
		assert.match( await page.locator( '#toast' ).textContent(), /1 more free drive today/ );
		const roots = () => page.outside.filter( url => url.includes( '/v1/3dtiles/root.json' ) );
		await page.waitForFunction( () => window.drive.tiles.rootLoadingState !== undefined, null, { timeout: 5000 } ).catch( () => {} );
		await page.waitForTimeout( 1500 );
		assert.equal( roots().length, 1, roots().join( ' ' ) );
		assert.ok( roots()[ 0 ].includes( 'key=...' ), 'the key isn\'t what the tiles were asked with' );
		await page.context().close();

	} );

	test( 'the visit is only asked for once the game\'s code is here: a download that fails, or each Try again after it, spends no drive', async () => {

		const visits = [];
		const page = await newPage( {
			api: {
				config: { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true },
				turnstile: true,
				visit: route => {

					visits.push( route.request().url() );
					route.fulfill( { contentType: 'application/json', body: JSON.stringify( { mapsKey: 'test-key-not-real', left: 5 } ) } );

				},
			},
		} );
		const logged = [];
		page.on( 'console', message => message.type() === 'error' && logged.push( message.text() ) );
		// (The dev server has it at /src/... or /@fs/.../src/..., outside its root.)
		const MAIN = /^http:\/\/127\.0\.0\.1:\d+\/.*src\/drive-app\/main\.js(\?|$)/;
		await page.route( MAIN, route => route.abort() );
		await page.goto( BASE );
		await page.locator( '#notice[data-kind="error"]' ).waitFor();
		assert.match( await page.locator( '#notice .message' ).textContent(), /didn't finish loading\. Check your connection/ );
		assert.ok( logged.some( text => /dynamically imported module|main\.js/.test( text ) ), logged.join( '\n' ) );
		await page.locator( '#notice button', { hasText: 'Try again' } ).click();
		await page.locator( '#notice[data-kind="error"]' ).waitFor();
		await page.waitForTimeout( 500 );
		assert.deepEqual( visits, [] );

		// Its code that breaks as it runs (an older browser) is told apart from a dropped connection,
		// and logged, again with no drive spent.
		await page.unroute( MAIN );
		await page.route( MAIN, route => route.fulfill( { contentType: 'text/javascript', body: 'throw new TypeError( \'boom: not in this browser\' );' } ) );
		logged.length = 0;
		await page.reload();
		await page.locator( '#notice[data-kind="error"]' ).waitFor();
		assert.match( await page.locator( '#notice .message' ).textContent(), /couldn't start in this browser/ );
		assert.ok( logged.some( text => text.includes( 'boom: not in this browser' ) ), logged.join( '\n' ) );
		assert.deepEqual( visits, [] );
		await page.context().close();

	} );

	test( 'a Turnstile script that never comes ends on the robot check\'s screen at the deadline, and Try again asks for it afresh', async () => {

		const visits = [];
		const page = await newPage( {
			api: {
				config: { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true },
				visit: route => {

					visits.push( route.request().url() );
					route.abort();

				},
			},
		} );
		// Held and never answered, as by a proxy that stalls it.
		const asked = [];
		await page.route( /^https:\/\/challenges\.cloudflare\.com\/turnstile\//, route => asked.push( route.request().url() ) );
		await page.clock.install();
		await page.goto( BASE );
		await page.waitForFunction( () => /Checking the road/.test( document.querySelector( '#splash .status' ).textContent ) && document.querySelector( 'script[src*="challenges.cloudflare.com"]' ) );
		// 45 s on: the deadline, which counts from the start rather than from the script arriving.
		await page.clock.fastForward( 46000 );
		await page.locator( '#notice[data-kind="robot"]' ).waitFor( { timeout: 10000 } );
		assert.equal( await page.locator( 'script[src*="challenges.cloudflare.com"]' ).count(), 0 );
		// The stalled script is gone, and Try again puts a new one in to wait for. (Chromium joins it to
		// the request still held rather than asking again, so that isn't counted here.)
		await page.locator( '#notice button', { hasText: 'Try again' } ).click();
		await page.waitForFunction( () => document.querySelectorAll( 'script[src*="challenges.cloudflare.com"]' ).length === 1 );
		assert.ok( asked.length >= 1 );
		assert.ok( await page.locator( '#notice' ).isHidden() );
		assert.match( await page.locator( '#splash .status' ).textContent(), /Checking the road/ );
		await page.clock.fastForward( 46000 );
		await page.locator( '#notice[data-kind="robot"]' ).waitFor( { timeout: 10000 } );
		assert.deepEqual( visits, [] );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'a place\'s link stays in the address until Google\'s root has come, so the reload its error screen asks for still goes there', async () => {

		const page = await newPage( {
			api: {
				config: { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true },
				turnstile: true,
				visit: route => route.fulfill( { contentType: 'application/json', body: JSON.stringify( { mapsKey: 'test-key-not-real', left: 5 } ) } ),
			},
		} );
		// Google's tiles are blocked here, so the root fails.
		await page.goto( `${ BASE }/?spot=monaco&party=ABCD234` );
		await page.locator( '#notice[data-kind="error"]' ).waitFor( { timeout: 30000 } );
		assert.match( await page.locator( '#notice .message' ).textContent(), /Google's 3D map didn't load/ );
		assert.equal( new URL( page.url() ).search, '?spot=monaco&party=ABCD234' );
		assert.equal( await page.evaluate( () => window.drive.globe.pin ), null );
		await page.context().close();

	} );

	test( 'maps off: the getting-ready screen, and the test pad still drives', async () => {

		const page = await newPage( { api: { config: { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: false }, turnstile: true, visit: route => route.abort() } } );
		await page.goto( BASE );
		await page.locator( '#notice[data-kind="resting"]' ).waitFor();
		assert.equal( await page.locator( '#notice .title' ).textContent(), 'World Drive is getting ready' );
		await shot( page, 'drive-notice-resting' );
		await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
		assert.ok( ! page.outside.some( url => url.includes( 'turnstile' ) ), 'asked Turnstile with maps off' );
		await page.context().close();

	} );

} );

// --- the leaderboard ---------------------------------------------------------------------

const ROWS = [
	{ rank: 1, name: 'Ace', score: 52340, tricks: '1080 Spin! + Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 2.4, date: '2026-10-29' },
	{ rank: 2, name: 'Speed Demon', score: 31200, tricks: 'Barrel roll ×2', place: 'Times Square', vehicle: 'pickup-truck', airTime: 1.6, date: '2026-10-30' },
	{ rank: 3, name: 'Zoë', score: 18750, tricks: 'Wall bounce + Big air 1.8 s', place: 'Golden Gate Bridge', vehicle: 'pickup-truck', airTime: 1.8, date: '2026-10-30' },
];
const POSTED = { best: 4210, rank: 12, isNewBest: true, today: { best: 4210, rank: 3, isNewBest: true }, week: { best: 4210, rank: 5, isNewBest: true } };
const RESTING = { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: false };

// The leaderboard's side of the Worker, answered here; `asked` has what the page sent. options.score
// answers a score (route => ...), so a test can make it fail; options.rows are the boards' rows.
async function leaderboardPage( { score, rows = ROWS, ...options } = {} ) {

	const page = await newPage( { ...options, api: { config: RESTING, turnstile: true, visit: route => route.abort() } } );
	const asked = page.asked = { boards: [], players: [], renames: [], scores: [] };
	const json = ( route, body, status = 200 ) => route.fulfill( { status, contentType: 'application/json', body: JSON.stringify( body ) } );
	await page.route( `${ BASE }/api/leaderboard?*`, route => {

		const query = Object.fromEntries( new URL( route.request().url() ).searchParams );
		asked.boards.push( query );
		const me = query.id && ( query.period === 'week' ? { ...rows[ 1 ] } : { ...rows[ 1 ], rank: 42, score: 1230 } );
		json( route, { period: query.period, place: query.place ?? null, total: 130, rows: query.place ? [] : rows, ...( query.id ? { me } : {} ) } );

	} );
	await page.route( `${ BASE }/api/player`, route => {

		const body = route.request().postDataJSON();
		asked.players.push( body );
		if ( body.name === 'Taken Name' ) return json( route, { error: 'That name is taken' }, 409 );
		json( route, { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), name: body.name }, 201 );

	} );
	await page.route( `${ BASE }/api/player/rename`, route => {

		const body = route.request().postDataJSON();
		asked.renames.push( body );
		if ( body.name === 'Taken Name' ) return json( route, { error: 'That name is taken' }, 409 );
		json( route, { id: body.id, name: body.name } );

	} );
	await page.route( `${ BASE }/api/score`, route => {

		asked.scores.push( route.request().postDataJSON() );
		if ( score ) return score( route );
		json( route, POSTED );

	} );
	return page;

}

// Maps are off, so the page offers the test pad: the globe, with its Worker but no visit.
async function testPad( page ) {

	await page.goto( BASE );
	await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

}

// A backflip, landed on the test pad (driven at a fixed step, as in the stunts test): the score.
function landBackflip( page ) {

	return page.evaluate( () => {

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

		return { scored: d.score - before, score: d.score };

	} );

}

describe( 'World Drive leaderboard', () => {

	test( 'the trophy opens the boards: tabs, your own row, a name to pick and to change', async () => {

		const page = await leaderboardPage();
		const { asked } = page;
		await testPad( page );
		const trophy = page.locator( '#globe-ui .board-open' );
		assert.ok( await trophy.isVisible() );
		await trophy.click();
		const dialog = page.locator( '#leaderboard' );
		await dialog.locator( '.rows li' ).first().waitFor();
		assert.deepEqual( asked.boards, [ { period: 'today' } ] );
		assert.equal( await dialog.locator( '.tabs [aria-selected="true"]' ).textContent(), 'Today' );
		assert.deepEqual( await dialog.locator( '.rows li .who b' ).allTextContents(), [ 'Ace', 'Speed Demon', 'Zoë' ] );
		assert.deepEqual( await dialog.locator( '.rows li .score' ).allTextContents(), [ '52,340', '31,200', '18,750' ] );
		// Today's rows don't say the day.
		assert.equal( await dialog.locator( '.rows li .what' ).first().textContent(), '1080 Spin! + Backflip! · Furka Pass · Go-kart' );
		assert.equal( await dialog.locator( '.mine' ).textContent(), '130 drivers on this board' );
		// No visit on the test pad: no name to pick and nothing posted from it, and it says so.
		const form = dialog.locator( '.name-form' );
		assert.ok( await dialog.locator( '.offline' ).isVisible() );
		assert.equal( await form.isVisible(), false );
		await shot( page, 'board-1-today' );

		// With one (as on Google's map), a name, checked here first.
		await page.evaluate( () => window.drive.leaderboard.setVisit( 'v1.test-visit-token' ) );
		assert.equal( await dialog.locator( '.offline' ).isVisible(), false );
		await form.locator( 'input' ).fill( 'ab' );
		await form.locator( 'button[type=submit]' ).click();
		assert.equal( await form.locator( '.form-status' ).textContent(), 'Use 3 to 16 letters, numbers, spaces, _ or -.' );
		assert.deepEqual( asked.players, [] );
		await form.locator( 'input' ).fill( '  Speed   Demon ' );
		await form.locator( 'input' ).press( 'Enter' );
		await dialog.locator( '.named' ).waitFor();
		assert.deepEqual( asked.players, [ { name: 'Speed Demon', visit: 'v1.test-visit-token' } ] );
		assert.equal( await dialog.locator( '.named .name' ).textContent(), 'Speed Demon' );
		assert.deepEqual( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.player' ) ) ), { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), name: 'Speed Demon' } );
		// The board again, with your own place below the top.
		await dialog.locator( '.mine', { hasText: '#42' } ).waitFor();
		assert.deepEqual( asked.boards.at( - 1 ), { period: 'today', id: 'P1ayer-id_000000' } );
		assert.equal( await dialog.locator( '.mine' ).textContent(), 'You\'re #42 of 130, with 1,230' );
		assert.equal( await dialog.locator( '.rows li.me' ).count(), 0 );

		// This week: you're in the top, and your row shows it; the dates show.
		await dialog.locator( '.tabs button', { hasText: 'This week' } ).click();
		await dialog.locator( '.rows li.me' ).waitFor();
		assert.deepEqual( asked.boards.at( - 1 ), { period: 'week', id: 'P1ayer-id_000000' } );
		assert.match( await dialog.locator( '.rows li.me' ).textContent(), /Speed Demon/ );
		assert.equal( await dialog.locator( '.mine' ).textContent(), 'You\'re #2 of 130' );
		assert.match( await dialog.locator( '.rows li .what' ).first().textContent(), / · Oct 29$/ );
		await shot( page, 'board-2-week' );
		await dialog.locator( '.tabs button', { hasText: 'All time' } ).click();
		await page.waitForFunction( () => document.querySelector( '#leaderboard .tabs [aria-selected="true"]' ).textContent === 'All time' );
		// (The tab is lit as it's clicked: the board's asked for a moment after.)
		for ( let i = 0; i < 50 && asked.boards.at( - 1 ).period !== 'all'; i ++ ) await page.waitForTimeout( 100 );
		assert.equal( asked.boards.at( - 1 ).period, 'all' );

		// Renaming: a taken name says so, a free one changes it and keeps the secret.
		await dialog.locator( '.rename' ).click();
		assert.equal( await form.locator( 'input' ).inputValue(), 'Speed Demon' );
		await form.locator( 'input' ).fill( 'Taken Name' );
		await form.locator( 'input' ).press( 'Enter' );
		await form.locator( '.form-status', { hasText: 'That name\'s taken. Try another.' } ).waitFor();
		await form.locator( 'input' ).fill( 'Speedier' );
		await form.locator( 'input' ).press( 'Enter' );
		await dialog.locator( '.named .name', { hasText: 'Speedier' } ).waitFor();
		assert.deepEqual( asked.renames.at( - 1 ), { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), name: 'Speedier' } );
		assert.equal( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.player' ) ).name ), 'Speedier' );

		// Esc closes it, and leaves the globe as it was.
		await page.keyboard.press( 'Escape' );
		await dialog.waitFor( { state: 'hidden' } );
		assert.equal( await mode( page ), 'globe' );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'names, places and tricks are shown as text, never as markup', async () => {

		// The Worker never takes these, but the page mustn't trust that it didn't.
		const markup = '<img src=x onerror="window.pwned = true">';
		const rows = [
			{ ...ROWS[ 0 ], name: markup, place: '<b onmouseover="window.pwned = true">Furka</b>' },
			{ ...ROWS[ 1 ], name: '<script>window.pwned = true</script>', tricks: `${ markup } + Backflip!`, vehicle: markup },
		];
		const page = await leaderboardPage( { rows } );
		await page.addInitScript( name => localStorage.setItem( 'world-drive.player', JSON.stringify( { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), name } ) ), markup );
		await testPad( page );
		await page.locator( '#globe-ui .board-open' ).click();
		const dialog = page.locator( '#leaderboard' );
		await dialog.locator( '.rows li' ).first().waitFor();
		assert.deepEqual( await dialog.locator( '.rows li .who b' ).allTextContents(), [ markup, '<script>window.pwned = true</script>' ] );
		assert.equal( await dialog.locator( '.rows li .what' ).first().textContent(), `${ ROWS[ 0 ].tricks } · <b onmouseover="window.pwned = true">Furka</b> · Go-kart` );
		assert.equal( await dialog.locator( '.named .name' ).textContent(), markup );
		assert.equal( await dialog.locator( '.mine' ).textContent(), 'You\'re #42 of 130, with 1,230' );
		assert.equal( await page.locator( '#leaderboard img, #leaderboard script, #leaderboard .rows b b' ).count(), 0 );
		assert.equal( await page.evaluate( () => window.pwned ?? false ), false );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'a landed jump posts the run: the card asks the first time, and the drive goes on', async () => {

		const page = await leaderboardPage();
		const { asked } = page;
		await testPad( page );
		await page.locator( '.spots button', { hasText: 'Furka Pass' } ).click();
		await flown( page );
		await driveHere( page );
		await page.evaluate( () => window.drive.leaderboard.setVisit( 'v1.test-visit-token' ) );

		const { scored, score } = await landBackflip( page );
		assert.ok( scored > 0, 'no points for the backflip' );
		const card = page.locator( '#best-card' );
		await card.waitFor();
		assert.equal( await card.locator( '.title' ).textContent(), `New best! ${ score.toLocaleString( 'en-CA' ) }` );
		assert.equal( await card.locator( '.message' ).textContent(), 'Post it to the leaderboard?' );
		// Nothing's sent before a name is picked, and nothing stopped.
		assert.deepEqual( asked.scores, [] );
		assert.equal( await mode( page ), 'driving' );
		await shot( page, 'board-3-ask' );

		await card.locator( '.post' ).click();
		const input = card.locator( 'input' );
		assert.ok( await input.evaluate( element => element === document.activeElement ) );
		// Typing doesn't drive.
		await input.pressSequentially( 'Flip Master', { delay: 10 } );
		assert.equal( await page.evaluate( () => window.drive.driver.keys.size ), 0 );
		await input.press( 'Enter' );
		await card.locator( '.message', { hasText: '#3 today · #12 all time' } ).waitFor();
		assert.deepEqual( asked.players, [ { name: 'Flip Master', visit: 'v1.test-visit-token' } ] );
		assert.equal( asked.scores.length, 1 );
		const [ sent ] = asked.scores;
		assert.deepEqual( Object.keys( sent ).sort(), [ 'airTime', 'id', 'place', 'runSeconds', 'score', 'secret', 'tricks', 'vehicle', 'visit' ] );
		const { airTime, runSeconds, tricks, ...rest } = sent;
		assert.deepEqual( rest, { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), visit: 'v1.test-visit-token', score, place: 'Furka Pass', vehicle: 'go-kart' } );
		// The jump's tricks as the HUD named them, and its air: a backflip thrown up at 12 m/s is big air.
		assert.match( tricks, /^Backflip! \+ Big air \d\.\d s$/ );
		assert.equal( airTime, Number( tricks.match( /Big air (\d\.\d)/ )[ 1 ] ) );
		assert.ok( Number.isInteger( runSeconds ) && runSeconds >= airTime, `runSeconds ${ runSeconds }` );
		assert.equal( await page.evaluate( () => document.activeElement === document.body ), true, 'the name field kept the keys' );
		await shot( page, 'board-4-posted' );

		// Still driving, keys and all.
		assert.equal( await mode( page ), 'driving' );
		await page.keyboard.down( 'KeyW' );
		await page.waitForFunction( () => window.drive.driver.speed > 3, null, { timeout: 20000 } );
		await page.keyboard.up( 'KeyW' );
		// The best posted today is remembered: no lower score goes up.
		assert.equal( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.posted' ) ).best ), POSTED.today.best );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'with a name, scores go up by themselves, one at a time; a dead connection never stops the drive', async () => {

		const page = await leaderboardPage( { score: route => route.abort() } );
		const { asked } = page;
		await page.addInitScript( () => localStorage.setItem( 'world-drive.player', JSON.stringify( { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), name: 'Speed Demon' } ) ) );
		await testPad( page );
		await page.locator( '.spots button', { hasText: 'Times Square' } ).click();
		await flown( page );
		await driveHere( page );
		await page.evaluate( () => window.drive.leaderboard.setVisit( 'v1.test-visit-token' ) );

		await landBackflip( page );
		// (Given up to 10 s to go: on a loaded machine it can take more than a moment.)
		for ( let i = 0; i < 100 && asked.scores.length === 0; i ++ ) await page.waitForTimeout( 100 );
		// Straight up, with no card to ask; it didn't get through.
		assert.equal( asked.scores.length, 1 );
		assert.equal( asked.scores[ 0 ].place, 'Times Square' );
		assert.equal( await page.locator( '#best-card' ).isVisible(), false );
		// Another jump at once: it waits its turn.
		await landBackflip( page );
		await page.waitForTimeout( 300 );
		assert.equal( asked.scores.length, 1 );
		assert.ok( await page.evaluate( () => window.drive.leaderboard.pending?.score > 0 ) );
		// And the drive goes on.
		await page.keyboard.down( 'KeyW' );
		await page.waitForFunction( () => window.drive.driver.speed > 3, null, { timeout: 20000 } );
		await page.keyboard.up( 'KeyW' );
		assert.equal( await mode( page ), 'driving' );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'each place\'s best goes up, not only the day\'s: the boards of one place are whole', async () => {

		// The Worker's answer for the score sent: today's best is the best of those posted.
		let best = 0;
		const page = await leaderboardPage( { score: route => {

			best = Math.max( best, route.request().postDataJSON().score );
			const day = { best, rank: 1, isNewBest: false };
			route.fulfill( { contentType: 'application/json', body: JSON.stringify( { ...day, today: day, week: day } ) } );

		} } );
		const { asked } = page;
		await page.addInitScript( () => localStorage.setItem( 'world-drive.player', JSON.stringify( { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), name: 'Speed Demon' } ) ) );
		await testPad( page );
		await page.evaluate( () => window.drive.leaderboard.setVisit( 'v1.test-visit-token' ) );
		const land = ( score, place ) => page.evaluate( run => window.drive.leaderboard.onScore( run ), { score, best: score, newBest: false, tricks: 'Backflip!', runSeconds: 60, airTime: 1.2, place, vehicle: 'go-kart' } );
		const waitingAt = () => page.evaluate( () => window.drive.leaderboard.pending?.place ?? null );

		await land( 5000, 'Times Square' );
		await page.waitForFunction( () => JSON.parse( localStorage.getItem( 'world-drive.posted' ) )?.best === 5000 );
		// Less at the same place: nothing to post.
		await land( 3000, 'Times Square' );
		assert.equal( await waitingAt(), null );
		// Less than today's best, but the first at two other places: each goes up in its turn, the
		// place that waited longest first.
		await land( 1000, 'Golden Gate Bridge' );
		await land( 2000, 'Furka Pass' );
		await land( 1500, 'golden gate bridge' );
		assert.equal( await waitingAt(), 'Furka Pass' );
		const deadline = Date.now() + 25000;
		while ( asked.scores.length < 2 && Date.now() < deadline ) await page.waitForTimeout( 250 );
		assert.deepEqual( asked.scores.map( sent => `${ sent.place } ${ sent.score }` ), [ 'Times Square 5000', 'golden gate bridge 1500' ] );
		assert.equal( await waitingAt(), 'Furka Pass' );
		await page.waitForFunction( () => JSON.parse( localStorage.getItem( 'world-drive.posted' ) ).places[ 'golden gate bridge' ] === 1500 );
		assert.deepEqual( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.posted' ) ) ), { day: new Date().toISOString().slice( 0, 10 ), best: 5000, places: { 'times square': 5000, 'golden gate bridge': 1500 } } );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'on a phone: the trophy, the card and the boards fit, and the pause menu has them, here too', async () => {

		const page = await leaderboardPage( { viewport: { width: 390, height: 844 }, touch: true } );
		const { asked } = page;
		await testPad( page );
		const trophy = await page.locator( '#globe-ui .board-open' ).boundingBox();
		assert.ok( trophy.x + trophy.width <= 390 && trophy.y >= 0, JSON.stringify( trophy ) );
		// Clear of the title and the tagline under it (where their words end, not their boxes).
		const words = await page.evaluate( () => [ '.logo', '.tagline' ].map( selector => {

			const range = document.createRange();
			range.selectNodeContents( document.querySelector( `#globe-ui ${ selector }` ) );
			return range.getBoundingClientRect().right;

		} ) );
		assert.ok( words.every( right => right <= trophy.x ), `the trophy is over the title: ${ words } ${ trophy.x }` );
		await page.locator( '#globe-ui .board-open' ).tap();
		const dialog = page.locator( '#leaderboard' );
		await dialog.locator( '.rows li' ).first().waitFor();
		const box = await dialog.boundingBox();
		assert.ok( box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, JSON.stringify( box ) );
		assert.ok( await page.evaluate( () => document.documentElement.scrollWidth <= 390 && [ ...document.querySelectorAll( '#leaderboard, #leaderboard *' ) ].every( element => element.scrollWidth <= element.clientWidth + 1 || getComputedStyle( element ).textOverflow === 'ellipsis' ) ), 'something is wider than the screen' );
		await shot( page, 'board-phone-1' );
		await dialog.locator( '.close' ).tap();

		await page.locator( '.spots button', { hasText: 'Times Square' } ).tap();
		await flown( page );
		await page.locator( '.pin-card .go' ).tap();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );

		// The card over the steering, clear of the readouts and the other buttons.
		await page.evaluate( () => {

			window.drive.leaderboard.setVisit( 'v1.test-visit-token' );
			window.drive.leaderboard.onScore( { score: 4210, best: 4210, newBest: true, tricks: 'Backflip!', runSeconds: 30, airTime: 1.2, place: 'Times Square', vehicle: 'go-kart' } );

		} );
		await page.locator( '#best-card' ).waitFor();
		const card = await page.locator( '#best-card' ).boundingBox();
		assert.ok( card.x >= 0 && card.x + card.width <= 390, JSON.stringify( card ) );
		for ( const selector of [ '#hud .dhud-cluster', '#hud .dhud-touch .left', '#hud .dhud-touch .right', '#hud .dhud-touch .brake', '#hud .dhud-touch .drift', '#hud .dhud-touch .reset', '#drive-ui .topbar' ] ) {

			const other = await page.locator( selector ).boundingBox();
			const apart = card.x + card.width <= other.x || other.x + other.width <= card.x || card.y + card.height <= other.y || other.y + other.height <= card.y;
			assert.ok( apart, `the card is over ${ selector }: ${ JSON.stringify( { card, other } ) }` );

		}

		await shot( page, 'board-phone-2-card' );
		await page.locator( '#best-card .later' ).tap();
		await page.locator( '#best-card' ).waitFor( { state: 'hidden' } );

		// The pause menu's leaderboard has "only here".
		await page.locator( '#drive-ui .pause-open' ).tap();
		await page.locator( '#pause .board-open' ).tap();
		await dialog.locator( '.rows li' ).first().waitFor();
		assert.equal( await dialog.locator( '.here' ).textContent(), ' Only Times Square' );
		await dialog.locator( '.here input' ).tap();
		await dialog.locator( '.status', { hasText: 'No scores here yet. Be the first!' } ).waitFor();
		assert.deepEqual( asked.boards.at( - 1 ), { period: 'today', place: 'Times Square' } );
		await shot( page, 'board-phone-3-here' );
		await dialog.locator( '.close' ).tap();
		// Back to the pause menu, as it was.
		assert.equal( await mode( page ), 'paused' );
		assert.ok( await page.locator( '#pause' ).isVisible() );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

} );

// --- the Supporter Pass's buying and signing in -----------------------------------------------

const CLIENT = 'test-client.apps.googleusercontent.com';
// Made up, in Stripe's format: never opened (window.open is stood in for, and nothing off this
// machine is reached).
const PASS_LINK = 'https://buy.stripe.com/test_madeUpLink000';
const SIGNED_OUT = { signedIn: false, supporter: false, purchase: { enabled: true, link: PASS_LINK, price: 'CA$4.99' } };
const ALICE = { signedIn: true, name: 'Alice Example', email: 'alice@example.com', supporter: false, purchase: { ...SIGNED_OUT.purchase, clientReferenceId: '42' } };
const PLAYER = { id: 'P1ayer-id_000000', secret: 'S'.repeat( 32 ), name: 'Speed Demon' };

// The test pad with sign-in set up, and the Worker's side of it answered here. me: what /api/me
// says (page.state.me, which a test changes as the Worker would, a purchase arriving say); a good
// sign-in (window.testCredential 'good-token') makes it signedIn. page.asked has what was sent, and
// page.google how often Google's script (stood in for, harness's GOOGLE_STUB) was loaded. config and
// visit: /api/config (maps off, the test pad) and /api/visit (never answered) as newPage takes them.
async function supporterPage( { me = SIGNED_OUT, signedInAs = ALICE, clientId = CLIENT, player = null, config = RESTING, visit = route => route.abort(), ...options } = {} ) {

	const page = await newPage( { ...options, api: { config: { ...config, googleClientId: clientId }, turnstile: true, visit } } );
	// Never a page of Stripe's: Buy's new tab is only noted.
	await page.context().route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
	await page.addInitScript( ( { player } ) => {

		window.opened = [];
		window.open = ( ...args ) => ( window.opened.push( args ), null );
		if ( player ) localStorage.setItem( 'world-drive.player', JSON.stringify( player ) );

	}, { player } );
	const state = page.state = { me, signedInAs };
	const asked = page.asked = { me: 0, sessions: [], signOuts: 0, links: [] };
	page.google = 0;
	const json = ( route, body, status = 200 ) => route.fulfill( { status, contentType: 'application/json', body: JSON.stringify( body ) } );
	await page.route( 'https://accounts.google.com/gsi/client', route => {

		page.google ++;
		route.fulfill( { contentType: 'text/javascript', body: GOOGLE_STUB } );

	} );
	await page.route( `${ BASE }/api/me`, route => {

		asked.me ++;
		if ( state.me === 'down' ) return route.abort();
		json( route, state.me );

	} );
	await page.route( `${ BASE }/api/session`, route => {

		const request = route.request();
		if ( request.method() === 'DELETE' ) {

			asked.signOuts ++;
			state.me = SIGNED_OUT;
			return route.fulfill( { status: 204 } );

		}

		const { credential } = request.postDataJSON();
		asked.sessions.push( { credential, type: request.headers()[ 'content-type' ] } );
		if ( credential !== 'good-token' ) return json( route, { error: 'Sign-in failed' }, 401 );
		state.me = state.signedInAs;
		json( route, state.me );

	} );
	await page.route( `${ BASE }/api/player/link`, route => {

		asked.links.push( route.request().postDataJSON() );
		json( route, { id: PLAYER.id, name: PLAYER.name } );

	} );
	return page;

}

const locked = page => page.locator( '#globe-ui .vehicle.locked' ).count();
// What the pass unlocks in the picker, at level 1: thirteen cars (six of them levels' too) and four
// rides.
const LOCKED = 17;
const sheet = page => page.locator( '#pass .buy-area' );

async function openPass( page ) {

	await page.locator( '#globe-ui .pass-open' ).click();
	await page.locator( '#pass' ).waitFor();

}

describe( 'World Drive Supporter Pass: buying and signing in', () => {

	test( 'the sheet signs in with Google, then Buy opens the link saying whose it is', async () => {

		const page = await supporterPage();
		const { asked } = page;
		await testPad( page );
		await page.waitForFunction( () => window.drive.supporter.me );
		assert.equal( await locked( page ), LOCKED );
		// Google's script only once a sign-in button is on screen.
		assert.equal( page.google, 0, 'Google\'s script loaded before anyone could sign in' );
		await openPass( page );
		const area = sheet( page );
		await area.locator( '.stub-google' ).waitFor();
		assert.equal( page.google, 1 );
		assert.match( await area.textContent(), /Sign in to buy, so the pass is yours in any browser\. Bought it already\? Signing in brings it back\./ );
		assert.equal( await area.locator( '.buy' ).count(), 0, 'Buy shows to someone signed out' );
		await shot( page, 'pass-1-signed-out' );

		// A token Google didn't sign, then a good one.
		await page.evaluate( () => window.testCredential = 'forged' );
		await area.locator( '.stub-google' ).click();
		await area.locator( '.supporter-status', { hasText: 'Signing in didn\'t work. Try again.' } ).waitFor();
		await page.evaluate( () => window.testCredential = 'good-token' );
		await area.locator( '.stub-google' ).click();
		await area.locator( '.buy' ).waitFor();
		assert.deepEqual( asked.sessions, [ { credential: 'forged', type: 'application/json' }, { credential: 'good-token', type: 'application/json' } ] );
		assert.equal( await area.locator( '.buy' ).textContent(), 'Buy for CA$4.99' );
		assert.match( await area.textContent(), /Signed in as alice@example\.com · Restore purchases · Sign out/ );
		await shot( page, 'pass-2-signed-in' );

		await area.locator( '.buy' ).click();
		const opened = await page.evaluate( () => window.opened );
		assert.equal( opened.length, 1 );
		const [ href, target, features ] = opened[ 0 ];
		const url = new URL( href );
		assert.equal( `${ url.origin }${ url.pathname }`, PASS_LINK );
		assert.deepEqual( Object.fromEntries( url.searchParams ), { client_reference_id: '42', prefilled_email: 'alice@example.com' } );
		assert.deepEqual( [ target, features ], [ '_blank', 'noopener' ] );
		await area.locator( '.supporter-line', { hasText: 'Finish paying in the new tab' } ).waitFor();
		assert.equal( await locked( page ), LOCKED );
		// Asked before Stripe's word has come: it says so, rather than that there's no pass.
		await area.locator( 'button', { hasText: 'Check again' } ).click();
		await area.locator( '.supporter-status', { hasText: 'Not confirmed yet: it can take a minute after paying' } ).waitFor();

		// Paid in the other tab: Stripe has told the Worker by the time this window has focus again.
		page.state.me = { ...ALICE, supporter: true };
		await page.evaluate( () => window.dispatchEvent( new Event( 'focus' ) ) );
		await page.locator( '#toast', { hasText: 'Thanks! Supporter Pass unlocked' } ).waitFor();
		await area.locator( '.supporter-thanks' ).waitFor();
		assert.equal( await locked( page ), 0 );
		assert.equal( await area.locator( '.buy' ).count(), 0 );
		await shot( page, 'pass-3-unlocked' );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'back from Stripe on ?supporter=thanks: asked until it arrives, then unlocked, the address tidied', async () => {

		const page = await supporterPage( { me: ALICE } );
		await page.goto( `${ BASE }/?supporter=thanks` );
		await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
		assert.equal( new URL( page.url() ).search, '', 'the address still says thanks' );
		// The webhook hasn't arrived yet: it's asked again a few seconds on.
		await page.waitForFunction( () => window.drive.supporter.me );
		assert.equal( await locked( page ), LOCKED );
		page.state.me = { ...ALICE, supporter: true };
		await page.locator( '#toast', { hasText: 'Thanks! Supporter Pass unlocked' } ).waitFor( { timeout: 15000 } );
		assert.equal( await locked( page ), 0 );
		assert.ok( page.asked.me >= 2 );
		await page.context().close();

	} );

	test( 'a supporter\'s pass is back on every load, quietly; signing out locks it again', async () => {

		const page = await supporterPage( { me: { ...ALICE, supporter: true } } );
		for ( let load = 0; load < 2; load ++ ) {

			await testPad( page );
			await page.waitForFunction( () => document.querySelectorAll( '#globe-ui .vehicle.locked' ).length === 0, null, { timeout: 10000 } );
			assert.doesNotMatch( await page.locator( '#toast' ).textContent(), /Supporter|Thanks/ );

		}

		await openPass( page );
		const area = sheet( page );
		assert.match( await area.textContent(), /You have the Supporter Pass\. Thanks for helping keep World Drive on the road!/ );
		await area.locator( 'button', { hasText: 'Sign out' } ).click();
		await area.locator( '.stub-google' ).waitFor();
		assert.equal( page.asked.signOuts, 1 );
		assert.equal( await locked( page ), LOCKED );
		await page.locator( '#toast', { hasText: 'Signed out' } ).waitFor();
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'the pause menu signs in (restoring the pass) and out, and the drive goes on', async () => {

		const page = await supporterPage( { signedInAs: { ...ALICE, supporter: true } } );
		await testPad( page );
		await page.locator( '.spots button', { hasText: 'Times Square' } ).click();
		await flown( page );
		await driveHere( page );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		const account = page.locator( '#pause .account' );
		await account.locator( '.stub-google' ).waitFor();
		assert.match( await account.textContent(), /Have the Supporter Pass\? Sign in to use it here\./ );
		await shot( page, 'pass-4-pause-signed-out' );
		await page.evaluate( () => window.testCredential = 'good-token' );
		await account.locator( '.stub-google' ).click();
		await account.locator( '.supporter-line', { hasText: 'Signed in as Alice Example · ⭐ Supporter Pass · Sign out' } ).waitFor();
		assert.equal( await page.locator( '#pause .vehicle.locked' ).count(), 0 );
		await page.locator( '#toast', { hasText: 'Signed in: Supporter Pass unlocked' } ).waitFor();
		await shot( page, 'pass-5-pause-signed-in' );
		// Still paused, and the drive goes on as ever.
		assert.equal( await mode( page ), 'paused' );
		await account.locator( 'button', { hasText: 'Sign out' } ).click();
		await account.locator( '.stub-google' ).waitFor();
		assert.equal( await page.locator( '#pause .vehicle.locked' ).count(), LOCKED );
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'signed in, this browser\'s leaderboard player is linked to the account, once', async () => {

		const page = await supporterPage( { me: ALICE, player: PLAYER } );
		await testPad( page );
		await page.waitForFunction( () => window.drive.supporter.me );
		await page.waitForFunction( () => localStorage.getItem( 'world-drive.linked' ) );
		assert.deepEqual( page.asked.links, [ { id: PLAYER.id, secret: PLAYER.secret } ] );
		await testPad( page );
		await page.waitForFunction( () => window.drive.supporter.me );
		await page.waitForTimeout( 300 );
		assert.equal( page.asked.links.length, 1, 'linked again on the next visit' );
		// Signed out, the email in it goes from this browser.
		await page.evaluate( () => window.drive.supporter.signOut() );
		assert.equal( await page.evaluate( () => localStorage.getItem( 'world-drive.linked' ) ), null );
		await page.context().close();

	} );

	test( 'a ⭐ by a supporter\'s name on the leaderboard', async () => {

		const page = await leaderboardPage( { rows: [ { ...ROWS[ 0 ], supporter: true }, ROWS[ 1 ], { ...ROWS[ 2 ], supporter: 'yes' } ] } );
		await testPad( page );
		await page.locator( '#globe-ui .board-open' ).click();
		const rows = page.locator( '#leaderboard .rows li' );
		await rows.first().waitFor();
		assert.deepEqual( await rows.locator( '.who b' ).allTextContents(), [ 'Ace⭐', 'Speed Demon', 'Zoë' ] );
		const star = rows.first().locator( '.supporter-star' );
		assert.equal( await star.getAttribute( 'aria-label' ), 'Supporter Pass' );
		assert.equal( await star.getAttribute( 'title' ), 'Supporter Pass' );
		assert.equal( await rows.locator( '.supporter-star' ).count(), 1 );
		await shot( page, 'pass-6-board-star' );
		await page.context().close();

	} );

	test( 'used up on this address: the screen signs in, and once the pass is here the visit is asked for again, once', async () => {

		const usedUp = reason => ( { status: 429, contentType: 'application/json', body: JSON.stringify( { error: 'You\'ve had today\'s free drives', reason, retryAfter: 3600 } ) } );
		// The second answer is the Worker's own refusal for another reason, so no Maps key is ever handed out here.
		const mapsOff = { status: 503, contentType: 'application/json', body: '{"error":"Maps are off today"}' };
		const usedUpPage = async ( answers, options ) => {

			const page = await supporterPage( { ...options, config: { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true }, visit: route => {

				page.visits ++;
				route.fulfill( answers[ Math.min( page.visits, answers.length ) - 1 ] );

			} } );
			page.visits = 0;
			return page;

		};
		const notice = page => page.locator( '#notice' );

		// A supporter on a new browser: signs in on the screen, and the visit is asked for again.
		let page = await usedUpPage( [ usedUp( 'visitor' ), mapsOff ], { signedInAs: { ...ALICE, supporter: true } } );
		await page.goto( BASE );
		await notice( page ).locator( '.account .stub-google' ).waitFor();
		assert.equal( await notice( page ).locator( '.title' ).textContent(), 'Today\'s free drives are used up' );
		assert.match( await notice( page ).locator( '.account' ).textContent(), /Have the Supporter Pass\? Sign in to use it here\./ );
		await shot( page, 'pass-7-used-up-sign-in' );
		await page.evaluate( () => window.testCredential = 'good-token' );
		await notice( page ).locator( '.stub-google' ).click();
		await page.locator( '#notice[data-kind="error"]' ).waitFor();
		assert.equal( page.visits, 2 );
		assert.equal( await notice( page ).locator( '.message' ).textContent(), 'Maps are off today' );
		assert.ok( await notice( page ).locator( '.account' ).isHidden(), 'the sign-in stayed on another notice' );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

		// Back from paying before Stripe's word: asked again once it's here.
		page = await usedUpPage( [ usedUp( 'visitor' ), mapsOff ], { me: ALICE } );
		await page.goto( `${ BASE }/?supporter=thanks` );
		await notice( page ).locator( '.account', { hasText: 'Signed in as Alice Example · Sign out' } ).waitFor();
		assert.equal( page.visits, 1 );
		page.state.me = { ...ALICE, supporter: true };
		await page.locator( '#notice[data-kind="error"]' ).waitFor( { timeout: 15000 } );
		await page.locator( '#toast', { hasText: 'Thanks! Supporter Pass unlocked' } ).waitFor();
		assert.equal( page.visits, 2 );
		assert.equal( new URL( page.url() ).search, '' );
		await page.context().close();

		// A supporter who has had their 30: asked again once, then the screen stays, saying who's signed in.
		page = await usedUpPage( [ usedUp( 'visitor' ) ], { me: { ...ALICE, supporter: true } } );
		await page.goto( BASE );
		await notice( page ).locator( '.account', { hasText: 'Signed in as Alice Example · ⭐ Supporter Pass · Sign out' } ).waitFor();
		await page.waitForTimeout( 1500 );
		assert.equal( page.visits, 2 );
		assert.equal( await page.locator( '#notice' ).getAttribute( 'data-kind' ), 'used-up' );
		await page.context().close();

		// Everyone's drives used up, not this address's: no sign-in, and not Google's script.
		page = await usedUpPage( [ usedUp( 'daily' ) ] );
		await page.goto( BASE );
		await page.locator( '#notice[data-kind="used-up"]' ).waitFor();
		await page.waitForTimeout( 500 );
		assert.ok( await notice( page ).locator( '.account' ).isHidden() );
		assert.equal( page.asked.me, 0 );
		assert.equal( page.google, 0 );
		await page.context().close();

	} );

	test( 'buying not open yet: "Coming soon", with signing in for those who have the pass', async () => {

		const page = await supporterPage( { me: { ...SIGNED_OUT, purchase: { enabled: false } } } );
		await testPad( page );
		await page.waitForFunction( () => window.drive.supporter.me );
		await openPass( page );
		const area = sheet( page );
		await area.locator( '.stub-google' ).waitFor();
		assert.equal( await area.locator( '.buy' ).textContent(), 'Coming soon' );
		assert.ok( await area.locator( '.buy' ).isDisabled() );
		assert.match( await area.textContent(), /Have the pass already\? Sign in to use it here\..*Buying opens soon\./ );
		await page.context().close();

	} );

	test( 'no sign-in set up, or the Worker not answering: the free game as ever, the sheet "Coming soon"', async () => {

		for ( const [ why, options ] of [ [ 'no client id', { clientId: '' } ], [ '/api/me down', { me: 'down' } ] ] ) {

			const page = await supporterPage( options );
			await testPad( page );
			await openPass( page );
			const area = sheet( page );
			assert.equal( await area.locator( '.buy' ).textContent(), 'Coming soon', why );
			assert.ok( await area.locator( '.buy' ).isDisabled(), why );
			assert.equal( await page.locator( '#pause .account' ).isHidden(), true, why );
			assert.equal( page.google, 0, `${ why }: Google's script loaded` );
			if ( why === 'no client id' ) assert.equal( page.asked.me, 0, 'asked /api/me with no sign-in set up' );
			await page.locator( '#pass .close' ).click();
			// And it drives.
			await page.locator( '.spots button', { hasText: 'Times Square' } ).click();
			await flown( page );
			await driveHere( page );
			assert.equal( await locked( page ), LOCKED, why );
			assert.deepEqual( page.errors, [], why );
			await page.context().close();

		}

	} );

} );
