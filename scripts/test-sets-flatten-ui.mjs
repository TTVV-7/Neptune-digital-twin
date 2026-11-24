// npm run test:sets-flatten-ui: sets (sets.js) and surfaced flatten areas (flatten.js) in a real
// browser, against the Vite dev server with no Google tiles; every request that isn't to the
// local server is blocked. A set is listed and found by search, follows the pointer as one,
// turns with R about its middle, and is put down as separate items laid out as the set says. A
// flatten area is surfaced with gravel to start, its surface stays in view when the library
// closes (and has no red box: a bare area's shows in build mode), the next area takes the surface last chosen, and areas saved
// without a surface load and save again without one.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev
// server that's already running (started without a Maps key); TEST_SCREENSHOTS=<folder> saves
// pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5197;
const SHOTS = process.env.TEST_SCREENSHOTS;

let browser;
let vite;
let page;
let base;
const errors = [];

before( async () => {

	const { chromium } = require( 'playwright' );
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
	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout );
	await dropProjectModels( page );
	await page.evaluate( () => {

		const { models } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );

	} );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function library( open ) {

	await page.evaluate( open => {

		if ( window.twin.sidebar.isOpen() !== open ) document.getElementById( 'library-toggle' ).click();

	}, open );

}

async function look( { east, north, distance, from, elevation } ) {

	await page.evaluate( ( { east, north, distance, from, elevation } ) => {

		const { controls, camera } = window.twin;
		const r = Math.PI / 180;
		const h = distance * Math.cos( elevation * r );
		const ce = east + h * Math.sin( from * r );
		const cn = north + h * Math.cos( from * r );
		const heading = ( Math.atan2( east - ce, north - cn ) / r + 360 ) % 360;
		controls.setPose( camera.position.clone().set( - ce, distance * Math.sin( elevation * r ), cn ), heading, - elevation );

	}, { east, north, distance, from, elevation } );

}

async function shot( name ) {

	await page.waitForTimeout( 1200 );
	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

const placed = () => page.evaluate( () => window.twin.models.entries.filter( e => ! e.placing ).map( e => ( { library: e.library, kind: e.kind, east: e.state.east, north: e.state.north, heading: e.state.heading } ) ) );

test( 'sets are listed first and found by search, by any of their words', async () => {

	await library( true );
	const listed = await page.evaluate( () => {

		const headings = [ ...document.querySelectorAll( '#library .items h3' ) ].map( h => h.textContent );
		const sets = [ ...document.querySelectorAll( '#library .card.set' ) ].map( c => c.dataset.set );
		return { headings, sets };

	} );
	assert.equal( listed.headings[ 1 ], 'Sets', 'Sets come right after the tools' );
	for ( const id of [ 'set-site-office', 'set-concrete-pour', 'set-bulk-excavation', 'set-lane-closure' ] ) assert.ok( listed.sets.includes( id ), `${ id } is listed` );

	const shown = async query => {

		await page.fill( '#library input[type=search]', query );
		return page.evaluate( () => [ ...document.querySelectorAll( '#library .card' ) ].filter( c => ! c.hidden ).map( c => c.dataset.set ?? c.dataset.item ).filter( Boolean ) );

	};

	assert.ok( ( await shown( 'concrete pour' ) ).includes( 'set-concrete-pour' ) );
	// A member's name finds the set too, and words needn't be next to each other.
	assert.ok( ( await shown( 'office people' ) ).includes( 'set-site-office' ) );
	assert.ok( ( await shown( 'boom pump' ) ).includes( 'set-concrete-pour' ) );
	assert.ok( ( await shown( 'mixer truck cad' ) ).includes( 'concrete-mixer-truck-8m3' ) );
	await page.fill( '#library input[type=search]', '' );
	await page.dispatchEvent( '#library input[type=search]', 'input' );

} );

test( 'a set follows the pointer, turns about its middle and is put down as separate items', async () => {

	await look( { east: 0, north: 0, distance: 70, from: 0, elevation: 55 } );
	const expected = await page.evaluate( async () => {

		const { availableSets } = await import( '/src/sets.js' );
		const { loadLibrary } = await import( '/src/library.js' );
		const set = availableSets( await loadLibrary() ).find( s => s.id === 'set-site-office' );
		return set.members.map( m => m.item );

	} );

	await page.click( '#library .card[data-set=set-site-office]' );
	const canvas = await page.$( 'canvas' );
	const box = await canvas.boundingBox();
	await page.mouse.move( box.x + box.width * 0.45, box.y + box.height * 0.5 );
	await page.waitForFunction( n => window.twin.models.entries.filter( e => e.placing ).length === n, expected.length, { timeout: 30000 } );
	await page.mouse.move( box.x + box.width * 0.5, box.y + box.height * 0.55, { steps: 4 } );
	await shot( 'set-placing' );

	// R turns the whole set a step; its pieces keep their places round its middle.
	const middle = () => page.evaluate( () => {

		const ghosts = window.twin.models.entries.filter( e => e.placing );
		const e = ghosts.reduce( ( s, g ) => s + g.state.east, 0 ) / ghosts.length;
		const n = ghosts.reduce( ( s, g ) => s + g.state.north, 0 ) / ghosts.length;
		const spread = Math.max( ...ghosts.map( g => Math.hypot( g.state.east - e, g.state.north - n ) ) );
		return { e, n, spread, heading: ghosts[ 0 ].state.heading };

	} );
	const before = await middle();
	await page.keyboard.press( 'KeyR' );
	const turned = await middle();
	assert.notEqual( turned.heading, before.heading, 'R turned the set' );
	assert.ok( Math.abs( turned.spread - before.spread ) < 0.2, `the set kept its shape (${ before.spread.toFixed( 2 ) } → ${ turned.spread.toFixed( 2 ) } m)` );

	await page.mouse.down();
	await page.mouse.up();
	await page.waitForFunction( () => window.twin.models.entries.every( e => ! e.placing ) );
	const items = await placed();
	assert.deepEqual( items.map( i => i.library ).sort(), [ ...expected ].sort(), 'every piece of the set was put down' );
	// The pieces are spread out as the set lays them out, not all in one spot.
	const xs = items.map( i => i.east );
	const ys = items.map( i => i.north );
	assert.ok( Math.max( ...xs ) - Math.min( ...xs ) > 10 || Math.max( ...ys ) - Math.min( ...ys ) > 10, 'the set is laid out over its area' );
	await library( false );
	await shot( 'set-placed' );

	// Each piece is its own item: deleting one leaves the rest.
	await page.evaluate( () => {

		const { models } = window.twin;
		models.remove( models.entries.find( e => e.library === 'porta-potty' ) );

	} );
	assert.equal( ( await placed() ).length, expected.length - 1 );
	await page.evaluate( () => {

		const { models } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );

	} );

} );

test( 'Esc while a set is following the pointer leaves nothing behind', async () => {

	await library( true );
	await page.click( '#library .card[data-set=set-concrete-pour]' );
	const canvas = await page.$( 'canvas' );
	const box = await canvas.boundingBox();
	await page.mouse.move( box.x + box.width * 0.5, box.y + box.height * 0.5 );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.placing ), null, { timeout: 30000 } );
	await page.waitForTimeout( 500 );
	await page.keyboard.press( 'Escape' );
	// Pieces still loading when Esc came are removed as they arrive.
	await page.waitForFunction( () => window.twin.models.entries.length === 0, null, { timeout: 15000 } );
	await page.waitForTimeout( 1000 );
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 0 );
	await library( false );

} );

test( 'flatten areas are surfaced, the surface staying in view outside build mode', async () => {

	await library( true );
	const result = await page.evaluate( async () => {

		const { models } = window.twin;
		const { defaultSurface } = await import( '/src/flatten.js' );
		const surfaceOf = entry => entry.pivot.getObjectByProperty( 'name', `${ entry.params.surface[ 0 ].toUpperCase() }${ entry.params.surface.slice( 1 ) } surface` );
		const red = entry => entry.pivot.children[ 0 ].children.filter( o => o.userData.buildOnly );
		const shown = o => {

			for ( let p = o; p; p = p.parent ) if ( ! p.visible ) return false;
			return true;

		};

		const start = defaultSurface();
		const gravel = await models.load( { kind: 'flatten-zone', params: { width: 20, length: 14, surface: start }, east: - 15, north: 0, heading: 0, up: null } );
		const old = await models.load( { kind: 'flatten-zone', params: { width: 10, length: 10 }, east: 15, north: 0, heading: 0, up: null } );
		const out = { start, gravelSurface: !! surfaceOf( gravel ), oldSurface: old.params.surface };
		out.inBuild = { surface: shown( surfaceOf( gravel ) ), red: red( gravel ).length, oldRed: red( old ).length > 0 && red( old ).every( shown ) };
		window.twin.sidebar.deselect();
		document.getElementById( 'library-toggle' ).click();
		out.outside = { surface: shown( surfaceOf( gravel ) ), red: red( gravel ).some( shown ), old: shown( old.pivot ) };
		document.getElementById( 'library-toggle' ).click();

		// Changed to asphalt (as the P panel does): rebuilt with asphalt, and the next area is asphalt.
		models.setParams( gravel, { surface: 'asphalt' } );
		out.changed = gravel.params.surface;
		out.asphaltSurface = !! surfaceOf( gravel );
		out.next = defaultSurface();
		out.saved = { surfaced: models.toConfig( gravel ).params, old: models.toConfig( old ).params };
		// Every gravel and rock type builds, and is kept as chosen.
		const { SURFACES } = await import( '/src/flatten.js' );
		const before = gravel.params.surface;
		out.types = {};
		for ( const id of Object.keys( SURFACES ) ) {

			models.setParams( gravel, { surface: id } );
			out.types[ id ] = !! gravel.pivot.getObjectByProperty( 'name', `${ SURFACES[ id ].name } surface` ) && models.toConfig( gravel ).params.surface === id;

		}

		models.setParams( gravel, { surface: before } );
		return out;

	} );

	assert.equal( result.start, 'gravel', 'gravel to begin with' );
	assert.ok( result.gravelSurface, 'gravel laid on the area' );
	assert.equal( result.oldSurface, 'none', 'an area saved without a surface has none' );
	assert.deepEqual( result.inBuild, { surface: true, red: 0, oldRed: true }, 'a surfaced area is just its surface; a bare one has its red box' );
	assert.deepEqual( result.outside, { surface: true, red: false, old: false }, 'outside build mode: the surface shows, the red box and bare areas don\'t' );
	assert.equal( result.changed, 'asphalt' );
	assert.ok( result.asphaltSurface );
	assert.equal( result.next, 'asphalt', 'the next area takes the surface last chosen' );
	assert.ok( Object.keys( result.types ).length >= 11 && Object.values( result.types ).every( Boolean ), JSON.stringify( result.types ) );
	assert.equal( result.saved.surfaced.surface, 'asphalt' );
	assert.ok( ! ( 'surface' in result.saved.old ), 'saved again without a surface' );

	await look( { east: 0, north: 0, distance: 45, from: 10, elevation: 40 } );
	await shot( 'flatten-surfaces-build' );
	await library( false );
	await shot( 'flatten-surfaces' );

} );

test( 'no page errors', () => {

	assert.deepEqual( errors, [] );

} );
