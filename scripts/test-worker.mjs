// npm run test:worker: checks the Worker's API (worker/index.js) against `wrangler dev` on this
// machine, with a throwaway database and test keys standing in for Google's. Nothing is sent to
// Google or Cloudflare. Use another port with TEST_WORKER_PORT=8790 npm run test:worker

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker } from './worker-harness.mjs';

const PORT = Number( process.env.TEST_WORKER_PORT ) || 8788;
const SITE = 'Neptune Terminals';
const MAPS_KEY = 'test-maps-key';

let worker;
let keys;
let googleKey;
let otherKey;

before( async () => {

	googleKey = await makeKey( 'test-key-1' );
	// Not in the key set: tokens signed with it are forgeries.
	otherKey = await makeKey( 'test-key-1' );
	keys = await serveKeys( [ googleKey.jwk ] );
	worker = await startWorker( {
		port: PORT,
		vars: {
			GOOGLE_CLIENT_ID: CLIENT_ID,
			GOOGLE_JWKS_URL: keys.url,
			GOOGLE_MAPS_API_KEY: MAPS_KEY,
			ALLOWED_EMAILS: ' Alice@Example.com, bob@example.com ',
			ALLOWED_DOMAINS: 'neptune.example',
		},
	} );

} );

after( () => {

	worker?.stop();
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
		async send( method, path, { body, origin = worker.base, type = 'application/json', headers = {} } = {} ) {

			const init = { method, headers: { ...headers } };
			if ( origin ) init.headers.Origin = origin;
			if ( cookie ) init.headers.Cookie = cookie;
			if ( body !== undefined ) {

				init.body = typeof body === 'string' ? body : JSON.stringify( body );
				if ( type ) init.headers[ 'Content-Type' ] = type;

			}

			const res = await fetch( worker.base + path, init );
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

const layoutData = ( items = 2 ) => ( {
	version: 2,
	site: SITE,
	items: Array.from( { length: items }, ( _, i ) => ( { name: `Barrier ${ i }`, procedural: 'jersey-barrier', east: i * 3, north: 10, up: null, heading: 90, scale: 1, library: 'jersey-barrier' } ) ),
	extras: {},
} );

let alice;
let bob;
let aliceLayout;

test( 'config when signed out names the client and keeps the Maps key back', async () => {

	const res = await client().send( 'GET', '/api/config' );
	assert.equal( res.status, 200 );
	assert.deepEqual( res.body, { googleClientId: CLIENT_ID, signedIn: false } );
	assert.equal( res.headers.get( 'Cache-Control' ), 'no-store' );

} );

test( 'signing in with a valid token sets a session cookie', async () => {

	const browser = client();
	const res = await browser.send( 'POST', '/api/session', { body: { credential: await makeToken( googleKey ) } } );
	assert.equal( res.status, 200 );
	assert.deepEqual( res.body.user, { name: 'Alice Example', firstName: 'Alice', email: 'alice@example.com', picture: '' } );
	assert.equal( res.body.hasMapsKey, true );
	const attributes = res.setCookie.split( ';' ).map( s => s.trim() );
	assert.match( attributes[ 0 ], /^twin_session=[A-Za-z0-9_-]{43}$/ );
	for ( const attribute of [ 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000' ] ) assert.ok( attributes.includes( attribute ), attribute );
	// Plain http on 127.0.0.1 is local development, where a Secure cookie wouldn't be kept.
	assert.ok( ! attributes.includes( 'Secure' ) );

	const me = await browser.send( 'GET', '/api/me' );
	assert.equal( me.status, 200 );
	assert.equal( me.body.user.email, 'alice@example.com' );
	const config = await browser.send( 'GET', '/api/config' );
	assert.equal( config.body.signedIn, true );
	assert.equal( config.body.mapsKey, MAPS_KEY );
	assert.equal( config.body.user.firstName, 'Alice' );
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
	anonymous.cookie = `twin_session=${ 'A'.repeat( 43 ) }`;
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
	const page = await fetch( `${ worker.base }/` );
	assert.equal( page.status, 200 );
	assert.match( await page.text(), /test site/ );

} );

test( 'signing out ends the session on the server', async () => {

	const cookie = alice.cookie;
	const res = await alice.send( 'DELETE', '/api/session', { body: {} } );
	assert.equal( res.status, 204 );
	assert.match( res.setCookie, /^twin_session=; Max-Age=0;/ );
	assert.equal( ( await alice.send( 'GET', '/api/config' ) ).body.signedIn, false );

	// The old cookie is useless even if someone kept a copy.
	const copy = client();
	copy.cookie = cookie;
	assert.equal( ( await copy.send( 'GET', '/api/me' ) ).status, 401 );

} );
