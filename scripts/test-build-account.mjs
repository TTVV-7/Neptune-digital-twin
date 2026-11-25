// npm run test:build-account: World Drive Build's account page (/build/account/,
// src/build-account/, worker/drive/build-account.js) against World Drive's Worker under wrangler
// dev, with a stand-in for Stripe's API on this machine. First the Worker alone: what the page lists
// (connected apps, share links, payments, usage), one connected app cut off and not the others,
// everything about an account as a JSON file (and never a password's hash or a token's), and
// deleting an account: fresh proof needed, its subscription cancelled at Stripe first (nothing
// deleted if Stripe says no), then everything of it gone or anonymised, foreign keys and all. Then
// the built page in a browser: signed out, the free plan buying Build Pro (to Stripe's checkout),
// a subscriber's renewal and billing portal, cutting off an app, revoking a share link, downloading
// the data, and deleting the account with Google's button; and the dashboard's link to it. All
// that with BUILD_SALES 'on'; then, on a Worker with it unset (Stripe set up all the same), buying
// hidden: the section is just the plan, payments only for an account that has paid.
//
// Needs Playwright with Chromium, and the built site (npm run build:drive; this builds it if it's
// missing). TEST_BUILD_ACCOUNT_PORT picks the Worker's port.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, GOOGLE_STUB, ROOT, makeKey, makeToken, serveKeys, startWorker } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_BUILD_ACCOUNT_PORT ) || 8787;
const DIST = join( ROOT, 'dist-drive', 'build' );
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const WEBHOOK_SECRET = 'whsec_test_build_account';
const SECRET_KEY = [ 'rk', 'test', 'buildaccount000000000001' ].join( '_' );
const MONTHLY = 'price_accountmonthly0001';
const ANNUAL = 'price_accountannual0001';
const HOUR = 3600 * 1000;
const NOW = Date.now();
const LAYOUT = { version: 2, site: 'Test site', lat: 49.28, lon: - 123.12, items: [ { library: 'traffic-cone', east: 1, north: 2, heading: 0 } ], extras: {} };

let server;
let keys;
let googleKey;
let stripe;
let addresses = 0;

async function call( path, { method = 'GET', body, cookie, headers = {} } = {} ) {

	const sent = { 'CF-Connecting-IP': `198.18.9.${ ++ addresses % 250 }`, ...headers };
	if ( cookie ) sent.Cookie = cookie;
	if ( method !== 'GET' && body === undefined ) body = {};
	if ( body !== undefined ) {

		sent.Origin = server.base;
		sent[ 'Content-Type' ] = 'application/json';

	}

	const res = await fetch( server.base + path, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify( body ), redirect: 'manual' } );
	const text = await res.text();
	let json = null;
	try {

		json = JSON.parse( text );

	} catch {

		// Not JSON.

	}

	return { status: res.status, headers: res.headers, text, json };

}

const credential = claims => makeToken( googleKey, claims );

async function signIn( claims ) {

	const res = await call( '/build/api/session', { method: 'POST', body: { credential: await credential( claims ) } } );
	const token = /^__Host-wd_session=([\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) ?? '' )?.[ 1 ];
	assert.ok( token, res.text );
	return { ...res, cookie: `__Host-wd_session=${ token }`, id: res.json.user.id };

}

const rows = sql => server.d1( sql );
const count = sql => rows( sql )[ 0 ].n;

// A stand-in for Stripe's API (STRIPE_API_BASE): customers, Checkout Sessions, billing portal
// sessions, and cancelling a subscription (one whose id has "fail" in it is refused, as Stripe
// would with an error), each request kept: { method, path }.
async function serveStripe() {

	const requests = [];
	// The subscriptions Stripe lists for a customer, as each test sets them.
	const lists = { subscriptions: [] };
	const stub = createServer( async ( req, res ) => {

		for await ( const chunk of req ) void chunk;
		requests.push( { method: req.method, path: req.url } );
		let status = 200;
		let answer;
		if ( req.method === 'POST' && req.url === '/v1/customers' ) answer = { id: `cus_acct${ requests.length }`, object: 'customer' };
		else if ( req.method === 'POST' && req.url === '/v1/checkout/sessions' ) answer = { id: 'cs_test_acct', url: 'https://checkout.stripe.com/c/pay/cs_test_acct' };
		else if ( req.method === 'POST' && req.url === '/v1/billing_portal/sessions' ) answer = { id: 'bps_test', url: 'https://billing.stripe.com/p/session/test_acct' };
		else if ( req.method === 'DELETE' && req.url.startsWith( '/v1/subscriptions/sub_gone' ) ) [ status, answer ] = [ 404, { error: { type: 'invalid_request_error', code: 'resource_missing' } } ];
		else if ( req.method === 'DELETE' && req.url.includes( 'fail' ) ) [ status, answer ] = [ 500, { error: { type: 'api_error' } } ];
		else if ( req.method === 'DELETE' && req.url.startsWith( '/v1/subscriptions/' ) ) answer = { id: req.url.split( '/' ).pop(), status: 'canceled' };
		else if ( req.method === 'GET' && req.url.startsWith( '/v1/subscriptions?' ) ) answer = { object: 'list', data: lists.subscriptions };
		else if ( req.method === 'GET' && req.url.startsWith( '/v1/checkout/sessions?' ) ) answer = { object: 'list', data: [] };
		else [ status, answer ] = [ 404, { error: { type: 'invalid_request_error' } } ];
		res.writeHead( status, { 'Content-Type': 'application/json' } );
		res.end( JSON.stringify( answer ) );

	} );
	await new Promise( resolve => stub.listen( 0, '127.0.0.1', resolve ) );
	return { url: `http://127.0.0.1:${ stub.address().port }`, requests, lists, close: () => stub.close() };

}

// The built pages the browser needs: the account page and the dashboard.
function assetsOf() {

	const files = {};
	const walk = dir => {

		for ( const name of readdirSync( dir ) ) {

			const path = join( dir, name );
			if ( statSync( path ).isDirectory() ) walk( path );
			else files[ join( 'build', relative( DIST, path ) ) ] = readFileSync( path );

		}

	};

	files[ join( 'build', 'index.html' ) ] = readFileSync( join( DIST, 'index.html' ) );
	walk( join( DIST, 'home' ) );
	walk( join( DIST, 'account' ) );
	return files;

}

// A Build Pro subscriber as the webhook leaves one: its purchase, its subscription running (renewing
// in `days`), its Stripe customer, and an invoice paid.
function makeSubscriber( id, subscription, { days = 20, email = '' } = {} ) {

	// (Stripe's customer ids are cus_ and letters and digits only.)
	const customer = `cus_${ subscription.replace( /[^A-Za-z0-9]/g, '' ) }`;
	rows( `UPDATE accounts SET stripe_customer = '${ customer }' WHERE id = ${ id };
		INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, status, created_at, subscription, pass ) VALUES ( 'cs_${ subscription }', ${ id }, '${ email }', 500, 'usd', 'paid', ${ NOW - HOUR }, '${ subscription }', 'build' );
		INSERT INTO subscriptions ( id, status, event_at, updated_at, account_id, customer, pass, price_id, interval, amount, currency, quantity, current_period_end )
			VALUES ( '${ subscription }', 'active', ${ NOW - HOUR }, ${ NOW - HOUR }, ${ id }, '${ customer }', 'build', '${ MONTHLY }', 'month', 500, 'usd', 1, ${ NOW + days * 24 * HOUR } );
		INSERT INTO invoices ( id, subscription, account_id, amount_paid, currency, status, billing_reason, charge, payment_intent, created_at, updated_at )
			VALUES ( 'in_${ subscription }', '${ subscription }', ${ id }, 500, 'usd', 'paid', 'subscription_create', 'ch_${ subscription }', 'pi_${ subscription }', ${ NOW - HOUR }, ${ NOW - HOUR } )` );

}

// Two apps connected to the account (oauth.js's clients and tokens), one with two tokens.
function connectApps( id, prefix ) {

	rows( `INSERT OR IGNORE INTO oauth_clients ( id, name, redirect_uris, created_at ) VALUES ( '${ prefix }claude', 'Claude', '[]', 1 ), ( '${ prefix }other', 'Other app', '[]', 1 );
		INSERT INTO oauth_tokens ( token_hash, kind, client_id, account_id, created_at, expires_at ) VALUES
			( '${ prefix }-token-hash-1', 'access', '${ prefix }claude', ${ id }, ${ NOW - 2 * HOUR }, ${ NOW + HOUR } ),
			( '${ prefix }-token-hash-2', 'refresh', '${ prefix }claude', ${ id }, ${ NOW - 2 * HOUR }, ${ NOW + 700 * HOUR } ),
			( '${ prefix }-token-hash-3', 'access', '${ prefix }other', ${ id }, ${ NOW - HOUR }, ${ NOW + HOUR } );
		INSERT INTO mcp_calls ( account_id, at ) VALUES ( ${ id }, ${ NOW - HOUR } ), ( ${ id }, ${ NOW - 30 * 60000 } )` );

}

before( async () => {

	if ( ! existsSync( join( DIST, 'account', 'index.html' ) ) ) {

		const built = spawnSync( process.execPath, [ join( ROOT, 'node_modules', 'vite', 'bin', 'vite.js' ), 'build', '--config', 'vite.drive.config.js', '--logLevel', 'error' ], { cwd: ROOT, encoding: 'utf8' } );
		assert.equal( built.status, 0, built.stderr );

	}

	googleKey = await makeKey( 'build-account-key-1' );
	keys = await serveKeys( [ googleKey.jwk ] );
	stripe = await serveStripe();
	server = await startWorker( {
		port: PORT,
		config: 'wrangler.drive.jsonc',
		vars: workerVars( { BUILD_SALES: 'on' } ),
		assets: assetsOf(),
	} );

} );

// The Worker's settings, Stripe's included, with `extra` on top (BUILD_SALES).
function workerVars( extra = {} ) {

	return {
		GOOGLE_CLIENT_ID: CLIENT_ID,
		GOOGLE_JWKS_URL: keys.url,
		STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
		SUPPORTER_PAYMENT_LINK: 'https://buy.stripe.com/test_pass',
		SUPPORTER_PAYMENT_LINK_ID: '',
		DAY_PASS_PAYMENT_LINK_ID: '',
		STRIPE_SECRET_KEY: SECRET_KEY,
		STRIPE_API_BASE: stripe.url,
		BUILD_PRICE_MONTHLY: MONTHLY,
		BUILD_PRICE_ANNUAL: ANNUAL,
		ADMIN_EMAILS: 'boss@example.com',
		PASSWORD_ITERATIONS: '10000',
		// Usernames and passwords are on only with Turnstile's secret (a robot check is asked for
		// only after wrong passwords, which these tests don't make many of).
		TURNSTILE_SECRET: 'test-turnstile-secret',
		...extra,
	};

}

after( () => {

	server?.stop();
	keys?.close();
	stripe?.close();

} );

describe( 'the Worker', () => {

	test( 'signed out, every account route is a 401', async () => {

		for ( const [ method, path ] of [ [ 'GET', 'account' ], [ 'GET', 'account/export' ], [ 'DELETE', 'account' ], [ 'DELETE', 'connections/abc' ] ] ) {

			assert.equal( ( await call( `/build/api/${ path }`, { method } ) ).status, 401, `${ method } ${ path }` );

		}

	} );

	test( 'what the page lists, and one connected app cut off without the others', async () => {

		const ann = await signIn( { sub: 'ann-1', email: 'ann@example.com', name: 'Ann Account' } );
		const bob = await signIn( { sub: 'bob-1', email: 'bob@example.com', name: 'Bob Other' } );
		assert.match( ann.id, /^\d+$/, 'the page is told the account\'s id' );
		connectApps( ann.id, 'a' );
		connectApps( bob.id, 'b' );
		rows( `INSERT INTO oauth_tokens ( token_hash, kind, client_id, account_id, created_at, expires_at ) VALUES ( 'bob-on-ann-client', 'access', 'aclaude', ${ bob.id }, ${ NOW }, ${ NOW + HOUR } )` );

		const listed = await call( '/build/api/account', { cookie: ann.cookie } );
		assert.equal( listed.status, 200, listed.text );
		assert.equal( listed.json.account.name, 'Ann Account' );
		assert.equal( listed.json.account.google, true );
		assert.equal( listed.json.account.username, null );
		assert.ok( listed.json.account.createdAt > 0 );
		assert.deepEqual( listed.json.connections.map( c => [ c.client, c.name ] ), [ [ 'aclaude', 'Claude' ], [ 'aother', 'Other app' ] ] );
		assert.equal( listed.json.lastCall, NOW - 30 * 60000 );
		assert.deepEqual( listed.json.usage, { projects: 0, projectLimit: 1, mcpCalls: 2 } );
		assert.deepEqual( listed.json.shares, [] );
		assert.deepEqual( listed.json.payments, [] );

		const cut = await call( '/build/api/connections/aclaude', { method: 'DELETE', cookie: ann.cookie } );
		assert.equal( cut.status, 204, cut.text );
		assert.deepEqual( ( await call( '/build/api/account', { cookie: ann.cookie } ) ).json.connections.map( c => c.client ), [ 'aother' ] );
		assert.equal( count( `SELECT COUNT(*) AS n FROM oauth_tokens WHERE account_id = ${ ann.id }` ), 1 );
		// Someone else's tokens for that app, and their own apps, are untouched.
		assert.equal( count( 'SELECT COUNT(*) AS n FROM oauth_tokens WHERE token_hash = \'bob-on-ann-client\'' ), 1 );
		assert.equal( count( `SELECT COUNT(*) AS n FROM oauth_tokens WHERE account_id = ${ bob.id }` ), 4 );
		// An app that isn't connected, or a client id that can't be one, changes nothing.
		assert.equal( ( await call( '/build/api/connections/bclaude', { method: 'DELETE', cookie: ann.cookie } ) ).status, 204 );
		assert.equal( count( `SELECT COUNT(*) AS n FROM oauth_tokens WHERE account_id = ${ bob.id }` ), 4 );
		assert.equal( ( await call( `/build/api/connections/${ encodeURIComponent( 'x y' ) }`, { method: 'DELETE', cookie: ann.cookie } ) ).status, 404 );
		// Disconnect all still cuts off every one.
		assert.equal( ( await call( '/build/api/connections', { method: 'DELETE', cookie: ann.cookie } ) ).status, 204 );
		assert.deepEqual( ( await call( '/build/api/account', { cookie: ann.cookie } ) ).json.connections, [] );

	} );

	test( 'a subscriber\'s share links and payments', async () => {

		const sue = await signIn( { sub: 'sue-1', email: 'sue@example.com', name: 'Sue Subscriber' } );
		makeSubscriber( sue.id, 'sub_sue' );
		const made = await call( '/build/api/layouts', { method: 'POST', cookie: sue.cookie, body: { site: 'Test site', name: 'Yard', data: LAYOUT } } );
		assert.equal( made.status, 201, made.text );
		const shared = await call( `/build/api/layouts/${ made.json.id }/share`, { method: 'POST', cookie: sue.cookie } );
		assert.equal( shared.status, 200, shared.text );
		const listed = ( await call( '/build/api/account', { cookie: sue.cookie } ) ).json;
		assert.deepEqual( listed.shares.map( s => [ s.id, s.name, s.shareToken, s.lat ] ), [ [ made.json.id, 'Yard', shared.json.shareToken, 49.28 ] ] );
		assert.deepEqual( listed.payments.map( p => [ p.id, p.amount, p.currency, p.status, p.refunded ] ), [ [ 'in_sub_sue', 500, 'usd', 'paid', false ] ] );
		assert.equal( listed.usage.projectLimit, 200 );
		const me = ( await call( '/build/api/me', { cookie: sue.cookie } ) ).json;
		assert.equal( me.plan.tier, 'pro' );
		assert.equal( me.plan.subscribed, true );
		assert.equal( me.premium.billing.portal, true );

	} );

	test( 'everything about the account as a JSON file, never a password\'s hash or a token\'s', async () => {

		const eve = await signIn( { sub: 'eve-1', email: 'eve@example.com', name: 'Eve Export' } );
		// A username and password added, with Google as fresh proof.
		const added = await call( '/api/account/password', { method: 'POST', cookie: eve.cookie, body: { username: 'eve_export', password: 'correct horse battery', credential: await credential( { sub: 'eve-1', email: 'eve@example.com', name: 'Eve Export' } ) } } );
		assert.equal( added.status, 200, added.text );
		makeSubscriber( eve.id, 'sub_eve' );
		connectApps( eve.id, 'e' );
		const made = await call( '/build/api/layouts', { method: 'POST', cookie: eve.cookie, body: { site: 'Test site', name: 'Export yard', data: LAYOUT } } );
		assert.equal( made.status, 201 );
		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: eve.cookie, body: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } } ) ).status, 204 );
		rows( `INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at, account_id, xp ) VALUES ( 'player-eve', 'EveDrives', 'evedrives', 'secret-hash-of-eve', 1, 2, ${ eve.id }, 1234 );
			INSERT INTO best_scores ( player_id, period, place_key, score, tricks, place, vehicle, air_time, created_at ) VALUES ( 'player-eve', 'all', '', 900, 'Backflip!', 'Somewhere', 'pickup', 1.5, 3 );
			INSERT INTO feature_requests ( account_id, name, text, created_at ) VALUES ( ${ eve.id }, 'EveDrives', 'More cranes please', 4 )` );

		const res = await call( '/build/api/account/export', { cookie: eve.cookie } );
		assert.equal( res.status, 200, res.text );
		assert.match( res.headers.get( 'Content-Disposition' ), new RegExp( `attachment; filename="world-drive-account-${ eve.id }\\.json"` ) );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );
		const data = res.json;
		assert.equal( data.account.googleEmail, 'eve@example.com' );
		assert.equal( data.username.username, 'eve_export' );
		assert.equal( data.build.projects.length, 1 );
		assert.equal( data.build.projects[ 0 ].layout.items[ 0 ].library, 'traffic-cone' );
		assert.equal( data.build.projects[ 0 ].lat, 49.28 );
		assert.match( data.build.logo.image, /^data:image\/png;base64,iVBOR/ );
		assert.deepEqual( data.build.connectedApps.map( a => a.name ).sort(), [ 'Claude', 'Claude', 'Other app' ] );
		assert.equal( data.build.claudeCallsByMonth.reduce( ( n, m ) => n + m.calls, 0 ), 2 );
		assert.equal( data.billing.purchases[ 0 ].product, 'Build Pro' );
		assert.equal( data.billing.subscriptions[ 0 ].id, 'sub_eve' );
		assert.equal( data.billing.invoices[ 0 ].id, 'in_sub_eve' );
		assert.equal( data.worldDrive.players[ 0 ].nickname, 'EveDrives' );
		assert.equal( data.worldDrive.bestScores[ 0 ].score, 900 );
		assert.equal( data.worldDrive.featureRequests[ 0 ].text, 'More cranes please' );
		assert.ok( data.sessions.length >= 1 );
		// No secret of any kind: the password's hash and salt, sessions' and tokens' hashes, a player's secret.
		const [ login ] = rows( `SELECT password_hash, salt FROM logins WHERE account_id = ${ eve.id }` );
		const hashes = rows( `SELECT token_hash FROM sessions WHERE account_id = ${ eve.id }` ).map( r => r.token_hash );
		for ( const secret of [ login.password_hash, login.salt, ...hashes, 'e-token-hash-1', 'e-token-hash-2', 'secret-hash-of-eve' ] ) assert.ok( ! res.text.includes( secret ), `the export holds ${ secret }` );
		assert.doesNotMatch( res.text, /password_hash|token_hash|secret_hash|"salt"/ );

	} );

	test( 'deleting needs fresh proof, and the owner\'s accounts can\'t be deleted', async () => {

		const dan = await signIn( { sub: 'dan-1', email: 'dan@example.com', name: 'Dan Doubt' } );
		const added = await call( '/api/account/password', { method: 'POST', cookie: dan.cookie, body: { username: 'dan_doubt', password: 'correct horse battery', credential: await credential( { sub: 'dan-1', email: 'dan@example.com' } ) } } );
		assert.equal( added.status, 200, added.text );
		assert.equal( ( await call( '/build/api/account', { method: 'DELETE', cookie: dan.cookie } ) ).status, 400, 'no proof' );
		assert.equal( ( await call( '/build/api/account', { method: 'DELETE', cookie: dan.cookie, body: { password: 'not the password' } } ) ).status, 401 );
		const other = await call( '/build/api/account', { method: 'DELETE', cookie: dan.cookie, body: { credential: await credential( { sub: 'someone-else', email: 'else@example.com' } ) } } );
		assert.equal( other.status, 403, 'another Google account\'s token' );
		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ dan.id }` ), 1 );
		const boss = await signIn( { sub: 'boss-1', email: 'boss@example.com', name: 'The Boss' } );
		const refused = await call( '/build/api/account', { method: 'DELETE', cookie: boss.cookie, body: { credential: await credential( { sub: 'boss-1', email: 'boss@example.com' } ) } } );
		assert.equal( refused.status, 403 );
		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ boss.id }` ), 1 );

		// The right password deletes it.
		const gone = await call( '/build/api/account', { method: 'DELETE', cookie: dan.cookie, body: { password: 'correct horse battery' } } );
		assert.equal( gone.status, 204, gone.text );
		assert.match( gone.headers.get( 'Set-Cookie' ), /Max-Age=0/ );
		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ dan.id }` ), 0 );
		assert.equal( count( 'SELECT COUNT(*) AS n FROM logins WHERE username = \'dan_doubt\'' ), 0 );
		assert.equal( ( await call( '/build/api/me', { cookie: dan.cookie } ) ).status, 401 );

	} );

	test( 'nothing is deleted if Stripe won\'t cancel the subscription', async () => {

		const fay = await signIn( { sub: 'fay-1', email: 'fay@example.com', name: 'Fay Fail' } );
		makeSubscriber( fay.id, 'sub_fail_fay' );
		const before = stripe.requests.length;
		const res = await call( '/build/api/account', { method: 'DELETE', cookie: fay.cookie, body: { credential: await credential( { sub: 'fay-1', email: 'fay@example.com' } ) } } );
		assert.equal( res.status, 502, res.text );
		assert.deepEqual( stripe.requests.slice( before ), [ { method: 'GET', path: '/v1/subscriptions?customer=cus_subfailfay&status=all&limit=100' }, { method: 'DELETE', path: '/v1/subscriptions/sub_fail_fay' } ] );
		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ fay.id }` ), 1 );
		assert.equal( ( await call( '/build/api/me', { cookie: fay.cookie } ) ).json.plan.tier, 'pro' );

	} );

	test( 'deleting asks Stripe too: a subscription paid for whose webhook hasn\'t come yet is cancelled', async () => {

		const lea = await signIn( { sub: 'lea-1', email: 'lea@example.com', name: 'Lea Lag' } );
		rows( `UPDATE accounts SET stripe_customer = 'cus_lealag' WHERE id = ${ lea.id }` );
		stripe.lists.subscriptions = [ { id: 'sub_lea_new', status: 'active' }, { id: 'sub_lea_waiting', status: 'incomplete' }, { id: 'sub_lea_old', status: 'canceled' } ];
		const before = stripe.requests.length;
		const res = await call( '/build/api/account', { method: 'DELETE', cookie: lea.cookie, body: { credential: await credential( { sub: 'lea-1', email: 'lea@example.com' } ) } } );
		stripe.lists.subscriptions = [];
		assert.equal( res.status, 204, res.text );
		assert.deepEqual( stripe.requests.slice( before ).map( r => `${ r.method } ${ r.path }` ),
			[ 'GET /v1/subscriptions?customer=cus_lealag&status=all&limit=100', 'DELETE /v1/subscriptions/sub_lea_new', 'DELETE /v1/subscriptions/sub_lea_waiting' ] );
		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ lea.id }` ), 0 );

	} );

	test( 'deleting cancels the subscription at Stripe, then the account goes and what it leaves is anonymised', async () => {

		const gus = await signIn( { sub: 'gus-1', email: 'gus@example.com', name: 'Gus Gone' } );
		const id = gus.id;
		makeSubscriber( id, 'sub_gus' );
		// A Supporter Pass subscription bought with the Google email before signing in (no account on
		// it), which Stripe no longer has: cancelling it there is a 404, which is fine.
		rows( `INSERT INTO purchases ( checkout_session, account_id, email, amount, currency, status, created_at, subscription ) VALUES ( 'cs_gus_pass', NULL, 'gus@example.com', 300, 'usd', 'paid', ${ NOW - HOUR }, 'sub_gone_gus' )` );
		connectApps( id, 'g' );
		const made = await call( '/build/api/layouts', { method: 'POST', cookie: gus.cookie, body: { site: 'Test site', name: 'Gus yard', data: LAYOUT } } );
		assert.equal( made.status, 201 );
		await call( `/build/api/layouts/${ made.json.id }/share`, { method: 'POST', cookie: gus.cookie } );
		assert.equal( ( await call( '/build/api/logo', { method: 'PUT', cookie: gus.cookie, body: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } } ) ).status, 204 );
		// The game's side: a player with a score, a challenge time and ghost, an achievement and a key,
		// a feature request; and a challenge with Gus and one other driver on it.
		rows( `INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at, account_id ) VALUES ( 'player-gus', 'GusDrives', 'gusdrives', 'x', 1, 2, ${ id } ), ( 'player-other', 'Other', 'other', 'y', 1, 2, NULL );
			INSERT INTO best_scores ( player_id, period, place_key, score, tricks, place, vehicle, air_time, created_at ) VALUES ( 'player-gus', 'all', '', 900, 'Backflip!', 'Somewhere', 'pickup', 1.5, 3 );
			INSERT INTO challenges ( id, period, world, kind, place, route, source, starts_at, ends_at, drivers, created_at, ghost_bytes ) VALUES ( 77, 'day:2026-11-24', 'earth', 'sprint', 'Here', '{}', 'rotation', 0, 9999999999999, 2, 0, 150 );
			INSERT INTO challenge_times ( challenge_id, player_id, ms, passes, vehicle, run_id, visit, created_at, first_at ) VALUES ( 77, 'player-gus', 1000, '[]', 'pickup', 'run-gus', 'v', 1, 1 ), ( 77, 'player-other', 1200, '[]', 'pickup', 'run-other', 'v', 1, 1 );
			INSERT INTO challenge_ghosts ( challenge_id, player_id, run_id, ms, passes, vehicle, ghost, bytes, least_ms, created_at ) VALUES ( 77, 'player-gus', 'run-gus', 1000, '[]', 'pickup', 'g', 100, 1000, 1 ), ( 77, 'player-other', 'run-other', 1200, '[]', 'pickup', 'g', 50, 1200, 1 );
			INSERT INTO achievements ( player_id, achievement, earned_at ) VALUES ( 'player-gus', 'first-jump', 1 );
			INSERT INTO player_keys ( secret_hash, player_id, account_id, created_at ) VALUES ( 'key-gus', 'player-gus', ${ id }, 1 );
			INSERT INTO feature_requests ( account_id, name, text, created_at ) VALUES ( ${ id }, 'GusDrives', 'Gus wants a bulldozer', 4 );
			INSERT INTO build_comps ( account_id, reason, until, created_by, created_at ) VALUES ( ${ id }, 'test', NULL, NULL, 1 )` );
		await call( '/build/api/config', { cookie: gus.cookie } );

		const before = stripe.requests.length;
		const res = await call( '/build/api/account', { method: 'DELETE', cookie: gus.cookie, body: { credential: await credential( { sub: 'gus-1', email: 'gus@example.com' } ) } } );
		assert.equal( res.status, 204, res.text );
		assert.deepEqual( stripe.requests.slice( before ).map( r => `${ r.method } ${ r.path }` ).sort(), [ 'DELETE /v1/subscriptions/sub_gone_gus', 'DELETE /v1/subscriptions/sub_gus', 'GET /v1/subscriptions?customer=cus_subgus&status=all&limit=100' ] );

		// The account and everything that cascades from it.
		for ( const table of [ 'sessions', 'build_layouts', 'build_views', 'build_logos', 'build_comps', 'oauth_tokens', 'mcp_calls', 'player_keys', 'feature_requests' ] ) {

			assert.equal( count( `SELECT COUNT(*) AS n FROM ${ table } WHERE account_id = ${ id }` ), 0, table );

		}

		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ id } OR email = 'gus@example.com'` ), 0 );
		assert.equal( count( 'SELECT COUNT(*) AS n FROM feature_requests WHERE text LIKE \'Gus%\'' ), 0 );
		// Its player and everything of it; the other driver's time and ghost stay, and the challenge
		// counts one driver and the other's ghost.
		assert.equal( count( 'SELECT COUNT(*) AS n FROM players WHERE id = \'player-gus\'' ), 0 );
		for ( const table of [ 'best_scores', 'challenge_times', 'challenge_ghosts', 'achievements', 'player_keys' ] ) {

			assert.equal( count( `SELECT COUNT(*) AS n FROM ${ table } WHERE player_id = 'player-gus'` ), 0, table );

		}

		assert.equal( count( 'SELECT COUNT(*) AS n FROM challenge_times WHERE player_id = \'player-other\'' ), 1 );
		assert.deepEqual( rows( 'SELECT drivers, ghost_bytes FROM challenges WHERE id = 77' )[ 0 ], { drivers: 1, ghost_bytes: 50 } );
		// Purchases kept for the tax record, nobody's and without the email; the subscriptions cancelled
		// and no longer the account's; the invoice kept.
		assert.deepEqual( rows( 'SELECT checkout_session, account_id, email, amount FROM purchases WHERE checkout_session IN ( \'cs_sub_gus\', \'cs_gus_pass\' ) ORDER BY checkout_session' ),
			[ { checkout_session: 'cs_gus_pass', account_id: null, email: '', amount: 300 }, { checkout_session: 'cs_sub_gus', account_id: null, email: '', amount: 500 } ] );
		assert.deepEqual( rows( 'SELECT status, account_id FROM subscriptions WHERE id = \'sub_gus\'' )[ 0 ], { status: 'canceled', account_id: null } );
		assert.deepEqual( rows( 'SELECT account_id, amount_paid FROM invoices WHERE id = \'in_sub_gus\'' )[ 0 ], { account_id: null, amount_paid: 500 } );
		assert.equal( count( 'SELECT COUNT(*) AS n FROM purchases WHERE email = \'gus@example.com\'' ), 0 );

	} );

} );

describe( 'the page', () => {

	let browser;
	let page;
	const errors = [];

	before( async () => {

		const { chromium } = require( 'playwright' );
		browser = await chromium.launch();
		page = await browser.newPage( { viewport: { width: 1280, height: 900 }, acceptDownloads: true } );
		page.on( 'pageerror', e => errors.push( String( e ) ) );
		await page.route( '**/*', route => {

			const url = route.request().url();
			if ( url.startsWith( GOOGLE_SCRIPT ) ) return route.fulfill( { contentType: 'text/javascript', body: GOOGLE_STUB } );
			return url.startsWith( server.base ) ? route.continue() : route.abort();

		} );

	} );

	after( async () => {

		await browser?.close();

	} );

	// The page loaded afresh (going to it with only its #section changed wouldn't load it again).
	async function open( hash = '' ) {

		await page.goto( 'about:blank' );
		await page.goto( `${ server.base }/build/account/${ hash }` );
		await page.waitForFunction( () => document.body.dataset.loaded === 'yes' );

	}

	async function signInAs( claims ) {

		const token = await credential( claims );
		const res = await page.evaluate( async credential => {

			const r = await fetch( '/build/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { credential } ) } );
			return { status: r.status, body: await r.json() };

		}, token );
		assert.equal( res.status, 200, JSON.stringify( res.body ) );
		return res.body.user.id;

	}

	const text = id => page.locator( `#${ id }` ).innerText();

	test( 'signed out: asked to sign in, and the dashboard links here', async () => {

		await open();
		assert.equal( await page.isVisible( '#signed-out' ), true );
		assert.equal( await page.isVisible( '#signed-in' ), false );
		assert.equal( await page.getAttribute( 'meta[name="robots"]', 'content' ), 'noindex, nofollow' );
		await page.waitForSelector( '#google-button .stub-google' );
		await page.goto( `${ server.base }/build/` );
		assert.equal( await page.getAttribute( '#account-link', 'href' ), '/build/account/' );

	} );

	test( 'the free plan: its sections, and Go Build Pro goes to Stripe\'s checkout', async () => {

		await page.goto( `${ server.base }/build/account/` );
		await signInAs( { sub: 'page-free', email: 'pagefree@example.com', name: 'Page Free' } );
		await open( '#billing' );
		assert.equal( await page.isVisible( '#signed-in' ), true );
		for ( const id of [ 'profile', 'security', 'billing', 'usage', 'branding', 'apps', 'links', 'data', 'delete' ] ) assert.equal( await page.isVisible( `#${ id }` ), true, id );
		assert.match( await text( 'profile-body' ), /pagefree@example\.com/ );
		assert.match( await text( 'security-body' ), /Sign out everywhere/ );
		const billing = await text( 'billing-body' );
		assert.match( billing, /Free/ );
		assert.match( billing, /renews automatically/ );
		assert.match( billing, /14 days/ );
		assert.match( await text( 'usage-body' ), /0 \/ 15/ );
		assert.match( await text( 'delete-body' ), /World Drive game profile/ );
		const [ request ] = await Promise.all( [
			page.waitForRequest( r => r.url().startsWith( 'https://checkout.stripe.com/' ) ),
			page.click( '#billing-body button[data-interval="year"]' ),
		] );
		assert.equal( request.url(), 'https://checkout.stripe.com/c/pay/cs_test_acct' );
		assert.equal( stripe.requests.filter( r => r.path === '/v1/checkout/sessions' ).length, 1 );

	} );

	test( 'a subscriber: when it renews, the billing portal, an app cut off, a share link revoked, the data downloaded', async () => {

		await page.goto( `${ server.base }/build/account/` );
		const id = await signInAs( { sub: 'page-pro', email: 'pagepro@example.com', name: 'Page Pro' } );
		makeSubscriber( id, 'sub_page', { days: 10 } );
		connectApps( id, 'p' );
		await page.evaluate( async layout => {

			const made = await ( await fetch( '/build/api/layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { site: 'Test site', name: 'Shared yard', data: layout } ) } ) ).json();
			await fetch( `/build/api/layouts/${ made.id }/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } );

		}, LAYOUT );
		await open();
		const billing = await text( 'billing-body' );
		assert.match( billing, /Build Pro/ );
		assert.match( billing, /US\$5\/month, billed monthly/ );
		assert.match( billing, /Renews on/ );
		assert.match( billing, /Switch to yearly/ );
		assert.match( billing, /\$5\.00/ );
		const [ portal ] = await Promise.all( [
			page.waitForRequest( r => r.url().startsWith( 'https://billing.stripe.com/' ) ),
			page.click( '#manage-billing' ),
		] );
		assert.equal( portal.url(), 'https://billing.stripe.com/p/session/test_acct' );

		await open( '#apps' );
		assert.deepEqual( await page.$$eval( '#apps-body li', items => items.map( li => li.dataset.client ) ), [ 'pclaude', 'pother' ] );
		await page.click( '#apps-body li[data-client="pclaude"] button' );
		await page.waitForFunction( () => document.querySelectorAll( '#apps-body li' ).length === 1 );
		assert.equal( count( `SELECT COUNT(*) AS n FROM oauth_tokens WHERE account_id = ${ id } AND client_id = 'pclaude'` ), 0 );
		assert.equal( count( `SELECT COUNT(*) AS n FROM oauth_tokens WHERE account_id = ${ id } AND client_id = 'pother'` ), 1 );

		assert.equal( await page.locator( '#links-body li' ).count(), 1 );
		assert.match( await page.getAttribute( '#links-body li a', 'href' ), /\/build\/app\/\?at=49\.280000%2C-123\.120000&place=Test\+site&view=[\w-]{22}$/ );
		await page.click( '#links-body li button:has-text("Revoke")' );
		await page.waitForFunction( () => ! document.querySelector( '#links-body li' ) );
		assert.equal( count( `SELECT COUNT(*) AS n FROM build_layouts WHERE account_id = ${ id } AND share_token IS NOT NULL` ), 0 );

		const [ download ] = await Promise.all( [ page.waitForEvent( 'download' ), page.click( '#download-data' ) ] );
		assert.equal( download.suggestedFilename(), `world-drive-account-${ id }.json` );
		const data = JSON.parse( readFileSync( await download.path(), 'utf8' ) );
		assert.equal( data.account.googleEmail, 'pagepro@example.com' );
		assert.equal( data.build.projects[ 0 ].name, 'Shared yard' );

	} );

	test( 'deleting the account with Google\'s button: the subscription cancelled, everything gone', async () => {

		await page.goto( `${ server.base }/build/account/` );
		const id = await signInAs( { sub: 'page-del', email: 'pagedel@example.com', name: 'Page Delete' } );
		makeSubscriber( id, 'sub_pagedel' );
		await open( '#delete' );
		await page.evaluate( async token => window.testCredential = token, await credential( { sub: 'page-del', email: 'pagedel@example.com' } ) );
		await page.waitForSelector( '#delete-body .stub-google' );
		// Not without ticking the box.
		await page.click( '#delete-body .stub-google' );
		assert.match( await page.locator( '#delete-body .status-line' ).innerText(), /Tick the box/ );
		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ id }` ), 1 );
		await page.check( '#delete-sure' );
		const before = stripe.requests.length;
		await page.click( '#delete-body .stub-google' );
		await page.waitForFunction( () => document.body.dataset.deleted === 'yes' );
		assert.match( await page.locator( '#signed-out' ).innerText(), /Your account is deleted/ );
		assert.deepEqual( stripe.requests.slice( before ).filter( r => r.method === 'DELETE' ), [ { method: 'DELETE', path: '/v1/subscriptions/sub_pagedel' } ] );
		assert.equal( count( `SELECT COUNT(*) AS n FROM accounts WHERE id = ${ id }` ), 0 );
		assert.equal( count( `SELECT COUNT(*) AS n FROM sessions WHERE account_id = ${ id }` ), 0 );
		await open();
		assert.equal( await page.isVisible( '#signed-out' ), true, 'signed out after' );
		assert.deepEqual( errors, [] );

	} );

} );

// BUILD_SALES unset (the default), Stripe set up all the same: buying hidden.
describe( 'the page, buying hidden (BUILD_SALES unset)', () => {

	const BUYING_WORDS = /US\$|\/month|\/year|Subscribe|Go Build Pro|opens soon/i;
	let main;
	let browser;
	let page;
	const errors = [];

	before( async () => {

		main = server;
		server = await startWorker( { port: Number( process.env.TEST_BUILD_ACCOUNT_HIDDEN_PORT ) || PORT + 1, config: 'wrangler.drive.jsonc', vars: workerVars(), assets: assetsOf() } );
		const { chromium } = require( 'playwright' );
		browser = await chromium.launch();
		page = await browser.newPage( { viewport: { width: 1280, height: 900 } } );
		page.on( 'pageerror', e => errors.push( String( e ) ) );
		await page.route( '**/*', route => {

			const url = route.request().url();
			if ( url.startsWith( GOOGLE_SCRIPT ) ) return route.fulfill( { contentType: 'text/javascript', body: GOOGLE_STUB } );
			return url.startsWith( server.base ) ? route.continue() : route.abort();

		} );

	} );

	after( async () => {

		await browser?.close();
		server?.stop();
		server = main;

	} );

	async function open( hash = '' ) {

		await page.goto( 'about:blank' );
		await page.goto( `${ server.base }/build/account/${ hash }` );
		await page.waitForFunction( () => document.body.dataset.loaded === 'yes' );

	}

	async function signInAs( claims ) {

		await page.context().clearCookies();
		await page.goto( `${ server.base }/build/account/` );
		const token = await credential( claims );
		const res = await page.evaluate( async credential => {

			const r = await fetch( '/build/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { credential } ) } );
			return { status: r.status, body: await r.json() };

		}, token );
		assert.equal( res.status, 200, JSON.stringify( res.body ) );
		return res.body.user.id;

	}

	const section = () => page.evaluate( () => ( {
		title: document.getElementById( 'billing-title' ).textContent,
		nav: document.querySelector( 'a[href="#billing"]' ).textContent,
		text: document.getElementById( 'billing-body' ).innerText,
		buttons: [ ...document.querySelectorAll( '#billing-body button' ) ].map( b => b.textContent ),
		payments: !! document.querySelector( '#billing-body .payments' ),
	} ) );

	test( 'the free plan: just the plan, what each includes, no prices or buying', async () => {

		await signInAs( { sub: 'hidden-free', email: 'hiddenfree@example.com', name: 'Hidden Free' } );
		await open( '#billing' );
		const plan = await section();
		assert.equal( plan.title, 'Plan' );
		assert.equal( plan.nav, 'Plan' );
		assert.match( plan.text, /Free/ );
		assert.match( plan.text, /33 everyday site pieces, 15 3D map views a month, 1 saved project/ );
		assert.match( plan.text, /300 3D map views a month, 200 projects/ );
		assert.match( plan.text, /isn't available to buy right now/ );
		assert.doesNotMatch( plan.text, BUYING_WORDS );
		assert.doesNotMatch( plan.text, /14 days|Payments|renews/i );
		assert.deepEqual( plan.buttons, [] );
		assert.equal( plan.payments, false );
		assert.match( await page.locator( '#usage-body' ).innerText(), /0 \/ 15/ );
		const asked = stripe.requests.length;
		const refused = await page.evaluate( async () => ( await fetch( '/build/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { interval: 'year' } ) } ) ).status );
		assert.equal( refused, 404 );
		assert.equal( stripe.requests.length, asked, 'Stripe never asked' );

	} );

	test( 'a comped account: Build Pro, given by World Drive', async () => {

		const id = await signInAs( { sub: 'hidden-comp', email: 'hiddencomp@example.com', name: 'Hidden Comp' } );
		rows( `INSERT INTO build_comps ( account_id, reason, until, created_by, created_at ) VALUES ( ${ id }, 'Friend', NULL, ${ id }, ${ NOW } )` );
		await open( '#billing' );
		const plan = await section();
		assert.equal( plan.title, 'Plan' );
		assert.match( plan.text, /Build Pro, given to you by World Drive/ );
		assert.doesNotMatch( plan.text, BUYING_WORDS );
		assert.deepEqual( plan.buttons, [] );
		assert.equal( plan.payments, false );

	} );

	test( 'an account that has paid: Manage billing and its payments, no renewal or prices', async () => {

		const id = await signInAs( { sub: 'hidden-paid', email: 'hiddenpaid@example.com', name: 'Hidden Paid' } );
		makeSubscriber( id, 'sub_hidden', { days: 10 } );
		await open( '#billing' );
		const plan = await section();
		assert.equal( plan.title, 'Plan' );
		assert.match( plan.text, /Build Pro/ );
		assert.deepEqual( plan.buttons, [ 'Manage billing' ] );
		assert.equal( plan.payments, true );
		assert.match( plan.text, /\$5\.00/ );
		assert.doesNotMatch( plan.text, /Renews on|billed monthly|Switch to yearly|Go Build Pro|opens soon|US\$5\/month/ );
		const [ portal ] = await Promise.all( [
			page.waitForRequest( r => r.url().startsWith( 'https://billing.stripe.com/' ) ),
			page.click( '#manage-billing' ),
		] );
		assert.equal( portal.url(), 'https://billing.stripe.com/p/session/test_acct' );

	} );

	test( 'no page errors', () => {

		assert.deepEqual( errors, [] );

	} );

} );
