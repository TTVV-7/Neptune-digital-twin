// npm run test:excavation-ui: excavations sloped, stepped or shored, for the whole pit or each
// side, in a real browser against the Vite dev server with no Google tiles; every request that
// isn't to the local server is blocked. A layout saved before sides had methods loads exactly as it
// did (terrain heights, volumes, rims, footprints, shoring text and the saved JSON, against
// numbers taken from that code: scripts/test-excavation-old.json); each method digs the design
// surface; mixed sides and benches; the P panel's fields, sub-folder, per-side labels and stage
// slider; the side labels in the scene; the tool, the dig animation, resize outlines; and a new
// pit saved and reloaded.
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev server that's already running
// (started without a Maps key). TEST_CAPTURE_OLD=1 with TEST_BASE pointing at the code before the
// change writes scripts/test-excavation-old.json afresh instead of running the tests.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5198;
const CAPTURE = !! process.env.TEST_CAPTURE_OLD;
const FIXTURE = new URL( './test-excavation-old.json', import.meta.url );
const LAYOUT_KEY = 'neptune-twin.layout.Neptune Terminals';

// A layout as the first excavations saved it: every slope and support, in several sizes and
// headings, some on the ground, some given their own height (rims above and below the ground, so
// the sides climb to it), and some across the shore of the stand-in ground (land at 0, water at
// -2 m), where the rim is the water's and the sides climb onto the land.
const OLD_SLOPES = [ 0, 0.5, 1, 1.5, 2 ];
const OLD_SUPPORTS = [ 'none', 'trench-box', 'slide-rail', 'hydraulic', 'sheet-piles', 'soldier-piles' ];
const OLD_SIZES = [ [ 20, 10, 2 ], [ 12, 12, 5 ], [ 3, 20, 3 ], [ 8, 30, 4.5 ], [ 40, 25, 6.5 ], [ 4, 4, 3 ] ];
const OLD_HEADINGS = [ 0, 30, 117.5, 245 ];
const OLD_UPS = [ null, null, - 1.2, 0.8 ];

function oldLayout() {

	const items = [];
	let i = 0;
	for ( const slope of OLD_SLOPES ) {

		for ( const support of OLD_SUPPORTS ) {

			const [ width, length, depth ] = OLD_SIZES[ i % OLD_SIZES.length ];
			items.push( {
				name: 'Excavation',
				kind: 'excavation',
				params: { width, length, depth, slope, support },
				east: 1000 + ( i % 6 ) * 70,
				north: 100 + Math.floor( i / 6 ) * 70,
				up: OLD_UPS[ i % OLD_UPS.length ],
				heading: OLD_HEADINGS[ i % OLD_HEADINGS.length ],
				scale: 1,
			} );
			i ++;

		}

	}

	// Trench boxes too short for the shortest box (2.4 m): no box, nothing drawn.
	for ( const [ k, [ width, length, depth, slope ] ] of [ [ 1, 1, 0.1, 2 ], [ 2, 2, 2, 1 ] ].entries() ) items.push( { name: 'Excavation', kind: 'excavation', params: { width, length, depth, slope, support: 'trench-box' }, east: 1500, north: 100 + k * 40, up: null, heading: 0, scale: 1 } );

	// Across the shore: half on the land, half over the water.
	for ( const [ k, slope ] of OLD_SLOPES.entries() ) {

		const support = k === 4 ? 'sheet-piles' : 'none';
		items.push( { name: 'Excavation', kind: 'excavation', params: { width: 16, length: 14, depth: 3, slope, support }, east: 1000 + k * 60, north: - 280, up: null, heading: k * 20, scale: 1 }, );

	}

	return { version: 2, site: 'Neptune Terminals', lat: 49.3005, lon: - 123.0218, items, extras: {} };

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

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function openApp() {

	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.shoring && window.twin.terrain && ! window.twin.layout.loading );

}

// Everything about the excavations placed now that the first code could tell: per pit (in the
// order east, north) its rim, cut, footprint, shoring text, floor readout, resize label, label in
// the scene, and a digest of the terrain's heights on and between the grid's nodes over it; and
// the layout as it would save.
async function measure() {

	return page.evaluate( async () => {

		const { models, terrain, earthworks, shoring, layout } = window.twin;
		const { getKind } = await import( '/src/kinds.js' );
		const kind = getKind( 'excavation' );
		terrain.flush();
		const pits = models.entries.filter( e => e.kind === 'excavation' ).sort( ( a, b ) => a.state.east - b.state.east || a.state.north - b.state.north );
		// A fixed sequence of points off the grid, the same every time.
		let seed = 12345;
		const random = () => ( seed = ( seed * 1103515245 + 12345 ) % 2147483648 ) / 2147483648;
		const out = [];
		for ( const entry of pits ) {

			const { state, params } = entry;
			const reach = Math.hypot( params.width, params.length ) / 2 + 5;
			const heights = [];
			const x0 = Math.round( ( - state.east - reach ) * 2 ) / 2;
			const z0 = Math.round( ( state.north - reach ) * 2 ) / 2;
			const n = Math.ceil( reach * 4 );
			for ( let j = 0; j <= n; j ++ ) for ( let i = 0; i <= n; i ++ ) heights.push( terrain.surfaceAt( x0 + i * 0.5, z0 + j * 0.5 ) ?? NaN );
			for ( let k = 0; k < 400; k ++ ) heights.push( terrain.surfaceAt( - state.east + ( random() * 2 - 1 ) * reach, state.north + ( random() * 2 - 1 ) * reach ) ?? NaN );
			const bytes = new Float64Array( heights );
			const digest = [ ...new Uint8Array( await crypto.subtle.digest( 'SHA-256', bytes ) ) ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
			const plan = shoring.planShoring( params );
			const box = entry.footprint;
			out.push( {
				at: [ state.east, state.north, state.heading, state.up ],
				params: { width: params.width, length: params.length, depth: params.depth, slope: params.slope, support: params.support },
				rim: earthworks.designs.get( entry ).rim,
				cut: terrain.designVolume( entry ).cut,
				footprint: [ box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z ],
				shoring: { summary: plan.summary, wall: plan.wall, weight: plan.weight, notes: plan.notes },
				shown: shoring.shown.has( entry ),
				floor: kind.readouts.find( r => r.label === 'floor' ).get( entry ),
				resize: kind.resize.label( params ),
				label: earthworks.labels.text( entry ),
				heights: { count: heights.length, cut: heights.filter( h => h < - 1e-9 ).length, sum: heights.reduce( ( s, h ) => Number.isNaN( h ) ? s : s + h, 0 ), digest },
			} );

		}

		return { pits: out, items: layout.getData().items.map( item => JSON.stringify( item ) ) };

	} );

}

test( 'a layout saved before sides had methods loads exactly as it did', async () => {

	const saved = oldLayout();
	await page.goto( `${ base }/?prompt` );
	await page.evaluate( ( [ key, value ] ) => localStorage.setItem( key, value ), [ LAYOUT_KEY, JSON.stringify( saved ) ] );
	await openApp();
	await page.waitForFunction( n => window.twin.models.entries.filter( e => e.kind === 'excavation' ).length === n, saved.items.length );
	const now = await measure();
	// The layout saves back as it was saved, byte for byte.
	assert.deepEqual( now.items, saved.items.map( item => JSON.stringify( item ) ) );
	if ( CAPTURE ) {

		writeFileSync( FIXTURE, JSON.stringify( now.pits, null, '\t' ) + '\n' );
		console.log( `captured ${ now.pits.length } pits from ${ base }` );
		return;

	}

	const then = JSON.parse( readFileSync( FIXTURE, 'utf8' ) );
	assert.equal( now.pits.length, then.length );
	// Trench systems' notes have said since that they're used to the maker's data (WorkSafeBC
	// 20.81(1)(f)): the one note the first code didn't give.
	for ( const pit of now.pits ) pit.shoring.notes = pit.shoring.notes.filter( note => ! note.startsWith( 'Used to the maker\'s tabulated data' ) );
	for ( const [ i, pit ] of now.pits.entries() ) assert.deepEqual( pit, then[ i ], `pit ${ i } ${ JSON.stringify( then[ i ].params ) } at ${ then[ i ].at }` );
	console.log( `${ now.pits.length } pits from before: heights (${ now.pits.reduce( ( s, p ) => s + p.heights.count, 0 ).toLocaleString( 'en-CA' ) } points), cuts, rims, footprints, shoring and labels as they were` );
	assert.deepEqual( errors, [] );

} );

// --- new excavations ------------------------------------------------------------------------------

// The design module and the kinds, in the page, as the app has them.
async function modules() {

	await page.evaluate( async () => {

		window.exc = { design: await import( '/src/excavation-design.js' ), kinds: await import( '/src/kinds.js' ) };

	} );

}

// Nothing placed or selected, the library open (build mode), and the P panel shown.
async function fresh() {

	await page.evaluate( () => {

		const { sidebar, layout, controls } = window.twin;
		sidebar.cancelDrawing();
		sidebar.deselect();
		layout.clear();
		controls.setMode( 'fly' );
		if ( ! sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();
		const gui = document.querySelector( '.lil-gui.lil-root' );
		if ( gui.style.display === 'none' ) window.dispatchEvent( new KeyboardEvent( 'keydown', { code: 'KeyP' } ) );

	} );

}

function frames( n = 2 ) {

	return page.evaluate( n => new Promise( resolve => {

		const step = () => n -- <= 0 ? resolve() : requestAnimationFrame( step );
		step();

	} ), n );

}

// Fly, looking from (east, north, up) along a heading, pitched down (degrees, negative).
async function pose( east, north, up, heading, pitch ) {

	await page.evaluate( ( [ east, north, up, heading, pitch ] ) => {

		const { controls, camera } = window.twin;
		controls.setMode( 'fly' );
		controls.setPose( camera.position.clone().set( - east, up, north ), heading, pitch );

	}, [ east, north, up, heading, pitch ] );
	await frames( 3 );

}

// Where a point (east, north, up) is on screen, in client pixels.
function screenOf( east, north, up = 0 ) {

	return page.evaluate( ( [ east, north, up ] ) => {

		const { camera, renderer } = window.twin;
		camera.updateMatrixWorld();
		const v = camera.position.clone().set( - east, up, north ).project( camera );
		const rect = renderer.domElement.getBoundingClientRect();
		return { x: rect.left + ( v.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - v.y ) / 2 * rect.height };

	}, [ east, north, up ] );

}

// Places a pit; returns its index in window.placed.
async function place( params, east, north, heading = 0 ) {

	return page.evaluate( async ( { params, east, north, heading } ) => {

		const entry = await window.twin.models.load( { kind: 'excavation', params, east, north, heading, up: null } );
		window.placed = [ ...window.placed ?? [], entry ];
		return window.placed.length - 1;

	}, { params, east, north, heading } );

}

// The terrain over pit i against its design, node by node: every node in its bounds is the
// ground (the stand-in's, flat) or the design's surface at the stage shown, whichever is lower, to
// the Float32 the terrain keeps; a band 2 m round the bounds isn't cut at all. Also its readouts
// and both volumes (measured, and the design's on flat ground).
async function inspect( i ) {

	return page.evaluate( i => {

		const { terrain, earthworks, models } = window.twin;
		const { depthAt, toPit, cutVolume, outlines, planExcavation } = window.exc.design;
		const kind = window.exc.kinds.getKind( 'excavation' );
		const entry = window.placed[ i ];
		terrain.flush();
		const design = earthworks.designs.get( entry );
		const { minX, maxX, minZ, maxZ } = design.bounds();
		let nodes = 0;
		let wrong = 0;
		let first = null;
		let outside = 0;
		for ( let a = Math.floor( ( minX - 2 ) * 2 ); a <= Math.ceil( ( maxX + 2 ) * 2 ); a ++ ) {

			for ( let b = Math.floor( ( minZ - 2 ) * 2 ); b <= Math.ceil( ( maxZ + 2 ) * 2 ); b ++ ) {

				const [ x, z ] = [ a / 2, b / 2 ];
				const [ u, v ] = toPit( design.frame, x, z );
				const depth = depthAt( design.geom, u, v, design.stage.dig );
				const ground = models.originalHeight( x, z );
				if ( x < minX || x > maxX || z < minZ || z > maxZ ) {

					if ( design.rim - depth < ground ) outside ++;
					continue;

				}

				nodes ++;
				const want = Math.fround( Math.min( ground, design.rim - depth ) );
				const got = terrain.surfaceAt( x, z );
				if ( got !== want ) {

					wrong ++;
					first ??= { x, z, u, v, want, got };

				}

			}

		}

		const readout = label => kind.readouts.find( r => r.label === label ).get( entry );
		const { geom } = planExcavation( entry.params );
		return {
			nodes,
			wrong,
			first,
			outside,
			cut: terrain.designVolume( entry ).cut,
			finished: cutVolume( geom ),
			floor: readout( 'floor' ),
			top: readout( 'top of the cut' ),
			stage: readout( 'stage' ),
			outline: outlines( geom ).top,
			params: { ...entry.params },
		};

	}, i );

}

const near = ( a, b, tolerance ) => Math.abs( a - b ) <= tolerance;

test( 'each method digs its design: sloped for the soil or at a ratio, stepped, shored, a trench box with sloped ends', async () => {

	await openApp();
	await modules();
	await fresh();
	const floor = { outline: 'floor', slopeBy: 'soil', bracing: 'auto' };
	const pits = {
		// The research's worked example: a 10 x 20 m floor 4 m down in type C, 1.5 : 1: 1,712 m³.
		soil: await place( { ...floor, width: 10, length: 20, depth: 4 }, - 1500, 100 ),
		ratio: await place( { ...floor, width: 10, length: 20, depth: 4, slopeBy: 'custom', slope: 0.75 }, - 1400, 100, 30 ),
		// 4.8 m deep in four 1.2 m risers, 1.8 m benches: the top 5.4 m out from the floor.
		stepped: await place( { ...floor, width: 6, length: 12, depth: 4.8, method: 'bench' }, - 1300, 100 ),
		shored: await place( { ...floor, width: 12, length: 12, depth: 5, support: 'sheet-piles' }, - 1200, 100, 75 ),
		trench: await place( { ...floor, width: 3, length: 20, depth: 3, support: 'trench-box', ends: 'sloped' }, - 1100, 100, 200 ),
		benchedRatio: await place( { ...floor, width: 8, length: 8, depth: 3, method: 'bench', benchHeight: 1, benchWidth: 2 }, - 1000, 100, 10 ),
	};
	const r = {};
	for ( const [ name, i ] of Object.entries( pits ) ) {

		r[ name ] = await inspect( i );
		const { nodes, wrong, first, outside } = r[ name ];
		assert.equal( wrong, 0, `${ name }: ${ wrong } of ${ nodes } nodes off the design, first ${ JSON.stringify( first ) }` );
		assert.equal( outside, 0, `${ name }: cut outside its bounds` );
		// Measured on the 0.5 m grid against the exact volume on flat ground.
		assert.ok( near( r[ name ].cut, r[ name ].finished, r[ name ].finished * 0.012 ), `${ name }: cut ${ r[ name ].cut } against ${ r[ name ].finished }` );

	}

	assert.ok( near( r.soil.finished, 1712, 0.5 ) );
	assert.equal( r.soil.top, '22.0 × 32.0 m, 704 m²' );
	assert.equal( r.soil.floor, '10.0 × 20.0 m' );
	assert.equal( r.ratio.top, '16.0 × 26.0 m, 416 m²' );
	assert.equal( r.stepped.top, '16.8 × 22.8 m, 383 m²' );
	assert.equal( r.stepped.floor, '6.0 × 12.0 m' );
	assert.equal( r.shored.top, '12.0 × 12.0 m, 144 m²' );
	assert.ok( near( r.shored.cut, 720, 8 ), `shored cut ${ r.shored.cut }` );
	// The trench's ends slope at 1.5 : 1 for the soil; its long sides stand in the box.
	assert.equal( r.trench.top, '3.0 × 29.0 m, 87.0 m²' );
	// Risers of 1 m, three of them, with 2 m benches: 4 m out.
	assert.equal( r.benchedRatio.top, '16.0 × 16.0 m, 256 m²' );

	// The benches, in from the stepped pit's right side at its middle: 1.2, 2.4, 3.6 m down, then
	// the floor.
	const steps = await page.evaluate( () => {

		const { terrain } = window.twin;
		return [ 7.5, 5.7, 3.9, 0 ].map( u => terrain.surfaceAt( - ( - 1300 + u ), 100 ) );

	} );
	assert.deepEqual( steps, [ - 1.2, - 2.4, - 3.6, - 4.8 ].map( Math.fround ) );
	// Halfway up the soil-C slope of the first: 3 m out from the floor's right edge, 2 m down.
	assert.equal( await page.evaluate( () => window.twin.terrain.surfaceAt( - ( - 1500 + 8 ), 100 ) ), - 2 );
	console.log( Object.entries( r ).map( ( [ name, p ] ) => `${ name }: top ${ p.top }, floor ${ p.floor }, cut ${ p.cut.toFixed( 1 ) } m³ (${ p.finished.toFixed( 1 ) } on flat ground), ${ p.nodes } nodes` ).join( '\n' ) );

} );

test( 'per side: a wall, a slope, benches and secant piles in one pit, corners worked out; and an old pit turned per side keeps its top', async () => {

	await fresh();
	// Floor 12 x 20, 6 m down: sheet piles on side 1, side 2 sloped 1 : 1 (soil B), side 3 in five
	// 1.2 m risers with 1.8 m benches, secant piles on side 4.
	const mixed = await place( { outline: 'floor', slopeBy: 'soil', bracing: 'auto', soil: 'B', width: 12, length: 20, depth: 6, method: 'sides', side1: 'sheet-piles', side2: 'slope', side3: 'bench', side4: 'secant-piles' }, - 1500, 300 );
	const old = await place( { width: 20, length: 10, depth: 2, slope: 1, support: 'none' }, - 1400, 300, 15 );
	const r = await inspect( mixed );
	assert.equal( r.wrong, 0, JSON.stringify( r.first ) );
	assert.equal( r.outside, 0 );
	assert.deepEqual( r.outline, { u0: - 6, u1: 12, v0: - 17.2, v1: 10 } );
	assert.equal( r.top, '18.0 × 27.2 m, 490 m²' );
	assert.equal( r.floor, '12.0 × 20.0 m' );
	assert.ok( near( r.cut, r.finished, r.finished * 0.012 ), `cut ${ r.cut } against ${ r.finished }` );
	// Along side 1's wall at the middle: straight down; in side 2's wing beside the wall, the
	// slope (3 m out from the floor edge: 3 m down); on side 3's second bench 2.4 m down.
	const at = await page.evaluate( () => {

		const { terrain } = window.twin;
		const h = ( u, v ) => terrain.surfaceAt( - ( - 1500 + u ), 300 + v );
		return { wall: [ h( 0, 9.5 ), h( 0, 10.5 ) ], wing: h( 9, 9 ), bench: h( 0, - 10 - 7.2 + 2.7 ), secant: h( - 5.5, 0 ) };

	} );
	// (The stand-in ground is a hair above 0: its plane is turned flat in floating point.)
	assert.equal( at.wall[ 0 ], - 6 );
	assert.ok( near( at.wall[ 1 ], 0, 1e-9 ), `${ at.wall[ 1 ] } beyond the wall` );
	assert.equal( at.wing, - 3 );
	assert.equal( at.bench, Math.fround( - 2.4 ) );
	assert.equal( at.secant, - 6 );

	// An old pit (its rectangle the top of the cut) given a wall on side 1: the top stays where it
	// was, and the floor grows on that side only.
	await page.evaluate( i => window.twin.models.setParams( window.placed[ i ], { method: 'sides', side1: 'sheet-piles' } ), old );
	const o = await inspect( old );
	assert.equal( o.wrong, 0, JSON.stringify( o.first ) );
	assert.equal( o.top, '20.0 × 10.0 m, 200 m²' );
	assert.equal( o.floor, '16.0 × 8.0 m' );
	assert.equal( o.params.outline, 'top' );

} );

test( 'dig stages: walls in, each lift to 0.6 m below a level, then the floor; rakers leave a berm', async () => {

	await fresh();
	// 8 m deep between sheet piles 10 m apart: struts at 1.5, 3.65 and 5.85 m.
	const strutted = await place( { outline: 'floor', slopeBy: 'soil', bracing: 'auto', width: 10, length: 16, depth: 8, support: 'sheet-piles' }, - 1500, 500 );
	const raked = await place( { outline: 'floor', slopeBy: 'soil', bracing: 'rakers', width: 30, length: 30, depth: 6, support: 'sheet-piles' }, - 1400, 500 );
	const stages = await page.evaluate( i => window.exc.design.planExcavation( window.placed[ i ].params ).stages.map( s => `${ s.label } (${ Math.round( s.dig * 1000 ) / 1000 })` ), strutted );
	assert.deepEqual( stages, [
		'Walls in, nothing dug yet (0)',
		'Dig to 2.1 m (2.1)',
		'Level 1 (1.5 m): walers and struts in (2.1)',
		'Dig to 4.25 m (4.25)',
		'Level 2 (3.65 m): walers and struts in (4.25)',
		'Dig to 6.45 m (6.45)',
		'Level 3 (5.85 m): walers and struts in (6.45)',
		'Dug to the floor (8)',
	] );
	const middle = ( i, u = 0, v = 0 ) => page.evaluate( ( [ i, u, v ] ) => {

		const { terrain } = window.twin;
		terrain.flush();
		const { east, north } = window.placed[ i ].state;
		return terrain.surfaceAt( - ( east + u ), north + v );

	}, [ i, u, v ] );
	assert.equal( await middle( strutted ), - 8 );
	for ( const [ stage, depth ] of [ [ 0, 0 ], [ 1, 2.1 ], [ 4, 4.25 ], [ - 1, 8 ] ] ) {

		await page.evaluate( ( [ i, stage ] ) => window.twin.models.setParams( window.placed[ i ], { stage } ), [ strutted, stage ] );
		const r = await inspect( strutted );
		assert.equal( r.wrong, 0, JSON.stringify( r.first ) );
		assert.ok( near( await middle( strutted ), - depth, 1e-6 ), `stage ${ stage }: ${ await middle( strutted ) }` );
		assert.equal( r.stage, stage === - 1 ? '' : `${ stage + 1 } of 8: ${ stages[ stage ].replace( / \([\d.]+\)$/, '' ) }` );
		assert.ok( near( r.cut, 10 * 16 * depth, 10 * 16 * depth * 0.01 + 1 ), `stage ${ stage }: ${ r.cut }` );

	}

	// Rakers: the middle dug to the floor with a berm left against the walls, cut parallel to the
	// rakers (45°), until the rakers at that level are in.
	await page.evaluate( i => window.twin.models.setParams( window.placed[ i ], { stage: 2 } ), raked );
	const berm = await inspect( raked );
	assert.equal( berm.wrong, 0, JSON.stringify( berm.first ) );
	assert.match( berm.stage, /^3 of 7: Dig the middle to the floor, leaving a berm/ );
	assert.equal( await middle( raked ), - 6 );
	// 1 m in from the right-hand wall: the berm's top (2.1 m) and 1 m down its face.
	assert.equal( await middle( raked, 14, 0 ), Math.fround( - 3.1 ) );

} );

// The open Excavation folder in the P panel: each row's name, whether it shows (its sub-folder
// too) and its value as shown.
function panelRows() {

	return page.evaluate( () => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root > .lil-children > .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		const shows = element => {

			for ( let e = element; e && e !== folder; e = e.parentElement ) if ( e.style.display === 'none' ) return false;
			return true;

		};
		const rows = {};
		for ( const c of folder.querySelectorAll( '.lil-controller' ) ) {

			const name = c.querySelector( '.lil-name' )?.textContent;
			const select = c.querySelector( 'select' );
			const value = select ? select.selectedOptions[ 0 ]?.textContent ?? '' : c.querySelector( '.readout-note' )?.textContent ?? c.querySelector( 'input' )?.value;
			// Two rows can share a name (the support levels, one for pits from before): the shown one.
			if ( ! rows[ name ]?.shown ) rows[ name ] = { shown: shows( c ), value, folder: c.closest( '.lil-gui' ).querySelector( '.lil-title' ).textContent };

		}

		return rows;

	} );

}

// Changes a P panel row as a person would: picks an option by its text, or types a number or text.
function setRow( name, value ) {

	return page.evaluate( ( [ name, value ] ) => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root > .lil-children > .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		// A name ending in '…' matches a label that starts so (one that says the value in use).
		const named = text => name.endsWith( '…' ) ? text?.startsWith( name.slice( 0, - 1 ) ) : text === name;
		const row = [ ...folder.querySelectorAll( '.lil-controller' ) ].find( c => named( c.querySelector( '.lil-name' )?.textContent ) && c.style.display !== 'none' );
		const select = row.querySelector( 'select' );
		if ( select ) {

			select.selectedIndex = [ ...select.options ].findIndex( o => o.textContent === value );
			if ( select.selectedIndex < 0 ) throw new Error( `${ name } has no ${ value }` );
			select.dispatchEvent( new Event( 'change' ) );
			return;

		}

		const input = row.querySelector( 'input' );
		input.focus();
		input.value = String( value );
		input.dispatchEvent( new Event( 'input' ) );
		input.dispatchEvent( new Event( 'change' ) );
		input.blur();

	}, [ name, value ] );

}

const shown = rows => Object.entries( rows ).filter( ( [ , r ] ) => r.shown ).map( ( [ name ] ) => name );

test( 'P panel: the method for all sides or each, with what each needs; per-side labels follow the heading; the stage slider', async () => {

	await fresh();
	const i = await place( { width: 14, length: 22, outline: 'floor', slopeBy: 'soil', bracing: 'auto' }, - 1500, 700 );
	await page.evaluate( i => window.twin.sidebar.select( window.placed[ i ] ), i );
	await frames( 2 );
	const params = () => page.evaluate( i => ( { ...window.placed[ i ].params } ), i );
	// Labels that say the value in use (the slope, the benches, the embedment, the dig stage) are
	// listed by how they start, as 'slope (…'.
	const fields = [ 'width (m)', 'length (m)', 'depth (m)', 'the rectangle is', 'sides', 'side 1 (N)', 'side 2 (E)', 'side 3 (S)', 'side 4 (W)', 'system', 'ends', 'soil (WorkSafeBC)', 'slope (…', 'slope (h : v)', 'bench height (…', 'bench width (…', 'support levels', 'levels (m down)', 'embedment (…', 'raker angle (°)', 'tieback angle (° down)', 'bond length (m)', 'groundwater (m down)', 'dig stage (…' ];
	const field = name => fields.find( f => f === name || ( f.endsWith( '…' ) && name.startsWith( f.slice( 0, - 1 ) ) && ! fields.includes( name ) ) );
	const showing = async () => shown( await panelRows() ).map( field ).filter( Boolean );

	let rows = await panelRows();
	// Sloped: no dig stage slider (before and after only, as the Show panel's Before / After).
	assert.deepEqual( await showing(), [ 'width (m)', 'length (m)', 'depth (m)', 'the rectangle is', 'sides', 'soil (WorkSafeBC)', 'slope (…', 'groundwater (m down)' ] );
	assert.equal( rows[ 'the rectangle is' ].value, 'the floor of the pit' );
	assert.equal( rows.sides.value, 'sloped' );
	assert.equal( rows[ 'soil (WorkSafeBC)' ].value, 'C: soft, sandy, filled or loose' );
	// The soil's usual slope, and what it is.
	assert.equal( rows[ 'slope (1.5 : 1)' ].value, 'usual for the soil' );
	assert.equal( rows[ 'top of the cut' ].value, '20.0 × 28.0 m, 560 m²' );

	// A ratio of its own: the slider shows, and the top follows it.
	await setRow( 'slope (…', 'a ratio of my own' );
	assert.ok( ( await showing() ).includes( 'slope (h : v)' ) );
	await setRow( 'slope (h : v)', 0.75 );
	assert.equal( ( await params() ).slope, 0.75 );
	assert.equal( ( await panelRows() )[ 'top of the cut' ].value, '17.0 × 25.0 m, 425 m²' );

	// Stepped: the benches, not the slopes.
	await setRow( 'sides', 'stepped (benched)' );
	assert.deepEqual( await showing(), [ 'width (m)', 'length (m)', 'depth (m)', 'the rectangle is', 'sides', 'soil (WorkSafeBC)', 'bench height (…', 'bench width (…', 'groundwater (m down)' ] );
	// Left at 0, they say what they work out to: two 1 m risers and 1.5 m benches, 2 m deep.
	rows = await panelRows();
	assert.equal( rows[ 'bench height (0 = 1 m)' ].value, '0' );
	assert.equal( rows[ 'bench width (0 = 1.5 m)' ].value, '0' );
	await setRow( 'bench height (…', 1 );
	assert.equal( ( await params() ).benchHeight, 1 );
	assert.ok( ( await panelRows() )[ 'bench height (m, 0 = auto)' ].shown );
	assert.equal( ( await params() ).method, 'bench' );

	// Shored: a system (sheet piles to start), its support levels and embedment; a trench box
	// instead has open or sloped ends and brings its own struts.
	await setRow( 'sides', 'shored' );
	rows = await panelRows();
	assert.equal( rows.system.value, 'Sheet piles' );
	assert.deepEqual( await showing(), [ 'width (m)', 'length (m)', 'depth (m)', 'the rectangle is', 'sides', 'system', 'soil (WorkSafeBC)', 'support levels', 'embedment (…', 'groundwater (m down)' ] );
	// A 2 m cantilever: 1.5 times the depth, 3 m.
	assert.equal( rows[ 'embedment (0 = 3 m)' ].value, '0' );
	assert.equal( rows[ 'support levels' ].value, 'suggested' );
	assert.equal( ( await params() ).support, 'sheet-piles' );
	await setRow( 'system', 'Trench box' );
	assert.deepEqual( await showing(), [ 'width (m)', 'length (m)', 'depth (m)', 'the rectangle is', 'sides', 'system', 'ends', 'soil (WorkSafeBC)', 'groundwater (m down)' ] );
	await setRow( 'ends', 'sloped' );
	assert.ok( ( await showing() ).includes( 'slope (…' ), 'sloped ends slope' );

	// Per side: each side as it's cut now (a trench box's walls become sheet piles; its sloped
	// ends stay sloped), in a sub-folder, named by the way each faces.
	await setRow( 'sides', 'per side' );
	rows = await panelRows();
	assert.deepEqual( [ 1, 2, 3, 4 ].map( n => rows[ [ 'side 1 (N)', 'side 2 (E)', 'side 3 (S)', 'side 4 (W)' ][ n - 1 ] ] ).map( r => [ r.shown, r.value, r.folder ] ), [
		[ true, 'Sloped', 'each side' ], [ true, 'Sheet piles', 'each side' ], [ true, 'Sloped', 'each side' ], [ true, 'Sheet piles', 'each side' ],
	] );
	await setRow( 'side 2 (E)', 'Secant pile wall' );
	await setRow( 'side 3 (S)', 'Stepped (benched)' );
	let p = await params();
	assert.deepEqual( [ p.method, p.side1, p.side2, p.side3, p.side4 ], [ 'sides', 'slope', 'secant-piles', 'bench', 'sheet-piles' ] );
	assert.deepEqual( ( await showing() ).filter( n => [ 'slope (…', 'bench height (…', 'support levels', 'system' ].includes( n ) ), [ 'slope (…', 'bench height (…', 'support levels' ] );

	// Turned to face east, the sides keep their methods and are named afresh.
	await page.evaluate( i => {

		const entry = window.placed[ i ];
		entry.state.heading = 90;
		window.twin.models.apply( entry );

	}, i );
	rows = await panelRows();
	assert.deepEqual( [ 'side 1 (E)', 'side 2 (S)', 'side 3 (W)', 'side 4 (N)' ].map( name => rows[ name ]?.value ), [ 'Sloped', 'Secant pile wall', 'Stepped (benched)', 'Sheet piles' ] );

	// Deeper, struts asked for between the walls: levels can be typed in.
	await setRow( 'depth (m)', 8 );
	await setRow( 'support levels', 'walers + struts' );
	assert.ok( ( await showing() ).includes( 'levels (m down)' ) );
	// Blank: the suggested levels show greyed in the box.
	assert.equal( await page.evaluate( () => [ ...document.querySelectorAll( '.lil-controller' ) ].find( c => c.querySelector( '.lil-name' )?.textContent === 'levels (m down)' && c.style.display !== 'none' ).querySelector( 'input' ).placeholder ), '1.5, 3.65, 5.85' );
	await setRow( 'levels (m down)', '4.5; 1.5' );
	p = await params();
	assert.equal( p.levels, '1.5, 4.5' );
	assert.equal( p.bracing, 'struts' );

	// The stage slider: as many steps as stages, counted from 1 as the stage readout counts them,
	// the last the finished pit (saved as -1), and the label says so.
	const count = await page.evaluate( i => window.exc.design.planExcavation( window.placed[ i ].params ).stages.length, i );
	const slider = () => page.evaluate( () => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root > .lil-children > .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		const row = [ ...folder.querySelectorAll( '.lil-controller' ) ].find( c => c.querySelector( '.lil-name' )?.textContent.startsWith( 'dig stage' ) );
		return { slider: !! row.querySelector( '.lil-slider' ), value: row.querySelector( 'input' ).value, name: row.querySelector( '.lil-name' ).textContent };

	} );
	assert.deepEqual( await slider(), { slider: true, value: String( count ), name: 'dig stage (finished)' } );
	await setRow( 'dig stage (…', 2 );
	assert.equal( ( await params() ).stage, 1 );
	assert.match( ( await panelRows() ).stage.value, new RegExp( `^2 of ${ count }: ` ) );
	assert.deepEqual( await slider(), { slider: true, value: '2', name: `dig stage (of ${ count })` } );
	await setRow( 'dig stage (…', count );
	assert.equal( ( await params() ).stage, - 1 );
	assert.equal( ( await panelRows() ).stage.shown, false );

	// The toolbar's Size editor still has just the size.
	await page.evaluate( () => document.querySelector( '.selection-toolbar .size' ).click() );
	assert.deepEqual( await page.evaluate( () => [ ...document.querySelectorAll( '.selection-toolbar input' ) ].map( input => input.name ) ), [ 'width', 'length', 'depth' ] );
	await page.keyboard.press( 'Escape' );

	// A pit from before keeps its single waler, offered as it was first drawn.
	const old = await place( { width: 12, length: 12, depth: 5, slope: 1, support: 'sheet-piles' }, - 1400, 700 );
	await page.evaluate( i => window.twin.sidebar.select( window.placed[ i ] ), old );
	await frames( 2 );
	rows = await panelRows();
	assert.equal( rows[ 'the rectangle is' ].value, 'the top of the cut' );
	assert.equal( rows.sides.value, 'shored' );
	assert.equal( rows[ 'support levels' ].value, 'as first drawn' );
	await setRow( 'support levels', 'rakers to kicker blocks' );
	assert.equal( ( await page.evaluate( i => window.placed[ i ].params.bracing, old ) ), 'rakers' );
	assert.equal( ( await panelRows() )[ 'support levels' ].value, 'rakers to kicker blocks' );
	assert.deepEqual( errors, [] );

} );

test( 'side labels: numbered with the way each faces while the pit is selected, at the middle of each top edge', async () => {

	await fresh();
	// Turned 30°: side 1 faces NE, then E (120°: SE), S... the top is off centre (a slope on side 2).
	const i = await place( { width: 10, length: 14, depth: 3, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'sheet-piles', side3: 'sheet-piles', side4: 'sheet-piles' }, - 1500, 900, 30 );
	await pose( - 1500, 900 - 26, 30, 0, - 50 );
	const labels = () => page.evaluate( i => window.twin.earthworks.labels.sideTexts( window.placed[ i ] ), i );
	const panelShown = () => page.evaluate( () => document.querySelector( '.lil-gui.lil-root' ).style.display !== 'none' );
	// Placed, not selected: its settings are folded away in the panel, and there are no numbers.
	assert.equal( await panelShown(), true );
	assert.deepEqual( ( await labels() ).map( l => l.shown ), [ false, false, false, false ] );
	await page.evaluate( i => window.twin.sidebar.select( window.placed[ i ] ), i );
	await frames( 3 );
	assert.deepEqual( await labels(), [ '1 · NE', '2 · SE', '3 · SW', '4 · NW' ].map( text => ( { text, shown: true } ) ) );
	// Each a metre out from the middle of its side's top edge (clear of the handles there), 0.3 m
	// over the rim, on screen.
	const where = await page.evaluate( i => {

		const entry = window.placed[ i ];
		const { pitToEnu, pitFrame, outlines, planExcavation } = window.exc.design;
		const { top } = outlines( planExcavation( entry.params ).geom );
		const frame = pitFrame( entry.state );
		const [ u, v ] = [ ( top.u0 + top.u1 ) / 2, ( top.v0 + top.v1 ) / 2 ];
		return [ [ u, top.v1 + 1 ], [ top.u1 + 1, v ], [ u, top.v0 - 1 ], [ top.u0 - 1, v ] ].map( ( [ a, b ] ) => pitToEnu( frame, a, b ) );

	}, i );
	const chips = await page.evaluate( () => [ ...document.querySelectorAll( '.earthworks-labels .side-label' ) ].filter( e => ! e.hidden ).map( e => {

		const r = e.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.bottom };

	} ) );
	for ( const [ k, { east, north } ] of where.entries() ) {

		const s = await screenOf( east, north, 0.3 );
		assert.ok( near( chips[ k ].x, s.x, 1.5 ) && near( chips[ k ].y, s.y, 1.5 ), `side ${ k + 1 }: ${ JSON.stringify( chips[ k ] ) } against ${ JSON.stringify( s ) }` );

	}

	// Not .label: the Labels layer counts one label a pit. Hidden with that layer, and when the
	// pit isn't selected and its settings are folded away.
	assert.equal( await page.evaluate( () => document.querySelectorAll( '.earthworks-labels .label' ).length ), 1 );
	await page.evaluate( () => document.body.classList.add( 'labels-hidden' ) );
	assert.equal( await page.evaluate( () => getComputedStyle( document.querySelector( '.earthworks-labels' ) ).display ), 'none' );
	await page.evaluate( () => document.body.classList.remove( 'labels-hidden' ) );
	// Not selected, but its settings still open in the P panel: still numbered; with the panel put
	// away (P), not.
	await page.evaluate( () => window.twin.sidebar.deselect() );
	await frames( 2 );
	assert.deepEqual( ( await labels() ).map( l => l.shown ), [ true, true, true, true ] );
	await page.keyboard.press( 'KeyP' );
	await frames( 2 );
	assert.equal( await panelShown(), false );
	assert.deepEqual( ( await labels() ).map( l => l.shown ), [ false, false, false, false ] );
	await page.keyboard.press( 'KeyP' );
	await frames( 2 );
	assert.deepEqual( ( await labels() ).map( l => l.shown ), [ true, true, true, true ] );
	// Out of build mode, none.
	await page.evaluate( () => document.getElementById( 'library-toggle' ).click() );
	await frames( 2 );
	assert.equal( await page.evaluate( () => document.querySelector( '.earthworks-labels' ).hidden ), true );
	await page.evaluate( () => document.getElementById( 'library-toggle' ).click() );

} );

test( 'the Excavation tool: the rectangle is the floor, the sides slope out for the soil, and it digs itself', async () => {

	await fresh();
	await pose( - 1500, 1100 - 30, 40, 0, - 50 );
	await page.evaluate( () => [ ...document.querySelectorAll( '#library .card.tool' ) ].find( c => c.querySelector( '.name' ).textContent === 'Excavation' ).click() );
	const a = await screenOf( - 1500 - 7, 1100 - 4 );
	const b = await screenOf( - 1500 + 7, 1100 + 4 );
	await page.mouse.move( a.x, a.y );
	await page.mouse.down();
	await page.mouse.move( b.x, b.y, { steps: 6 } );
	// While it's dragged: the floor, the top of the cut it makes dashed round it (3 m out, 2 m
	// deep at 1.5 : 1), and both sizes by the pointer.
	const dragging = await page.evaluate( () => {

		const lines = [];
		window.twin.scene.traverse( o => o.isLineLoop && o.visible && lines.push( { dashed: o.material.isLineDashedMaterial, xs: [ ...o.geometry.attributes.position.array ].filter( ( _, k ) => k % 3 === 0 ) } ) );
		const width = line => Math.max( ...line.xs ) - Math.min( ...line.xs );
		const label = [ ...document.querySelectorAll( '.drawing-label' ) ].map( e => e.textContent );
		return { floor: lines.filter( l => ! l.dashed ).map( width ), top: lines.filter( l => l.dashed ).map( width ), label };

	} );
	assert.equal( dragging.top.length, 1 );
	assert.ok( near( dragging.top[ 0 ] - dragging.floor[ 0 ], 6, 0.05 ), JSON.stringify( dragging ) );
	assert.match( dragging.label[ 0 ], /^floor [\d.]+ × [\d.]+ m · top [\d.]+ × [\d.]+ m · 2\.0 m deep · ≈ [\d,]+ m³ cut$/ );
	await page.mouse.up();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'excavation' ) );
	// Gone once it's made.
	assert.equal( await page.evaluate( () => document.querySelectorAll( '.drawing-label' ).length ), 0 );
	const made = await page.evaluate( () => {

		const { models, earthworks, terrain } = window.twin;
		const entry = models.entries.find( e => e.kind === 'excavation' );
		window.placed = [ entry ];
		return { saved: models.toConfig( entry ).params, digging: earthworks.anims.has( entry ), cut: terrain.designVolume( entry ).cut, selected: window.twin.sidebar.getSelected() === entry };

	} );
	assert.equal( made.selected, true );
	assert.equal( made.digging, true );
	// Saved with only what differs from a pit from before.
	assert.deepEqual( Object.keys( made.saved ), [ 'width', 'length', 'depth', 'slope', 'support', 'outline', 'slopeBy', 'bracing' ] );
	assert.ok( near( made.saved.width, 14, 0.2 ) && near( made.saved.length, 8, 0.2 ), JSON.stringify( made.saved ) );
	// Halfway through the dig (its clock set there: frames come slowly in a busy test browser, and
	// the animation moves at most 0.1 s a frame), then to its end.
	const skip = fraction => page.evaluate( async fraction => {

		const { earthworks, terrain } = window.twin;
		const anim = earthworks.anims.get( window.placed[ 0 ] );
		if ( anim ) anim.t = anim.duration * fraction;
		terrain.touch( window.placed[ 0 ] );
		terrain.flush();
		return terrain.designVolume( window.placed[ 0 ] ).cut;

	}, fraction );
	const halfway = await skip( 0.5 );
	await skip( 1 );
	await page.waitForFunction( () => ! window.twin.earthworks.anims.has( window.placed[ 0 ] ), null, { timeout: 60000 } );
	const r = await inspect( 0 );
	assert.equal( r.wrong, 0, JSON.stringify( r.first ) );
	assert.ok( halfway > 1 && halfway < r.cut * 0.8, `${ halfway } of ${ r.cut } m³ while digging` );
	// 2 m down at 1.5 : 1: 3 m out on every side.
	const [ topWidth, topLength ] = [ made.saved.width + 6, made.saved.length + 6 ];
	assert.equal( r.top, `${ topWidth.toFixed( 1 ) } × ${ topLength.toFixed( 1 ) } m, ${ Math.round( topWidth * topLength ).toLocaleString( 'en-CA' ) } m²` );

	// Dig again at a stage digs to that stage only.
	await page.evaluate( () => {

		const { models, earthworks } = window.twin;
		models.setParams( window.placed[ 0 ], { stage: 0 } );
		earthworks.dig( window.placed[ 0 ] );

	} );
	await skip( 1 );
	await page.waitForFunction( () => ! window.twin.earthworks.anims.has( window.placed[ 0 ] ), null, { timeout: 60000 } );
	assert.ok( near( ( await inspect( 0 ) ).cut, 0, 1e-6 ) );

} );

test( 'resizing a pit drawn by its floor outlines the top of the cut and the floor, and says both', async () => {

	await fresh();
	const i = await place( { width: 10, length: 16, depth: 3, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side2: 'sheet-piles' }, - 1500, 1300 );
	await page.evaluate( i => window.twin.sidebar.select( window.placed[ i ] ), i );
	await pose( - 1500, 1300 - 34, 40, 0, - 50 );
	await page.waitForFunction( () => window.twin.sidebar.handles.positions().some( h => h.type === 'corner' ) );
	const corner = await page.evaluate( () => window.twin.sidebar.handles.positions().find( h => h.type === 'corner' && h.sx === 1 && h.sy === 1 ).screen );
	const to = await screenOf( - 1500 + 7, 1300 + 12 );
	await page.mouse.move( corner.x, corner.y );
	await page.mouse.down();
	await page.mouse.move( to.x, to.y, { steps: 5 } );
	await frames( 2 );
	const during = await page.evaluate( () => {

		const { scene, sidebar } = window.twin;
		// The outlines: lines over everything, scaled to a rectangle (the ring is scaled alike all
		// ways, the plumb line only down).
		const lines = scene.children.filter( o => o.isLine2 && o.visible && o.scale.y === 1 && o.scale.x !== o.scale.z ).map( o => ( { width: o.scale.x, length: o.scale.z, y: o.position.y } ) );
		return { label: sidebar.handles.label(), lines };

	} );
	await page.mouse.up();
	await frames( 2 );
	const after = await page.evaluate( i => ( { ...window.placed[ i ].params } ), i );
	// Floor 12 x 20 (the front right corner moved 2 m right and 4 m forward), 3 m down: the sides
	// slope 4.5 m out (soil C) except side 2's wall: the top 16.5 x 29.
	assert.equal( after.width, 12 );
	assert.equal( after.length, 20 );
	assert.equal( during.label, 'floor 12.0 × 20.0 m · top 16.5 × 29.0 m · 3.0 m deep · ≈ 1,058 m³ cut' );
	const sorted = during.lines.sort( ( a, b ) => b.y - a.y );
	assert.equal( sorted.length, 2, JSON.stringify( during.lines ) );
	assert.ok( near( sorted[ 0 ].width, 16.5, 1e-6 ) && near( sorted[ 0 ].length, 29, 1e-6 ), `top ${ JSON.stringify( sorted[ 0 ] ) }` );
	assert.ok( near( sorted[ 1 ].width, 12, 1e-6 ) && near( sorted[ 1 ].length, 20, 1e-6 ) && near( sorted[ 0 ].y - sorted[ 1 ].y, 3 + 0.08, 0.01 ), `floor ${ JSON.stringify( sorted[ 1 ] ) }` );
	const r = await inspect( i );
	assert.equal( r.wrong, 0 );
	assert.equal( r.top, '16.5 × 29.0 m, 479 m²' );

} );

test( 'a new pit saved and reloaded: its params, stage and ground as they were', async () => {

	await fresh();
	const specs = [
		[ { width: 12, length: 20, depth: 8, outline: 'floor', slopeBy: 'soil', bracing: 'auto', soil: 'B', method: 'sides', side1: 'sheet-piles', side2: 'slope', side3: 'bench', side4: 'secant-piles', stage: 3, groundwater: 3.5 }, - 1500, 1500, 20 ],
		[ { width: 8, length: 8, depth: 4, outline: 'floor', slopeBy: 'custom', slope: 0.85, bracing: 'auto', method: 'bench', benchHeight: 1.1, benchWidth: 2.2 }, - 1400, 1500, 0 ],
		[ { width: 20, length: 24, depth: 9, outline: 'floor', slopeBy: 'soil', bracing: 'tiebacks', support: 'soldier-piles', levels: '2, 5, 7.5', anchorAngle: 25, toe: 4 }, - 1300, 1500, 0 ],
		[ { width: 3, length: 18, depth: 2.5, outline: 'floor', slopeBy: 'soil', bracing: 'auto', support: 'hydraulic', ends: 'sloped', soil: 'A' }, - 1200, 1500, 300 ],
	];
	for ( const [ params, east, north, heading ] of specs ) await place( params, east, north, heading );
	const measure = () => page.evaluate( async () => {

		const { models, terrain, earthworks, layout } = window.twin;
		terrain.flush();
		const pits = models.entries.filter( e => e.kind === 'excavation' ).sort( ( a, b ) => a.state.east - b.state.east );
		const out = [];
		for ( const entry of pits ) {

			const { minX, maxX, minZ, maxZ } = earthworks.designs.get( entry ).bounds();
			const heights = [];
			for ( let x = Math.ceil( minX * 2 ) / 2; x <= maxX; x += 0.5 ) for ( let z = Math.ceil( minZ * 2 ) / 2; z <= maxZ; z += 0.5 ) heights.push( terrain.surfaceAt( x, z ) );
			const digest = [ ...new Uint8Array( await crypto.subtle.digest( 'SHA-256', new Float64Array( heights ) ) ) ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
			out.push( { params: { ...entry.params }, rim: earthworks.designs.get( entry ).rim, cut: terrain.designVolume( entry ).cut, digest } );

		}

		return { pits: out, saved: layout.getData().items.filter( item => item.kind === 'excavation' ).map( item => item.params ) };

	} );
	const before = await measure();
	// Saved with only the params that differ from what their absence means.
	assert.deepEqual( before.saved[ 0 ], { width: 12, length: 20, depth: 8, slope: 1, support: 'none', outline: 'floor', method: 'sides', side1: 'sheet-piles', side3: 'bench', side4: 'secant-piles', soil: 'B', slopeBy: 'soil', bracing: 'auto', groundwater: 3.5, stage: 3 } );
	assert.deepEqual( before.saved[ 2 ], { width: 20, length: 24, depth: 9, slope: 1, support: 'soldier-piles', outline: 'floor', slopeBy: 'soil', bracing: 'tiebacks', levels: '2, 5, 7.5', toe: 4, anchorAngle: 25 } );
	assert.equal( before.pits[ 0 ].params.stage, 3 );
	await page.waitForTimeout( 800 );
	await openApp();
	await page.waitForFunction( n => window.twin.models.entries.filter( e => e.kind === 'excavation' ).length === n, specs.length );
	await modules();
	const after = await measure();
	assert.deepEqual( after, before );
	console.log( `saved and reloaded: ${ after.pits.map( p => `${ p.params.method } ${ p.cut.toFixed( 1 ) } m³` ).join( ', ' ) }` );
	assert.deepEqual( errors, [] );

} );

test( 'with the map still streaming in, the ground under earthworks comes from the sharp tiles, to their edges', async () => {

	// The real ground code against a made-up map: at first only the coarse tile that loads first
	// (the ground 1490 m up, as Google's first tile has it here), then sharp ones (the ground at 0),
	// with tiles going on loading all the while and each read slow, as raycasting Google's mesh is.
	// Reads restarting whenever a tile loaded used to keep a chunk from ever getting through its
	// quick look; and nodes on the far edges of the earthworks, which no chunk owns, kept the coarse
	// ground for good.
	await openApp();
	const result = await page.evaluate( async () => {

		const { Terrain } = await import( '/src/terrain.js' );
		const { models, camera } = window.twin;
		const Dispatcher = Object.getPrototypeOf( models.constructor );
		const tiles = new Dispatcher();
		let sharp = false;
		const flattening = {
			originalHeight( x, z, ground, detail ) {

				const t0 = performance.now();
				while ( performance.now() - t0 < 0.4 );
				if ( detail ) detail.error = sharp ? 2 : 32872;
				return sharp ? 0 : 1490;

			},
		};
		const terrain = new Terrain( { tiles, ground: null, models: Object.assign( new Dispatcher(), { entries: [] } ), flattening, getGround: () => [], camera } );
		// Four pits in chunks of their own, each 3 m deep in a 10 m square.
		for ( const [ x, z ] of [ [ 5, 5 ], [ 45, 5 ], [ 5, 45 ], [ 85, 85 ] ] ) {

			terrain.setDesign( `pit ${ x },${ z }`, { type: 'cut', top: 1, order: () => 0, bounds: () => ( { minX: x - 5, maxX: x + 5, minZ: z - 5, maxZ: z + 5 } ), height: () => - 3 } );

		}

		const worst = () => {

			let high = 0;
			for ( const chunk of terrain.chunks.values() ) for ( const h of chunk.h0 ) high = Math.max( high, Math.abs( h ) );
			return high;

		};
		let step = 0;
		for ( ; step < 900; step ++ ) {

			sharp = step >= 5;
			tiles.dispatchEvent( { type: 'load-model' } );
			terrain.update( 0.1 );
			if ( sharp && worst() < 0.01 ) break;

		}

		return { chunks: terrain.chunks.size, seconds: step / 10, worst: worst() };

	} );
	console.log( `ground under ${ result.chunks } chunks sharp after ${ result.seconds } s of streaming` );
	assert.ok( result.worst < 0.01, `ground still ${ result.worst.toFixed( 1 ) } m off after ${ result.seconds } s: ${ JSON.stringify( result ) }` );

} );

test( 'an excavator\'s digging filled in: in a rectangle with the Fill in tool, or all of it, with Undo', async () => {

	await openApp();
	await fresh();
	await page.evaluate( () => localStorage.removeItem( 'neptune-twin.layout.Neptune Terminals' ) );
	// Two holes and a heap, as an excavator leaves them (x is minus east), beside a pit placed with
	// the Excavation tool, which filling in leaves alone.
	const [ E, N ] = [ - 1500, 1300 ];
	await place( { width: 6, length: 6, depth: 2 }, E + 12, N, 0 );
	const read = () => page.evaluate( ( [ E, N ] ) => {

		const { terrain, models } = window.twin;
		terrain.flush();
		// Where nothing has been dug yet there are no earthworks: the ground itself.
		const at = ( east, north ) => +( terrain.surfaceAt( - east, north ) ?? terrain.heightAt( - east, north ) ).toFixed( 2 );
		const pit = models.entries.find( e => e.kind === 'excavation' );
		return { a: at( E - 8, N ), b: at( E, N ), heap: at( E, N + 8 ), pit: +terrain.designVolume( pit ).cut.toFixed( 1 ), any: terrain.hasFreeform() };

	}, [ E, N ] );
	const flat = await read();
	await page.evaluate( ( [ E, N ] ) => {

		const { terrain } = window.twin;
		terrain.dig( { x: - ( E - 8 ), z: N, width: 2, length: 2, volume: 4 } );
		terrain.dig( { x: - E, z: N, width: 2, length: 2, volume: 4 } );
		terrain.deposit( { x: - E, z: N + 8, volume: 3 } );

	}, [ E, N ] );
	const dug = await read();
	assert.ok( dug.a < flat.a - 0.5 && dug.b < flat.b - 0.5 && dug.heap > flat.heap + 0.2, JSON.stringify( { flat, dug } ) );

	// The tool, dragged over the first hole only.
	await pose( E - 4, N - 25, 30, 0, - 50 );
	await page.evaluate( () => [ ...document.querySelectorAll( '#library .card.tool' ) ].find( c => c.querySelector( '.name' ).textContent === 'Fill in' ).click() );
	const from = await screenOf( E - 10, N - 2 );
	const to = await screenOf( E - 6, N + 2 );
	await page.mouse.move( from.x, from.y );
	await page.mouse.down();
	await page.mouse.move( to.x, to.y, { steps: 6 } );
	await page.mouse.up();
	await frames( 2 );
	const one = await read();
	assert.deepEqual( [ one.a, one.b, one.heap, one.pit ], [ flat.a, dug.b, dug.heap, flat.pit ], JSON.stringify( { flat, dug, one } ) );
	assert.match( await page.locator( '.toast' ).last().textContent(), /Filled in the digging there/ );

	// Undo puts the hole back.
	await page.locator( '.toast button', { hasText: 'Undo' } ).last().click();
	await frames( 2 );
	assert.equal( ( await read() ).a, dug.a );

	// All of it, from beside Clear: the holes and the heap, not the pit.
	await page.locator( '#library footer .fill-in' ).click();
	await frames( 2 );
	const none = await read();
	assert.deepEqual( none, { ...flat, any: false } );
	// Saved like that.
	await page.waitForTimeout( 800 );
	assert.equal( await page.evaluate( () => window.twin.layout.getData().extras.terrain ?? null ), null );

	// Nothing left to fill: says so, and changes nothing.
	await page.locator( '#library footer .fill-in' ).click();
	assert.match( await page.locator( '.toast' ).last().textContent(), /Nothing dug or dumped/ );
	assert.deepEqual( errors, [] );

} );
