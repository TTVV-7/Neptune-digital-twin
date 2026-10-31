import { verifyIdToken } from '../google.js';
import { HttpError, isObject, json, noContent, randomToken, readJson, sha256Hex } from '../http.js';
import { SESSION_SECONDS, profileFrom, sessionCookies, testCertsUrl } from '../sessions.js';
import { PERIODS, forgetBoards } from './boards.js';
import { authenticate, credentials, database, takeTurn } from './players.js';
import { isSupporter, purchaseFor } from './supporter.js';
import { googleClientId } from './settings.js';

// World Drive's accounts (docs/world-drive.md): "Sign in with Google", for the Supporter Pass only,
// so a pass bought once is yours in any browser. Driving and the leaderboard never need one. The
// page gets an ID token from Google's button and posts it here; it's checked as the construction
// app checks its own (google.js: Google's signature, our client id, not expired, a verified email),
// and the answer comes with a session cookie for 30 days, made and read as that app's (sessions.js)
// under a name of its own: HttpOnly, SameSite=Lax, and on https Secure with the __Host- prefix.
// Only the SHA-256 of the cookie's token is kept. Anyone with a Google account can sign in.

const cookies = sessionCookies( 'wd_session' );
// Sign-ins, and players linked, a visitor may make in a day (counted as the leaderboard's names are,
// limits.js). A Google token can be sent again for the hour it's good for, and each sign-in is a new
// session kept for 30 days, so this keeps a script from filling the database with them. Sessions
// last a month, so nobody signing in for themselves comes near it (a whole school on one address
// included).
const SIGN_INS_DAILY = 50;
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
	await takeTurn( limits, request, 'sign-in', now, SIGN_INS_DAILY );
	const { sub, email, name } = profileFrom( claims );
	const account = await db.prepare( `INSERT INTO accounts ( google_sub, email, name, created_at, last_login_at ) VALUES ( ?1, ?2, ?3, ?4, ?4 )
		ON CONFLICT ( google_sub ) DO UPDATE SET email = excluded.email, name = excluded.name, last_login_at = excluded.last_login_at
		RETURNING id, email, name` ).bind( sub, email, name, now ).first();

	// A fresh session every time, replacing any this browser had, and expired ones are tidied away.
	const token = randomToken( 32 );
	const old = cookies.read( request, url );
	await db.batch( [
		db.prepare( 'DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?' ).bind( now, old ? await sha256Hex( old ) : '' ),
		db.prepare( 'INSERT INTO sessions ( token_hash, account_id, created_at, expires_at ) VALUES ( ?, ?, ?, ? )' )
			.bind( await sha256Hex( token ), account.id, now, now + SESSION_SECONDS * 1000 ),
	] );
	return json( await meFor( env, account ), 200, { 'Set-Cookie': cookies.write( url, token, SESSION_SECONDS ) } );

}

// DELETE /api/session: signed out, here (other browsers stay signed in).
export async function signOut( { request, env, url } ) {

	const token = cookies.read( request, url );
	if ( token && env.DB ) await env.DB.prepare( 'DELETE FROM sessions WHERE token_hash = ?' ).bind( await sha256Hex( token ) ).run();
	return noContent( { 'Set-Cookie': cookies.write( url, '', 0 ) } );

}

// The signed-in account ({ id, email, name }), or null: none without a session cookie, a database
// or sign-in set up.
export async function currentAccount( { request, env, url, now } ) {

	if ( ! googleClientId( env ) || ! env.DB ) return null;
	const token = cookies.read( request, url );
	if ( ! token ) return null;
	return await env.DB.prepare( `SELECT accounts.id, accounts.email, accounts.name FROM sessions JOIN accounts ON accounts.id = sessions.account_id
		WHERE sessions.token_hash = ? AND sessions.expires_at > ?` ).bind( await sha256Hex( token ), now ).first();

}

// GET /api/me: { signedIn, name?, email?, supporter, purchase: { enabled, link?, price?,
// clientReferenceId? } }.
export async function getMe( context ) {

	return json( await meFor( context.env, await currentAccount( context ) ) );

}

async function meFor( env, account ) {

	if ( ! account ) return { signedIn: false, supporter: false, purchase: purchaseFor( env, null ) };
	return { signedIn: true, name: account.name, email: account.email, supporter: await isSupporter( env, account ), purchase: purchaseFor( env, account ) };

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
	await takeTurn( limits, request, 'link', now, LINKS_DAILY );
	await db.prepare( 'UPDATE players SET account_id = ? WHERE id = ?' ).bind( account.id, id ).run();
	// The ⭐ on today's, this week's and the all-time boards straight away (the boards of one place
	// catch up within half a minute).
	await forgetBoards( url, Object.values( PERIODS ).map( period => [ period( now ), '' ] ), id );
	return json( { id, name: player.name } );

}
