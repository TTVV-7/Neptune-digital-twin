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
// when it was chipped. Other areas are a flat patch OFFSET off their face, with an outline.

import polygonClipping from 'polygon-clipping';
import { ShapeUtils, Vector2, Vector3 } from 'three';

export const CHIPPED = 'Chipped / hydro-demo';
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
export const areaName = m => `${ m.f?.type || 'Repair area' } · ${ zoneName( m.zone ) } ${ m.face ?? '' } · ${ ( m.area ?? 0 ).toFixed( 2 ) } m²`;

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

// Each chipped area's plane moved onto the face it was marked on, where that's a little off
// (marked on a drawing's plane rather than the model's face, say).
export function settleOnFaces( planes, triangles ) {

	for ( const plane of planes ) {

		if ( triangles.some( tri => onFace( tri, plane, ON_FACE ) ) ) continue;
		const near = triangles.filter( tri => onFace( tri, plane, NEAR_FACE ) ).map( tri => plane.N.dot( tri.a ) - plane.h ).sort( ( a, b ) => Math.abs( a ) - Math.abs( b ) );
		if ( near.length ) {

			plane.h += near[ 0 ];
			plane.moved = near[ 0 ];

		} else plane.loose = true;

	}

}

// A layer's triangles with the chipped areas on them cut out, as a flat list of positions.
export function cutOut( triangles, planes ) {

	const out = [];
	let cut = 0;
	for ( const tri of triangles ) {

		const on = planes.filter( plane => onFace( tri, plane, ON_FACE ) );
		if ( on.length === 0 ) {

			out.push( ...tri.a.toArray(), ...tri.b.toArray(), ...tri.c.toArray() );
			continue;

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

			}

		}

		cut ++;

	}

	return { positions: new Float32Array( out ), cut };

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

// One area's geometry, against the triangles of the layers areas are cut out of: for a chipped
// area its plane (settled onto its face) and parts { recess, rim, rebar }; for another, no plane
// and parts { fill, edge, normal }.
export function areaParts( m, triangles ) {

	if ( m.f?.status !== CHIPPED ) return { plane: null, parts: patch( m ) };
	const plane = choosePlane( m, triangles );
	settleOnFaces( [ plane ], triangles );
	const depth = m.f.depthMm > 0 ? m.f.depthMm / 1000 : CHIP.depth;
	return { plane, parts: { recess: recess( plane, depth, random( m.id ) ), rim: rim( plane ), rebar: rebar( plane ) } };

}

// What an area's node carries in its extras (the twin shows it, and finds areas by id).
export function areaExtras( m ) {

	const f = m.f ?? {};
	return {
		id: m.id, zone: zoneName( m.zone ), face: m.face, grid: m.grid, area_m2: m.area, chipped: f.chipped ?? null,
		defect: f.type ?? null, depth: f.depth ?? null, status: f.status ?? null, notes: f.text ?? '', source: m.src ?? null,
		// Stays solid when the twin's "See-through models" makes the rest see-through.
		xraySolid: true,
	};

}
