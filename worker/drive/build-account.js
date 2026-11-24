import { HttpError, json, noContent, readJson } from '../http.js';
import { currentAccount, signedOutCookie } from './accounts.js';
import { isAdmin } from './admin.js';
import { ACTIVE_STATUSES } from './supporter.js';
import { accountProof } from './logins.js';
import { stripeApi, stripeSecret } from './stripe-api.js';
import { limitsOf, planOf } from './build.js';

// World Drive Build's account page (/build/account/, src/build-account/, docs/build.md): what it
// asks of the Worker beyond /build/api/me and the sign-in changes World Drive already has
// (/api/account/*, logins.js). The account's connected apps, share links, payments and usage
// (GET account), one connected app cut off (DELETE connections/:client), everything kept about the
// account as a JSON file (GET account/export), and the account deleted (DELETE account).
//
// Deleting is for good and takes the World Drive game's side with it (one account, both products):
// any subscription still running is cancelled at Stripe first, so nobody is billed for an account
// that's gone; then, in one batch, what the foreign keys would otherwise leave behind with the
// account's id taken off (migrations/: ON DELETE SET NULL) is dealt with by hand (its leaderboard
// players, with their scores, times, ghosts and achievements, deleted; its feature requests
// deleted; its purchases kept for the tax record but without the email they were bought with), and
// then the account itself, which cascades to its sessions, username and password, keys, projects,
// views, logo, comps and Claude's codes and tokens (ON DELETE CASCADE). Subscriptions and invoices
// keep their Stripe ids and amounts (no name or email), their account taken off by SET NULL.

const CLIENT = /^[A-Za-z0-9_-]{1,64}$/;
const CREDENTIAL_BODY = 16 * 1024;

async function signedInAccount( context ) {

	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	return account;

}

// The first of this month, UTC (ms).
function monthStart( now ) {

	const d = new Date( now );
	return Date.UTC( d.getUTCFullYear(), d.getUTCMonth(), 1 );

}

// SQL: the purchase `u` is the account ?1's, bought signed in as it or with its Google email ?2 (as
// supporter.js's ownPurchase has it, with the email bound rather than joined).
const OWN_PURCHASE = '( u.account_id = ?1 OR ( u.account_id IS NULL AND u.email = ?2 AND ?2 <> \'\' ) )';

// The account's subscriptions, as ids: those the webhook put its id on, and those of its purchases.
const OWN_SUBSCRIPTIONS = `SELECT id FROM subscriptions WHERE account_id = ?1
	UNION SELECT u.subscription FROM purchases u WHERE ${ OWN_PURCHASE } AND u.subscription IS NOT NULL`;

// GET account: { account: { id, name, email, google, username, contactEmail, createdAt },
// connections: [ { client, name, since } ], lastCall, shares: [ { id, name, site, lat, lon,
// shareToken, updatedAt } ], payments: [ { id, date, amount, currency, status, refunded, reason } ],
// usage: { projects, projectLimit, mcpCalls } }. The plan and its views are /build/api/me's.
// connections: each app (Claude, say) with a token that's still good, named as it registered itself,
// since its oldest such token. lastCall: the account's last tool call through /mcp (ms), or null.
// payments: Build Pro's invoices, newest first (refunded: its payment was refunded in full).
// mcpCalls: tool calls this month (UTC).
export async function getAccount( context ) {

	const { env, now } = context;
	const account = await signedInAccount( context );
	const db = env.DB;
	const [ row, connections, last, shares, payments, projects, calls, plan ] = await Promise.all( [
		db.prepare( 'SELECT created_at FROM accounts WHERE id = ?' ).bind( account.id ).first(),
		db.prepare( `SELECT t.client_id, c.name, MIN( t.created_at ) AS since FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.id = t.client_id
			WHERE t.account_id = ? AND t.expires_at > ? GROUP BY t.client_id ORDER BY since` ).bind( account.id, now ).all(),
		db.prepare( 'SELECT MAX( at ) AS at FROM mcp_calls WHERE account_id = ?' ).bind( account.id ).first(),
		db.prepare( 'SELECT id, name, site, lat, lon, share_token, updated_at FROM build_layouts WHERE account_id = ? AND share_token IS NOT NULL ORDER BY updated_at DESC' ).bind( account.id ).all(),
		db.prepare( `SELECT i.id, i.created_at, i.amount_paid, i.currency, i.status, i.billing_reason,
			EXISTS ( SELECT 1 FROM reversals r WHERE r.payment_intent = i.payment_intent AND r.status = 'refunded' ) AS refunded
			FROM invoices i WHERE i.account_id = ?1 OR i.subscription IN ( ${ OWN_SUBSCRIPTIONS } ) ORDER BY i.created_at DESC LIMIT 36` ).bind( account.id, account.email ?? '' ).all(),
		db.prepare( 'SELECT COUNT(*) AS n FROM build_layouts WHERE account_id = ?' ).bind( account.id ).first(),
		db.prepare( 'SELECT COUNT(*) AS n FROM mcp_calls WHERE account_id = ? AND at >= ?' ).bind( account.id, monthStart( now ) ).first(),
		planOf( env, account, now ),
	] );
	return json( {
		account: {
			id: account.id, name: account.name || '', email: account.email || '', google: !! account.google, username: account.username ?? null,
			contactEmail: account.contact_email ?? '', createdAt: row?.created_at ?? null,
		},
		connections: connections.results.map( c => ( { client: c.client_id, name: c.name || 'An app', since: c.since } ) ),
		lastCall: last?.at ?? null,
		shares: shares.results.map( s => ( { id: s.id, name: s.name, site: s.site, lat: s.lat ?? null, lon: s.lon ?? null, shareToken: s.share_token, updatedAt: s.updated_at } ) ),
		payments: payments.results.map( p => ( {
			id: p.id, date: p.created_at, amount: p.amount_paid, currency: p.currency, status: p.status, refunded: !! p.refunded, reason: p.billing_reason,
		} ) ),
		usage: { projects: projects?.n ?? 0, projectLimit: plan.tier === 'free' ? 1 : limitsOf( env ).layouts, mcpCalls: calls?.n ?? 0 },
	} );

}

// DELETE connections/:client: one connected app cut off (its tokens and any code it hasn't traded
// yet deleted); it has to be allowed again. Another app's, or one that isn't connected, changes
// nothing (still a 204: the page may be a step behind).
export async function disconnectClient( context ) {

	const { env, params } = context;
	const account = await signedInAccount( context );
	if ( ! CLIENT.test( params.client ) ) throw new HttpError( 404, 'Not found' );
	await env.DB.batch( [
		env.DB.prepare( 'DELETE FROM oauth_tokens WHERE account_id = ? AND client_id = ?' ).bind( account.id, params.client ),
		env.DB.prepare( 'DELETE FROM oauth_codes WHERE account_id = ? AND client_id = ?' ).bind( account.id, params.client ),
	] );
	return noContent();

}

// GET account/export: everything kept about the account, as a JSON file to save
// (world-drive-account-<id>.json): the account, its username (never the password's hash or salt),
// its sessions' dates (never their tokens' hashes), its projects with their layouts, places and
// share links, its logo, its 3D map views and Claude's tool calls by month, its connected apps
// (never their tokens), its purchases, subscriptions, invoices and comp, its World Drive players
// (nickname, level, best scores, times, achievements, places found; never their secrets), and its
// feature requests.
export async function exportAccount( context ) {

	const { env, now } = context;
	const account = await signedInAccount( context );
	const db = env.DB;
	const id = account.id;
	const email = account.email ?? '';
	const all = ( sql, ...binds ) => db.prepare( sql ).bind( ...binds ).all().then( r => r.results );
	const players = 'SELECT id FROM players WHERE account_id = ?1';
	const [
		[ row ], login, sessions, layouts, logo, views, calls, apps, purchases, subscriptions, invoices, comp,
		playerRows, bestScores, times, achievements, discoveries, requests,
	] = await Promise.all( [
		all( 'SELECT id, email, name, google_sub NOT LIKE \'none:%\' AS google, contact_email, stripe_customer, created_at, last_login_at FROM accounts WHERE id = ?', id ),
		all( 'SELECT username, created_at, changed_at FROM logins WHERE account_id = ?', id ),
		all( 'SELECT created_at, expires_at FROM sessions WHERE account_id = ? ORDER BY created_at', id ),
		all( 'SELECT id, name, site, lat, lon, share_token, created_at, updated_at, data FROM build_layouts WHERE account_id = ? ORDER BY created_at', id ),
		all( 'SELECT type, data, updated_at FROM build_logos WHERE account_id = ?', id ),
		all( 'SELECT strftime( \'%Y-%m\', at / 1000, \'unixepoch\' ) AS month, tier, COUNT(*) AS views FROM build_views WHERE account_id = ? GROUP BY month, tier ORDER BY month', id ),
		all( 'SELECT strftime( \'%Y-%m\', at / 1000, \'unixepoch\' ) AS month, COUNT(*) AS calls FROM mcp_calls WHERE account_id = ? GROUP BY month ORDER BY month', id ),
		all( `SELECT t.client_id, c.name, t.kind, t.created_at, t.expires_at FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.id = t.client_id
			WHERE t.account_id = ? ORDER BY t.created_at`, id ),
		all( `SELECT checkout_session, email, amount, currency, status, pass, subscription, created_at, refunded_at FROM purchases u WHERE ${ OWN_PURCHASE } ORDER BY created_at`, id, email ),
		all( `SELECT id, status, pass, price_id, interval, amount, currency, current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at
			FROM subscriptions WHERE id IN ( ${ OWN_SUBSCRIPTIONS } )`, id, email ),
		all( `SELECT id, subscription, amount_paid, currency, status, billing_reason, period_start, period_end, created_at FROM invoices
			WHERE account_id = ?1 OR subscription IN ( ${ OWN_SUBSCRIPTIONS } ) ORDER BY created_at`, id, email ),
		all( 'SELECT reason, until, created_at FROM build_comps WHERE account_id = ?', id ),
		all( 'SELECT id, name, xp, title, streak, streak_day, discoveries, parties, created_at, last_seen_at FROM players WHERE account_id = ?', id ),
		all( `SELECT player_id, period, place, score, tricks, vehicle, air_time, created_at FROM best_scores WHERE player_id IN ( ${ players } ) ORDER BY created_at`, id ),
		all( `SELECT t.player_id, t.challenge_id, c.world, c.period, t.ms, t.vehicle, t.created_at, t.final_rank FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id
			WHERE t.player_id IN ( ${ players } ) ORDER BY t.created_at`, id ),
		all( `SELECT player_id, achievement, earned_at FROM achievements WHERE player_id IN ( ${ players } ) ORDER BY earned_at`, id ),
		all( `SELECT player_id, place, created_at FROM discoveries WHERE player_id IN ( ${ players } ) ORDER BY created_at`, id ),
		all( 'SELECT name, text, created_at, done_at FROM feature_requests WHERE account_id = ? ORDER BY created_at', id ),
	] );
	const parse = text => {

		try {

			return JSON.parse( text );

		} catch {

			return text;

		}

	};

	const data = {
		about: 'Everything World Drive and World Drive Build keep about your account, as of exportedAt (ms since 1970, as every time here is). Amounts are in the currency\'s smallest unit (cents).',
		exportedAt: now,
		account: {
			id: row.id, googleEmail: row.email, googleName: row.name, googleLinked: !! row.google, contactEmail: row.contact_email,
			stripeCustomer: row.stripe_customer ?? null, createdAt: row.created_at, lastSignInAt: row.last_login_at,
		},
		username: login[ 0 ] ? { username: login[ 0 ].username, createdAt: login[ 0 ].created_at, changedAt: login[ 0 ].changed_at } : null,
		sessions: sessions.map( s => ( { createdAt: s.created_at, expiresAt: s.expires_at } ) ),
		build: {
			projects: layouts.map( l => ( {
				id: l.id, name: l.name, site: l.site, lat: l.lat, lon: l.lon, shareToken: l.share_token, createdAt: l.created_at, updatedAt: l.updated_at, layout: parse( l.data ),
			} ) ),
			// D1 hands a BLOB back as an array of numbers (or an ArrayBuffer).
			logo: logo[ 0 ] ? { type: logo[ 0 ].type, updatedAt: logo[ 0 ].updated_at, image: `data:${ logo[ 0 ].type };base64,${ base64( new Uint8Array( logo[ 0 ].data ) ) }` } : null,
			mapViewsByMonth: views,
			claudeCallsByMonth: calls,
			connectedApps: apps.map( a => ( { client: a.client_id, name: a.name ?? '', kind: a.kind, createdAt: a.created_at, expiresAt: a.expires_at } ) ),
			comp: comp[ 0 ] ? { reason: comp[ 0 ].reason, until: comp[ 0 ].until, createdAt: comp[ 0 ].created_at } : null,
		},
		billing: {
			purchases: purchases.map( p => ( {
				checkoutSession: p.checkout_session, email: p.email, amount: p.amount, currency: p.currency, status: p.status, product: p.pass === 'build' ? 'Build Pro' : p.pass === 'day' ? 'Day Pass' : 'Supporter Pass',
				subscription: p.subscription, createdAt: p.created_at, refundedAt: p.refunded_at,
			} ) ),
			subscriptions: subscriptions.map( s => ( {
				id: s.id, status: s.status, product: s.pass === 'build' ? 'Build Pro' : 'Supporter Pass', price: s.price_id, interval: s.interval, amount: s.amount, currency: s.currency,
				currentPeriodStart: s.current_period_start, currentPeriodEnd: s.current_period_end, cancelAtPeriodEnd: !! s.cancel_at_period_end, cancelAt: s.cancel_at, canceledAt: s.canceled_at,
			} ) ),
			invoices: invoices.map( i => ( {
				id: i.id, subscription: i.subscription, amountPaid: i.amount_paid, currency: i.currency, status: i.status, reason: i.billing_reason,
				periodStart: i.period_start, periodEnd: i.period_end, createdAt: i.created_at,
			} ) ),
		},
		worldDrive: {
			players: playerRows.map( p => ( {
				id: p.id, nickname: p.name, xp: p.xp, title: p.title, streak: p.streak, streakDay: p.streak_day, placesFound: p.discoveries, parties: p.parties,
				createdAt: p.created_at, lastSeenAt: p.last_seen_at,
			} ) ),
			bestScores: bestScores.map( s => ( { player: s.player_id, period: s.period, place: s.place, score: s.score, tricks: s.tricks, vehicle: s.vehicle, airTime: s.air_time, createdAt: s.created_at } ) ),
			challengeTimes: times.map( t => ( { player: t.player_id, challenge: t.challenge_id, world: t.world, period: t.period, ms: t.ms, vehicle: t.vehicle, createdAt: t.created_at, finalRank: t.final_rank } ) ),
			achievements: achievements.map( a => ( { player: a.player_id, achievement: a.achievement, earnedAt: a.earned_at } ) ),
			placesFound: discoveries.map( d => ( { player: d.player_id, place: d.place, foundAt: d.created_at } ) ),
			featureRequests: requests.map( r => ( { name: r.name, text: r.text, createdAt: r.created_at, doneAt: r.done_at } ) ),
		},
	};
	return json( data, 200, { 'Content-Disposition': `attachment; filename="world-drive-account-${ id }.json"` } );

}

function base64( bytes ) {

	let text = '';
	for ( let i = 0; i < bytes.length; i += 0x8000 ) text += String.fromCharCode( ...bytes.subarray( i, i + 0x8000 ) );
	return btoa( text );

}

// The account's subscriptions still running (as the webhook last heard, or not heard of at all yet
// for a purchase that has one): Build Pro's and the Supporter Pass's alike.
async function runningSubscriptions( db, account ) {

	const active = ACTIVE_STATUSES.map( status => `'${ status }'` ).join( ', ' );
	const { results } = await db.prepare( `SELECT DISTINCT o.id FROM ( ${ OWN_SUBSCRIPTIONS } ) o LEFT JOIN subscriptions s ON s.id = o.id
		WHERE o.id IS NOT NULL AND ( s.id IS NULL OR s.status IN ( ${ active } ) )
		AND NOT EXISTS ( SELECT 1 FROM purchases u WHERE u.subscription = o.id AND u.refunded_at IS NOT NULL AND s.id IS NULL )` ).bind( account.id, account.email ?? '' ).all();
	return results.map( r => r.id );

}

// The subscriptions Stripe itself has on the account's customer (accounts.stripe_customer, Build
// Pro's) that haven't ended: one paid for whose webhook hasn't come yet, and one waiting on the
// customer (incomplete) or on a card (unpaid, paused), which could still be charged. Without the
// key, or with no customer, none. Stripe not answering is a 502: nothing is deleted.
async function customerSubscriptions( env, db, account ) {

	if ( ! stripeSecret( env ) ) return [];
	const row = await db.prepare( 'SELECT stripe_customer FROM accounts WHERE id = ?' ).bind( account.id ).first();
	const customer = typeof row?.stripe_customer === 'string' && /^cus_[A-Za-z0-9]{1,200}$/.test( row.stripe_customer ) ? row.stripe_customer : null;
	if ( ! customer ) return [];
	const found = await stripeApi( env, 'GET', `/v1/subscriptions?customer=${ encodeURIComponent( customer ) }&status=all&limit=100` );
	// A customer deleted in Stripe's Dashboard has nothing left to bill.
	if ( ! found.ok && found.status === 404 ) return [];
	if ( ! found.ok ) throw new HttpError( 502, 'Couldn\'t check your subscription at Stripe just now, so nothing was deleted. Try again in a minute' );
	return ( Array.isArray( found.body.data ) ? found.body.data : [] )
		.filter( s => typeof s?.id === 'string' && s.id.startsWith( 'sub_' ) && s.status !== 'canceled' && s.status !== 'incomplete_expired' ).map( s => s.id );

}

// DELETE account { password, token? } or { credential }: the signed-in account deleted for good,
// with fresh proof (logins.js's accountProof: its password, or Google's ID token for its own Google
// account), and this browser signed out. Each subscription still running is cancelled at Stripe
// first (now, not at the period's end; nothing is refunded by it): without STRIPE_SECRET_KEY, or if
// Stripe says no, nothing is deleted (409, 502) and the page says to cancel in the billing portal or
// write to support, so nobody goes on paying for an account that's gone. The owner's accounts
// (ADMIN_EMAILS) can't be deleted here (403). Then everything goes in one batch (see the top).
export async function deleteAccount( context ) {

	const { request, env, url, now } = context;
	const account = await signedInAccount( context );
	if ( isAdmin( env, account ) ) throw new HttpError( 403, 'The owner\'s accounts can\'t be deleted here' );
	const sent = await readJson( request, CREDENTIAL_BODY );
	await accountProof( context, account, sent );
	const db = env.DB;
	const running = [ ...new Set( [ ...await runningSubscriptions( db, account ), ...await customerSubscriptions( env, db, account ) ] ) ];
	if ( running.length && ! stripeSecret( env ) ) throw new HttpError( 409, 'Your subscription couldn\'t be cancelled from here. Cancel it under Plan & billing first, or write to support' );
	for ( const subscription of running ) {

		const done = await stripeApi( env, 'DELETE', `/v1/subscriptions/${ encodeURIComponent( subscription ) }` );
		// Gone already at Stripe (resource_missing): nothing left to bill.
		const gone = done.status === 404 && done.body?.error?.code === 'resource_missing';
		if ( ! done.ok && ! gone ) throw new HttpError( 502, 'Couldn\'t cancel your subscription at Stripe just now, so nothing was deleted. Try again in a minute' );
		// Stripe's customer.subscription.deleted, which is newer, says the same when it comes.
		await db.prepare( 'UPDATE subscriptions SET status = \'canceled\', canceled_at = COALESCE( canceled_at, ?2 ), updated_at = ?2 WHERE id = ?1' ).bind( subscription, now ).run();

	}

	const players = 'SELECT id FROM players WHERE account_id = ?1';
	await db.batch( [
		// The account's leaderboard players go (their scores, places found, times, ghosts, achievements
		// and keys with them, ON DELETE CASCADE), and each challenge they had a time on has one driver
		// fewer (the owner's runs were never counted) and its ghosts' bytes without theirs.
		db.prepare( `UPDATE challenges SET drivers = MAX( 0, drivers - ( SELECT COUNT(*) FROM challenge_times t WHERE t.challenge_id = challenges.id AND t.owner = 0 AND t.player_id IN ( ${ players } ) ) ),
			ghost_bytes = MAX( 0, ghost_bytes - COALESCE( ( SELECT SUM( g.bytes ) FROM challenge_ghosts g WHERE g.challenge_id = challenges.id AND g.player_id IN ( ${ players } ) ), 0 ) )
			WHERE id IN ( SELECT challenge_id FROM challenge_times WHERE player_id IN ( ${ players } ) )` ).bind( account.id ),
		db.prepare( `DELETE FROM players WHERE id IN ( ${ players } )` ).bind( account.id ),
		db.prepare( 'DELETE FROM feature_requests WHERE account_id = ?' ).bind( account.id ),
		// Purchases are kept for the tax record (what was paid, when, and its Stripe ids), but no
		// longer anyone's: the account taken off, and the email it was bought with.
		db.prepare( `UPDATE purchases SET account_id = NULL, email = '' WHERE ${ OWN_PURCHASE.replaceAll( 'u.', '' ) }` ).bind( account.id, account.email ?? '' ),
		db.prepare( 'DELETE FROM accounts WHERE id = ?' ).bind( account.id ),
	] );
	return noContent( { 'Set-Cookie': signedOutCookie( url ) } );

}
