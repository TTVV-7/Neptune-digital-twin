// The Moon's ground (moon.js): how high it is anywhere, to the metre and below. The big shapes are
// the real Moon's: LRO's laser altimeter's heights (LOLA), every quarter degree (7.6 km at the
// equator), from drive/public/moon/height.bin (scripts/make-moon.mjs), read between its points with
// a smooth (Catmull-Rom) curve, so maria, basins, mountains and the big craters are where they are.
// Everything smaller is made up, but the same every time and everywhere: craters from 12 km across
// down to 3 m, as many of each size as the Moon has (about four times as many each time the size
// halves), most of them old and worn down, a few fresh with bright ejecta round them; and gentle
// rolling ground under them.
//
// The craters are scattered without seams anywhere on the sphere: for each size, space is cut into
// cubes (turned a different way for each size, so the sizes don't line up), and each cube may hold
// one crater, centred somewhere in the middle 40 % of it, reaching at most 30 % of the cube's size
// from its centre. So no crater reaches out of its own cube, and a point only ever looks at the one
// cube it's in for each size: thirteen sizes, thirteen looks. A crater is where its ball cuts the
// Moon's surface, so a crater centred off the surface is just a smaller one.
//
// Positions are in the Moon's own frame (as 3d-tiles-renderer's Ellipsoid has a body: Z through
// the north pole, X through 0° N 0° E, the middle of the side facing the Earth), as a unit
// direction; heights are metres over (or under) the sphere of MOON_RADIUS.

export const MOON_RADIUS = 1737400;

const COLUMNS = 1440;
const ROWS = 720;
const PER_DEGREE = 4;
const DEG = Math.PI / 180;

// The craters' cubes, largest first (m), and the share of the cubes holding one: fewer of the
// biggest, which the real heights already have.
const CELLS = [ 32000, 16000, 8000, 4000, 2000, 1000, 500, 250, 125, 62.5, 31.25, 15.625, 7.8125 ];
const PRESENCE = [ 0.3, 0.4, 0.5, 0.65, 0.75, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8 ];
// A crater's centre is this far into its cube at least, and its ball reaches at most this far.
const INSET = 0.3;
const REACH = 0.3;
// The ejecta reach this many times the rim's radius.
const EJECTA = 1.5;
// The rolling ground: wavelengths (m) and heights (m) of each layer.
const ROLLS = [ [ 900, 9 ], [ 260, 2.2 ], [ 70, 0.45 ], [ 18, 0.08 ] ];

let heights = null;
let northMean = 0;
let southMean = 0;

// The cubes' turns: a rotation for each size, the same on every visit.
const TURNS = CELLS.map( ( _, i ) => rotation( i + 1 ) );

// Hand over the heights (an Int16Array of COLUMNS × ROWS metres, as height.bin has them).
export function setHeights( table ) {

	if ( table.length !== COLUMNS * ROWS ) throw new Error( `The Moon's heights should be ${ COLUMNS * ROWS } values, not ${ table.length }` );
	heights = table;
	let north = 0;
	let south = 0;
	for ( let c = 0; c < COLUMNS; c ++ ) {

		north += table[ c ];
		south += table[ ( ROWS - 1 ) * COLUMNS + c ];

	}

	northMean = north / COLUMNS;
	southMean = south / COLUMNS;

}

export function hasHeights() {

	return heights !== null;

}

// The ground at the unit direction ( x, y, z ): out.height (m over MOON_RADIUS) and out.shade, how
// much brighter or darker than the photo the ground there is (1 as it is: fresh craters are
// brighter). Detail smaller than `finest` (m) is left out, fading in from twice that: a mesh whose
// points are 20 m apart can't show a crater 10 m across, and would only shimmer with it.
export function groundAt( x, y, z, finest = 0, out = { height: 0, shade: 1 } ) {

	const lat = Math.asin( Math.max( - 1, Math.min( 1, z ) ) ) / DEG;
	const lon = Math.atan2( y, x ) / DEG;
	let height = heights ? lola( lat, lon ) : 0;
	let shade = 1;

	// Where on the sphere (m) this is.
	const px = x * MOON_RADIUS;
	const py = y * MOON_RADIUS;
	const pz = z * MOON_RADIUS;

	for ( let k = 0; k < CELLS.length; k ++ ) {

		const cell = CELLS[ k ];
		// The biggest crater this size could make; smaller detail than asked for is left out.
		const largest = 2 * REACH / EJECTA * cell;
		const keep = fade( largest, finest );
		if ( keep <= 0 ) break;
		const m = TURNS[ k ];
		const qx = ( m[ 0 ] * px + m[ 1 ] * py + m[ 2 ] * pz ) / cell;
		const qy = ( m[ 3 ] * px + m[ 4 ] * py + m[ 5 ] * pz ) / cell;
		const qz = ( m[ 6 ] * px + m[ 7 ] * py + m[ 8 ] * pz ) / cell;
		const ix = Math.floor( qx );
		const iy = Math.floor( qy );
		const iz = Math.floor( qz );
		let h = hash( ix, iy, iz, k );
		if ( ( h & 0xffff ) / 0x10000 >= PRESENCE[ k ] ) continue;
		h = mix( h );
		const cx = ix + INSET + ( 1 - 2 * INSET ) * ( ( h & 0x3ff ) / 0x400 );
		const cy = iy + INSET + ( 1 - 2 * INSET ) * ( ( ( h >>> 10 ) & 0x3ff ) / 0x400 );
		const cz = iz + INSET + ( 1 - 2 * INSET ) * ( ( ( h >>> 20 ) & 0x3ff ) / 0x400 );
		h = mix( h );
		// Its ball: up to REACH of the cube, more small ones than big.
		const size = 0.35 + 0.65 * ( ( h & 0xffff ) / 0x10000 ) ** 1.6;
		const ball = REACH * size;
		const dx = qx - cx;
		const dy = qy - cy;
		const dz = qz - cz;
		const d2 = dx * dx + dy * dy + dz * dz;
		if ( d2 >= ball * ball ) continue;
		// How far the centre is off the surface (in cubes), and so how big a circle the ball cuts.
		const off = Math.hypot( cx, cy, cz ) - MOON_RADIUS / cell;
		const circle2 = ball * ball - off * off;
		if ( circle2 <= 0 ) continue;
		const rim = Math.sqrt( circle2 ) / EJECTA;
		const t = Math.sqrt( Math.max( 0, d2 - off * off ) ) / rim;
		// How fresh it is: most are old, worn shallow with soft rims.
		const fresh = 0.2 + 0.8 * ( ( ( h >>> 16 ) & 0xffff ) / 0x10000 ) ** 2;
		const across = 2 * rim * cell;
		const weight = keep * fade( across, finest );
		if ( weight <= 0 ) continue;
		height += weight * crater( t, across, fresh );
		// Fresh craters are bright inside and out to the end of their ejecta.
		if ( fresh > 0.5 ) shade += weight * ( fresh - 0.5 ) * 0.7 * ( 1 - smooth( 0.6, EJECTA, t ) );

	}

	// The gentle rolls, finest last.
	for ( const [ wave, amount ] of ROLLS ) {

		const keep = fade( wave / 2, finest );
		if ( keep <= 0 ) break;
		height += keep * amount * noise( px / wave, py / wave, pz / wave );

	}

	out.height = height;
	out.shade = shade;
	return out;

}

// The ground's height at latitude and longitude (degrees), every detail in.
export function heightAt( lat, lon, finest = 0 ) {

	const phi = lat * DEG;
	const lambda = lon * DEG;
	return groundAt( Math.cos( phi ) * Math.cos( lambda ), Math.cos( phi ) * Math.sin( lambda ), Math.sin( phi ), finest, _out ).height;

}

const _out = { height: 0, shade: 1 };

// A crater's height at t (its distance from the middle over the rim's radius), `across` m from rim
// to rim: a bowl about a fifth as deep as it's wide (shallower for big ones, whose floors are flat),
// a rim standing up a thirtieth of that, and ejecta sloping away to nothing at EJECTA. Worn ones are
// shallower, their rims lower.
function crater( t, across, fresh ) {

	const depth = across * ( across < 3000 ? 0.19 : 0.11 ) * fresh;
	const lip = across * 0.034 * fresh;
	if ( t < 1 ) {

		// Big ones have flat floors.
		const floor = across > 600 ? - 0.7 : - 1;
		const bowl = softMax( t * t - 1, floor, 0.12 );
		return depth * bowl + lip * t * t * t;

	}

	const u = Math.min( 1, ( t - 1 ) / ( EJECTA - 1 ) );
	return lip * ( 1 - u ) * ( 1 - u ) * ( 1 - 0.5 * u );

}

// LOLA's height (m) at latitude and longitude (degrees), read between the grid's points with
// Catmull-Rom curves; across a pole, the row on the other side. Right by a pole every column meets,
// so the last stretch eases to the mean of the polar row (else the pole would be a pinwheel).
function lola( lat, lon ) {

	const fr = ( 90 - lat ) * PER_DEGREE - 0.5;
	const fc = ( lon + 180 ) * PER_DEGREE - 0.5;
	const r0 = Math.floor( fr );
	const c0 = Math.floor( fc );
	const tr = fr - r0;
	const tc = fc - c0;
	let value = 0;
	for ( let i = - 1; i <= 2; i ++ ) {

		const wr = catmull( tr, i );
		let row = 0;
		for ( let j = - 1; j <= 2; j ++ ) row += catmull( tc, j ) * at( r0 + i, c0 + j );
		value += wr * row;

	}

	if ( fr < 1.5 ) value = lerp( northMean, value, smooth( - 0.5, 1.5, fr ) );
	else if ( fr > ROWS - 2.5 ) value = lerp( southMean, value, smooth( ROWS - 0.5, ROWS - 2.5, fr ) );
	return value;

}

function at( row, column ) {

	if ( row < 0 ) {

		row = - 1 - row;
		column += COLUMNS / 2;

	} else if ( row >= ROWS ) {

		row = 2 * ROWS - 1 - row;
		column += COLUMNS / 2;

	}

	column %= COLUMNS;
	if ( column < 0 ) column += COLUMNS;
	return heights[ row * COLUMNS + column ];

}

// The Catmull-Rom weight of the point `i` (-1 to 2) at t between points 0 and 1.
function catmull( t, i ) {

	const t2 = t * t;
	const t3 = t2 * t;
	switch ( i ) {

		case - 1: return 0.5 * ( - t3 + 2 * t2 - t );
		case 0: return 0.5 * ( 3 * t3 - 5 * t2 + 2 );
		case 1: return 0.5 * ( - 3 * t3 + 4 * t2 + t );
		default: return 0.5 * ( t3 - t2 );

	}

}

// Smooth value noise in -1..1 at ( x, y, z ), its lattice a unit apart.
function noise( x, y, z ) {

	const ix = Math.floor( x );
	const iy = Math.floor( y );
	const iz = Math.floor( z );
	const fx = quintic( x - ix );
	const fy = quintic( y - iy );
	const fz = quintic( z - iz );
	const v = ( a, b, c ) => ( hash( ix + a, iy + b, iz + c, 99 ) & 0xffff ) / 0x8000 - 1;
	const x00 = lerp( v( 0, 0, 0 ), v( 1, 0, 0 ), fx );
	const x10 = lerp( v( 0, 1, 0 ), v( 1, 1, 0 ), fx );
	const x01 = lerp( v( 0, 0, 1 ), v( 1, 0, 1 ), fx );
	const x11 = lerp( v( 0, 1, 1 ), v( 1, 1, 1 ), fx );
	return lerp( lerp( x00, x10, fy ), lerp( x01, x11, fy ), fz );

}

// A 32-bit hash of a cube and a salt.
function hash( x, y, z, salt ) {

	let h = Math.imul( x | 0, 0x8da6b343 ) ^ Math.imul( y | 0, 0xd8163841 ) ^ Math.imul( z | 0, 0xcb1ab31f ) ^ Math.imul( salt + 1, 0x9e3779b9 );
	return mix( h );

}

function mix( h ) {

	h = Math.imul( h ^ ( h >>> 16 ), 0x7feb352d );
	h = Math.imul( h ^ ( h >>> 15 ), 0x846ca68b );
	return ( h ^ ( h >>> 16 ) ) >>> 0;

}

// A rotation (row-major 3 × 3) from a seed: three turns about the axes by made-up angles.
function rotation( seed ) {

	const a = ( mix( seed * 7919 ) / 0x100000000 ) * Math.PI * 2;
	const b = ( mix( seed * 104729 ) / 0x100000000 ) * Math.PI * 2;
	const c = ( mix( seed * 1299709 ) / 0x100000000 ) * Math.PI * 2;
	const [ ca, sa, cb, sb, cc, sc ] = [ Math.cos( a ), Math.sin( a ), Math.cos( b ), Math.sin( b ), Math.cos( c ), Math.sin( c ) ];
	// Rz( a ) · Ry( b ) · Rx( c )
	return [
		ca * cb, ca * sb * sc - sa * cc, ca * sb * cc + sa * sc,
		sa * cb, sa * sb * sc + ca * cc, sa * sb * cc - ca * sc,
		- sb, cb * sc, cb * cc,
	];

}

// How much of detail `size` m across to keep with points `finest` m apart: none under twice that,
// all from four times.
function fade( size, finest ) {

	return finest <= 0 ? 1 : smooth( 2 * finest, 4 * finest, size );

}

function smooth( a, b, x ) {

	const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

}

function quintic( t ) {

	return t * t * t * ( t * ( t * 6 - 15 ) + 10 );

}

function lerp( a, b, t ) {

	return a + ( b - a ) * t;

}

// The larger of a and b, rounded off over k.
function softMax( a, b, k ) {

	const h = Math.max( 0, Math.min( 1, 0.5 + 0.5 * ( a - b ) / k ) );
	return b + ( a - b ) * h + k * h * ( 1 - h );

}
