// npm run test:build-worker: World Drive Build's server (worker/drive/build.js) in World Drive's
// Worker under wrangler dev, with its migrations applied to a fresh local database: the three plans
// (free, Build Pro, the owner), the 3D map views each gets (the Maps key handed out and counted, a
// month's allowance, the day's cap on free views for everyone), saved projects (one on the free
// plan), share links (Pro's, their viewers on the owner's views), and Build Pro bought, stopped and
// refunded through Stripe's webhook, apart from the Supporter Pass.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';

const PORT = Number( process.env.TEST_BUILD_WORKER_PORT ) || 8786;
const MAPS_KEY = 'test-maps-key-not-real';
const WEBHOOK_SECRET = 'whsec_test_build_secret';
const BUILD_LINK = 'https://buy.stripe.com/test_build';
const BUILD_LINK_ID = 'plink_build0000000000000001';
const PASS_LINK = 'https://buy.stripe.com/test_pass';
const DAY = Date.UTC( 2026, 10, 10, 12 );
const HOUR = 3600 * 1000;
const NEXT_MONTH = Date.UTC( 2026, 11, 2, 12 );
const FREE_MONTHLY = 3;
const FREE_DAILY = 5;
const LAYOUT = { version: 2, site: 'Test site', lat: 49.28, lon: - 123.12, items: [ { library: 'traffic-cone', east: 1, north: 2, heading: 0 } ], extras: {} };

let server;
let keys;
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

describe( 'World Drive Build', () => {

	let free;
	let pro;
	let owner;

	before( async () => {

		googleKey = await makeKey( 'build-test-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		server = await startWorker( {
			port: PORT,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				GOOGLE_CLIENT_ID: CLIENT_ID,
				GOOGLE_JWKS_URL: keys.url,
				TEST_CLOCK: 'header',
				STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
				SUPPORTER_PAYMENT_LINK: PASS_LINK,
				SUPPORTER_PAYMENT_LINK_ID: '',
				SUPPORTER_MANAGE_LINK: 'https://billing.stripe.com/p/login/test',
				BUILD_PAYMENT_LINK: BUILD_LINK,
				BUILD_PAYMENT_LINK_ID: BUILD_LINK_ID,
				BUILD_PRICE: 'US$5/month',
				BUILD_FREE_MONTHLY: String( FREE_MONTHLY ),
				BUILD_FREE_DAILY: String( FREE_DAILY ),
				BUILD_PRO_MONTHLY: '50',
				BUILD_EMAILS: 'tester@example.com',
				ADMIN_EMAILS: 'boss@example.com',
			},
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();

	} );

	test( 'signed out: no Maps key, asked to sign in, and Build Pro offered', async () => {

		const res = await config();
		assert.equal( res.status, 200, res.text );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		assert.equal( res.json.signedIn, false );
		assert.equal( res.json.googleClientId, CLIENT_ID );
		assert.equal( res.json.mapsKey, undefined );
		assert.equal( res.json.mapsReason, 'sign-in' );
		assert.deepEqual( res.json.premium, { enabled: true, unlocked: false, link: BUILD_LINK, price: 'US$5/month' } );
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
		assert.deepEqual( free.json.user, { name: 'Fran Free', firstName: 'Fran', email: 'free@example.com', picture: '' } );
		assert.equal( free.json.plan.tier, 'free' );
		assert.equal( free.json.premium.unlocked, false );
		assert.equal( free.json.premium.clientReferenceId !== undefined, true );
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

	test( 'Build Pro bought through its link: everything unlocked, more projects, share links, its own views', async () => {

		pro = await signIn( { sub: 'pro-1', email: 'pro@example.com', name: 'Pat Pro' } );
		const reference = pro.json.premium.clientReferenceId;
		assert.equal( ( await webhook( checkout( 'p1', { reference, email: 'pro@example.com' } ) ) ).status, 200 );
		const me = await call( '/build/api/me', { cookie: pro.cookie } );
		assert.equal( me.json.plan.tier, 'pro' );
		assert.equal( me.json.premium.unlocked, true );
		assert.equal( me.json.premium.manage, 'https://billing.stripe.com/p/login/test' );
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

		// Build Pro isn't the Supporter Pass.
		const wd = await call( '/api/me', { cookie: pro.cookie } );
		assert.equal( wd.json.supporter, false );

	} );

	test( 'a Supporter Pass isn\'t Build Pro', async () => {

		const fan = await signIn( { sub: 'fan-1', email: 'fan@example.com', name: 'Fay Fan' } );
		await webhook( checkout( 's1', { link: 'plink_pass000000000000000001', reference: fan.json.premium.clientReferenceId, subscription: null } ) );
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

	test( 'BUILD_EMAILS have Pro without paying; the owner has everything, never counted', async () => {

		const tester = await signIn( { sub: 'tester-1', email: 'tester@example.com', name: 'Tess' } );
		assert.equal( tester.json.plan.tier, 'pro' );
		owner = await signIn( { sub: 'boss-1', email: 'boss@example.com', name: 'Big Boss' } );
		assert.equal( owner.json.plan.tier, 'owner' );
		assert.equal( owner.json.premium.unlocked, true );
		for ( let i = 0; i < 6; i ++ ) assert.equal( ( await config( owner.cookie, DAY + 12 * HOUR + i ) ).json.mapsKey, MAPS_KEY );
		assert.deepEqual( ( await call( '/build/api/me', { cookie: owner.cookie } ) ).json.plan.views, { limit: null, used: 0 } );

	} );

	test( 'signing out', async () => {

		const res = await call( '/build/api/session', { method: 'DELETE', cookie: free.cookie } );
		assert.ok( res.status === 200 || res.status === 204, res.text );
		assert.equal( ( await config( free.cookie, DAY + 13 * HOUR ) ).json.signedIn, false );

	} );

} );
