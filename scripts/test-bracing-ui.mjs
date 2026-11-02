// npm run test:bracing-ui: deep shoring in a real browser, against the Vite dev server with no
// Google tiles; every request that isn't to the local server is blocked. Wall systems on some
// sides of a pit and not others (sheet, soldier, secant and contiguous piles), standing in the
// wings of the slopes beside them and down to their embedment; support levels (walers with struts,
// corner braces and king posts, rakers to kicker blocks, tiebacks with their bond lengths); the dig
// stages shown without a rebuild; the P panel's support levels and checks; the ground's walls
// straight up behind a wall beside a slope, by pixel readback; draw calls for a 60 x 40 x 12 m
// braced pit.
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
const WALLS = [ 'sheet-piles', 'soldier-piles', 'secant-piles', 'contiguous-piles' ];

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
	// three.js reports a shader that won't compile on the console.
	page.on( 'console', m => m.type() === 'error' && /WebGLProgram|shader/i.test( m.text() ) && errors.push( m.text() ) );
	await page.route( '**/*', route => {

		const url = route.request().url();
		return url.startsWith( base ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

	} );
	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.shoring && window.twin.terrain );
	await page.evaluate( async () => {

		const { models } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );

	} );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

// An excavation at (east, north): its index in window.pits.
async function pit( params, east, north = 0, heading = 0 ) {

	return page.evaluate( async ( { params, east, north, heading } ) => {

		const { models, terrain } = window.twin;
		const entry = await models.load( { kind: 'excavation', params, east, north, heading, up: null } );
		terrain.flush();
		window.pits = [ ...window.pits ?? [], entry ];
		return window.pits.length - 1;

	}, { params, east, north, heading } );

}

// What's drawn for pit i, in the pit's frame (x = u, z = -v, y up from the rim), by material: the
// extent of the vertices drawn, their count, and the draw range.
async function inspect( i ) {

	return page.evaluate( i => {

		const { shoring } = window.twin;
		const entry = window.pits[ i ];
		const plan = shoring.planShoring( entry.params );
		const item = shoring.shown.get( entry );
		const result = { params: { ...entry.params }, summary: plan.summary, wall: plan.wall, weight: plan.weight, notes: plan.notes, levels: plan.levels, checks: plan.checks, drawn: !! item, visible: item?.group.visible ?? false, materials: {} };
		if ( ! item ) return result;
		const frame = item.group;
		frame.updateMatrixWorld( true );
		const toFrame = frame.matrixWorld.clone().invert();
		const v = frame.position.clone();
		frame.traverse( mesh => {

			if ( ! mesh.isMesh ) return;
			const name = mesh.material.name.replace( 'shoring ', '' );
			const m = toFrame.clone().multiply( mesh.matrixWorld );
			const position = mesh.geometry.attributes.position;
			const count = Math.min( position.count, mesh.geometry.drawRange.count );
			const box = { minX: Infinity, maxX: - Infinity, minY: Infinity, maxY: - Infinity, minZ: Infinity, maxZ: - Infinity, vertices: position.count, drawn: mesh.visible ? count : 0 };
			for ( let n = 0; n < position.count; n ++ ) {

				v.fromBufferAttribute( position, n ).applyMatrix4( m );
				box.minX = Math.min( box.minX, v.x );
				box.maxX = Math.max( box.maxX, v.x );
				box.minY = Math.min( box.minY, v.y );
				box.maxY = Math.max( box.maxY, v.y );
				box.minZ = Math.min( box.minZ, v.z );
				box.maxZ = Math.max( box.maxZ, v.z );

			}

			result.materials[ name ] = box;

		} );
		result.meshes = Object.keys( result.materials ).length;
		return result;

	}, i );

}

async function setParams( i, params ) {

	await page.evaluate( ( { i, params } ) => {

		window.twin.models.setParams( window.pits[ i ], params );
		window.twin.terrain.flush();

	}, { i, params } );

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

test( 'each wall system lines only its own side, into the slopes\' wings and down to its embedment', async () => {

	// A floor 12 m across and 20 m long, 4 m deep, sloped at 1.5 : 1 (soil C) except side 2.
	const D = 4;
	for ( const [ k, system ] of WALLS.entries() ) {

		const i = await pit( { width: 12, length: 20, depth: D, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'slope', side2: system, side3: 'slope', side4: 'slope' }, k * 60, 0 );
		const r = await inspect( i );
		assert.ok( r.drawn && r.visible, `${ system } drawn` );
		const walls = Object.entries( r.materials ).filter( ( [ name ] ) => name !== 'earth' );
		const all = walls.map( ( [ , box ] ) => box );
		const extent = { minX: Math.min( ...all.map( b => b.minX ) ), maxX: Math.max( ...all.map( b => b.maxX ) ), minY: Math.min( ...all.map( b => b.minY ) ), maxY: Math.max( ...all.map( b => b.maxY ) ), minZ: Math.min( ...all.map( b => b.minZ ) ), maxZ: Math.max( ...all.map( b => b.maxZ ) ) };
		// Only side 2 (x = +6), from its face to its back.
		const { inner, back } = { 'sheet-piles': { inner: 0.2, back: 0.21 }, 'soldier-piles': { inner: 0.155, back: 0.155 }, 'secant-piles': { inner: 0.01, back: 0.88 }, 'contiguous-piles': { inner: 0.01, back: 0.6 } }[ system ];
		assert.ok( extent.minX >= 6 - inner - 1e-3 && extent.maxX <= 6 + back + 1e-3, `${ system }: across ${ extent.minX.toFixed( 3 ) } to ${ extent.maxX.toFixed( 3 ) }` );
		// The full length of its top edge: into both slopes' wings, 1.5 x 4 = 6 m past the floor's
		// corners (v = ±16), not just the floor's 20 m.
		assert.ok( extent.minZ <= - 15.5 && extent.maxZ >= 15.5 && extent.minZ >= - 16.5 && extent.maxZ <= 16.5, `${ system }: along ${ extent.minZ.toFixed( 2 ) } to ${ extent.maxZ.toFixed( 2 ) }` );
		// Down to the toe below the floor (a 4 m cantilever: 1.5 x 4 = 6 m), and out of the ground.
		assert.ok( Math.abs( extent.minY - ( - D - 6 ) ) < 0.02, `${ system }: down to ${ extent.minY }` );
		assert.ok( extent.maxY >= 0.29 && extent.maxY <= 1.01, `${ system }: up to ${ extent.maxY }` );
		assert.match( r.levels, /^None \(cantilever\), suggested for 4\.0 m deep: no support levels; embedment 6\.0 m below the floor \(1\.5 times the depth\)/ );
		assert.ok( r.notes.some( n => n.startsWith( 'The wall on side 2 runs on past the floor\'s corners into the slopes or benches beside it, as far as their tops (6.0 m at most).' ) ), r.notes.join( ' / ' ) );
		console.log( `${ system } on side 2: ${ r.summary } | ${ Math.round( r.wall ) } m² | ${ r.weight } | ${ r.meshes } meshes` );

	}

	// The secant wall: 0.88 m piles, faces on the outline, every other one a lighter primary.
	const secant = await inspect( 2 );
	assert.ok( secant.materials.concreteLight && secant.materials.concrete, Object.keys( secant.materials ).join() );
	assert.match( secant.summary, /^4[56] secant piles \(0\.88 m, 150 mm overlap\) on side 2, 10\.5 m long each, under a capping beam; cantilevered/ );
	// Contiguous piles below the groundwater: flagged.
	assert.match( ( await inspect( 3 ) ).checks, /Side 2: water comes through the contiguous pile wall below the groundwater/ );

	// All four systems round one pit, each to its own side; the corners worked out between them.
	const mixed = await pit( { width: 14, length: 10, depth: 6, outline: 'floor', bracing: 'auto', method: 'sides', side1: 'secant-piles', side2: 'sheet-piles', side3: 'contiguous-piles', side4: 'soldier-piles' }, 0, 80 );
	const m = await inspect( mixed );
	for ( const name of [ 'sheet', 'pile', 'timber', 'concrete', 'concreteLight', 'waler', 'strut' ] ) assert.ok( m.materials[ name ], `${ name } in ${ Object.keys( m.materials ) }` );
	// Sheets only on side 2 (x = +7), soldier piles' lagging only on side 4 (x = -7).
	assert.ok( m.materials.sheet.minX >= 7 - 0.2 && m.materials.sheet.maxX <= 7 + 0.21, JSON.stringify( m.materials.sheet ) );
	assert.ok( m.materials.timber.maxX <= - 7 + 0.14 && m.materials.timber.minX >= - 7 + 0.05, JSON.stringify( m.materials.timber ) );
	assert.ok( m.meshes <= 9, `${ m.meshes } meshes` );
	assert.match( m.levels, /^Walers and struts, suggested for 6\.0 m deep: 2 levels, 1\.5 and 3\.75 m down/ );
	await look( { east: 0, north: 80, up: - 3, distance: 22, from: 215, elevation: 38 } );
	await shot( 'mixed-walls' );
	await look( { east: 60, north: 0, up: - 2, distance: 22, from: 250, elevation: 30 } );
	await shot( 'soldier-piles-beside-slopes' );

} );

test( 'support levels: none, struts, rakers, tiebacks and the first shoring\'s waler; levels suggested or typed', async () => {

	const deep = { width: 14, length: 22, depth: 8, outline: 'floor', method: 'shore', support: 'sheet-piles' };
	const i = await pit( { ...deep, bracing: 'struts' }, 0, 160 );
	let r = await inspect( i );
	// Levels about every 3 m: 1.5, 3.65 and 5.85 m down; walers on all four walls at each, struts
	// across the 12.9 m between the walers on the long walls with king posts, corner braces.
	assert.match( r.levels, /^Walers and struts: 3 levels, 1\.5, 3\.65 and 5\.85 m down \(the first within 1\.5 m of the top, then no more than 3 m apart or above the floor\); \d+ struts 12\.9 m long, 12 corner braces, \d+ king posts under them; embedment 4\.0 m below the floor/ );
	for ( const name of [ 'sheet', 'waler', 'strut', 'pile' ] ) assert.ok( r.materials[ name ], name );
	// Walers at the three depths, the king posts from 3 m under the floor.
	assert.ok( Math.abs( r.materials.waler.maxY - ( - 1.5 + 0.125 ) ) < 1e-3 && Math.abs( r.materials.waler.minY - ( - 5.85 - 0.125 ) ) < 1e-3, JSON.stringify( r.materials.waler ) );
	assert.ok( Math.abs( r.materials.pile.minY - ( - 8 - 3 ) ) < 1e-3, `king posts from ${ r.materials.pile.minY }` );
	assert.ok( Math.abs( r.materials.sheet.minY - ( - 8 - 4 ) ) < 1e-3, `sheets from ${ r.materials.sheet.minY }` );

	// Typed levels.
	await setParams( i, { levels: '2, 5.5' } );
	r = await inspect( i );
	assert.match( r.levels, /^Walers and struts: 2 levels, 2 and 5\.5 m down; / );
	assert.ok( Math.abs( r.materials.waler.maxY - ( - 2 + 0.125 ) ) < 1e-3 );
	assert.match( r.checks, /First level 2 m down: usually within 1\.5 m of the top/ );

	// Rakers: kicker blocks on the floor, the rakers from the walers down to them.
	await setParams( i, { levels: '', bracing: 'rakers' } );
	r = await inspect( i );
	assert.ok( r.materials.concrete && Math.abs( r.materials.concrete.minY - ( - 8 - 0.3 ) ) < 1e-3 && Math.abs( r.materials.concrete.maxY - ( - 8 + 0.3 ) ) < 1e-3, JSON.stringify( r.materials.concrete ) );
	assert.match( r.levels, /^Rakers to kicker blocks: 3 levels, .* \d+ rakers at 45° to \d+ kicker blocks, taking up to [\d.]+ m of the floor from the wall/ );
	assert.ok( r.notes.some( n => n.startsWith( 'Rakers: the middle is dug to the floor first' ) ) );
	await look( { east: 0, north: 160, up: - 4, distance: 26, from: 200, elevation: 40 } );
	await shot( 'rakers' );

	// Tiebacks: heads on the walers, strand and bond out behind the walls and down, under the
	// no-dig zone (13.9 m behind the 10 m pit of the research's example; here 8 m deep).
	await setParams( i, { bracing: 'tiebacks', anchorAngle: 20 } );
	r = await inspect( i );
	assert.ok( r.materials.tendon, Object.keys( r.materials ).join() );
	const reach = Number( /no-dig zone ([\d.]+) m behind all four sides/.exec( r.levels )?.[ 1 ] );
	assert.ok( reach > 9 && reach < 14, r.levels );
	// The bond lengths (concrete) reach that far behind the walls, below the levels.
	assert.ok( r.materials.concrete.maxX > 7 + reach - 0.6 && r.materials.concrete.maxX < 7 + reach + 0.3, `bond out to ${ r.materials.concrete.maxX }` );
	assert.ok( r.materials.tendon.minY < - 1.5 && r.materials.concrete.minY < - 8, JSON.stringify( r.materials.concrete ) );
	assert.ok( r.notes.some( n => n.startsWith( 'Tiebacks run under the ground behind the walls' ) ) );

	// None: a cantilever, flagged past 4 m and stopped past 5.5 m.
	await setParams( i, { bracing: 'none' } );
	r = await inspect( i );
	assert.ok( ! r.materials.waler && ! r.materials.strut, Object.keys( r.materials ).join() );
	assert.match( r.checks, /^Stop: A 8 m cantilever wall: add struts, rakers or tiebacks/ );

	// The first shoring's waler, as old pits have it, and as their plans were.
	await setParams( i, { bracing: 'classic' } );
	r = await inspect( i );
	assert.match( r.summary, /^120 sheets, 72 m of wall, 14\.0 m long each \(Z-profile, 0\.6 m wide\); waler round the inside, 4 corner braces$/ );
	assert.match( r.levels, /^One waler 0\.7 m down, as the first shoring had it: 1 level, 0\.7 m down; 4 corner braces; embedment 4\.8 m below the floor \(as the first shoring had it\); sheets 14\.0 m long\.$/ );

} );

test( 'dig stages: walls first, then each level as it\'s dug to, without rebuilding', async () => {

	const i = await pit( { width: 12, length: 20, depth: 8, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'sheet-piles', side2: 'slope', side3: 'soldier-piles', side4: 'slope' }, 120, 160 );
	const stages = await page.evaluate( async i => {

		const X = await import( '/src/excavation-design.js' );
		return X.planExcavation( window.pits[ i ].params ).stages.map( s => s.label );

	}, i );
	assert.deepEqual( stages, [ 'Walls in, nothing dug yet', 'Dig to 2.1 m', 'Level 1 (1.5 m): walers and struts in', 'Dig to 4.25 m', 'Level 2 (3.65 m): walers and struts in', 'Dig to 6.45 m', 'Level 3 (5.85 m): walers and struts in', 'Dug to the floor' ] );
	const seen = [];
	const group = await page.evaluate( i => ( window.firstGroup = window.twin.shoring.shown.get( window.pits[ i ] ).group ).uuid, i );
	for ( let stage = 0; stage < stages.length; stage ++ ) {

		await setParams( i, { stage } );
		const r = await inspect( i );
		const same = await page.evaluate( i => window.twin.shoring.shown.get( window.pits[ i ] ).group === window.firstGroup, i );
		assert.ok( same, `stage ${ stage } rebuilt the shoring` );
		const drawn = name => r.materials[ name ]?.drawn ?? 0;
		seen.push( { stage, waler: drawn( 'waler' ), strut: drawn( 'strut' ), timber: drawn( 'timber' ), sheet: drawn( 'sheet' ) } );

	}

	console.log( seen.map( s => `${ s.stage } ${ stages[ s.stage ] }: waler ${ s.waler }, strut ${ s.strut }, lagging ${ s.timber }, sheets ${ s.sheet }` ).join( '\n' ) );
	// Walls from the start; no levels until the first is in; each level adds the same again.
	assert.ok( seen.every( s => s.sheet > 0 ) );
	assert.deepEqual( seen.map( s => s.waler > 0 ), [ false, false, true, true, true, true, true, true ] );
	assert.equal( seen[ 4 ].waler, 2 * seen[ 2 ].waler );
	assert.equal( seen[ 7 ].waler, 3 * seen[ 2 ].waler );
	// Lagging down to the dig: none before digging, more with each lift.
	assert.equal( seen[ 0 ].timber, 0 );
	assert.ok( seen[ 1 ].timber > 0 && seen[ 3 ].timber > seen[ 1 ].timber && seen[ 7 ].timber > seen[ 5 ].timber );
	await setParams( i, { stage: 3 } );
	await look( { east: 120, north: 160, up: - 3, distance: 24, from: 200, elevation: 35 } );
	await shot( 'stage-dig-to-4.25' );
	// Finished again: everything back.
	await setParams( i, { stage: - 1 } );
	const done = await inspect( i );
	assert.equal( done.materials.waler.drawn, done.materials.waler.vertices );

	// A trench box isn't shown before digging, and shores the trench as it's dug.
	const t = await pit( { width: 3, length: 20, depth: 3, outline: 'floor', method: 'shore', support: 'trench-box', stage: 0 }, 180, 160 );
	assert.equal( ( await inspect( t ) ).visible, false );
	await setParams( t, { stage: 1 } );
	assert.equal( ( await inspect( t ) ).visible, true );

} );

test( 'P panel: what\'s in, the support levels and the checks, each said once', async () => {

	const r = await page.evaluate( async () => {

		const { models, sidebar } = window.twin;
		const entry = await models.load( { kind: 'excavation', params: { width: 24, length: 40, depth: 10, outline: 'floor', method: 'shore', support: 'secant-piles', bracing: 'tiebacks' }, east: 0, north: 240, heading: 0, up: null } );
		if ( ! sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();
		sidebar.select( entry );
		return true;

	} );
	assert.ok( r );
	if ( await page.evaluate( () => document.querySelector( '.lil-gui.lil-root' ).style.display === 'none' ) ) await page.keyboard.press( 'KeyP' );
	const notes = await page.evaluate( () => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		return Object.fromEntries( [ ...folder.querySelectorAll( '.lil-controller.note' ) ].filter( c => c.style.display !== 'none' ).map( c => [ c.querySelector( '.lil-name' ).textContent, c.querySelector( '.readout-note' ).textContent ] ) );

	} );
	assert.match( notes.shoring, /^18\d secant piles \(0\.88 m, 150 mm overlap\) on all four sides, 15\.5 m long each, under a capping beam; walers at 3 levels with 162 tiebacks$/ );
	assert.match( notes[ 'support levels' ], /^Tiebacks: 3 levels, 1\.5, 4\.35 and 7\.15 m down .*; 162 tiebacks at 20° below level, unbonded 4\.5 to 6\.2 m, bonded 9\.0 m; no-dig zone 13\.9 m behind all four sides; embedment 5\.0 m below the floor .*; secant piles 15\.5 m long\.$/ );
	assert.match( notes[ 'shoring notes' ], /^A professional engineer designs the walls and their support/ );
	assert.match( notes.checks, /Floor 8 m below the groundwater/ );
	assert.match( notes.checks, /Secant piles this long may drift apart at the toe/ );
	// What the shoring notes say isn't said again in the checks.
	assert.doesNotMatch( notes.checks, /professional engineer designs|Over 6 m deep/ );
	console.log( Object.entries( notes ).map( ( [ k, v ] ) => `${ k }: ${ v }` ).join( '\n' ) );
	await page.evaluate( () => [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' ).scrollIntoView() );
	await look( { east: 0, north: 240, up: - 5, distance: 40, from: 210, elevation: 40 } );
	await shot( 'panel-secant-tiebacks' );
	await page.evaluate( () => document.getElementById( 'library-toggle' ).click() );

} );

test( 'the ground goes straight up behind a wall beside slopes, and the slopes are left as dug', async () => {

	const i = await pit( { width: 12, length: 20, depth: 4, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'slope', side2: 'sheet-piles', side3: 'slope', side4: 'slope' }, 400, 0 );
	const secant = await pit( { width: 12, length: 20, depth: 4, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'slope', side2: 'secant-piles', side3: 'slope', side4: 'slope' }, 460, 0 );
	const r = await page.evaluate( ( { i, secant } ) => {

		const { terrain, renderer, scene, camera, shoring } = window.twin;
		// The colour at the middle of the view from `from` looking at `to` (in the pit's frame: x
		// east, y up from the rim, z north), with the shoring painted blue.
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
		const sheets = window.pits[ i ];
		const piles = window.pits[ secant ];
		// From the floor's middle, 1 m up, at the foot of side 2's wall (x = 6), 0.3 m off the floor,
		// where the terrain's face would have stood 2 m high; and in the slopes' wing past the
		// floor's corner (v = 13, where side 1's slope is 2 m down), at the wall 1.5 m down.
		const shots = () => ( {
			foot: look( sheets, [ 0, - 3, 0 ], [ 6, - 3.7, 0 ] ),
			wing: look( sheets, [ 3, - 1, 13 ], [ 6, - 1.5, 13 ] ),
			secant: look( piles, [ 0, - 3, 0 ], [ 6, - 3.7, 0 ] ),
		} );
		const straight = shots();
		const { uniforms } = shoring.ground;
		const count = uniforms.twinShoreCount.value;
		uniforms.twinShoreCount.value = 0;
		const eased = shots();
		uniforms.twinShoreCount.value = count;
		// Side 2's line and back, and side 4 (sloped) left alone: no line, nothing shored.
		const k = [ ...shoring.shown.keys() ].indexOf( sheets );
		const sides = [ 1, 2, 3, 4 ].map( n => uniforms.twinShore.value[ 6 * k + 1 + n ].toArray() );
		// The slope on side 4 at the floor's edge, 2 m in from its toe: the terrain as dug.
		const slope = look( sheets, [ 0, - 3, 0 ], [ - 7.5, - 3, 0 ] );
		return { straight, eased, sides, slope, max: renderer.getContext().getParameter( renderer.getContext().MAX_VERTEX_UNIFORM_VECTORS ) };

	}, { i, secant } );
	assert.deepEqual( r.straight, { foot: 'shoring', wing: 'shoring', secant: 'shoring' } );
	// Without it the steep face hides the foot of the walls.
	assert.match( r.eased.foot, /^ground/ );
	assert.match( r.eased.secant, /^ground/ );
	assert.match( r.slope, /^ground/ );
	assert.ok( r.sides[ 1 ][ 0 ] === 6 && Math.abs( r.sides[ 1 ][ 1 ] - 0.21 ) < 1e-6 && r.sides[ 1 ][ 2 ] <= - 15.99 && r.sides[ 1 ][ 3 ] >= 15.99, JSON.stringify( r.sides ) );
	for ( const n of [ 0, 2, 3 ] ) assert.ok( r.sides[ n ][ 0 ] > 1e8 && r.sides[ n ][ 2 ] > r.sides[ n ][ 3 ], JSON.stringify( r.sides[ n ] ) );
	console.log( `vertex uniforms: ${ r.max } available` );
	await look( { east: 400, north: 0, up: - 2, distance: 20, from: 250, elevation: 30 } );
	await shot( 'sheets-beside-slopes' );

} );

test( 'a 60 × 40 × 12 m braced pit is a few draw calls, whatever holds it', async () => {

	await look( { east: - 300, north: 0, up: - 6, distance: 110, from: 200, elevation: 40 } );
	const calls = {};
	const i = await pit( { width: 60, length: 40, depth: 12, outline: 'floor', method: 'shore', support: 'sheet-piles', bracing: 'struts' }, - 300, 0 );
	for ( const bracing of [ 'struts', 'rakers', 'tiebacks' ] ) {

		await setParams( i, { bracing } );
		calls[ bracing ] = await page.evaluate( i => {

			const { shoring, renderer, scene, camera } = window.twin;
			const group = shoring.shown.get( window.pits[ i ] ).group;
			let meshes = 0;
			group.traverse( o => o.isMesh && meshes ++ );
			// Draw calls with only this pit's shoring in view.
			const others = [ ...shoring.shown.values() ].filter( s => s.group !== group && s.group.visible );
			others.forEach( s => s.group.visible = false );
			const hidden = scene.children.filter( c => c !== shoring.root && c.visible );
			hidden.forEach( c => c.visible = false );
			camera.updateMatrixWorld();
			const t0 = performance.now();
			renderer.render( scene, camera );
			const ms = performance.now() - t0;
			const calls = renderer.info.render.calls;
			hidden.forEach( c => c.visible = true );
			others.forEach( s => s.group.visible = true );
			return { meshes, calls, ms: Math.round( ms ), summary: shoring.planShoring( window.pits[ i ].params ).summary };

		}, i );

	}

	console.log( Object.entries( calls ).map( ( [ k, v ] ) => `60 × 40 × 12 m, ${ k }: ${ v.meshes } meshes, ${ v.calls } draw calls; ${ v.summary }` ).join( '\n' ) );
	for ( const [ bracing, { meshes, calls: n } ] of Object.entries( calls ) ) {

		assert.ok( meshes <= 6, `${ bracing }: ${ meshes } meshes` );
		assert.ok( n > 0 && n <= meshes, `${ bracing }: ${ n } draw calls` );

	}

	await shot( 'big-braced-pit' );
	assert.deepEqual( errors, [] );

} );

test( 'saved and reloaded: the new params and the shoring come back', async () => {

	const before = await page.evaluate( () => {

		const { models, shoring } = window.twin;
		return {
			pits: models.entries.filter( e => e.kind === 'excavation' ).map( e => JSON.stringify( [ e.state.east, e.state.north, e.params ] ) ).sort(),
			summaries: [ ...shoring.shown ].map( ( [ e, item ] ) => `${ e.state.east },${ e.state.north } ${ item.plan.summary }` ).sort(),
		};

	} );
	await page.waitForTimeout( 800 );
	// Without waiting for every last resource, as the first load does.
	await page.goto( `${ base }/?prompt`, { waitUntil: 'domcontentloaded' } );
	await page.click( '#skip' );
	await page.waitForFunction( n => window.twin?.shoring && window.twin.models.entries.filter( e => e.kind === 'excavation' ).length === n, before.pits.length );
	const after = await page.evaluate( () => {

		const { models, shoring } = window.twin;
		return {
			pits: models.entries.filter( e => e.kind === 'excavation' ).map( e => JSON.stringify( [ e.state.east, e.state.north, e.params ] ) ).sort(),
			summaries: [ ...shoring.shown ].map( ( [ e, item ] ) => `${ e.state.east },${ e.state.north } ${ item.plan.summary }` ).sort(),
		};

	} );
	assert.deepEqual( after, before );

} );
