// npm run test:flatten-points-ui: flatten areas shaped by their points (flatten.js, grade.js's
// 'points' grade, terrain.js, handles.js) in a real browser, against the Vite dev server with no
// Google tiles; every request that isn't to the local server is blocked. The stand-in ground is
// tilted for the test (8% up to the east, 3% up to the north), as test-grading-ui.mjs has it.
// A rectangle saved before points loads and saves as it was, with its corner and edge handles; a
// triangle and an L with their own heights at their points are graded through them (the ground
// at each point is the area's height plus its own, a plane across each triangle), are walked on
// there, have batters round their outline (the L's inside corner too) and none in the L's notch
// beyond them, reckon their earth, and save and load the same. Selected, an area shaped by its points has a
// handle on each point and a plus on each edge: dragging a point moves it (one undo step), a drag
// that would cross edges isn't taken, a plus adds a point, a click and Delete takes one out (not
// below three), Alt-dragging a point sets its height. The P panel sets a point's height (picking
// the 'by points' grade) and turns a rectangle into points and back. Copy and paste keeps the shape.
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
const PORT = Number( process.env.TEST_VITE_PORT ) || 5193;
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
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout && window.twin.terrain );
	await dropProjectModels( page );
	await page.evaluate( () => {

		const { models, terrain } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );
		const flat = terrain.standIn.height.bind( terrain.standIn );
		window.slopeAt = ( east, north ) => 0.08 * east + 0.03 * north;
		terrain.standIn.height = ( x, z ) => {

			const y = flat( x, z );
			return y === null ? null : y + window.slopeAt( - x, z );

		};

	} );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function look( { east, north, distance, from, elevation } ) {

	await page.evaluate( ( { east, north, distance, from, elevation } ) => {

		const { controls, camera } = window.twin;
		const r = Math.PI / 180;
		const h = distance * Math.cos( elevation * r );
		const ce = east + h * Math.sin( from * r );
		const cn = north + h * Math.cos( from * r );
		const heading = ( Math.atan2( east - ce, north - cn ) / r + 360 ) % 360;
		controls.setPose( camera.position.clone().set( - ce, distance * Math.sin( elevation * r ) + 0.08 * east, cn ), heading, - elevation );

	}, { east, north, distance, from, elevation } );

}

async function shot( name ) {

	await page.waitForTimeout( 1200 );
	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

// Place an area and wait until it has snapped and the ground under it is worked out.
async function area( config ) {

	return page.evaluate( async config => {

		const { models, terrain } = window.twin;
		const entry = await models.load( { kind: 'flatten-zone', heading: 0, up: null, ...config } );
		const end = performance.now() + 15000;
		while ( performance.now() < end ) {

			terrain.flush();
			const ready = [ ...terrain.chunks.values() ].every( c => c.ready ) && terrain.pending.length === 0;
			if ( entry.snapped && ready && ( entry.params.grade === 'level' || entry.gradeVolume ) ) break;
			await new Promise( resolve => setTimeout( resolve, 50 ) );

		}

		window.areas ??= [];
		window.areas.push( entry );
		return window.areas.length - 1;

	}, config );

}

// Wait for the ground to catch up with a change.
const settled = () => page.evaluate( async () => {

	const { terrain } = window.twin;
	const end = performance.now() + 15000;
	while ( performance.now() < end ) {

		terrain.flush();
		if ( [ ...terrain.chunks.values() ].every( c => c.ready ) && terrain.pending.length === 0 ) break;
		await new Promise( resolve => setTimeout( resolve, 50 ) );

	}

	await new Promise( resolve => setTimeout( resolve, 300 ) );
	terrain.flush();

} );

// The ground as drawn and walked on at (east, north).
const heightAt = ( east, north ) => page.evaluate( ( [ east, north ] ) => window.twin.terrain.heightAt( - east, north ), [ east, north ] );
// The graded ground of area i at (east, north), or null outside it.
const gradedAt = ( i, east, north ) => page.evaluate( ( [ i, east, north ] ) => window.twin.terrain.gradedAt( window.areas[ i ], - east, north ), [ i, east, north ] );
const paramsOf = i => page.evaluate( i => {

	const { params, state } = window.areas[ i ];
	return { ...params, fit: undefined, up: state.up, east: state.east, north: state.north };

}, i );

const near = ( actual, expected, tolerance, what ) => assert.ok( Math.abs( actual - expected ) <= tolerance, `${ what }: ${ actual?.toFixed?.( 3 ) ?? actual } m, expected ${ expected.toFixed( 3 ) } ± ${ tolerance }` );

// The P panel's controller named `name` (shown), as a handle.
const panelControl = name => page.evaluateHandle( name => [ ...document.querySelectorAll( '.lil-gui .lil-controller' ) ].find( c => c.offsetParent && c.querySelector( '.lil-name' )?.textContent === name ), name );
const handleList = () => page.evaluate( () => window.twin.sidebar.handles.positions().map( ( { type, index, screen } ) => ( { type, index, x: screen.x, y: screen.y } ) ) );

// Its surface at each of a triangle's points, a little in from them, and at its middle.
const TRIANGLE = [ [ - 15, - 10, 1.5 ], [ 15, - 10, - 1 ], [ - 3, 10, 0.5 ] ];
const ELL = [ [ - 12, - 10, 0 ], [ 12, - 10, 2 ], [ 12, - 2 ], [ - 4, - 2 ], [ - 4, 10, - 1.5 ], [ - 12, 10 ] ];

test( 'a rectangle saved before points loads, saves and resizes as it did', async () => {

	const i = await area( { params: { width: 20, length: 14, surface: 'gravel', grade: 'slope', fall: 1, toward: 'front', batter: 2 }, east: - 60, north: 0 } );
	const out = await page.evaluate( async i => {

		const entry = window.areas[ i ];
		const { models, sidebar } = window.twin;
		sidebar.select( entry );
		window.twin.panel.gui.hide();
		await new Promise( resolve => setTimeout( resolve, 300 ) );
		const types = sidebar.handles.positions().map( h => h.type );
		sidebar.deselect();
		return { points: entry.params.points, saved: models.toConfig( entry ).params, types };

	}, i );
	assert.equal( out.points, null, 'no points' );
	assert.deepEqual( out.saved, { width: 20, length: 14, height: 0, surface: 'gravel', grade: 'slope', batter: 2, fall: 1, toward: 'front' }, 'saved as before' );
	assert.ok( out.types.includes( 'corner' ), `its corner handles: ${ out.types.join() }` );
	assert.ok( ! out.types.includes( 'point' ), 'and no points' );
	await page.evaluate( i => window.twin.models.remove( window.areas[ i ] ), i );

} );

test( 'a triangle graded through its points\' heights: its surface, batters and earth, saved and loaded', async () => {

	const i = await area( { params: { width: 30, length: 20, surface: 'gravel', grade: 'points', batter: 2, points: TRIANGLE }, east: 60, north: 0 } );
	const p = await paramsOf( i );
	assert.equal( p.grade, 'points' );
	assert.deepEqual( [ p.width, p.length ], [ 30, 20 ], 'as wide and long as the box round it' );
	// At each point, a little inside it, the area's height plus the point's own; at its middle, the
	// mean of the three (a plane through them).
	const centroid = [ ( - 15 + 15 - 3 ) / 3, ( - 10 - 10 + 10 ) / 3 ];
	for ( const [ k, [ e, n, h ] ] of TRIANGLE.entries() ) {

		const inE = e + ( centroid[ 0 ] - e ) * 0.02, inN = n + ( centroid[ 1 ] - n ) * 0.02;
		const expected = p.up + h + ( ( 1.5 - 1 + 0.5 ) / 3 - h ) * 0.02;
		near( await gradedAt( i, 60 + inE, inN ), expected, 0.02, `the graded ground at point ${ k + 1 }` );
		near( await heightAt( 60 + inE, inN ), expected, 0.05, `the ground walked on at point ${ k + 1 }` );

	}

	near( await gradedAt( i, 60 + centroid[ 0 ], centroid[ 1 ] ), p.up + ( 1.5 - 1 + 0.5 ) / 3, 0.02, 'at its middle' );
	// Outside it but inside the box round it (beyond its long edge, up to the north-east): not the
	// pad, but its batter or the ground.
	assert.equal( await gradedAt( i, 60 + 12, 8 ), null, 'beyond its edge is not in it' );
	const batters = await page.evaluate( i => {

		const { terrain } = window.twin;
		const entry = window.areas[ i ];
		// Each node once (chunks share their edges).
		const inside = new Set(), batter = new Set();
		for ( const chunk of terrain.chunks.values() ) for ( let k = 0; k < 65 * 65; k ++ ) {

			const key = `${ chunk.x( k ).toFixed( 2 ) },${ chunk.z( k ).toFixed( 2 ) }`;
			if ( chunk.graded[ k ] === 1 ) inside.add( key );
			if ( chunk.graded[ k ] === 2 ) batter.add( key );

		}

		return { inside: inside.size, batter: batter.size, volume: entry.gradeVolume };

	}, i );
	// The triangle is 300 m² (1,200 nodes a quarter of a square metre each), not its 600 m² box.
	assert.ok( batters.inside > 1000 && batters.inside < 1500, `${ batters.inside } nodes graded inside it` );
	assert.ok( batters.batter > 100, `${ batters.batter } nodes of batter round it` );
	assert.ok( batters.volume && batters.volume.cut + batters.volume.fill > 10, `earth moved: ${ JSON.stringify( batters.volume ) }` );
	// Along the slope of its batter just outside its south edge, under point 1 (1.5 m up): an
	// embankment falling at 2 : 1 from its edge.
	const edge = await heightAt( 60 - 10, - 10 + 0.05 );
	const out = await heightAt( 60 - 10, - 10 - 1 );
	near( edge - out, 0.5, 0.15, 'the embankment falls 0.5 m in a metre out from its edge' );

	// Saved and loaded again, the same.
	const again = await page.evaluate( async i => {

		const { models } = window.twin;
		const config = models.toConfig( window.areas[ i ] );
		models.remove( window.areas[ i ] );
		const entry = await models.load( config );
		window.areas[ i ] = entry;
		return { saved: config.params, points: entry.params.points, grade: entry.params.grade };

	}, i );
	assert.deepEqual( again.saved.points, TRIANGLE, 'its points saved, heights and all' );
	assert.deepEqual( again.saved.grade, 'points' );
	assert.deepEqual( again.points, TRIANGLE );
	await settled();
	near( await gradedAt( i, 60 + centroid[ 0 ], centroid[ 1 ] ), p.up + ( 1.5 - 1 + 0.5 ) / 3, 0.05, 'loaded again, its middle' );
	if ( SHOTS ) {

		await look( { east: 60, north: 0, distance: 55, from: 200, elevation: 28 } );
		await shot( 'triangle-points' );

	}

	await page.evaluate( i => window.twin.models.remove( window.areas[ i ] ), i );

} );

test( 'an L shape: its own slopes, batters round its inside corner, the notch left as ground', async () => {

	const i = await area( { params: { width: 24, length: 20, surface: 'concrete', grade: 'points', batter: 2, fence: 'mesh', gates: 1, points: ELL }, east: 140, north: 0 } );
	const p = await paramsOf( i );
	const heights = await page.evaluate( async i => ( await import( '/src/grade.js' ) ).pointHeights( window.areas[ i ].params ), i );
	// Points without a height take the plane through those with one.
	assert.equal( heights.length, 6 );
	assert.deepEqual( [ heights[ 0 ], heights[ 1 ], heights[ 4 ] ], [ 0, 2, - 1.5 ] );
	// A tenth of a metre inside each point.
	const inward = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ - 1, - 1 ], [ - 1, - 1 ], [ 1, - 1 ] ];
	for ( const [ k, [ e, n ] ] of ELL.entries() ) near( await gradedAt( i, 140 + e + 0.1 * inward[ k ][ 0 ], n + 0.1 * inward[ k ][ 1 ] ), p.up + heights[ k ], 0.05, `point ${ k + 1 }` );
	// The notch (north-east of the inside corner): not the pad.
	assert.equal( await gradedAt( i, 140 + 6, 5 ), null, 'the notch is not in it' );
	// Deep in the notch, more than the batters reach from either edge... it's only 8 m by 12 m:
	// what's there is the batter from its two edges or the ground, never the pad's own height
	// carried across.
	const notch = await heightAt( 140 + 8, 6 );
	const ground = await page.evaluate( () => window.slopeAt( 148, 6 ) );
	assert.ok( Math.abs( notch - ground ) < 3.5, `the notch at ${ notch.toFixed( 2 ) }, the ground ${ ground.toFixed( 2 ) }` );
	// The fence follows its outline: as many runs as edges (an entrance on the longest).
	const fence = await page.evaluate( i => {

		let panels = 0;
		window.areas[ i ].pivot.traverse( o => {

			if ( o.isInstancedMesh && o.parent?.name === 'Temporary fence' ) panels = Math.max( panels, o.count );

		} );
		return panels;

	}, i );
	assert.ok( fence > 20, `${ fence } fence panels round it` );
	if ( SHOTS ) {

		await look( { east: 140, north: 0, distance: 50, from: 210, elevation: 32 } );
		await shot( 'ell-points' );
		await look( { east: 140, north: 0, distance: 60, from: 30, elevation: 22 } );
		await shot( 'ell-points-from-ne' );

	}

	await page.evaluate( i => window.twin.models.remove( window.areas[ i ] ), i );

} );

test( 'its points\' handles: move one (undone), edges never cross, a plus adds one, Delete takes one out', async () => {

	const i = await area( { params: { width: 24, length: 20, surface: 'gravel', grade: 'level', points: ELL }, east: 220, north: 0 } );
	await page.evaluate( i => {

		window.twin.sidebar.select( window.areas[ i ] );
		window.twin.panel.gui.hide();
		document.activeElement?.blur?.();

	}, i );
	await look( { east: 220, north: 0, distance: 60, from: 180, elevation: 70 } );
	await page.waitForFunction( () => window.twin.sidebar.handles.positions().filter( h => h.type === 'point' ).length === 6 );
	await page.waitForTimeout( 300 );
	let list = await handleList();
	assert.equal( list.filter( h => h.type === 'point' ).length, 6, 'a handle on each point' );
	assert.equal( list.filter( h => h.type === 'insert' ).length, 6, 'a plus on each edge, the last to the first too' );
	assert.ok( ! list.some( h => h.type === 'corner' || h.type === 'edge' ), 'no rectangle handles' );
	if ( SHOTS ) await shot( 'handles' );

	// Drag point 3 (the L's east end, north side) 4 m further north: it moves, as one step.
	const steps = await page.evaluate( () => window.twin.sidebar.history.size.undo );
	const metres = async ( from, de, dn ) => page.evaluate( ( [ from, de, dn ] ) => {

		// Screen pixels for a move of (de, dn) metres from a handle, on the ground there.
		const { camera, renderer } = window.twin;
		const rect = renderer.domElement.getBoundingClientRect();
		const h = window.twin.sidebar.handles.positions().find( p => p.type === from.type && p.index === from.index );
		const to = h.world.clone();
		to.x -= de;
		to.z += dn;
		to.project( camera );
		return { x: rect.left + ( to.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - to.y ) / 2 * rect.height };

	}, [ from, de, dn ] );
	const drag = async ( from, to, modifiers = [] ) => {

		for ( const key of modifiers ) await page.keyboard.down( key );
		await page.mouse.move( from.x, from.y );
		await page.mouse.down();
		await page.mouse.move( ( from.x + to.x ) / 2, ( from.y + to.y ) / 2, { steps: 4 } );
		await page.mouse.move( to.x, to.y, { steps: 4 } );
		await page.waitForTimeout( 200 );
		await page.mouse.up();
		for ( const key of modifiers ) await page.keyboard.up( key );
		await page.waitForTimeout( 300 );

	};
	const third = list.find( h => h.type === 'point' && h.index === 2 );
	await drag( third, await metres( third, 0, 4 ) );
	const moved = await paramsOf( i );
	// Its middle moves with the box round its points, so they're measured from the site.
	const site = q => q.points.map( ( [ e, n ] ) => [ Math.round( q.east + e ), Math.round( q.north + n ) ] );
	assert.deepEqual( site( moved )[ 2 ], [ 232, 2 ], `point 3 moved north: ${ JSON.stringify( site( moved ) ) }` );
	assert.deepEqual( site( moved )[ 0 ], [ 208, - 10 ], 'the others stay' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.size.undo ), steps + 1, 'one step' );
	await page.keyboard.press( 'Control+z' );
	await page.waitForTimeout( 200 );
	assert.deepEqual( site( await paramsOf( i ) )[ 2 ], [ 232, - 2 ], 'undone' );

	// Point 4 (the inside corner) dragged across the far edge would cross it: it goes as far as it
	// can, short of the edge, and no further.
	list = await handleList();
	const fourth = list.find( h => h.type === 'point' && h.index === 3 );
	await drag( fourth, await metres( fourth, 0, - 12 ) );
	const stopped = await paramsOf( i );
	const corner4 = stopped.north + stopped.points[ 3 ][ 1 ];
	assert.ok( corner4 > - 10 && corner4 < - 2, `the inside corner stopped at ${ corner4.toFixed( 2 ) } m north, short of the south edge` );
	assert.ok( await page.evaluate( async i => ( await import( '/src/polygon.js' ) ).isSimple( window.areas[ i ].params.points ), i ), 'no edges cross' );
	await page.keyboard.press( 'Control+z' );
	await page.waitForTimeout( 200 );
	assert.deepEqual( site( await paramsOf( i ) )[ 3 ], [ 216, - 2 ], 'undone' );

	// A click on the plus between points 1 and 2 adds a point halfway.
	list = await handleList();
	const plus = list.find( h => h.type === 'insert' && h.index === 0 );
	await page.mouse.click( plus.x, plus.y );
	await page.waitForTimeout( 300 );
	let now = await paramsOf( i );
	assert.equal( now.points.length, 7, 'a point added' );
	assert.deepEqual( site( now )[ 1 ], [ 220, - 10 ], 'halfway along the south edge' );
	// Click it, and Delete takes it out (not the area).
	list = await handleList();
	const added = list.find( h => h.type === 'point' && h.index === 1 );
	await page.mouse.click( added.x, added.y );
	await page.waitForTimeout( 200 );
	assert.deepEqual( await page.evaluate( () => window.twin.sidebar.handles.picked ), { index: 1 }, 'picked out' );
	await page.keyboard.press( 'Delete' );
	await page.waitForTimeout( 300 );
	now = await paramsOf( i );
	assert.equal( now.points.length, 6, 'taken out' );
	assert.ok( await page.evaluate( i => window.twin.models.entries.includes( window.areas[ i ] ), i ), 'the area is still there' );
	await page.keyboard.press( 'Control+z' );
	await page.waitForTimeout( 200 );
	assert.equal( ( await paramsOf( i ) ).points.length, 7, 'undone: back' );
	await page.keyboard.press( 'Control+z' );
	await page.waitForTimeout( 200 );
	assert.equal( ( await paramsOf( i ) ).points.length, 6, 'and the plus undone' );

	// Alt-dragging point 2 up the screen sets its height, and picks the 'by points' grade.
	list = await handleList();
	const second = list.find( h => h.type === 'point' && h.index === 1 );
	await drag( second, { x: second.x, y: second.y - 60 }, [ 'Alt' ] );
	now = await paramsOf( i );
	assert.ok( now.points[ 1 ][ 2 ] > 0.3, `point 2 raised to ${ now.points[ 1 ][ 2 ] } m` );
	assert.equal( now.grade, 'points', 'graded by its points' );
	assert.deepEqual( site( now )[ 1 ], [ 232, - 10 ], 'and not moved' );

	// A triangle keeps its three points: Delete on one says so and leaves it.
	await page.evaluate( i => window.twin.sidebar.deselect(), i );
	const t = await area( { params: { width: 30, length: 20, surface: 'gravel', grade: 'level', points: TRIANGLE.map( p => p.slice( 0, 2 ) ) }, east: 220, north: 60 } );
	await page.evaluate( t => window.twin.sidebar.select( window.areas[ t ] ), t );
	await look( { east: 220, north: 60, distance: 60, from: 180, elevation: 70 } );
	await page.waitForFunction( () => window.twin.sidebar.handles.positions().filter( h => h.type === 'point' ).length === 3 );
	await page.waitForTimeout( 300 );
	list = await handleList();
	const corner = list.find( h => h.type === 'point' && h.index === 0 );
	await page.mouse.click( corner.x, corner.y );
	await page.waitForTimeout( 200 );
	await page.keyboard.press( 'Delete' );
	await page.waitForTimeout( 200 );
	assert.equal( ( await paramsOf( t ) ).points.length, 3, 'still three' );
	assert.match( await page.evaluate( () => window.twin.sidebar.handles.label() ) ?? '', /at least 3 points/ );
	assert.ok( await page.evaluate( t => window.twin.models.entries.includes( window.areas[ t ] ), t ), 'and still there' );
	await page.evaluate( ( [ i, t ] ) => {

		window.twin.sidebar.deselect();
		window.twin.models.remove( window.areas[ i ] );
		window.twin.models.remove( window.areas[ t ] );

	}, [ i, t ] );

} );

test( 'the P panel: a point\'s height, and a rectangle shaped by its points and back', async () => {

	const i = await area( { params: { width: 20, length: 16, surface: 'gravel', grade: 'slope', fall: 1, toward: 'front', batter: 2 }, east: 300, north: 0 } );
	await page.evaluate( i => {

		window.twin.sidebar.select( window.areas[ i ] );
		window.twin.panel.focus( window.areas[ i ] );

	}, i );
	const choose = async ( name, value ) => ( await panelControl( name ) ).evaluate( ( c, value ) => {

		const select = c.querySelector( 'select' );
		select.value = [ ...select.options ].find( o => o.textContent === value ).value;
		select.dispatchEvent( new Event( 'change' ) );

	}, value );
	await choose( 'shape', 'by points (any shape)' );
	let now = await paramsOf( i );
	assert.deepEqual( now.points, [ [ - 10, - 8 ], [ 10, - 8 ], [ 10, 8 ], [ - 10, 8 ] ], 'its corners' );
	assert.equal( now.grade, 'slope', 'graded as it was' );
	// A height typed for point 2: graded by its points now.
	const type = async ( name, text ) => ( await panelControl( name ) ).evaluate( ( c, text ) => {

		const input = c.querySelector( 'input' );
		input.focus();
		input.value = text;
		input.dispatchEvent( new Event( 'input' ) );
		input.dispatchEvent( new Event( 'change' ) );
		input.blur();

	}, text );
	await type( 'point 2 (by points)', '1.25' );
	now = await paramsOf( i );
	assert.deepEqual( now.points[ 1 ], [ 10, - 8, 1.25 ] );
	assert.equal( now.grade, 'points' );
	await type( 'point 4', '-0.5' );
	await settled();
	now = await paramsOf( i );
	near( await gradedAt( i, 300 + 9.9, - 7.9 ), now.up + 1.25, 0.05, 'point 2 at its height' );
	near( await gradedAt( i, 300 - 9.9, 7.9 ), now.up - 0.5, 0.05, 'point 4 at its height' );
	// Undone, one step at a time.
	await page.evaluate( () => document.activeElement?.blur?.() );
	await page.keyboard.press( 'Control+z' );
	await page.waitForTimeout( 200 );
	assert.equal( ( await paramsOf( i ) ).points[ 3 ].length, 2, 'point 4\'s height undone' );
	// Back to a rectangle: the box round its points, graded as new areas are.
	await choose( 'shape', 'rectangle' );
	now = await paramsOf( i );
	assert.equal( now.points, null );
	assert.deepEqual( [ now.width, now.length, now.grade ], [ 20, 16, 'follow' ] );
	await page.evaluate( i => {

		window.twin.sidebar.deselect();
		window.twin.models.remove( window.areas[ i ] );

	}, i );

} );

test( 'copied and pasted, it keeps its shape and heights', async () => {

	const i = await area( { params: { width: 24, length: 20, surface: 'gravel', grade: 'points', points: ELL }, east: 380, north: 0 } );
	await page.evaluate( i => {

		window.twin.sidebar.select( window.areas[ i ] );
		window.twin.panel.gui.hide();
		document.activeElement?.blur?.();

	}, i );
	const before = await page.evaluate( () => {

		window.before = [ ...window.twin.models.entries ];
		return window.before.length;

	} );
	await page.keyboard.press( 'Control+c' );
	await page.keyboard.press( 'Control+v' );
	await page.waitForFunction( n => window.twin.models.entries.filter( e => ! e.placing ).length > n, before );
	const pasted = await page.evaluate( () => {

		const copy = window.twin.models.entries.find( e => e.kind === 'flatten-zone' && ! window.before.includes( e ) );
		return { points: copy.params.points, grade: copy.params.grade };

	} );
	assert.deepEqual( pasted, { points: ELL, grade: 'points' } );
	await page.evaluate( () => {

		window.twin.sidebar.deselect();
		for ( const entry of window.twin.models.entries.filter( e => e.kind === 'flatten-zone' ) ) window.twin.models.remove( entry );

	} );
	assert.deepEqual( errors, [] );

} );
