// Builds public/models/b2d2-repair.glb: Dumper 2's below-grade structure (C31 gallery, transfer
// pit, C32 tunnel, steel plates at grade), the dumper building and conveyors to line it up with,
// and the repair areas marked up in the "B2D2 Repair Model" artifact on claude.ai, for the twin to
// load from MODELS in src/config.js.
//
//   node scripts/b2d2-repair-model.mjs [--site model] [--markups markups.json|dir] [--out file.glb]
//
// --site      the site model: source-models/b2d2-site-model.glb (the default), or the artifact's
//             published site.json (glTF with the buffer embedded); the same model either way.
// --markups   the artifact's "markups" collection: a snapshot like scripts/data/b2d2-markups.json
//             ({ markups: [ { id, ...doc } ] }), a plain array of docs, or a folder of one JSON file
//             per doc named by its id (what reading the collection to files gives). A folder is
//             written back as the snapshot, so it's kept with the repository.
//             Default: scripts/data/b2d2-markups.json.
//
// The artifact's frame is x = C31 numeric grid (m), y = Hatch-style elevation (m), z = minus the
// letter grid (AA = 0, AJ = -8; C32 runs toward -z). The model is moved so its origin is the middle
// of C31 (grid 34.5, halfway between AA and AJ) at grade (ground slab top, y 5.1 in that frame):
// with `recenter: false` and `up: null` the twin sets grade on Google's ground, and the gallery,
// pit and tunnel go below it. Heading 0 points C31's grid numbers (0 toward 69) east.
//
// Areas chipped or hydro-demolished (status "Chipped / hydro-demo") are drawn as they are on site:
// the area is cut out of the wall, floor or soffit it was marked on, and in its place is a recess
// of rough, fresh concrete (CHIP.depth deep, the edge stepping in irregularly) with the rebar mat
// exposed in it: bars both ways at CHIP.spacing, CHIP.cover behind the face, running on into the
// concrete past the edge. The roughness is random but seeded by the markup's id, so a rebuild
// comes out the same. Other areas are a flat cyan patch 3 cm off their face (toward where they were
// marked from), unlit so they read underground, with a darker outline. Every area's node carries
// its markup in `extras` (grid, face, area, defect, status, notes).

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import polygonClipping from 'polygon-clipping';
import sharp from 'sharp';
import { ShapeUtils, Vector2, Vector3 } from 'three';

const ROOT = new URL( '../', import.meta.url );
const { values: opts } = parseArgs( { options: {
	site: { type: 'string', default: new URL( 'source-models/b2d2-site-model.glb', ROOT ).pathname },
	markups: { type: 'string', default: new URL( 'scripts/data/b2d2-markups.json', ROOT ).pathname },
	out: { type: 'string', default: new URL( 'public/models/b2d2-repair.glb', ROOT ).pathname },
} } );

// Artifact frame -> model frame: subtract this point.
const ORIGIN = [ 34.5, 5.1, - 4 ];
// The structure layers kept, by their names in the artifact's model. The dumper building is a
// see-through orange shell, for lining the model up against Google's copy of the building, and
// the conveyors, tent and temporary works are see-through too, so they don't flicker against
// Google's copy where they meet it. Ground level is left out: it would lie right on Google's
// ground and flicker against it. `cut`: chipped areas are cut out of it.
const STRUCTURE = {
	c31: { name: 'C31 gallery', color: '#b9c0c8', cut: true },
	pit: { name: 'Transfer pit', color: '#9fb0c2', cut: true },
	c32: { name: 'C32 tunnel', color: '#c9c4b8', cut: true },
	steel: { name: 'Steel plates at grade', color: '#c9cfd5', metal: true },
	building: { name: 'Dumper building (for lining up)', color: '#ff8a1f', alpha: 0.35 },
	equip: { name: 'Conveyors, tent & temporary works', color: '#7f8fa3', alpha: 0.6 },
};
// The names source-models/b2d2-site-model.glb gives the same layers.
const SOURCE_NAMES = {
	'C31 gallery': 'c31', 'Transfer pit': 'pit', 'C32 tunnel': 'c32', 'Steel plates at grade': 'steel',
	'Dumper building': 'building', 'Conveyors, tent & temporary works': 'equip', 'Ground level & rails': 'ground',
};
const AREA_COLOR = '#0e8fa8'; // the artifact's repair-area colour
const EDGE_COLOR = '#06414d';
const OFFSET = 0.03; // m off the face
const EDGE = 0.04; // outline width, m

const CHIPPED = 'Chipped / hydro-demo';
// A chipped area, in metres: how deep (a markup's measured depth wins), how far the edge steps in
// on its way down, how far apart the points along it are, and the rebar (15M bars, 300 mm both
// ways, 50 mm cover), which runs on this far into the concrete past the edge.
const CHIP = { depth: 0.1, inset: 0.03, step: 0.05, bar: 0.016, spacing: 0.3, cover: 0.05, runOn: 0.12, sides: 8 };
// A face an area was marked on: parallel to it and this close (m). Failing that, the nearest
// parallel face this close is taken as the one meant.
const ON_FACE = 0.03;
const NEAR_FACE = 0.25;

const srgbToLinear = c => c <= 0.04045 ? c / 12.92 : ( ( c + 0.055 ) / 1.055 ) ** 2.4;
const rgba = ( hex, a = 1 ) => [ 1, 3, 5 ].map( i => srgbToLinear( parseInt( hex.slice( i, i + 2 ), 16 ) / 255 ) ).concat( a );

// ---------- Markups ----------

async function readMarkups( path ) {

	if ( ( await stat( path ) ).isDirectory() ) {

		const files = ( await readdir( path ) ).filter( f => f.endsWith( '.json' ) ).sort();
		const markups = await Promise.all( files.map( async f => ( { id: f.slice( 0, - 5 ), ...JSON.parse( await readFile( join( path, f ), 'utf8' ) ) } ) ) );
		const snapshot = new URL( 'scripts/data/b2d2-markups.json', ROOT );
		const body = {
			source: 'B2D2 Repair Model artifact (https://claude.ai/artifact/KWrwNnAjGSySgoDRXgEcRa), collection "markups"',
			saved: new Date().toISOString().slice( 0, 10 ),
			markups,
		};
		await writeFile( snapshot, JSON.stringify( body, null, '\t' ) + '\n' );
		console.log( `Saved ${ markups.length } markups to ${ snapshot.pathname }` );
		return markups;

	}

	const json = JSON.parse( await readFile( path, 'utf8' ) );
	return Array.isArray( json ) ? json : json.markups;

}

const zoneName = z => ( { c31: 'C31 gallery', c32: 'C32 tunnel', pit: 'Transfer pit', ground: 'Ground level' } )[ z ] ?? 'Site';

// A markup's face as a plane, in the artifact's frame: N out of the concrete toward where it was
// marked from, U and V across it (U level on walls, along x on floors and soffits, so bars line
// up from one area to the next on the same face), h its offset along N, and the outline in (s, t)
// = (along U, along V), anticlockwise.
function planeOf( m, N ) {

	const U = Math.abs( N.y ) < 0.75
		? new Vector3().crossVectors( new Vector3( 0, 1, 0 ), N ).normalize()
		: new Vector3( 1, 0, 0 ).addScaledVector( N, - N.x ).normalize();
	const V = new Vector3().crossVectors( N, U );
	const plane = { N, U, V, h: N.dot( new Vector3( ...m.pts[ 0 ] ) ) };
	plane.poly = m.pts.map( p => toPlane( plane, p ) );
	if ( ShapeUtils.isClockWise( plane.poly.map( ( [ s, t ] ) => new Vector2( s, t ) ) ) ) plane.poly.reverse();
	return plane;

}

// The plane of the outline's own corners where that lies on a face of the structure, else the
// plane through its first corner square to its saved normal, with the outline laid onto it: some
// were saved with a rounded normal (straight up on C32's sloping floor), one with its corners
// tilted off the face it was marked on (the pit floor).
function choosePlane( m, triangles ) {

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
function outlineNormal( m ) {

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

const toPlane = ( { U, V }, p ) => {

	const v = Array.isArray( p ) ? new Vector3( ...p ) : p;
	return [ v.dot( U ), v.dot( V ) ];

};
// depth: behind the face, into the concrete.
const toWorld = ( { U, V, N, h }, s, t, depth = 0 ) => new Vector3().addScaledVector( U, s ).addScaledVector( V, t ).addScaledVector( N, h - depth );

// The same random numbers for the same markup every time (mulberry32, seeded by its id).
function random( seed ) {

	let a = [ ...String( seed ) ].reduce( ( h, c ) => Math.imul( h ^ c.charCodeAt( 0 ), 2654435761 ), 1779033703 ) >>> 0;
	return () => {

		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

// ---------- The structure, with chipped areas cut out ----------

const triNormal = ( a, b, c ) => new Vector3().subVectors( b, a ).cross( new Vector3().subVectors( c, a ) ).normalize();

// Per layer: { positions (artifact frame, three per vertex), index }.
async function readSite( io, path ) {

	const doc = path.endsWith( '.json' )
		? await io.readJSON( { json: JSON.parse( await readFile( path, 'utf8' ) ), resources: {} } )
		: await io.read( path );
	const layers = {};
	for ( const mesh of doc.getRoot().listMeshes() ) {

		const key = SOURCE_NAMES[ mesh.getName() ] ?? mesh.getName();
		const prim = mesh.listPrimitives()[ 0 ];
		layers[ key ] = { positions: Float32Array.from( prim.getAttribute( 'POSITION' ).getArray() ), index: Uint32Array.from( prim.getIndices().getArray() ) };

	}

	return layers;

}

// The triangles of a layer, each { a, b, c } (Vector3s).
function trianglesOf( { positions, index } ) {

	const at = i => new Vector3( positions[ i * 3 ], positions[ i * 3 + 1 ], positions[ i * 3 + 2 ] );
	const out = [];
	for ( let i = 0; i < index.length; i += 3 ) out.push( { a: at( index[ i ] ), b: at( index[ i + 1 ] ), c: at( index[ i + 2 ] ) } );
	return out;

}

// Whether a triangle lies in an area's plane (within `within`) and its box reaches the area.
function onFace( tri, plane, within ) {

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
function settleOnFaces( planes, triangles ) {

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
function cutOut( triangles, planes ) {

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
function recess( plane, depth, rand ) {

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
function rebar( plane ) {

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

// ---------- Textures for fresh, chipped concrete ----------

// A rough surface: value noise in a few octaves, tiling, with pits; and the normal map from it.
async function concreteTextures() {

	const size = 256;
	const rand = random( 'chipped concrete' );
	const octave = cells => {

		const grid = Array.from( { length: cells * cells }, rand );
		const at = ( i, j ) => grid[ ( ( j % cells ) + cells ) % cells * cells + ( ( i % cells ) + cells ) % cells ];
		return ( x, y ) => {

			const fx = x / size * cells, fy = y / size * cells;
			const i = Math.floor( fx ), j = Math.floor( fy );
			const u = fx - i, v = fy - j;
			const s = t => t * t * ( 3 - 2 * t );
			return ( at( i, j ) * ( 1 - s( u ) ) + at( i + 1, j ) * s( u ) ) * ( 1 - s( v ) ) + ( at( i, j + 1 ) * ( 1 - s( u ) ) + at( i + 1, j + 1 ) * s( u ) ) * s( v );

		};

	};
	const octaves = [ [ octave( 4 ), 0.45 ], [ octave( 16 ), 0.3 ], [ octave( 64 ), 0.25 ] ];
	const height = new Float32Array( size * size );
	for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) height[ y * size + x ] = octaves.reduce( ( h, [ f, w ] ) => h + f( x, y ) * w, 0 );
	// Pits where aggregate came away.
	for ( let p = 0; p < 140; p ++ ) {

		const cx = rand() * size, cy = rand() * size, r = 1.5 + rand() * 4;
		for ( let y = Math.floor( cy - r ); y <= cy + r; y ++ ) for ( let x = Math.floor( cx - r ); x <= cx + r; x ++ ) {

			const d = Math.hypot( x - cx, y - cy ) / r;
			if ( d < 1 ) height[ ( ( y + size ) % size ) * size + ( x + size ) % size ] -= 0.35 * ( 1 - d * d );

		}

	}

	const colour = Buffer.alloc( size * size * 4 );
	const normal = Buffer.alloc( size * size * 4 );
	const h = ( x, y ) => height[ ( ( y + size ) % size ) * size + ( x + size ) % size ];
	for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

		const k = ( y * size + x ) * 4;
		const v = h( x, y );
		// Grey-brown, darker in the hollows, with lighter flecks of broken aggregate.
		const fleck = rand() < 0.04 ? 30 : 0;
		const shade = 0.62 + 0.45 * ( v - 0.5 );
		colour[ k ] = Math.min( 255, 150 * shade + fleck );
		colour[ k + 1 ] = Math.min( 255, 143 * shade + fleck );
		colour[ k + 2 ] = Math.min( 255, 132 * shade + fleck );
		colour[ k + 3 ] = 255;
		const dx = ( h( x + 1, y ) - h( x - 1, y ) ) * 6, dy = ( h( x, y + 1 ) - h( x, y - 1 ) ) * 6;
		const len = Math.hypot( dx, dy, 1 );
		normal[ k ] = ( - dx / len * 0.5 + 0.5 ) * 255;
		normal[ k + 1 ] = ( dy / len * 0.5 + 0.5 ) * 255;
		normal[ k + 2 ] = ( 1 / len * 0.5 + 0.5 ) * 255;
		normal[ k + 3 ] = 255;

	}

	const jpeg = ( data, quality ) => sharp( data, { raw: { width: size, height: size, channels: 4 } } ).removeAlpha().jpeg( { quality } ).toBuffer();
	return { colour: await jpeg( colour, 82 ), normal: await jpeg( normal, 92 ) };

}

// ---------- Build ----------

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
	.registerExtensions( ALL_EXTENSIONS )
	.registerDependencies( { 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder } );

const markups = ( await readMarkups( opts.markups ) ).filter( m => m.kind === 'area' && m.pts?.length >= 3 && m.n );
const site = await readSite( io, opts.site );
const cutTriangles = Object.entries( STRUCTURE ).filter( ( [ key, layer ] ) => layer.cut && site[ key ] ).flatMap( ( [ key ] ) => trianglesOf( site[ key ] ) );
const chipped = new Map( markups.filter( m => m.f?.status === CHIPPED ).map( m => [ m, choosePlane( m, cutTriangles ) ] ) );
settleOnFaces( [ ...chipped.values() ], cutTriangles );

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene( 'B2D2 repair model' );
const structure = doc.createNode( 'Structure' );
scene.addChild( structure );
const shifted = positions => {

	const out = Float32Array.from( positions );
	for ( let i = 0; i < out.length; i += 3 ) for ( let k = 0; k < 3; k ++ ) out[ i + k ] -= ORIGIN[ k ];
	return out;

};
const accessor = ( type, array ) => doc.createAccessor().setType( type ).setArray( array ).setBuffer( buffer );

let holes = 0;
for ( const [ key, layer ] of Object.entries( STRUCTURE ) ) {

	if ( ! site[ key ] ) continue;
	const material = doc.createMaterial( layer.name )
		.setBaseColorFactor( rgba( layer.color, layer.alpha ?? 1 ) )
		.setMetallicFactor( layer.metal ? 0.8 : 0 )
		.setRoughnessFactor( layer.metal ? 0.35 : 0.9 )
		.setDoubleSided( true );
	if ( layer.alpha ) material.setAlphaMode( 'BLEND' );
	const prim = doc.createPrimitive().setMaterial( material );
	if ( layer.cut ) {

		const { positions, cut } = cutOut( trianglesOf( site[ key ] ), [ ...chipped.values() ] );
		holes += cut;
		prim.setAttribute( 'POSITION', accessor( 'VEC3', shifted( positions ) ) );

	} else {

		prim.setAttribute( 'POSITION', accessor( 'VEC3', shifted( site[ key ].positions ) ) ).setIndices( accessor( 'SCALAR', site[ key ].index ) );

	}

	structure.addChild( doc.createNode( layer.name ).setMesh( doc.createMesh( layer.name ).addPrimitive( prim ) ) );

}

const unlit = doc.createExtension( KHRMaterialsUnlit );
const flatMaterial = ( name, hex, alpha ) => {

	const m = doc.createMaterial( name ).setBaseColorFactor( rgba( hex, alpha ) ).setDoubleSided( true ).setExtension( 'KHR_materials_unlit', unlit.createUnlit() );
	if ( alpha < 1 ) m.setAlphaMode( 'BLEND' );
	return m;

};
const fillMat = flatMaterial( 'Repair area', AREA_COLOR, 0.7 );
const edgeMat = flatMaterial( 'Repair area outline', EDGE_COLOR, 1 );
const textures = await concreteTextures();
const chippedMat = doc.createMaterial( 'Chipped concrete' )
	.setBaseColorTexture( doc.createTexture( 'Chipped concrete' ).setImage( textures.colour ).setMimeType( 'image/jpeg' ) )
	.setNormalTexture( doc.createTexture( 'Chipped concrete normals' ).setImage( textures.normal ).setMimeType( 'image/jpeg' ) )
	.setNormalScale( 1.5 )
	.setMetallicFactor( 0 )
	.setRoughnessFactor( 0.95 )
	.setDoubleSided( true );
const rebarMat = doc.createMaterial( 'Exposed rebar' ).setBaseColorFactor( rgba( '#7c4a2d' ) ).setMetallicFactor( 0.5 ).setRoughnessFactor( 0.65 );

// A flat patch's triangles (fill, and outline strips inside each edge), 3 cm off the face.
function patch( m ) {

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

const flatPrim = ( { pos, idx }, normal, material ) => {

	const normals = new Float32Array( pos.length );
	for ( let i = 0; i < normals.length; i += 3 ) normals.set( normal, i );
	return doc.createPrimitive()
		.setAttribute( 'POSITION', accessor( 'VEC3', shifted( pos ) ) )
		.setAttribute( 'NORMAL', accessor( 'VEC3', normals ) )
		.setIndices( accessor( 'SCALAR', new Uint32Array( idx ) ) )
		.setMaterial( material );

};

// Triangles listed one by one, with their own flat normals.
const loosePrim = ( { pos, uv }, material ) => {

	const normals = new Float32Array( pos.length );
	for ( let i = 0; i < pos.length; i += 9 ) {

		const [ a, b, c ] = [ 0, 3, 6 ].map( k => new Vector3( pos[ i + k ], pos[ i + k + 1 ], pos[ i + k + 2 ] ) );
		const n = triNormal( a, b, c );
		for ( let k = 0; k < 9; k += 3 ) normals.set( n.toArray(), i + k );

	}

	return doc.createPrimitive()
		.setAttribute( 'POSITION', accessor( 'VEC3', shifted( pos ) ) )
		.setAttribute( 'NORMAL', accessor( 'VEC3', normals ) )
		.setAttribute( 'TEXCOORD_0', accessor( 'VEC2', new Float32Array( uv ) ) )
		.setMaterial( material );

};

const repairs = doc.createNode( 'Repair areas' );
scene.addChild( repairs );
let total = 0;
for ( const m of markups ) {

	const f = m.f ?? {};
	const name = `${ f.type || 'Repair area' } · ${ zoneName( m.zone ) } ${ m.face ?? '' } · ${ ( m.area ?? 0 ).toFixed( 2 ) } m²`;
	const mesh = doc.createMesh( name );
	const plane = chipped.get( m );
	if ( plane ) {

		const depth = f.depthMm > 0 ? f.depthMm / 1000 : CHIP.depth;
		const bars = rebar( plane );
		mesh.addPrimitive( loosePrim( recess( plane, depth, random( m.id ) ), chippedMat ) );
		if ( bars.idx.length ) {

			mesh.addPrimitive( doc.createPrimitive()
				.setAttribute( 'POSITION', accessor( 'VEC3', shifted( bars.pos ) ) )
				.setAttribute( 'NORMAL', accessor( 'VEC3', new Float32Array( bars.nor ) ) )
				.setIndices( accessor( 'SCALAR', new Uint32Array( bars.idx ) ) )
				.setMaterial( rebarMat ) );

		}

		if ( plane.laid ) console.log( `  ${ name }: its corners are off the face it was marked on; laid onto it` );
		if ( plane.moved ) console.log( `  ${ name }: onto its face ${ ( plane.moved * 1000 ).toFixed( 0 ) } mm away` );
		if ( plane.loose ) console.log( `  ${ name }: no face of the structure found under it; drawn where it was marked` );

	} else {

		const g = patch( m );
		mesh.addPrimitive( flatPrim( g.fill, g.normal, fillMat ) ).addPrimitive( flatPrim( g.edge, g.normal, edgeMat ) );

	}

	repairs.addChild( doc.createNode( name ).setMesh( mesh ).setExtras( {
		id: m.id, zone: zoneName( m.zone ), face: m.face, grid: m.grid, area_m2: m.area,
		defect: f.type ?? null, depth: f.depth ?? null, status: f.status ?? null, notes: f.text ?? '', source: m.src ?? null,
	} ) );
	total += m.area ?? 0;

}

// Compressed (the conveyors are most of it); the twin's loader has the meshopt decoder.
await doc.transform( meshopt( { encoder: MeshoptEncoder, level: 'medium' } ) );
await io.write( opts.out, doc );
const size = ( await stat( opts.out ) ).size;
console.log( `Wrote ${ opts.out }: ${ markups.length } repair areas (${ chipped.size } chipped, cut out of ${ holes } triangles), ${ total.toFixed( 2 ) } m², ${ ( size / 1024 ).toFixed( 0 ) } KB` );
