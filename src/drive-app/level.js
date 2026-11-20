// Which way is up on a world (worlds.js), and the frame a place's scene is in (docs/world-drive.md,
// "Worlds"). On the Earth, the Moon and Mars, up is straight out from the middle of the sphere their
// heights are over (the Earth's: WGS84's normal, 3d-tiles-renderer's own). A small world far from
// round has a `level`, the spheroid [ a, c ] (m) its gravity holds level: Vesta's 285 × 229 km, so
// at its mid-latitudes level ground leans 12° from what a sphere would say. There, up is that
// spheroid's normal where the place is (out from the middle of the sphere: the heights stay on the
// sphere, planetocentric, as the maps have them), east along the parallel and north the rest.
//
// Plain arrays and no three.js: the page (main.js's scene, the challenges' ghosts) and the Worker
// (its checks of routes and ghosts, ghost-rules.js) share it. Positions are in the world's own frame,
// as 3d-tiles-renderer's Ellipsoid has a body: Z through the north pole, X through 0° N 0° E.

import { WORLDS } from './worlds.js';

const DEG = Math.PI / 180;

// Whether `world`'s up is its level spheroid's (only a world with one: on the others the frame is
// the sphere's, as the scene's has always been, and nothing here is used).
export function levelled( world ) {

	return !! WORLDS[ world ]?.level;

}

// The frame at ( lat, lon, height ) on `world` (planetocentric degrees; m over its sphere): { origin,
// east, north, up }, origin the point and the rest unit vectors, in the world's frame.
export function levelFrame( world, lat, lon, height = 0 ) {

	const { radius, level } = WORLDS[ world ];
	const [ phi, lambda ] = [ lat * DEG, lon * DEG ];
	const [ cp, sp, cl, sl ] = [ Math.cos( phi ), Math.sin( phi ), Math.cos( lambda ), Math.sin( lambda ) ];
	const r = radius + height;
	const origin = [ r * cp * cl, r * cp * sl, r * sp ];
	// The spheroid's normal there: the gradient of x²/a² + y²/a² + z²/c² (along the point's direction:
	// its length doesn't matter), or straight out with no spheroid.
	const [ a, c ] = level ?? [ 1, 1 ];
	const up = unit( [ cp * cl / ( a * a ), cp * sl / ( a * a ), sp / ( c * c ) ] );
	const east = [ - sl, cl, 0 ];
	// north = up × east.
	const north = [ up[ 1 ] * east[ 2 ] - up[ 2 ] * east[ 1 ], up[ 2 ] * east[ 0 ] - up[ 0 ] * east[ 2 ], up[ 0 ] * east[ 1 ] - up[ 1 ] * east[ 0 ] ];
	return { origin, east, north, up };

}

// How far (m) from `world`'s middle its level is at planetocentric latitude `lat` (degrees): the
// spheroid's surface in that direction for a world with a `level` (a·c / √((c·cos φ)² + (a·sin φ)²),
// the point of x²/a² + y²/a² + z²/c² = 1 on the ray), else its sphere. A height over the level there
// is ( radius + height over the sphere ) − this. The data lens (lens.js) and the Discoveries' heights
// (scripts/make-finds.mjs) both use it, so the scale bar and a find's card give the same number: on
// Vesta, over the 285 × 229 km spheroid the Dawn team gives heights over, not the sphere the map is
// laid on (whose "heights" are mostly just the asteroid being flattened).
export function levelRadius( world, lat ) {

	const { radius, level } = WORLDS[ world ];
	if ( ! level ) return radius;
	const [ a, c ] = level;
	const phi = lat * DEG;
	return a * c / Math.hypot( c * Math.cos( phi ), a * Math.sin( phi ) );

}

// The point ( lat, lon, height ) on `world`'s sphere, in the world's frame.
export function pointOn( world, lat, lon, height = 0 ) {

	const r = WORLDS[ world ].radius + height;
	const [ phi, lambda ] = [ lat * DEG, lon * DEG ];
	return [ r * Math.cos( phi ) * Math.cos( lambda ), r * Math.cos( phi ) * Math.sin( lambda ), r * Math.sin( phi ) ];

}

// Where `point` (in the world's frame) is in `frame` (levelFrame's): [ east, north, up ] (m).
export function inFrame( frame, point ) {

	const d = [ point[ 0 ] - frame.origin[ 0 ], point[ 1 ] - frame.origin[ 1 ], point[ 2 ] - frame.origin[ 2 ] ];
	const dot = v => v[ 0 ] * d[ 0 ] + v[ 1 ] * d[ 1 ] + v[ 2 ] * d[ 2 ];
	return [ dot( frame.east ), dot( frame.north ), dot( frame.up ) ];

}

function unit( v ) {

	const length = Math.hypot( ...v );
	return [ v[ 0 ] / length, v[ 1 ] / length, v[ 2 ] / length ];

}
