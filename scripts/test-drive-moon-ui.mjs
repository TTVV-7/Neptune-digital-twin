// npm run test:drive-moon-ui: World Drive's Moon (src/drive-app/moon.js, docs/world-drive.md, "The
// Moon") in a real browser, on the Vite dev server with no Maps key. The Moon needs none, so it's
// the real Moon here, not a stand-in: the globe turned to it (its files fetched only then), its
// spots, its own search and its recent places kept apart; a drop-in on its ground, with its gravity,
// its sky and no water; a hop as high as on the Earth that stays up two and a half times as long and
// isn't scored as big air; the drop-in's place counted for the play stats as its cell of the Moon's
// grid, about a kilometre each way; an underglow lying on its ground under the kart, as on the Earth; the
// ground made sharp round the vehicle; M back to its globe, and back to
// the Earth; a link to a Moon spot; and a phone. And a Moon challenge with today's Earth drives used
// up (straight onto the Moon): its drop-in, its gate on the Moon's own ground,
// driven through and posted. Every request that isn't to the local server is blocked.
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
import { cellOf } from '../src/drive-app/dropin-cells.js';
import { checkPasses, destination, formatTime } from '../src/drive-app/challenge-rules.js';
import { GHOST_BYTES, countFor, everyFor, ghostFault, ghostText, localOf, packGhost, sampleTime } from '../src/drive-app/ghost-rules.js';
import { startVite } from './worker-harness.mjs';
import { HOP, OPENER, openWorlds, pickWorld, radio, worldShown } from './worlds-ui.mjs';

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

	await pickWorld( page, 'moon' );
	await page.waitForFunction( () => window.drive.world === 'moon', null, { timeout: 60000 } );
	await flown( page );

}

describe( 'World Drive on the Moon', () => {

	let page;

	before( async () => {

		page = await newPage();
		// The play stats counted (with a visit made up for them, as test-drive-ui.mjs's are), their
		// posts kept in page.posts.
		page.posts = [];
		await page.addInitScript( () => {

			window.worldDriveStatsTest = { visit: 'v1.moon-stats-test' };

		} );
		await page.route( `${ BASE }/api/stats`, route => {

			page.posts.push( JSON.parse( route.request().postData() ) );
			route.fulfill( { status: 204 } );

		} );

	} );

	after( () => page?.context().close() );

	test( 'the globe turns to the Moon: its spots and words, its files fetched only now', async () => {

		await openGlobe( page );
		assert.deepEqual( page.moon, [], 'nothing of the Moon\'s is fetched on the Earth' );
		assert.equal( await page.evaluate( () => window.drive.moon.stars ), null, 'nor its stars made' );
		assert.equal( await worldShown( page ), 'earth' );
		assert.deepEqual( await names( page ), SPOTS.map( spot => spot.name ) );

		await toMoon( page );
		assert.deepEqual( page.moon.sort(), [ '/moon/colour.webp', '/moon/height.bin' ] );
		assert.equal( await worldShown( page ), 'moon' );
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
		// Where, for the owner's map of where people drop in: posted with the drop-in as its cell of the
		// Moon's grid, never where in it.
		await page.evaluate( () => window.drive.stats.post() );
		const posted = page.posts.find( post => post.places );
		assert.deepEqual( posted?.places, [ cellOf( 'moon', TRANQUILITY.lat, TRANQUILITY.lon ) ], JSON.stringify( page.posts ) );
		assert.equal( posted.counts[ 'dropin:moon' ], 1 );
		assert.doesNotMatch( JSON.stringify( page.posts ), /0\.674|23\.47/ );

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
		// The Earth's hop (10 m/s: 5.1 m up and 2.04 s in the air); on the Moon as high, and 1 / 0.406
		// times as long (5 s).
		assert.ok( Math.abs( hop.speed - HOP.speed * LEAP ) < 1e-6, JSON.stringify( hop ) );
		assert.ok( hop.high > HOP.high * 0.8 && hop.high < HOP.high * 1.2, JSON.stringify( hop ) );
		const times = hop.time / ( HOP.time / LEAP );
		assert.ok( times > 0.85 && times < 1.2, `${ times.toFixed( 2 ) } of what it should be: ${ JSON.stringify( hop ) }` );
		// As long in Earth time as the Earth's hop, and a hop's own time isn't big air: nothing scored.
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

		await pickWorld( page, 'earth' );
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
			await pickWorld( page, 'moon' );
			// The Worlds button says so while it loads: "Loading the Moon…", busy.
			await page.waitForFunction( () => document.querySelector( '#globe-ui .worlds-open' ).getAttribute( 'aria-busy' ) === 'true' );
			assert.equal( await page.locator( '#globe-ui .worlds-open .worlds-name' ).textContent(), 'Loading the Moon…' );
			assert.equal( await page.locator( OPENER ).getAttribute( 'aria-label' ), 'Change world. Loading the Moon…' );
			await page.locator( '#globe-ui .spots button', { hasText: 'Furka Pass' } ).click();
			release();
			await page.waitForFunction( () => window.drive.moon.ready, null, { timeout: 60000 } );
			await page.waitForTimeout( 500 );
			assert.deepEqual( await page.evaluate( () => ( {
				world: window.drive.world, pin: window.drive.panel.pinned?.id ?? null,
				busy: document.querySelector( '#globe-ui .worlds-open' ).getAttribute( 'aria-busy' ),
				earth: document.querySelector( '#globe-ui .worlds-open' ).dataset.world,
				name: document.querySelector( '#globe-ui .worlds-open .worlds-name' ).textContent,
			} ) ), { world: 'earth', pin: 'furka', busy: null, earth: 'earth', name: 'Earth' } );
			// And now it's loaded, Moon goes straight there.
			await toMoon( page );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'on a phone the Worlds button is at the top of the sheet, and the Moon tapped in the worlds it opens', async () => {

		const page = await newPage( { viewport: { width: 390, height: 760 }, touch: true } );
		try {

			await openGlobe( page );
			const sheet = await page.locator( '#globe-ui .panel' ).boundingBox();
			const worlds = await page.locator( OPENER ).boundingBox();
			assert.ok( worlds.y >= sheet.y && worlds.y < sheet.y + 40 && worlds.height >= 44, JSON.stringify( { sheet, worlds } ) );
			await openWorlds( page, { tap: true } );
			const moon = await page.locator( radio( 'moon' ) ).boundingBox();
			assert.ok( moon.width >= 44 && moon.height >= 44, JSON.stringify( moon ) );
			await pickWorld( page, 'moon', { tap: true } );
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

// Challenges on the Moon (src/drive-app/challenges.js), with the Worker's answers made here and
// today's Earth drives used up: straight onto the Moon (main.js's Moon-only mode, its visit the
// 429's), the list with the Moon's three first and the Earth's saying they need
// an Earth drive (which shows the used-up screen again), a Moon challenge's drop-in at its start, its
// gate on the Moon's own heights (as the ground built there has them), driven through, and its time
// posted with the Moon visit.
describe( 'World Drive challenges on the Moon', () => {

	const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
	const MOON_VISIT = 'v1.moon-used-up-visit';
	const PLAYER = { id: 'moonChallenge001', secret: 'm'.repeat( 32 ), name: 'Moon Racer' };
	// (How long before and after now each starts and ends, made into times as they're answered.)
	const NOW = 0;
	const listed = () => CHALLENGES.map( c => ( { ...c, startsAt: Date.now() + c.startsAt, endsAt: Date.now() + c.endsAt } ) );
	const [ gateLat, gateLon ] = destination( 'moon', TRANQUILITY.lat, TRANQUILITY.lon, 0, 130 );
	const CHALLENGES = [
		{ id: 21, period: 'day', key: 'day:2026-11-16', world: 'earth', kind: 'sprint', place: 'Times Square', region: 'Manhattan, New York', route: { start: { lat: 40.75765, lon: - 73.98577, heading: 29 }, points: [ [ 40.759, - 73.985 ] ], radius: 30 }, startsAt: NOW - 3600e3, endsAt: NOW + 3600e3, total: 0, top: [], me: null },
		{ id: 22, period: 'day', key: 'day:2026-11-16', world: 'moon', kind: 'sprint', place: 'Tranquility Base', region: TRANQUILITY.region, route: { start: { lat: TRANQUILITY.lat, lon: TRANQUILITY.lon }, points: [ [ Math.round( gateLat * 1e6 ) / 1e6, Math.round( gateLon * 1e6 ) / 1e6 ] ], radius: 40 }, startsAt: NOW - 3600e3, endsAt: NOW + 3600e3, total: 1, top: [ { rank: 1, name: 'Moonwalker', ms: 9000, vehicle: 'go-kart', date: '2026-11-16', level: 3, title: 'rookie' } ], me: null },
	];

	test( 'with today\'s Earth drives used up: the Moon\'s challenges first and started there, the Earth\'s needing an Earth drive; a gate on the Moon\'s own ground, driven through, the time posted with the Moon visit', async () => {

		const page = await newPage();
		try {

			page.posted = [];
			await page.addInitScript( player => localStorage.setItem( 'world-drive.player', JSON.stringify( player ) ), PLAYER );
			const json = ( route, body, status = 200 ) => route.fulfill( { status, contentType: 'application/json', body: JSON.stringify( body ) } );
			await page.route( 'https://challenges.cloudflare.com/turnstile/**', route => route.fulfill( { contentType: 'text/javascript', body: `window.turnstile = { render( el, options ) { setTimeout( () => options.callback( '${ TOKEN }' ), 50 ); return 'w1'; }, remove() {}, reset() {} };` } ) );
			await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true } ) );
			await page.route( `${ BASE }/api/visit`, route => json( route, { error: 'Today\'s free drives are used up', reason: 'daily', retryAfter: 3600, visit: MOON_VISIT }, 429 ) );
			await page.route( `${ BASE }/api/challenges?*`, route => json( route, { now: Date.now(), challenges: listed() } ) );
			await page.route( `${ BASE }/api/challenges/time`, route => {

				const body = JSON.parse( route.request().postData() );
				page.posted.push( body );
				json( route, { ms: body.ms, rank: 1, total: 2, isNewBest: true, top: [ { rank: 1, name: PLAYER.name, ms: body.ms, vehicle: 'go-kart', date: '2026-11-16', level: 1, title: 'rookie' } ] } );

			} );
			// Over the cap: on the Moon by itself.
			await page.goto( BASE );
			await page.waitForFunction( () => window.drive?.mode === 'globe' && window.drive.world === 'moon', null, { timeout: 90000 } );
			await page.locator( '#globe-ui .challenges-open' ).click();
			const dialog = page.locator( '#challenges' );
			await dialog.locator( '.ch-card' ).first().waitFor();
			// On the Moon: its own first.
			assert.deepEqual( await dialog.locator( '.ch-world' ).allTextContents(), [ 'On the Moon', 'On the Earth' ] );
			assert.deepEqual( await dialog.locator( '.ch-card' ).evaluateAll( cards => cards.map( card => card.dataset.id ) ), [ '22', '21' ] );
			// The Earth's: its button says it needs an Earth drive, and shows why there's none.
			const earth = dialog.locator( '.ch-card[data-id="21"] .ch-start' );
			assert.equal( await earth.textContent(), 'Needs an Earth drive' );
			await shot( page, 'challenges-moon-1-list' );
			await earth.click();
			await page.locator( '#notice[data-kind="used-up"]' ).waitFor();
			assert.equal( await page.evaluate( () => window.drive.world ), 'moon' );
			await page.locator( '#notice button', { hasText: 'Drive on the Moon' } ).click();
			await page.locator( '#notice' ).waitFor( { state: 'hidden' } );
			// The Moon's: a drop-in at its start, its gate on its own ground.
			await page.locator( '#globe-ui .challenges-open' ).click();
			await dialog.locator( '.ch-card[data-id="22"] .ch-start' ).click();
			await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 120000 } );
			assert.deepEqual( await page.evaluate( () => [ window.drive.world, window.drive.place.challenge ] ), [ 'moon', 22 ] );
			const gate = await page.evaluate( () => {

				const [ g ] = window.drive.challenges.run.gates;
				return { ground: g.ground, ray: window.drive.ground.heightAt( g.x, g.z ), north: g.z, east: - g.x };

			} );
			// The Moon's heights put it where the ground built there is (a ray down meets it within a metre).
			assert.ok( Number.isFinite( gate.ground ) && gate.ray !== null && Math.abs( gate.ground - gate.ray ) < 1, JSON.stringify( gate ) );
			assert.ok( Math.abs( gate.north - 130 ) < 2 && Math.abs( gate.east ) < 2, JSON.stringify( gate ) );
			await page.waitForFunction( () => window.drive.challenges.run?.phase === 'racing', null, { timeout: 180000 } );
			await shot( page, 'challenges-moon-2-racing' );
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
			assert.deepEqual( [ page.posted[ 0 ].challenge, page.posted[ 0 ].visit, page.posted[ 0 ].id, page.posted[ 0 ].ms ], [ 22, MOON_VISIT, PLAYER.id, ms ] );
			assert.ok( checkPasses( CHALLENGES[ 1 ], page.posted[ 0 ].ms, page.posted[ 0 ].passes ) );
			await shot( page, 'challenges-moon-3-finish' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'a friend\'s link to a Moon challenge, today\'s Earth drives used up: the visit is the Moon\'s (none of the Earth\'s asked for, no used-up screen), the Moon alone, the link\'s card; Start races their ghost on the Moon\'s ground, ahead or behind at its gate, and the time goes up with the Moon visit and the run\'s ghost', async () => {

		const page = await newPage();
		try {

			page.posted = [];
			const asked = [];
			const ghostsAsked = [];
			const run = 'moonFriendRun001';
			// Their run: north from the start to the gate at 20 m/s, on the ground there.
			const reach = localOf( 'moon', CHALLENGES[ 1 ].route.start, ...CHALLENGES[ 1 ].route.points[ 0 ] )[ 1 ];
			const theirs = Math.round( reach / 20 * 1000 );
			const friend = height => {

				const count = countFor( theirs );
				const ghost = { every: everyFor( theirs ), count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ).fill( Math.round( height * 100 ) ), yaw: new Int32Array( count ).fill( 512 ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
				for ( let i = 0; i < count; i ++ ) ghost.north[ i ] = Math.round( sampleTime( i, count, ghost.every, theirs ) / 1000 * 20 * 100 );
				const bytes = new Uint8Array( GHOST_BYTES );
				return { run, ms: theirs, passes: [ [ 0, theirs ] ], vehicle: 'go-kart', look: {}, ghost: ghostText( bytes, packGhost( ghost, bytes ) ) };

			};
			await page.addInitScript( player => localStorage.setItem( 'world-drive.player', JSON.stringify( player ) ), PLAYER );
			const json = ( route, body, status = 200 ) => route.fulfill( { status, contentType: 'application/json', body: JSON.stringify( body ) } );
			await page.route( 'https://challenges.cloudflare.com/turnstile/**', route => route.fulfill( { contentType: 'text/javascript', body: `window.turnstile = { render( el, options ) { setTimeout( () => options.callback( '${ TOKEN }' ), 50 ); return 'w1'; }, remove() {}, reset() {} };` } ) );
			await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true } ) );
			await page.route( `${ BASE }/api/visit`, route => {

				const world = JSON.parse( route.request().postData() ).world ?? 'earth';
				asked.push( world );
				if ( world === 'moon' ) return json( route, { moon: true, visit: MOON_VISIT } );
				json( route, { error: 'Today\'s free drives are used up', reason: 'daily', retryAfter: 3600, visit: MOON_VISIT }, 429 );

			} );
			await page.route( `${ BASE }/api/challenges?*`, route => json( route, { now: Date.now(), challenges: listed() } ) );
			await page.route( `${ BASE }/api/challenges/link?*`, route => json( route, { challenge: { ...listed()[ 1 ], replacedAt: null, finalAt: null }, vs: { name: 'Moonwalker', ms: theirs, vehicle: 'go-kart', run, ghost: true, date: '2026-11-16', level: 3, title: 'rookie' } } ) );
			// (Answered once the car's down, at its ground's height: the ghost's frame is the Moon's sphere.)
			await page.route( `${ BASE }/api/challenges/ghost?*`, async route => {

				ghostsAsked.push( new URL( route.request().url() ).search );
				await page.waitForFunction( () => window.drive.challenges?.run && Number.isFinite( window.drive.place?.height ), null, { timeout: 120000 } );
				json( route, friend( await page.evaluate( () => window.drive.place.height ) ) );

			} );
			await page.route( `${ BASE }/api/challenges/time`, route => {

				const body = JSON.parse( route.request().postData() );
				page.posted.push( body );
				json( route, { ms: body.ms, rank: 1, total: 2, isNewBest: true, run: body.run, handle: 'MoonHandle000022', top: [ { rank: 1, name: PLAYER.name, ms: body.ms, vehicle: 'go-kart', date: '2026-11-16', level: 1, title: 'rookie' } ] } );

			} );
			// (At the link's own path, as "challenge a friend" shares it.)
			await page.goto( `${ BASE }/c?challenge=22&vs=MoonHandle000099` );
			const card = page.locator( '#challenges .ch-link' );
			await card.waitFor( { timeout: 120000 } );
			assert.equal( await page.evaluate( () => window.drive.world ), 'moon' );
			assert.equal( new URL( page.url() ).pathname + new URL( page.url() ).search, '/' );
			// None of the Earth's drives asked for, and no used-up screen.
			assert.deepEqual( asked, [ 'moon' ] );
			assert.equal( await page.locator( '#notice' ).isVisible(), false );
			assert.match( await card.locator( '.ch-link-head' ).textContent(), new RegExp( `^Moonwalker's time to beat: ${ formatTime( theirs ).replace( '.', '\\.' ) } on the daily checkpoint sprint at Tranquility Base on the Moon, \\d+ m \\d+ s left\\.$` ) );
			await shot( page, 'challenges-moon-4-link' );
			await card.locator( '.ch-start' ).click();
			await page.waitForFunction( () => window.drive.challenges.race?.ready && window.drive.challenges.run?.phase === 'racing', null, { timeout: 180000 } );
			assert.deepEqual( await page.evaluate( () => [ window.drive.world, window.drive.challenges.race.name, window.drive.challenges.race.kind ] ), [ 'moon', 'Moonwalker', 'link' ] );
			assert.deepEqual( ghostsAsked, [ `?challenge=22&run=${ run }` ] );
			// Driven through its gate, quicker than they were.
			const ms = await page.evaluate( () => new Promise( resolve => {

				const step = () => {

					const { run } = window.drive.challenges;
					const d = window.drive.driver;
					if ( ! run || run.phase === 'done' ) return resolve( run?.ms ?? null );
					const [ g ] = run.gates;
					const heading = Math.atan2( - g.x - d.east, g.z - d.north ) * 180 / Math.PI;
					Object.assign( d, { heading, course: heading, view: heading, speed: 40 } );
					requestAnimationFrame( step );

				};

				step();

			} ) );
			assert.deepEqual( await page.evaluate( () => window.drive.challenges.run.splits ), [ ms - theirs ] );
			await page.waitForFunction( () => /^#\d/.test( document.querySelector( '.ch-f-note' ).textContent ), null, { timeout: 30000 } );
			assert.equal( await page.locator( '.ch-f-vs' ).textContent(), `${ ( Math.abs( ms - theirs ) / 1000 ).toFixed( 2 ) } s ${ ms < theirs ? 'quicker than' : 'behind' } Moonwalker's ${ formatTime( theirs ) }` );
			// Posted with the Moon visit, and its ghost as the Worker checks it, on the Moon's sphere.
			assert.equal( page.posted.length, 1 );
			const [ posted ] = page.posted;
			assert.deepEqual( [ posted.challenge, posted.visit, posted.ms ], [ 22, MOON_VISIT, ms ] );
			assert.equal( ghostFault( CHALLENGES[ 1 ], posted.ms, posted.passes, posted.ghost ), '' );
			await shot( page, 'challenges-moon-5-link-finish' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );
