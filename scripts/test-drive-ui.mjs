// npm run test:drive-ui: World Drive (drive/index.html, src/drive-app/) in a real browser, on the
// Vite dev server with no Maps key: the test globe and the flat test pad stand in for Google's
// tiles. The globe and its panel; search (the Worker's /api/search answered here) only on Enter;
// typed coordinates; start spots; a tap on the globe; dropping in and driving; stunts (a wall
// throwing the kart into the air, a backflip landed for points, the DRIFT button); the vehicle picker
// and changing ride from the pause menu; M back to the globe and teleporting again with no reload;
// recent places and the picked ride kept across a reload; a phone with touch buttons; and the
// screens the Worker's answers lead to (used up, robot check, maps off, the visit itself). Every
// request that isn't to the local server is blocked, so nothing reaches Google, Cloudflare or
// OpenStreetMap.
//
// Needs Playwright with Chromium, as test-accounts-ui.mjs does. TEST_VITE_PORT picks the port;
// TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startVite } from './worker-harness.mjs';

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
		assert.deepEqual( await panel.locator( '.vehicle b' ).allTextContents(), [ 'Go-kart', 'Pickup', 'Haul truck' ] );
		assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Go-kart' );
		assert.match( await panel.locator( '.osm' ).textContent(), /Search © OpenStreetMap contributors/ );
		assert.equal( await page.locator( '#pin-card, .pin-card' ).isVisible(), false );
		assert.equal( await page.evaluate( () => !! window.drive.tiles ), false );
		// No Worker here: no robot check either.
		assert.deepEqual( page.outside, [] );
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
