import { HttpError, isObject, json, list } from '../http.js';
import { LINK_ID_PATTERN, cleanEmail, readEvent, stripeId } from '../stripe.js';
import { database } from './players.js';
import { googleClientId } from './settings.js';
import { stripeApi, stripeSecret, stripeTestMode } from './stripe-api.js';
import { orderReversed, recordOrder } from './shop.js';

// The Supporter Pass (docs/world-drive.md), towards World Drive's running costs, three ways, each
// through a Stripe Payment Link of its own: a subscription (monthly, kept while it runs), bought once
// and kept for good (a lifetime pass), or for 24 hours (a day pass: the same pass for a day).
// One-time passes from before there was a choice are kept for good, as lifetime ones are. What it unlocks in the page (four more rides, the whole Garage) the
// page locks itself (src/drive-app/pro.js); the Worker keeps who has it, gives supporters more
// drives a day (index.js) and puts a ⭐ by their names on the leaderboard (scores.js). Stripe tells
// us about each payment, refund and chargeback through a webhook, signed (checked in ../stripe.js,
// which the construction app's premium.js shares), and the page asks /api/me (accounts.js) whether
// you have it. A pass is an account's (Google's sign-in or a username's, accounts.js and
// logins.js), so it goes with you to any browser.
//
// Settings (wrangler.drive.jsonc vars, or the dashboard; secrets in the dashboard only):
//   GOOGLE_CLIENT_ID             the sign-in button's OAuth client id (public)
//   SUPPORTER_PAYMENT_LINK       the lifetime pass's Payment Link, https://buy.stripe.com/... (public)
//   SUPPORTER_PAYMENT_LINK_ID    optional, plink_... (public; several, comma-separated): only
//                                checkouts through those links (and the day pass's) count. The
//                                Stripe account is World Drive's own, so without it every paid
//                                checkout on the account is a pass.
//   SUPPORTER_PRICE              what it costs, as the page shows it: "CA$9.99"
//   SUPPORTER_MONTHLY_PAYMENT_LINK  optional (public): the subscription's Payment Link
//   SUPPORTER_MONTHLY_PRICE      its price as the page shows it: "CA$1.99/month"
//   DAY_PASS_PAYMENT_LINK        optional (public): the 24-hour pass's Payment Link
//   DAY_PASS_PAYMENT_LINK_ID     its plink_... (public). Both are needed for the page to offer it,
//                                since a checkout is told to be a day pass (not a pass for good)
//                                only by its link's id.
//   DAY_PASS_PRICE               the day pass's price as the page shows it: "CA$0.99"
//   SUPPORTER_MANAGE_LINK        optional (public): Stripe's customer portal login link,
//                                https://billing.stripe.com/p/login/..., where a subscriber cancels
//                                or changes their card. The pass's sheet links to it.
//   STRIPE_WEBHOOK_SECRET        secret: the webhook endpoint's signing secret, whsec_...
//   SUPPORTER_EMAILS             optional secret, comma-separated: people with the pass without paying
//   PER_VISITOR_DAILY_SUPPORTER  a supporter's drives a day, a day pass's too (30 if unset)
// Buying is on only when GOOGLE_CLIENT_ID, the link and the secret are all set. A link that isn't
// https, a secret that isn't a whsec_ one (an API key pasted there by mistake) or a link id that
// isn't a plink_ one leaves it off.
//
// World Drive Build Pro (build.js, billing.js) shares the webhook: its own checkouts say so in their
// metadata (pass 'build'), and its subscriptions, invoices, refunds and chargebacks are kept here too
// (docs/build.md). Every event's id is kept (stripe_events), so one already acted on is skipped
// when Stripe sends it again.

const ACCOUNT_ID = /^[1-9][0-9]{0,14}$/;
const MAX_PRICE = 40;
// A subscription's statuses that keep its pass (past_due: Stripe is still retrying the card).
// Any other (canceled, unpaid, incomplete_expired, paused...) takes it away until it's active again.
export const ACTIVE_STATUSES = [ 'active', 'trialing', 'past_due' ];
const STATUS = /^[a-z_]{1,40}$/;
const EVENT_ID = /^evt_[A-Za-z0-9_]{1,250}$/;
// An event still 'processing' this long after it came in (ms) was cut off half done: Stripe's next
// try at it is let through.
const STUCK_MS = 5 * 60 * 1000;
// How long a day pass lasts (ms) from its payment.
export const DAY_PASS_MS = 24 * 60 * 60 * 1000;

// { secret, linkIds, dayLinkId, testMode } for the webhook, or null when it can't check what Stripe
// sends. It needs only the secret: a payment that arrives is kept, whether or not the page offers
// buying just now. linkIds: SUPPORTER_PAYMENT_LINK_ID's (none: any link). dayLinkId: the day pass's
// link (DAY_PASS_PAYMENT_LINK_ID, or ''), whose checkouts are day passes. testMode: the link is a
// test-mode one (https://buy.stripe.com/test_...), so payments made with Stripe's test cards count;
// with a live link, or none, only real ones do.
function webhookSettings( env ) {

	const secret = text( env.STRIPE_WEBHOOK_SECRET );
	const linkIds = text( env.SUPPORTER_PAYMENT_LINK_ID ).split( ',' ).map( id => id.trim() ).filter( Boolean );
	if ( ! secret.startsWith( 'whsec_' ) || linkIds.some( id => ! LINK_ID_PATTERN.test( id ) ) ) return null;
	return {
		secret, linkIds, dayLinkId: dayLinkId( env ), buildLinkId: buildLinkId( env ),
		// BUILD_PAYMENT_LINK_ID set to something that isn't a link id: a checkout through Build Pro's old
		// link can't be told apart, so a link that isn't the day pass's is never taken for the pass.
		buildLinkBroken: text( env.BUILD_PAYMENT_LINK_ID ) !== '' && ! buildLinkId( env ),
		testMode: paymentLink( env )?.pathname.startsWith( '/test_' ) ?? false,
		// Build Pro sold with a test-mode key (a staging Worker): its test-mode events count, for Build Pro only.
		buildTestMode: stripeTestMode( env ),
	};

}

// Whether the webhook can check what Stripe sends (its secret, and the link ids, are set right):
// Build Pro isn't sold without it (billing.js).
export function webhookReady( env ) {

	return !! webhookSettings( env );

}

// BUILD_PAYMENT_LINK_ID (World Drive Build's Pro plan, build.js) when it's a plink_ id, else ''.
export function buildLinkId( env ) {

	const id = text( env.BUILD_PAYMENT_LINK_ID );
	return LINK_ID_PATTERN.test( id ) ? id : '';

}

// DAY_PASS_PAYMENT_LINK_ID when it's a plink_ id, else ''.
function dayLinkId( env ) {

	const id = text( env.DAY_PASS_PAYMENT_LINK_ID );
	return LINK_ID_PATTERN.test( id ) ? id : '';

}

// { link, price } for the day pass when it's offered (its link and the link's id set, and buying on),
// else null.
function dayPassSettings( env ) {

	const link = urlOf( env.DAY_PASS_PAYMENT_LINK );
	if ( link?.protocol !== 'https:' || ! dayLinkId( env ) ) return null;
	return { link: link.href, price: cleanPrice( env.DAY_PASS_PRICE ) };

}

// { link, price } when buying is on, else null.
export function purchaseSettings( env ) {

	const link = paymentLink( env );
	if ( link?.protocol !== 'https:' || ! googleClientId( env ) || ! webhookSettings( env ) ) return null;
	return { link: link.href, price: cleanPrice( env.SUPPORTER_PRICE ) };

}

// A price setting as the page shows it: no control characters, and short.
function cleanPrice( value ) {

	return text( value ).replace( /[\u0000-\u001f\u007f]/g, '' ).slice( 0, MAX_PRICE );

}

// SUPPORTER_PAYMENT_LINK as a URL, or null when it isn't one.
function paymentLink( env ) {

	return urlOf( env.SUPPORTER_PAYMENT_LINK );

}

function urlOf( value ) {

	try {

		return new URL( text( value ) );

	} catch {

		return null;

	}

}

// What the page is told about buying: { enabled: false }, or where and for how much (the lifetime
// pass's link and price; monthly: the subscription's, and day: the day pass's, when they're offered), and for an account the id
// the page puts on the link as client_reference_id, which Stripe hands back with the payment, so we
// know whose it is.
export function purchaseFor( env, account ) {

	const settings = purchaseSettings( env );
	if ( ! settings ) return { enabled: false };
	const purchase = { enabled: true, link: settings.link, price: settings.price };
	const monthly = urlOf( env.SUPPORTER_MONTHLY_PAYMENT_LINK );
	if ( monthly?.protocol === 'https:' ) purchase.monthly = { link: monthly.href, price: cleanPrice( env.SUPPORTER_MONTHLY_PRICE ) };
	const day = dayPassSettings( env );
	if ( day ) purchase.day = day;
	const manage = manageLink( env );
	if ( manage ) purchase.manage = manage;
	if ( account ) purchase.clientReferenceId = String( account.id );
	return purchase;

}

// SUPPORTER_MANAGE_LINK when it's an https link, else ''.
function manageLink( env ) {

	try {

		const url = new URL( text( env.SUPPORTER_MANAGE_LINK ) );
		return url.protocol === 'https:' ? url.href : '';

	} catch {

		return '';

	}

}

// Whether this account ({ id, email }) has the pass at `now` (ms).
export async function isSupporter( env, account, now = Date.now() ) {

	return ( await supporterPass( env, account, now ) ).supporter;

}

// { supporter, subscribed, dayPassUntil? }: whether this account has the pass at `now` (ms),
// whether it has it through a subscription that's running (so the page offers to manage it), and,
// when all it has is a day pass, when that ends (ms; the latest one's, if it bought more than one).
export async function supporterPass( env, account, now = Date.now() ) {

	const own = `FROM accounts a JOIN purchases u ON ${ ownPurchase( 'u', 'a' ) } WHERE a.id = ?1 AND ${ livePurchase( 'u', '?2' ) }`;
	const row = await database( env ).prepare( `SELECT ${ hasPass( '?1', '?2' ) } AS supporter,
		EXISTS ( SELECT 1 ${ own } AND u.subscription IS NOT NULL ) AS subscribed,
		EXISTS ( SELECT 1 ${ own } AND u.pass IS NULL ) OR EXISTS ( SELECT 1 FROM accounts a WHERE a.id = ?1 AND a.email IN ( SELECT value FROM json_each( ?2, '$.emails' ) ) ) AS lasting,
		( SELECT MAX( u.created_at ) ${ own } AND u.pass = 'day' ) AS day_from` ).bind( account.id, supporterEmails( env, now ) ).first();
	const supporter = !! row?.supporter;
	const pass = { supporter, subscribed: supporter && !! row?.subscribed };
	if ( supporter && ! row?.lasting && Number.isSafeInteger( row?.day_from ) ) pass.dayPassUntil = row.day_from + DAY_PASS_MS;
	return pass;

}

// World Drive Build's Pro plan for this account (build.js) at `now` (ms): { pro, subscribed, status,
// interval, renewsAt, cancelAtPeriodEnd, pastDue, comped, customer }. pro: a purchase of it (pass
// 'build': its own checkout, billing.js, or its old Payment Link), its or bought with its Google
// email, not refunded or charged back, its subscription not stopped (as livePurchase has it for the
// pass's: past_due keeps it while Stripe retries the card; canceled, unpaid and the rest end it);
// or given by the owner (build_comps, until a time or for good); or its email in BUILD_EMAILS
// (testers). subscribed: through a subscription that's running, so the page offers to manage it.
// status: that subscription's (or the last one's, once stopped: 'canceled', 'unpaid', or 'refunded'
// and 'disputed' for one whose money was taken back), null with none. interval: 'month' or 'year'.
// renewsAt (ms): when it renews, or ends if cancelAtPeriodEnd. pastDue: its last invoice failed, or
// Stripe says past_due, so the page asks for a new card. customer: the account has a Stripe customer
// (billing.js), so it can open the billing portal.
export async function buildPlan( env, account, now = Date.now() ) {

	const email = typeof account?.email === 'string' ? account.email.toLowerCase() : '';
	const listed = !! email && list( env.BUILD_EMAILS ).includes( email );
	const active = ACTIVE_STATUSES.map( status => `'${ status }'` ).join( ', ' );
	// The account's best Build Pro purchase (a live one first, a subscription's before a one-time
	// one, the newest), with its subscription as last heard, and whether its latest invoice failed.
	const row = await database( env ).prepare( `SELECT a.stripe_customer AS customer,
		EXISTS ( SELECT 1 FROM build_comps c WHERE c.account_id = a.id AND ( c.until IS NULL OR c.until > ?2 ) ) AS comped, p.*
		FROM accounts a LEFT JOIN ( SELECT u.subscription, u.status AS purchase_status, u.refunded_at, s.status, s.interval, s.current_period_end,
			s.cancel_at_period_end, s.cancel_at,
			( u.refunded_at IS NULL AND ( u.subscription IS NULL OR s.id IS NULL OR s.status IN ( ${ active } ) ) ) AS live,
			( SELECT i.status FROM invoices i WHERE i.subscription = u.subscription ORDER BY i.created_at DESC LIMIT 1 ) IN ( 'payment_failed', 'action_required' ) AS failed
			FROM accounts b JOIN purchases u ON ${ ownPurchase( 'u', 'b' ) } LEFT JOIN subscriptions s ON s.id = u.subscription
			WHERE b.id = ?1 AND u.pass = 'build' ORDER BY live DESC, u.subscription IS NULL, u.created_at DESC LIMIT 1 ) p ON 1
		WHERE a.id = ?1` ).bind( account.id, now ).first();
	const live = !! row?.live;
	const subscribed = live && !! row.subscription;
	let status = null;
	if ( row?.subscription ) status = row.refunded_at !== null ? row.purchase_status : row.status ?? 'active';
	return {
		pro: live || !! row?.comped || listed,
		subscribed,
		status,
		interval: subscribed && ( row.interval === 'month' || row.interval === 'year' ) ? row.interval : null,
		renewsAt: subscribed ? row.cancel_at ?? row.current_period_end ?? null : null,
		cancelAtPeriodEnd: subscribed && !! row.cancel_at_period_end,
		pastDue: subscribed && ( row.status === 'past_due' || !! row.failed ),
		comped: !! row?.comped || listed,
		customer: !! row?.customer,
	};

}

// SQL that's true when the account with the id `account` (SQL: a parameter or a column) has the
// pass: bought by it and not refunded (and, for a subscription, the subscription still active, and
// for a day pass, bought in the last 24 hours: livePurchase; a lifetime or legacy one-time purchase
// keeps it for good), or bought with its email by someone not signed in (Google has checked the
// email is theirs), or its email is in SUPPORTER_EMAILS. `emails` is supporterEmails' JSON, bound
// as a parameter: SUPPORTER_EMAILS' list and the time now, which a day pass is measured against. NULL, a player of no account's, is never a supporter. An account with no
// Google account linked has no email (''), and a purchase Stripe sent without one has '' too: the
// email only counts when there is one, or every username's account would have that purchase. The
// leaderboard asks this of each row it shows, so it's one look in each of the indexes it uses.
export function hasPass( account, emails ) {

	return `EXISTS ( SELECT 1 FROM accounts a WHERE a.id = ${ account } AND ( a.email IN ( SELECT value FROM json_each( ${ emails }, '$.emails' ) )
		OR EXISTS ( SELECT 1 FROM purchases u WHERE ${ livePurchase( 'u', emails ) } AND ${ ownPurchase( 'u', 'a' ) } ) ) )`;

}

// SQL: the purchase `u` is the account `a`'s (bought signed in as it, or with its Google email).
function ownPurchase( u, a ) {

	return `( ${ u }.account_id = ${ a }.id OR ( ${ u }.account_id IS NULL AND ${ u }.email = ${ a }.email AND ${ a }.email <> '' ) )`;

}

// SQL: the purchase `u` still gives the pass at the time in `settings` (supporterEmails' JSON, as
// SQL: a parameter): not refunded; a pass for good (pass NULL) or a day pass bought less than
// DAY_PASS_MS ago (any other kind, one a later version knows, gives nothing here); and either a
// one-time purchase (no subscription) or a subscription Stripe hasn't told us has stopped (none
// heard of yet counts: its checkout was paid).
function livePurchase( u, settings ) {

	const active = ACTIVE_STATUSES.map( status => `'${ status }'` ).join( ', ' );
	return `( ${ u }.refunded_at IS NULL
		AND ( ${ u }.pass IS NULL OR ( ${ u }.pass = 'day' AND ${ u }.created_at > json_extract( ${ settings }, '$.now' ) - ${ DAY_PASS_MS } ) )
		AND ( ${ u }.subscription IS NULL
		OR NOT EXISTS ( SELECT 1 FROM subscriptions s WHERE s.id = ${ u }.subscription AND s.status NOT IN ( ${ active } ) ) ) )`;

}

// What hasPass takes, as one JSON parameter: SUPPORTER_EMAILS, and `now` (ms), the time day passes
// are measured against.
export function supporterEmails( env, now = Date.now() ) {

	return JSON.stringify( { emails: list( env.SUPPORTER_EMAILS ), now } );

}

// POST /api/stripe/webhook, from Stripe's servers: the one route with no session and without the
// same-origin check (index.js), since it doesn't come from a page; its Stripe-Signature proves it
// instead (readEvent: an HMAC of the raw body with the signing secret, compared in constant time
// with each v1, within five minutes of when it was signed). Anything properly signed is answered
// 200, including events this doesn't act on, so Stripe doesn't keep sending them again. Each event
// is kept by its id first (stripe_events): one already acted on is answered and skipped. One that
// fails is marked so and answered 500, and Stripe's next try at it is let through.
export async function stripeWebhook( { request, env, now } ) {

	const settings = webhookSettings( env );
	if ( ! settings ) throw new HttpError( 503, 'Not set up yet' );
	const db = database( env );
	const event = await readEvent( request, settings.secret );
	// A test-mode event (a test-mode endpoint's secret set here by mistake) is a payment made with a
	// test card, which anyone with a test link can make for nothing: never a pass on the live site.
	// With Build Pro sold on a test key (staging), test-mode events are for Build Pro only.
	let buildOnly = false;
	if ( event.livemode !== true && ! settings.testMode ) {

		if ( ! settings.buildTestMode ) return json( { received: true } );
		buildOnly = true;

	}

	const id = typeof event.id === 'string' && EVENT_ID.test( event.id ) ? event.id : null;
	if ( id && ! await firstLook( db, id, event.type, now ) ) return json( { received: true } );
	let result;
	try {

		result = await handleEvent( env, db, settings, event, now, buildOnly );

	} catch ( err ) {

		if ( id ) await db.prepare( 'UPDATE stripe_events SET result = \'error\' WHERE id = ?' ).bind( id ).run();
		await countWebhook( db, now, 'error' );
		throw err;

	}

	if ( id ) await db.prepare( 'UPDATE stripe_events SET result = ? WHERE id = ?' ).bind( result, id ).run();
	if ( result === 'unmatched' ) await countWebhook( db, now, result );
	return json( { received: true } );

}

// Keeps the event's id, and says whether to act on it: not if it has been acted on already, or is
// being now. One that did nothing ('ignored') or failed is looked at again: acting on it again does
// no harm, since nothing came of it the first time.
async function firstLook( db, id, type, now ) {

	const kind = typeof type === 'string' ? type.slice( 0, 100 ) : '';
	const row = await db.prepare( `INSERT INTO stripe_events ( id, type, received_at, result ) VALUES ( ?1, ?2, ?3, 'processing' )
		ON CONFLICT ( id ) DO UPDATE SET received_at = excluded.received_at, result = 'processing'
		WHERE stripe_events.result IN ( 'ignored', 'error' ) OR ( stripe_events.result = 'processing' AND stripe_events.received_at < ?4 ) RETURNING id` )
		.bind( id, kind, now, now - STUCK_MS ).first();
	return !! row;

}

// A webhook event that went wrong ('error') or paid for nothing we sell ('unmatched'), counted for
// the owner's admin page (stats.js's stats_daily, as build_webhook:<result>).
async function countWebhook( db, now, result ) {

	try {

		await db.prepare( `INSERT INTO stats_daily ( day, metric, key, n ) VALUES ( ?, 'build_webhook', ?, 1 )
			ON CONFLICT ( day, metric, key ) DO UPDATE SET n = n + 1` ).bind( new Date( now ).toISOString().slice( 0, 10 ), result ).run();

	} catch ( err ) {

		console.error( 'Stats', err?.name, err?.message );

	}

}

// What an event does: 'ok', 'ignored' (nothing here to do) or 'unmatched' (stripe_events' result).
async function handleEvent( env, db, settings, event, now, buildOnly ) {

	const object = isObject( event.data?.object ) ? event.data.object : {};
	const eventAt = Number.isSafeInteger( event.created ) ? event.created * 1000 : now;
	switch ( event.type ) {

		case 'checkout.session.completed':
		case 'checkout.session.async_payment_succeeded':
			// The made-by-hand shop's (shop.js): an order to make and post, never a pass.
			if ( isObject( object.metadata ) && object.metadata.shop === 'order' ) return await recordOrder( env, object, event.livemode === true, now );
			return await recordPurchase( env, db, settings, object, now, buildOnly );
		// Stripe only sets refunded once the whole charge is; a partial refund keeps the pass.
		case 'charge.refunded':
			if ( object.refunded !== true ) return 'ignored';
			await orderReversed( env, object.payment_intent, 'refunded' );
			await takeBack( db, object.payment_intent, 'refunded', now );
			await endBuild( env, db, chargeOf( object ), 'refunded', now );
			return 'ok';
		// A chargeback opened: Build Pro ends at once, and its subscription is cancelled so it isn't
		// billed again (the Supporter Pass waits for the money to go, as it always has).
		case 'charge.dispute.created':
			return await endBuild( env, db, disputeOf( object ), 'disputed', now ) ? 'ok' : 'ignored';
		// A chargeback: the bank takes the money back as the dispute opens, and gives it back if it's won.
		case 'charge.dispute.funds_withdrawn':
			await orderReversed( env, object.payment_intent, 'disputed' );
			await takeBack( db, object.payment_intent, 'disputed', now );
			await endBuild( env, db, disputeOf( object ), 'disputed', now );
			return 'ok';
		case 'charge.dispute.funds_reinstated':
			await orderReversed( env, object.payment_intent, 'reinstated' );
			await giveBack( db, object.payment_intent );
			await giveBuildBack( db, disputeOf( object ) );
			return 'ok';
		// A subscription started, changed (a renewal that failed, a card fixed, set to cancel) or ended: its pass follows.
		case 'customer.subscription.created':
		case 'customer.subscription.updated':
		case 'customer.subscription.deleted':
			return await subscriptionChanged( db, object, eventAt, now );
		case 'invoice.paid':
		case 'invoice.payment_failed':
		case 'invoice.payment_action_required':
			return await invoiceChanged( env, db, object, event.type, now );
		default:
			return 'ignored';

	}

}

// A Checkout Session that has been paid (through our links, when SUPPORTER_PAYMENT_LINK_ID is set).
// Through the day pass's link (DAY_PASS_PAYMENT_LINK_ID), it's a day pass, from when it's recorded.
// Paying by bank debit and the like completes the checkout unpaid; async_payment_succeeded follows
// once the money arrives. Recorded once per session, so the same event arriving again (Stripe
// retries until it hears 200) changes nothing. It's the account the page named on the link, if
// there is one; else nobody's yet, and whoever signs in with the email paid with has it. A payment
// already taken back (its refund delivered first, while Stripe was still retrying this) comes in
// taken back.
// A subscription's checkout has its subscription's id, so the pass lasts while that's active; one
// that starts with a free trial completes with nothing to pay ('no_payment_required').
// World Drive Build Pro's own checkout (billing.js) says so in its metadata (pass 'build', and the
// account in account_id); one through its old Payment Link is told by the link's id. It's kept as
// its own kind, which gives no pass. A paid checkout that's neither and came through no Payment Link
// (one made through the API, as Build Pro's are) is never a pass, whatever the link settings say:
// it's 'unmatched', kept in stripe_events for the owner to look at.
async function recordPurchase( env, db, settings, session, now, buildOnly ) {

	const subscription = session.mode === 'subscription' ? stripeId( session.subscription ) : null;
	if ( session.payment_status !== 'paid' && ! ( subscription && session.payment_status === 'no_payment_required' ) ) return 'ignored';
	const link = stripeId( session.payment_link );
	const metadata = isObject( session.metadata ) ? session.metadata : {};
	let pass = null;
	if ( metadata.pass === 'build' || ( settings.buildLinkId && link === settings.buildLinkId ) ) pass = 'build';
	else if ( metadata.pass !== undefined ) return 'unmatched';
	else if ( settings.dayLinkId && link === settings.dayLinkId ) pass = 'day';
	else if ( ! link || settings.buildLinkBroken ) return 'unmatched';
	else if ( settings.linkIds.length && ! settings.linkIds.includes( link ) ) return 'ignored';
	if ( buildOnly && pass !== 'build' ) return 'ignored';
	const id = stripeId( session.id );
	if ( ! id ) return 'ignored';
	const email = cleanEmail( session.customer_details?.email ?? session.customer_email );
	const named = typeof metadata.account_id === 'string' && ACCOUNT_ID.test( metadata.account_id ) ? metadata.account_id : session.client_reference_id;
	const reference = typeof named === 'string' && ACCOUNT_ID.test( named ) ? Number( named ) : null;
	const amount = Number.isSafeInteger( session.amount_total ) ? session.amount_total : null;
	const currency = typeof session.currency === 'string' && /^[a-z]{3}$/.test( session.currency ) ? session.currency : null;
	// How much of amount was tax, which Stripe collects as the merchant of record (Managed Payments),
	// so the admin page can tell what's World Drive's from what's the tax's; NULL when Stripe didn't say.
	const tax = Number.isSafeInteger( session.total_details?.amount_tax ) && session.total_details.amount_tax >= 0 ? session.total_details.amount_tax : null;
	// Build Pro's subscription checkout has no PaymentIntent: a refund or chargeback that came first
	// is found through its subscription's invoices.
	await db.prepare( `INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, payment_intent, status, created_at, refunded_at, subscription, pass, tax )
		VALUES ( ?1, ( SELECT id FROM accounts WHERE id = ?2 ), ?3, ?4, ?5, ?6,
			COALESCE( ( SELECT status FROM reversals WHERE payment_intent = ?6 ), ( SELECT r.status FROM invoices i JOIN reversals r ON r.payment_intent = i.payment_intent
				WHERE ?9 = 'build' AND i.subscription = ?8 ORDER BY r.status = 'refunded' DESC LIMIT 1 ), 'paid' ), ?7,
			COALESCE( ( SELECT created_at FROM reversals WHERE payment_intent = ?6 ), ( SELECT r.created_at FROM invoices i JOIN reversals r ON r.payment_intent = i.payment_intent
				WHERE ?9 = 'build' AND i.subscription = ?8 LIMIT 1 ) ), ?8, ?9, ?10 ) ON CONFLICT ( checkout_session ) DO NOTHING` )
		.bind( id, reference, email, amount, currency, stripeId( session.payment_intent ), now, subscription, pass, tax ).run();
	// Build Pro whose money was taken back before its checkout arrived: its subscription is
	// cancelled now, as it would have been then.
	if ( pass === 'build' && subscription ) {

		const row = await db.prepare( 'SELECT refunded_at FROM purchases WHERE checkout_session = ?' ).bind( id ).first();
		if ( Number.isSafeInteger( row?.refunded_at ) ) await cancelSubscription( env, db, subscription );
		// A second Build Pro running for the same account (two checkouts paid, despite billing.js
		// expiring the older): counted for the admin page (build_webhook:duplicate), for the owner to
		// refund and cancel one.
		else if ( reference !== null && await otherBuild( db, reference, subscription ) ) {

			console.error( 'Stripe', 'a second Build Pro subscription for one account' );
			await countWebhook( db, now, 'duplicate' );

		}

	}

	return 'ok';

}

// Whether the account `account` has a Build Pro subscription running other than `subscription`.
async function otherBuild( db, account, subscription ) {

	const active = ACTIVE_STATUSES.map( status => `'${ status }'` ).join( ', ' );
	return !! await db.prepare( `SELECT 1 FROM subscriptions WHERE account_id = ?1 AND pass = 'build' AND id <> ?2 AND status IN ( ${ active } )
		UNION ALL SELECT 1 FROM purchases u WHERE u.account_id = ?1 AND u.pass = 'build' AND u.subscription <> ?2 AND u.refunded_at IS NULL
		AND NOT EXISTS ( SELECT 1 FROM subscriptions s WHERE s.id = u.subscription AND s.status NOT IN ( ${ active } ) ) LIMIT 1` ).bind( account, subscription ).first();

}

// Stripe's time (seconds) in ms, or null.
function msOf( seconds ) {

	return Number.isSafeInteger( seconds ) ? seconds * 1000 : null;

}

// SQL: where the subscription status `status` (SQL) comes in a subscription's life, so that of two
// events made in the same second (Stripe's times are whole seconds) the later in its life wins,
// whichever arrives last: a retried 'incomplete' never undoes 'active'.
function statusRank( status ) {

	return `CASE ${ status } WHEN 'incomplete' THEN 0 WHEN 'trialing' THEN 1 WHEN 'active' THEN 2 WHEN 'past_due' THEN 3
		WHEN 'unpaid' THEN 4 WHEN 'paused' THEN 4 WHEN 'canceled' THEN 5 WHEN 'incomplete_expired' THEN 5 ELSE 2 END`;

}

// A subscription as Stripe says it is, from an event made at `eventAt` (ms): kept unless a newer
// event has already said otherwise (or, in the same second, one later in its life: statusRank). Its price, period and cancelling are read where either of
// Stripe's API versions puts them (the period on the subscription, or on its item since 2025).
async function subscriptionChanged( db, subscription, eventAt, now ) {

	const id = stripeId( subscription.id );
	const status = typeof subscription.status === 'string' && STATUS.test( subscription.status ) ? subscription.status : null;
	if ( ! id || ! id.startsWith( 'sub_' ) || ! status ) return 'ignored';
	const metadata = isObject( subscription.metadata ) ? subscription.metadata : {};
	const item = isObject( subscription.items?.data?.[ 0 ] ) ? subscription.items.data[ 0 ] : {};
	const price = isObject( item.price ) ? item.price : isObject( subscription.plan ) ? subscription.plan : {};
	const interval = price.recurring?.interval ?? price.interval;
	const amount = price.unit_amount ?? price.amount;
	const quantity = item.quantity ?? subscription.quantity;
	const cancelAt = msOf( subscription.cancel_at );
	await db.prepare( `INSERT INTO subscriptions ( id, status, event_at, updated_at, account_id, customer, pass, price_id, interval, amount, currency, quantity,
		current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at, latest_invoice )
		VALUES ( ?1, ?2, ?3, ?4, ( SELECT id FROM accounts WHERE id = ?5 ), ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18 )
		ON CONFLICT ( id ) DO UPDATE SET status = excluded.status, event_at = excluded.event_at, updated_at = excluded.updated_at,
			account_id = COALESCE( excluded.account_id, subscriptions.account_id ), customer = COALESCE( excluded.customer, subscriptions.customer ),
			pass = COALESCE( excluded.pass, subscriptions.pass ), price_id = excluded.price_id, interval = excluded.interval, amount = excluded.amount,
			currency = excluded.currency, quantity = excluded.quantity, current_period_start = excluded.current_period_start,
			current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, cancel_at = excluded.cancel_at,
			canceled_at = excluded.canceled_at, latest_invoice = excluded.latest_invoice
		WHERE excluded.event_at > subscriptions.event_at
			OR ( excluded.event_at = subscriptions.event_at AND ${ statusRank( 'excluded.status' ) } >= ${ statusRank( 'subscriptions.status' ) } )` ).bind(
		id, status, eventAt, now,
		typeof metadata.account_id === 'string' && ACCOUNT_ID.test( metadata.account_id ) ? Number( metadata.account_id ) : null,
		stripeId( subscription.customer ), metadata.pass === 'build' ? 'build' : null, stripeId( price.id ),
		interval === 'month' || interval === 'year' || interval === 'week' || interval === 'day' ? interval : null,
		Number.isSafeInteger( amount ) ? amount : null,
		typeof price.currency === 'string' && /^[a-z]{3}$/.test( price.currency ) ? price.currency : null,
		Number.isSafeInteger( quantity ) ? quantity : null,
		msOf( subscription.current_period_start ?? item.current_period_start ), msOf( subscription.current_period_end ?? item.current_period_end ),
		subscription.cancel_at_period_end === true || cancelAt !== null ? 1 : 0, cancelAt, msOf( subscription.canceled_at ), stripeId( subscription.latest_invoice ),
	).run();
	return 'ok';

}

// A subscription's invoice paid (the first or a renewal), failed, or waiting on the customer (3D
// Secure): kept in invoices, with the charge and PaymentIntent it was paid with, which is how a
// refund or a chargeback later finds its subscription. A paid invoice stays paid whatever arrives
// after. Paid with money already taken back (the refund's event came first): Build Pro ends now.
// Stripe's newer API versions put the subscription under parent and the payment under payments.
async function invoiceChanged( env, db, invoice, type, now ) {

	const id = stripeId( invoice.id );
	const details = isObject( invoice.parent?.subscription_details ) ? invoice.parent.subscription_details : isObject( invoice.subscription_details ) ? invoice.subscription_details : {};
	const subscription = stripeId( invoice.subscription ) ?? stripeId( details.subscription );
	if ( ! id || ! subscription?.startsWith( 'sub_' ) ) return 'ignored';
	const payments = Array.isArray( invoice.payments?.data ) ? invoice.payments.data : [];
	const payment = payments.map( p => p?.payment ).find( p => isObject( p ) && ( p.charge || p.payment_intent ) ) ?? {};
	let charge = stripeId( invoice.charge ) ?? stripeId( payment.charge );
	let paymentIntent = stripeId( invoice.payment_intent ) ?? stripeId( payment.payment_intent );
	const status = type === 'invoice.paid' ? 'paid' : type === 'invoice.payment_failed' ? 'payment_failed' : 'action_required';
	const period = isObject( invoice.lines?.data?.[ 0 ]?.period ) ? invoice.lines.data[ 0 ].period : { start: invoice.period_start, end: invoice.period_end };
	const metadata = isObject( details.metadata ) ? details.metadata : {};
	// Since Stripe's 2025-03-31 API version a webhook's invoice has neither (payments isn't sent in
	// events), and a charge no longer names its invoice: a Build Pro invoice paid is asked about
	// (GET /v1/invoice_payments, Invoices: Read), or its refund or chargeback would never find it. If
	// Stripe can't say just now, the event fails and Stripe tries it again.
	if ( status === 'paid' && ! charge && ! paymentIntent && stripeSecret( env ) && ( metadata.pass === 'build' || await isBuild( db, subscription ) ) ) {

		const found = await stripeApi( env, 'GET', `/v1/invoice_payments?invoice=${ encodeURIComponent( id ) }&limit=10` );
		if ( ! found.ok ) throw new Error( `Couldn't look up a Build Pro invoice's payment (Stripe ${ found.status })` );
		const paid = ( Array.isArray( found.body.data ) ? found.body.data : [] ).filter( p => p?.status === undefined || p.status === 'paid' )
			.map( p => p?.payment ).find( p => isObject( p ) && ( p.charge || p.payment_intent ) ) ?? {};
		charge = stripeId( paid.charge );
		paymentIntent = stripeId( paid.payment_intent );

	}

	const account = typeof metadata.account_id === 'string' && ACCOUNT_ID.test( metadata.account_id ) ? Number( metadata.account_id ) : null;
	await db.prepare( `INSERT INTO invoices ( id, subscription, account_id, amount_paid, currency, status, billing_reason, charge, payment_intent, period_start, period_end, created_at, updated_at )
		VALUES ( ?1, ?2, COALESCE( ( SELECT id FROM accounts WHERE id = ?3 ), ( SELECT account_id FROM subscriptions WHERE id = ?2 ),
			( SELECT account_id FROM purchases WHERE subscription = ?2 AND account_id IS NOT NULL LIMIT 1 ) ), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13 )
		ON CONFLICT ( id ) DO UPDATE SET status = CASE WHEN invoices.status = 'paid' THEN 'paid' ELSE excluded.status END,
			amount_paid = COALESCE( excluded.amount_paid, invoices.amount_paid ), charge = COALESCE( excluded.charge, invoices.charge ),
			payment_intent = COALESCE( excluded.payment_intent, invoices.payment_intent ), account_id = COALESCE( invoices.account_id, excluded.account_id ),
			updated_at = excluded.updated_at` ).bind(
		id, subscription, account, Number.isSafeInteger( invoice.amount_paid ) ? invoice.amount_paid : null,
		typeof invoice.currency === 'string' && /^[a-z]{3}$/.test( invoice.currency ) ? invoice.currency : null, status,
		typeof invoice.billing_reason === 'string' ? invoice.billing_reason.slice( 0, 40 ) : null, charge, paymentIntent,
		msOf( period.start ), msOf( period.end ), msOf( invoice.created ) ?? now, now,
	).run();
	if ( status === 'paid' && paymentIntent ) {

		const reversal = await db.prepare( 'SELECT status FROM reversals WHERE payment_intent = ?' ).bind( paymentIntent ).first();
		if ( reversal ) await endBuild( env, db, { paymentIntent }, reversal.status, now );

	}

	return 'ok';

}

// Whether the subscription is Build Pro's, as its checkout or the subscription itself said.
async function isBuild( db, subscription ) {

	return !! await db.prepare( `SELECT 1 FROM subscriptions WHERE id = ?1 AND pass = 'build'
		UNION ALL SELECT 1 FROM purchases WHERE subscription = ?1 AND pass = 'build' LIMIT 1` ).bind( subscription ).first();

}

// What a charge (charge.refunded's object) or a dispute (charge.dispute.*'s) names: the charge, its
// PaymentIntent, and its invoice where Stripe's older API versions say.
function chargeOf( charge ) {

	return { charge: stripeId( charge.id ), paymentIntent: stripeId( charge.payment_intent ), invoice: stripeId( charge.invoice ) };

}

function disputeOf( dispute ) {

	return { charge: stripeId( dispute.charge ), paymentIntent: stripeId( dispute.payment_intent ), invoice: null };

}

// The Build Pro subscription a charge paid for (through the invoice it paid: invoice.paid kept its
// charge and PaymentIntent), or null: not a subscription's, not Build Pro's, or not heard of yet.
async function buildSubscriptionOf( db, { charge = null, paymentIntent = null, invoice = null } ) {

	if ( ! charge && ! paymentIntent && ! invoice ) return null;
	const row = await db.prepare( `SELECT i.subscription FROM invoices i WHERE ( i.id = ?1 OR i.charge = ?2 OR i.payment_intent = ?3 ) AND i.subscription IS NOT NULL
		AND ( EXISTS ( SELECT 1 FROM purchases u WHERE u.subscription = i.subscription AND u.pass = 'build' )
		OR EXISTS ( SELECT 1 FROM subscriptions s WHERE s.id = i.subscription AND s.pass = 'build' ) ) LIMIT 1` ).bind( invoice, charge, paymentIntent ).first();
	return row?.subscription ?? null;

}

// Money for Build Pro taken back (status 'refunded' or 'disputed'): Pro ends now (its purchase is
// marked, as a pass's is), and its subscription is cancelled at Stripe so it isn't billed again
// (refunds and chargebacks end Pro at once, docs/build.md). Kept in reversals too, so a checkout
// that arrives later comes in taken back. Whether it was Build Pro's.
async function endBuild( env, db, paid, status, now ) {

	const subscription = await buildSubscriptionOf( db, paid );
	if ( ! subscription ) return false;
	const statements = [
		db.prepare( `UPDATE purchases SET status = ?2, refunded_at = COALESCE( refunded_at, ?3 )
			WHERE subscription = ?1 AND pass = 'build' AND ( refunded_at IS NULL OR ( ?2 = 'refunded' AND status = 'disputed' ) )` ).bind( subscription, status, now ),
	];
	if ( paid.paymentIntent ) {

		statements.push( db.prepare( `INSERT INTO reversals ( payment_intent, status, created_at ) VALUES ( ?1, ?2, ?3 )
			ON CONFLICT ( payment_intent ) DO UPDATE SET status = excluded.status WHERE excluded.status = 'refunded'` ).bind( paid.paymentIntent, status, now ) );

	}

	await db.batch( statements );
	await cancelSubscription( env, db, subscription );
	return true;

}

// A Build Pro subscription cancelled at Stripe now (not at the period's end), unless it's stopped
// already. Needs STRIPE_SECRET_KEY; without it, it's logged and the owner cancels it in the
// Dashboard (Pro has ended here either way). If Stripe says no (down, a timeout, too many calls, a
// key without Subscriptions: Write), it throws: the event is marked 'error', answered 500 and
// counted for the admin page, and Stripe's next try at it cancels again. Gone at Stripe already
// (resource_missing) is done. Stripe then sends customer.subscription.deleted, which records it.
async function cancelSubscription( env, db, subscription ) {

	const row = await db.prepare( 'SELECT status FROM subscriptions WHERE id = ?' ).bind( subscription ).first();
	if ( row?.status === 'canceled' || row?.status === 'incomplete_expired' ) return;
	if ( ! stripeSecret( env ) ) {

		console.error( 'Stripe', 'refunded or disputed Build Pro subscription left running: STRIPE_SECRET_KEY is not set' );
		return;

	}

	const done = await stripeApi( env, 'DELETE', `/v1/subscriptions/${ encodeURIComponent( subscription ) }` );
	const gone = done.status === 404 && done.body?.error?.code === 'resource_missing';
	if ( ! done.ok && ! gone ) throw new Error( `Couldn't cancel a refunded or disputed Build Pro subscription (Stripe ${ done.status })` );

}

// A chargeback on Build Pro won: its purchase is paid again (unless it was refunded meanwhile). The
// subscription stays cancelled, so Pro is back only through a new one (or the owner's comp).
async function giveBuildBack( db, paid ) {

	const subscription = await buildSubscriptionOf( db, paid );
	if ( ! subscription ) return;
	await db.prepare( 'UPDATE purchases SET status = \'paid\', refunded_at = NULL WHERE subscription = ? AND pass = \'build\' AND status = \'disputed\'' ).bind( subscription ).run();

}

// The money for a payment taken back (status 'refunded' or 'disputed'): its pass goes. Kept in
// reversals too, for a purchase that hasn't arrived yet; a refund outranks a chargeback there, so a
// late "dispute won" never undoes a refund.
async function takeBack( db, paymentIntent, status, now ) {

	const id = stripeId( paymentIntent );
	if ( ! id ) return;
	await db.batch( [
		db.prepare( `INSERT INTO reversals ( payment_intent, status, created_at ) VALUES ( ?1, ?2, ?3 )
			ON CONFLICT ( payment_intent ) DO UPDATE SET status = excluded.status WHERE excluded.status = 'refunded'` ).bind( id, status, now ),
		db.prepare( `UPDATE purchases SET status = ?2, refunded_at = COALESCE( refunded_at, ?3 )
			WHERE payment_intent = ?1 AND ( refunded_at IS NULL OR ( ?2 = 'refunded' AND status = 'disputed' ) )` ).bind( id, status, now ),
	] );

}

// A chargeback won: the money's back, and so is the pass (unless it was refunded meanwhile).
async function giveBack( db, paymentIntent ) {

	const id = stripeId( paymentIntent );
	if ( ! id ) return;
	await db.batch( [
		db.prepare( 'DELETE FROM reversals WHERE payment_intent = ? AND status = \'disputed\'' ).bind( id ),
		db.prepare( 'UPDATE purchases SET status = \'paid\', refunded_at = NULL WHERE payment_intent = ? AND status = \'disputed\'' ).bind( id ),
	] );

}

function text( value ) {

	return typeof value === 'string' ? value.trim() : '';

}
