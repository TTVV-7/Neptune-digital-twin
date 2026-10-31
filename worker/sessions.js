import { verifyIdToken } from './google.js';
import { HttpError, isObject, json, list, noContent, readJson, randomToken, sha256Hex } from './http.js';
import { premiumFor } from './premium.js';

// Signing in: the page gets an ID token from Google and posts it here. If it checks out we
// remember the person and give their browser a session cookie for 30 days. Only a hash of the
// session token is stored. World Drive's accounts (drive/accounts.js) sign in the same way, with
// the cookie, the test keys' guard and the profile from here.

export const SESSION_SECONDS = 30 * 24 * 3600;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOCAL_HOSTS = [ 'localhost', '127.0.0.1', '[::1]' ];
const cookies = sessionCookies( 'twin_session' );

export async function signIn( { request, env, url } ) {

	if ( ! env.GOOGLE_CLIENT_ID ) throw new HttpError( 503, 'Sign-in isn\'t set up' );
	const body = await readJson( request, 16 * 1024 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );

	const claims = await verifyIdToken( body.credential, { clientId: env.GOOGLE_CLIENT_ID, certsUrl: testCertsUrl( env ) } );
	const profile = profileFrom( claims );
	if ( ! isAllowed( profile, env ) ) throw new HttpError( 403, 'This Google account isn\'t allowed to sign in here' );

	const now = Date.now();
	const user = await env.DB.prepare( `
		INSERT INTO users ( google_sub, email, name, given_name, picture, hosted_domain, created_at, last_login_at )
		VALUES ( ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7 )
		ON CONFLICT ( google_sub ) DO UPDATE SET email = excluded.email, name = excluded.name, given_name = excluded.given_name,
			picture = excluded.picture, hosted_domain = excluded.hosted_domain, last_login_at = excluded.last_login_at
		RETURNING *
	` ).bind( profile.sub, profile.email, profile.name, profile.givenName, profile.picture, profile.hd, now ).first();

	// A fresh session every time, replacing any this browser had, and expired ones are tidied away.
	const token = randomToken( 32 );
	const old = cookies.read( request, url );
	await env.DB.batch( [
		env.DB.prepare( 'DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?' ).bind( now, old ? await sha256Hex( old ) : '' ),
		env.DB.prepare( 'INSERT INTO sessions ( token_hash, user_id, created_at, expires_at ) VALUES ( ?, ?, ?, ? )' )
			.bind( await sha256Hex( token ), user.id, now, now + SESSION_SECONDS * 1000 ),
	] );

	const answer = { user: publicUser( user ), hasMapsKey: !! env.GOOGLE_MAPS_API_KEY, premium: await premiumFor( env, user ) };
	return json( answer, 200, { 'Set-Cookie': cookies.write( url, token, SESSION_SECONDS ) } );

}

export async function signOut( { request, env, url } ) {

	const token = cookies.read( request, url );
	if ( token ) await env.DB.prepare( 'DELETE FROM sessions WHERE token_hash = ?' ).bind( await sha256Hex( token ) ).run();
	return noContent( { 'Set-Cookie': cookies.write( url, '', 0 ) } );

}

// The signed-in user's row, or null.
export async function currentUser( request, env, url ) {

	const token = cookies.read( request, url );
	if ( ! token ) return null;
	const user = await env.DB.prepare( `
		SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
		WHERE sessions.token_hash = ? AND sessions.expires_at > ?
	` ).bind( await sha256Hex( token ), Date.now() ).first();
	// Checked every time, so taking someone off ALLOWED_EMAILS signs them out everywhere.
	return user && isAllowed( { email: user.email, hd: user.hosted_domain }, env ) ? user : null;

}

// What the page is told about a user. Their Google id stays on the server.
export function publicUser( user ) {

	return { name: user.name, firstName: firstName( user ), email: user.email, picture: user.picture };

}

export function firstName( user ) {

	return user.given_name || user.name.split( ' ' )[ 0 ] || user.email.split( '@' )[ 0 ];

}

// ALLOWED_EMAILS and ALLOWED_DOMAINS (comma-separated) limit who can sign in; with neither set,
// any Google account can. A domain only counts when Google is in charge of the address: a
// Google Workspace account (it has the hd claim, the organisation's domain) or gmail.com.
// Anyone can make a Google account with someone else's company address, so the address
// alone proves nothing about the company.
export function isAllowed( { email, hd }, env ) {

	const emails = list( env.ALLOWED_EMAILS );
	const domains = list( env.ALLOWED_DOMAINS );
	if ( emails.length === 0 && domains.length === 0 ) return true;
	if ( emails.includes( email ) ) return true;
	const domain = email.split( '@' ).pop();
	if ( hd ) return domains.includes( hd ) || domains.includes( domain );
	return domain === 'gmail.com' && domains.includes( domain );

}

// What's kept of a Google account: its id (sub), email in lower case, and name, given name,
// picture and Workspace domain, trimmed and shortened.
export function profileFrom( claims ) {

	const text = ( value, max ) => typeof value === 'string' ? value.trim().slice( 0, max ) : '';
	const picture = text( claims.picture, 2000 );
	return {
		sub: claims.sub,
		email: claims.email.toLowerCase(),
		name: text( claims.name, 200 ),
		givenName: text( claims.given_name, 100 ),
		picture: picture.startsWith( 'https://' ) ? picture : '',
		hd: text( claims.hd, 255 ).toLowerCase(),
	};

}

// Tests sign their own tokens and serve their own keys. Only an address on this machine is
// accepted, so a stray setting on the real site can't make it trust anyone else's keys.
export function testCertsUrl( env ) {

	if ( ! env.GOOGLE_JWKS_URL ) return undefined;
	const url = new URL( env.GOOGLE_JWKS_URL );
	if ( url.protocol !== 'http:' || ! LOCAL_HOSTS.includes( url.hostname ) ) throw new HttpError( 503, 'Sign-in isn\'t set up' );
	return url.href;

}

// --- the cookie ------------------------------------------------------------------------

// Secure cookies need https. Plain http is allowed only on this machine, for local development;
// anywhere else the cookie is Secure and uses the __Host- prefix, which browsers only accept
// from https, for this exact host and the whole site.
function isLocalDev( url ) {

	return url.protocol === 'http:' && LOCAL_HOSTS.includes( url.hostname );

}

// A session cookie named `name` (twin_session here): write( url, token, maxAge ) is its Set-Cookie
// value, and read( request, url ) the token a request has in it, or null. HttpOnly, so the page's
// scripts never see it, and SameSite=Lax, so other sites' requests mostly come without it.
export function sessionCookies( name ) {

	const cookieName = url => isLocalDev( url ) ? name : `__Host-${ name }`;
	return {
		write( url, token, maxAge ) {

			const secure = isLocalDev( url ) ? '' : '; Secure';
			return `${ cookieName( url ) }=${ token }; Max-Age=${ maxAge }; Path=/; HttpOnly; SameSite=Lax${ secure }`;

		},
		read( request, url ) {

			const wanted = cookieName( url );
			for ( const part of ( request.headers.get( 'Cookie' ) ?? '' ).split( ';' ) ) {

				const [ key, value ] = part.trim().split( '=' );
				if ( key === wanted && TOKEN_PATTERN.test( value ?? '' ) ) return value;

			}

			return null;

		},
	};

}
