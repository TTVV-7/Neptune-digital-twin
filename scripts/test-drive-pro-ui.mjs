// node --test scripts/test-drive-pro-ui.mjs: World Drive's Supporter Pass content (docs/world-drive.md)
// in a real browser, on the Vite dev server with no Maps key (the test globe and the flat test pad,
// as test-drive-ui.mjs uses). Without the pass: the four pass rides are listed with their badge and
// can't be driven, picking one (or a locked Garage choice) opens the pass's sheet, the free
// choices work, and the free game drives as it did. ?pro=1 only counts on this computer. With
// ?pro=1 here: each new ride drives, drifts, is thrown up by a wall and lands, and their handling
// is measured against the kart's (top speed, 0 to 100 km/h, turning, how high the same wall
// throws them); the hovercraft hovers with no wheels; the Garage's paint, decals, flame and trail
// go on the ride being driven and are still there after a reload; what a trail and the booster
// cost a frame; and the Garage on a phone. Everything off this machine is blocked.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port; TEST_SCREENSHOTS=<folder> saves
// pictures; the handling it measures is printed.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5531;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const RIDES = [ 'Sports coupe', 'Monster truck', 'City bus', 'Hovercraft' ];

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

async function newPage( { viewport = { width: 1280, height: 800 }, touch = false } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
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
	const out = { name: d.entry.state.name };

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
		assert.deepEqual( await panel.locator( '.vehicle b' ).allTextContents(), [ 'Go-kart', 'Pickup', 'Haul truck', ...RIDES ] );
		assert.deepEqual( await panel.locator( '.vehicle.locked b' ).allTextContents(), RIDES );
		assert.deepEqual( await panel.locator( '.vehicle .pro-badge' ).allTextContents(), RIDES.map( () => '⭐ Supporter Pass' ) );
		assert.equal( await page.evaluate( async () => ( await import( '/src/drive-app/pro.js' ) ).isPro() ), false );

		await panel.locator( '.vehicle', { hasText: 'Monster truck' } ).click();
		await page.locator( '#pass' ).waitFor();
		assert.equal( await panel.locator( '.vehicle.picked b' ).textContent(), 'Go-kart' );
		const sheet = page.locator( '#pass' );
		assert.match( await sheet.textContent(), /Four more rides[\s\S]*whole Garage[\s\S]*on the leaderboard[\s\S]*30 drives a day[\s\S]*Instead of 8/ );
		assert.equal( await sheet.locator( '.ride-icon' ).count(), 4 );
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
		// Three colours free, nine locked; gloss free; every decal but none locked; orange flame free.
		assert.equal( await garage.locator( '[data-part="colour"] .choice:not(.locked)' ).count(), 3 );
		assert.equal( await garage.locator( '[data-part="colour"] .choice.locked' ).count(), 9 );
		assert.deepEqual( await garage.locator( '[data-part="finish"] .choice:not(.locked)' ).allTextContents(), [ 'Gloss⭐' ] );
		assert.deepEqual( await garage.locator( '[data-part="decal"] .choice:not(.locked)' ).allTextContents(), [ 'None⭐' ] );
		assert.equal( await garage.locator( '[data-part="flame"] .choice:not(.locked)' ).count(), 1 );
		assert.deepEqual( await garage.locator( '[data-part="trail"] .choice:not(.locked)' ).allTextContents(), [ 'None⭐' ] );
		assert.equal( await garage.locator( '[data-part="colour"] h3 .pro-badge' ).textContent(), '⭐ Supporter Pass' );

		// Locked: the pass, and nothing changes.
		await garage.locator( '[data-part="colour"] .choice[data-id="violet"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pass' ).waitFor( { state: 'hidden' } );
		assert.ok( await garage.isVisible(), 'Esc on the pass closed the Garage too' );
		await garage.locator( '[data-part="flame"] .choice[data-id="rainbow"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		// Free: on.
		await garage.locator( '[data-part="colour"] .choice[data-id="red"]' ).click();
		const saved = await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.garage' ) )[ 'go-kart' ] );
		assert.deepEqual( { colour: saved.colour, flame: saved.flame, trail: saved.trail, decal: saved.decal }, { colour: 'red', flame: 'orange', trail: 'none', decal: 'none' } );
		assert.ok( await garage.locator( '[data-part="colour"] .choice[data-id="red"]' ).evaluate( b => b.classList.contains( 'on' ) ) );
		await page.waitForTimeout( 400 );
		await shot( page, 'pro-garage-free' );

		// A pass ride turns on the turntable, with a word on the pass; anything picked opens it.
		await garage.locator( '.ride-tab', { hasText: 'Monster truck' } ).click();
		await page.waitForFunction( () => window.drive.garage.preview.model?.name === 'Monster truck', null, { timeout: 20000 } );
		assert.ok( await garage.locator( '.locked-banner' ).isVisible() );
		await garage.locator( '[data-part="decal"] .choice[data-id="none"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		await page.waitForTimeout( 300 );
		await shot( page, 'pro-garage-locked-ride' );
		// The trucks keep their paint: flame and trail only.
		await garage.locator( '.ride-tab', { hasText: 'Pickup' } ).click();
		await page.waitForFunction( () => window.drive.garage.preview.model && window.drive.garage.vehicle.id === 'pickup-truck' && window.drive.garage.vehicle.paintable === false, null, { timeout: 30000 } );
		assert.ok( await garage.locator( '.paint-note' ).isVisible() );
		assert.equal( await garage.locator( '[data-part="colour"]' ).isVisible(), false );
		assert.ok( await garage.locator( '[data-part="flame"]' ).isVisible() );
		await garage.locator( '.done' ).click();
		await garage.waitFor( { state: 'hidden' } );

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

			const all = JSON.parse( localStorage.getItem( 'world-drive.garage' ) );
			Object.assign( all[ 'go-kart' ], { colour: 'violet', finish: 'metallic', decal: 'flames', flame: 'rainbow', trail: 'ribbon' } );
			localStorage.setItem( 'world-drive.garage', JSON.stringify( all ) );
			localStorage.setItem( 'world-drive.vehicle', 'monster-truck' );

		} );
		await openGlobe( page );
		// The saved pass ride can't be driven: the kart is.
		assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Go-kart' );
		await dropIn( page );
		const kart = await page.evaluate( () => {

			const { driver: d } = window.drive;
			const body = [];
			d.entry.pivot.traverse( o => o.userData.paint === 'body' && body.push( o.material ) );
			return {
				name: d.entry.state.name, handling: d.spec.handling ?? null, fx: d.spec.fx,
				grip: d.handling.grip, turn: d.handling.turn, gravity: d.handling.gravity, launch: d.handling.launch,
				// Not violet, metallic, flames or a rainbow ribbon without the pass: as it came.
				colours: [ ...new Set( body.map( m => m.color.getHexString() ) ) ], physical: body.some( m => m.isMeshPhysicalMaterial ), decals: !! d.entry.pivot.getObjectByName( 'decals' ),
			};

		} );
		assert.deepEqual( kart, { name: 'Go-kart', handling: null, fx: { flame: 'orange', trail: null }, grip: 12, turn: [ 150, 55 ], gravity: 1, launch: 1, colours: [ 'ff4a1c' ], physical: false, decals: false } );
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

		}

		console.log( 'handling with the pass:' );
		for ( const [ name, ride ] of Object.entries( handling ) ) console.log( `  ${ name.padEnd( 14 ) } top ${ ride.topSpeed } km/h, 0-100 ${ ride.zeroTo100 ?? 'never' } s, 3 s: ${ ride.after3s } km/h, turn ${ ride.turnRate }°/s at 50 km/h (slide ${ ride.slide }°), wall at 70 km/h: up ${ ride.launch } m, ${ ride.airTime } s in the air` );
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
			for ( let i = 0; i < 30; i ++ ) d.update( 1 / 60 );
			// Tyres are the rides' rubber; the skirt is a rubber of its own.
			let tyres = 0;
			pivot.traverse( o => o.isMesh && o.material.color?.getHex() === 0x17181a && tyres ++ );
			const hull = new d.ownBox.constructor().setFromObject( pivot.getObjectByName( 'hover' ) );
			return { name: d.entry.state.name, tyres, gap: hull.min.y - d.y, grounded: d.grounded };

		} );
		assert.equal( hover.name, 'Hovercraft' );
		assert.equal( hover.tyres, 0 );
		assert.ok( hover.gap > 0.1 && hover.gap < 0.3 && hover.grounded, JSON.stringify( hover ) );
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

	test( 'the Garage puts paint, decals, flame and trail on the ride, and they stay after a reload', async () => {

		await swapTo( page, 'Sports coupe' );
		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause' ).waitFor();
		await page.locator( '#pause .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		await page.waitForFunction( () => window.drive.garage.preview?.model?.name === 'Sports coupe', null, { timeout: 20000 } );
		assert.equal( await garage.locator( '.ride-tab[aria-pressed="true"]' ).textContent(), 'Sports coupe⭐' );
		assert.equal( await garage.locator( '.choice.locked' ).count(), 0 );
		const pick = ( part, id ) => garage.locator( `[data-part="${ part }"] .choice[data-id="${ id }"]` ).click();
		await pick( 'colour', 'violet' );
		await pick( 'finish', 'metallic' );
		await pick( 'decal', 'number' );
		await garage.locator( '.number input' ).fill( '42' );
		await garage.locator( '.number input' ).press( 'Tab' );
		await pick( 'rim', 'gold' );
		await pick( 'flame', 'blue' );
		await pick( 'trail', 'ribbon' );
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
			return {
				body: [ ...new Set( body.map( m => `${ m.color.getHexString() } ${ m.metalness }` ) ) ], rims: [ ...new Set( rims.map( m => m.color.getHexString() ) ) ],
				decals: decals ? decals.children.reduce( ( sum, m ) => sum + m.geometry.attributes.position.count, 0 ) : 0,
			};

		} );
		const before = await worn();
		assert.deepEqual( before.body, [ '7b3fe4 0.7' ] );
		assert.deepEqual( before.rims, [ 'd9a63a' ] );
		assert.ok( before.decals > 30, JSON.stringify( before ) );
		// A close look at each of the others, in a look of its own.
		for ( const [ name, colour, decal, trail ] of [ [ 'Monster truck', 'black', 'flames', 'smoke' ], [ 'City bus', 'teal', 'checker', 'none' ], [ 'Hovercraft', 'pink', 'number', 'sparkle' ] ] ) {

			await garage.locator( '.ride-tab', { hasText: name } ).click();
			await page.waitForFunction( ride => window.drive.garage.preview.model?.name === ride, name, { timeout: 20000 } );
			await pick( 'colour', colour );
			await pick( 'decal', decal );
			await pick( 'trail', trail );
			await page.waitForTimeout( 900 );
			await shot( page, `pro-garage-${ name.toLowerCase().replace( ' ', '-' ) }` );

		}

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
		assert.deepEqual( fx.spec, { flame: 'blue', trail: { kind: 'ribbon', colour: 0xeef1f4 } } );
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
		assert.deepEqual( await page.evaluate( () => window.drive.driver.spec.fx ), fx.spec );
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

} );

describe( 'The Garage on a phone', () => {

	test( 'it fills the screen, the ride and its choices fit across, and it closes', async () => {

		const page = await newPage( { viewport: { width: 390, height: 844 }, touch: true } );
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
				wide: Math.max( document.querySelector( '#garage' ).scrollWidth, document.querySelector( '#garage .options' ).scrollWidth ), swatch: box( '#garage .choice.swatch' ).width,
			};

		} );
		assert.deepEqual( layout.sheet, [ 390, 844 ] );
		assert.ok( layout.stage > 200 && layout.done <= 844 && layout.wide <= 390 && layout.swatch >= 32, JSON.stringify( layout ) );
		await shot( page, 'pro-phone-garage' );
		await garage.locator( '[data-part="trail"] .choice[data-id="sparkle"]' ).tap();
		await page.waitForTimeout( 900 );
		await shot( page, 'pro-phone-garage-sparkle' );
		await garage.locator( '.options' ).evaluate( el => el.scrollTop = el.scrollHeight );
		await shot( page, 'pro-phone-garage-scrolled' );
		await garage.locator( '.done' ).tap();
		await garage.waitFor( { state: 'hidden' } );
		assert.deepEqual( page.errors, [] );
		await page.context().close();

	} );

} );
