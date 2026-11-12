// The B2D2 model's structure on the drawings' grid (scripts/b2d2-structure.mjs), and repair areas
// on it (src/repair-geometry.js): node --test scripts/test-b2d2-structure.mjs
//
// Reads what the build wrote (public/models/b2d2-repair.json): the concrete areas are cut out of,
// uncut, and the areas as the drawings have them.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { areaParts, CHIPPED, choosePlane, dayOf, daysOf, EPOXY, faceSeen, LOOKS, SANDBLASTED, SHOTCRETED, stageAt, trianglesOf, triNormal } from '../src/repair-geometry.js';
import { floorBelow, originFor, workerSpot } from '../src/repair-crew.js';
import { makeWorker } from '../src/repair-crew-figures.js';

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

test( 'the beams are a layer of their own: train support beams 1 and 2, G1 to G14, the cross and shed support beams, B1 to B6', () => {

	assert.equal( data.layers.beams.name, 'Beams' );
	// Straight down onto those at grade, and up to the soffits of those under a slab: met in the
	// beams layer, where each is, and not in the gallery's or the pit's layer (down: nothing as
	// high; up: only the slab above).
	const beam = ( x, letter, el, name, from = 8 ) => {

		const dir = from > el ? - 1 : 1;
		const hit = triangles => {

			const d = cast( [ x, from, letter ], [ 0, dir, 0 ], triangles );
			return d === null ? null : from + dir * d;

		};
		near( hit( layers.beams ), el, name );
		const rest = hit( [ ...layers.c31, ...layers.pit ] );
		assert.ok( rest === null || ( rest - el ) * dir > 0.05, `${ name }: ${ rest } in the gallery's or the pit's layer` );

	};
	// The rail beams along the gallery, and under the pit's lid.
	for ( const x of [ 10, 35, 60 ] ) {

		beam( x, 4.12, 5.05, `train support beam 2 at ${ x }` );
		beam( x, 5.63, 5.05, `train support beam 1 at ${ x }` );

	}

	beam( 3, 4.12, 4.26, 'train support beam 2 over the pit', 0 );
	beam( 3, 5.63, 4.26, 'train support beam 1 over the pit', 0 );
	// G1 to G12 between the rails, G13 and G14 under the north end's lid.
	for ( const g of [ 7.86, 12.45, 16.89, 21.34, 25.78, 30.22, 34.67, 39.12, 43.56, 48.01, 52.45, 56.90 ] ) beam( g + 0.23, 4.9, 5.03, `G beam at ${ g }` );
	for ( const x of [ 61.8, 65.25 ] ) beam( x, 7.2, 3.19, `G beam at ${ x }`, 0 );
	// Under the pit's lid, and under its B1 slab.
	beam( 4.65, 3.0, 3.42, 'cross beam', 0 );
	beam( 1.0, 1.85, 4.15, 'shed support beam', 0 );
	for ( const [ name, x, letter, el ] of [ [ 'B1', 2.0, 5, - 2.41 ], [ 'B2', 3, 6.17, - 2.41 ], [ 'B3', 4.57, 7, - 2.63 ], [ 'B4', 1.0, 3.6, - 2.41 ], [ 'B5', 1.0, 1.6, - 2.41 ], [ 'B6', 1.0, 7.7, - 2.41 ] ] ) beam( x, letter, el, name, - 4 );

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

test( 'the 10 November progress drawing: its dates, and the curb walls\' panel numbers CW0001 to CW0046 on the areas they point at', () => {

	const days = new Set( data.markups.map( m => m.f.chipped ) );
	for ( const day of [ '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05/08', '2026-11-09', '2026-11-10' ] ) assert.ok( days.has( day ), day );
	assert.equal( data.markups.filter( m => m.f.chipped === '2026-11-09' ).length, 13 );
	assert.equal( data.markups.filter( m => m.f.chipped === '2026-11-10' ).length, 2 );
	// Each number once, on a pony wall at grade: 1 to 20 along the east wall from the north end,
	// 21 to 46 along the west wall from the pit.
	const numbered = data.markups.filter( m => m.no );
	assert.deepEqual( numbered.map( m => m.no ).sort(), Array.from( { length: 46 }, ( _, i ) => `CW${ String( i + 1 ).padStart( 4, '0' ) }` ) );
	const along = ( face, from, to ) => {

		const list = numbered.filter( m => m.face === face ).sort( ( a, b ) => a.no.localeCompare( b.no ) );
		assert.equal( list[ 0 ].no, from );
		assert.equal( list.at( - 1 ).no, to );
		const x = m => m.pts.reduce( ( s, p ) => s + p[ 0 ] / m.pts.length, 0 );
		// The labels take turns above and below the wall, so neighbours can be a little out of order.
		for ( let i = 1; i < list.length; i ++ ) assert.ok( ( x( list[ i ] ) - x( list[ i - 1 ] ) ) * ( from === 'CW0001' ? - 1 : 1 ) > - 2, `${ list[ i ].no } after ${ list[ i - 1 ].no }` );
		return list.map( x );

	};
	const east = along( 'east pony wall at grade (AA side)', 'CW0001', 'CW0020' );
	const west = along( 'west pony wall at grade (AJ side)', 'CW0021', 'CW0046' );
	assert.ok( east[ 0 ] > 55 && east.at( - 1 ) < 20, `east: ${ east[ 0 ] } to ${ east.at( - 1 ) }` );
	assert.ok( west[ 0 ] < 12 && west.at( - 1 ) > 58, `west: ${ west[ 0 ] } to ${ west.at( - 1 ) }` );

} );

test( 'the hoppers are out of the gallery, and kept bay by bay with the day each went, north end first, by 10 November', () => {

	// Down the middle of the gallery from just under grade: the floor, no hopper plate on the way.
	for ( const x of [ 10, 30, 50, 60 ] ) for ( const letter of [ 3.5, 6.2 ] ) {

		const down = cast( [ x, 3, letter ], [ 0, - 1, 0 ] );
		near( 3 - down, - 2.01, `the gallery's floor at grid ${ x }, letter ${ letter }` );

	}

	const [ hoppers ] = data.removed;
	assert.equal( hoppers.name, 'Hoppers' );
	assert.equal( hoppers.parts.length, 12 );
	assert.equal( hoppers.parts[ 0 ].name, 'G12–G13 bay' );
	assert.equal( hoppers.parts.at( - 1 ).name, 'G1–G2 bay' );
	assert.equal( hoppers.parts[ 0 ].removed, '2026-11-04' );
	assert.equal( hoppers.parts.at( - 1 ).removed, '2026-11-10' );
	for ( let i = 1; i < 12; i ++ ) {

		assert.ok( hoppers.parts[ i ].removed >= hoppers.parts[ i - 1 ].removed, 'in order' );
		assert.ok( hoppers.parts[ i ].x[ 1 ] <= hoppers.parts[ i - 1 ].x[ 0 ] + 1e-6, 'bay after bay towards the pit' );

	}

	// The bays end to end from the pit's wall to the north end, each the two sloped plates.
	const xs = hoppers.parts.flatMap( p => p.x ).sort( ( a, b ) => a - b );
	near( xs[ 0 ], 8.00, 'the first bay starts at the pit' );
	near( xs.at( - 1 ), 61.57, 'the last bay ends at the north end' );
	for ( const part of hoppers.parts ) {

		const tris = trianglesOf( { positions: part.positions, index: part.index } );
		const sloped = tris.filter( t => Math.abs( triNormal( t.a, t.b, t.c ).y ) > 0.4 && Math.abs( triNormal( t.a, t.b, t.c ).y ) < 0.6 );
		assert.ok( sloped.length >= 4, `${ part.name }: sloped faces` );
		const ys = part.positions.filter( ( _, i ) => i % 3 === 1 );
		assert.ok( Math.min( ...ys ) > 0.5 && Math.max( ...ys ) < 3, `${ part.name }: between EL 0.5 and 3` );

	}

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
	// A span into the next month.
	assert.equal( dayOf( '2026-11-30/02' ), '2026-12-02' );
	assert.deepEqual( daysOf( '2026-11-30/02' ), [ '2026-11-30', '2026-12-01', '2026-12-02' ] );
	assert.deepEqual( daysOf( '2026-11-05/08' ), [ '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08' ] );
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
	assert.equal( by( '2026-11-10' ), data.markups.length );
	assert.ok( by( '2026-11-08' ) < by( '2026-11-10' ) );

} );

test( 'the timeline\'s worker can chip nearly every area: the chisel on the panel, the feet on a floor or a scaffold deck, room to stand', () => {

	const worker = makeWorker( { aim: 0 } );
	const reach = aim => {

		worker.userData.setAim( aim );
		return worker.userData.reach();

	};
	let placed = 0, decks = 0;
	for ( const m of data.markups ) {

		const spot = workerSpot( m, all, reach );
		if ( ! spot ) continue;
		placed ++;
		if ( spot.deck ) decks ++;
		// Where the tip is: the reach from the feet, turned the way they face.
		const r = reach( spot.aim );
		const tip = originFor( new Vector3(), spot.facing, r ).negate().add( spot.feet );
		const n = new Vector3( ...m.n ).normalize();
		const middle = m.pts.reduce( ( c, p ) => c.add( new Vector3( ...p ) ), new Vector3() ).divideScalar( m.pts.length );
		const off = tip.clone().sub( middle ).dot( n );
		const along = tip.clone().sub( middle ).addScaledVector( n, - off ).length();
		assert.ok( Math.abs( off ) < 0.08, `${ m.id } ${ m.face }: the chisel ${ off.toFixed( 3 ) } m off the panel` );
		assert.ok( along < 0.35, `${ m.id } ${ m.face }: the chisel ${ along.toFixed( 2 ) } m from the panel's middle` );
		// Standing on something: the floor, or a deck that high above it.
		const floor = floorBelow( spot.feet.clone().setY( spot.feet.y - spot.deck + 0.3 ), all );
		assert.ok( floor !== null && Math.abs( floor + spot.deck - spot.feet.y ) < 0.06, `${ m.id } ${ m.face }: feet at ${ spot.feet.y.toFixed( 2 ) }, floor ${ floor }` );

	}

	assert.ok( placed >= data.markups.length * 0.95, `${ placed } of ${ data.markups.length } placed` );
	assert.ok( decks > 0, 'the high ones on a scaffold' );

} );

