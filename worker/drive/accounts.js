import { verifyIdToken } from '../google.js';
import { HttpError, isObject, json, noContent, randomToken, readJson, sha256Hex } from '../http.js';
import { SESSION_SECONDS, profileFrom, sessionCookies, testCertsUrl } from '../sessions.js';
import { PERIODS, forgetBoards } from './boards.js';
import { authenticate, credentials, database, takeTurn } from './players.js';
import { isSupporter, purchaseFor } from './supporter.js';
import { googleClientId } from './settings.js';

// World Drive's accounts (docs/world-drive.md): "Sign in with Google", or a username and a password
// (logins.js), for the Supporter Pass, so a pass bought once is yours in any browser, and for the
// player's level and times on every device. Driving and the leaderboard never need one. The
// page gets an ID token from Google's button and posts it here; it's checked as the construction
// app checks its own (google.js: Google's signature, our client id, not expired, a verified email),
// and the answer comes with a session cookie for 30 days, made and read as that app's (sessions.js)
// under a name of its own: HttpOnly, SameSite=Lax, and on https Secure with the __Host- prefix.
// Only the SHA-256 of the cookie's token is kept. Anyone with a Google account can sign in. A
// username's sign-in (logins.js) makes the same session, for the same account when both are
// linked: one account, one player, whichever way you signed in.

const cookies = sessionCookies( 'wd_session' );
// Sign-ins, and players linked, a visitor may make in a day (counted as the leaderboard's names
// are, limits.js). A Google token can be sent again for the hour it's good for, and each sign-in is
// a new session kept for 30 days, so this keeps a script from filling the database with them. An
// IPv6 visitor is counted by its /48, not its /64: a /48 (which a free tunnel broker hands out)
// holds 65,536 /64s, each of which would otherwise have 50 of its own. Sessions last a month, so
// nobody signing in for themselves comes near it (a whole school on one address included).
export const SIGN_INS_DAILY = 50;
const LINKS_DAILY = 20;

// POST /api/session { credential }: what /api/me says (now signed in), with the session cookie.
export async function signIn( { request, env, url, limits, now } ) {

	const clientId = googleClientId( env );
	if ( ! clientId ) throw new HttpError( 503, 'Sign-in isn\'t set up' );
	const db = database( env );
	const body = await readJson( request, 16 * 1024 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );

	const claims = await verifyIdToken( body.credential, { clientId, certsUrl: testCertsUrl( env ) } );
	// Only a good token is counted.
	await takeTurn( limits, request, 'sign-in', now, SIGN_INS_DAILY, 48 );
	const { sub, email, name } = profileFrom( claims );
	const { id } = await db.prepare( `INSERT INTO accounts ( google_sub, email, name, created_at, last_login_at ) VALUES ( ?1, ?2, ?3, ?4, ?4 )
		ON CONFLICT ( google_sub ) DO UPDATE SET email = excluded.email, name = excluded.name, last_login_at = excluded.last_login_at
		RETURNING id` ).bind( sub, email, name, now ).first();
	return signedIn( { request, env, url, now }, id );

}

// The answer to a sign-in to the account `id` (Google's here, a username's in logins.js): what
// /api/me says, with a new session's cookie. A fresh session every time, replacing any this browser
// had, and expired ones are tidied away.
export async function signedIn( { request, env, url, now }, id ) {

	const db = database( env );
	const token = randomToken( 32 );
	const old = cookies.read( request, url );
	await db.batch( [
		db.prepare( 'DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?' ).bind( now, old ? await sha256Hex( old ) : '' ),
		db.prepare( 'INSERT INTO sessions ( token_hash, account_id, created_at, expires_at ) VALUES ( ?, ?, ?, ? )' )
			.bind( await sha256Hex( token ), id, now, now + SESSION_SECONDS * 1000 ),
	] );
	return json( await meFor( env, await accountById( db, id ) ), 200, { 'Set-Cookie': cookies.write( url, token, SESSION_SECONDS ) } );

}

// The SHA-256 of this browser's session token, or null without one (logins.js keeps this session
// as it signs the account's others out).
export async function sessionHash( request, url ) {

	const token = cookies.read( request, url );
	return token ? await sha256Hex( token ) : null;

}

// The cookie that signs this browser out (with its session already deleted).
export function signedOutCookie( url ) {

	return cookies.write( url, '', 0 );

}

// DELETE /api/session: signed out, here (other browsers stay signed in).
export async function signOut( { request, env, url } ) {

	const token = cookies.read( request, url );
	if ( token && env.DB ) await env.DB.prepare( 'DELETE FROM sessions WHERE token_hash = ?' ).bind( await sha256Hex( token ) ).run();
	return noContent( { 'Set-Cookie': cookies.write( url, '', 0 ) } );

}

// What's read of an account wherever it's used: its id, its Google email and name ('' with no
// Google account linked), whether Google is linked, and its username (null without one).
const ACCOUNT = `SELECT accounts.id, accounts.email, accounts.name, accounts.google_sub NOT LIKE 'none:%' AS google, logins.username
	FROM accounts LEFT JOIN logins ON logins.account_id = accounts.id`;

// The signed-in account ({ id, email, name, google, username }), or null: none without a session
// cookie or a database. (Without Google's sign-in set up a username's can still have made one.)
export async function currentAccount( { request, env, url, now } ) {

	if ( ! env.DB ) return null;
	const token = cookies.read( request, url );
	if ( ! token ) return null;
	return await env.DB.prepare( `${ ACCOUNT } JOIN sessions ON sessions.account_id = accounts.id
		WHERE sessions.token_hash = ? AND sessions.expires_at > ?` ).bind( await sha256Hex( token ), now ).first();

}

// The account `id` as currentAccount reads it.
export async function accountById( db, id ) {

	return await db.prepare( `${ ACCOUNT } WHERE accounts.id = ?` ).bind( id ).first();

}

// GET /api/me: { signedIn, name?, email?, google?, username?, supporter, purchase: { enabled,
// link?, price?, clientReferenceId? } }. google: whether a Google account is linked (name and email
// are its, '' without one); username: the account's own username, or null (it's shown to its owner
// only, never on the boards).
export async function getMe( context ) {

	return json( await meFor( context.env, await currentAccount( context ) ) );

}

export async function meFor( env, account ) {

	if ( ! account ) return { signedIn: false, supporter: false, purchase: purchaseFor( env, null ) };
	return {
		signedIn: true, name: account.name, email: account.email, google: !! account.google, username: account.username ?? null,
		supporter: await isSupporter( env, account ), purchase: purchaseFor( env, account ),
	};

}

// POST /api/player/link { id, secret }, signed in: this browser's leaderboard player becomes the
// account's, so a supporter's ⭐ goes by its name on the boards (and follows the account: it's
// looked up as the boards are, never copied). It takes the player's secret, as renaming does, so
// only the browser that has the player can link it; linked again, it's the last account's.
export async function linkPlayer( context ) {

	const { request, env, url, limits, now } = context;
	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	const db = database( env );
	const body = await readJson( request, 1024 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );
	const { id, secret } = credentials( body );
	const player = await authenticate( db, id, secret );
	await takeTurn( limits, request, 'link', now, LINKS_DAILY, 48 );
	await db.prepare( 'UPDATE players SET account_id = ? WHERE id = ?' ).bind( account.id, id ).run();
	// The ⭐ on today's, this week's and the all-time boards straight away (the boards of one place
	// catch up within half a minute).
	await forgetBoards( url, Object.values( PERIODS ).map( period => [ period( now ), '' ] ), id );
	return json( { id, name: player.name } );

}
