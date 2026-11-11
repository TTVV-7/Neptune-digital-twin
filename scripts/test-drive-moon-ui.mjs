// npm run test:drive-moon-ui: World Drive's Moon (src/drive-app/moon.js, docs/world-drive.md, "The
// Moon") in a real browser, on the Vite dev server with no Maps key. The Moon needs none, so it's
// the real Moon here, not a stand-in: the globe turned to it (its files fetched only then), its
// spots, its own search and its recent places kept apart; a drop-in on its ground, with its gravity,
// its sky and no water; a hop as high as on the Earth that stays up two and a half times as long and
// isn't scored as big air; an underglow lying on its ground under the kart, as on the Earth; the
// ground made sharp round the vehicle; M back to its globe, and back to
// the Earth; a link to a Moon spot; and a phone. Every request that isn't to the local server is
// blocked.
//
// The tests drive the go-kart (drawn in code; the pickup is too slow in Chromium's software
// renderer, see test-drive-ui.mjs's pickRide), on a small window: the Moon's ground is heavy
// drawing without a GPU, about a frame a second.
//
// Needs Playwright with Chromium, as test-drive-ui.mjs does. TEST_VITE_PORT picks the port;
// TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { MOON_SPOTS } from '../src/drive-app/moon-places.js';
import { SPOTS } from '../src/drive-app/places.js';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5571;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const TRANQUILITY = MOON_SPOTS.find( spot => spot.id === 'moon-apollo-11' );
// The Moon's gravity as a share of the Earth's, and what a hop's speed is multiplied by there.
const GRAVITY = 1.62 / 9.81;
const LEAP = Math.sqrt( GRAVITY );

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

// A page with everything off this machine blocked, the go-kart picked unless a ride is, and boost
// pads off (they'd only slow the drawing). moon: the Moon's files asked for, in order.
async function newPage( { viewport = { width: 800, height: 500 }, touch = false } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( () => {

		if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', 'go-kart' );
		localStorage.setItem( 'world-drive.pads', 'off' );

	} );
	const page = await context.newPage();
	page.outside = [];
	page.errors = [];
	page.moon = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	page.on( 'request', request => new URL( request.url() ).pathname.startsWith( '/moon/' ) && page.moon.push( new URL( request.url() ).pathname ) );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => {

		page.outside.push( route.request().url() );
		route.abort();

	} );
	return page;

}

async function openGlobe( page, path = '/' ) {

	await page.goto( BASE + path );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

}

const flown = page => page.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 60000 } );
const shot = ( page, name ) => SHOTS ? page.screenshot( { path: join( SHOTS, `${ name }.png` ), timeout: 120000 } ) : null;
const names = page => page.locator( '#globe-ui .spots button b' ).allTextContents();

async function toMoon( page ) {

	await page.locator( '#globe-ui .worlds [data-world="moon"]' ).click();
	await page.waitForFunction( () => window.drive.world === 'moon', null, { timeout: 60000 } );
	await flown( page );

}

describe( 'World Drive on the Moon', () => {

	let page;

	before( async () => {

		page = await newPage();

	} );

	after( () => page?.context().close() );

	test( 'the globe turns to the Moon: its spots and words, its files fetched only now', async () => {

		await openGlobe( page );
		assert.deepEqual( page.moon, [], 'nothing of the Moon\'s is fetched on the Earth' );
		assert.equal( await page.evaluate( () => window.drive.moon.stars ), null, 'nor its stars made' );
		assert.equal( await page.locator( '#globe-ui .worlds [data-world="earth"]' ).getAttribute( 'aria-checked' ), 'true' );
		assert.deepEqual( await names( page ), SPOTS.map( spot => spot.name ) );

		await toMoon( page );
		assert.deepEqual( page.moon.sort(), [ '/moon/colour.webp', '/moon/height.bin' ] );
		assert.equal( await page.locator( '#globe-ui .worlds [data-world="moon"]' ).getAttribute( 'aria-checked' ), 'true' );
		assert.equal( await page.evaluate( () => document.body.dataset.world ), 'moon' );
		assert.deepEqual( await names( page ), MOON_SPOTS.map( spot => spot.name ) );
		assert.equal( await page.locator( '#globe-ui .tagline' ).textContent(), 'Pick anywhere on the Moon. Drop in. Drive.' );
		assert.equal( await page.locator( '#globe-ui .search input' ).getAttribute( 'placeholder' ), 'A crater, a sea, or lat, lon' );
		// No map search's credit, and NASA's for the Moon's pictures.
		assert.equal( await page.locator( '#globe-ui .osm' ).isVisible(), false );
		await page.locator( '#moon-credit' ).waitFor();
		const globe = await page.evaluate( () => {

			const { globe, moon, scene } = window.drive;
			return { body: globe.earth === moon.group, surface: globe.surface === moon.terrain, air: globe.air.visible, stars: scene.background === moon.stars, drawn: moon.stats().drawn, earthShown: scene.getObjectByName( 'test-globe' ).visible, altitude: globe.altitude() };

		} );
		assert.deepEqual( { ...globe, drawn: globe.drawn > 0, altitude: globe.altitude > 1e6 && globe.altitude < 5e6 }, { body: true, surface: true, air: false, stars: true, drawn: true, earthShown: false, altitude: true }, JSON.stringify( globe ) );
		assert.deepEqual( page.outside, [] );
		await shot( page, 'moon-1-globe' );

	} );

	test( 'its own search: names, other names, coordinates, and nothing asked of anyone', async () => {

		const search = page.locator( '#globe-ui .search input' );
		await search.fill( 'tycho' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Tycho crater' ] );
		await search.fill( 'sea of rains' );
		await search.press( 'Enter' );
		assert.equal( await page.locator( '#globe-ui .results button b' ).first().textContent(), 'Mare Imbrium' );
		await search.fill( 'Schroteri' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Vallis Schröteri' ] );
		// Landing sites by their missions.
		await search.fill( 'Apollo 11' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Tranquility Base' ] );
		await search.fill( 'change 4' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Von Kármán crater' ] );
		await search.fill( 'Gotham' );
		await search.press( 'Enter' );
		assert.match( await page.locator( '#globe-ui .search-status' ).textContent(), /Nothing found for "Gotham"\. Try a crater/ );

		// Coordinates are the Moon's: pinned there.
		await search.fill( '-43.31, -11.36' );
		await search.press( 'Enter' );
		await flown( page );
		assert.equal( await page.locator( '.pin-card .coords' ).textContent(), 'Moon coordinates · 43.3100° S, 11.3600° W' );
		const pin = await page.evaluate( () => window.drive.panel.pinned );
		assert.equal( pin.world, 'moon' );
		// Its height, worked out rather than looked for: about 1.9 km under the Moon's sphere there.
		assert.ok( pin.height < - 1000 && pin.height > - 3500, JSON.stringify( pin ) );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'dropped in at Tranquility Base: on its ground, a sixth of the gravity, stars, the Earth in the sky, no water', async () => {

		await page.locator( '#globe-ui .spots button', { hasText: TRANQUILITY.name } ).click();
		await flown( page );
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Tranquility Base' );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 180000 } );
		const here = await page.evaluate( () => {

			const { driver: d, ground, water, sea, scene, moon, place, pads, globe, entry } = window.drive;
			const under = ground.heightAt( - d.east, d.north, d.y + 30, 60 );
			return {
				world: window.drive.world, place: place.world, name: entry.state.name,
				gravity: d.gravity, water: d.water, none: water.none, dry: water.look( d.east, d.north, d.y ), sea: sea.shown,
				above: d.y - under, stars: scene.background === moon.stars, sky: moon.earth.visible, rules: pads.rules.tilt,
				// The ground is the Moon's, as fine as it goes by the vehicle.
				grounds: ground.getColliders().map( o => o.name ), body: globe.earth === moon.group, levels: Math.max( ...Object.keys( moon.stats().levels ).map( Number ) ),
			};

		} );
		assert.ok( Math.abs( here.gravity - GRAVITY ) < 1e-6, JSON.stringify( here ) );
		assert.ok( Math.abs( here.above ) < 0.3, JSON.stringify( here ) );
		assert.deepEqual( { ...here, gravity: 0, above: 0 }, {
			world: 'moon', place: 'moon', name: 'Go-kart', gravity: 0, water: null, none: true, dry: { level: null, dry: true }, sea: false,
			above: 0, stars: true, sky: true, rules: 0.9, grounds: [ 'moon-terrain' ], body: true, levels: 16,
		} );
		// NASA's credit, not Google's.
		assert.equal( await page.locator( '#attribution' ).isVisible(), false );
		assert.equal( await page.locator( '#moon-credit' ).isVisible(), true );
		assert.equal( await page.locator( '#drive-ui .place' ).textContent(), 'Tranquility Base' );

		await page.keyboard.down( 'KeyW' );
		await page.waitForFunction( () => window.drive.driver.speed > 4, null, { timeout: 120000 } );
		await page.keyboard.up( 'KeyW' );
		assert.ok( await page.evaluate( () => window.drive.driver.grounded ) );
		await shot( page, 'moon-2-driving' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'an underglow lies on its ground under the kart, as on the Earth', async () => {

		const glow = await page.evaluate( async () => {

			const { applyLook, lookFor } = await import( '/src/drive-app/paint.js' );
			const { entry, driver: d, ground } = window.drive;
			const kart = { id: 'go-kart', colour: 'blaze' };
			applyLook( entry.pivot, { ...lookFor( kart ), glow: 'ice' }, kart );
			const glow = entry.pivot.userData.glow;
			// A few frames (about one a second here), the glow eased in each as main.js does.
			const end = performance.now() + 3000;
			while ( performance.now() < end ) await new Promise( requestAnimationFrame );
			const under = ground.heightAt( - d.east, d.north, d.y + 30, 60 );
			return { visible: glow.visible, lift: glow.userData.lift, grounded: d.grounded, over: glow.getWorldPosition( glow.position.clone() ).y - under };

		} );
		assert.ok( glow.visible && glow.lift > 0.99 && glow.grounded && Math.abs( glow.over ) < 0.3, JSON.stringify( glow ) );
		await shot( page, 'moon-underglow' );
		await page.evaluate( async () => {

			const { applyLook, lookFor } = await import( '/src/drive-app/paint.js' );
			const kart = { id: 'go-kart', colour: 'blaze' };
			applyLook( window.drive.entry.pivot, lookFor( kart ), kart );

		} );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'a hop goes as high as on the Earth and stays up two and a half times as long, and isn\'t big air', async () => {

		const hop = await page.evaluate( () => {

			const { driver: d } = window.drive;
			for ( const code of [ ...d.keys ] ) d.release?.( code );
			d.keys.clear();
			Object.assign( d, { speed: 0, vy: 0, pitch: 0, roll: 0 } );
			for ( let i = 0; i < 30; i ++ ) d.update( 1 / 60 );
			const start = { y: d.y, score: d.score };
			d.hop();
			const speed = d.vy;
			let top = d.y;
			let i = 0;
			for ( ; i < 1200; i ++ ) {

				d.update( 1 / 60 );
				top = Math.max( top, d.y );
				if ( i > 10 && d.grounded && ! d.air ) break;

			}

			return { speed, high: top - start.y, time: i / 60, landed: d.grounded, scored: d.score - start.score, pending: d.air?.pending ?? '', best: d.bestJump?.lines ?? null };

		} );
		// 7 m/s on the Earth: 2.5 m up and 1.43 s in the air.
		assert.ok( Math.abs( hop.speed - 7 * LEAP ) < 1e-6, JSON.stringify( hop ) );
		assert.ok( hop.high > 2 && hop.high < 3, JSON.stringify( hop ) );
		assert.ok( hop.time > 3 && hop.time < 4.2, JSON.stringify( hop ) );
		// As long in Earth time as the Earth's hop, under big air's 1.5 s: nothing scored.
		assert.deepEqual( [ hop.landed, hop.scored ], [ true, 0 ], JSON.stringify( hop ) );

	} );

	test( 'M goes back to the Moon\'s globe, its recent places its own; then back to the Earth', async () => {

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe', null, { timeout: 30000 } );
		await flown( page );
		assert.equal( await page.evaluate( () => window.drive.world ), 'moon' );
		assert.deepEqual( await page.locator( '#globe-ui .recent button b' ).allTextContents(), [ 'Tranquility Base' ] );
		assert.equal( await page.evaluate( () => localStorage.getItem( 'world-drive.recent' ) ), null, 'the Earth\'s recent places are untouched' );
		await shot( page, 'moon-3-back' );

		await page.locator( '#globe-ui .worlds [data-world="earth"]' ).click();
		await page.waitForFunction( () => window.drive.world === 'earth', null, { timeout: 30000 } );
		await flown( page );
		const earth = await page.evaluate( () => {

			const { globe, moon, scene } = window.drive;
			return { body: globe.earth === scene.getObjectByName( 'test-globe' ), moon: moon.group.visible, shown: scene.getObjectByName( 'test-globe' ).visible, world: document.body.dataset.world };

		} );
		assert.deepEqual( earth, { body: true, moon: false, shown: true, world: 'earth' } );
		assert.deepEqual( await names( page ), SPOTS.map( spot => spot.name ) );
		assert.equal( await page.locator( '#globe-ui .recent-block' ).isVisible(), false );
		assert.equal( await page.locator( '#moon-credit' ).isVisible(), false );

		// And driving on the Earth is as it was: its gravity and its water.
		await page.evaluate( () => window.drive.dropIn( { name: 'Test pad', lat: 46.5725, lon: 8.4153 } ) );
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		assert.deepEqual( await page.evaluate( () => {

			const { driver: d, water, pads, ground } = window.drive;
			return { gravity: d.gravity, water: d.water === water, none: water.none, rules: pads.rules.tilt, grounds: ground.getColliders().length };

		} ), { gravity: 1, water: true, none: false, rules: 0.96, grounds: 1 } );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

} );

describe( 'World Drive\'s Moon, by a link and on a phone', () => {

	test( '?spot=moon-tycho opens the Moon\'s globe pinned at Tycho', async () => {

		const page = await newPage();
		try {

			await openGlobe( page, '/?spot=moon-tycho' );
			await page.waitForFunction( () => window.drive.world === 'moon' && window.drive.panel.pinned?.id === 'moon-tycho', null, { timeout: 60000 } );
			await flown( page );
			assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Tycho crater' );
			// Out of the address once used.
			assert.equal( new URL( page.url() ).search, '' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'a place on the Earth picked while the Moon is still loading stays on the Earth', async () => {

		const page = await newPage();
		try {

			// The Moon's heights held back until let go.
			let release;
			const held = new Promise( resolve => release = resolve );
			await page.route( `${ BASE }/moon/height.bin`, async route => {

				await held;
				route.continue();

			} );
			await openGlobe( page );
			await page.locator( '#globe-ui .worlds [data-world="moon"]' ).click();
			await page.waitForFunction( () => document.querySelector( '#globe-ui .worlds [data-world="moon"]' ).getAttribute( 'aria-busy' ) === 'true' );
			await page.locator( '#globe-ui .spots button', { hasText: 'Furka Pass' } ).click();
			release();
			await page.waitForFunction( () => window.drive.moon.ready, null, { timeout: 60000 } );
			await page.waitForTimeout( 500 );
			assert.deepEqual( await page.evaluate( () => ( {
				world: window.drive.world, pin: window.drive.panel.pinned?.id ?? null,
				busy: document.querySelector( '#globe-ui .worlds [data-world="moon"]' ).getAttribute( 'aria-busy' ),
				earth: document.querySelector( '#globe-ui .worlds [data-world="earth"]' ).getAttribute( 'aria-checked' ),
			} ) ), { world: 'earth', pin: 'furka', busy: null, earth: 'true' } );
			// And now it's loaded, Moon goes straight there.
			await toMoon( page );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'on a phone the switch is at the top of the sheet', async () => {

		const page = await newPage( { viewport: { width: 390, height: 760 }, touch: true } );
		try {

			await openGlobe( page );
			const sheet = await page.locator( '#globe-ui .panel' ).boundingBox();
			const worlds = await page.locator( '#globe-ui .worlds' ).boundingBox();
			assert.ok( worlds.y >= sheet.y && worlds.y < sheet.y + 40, JSON.stringify( { sheet, worlds } ) );
			await page.locator( '#globe-ui .worlds [data-world="moon"]' ).tap();
			await page.waitForFunction( () => window.drive.world === 'moon', null, { timeout: 60000 } );
			await flown( page );
			assert.deepEqual( await names( page ), MOON_SPOTS.map( spot => spot.name ) );
			await shot( page, 'moon-4-phone' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );
