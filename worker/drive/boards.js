// The leaderboard's boards: one for each period (today, this week, all time, by UTC's days and
// weeks from Monday, as the visit caps count them), for anywhere and for each place. Boards are the
// same for everyone, so each is kept in Cloudflare's cache for BOARD_CACHE s, and dropped from it
// when a score or a name on it changes (in this one of Cloudflare's places; elsewhere it's at most
// BOARD_CACHE s behind).

export const BOARD_CACHE = 30;
const DAY = 24 * 60 * 60 * 1000;

// The key of each period's board at `now` (ms): 'day:2026-10-30', 'week:2026-10-26' (the Monday it
// starts) or 'all'.
export const PERIODS = {
	today: now => `day:${ dateOf( now ) }`,
	week: now => `week:${ dateOf( now - ( ( new Date( now ).getUTCDay() + 6 ) % 7 ) * DAY ) }`,
	all: () => 'all',
};

// Where a board is kept in the cache: `period` is a key from PERIODS, `place` a place's key or ''.
export function boardKey( url, period, place ) {

	return new Request( `${ url.origin }/api/leaderboard/board?period=${ encodeURIComponent( period ) }&place=${ encodeURIComponent( place ) }` );

}

// Out of the cache, so the next look is fresh: [ [ period, place ] ].
export function forgetBoards( url, boards ) {

	return Promise.all( boards.map( ( [ period, place ] ) => caches.default.delete( boardKey( url, period, place ) ) ) );

}

// The UTC date, e.g. 2026-10-30.
export function dateOf( time ) {

	return new Date( time ).toISOString().slice( 0, 10 );

}
