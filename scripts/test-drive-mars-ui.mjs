// npm run test:drive-mars-ui: World Drive's Mars (src/drive-app/body.js, worlds.js, docs/world-drive.md,
// "Mars") in a real browser, on the Vite dev server with no Maps key. Mars needs none, so it's the
// real Mars here, as the Moon is in test-drive-moon-ui.mjs: the globe turned to it (its files fetched
// only then, its thin glow from space), its spots, its own search and its recent places kept apart;
// a drop-in at Curiosity's landing in Gale crater, on its ground, with its gravity, its dusty sky
// and Phobos in it, and no water; a hop as high as on the Earth that stays up about one and a half
// times as long and isn't scored as big air; the drop-in's place counted for the play stats as its
// cell of Mars's grid; M back to its globe (its ground let go of but the coarsest when it's left),
// and back to the Earth; the switch's arrow keys; links to a Mars spot and to a pin on Mars; and a
// Mars challenge from a link with no Earth drive spent: on Mars at once, its gate on Mars's own
// ground, driven through and posted. Every request that isn't to the local server is blocked.
//
// The tests drive the go-kart (drawn in code), on a small window: Mars's ground is as heavy to draw
// as the Moon's without a GPU, about a frame a second.
//
// Needs Playwright with Chromium, as test-drive-ui.mjs does. TEST_VITE_PORT picks the port;
// TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { MARS_SPOTS } from '../src/drive-app/mars-places.js';
import { SPOTS } from '../src/drive-app/places.js';
import { cellOf } from '../src/drive-app/dropin-cells.js';
import { checkPasses, destination } from '../src/drive-app/challenge-rules.js';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5581;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const CURIOSITY = MARS_SPOTS.find( spot => spot.id === 'mars-curiosity' );
// Mars's gravity as a share of the Earth's (3.71 m/s²), and what a hop's speed is multiplied by there.
const GRAVITY = 3.71 / 9.81;
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
// pads off (they'd only slow the drawing). worlds: the other worlds' files asked for, in order.
async function newPage( { viewport = { width: 800, height: 500 }, touch = false } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( () => {

		if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', 'go-kart' );
		localStorage.setItem( 'world-drive.pads', 'off' );

	} );
	const page = await context.newPage();
	page.outside = [];
	page.errors = [];
	page.worlds = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	page.on( 'request', request => /^\/(moon|mars)\//.test( new URL( request.url() ).pathname ) && page.worlds.push( new URL( request.url() ).pathname ) );
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

async function toMars( page ) {

	await page.locator( '#globe-ui .worlds [data-world="mars"]' ).click();
	await page.waitForFunction( () => window.drive.world === 'mars', null, { timeout: 90000 } );
	await flown( page );

}

describe( 'World Drive on Mars', () => {

	let page;

	before( async () => {

		page = await newPage();
		// The play stats counted (with a visit made up for them, as test-drive-ui.mjs's are), their
		// posts kept in page.posts.
		page.posts = [];
		await page.addInitScript( () => {

			window.worldDriveStatsTest = { visit: 'v1.mars-stats-test' };

		} );
		await page.route( `${ BASE }/api/stats`, route => {

			page.posts.push( JSON.parse( route.request().postData() ) );
			route.fulfill( { status: 204 } );

		} );

	} );

	after( () => page?.context().close() );

	test( 'the globe turns to Mars: its spots and words, its files fetched only now, its thin glow from space', async () => {

		await openGlobe( page );
		assert.deepEqual( page.worlds, [], 'nothing of the other worlds\' is fetched on the Earth' );
		assert.equal( await page.locator( '#globe-ui .worlds button' ).count(), 3 );
		assert.deepEqual( await page.locator( '#globe-ui .worlds button' ).evaluateAll( buttons => buttons.map( b => b.dataset.world ) ), [ 'earth', 'moon', 'mars' ] );

		await toMars( page );
		assert.deepEqual( page.worlds.sort(), [ '/mars/colour.webp', '/mars/height.bin' ], 'Mars\'s files, and none of the Moon\'s' );
		assert.equal( await page.locator( '#globe-ui .worlds [data-world="mars"]' ).getAttribute( 'aria-checked' ), 'true' );
		assert.equal( await page.evaluate( () => document.body.dataset.world ), 'mars' );
		assert.deepEqual( await names( page ), MARS_SPOTS.map( spot => spot.name ) );
		assert.equal( await page.locator( '#globe-ui .tagline' ).textContent(), 'Pick anywhere on Mars. Drop in. Drive.' );
		assert.equal( await page.locator( '#globe-ui .search input' ).getAttribute( 'placeholder' ), 'A volcano, a crater, or lat, lon' );
		// No map search's credit, and NASA's for Mars's maps (not the Moon's).
		assert.equal( await page.locator( '#globe-ui .osm' ).isVisible(), false );
		await page.locator( '#mars-credit' ).waitFor();
		assert.equal( await page.locator( '#moon-credit' ).isVisible(), false );
		const globe = await page.evaluate( () => {

			const { globe, bodies: { mars, moon }, scene } = window.drive;
			return { body: globe.earth === mars.group, surface: globe.surface === mars.terrain, air: globe.air.visible, stars: scene.background === mars.stars, drawn: mars.stats().drawn, moon: moon.group.visible, earthShown: scene.getObjectByName( 'test-globe' ).visible, altitude: globe.altitude(), sky: mars.sky.visible, phobos: mars.inSky.visible };

		} );
		// From space: a thin glow round it (it has air, the Moon none), the stars, no sky and no Phobos.
		assert.deepEqual( { ...globe, drawn: globe.drawn > 0, altitude: globe.altitude > 2e6 && globe.altitude < 1e7 }, { body: true, surface: true, air: true, stars: true, drawn: true, moon: false, earthShown: false, altitude: true, sky: false, phobos: false }, JSON.stringify( globe ) );
		assert.deepEqual( page.outside, [] );
		await shot( page, 'mars-1-globe' );

	} );

	test( 'its own search: names, missions, coordinates, and nothing asked of anyone', async () => {

		const search = page.locator( '#globe-ui .search input' );
		await search.fill( 'olympus' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Olympus Mons', 'Olympus Mons summit' ] );
		// The lowest place, by what it is.
		await search.fill( 'lowest' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Badwater crater' ] );
		// Landing sites by their missions.
		await search.fill( 'Curiosity' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Bradbury Landing' ] );
		await search.fill( 'perseverance' );
		await search.press( 'Enter' );
		assert.deepEqual( await page.locator( '#globe-ui .results button b' ).allTextContents(), [ 'Jezero crater' ] );
		await search.fill( 'Gotham' );
		await search.press( 'Enter' );
		assert.match( await page.locator( '#globe-ui .search-status' ).textContent(), /Nothing found for "Gotham"\. Try a volcano/ );

		// Coordinates are Mars's: pinned there.
		await search.fill( '-4.5895, 137.4417' );
		await search.press( 'Enter' );
		await flown( page );
		assert.equal( await page.locator( '.pin-card .coords' ).textContent(), 'Mars coordinates · 4.5895° S, 137.4417° E' );
		const pin = await page.evaluate( () => window.drive.panel.pinned );
		assert.equal( pin.world, 'mars' );
		// Its height, worked out rather than looked for: Gale's floor, about 4.5 km under the areoid.
		assert.ok( pin.height < - 4000 && pin.height > - 5000, JSON.stringify( pin ) );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'dropped in at Bradbury Landing: on its ground, its gravity, its dusty sky and Phobos in it, no water', async () => {

		await page.locator( '#globe-ui .spots button', { hasText: CURIOSITY.name } ).click();
		await flown( page );
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Bradbury Landing' );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 180000 } );
		// (A frame or two for the sky and what hangs in it to be placed.)
		await page.waitForTimeout( 1500 );
		const here = await page.evaluate( () => {

			const { driver: d, ground, water, sea, scene, bodies: { mars }, place, pads, globe, entry } = window.drive;
			const under = ground.heightAt( - d.east, d.north, d.y + 30, 60 );
			return {
				world: window.drive.world, place: place.world, name: entry.state.name,
				gravity: d.gravity, water: d.water, none: water.none, dry: water.look( d.east, d.north, d.y ), sea: sea.shown,
				above: d.y - under, stars: scene.background === mars.stars, sky: mars.sky.visible, phobos: mars.inSky.visible, rules: pads.rules.tilt,
				haze: mars.material.uniforms.haze.value.w, dust: d.dust,
				// The ground is Mars's, as fine as it goes by the vehicle (a point every 1.3 m: 17 splits).
				grounds: ground.getColliders().map( o => o.name ), body: globe.earth === mars.group, levels: Math.max( ...Object.keys( mars.stats().levels ).map( Number ) ),
			};

		} );
		assert.ok( Math.abs( here.gravity - GRAVITY ) < 1e-6, JSON.stringify( here ) );
		assert.ok( Math.abs( here.above ) < 0.3, JSON.stringify( here ) );
		assert.ok( here.haze > 0.99, JSON.stringify( here ) );
		assert.deepEqual( { ...here, gravity: 0, above: 0, haze: 0 }, {
			world: 'mars', place: 'mars', name: 'Go-kart', gravity: 0, water: null, none: true, dry: { level: null, dry: true }, sea: false,
			above: 0, stars: true, sky: true, phobos: true, rules: 0.9, haze: 0, dust: 0xb87a55,
			grounds: [ 'mars-terrain' ], body: true, levels: 17,
		} );
		// Phobos can't be seen from near either pole (it's always under the horizon past 69°).
		assert.equal( await page.evaluate( () => {

			const { bodies: { mars }, camera } = window.drive;
			mars.placeInSky( camera, camera.far * 0.6, 80 );
			const seen = mars.inSky.visible;
			mars.placeInSky( camera, camera.far * 0.6, window.drive.place.lat );
			return seen;

		} ), false );
		// NASA's credit, not Google's.
		assert.equal( await page.locator( '#attribution' ).isVisible(), false );
		assert.equal( await page.locator( '#mars-credit' ).isVisible(), true );
		assert.equal( await page.locator( '#drive-ui .place' ).textContent(), 'Bradbury Landing' );
		// Where, for the owner's map of where people drop in: posted with the drop-in as its cell of
		// Mars's grid, never where in it.
		await page.evaluate( () => window.drive.stats.post() );
		const posted = page.posts.find( post => post.places );
		assert.deepEqual( posted?.places, [ cellOf( 'mars', CURIOSITY.lat, CURIOSITY.lon ) ], JSON.stringify( page.posts ) );
		assert.equal( posted.counts[ 'dropin:mars' ], 1 );
		assert.equal( posted.counts[ 'world:mars' ], 1 );
		assert.doesNotMatch( JSON.stringify( page.posts ), /4\.589|137\.44/ );

		await page.keyboard.down( 'KeyW' );
		await page.waitForFunction( () => window.drive.driver.speed > 4, null, { timeout: 120000 } );
		await page.keyboard.up( 'KeyW' );
		assert.ok( await page.evaluate( () => window.drive.driver.grounded ) );
		await shot( page, 'mars-2-driving' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'a hop goes as high as on the Earth and stays up about one and a half times as long, and isn\'t big air', async () => {

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

			return { speed, high: top - start.y, time: i / 60, landed: d.grounded, scored: d.score - start.score };

		} );
		// 7 m/s on the Earth: 2.5 m up and 1.43 s in the air; on Mars as high, and 1.43 / 0.615 s.
		assert.ok( Math.abs( hop.speed - 7 * LEAP ) < 1e-6, JSON.stringify( hop ) );
		assert.ok( hop.high > 2 && hop.high < 3, JSON.stringify( hop ) );
		assert.ok( hop.time > 2 && hop.time < 2.8, JSON.stringify( hop ) );
		// As long in Earth time as the Earth's hop, under big air's 1.5 s: nothing scored.
		assert.deepEqual( [ hop.landed, hop.scored ], [ true, 0 ], JSON.stringify( hop ) );

	} );

	test( 'M goes back to Mars\'s globe, its recent places its own; the Moon, its ground let go of; then back to the Earth', async () => {

		await page.keyboard.press( 'KeyM' );
		await page.waitForFunction( () => window.drive.mode === 'globe', null, { timeout: 30000 } );
		await flown( page );
		assert.equal( await page.evaluate( () => window.drive.world ), 'mars' );
		assert.deepEqual( await page.locator( '#globe-ui .recent button b' ).allTextContents(), [ 'Bradbury Landing' ] );
		assert.deepEqual( await page.evaluate( () => [ localStorage.getItem( 'world-drive.recent' ), localStorage.getItem( 'world-drive.recent-moon' ), JSON.parse( localStorage.getItem( 'world-drive.recent-mars' ) ).map( place => place.name ) ] ), [ null, null, [ 'Bradbury Landing' ] ], 'the Earth\'s and the Moon\'s recent places are untouched' );
		// From space again: no sky over it and no Phobos.
		assert.deepEqual( await page.evaluate( () => [ window.drive.bodies.mars.sky.visible, window.drive.bodies.mars.inSky.visible ] ), [ false, false ] );
		await shot( page, 'mars-3-back' );

		// To the Moon: Mars lets go of all but its six coarsest squares.
		await page.locator( '#globe-ui .worlds [data-world="moon"]' ).click();
		await page.waitForFunction( () => window.drive.world === 'moon', null, { timeout: 90000 } );
		await flown( page );
		assert.deepEqual( await page.evaluate( () => {

			const { bodies: { mars, moon }, globe } = window.drive;
			return { mars: mars.group.visible, drawn: mars.stats().drawn, built: mars.stats().built, moon: moon.group.visible, body: globe.earth === moon.group };

		} ), { mars: false, drawn: 0, built: 6, moon: true, body: true } );

		await page.locator( '#globe-ui .worlds [data-world="earth"]' ).click();
		await page.waitForFunction( () => window.drive.world === 'earth', null, { timeout: 30000 } );
		await flown( page );
		const earth = await page.evaluate( () => {

			const { globe, bodies, scene } = window.drive;
			return { body: globe.earth === scene.getObjectByName( 'test-globe' ), others: Object.values( bodies ).some( body => body.group.visible ), shown: scene.getObjectByName( 'test-globe' ).visible, world: document.body.dataset.world };

		} );
		assert.deepEqual( earth, { body: true, others: false, shown: true, world: 'earth' } );
		assert.deepEqual( await names( page ), SPOTS.map( spot => spot.name ) );
		assert.equal( await page.locator( '#mars-credit' ).isVisible(), false );

		// And driving on the Earth is as it was: its gravity, its water, its dust.
		await page.evaluate( () => window.drive.dropIn( { name: 'Test pad', lat: 46.5725, lon: 8.4153 } ) );
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		assert.deepEqual( await page.evaluate( () => {

			const { driver: d, water, pads, ground } = window.drive;
			return { gravity: d.gravity, water: d.water === water, none: water.none, rules: pads.rules.tilt, grounds: ground.getColliders().length, dust: d.dust };

		} ), { gravity: 1, water: true, none: false, rules: 0.96, grounds: 1, dust: null } );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

} );

describe( 'World Drive\'s Mars, by a link and from the keyboard', () => {

	test( '?spot=mars-olympus-mons opens Mars\'s globe pinned on Olympus Mons; ?at= with world=mars pins a spot there', async () => {

		const page = await newPage();
		try {

			await openGlobe( page, '/?spot=mars-olympus-mons' );
			await page.waitForFunction( () => window.drive.world === 'mars' && window.drive.panel.pinned?.id === 'mars-olympus-mons', null, { timeout: 90000 } );
			await flown( page );
			assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Olympus Mons' );
			// Out of the address once used.
			assert.equal( new URL( page.url() ).search, '' );
			// Its summit worked out: some 20 km over the areoid.
			assert.ok( await page.evaluate( () => window.drive.panel.pinned.height ) > 18000 );

			await openGlobe( page, '/?at=-14.5684,175.4726&world=mars&name=Gusev' );
			await page.waitForFunction( () => window.drive.world === 'mars' && window.drive.panel.pinned?.name === 'Gusev', null, { timeout: 90000 } );
			assert.equal( await page.evaluate( () => window.drive.panel.pinned.world ), 'mars' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'the switch: the arrow keys move along the worlds and pick one, and only the one picked is in the tab order', async () => {

		const page = await newPage();
		try {

			await openGlobe( page );
			const tabs = () => page.locator( '#globe-ui .worlds button' ).evaluateAll( buttons => buttons.map( b => b.tabIndex ) );
			assert.deepEqual( await tabs(), [ 0, - 1, - 1 ] );
			await page.locator( '#globe-ui .worlds [data-world="earth"]' ).focus();
			// Left from the Earth, round to Mars.
			await page.keyboard.press( 'ArrowLeft' );
			await page.waitForFunction( () => window.drive.world === 'mars', null, { timeout: 90000 } );
			assert.equal( await page.evaluate( () => document.activeElement.dataset.world ), 'mars' );
			assert.deepEqual( await tabs(), [ - 1, - 1, 0 ] );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'on a phone the three worlds fit across the top of the sheet', async () => {

		const page = await newPage( { viewport: { width: 360, height: 740 }, touch: true } );
		try {

			await openGlobe( page );
			const sheet = await page.locator( '#globe-ui .panel' ).boundingBox();
			const boxes = await page.locator( '#globe-ui .worlds button' ).evaluateAll( buttons => buttons.map( b => {

				const box = b.getBoundingClientRect();
				return { left: box.left, right: box.right, top: box.top, fits: b.scrollWidth <= b.clientWidth };

			} ) );
			assert.ok( boxes.every( box => box.left >= sheet.x && box.right <= sheet.x + sheet.width && box.fits && Math.abs( box.top - boxes[ 0 ].top ) < 1 ), JSON.stringify( { sheet, boxes } ) );
			await page.locator( '#globe-ui .worlds [data-world="mars"]' ).tap();
			await page.waitForFunction( () => window.drive.world === 'mars', null, { timeout: 90000 } );
			await flown( page );
			assert.deepEqual( await names( page ), MARS_SPOTS.map( spot => spot.name ) );
			await shot( page, 'mars-4-phone' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

// A challenge on Mars (src/drive-app/challenges.js), with the Worker's answers made here: a link to
// a Mars spot asks for a free visit (world: 'mars': no Earth drive spent, no Maps key), and the game
// opens on Mars with the Earth closed; the list with Mars's first, under "On Mars", the Earth's
// needing an Earth drive; a Mars challenge's drop-in at its start, its gate on Mars's own heights
// (as the ground built there has them), driven through, and its time posted with that visit.
describe( 'World Drive challenges on Mars', () => {

	const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
	const MARS_VISIT = 'v1.mars-link-visit';
	const PLAYER = { id: 'marsChallenge001', secret: 'r'.repeat( 32 ), name: 'Mars Racer' };
	const listed = () => CHALLENGES.map( c => ( { ...c, startsAt: Date.now() + c.startsAt, endsAt: Date.now() + c.endsAt } ) );
	const [ gateLat, gateLon ] = destination( 'mars', CURIOSITY.lat, CURIOSITY.lon, 0, 130 );
	const CHALLENGES = [
		{ id: 31, period: 'day', key: 'day:2026-11-18', world: 'earth', kind: 'sprint', place: 'Times Square', region: 'Manhattan, New York', route: { start: { lat: 40.75765, lon: - 73.98577, heading: 29 }, points: [ [ 40.759, - 73.985 ] ], radius: 30 }, startsAt: - 3600e3, endsAt: 3600e3, total: 0, top: [], me: null },
		{ id: 33, period: 'day', key: 'day:2026-11-18', world: 'mars', kind: 'sprint', place: 'Bradbury Landing', region: CURIOSITY.region, route: { start: { lat: CURIOSITY.lat, lon: CURIOSITY.lon }, points: [ [ Math.round( gateLat * 1e6 ) / 1e6, Math.round( gateLon * 1e6 ) / 1e6 ] ], radius: 40 }, startsAt: - 3600e3, endsAt: 3600e3, total: 1, top: [ { rank: 1, name: 'Rover', ms: 9000, vehicle: 'go-kart', date: '2026-11-18', level: 3, title: 'rookie' } ], me: null },
	];

	test( 'a link to Mars: a free visit, the game on Mars at once; Mars\'s challenges first, the Earth\'s needing an Earth drive; a gate on Mars\'s own ground, driven through, the time posted with that visit', async () => {

		const page = await newPage();
		try {

			page.posted = [];
			page.visits = [];
			await page.addInitScript( player => localStorage.setItem( 'world-drive.player', JSON.stringify( player ) ), PLAYER );
			const json = ( route, body, status = 200 ) => route.fulfill( { status, contentType: 'application/json', body: JSON.stringify( body ) } );
			await page.route( 'https://challenges.cloudflare.com/turnstile/**', route => route.fulfill( { contentType: 'text/javascript', body: `window.turnstile = { render( el, options ) { setTimeout( () => options.callback( '${ TOKEN }' ), 50 ); return 'w1'; }, remove() {}, reset() {} };` } ) );
			await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true } ) );
			await page.route( `${ BASE }/api/visit`, route => {

				page.visits.push( JSON.parse( route.request().postData() ) );
				json( route, { moon: true, free: true, world: 'mars', visit: MARS_VISIT } );

			} );
			await page.route( `${ BASE }/api/challenges?*`, route => json( route, { now: Date.now(), challenges: listed() } ) );
			await page.route( `${ BASE }/api/challenges/time`, route => {

				const body = JSON.parse( route.request().postData() );
				page.posted.push( body );
				json( route, { ms: body.ms, rank: 1, total: 2, isNewBest: true, top: [ { rank: 1, name: PLAYER.name, ms: body.ms, vehicle: 'go-kart', date: '2026-11-18', level: 1, title: 'rookie' } ] } );

			} );
			// A link to a Mars spot: the visit asked for is Mars's, and the game opens there, pinned.
			await page.goto( `${ BASE }/?spot=mars-curiosity` );
			await page.waitForFunction( () => window.drive?.mode === 'globe' && window.drive.world === 'mars' && window.drive.panel.pinned?.id === 'mars-curiosity', null, { timeout: 90000 } );
			assert.deepEqual( page.visits, [ { token: TOKEN, world: 'mars' } ] );
			await page.locator( '#globe-ui .challenges-open' ).click();
			const dialog = page.locator( '#challenges' );
			await dialog.locator( '.ch-card' ).first().waitFor();
			// On Mars: its own first, under its own heading (no "the").
			assert.deepEqual( await dialog.locator( '.ch-world' ).allTextContents(), [ 'On Mars', 'On the Earth' ] );
			assert.deepEqual( await dialog.locator( '.ch-card' ).evaluateAll( cards => cards.map( card => [ card.dataset.id, card.dataset.world ] ) ), [ [ '33', 'mars' ], [ '31', 'earth' ] ] );
			assert.equal( await dialog.locator( '.ch-card[data-id="31"] .ch-start' ).textContent(), 'Needs an Earth drive' );
			assert.equal( await dialog.locator( '.ch-card[data-id="33"] .ch-start' ).textContent(), 'Start' );
			await shot( page, 'challenges-mars-1-list' );
			// Mars's: a drop-in at its start, its gate on its own ground.
			await dialog.locator( '.ch-card[data-id="33"] .ch-start' ).click();
			await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 180000 } );
			assert.deepEqual( await page.evaluate( () => [ window.drive.world, window.drive.place.challenge ] ), [ 'mars', 33 ] );
			const gate = await page.evaluate( () => {

				const [ g ] = window.drive.challenges.run.gates;
				return { ground: g.ground, ray: window.drive.ground.heightAt( g.x, g.z ), north: g.z, east: - g.x };

			} );
			// Mars's heights put it where the ground built there is (a ray down meets it within a metre).
			assert.ok( Number.isFinite( gate.ground ) && gate.ray !== null && Math.abs( gate.ground - gate.ray ) < 1, JSON.stringify( gate ) );
			assert.ok( Math.abs( gate.north - 130 ) < 2 && Math.abs( gate.east ) < 2, JSON.stringify( gate ) );
			await page.waitForFunction( () => window.drive.challenges.run?.phase === 'racing', null, { timeout: 180000 } );
			// Driven through it, as a driver would steer at it.
			const ms = await page.evaluate( () => new Promise( resolve => {

				const step = () => {

					const { run } = window.drive.challenges;
					const d = window.drive.driver;
					if ( ! run || run.phase === 'done' ) return resolve( run?.ms ?? null );
					const [ g ] = run.gates;
					const heading = Math.atan2( - g.x - d.east, g.z - d.north ) * 180 / Math.PI;
					Object.assign( d, { heading, course: heading, view: heading, speed: 60 } );
					requestAnimationFrame( step );

				};

				step();

			} ) );
			await page.locator( '.ch-finish' ).waitFor();
			await page.waitForFunction( () => /^#\d/.test( document.querySelector( '.ch-f-note' ).textContent ), null, { timeout: 30000 } );
			assert.equal( page.posted.length, 1 );
			assert.deepEqual( [ page.posted[ 0 ].challenge, page.posted[ 0 ].visit, page.posted[ 0 ].id, page.posted[ 0 ].ms ], [ 33, MARS_VISIT, PLAYER.id, ms ] );
			assert.ok( checkPasses( CHALLENGES[ 1 ], page.posted[ 0 ].ms, page.posted[ 0 ].passes ) );
			await shot( page, 'challenges-mars-2-finish' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );
