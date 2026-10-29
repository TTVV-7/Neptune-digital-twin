// Shrinks glTF/GLB models so they load quickly in the browser.
//
//   npm run optimize-models                   every .glb/.gltf in models-src/ -> public/models/
//   npm run optimize-models -- big.glb        just that file (any path)
//
// Options (after the --):
//   --texture-size 4096   largest texture side in pixels (default 2048)
//   --keep-parts          keep named parts separate, e.g. for clicking on equipment later (bigger, slower)
//   --no-simplify         keep every triangle
//   --force               redo files that are already up to date
//
// It runs gltf-transform's `optimize`: meshopt geometry compression, WebP textures,
// merged meshes and materials, and a light simplification that keeps the shape to
// within 0.01% of the model's size. The original stays untouched in models-src/.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const SRC_DIR = join( ROOT, 'models-src' );
const OUT_DIR = join( ROOT, 'public', 'models' );
const GITHUB_LIMIT_MB = 100;
const CONVERT_FIRST = /\.(fbx|obj|dae|blend|skp|rvt|ifc|dwg|3ds|stl|ply|usdz?|e57|las|laz)$/i;

const args = process.argv.slice( 2 );
const flag = name => args.includes( name );
const sizeIndex = args.indexOf( '--texture-size' );
const textureSize = sizeIndex === - 1 ? '2048' : args[ sizeIndex + 1 ];
const named = args.filter( ( a, i ) => ! a.startsWith( '--' ) && ( sizeIndex === - 1 || i !== sizeIndex + 1 ) );

const inputs = named.length ? named.map( f => resolve( f ) ) : listSourceFiles();
if ( inputs.length === 0 ) {

	console.log( `Nothing to do. Put .glb or .gltf files in ${ relative( ROOT, SRC_DIR ) }/ and run this again.` );
	process.exit( 0 );

}

const cli = join( ROOT, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js' );
mkdirSync( OUT_DIR, { recursive: true } );

const results = [];
for ( const input of inputs ) {

	if ( ! existsSync( input ) ) {

		console.error( `Not found: ${ input }` );
		process.exitCode = 1;
		continue;

	}

	if ( CONVERT_FIRST.test( input ) ) {

		console.log( `Skipping ${ basename( input ) }: convert it to .glb first (see "Converting to .glb" in the README).` );
		continue;

	}

	const output = join( OUT_DIR, basename( input, extname( input ) ) + '.glb' );
	if ( ! flag( '--force' ) && existsSync( output ) && statSync( output ).mtimeMs > statSync( input ).mtimeMs ) {

		console.log( `Up to date: ${ relative( ROOT, output ) } (use --force to redo it)` );
		continue;

	}

	console.log( `\nOptimising ${ basename( input ) } (${ mb( statSync( input ).size ) } MB). Big files can take several minutes...` );
	const run = spawnSync( process.execPath, [
		cli, 'optimize', input, output,
		'--compress', 'meshopt',
		'--texture-compress', 'webp',
		'--texture-size', textureSize,
		'--simplify', String( ! flag( '--no-simplify' ) ),
		...( flag( '--keep-parts' ) ? [ '--flatten', 'false', '--join-named', 'false' ] : [] ),
	], { stdio: 'inherit' } );

	if ( run.status !== 0 ) {

		console.error( `Failed on ${ basename( input ) }. The messages above say why.` );
		process.exitCode = 1;
		continue;

	}

	results.push( { name: basename( output ), before: statSync( input ).size, after: statSync( output ).size } );

}

if ( results.length ) {

	console.log( '\nFile                                   Before      After   Smaller by' );
	for ( const { name, before, after } of results ) {

		const saved = Math.round( 100 * ( 1 - after / before ) );
		console.log( `${ name.padEnd( 34 ) } ${ mb( before ).padStart( 8 ) } MB ${ mb( after ).padStart( 7 ) } MB ${ String( saved ).padStart( 8 ) } %` );

	}

	const tooBig = results.filter( r => r.after / 1e6 > GITHUB_LIMIT_MB );
	if ( tooBig.length ) {

		console.log( `\n${ tooBig.map( r => r.name ).join( ', ' ) } is still over GitHub's ${ GITHUB_LIMIT_MB } MB file limit.` );
		console.log( 'See "Very large models" in the README for your options.' );

	}

	console.log( `\nOutput is in ${ relative( ROOT, OUT_DIR ) }/. Add each file to MODELS in src/config.js, e.g. url: 'models/${ results[ 0 ].name }'.` );

}

function listSourceFiles() {

	if ( ! existsSync( SRC_DIR ) ) return [];
	return readdirSync( SRC_DIR )
		.filter( f => /\.(glb|gltf)$/i.test( f ) || CONVERT_FIRST.test( f ) )
		.map( f => join( SRC_DIR, f ) );

}

function mb( bytes ) {

	return ( bytes / 1e6 ).toFixed( 1 );

}
