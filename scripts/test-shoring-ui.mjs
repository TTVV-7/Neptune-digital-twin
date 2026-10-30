// npm run test:shoring-ui: excavation shoring and the Shoring library items in a real browser,
// against the Vite dev server with no Google tiles; every request that isn't to the local server
// is blocked. Each support in a trench and a pit (and a trench drawn across), fitted inside its
// outline; trench box runs and stacks; readouts and warnings; back to a sloped pit; rebuilt when
// resized; shown with the library closed; draw calls; library pieces placed, turned, saved and
// reloaded.
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
const PORT = Number( process.env.TEST_VITE_PORT ) || 5197;
const SHOTS = process.env.TEST_SCREENSHOTS;
const SUPPORTS = [ 'trench-box', 'slide-rail', 'hydraulic', 'sheet-piles', 'soldier-piles' ];
// How far each support may stand outside the outline: its own thickness (a box panel's ribs,
// half a Z-sheet's depth, an H-pile's outer flange).
const OUTSIDE = { 'trench-box': 0.12, 'slide-rail': 0.12, 'hydraulic': 0.12, 'sheet-piles': 0.2, 'soldier-piles': 0.155 };
const PIECES = [ 'trench-box-8x16', 'trench-box-8x20', 'trench-box-8x24', 'trench-box-stacker-4x20', 'trench-box-panel', 'sheet-pile-bundle', 'h-pile-bundle', 'hydraulic-shore' ];

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
	// Start from an empty layout.
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
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.shoring && window.twin.terrain );

}

// An excavation at (east, north), with its shoring's extent in the pit's frame (earth left out).
async function pit( params, east, north = 0, heading = 0 ) {

	return page.evaluate( async ( { params, east, north, heading } ) => {

		const { models } = window.twin;
		const entry = await models.load( { kind: 'excavation', params, east, north, heading, up: null } );
		window.pits = [ ...window.pits ?? [], entry ];
		return window.pits.length - 1;

	}, { params, east, north, heading } );

}

// What's drawn for pit i: its plan, the extent of the shoring in the pit's frame, how far any
// sheet is from the outline, and how many meshes.
async function inspect( i ) {

	return page.evaluate( i => {

		const { shoring } = window.twin;
		const entry = window.pits[ i ];
		const plan = shoring.planShoring( entry.params );
		const item = shoring.shown.get( entry );
		const { width, length } = entry.params;
		const result = { params: { ...entry.params }, summary: plan.summary, wall: plan.wall, weight: plan.weight, notes: plan.notes, drawn: !! item, meshes: 0 };
		if ( ! item ) return result;
		const frame = item.group;
		frame.updateMatrixWorld( true );
		const toFrame = frame.matrixWorld.clone().invert();
		const v = frame.position.clone();
		const box = { x: 0, z: 0, low: Infinity, high: - Infinity, sheetOff: 0 };
		frame.traverse( mesh => {

			if ( ! mesh.isMesh ) return;
			result.meshes ++;
			if ( mesh.material.name === 'shoring earth' ) return;
			const m = toFrame.clone().multiply( mesh.matrixWorld );
			const position = mesh.geometry.attributes.position;
			for ( let n = 0; n < position.count; n ++ ) {

				v.fromBufferAttribute( position, n ).applyMatrix4( m );
				box.x = Math.max( box.x, Math.abs( v.x ) );
				box.z = Math.max( box.z, Math.abs( v.z ) );
				box.low = Math.min( box.low, v.y );
				box.high = Math.max( box.high, v.y );
				if ( mesh.material.name === 'shoring sheet' ) box.sheetOff = Math.max( box.sheetOff, Math.min( Math.abs( width / 2 - Math.abs( v.x ) ), Math.abs( length / 2 - Math.abs( v.z ) ) ) );

			}

		} );
		result.extent = box;
		result.visible = frame.visible && frame.parent.visible && ! entry.pivot.visible;
		return result;

	}, i );

}

// Open or close the library sidebar (build mode).
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

test( 'trench box runs: fewest boxes that leave no room for another, stacked 0.3 m out of the ground', async () => {

	const { runs, stacks } = await page.evaluate( async () => {

		const { boxRun, boxStack } = await import( '/src/shoring.js' );
		return {
			runs: [ 6, 13.4, 20, 25.5, 2, 9.9 ].map( boxRun ),
			stacks: [ 1, 1.5, 2.4, 3, 5 ].map( boxStack ),
		};

	} );
	assert.deepEqual( runs, [ [ 16 ], [ 24, 20 ], [ 24, 24, 16 ], [ 24, 24, 24, 10 ], [], [ 24, 8 ] ] );
	// 2.4 m deep takes a stacker too: a lone 8 ft box would be level with the rim.
	assert.deepEqual( stacks, [ [ 4 ], [ 8 ], [ 8, 4 ], [ 8, 4 ], [ 8, 8, 4 ] ] );

} );

const fits = [];
test( 'each support fits its trench and pit, and says what it is', async () => {

	const sizes = [ [ 3, 20, 3 ], [ 12, 12, 5 ], [ 20, 3, 3 ] ];
	for ( const [ s, support ] of SUPPORTS.entries() ) {

		for ( const [ k, [ width, length, depth ] ] of sizes.entries() ) {

			const i = await pit( { width, length, depth, slope: 1, support }, s * 40, k * 40 );
			const r = await inspect( i );
			fits.push( { support, width, length, depth, ...r } );
			assert.ok( r.drawn, `${ support } ${ width }x${ length } drawn` );
			const tol = OUTSIDE[ support ];
			assert.ok( r.extent.x <= width / 2 + tol + 1e-3, `${ support } ${ width }x${ length }x${ depth }: ${ r.extent.x.toFixed( 3 ) } across` );
			assert.ok( r.extent.z <= length / 2 + tol + 1e-3, `${ support } ${ width }x${ length }x${ depth }: ${ r.extent.z.toFixed( 3 ) } along` );
			assert.ok( r.extent.low >= - depth - 0.25, `${ support }: down to ${ r.extent.low }` );
			// At least 0.3 m out of the ground (WorkSafeBC 20.81(5)), and not towering over it.
			assert.ok( r.extent.high >= 0.29 && r.extent.high <= 1.6, `${ support }: up to ${ r.extent.high }` );
			if ( support === 'sheet-piles' ) assert.ok( r.extent.sheetOff <= 0.2 + 1e-3, `sheets ${ r.extent.sheetOff } from the outline` );
			// Lines the walls rather than standing in the middle.
			assert.ok( ( width <= length ? r.extent.x : r.extent.z ) >= Math.min( width, length ) / 2 - 0.5, `${ support }: reaches the sides` );
			assert.ok( r.wall > 0 && r.weight.includes( ' t ' ) && r.summary.length > 10 );

		}

	}

	const find = ( support, width, length ) => fits.find( f => f.support === support && f.width === width && f.length === length );
	const box = find( 'trench-box', 3, 20 );
	assert.match( box.summary, /^3 boxes: 2 × 2\.4 × 7\.3 m \(8 × 24 ft\) \+ 1 × 2\.4 × 4\.9 m \(8 × 16 ft\), with stackers 2 × 1\.2 × 7\.3 m \(4 × 24 ft\) \+ 1 × 1\.2 × 4\.9 m \(4 × 16 ft\); 2\.8 m between panels/ );
	assert.ok( box.notes.some( n => n.startsWith( 'Ends are open: slope them, or fit end plates' ) ) );
	assert.ok( box.notes.some( n => n.startsWith( '3 boxes line all of it' ) ) );
	assert.ok( Math.abs( box.extent.z - 19.507 / 2 ) < 0.05, 'the run is centred, 64 ft long' );
	// Drawn across: the run follows the long side, x.
	const across = find( 'trench-box', 20, 3 );
	assert.ok( Math.abs( across.extent.x - 19.507 / 2 ) < 0.05 && across.extent.z <= 1.5 + 0.12 );
	assert.ok( find( 'trench-box', 12, 12 ).notes.some( n => n.startsWith( 'Too wide for a trench box' ) ) );
	assert.ok( find( 'hydraulic', 12, 12 ).notes.some( n => n.startsWith( 'Too wide for hydraulic shores' ) ) );
	assert.ok( ! find( 'hydraulic', 3, 20 ).notes.some( n => n.startsWith( 'Too wide' ) ) );
	assert.match( find( 'hydraulic', 3, 20 ).summary, /^9 shores 2\.4 m apart, 3 cylinders each/ );
	assert.match( find( 'sheet-piles', 12, 12 ).summary, /^80 sheets, 48 m of wall, 9\.0 m long each .*2 struts across, 4 corner braces$/ );
	assert.match( find( 'sheet-piles', 3, 20 ).summary, /^76 sheets, 46 m of wall, 7\.0 m long each .*waler round the inside$/ );
	// Lagging to 0.3 m out of the ground: 48 m round, 5.3 m high.
	assert.match( find( 'soldier-piles', 12, 12 ).summary, /^20 soldier piles .* 254 m² of timber lagging/ );
	assert.ok( find( 'soldier-piles', 12, 12 ).notes.some( n => n.startsWith( 'Over 4 m deep' ) ) );
	assert.match( find( 'slide-rail', 12, 12 ).summary, /^36 panels in 12 posts/ );
	assert.equal( find( 'sheet-piles', 12, 12 ).wall, 240 );
	for ( const f of fits ) console.log( `${ f.support } ${ f.width }×${ f.length }×${ f.depth }: ${ f.summary } | ${ Math.round( f.wall ) } m² | ${ f.weight } | ${ f.meshes } meshes${ f.notes.length ? ` | ${ f.notes.join( ' ' ) }` : '' }` );

	// A picture of each, from an angle that shows it, with the library closed.
	for ( const [ s, support ] of SUPPORTS.entries() ) {

		const trench = support === 'trench-box' || support === 'hydraulic';
		await look( trench ? { east: s * 40, north: 0, up: - 1.5, distance: 11, from: 205, elevation: 33 } : { east: s * 40, north: 40, up: - 2.5, distance: 17, from: 210, elevation: 36 } );
		await shot( `support-${ support }` );

	}

} );

test( 'box sizes follow the trench: 6, 13.4, 20 and 25.5 m long, 1.5, 2.4, 3 and 5 m deep', async () => {

	// Box lengths along the trench and panel heights up from the floor, in feet, and the top.
	const lengths = { 6: [ 16 ], 13.4: [ 24, 20 ], 20: [ 24, 24, 16 ], 25.5: [ 24, 24, 24, 10 ] };
	const depths = { 1.5: [ [ 8 ], 'top 0.9 m above' ], 2.4: [ [ 8, 4 ], 'top 1.3 m above' ], 3: [ [ 8, 4 ], 'top 0.7 m above' ], 5: [ [ 8, 8, 4 ], 'top 1.1 m above' ] };
	const FT = 0.3048;
	// "3 boxes: 2 × 2.4 × 7.3 m (8 × 24 ft) + ..., with stackers 2 × 1.2 × 7.3 m (4 × 24 ft) + ...; "
	const expected = ( run, stack ) => {

		const stackers = stack.length > 1 && stack.at( - 1 ) === 4 ? 1 : 0;
		const high = stack.length - stackers;
		const sizes = ( ft, each ) => [ ...new Set( run ) ].map( long => `${ each * run.filter( l => l === long ).length } × ${ ( ft * FT ).toFixed( 1 ) } × ${ ( long * FT ).toFixed( 1 ) } m (${ ft } × ${ long } ft)` ).join( ' + ' );
		const count = run.length * high;
		const on = stackers ? `, with stacker${ run.length === 1 ? '' : 's' } ${ sizes( 4, 1 ) }` : '';
		return `${ count } box${ count === 1 ? '' : 'es' }${ high > 1 ? `, ${ high } high` : '' }: ${ sizes( stack[ 0 ], high ) }${ on }; 2.8 m between panels, `;

	};
	const plans = await page.evaluate( ( { lengths, depths } ) => {

		const { shoring } = window.twin;
		const out = {};
		for ( const length of lengths ) for ( const depth of depths ) out[ `${ length } ${ depth }` ] = shoring.planShoring( { width: 3, length, depth, slope: 1, support: 'trench-box' } ).summary;
		return out;

	}, { lengths: Object.keys( lengths ).map( Number ), depths: Object.keys( depths ).map( Number ) } );
	for ( const [ length, run ] of Object.entries( lengths ) ) {

		for ( const [ depth, [ stack, top ] ] of Object.entries( depths ) ) {

			const summary = plans[ `${ length } ${ depth }` ];
			assert.equal( summary, `${ expected( run, stack ) }${ top } the rim` );

		}

	}

	console.log( Object.entries( plans ).map( ( [ k, v ] ) => `${ k.replace( ' ', ' m long, ' ) } m deep: ${ v }` ).join( '\n' ) );
	// Drawn: the stack stands 0.3 m out of the ground and the run stays inside the trench.
	for ( const [ k, [ length, depth ] ] of [ [ 6, 1.5 ], [ 13.4, 2.4 ], [ 25.5, 5 ] ].entries() ) {

		const r = await inspect( await pit( { width: 3, length, depth, slope: 1, support: 'trench-box' }, 300 + k * 10, 300 ) );
		assert.ok( r.extent.high >= 0.3 && r.extent.z <= length / 2 + 0.12 && r.extent.low >= - depth - 0.01, `${ length } × ${ depth }: ${ JSON.stringify( r.extent ) }` );

	}

} );

test( 'P panel: support dropdown, slope greyed out, notes in full; WorkSafeBC note when unsupported', async () => {

	const notes = await page.evaluate( async () => {

		const { models, sidebar, shoring } = window.twin;
		const entry = await models.load( { kind: 'excavation', params: { width: 3, length: 20, depth: 3, slope: 1, support: 'trench-box' }, east: 0, north: - 60, heading: 0, up: null } );
		window.panelPit = entry;
		if ( ! sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();
		sidebar.select( entry );
		const plan = n => shoring.planShoring( { width: 3, length: 20, depth: n.depth, slope: n.slope, support: 'none' } ).notes;
		return {
			steep: plan( { depth: 3, slope: 0.5 } ),
			shallow: plan( { depth: 1.0, slope: 0 } ),
			sloped: plan( { depth: 3, slope: 1 } ),
			deep: plan( { depth: 7, slope: 1.5 } ),
		};

	} );
	const steep = 'Over 1.2 m deep, with sides steeper than WorkSafeBC allows even in hard, solid soil (3 : 4): slope, bench or shore them before anyone goes in (OHS Regulation 20.81).';
	assert.deepEqual( notes.steep, [ steep ] );
	assert.deepEqual( notes.shallow, [] );
	assert.deepEqual( notes.sloped, [] );
	assert.deepEqual( notes.deep, [ 'Over 6 m deep: dug to a qualified registered professional\'s written instructions (WorkSafeBC 20.78).' ] );

	// The panel opens on the selected pit.
	if ( await page.evaluate( () => document.querySelector( '.lil-gui.lil-root' ).style.display === 'none' ) ) await page.keyboard.press( 'KeyP' );
	const panel = () => page.evaluate( () => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		const row = name => [ ...folder.querySelectorAll( '.lil-controller' ) ].find( c => c.querySelector( '.lil-name' )?.textContent === name );
		return {
			slopeDisabled: row( 'side slope (h : v)' ).classList.contains( 'lil-disabled' ),
			support: row( 'support' ).querySelector( 'select' ).selectedOptions[ 0 ].textContent,
			notes: [ ...folder.querySelectorAll( '.lil-controller.note' ) ].filter( c => c.style.display !== 'none' ).map( c => c.querySelector( '.readout-note' ).textContent ),
			wall: row( 'shored wall' )?.style.display === 'none' ? null : row( 'shored wall' )?.querySelector( 'input' ).value,
			floor: row( 'floor' ).querySelector( 'input' ).value,
		};

	} );
	let p = await panel();
	assert.equal( p.slopeDisabled, true );
	assert.equal( p.support, 'Trench box' );
	assert.equal( p.floor, '3.0 × 20.0 m' );
	assert.equal( p.wall, '117 m²' );
	assert.ok( p.notes[ 0 ].startsWith( '3 boxes:' ) && p.notes[ 1 ].startsWith( 'Ends are open' ), p.notes.join( ' / ' ) );
	const reveal = () => page.evaluate( () => [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' ).scrollIntoView() );
	await reveal();
	await look( { east: 0, north: - 60, up: - 1.5, distance: 11, from: 205, elevation: 33 } );
	await shot( 'panel-trench-box' );

	// Through the dropdown, as a person would: none, with steep sides.
	await page.evaluate( () => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		const select = name => [ ...folder.querySelectorAll( '.lil-controller' ) ].find( c => c.querySelector( '.lil-name' )?.textContent === name ).querySelector( 'select' );
		const choose = ( name, text ) => {

			const s = select( name );
			s.selectedIndex = [ ...s.options ].findIndex( o => o.textContent === text );
			s.dispatchEvent( new Event( 'change' ) );

		};
		choose( 'support', 'none / sloped' );
		choose( 'side slope (h : v)', '0.5 : 1' );

	} );
	p = await panel();
	assert.equal( p.slopeDisabled, false );
	assert.equal( p.wall, null );
	assert.deepEqual( p.notes, [ steep ] );
	assert.equal( await page.evaluate( () => window.twin.shoring.shown.has( window.panelPit ) ), false );
	await reveal();
	await shot( 'panel-unsupported' );
	await library( false );

} );

test( 'back to none: the sloped pit returns; and a resize rebuilds the shoring', async () => {

	const r = await page.evaluate( async () => {

		const { models, terrain, shoring } = window.twin;
		const entry = await models.load( { kind: 'excavation', params: { width: 12, length: 12, depth: 5, slope: 1, support: 'sheet-piles' }, east: 200, north: 0, heading: 0, up: null } );
		terrain.flush();
		const rim = shoring.shown.get( entry ).group.position.y;
		// 1 m in from the east side.
		const near = () => terrain.heightAt( - ( 200 + 5 ), 0 ) - rim;
		const cut = () => terrain.designVolume( entry ).cut;
		const shored = { near: near(), cut: cut() };
		models.setParams( entry, { support: 'none' } );
		terrain.flush();
		const sloped = { near: near(), cut: cut(), drawn: shoring.shown.has( entry ), slope: entry.params.slope };
		models.setParams( entry, { support: 'sheet-piles' } );
		terrain.flush();
		const again = { near: near(), cut: cut() };

		const trench = await models.load( { kind: 'excavation', params: { width: 3, length: 20, depth: 3, slope: 1, support: 'trench-box' }, east: 200, north: 60, heading: 30, up: null } );
		const first = shoring.shown.get( trench ).group;
		models.setParams( trench, { length: 25.5 } );
		const longer = shoring.shown.get( trench ).group;
		const longerPlan = shoring.planShoring( trench.params ).summary;
		models.setParams( trench, { depth: 5, width: 5 } );
		const deeper = shoring.planShoring( trench.params );
		trench.state.east = 210;
		models.apply( trench );
		const moved = shoring.shown.get( trench ).group.position.x;
		window.pits.push( trench );
		return { shored, sloped, again, rebuilt: first !== longer && ! first.parent, longerPlan, deeper: deeper.summary, wide: deeper.notes, moved };

	} );
	assert.ok( Math.abs( r.shored.near + 5 ) < 0.05, `vertical side: ${ r.shored.near }` );
	assert.ok( Math.abs( r.shored.cut - 720 ) < 8, `cut ${ r.shored.cut }` );
	assert.equal( r.sloped.drawn, false );
	assert.equal( r.sloped.slope, 1 );
	assert.ok( Math.abs( r.sloped.near + 1 ) < 0.1, `1 : 1 side: ${ r.sloped.near }` );
	// 12 x 12 at the top, 2 x 2 at the floor, 5 deep: 286.7 m³ by the prismoidal formula.
	assert.ok( Math.abs( r.sloped.cut - 286.7 ) < 4, `sloped cut ${ r.sloped.cut }` );
	assert.ok( Math.abs( r.again.cut - 720 ) < 8 );
	assert.equal( r.rebuilt, true );
	assert.match( r.longerPlan, /^4 boxes: 3 × 2\.4 × 7\.3 m \(8 × 24 ft\) \+ 1 × 2\.4 × 3\.0 m \(8 × 10 ft\), with stackers 3 × 1\.2 × 7\.3 m/ );
	assert.match( r.deeper, /^8 boxes, 2 high: .*; 4\.8 m between panels, top 1\.1 m above the rim$/ );
	assert.ok( r.wide.some( n => n.startsWith( 'Too wide for a trench box' ) ) );
	assert.equal( r.moved, - 210 );
	const fit = await inspect( await page.evaluate( () => window.pits.length - 1 ) );
	assert.ok( fit.extent.z <= 25.5 / 2 + 0.12 && fit.extent.z > 12.4 && fit.extent.x <= 2.5 + 0.12 );

} );

test( 'walls straight up behind the shoring, turned with the pit; switching frees what it replaced', async () => {

	const r = await page.evaluate( async () => {

		const { models, terrain, renderer, scene, camera, shoring } = window.twin;
		// The colour at the middle of the view from a camera at `from` looking at `to` (in the pit's
		// frame: x east, y up from the rim, z north), with the shoring painted blue.
		const look = ( entry, from, to ) => {

			terrain.flush();
			const { group } = shoring.shown.get( entry );
			const world = ( [ e, y, n ] ) => camera.position.clone().set( - ( entry.state.east + e ), group.position.y + y, entry.state.north + n );
			camera.position.copy( world( from ) );
			camera.lookAt( world( to ) );
			camera.updateMatrixWorld();
			const painted = [];
			group.traverse( o => o.isMesh && o.material.name !== 'shoring earth' && painted.push( [ o.material, o.material.color.getHex() ] ) );
			painted.forEach( ( [ m ] ) => m.color.setHex( 0x0000ff ) );
			renderer.render( scene, camera );
			const gl = renderer.getContext();
			const pixel = new Uint8Array( 4 );
			gl.readPixels( gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel );
			painted.forEach( ( [ m, hex ] ) => m.color.setHex( hex ) );
			return pixel[ 2 ] > 2 * pixel[ 0 ] ? 'shoring' : `ground ${ [ ...pixel.slice( 0, 3 ) ] }`;

		};
		const sheets = await models.load( { kind: 'excavation', params: { width: 12, length: 12, depth: 5, slope: 1, support: 'sheet-piles' }, east: 400, north: 0, heading: 0, up: null } );
		const trench = await models.load( { kind: 'excavation', params: { width: 3, length: 20, depth: 3, slope: 1, support: 'trench-box' }, east: 450, north: 0, heading: 0, up: null } );
		// From the middle of the floor, 1 m up, at the foot of the west wall: 0.3 m up the sheets, and
		// 0.2 m up a box panel, where the terrain's face would have stood 2.5 and 1.4 m high.
		const shot = () => ( {
			sheets: look( sheets, [ 0, - 4, 0 ], [ - 6, - 4.7, 0 ] ),
			box: look( trench, [ 0, - 2, 0 ], [ - 1.5, - 2.8, 0 ] ),
		} );
		const straight = shot();
		const { uniforms } = shoring.ground;
		const count = uniforms.twinShoreCount.value;
		uniforms.twinShoreCount.value = 0;
		const sloped = shot();
		uniforms.twinShoreCount.value = count;

		// Turned: the shoring and its walls follow.
		models.setParams( trench, {} );
		trench.state.heading = 30;
		models.apply( trench );
		const yaw = shoring.shown.get( trench ).group.rotation.y;
		const turned = look( trench, [ 0, - 2, 0 ], [ - 1.5 * Math.cos( Math.PI / 6 ), - 2.8, 1.5 * Math.sin( Math.PI / 6 ) ] );

		// Twenty switches between the supports, then back to none: nothing left over.
		const supports = [ 'trench-box', 'slide-rail', 'hydraulic', 'sheet-piles', 'soldier-piles' ];
		const pit = await models.load( { kind: 'excavation', params: { width: 4, length: 18, depth: 3.5, slope: 1 }, east: 500, north: 0, heading: 25, up: null } );
		renderer.render( scene, camera );
		const memory = () => ( { geometries: renderer.info.memory.geometries, programs: renderer.info.programs.length } );
		const before = memory();
		for ( let i = 0; i < 20; i ++ ) {

			models.setParams( pit, { support: supports[ i % 5 ] } );
			renderer.render( scene, camera );

		}

		const during = memory();
		models.setParams( pit, { support: 'none' } );
		renderer.render( scene, camera );
		return { straight, sloped, yaw, turned, before, during, after: memory() };

	} );
	assert.deepEqual( r.straight, { sheets: 'shoring', box: 'shoring' } );
	// Without it, the steep face hides the foot of the walls: the test sees the difference.
	assert.match( r.sloped.sheets, /^ground/ );
	assert.match( r.sloped.box, /^ground/ );
	assert.ok( Math.abs( r.yaw - ( Math.PI - Math.PI / 6 ) ) < 1e-6, `yaw ${ r.yaw }` );
	assert.equal( r.turned, 'shoring' );
	assert.equal( r.after.geometries, r.before.geometries, JSON.stringify( r ) );
	assert.equal( r.after.programs, r.before.programs );
	assert.ok( r.during.geometries - r.before.geometries < 20, JSON.stringify( r ) );

} );

test( 'shown with the library closed and open; a 60 × 40 × 6 m sheet-piled pit is a few draw calls', async () => {

	await library( false );
	await look( { east: - 200, north: 0, up: - 3, distance: 80, from: 200, elevation: 40 } );
	const r = await page.evaluate( async () => {

		const { models, shoring, renderer, scene, camera } = window.twin;
		const closed = { build: models.buildMode, visible: shoring.root.visible && [ ...shoring.shown.values() ].every( s => s.group.visible ) };
		document.getElementById( 'library-toggle' ).click();
		const open = shoring.root.visible && [ ...shoring.shown.values() ].every( s => s.group.visible );
		document.getElementById( 'library-toggle' ).click();
		const big = await models.load( { kind: 'excavation', params: { width: 60, length: 40, depth: 6, slope: 1, support: 'sheet-piles' }, east: - 200, north: 0, heading: 0, up: null } );
		const group = shoring.shown.get( big ).group;
		let meshes = 0;
		group.traverse( o => o.isMesh && meshes ++ );
		// Draw calls with only this pit's shoring in view.
		const others = [ ...shoring.shown.values() ].filter( s => s.group !== group );
		others.forEach( s => s.group.visible = false );
		const hidden = scene.children.filter( c => c !== shoring.root && c.visible );
		hidden.forEach( c => c.visible = false );
		camera.updateMatrixWorld();
		renderer.render( scene, camera );
		const calls = renderer.info.render.calls;
		hidden.forEach( c => c.visible = true );
		others.forEach( s => s.group.visible = true );
		return { closed, open, meshes, calls, summary: shoring.planShoring( big.params ).summary, notes: shoring.planShoring( big.params ).notes };

	} );
	assert.equal( r.closed.build, false );
	assert.equal( r.closed.visible, true );
	assert.equal( r.open, true );
	assert.ok( r.meshes <= 6, `${ r.meshes } meshes` );
	assert.ok( r.calls > 0 && r.calls <= r.meshes, `${ r.calls } draw calls` );
	console.log( `60 × 40 × 6 m sheet piles: ${ r.meshes } meshes, ${ r.calls } draw calls in view; ${ r.summary }; ${ r.notes.join( ' ' ) }` );
	assert.ok( r.notes.some( n => n.includes( 'too wide to strut across' ) ) );

} );

test( 'Shoring library pieces: listed with thumbnails, placed, turned, saved and reloaded', async () => {

	await look( { east: 0, north: - 120, up: 0, distance: 30, from: 180, elevation: 50 } );
	await library( true );
	const listed = await page.evaluate( () => {

		const heading = [ ...document.querySelectorAll( '#library h3' ) ].find( h => h.textContent === 'Shoring' );
		const cards = [];
		for ( let next = heading?.nextElementSibling; next && next.tagName !== 'H3'; next = next.nextElementSibling ) cards.push( { id: next.dataset.item, name: next.querySelector( '.name' ).textContent, dims: next.querySelector( '.dims' ).textContent } );
		heading?.scrollIntoView();
		return cards;

	} );
	assert.deepEqual( listed.map( c => c.id ).sort(), [ ...PIECES ].sort() );
	const dims = Object.fromEntries( listed.map( c => [ c.id, c.dims ] ) );
	assert.match( dims[ 'trench-box-8x20' ], /^6\.1 × 1\.8 × 2\.[56] m$/ );
	assert.match( dims[ 'trench-box-8x24' ], /^7\.3 × / );
	assert.match( dims[ 'trench-box-8x16' ], /^4\.9 × / );
	assert.match( dims[ 'sheet-pile-bundle' ], /^12 × 1\.[3-6] × 0\.[5-7] m$/ );
	await page.waitForFunction( () => [ ...document.querySelectorAll( '#library .card[data-item^="trench-box"] img' ) ].every( img => img.src.startsWith( 'data:image/png' ) ) );
	console.log( listed.map( c => `${ c.name }: ${ c.dims }` ).join( '\n' ) );

	// One placed with the mouse and turned with R, the way a person would. The P panel is still open
	// from the pits, so the Show panel stands beside it over the middle right, where the click goes:
	// folded away first, as a person would move it out of the way.
	if ( await page.isVisible( '#layers .layers-panel' ) ) await page.click( '#layers .layers-panel .hide' );
	await page.click( '#library .card[data-item="trench-box-8x20"]' );
	await page.mouse.move( 760, 420 );
	await page.waitForTimeout( 300 );
	await page.mouse.click( 760, 420 );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.library === 'trench-box-8x20' && ! e.placing ) );
	const heading = await page.evaluate( () => window.twin.models.entries.find( e => e.library === 'trench-box-8x20' ).state.heading );
	await page.keyboard.press( 'KeyR' );
	const turned = await page.evaluate( () => window.twin.models.entries.find( e => e.library === 'trench-box-8x20' ).state.heading );
	assert.notEqual( turned, heading );

	// The rest from code, side by side as in a laydown area.
	await page.evaluate( async listed => {

		const { models } = window.twin;
		for ( const [ i, { id, name } ] of listed.entries() ) {

			if ( id === 'trench-box-8x20' ) continue;
			await models.load( { name, library: id, procedural: id, front: '-z', up: null, east: - 14 + i * 3.2, north: - 112, heading: 0 } );

		}

	}, listed );
	await look( { east: - 3, north: - 112, up: 0, distance: 24, from: 215, elevation: 40 } );
	await library( false );
	await shot( 'library-shoring-pieces' );
	await library( true );
	await shot( 'library-shoring-cards' );
	await library( false );

	// Saved (after the layout's 300 ms wait) and back after a reload.
	const before = await page.evaluate( () => {

		const { models, shoring } = window.twin;
		return {
			pits: models.entries.filter( e => e.kind === 'excavation' ).map( e => [ e.state.east, e.state.north, e.params.support, e.params.width, e.params.length, e.params.depth ].join() ).sort(),
			shored: shoring.shown.size,
			pieces: models.entries.filter( e => e.procedural ).map( e => `${ e.library } ${ e.state.heading }` ).sort(),
		};

	} );
	await page.waitForTimeout( 800 );
	await openApp();
	await page.waitForFunction( n => window.twin.models.entries.filter( e => e.kind === 'excavation' ).length === n, before.pits.length );
	const afterReload = await page.evaluate( () => {

		const { models, shoring } = window.twin;
		return {
			pits: models.entries.filter( e => e.kind === 'excavation' ).map( e => [ e.state.east, e.state.north, e.params.support, e.params.width, e.params.length, e.params.depth ].join() ).sort(),
			shored: shoring.shown.size,
			pieces: models.entries.filter( e => e.procedural ).map( e => `${ e.library } ${ e.state.heading }` ).sort(),
		};

	} );
	assert.deepEqual( afterReload, before );
	console.log( `saved and reloaded: ${ before.pits.length } excavations, ${ before.shored } shored, ${ before.pieces.length } pieces` );

	// Each support again after the reload, as the planner will see it next time.
	await look( { east: 120, north: 40, up: - 2.5, distance: 17, from: 210, elevation: 36 } );
	await shot( 'reloaded-sheet-piles' );
	assert.deepEqual( errors, [] );

} );
