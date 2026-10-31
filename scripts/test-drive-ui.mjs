// npm run test:drive-ui: World Drive (drive/index.html, src/drive-app/) in a real browser, on the
// Vite dev server with no Maps key: the test globe and the flat test pad stand in for Google's
// tiles. The globe and its panel; search (the Worker's /api/search answered here) only on Enter;
// typed coordinates; start spots; a tap on the globe; dropping in and driving; stunts (a wall
// throwing the kart into the air, a backflip landed for points, the DRIFT button); the vehicle
// picker and changing ride from the pause menu; M back to the globe and teleporting again with no
// reload; recent places and the picked ride kept across a reload; a phone with touch buttons;
// boosting flat out going supersonic in each free ride (the boom, the streaks, the tag and the
// wider view, and its end), and boost pads (put down on open ground as it drives and never on a
// roof, a car, a slope or from high up, moved onto sharper ground, a small one's 12 % and a big
// one's fill, dark then lit again, left lit with the gauge full, recycled, and the pause menu's
// switch kept across a reload); water (the pad's sea given one even sea colour, as Google draws
// water): off its edge at speed, off a ramp and slowly down a beach, each a splash, sinking nose
// first with the camera holding on it, the combo lost, then back on the dry ground it came from
// facing away; flying over it until coming down, R in it and R by it, and boost pads never on it;
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
// what was asked.
async function newPage( { viewport = { width: 1280, height: 800 }, touch = false, api = {} } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
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
		// Then the cars (the muscle car free) and the Supporter Pass's rides, locked (see
		// test-drive-pro-ui.mjs).
		assert.deepEqual( await panel.locator( '.vehicle b' ).allTextContents(), [
			'Go-kart', 'Pickup', 'Muscle car', 'Neon racer', 'Night cruiser', 'Dune buggy', 'Farm truck', 'Police cruiser',
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

	test( 'the pause menu turns boost pads off, kept across a reload, and on again', async () => {

		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		const toggle = page.locator( '#pause .pads-toggle' );
		assert.ok( await toggle.isChecked() );
		await shot( page, 'boost-pads-switch' );
		await toggle.uncheck();
		const off = await page.evaluate( () => {

			const { pads } = window.drive;
			return { enabled: pads.enabled, shown: pads.group.visible, lit: pads.pads.filter( p => p.state !== 'free' ).length, kept: localStorage.getItem( 'world-drive.pads' ) };

		} );
		assert.deepEqual( off, { enabled: false, shown: false, lit: 0, kept: 'off' } );
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		const driving = await page.evaluate( () => {

			const { driver: d, pads } = window.drive;
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, speed: 60 / 3.6, gauge: 0.5 } );
			for ( let i = 0; i < 300; i ++ ) {

				d.update( 1 / 60 );
				pads.update( 1 / 60 );

			}

			return pads.pads.filter( p => p.state !== 'free' ).length;

		} );
		assert.equal( driving, 0 );

		// Still off after a reload; on again from the pause menu, and pads come.
		await openGlobe( page );
		await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
		await flown( page );
		await driveHere( page );
		assert.equal( await page.evaluate( () => window.drive.pads.enabled ), false );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		assert.equal( await toggle.isChecked(), false );
		await toggle.check();
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		const on = await page.evaluate( () => {

			const { driver: d, pads } = window.drive;
			Object.assign( d, { east: 0, north: 0, heading: 0, course: 0, speed: 60 / 3.6 } );
			for ( let i = 0; i < 300; i ++ ) {

				d.update( 1 / 60 );
				pads.update( 1 / 60 );

			}

			return { enabled: pads.enabled, lit: pads.pads.filter( p => p.state !== 'free' ).length, kept: localStorage.getItem( 'world-drive.pads' ) };

		} );
		assert.ok( on.enabled && on.lit > 3 && on.kept === 'on', JSON.stringify( on ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

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

			// Stopped at ( 0, north ) on whatever is there, facing `heading` at `kmh`, with no trail.
			reset( north, heading, kmh = 0 ) {

				for ( const code of [ ...d.keys ] ) d.release( code );
				const y = d.groundAt( 0, north, 10 );
				Object.assign( d, { east: 0, north, y, heading, course: heading, view: heading, speed: kmh / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftHop: false, boost: null, firing: false, splash: null, dry: [], wetIn: 0, onWater: false, mult: 1 } );
				d.lastSafe = { east: 0, north, y };
				d.lastBase = null;
				d.hud.fade( false );
				d.update( 1 / 60 );

			},

			// Driven at a fixed step for `seconds`, or until `each` says false.
			step( seconds, each ) {

				for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

					d.update( 1 / 60 );
					if ( each?.() === false ) return;

				}

			},

			// What the HUD says: the splash's word, the fade, the message and the tricks line.
			hud: () => ( {
				word: $( '.dhud-pop.splash' )?.textContent ?? null,
				fade: $( '.dhud-fade' ).classList.contains( 'on' ),
				flash: $( '.dhud-flash' ).hidden ? null : $( '.dhud-flash' ).textContent,
				tricks: $( '.dhud-tricks' ).hidden ? null : $( '.dhud-tricks' ).textContent,
			} ),

			// The splash's spray (sprites) and foam (flat quads) showing.
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

	test( 'off the edge into water at speed: a splash, it sinks nose first with the camera on it, then it\'s back on the dry ground it came from, facing away', async () => {

		const result = await page.evaluate( () => {

			const { driver: d, camera, water } = window.drive;
			const kit = window.waterKit;
			const out = { seaIsWater: water.at( 0, - 340, - 1 ), landIsWater: water.at( 0, - 200, 0 ) };
			kit.reset( - 200, 180, 70 );
			d.press( 'KeyW' );
			let flew = 0;
			kit.step( 8, () => {

				if ( ! d.grounded || d.air ) flew ++;
				return ! d.splash;

			} );
			d.release( 'KeyW' );
			if ( ! d.splash ) return { ...out, splashed: false };
			const { level } = d.splash;
			Object.assign( out, { splashed: true, flew: flew / 60, wentIn: d.north, level, height: d.height, hud: kit.hud(), fx: kit.fx() } );
			// Sinking: how low and how far nose down; the camera held above the water, not rising or
			// falling, with the vehicle in the middle of the view.
			let low = Infinity, nose = 0, cameraY = [ Infinity, - Infinity ], aside = 0, fadeAt = null, back = null;
			const ndc = d.entry.pivot.position.clone();
			let t = 0;
			kit.step( 3, () => {

				t += 1 / 60;
				if ( ! d.splash ) {

					back = t;
					return false;

				}

				low = Math.min( low, d.y );
				nose = Math.min( nose, d.pitch );
				cameraY = [ Math.min( cameraY[ 0 ], camera.position.y ), Math.max( cameraY[ 1 ], camera.position.y ) ];
				d.middle( ndc ).project( camera );
				if ( d.splash.t > 0.3 ) aside = Math.max( aside, Math.abs( ndc.x ), Math.abs( ndc.y ) );
				if ( fadeAt === null && kit.hud().fade ) fadeAt = d.splash.t;

			} );
			Object.assign( out, { low, nose, cameraY, aside, fadeAt, back } );
			Object.assign( out, { after: { north: d.north, y: d.y, heading: d.heading, speed: d.speed, splash: !! d.splash, onWater: water.at( d.east, d.north, d.y ), lastDry: d.dry.at( - 1 ) }, hudAfter: kit.hud() } );
			// And it drives on, away from the water.
			const north = d.north;
			d.press( 'KeyW' );
			kit.step( 1 );
			d.release( 'KeyW' );
			out.drove = d.north - north;
			return out;

		} );
		console.log( 'water, off the edge:', JSON.stringify( result ) );
		assert.ok( result.seaIsWater !== null && Math.abs( result.seaIsWater + 2 ) < 0.01, 'the sea isn\'t water' );
		assert.equal( result.landIsWater, null );
		assert.ok( result.splashed, 'no splash' );
		// In the water, at its surface.
		assert.ok( result.wentIn < - 282 && Math.abs( result.level + 2 ) < 0.01, JSON.stringify( result ) );
		assert.ok( [ 'SPLASH!', 'KER-SPLOOSH!' ].includes( result.hud.word ), JSON.stringify( result.hud ) );
		assert.ok( result.fx.sprites >= 40 && result.fx.foam >= 2, JSON.stringify( result.fx ) );
		// Sinking nose first, the camera holding still above the water with it in the middle of the view.
		assert.ok( result.low < result.level - result.height * 0.4 && result.nose < - 0.3, JSON.stringify( result ) );
		assert.ok( result.cameraY[ 0 ] >= result.level + 1.5 && result.cameraY[ 1 ] - result.cameraY[ 0 ] < 0.01 && result.aside < 0.6, JSON.stringify( result ) );
		// The view fades out after about a second and a half, and it's back about a quarter of a second later.
		assert.ok( result.fadeAt >= 1.4 && result.fadeAt <= 1.6 && result.back >= 1.6 && result.back <= 2, JSON.stringify( result ) );
		// Back on the land it drove off, a few metres from the edge, stopped and facing away from the water.
		assert.ok( result.after.north > - 280 + 4 && result.after.north < - 200 && Math.abs( result.after.y ) < 0.01, JSON.stringify( result.after ) );
		assert.ok( Math.abs( ( result.after.heading + 540 ) % 360 - 180 ) < 15 && result.after.speed === 0 && ! result.after.splash && result.after.onWater === null, JSON.stringify( result.after ) );
		assert.ok( ! result.hudAfter.fade && result.hudAfter.flash === 'Back on dry land', JSON.stringify( result.hudAfter ) );
		assert.ok( result.drove > 2, `drove ${ result.drove } m on from there` );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'off a ramp into it: the trick in the air and the combo are lost, as in a wipeout', async () => {

		const result = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const kit = window.waterKit;
			// 14 m long, rising 2.8 m to the edge.
			const ramp = kit.slab( 8, 14, 0, - 280 + 7 * Math.cos( 0.2 ), 7 * Math.sin( 0.2 ), 0.2 );
			kit.reset( - 230, 180, 80 );
			Object.assign( d, { mult: 3, lastTrick: d.clock, score: 5000 } );
			d.press( 'KeyW' );
			let top = 0, spun = false;
			kit.step( 8, () => {

				top = Math.max( top, d.y );
				if ( d.air && ! spun && d.north < - 281 ) {

					d.release( 'KeyW' );
					d.press( 'KeyA' );
					spun = true;

				}

				return ! d.splash;

			} );
			d.release( 'KeyA' );
			const out = { top, spun, splashed: !! d.splash, north: d.north, mult: d.mult, score: d.score, air: d.air, hud: window.waterKit.hud() };
			kit.step( 2.5, () => !! d.splash );
			Object.assign( out, { after: { north: d.north, y: d.y, heading: d.heading } } );
			kit.remove( ramp );
			return out;

		} );
		console.log( 'water, off a ramp:', JSON.stringify( result ) );
		assert.ok( result.top > 2.5 && result.spun && result.splashed && result.north < - 290, JSON.stringify( result ) );
		// Lost: the spin it was doing and the ×3 combo; the score it had is kept.
		assert.ok( /Spin!/.test( result.hud.tricks ) && /Combo ×3 lost/.test( result.hud.tricks ), JSON.stringify( result.hud ) );
		assert.ok( result.mult === 1 && result.score === 5000 && result.air === null, JSON.stringify( result ) );
		// Back before the ramp's end, facing away from the water.
		assert.ok( result.after.north > - 280 + 4 && Math.abs( ( result.after.heading + 540 ) % 360 - 180 ) < 15, JSON.stringify( result.after ) );

	} );

	test( 'driving slowly off a beach into the sea does the same', async () => {

		const result = await page.evaluate( () => {

			const { driver: d, water } = window.drive;
			const kit = window.waterKit;
			// 20 m wide, from the land's edge down into the sea (under it from north = -300).
			const beach = kit.slab( 20, 40, 0, - 300, - 2, - 0.1 );
			kit.reset( - 262, 180, 11 );
			let into = null;
			kit.step( 20, () => {

				d.speed = 11 / 3.6;
				if ( into === null && d.y < - 1.99 ) into = d.north;
				return ! d.splash;

			} );
			const out = { splashed: !! d.splash, at: d.north, into, hud: kit.hud(), level: d.splash?.level };
			kit.step( 2.5, () => !! d.splash );
			Object.assign( out, { after: { north: d.north, y: d.y, heading: d.heading, wet: water.at( d.east, d.north, d.y ) } } );
			kit.remove( beach );
			return out;

		} );
		console.log( 'water, off a beach:', JSON.stringify( result ) );
		assert.ok( result.splashed, 'drove into the sea without a splash' );
		// Slowly in: a small splash, once it's well out in the water.
		assert.ok( result.hud.word === 'SPLISH!' && result.at < - 300 && result.at > - 320, JSON.stringify( result ) );
		// Back up the beach, dry, facing up it, away from the sea.
		assert.ok( result.after.north > result.at + 8 && result.after.y > - 1.5 && result.after.wet === null, JSON.stringify( result.after ) );
		assert.ok( Math.abs( ( result.after.heading + 540 ) % 360 - 180 ) < 15, JSON.stringify( result.after ) );

	} );

	test( 'flying over water is fine until it comes down in it; R in the water is back on dry land at once, and R by the water never puts it in', async () => {

		const result = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const kit = window.waterKit;
			kit.reset( - 250, 180, 60 );
			const out = {};
			// Up on Shift, out over the sea.
			d.press( 'ShiftLeft' );
			kit.step( 4 );
			Object.assign( out, { flying: d.flying, overSea: d.north < - 300, high: d.y, splashFlying: !! d.splash } );
			d.release( 'ShiftLeft' );
			kit.step( 30, () => ! d.splash );
			Object.assign( out, { downIn: !! d.splash, at: d.north, flyingAfter: d.flying } );
			// R a moment into the splash.
			kit.step( 0.3 );
			d.press( 'KeyR' );
			d.release( 'KeyR' );
			Object.assign( out, { afterR: { splash: !! d.splash, north: d.north, y: d.y, fade: kit.hud().fade } } );
			// R on the edge facing the water: not the few metres on, into the sea.
			kit.reset( - 277, 180 );
			kit.step( 0.2 );
			d.press( 'KeyR' );
			d.release( 'KeyR' );
			kit.step( 0.3 );
			Object.assign( out, { edgeR: { north: d.north, y: d.y, splash: !! d.splash } } );
			return out;

		} );
		console.log( 'water, flying and R:', JSON.stringify( result ) );
		assert.ok( result.flying && result.overSea && result.high > 5 && ! result.splashFlying, JSON.stringify( result ) );
		assert.ok( result.downIn && result.at < - 300 && ! result.flyingAfter, JSON.stringify( result ) );
		assert.ok( ! result.afterR.splash && result.afterR.north > - 280 && Math.abs( result.afterR.y ) < 0.01 && ! result.afterR.fade, JSON.stringify( result.afterR ) );
		assert.ok( result.edgeR.north > - 280 && ! result.edgeR.splash, JSON.stringify( result.edgeR ) );

	} );

	test( 'boost pads never go down on the water, even where it can be driven to', async () => {

		const result = await page.evaluate( () => {

			const { driver: d, pads } = window.drive;
			const kit = window.waterKit;
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

	test( 'slowly off a quay: down into the water by its edge is a splash there, not a dozen metres out', async () => {

		const result = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const kit = window.waterKit;
			kit.reset( - 268, 180, 14 );
			d.press( 'KeyW' );
			kit.step( 10, () => {

				d.speed = Math.min( d.speed, 14 / 3.6 );
				return ! d.splash;

			} );
			d.release( 'KeyW' );
			const out = { splashed: !! d.splash, at: d.north, level: d.splash?.level, word: kit.hud().word };
			kit.step( 2.5, () => !! d.splash );
			Object.assign( out, { after: { north: d.north, y: d.y, heading: d.heading } } );
			return out;

		} );
		console.log( 'water, off a quay:', JSON.stringify( result ) );
		assert.ok( result.splashed && result.at < - 280 && result.at > - 288 && Math.abs( result.level + 2 ) < 0.01, JSON.stringify( result ) );
		assert.ok( result.after.north > - 280 && Math.abs( result.after.y ) < 0.01 && Math.abs( ( result.after.heading + 540 ) % 360 - 180 ) < 15, JSON.stringify( result.after ) );

	} );

	test( 'never the same splash over and over: put back on a spot that turns out to be water, it\'s let be; the way back is never level with the water if it can help it; a pause keeps the way back', async () => {

		const result = await page.evaluate( async () => {

			const { driver: d } = window.drive;
			const kit = window.waterKit;
			const out = {};
			let splashes = 0;
			const start = d.startSplash;
			d.startSplash = function ( ...args ) {

				splashes ++;
				return start.apply( this, args );

			};
			// The only way back is on the sea (as if coarse tiles there had looked dry).
			kit.reset( - 340, 180 );
			d.dry = [ { east: 0, north: - 330, y: - 2, heading: 0 } ];
			d.startSplash( - 2, 3 );
			kit.step( 2.5, () => !! d.splash );
			Object.assign( out, { back: { north: d.north, y: d.y } } );
			kit.step( 5 );
			Object.assign( out, { splashes, left: d.dry.length, after: { north: d.north, y: d.y, splash: !! d.splash } } );
			// A way back with a spot about level with the water nearest it (a pontoon, say): the one
			// on the land before it is taken.
			d.dry = [ { east: 0, north: - 236, y: 0, heading: 180 }, { east: 0, north: - 250, y: - 1.8, heading: 180 }, { east: 0, north: - 276, y: 0, heading: 180 } ];
			out.dryBack = d.dryBack( 0, - 300, - 2 ).north;
			d.startSplash = start;
			// Driven along the land, paused and driven on: the trail is still there.
			kit.reset( - 150, 0 );
			d.press( 'KeyW' );
			kit.step( 3 );
			d.release( 'KeyW' );
			const trail = d.dry.length;
			d.stop();
			await new Promise( resolve => setTimeout( resolve, 100 ) );
			const paused = window.drive.mode;
			window.drive.resume();
			Object.assign( out, { trail, paused, resumed: window.drive.mode, trailAfter: d.dry.length } );
			return out;

		} );
		console.log( 'water, no splash loop:', JSON.stringify( result ) );
		assert.ok( Math.abs( result.back.north + 330 ) < 1, JSON.stringify( result ) );
		assert.ok( result.splashes === 1 && result.left === 0 && ! result.after.splash && Math.abs( result.after.y + 2 ) < 0.01, JSON.stringify( result ) );
		assert.equal( result.dryBack, - 236 );
		assert.ok( result.trail > 3 && result.paused === 'paused' && result.resumed === 'driving' && result.trailAfter === result.trail, JSON.stringify( result ) );

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
		await page.waitForTimeout( 300 );
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
// What the pass unlocks in the picker: five cars and four rides.
const LOCKED = 9;
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
