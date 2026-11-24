import { HttpError, cleanText, json } from '../http.js';
import { dayOf } from '../../src/drive-app/levels.js';
import { accountById } from './accounts.js';
import { adminAccount, askedDays } from './admin.js';
import { namedAccount } from './billing.js';
import { limitsOf, planOf } from './build.js';
import { ACTIVE_STATUSES } from './supporter.js';

// The owner's numbers for World Drive Build (docs/build.md), the admin page's Build tab
// (drive/public/admin.html): GET /api/admin/build?days=N, and a customer looked up by email,
// username or id (GET /api/admin/build/customer?q=). Kept apart from the game's numbers (stats.js),
// which leave Build's out: its counts in stats_daily are named build_... (build.js counts them as
// they happen: visits by page, the referring site's host, sign-ins, projects made and shared,
// checkouts started), and its money is Build Pro's subscriptions and invoices (the billing core's
// tables, supporter.js's webhook), never the Supporter Pass's purchases.
//
// Only counts leave the period's numbers, nothing of who; the customer lookup is the one place an
// account is shown, to the admin who named it (as the comps are: billing.js).
//
// Settings: BUILD_VIEW_COST_USD: what Google bills a 3D map view (one Map Tiles API session), in US
// dollars, for the estimate beside the money (0.006 if unset: US$6 a thousand). ADMIN_EMAILS and
// ADMIN_LOOKS as the rest of the admin page (admin.js).

const DAY = 24 * 60 * 60 * 1000;
const VIEW_COST = 0.006;
const EVENTS_SHOWN = 30;
const ACTIVE = ACTIVE_STATUSES.map( status => `'${ status }'` ).join( ', ' );
// Statuses a subscription has stopped with (it's ended, and is counted as ended on the day it was
// last heard of: subscriptions.updated_at).
const ENDED = `'canceled', 'unpaid', 'incomplete_expired'`;

// SQL: the subscription with the id `id` (SQL) is Build Pro's: its own metadata said so (billing.js's
// checkout), or the purchase it came with is ('build', its old Payment Link's too). The Supporter
// Pass's subscriptions never are.
const isBuild = id => `( EXISTS ( SELECT 1 FROM subscriptions bs WHERE bs.id = ${ id } AND bs.pass = 'build' )
	OR EXISTS ( SELECT 1 FROM purchases bu WHERE bu.subscription = ${ id } AND bu.pass = 'build' ) )`;

// What the tab is told of each day from Build's own tables, counted as it asks (as stats.js's
// FACTS): [ metric, SQL giving day, key, n for the times from ?1 to before ?2 (ms) ]. Counts and
// money only.
const FACTS = [
	// Accounts made (World Drive's accounts are one: the game's and Build's together).
	[ 'accounts', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, 'new' AS key, COUNT(*) AS n FROM accounts
		WHERE created_at >= ?1 AND created_at < ?2 GROUP BY day` ],
	// 3D map views by plan ('free' or 'pro'; the owner's aren't kept): each a billed Google session.
	[ 'build_views', `SELECT date( at / 1000, 'unixepoch' ) AS day, tier AS key, COUNT(*) AS n FROM build_views
		WHERE at >= ?1 AND at < ?2 GROUP BY day, tier` ],
	// Claude's (or any MCP client's) tool calls (mcp.js).
	[ 'build_mcp', `SELECT date( at / 1000, 'unixepoch' ) AS day, 'calls' AS key, COUNT(*) AS n FROM mcp_calls
		WHERE at >= ?1 AND at < ?2 GROUP BY day` ],
	// Build Pro's invoices paid: a new subscription's first ('new'), a renewal ('renewal'), or another
	// (a switch between monthly and yearly, say: 'other'); and their money by currency (cents).
	[ 'build_paid', `SELECT date( created_at / 1000, 'unixepoch' ) AS day,
		CASE billing_reason WHEN 'subscription_create' THEN 'new' WHEN 'subscription_cycle' THEN 'renewal' ELSE 'other' END AS key, COUNT(*) AS n
		FROM invoices WHERE status = 'paid' AND created_at >= ?1 AND created_at < ?2 AND ${ isBuild( 'invoices.subscription' ) } GROUP BY day, key` ],
	[ 'build_revenue', `SELECT date( created_at / 1000, 'unixepoch' ) AS day, currency AS key, SUM( amount_paid ) AS n
		FROM invoices WHERE status = 'paid' AND amount_paid IS NOT NULL AND currency IS NOT NULL AND created_at >= ?1 AND created_at < ?2
		AND ${ isBuild( 'invoices.subscription' ) } GROUP BY day, currency` ],
	// Build Pro's money taken back: 'refunded' or 'disputed' (a chargeback), each ending Pro at once.
	[ 'build_reversed', `SELECT date( refunded_at / 1000, 'unixepoch' ) AS day, status AS key, COUNT(*) AS n FROM purchases
		WHERE pass = 'build' AND refunded_at >= ?1 AND refunded_at < ?2 GROUP BY day, status` ],
	// Build Pro subscriptions that stopped, by how (cancelled, or unpaid after Stripe's retries).
	[ 'build_ended', `SELECT date( updated_at / 1000, 'unixepoch' ) AS day, status AS key, COUNT(*) AS n FROM subscriptions
		WHERE status IN ( ${ ENDED } ) AND updated_at >= ?1 AND updated_at < ?2 AND ${ isBuild( 'subscriptions.id' ) } GROUP BY day, status` ],
	// Company logos uploaded or changed (each account keeps one).
	[ 'build_logos', `SELECT date( updated_at / 1000, 'unixepoch' ) AS day, 'updated' AS key, COUNT(*) AS n FROM build_logos
		WHERE updated_at >= ?1 AND updated_at < ?2 GROUP BY day` ],
];

// How many there are now: projects (and shared ones, and the accounts with any), logos, and comps
// running (?1: now, ms).
const TOTALS = `SELECT ( SELECT COUNT(*) FROM build_layouts ) AS projects,
	( SELECT COUNT(*) FROM build_layouts WHERE share_token IS NOT NULL ) AS shared,
	( SELECT COUNT( DISTINCT account_id ) FROM build_layouts ) AS builders,
	( SELECT COUNT(*) FROM build_logos ) AS logos,
	( SELECT COUNT(*) FROM build_comps WHERE until IS NULL OR until > ?1 ) AS comps`;

// Accounts that used Build in the last 30, 7 and 1 days (?1, ?2, ?3: from when, ms): a 3D map view,
// a project saved, or an MCP tool call. The owner's map views aren't kept, so theirs counts only by
// the others.
const ACTIVE_USERS = `WITH seen AS ( SELECT account_id, MAX( at ) AS last FROM (
		SELECT account_id, at FROM build_views WHERE at >= ?1
		UNION ALL SELECT account_id, updated_at AS at FROM build_layouts WHERE updated_at >= ?1
		UNION ALL SELECT account_id, at FROM mcp_calls WHERE at >= ?1
	) GROUP BY account_id )
	SELECT COUNT(*) AS month, COALESCE( SUM( last >= ?2 ), 0 ) AS week, COALESCE( SUM( last >= ?3 ), 0 ) AS day FROM seen`;

// Build Pro's subscriptions now, grouped by what the money tiles need: status, interval, currency
// and whether it's set to end, with the price for each together (amount x quantity, cents).
const SUBSCRIPTIONS = `SELECT status, interval, currency, cancel_at_period_end AS ending, COUNT(*) AS n, SUM( amount * COALESCE( quantity, 1 ) ) AS amount
	FROM subscriptions WHERE ${ isBuild( 'subscriptions.id' ) } GROUP BY status, interval, currency, cancel_at_period_end`;

// A month's worth of each interval's price: MRR adds up these.
const PER_MONTH = { month: 1, year: 1 / 12, week: 52 / 12, day: 365 / 12 };

function viewCost( env ) {

	const n = Number( env.BUILD_VIEW_COST_USD );
	return env.BUILD_VIEW_COST_USD !== undefined && env.BUILD_VIEW_COST_USD !== '' && Number.isFinite( n ) && n >= 0 ? n : VIEW_COST;

}

// Build Pro's subscriptions now (SUBSCRIPTIONS' rows) as the tab's money: { active, pastDue, ending,
// byInterval: { month, year }, mrr: { currency: cents a month }, canceled }. active: running and
// paid (or in a trial), and byInterval the same ones by interval; pastDue: a renewal failed and Stripe is retrying (still Pro); ending: set
// to stop at the period's end. MRR counts both the active and the past due ones, each price
// brought to a month (a year's over 12).
function moneyOf( rows ) {

	const money = { active: 0, pastDue: 0, ending: 0, canceled: 0, byInterval: { month: 0, year: 0 }, mrr: {} };
	for ( const row of rows ) {

		const running = ACTIVE_STATUSES.includes( row.status );
		if ( row.status === 'active' || row.status === 'trialing' ) money.active += row.n;
		if ( row.status === 'past_due' ) money.pastDue += row.n;
		if ( row.status === 'canceled' ) money.canceled += row.n;
		if ( running && row.ending ) money.ending += row.n;
		// The same subscriptions as active, split by how often they're billed, so the two agree.
		if ( ( row.status === 'active' || row.status === 'trialing' ) && ( row.interval === 'month' || row.interval === 'year' ) ) money.byInterval[ row.interval ] += row.n;
		if ( running && row.status !== 'trialing' && row.amount !== null && row.currency && PER_MONTH[ row.interval ] ) {

			money.mrr[ row.currency ] = ( money.mrr[ row.currency ] ?? 0 ) + row.amount * PER_MONTH[ row.interval ];

		}

	}

	for ( const currency of Object.keys( money.mrr ) ) money.mrr[ currency ] = Math.round( money.mrr[ currency ] );
	return money;

}

// GET /api/admin/build?days=30, for the last `days` UTC days, today's (so far) included (30 if
// unset, at most a year: admin.js's askedDays):
//   { from, to, rows: [ [ day, metric, key, n ] ], previous: { from, to, rows: [ [ metric, key, n ] ] },
//     active: { day, week, month }, totals: { projects, shared, builders, logos, comps },
//     mcp: { calls, users }, cost: { perView, views, usd }, money: { active, pastDue, ending, canceled,
//     byInterval, mrr }, events: [ { id, type, receivedAt, result } ] }
// rows: Build's counts a day (stats_daily's build_... metrics: build_visit by page, build_visit_hour,
// build_ref by host, build_signin, build_signup, build_project 'created' and 'shared',
// build_checkout by interval, build_map_refused, build_webhook by result) and FACTS's alike.
// previous: the same for the as many days before, added up (as stats.js's). active: accounts that
// used Build in the last day, 7 days and 30 days (ACTIVE_USERS). mcp: tool calls in the period and
// the accounts making them. cost: the period's 3D map views (both plans) at BUILD_VIEW_COST_USD
// each, an estimate of Google's bill for them. money: Build Pro's subscriptions now (moneyOf).
// events: the latest Stripe events the webhook looked at (stripe_events: the game's Supporter
// Pass's too, as they share the webhook), for checking it works. 401, 403 and 429 as the rest of the
// admin page (admin.js). Every query is bounded by the days asked for (by an index on its time:
// 0022_build_admin.sql), but TOTALS and the subscriptions now, which are small.
export async function adminBuildStats( context ) {

	const { env, url, now } = context;
	await adminAccount( context );
	const db = env.DB;
	const days = askedDays( url );
	const to = dayOf( now );
	const from = dayOf( now - ( days - 1 ) * DAY );
	const before = { from: dayOf( now - ( 2 * days - 1 ) * DAY ), to: dayOf( now - days * DAY ) };
	const start = Date.parse( `${ before.from }T00:00:00Z` );
	const periodStart = Date.parse( `${ from }T00:00:00Z` );
	const end = Date.parse( `${ to }T00:00:00Z` ) + DAY;
	const [ counts, earlier, totals, active, mcp, subscriptions, events, ...facts ] = await db.batch( [
		db.prepare( 'SELECT day, metric, key, n FROM stats_daily WHERE day >= ? AND day <= ? AND substr( metric, 1, 6 ) = \'build_\' ORDER BY day' ).bind( from, to ),
		db.prepare( 'SELECT metric, key, SUM( n ) AS n FROM stats_daily WHERE day >= ? AND day <= ? AND substr( metric, 1, 6 ) = \'build_\' GROUP BY metric, key' ).bind( before.from, before.to ),
		db.prepare( TOTALS ).bind( now ),
		db.prepare( ACTIVE_USERS ).bind( now - 30 * DAY, now - 7 * DAY, now - DAY ),
		db.prepare( 'SELECT COUNT(*) AS calls, COUNT( DISTINCT account_id ) AS users FROM mcp_calls WHERE at >= ? AND at < ?' ).bind( periodStart, end ),
		db.prepare( SUBSCRIPTIONS ),
		db.prepare( 'SELECT id, type, received_at, result FROM stripe_events ORDER BY received_at DESC LIMIT ?' ).bind( EVENTS_SHOWN ),
		...FACTS.map( ( [ , sql ] ) => db.prepare( sql ).bind( start, end ) ),
	] );
	const rows = counts.results.map( r => [ r.day, r.metric, r.key, r.n ] );
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
	const views = rows.reduce( ( all, [ , metric, , n ] ) => metric === 'build_views' ? all + n : all, 0 );
	const perView = viewCost( env );
	const { projects, shared, builders, logos, comps } = totals.results[ 0 ];
	const { day, week, month } = active.results[ 0 ];
	return json( {
		from, to, rows,
		previous: { ...before, rows: [ ...previous.values() ] },
		active: { day, week, month },
		totals: { projects, shared, builders, logos, comps },
		mcp: { calls: mcp.results[ 0 ].calls, users: mcp.results[ 0 ].users },
		cost: { perView, views, usd: Math.round( views * perView * 100 ) / 100 },
		money: moneyOf( subscriptions.results ),
		events: events.results.map( e => ( { id: e.id, type: e.type, receivedAt: e.received_at, result: e.result } ) ),
	} );

}

// GET /api/admin/build/customer?q=<email, username or account id>: what the admin page's Build tab
// shows of one account, to help them (and to comp it, with billing.js's POST
// /api/admin/build/comp): { account: { id, email, username, name, createdAt, lastLoginAt,
// stripeCustomer }, plan: { tier, status, interval, renewsAt, cancelAtPeriodEnd, pastDue, comped },
// comp: { reason, until, createdAt, active } | null, views: { used, limit } (this month's 3D map
// views; limit null for the owner's: none), projects: { count, shared, lastSaved }, lastActive,
// mcpCalls (the last 30 days), subscriptions: [ { id, status, interval, amount, currency,
// currentPeriodEnd, cancelAtPeriodEnd } ], payments: [ { createdAt, status, amount, currency,
// refundedAt } ] (Build Pro's checkouts), invoices: [ { id, status, amountPaid, currency, reason,
// createdAt } ] }, newest first, a few of each. 404 for no such account; 401, 403 and 429 as
// admin.js's.
export async function adminBuildCustomer( context ) {

	const { env, url, now } = context;
	await adminAccount( context );
	const db = env.DB;
	const q = cleanText( url.searchParams.get( 'q' ) ?? '', 320 ) ?? '';
	if ( ! q ) throw new HttpError( 400, 'Name the account: its email, username or id' );
	const named = await namedAccount( db, q );
	const account = named ? await accountById( db, named.id ) : null;
	if ( ! account ) throw new HttpError( 404, 'No account is that' );
	const plan = await planOf( env, account, now );
	const month = monthStart( now );
	const [ details, comp, used, projects, last, mcp, subscriptions, payments, invoices ] = await db.batch( [
		db.prepare( 'SELECT created_at, last_login_at, stripe_customer FROM accounts WHERE id = ?' ).bind( account.id ),
		db.prepare( 'SELECT reason, until, created_at FROM build_comps WHERE account_id = ?' ).bind( account.id ),
		db.prepare( 'SELECT COUNT(*) AS n FROM build_views WHERE account_id = ? AND at >= ?' ).bind( account.id, month ),
		db.prepare( 'SELECT COUNT(*) AS n, COUNT( share_token ) AS shared, MAX( updated_at ) AS last FROM build_layouts WHERE account_id = ?' ).bind( account.id ),
		db.prepare( `SELECT MAX( at ) AS at FROM ( SELECT MAX( at ) AS at FROM build_views WHERE account_id = ?1
			UNION ALL SELECT MAX( updated_at ) FROM build_layouts WHERE account_id = ?1 UNION ALL SELECT MAX( at ) FROM mcp_calls WHERE account_id = ?1 )` ).bind( account.id ),
		db.prepare( 'SELECT COUNT(*) AS n FROM mcp_calls WHERE account_id = ? AND at >= ?' ).bind( account.id, now - 30 * DAY ),
		db.prepare( `SELECT id, status, interval, amount, currency, current_period_end, cancel_at_period_end FROM subscriptions
			WHERE ( account_id = ?1 OR ( customer IS NOT NULL AND customer = ( SELECT stripe_customer FROM accounts WHERE id = ?1 ) )
			OR id IN ( SELECT subscription FROM purchases WHERE account_id = ?1 AND pass = 'build' ) ) AND ${ isBuild( 'subscriptions.id' ) }
			ORDER BY updated_at DESC LIMIT 5` ).bind( account.id ),
		db.prepare( 'SELECT created_at, status, amount, currency, refunded_at FROM purchases WHERE account_id = ? AND pass = \'build\' ORDER BY created_at DESC LIMIT 5' ).bind( account.id ),
		db.prepare( `SELECT id, status, amount_paid, currency, billing_reason, created_at FROM invoices WHERE ( account_id = ?1
			OR subscription IN ( SELECT subscription FROM purchases WHERE account_id = ?1 AND pass = 'build' ) ) AND ${ isBuild( 'invoices.subscription' ) }
			ORDER BY created_at DESC LIMIT 5` ).bind( account.id ),
	] );
	const row = details.results[ 0 ];
	const given = comp.results[ 0 ];
	const counted = projects.results[ 0 ];
	const limits = limitsOf( env );
	return json( {
		account: {
			id: account.id, email: account.email || '', username: account.username ?? null, name: account.name || '',
			createdAt: row.created_at, lastLoginAt: row.last_login_at, stripeCustomer: row.stripe_customer ?? null,
		},
		plan: { tier: plan.tier, status: plan.status, interval: plan.interval, renewsAt: plan.renewsAt, cancelAtPeriodEnd: plan.cancelAtPeriodEnd, pastDue: plan.pastDue, comped: plan.comped },
		comp: given ? { reason: given.reason, until: given.until, createdAt: given.created_at, active: given.until === null || given.until > now } : null,
		views: { used: used.results[ 0 ].n, limit: plan.tier === 'owner' ? null : plan.tier === 'pro' ? limits.proMonthly : limits.freeMonthly },
		projects: { count: counted.n, shared: counted.shared, lastSaved: counted.last },
		lastActive: last.results[ 0 ]?.at ?? null,
		mcpCalls: mcp.results[ 0 ].n,
		subscriptions: subscriptions.results.map( s => ( {
			id: s.id, status: s.status, interval: s.interval, amount: s.amount, currency: s.currency, currentPeriodEnd: s.current_period_end, cancelAtPeriodEnd: !! s.cancel_at_period_end,
		} ) ),
		payments: payments.results.map( p => ( { createdAt: p.created_at, status: p.status, amount: p.amount, currency: p.currency, refundedAt: p.refunded_at } ) ),
		invoices: invoices.results.map( i => ( { id: i.id, status: i.status, amountPaid: i.amount_paid, currency: i.currency, reason: i.billing_reason, createdAt: i.created_at } ) ),
	} );

}

// The first of this month, UTC (ms), when the monthly views start again (as build.js's).
function monthStart( now ) {

	const d = new Date( now );
	return Date.UTC( d.getUTCFullYear(), d.getUTCMonth(), 1 );

}
