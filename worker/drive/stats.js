import { HttpError, isObject, json, list, readJson } from '../http.js';
import { checkCounts } from '../../src/drive-app/stats-protocol.js';
import { dayOf } from '../../src/drive-app/levels.js';
import { currentAccount } from './accounts.js';
import { database } from './players.js';
import { KEEP as KEEP_SCORES } from './scores.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';

// Play stats (docs/world-drive.md, "Play stats"): counts a day in D1's stats_daily, for the owner's
// admin page (drive/public/admin.html). The page counts what's played (src/drive-app/stats.js) and
// posts it every few minutes and as it goes out of sight; visits are counted here as /api/visit
// hands them out. Only counts: nothing of who (src/drive-app/stats-protocol.js), so no cookie and
// no consent banner. The admin page is also told what the leaderboard's and the Supporter Pass's own
// tables say of each day (FACTS) and how many there are now (TOTALS), counted as it asks.
//
// Settings: ADMIN_EMAILS (a secret or var, comma-separated): the Google accounts that may see the
// stats, signed in on worlddrive.app. STATS_POSTS: the rate limiter binding for each visit's posts.

// The most days the admin page asks for (a year), and how long rows are kept: two of those, so a
// year can be compared with the year before it.
const MOST_DAYS = 365;
const KEEP_DAYS = 2 * MOST_DAYS;
const DAY = 24 * 60 * 60 * 1000;

// What the admin page is told of each day from the leaderboard's and the Supporter Pass's own tables,
// counted as it asks (nothing more is kept for it): [ metric, SQL giving day, key, n for the times
// from ?1 to before ?2 (ms) ], each grouped by the UTC day of created_at. Only counts: nobody's name,
// email or id leaves these.
const FACTS = [
	// New nicknames: the players made (and not since removed by the owner).
	[ 'players', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, 'new' AS key, COUNT(*) AS n FROM players
		WHERE created_at >= ?1 AND created_at < ?2 GROUP BY day` ],
	// Scores that made a new best on a board: the scores log has only those, and only for KEEP_SCORES.
	[ 'scores', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, 'new_best' AS key, COUNT(*) AS n FROM scores
		WHERE created_at >= ?1 AND created_at < ?2 GROUP BY day` ],
	// Google accounts signed in for the first time.
	[ 'accounts', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, 'new' AS key, COUNT(*) AS n FROM accounts
		WHERE created_at >= ?1 AND created_at < ?2 GROUP BY day` ],
	// Passes recorded and not taken back, by status ('paid', or 'granted' by hand), and their money by
	// currency, in its smallest unit (cents): a refund or a chargeback takes a purchase out of both.
	[ 'purchases', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, status AS key, COUNT(*) AS n FROM purchases
		WHERE refunded_at IS NULL AND created_at >= ?1 AND created_at < ?2 GROUP BY day, status` ],
	[ 'revenue', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, currency AS key, SUM( amount ) AS n FROM purchases
		WHERE refunded_at IS NULL AND amount IS NOT NULL AND currency IS NOT NULL AND created_at >= ?1 AND created_at < ?2 GROUP BY day, currency` ],
];

// How many there are now: players, Google accounts, the accounts with the pass (hasPass: bought and
// not refunded, or in SUPPORTER_EMAILS), and passes not taken back that nobody has signed in for yet
// (bought before signing in, or given by hand, to an email no account has).
const TOTALS = `SELECT ( SELECT COUNT(*) FROM players ) AS players, ( SELECT COUNT(*) FROM accounts ) AS accounts,
	( SELECT COUNT(*) FROM accounts x WHERE ${ hasPass( 'x.id', '?1' ) } ) AS supporters,
	( SELECT COUNT(*) FROM purchases p WHERE p.refunded_at IS NULL AND p.account_id IS NULL
		AND NOT EXISTS ( SELECT 1 FROM accounts WHERE email = p.email ) ) AS unclaimed`;

// Adds [ [ metric, key, n ] ] to `day`'s counts: one upsert a row, in one go.
async function add( db, day, counts ) {

	if ( ! counts.length ) return;
	const upsert = db.prepare( 'INSERT INTO stats_daily ( day, metric, key, n ) VALUES ( ?, ?, ?, ? ) ON CONFLICT ( day, metric, key ) DO UPDATE SET n = n + excluded.n' );
	await db.batch( counts.map( ( [ metric, key, n ] ) => upsert.bind( day, metric, key, n ) ) );

}

// POST /api/stats { visit, counts: { 'metric:key': n } }: what this visit played since its last
// post. 204, whatever it counted: a page doesn't need to know. Only with the visit's token (so only
// from visits that passed the robot check), held to STATS_POSTS a minute for each visit.
export async function postStats( { request, env, now } ) {

	const body = await readJson( request, 8192 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );
	const counts = checkCounts( body.counts );
	if ( ! counts ) throw new HttpError( 400, 'Bad request' );
	const visit = await readVisit( env, body.visit, now );
	if ( ! visit ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	if ( env.STATS_POSTS && ! ( await env.STATS_POSTS.limit( { key: visit.id } ) ).success ) {

		throw new HttpError( 429, 'Too many. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

	await add( database( env ), dayOf( now ), counts );
	return new Response( null, { status: 204 } );

}

// A visit handed out at `now`: counted for the day and its hour (UTC). Never in the visit's way: a
// count that fails is only logged.
export async function countVisit( env, now ) {

	try {

		if ( ! env.DB ) return;
		const hour = String( new Date( now ).getUTCHours() ).padStart( 2, '0' );
		await add( env.DB, dayOf( now ), [ [ 'visit', 'all', 1 ], [ 'visit_hour', hour, 1 ] ] );

	} catch ( err ) {

		console.error( 'Stats', err?.name, err?.message );

	}

}

// Whether `account` ({ email }) may see the stats: its email in ADMIN_EMAILS (any case).
export function isAdmin( env, account ) {

	const email = typeof account?.email === 'string' ? account.email.toLowerCase() : '';
	return !! email && list( env.ADMIN_EMAILS ).includes( email );

}

// GET /api/admin/stats?days=30, for the last `days` UTC days, today's (so far) included (30 if
// unset, at most MOST_DAYS):
//   { from, to, rows: [ [ day, metric, key, n ] ],
//     previous: { from, to, rows: [ [ metric, key, n ] ] },
//     totals: { players, accounts, supporters, unclaimed }, kept: { stats, scores } }
// rows: the page's and the visits' counts a day (stats_daily) and FACTS's, alike. previous: the same
// for the as many days before those, added up over them (what the page compares with: summed here,
// so a year's comparison is a few hundred rows, not tens of thousands). totals: TOTALS's, now. kept:
// how many days back the counts and the scores log go. 401 without a signed-in account, 403 for one
// not in ADMIN_EMAILS. Rows older than KEEP_DAYS go as it's asked. Every query is bounded by the days
// asked for (stats_daily by its key, the scores log by its index on created_at; players, accounts and
// purchases have none on it, and are read through, which for the owner's occasional look is a few
// thousand rows), but TOTALS, which counts the tables whole.
export async function adminStats( context ) {

	const { env, url, now } = context;
	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	if ( ! isAdmin( env, account ) ) throw new HttpError( 403, 'Not an admin' );
	const db = database( env );
	const days = Math.min( MOST_DAYS, Math.max( 1, Math.floor( Number( url.searchParams.get( 'days' ) ) ) || 30 ) );
	const to = dayOf( now );
	const from = dayOf( now - ( days - 1 ) * DAY );
	const before = { from: dayOf( now - ( 2 * days - 1 ) * DAY ), to: dayOf( now - days * DAY ) };
	// The facts from the first moment of the previous period to the end of today, in ms.
	const start = Date.parse( `${ before.from }T00:00:00Z` );
	const end = Date.parse( `${ to }T00:00:00Z` ) + DAY;
	context.ctx?.waitUntil?.( db.prepare( 'DELETE FROM stats_daily WHERE day < ?' ).bind( dayOf( now - KEEP_DAYS * DAY ) ).run().catch( () => {} ) );
	const [ counts, earlier, totals, ...facts ] = await db.batch( [
		db.prepare( 'SELECT day, metric, key, n FROM stats_daily WHERE day >= ? AND day <= ? ORDER BY day' ).bind( from, to ),
		db.prepare( 'SELECT metric, key, SUM( n ) AS n FROM stats_daily WHERE day >= ? AND day <= ? GROUP BY metric, key' ).bind( before.from, before.to ),
		db.prepare( TOTALS ).bind( supporterEmails( env ) ),
		...FACTS.map( ( [ , sql ] ) => db.prepare( sql ).bind( start, end ) ),
	] );
	const rows = counts.results.map( r => [ r.day, r.metric, r.key, r.n ] );
	// The previous period's facts added up by metric and key, as its counts are.
	const previous = new Map( earlier.results.map( r => [ `${ r.metric }:${ r.key }`, [ r.metric, r.key, r.n ] ] ) );
	facts.forEach( ( { results }, i ) => {

		const metric = FACTS[ i ][ 0 ];
		for ( const { day, key, n } of results ) {

			if ( day >= from ) rows.push( [ day, metric, key, n ] );
			else {

				const name = `${ metric }:${ key }`;
				if ( previous.has( name ) ) previous.get( name )[ 2 ] += n;
				else previous.set( name, [ metric, key, n ] );

			}

		}

	} );
	rows.sort( ( a, b ) => a[ 0 ] < b[ 0 ] ? - 1 : a[ 0 ] > b[ 0 ] ? 1 : 0 );
	const { players, accounts, supporters, unclaimed } = totals.results[ 0 ];
	return json( {
		from, to, rows,
		previous: { ...before, rows: [ ...previous.values() ] },
		totals: { players, accounts, supporters, unclaimed },
		kept: { stats: KEEP_DAYS, scores: KEEP_SCORES / DAY },
	} );

}
