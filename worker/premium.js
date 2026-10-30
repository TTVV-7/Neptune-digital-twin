import { HttpError, isObject, json, list, readBytes } from './http.js';

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

// Stripe signs "<timestamp>.<body>"; an event signed longer ago than this (seconds) is refused,
// so a copy of an old one can't be sent again.
const TOLERANCE = 300;
// Stripe's events are a few kB; Checkout Sessions arrive without their line items.
const MAX_EVENT = 256 * 1024;
const MAX_SIGNATURE_HEADER = 4096;
const LINK_ID_PATTERN = /^plink_[A-Za-z0-9]{1,200}$/;
const USER_ID_PATTERN = /^[1-9][0-9]{0,14}$/;
const MAX_STRIPE_ID = 255;

const badRequest = () => new HttpError( 400, 'Bad request' );

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
// proves where it came from with its Stripe-Signature, made with the endpoint's signing secret.
// Anything properly signed is answered 200, including events about things this app doesn't sell
// (the account sells other things too), so Stripe doesn't keep sending them again.
export async function stripeWebhook( { request, env } ) {

	const settings = premiumSettings( env );
	if ( ! settings ) throw new HttpError( 503, 'Premium isn\'t set up' );
	const body = await readBytes( request, MAX_EVENT );
	if ( ! await verifySignature( request.headers.get( 'Stripe-Signature' ), body, settings.secret ) ) throw badRequest();

	let event;
	try {

		event = JSON.parse( new TextDecoder().decode( body ) );

	} catch {

		throw badRequest();

	}

	if ( ! isObject( event ) ) throw badRequest();
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

// Stripe-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">[,v1=...]. There can be more
// than one v1 while a secret is being rolled; any of them may match.
async function verifySignature( header, body, secret ) {

	if ( typeof header !== 'string' || header.length > MAX_SIGNATURE_HEADER ) return false;
	let time = null;
	const signatures = [];
	for ( const part of header.split( ',' ) ) {

		const at = part.indexOf( '=' );
		const key = part.slice( 0, at ).trim();
		const value = part.slice( at + 1 ).trim();
		if ( key === 't' && time === null ) time = value;
		else if ( key === 'v1' && /^[0-9a-f]{64}$/.test( value ) ) signatures.push( value );

	}

	if ( ! /^[0-9]{1,12}$/.test( time ?? '' ) || signatures.length === 0 ) return false;
	if ( Math.abs( Date.now() / 1000 - Number( time ) ) > TOLERANCE ) return false;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey( 'raw', encoder.encode( secret ), { name: 'HMAC', hash: 'SHA-256' }, false, [ 'sign' ] );
	const prefix = encoder.encode( `${ time }.` );
	const signed = new Uint8Array( prefix.byteLength + body.byteLength );
	signed.set( prefix );
	signed.set( body, prefix.byteLength );
	const expected = [ ...new Uint8Array( await crypto.subtle.sign( 'HMAC', key, signed ) ) ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
	// Every one is compared, all the way through, so the time taken says nothing about how close
	// a made-up signature came.
	let match = false;
	for ( const signature of signatures ) match = sameText( signature, expected ) || match;
	return match;

}

function sameText( a, b ) {

	if ( a.length !== b.length ) return false;
	let difference = 0;
	for ( let i = 0; i < a.length; i ++ ) difference |= a.charCodeAt( i ) ^ b.charCodeAt( i );
	return difference === 0;

}

// A Stripe id (cs_..., pi_...), given as the id itself or as the object it names, or null.
function stripeId( value ) {

	const id = isObject( value ) ? value.id : value;
	return typeof id === 'string' && id.length > 0 && id.length <= MAX_STRIPE_ID ? id : null;

}

function cleanEmail( value ) {

	if ( typeof value !== 'string' ) return '';
	const email = value.trim().toLowerCase();
	return email.includes( '@' ) && email.length <= 320 ? email : '';

}
