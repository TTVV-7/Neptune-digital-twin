// npm run test:build-mcp: World Drive Build's MCP server (worker/drive/mcp.js) and its OAuth
// (worker/drive/oauth.js) in World Drive's Worker under wrangler dev, end to end as Claude uses them:
// /mcp's 401 points to the metadata; the client registers, the person signs in and allows it (only
// Build Pro and the owner can), the code and PKCE verifier become tokens, and every tool lays out a
// project, which then opens in the real editor (/build/app/) in a browser with what was placed. And:
// codes are used once, refresh tokens are replaced, signing out everywhere disconnects, a plan that
// lapses stops the tools, and the hourly limit holds.
//
// Needs Playwright with Chromium, and the built site (npm run build:drive; built if missing).

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { after, before, test } from 'node:test';
import { CLIENT_ID, ROOT, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_BUILD_MCP_PORT ) || 8784;
const DIST = join( ROOT, 'dist-drive', 'build' );
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const WEBHOOK_SECRET = 'whsec_test_mcp';
const BUILD_LINK_ID = 'plink_build0000000000000001';
const HOURLY = 80;

let server;
let keys;
let googleKey;
let upstream;
let client;
let tokens;
let project;
let browser;

const b64url = buffer => buffer.toString( 'base64' ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );

async function call( path, { method = 'GET', body, headers = {}, form } = {} ) {

	const sent = { ...headers };
	let payload;
	if ( form ) {

		sent[ 'Content-Type' ] = 'application/x-www-form-urlencoded';
		payload = new URLSearchParams( form ).toString();

	} else if ( body !== undefined ) {

		sent[ 'Content-Type' ] = 'application/json';
		payload = JSON.stringify( body );

	}

	const res = await fetch( server.base + path, { method, headers: sent, body: payload, redirect: 'manual' } );
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

	const res = await call( '/build/api/session', { method: 'POST', body: { credential: await makeToken( googleKey, claims ) }, headers: { Origin: server.base } } );
	const token = /^__Host-wd_session=([\w-]{43});/.exec( res.headers.get( 'Set-Cookie' ) ?? '' )?.[ 1 ];
	assert.ok( token, res.text );
	return `__Host-wd_session=${ token }`;

}

// The whole of connecting, as Claude does it, for the account signed in with `cookie`: { tokens } or
// the authorize page's answer when it doesn't allow.
async function connect( cookie ) {

	const verifier = b64url( randomBytes( 32 ) );
	const challenge = b64url( createHash( 'sha256' ).update( verifier ).digest() );
	const params = { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'build', resource: `${ server.base }/mcp` };
	const page = await call( `/oauth/authorize?${ new URLSearchParams( params ) }`, { headers: { Cookie: cookie } } );
	if ( ! page.text.includes( 'name="decision" value="allow"' ) ) return { page };
	const allowed = await call( '/oauth/authorize', { method: 'POST', form: { ...params, decision: 'allow' }, headers: { Cookie: cookie, Origin: server.base } } );
	assert.equal( allowed.status, 302, allowed.text );
	const back = new URL( allowed.headers.get( 'Location' ) );
	assert.equal( back.origin + back.pathname, REDIRECT );
	assert.equal( back.searchParams.get( 'state' ), 'xyz' );
	const code = back.searchParams.get( 'code' );
	const exchanged = await call( '/oauth/token', { method: 'POST', form: { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier } } );
	assert.equal( exchanged.status, 200, exchanged.text );
	return { tokens: exchanged.json, code, verifier };

}

let rpcId = 0;
async function rpc( method, params, token = tokens.access_token ) {

	const res = await call( '/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: ++ rpcId, method, params }, headers: { Authorization: `Bearer ${ token }`, Accept: 'application/json, text/event-stream' } } );
	assert.equal( res.status, 200, res.text );
	return res.json.result;

}

async function tool( name, args, token ) {

	const result = await rpc( 'tools/call', { name, arguments: args }, token );
	const text = result.content[ 0 ].text;
	let value = text;
	try {

		value = JSON.parse( text );

	} catch {

		// Words.

	}

	return { error: !! result.isError, text, value };

}

async function webhook( event ) {

	const body = JSON.stringify( event );
	const res = await call( '/api/stripe/webhook', { method: 'POST', body: event, headers: { 'Stripe-Signature': stripeSignature( body, WEBHOOK_SECRET ) } } );
	assert.equal( res.status, 200, res.text );
	return res;

}

function assetsOf() {

	const files = {};
	const add = path => files[ join( 'build', relative( DIST, path ) ) ] = readFileSync( path );
	const walk = dir => {

		for ( const name of readdirSync( dir ) ) {

			const path = join( dir, name );
			if ( statSync( path ).isDirectory() ) walk( path );
			else add( path );

		}

	};

	add( join( DIST, 'app', 'index.html' ) );
	add( join( DIST, 'app', 'google-maps-logo.svg' ) );
	walk( join( DIST, 'app', 'assets' ) );
	add( join( DIST, 'app', 'library', 'library.json' ) );
	add( join( DIST, 'app', 'library', 'traffic-cone.glb' ) );
	return files;

}

before( async () => {

	if ( ! existsSync( join( DIST, 'app', 'index.html' ) ) ) {

		const built = spawnSync( process.execPath, [ join( ROOT, 'node_modules', 'vite', 'bin', 'vite.js' ), 'build', '--config', 'vite.drive.config.js', '--logLevel', 'error' ], { cwd: ROOT, encoding: 'utf8' } );
		assert.equal( built.status, 0, built.stderr );

	}

	upstream = createServer( ( req, res ) => {

		res.setHeader( 'Content-Type', 'application/json' );
		res.end( JSON.stringify( [ { lat: '49.2827', lon: '-123.1207', display_name: 'Vancouver City Hall, West 12th Avenue, Vancouver, British Columbia, Canada', type: 'townhall' } ] ) );

	} );
	await new Promise( resolve => upstream.listen( 0, '127.0.0.1', resolve ) );
	googleKey = await makeKey( 'mcp-test-key-1' );
	keys = await serveKeys( [ googleKey.jwk ] );
	server = await startWorker( {
		port: PORT,
		config: 'wrangler.drive.jsonc',
		vars: {
			GOOGLE_MAPS_API_KEY: 'test-maps-key-not-real',
			GOOGLE_CLIENT_ID: CLIENT_ID,
			GOOGLE_JWKS_URL: keys.url,
			STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
			SUPPORTER_PAYMENT_LINK: 'https://buy.stripe.com/test_pass',
			SUPPORTER_PAYMENT_LINK_ID: '',
			BUILD_PAYMENT_LINK: 'https://buy.stripe.com/test_build',
			BUILD_PAYMENT_LINK_ID: BUILD_LINK_ID,
			ADMIN_EMAILS: 'boss@example.com',
			MCP_HOURLY: String( HOURLY ),
			BUILD_LAYOUT_LIMIT: '2',
			SEARCH_UPSTREAM: `http://127.0.0.1:${ upstream.address().port }/search`,
		},
		assets: assetsOf(),
	} );

} );

after( async () => {

	await browser?.close();
	server?.stop();
	keys?.close();
	upstream?.close();

} );

test( 'without a token, /mcp says where to connect; the metadata says how', async () => {

	const res = await call( '/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } } );
	assert.equal( res.status, 401 );
	// (Under wrangler dev, /.well-known/ requests reach the Worker addressed to the route's host,
	// worlddrive.app; on the site every address is worlddrive.app's.)
	const meta = await call( '/.well-known/oauth-authorization-server' );
	const site = meta.json.issuer;
	assert.match( site, /^https?:\/\/(127\.0\.0\.1:\d+|worlddrive\.app)$/ );
	assert.match( res.headers.get( 'WWW-Authenticate' ), /^Bearer resource_metadata="https?:\/\/[^/"]+\/\.well-known\/oauth-protected-resource"$/ );
	const resource = await call( '/.well-known/oauth-protected-resource' );
	assert.deepEqual( resource.json.authorization_servers, [ site ] );
	assert.equal( resource.json.resource, `${ site }/mcp` );
	assert.equal( meta.json.token_endpoint, `${ site }/oauth/token` );
	assert.deepEqual( meta.json.code_challenge_methods_supported, [ 'S256' ] );
	assert.equal( ( await call( '/mcp' ) ).status, 405, 'no event stream: POST only' );

} );

test( 'a client registers itself; bad redirects are refused', async () => {

	const bad = await call( '/oauth/register', { method: 'POST', body: { redirect_uris: [ 'http://evil.example/cb' ], client_name: 'x' } } );
	assert.equal( bad.status, 400 );
	const res = await call( '/oauth/register', { method: 'POST', body: { redirect_uris: [ REDIRECT ], client_name: 'Claude <script>' } } );
	assert.equal( res.status, 201, res.text );
	client = res.json;
	assert.match( client.client_id, /^[\w-]{22}$/ );
	assert.equal( client.token_endpoint_auth_method, 'none' );

} );

test( 'the authorize page: sign in first; the free plan can\'t; names are shown safely', async () => {

	const params = new URLSearchParams( { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: 'a'.repeat( 43 ), code_challenge_method: 'S256' } );
	const signedOut = await call( `/oauth/authorize?${ params }` );
	assert.equal( signedOut.status, 200 );
	assert.match( signedOut.text, /Sign in with the Google account/ );
	assert.ok( signedOut.text.includes( 'Claude &lt;script&gt;' ) && ! signedOut.text.includes( 'Claude <script>' ), 'the client\'s name is escaped' );
	const wrongRedirect = await call( `/oauth/authorize?${ new URLSearchParams( { ...Object.fromEntries( params ), redirect_uri: 'https://claude.ai/other' } ) }` );
	assert.match( wrongRedirect.text, /didn&#39;t register/ );
	const free = await signIn( { sub: 'mcp-free', email: 'free@example.com', name: 'Fran Free' } );
	const { page } = await connect( free );
	assert.match( page.text, /comes with <strong>Build Pro<\/strong>/ );

} );

test( 'Build Pro connects: allowed, the code becomes tokens once, with the right verifier only', async () => {

	const cookie = await signIn( { sub: 'mcp-pro', email: 'pro@example.com', name: 'Pat Pro' } );
	const me = await call( '/build/api/me', { headers: { Cookie: cookie } } );
	await webhook( { id: 'evt_pro', object: 'event', type: 'checkout.session.completed', livemode: false, data: { object: {
		id: 'cs_test_pro', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 500, currency: 'usd',
		client_reference_id: me.json.premium.clientReferenceId, customer_details: { email: 'pro@example.com' }, payment_intent: 'pi_pro', payment_link: BUILD_LINK_ID, subscription: 'sub_pro',
	} } } );
	const plan = await call( '/build/api/me', { headers: { Cookie: cookie } } );
	assert.equal( plan.json.plan.tier, 'pro', plan.text );
	const connected = await connect( cookie );
	assert.ok( connected.tokens, connected.page?.text.slice( -600 ) );
	tokens = connected.tokens;
	assert.equal( tokens.token_type, 'Bearer' );
	assert.equal( tokens.expires_in, 3600 );
	assert.ok( tokens.refresh_token );
	const again = await call( '/oauth/token', { method: 'POST', form: { grant_type: 'authorization_code', code: connected.code, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: connected.verifier } } );
	assert.equal( again.json.error, 'invalid_grant', 'a code is used once' );

} );

test( 'initialize, tools/list and a notification', async () => {

	const init = await rpc( 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } );
	assert.equal( init.protocolVersion, '2025-06-18' );
	assert.equal( init.serverInfo.name, 'world-drive-build' );
	assert.match( init.instructions, /find_site/ );
	const { tools } = await rpc( 'tools/list', {} );
	assert.deepEqual( tools.map( t => t.name ), [ 'find_site', 'create_project', 'list_projects', 'get_project', 'search_library', 'list_sets', 'place_items', 'place_set', 'place_row', 'add_flatten_area', 'add_laydown_area', 'add_stockpile', 'move_item', 'remove_items', 'share_project' ] );
	for ( const t of tools ) assert.equal( t.inputSchema.type, 'object', t.name );
	const note = await call( '/mcp', { method: 'POST', body: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers: { Authorization: `Bearer ${ tokens.access_token }` } } );
	assert.equal( note.status, 202 );

} );

test( 'the tools lay out a site', async () => {

	const site = await tool( 'find_site', { query: 'Vancouver City Hall' } );
	assert.equal( site.value[ 0 ].lat, 49.2827 );
	const made = await tool( 'create_project', { name: 'City hall staging', place: 'Vancouver City Hall', lat: site.value[ 0 ].lat, lon: site.value[ 0 ].lon } );
	assert.equal( made.error, false, made.text );
	project = made.value.project_id;
	assert.match( made.value.editor, /\/build\/app\/\?at=49\.282700%2C-123\.120700&place=Vancouver\+City\+Hall&project=/ );

	// Projects Claude makes keep to the account's limit as the editor's do (BUILD_LAYOUT_LIMIT here 2).
	assert.equal( ( await tool( 'create_project', { name: 'Second', place: 'Vancouver City Hall', lat: 49.2827, lon: - 123.1207 } ) ).error, false );
	assert.match( ( await tool( 'create_project', { name: 'Third', place: 'Vancouver City Hall', lat: 49.2827, lon: - 123.1207 } ) ).text, /as many projects as it can/ );

	const lib = await tool( 'search_library', { query: 'office trailer' } );
	assert.ok( lib.value.some( i => i.id === 'office-trailer-10x40' && i.size.length > 3 ), lib.text );
	assert.ok( ( await tool( 'search_library', {} ) ).value.categories.Vehicles > 10 );
	assert.ok( ( await tool( 'list_sets', {} ) ).value.some( s => s.id === 'set-site-office' ) );
	// A tower crane stands by its mast, not the middle of its size: Claude is told so.
	assert.match( ( await tool( 'search_library', { query: 'tower crane' } ) ).value.find( i => i.id === 'tower-crane' ).placed, /by its mast.*51 m the way it faces.*16 m behind/ );

	const placed = await tool( 'place_items', { project_id: project, items: [
		{ item: 'office-trailer-10x40', east: 0, north: 20, heading: 180 },
		{ item: 'worker-standing', east: 3, north: 14 },
		{ item: 'traffic-cone', east: 6, north: 10 },
	] } );
	assert.match( placed.text, /Placed 3/ );
	assert.ok( ( await tool( 'place_items', { project_id: project, items: [ { item: 'no-such-thing', east: 0, north: 0 } ] } ) ).error );
	assert.match( ( await tool( 'place_set', { project_id: project, set_id: 'set-lane-closure', east: - 30, north: 0, heading: 90 } ) ).text, /Placed Lane closure/ );
	// A 30.5 m fence line, panels sharing their feet (10 ft apart, not their 3.25 m box), each along
	// the line by its width, what's over split between the ends.
	const row = await tool( 'place_row', { project_id: project, item: 'fence-panel', points: [ [ 10, 0 ], [ 10, 30.5 ] ] } );
	assert.match( row.text, /row of 10 ×/ );
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 0, north: 20, width: 30, length: 20, surface: 'asphalt', fence: 'screened', entrances: 2 } ) ).text, /surfaced with asphalt, fenced \(green privacy screen\) with 2 entrances/ );
	// Graded: falling 3% to its left, edges battered 3 : 1; out-of-range numbers are clamped and
	// unknown grades refused. Without a grade, a new area follows the ground.
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 60, north: 20, width: 40, length: 25, grade: 'slope', fall: 3, toward: 'left', batter: 3 } ) ).text, /surfaced with gravel, falling 3% to the left, edges battered 3 : 1/ );
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 60, north: 60, width: 20, length: 20, grade: 'terraces', steps: 40 } ) ).text, /in 8 terraces/ );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 60, north: 90, width: 20, length: 20, grade: 'bumpy' } ) ).error );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 60, north: 90, width: 20, length: 20, grade: 'slope', toward: 'uphill' } ) ).error );
	assert.match( ( await tool( 'add_laydown_area', { project_id: project, east: 25, north: 25, width: 15, length: 10, label: 'Rebar' } ) ).text, /Rebar/ );
	assert.match( ( await tool( 'add_stockpile', { project_id: project, east: 30, north: - 10, material: 'road-base', volume: 80 } ) ).text, /road-base, 80 m³/ );
	// Bigger than the editor makes them is refused, not reported and then drawn smaller.
	assert.match( ( await tool( 'add_stockpile', { project_id: project, east: 30, north: - 10, volume: 50000 } ) ).text, /volume must be a number from 0.5 to 20000/ );
	assert.ok( ( await tool( 'add_stockpile', { project_id: project, east: 30, north: - 10, shape: 'ridge', width: 10, length: 400 } ) ).error );
	assert.ok( ( await tool( 'add_laydown_area', { project_id: project, east: 25, north: 25, width: 1500, length: 10 } ) ).error );

	const got = await tool( 'get_project', { project_id: project } );
	const items = got.value.items;
	const lane = 10; // the lane closure set: arrow board, two flaggers, seven cones
	assert.equal( items.length, 3 + lane + 10 + 5 );
	const panels = items.filter( i => i.item === 'fence-panel' );
	assert.deepEqual( panels.slice( 0, 2 ).map( i => [ i.east, i.north, i.heading ] ), [ [ 10, 1.53, 270 ], [ 10, 4.58, 270 ] ] );
	assert.deepEqual( items[ 0 ], { index: 0, item: 'office-trailer-10x40', name: items[ 0 ].name, east: 0, north: 20, heading: 180, size: items[ 0 ].size } );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.surface === 'asphalt' && i.params.fence === 'screened' && i.params.gates === 2 && i.params.grade === 'follow' && i.params.batter === 2 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.grade === 'slope' && i.params.fall === 3 && i.params.toward === 'left' && i.params.batter === 3 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.grade === 'terraces' && i.params.steps === 8 ) );
	// Indexes come with the version they're from: without it, or once the project has been saved
	// since (here by the editor, as when someone moves something), they're refused, not acted on.
	assert.ok( ( await tool( 'move_item', { project_id: project, index: 1, east: 4 } ) ).error );
	const moved = await tool( 'move_item', { project_id: project, version: got.value.version, index: 1, east: 4, heading: 45 } );
	assert.match( moved.text, /Moved .* to 4 m east, 14 m north, facing 45°/ );
	// A change that doesn't renumber gives the new version, and the old indexes still hold.
	const next = Number( moved.text.match( /version (\d+)/ )[ 1 ] );
	assert.match( ( await tool( 'remove_items', { project_id: project, version: got.value.version, indexes: [ 2 ] } ) ).text, /changed since those indexes were read/ );
	assert.match( ( await tool( 'remove_items', { project_id: project, version: next, indexes: [ 2 ] } ) ).text, /Removed 1: Traffic cone/ );
	assert.equal( ( await tool( 'get_project', { project_id: project } ) ).value.items.length, items.length - 1 );
	const before = ( await tool( 'get_project', { project_id: project } ) ).value;
	const proCookie = await signIn( { sub: 'mcp-pro', email: 'pro@example.com', name: 'Pat Pro' } );
	const { data } = ( await call( `/build/api/layouts/${ project }`, { headers: { Cookie: proCookie } } ) ).json;
	const saved = await call( `/build/api/layouts/${ project }`, { method: 'PUT', body: { data: { ...data, items: data.items.reverse() } }, headers: { Cookie: proCookie, Origin: server.base } } );
	assert.equal( saved.status, 200, saved.text );
	assert.match( ( await tool( 'remove_items', { project_id: project, version: before.version, indexes: [ 0 ] } ) ).text, /changed since those indexes were read/ );

	// A barrier loop round a 10 m square: end to end all the way, across the corners rather than
	// short of them or sticking out past them, with what's over left where the loop closes.
	const loop = await tool( 'place_row', { project_id: project, item: 'jersey-barrier', points: [ [ 100, 0 ], [ 110, 0 ], [ 110, 10 ], [ 100, 10 ], [ 100, 0 ] ] } );
	assert.match( loop.text, /row of 12 ×.*gap where the loop closes/, loop.text );
	const barriers = ( await tool( 'get_project', { project_id: project } ) ).value.items.filter( i => i.item === 'jersey-barrier' );
	const ends = barriers.map( b => {

		// Its long side (3.05 m) is across its front, a quarter turn from its heading.
		const h = ( b.heading + 90 ) * Math.PI / 180;
		const [ de, dn ] = [ Math.sin( h ) * 3.05 / 2, Math.cos( h ) * 3.05 / 2 ];
		return [ [ b.east - de, b.north - dn ], [ b.east + de, b.north + dn ] ];

	} );
	for ( const [ a, b ] of ends ) for ( const [ e, n ] of [ a, b ] ) assert.ok( e > 99.98 && e < 110.02 && n > - 0.02 && n < 10.02, `${ e }, ${ n } is outside the square` );
	for ( let i = 1; i < ends.length; i ++ ) assert.ok( Math.hypot( ends[ i ][ 0 ][ 0 ] - ends[ i - 1 ][ 1 ][ 0 ], ends[ i ][ 0 ][ 1 ] - ends[ i - 1 ][ 1 ][ 1 ] ) < 0.03, `a gap before barrier ${ i }` );
	const shared = await tool( 'share_project', { project_id: project } );
	assert.match( shared.value.share, /\/build\/app\/\?at=49\.282700%2C-123\.120700&place=Vancouver\+City\+Hall&view=[\w-]{22}$/ );
	assert.match( ( await tool( 'list_projects', {} ) ).text, /City hall staging/ );

} );

test( 'the project opens in the editor with what was placed', async () => {

	const { chromium } = require( 'playwright' );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	const page = await browser.newPage();
	const errors = [];
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	// Nothing leaves the machine.
	await page.route( '**/*', route => route.request().url().startsWith( server.base ) ? route.continue() : route.abort() );
	// Signed in as the person who connected Claude (the browser keeps the cookie: 127.0.0.1 counts as secure).
	const signed = await page.context().request.post( `${ server.base }/build/api/session`, { data: { credential: await makeToken( googleKey, { sub: 'mcp-pro', email: 'pro@example.com', name: 'Pat Pro' } ) }, headers: { Origin: server.base } } );
	assert.equal( signed.status(), 200 );
	const editor = ( await tool( 'get_project', { project_id: project } ) ).value.editor;
	// The link names the site's own address; here that's the local Worker.
	const link = new URL( editor );
	await page.goto( server.base + link.pathname + link.search );
	const logs = [];
	page.on( 'console', m => logs.push( m.text() ) );
	await page.waitForFunction( n => window.twin?.models?.entries.filter( e => ! e.placing ).length >= n, 20, { timeout: 60000 } ).catch( async e => {

		const state = await page.evaluate( () => ( { url: location.href, twin: !! window.twin, n: window.twin?.models?.entries.length, site: window.twin?.SITE } ) );
		throw new Error( `${ e.message }\n${ JSON.stringify( state ) }\n${ logs.slice( -15 ).join( '\n' ) }\n${ errors.join( '\n' ) }` );

	} );
	const loaded = await page.evaluate( () => ( {
		kinds: window.twin.models.entries.map( e => e.kind ).filter( Boolean ),
		trailer: window.twin.models.entries.find( e => e.library === 'office-trailer-10x40' )?.state,
		site: window.twin.SITE,
	} ) );
	assert.equal( loaded.site.name, 'Vancouver City Hall' );
	assert.ok( loaded.kinds.includes( 'flatten-zone' ) && loaded.kinds.includes( 'laydown' ) && loaded.kinds.includes( 'stockpile' ), loaded.kinds.join() );
	assert.equal( loaded.trailer.east, 0 );
	assert.equal( loaded.trailer.north, 20 );
	assert.deepEqual( errors, [] );

} );

test( 'refresh tokens are replaced; Disconnect on the dashboard cuts Claude off', async () => {

	const refreshed = await call( '/oauth/token', { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id } } );
	assert.equal( refreshed.status, 200, refreshed.text );
	const reused = await call( '/oauth/token', { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id } } );
	assert.equal( reused.json.error, 'invalid_grant' );
	tokens = refreshed.json;
	assert.equal( ( await tool( 'list_projects', {} ) ).error, false );

	const owner = await signIn( { sub: 'mcp-boss', email: 'boss@example.com', name: 'Big Boss' } );
	const ownerTokens = ( await connect( owner ) ).tokens;
	assert.equal( ( await tool( 'list_projects', {}, ownerTokens.access_token ) ).error, false, 'the owner connects too' );
	const home = await call( '/build/api/home', { headers: { Cookie: owner } } );
	assert.equal( home.json.connections, 1 );
	const out = await call( '/build/api/connections', { method: 'DELETE', body: {}, headers: { Cookie: owner, Origin: server.base } } );
	assert.equal( out.status, 204, out.text );
	assert.equal( ( await call( '/build/api/home', { headers: { Cookie: owner } } ) ).json.connections, 0 );
	const gone = await call( '/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 9, method: 'tools/list' }, headers: { Authorization: `Bearer ${ ownerTokens.access_token }` } } );
	assert.equal( gone.status, 401 );

} );

test( 'a plan that lapses stops the tools; the hourly limit holds', async () => {

	await webhook( { id: 'evt_pro_end', object: 'event', type: 'customer.subscription.deleted', livemode: false, created: Math.floor( Date.now() / 1000 ) + 10, data: { object: { id: 'sub_pro', object: 'subscription', status: 'canceled' } } } );
	const lapsed = await tool( 'list_projects', {} );
	assert.equal( lapsed.error, true );
	assert.match( lapsed.text, /comes with Build Pro/ );
	// Back on Pro (a new subscription), then past the hour's calls.
	await webhook( { id: 'evt_pro2', object: 'event', type: 'checkout.session.completed', livemode: false, data: { object: {
		id: 'cs_test_pro2', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 500, currency: 'usd',
		client_reference_id: null, customer_details: { email: 'pro@example.com' }, payment_intent: 'pi_pro2', payment_link: BUILD_LINK_ID, subscription: 'sub_pro2',
	} } } );
	let last;
	for ( let i = 0; i < HOURLY; i ++ ) last = await tool( 'list_sets', {} );
	assert.equal( last.error, true );
	assert.match( last.text, /changes this hour/ );

} );
