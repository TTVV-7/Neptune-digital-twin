// node --test scripts/test-drive-lens-ui.mjs: World Drive's data lens (src/drive-app/lens.js, body.js,
// docs/world-drive.md, "Data lens") in a real browser, on the Vite dev server with no Maps key: on
// Mars's globe L colours the ground by MOLA's heights (the material's lensAmount eased to 1, the scale
// bar naming MOLA and the areoid), Olympus Mons's summit yellow with it and Mars's own colour
// without; L again takes it off; none of it on the Earth; driving, the height under the car and the
// "Around me" / "Whole world" switch moving the scale's labels; and on or off kept across a reload.
// The numbers themselves (the texture, its rows, the labels) are test-drive-lens.mjs's, in node.
//
// Needs Playwright with Chromium, as test-drive-ui.mjs does. TEST_VITE_PORT picks the port;
// TEST_SCREENSHOTS=<folder> saves pictures. Slow: Mars's ground is drawn without a GPU.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { MARS_SPOTS } from '../src/drive-app/mars-places.js';
import { startVite } from './worker-harness.mjs';
import { pickWorld } from './worlds-ui.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5587;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const CURIOSITY = MARS_SPOTS.find( spot => spot.id === 'mars-curiosity' );
const VIEW = { width: 800, height: 500 };

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

const flown = page => page.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 60000 } );
const shot = ( page, name ) => SHOTS ? page.screenshot( { path: join( SHOTS, `${ name }.png` ), timeout: 120000 } ) : null;
const amount = page => page.evaluate( () => window.drive.bodies.mars.material.uniforms.lensAmount.value );
const ticks = page => page.locator( '.lens .lens-ticks span' ).allTextContents();

// The mean colour (0-255 each) of a small square in the middle of the screen, as drawn.
async function middleColour( page ) {

	const size = 24;
	const png = await page.screenshot( { clip: { x: VIEW.width / 2 - size / 2, y: VIEW.height / 2 - size / 2, width: size, height: size }, timeout: 120000 } );
	const { data, info } = await sharp( png ).removeAlpha().raw().toBuffer( { resolveWithObject: true } );
	const sum = [ 0, 0, 0 ];
	for ( let i = 0; i < data.length; i += info.channels ) for ( let j = 0; j < 3; j ++ ) sum[ j ] += data[ i + j ];
	const n = data.length / info.channels;
	return sum.map( v => v / n );

}

// Two frames drawn (the renderer draws on its own loop; SwiftShader is slow).
const drawn = page => page.evaluate( () => new Promise( done => requestAnimationFrame( () => requestAnimationFrame( done ) ) ) );

describe( 'the data lens', () => {

	let context;
	let page;

	before( async () => {

		context = await browser.newContext( { viewport: VIEW } );
		await context.addInitScript( () => {

			if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', 'go-kart' );
			localStorage.setItem( 'world-drive.pads', 'off' );

		} );
		page = await context.newPage();
		page.errors = [];
		page.on( 'pageerror', err => page.errors.push( err.message ) );
		await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
		await page.goto( BASE + '/' );
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

	} );

	after( () => context?.close() );

	test( 'not on the Earth: no button, and L does nothing', async () => {

		assert.equal( await page.evaluate( () => window.drive.world ), 'earth' );
		assert.equal( await page.locator( '.lens' ).isVisible(), false );
		await page.keyboard.press( 'KeyL' );
		assert.equal( await page.evaluate( () => window.drive.lens.on ), false );

	} );

	test( 'on Mars\'s globe, L colours the ground by MOLA\'s heights, and Olympus Mons\'s summit turns yellow', async () => {

		await pickWorld( page, 'mars' );
		await page.waitForFunction( () => window.drive.world === 'mars', null, { timeout: 90000 } );
		await flown( page );
		await page.locator( '.lens .lens-button' ).waitFor( { state: 'visible' } );
		// Straight over the summit (as the grid has it), close enough that it fills the middle.
		await page.evaluate( () => window.drive.globe.place( { lat: 18.4, lon: - 133.4, height: 0, distance: 300000, heading: 0, pitch: - 90 } ) );
		await drawn( page );
		const before = await middleColour( page );
		await page.keyboard.press( 'KeyL' );
		await page.locator( '.lens .lens-panel' ).waitFor( { state: 'visible', timeout: 30000 } );
		await page.waitForFunction( () => window.drive.bodies.mars.material.uniforms.lensAmount.value === 1, null, { timeout: 30000 } );
		await drawn( page );
		const after = await middleColour( page );
		await shot( page, 'lens-mars-globe' );
		const source = await page.locator( '.lens .lens-source' ).textContent();
		assert.match( source, /MOLA/ );
		assert.match( source, /areoid/ );
		assert.match( await page.locator( '.lens .lens-what' ).textContent(), /areoid.*every 1,000 m/ );
		assert.equal( await page.locator( '.lens-button' ).getAttribute( 'aria-pressed' ), 'true' );
		// On the globe: the whole world, no readout, no range switch.
		assert.equal( await page.locator( '.lens .lens-range' ).isVisible(), false );
		assert.equal( await page.locator( '.lens .lens-here' ).isVisible(), false );
		const range = await page.evaluate( () => window.drive.lens.range );
		const labels = await ticks( page );
		assert.ok( labels.length >= 3 && labels[ 0 ].startsWith( '−' ), labels.join( ' | ' ) );
		assert.ok( range.high > 20000 && range.low < - 7000, JSON.stringify( range ) );
		// Viridis's top is yellow (green about as strong as red, little blue); Mars's own ground there
		// is a dusty red-brown (green well under red).
		const yellowish = ( [ r, g, b ] ) => g > 0.75 * r && b < 0.6 * g && g > 60;
		assert.ok( yellowish( after ), `with the lens: ${ after }` );
		assert.ok( ! yellowish( before ), `without: ${ before }` );

	} );

	test( 'L again takes it off', async () => {

		await page.keyboard.press( 'KeyL' );
		await page.waitForFunction( () => window.drive.bodies.mars.material.uniforms.lensAmount.value === 0, null, { timeout: 30000 } );
		assert.equal( await page.locator( '.lens .lens-panel' ).isVisible(), false );
		assert.equal( await page.evaluate( () => window.drive.lens.on ), false );
		// The button stays, to put it back on.
		assert.equal( await page.locator( '.lens .lens-button' ).isVisible(), true );

	} );

	test( 'driving: the height under the car, and "Around me" against "Whole world"', async () => {

		await page.locator( '.lens .lens-button' ).click();
		await page.waitForFunction( () => window.drive.lens.on && window.drive.lens.range, null, { timeout: 30000 } );
		await page.locator( '#globe-ui .spots button', { hasText: CURIOSITY.name } ).click();
		await flown( page );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 180000 } );
		await page.locator( '.lens .lens-here' ).waitFor( { state: 'visible', timeout: 30000 } );
		const here = await page.locator( '.lens .lens-here' ).textContent();
		// Gale's floor, at Bradbury Landing, is about 4.5 km under the areoid.
		assert.match( here, /^Here: [\d,]+ m below the datum · MOLA$/ );
		const metres = Number( /([\d,]+) m/.exec( here )[ 1 ].replace( /,/g, '' ) );
		assert.ok( metres > 3500 && metres < 5500, here );
		await shot( page, 'lens-mars-driving' );
		// Around me by default while driving: 5 km either side, lines every 250 m.
		assert.equal( await page.locator( '.lens [data-range="near"]' ).getAttribute( 'aria-pressed' ), 'true' );
		assert.match( await page.locator( '.lens .lens-what' ).textContent(), /every 250 m/ );
		const near = await ticks( page );
		assert.equal( await amount( page ), 1 );
		assert.equal( await page.evaluate( () => window.drive.bodies.mars.material.uniforms.lensStep.value ), 250 );
		await page.locator( '.lens [data-range="world"]' ).click();
		const whole = await ticks( page );
		assert.notDeepEqual( whole, near );
		assert.match( await page.locator( '.lens .lens-what' ).textContent(), /every 1,000 m/ );
		assert.equal( await page.evaluate( () => window.drive.bodies.mars.material.uniforms.lensStep.value ), 1000 );
		await page.locator( '.lens [data-range="near"]' ).click();
		assert.deepEqual( await ticks( page ), near );

	} );

	test( 'kept across a reload, and no errors', async () => {

		await page.reload();
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
		assert.equal( await page.evaluate( () => window.drive.lens.on ), true );
		assert.deepEqual( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.lens' ) ) ), { on: true, range: 'near' } );
		assert.deepEqual( page.errors, [] );

	} );

} );
