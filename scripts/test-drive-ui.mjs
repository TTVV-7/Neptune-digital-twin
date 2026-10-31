// npm run test:drive-ui: World Drive (drive/index.html, src/drive-app/) in a real browser, on the
// Vite dev server with no Maps key: the test globe and the flat test pad stand in for Google's
// tiles. The globe and its panel; search (the Worker's /api/search answered here) only on Enter;
// typed coordinates; start spots; a tap on the globe; dropping in and driving; stunts (a wall
// throwing the kart into the air, a backflip landed for points, the DRIFT button); the vehicle picker
// and changing ride from the pause menu; M back to the globe and teleporting again with no reload;
// recent places and the picked ride kept across a reload; a phone with touch buttons; the
// screens the Worker's answers lead to (used up, robot check, maps off, the visit itself); and the
// leaderboard (its answers made here): the trophy and the panel, tabs, your own row, picking a name
// and renaming, a landed jump posting the run (the card asking the first time, never stopping the
// drive), each place's best posted as well as the day's, a dead connection changing nothing, and all
// of it on a phone. And the Supporter Pass's buying (its answers made here, Google's sign-in script
// stood in for): signing in from the pass's sheet, the pause menu and the used-up screen, Buy's link
// saying whose it is, unlocking when the window has focus again and on ?supporter=thanks, on every
// load for a supporter, signing out, the leaderboard player linked, the ⭐ on the board, and "Coming
// soon" with no sign-in or no Worker answering, the free game unchanged. Every request that isn't to
// the local server is blocked, so nothing reaches Google, Cloudflare, Stripe or OpenStreetMap.
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
			'Go-kart', 'Pickup', 'Haul truck', 'Muscle car', 'Neon racer', 'Night cruiser', 'Dune buggy', 'Farm truck', 'Police cruiser',
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

		// The haul truck this time, at the place in Recent.
		await page.locator( '#globe-ui .vehicle', { hasText: 'Haul truck' } ).click();
		await page.locator( '.spots button', { hasText: 'Furka Pass' } ).click();
		await flown( page );
		await driveHere( page );
		const now = await page.evaluate( () => ( { name: window.drive.driver.entry.state.name, place: window.drive.place.name, navigations: performance.getEntriesByType( 'navigation' ).length } ) );
		assert.deepEqual( now, { name: 'Haul truck', place: 'Furka Pass', navigations: 1 } );
		await page.waitForTimeout( 600 );
		await shot( page, 'drive-9-haul' );

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
		assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Haul truck' );
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
	{ rank: 3, name: 'Zoë', score: 18750, tricks: 'Wall bounce + Big air 1.8 s', place: 'Golden Gate Bridge', vehicle: 'haul-truck-hd465', airTime: 1.8, date: '2026-10-30' },
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
