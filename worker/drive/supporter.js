import { HttpError, isObject, json, list } from '../http.js';
import { LINK_ID_PATTERN, cleanEmail, readEvent, stripeId } from '../stripe.js';
import { database } from './players.js';
import { googleClientId } from './settings.js';

// The Supporter Pass (docs/world-drive.md): one payment, through a Stripe Payment Link, towards
// World Drive's running costs. What it unlocks in the page (four more rides, the whole Garage) the
// page locks itself (src/drive-app/pro.js); the Worker keeps who has it, gives supporters more
// drives a day (index.js) and puts a ⭐ by their names on the leaderboard (scores.js). Stripe tells
// us about each payment and refund through a webhook, signed (checked in ../stripe.js, which the
// construction app's premium.js shares), and the page asks /api/me (accounts.js) whether you have
// it. A pass is an account's (Google sign-in, accounts.js), so it goes with you to any browser.
//
// Settings (wrangler.drive.jsonc vars, or the dashboard; secrets in the dashboard only):
//   GOOGLE_CLIENT_ID             the sign-in button's OAuth client id (public)
//   SUPPORTER_PAYMENT_LINK       the Payment Link's address, https://buy.stripe.com/... (public)
//   SUPPORTER_PAYMENT_LINK_ID    optional, plink_... (public): only checkouts through that link
//                                count. The Stripe account is World Drive's own, so without it every
//                                paid checkout on the account is a pass.
//   SUPPORTER_PRICE              what it costs, as the page shows it: "CA$4.99"
//   STRIPE_WEBHOOK_SECRET        secret: the webhook endpoint's signing secret, whsec_...
//   SUPPORTER_EMAILS             optional secret, comma-separated: people with the pass without paying
//   PER_VISITOR_DAILY_SUPPORTER  a supporter's drives a day (30 if unset)
// Buying is on only when GOOGLE_CLIENT_ID, the link and the secret are all set. A link that isn't
// https, a secret that isn't a whsec_ one (an API key pasted there by mistake) or a link id that
// isn't a plink_ one leaves it off.

const ACCOUNT_ID = /^[1-9][0-9]{0,14}$/;
const MAX_PRICE = 40;

// { secret, linkId } for the webhook, or null when it can't check what Stripe sends. It needs only
// the secret: a payment that arrives is kept, whether or not the page offers buying just now.
function webhookSettings( env ) {

	const secret = text( env.STRIPE_WEBHOOK_SECRET );
	const linkId = text( env.SUPPORTER_PAYMENT_LINK_ID );
	if ( ! secret.startsWith( 'whsec_' ) || ( linkId && ! LINK_ID_PATTERN.test( linkId ) ) ) return null;
	return { secret, linkId };

}

// { link, price } when buying is on, else null.
export function purchaseSettings( env ) {

	let link;
	try {

		link = new URL( text( env.SUPPORTER_PAYMENT_LINK ) );

	} catch {

		return null;

	}

	if ( link.protocol !== 'https:' || ! googleClientId( env ) || ! webhookSettings( env ) ) return null;
	return { link: link.href, price: text( env.SUPPORTER_PRICE ).replace( /[\u0000-\u001f\u007f]/g, '' ).slice( 0, MAX_PRICE ) };

}

// What the page is told about buying: { enabled: false }, or where and for how much, and for an
// account the id the page puts on the link as client_reference_id, which Stripe hands back with
// the payment, so we know whose it is.
export function purchaseFor( env, account ) {

	const settings = purchaseSettings( env );
	if ( ! settings ) return { enabled: false };
	const purchase = { enabled: true, link: settings.link, price: settings.price };
	if ( account ) purchase.clientReferenceId = String( account.id );
	return purchase;

}

// Whether this account ({ id, email }) has the pass.
export async function isSupporter( env, account ) {

	const row = await database( env ).prepare( `SELECT ${ hasPass( '?1', '?2' ) } AS supporter` ).bind( account.id, supporterEmails( env ) ).first();
	return !! row?.supporter;

}

// SQL that's true when the account with the id `account` (SQL: a parameter or a column) has the
// pass: bought by it and not refunded, or bought with its email by someone not signed in (Google has
// checked the email is theirs), or its email is in SUPPORTER_EMAILS, bound at `emails` as a JSON
// list (supporterEmails). NULL, a player of no account's, is never a supporter. The leaderboard asks
// this of each row it shows, so it's one look in each of the indexes it uses.
export function hasPass( account, emails ) {

	return `EXISTS ( SELECT 1 FROM accounts a WHERE a.id = ${ account } AND ( a.email IN ( SELECT value FROM json_each( ${ emails } ) )
		OR EXISTS ( SELECT 1 FROM purchases u WHERE u.refunded_at IS NULL AND ( u.account_id = a.id OR ( u.account_id IS NULL AND u.email = a.email ) ) ) ) )`;

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
	const object = isObject( event.data?.object ) ? event.data.object : {};
	if ( event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' ) await recordPurchase( db, settings, object, now );
	else if ( event.type === 'charge.refunded' ) await recordRefund( db, object, now );
	return json( { received: true } );

}

// A Checkout Session that has been paid (through our link, when SUPPORTER_PAYMENT_LINK_ID is set).
// Paying by bank debit and the like completes the checkout unpaid; async_payment_succeeded follows
// once the money arrives. Recorded once per session, so the same event arriving again (Stripe
// retries until it hears 200) changes nothing. It's the account the page named on the link, if
// there is one; else nobody's yet, and whoever signs in with the email paid with has it.
async function recordPurchase( db, settings, session, now ) {

	if ( session.payment_status !== 'paid' ) return;
	if ( settings.linkId && stripeId( session.payment_link ) !== settings.linkId ) return;
	const id = stripeId( session.id );
	if ( ! id ) return;
	const email = cleanEmail( session.customer_details?.email ?? session.customer_email );
	const reference = typeof session.client_reference_id === 'string' && ACCOUNT_ID.test( session.client_reference_id ) ? Number( session.client_reference_id ) : null;
	const amount = Number.isSafeInteger( session.amount_total ) ? session.amount_total : null;
	const currency = typeof session.currency === 'string' && /^[a-z]{3}$/.test( session.currency ) ? session.currency : null;
	await db.prepare( `INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, payment_intent, status, created_at )
		VALUES ( ?1, ( SELECT id FROM accounts WHERE id = ?2 ), ?3, ?4, ?5, ?6, 'paid', ?7 ) ON CONFLICT ( checkout_session ) DO NOTHING` )
		.bind( id, reference, email, amount, currency, stripeId( session.payment_intent ), now ).run();

}

// A full refund takes the pass away again; Stripe only sets refunded once the whole charge is.
// A partial one keeps it.
async function recordRefund( db, charge, now ) {

	const paymentIntent = stripeId( charge.payment_intent );
	if ( charge.refunded !== true || ! paymentIntent ) return;
	await db.prepare( 'UPDATE purchases SET refunded_at = ?, status = \'refunded\' WHERE payment_intent = ? AND refunded_at IS NULL' ).bind( now, paymentIntent ).run();

}

function text( value ) {

	return typeof value === 'string' ? value.trim() : '';

}
