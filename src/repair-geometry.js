// The geometry of the B2D2 model's repair areas, shared by the script that builds the model
// (scripts/b2d2-repair-model.mjs) and the twin's area editor (repair-areas.js), so an area moved
// in the twin comes out exactly as the build would make it there.
//
// Everything here is in the artifact's frame: x = C31 numeric grid (m), y = Hatch-style elevation
// (m), z = minus the letter grid. A markup is { id, n, pts, area, face, zone, grid, f }: its outline
// (pts, [ x, y, z ] each) and the normal it was marked with (n, out of the concrete toward where it
// was marked from).
//
// Areas chipped or hydro-demolished are cut out of the wall, floor or soffit they're on, and in
// their place is a recess of rough, fresh concrete (CHIP.depth deep, the edge stepping in
// irregularly) with the rebar mat exposed in it: bars both ways at CHIP.spacing, CHIP.cover behind
// the face, running on into the concrete past the edge. The roughness is random but seeded by the
// markup's id, so a rebuild comes out the same. A rim round it on the face carries the colour of
// when it was chipped. The stages after (sandblasted, epoxy coated, shotcreted) each have their own
// look: LOOKS. Areas only marked are a flat patch OFFSET off their face, with an outline.

import polygonClipping from 'polygon-clipping';
import { ShapeUtils, Vector2, Vector3 } from 'three';

export const MARKED = 'Marked, not chipped yet';
export const CHIPPED = 'Chipped / hydro-demo';
export const SANDBLASTED = 'Sandblasted';
export const EPOXY = 'Epoxy coated';
export const SHOTCRETED = 'Shotcreted';

// The stages of a repair, in order: an area's status (f.status) is one of these, and `date` is
// where in f the day it reached that stage is kept (f.chipped, as the progress drawings give it).
export const STAGES = [
	{ status: MARKED, date: null, short: 'Marked' },
	{ status: CHIPPED, date: 'chipped', short: 'Chipped' },
	{ status: SANDBLASTED, date: 'sandblasted', short: 'Sandblasted' },
	{ status: EPOXY, date: 'epoxy', short: 'Epoxy coated' },
	{ status: SHOTCRETED, date: 'shotcreted', short: 'Shotcreted' },
];
export const stageOf = status => STAGES.find( stage => stage.status === status ) ?? STAGES[ 0 ];

// The days a stage's date says, as 'YYYY-MM-DD': one, or each day of a span ('2026-11-05/08', as the
// progress drawings give; '2026-11-30/02' runs into the next month). [] if it doesn't say a day.
export function daysOf( date ) {

	const said = /^(\d{4})-(\d{2})-(\d{2})(?:\/(\d{2}))?/.exec( date ?? '' );
	if ( ! said ) return [];
	const [ year, month, first ] = said.slice( 1, 4 ).map( Number );
	const last = said[ 4 ] === undefined ? first : Number( said[ 4 ] );
	const from = Date.UTC( year, month - 1, first );
	const to = Date.UTC( year, month - 1 + ( last < first ? 1 : 0 ), last );
	const days = [];
	for ( let t = from; t <= to && days.length < 62; t += 86400000 ) days.push( new Date( t ).toISOString().slice( 0, 10 ) );
	return days;

}

// The day a stage's date says, or null if it doesn't say one. A span of days is its last: by then
// it was done.
export const dayOf = date => daysOf( date ).at( - 1 ) ?? null;

// The stage an area had reached by the end of a day ('YYYY-MM-DD'), from the days it reached
// each: its status then, or null if it hadn't been chipped yet. An area with no days to go by,
// or only marked, is as it is now whenever.
export function stageAt( m, day ) {

	const f = m.f ?? {};
	const now = STAGES.indexOf( stageOf( f.status ) );
	let reached = null, dated = false;
	for ( let i = 1; i <= now; i ++ ) {

		const on = dayOf( f[ STAGES[ i ].date ] );
		if ( ! on ) continue;
		dated = true;
		if ( on <= day ) reached = STAGES[ i ].status;

	}

	return dated ? reached : f.status ?? null;

}

// How each stage past marking looks. The area is cut out of its face, and in it:
// - chipped: a recess of rough, broken concrete (the chipped concrete's texture) with rusty bars;
// - sandblasted: the same recess blasted clean, light and even, the bars bright steel;
// - epoxy coated: the bars coated in green epoxy, in the blasted recess as it was;
// - shotcreted: filled again, a touch proud of the face, in fresh shotcrete, no bars to see.
// `concrete` and `rebar` are material settings (the chipped concrete's own texture with `map`,
// else the colour over its relief); `rim` the colour of the strip round the area on its face
// (a chipped area's is by the day it was chipped: rimOf).
export const LOOKS = {
	[ CHIPPED ]: { concrete: { map: true, color: '#ffffff', roughness: 0.95 }, rebar: { color: '#7c4a2d', metalness: 0.5, roughness: 0.65 } },
	[ SANDBLASTED ]: { concrete: { color: '#cfccc4', roughness: 0.9 }, rebar: { color: '#c9ced4', metalness: 0.3, roughness: 0.4 }, rim: '#f1f5f9' },
	[ EPOXY ]: { concrete: { color: '#cfccc4', roughness: 0.9 }, rebar: { color: '#2dbd62', metalness: 0, roughness: 0.35 }, rim: '#047857' },
	[ SHOTCRETED ]: { filled: true, concrete: { color: '#b9b6ae', roughness: 1 }, rim: '#475569' },
};
// What the concrete's and the bars' materials are called for a stage, in the model and the twin.
export const lookNames = status => status === CHIPPED
	? { concrete: 'Chipped concrete', rebar: 'Exposed rebar' }
	: { concrete: `${ status } concrete`, rebar: `${ status } rebar` };
// Shotcrete stands this far (m) proud of the face.
const PROUD = 0.012;

// The rims of chipped areas, by when they were chipped: the progress drawings' colours, then
// others for later days.
const CHIPPED_COLOURS = { '2026-11-02': '#22c55e', '2026-11-03': '#06b6d4', '2026-11-04': '#f97316', '2026-11-05/08': '#ec4899', '2026-11-09': '#3b82f6', '2026-11-10': '#eab308' };
const LATER_COLOURS = [ '#eab308', '#8b5cf6', '#ef4444', '#3b82f6', '#84cc16', '#f43f5e', '#14b8a6', '#a855f7' ];
const UNDATED = '#94a3b8';

export function chippedColour( date ) {

	if ( ! date ) return UNDATED;
	if ( CHIPPED_COLOURS[ date ] ) return CHIPPED_COLOURS[ date ];
	const h = [ ...date ].reduce( ( h, c ) => ( h * 31 + c.charCodeAt( 0 ) ) >>> 0, 7 );
	return LATER_COLOURS[ h % LATER_COLOURS.length ];

}

// The strip round an area on its face: its material's name and colour. Null for a marked area.
export function rimOf( m ) {

	const f = m.f ?? {};
	const look = LOOKS[ f.status ];
	if ( ! look ) return null;
	if ( look.rim ) return { name: `${ f.status } rim`, colour: look.rim };
	return { name: `Chipped ${ f.chipped ?? '' }`.trim(), colour: chippedColour( f.chipped ) };

}
// A chipped area, in metres: how deep (a markup's measured depth wins), how far the edge steps in
// on its way down, how far apart the points along it are, and the rebar (15M bars, 300 mm both
// ways, 50 mm cover), which runs on this far into the concrete past the edge.
export const CHIP = { depth: 0.1, inset: 0.03, step: 0.08, bar: 0.016, spacing: 0.3, cover: 0.05, runOn: 0.12, sides: 8 };
// A face an area was marked on: parallel to it and this close (m). Failing that, the nearest
// parallel face this close is taken as the one meant.
export const ON_FACE = 0.03;
export const NEAR_FACE = 0.25;
const OFFSET = 0.03; // a flat patch: m off the face
const EDGE = 0.04; // its outline's width, m
const RIM = 0.04; // a chipped area's rim's width, m

export const zoneName = z => ( { c31: 'C31 gallery', c32: 'C32 tunnel', pit: 'Transfer pit', ground: 'Ground level' } )[ z ] ?? 'Site';

// What the twin's tooltips and the build call an area.
export const areaName = m => `${ m.no ? `No. ${ m.no } · ` : '' }${ m.f?.type || 'Repair area' } · ${ zoneName( m.zone ) } ${ m.face ?? '' } · ${ ( m.area ?? 0 ).toFixed( 2 ) } m²`;

// ---------- Naming, as the B2D2 Repair Model artifact does ----------

const L24 = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const letter = i => i < 0 ? '<AA' : i < 24 ? 'A' + L24[ i ] : i < 48 ? 'B' + L24[ i - 24 ] : '>BY';
export const numRange = ( a, b ) => {

	const lo = Math.floor( a + 1e-6 ), hi = Math.ceil( b - 1e-6 );
	return hi - lo < 1 ? String( lo ) : `${ lo }–${ hi }`;

};
export const letRange = ( a, b ) => {

	const lo = Math.floor( a + 1e-6 ), hi = Math.max( lo + 1, Math.ceil( b - 1e-6 ) );
	return `${ letter( lo ) }–${ letter( hi ) }`;

};
export const fEL = y => `EL ${ y >= 0 ? '+' : '−' }${ Math.abs( y ).toFixed( 2 ) }`;

// "Grid 54–56 / AH–AJ · EL −0.08 to EL +0.92": numeric and letter grid, and elevation.
export function gridRef( P ) {

	const xs = P.map( p => p[ 0 ] ), zs = P.map( p => - p[ 2 ] ), ys = P.map( p => p[ 1 ] );
	const [ ya, yb ] = [ Math.min( ...ys ), Math.max( ...ys ) ];
	return `Grid ${ numRange( Math.min( ...xs ), Math.max( ...xs ) ) } / ${ letRange( Math.min( ...zs ), Math.max( ...zs ) ) } · ${ fEL( ya ) }${ yb - ya > 0.05 ? ` to ${ fEL( yb ) }` : '' }`;

}

// Which part of the structure a point is in.
export function zoneOf( [ x, y, z ] ) {

	const Z = - z;
	if ( y > 4.3 ) return 'ground';
	if ( Z > 8.6 && x < 6.5 ) return 'c32';
	if ( x < 9.2 ) return 'pit';
	if ( x <= 69.3 ) return 'c31';
	return 'ground';

}

// Area of a flat polygon in 3D (Newell).
export function area3( P ) {

	const n = [ 0, 0, 0 ];
	P.forEach( ( p, i ) => {

		const q = P[ ( i + 1 ) % P.length ];
		n[ 0 ] += ( p[ 1 ] - q[ 1 ] ) * ( p[ 2 ] + q[ 2 ] );
		n[ 1 ] += ( p[ 2 ] - q[ 2 ] ) * ( p[ 0 ] + q[ 0 ] );
		n[ 2 ] += ( p[ 0 ] - q[ 0 ] ) * ( p[ 1 ] + q[ 1 ] );

	} );
	return Math.hypot( ...n ) / 2;

}

// Zone, face, grid reference and area of an outline drawn on the structure (pts, and n out of the
// concrete toward where it was drawn from), named as the progress drawings' areas are.
export function describeArea( pts, n ) {

	const middle = pts.reduce( ( s, p ) => s.map( ( c, i ) => c + p[ i ] / pts.length ), [ 0, 0, 0 ] );
	const zone = zoneOf( middle );
	const [ nx, ny, nz ] = n;
	let face;
	if ( ny > 0.75 ) face = zone === 'pit' ? 'pit floor (B2)' : zone === 'ground' ? 'slab top' : 'floor';
	else if ( ny < - 0.75 ) face = zone === 'pit' ? 'pit soffit' : 'soffit';
	else if ( zone === 'pit' && Math.abs( nx ) > Math.abs( nz ) ) face = middle[ 0 ] > 4 ? 'pit north wall (grid 8)' : 'pit south wall (grid 0)';
	else if ( zone === 'pit' ) face = nz < 0 ? 'pit east wall (AA side)' : 'pit west wall (AJ side)';
	else if ( zone === 'c32' ) face = nx > 0 ? 'south wall' : 'north wall';
	else if ( zone === 'ground' ) face = Math.abs( nz ) >= Math.abs( nx ) ? ( nz < 0 ? 'east pony wall at grade (AA side)' : 'west pony wall at grade (AJ side)' ) : 'wall at grade';
	else if ( Math.abs( nz ) >= Math.abs( nx ) ) face = nz < 0 ? 'east wall (AA side)' : 'west wall (AJ side)';
	else face = nx > 0 ? 'south wall (grid 0 end)' : 'north wall (grid 69 end)';
	return { zone, face, grid: gridRef( pts ), area: +area3( pts ).toFixed( 3 ) };

}

// A markup's face as a plane: N out of the concrete toward where it was marked from, U and V
// across it (U level on walls, along x on floors and soffits, so bars line up from one area to the
// next on the same face), h its offset along N, and the outline in (s, t) = (along U, along V),
// anticlockwise.
export function planeOf( m, N ) {

	const { U, V } = basisOf( N );
	const plane = { N, U, V, h: N.dot( new Vector3( ...m.pts[ 0 ] ) ) };
	plane.poly = m.pts.map( p => toPlane( plane, p ) );
	if ( ShapeUtils.isClockWise( plane.poly.map( ( [ s, t ] ) => new Vector2( s, t ) ) ) ) plane.poly.reverse();
	return plane;

}

// U and V across a face with normal N, as planeOf has them.
export function basisOf( N ) {

	const U = Math.abs( N.y ) < 0.75
		? new Vector3().crossVectors( new Vector3( 0, 1, 0 ), N ).normalize()
		: new Vector3( 1, 0, 0 ).addScaledVector( N, - N.x ).normalize();
	return { U, V: new Vector3().crossVectors( N, U ) };

}

// The plane of the outline's own corners where that lies on a face of the structure, else the
// plane through its first corner square to its saved normal, with the outline laid onto it: some
// were saved with a rounded normal (straight up on C32's sloping floor), one with its corners
// tilted off the face it was marked on (the pit floor).
export function choosePlane( m, triangles ) {

	const own = planeOf( m, outlineNormal( m ) );
	if ( triangles.some( tri => onFace( tri, own, NEAR_FACE ) ) ) return own;
	const given = planeOf( m, new Vector3( ...m.n ).normalize() );
	if ( triangles.some( tri => onFace( tri, given, NEAR_FACE ) ) ) {

		given.laid = true;
		return given;

	}

	return own;

}

// The plane of the outline's own corners (Newell's method), facing the way the markup's normal does.
export function outlineNormal( m ) {

	const given = new Vector3( ...m.n ).normalize();
	const n = new Vector3();
	m.pts.forEach( ( p, i ) => {

		const q = m.pts[ ( i + 1 ) % m.pts.length ];
		n.x += ( p[ 1 ] - q[ 1 ] ) * ( p[ 2 ] + q[ 2 ] );
		n.y += ( p[ 2 ] - q[ 2 ] ) * ( p[ 0 ] + q[ 0 ] );
		n.z += ( p[ 0 ] - q[ 0 ] ) * ( p[ 1 ] + q[ 1 ] );

	} );
	if ( n.length() < 1e-6 ) return given;
	n.normalize();
	return n.dot( given ) < 0 ? n.negate() : n;

}

export const toPlane = ( { U, V }, p ) => {

	const v = Array.isArray( p ) ? new Vector3( ...p ) : p;
	return [ v.dot( U ), v.dot( V ) ];

};
// depth: behind the face, into the concrete.
export const toWorld = ( { U, V, N, h }, s, t, depth = 0 ) => new Vector3().addScaledVector( U, s ).addScaledVector( V, t ).addScaledVector( N, h - depth );

// The same random numbers for the same markup every time (mulberry32, seeded by its id).
export function random( seed ) {

	let a = [ ...String( seed ) ].reduce( ( h, c ) => Math.imul( h ^ c.charCodeAt( 0 ), 2654435761 ), 1779033703 ) >>> 0;
	return () => {

		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

// ---------- The structure, with chipped areas cut out ----------

export const triNormal = ( a, b, c ) => new Vector3().subVectors( b, a ).cross( new Vector3().subVectors( c, a ) ).normalize();

// The triangles of a layer ({ positions, index }), each { a, b, c } (Vector3s).
export function trianglesOf( { positions, index } ) {

	const at = i => new Vector3( positions[ i * 3 ], positions[ i * 3 + 1 ], positions[ i * 3 + 2 ] );
	const out = [];
	for ( let i = 0; i < index.length; i += 3 ) out.push( { a: at( index[ i ] ), b: at( index[ i + 1 ] ), c: at( index[ i + 2 ] ) } );
	return out;

}

// Whether a triangle lies in an area's plane (within `within`) and its box reaches the area.
export function onFace( tri, plane, within ) {

	const n = triNormal( tri.a, tri.b, tri.c );
	if ( Math.abs( n.dot( plane.N ) ) < 0.98 ) return false;
	if ( Math.abs( plane.N.dot( tri.a ) - plane.h ) > within ) return false;
	const st = [ tri.a, tri.b, tri.c ].map( p => toPlane( plane, p ) );
	const [ s0, s1 ] = [ Math.min( ...plane.poly.map( p => p[ 0 ] ) ), Math.max( ...plane.poly.map( p => p[ 0 ] ) ) ];
	const [ t0, t1 ] = [ Math.min( ...plane.poly.map( p => p[ 1 ] ) ), Math.max( ...plane.poly.map( p => p[ 1 ] ) ) ];
	return Math.max( ...st.map( p => p[ 0 ] ) ) > s0 && Math.min( ...st.map( p => p[ 0 ] ) ) < s1 && Math.max( ...st.map( p => p[ 1 ] ) ) > t0 && Math.min( ...st.map( p => p[ 1 ] ) ) < t1;

}

// An area that isn't on a face follows its face up to this far (m): where the model's walls have
// been put right since the area was marked or moved, by more than NEAR_FACE.
export const FOLLOW = 1;

// Each area's plane moved onto the face it's marked on, where that's off it: a little (marked on
// a drawing's plane rather than the model's face, say), or as far as FOLLOW where the face itself
// has moved. The face is the one seen from in front of the area, looking the way the area does:
// so a wall that moved by about its own thickness doesn't take the area onto its far side, nor
// does a face buried in the concrete behind the one that shows.
export function settleOnFaces( planes, triangles ) {

	for ( const plane of planes ) {

		const seen = faceSeen( plane, triangles );
		if ( seen !== null ) {

			if ( Math.abs( seen ) > ON_FACE ) {

				plane.h += seen;
				plane.moved = seen;

			}

			continue;

		}

		// No face looks its way there (a part whose faces are wound the other way round, or the
		// area is off the edge of its face): the nearest face in its plane, whichever way it looks.
		if ( triangles.some( tri => onFace( tri, plane, ON_FACE ) ) ) continue;
		const near = triangles.filter( tri => onFace( tri, plane, NEAR_FACE ) ).map( tri => plane.N.dot( tri.a ) - plane.h ).sort( ( a, b ) => Math.abs( a ) - Math.abs( b ) );
		if ( near.length ) {

			plane.h += near[ 0 ];
			plane.moved = near[ 0 ];

		} else plane.loose = true;

	}

}

// How far along its normal (toward where it's seen from, or negative, away) an area's plane is
// from the face it's seen on: the first face looking the way the area does that a ray meets
// coming at the area from FOLLOW in front of it, at the middle of its outline, else at a corner.
// Null if there's none within FOLLOW.
export function faceSeen( plane, triangles ) {

	const { N, poly } = plane;
	const facing = triangles.filter( tri => triNormal( tri.a, tri.b, tri.c ).dot( N ) > 0.98 );
	const from = FOLLOW + 0.05;
	const back = N.clone().negate();
	const middle = poly.reduce( ( m, [ s, t ] ) => [ m[ 0 ] + s / poly.length, m[ 1 ] + t / poly.length ], [ 0, 0 ] );
	for ( const [ s, t ] of [ middle, ...poly ] ) {

		const origin = toWorld( plane, s, t, - from );
		let first = Infinity;
		for ( const tri of facing ) {

			const d = rayHit( origin, back, tri );
			if ( d !== null && d < first ) first = d;

		}

		if ( Math.abs( from - first ) <= FOLLOW ) return from - first;

	}

	return null;

}

// Where along a ray (from `origin`, the way of `direction`, a unit vector) it meets a triangle:
// the distance, or null.
function rayHit( origin, direction, { a, b, c } ) {

	const e1 = new Vector3().subVectors( b, a ), e2 = new Vector3().subVectors( c, a );
	const p = new Vector3().crossVectors( direction, e2 );
	const det = e1.dot( p );
	if ( Math.abs( det ) < 1e-9 ) return null;
	const s = new Vector3().subVectors( origin, a );
	const u = s.dot( p ) / det;
	if ( u < - 1e-6 || u > 1 + 1e-6 ) return null;
	const q = new Vector3().crossVectors( s, e1 );
	const v = direction.dot( q ) / det;
	if ( v < - 1e-6 || u + v > 1 + 1e-6 ) return null;
	const distance = e2.dot( q ) / det;
	return distance > 1e-6 ? distance : null;

}

// A layer's triangles with the chipped areas on them cut out, as a flat list of positions, and
// for each triangle of it the one of the layer's it came from (`source`: what's painted follows).
export function cutOut( triangles, planes ) {

	const out = [];
	const source = [];
	let cut = 0;
	triangles.forEach( ( tri, index ) => {

		const on = planes.filter( plane => onFace( tri, plane, ON_FACE ) );
		if ( on.length === 0 ) {

			out.push( ...tri.a.toArray(), ...tri.b.toArray(), ...tri.c.toArray() );
			source.push( index );
			return;

		}

		// In the first area's plane; the triangle's own offset along it, so it stays where it was.
		const plane = { ...on[ 0 ], h: on[ 0 ].N.dot( tri.a ) };
		const ring = points => [ ...points, points[ 0 ] ];
		const left = polygonClipping.difference(
			[ ring( [ tri.a, tri.b, tri.c ].map( p => toPlane( plane, p ) ) ) ],
			...on.map( other => [ ring( other.poly.map( ( [ s, t ] ) => toPlane( plane, toWorld( other, s, t ) ) ) ) ] ),
		);
		const facing = triNormal( tri.a, tri.b, tri.c );
		for ( const polygon of left ) {

			const [ outer, ...holes ] = polygon.map( r => r.slice( 0, - 1 ).map( ( [ s, t ] ) => new Vector2( s, t ) ) );
			const points = [ outer, ...holes ].flat();
			for ( const [ i, j, k ] of ShapeUtils.triangulateShape( outer, holes ) ) {

				let [ a, b, c ] = [ i, j, k ].map( n => toWorld( plane, points[ n ].x, points[ n ].y ) );
				if ( triNormal( a, b, c ).dot( facing ) < 0 ) [ b, c ] = [ c, b ];
				out.push( ...a.toArray(), ...b.toArray(), ...c.toArray() );
				source.push( index );

			}

		}

		cut ++;

	} );
	return { positions: new Float32Array( out ), cut, source };

}

// ---------- Faces of the structure ----------

// The whole face a triangle of a layer is part of: the triangles in its plane joined to it corner
// to corner (a wall from end to end, a floor, a soffit), as their numbers in the layer.
export function coplanarFace( triangles, seed ) {

	const N = triNormal( triangles[ seed ].a, triangles[ seed ].b, triangles[ seed ].c );
	const h = N.dot( triangles[ seed ].a );
	const inPlane = tri => Math.abs( triNormal( tri.a, tri.b, tri.c ).dot( N ) ) > 0.999 && [ tri.a, tri.b, tri.c ].every( p => Math.abs( N.dot( p ) - h ) < 0.005 );
	// Corners to the millimetre: which of the plane's triangles meet at each.
	const corner = p => `${ Math.round( p.x * 1000 ) },${ Math.round( p.y * 1000 ) },${ Math.round( p.z * 1000 ) }`;
	const at = new Map();
	const flat = [];
	triangles.forEach( ( tri, i ) => {

		if ( ! inPlane( tri ) ) return;
		flat.push( i );
		for ( const p of [ tri.a, tri.b, tri.c ] ) at.set( corner( p ), [ ...( at.get( corner( p ) ) ?? [] ), i ] );

	} );
	const face = new Set( [ seed ] );
	const queue = [ seed ];
	while ( queue.length ) {

		const tri = triangles[ queue.pop() ];
		for ( const p of [ tri.a, tri.b, tri.c ] ) for ( const next of at.get( corner( p ) ) ?? [] ) {

			if ( face.has( next ) ) continue;
			face.add( next );
			queue.push( next );

		}

	}

	return [ ...face ];

}

// The triangle of a layer a point is on, facing along n either way: its number, or -1. A point
// just off every triangle (a rebuilt model's faces moved a little) takes the nearest facing that way.
export function triangleAt( triangles, point, n ) {

	const P = Array.isArray( point ) ? new Vector3( ...point ) : point;
	const N = ( Array.isArray( n ) ? new Vector3( ...n ) : n.clone() ).normalize();
	let best = - 1, bestDistance = 0.5;
	triangles.forEach( ( tri, i ) => {

		const normal = triNormal( tri.a, tri.b, tri.c );
		if ( Math.abs( normal.dot( N ) ) < 0.98 ) return;
		const off = Math.abs( normal.dot( P ) - normal.dot( tri.a ) );
		if ( off > 0.05 ) return;
		// How far outside the triangle the point is, along its plane (0 inside).
		const edges = [ [ tri.a, tri.b ], [ tri.b, tri.c ], [ tri.c, tri.a ] ];
		const outside = Math.max( 0, ...edges.map( ( [ p, q ] ) => new Vector3().subVectors( q, p ).cross( new Vector3().subVectors( P, p ) ).dot( normal ) / - p.distanceTo( q ) ) );
		const distance = outside + off;
		if ( distance < bestDistance ) {

			best = i;
			bestDistance = distance;

		}

	} );
	return best;

}

// ---------- A chipped area: the recess and its rebar ----------

// The outline with points every CHIP.step along its edges.
function resample( poly ) {

	const out = [];
	for ( let i = 0; i < poly.length; i ++ ) {

		const [ a, b ] = [ poly[ i ], poly[ ( i + 1 ) % poly.length ] ];
		const n = Math.max( 1, Math.round( Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) / CHIP.step ) );
		for ( let k = 0; k < n; k ++ ) out.push( [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * k / n, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * k / n, k === 0 ? i : - 1 ] );

	}

	return out;

}

// Triangles (positions and uvs, flat lists) of the recess: from the outline on the face, a broken
// edge in two steps (in and down a little at random, then further, wandering in and out along its
// length), and the floor, at about `depth` behind the face.
export function recess( plane, depth, rand ) {

	const rim = resample( plane.poly );
	const n = rim.length;
	// Inward (left of an anticlockwise outline) across each edge, and at each point the edges' mean.
	const edgeIn = rim.map( ( p, i ) => {

		const q = rim[ ( i + 1 ) % n ];
		const len = Math.hypot( q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] ) || 1;
		return [ - ( q[ 1 ] - p[ 1 ] ) / len, ( q[ 0 ] - p[ 0 ] ) / len ];

	} );
	const inward = rim.map( ( p, i ) => {

		const [ a, b ] = [ edgeIn[ ( i - 1 + n ) % n ], edgeIn[ i ] ];
		const d = [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ] ];
		const len = Math.hypot( ...d ) || 1;
		return [ d[ 0 ] / len, d[ 1 ] / len ];

	} );
	// Wandering in and out along the edge: random, smoothed over a few points.
	const wander = () => {

		const raw = rim.map( rand );
		return raw.map( ( _, i ) => ( raw[ ( i - 1 + n ) % n ] + 2 * raw[ i ] + raw[ ( i + 1 ) % n ] ) / 4 );

	};
	const [ w1, w2 ] = [ wander(), wander() ];
	const ring = ( inset, deep ) => rim.map( ( p, i ) => [ p[ 0 ] + inward[ i ][ 0 ] * inset( i ), p[ 1 ] + inward[ i ][ 1 ] * inset( i ), deep( i ) ] );
	const mid = ring( i => CHIP.inset * ( 0.2 + 0.9 * w1[ i ] ), i => depth * ( 0.25 + 0.4 * w2[ i ] ) );
	const inner = ring( i => CHIP.inset * ( 0.8 + 1.2 * w1[ i ] * w2[ i ] + 0.3 * rand() ), () => depth * ( 0.85 + 0.3 * rand() ) );
	const top = rim.map( p => [ p[ 0 ], p[ 1 ], 0 ] );

	const pos = [], uv = [];
	const add = ( s, t, d ) => {

		pos.push( ...toWorld( plane, s, t, d ).toArray() );
		uv.push( s * 2, t * 2 + d * 2 );

	};
	for ( const [ outer, under ] of [ [ top, mid ], [ mid, inner ] ] ) {

		for ( let i = 0; i < n; i ++ ) {

			const j = ( i + 1 ) % n;
			add( ...outer[ i ] ); add( ...outer[ j ] ); add( ...under[ j ] );
			add( ...outer[ i ] ); add( ...under[ j ] ); add( ...under[ i ] );

		}

	}

	const floor = inner.map( ( [ s, t ] ) => new Vector2( s, t ) );
	for ( const tri of ShapeUtils.triangulateShape( floor, [] ) ) for ( const k of tri ) add( ...inner[ k ] );
	return { pos, uv };

}

// Where a line across the outline is inside it: [ from, to ] pairs along the line. The line is
// `fixed` (0: s, 1: t) = value; the pairs are in the other coordinate.
function spans( poly, fixed, value ) {

	const free = 1 - fixed;
	const hits = [];
	for ( let i = 0; i < poly.length; i ++ ) {

		const [ a, b ] = [ poly[ i ], poly[ ( i + 1 ) % poly.length ] ];
		if ( ( a[ fixed ] > value ) === ( b[ fixed ] > value ) ) continue;
		hits.push( a[ free ] + ( b[ free ] - a[ free ] ) * ( value - a[ fixed ] ) / ( b[ fixed ] - a[ fixed ] ) );

	}

	hits.sort( ( a, b ) => a - b );
	const out = [];
	for ( let i = 0; i + 1 < hits.length; i += 2 ) out.push( [ hits[ i ], hits[ i + 1 ] ] );
	return out;

}

// The exposed rebar mat: bars along U (on lines of constant t) nearest the face, bars along V
// behind them, at CHIP.spacing on a grid that lines up across the face. Positions, normals, index.
export function rebar( plane ) {

	const pos = [], nor = [], idx = [];
	const r = CHIP.bar / 2;
	const bar = ( from, to ) => {

		const axis = new Vector3().subVectors( to, from ).normalize();
		const side = new Vector3().crossVectors( axis, plane.N ).normalize();
		const base = pos.length / 3;
		for ( let k = 0; k < CHIP.sides; k ++ ) {

			const angle = k / CHIP.sides * Math.PI * 2;
			const out = side.clone().multiplyScalar( Math.cos( angle ) ).addScaledVector( plane.N, Math.sin( angle ) );
			for ( const end of [ from, to ] ) {

				pos.push( ...end.clone().addScaledVector( out, r ).toArray() );
				nor.push( ...out.toArray() );

			}

		}

		for ( let k = 0; k < CHIP.sides; k ++ ) {

			const [ a, b ] = [ base + k * 2, base + ( ( k + 1 ) % CHIP.sides ) * 2 ];
			idx.push( a, b, a + 1, b, b + 1, a + 1 );

		}

	};

	const lines = ( fixed, depth ) => {

		const values = plane.poly.map( p => p[ fixed ] );
		for ( let k = Math.ceil( Math.min( ...values ) / CHIP.spacing ); k * CHIP.spacing < Math.max( ...values ); k ++ ) {

			const value = k * CHIP.spacing;
			for ( const [ a, b ] of spans( plane.poly, fixed, value ) ) {

				const at = v => fixed === 1 ? toWorld( plane, v, value, depth ) : toWorld( plane, value, v, depth );
				bar( at( a - CHIP.runOn ), at( b + CHIP.runOn ) );

			}

		}

	};
	lines( 1, CHIP.cover + r );
	lines( 0, CHIP.cover + CHIP.bar + r );
	return { pos, nor, idx };

}

// Strips on the face round the outline, outside it, a hair off the face toward where it was seen.
export function rim( plane ) {

	const pos = [], idx = [];
	const poly = plane.poly;
	for ( let i = 0; i < poly.length; i ++ ) {

		const [ a, b ] = [ poly[ i ], poly[ ( i + 1 ) % poly.length ] ];
		const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		if ( len < 1e-6 ) continue;
		// Outward: right of an anticlockwise outline.
		const out = [ ( b[ 1 ] - a[ 1 ] ) / len * RIM, - ( b[ 0 ] - a[ 0 ] ) / len * RIM ];
		const k = pos.length / 3;
		for ( const [ s, t ] of [ a, b, [ b[ 0 ] + out[ 0 ], b[ 1 ] + out[ 1 ] ], [ a[ 0 ] + out[ 0 ], a[ 1 ] + out[ 1 ] ] ] ) pos.push( ...toWorld( plane, s, t, - 0.003 ).toArray() );
		idx.push( k, k + 1, k + 2, k, k + 2, k + 3 );

	}

	return { pos, idx, normal: plane.N.toArray() };

}

// A flat patch's triangles (fill, and outline strips inside each edge), OFFSET off the face.
export function patch( m ) {

	const N = new Vector3( ...m.n ).normalize();
	const a = Math.abs( N.y ) < 0.9 ? new Vector3( 0, 1, 0 ) : new Vector3( 1, 0, 0 );
	const u = new Vector3().crossVectors( a, N ).normalize();
	const v = new Vector3().crossVectors( N, u );
	const P = m.pts.map( p => new Vector3( ...p ).addScaledVector( N, OFFSET ) );
	const flat = P.map( p => new Vector2( p.dot( u ), p.dot( v ) ) );
	if ( ShapeUtils.isClockWise( flat ) ) { P.reverse(); flat.reverse(); }
	const fill = { pos: P.flatMap( p => p.toArray() ), idx: ShapeUtils.triangulateShape( flat, [] ).flat() };
	const pos = [], idx = [];
	for ( let i = 0; i < P.length; i ++ ) {

		const [ p, q ] = [ P[ i ], P[ ( i + 1 ) % P.length ] ];
		const along = q.clone().sub( p );
		if ( along.lengthSq() < 1e-8 ) continue;
		const inward = new Vector3().crossVectors( N, along ).normalize().multiplyScalar( EDGE );
		const k = pos.length / 3;
		// A hair above the fill so it isn't hidden by it.
		for ( const corner of [ p, q, q.clone().add( inward ), p.clone().add( inward ) ] ) pos.push( ...corner.clone().addScaledVector( N, 0.002 ).toArray() );
		idx.push( k, k + 1, k + 2, k, k + 2, k + 3 );

	}

	return { fill, edge: { pos, idx }, normal: N.toArray() };

}

// ---------- The whole model's repair areas ----------

// Every area's geometry, and the layers they're cut out of with the chipped ones cut out.
// markups: area markups (kind 'area', three corners or more, a normal). layers: { key: { positions,
// index } } for each layer areas are cut out of. Returns { layers: { key: { positions, cut } },
// areas: [ { m, plane, parts } ] } (see areaParts).
export function buildRepairs( markups, layers ) {

	const triangles = Object.fromEntries( Object.entries( layers ).map( ( [ key, layer ] ) => [ key, trianglesOf( layer ) ] ) );
	const all = Object.values( triangles ).flat();
	const areas = markups.map( m => ( { m, ...areaParts( m, all ) } ) );
	const planes = areas.map( a => a.plane ).filter( Boolean );
	const cut = Object.fromEntries( Object.entries( triangles ).map( ( [ key, tris ] ) => [ key, cutOut( tris, planes ) ] ) );
	return { layers: cut, areas };

}

// One area's geometry, against the triangles of the layers areas are cut out of. For an area past
// marking, its plane (settled onto its face) and parts { recess, rim, rebar }, or { filled, rim }
// once it's shotcreted; for a marked one, no plane and parts { fill, edge, normal }.
export function areaParts( m, triangles ) {

	const look = LOOKS[ m.f?.status ];
	if ( ! look ) return { plane: null, parts: patch( m ) };
	const plane = choosePlane( m, triangles );
	settleOnFaces( [ plane ], triangles );
	if ( look.filled ) return { plane, parts: { filled: recess( plane, - PROUD, random( m.id ) ), rim: rim( plane ) } };
	const depth = m.f.depthMm > 0 ? m.f.depthMm / 1000 : CHIP.depth;
	return { plane, parts: { recess: recess( plane, depth, random( m.id ) ), rim: rim( plane ), rebar: rebar( plane ) } };

}

// What an area's node carries in its extras (the twin shows it, and finds areas by id).
export function areaExtras( m ) {

	const f = m.f ?? {};
	const extras = {
		id: m.id, zone: zoneName( m.zone ), face: m.face, grid: m.grid, area_m2: m.area, chipped: f.chipped ?? null,
		defect: f.type ?? null, depth: f.depth ?? null, status: f.status ?? null, notes: f.text ?? '', source: m.src ?? null,
		// Stays solid when the twin's "See-through models" makes the rest see-through.
		xraySolid: true,
	};
	if ( m.no ) extras.no = m.no;
	for ( const { date } of STAGES ) if ( date && date !== 'chipped' && f[ date ] ) extras[ date ] = f[ date ];
	return extras;

}
