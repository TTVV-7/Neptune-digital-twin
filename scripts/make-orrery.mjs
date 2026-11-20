// node scripts/make-orrery.mjs [--earth=<picture>]: makes drive/public/orrery/, the small pictures the
// orrery (src/drive-app/orrery.js, the Solar System the worlds are picked from) puts on its worlds,
// fetched only the first time it opens:
//
// - {moon,mars,vesta,ceres}.webp: 1024 × 512, from 180° W, made from the game's own pictures
//   (drive/public/<world>/colour.webp, 4096 × 2048: scripts/make-moon.mjs, make-mars.mjs,
//   make-asteroids.mjs), so they're the same NASA maps with the same credits (worlds.js `credit`).
// - earth.webp: 1024 × 512, from NASA's Blue Marble (NASA Visible Earth: public domain), as the
//   three-globe package's example has it (example/img/earth-blue-marble.jpg, 4096 × 2048: the
//   package's tarball on npm, EARTH below), or a copy given with --earth=. In the game the Earth is
//   Google's photorealistic 3D tiles, which may not be used as a picture like this.
// - {vesta,ceres}-height.bin: their shapes, 360 × 180 little-endian signed 16-bit heights, 1° each,
//   rows from 90° N and columns from 180° W, each the mean of the game's heights
//   (drive/public/<world>/height.bin, 2880 × 1440, 8 to the degree) under it, in the game's own steps
//   (worlds.js `heights.step`: Vesta's are in 2 m, Ceres's in metres) over the world's sphere
//   (worlds.js `radius`). 129,600 bytes each.
//
// The other worlds (Mercury, Venus and the giants) are drawn in the page (orrery.js), with no files.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { WORLDS } from '../src/drive-app/worlds.js';

const SIZE = [ 1024, 512 ];
const QUALITY = 82;
const SHAPES = [ 'vesta', 'ceres' ];
// The grid the shapes are kept on.
const COLUMNS = 360;
const ROWS = 180;
// NASA's Blue Marble in three-globe 2.45.6 (MIT; the picture itself NASA's, public domain).
const EARTH = {
	tarball: 'https://registry.npmjs.org/three-globe/-/three-globe-2.45.6.tgz',
	file: 'package/example/img/earth-blue-marble.jpg',
};

const given = Object.fromEntries( process.argv.slice( 2 ).map( arg => arg.replace( /^--/, '' ).split( '=' ) ) );
const root = new URL( '../drive/public/', import.meta.url );
const out = new URL( 'orrery/', root );
mkdirSync( out, { recursive: true } );

// --- the pictures ---

async function picture( source, name ) {

	const file = new URL( `${ name }.webp`, out );
	await sharp( source ).resize( SIZE[ 0 ], SIZE[ 1 ], { fit: 'fill', kernel: 'lanczos3' } ).webp( { quality: QUALITY, effort: 6 } ).toFile( file.pathname );
	const { width, height, size } = await sharp( file.pathname ).metadata().then( meta => ( { ...meta, size: readFileSync( file ).length } ) );
	console.log( `${ name }.webp: ${ width } × ${ height }, ${ ( size / 1024 ).toFixed( 0 ) } KB` );

}

await picture( given.earth ? readFileSync( given.earth ) : await earth(), 'earth' );
for ( const id of [ 'moon', 'mars', 'vesta', 'ceres' ] ) {

	await picture( readFileSync( new URL( `.${ WORLDS[ id ].picture }`, root ) ), id );

}

// --- the shapes ---

for ( const id of SHAPES ) {

	const { columns, rows, url } = WORLDS[ id ].heights;
	const bytes = readFileSync( new URL( `.${ url }`, root ) );
	const heights = new Int16Array( bytes.buffer, bytes.byteOffset, columns * rows );
	const across = columns / COLUMNS;
	const down = rows / ROWS;
	if ( ! Number.isInteger( across ) || ! Number.isInteger( down ) ) throw new Error( `${ id }'s heights (${ columns } × ${ rows }) don't fit a ${ COLUMNS } × ${ ROWS } grid` );
	const shape = new Int16Array( COLUMNS * ROWS );
	let [ low, high ] = [ Infinity, - Infinity ];
	for ( let row = 0; row < ROWS; row ++ ) {

		for ( let column = 0; column < COLUMNS; column ++ ) {

			let sum = 0;
			for ( let r = row * down; r < ( row + 1 ) * down; r ++ ) {

				for ( let c = column * across; c < ( column + 1 ) * across; c ++ ) sum += heights[ r * columns + c ];

			}

			const mean = Math.round( sum / ( across * down ) );
			shape[ row * COLUMNS + column ] = mean;
			low = Math.min( low, mean );
			high = Math.max( high, mean );

		}

	}

	const step = WORLDS[ id ].heights.step ?? 1;
	const file = new URL( `${ id }-height.bin`, out );
	// Little-endian on every machine (Int16Array is the machine's own order).
	const le = Buffer.alloc( shape.length * 2 );
	shape.forEach( ( value, i ) => le.writeInt16LE( value, i * 2 ) );
	writeFileSync( file, le );
	console.log( `${ id }-height.bin: ${ COLUMNS } × ${ ROWS }, ${ le.length } bytes, ${ low * step } to ${ high * step } m` );

}

// The Earth's Blue Marble, out of three-globe's tarball on npm (a gzipped tar: 512-byte headers, the
// name in the first 100 bytes, the size in octal at 124, each file padded to 512).
async function earth() {

	const response = await fetch( EARTH.tarball );
	if ( ! response.ok ) throw new Error( `${ EARTH.tarball }: ${ response.status }. Give a copy with --earth=` );
	const tar = gunzipSync( Buffer.from( await response.arrayBuffer() ) );
	for ( let at = 0; at + 512 <= tar.length; ) {

		const name = tar.toString( 'utf8', at, at + 100 ).replace( /\0.*$/s, '' );
		if ( ! name ) break;
		const size = parseInt( tar.toString( 'utf8', at + 124, at + 136 ).replace( /\0.*$/s, '' ).trim(), 8 ) || 0;
		if ( name === EARTH.file ) return tar.subarray( at + 512, at + 512 + size );
		at += 512 + Math.ceil( size / 512 ) * 512;

	}

	throw new Error( `No ${ EARTH.file } in ${ EARTH.tarball }` );

}
