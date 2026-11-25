// World Drive Build Pro's company logo: taking the plain box from behind it (the dashboard,
// src/build-home/main.js, before it's saved), and keeping its see-through edges clean on the
// equipment (src/logo.js). Plain pixel work on { width, height, data } (RGBA, straight alpha, as
// a canvas's getImageData gives it), no DOM, so it runs the same in the page and in Node's tests.
//
// Taking the background out:
//  1. its colour: the dominant colour of the image's outer ring of pixels (up to three close
//     shades of it, for a JPEG's shading or a soft gradient); nothing's done when that ring is
//     mostly see-through already, or when no colour holds enough of it (a photo to its edges);
//  2. a flood fill from every edge pixel through pixels within `tolerance` of that colour, so only
//     background joined to the edge goes: white letters inside a dark logo are kept. `enclosed`
//     also clears every other pixel within tolerance (the hole of an O, a white box's inside);
//  3. specks: islands of a few pixels left in the background (a noisy photo's) go too, each
//     island measured whole, so a big shape is never mistaken for a few;
//  4. the boundary, within EDGE px of what was cleared: each pixel is taken as a mix of the
//     background and the purest logo colour near it, its alpha that mix's share and its colour the
//     logo's own (un-mixed), so no light fringe is left to show on dark paint; a ramp over a band
//     past the tolerance fades the background's own noise out (in alpha only, never darkening it);
//  5. trimmed to what's left, with a little padding, so the logo fills the panel it's put on.

export const TOLERANCE = 40;
export const TOLERANCE_MAX = 120;
// How far (px) from the cleared background the boundary's pixels are un-mixed.
const EDGE = 2;
// How far (px) round a boundary pixel its logo colour is looked for.
const LOOK = 3;
// The ring's dominant colour has to cover this share of it; close shades of it each this share.
const MAIN_SHARE = 0.3;
const SHADE_SHARE = 0.08;
const SHADE_NEAR = 110;
// Below this alpha (0-255) a pixel counts as see-through; a ring this see-through is left alone.
const CLEAR = 128;
const RING_CLEAR = 0.5;

const distance = ( r, g, b, c ) => Math.sqrt( ( r - c[ 0 ] ) ** 2 + ( g - c[ 1 ] ) ** 2 + ( b - c[ 2 ] ) ** 2 );
const smoothstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

export const hex = c => '#' + c.map( v => Math.round( v ).toString( 16 ).padStart( 2, '0' ) ).join( '' );

// The indexes of the image's outer ring of pixels.
function ring( width, height ) {

	const out = [];
	for ( let x = 0; x < width; x ++ ) {

		out.push( x );
		if ( height > 1 ) out.push( ( height - 1 ) * width + x );

	}

	for ( let y = 1; y < height - 1; y ++ ) {

		out.push( y * width );
		if ( width > 1 ) out.push( y * width + width - 1 );

	}

	return out;

}

// The background's colours from the ring: [ [ r, g, b ], ... ], the main one first, or [] when
// none holds enough of it.
export function backgroundColours( { data }, edge, tolerance = TOLERANCE ) {

	let left = edge.filter( i => data[ i * 4 + 3 ] >= CLEAR );
	const total = edge.length;
	const radius = Math.max( tolerance, 8 );
	const colours = [];
	while ( left.length && colours.length < 3 ) {

		// The fullest bin of 16 levels a channel, then the mean of what's near its mean, twice.
		const bins = new Map();
		for ( const i of left ) {

			const key = ( data[ i * 4 ] >> 4 ) << 8 | ( data[ i * 4 + 1 ] >> 4 ) << 4 | data[ i * 4 + 2 ] >> 4;
			bins.set( key, ( bins.get( key ) ?? 0 ) + 1 );

		}

		let top = 0, most = - 1;
		for ( const [ key, count ] of bins ) if ( count > most ) [ top, most ] = [ key, count ];
		let centre = [ ( top >> 8 ) * 16 + 8, ( top >> 4 & 15 ) * 16 + 8, ( top & 15 ) * 16 + 8 ];
		let near = [];
		for ( let pass = 0; pass < 3; pass ++ ) {

			near = left.filter( i => distance( data[ i * 4 ], data[ i * 4 + 1 ], data[ i * 4 + 2 ], centre ) <= radius );
			if ( ! near.length ) break;
			const sum = [ 0, 0, 0 ];
			for ( const i of near ) for ( let c = 0; c < 3; c ++ ) sum[ c ] += data[ i * 4 + c ];
			centre = sum.map( v => v / near.length );

		}

		const share = near.length / total;
		if ( colours.length === 0 ? share < MAIN_SHARE : share < SHADE_SHARE || distance( ...centre, colours[ 0 ] ) > SHADE_NEAR ) break;
		colours.push( centre );
		const taken = new Set( near );
		left = left.filter( i => ! taken.has( i ) );

	}

	return colours;

}

// The image with its background taken out: { image, skipped, colours, removed, empty }. skipped:
// 'transparent' (its edge is see-through already) or 'busy' (no one colour round its edge); then
// image is the one given, untouched. removed: the share of its pixels made see-through. empty: the
// tolerance took everything (image is then the one given).
export function removeBackground( image, { tolerance = TOLERANCE, enclosed = false } = {} ) {

	const { width, height, data } = image;
	const n = width * height;
	const edge = ring( width, height );
	const clearRing = edge.filter( i => data[ i * 4 + 3 ] < CLEAR ).length;
	if ( clearRing >= edge.length * RING_CLEAR ) return { image, skipped: 'transparent', colours: [], removed: 0, empty: false };
	const colours = backgroundColours( image, edge, tolerance );
	if ( ! colours.length ) return { image, skipped: 'busy', colours: [], removed: 0, empty: false };

	// Each pixel's distance from the nearest background colour, and which one.
	const far = new Float32Array( n );
	const nearest = new Uint8Array( n );
	for ( let i = 0; i < n; i ++ ) {

		let best = Infinity;
		for ( let c = 0; c < colours.length; c ++ ) {

			const d = distance( data[ i * 4 ], data[ i * 4 + 1 ], data[ i * 4 + 2 ], colours[ c ] );
			if ( d < best ) [ best, nearest[ i ] ] = [ d, c ];

		}

		far[ i ] = data[ i * 4 + 3 ] < 16 ? 0 : best;

	}

	// The flood from the edge, four ways (eight would slip between a thin outline's corners).
	const cleared = new Uint8Array( n );
	const queue = new Int32Array( n );
	let head = 0, tail = 0;
	for ( const i of edge ) if ( far[ i ] <= tolerance && ! cleared[ i ] ) {

		cleared[ i ] = 1;
		queue[ tail ++ ] = i;

	}

	while ( head < tail ) {

		const i = queue[ head ++ ];
		const x = i % width;
		for ( const j of [ x > 0 ? i - 1 : - 1, x < width - 1 ? i + 1 : - 1, i - width, i + width ] ) {

			if ( j < 0 || j >= n || cleared[ j ] || far[ j ] > tolerance ) continue;
			cleared[ j ] = 1;
			queue[ tail ++ ] = j;

		}

	}

	if ( enclosed ) for ( let i = 0; i < n; i ++ ) if ( far[ i ] <= tolerance ) cleared[ i ] = 1;

	// Specks: what's kept in islands of `speck` pixels or fewer (eight ways) goes too. Each island is
	// followed to its end before it's judged, so a big shape is never cut into pieces that look small.
	const speck = Math.max( 3, Math.round( n * 0.00004 ) );
	const seen = new Uint8Array( n );
	for ( let s = 0; s < n; s ++ ) {

		if ( cleared[ s ] || seen[ s ] ) continue;
		head = tail = 0;
		queue[ tail ++ ] = s;
		seen[ s ] = 1;
		while ( head < tail ) {

			const i = queue[ head ++ ];
			const x = i % width, y = ( i - x ) / width;
			for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {

				const xx = x + dx, yy = y + dy;
				if ( xx < 0 || yy < 0 || xx >= width || yy >= height ) continue;
				const j = yy * width + xx;
				if ( cleared[ j ] || seen[ j ] ) continue;
				seen[ j ] = 1;
				queue[ tail ++ ] = j;

			}

		}

		if ( tail <= speck ) for ( let k = 0; k < tail; k ++ ) cleared[ queue[ k ] ] = 1;

	}

	const out = new Uint8ClampedArray( data );
	let removed = 0;
	for ( let i = 0; i < n; i ++ ) if ( cleared[ i ] ) {

		out[ i * 4 + 3 ] = 0;
		removed ++;

	}

	// The boundary: un-mixed from the background.
	const band = Math.max( 16, tolerance * 0.75 );
	for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

		const i = y * width + x;
		if ( cleared[ i ] ) continue;
		let touches = false;
		for ( let dy = - EDGE; dy <= EDGE && ! touches; dy ++ ) for ( let dx = - EDGE; dx <= EDGE; dx ++ ) {

			const xx = x + dx, yy = y + dy;
			if ( xx >= 0 && yy >= 0 && xx < width && yy < height && cleared[ yy * width + xx ] ) {

				touches = true;
				break;

			}

		}

		if ( ! touches ) continue;
		const B = colours[ nearest[ i ] ];
		const C = [ data[ i * 4 ], data[ i * 4 + 1 ], data[ i * 4 + 2 ] ];
		// The purest logo colour near it: the kept pixel farthest from this background colour.
		let F = C, best = distance( ...C, B );
		for ( let dy = - LOOK; dy <= LOOK; dy ++ ) for ( let dx = - LOOK; dx <= LOOK; dx ++ ) {

			const xx = x + dx, yy = y + dy;
			if ( xx < 0 || yy < 0 || xx >= width || yy >= height ) continue;
			const j = yy * width + xx;
			if ( cleared[ j ] ) continue;
			const d = distance( data[ j * 4 ], data[ j * 4 + 1 ], data[ j * 4 + 2 ], B );
			if ( d > best ) [ best, F ] = [ d, [ data[ j * 4 ], data[ j * 4 + 1 ], data[ j * 4 + 2 ] ] ];

		}

		// C = a F + ( 1 - a ) B: a is C's share along B → F.
		const fb = [ F[ 0 ] - B[ 0 ], F[ 1 ] - B[ 1 ], F[ 2 ] - B[ 2 ] ];
		const span = fb[ 0 ] ** 2 + fb[ 1 ] ** 2 + fb[ 2 ] ** 2;
		let share = span > 1 ? ( ( C[ 0 ] - B[ 0 ] ) * fb[ 0 ] + ( C[ 1 ] - B[ 1 ] ) * fb[ 1 ] + ( C[ 2 ] - B[ 2 ] ) * fb[ 2 ] ) / span : 1;
		share = Math.min( 1, Math.max( 0, share ) );
		// The ramp past the tolerance fades it out (alpha only: its colour is still un-mixed by its
		// share, so a pale logo just past the tolerance isn't given a dark rim).
		const a = share * smoothstep( tolerance, tolerance + band, far[ i ] );
		if ( a < 1 / 255 ) {

			out[ i * 4 + 3 ] = 0;
			removed ++;
			continue;

		}

		// Its own colour, the background taken back out of it.
		for ( let c = 0; c < 3; c ++ ) out[ i * 4 + c ] = share < 0.25 ? F[ c ] : B[ c ] + ( C[ c ] - B[ c ] ) / share;
		out[ i * 4 + 3 ] = Math.round( data[ i * 4 + 3 ] * a );

	}

	const trimmed = trim( { width, height, data: out } );
	if ( ! trimmed ) return { image, skipped: null, colours, removed: 1, empty: true };
	return { image: trimmed, skipped: null, colours, removed: removed / n, empty: false };

}

// Cropped to its pixels that show (alpha 10 or more), padded by 2 % of the larger side (2 px at
// least), or null when nothing shows.
export function trim( { width, height, data } ) {

	let x0 = width, y0 = height, x1 = - 1, y1 = - 1;
	for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

		if ( data[ ( y * width + x ) * 4 + 3 ] < 10 ) continue;
		if ( x < x0 ) x0 = x;
		if ( x > x1 ) x1 = x;
		if ( y < y0 ) y0 = y;
		if ( y > y1 ) y1 = y;

	}

	if ( x1 < 0 ) return null;
	const pad = Math.max( 2, Math.round( 0.02 * Math.max( x1 - x0 + 1, y1 - y0 + 1 ) ) );
	x0 = Math.max( 0, x0 - pad );
	y0 = Math.max( 0, y0 - pad );
	x1 = Math.min( width - 1, x1 + pad );
	y1 = Math.min( height - 1, y1 + pad );
	const w = x1 - x0 + 1, h = y1 - y0 + 1;
	const out = new Uint8ClampedArray( w * h * 4 );
	for ( let y = 0; y < h; y ++ ) out.set( data.subarray( ( ( y0 + y ) * width + x0 ) * 4, ( ( y0 + y ) * width + x0 + w ) * 4 ), y * w * 4 );
	return { width: w, height: h, data: out, x: x0, y: y0 };

}

// For the texture on the equipment: every fully see-through pixel given the colour of the nearest
// pixel that shows (a fill outward from them), in place. A saved PNG's see-through pixels come back
// black (a canvas keeps none of their colour), and a texture's filtering and smaller mip levels
// blend in its neighbours' colour whatever their alpha: black there would ring the logo in a dark
// line on yellow paint, white a light one on dark. Returns data.
export function bleedColours( { width, height, data } ) {

	const n = width * height;
	const done = new Uint8Array( n );
	const queue = new Int32Array( n );
	let head = 0, tail = 0;
	for ( let i = 0; i < n; i ++ ) if ( data[ i * 4 + 3 ] > 0 ) {

		done[ i ] = 1;
		queue[ tail ++ ] = i;

	}

	if ( ! tail ) return data;
	while ( head < tail ) {

		const i = queue[ head ++ ];
		const x = i % width;
		for ( const j of [ x > 0 ? i - 1 : - 1, x < width - 1 ? i + 1 : - 1, i - width, i + width ] ) {

			if ( j < 0 || j >= n || done[ j ] ) continue;
			done[ j ] = 1;
			data[ j * 4 ] = data[ i * 4 ];
			data[ j * 4 + 1 ] = data[ i * 4 + 1 ];
			data[ j * 4 + 2 ] = data[ i * 4 + 2 ];
			queue[ tail ++ ] = j;

		}

	}

	return data;

}
