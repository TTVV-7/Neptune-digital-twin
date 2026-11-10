// The B2D2 model's structure on the drawings' grid (scripts/b2d2-structure.mjs), and repair areas
// on it (src/repair-geometry.js): node --test scripts/test-b2d2-structure.mjs
//
// Reads what the build wrote (public/models/b2d2-repair.json): the concrete areas are cut out of,
// uncut, and the areas as the drawings have them.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { areaParts, CHIPPED, choosePlane, dayOf, EPOXY, faceSeen, LOOKS, SANDBLASTED, SHOTCRETED, stageAt, trianglesOf, triNormal } from '../src/repair-geometry.js';

const data = JSON.parse( await readFile( new URL( '../public/models/b2d2-repair.json', import.meta.url ), 'utf8' ) );
const layers = Object.fromEntries( Object.entries( data.layers ).map( ( [ key, l ] ) => [ key, trianglesOf( { positions: Float32Array.from( l.positions ), index: Uint32Array.from( l.index ) } ) ] ) );
const all = Object.values( layers ).flat();

// What a ray from ( x, el, letter ) going the way of `dir` ( x, el, letter ) meets first: its
// distance and the layer, or null.
function cast( [ x, el, letter ], [ dx, del, dl ], triangles = all ) {

	const origin = new Vector3( x, el, - letter ), dir = new Vector3( dx, del, - dl ).normalize();
	let best = null;
	for ( const { a, b, c } of triangles ) {

		const e1 = b.clone().sub( a ), e2 = c.clone().sub( a );
		const p = dir.clone().cross( e2 );
		const det = e1.dot( p );
		if ( Math.abs( det ) < 1e-9 ) continue;
		const s = origin.clone().sub( a );
		const u = s.dot( p ) / det;
		const q = s.clone().cross( e1 );
		const v = dir.dot( q ) / det;
		if ( u < 0 || v < 0 || u + v > 1 ) continue;
		const d = e2.dot( q ) / det;
		if ( d > 1e-6 && ( best === null || d < best ) ) best = d;

	}

	return best;

}

const near = ( actual, expected, message ) => assert.ok( actual !== null && Math.abs( actual - expected ) < 0.011, `${ message }: ${ actual } for ${ expected }` );

test( 'the transfer pit is where the drawings have it: 7.47 by 7.77 m inside, on the grid', () => {

	// From the middle of the pit, below B1, to each wall.
	const from = [ 3.3, - 4.6, 4.9 ];
	near( from[ 0 ] - cast( from, [ - 1, 0, 0 ] ), 0, 'south wall (grid 0)' );
	near( from[ 0 ] + cast( from, [ 1, 0, 0 ] ), 7.47, 'north wall (grid 8)' );
	near( from[ 2 ] - cast( from, [ 0, 0, - 1 ] ), 0, 'east wall (AA)' );
	// The AJ side opens onto C32 here: its wall is met below the mouth.
	near( from[ 2 ] + cast( [ 3.3, - 5.4, 4.9 ], [ 0, 0, 1 ] ), 7.77, 'west wall (AJ)' );

} );

test( 'B1 level: the slab is open in the middle and at the two gratings, with B1 to B6 under it', () => {

	const down = ( x, letter ) => - 0.5 - cast( [ x, - 0.5, letter ], [ 0, - 1, 0 ] );
	near( down( 6, 2.6 ), - 1.81, 'the slab' );
	// Through the openings, to the pit's floor.
	for ( const [ x, letter, name ] of [ [ 3.3, 4.9, 'the middle' ], [ 1.3, 0.7, 'the south grating' ], [ 5, 0.7, 'the north grating' ] ] ) near( down( x, letter ), - 5.93, `open at ${ name }` );
	// Just outside each opening's edge it's slab again.
	for ( const [ x, letter ] of [ [ 2.1, 4.9 ], [ 4.5, 4.9 ], [ 3.3, 3.7 ], [ 3.3, 6.1 ], [ 3.0, 0.7 ], [ 2.0, 1.45 ] ] ) near( down( x, letter ), - 1.81, `slab at ${ x }, ${ letter }` );
	// Looking up from the pit: beams hang below the slab's soffit.
	const up = ( x, letter ) => - 4 + cast( [ x, - 4, letter ], [ 0, 1, 0 ] );
	near( up( 6, 2.6 ), - 2.06, 'the soffit between beams' );
	for ( const [ name, x, letter, soffit = - 2.41 ] of [ [ 'B1', 2.0, 4.9 ], [ 'B2', 6, 6.17 ], [ 'B3', 4.57, 5 ], [ 'B4', 6, 3.58 ], [ 'B5', 6, 1.57 ], [ 'B6', 6, 7.7 ] ] ) near( up( x, letter ), name === 'B3' ? - 2.63 : soffit, name );

} );

test( 'at grade: the pit\'s lid has its three openings, the cross beam and the shed support beam', () => {

	const down = ( x, letter ) => 8 - cast( [ x, 8, letter ], [ 0, - 1, 0 ] );
	near( down( 6.5, 5 ), 5.07, 'the lid' );
	for ( const [ x, letter, name ] of [ [ 1.6, 0.6, 'the grating' ], [ 5.3, 1, 'the small opening' ], [ 0.45, 7.2, 'the corner opening' ] ] ) assert.ok( down( x, letter ) < 4, `open at ${ name }` );
	const up = ( x, letter ) => 2.5 + cast( [ x, 2.5, letter ], [ 0, 1, 0 ] );
	near( up( 6.5, 2.9 ), 4.62, 'the lid\'s soffit' );
	near( up( 4.65, 2.9 ), 3.42, 'the cross beam' );
	near( up( 6.5, 1.85 ), 4.15, 'the shed support beam' );
	near( up( 6.5, 4.12 ), 4.26, 'train support beam 2' );
	near( up( 6.5, 5.63 ), 4.26, 'train support beam 1' );

} );

test( 'the gallery at grade: train support beams and G1 to G14 where the drawings have them', () => {

	const down = ( x, letter ) => 8 - cast( [ x, 8, letter ], [ 0, - 1, 0 ] );
	// Rail beams' tops, along the gallery.
	for ( const x of [ 10, 35, 60 ] ) {

		near( down( x, 4.12 ), 5.05, 'train support beam 2' );
		near( down( x, 5.63 ), 5.05, 'train support beam 1' );

	}

	// Between them it's open from one cross beam to the next, and each beam is 0.455 m of concrete.
	const starts = [ 7.86, 12.45, 16.89, 21.34, 25.78, 30.22, 34.67, 39.12, 43.56, 48.01, 52.45, 56.90 ];
	for ( const g of starts ) {

		near( down( g + 0.23, 4.9 ), 5.03, `G beam at ${ g }` );
		assert.ok( down( g + 1.5, 4.9 ) < 3, `open past the beam at ${ g }` );

	}

	// The north end's lid, open twice.
	near( down( 63, 4.9 ), 5.06, 'the north end' );
	for ( const [ x, letter ] of [ [ 64.6, 6.8 ], [ 66.7, 6.7 ] ] ) assert.ok( down( x, letter ) < 3.7, `open at ${ x }` );

} );

test( 'C32 meets the pit on the drawings\' line', () => {

	const from = [ 2.285, - 0.5, 20 ];
	near( from[ 0 ] - cast( from, [ - 1, 0, 0 ], layers.c32 ), 0.61, 'south wall' );
	near( from[ 0 ] + cast( from, [ 1, 0, 0 ], layers.c32 ), 3.96, 'north wall' );

} );

test( 'every area from the drawings lies on a face of the structure, seen from where it was marked', () => {

	for ( const m of data.markups ) {

		const plane = choosePlane( m, all );
		const seen = faceSeen( plane, all );
		assert.ok( seen !== null && Math.abs( seen ) <= 0.03, `${ m.id } ${ m.zone } ${ m.face }: ${ seen }` );

	}

} );

test( 'an area follows its face where the structure was moved, and onto the side it\'s seen from', () => {

	const chipped = { status: 'Chipped / hydro-demo' };
	// On C32's north wall where the Shapr3D model had it (x 4.60), 4 cm from where its far side is now.
	const wall = { id: 'a', f: chipped, n: [ - 1, 0, 0 ], pts: [ [ 4.6, 2, - 30 ], [ 4.6, 2, - 31 ], [ 4.6, 2.8, - 31 ], [ 4.6, 2.8, - 30 ] ] };
	const { plane } = areaParts( wall, all );
	near( plane.N.dot( new Vector3( 1, 0, 0 ) ) * plane.h, 3.96, 'C32\'s north wall, inside' );
	// On the pit's west wall where it was (letter 8.20): now the wall's inside face, not C32's end behind it.
	const west = { id: 'b', f: chipped, n: [ 0, 0, 1 ], pts: [ [ 0.5, - 5.6, - 8.2 ], [ 1.3, - 5.6, - 8.2 ], [ 1.3, - 5, - 8.2 ], [ 0.5, - 5, - 8.2 ] ] };
	near( - areaParts( west, all ).plane.h, 7.77, 'the pit\'s west wall, inside' );
	// Nowhere near anything: left where it is, and said to be loose.
	const lost = { id: 'c', f: chipped, n: [ 0, 1, 0 ], pts: [ [ 30, 12, - 4 ], [ 31, 12, - 4 ], [ 31, 12, - 5 ], [ 30, 12, - 5 ] ] };
	assert.equal( areaParts( lost, all ).plane.loose, true );
	// The faces look out of the concrete: the lid's top up, the pit's south wall into the pit.
	const top = all.find( t => Math.abs( t.a.y - 5.07 ) < 1e-3 && Math.abs( t.b.y - 5.07 ) < 1e-3 && Math.abs( t.c.y - 5.07 ) < 1e-3 );
	assert.ok( triNormal( top.a, top.b, top.c ).y > 0.99 );

} );

test( 'epoxy coated: only the bars are green, in the recess as sandblasting left it', () => {

	assert.deepEqual( LOOKS[ EPOXY ].concrete, LOOKS[ SANDBLASTED ].concrete );
	assert.equal( LOOKS[ EPOXY ].rebar.color, '#2dbd62' );
	assert.notEqual( LOOKS[ EPOXY ].rebar.color, LOOKS[ SANDBLASTED ].rebar.color );

} );

test( 'looking back: an area is at the stage it had reached by the end of a day, and not there before it was chipped', () => {

	assert.equal( dayOf( '2026-11-05/08' ), '2026-11-08' );
	assert.equal( dayOf( '2026-11-02' ), '2026-11-02' );
	assert.equal( dayOf( undefined ), null );
	assert.equal( dayOf( 'last week' ), null );

	const done = { f: { status: SHOTCRETED, chipped: '2026-11-05/08', sandblasted: '2026-11-12', epoxy: '2026-11-13', shotcreted: '2026-11-20' } };
	assert.equal( stageAt( done, '2026-11-07' ), null );
	assert.equal( stageAt( done, '2026-11-08' ), CHIPPED );
	assert.equal( stageAt( done, '2026-11-12' ), SANDBLASTED );
	assert.equal( stageAt( done, '2026-11-19' ), EPOXY );
	assert.equal( stageAt( done, '2026-11-20' ), SHOTCRETED );
	assert.equal( stageAt( done, '2027-01-01' ), SHOTCRETED );

	// Days left over from a stage it was put back from don't count.
	const back = { f: { status: CHIPPED, chipped: '2026-11-02', sandblasted: '2026-11-10', shotcreted: '2026-11-10' } };
	assert.equal( stageAt( back, '2026-11-01' ), null );
	assert.equal( stageAt( back, '2026-11-30' ), CHIPPED );
	// A stage with no day is skipped: it's as the last one with a day says.
	assert.equal( stageAt( { f: { status: EPOXY, chipped: '2026-11-02', epoxy: '2026-11-14' } }, '2026-11-13' ), CHIPPED );
	// Nothing to go by: as it is now.
	assert.equal( stageAt( { f: { status: SANDBLASTED } }, '2026-01-01' ), SANDBLASTED );
	assert.equal( stageAt( { f: { status: 'Marked, not chipped yet' } }, '2026-01-01' ), 'Marked, not chipped yet' );
	assert.equal( stageAt( {}, '2026-01-01' ), null );

	// Every area of the drawings has the day it was chipped, so the timeline has them all.
	assert.ok( data.markups.every( m => dayOf( m.f?.chipped ) ) );
	const by = day => data.markups.filter( m => stageAt( m, day ) ).length;
	assert.equal( by( '2026-11-01' ), 0 );
	assert.ok( by( '2026-11-02' ) > 0 && by( '2026-11-02' ) < by( '2026-11-04' ) );
	assert.equal( by( '2026-11-08' ), data.markups.length );

} );

