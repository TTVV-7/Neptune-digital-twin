// node scripts/make-asteroids.mjs <vesta|ceres|both> [--vesta-dtm=… --vesta-mosaic=… --ceres-dtm=… --ceres-mosaic=…]:
// makes drive/public/<world>/height.bin and drive/public/<world>/colour.webp, World Drive's Vesta and
// Ceres (src/drive-app/body.js, worlds.js), from NASA's Dawn mission's maps as the USGS has them
// (made by DLR: "NASA/JPL-Caltech/UCLA/MPS/DLR/IDA"), fetched unless copies are given (each is a few
// hundred MB: give copies to make both more than once).
//
// Both worlds come out as Mars's and the Moon's do: heights 2880 × 1440 little-endian signed 16-bit,
// 8 to the degree, rows from 90° N and columns from 180° W, each the mean over its cell; the picture
// 4096 × 2048, from 180° W, as WebP. Each is the area-weighted mean of the source's cells under it.
// Latitudes are planetocentric and longitudes east, as the maps (and the IAU) have them.
//
// Vesta: the HAMO global DTM (Vesta_Dawn_HAMO_DTM_DLR_Global_48ppd.tif: 17280 × 8640 32-bit floats,
// each the radius in metres, columns from 180° W, in the IAU's "Claudia double-prime" longitudes) and
// the HAMO global mosaic (Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif: 26704 × 13352 bytes, the same
// frame). Vesta's radius goes from 212 to 293 km: 81 km, more than 16-bit metres hold, so its heights
// are kept in steps of 2 m (worlds.js's heights.step) over its mean radius, 262.7 km.
//
// Ceres: the HAMO global DTM (Ceres_Dawn_FC_HAMO_DTM_DLR_Global_60ppd_Oct2016.tif: 21600 × 10800
// signed 16-bit metres over a 470 km sphere, columns from 0° E) and the Survey global mosaic
// (Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif: 7383 × 3691 bytes, 400 m each, columns from 0° E).
// Its heights are kept in metres over that 470 km sphere, as they are.

import { closeSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const COLUMNS = 2880;
const ROWS = 1440;
const PICTURE = [ 4096, 2048 ];
const MOSAICS = 'https://planetarymaps.usgs.gov/mosaic/';

// Each world: its sources (file names at the USGS, the grid they're on), the sphere its heights are
// kept over (m) and their step (m), and known places to see it read right (planetocentric, ° E).
const WORLDS = {
	vesta: {
		dtm: { file: 'Vesta_Dawn_HAMO_DTM_DLR_Global_48ppd.tif', type: 'float32', west: - 180, value: radius => radius },
		mosaic: { file: 'Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif', west: - 180 },
		radius: 262700,
		step: 2,
		// The level the Dawn team's heights are given over: a spheroid 285 × 285 × 229 km.
		level: [ 285000, 229000 ],
		known: [
			// Rheasilvia's central peak: the highest over the spheroid near the basin's middle.
			[ 'Rheasilvia (basin middle)', - 75, 86.3 ],
			[ 'Matronalia Rupes', - 49.42, 232.76 - 360 ],
			[ 'Divalia Fossae', - 9.05, 196.23 - 360 ],
			[ 'Marcia (Snowman)', 8.98, 339.55 - 360 ],
			[ 'Claudia', - 1.65, 146 ],
		],
	},
	ceres: {
		dtm: { file: 'Ceres_Dawn_FC_HAMO_DTM_DLR_Global_60ppd_Oct2016.tif', type: 'int16', west: 0, nodata: - 32768, value: height => 470000 + height },
		mosaic: { file: 'Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif', west: 0 },
		radius: 470000,
		step: 1,
		level: [ 482000, 446000 ],
		known: [
			[ 'Ahuna Mons', - 10.48, 316.2 - 360 ],
			[ 'Occator (floor)', 19.82, 239.33 - 360 ],
			[ 'Kerwan (floor)', - 10.77, 123.99 ],
			[ 'Urvara', - 45.66, 248.71 - 360 ],
			[ 'Kait', - 2.1, 0 ],
		],
	},
};

const asked = process.argv[ 2 ] ?? 'both';
const given = Object.fromEntries( process.argv.slice( 3 ).map( arg => arg.replace( /^--/, '' ).split( '=' ) ) );
for ( const id of asked === 'both' ? Object.keys( WORLDS ) : [ asked ] ) {

	const world = WORLDS[ id ];
	if ( ! world ) throw new Error( `No world ${ id }: vesta, ceres or both` );
	const out = new URL( `../drive/public/${ id }/`, import.meta.url );
	mkdirSync( out, { recursive: true } );

	// --- the heights ---

	const dtm = await raster( given[ `${ id }-dtm` ] ?? MOSAICS + world.dtm.file );
	const radii = resample( dtm, world.dtm, COLUMNS, ROWS, world.dtm.value );
	const heights = new Int16Array( COLUMNS * ROWS );
	let [ low, high ] = [ Infinity, - Infinity ];
	for ( let i = 0; i < radii.length; i ++ ) {

		const units = Math.round( ( radii[ i ] - world.radius ) / world.step );
		if ( units < - 32767 || units > 32767 ) throw new Error( `${ id }: ${ radii[ i ] } m doesn't fit in steps of ${ world.step } m over ${ world.radius }` );
		heights[ i ] = units;
		low = Math.min( low, units * world.step );
		high = Math.max( high, units * world.step );

	}

	writeFileSync( new URL( 'height.bin', out ), Buffer.from( heights.buffer ) );
	console.log( `${ id }: ${ heights.byteLength } bytes to ${ new URL( 'height.bin', out ).pathname }; ${ low } to ${ high } m over ${ world.radius / 1000 } km` );
	// Over the level spheroid (planetocentric: its radius r = 1 / √( cos²φ / a² + sin²φ / c² )).
	const [ a, c ] = world.level;
	const levelAt = lat => 1 / Math.hypot( Math.cos( lat * Math.PI / 180 ) / a, Math.sin( lat * Math.PI / 180 ) / c );
	const cell = ( lat, lon ) => Math.min( ROWS - 1, Math.floor( ( 90 - lat ) * 8 ) ) * COLUMNS + Math.floor( ( ( lon + 540 ) % 360 ) * 8 ) % COLUMNS;
	let [ levelLow, levelHigh ] = [ Infinity, - Infinity ];
	for ( let r = 0; r < ROWS; r ++ ) {

		const level = levelAt( 90 - ( r + 0.5 ) / 8 );
		for ( let k = r * COLUMNS; k < ( r + 1 ) * COLUMNS; k ++ ) {

			const over = world.radius + heights[ k ] * world.step - level;
			levelLow = Math.min( levelLow, over );
			levelHigh = Math.max( levelHigh, over );

		}

	}

	console.log( `${ id }: ${ Math.round( levelLow ) } to ${ Math.round( levelHigh ) } m over the level spheroid ${ a / 1000 } × ${ c / 1000 } km` );
	for ( const [ name, lat, lon ] of world.known ) {

		// The place's own height, and the highest and lowest within half a degree (over the spheroid).
		const own = world.radius + heights[ cell( lat, lon ) ] * world.step - levelAt( lat );
		let [ most, least ] = [ - Infinity, Infinity ];
		for ( let dy = - 4; dy <= 4; dy ++ ) for ( let dx = - 4; dx <= 4; dx ++ ) {

			const [ y, x ] = [ lat + dy / 8, lon + dx / 8 ];
			if ( Math.abs( y ) > 89.9 ) continue;
			const over = world.radius + heights[ cell( y, x ) ] * world.step - levelAt( y );
			most = Math.max( most, over );
			least = Math.min( least, over );

		}

		console.log( `  ${ name } (${ lat }, ${ lon }): ${ Math.round( own ) } m over the spheroid; ${ Math.round( least ) } to ${ Math.round( most ) } m within half a degree` );

	}

	// --- the picture ---

	const mosaic = await raster( given[ `${ id }-mosaic` ] ?? MOSAICS + world.mosaic.file );
	const means = resample( mosaic, world.mosaic, ...PICTURE, value => value );
	// Evened out to the Moon's picture's spread (a mean of 140 and a deviation of 30 in 255): the Dawn
	// mosaics are calibrated to what each frame saw, with the long shadows of a low sun in them, so
	// stretched to their full range they're far harsher than the ground the page shades itself
	// (body.js). How bright each world's ground is, Vesta's bright and Ceres's dark, is its look's.
	let [ sum, squares ] = [ 0, 0 ];
	for ( const value of means ) {

		sum += value;
		squares += value * value;

	}

	const mean = sum / means.length;
	const spread = Math.sqrt( squares / means.length - mean * mean );
	const grey = new Uint8Array( means.length );
	for ( let i = 0; i < means.length; i ++ ) grey[ i ] = Math.max( 0, Math.min( 255, Math.round( 140 + ( means[ i ] - mean ) / spread * 30 ) ) );
	const picture = await sharp( Buffer.from( grey.buffer ), { raw: { width: PICTURE[ 0 ], height: PICTURE[ 1 ], channels: 1 } } ).webp( { quality: 72 } ).toBuffer();
	writeFileSync( new URL( 'colour.webp', out ), picture );
	console.log( `${ id }: ${ picture.length } bytes to ${ new URL( 'colour.webp', out ).pathname } (from a mean of ${ mean.toFixed( 1 ) } and a spread of ${ spread.toFixed( 1 ) })` );
	// The picture's brightness at each known place against its surroundings (Occator's bright spots
	// should stand out, if it's on the heights' grid).
	const bright1 = ( lat, lon ) => grey[ Math.min( PICTURE[ 1 ] - 1, Math.floor( ( 90 - lat ) / 180 * PICTURE[ 1 ] ) ) * PICTURE[ 0 ] + Math.floor( ( ( lon + 540 ) % 360 ) / 360 * PICTURE[ 0 ] ) % PICTURE[ 0 ] ];
	for ( const [ name, lat, lon ] of world.known ) console.log( `  ${ name }: picture ${ bright1( lat, lon ) }` );

}

// --- reading ---

// A single-plane, uncompressed, strip-organised GeoTIFF (each of the maps above): its size, the
// type of its values and a way to read a row; a local file, or a URL (fetched whole into memory).
async function raster( source ) {

	let read;
	let close = () => {};
	if ( /^https?:/.test( source ) ) {

		console.log( `fetching ${ source }` );
		const whole = Buffer.from( await ( await fetch( source ) ).arrayBuffer() );
		read = ( from, length ) => whole.subarray( from, from + length );

	} else {

		const fd = openSync( source, 'r' );
		read = ( from, length ) => {

			const buffer = Buffer.alloc( length );
			readSync( fd, buffer, 0, length, from );
			return buffer;

		};
		close = () => closeSync( fd );

	}

	const head = read( 0, 8 );
	if ( head.toString( 'latin1', 0, 2 ) !== 'II' || head.readUInt16LE( 2 ) !== 42 ) throw new Error( `${ source }: not a little-endian TIFF` );
	const ifd = read( head.readUInt32LE( 4 ), 4096 );
	const tags = new Map();
	for ( let i = 0, n = ifd.readUInt16LE( 0 ); i < n; i ++ ) {

		const at = 2 + i * 12;
		tags.set( ifd.readUInt16LE( at ), { type: ifd.readUInt16LE( at + 2 ), count: ifd.readUInt32LE( at + 4 ), value: ifd.subarray( at + 8, at + 12 ) } );

	}

	const short = tag => tags.get( tag ).type === 3 ? tags.get( tag ).value.readUInt16LE( 0 ) : tags.get( tag ).value.readUInt32LE( 0 );
	const width = short( 256 );
	const height = short( 257 );
	const bits = short( 258 );
	const format = tags.has( 339 ) ? short( 339 ) : 1;
	if ( short( 259 ) !== 1 || ( tags.has( 277 ) && short( 277 ) !== 1 ) ) throw new Error( `${ source }: not one uncompressed plane` );
	const type = { '8,1': 'uint8', '16,2': 'int16', '32,3': 'float32' }[ `${ bits },${ format }` ];
	if ( ! type ) throw new Error( `${ source }: ${ bits }-bit values of format ${ format }` );
	const bytes = bits / 8;
	// The strips' offsets: one row (or more) each, one after another.
	const strips = tags.get( 273 );
	const first = strips.count === 1 ? strips.value.readUInt32LE( 0 ) : read( strips.value.readUInt32LE( 0 ), 4 ).readUInt32LE( 0 );
	const last = strips.count === 1 ? first : read( strips.value.readUInt32LE( 0 ) + ( strips.count - 1 ) * 4, 4 ).readUInt32LE( 0 );
	if ( strips.count > 1 && last - first !== ( height * width * bytes ) / strips.count * ( strips.count - 1 ) ) throw new Error( `${ source }: its strips aren't one after another` );
	// Where it is: its first pixel's corner and a pixel's size, in metres on the projection's sphere.
	const scale = tags.get( 33550 );
	const tie = tags.get( 33922 );
	const doubles = ( entry, n ) => {

		const buffer = read( entry.value.readUInt32LE( 0 ), n * 8 );
		return Array.from( { length: n }, ( _, k ) => buffer.readDoubleLE( k * 8 ) );

	};

	const [ size ] = doubles( scale, 2 );
	const [ , , , x0, y0 ] = doubles( tie, 6 );
	console.log( `${ source.split( '/' ).at( - 1 ) }: ${ width } × ${ height } ${ type }, ${ size.toFixed( 2 ) } m a pixel, corner ${ x0.toFixed( 0 ) }, ${ y0.toFixed( 0 ) }` );
	return {
		width, height, type, size, x0, y0, close,
		row( r ) {

			const buffer = read( first + r * width * bytes, width * bytes );
			const values = new Float64Array( width );
			for ( let c = 0; c < width; c ++ ) values[ c ] = type === 'float32' ? buffer.readFloatLE( c * 4 ) : type === 'int16' ? buffer.readInt16LE( c * 2 ) : buffer[ c ];
			return values;

		},
	};

}

// `source` (raster's) as columns × rows from 180° W and 90° N, each cell the mean of the source's
// values under it weighted by how much of each it covers, each through `value` (a missing one,
// `nodata`, left out). The source's own grid: its west edge at `west` degrees east, a pixel `size`
// metres on a sphere whose circumference its width × size is (so its degrees are 360 / width wide);
// its top at y0 metres (y0 / size pixels from the equator), so its rows start at that latitude.
function resample( source, { west, nodata = null }, columns, rows, value ) {

	const { width, height, size, y0 } = source;
	// Its pixels per degree, along and across; and its top's latitude.
	const along = width / 360;
	const sphere = width * size / ( 2 * Math.PI );
	const top = y0 / sphere * 180 / Math.PI;
	const across = height / ( top - ( top - height * size / sphere * 180 / Math.PI ) );
	// For each output column: the source's columns under it with their shares (wrapping round).
	const spans = [];
	for ( let c = 0; c < columns; c ++ ) {

		const from = ( ( - 180 + c * 360 / columns - west + 720 ) % 360 ) * along;
		const to = from + 360 / columns * along;
		const parts = [];
		for ( let x = Math.floor( from ); x < to; x ++ ) parts.push( [ ( ( x % width ) + width ) % width, Math.min( to, x + 1 ) - Math.max( from, x ) ] );
		spans.push( parts );

	}

	const sums = new Float64Array( columns * rows );
	const weights = new Float64Array( columns * rows );
	const started = Date.now();
	for ( let y = 0; y < height; y ++ ) {

		// This source row's latitudes, and the output rows it falls in.
		const [ north, south ] = [ top - y / across, top - ( y + 1 ) / across ];
		const r0 = Math.max( 0, Math.floor( ( 90 - north ) * rows / 180 ) );
		const r1 = Math.min( rows - 1, Math.floor( ( 90 - south ) * rows / 180 - 1e-9 ) );
		if ( r1 < r0 ) continue;
		const line = source.row( y );
		for ( let c = 0; c < columns; c ++ ) {

			let sum = 0;
			let weight = 0;
			for ( const [ x, share ] of spans[ c ] ) {

				if ( nodata !== null && line[ x ] === nodata ) continue;
				sum += value( line[ x ] ) * share;
				weight += share;

			}

			if ( ! weight ) continue;
			for ( let r = r0; r <= r1; r ++ ) {

				const overlap = Math.min( north, 90 - r * 180 / rows ) - Math.max( south, 90 - ( r + 1 ) * 180 / rows );
				if ( overlap <= 0 ) continue;
				sums[ r * columns + c ] += sum / weight * overlap;
				weights[ r * columns + c ] += overlap;

			}

		}

		if ( y % 2000 === 0 ) console.log( `  row ${ y } of ${ height }, ${ Math.round( ( Date.now() - started ) / 1000 ) } s` );

	}

	source.close();
	const means = new Float64Array( columns * rows );
	for ( let i = 0; i < means.length; i ++ ) {

		if ( ! weights[ i ] ) throw new Error( `Nothing of the source under cell ${ i % columns }, ${ Math.floor( i / columns ) }` );
		means[ i ] = sums[ i ] / weights[ i ];

	}

	return means;

}
