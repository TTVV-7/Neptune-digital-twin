// npm run test:build-ui: World Drive Build (/build/, src/product.js, worker/drive/build.js) in a
// real browser against World Drive's Worker under wrangler dev, serving the built page
// (npm run build:drive first; this builds it if it's missing). Requests anywhere else are blocked,
// so Google's tiles never load (their key here is a test one): what's checked is what the page is
// given and does. Signed out: no key prompt, flat ground, and why; the free plan's library open
// and the rest locked behind Build Pro (sets too), with its dialog; signed in, the Maps key; the
// owner with everything; and moving the project's site by address. Going Build Pro: monthly or
// yearly, then Stripe's checkout (a stand-in for Stripe's API on this machine makes it; the page
// Stripe would show is answered here), back on the dashboard until Build Pro shows, Manage billing,
// and the notices for a failed payment and Pro ending; and Build Pro opening soon while it isn't
// on sale. All that with BUILD_SALES 'on'. Then, on a second Worker with BUILD_SALES unset (the
// default) and Stripe set up all the same, buying hidden: the editor's dialog and the dashboard
// show the plans and their limits with no prices and no way to buy, and a comped account its Pro.
//
// Needs Playwright with Chromium. TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { after, before, test } from 'node:test';
import { CLIENT_ID, ROOT, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_BUILD_UI_PORT ) || 8785;
const SHOTS = process.env.TEST_SCREENSHOTS;
const MAPS_KEY = 'test-maps-key-not-real';
const WEBHOOK_SECRET = 'whsec_test_build_ui';
const MONTHLY = 'price_buildmonthly0001';
const ANNUAL = 'price_buildannual0001';
// Stripe's pages (checkout and the billing portal), answered here with a stand-in page.
const STRIPE_PAGES = /^https:\/\/(checkout|billing)\.stripe\.com\//;
const DIST = join( ROOT, 'dist-drive', 'build' );
// What no page may say while buying is hidden.
const BUYING_WORDS = /US\$|\/month|\/year|Subscribe|Go Build Pro|opens soon/i;

let server;
let hiddenServer;
let keys;
let googleKey;
let upstream;
let stripe;
let browser;
let page;
const errors = [];

// The built page's files the test needs: the page, its code, the library's list and pictures, and
// the few models placed.
function assetsOf() {

	const files = {};
	const add = path => {

		files[ join( 'build', relative( DIST, path ) ) ] = readFileSync( path );

	};

	const walk = dir => {

		for ( const name of readdirSync( dir ) ) {

			const path = join( dir, name );
			if ( statSync( path ).isDirectory() ) walk( path );
			else add( path );

		}

	};

	// The dashboard (/build/) and the editor (/build/app/).
	add( join( DIST, 'index.html' ) );
	walk( join( DIST, 'home' ) );
	add( join( DIST, 'app', 'index.html' ) );
	add( join( DIST, 'app', 'google-maps-logo.svg' ) );
	walk( join( DIST, 'app', 'assets' ) );
	walk( join( DIST, 'app', 'library', 'thumbs' ) );
	add( join( DIST, 'app', 'library', 'library.json' ) );
	for ( const model of [ 'traffic-cone.glb', 'pickup-truck.glb' ] ) add( join( DIST, 'app', 'library', model ) );
	return files;

}

before( async () => {

	if ( ! existsSync( join( DIST, 'app', 'index.html' ) ) ) {

		const built = spawnSync( process.execPath, [ join( ROOT, 'node_modules', 'vite', 'bin', 'vite.js' ), 'build', '--config', 'vite.drive.config.js', '--logLevel', 'error' ], { cwd: ROOT, encoding: 'utf8' } );
		assert.equal( built.status, 0, built.stderr );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	// Place search's upstream (Nominatim's stand-in): one place for any query.
	upstream = createServer( ( req, res ) => {

		res.setHeader( 'Content-Type', 'application/json' );
		res.end( JSON.stringify( [ { lat: '43.6426', lon: '-79.3871', display_name: 'CN Tower, Front Street West, Toronto, Ontario, Canada', type: 'attraction' } ] ) );

	} );
	await new Promise( resolve => upstream.listen( 0, '127.0.0.1', resolve ) );
	stripe = await serveStripe();
	googleKey = await makeKey( 'build-ui-key-1' );
	keys = await serveKeys( [ googleKey.jwk ] );
	server = await startWorker( {
		port: PORT,
		config: 'wrangler.drive.jsonc',
		vars: {
			BUILD_SALES: 'on',
			GOOGLE_MAPS_API_KEY: MAPS_KEY,
			GOOGLE_CLIENT_ID: CLIENT_ID,
			GOOGLE_JWKS_URL: keys.url,
			STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
			STRIPE_SECRET_KEY: [ 'rk', 'test', 'builduse0000000000000001' ].join( '_' ),
			STRIPE_API_BASE: stripe.url,
			BUILD_PRICE_MONTHLY: MONTHLY,
			BUILD_PRICE_ANNUAL: ANNUAL,
			ADMIN_EMAILS: 'boss@example.com',
			SEARCH_UPSTREAM: `http://127.0.0.1:${ upstream.address().port }/search`,
		},
		assets: assetsOf(),
	} );

	const { chromium } = require( 'playwright' );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	page = await browser.newPage( { viewport: { width: 1280, height: 800 } } );
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	await page.route( '**/*', route => {

		const url = route.request().url();
		if ( url.startsWith( server.base ) ) return route.continue();
		if ( STRIPE_PAGES.test( url ) ) return route.fulfill( { contentType: 'text/html', body: '<!doctype html><title>Stripe</title><p>Stripe\'s page' } );
		return route.abort();

	} );

} );

after( async () => {

	await browser?.close();
	server?.stop();
	hiddenServer?.stop();
	keys?.close();
	upstream?.close();
	stripe?.close();

} );

// A stand-in for Stripe's API (STRIPE_API_BASE): customers, Checkout Sessions and billing portal
// sessions, answered as Stripe does (only the fields read), each request kept: { method, path, form }.
async function serveStripe() {

	const requests = [];
	let made = 0;
	const stub = createServer( async ( req, res ) => {

		let body = '';
		for await ( const chunk of req ) body += chunk;
		const form = Object.fromEntries( new URLSearchParams( body ) );
		requests.push( { method: req.method, path: req.url, form } );
		let status = 200;
		let answer;
		if ( req.method === 'POST' && req.url === '/v1/customers' ) answer = { id: `cus_ui${ ++ made }`, object: 'customer' };
		else if ( req.method === 'POST' && req.url === '/v1/checkout/sessions' ) answer = { id: `cs_test_ui${ ++ made }`, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/cs_test_ui${ made }` };
		else if ( req.method === 'POST' && req.url === '/v1/billing_portal/sessions' ) answer = { id: 'bps_ui', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/test_ui' };
		else if ( req.method === 'GET' && ( req.url.startsWith( '/v1/subscriptions?' ) || req.url.startsWith( '/v1/checkout/sessions?' ) ) ) answer = { object: 'list', data: [] };
		else {

			status = 404;
			answer = { error: { type: 'invalid_request_error', message: 'Unrecognized request URL' } };

		}

		res.writeHead( status, { 'Content-Type': 'application/json' } );
		res.end( JSON.stringify( answer ) );

	} );
	await new Promise( resolve => stub.listen( 0, '127.0.0.1', resolve ) );
	return { url: `http://127.0.0.1:${ stub.address().port }`, requests, close: () => stub.close() };

}

// Stripe's webhook, signed as Stripe signs it.
async function webhook( event ) {

	const body = JSON.stringify( event );
	const res = await fetch( `${ server.base }/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': stripeSignature( body, WEBHOOK_SECRET ) }, body } );
	assert.equal( res.status, 200, await res.text() );

}

let events = 0;
const now = () => Math.floor( Date.now() / 1000 );

// The checkout's completed Checkout Session, as Stripe sends it for one billing.js made.
function checkoutDone( made ) {

	return { id: `evt_ui_checkout_${ ++ events }`, object: 'event', type: 'checkout.session.completed', livemode: false, created: now(), data: { object: {
		id: `cs_test_done${ events }`, object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 5000, currency: 'usd',
		client_reference_id: made.client_reference_id, metadata: { account_id: made.client_reference_id, pass: 'build' }, customer: made.customer,
		customer_details: { email: '' }, customer_email: null, payment_intent: null, payment_link: null, subscription: 'sub_ui_pro',
	} } };

}

// Its subscription, as customer.subscription.updated says it (yearly, renewing in 30 days).
function subscriptionNow( made, { status = 'active', cancel = false, created = now() } = {} ) {

	const end = created + 30 * 24 * 3600;
	return { id: `evt_ui_sub_${ ++ events }`, object: 'event', type: 'customer.subscription.updated', livemode: false, created, data: { object: {
		id: 'sub_ui_pro', object: 'subscription', status, customer: made.customer, metadata: { account_id: made.client_reference_id, pass: 'build' },
		cancel_at_period_end: cancel, cancel_at: null, canceled_at: null, latest_invoice: null,
		items: { data: [ { quantity: 1, current_period_start: created - 3600, current_period_end: end, price: { id: ANNUAL, unit_amount: 5000, currency: 'usd', recurring: { interval: 'year' } } } ] },
	} } };

}

// The Checkout Sessions asked of Stripe since the `from`th request.
const sessionsSince = from => stripe.requests.slice( from ).filter( r => r.path === '/v1/checkout/sessions' ).map( r => r.form );

// Build Pro not on sale (no Stripe settings, say): the server's answers as they'd be then.
const PLAN_ANSWERS = /\/build\/(app\/)?api\/(home|config|me)(\?|$)/;
async function notOnSale( on ) {

	if ( ! on ) return page.unroute( PLAN_ANSWERS );
	await page.route( PLAN_ANSWERS, async route => {

		const res = await route.fetch();
		const body = await res.json();
		body.premium = { ...body.premium, billing: { ...body.premium.billing, enabled: false } };
		delete body.premium.price;
		await route.fulfill( { response: res, json: body } );

	} );

}

async function open( path = '/build/app/' ) {

	await page.goto( server.base + path );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout, null, { timeout: 60000 } );

}

async function shot( name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

// Signs this browser in as `claims`' Google account, as Google's button would (its token, posted).
async function signInAs( claims ) {

	const credential = await makeToken( googleKey, claims );
	const res = await page.evaluate( async credential => {

		const r = await fetch( '/build/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { credential } ) } );
		return { status: r.status, body: await r.json() };

	}, credential );
	assert.equal( res.status, 200, JSON.stringify( res.body ) );
	return res.body;

}

async function library( open ) {

	await page.evaluate( open => {

		if ( window.twin.sidebar.isOpen() !== open ) document.getElementById( 'library-toggle' ).click();

	}, open );

}

const lockedCards = () => page.evaluate( () => ( {
	locked: [ ...document.querySelectorAll( '#library .card.locked' ) ].map( c => c.dataset.item ),
	open: [ ...document.querySelectorAll( '#library .card[data-item]:not(.locked)' ) ].map( c => c.dataset.item ),
} ) );

test( 'signed out: no key prompt, flat ground and why, the example site, and the free library open', async () => {

	await open();
	const state = await page.evaluate( () => ( {
		prompt: document.getElementById( 'key-prompt' ).hidden,
		tiles: !! window.twin.tiles,
		banner: document.getElementById( 'banner' )?.textContent ?? '',
		site: document.querySelector( '.site-picker .site-name' )?.textContent,
		title: document.title,
		models: window.twin.models.entries.length,
	} ) );
	assert.equal( state.prompt, true, 'no key prompt' );
	assert.equal( state.tiles, false );
	assert.match( state.banner, /Sign in/ );
	assert.equal( state.site, 'North Vancouver waterfront (example)' );
	assert.match( state.title, /World Drive Build/ );
	assert.equal( state.models, 0, 'none of the Neptune project\'s models' );

	await library( true );
	const cards = await lockedCards();
	for ( const id of [ 'traffic-cone', 'jersey-barrier', 'pickup-truck', 'office-trailer-10x40', 'excavator-20t' ] ) assert.ok( cards.open.includes( id ), `${ id } is free` );
	for ( const id of [ 'crane-all-terrain', 'tri-tri', 'drill-rig-cfa', 'concrete-boom-pump-38m' ] ) assert.ok( cards.locked.includes( id ), `${ id } is Pro` );
	await shot( 'build-signed-out' );

} );

test( 'a locked item or set opens Build Pro\'s dialog; signed out it asks to sign in first', async () => {

	await page.click( '#library .card[data-item="crane-all-terrain"]' );
	await page.waitForSelector( '.premium-dialog[open]' );
	const dialog = await page.evaluate( () => {

		const d = document.querySelector( '.premium-dialog' );
		return { title: d.querySelector( 'h2' ).textContent, lead: d.querySelector( 'p' ).textContent, price: d.querySelector( '.price' ).textContent, signIn: ! d.querySelector( '.sign-in' ).hidden };

	} );
	assert.equal( dialog.title, 'Build Pro' );
	assert.match( dialog.lead, /is part of Build Pro/ );
	assert.equal( dialog.price, 'US$5/month' );
	assert.equal( dialog.signIn, true );
	assert.doesNotMatch( dialog.lead, /unlimited|per seat/ );
	assert.match( dialog.lead, /300 3D map views a month, 200 projects/ );
	await shot( 'build-pro-dialog' );
	await page.keyboard.press( 'Escape' );
	// A set with Pro pieces is locked too.
	await page.click( '#library .card[data-set="set-concrete-pour"]' );
	await page.waitForSelector( '.premium-dialog[open]' );
	await page.keyboard.press( 'Escape' );

} );

test( 'signed in on the free plan: the Maps key from the server, and a free item placed', async () => {

	const signed = await signInAs( { sub: 'ui-free', email: 'free@example.com', name: 'Fran Free' } );
	assert.equal( signed.plan.tier, 'free' );
	assert.equal( signed.hasMapsKey, true );
	await open();
	assert.equal( await page.evaluate( () => !! window.twin.tiles ), true, 'Google\'s tiles made with the key' );
	await library( true );
	assert.ok( ( await lockedCards() ).locked.includes( 'crane-all-terrain' ) );
	await page.click( '#library .card[data-item="traffic-cone"]' );
	const canvas = await page.$( 'canvas' );
	const box = await canvas.boundingBox();
	await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.placing ), null, { timeout: 30000 } );
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.library === 'traffic-cone' && ! e.placing ) );
	// Locked for a free account: the dialog offers monthly or yearly, each saying it renews, and
	// Stripe's checkout made for this account.
	await page.click( '#library .card[data-item="tri-tri"]' );
	await page.waitForSelector( '.premium-dialog[open]' );
	const offer = () => page.evaluate( () => {

		const d = document.querySelector( '.premium-dialog' );
		return {
			choices: [ ...d.querySelectorAll( '.intervals label' ) ].map( l => l.textContent ),
			picked: d.querySelector( '.intervals input:checked' ).value,
			renews: d.querySelector( '.renews' ).textContent,
			button: d.querySelector( 'button.buy' ).textContent,
			text: d.textContent,
		};

	} );
	const yearly = await offer();
	assert.deepEqual( yearly.choices, [ 'Yearly: US$50/year - 2 months free', 'Monthly: US$5/month' ] );
	assert.equal( yearly.picked, 'year' );
	assert.equal( yearly.renews, 'Renews automatically every year until you cancel. Cancel any time in your account.' );
	assert.equal( yearly.button, 'Subscribe with Stripe' );
	assert.doesNotMatch( yearly.text, /per seat|unlimited/ );
	await page.click( '.premium-dialog .intervals input[value="month"]' );
	assert.equal( ( await offer() ).renews, 'Renews automatically every month until you cancel. Cancel any time in your account.' );
	await shot( 'build-pro-dialog-signed-in' );
	const from = stripe.requests.length;
	await Promise.all( [ page.waitForURL( STRIPE_PAGES ), page.click( '.premium-dialog button.buy' ) ] );
	assert.match( page.url(), /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_ui\d+$/ );
	const [ made ] = sessionsSince( from );
	assert.equal( made[ 'line_items[0][price]' ], MONTHLY );
	assert.equal( made[ 'line_items[0][quantity]' ], '1' );
	assert.match( made.client_reference_id, /^[1-9]\d*$/ );

} );

test( 'the editor while Build Pro isn\'t on sale: it opens soon', async () => {

	await notOnSale( true );
	await open();
	await library( true );
	await page.click( '#library .card[data-item="tri-tri"]' );
	await page.waitForSelector( '.premium-dialog[open]' );
	const dialog = await page.evaluate( () => {

		const d = document.querySelector( '.premium-dialog' );
		return { buying: ! d.querySelector( '.buying' ).hidden, message: d.querySelector( '.message' ).textContent, price: d.querySelector( '.price' ).hidden };

	} );
	assert.equal( dialog.buying, false );
	assert.equal( dialog.price, true );
	assert.match( dialog.message, /Build Pro opens soon/ );
	await page.keyboard.press( 'Escape' );
	await notOnSale( false );

} );

test( 'the owner: everything open', async () => {

	await page.context().clearCookies();
	const signed = await signInAs( { sub: 'ui-boss', email: 'boss@example.com', name: 'Big Boss' } );
	assert.equal( signed.plan.tier, 'owner' );
	await open();
	await library( true );
	assert.deepEqual( ( await lockedCards() ).locked, [] );
	await shot( 'build-owner' );

} );

test( 'moving the project\'s site by address', async () => {

	await library( false );
	await page.click( '.site-picker .site-current' );
	await page.fill( '#site-query', 'CN Tower' );
	await page.click( '.site-picker form > button' );
	await page.waitForSelector( '.site-picker .site-results button' );
	await Promise.all( [ page.waitForNavigation(), page.click( '.site-picker .site-results button' ) ] );
	assert.match( page.url(), /\/build\/app\/\?/ );
	assert.match( page.url(), /at=43\.642600%2C-79\.387100/ );
	await page.waitForFunction( () => window.twin?.SITE );
	const site = await page.evaluate( () => window.twin.SITE );
	assert.equal( site.lat, 43.6426 );
	assert.equal( site.name, 'CN Tower, Front Street West' );
	assert.equal( await page.evaluate( () => document.querySelector( '.site-picker .site-name' ).textContent ), 'CN Tower, Front Street West' );

} );

// --- the dashboard (/build/) ---------------------------------------------------------------

async function dashboard() {

	await page.goto( `${ server.base }/build/` );
	await page.waitForSelector( 'body[data-loaded]', { timeout: 30000 } );

}

test( 'the dashboard signed out: find a site, the two plans, and sign in to keep projects', async () => {

	await page.context().clearCookies();
	await dashboard();
	const state = await page.evaluate( () => ( {
		title: document.querySelector( 'h1' ).textContent,
		empty: document.getElementById( 'projects-empty' ).textContent,
		plans: [ ...document.querySelectorAll( '.compare-card .tier' ) ].map( t => t.textContent ),
		prices: [ ...document.querySelectorAll( '.compare-card .price' ) ].map( t => t.textContent ),
		example: document.getElementById( 'example' ).getAttribute( 'href' ),
	} ) );
	assert.equal( state.title, 'Where\'s the site?' );
	assert.match( state.empty, /Sign in/ );
	assert.deepEqual( state.plans, [ 'Free', 'Build Pro' ] );
	assert.deepEqual( state.prices, [ 'Free', 'US$5/month' ] );
	assert.match( state.example, /^\/build\/app\/\?at=49\.3054/ );
	await shot( 'dashboard-signed-out' );

	// Going Build Pro signed out: sign in first.
	assert.equal( await page.textContent( '.upgrade .renews' ), 'Renews automatically every year until you cancel. Cancel any time in your account.' );
	await page.click( '.upgrade .go-pro' );
	await page.locator( '.upgrade-note', { hasText: 'Sign in first' } ).waitFor();
	assert.doesNotMatch( await page.textContent( '#plan-body' ), /unlimited|per seat/ );

	// An address: its places, each opening the editor there.
	await page.fill( '#find-query', 'CN Tower' );
	await page.click( '#find-go' );
	await page.waitForSelector( '#results a' );
	const href = await page.getAttribute( '#results a', 'href' );
	assert.match( href, /\/build\/app\/\?at=43\.642600%2C-79\.387100&place=CN\+Tower%2C\+Front\+Street\+West$/ );
	await shot( 'dashboard-search' );
	await Promise.all( [ page.waitForNavigation(), page.click( '#results a' ) ] );
	await page.waitForFunction( () => window.twin?.SITE );
	assert.equal( await page.evaluate( () => window.twin.SITE.name ), 'CN Tower, Front Street West' );

} );

test( 'the dashboard signed in: the plan with its views, and projects that open in the editor', async () => {

	await page.goto( `${ server.base }/build/` );
	const signed = await signInAs( { sub: 'ui-dash', email: 'dash@example.com', name: 'Dana Dash' } );
	assert.equal( signed.plan.tier, 'free' );
	// A project saved at Toronto (as the editor saves one: the layout with its site's lat and lon).
	const saved = await page.evaluate( async () => {

		const data = { version: 2, site: 'CN Tower, Front Street West', lat: 43.6426, lon: - 79.3871, items: [ { name: 'Traffic cone', library: 'traffic-cone', url: 'library/traffic-cone.glb', east: 2, north: 3, heading: 0, up: null } ], extras: {} };
		const res = await fetch( '/build/app/api/layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { site: data.site, name: 'Tower crane pad', data } ) } );
		return { status: res.status, body: await res.json() };

	} );
	assert.equal( saved.status, 201, JSON.stringify( saved.body ) );
	assert.equal( saved.body.lat, 43.6426 );
	await dashboard();
	const state = await page.evaluate( () => ( {
		who: document.getElementById( 'who-name' ).textContent,
		pill: document.getElementById( 'plan-pill' ).textContent,
		tier: document.querySelector( '.plan-head .tier' ).textContent,
		views: document.querySelector( '.meter-value' ).textContent,
		soon: document.querySelector( '.upgrade' )?.textContent ?? '',
		projects: [ ...document.querySelectorAll( '.project' ) ].map( p => ( { name: p.querySelector( 'strong' ).textContent, href: p.getAttribute( 'href' ) } ) ),
		count: document.getElementById( 'project-count' ).textContent,
	} ) );
	assert.equal( state.who, 'Dana Dash' );
	assert.equal( state.pill, 'Free' );
	assert.equal( state.tier, 'Free' );
	assert.equal( state.views, '0 / 15' );
	assert.match( state.soon, /Go Build Pro/ );
	assert.match( state.soon, /Yearly: US\$50\/year - 2 months free/ );
	assert.match( state.soon, /Renews automatically every year until you cancel\. Cancel any time in your account\./ );
	assert.doesNotMatch( state.soon, /unlimited|per seat/ );
	assert.equal( state.count, '1 of 1' );
	assert.equal( state.projects.length, 1 );
	assert.equal( state.projects[ 0 ].name, 'Tower crane pad' );
	assert.match( state.projects[ 0 ].href, new RegExp( `project=${ saved.body.id }` ) );
	await shot( 'dashboard-signed-in' );

	// Opening it: the editor at Toronto, with the project's cone.
	await Promise.all( [ page.waitForNavigation(), page.click( '.project' ) ] );
	await page.waitForFunction( () => window.twin?.models?.entries.some( e => e.library === 'traffic-cone' ), null, { timeout: 30000 } );
	assert.equal( await page.evaluate( () => window.twin.SITE.lat ), 43.6426 );
	assert.equal( await page.evaluate( () => document.querySelector( '.site-picker .site-home' ).getAttribute( 'href' ) ), '/build/' );
	await page.goto( `${ server.base }/build/` );
	await page.waitForSelector( 'body[data-loaded]' );
	assert.equal( await page.evaluate( () => document.querySelector( '.meter-value' ).textContent ), '1 / 15', 'opening the editor took a view' );

} );

test( 'opening a project: not mixed with this browser\'s layout, the newer version when changed elsewhere, and a rename isn\'t a conflict', async () => {

	// Dana's project from the test above, opened as the dashboard opens it.
	const site = 'CN Tower, Front Street West';
	const { id } = await page.evaluate( async () => ( await ( await fetch( '/build/api/layouts' ) ).json() ).layouts[ 0 ] );
	const url = `${ server.base }/build/app/?${ new URLSearchParams( { at: '43.642600,-79.387100', place: site, project: id } ) }`;
	const kinds = () => page.evaluate( () => window.twin.models.entries.filter( e => e.library && ! e.inConfig ).map( e => e.library ).sort() );
	const items = () => page.evaluate( async id => ( await ( await fetch( `/build/api/layouts/${ id }` ) ).json() ).data.items.length, id );
	const truck = { version: 2, site, lat: 43.6426, lon: - 79.3871, items: [ { name: 'Pickup truck', library: 'pickup-truck', url: 'library/pickup-truck.glb', east: 9, north: 9, heading: 0, up: null } ], extras: {} };

	// A different layout left in this browser at the same site, and no project linked: only the
	// project's cone is shown, and the truck isn't saved into it.
	await page.evaluate( ( { site, truck } ) => {

		localStorage.setItem( `neptune-twin.layout.${ site }`, JSON.stringify( truck ) );
		localStorage.removeItem( `neptune-twin.cloud.${ site }` );

	}, { site, truck } );
	await page.goto( url );
	await page.locator( '#project-status[data-state="saved"]', { hasText: 'Tower crane pad · Saved' } ).waitFor( { timeout: 30000 } );
	await page.waitForTimeout( 3500 );
	assert.deepEqual( await kinds(), [ 'traffic-cone' ] );
	assert.equal( await items(), 1, 'nothing from this browser\'s layout saved into the project' );

	// Changed somewhere else (Claude, another computer), then opened again: that version, not this browser's copy.
	await page.evaluate( async id => {

		const r = await fetch( `/build/api/layouts/${ id }` );
		const { data } = await r.json();
		data.items.push( { ...data.items[ 0 ], east: 6 } );
		await fetch( `/build/api/layouts/${ id }`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { data } ) } );

	}, id );
	await page.goto( url );
	await page.waitForFunction( () => window.twin?.models?.entries.filter( e => e.library === 'traffic-cone' ).length === 2, null, { timeout: 30000 } );
	await page.locator( '#project-status[data-state="saved"]', { hasText: 'Tower crane pad · Saved' } ).waitFor( { timeout: 30000 } );

	// Renamed on the dashboard (another tab), just after opening it and again after an edit saved
	// here: each next edit still saves, under the new name.
	const removeCone = () => page.evaluate( () => window.twin.models.remove( window.twin.models.entries.find( e => e.library === 'traffic-cone' ) ) );
	const rename = name => page.evaluate( async ( { id, name } ) => {

		await fetch( `/build/api/layouts/${ id }`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { name } ) } );

	}, { id, name } );
	const savedAs = async ( name, count ) => {

		for ( let i = 0; i < 60 && ( await page.textContent( '#project-status' ) !== `${ name } · Saved` || await items() !== count ); i ++ ) await page.waitForTimeout( 500 );
		assert.equal( await page.textContent( '#project-status' ), `${ name } · Saved` );
		assert.equal( await items(), count );

	};

	await rename( 'Crane pad' );
	await removeCone();
	await savedAs( 'Crane pad', 1 );
	await rename( 'North crane pad' );
	await removeCone();
	await savedAs( 'North crane pad', 0 );

} );

test( 'starting a project from the dashboard, moving it, and renaming and deleting it', async () => {

	await page.goto( `${ server.base }/build/` );
	await signInAs( { sub: 'ui-start', email: 'start@example.com', name: 'Sam Start' } );
	await dashboard();
	assert.match( await page.textContent( '#projects-empty' ), /Start a project here/ );
	await page.fill( '#find-query', 'CN Tower' );
	await page.click( '#find-go' );
	await page.waitForSelector( '.start-here input' );
	assert.equal( await page.inputValue( '.start-here input' ), 'CN Tower, Front Street West' );
	await page.fill( '.start-here input', 'Tower crane base' );
	await shot( 'dashboard-start-here' );
	await Promise.all( [ page.waitForNavigation(), page.click( '.start-here button' ) ] );
	assert.match( page.url(), /project=[\w-]{16}/ );
	const id = new URL( page.url() ).searchParams.get( 'project' );
	// Saved, said in the site bar at the top, which is always in view.
	await page.locator( '#project-status[data-state="saved"]', { hasText: 'Tower crane base · Saved' } ).waitFor( { timeout: 30000 } );
	assert.equal( await page.evaluate( () => [ ...document.querySelectorAll( 'button' ) ].some( b => b.textContent === 'Projects' ) ), true, 'the editor calls them projects' );
	await shot( 'editor-project-saved' );

	// Moved by the site picker (which opens it at the new place, the project in the address): saved there.
	await page.goto( `${ server.base }/build/app/?at=43.650000,-79.380000&place=Somewhere+Else&project=${ id }` );
	await page.locator( '#project-status', { hasText: 'Tower crane base · Saved' } ).waitFor( { timeout: 30000 } );
	await page.waitForFunction( async id => {

		const r = await fetch( `/build/api/layouts/${ id }` );
		const body = await r.json();
		return body.site === 'Somewhere Else' && body.lat === 43.65;

	}, id, { timeout: 15000 } );

	// The free plan's one project: a second is refused with what to do.
	await dashboard();
	await page.fill( '#find-query', 'CN Tower' );
	await page.click( '#find-go' );
	await page.waitForSelector( '.start-here button' );
	await page.click( '.start-here button' );
	await page.locator( '.start-note', { hasText: 'free plan saves one project' } ).waitFor();
	// On sale: and the way up.
	assert.match( await page.textContent( '.start-note' ), /Open or delete your project below, or go Build Pro\.$/ );

	// Rename and delete, from the list.
	page.once( 'dialog', d => d.accept( 'Crane base, north side' ) );
	await page.click( '.project-actions button:has-text("Rename")' );
	await page.locator( '.project strong', { hasText: 'Crane base, north side' } ).waitFor();
	page.once( 'dialog', d => d.accept() );
	await page.click( '.project-actions button:has-text("Delete")' );
	await page.locator( '.project' ).waitFor( { state: 'detached' } );

} );

test( 'going Build Pro from the dashboard: Stripe\'s checkout, back until it shows, Manage billing, and the notices', async () => {

	await page.goto( `${ server.base }/build/` );
	await page.context().clearCookies();
	await signInAs( { sub: 'ui-buyer', email: 'buyer@example.com', name: 'Bea Buyer' } );
	await dashboard();
	assert.equal( await page.isVisible( '.manage' ), false );
	const from = stripe.requests.length;
	await Promise.all( [ page.waitForURL( STRIPE_PAGES ), page.click( '.upgrade .go-pro' ) ] );
	const [ made ] = sessionsSince( from );
	assert.equal( made[ 'line_items[0][price]' ], ANNUAL, 'yearly, as picked to begin with' );
	assert.equal( made.mode, 'subscription' );
	assert.match( made.customer, /^cus_ui\d+$/ );

	// Cancelled at Stripe: back with nothing charged.
	await page.goto( `${ server.base }/build/?checkout=cancelled` );
	await page.locator( '.notice', { hasText: 'Checkout cancelled. Nothing was charged.' } ).waitFor();
	assert.equal( new URL( page.url() ).search, '' );

	// Paid: back on ?checkout=done, it asks until Stripe's webhook has said so.
	await page.goto( `${ server.base }/build/?checkout=done` );
	await page.locator( '.notice', { hasText: 'Waiting for Stripe' } ).waitFor();
	await webhook( checkoutDone( made ) );
	await webhook( subscriptionNow( made ) );
	await page.locator( '.notice-good', { hasText: 'Build Pro is on' } ).waitFor( { timeout: 15000 } );
	const pro = await page.evaluate( () => ( {
		tier: document.querySelector( '.plan-head .tier' ).textContent,
		billed: document.querySelector( '.billed' ).textContent,
		manage: document.querySelector( '.manage button' )?.textContent,
		details: document.querySelector( '.manage a' )?.getAttribute( 'href' ),
		upgrade: !! document.querySelector( '.upgrade' ),
	} ) );
	assert.equal( pro.tier, 'Build Pro' );
	assert.match( pro.billed, /^US\$50\/year · renews on \d{1,2} \w{3} \d{4}$/ );
	assert.equal( pro.manage, 'Manage billing' );
	assert.equal( pro.details, '/build/account/#billing' );
	assert.equal( pro.upgrade, false );
	await shot( 'dashboard-pro' );

	// Manage billing: Stripe's billing portal for this account's customer.
	const before = stripe.requests.length;
	await Promise.all( [ page.waitForURL( /^https:\/\/billing\.stripe\.com\// ), page.click( '.manage button' ) ] );
	const portal = stripe.requests.slice( before ).find( r => r.path === '/v1/billing_portal/sessions' );
	assert.equal( portal.form.customer, made.customer );

	// Cancelled in the portal: Pro ends at the period's end, and the dashboard says when.
	await webhook( subscriptionNow( made, { cancel: true, created: now() + 1 } ) );
	await dashboard();
	await page.locator( '.notice', { hasText: /^Pro ends on \d{1,2} \w{3} \d{4}\./ } ).waitFor();
	assert.match( await page.textContent( '.billed' ), /ends on/ );

	// A renewal's card failed: Pro stays on while Stripe retries, and the dashboard asks for a new card.
	await webhook( subscriptionNow( made, { status: 'past_due', created: now() + 2 } ) );
	await dashboard();
	await page.locator( '.notice-warn', { hasText: 'Payment failed - update your card' } ).waitFor();
	assert.equal( await page.textContent( '.notice-warn button' ), 'Update card' );
	assert.equal( await page.textContent( '.plan-head .tier' ), 'Build Pro' );
	await shot( 'dashboard-past-due' );

} );

test( 'the dashboard while Build Pro isn\'t on sale: it opens soon', async () => {

	await page.context().clearCookies();
	await notOnSale( true );
	await dashboard();
	assert.deepEqual( await page.evaluate( () => [ ...document.querySelectorAll( '.compare-card .price' ) ].map( t => t.textContent ) ), [ 'Free', 'Opens soon' ] );
	assert.equal( await page.isVisible( '.upgrade' ), false );
	await signInAs( { sub: 'ui-soon', email: 'soon@example.com', name: 'Sue Soon' } );
	await dashboard();
	const upgrade = await page.textContent( '.upgrade' );
	assert.match( upgrade, /^Build Pro opens soon\./ );
	assert.equal( await page.isVisible( '.upgrade .go-pro' ), false );
	await notOnSale( false );

} );

// --- buying hidden (BUILD_SALES unset) ------------------------------------------------------

test( 'buying hidden: a Worker with BUILD_SALES unset, Stripe set up all the same', async () => {

	hiddenServer = await startWorker( {
		port: Number( process.env.TEST_BUILD_UI_HIDDEN_PORT ) || PORT + 1,
		config: 'wrangler.drive.jsonc',
		vars: {
			GOOGLE_MAPS_API_KEY: MAPS_KEY,
			GOOGLE_CLIENT_ID: CLIENT_ID,
			GOOGLE_JWKS_URL: keys.url,
			STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
			STRIPE_SECRET_KEY: [ 'rk', 'test', 'builduse0000000000000002' ].join( '_' ),
			STRIPE_API_BASE: stripe.url,
			BUILD_PRICE_MONTHLY: MONTHLY,
			BUILD_PRICE_ANNUAL: ANNUAL,
			ADMIN_EMAILS: 'boss@example.com',
			SEARCH_UPSTREAM: `http://127.0.0.1:${ upstream.address().port }/search`,
		},
		assets: assetsOf(),
	} );
	// The rest of the tests on it, in a fresh browser page of their own.
	server = { ...server, base: hiddenServer.base };
	page = await browser.newPage( { viewport: { width: 1280, height: 800 } } );
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	await page.route( '**/*', route => route.request().url().startsWith( hiddenServer.base ) ? route.continue() : route.abort() );

} );

// The open Build Pro dialog as shown: its visible text, and whether its parts show.
const hiddenDialog = () => page.evaluate( () => {

	const d = document.querySelector( '.premium-dialog' );
	const shown = sel => { const e = d.querySelector( sel ); return !! e && ! e.hidden && e.getClientRects().length > 0; };
	return { text: d.innerText, lead: d.querySelector( 'p' ).textContent, buying: shown( '.buying' ), signIn: shown( '.sign-in' ), price: shown( '.price' ), ok: shown( '.ok-row button' ), intervals: !! d.querySelector( '.intervals' ) };

} );

async function checkHiddenDialog( card ) {

	await page.click( card );
	await page.waitForSelector( '.premium-dialog[open]' );
	const dialog = await hiddenDialog();
	assert.match( dialog.text, /Build Pro/ );
	assert.match( dialog.text, /isn't available to buy right now/ );
	assert.match( dialog.text, /300 3D map views a month, 200 projects/ );
	assert.doesNotMatch( dialog.text, BUYING_WORDS );
	assert.deepEqual( [ dialog.buying, dialog.signIn, dialog.price, dialog.ok, dialog.intervals ], [ false, false, false, true, false ] );
	assert.equal( await page.evaluate( () => document.activeElement?.textContent ), 'OK' );
	await page.click( '.premium-dialog .ok-row button' );
	await page.waitForSelector( '.premium-dialog[open]', { state: 'detached' } ).catch( () => {} );
	assert.equal( await page.evaluate( () => document.querySelector( '.premium-dialog' ).open ), false, 'OK closes it' );
	return dialog;

}

test( 'buying hidden, the editor: a Pro item or set says it\'s part of Build Pro, with just OK', async () => {

	await open();
	assert.equal( await page.evaluate( () => window.twin.sidebar && true ), true );
	await library( true );
	const cards = await lockedCards();
	for ( const id of [ 'crane-all-terrain', 'tri-tri' ] ) assert.ok( cards.locked.includes( id ), `${ id } is Pro, still` );
	assert.ok( cards.open.includes( 'traffic-cone' ) );
	// Signed out: no sign-in to buy, no prices.
	const signedOut = await checkHiddenDialog( '#library .card[data-item="crane-all-terrain"]' );
	assert.match( signedOut.lead, /is part of Build Pro, which isn't available to buy right now/ );
	await checkHiddenDialog( '#library .card[data-set="set-concrete-pour"]' );
	await shot( 'hidden-pro-dialog' );
	// Signed in on the free plan: the same.
	await signInAs( { sub: 'ui-hidden-free', email: 'hfree@example.com', name: 'Hal Free' } );
	await open();
	await library( true );
	assert.ok( ( await lockedCards() ).locked.includes( 'tri-tri' ) );
	await checkHiddenDialog( '#library .card[data-item="tri-tri"]' );
	assert.equal( await page.evaluate( () => window.twin.models.entries.some( e => e.library === 'tri-tri' ) ), false, 'not placed' );

} );

test( 'buying hidden, the dashboard: the plans and their limits, the views gauge, no prices or upgrade', async () => {

	await page.context().clearCookies();
	await dashboard();
	const out = await page.evaluate( () => ( {
		plans: [ ...document.querySelectorAll( '.compare-card .tier' ) ].map( t => t.textContent ),
		blurbs: [ ...document.querySelectorAll( '.compare-card p' ) ].map( t => t.textContent ),
		text: document.body.innerText,
		buy: !! document.querySelector( '.go-pro, .upgrade .intervals' ),
	} ) );
	assert.deepEqual( out.plans, [ 'Free', 'Build Pro' ] );
	assert.match( out.blurbs[ 0 ], /33 everyday site pieces, 15 3D map views a month, 1 saved project/ );
	assert.match( out.blurbs[ 1 ], /300 3D map views a month, 200 projects/ );
	assert.doesNotMatch( out.text, BUYING_WORDS );
	assert.equal( out.buy, false );
	await shot( 'hidden-dashboard-signed-out' );

	await signInAs( { sub: 'ui-hidden-free', email: 'hfree@example.com', name: 'Hal Free' } );
	await dashboard();
	const free = await page.evaluate( () => ( {
		tier: document.querySelector( '.plan-head .tier' ).textContent,
		blurb: document.querySelector( '.plan-blurb' ).textContent,
		views: document.querySelector( '.meter-value' ).textContent,
		pro: document.querySelector( '.pro-includes' )?.textContent ?? '',
		text: document.body.innerText,
		buy: !! document.querySelector( '.go-pro, .upgrade .intervals, .manage' ),
	} ) );
	assert.equal( free.tier, 'Free' );
	assert.match( free.blurb, /33 everyday site pieces, 15 3D map views a month, 1 saved project/ );
	assert.match( free.views, /^\d+ \/ 15$/ );
	assert.match( free.pro, /^Build Pro: the whole library and sets, 300 3D map views a month/ );
	assert.doesNotMatch( free.text, BUYING_WORDS );
	assert.equal( free.buy, false );
	await shot( 'hidden-dashboard-free' );

} );

test( 'buying hidden: a second project says what to do without "go Build Pro"; stale checkout links say nothing', async () => {

	// Signed out, back from a checkout that can't happen now (a bookmark, an old Stripe link):
	// the address is tidied and nothing is said, here or in the editor.
	await page.context().clearCookies();
	const quiet = async path => {

		await page.goto( server.base + path );
		await page.waitForSelector( 'body[data-loaded]', { timeout: 30000 } );
		await page.waitForTimeout( 500 );
		const out = await page.evaluate( () => ( { search: location.search, notices: document.getElementById( 'notices' )?.innerText ?? '', hidden: document.getElementById( 'notices' )?.hidden } ) );
		assert.equal( out.search, '', path );
		assert.equal( out.notices, '', `${ path }: ${ out.notices }` );
		assert.equal( out.hidden, true, path );

	};
	for ( const path of [ '/build/?checkout=done', '/build/?checkout=cancelled', '/build/?premium=thanks' ] ) await quiet( path );
	const editorQuiet = async () => {

		await open( '/build/app/?premium=thanks' );
		await page.waitForTimeout( 500 );
		const out = await page.evaluate( () => ( { search: location.search, banner: document.getElementById( 'banner' )?.textContent ?? '' } ) );
		assert.doesNotMatch( out.search, /premium=/ );
		assert.doesNotMatch( out.banner, /subscrib|Stripe|Thanks/i );

	};
	await editorQuiet();

	// A free account (one project saved), the same; and a second project is refused saying only
	// what can be done.
	await signInAs( { sub: 'ui-hidden-second', email: 'hsecond@example.com', name: 'Sid Second' } );
	const made = await page.evaluate( async () => ( await fetch( '/build/api/layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { site: 'Yard', name: 'First', data: { version: 2, site: 'Yard', lat: 49.28, lon: -123.12, items: [], extras: {} } } ) } ) ).status );
	assert.equal( made, 201 );
	for ( const path of [ '/build/?checkout=done', '/build/?checkout=cancelled' ] ) await quiet( path );
	await editorQuiet();
	await dashboard();
	await page.fill( '#find-query', 'CN Tower' );
	await page.click( '#find-go' );
	await page.waitForSelector( '.start-here button' );
	await page.click( '.start-here button' );
	const note = page.locator( '.start-note', { hasText: 'free plan saves one project' } );
	await note.waitFor();
	const said = await note.textContent();
	assert.match( said, /Open or delete your project below\.$/ );
	assert.doesNotMatch( said, /go Build Pro/i );
	assert.doesNotMatch( said, BUYING_WORDS );
	await shot( 'hidden-dashboard-second-project' );

} );

test( 'buying hidden: a comped account still sees Build Pro, with no billing to manage', async () => {

	await page.context().clearCookies();
	await signInAs( { sub: 'ui-hidden-boss', email: 'boss@example.com', name: 'Big Boss' } );
	const given = await page.evaluate( async () => {

		const r = await fetch( '/api/admin/build/comp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { account: 'hfree@example.com', reason: 'Friend' } ) } );
		return { status: r.status, body: await r.text() };

	} );
	assert.equal( given.status, 200, given.body );
	await page.context().clearCookies();
	await signInAs( { sub: 'ui-hidden-free', email: 'hfree@example.com', name: 'Hal Free' } );
	await dashboard();
	const pro = await page.evaluate( () => ( {
		pill: document.getElementById( 'plan-pill' ).textContent,
		tier: document.querySelector( '.plan-head .tier' ).textContent,
		billed: document.querySelector( '.billed' )?.textContent ?? '',
		views: document.querySelector( '.meter-value' ).textContent,
		text: document.body.innerText,
		buy: !! document.querySelector( '.go-pro, .upgrade, .manage' ),
	} ) );
	assert.equal( pro.pill, 'Build Pro' );
	assert.equal( pro.tier, 'Build Pro' );
	assert.equal( pro.billed, 'Given to you by World Drive' );
	assert.match( pro.views, /^\d+ \/ 300$/ );
	assert.doesNotMatch( pro.text, BUYING_WORDS );
	assert.equal( pro.buy, false );
	// And the editor has the whole library.
	await open();
	await library( true );
	assert.deepEqual( ( await lockedCards() ).locked, [] );
	await shot( 'hidden-dashboard-comped' );

} );

test( 'no page errors', () => {

	// Google's tiles (blocked here) report through the banner, not as page errors.
	assert.deepEqual( errors, [] );

} );
