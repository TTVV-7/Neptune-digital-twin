// npm run test:city-drive-ui: City Drive (/city/, src/drive-app/city/) in a real browser against
// World Drive's dev server, with every request that isn't to it blocked. The city loads and builds
// with its menu, starts and the free rides; a ride is put down on a street and drives along it; the
// bridges are decks over the water that the ground under them is found on; and the OpenStreetMap
// credit shows.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port; TEST_SCREENSHOTS=<folder> saves
// pictures.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ROOT } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5192;
const BASE = `http://localhost:${ PORT }`;
const SHOTS = process.env.TEST_SCREENSHOTS;

let vite;
let browser;
let page;
const errors = [];

before( async () => {

	const { chromium } = require( 'playwright' );
	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	// Vite itself (not through npx, whose own child would outlive it and keep the test running).
	vite = spawn( process.execPath, [ join( ROOT, 'node_modules', 'vite', 'bin', 'vite.js' ), '--config', 'vite.drive.config.js', '--port', String( PORT ), '--strictPort' ], {
		cwd: ROOT, stdio: [ 'ignore', 'pipe', 'pipe' ], env: { ...process.env, TEST_VITE_CACHE: join( ROOT, 'node_modules', `.vite-city-${ PORT }` ) },
	} );
	await new Promise( ( resolve, reject ) => {

		const timer = setTimeout( () => reject( new Error( 'The dev server didn\'t start' ) ), 60000 );
		vite.stdout.on( 'data', d => String( d ).includes( `${ PORT }` ) && ( clearTimeout( timer ), resolve() ) );

	} );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	page = await browser.newPage( { viewport: { width: 1280, height: 760 } } );
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	page.on( 'console', m => m.type() === 'error' && errors.push( m.text() ) );
	await page.route( '**/*', route => {

		const url = route.request().url();
		return url.startsWith( BASE ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

	} );

} );

after( async () => {

	await browser?.close();
	vite?.kill();

} );

async function shot( name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

test( 'the city loads with its menu, starts, free rides and credit', async () => {

	await page.goto( `${ BASE }/city/` );
	await page.waitForFunction( () => ! document.getElementById( 'menu' ).hidden, null, { timeout: 120000 } );
	const menu = await page.evaluate( () => ( {
		cities: [ ...document.querySelectorAll( '#city option' ) ].map( o => o.value ),
		starts: [ ...document.querySelectorAll( '#start option' ) ].map( o => o.textContent ),
		rides: [ ...document.querySelectorAll( '#ride option' ) ].map( o => o.value ),
		credit: document.getElementById( 'credit' ).textContent,
		url: location.search,
	} ) );
	assert.deepEqual( menu.cities, [ 'vancouver' ] );
	assert.ok( menu.starts.includes( 'Robson Street' ) && menu.starts.includes( 'Stanley Park' ), menu.starts.join() );
	assert.ok( menu.rides.includes( 'go-kart' ) && menu.rides.includes( 'pickup-truck' ), `the free rides, from the site's root: ${ menu.rides }` );
	assert.match( menu.credit, /OpenStreetMap contributors/ );
	assert.equal( menu.url, '?city=vancouver' );
	await shot( 'city-menu' );

} );

test( 'a ride is put down on a street and drives along it', async () => {

	await page.selectOption( '#start', '0' );
	await page.click( '#go' );
	await page.waitForFunction( () => window.cityDrive.driver.active, null, { timeout: 60000 } );
	const start = await page.evaluate( () => ( { east: window.cityDrive.driver.east, north: window.cityDrive.driver.north, y: window.cityDrive.driver.y } ) );
	assert.ok( Math.abs( start.y ) < 0.5, `on the street, not under or over it (${ start.y.toFixed( 2 ) } m)` );
	// Held down till it's gone 20 m (software rendering can be slow, so by distance, not time).
	await page.keyboard.down( 'KeyW' );
	const went = await page.waitForFunction( ( { east, north } ) => Math.hypot( window.cityDrive.driver.east - east, window.cityDrive.driver.north - north ) > 20, start, { timeout: 60000 } ).then( () => true, () => false );
	await shot( 'city-driving' );
	await page.keyboard.up( 'KeyW' );
	const end = await page.evaluate( () => ( { east: window.cityDrive.driver.east, north: window.cityDrive.driver.north, y: window.cityDrive.driver.y } ) );
	const moved = Math.hypot( end.east - start.east, end.north - start.north );
	assert.ok( went, `it drove (${ moved.toFixed( 1 ) } m)` );
	assert.ok( end.y > - 1, `still on the ground, not fallen through (${ end.y.toFixed( 2 ) } m)` );

	// Esc: the menu again, with Resume.
	await page.keyboard.press( 'Escape' );
	await page.waitForFunction( () => ! document.getElementById( 'menu' ).hidden );
	assert.equal( await page.evaluate( () => document.getElementById( 'resume' ).hidden ), false );

} );

test( 'bridges are decks high over the water, found as the ground', async () => {

	const decks = await page.evaluate( () => {

		const { city, groundAt } = window.cityDrive;
		// The highest point of each of a few bridges, and what's found straight down there.
		const bridges = city.data.roads.filter( r => r[ 3 ] ).sort( ( a, b ) => Math.max( ...b[ 3 ] ) - Math.max( ...a[ 3 ] ) ).slice( 0, 4 );
		return bridges.map( ( [ line, , , heights ] ) => {

			const i = heights.indexOf( Math.max( ...heights ) );
			const hit = groundAt( line[ i * 2 ] / 10, line[ i * 2 + 1 ] / 10 );
			return { want: heights[ i ] / 10, got: hit?.y ?? null, what: hit?.what };

		} );

	} );
	assert.ok( decks.length >= 3 );
	for ( const { want, got } of decks ) {

		assert.ok( want > 10, `a bridge rises well over the water (${ want } m)` );
		assert.ok( got !== null && Math.abs( got - want ) < 1.5, `its deck is found at ${ got?.toFixed( 1 ) } m, wanted about ${ want } m` );

	}

} );

test( 'no page errors', () => {

	assert.deepEqual( errors, [] );

} );
