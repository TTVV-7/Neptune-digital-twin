// The data lens's numbers (lens.js; docs/world-drive.md, "Data lens"): what the ground's colours mean
// on each world, and the measured heights turned into the texture body.js paints them from. Kept apart
// from lens.js (which has the page's buttons and styles) so the tests can check them in node.
//
// The heights are the measured grid itself, exactly as the world's height.bin has it (body-height.js's
// heightsTable): never the made-up craters and rolling ground the game adds below it for close-up
// driving. That's the point of the lens: it shows only what a spacecraft measured. Each is over the
// world's datum, the level its mission's team gives heights over: the Moon's 1,737.4 km sphere (LOLA's
// reference), Mars's areoid (MOLA's "sea level", as the grid comes), and on Vesta and Ceres their
// `level` spheroids (worlds.js), not the spheres their maps are laid on, whose "heights" would mostly
// be the asteroid's flattening (level.js's levelRadius, which the Discoveries' cards use too, so the
// two agree).

import { DataUtils } from 'three';
import { levelRadius } from './level.js';
import { WORLDS } from './worlds.js';

// The colour scale: viridis (perceptually even and readable with colour blindness), low dark violet
// to high yellow, as ten stops spread evenly along it.
export const RAMP = [ '#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725' ];

// How far apart (m) the contour lines are: every kilometre over the whole world (finer would be
// closer than Ceres's kilometre grid can show on a steep wall), every 250 m around the car.
export const STEPS = { world: 1000, near: 250 };
// "Around me": this far (m) above and below the car's height, so the ground close by uses the whole
// scale (on Mars, most of the planet otherwise sits in the violet third between Tharsis and Hellas).
export const NEAR = 5000;

// Each world's words. `short`: the dataset in a word, for the live readout. `datum`: what the heights
// are over, in a sentence; `here`: the same, short, for the readout. `source`: what the game did to
// which dataset (scripts/make-moon.mjs, make-mars.mjs, make-asteroids.mjs say so in their headers).
export const LENS_WORDS = {
	moon: {
		short: 'LOLA',
		datum: 'the Moon\'s 1,737.4 km reference sphere',
		here: 'the reference sphere',
		source: 'Heights: NASA LRO LOLA (CGI Moon Kit, ldem_4), 0.25° grid (~7.6 km), above a 1,737.4 km sphere.',
	},
	mars: {
		short: 'MOLA',
		datum: 'Mars\'s datum (the areoid)',
		here: 'the datum',
		source: 'Heights: NASA MGS MOLA (MEGDR, 1/16°), resampled to a 1/8° grid (~7.4 km), above the areoid, Mars\'s \'sea level\'.',
	},
	vesta: {
		short: 'Dawn',
		datum: 'Vesta\'s 285 × 229 km reference spheroid',
		here: 'the spheroid',
		source: 'Heights: NASA Dawn, DLR HAMO terrain model (48 px/°), resampled to a 1/8° grid (~570 m), above a 285 × 229 km spheroid.',
	},
	ceres: {
		short: 'Dawn',
		datum: 'the game\'s 482 × 446 km reference spheroid for Ceres',
		here: 'the spheroid',
		source: 'Heights: NASA Dawn, DLR HAMO terrain model (60 px/°), resampled to a 1/8° grid (~1 km), above a 482 × 446 km spheroid.',
	},
};

// Whether `world` has a lens (a world made in the page: not the Earth, whose ground is Google's
// tiles, with no grid of ours under it).
export function hasLens( world ) {

	return Object.hasOwn( LENS_WORDS, world );

}

// How much (m) to add to a stored height in row `row` of `world`'s grid to make it a height over the
// datum: 0 over a sphere (the Moon, Mars: as stored), the sphere less the level spheroid there on Vesta
// and Ceres. Rows run from 90° N, each its cell's middle.
function rowOffset( world, rows, row ) {

	const { radius, level } = WORLDS[ world ];
	if ( ! level ) return 0;
	const lat = 90 - ( row + 0.5 ) * 180 / rows;
	return radius - levelRadius( world, lat );

}

// The texture's data for `world` from its grid (`table`: heightsTable's { data, columns, rows, step }):
// { half (a Uint16Array of half floats, metres over the datum, columns × rows), low, high (m), lowAt,
// highAt ({ lat, lon } of the cells' middles) }. The rows are written south first: a DataTexture's
// first row is at v = 0, and body.js's v is 0 at the south pole (TextureLoader's pictures only line up
// because they're flipped on upload, which a DataTexture isn't). Columns already line up: column c's
// middle is at u = ( c + 0.5 ) / columns, which is lon = −180 + ( c + 0.5 ) × 360 / columns, as the
// grid has it. 4 million half floats take a moment (a tenth of a second or two), once per world.
export function lensTexels( world, table ) {

	const { data, columns, rows, step = 1 } = table;
	const half = new Uint16Array( columns * rows );
	let low = Infinity;
	let high = - Infinity;
	let lowIndex = 0;
	let highIndex = 0;
	for ( let r = 0; r < rows; r ++ ) {

		const offset = rowOffset( world, rows, r );
		const from = r * columns;
		const to = ( rows - 1 - r ) * columns;
		for ( let c = 0; c < columns; c ++ ) {

			const h = data[ from + c ] * step + offset;
			half[ to + c ] = DataUtils.toHalfFloat( h );
			if ( h < low ) {

				low = h;
				lowIndex = from + c;

			}

			if ( h > high ) {

				high = h;
				highIndex = from + c;

			}

		}

	}

	const where = i => ( { lat: 90 - ( Math.floor( i / columns ) + 0.5 ) * 180 / rows, lon: - 180 + ( i % columns + 0.5 ) * 360 / columns } );
	return { half, columns, rows, low, high, lowAt: where( lowIndex ), highAt: where( highIndex ) };

}

// The height over the datum (m) at ( lat, lon ) (degrees) as the lens's texture reads it there: the
// grid's four nearest cell middles, blended in a straight line as the GPU's linear filter does (round
// the 180th meridian; held at the edge rows by the poles). The live readout uses this, so the number
// under the car is the colour under the car.
export function lensHeightAt( world, table, lat, lon ) {

	const { data, columns, rows, step = 1 } = table;
	const fr = Math.min( rows - 1, Math.max( 0, ( 90 - lat ) * rows / 180 - 0.5 ) );
	const fc = ( lon + 180 ) * columns / 360 - 0.5;
	const r0 = Math.min( rows - 2, Math.floor( fr ) );
	const c0 = Math.floor( fc );
	const tr = fr - r0;
	const tc = fc - c0;
	const at = ( r, c ) => data[ r * columns + ( ( c % columns ) + columns ) % columns ] * step + rowOffset( world, rows, r );
	const top = at( r0, c0 ) * ( 1 - tc ) + at( r0, c0 + 1 ) * tc;
	const bottom = at( r0 + 1, c0 ) * ( 1 - tc ) + at( r0 + 1, c0 + 1 ) * tc;
	return top * ( 1 - tr ) + bottom * tr;

}

// The heights at the scale's two ends (m): the world's measured lowest and highest for "Whole world";
// NEAR either side of the car's height for "Around me", the middle moved only in whole kilometres so
// the colours don't creep as the car climbs.
export function lensRange( kind, whole, here = 0 ) {

	if ( kind !== 'near' ) return [ whole.low, whole.high ];
	const middle = Math.round( here / 1000 ) * 1000;
	return [ middle - NEAR, middle + NEAR ];

}

// The labels along the scale (m): its two ends, 0 (the datum) if it's inside, and one round value in
// the middle, leaving out any that would sit within an eighth of the bar of one already there.
export function lensTicks( low, high ) {

	const span = high - low;
	const ticks = [ low, high ];
	const room = v => ticks.every( t => Math.abs( t - v ) > span / 8 );
	if ( low < 0 && high > 0 && room( 0 ) ) ticks.push( 0 );
	const unit = 10 ** Math.floor( Math.log10( Math.max( 1, span / 2 ) ) );
	const middle = Math.round( ( low + high ) / 2 / unit ) * unit;
	if ( room( middle ) ) ticks.push( middle );
	return ticks.sort( ( a, b ) => a - b );

}

// A height on the scale: "−8,140 m", "0 m", "21,160 m" (to 10 m, the true minus sign).
export function tickLabel( h ) {

	const m = to10( h );
	return `${ m < 0 ? '−' : '' }${ Math.abs( m ).toLocaleString( 'en-US' ) } m`;

}

// A height in words, to 10 m: "1,930 m above the datum", "1,930 m below the datum" (never
// "−1,930 m below"), "at the datum".
export function heightWords( h, datum ) {

	const m = to10( h );
	if ( m === 0 ) return `at ${ datum }`;
	return `${ Math.abs( m ).toLocaleString( 'en-US' ) } m ${ m < 0 ? 'below' : 'above' } ${ datum }`;

}

// To the nearest 10 m, halves away from 0 (so −8,135 is −8,140, as 8,135 is 8,140).
function to10( h ) {

	return Math.sign( h ) * Math.round( Math.abs( h ) / 10 ) * 10 || 0;

}

// The live readout under the car: "Here: 1,930 m below the datum · MOLA".
export function hereLine( world, h ) {

	const words = LENS_WORDS[ world ];
	return `Here: ${ heightWords( h, words.here ) } · ${ words.short }`;

}

// What the colours are, under the bar: "Height above Mars's datum (the areoid) · lines every 1,000 m".
export function whatLine( world, kind ) {

	return `Height above ${ LENS_WORDS[ world ].datum } · lines every ${ STEPS[ kind === 'near' ? 'near' : 'world' ].toLocaleString( 'en-US' ) } m`;

}
