// Adds a car from Sketchfab to World Drive's own garage in drive/public/cars/ (docs/world-drive.md),
// kept apart from the construction app's library: only World Drive's build publishes it.
//
//   npm run add-drive-car -- <sketchfab url | uid> --id dune-buggy --length 4.2 [--front=+z] \
//     [--max-texture 1024] [--simplify 0.5] [--lit] [--paint Body,Trim] [--rims Rim] [--part Car02] \
//     [--lamps TailLamp] [--file local.glb] [--credit "Decal by ..."]
//
// Like add-asset.mjs, which fills the construction app's library: only downloadable Sketchfab
// models under CC0 or CC Attribution, compressed (meshopt geometry, WebP textures no bigger than
// --max-texture) and credited in cars.json and CREDITS.md. Its picture for the ride picker is drawn
// afterwards, by drive-car-thumbs.mjs. Then made ready to drive:
//
// - Baked to its real size (--length along its front axis, which --front names), facing -Z, its
//   wheels on y = 0 and its middle over x = z = 0, with no transforms left in it.
// - Its wheels found by their shape, whatever they're called: a tyre is a separate piece standing on
//   the ground at a corner, about as long as it is tall; whatever else sits wholly inside its circle
//   (rim, hub, brake disc) goes with it. Each wheel becomes a node of its own at its axle (named
//   wheel-front-left and so on, with extras { wheel: { radius, steers } }), so it can spin about x
//   and the front ones steer about y; everything else is one node, body.
// - --part keeps only the node of that name and what's under it: one car from a pack of them.
// - --lit draws a model made unlit (KHR_materials_unlit) as lit paint, like the rest of the world.
// - --paint names the materials that are bodywork the Garage may repaint, and --rims those that
//   are rims (only inside the wheels): see paint.js. A textured model has none.
// - --lamps names the materials of lamps drawn as a real maker draws theirs (three bars a side, say,
//   which is that maker's mark): each side's become one plain lamp, the box round them.
//
// The model's description is printed: read it for anyone else to credit (--credit) and for extra
// conditions. Names, blurbs and handling are World Drive's own, in src/drive-app/cars.js.
//
// Sketchfab needs an API token (sketchfab.com > Settings > Password & API) in an environment
// variable named SKETCHFAB_API_TOKEN, SKETCHFAB_TOKEN or SKETCHFAB_API (any case).

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, metalRough, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SKETCHFAB_API = 'https://api.sketchfab.com/v3';
const USER_AGENT = 'neptune-digital-twin asset importer';
const CARS = new URL( '../drive/public/cars/', import.meta.url );
const CATALOG = new URL( 'cars.json', CARS );
const CREDITS = new URL( 'CREDITS.md', CARS );
const LICENSE_URLS = { cc0: 'https://creativecommons.org/publicdomain/zero/1.0/', by: 'https://creativecommons.org/licenses/by/4.0/' };
const FRONTS = { '-z': 0, '+z': Math.PI, '+x': Math.PI / 2, '-x': - Math.PI / 2 };
// Finding wheels, as shares of the car's height (and length): a tyre reaches down to within this
// of the ground, is between these tall, and is round from the side to within this; what's inside
// a tyre's circle, this much bigger, is part of its wheel.
const GROUND = 0.04;
const TYRE_HEIGHT = [ 0.15, 0.85 ];
const ROUND = 1.6;
const INSIDE = 1.08;

const { values: opts, positionals } = parseArgs( {
	allowPositionals: true,
	options: {
		id: { type: 'string' },
		length: { type: 'string' },
		front: { type: 'string', default: '-z' },
		'max-texture': { type: 'string', default: '1024' },
		simplify: { type: 'string' },
		lit: { type: 'boolean' },
		paint: { type: 'string' },
		rims: { type: 'string' },
		part: { type: 'string' },
		lamps: { type: 'string' },
		file: { type: 'string' },
		credit: { type: 'string' },
	},
} );

const uid = ( positionals[ 0 ] ?? '' ).match( /[0-9a-f]{32}/ )?.[ 0 ];
if ( ! uid || ! opts.id || ! opts.length ) fail( 'Usage: npm run add-drive-car -- <sketchfab url> --id <id> --length <metres> [--front=-z|+z|+x|-x]' );
if ( ! /^[a-z0-9-]+$/.test( opts.id ) ) fail( '--id may only contain lowercase letters, digits and dashes.' );
if ( ! ( opts.front in FRONTS ) ) fail( `--front must be one of ${ Object.keys( FRONTS ).join( ', ' ) } (the way the car's front points in the file).` );
const realLength = Number( opts.length );
if ( ! ( realLength > 0 ) ) fail( '--length must be the car\'s real length in metres.' );
const simplifyRatio = opts.simplify === undefined ? null : Number( opts.simplify );
if ( simplifyRatio !== null && ! ( simplifyRatio > 0 && simplifyRatio < 1 ) ) fail( '--simplify must be between 0 and 1 (the share of triangles to keep).' );
const maxTexture = Number( opts[ 'max-texture' ] );
const painted = new Set( opts.paint?.split( ',' ).map( name => name.trim() ) ?? [] );
const rims = new Set( opts.rims?.split( ',' ).map( name => name.trim() ) ?? [] );
const lamps = new Set( opts.lamps?.split( ',' ).map( name => name.trim() ) ?? [] );

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
	.registerExtensions( ALL_EXTENSIONS )
	.registerDependencies( { 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder } );

// 1. Check the licence and fetch the model.
const { doc, source, description } = await fromSketchfab( uid );
if ( opts.credit ) source.extraCredit = opts.credit;
if ( description?.trim() ) console.log( `Description of "${ source.title }" (check it for anyone else to credit, with --credit, and for extra conditions):\n${ description.trim() }\n` );
const root = doc.getRoot();
if ( root.listSkins().length ) fail( `"${ source.title }" is rigged: its wheels hang off bones, which this doesn't follow. Pick another model.` );

// 2. Tidy: older spec/gloss materials converted (three.js no longer reads them), copies merged,
// vertices welded (so a tyre is one piece), animations dropped (a car is driven, not played).
for ( const animation of root.listAnimations() ) animation.dispose();
const usesSpecGloss = root.listExtensionsUsed().some( e => e.extensionName === 'KHR_materials_pbrSpecularGlossiness' );
await doc.transform( ...( usesSpecGloss ? [ metalRough() ] : [] ), dedup(), prune(), weld() );
if ( opts.lit ) {

	for ( const material of root.listMaterials() ) {

		if ( ! material.getExtension( 'KHR_materials_unlit' ) ) continue;
		material.setExtension( 'KHR_materials_unlit', null ).setRoughnessFactor( 0.75 ).setMetallicFactor( 0 );

	}

}

// 3. Bake every part into the car's own frame: metres, front -Z, standing on y = 0, middle over
// x = z = 0. Parts are copied first, so a wheel drawn four times from one mesh becomes four.
const scene = root.getDefaultScene() ?? root.listScenes()[ 0 ];
let keep = scene;
if ( opts.part ) {

	keep = root.listNodes().find( node => node.getName() === opts.part );
	if ( ! keep ) fail( `There's no node called "${ opts.part }": it has ${ root.listNodes().map( node => node.getName() ).filter( Boolean ).slice( 0, 40 ).join( ', ' ) }.` );

}

const turn = FRONTS[ opts.front ];
const { min, max } = getBounds( keep );
const along = opts.front.endsWith( 'x' ) ? 0 : 2;
const scale = realLength / ( max[ along ] - min[ along ] );
const cos = Math.cos( turn ), sin = Math.sin( turn );
// Turned about y by `turn`, scaled, then moved; column-major, as glTF has it.
const rotate = [ cos, 0, - sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1 ];
const centre = [ ( min[ 0 ] + max[ 0 ] ) / 2, min[ 1 ], ( min[ 2 ] + max[ 2 ] ) / 2 ];
const moved = rotateVector( centre );
const place = rotate.map( ( v, i ) => i < 12 ? v * scale : v );
place[ 12 ] = - moved[ 0 ] * scale;
place[ 13 ] = - moved[ 1 ] * scale;
place[ 14 ] = - moved[ 2 ] * scale;
const parts = [];
keep.traverse( node => {

	const mesh = node.getMesh();
	if ( ! mesh ) return;
	const copy = doc.createMesh();
	for ( const prim of mesh.listPrimitives() ) copy.addPrimitive( prim.clone() );
	transformMesh( copy, multiply( place, node.getWorldMatrix() ) );
	parts.push( ...copy.listPrimitives().map( prim => ( { prim, mesh: copy } ) ) );

} );

function rotateVector( [ x, y, z ] ) {

	return [ cos * x + sin * z, y, - sin * x + cos * z ];

}

// Lamps that are a real maker's mark made plain (--lamps), before the wheels are looked for, as
// what's made of the model from here on is made of its pieces.
const buffer = root.listBuffers()[ 0 ] ?? doc.createBuffer();
const plain = parts.filter( ( { prim } ) => lamps.has( prim.getMaterial()?.getName() ) );
if ( lamps.size && ! plain.length ) fail( `No part is made of ${ [ ...lamps ].join( ' or ' ) }: it has ${ root.listMaterials().map( material => material.getName() ).join( ', ' ) }.` );
for ( const { prim } of plain ) plainLamps( prim );

// 4. Find the wheels.
const pieces = parts.flatMap( ( { prim } ) => piecesOf( prim ) );
const all = boxOf( pieces.map( piece => piece.box ) );
const size = [ all.max[ 0 ] - all.min[ 0 ], all.max[ 1 ] - all.min[ 1 ], all.max[ 2 ] - all.min[ 2 ] ];
const tyres = pieces.filter( ( { box } ) => {

	const tall = box.max[ 1 ] - box.min[ 1 ];
	const long = box.max[ 2 ] - box.min[ 2 ];
	const middle = ( box.min[ 0 ] + box.max[ 0 ] ) / 2;
	return box.min[ 1 ] < all.min[ 1 ] + size[ 1 ] * GROUND && tall > size[ 1 ] * TYRE_HEIGHT[ 0 ] && tall < size[ 1 ] * TYRE_HEIGHT[ 1 ] &&
		long / tall < ROUND && tall / long < ROUND && Math.abs( middle ) > size[ 0 ] * 0.15 && long < size[ 2 ] * 0.4;

} );
// One wheel for each tyre (or tyres side by side: a dually's, or one drawn as two pieces).
const wheels = [];
for ( const tyre of tyres.sort( ( a, b ) => volume( b.box ) - volume( a.box ) ) ) {

	const wheel = wheels.find( w => Math.sign( w.at[ 0 ] ) === Math.sign( tyre.box.min[ 0 ] + tyre.box.max[ 0 ] ) && Math.abs( w.at[ 2 ] - ( tyre.box.min[ 2 ] + tyre.box.max[ 2 ] ) / 2 ) < w.radius );
	if ( wheel ) {

		wheel.box = boxOf( [ wheel.box, tyre.box ] );
		continue;

	}

	const radius = Math.max( tyre.box.max[ 1 ] - tyre.box.min[ 1 ], tyre.box.max[ 2 ] - tyre.box.min[ 2 ] ) / 2;
	wheels.push( { box: tyre.box, radius, at: [ ( tyre.box.min[ 0 ] + tyre.box.max[ 0 ] ) / 2, ( tyre.box.min[ 1 ] + tyre.box.max[ 1 ] ) / 2, ( tyre.box.min[ 2 ] + tyre.box.max[ 2 ] ) / 2 ] } );

}

if ( wheels.length < 4 || wheels.length % 2 ) fail( `Found ${ wheels.length } wheels (${ JSON.stringify( wheels.map( w => w.at.map( round ) ) ) }): a car needs pairs of them, at least four.` );
// Whatever lies wholly within a wheel's circle (and no further in or out than its tyre, give or
// take half its width) turns with it.
for ( const wheel of wheels ) {

	wheel.at[ 0 ] = ( wheel.box.min[ 0 ] + wheel.box.max[ 0 ] ) / 2;
	const reach = wheel.radius * INSIDE;
	const width = wheel.box.max[ 0 ] - wheel.box.min[ 0 ];
	wheel.pieces = pieces.filter( ( { box } ) => box.min[ 1 ] >= wheel.at[ 1 ] - reach && box.max[ 1 ] <= wheel.at[ 1 ] + reach &&
		box.min[ 2 ] >= wheel.at[ 2 ] - reach && box.max[ 2 ] <= wheel.at[ 2 ] + reach &&
		box.min[ 0 ] >= wheel.box.min[ 0 ] - width / 2 && box.max[ 0 ] <= wheel.box.max[ 0 ] + width / 2 );
	for ( const piece of wheel.pieces ) piece.wheel = wheel;

}

// Axles front to back (front is -Z), a wheel each side: the front one steers.
const axles = [];
for ( const wheel of [ ...wheels ].sort( ( a, b ) => a.at[ 2 ] - b.at[ 2 ] ) ) {

	const last = axles.at( - 1 );
	if ( last && wheel.at[ 2 ] - last[ 0 ].at[ 2 ] < wheel.radius ) last.push( wheel );
	else axles.push( [ wheel ] );

}

if ( axles.some( axle => axle.length !== 2 || Math.sign( axle[ 0 ].at[ 0 ] ) === Math.sign( axle[ 1 ].at[ 0 ] ) ) ) fail( `The wheels don't pair up into axles: ${ JSON.stringify( axles.map( axle => axle.map( w => w.at.map( round ) ) ) ) }.` );
axles.forEach( ( axle, i ) => {

	for ( const wheel of axle ) {

		wheel.steers = i === 0;
		wheel.name = `wheel-${ i === 0 ? 'front' : i === axles.length - 1 ? 'rear' : `middle-${ i }` }-${ wheel.at[ 0 ] < 0 ? 'left' : 'right' }`;

	}

} );

// 5. Rebuild the scene as body and wheels, the wheels' geometry about their axles.
const carNode = doc.createNode( opts.id );
const bodyMesh = doc.createMesh( 'body' );
carNode.addChild( doc.createNode( 'body' ).setMesh( bodyMesh ) );
const rimMaterials = new Map();
for ( const wheel of wheels ) {

	wheel.mesh = doc.createMesh( wheel.name );
	carNode.addChild( doc.createNode( wheel.name ).setMesh( wheel.mesh ).setTranslation( wheel.at ).setExtras( { wheel: { radius: round( wheel.radius ), steers: wheel.steers } } ) );

}

for ( const { prim } of parts ) {

	const mine = pieces.filter( piece => piece.prim === prim );
	const body = mine.filter( piece => ! piece.wheel ).flatMap( piece => piece.triangles );
	if ( body.length ) bodyMesh.addPrimitive( subset( prim, body, [ 0, 0, 0 ] ) );
	for ( const wheel of wheels ) {

		const triangles = mine.filter( piece => piece.wheel === wheel ).flatMap( piece => piece.triangles );
		if ( ! triangles.length ) continue;
		const part = subset( prim, triangles, wheel.at );
		const material = prim.getMaterial();
		if ( material && rims.has( material.getName() ) ) {

			if ( ! rimMaterials.has( material ) ) rimMaterials.set( material, material.clone().setName( `${ material.getName() } (rim)` ).setExtras( { paint: 'rim' } ) );
			part.setMaterial( rimMaterials.get( material ) );

		}

		wheel.mesh.addPrimitive( part );

	}

}

for ( const material of root.listMaterials() ) if ( painted.has( material.getName() ) ) material.setExtras( { paint: 'body' } );
for ( const node of scene.listChildren() ) node.dispose();
for ( const mesh of new Set( parts.map( part => part.mesh ) ) ) mesh.dispose();
scene.addChild( carNode );

// 6. Compress.
await doc.transform(
	prune(),
	...( simplifyRatio ? [ simplify( { simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.002 } ) ] : [] ),
	textureCompress( { encoder: sharp, targetFormat: 'webp', resize: [ maxTexture, maxTexture ] } ),
	meshopt( { encoder: MeshoptEncoder, level: 'medium' } ),
);
const output = await io.writeBinary( doc );
await mkdir( new URL( 'thumbs/', CARS ), { recursive: true } );
await writeFile( new URL( `${ opts.id }.glb`, CARS ), output );

// 7. Its entry in cars.json and the credits.
const triangles = root.listMeshes().reduce( ( sum, mesh ) => sum + mesh.listPrimitives().reduce( ( s, p ) => s + Math.round( ( p.getIndices()?.getCount() ?? p.getAttribute( 'POSITION' ).getCount() ) / 3 ), 0 ), 0 );
const entry = {
	id: opts.id,
	file: `${ opts.id }.glb`,
	thumb: `thumbs/${ opts.id }.webp`,
	dimensions: { length: round( size[ 2 ] ), width: round( size[ 0 ] ), height: round( size[ 1 ] ) },
	wheels: wheels.map( w => ( { name: w.name, at: w.at.map( round ), radius: round( w.radius ), steers: w.steers } ) ),
	paintable: painted.size > 0,
	// One car out of a set of them (--part).
	...( opts.part ? { part: opts.part } : {} ),
	// Its lamps made plain (--lamps), which the credits say.
	...( plain.length ? { plainLamps: true } : {} ),
	triangles,
	sizeKB: Math.round( output.byteLength / 1024 ),
	source,
};
const catalog = JSON.parse( await readFile( CATALOG, 'utf8' ).catch( () => '[]' ) );
const updated = [ ...catalog.filter( car => car.id !== entry.id ), entry ].sort( ( a, b ) => a.id.localeCompare( b.id ) );
await writeFile( CATALOG, JSON.stringify( updated, null, '\t' ) + '\n' );
await writeFile( CREDITS, credits( updated ) );

console.log( `Added drive/public/cars/${ entry.file } (${ entry.sizeKB } KB, ${ triangles } triangles, ${ entry.dimensions.length } x ${ entry.dimensions.width } x ${ entry.dimensions.height } m) ` +
	`with ${ wheels.length } wheels: ${ wheels.map( w => `${ w.name } (r ${ round( w.radius ) } m, ${ w.pieces.length } pieces)` ).join( ', ' ) }.` );
console.log( `Now draw its picture (node scripts/drive-car-thumbs.mjs ${ opts.id }) and look at it in World Drive's Garage: if it faces the wrong way, run again with another --front.` );

// --- finding wheels ----------------------------------------------------------------------------

// The separate pieces of a primitive: triangles joined by sharing a corner (by where it is, so a
// seam in the UVs or normals doesn't split a piece), with each piece's box.
function piecesOf( prim ) {

	const position = prim.getAttribute( 'POSITION' );
	const indices = prim.getIndices();
	const count = position.getCount();
	const corner = indices ? i => indices.getScalar( i ) : i => i;
	const parent = new Int32Array( count ).map( ( v, i ) => i );
	const find = i => {

		while ( parent[ i ] !== i ) i = parent[ i ] = parent[ parent[ i ] ];
		return i;

	};
	const join = ( a, b ) => {

		a = find( a );
		b = find( b );
		if ( a !== b ) parent[ b ] = a;

	};
	const same = new Map();
	const v = [];
	for ( let i = 0; i < count; i ++ ) {

		position.getElement( i, v );
		const key = v.map( x => Math.round( x * 1e4 ) ).join( ',' );
		if ( same.has( key ) ) join( same.get( key ), i );
		else same.set( key, i );

	}

	const triangleCount = ( indices ? indices.getCount() : count ) / 3;
	for ( let t = 0; t < triangleCount; t ++ ) {

		join( corner( t * 3 ), corner( t * 3 + 1 ) );
		join( corner( t * 3 ), corner( t * 3 + 2 ) );

	}

	const byRoot = new Map();
	for ( let t = 0; t < triangleCount; t ++ ) {

		const key = find( corner( t * 3 ) );
		if ( ! byRoot.has( key ) ) byRoot.set( key, { prim, triangles: [], box: { min: [ Infinity, Infinity, Infinity ], max: [ - Infinity, - Infinity, - Infinity ] } } );
		const piece = byRoot.get( key );
		piece.triangles.push( t );
		for ( let k = 0; k < 3; k ++ ) {

			position.getElement( corner( t * 3 + k ), v );
			for ( let axis = 0; axis < 3; axis ++ ) {

				piece.box.min[ axis ] = Math.min( piece.box.min[ axis ], v[ axis ] );
				piece.box.max[ axis ] = Math.max( piece.box.max[ axis ], v[ axis ] );

			}

		}

	}

	return [ ...byRoot.values() ];

}

// `prim` (lamps, see --lamps) as one box on each side of the car's middle, round what was there:
// positions and normals only, all a plain lamp needs.
function plainLamps( prim ) {

	const position = prim.getAttribute( 'POSITION' );
	const sides = new Map();
	const v = [];
	for ( let i = 0; i < position.getCount(); i ++ ) {

		position.getElement( i, v );
		const side = v[ 0 ] < 0 ? 'left' : 'right';
		const box = sides.get( side ) ?? { min: [ ...v ], max: [ ...v ] };
		for ( let axis = 0; axis < 3; axis ++ ) {

			box.min[ axis ] = Math.min( box.min[ axis ], v[ axis ] );
			box.max[ axis ] = Math.max( box.max[ axis ], v[ axis ] );

		}

		sides.set( side, box );

	}

	const positions = [];
	const normals = [];
	const indices = [];
	for ( const { min, max } of sides.values() ) {

		// Each face: the four corners across the two other axes, which turn about this one the right
		// way round (y then z about x, z then x about y, x then y about z), so it faces out.
		for ( const [ axis, sign ] of [ [ 0, - 1 ], [ 0, 1 ], [ 1, - 1 ], [ 1, 1 ], [ 2, - 1 ], [ 2, 1 ] ] ) {

			const u = ( axis + 1 ) % 3;
			const w = ( axis + 2 ) % 3;
			const first = positions.length / 3;
			for ( const [ a, b ] of [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] ) {

				const corner = [];
				corner[ axis ] = sign < 0 ? min[ axis ] : max[ axis ];
				corner[ u ] = a ? max[ u ] : min[ u ];
				corner[ w ] = b ? max[ w ] : min[ w ];
				positions.push( ...corner );
				normals.push( ...[ 0, 1, 2 ].map( k => k === axis ? sign : 0 ) );

			}

			indices.push( ...( sign > 0 ? [ 0, 1, 2, 0, 2, 3 ] : [ 0, 2, 1, 0, 3, 2 ] ).map( i => first + i ) );

		}

	}

	for ( const semantic of prim.listSemantics() ) prim.setAttribute( semantic, null );
	prim.setAttribute( 'POSITION', doc.createAccessor().setType( 'VEC3' ).setBuffer( buffer ).setArray( new Float32Array( positions ) ) );
	prim.setAttribute( 'NORMAL', doc.createAccessor().setType( 'VEC3' ).setBuffer( buffer ).setArray( new Float32Array( normals ) ) );
	prim.setIndices( doc.createAccessor().setType( 'SCALAR' ).setBuffer( buffer ).setArray( new Uint16Array( indices ) ) );

}

// A new primitive of just these triangles of `prim`, its positions moved by -offset.
function subset( prim, triangles, offset ) {

	const indices = prim.getIndices();
	const corner = indices ? i => indices.getScalar( i ) : i => i;
	const remap = new Map();
	const order = [];
	const list = new Uint32Array( triangles.length * 3 );
	triangles.forEach( ( t, n ) => {

		for ( let k = 0; k < 3; k ++ ) {

			const vertex = corner( t * 3 + k );
			if ( ! remap.has( vertex ) ) {

				remap.set( vertex, order.length );
				order.push( vertex );

			}

			list[ n * 3 + k ] = remap.get( vertex );

		}

	} );
	const out = doc.createPrimitive().setMode( prim.getMode() ).setMaterial( prim.getMaterial() )
		.setIndices( doc.createAccessor().setType( 'SCALAR' ).setBuffer( buffer ).setArray( order.length < 65536 ? Uint16Array.from( list ) : list ) );
	for ( const semantic of prim.listSemantics() ) {

		const source = prim.getAttribute( semantic );
		const width = source.getElementSize();
		const from = source.getArray();
		const array = new from.constructor( order.length * width );
		order.forEach( ( vertex, n ) => array.set( from.subarray( vertex * width, vertex * width + width ), n * width ) );
		if ( semantic === 'POSITION' ) for ( let n = 0; n < order.length; n ++ ) for ( let axis = 0; axis < 3; axis ++ ) array[ n * 3 + axis ] -= offset[ axis ];
		out.setAttribute( semantic, doc.createAccessor().setType( source.getType() ).setBuffer( buffer ).setArray( array ).setNormalized( source.getNormalized() ) );

	}

	return out;

}

function boxOf( boxes ) {

	return {
		min: [ 0, 1, 2 ].map( axis => Math.min( ...boxes.map( box => box.min[ axis ] ) ) ),
		max: [ 0, 1, 2 ].map( axis => Math.max( ...boxes.map( box => box.max[ axis ] ) ) ),
	};

}

function volume( { min, max } ) {

	return ( max[ 0 ] - min[ 0 ] ) * ( max[ 1 ] - min[ 1 ] ) * ( max[ 2 ] - min[ 2 ] );

}

// a × b, 4 × 4, column-major.
function multiply( a, b ) {

	const out = new Array( 16 ).fill( 0 );
	for ( let col = 0; col < 4; col ++ ) for ( let row = 0; row < 4; row ++ ) for ( let k = 0; k < 4; k ++ ) out[ col * 4 + row ] += a[ k * 4 + row ] * b[ col * 4 + k ];
	return out;

}

function round( v ) {

	return Math.round( v * 100 ) / 100;

}

// --- the source ------------------------------------------------------------------------------

async function fromSketchfab( id ) {

	const token = Object.entries( process.env ).find( ( [ name ] ) => /^sketchfab_(api_token|token|api)$/i.test( name ) )?.[ 1 ];
	if ( ! token ) fail( 'Set your Sketchfab API token in SKETCHFAB_API_TOKEN.' );
	const headers = { Authorization: `Token ${ token }` };

	const model = await getJson( `${ SKETCHFAB_API }/models/${ id }`, headers );
	const license = model.license?.slug;
	if ( ! model.isDownloadable ) fail( `"${ model.name }" is not downloadable.` );
	if ( ! ( license in LICENSE_URLS ) ) fail( `"${ model.name }" is licensed ${ model.license?.label ?? 'unknown' }; only CC0 and CC Attribution models can go in the repository.` );

	let bytes;
	if ( opts.file ) {

		bytes = new Uint8Array( await readFile( opts.file ) );

	} else {

		const links = await getJson( `${ SKETCHFAB_API }/models/${ id }/download`, headers );
		if ( ! links.glb?.url ) fail( 'Sketchfab offers no GLB for this model.' );
		const res = await fetch( links.glb.url, { headers: { 'User-Agent': USER_AGENT } } );
		if ( ! res.ok ) fail( `Download failed: HTTP ${ res.status }` );
		bytes = new Uint8Array( await res.arrayBuffer() );

	}

	return {
		doc: await io.readBinary( bytes ),
		description: model.description,
		source: {
			site: 'Sketchfab',
			id,
			url: model.viewerUrl,
			title: model.name,
			author: model.user?.displayName || model.user?.username,
			authorUrl: model.user?.profileUrl,
			license: model.license.label,
			licenseUrl: LICENSE_URLS[ license ],
		},
	};

}

function credits( list ) {

	const lines = list.map( car => `- \`${ car.file }\`: ${ car.part ? 'one car from ' : '' }"[${ car.source.title }](${ car.source.url })" by ` +
		`${ car.source.authorUrl ? `[${ car.source.author }](${ car.source.authorUrl })` : car.source.author } on ${ car.source.site }, ` +
		`licensed [${ car.source.license }](${ car.source.licenseUrl }).${ car.source.extraCredit ? ` ${ car.source.extraCredit }.` : '' } ` +
		`Compressed, rescaled${ car.plainLamps ? ', its lamps made plain' : '' } and its wheels made separate parts for World Drive.` );
	return '# World Drive cars: credits\n\nThese models come from Sketchfab under the licences listed, and are published with World Drive ' +
		'only (not the construction app\'s library). Keep this file with them; World Drive also credits each in its About box and ' +
		`its ride picker. The rides built in code (src/kart.js, src/drive-app/rides/) are part of this project.\n\n${ lines.join( '\n' ) }\n`;

}

async function getJson( url, headers = {} ) {

	const res = await fetch( url, { headers: { 'User-Agent': USER_AGENT, ...headers } } );
	const body = await res.json().catch( () => ( {} ) );
	if ( ! res.ok ) fail( `${ new URL( url ).host } ${ res.status }: ${ body.detail ?? body.error ?? JSON.stringify( body ) }` );
	return body;

}

function fail( message ) {

	console.error( message );
	process.exit( 1 );

}
