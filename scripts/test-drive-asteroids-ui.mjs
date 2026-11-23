// npm run test:drive-asteroids-ui: World Drive's Vesta and Ceres (src/drive-app/worlds.js, level.js,
// body.js, main.js's moving recentre, docs/world-drive.md) in a real browser, on the Vite dev server
// with no Maps key, as test-drive-mars-ui.mjs has Mars: the five worlds' switch (fitting a phone),
// the globe turned to Vesta and to Ceres (each fetching only its own files), their spots and their
// own search (names, coordinates); a drop-in at a Vesta spot level with Vesta's level spheroid there
// (level.js: the scene's up its normal, not the sphere's), its gravity, a hop staying up about six
// times as long as the Earth's; the scene's frame following the car once it's driven more than
// WORLDS.vesta.recentre from its middle (the car, its heading and its speed carried, where it is on
// Vesta unbroken, and the frame level where it is again); M back to the globe and on to Ceres, a
// drop-in there, and back to the Earth as it was; and a challenge on Vesta driven across a recentre,
// its time posted with a ghost the Worker takes (ghostFault), and Retry after it putting the car
// back at the start. Every request that isn't to the local server is blocked.
//
// SwiftShader draws Vesta's ground at a frame or two a second, so the car is moved by setting the
// driver's fields (and the run driven at speed) rather than by holding keys where time matters.
//
// Needs Playwright with Chromium, as test-drive-ui.mjs does. TEST_VITE_PORT picks the port (5591);
// TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { VESTA_SPOTS } from '../src/drive-app/vesta-places.js';
import { CERES_SPOTS } from '../src/drive-app/ceres-places.js';
import { SPOTS } from '../src/drive-app/places.js';
import { WORLDS } from '../src/drive-app/worlds.js';
import { levelFrame, pointOn } from '../src/drive-app/level.js';
import { checkPasses, destination } from '../src/drive-app/challenge-rules.js';
import { ghostFault } from '../src/drive-app/ghost-rules.js';
import { startVite } from './worker-harness.mjs';
import { HOP, openWorlds, pickWorld, worldShown } from './worlds-ui.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5591;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const MARCIA = VESTA_SPOTS.find( spot => spot.id === 'vesta-snowman' );
const OCCATOR = CERES_SPOTS.find( spot => spot.id === 'ceres-occator' );
// Vesta's gravity as a share of the Earth's (0.25 m/s²), and what a hop's speed is multiplied by there.
const GRAVITY = 0.25 / 9.81;
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

// A page with everything off this machine blocked, the go-kart picked, and boost pads off.
// page.worlds: the other worlds' files asked for, in order.
async function newPage( { viewport = { width: 800, height: 500 }, touch = false } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( () => {

		if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', 'go-kart' );
		localStorage.setItem( 'world-drive.pads', 'off' );
		// Trick mode on (walls bounce the car off), as the stunt tests were written for; slide mode's own test turns it off.
		if ( ! localStorage.getItem( 'world-drive.tricks' ) ) localStorage.setItem( 'world-drive.tricks', 'on' );

	} );
	const page = await context.newPage();
	page.outside = [];
	page.errors = [];
	page.worlds = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	page.on( 'request', request => /^\/(moon|mars|vesta|ceres)\//.test( new URL( request.url() ).pathname ) && page.worlds.push( new URL( request.url() ).pathname ) );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => {

		page.outside.push( route.request().url() );
		route.abort();

	} );
	// Where the car is on the world (its pivot, from the body's own frame: lat, lon in degrees, height
	// over the sphere), the scene's up and the car's way forward in that frame, and the driver's state.
	await page.addInitScript( () => {

		window.carOnWorld = () => {

			const drive = window.drive;
			const V = drive.camera.position.constructor;
			const inverse = drive.body.group.matrixWorld.clone().invert();
			const at = new V();
			drive.entry.pivot.getWorldPosition( at ).applyMatrix4( inverse );
			const geo = drive.body.ellipsoid.getPositionToCartographic( at, {} );
			const d = drive.driver;
			const r = d.heading * Math.PI / 180;
			return {
				lat: geo.lat * 180 / Math.PI, lon: geo.lon * 180 / Math.PI, height: geo.height,
				up: new V( 0, 1, 0 ).transformDirection( inverse ).toArray(),
				forward: new V( - Math.sin( r ), 0, Math.cos( r ) ).transformDirection( inverse ).toArray(),
				east: d.east, north: d.north, speed: d.speed, heading: d.heading, recentres: drive.recentres,
			};

		};

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
const DEG = 180 / Math.PI;
// The angle (degrees) between two unit vectors.
const angle = ( a, b ) => Math.acos( Math.min( 1, a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ] ) ) * DEG;
// How far the scene's up is (degrees) from `world`'s level normal where the car is.
const offLevel = ( world, car ) => angle( car.up, levelFrame( world, car.lat, car.lon, car.height ).up );
// How far apart (m) two of carOnWorld's places are.
const apart = ( world, a, b ) => {

	const [ p, q ] = [ pointOn( world, a.lat, a.lon, a.height ), pointOn( world, b.lat, b.lon, b.height ) ];
	return Math.hypot( p[ 0 ] - q[ 0 ], p[ 1 ] - q[ 1 ], p[ 2 ] - q[ 2 ] );

};

async function toWorld( page, world ) {

	await pickWorld( page, world );
	await page.waitForFunction( id => window.drive.world === id, world, { timeout: 90000 } );
	await flown( page );

}

describe( 'World Drive on Vesta and Ceres', () => {

	let page;

	before( async () => {

		page = await newPage();

	} );

	after( () => page?.context().close() );

	test( 'five worlds in the orrery; the globe turns to Vesta: its spots and words, its own files fetched only now, its credit', async () => {

		await openGlobe( page );
		assert.deepEqual( page.worlds, [], 'nothing of the other worlds\' is fetched on the Earth' );
		await openWorlds( page );
		assert.deepEqual( await page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( buttons => buttons.map( b => b.dataset.world ) ), [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ] );
		assert.deepEqual( page.worlds, [], 'nothing of the other worlds\' is fetched by the orrery' );

		await toWorld( page, 'vesta' );
		assert.deepEqual( [ ...page.worlds ].sort(), [ '/vesta/colour.webp', '/vesta/height.bin' ], 'Vesta\'s files, and no other world\'s' );
		assert.equal( await worldShown( page ), 'vesta' );
		assert.equal( await page.evaluate( () => document.body.dataset.world ), 'vesta' );
		assert.deepEqual( await names( page ), VESTA_SPOTS.map( spot => spot.name ) );
		assert.equal( await page.locator( '#globe-ui .tagline' ).textContent(), 'Pick anywhere on Vesta. Drop in. Drive.' );
		assert.equal( await page.locator( '#globe-ui .search input' ).getAttribute( 'placeholder' ), 'A crater, a trough, or lat, lon' );
		await page.locator( '#vesta-credit' ).waitFor();
		assert.equal( await page.locator( '#vesta-credit' ).textContent(), WORLDS.vesta.credit );
		for ( const other of [ 'moon', 'mars', 'ceres' ] ) assert.equal( await page.locator( `#${ other }-credit` ).isVisible(), false, other );
		const globe = await page.evaluate( () => {

			const { globe, bodies: { vesta, mars, moon, ceres }, scene } = window.drive;
			return { body: globe.earth === vesta.group, surface: globe.surface === vesta.terrain, stars: scene.background === vesta.stars, drawn: vesta.stats().drawn > 0, others: [ moon, mars, ceres ].some( b => b?.group.visible ), earthShown: scene.getObjectByName( 'test-globe' ).visible, recentring: window.drive.recentring };

		} );
		// (No recentring off the drive: only while driving does the frame follow.)
		assert.deepEqual( globe, { body: true, surface: true, stars: true, drawn: true, others: false, earthShown: false, recentring: WORLDS.vesta.recentre }, JSON.stringify( globe ) );
		assert.deepEqual( page.outside, [] );
		await shot( page, 'vesta-1-globe' );

	} );

	test( 'Vesta\'s own search: names, what they are, coordinates on Vesta', async () => {

		const search = page.locator( '#globe-ui .search input' );
		const results = () => page.locator( '#globe-ui .results button b' ).allTextContents();
		await search.fill( 'rheasilvia' );
		await search.press( 'Enter' );
		assert.deepEqual( await results(), [ 'Rheasilvia\'s central peak', 'Rheasilvia' ] );
		await search.fill( 'snowman' );
		await search.press( 'Enter' );
		assert.deepEqual( await results(), [ 'Marcia' ] );
		await search.fill( 'highest' );
		await search.press( 'Enter' );
		assert.deepEqual( await results(), [ 'Rheasilvia\'s central peak' ] );
		await search.fill( 'fossae' );
		await search.press( 'Enter' );
		assert.deepEqual( await results(), [ 'Divalia Fossae', 'Saturnalia Fossae' ] );
		await search.fill( 'Gotham' );
		await search.press( 'Enter' );
		assert.match( await page.locator( '#globe-ui .search-status' ).textContent(), /Nothing found for "Gotham"\. Try a crater, a trough or a basin/ );

		// Coordinates are Vesta's: pinned there, deep in Rheasilvia.
		await search.fill( '-71.951, 86.303' );
		await search.press( 'Enter' );
		await flown( page );
		assert.equal( await page.locator( '.pin-card .coords' ).textContent(), 'Vesta coordinates · 71.9510° S, 86.3030° E' );
		const pin = await page.evaluate( () => window.drive.panel.pinned );
		assert.equal( pin.world, 'vesta' );
		// Rheasilvia's floor is tens of kilometres under Vesta's sphere.
		assert.ok( pin.height < - 15000 && pin.height > WORLDS.vesta.lowest, JSON.stringify( pin ) );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'dropped in at Marcia: level with Vesta\'s level there, on its ground, its gravity, no water', async () => {

		await page.locator( '#globe-ui .spots button', { hasText: MARCIA.name } ).click();
		await flown( page );
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Marcia' );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 240000 } );
		await page.waitForTimeout( 1500 );
		const here = await page.evaluate( () => {

			const { driver: d, ground, water, scene, bodies: { vesta }, place, origin, entry, recentres } = window.drive;
			const under = ground.heightAt( - d.east, d.north, d.y + 30, 60 );
			return {
				world: window.drive.world, place: place.world, name: entry.state.name, gravity: d.gravity, water: d.water, none: water.none,
				above: d.y - under, stars: scene.background === vesta.stars, origin, placeHeight: place.height, recentres,
				grounds: ground.getColliders().map( o => o.name ), car: window.carOnWorld(),
			};

		} );
		assert.ok( Math.abs( here.gravity - GRAVITY ) < 1e-6, JSON.stringify( here ) );
		assert.ok( Math.abs( here.gravity - 0.025 ) < 0.001 );
		assert.ok( Math.abs( here.above ) < 0.3, JSON.stringify( here ) );
		// The scene's frame at the spot, on the ground there, and its up Vesta's level normal (which
		// at 9° N leans from the sphere's by a few degrees).
		assert.deepEqual( [ here.origin.lat, here.origin.lon, here.origin.height ], [ MARCIA.lat, MARCIA.lon, here.placeHeight ] );
		assert.ok( Math.abs( here.car.lat - MARCIA.lat ) < 1e-3 && Math.abs( here.car.lon - MARCIA.lon ) < 1e-3, JSON.stringify( here.car ) );
		assert.ok( offLevel( 'vesta', here.car ) < 0.05, `${ offLevel( 'vesta', here.car ) }° off the level` );
		const radial = pointOn( 'vesta', here.car.lat, here.car.lon, 1 ).map( ( v, i ) => v - pointOn( 'vesta', here.car.lat, here.car.lon, 0 )[ i ] );
		assert.ok( angle( here.car.up, radial ) > 1, 'not the sphere\'s up' );
		assert.deepEqual( { world: here.world, place: here.place, name: here.name, water: here.water, none: here.none, stars: here.stars, recentres: here.recentres, grounds: here.grounds }, {
			world: 'vesta', place: 'vesta', name: 'Go-kart', water: null, none: true, stars: true, recentres: 0, grounds: [ 'vesta-terrain' ],
		} );
		assert.equal( await page.locator( '#attribution' ).isVisible(), false );
		assert.equal( await page.locator( '#vesta-credit' ).isVisible(), true );
		assert.equal( await page.locator( '#drive-ui .place' ).textContent(), 'Marcia' );
		await shot( page, 'vesta-2-driving' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'a hop goes as high as on the Earth and stays up about six times as long', async () => {

		const hop = await page.evaluate( () => {

			const { driver: d } = window.drive;
			for ( const code of [ ...d.keys ] ) d.release?.( code );
			d.keys.clear();
			Object.assign( d, { speed: 0, vy: 0, pitch: 0, roll: 0 } );
			for ( let i = 0; i < 30; i ++ ) d.update( 1 / 60 );
			const start = { y: d.y };
			d.hop();
			const speed = d.vy;
			let top = d.y;
			let i = 0;
			for ( ; i < 1800; i ++ ) {

				d.update( 1 / 60 );
				top = Math.max( top, d.y );
				if ( i > 10 && d.grounded && ! d.air ) break;

			}

			return { speed, high: top - start.y, time: i / 60, landed: d.grounded };

		} );
		// The Earth's hop (worlds-ui.mjs's HOP: 10 m/s, 5.1 m up, 2.04 s in the air), 10 √g here: as
		// high, and 1 / √g (6.3) times as long.
		assert.ok( Math.abs( hop.speed - HOP.speed * LEAP ) < 1e-6, JSON.stringify( hop ) );
		assert.ok( hop.high > HOP.high * 0.8 && hop.high < HOP.high * 1.2, JSON.stringify( hop ) );
		const times = hop.time / HOP.time;
		assert.ok( times > 5.5 && times < 7, `${ times.toFixed( 2 ) } times the Earth's: ${ JSON.stringify( hop ) }` );
		assert.ok( hop.landed, JSON.stringify( hop ) );

	} );

	test( 'driven past WORLDS.vesta.recentre from the scene\'s middle, the frame follows the car: nothing jumps, its heading and speed carried, level where it is again', async () => {

		const most = WORLDS.vesta.recentre;
		assert.equal( await page.evaluate( () => window.drive.recentring ), most );
		const before = await page.evaluate( () => window.drive.recentres );
		// Put a little short of it, facing north at 30 m/s, and driven on over it.
		const placed = await page.evaluate( z => {

			const { ground, moveCar, driver } = window.drive;
			const ok = moveCar( { local: { x: 0, y: ground.heightAt( 0, z ), z }, heading: 0 } );
			Object.assign( driver, { speed: 30, course: 0, view: 0 } );
			return { ok, recentres: window.drive.recentres };

		}, most - 15 );
		assert.deepEqual( placed, { ok: true, recentres: before } );
		const frames = await page.evaluate( () => new Promise( resolve => {

			const out = [ window.carOnWorld() ];
			let after = 0;
			const step = () => {

				out.push( window.carOnWorld() );
				if ( out.at( - 1 ).recentres > out[ 0 ].recentres ) after ++;
				if ( after >= 4 || out.length > 80 ) return resolve( out );
				requestAnimationFrame( step );

			};

			requestAnimationFrame( step );

		} ) );
		const at = frames.findIndex( car => car.recentres > before );
		assert.ok( at > 0, `no recentre: ${ JSON.stringify( frames.at( - 1 ) ) }` );
		assert.equal( frames.at( - 1 ).recentres, before + 1, 'once' );
		const [ last, next ] = [ frames[ at - 1 ], frames[ at ] ];
		// Before it the car was past the distance or nearly (the frame follows at the top of the
		// frame); after, by the scene's new middle.
		assert.ok( Math.hypot( last.east, last.north ) > most - 5, JSON.stringify( last ) );
		assert.ok( Math.hypot( next.east, next.north ) < 6, JSON.stringify( next ) );
		// Where it is on Vesta unbroken: no further than a frame's driving, no jump up or down.
		assert.ok( apart( 'vesta', last, next ) < 5, `${ apart( 'vesta', last, next ) } m: ${ JSON.stringify( [ last, next ] ) }` );
		assert.ok( Math.abs( next.height - last.height ) < 1, JSON.stringify( [ last, next ] ) );
		// Its way forward on Vesta the same, and its speed.
		assert.ok( angle( last.forward, next.forward ) < 1, `${ angle( last.forward, next.forward ) }° turned` );
		assert.ok( Math.abs( next.speed - last.speed ) < 1.5 && next.speed > 15, JSON.stringify( [ last, next ] ) );
		// The scene's up within a fraction of a degree of the level normal at the car all along, and
		// all but on it again after.
		for ( const car of frames ) assert.ok( offLevel( 'vesta', car ) < 0.5, `${ offLevel( 'vesta', car ) }°` );
		assert.ok( offLevel( 'vesta', next ) < 0.05, `${ offLevel( 'vesta', next ) }°` );
		const origin = await page.evaluate( () => window.drive.origin );
		assert.ok( apart( 'vesta', { ...origin, height: 0 }, { ...next, height: 0 } ) < 6, JSON.stringify( { origin, next } ) );
		assert.equal( await page.evaluate( () => window.drive.mode ), 'driving' );
		await shot( page, 'vesta-3-recentred' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'M goes back to Vesta\'s globe (its recent places its own); on to Ceres, its files only; a drop-in at Occator, level there; then the Earth as it was', async () => {

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe', null, { timeout: 30000 } );
		await flown( page );
		assert.equal( await page.evaluate( () => window.drive.world ), 'vesta' );
		assert.deepEqual( await page.locator( '#globe-ui .recent button b' ).allTextContents(), [ 'Marcia' ] );
		assert.deepEqual( await page.evaluate( () => [ localStorage.getItem( 'world-drive.recent' ), localStorage.getItem( 'world-drive.recent-mars' ), JSON.parse( localStorage.getItem( 'world-drive.recent-vesta' ) ).map( place => place.name ) ] ), [ null, null, [ 'Marcia' ] ] );
		await shot( page, 'vesta-4-back' );

		const fetched = page.worlds.length;
		await toWorld( page, 'ceres' );
		assert.deepEqual( page.worlds.slice( fetched ).sort(), [ '/ceres/colour.webp', '/ceres/height.bin' ], 'Ceres\'s files, and no other world\'s' );
		assert.deepEqual( await names( page ), CERES_SPOTS.map( spot => spot.name ) );
		assert.equal( await page.locator( '#globe-ui .tagline' ).textContent(), 'Pick anywhere on Ceres. Drop in. Drive.' );
		await page.locator( '#ceres-credit' ).waitFor();
		assert.equal( await page.locator( '#vesta-credit' ).isVisible(), false );
		assert.deepEqual( await page.evaluate( () => {

			const { bodies: { vesta, ceres }, globe } = window.drive;
			return { vesta: vesta.group.visible, ceres: ceres.group.visible, body: globe.earth === ceres.group };

		} ), { vesta: false, ceres: true, body: true } );
		const search = page.locator( '#globe-ui .search input' );
		await search.fill( 'ice volcano' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Ahuna Mons' ] );

		await page.locator( '#globe-ui .spots button', { hasText: OCCATOR.name } ).click();
		await flown( page );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 240000 } );
		await page.waitForTimeout( 1500 );
		const here = await page.evaluate( () => {

			const { driver: d, ground, scene, bodies: { ceres }, origin, recentring } = window.drive;
			return { world: window.drive.world, gravity: d.gravity, above: d.y - ground.heightAt( - d.east, d.north, d.y + 30, 60 ), stars: scene.background === ceres.stars, origin, recentring, grounds: ground.getColliders().map( o => o.name ), car: window.carOnWorld() };

		} );
		assert.ok( Math.abs( here.gravity - 0.284 / 9.81 ) < 1e-6, JSON.stringify( here ) );
		assert.ok( Math.abs( here.above ) < 0.3, JSON.stringify( here ) );
		assert.ok( offLevel( 'ceres', here.car ) < 0.05, `${ offLevel( 'ceres', here.car ) }° off the level` );
		assert.deepEqual( { world: here.world, stars: here.stars, lat: here.origin.lat, lon: here.origin.lon, recentring: here.recentring, grounds: here.grounds }, { world: 'ceres', stars: true, lat: OCCATOR.lat, lon: OCCATOR.lon, recentring: WORLDS.ceres.recentre, grounds: [ 'ceres-terrain' ] } );
		assert.equal( await page.locator( '#ceres-credit' ).isVisible(), true );
		await shot( page, 'ceres-1-driving' );

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe', null, { timeout: 30000 } );
		await flown( page );
		await toWorld( page, 'earth' );
		assert.deepEqual( await page.evaluate( () => {

			const { globe, bodies, scene } = window.drive;
			return { body: globe.earth === scene.getObjectByName( 'test-globe' ), others: Object.values( bodies ).some( body => body.group.visible ), world: document.body.dataset.world, recentring: window.drive.recentring };

		} ), { body: true, others: false, world: 'earth', recentring: null } );
		assert.deepEqual( await names( page ), SPOTS.map( spot => spot.name ) );
		await page.evaluate( () => window.drive.dropIn( { name: 'Test pad', lat: 46.5725, lon: 8.4153 } ) );
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		const recentres = await page.evaluate( () => window.drive.recentres );
		// Driven far from the middle on the Earth, the frame stays where it was dropped in.
		assert.deepEqual( await page.evaluate( () => {

			const { driver: d, water } = window.drive;
			return { gravity: d.gravity, water: d.water === water, recentring: window.drive.recentring, shift: window.drive.shiftTo( { lat: 46.58, lon: 8.42, height: 0 } ) };

		} ), { gravity: 1, water: true, recentring: null, shift: null } );
		assert.equal( await page.evaluate( () => window.drive.recentres ), recentres );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

} );

describe( 'World Drive\'s five worlds on a phone and from the keyboard', () => {

	test( 'on a phone the five worlds fit in one row of the orrery; Vesta tapped', async () => {

		const page = await newPage( { viewport: { width: 360, height: 740 }, touch: true } );
		try {

			await openGlobe( page );
			await openWorlds( page, { tap: true } );
			const boxes = await page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( buttons => buttons.map( b => {

				const box = b.getBoundingClientRect();
				return { left: box.left, right: box.right, top: box.top, height: box.height, fits: b.scrollWidth <= b.clientWidth };

			} ) );
			assert.equal( boxes.length, 5 );
			assert.ok( boxes.every( box => box.left >= 0 && box.right <= 360 && box.height >= 44 && box.fits && Math.abs( box.top - boxes[ 0 ].top ) < 1 ), JSON.stringify( boxes ) );
			assert.equal( await page.evaluate( () => document.documentElement.scrollWidth <= innerWidth ), true, 'no sideways scroll' );
			await pickWorld( page, 'vesta', { tap: true } );
			await page.waitForFunction( () => window.drive.world === 'vesta', null, { timeout: 90000 } );
			await flown( page );
			assert.deepEqual( await names( page ), VESTA_SPOTS.map( spot => spot.name ) );
			await shot( page, 'vesta-5-phone' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'the orrery\'s arrow keys: left from the Earth round to Ceres, Enter drives there; ?spot=ceres-ahuna-mons opens Ceres pinned there', async () => {

		const page = await newPage();
		try {

			await openGlobe( page );
			await openWorlds( page );
			const tabs = () => page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( buttons => buttons.map( b => b.tabIndex ) );
			assert.deepEqual( await tabs(), [ 0, - 1, - 1, - 1, - 1 ] );
			assert.equal( await page.evaluate( () => document.activeElement.dataset.world ), 'earth' );
			await page.keyboard.press( 'ArrowLeft' );
			assert.equal( await page.evaluate( () => document.activeElement.dataset.world ), 'ceres' );
			assert.deepEqual( await tabs(), [ - 1, - 1, - 1, - 1, 0 ] );
			await page.keyboard.press( 'Enter' );
			await page.waitForFunction( () => window.drive.world === 'ceres', null, { timeout: 90000 } );

			await openGlobe( page, '/?spot=ceres-ahuna-mons' );
			await page.waitForFunction( () => window.drive.world === 'ceres' && window.drive.panel.pinned?.id === 'ceres-ahuna-mons', null, { timeout: 90000 } );
			assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Ahuna Mons' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

// A challenge on Vesta (src/drive-app/challenges.js), with the Worker's answers made here: a sprint
// from Marcia to a gate further north than the scene's frame lets the car go before it follows, so
// the run is driven across a recentre (its gates, start and recording moved with the scene); its
// time posted with a ghost the Worker takes (ghostFault: the ghost's frame is Vesta's level frame at
// the start, whatever the scene did); then Retry, the scene moved back to the start (app.shiftTo)
// and the car put down there.
describe( 'World Drive challenges on Vesta', () => {

	const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
	const VESTA_VISIT = 'v1.vesta-link-visit';
	const PLAYER = { id: 'vestaChallenge01', secret: 'r'.repeat( 32 ), name: 'Vesta Racer' };
	const FAR = 1150;
	const [ gateLat, gateLon ] = destination( 'vesta', MARCIA.lat, MARCIA.lon, 0, FAR );
	const CHALLENGE = { id: 44, period: 'day', key: 'day:2026-11-18', world: 'vesta', kind: 'sprint', place: 'Marcia', region: MARCIA.region, route: { start: { lat: MARCIA.lat, lon: MARCIA.lon, heading: 0 }, points: [ [ Math.round( gateLat * 1e6 ) / 1e6, Math.round( gateLon * 1e6 ) / 1e6 ] ], radius: 40 }, total: 0, top: [], me: null };
	const listed = () => [ { ...CHALLENGE, startsAt: Date.now() - 3600e3, endsAt: Date.now() + 3600e3 } ];

	test( 'a sprint on Vesta driven across a recentre: its time posted with a ghost the Worker takes; Retry puts the car back at the start', async () => {

		assert.ok( FAR > WORLDS.vesta.recentre );
		const page = await newPage();
		try {

			page.posted = [];
			await page.addInitScript( player => localStorage.setItem( 'world-drive.player', JSON.stringify( player ) ), PLAYER );
			const json = ( route, body, status = 200 ) => route.fulfill( { status, contentType: 'application/json', body: JSON.stringify( body ) } );
			await page.route( 'https://challenges.cloudflare.com/turnstile/**', route => route.fulfill( { contentType: 'text/javascript', body: `window.turnstile = { render( el, options ) { setTimeout( () => options.callback( '${ TOKEN }' ), 50 ); return 'w1'; }, remove() {}, reset() {} };` } ) );
			await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true } ) );
			await page.route( `${ BASE }/api/visit`, route => json( route, { moon: true, free: true, world: 'vesta', visit: VESTA_VISIT } ) );
			await page.route( `${ BASE }/api/challenges?*`, route => json( route, { now: Date.now(), challenges: listed() } ) );
			await page.route( `${ BASE }/api/challenges/time`, route => {

				const body = JSON.parse( route.request().postData() );
				page.posted.push( body );
				json( route, { ms: body.ms, rank: 1, total: 1, isNewBest: true, top: [ { rank: 1, name: PLAYER.name, ms: body.ms, vehicle: 'go-kart', date: '2026-11-18', level: 1, title: 'rookie' } ] } );

			} );
			await page.goto( `${ BASE }/?spot=vesta-snowman` );
			await page.waitForFunction( () => window.drive?.mode === 'globe' && window.drive.world === 'vesta' && window.drive.panel.pinned?.id === 'vesta-snowman', null, { timeout: 90000 } );
			await page.locator( '#globe-ui .challenges-open' ).click();
			const dialog = page.locator( '#challenges' );
			await dialog.locator( '.ch-card[data-id="44"]' ).waitFor();
			await dialog.locator( '.ch-card[data-id="44"] .ch-start' ).click();
			await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 240000 } );
			assert.deepEqual( await page.evaluate( () => [ window.drive.world, window.drive.place.challenge, window.drive.recentres ] ), [ 'vesta', 44, 0 ] );
			const gate = await page.evaluate( () => {

				const [ g ] = window.drive.challenges.run.gates;
				return { north: g.z, east: - g.x };

			} );
			// North of the start, past where the frame follows (Vesta's level frame leans, so not exactly FAR).
			assert.ok( gate.north > WORLDS.vesta.recentre + 50 && Math.abs( gate.east ) < 5, JSON.stringify( gate ) );
			await page.waitForFunction( () => window.drive.challenges.run?.phase === 'racing', null, { timeout: 240000 } );
			// Driven through it at 100 m/s, steering at it (the gate as it is in the scene each frame).
			const driven = await page.evaluate( () => new Promise( resolve => {

				const step = () => {

					const { run } = window.drive.challenges;
					const d = window.drive.driver;
					if ( ! run || run.phase === 'done' ) return resolve( { ms: run?.ms ?? null, recentres: window.drive.recentres } );
					const [ g ] = run.gates;
					const heading = Math.atan2( - g.x - d.east, g.z - d.north ) * 180 / Math.PI;
					Object.assign( d, { heading, course: heading, view: heading, speed: 100 } );
					requestAnimationFrame( step );

				};

				step();

			} ) );
			assert.ok( driven.recentres >= 1, JSON.stringify( driven ) );
			await page.locator( '.ch-finish' ).waitFor();
			await page.waitForFunction( () => /^#\d/.test( document.querySelector( '.ch-f-note' ).textContent ), null, { timeout: 30000 } );
			assert.equal( page.posted.length, 1 );
			const [ posted ] = page.posted;
			assert.deepEqual( [ posted.challenge, posted.visit, posted.id, posted.ms ], [ 44, VESTA_VISIT, PLAYER.id, driven.ms ] );
			assert.ok( checkPasses( CHALLENGE, posted.ms, posted.passes ) );
			// Its ghost as the Worker checks it, in Vesta's level frame at the start, across the recentre.
			assert.ok( posted.ghost, 'a ghost posted' );
			assert.equal( ghostFault( CHALLENGE, posted.ms, posted.passes, posted.ghost ), '' );
			await shot( page, 'challenges-vesta-1-finish' );

			// Retry: the scene moved back to the start, the car put down there, the gate where it was.
			const was = await page.evaluate( () => window.drive.recentres );
			await page.locator( '.ch-retry' ).click();
			await page.waitForFunction( () => [ 'countdown', 'racing' ].includes( window.drive.challenges.run?.phase ), null, { timeout: 60000 } );
			const back = await page.evaluate( () => {

				const { driver: d, origin, recentres, challenges: { run } } = window.drive;
				return { origin, recentres, east: d.east, north: d.north, heading: d.heading, start: run.start, gate: { north: run.gates[ 0 ].z, east: - run.gates[ 0 ].x, passed: run.gates[ 0 ].passed }, car: window.carOnWorld() };

			} );
			assert.equal( back.recentres, was + 1, JSON.stringify( back ) );
			assert.deepEqual( [ back.origin.lat, back.origin.lon ], [ MARCIA.lat, MARCIA.lon ] );
			assert.ok( Math.hypot( back.east, back.north ) < 1 && Math.hypot( back.start.east, back.start.north ) < 1, JSON.stringify( back ) );
			assert.ok( Math.abs( back.car.lat - MARCIA.lat ) < 1e-3 && Math.abs( back.car.lon - MARCIA.lon ) < 1e-3, JSON.stringify( back.car ) );
			assert.ok( Math.abs( back.gate.north - gate.north ) < 1 && Math.abs( back.gate.east - gate.east ) < 1 && ! back.gate.passed, JSON.stringify( back.gate ) );
			assert.ok( offLevel( 'vesta', back.car ) < 0.05 );
			await shot( page, 'challenges-vesta-2-retry' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );
