// The leaderboard's boards: one for each period (today, this week, all time, by UTC's days and
// weeks from Monday, as the visit caps count them), for anywhere and for each place. Boards are the
// same for everyone, so each is kept in Cloudflare's cache for BOARD_CACHE s, and dropped from it
// when a score or a name on it changes (in this one of Cloudflare's places; elsewhere it's at most
// BOARD_CACHE s behind). So is each player's own row on it: its rank is a count of the rows ahead,
// which on a big board is a lot of rows for D1 to read (and bill) for one look, again and again.

export const BOARD_CACHE = 30;
const DAY = 24 * 60 * 60 * 1000;

// The key of each period's board at `now` (ms): 'day:2026-10-30', 'week:2026-10-26' (the Monday it
// starts) or 'all'.
export const PERIODS = {
	today: now => `day:${ dateOf( now ) }`,
	week: now => `week:${ dateOf( now - ( ( new Date( now ).getUTCDay() + 6 ) % 7 ) * DAY ) }`,
	all: () => 'all',
};

// Where a board is kept in the cache: `period` is a key from PERIODS, `place` a place's key or '';
// with `player` (an id), where that player's own row on it is.
export function boardKey( url, period, place, player = '' ) {

	const query = new URLSearchParams( { period, place } );
	if ( player ) query.set( 'player', player );
	return new Request( `${ url.origin }/api/leaderboard/board?${ query }` );

}

// Out of the cache, so the next look is fresh: [ [ period, place ] ], and `player`'s own rows on
// them.
export function forgetBoards( url, boards, player ) {

	const keys = boards.flatMap( ( [ period, place ] ) => [ boardKey( url, period, place ), boardKey( url, period, place, player ) ] );
	return Promise.all( keys.map( key => caches.default.delete( key ) ) );

}

// The UTC date, e.g. 2026-10-30.
export function dateOf( time ) {

	return new Date( time ).toISOString().slice( 0, 10 );

}
