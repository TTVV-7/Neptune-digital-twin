// npm run test:plant-ui: the plant built in code, in a real browser against the Vite dev server
// with no Google tiles; every request that isn't to the local server is blocked. Generators,
// compressors, the fuel tank, the mobile cranes, the telehandlers and the tower crane: each one's
// card and thumbnail, placed, turned, the size it's drawn at against its real size, saved and back
// after a reload. The tower crane rebuilt from the numbers in its P panel, and its reach circle
// draped on the ground, left out of its size, turned off and on and saved. The drivable ones
// driven with V, with the cameras kept out of the machine and the cab camera in the cab.
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev server that's already running
// (started without a Maps key); TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5198;
const SHOTS = process.env.TEST_SCREENSHOTS;

// Each item's size as its card gives it (longest side first, then the other, then height), in
// metres: overall, drawbar or forks included, and for the cranes as set up for work. See
// docs/equipment.md for what each is based on.
const SIZES = {
	'generator-20kva': [ 3.05, 1.5, 1.9 ],
	'generator-60kva': [ 3.9, 1.8, 2.2 ],
	'generator-150kva': [ 5.05, 2.1, 2.55 ],
	'genset-500kva-container': [ 6.1, 2.55, 3.7 ],
	'fuel-tank-4000l': [ 2.5, 1.7, 2.1 ],
	'compressor-185cfm': [ 3.6, 1.6, 1.7 ],
	'compressor-375cfm': [ 4.3, 1.9, 2.0 ],
	'compressor-900cfm': [ 5.7, 2.2, 2.5 ],
	'light-tower': [ 3.45, 2.65, 9.0 ],
	'crane-rough-terrain-40t': [ 14.5, 7.0, 22.0 ],
	'crane-carry-deck-8t': [ 10.7, 2.3, 6.3 ],
	'boom-truck-30t': [ 18.0, 6.9, 24.2 ],
	'crane-spider-3t': [ 5.9, 4.6, 8.7 ],
	'telehandler-compact-5500lb': [ 4.9, 1.9, 2.0 ],
	'telehandler-12k': [ 8.4, 2.55, 2.75 ],
	'tower-crane': [ 67.3, 6.5, 52.9 ],
};
const POWER = [ 'generator-20kva', 'generator-60kva', 'generator-150kva', 'genset-500kva-container', 'fuel-tank-4000l', 'compressor-185cfm', 'compressor-375cfm', 'compressor-900cfm', 'light-tower' ];
const DRIVABLE = [ 'crane-rough-terrain-40t', 'crane-carry-deck-8t', 'boom-truck-30t', 'crane-spider-3t', 'telehandler-compact-5500lb', 'telehandler-12k' ];
// Where each machine's driver sits in its build, as in crane-models.js: the cab camera goes there.
const CABS = {
	'crane-rough-terrain-40t': [ - 0.87, 3.0, - 1.0 ],
	'crane-carry-deck-8t': [ - 0.77, 2.15, - 1.65 ],
	'boom-truck-30t': [ - 0.5, 2.55, - 2.9 ],
	'crane-spider-3t': [ 0, 1.75, 1.1 ],
	'telehandler-compact-5500lb': [ - 0.46, 1.632, 0.07 ],
	'telehandler-12k': [ - 0.725, 2.023, 0.34 ],
};

let browser;
let vite;
let page;
let base;
const errors = [];

before( async () => {

	let chromium;
	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		throw new Error( 'Playwright is needed: npm i -D playwright && npx playwright install chromium' );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	base = process.env.TEST_BASE;
	if ( ! base ) {

		vite = await startVite( PORT );
		base = vite.base;

	}

	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	page = await browser.newPage( { viewport: { width: 1280, height: 800 } } );
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	await page.route( '**/*', route => {

		const url = route.request().url();
		return url.startsWith( base ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

	} );
	await openApp();
	await page.evaluate( () => {

		const { models } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );

	} );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function openApp() {

	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.towerCranes );

}

async function library( open ) {

	await page.evaluate( open => {

		if ( window.twin.sidebar.isOpen() !== open ) document.getElementById( 'library-toggle' ).click();

	}, open );

}

async function look( { east, north, up = 0, distance, from, elevation } ) {

	await page.evaluate( ( { east, north, up, distance, from, elevation } ) => {

		const { controls, camera } = window.twin;
		const r = Math.PI / 180;
		const h = distance * Math.cos( elevation * r );
		const ce = east + h * Math.sin( from * r );
		const cn = north + h * Math.cos( from * r );
		const heading = ( Math.atan2( east - ce, north - cn ) / r + 360 ) % 360;
		controls.setMode( 'fly' );
		controls.setPose( camera.position.clone().set( - ce, up + distance * Math.sin( elevation * r ), cn ), heading, - elevation );

	}, { east, north, up, distance, from, elevation } );

}

async function shot( name ) {

	await page.waitForTimeout( 1200 );
	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

const near = ( actual, expected, share = 0.05 ) => Math.abs( actual - expected ) <= expected * share;

// Place library items from code, as the sidebar does: [ { id, east, north, heading } ].
async function place( items ) {

	return page.evaluate( async items => {

		const { models } = window.twin;
		const { itemConfig, loadLibrary } = await import( '/src/library.js' );
		const library = await loadLibrary();
		for ( const { id, east, north, heading } of items ) await models.load( itemConfig( library.find( i => i.id === id ), { east, north, heading, up: null } ) );

	}, items );

}

// What's placed: each entry's library id, where it is and its size as drawn, in metres.
async function placed() {

	return page.evaluate( () => window.twin.models.entries.filter( e => ! e.placing ).map( e => {

		const { min, max } = e.footprint;
		const s = e.state.scale;
		const [ x, z, y ] = [ ( max.x - min.x ) * s, ( max.z - min.z ) * s, ( max.y - min.y ) * s ];
		return { id: e.library, kind: e.kind, east: e.state.east, north: e.state.north, heading: e.state.heading, params: e.params, size: [ Math.max( x, z ), Math.min( x, z ), y ] };

	} ) );

}

test( 'cards: every new item is listed with its thumbnail and real size', async () => {

	await library( true );
	await page.waitForFunction( ids => ids.every( id => document.querySelector( `#library .card[data-item="${ id }"] img` )?.src.startsWith( 'data:image/png' ) ), Object.keys( SIZES ) );
	const cards = await page.evaluate( ids => ids.map( id => {

		const card = document.querySelector( `#library .card[data-item="${ id }"]` );
		let heading = card.previousElementSibling;
		while ( heading.tagName !== 'H3' ) heading = heading.previousElementSibling;
		return { id, name: card.querySelector( '.name' ).textContent, dims: card.querySelector( '.dims' ).textContent, category: heading.textContent, thumb: card.querySelector( 'img' ).src.length };

	} ), Object.keys( SIZES ) );
	for ( const { id, name, dims, category, thumb } of cards ) {

		const size = dims.match( /[\d.]+/g ).map( Number );
		SIZES[ id ].forEach( ( expected, i ) => assert.ok( near( size[ i ], expected ), `${ name }: ${ dims }, expected about ${ SIZES[ id ].join( ' × ' ) }` ) );
		// A blank render is a few hundred bytes of PNG.
		assert.ok( thumb > 3000, `${ name } has a thumbnail` );
		assert.equal( category, POWER.includes( id ) ? 'Power & air' : id.startsWith( 'telehandler' ) ? 'Material handling' : 'Cranes & lifts', name );

	}

	console.log( cards.map( c => `${ c.category } · ${ c.name }: ${ c.dims }` ).join( '\n' ) );
	if ( SHOTS ) {

		await page.evaluate( () => document.querySelector( '#library .card[data-item="crane-carry-deck-8t"]' ).scrollIntoView() );
		await shot( 'cards-cranes' );
		await page.evaluate( () => document.querySelector( '#library .card[data-item="compressor-185cfm"]' ).scrollIntoView() );
		await shot( 'cards-power' );

	}

	await library( false );

} );

test( 'placed, turned, drawn at their real size, saved and back after a reload', async () => {

	// One placed with the mouse and turned with R, the way a person would.
	await library( true );
	await look( { east: 0, north: 0, distance: 40, from: 180, elevation: 35 } );
	await page.waitForTimeout( 300 );
	await page.click( '#library .card[data-item="generator-60kva"]' );
	await page.mouse.move( 760, 420 );
	await page.waitForTimeout( 300 );
	await page.mouse.click( 760, 420 );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.library === 'generator-60kva' && ! e.placing ) );
	const heading = await page.evaluate( () => window.twin.models.entries.find( e => e.library === 'generator-60kva' ).state.heading );
	await page.keyboard.press( 'KeyR' );
	const turned = await page.evaluate( () => window.twin.models.entries.find( e => e.library === 'generator-60kva' ).state.heading );
	assert.notEqual( turned, heading );
	await library( false );
	await page.evaluate( () => window.twin.models.remove( window.twin.models.entries.find( e => e.library === 'generator-60kva' ) ) );

	// The rest from code: power and air in a row, cranes and telehandlers in another facing north
	// with room to drive, the tower crane off to one side.
	await place( [
		...POWER.map( ( id, i ) => ( { id, east: - 30 + i * 7, north: 0, heading: 0 } ) ),
		...DRIVABLE.map( ( id, i ) => ( { id, east: - 60 + i * 24, north: 60, heading: 0 } ) ),
		{ id: 'tower-crane', east: - 140, north: - 60, heading: 300 },
	] );
	const items = await placed();
	assert.equal( items.length, Object.keys( SIZES ).length );
	for ( const { id, size } of items ) SIZES[ id ].forEach( ( expected, i ) => assert.ok( near( size[ i ], expected ), `${ id } is drawn ${ size.map( v => v.toFixed( 2 ) ).join( ' × ' ) }, expected ${ SIZES[ id ].join( ' × ' ) }` ) );

	// Each turned: by its heading, about its middle (or, for a crane, its carrier).
	const turns = await page.evaluate( () => {

		const { models } = window.twin;
		return models.entries.map( entry => {

			const before = entry.pivot.position.clone();
			entry.state.heading = ( entry.state.heading + 90 ) % 360;
			models.apply( entry );
			entry.pivot.updateMatrixWorld( true );
			return { id: entry.library, yaw: entry.pivot.rotation.y, heading: entry.state.heading, moved: entry.pivot.position.distanceTo( before ) };

		} );

	} );
	for ( const { id, yaw, heading, moved } of turns ) {

		const expected = Math.PI - heading * Math.PI / 180;
		assert.ok( Math.abs( Math.atan2( Math.sin( yaw - expected ), Math.cos( yaw - expected ) ) ) < 1e-6, `${ id } turned to ${ heading }°` );
		assert.ok( moved < 0.01, `${ id } turned in place` );

	}

	// Back to how they were, for the pictures and for driving north.
	await page.evaluate( () => {

		const { models } = window.twin;
		for ( const entry of models.entries ) {

			entry.state.heading = ( entry.state.heading + 270 ) % 360;
			models.apply( entry );

		}

	} );

	await look( { east: 0, north: 0, distance: 30, from: 330, elevation: 28 } );
	await shot( 'power-and-air' );
	await look( { east: 15, north: 0, distance: 14, from: 315, elevation: 25 } );
	await shot( 'power-and-air-compressors' );
	await look( { east: - 10, north: 60, distance: 75, from: 320, elevation: 22 } );
	await shot( 'cranes-and-telehandlers' );
	await look( { east: 50, north: 60, distance: 16, from: 300, elevation: 20 } );
	await shot( 'telehandlers' );

	// Saved (after the layout's 300 ms wait) and back after a reload.
	await page.waitForTimeout( 800 );
	const before = ( await placed() ).map( ( { id, east, north, heading, params } ) => JSON.stringify( { id, east, north, heading, params } ) ).sort();
	await openApp();
	await page.waitForFunction( n => window.twin.models.entries.length === n, before.length, { timeout: 30000 } );
	const reloaded = ( await placed() ).map( ( { id, east, north, heading, params } ) => JSON.stringify( { id, east, north, heading, params } ) ).sort();
	assert.deepEqual( reloaded, before );
	console.log( `saved and reloaded: ${ before.length } items` );
	assert.deepEqual( errors, [] );

} );

test( 'tower crane: its P panel numbers rebuild it; the reach circle drapes, toggles and saves', async () => {

	const tower = () => page.evaluate( () => {

		const entry = window.twin.models.entries.find( e => e.kind === 'tower-crane' );
		let reach = null;
		entry.pivot.children[ 0 ].traverse( o => reach ??= o.userData.reach ?? null );
		const { min, max } = entry.footprint;
		const fill = reach?.fill.geometry.attributes.position;
		let lowest = Infinity;
		let highest = - Infinity;
		for ( let i = 0; fill && i < fill.count; i ++ ) {

			lowest = Math.min( lowest, fill.getY( i ) );
			highest = Math.max( highest, fill.getY( i ) );

		}

		return { params: { ...entry.params }, size: [ max.z - min.z, max.x - min.x, max.y - min.y ], reach: !! reach, radius: reach?.radius, lowest, highest };

	} );

	let crane = await tower();
	assert.equal( crane.reach, true, 'placed with its reach circle' );
	assert.equal( crane.radius, 50 );
	// The circle (100 m across) doesn't count in its size: the jib does, the footprint across it doesn't.
	assert.ok( crane.size[ 1 ] < 8, `${ crane.size[ 1 ].toFixed( 1 ) } m across` );
	// Draped on the flat stand-in ground, just over it.
	assert.ok( crane.lowest > 0 && crane.highest < 0.2, `fill between ${ crane.lowest } and ${ crane.highest }` );
	await look( { east: - 140, north: - 60, distance: 130, from: 200, elevation: 32 } );
	await shot( 'tower-crane-reach' );
	await look( { east: - 140, north: - 60, up: 40, distance: 30, from: 230, elevation: 10 } );
	await shot( 'tower-crane-top' );

	// The P panel's fields, as typed in: height under hook and jib rebuild it.
	const setField = ( label, value ) => page.evaluate( ( { label, value } ) => {

		// lil-gui's class names, with and without the "lil-" its newer versions put on them.
		const panel = document.querySelector( '.lil-gui.lil-root, .lil-gui.root' );
		const folder = [ ...panel.querySelectorAll( '.lil-gui' ) ].find( f => f.querySelector( '.lil-title, .title' )?.textContent.startsWith( 'Tower crane' ) );
		const row = [ ...folder.querySelectorAll( '.lil-controller, .controller' ) ].find( c => c.querySelector( '.lil-name, .name' )?.textContent === label );
		const input = row.querySelector( 'input' );
		if ( input.type === 'checkbox' ) {

			if ( input.checked !== value ) input.click();

		} else {

			input.value = String( value );
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
			input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			input.blur();

		}

	}, { label, value } );

	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'tower-crane' ) ) );
	await setField( 'height under hook (m)', 60 );
	await setField( 'jib: working radius (m)', 65 );
	crane = await tower();
	assert.equal( crane.params.height, 60 );
	assert.equal( crane.params.jib, 65 );
	// Jib to counter-jib: 65 + 1 m past the radius, a 21 m counter-jib behind; up to the tower head.
	assert.ok( near( crane.size[ 0 ], 66 + 21.4, 0.03 ), `${ crane.size[ 0 ].toFixed( 1 ) } m long` );
	assert.ok( near( crane.size[ 2 ], 60 + 2.5 + 2.2 + 65 / 6 + 0.3, 0.03 ), `${ crane.size[ 2 ].toFixed( 1 ) } m high` );
	assert.equal( crane.radius, 65 );
	// Laid on the ground again once rebuilt.
	assert.ok( crane.lowest > 0, 'draped after rebuilding' );
	await setField( 'hook radius (m)', 50 );
	await setField( 'hook height (m)', 8 );
	crane = await tower();
	assert.equal( crane.params.radius, 50 );
	assert.equal( crane.params.hook, 8 );
	await look( { east: - 140, north: - 60, distance: 150, from: 200, elevation: 30 } );
	await shot( 'tower-crane-60m-65m' );

	// Off, saved, reloaded, still off; then on again.
	await setField( 'reach circle', false );
	crane = await tower();
	assert.equal( crane.params.reach, false );
	assert.equal( crane.reach, false );
	await page.waitForTimeout( 800 );
	await openApp();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'tower-crane' ) );
	crane = await tower();
	assert.deepEqual( crane.params, { height: 60, jib: 65, radius: 50, hook: 8, reach: false } );
	assert.equal( crane.reach, false );
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'tower-crane' ) ) );
	await setField( 'reach circle', true );
	crane = await tower();
	assert.equal( crane.reach, true );
	await page.waitForTimeout( 800 );
	await openApp();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'tower-crane' ) );
	crane = await tower();
	assert.equal( crane.params.reach, true );
	assert.equal( crane.reach, true );
	await page.waitForFunction( () => {

		const entry = window.twin.models.entries.find( e => e.kind === 'tower-crane' );
		let reach = null;
		entry.pivot.children[ 0 ].traverse( o => reach ??= o.userData.reach ?? null );
		return reach.fill.geometry.attributes.position.getY( 0 ) > 0;

	} );
	console.log( 'tower crane: rebuilt at 60 m under hook with a 65 m jib; reach circle off, saved, on, saved' );
	assert.deepEqual( errors, [] );

} );

test( 'drivable: each driven with V; the cameras stay out of the machine, the cab camera in the cab', async () => {

	for ( const id of DRIVABLE ) {

		const start = await page.evaluate( id => {

			const { models, sidebar } = window.twin;
			const entry = models.entries.find( e => e.library === id );
			sidebar.select( entry );
			return { east: entry.state.east, north: entry.state.north };

		}, id );
		await page.keyboard.press( 'KeyV' );
		await page.waitForFunction( id => window.twin.driver.active && window.twin.driver.entry.library === id, id );
		await page.keyboard.down( 'KeyW' );
		await page.waitForTimeout( id === 'crane-spider-3t' ? 3000 : 1500 );
		await page.keyboard.up( 'KeyW' );
		await page.waitForTimeout( 300 );

		// Where the camera is against the machine: inside any of its solid parts (glass aside), and
		// in its own frame.
		const camera = () => page.evaluate( () => {

			const { driver, camera } = window.twin;
			const { pivot, footprint } = driver.entry;
			pivot.updateMatrixWorld( true );
			let inside = null;
			pivot.traverse( mesh => {

				if ( ! mesh.isMesh || mesh.material.transparent ) return;
				if ( ! mesh.geometry.boundingBox ) mesh.geometry.computeBoundingBox();
				if ( mesh.geometry.boundingBox.containsPoint( mesh.worldToLocal( camera.position.clone() ) ) ) inside ??= mesh.name || mesh.geometry.type;

			} );
			const local = pivot.worldToLocal( camera.position.clone() );
			return { inside, local: local.toArray(), inBox: footprint.containsPoint( local ), mode: driver.cameraMode };

		} );

		const moved = await page.evaluate( start => Math.hypot( window.twin.driver.east - start.east, window.twin.driver.north - start.north ), start );
		assert.ok( moved > 0.4, `${ id } drove ${ moved.toFixed( 2 ) } m` );
		const chase = await camera();
		assert.equal( chase.mode, 'chase' );
		assert.equal( chase.inside, null, `${ id }: chase camera inside ${ chase.inside }` );
		assert.equal( chase.inBox, false, `${ id }: chase camera in its box` );
		if ( CABS[ id ] ) await shot( `drive-${ id }-chase` );

		await page.keyboard.press( 'KeyC' );
		await page.waitForTimeout( 300 );
		const cab = await camera();
		assert.equal( cab.mode, 'hood' );
		assert.equal( cab.inside, null, `${ id }: cab camera inside ${ cab.inside }` );
		if ( CABS[ id ] ) {

			// In the build's frame, recentred by the model manager: where the cab is, measured from
			// the same build.
			const offset = await page.evaluate( () => window.twin.driver.entry.pivot.children[ 0 ].position.toArray() );
			const expected = CABS[ id ].map( ( v, i ) => v + offset[ i ] );
			const distance = Math.hypot( ...cab.local.map( ( v, i ) => v - expected[ i ] ) );
			assert.ok( distance < 0.3, `${ id }: cab camera ${ distance.toFixed( 2 ) } m from the seat` );
			await shot( `drive-${ id }-cab` );

		}

		await page.keyboard.press( 'KeyC' );
		await page.keyboard.press( 'KeyV' );
		await page.waitForFunction( () => ! window.twin.driver.active );
		const parked = await page.evaluate( id => window.twin.models.entries.find( e => e.library === id ).state, id );
		assert.ok( Math.hypot( parked.east - start.east, parked.north - start.north ) > 0.4, `${ id } parked where it stopped` );
		console.log( `${ id }: drove ${ moved.toFixed( 1 ) } m; chase camera at ${ chase.local.map( v => v.toFixed( 1 ) ).join( ', ' ) }` );

	}

	assert.deepEqual( errors, [] );

} );
