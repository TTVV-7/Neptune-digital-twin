// Dumper 2's structure put on the Hatch drawings' grid.
//
// source-models/b2d2-site-model.glb (from the Shapr3D model) has the transfer pit 0.5 to 0.9 m
// off the drawings' grid with its two sides swapped (7.77 × 7.47 m for 7.47 × 7.77), its B1 slab
// as one thick plate with the wrong openings, the pit's lid solid, C32 0.64 m off with it, and the
// gallery's cross beams drifting 0.35 to 0.9 m along it. correctStructure() takes the site's
// layers as that file has them and gives them back as the drawings do, in plan:
//
// - the transfer pit, redrawn: walls, floor and sump, the B1 slab with its central opening and
//   two grated openings and beams B1 to B6 under it, and at grade the lid with its three openings,
//   the cross beam, the shed support beam and train support beams 1 and 2 over the pit;
// - the C31 gallery: its walls, floor and hopper plates kept, between the pit and the north end
//   where the drawings have them; at grade the pony walls, slab strips, train support beams 1
//   and 2 and cross beams G1 to G12 redrawn, the steel plates between them, and the north end's
//   lid with its two openings and G13, G14;
// - C32 moved over to the drawings' line and brought up to the pit's wall.
//
// Plan dimensions are read off 620-24070-DWG-ST005 (ground floor and basement B1 plans) and
// -ST010 (B1 to B6): the linework of the PDF, to the centimetre. Heights are the model's, which
// the drawings' plans don't give: where a beam is new, its depth is scaled off the beam
// elevations of -ST010 and -ST011 (their grids "have no spatial relationship with other
// drawings", so these are to about 5 cm). The building, conveyors and ground are left alone.
//
// Coordinates are the model's: x = C31 numeric grid, y = elevation, z = minus the letter grid.
// Below, boxes are written [ x0, x1 ], [ letter0, letter1 ], [ el0, el1 ].

import polygonClipping from 'polygon-clipping';
import { ShapeUtils, Vector2 } from 'three';

// ---------- The drawings' dimensions (m) ----------

// The transfer pit, grid 0 to 8: inside and outside faces of its walls.
const PIT = { x: [ 0, 7.47 ], l: [ 0, 7.77 ], outer: { x: [ - 0.53, 8.00 ], l: [ - 0.53, 8.15 ] } };
// The model's heights: under the floor, floor, B1 slab, lid.
const EL = {
	pit: [ - 6.93, - 5.93 ], sump: - 6.82,
	b1: [ - 2.06, - 1.81 ], b1Beams: - 2.41, b3: - 2.63,
	lid: [ 4.62, 5.07 ], crossBeam: 3.42, shedBeam: 4.15,
	rail: [ 4.26, 5.05 ], gBeam: [ 3.19, 4.26 ], gUpstand: 5.03,
	strip: [ 4.06, 4.26 ], pony: [ 4.06, 5.15 ], plate: [ 4.26, 4.27 ],
	endLid: [ 3.66, 5.06 ], endBeams: 3.19,
};
// B1 level: what's open in the slab, and the beams under it.
const B1_OPENINGS = [
	{ x: [ 2.16, 4.42 ], l: [ 3.74, 6.02 ] },
	{ x: [ 0.00, 2.59 ], l: [ 0.00, 1.37 ] },
	{ x: [ 3.58, 6.50 ], l: [ 0.00, 1.37 ] },
];
const B1_BEAMS = {
	B1: { x: [ 1.86, 2.16 ], l: [ 3.74, 6.02 ] },
	B2: { x: [ 0.00, 7.47 ], l: [ 6.02, 6.32 ] },
	B3: { x: [ 4.42, 4.72 ], l: [ 3.74, 7.62 ], to: EL.b3 },
	B4: { x: [ 0.00, 7.47 ], l: [ 3.43, 3.74 ] },
	B5: { x: [ 0.00, 7.47 ], l: [ 1.37, 1.78 ] },
	B6: { x: [ 0.00, 7.47 ], l: [ 7.62, 7.77 ] },
};
// At grade over the pit.
const LID_OPENINGS = [
	{ x: [ 0.00, 3.20 ], l: [ 0.00, 1.22 ] },
	{ x: [ 4.88, 5.79 ], l: [ 0.57, 1.49 ] },
	{ x: [ 0.00, 0.92 ], l: [ 6.71, 7.77 ] },
];
const CROSS_BEAM = { x: [ 4.42, 4.88 ], l: [ 0.00, 7.77 ] };
const SHED_BEAM = { x: [ 0.00, 7.47 ], l: [ 1.64, 2.05 ] };
// Train support beams (the rail beams), the length of the pit and the gallery.
const TRAIN_BEAMS = { 1: [ 5.43, 5.84 ], 2: [ 3.92, 4.33 ] };
// The gallery at grade: where it runs, its pony walls, and the cross beams' south faces (each
// G_WIDTH along the gallery): G1 against the pit, G2 to G12 at 4.445 m, G13 and G14 in the north end.
const GALLERY = { x: [ 8.00, 61.57 ], end: [ 61.57, 68.35 ] };
const PONY = { east: [ 1.64, 1.98 ], west: [ 7.77, 8.12 ] };
const PLATE = 0.6; // steel plates beside the rail beams, across
const G_WIDTH = 0.455;
const G_BEAMS = [ 7.86, 12.45, 16.89, 21.34, 25.78, 30.22, 34.67, 39.12, 43.56, 48.01, 52.45, 56.90, 61.56, 65.03 ];
const G_ACROSS = [ 2.60, 7.20 ]; // into the walls, as the model has them
const END_OPENINGS = [
	{ x: [ 64.12, 65.03 ], l: [ 6.25, 7.32 ] },
	{ x: [ 65.49, 67.97 ], l: [ 6.10, 7.32 ] },
];
// C32's inside faces, as the drawings have them where it meets the pit.
const C32 = { x: [ 0.61, 3.96 ] };

// ---------- The model's own dimensions, to tell its parts by and to move them from ----------

const WAS = {
	gallery: { x: [ 8.90, 62.60 ], end: [ 62.59, 69.14 ] },
	c32: { x: [ 1.25, 4.60 ], start: 8.75, flat: 9.52 },
	// The pit's opening onto C32 and onto the gallery, in height.
	c32Mouth: [ - 4.35, - 1.61 ], doorway: { l: [ 2.83, 7.17 ], el: [ - 1.81, 1.69 ] },
	sump: { x: [ 5.37, 7.43 ], l: [ 6.61, 7.72 ] },
	endLid: { l: [ 1.89, 8.10 ] }, endBeams: { l: [ 2.50, 7.40 ] },
};

// ---------- Shapes ----------

// Triangles as flat lists of x, y, z. Every face is turned to look out of the concrete, whichever
// way round its corners are given: `out` says which way that is.
class Solid {

	constructor() {

		this.positions = [];

	}

	// A flat face through corners [ x, el, letter ] (three or four, in order round it), looking
	// the way of `out` (a direction, [ x, el, letter ]).
	face( corners, out ) {

		const xyz = ( [ x, el, l ] ) => [ x, el, - l ];
		const [ a, b, c ] = corners.map( xyz );
		const u = b.map( ( v, i ) => v - a[ i ] ), w = c.map( ( v, i ) => v - a[ i ] );
		const n = [ u[ 1 ] * w[ 2 ] - u[ 2 ] * w[ 1 ], u[ 2 ] * w[ 0 ] - u[ 0 ] * w[ 2 ], u[ 0 ] * w[ 1 ] - u[ 1 ] * w[ 0 ] ];
		const o = xyz( out );
		const round = n[ 0 ] * o[ 0 ] + n[ 1 ] * o[ 1 ] + n[ 2 ] * o[ 2 ] < 0 ? [ ...corners ].reverse() : corners;
		const list = round.length === 4 ? [ 0, 1, 2, 0, 2, 3 ] : [ 0, 1, 2 ];
		for ( const i of list ) this.positions.push( ...xyz( round[ i ] ) );

	}

	box( { x, l }, [ e0, e1 ] ) {

		const [ x0, x1 ] = x, [ l0, l1 ] = l;
		this.face( [ [ x0, e1, l0 ], [ x1, e1, l0 ], [ x1, e1, l1 ], [ x0, e1, l1 ] ], [ 0, 1, 0 ] );
		this.face( [ [ x0, e0, l0 ], [ x1, e0, l0 ], [ x1, e0, l1 ], [ x0, e0, l1 ] ], [ 0, - 1, 0 ] );
		this.face( [ [ x0, e0, l0 ], [ x1, e0, l0 ], [ x1, e1, l0 ], [ x0, e1, l0 ] ], [ 0, 0, - 1 ] );
		this.face( [ [ x0, e0, l1 ], [ x1, e0, l1 ], [ x1, e1, l1 ], [ x0, e1, l1 ] ], [ 0, 0, 1 ] );
		this.face( [ [ x0, e0, l0 ], [ x0, e1, l0 ], [ x0, e1, l1 ], [ x0, e0, l1 ] ], [ - 1, 0, 0 ] );
		this.face( [ [ x1, e0, l0 ], [ x1, e1, l0 ], [ x1, e1, l1 ], [ x1, e0, l1 ] ], [ 1, 0, 0 ] );
		return this;

	}

	// A plate with openings cut out of it, however they meet its edge. `axis`: what it's thin
	// along ('el': a slab, outline and openings in x and letter; 'x': a wall across the gallery,
	// in letter and el; 'l': a wall along it, in x and el). [ t0, t1 ]: its two faces along that axis.
	plate( axis, [ t0, t1 ], outline, openings = [] ) {

		const rect = ( [ a0, a1 ], [ b0, b1 ] ) => [ [ [ a0, b0 ], [ a1, b0 ], [ a1, b1 ], [ a0, b1 ], [ a0, b0 ] ] ];
		const [ u, v ] = { el: [ 'x', 'l' ], x: [ 'l', 'el' ], l: [ 'x', 'el' ] }[ axis ];
		const left = polygonClipping.difference( rect( outline[ u ], outline[ v ] ), ...openings.map( o => rect( o[ u ], o[ v ] ) ) );
		// A point, or a direction, from ( a, b ) across the plate and t through it: [ x, el, letter ].
		const at = { el: ( a, b, t ) => [ a, t, b ], x: ( a, b, t ) => [ t, b, a ], l: ( a, b, t ) => [ a, b, t ] }[ axis ];
		for ( const polygon of left ) {

			const rings = polygon.map( ring => ring.slice( 0, - 1 ).map( ( [ a, b ] ) => new Vector2( a, b ) ) );
			const [ outer, ...holes ] = rings;
			// The outer ring anticlockwise and holes clockwise, so the concrete is on the left of every edge.
			if ( ShapeUtils.isClockWise( outer ) ) outer.reverse();
			for ( const hole of holes ) if ( ! ShapeUtils.isClockWise( hole ) ) hole.reverse();
			const points = rings.flat();
			for ( const corners of ShapeUtils.triangulateShape( outer, holes ) ) {

				const [ p, q, r ] = corners.map( n => points[ n ] );
				this.face( [ p, q, r ].map( c => at( c.x, c.y, t1 ) ), at( 0, 0, 1 ) );
				this.face( [ p, q, r ].map( c => at( c.x, c.y, t0 ) ), at( 0, 0, - 1 ) );

			}

			// Its edges, round the outside and round each opening: looking away from the concrete.
			for ( const ring of rings ) for ( let i = 0; i < ring.length; i ++ ) {

				const p = ring[ i ], q = ring[ ( i + 1 ) % ring.length ];
				this.face( [ at( p.x, p.y, t0 ), at( q.x, q.y, t0 ), at( q.x, q.y, t1 ), at( p.x, p.y, t1 ) ], at( q.y - p.y, p.x - q.x, 0 ) );

			}

		}

		return this;

	}

	// A part of the model as it is: its triangles, each corner through `move`.
	add( positions, index, triangles, move = p => p ) {

		for ( const t of triangles ) for ( let k = 0; k < 3; k ++ ) {

			const i = index[ t * 3 + k ] * 3;
			this.positions.push( ...move( [ positions[ i ], positions[ i + 1 ], positions[ i + 2 ] ] ) );

		}

		return this;

	}

	// As a layer: corners that meet are one corner, so the twin's copy of it is small.
	layer() {

		const corners = new Map(), positions = [], index = [];
		for ( let i = 0; i < this.positions.length; i += 3 ) {

			const p = this.positions.slice( i, i + 3 ).map( v => Math.round( v * 1e4 ) / 1e4 );
			const key = p.join( ',' );
			if ( ! corners.has( key ) ) {

				corners.set( key, positions.length / 3 );
				positions.push( ...p );

			}

			index.push( corners.get( key ) );

		}

		return { positions: Float32Array.from( positions ), index: Uint32Array.from( index ) };

	}

}

// The parts of a layer: triangles that share corners, with the box each fills. [ { triangles, min, max } ]
function partsOf( { positions, index } ) {

	const ids = new Map(), parent = [];
	const find = a => {

		while ( parent[ a ] !== a ) a = parent[ a ] = parent[ parent[ a ] ];
		return a;

	};
	const corner = i => {

		const key = `${ Math.round( positions[ i * 3 ] * 1000 ) },${ Math.round( positions[ i * 3 + 1 ] * 1000 ) },${ Math.round( positions[ i * 3 + 2 ] * 1000 ) }`;
		if ( ! ids.has( key ) ) {

			ids.set( key, parent.length );
			parent.push( parent.length );

		}

		return ids.get( key );

	};
	for ( let t = 0; t < index.length; t += 3 ) {

		const [ a, b, c ] = [ 0, 1, 2 ].map( k => corner( index[ t + k ] ) );
		parent[ find( a ) ] = find( b );
		parent[ find( b ) ] = find( c );

	}

	const parts = new Map();
	for ( let t = 0; t < index.length; t += 3 ) {

		const root = find( corner( index[ t ] ) );
		if ( ! parts.has( root ) ) parts.set( root, { triangles: [], min: [ Infinity, Infinity, Infinity ], max: [ - Infinity, - Infinity, - Infinity ] } );
		const part = parts.get( root );
		part.triangles.push( t / 3 );
		for ( let k = 0; k < 3; k ++ ) for ( let a = 0; a < 3; a ++ ) {

			const v = positions[ index[ t + k ] * 3 + a ];
			part.min[ a ] = Math.min( part.min[ a ], v );
			part.max[ a ] = Math.max( part.max[ a ], v );

		}

	}

	return [ ...parts.values() ];

}

// From one stretch to another, in proportion.
const stretch = ( [ a0, a1 ], [ b0, b1 ] ) => v => b0 + ( v - a0 ) * ( b1 - b0 ) / ( a1 - a0 );

// ---------- The pit ----------

function pit() {

	const s = new Solid();
	const { x, l, outer } = PIT;
	const walls = [ EL.pit[ 0 ], EL.lid[ 0 ] ];
	// Under the floor, and the floor with the sump let into it.
	s.box( outer, [ EL.pit[ 0 ], EL.sump ] );
	s.plate( 'el', [ EL.sump, EL.pit[ 1 ] ], outer, [ WAS.sump ] );
	// Walls: AA and AJ sides the length of the pit, the ends between them. The AJ side opens onto
	// C32, the north end onto the gallery.
	s.plate( 'l', [ outer.l[ 0 ], l[ 0 ] ], { x: outer.x, el: walls } );
	s.plate( 'l', [ l[ 1 ], outer.l[ 1 ] ], { x: outer.x, el: walls }, [ { x: C32.x, el: WAS.c32Mouth } ] );
	s.plate( 'x', [ outer.x[ 0 ], x[ 0 ] ], { l, el: walls } );
	s.plate( 'x', [ x[ 1 ], outer.x[ 1 ] ], { l, el: walls }, [ WAS.doorway ] );
	// B1: the slab, open in the middle and at two gratings along the AA side; its beams under it.
	s.plate( 'el', EL.b1, { x, l }, B1_OPENINGS );
	for ( const beam of Object.values( B1_BEAMS ) ) s.box( beam, [ beam.to ?? EL.b1Beams, EL.b1[ 0 ] ] );
	// At grade: the lid and what carries it.
	s.plate( 'el', EL.lid, outer, LID_OPENINGS );
	s.box( CROSS_BEAM, [ EL.crossBeam, EL.lid[ 0 ] ] );
	s.box( SHED_BEAM, [ EL.shedBeam, EL.lid[ 0 ] ] );
	for ( const across of Object.values( TRAIN_BEAMS ) ) s.box( { x, l: across }, [ EL.rail[ 0 ], EL.lid[ 0 ] ] );
	return s.layer();

}

// ---------- The gallery ----------

function gallery( was ) {

	const s = new Solid();
	const along = stretch( WAS.gallery.x, GALLERY.x ), end = stretch( WAS.gallery.end, GALLERY.end );
	for ( const part of partsOf( was ) ) {

		const north = part.min[ 0 ] > WAS.gallery.end[ 0 ] - 0.1;
		const long = part.max[ 0 ] - part.min[ 0 ] > 40;
		// Kept: the floor, the hopper plates and the walls up to their tops, and the north end below
		// its lid. Everything at grade is redrawn below.
		const keep = north ? part.max[ 1 ] < EL.endLid[ 0 ] : long && part.max[ 1 ] < EL.rail[ 0 ] + 0.01 && part.min[ 1 ] < EL.strip[ 0 ] - 1;
		if ( keep ) s.add( was.positions, was.index, part.triangles, ( [ x, y, z ] ) => [ ( north ? end : along )( x ), y, z ] );

	}

	const x = GALLERY.x;
	const [ rail2, rail1 ] = [ TRAIN_BEAMS[ 2 ], TRAIN_BEAMS[ 1 ] ];
	// Pony walls, the slab strips inside them as far as the steel plates, and the rail beams.
	s.box( { x, l: PONY.east }, EL.pony ).box( { x, l: PONY.west }, EL.pony );
	s.box( { x, l: [ PONY.east[ 1 ], rail2[ 0 ] - PLATE ] }, EL.strip ).box( { x, l: [ rail1[ 1 ] + PLATE, PONY.west[ 0 ] ] }, EL.strip );
	s.box( { x, l: rail2 }, EL.rail ).box( { x, l: rail1 }, EL.rail );
	// Cross beams G1 to G12: across under the rails, and up between them.
	for ( const g of G_BEAMS.filter( g => g < GALLERY.x[ 1 ] - 1 ) ) {

		const span = [ g, g + G_WIDTH ];
		s.box( { x: span, l: G_ACROSS }, EL.gBeam );
		s.box( { x: span, l: [ rail2[ 1 ], rail1[ 0 ] ] }, [ EL.gBeam[ 1 ], EL.gUpstand ] );

	}

	// The north end's lid, open twice, and G13 and G14 under it.
	s.plate( 'el', EL.endLid, { x: GALLERY.end, l: WAS.endLid.l }, END_OPENINGS );
	for ( const g of G_BEAMS.filter( g => g > GALLERY.x[ 1 ] - 1 ) ) s.box( { x: [ Math.max( g, GALLERY.end[ 0 ] ), g + G_WIDTH ], l: WAS.endBeams.l }, [ EL.endBeams, EL.endLid[ 0 ] ] );
	return s.layer();

}

// Steel plates at grade, beside the rail beams, from one cross beam to the next.
function plates() {

	const s = new Solid();
	const beams = G_BEAMS.filter( g => g < GALLERY.x[ 1 ] );
	for ( let i = 0; i + 1 < beams.length; i ++ ) {

		const x = [ beams[ i ] + G_WIDTH, beams[ i + 1 ] ];
		s.box( { x, l: [ TRAIN_BEAMS[ 2 ][ 0 ] - PLATE, TRAIN_BEAMS[ 2 ][ 0 ] ] }, EL.plate );
		s.box( { x, l: [ TRAIN_BEAMS[ 1 ][ 1 ], TRAIN_BEAMS[ 1 ][ 1 ] + PLATE ] }, EL.plate );

	}

	return s.layer();

}

// ---------- C32 ----------

// Over to the drawings' line, and its first stretch drawn out to the pit's wall where that is now.
function c32( was ) {

	const s = new Solid();
	const over = C32.x[ 0 ] - WAS.c32.x[ 0 ];
	const toPit = stretch( [ WAS.c32.start, WAS.c32.flat ], [ PIT.outer.l[ 1 ], WAS.c32.flat ] );
	s.add( was.positions, was.index, Array.from( { length: was.index.length / 3 }, ( _, i ) => i ), ( [ x, y, z ] ) => [ x + over, y, - z < WAS.c32.flat ? - toPit( - z ) : z ] );
	return s.layer();

}

// The site's layers ({ key: { positions, index } }, keys c31, pit, c32, steel and the rest) with
// the structure put on the drawings' grid.
export function correctStructure( site ) {

	return { ...site, pit: pit(), c31: gallery( site.c31 ), steel: plates(), c32: c32( site.c32 ) };

}

// Where the views of the model look from, which move with it.
export const C32_LINE = ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2;
export const C32_INSIDE = C32.x;
export const PIT_INSIDE = PIT;
