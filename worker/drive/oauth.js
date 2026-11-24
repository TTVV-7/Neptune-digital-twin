import { HttpError, isObject, json, randomToken, sha256Hex } from '../http.js';
import { accountById, currentAccount } from './accounts.js';
import { planOf } from './build.js';
import { googleClientId } from './settings.js';

// OAuth 2.1 for World Drive Build's MCP server (mcp.js, docs/build.md): how Claude (or any MCP
// client) gets to act as someone's World Drive account. The client finds this from /mcp's 401
// (RFC 9728's protected resource metadata), registers itself (RFC 7591, public clients only, with
// PKCE S256), and sends the person to /oauth/authorize, a page on worlddrive.app where they sign in
// with Google as on the dashboard and allow it; only Build Pro (and the owner) can. Codes and tokens
// are kept in D1 as hashes (migrations/0018_build_mcp.sql): a code lasts ten minutes and is used
// once, an access token an hour, a refresh token 30 days and is replaced each time it's used.

const CODE_MS = 10 * 60 * 1000;
const ACCESS_MS = 60 * 60 * 1000;
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const CLIENT_ID = /^[A-Za-z0-9_-]{22}$/;
const SCOPE = 'build';

export const OAUTH_PATHS = [
	'/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp',
	'/oauth/register', '/oauth/authorize', '/oauth/token',
];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

export function isOAuth( url ) {

	return OAUTH_PATHS.includes( url.pathname );

}

export async function oauth( context ) {

	const { request, url } = context;
	if ( request.method === 'OPTIONS' ) return new Response( null, { status: 204, headers: cors } );
	switch ( url.pathname ) {

		case '/.well-known/oauth-protected-resource':
		case '/.well-known/oauth-protected-resource/mcp':
			return json( { resource: `${ url.origin }/mcp`, authorization_servers: [ url.origin ], scopes_supported: [ SCOPE ], resource_name: 'World Drive Build' }, 200, cors );
		case '/.well-known/oauth-authorization-server':
			return json( {
				issuer: url.origin,
				authorization_endpoint: `${ url.origin }/oauth/authorize`,
				token_endpoint: `${ url.origin }/oauth/token`,
				registration_endpoint: `${ url.origin }/oauth/register`,
				response_types_supported: [ 'code' ],
				grant_types_supported: [ 'authorization_code', 'refresh_token' ],
				code_challenge_methods_supported: [ 'S256' ],
				token_endpoint_auth_methods_supported: [ 'none' ],
				scopes_supported: [ SCOPE ],
			}, 200, cors );
		case '/oauth/register':
			if ( request.method !== 'POST' ) throw new HttpError( 405, 'Method not allowed' );
			return await register( context );
		case '/oauth/token':
			if ( request.method !== 'POST' ) throw new HttpError( 405, 'Method not allowed' );
			return await token( context );
		case '/oauth/authorize':
			if ( request.method === 'GET' ) return await authorizePage( context );
			if ( request.method === 'POST' ) return await authorizeDecision( context );
			throw new HttpError( 405, 'Method not allowed' );

	}

	throw new HttpError( 404, 'Not found' );

}

// --- registration -----------------------------------------------------------------------------

function goodRedirect( value ) {

	try {

		const url = new URL( value );
		if ( url.hash ) return false;
		if ( url.protocol === 'https:' ) return true;
		return url.protocol === 'http:' && [ 'localhost', '127.0.0.1', '[::1]' ].includes( url.hostname );

	} catch {

		return false;

	}

}

async function register( { request, env, now } ) {

	let body;
	try {

		body = await request.json();

	} catch {

		return oauthError( 'invalid_client_metadata', 'Send JSON' );

	}

	const uris = isObject( body ) && Array.isArray( body.redirect_uris ) ? body.redirect_uris : [];
	if ( ! uris.length || uris.length > 5 || ! uris.every( u => typeof u === 'string' && u.length <= 500 && goodRedirect( u ) ) ) return oauthError( 'invalid_redirect_uri', 'redirect_uris: one to five https (or http://localhost) addresses' );
	const name = ( typeof body.client_name === 'string' ? body.client_name : 'An MCP client' ).replace( /[\u0000-\u001f\u007f]/g, '' ).trim().slice( 0, 80 ) || 'An MCP client';
	const id = randomToken( 16 );
	await env.DB.prepare( 'INSERT INTO oauth_clients ( id, name, redirect_uris, created_at ) VALUES ( ?, ?, ?, ? )' ).bind( id, name, JSON.stringify( uris ), now ).run();
	return json( {
		client_id: id, client_id_issued_at: Math.floor( now / 1000 ), client_name: name, redirect_uris: uris,
		token_endpoint_auth_method: 'none', grant_types: [ 'authorization_code', 'refresh_token' ], response_types: [ 'code' ],
	}, 201, cors );

}

function oauthError( error, description, status = 400 ) {

	return json( { error, error_description: description }, status, cors );

}

// --- authorizing ------------------------------------------------------------------------------

// The request's parameters, checked: { client, params } or { problem } (shown on the page, never
// redirected: the redirect itself may be what's wrong).
async function readRequest( env, values ) {

	const params = Object.fromEntries( [ 'response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource' ].map( k => [ k, values.get( k ) ?? '' ] ) );
	if ( ! CLIENT_ID.test( params.client_id ) ) return { problem: 'This link isn\'t from a client World Drive knows. Try connecting again from Claude.' };
	const row = await env.DB.prepare( 'SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ?' ).bind( params.client_id ).first();
	if ( ! row ) return { problem: 'This link isn\'t from a client World Drive knows. Try connecting again from Claude.' };
	if ( ! JSON.parse( row.redirect_uris ).includes( params.redirect_uri ) ) return { problem: 'This link sends you somewhere its client didn\'t register. Try connecting again from Claude.' };
	if ( params.response_type !== 'code' || params.code_challenge_method !== 'S256' || ! /^[A-Za-z0-9_-]{43,128}$/.test( params.code_challenge ) ) return { problem: 'This link is missing what a secure sign-in needs (PKCE). Try connecting again from Claude.' };
	return { client: row, params };

}

async function authorizePage( context ) {

	const { env, url } = context;
	const { client, params, problem } = await readRequest( env, url.searchParams );
	if ( problem ) return page( 'Can\'t connect', `<p>${ escape( problem ) }</p>` );
	const account = await currentAccount( context );
	const who = escape( client.name );
	if ( ! account ) {

		const id = googleClientId( env );
		return page( `Connect ${ who } to World Drive Build`, `
			<p><strong>${ who }</strong> wants to build in your World Drive Build projects: find sites, make projects and place equipment, trailers, fencing and earthworks.</p>
			<p>Sign in with the Google account you use for World Drive Build.</p>
			<div id="google"></div>
			<p class="small" id="note"></p>
			<script src="https://accounts.google.com/gsi/client" async onload="start()"></script>
			<script>
				function start() {
					google.accounts.id.initialize( { client_id: ${ JSON.stringify( id ) }, ux_mode: 'popup', callback: async ( { credential } ) => {
						const res = await fetch( '/build/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { credential } ) } );
						if ( res.ok ) location.reload();
						else document.getElementById( 'note' ).textContent = 'Couldn\\'t sign in. Try again.';
					} } );
					google.accounts.id.renderButton( document.getElementById( 'google' ), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with' } );
				}
			</script>` );

	}

	const plan = await planOf( env, account );
	const name = escape( account.name || account.email || account.username || 'you' );
	if ( plan.tier === 'free' ) {

		return page( 'Build Pro needed', `
			<p>Connecting Claude to World Drive Build comes with <strong>Build Pro</strong>. You're signed in as ${ name } on the free plan.</p>
			<p><a class="button" href="/build/">Go Build Pro</a></p>
			<p class="small">Once you're on Build Pro, connect again from Claude.</p>` );

	}

	const hidden = Object.entries( params ).map( ( [ k, v ] ) => `<input type="hidden" name="${ k }" value="${ escape( v ) }">` ).join( '' );
	return page( `Allow ${ who }?`, `
		<p><strong>${ who }</strong> wants to build in the World Drive Build projects of <strong>${ name }</strong>.</p>
		<ul>
			<li>Find sites by address and make projects</li>
			<li>Read, add to, move and remove what's in your projects</li>
			<li>Make share links for them</li>
		</ul>
		<p class="small">It can't see your other World Drive data, change your plan or sign in as you anywhere else. Signing out of World Drive everywhere (in World Drive's account panel) disconnects it.</p>
		<form method="post" action="/oauth/authorize">${ hidden }
			<button type="submit" name="decision" value="allow" class="button">Allow</button>
			<button type="submit" name="decision" value="deny" class="plain">Don't allow</button>
		</form>` );

}

async function authorizeDecision( context ) {

	const { request, env, url, now } = context;
	// Only this page may post here: the session cookie is SameSite=Lax (another site's form gets
	// no cookie), and the Origin header says where the form was.
	const origin = request.headers.get( 'Origin' );
	if ( origin !== url.origin ) throw new HttpError( 403, 'Forbidden' );
	const form = await request.formData();
	const { client, params, problem } = await readRequest( env, form );
	if ( problem ) return page( 'Can\'t connect', `<p>${ escape( problem ) }</p>` );
	const back = new URL( params.redirect_uri );
	if ( params.state ) back.searchParams.set( 'state', params.state );
	if ( form.get( 'decision' ) !== 'allow' ) {

		back.searchParams.set( 'error', 'access_denied' );
		return Response.redirect( back.href, 302 );

	}

	const account = await currentAccount( context );
	if ( ! account ) return Response.redirect( `${ url.origin }/oauth/authorize?${ new URLSearchParams( params ) }`, 302 );
	if ( ( await planOf( env, account ) ).tier === 'free' ) throw new HttpError( 403, 'Build Pro needed' );
	const code = randomToken( 32 );
	await env.DB.prepare( 'INSERT INTO oauth_codes ( code_hash, client_id, account_id, redirect_uri, challenge, expires_at ) VALUES ( ?, ?, ?, ?, ?, ? )' )
		.bind( await sha256Hex( code ), client.id, account.id, params.redirect_uri, params.code_challenge, now + CODE_MS ).run();
	back.searchParams.set( 'code', code );
	return Response.redirect( back.href, 302 );

}

// --- tokens -----------------------------------------------------------------------------------

async function token( { request, env, now } ) {

	let values;
	const type = request.headers.get( 'Content-Type' ) ?? '';
	try {

		values = type.includes( 'application/json' ) ? new Map( Object.entries( await request.json() ) ) : await request.formData();

	} catch {

		return oauthError( 'invalid_request', 'Send the form' );

	}

	const get = key => {

		const value = values.get( key );
		return typeof value === 'string' ? value : '';

	};

	const clientId = get( 'client_id' );
	if ( get( 'grant_type' ) === 'authorization_code' ) {

		const code = get( 'code' );
		if ( ! code ) return oauthError( 'invalid_request', 'No code' );
		const hash = await sha256Hex( code );
		const row = await env.DB.prepare( 'DELETE FROM oauth_codes WHERE code_hash = ? RETURNING client_id, account_id, redirect_uri, challenge, expires_at' ).bind( hash ).first();
		if ( ! row || row.expires_at < now || row.client_id !== clientId || row.redirect_uri !== get( 'redirect_uri' ) ) return oauthError( 'invalid_grant', 'That code isn\'t good' );
		if ( await s256( get( 'code_verifier' ) ) !== row.challenge ) return oauthError( 'invalid_grant', 'The code verifier doesn\'t match' );
		return json( await issue( env, row.client_id, row.account_id, now ), 200, { ...cors, 'Cache-Control': 'no-store' } );

	}

	if ( get( 'grant_type' ) === 'refresh_token' ) {

		const hash = await sha256Hex( get( 'refresh_token' ) );
		const row = await env.DB.prepare( 'DELETE FROM oauth_tokens WHERE token_hash = ? AND kind = \'refresh\' RETURNING client_id, account_id, expires_at' ).bind( hash ).first();
		if ( ! row || row.expires_at < now || ( clientId && row.client_id !== clientId ) ) return oauthError( 'invalid_grant', 'That refresh token isn\'t good' );
		return json( await issue( env, row.client_id, row.account_id, now ), 200, { ...cors, 'Cache-Control': 'no-store' } );

	}

	return oauthError( 'unsupported_grant_type', 'authorization_code or refresh_token' );

}

async function issue( env, clientId, accountId, now ) {

	const access = randomToken( 32 );
	const refresh = randomToken( 32 );
	await env.DB.batch( [
		env.DB.prepare( 'INSERT INTO oauth_tokens ( token_hash, kind, client_id, account_id, created_at, expires_at ) VALUES ( ?, \'access\', ?, ?, ?, ? )' ).bind( await sha256Hex( access ), clientId, accountId, now, now + ACCESS_MS ),
		env.DB.prepare( 'INSERT INTO oauth_tokens ( token_hash, kind, client_id, account_id, created_at, expires_at ) VALUES ( ?, \'refresh\', ?, ?, ?, ? )' ).bind( await sha256Hex( refresh ), clientId, accountId, now, now + REFRESH_MS ),
		// Spent ones go as new ones come.
		env.DB.prepare( 'DELETE FROM oauth_tokens WHERE expires_at < ?' ).bind( now ),
	] );
	return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_MS / 1000, refresh_token: refresh, scope: SCOPE };

}

async function s256( verifier ) {

	if ( ! /^[A-Za-z0-9._~-]{43,128}$/.test( verifier ) ) return null;
	const digest = new Uint8Array( await crypto.subtle.digest( 'SHA-256', new TextEncoder().encode( verifier ) ) );
	let text = '';
	for ( const byte of digest ) text += String.fromCharCode( byte );
	return btoa( text ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );

}

// The account an access token (Authorization: Bearer ...) acts as, or null.
export async function bearerAccount( { request, env, now } ) {

	const match = /^Bearer\s+([\w-]{20,200})$/.exec( request.headers.get( 'Authorization' ) ?? '' );
	if ( ! match ) return null;
	const row = await env.DB.prepare( 'SELECT account_id FROM oauth_tokens WHERE token_hash = ? AND kind = \'access\' AND expires_at > ?' ).bind( await sha256Hex( match[ 1 ] ), now ).first();
	return row ? await accountById( env.DB, row.account_id ) : null;

}

// --- the page ---------------------------------------------------------------------------------

function escape( text ) {

	return String( text ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' } )[ c ] );

}

function page( title, body ) {

	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${ title } · World Drive Build</title>
<style>
	:root { color-scheme: dark; }
	body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #11171d; color: #eaf0f4; font: 15px/1.5 system-ui, sans-serif; padding: 20px; box-sizing: border-box; }
	main { width: min( 440px, 100% ); padding: 28px; border-radius: 14px; background: #18212a; border: 1px solid #2b3946; }
	.brand { font-weight: 800; margin-bottom: 18px; }
	.brand b { margin-left: 6px; padding: 1px 7px; border-radius: 4px; background: #ffd60a; color: #1a1503; font-size: 12px; letter-spacing: 0.08em; }
	h1 { margin: 0 0 12px; font-size: 22px; }
	p, li { color: #c6d1da; }
	ul { padding-left: 20px; }
	.small { font-size: 13px; color: #93a3b1; }
	.button { display: inline-block; padding: 11px 20px; border: 0; border-radius: 8px; background: #ffd60a; color: #1a1503; font: 600 15px system-ui, sans-serif; text-decoration: none; cursor: pointer; }
	.plain { margin-left: 8px; padding: 11px 14px; border: 1px solid #2b3946; border-radius: 8px; background: none; color: #c6d1da; font: inherit; cursor: pointer; }
</style></head>
<body><main><div class="brand">World Drive<b>BUILD</b></div><h1>${ title }</h1>${ body }</main></body></html>`;
	return new Response( html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': 'frame-ancestors \'none\'' } } );

}
