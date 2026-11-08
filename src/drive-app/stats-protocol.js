import { LOOK_PARTS, checkVehicle } from './live-protocol.js';
import { SPOTS } from './places.js';

// Play stats (docs/world-drive.md, "Play stats"): what the page counts (stats.js) and the Worker
// adds up a day (worker/drive/stats.js) for the owner's admin page. Plain data and small functions,
// so the Worker imports it too.
//
// Only counts, never who: no cookie, nothing kept in the browser for it, no id of the visitor or
// their player, no address. A drop-in at somewhere other than a start spot is 'other', never where
// (a search can be someone's own street), and a referring site is only its host name.

// What may be counted, and for each: what its keys may be (a function giving the key cleaned, or
// null), and the most one post may add to it (all its keys together), so a page can't add a day's
// worth at once. Times are seconds, but load_ms (milliseconds).
const ALL = key => key === 'all' ? key : null;
const SPOT_IDS = new Set( SPOTS.map( spot => spot.id ) );
const PARTS = new Set( LOOK_PARTS );
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

export const LOAD_BUCKETS = [ [ 2000, 'under 2 s' ], [ 5000, '2-5 s' ], [ 10000, '5-10 s' ], [ 20000, '10-20 s' ], [ Infinity, 'over 20 s' ] ];
const BUCKET_NAMES = new Set( LOAD_BUCKETS.map( ( [ , name ] ) => name ) );

export const METRICS = {
	// The page was opened (once a visit): from which site ('direct' for none, or this one's own).
	load: { key: key => key === 'direct' || ( typeof key === 'string' && key.length <= 64 && HOST.test( key ) ) ? key : null, most: 1 },
	// How long from opening the page to the globe showing: how many in each bucket, and the
	// milliseconds all together (for the mean).
	load_time: { key: key => BUCKET_NAMES.has( key ) ? key : null, most: 1 },
	load_ms: { key: key => key === 'total' ? key : null, most: 120000 },
	// Drop-ins: where (a start spot's id, or 'other'), and in which ride.
	dropin: { key: key => SPOT_IDS.has( key ) || key === 'other' ? key : null, most: 20 },
	ride: { key: checkVehicle, most: 20 },
	// Seconds driven (not paused), in each ride; and of those, with others in the room.
	play: { key: checkVehicle, most: 600 },
	play_with_others: { key: ALL, most: 600 },
	// The Garage opened, and each change made in it, by part (colour, decal, rim...).
	garage_open: { key: ALL, most: 20 },
	garage_edit: { key: key => PARTS.has( key ) ? key : null, most: 200 },
	// Parties: made (Invite friends) and joined (a party's link opened).
	party: { key: key => key === 'made' || key === 'joined' ? key : null, most: 5 },
};

// The page posts at most this many counts at once.
export const MAX_COUNTS = 60;

// The bucket for a load time (ms).
export function loadBucket( ms ) {

	return LOAD_BUCKETS.find( ( [ under ] ) => ms < under )[ 1 ];

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
