import { MAX_COUNTS, METRICS, loadBucket, referrerOf } from './stats-protocol.js';

// Play stats (docs/world-drive.md, "Play stats"): the page's counts for the owner's admin page,
// added up here and posted to /api/stats (worker/drive/stats.js) every POST_MS and as the page goes
// out of sight, with the visit's token. Only counts (stats-protocol.js says what may be counted):
// no cookie, nothing kept in the browser, nothing of who. Without a visit (the test pad, the dev
// server alone) it counts nothing.

const POST_MS = 3 * 60000;

// visit: the visit's token, or null. fetch: the browser's (the tests' stand-in).
export function createStats( { visit, fetch: send = ( ...args ) => fetch( ...args ) } ) {

	// 'metric:key' => how many (times can be fractions of a second until posted).
	const counts = new Map();
	let off = typeof visit !== 'string' || ! visit;
	let posting = false;

	function add( metric, key, n = 1 ) {

		if ( off || ! Object.hasOwn( METRICS, metric ) || ! METRICS[ metric ].key( key ) || ! ( n > 0 ) ) return;
		const name = `${ metric }:${ key }`;
		if ( ! counts.has( name ) && counts.size >= MAX_COUNTS ) return;
		counts.set( name, ( counts.get( name ) ?? 0 ) + n );

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
		posting = true;
		let status = 0;
		try {

			status = ( await send( '/api/stats', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { visit, counts: sent } ), keepalive: true,
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
			return;

		}

		if ( status !== 204 ) for ( const [ name, n ] of Object.entries( sent ) ) counts.set( name, ( counts.get( name ) ?? 0 ) + n );

	}

	if ( ! off ) {

		setInterval( post, POST_MS );
		document.addEventListener( 'visibilitychange', () => document.visibilityState === 'hidden' && post() );
		addEventListener( 'pagehide', post );

	}

	return {

		add,
		post,

		// The page opened `ms` after it was asked for (the globe showing), from `referrer`.
		loaded( ms, referrer = document.referrer ) {

			const from = referrerOf( referrer, location.hostname );
			if ( from ) add( 'load', from );
			add( 'load_time', loadBucket( ms ) );
			add( 'load_ms', 'total', Math.min( Math.round( ms ), METRICS.load_ms.most ) );

		},

		get counts() {

			return Object.fromEntries( counts );

		},

	};

}
