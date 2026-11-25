// npm run test:build-admin: the owner's numbers for World Drive Build (worker/drive/build-stats.js,
// the admin page's Build tab) in World Drive's Worker under wrangler dev, with its migrations applied
// to a fresh local database: admins only; Build's own counts as they happen (visits by page and the
// referring site's host, sign-ins and new accounts, projects made and shared, checkouts started,
// 3D map views turned away), with nothing of who; the numbers from Build's tables (views by plan
// and their Google cost, MCP calls, who's active, logos) and Build Pro's money from its
// subscriptions and invoices alone, from rows put in the database here; the game's money leaving
// Build Pro out; a customer looked up and comped; and the tab itself drawing what the Worker said
// (Playwright, on Vite's server: TEST_VITE_PORT).

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startVite, startWorker } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_BUILD_WORKER_PORT ) || 8796;
const VITE_PORT = Number( process.env.TEST_VITE_PORT ) || 5531;
const MAPS_KEY = 'test-maps-key-not-real';
const DAY = Date.UTC( 2026, 10, 10, 12 );
const HOUR = 3600 * 1000;
const TODAY = '2026-11-10';
const LAYOUT = { version: 2, site: 'Test site', lat: 49.28, lon: - 123.12, items: [ { library: 'traffic-cone', east: 1, north: 2, heading: 0 } ], extras: {} };
const ADDRESS = '198.18.9.';

let server;
let keys;
let stripe;
let googleKey;
let addresses = 0;

async function call( path, { method = 'GET', body, cookie, time = DAY, headers = {} } = {} ) {

	const sent = { 'X-Test-Time': String( time ), 'CF-Connecting-IP': `${ ADDRESS }${ ++ addresses % 250 }`, ...headers };
	if ( cookie ) sent.Cookie = cookie;
	if ( method !== 'GET' && body === undefined ) body = {};
	if ( body !== undefined ) {

		sent.Origin = server.base;
		sent[ 'Content-Type' ] = 'application/json';

	}

	const res = await fetch( server.base + path, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify( body ) } );
	const text = await res.text();
	let json = null;
	try {

		json = JSON.parse( text );

	} catch {

		// Not JSON.

	}

	return { status: res.status, text, json };

}

async function signIn( claims, time = DAY ) {

	const res = await fetch( `${ server.base }/build/api/session`, {
		method: 'POST',
		headers: { 'X-Test-Time': String( time ), 'CF-Connecting-IP': `${ ADDRESS }${ ++ addresses % 250 }`, Origin: server.base, 'Content-Type': 'application/json' },
		body: JSON.stringify( { credential: await makeToken( googleKey, claims ) } ),
	} );
	const token = /^__Host-wd_session=([\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) ?? '' )?.[ 1 ];
	assert.ok( token, `signed in: ${ res.status }` );
	return `__Host-wd_session=${ token }`;

}

// A stand-in for Stripe's API: a customer and a Checkout Session, all a checkout started needs.
async function serveStripe() {

	const stub = createServer( async ( req, res ) => {

		for await ( const chunk of req ) void chunk;
		const answer = req.url === '/v1/customers' ? { id: 'cus_testadmin1', object: 'customer' } : { id: 'cs_test_admin', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_admin' };
		res.writeHead( 200, { 'Content-Type': 'application/json' } );
		res.end( JSON.stringify( answer ) );

	} );
	await new Promise( resolve => stub.listen( 0, '127.0.0.1', resolve ) );
	return { url: `http://127.0.0.1:${ stub.address().port }`, close: () => stub.close() };

}

const accountId = email => server.d1( `SELECT id FROM accounts WHERE email = '${ email }'` )[ 0 ].id;
const counted = ( answer, metric, key ) => answer.rows.filter( r => r[ 1 ] === metric && ( key === undefined || r[ 2 ] === key ) ).reduce( ( all, r ) => all + r[ 3 ], 0 );

describe( 'World Drive Build\'s admin numbers', () => {

	let boss;
	let fran;
	let numbers;

	before( async () => {

		googleKey = await makeKey( 'build-admin-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		stripe = await serveStripe();
		server = await startWorker( {
			port: PORT,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: MAPS_KEY,
				GOOGLE_CLIENT_ID: CLIENT_ID,
				GOOGLE_JWKS_URL: keys.url,
				TEST_CLOCK: 'header',
				STRIPE_WEBHOOK_SECRET: 'whsec_test_build_admin',
				SUPPORTER_PAYMENT_LINK: 'https://buy.stripe.com/test_pass',
				SUPPORTER_PAYMENT_LINK_ID: '',
				STRIPE_SECRET_KEY: [ 'rk', 'test', 'buildadmin000000000001' ].join( '_' ),
				STRIPE_API_BASE: stripe.url,
				BUILD_PRICE_MONTHLY: 'price_buildmonthly0001',
				BUILD_PRICE_ANNUAL: 'price_buildannual0001',
				BUILD_SALES: 'on',
				BUILD_FREE_MONTHLY: '1',
				BUILD_VIEW_COST_USD: '0.01',
				ADMIN_EMAILS: 'boss@example.com',
			},
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();
		stripe?.close();

	} );

	test( 'admins only: signed out 401, anyone else 403', async () => {

		for ( const path of [ '/api/admin/build', '/api/admin/build/customer?q=boss@example.com' ] ) assert.equal( ( await call( path ) ).status, 401, path );
		fran = await signIn( { sub: 'fran-1', email: 'fran@example.com', name: 'Fran Builder' } );
		for ( const path of [ '/api/admin/build', '/api/admin/build/customer?q=fran@example.com' ] ) assert.equal( ( await call( path, { cookie: fran } ) ).status, 403, path );
		boss = await signIn( { sub: 'boss-1', email: 'boss@example.com', name: 'The Boss' } );
		assert.equal( ( await call( '/api/admin/build', { cookie: boss } ) ).status, 200 );

	} );

	test( 'Build\'s counts as they happen, and nothing of who', async () => {

		// The dashboard's first ask carries where it was opened from; its later ones don't, and aren't visits.
		await call( '/build/api/home?ref=news.example.com', { cookie: fran } );
		await call( '/build/api/home?ref=direct' );
		await call( '/build/api/home', { cookie: fran } );
		// Not a host: the visit is counted, the referrer isn't.
		await call( `/build/api/home?ref=${ encodeURIComponent( 'not a host!' ) }` );
		// The editor, its one 3D map view this month, then turned away.
		assert.ok( ( await call( '/build/api/config', { cookie: fran } ) ).json.mapsKey );
		assert.equal( ( await call( '/build/api/config', { cookie: fran } ) ).json.mapsReason, 'used-up' );
		// A project, shared by the owner (free plans can't share), and its share link viewed.
		const made = await call( '/build/api/layouts', { method: 'POST', body: { site: 'Test site', name: 'Yard', data: LAYOUT }, cookie: fran } );
		assert.equal( made.status, 201, made.text );
		const own = await call( '/build/api/layouts', { method: 'POST', body: { site: 'Depot', name: 'Depot', data: LAYOUT }, cookie: boss } );
		const shared = await call( `/build/api/layouts/${ own.json.id }/share`, { method: 'POST', cookie: boss } );
		await call( `/build/api/layouts/${ own.json.id }/share`, { method: 'POST', cookie: boss } );
		await call( `/build/api/shared/${ shared.json.shareToken }` );
		// A checkout started, monthly.
		const checkout = await call( '/build/api/billing/checkout', { method: 'POST', body: { interval: 'month' }, cookie: fran } );
		assert.equal( checkout.status, 200, checkout.text );

		numbers = ( await call( '/api/admin/build?days=7', { cookie: boss } ) ).json;
		assert.equal( numbers.from, '2026-11-04' );
		assert.equal( numbers.to, TODAY );
		assert.equal( counted( numbers, 'build_visit', 'dashboard' ), 3 );
		assert.equal( counted( numbers, 'build_visit', 'editor' ), 2 );
		assert.equal( counted( numbers, 'build_visit', 'share' ), 1 );
		assert.equal( counted( numbers, 'build_visit_hour', '12' ), 6 );
		assert.deepEqual( numbers.rows.filter( r => r[ 1 ] === 'build_ref' ).map( r => [ r[ 2 ], r[ 3 ] ] ).sort(), [ [ 'direct', 1 ], [ 'news.example.com', 1 ] ] );
		// Two sign-ins, each making its account.
		assert.equal( counted( numbers, 'build_signin' ), 2 );
		assert.equal( counted( numbers, 'build_signup', 'new' ), 2 );
		assert.equal( counted( numbers, 'accounts', 'new' ), 2 );
		assert.equal( counted( numbers, 'build_project', 'created' ), 2 );
		assert.equal( counted( numbers, 'build_project', 'shared' ), 1, 'shared once, not each time it\'s asked' );
		assert.equal( counted( numbers, 'build_checkout', 'month' ), 1 );
		assert.equal( counted( numbers, 'build_map_refused', 'used-up' ), 1 );
		assert.equal( counted( numbers, 'build_views', 'free' ), 1 );
		assert.deepEqual( numbers.cost, { perView: 0.01, views: 1, usd: 0.01 } );
		assert.deepEqual( numbers.totals, { projects: 2, shared: 1, builders: 2, logos: 0, comps: 0 } );
		// Fran had a view and saved a project; the owner's views aren't kept, but their project is.
		assert.deepEqual( numbers.active, { day: 2, week: 2, month: 2 } );
		// Counts only: no address, email, name or account anywhere in what's kept or told.
		const kept = JSON.stringify( server.d1( 'SELECT * FROM stats_daily' ) );
		for ( const who of [ ADDRESS, 'fran', 'Fran', 'boss' ] ) {

			assert.ok( ! kept.includes( who ), `${ who } kept` );
			assert.ok( ! JSON.stringify( numbers.rows ).includes( who ), `${ who } told` );

		}

		// And the game's numbers leave Build's counts out.
		const game = ( await call( '/api/admin/stats?days=7', { cookie: boss } ) ).json;
		assert.equal( game.rows.filter( r => r[ 1 ].startsWith( 'build_' ) ).length, 0 );

	} );

	test( 'Build Pro\'s money from its subscriptions and invoices, and the Supporter Pass\'s left to the game', async () => {

		const franId = accountId( 'fran@example.com' );
		const t = DAY - 2 * HOUR;
		const old = DAY - 10 * 24 * HOUR;
		server.d1( `INSERT INTO subscriptions ( id, status, event_at, updated_at, account_id, pass, interval, amount, currency, quantity, cancel_at_period_end ) VALUES
			( 'sub_m1', 'active', ${ t }, ${ t }, ${ franId }, 'build', 'month', 500, 'usd', 1, 0 ),
			( 'sub_y1', 'active', ${ t }, ${ t }, NULL, 'build', 'year', 5000, 'usd', 1, 1 ),
			( 'sub_pd', 'past_due', ${ t }, ${ t }, NULL, 'build', 'month', 500, 'usd', 1, 0 ),
			( 'sub_gone', 'canceled', ${ t }, ${ t }, NULL, 'build', 'month', 500, 'usd', 1, 0 ),
			( 'sub_gone_old', 'canceled', ${ old }, ${ old }, NULL, 'build', 'month', 500, 'usd', 1, 0 ),
			( 'sub_pass', 'active', ${ t }, ${ t }, NULL, NULL, 'month', 300, 'usd', 1, 0 ),
			( 'sub_legacy', 'active', ${ t }, ${ t }, NULL, NULL, 'month', 500, 'usd', 1, 0 )` );
		// The old Payment Link's subscription: Build Pro's by its purchase, not its metadata.
		server.d1( `INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, payment_intent, status, created_at, refunded_at, subscription, pass ) VALUES
			( 'cs_legacy', NULL, '', 500, 'usd', NULL, 'paid', ${ t }, NULL, 'sub_legacy', 'build' ),
			( 'cs_refunded', NULL, '', 500, 'usd', NULL, 'refunded', ${ t }, ${ t }, 'sub_r', 'build' ),
			( 'cs_disputed', NULL, '', 500, 'usd', NULL, 'disputed', ${ t }, ${ t }, 'sub_d', 'build' ),
			( 'cs_pass', NULL, 'someone@example.com', 1999, 'usd', 'pi_pass', 'paid', ${ t }, NULL, NULL, NULL ),
			( 'cs_build_paid', ${ franId }, '', 500, 'usd', NULL, 'paid', ${ t }, NULL, 'sub_m1', 'build' )` );
		server.d1( `INSERT INTO invoices ( id, subscription, account_id, amount_paid, currency, status, billing_reason, created_at, updated_at ) VALUES
			( 'in_new', 'sub_m1', ${ franId }, 500, 'usd', 'paid', 'subscription_create', ${ t }, ${ t } ),
			( 'in_renew', 'sub_y1', NULL, 5000, 'usd', 'paid', 'subscription_cycle', ${ t }, ${ t } ),
			( 'in_failed', 'sub_pd', NULL, 0, 'usd', 'payment_failed', 'subscription_cycle', ${ t }, ${ t } ),
			( 'in_pass', 'sub_pass', NULL, 300, 'usd', 'paid', 'subscription_cycle', ${ t }, ${ t } ),
			( 'in_before', 'sub_y1', NULL, 5000, 'usd', 'paid', 'subscription_create', ${ old }, ${ old } )` );
		server.d1( `INSERT INTO stripe_events ( id, type, received_at, result ) VALUES ( 'evt_one', 'invoice.paid', ${ t }, 'ok' ), ( 'evt_two', 'checkout.session.completed', ${ t + 1000 }, 'unmatched' )` );
		// As the webhook counts an unmatched one (supporter.js's countWebhook).
		server.d1( `INSERT INTO stats_daily ( day, metric, key, n ) VALUES ( '${ TODAY }', 'build_webhook', 'unmatched', 1 )` );
		server.d1( `INSERT INTO mcp_calls ( account_id, at ) VALUES ( ${ franId }, ${ t } ), ( ${ franId }, ${ t + 1 } ), ( ${ accountId( 'boss@example.com' ) }, ${ old } )` );

		const answer = ( await call( '/api/admin/build?days=7', { cookie: boss } ) ).json;
		// Running: three active (one set to end), split monthly 2 and yearly 1 as active counts them, one past due; MRR 500 + 5000 / 12 + 500 + the legacy 500.
		assert.deepEqual( answer.money, { active: 3, pastDue: 1, ending: 1, canceled: 2, byInterval: { month: 2, year: 1 }, mrr: { usd: 1917 } } );
		assert.equal( counted( answer, 'build_paid', 'new' ), 1 );
		assert.equal( counted( answer, 'build_paid', 'renewal' ), 1 );
		assert.equal( counted( answer, 'build_revenue', 'usd' ), 5500, 'Build Pro\'s invoices only, paid, in the period' );
		assert.deepEqual( answer.previous.rows.filter( r => r[ 0 ] === 'build_revenue' ), [ [ 'build_revenue', 'usd', 5000 ] ] );
		assert.equal( counted( answer, 'build_reversed', 'refunded' ), 1 );
		assert.equal( counted( answer, 'build_reversed', 'disputed' ), 1 );
		assert.equal( counted( answer, 'build_ended', 'canceled' ), 1, 'ended in the period' );
		assert.deepEqual( answer.mcp, { calls: 2, users: 1 } );
		assert.deepEqual( answer.events.map( e => [ e.id, e.result ] ), [ [ 'evt_two', 'unmatched' ], [ 'evt_one', 'ok' ] ] );
		assert.equal( counted( answer, 'build_webhook', 'unmatched' ), 1 );

		// The game's money is the Supporter Pass's: one pass bought, its US$19.99, none of Build Pro's.
		const game = ( await call( '/api/admin/stats?days=7', { cookie: boss } ) ).json;
		assert.deepEqual( game.rows.filter( r => r[ 1 ] === 'purchases' || r[ 1 ] === 'revenue' ).map( r => r.slice( 1 ) ), [ [ 'purchases', 'lifetime', 1 ], [ 'revenue', 'usd', 1999 ] ] );
		assert.equal( game.totals.unclaimed, 1, 'the pass bought with an email nobody has, not Build Pro\'s' );
		numbers = answer;

	} );

	test( 'a customer looked up, comped and un-comped', async () => {

		assert.equal( ( await call( '/api/admin/build/customer?q=nobody@example.com', { cookie: boss } ) ).status, 404 );
		assert.equal( ( await call( '/api/admin/build/customer?q=', { cookie: boss } ) ).status, 400 );
		const id = accountId( 'fran@example.com' );
		let found = await call( '/api/admin/build/customer?q=Fran@Example.com', { cookie: boss } );
		assert.equal( found.status, 200, found.text );
		assert.equal( found.json.account.id, id );
		assert.equal( found.json.account.email, 'fran@example.com' );
		assert.equal( found.json.account.stripeCustomer, 'cus_testadmin1', 'made by the checkout' );
		// Pro through sub_m1 (bought signed in), with its invoice.
		assert.equal( found.json.plan.tier, 'pro' );
		assert.equal( found.json.plan.interval, 'month' );
		assert.deepEqual( found.json.views, { used: 1, limit: 300 } );
		assert.deepEqual( found.json.projects.count, 1 );
		assert.equal( found.json.mcpCalls, 2 );
		assert.deepEqual( found.json.subscriptions.map( s => [ s.id, s.status ] ), [ [ 'sub_m1', 'active' ] ] );
		assert.deepEqual( found.json.invoices.map( i => [ i.id, i.amountPaid, i.reason ] ), [ [ 'in_new', 500, 'subscription_create' ] ] );
		assert.equal( found.json.comp, null );

		// Comped with the billing core's route, by id as the tab sends it.
		const until = DAY + 30 * 24 * HOUR;
		assert.equal( ( await call( '/api/admin/build/comp', { method: 'POST', cookie: boss, body: { account: String( id ), reason: 'Beta tester', until } } ) ).status, 200 );
		found = await call( `/api/admin/build/customer?q=${ id }`, { cookie: boss } );
		assert.deepEqual( found.json.comp, { reason: 'Beta tester', until, createdAt: DAY, active: true } );
		assert.equal( found.json.plan.comped, true );
		assert.equal( ( await call( '/api/admin/build', { cookie: boss } ) ).json.totals.comps, 1 );
		await call( '/api/admin/build/comp', { method: 'POST', cookie: boss, body: { account: String( id ), remove: true } } );
		assert.equal( ( await call( `/api/admin/build/customer?q=${ id }`, { cookie: boss } ) ).json.comp, null );
		// The owner: no limit on views.
		assert.equal( ( await call( '/api/admin/build/customer?q=boss@example.com', { cookie: boss } ) ).json.views.limit, null );

	} );

	test( 'the admin page\'s Build tab draws what the Worker said', async () => {

		const { chromium } = require( 'playwright' );
		const vite = await startVite( VITE_PORT, {}, 'vite.drive.config.js' );
		const browser = await chromium.launch();
		try {

			const page = await browser.newPage( { viewport: { width: 1280, height: 900 } } );
			const errors = [];
			page.on( 'pageerror', err => errors.push( err.message ) );
			const base = `http://127.0.0.1:${ VITE_PORT }`;
			await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
			await page.route( `${ base }/api/admin/stats?*`, route => route.fulfill( { contentType: 'application/json', body: JSON.stringify( { from: '2026-11-04', to: TODAY, rows: [], previous: { from: '', to: '', first: { visit: null, funnel: null }, rows: [] }, totals: {}, kept: { stats: 730, scores: 35 } } ) } ) );
			await page.route( /\/api\/admin\/(dropins|challenges|achievements|requests)/, route => route.fulfill( { status: 401, contentType: 'application/json', body: '{"error":"Sign in first"}' } ) );
			const asked = [];
			await page.route( `${ base }/api/admin/build?*`, route => {

				asked.push( new URL( route.request().url() ).searchParams.get( 'days' ) );
				route.fulfill( { contentType: 'application/json', body: JSON.stringify( numbers ) } );

			} );
			const found = ( await call( '/api/admin/build/customer?q=fran@example.com', { cookie: boss } ) ).json;
			const comps = [];
			await page.route( `${ base }/api/admin/build/customer?*`, route => route.fulfill( { contentType: 'application/json', body: JSON.stringify( found ) } ) );
			await page.route( `${ base }/api/admin/build/comp`, route => {

				comps.push( JSON.parse( route.request().postData() ) );
				route.fulfill( { contentType: 'application/json', body: '{"comp":null}' } );

			} );
			await page.goto( `${ base }/admin.html` );
			// The game's tab first: Build's isn't asked for until it's shown.
			assert.equal( await page.locator( '#build' ).isVisible(), false );
			assert.deepEqual( asked, [] );
			await page.locator( '#tabs button[data-tab="build"]' ).click();
			await page.locator( '#build-out .tiles' ).waitFor();
			assert.deepEqual( asked, [ '30' ] );
			assert.equal( await page.locator( '#out' ).isVisible(), false, 'the game\'s numbers hidden' );
			assert.match( page.url(), /#build$/ );
			const tiles = await page.locator( '#build-out .tiles' ).textContent();
			assert.match( tiles, /Dashboard visits\s*3/ );
			assert.match( tiles, /Active Pro\s*3/ );
			assert.match( tiles, /MRR\s*\$19\.17/ );
			const text = await page.locator( '#build-out' ).textContent();
			assert.match( text, /news\.example\.com/ );
			assert.match( text, /Paid for nothing we sell \(unmatched\)/ );
			assert.match( text, /evt_two/ );
			// The period changed while it's shown: asked again.
			await page.locator( '#days' ).selectOption( '7' );
			await page.waitForFunction( () => document.querySelector( '#build-out .tiles' ) );
			assert.deepEqual( asked, [ '30', '7' ] );
			// A customer, comped until a day.
			await page.locator( '#build-q' ).fill( 'fran@example.com' );
			await page.locator( '#build-find button[type="submit"]' ).click();
			await page.locator( '#build-who button[data-comp="give"]' ).waitFor();
			assert.match( await page.locator( '#build-who' ).textContent(), /Build Pro.*active.*monthly/ );
			await page.locator( '#build-comp-form input[name="reason"]' ).fill( 'Helped test' );
			await page.locator( '#build-comp-form input[name="until"]' ).fill( '2026-12-31' );
			await page.locator( '#build-who button[data-comp="give"]' ).click();
			await page.waitForFunction( () => document.getElementById( 'build-say' ).textContent === 'Comped.' );
			assert.deepEqual( comps, [ { account: String( found.account.id ), reason: 'Helped test', until: Date.parse( '2026-12-31T23:59:59.999Z' ) } ] );
			// Back to the game's tab.
			await page.locator( '#tabs button[data-tab="game"]' ).click();
			assert.equal( await page.locator( '#build' ).isVisible(), false );
			assert.equal( await page.locator( '#out' ).isVisible(), true );
			assert.deepEqual( errors, [] );

		} finally {

			await browser.close();
			vite.stop();

		}

	} );

} );
