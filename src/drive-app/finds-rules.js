// The Discoveries' rules (docs/world-drive.md, "Discoveries"): plain functions, nothing of three.js or
// the page, so scripts/test-drive-finds.mjs can check them in node. What a find's card says (every
// word of it built from finds-data.js, finds-heights.js and worlds.js, nothing typed here about any
// one place), when the car has reached one, where the approach spawn puts the car, and what this
// browser keeps of the ones collected. finds.js (the beacons, the pointer, the card and the book) is
// the page's side.

import { FINDS, FINDS_ON, FIND_DATA, FIND_IDS, KINDS, findOf } from './finds-data.js';
import { FIND_HEIGHTS } from './finds-heights.js';
import { PLACES_ON } from './world-places.js';
import { WORLDS } from './worlds.js';

const DEG = Math.PI / 180;

// How near (m) a find has to be reached: in a car, on the ground, CAR; in the air (a plane, falling
// or under a parachute), within AIR along the ground and no more than CEILING over it, so flying over
// one counts but crossing it at cruising height doesn't.
export const REACH = { CAR: 150, AIR: 250, CEILING: 2000 };
// A find counts only once the car has been at least ARM m from it since it was last put down (a
// drop-in, a reset, a respawn, a world changed to): dropping in right on top of one isn't finding it.
// The approach spawn puts the car APPROACH m off, which meets that by itself.
export const ARM = 1000;
export const APPROACH = 2500;
// localStorage's key for the finds collected in this browser: { v: 1, at: { id: ms } }.
export const STORAGE = 'world-drive.finds';

// --- distances ---

// The distance (m) along a sphere of `radius` m between two { lat, lon } (degrees).
export function distance( a, b, radius ) {

	const s = Math.sin( ( b.lat - a.lat ) * DEG / 2 ) ** 2 + Math.cos( a.lat * DEG ) * Math.cos( b.lat * DEG ) * Math.sin( ( b.lon - a.lon ) * DEG / 2 ) ** 2;
	return 2 * radius * Math.asin( Math.min( 1, Math.sqrt( s ) ) );

}

// The bearing (degrees from north, clockwise) from `a` to `b`.
export function bearing( a, b ) {

	const [ p1, p2, dl ] = [ a.lat * DEG, b.lat * DEG, ( b.lon - a.lon ) * DEG ];
	const y = Math.sin( dl ) * Math.cos( p2 );
	const x = Math.cos( p1 ) * Math.sin( p2 ) - Math.sin( p1 ) * Math.cos( p2 ) * Math.cos( dl );
	return ( Math.atan2( y, x ) / DEG + 360 ) % 360;

}

// The point `metres` from `from` on bearing `heading` (degrees), along a sphere of `radius` m.
export function destination( from, heading, metres, radius ) {

	const [ p1, l1, t, d ] = [ from.lat * DEG, from.lon * DEG, heading * DEG, metres / radius ];
	const p2 = Math.asin( Math.sin( p1 ) * Math.cos( d ) + Math.cos( p1 ) * Math.sin( d ) * Math.cos( t ) );
	const l2 = l1 + Math.atan2( Math.sin( t ) * Math.sin( d ) * Math.cos( p1 ), Math.cos( d ) - Math.sin( p1 ) * Math.sin( p2 ) );
	return { lat: p2 / DEG, lon: ( ( l2 / DEG + 540 ) % 360 ) - 180 };

}

// --- reaching one ---

// Whether the car, going from `from` to `to` this frame ({ lat, lon, above (m over the ground),
// flying (in the air: a plane, falling or under a chute) }), has reached `point` ({ lat, lon }) on a
// world of radius `radius`: the closest it came along that step, not just where it ended, so a plane
// at 970 m/s on a slow phone (65 m or more a frame) can't skip over one. `armed`: it has been ARM m
// from it since it was last put down (else nothing counts). Measured on the flat plane touching the
// sphere at the find, which over a few hundred metres is the sphere to well under a metre.
export function collectable( point, { radius, armed = true }, from, to ) {

	if ( ! armed || ! to ) return false;
	const a = local( point, from ?? to, radius );
	const b = local( point, to, radius );
	// The closest point of the step a → b to the find (at the origin), as t along it.
	const [ dx, dy ] = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ];
	const length = dx * dx + dy * dy;
	const t = length > 0 ? Math.min( 1, Math.max( 0, - ( a[ 0 ] * dx + a[ 1 ] * dy ) / length ) ) : 1;
	const closest = Math.hypot( a[ 0 ] + dx * t, a[ 1 ] + dy * t );
	const flying = to.flying || from?.flying;
	if ( ! flying ) return closest <= REACH.CAR;
	const above = ( from?.above ?? to.above ?? 0 ) * ( 1 - t ) + ( to.above ?? 0 ) * t;
	return closest <= REACH.AIR && above <= REACH.CEILING;

}

// `at` in metres east and north of `origin`, on the plane touching a sphere of `radius` there.
function local( origin, at, radius ) {

	const dl = ( ( at.lon - origin.lon + 540 ) % 360 ) - 180;
	return [ dl * DEG * radius * Math.cos( origin.lat * DEG ), ( at.lat - origin.lat ) * DEG * radius ];

}

// The finds on `world` within ARM of `at` ({ lat, lon }): those that don't count yet after the car is
// put down there, until it's been ARM from each (stillNear).
export function nearOnPlacing( world, at ) {

	const radius = WORLDS[ world ]?.radius;
	return new Set( ( FINDS_ON[ world ] ?? [] ).filter( id => distance( placeOf( id ), at, radius ) < ARM ) );

}

// Of `near` (nearOnPlacing's), those the car at `at` is still within ARM of.
export function stillNear( near, world, at ) {

	const radius = WORLDS[ world ]?.radius;
	return new Set( [ ...near ].filter( id => distance( placeOf( id ), at, radius ) < ARM ) );

}

// The place a find marks (its id in the world's *-places.js): { id, name, region, lat, lon, ... }.
export function placeOf( id ) {

	const find = findOf( id );
	return find ? PLACES_ON[ find.world ]?.find( place => place.id === id ) ?? null : null;

}

// --- the approach spawn ---

// Where a drop-in on find `id` puts the car: APPROACH m from it, facing it, from the flattest of
// eight ways round (by `heightAt( lat, lon )`, metres, the world's ground: the least climb and drop
// along the way in), so the first minute is driving up to a glowing beacon. { lat, lon, heading }
// (heading in degrees from north, toward the find), or null for no such find. Without heights
// (heightAt giving null), from the south, facing north.
export function approachFor( id, heightAt = () => null ) {

	const find = findOf( id );
	const place = placeOf( id );
	if ( ! find || ! place ) return null;
	const radius = WORLDS[ find.world ].radius;
	let best = null;
	for ( let i = 0; i < 8; i ++ ) {

		const from = i * 45;
		const start = destination( place, from, APPROACH, radius );
		let rough = 0;
		let last = heightAt( start.lat, start.lon );
		if ( last === null || last === undefined ) {

			rough = i === 4 ? 0 : Infinity;

		} else {

			// Five steps in: the climbs and drops along them, added up.
			for ( let k = 1; k <= 5; k ++ ) {

				const p = destination( place, from, APPROACH * ( 1 - k / 5 ), radius );
				const h = heightAt( p.lat, p.lon ) ?? last;
				rough += Math.abs( h - last );
				last = h;

			}

		}

		if ( ! best || rough < best.rough ) best = { rough, start, from };

	}

	return { lat: best.start.lat, lon: best.start.lon, heading: bearing( best.start, place ) };

}

// --- what the card says ---

// "7.6 km", "570 m": the spacing of `world`'s height grid at its equator.
export function gridSize( world ) {

	const { radius, heights } = WORLDS[ world ];
	const metres = 2 * Math.PI * radius / heights.columns;
	if ( metres >= 1000 ) return `${ String( Math.round( metres / 100 ) / 10 ).replace( /\.0$/, '' ) } km`;
	return `${ Math.round( metres / 10 ) * 10 } m`;

}

// "0.25°", "1/8°": the grid's spacing in degrees.
export function gridDegrees( world ) {

	const degrees = 360 / WORLDS[ world ].heights.columns;
	const per = 1 / degrees;
	return degrees < 0.25 && Number.isInteger( per ) ? `1/${ per }°` : `${ degrees }°`;

}

// "NASA LRO: LOLA heights (0.25° grid, ~7.6 km) and LROC colour": what `world`'s ground is built from.
export function dataLine( world ) {

	const data = FIND_DATA[ world ];
	return data ? `${ data.heights } (${ gridDegrees( world ) } grid, ~${ gridSize( world ) }) and ${ data.picture }` : '';

}

// What `world`'s heights are over, in a sentence: "the Moon's 1,737.4 km reference sphere".
export function datumOf( world ) {

	const { radius, level } = WORLDS[ world ];
	const km = n => formatNumber( Math.round( n / 100 ) / 10 );
	return FIND_DATA[ world ].datum.replace( '{radius}', km( radius ) ).replace( '{level}', level ? `${ km( level[ 0 ] ) } × ${ km( level[ 1 ] ) } km` : '' );

}

// "1,930 m above" or "1,930 m below" (never "−1,930 m below").
export function overUnder( h ) {

	return `${ formatNumber( Math.abs( h ) ) } m ${ h < 0 ? 'below' : 'above' }`;

}

// How much higher (m) than a mountain's beacon the ground round it must reach for heightLine to say
// so: under it, the beacon is on its top as near as the grid can tell.
export const PEAK_GAP = 500;

// The card's height line: "In this map: 1,930 m below the Moon's 1,737.4 km reference sphere." And
// where a published figure sits beside it, why the two differ, in the same line: "MOLA's 1/16° grid
// has it at 21,171 m above; this map's 7.4 km cells average it to 21,160 m."
export function heightLine( id ) {

	const find = findOf( id );
	const measured = FIND_HEIGHTS[ id ];
	if ( ! find || ! measured ) return '';
	let line = `In this map: ${ overUnder( measured.h ) } ${ datumOf( find.world ) }`;
	// A mountain or volcano whose beacon isn't on its top in this data (Mons Huygens's named point
	// is 2 km lower than the summit 10 km off; a volcano's is its caldera): the height is the
	// beacon's, and the highest ground round it is said too, so the line isn't read as the peak's.
	const peak = ( find.kind === 'mountain' || find.kind === 'volcano' ) && measured.km && measured.high - measured.h >= PEAK_GAP;
	line += peak ? ` at the beacon; the highest ground within ${ measured.km } km is ${ overUnder( measured.high ) }.` : '.';
	if ( find.published ) line += ` ${ find.published.by } has it at ${ overUnder( find.published.h ) }; this map's ${ gridSize( find.world ) } cells average it to ${ overUnder( measured.h ) }.`;
	return line;

}

// "Rises 2,800 m from its lowest to its highest point within 60 km.", or '' for a find without one.
export function reliefLine( id ) {

	const measured = FIND_HEIGHTS[ id ];
	if ( ! measured?.km ) return '';
	return `Rises ${ formatNumber( measured.high - measured.low ) } m from its lowest to its highest point within ${ measured.km } km.`;

}

// Every card's honest note about the grid.
export function gridNote( world ) {

	return `The grid is ${ gridSize( world ) }, so narrow peaks and pits read lower or shallower here than they are.`;

}

// Everything the card (and a found tile in the book) says of find `id`: { id, world, name, kind,
// icon, facts: [ text ], seeing ('' for none), height, relief ('' for none), note, data }; null for
// no such find.
export function cardOf( id ) {

	const find = findOf( id );
	const place = placeOf( id );
	if ( ! find || ! place ) return null;
	const kind = KINDS[ find.kind ];
	return {
		id,
		world: find.world,
		name: place.name,
		region: place.region,
		kind: kind.label,
		icon: kind.icon,
		facts: find.facts.map( f => f.text ),
		seeing: find.seeing ? find.seeing.replaceAll( '{grid}', gridSize( find.world ) ) : '',
		height: heightLine( id ),
		relief: reliefLine( id ),
		note: gridNote( find.world ),
		data: dataLine( find.world ),
	};

}

// --- kept in this browser ---

// The finds kept in `text` (localStorage's, as written), { id: ms }, those that aren't finds (any
// longer) dropped; {} for nothing or anything damaged.
export function readStored( text ) {

	let kept = null;
	try {

		kept = JSON.parse( text );

	} catch {

		kept = null;

	}

	const at = kept && kept.v === 1 && kept.at && typeof kept.at === 'object' ? kept.at : {};
	return Object.fromEntries( Object.entries( at ).filter( ( [ id, ms ] ) => FIND_IDS.has( id ) && Number.isFinite( ms ) && ms > 0 ) );

}

export function writeStored( at ) {

	return JSON.stringify( { v: 1, at } );

}

// The finds this browser has (`local`, ids) that the Worker's list (`server`, ids) lacks: sent again,
// so one a cap turned away (a report's, a day's, a claim's) is never lost.
export function missing( local, server ) {

	const has = new Set( server );
	return [ ...local ].filter( id => FIND_IDS.has( id ) && ! has.has( id ) );

}

// How many of `world`'s finds are among `ids`: { have, of }.
export function countIn( ids, world ) {

	const list = FINDS_ON[ world ] ?? [];
	const has = new Set( ids );
	return { have: list.filter( id => has.has( id ) ).length, of: list.length };

}

// The nearest of `world`'s finds to `at` that isn't among `have` (a Set), with its distance (m):
// { id, metres }, or null when every one is found.
export function nearestMissing( world, at, have ) {

	const radius = WORLDS[ world ]?.radius;
	let best = null;
	for ( const id of FINDS_ON[ world ] ?? [] ) {

		if ( have.has( id ) ) continue;
		const metres = distance( placeOf( id ), at, radius );
		if ( ! best || metres < best.metres ) best = { id, metres };

	}

	return best;

}

// "412 km", "850 m".
export function formatDistance( metres ) {

	return metres >= 10000 ? `${ formatNumber( Math.round( metres / 1000 ) ) } km` : metres >= 1000 ? `${ ( metres / 1000 ).toFixed( 1 ) } km` : `${ Math.round( metres / 10 ) * 10 } m`;

}

export function formatNumber( n ) {

	return n.toLocaleString( 'en-CA' );

}

export { FINDS };
