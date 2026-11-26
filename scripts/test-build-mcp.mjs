// npm run test:build-mcp: World Drive Build's MCP server (worker/drive/mcp.js) and its OAuth
// (worker/drive/oauth.js) in World Drive's Worker under wrangler dev, end to end as Claude uses them:
// /mcp's 401 points to the metadata; the client registers, the person signs in and allows it (only
// Build Pro and the owner can), the code and PKCE verifier become tokens, and every tool lays out a
// project, which then opens in the real editor (/build/app/) in a browser with what was placed. And:
// codes are used once, refresh tokens are replaced, signing out everywhere disconnects, a plan that
// lapses stops the tools, and the hourly limit holds. view_site's satellite picture is made from a
// stand-in for Google's Map Tiles API (solid-colour tiles), decoded and looked at pixel by pixel:
// its size, the grid, what's placed drawn where it is, the attribution, the cache, the map views it
// counts, and its errors. TEST_SCREENSHOTS=<dir> keeps the picture.
//
// Needs Playwright with Chromium, and the built site (npm run build:drive; built if missing).

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { after, before, test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { CLIENT_ID, ROOT, makeKey, makeToken, serveKeys, startWorker, stripeSignature } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_BUILD_MCP_PORT ) || 8784;
// A second Worker with BUILD_SALES 'on' (the last test): TEST_BUILD_MCP_SALES_PORT, else the next port.
const SALES_PORT = Number( process.env.TEST_BUILD_MCP_SALES_PORT ) || PORT + 1;
const DIST = join( ROOT, 'dist-drive', 'build' );
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const WEBHOOK_SECRET = 'whsec_test_mcp';
const BUILD_LINK_ID = 'plink_build0000000000000001';
const HOURLY = 120;
// Build Pro's map views a month here: view_site's pictures count against them.
const PRO_MONTHLY = 6;
const SCREENSHOTS = process.env.TEST_SCREENSHOTS;
// The stand-in tiles' colour, and the attribution its viewport gives.
const GROUND = [ 40, 110, 50 ];
const COPYRIGHT = 'Imagery ©2026 Test Imagery Co.';

let server;
let keys;
let googleKey;
let upstream;
let tiles;
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
	tiles = await serveTiles();
	googleKey = await makeKey( 'mcp-test-key-1' );
	keys = await serveKeys( [ googleKey.jwk ] );
	server = await startWorker( { port: PORT, config: 'wrangler.drive.jsonc', vars: workerVars(), assets: assetsOf() } );

} );

// The Worker's settings; `extra` on top (BUILD_SALES, for the last test).
function workerVars( extra = {} ) {

	return {
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
		MAP_TILES_UPSTREAM: tiles.url,
		BUILD_PRO_MONTHLY: String( PRO_MONTHLY ),
		...extra,
	};

}

after( async () => {

	await browser?.close();
	server?.stop();
	keys?.close();
	upstream?.close();
	tiles?.server.close();

} );

// A stand-in for Google's Map Tiles API: a session, the viewport's attribution, and every 2D tile a
// PNG of one colour. It keeps what it was asked ({ sessions, tiles, keys, referers }), and with
// refuse set turns everything away as Google does a key without the API on.
async function serveTiles() {

	const png = solidPng( 256, 256, GROUND );
	const state = { sessions: 0, tiles: 0, keys: new Set(), referers: new Set(), refuse: false, bodies: [] };
	const server = createServer( ( req, res ) => {

		const url = new URL( req.url, 'http://localhost' );
		state.keys.add( url.searchParams.get( 'key' ) );
		state.referers.add( req.headers.referer );
		if ( state.refuse ) {

			res.writeHead( 403, { 'Content-Type': 'application/json' } );
			return res.end( JSON.stringify( { error: { code: 403, message: 'Map Tiles API has not been used in project 1 before or it is disabled.', status: 'PERMISSION_DENIED' } } ) );

		}

		if ( req.method === 'POST' && url.pathname === '/v1/createSession' ) {

			let body = '';
			req.on( 'data', chunk => body += chunk );
			req.on( 'end', () => {

				state.sessions ++;
				state.bodies.push( JSON.parse( body ) );
				res.writeHead( 200, { 'Content-Type': 'application/json' } );
				res.end( JSON.stringify( { session: 'fake-session', expiry: String( Math.floor( Date.now() / 1000 ) + 14 * 86400 ), tileWidth: 256, tileHeight: 256, imageFormat: 'png' } ) );

			} );
			return;

		}

		if ( url.pathname === '/tile/v1/viewport' && url.searchParams.get( 'session' ) === 'fake-session' ) {

			res.writeHead( 200, { 'Content-Type': 'application/json' } );
			return res.end( JSON.stringify( { copyright: COPYRIGHT, maxZoomRects: [ { maxZoom: 19, north: 90, south: - 90, east: 180, west: - 180 } ] } ) );

		}

		if ( /^\/v1\/2dtiles\/\d+\/\d+\/\d+$/.test( url.pathname ) && url.searchParams.get( 'session' ) === 'fake-session' ) {

			state.tiles ++;
			res.writeHead( 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' } );
			return res.end( png );

		}

		res.writeHead( 404 );
		res.end();

	} );
	await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );
	return Object.assign( state, { server, url: `http://127.0.0.1:${ server.address().port }` } );

}

// A PNG of one colour, made here (8-bit RGB, no filtering).
function solidPng( width, height, [ r, g, b ] ) {

	const crcTable = Array.from( { length: 256 }, ( _, n ) => {

		let c = n;
		for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
		return c >>> 0;

	} );
	const crc = bytes => {

		let c = 0xffffffff;
		for ( const byte of bytes ) c = crcTable[ ( c ^ byte ) & 0xff ] ^ ( c >>> 8 );
		return ( c ^ 0xffffffff ) >>> 0;

	};
	const chunk = ( name, body ) => {

		const head = Buffer.alloc( 8 );
		head.writeUInt32BE( body.length, 0 );
		head.write( name, 4, 'latin1' );
		const tail = Buffer.alloc( 4 );
		tail.writeUInt32BE( crc( Buffer.concat( [ head.subarray( 4 ), body ] ) ), 0 );
		return Buffer.concat( [ head, body, tail ] );

	};
	const header = Buffer.alloc( 13 );
	header.writeUInt32BE( width, 0 );
	header.writeUInt32BE( height, 4 );
	header.set( [ 8, 2, 0, 0, 0 ], 8 );
	const row = Buffer.alloc( 1 + width * 3 );
	for ( let x = 0; x < width; x ++ ) row.set( [ r, g, b ], 1 + x * 3 );
	const raw = Buffer.concat( Array.from( { length: height }, () => row ) );
	return Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', header ), chunk( 'IDAT', deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] );

}

// view_site's answer, its picture decoded: { error, text, image: { width, height, at( x, y ) }, bytes }.
async function look( args, token ) {

	const result = await rpc( 'tools/call', { name: 'view_site', arguments: args }, token );
	const text = result.content.find( c => c.type === 'text' )?.text ?? '';
	const picture = result.content.find( c => c.type === 'image' );
	if ( result.isError || ! picture ) return { error: !! result.isError, text };
	assert.equal( picture.mimeType, 'image/jpeg' );
	const bytes = Buffer.from( picture.data, 'base64' );
	const sharp = require( 'sharp' );
	const { data, info } = await sharp( bytes ).raw().toBuffer( { resolveWithObject: true } );
	const at = ( x, y ) => [ ...data.subarray( ( y * info.width + x ) * info.channels, ( y * info.width + x ) * info.channels + 3 ) ];
	return { error: false, text, bytes, image: { width: info.width, height: info.height, format: ( await sharp( bytes ).metadata() ).format, at } };

}

const near = ( got, want, by = 40 ) => got.every( ( v, k ) => Math.abs( v - want[ k ] ) <= by );

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
	// BUILD_SALES is unset here (the default): buying is hidden, so nothing offers it.
	assert.match( page.text, /is part of <strong>Build Pro<\/strong>/ );
	assert.match( page.text, /isn&#39;t available to buy right now|isn't available to buy right now/ );
	assert.doesNotMatch( page.text, /Go Build Pro|Upgrade|Subscribe|US\$|\/month|\/year/ );

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
	assert.match( init.instructions, /view_site/ );
	const { tools } = await rpc( 'tools/list', {} );
	assert.deepEqual( tools.map( t => t.name ), [ 'find_site', 'create_project', 'list_projects', 'get_project', 'view_site', 'search_library', 'list_sets', 'place_items', 'place_set', 'place_row', 'add_flatten_area', 'add_laydown_area', 'add_stockpile', 'add_markup', 'move_item', 'remove_items', 'share_project' ] );
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
	// Following the ground smoothed over 50 m at most; one best-fit slope through it, capped.
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 120, north: 20, width: 60, length: 40, grade: 'follow', smoothing: 99 } ) ).text, /following the ground \(smoothed over 50 m\)/ );
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 120, north: 80, width: 30, length: 30, grade: 'plane', max_grade: 8 } ) ).text, /on one slope fitted through the ground \(no steeper than 8%\)/ );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 60, north: 90, width: 20, length: 20, grade: 'follow', smoothing: 'lots' } ) ).error );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 60, north: 90, width: 20, length: 20, grade: 'bumpy' } ) ).error );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 60, north: 90, width: 20, length: 20, grade: 'slope', toward: 'uphill' } ) ).error );
	// Under an overpass: keeping what has open space under it, or everything above a height (clamped).
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 200, north: 20, width: 30, length: 20, grade: 'level', keep_overhead: 'auto' } ) ).text, /level, keeping what passes over it with open space under it/ );
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 200, north: 60, width: 30, length: 20, grade: 'level', keep_overhead: 'height', keep_above: 900 } ) ).text, /keeping everything more than 200 m above it/ );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 200, north: 90, width: 20, length: 20, keep_overhead: 'some' } ) ).error );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 200, north: 90, width: 20, length: 20, keep_overhead: 'height', keep_above: 'high' } ) ).error );
	// Raised or lowered from the ground's height (clamped to ±30 m), or at an exact finished height.
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 260, north: 20, width: 20, length: 20, grade: 'slope', fall: 2, raise: 1.25 } ) ).text, /falling 2% to the front, edges battered 2 : 1, raised 1\.25 m from the ground's height/ );
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 260, north: 60, width: 20, length: 20, grade: 'level', raise: - 99 } ) ).text, /level, lowered 30 m from the ground's height/ );
	assert.match( ( await tool( 'add_flatten_area', { project_id: project, east: 260, north: 100, width: 20, length: 20, grade: 'level', finished_height: 42.5, keep_overhead: 'auto' } ) ).text, /level, finished at 42\.5 m \(as the editor's up\), keeping what passes/ );
	assert.ok( ( await tool( 'add_flatten_area', { project_id: project, east: 260, north: 140, width: 20, length: 20, raise: 'up a bit' } ) ).error );
	assert.match( ( await tool( 'add_laydown_area', { project_id: project, east: 25, north: 25, width: 15, length: 10, label: 'Rebar' } ) ).text, /Rebar/ );
	assert.match( ( await tool( 'add_stockpile', { project_id: project, east: 30, north: - 10, material: 'road-base', volume: 80 } ) ).text, /road-base, 80 m³/ );
	// Bigger than the editor makes them is refused, not reported and then drawn smaller.
	assert.match( ( await tool( 'add_stockpile', { project_id: project, east: 30, north: - 10, volume: 50000 } ) ).text, /volume must be a number from 0.5 to 20000/ );
	assert.ok( ( await tool( 'add_stockpile', { project_id: project, east: 30, north: - 10, shape: 'ridge', width: 10, length: 400 } ) ).error );
	assert.ok( ( await tool( 'add_laydown_area', { project_id: project, east: 25, north: 25, width: 1500, length: 10 } ) ).error );

	const got = await tool( 'get_project', { project_id: project } );
	const items = got.value.items;
	const lane = 10; // the lane closure set: arrow board, two flaggers, seven cones
	assert.equal( items.length, 3 + lane + 10 + 12 );
	const panels = items.filter( i => i.item === 'fence-panel' );
	assert.deepEqual( panels.slice( 0, 2 ).map( i => [ i.east, i.north, i.heading ] ), [ [ 10, 1.53, 270 ], [ 10, 4.58, 270 ] ] );
	assert.deepEqual( items[ 0 ], { index: 0, item: 'office-trailer-10x40', name: items[ 0 ].name, east: 0, north: 20, heading: 180, size: items[ 0 ].size } );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.surface === 'asphalt' && i.params.fence === 'screened' && i.params.gates === 2 && i.params.grade === 'follow' && i.params.batter === 2 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.grade === 'slope' && i.params.fall === 3 && i.params.toward === 'left' && i.params.batter === 3 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.grade === 'terraces' && i.params.steps === 8 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.grade === 'follow' && i.params.smoothing === 50 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.grade === 'plane' && i.params.maxGrade === 8 && i.params.smoothing === undefined ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.keep === 'auto' && i.params.height === 0 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.height === 200 && ! ( 'keep' in i.params ) ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.raise === 1.25 && ! ( 'finished' in i.params ) ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.raise === - 30 ) );
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.finished === 42.5 && ! ( 'raise' in i.params ) && i.params.keep === 'auto' ) );
	// The usual smoothing isn't saved, as the editor saves it.
	assert.ok( items.some( i => i.item === 'flatten-zone' && i.params.surface === 'asphalt' && ! ( 'smoothing' in i.params ) ) );
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
	// Markups: a dimension (its length on plan), a height dimension, an arrow and a note, each
	// returned as stored; bad ones are refused, saying why.
	const dimension = await tool( 'add_markup', { project_id: project, kind: 'dimension', points: [ { east: 0, north: 0 }, { east: 24.6, north: 0 } ], offset: 3 } );
	assert.equal( dimension.error, false, dimension.text );
	assert.match( dimension.text, /a dimension of 24\.6 m \(white\)/ );
	const stored = JSON.parse( dimension.text.slice( dimension.text.indexOf( '{' ), dimension.text.lastIndexOf( '}' ) + 1 ) );
	assert.deepEqual( stored, { name: 'Dimension', kind: 'markup', params: { type: 'dimension', points: [ [ - 12.3, 0, 0 ], [ 12.3, 0, 0 ] ], colour: 'white', text: '', offset: 3, vertical: false }, east: 12.3, north: 0, up: null, heading: 0, scale: 1 } );
	assert.match( ( await tool( 'add_markup', { project_id: project, kind: 'dimension', height: true, points: [ { east: 5, north: 5, up: 10 }, { east: 5, north: 5, up: 11.2 } ] } ) ).text, /a height dimension of 1\.2 m/ );
	assert.match( ( await tool( 'add_markup', { project_id: project, kind: 'arrow', points: [ [ 10, 0 ], [ 16, 6 ] ], text: 'Gas main', colour: 'amber' } ) ).text, /an arrow saying "Gas main" \(amber\)/ );
	const note = await tool( 'add_markup', { project_id: project, kind: 'note', points: [ { east: 20, north: 30 } ], text: 'Hazard: open trench', colour: 'red' } );
	assert.match( note.text, /a note saying "Hazard: open trench" \(red\).*"kind":"markup"/ );
	for ( const [ args, why ] of [
		[ { kind: 'circle', points: [ { east: 0, north: 0 } ] }, /kind must be one of dimension, arrow, note/ ],
		[ { kind: 'dimension', points: [ { east: 0, north: 0 } ] }, /a dimension takes 2 points/ ],
		[ { kind: 'note', points: [ { east: 0, north: 0 } ] }, /what the note says/ ],
		[ { kind: 'note', points: [ { east: 'here', north: 0 } ], text: 'x' }, /east must be a number/ ],
		[ { kind: 'note', points: [ { east: 0, north: 0 } ], text: 'x', colour: 'purple' }, /colour must be one of/ ],
		[ { kind: 'note', points: [ { east: 0, north: 0 } ], text: 'x'.repeat( 501 ) }, /at most 500 characters/ ],
		[ { kind: 'dimension', points: [ { east: 3, north: 3 }, { east: 3, north: 3 } ] }, /must be apart/ ],
		[ { kind: 'arrow', points: [ { east: 0, north: 0 }, { east: 0, north: 0 } ], text: 'x' }, /an arrow's points must be apart/ ],
		[ { kind: 'arrow', points: [ { east: 2, north: 2, up: 1 }, { east: 2, north: 2, up: 1 } ], text: 'x' }, /an arrow's points must be apart/ ],
		[ { kind: 'dimension', height: true, points: [ { east: 0, north: 0 }, { east: 1, north: 0 } ] }, /needs up for both points/ ],
		[ { kind: 'dimension', points: [ { east: 0, north: 0, up: 1 }, { east: 1, north: 0 } ] }, /up for every point or for none/ ],
		[ { kind: 'arrow', height: true, points: [ { east: 0, north: 0 }, { east: 1, north: 0 } ] }, /only for a dimension/ ],
		[ { kind: 'dimension', offset: 5000, points: [ { east: 0, north: 0 }, { east: 1, north: 0 } ] }, /offset must be a number/ ],
	] ) {

		const refused = await tool( 'add_markup', { project_id: project, ...args } );
		assert.ok( refused.error, `${ JSON.stringify( args ) } was taken` );
		assert.match( refused.text, why );

	}

	const listed = ( await tool( 'get_project', { project_id: project } ) ).value.items.filter( i => i.item === 'markup' );
	assert.deepEqual( listed.map( i => [ i.name, i.params.type, i.measures ?? null ] ), [ [ 'Dimension', 'dimension', '24.6 m' ], [ 'Height', 'dimension', '1.2 m' ], [ 'Arrow', 'arrow', null ], [ 'Note', 'note', null ] ] );
	const shared = await tool( 'share_project', { project_id: project } );
	assert.match( shared.value.share, /\/build\/app\/\?at=49\.282700%2C-123\.120700&place=Vancouver\+City\+Hall&view=[\w-]{22}$/ );
	assert.match( ( await tool( 'list_projects', {} ) ).text, /City hall staging/ );

} );

test( 'view_site: the site from above, with the grid and what\'s placed drawn on', async () => {

	const proCookie = await signIn( { sub: 'mcp-pro', email: 'pro@example.com', name: 'Pat Pro' } );
	const viewsUsed = async () => ( await call( '/build/api/me', { headers: { Cookie: proCookie } } ) ).json.plan.views.used;
	const before = await viewsUsed();
	const seen = await look( { project_id: project } );
	assert.equal( seen.error, false, seen.text );
	assert.equal( seen.image.format, 'jpeg' );
	assert.deepEqual( [ seen.image.width, seen.image.height ], [ 768, 768 ] );
	if ( SCREENSHOTS ) {

		mkdirSync( SCREENSHOTS, { recursive: true } );
		writeFileSync( join( SCREENSHOTS, 'view-site.jpg' ), seen.bytes );

	}

	// 150 m across by default, round the site point: 0.195 m a pixel, the site point in the middle.
	assert.match( seen.text, /150 m across in 768 × 768 px, 0\.2 m a pixel\. It runs from -75 to 75 m east and -75 to 75 m north/ );
	assert.match( seen.text, /Grid lines every 20 m/ );
	assert.ok( seen.text.includes( `Imagery: Google, ${ COPYRIGHT }.` ), seen.text );
	assert.match( seen.text, /one of the plan's map views: \d+ of 6 this month/ );
	const px = ( east, north ) => [ Math.floor( east / ( 150 / 768 ) + 384 ), Math.floor( 384 - north / ( 150 / 768 ) ) ];
	// Open ground away from everything is the tiles' own colour.
	assert.ok( near( seen.image.at( ...px( - 65, 65 ) ), GROUND, 12 ), String( seen.image.at( ...px( - 65, 65 ) ) ) );
	// The office trailer at 0, 20 facing south: 12.29 m across, 5.83 m along its heading, so its
	// north edge 2.9 m north of its middle, drawn yellow, numbered with its index.
	const edge = seen.image.at( ...px( 3, 22.92 ) );
	assert.ok( edge[ 0 ] > 200 && edge[ 1 ] > 170 && edge[ 2 ] < 150, `the trailer's edge is ${ edge }` );
	const trailer = ( await tool( 'get_project', { project_id: project } ) ).value.items.find( i => i.item === 'office-trailer-10x40' );
	assert.match( seen.text, /Drawn on: \d+ of the project's \d+ things in view, each numbered with its get_project index/ );
	assert.ok( Number.isInteger( trailer.index ) );
	// The grid: a line every 20 m (lighter than the ground), and the site point's red cross.
	const line = seen.image.at( px( - 60, 0 )[ 0 ], px( 0, - 65 )[ 1 ] );
	assert.ok( line[ 0 ] > GROUND[ 0 ] + 60, `the grid line at 60 m west is ${ line }` );
	const cross = seen.image.at( 384, 378 );
	assert.ok( cross[ 0 ] > 200 && cross[ 1 ] < 110 && cross[ 2 ] < 110, `the site point's cross is ${ cross }` );
	// The labels along the top are white, and "Google" and the copyright darken the foot.
	const top = Array.from( { length: 14 * 768 }, ( _, k ) => seen.image.at( k % 768, 4 + Math.floor( k / 768 ) ) );
	assert.ok( top.some( p => p.every( v => v > 220 ) ), 'no white labels along the top' );
	const foot = seen.image.at( 380, 762 );
	assert.ok( foot[ 1 ] < GROUND[ 1 ] - 20 || foot.every( v => v > 200 ), `the foot is ${ foot }` );
	// One map view counted; the key the editor's handed, as from the site's own pages; satellite, PNG tiles.
	assert.equal( await viewsUsed(), before + 1 );
	assert.deepEqual( [ ...tiles.keys ], [ 'test-maps-key-not-real' ] );
	assert.ok( [ ...tiles.referers ].every( r => /\/build\/app\/$/.test( r ) ), [ ...tiles.referers ].join() );
	assert.deepEqual( tiles.bodies[ 0 ], { mapType: 'satellite', language: 'en-US', region: 'US', imageFormat: 'png' } );

	// The same view again: the tiles come from the cache, and the session is kept.
	const fetched = tiles.tiles;
	assert.ok( fetched > 0 && fetched <= 49, `${ fetched } tiles` );
	assert.equal( ( await look( { project_id: project } ) ).error, false );
	assert.equal( tiles.tiles, fetched, 'the tiles were fetched again' );
	assert.equal( tiles.sessions, 1 );
	// Somewhere else, bigger: 400 m round 100 m east, the trailer a few pixels, still drawn.
	const wide = await look( { project_id: project, east: 100, north: 0, size: 400 } );
	assert.match( wide.text, /400 m across .* -100 to 300 m east and -200 to 200 m north/ );
	assert.match( wide.text, /Grid lines every 50 m/ );
	assert.equal( await viewsUsed(), before + 3 );

	// Refused: no such project, a size out of range, and Google turning the key away (nothing counted).
	assert.match( ( await look( { project_id: 'nope' } ) ).text, /No such project/ );
	assert.match( ( await look( { project_id: project, size: 5 } ) ).text, /size must be a number from 20 to 2000/ );
	tiles.refuse = true;
	const refused = await look( { project_id: project, size: 160 } );
	tiles.refuse = false;
	assert.equal( refused.error, true );
	assert.match( refused.text, /turned the key away \(403\)\. .*Map Tiles API/ );
	assert.doesNotMatch( refused.text, /test-maps-key-not-real/ );
	assert.equal( await viewsUsed(), before + 3 );
	assert.equal( ( await look( { project_id: project, size: 160 } ) ).error, false, 'a new session once Google takes the key again' );

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
	assert.ok( loaded.kinds.includes( 'flatten-zone' ) && loaded.kinds.includes( 'laydown' ) && loaded.kinds.includes( 'stockpile' ) && loaded.kinds.includes( 'markup' ), loaded.kinds.join() );
	// Claude's markups, labelled in the editor as get_project measured them.
	await page.waitForFunction( () => [ ...document.querySelectorAll( '.markup-label' ) ].some( l => l.textContent === '24.6 m' ) );
	const labels = await page.evaluate( () => [ ...document.querySelectorAll( '.markup-label' ) ].map( l => l.textContent ).sort() );
	assert.deepEqual( labels, [ '1.2 m', '24.6 m', 'Gas main', 'Hazard: open trench' ] );
	assert.equal( loaded.trailer.east, 0 );
	assert.equal( loaded.trailer.north, 20 );
	// The raised and the exact-height areas as Claude made them.
	const heights = await page.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'flatten-zone' ).map( e => [ e.params.raise, e.params.finished ] ) );
	assert.ok( heights.some( ( [ r, f ] ) => r === 1.25 && f === null ) && heights.some( ( [ r, f ] ) => r === - 30 ) && heights.some( ( [ , f ] ) => f === 42.5 ), JSON.stringify( heights ) );
	assert.deepEqual( errors, [] );

} );

test( 'view_site stops when the month\'s map views are used up', async () => {

	const proCookie = await signIn( { sub: 'mcp-pro', email: 'pro@example.com', name: 'Pat Pro' } );
	const { used, limit } = ( await call( '/build/api/me', { headers: { Cookie: proCookie } } ) ).json.plan.views;
	assert.equal( limit, PRO_MONTHLY );
	for ( let i = used; i < limit; i ++ ) assert.equal( ( await look( { project_id: project } ) ).error, false );
	const out = await look( { project_id: project } );
	assert.equal( out.error, true );
	assert.match( out.text, /map views are used up \(6 on the plan/ );

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
	// BUILD_SALES unset (the default): part of Build Pro, with nothing about buying it.
	assert.match( lapsed.text, /is part of Build Pro/ );
	assert.match( lapsed.text, /isn't available to buy right now/ );
	assert.doesNotMatch( lapsed.text, /Upgrade|Subscribe|https:\/\/worlddrive\.app\/build\// );
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

// Everything above runs with BUILD_SALES unset (the default: buying hidden). With it 'on', the free
// plan is offered Build Pro as before it was hidden: the authorize page's "Go Build Pro" and the
// tools' "Upgrade at ...". On a Worker of its own (fresh, so registered and signed in again).
test( 'with BUILD_SALES on: the authorize page and the tools offer Build Pro to the free plan', async () => {

	server?.stop();
	// And no Maps key: view_site says there are no pictures.
	server = await startWorker( { port: SALES_PORT, config: 'wrangler.drive.jsonc', vars: workerVars( { BUILD_SALES: 'on', GOOGLE_MAPS_API_KEY: '' } ), assets: assetsOf() } );
	const registered = await call( '/oauth/register', { method: 'POST', body: { redirect_uris: [ REDIRECT ], client_name: 'Claude' } } );
	assert.equal( registered.status, 201, registered.text );
	client = registered.json;
	const free = await signIn( { sub: 'mcp-sales-free', email: 'sfree@example.com', name: 'Sal Free' } );
	const { page } = await connect( free );
	assert.match( page.text, /comes with <strong>Build Pro<\/strong>/ );
	assert.match( page.text, /<a class="button" href="\/build\/">Go Build Pro<\/a>/ );
	assert.doesNotMatch( page.text, /isn&#39;t available to buy|isn't available to buy/ );
	// Pro connects, then lapses: the tools say where to upgrade.
	const cookie = await signIn( { sub: 'mcp-sales-pro', email: 'spro@example.com', name: 'Sam Pro' } );
	const me = await call( '/build/api/me', { headers: { Cookie: cookie } } );
	await webhook( { id: 'evt_sales_pro', object: 'event', type: 'checkout.session.completed', livemode: false, data: { object: {
		id: 'cs_test_sales_pro', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', amount_total: 500, currency: 'usd',
		client_reference_id: me.json.premium.clientReferenceId, customer_details: { email: 'spro@example.com' }, payment_intent: 'pi_sales_pro', payment_link: BUILD_LINK_ID, subscription: 'sub_sales_pro',
	} } } );
	const connected = await connect( cookie );
	assert.ok( connected.tokens, connected.page?.text.slice( -600 ) );
	assert.equal( ( await tool( 'list_projects', {}, connected.tokens.access_token ) ).error, false );
	const made = await tool( 'create_project', { name: 'No map', place: 'Somewhere', lat: 49.2827, lon: - 123.1207 }, connected.tokens.access_token );
	const keyless = await look( { project_id: made.value.project_id }, connected.tokens.access_token );
	assert.equal( keyless.error, true );
	assert.match( keyless.text, /no Google map key on the server/ );
	await webhook( { id: 'evt_sales_pro_end', object: 'event', type: 'customer.subscription.deleted', livemode: false, created: Math.floor( Date.now() / 1000 ) + 10, data: { object: { id: 'sub_sales_pro', object: 'subscription', status: 'canceled' } } } );
	const lapsed = await tool( 'list_projects', {}, connected.tokens.access_token );
	assert.equal( lapsed.error, true );
	assert.equal( lapsed.text, 'World Drive Build\'s Claude connector comes with Build Pro. Upgrade at https://worlddrive.app/build/ and try again.' );

} );
