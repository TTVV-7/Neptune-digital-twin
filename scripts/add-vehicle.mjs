// Adds a vehicle from Sketchfab to the library in public/vehicles.
//
//   npm run add-vehicle -- <sketchfab url or uid> --id pickup --name "Pickup truck" \
//     --category truck --length 5.9 [--front +z] [--max-texture 1024] [--file local.glb]
//
// Only downloadable models under CC0 or CC Attribution are accepted, so they can live in the
// repository. The model is compressed (meshopt geometry, WebP textures), its real-world scale is
// worked out from --length, and its credit goes into vehicles.json and CREDITS.md.
//
// Needs a Sketchfab API token (sketchfab.com > Settings > Password & API) in an environment
// variable named SKETCHFAB_API_TOKEN, SKETCHFAB_TOKEN or SKETCHFAB_API (any case).

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const API = 'https://api.sketchfab.com/v3';
const LIBRARY = new URL( '../public/vehicles/', import.meta.url );
const CATALOG = new URL( 'vehicles.json', LIBRARY );
const CREDITS = new URL( 'CREDITS.md', LIBRARY );
const ALLOWED_LICENSES = { cc0: 'https://creativecommons.org/publicdomain/zero/1.0/', by: 'https://creativecommons.org/licenses/by/4.0/' };
const FRONTS = [ '+z', '-z', '+x', '-x' ];

const { values: opts, positionals } = parseArgs( {
	allowPositionals: true,
	options: {
		id: { type: 'string' },
		name: { type: 'string' },
		category: { type: 'string', default: 'vehicle' },
		length: { type: 'string' },
		front: { type: 'string', default: '+z' },
		'max-texture': { type: 'string', default: '1024' },
		file: { type: 'string' },
	},
} );

const uid = positionals[ 0 ]?.match( /[0-9a-f]{32}/ )?.[ 0 ];
if ( ! uid || ! opts.id || ! opts.length ) fail( 'Usage: npm run add-vehicle -- <sketchfab url or uid> --id <id> --length <metres> [--name ...] [--category ...] [--front +z|-z|+x|-x]' );
if ( ! /^[a-z0-9-]+$/.test( opts.id ) ) fail( '--id may only contain lowercase letters, digits and dashes.' );
if ( ! FRONTS.includes( opts.front ) ) fail( `--front must be one of ${ FRONTS.join( ', ' ) } (the axis the vehicle's front points along in the file).` );
const realLength = Number( opts.length );
if ( ! ( realLength > 0 ) ) fail( '--length must be the vehicle\'s real length in metres.' );

const token = Object.entries( process.env ).find( ( [ name ] ) => /^sketchfab_(api_token|token|api)$/i.test( name ) )?.[ 1 ];
if ( ! token ) fail( 'Set your Sketchfab API token in SKETCHFAB_API_TOKEN.' );
const headers = { Authorization: `Token ${ token }` };

// 1. Check the licence before downloading anything.
const model = await getJson( `${ API }/models/${ uid }` );
const license = model.license?.slug;
if ( ! model.isDownloadable ) fail( `"${ model.name }" is not downloadable.` );
if ( ! ( license in ALLOWED_LICENSES ) ) fail( `"${ model.name }" is licensed ${ model.license?.label ?? 'unknown' }; only CC0 and CC Attribution models can go in the repository.` );

// 2. Download the GLB (or use a copy already on disk).
let bytes;
if ( opts.file ) {

	bytes = new Uint8Array( await readFile( opts.file ) );

} else {

	const links = await getJson( `${ API }/models/${ uid }/download` );
	if ( ! links.glb?.url ) fail( 'Sketchfab offers no GLB for this model.' );
	const res = await fetch( links.glb.url );
	if ( ! res.ok ) fail( `Download failed: HTTP ${ res.status }` );
	bytes = new Uint8Array( await res.arrayBuffer() );

}

// 3. Compress.
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
	.registerExtensions( ALL_EXTENSIONS )
	.registerDependencies( { 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder } );
const doc = await io.readBinary( bytes );
const maxTexture = Number( opts[ 'max-texture' ] );
await doc.transform(
	dedup(),
	prune(),
	weld(),
	textureCompress( { encoder: sharp, targetFormat: 'webp', resize: [ maxTexture, maxTexture ] } ),
	meshopt( { encoder: MeshoptEncoder, level: 'medium' } ),
);
const output = await io.writeBinary( doc );
await writeFile( new URL( `${ opts.id }.glb`, LIBRARY ), output );

// 4. Work out real-world size. Length runs along the front axis.
const { min, max } = getBounds( doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[ 0 ] );
const size = [ max[ 0 ] - min[ 0 ], max[ 1 ] - min[ 1 ], max[ 2 ] - min[ 2 ] ];
const alongX = opts.front.endsWith( 'x' );
const scale = realLength / ( alongX ? size[ 0 ] : size[ 2 ] );
const round = v => Math.round( v * 100 ) / 100;
const triangles = doc.getRoot().listMeshes().reduce( ( sum, mesh ) => sum + mesh.listPrimitives().reduce( ( s, p ) => {

	const count = p.getIndices()?.getCount() ?? p.getAttribute( 'POSITION' )?.getCount() ?? 0;
	return s + Math.round( count / 3 );

}, 0 ), 0 );

const entry = {
	id: opts.id,
	name: opts.name ?? model.name,
	category: opts.category,
	file: `${ opts.id }.glb`,
	front: opts.front,
	scale: Number( scale.toPrecision( 6 ) ),
	dimensions: {
		length: round( ( alongX ? size[ 0 ] : size[ 2 ] ) * scale ),
		width: round( ( alongX ? size[ 2 ] : size[ 0 ] ) * scale ),
		height: round( size[ 1 ] * scale ),
	},
	triangles,
	sizeKB: Math.round( output.byteLength / 1024 ),
	source: {
		site: 'Sketchfab',
		uid,
		url: model.viewerUrl,
		title: model.name,
		author: model.user?.displayName || model.user?.username,
		authorUrl: model.user?.profileUrl,
		license: model.license.label,
		licenseUrl: ALLOWED_LICENSES[ license ],
	},
};

// 5. Record it in the catalog and the credits.
const catalog = JSON.parse( await readFile( CATALOG, 'utf8' ).catch( () => '[]' ) ).filter( v => v.id !== entry.id );
catalog.push( entry );
catalog.sort( ( a, b ) => a.category.localeCompare( b.category ) || a.name.localeCompare( b.name ) );
await writeFile( CATALOG, JSON.stringify( catalog, null, '\t' ) + '\n' );
await writeFile( CREDITS, credits( catalog ) );

console.log( `Added ${ entry.name } as public/vehicles/${ entry.file } (${ entry.sizeKB } KB, ${ triangles } triangles, ` +
	`${ entry.dimensions.length } x ${ entry.dimensions.width } x ${ entry.dimensions.height } m). ` +
	'Check it in the app (P > Vehicles); if it faces the wrong way, run again with a different --front.' );

function credits( list ) {

	const lines = list.map( v => `- **${ v.name }** (\`${ v.file }\`): "[${ v.source.title }](${ v.source.url })" by ` +
		`${ v.source.authorUrl ? `[${ v.source.author }](${ v.source.authorUrl })` : v.source.author }, ` +
		`licensed [${ v.source.license }](${ v.source.licenseUrl }). Compressed and rescaled for this project.` );
	return `# Vehicle model credits\n\nThese models come from Sketchfab under the licences listed. Keep this file with them.\n\n${ lines.join( '\n' ) }\n`;

}

async function getJson( url ) {

	const res = await fetch( url, { headers } );
	const body = await res.json().catch( () => ( {} ) );
	if ( ! res.ok ) fail( `Sketchfab API ${ res.status }: ${ body.detail ?? JSON.stringify( body ) }` );
	return body;

}

function fail( message ) {

	console.error( message );
	process.exit( 1 );

}
