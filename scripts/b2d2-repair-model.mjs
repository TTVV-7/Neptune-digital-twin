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
// How the areas are drawn (chipped ones cut out of their face, with a recess of fresh concrete and
// the rebar mat in it) is src/repair-geometry.js, which the twin's area editor runs too. Every
// area's node carries its markup in `extras` (id, grid, face, area, defect, status, notes), and
// xraySolid, so the twin's "Solid models" off leaves the areas solid while the concrete round them
// goes see-through. Next to the model goes its .json: the areas and the layers they're cut out of,
// for the editor (src/repair-areas.js) to rebuild them from where the admin moves them.

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { Vector3 } from 'three';
import { C32_LINE, correctStructure, PIT_INSIDE } from './b2d2-structure.mjs';
import { areaExtras, areaName, buildRepairs, CHIPPED, LOOKS, lookNames, random, rimOf, triNormal } from '../src/repair-geometry.js';

const ROOT = new URL( '../', import.meta.url );
const { values: opts } = parseArgs( { options: {
	site: { type: 'string', default: new URL( 'source-models/b2d2-site-model.glb', ROOT ).pathname },
	markups: { type: 'string', default: new URL( 'scripts/data/b2d2-markups.json', ROOT ).pathname },
	out: { type: 'string', default: new URL( 'public/models/b2d2-repair.glb', ROOT ).pathname },
} } );

const DATA = opts.out.replace( /\.glb$/, '' ) + '.json';

// Artifact frame -> model frame: subtract this point.
const ORIGIN = [ 34.5, 5.1, - 4 ];
// The structure layers kept, by their names in the artifact's model. The dumper building is a
// see-through orange shell, for lining the model up against Google's copy of the building, and
// the conveyors, tent and temporary works are see-through too, so they don't flicker against
// Google's copy where they meet it. Ground level is left out: it would lie right on Google's
// ground and flicker against it. `cut`: chipped areas are cut out of it. The see-through layers
// don't stop you walking or flying (node extras noCollide, which the twin reads), so the shell
// over C31 doesn't keep you out of it.
const STRUCTURE = {
	c31: { name: 'C31 gallery', color: '#b9c0c8', cut: true },
	pit: { name: 'Transfer pit', color: '#9fb0c2', cut: true },
	// Train support beams, G1 to G14, the cross and shed support beams, B1 to B6: a colour of
	// their own, to tell them from the slabs and walls.
	beams: { name: 'Beams', color: '#b08d5f', cut: true },
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

// Preset views, as the B2D2 Repair Model artifact has them (artifact frame: where the camera is and
// what it looks at). Saved in the model's scene extras, in the model's frame, for the twin's views
// bar (src/views.js); `underground`: Google's ground is cut away over the model for it.
const FL = z => - 6.82 + 0.241 * z;
const VIEWS = [
	{ name: 'Overview', from: [ 82, 42, 42 ], at: [ 30, - 1, - 16 ], underground: true },
	{ name: 'C31', from: [ 66, - 0.6, - 5 ], at: [ 30, - 0.8, - 5 ] },
	{ name: 'C32', from: [ C32_LINE, FL( 38 ) + 1.5, - 38 ], at: [ C32_LINE, FL( 16 ) + 1.2, - 16 ] },
	// From the pit's north-east corner, under the B1 slab, across to C32's mouth.
	{ name: 'Pit', from: [ PIT_INSIDE.x[ 1 ] - 0.4, - 3.0, - 0.7 ], at: [ 1.8, - 5.2, - 6 ] },
	{ name: 'Ground', from: [ 67.5, 7.0, - 4.95 ], at: [ 20, 5.3, - 4.95 ] },
	// Over the pit's lid, under the building's roof, looking down the gallery at its beams at grade,
	// with Google's ground cut away (it covers them otherwise).
	{ name: 'Beams', from: [ 5, 10, - 4.6 ], at: [ 21, 4.4, - 4.9 ], underground: true },
];


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

// ---------- The structure, with chipped areas cut out ----------

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
// The Shapr3D model's structure, put on the drawings' grid (scripts/b2d2-structure.mjs).
const site = correctStructure( await readSite( io, opts.site ) );
// The layers areas are cut out of, in the artifact's frame, uncut: the twin's area editor cuts
// them again where areas are moved to (src/repair-areas.js).
const cutLayers = Object.fromEntries( Object.entries( STRUCTURE ).filter( ( [ key, layer ] ) => layer.cut && site[ key ] ).map( ( [ key ] ) => [ key, site[ key ] ] ) );
const built = buildRepairs( markups, cutLayers );

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene( 'B2D2 repair model' ).setExtras( {
	views: VIEWS.map( ( { from, at, ...view } ) => ( { ...view, from: from.map( ( c, i ) => +( c - ORIGIN[ i ] ).toFixed( 3 ) ), at: at.map( ( c, i ) => +( c - ORIGIN[ i ] ).toFixed( 3 ) ) } ) ),
	// What the twin's area editor rebuilds the areas from, next to the model (see the end).
	repairs: basename( DATA ),
} );
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

		const { positions, cut } = built.layers[ key ];
		holes += cut;
		prim.setAttribute( 'POSITION', accessor( 'VEC3', shifted( positions ) ) );

	} else {

		prim.setAttribute( 'POSITION', accessor( 'VEC3', shifted( site[ key ].positions ) ) ).setIndices( accessor( 'SCALAR', site[ key ].index ) );

	}

	const node = doc.createNode( layer.name ).setMesh( doc.createMesh( layer.name ).addPrimitive( prim ) );
	if ( layer.alpha ) node.setExtras( { noCollide: true } );
	structure.addChild( node );

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
const colours = doc.createTexture( 'Chipped concrete' ).setImage( textures.colour ).setMimeType( 'image/jpeg' );
const normals = doc.createTexture( 'Chipped concrete normals' ).setImage( textures.normal ).setMimeType( 'image/jpeg' );
// The concrete and the bars of each stage (LOOKS in src/repair-geometry.js), made as they're needed.
const lookMats = new Map();
const lookMat = ( status, part ) => {

	const name = lookNames( status )[ part ];
	if ( ! lookMats.has( name ) ) {

		const look = LOOKS[ status ][ part ];
		const material = doc.createMaterial( name ).setBaseColorFactor( rgba( look.color ) ).setMetallicFactor( look.metalness ?? 0 ).setRoughnessFactor( look.roughness );
		if ( part === 'concrete' ) {

			if ( look.map ) material.setBaseColorTexture( colours );
			material.setNormalTexture( normals ).setNormalScale( 1.5 ).setDoubleSided( true );

		}

		lookMats.set( name, material );

	}

	return lookMats.get( name );

};
// The chipped look's first, as the model has always had them (ones not used are left out of the file).
lookMat( CHIPPED, 'concrete' );
lookMat( CHIPPED, 'rebar' );
// An area's rim on the face round it: a chipped one's coloured by when it was chipped as the
// progress drawings' legend has it (f.chipped, from scripts/b2d2-progress.mjs), the later stages'
// by the stage (rimOf).
const rimMats = new Map();
const rimMat = m => {

	const { name, colour } = rimOf( m );
	if ( ! rimMats.has( name ) ) rimMats.set( name, flatMaterial( name, colour, 1 ) );
	return rimMats.get( name );

};

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
for ( const { m, plane, parts } of built.areas ) {

	const name = areaName( m );
	const mesh = doc.createMesh( name );
	if ( plane ) {

		const status = m.f.status;
		mesh.addPrimitive( loosePrim( parts.filled ?? parts.recess, lookMat( status, 'concrete' ) ) );
		mesh.addPrimitive( flatPrim( parts.rim, parts.rim.normal, rimMat( m ) ) );
		if ( parts.rebar?.idx.length ) {

			mesh.addPrimitive( doc.createPrimitive()
				.setAttribute( 'POSITION', accessor( 'VEC3', shifted( parts.rebar.pos ) ) )
				.setAttribute( 'NORMAL', accessor( 'VEC3', new Float32Array( parts.rebar.nor ) ) )
				.setIndices( accessor( 'SCALAR', new Uint32Array( parts.rebar.idx ) ) )
				.setMaterial( lookMat( status, 'rebar' ) ) );

		}

		if ( plane.laid ) console.log( `  ${ name }: its corners are off the face it was marked on; laid onto it` );
		if ( plane.moved ) console.log( `  ${ name }: onto its face ${ ( plane.moved * 1000 ).toFixed( 0 ) } mm away` );
		if ( plane.loose ) console.log( `  ${ name }: no face of the structure found under it; drawn where it was marked` );

	} else {

		mesh.addPrimitive( flatPrim( parts.fill, parts.normal, fillMat ) ).addPrimitive( flatPrim( parts.edge, parts.normal, edgeMat ) );

	}

	repairs.addChild( doc.createNode( name ).setMesh( mesh ).setExtras( areaExtras( m ) ) );
	total += m.area ?? 0;

}

// Compressed (the conveyors are most of it); the twin's loader has the meshopt decoder.
await doc.transform( meshopt( { encoder: MeshoptEncoder, level: 'medium' } ) );
await io.write( opts.out, doc );

// For the twin's area editor (src/repair-areas.js), which rebuilds the areas the admin moves with
// the same code (src/repair-geometry.js): the areas as marked, the layers they're cut out of
// (uncut), and where the model's origin is, all in the artifact's frame.
await writeFile( DATA, JSON.stringify( {
	origin: ORIGIN,
	layers: Object.fromEntries( Object.entries( cutLayers ).map( ( [ key, { positions, index } ] ) => [ key, { name: STRUCTURE[ key ].name, positions: Array.from( positions ), index: Array.from( index ) } ] ) ),
	markups: markups.map( ( { id, n, pts, area, face, zone, grid, f, src } ) => ( { id, n, pts, area, face, zone, grid, f, src } ) ),
} ) + '\n' );
const size = ( await stat( opts.out ) ).size;
console.log( `Wrote ${ opts.out }: ${ markups.length } repair areas (${ built.areas.filter( a => a.plane ).length } chipped, cut out of ${ holes } triangles), ${ total.toFixed( 2 ) } m², ${ ( size / 1024 ).toFixed( 0 ) } KB` );
