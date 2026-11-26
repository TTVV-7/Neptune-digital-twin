// npm run test:drive-shop: the made-by-hand shop (worker/drive/shop.js, src/drive-app/shop-catalog.js):
// the catalog's checks on a bag, when the shop is open, and then in World Drive's Worker under
// wrangler dev (its migrations applied to a fresh local database, Stripe's API stood in for on this
// machine): /api/config's shop, the postage, Checkout Sessions made with the catalog's prices and the
// right postage for the country and what's in the bag, bags turned away, a paid order kept from
// Stripe's webhook with its address, the owner's orders list (and nobody else's), marking one posted,
// and a refund taking it back.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';
import { checkCart, lineName, money, packCart, subtotal, tierOf, unpackCart } from '../src/drive-app/shop-catalog.js';
import { shopSettings } from '../worker/drive/shop.js';

const PORT = Number( process.env.TEST_DRIVE_SHOP_PORT ) || 8796;
const WEBHOOK_SECRET = 'whsec_test_shop_secret';
const SECRET_KEY = [ 'rk', 'test', 'shopuse00000000000000001' ].join( '_' );
const POSTAGE = { SHOP_SHIP_CA_SMALL: '300', SHOP_SHIP_CA_PARCEL: '1000', SHOP_SHIP_US_SMALL: '800', SHOP_SHIP_US_PARCEL: '900' };
const OPEN = { SHOP_SALES: 'on', STRIPE_SECRET_KEY: SECRET_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, ...POSTAGE };

describe( 'the catalog', () => {

	test( 'a bag is checked against it, and merged', () => {

		assert.equal( checkCart( [] ).error, 'Your bag is empty' );
		assert.equal( checkCart( null ).error, 'Your bag is empty' );
		assert.match( checkCart( [ { id: 'hoodie', qty: 1 } ] ).error, /isn't for sale/ );
		assert.match( checkCart( [ { id: 'coaster-set', design: 'plaid', qty: 1 } ] ).error, /Pick a design/ );
		// The mixed set is a set's only.
		assert.match( checkCart( [ { id: 'coaster', design: 'mixed', qty: 1 } ] ).error, /Pick a design/ );
		assert.match( checkCart( [ { id: 'keychain', qty: 0 } ] ).error, /Up to 10/ );
		assert.match( checkCart( [ { id: 'keychain', qty: 2.5 } ] ).error, /Up to 10/ );
		assert.match( checkCart( [ { id: 'keychain', qty: 6 }, { id: 'keychain', qty: 5 } ] ).error, /Up to 10/ );
		// A single sticker can't carry its postage: only with something else.
		assert.match( checkCart( [ { id: 'sticker', qty: 3 } ] ).error, /Single stickers come with another order/ );
		const { lines } = checkCart( [ { id: 'sticker', qty: 1 }, { id: 'stickers-10', qty: 1 }, { id: 'sticker', design: 'logo', qty: 2 }, { id: 'coaster-set', tpu: true, qty: 1 } ] );
		assert.deepEqual( lines, [
			{ id: 'sticker', design: 'logo', tpu: false, qty: 3 },
			{ id: 'stickers-10', design: null, tpu: false, qty: 1 },
			{ id: 'coaster-set', design: 'mixed', tpu: true, qty: 1 },
		] );
		assert.equal( subtotal( lines ), 300 + 500 + 700 );
		assert.equal( lineName( lines[ 2 ] ), 'Coaster set of 4 (Mixed: one of each pattern, TPU base)' );
		// The TPU base is a coaster set's only: asked for on anything else, it's left off.
		assert.deepEqual( checkCart( [ { id: 'keychain', tpu: true, qty: 1 } ] ).lines, [ { id: 'keychain', design: null, tpu: false, qty: 1 } ] );

	} );

	test( 'stickers and keychains go small; anything with a coaster, as a parcel', () => {

		assert.equal( tierOf( checkCart( [ { id: 'keychain-nfc', qty: 1 }, { id: 'stickers-10', qty: 1 } ] ).lines ), 'small' );
		assert.equal( tierOf( checkCart( [ { id: 'keychain', qty: 1 }, { id: 'coaster', design: 'badge', qty: 1 } ] ).lines ), 'parcel' );

	} );

	test( 'a bag packs small enough for Stripe\'s metadata, and back', () => {

		const { lines } = checkCart( [ { id: 'coaster-set', design: 'honeycomb', tpu: true, qty: 10 }, { id: 'keychain-wordmark', qty: 2 } ] );
		const packed = packCart( lines );
		assert.equal( packed, 'coaster-set:honeycomb:t:10,keychain-wordmark::0:2' );
		assert.deepEqual( checkCart( unpackCart( packed ) ).lines, lines );
		assert.equal( unpackCart( 'nonsense' ), null );
		assert.equal( money( 500 ), '$5' );
		assert.equal( money( 1250 ), '$12.50' );

	} );

	test( 'the shop opens only with everything set', () => {

		const env = { ...OPEN, SUPPORTER_PAYMENT_LINK_ID: '' };
		assert.deepEqual( shopSettings( env ).shipping.CA.small, { amount: 300, label: 'Lettermail (untracked)', days: [ 4, 12 ] } );
		assert.deepEqual( shopSettings( { ...env, SHOP_DAYS_US_PARCEL: '6-9' } ).shipping.US.parcel.days, [ 6, 9 ] );
		assert.equal( shopSettings( { ...env, SHOP_SALES: '' } ), null );
		assert.equal( shopSettings( { ...env, SHOP_SHIP_US_SMALL: '' } ), null, 'a postage price missing' );
		assert.equal( shopSettings( { ...env, SHOP_SHIP_CA_PARCEL: '9.50' } ), null, 'not whole cents' );
		assert.equal( shopSettings( { ...env, STRIPE_SECRET_KEY: '' } ), null );
		assert.equal( shopSettings( { ...env, STRIPE_WEBHOOK_SECRET: 'sk_live_wrongthing' } ), null );

	} );

} );

describe( 'the shop in the Worker', () => {

	let server;
	let keys;
	let stripe;
	let googleKey;
	let addresses = 0;

	async function call( path, { method = 'GET', body, cookie, headers = {} } = {} ) {

		const sent = { 'X-Test-Time': String( Date.now() ), 'CF-Connecting-IP': `198.18.9.${ ++ addresses % 250 }`, ...headers };
		if ( cookie ) sent.Cookie = cookie;
		if ( method !== 'GET' && body === undefined ) body = {};
		if ( body !== undefined ) {

			sent.Origin = server.base;
			sent[ 'Content-Type' ] = 'application/json';

		}

		const res = await fetch( server.base + path, { method, headers: sent, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify( body ), redirect: 'manual' } );
		const text = await res.text();
		let json = null;
		try {

			json = JSON.parse( text );

		} catch {

			// Not JSON.

		}

		return { status: res.status, headers: res.headers, text, json };

	}

	async function signIn( claims ) {

		const res = await call( '/api/session', { method: 'POST', body: { credential: await makeToken( googleKey, claims ) } } );
		const cookie = /^([\w-]*wd_session=[\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) ?? '' )?.[ 1 ];
		assert.ok( cookie, res.text );
		return cookie;

	}

	function webhook( event ) {

		const body = JSON.stringify( event );
		return call( '/api/stripe/webhook', { method: 'POST', body, headers: { 'Stripe-Signature': stripeSignature( body, WEBHOOK_SECRET ) } } );

	}

	before( async () => {

		googleKey = await makeKey( 'shop-test-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		stripe = await serveStripe();
		server = await startWorker( {
			port: PORT,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_JWKS_URL: keys.url, TEST_CLOCK: 'header', SUPPORTER_PAYMENT_LINK_ID: '',
				STRIPE_API_BASE: stripe.url, ADMIN_EMAILS: 'boss@example.com', ...OPEN,
			},
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();
		stripe?.close();

	} );

	test( 'the page is told the shop is open, and its postage', async () => {

		assert.equal( ( await call( '/api/config' ) ).json.shop, true );
		const shop = await call( '/api/shop' );
		assert.equal( shop.status, 200 );
		assert.equal( shop.json.open, true );
		assert.equal( shop.json.shipping.US.parcel.amount, 900 );

	} );

	test( 'a checkout is the catalog\'s prices, with the postage for where and what', async () => {

		const seen = stripe.requests.length;
		const small = await call( '/api/shop/checkout', { method: 'POST', body: { country: 'CA', items: [ { id: 'keychain-nfc', qty: 1 }, { id: 'sticker', design: 'tuk-tuk', qty: 2 } ] } } );
		assert.equal( small.status, 200, small.text );
		assert.match( small.json.url, /^https:\/\/checkout\.stripe\.com\// );
		const [ made ] = stripe.requests.slice( seen );
		assert.equal( made.path, '/v1/checkout/sessions' );
		assert.equal( made.auth, `Bearer ${ SECRET_KEY }` );
		const form = made.form;
		assert.equal( form.mode, 'payment' );
		assert.equal( form[ 'line_items[0][price_data][unit_amount]' ], '700' );
		assert.equal( form[ 'line_items[0][price_data][currency]' ], 'cad' );
		assert.equal( form[ 'line_items[1][price_data][product_data][name]' ], 'One sticker (Tuk-tuk)' );
		assert.equal( form[ 'line_items[1][quantity]' ], '2' );
		assert.equal( form[ 'shipping_address_collection[allowed_countries][0]' ], 'CA' );
		assert.equal( form[ 'shipping_address_collection[allowed_countries][1]' ], undefined );
		assert.equal( form[ 'shipping_options[0][shipping_rate_data][fixed_amount][amount]' ], '300' );
		assert.equal( form[ 'shipping_options[0][shipping_rate_data][display_name]' ], 'Lettermail (untracked)' );
		assert.equal( form[ 'metadata[shop]' ], 'order' );
		assert.equal( form[ 'metadata[cart]' ], 'keychain-nfc::0:1,sticker:tuk-tuk:0:2' );
		assert.equal( form[ 'payment_intent_data[metadata][shop]' ], 'order' );
		assert.equal( form.client_reference_id, undefined, 'nobody signed in' );

		const parcel = await call( '/api/shop/checkout', { method: 'POST', body: { country: 'US', items: [ { id: 'coaster-set', design: 'topo', tpu: true, qty: 1 } ] } } );
		assert.equal( parcel.status, 200, parcel.text );
		const usForm = stripe.requests.at( - 1 ).form;
		assert.equal( usForm[ 'line_items[0][price_data][unit_amount]' ], '700', 'the set and its TPU base' );
		assert.equal( usForm[ 'shipping_address_collection[allowed_countries][0]' ], 'US' );
		assert.equal( usForm[ 'shipping_options[0][shipping_rate_data][fixed_amount][amount]' ], '900' );
		assert.equal( usForm[ 'metadata[tier]' ], 'parcel' );

	} );

	test( 'bags the catalog doesn\'t allow are turned away before Stripe', async () => {

		const seen = stripe.requests.length;
		assert.equal( ( await call( '/api/shop/checkout', { method: 'POST', body: { country: 'GB', items: [ { id: 'keychain', qty: 1 } ] } } ) ).status, 400 );
		const lonely = await call( '/api/shop/checkout', { method: 'POST', body: { country: 'CA', items: [ { id: 'sticker', qty: 1 } ] } } );
		assert.equal( lonely.status, 400 );
		assert.match( lonely.json.error, /Single stickers/ );
		assert.equal( ( await call( '/api/shop/checkout', { method: 'POST', body: { country: 'CA', items: [ { id: 'keychain', qty: 1, price: 1 } ] } } ) ).status, 200, 'a price sent along is ignored' );
		assert.equal( stripe.requests.at( - 1 ).form[ 'line_items[0][price_data][unit_amount]' ], '500' );
		assert.equal( stripe.requests.length, seen + 1 );

	} );

	test( 'a paid order is kept for the owner, posted, and refunded', async () => {

		const paid = { id: 'evt_shop_paid_1', object: 'event', type: 'checkout.session.completed', livemode: false, created: Math.floor( Date.now() / 1000 ), data: { object: {
			id: 'cs_test_shop1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 1700, amount_subtotal: 700, currency: 'cad',
			metadata: { shop: 'order', cart: 'coaster-set:topo:t:1', country: 'CA', tier: 'parcel' }, payment_intent: 'pi_shop1', payment_link: null,
			customer_details: { email: 'Buyer@Example.com', name: 'Pat Buyer' }, shipping_cost: { amount_total: 1000 },
			collected_information: { shipping_details: { name: 'Pat Buyer', address: { line1: '1 Main St', line2: null, city: 'Vancouver', state: 'BC', postal_code: 'V5K 0A1', country: 'CA' } } },
		} } };
		assert.equal( ( await webhook( paid ) ).status, 200 );
		// Stripe sending it again changes nothing.
		assert.equal( ( await webhook( paid ) ).status, 200 );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM shop_orders' )[ 0 ].n, 1 );
		// Never a Supporter Pass.
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM purchases' )[ 0 ].n, 0 );

		assert.equal( ( await call( '/api/admin/shop' ) ).status, 401 );
		assert.equal( ( await call( '/api/admin/shop', { cookie: await signIn( { sub: '2002', email: 'someone@example.com' } ) } ) ).status, 403 );
		const owner = await signIn( { sub: '3003', email: 'boss@example.com' } );
		const listed = await call( '/api/admin/shop', { cookie: owner } );
		assert.equal( listed.status, 200, listed.text );
		const [ order ] = listed.json.orders;
		assert.equal( order.status, 'paid' );
		assert.equal( order.email, 'buyer@example.com' );
		assert.equal( order.name, 'Pat Buyer' );
		assert.deepEqual( order.address, { line1: '1 Main St', line2: '', city: 'Vancouver', state: 'BC', postal_code: 'V5K 0A1', country: 'CA' } );
		assert.deepEqual( order.items.map( line => [ line.qty, line.name ] ), [ [ 1, 'Coaster set of 4 (Topo map, TPU base)' ] ] );
		assert.equal( order.shipping, 1000 );
		assert.equal( order.total, 1700 );
		assert.equal( order.test, true );

		const posted = await call( '/api/admin/shop', { method: 'POST', cookie: owner, body: { id: 'cs_test_shop1', shipped: true, tracking: 'LM123456789CA' } } );
		assert.equal( posted.status, 200, posted.text );
		let [ now ] = ( await call( '/api/admin/shop', { cookie: owner } ) ).json.orders;
		assert.equal( now.status, 'shipped' );
		assert.equal( now.tracking, 'LM123456789CA' );

		const refund = { id: 'evt_shop_refund_1', object: 'event', type: 'charge.refunded', livemode: false, data: { object: { id: 'ch_shop1', object: 'charge', payment_intent: 'pi_shop1', refunded: true } } };
		assert.equal( ( await webhook( refund ) ).status, 200 );
		[ now ] = ( await call( '/api/admin/shop', { cookie: owner } ) ).json.orders;
		assert.equal( now.status, 'refunded' );
		assert.equal( ( await call( '/api/admin/shop', { method: 'POST', cookie: owner, body: { id: 'cs_test_shop1', shipped: true } } ) ).status, 409 );
		assert.equal( ( await call( '/api/admin/shop', { method: 'POST', cookie: owner, body: { id: 'cs_test_nothere', shipped: true } } ) ).status, 404 );

	} );

	test( 'an order whose bag the catalog no longer knows is kept, and flagged', async () => {

		const odd = { id: 'evt_shop_paid_2', object: 'event', type: 'checkout.session.completed', livemode: false, data: { object: {
			id: 'cs_test_shop2', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 900, currency: 'cad',
			metadata: { shop: 'order', cart: 'hoodie::0:1', country: 'US', tier: 'parcel' }, payment_intent: 'pi_shop2', customer_details: { email: 'x@example.com' },
		} } };
		assert.equal( ( await webhook( odd ) ).status, 200 );
		assert.equal( server.d1( 'SELECT result FROM stripe_events WHERE id = \'evt_shop_paid_2\'' )[ 0 ].result, 'unmatched' );
		assert.equal( server.d1( 'SELECT items FROM shop_orders WHERE id = \'cs_test_shop2\'' )[ 0 ].items, '[]' );

	} );

} );

// A stand-in for Stripe's API (STRIPE_API_BASE): Checkout Sessions made, each request kept to look
// at: { method, path, auth, form }.
async function serveStripe() {

	const requests = [];
	const stub = createServer( async ( req, res ) => {

		let body = '';
		for await ( const chunk of req ) body += chunk;
		requests.push( { method: req.method, path: req.url, auth: req.headers.authorization, form: Object.fromEntries( new URLSearchParams( body ) ) } );
		const made = req.method === 'POST' && req.url === '/v1/checkout/sessions';
		res.writeHead( made ? 200 : 404, { 'Content-Type': 'application/json' } );
		res.end( JSON.stringify( made ? { id: `cs_test_made${ requests.length }`, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/cs_test_made${ requests.length }` } : { error: { type: 'invalid_request_error' } } ) );

	} );
	await new Promise( resolve => stub.listen( 0, '127.0.0.1', resolve ) );
	return { url: `http://127.0.0.1:${ stub.address().port }`, requests, close: () => stub.close() };

}
