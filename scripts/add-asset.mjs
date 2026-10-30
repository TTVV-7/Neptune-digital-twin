// Adds a model from Sketchfab or Poly Haven to the asset library in public/library.
//
//   npm run add-asset -- <source> --id pickup --name "Pickup truck" --category Vehicles \
//     --length 5.9 [--front=+z] [--max-texture 1024] [--simplify 0.3] [--file local.glb]
//   (--scale 0.01 instead of --length when the factor from file units to metres is known)
//
// <source> is a Sketchfab model URL or uid, or a Poly Haven URL (https://polyhaven.com/a/<id>)
// or polyhaven:<id>. Only downloadable Sketchfab models under CC0 or CC Attribution are accepted,
// so they can live in the repository; Poly Haven is all CC0. The model is compressed (meshopt
// geometry, WebP textures), scaled from --length (the real length along its front axis), and
// recorded with a thumbnail and credit in library.json and CREDITS.md. --simplify keeps that
// fraction of the triangles, for detailed models that are too heavy for a browser.
//
// Sketchfab needs an API token (sketchfab.com > Settings > Password & API) in an environment
// variable named SKETCHFAB_API_TOKEN, SKETCHFAB_TOKEN or SKETCHFAB_API (any case).

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, metalRough, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SKETCHFAB_API = 'https://api.sketchfab.com/v3';
const POLYHAVEN_API = 'https://api.polyhaven.com';
const USER_AGENT = 'neptune-digital-twin asset importer';
const LIBRARY = new URL( '../public/library/', import.meta.url );
const CATALOG = new URL( 'library.json', LIBRARY );
const CREDITS = new URL( 'CREDITS.md', LIBRARY );
const LICENSE_URLS = { cc0: 'https://creativecommons.org/publicdomain/zero/1.0/', by: 'https://creativecommons.org/licenses/by/4.0/' };
const FRONTS = [ '+z', '-z', '+x', '-x' ];

const { values: opts, positionals } = parseArgs( {
	allowPositionals: true,
	options: {
		id: { type: 'string' },
		name: { type: 'string' },
		category: { type: 'string', default: 'Other' },
		length: { type: 'string' },
		scale: { type: 'string' },
		front: { type: 'string', default: '+z' },
		'max-texture': { type: 'string', default: '1024' },
		simplify: { type: 'string' },
		file: { type: 'string' },
	},
} );

const sourceArg = positionals[ 0 ] ?? '';
const polyhavenId = sourceArg.match( /^polyhaven:([\w-]+)$/ )?.[ 1 ] ?? sourceArg.match( /polyhaven\.com\/a\/([\w-]+)/ )?.[ 1 ];
const sketchfabUid = polyhavenId ? null : sourceArg.match( /[0-9a-f]{32}/ )?.[ 0 ];
if ( ( ! polyhavenId && ! sketchfabUid ) || ! opts.id || ( ! opts.length === ! opts.scale ) ) {

	fail( 'Usage: npm run add-asset -- <sketchfab url | polyhaven url> --id <id> (--length <metres> | --scale <factor>) [--name ...] [--category ...] [--front=+z|-z|+x|-x]' );

}

if ( ! /^[a-z0-9-]+$/.test( opts.id ) ) fail( '--id may only contain lowercase letters, digits and dashes.' );
if ( ! FRONTS.includes( opts.front ) ) fail( `--front must be one of ${ FRONTS.join( ', ' ) } (the axis the item's front points along in the file).` );
const realLength = opts.length === undefined ? null : Number( opts.length );
if ( realLength !== null && ! ( realLength > 0 ) ) fail( '--length must be the real length in metres along the front axis.' );
const fixedScale = opts.scale === undefined ? null : Number( opts.scale );
if ( fixedScale !== null && ! ( fixedScale > 0 ) ) fail( '--scale must be a positive factor from file units to metres.' );
const simplifyRatio = opts.simplify === undefined ? null : Number( opts.simplify );
if ( simplifyRatio !== null && ! ( simplifyRatio > 0 && simplifyRatio < 1 ) ) fail( '--simplify must be between 0 and 1 (the fraction of triangles to keep).' );

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
	.registerExtensions( ALL_EXTENSIONS )
	.registerDependencies( { 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder } );

// 1. Check the licence and fetch the model.
const { doc, source, thumbnailUrl } = polyhavenId ? await fromPolyHaven( polyhavenId ) : await fromSketchfab( sketchfabUid );

// 1b. Measure before compressing: quantised skinned meshes keep their positions in a scaled form
// that bounds can't see through.
const { min, max } = getBounds( doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[ 0 ] );
const size = [ max[ 0 ] - min[ 0 ], max[ 1 ] - min[ 1 ], max[ 2 ] - min[ 2 ] ];

// 2. Compress. Older spec/gloss materials are converted, since three.js no longer reads them.
const maxTexture = Number( opts[ 'max-texture' ] );
const usesSpecGloss = doc.getRoot().listExtensionsUsed().some( e => e.extensionName === 'KHR_materials_pbrSpecularGlossiness' );
await doc.transform(
	...( usesSpecGloss ? [ metalRough() ] : [] ),
	dedup(),
	prune(),
	weld(),
	...( simplifyRatio ? [ simplify( { simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.002 } ) ] : [] ),
	textureCompress( { encoder: sharp, targetFormat: 'webp', resize: [ maxTexture, maxTexture ] } ),
	meshopt( { encoder: MeshoptEncoder, level: 'medium' } ),
);
const output = await io.writeBinary( doc );
await writeFile( new URL( `${ opts.id }.glb`, LIBRARY ), output );

// 3. Thumbnail for the sidebar.
let thumb;
if ( thumbnailUrl ) {

	const res = await fetch( thumbnailUrl, { headers: { 'User-Agent': USER_AGENT } } );
	if ( res.ok ) {

		await mkdir( new URL( 'thumbs/', LIBRARY ), { recursive: true } );
		thumb = `thumbs/${ opts.id }.webp`;
		await sharp( Buffer.from( await res.arrayBuffer() ) ).resize( 256, 256, { fit: 'cover' } ).webp( { quality: 80 } ).toFile( new URL( thumb, LIBRARY ).pathname );

	}

}

// 4. Work out real-world size (measured in step 1b). Length runs along the front axis.
const alongX = opts.front.endsWith( 'x' );
const scale = fixedScale ?? realLength / ( alongX ? size[ 0 ] : size[ 2 ] );
const round = v => Math.round( v * 100 ) / 100;
const triangles = doc.getRoot().listMeshes().reduce( ( sum, mesh ) => sum + mesh.listPrimitives().reduce( ( s, p ) => {

	const count = p.getIndices()?.getCount() ?? p.getAttribute( 'POSITION' )?.getCount() ?? 0;
	return s + Math.round( count / 3 );

}, 0 ), 0 );

const entry = {
	id: opts.id,
	name: opts.name ?? source.title,
	category: opts.category,
	file: `${ opts.id }.glb`,
	thumb,
	front: opts.front,
	scale: Number( scale.toPrecision( 6 ) ),
	dimensions: {
		length: round( ( alongX ? size[ 0 ] : size[ 2 ] ) * scale ),
		width: round( ( alongX ? size[ 2 ] : size[ 0 ] ) * scale ),
		height: round( size[ 1 ] * scale ),
	},
	triangles,
	sizeKB: Math.round( output.byteLength / 1024 ),
	source,
};

// 5. Record it in the catalog and the credits.
const catalog = JSON.parse( await readFile( CATALOG, 'utf8' ).catch( () => '[]' ) ).filter( item => item.id !== entry.id );
catalog.push( entry );
catalog.sort( ( a, b ) => a.category.localeCompare( b.category ) || a.name.localeCompare( b.name ) );
await writeFile( CATALOG, JSON.stringify( catalog, null, '\t' ) + '\n' );
await writeFile( CREDITS, credits( catalog ) );

console.log( `Added ${ entry.name } as public/library/${ entry.file } (${ entry.sizeKB } KB, ${ triangles } triangles, ` +
	`${ entry.dimensions.length } x ${ entry.dimensions.width } x ${ entry.dimensions.height } m). ` +
	'Check it in the app (L opens the library); if it faces the wrong way, run again with a different --front.' );

async function fromSketchfab( uid ) {

	const token = Object.entries( process.env ).find( ( [ name ] ) => /^sketchfab_(api_token|token|api)$/i.test( name ) )?.[ 1 ];
	if ( ! token ) fail( 'Set your Sketchfab API token in SKETCHFAB_API_TOKEN.' );
	const headers = { Authorization: `Token ${ token }` };

	const model = await getJson( `${ SKETCHFAB_API }/models/${ uid }`, headers );
	const license = model.license?.slug;
	if ( ! model.isDownloadable ) fail( `"${ model.name }" is not downloadable.` );
	if ( ! ( license in LICENSE_URLS ) ) fail( `"${ model.name }" is licensed ${ model.license?.label ?? 'unknown' }; only CC0 and CC Attribution models can go in the repository.` );

	let bytes;
	if ( opts.file ) {

		bytes = new Uint8Array( await readFile( opts.file ) );

	} else {

		const links = await getJson( `${ SKETCHFAB_API }/models/${ uid }/download`, headers );
		if ( ! links.glb?.url ) fail( 'Sketchfab offers no GLB for this model.' );
		bytes = await download( links.glb.url );

	}

	const images = [ ...( model.thumbnails?.images ?? [] ) ].sort( ( a, b ) => a.width - b.width );
	return {
		doc: await io.readBinary( bytes ),
		thumbnailUrl: ( images.find( image => image.width >= 256 ) ?? images.at( - 1 ) )?.url,
		source: {
			site: 'Sketchfab',
			id: uid,
			url: model.viewerUrl,
			title: model.name,
			author: model.user?.displayName || model.user?.username,
			authorUrl: model.user?.profileUrl,
			license: model.license.label,
			licenseUrl: LICENSE_URLS[ license ],
		},
	};

}

async function fromPolyHaven( id ) {

	const info = await getJson( `${ POLYHAVEN_API }/info/${ id }` );
	const files = await getJson( `${ POLYHAVEN_API }/files/${ id }` );
	const resolution = [ '1k', '2k', '4k' ].find( r => files.gltf?.[ r ]?.gltf );
	if ( ! resolution ) fail( `Poly Haven offers no glTF for ${ id }.` );
	const gltf = files.gltf[ resolution ].gltf;

	// The glTF references its .bin and textures by relative path; mirror them in a temp folder.
	const dir = await mkdtemp( join( tmpdir(), 'polyhaven-' ) );
	try {

		const main = join( dir, `${ id }.gltf` );
		await writeFile( main, await download( gltf.url ) );
		for ( const [ path, file ] of Object.entries( gltf.include ?? {} ) ) {

			const target = join( dir, path );
			await mkdir( dirname( target ), { recursive: true } );
			await writeFile( target, await download( file.url ) );

		}

		return {
			doc: await io.read( main ),
			thumbnailUrl: `https://cdn.polyhaven.com/asset_img/thumbs/${ id }.png?width=256`,
			source: {
				site: 'Poly Haven',
				id,
				url: `https://polyhaven.com/a/${ id }`,
				title: info.name,
				author: Object.keys( info.authors ?? {} ).join( ', ' ) || 'Poly Haven',
				authorUrl: 'https://polyhaven.com',
				license: 'CC0',
				licenseUrl: LICENSE_URLS.cc0,
			},
		};

	} finally {

		await rm( dir, { recursive: true, force: true } );

	}

}

function credits( list ) {

	const lines = list.map( item => `- **${ item.name }** (\`${ item.file }\`): "[${ item.source.title }](${ item.source.url })" by ` +
		`${ item.source.authorUrl ? `[${ item.source.author }](${ item.source.authorUrl })` : item.source.author } on ${ item.source.site }, ` +
		`licensed [${ item.source.license }](${ item.source.licenseUrl }). Compressed and rescaled for this project.` );
	return '# Asset library credits\n\nThese models come from Sketchfab and Poly Haven under the licences listed. ' +
		`Keep this file with them. Items generated in code (src/procedural.js) are part of this project.\n\n${ lines.join( '\n' ) }\n`;

}

async function download( url ) {

	const res = await fetch( url, { headers: { 'User-Agent': USER_AGENT } } );
	if ( ! res.ok ) fail( `Download failed: HTTP ${ res.status }` );
	return new Uint8Array( await res.arrayBuffer() );

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
