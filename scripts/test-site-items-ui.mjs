// npm run test:site-items-ui: the built-in site items (trailers, temporary covers, fencing, water
// treatment and people) in a real browser, against the Vite dev server with no Google tiles; every
// request that isn't to the local server is blocked. Each one is built at its real size (within
// 5%) and quickly, listed with a thumbnail and its size, placed (one with the mouse), turned with
// R, saved and reloaded.
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
const FT = 0.3048;
// The size each should come out at, in metres: [ long side, short side, height ], or null where
// it isn't the point (a person's width depends on the pose). Trailers are the box in their name
// plus 2.3 m of stairs and landing in front and 0.45 m of heating units behind, standing on 0.75 m
// blocking; covers and runs are their nominal size; the rest is the real thing's overall size.
const STAIRS_AND_HVAC = 2.32 + 0.45;
const SPEC = {
	'office-trailer-8x20': [ 20 * FT, 8 * FT + STAIRS_AND_HVAC, 3.4 ],
	'office-trailer-8x32': [ 32 * FT, 8 * FT + STAIRS_AND_HVAC, 3.4 ],
	'office-trailer-10x40': [ 40 * FT, 10 * FT + STAIRS_AND_HVAC, 3.5 ],
	'site-office-trailer': [ 60 * FT, 12 * FT + STAIRS_AND_HVAC, 3.6 ],
	'office-double-wide-24x60': [ 60 * FT, 24 * FT + STAIRS_AND_HVAC, 3.7 ],
	'washroom-trailer-8x28': [ 28 * FT, 8 * FT + STAIRS_AND_HVAC, 3.85 ],
	'lunchroom-trailer-12x40': [ 40 * FT, 12 * FT + STAIRS_AND_HVAC, 4.05 ],
	'fabric-shelter-9x18': [ 18, 9, 5 ],
	'fabric-shelter-15x30': [ 30, 15, 7.6 ],
	// Two 40 ft containers 40 ft apart, the arch rising 4 m above their tops.
	'container-canopy-40': [ 40 * FT + 2 * 2.438, 40 * FT, 2.59 + 4 ],
	'popup-canopy-3x3': [ 3, 3, 3.1 ],
	// Three 2.5 m bays by two, wrapped, with the door's rolled-up flap; 2 lifts of 2 m and a 1 m ridge.
	'scaffold-enclosure': [ 7.6, 5.3, 5.1 ],
	'fence-run-screened': [ 30 * FT, 1.6, 6 * FT + 0.08 ],
	'hoarding-plywood-10m': [ 10, 1.3, 8 * FT ],
	'frac-tank-21k': [ 12.2, 2.44, 3.0 ],
	'weir-tank-20': [ 20 * FT, 8 * FT, 8 * FT ],
	'sand-filter-skid': [ 12 * FT, 6 * FT, 2.6 ],
	'floc-dosing-trailer': [ 4.4, 2.3, 1.9 ],
	// The pump's frame (1.4 x 0.9 x 1.1 m) with 3.5 m of suction hose ahead and 5 m of discharge behind.
	'trash-pump-4in': [ 9.4, 1.2, 1.1 ],
	'dewatering-bag-15x30': [ 30 * FT, 15 * FT, 1.4 ],
	'worker-standing': [ null, null, 1.75 ],
	'worker-walking': [ null, null, 1.75 ],
	// The paddle's staff stands 2.1 m tall.
	'flagger': [ null, null, 2.1 ],
};
const IDS = Object.keys( SPEC );
const CATEGORIES = {
	'Site trailers & containers': [ 'office-trailer-8x20', 'office-trailer-8x32', 'office-trailer-10x40', 'site-office-trailer', 'office-double-wide-24x60', 'washroom-trailer-8x28', 'lunchroom-trailer-12x40' ],
	'Temporary covers': [ 'fabric-shelter-9x18', 'fabric-shelter-15x30', 'container-canopy-40', 'popup-canopy-3x3', 'scaffold-enclosure' ],
	'Barriers & fencing': [ 'fence-run-screened', 'hoarding-plywood-10m' ],
	'Dewatering & water treatment': [ 'frac-tank-21k', 'weir-tank-20', 'sand-filter-skid', 'floc-dosing-trailer', 'trash-pump-4in', 'dewatering-bag-15x30' ],
	'People': [ 'worker-standing', 'worker-walking', 'flagger' ],
};
// Where each is laid out for the pictures, and where the camera looks from.
const GROUPS = {
	trailers: {
		items: [ [ 'office-trailer-8x20', - 24, 0 ], [ 'office-trailer-8x32', - 14, 0 ], [ 'office-trailer-10x40', 0, 0 ], [ 'site-office-trailer', 18, 0 ], [ 'washroom-trailer-8x28', - 20, - 14 ], [ 'lunchroom-trailer-12x40', - 5, - 14 ], [ 'office-double-wide-24x60', 16, - 16 ], [ 'worker-standing', - 8, 5 ] ],
		look: { east: - 2, north: - 6, distance: 52, from: 25, elevation: 26 },
	},
	covers: {
		items: [ [ 'fabric-shelter-9x18', 75, 0 ], [ 'fabric-shelter-15x30', 95, 0 ], [ 'container-canopy-40', 120, 0 ], [ 'popup-canopy-3x3', 82, 18 ], [ 'scaffold-enclosure', 92, 22 ], [ 'worker-walking', 86, 17 ] ],
		look: { east: 98, north: 4, distance: 62, from: 20, elevation: 24 },
	},
	fencing: {
		items: [ [ 'fence-run-screened', 150, 0 ], [ 'hoarding-plywood-10m', 163, 0 ], [ 'flagger', 157, 4 ] ],
		look: { east: 157, north: 0, distance: 17, from: 15, elevation: 12, up: 1 },
	},
	water: {
		items: [ [ 'frac-tank-21k', 190, 0 ], [ 'weir-tank-20', 196, 2 ], [ 'sand-filter-skid', 201, 3 ], [ 'floc-dosing-trailer', 206, 3 ], [ 'trash-pump-4in', 211, 0 ], [ 'dewatering-bag-15x30', 218, - 1 ], [ 'worker-standing', 203, 7 ] ],
		look: { east: 204, north: 1, distance: 30, from: 25, elevation: 26 },
	},
	people: {
		items: [ [ 'worker-standing', 248.8, 0 ], [ 'worker-walking', 250, 0 ], [ 'flagger', 251.4, 0 ] ],
		look: { east: 250, north: 0, distance: 4.5, from: 15, elevation: 6, up: 1.1 },
	},
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
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout );

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

// [ long, short, height ] of a box size, whichever way the item faces.
function sides( { x, y, z } ) {

	return [ Math.max( x, z ), Math.min( x, z ), y ];

}

function assertSize( id, size ) {

	const got = sides( size );
	for ( const [ i, want ] of SPEC[ id ].entries() ) {

		if ( want === null ) continue;
		const off = Math.abs( got[ i ] - want ) / want;
		assert.ok( off <= 0.05, `${ id }: ${ [ 'length', 'width', 'height' ][ i ] } ${ got[ i ].toFixed( 2 ) } m is ${ ( off * 100 ).toFixed( 1 ) }% from ${ want.toFixed( 2 ) } m` );

	}

}

test( 'built at their real size, standing on the ground, quickly', async () => {

	const built = await page.evaluate( async ids => {

		const { buildProcedural } = await import( '/src/procedural.js' );
		const { Box3, Vector3 } = await import( '/node_modules/three/build/three.module.js' );
		const out = {};
		for ( const pass of [ 0, 1 ] ) {

			for ( const id of ids ) {

				const start = performance.now();
				const group = buildProcedural( id );
				const ms = performance.now() - start;
				const box = new Box3().setFromObject( group );
				let meshes = 0;
				let triangles = 0;
				group.traverse( o => {

					if ( ! o.isMesh ) return;
					meshes ++;
					triangles += ( o.geometry.index?.count ?? o.geometry.attributes.position.count ) / 3;

				} );
				// The second pass is timed: the first also pays for compiling the code.
				if ( pass ) out[ id ] = { size: box.getSize( new Vector3() ), bottom: box.min.y, ms, meshes, triangles };

			}

		}

		return out;

	}, IDS );

	let total = 0;
	for ( const id of IDS ) {

		const { size, bottom, ms, meshes, triangles } = built[ id ];
		assertSize( id, size );
		assert.ok( Math.abs( bottom ) < 0.005, `${ id } stands ${ bottom } m off the ground` );
		// One mesh per material: a handful of draw calls each (the canopy's containers are the usual kind).
		assert.ok( meshes <= 16 || id === 'container-canopy-40', `${ id } has ${ meshes } meshes` );
		total += ms;
		console.log( `${ id }: ${ sides( size ).map( v => v.toFixed( 2 ) ).join( ' × ' ) } m, ${ meshes } meshes, ${ Math.round( triangles ) } triangles, ${ ms.toFixed( 1 ) } ms` );

	}

	console.log( `all ${ IDS.length } built in ${ total.toFixed( 0 ) } ms` );
	// The sidebar builds each built-in item once to size its card, and again for its thumbnail.
	assert.ok( total < 250, `building them all took ${ total.toFixed( 0 ) } ms` );

} );

test( 'listed by category with their size and a thumbnail', async () => {

	const start = Date.now();
	await library( true );
	await page.waitForFunction( ids => ids.every( id => document.querySelector( `#library .card[data-item="${ id }"] img` )?.src.startsWith( 'data:image/png' ) ), IDS );
	console.log( `library opened with every thumbnail drawn in ${ Date.now() - start } ms` );
	const listed = await page.evaluate( () => {

		const out = {};
		let category = null;
		for ( const el of document.querySelectorAll( '#library h3, #library .card[data-item]' ) ) {

			if ( el.tagName === 'H3' ) category = el.textContent;
			else ( out[ category ] ??= [] ).push( { id: el.dataset.item, name: el.querySelector( '.name' ).textContent, dims: el.querySelector( '.dims' ).textContent } );

		}

		return out;

	} );
	for ( const [ category, ids ] of Object.entries( CATEGORIES ) ) {

		const cards = listed[ category ] ?? [];
		for ( const id of ids ) {

			const card = cards.find( c => c.id === id );
			assert.ok( card, `${ id } isn't listed under ${ category }` );
			assert.match( card.dims, /^[\d.]+ × [\d.]+ × [\d.]+ m$/ );
			console.log( `${ category } · ${ card.name }: ${ card.dims }` );

		}

		await page.evaluate( category => [ ...document.querySelectorAll( '#library h3' ) ].find( h => h.textContent === category ).scrollIntoView(), category );
		await shot( `cards-${ category.split( ' ' )[ 0 ].toLowerCase() }` );

	}

	// Sizes in names come smallest first.
	const shelters = listed[ 'Temporary covers' ].map( c => c.id ).filter( id => id.startsWith( 'fabric-shelter' ) );
	assert.deepEqual( shelters, [ 'fabric-shelter-9x18', 'fabric-shelter-15x30' ] );
	await library( false );

} );

test( 'placed, turned with R, saved and reloaded', async () => {

	await look( { east: 0, north: - 120, up: 0, distance: 30, from: 180, elevation: 50 } );
	await library( true );

	// One placed with the mouse and turned with R, the way a person would.
	await page.evaluate( () => document.querySelector( '#library .card[data-item="frac-tank-21k"]' ).scrollIntoView() );
	await page.click( '#library .card[data-item="frac-tank-21k"]' );
	await page.mouse.move( 760, 420 );
	await page.waitForTimeout( 300 );
	await page.mouse.click( 760, 420 );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.library === 'frac-tank-21k' && ! e.placing ) );
	const heading = await page.evaluate( () => window.twin.models.entries.find( e => e.library === 'frac-tank-21k' ).state.heading );
	await page.keyboard.press( 'KeyR' );
	const turned = await page.evaluate( () => window.twin.models.entries.find( e => e.library === 'frac-tank-21k' ).state.heading );
	assert.notEqual( turned, heading );
	await page.evaluate( () => window.twin.models.remove( window.twin.models.entries.find( e => e.library === 'frac-tank-21k' ) ) );

	// The rest from code, laid out in groups, each selected and turned with R.
	const items = Object.values( GROUPS ).flatMap( g => g.items );
	await page.evaluate( async items => {

		const { models } = window.twin;
		const { PROCEDURAL_ITEMS } = await import( '/src/procedural.js' );
		for ( const [ id, east, north ] of items ) {

			const { name } = PROCEDURAL_ITEMS.find( i => i.id === id );
			await models.load( { name, library: id, procedural: id, front: '-z', up: null, east, north, heading: 0 } );

		}

	}, items );
	for ( const id of IDS ) {

		const turns = await page.evaluate( id => {

			const { models, sidebar } = window.twin;
			const entry = models.entries.find( e => e.library === id );
			sidebar.select( entry );
			return entry.state.heading;

		}, id );
		await page.keyboard.press( 'KeyR' );
		await page.keyboard.press( 'KeyR' );
		const now = await page.evaluate( id => window.twin.models.entries.find( e => e.library === id ).state.heading, id );
		assert.equal( ( now - turns + 360 ) % 360, 30, `${ id } didn't turn` );
		await page.keyboard.press( 'Shift+KeyR' );
		await page.keyboard.press( 'Shift+KeyR' );

	}

	await page.evaluate( () => window.twin.sidebar.deselect() );
	const placed = await page.evaluate( () => window.twin.models.entries.map( e => {

		const size = e.footprint.getSize( e.pivot.position.clone() );
		return { id: e.library, size: { x: size.x, y: size.y, z: size.z }, heading: e.state.heading, snapped: e.snapped };

	} ) );
	for ( const id of IDS ) {

		const entry = placed.find( e => e.id === id );
		assertSize( id, entry.size );
		assert.equal( entry.heading, 0 );
		assert.ok( entry.snapped, `${ id } isn't on the ground` );

	}

	await library( false );
	// Selecting them opened the P panel; out of the pictures.
	if ( await page.evaluate( () => document.querySelector( '.lil-gui.root' )?.style.display !== 'none' ) ) await page.keyboard.press( 'KeyP' );
	for ( const [ name, group ] of Object.entries( GROUPS ) ) {

		await look( group.look );
		await shot( `placed-${ name }` );

	}

	// Saved (after the layout's 300 ms wait) and back after a reload, at the same size.
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
	await look( GROUPS.covers.look );
	await shot( 'reloaded-covers' );
	assert.deepEqual( errors, [] );

} );
