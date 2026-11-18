// node scripts/make-mars.mjs [megt90n000eb.img [Mars_Viking_MDIM21_ClrMosaic_global_232m.tif]]:
// makes drive/public/mars/height.bin and drive/public/mars/colour.webp, World Drive's Mars
// (src/drive-app/body.js, worlds.js), from NASA's and the USGS's maps of Mars, fetched unless copies
// are given. Both are public domain.
//
// The heights are Mars Global Surveyor's laser altimeter's (MOLA), as the PDS Geosciences Node has
// them in its Mission Experiment Gridded Data Records (MGS-M-MOLA-5-MEGDR-L3-V1.0): megt90n000eb.img,
// 5760 × 2880 big-endian signed 16-bit metres, 16 to the degree, the topography (the planet's radius
// less the areoid's, so "sea level" is the areoid and Olympus Mons stands 21 km over it), in rows
// from 90° N and columns from 0° E eastward, each the mean over its cell (cell-registered: the first
// column's middle at 0.03125° E). Each 2 × 2 is averaged to 8 to the degree (7.4 km apart at the
// equator, as the Moon's 7.6), turned to start at 180° W as the Moon's do, rounded to the metre as
// little-endian signed 16-bit: 2880 × 1440, 8,294,400 bytes, kept plain as the Moon's are (rows of
// differences, gzipped, would be 4.4 MB).
//
// The picture is the Viking orbiters' mosaic of all of Mars in colour, as the USGS has it (Viking
// MDIM 2.1 colourised global mosaic, 232 m: NASA Ames's colour over the USGS's MDIM 2.1, 92160 × 46080,
// three planes of 8 bits, uncompressed, columns from 180° W, rows from 90° N), averaged 8 × 8 here as
// it streams in (12.7 GB, about a quarter of an hour), then made 4096 × 2048 and saved as WebP.

import { mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = new URL( '../drive/public/mars/', import.meta.url );
const MOLA = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img';
const VIKING = 'https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif';
const COLUMNS = 2880;
const ROWS = 1440;
const PICTURE = [ 4096, 2048 ];

mkdirSync( OUT, { recursive: true } );

// --- the heights ---

const mola = process.argv[ 2 ] ? readFileSync( process.argv[ 2 ] ) : Buffer.from( await ( await fetch( MOLA ) ).arrayBuffer() );
if ( mola.length !== 5760 * 2880 * 2 ) throw new Error( `MOLA's grid should be ${ 5760 * 2880 * 2 } bytes, not ${ mola.length }` );
const heights = new Int16Array( COLUMNS * ROWS );
for ( let r = 0; r < ROWS; r ++ ) {

	for ( let c = 0; c < COLUMNS; c ++ ) {

		// This column starts at c / 8 degrees east of 180° W, which in MOLA's columns (from 0° E) is
		// ( c + COLUMNS / 2 ) / 8 degrees east: its two columns there, and its two rows.
		const from = ( ( c + COLUMNS / 2 ) % COLUMNS ) * 2;
		let sum = 0;
		for ( let i = 0; i < 2; i ++ ) for ( let j = 0; j < 2; j ++ ) sum += mola.readInt16BE( ( ( r * 2 + i ) * 5760 + from + j ) * 2 );
		heights[ r * COLUMNS + c ] = Math.round( sum / 4 );

	}

}

writeFileSync( new URL( 'height.bin', OUT ), Buffer.from( heights.buffer ) );

// Known places, to see it read right: Olympus Mons's summit, the highest place on Mars (21,171 m
// over the areoid in MOLA's grid, on its caldera's south rim, 17.34° N 226.97° E), Badwater crater in
// Hellas, the lowest (-8,177 m, 32.84° S 62.22° E), and Curiosity's landing in Gale crater (4.59° S
// 137.44° E, 4,501 m under the areoid), each a little lower or higher here by this grid's 7.4 km cells.
const at = ( lat, lon ) => heights[ Math.floor( ( 90 - lat ) * 8 ) * COLUMNS + Math.floor( ( ( lon + 540 ) % 360 ) * 8 ) % COLUMNS ];
for ( const [ name, lat, lon ] of [ [ 'Olympus Mons summit', 17.34, - 133.03 ], [ 'Badwater crater', - 32.84, 62.22 ], [ 'Bradbury Landing', - 4.5895, 137.4417 ] ] ) {

	console.log( `${ name }: ${ at( lat, lon ) } m` );

}

console.log( `${ heights.byteLength } bytes to ${ new URL( 'height.bin', OUT ).pathname }` );

// --- the picture ---

const FACTOR = 8;
const viking = await planes( process.argv[ 3 ] ?? VIKING );
const W = viking.width / FACTOR;
const H = viking.height / FACTOR;
const means = new Uint8Array( W * H * 3 );
for ( let band = 0; band < 3; band ++ ) {

	const sums = new Uint32Array( W );
	const line = new Uint8Array( viking.width );
	let row = 0;
	let filled = 0;
	const started = Date.now();
	for await ( const chunk of viking.plane( band ) ) {

		let at = 0;
		while ( at < chunk.length ) {

			// The rest of this row, or as much of it as this chunk has.
			const take = Math.min( chunk.length - at, viking.width - filled );
			line.set( chunk.subarray( at, at + take ), filled );
			at += take;
			filled += take;
			if ( filled < viking.width ) continue;
			for ( let c = 0, i = 0; c < W; c ++, i += FACTOR ) sums[ c ] += line[ i ] + line[ i + 1 ] + line[ i + 2 ] + line[ i + 3 ] + line[ i + 4 ] + line[ i + 5 ] + line[ i + 6 ] + line[ i + 7 ];
			filled = 0;
			row ++;
			if ( row % FACTOR !== 0 ) continue;
			const out = row / FACTOR - 1;
			for ( let c = 0; c < W; c ++ ) means[ ( out * W + c ) * 3 + band ] = Math.round( sums[ c ] / ( FACTOR * FACTOR ) );
			sums.fill( 0 );
			if ( out % 500 === 0 ) console.log( `colour plane ${ band + 1 } of 3: row ${ row } of ${ viking.height }, ${ Math.round( ( Date.now() - started ) / 1000 ) } s` );

		}

	}

	if ( row !== viking.height ) throw new Error( `Read ${ row } rows of plane ${ band + 1 }, not ${ viking.height }` );

}

const colour = await sharp( Buffer.from( means.buffer ), { raw: { width: W, height: H, channels: 3, premultiplied: false } } )
	.resize( ...PICTURE, { kernel: 'lanczos3' } )
	.webp( { quality: 72 } )
	.toBuffer();
writeFileSync( new URL( 'colour.webp', OUT ), colour );
console.log( `${ colour.length } bytes to ${ new URL( 'colour.webp', OUT ).pathname }` );

// The mosaic's planes, each a stream of its rows: an uncompressed BigTIFF (or TIFF) of three
// separate planes ("band interleaved") of 8 bits, in strips, each plane's strips one after another.
async function planes( source ) {

	const remote = /^https?:/.test( source );
	const read = remote
		? async ( from, length ) => Buffer.from( await ( await fetch( source, { headers: { range: `bytes=${ from }-${ from + length - 1 }` } } ) ).arrayBuffer() )
		: ( fd => async ( from, length ) => {

			const buffer = Buffer.alloc( length );
			readSync( fd, buffer, 0, length, from );
			return buffer;

		} )( openSync( source, 'r' ) );

	const head = await read( 0, 16 );
	if ( head.toString( 'latin1', 0, 2 ) !== 'II' ) throw new Error( 'Not a little-endian TIFF' );
	const big = head.readUInt16LE( 2 ) === 43;
	const first = big ? Number( head.readBigUInt64LE( 8 ) ) : head.readUInt32LE( 4 );
	const ifd = await read( first, 8192 );
	const count = big ? Number( ifd.readBigUInt64LE( 0 ) ) : ifd.readUInt16LE( 0 );
	const entry = big ? 20 : 12;
	const tags = new Map();
	for ( let i = 0; i < count; i ++ ) {

		const at = ( big ? 8 : 2 ) + i * entry;
		const tag = ifd.readUInt16LE( at );
		const type = ifd.readUInt16LE( at + 2 );
		const n = big ? Number( ifd.readBigUInt64LE( at + 4 ) ) : ifd.readUInt32LE( at + 4 );
		const size = { 3: 2, 4: 4, 16: 8 }[ type ];
		if ( ! size ) continue;
		const inline = n * size <= ( big ? 8 : 4 );
		const value = at + ( big ? 12 : 8 );
		const where = inline ? null : big ? Number( ifd.readBigUInt64LE( value ) ) : ifd.readUInt32LE( value );
		// The first value of each (the strips' offsets: only the first of each plane is wanted).
		const one = async k => {

			const buffer = inline ? ifd.subarray( value + k * size, value + ( k + 1 ) * size ) : await read( where + k * size, size );
			return size === 2 ? buffer.readUInt16LE( 0 ) : size === 4 ? buffer.readUInt32LE( 0 ) : Number( buffer.readBigUInt64LE( 0 ) );

		};

		tags.set( tag, { n, one } );

	}

	const width = await tags.get( 256 ).one( 0 );
	const height = await tags.get( 257 ).one( 0 );
	if ( await tags.get( 259 ).one( 0 ) !== 1 || await tags.get( 277 ).one( 0 ) !== 3 || await tags.get( 284 ).one( 0 ) !== 2 || await tags.get( 258 ).one( 0 ) !== 8 ) throw new Error( 'Not the mosaic this expects: three uncompressed planes of 8 bits' );
	if ( width % FACTOR || height % FACTOR ) throw new Error( `${ width } × ${ height } doesn't divide by ${ FACTOR }` );
	const offsets = tags.get( 273 );
	const perPlane = offsets.n / 3;
	const starts = [ await offsets.one( 0 ), await offsets.one( perPlane ), await offsets.one( 2 * perPlane ) ];
	// Each plane one block of width × height bytes, straight after the last.
	if ( starts[ 1 ] - starts[ 0 ] !== width * height || starts[ 2 ] - starts[ 1 ] !== width * height ) throw new Error( 'The planes aren\'t one after another' );
	const CHUNK = 1 << 24;
	return {
		width,
		height,
		async * plane( band ) {

			const from = starts[ band ];
			const length = width * height;
			if ( remote ) {

				// A quarter of a gigabyte at a time, each tried again from where it broke off (a 4 GB
				// plane in one go is seldom let through whole).
				for ( let at = 0; at < length; ) {

					const end = Math.min( length, at + ( 1 << 28 ) );
					for ( let tries = 0; at < end; tries ++ ) {

						try {

							const response = await fetch( source, { headers: { range: `bytes=${ from + at }-${ from + end - 1 }` } } );
							if ( response.status !== 206 ) throw new Error( `The mosaic's plane ${ band + 1 } didn't come (${ response.status })` );
							for await ( const chunk of response.body ) {

								at += chunk.length;
								yield chunk;

							}

						} catch ( err ) {

							if ( tries >= 5 ) throw err;
							console.log( `(plane ${ band + 1 } broke off at ${ at } bytes: ${ err.message }; again)` );

						}

					}

				}

			} else {

				for ( let at = 0; at < length; at += CHUNK ) yield await read( from + at, Math.min( CHUNK, length - at ) );

			}

		},
	};

}
