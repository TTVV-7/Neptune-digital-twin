import { HttpError, checkSameOrigin, cleanText, isObject, json, jsonText, noContent, randomToken, readJson } from '../http.js';
import { accountById, currentAccount, signIn, signOut } from './accounts.js';
import { isAdmin } from './admin.js';
import { buildPlan } from './supporter.js';
import { billingFor, postCheckout, postPortal, priceLabels } from './billing.js';
import { googleClientId } from './settings.js';
import { deleteAccount, disconnectClient, exportAccount, getAccount } from './build-account.js';
import { countDaily } from './stats.js';
import { METRICS } from '../../src/drive-app/stats-protocol.js';

// World Drive Build (worlddrive.app/build/, docs/build.md): the construction mock-up app (the
// Neptune digital twin's app, built for World Drive by vite.drive.config.js's buildApp) on World
// Drive's accounts. Its page talks to /build/api/*, the same calls it makes of its own Worker
// (worker/index.js: config, sign-in, me, saved layouts and share links), answered here from World
// Drive's accounts and database (migrations/0016_build.sql). Three plans:
//
//   free   anyone signed in: the basic library (the page locks the rest), one saved project, and
//          BUILD_FREE_MONTHLY 3D map views a month (15 if unset), while today's free views for
//          everyone together are under BUILD_FREE_DAILY (200 if unset: Google bills each one)
//   pro    Build Pro, a subscription bought through a Stripe Checkout Session (billing.js: monthly
//          or yearly; supporter.js's webhook keeps it), given by the owner on the admin page
//          (build_comps), or BUILD_EMAILS (comma-separated, testers): the whole library,
//          BUILD_LAYOUT_LIMIT projects (200), share links, and BUILD_PRO_MONTHLY views (300)
//   owner  an account in ADMIN_EMAILS (World Drive's owner, admin.js): everything, never counted
//
// A 3D map view is a page that's handed the Maps key (GET config): one billed Google 3D tiles
// session, as World Drive's own Earth drives are. Signed out there's no key, and the page shows
// flat ground and asks you to sign in. A share link's viewer gets the map on its owner's views,
// while the owner is on Pro (or is the owner); the layout opens either way.
//
// Buying needs Stripe's secret key and Build Pro's two price ids, GOOGLE_CLIENT_ID (an account to
// put it on) and the webhook's secret (billing.js); without them the page says Build Pro opens soon
// and nothing is sold.

// The dashboard's page (/build/) and the editor's (/build/app/) each ask relative to themselves.
const PREFIXES = [ '/build/api/', '/build/app/api/' ];
const LAYOUT_LIMIT = 200;
const LAYOUT_BYTES = 1024 * 1024;
const ACCOUNT_BYTES = 25 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const SHARE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SUMMARY = 'id, site, name, share_token, updated_at, lat, lon';
const DAY_MS = 24 * 60 * 60 * 1000;
// How long map views and AI app calls are kept (the Privacy Policy's 13 months, a little over).
export const LOG_KEEP_MS = 396 * DAY_MS;

const notFound = () => new HttpError( 404, 'Not found' );
const badRequest = () => new HttpError( 400, 'Bad request' );

// The routes, as worker/index.js has them for the app's own Worker (:name a path part).
const ROUTES = [
	[ 'GET', 'config', getConfig ],
	[ 'GET', 'home', getHome ],
	[ 'POST', 'session', postSession ],
	[ 'DELETE', 'session', deleteSession ],
	[ 'GET', 'me', getMe ],
	// Claude's connections to the account (oauth.js, mcp.js): all of them ended.
	[ 'DELETE', 'connections', disconnectClaude ],
	// The account page (/build/account/, build-account.js): one app cut off, what the page lists,
	// everything kept about the account as a file, and the account deleted.
	[ 'DELETE', 'connections/:client', disconnectClient ],
	[ 'GET', 'account', getAccount ],
	[ 'GET', 'account/export', exportAccount ],
	[ 'DELETE', 'account', deleteAccount ],
	[ 'GET', 'layouts', listLayouts ],
	[ 'POST', 'layouts', createLayout ],
	[ 'GET', 'layouts/:id', getLayout ],
	[ 'PUT', 'layouts/:id', updateLayout ],
	[ 'DELETE', 'layouts/:id', deleteLayout ],
	[ 'POST', 'layouts/:id/share', shareLayout ],
	[ 'DELETE', 'layouts/:id/share', unshareLayout ],
	[ 'GET', 'shared/:token', getShared ],
	// Build Pro's company logo, on the equipment (src/logo.js): your own, and a share link's owner's.
	[ 'GET', 'logo', getLogo ],
	[ 'PUT', 'logo', putLogo ],
	[ 'DELETE', 'logo', deleteLogo ],
	[ 'GET', 'shared/:token/logo', getSharedLogo ],
	// Buying Build Pro and managing it (billing.js): Stripe's checkout page, and its billing portal.
	[ 'POST', 'billing/checkout', checkoutCounted ],
	[ 'POST', 'billing/portal', postPortal ],
	// The construction app's site-wide extras (saved for everyone on the Neptune site): none here.
	[ 'GET', 'shared-items', () => json( { items: [] } ) ],
	[ 'GET', 'placements', () => json( { placements: {} } ) ],
];

export function isBuildApi( url ) {

	return PREFIXES.some( prefix => url.pathname.startsWith( prefix ) );

}

// A request to /build/api/*: its route, or 404 / 405. Everything is the site's own pages' (the
// same-origin checks index.js makes of its own routes).
export async function buildApi( context ) {

	const { request, url } = context;
	const site = request.headers.get( 'Sec-Fetch-Site' );
	if ( site && site !== 'same-origin' && site !== 'none' ) throw new HttpError( 403, 'Forbidden' );
	checkSameOrigin( request, url );
	const prefix = PREFIXES.find( p => url.pathname.startsWith( p ) );
	const parts = url.pathname.slice( prefix.length ).split( '/' );
	let allowed = [];
	for ( const [ method, path, handler ] of ROUTES ) {

		const want = path.split( '/' );
		if ( want.length !== parts.length ) continue;
		const params = {};
		if ( ! want.every( ( part, i ) => part.startsWith( ':' ) ? ( params[ part.slice( 1 ) ] = decodeURIComponent( parts[ i ] ), true ) : part === parts[ i ] ) ) continue;
		if ( method !== request.method ) {

			allowed.push( method );
			continue;

		}

		return await handler( { ...context, params } );

	}

	if ( allowed.length ) throw new HttpError( 405, 'Method not allowed', {}, { Allow: allowed.join( ', ' ) } );
	throw notFound();

}

// --- counts for the owner's admin page -----------------------------------------------------

// World Drive Build's own counts a day in stats_daily (metrics named build_..., which the game's
// numbers leave out), for the admin page's Build tab (build-stats.js): page visits by which page
// and hour, the referring site's host, sign-ins and new accounts, projects made and shared,
// checkouts started, and 3D map views turned away. Only how many: never an account, an address or
// anything else that's someone's. A count that fails is only logged (stats.js's countDaily).
async function countBuild( context, counts ) {

	await countDaily( context.env, context.now, counts );

}

// A page's visit (build_visit: 'dashboard', 'editor' or 'share'), and its UTC hour.
function visitCounts( page, now ) {

	return [ [ 'build_visit', page, 1 ], [ 'build_visit_hour', String( new Date( now ).getUTCHours() ).padStart( 2, '0' ), 1 ] ];

}

// POST billing/checkout (billing.js's postCheckout), with each checkout started counted by its
// interval, as Stripe's page is handed out.
async function checkoutCounted( context ) {

	const asked = await context.request.clone().json().catch( () => null );
	const res = await postCheckout( context );
	const interval = asked?.interval === 'month' || asked?.interval === 'year' ? asked.interval : 'other';
	if ( res.ok ) await countBuild( context, [ [ 'build_checkout', interval, 1 ] ] );
	return res;

}

// --- plans ---------------------------------------------------------------------------------

function number( value, fallback ) {

	const n = Number( value );
	return Number.isFinite( n ) && n >= 0 && value !== undefined && value !== '' ? Math.floor( n ) : fallback;

}

export function limitsOf( env ) {

	return {
		freeMonthly: number( env.BUILD_FREE_MONTHLY, 15 ),
		proMonthly: number( env.BUILD_PRO_MONTHLY, 300 ),
		freeDaily: number( env.BUILD_FREE_DAILY, 200 ),
		layouts: number( env.BUILD_LAYOUT_LIMIT, LAYOUT_LIMIT ),
	};

}

// A signed-in account's plan at `now` (ms): { tier: 'owner', 'pro' or 'free', subscribed, status,
// interval, renewsAt, cancelAtPeriodEnd, pastDue, priceLabel, comped, customer } (buildPlan's, with
// the price as shown for its interval). The owner's has no subscription.
export async function planOf( env, account, now = Date.now() ) {

	if ( isAdmin( env, account ) ) return { tier: 'owner', subscribed: false, status: null, interval: null, renewsAt: null, cancelAtPeriodEnd: false, pastDue: false, priceLabel: null, comped: false, customer: false };
	const plan = await buildPlan( env, account, now );
	const labels = priceLabels( env );
	return {
		tier: plan.pro ? 'pro' : 'free',
		subscribed: plan.subscribed,
		status: plan.status,
		interval: plan.interval,
		renewsAt: plan.renewsAt,
		cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
		pastDue: plan.pastDue,
		priceLabel: plan.interval === 'year' ? labels.annual : plan.interval === 'month' ? labels.monthly : null,
		comped: plan.comped,
		customer: plan.customer,
	};

}

// The first of this month, UTC (ms): monthly allowances start again then.
function monthStart( now ) {

	const d = new Date( now );
	return Date.UTC( d.getUTCFullYear(), d.getUTCMonth(), 1 );

}

async function viewsUsed( env, accountId, now ) {

	const start = monthStart( now );
	const end = monthStart( start + 32 * DAY_MS );
	const row = await env.DB.prepare( 'SELECT COUNT(*) AS n FROM build_views WHERE account_id = ? AND at >= ? AND at < ?' ).bind( accountId, start, end ).first();
	return row?.n ?? 0;

}

// { limit, used } for a plan's views this month ({ limit: null } for the owner's: none).
async function viewsOf( env, account, tier, now ) {

	if ( tier === 'owner' ) return { limit: null, used: 0 };
	const limits = limitsOf( env );
	return { limit: tier === 'pro' ? limits.proMonthly : limits.freeMonthly, used: await viewsUsed( env, account.id, now ) };

}

// Whether this account may have a 3D map view now, and if so it's counted: { ok, reason? }.
// reason: 'used-up' (this month's are), 'busy' (today's free ones for everyone are), 'off' (no key).
async function takeView( env, account, tier, mapsKey, now ) {

	if ( ! mapsKey ) return { ok: false, reason: 'off' };
	if ( tier === 'owner' ) return { ok: true };
	const { limit, used } = await viewsOf( env, account, tier, now );
	if ( used >= limit ) return { ok: false, reason: 'used-up' };
	if ( tier === 'free' ) {

		const today = Math.floor( now / DAY_MS ) * DAY_MS;
		const row = await env.DB.prepare( 'SELECT COUNT(*) AS n FROM build_views WHERE tier = \'free\' AND at >= ? AND at < ?' ).bind( today, today + DAY_MS ).first();
		if ( ( row?.n ?? 0 ) >= limitsOf( env ).freeDaily ) return { ok: false, reason: 'busy' };

	}

	// Views older than the Privacy Policy keeps them (LOG_KEEP_MS) go as new ones come, a few at a time.
	await env.DB.batch( [
		env.DB.prepare( 'INSERT INTO build_views ( account_id, tier, at ) VALUES ( ?, ?, ? )' ).bind( account.id, tier, now ),
		env.DB.prepare( 'DELETE FROM build_views WHERE rowid IN ( SELECT rowid FROM build_views WHERE at < ? LIMIT 100 )' ).bind( now - LOG_KEEP_MS ),
	] );
	return { ok: true };

}

// What the page is told about upgrading (premium.js's premium: { enabled, unlocked, billing, price? }),
// for the plan an account is on (or none signed out). The gate is always on (enabled): until
// buying is set up (billing.js's billingSettings) billing.enabled is false and the page says Build
// Pro opens soon; the owner, comps and BUILD_EMAILS have it meanwhile. billing: { enabled, monthly,
// annual, portal } (billingFor), so the page never has a price of its own; price: the monthly one,
// for a page that shows only one.
function premiumFor( env, account, plan ) {

	const billing = billingFor( env, plan );
	const premium = { enabled: true, unlocked: !! plan && plan.tier !== 'free', billing };
	if ( billing.enabled ) premium.price = billing.monthly;
	return premium;

}

// The account as the page shows it ({ id, name, firstName, email, picture }). id: the account's,
// as text, which the editor keeps beside its open project in place of the email (src/cloud.js).
function userOf( account ) {

	const name = account.name || account.username || '';
	return { id: String( account.id ), name, firstName: name.split( /\s+/ )[ 0 ] ?? '', email: account.email || account.username || '', picture: '' };

}

// The plan as the page shows it: { tier, views: { limit, used }, layouts, subscribed, status,
// interval, renewsAt, cancelAtPeriodEnd, pastDue, priceLabel, comped } (planOf's, for "Renews on",
// "Cancels on" and "Payment failed").
async function planFor( env, account, plan, now ) {

	return {
		tier: plan.tier, views: await viewsOf( env, account, plan.tier, now ), layouts: plan.tier === 'free' ? 1 : limitsOf( env ).layouts,
		subscribed: plan.subscribed, status: plan.status, interval: plan.interval, renewsAt: plan.renewsAt, cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
		pastDue: plan.pastDue, priceLabel: plan.priceLabel, comped: plan.comped,
	};

}

// --- config, session, me ---------------------------------------------------------------------

// GET config[?view=<share token>]: { googleClientId, signedIn, user?, plan?, premium, mapsKey?,
// mapsReason? }. mapsKey only when a view is taken (takeView); mapsReason says why not:
// 'sign-in', 'used-up', 'busy', 'off', 'owner-free' (a share link whose owner isn't on Pro).
async function getConfig( context ) {

	const { env, url, now, mapsKey } = context;
	const account = await currentAccount( context );
	const plan = account ? await planOf( env, account, now ) : null;
	const config = { googleClientId: googleClientId( env ), signedIn: !! account, premium: premiumFor( env, account, plan ) };
	const view = url.searchParams.get( 'view' );
	let taken = null;
	if ( view ) {

		const shared = await sharedLayout( env, view, 'l.account_id' );
		if ( shared ) {

			const owner = await accountById( env.DB, shared.account_id );
			const ownerPlan = owner ? await planOf( env, owner, now ) : null;
			taken = ownerPlan && ownerPlan.tier !== 'free' ? await takeView( env, owner, ownerPlan.tier, mapsKey, now ) : { ok: false, reason: 'owner-free' };

		}

	}

	if ( ! taken?.ok && account ) taken = await takeView( env, account, plan.tier, mapsKey, now );
	if ( account ) {

		config.user = userOf( account );
		config.plan = await planFor( env, account, plan, now );

	}

	if ( taken?.ok ) config.mapsKey = mapsKey;
	else config.mapsReason = taken?.reason ?? 'sign-in';
	// The editor opened (once a page: cloud.js asks once), unless on a share link, counted as its
	// view (getShared); and a 3D map view turned away for this month's or today's free ones.
	const counts = view ? [] : visitCounts( 'editor', now );
	if ( config.mapsReason === 'used-up' || config.mapsReason === 'busy' ) counts.push( [ 'build_map_refused', config.mapsReason, 1 ] );
	await countBuild( context, counts );
	return json( config );

}

// GET home[?ref=<host>]: what the dashboard (/build/) shows, without taking a 3D map view: {
// googleClientId, signedIn, user?, plan?, premium }. ref: the site the page was opened from
// ('direct' for none), sent with its first ask only, which counts the visit and that host.
async function getHome( context ) {

	const { env, now, url } = context;
	const ref = url.searchParams.get( 'ref' );
	if ( ref !== null ) {

		const host = METRICS.load.key( ref.toLowerCase() );
		await countBuild( context, [ ...visitCounts( 'dashboard', now ), ...host ? [ [ 'build_ref', host, 1 ] ] : [] ] );

	}

	const account = await currentAccount( context );
	const plan = account ? await planOf( env, account, now ) : null;
	const home = { googleClientId: googleClientId( env ), signedIn: !! account, premium: premiumFor( env, account, plan ) };
	if ( account ) {

		home.user = userOf( account );
		home.plan = await planFor( env, account, plan, now );
		// How many apps (Claude, say) are connected through /mcp now (oauth.js's tokens).
		const connected = await env.DB.prepare( 'SELECT COUNT( DISTINCT client_id ) AS n FROM oauth_tokens WHERE account_id = ? AND expires_at > ?' ).bind( account.id, now ).first();
		home.connections = connected?.n ?? 0;
		home.hasLogo = !! await env.DB.prepare( 'SELECT 1 FROM build_logos WHERE account_id = ?' ).bind( account.id ).first();

	}

	return json( home );

}

// POST session { credential }: World Drive's Google sign-in (accounts.js), answered as the app's
// own Worker answers it: { user, premium, plan, hasMapsKey }, with the session cookie.
async function postSession( context ) {

	const res = await signIn( context );
	const cookie = res.headers.get( 'Set-Cookie' );
	if ( ! res.ok || ! cookie ) return res;
	// The new session's account, read with the cookie it was just given.
	const headers = new Headers( { Cookie: cookie.split( ';' )[ 0 ] } );
	const account = await currentAccount( { ...context, request: new Request( context.request.url, { headers } ) } );
	if ( ! account ) return res;
	const plan = await planOf( context.env, account, context.now );
	const plans = await planFor( context.env, account, plan, context.now );
	// Signed in from Build, and whether that made the account (just now: World Drive's accounts are
	// one, so one made on the game is counted there, not here).
	const made = await context.env.DB.prepare( 'SELECT created_at FROM accounts WHERE id = ?' ).bind( account.id ).first();
	await countBuild( context, [ [ 'build_signin', 'all', 1 ], ...made?.created_at >= context.now - 60 * 1000 ? [ [ 'build_signup', 'new', 1 ] ] : [] ] );
	const hasMapsKey = !! context.mapsKey && ( plan.tier === 'owner' || plans.views.used < plans.views.limit );
	return json( { user: userOf( account ), premium: premiumFor( context.env, account, plan ), plan: plans, hasMapsKey }, 200, { 'Set-Cookie': cookie } );

}

async function deleteSession( context ) {

	return await signOut( context );

}

async function signedInAccount( context ) {

	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	return account;

}

// DELETE connections: every app connected to the account through /mcp is cut off (its tokens deleted),
// and has to be allowed again.
async function disconnectClaude( context ) {

	const account = await signedInAccount( context );
	await context.env.DB.prepare( 'DELETE FROM oauth_tokens WHERE account_id = ?' ).bind( account.id ).run();
	return noContent();

}

// GET me: { user, premium, plan }, for premium.js's checks after paying.
async function getMe( context ) {

	const account = await signedInAccount( context );
	const plan = await planOf( context.env, account, context.now );
	return json( { user: userOf( account ), premium: premiumFor( context.env, account, plan ), plan: await planFor( context.env, account, plan, context.now ) } );

}

// --- saved projects (worker/layouts.js's, on World Drive's accounts) --------------------------

async function listLayouts( context ) {

	const account = await signedInAccount( context );
	const site = context.url.searchParams.get( 'site' );
	const query = site === null
		? context.env.DB.prepare( `SELECT ${ SUMMARY } FROM build_layouts WHERE account_id = ? ORDER BY updated_at DESC` ).bind( account.id )
		: context.env.DB.prepare( `SELECT ${ SUMMARY } FROM build_layouts WHERE account_id = ? AND site = ? ORDER BY updated_at DESC` ).bind( account.id, site );
	const { results } = await query.all();
	return json( { layouts: results.map( summary ) } );

}

async function createLayout( context ) {

	const { request, env, now } = context;
	const account = await signedInAccount( context );
	const plan = await planOf( env, account, now );
	const fields = readFields( await readJson( request, LAYOUT_BYTES + 4096 ), { create: true } );
	const { count, bytes } = await env.DB.prepare( 'SELECT COUNT(*) AS count, COALESCE( SUM( LENGTH( data ) ), 0 ) AS bytes FROM build_layouts WHERE account_id = ?' ).bind( account.id ).first();
	const most = plan.tier === 'free' ? 1 : limitsOf( env ).layouts;
	if ( count >= most ) throw new HttpError( 403, plan.tier === 'free' ? `The free plan saves one project. Build Pro saves up to ${ limitsOf( env ).layouts }.` : `That's ${ most } projects, the most Build Pro saves. Delete some first.` );
	if ( bytes + fields.data.length > ACCOUNT_BYTES ) throw accountFull();
	const row = await env.DB.prepare( `INSERT INTO build_layouts ( id, account_id, site, name, data, created_at, updated_at, lat, lon ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )
		RETURNING ${ SUMMARY }` ).bind( randomToken( 12 ), account.id, fields.site, fields.name, fields.data, now, now, fields.lat ?? null, fields.lon ?? null ).first();
	await countBuild( context, [ [ 'build_project', 'created', 1 ] ] );
	return json( summary( row ), 201, etag( row ) );

}

async function getLayout( context ) {

	const account = await signedInAccount( context );
	const row = await ownLayout( context.env, account, context.params.id, `${ SUMMARY }, data` );
	return jsonWithData( summary( row ), row.data, etag( row ) );

}

// Name and/or data; the version it started from as If-Match: "<updatedAt>" or updatedAt in the
// body (409 if it has moved on since), or none (the save wins).
async function updateLayout( context ) {

	const { request, env, params, now } = context;
	const account = await signedInAccount( context );
	if ( ! ID_PATTERN.test( params.id ) ) throw notFound();
	const body = await readJson( request, LAYOUT_BYTES + 4096 );
	const fields = readFields( body, { create: false } );
	if ( fields.name === undefined && fields.data === undefined && fields.site === undefined ) throw badRequest();
	const expected = expectedVersion( request, body );
	const current = await ownLayout( env, account, params.id, 'updated_at, LENGTH( data ) AS size' );
	if ( expected !== null && expected !== current.updated_at ) throw new HttpError( 409, 'This layout was changed somewhere else', { updatedAt: current.updated_at } );
	if ( fields.data !== undefined ) {

		const { bytes } = await env.DB.prepare( 'SELECT COALESCE( SUM( LENGTH( data ) ), 0 ) AS bytes FROM build_layouts WHERE account_id = ?' ).bind( account.id ).first();
		if ( bytes - current.size + fields.data.length > ACCOUNT_BYTES ) throw accountFull();

	}

	const updatedAt = Math.max( now, current.updated_at + 1 );
	const row = await env.DB.prepare( `UPDATE build_layouts SET name = COALESCE( ?, name ), site = COALESCE( ?, site ), data = COALESCE( ?, data ), lat = COALESCE( ?, lat ), lon = COALESCE( ?, lon ), updated_at = ?
		WHERE id = ? AND account_id = ? AND updated_at = ? RETURNING ${ SUMMARY }` )
		.bind( fields.name ?? null, fields.site ?? null, fields.data ?? null, fields.lat ?? null, fields.lon ?? null, updatedAt, params.id, account.id, current.updated_at ).first();
	if ( ! row ) throw new HttpError( 409, 'This layout was changed somewhere else', { updatedAt: current.updated_at } );
	return json( summary( row ), 200, etag( row ) );

}

async function deleteLayout( context ) {

	const account = await signedInAccount( context );
	if ( ! ID_PATTERN.test( context.params.id ) ) throw notFound();
	const { meta } = await context.env.DB.prepare( 'DELETE FROM build_layouts WHERE id = ? AND account_id = ?' ).bind( context.params.id, account.id ).run();
	if ( ! meta.changes ) throw notFound();
	return noContent();

}

// Share links are Pro's (and the owner's).
async function shareLayout( context ) {

	const { env, params } = context;
	const account = await signedInAccount( context );
	if ( ( await planOf( env, account, context.now ) ).tier === 'free' ) throw new HttpError( 403, 'Share links come with Build Pro.' );
	const row = await ownLayout( env, account, params.id, 'share_token' );
	const shareToken = row.share_token ?? randomToken( 16 );
	if ( ! row.share_token ) {

		await env.DB.prepare( 'UPDATE build_layouts SET share_token = ? WHERE id = ? AND account_id = ?' ).bind( shareToken, params.id, account.id ).run();
		await countBuild( context, [ [ 'build_project', 'shared', 1 ] ] );

	}

	return json( { shared: true, shareToken } );

}

async function unshareLayout( context ) {

	const account = await signedInAccount( context );
	await ownLayout( context.env, account, context.params.id, 'id' );
	await context.env.DB.prepare( 'UPDATE build_layouts SET share_token = NULL WHERE id = ? AND account_id = ?' ).bind( context.params.id, account.id ).run();
	return noContent();

}

async function getShared( context ) {

	const { env, params, now } = context;
	const row = await sharedLayout( env, params.token, 'l.name, l.site, l.data, l.updated_at, a.name AS owner_name' );
	if ( ! row ) throw notFound();
	await countBuild( context, visitCounts( 'share', now ) );
	const owner = row.owner_name?.split( ' ' )[ 0 ] || 'someone';
	return jsonWithData( { name: row.name, site: row.site, updatedAt: row.updated_at, owner }, row.data, { 'X-Robots-Tag': 'noindex' } );

}

// --- the company logo (Build Pro) ----------------------------------------------------------

// At most this many bytes of image, sent as a data: URL in JSON ({ image }), PNG or WebP only (the
// editor redraws whatever was picked as one, 512 px at most).
const LOGO_BYTES = 256 * 1024;
const LOGO_TYPES = { 'image/png': [ 0x89, 0x50, 0x4e, 0x47 ], 'image/webp': [ 0x52, 0x49, 0x46, 0x46 ] };

function logoResponse( row ) {

	if ( ! row ) throw notFound();
	// D1 hands a BLOB back as an array of numbers (or an ArrayBuffer): bytes either way.
	return new Response( new Uint8Array( row.data ), { headers: { 'Content-Type': row.type, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } } );

}

// GET logo: your logo's image, or 404. Shown while you're on Build Pro (or the owner).
async function getLogo( context ) {

	const account = await signedInAccount( context );
	if ( ( await planOf( context.env, account, context.now ) ).tier === 'free' ) throw notFound();
	return logoResponse( await context.env.DB.prepare( 'SELECT type, data FROM build_logos WHERE account_id = ?' ).bind( account.id ).first() );

}

// PUT logo { image: 'data:image/png;base64,...' }: Build Pro and the owner only.
async function putLogo( context ) {

	const { env, request, now } = context;
	const account = await signedInAccount( context );
	if ( ( await planOf( env, account, now ) ).tier === 'free' ) throw new HttpError( 403, 'A company logo comes with Build Pro' );
	const body = await readJson( request, Math.ceil( LOGO_BYTES * 4 / 3 ) + 1024 );
	const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec( typeof body?.image === 'string' ? body.image : '' );
	if ( ! match ) throw new HttpError( 400, 'Send a PNG or WebP image' );
	let bytes;
	try {

		bytes = Uint8Array.from( atob( match[ 2 ] ), c => c.charCodeAt( 0 ) );

	} catch {

		throw new HttpError( 400, 'Send a PNG or WebP image' );

	}

	if ( bytes.length > LOGO_BYTES ) throw new HttpError( 413, 'That logo is too large' );
	if ( ! LOGO_TYPES[ match[ 1 ] ].every( ( b, i ) => bytes[ i ] === b ) ) throw new HttpError( 400, 'Send a PNG or WebP image' );
	await env.DB.prepare( 'INSERT INTO build_logos ( account_id, type, data, updated_at ) VALUES ( ?1, ?2, ?3, ?4 ) ON CONFLICT ( account_id ) DO UPDATE SET type = ?2, data = ?3, updated_at = ?4' )
		.bind( account.id, match[ 1 ], bytes, now ).run();
	return noContent();

}

async function deleteLogo( context ) {

	const account = await signedInAccount( context );
	await context.env.DB.prepare( 'DELETE FROM build_logos WHERE account_id = ?' ).bind( account.id ).run();
	return noContent();

}

// GET shared/:token/logo: the logo of the share link's owner, while they're on Build Pro.
async function getSharedLogo( context ) {

	const { env, params } = context;
	const row = await sharedLayout( env, params.token, 'a.id AS owner_id' );
	if ( ! row ) throw notFound();
	const owner = await env.DB.prepare( 'SELECT * FROM accounts WHERE id = ?' ).bind( row.owner_id ).first();
	if ( ! owner || ( await planOf( env, owner, context.now ) ).tier === 'free' ) throw notFound();
	return logoResponse( await env.DB.prepare( 'SELECT type, data FROM build_logos WHERE account_id = ?' ).bind( row.owner_id ).first() );

}

async function sharedLayout( env, token, columns ) {

	if ( typeof token !== 'string' || ! SHARE_PATTERN.test( token ) ) return null;
	return await env.DB.prepare( `SELECT ${ columns } FROM build_layouts l JOIN accounts a ON a.id = l.account_id WHERE l.share_token = ?` ).bind( token ).first();

}

function accountFull() {

	return new HttpError( 403, 'Your account is full. Delete some projects first.' );

}

async function ownLayout( env, account, id, columns ) {

	if ( ! ID_PATTERN.test( id ) ) throw notFound();
	// Someone else's is "not found" too, so ids can't be probed.
	const row = await env.DB.prepare( `SELECT ${ columns } FROM build_layouts WHERE id = ? AND account_id = ?` ).bind( id, account.id ).first();
	if ( ! row ) throw notFound();
	return row;

}

function readFields( body, { create } ) {

	if ( ! isObject( body ) ) throw badRequest();
	const fields = {};
	// The place's name: given when it's made, and again when the project is moved (product.js's site picker).
	if ( create || body.site !== undefined ) fields.site = required( cleanText( body.site, 100 ) );
	if ( create || body.name !== undefined ) fields.name = required( cleanText( body.name, 100 ) );
	if ( create || body.data !== undefined ) {

		// The app's layout format: { version, items: [...], extras: {...}, ... }.
		if ( ! isObject( body.data ) || ! Array.isArray( body.data.items ) ) throw badRequest();
		fields.data = JSON.stringify( body.data );
		// Where it is (layout.js puts the site's lat and lon in it), for the dashboard.
		const { lat, lon } = body.data;
		if ( Number.isFinite( lat ) && Number.isFinite( lon ) && Math.abs( lat ) <= 90 && Math.abs( lon ) <= 180 ) Object.assign( fields, { lat, lon } );
		if ( fields.data.length > LAYOUT_BYTES ) throw new HttpError( 413, 'That project is too big to save' );

	}

	return fields;

}

function required( value ) {

	if ( value === null || value === '' ) throw badRequest();
	return value;

}

function expectedVersion( request, body ) {

	const header = request.headers.get( 'If-Match' );
	if ( header === null && body.updatedAt === undefined ) return null;
	if ( header?.trim() === '*' ) return null;
	const value = header !== null ? Number( header.replace( /^W\//, '' ).replace( /"/g, '' ) ) : body.updatedAt;
	if ( ! Number.isSafeInteger( value ) ) throw badRequest();
	return value;

}

function summary( row ) {

	return { id: row.id, site: row.site, name: row.name, shared: !! row.share_token, shareToken: row.share_token ?? null, updatedAt: row.updated_at, lat: row.lat ?? null, lon: row.lon ?? null };

}

function etag( row ) {

	return { ETag: `"${ row.updated_at }"` };

}

// The layout's fields with its data spliced in as it's stored (no parse and stringify again).
function jsonWithData( fields, data, headers ) {

	const head = JSON.stringify( fields );
	return jsonText( `${ head.slice( 0, - 1 ) },"data":${ data }}`, 200, headers );

}

