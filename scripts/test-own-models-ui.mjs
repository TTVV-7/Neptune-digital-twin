// npm run test:own-models-ui: our own models in the library (the entries marked `own` in
// public/library/library.json, added with `npm run add-own-asset`) in a real browser, against the
// Vite dev server with no Google tiles; every request that isn't to the local server is blocked.
// Each one is listed under its category with a picture and its size, placed at the size the
// catalog gives, standing on the ground, in a handful of painted meshes, and back after a reload.
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev server that's already running
// (started without a Maps key); TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { dropProjectModels, ROOT, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5197;
const SHOTS = process.env.TEST_SCREENSHOTS;
const OWN = JSON.parse( readFileSync( join( ROOT, 'public/library/library.json' ), 'utf8' ) ).filter( item => item.own );
// Laid out in rows 30 m apart, each item given room for its longest side.
const SPOTS = [];
{

	let east = 0;
	let north = 0;
	for ( const item of OWN ) {

		// Whole metres: positions are saved to the centimetre.
		const room = 2 * Math.ceil( Math.max( item.dimensions.length, item.dimensions.width ) / 2 ) + 4;
		if ( east + room > 110 ) {

			east = 0;
			north -= 30;

		}

		SPOTS.push( [ item.id, east + room / 2, north ] );
		east += room;

	}

}

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
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout );
	await dropProjectModels( page );

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
		controls.setPose( camera.position.clone().set( - ce, up + distance * Math.sin( elevation * r ), cn ), heading, - elevation );

	}, { east, north, up, distance, from, elevation } );

}

async function shot( name ) {

	await page.waitForTimeout( 1200 );
	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

test( 'there are some, each with its file and picture', () => {

	assert.ok( OWN.length > 0 );
	for ( const item of OWN ) {

		assert.equal( item.source, undefined, `${ item.id } has a source: is it ours or someone else's?` );
		assert.equal( item.scale, 1 );
		assert.ok( readFileSync( join( ROOT, 'public/library', item.file ) ).length > 0 );
		assert.ok( readFileSync( join( ROOT, 'public/library', item.thumb ) ).length > 0 );

	}

} );

test( 'listed under their category with their size and picture, and no credit owed', async () => {

	await library( true );
	const listed = await page.evaluate( () => {

		const out = {};
		let category = null;
		for ( const el of document.querySelectorAll( '#library h3, #library .card[data-item]' ) ) {

			if ( el.tagName === 'H3' ) category = el.textContent;
			else out[ el.dataset.item ] = { category, name: el.querySelector( '.name' ).textContent, dims: el.querySelector( '.dims' ).textContent, thumb: el.querySelector( 'img' ).getAttribute( 'src' ), title: el.title };

		}

		return out;

	} );
	for ( const item of OWN ) {

		const card = listed[ item.id ];
		assert.ok( card, `${ item.id } isn't listed` );
		assert.equal( card.category, item.category );
		assert.equal( card.name, item.name );
		assert.match( card.dims, /^[\d.]+ × [\d.]+ × [\d.]+ m$/ );
		assert.ok( card.thumb.endsWith( item.thumb ), `${ item.id } has no picture` );
		assert.equal( card.title, 'Our own model' );
		console.log( `${ card.category } · ${ card.name }: ${ card.dims }` );

	}

	// Every picture loads.
	await page.evaluate( () => document.querySelectorAll( '#library .card img' ).forEach( img => img.loading = 'eager' ) );
	await page.waitForFunction( ids => ids.every( id => {

		const img = document.querySelector( `#library .card[data-item="${ id }"] img` );
		return img.complete && img.naturalWidth > 0;

	} ), OWN.map( item => item.id ) );

	for ( const category of new Set( OWN.map( item => item.category ) ) ) {

		await page.evaluate( category => [ ...document.querySelectorAll( '#library h3' ) ].find( h => h.textContent === category ).scrollIntoView(), category );
		await shot( `cards-${ category.split( ' ' )[ 0 ].toLowerCase() }` );

	}

	// The credits under H list downloaded models only.
	const credits = await page.evaluate( () => document.querySelector( '#credits ul' ).textContent );
	for ( const item of OWN ) assert.ok( ! credits.includes( `${ item.name }:` ), `${ item.id } is in the credits` );
	await library( false );

} );

test( 'placed at their real size on the ground, painted, in a few meshes, and back after a reload', async () => {

	// One placed with the mouse, the way a person would.
	const first = OWN[ 0 ].id;
	await look( { east: 0, north: - 200, up: 0, distance: 30, from: 180, elevation: 50 } );
	await library( true );
	await page.evaluate( id => document.querySelector( `#library .card[data-item="${ id }"]` ).scrollIntoView(), first );
	await page.click( `#library .card[data-item="${ first }"]` );
	await page.mouse.move( 760, 420 );
	await page.waitForTimeout( 300 );
	await page.mouse.click( 760, 420 );
	await page.waitForFunction( id => window.twin.models.entries.some( e => e.library === id && ! e.placing ), first );
	await page.evaluate( id => window.twin.models.remove( window.twin.models.entries.find( e => e.library === id ) ), first );
	await library( false );

	// The rest from code, as the library places them.
	await page.evaluate( async spots => {

		const { models } = window.twin;
		const { loadLibrary, itemConfig } = await import( '/src/library.js' );
		const items = await loadLibrary();
		for ( const [ id, east, north ] of spots ) await models.load( itemConfig( items.find( i => i.id === id ), { east, north, heading: 0 } ) );

	}, SPOTS );
	const placed = await page.evaluate( () => window.twin.models.entries.map( e => {

		const size = e.footprint.getSize( e.pivot.position.clone() );
		let meshes = 0;
		let metal = 0;
		e.pivot.traverse( o => {

			if ( ! o.isMesh ) return;
			meshes ++;
			metal = Math.max( metal, o.material.metalness ?? 0 );

		} );
		return { id: e.library, size: { x: size.x, y: size.y, z: size.z }, snapped: e.snapped, meshes, metal };

	} ) );
	for ( const item of OWN ) {

		const entry = placed.find( e => e.id === item.id );
		assert.ok( entry, `${ item.id } wasn't placed` );
		// Heading 0 turns its front to north, so its length runs north-south (z).
		const want = { z: item.dimensions.length, x: item.dimensions.width, y: item.dimensions.height };
		for ( const axis of [ 'x', 'y', 'z' ] ) {

			assert.ok( Math.abs( entry.size[ axis ] - want[ axis ] ) <= 0.02 + want[ axis ] * 0.01, `${ item.id }: ${ axis } is ${ entry.size[ axis ].toFixed( 2 ) } m, the catalog says ${ want[ axis ] } m` );

		}

		assert.ok( entry.snapped, `${ item.id } isn't on the ground` );
		// One mesh per colour (see add-own-asset.mjs): a handful of draw calls each.
		assert.ok( entry.meshes <= 16, `${ item.id } has ${ entry.meshes } meshes` );
		// Bare metal draws black here, where there is nothing to reflect.
		assert.equal( entry.metal, 0, `${ item.id } has a metal surface` );

	}

	const norths = [ ...new Set( SPOTS.map( s => s[ 2 ] ) ) ];
	for ( const [ i, north ] of norths.entries() ) {

		await look( { east: 55, north, up: 2, distance: 75, from: 180, elevation: 22 } );
		await shot( `placed-${ i + 1 }` );
		await look( { east: 55, north, up: 2, distance: 75, from: 0, elevation: 22 } );
		await shot( `placed-${ i + 1 }-from-north` );

	}

	const describe = () => page.evaluate( () => window.twin.models.entries.map( e => {

		const size = e.footprint.getSize( e.pivot.position.clone() );
		return `${ e.library } ${ e.state.east } ${ e.state.north } ${ e.state.heading } ${ size.toArray().map( v => v.toFixed( 2 ) ).join( ' ' ) }`;

	} ).sort() );
	const before = await describe();
	await page.waitForTimeout( 800 );
	await openApp();
	await page.waitForFunction( n => window.twin.models.entries.length === n, before.length );
	assert.deepEqual( await describe(), before );
	console.log( `saved and reloaded: ${ before.length } items` );
	assert.deepEqual( errors, [] );

} );
