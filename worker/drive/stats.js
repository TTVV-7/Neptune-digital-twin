import { HttpError, isObject, json, list, readJson } from '../http.js';
import { checkCounts } from '../../src/drive-app/stats-protocol.js';
import { dayOf } from '../../src/drive-app/levels.js';
import { currentAccount } from './accounts.js';
import { database } from './players.js';
import { readVisit } from './visits.js';

// Play stats (docs/world-drive.md, "Play stats"): counts a day in D1's stats_daily, for the owner's
// admin page (drive/public/admin.html). The page counts what's played (src/drive-app/stats.js) and
// posts it every few minutes and as it goes out of sight; visits are counted here as /api/visit
// hands them out. Only counts: nothing of who (src/drive-app/stats-protocol.js), so no cookie and
// no consent banner.
//
// Settings: ADMIN_EMAILS (a secret or var, comma-separated): the Google accounts that may see the
// stats, signed in on worlddrive.app. STATS_POSTS: the rate limiter binding for each visit's posts.

// The most days the admin page asks for, and how long rows are kept.
const MOST_DAYS = 400;
const KEEP_DAYS = 400;
const DAY = 24 * 60 * 60 * 1000;

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

// GET /api/admin/stats?days=30: { from, to, rows: [ [ day, metric, key, n ] ] } for the last `days`
// UTC days, today's included (30 if unset, at most MOST_DAYS). 401 without a signed-in account, 403
// for one not in ADMIN_EMAILS. Rows older than KEEP_DAYS go as it's asked.
export async function adminStats( context ) {

	const { env, url, now } = context;
	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	if ( ! isAdmin( env, account ) ) throw new HttpError( 403, 'Not an admin' );
	const db = database( env );
	const days = Math.min( MOST_DAYS, Math.max( 1, Math.floor( Number( url.searchParams.get( 'days' ) ) ) || 30 ) );
	const to = dayOf( now );
	const from = dayOf( now - ( days - 1 ) * DAY );
	context.ctx?.waitUntil?.( db.prepare( 'DELETE FROM stats_daily WHERE day < ?' ).bind( dayOf( now - KEEP_DAYS * DAY ) ).run().catch( () => {} ) );
	const { results } = await db.prepare( 'SELECT day, metric, key, n FROM stats_daily WHERE day >= ? AND day <= ? ORDER BY day' ).bind( from, to ).all();
	return json( { from, to, rows: results.map( r => [ r.day, r.metric, r.key, r.n ] ) } );

}
