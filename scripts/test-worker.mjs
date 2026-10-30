// npm run test:worker: checks the API (worker/index.js) twice over: as the Cloudflare Worker,
// against `wrangler dev` on this machine with a throwaway D1 database, and as the Vercel Function
// (api/index.js, worker/vercel.js) in this process on Postgres (PGlite, in memory), with requests
// addressed as Vercel's rewrite delivers them. Test keys stand in for Google's and a made-up secret
// for Stripe's; nothing is sent to Google, Cloudflare, Vercel, Neon or Stripe.
// TEST_WORKER_TARGETS=postgres (or d1) runs one of them; TEST_WORKER_PORT=8790 moves wrangler.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, rewritten, serveKeys, startVercelApi, startWorker, stripeSignature } from './worker-harness.mjs';
import { publicUrl, vercelApi } from '../worker/vercel.js';
import { toPostgres } from '../worker/postgres.js';
import { premiumSettings } from '../worker/premium.js';

const PORT = Number( process.env.TEST_WORKER_PORT ) || 8788;
const SITE = 'Neptune Terminals';
const MAPS_KEY = 'test-maps-key';
const PUBLIC_ORIGIN = 'https://neptune-twin.example.app';
// Made up, in Stripe's formats.
const PAYMENT_LINK = 'https://buy.stripe.com/test_00g5kE1aB2cD3eF4gH';
const PAYMENT_LINK_ID = 'plink_1TestPremiumLink00000000';
const WEBHOOK_SECRET = 'whsec_test_not_a_real_secret_0123456789';
const PRICE = 'CA$19, one time';

const TARGETS = {
	d1: {
		name: 'Cloudflare Worker on D1 (wrangler dev)',
		async start( vars ) {

			const worker = await startWorker( { port: PORT, vars } );
			// Plain http on 127.0.0.1 is local development: the cookie isn't Secure there.
			return { ...worker, fetch: ( path, init ) => fetch( worker.base + path, init ), cookieName: 'twin_session', secure: false, servesSite: true };

		},
	},
	postgres: {
		name: 'Vercel Function on Postgres (PGlite)',
		async start( vars ) {

			return { ...await startVercelApi( { origin: PUBLIC_ORIGIN, vars } ), cookieName: '__Host-twin_session', secure: true, servesSite: false };

		},
	},
};

const chosen = ( process.env.TEST_WORKER_TARGETS ?? 'd1,postgres' ).split( ',' ).map( s => s.trim() ).filter( Boolean );
for ( const id of chosen ) {

	assert.ok( TARGETS[ id ], `unknown target ${ id }` );
	describe( TARGETS[ id ].name, () => apiTests( TARGETS[ id ] ) );

}

if ( chosen.includes( 'postgres' ) ) describe( 'Vercel Function settings', vercelTests );

function apiTests( target ) {

	let server;
	let keys;
	let googleKey;
	let otherKey;
	let session = 0;

	before( async () => {

		googleKey = await makeKey( 'test-key-1' );
		// Not in the key set: tokens signed with it are forgeries.
		otherKey = await makeKey( 'test-key-1' );
		keys = await serveKeys( [ googleKey.jwk ] );
		server = await target.start( {
			GOOGLE_CLIENT_ID: CLIENT_ID,
			GOOGLE_JWKS_URL: keys.url,
			GOOGLE_MAPS_API_KEY: MAPS_KEY,
			ALLOWED_EMAILS: ' Alice@Example.com, bob@example.com ',
			ALLOWED_DOMAINS: 'neptune.example',
			STRIPE_PAYMENT_LINK: PAYMENT_LINK,
			STRIPE_PAYMENT_LINK_ID: PAYMENT_LINK_ID,
			STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
			PREMIUM_PRICE: PRICE,
			PREMIUM_EMAILS: 'dana@neptune.example',
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();

	} );

	// A browser stand-in: keeps its session cookie and sends this site's Origin on every request
	// (pass origin: null to leave it out, or another site's).
	function client() {

		let cookie = null;
		return {
			get cookie() {

				return cookie;

			},
			set cookie( value ) {

				cookie = value;

			},
			async send( method, path, { body, origin = server.base, type = 'application/json', headers = {} } = {} ) {

				const init = { method, headers: { ...headers } };
				if ( origin ) init.headers.Origin = origin;
				if ( cookie ) init.headers.Cookie = cookie;
				if ( body !== undefined ) {

					init.body = typeof body === 'string' ? body : JSON.stringify( body );
					if ( type ) init.headers[ 'Content-Type' ] = type;

				}

				const res = await server.fetch( path, init );
				const setCookie = res.headers.get( 'Set-Cookie' );
				if ( setCookie ) {

					const [ pair ] = setCookie.split( ';' );
					cookie = /=$/.test( pair ) ? null : pair;

				}

				const text = await res.text();
				return { status: res.status, headers: res.headers, setCookie, body: text ? JSON.parse( text ) : null };

			},
		};

	}

	async function signedIn( claims ) {

		const browser = client();
		const res = await browser.send( 'POST', '/api/session', { body: { credential: await makeToken( googleKey, claims ) } } );
		assert.equal( res.status, 200, JSON.stringify( res.body ) );
		return browser;

	}

	// A webhook from Stripe: the event JSON, signed with the endpoint's secret unless told otherwise.
	function stripe( type, object, { signature, secret = WEBHOOK_SECRET, time, origin = null, body } = {} ) {

		const text = body ?? JSON.stringify( { id: `evt_test_${ ++ session }`, object: 'event', type, livemode: false, data: { object } } );
		const headers = { 'Stripe-Signature': signature ?? stripeSignature( text, secret, time ) };
		return client().send( 'POST', '/api/stripe/webhook', { body: text, origin, type: 'application/json; charset=utf-8', headers } );

	}

	// A Checkout Session through the Payment Link, paid unless fields say otherwise.
	function checkout( fields = {} ) {

		session ++;
		return {
			id: `cs_test_${ session }`,
			object: 'checkout.session',
			mode: 'payment',
			payment_link: PAYMENT_LINK_ID,
			payment_status: 'paid',
			status: 'complete',
			client_reference_id: null,
			customer_details: { email: 'someone@example.com' },
			customer_email: null,
			payment_intent: `pi_test_${ session }`,
			amount_total: 1900,
			currency: 'cad',
			...fields,
		};

	}

	async function premiumOf( browser ) {

		const res = await browser.send( 'GET', '/api/me' );
		assert.equal( res.status, 200 );
		return res.body.premium;

	}

	const layoutData = ( items = 2 ) => ( {
		version: 2,
		site: SITE,
		items: Array.from( { length: items }, ( _, i ) => ( { name: `Barrier ${ i }`, procedural: 'jersey-barrier', east: i * 3, north: 10, up: null, heading: 90, scale: 1, library: 'jersey-barrier' } ) ),
		extras: {},
	} );

	let alice;
	let bob;
	let aliceLayout;
	let alicePurchase;

	test( 'config when signed out names the client, keeps the Maps key back and offers premium', async () => {

		const res = await client().send( 'GET', '/api/config' );
		assert.equal( res.status, 200 );
		assert.deepEqual( res.body, {
			googleClientId: CLIENT_ID,
			signedIn: false,
			premium: { enabled: true, link: PAYMENT_LINK, price: PRICE, unlocked: false },
		} );
		assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );

	} );

	test( 'signing in with a valid token sets a session cookie', async () => {

		const browser = client();
		const res = await browser.send( 'POST', '/api/session', { body: { credential: await makeToken( googleKey ) } } );
		assert.equal( res.status, 200 );
		assert.deepEqual( res.body.user, { name: 'Alice Example', firstName: 'Alice', email: 'alice@example.com', picture: '' } );
		assert.equal( res.body.hasMapsKey, true );
		assert.equal( res.body.premium.unlocked, false );
		assert.match( res.body.premium.clientReferenceId, /^[1-9][0-9]*$/ );
		const attributes = res.setCookie.split( ';' ).map( s => s.trim() );
		assert.match( attributes[ 0 ], new RegExp( `^${ server.cookieName }=[A-Za-z0-9_-]{43}$` ) );
		for ( const attribute of [ 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000' ] ) assert.ok( attributes.includes( attribute ), attribute );
		// Plain http on 127.0.0.1 is local development, where a Secure cookie wouldn't be kept;
		// the public https address always gets one.
		assert.equal( attributes.includes( 'Secure' ), server.secure );

		const me = await browser.send( 'GET', '/api/me' );
		assert.equal( me.status, 200 );
		assert.equal( me.body.user.email, 'alice@example.com' );
		assert.deepEqual( me.body.premium, res.body.premium );
		const config = await browser.send( 'GET', '/api/config' );
		assert.equal( config.body.signedIn, true );
		assert.equal( config.body.mapsKey, MAPS_KEY );
		assert.equal( config.body.user.firstName, 'Alice' );
		assert.deepEqual( config.body.premium, res.body.premium );
		alice = browser;

	} );

	test( 'bad tokens are refused and set no cookie', async () => {

		const now = Math.floor( Date.now() / 1000 );
		const valid = await makeToken( googleKey );
		const [ head, body ] = valid.split( '.' );
		const tampered = JSON.parse( Buffer.from( body, 'base64url' ) );
		tampered.email = 'bob@example.com';
		const cases = {
			'forged signature': await makeToken( otherKey ),
			'unknown key id': await makeToken( googleKey, {}, { kid: 'nope' } ),
			'wrong audience': await makeToken( googleKey, { aud: 'someone-else.apps.googleusercontent.com' } ),
			'wrong issuer': await makeToken( googleKey, { iss: 'https://evil.example' } ),
			'expired': await makeToken( googleKey, { iat: now - 7200, exp: now - 3600 } ),
			'issued in the future': await makeToken( googleKey, { iat: now + 600, exp: now + 4200 } ),
			'email not verified': await makeToken( googleKey, { email_verified: false } ),
			'email_verified missing': await makeToken( googleKey, { email_verified: undefined } ),
			'no email': await makeToken( googleKey, { email: undefined } ),
			'tampered payload': `${ head }.${ Buffer.from( JSON.stringify( tampered ) ).toString( 'base64url' ) }.${ valid.split( '.' )[ 2 ] }`,
			'alg none': `${ Buffer.from( '{"alg":"none","kid":"test-key-1"}' ).toString( 'base64url' ) }.${ body }.`,
			'alg HS256': `${ Buffer.from( '{"alg":"HS256","kid":"test-key-1"}' ).toString( 'base64url' ) }.${ valid.split( '.' ).slice( 1 ).join( '.' ) }`,
			'garbage': 'not.a.token',
			'not a string': 12345,
			'too long': 'a'.repeat( 5000 ),
		};
		for ( const [ name, credential ] of Object.entries( cases ) ) {

			const res = await client().send( 'POST', '/api/session', { body: { credential } } );
			assert.equal( res.status, 401, name );
			assert.equal( res.setCookie, null, name );
			assert.equal( res.body.error, 'Sign-in failed', name );

		}

	} );

	test( 'only allowed accounts can sign in', async () => {

		const refused = {
			'email not on the list': { sub: '1003', email: 'carol@other.example' },
			// Anyone can make a Google account with a company address; only Workspace (hd) proves it.
			'company address without Workspace': { sub: '1005', email: 'erin@neptune.example' },
			'Workspace domain not on the list': { sub: '1006', email: 'fred@other.example', hd: 'other.example' },
		};
		for ( const [ name, claims ] of Object.entries( refused ) ) {

			const res = await client().send( 'POST', '/api/session', { body: { credential: await makeToken( googleKey, claims ) } } );
			assert.equal( res.status, 403, name );
			assert.equal( res.setCookie, null, name );

		}

		await signedIn( { sub: '1004', email: 'dana@neptune.example', hd: 'neptune.example', name: 'Dana Smith', given_name: undefined } );
		bob = await signedIn( { sub: '1002', email: 'bob@example.com', name: 'Bob Builder', given_name: 'Bob' } );

	} );

	test( 'layouts need a session', async () => {

		const anonymous = client();
		assert.equal( ( await anonymous.send( 'GET', '/api/me' ) ).status, 401 );
		assert.equal( ( await anonymous.send( 'GET', `/api/layouts?site=${ SITE }` ) ).status, 401 );
		assert.equal( ( await anonymous.send( 'POST', '/api/layouts', { body: { site: SITE, name: 'x', data: layoutData() } } ) ).status, 401 );
		anonymous.cookie = `${ server.cookieName }=${ 'A'.repeat( 43 ) }`;
		assert.equal( ( await anonymous.send( 'GET', '/api/me' ) ).status, 401 );

	} );

	test( 'create, list, read and update a layout', async () => {

		const created = await alice.send( 'POST', '/api/layouts', { body: { site: SITE, name: '  Laydown A  ', data: layoutData() } } );
		assert.equal( created.status, 201 );
		assert.match( created.body.id, /^[A-Za-z0-9_-]{16}$/ );
		assert.equal( created.body.name, 'Laydown A' );
		assert.equal( created.body.shared, false );
		assert.equal( typeof created.body.updatedAt, 'number' );
		aliceLayout = created.body;

		const list = await alice.send( 'GET', `/api/layouts?site=${ encodeURIComponent( SITE ) }` );
		assert.deepEqual( list.body.layouts.map( l => l.id ), [ aliceLayout.id ] );
		assert.deepEqual( ( await alice.send( 'GET', '/api/layouts?site=Elsewhere' ) ).body.layouts, [] );

		const read = await alice.send( 'GET', `/api/layouts/${ aliceLayout.id }` );
		assert.equal( read.status, 200 );
		assert.deepEqual( read.body.data, layoutData() );
		assert.equal( read.headers.get( 'ETag' ), `"${ aliceLayout.updatedAt }"` );

		const renamed = await alice.send( 'PUT', `/api/layouts/${ aliceLayout.id }`, { body: { name: 'Laydown B' } } );
		assert.equal( renamed.status, 200 );
		assert.equal( renamed.body.name, 'Laydown B' );
		assert.ok( renamed.body.updatedAt > aliceLayout.updatedAt );

		const saved = await alice.send( 'PUT', `/api/layouts/${ aliceLayout.id }`, { body: { data: layoutData( 3 ) }, headers: { 'If-Match': `"${ renamed.body.updatedAt }"` } } );
		assert.equal( saved.status, 200 );
		assert.ok( saved.body.updatedAt > renamed.body.updatedAt );
		assert.equal( ( await alice.send( 'GET', `/api/layouts/${ aliceLayout.id }` ) ).body.data.items.length, 3 );
		aliceLayout = saved.body;

	} );

	test( 'a save based on an old version is refused with the newer version', async () => {

		const old = aliceLayout.updatedAt - 1;
		const byHeader = await alice.send( 'PUT', `/api/layouts/${ aliceLayout.id }`, { body: { data: layoutData( 1 ) }, headers: { 'If-Match': `"${ old }"` } } );
		assert.equal( byHeader.status, 409 );
		assert.equal( byHeader.body.updatedAt, aliceLayout.updatedAt );
		const byBody = await alice.send( 'PUT', `/api/layouts/${ aliceLayout.id }`, { body: { data: layoutData( 1 ), updatedAt: old } } );
		assert.equal( byBody.status, 409 );
		assert.equal( ( await alice.send( 'GET', `/api/layouts/${ aliceLayout.id }` ) ).body.data.items.length, 3 );

		// Without a version the save goes through (the "keep mine" choice).
		const forced = await alice.send( 'PUT', `/api/layouts/${ aliceLayout.id }`, { body: { data: layoutData( 4 ) } } );
		assert.equal( forced.status, 200 );
		aliceLayout = forced.body;

	} );

	test( 'bad layout requests are refused', async () => {

		const cases = [
			[ 'POST', '/api/layouts', { site: SITE, data: layoutData() }, 'no name' ],
			[ 'POST', '/api/layouts', { site: SITE, name: 'x'.repeat( 101 ), data: layoutData() }, 'long name' ],
			[ 'POST', '/api/layouts', { site: SITE, name: '   ', data: layoutData() }, 'blank name' ],
			[ 'POST', '/api/layouts', { name: 'x', data: layoutData() }, 'no site' ],
			[ 'POST', '/api/layouts', { site: SITE, name: 'x', data: [ 1, 2 ] }, 'data is an array' ],
			[ 'POST', '/api/layouts', { site: SITE, name: 'x', data: { items: 'no' } }, 'items not a list' ],
			[ 'POST', '/api/layouts', '{"site":', 'broken JSON' ],
			[ 'POST', '/api/layouts', '[]', 'body is an array' ],
			[ 'PUT', `/api/layouts/${ aliceLayout.id }`, {}, 'nothing to change' ],
			[ 'PUT', `/api/layouts/${ aliceLayout.id }`, { name: 'x', updatedAt: 'soon' }, 'bad version' ],
		];
		for ( const [ method, path, body, name ] of cases ) assert.equal( ( await alice.send( method, path, { body } ) ).status, 400, name );

	} );

	test( 'other people can\'t see, change, share or delete your layout', async () => {

		const path = `/api/layouts/${ aliceLayout.id }`;
		assert.equal( ( await bob.send( 'GET', path ) ).status, 404 );
		assert.equal( ( await bob.send( 'PUT', path, { body: { name: 'Mine now' } } ) ).status, 404 );
		assert.equal( ( await bob.send( 'PUT', path, { body: { data: layoutData( 0 ) }, headers: { 'If-Match': `"${ aliceLayout.updatedAt }"` } } ) ).status, 404 );
		assert.equal( ( await bob.send( 'DELETE', path, { body: {} } ) ).status, 404 );
		assert.equal( ( await bob.send( 'POST', `${ path }/share`, { body: {} } ) ).status, 404 );
		assert.equal( ( await bob.send( 'DELETE', `${ path }/share`, { body: {} } ) ).status, 404 );
		assert.deepEqual( ( await bob.send( 'GET', '/api/layouts' ) ).body.layouts, [] );

		const still = await alice.send( 'GET', path );
		assert.equal( still.body.name, 'Laydown B' );
		assert.equal( still.body.updatedAt, aliceLayout.updatedAt );

	} );

	test( 'share by link, read it without signing in, then stop sharing', async () => {

		const path = `/api/layouts/${ aliceLayout.id }/share`;
		const shared = await alice.send( 'POST', path, { body: {} } );
		assert.equal( shared.status, 200 );
		const token = shared.body.shareToken;
		assert.match( token, /^[A-Za-z0-9_-]{22}$/ );
		assert.equal( ( await alice.send( 'POST', path, { body: {} } ) ).body.shareToken, token, 'sharing again keeps the link' );
		assert.equal( ( await alice.send( 'GET', '/api/layouts' ) ).body.layouts[ 0 ].shared, true );

		const viewer = client();
		const view = await viewer.send( 'GET', `/api/shared/${ token }` );
		assert.equal( view.status, 200 );
		assert.deepEqual( Object.keys( view.body ).sort(), [ 'data', 'name', 'owner', 'site', 'updatedAt' ] );
		assert.equal( view.body.owner, 'Alice' );
		assert.equal( view.body.name, 'Laydown B' );
		assert.equal( view.body.data.items.length, 4 );
		assert.equal( ( await viewer.send( 'GET', `/api/config?view=${ token }` ) ).body.mapsKey, MAPS_KEY );
		assert.equal( ( await viewer.send( 'GET', `/api/config?view=${ 'x'.repeat( 22 ) }` ) ).body.mapsKey, undefined );
		assert.equal( ( await viewer.send( 'GET', `/api/shared/${ 'x'.repeat( 22 ) }` ) ).status, 404 );
		// Read only: there is nothing to write to through the link.
		assert.equal( ( await viewer.send( 'PUT', `/api/shared/${ token }`, { body: { name: 'x' } } ) ).status, 405 );

		assert.equal( ( await alice.send( 'DELETE', path, { body: {} } ) ).status, 204 );
		assert.equal( ( await viewer.send( 'GET', `/api/shared/${ token }` ) ).status, 404 );
		assert.equal( ( await viewer.send( 'GET', `/api/config?view=${ token }` ) ).body.mapsKey, undefined );

	} );

	test( 'changes must be JSON from this site (CSRF)', async () => {

		const body = { site: SITE, name: 'Forged', data: layoutData() };
		assert.equal( ( await alice.send( 'POST', '/api/layouts', { body, origin: 'https://evil.example' } ) ).status, 403 );
		assert.equal( ( await alice.send( 'POST', '/api/layouts', { body, origin: null } ) ).status, 403 );
		assert.equal( ( await alice.send( 'POST', '/api/layouts', { body, type: 'text/plain' } ) ).status, 415 );
		assert.equal( ( await alice.send( 'POST', '/api/layouts', { body, type: 'application/x-www-form-urlencoded' } ) ).status, 415 );
		assert.equal( ( await alice.send( 'POST', '/api/layouts', { body, type: null } ) ).status, 415 );
		assert.equal( ( await alice.send( 'PUT', `/api/layouts/${ aliceLayout.id }`, { body: { name: 'Forged' }, origin: 'https://evil.example' } ) ).status, 403 );
		assert.equal( ( await alice.send( 'DELETE', `/api/layouts/${ aliceLayout.id }`, { body: {}, origin: 'https://evil.example' } ) ).status, 403 );
		assert.equal( ( await alice.send( 'POST', '/api/session', { body: { credential: await makeToken( googleKey ) }, origin: 'https://evil.example' } ) ).status, 403 );
		assert.equal( ( await alice.send( 'DELETE', '/api/session', { body: {}, origin: 'https://evil.example' } ) ).status, 403 );

		// None of it happened.
		assert.equal( ( await alice.send( 'GET', '/api/me' ) ).status, 200 );
		const { layouts } = ( await alice.send( 'GET', '/api/layouts' ) ).body;
		assert.deepEqual( layouts.map( l => l.name ), [ 'Laydown B' ] );

	} );

	test( 'bodies over 1 MB are refused', async () => {

		const big = { ...layoutData(), extras: { notes: 'x'.repeat( 1024 * 1024 ) } };
		const res = await alice.send( 'POST', '/api/layouts', { body: { site: SITE, name: 'Huge', data: big } } );
		assert.equal( res.status, 413 );
		const fits = { ...layoutData(), extras: { notes: 'x'.repeat( 900 * 1024 ) } };
		const ok = await alice.send( 'POST', '/api/layouts', { body: { site: SITE, name: 'Big', data: fits } } );
		assert.equal( ok.status, 201 );
		assert.equal( ( await alice.send( 'DELETE', `/api/layouts/${ ok.body.id }`, { body: {} } ) ).status, 204 );

	} );

	test( 'a share link never shows anything from the owner\'s email address', async () => {

		// Google gives no name for some accounts; the link must not fall back to the email.
		const gina = await signedIn( { sub: '1007', email: 'gina.long@neptune.example', hd: 'neptune.example', name: undefined, given_name: undefined } );
		const made = await gina.send( 'POST', '/api/layouts', { body: { site: SITE, name: 'Gina\'s plan', data: layoutData() } } );
		const shared = await gina.send( 'POST', `/api/layouts/${ made.body.id }/share`, { body: {} } );
		const view = await client().send( 'GET', `/api/shared/${ shared.body.shareToken }` );
		assert.equal( view.status, 200 );
		assert.equal( view.body.owner, 'someone' );
		assert.ok( ! JSON.stringify( view.body ).includes( 'gina' ) );

	} );

	test( 'stored size is limited per layout and per account', async () => {

		// Small to send, but over 1 MB once stored: each number is written out in full.
		const swollen = { ...layoutData(), extras: { numbers: Array.from( { length: 190000 }, () => 1e20 ) } };
		assert.equal( ( await bob.send( 'POST', '/api/layouts', { body: { site: SITE, name: 'Swollen', data: swollen } } ) ).status, 413 );

		// Layouts of 0.9 MB until the account's 25 MB are used up.
		const fits = { ...layoutData(), extras: { notes: 'x'.repeat( 900 * 1024 ) } };
		const made = [];
		let refused = null;
		for ( let i = 0; i < 30 && ! refused; i ++ ) {

			const res = await bob.send( 'POST', '/api/layouts', { body: { site: SITE, name: `Big ${ i }`, data: fits } } );
			if ( res.status === 201 ) made.push( res.body.id );
			else refused = res;

		}

		assert.equal( refused?.status, 403 );
		assert.ok( made.length >= 25 && made.length <= 28, `${ made.length } fitted` );
		// A full account can still save its layouts smaller.
		assert.equal( ( await bob.send( 'PUT', `/api/layouts/${ made[ 0 ] }`, { body: { data: layoutData() } } ) ).status, 200 );
		for ( const id of made ) await bob.send( 'DELETE', `/api/layouts/${ id }`, { body: {} } );

	} );

	test( 'delete a layout', async () => {

		const path = `/api/layouts/${ aliceLayout.id }`;
		assert.equal( ( await alice.send( 'DELETE', path, { body: {} } ) ).status, 204 );
		assert.equal( ( await alice.send( 'GET', path ) ).status, 404 );
		assert.equal( ( await alice.send( 'DELETE', path, { body: {} } ) ).status, 404 );
		assert.deepEqual( ( await alice.send( 'GET', '/api/layouts' ) ).body.layouts, [] );

	} );

	test( 'unknown routes and methods', async () => {

		assert.equal( ( await alice.send( 'GET', '/api/nothing' ) ).status, 404 );
		assert.equal( ( await alice.send( 'GET', '/api/layouts/not-an-id' ) ).status, 404 );
		const wrong = await alice.send( 'PATCH', '/api/layouts', { body: {} } );
		assert.equal( wrong.status, 405 );
		assert.equal( wrong.headers.get( 'Allow' ), 'GET, POST' );
		assert.equal( ( await alice.send( 'GET', '/api/stripe/webhook' ) ).status, 405 );
		// On Vercel the site itself is Vercel's to serve; only the Worker serves it too.
		if ( ! server.servesSite ) return;
		const page = await fetch( `${ server.base }/` );
		assert.equal( page.status, 200 );
		assert.match( await page.text(), /test site/ );

	} );

	// --- premium -------------------------------------------------------------------------

	test( 'premium: PREMIUM_EMAILS have it without paying; others don\'t', async () => {

		assert.equal( ( await premiumOf( alice ) ).unlocked, false );
		assert.equal( ( await premiumOf( bob ) ).unlocked, false );
		const dana = await signedIn( { sub: '1004', email: 'dana@neptune.example', hd: 'neptune.example' } );
		const premium = await premiumOf( dana );
		assert.deepEqual( premium, { enabled: true, link: PAYMENT_LINK, price: PRICE, unlocked: true, clientReferenceId: premium.clientReferenceId } );

	} );

	test( 'webhook: a paid checkout through the link unlocks premium for the account the app named', async () => {

		const reference = ( await premiumOf( alice ) ).clientReferenceId;
		// Paid with another email: the account named on the link is what counts.
		alicePurchase = checkout( { client_reference_id: reference, customer_details: { email: 'accounts@alice-company.example' } } );
		const res = await stripe( 'checkout.session.completed', alicePurchase );
		assert.equal( res.status, 200 );
		assert.deepEqual( res.body, { received: true } );
		assert.equal( ( await premiumOf( alice ) ).unlocked, true );
		assert.equal( ( await alice.send( 'GET', '/api/config' ) ).body.premium.unlocked, true );
		assert.equal( ( await premiumOf( bob ) ).unlocked, false );

	} );

	test( 'webhook: wrong, stale, missing or tampered signatures are refused', async () => {

		const reference = ( await premiumOf( bob ) ).clientReferenceId;
		const event = JSON.stringify( { id: 'evt_forged', type: 'checkout.session.completed', data: { object: checkout( { client_reference_id: reference } ) } } );
		const now = Math.floor( Date.now() / 1000 );
		const valid = stripeSignature( event, WEBHOOK_SECRET );
		const cases = {
			'wrong secret': stripeSignature( event, 'whsec_someone_elses_secret' ),
			'stale timestamp': stripeSignature( event, WEBHOOK_SECRET, now - 360 ),
			'timestamp from the future': stripeSignature( event, WEBHOOK_SECRET, now + 360 ),
			'no timestamp': valid.replace( /^t=\d+,/, '' ),
			'only a v0 signature': valid.replace( 'v1=', 'v0=' ),
			'signature cut short': valid.slice( 0, - 2 ),
			'garbage': 'nonsense',
			'empty': '',
		};
		for ( const [ name, signature ] of Object.entries( cases ) ) assert.equal( ( await stripe( null, null, { body: event, signature } ) ).status, 400, name );
		assert.equal( ( await stripe( null, null, { body: event.replace( 'evt_forged', 'evt_forged_again' ), signature: valid } ) ).status, 400, 'body changed after signing' );
		const unsigned = await client().send( 'POST', '/api/stripe/webhook', { body: event, origin: null } );
		assert.equal( unsigned.status, 400, 'no Stripe-Signature' );
		assert.equal( ( await premiumOf( bob ) ).unlocked, false );

		// While a secret is being rolled Stripe sends a v1 for each; any may match.
		const other = stripeSignature( event, 'whsec_the_old_secret' ).split( ',' )[ 1 ];
		const rolled = await stripe( null, null, { body: event, signature: `${ valid },${ other }`.replace( /^(t=\d+),(v1=\w+),(v1=\w+)$/, '$1,$3,$2' ) } );
		assert.equal( rolled.status, 200 );
		assert.equal( ( await premiumOf( bob ) ).unlocked, true );

		// Undo it with a full refund, for the tests below.
		await stripe( 'charge.refunded', { id: 'ch_forged', object: 'charge', payment_intent: JSON.parse( event ).data.object.payment_intent, refunded: true } );
		assert.equal( ( await premiumOf( bob ) ).unlocked, false );

	} );

	test( 'webhook: other payment links, unpaid checkouts and other events are left alone', async () => {

		const reference = ( await premiumOf( bob ) ).clientReferenceId;
		// The account sells other things too: their checkouts come through the same webhook.
		for ( const fields of [ { payment_link: 'plink_SomethingElse' }, { payment_link: null }, { payment_status: 'unpaid' }, { payment_status: 'no_payment_required' } ] ) {

			const res = await stripe( 'checkout.session.completed', checkout( { client_reference_id: reference, ...fields } ) );
			assert.equal( res.status, 200, JSON.stringify( fields ) );

		}

		for ( const type of [ 'customer.created', 'payment_intent.succeeded', 'checkout.session.expired', 'invoice.paid' ] ) {

			assert.equal( ( await stripe( type, checkout( { client_reference_id: reference } ) ) ).status, 200, type );

		}

		assert.equal( ( await stripe( 'checkout.session.async_payment_failed', checkout( { client_reference_id: reference, payment_status: 'unpaid' } ) ) ).status, 200 );
		assert.equal( ( await premiumOf( bob ) ).unlocked, false );

	} );

	test( 'webhook: a bank payment that completes later unlocks once it arrives, matched by email', async () => {

		// No reference (bought from the link itself, say) but the email of Bob's account.
		const purchase = checkout( { payment_status: 'unpaid', customer_details: { email: ' Bob@Example.com ' } } );
		assert.equal( ( await stripe( 'checkout.session.completed', purchase ) ).status, 200 );
		assert.equal( ( await premiumOf( bob ) ).unlocked, false );
		assert.equal( ( await stripe( 'checkout.session.async_payment_succeeded', { ...purchase, payment_status: 'paid' } ) ).status, 200 );
		assert.equal( ( await premiumOf( bob ) ).unlocked, true );

	} );

	test( 'webhook: the same event twice is recorded once', async () => {

		for ( let i = 0; i < 2; i ++ ) assert.equal( ( await stripe( 'checkout.session.completed', alicePurchase ) ).status, 200 );
		assert.equal( ( await premiumOf( alice ) ).unlocked, true );
		if ( server.query ) {

			const rows = await server.query( 'SELECT user_id, email FROM purchases WHERE checkout_session = $1', [ alicePurchase.id ] );
			assert.equal( rows.length, 1 );
			assert.equal( rows[ 0 ].email, 'accounts@alice-company.example' );

		}

	} );

	test( 'webhook: bought before signing in here, it\'s theirs when they sign in with that email', async () => {

		// An unknown reference (from another copy of the site, say) falls back to the email.
		const purchase = checkout( { client_reference_id: '999999', customer_details: { email: 'Hank@Neptune.example' } } );
		assert.equal( ( await stripe( 'checkout.session.completed', purchase ) ).status, 200 );
		const browser = client();
		const res = await browser.send( 'POST', '/api/session', { body: { credential: await makeToken( googleKey, { sub: '1010', email: 'hank@neptune.example', hd: 'neptune.example', name: 'Hank Hill' } ) } } );
		assert.equal( res.status, 200 );
		assert.equal( res.body.premium.unlocked, true );
		assert.equal( ( await premiumOf( browser ) ).unlocked, true );
		// Somebody else with no purchase stays as they were.
		const ivy = await signedIn( { sub: '1011', email: 'ivy@neptune.example', hd: 'neptune.example' } );
		assert.equal( ( await premiumOf( ivy ) ).unlocked, false );

	} );

	test( 'webhook: a full refund takes premium away; a partial one doesn\'t', async () => {

		const charge = { id: 'ch_test_alice', object: 'charge', payment_intent: alicePurchase.payment_intent, amount: 1900 };
		assert.equal( ( await stripe( 'charge.refunded', { ...charge, amount_refunded: 500, refunded: false } ) ).status, 200 );
		assert.equal( ( await premiumOf( alice ) ).unlocked, true );
		// Refunds of anything else the account sells change nothing here.
		assert.equal( ( await stripe( 'charge.refunded', { ...charge, payment_intent: 'pi_something_else', refunded: true } ) ).status, 200 );
		assert.equal( ( await premiumOf( alice ) ).unlocked, true );
		assert.equal( ( await stripe( 'charge.refunded', { ...charge, amount_refunded: 1900, refunded: true } ) ).status, 200 );
		assert.equal( ( await premiumOf( alice ) ).unlocked, false );
		// The checkout arriving again doesn't bring it back.
		assert.equal( ( await stripe( 'checkout.session.completed', alicePurchase ) ).status, 200 );
		assert.equal( ( await premiumOf( alice ) ).unlocked, false );
		assert.equal( ( await premiumOf( bob ) ).unlocked, true );

	} );

	test( 'webhook: the only route without the cross-site check, and its body is capped', async () => {

		// Stripe sends no Origin, and one from anywhere changes nothing: the signature decides.
		const signedFromElsewhere = await stripe( 'customer.created', { id: 'cus_test' }, { origin: 'https://evil.example' } );
		assert.equal( signedFromElsewhere.status, 200 );
		assert.equal( ( await stripe( 'customer.created', { id: 'cus_test' }, { secret: 'whsec_wrong', origin: 'https://evil.example' } ) ).status, 400 );

		// Everything else that changes something still needs this site's Origin.
		const routes = [
			[ 'POST', '/api/session', { credential: await makeToken( googleKey ) } ],
			[ 'DELETE', '/api/session', {} ],
			[ 'POST', '/api/layouts', { site: SITE, name: 'Forged', data: layoutData() } ],
			[ 'PUT', '/api/layouts/AAAAAAAAAAAAAAAA', { name: 'Forged' } ],
			[ 'DELETE', '/api/layouts/AAAAAAAAAAAAAAAA', {} ],
			[ 'POST', '/api/layouts/AAAAAAAAAAAAAAAA/share', {} ],
			[ 'DELETE', '/api/layouts/AAAAAAAAAAAAAAAA/share', {} ],
		];
		for ( const [ method, path, body ] of routes ) {

			assert.equal( ( await bob.send( method, path, { body, origin: null } ) ).status, 403, `${ method } ${ path }` );
			assert.equal( ( await bob.send( method, path, { body, origin: 'https://evil.example', headers: { 'Stripe-Signature': stripeSignature( JSON.stringify( body ), WEBHOOK_SECRET ) } } ) ).status, 403, `${ method } ${ path } signed` );

		}

		const huge = JSON.stringify( { type: 'customer.created', data: { object: { id: 'cus_test', note: 'x'.repeat( 300 * 1024 ) } } } );
		assert.equal( ( await stripe( null, null, { body: huge } ) ).status, 413 );

	} );

	test( 'signing out ends the session on the server', async () => {

		const cookie = alice.cookie;
		const res = await alice.send( 'DELETE', '/api/session', { body: {} } );
		assert.equal( res.status, 204 );
		assert.match( res.setCookie, new RegExp( `^${ server.cookieName }=; Max-Age=0;` ) );
		assert.equal( ( await alice.send( 'GET', '/api/config' ) ).body.signedIn, false );

		// The old cookie is useless even if someone kept a copy.
		const copy = client();
		copy.cookie = cookie;
		assert.equal( ( await copy.send( 'GET', '/api/me' ) ).status, 401 );

	} );

}

// The parts only the Vercel entry has: rebuilding the address after the rewrite, settings from the
// environment, no database, and premium left off until Stripe is fully set up.
function vercelTests() {

	const local = { googleClientId: '', signedIn: false, premium: { enabled: false } };

	test( 'the rewritten address is put back as the browser asked for it', () => {

		const cases = [
			[ 'http://function.internal/api?__path=layouts/abc/share&site=Neptune+Terminals', 'twin.example.app', 'https', 'https://twin.example.app/api/layouts/abc/share?site=Neptune+Terminals' ],
			[ 'http://function.internal/api?site=x&__path=config&view=tok', 'twin.example.app', 'https', 'https://twin.example.app/api/config?site=x&view=tok' ],
			// The rewrite left the address alone: taken as it is.
			[ 'https://twin.example.app/api/me?x=1', null, null, 'https://twin.example.app/api/me?x=1' ],
			[ 'https://twin.example.app/api', null, null, 'https://twin.example.app/api/' ],
			[ 'http://localhost:3000/api?__path=', 'localhost:3000', 'http', 'http://localhost:3000/api/' ],
			[ 'http://function.internal/api?__path=/me', 'a.example, b.example', 'https,http', 'https://a.example/api/me' ],
			// Only http and https.
			[ 'https://twin.example.app/api/me', null, 'ftp', 'https://twin.example.app/api/me' ],
		];
		for ( const [ address, host, proto, expected ] of cases ) {

			const headers = {};
			if ( host ) headers[ 'X-Forwarded-Host' ] = host;
			if ( proto ) headers[ 'X-Forwarded-Proto' ] = proto;
			assert.equal( publicUrl( new Request( address, { headers } ) ).href, expected, address );

		}

		const request = rewritten( 'https://twin.example.app', '/api/layouts?site=Neptune%20Terminals' );
		assert.equal( new URL( request.url ).searchParams.get( '__path' ), 'layouts' );
		assert.equal( publicUrl( request ).href, 'https://twin.example.app/api/layouts?site=Neptune+Terminals' );

	} );

	test( 'a database error is logged without the connection string or its password', async t => {

		// Neon's driver quotes the whole address in its error when it isn't a valid URL (pasted with
		// its quotes, say). That fails before anything is sent, so nothing leaves this machine.
		const password = 'made-up-password-0123';
		const env = { DATABASE_URL: `"postgres://twin:${ password }@db.invalid/neondb"`, GOOGLE_CLIENT_ID: CLIENT_ID };
		const api = vercelApi( { getEnv: () => env } );
		const logged = [];
		t.mock.method( console, 'error', ( ...args ) => logged.push( args.join( ' ' ) ) );
		const res = await api.fetch( rewritten( PUBLIC_ORIGIN, '/api/shared/AAAAAAAAAAAAAAAAAAAAAA' ) );
		assert.equal( res.status, 500 );
		assert.deepEqual( await res.json(), { error: 'Something went wrong' } );
		assert.equal( logged.length, 1 );
		assert.ok( ! logged[ 0 ].includes( password ), 'the password was logged' );
		assert.ok( ! logged[ 0 ].includes( 'db.invalid' ), 'the address was logged' );
		assert.match( logged[ 0 ], /DatabaseError/ );

	} );

	test( 'SQL placeholders become Postgres\'s', () => {

		assert.equal( toPostgres( 'SELECT ? , ?, ?' ), 'SELECT $1 , $2, $3' );
		assert.equal( toPostgres( 'VALUES ( ?1, ?2, ?7, ?7 ) WHERE a = ?' ), 'VALUES ( $1, $2, $7, $7 ) WHERE a = $8' );
		assert.equal( toPostgres( 'SELECT \'?\', "a?" FROM t WHERE x = ? -- why?\nAND y = ?' ), 'SELECT \'?\', "a?" FROM t WHERE x = $1 -- why?\nAND y = $2' );
		assert.equal( toPostgres( 'SELECT \'it\'\'s ?\' WHERE x = ?' ), 'SELECT \'it\'\'s ?\' WHERE x = $1' );

	} );

	test( 'the deployed entry without a database runs the site without accounts', async () => {

		// What api/index.js reads is process.env. A client id, a Maps key and Stripe settings
		// without a database still mean no accounts, and the key isn't handed out. (This process
		// starts nothing after this, so the variables aren't put back.)
		for ( const name of [ 'DATABASE_URL', 'POSTGRES_URL' ] ) delete process.env[ name ];
		Object.assign( process.env, { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_MAPS_API_KEY: MAPS_KEY, STRIPE_PAYMENT_LINK: PAYMENT_LINK, STRIPE_PAYMENT_LINK_ID: PAYMENT_LINK_ID, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } );
		const { default: api } = await import( '../api/index.js' );
		const send = ( method, path, init = {} ) => api.fetch( rewritten( PUBLIC_ORIGIN, path, { method, ...init } ) );
		const config = await send( 'GET', '/api/config?view=AAAAAAAAAAAAAAAAAAAAAA' );
		assert.equal( config.status, 200 );
		assert.deepEqual( await config.json(), local );
		const json = { headers: { Origin: PUBLIC_ORIGIN, 'Content-Type': 'application/json' }, body: '{}' };
		for ( const [ method, path, init ] of [ [ 'POST', '/api/session', json ], [ 'GET', '/api/me' ], [ 'GET', '/api/layouts' ], [ 'GET', '/api/shared/AAAAAAAAAAAAAAAAAAAAAA' ], [ 'POST', '/api/stripe/webhook', json ] ] ) {

			const res = await send( method, path, init );
			assert.equal( res.status, 503, `${ method } ${ path }` );
			assert.deepEqual( await res.json(), { error: 'Accounts aren\'t set up' } );

		}

		assert.equal( ( await send( 'GET', '/api/nothing' ) ).status, 404 );

		// A database but no sign-in client: the same, before the database is ever asked anything
		// (the address goes nowhere, so asking would fail).
		process.env.DATABASE_URL = 'postgres://test:test@db.invalid/neondb';
		process.env.GOOGLE_CLIENT_ID = '';
		assert.deepEqual( await ( await send( 'GET', '/api/config' ) ).json(), local );
		assert.equal( ( await send( 'GET', '/api/layouts' ) ).status, 503 );
		for ( const name of [ 'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_MAPS_API_KEY', 'STRIPE_PAYMENT_LINK', 'STRIPE_PAYMENT_LINK_ID', 'STRIPE_WEBHOOK_SECRET' ] ) delete process.env[ name ];

	} );

	test( 'premium stays off until the link, its id and the webhook secret are all set', async () => {

		const full = { STRIPE_PAYMENT_LINK: PAYMENT_LINK, STRIPE_PAYMENT_LINK_ID: PAYMENT_LINK_ID, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
		assert.deepEqual( premiumSettings( { ...full, PREMIUM_PRICE: ' CA$19, one time\n' } ), { link: PAYMENT_LINK, linkId: PAYMENT_LINK_ID, secret: WEBHOOK_SECRET, price: PRICE } );
		const off = [
			{},
			{ ...full, STRIPE_WEBHOOK_SECRET: '' },
			{ ...full, STRIPE_PAYMENT_LINK_ID: '' },
			{ ...full, STRIPE_PAYMENT_LINK: '' },
			{ ...full, STRIPE_PAYMENT_LINK: 'not a link' },
			{ ...full, STRIPE_PAYMENT_LINK: 'http://buy.stripe.com/test_abc' },
			{ ...full, STRIPE_PAYMENT_LINK_ID: 'prod_NotALink' },
			// The account's secret API key pasted in the wrong place.
			{ ...full, STRIPE_WEBHOOK_SECRET: 'sk_test_not_a_webhook_secret' },
		];
		for ( const vars of off ) assert.equal( premiumSettings( vars ), null, JSON.stringify( vars ) );

		// And through the API, with everything but the secret.
		const key = await makeKey( 'settings-key' );
		const keys = await serveKeys( [ key.jwk ] );
		const server = await startVercelApi( { origin: PUBLIC_ORIGIN, vars: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_JWKS_URL: keys.url, PREMIUM_EMAILS: 'alice@example.com', ...full, STRIPE_WEBHOOK_SECRET: '' } } );
		try {

			assert.deepEqual( ( await ( await server.fetch( '/api/config' ) ).json() ).premium, { enabled: false } );
			const signIn = await server.fetch( '/api/session', { method: 'POST', headers: { Origin: PUBLIC_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify( { credential: await makeToken( key ) } ) } );
			assert.equal( signIn.status, 200 );
			assert.deepEqual( ( await signIn.json() ).premium, { enabled: false } );
			const body = JSON.stringify( { type: 'customer.created', data: { object: {} } } );
			const webhook = await server.fetch( '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': stripeSignature( body, WEBHOOK_SECRET ) }, body } );
			assert.equal( webhook.status, 503 );

		} finally {

			server.stop();
			keys.close();

		}

	} );

}
