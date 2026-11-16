import { MAX_COUNTS, METRICS, deviceOf, droveSteps, loadBucket, referrerOf } from './stats-protocol.js';
import { PLACES_PER_POST, cellOf } from './dropin-cells.js';

// Play stats (docs/world-drive.md, "Play stats"): the page's counts for the owner's admin page,
// added up here and posted to /api/stats (worker/drive/stats.js) every POST_MS and as the page goes
// out of sight, with the visit's token. Only counts (stats-protocol.js says what may be counted):
// no cookie, nothing kept in the browser, nothing of who. Without a visit (the test pad, the dev
// server alone) it counts nothing. Each drop-in's place goes with them, as its cell about a
// kilometre each way (dropin-cells.js), never where in it: "Where people drop in".

const POST_MS = 3 * 60000;

// visit: the visit's token, or null. fetch: the browser's (the tests' stand-in).
export function createStats( { visit, fetch: send = ( ...args ) => fetch( ...args ) } ) {

	// 'metric:key' => how many (times can be fractions of a second until posted).
	const counts = new Map();
	// What's counted once a visit (once), and the seconds driven this visit (drove), for the funnel.
	const counted = new Set();
	let driven = 0;
	// The cells of the drop-ins counted since the last post (at most PLACES_PER_POST: one more waits
	// for nothing, its drop-in is still counted), and those already posted this visit, which the
	// Worker would only count once a day anyway.
	const places = [];
	const placed = new Set();
	let off = typeof visit !== 'string' || ! visit;
	let posting = false;

	function add( metric, key, n = 1 ) {

		if ( off || ! Object.hasOwn( METRICS, metric ) || ! METRICS[ metric ].key( key ) || ! ( n > 0 ) ) return;
		const name = `${ metric }:${ key }`;
		if ( ! counts.has( name ) && counts.size >= MAX_COUNTS ) return;
		counts.set( name, ( counts.get( name ) ?? 0 ) + n );

	}

	// One of `metric:key` the first time this visit, and never again (the funnel's steps, the device,
	// a problem that would otherwise be counted at every tile).
	function once( metric, key ) {

		const name = `${ metric }:${ key }`;
		if ( counted.has( name ) ) return;
		counted.add( name );
		add( metric, key );

	}

	// Posts the whole numbers counted, keeping the fractions; what didn't go (an answer other than
	// 204 that may go later) is added back.
	async function post() {

		if ( off || posting ) return;
		const sent = {};
		for ( const [ name, n ] of counts ) {

			const whole = Math.floor( n );
			if ( whole < 1 ) continue;
			sent[ name ] = whole;
			if ( n > whole ) counts.set( name, n - whole );
			else counts.delete( name );

		}

		if ( ! Object.keys( sent ).length ) return;
		const going = places.splice( 0 );
		posting = true;
		let status = 0;
		try {

			status = ( await send( '/api/stats', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { visit, counts: sent, ...( going.length ? { places: going } : {} ) } ), keepalive: true,
			} ) ).status;

		} catch {

			// Unreachable: tried again with the next post.

		} finally {

			posting = false;

		}

		// Turned away for good (the visit's run out, or no such route): nothing more this visit.
		if ( status === 403 || status === 404 || status === 400 ) {

			off = true;
			counts.clear();
			places.length = 0;
			return;

		}

		if ( status === 204 ) for ( const cell of going ) placed.add( cell );
		else {

			for ( const [ name, n ] of Object.entries( sent ) ) counts.set( name, ( counts.get( name ) ?? 0 ) + n );
			// Back in front of any counted since, with their drop-ins (the Worker takes a place only
			// with its drop-in in the same post), as many as a post carries.
			places.unshift( ...going );
			places.length = Math.min( places.length, PLACES_PER_POST );

		}

	}

	if ( ! off ) {

		setInterval( post, POST_MS );
		document.addEventListener( 'visibilitychange', () => document.visibilityState === 'hidden' && post() );
		addEventListener( 'pagehide', post );

	}

	return {

		add,
		once,
		post,

		// The page opened `ms` after it was asked for (the globe showing: the funnel's first step),
		// from `referrer`, on this device (deviceOf: the main pointer and the screen's size).
		loaded( ms, referrer = document.referrer ) {

			const from = referrerOf( referrer, location.hostname );
			if ( from ) add( 'load', from );
			add( 'load_time', loadBucket( ms ) );
			add( 'load_ms', 'total', Math.min( Math.round( ms ), METRICS.load_ms.most ) );
			once( 'funnel', 'globe' );
			once( 'device', deviceOf( { coarse: matchMedia( '(pointer: coarse)' ).matches, width: screen.width, height: screen.height } ) );

		},

		// `dt` seconds driven (not paused) in `ride` on `world` ('earth' or 'moon'), `together` with
		// others in the room: the play time, and the funnel's steps as this visit's driving passes 1,
		// 10 and 30 minutes.
		drove( ride, world, dt, together ) {

			add( 'play', ride, dt );
			add( 'play_world', world, dt );
			if ( together ) add( 'play_with_others', 'all', dt );
			const before = driven;
			driven += dt;
			for ( const step of droveSteps( before, driven ) ) once( 'funnel', step );

		},

		// A drop-in arrived (driving) at ( lat, lon ) on `world` ('earth' or 'moon'): its place, as its
		// cell, posted with its drop-in's count (the dropin metric, counted beside this). Once a visit
		// for each cell, and no more than PLACES_PER_POST between posts.
		dropped( world, lat, lon ) {

			const cell = cellOf( world, lat, lon );
			if ( off || ! cell || placed.has( cell ) || places.includes( cell ) || places.length >= PLACES_PER_POST ) return;
			places.push( cell );

		},

		get counts() {

			return Object.fromEntries( counts );

		},

		// The places waiting for the next post.
		get places() {

			return [ ...places ];

		},

	};

}
