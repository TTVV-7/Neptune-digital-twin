// node scripts/make-moon.mjs [ldem_4.tif lroc_color_poles_4k.tif]: makes drive/public/moon/height.bin
// and drive/public/moon/colour.webp, World Drive's Moon (src/drive-app/moon.js), from NASA's CGI
// Moon Kit (https://svs.gsfc.nasa.gov/4720/, NASA's Scientific Visualization Studio, public domain),
// fetched unless copies are given.
//
// The heights are LRO's laser altimeter's (LOLA), as the kit's ldem_4.tif has them: 1440 × 720
// 32-bit floats, 4 to the degree, kilometres over (or under) a sphere of 1,737.4 km, in rows from
// 90° N (each pixel's middle: the first row at 89.875° N) and columns from 180° W eastward (the first
// at 179.875° W), uncompressed, in strips. Each is rounded to the metre as a signed 16-bit integer,
// little-endian, in the same order: 2,073,600 bytes. The Moon goes from 8.9 km under that sphere
// (Antoniadi crater, on the far side, as this grid has it) to 10.5 km over it (the Selenean summit,
// also on the far side), so a metre's steps fit with room to spare. (Compressed, by rows of
// differences in two planes of bytes, it would be 1.4 MB; this is kept plain, as egm96.bin is.)
//
// The picture is LRO's wide-angle camera's (LROC WAC) mosaic of the whole Moon in colour, with the
// polar mosaics filled in (lroc_color_poles_4k.tif: 4096 × 2048, the same columns and rows as the
// heights, 8 bits a channel), as WebP: about 0.7 MB.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const KIT = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720';
const OUT = new URL( '../drive/public/moon/', import.meta.url );
const COLUMNS = 1440;
const ROWS = 720;

const fetched = async name => Buffer.from( await ( await fetch( `${ KIT }/${ name }` ) ).arrayBuffer() );
const [ heightTiff, colourTiff ] = await Promise.all( [
	process.argv[ 2 ] ? readFileSync( process.argv[ 2 ] ) : fetched( 'ldem_4.tif' ),
	process.argv[ 3 ] ? readFileSync( process.argv[ 3 ] ) : fetched( 'lroc_color_poles_4k.tif' ),
] );

const km = decode( heightTiff );
const heights = new Int16Array( COLUMNS * ROWS );
for ( let i = 0; i < heights.length; i ++ ) heights[ i ] = Math.round( km[ i ] * 1000 );
mkdirSync( OUT, { recursive: true } );
writeFileSync( new URL( 'height.bin', OUT ), Buffer.from( heights.buffer ) );

const colour = await sharp( colourTiff ).webp( { quality: 72 } ).toBuffer();
writeFileSync( new URL( 'colour.webp', OUT ), colour );

// Known places, to see it read right: the highest point (the Selenean summit, 5.41° N 158.63° W,
// 10.79 km in the full-resolution data) and the lowest (in Antoniadi crater, 70.4° S 172.4° W, -9.1 km),
// both smoothed lower by this grid's 7.6 km pixels; the Apollo 11 site in Mare Tranquillitatis, about
// 1.9 km under the sphere.
const at = ( lat, lon ) => heights[ Math.floor( ( 90 - lat ) * 4 ) * COLUMNS + Math.floor( ( lon + 180 ) * 4 ) % COLUMNS ];
for ( const [ name, lat, lon ] of [ [ 'Selenean summit', 5.41, - 158.63 ], [ 'Antoniadi crater', - 70.38, - 172.38 ], [ 'Apollo 11', 0.674, 23.473 ] ] ) {

	console.log( `${ name }: ${ at( lat, lon ) } m` );

}

console.log( `${ heights.byteLength } bytes to ${ new URL( 'height.bin', OUT ).pathname }` );
console.log( `${ colour.length } bytes to ${ new URL( 'colour.webp', OUT ).pathname }` );

// The grid's heights (km), row by row: an uncompressed little-endian TIFF of 32-bit floats in strips.
function decode( buffer ) {

	if ( buffer.toString( 'latin1', 0, 2 ) !== 'II' || buffer.readUInt16LE( 2 ) !== 42 ) throw new Error( 'Not a little-endian TIFF' );
	const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8 };
	const ifd = buffer.readUInt32LE( 4 );
	const tags = new Map();
	for ( let i = 0; i < buffer.readUInt16LE( ifd ); i ++ ) {

		const at = ifd + 2 + i * 12;
		const type = buffer.readUInt16LE( at + 2 );
		const count = buffer.readUInt32LE( at + 4 );
		if ( type !== 3 && type !== 4 ) continue;
		const size = SIZES[ type ];
		const from = count * size <= 4 ? at + 8 : buffer.readUInt32LE( at + 8 );
		tags.set( buffer.readUInt16LE( at ), Array.from( { length: count }, ( _, j ) => size === 2 ? buffer.readUInt16LE( from + j * 2 ) : buffer.readUInt32LE( from + j * 4 ) ) );

	}

	// 1440 × 720 32-bit floats (sample format 3), uncompressed (1).
	if ( tags.get( 256 )[ 0 ] !== COLUMNS || tags.get( 257 )[ 0 ] !== ROWS || tags.get( 258 )[ 0 ] !== 32 || tags.get( 339 )?.[ 0 ] !== 3 || tags.get( 259 )[ 0 ] !== 1 ) throw new Error( 'Not the grid this expects' );
	const values = new Float32Array( COLUMNS * ROWS );
	let n = 0;
	const offsets = tags.get( 273 );
	const lengths = tags.get( 279 );
	offsets.forEach( ( offset, strip ) => {

		for ( let b = 0; b < lengths[ strip ]; b += 4 ) values[ n ++ ] = buffer.readFloatLE( offset + b );

	} );
	if ( n !== values.length ) throw new Error( `Read ${ n } heights, not ${ values.length }` );
	return values;

}
