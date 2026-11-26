// npm run test:build-worker: World Drive Build's server (worker/drive/build.js) in World Drive's
// Worker under wrangler dev, with its migrations applied to a fresh local database: the three plans
// (free, Build Pro, the owner), the 3D map views each gets (the Maps key handed out and counted, a
// month's allowance, the day's cap on free views for everyone), saved projects (one on the free
// plan), share links (Pro's, their viewers on the owner's views), and Build Pro bought through a
// Checkout Session (against a stand-in for Stripe's API on this machine), managed in the billing
// portal, renewed, stopped, refunded and charged back through Stripe's webhook, apart from the
// Supporter Pass, and given by the owner (comps). All that with BUILD_SALES 'on'; then, with it
// unset (the default) and Stripe still set up, buying hidden: no prices, no checkout, the plans the same.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';
import { billingFor, billingSettings, salesOn } from '../worker/drive/billing.js';

const PORT = Number( process.env.TEST_BUILD_WORKER_PORT ) || 8786;
const HIDDEN_PORT = Number( process.env.TEST_BUILD_WORKER_HIDDEN_PORT ) || PORT + 1;
const MAPS_KEY = 'test-maps-key-not-real';
const WEBHOOK_SECRET = 'whsec_test_build_secret';
const BUILD_LINK_ID = 'plink_build0000000000000001';
const SECRET_KEY = [ 'rk', 'test', 'builduse0000000000000001' ].join( '_' );
const MONTHLY = 'price_buildmonthly0001';
const ANNUAL = 'price_buildannual0001';
const PORTAL = 'bpc_buildportal0001';
const BILLING = { enabled: true, monthly: 'US$5/month', annual: 'US$50/year', portal: false };
const HIDDEN = { enabled: false, hidden: true, monthly: null, annual: null, portal: false };
const PASS_LINK = 'https://buy.stripe.com/test_pass';
const DAY = Date.UTC( 2026, 10, 10, 12 );
const HOUR = 3600 * 1000;
const NEXT_MONTH = Date.UTC( 2026, 11, 2, 12 );
const FREE_MONTHLY = 3;
const FREE_DAILY = 5;
const LAYOUT = { version: 2, site: 'Test site', lat: 49.28, lon: - 123.12, items: [ { library: 'traffic-cone', east: 1, north: 2, heading: 0 } ], extras: {} };

let server;
let keys;
let stripe;
let googleKey;
let addresses = 0;

async function call( path, { method = 'GET', body, cookie, time = DAY, headers = {} } = {} ) {

	const sent = { 'X-Test-Time': String( time ), 'CF-Connecting-IP': `198.18.7.${ ++ addresses % 250 }`, ...headers };
	if ( cookie ) sent.Cookie = cookie;
	// The app sends JSON with everything but a GET ({} when there's nothing to say), as checkSameOrigin wants.
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

	const res = await call( '/build/api/session', { method: 'POST', body: { credential: await makeToken( googleKey, claims ) } } );
	const token = /^__Host-wd_session=([\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) ?? '' )?.[ 1 ];
	return { ...res, cookie: token ? `__Host-wd_session=${ token }` : null };

}

function webhook( event ) {

	const body = JSON.stringify( event );
	return call( '/api/stripe/webhook', { method: 'POST', body, headers: { 'Stripe-Signature': stripeSignature( body, WEBHOOK_SECRET ) } } );

}

function checkout( id, { link = BUILD_LINK_ID, reference = null, email = '', subscription = `sub_${ id }` } = {} ) {

	return { id: `evt_checkout_${ id }`, object: 'event', type: 'checkout.session.completed', livemode: false, data: { object: {
		id: `cs_test_${ id }`, object: 'checkout.session', mode: subscription ? 'subscription' : 'payment', payment_status: 'paid', amount_total: 500, currency: 'usd',
		client_reference_id: reference, customer_details: { email }, customer_email: null, payment_intent: `pi_${ id }`, payment_link: link, subscription,
	} } };

}

function subscriptionEvent( id, status, created ) {

	return { id: `evt_sub_${ id }_${ status }`, object: 'event', type: 'customer.subscription.updated', livemode: false, created, data: { object: { id: `sub_${ id }`, object: 'subscription', status } } };

}

const config = ( cookie, time, query = '' ) => call( `/build/api/config${ query }`, { cookie, time } );

// A stand-in for Stripe's API (STRIPE_API_BASE): customers, Checkout Sessions, billing portal
// sessions and cancelling a subscription, answered as Stripe does (only the fields read), with
// every request kept to look at: { method, path, auth, idempotency, form }.
async function serveStripe() {

	const requests = [];
	// What GET's lists answer, and calls made to fail, as each test sets them.
	const lists = { subscriptions: [], sessions: [], invoicePayments: [] };
	const fails = { cancel: false };
	let customers = 0;
	const stub = createServer( async ( req, res ) => {

		let body = '';
		for await ( const chunk of req ) body += chunk;
		const form = Object.fromEntries( new URLSearchParams( body ) );
		requests.push( { method: req.method, path: req.url, auth: req.headers.authorization, idempotency: req.headers[ 'idempotency-key' ] ?? null, form } );
		let status = 200;
		let answer;
		if ( req.method === 'POST' && req.url === '/v1/customers' ) answer = { id: `cus_test${ ++ customers }`, object: 'customer' };
		else if ( req.method === 'POST' && req.url === '/v1/checkout/sessions' ) answer = { id: `cs_test_made${ requests.length }`, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/cs_test_made${ requests.length }` };
		else if ( req.method === 'POST' && req.url === '/v1/billing_portal/sessions' ) answer = { id: 'bps_test', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/test_portal' };
		else if ( req.method === 'DELETE' && req.url.startsWith( '/v1/subscriptions/' ) ) [ status, answer ] = fails.cancel ? [ 503, { error: { type: 'api_error' } } ] : [ 200, { id: req.url.split( '/' ).pop(), object: 'subscription', status: 'canceled' } ];
		else if ( req.method === 'GET' && req.url.startsWith( '/v1/subscriptions?' ) ) answer = { object: 'list', data: lists.subscriptions };
		else if ( req.method === 'GET' && req.url.startsWith( '/v1/checkout/sessions?' ) ) answer = { object: 'list', data: lists.sessions };
		else if ( req.method === 'POST' && /^\/v1\/checkout\/sessions\/cs_[A-Za-z0-9_]+\/expire$/.test( req.url ) ) answer = { id: req.url.split( '/' )[ 4 ], object: 'checkout.session', status: 'expired' };
		else if ( req.method === 'GET' && req.url.startsWith( '/v1/invoice_payments?' ) ) answer = { object: 'list', data: lists.invoicePayments };
		else {

			status = 404;
			answer = { error: { type: 'invalid_request_error', message: 'Unrecognized request URL' } };

		}

		res.writeHead( status, { 'Content-Type': 'application/json' } );
		res.end( JSON.stringify( answer ) );

	} );
	await new Promise( resolve => stub.listen( 0, '127.0.0.1', resolve ) );
	return { url: `http://127.0.0.1:${ stub.address().port }`, requests, lists, fails, close: () => stub.close(), since: n => requests.slice( n ) };

}

const accountId = email => server.d1( `SELECT id FROM accounts WHERE email = '${ email }'` )[ 0 ].id;
const T = Math.floor( DAY / 1000 );

// Build Pro's own Checkout Session completed, as Stripe sends it for one billing.js made: no Payment
// Link and no PaymentIntent (a subscription's), the account and pass in its metadata.
function buildCheckout( id, account, { metadata = { account_id: String( account ), pass: 'build' }, subscription = `sub_${ id }` } = {} ) {

	return { id: `evt_build_checkout_${ id }`, object: 'event', type: 'checkout.session.completed', livemode: false, created: T, data: { object: {
		id: `cs_test_${ id }`, object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 500, currency: 'usd',
		client_reference_id: account === null ? null : String( account ), metadata, customer: 'cus_test1', customer_details: { email: '' }, customer_email: null,
		payment_intent: null, payment_link: null, subscription,
	} } };

}

// A Build Pro subscription as customer.subscription.* send it (the period on its item, as Stripe's
// newer API versions have it).
function buildSubscription( id, account, { status = 'active', created, type = 'customer.subscription.updated', interval = 'month', end = DAY + 30 * 24 * HOUR, cancel = false } = {} ) {

	return { id: `evt_bsub_${ id }_${ status }_${ created }`, object: 'event', type, livemode: false, created, data: { object: {
		id: `sub_${ id }`, object: 'subscription', status, customer: 'cus_test1', metadata: { account_id: String( account ), pass: 'build' },
		cancel_at_period_end: cancel, cancel_at: null, canceled_at: status === 'canceled' ? created : null, latest_invoice: null,
		items: { data: [ { quantity: 1, current_period_start: Math.floor( ( end - 30 * 24 * HOUR ) / 1000 ), current_period_end: Math.floor( end / 1000 ),
			price: { id: interval === 'year' ? ANNUAL : MONTHLY, unit_amount: interval === 'year' ? 5000 : 500, currency: 'usd', recurring: { interval } } } ] },
	} } };

}

// A subscription's invoice event: the older API's shape (subscription, charge, payment_intent on the
// invoice), or with `newer` the 2025 one (parent.subscription_details, payments).
function buildInvoice( id, subscription, { type = 'invoice.paid', paymentIntent = `pi_${ id }`, charge = `ch_${ id }`, reason = 'subscription_cycle', created = T, newer = false } = {} ) {

	const invoice = { id: `in_${ id }`, object: 'invoice', amount_paid: 500, currency: 'usd', billing_reason: reason, created, lines: { data: [ { period: { start: created, end: created + 30 * 24 * 3600 } } ] } };
	if ( newer ) Object.assign( invoice, { parent: { type: 'subscription_details', subscription_details: { subscription, metadata: { pass: 'build' } } }, payments: { data: [ { payment: { type: 'payment_intent', payment_intent: paymentIntent } } ] } } );
	else Object.assign( invoice, { subscription, charge, payment_intent: paymentIntent } );
	return { id: `evt_inv_${ id }_${ type }`, object: 'event', type, livemode: false, created, data: { object: invoice } };

}

function refundOf( id, paymentIntent ) {

	return { id: `evt_refund_${ id }`, object: 'event', type: 'charge.refunded', livemode: false, data: { object: { id: `ch_${ id }`, object: 'charge', payment_intent: paymentIntent, refunded: true } } };

}

// The Worker's settings: Stripe and everything else set up, with `extra` on top (BUILD_SALES).
function workerVars( extra = {} ) {

	return {
		GOOGLE_MAPS_API_KEY: MAPS_KEY,
		GOOGLE_CLIENT_ID: CLIENT_ID,
		GOOGLE_JWKS_URL: keys.url,
		TEST_CLOCK: 'header',
		STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
		SUPPORTER_PAYMENT_LINK: PASS_LINK,
		SUPPORTER_PAYMENT_LINK_ID: '',
		SUPPORTER_MANAGE_LINK: 'https://billing.stripe.com/p/login/test',
		// Build Pro's old Payment Link: its checkouts are still recorded, but it isn't sold any more.
		BUILD_PAYMENT_LINK_ID: BUILD_LINK_ID,
		STRIPE_SECRET_KEY: SECRET_KEY,
		STRIPE_API_BASE: stripe.url,
		BUILD_PRICE_MONTHLY: MONTHLY,
		BUILD_PRICE_ANNUAL: ANNUAL,
		BUILD_PORTAL_CONFIG: PORTAL,
		BUILD_FREE_MONTHLY: String( FREE_MONTHLY ),
		BUILD_FREE_DAILY: String( FREE_DAILY ),
		BUILD_PRO_MONTHLY: '50',
		BUILD_EMAILS: 'tester@example.com',
		ADMIN_EMAILS: 'boss@example.com',
		...extra,
	};

}

describe( 'World Drive Build', () => {

	let free;
	let pro;
	let owner;

	before( async () => {

		googleKey = await makeKey( 'build-test-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		stripe = await serveStripe();
		server = await startWorker( {
			port: PORT,
			config: 'wrangler.drive.jsonc',
			vars: workerVars( { BUILD_SALES: 'on' } ),
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();
		stripe?.close();

	} );

	test( 'signed out: no Maps key, asked to sign in, and Build Pro offered', async () => {

		const res = await config();
		assert.equal( res.status, 200, res.text );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		assert.equal( res.json.signedIn, false );
		assert.equal( res.json.googleClientId, CLIENT_ID );
		assert.equal( res.json.mapsKey, undefined );
		assert.equal( res.json.mapsReason, 'sign-in' );
		assert.deepEqual( res.json.premium, { enabled: true, unlocked: false, billing: BILLING, price: 'US$5/month' } );
		// The app's site-wide extras: none here, and nothing else.
		assert.deepEqual( ( await call( '/build/api/shared-items' ) ).json, { items: [] } );
		assert.equal( ( await call( '/build/api/nothing-here' ) ).status, 404 );
		assert.equal( ( await call( '/build/api/me' ) ).status, 401 );

	} );

	test( 'other sites can\'t use it', async () => {

		const res = await call( '/build/api/config', { headers: { 'Sec-Fetch-Site': 'cross-site' } } );
		assert.equal( res.status, 403 );

	} );

	test( 'free plan: signed in with Google, a month\'s 3D map views, each page one, then none till next month', async () => {

		free = await signIn( { sub: 'free-1', email: 'free@example.com', name: 'Fran Free' } );
		assert.equal( free.status, 200, free.text );
		assert.ok( free.cookie );
		assert.deepEqual( free.json.user, { id: String( accountId( 'free@example.com' ) ), name: 'Fran Free', firstName: 'Fran', email: 'free@example.com', picture: '' } );
		assert.equal( free.json.plan.tier, 'free' );
		assert.equal( free.json.premium.unlocked, false );
		assert.deepEqual( free.json.premium.billing, BILLING );
		assert.equal( free.json.plan.subscribed, false );
		assert.equal( free.json.plan.status, null );
		assert.equal( free.json.hasMapsKey, true );

		for ( let i = 1; i <= FREE_MONTHLY; i ++ ) {

			const res = await config( free.cookie, DAY + i * HOUR );
			assert.equal( res.json.mapsKey, MAPS_KEY, `view ${ i }` );
			assert.deepEqual( res.json.plan.views, { limit: FREE_MONTHLY, used: i } );

		}

		const over = await config( free.cookie, DAY + 5 * HOUR );
		assert.equal( over.json.mapsKey, undefined );
		assert.equal( over.json.mapsReason, 'used-up' );
		assert.equal( over.json.signedIn, true );
		const fresh = await config( free.cookie, NEXT_MONTH );
		assert.equal( fresh.json.mapsKey, MAPS_KEY, 'a new month, new views' );

	} );

	test( 'free plan: one saved project, no share links', async () => {

		const first = await call( '/build/api/layouts', { method: 'POST', body: { site: 'Test site', name: 'First', data: LAYOUT }, cookie: free.cookie } );
		assert.equal( first.status, 201, first.text );
		assert.equal( first.json.name, 'First' );
		const second = await call( '/build/api/layouts', { method: 'POST', body: { site: 'Test site', name: 'Second', data: LAYOUT }, cookie: free.cookie } );
		assert.equal( second.status, 403 );
		assert.match( second.json.error, /free plan saves one project/ );
		const shared = await call( `/build/api/layouts/${ first.json.id }/share`, { method: 'POST', cookie: free.cookie } );
		assert.equal( shared.status, 403 );
		// Saving changes to it is fine, with the version it started from.
		const saved = await call( `/build/api/layouts/${ first.json.id }`, { method: 'PUT', body: { data: { ...LAYOUT, items: [] } }, cookie: free.cookie, headers: { 'If-Match': `"${ first.json.updatedAt }"` } } );
		assert.equal( saved.status, 200, saved.text );
		const stale = await call( `/build/api/layouts/${ first.json.id }`, { method: 'PUT', body: { name: 'Old' }, cookie: free.cookie, headers: { 'If-Match': `"${ first.json.updatedAt }"` } } );
		assert.equal( stale.status, 409 );
		const read = await call( `/build/api/layouts/${ first.json.id }`, { cookie: free.cookie } );
		assert.deepEqual( read.json.data.items, [] );
		// Someone else's is not found.
		const other = await signIn( { sub: 'free-2', email: 'other@example.com', name: 'Otto' } );
		assert.equal( ( await call( `/build/api/layouts/${ first.json.id }`, { cookie: other.cookie } ) ).status, 404 );
		assert.deepEqual( ( await call( '/build/api/layouts?site=Test%20site', { cookie: other.cookie } ) ).json, { layouts: [] } );

	} );

	test( 'today\'s free views for everyone together have a cap: past it, "busy" till tomorrow', async () => {

		// Fran's three (above, today) and Otto's two make five.
		const otto = await signIn( { sub: 'free-2', email: 'other@example.com', name: 'Otto' } );
		const first = await config( otto.cookie, DAY + 6 * HOUR );
		assert.equal( first.json.mapsKey, MAPS_KEY, first.text );
		const second = await config( otto.cookie, DAY + 7 * HOUR );
		assert.equal( second.json.mapsKey, MAPS_KEY, second.text );
		const busy = await config( otto.cookie, DAY + 8 * HOUR );
		assert.equal( busy.json.mapsReason, 'busy' );
		assert.equal( ( await config( otto.cookie, DAY + 24 * HOUR ) ).json.mapsKey, MAPS_KEY, 'tomorrow' );

	} );

	test( 'checking out: a Checkout Session for the account, a new Stripe customer, one of the two prices at quantity 1, tax and terms', async () => {

		pro = await signIn( { sub: 'pro-1', email: 'pro@example.com', name: 'Pat Pro' } );
		assert.equal( ( await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'month' } } ) ).status, 401, 'signed in only' );
		assert.equal( ( await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'week' }, cookie: pro.cookie } ) ).status, 400 );
		const seen = stripe.requests.length;
		const res = await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'month' }, cookie: pro.cookie } );
		assert.equal( res.status, 200, res.text );
		assert.match( res.json.url, /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_made/ );
		// Stripe is asked first whether the new customer has Build Pro running or a checkout open (none).
		const [ customer, subscriptions, open, session ] = stripe.since( seen );
		assert.equal( subscriptions.path, '/v1/subscriptions?customer=cus_test1&status=all&limit=100' );
		assert.equal( open.path, '/v1/checkout/sessions?customer=cus_test1&status=open&limit=100' );
		const id = String( accountId( 'pro@example.com' ) );
		assert.equal( customer.path, '/v1/customers' );
		assert.equal( customer.auth, `Bearer ${ SECRET_KEY }` );
		assert.match( customer.idempotency, new RegExp( `^build-customer-${ id }-` ) );
		assert.deepEqual( customer.form, { email: 'pro@example.com', name: 'Pat Pro', 'metadata[account_id]': id } );
		assert.equal( session.path, '/v1/checkout/sessions' );
		assert.equal( session.auth, `Bearer ${ SECRET_KEY }` );
		const message = session.form[ 'custom_text[submit][message]' ];
		// The site's own address (wrangler dev serves it as worlddrive.app's route).
		const origin = new URL( session.form.success_url ).origin;
		assert.match( origin, /^https?:\/\/(worlddrive\.app|127\.0\.0\.1:\d+)$/ );
		assert.match( message, /renews automatically at US\$5\/month until you cancel/ );
		assert.deepEqual( session.form, {
			mode: 'subscription', customer: 'cus_test1', client_reference_id: id,
			'metadata[account_id]': id, 'metadata[pass]': 'build',
			'subscription_data[metadata][account_id]': id, 'subscription_data[metadata][pass]': 'build',
			'line_items[0][price]': MONTHLY, 'line_items[0][quantity]': '1',
			'automatic_tax[enabled]': 'true', 'tax_id_collection[enabled]': 'true',
			'customer_update[address]': 'auto', 'customer_update[name]': 'auto',
			'consent_collection[terms_of_service]': 'required', 'custom_text[submit][message]': message,
			success_url: `${ origin }/build/account/?checkout=done#billing`, cancel_url: `${ origin }/build/?checkout=cancelled`,
		} );
		assert.equal( server.d1( `SELECT stripe_customer FROM accounts WHERE id = ${ id }` )[ 0 ].stripe_customer, 'cus_test1' );
		// Changing their mind for yearly: the same customer, the yearly price, and the monthly checkout
		// still open in the other tab expired, so the two can't both be paid.
		const again = stripe.requests.length;
		stripe.lists.sessions = [ { id: 'cs_test_monthly_tab', object: 'checkout.session', status: 'open' } ];
		assert.equal( ( await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'year' }, cookie: pro.cookie } ) ).status, 200 );
		stripe.lists.sessions = [];
		const yearly = stripe.since( again );
		assert.deepEqual( yearly.map( r => `${ r.method } ${ r.path.split( '?' )[ 0 ] }` ),
			[ 'GET /v1/subscriptions', 'GET /v1/checkout/sessions', 'POST /v1/checkout/sessions/cs_test_monthly_tab/expire', 'POST /v1/checkout/sessions' ], 'no second customer' );
		// Paid in another tab and its webhook not here yet: Stripe's own list says Build Pro runs, so no new checkout.
		const paid = stripe.requests.length;
		stripe.lists.subscriptions = [ { id: 'sub_other_tab', object: 'subscription', status: 'active', metadata: { pass: 'build', account_id: id } } ];
		const twice = await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'month' }, cookie: pro.cookie } );
		stripe.lists.subscriptions = [];
		assert.equal( twice.status, 409 );
		assert.ok( ! stripe.since( paid ).some( r => r.method === 'POST' ), 'no checkout made' );
		assert.equal( yearly[ 3 ].form.customer, 'cus_test1' );
		assert.equal( yearly[ 3 ].form[ 'line_items[0][price]' ], ANNUAL );
		assert.match( yearly[ 3 ].form[ 'custom_text[submit][message]' ], /US\$50\/year/ );

	} );

	test( 'Build Pro bought: everything unlocked, more projects, share links, its own views', async () => {

		const id = accountId( 'pro@example.com' );
		assert.equal( ( await webhook( buildCheckout( 'p1', id ) ) ).status, 200 );
		assert.equal( ( await webhook( buildSubscription( 'p1', id, { created: T + 5, type: 'customer.subscription.created', end: DAY + 30 * 24 * HOUR } ) ) ).status, 200 );
		const me = await call( '/build/api/me', { cookie: pro.cookie } );
		assert.equal( me.json.plan.tier, 'pro' );
		assert.equal( me.json.premium.unlocked, true );
		assert.deepEqual( me.json.premium.billing, { ...BILLING, portal: true } );
		assert.equal( me.json.plan.subscribed, true );
		assert.equal( me.json.plan.status, 'active' );
		assert.equal( me.json.plan.interval, 'month' );
		assert.equal( me.json.plan.priceLabel, 'US$5/month' );
		assert.equal( me.json.plan.renewsAt, Math.floor( ( DAY + 30 * 24 * HOUR ) / 1000 ) * 1000 );
		assert.equal( me.json.plan.cancelAtPeriodEnd, false );
		assert.equal( me.json.plan.pastDue, false );
		assert.deepEqual( server.d1( 'SELECT pass, account_id, subscription FROM purchases WHERE checkout_session = \'cs_test_p1\'' ), [ { pass: 'build', account_id: id, subscription: 'sub_p1' } ] );
		assert.deepEqual( me.json.plan.views, { limit: 50, used: 0 } );
		// Pro's views aren't held by the free views' daily cap (spent above).
		assert.equal( ( await config( pro.cookie, DAY + 9 * HOUR ) ).json.mapsKey, MAPS_KEY );

		const a = await call( '/build/api/layouts', { method: 'POST', body: { site: 'Yard', name: 'A', data: LAYOUT }, cookie: pro.cookie } );
		const b = await call( '/build/api/layouts', { method: 'POST', body: { site: 'Yard', name: 'B', data: LAYOUT }, cookie: pro.cookie } );
		assert.equal( a.status, 201 );
		assert.equal( b.status, 201 );
		const share = await call( `/build/api/layouts/${ a.json.id }/share`, { method: 'POST', cookie: pro.cookie } );
		assert.equal( share.status, 200 );
		assert.match( share.json.shareToken, /^[\w-]{22}$/ );
		assert.equal( ( await call( `/build/api/layouts/${ a.json.id }/share`, { method: 'POST', cookie: pro.cookie } ) ).json.shareToken, share.json.shareToken, 'sharing again: the same link' );

		// Anyone with the link: the project (the owner's first name only), and the 3D map on the owner's views.
		const opened = await call( `/build/api/shared/${ share.json.shareToken }` );
		assert.equal( opened.status, 200 );
		assert.equal( opened.json.owner, 'Pat' );
		assert.equal( opened.json.data.items.length, 1 );
		const viewer = await config( undefined, DAY + 10 * HOUR, `?view=${ share.json.shareToken }` );
		assert.equal( viewer.json.mapsKey, MAPS_KEY );
		assert.equal( viewer.json.signedIn, false );
		assert.equal( ( await call( '/build/api/me', { cookie: pro.cookie } ) ).json.plan.views.used, 2 );

		// The owner's month of views used up: someone signed out is told it's the owner's, not
		// theirs (they never had any). The views made up for it go again after.
		server.d1( `INSERT INTO build_views ( account_id, tier, at ) WITH RECURSIVE n( i ) AS ( SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 48 ) SELECT ${ id }, 'pro', ${ DAY + 10 * HOUR } FROM n` );
		const late = await config( undefined, DAY + 10 * HOUR, `?view=${ share.json.shareToken }` );
		assert.equal( late.json.mapsKey, undefined );
		assert.equal( late.json.mapsReason, 'owner-used-up' );
		server.d1( `DELETE FROM build_views WHERE account_id = ${ id } AND rowid NOT IN ( SELECT rowid FROM build_views WHERE account_id = ${ id } ORDER BY rowid LIMIT 2 )` );
		assert.equal( ( await call( '/build/api/me', { cookie: pro.cookie } ) ).json.plan.views.used, 2 );

		// Build Pro isn't the Supporter Pass.
		const wd = await call( '/api/me', { cookie: pro.cookie } );
		assert.equal( wd.json.supporter, false );

	} );

	test( 'a blank site (no map): saved as one, opened with no Maps key and no 3D map view, its share link too', async () => {

		const views = async () => ( await call( '/build/api/me', { cookie: pro.cookie } ) ).json.plan.views.used;
		const before = await views();
		const data = { version: 2, site: 'Blank site', lat: 0, lon: 0, blank: { slope: 3, toward: 270 }, items: LAYOUT.items, extras: {} };
		const made = await call( '/build/api/layouts', { method: 'POST', body: { site: 'Blank site', name: 'Yard', data }, cookie: pro.cookie } );
		assert.equal( made.status, 201, made.text );
		assert.deepEqual( made.json.blank, { slope: 3, toward: 270 } );
		const listed = ( await call( '/build/api/layouts', { cookie: pro.cookie } ) ).json.layouts;
		assert.deepEqual( listed.find( l => l.id === made.json.id ).blank, { slope: 3, toward: 270 } );
		assert.ok( listed.filter( l => l.id !== made.json.id ).every( l => l.blank === null ), 'the others are on the map' );

		// The editor on it asks with blank=1: no key, nothing counted (and nothing turned away).
		const opened = await config( pro.cookie, DAY + 10 * HOUR, '?blank=1' );
		assert.equal( opened.json.mapsKey, undefined );
		assert.equal( opened.json.mapsReason, 'blank' );
		assert.equal( opened.json.signedIn, true );
		assert.equal( await views(), before );

		// Its share link: no key and no view of the owner's, even asked without blank=1.
		const token = ( await call( `/build/api/layouts/${ made.json.id }/share`, { method: 'POST', cookie: pro.cookie } ) ).json.shareToken;
		for ( const query of [ `?view=${ token }`, `?view=${ token }&blank=1` ] ) {

			const viewer = await config( undefined, DAY + 10 * HOUR, query );
			assert.equal( viewer.json.mapsKey, undefined, query );
			assert.equal( viewer.json.mapsReason, 'blank', query );

		}

		assert.equal( await views(), before );
		assert.deepEqual( ( await call( `/build/api/shared/${ token }` ) ).json.data.blank, { slope: 3, toward: 270 } );

		// Moved onto the map (the editor's site picker saves it without blank): an ordinary project.
		const moved = await call( `/build/api/layouts/${ made.json.id }`, { method: 'PUT', body: { site: 'Test site', data: LAYOUT }, cookie: pro.cookie } );
		assert.equal( moved.status, 200, moved.text );
		assert.equal( moved.json.blank, null );
		assert.equal( moved.json.lat, 49.28 );
		assert.equal( ( await call( `/build/api/layouts/${ made.json.id }`, { method: 'DELETE', cookie: pro.cookie } ) ).status, 204 );

	} );

	test( 'a Supporter Pass isn\'t Build Pro', async () => {

		const fan = await signIn( { sub: 'fan-1', email: 'fan@example.com', name: 'Fay Fan' } );
		await webhook( checkout( 's1', { link: 'plink_pass000000000000000001', reference: String( accountId( 'fan@example.com' ) ), subscription: null } ) );
		assert.equal( ( await call( '/api/me', { cookie: fan.cookie } ) ).json.supporter, true );
		assert.equal( ( await call( '/build/api/me', { cookie: fan.cookie } ) ).json.plan.tier, 'free' );

	} );

	test( 'Build Pro stopped: back to the free plan (projects kept, links off for the map)', async () => {

		await webhook( subscriptionEvent( 'p1', 'canceled', Math.floor( DAY / 1000 ) + 100000 ) );
		const me = await call( '/build/api/me', { cookie: pro.cookie } );
		assert.equal( me.json.plan.tier, 'free' );
		assert.equal( ( await call( '/build/api/layouts', { cookie: pro.cookie } ) ).json.layouts.length, 2, 'projects kept' );
		const list = await call( '/build/api/layouts', { cookie: pro.cookie } );
		const token = list.json.layouts.find( l => l.shareToken ).shareToken;
		const viewer = await config( undefined, DAY + 11 * HOUR, `?view=${ token }` );
		assert.equal( viewer.json.mapsKey, undefined );
		assert.equal( viewer.json.mapsReason, 'owner-free' );
		assert.equal( ( await call( `/build/api/shared/${ token }` ) ).status, 200, 'the project still opens' );

	} );

	test( 'one subscription at a time: a second checkout is refused while one runs, and allowed once it has stopped', async () => {

		// Pat's stopped (above): buying again reuses the customer.
		const seen = stripe.requests.length;
		const res = await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'year' }, cookie: pro.cookie } );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( stripe.since( seen ).filter( r => r.method === 'POST' ).map( r => [ r.path, r.form.customer ] ), [ [ '/v1/checkout/sessions', 'cus_test1' ] ] );
		// Sam's runs: refused, before Stripe is asked anything, even while only its subscription has
		// been heard of (its checkout's event not yet).
		const sam = await signIn( { sub: 'sam-1', email: 'sam@example.com', name: 'Sam' } );
		const id = accountId( 'sam@example.com' );
		assert.equal( ( await webhook( buildSubscription( 'sam', id, { created: T + 10, type: 'customer.subscription.created' } ) ) ).status, 200 );
		const before = stripe.requests.length;
		const refused = await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'month' }, cookie: sam.cookie } );
		assert.equal( refused.status, 409 );
		assert.match( refused.json.error, /Build Pro already/ );
		assert.equal( stripe.requests.length, before );
		assert.equal( ( await webhook( buildCheckout( 'sam', id ) ) ).status, 200 );
		assert.equal( ( await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'year' }, cookie: sam.cookie } ) ).status, 409 );

	} );

	test( 'the billing portal: for the account\'s customer, with Build Pro\'s portal settings, back to the account page', async () => {

		const seen = stripe.requests.length;
		const res = await call( '/build/api/billing/portal', { method: 'POST', cookie: pro.cookie } );
		assert.equal( res.status, 200, res.text );
		assert.equal( res.json.url, 'https://billing.stripe.com/p/session/test_portal' );
		const [ portal ] = stripe.since( seen );
		assert.deepEqual( portal.form, { customer: 'cus_test1', return_url: `${ new URL( portal.form.return_url ).origin }/build/account/#billing`, configuration: PORTAL } );
		// Never checked out: no customer, nothing to manage.
		assert.equal( ( await call( '/build/api/billing/portal', { method: 'POST', cookie: free.cookie } ) ).status, 404 );
		assert.equal( ( await call( '/build/api/billing/portal', { method: 'POST' } ) ).status, 401 );

	} );

	test( 'subscription changes out of order: an older event never undoes a newer one; set to cancel, then ended', async () => {

		const sam = await signIn( { sub: 'sam-1', email: 'sam@example.com', name: 'Sam' } );
		const id = accountId( 'sam@example.com' );
		const end = DAY + 365 * 24 * HOUR;
		// Switched to yearly and set to cancel (T + 30), and an older "monthly, renewing" (T + 20) arriving after it.
		assert.equal( ( await webhook( buildSubscription( 'sam', id, { created: T + 30, interval: 'year', end, cancel: true } ) ) ).status, 200 );
		assert.equal( ( await webhook( buildSubscription( 'sam', id, { created: T + 20, interval: 'month' } ) ) ).status, 200 );
		let plan = ( await call( '/build/api/me', { cookie: sam.cookie } ) ).json.plan;
		assert.equal( plan.tier, 'pro' );
		assert.equal( plan.interval, 'year' );
		assert.equal( plan.priceLabel, 'US$50/year' );
		assert.equal( plan.cancelAtPeriodEnd, true );
		assert.equal( plan.renewsAt, end );
		assert.deepEqual( server.d1( 'SELECT account_id, customer, pass, price_id, interval, amount, currency, quantity FROM subscriptions WHERE id = \'sub_sam\'' ),
			[ { account_id: id, customer: 'cus_test1', pass: 'build', price_id: ANNUAL, interval: 'year', amount: 5000, currency: 'usd', quantity: 1 } ] );
		// Past due: Pro kept while Stripe retries, and the page told.
		assert.equal( ( await webhook( buildSubscription( 'sam', id, { status: 'past_due', created: T + 40, interval: 'year', end } ) ) ).status, 200 );
		plan = ( await call( '/build/api/home', { cookie: sam.cookie } ) ).json.plan;
		assert.equal( plan.tier, 'pro' );
		assert.equal( plan.pastDue, true );
		assert.equal( plan.status, 'past_due' );
		// Ended; an "active" from before it (T + 45 < T + 50) changes nothing.
		assert.equal( ( await webhook( buildSubscription( 'sam', id, { status: 'canceled', created: T + 50, type: 'customer.subscription.deleted', interval: 'year', end } ) ) ).status, 200 );
		assert.equal( ( await webhook( buildSubscription( 'sam', id, { created: T + 45, interval: 'year', end } ) ) ).status, 200 );
		plan = ( await call( '/build/api/me', { cookie: sam.cookie } ) ).json.plan;
		assert.equal( plan.tier, 'free' );
		assert.equal( plan.subscribed, false );
		assert.equal( plan.status, 'canceled' );
		assert.equal( plan.renewsAt, null );
		// Unpaid ends it too.
		const una = await signIn( { sub: 'una-1', email: 'una@example.com', name: 'Una' } );
		const unaId = accountId( 'una@example.com' );
		await webhook( buildCheckout( 'una', unaId ) );
		assert.equal( ( await call( '/build/api/me', { cookie: una.cookie } ) ).json.plan.tier, 'pro' );
		await webhook( buildSubscription( 'una', unaId, { status: 'unpaid', created: T + 60 } ) );
		assert.equal( ( await call( '/build/api/me', { cookie: una.cookie } ) ).json.plan.tier, 'free' );

	} );

	test( 'renewals: invoice.paid kept with its charge; a failed one shows until it\'s paid', async () => {

		const rita = await signIn( { sub: 'rita-1', email: 'rita@example.com', name: 'Rita' } );
		const id = accountId( 'rita@example.com' );
		await webhook( buildCheckout( 'rita', id ) );
		assert.equal( ( await webhook( buildInvoice( 'r1', 'sub_rita', { reason: 'subscription_create', created: T } ) ) ).status, 200 );
		assert.equal( ( await webhook( buildInvoice( 'r2', 'sub_rita', { created: T + 2592000 } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT id, account_id, amount_paid, status, billing_reason, charge, payment_intent FROM invoices WHERE subscription = \'sub_rita\' ORDER BY created_at' ), [
			{ id: 'in_r1', account_id: id, amount_paid: 500, status: 'paid', billing_reason: 'subscription_create', charge: 'ch_r1', payment_intent: 'pi_r1' },
			{ id: 'in_r2', account_id: id, amount_paid: 500, status: 'paid', billing_reason: 'subscription_cycle', charge: 'ch_r2', payment_intent: 'pi_r2' },
		] );
		// The next renewal fails: Pro stays (Stripe retries) and the page asks for a new card.
		assert.equal( ( await webhook( buildInvoice( 'r3', 'sub_rita', { type: 'invoice.payment_failed', created: T + 2 * 2592000 } ) ) ).status, 200 );
		let plan = ( await call( '/build/api/me', { cookie: rita.cookie } ) ).json.plan;
		assert.equal( plan.tier, 'pro' );
		assert.equal( plan.pastDue, true );
		assert.equal( ( await webhook( buildInvoice( 'r3', 'sub_rita', { created: T + 2 * 2592000 } ) ) ).status, 200 );
		// A late "failed" for an invoice that's been paid changes nothing.
		assert.equal( ( await webhook( { ...buildInvoice( 'r3', 'sub_rita', { type: 'invoice.payment_action_required', created: T + 2 * 2592000 } ), id: 'evt_inv_r3_late' } ) ).status, 200 );
		plan = ( await call( '/build/api/me', { cookie: rita.cookie } ) ).json.plan;
		assert.equal( plan.pastDue, false );
		assert.equal( server.d1( 'SELECT status FROM invoices WHERE id = \'in_r3\'' )[ 0 ].status, 'paid' );

	} );

	test( 'a subscription\'s refund ends Build Pro at once and cancels it at Stripe', async () => {

		const rita = await signIn( { sub: 'rita-1', email: 'rita@example.com', name: 'Rita' } );
		const seen = stripe.requests.length;
		// The renewal's charge refunded in full, found through its invoice.
		assert.equal( ( await webhook( refundOf( 'r2', 'pi_r2' ) ) ).status, 200 );
		const plan = ( await call( '/build/api/me', { cookie: rita.cookie } ) ).json.plan;
		assert.equal( plan.tier, 'free' );
		assert.equal( plan.status, 'refunded' );
		assert.deepEqual( stripe.since( seen ).map( r => [ r.method, r.path ] ), [ [ 'DELETE', '/v1/subscriptions/sub_rita' ] ] );
		assert.deepEqual( server.d1( 'SELECT status FROM purchases WHERE checkout_session = \'cs_test_rita\'' ), [ { status: 'refunded' } ] );

	} );

	test( 'a chargeback on a subscription ends Build Pro and cancels it (Stripe\'s newer invoice shape)', async () => {

		const dora = await signIn( { sub: 'dora-1', email: 'dora@example.com', name: 'Dora' } );
		const id = accountId( 'dora@example.com' );
		await webhook( buildCheckout( 'dora', id ) );
		await webhook( buildInvoice( 'd1', 'sub_dora', { reason: 'subscription_create', newer: true } ) );
		assert.deepEqual( server.d1( 'SELECT subscription, payment_intent FROM invoices WHERE id = \'in_d1\'' ), [ { subscription: 'sub_dora', payment_intent: 'pi_d1' } ] );
		assert.equal( ( await call( '/build/api/me', { cookie: dora.cookie } ) ).json.plan.tier, 'pro' );
		const seen = stripe.requests.length;
		const opened = { id: 'evt_dispute_created_d1', object: 'event', type: 'charge.dispute.created', livemode: false, data: { object: { id: 'dp_d1', object: 'dispute', charge: 'ch_d1', payment_intent: 'pi_d1', status: 'needs_response' } } };
		assert.equal( ( await webhook( opened ) ).status, 200 );
		const plan = ( await call( '/build/api/me', { cookie: dora.cookie } ) ).json.plan;
		assert.equal( plan.tier, 'free' );
		assert.equal( plan.status, 'disputed' );
		assert.deepEqual( stripe.since( seen ).map( r => [ r.method, r.path ] ), [ [ 'DELETE', '/v1/subscriptions/sub_dora' ] ] );

	} );

	test( 'a refund whose cancel Stripe refuses fails the event, so Stripe\'s next try cancels it', async () => {

		const carl = await signIn( { sub: 'carl-1', email: 'carl@example.com', name: 'Carl' } );
		const id = accountId( 'carl@example.com' );
		await webhook( buildCheckout( 'carl', id ) );
		await webhook( buildInvoice( 'c1', 'sub_carl', { reason: 'subscription_create' } ) );
		stripe.fails.cancel = true;
		const failed = await webhook( refundOf( 'c1', 'pi_c1' ) );
		stripe.fails.cancel = false;
		assert.equal( failed.status, 500 );
		assert.equal( ( await call( '/build/api/me', { cookie: carl.cookie } ) ).json.plan.tier, 'free', 'Pro ends here either way' );
		assert.deepEqual( server.d1( 'SELECT result FROM stripe_events WHERE id = \'evt_refund_c1\'' ), [ { result: 'error' } ] );
		const seen = stripe.requests.length;
		assert.equal( ( await webhook( refundOf( 'c1', 'pi_c1' ) ) ).status, 200 );
		assert.deepEqual( stripe.since( seen ).map( r => [ r.method, r.path ] ), [ [ 'DELETE', '/v1/subscriptions/sub_carl' ] ] );

	} );

	test( 'Stripe\'s 2025-03-31 API: an invoice paid with no payment in the event is asked about, so its refund still finds it', async () => {

		const bea = await signIn( { sub: 'bea-1', email: 'bea@example.com', name: 'Bea' } );
		const id = accountId( 'bea@example.com' );
		await webhook( buildCheckout( 'bea', id ) );
		const event = buildInvoice( 'b1', 'sub_bea', { reason: 'subscription_create', newer: true } );
		delete event.data.object.payments;
		stripe.lists.invoicePayments = [ { id: 'inpay_b1', object: 'invoice_payment', status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_b1' } } ];
		const seen = stripe.requests.length;
		assert.equal( ( await webhook( event ) ).status, 200 );
		stripe.lists.invoicePayments = [];
		assert.deepEqual( stripe.since( seen ).map( r => `${ r.method } ${ r.path }` ), [ 'GET /v1/invoice_payments?invoice=in_b1&limit=10' ] );
		assert.deepEqual( server.d1( 'SELECT payment_intent FROM invoices WHERE id = \'in_b1\'' ), [ { payment_intent: 'pi_b1' } ] );
		// The charge names no invoice (as basil's don't): found by its PaymentIntent.
		assert.equal( ( await webhook( refundOf( 'b1', 'pi_b1' ) ) ).status, 200 );
		assert.equal( ( await call( '/build/api/me', { cookie: bea.cookie } ) ).json.plan.tier, 'free' );
		assert.ok( stripe.requests.some( r => r.method === 'DELETE' && r.path === '/v1/subscriptions/sub_bea' ) );

	} );

	test( 'two subscription events in the same second: a late "incomplete" never undoes "active"', async () => {

		const tia = await signIn( { sub: 'tia-1', email: 'tia@example.com', name: 'Tia' } );
		const id = accountId( 'tia@example.com' );
		await webhook( buildCheckout( 'tia', id ) );
		assert.equal( ( await webhook( buildSubscription( 'tia', id, { created: T + 5 } ) ) ).status, 200 );
		assert.equal( ( await webhook( buildSubscription( 'tia', id, { status: 'incomplete', created: T + 5, type: 'customer.subscription.created' } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT status FROM subscriptions WHERE id = \'sub_tia\'' ), [ { status: 'active' } ] );
		assert.equal( ( await call( '/build/api/me', { cookie: tia.cookie } ) ).json.plan.tier, 'pro' );
		// Ended in that second too: later in its life, so it stands.
		assert.equal( ( await webhook( buildSubscription( 'tia', id, { status: 'canceled', created: T + 5, type: 'customer.subscription.deleted' } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT status FROM subscriptions WHERE id = \'sub_tia\'' ), [ { status: 'canceled' } ] );

	} );

	test( 'out of order: a refund, then its invoice, then the checkout: Build Pro comes in taken back, and is cancelled', async () => {

		const olga = await signIn( { sub: 'olga-1', email: 'olga@example.com', name: 'Olga' } );
		const id = accountId( 'olga@example.com' );
		await webhook( refundOf( 'o1', 'pi_o1' ) );
		await webhook( buildInvoice( 'o1', 'sub_olga', { reason: 'subscription_create' } ) );
		await webhook( buildCheckout( 'olga', id ) );
		assert.equal( ( await call( '/build/api/me', { cookie: olga.cookie } ) ).json.plan.tier, 'free' );
		assert.deepEqual( server.d1( 'SELECT status FROM purchases WHERE checkout_session = \'cs_test_olga\'' ), [ { status: 'refunded' } ] );
		assert.ok( stripe.requests.some( r => r.method === 'DELETE' && r.path === '/v1/subscriptions/sub_olga' ), 'and its subscription cancelled' );

	} );

	test( 'a payment that matches nothing sold is never a lifetime Supporter Pass: kept as unmatched', async () => {

		// SUPPORTER_PAYMENT_LINK_ID is empty (any of the account's links is the pass), yet a checkout
		// through no link at all, or one marked for something else, isn't one.
		const nora = await signIn( { sub: 'nora-1', email: 'nora@example.com', name: 'Nora' } );
		const id = accountId( 'nora@example.com' );
		assert.equal( ( await webhook( buildCheckout( 'nora1', id, { metadata: {} } ) ) ).status, 200 );
		assert.equal( ( await webhook( buildCheckout( 'nora2', id, { metadata: { pass: 'team', account_id: String( id ) } } ) ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT COUNT(*) AS n FROM purchases WHERE checkout_session IN ( \'cs_test_nora1\', \'cs_test_nora2\' )' ), [ { n: 0 } ] );
		assert.deepEqual( server.d1( 'SELECT id, result FROM stripe_events WHERE id LIKE \'evt_build_checkout_nora%\' ORDER BY id' ),
			[ { id: 'evt_build_checkout_nora1', result: 'unmatched' }, { id: 'evt_build_checkout_nora2', result: 'unmatched' } ] );
		assert.equal( server.d1( 'SELECT n FROM stats_daily WHERE metric = \'build_webhook\' AND key = \'unmatched\'' )[ 0 ].n, 2 );
		assert.equal( ( await call( '/api/me', { cookie: nora.cookie } ) ).json.supporter, false );
		assert.equal( ( await call( '/build/api/me', { cookie: nora.cookie } ) ).json.plan.tier, 'free' );

	} );

	test( 'each event once: one already acted on, sent again, is skipped', async () => {

		const event = buildCheckout( 'p1', accountId( 'pro@example.com' ) );
		assert.equal( ( await webhook( event ) ).status, 200 );
		assert.deepEqual( server.d1( 'SELECT type, result FROM stripe_events WHERE id = \'evt_build_checkout_p1\'' ), [ { type: 'checkout.session.completed', result: 'ok' } ] );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM purchases WHERE checkout_session = \'cs_test_p1\'' )[ 0 ].n, 1 );

	} );

	test( 'the owner gives Build Pro (comps) from the admin page, for a while or for good, and takes it back', async () => {

		const otto = await signIn( { sub: 'free-2', email: 'other@example.com', name: 'Otto' } );
		owner = await signIn( { sub: 'boss-1', email: 'boss@example.com', name: 'Big Boss' } );
		assert.equal( ( await call( '/api/admin/build/comp', { method: 'POST', cookie: otto.cookie, body: { account: 'other@example.com' } } ) ).status, 403, 'admins only' );
		assert.equal( ( await call( '/api/admin/build/comp', { method: 'POST', cookie: owner.cookie, body: { account: 'nobody@example.com' } } ) ).status, 404 );
		assert.equal( ( await call( '/api/admin/build/comp', { method: 'POST', cookie: owner.cookie, body: { account: 'other@example.com', until: DAY - 1 } } ) ).status, 400, 'not in the past' );
		const until = DAY + 2 * 24 * HOUR;
		const given = await call( '/api/admin/build/comp', { method: 'POST', cookie: owner.cookie, body: { account: 'Other@Example.com', reason: 'Beta tester', until } } );
		assert.equal( given.status, 200, given.text );
		assert.deepEqual( given.json, { account: { id: accountId( 'other@example.com' ), email: 'other@example.com', username: null }, comp: { reason: 'Beta tester', until, createdAt: DAY } } );
		let plan = ( await call( '/build/api/me', { cookie: otto.cookie, time: DAY + HOUR } ) ).json.plan;
		assert.equal( plan.tier, 'pro' );
		assert.equal( plan.comped, true );
		assert.equal( plan.subscribed, false );
		assert.equal( ( await call( '/build/api/me', { cookie: otto.cookie, time: until + HOUR } ) ).json.plan.tier, 'free', 'till it ends' );
		const listed = await call( '/api/admin/build/comps', { cookie: owner.cookie } );
		assert.equal( listed.json.comps[ 0 ].reason, 'Beta tester' );
		assert.equal( listed.json.comps[ 0 ].active, true );
		// For good, then taken back.
		await call( '/api/admin/build/comp', { method: 'POST', cookie: owner.cookie, body: { account: String( accountId( 'other@example.com' ) ) } } );
		assert.equal( ( await call( '/build/api/me', { cookie: otto.cookie, time: until + HOUR } ) ).json.plan.tier, 'pro' );
		const taken = await call( '/api/admin/build/comp', { method: 'POST', cookie: owner.cookie, body: { account: 'other@example.com', remove: true } } );
		assert.equal( taken.json.comp, null );
		assert.equal( ( await call( '/build/api/me', { cookie: otto.cookie } ) ).json.plan.tier, 'free' );

	} );

	test( 'never on sale unless it\'s all set up: the key, two different price ids, sign-in and the webhook', () => {

		const full = { STRIPE_SECRET_KEY: SECRET_KEY, BUILD_PRICE_MONTHLY: MONTHLY, BUILD_PRICE_ANNUAL: ANNUAL, GOOGLE_CLIENT_ID: CLIENT_ID, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, BUILD_SALES: 'on' };
		assert.deepEqual( billingSettings( full ), { prices: { month: MONTHLY, year: ANNUAL } } );
		for ( const [ why, change ] of Object.entries( {
			'no key': { STRIPE_SECRET_KEY: '' },
			'a publishable key': { STRIPE_SECRET_KEY: 'pk_live_0000000000000000' },
			'a webhook secret as the key': { STRIPE_SECRET_KEY: WEBHOOK_SECRET },
			'no monthly price': { BUILD_PRICE_MONTHLY: undefined },
			'no yearly price': { BUILD_PRICE_ANNUAL: '' },
			'a product id, not a price': { BUILD_PRICE_MONTHLY: 'prod_123' },
			'the same price twice': { BUILD_PRICE_ANNUAL: MONTHLY },
			'no sign-in': { GOOGLE_CLIENT_ID: '' },
			'no webhook secret': { STRIPE_WEBHOOK_SECRET: '' },
			'a broken link id for the pass': { SUPPORTER_PAYMENT_LINK_ID: 'https://buy.stripe.com/x' },
		} ) ) {

			assert.equal( billingSettings( { ...full, ...change } ), null, why );
			assert.equal( billingFor( { ...full, ...change }, null ).enabled, false, why );

		}

		assert.deepEqual( billingFor( { BUILD_PRICE_LABEL_MONTHLY: 'US$6/month', BUILD_SALES: 'on' }, null ), { enabled: false, monthly: 'US$6/month', annual: 'US$50/year', portal: false } );
		// BUILD_SALES not 'on': hidden, however set up Stripe is; the portal still for an account with a customer.
		for ( const sales of [ undefined, '', 'off', 'yes', 'true' ] ) {

			assert.equal( salesOn( { ...full, BUILD_SALES: sales } ), false, String( sales ) );
			assert.deepEqual( billingFor( { ...full, BUILD_SALES: sales }, null ), HIDDEN, String( sales ) );

		}

		assert.deepEqual( billingFor( { ...full, BUILD_SALES: undefined }, { customer: true } ), { ...HIDDEN, portal: true } );
		assert.equal( salesOn( { BUILD_SALES: 'on' } ), true );

	} );

	test( 'BUILD_EMAILS have Pro without paying; the owner has everything, never counted', async () => {

		const tester = await signIn( { sub: 'tester-1', email: 'tester@example.com', name: 'Tess' } );
		assert.equal( tester.json.plan.tier, 'pro' );
		owner = await signIn( { sub: 'boss-1', email: 'boss@example.com', name: 'Big Boss' } );
		assert.equal( owner.json.plan.tier, 'owner' );
		assert.equal( owner.json.premium.unlocked, true );
		for ( let i = 0; i < 6; i ++ ) assert.equal( ( await config( owner.cookie, DAY + 12 * HOUR + i ) ).json.mapsKey, MAPS_KEY );
		assert.deepEqual( ( await call( '/build/api/me', { cookie: owner.cookie } ) ).json.plan.views, { limit: null, used: 0 } );

	} );

	test( 'the company logo: Build Pro\'s, PNG or WebP only, on its share links too, removable', async () => {

		// A 1 x 1 PNG with alpha (colour type 6, RGBA), as the dashboard sends a logo whose background
		// it took out: kept byte for byte, alpha and all.
		const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
		const tester = await signIn( { sub: 'tester-1', email: 'tester@example.com', name: 'Tess' } );
		assert.equal( ( await call( '/build/api/logo', { cookie: tester.cookie } ) ).status, 404, 'none yet' );
		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: free.cookie, body: { image: `data:image/png;base64,${ png }` } } ) ).status, 403, 'not on the free plan' );
		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: tester.cookie, body: { image: 'data:image/svg+xml;base64,PHN2Zy8+' } } ) ).status, 400, 'no SVG' );
		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: tester.cookie, body: { image: 'data:image/png;base64,AAAAAAAA' } } ) ).status, 400, 'a PNG has to be one' );
		// Up to 256 KB of image, and no more (the dashboard keeps under it).
		const sized = bytes => {

			const out = Buffer.alloc( bytes, 7 );
			Buffer.from( png, 'base64' ).copy( out );
			return `data:image/png;base64,${ out.toString( 'base64' ) }`;

		};

		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: tester.cookie, body: { image: sized( 256 * 1024 ) } } ) ).status, 204, 'a full 256 KB' );
		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: tester.cookie, body: { image: sized( 256 * 1024 + 1 ) } } ) ).status, 413, 'a byte over' );
		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: tester.cookie, body: { image: `data:image/png;base64,${ png }` } } ) ).status, 204 );
		const got = await fetch( `${ server.base }/build/app/api/logo`, { headers: { Cookie: tester.cookie } } );
		assert.equal( got.headers.get( 'Content-Type' ), 'image/png' );
		assert.equal( Buffer.from( await got.arrayBuffer() ).toString( 'base64' ), png, 'the editor gets it, as sent' );
		assert.equal( ( await call( '/build/api/home', { cookie: tester.cookie } ) ).json.hasLogo, true );
		// A shared project shows its owner's logo to whoever opens the link.
		const made = await call( '/build/api/layouts', { method: 'POST', cookie: tester.cookie, body: { site: 'Somewhere', name: 'Branded', data: { version: 2, site: 'Somewhere', lat: 49, lon: - 123, items: [], extras: {} } } } );
		const share = await call( `/build/api/layouts/${ made.json.id }/share`, { method: 'POST', cookie: tester.cookie } );
		assert.equal( ( await call( `/build/app/api/shared/${ share.json.shareToken }/logo` ) ).status, 200 );
		assert.equal( ( await call( `/build/api/shared/${ 'x'.repeat( 22 ) }/logo` ) ).status, 404 );
		assert.equal( ( await call( '/build/api/logo', { method: 'DELETE', cookie: tester.cookie } ) ).status, 204 );
		assert.equal( ( await call( `/build/app/api/shared/${ share.json.shareToken }/logo` ) ).status, 404, 'gone from the link too' );

	} );

	test( 'signing out', async () => {

		const res = await call( '/build/api/session', { method: 'DELETE', cookie: free.cookie } );
		assert.ok( res.status === 200 || res.status === 204, res.text );
		assert.equal( ( await config( free.cookie, DAY + 13 * HOUR ) ).json.signedIn, false );

	} );

} );

// BUILD_SALES unset (the default), with Stripe fully set up all the same: buying is hidden. The
// plans and their limits are as with it on; no payload carries a price, checkout is refused, and
// the billing portal still opens for an account that has a Stripe customer.
describe( 'World Drive Build, buying hidden (BUILD_SALES unset)', () => {

	const PRICE_WORDS = /US\$|\/month|\/year|price_build/;

	before( async () => {

		googleKey = await makeKey( 'build-test-key-hidden' );
		keys = await serveKeys( [ googleKey.jwk ] );
		stripe = await serveStripe();
		server = await startWorker( { port: HIDDEN_PORT, config: 'wrangler.drive.jsonc', vars: workerVars() } );

	} );

	after( () => {

		server?.stop();
		keys?.close();
		stripe?.close();

	} );

	test( 'signed out: Build Pro gated, no prices', async () => {

		const res = await config();
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( res.json.premium, { enabled: true, unlocked: false, billing: HIDDEN } );
		assert.doesNotMatch( res.text, PRICE_WORDS );
		const home = await call( '/build/api/home' );
		assert.deepEqual( home.json.premium, { enabled: true, unlocked: false, billing: HIDDEN } );
		assert.doesNotMatch( home.text, PRICE_WORDS );
		const refused = await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'month' } } );
		assert.equal( refused.status, 404 );

	} );

	test( 'free plan: the same limits, no prices, and checkout refused without asking Stripe', async () => {

		const free = await signIn( { sub: 'hidden-free', email: 'hfree@example.com', name: 'Hal Free' } );
		assert.equal( free.status, 200, free.text );
		assert.equal( free.json.plan.tier, 'free' );
		assert.equal( free.json.plan.priceLabel, null );
		assert.deepEqual( free.json.plan.views, { limit: FREE_MONTHLY, used: 0 } );
		assert.equal( free.json.plan.layouts, 1 );
		assert.deepEqual( free.json.premium, { enabled: true, unlocked: false, billing: HIDDEN } );
		for ( const path of [ '/build/api/me', '/build/api/home', '/build/api/config', '/build/api/account' ] ) {

			const res = await call( path, { cookie: free.cookie, time: DAY + HOUR } );
			assert.equal( res.status, 200, `${ path }: ${ res.text }` );
			assert.doesNotMatch( res.text, PRICE_WORDS, path );
			if ( res.json.premium ) assert.deepEqual( res.json.premium.billing, HIDDEN, path );
			assert.equal( res.json.premium?.price, undefined, path );

		}

		const asked = stripe.requests.length;
		for ( const interval of [ 'month', 'year' ] ) {

			const res = await call( '/build/api/billing/checkout', { method: 'POST', cookie: free.cookie, body: { interval } } );
			assert.equal( res.status, 404, res.text );
			assert.match( res.json.error, /isn't available to buy/ );

		}

		assert.equal( stripe.requests.length, asked, 'Stripe never asked' );
		// One project, still.
		assert.equal( ( await call( '/build/api/layouts', { method: 'POST', body: { site: 'Test site', name: 'First', data: LAYOUT }, cookie: free.cookie } ) ).status, 201 );
		assert.equal( ( await call( '/build/api/layouts', { method: 'POST', body: { site: 'Test site', name: 'Second', data: LAYOUT }, cookie: free.cookie } ) ).status, 403 );

	} );

	test( 'Build Pro from the owner\'s comps and BUILD_EMAILS, still', async () => {

		const owner = await signIn( { sub: 'hidden-boss', email: 'boss@example.com', name: 'Big Boss' } );
		assert.equal( owner.json.plan.tier, 'owner' );
		const comped = await signIn( { sub: 'hidden-comp', email: 'hcomp@example.com', name: 'Cam Comp' } );
		assert.equal( comped.json.plan.tier, 'free' );
		const given = await call( '/api/admin/build/comp', { method: 'POST', cookie: owner.cookie, body: { account: 'hcomp@example.com', reason: 'Friend' } } );
		assert.equal( given.status, 200, given.text );
		const me = await call( '/build/api/me', { cookie: comped.cookie } );
		assert.equal( me.json.plan.tier, 'pro' );
		assert.equal( me.json.plan.comped, true );
		assert.deepEqual( me.json.plan.views, { limit: 50, used: 0 } );
		assert.deepEqual( me.json.premium, { enabled: true, unlocked: true, billing: HIDDEN } );
		const tester = await signIn( { sub: 'hidden-tester', email: 'tester@example.com', name: 'Tess' } );
		assert.equal( tester.json.plan.tier, 'pro' );
		assert.equal( tester.json.premium.unlocked, true );

	} );

	test( 'an account that once paid still gets the billing portal', async () => {

		const payer = await signIn( { sub: 'hidden-payer', email: 'hpayer@example.com', name: 'Pat Payer' } );
		assert.equal( payer.json.premium.billing.portal, false );
		server.d1( `UPDATE accounts SET stripe_customer = 'cus_hiddenpayer1' WHERE email = 'hpayer@example.com'` );
		const me = await call( '/build/api/me', { cookie: payer.cookie } );
		assert.deepEqual( me.json.premium.billing, { ...HIDDEN, portal: true } );
		const portal = await call( '/build/api/billing/portal', { method: 'POST', cookie: payer.cookie } );
		assert.equal( portal.status, 200, portal.text );
		assert.equal( portal.json.url, 'https://billing.stripe.com/p/session/test_portal' );
		assert.equal( stripe.requests.at( - 1 ).form.customer, 'cus_hiddenpayer1' );
		// No customer: nothing to open, as before.
		const free = await signIn( { sub: 'hidden-free', email: 'hfree@example.com', name: 'Hal Free' } );
		assert.equal( ( await call( '/build/api/billing/portal', { method: 'POST', cookie: free.cookie } ) ).status, 404 );

	} );

	// The one place planOf's hiding shows: a subscription with an interval, whose priceLabel would
	// otherwise be 'US$5/month'. It stays Build Pro (and its webhooks are still handled), but nothing
	// it's sent says what it costs.
	test( 'a subscriber (bought before buying was hidden): Build Pro, its interval, but no priceLabel anywhere', async () => {

		const sub = await signIn( { sub: 'hidden-sub', email: 'hsub@example.com', name: 'Sam Sub' } );
		const id = accountId( 'hsub@example.com' );
		assert.equal( ( await webhook( buildCheckout( 'hsub', id ) ) ).status, 200 );
		assert.equal( ( await webhook( buildSubscription( 'hsub', id, { created: T + 5, type: 'customer.subscription.created' } ) ) ).status, 200 );
		const me = await call( '/build/api/me', { cookie: sub.cookie } );
		assert.equal( me.json.plan.tier, 'pro', me.text );
		assert.equal( me.json.plan.subscribed, true );
		assert.equal( me.json.plan.interval, 'month' );
		assert.equal( me.json.plan.priceLabel, null );
		assert.equal( me.json.premium.billing.hidden, true );
		for ( const path of [ '/build/api/me', '/build/api/home', '/build/api/config', '/build/api/account' ] ) {

			const res = await call( path, { cookie: sub.cookie } );
			assert.equal( res.status, 200, `${ path }: ${ res.text }` );
			assert.doesNotMatch( res.text, PRICE_WORDS, path );
			if ( res.json.plan?.priceLabel !== undefined ) assert.equal( res.json.plan.priceLabel, null, path );
			assert.equal( res.json.premium?.price, undefined, path );

		}

		// Yearly too.
		assert.equal( ( await webhook( buildSubscription( 'hsub', id, { created: T + 6, interval: 'year' } ) ) ).status, 200 );
		const yearly = await call( '/build/api/me', { cookie: sub.cookie } );
		assert.equal( yearly.json.plan.interval, 'year' );
		assert.equal( yearly.json.plan.priceLabel, null );
		assert.doesNotMatch( yearly.text, PRICE_WORDS );

	} );

} );
