// node scripts/make-finds.mjs: writes src/drive-app/finds-heights.js, the height of every Discovery
// (src/drive-app/finds-data.js) as the game's own data has it, for the find's card to say ("In this
// map: 1,930 m below the Moon's 1,737.4 km reference sphere"). Run it by hand, as make-moon.mjs is,
// whenever the finds, their places or a world's heights change; scripts/test-drive-finds.mjs measures
// them all again and fails if this file is out of date.
//
// Each height is read from the world's own height.bin (drive/public/<world>/height.bin) the way the
// game reads it (body-height.js's createGround), at the find's place (its id in the world's
// *-places.js), with the finest detail at 10,000 km: so only the measured grid, between its points on
// the same curves the ground uses, and none of the made-up craters and rolling ground added for
// driving close up. Over the Moon's sphere (LOLA's 1,737.4 km) and Mars's areoid (MOLA's, as the data
// comes), as stored; on Vesta and Ceres over the world's `level` spheroid (worlds.js), as level.js's
// levelRadius gives it, so the card and the data lens's scale bar give the same number there. Rounded
// to 10 m: the grid is kilometres apart, so a metre would claim more than it knows.
//
// For a find with a `relief` (km), also the lowest and highest ground within that distance of it, on
// rings of 12 distances and 24 bearings, over the same level: the card's "Rises 5,800 m from its
// lowest to its highest point within 60 km".

import { readFileSync, writeFileSync } from 'node:fs';
import { createGround } from '../src/drive-app/body-height.js';
import { FINDS } from '../src/drive-app/finds-data.js';
import { levelRadius } from '../src/drive-app/level.js';
import { PLACES_ON } from '../src/drive-app/world-places.js';
import { WORLDS } from '../src/drive-app/worlds.js';

const OUT = new URL( '../src/drive-app/finds-heights.js', import.meta.url );
const PUBLIC = new URL( '../drive/public/', import.meta.url );

const heights = measure();
const lines = Object.entries( heights ).map( ( [ id, value ] ) => `\t'${ id }': ${ JSON.stringify( value ).replace( /"(\w+)":/g, '$1: ' ).replace( /,/g, ', ' ).replace( /^{/, '{ ' ).replace( /}$/, ' }' ) },` );
writeFileSync( OUT, `// Made by scripts/make-finds.mjs (run it again, don't edit this): each Discovery's height (m) in the
// game's own height data, at its place, rounded to 10 m: over the Moon's 1,737.4 km sphere, Mars's
// areoid, and Vesta's and Ceres's level spheroids (worlds.js's \`level\`). With a relief, the lowest
// and highest ground within \`km\` of it, over the same.

export const FIND_HEIGHTS = {
${ lines.join( '\n' ) }
};
` );
console.log( `Wrote ${ lines.length } heights to ${ OUT.pathname }` );

// Every find's height, and its relief where it has one: { id: { h, low?, high?, km? } }.
function measure() {

	const grounds = {};
	const out = {};
	for ( const find of FINDS ) {

		const place = PLACES_ON[ find.world ]?.find( p => p.id === find.id );
		if ( ! place ) throw new Error( `${ find.id } isn't a place on ${ find.world }` );
		grounds[ find.world ] ??= groundOf( find.world );
		const at = grounds[ find.world ];
		const value = { h: round( at( place.lat, place.lon ) ) };
		if ( find.relief ) {

			const [ low, high ] = reliefAround( at, find.world, place, find.relief );
			Object.assign( value, { low: round( low ), high: round( high ), km: find.relief } );

		}

		out[ find.id ] = value;

	}

	return out;

}

// The height (m) over `world`'s level (its sphere where it has none) at ( lat, lon ), from the
// measured grid alone.
function groundOf( world ) {

	const info = WORLDS[ world ];
	const ground = createGround( info );
	const file = readFileSync( new URL( `.${ info.heights.url }`, PUBLIC ) );
	ground.setHeights( new Int16Array( file.buffer, file.byteOffset, file.length / 2 ) );
	return ( lat, lon ) => info.radius + ground.heightAt( lat, lon, 1e7 ) - levelRadius( world, lat );

}

// The lowest and highest of `at` within `km` of `place`: 12 distances out to `km`, 24 bearings each,
// along great circles of the world's sphere.
function reliefAround( at, world, place, km ) {

	const radius = WORLDS[ world ].radius;
	let low = Infinity;
	let high = - Infinity;
	for ( let k = 0; k <= 12; k ++ ) {

		for ( let b = 0; b < ( k ? 24 : 1 ); b ++ ) {

			const [ lat, lon ] = destination( place.lat, place.lon, b / 24 * 360, km * 1000 * k / 12, radius );
			const h = at( lat, lon );
			low = Math.min( low, h );
			high = Math.max( high, h );

		}

	}

	return [ low, high ];

}

// The point `distance` m from ( lat, lon ) on bearing `bearing` (degrees from north), on a sphere of
// `radius` m.
function destination( lat, lon, bearing, distance, radius ) {

	const DEG = Math.PI / 180;
	const [ p1, l1, t, d ] = [ lat * DEG, lon * DEG, bearing * DEG, distance / radius ];
	const p2 = Math.asin( Math.sin( p1 ) * Math.cos( d ) + Math.cos( p1 ) * Math.sin( d ) * Math.cos( t ) );
	const l2 = l1 + Math.atan2( Math.sin( t ) * Math.sin( d ) * Math.cos( p1 ), Math.cos( d ) - Math.sin( p1 ) * Math.sin( p2 ) );
	return [ p2 / DEG, ( ( l2 / DEG + 540 ) % 360 ) - 180 ];

}

function round( h ) {

	return Math.round( h / 10 ) * 10;

}
