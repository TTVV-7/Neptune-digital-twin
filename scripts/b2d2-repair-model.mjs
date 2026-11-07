// Builds public/models/b2d2-repair.glb: Dumper 2's below-grade structure (C31 gallery, transfer
// pit, C32 tunnel, steel plates at grade) with the repair areas marked up in the "B2D2 Repair
// Model" artifact on claude.ai, for the twin to load from MODELS in src/config.js.
//
//   node scripts/b2d2-repair-model.mjs [--site site.json] [--markups markups.json|dir] [--out file.glb]
//
// --site      the artifact's site model (its published site.json: glTF with the buffer embedded).
//             Without it, the structure is taken from the existing --out file and only the repair
//             areas are rebuilt, so new markups need only a fresh markups snapshot.
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
// Each repair area is a flat patch 3 cm off its face (toward where it was marked from), unlit so
// it reads underground, with a darker outline. Its node carries the markup in `extras` (grid,
// face, area, defect, status, notes).

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { ShapeUtils, Vector2, Vector3 } from 'three';

const ROOT = new URL( '../', import.meta.url );
const { values: opts } = parseArgs( { options: {
	site: { type: 'string' },
	markups: { type: 'string', default: new URL( 'scripts/data/b2d2-markups.json', ROOT ).pathname },
	out: { type: 'string', default: new URL( 'public/models/b2d2-repair.glb', ROOT ).pathname },
} } );

// Artifact frame -> model frame: subtract this point.
const ORIGIN = [ 34.5, 5.1, - 4 ];
// The structure layers kept. The dumper building is a see-through orange shell, for lining the
// model up against Google's copy of the building. Ground and the conveyors/tent are left out:
// Google's mesh already shows what's at grade, and a second copy would flicker against it.
const STRUCTURE = {
	c31: { name: 'C31 gallery', color: '#b9c0c8' },
	pit: { name: 'Transfer pit', color: '#9fb0c2' },
	c32: { name: 'C32 tunnel', color: '#c9c4b8' },
	steel: { name: 'Steel plates at grade', color: '#c9cfd5', metal: true },
	building: { name: 'Dumper building (for lining up)', color: '#ff8a1f', alpha: 0.35 },
};
const AREA_COLOR = '#0e8fa8'; // the artifact's repair-area colour
const EDGE_COLOR = '#06414d';
const OFFSET = 0.03; // m off the face
const EDGE = 0.04; // outline width, m

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

// A flat polygon's triangles, worked out in its own plane.
function planeBasis( n ) {

	const N = new Vector3( ...n ).normalize();
	const a = Math.abs( N.y ) < 0.9 ? new Vector3( 0, 1, 0 ) : new Vector3( 1, 0, 0 );
	const u = new Vector3().crossVectors( a, N ).normalize();
	const v = new Vector3().crossVectors( N, u );
	return { N, u, v };

}

function areaGeometry( m ) {

	const { N, u, v } = planeBasis( m.n );
	const P = m.pts.map( p => new Vector3( p[ 0 ] - ORIGIN[ 0 ], p[ 1 ] - ORIGIN[ 1 ], p[ 2 ] - ORIGIN[ 2 ] ).addScaledVector( N, OFFSET ) );
	const flat = P.map( p => new Vector2( p.dot( u ), p.dot( v ) ) );
	if ( ShapeUtils.isClockWise( flat ) ) { P.reverse(); flat.reverse(); }
	const fill = { pos: P.flatMap( p => p.toArray() ), idx: ShapeUtils.triangulateShape( flat, [] ).flat() };

	// Outline: a strip inside each edge, in the face's plane.
	const pos = [], idx = [];
	for ( let i = 0; i < P.length; i ++ ) {

		const a = P[ i ], b = P[ ( i + 1 ) % P.length ];
		const along = b.clone().sub( a );
		if ( along.lengthSq() < 1e-8 ) continue;
		const inward = new Vector3().crossVectors( N, along ).normalize().multiplyScalar( EDGE );
		const k = pos.length / 3;
		pos.push( ...a.toArray(), ...b.toArray(), ...b.clone().add( inward ).toArray(), ...a.clone().add( inward ).toArray() );
		idx.push( k, k + 1, k + 2, k, k + 2, k + 3 );

	}

	// Lift the outline a hair above the fill so it isn't hidden by it.
	for ( let i = 0; i < pos.length; i += 3 ) { pos[ i ] += N.x * 0.002; pos[ i + 1 ] += N.y * 0.002; pos[ i + 2 ] += N.z * 0.002; }
	return { fill, edge: { pos, idx }, normal: N.toArray() };

}

const zoneName = z => ( { c31: 'C31 gallery', c32: 'C32 tunnel', pit: 'Transfer pit', ground: 'Ground level' } )[ z ] ?? 'Site';

// ---------- Build ----------

const io = new NodeIO().registerExtensions( [ KHRMaterialsUnlit ] );
let doc;

if ( opts.site ) {

	const json = JSON.parse( await readFile( opts.site, 'utf8' ) );
	const src = await io.readJSON( { json, resources: {} } );

	doc = new Document();
	const buffer = doc.createBuffer();
	const scene = doc.createScene( 'B2D2 repair model' );
	const structure = doc.createNode( 'Structure' );
	scene.addChild( structure );

	for ( const mesh of src.getRoot().listMeshes() ) {

		const layer = STRUCTURE[ mesh.getName() ];
		if ( ! layer ) continue;
		const prim = mesh.listPrimitives()[ 0 ];
		const p = prim.getAttribute( 'POSITION' );
		const index = prim.getIndices();
		const pos = new Float32Array( p.getCount() * 3 );
		const el = [];
		for ( let i = 0; i < p.getCount(); i ++ ) {

			p.getElement( i, el );
			pos.set( [ el[ 0 ] - ORIGIN[ 0 ], el[ 1 ] - ORIGIN[ 1 ], el[ 2 ] - ORIGIN[ 2 ] ], i * 3 );

		}

		const material = doc.createMaterial( layer.name )
			.setBaseColorFactor( rgba( layer.color, layer.alpha ?? 1 ) )
			.setMetallicFactor( layer.metal ? 0.8 : 0 )
			.setRoughnessFactor( layer.metal ? 0.35 : 0.9 )
			.setDoubleSided( true );
		if ( layer.alpha ) material.setAlphaMode( 'BLEND' );
		const out = doc.createPrimitive()
			.setAttribute( 'POSITION', doc.createAccessor().setType( 'VEC3' ).setArray( pos ).setBuffer( buffer ) )
			.setIndices( doc.createAccessor().setType( 'SCALAR' ).setArray( new Uint32Array( index.getArray() ) ).setBuffer( buffer ) )
			.setMaterial( material );
		structure.addChild( doc.createNode( layer.name ).setMesh( doc.createMesh( layer.name ).addPrimitive( out ) ) );

	}

} else {

	doc = await io.read( opts.out );
	const old = doc.getRoot().listNodes().find( n => n.getName() === 'Repair areas' );
	if ( old ) {

		for ( const child of old.listChildren() ) child.dispose();
		old.dispose();

	}

	// Drops the old areas' meshes, materials and data along with them.
	await doc.transform( prune() );

}

const buffer = doc.getRoot().listBuffers()[ 0 ];
const unlit = doc.createExtension( KHRMaterialsUnlit );
const mat = ( name, hex, alpha ) => {

	const m = doc.createMaterial( name ).setBaseColorFactor( rgba( hex, alpha ) ).setDoubleSided( true ).setExtension( 'KHR_materials_unlit', unlit.createUnlit() );
	if ( alpha < 1 ) m.setAlphaMode( 'BLEND' );
	return m;

};
const fillMat = mat( 'Repair area', AREA_COLOR, 0.7 );
const edgeMat = mat( 'Repair area outline', EDGE_COLOR, 1 );

const markups = ( await readMarkups( opts.markups ) ).filter( m => m.kind === 'area' && m.pts?.length >= 3 && m.n );
const repairs = doc.createNode( 'Repair areas' );
doc.getRoot().listScenes()[ 0 ].addChild( repairs );

const prim = ( { pos, idx }, normal, material ) => {

	const normals = new Float32Array( pos.length );
	for ( let i = 0; i < normals.length; i += 3 ) normals.set( normal, i );
	return doc.createPrimitive()
		.setAttribute( 'POSITION', doc.createAccessor().setType( 'VEC3' ).setArray( new Float32Array( pos ) ).setBuffer( buffer ) )
		.setAttribute( 'NORMAL', doc.createAccessor().setType( 'VEC3' ).setArray( normals ).setBuffer( buffer ) )
		.setIndices( doc.createAccessor().setType( 'SCALAR' ).setArray( new Uint32Array( idx ) ).setBuffer( buffer ) )
		.setMaterial( material );

};

let total = 0;
for ( const m of markups ) {

	const g = areaGeometry( m );
	const f = m.f ?? {};
	const name = `${ f.type || 'Repair area' } · ${ zoneName( m.zone ) } ${ m.face ?? '' } · ${ ( m.area ?? 0 ).toFixed( 2 ) } m²`;
	const mesh = doc.createMesh( name ).addPrimitive( prim( g.fill, g.normal, fillMat ) ).addPrimitive( prim( g.edge, g.normal, edgeMat ) );
	repairs.addChild( doc.createNode( name ).setMesh( mesh ).setExtras( {
		id: m.id, zone: zoneName( m.zone ), face: m.face, grid: m.grid, area_m2: m.area,
		defect: f.type ?? null, depth: f.depth ?? null, status: f.status ?? null, notes: f.text ?? '', source: m.src ?? null,
	} ) );
	total += m.area ?? 0;

}

await io.write( opts.out, doc );
const size = ( await stat( opts.out ) ).size;
console.log( `Wrote ${ opts.out }: ${ markups.length } repair areas, ${ total.toFixed( 2 ) } m², ${ ( size / 1024 ).toFixed( 0 ) } KB` );
