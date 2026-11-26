import { HttpError, isObject, json, readJson } from '../http.js';
import { cleanEmail, stripeId } from '../stripe.js';
import { currentAccount } from './accounts.js';
import { adminAccount } from './admin.js';
import { database } from './players.js';
import { addressOf } from './settings.js';
import { stripeApi, stripeSecret, stripeTestMode } from './stripe-api.js';
import { webhookReady } from './supporter.js';
import { COUNTRIES, CURRENCY, checkCart, lineName, packCart, subtotal, tierOf, unitPrice, unpackCart } from '../../src/drive-app/shop-catalog.js';

// The made-by-hand shop (docs/world-drive.md, "Shop"): coasters, keychains and stickers the owner
// makes in BC, sold from the game's own Shop window (src/drive-app/shop.js) through a Stripe Checkout
// Session made here, to Canada and the US. What's for sale and its price is the shared catalog's
// (src/drive-app/shop-catalog.js): the page sends only ids, designs and how many. Postage is chosen
// here from what's in the bag and where it's going: a letter or the smallest packet for stickers and
// keychains ('small'), a tracked parcel or packet once there's a coaster ('parcel'). A paid
// checkout comes back through Stripe's webhook (supporter.js's, shared), which keeps the order, with
// the address Stripe collected, in shop_orders for the owner's admin page, where they mark it
// posted. No sign-in is needed to buy; a signed-in buyer's account is kept with the order.
//
// Settings (wrangler.drive.jsonc vars, or the dashboard):
//   SHOP_SALES                 'on' opens the shop; anything else (unset, the default) hides it
//   SHOP_SHIP_CA_SMALL         postage in Canadian cents: stickers and keychains to Canada (a
//                              letter, untracked), e.g. "300"
//   SHOP_SHIP_CA_PARCEL        anything with coasters to Canada (a tracked parcel)
//   SHOP_SHIP_US_SMALL         stickers and keychains to the US (the smallest tracked packet:
//                              goods can't go to the US as letters)
//   SHOP_SHIP_US_PARCEL        anything with coasters to the US
//   SHOP_DAYS_CA_SMALL ...     optional, "3-10": how many business days delivery takes, as
//                              Stripe's checkout shows it (each tier and country has one; defaults
//                              in DAYS below, which count the owner's few days to make and post it)
// It also needs STRIPE_SECRET_KEY (billing.js: a test-mode key sells in test mode) and the webhook
// (STRIPE_WEBHOOK_SECRET). The shop is open only when all of those are set and right: nothing is
// ever sold that the webhook can't record, or whose postage isn't known. SHOP_CHECKOUTS: the rate
// limiter binding for checkouts started, by address.

const MAX_POSTAGE = 10000;
const ORDER_ID = /^cs_(live|test)_[A-Za-z0-9]{1,250}$/;
const TRACKING = 60;
const SHOWN = 100;
// Business days from paying to the door, by country and tier, when SHOP_DAYS_... isn't set: a few
// days to make and post it, then the post's own (Canada Post's letters are slower and untracked).
const DAYS = {
	CA: { small: [ 4, 12 ], parcel: [ 4, 10 ] },
	US: { small: [ 7, 15 ], parcel: [ 7, 15 ] },
};
const LABELS = {
	CA: { small: 'Lettermail (untracked)', parcel: 'Tracked parcel' },
	US: { small: 'Tracked packet', parcel: 'Tracked packet' },
};
export const ORDER_STATUSES = [ 'paid', 'shipped', 'refunded', 'disputed' ];

const text = value => typeof value === 'string' ? value.trim() : '';
// A string kept as it came, without control characters, cut to `max`; '' for anything else.
const clip = ( value, max ) => typeof value === 'string' ? value.replace( /[\u0000-\u001f\u007f]/g, '' ).trim().slice( 0, max ) : '';

// { shipping: { CA: { small, parcel }, US: { small, parcel } } } (each { amount, label, days: [ min,
// max ] }) when the shop is open, else null.
export function shopSettings( env ) {

	if ( text( env.SHOP_SALES ).toLowerCase() !== 'on' || ! stripeSecret( env ) || ! webhookReady( env ) ) return null;
	const shipping = {};
	for ( const country of COUNTRIES ) {

		shipping[ country ] = {};
		for ( const tier of [ 'small', 'parcel' ] ) {

			const amount = postage( env[ `SHOP_SHIP_${ country }_${ tier.toUpperCase() }` ] );
			if ( amount === null ) return null;
			shipping[ country ][ tier ] = { amount, label: LABELS[ country ][ tier ], days: days( env[ `SHOP_DAYS_${ country }_${ tier.toUpperCase() }` ], DAYS[ country ][ tier ] ) };

		}

	}

	return { shipping };

}

// A postage setting: whole cents from 0 to MAX_POSTAGE, else null (unset or not a number: the shop
// stays shut rather than charge a guess).
function postage( value ) {

	const n = Number( text( value ) );
	return text( value ) !== '' && Number.isInteger( n ) && n >= 0 && n <= MAX_POSTAGE ? n : null;

}

// "3-10" as [ 3, 10 ], else `fallback`.
function days( value, fallback ) {

	const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec( text( value ) );
	if ( ! match ) return fallback;
	const [ min, max ] = [ Number( match[ 1 ] ), Number( match[ 2 ] ) ];
	return min >= 1 && max >= min ? [ min, max ] : fallback;

}

// Whether the shop is open, for /api/config (the page shows its button only then).
export function shopOpen( env ) {

	return !! shopSettings( env );

}

// GET /api/shop: { open: false }, or { open: true, currency, shipping } (shopSettings'), for the
// Shop window's postage and delivery times. The catalog itself is the page's own copy.
export function getShop( { env } ) {

	const settings = shopSettings( env );
	return json( settings ? { open: true, currency: CURRENCY, shipping: settings.shipping } : { open: false }, 200, { 'Cache-Control': 'no-store' } );

}

const stripeDown = () => new HttpError( 502, 'Couldn\'t reach Stripe just now. Try again in a minute' );

// POST /api/shop/checkout { country: 'CA' | 'US', items: [ { id, design?, tpu?, qty } ] }: { url },
// Stripe's checkout page for that order. Each line's price is the catalog's; the postage is the one
// for the country and what's in the bag (tierOf), with its delivery estimate, and the address Stripe
// asks for is in that country only, so what's charged always matches what's posted. The order is in
// the session's metadata (shop 'order', the cart packed small, the country and tier), which is how
// the webhook knows it's the shop's and what to make. 404 while the shop is shut; 400 for a bag
// the catalog doesn't allow (checkCart's words); 429 past SHOP_CHECKOUTS a minute for an address.
export async function postShopCheckout( context ) {

	const { request, env, url } = context;
	const settings = shopSettings( env );
	if ( ! settings ) throw new HttpError( 404, 'The shop isn\'t open right now' );
	if ( env.SHOP_CHECKOUTS && ! ( await env.SHOP_CHECKOUTS.limit( { key: addressOf( request ) } ) ).success ) {

		throw new HttpError( 429, 'Too many. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

	const body = await readJson( request, 4096 );
	const country = isObject( body ) && COUNTRIES.includes( body.country ) ? body.country : null;
	if ( ! country ) throw new HttpError( 400, 'Choose Canada or the US' );
	const cart = checkCart( isObject( body ) ? body.items : null );
	if ( cart.error ) throw new HttpError( 400, cart.error );
	const tier = tierOf( cart.lines );
	const ship = settings.shipping[ country ][ tier ];
	let account = null;
	try {

		account = await currentAccount( context );

	} catch {

		// Buying needs no account: one that can't be read just now isn't kept with the order.

	}

	const metadata = { shop: 'order', cart: packCart( cart.lines ), country, tier };
	const res = await stripeApi( env, 'POST', '/v1/checkout/sessions', {
		mode: 'payment',
		...( account ? { client_reference_id: String( account.id ) } : {} ),
		metadata,
		payment_intent_data: { metadata },
		line_items: cart.lines.map( line => ( {
			price_data: { currency: CURRENCY, unit_amount: unitPrice( line ), product_data: { name: lineName( line ) } },
			quantity: line.qty,
		} ) ),
		shipping_address_collection: { allowed_countries: [ country ] },
		shipping_options: [ { shipping_rate_data: {
			type: 'fixed_amount',
			display_name: ship.label,
			fixed_amount: { amount: ship.amount, currency: CURRENCY },
			delivery_estimate: { minimum: { unit: 'business_day', value: ship.days[ 0 ] }, maximum: { unit: 'business_day', value: ship.days[ 1 ] } },
		} } ],
		custom_text: { submit: { message: 'Made by hand in BC, Canada, after you order. A free logo sticker comes with every order.' } },
		success_url: `${ url.origin }/?shop=done`,
		cancel_url: `${ url.origin }/?shop=cancelled`,
	} );
	const link = typeof res.body?.url === 'string' && res.body.url.startsWith( 'https://' ) ? res.body.url : null;
	if ( ! res.ok || ! link ) {

		console.error( 'Shop checkout', res.status, res.body?.error?.code ?? '' );
		throw stripeDown();

	}

	return json( { url: link } );

}

// A paid shop checkout, from the webhook (supporter.js's handleEvent, for a session whose metadata
// says shop 'order'): kept once in shop_orders, by its session's id, with what was bought (read
// back from its metadata and checked against the catalog again), the shipping name and address
// Stripe collected, and the money. A test-mode one counts only while the shop sells with a
// test-mode key (a staging Worker); a live key's shop never keeps a test order. Unpaid (a bank
// debit still on its way): 'ignored', and async_payment_succeeded brings it once it's paid.
// Returns stripe_events' result.
export async function recordOrder( env, session, livemode, now ) {

	if ( ! livemode && ! stripeTestMode( env ) ) return 'ignored';
	if ( session.payment_status !== 'paid' ) return 'ignored';
	const id = stripeId( session.id );
	if ( ! id || ! ORDER_ID.test( id ) ) return 'ignored';
	const metadata = isObject( session.metadata ) ? session.metadata : {};
	const cart = checkCart( unpackCart( metadata.cart ) );
	const lines = cart.lines ?? [];
	const items = lines.map( line => ( { ...line, name: lineName( line ), each: unitPrice( line ) } ) );
	// Where it goes: Stripe's newer API keeps it under collected_information, its older one as
	// shipping_details; the buyer's own details as a last resort.
	const shipping = [ session.collected_information?.shipping_details, session.shipping_details, session.customer_details ].find( isObject ) ?? {};
	const address = isObject( shipping.address ) ? shipping.address : {};
	const kept = Object.fromEntries( [ 'line1', 'line2', 'city', 'state', 'postal_code', 'country' ].map( key => [ key, clip( address[ key ], 200 ) ] ) );
	const reference = typeof session.client_reference_id === 'string' && /^[1-9][0-9]{0,14}$/.test( session.client_reference_id ) ? Number( session.client_reference_id ) : null;
	const number = value => Number.isSafeInteger( value ) ? value : null;
	await database( env ).prepare( `INSERT INTO shop_orders ( id, created_at, payment_intent, account_id, email, ship_name, ship_address, country, items, tier,
		subtotal, shipping, total, currency, status, livemode ) VALUES ( ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'paid', ?15 )
		ON CONFLICT ( id ) DO NOTHING` ).bind(
		id, now, stripeId( session.payment_intent ), reference, cleanEmail( session.customer_details?.email ?? session.customer_email ),
		clip( shipping.name, 200 ), JSON.stringify( kept ), kept.country || ( typeof metadata.country === 'string' ? metadata.country.slice( 0, 2 ) : '' ),
		JSON.stringify( items ), metadata.tier === 'parcel' || metadata.tier === 'small' ? metadata.tier : tierOf( lines.length ? lines : [] ),
		lines.length ? subtotal( lines ) : number( session.amount_subtotal ), number( session.shipping_cost?.amount_total ) ?? number( session.total_details?.amount_shipping ),
		number( session.amount_total ), typeof session.currency === 'string' ? session.currency.slice( 0, 3 ) : CURRENCY, livemode ? 1 : 0,
	).run();
	return cart.lines ? 'ok' : 'unmatched';

}

// A shop order's money taken back (from the webhook: a full refund, or a chargeback's funds
// withdrawn), by its payment's id: marked so, whatever it was, so it isn't posted. Back to paid when
// a chargeback's money is reinstated. Nothing for a payment that isn't the shop's.
export async function orderReversed( env, paymentIntent, status ) {

	const id = stripeId( paymentIntent );
	if ( ! id ) return;
	if ( status === 'reinstated' ) await database( env ).prepare( 'UPDATE shop_orders SET status = CASE WHEN shipped_at IS NULL THEN \'paid\' ELSE \'shipped\' END WHERE payment_intent = ? AND status = \'disputed\'' ).bind( id ).run();
	else await database( env ).prepare( 'UPDATE shop_orders SET status = ? WHERE payment_intent = ?' ).bind( status, id ).run();

}

// GET /api/admin/shop: { orders }, the newest SHOWN, for the admin page's Shop tab: each { id, at,
// status, email, name, address, country, items, tier, subtotal, shipping, total, currency,
// shippedAt, tracking, test, account }. The owner's only (admin.js): this is where the addresses to
// post to are, so nobody else ever sees them.
export async function adminShop( context ) {

	await adminAccount( context );
	const { results } = await database( context.env ).prepare( `SELECT * FROM shop_orders ORDER BY created_at DESC LIMIT ${ SHOWN }` ).all();
	const parsed = ( value, fallback ) => {

		try {

			return JSON.parse( value );

		} catch {

			return fallback;

		}

	};
	return json( { orders: results.map( row => ( {
		id: row.id, at: row.created_at, status: row.status, email: row.email, name: row.ship_name, address: parsed( row.ship_address, {} ),
		country: row.country, items: parsed( row.items, [] ), tier: row.tier, subtotal: row.subtotal, shipping: row.shipping, total: row.total,
		currency: row.currency, shippedAt: row.shipped_at, tracking: row.tracking, test: row.livemode === 0, account: row.account_id,
	} ) ) }, 200, { 'Cache-Control': 'no-store' } );

}

// POST /api/admin/shop { id, shipped: true, tracking? } marks an order posted (with its tracking
// number, if it has one), { id, shipped: false } takes that back (a mistake). Refunds are Stripe's
// Dashboard's; the webhook marks the order refunded. 404 for an order that isn't there, 409 for one
// whose money was taken back.
export async function adminShopChange( context ) {

	await adminAccount( context );
	const { request, env, now } = context;
	const body = await readJson( request, 1024 );
	const id = isObject( body ) && typeof body.id === 'string' && ORDER_ID.test( body.id ) ? body.id : null;
	if ( ! id || typeof body.shipped !== 'boolean' ) throw new HttpError( 400, 'Bad request' );
	const db = database( env );
	const order = await db.prepare( 'SELECT status FROM shop_orders WHERE id = ?' ).bind( id ).first();
	if ( ! order ) throw new HttpError( 404, 'No such order' );
	if ( order.status === 'refunded' || order.status === 'disputed' ) throw new HttpError( 409, 'That order\'s money was taken back' );
	const tracking = clip( body.tracking, TRACKING );
	if ( body.shipped ) await db.prepare( 'UPDATE shop_orders SET status = \'shipped\', shipped_at = ?, tracking = ? WHERE id = ?' ).bind( now, tracking, id ).run();
	else await db.prepare( 'UPDATE shop_orders SET status = \'paid\', shipped_at = NULL, tracking = \'\' WHERE id = ?' ).bind( id ).run();
	return json( { ok: true } );

}
