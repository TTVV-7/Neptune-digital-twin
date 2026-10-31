import { HttpError, isObject, json, list } from './http.js';
import { LINK_ID_PATTERN, cleanEmail, readEvent, stripeId } from './stripe.js';

// Premium, a work in progress: the Pro equipment pack (library items marked "premium": true in
// public/library/library.json), bought once through a Stripe Payment Link. Stripe tells us about
// each payment through a webhook, and the app asks /api/config and /api/me whether you have it
// (see docs/premium.md). The gate is in the app only: the models are still public files.
//
// Settings (wrangler.jsonc vars or secrets; environment variables on Vercel):
//   STRIPE_PAYMENT_LINK      the Payment Link's address, https://buy.stripe.com/... (public)
//   STRIPE_PAYMENT_LINK_ID   its id, plink_... (public): only checkouts through this link count
//   STRIPE_WEBHOOK_SECRET    secret: the webhook endpoint's signing secret, whsec_...
//   PREMIUM_PRICE            optional: what it costs, as the app shows it, e.g. "CA$19, one time"
//   PREMIUM_EMAILS           optional, comma-separated: people who get premium without paying
// Premium is on only when the first three are all set. Until then every item is free for
// everyone and the app shows nothing about it.

const USER_ID_PATTERN = /^[1-9][0-9]{0,14}$/;

// The settings when premium is on, else null. A link that isn't https, or anything but a Payment
// Link id or a webhook signing secret where those go, leaves premium off.
export function premiumSettings( env ) {

	const linkId = ( env.STRIPE_PAYMENT_LINK_ID ?? '' ).trim();
	const secret = ( env.STRIPE_WEBHOOK_SECRET ?? '' ).trim();
	let link;
	try {

		link = new URL( ( env.STRIPE_PAYMENT_LINK ?? '' ).trim() );

	} catch {

		return null;

	}

	if ( link.protocol !== 'https:' || ! LINK_ID_PATTERN.test( linkId ) || ! secret.startsWith( 'whsec_' ) ) return null;
	const price = ( env.PREMIUM_PRICE ?? '' ).replace( /[\u0000-\u001f\u007f]/g, '' ).trim().slice( 0, 100 );
	return { link: link.href, linkId, secret, price };

}

// What the page is told: whether premium is on, and if so where to buy it, what it costs and
// whether this visitor has it. clientReferenceId goes on the Payment Link, so Stripe hands it
// back with the payment and we know whose it is.
export async function premiumFor( env, user ) {

	const settings = premiumSettings( env );
	if ( ! settings ) return { enabled: false };
	const premium = { enabled: true, link: settings.link, price: settings.price, unlocked: false };
	if ( user ) {

		premium.unlocked = await hasPremium( env, user );
		premium.clientReferenceId = String( user.id );

	}

	return premium;

}

// Bought (and not refunded) by this user, or with their email before they had an account, or
// given to them in PREMIUM_EMAILS.
async function hasPremium( env, user ) {

	if ( list( env.PREMIUM_EMAILS ).includes( user.email ) ) return true;
	const row = await env.DB.prepare( `
		SELECT 1 AS found FROM purchases
		WHERE refunded_at IS NULL AND ( user_id = ? OR ( user_id IS NULL AND email = ? ) )
		LIMIT 1
	` ).bind( user.id, user.email ).first();
	return !! row;

}

// POST /api/stripe/webhook, from Stripe's servers. There's no session and no Origin: the request
// proves where it came from with its Stripe-Signature, made with the endpoint's signing secret
// (checked in stripe.js, which World Drive's webhook shares). Anything properly signed is answered
// 200, including events about things this app doesn't sell (the account sells other things too),
// so Stripe doesn't keep sending them again.
export async function stripeWebhook( { request, env } ) {

	const settings = premiumSettings( env );
	if ( ! settings ) throw new HttpError( 503, 'Premium isn\'t set up' );
	const event = await readEvent( request, settings.secret );
	const object = isObject( event.data?.object ) ? event.data.object : {};
	if ( event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' ) await recordPurchase( env, settings, object );
	else if ( event.type === 'charge.refunded' ) await recordRefund( env, object );
	return json( { received: true } );

}

// A Checkout Session through our Payment Link that has been paid. Paying by bank debit and the
// like completes the checkout unpaid; async_payment_succeeded follows once the money arrives.
// Recorded once per session, so the same event arriving again changes nothing.
async function recordPurchase( env, settings, session ) {

	if ( session.payment_link !== settings.linkId || session.payment_status !== 'paid' ) return;
	const id = stripeId( session.id );
	if ( ! id ) return;
	const email = cleanEmail( session.customer_details?.email ?? session.customer_email );
	const userId = await buyer( env, session.client_reference_id, email );
	await env.DB.prepare( `
		INSERT INTO purchases ( checkout_session, user_id, email, payment_intent, created_at ) VALUES ( ?, ?, ?, ?, ? )
		ON CONFLICT ( checkout_session ) DO NOTHING
	` ).bind( id, userId, email, stripeId( session.payment_intent ), Date.now() ).run();

}

// Who paid: the account whose id the app put on the link, else the account with the email they
// paid with. Neither (they bought before signing in here): null, and the purchase goes to
// whoever first signs in with that email, which Google has checked is theirs.
async function buyer( env, reference, email ) {

	if ( typeof reference === 'string' && USER_ID_PATTERN.test( reference ) ) {

		const row = await env.DB.prepare( 'SELECT id FROM users WHERE id = ?' ).bind( Number( reference ) ).first();
		if ( row ) return row.id;

	}

	if ( ! email ) return null;
	const row = await env.DB.prepare( 'SELECT id FROM users WHERE email = ? ORDER BY last_login_at DESC LIMIT 1' ).bind( email ).first();
	return row?.id ?? null;

}

// A full refund takes premium away again; Stripe only sets refunded once the whole charge is.
// Refunds of anything else the account sells match no purchase and change nothing.
async function recordRefund( env, charge ) {

	const paymentIntent = stripeId( charge.payment_intent );
	if ( charge.refunded !== true || ! paymentIntent ) return;
	await env.DB.prepare( 'UPDATE purchases SET refunded_at = ? WHERE payment_intent = ? AND refunded_at IS NULL' ).bind( Date.now(), paymentIntent ).run();

}
