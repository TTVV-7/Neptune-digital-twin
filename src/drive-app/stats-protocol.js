import { LOOK_PARTS, checkVehicle } from './live-protocol.js';
import { SPOTS } from './places.js';

// Play stats (docs/world-drive.md, "Play stats"): what the page counts (stats.js) and the Worker
// adds up a day (worker/drive/stats.js) for the owner's admin page. Plain data and small functions,
// so the Worker imports it too.
//
// Only counts, never who: no cookie, nothing kept in the browser for it, no id of the visitor or
// their player, no address. A drop-in at somewhere other than a start spot is 'other' (or 'moon' on
// the Moon), never where (a search can be someone's own street), a search is only which kind it was,
// never what was typed, a device only whether it's a phone, a tablet or a computer, and a referring
// site is only its host name.

const ALL = key => key === 'all' ? key : null;
const SPOT_IDS = new Set( SPOTS.map( spot => spot.id ) );
const PARTS = new Set( LOOK_PARTS );
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
// A key that's one of `keys`.
const oneOf = keys => {

	const known = new Set( keys );
	return key => known.has( key ) ? key : null;

};

// Times in buckets, [ under (ms), name ]: from opening the page to the globe, and from Drive here to
// driving.
export const LOAD_BUCKETS = [ [ 2000, 'under 2 s' ], [ 5000, '2-5 s' ], [ 10000, '5-10 s' ], [ 20000, '10-20 s' ], [ Infinity, 'over 20 s' ] ];
export const DROPIN_BUCKETS = [ [ 5000, 'under 5 s' ], [ 10000, '5-10 s' ], [ 20000, '10-20 s' ], [ 40000, '20-40 s' ], [ Infinity, 'over 40 s' ] ];
const names = buckets => buckets.map( ( [ , name ] ) => name );

// How far a visit gets (the funnel), each step counted once a visit as it's reached: the globe shown,
// a place pinned, a drop-in started, driving, and its driving (not paused) passing each of DROVE's
// seconds.
export const DROVE = [ [ 60, 'drove_1m' ], [ 600, 'drove_10m' ], [ 1800, 'drove_30m' ] ];
export const FUNNEL = [ 'globe', 'pin', 'dropin', 'driving', ...names( DROVE ) ];
export const DEVICES = [ 'phone', 'tablet', 'computer' ];
// A search's kind: of the map ('earth'), of the Moon's places ('moon'), coordinates typed; and,
// counted as well as its kind, one that found nothing.
export const SEARCHES = [ 'earth', 'moon', 'coordinates', 'nothing' ];
// What went wrong: no ground at a drop-in (no 3D map there, or the Moon's ground not loading), a
// ride's model not loading (the go-kart driven instead, or no drive), the Moon's files not loading,
// Google's map not loading at all, Google refusing the visit's tiles (its map session over), and a
// drop-in left for the globe before it was driving.
export const PROBLEMS = [ 'no_ground', 'ride_failed', 'moon_failed', 'map_failed', 'map_session_ended', 'drop_abandoned' ];
// A touch screen whose shorter side is at least this (CSS px) is a tablet's (deviceOf).
const TABLET = 600;

// What may be counted, and for each: what its keys may be (a function giving the key cleaned, or
// null), and the most one post may add to it (all its keys together), so a page can't add a day's
// worth at once. Times are seconds, but load_ms (milliseconds).
export const METRICS = {
	// The page was opened (once a visit): from which site ('direct' for none, or this one's own).
	load: { key: key => key === 'direct' || ( typeof key === 'string' && key.length <= 64 && HOST.test( key ) ) ? key : null, most: 1 },
	// How long from opening the page to the globe showing: how many in each bucket, and the
	// milliseconds all together (for the mean).
	load_time: { key: oneOf( names( LOAD_BUCKETS ) ), most: 1 },
	load_ms: { key: key => key === 'total' ? key : null, most: 120000 },
	// Drop-ins: where (a start spot's id, 'moon' anywhere on the Moon, or 'other'), and in which ride.
	dropin: { key: key => SPOT_IDS.has( key ) || key === 'other' || key === 'moon' ? key : null, most: 20 },
	ride: { key: checkVehicle, most: 20 },
	// Seconds driven (not paused), in each ride; and of those, with others in the room.
	play: { key: checkVehicle, most: 600 },
	play_with_others: { key: ALL, most: 600 },
	// The Garage opened, and each change made in it, by part (colour, decal, rim...).
	garage_open: { key: ALL, most: 20 },
	garage_edit: { key: key => PARTS.has( key ) ? key : null, most: 200 },
	// Parties: made (Invite friends) and joined (a party's link opened).
	party: { key: oneOf( [ 'made', 'joined' ] ), most: 5 },
	// How far the visit got (FUNNEL), each step once; and what it's on (deviceOf), once.
	funnel: { key: oneOf( FUNNEL ), most: FUNNEL.length },
	device: { key: oneOf( DEVICES ), most: 1 },
	// The globe turned to the Moon; and seconds driven on each world, as play's.
	world: { key: key => key === 'moon' ? key : null, most: 20 },
	play_world: { key: oneOf( [ 'earth', 'moon' ] ), most: 600 },
	// Searches made, by kind (SEARCHES), never what was typed.
	search: { key: oneOf( SEARCHES ), most: 40 },
	// How long each drop-in took, from Drive here to driving, in buckets; and what went wrong.
	dropin_time: { key: oneOf( names( DROPIN_BUCKETS ) ), most: 20 },
	problem: { key: oneOf( PROBLEMS ), most: 20 },
	// The leaderboard opened, and a nickname picked (a new player); the Supporter Pass's sheet opened,
	// and its Buy followed to Stripe; a level reached.
	board: { key: oneOf( [ 'open', 'named' ] ), most: 20 },
	pass: { key: oneOf( [ 'open', 'buy' ] ), most: 20 },
	level_up: { key: ALL, most: 10 },
};

// The page posts at most this many counts at once (and keeps no more between posts). What a visit
// has between two posts is mostly a few, but can be many: the once-a-visit ones (the load, its time,
// the device and the funnel's seven steps), the fraction of a second of play kept for the next post
// for each ride driven, and a few minutes of drop-ins at different spots in different rides, Garage
// changes, searches and the rest. 100 leaves room for all of that, so a new count is never crowded
// out by the others, and keeps a post well under the Worker's 8 KB (worker/drive/stats.js).
export const MAX_COUNTS = 100;

// The bucket for a load time, and for a drop-in's (ms).
export function loadBucket( ms ) {

	return bucketOf( LOAD_BUCKETS, ms );

}

export function dropinBucket( ms ) {

	return bucketOf( DROPIN_BUCKETS, ms );

}

function bucketOf( buckets, ms ) {

	return buckets.find( ( [ under ] ) => ms < under )[ 1 ];

}

// The funnel's steps (DROVE) a visit's driving passes going from `before` to `after` seconds.
export function droveSteps( before, after ) {

	return DROVE.filter( ( [ seconds ] ) => before < seconds && after >= seconds ).map( ( [ , step ] ) => step );

}

// What a visit is on, from its main pointer and its screen's size (CSS px): a fine pointer (a mouse,
// a trackpad) is a computer's, whatever the screen, and a coarse one (a finger) a tablet's when the
// screen's shorter side is at least TABLET, else a phone's. A laptop's touch screen is a computer (its
// main pointer is the trackpad), and a tablet with a trackpad is too.
export function deviceOf( { coarse, width, height } ) {

	if ( ! coarse ) return 'computer';
	return Math.min( width, height ) >= TABLET ? 'tablet' : 'phone';

}

// The referring site's host for `referrer` (document.referrer) on a page at `host`: 'direct' for
// none or this site itself, else its host name without www., or null when it isn't one.
export function referrerOf( referrer, host ) {

	if ( ! referrer ) return 'direct';
	try {

		const from = new URL( referrer ).hostname.toLowerCase().replace( /^www\./, '' );
		if ( from === host.replace( /^www\./, '' ) ) return 'direct';
		return METRICS.load.key( from );

	} catch {

		return null;

	}

}

// The counts a post says ({ 'metric:key': n }), cleaned: [ [ metric, key, n ] ], each n a whole
// number of at least 1, each metric's together no more than its `most`, or null when it isn't
// counts at all. Counts it doesn't know are left out.
export function checkCounts( counts ) {

	if ( ! counts || typeof counts !== 'object' || Array.isArray( counts ) ) return null;
	const entries = Object.entries( counts );
	if ( entries.length > MAX_COUNTS ) return null;
	const used = new Map();
	const clean = [];
	for ( const [ name, value ] of entries ) {

		const split = name.indexOf( ':' );
		const metric = split > 0 ? name.slice( 0, split ) : '';
		const rule = Object.hasOwn( METRICS, metric ) ? METRICS[ metric ] : null;
		const key = rule?.key( name.slice( split + 1 ) );
		const n = Math.floor( Number( value ) );
		if ( ! key || ! Number.isFinite( n ) || n < 1 ) continue;
		const room = rule.most - ( used.get( metric ) ?? 0 );
		const take = Math.min( n, room );
		if ( take < 1 ) continue;
		used.set( metric, ( used.get( metric ) ?? 0 ) + take );
		clean.push( [ metric, key, take ] );

	}

	return clean;

}
