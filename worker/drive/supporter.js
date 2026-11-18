import { HttpError, isObject, json, list } from '../http.js';
import { LINK_ID_PATTERN, cleanEmail, readEvent, stripeId } from '../stripe.js';
import { database } from './players.js';
import { googleClientId } from './settings.js';

// The Supporter Pass (docs/world-drive.md): a subscription, through a Stripe Payment Link, towards
// World Drive's running costs. Passes bought before it was a subscription (one payment each) are
// legacy passes, kept for good. What it unlocks in the page (four more rides, the whole Garage) the
// page locks itself (src/drive-app/pro.js); the Worker keeps who has it, gives supporters more
// drives a day (index.js) and puts a ⭐ by their names on the leaderboard (scores.js). Stripe tells
// us about each payment, refund and chargeback through a webhook, signed (checked in ../stripe.js,
// which the construction app's premium.js shares), and the page asks /api/me (accounts.js) whether
// you have it. A pass is an account's (Google's sign-in or a username's, accounts.js and
// logins.js), so it goes with you to any browser.
//
// Settings (wrangler.drive.jsonc vars, or the dashboard; secrets in the dashboard only):
//   GOOGLE_CLIENT_ID             the sign-in button's OAuth client id (public)
//   SUPPORTER_PAYMENT_LINK       the Payment Link's address, https://buy.stripe.com/... (public)
//   SUPPORTER_PAYMENT_LINK_ID    optional, plink_... (public): only checkouts through that link
//                                count. The Stripe account is World Drive's own, so without it every
//                                paid checkout on the account is a pass.
//   SUPPORTER_PRICE              what it costs, as the page shows it: "CA$4.99/month"
//   SUPPORTER_MANAGE_LINK        optional (public): Stripe's customer portal login link,
//                                https://billing.stripe.com/p/login/..., where a subscriber cancels
//                                or changes their card. The pass's sheet links to it.
//   STRIPE_WEBHOOK_SECRET        secret: the webhook endpoint's signing secret, whsec_...
//   SUPPORTER_EMAILS             optional secret, comma-separated: people with the pass without paying
//   PER_VISITOR_DAILY_SUPPORTER  a supporter's drives a day (30 if unset)
// Buying is on only when GOOGLE_CLIENT_ID, the link and the secret are all set. A link that isn't
// https, a secret that isn't a whsec_ one (an API key pasted there by mistake) or a link id that
// isn't a plink_ one leaves it off.

const ACCOUNT_ID = /^[1-9][0-9]{0,14}$/;
const MAX_PRICE = 40;
// A subscription's statuses that keep its pass (past_due: Stripe is still retrying the card).
// Any other (canceled, unpaid, incomplete_expired, paused...) takes it away until it's active again.
export const ACTIVE_STATUSES = [ 'active', 'trialing', 'past_due' ];
const STATUS = /^[a-z_]{1,40}$/;

// { secret, linkId, testMode } for the webhook, or null when it can't check what Stripe sends. It
// needs only the secret: a payment that arrives is kept, whether or not the page offers buying just
// now. testMode: the link is a test-mode one (https://buy.stripe.com/test_...), so payments made
// with Stripe's test cards count; with a live link, or none, only real ones do.
function webhookSettings( env ) {

	const secret = text( env.STRIPE_WEBHOOK_SECRET );
	const linkId = text( env.SUPPORTER_PAYMENT_LINK_ID );
	if ( ! secret.startsWith( 'whsec_' ) || ( linkId && ! LINK_ID_PATTERN.test( linkId ) ) ) return null;
	return { secret, linkId, testMode: paymentLink( env )?.pathname.startsWith( '/test_' ) ?? false };

}

// { link, price } when buying is on, else null.
export function purchaseSettings( env ) {

	const link = paymentLink( env );
	if ( link?.protocol !== 'https:' || ! googleClientId( env ) || ! webhookSettings( env ) ) return null;
	return { link: link.href, price: text( env.SUPPORTER_PRICE ).replace( /[\u0000-\u001f\u007f]/g, '' ).slice( 0, MAX_PRICE ) };

}

// SUPPORTER_PAYMENT_LINK as a URL, or null when it isn't one.
function paymentLink( env ) {

	try {

		return new URL( text( env.SUPPORTER_PAYMENT_LINK ) );

	} catch {

		return null;

	}

}

// What the page is told about buying: { enabled: false }, or where and for how much, and for an
// account the id the page puts on the link as client_reference_id, which Stripe hands back with
// the payment, so we know whose it is.
export function purchaseFor( env, account ) {

	const settings = purchaseSettings( env );
	if ( ! settings ) return { enabled: false };
	const purchase = { enabled: true, link: settings.link, price: settings.price };
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

// Whether this account ({ id, email }) has the pass.
export async function isSupporter( env, account ) {

	return ( await supporterPass( env, account ) ).supporter;

}

// { supporter, subscribed }: whether this account has the pass, and whether it has it through a
// subscription that's running (so the page offers to manage it) rather than only a legacy pass or
// SUPPORTER_EMAILS.
export async function supporterPass( env, account ) {

	const row = await database( env ).prepare( `SELECT ${ hasPass( '?1', '?2' ) } AS supporter, EXISTS ( SELECT 1 FROM accounts a JOIN purchases u ON ${ ownPurchase( 'u', 'a' ) }
		WHERE a.id = ?1 AND u.subscription IS NOT NULL AND ${ livePurchase( 'u' ) } ) AS subscribed` ).bind( account.id, supporterEmails( env ) ).first();
	return { supporter: !! row?.supporter, subscribed: !! row?.supporter && !! row?.subscribed };

}

// SQL that's true when the account with the id `account` (SQL: a parameter or a column) has the
// pass: bought by it and not refunded (and, for a subscription, the subscription still active:
// livePurchase; a legacy one-time purchase, with no subscription, keeps it for good), or bought with its email by someone not signed in (Google has
// checked the email is theirs), or its email is in SUPPORTER_EMAILS, bound at `emails` as a JSON
// list (supporterEmails). NULL, a player of no account's, is never a supporter. An account with no
// Google account linked has no email (''), and a purchase Stripe sent without one has '' too: the
// email only counts when there is one, or every username's account would have that purchase. The
// leaderboard asks this of each row it shows, so it's one look in each of the indexes it uses.
export function hasPass( account, emails ) {

	return `EXISTS ( SELECT 1 FROM accounts a WHERE a.id = ${ account } AND ( a.email IN ( SELECT value FROM json_each( ${ emails } ) )
		OR EXISTS ( SELECT 1 FROM purchases u WHERE ${ livePurchase( 'u' ) } AND ${ ownPurchase( 'u', 'a' ) } ) ) )`;

}

// SQL: the purchase `u` is the account `a`'s (bought signed in as it, or with its Google email).
function ownPurchase( u, a ) {

	return `( ${ u }.account_id = ${ a }.id OR ( ${ u }.account_id IS NULL AND ${ u }.email = ${ a }.email AND ${ a }.email <> '' ) )`;

}

// SQL: the purchase `u` still gives the pass: not refunded, and either a legacy one-time purchase
// (no subscription) or a subscription Stripe hasn't told us has stopped (none heard of yet counts:
// its checkout was paid).
function livePurchase( u ) {

	const active = ACTIVE_STATUSES.map( status => `'${ status }'` ).join( ', ' );
	return `( ${ u }.refunded_at IS NULL AND ( ${ u }.subscription IS NULL
		OR NOT EXISTS ( SELECT 1 FROM subscriptions s WHERE s.id = ${ u }.subscription AND s.status NOT IN ( ${ active } ) ) ) )`;

}

// SUPPORTER_EMAILS as hasPass takes them.
export function supporterEmails( env ) {

	return JSON.stringify( list( env.SUPPORTER_EMAILS ) );

}

// POST /api/stripe/webhook, from Stripe's servers: the one route with no session and without the
// same-origin check (index.js), since it doesn't come from a page; its Stripe-Signature proves it
// instead (readEvent: an HMAC of the raw body with the signing secret, compared in constant time
// with each v1, within five minutes of when it was signed). Anything properly signed is answered
// 200, including events this doesn't act on, so Stripe doesn't keep sending them again.
export async function stripeWebhook( { request, env, now } ) {

	const settings = webhookSettings( env );
	if ( ! settings ) throw new HttpError( 503, 'Not set up yet' );
	const db = database( env );
	const event = await readEvent( request, settings.secret );
	// A test-mode event (a test-mode endpoint's secret set here by mistake) is a payment made with a
	// test card, which anyone with a test link can make for nothing: never a pass on the live site.
	if ( event.livemode !== true && ! settings.testMode ) return json( { received: true } );
	const object = isObject( event.data?.object ) ? event.data.object : {};
	if ( event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' ) await recordPurchase( db, settings, object, now );
	// Stripe only sets refunded once the whole charge is; a partial refund keeps the pass.
	else if ( event.type === 'charge.refunded' && object.refunded === true ) await takeBack( db, object.payment_intent, 'refunded', now );
	// A chargeback: the bank takes the money back as the dispute opens, and gives it back if it's won.
	else if ( event.type === 'charge.dispute.funds_withdrawn' ) await takeBack( db, object.payment_intent, 'disputed', now );
	else if ( event.type === 'charge.dispute.funds_reinstated' ) await giveBack( db, object.payment_intent );
	// A subscription started, changed (a renewal that failed, a card fixed) or ended: its pass follows.
	else if ( event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted' ) {

		await subscriptionChanged( db, object, Number.isSafeInteger( event.created ) ? event.created * 1000 : now, now );

	}

	return json( { received: true } );

}

// A Checkout Session that has been paid (through our link, when SUPPORTER_PAYMENT_LINK_ID is set).
// Paying by bank debit and the like completes the checkout unpaid; async_payment_succeeded follows
// once the money arrives. Recorded once per session, so the same event arriving again (Stripe
// retries until it hears 200) changes nothing. It's the account the page named on the link, if
// there is one; else nobody's yet, and whoever signs in with the email paid with has it. A payment
// already taken back (its refund delivered first, while Stripe was still retrying this) comes in
// taken back.
// A subscription's checkout has its subscription's id, so the pass lasts while that's active; one
// that starts with a free trial completes with nothing to pay ('no_payment_required').
async function recordPurchase( db, settings, session, now ) {

	const subscription = session.mode === 'subscription' ? stripeId( session.subscription ) : null;
	if ( session.payment_status !== 'paid' && ! ( subscription && session.payment_status === 'no_payment_required' ) ) return;
	if ( settings.linkId && stripeId( session.payment_link ) !== settings.linkId ) return;
	const id = stripeId( session.id );
	if ( ! id ) return;
	const email = cleanEmail( session.customer_details?.email ?? session.customer_email );
	const reference = typeof session.client_reference_id === 'string' && ACCOUNT_ID.test( session.client_reference_id ) ? Number( session.client_reference_id ) : null;
	const amount = Number.isSafeInteger( session.amount_total ) ? session.amount_total : null;
	const currency = typeof session.currency === 'string' && /^[a-z]{3}$/.test( session.currency ) ? session.currency : null;
	await db.prepare( `INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, payment_intent, status, created_at, refunded_at, subscription )
		VALUES ( ?1, ( SELECT id FROM accounts WHERE id = ?2 ), ?3, ?4, ?5, ?6, COALESCE( ( SELECT status FROM reversals WHERE payment_intent = ?6 ), 'paid' ), ?7,
			( SELECT created_at FROM reversals WHERE payment_intent = ?6 ), ?8 ) ON CONFLICT ( checkout_session ) DO NOTHING` )
		.bind( id, reference, email, amount, currency, stripeId( session.payment_intent ), now, subscription ).run();

}

// A subscription's status as Stripe says it is, from an event made at `eventAt` (ms): kept unless
// a newer event has already said otherwise.
async function subscriptionChanged( db, subscription, eventAt, now ) {

	const id = stripeId( subscription.id );
	const status = typeof subscription.status === 'string' && STATUS.test( subscription.status ) ? subscription.status : null;
	if ( ! id || ! id.startsWith( 'sub_' ) || ! status ) return;
	await db.prepare( `INSERT INTO subscriptions ( id, status, event_at, updated_at ) VALUES ( ?1, ?2, ?3, ?4 )
		ON CONFLICT ( id ) DO UPDATE SET status = excluded.status, event_at = excluded.event_at, updated_at = excluded.updated_at
		WHERE excluded.event_at >= subscriptions.event_at` ).bind( id, status, eventAt, now ).run();

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
