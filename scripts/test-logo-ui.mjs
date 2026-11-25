// npm run test:logo-ui: Build Pro's company logo on the equipment (logo.js), and the counts and
// hints round placed items, in a real browser against the Vite dev server with no Google tiles;
// every request that isn't to the local server is blocked, and the logo is answered here. The
// logo sized in metres whatever a library model's catalog scale (a cargo van at 100, a backhoe at
// 0.006); on an excavator, it swings with the house; the Show panel counts only items that got
// one. A laydown's "items inside" counts items (a row's copies each), not pits and piles; the
// Controls panel says P holds a tower crane's settings; and items saved for everyone, arriving
// after the layout, don't undo this viewer's Before view or hidden layers.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev
// server that's already running (started without a Maps key).

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5751;
// A 4 × 1 PNG, so the logo is four times as wide as it's high.
const LOGO = Buffer.from( 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAD0lEQVR4nGP4z8DwHxkDAEPNB/lfEPxcAAAAAElFTkSuQmCC', 'base64' );

let browser;
let vite;
let page;
let base;
const errors = [];

before( async () => {

	const { chromium } = require( 'playwright' );
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
	await page.route( '**/test-api/logo', route => route.fulfill( { status: 200, contentType: 'image/png', body: LOGO } ) );
	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layers );
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

// Place library items from code, as the sidebar does.
function place( items ) {

	return page.evaluate( async items => {

		const { models } = window.twin;
		const { itemConfig, loadLibrary } = await import( '/src/library.js' );
		const library = await loadLibrary();
		for ( const { id, east, north, heading = 0, ...extra } of items ) await models.load( { ...itemConfig( library.find( i => i.id === id ), { east, north, heading, up: null } ), ...extra } );

	}, items );

}

test( 'the logo: in metres whatever the model\'s scale, swinging with an excavator\'s house, and counted only where it is', async () => {

	await place( [
		{ id: 'cargo-van', east: 0, north: 0 },
		{ id: 'backhoe-loader', east: 20, north: 0 },
		{ id: 'excavator-20t', east: 40, north: 0 },
		{ id: 'generator-portable-7kw', east: 60, north: 0 },
	] );
	// The editor sets the logo up only in Build (BUILD_APP); here it's set up by hand, with a
	// stand-in Show panel that keeps its count.
	await page.evaluate( async () => {

		const { setUpLogo } = await import( '/src/logo.js' );
		window.logoLayer = null;
		setUpLogo( { models: window.twin.models, apiBase: '/test-api/', layers: { addLayer: ( id, spec ) => window.logoLayer = spec, update() {} } } );

	} );
	await page.waitForFunction( () => window.logoLayer, null, { timeout: 30000 } );

	// Each logo's size in world metres, along the item and up, and how thick it's cut.
	const logos = () => page.evaluate( async () => {

		const { Box3, Vector3 } = await import( '/node_modules/three/build/three.module.js' );
		const out = {};
		for ( const entry of window.twin.models.entries ) {

			const list = [];
			entry.pivot.traverse( o => {

				if ( o.name !== 'Company logo' ) return;
				o.geometry.computeBoundingBox();
				const box = o.geometry.boundingBox.clone().applyMatrix4( o.matrixWorld );
				const size = box.getSize( new Vector3() );
				const centre = box.getCenter( new Vector3() );
				const house = [];
				for ( let p = o.parent; p; p = p.parent ) house.push( p.name );
				list.push( { size: size.toArray(), centre: centre.toArray(), underHouse: house.includes( 'house' ) } );

			} );
			let houseBox = null;
			entry.pivot.traverse( o => {

				if ( o.name === 'house' ) houseBox = new Box3().setFromObject( o );

			} );
			out[ entry.library ] = { logos: list, scale: entry.state.scale, house: houseBox && { min: houseBox.min.toArray(), max: houseBox.max.toArray() } };
		}

		return out;

	} );

	let got = await logos();
	// The van (scale 100): a logo up to 2.4 m wide (MOST) and so 0.6 m high, found on its flat
	// sides rather than missed as 0.02 m wide.
	assert.ok( got[ 'cargo-van' ].logos.length >= 1, 'the van has a logo' );
	for ( const { size } of got[ 'cargo-van' ].logos ) {

		const along = Math.max( size[ 0 ], size[ 2 ] );
		assert.ok( along <= 2.5 && along >= 0.5, `van logo ${ along.toFixed( 2 ) } m along` );
		assert.ok( size[ 1 ] <= 0.65, `van logo ${ size[ 1 ].toFixed( 2 ) } m high` );

	}

	// The backhoe (scale 0.006): never wider than MOST or 45 % of its 7 m, nor higher than 40 %
	// of its height, where it was 2.4 m from a probe 1.4 cm across.
	for ( const { size } of got[ 'backhoe-loader' ].logos ) {

		assert.ok( Math.max( size[ 0 ], size[ 2 ] ) <= 2.6, `backhoe logo ${ size.map( v => v.toFixed( 2 ) ) }` );
		assert.ok( size[ 1 ] <= 1.5, `backhoe logo ${ size[ 1 ].toFixed( 2 ) } m high` );

	}

	// The excavator: on the house, and still on it once the house has swung a quarter turn.
	const digger = got[ 'excavator-20t' ];
	assert.ok( digger.logos.length >= 1, 'the excavator has a logo' );
	assert.ok( digger.logos.every( l => l.underHouse ), 'kept on the house it was cut from' );
	await page.evaluate( () => {

		const entry = window.twin.models.entries.find( e => e.library === 'excavator-20t' );
		const { rig } = entry.pivot.children[ 0 ].userData;
		rig.setPose( { ...rig.rest, swing: Math.PI / 2 } );
		entry.pivot.updateMatrixWorld( true );

	} );
	got = await logos();
	const { house } = got[ 'excavator-20t' ];
	for ( const { centre } of got[ 'excavator-20t' ].logos ) {

		const inside = [ 0, 1, 2 ].every( i => centre[ i ] >= house.min[ i ] - 0.2 && centre[ i ] <= house.max[ i ] + 0.2 );
		assert.ok( inside, `logo at ${ centre.map( v => v.toFixed( 1 ) ) } is on the swung house` );

	}

	// The portable generator is too small for one: kept out of the Show panel's count.
	assert.equal( got[ 'generator-portable-7kw' ].logos.length, 0 );
	const branded = Object.values( got ).filter( item => item.logos.length ).length;
	assert.equal( await page.evaluate( () => window.logoLayer.count() ), branded );

	await page.evaluate( () => {

		const { models } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );

	} );

} );

test( 'a laydown counts the items inside, a row\'s copies each, but not pits, piles or other areas', async () => {

	const count = await page.evaluate( async () => {

		const { models, rows } = window.twin;
		const { getKind } = await import( '/src/kinds.js' );
		const area = await models.load( { kind: 'laydown', params: { width: 80, length: 80 }, east: 300, north: 300, heading: 0, up: null } );
		await models.load( { kind: 'excavation', params: { width: 6, length: 6, depth: 2 }, east: 290, north: 290, heading: 0, up: null } );
		await models.load( { kind: 'stockpile', params: { shape: 'cone', volume: 50, material: 'gravel' }, east: 310, north: 290, heading: 0, up: null } );
		await rows.template( 'traffic-cone' );
		const row = await models.load( { kind: 'row', name: 'Row: cones', params: { item: 'traffic-cone', points: [ [ - 10, 0 ], [ 10, 0 ] ], spacing: 'every', every: 2 }, east: 300, north: 315, heading: 0, up: null } );
		const { itemConfig, loadLibrary } = await import( '/src/library.js' );
		const library = await loadLibrary();
		await models.load( itemConfig( library.find( i => i.id === 'traffic-cone' ), { east: 305, north: 305, heading: 0, up: null } ) );
		const readout = getKind( 'laydown' ).readouts.find( r => r.label === 'items inside' );
		return { inside: Number( readout.get( area ) ), copies: getKind( 'row' ).count( row ) };

	} );
	assert.ok( count.copies > 5, `${ count.copies } cones in the row` );
	assert.equal( count.inside, count.copies + 1 );

} );

test( 'the Controls panel: a selected tower crane\'s P is its settings, and it has a Size button', async () => {

	const text = await page.evaluate( async () => {

		const { models, sidebar } = window.twin;
		const crane = await models.load( { kind: 'tower-crane', params: {}, east: - 300, north: - 300, heading: 0, up: null } );
		sidebar.select( crane );
		await new Promise( resolve => setTimeout( resolve, 800 ) );
		const out = document.querySelector( '#legend .rows' ).textContent;
		sidebar.select( null );
		return out;

	} );
	assert.match( text, /Its settings and exact position/ );
	assert.match( text, /buttons above it: rotate, size/ );

} );

test( 'items saved for everyone arriving late don\'t undo Before or a hidden layer', async () => {

	const state = await page.evaluate( async () => {

		const { models, layers } = window.twin;
		const { itemConfig, loadLibrary } = await import( '/src/library.js' );
		const library = await loadLibrary();
		const cone = library.find( i => i.id === 'traffic-cone' );
		const layer = 'category:Traffic control';
		layers.setLayerShown( layer, false );
		layers.setBefore( true );
		await models.load( { ...itemConfig( cone, { east: 500, north: 500, heading: 0, up: null } ), inConfig: true } );
		const after = { before: layers.before, shown: layers.isLayerShown( layer ) };
		// One this viewer puts down still brings them back.
		await models.load( itemConfig( cone, { east: 505, north: 500, heading: 0, up: null } ) );
		const placed = { before: layers.before, shown: layers.isLayerShown( layer ) };
		return { after, placed };

	} );
	assert.deepEqual( state.after, { before: true, shown: false } );
	assert.deepEqual( state.placed, { before: false, shown: true } );

} );

test( 'no page errors', () => {

	assert.deepEqual( errors, [] );

} );
