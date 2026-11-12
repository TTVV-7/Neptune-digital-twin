// Adds a model of our own (a GLB built in CAD, already at real size in metres) to the asset
// library in public/library. For someone else's model from Sketchfab or Poly Haven, use
// `npm run add-asset` instead, which checks the licence and records the credit.
//
//   npm run add-own-asset -- model.glb --id steel-stair --name "Industrial steel stair (12 ft)" \
//     --category "Access & scaffolding" [--front=+x] [--simplify 0.3] [--row-length 3.05] \
//     [--from "Weave-Trial: construction_site/Industrial_Steel_Stair_12ft.glb"] [--thumb picture.png]
//
// A STEP file goes through scripts/step-to-glb.py first.
//
// CAD exports arrive as thousands of tiny meshes (one per face) in bare metal, which is slow to
// draw and comes out black here, where nothing is reflected. So the meshes are joined into one per
// colour and painted (not metal), the model is stood on the ground, and the file is compressed.
// --front is the axis its front points along (+z, -z, +x or -x; negative ones with an equals sign);
// length is measured along it. --simplify keeps that fraction of the triangles. --row-length is how
// far apart a row places them, in metres, when that isn't the model's full length (fence panels
// share a foot). --from notes where the model came from, for whoever updates it next.
//
// The card's picture is drawn from the model itself, as the built-in pieces' are, with Playwright's
// Chromium (npm i -D playwright && npx playwright install chromium); --thumb uses a picture instead.
// Running it again for the same id replaces the entry and keeps what was added to it by hand.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = new URL( '../', import.meta.url );
const LIBRARY = new URL( 'public/library/', ROOT );
const CATALOG = new URL( 'library.json', LIBRARY );
const FRONTS = [ '+z', '-z', '+x', '-x' ];
const THUMB_SIZE = 256;

const { values: opts, positionals } = parseArgs( {
	allowPositionals: true,
	options: {
		id: { type: 'string' },
		name: { type: 'string' },
		category: { type: 'string', default: 'Other' },
		front: { type: 'string', default: '+z' },
		simplify: { type: 'string' },
		'row-length': { type: 'string' },
		from: { type: 'string' },
		thumb: { type: 'string' },
	},
} );

const file = positionals[ 0 ];
if ( ! file || ! opts.id || ! opts.name ) fail( 'Usage: npm run add-own-asset -- <model.glb> --id <id> --name <name> [--category ...] [--front=+z|-z|+x|-x] [--simplify 0.3]' );
if ( ! /^[a-z0-9-]+$/.test( opts.id ) ) fail( '--id may only contain lowercase letters, digits and dashes.' );
if ( ! FRONTS.includes( opts.front ) ) fail( `--front must be one of ${ FRONTS.join( ', ' ) } (the axis the item's front points along in the file).` );
const simplifyRatio = opts.simplify === undefined ? null : Number( opts.simplify );
if ( simplifyRatio !== null && ! ( simplifyRatio > 0 && simplifyRatio < 1 ) ) fail( '--simplify must be between 0 and 1 (the fraction of triangles to keep).' );
const rowLength = opts[ 'row-length' ] === undefined ? null : Number( opts[ 'row-length' ] );
if ( rowLength !== null && ! ( rowLength > 0 ) ) fail( '--row-length must be a length in metres.' );

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
	.registerExtensions( ALL_EXTENSIONS )
	.registerDependencies( { 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder } );

const doc = await io.read( file );
doc.setLogger( new Logger( Logger.Verbosity.WARN ) );
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[ 0 ];
if ( root.listSkins().length > 0 ) fail( 'This model is rigged; add-own-asset only takes rigid models.' );

// 1. Paint instead of bare metal: with nothing to reflect, a fully metallic surface draws black.
for ( const material of root.listMaterials() ) {

	if ( material.getMetallicRoughnessTexture() ) continue;
	material.setMetallicFactor( 0 ).setRoughnessFactor( Math.min( material.getRoughnessFactor(), 0.75 ) );

}

// 2. One mesh per colour instead of one per face, then lighter and compressed.
await doc.transform(
	dedup(),
	flatten(),
	join(),
	weld(),
	...( simplifyRatio ? [ simplify( { simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.001 } ) ] : [] ),
	prune(),
);

// 3. Stand it on the ground: outrigger pads and the like can dip a little below zero in CAD.
let { min, max } = getBounds( scene );
if ( Math.abs( min[ 1 ] ) > 0.001 ) {

	for ( const node of scene.listChildren() ) {

		const t = node.getTranslation();
		node.setTranslation( [ t[ 0 ], t[ 1 ] - min[ 1 ], t[ 2 ] ] );

	}

	( { min, max } = getBounds( scene ) );

}

const size = [ max[ 0 ] - min[ 0 ], max[ 1 ] - min[ 1 ], max[ 2 ] - min[ 2 ] ];
if ( Math.max( ...size ) > 200 ) fail( `This model is ${ Math.round( Math.max( ...size ) ) } units long: is it in millimetres? It must be in metres.` );

await doc.transform( meshopt( { encoder: MeshoptEncoder, level: 'medium' } ) );
const output = await io.writeBinary( doc );
await writeFile( new URL( `${ opts.id }.glb`, LIBRARY ), output );

// 4. The card's picture.
await mkdir( new URL( 'thumbs/', LIBRARY ), { recursive: true } );
const thumb = `thumbs/${ opts.id }.webp`;
const picture = opts.thumb
	? sharp( await readFile( opts.thumb ) ).resize( THUMB_SIZE, THUMB_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } )
	: sharp( await render( output, opts.front ) );
await picture.webp( { quality: 85 } ).toFile( new URL( thumb, LIBRARY ).pathname );

// 5. Record it in the catalog. It has no `source`, which is what marks someone else's model that
// needs a credit; fields added to an earlier entry by hand (a machine's drive tuning) stay.
const alongX = opts.front.endsWith( 'x' );
const round = v => Math.round( v * 100 ) / 100;
const triangles = root.listMeshes().reduce( ( sum, mesh ) => sum + mesh.listPrimitives().reduce( ( s, p ) =>
	s + Math.round( ( p.getIndices()?.getCount() ?? p.getAttribute( 'POSITION' )?.getCount() ?? 0 ) / 3 ), 0 ), 0 );
const entry = {
	id: opts.id,
	name: opts.name,
	category: opts.category,
	file: `${ opts.id }.glb`,
	thumb,
	front: opts.front,
	scale: 1,
	dimensions: {
		length: round( alongX ? size[ 0 ] : size[ 2 ] ),
		width: round( alongX ? size[ 2 ] : size[ 0 ] ),
		height: round( size[ 1 ] ),
	},
	triangles,
	sizeKB: Math.round( output.byteLength / 1024 ),
	...( rowLength ? { rowLength } : {} ),
	own: opts.from ?? true,
};

const catalog = JSON.parse( await readFile( CATALOG, 'utf8' ).catch( () => '[]' ) );
const previous = catalog.find( item => item.id === entry.id );
if ( previous?.source ) fail( `"${ entry.id }" is already in the library as a downloaded model (${ previous.source.title }); pick another id.` );
const updated = [ ...catalog.filter( item => item.id !== entry.id ), { ...previous, ...entry } ];
updated.sort( ( a, b ) => a.category.localeCompare( b.category ) || a.name.localeCompare( b.name ) );
await writeFile( CATALOG, JSON.stringify( updated, null, '\t' ) + '\n' );

console.log( `Added ${ entry.name } as public/library/${ entry.file } (${ entry.sizeKB } KB, ${ triangles } triangles, ` +
	`${ root.listMeshes().length } meshes, ${ entry.dimensions.length } x ${ entry.dimensions.width } x ${ entry.dimensions.height } m).` );

// Draws the model as the sidebar draws the built-in pieces (sidebar.js): a three-quarter view from
// the front-left, slightly above, on a clear background. Needs a browser for WebGL, and a small
// local server so the page can import three.js from node_modules.
async function render( glb, front ) {

	const require = createRequire( import.meta.url );
	let chromium;
	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		fail( 'Drawing the card\'s picture needs Playwright (npm i -D playwright && npx playwright install chromium), or give one with --thumb.' );

	}

	const page = `<!doctype html><canvas id="c" width="${ THUMB_SIZE }" height="${ THUMB_SIZE }"></canvas>
<script type="importmap">{ "imports": { "three": "/node_modules/three/build/three.module.js", "three/addons/": "/node_modules/three/examples/jsm/" } }</script>
<script type="module">
import { Box3, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
try {
	const renderer = new WebGLRenderer( { canvas: document.getElementById( 'c' ), antialias: true, alpha: true, preserveDrawingBuffer: true } );
	const scene = new Scene();
	scene.add( new HemisphereLight( 0xffffff, 0x667066, 2 ) );
	const sun = new DirectionalLight( 0xffffff, 2 );
	sun.position.set( - 3, 5, - 4 );
	scene.add( sun );
	const object = ( await new GLTFLoader().setMeshoptDecoder( MeshoptDecoder ).loadAsync( '/model.glb' ) ).scene;
	// Front to -Z, as library.js's frontToYaw turns it when it is placed.
	object.rotation.y = { '-z': 0, '+z': Math.PI, '+x': Math.PI / 2, '-x': - Math.PI / 2 }[ ${ JSON.stringify( front ) } ];
	scene.add( object );
	const box = new Box3().setFromObject( object );
	const centre = box.getCenter( new Vector3() );
	const radius = box.getSize( new Vector3() ).length() / 2;
	const camera = new PerspectiveCamera( 30, 1, radius / 100, radius * 10 );
	camera.position.copy( centre ).add( new Vector3( - 0.6, 0.45, - 0.75 ).normalize().multiplyScalar( radius / Math.sin( camera.fov * Math.PI / 360 ) * 1.05 ) );
	camera.lookAt( centre );
	renderer.render( scene, camera );
	window.done = renderer.domElement.toDataURL( 'image/png' );
} catch ( error ) {
	window.failed = String( error );
}
</script>`;

	const server = createServer( async ( req, res ) => {

		const path = new URL( req.url, 'http://localhost' ).pathname;
		try {

			if ( path === '/' ) res.setHeader( 'Content-Type', 'text/html' ).end( page );
			else if ( path === '/model.glb' ) res.setHeader( 'Content-Type', 'model/gltf-binary' ).end( glb );
			else if ( path.startsWith( '/node_modules/three/' ) && ! path.includes( '..' ) ) res.setHeader( 'Content-Type', 'text/javascript' ).end( await readFile( new URL( path.slice( 1 ), ROOT ) ) );
			else res.writeHead( 404 ).end();

		} catch {

			res.writeHead( 404 ).end();

		}

	} );
	await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );
	// Software WebGL, so it draws the same on a machine with no graphics card.
	const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
	try {

		const tab = await browser.newPage();
		await tab.goto( `http://127.0.0.1:${ server.address().port }/` );
		await tab.waitForFunction( () => window.done || window.failed, null, { timeout: 60000 } );
		const failed = await tab.evaluate( () => window.failed );
		if ( failed ) fail( `Could not draw the card's picture: ${ failed }` );
		return Buffer.from( ( await tab.evaluate( () => window.done ) ).split( ',' )[ 1 ], 'base64' );

	} finally {

		await browser.close();
		server.close();

	}

}

function fail( message ) {

	console.error( message );
	process.exit( 1 );

}
