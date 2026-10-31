import { Vector2, Vector3 } from 'three';
import { enuToLocal } from '../geo.js';

// Water on Google's mesh. Google's 3D tiles don't say what's water: a bay, a harbour or a river is
// just more ground, so without this the vehicles drive on the sea. It's told from the ground by
// how Google draws it, which is unlike anything else there: flat as a table (most of it to the
// millimetre), its picture one even colour (a fill, not a photo: no waves, boats' wakes or
// glints), and at the lowest level round about. So a spot is water when, from rays looking down
// round it (see look):
//
// - the ground there is coloured like water (bluish or grey, not green like a field, warm like sand
//   or soil, nor bright like concrete), read from the tile's own picture where the ray hit it;
// - it's level, everywhere within MID's reach of it, to within FLAT;
// - its picture is even over all of that (the colours' brightness varies by no more than EVEN):
//   a road has markings, cars and patches, a field its lines;
// - nothing within FAR's reach is more than LOWER below it: a quay, a pier, a beach or a bridge's
//   deck has the water below it, and a roof the street.
//
// Measured on Google's tiles in Vancouver, San Francisco, Sydney, Paris, Los Angeles, Las Vegas
// and New York (docs/world-drive.md), it never took a road, a car park, a field, a beach, a roof
// or a bridge's deck for water, and found most open water. It prefers missing a little water to a
// false splash: what it can't be sure of (a ray that finds nothing, a picture it can't read) isn't
// water. Nor is water within a ring's reach of a shore, a pier or a ship, which it can't tell from
// an even grey square; there it says it can't tell, rather than that it's dry, so nothing is put
// back or put down there as if it were dry ground (drive.js's trail back from a splash, boost
// pads). The colours are read from a small copy of each tile's picture, drawn once onto a canvas
// and kept as long as the picture is. It looks at the cheapest things first, so on most ground
// it's done after one ray or seven.

const DOWN = new Vector3( 0, - 1, 0 );
// The copy of a tile's picture (px a side): a texel is a metre or two on the ground nearby.
const COPY = 64;
// Rings of rays round the spot (m, and how many), and how far over the spot's height (m) each ray
// starts down from, and how far it looks.
const NEAR = { radius: 5, count: 6, from: 4, depth: 24 };
const MID = { radius: 12, count: 8, from: 4, depth: 24 };
const FAR = { radius: 35, count: 8, from: 10, depth: 110 };
const FLAT = 0.35;
const EVEN = 6;
const LOWER = 1;
// How far (m) past something uneven close by to look for water at the spot's level (see look):
// enough for the rings there to be clear of a shore the spot is right by.
const PROBE = 13;
// Water's colour (0 to 255): no brighter than BRIGHT (luma), its blue at least its red less WARM
// and its green less GREEN.
const BRIGHT = 150;
const WARM = 2;
const GREEN = 6;
// What look() says of ground that is surely dry, and of what it can't tell.
const DRY = Object.freeze( { level: null, dry: true } );
const UNSURE = Object.freeze( { level: null, dry: false } );

const _origin = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _normal = new Vector3();
const _uv = new Vector2();

// ground: World Drive's Ground (spawn.js), whose rays see only the ground.
export function createWater( ground ) {

	// Each picture's copy (its pixels, or null where it couldn't be read), by texture.
	const copies = new WeakMap();
	let context = null;

	function pixels( texture ) {

		if ( copies.has( texture ) ) return copies.get( texture );
		const { image } = texture;
		let data = null;
		// Google's pictures arrive as ImageBitmaps (GLTFLoader), closed when their tile goes: then
		// they have no size.
		if ( image && image.width > 0 && image.height > 0 && ! texture.isCompressedTexture ) {

			try {

				context ??= Object.assign( document.createElement( 'canvas' ), { width: COPY, height: COPY } ).getContext( '2d', { willReadFrequently: true } );
				context.clearRect( 0, 0, COPY, COPY );
				context.drawImage( image, 0, 0, COPY, COPY );
				data = context.getImageData( 0, 0, COPY, COPY ).data;

			} catch {

				// A picture the canvas can't take: no colour, so never water.
				data = null;

			}

		}

		copies.set( texture, data );
		return data;

	}

	// The colour of the picture where a ray hit, as { r, g, b }, or null.
	function colourOf( hit ) {

		const { material } = hit.object;
		const map = ( Array.isArray( material ) ? material[ hit.face?.materialIndex ?? 0 ] : material )?.map;
		if ( ! map?.image || ! hit.uv ) return null;
		const data = pixels( map );
		if ( ! data ) return null;
		// Into the picture's own corner-down frame (glTF's pictures aren't flipped; a canvas is).
		map.transformUv( _uv.copy( hit.uv ) );
		const x = Math.min( COPY - 1, Math.max( 0, Math.floor( _uv.x * COPY ) ) );
		const y = Math.min( COPY - 1, Math.max( 0, Math.floor( _uv.y * COPY ) ) );
		const i = ( y * COPY + x ) * 4;
		return { r: data[ i ], g: data[ i + 1 ], b: data[ i + 2 ] };

	}

	function down( east, north, from, depth ) {

		return ground.cast( enuToLocal( east, north, from, _origin ), DOWN, depth );

	}

	// The heights (m over `h`) round ( east, north ) on `ring`, null where a ray found nothing; with
	// `colours`, the colour where each hit too.
	function round( ring, east, north, h, colours = null ) {

		const heights = [];
		for ( let i = 0; i < ring.count; i ++ ) {

			const angle = ( i + 0.5 ) / ring.count * Math.PI * 2;
			const hit = down( east + Math.sin( angle ) * ring.radius, north + Math.cos( angle ) * ring.radius, h + ring.from, ring.depth );
			heights.push( hit ? hit.point.y - h : null );
			colours?.push( hit ? colourOf( hit ) : null );

		}

		return heights;

	}

	// Whether the ring's heights are all there and within FLAT of the spot's.
	const level = heights => heights.every( dh => dh !== null && Math.abs( dh ) <= FLAT );

	// What's under ( east, north ), looked for down from just over y: { level } the water's surface
	// height (m, in the scene) where it's water, else null; and whether it's surely dry ground: not
	// water-coloured, over something lower, or (a road, a field) uneven close by with no water at
	// its level just past that. What's left, water-coloured and level close by but not all round,
	// is water by a shore, a pier or a ship as often as anything: not water, nor surely dry.
	// `probing`: whether to look past what's uneven close by (not when this is the look past it).
	function look( east, north, y, probing = true ) {

		const hit = down( east, north, y + 2, 40 );
		if ( ! hit ) return UNSURE;
		const colours = [ colourOf( hit ) ];
		if ( ! waterLike( colours[ 0 ] ) ) return DRY;
		const h = hit.point.y;
		const near = round( NEAR, east, north, h, colours );
		// Anything lower close by (or nothing at all, far below): it's over something, not water.
		if ( near.some( dh => dh === null || dh < - FLAT ) ) return DRY;
		if ( ! level( near ) || ! even( colours ) ) {

			// A road's kerbs, cars and markings, or a shore by water. Water being the lowest thing
			// round it, look PROBE m out the other way from what's highest or least like it here: the
			// spot is surely dry unless that's water at its level (it's by the water's edge, then,
			// where the rings reach the shore).
			if ( ! probing ) return DRY;
			const angle = ( away( near, colours ) + 0.5 ) / NEAR.count * Math.PI * 2 + Math.PI;
			const past = look( east + Math.sin( angle ) * PROBE, north + Math.cos( angle ) * PROBE, h, false ).level;
			return past !== null && Math.abs( past - h ) <= FLAT ? UNSURE : DRY;

		}

		const open = level( round( MID, east, north, h, colours ) ) && even( colours );
		// A ray that finds nothing (far below, or nothing loaded) counts as lower.
		if ( ! round( FAR, east, north, h ).every( dh => dh !== null && dh >= - LOWER ) ) return DRY;
		return open ? { level: h, dry: false } : UNSURE;

	}

	return {

		look,

		// The height (m, in the scene) of the water's surface under ( east, north ), looked for down
		// from just over y; null where there's no telling it's water.
		at( east, north, y ) {

			return look( east, north, y ).level;

		},

		// Whether ( east, north ) and the ground `reach` m round it (north, east, south and west) are
		// all surely dry, looked for down from just over y: somewhere for a boost pad, which isn't
		// left by the water's edge either.
		clear( east, north, y, reach ) {

			if ( ! look( east, north, y ).dry ) return false;
			for ( let i = 0; i < 4; i ++ ) if ( ! look( east + Math.sin( i * Math.PI / 2 ) * reach, north + Math.cos( i * Math.PI / 2 ) * reach, y ).dry ) return false;
			return true;

		},

		// Everything look() looks at, for measuring and the tests: the heights round the spot and the
		// colours, with how long it took (ms), and what look() makes of it (level and dry).
		measure( east, north, y ) {

			const begun = performance.now();
			const hit = down( east, north, y + 2, 40 );
			if ( ! hit ) return null;
			const h = hit.point.y;
			const colours = [ colourOf( hit ) ];
			const near = round( NEAR, east, north, h, colours );
			const mid = round( MID, east, north, h, colours );
			const far = round( FAR, east, north, h );
			const known = colours.filter( Boolean );
			const flat = [ ...near, ...mid ].reduce( ( most, dh ) => Math.max( most, dh === null ? Infinity : Math.abs( dh ) ), 0 );
			const lower = far.reduce( ( least, dh ) => Math.min( least, dh ?? - Infinity ), 0 );
			const ms = performance.now() - begun;
			const normal = hit.face ? _normal.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld ).y : 1;
			return {
				h, normal, edge: edge( hit ), near, mid, far, colours, flat, lower,
				mean: known.length ? [ 'r', 'g', 'b' ].map( k => Math.round( known.reduce( ( sum, c ) => sum + c[ k ], 0 ) / known.length ) ) : null,
				spread: spread( known ), waterLike: waterLike( colours[ 0 ] ), even: even( colours ), ms,
				...look( east, north, y ),
			};

		},

	};

}

// Which of a ring's points (by its index) stands out most from the spot at its middle, the first
// of `colours`: the highest over it past FLAT, else the least like it in colour.
function away( heights, colours ) {

	let most = 0;
	let index = 0;
	heights.forEach( ( dh, i ) => {

		const colour = colours[ i + 1 ];
		const off = dh > FLAT ? 1000 + dh : colour && colours[ 0 ] ? Math.abs( luma( colour ) - luma( colours[ 0 ] ) ) : 999;
		if ( off <= most ) return;
		most = off;
		index = i;

	} );
	return index;

}

// Bluish or grey, not green, warm or bright.
function waterLike( colour ) {

	if ( ! colour ) return false;
	const { r, g, b } = colour;
	return luma( colour ) <= BRIGHT && b >= r - WARM && b >= g - GREEN;

}

// All the colours there, and their brightness hardly varying.
function even( colours ) {

	return colours.every( Boolean ) && spread( colours ) <= EVEN;

}

// How much the colours' brightness varies (its standard deviation, 0 to 255).
function spread( colours ) {

	if ( colours.length === 0 ) return Infinity;
	const lumas = colours.map( luma );
	const mean = lumas.reduce( ( sum, l ) => sum + l, 0 ) / lumas.length;
	return Math.sqrt( lumas.reduce( ( sum, l ) => sum + ( l - mean ) ** 2, 0 ) / lumas.length );

}

function luma( { r, g, b } ) {

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;

}

// The longest edge (m) of the triangle a ray hit: Google draws water in big ones.
function edge( { face, object } ) {

	const position = object.geometry?.attributes.position;
	if ( ! face || ! position ) return null;
	_a.fromBufferAttribute( position, face.a ).applyMatrix4( object.matrixWorld );
	_b.fromBufferAttribute( position, face.b ).applyMatrix4( object.matrixWorld );
	_c.fromBufferAttribute( position, face.c ).applyMatrix4( object.matrixWorld );
	return Math.max( _a.distanceTo( _b ), _b.distanceTo( _c ), _c.distanceTo( _a ) );

}
