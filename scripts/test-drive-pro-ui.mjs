// node --test scripts/test-drive-pro-ui.mjs: World Drive's Supporter Pass content
// (docs/world-drive.md) in a real browser, on the Vite dev server with no Maps key (the test globe
// and the flat test pad, as test-drive-ui.mjs uses). Without the pass: the four pass rides are
// listed with their badge and can't be driven, picking one (or a locked Garage choice) opens the
// pass's sheet, the free choices work (and keep working with a damaged saved value, or none kept at
// all), the world isn't drawn behind the Garage, and the free game drives as it did. ?pro=1 only
// counts on this computer. With ?pro=1 here: each new ride drives, drifts, is thrown up by a wall
// and lands, and their handling is measured against the kart's (top speed, 0 to 100 km/h, turning,
// how high the same wall throws them, and that it goes supersonic); the hovercraft hovers with no
// wheels, and rides over water (the test pad's sea, as Google draws water) throwing up spray, where
// the coupe drives across it too but with none, and no boost pads put down on it; the Garage's
// paint, decals, underglow, boost style, flame, trail and horn go on the ride being driven and are
// still there after a reload, and a look saved before the boost styles keeps its flame's colour; the
// underglow under every kind of ride (the kart, a ride, the cars and the library's pickup), sized to
// it and left out of its size, and the new finishes, rims and decals (pearl keeping dark paint's
// colour, camo and polka dots never drawn out on any ride that takes decals); the Garage's row of
// groups lighting the one gone to while the list goes there and sits there (the one in view once the
// wheel or Tab moves it, or another ride's longer list is shown), and a locked horn heard before it's
// bought; another driver's ghost wearing their underglow, fading off the ground, and their horn
// heard in its own sound, and Horn sounds switched off silencing it and the Garage's horns; what a
// trail and the booster cost a frame; every boost style drawn at 150 km/h (a picture of each),
// keeping to its budget and making nothing new in a minute of boosting, and what each costs a frame;
// every flame colour drawn in its own colours and every trail drawn behind the kart, and the ribbons
// drawn out on the Garage's turntable (and only there); and the Garage and the badges on a phone
// (375 px across, its row of groups all on screen, the one tapped lit until a finger drags the list).
// And World Drive's cars (src/drive-app/cars.js): listed, credited, small and their real
// size, with wheels that steer, each facing the way it drives; the muscle car free, the levels'
// cars saying their level and the rest locked; each driving, drifting, thrown up and landing, going
// supersonic, its wheels spinning and steering, the tall ones leaning out of a turn, and a look from
// its driver's seat; and the Garage repainting those whose paint is plain colour and saying the
// others keep theirs. Everything off this machine is blocked.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port; TEST_SCREENSHOTS=<folder> saves
// pictures; the handling it measures is printed.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startVite } from './worker-harness.mjs';
import { BOOSTS } from '../src/drive-app/boosts.js';
import { CARS as CAR_SPECS } from '../src/drive-app/cars.js';
import { DRIVE_CARS } from '../src/drive-app/catalog.js';
import { RIDES as LEVEL_RIDES, unlockLevel } from '../src/drive-app/levels.js';
import { FLAMES, SWATCHES, TRAILS } from '../src/drive-app/paint.js';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5531;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const RIDES = [ 'Sports coupe', 'Monster truck', 'City bus', 'Hovercraft' ];
// World Drive's cars (src/drive-app/cars.js): the first is free, the next six come with levels (or
// the pass), the rest with the pass alone. Without the pass, at level 1, all but the first are
// locked.
const CARS = [
	'Muscle car', 'Golf cart', 'Tuk-tuk', 'Ice-cream van', 'Lawn tractor', 'Retro wedge', 'Formula racer',
	'Neon racer', 'Night cruiser', 'Dune buggy', 'Farm truck', 'Police cruiser', 'Hypercar', 'Cyber muscle',
];
const LEVEL_CARS = CARS.slice( 1, 7 );
const PASS_CARS = CARS.slice( 7 );
const PASS_ONLY = [ ...PASS_CARS, ...RIDES ];
const LOCKED = [ ...LEVEL_CARS, ...PASS_ONLY ];
// The cars World Drive had first, whose characters are measured against each other as before.
const FIRST = [ 'Muscle car', 'Neon racer', 'Night cruiser', 'Dune buggy', 'Farm truck', 'Police cruiser' ];

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

// ride: picked unless one already is, so the tests drive the go-kart (drawn in code) as before the
// pickup (219,000 triangles, slow in Chromium's software renderer) was the default.
async function newPage( { viewport = { width: 1280, height: 800 }, touch = false, ride = 'go-kart' } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	if ( ride ) await context.addInitScript( ride => {

		try {

			if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', ride );

		} catch {

			// Storage blocked: the default it is.

		}

	}, ride );
	const page = await context.newPage();
	page.outside = [];
	page.errors = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => {

		page.outside.push( route.request().url() );
		route.abort();

	} );
	return page;

}

async function openGlobe( page, query = '' ) {

	await page.goto( `${ BASE }/${ query }` );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

}

async function shot( page, name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

const flown = page => page.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 60000 } );

// The Garage's row of groups, and each group's parts.
const JUMP_GROUPS = { Paint: [ 'colour', 'finish', 'decal' ], Rims: [ 'rim' ], Underglow: [ 'glow' ], Boost: [ 'boost', 'flame' ], Trail: [ 'trail', 'smoke' ], Horn: [ 'horn' ] };

// The Garage's row of groups: the one lit, the last whose first part shown has its heading up to the
// row (the one in view), and whether the list is scrolled to its end.
const groups = page => page.evaluate( parts => {

	const options = document.querySelector( '#garage .options' );
	const line = options.getBoundingClientRect().top + document.querySelector( '#garage .jump' ).offsetHeight + 12;
	const up = [ ...document.querySelectorAll( '#garage .jump button:not([hidden])' ) ].filter( button => {

		const section = parts[ button.dataset.group ].map( part => options.querySelector( `section[data-part="${ part }"]` ) ).find( s => ! s.hidden );
		return section.getBoundingClientRect().top <= line;

	} );
	return {
		lit: document.querySelector( '#garage .jump [aria-current="true"]' )?.dataset.group,
		inView: up.at( - 1 )?.dataset.group,
		end: options.scrollTop + options.clientHeight >= options.scrollHeight - 2,
	};

}, JUMP_GROUPS );

// Until the Garage's list has got where going to `group` with the row takes it (its heading up to
// the row, or the list's end) and stopped there: the smooth scroll can take seconds to get going on
// a busy machine, so it's waited for rather than given a fixed time. Then 30 frames more, by when
// the row has seen it stop (garage.js waits for ten still frames).
async function goneThere( page, group ) {

	await page.waitForFunction( ( [ group, parts ] ) => {

		const options = document.querySelector( '#garage .options' );
		const line = options.getBoundingClientRect().top + document.querySelector( '#garage .jump' ).offsetHeight + 12;
		const section = parts[ group ].map( part => options.querySelector( `section[data-part="${ part }"]` ) ).find( s => ! s.hidden );
		const there = section.getBoundingClientRect().top <= line || options.scrollTop + options.clientHeight >= options.scrollHeight - 2;
		// Still since the last look, too.
		const still = window.lastScrollTop === options.scrollTop;
		window.lastScrollTop = options.scrollTop;
		return there && still;

	}, [ group, JUMP_GROUPS ], { timeout: 10000 } );
	await waitFrames( page, 30 );

}

// `count` frames drawn.
const waitFrames = ( page, count ) => page.evaluate( count => new Promise( resolve => {

	const next = () => -- count > 0 ? requestAnimationFrame( next ) : resolve();
	requestAnimationFrame( next );

} ), count );

// Every group the row lights from watchLit( page ), frame by frame, until litSeen( page ).
const watchLit = page => page.evaluate( () => {

	const seen = window.litSeen = new Set();
	const look = () => {

		if ( window.litSeen !== seen ) return;
		seen.add( document.querySelector( '#garage .jump [aria-current="true"]' )?.dataset.group );
		requestAnimationFrame( look );

	};
	look();

} );
const litSeen = page => page.evaluate( () => {

	const seen = [ ...window.litSeen ];
	window.litSeen = null;
	return seen;

} );

// Drop in at Golden Gate Bridge on the test pad with the ride picked on the globe.
async function dropIn( page ) {

	await page.locator( '.spots button', { hasText: 'Golden Gate Bridge' } ).click();
	await flown( page );
	await page.locator( '.pin-card .go' ).click();
	await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );

}

// Change ride from the pause menu, and drive on.
async function swapTo( page, name ) {

	await page.keyboard.press( 'Escape' );
	await page.locator( '#pause' ).waitFor();
	await page.locator( '#pause .vehicle', { hasText: name } ).click();
	await page.waitForFunction( ride => window.drive.mode === 'driving' && window.drive.driver.entry.state.name === ride, name, { timeout: 30000 } );

}

// What a ride does on the test pad, driven at a fixed step so the headless frame rate doesn't
// matter: its top speed and 0 to 100 km/h with the gas held, how fast it turns at 50 km/h, a drift
// held and let go, and the same wall (6 m high, 30 m ahead) met at 70 km/h.
function measure() {

	const { driver: d, ground } = window.drive;
	const pad = ground.getColliders()[ 0 ];
	const step = ( seconds, each ) => {

		for ( let i = 0; i < Math.round( seconds * 60 ); i ++ ) {

			d.update( 1 / 60 );
			// The pad is flat and the same everywhere: keep to its middle on long runs.
			if ( d.north > 800 ) d.north -= 1000;
			if ( each?.( i / 60 ) === false ) return;

		}

	};
	const reset = kmh => {

		for ( const code of [ ...d.keys ] ) d.release( code );
		Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: kmh / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, driftHop: false, boost: null, firing: false, gauge: 1 } );
		d.update( 1 / 60 );

	};
	const out = { name: d.entry.state.name, trickRate: d.trickRate };

	// The gas held from a standstill.
	reset( 0 );
	d.press( 'KeyW' );
	let top = 0;
	out.zeroTo100 = null;
	step( 40, t => {

		top = Math.max( top, d.speed * 3.6 );
		if ( out.zeroTo100 === null && d.speed * 3.6 >= 100 ) out.zeroTo100 = Math.round( t * 10 ) / 10;

	} );
	out.topSpeed = Math.round( top );
	out.after3s = null;
	reset( 0 );
	d.press( 'KeyW' );
	step( 3 );
	out.after3s = Math.round( d.speed * 3.6 );

	// Steering hard right at 50 km/h for a second, off the gas.
	reset( 50 );
	const heading = d.heading;
	d.press( 'KeyD' );
	step( 1 );
	out.turnRate = Math.round( ( ( d.heading - heading ) % 360 + 360 ) % 360 );
	// How far the way it travels lags the way it points (slide).
	out.slide = Math.round( Math.abs( ( ( d.heading - d.course ) % 360 + 540 ) % 360 - 180 ) );

	// A drift: steering right and Space at 60 km/h, held 2 s, let go.
	reset( 60 );
	d.press( 'KeyD' );
	d.press( 'Space' );
	step( 2 );
	out.drifting = d.drifting;
	out.driftLevel = d.driftLevel;
	d.release( 'Space' );
	step( 0.1 );
	out.driftBoost = !! d.boost;

	// The wall: a vertical slice of the pad, 60 m wide and 6 m high, across the road 30 m north.
	const land = pad.children.find( child => child.isMesh );
	const wall = land.clone();
	wall.material = land.material.clone();
	wall.material.side = 2;
	wall.rotation.set( 0, 0, 0 );
	wall.scale.set( 60 / 4000, 6 / 2000, 1 );
	wall.position.set( 0, 3, 30 );
	pad.add( wall );
	wall.updateMatrixWorld();
	reset( 70 );
	let high = 0;
	let air = 0;
	let hit = false;
	step( 8, () => {

		hit ||= !! d.air;
		high = Math.max( high, d.y );
		if ( ! d.grounded ) air += 1 / 60;

	} );
	pad.remove( wall );
	Object.assign( out, { hit, launch: Math.round( high * 100 ) / 100, airTime: Math.round( air * 100 ) / 100, landed: d.grounded && ! d.air } );

	// The gas and the booster from a standstill, the gauge kept full: how long until supersonic.
	reset( 0 );
	d.press( 'KeyW' );
	d.press( 'KeyB' );
	out.supersonic = null;
	step( 20, t => {

		d.gauge = 1;
		if ( d.supersonic ) out.supersonic = Math.round( t * 10 ) / 10;
		return ! d.supersonic;

	} );
	reset( 0 );
	return out;

}

describe( 'Supporter Pass, without it', () => {

	let page;

	before( async () => {

		page = await newPage();

	} );

	after( () => page?.context().close() );

	test( 'the pass rides are listed after the free ones with their badge, and picking one opens the pass', async () => {

		await openGlobe( page );
		const panel = page.locator( '#globe-ui .panel' );
		assert.deepEqual( await panel.locator( '.vehicle b' ).allTextContents(), [ 'Go-kart', 'Pickup', ...CARS, ...RIDES ] );
		assert.deepEqual( await panel.locator( '.vehicle.locked b' ).allTextContents(), LOCKED );
		// The pass's alone wear its badge; the levels' cars their level, and that the pass has them.
		assert.deepEqual( await panel.locator( '.vehicle .pro-badge:not( .level-chip )' ).allTextContents(), PASS_ONLY.map( () => '⭐ Supporter Pass' ) );
		assert.deepEqual( await panel.locator( '.vehicle .level-chip' ).allTextContents(), LEVEL_RIDES.map( reward => `Lv ${ reward.level } · or Pass` ) );
		assert.equal( await page.evaluate( async () => ( await import( '/src/drive-app/pro.js' ) ).isPro() ), false );

		await panel.locator( '.vehicle', { hasText: 'Monster truck' } ).click();
		await page.locator( '#pass' ).waitFor();
		assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Go-kart' );
		const sheet = page.locator( '#pass' );
		assert.match( await sheet.textContent(), /Seventeen more rides[\s\S]*whole Garage[\s\S]*on the leaderboard[\s\S]*30 drives a day[\s\S]*Instead of 8/ );
		assert.match( await sheet.locator( '.rides' ).textContent(), /Thirteen cars and four built rides; levels bring six too\./ );
		// Each ride named by its picture, for a screen reader too.
		assert.equal( await sheet.locator( '.ride-icon' ).count(), 17 );
		assert.deepEqual( await sheet.locator( '.ride-icon' ).evaluateAll( icons => icons.map( icon => icon.title ) ), LOCKED );
		assert.deepEqual( await sheet.locator( '.ride-icon[role="img"]' ).evaluateAll( icons => icons.map( icon => icon.getAttribute( 'aria-label' ) ) ), LOCKED );
		// Short enough for Buy and signing in under it to be on a laptop's screen (1280 × 800).
		assert.ok( await sheet.locator( '.buy-area' ).evaluate( area => area.getBoundingClientRect().bottom <= innerHeight ) );
		assert.equal( await sheet.locator( '.buy' ).textContent(), 'Coming soon' );
		assert.ok( await sheet.locator( '.buy' ).isDisabled() );
		await shot( page, 'pro-pass-sheet' );
		await page.keyboard.press( 'Escape' );
		await sheet.waitFor( { state: 'hidden' } );
		assert.equal( await page.evaluate( () => window.drive.mode ), 'globe' );

		// The globe's own button opens it too.
		await panel.locator( '.pass-open' ).click();
		await sheet.waitFor();
		await sheet.locator( '.close' ).click();
		await sheet.waitFor( { state: 'hidden' } );
		await shot( page, 'pro-globe-locked' );

	} );

	test( 'the Garage: free choices go on, locked ones open the pass; a pass ride can be looked at', async () => {

		await page.locator( '#globe-ui .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		await page.waitForFunction( () => window.drive.garage.preview?.model, null, { timeout: 20000 } );
		assert.equal( await garage.locator( '.ride-tab[aria-pressed="true"]' ).textContent(), 'Go-kart' );
		// Three colours free, seventeen the pass's (and four only levels give: scripts/test-drive-levels.mjs);
		// gloss free; every decal but none locked; no underglow free but none; orange flame free; the
		// beep the only free horn.
		assert.equal( await garage.locator( '[data-part="colour"] .choice:not(.locked)' ).count(), 3 );
		assert.equal( await garage.locator( '[data-part="colour"] .choice.locked.pass' ).count(), 17 );
		assert.equal( await garage.locator( '[data-part="colour"] .choice.locked.level-only' ).count(), 4 );
		assert.deepEqual( await garage.locator( '[data-part="finish"] .choice:not(.locked)' ).allTextContents(), [ 'Gloss⭐' ] );
		assert.equal( await garage.locator( '[data-part="finish"] .choice.locked' ).count(), 6 );
		assert.deepEqual( await garage.locator( '[data-part="decal"] .choice:not(.locked)' ).allTextContents(), [ 'None⭐' ] );
		assert.equal( await garage.locator( '[data-part="decal"] .choice.locked' ).count(), 8 );
		assert.equal( await garage.locator( '[data-part="rim"] .choice.locked' ).count(), 10 );
		assert.deepEqual( await garage.locator( '[data-part="glow"] .choice:not(.locked)' ).evaluateAll( list => list.map( b => b.dataset.id ) ), [ 'none' ] );
		assert.equal( await garage.locator( '[data-part="glow"] .choice.locked.pass' ).count(), 9 );
		assert.equal( await garage.locator( '[data-part="flame"] .choice:not(.locked)' ).count(), 1 );
		assert.deepEqual( await garage.locator( '[data-part="trail"] .choice:not(.locked)' ).allTextContents(), [ 'None⭐' ] );
		assert.deepEqual( await garage.locator( '[data-part="horn"] .choice:not(.locked)' ).allTextContents(), [ 'Beep⭐' ] );
		assert.equal( await garage.locator( '[data-part="horn"] .choice.locked.pass' ).count(), 5 );
		// The levels' new looks say so: neon blue underglow at 10, the air horn at 32.
		assert.equal( await garage.locator( '[data-part="glow"] .choice[data-id="blue"] .unlock' ).textContent(), 'Lv 10' );
		assert.equal( await garage.locator( '[data-part="horn"] .choice[data-id="air"] .unlock' ).textContent(), 'Lv 32 · or Pass' );
		// A row of the groups over the choices; the swatch picked named by its heading.
		const jump = garage.locator( '.jump button' );
		assert.deepEqual( await jump.allTextContents(), [ 'Paint', 'Rims', 'Underglow', 'Boost', 'Trail', 'Horn' ] );
		assert.equal( await garage.locator( '.jump [aria-current="true"]' ).textContent(), 'Paint' );
		assert.equal( await garage.locator( '[data-part="colour"] h3' ).textContent(), 'Body colourBlaze orange' );
		assert.equal( await garage.locator( '[data-part="glow"] h3 .picked' ).textContent(), 'None' );
		// One word on the pass over the choices, not a badge on every part.
		assert.equal( await garage.locator( '.pass-note .pro-badge' ).textContent(), '⭐ Supporter Pass' );
		assert.ok( await garage.locator( '.pass-note' ).isVisible() );
		assert.equal( await garage.locator( 'h3 .pro-badge' ).count(), 0 );
		// The world isn't drawn behind it: the turntable is.
		const drawn = await page.evaluate( async () => {

			const { info } = window.drive.renderer;
			const before = info.render.frame;
			for ( let i = 0; i < 10; i ++ ) await new Promise( requestAnimationFrame );
			return info.render.frame - before;

		} );
		assert.equal( drawn, 0 );

		// Locked: the pass, and nothing changes.
		await garage.locator( '[data-part="colour"] .choice[data-id="violet"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pass' ).waitFor( { state: 'hidden' } );
		assert.ok( await garage.isVisible(), 'Esc on the pass closed the Garage too' );
		await garage.locator( '[data-part="flame"] .choice[data-id="rainbow"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		await garage.locator( '[data-part="glow"] .choice[data-id="blue"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		// A locked horn is heard before it's bought (it isn't kept: see below).
		const heard = await page.evaluate( () => window.drive.garage.hornsPlayed );
		await garage.locator( '[data-part="horn"] .choice[data-id="laser"]' ).click();
		await page.locator( '#pass' ).waitFor();
		assert.deepEqual( await page.evaluate( () => [ window.drive.garage.hornsPlayed, window.drive.garage.lastHorn ] ), [ heard + 1, 'laser' ] );
		await page.locator( '#pass .close' ).click();
		// Free: on.
		await garage.locator( '[data-part="colour"] .choice[data-id="red"]' ).click();
		const saved = await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.garage' ) )[ 'go-kart' ] );
		assert.deepEqual( { colour: saved.colour, flame: saved.flame, trail: saved.trail, decal: saved.decal, glow: saved.glow, horn: saved.horn }, { colour: 'red', flame: 'orange', trail: 'none', decal: 'none', glow: 'none', horn: 'beep' } );
		assert.ok( await garage.locator( '[data-part="colour"] .choice[data-id="red"]' ).evaluate( b => b.classList.contains( 'on' ) ) );
		assert.equal( await garage.locator( '[data-part="colour"] h3 .picked' ).textContent(), 'Racing red' );
		// The beep is heard as it's picked (a horn can't be seen on the turntable).
		const played = await page.evaluate( () => window.drive.garage.hornsPlayed );
		await garage.locator( '[data-part="horn"] .choice[data-id="beep"]' ).click();
		assert.equal( await page.evaluate( () => window.drive.garage.hornsPlayed ), played + 1 );
		// The row goes to each group, the one gone to lit, all the way there and after: Trail and the
		// horn together are shorter than the list, so going to Trail ends at the bottom, where the horn
		// had been lit as the one in view.
		await garage.locator( '.jump [data-group="Trail"]' ).click();
		await watchLit( page );
		await goneThere( page, 'Trail' );
		assert.deepEqual( await litSeen( page ), [ 'Trail' ] );
		assert.ok( ( await groups( page ) ).end, 'Trail and the horn fill the list now: this no longer tries its end' );
		await shot( page, 'pro-garage-jump-trail' );
		// Scrolled by hand (the wheel), the one in view is lit again, now Trail's heading is down the list.
		const box = await garage.locator( '.options' ).boundingBox();
		await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 );
		await page.mouse.wheel( 0, - 240 );
		await page.waitForFunction( () => {

			const options = document.querySelector( '#garage .options' );
			return options.scrollTop + options.clientHeight <= options.scrollHeight - 200;

		}, null, { timeout: 10000 } );
		await waitFrames( page, 30 );
		const wheeled = await groups( page );
		assert.ok( wheeled.lit === wheeled.inView && wheeled.lit !== 'Trail', JSON.stringify( wheeled ) );
		// The horn's heading comes up under the row, and it's lit, from the moment it's clicked.
		await garage.locator( '.jump [data-group="Horn"]' ).click();
		assert.equal( ( await groups( page ) ).lit, 'Horn' );
		await page.waitForFunction( () => {

			const row = document.querySelector( '#garage .jump' ).getBoundingClientRect();
			const heading = document.querySelector( '#garage [data-part="horn"] h3' ).getBoundingClientRect();
			return heading.top >= row.bottom - 1 && heading.bottom <= document.querySelector( '#garage .options' ).getBoundingClientRect().bottom;

		}, null, { timeout: 10000 } );
		assert.equal( ( await groups( page ) ).lit, 'Horn' );
		// Gone to Trail again, and then Tab: the focus goes on from the row into the list, which scrolls
		// back up to what's focused, and the one in view is lit (over the top of the list, the first),
		// not Trail.
		await garage.locator( '.jump [data-group="Trail"]' ).click();
		await goneThere( page, 'Trail' );
		assert.equal( ( await groups( page ) ).lit, 'Trail' );
		for ( let i = 0; i < 4 && ( await groups( page ) ).end; i ++ ) await page.keyboard.press( 'Tab' );
		await waitFrames( page, 30 );
		const tabbed = await groups( page );
		assert.ok( ! tabbed.end && tabbed.lit === ( tabbed.inView ?? 'Paint' ) && tabbed.lit !== 'Trail', JSON.stringify( tabbed ) );
		await shot( page, 'pro-garage-jump-tabbed' );
		await garage.locator( '.jump [data-group="Paint"]' ).click();
		await page.waitForFunction( () => document.querySelector( '#garage .options' ).scrollTop < 5, null, { timeout: 10000 } );
		await page.waitForTimeout( 400 );
		await shot( page, 'pro-garage-free' );

		// Boost styles: five free and seventeen with the pass, about half of those with a level too,
		// each with its picture and saying what unlocks it. A free one goes on and shows itself off;
		// the flame's colour only shows under the classic flame.
		const boosts = garage.locator( '[data-part="boost"]' );
		assert.deepEqual( await boosts.locator( '.choice:not(.locked)' ).allTextContents(), [ 'Classic flame⭐', 'Bubbles⭐', 'Confetti⭐', 'Music notes⭐', 'Cherry blossom⭐' ] );
		assert.equal( await boosts.locator( '.choice.locked' ).count(), 17 );
		const styleButtons = await boosts.locator( '.choice' ).evaluateAll( buttons => buttons.map( b => ( { id: b.dataset.id, picture: !! b.querySelector( 'svg path, svg circle, svg ellipse, svg rect' ), locked: b.classList.contains( 'locked' ), unlock: b.querySelector( '.unlock' )?.textContent ?? '' } ) ) );
		assert.deepEqual( styleButtons.map( b => b.id ), BOOSTS.map( style => style.id ) );
		for ( const button of styleButtons ) {

			const level = unlockLevel( 'boost', button.id );
			const free = BOOSTS.find( style => style.id === button.id ).free === true;
			assert.ok( button.picture, `${ button.id } has no picture` );
			assert.equal( button.locked, ! free, button.id );
			if ( ! free ) assert.equal( button.unlock, level === null ? 'Pass' : `Lv ${ level } · or Pass`, button.id );

		}

		assert.deepEqual( styleButtons.filter( b => unlockLevel( 'boost', b.id ) !== null ).map( b => b.id ), [ 'plasma', 'glitter', 'hearts', 'pixel', 'afterburner', 'frost', 'dragon', 'spooky' ] );
		assert.ok( await boosts.locator( '.choice[data-id="classic"]' ).evaluate( b => b.classList.contains( 'on' ) ) );
		assert.ok( await garage.locator( '[data-part="flame"]' ).isVisible() );
		await boosts.locator( '.choice[data-id="lightning"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		await boosts.locator( '.choice[data-id="bubbles"]' ).click();
		const bubbles = await page.evaluate( () => ( { saved: JSON.parse( localStorage.getItem( 'world-drive.garage' ) )[ 'go-kart' ].boost, demo: window.drive.garage.preview.demo > 0, budget: window.drive.garage.preview.fx.particles.budget } ) );
		assert.ok( bubbles.saved === 'bubbles' && bubbles.demo && bubbles.budget > 120, JSON.stringify( bubbles ) );
		assert.equal( await garage.locator( '[data-part="flame"]' ).isVisible(), false );
		await boosts.scrollIntoViewIfNeeded();
		await page.waitForTimeout( 900 );
		await shot( page, 'pro-garage-bubbles' );
		await boosts.locator( '.choice[data-id="classic"]' ).click();
		assert.ok( await garage.locator( '[data-part="flame"]' ).isVisible() );

		// A pass ride turns on the turntable, with a word on the pass; anything picked opens it.
		await garage.locator( '.ride-tab', { hasText: 'Monster truck' } ).click();
		await page.waitForFunction( () => window.drive.garage.preview.model?.name === 'Monster truck', null, { timeout: 20000 } );
		assert.ok( await garage.locator( '.locked-banner' ).isVisible() );
		assert.equal( await garage.locator( '.pass-note' ).isVisible(), false );
		await garage.locator( '[data-part="decal"] .choice[data-id="none"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		await page.waitForTimeout( 300 );
		await shot( page, 'pro-garage-locked-ride' );
		// The trucks keep their paint: underglow, flame, trail and horn only, and the row says so.
		await garage.locator( '.ride-tab', { hasText: 'Pickup' } ).click();
		await page.waitForFunction( () => window.drive.garage.preview.model && window.drive.garage.vehicle.id === 'pickup-truck' && window.drive.garage.vehicle.paintable === false, null, { timeout: 30000 } );
		assert.ok( await garage.locator( '.paint-note' ).isVisible() );
		assert.equal( await garage.locator( '[data-part="colour"]' ).isVisible(), false );
		assert.ok( await garage.locator( '[data-part="flame"]' ).isVisible() );
		assert.ok( await garage.locator( '[data-part="glow"]' ).isVisible() );
		assert.ok( await garage.locator( '[data-part="horn"]' ).isVisible() );
		assert.deepEqual( await garage.locator( '.jump button:not([hidden])' ).allTextContents(), [ 'Underglow', 'Boost', 'Trail', 'Horn' ] );
		await garage.locator( '.done' ).click();
		await garage.waitFor( { state: 'hidden' } );
		// And the world is drawn again.
		assert.ok( await page.evaluate( async () => {

			const { info } = window.drive.renderer;
			const before = info.render.frame;
			for ( let i = 0; i < 5; i ++ ) await new Promise( requestAnimationFrame );
			return info.render.frame > before;

		} ) );

	} );

	test( 'a damaged saved look, or a browser that keeps nothing, doesn\'t stop the Garage', async () => {

		const pickWhite = async target => {

			await target.locator( '#globe-ui .garage-open' ).click();
			await target.waitForFunction( () => window.drive.garage.preview?.model, null, { timeout: 20000 } );
			await target.locator( '#garage [data-part="colour"] .choice[data-id="white"]' ).click();
			const on = await target.locator( '#garage [data-part="colour"] .choice.on' ).getAttribute( 'data-id' );
			await target.locator( '#garage .done' ).click();
			return on;

		};
		// Whatever was there before (another version's, or half written), the next choice is kept.
		for ( const damaged of [ '{"go-kart": {"colour": "w', '"go-kart"', '[ 1, 2 ]', '7' ] ) {

			await page.evaluate( value => localStorage.setItem( 'world-drive.garage', value ), damaged );
			await openGlobe( page );
			assert.equal( await pickWhite( page ), 'white', damaged );
			assert.equal( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.garage' ) )[ 'go-kart' ].colour ), 'white', damaged );

		}

		// Site data blocked: nothing is kept, but what's picked is on the kart for this visit.
		const blocked = await newPage();
		await blocked.addInitScript( () => {

			for ( const name of [ 'getItem', 'setItem', 'removeItem' ] ) Storage.prototype[ name ] = () => {

				throw new DOMException( 'The site\'s data is blocked', 'SecurityError' );

			};

		} );
		await openGlobe( blocked );
		// (With nothing kept, the ride is the default, the pickup, whose paint is its model's: the kart.)
		await blocked.locator( '#globe-ui .vehicle', { hasText: 'Go-kart' } ).click();
		assert.equal( await pickWhite( blocked ), 'white' );
		await dropIn( blocked );
		const colours = await blocked.evaluate( () => {

			const found = new Set();
			window.drive.driver.entry.pivot.traverse( o => o.userData.paint === 'body' && found.add( o.material.color.getHexString() ) );
			return [ ...found ];

		} );
		assert.deepEqual( colours, [ 'eef1f4' ] );
		assert.deepEqual( blocked.errors, [] );
		await blocked.context().close();
		await page.evaluate( () => localStorage.removeItem( 'world-drive.garage' ) );

	} );

	test( '?pro=1 only counts on this computer', async () => {

		const answers = await page.evaluate( async () => {

			const { testPass } = await import( '/src/drive-app/pro.js' );
			return [
				[ 'worlddrive.app', '?pro=1' ], [ 'www.worlddrive.app', '?pro=1' ], [ 'localhost.worlddrive.app', '?pro=1' ], [ '127.0.0.1.nip.io', '?pro=1' ],
				[ 'localhost', '?pro=1' ], [ '127.0.0.1', '?pro=1' ], [ '127.0.0.1', '?pro=0' ], [ 'localhost', '' ], [ 'localhost', '?x=1&pro=1' ],
			].map( ( [ hostname, search ] ) => testPass( { hostname, search } ) );

		} );
		assert.deepEqual( answers, [ false, false, false, false, true, true, false, false, true ] );

	} );

	test( 'the free game drives as it did: the kart, its own handling, nothing locked on it', async () => {

		// A look saved with the pass (say on a test page) doesn't come with it.
		await page.evaluate( () => {

			localStorage.setItem( 'world-drive.garage', JSON.stringify( { 'go-kart': { colour: 'violet', finish: 'metallic', decal: 'flames', boost: 'lightning', flame: 'rainbow', trail: 'ribbon' } } ) );
			localStorage.setItem( 'world-drive.vehicle', 'monster-truck' );

		} );
		await openGlobe( page );
		// The saved pass ride can't be driven: the default ride is, the pickup. Then the kart.
		assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Pickup' );
		await page.locator( '#globe-ui .vehicle', { hasText: 'Go-kart' } ).click();
		await dropIn( page );
		const kart = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const body = [];
			d.entry.pivot.traverse( o => o.userData.paint === 'body' && body.push( o.material ) );
			return {
				name: d.entry.state.name, handling: d.spec.handling ?? null, fx: d.spec.fx,
				grip: d.handling.grip, turn: d.handling.turn, gravity: d.handling.gravity, launch: d.handling.launch,
				// Not violet, metallic, flames, lightning or a rainbow ribbon without the pass: as it came.
				colours: [ ...new Set( body.map( m => m.color.getHexString() ) ) ], physical: body.some( m => m.isMeshPhysicalMaterial ), decals: !! d.entry.pivot.getObjectByName( 'decals' ),
			};

		} );
		assert.deepEqual( kart, { name: 'Go-kart', handling: null, fx: { boost: 'classic', flame: 'orange', trail: null }, grip: 12, turn: [ 150, 55 ], gravity: 1, launch: 1, colours: [ 'ff4a1c' ], physical: false, decals: false } );
		const handling = await page.evaluate( measure );
		console.log( 'handling, kart without the pass:', JSON.stringify( handling ) );
		assert.ok( handling.launch > 1.5 && handling.landed && handling.drifting === 1 && handling.driftBoost, JSON.stringify( handling ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

} );

describe( 'Supporter Pass, with ?pro=1 on this computer', () => {

	let page;
	const handling = {};

	before( async () => {

		page = await newPage();

	} );

	after( () => page?.context().close() );

	test( 'the pass rides are unlocked, and each drives, drifts, is thrown up by a wall and lands', async () => {

		await openGlobe( page, '?pro=1' );
		assert.equal( await page.evaluate( async () => ( await import( '/src/drive-app/pro.js' ) ).isPro() ), true );
		assert.equal( await page.locator( '#globe-ui .vehicle.locked' ).count(), 0 );
		await dropIn( page );
		handling.kart = await page.evaluate( measure );
		for ( const name of RIDES ) {

			await swapTo( page, name );
			const ride = handling[ name ] = await page.evaluate( measure );
			// Under way, turning, for a picture of it driving.
			await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
			await page.keyboard.down( 'KeyW' );
			await page.waitForFunction( () => window.drive.driver.speed > 8, null, { timeout: 20000 } );
			await page.keyboard.down( 'KeyA' );
			await page.waitForTimeout( 500 );
			await shot( page, `pro-drive-${ name.toLowerCase().replace( ' ', '-' ) }` );
			await page.keyboard.up( 'KeyA' );
			await page.keyboard.up( 'KeyW' );
			assert.equal( ride.name, name );
			assert.ok( ride.after3s > 10, `${ name } didn't get going: ${ JSON.stringify( ride ) }` );
			assert.ok( ride.drifting === 1 && ride.driftLevel >= 2 && ride.driftBoost, `${ name } didn't drift: ${ JSON.stringify( ride ) }` );
			assert.ok( ride.hit && ride.launch > 0.3 && ride.landed, `${ name } wasn't thrown up and back down: ${ JSON.stringify( ride ) }` );
			// Never turning in the air faster than a kart, the most the leaderboard allows for.
			assert.ok( ride.trickRate <= 1, `${ name } turns in the air at ${ ride.trickRate } of a kart's rate` );
			// Boosting flat out, supersonic.
			assert.ok( ride.supersonic !== null, `${ name } never went supersonic: ${ JSON.stringify( ride ) }` );

		}

		console.log( 'handling with the pass:' );
		for ( const [ name, ride ] of Object.entries( handling ) ) console.log( `  ${ name.padEnd( 14 ) } top ${ ride.topSpeed } km/h, 0-100 ${ ride.zeroTo100 ?? 'never' } s, 3 s: ${ ride.after3s } km/h, turn ${ ride.turnRate }°/s at 50 km/h (slide ${ ride.slide }°), wall at 70 km/h: up ${ ride.launch } m, ${ ride.airTime } s in the air, supersonic after ${ ride.supersonic } s` );
		const { kart, 'Sports coupe': coupe, 'Monster truck': monster, 'City bus': bus, Hovercraft: hover } = handling;
		// The coupe: well over the kart's top speed, quicker to 100, and turning in sharply.
		assert.ok( coupe.topSpeed >= kart.topSpeed + 60, `coupe ${ coupe.topSpeed } vs kart ${ kart.topSpeed }` );
		assert.ok( coupe.zeroTo100 < kart.zeroTo100 * 0.75, `coupe 0-100 ${ coupe.zeroTo100 } vs kart ${ kart.zeroTo100 }` );
		assert.ok( coupe.turnRate > bus.turnRate * 1.5 && coupe.slide < hover.slide, JSON.stringify( { coupe, bus, hover } ) );
		// The monster truck: thrown highest and longest by the same wall.
		for ( const other of [ kart, coupe, bus, hover ] ) assert.ok( monster.launch > other.launch * 1.4 && monster.airTime > other.airTime, `monster ${ monster.launch } m vs ${ other.name } ${ other.launch } m` );
		// The bus: slowest away and lowest top speed, turning widest, barely thrown up.
		for ( const other of [ kart, coupe, monster, hover ] ) {

			assert.ok( bus.after3s < other.after3s && bus.topSpeed < other.topSpeed, `bus vs ${ other.name }` );
			assert.ok( bus.launch < other.launch, `bus ${ bus.launch } m vs ${ other.name } ${ other.launch } m` );

		}

		assert.equal( bus.zeroTo100, null );
		// The hovercraft: slides far wider than anything on wheels.
		for ( const other of [ kart, coupe, monster, bus ] ) assert.ok( hover.slide > other.slide + 10, `hovercraft slide ${ hover.slide }° vs ${ other.name } ${ other.slide }°` );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the hovercraft hovers and has no wheels; the monster truck drives up over a car', async () => {

		const hover = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const { pivot } = d.entry;
			// Settled first (the picture before was taken turning), then the gap under its skirt as
			// it bobs for two seconds: it rocks with the steering and the gas, so its lowest moment
			// depends on when it's looked at.
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { speed: 0, steer: 0 } );
			for ( let i = 0; i < 90; i ++ ) d.update( 1 / 60 );
			const hull = new d.ownBox.constructor();
			const gaps = [];
			for ( let i = 0; i < 120; i ++ ) {

				d.update( 1 / 60 );
				gaps.push( hull.setFromObject( pivot.getObjectByName( 'hover' ), true ).min.y - d.y );

			}

			// Tyres are the rides' rubber; the skirt is a rubber of its own.
			let tyres = 0;
			pivot.traverse( o => o.isMesh && o.material.color?.getHex() === 0x17181a && tyres ++ );
			const round = x => Math.round( x * 1000 ) / 1000;
			return { name: d.entry.state.name, tyres, low: round( Math.min( ...gaps ) ), high: round( Math.max( ...gaps ) ), grounded: d.grounded };

		} );
		assert.equal( hover.name, 'Hovercraft' );
		assert.equal( hover.tyres, 0 );
		// Its skirt's lowest edge 16 cm up, give or take its bobbing and rocking.
		assert.ok( hover.low > 0.08 && hover.high < 0.3 && hover.grounded, JSON.stringify( hover ) );
		console.log( 'hovercraft skirt over the ground (m):', JSON.stringify( hover ) );
		await page.waitForTimeout( 300 );
		await shot( page, 'pro-hovercraft-hovering' );

		await swapTo( page, 'Monster truck' );
		const over = await page.evaluate( () => {

			const { driver: d, ground } = window.drive;
			const pad = ground.getColliders()[ 0 ];
			// A car-sized block, 1.4 m tall, 20 m ahead.
			const land = pad.children.find( child => child.isMesh );
			const car = land.clone();
			car.material = land.material.clone();
			car.material.side = 2;
			car.scale.set( 2 / 4000, 4.5 / 2000, 1 );
			car.position.set( 0, 1.4, 20 );
			pad.add( car );
			car.updateMatrixWorld();
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: 30 / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, drifting: 0, boost: null } );
			let high = 0;
			let hit = false;
			// The body on its springs: how far it sank and rose.
			const springs = d.entry.pivot.getObjectByName( 'springs' );
			let sank = 0;
			let rose = 0;
			for ( let i = 0; i < 240; i ++ ) {

				d.update( 1 / 60 );
				high = Math.max( high, d.y );
				hit ||= !! d.air?.hits;
				sank = Math.min( sank, springs.position.y );
				rose = Math.max( rose, springs.position.y );

			}

			pad.remove( car );
			return { high, north: d.north, hit, sank, rose };

		} );
		assert.ok( over.high > 1.3 && over.north > 26 && ! over.hit, JSON.stringify( over ) );
		// Down off the car it sinks onto its springs; in the air the wheels hang (the body rises).
		assert.ok( over.sank < - 0.05 && over.rose > 0.05, JSON.stringify( over ) );

	} );

	test( 'the hovercraft rides over water, throwing up spray; the coupe drives across it too, with none; no boost pads on the water', async () => {

		// The pad's sea, 2 m below its land south of north = -280, as Google draws water: one even
		// colour (see water.js and test-drive-ui.mjs).
		const across = async name => {

			await swapTo( page, name );
			return page.evaluate( () => {

				const { driver: d, ground, pads, scene } = window.drive;
				const pad = ground.getColliders()[ 0 ];
				const sea = pad.children.find( child => child.isMesh && child.position.y < - 1 );
				if ( ! sea.material.map ) {

					const canvas = Object.assign( document.createElement( 'canvas' ), { width: 64, height: 64 } );
					const ctx = canvas.getContext( '2d' );
					ctx.fillStyle = 'rgb(45,76,95)';
					ctx.fillRect( 0, 0, 64, 64 );
					const disc = pads.group.children[ 0 ].material;
					const map = new disc.map.constructor( canvas );
					map.colorSpace = disc.map.colorSpace;
					sea.material = new disc.constructor( { map } );

				}

				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: - 230, y: 0, heading: 180, course: 180, view: 180, speed: 60 / 3.6, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, boost: null, firing: false, wetIn: 0, onWater: false } );
				// They're off until they're switched on.
				pads.enabled = true;
				pads.clear();
				const spray = () => scene.getObjectByName( 'drive-fx' ).children.filter( o => o.isSprite && o.visible ).length;
				// onWater: how long the Driver said it was on water (only for what floats, for its
				// spray); out: how long it was on the sea's surface, well out past the edge (by then a
				// landing's dust off it has settled), and the sprites showing there.
				const out = { name: d.entry.state.name, onWater: 0, out: 0, low: Infinity, high: - Infinity, sprayOnLand: 0, sprayOnWater: 0, sprayOut: 0, padsOnSea: 0, pads: 0 };
				const seen = new Set();
				d.press( 'KeyW' );
				for ( let i = 0; i < 10 * 60; i ++ ) {

					d.update( 1 / 60 );
					pads.update( 1 / 60 );
					if ( d.onWater ) {

						out.onWater += 1 / 60;
						out.sprayOnWater = Math.max( out.sprayOnWater, spray() );

					} else if ( d.north > - 270 ) out.sprayOnLand = Math.max( out.sprayOnLand, spray() );
					if ( d.north < - 360 ) {

						out.out += 1 / 60;
						out.low = Math.min( out.low, d.y );
						out.high = Math.max( out.high, d.y );
						out.sprayOut = Math.max( out.sprayOut, spray() );

					}
					for ( const p of pads.pads ) {

						const key = `${ p.index }:${ p.at.z.toFixed( 1 ) }`;
						if ( p.state === 'free' || seen.has( key ) ) continue;
						seen.add( key );
						out.pads ++;
						if ( p.at.y < - 1.99 ) out.padsOnSea ++;

					}

				}

				d.release( 'KeyW' );
				pads.enabled = false;
				out.north = d.north;
				// Back on the land, for what comes next.
				for ( let i = 0; i < 150; i ++ ) d.update( 1 / 60 );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, speed: 0 } );
				return out;

			} );

		};
		const hover = await across( 'Hovercraft' );
		console.log( 'hovercraft over the water:', JSON.stringify( hover ) );
		assert.equal( hover.name, 'Hovercraft' );
		// Out over the sea for seconds, on its surface, spray behind it there only.
		assert.ok( hover.onWater > 5 && hover.out > 3 && hover.north < - 500, JSON.stringify( hover ) );
		assert.ok( Math.abs( hover.low + 2 ) < 0.05 && Math.abs( hover.high + 2 ) < 0.05, JSON.stringify( hover ) );
		assert.ok( hover.sprayOnLand === 0 && hover.sprayOnWater >= 10, JSON.stringify( hover ) );
		assert.ok( hover.pads > 0 && hover.padsOnSea === 0, JSON.stringify( hover ) );
		await shot( page, 'pro-hovercraft-water' );

		// The coupe off the edge and on across the sea as on the ground: on its surface (its wheels
		// on it, its pivot there), with no spray, as it doesn't float.
		const coupe = await across( 'Sports coupe' );
		console.log( 'sports coupe across the water:', JSON.stringify( coupe ) );
		assert.ok( coupe.out > 3 && coupe.north < - 500 && Math.abs( coupe.low + 2 ) < 0.05 && Math.abs( coupe.high + 2 ) < 0.05, JSON.stringify( coupe ) );
		assert.ok( coupe.onWater === 0 && coupe.sprayOut === 0 && coupe.padsOnSea === 0, JSON.stringify( coupe ) );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the Garage puts paint, decals, flame and trail on the ride, and they stay after a reload', async () => {

		await swapTo( page, 'Sports coupe' );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		await page.locator( '#pause .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		await page.waitForFunction( () => window.drive.garage.preview?.model?.name === 'Sports coupe', null, { timeout: 20000 } );
		assert.equal( await garage.locator( '.ride-tab[aria-pressed="true"]' ).textContent(), 'Sports coupe⭐' );
		// Everything the pass has: only the colours levels alone give are still locked.
		assert.equal( await garage.locator( '.choice.locked:not(.level-only)' ).count(), 0 );
		assert.equal( await garage.locator( '.choice.locked.level-only' ).count(), 4 );
		const pick = ( part, id ) => garage.locator( `[data-part="${ part }"] .choice[data-id="${ id }"]` ).click();
		await pick( 'colour', 'violet' );
		await pick( 'finish', 'metallic' );
		await pick( 'decal', 'number' );
		await garage.locator( '.number input' ).fill( '42' );
		await garage.locator( '.number input' ).press( 'Tab' );
		await pick( 'rim', 'gold' );
		await pick( 'flame', 'blue' );
		await pick( 'trail', 'ribbon' );
		await pick( 'glow', 'pink' );
		await pick( 'horn', 'air' );
		await page.waitForTimeout( 1200 );
		await shot( page, 'pro-garage-coupe' );
		await pick( 'decal', 'flames' );
		await page.waitForTimeout( 600 );
		await shot( page, 'pro-garage-coupe-flames' );
		// On the ride being driven already, under the Garage.
		const worn = () => page.evaluate( () => {

			const { pivot } = window.drive.driver.entry;
			const body = [];
			const rims = [];
			pivot.traverse( o => {

				if ( o.userData.paint === 'body' ) body.push( o.material );
				if ( o.userData.paint === 'rim' ) rims.push( o.material );

			} );
			const decals = pivot.getObjectByName( 'decals' );
			const glow = pivot.userData.glow;
			return {
				body: [ ...new Set( body.map( m => `${ m.color.getHexString() } ${ m.metalness }` ) ) ], rims: [ ...new Set( rims.map( m => m.color.getHexString() ) ) ],
				decals: decals ? decals.children.reduce( ( sum, m ) => sum + m.geometry.attributes.position.count, 0 ) : 0,
				glow: glow ? `${ glow.userData.colour.toString( 16 ) } ${ glow.visible }` : null,
			};

		} );
		const before = await worn();
		assert.deepEqual( before.body, [ '7b3fe4 0.7' ] );
		assert.deepEqual( before.rims, [ 'd9a63a' ] );
		assert.ok( before.decals > 30, JSON.stringify( before ) );
		assert.equal( before.glow, 'ff2bc4 true' );
		// A close look at each of the others, in a look of its own.
		for ( const [ name, colour, decal, trail, boost, glow, finish ] of [
			[ 'Monster truck', 'black', 'flames', 'smoke', 'fireworks', 'green', 'shift' ], [ 'City bus', 'teal', 'checker', 'none', 'bubbles', 'red', 'satin' ], [ 'Hovercraft', 'pink', 'number', 'sparkle', 'comet', 'ice', 'pearl' ],
		] ) {

			await garage.locator( '.ride-tab', { hasText: name } ).click();
			await page.waitForFunction( ride => window.drive.garage.preview.model?.name === ride, name, { timeout: 20000 } );
			await pick( 'colour', colour );
			await pick( 'finish', finish );
			await pick( 'decal', decal );
			await pick( 'trail', trail );
			await pick( 'boost', boost );
			await pick( 'glow', glow );
			await page.waitForTimeout( 900 );
			await shot( page, `pro-garage-${ name.toLowerCase().replace( ' ', '-' ) }` );

		}

		// Gone to Trail on the bus (no trail, so the list ends under it), and then the monster truck
		// shown: its smoke's colours under its trail make its list longer, so the list is no longer at
		// its end, nor where going to Trail would leave it, and the one in view is lit, not Trail. Gone
		// to Trail on the truck, and back on the bus, whose shorter list ends just where going to Trail
		// on it would: Trail stays lit.
		const rideShown = async name => {

			await garage.locator( '.ride-tab', { hasText: name } ).click();
			await page.waitForFunction( ride => window.drive.garage.preview.model?.name === ride, name, { timeout: 20000 } );
			await waitFrames( page, 30 );

		};
		await rideShown( 'City bus' );
		await garage.locator( '.jump [data-group="Trail"]' ).click();
		await goneThere( page, 'Trail' );
		const onBus = await groups( page );
		assert.ok( onBus.lit === 'Trail' && onBus.end, JSON.stringify( onBus ) );
		await rideShown( 'Monster truck' );
		const onTruck = await groups( page );
		assert.ok( ! onTruck.end && onTruck.lit === onTruck.inView && onTruck.lit !== 'Trail', JSON.stringify( onTruck ) );
		await shot( page, 'pro-garage-jump-switched' );
		await garage.locator( '.jump [data-group="Trail"]' ).click();
		await goneThere( page, 'Trail' );
		await rideShown( 'City bus' );
		const backOnBus = await groups( page );
		assert.ok( backOnBus.lit === 'Trail' && backOnBus.end, JSON.stringify( backOnBus ) );

		await garage.locator( '.done' ).click();
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		// Driving on: the flame and trail it was given, and the trail drawn behind it boosting.
		const fx = await page.evaluate( () => {

			const { driver: d } = window.drive;
			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { speed: 30, firing: true, gauge: 1 } );
			for ( let i = 0; i < 30; i ++ ) d.update( 1 / 60 );
			let ribbon = null;
			let flame = null;
			d.models.group.parent.getObjectByName( 'drive-fx' ).traverse( o => {

				if ( o.geometry?.attributes.color?.itemSize === 4 ) ribbon = o;
				if ( o.geometry?.type === 'ConeGeometry' && ! flame ) flame = o;

			} );
			return { spec: d.spec.fx, ribbon: ribbon?.visible && ribbon.geometry.drawRange.count, flame: flame?.material.color.getHexString() };

		} );
		assert.deepEqual( fx.spec, { boost: 'classic', flame: 'blue', trail: { kind: 'ribbon', colour: 0xeef1f4 } } );
		assert.ok( fx.ribbon > 6, JSON.stringify( fx ) );
		assert.equal( fx.flame, '2b6dff' );
		await page.waitForTimeout( 200 );
		await shot( page, 'pro-drive-coupe-boost' );

		// After a reload, as it was left.
		await openGlobe( page, '?pro=1' );
		assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Sports coupe' );
		const icon = await page.locator( '#globe-ui .vehicle[data-id="sports-coupe"] [data-paint]' ).getAttribute( 'fill' );
		assert.equal( icon, '#7b3fe4' );
		await dropIn( page );
		const after = await worn();
		assert.deepEqual( after.body, before.body );
		assert.deepEqual( after.rims, before.rims );
		assert.ok( after.decals > 30 );
		assert.equal( after.glow, before.glow );
		assert.equal( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.garage' ) )[ 'sports-coupe' ].horn ), 'air' );
		assert.deepEqual( await page.evaluate( () => window.drive.driver.spec.fx ), fx.spec );
		// The hovercraft's comet, too, kept and driven with.
		await swapTo( page, 'Hovercraft' );
		assert.deepEqual( await page.evaluate( () => window.drive.driver.spec.fx ), { boost: 'comet', flame: 'orange', trail: { kind: 'sparkle', colour: 0xeef1f4 } } );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the underglow goes under every kind of ride, sized to it and left out of its size; the new finishes, rims and decals go on, camo and polka dots drawn out on none', async () => {

		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		await page.locator( '#pause .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		await page.waitForFunction( () => window.drive.garage.preview?.model, null, { timeout: 20000 } );
		const pick = ( part, id ) => garage.locator( `[data-part="${ part }"] .choice[data-id="${ id }"]` ).click();
		const show = async name => {

			const was = await page.evaluate( () => window.drive.garage.preview.model.uuid );
			await garage.locator( '.ride-tab', { hasText: name } ).click();
			await page.waitForFunction( was => window.drive.garage.preview.model?.uuid !== was, was, { timeout: 60000 } );

		};

		// Under the kart, a ride, the cars (painted or not) and the library's pickup: the footprint
		// and the same margin all round it, just over the ground, and the ride measured as before.
		for ( const [ name, glow ] of [ [ 'Go-kart', 'amber' ], [ 'City bus', 'blue' ], [ 'Muscle car', 'rainbow' ], [ 'Hypercar', 'white' ], [ 'Pickup', 'green' ] ] ) {

			await show( name );
			await pick( 'glow', glow );
			const under = await page.evaluate( () => {

				const { preview } = window.drive.garage;
				const model = preview.model;
				const glow = model.userData.glow;
				preview.stop();
				model.parent.rotation.y = 0;
				model.parent.updateMatrixWorld( true );
				const Box3 = glow.geometry.boundingBox.constructor;
				const ride = new Box3().setFromObject( model );
				model.remove( glow );
				const without = new Box3().setFromObject( model );
				model.add( glow );
				glow.updateMatrixWorld( true );
				const spread = new Box3().setFromBufferAttribute( glow.geometry.attributes.position ).applyMatrix4( glow.matrixWorld );
				preview.start();
				const round = v => Math.round( v * 100 ) / 100;
				return {
					same: ride.equals( without ), sides: [ ride.min.x - spread.min.x, spread.max.x - ride.max.x, ride.min.z - spread.min.z, spread.max.z - ride.max.z ].map( round ),
					over: round( spread.min.y - ride.min.y ), colour: glow.userData.colour, additive: glow.material.blending === 2 && ! glow.material.depthWrite, visible: glow.visible,
				};

			} );
			const wanted = await page.evaluate( async id => {

				const { GLOWS } = await import( '/src/drive-app/paint.js' );
				const glow = GLOWS.find( choice => choice.id === id );
				return glow.hex ?? glow.id;

			}, glow );
			assert.ok( under.same && under.additive && under.visible && under.colour === wanted, `${ name }: ${ JSON.stringify( under ) }` );
			assert.ok( under.sides.every( side => side >= 0.55 && side <= 1.45 && Math.abs( side - under.sides[ 0 ] ) < 0.02 ), `${ name }: ${ JSON.stringify( under ) }` );
			assert.ok( under.over > 0.03 && under.over < 0.08, `${ name }: ${ JSON.stringify( under ) }` );
			await page.waitForTimeout( 400 );
			await shot( page, `pro-garage-glow-${ name.toLowerCase().replace( ' ', '-' ) }` );

		}

		// None takes it away.
		await pick( 'glow', 'none' );
		assert.equal( await page.evaluate( () => window.drive.garage.preview.model.userData.glow ?? null ), null );

		// The new finishes and rims on the coupe's paint, and the new decals on its bodywork and the
		// kart's.
		await show( 'Sports coupe' );
		const paint = () => page.evaluate( () => {

			const body = [];
			const rims = [];
			window.drive.garage.preview.model.traverse( o => {

				if ( o.userData.paint === 'body' ) body.push( o.material );
				if ( o.userData.paint === 'rim' ) rims.push( o.material );

			} );
			const [ b ] = body;
			const [ r ] = rims;
			return {
				body: { roughness: b.roughness, metalness: b.metalness, iridescence: b.iridescence, sheen: b.sheen }, kinds: new Set( body ).size,
				rim: { roughness: r.roughness, metalness: r.metalness, emissive: r.emissiveIntensity },
			};

		} );
		const finishes = {};
		for ( const finish of [ 'satin', 'pearl', 'chrome', 'shift' ] ) {

			await pick( 'finish', finish );
			finishes[ finish ] = ( await paint() ).body;

		}

		assert.deepEqual( finishes, {
			satin: { roughness: 0.55, metalness: 0.15, iridescence: 0, sheen: 0 },
			pearl: { roughness: 0.32, metalness: 0.1, iridescence: 0.45, sheen: 0.25 },
			chrome: { roughness: 0.05, metalness: 1, iridescence: 0, sheen: 0 },
			shift: { roughness: 0.24, metalness: 1, iridescence: 1, sheen: 0.6 },
		} );
		// Pearl's sheen is white over halfway to the paint's colour, mixed as the colours look (sRGB),
		// so dark paint keeps its colour: on navy, a greyish blue (a full white sheen turned it silver,
		// and one mixed as light was nearly grey).
		await pick( 'colour', 'navy' );
		await pick( 'finish', 'pearl' );
		const sheen = await page.evaluate( () => {

			let colour = null;
			window.drive.garage.preview.model.traverse( o => colour ??= o.userData.paint === 'body' ? o.material.sheenColor.getHex() : null );
			return colour;

		} );
		const navy = SWATCHES.find( swatch => swatch.id === 'navy' ).hex;
		assert.ok( [ 16, 8, 0 ].every( shift => Math.abs( ( sheen >> shift & 255 ) - ( 0.45 * 255 + 0.55 * ( navy >> shift & 255 ) ) ) <= 2 ), sheen.toString( 16 ) );
		await page.waitForTimeout( 300 );
		await shot( page, 'pro-garage-coupe-navy-pearl' );
		const rims = {};
		for ( const rim of [ 'chrome', 'black', 'bronze', 'neon' ] ) {

			await pick( 'rim', rim );
			rims[ rim ] = ( await paint() ).rim;

		}

		assert.deepEqual( rims, {
			chrome: { roughness: 0.04, metalness: 1, emissive: 0 },
			black: { roughness: 0.5, metalness: 0.3, emissive: 0 },
			bronze: { roughness: 0.22, metalness: 0.8, emissive: 0 },
			neon: { roughness: 0.22, metalness: 0.8, emissive: 0.55 },
		} );
		await pick( 'finish', 'gloss' );
		const decals = () => page.evaluate( () => {

			const group = window.drive.garage.preview.model.getObjectByName( 'decals' );
			return group ? group.children.map( mesh => mesh.geometry.attributes.position.count ) : [];

		} );
		for ( const name of [ 'Sports coupe', 'Go-kart' ] ) {

			if ( name !== 'Sports coupe' ) await show( name );
			for ( const decal of [ 'bolts', 'camo', 'dots', 'two-tone' ] ) {

				await pick( 'decal', decal );
				const counts = await decals();
				// Down both sides (camo and dots over the top too), every piece with something on it.
				assert.ok( counts.length >= 2 && counts.every( count => count >= 3 ) && counts.reduce( ( a, b ) => a + b ) > 30, `${ name } ${ decal }: ${ counts }` );
				await page.waitForTimeout( 300 );
				await shot( page, `pro-garage-${ name.toLowerCase().replace( ' ', '-' ) }-${ decal }` );

			}

		}

		// Camo and polka dots, which go all over, are never drawn out much on any ride that takes
		// decals: DecalGeometry draws a picture out along a face it meets at a slant (1 / cos of the
		// angle), so each projection keeps to the faces it meets head on, and a dot on a kart's side
		// pod is a dot, not a dash across the pod's top. For each triangle of each piece, from its
		// corners and where they are in the picture (whose pixels are square in metres on the
		// projector's box): how many times as far the picture is stretched one way as the other
		// there. At most 1.56 (50° off) and a little for the pictures' rounding; projected through the
		// side's box made taller and onto every face, it had been 4 to thousands of times, over up
		// to two thirds of a piece.
		const stretch = () => page.evaluate( () => {

			const group = window.drive.garage.preview.model.getObjectByName( 'decals' );
			return group.children.map( mesh => {

				const { position, uv } = mesh.geometry.attributes;
				const { width, height } = mesh.material.map.image;
				let area = 0;
				let drawnOut = 0;
				let most = 1;
				for ( let i = 0; i < position.count; i += 3 ) {

					const corner = k => [ position.getX( i + k ), position.getY( i + k ), position.getZ( i + k ) ];
					const pixel = k => [ uv.getX( i + k ) * width, uv.getY( i + k ) * height ];
					const [ p0, p1, p2 ] = [ 0, 1, 2 ].map( corner );
					const [ q0, q1, q2 ] = [ 0, 1, 2 ].map( pixel );
					const e1 = p1.map( ( v, k ) => v - p0[ k ] );
					const e2 = p2.map( ( v, k ) => v - p0[ k ] );
					const f1 = [ q1[ 0 ] - q0[ 0 ], q1[ 1 ] - q0[ 1 ] ];
					const f2 = [ q2[ 0 ] - q0[ 0 ], q2[ 1 ] - q0[ 1 ] ];
					const det = f1[ 0 ] * f2[ 1 ] - f1[ 1 ] * f2[ 0 ];
					const size = Math.hypot( e1[ 1 ] * e2[ 2 ] - e1[ 2 ] * e2[ 1 ], e1[ 2 ] * e2[ 0 ] - e1[ 0 ] * e2[ 2 ], e1[ 0 ] * e2[ 1 ] - e1[ 1 ] * e2[ 0 ] ) / 2;
					if ( Math.abs( det ) < 1e-3 || size < 1e-8 ) continue;
					// Where a step across and a step up the picture go on the bodywork, and how the two
					// stretches between them compare.
					const across = e1.map( ( v, k ) => ( v * f2[ 1 ] - e2[ k ] * f1[ 1 ] ) / det );
					const up = e1.map( ( v, k ) => ( e2[ k ] * f1[ 0 ] - v * f2[ 0 ] ) / det );
					const a = across.reduce( ( sum, v ) => sum + v * v, 0 );
					const c = up.reduce( ( sum, v ) => sum + v * v, 0 );
					const b = across.reduce( ( sum, v, k ) => sum + v * up[ k ], 0 );
					const half = ( a + c ) / 2;
					const spread = Math.sqrt( Math.max( 0, half * half - ( a * c - b * b ) ) );
					const drawn = Math.sqrt( ( half + spread ) / Math.max( half - spread, 1e-30 ) );
					area += size;
					if ( drawn > 1.7 ) drawnOut += size;
					if ( size > 1e-5 ) most = Math.max( most, drawn );

				}

				return { triangles: position.count / 3, drawnOut: Math.round( drawnOut / area * 1000 ) / 1000, most: Math.round( most * 100 ) / 100 };

			} );

		} );
		for ( const name of [ 'Go-kart', 'Muscle car', 'Tuk-tuk', 'Lawn tractor', 'Cyber muscle', 'Sports coupe', 'City bus', 'Monster truck', 'Hovercraft' ] ) {

			if ( await page.evaluate( () => window.drive.garage.vehicle.name ) !== name ) await show( name );
			for ( const decal of [ 'dots', 'camo' ] ) {

				await pick( 'decal', decal );
				const pieces = await stretch();
				// On the top and both sides, none drawn out.
				assert.ok( pieces.length >= 3 && pieces.every( piece => piece.triangles >= 1 && piece.drawnOut === 0 && piece.most <= 1.65 ), `${ name } ${ decal }: ${ JSON.stringify( pieces ) }` );
				if ( ! SHOTS ) continue;
				await page.waitForTimeout( 300 );
				await shot( page, `pro-garage-${ decal }-${ name.toLowerCase().replace( ' ', '-' ) }` );

			}

		}

		await garage.locator( '.done' ).click();
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'what a trail and the booster cost a frame', async () => {

		const cost = await page.evaluate( async () => {

			const { createDriveFx } = await import( '/src/drive-fx.js' );
			const { driver: d, renderer, scene, camera } = window.drive;
			const gl = renderer.getContext();
			const world = d.models.group.parent;
			// Reading a pixel back waits for the frame to be drawn (finish() doesn't, in Chrome).
			const pixel = new Uint8Array( 4 );
			const drawn = () => gl.readPixels( 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel );
			const configs = {
				plain: [ { flame: 'orange', trail: null }, false ],
				boosting: [ { flame: 'orange', trail: null }, true ],
				ribbon: [ { flame: 'rainbow', trail: { kind: 'ribbon', colour: 0xffffff } }, true ],
				sparkle: [ { flame: 'blue', trail: { kind: 'sparkle', colour: 0xffffff } }, true ],
				smoke: [ { flame: 'pink', trail: { kind: 'smoke', colour: 0xff3fa4 } }, true ],
			};
			// One set of effects for each, made up front; only the one being timed is shown.
			d.fx.dispose();
			const sets = {};
			for ( const [ name, [ look ] ] of Object.entries( configs ) ) {

				const fx = createDriveFx( world, look );
				sets[ name ] = { fx, root: world.children.at( - 1 ) };

			}

			for ( const code of [ ...d.keys ] ) d.release( code );
			Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, speed: 25, vy: 0, grounded: true, air: null, boost: null } );
			const frames = { plain: [], boosting: [], ribbon: [], sparkle: [], smoke: [] };
			const updates = { plain: [], boosting: [], ribbon: [], sparkle: [], smoke: [] };
			const frame = boosting => {

				d.gauge = 1;
				d.firing = boosting;
				if ( d.north > 800 ) d.north -= 1000;
				const begun = performance.now();
				d.update( 1 / 60 );
				const updated = performance.now();
				renderer.render( scene, camera );
				drawn();
				return [ performance.now() - begun, updated - begun ];

			};
			// Round and round the five, a few frames each, so the machine slowing down or speeding up
			// (others share it) touches them all alike; the middle time of each.
			for ( let round = 0; round < 6; round ++ ) for ( const [ name, [ , boosting ] ] of Object.entries( configs ) ) {

				for ( const [ other, set ] of Object.entries( sets ) ) set.root.visible = other === name;
				d.fx = sets[ name ].fx;
				for ( let i = 0; i < 10; i ++ ) frame( boosting );
				for ( let i = 0; i < 15; i ++ ) {

					const [ total, update ] = frame( boosting );
					frames[ name ].push( total );
					updates[ name ].push( update );

				}

			}

			d.firing = false;
			for ( const [ name, set ] of Object.entries( sets ) ) if ( name !== 'plain' ) set.fx.dispose();
			sets.plain.root.visible = true;
			d.fx = sets.plain.fx;
			const median = list => Math.round( [ ...list ].sort( ( a, b ) => a - b )[ list.length >> 1 ] * 1000 ) / 1000;
			return Object.fromEntries( Object.keys( frames ).map( name => [ name, { frame: median( frames[ name ] ), update: median( updates[ name ] ) } ] ) );

		} );
		console.log( 'frame time, middle of 90 frames each (ms, headless software rendering; update = the driving and effects alone):', JSON.stringify( cost ) );
		for ( const kind of [ 'boosting', 'ribbon', 'sparkle', 'smoke' ] ) {

			assert.ok( cost[ kind ].frame < cost.plain.frame * 1.25 + 2, `${ kind }: ${ cost[ kind ].frame } ms a frame against ${ cost.plain.frame }` );
			assert.ok( cost[ kind ].update < 1.5, `${ kind }: ${ cost[ kind ].update } ms of updating a frame` );

		}

	} );

	test( 'a look saved before the boost styles keeps its flame: the classic flame, in its colour', async () => {

		// As the Garage kept it before: a flame's colour and no boost style.
		await page.evaluate( () => localStorage.setItem( 'world-drive.garage', JSON.stringify( { 'go-kart': { colour: 'red', flame: 'purple', trail: 'none' } } ) ) );
		await openGlobe( page, '?pro=1' );
		await page.locator( '#globe-ui .vehicle', { hasText: 'Go-kart' } ).click();
		await page.locator( '#globe-ui .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await page.waitForFunction( () => window.drive.garage.preview?.model, null, { timeout: 20000 } );
		assert.equal( await garage.locator( '[data-part="boost"] .choice.on' ).getAttribute( 'data-id' ), 'classic' );
		assert.equal( await garage.locator( '[data-part="flame"] .choice.on' ).getAttribute( 'data-id' ), 'purple' );
		await garage.locator( '.done' ).click();
		await dropIn( page );
		const worn = await page.evaluate( () => {

			const { driver: d } = window.drive;
			let flame = null;
			d.models.group.parent.getObjectByName( 'drive-fx' ).traverse( o => flame ??= o.geometry?.type === 'ConeGeometry' ? o : null );
			return { fx: d.spec.fx, cone: flame.material.color.getHexString() };

		} );
		assert.deepEqual( worn, { fx: { boost: 'classic', flame: 'purple', trail: null }, cone: '8f3dff' } );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'every boost style is drawn at 150 km/h, keeps to its budget, makes nothing new in a minute of boosting, and costs little', async () => {

		// Driving already, after the tests before; or on its own, dropped in here.
		if ( await page.evaluate( () => window.drive?.mode ) !== 'driving' ) {

			await openGlobe( page, '?pro=1' );
			await dropIn( page );

		}

		await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
		const styles = [ 'classic', ...await page.evaluate( async () => ( await import( '/src/drive-boosts.js' ) ).BOOST_STYLES ) ];
		const garageStyles = await page.evaluate( async () => ( await import( '/src/drive-app/boosts.js' ) ).BOOSTS.map( style => style.id ) );
		// The Garage offers each of drive-boosts.js's styles, and nothing else.
		assert.deepEqual( [ ...garageStyles ].sort(), [ ...styles ].sort() );
		assert.ok( styles.length >= 22 );
		const results = {};
		for ( const style of styles ) {

			const result = results[ style ] = await page.evaluate( async style => {

				const { createDriveFx } = await import( '/src/drive-fx.js' );
				const { driver: d, renderer, scene, camera } = window.drive;
				const gl = renderer.getContext();
				const world = d.models.group.parent;
				const { width, height } = gl.canvas;
				const pixels = [ new Uint8Array( width * height * 4 ), new Uint8Array( width * height * 4 ) ];
				const one = new Uint8Array( 4 );
				const memory = () => ( { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length } );
				d.fx.dispose();
				d.fx = createDriveFx( world, { boost: style, flame: 'orange', trail: null } );
				const root = world.children.at( - 1 );
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, boost: null } );
				// At 150 km/h with the booster lit (the gauge kept full, the speed held there).
				const frame = ( boosting, draw ) => {

					d.gauge = 1;
					d.firing = boosting;
					d.speed = 150 / 3.6;
					if ( d.north > 800 ) d.north -= 1000;
					const begun = performance.now();
					d.update( 1 / 60 );
					const updated = performance.now();
					if ( draw ) {

						renderer.render( scene, camera );
						// Reading a pixel back waits for the frame to be drawn.
						gl.readPixels( 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one );

					}

					return [ performance.now() - begun, updated - begun ];

				};
				const median = list => Math.round( [ ...list ].sort( ( a, b ) => a - b )[ list.length >> 1 ] * 1000 ) / 1000;
				// Boosting all along, drawn with its effects and without them by turns, a few frames
				// each, so the machine slowing down or speeding up (others share it) touches both
				// alike: the middle time of each. The update is the driving and the effects alone.
				for ( let i = 0; i < 90; i ++ ) frame( true, false );
				const times = { plain: [ [], [] ], boosting: [ [], [] ] };
				for ( let round = 0; round < 8; round ++ ) for ( const kind of [ 'plain', 'boosting' ] ) {

					root.visible = kind === 'boosting';
					for ( let i = 0; i < 4; i ++ ) {

						const [ total, update ] = frame( true, true );
						times[ kind ][ 0 ].push( total );
						times[ kind ][ 1 ].push( update );

					}

				}

				root.visible = true;
				const out = Object.fromEntries( Object.entries( times ).map( ( [ kind, [ frames, updates ] ] ) => [ kind, { frame: median( frames ), update: median( updates ) } ] ) );

				// Drawn: the picture with it and without it differ, behind the vehicle.
				renderer.render( scene, camera );
				gl.readPixels( 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels[ 0 ] );
				root.visible = false;
				renderer.render( scene, camera );
				gl.readPixels( 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels[ 1 ] );
				root.visible = true;
				let changed = 0;
				for ( let i = 0; i < pixels[ 0 ].length; i += 4 ) if ( Math.abs( pixels[ 0 ][ i ] - pixels[ 1 ][ i ] ) + Math.abs( pixels[ 0 ][ i + 1 ] - pixels[ 1 ][ i + 1 ] ) + Math.abs( pixels[ 0 ][ i + 2 ] - pixels[ 1 ][ i + 2 ] ) > 30 ) changed ++;
				out.changed = changed;

				// A minute of boosting: drawn every second, its objects counted, the most alive kept.
				const before = { ...memory(), objects: 0, materials: 0 };
				const count = () => {

					const materials = new Set();
					let objects = 0;
					root.traverse( o => {

						objects ++;
						if ( o.material ) materials.add( o.material );

					} );
					return { objects, materials: materials.size };

				};
				Object.assign( before, count() );
				out.budget = d.fx.particles.budget;
				out.most = 0;
				for ( let second = 0; second < 60; second ++ ) {

					for ( let i = 0; i < 59; i ++ ) {

						frame( true, false );
						out.most = Math.max( out.most, d.fx.particles.alive );

					}

					frame( true, true );

				}

				out.grew = Object.fromEntries( Object.entries( { ...memory(), ...count() } ).filter( ( [ key, value ] ) => value !== before[ key ] ).map( ( [ key, value ] ) => [ key, `${ before[ key ] } → ${ value }` ] ) );
				// Left boosting, for its picture.
				d.firing = true;
				return out;

			}, style );
			await shot( page, `pro-boost-${ style }` );
			console.log( `boost style ${ style.padEnd( 10 ) } ${ JSON.stringify( result ) }` );
			assert.ok( result.changed > 400, `${ style } didn't show: ${ result.changed } pixels changed` );
			assert.deepEqual( result.grew, {}, `${ style } made new things in a minute of boosting` );
			assert.ok( result.most <= result.budget, `${ style }: ${ result.most } alive, over its budget of ${ result.budget }` );
			assert.ok( result.boosting.update < 1.5, `${ style }: ${ result.boosting.update } ms of updating a frame` );
			// Software rendering here, where what costs is how much of the screen is drawn over: a few
			// tenths more at most (fireworks, sparks all over the view) and usually a few per cent.
			assert.ok( result.boosting.frame < result.plain.frame * 1.3 + 2, `${ style }: ${ result.boosting.frame } ms a frame against ${ result.plain.frame }` );

		}

		await page.evaluate( () => window.drive.driver.firing = false );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'every flame colour and trail the Garage has is drawn: each flame in its own colours, each trail behind the kart', async () => {

		if ( await page.evaluate( () => window.drive?.mode ) !== 'driving' ) {

			await openGlobe( page, '?pro=1' );
			await dropIn( page );

		}

		await page.evaluate( () => document.querySelector( '#drive-ui .keys' ).hidden = true );
		const result = await page.evaluate( async () => {

			const { createDriveFx, FLAMES: CONES } = await import( '/src/drive-fx.js' );
			const { FLAMES, TRAILS } = await import( '/src/drive-app/paint.js' );
			const { driver: d, renderer, scene, camera } = window.drive;
			const gl = renderer.getContext();
			const world = d.models.group.parent;
			const { width, height } = gl.canvas;
			const pixels = [ new Uint8Array( width * height * 4 ), new Uint8Array( width * height * 4 ) ];
			const Vector3 = camera.position.constructor;
			const at = new Vector3();
			const back = new Vector3();
			const right = new Vector3();
			const up = new Vector3();
			// Drawn from behind the kart and off to its right, a little higher than the chase camera,
			// so what's left behind it is in view: the pixels that differ with its effects shown and
			// hidden.
			const drawn = root => {

				const saved = [ camera.position.clone(), camera.quaternion.clone() ];
				d.entry.pivot.getWorldPosition( at );
				const turn = d.entry.pivot.getWorldQuaternion( camera.quaternion.clone() );
				back.set( 0, 0, 1 ).applyQuaternion( turn );
				right.set( 1, 0, 0 ).applyQuaternion( turn );
				up.set( 0, 1, 0 ).applyQuaternion( turn );
				camera.position.copy( at ).addScaledVector( back, 5 ).addScaledVector( right, 4.5 ).addScaledVector( up, 2.2 );
				camera.lookAt( at.addScaledVector( back, 2.2 ).addScaledVector( up, 0.5 ) );
				camera.updateMatrixWorld();
				for ( const [ i, shown ] of [ [ 0, true ], [ 1, false ] ] ) {

					root.visible = shown;
					renderer.render( scene, camera );
					gl.readPixels( 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels[ i ] );

				}

				root.visible = true;
				camera.position.copy( saved[ 0 ] );
				camera.quaternion.copy( saved[ 1 ] );
				let changed = 0;
				for ( let i = 0; i < pixels[ 0 ].length; i += 4 ) if ( Math.abs( pixels[ 0 ][ i ] - pixels[ 1 ][ i ] ) + Math.abs( pixels[ 0 ][ i + 1 ] - pixels[ 1 ][ i + 1 ] ) + Math.abs( pixels[ 0 ][ i + 2 ] - pixels[ 1 ][ i + 2 ] ) > 30 ) changed ++;
				return changed;

			};
			// A second and a half boosting at 60 km/h (the booster lit as it is, with no burst, so
			// one run is drawn just like the next but for what's being tried).
			const run = look => {

				d.fx.dispose();
				d.fx = createDriveFx( world, look );
				const root = world.children.at( - 1 );
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, view: 0, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, boost: null } );
				for ( let i = 0; i < 90; i ++ ) {

					Object.assign( d, { gauge: 1, firing: true, speed: 60 / 3.6 } );
					d.update( 1 / 60 );

				}

				return root;

			};
			const out = { flames: {}, trails: {}, missing: [] };
			for ( const { id } of FLAMES ) {

				const root = run( { boost: 'classic', flame: id, trail: null } );
				let cone = null;
				root.traverse( o => cone ??= o.geometry?.type === 'ConeGeometry' ? o : null );
				out.flames[ id ] = { drawn: drawn( root ), cone: cone.material.color.getHex(), own: id === 'rainbow' ? null : CONES[ id ]?.[ 0 ] ?? 'none' };

			}

			const plain = drawn( run( { boost: 'classic', flame: 'orange', trail: null } ) );
			for ( const { id } of TRAILS ) if ( id !== 'none' ) out.trails[ id ] = drawn( run( { boost: 'classic', flame: 'orange', trail: { kind: id, colour: 0xeef1f4 } } ) ) - plain;
			d.firing = false;
			return out;

		} );
		console.log( 'flames and trails drawn (pixels):', JSON.stringify( result ) );
		assert.deepEqual( Object.keys( result.flames ), FLAMES.map( flame => flame.id ) );
		assert.ok( FLAMES.length >= 11 && TRAILS.length >= 7, `${ FLAMES.length } flames, ${ TRAILS.length } trails` );
		for ( const [ id, flame ] of Object.entries( result.flames ) ) {

			assert.ok( flame.drawn > 400, `the ${ id } flame didn't show: ${ flame.drawn } pixels` );
			// In its own colour (drive-fx.js's for the name paint.js lists), not orange's.
			if ( flame.own !== null ) assert.equal( flame.cone, flame.own, `the ${ id } flame's colour` );

		}

		// Each trail draws a good deal more than the flame alone.
		for ( const [ id, more ] of Object.entries( result.trails ) ) assert.ok( more > 300, `the ${ id } trail didn't show: ${ more } pixels more than the flame alone` );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'a ribbon trail on the Garage\'s turntable is drawn out behind the ride as if it drove on, and standing still anywhere else or moving it\'s as it was', async () => {

		const result = await page.evaluate( async () => {

			const { createDriveFx } = await import( '/src/drive-fx.js' );
			const { driver: d } = window.drive;
			const world = d.models.group.parent;
			const Vector3 = d.entry.pivot.position.constructor;
			// A ride 2 m long that never moves, boosting for three quarters of a second: standing still
			// on the turntable (`preview`) or anywhere else, or said to be going at 10 m/s (as the pivot
			// isn't moved, what's laid stays in one spot but on the turntable, as it always has).
			const pivot = new d.entry.pivot.constructor();
			world.add( pivot );
			pivot.updateMatrixWorld( true );
			const size = { width: 1.2, height: 1, length: 2, rear: 1, scale: 1 };
			const wheels = [ new Vector3( - 0.5, 0.05, 0.6 ), new Vector3( 0.5, 0.05, 0.6 ) ];
			const run = ( kind, velocity, preview ) => {

				const fx = createDriveFx( world, { boost: 'classic', flame: 'orange', trail: { kind, colour: 0xffffff } } );
				const root = world.children.at( - 1 );
				for ( let i = 0; i < 45; i ++ ) fx.update( { pivot, size, wheels, velocity, flame: 1, trail: 1, drifting: false, level: 0, grounded: true, preview, dt: 1 / 60 } );
				let ribbon = null;
				root.traverse( o => ribbon ??= o.geometry?.attributes.color?.itemSize === 4 ? o : null );
				// How far back what's drawn reaches, along the ride (its +Z).
				const { index, attributes: { position } } = ribbon.geometry;
				const at = new Vector3();
				let near = Infinity;
				let far = - Infinity;
				for ( let i = 0; i < ribbon.geometry.drawRange.count; i ++ ) {

					const { z } = pivot.worldToLocal( at.fromBufferAttribute( position, index.getX( i ) ) );
					near = Math.min( near, z );
					far = Math.max( far, z );

				}

				fx.dispose();
				return Math.round( ( far - near ) * 100 ) / 100;

			};
			const out = {};
			for ( const kind of [ 'ribbon', 'neon' ] ) out[ kind ] = { turntable: run( kind, new Vector3(), true ), still: run( kind, new Vector3(), false ), moving: run( kind, new Vector3( 0, 0, - 10 ), false ) };
			world.remove( pivot );
			return out;

		} );
		console.log( 'ribbons on the turntable, standing still and moving (m):', JSON.stringify( result ) );
		for ( const [ kind, { turntable, still, moving } ] of Object.entries( result ) ) {

			// On the turntable, drawn out more than its length behind it (at RIBBON_SHOW of its length
			// a second, 3.75 m); standing still anywhere else (against a wall, hovering, a ghost
			// stopped) or moving, each point stays where it was laid, here all in one spot.
			assert.ok( turntable > 3, `the ${ kind } on the turntable reaches ${ turntable } m` );
			assert.ok( still < 0.05, `the ${ kind } standing still off the turntable reaches ${ still } m` );
			assert.ok( moving < 0.05, `the ${ kind } moving reaches ${ moving } m` );

		}

		assert.deepEqual( page.errors, [] );

	} );

} );

describe( 'Driving with others: their underglow and horn', () => {

	// The others' ghosts (ghosts.js) and the horns heard (friends.js), with a stand-in for the room
	// (live.js) saying what it would: test-drive-live-ui.mjs drives them with a real one.
	test( 'a ghost wears its driver\'s underglow, fading off the ground as yours does; their horn is heard in its own sound, and yours in yours', async () => {

		const page = await newPage();
		await openGlobe( page, '?pro=1' );
		await dropIn( page );
		await page.evaluate( async () => {

			const { createGhosts } = await import( '/src/drive-app/ghosts.js' );
			const { setUpFriends } = await import( '/src/drive-app/friends.js' );
			const { loadVehicles } = await import( '/src/drive-app/vehicles.js' );
			const { FLAGS, packState } = await import( '/src/drive-app/live-protocol.js' );
			const { scene, camera, globe, models, driver: d } = window.drive;
			const handlers = {};
			const players = new Map();
			const live = {
				players, status: 'live', ended: null, party: null, nearby: true, self: null, place: null, away: false,
				ride: { vehicle: 'go-kart', look: { horn: 'fanfare' } },
				on: ( type, fn ) => ( handlers[ type ] ??= [] ).push( fn ),
				honk: () => true, invite: () => null, leaveParty: () => {}, setNearby: () => {}, joinParty: () => {},
			};
			const emit = ( type, data ) => ( handlers[ type ] ?? [] ).forEach( fn => fn( data ) );
			const vehicles = await loadVehicles();
			const ghosts = createGhosts( { scene, earth: globe.earth, camera, vehicles, loader: models.loader, live, tags: document.getElementById( 'live-tags' ), own: () => d.entry.pivot } );
			const friends = setUpFriends( { live, ghosts, vehicles, mode: () => 'driving', goTo: () => {} } );
			// Ana's car 10 m ahead of yours and a little to the left (past where a ghost turns
			// see-through), as the room says it (Earth-centred), in her look from a newer page: an
			// underglow, a horn and a part this page doesn't know.
			const pivot = d.entry.pivot;
			const earth = globe.earth.matrixWorld.clone().invert();
			const at = pivot.localToWorld( pivot.position.clone().set( - 3, 0, - 10 ) ).applyMatrix4( earth );
			const turn = pivot.getWorldQuaternion( pivot.quaternion.clone() ).premultiply( globe.earth.getWorldQuaternion( pivot.quaternion.clone() ).invert() );
			const still = { x: 0, y: 0, z: 0 };
			const state = flags => packState( at, turn, still, flags );
			const ana = { pid: 'anaANA01', name: 'Ana', star: false, level: 12, title: null, vehicle: 'go-kart', look: { colour: 'red', glow: 'pink', horn: 'air', aura: 'gold' }, place: null, away: false, s: state( FLAGS.grounded ) };
			players.set( ana.pid, ana );
			emit( 'welcome', { players: [ ana ] } );
			window.others = { ghosts, friends, emit, ana, state, FLAGS };

		} );
		// Drawn as the room's words come (as main.js does each frame), until her ride is built.
		const run = seconds => page.evaluate( async seconds => {

			const { ghosts } = window.others;
			for ( let t = 0; t < seconds; t += 0.05 ) {

				ghosts.update( 0.05, true );
				await new Promise( resolve => setTimeout( resolve, 50 ) );

			}

		}, seconds );
		const glow = () => page.evaluate( () => {

			const pivot = window.others.ghosts.group.children[ 0 ];
			const glow = pivot?.userData.glow;
			return glow ? { colour: glow.userData.colour, lift: Math.round( glow.userData.lift * 100 ) / 100, visible: glow.visible, builds: window.others.ghosts.list()[ 0 ].builds } : null;

		} );
		await run( 2 );
		assert.deepEqual( await glow(), { colour: 0xff2bc4, lift: 1, visible: true, builds: 1 } );
		await shot( page, 'pro-ghost-underglow' );
		// Off the ground (in the air off a jump), it stays a moment, then fades out; down again, it's back.
		await page.evaluate( () => {

			const { emit, ana, state, FLAGS } = window.others;
			emit( 'states', { at: performance.now(), states: [ { pid: ana.pid, s: state( FLAGS.air ), age: 0 } ] } );

		} );
		await run( 2 );
		assert.deepEqual( await glow(), { colour: 0xff2bc4, lift: 0, visible: false, builds: 1 } );
		await page.evaluate( () => {

			const { emit, ana, state, FLAGS } = window.others;
			emit( 'states', { at: performance.now(), states: [ { pid: ana.pid, s: state( FLAGS.grounded ), age: 0 } ] } );

		} );
		await run( 1.5 );
		assert.deepEqual( await glow(), { colour: 0xff2bc4, lift: 1, visible: true, builds: 1 } );
		// A new horn is no new model; a new underglow is, once it has held.
		await page.evaluate( () => {

			const { emit, ana } = window.others;
			emit( 'look', { pid: ana.pid, vehicle: 'go-kart', look: { ...ana.look, horn: 'bike' } } );

		} );
		await run( 1.5 );
		assert.equal( ( await glow() ).builds, 1 );
		await page.evaluate( () => {

			const { emit, ana } = window.others;
			emit( 'look', { pid: ana.pid, vehicle: 'go-kart', look: { ...ana.look, glow: 'rainbow' } } );

		} );
		await run( 2 );
		assert.deepEqual( await glow(), { colour: 'rainbow', lift: 1, visible: true, builds: 2 } );

		// Her honk in her horn; one this page doesn't know is the beep; yours in yours.
		const heard = await page.evaluate( () => {

			const { friends, emit, ana } = window.others;
			// (Sound waits for a click or a key.)
			document.body.dispatchEvent( new PointerEvent( 'pointerdown', { bubbles: true } ) );
			const out = [];
			emit( 'honk', { pid: ana.pid } );
			out.push( friends.lastHorn );
			ana.look = { ...ana.look, horn: 'kazoo' };
			emit( 'honk', { pid: ana.pid } );
			out.push( friends.lastHorn );
			friends.honk();
			out.push( friends.lastHorn );
			return { out, beeps: friends.beeps };

		} );
		assert.deepEqual( heard, { out: [ 'air', 'beep', 'fanfare' ], beeps: 3 } );

		// Horn sounds switched off in the pause menu (horns.js keeps it): no honk is heard, nor a horn
		// picked in the Garage, though it's still picked. On again, both are.
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		const hornSounds = page.locator( '#pause .friends .setting', { hasText: 'Horn sounds' } ).locator( 'input' );
		assert.ok( await hornSounds.isChecked() );
		await hornSounds.uncheck();
		assert.equal( await page.evaluate( () => localStorage.getItem( 'world-drive.horn' ) ), 'off' );
		await page.locator( '#pause .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		await page.waitForFunction( () => window.drive.garage.preview?.model, null, { timeout: 20000 } );
		const horns = () => page.evaluate( () => ( { garage: window.drive.garage.hornsPlayed, honks: window.others.friends.beeps, look: JSON.parse( localStorage.getItem( 'world-drive.garage' ) )?.[ 'go-kart' ]?.horn } ) );
		const quiet = await horns();
		await garage.locator( '[data-part="horn"] .choice[data-id="ahooga"]' ).click();
		await page.evaluate( () => window.others.friends.honk() );
		assert.deepEqual( await horns(), { ...quiet, look: 'ahooga' } );
		await garage.locator( '.done' ).click();
		await hornSounds.check();
		assert.equal( await page.evaluate( () => localStorage.getItem( 'world-drive.horn' ) ), 'on' );
		await page.locator( '#pause .garage-open' ).click();
		await garage.waitFor();
		await garage.locator( '[data-part="horn"] .choice[data-id="bike"]' ).click();
		await page.evaluate( () => window.others.friends.honk() );
		assert.deepEqual( await horns(), { garage: quiet.garage + 1, honks: quiet.honks + 1, look: 'bike' } );
		assert.equal( await page.evaluate( () => window.drive.garage.lastHorn ), 'bike' );
		await garage.locator( '.done' ).click();
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

} );

describe( 'The Garage on a phone', () => {

	test( 'without the pass, the locked rides wear their badge there too', async () => {

		const page = await newPage( { viewport: { width: 390, height: 844 }, touch: true } );
		await openGlobe( page );
		const badges = async root => page.locator( `${ root } .vehicle.locked .pro-badge` ).evaluateAll( list => list.map( badge => {

			const box = badge.getBoundingClientRect();
			return box.width > 20 && box.height > 8 && getComputedStyle( badge ).display !== 'none';

		} ) );
		assert.deepEqual( await badges( '#globe-ui' ), LOCKED.map( () => true ) );
		await shot( page, 'pro-phone-globe-locked' );
		await dropIn( page );
		await page.evaluate( () => window.drive.driver.stop() );
		await page.locator( '#pause' ).waitFor();
		assert.deepEqual( await badges( '#pause' ), LOCKED.map( () => true ) );
		await shot( page, 'pro-phone-pause-locked' );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

	test( 'it fills the screen, the ride and its choices fit across, and it closes', async () => {

		const page = await newPage( { viewport: { width: 375, height: 812 }, touch: true } );
		await openGlobe( page, '?pro=1' );
		await page.locator( '#globe-ui .vehicle', { hasText: 'Hovercraft' } ).tap();
		await shot( page, 'pro-phone-globe' );
		await page.locator( '#globe-ui .garage-open' ).tap();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		await page.waitForFunction( () => window.drive.garage.preview?.model?.name === 'Hovercraft', null, { timeout: 20000 } );
		await page.waitForTimeout( 600 );
		const layout = await page.evaluate( () => {

			const box = selector => document.querySelector( selector ).getBoundingClientRect();
			const sheet = box( '#garage' );
			return {
				sheet: [ sheet.width, sheet.height ], stage: box( '#garage .stage' ).height, done: box( '#garage .done' ).bottom,
				wide: Math.max( document.querySelector( '#garage' ).scrollWidth, document.querySelector( '#garage .options' ).scrollWidth, document.documentElement.scrollWidth ), swatch: box( '#garage .choice.swatch' ).width,
				// The row of groups: each of its buttons on screen, none cut off.
				jump: [ ...document.querySelectorAll( '#garage .jump button' ) ].map( button => button.getBoundingClientRect() ).every( b => b.left >= 0 && b.right <= innerWidth && b.width > 30 ),
			};

		} );
		assert.deepEqual( layout.sheet, [ 375, 812 ] );
		assert.ok( layout.stage > 200 && layout.done <= 812 && layout.wide <= 375 && layout.swatch >= 32 && layout.jump, JSON.stringify( layout ) );
		await shot( page, 'pro-phone-garage' );
		await garage.locator( '[data-part="trail"] .choice[data-id="sparkle"]' ).tap();
		await page.waitForTimeout( 900 );
		await shot( page, 'pro-phone-garage-sparkle' );
		// Straight to the underglow from the row, and one on.
		await garage.locator( '.jump [data-group="Underglow"]' ).tap();
		await page.waitForFunction( () => document.querySelector( '#garage .jump [aria-current="true"]' )?.dataset.group === 'Underglow', null, { timeout: 5000 } );
		await garage.locator( '[data-part="glow"] .choice[data-id="purple"]' ).tap();
		assert.equal( await garage.locator( '[data-part="glow"] h3 .picked' ).textContent(), 'Purple' );
		assert.ok( await page.evaluate( () => document.documentElement.scrollWidth <= innerWidth ) );
		await page.waitForTimeout( 600 );
		await shot( page, 'pro-phone-garage-underglow' );
		// Straight to Trail, and Trail lit (the list is short enough here for its heading to come up
		// under the row). Dragged back a little with a finger, the one in view is lit.
		await garage.locator( '.jump [data-group="Trail"]' ).tap();
		await watchLit( page );
		await goneThere( page, 'Trail' );
		assert.deepEqual( await litSeen( page ), [ 'Trail' ] );
		const tapped = await groups( page );
		assert.ok( tapped.lit === 'Trail' && tapped.inView === 'Trail', JSON.stringify( tapped ) );
		await shot( page, 'pro-phone-garage-trail' );
		const list = await garage.locator( '.options' ).boundingBox();
		const trailTop = await garage.locator( '.options' ).evaluate( options => options.scrollTop );
		const touch = await page.context().newCDPSession( page );
		const finger = ( type, y ) => touch.send( 'Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [ { x: list.x + list.width / 2, y: list.y + list.height / 3 + y } ] } );
		await finger( 'touchStart', 0 );
		for ( let y = 20; y <= 200; y += 20 ) await finger( 'touchMove', y );
		await finger( 'touchEnd' );
		await page.waitForFunction( top => document.querySelector( '#garage .options' ).scrollTop < top - 100, trailTop, { timeout: 10000 } );
		await waitFrames( page, 30 );
		const dragged = await groups( page );
		assert.ok( dragged.lit === dragged.inView && dragged.lit !== 'Trail', JSON.stringify( dragged ) );
		await garage.locator( '.options' ).evaluate( el => el.scrollTop = el.scrollHeight );
		await shot( page, 'pro-phone-garage-scrolled' );
		await garage.locator( '.done' ).tap();
		await garage.waitFor( { state: 'hidden' } );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

} );

// The small odd cars, shorter than a car (see the size check).
const SMALL = [ 'golf-cart', 'tuk-tuk', 'lawn-tractor' ];
// How to tell a car's front from its back (its front axle is the one at -z, see add-drive-car.mjs),
// each by something that turns round with the car: narrower, the steering axle's track narrower
// than the rear's; smaller, its tyres smaller; short-nose, the front overhang (nose to front axle)
// shorter than the rear's; long-nose, longer; lone, a three-wheeler's lone wheel steers;
// tail-high, the body highest behind the middle (a roof set back, a wing: peak, from its model).
const span = ( wheels, along ) => Math.max( ...wheels.map( wheel => along( wheel ) ) );
const FACTS = {
	narrower: car => span( car.wheels.filter( w => w.steers ), w => Math.abs( w.at[ 0 ] ) ) < span( car.wheels.filter( w => ! w.steers ), w => Math.abs( w.at[ 0 ] ) ) * 0.95,
	smaller: car => span( car.wheels.filter( w => w.steers ), w => w.radius ) < span( car.wheels.filter( w => ! w.steers ), w => w.radius ) * 0.9,
	'short-nose': car => overhangs( car ).front < overhangs( car ).rear * 0.85,
	'long-nose': car => overhangs( car ).front > overhangs( car ).rear * 1.15,
	lone: car => car.wheels.filter( w => w.steers ).length === 1,
	'tail-high': car => car.peak > 0.1 * car.dimensions.length,
};
const FACING = {
	'dune-buggy': [ 'narrower' ],
	'golf-cart': [ 'short-nose' ],
	'tuk-tuk': [ 'lone', 'short-nose' ],
	'ice-cream-van': [ 'short-nose' ],
	'lawn-tractor': [ 'smaller' ],
	'retro-wedge': [ 'tail-high' ],
	'formula-racer': [ 'long-nose', 'tail-high' ],
	hypercar: [ 'narrower', 'long-nose', 'tail-high' ],
	'cyber-muscle': [ 'narrower', 'short-nose' ],
};

function overhangs( car ) {

	const half = car.dimensions.length / 2;
	return { front: Math.min( ...car.wheels.filter( w => w.steers ).map( w => w.at[ 2 ] - w.radius ) ) + half, rear: half - Math.max( ...car.wheels.filter( w => ! w.steers ).map( w => w.at[ 2 ] + w.radius ) ) };

}

// Where (z, m) a car's body is highest, from its model as World Drive loads it.
async function peakOf( file ) {

	const { NodeIO } = await import( '@gltf-transform/core' );
	const { ALL_EXTENSIONS } = await import( '@gltf-transform/extensions' );
	const { MeshoptDecoder } = await import( 'meshoptimizer' );
	await MeshoptDecoder.ready;
	const doc = await new NodeIO().registerExtensions( ALL_EXTENSIONS ).registerDependencies( { 'meshopt.decoder': MeshoptDecoder } ).readBinary( readFileSync( file ) );
	const body = doc.getRoot().listNodes().find( node => node.getName() === 'body' );
	let peak = { y: - Infinity, z: 0 };
	const v = [];
	for ( const node of [ body, ...body.listChildren() ] ) {

		const m = node.getWorldMatrix();
		for ( const prim of node.getMesh()?.listPrimitives() ?? [] ) {

			const position = prim.getAttribute( 'POSITION' );
			for ( let i = 0; i < position.getCount(); i ++ ) {

				position.getElement( i, v );
				const y = m[ 1 ] * v[ 0 ] + m[ 5 ] * v[ 1 ] + m[ 9 ] * v[ 2 ] + m[ 13 ];
				if ( y > peak.y ) peak = { y, z: m[ 2 ] * v[ 0 ] + m[ 6 ] * v[ 1 ] + m[ 10 ] * v[ 2 ] + m[ 14 ] };

			}

		}

	}

	return Math.round( peak.z * 100 ) / 100;

}

describe( 'World Drive\'s cars', () => {

	const folder = new URL( '../drive/public/cars/', import.meta.url );
	const listed = JSON.parse( readFileSync( new URL( 'cars.json', folder ), 'utf8' ) );
	const idOf = name => CAR_SPECS.find( car => car.name === name ).id;
	let page;

	after( () => page?.context().close() );

	test( 'each is listed and credited, small enough, its real size, with four wheels and the front two steering, facing the way it drives', async () => {

		assert.deepEqual( CAR_SPECS.map( car => car.id ), DRIVE_CARS );
		assert.deepEqual( CAR_SPECS.map( car => car.name ), CARS );
		assert.deepEqual( listed.map( car => car.id ).sort(), [ ...DRIVE_CARS ].sort() );
		// One free, six with levels (or the pass), the rest with the pass alone.
		assert.deepEqual( CAR_SPECS.filter( car => ! car.pro && ! LEVEL_RIDES.some( reward => reward.id === car.id ) ).map( car => car.name ), [ 'Muscle car' ] );
		assert.deepEqual( LEVEL_RIDES.map( reward => CAR_SPECS.find( car => car.id === reward.id )?.name ), LEVEL_CARS );
		assert.deepEqual( CAR_SPECS.filter( car => car.pro ).map( car => car.name ), PASS_CARS );
		const credits = readFileSync( new URL( 'CREDITS.md', folder ), 'utf8' );
		for ( const car of listed ) {

			const bytes = statSync( new URL( car.file, folder ) ).size;
			assert.ok( bytes < 2 * 1024 * 1024, `${ car.id } is ${ bytes } bytes` );
			assert.ok( statSync( new URL( car.thumb, folder ) ).size > 1000, car.id );
			assert.ok( [ 'CC Attribution', 'CC0 Public Domain' ].includes( car.source.license ), car.id );
			assert.match( car.source.url, /^https:\/\/sketchfab\.com\/3d-models\//, car.id );
			assert.ok( credits.includes( car.source.url ) && credits.includes( car.source.author ) && credits.includes( car.source.licenseUrl ), car.id );
			// What was changed, as CC BY asks: a real place's number plate painted over (--blank), say.
			if ( car.paintedOver ) assert.ok( credits.includes( `its ${ car.paintedOver.join( ' and ' ) } painted over` ), car.id );
			// A car's size; the small odd ones (the golf cart, the tuk-tuk, the lawn tractor) shorter,
			// and the ice-cream van taller, its cone standing on its roof.
			const { length, width, height } = car.dimensions;
			assert.ok( length >= ( SMALL.includes( car.id ) ? 1.9 : 3.4 ) && length <= 5.2 && width < 3.2 && height < ( car.id === 'ice-cream-van' ? 3.8 : 3 ), `${ car.id } ${ JSON.stringify( car.dimensions ) }` );
			// Four wheels, or a three-wheeler's three (add-drive-car.mjs's --trike).
			assert.equal( car.wheels.length, car.trike ? 3 : 4, car.id );
			// The front pair (front is -z) steers, one each side; a three-wheeler's lone wheel in the
			// middle, at the front.
			const front = car.wheels.filter( wheel => wheel.steers );
			if ( car.trike ) {

				assert.equal( front.length, 1, car.id );
				assert.ok( front[ 0 ].at[ 2 ] < 0 && Math.abs( front[ 0 ].at[ 0 ] ) < 0.1 * width, `${ car.id } ${ JSON.stringify( front ) }` );

			} else {

				assert.deepEqual( front.map( wheel => Math.sign( wheel.at[ 2 ] ) ), [ - 1, - 1 ], car.id );
				assert.deepEqual( front.map( wheel => Math.sign( wheel.at[ 0 ] ) ).sort(), [ - 1, 1 ], car.id );

			}

			// The importer always makes the -z axle steer, so a car imported back to front still passes
			// the checks above (the dune buggy was, at first). Each car since is checked by something
			// about it that turns round with it, seen when it was imported (FACING).
			if ( FACING[ car.id ]?.includes( 'tail-high' ) ) car.peak = await peakOf( new URL( car.file, folder ) );
			for ( const fact of FACING[ car.id ] ?? [] ) assert.ok( FACTS[ fact ]( car ), `${ car.id } faces the wrong way: not ${ fact } (${ JSON.stringify( { wheels: car.wheels, peak: car.peak } ) })` );

		}

		// The hypercar came with a real place's number plate (New York's), painted over.
		assert.deepEqual( listed.find( car => car.id === 'hypercar' ).paintedOver, [ 'number plate' ] );
		// Every car but the five that came before the dune buggy's lesson has its facts.
		for ( const id of DRIVE_CARS ) assert.ok( FACING[ id ] || [ 'muscle-car', 'neon-racer', 'night-cruiser', 'farm-truck', 'police-cruiser' ].includes( id ), `${ id } has nothing to tell its front by` );

	} );

	test( 'without the pass: the muscle car is free, drives and is credited; the others open the pass', async () => {

		page = await newPage();
		await openGlobe( page );
		const panel = page.locator( '#globe-ui .panel' );
		await panel.locator( '.vehicle', { hasText: 'Neon racer' } ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Go-kart' );
		await panel.locator( '.vehicle', { hasText: 'Muscle car' } ).click();
		assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Muscle car' );
		// Its picture, drawn for the picker, and the credit its licence asks for, under the rides.
		assert.match( await panel.locator( '.vehicle[data-id="muscle-car"] img' ).getAttribute( 'src' ), /\/cars\/thumbs\/muscle-car\.webp$/ );
		assert.equal( await panel.locator( '.credit' ).textContent(), 'Model: "Classic Muscle car" by Lexyc16, CC BY 4.0; compressed, rescaled, its lamps made plain and its wheels made to turn.' );
		await shot( page, 'cars-globe-picker' );
		// About credits them all, each with its link and its licence's.
		await page.locator( '#globe-ui .about-open' ).click();
		const lines = await page.locator( '#about .credits li' ).allTextContents();
		for ( const car of listed ) {

			const name = CAR_SPECS.find( spec => spec.id === car.id ).name;
			const line = lines.find( text => text.startsWith( `${ name }:` ) );
			assert.ok( line?.includes( car.source.title ) && line.includes( `by ${ car.source.author }` ) && line.includes( 'its wheels made to turn' ), `${ name }: ${ line }` );
			if ( car.paintedOver ) assert.ok( line.includes( `its ${ car.paintedOver.join( ' and ' ) } painted over` ), `${ name }: ${ line }` );
			assert.equal( await page.locator( `#about .credits a[href="${ car.source.url }"]` ).count(), 1, name );

		}

		assert.ok( await page.locator( '#about .credits a[href="https://creativecommons.org/licenses/by/4.0/"]' ).count() >= listed.length );
		await shot( page, 'cars-about' );
		await page.locator( '#about button[type="submit"]' ).click();
		await dropIn( page );
		const car = await page.evaluate( measure );
		console.log( 'handling, muscle car without the pass:', JSON.stringify( car ) );
		assert.equal( car.name, 'Muscle car' );
		assert.ok( car.after3s > 10 && car.drifting === 1 && car.driftLevel >= 2 && car.driftBoost && car.hit && car.launch > 0.3 && car.landed, JSON.stringify( car ) );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );
		await page.context().close();
		page = null;

	} );

	test( 'with the pass: each drives, drifts, is thrown up by a wall and lands, its wheels spinning and the front ones steering', async () => {

		page = await newPage();
		await openGlobe( page, '?pro=1' );
		await page.locator( '#globe-ui .vehicle', { hasText: 'Muscle car' } ).click();
		await dropIn( page );
		const handling = {};
		for ( const name of CARS ) {

			if ( name !== 'Muscle car' ) await swapTo( page, name );
			const id = idOf( name );
			const ride = handling[ name ] = await page.evaluate( measure );
			assert.equal( ride.name, name );
			assert.ok( ride.after3s > 10, `${ name } didn't get going: ${ JSON.stringify( ride ) }` );
			assert.ok( ride.drifting === 1 && ride.driftLevel >= 2 && ride.driftBoost, `${ name } didn't drift: ${ JSON.stringify( ride ) }` );
			assert.ok( ride.hit && ride.launch > 0.3 && ride.landed, `${ name } wasn't thrown up and back down: ${ JSON.stringify( ride ) }` );
			assert.ok( ride.trickRate <= 1, `${ name } turns in the air at ${ ride.trickRate } of a kart's rate` );
			// Boosting flat out, supersonic, as every ride does.
			assert.ok( ride.supersonic !== null, `${ name } never went supersonic: ${ JSON.stringify( ride ) }` );

			// Its wheels: a third of a second at 36 km/h, steering right.
			const wheels = await page.evaluate( () => {

				const { driver: d } = window.drive;
				for ( const code of [ ...d.keys ] ) d.release( code );
				Object.assign( d, { east: 0, north: 0, y: 0, heading: 0, course: 0, speed: 10, vy: 0, pitch: 0, roll: 0, grounded: true, air: null, flying: false, drifting: 0, boost: null } );
				const hubs = [];
				d.entry.pivot.traverse( o => o.userData.wheel && hubs.push( o ) );
				const before = hubs.map( hub => hub.rotation.x );
				d.press( 'KeyD' );
				for ( let i = 0; i < 20; i ++ ) d.update( 1 / 60 );
				const turned = hubs.map( ( hub, i ) => ( { steers: hub.userData.wheel.steers, spun: Math.abs( hub.rotation.x - before[ i ] ), steer: hub.rotation.y } ) );
				// A tall one's body leans out of the turn (to the left, turning right: +z about its length).
				let lean = null;
				d.entry.pivot.traverse( o => o.userData.leans && ( lean = o.rotation.z ) );
				d.release( 'KeyD' );
				Object.assign( d, { speed: 0, steer: 0 } );
				return { size: [ d.length, d.width, d.height ], turned, lean };

			} );
			assert.equal( wheels.turned.length, listed.find( car => car.id === id ).trike ? 3 : 4, name );
			const spec = CAR_SPECS.find( car => car.id === id );
			if ( spec.drive.lean ) assert.ok( wheels.lean > spec.drive.lean * 0.3, `${ name } doesn't lean out of the turn: ${ wheels.lean }` );
			else assert.equal( wheels.lean, null, name );
			for ( const wheel of wheels.turned ) {

				assert.ok( wheel.spun > 0.3, `${ name }: a wheel didn't spin ${ JSON.stringify( wheels ) }` );
				// Steering right turns the front wheels right (clockwise from above), and only them.
				assert.ok( wheel.steers ? wheel.steer < - 0.05 : wheel.steer === 0, `${ name }: ${ JSON.stringify( wheels ) }` );

			}

			// As big as the importer made it.
			const { length, width, height } = listed.find( car => car.id === id ).dimensions;
			wheels.size.forEach( ( measured, i ) => assert.ok( Math.abs( measured - [ length, width, height ][ i ] ) < 0.05 * [ length, width, height ][ i ], `${ name } is ${ wheels.size } against ${ [ length, width, height ] }` ) );

			// A close look, and a picture of it under way and turning.
			await page.evaluate( () => {

				document.querySelector( '#drive-ui .keys' ).hidden = true;
				window.drive.driver.chaseZoom = 0.5;

			} );
			await page.waitForTimeout( 700 );
			await shot( page, `cars-close-${ id }` );
			await page.evaluate( () => window.drive.driver.chaseZoom = 1 );
			// From the driver's seat (C): the way it's going, over its bonnet or bars.
			await page.keyboard.press( 'KeyC' );
			await page.waitForTimeout( 700 );
			await shot( page, `cars-cab-${ id }` );
			await page.keyboard.press( 'KeyC' );
			await page.keyboard.down( 'KeyW' );
			await page.waitForFunction( () => window.drive.driver.speed > 8, null, { timeout: 20000 } );
			await page.keyboard.down( 'KeyA' );
			await page.waitForTimeout( 500 );
			await shot( page, `cars-drive-${ id }` );
			await page.keyboard.up( 'KeyA' );
			await page.keyboard.up( 'KeyW' );

		}

		console.log( 'handling of the cars:' );
		for ( const [ name, ride ] of Object.entries( handling ) ) console.log( `  ${ name.padEnd( 14 ) } top ${ ride.topSpeed } km/h, 0-100 ${ ride.zeroTo100 ?? 'never' } s, 3 s: ${ ride.after3s } km/h, turn ${ ride.turnRate }°/s at 50 km/h (slide ${ ride.slide }°), wall at 70 km/h: up ${ ride.launch } m, ${ ride.airTime } s in the air, supersonic after ${ ride.supersonic } s` );
		const cars = Object.values( handling );
		const first = FIRST.map( name => handling[ name ] );
		const { 'Neon racer': neon, 'Night cruiser': cruiser, 'Dune buggy': buggy, 'Farm truck': truck } = handling;
		// Each its own, among the first six: the night cruiser fastest, the neon racer quickest away,
		// the dune buggy thrown highest, the farm truck slowest.
		for ( const other of first ) {

			if ( other !== cruiser ) assert.ok( cruiser.topSpeed > other.topSpeed, `night cruiser ${ cruiser.topSpeed } vs ${ other.name } ${ other.topSpeed }` );
			if ( other !== neon ) assert.ok( neon.zeroTo100 < other.zeroTo100, `neon racer 0-100 ${ neon.zeroTo100 } vs ${ other.name } ${ other.zeroTo100 }` );
			if ( other !== buggy ) assert.ok( buggy.launch > other.launch, `dune buggy ${ buggy.launch } m vs ${ other.name } ${ other.launch } m` );
			if ( other !== truck ) assert.ok( truck.topSpeed < other.topSpeed && truck.after3s < other.after3s, `farm truck vs ${ other.name }` );

		}

		// And the new ones among them all: the hypercar fastest and quickest away; the formula racer
		// turning sharpest at speed; the odd small ones slowest, the lawn tractor slowest of all.
		const { Hypercar: hyper, 'Formula racer': formula, 'Lawn tractor': tractor } = handling;
		const small = [ 'Golf cart', 'Tuk-tuk', 'Lawn tractor' ].map( name => handling[ name ] );
		for ( const other of cars ) {

			if ( other !== hyper ) assert.ok( hyper.topSpeed > other.topSpeed && hyper.zeroTo100 < ( other.zeroTo100 ?? Infinity ), `hypercar vs ${ other.name }: ${ JSON.stringify( [ hyper, other ] ) }` );
			if ( other !== formula ) assert.ok( formula.turnRate > other.turnRate, `formula racer turns ${ formula.turnRate }°/s vs ${ other.name } ${ other.turnRate }` );
			if ( other !== tractor ) assert.ok( tractor.topSpeed < other.topSpeed, `lawn tractor ${ tractor.topSpeed } vs ${ other.name } ${ other.topSpeed }` );
			if ( ! small.includes( other ) ) for ( const odd of small ) assert.ok( odd.topSpeed < other.topSpeed, `${ odd.name } ${ odd.topSpeed } vs ${ other.name } ${ other.topSpeed }` );

		}

		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

	test( 'the Garage paints the cars whose paint is plain colour (colour, rims, decals); the others keep their own paint, and say so', async () => {

		await swapTo( page, 'Muscle car' );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		await page.locator( '#pause .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		await page.waitForFunction( () => window.drive.garage.preview?.model?.name === 'Muscle car', null, { timeout: 20000 } );
		const pick = ( part, id ) => garage.locator( `[data-part="${ part }"] .choice[data-id="${ id }"]` ).click();
		await pick( 'colour', 'red' );
		await pick( 'rim', 'gold' );
		await pick( 'decal', 'stripes' );
		await page.waitForTimeout( 900 );
		await shot( page, 'cars-garage-muscle-car' );
		const worn = await page.evaluate( () => {

			const { pivot } = window.drive.driver.entry;
			const body = new Set();
			const rims = new Set();
			pivot.traverse( o => {

				if ( o.userData.paint === 'body' ) body.add( o.material.color.getHexString() );
				if ( o.userData.paint === 'rim' ) rims.add( o.material.color.getHexString() );

			} );
			const decals = pivot.getObjectByName( 'decals' );
			return { body: [ ...body ], rims: [ ...rims ], decals: decals ? decals.children.reduce( ( sum, m ) => sum + m.geometry.attributes.position.count, 0 ) : 0 };

		} );
		assert.deepEqual( worn.body, [ 'd81e2c' ] );
		assert.deepEqual( worn.rims, [ 'd9a63a' ] );
		assert.ok( worn.decals > 30, JSON.stringify( worn ) );
		const paintable = listed.filter( car => car.paintable ).map( car => CAR_SPECS.find( spec => spec.id === car.id ).name );
		assert.deepEqual( paintable.sort(), [ 'Cyber muscle', 'Lawn tractor', 'Muscle car', 'Tuk-tuk' ] );
		for ( const name of CARS.slice( 1 ) ) {

			await garage.locator( '.ride-tab', { hasText: name } ).click();
			const plain = paintable.includes( name );
			await page.waitForFunction( ( [ ride, plain ] ) => window.drive.garage.preview.model?.name === ride && window.drive.garage.vehicle.paintable === plain, [ name, plain ], { timeout: 20000 } );
			if ( plain ) {

				// Repainted on the turntable, with stripes on its bodywork and a number.
				await pick( 'colour', 'white' );
				await pick( 'decal', 'stripes' );
				await page.waitForTimeout( 400 );
				const turntable = await page.evaluate( () => {

					const model = window.drive.garage.preview.model;
					const body = new Set();
					model.traverse( o => o.userData.paint === 'body' && body.add( o.material.color.getHexString() ) );
					const decals = model.getObjectByName( 'decals' );
					return { body: [ ...body ], decals: decals ? decals.children.reduce( ( sum, m ) => sum + m.geometry.attributes.position.count, 0 ) : 0 };

				} );
				assert.deepEqual( turntable.body, [ 'eef1f4' ], name );
				assert.ok( turntable.decals > 12, `${ name }: ${ JSON.stringify( turntable ) }` );
				await page.waitForTimeout( 500 );
				await shot( page, `cars-garage-${ idOf( name ) }-stripes` );
				await pick( 'decal', 'number' );
				await page.waitForTimeout( 900 );
				await shot( page, `cars-garage-${ idOf( name ) }-number` );
				await garage.locator( '.factory' ).click();
				continue;

			}

			// Only the underglow, flame, trail and horn: its paint is part of the model, and the Garage
			// says so.
			assert.ok( await garage.locator( '.paint-note' ).isVisible(), name );
			assert.match( await garage.locator( '.paint-note' ).textContent(), /keeps it: pick its underglow, boost, trail and horn/ );
			for ( const part of [ 'colour', 'finish', 'decal', 'rim' ] ) assert.equal( await garage.locator( `[data-part="${ part }"]` ).isVisible(), false, `${ name } ${ part }` );
			for ( const part of [ 'glow', 'flame', 'trail', 'horn' ] ) assert.ok( await garage.locator( `[data-part="${ part }"]` ).isVisible(), `${ name } ${ part }` );
			await page.waitForTimeout( 500 );
			await shot( page, `cars-garage-${ idOf( name ) }` );

		}

		await garage.locator( '.done' ).click();
		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		assert.deepEqual( page.errors, [] );

	} );

} );
