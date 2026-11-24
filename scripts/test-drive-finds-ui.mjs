// npm run test:drive-finds-ui: the Discoveries (src/drive-app/finds.js, docs/world-drive.md,
// "Discoveries") in a real browser, on the Vite dev server with no Maps key: on the Moon's globe its
// finds are pins (gold, cyan once found); a drop-in on Tranquility Base from the search starts the car
// about 2.5 km out, facing it; driving in to it (the frames' positions stepped toward it, under a
// live room's TELEPORT a step, through finds.update as main.js calls it each frame) opens its card,
// with its name, what you're looking at and its height in the map; the book says 1 / 21, the orrery's
// sheet "1 / 21 discovered" and the Moon's data line; while driving the pointer names the nearest one
// not yet found however far it is; a plane's pass 500 m over one collects it; and a reload keeps them.
// Every request that isn't to the local server is blocked.
//
// Uses the hooks main.js gives the tests: window.drive.finds (createFinds') and window.drive.carLatLon
// ({ lat, lon, above } of the car, or null). Needs Playwright with Chromium, as test-drive-ui.mjs
// does. TEST_VITE_PORT picks the port; TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { FINDS_ON } from '../src/drive-app/finds-data.js';
import { APPROACH, bearing, destination, distance, placeOf } from '../src/drive-app/finds-rules.js';
import { TELEPORT } from '../src/drive-app/live-protocol.js';
import { WORLDS } from '../src/drive-app/worlds.js';
import { startVite } from './worker-harness.mjs';
import { pickWorld, openWorlds, showSheet } from './worlds-ui.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5583;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const R = WORLDS.moon.radius;
const BASE_ID = 'moon-apollo-11';
const STEP = TELEPORT - 10;

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

const shot = ( page, name ) => SHOTS ? page.screenshot( { path: join( SHOTS, `${ name }.png` ), timeout: 120000 } ) : null;
const flown = page => page.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 60000 } );

describe( 'World Drive Discoveries', () => {

	let context;
	let page;

	before( async () => {

		context = await browser.newContext( { viewport: { width: 800, height: 500 } } );
		await context.addInitScript( () => {

			if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', 'go-kart' );
			localStorage.setItem( 'world-drive.pads', 'off' );
		// Trick mode on (walls bounce the car off), as the stunt tests were written for; slide mode's own test turns it off.
		if ( ! localStorage.getItem( 'world-drive.tricks' ) ) localStorage.setItem( 'world-drive.tricks', 'on' );
			// The approach to a Discovery not yet found, which the dev server leaves off for the
			// other tests (main.js's FINDS_APPROACH).
			window.worldDriveFindsTest = { approach: true };

		} );
		page = await context.newPage();
		page.errors = [];
		page.outside = [];
		page.on( 'pageerror', err => page.errors.push( err.message ) );
		await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => {

			page.outside.push( route.request().url() );
			route.abort();

		} );
		await page.goto( BASE + '/' );
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

	} );

	after( () => context?.close() );

	test( 'the Moon\'s globe: a gold pin for each find on the side in view, none on the Earth', async () => {

		assert.equal( await page.locator( '.finds-pin' ).count(), 0, 'none on the Earth' );
		await pickWorld( page, 'moon' );
		await page.waitForFunction( () => window.drive.world === 'moon', null, { timeout: 90000 } );
		await flown( page );
		await page.waitForFunction( n => document.querySelectorAll( '.finds-pin' ).length === n, FINDS_ON.moon.length, { timeout: 10000 } );
		await page.waitForFunction( () => [ ...document.querySelectorAll( '.finds-pin' ) ].some( pin => ! pin.hidden ), null, { timeout: 10000 } );
		assert.equal( await page.locator( '.finds-pin.found' ).count(), 0 );
		await shot( page, 'finds-1-globe' );

	} );

	test( 'a drop-in on Tranquility Base from the search starts the car about 2.5 km out, facing it', async () => {

		const search = page.locator( '#globe-ui .search input' );
		await search.fill( 'Apollo 11' );
		await search.press( 'Enter' );
		await page.locator( '#globe-ui .results button', { hasText: 'Tranquility Base' } ).first().click();
		await flown( page );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 180000 } );
		const car = await page.evaluate( () => window.drive.carLatLon );
		const metres = distance( car, placeOf( BASE_ID ), R );
		assert.ok( Math.abs( metres - APPROACH ) < 300, `the car is ${ Math.round( metres ) } m from it` );
		assert.equal( await page.evaluate( id => window.drive.finds.has( id ), BASE_ID ), false, 'not collected by dropping in' );
		// The pointer names it.
		await page.waitForFunction( () => /Tranquility Base · /.test( document.querySelector( '.finds-pointer-label' )?.textContent ?? '' ), null, { timeout: 10000 } );
		await shot( page, 'finds-2-approach' );

	} );

	test( 'driven in to it, its card: the name, what you\'re looking at, and its height in the map', async () => {

		const start = await page.evaluate( () => window.drive.carLatLon );
		const target = placeOf( BASE_ID );
		// Each step one frame's, as main.js passes the car's place to finds.update.
		let at = { ...start };
		for ( let i = 0; i < 200; i ++ ) {

			at = destination( at, bearing( at, target ), Math.min( STEP, distance( at, target, R ) ), R );
			if ( await page.evaluate( ( [ id, p ] ) => ( window.drive.finds.update( 0.05, { ...p, above: 0, flying: false } ), window.drive.finds.has( id ) ), [ BASE_ID, at ] ) ) break;

		}

		assert.equal( await page.evaluate( id => window.drive.finds.has( id ), BASE_ID ), true );
		const card = page.locator( '.finds-card' );
		await card.waitFor();
		const text = await card.innerText();
		assert.match( text, /Tranquility Base/ );
		assert.match( text, /What you're looking at:/ );
		assert.match( text, /In this map: [\d,]+ m (above|below) the Moon's 1,737\.4 km reference sphere/ );
		assert.match( text, /You're driving on: NASA LRO: LOLA heights/ );
		assert.match( text, new RegExp( `1 / ${ FINDS_ON.moon.length }` ) );
		await shot( page, 'finds-3-card' );

	} );

	test( 'the book says 1 / 21, and the orrery\'s sheet the count and the Moon\'s data', async () => {

		await page.locator( '.finds-card .finds-open' ).click();
		const book = page.locator( 'dialog.finds-book' );
		await book.waitFor();
		// Opened over the drive, which it paused: no keys reach the car behind it.
		assert.equal( await page.evaluate( () => window.drive.mode ), 'paused' );
		assert.match( await book.locator( '.finds-tab[aria-pressed="true"]' ).textContent(), new RegExp( `Moon 1 / ${ FINDS_ON.moon.length }` ) );
		assert.equal( await book.locator( '.finds-tile.found' ).count(), 1 );
		assert.match( await book.locator( '.finds-footer' ).textContent(), /LOLA/ );
		await shot( page, 'finds-4-book' );
		await book.locator( '.close' ).click();
		await page.evaluate( () => window.drive.resume() );
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 10000 } );
		// The pointer now names another.
		await page.waitForFunction( () => ! /Tranquility Base/.test( document.querySelector( '.finds-pointer-label' )?.textContent ?? 'Tranquility Base' ), null, { timeout: 10000 } );

	} );

	test( 'a plane\'s pass 500 m over one collects it; a pass at 2.5 km doesn\'t', async () => {

		const id = 'moon-apollo-17';
		const place = placeOf( id );
		// Put down 2 km west (so it's armed: the 1 km rule), then flown east right over it, 600 m either
		// side, in two frames.
		const pass = above => page.evaluate( ( { far, from, to, above } ) => {

			window.drive.finds.placed( far );
			window.drive.finds.update( 0.05, { ...from, above, flying: true } );
			window.drive.finds.update( 0.05, { ...to, above, flying: true } );

		}, { far: destination( place, 270, 2000, R ), from: destination( place, 270, 600, R ), to: destination( place, 90, 600, R ), above } );
		assert.equal( await page.evaluate( () => window.drive.mode ), 'driving' );
		await pass( 2500 );
		assert.equal( await page.evaluate( i => window.drive.finds.has( i ), id ), false );
		await pass( 500 );
		assert.equal( await page.evaluate( i => window.drive.finds.has( i ), id ), true );

	} );

	test( 'a reload keeps them, and the orrery\'s sheet counts them', async () => {

		await page.reload();
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
		assert.deepEqual( await page.evaluate( () => window.drive.finds.ids.sort() ), [ BASE_ID, 'moon-apollo-17' ].sort() );
		await openWorlds( page );
		await showSheet( page, 'moon' );
		await page.waitForFunction( () => /2 \/ \d+ discovered/.test( document.querySelector( '#orrery' )?.innerText ?? '' ), null, { timeout: 10000 } );
		assert.match( await page.locator( '#orrery' ).innerText(), /laser altimeter/ );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

} );
