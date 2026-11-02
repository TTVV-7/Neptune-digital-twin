// node scripts/make-sea-level.mjs [grid.tif]: makes drive/public/sea/egm96.bin, the sea's height
// over the ellipsoid every degree, for World Drive's open sea (src/drive-app/sea.js).
//
// Google's heights are over the WGS 84 ellipsoid, and the sea's surface isn't: it lies on the
// geoid, from 107 m under the ellipsoid (south of India) to 85 m over it (New Guinea). The geoid
// here is EGM96, NGA's (public domain), from PROJ's copy of its 15-minute grid
// (https://cdn.proj.org/us_nga_egm96_15.tif, fetched unless a copy is given): 1440 × 721 heights
// as 32-bit floats from 90° N, 180° W, in 256-pixel tiles, deflated, with TIFF's floating-point
// predictor. It's cut to every degree, each height rounded to the metre, as one signed byte:
// 181 rows (90° N to 90° S) of 360 (180° W eastward), 65,160 bytes. Read back bilinearly that's
// within 0.5 m of the full grid on average (1.9 m at the 99th percentile, 14 m at worst, by the
// trenches); round volcanic islands, whose own bump is narrower than a degree, 2 to 6 m low.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SOURCE = 'https://cdn.proj.org/us_nga_egm96_15.tif';
const OUT = new URL( '../drive/public/sea/egm96.bin', import.meta.url );

const tiff = process.argv[ 2 ] ? readFileSync( process.argv[ 2 ] ) : Buffer.from( await ( await fetch( SOURCE ) ).arrayBuffer() );
const grid = decode( tiff );
const table = new Int8Array( 181 * 360 );
for ( let row = 0; row <= 180; row ++ ) {

	for ( let col = 0; col < 360; col ++ ) table[ row * 360 + col ] = Math.round( grid.at( row * 4, col * 4 ) );

}

mkdirSync( new URL( '.', OUT ), { recursive: true } );
writeFileSync( OUT, table );
// Known heights, to see it read right: 17.16 m at 0° 0°, 13.61 m at the North Pole, -29.53 m at
// the South Pole, the lowest (-107.0 m) south of India and the highest (85.4 m) by New Guinea.
for ( const [ name, lat, lon ] of [ [ '0° 0°', 0, 0 ], [ 'North Pole', 90, 0 ], [ 'South Pole', - 90, 0 ], [ 'south of India', 4.75, 78.75 ], [ 'New Guinea', - 8.25, 147.25 ] ] ) {

	console.log( `${ name }: ${ grid.at( ( 90 - lat ) * 4, ( lon + 180 ) * 4 ).toFixed( 2 ) } m` );

}

console.log( `${ table.length } bytes to ${ OUT.pathname }` );

// The grid's heights, as at( row, column ).
function decode( buffer ) {

	if ( buffer.toString( 'latin1', 0, 2 ) !== 'II' || buffer.readUInt16LE( 2 ) !== 42 ) throw new Error( 'Not a little-endian TIFF' );
	const ifd = buffer.readUInt32LE( 4 );
	const tags = new Map();
	for ( let i = 0; i < buffer.readUInt16LE( ifd ); i ++ ) {

		const at = ifd + 2 + i * 12;
		const type = buffer.readUInt16LE( at + 2 );
		const count = buffer.readUInt32LE( at + 4 );
		// Shorts and longs; an offset to them where they don't fit in the entry.
		const size = type === 3 ? 2 : 4;
		const from = count * size <= 4 ? at + 8 : buffer.readUInt32LE( at + 8 );
		const values = Array.from( { length: count }, ( _, j ) => size === 2 ? buffer.readUInt16LE( from + j * 2 ) : buffer.readUInt32LE( from + j * 4 ) );
		tags.set( buffer.readUInt16LE( at ), values );

	}

	const [ width ] = tags.get( 256 );
	const [ height ] = tags.get( 257 );
	const [ tileWidth ] = tags.get( 322 );
	const [ tileHeight ] = tags.get( 323 );
	// 32-bit floats (sample format 3), deflated (8), with the floating-point predictor (3).
	if ( tags.get( 258 )[ 0 ] !== 32 || tags.get( 339 )[ 0 ] !== 3 || tags.get( 259 )[ 0 ] !== 8 || tags.get( 317 )[ 0 ] !== 3 ) throw new Error( 'Not the grid this expects' );
	const offsets = tags.get( 324 );
	const lengths = tags.get( 325 );
	const across = Math.ceil( width / tileWidth );
	const heights = new Float32Array( width * height );
	const view = new DataView( new ArrayBuffer( 4 ) );
	offsets.forEach( ( offset, t ) => {

		const bytes = inflateSync( buffer.subarray( offset, offset + lengths[ t ] ) );
		const x0 = ( t % across ) * tileWidth;
		const y0 = Math.floor( t / across ) * tileHeight;
		for ( let y = 0; y < tileHeight && y0 + y < height; y ++ ) {

			// Each row's bytes were differenced in turn, after being laid out as four planes, the
			// most significant bytes first.
			const row = bytes.subarray( y * tileWidth * 4, ( y + 1 ) * tileWidth * 4 );
			for ( let i = 1; i < row.length; i ++ ) row[ i ] = ( row[ i ] + row[ i - 1 ] ) & 255;
			for ( let x = 0; x < tileWidth && x0 + x < width; x ++ ) {

				for ( let b = 0; b < 4; b ++ ) view.setUint8( b, row[ b * tileWidth + x ] );
				heights[ ( y0 + y ) * width + x0 + x ] = view.getFloat32( 0 );

			}

		}

	} );

	return { at: ( row, col ) => heights[ Math.round( row ) * width + ( ( Math.round( col ) % width ) + width ) % width ] };

}
