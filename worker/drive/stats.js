import { HttpError, isObject, json, readJson } from '../http.js';
import { checkCounts } from '../../src/drive-app/stats-protocol.js';
import { checkPlaces } from '../../src/drive-app/dropin-cells.js';
import { dayOf } from '../../src/drive-app/levels.js';
import { KEEP_DAYS, adminAccount, askedDays } from './admin.js';
import { recordPlaces } from './dropins.js';
import { database } from './players.js';
import { KEEP as KEEP_SCORES } from './scores.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';
import { OFF_EARTH } from '../../src/drive-app/worlds.js';

// Play stats (docs/world-drive.md, "Play stats"): counts a day in D1's stats_daily, for the owner's
// admin page (drive/public/admin.html). The page counts what's played (src/drive-app/stats.js) and
// posts it every few minutes and as it goes out of sight; visits are counted here as /api/visit
// hands them out. Only counts: nothing of who (src/drive-app/stats-protocol.js), so no cookie and
// no consent banner. The admin page is also told what the leaderboard's and the Supporter Pass's own
// tables say of each day (FACTS) and how many there are now (TOTALS), counted as it asks.
//
// A post carries the places of the drop-ins it counts too (dropins.js): where people drop in, to
// about a kilometre, for the admin page's heat map, at no request of its own.
//
// Settings: ADMIN_EMAILS (a secret or var, comma-separated): the Google accounts that may see the
// stats, signed in on worlddrive.app (admin.js). STATS_POSTS: the rate limiter binding for each
// visit's posts; ADMIN_LOOKS the admin page's asks' (admin.js).

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
	// Accounts made: Google accounts signed in for the first time, and accounts made with a username.
	[ 'accounts', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, 'new' AS key, COUNT(*) AS n FROM accounts
		WHERE created_at >= ?1 AND created_at < ?2 GROUP BY day` ],
	// Passes recorded and not taken back, by status ('paid', or 'granted' by hand), and their money by
	// currency, in its smallest unit (cents): a refund or a chargeback takes a purchase out of both.
	[ 'purchases', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, status AS key, COUNT(*) AS n FROM purchases
		WHERE refunded_at IS NULL AND created_at >= ?1 AND created_at < ?2 GROUP BY day, status` ],
	[ 'revenue', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, currency AS key, SUM( amount ) AS n FROM purchases
		WHERE refunded_at IS NULL AND amount IS NOT NULL AND currency IS NOT NULL AND created_at >= ?1 AND created_at < ?2 GROUP BY day, currency` ],
];

// How many there are now: players, accounts (all of them, and by how they sign in: with Google only,
// with a username and password only, or both: logins.js), the accounts with the pass (hasPass:
// bought and not refunded, or in SUPPORTER_EMAILS), and passes not taken back that nobody has
// signed in for yet (bought before signing in, or given by hand, to an email no account has; an
// account with no Google account has no email, '', which claims nothing). Counts only.
const TOTALS = `SELECT ( SELECT COUNT(*) FROM players ) AS players, ( SELECT COUNT(*) FROM accounts ) AS accounts,
	( SELECT COUNT(*) FROM accounts a WHERE a.google_sub NOT LIKE 'none:%' AND NOT EXISTS ( SELECT 1 FROM logins WHERE account_id = a.id ) ) AS google_only,
	( SELECT COUNT(*) FROM accounts a JOIN logins l ON l.account_id = a.id WHERE a.google_sub LIKE 'none:%' ) AS password_only,
	( SELECT COUNT(*) FROM accounts a JOIN logins l ON l.account_id = a.id WHERE a.google_sub NOT LIKE 'none:%' ) AS both_ways,
	( SELECT COUNT(*) FROM accounts x WHERE ${ hasPass( 'x.id', '?1' ) } ) AS supporters,
	( SELECT COUNT(*) FROM purchases p WHERE p.refunded_at IS NULL AND p.account_id IS NULL
		AND NOT EXISTS ( SELECT 1 FROM accounts WHERE email = p.email AND email <> '' ) ) AS unclaimed`;

// Adds [ [ metric, key, n ] ] to `day`'s counts: one upsert a row, in one go.
async function add( db, day, counts ) {

	if ( ! counts.length ) return;
	const upsert = db.prepare( 'INSERT INTO stats_daily ( day, metric, key, n ) VALUES ( ?, ?, ?, ? ) ON CONFLICT ( day, metric, key ) DO UPDATE SET n = n + excluded.n' );
	await db.batch( counts.map( ( [ metric, key, n ] ) => upsert.bind( day, metric, key, n ) ) );

}

// POST /api/stats { visit, counts: { 'metric:key': n }, places: [ cell ] }: what this visit played
// since its last post, and where its drop-ins in it were (dropin-cells.js's cells, each with its
// drop-in in counts; dropins.js). 204, whatever it counted: a page doesn't need to know. Only with
// the visit's token (so only from visits that passed the robot check), held to STATS_POSTS a minute
// for each visit.
export async function postStats( context ) {

	const { request, env, now } = context;
	const body = await readJson( request, 8192 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );
	const counts = checkCounts( body.counts );
	if ( ! counts ) throw new HttpError( 400, 'Bad request' );
	const places = checkPlaces( body.places, counts );
	if ( ! places ) throw new HttpError( 400, 'Bad request' );
	const visit = await readVisit( env, body.visit, now );
	if ( ! visit ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	if ( env.STATS_POSTS && ! ( await env.STATS_POSTS.limit( { key: visit.id } ) ).success ) {

		throw new HttpError( 429, 'Too many. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

	await add( database( env ), dayOf( now ), counts );
	await recordPlaces( context, visit, places );
	return new Response( null, { status: 204 } );

}

// The kinds of visit countVisit counts (metric 'visit_kind'): on the Earth ('earth', a supporter's
// 'earth_supporter'), the owner's, on a free world opened on a link to it ('moon_link',
// 'mars_link'), and on the Moon over the day's cap for everyone or the visitor's own (the page opens
// on the Moon instead).
const VISIT_KINDS = new Set( [ 'earth', 'earth_supporter', 'owner', ...OFF_EARTH.map( world => `${ world }_link` ), 'moon_daily_cap', 'moon_visitor_cap' ] );

// A visit handed out at `now`: counted for the day and its hour (UTC). Never in the visit's way: a
// count that fails is only logged.
export async function countVisit( env, now, kind = '' ) {

	try {

		if ( ! env.DB ) return;
		const hour = String( new Date( now ).getUTCHours() ).padStart( 2, '0' );
		const counts = [ [ 'visit', 'all', 1 ], [ 'visit_hour', hour, 1 ] ];
		// Where the visit went (VISIT_KINDS): the Earth, or another world and why.
		if ( VISIT_KINDS.has( kind ) ) counts.push( [ 'visit_kind', kind, 1 ] );
		await add( env.DB, dayOf( now ), counts );

	} catch ( err ) {

		console.error( 'Stats', err?.name, err?.message );

	}

}

// GET /api/admin/stats?days=30, for the last `days` UTC days, today's (so far) included (30 if
// unset, at most a year: admin.js's askedDays):
//   { from, to, rows: [ [ day, metric, key, n ] ],
//     previous: { from, to, rows: [ [ metric, key, n ] ] },
//     totals: { players, accounts, kinds: { google, password, both }, supporters, unclaimed },
//     kept: { stats, scores } }
// rows: the page's and the visits' counts a day (stats_daily) and FACTS's, alike. previous: the same
// for the as many days before those, added up over them (what the page compares with: summed here,
// so a year's comparison is a few hundred rows, not tens of thousands). totals: TOTALS's, now. kept:
// how many days back the counts and the scores log go. 401 without a signed-in account, 403 for one
// not in ADMIN_EMAILS, 429 past ADMIN_LOOKS a minute (admin.js). Rows older than KEEP_DAYS go as
// it's asked. Every query is bounded by the days asked for (stats_daily by its key, the scores log
// by its index on created_at; players, accounts and purchases have none on it, and are read
// through, which for the owner's occasional look is a few thousand rows), but TOTALS, which counts
// the tables whole.
export async function adminStats( context ) {

	const { env, url, now } = context;
	await adminAccount( context );
	const db = database( env );
	const days = askedDays( url );
	const to = dayOf( now );
	const from = dayOf( now - ( days - 1 ) * DAY );
	const before = { from: dayOf( now - ( 2 * days - 1 ) * DAY ), to: dayOf( now - days * DAY ) };
	// The facts from the first moment of the previous period to the end of today, in ms.
	const start = Date.parse( `${ before.from }T00:00:00Z` );
	const end = Date.parse( `${ to }T00:00:00Z` ) + DAY;
	context.ctx?.waitUntil?.( db.prepare( 'DELETE FROM stats_daily WHERE day < ?' ).bind( dayOf( now - KEEP_DAYS * DAY ) ).run().catch( () => {} ) );
	const [ counts, earlier, firsts, totals, ...facts ] = await db.batch( [
		db.prepare( 'SELECT day, metric, key, n FROM stats_daily WHERE day >= ? AND day <= ? ORDER BY day' ).bind( from, to ),
		db.prepare( 'SELECT metric, key, SUM( n ) AS n FROM stats_daily WHERE day >= ? AND day <= ? GROUP BY metric, key' ).bind( before.from, before.to ),
		db.prepare( `SELECT metric, MIN( day ) AS first FROM stats_daily WHERE day >= ? AND day <= ? AND metric IN ( 'visit', 'funnel' ) GROUP BY metric` ).bind( before.from, before.to ),
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
	const { players, accounts, google_only: google, password_only: password, both_ways: both, supporters, unclaimed } = totals.results[ 0 ];
	// The first day of the period before with each kind of count: the visits (and the counts begun
	// with them) and the funnel (and the counts begun with it). A figure is only fairly compared when
	// its counts cover that period from its first day.
	const first = { visit: null, funnel: null };
	for ( const r of firsts.results ) first[ r.metric ] = r.first;
	return json( {
		from, to, rows,
		previous: { ...before, first, rows: [ ...previous.values() ] },
		totals: { players, accounts, kinds: { google, password, both }, supporters, unclaimed },
		kept: { stats: KEEP_DAYS, scores: KEEP_SCORES / DAY },
	} );

}
