import { verifyIdToken } from '../google.js';
import { HttpError, base64url, fromBase64url, isObject, json, noContent, randomToken, readJson } from '../http.js';
import { profileFrom, testCertsUrl } from '../sessions.js';
import { cleanUsername, passwordProblem, passwordText, usernameKey } from '../../src/drive-app/password-rules.js';
import { SIGN_INS_DAILY, accountById, currentAccount, meFor, sessionHash, signedIn, signedOutCookie } from './accounts.js';
import { nameAllowed } from './names.js';
import { database, takeTurn } from './players.js';
import { addressOf, googleClientId, setting } from './settings.js';
import { MAX_TOKEN, verifyTurnstile } from './turnstile.js';

// Username and password accounts (docs/world-drive.md, "Username and password accounts"): beside
// "Sign in with Google", an account can be made with a username and a password, and signed in to
// with them, getting the same session (accounts.js) to the same kind of account: the Supporter Pass,
// the player's level, times and ghosts, nickname and Garage are the account's, whichever way you
// signed in. A Google account can add a username and password, and a username's account can link a
// Google account, and then either signs in. There's no email, so a forgotten password can't be
// reset, unless Google is linked too.
//
// Passwords are hashed with PBKDF2-SHA-256 (WebCrypto, crypto.subtle) with a random salt of 16 bytes
// an account, at ITERATIONS, the most the Workers runtime allows (it refuses more than 100,000):
// about 16 to 18 ms of CPU a hash as measured in workerd (docs/world-drive.md says why that count,
// and what it means on the Free plan's 10 ms). Each hash keeps its count, so if it's ever raised, a
// password is hashed again at its next sign-in.
// The rules for usernames and passwords are password-rules.js's, shared with the page. Nothing here
// ever logs, keeps or sends a password anywhere: only its hash is kept.
//
// Guessing is held back by DriveLimits (limits.js's passwordCheck): a visitor (an address, an IPv6
// one by its /48) may fail ADDRESS_FAILS times a day, and once a username has failed FREE_FAILS
// times in a day each further try for it needs a robot check (Turnstile) and waits FAIL_GAP after
// the last failure. Nothing locks a username, so a stranger can't keep its owner out. Making an
// account always needs a robot check, and a visitor makes SIGN_UPS_DAILY a day at most.
//
// Settings: PASSWORD_ACCOUNTS 'off' switches it off (anything else, or unset, is on, given the
// database and Turnstile's secret); PASSWORD_ITERATIONS (tests only, or to lower the count on the
// Free plan if sign-ins were ever cut off for CPU) the iterations new hashes are made with, from
// MIN_ITERATIONS to ITERATIONS.

export const ITERATIONS = 100000;
const MIN_ITERATIONS = 10000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
// A Google id for an account with no Google account linked (see migration 0008).
export const NO_GOOGLE = 'none:';
// Sign-ins failed by one visitor in a day, a username's failures before each try needs a robot check,
// and then the least time between them (ms).
export const ADDRESS_FAILS = 20;
export const FREE_FAILS = 5;
export const FAIL_GAP = 5000;
// Accounts a visitor may make in a day; and changes (a password set or changed, Google linked or
// unlinked, signing out everywhere) a visitor may make in a day.
const SIGN_UPS_DAILY = 10;
const CHANGES_DAILY = 30;
const WRONG = 'Wrong username or password';
const BODY = 2048;
const encoder = new TextEncoder();

// A salt and a hash that stand in for an account's when the username has none, so a sign-in for a
// username nobody has is hashed just as one with the wrong password is, and takes as long. Both are
// random bytes, never a hash of anything, so no password can match them (made once per Worker
// instance, and costing nothing to make: no hashing, so even the first stranger's try takes one
// hash's time, as everyone's does).
let standIn = null;

// Whether usernames and passwords are on: the database, Turnstile's secret (making an account needs
// a robot check) and not switched off. /api/config tells the page.
export function passwordsOn( env ) {

	return !! env.DB && !! env.TURNSTILE_SECRET && env.PASSWORD_ACCOUNTS !== 'off';

}

// The iterations new hashes are made with: ITERATIONS, or PASSWORD_ITERATIONS when it's set to a
// count from MIN_ITERATIONS to ITERATIONS.
export function iterationsFor( env ) {

	const n = setting( env.PASSWORD_ITERATIONS, ITERATIONS );
	return n >= MIN_ITERATIONS && n <= ITERATIONS ? n : ITERATIONS;

}

// The PBKDF2-SHA-256 of `password` (as passwordText gives it) with `salt` (bytes), 32 bytes.
export async function hashPassword( password, salt, iterations ) {

	const key = await crypto.subtle.importKey( 'raw', encoder.encode( password ), 'PBKDF2', false, [ 'deriveBits' ] );
	return new Uint8Array( await crypto.subtle.deriveBits( { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS ) );

}

// { password_hash, salt, iterations } for a new password, as logins keeps them.
async function newHash( env, password ) {

	const salt = crypto.getRandomValues( new Uint8Array( SALT_BYTES ) );
	const iterations = iterationsFor( env );
	return { password_hash: base64url( await hashPassword( password, salt, iterations ) ), salt: base64url( salt ), iterations };

}

// Whether `password` is the one hashed in `row` ({ password_hash, salt, iterations }), compared in
// constant time (the time doesn't say how much of it matched).
async function passwordMatches( password, row ) {

	const made = await hashPassword( password, fromBase64url( row.salt ), row.iterations );
	return sameBytes( made, fromBase64url( row.password_hash ) );

}

function sameBytes( a, b ) {

	if ( a.length !== b.length ) return false;
	if ( typeof crypto.subtle.timingSafeEqual === 'function' ) return crypto.subtle.timingSafeEqual( a, b );
	let diff = 0;
	for ( let i = 0; i < a.length; i ++ ) diff |= a[ i ] ^ b[ i ];
	return diff === 0;

}

// The stand-in's row, with the count new hashes are made with, as a real one would have.
function standInFor( env ) {

	const iterations = iterationsFor( env );
	if ( standIn?.iterations !== iterations ) {

		const random = bytes => base64url( crypto.getRandomValues( new Uint8Array( bytes ) ) );
		standIn = { salt: random( SALT_BYTES ), iterations, password_hash: random( HASH_BITS / 8 ) };

	}

	return standIn;

}

// The request's body as an object of at most BODY bytes, or a 400.
async function body( request ) {

	const value = await readJson( request, BODY );
	if ( ! isObject( value ) ) throw new HttpError( 400, 'Bad request' );
	return value;

}

function checkOn( env ) {

	if ( ! passwordsOn( env ) ) throw new HttpError( 503, 'Not set up yet' );
	return database( env );

}

// A robot check's token, passed: true if it's good, false if there's none; a 403 (reason 'robot')
// for one Turnstile turns away, a 400 for one that isn't a token at all.
async function robotPassed( env, request, token ) {

	if ( token === undefined || token === null || token === '' ) return false;
	if ( typeof token !== 'string' || token.length > MAX_TOKEN ) throw new HttpError( 400, 'Bad request' );
	const check = await verifyTurnstile( env, token, request.headers.get( 'CF-Connecting-IP' ) ?? '' );
	if ( check.unavailable ) throw new HttpError( 503, 'Couldn\'t check right now. Try again' );
	if ( ! check.ok ) throw new HttpError( 403, 'The robot check didn\'t pass. Try again', { reason: 'robot' } );
	return true;

}

// A username for a new login, or a 400 saying what's wrong with it: its shape, then the nickname's
// filter (names.js: slurs, and names that pass for World Drive: admin, support...).
function newUsername( value ) {

	const username = cleanUsername( value );
	if ( ! username ) throw new HttpError( 400, 'Usernames are 3 to 20 letters (a to z), digits, _ or -' );
	if ( ! nameAllowed( username ) ) throw new HttpError( 400, 'That username isn\'t allowed. Pick another' );
	return username;

}

// A new password for `username`, as it's hashed, or a 400 saying what's wrong with it.
function newPassword( value, username ) {

	const problem = passwordProblem( value, username );
	if ( problem ) throw new HttpError( 400, problem );
	return passwordText( value );

}

// Whether `password` is right for the login of `key` (a username's key): through DriveLimits'
// check first (a 429, or a 403 asking for a robot check), and a failure counted there. A username
// nobody has is hashed against the stand-in, so it takes as long and says the same as a wrong
// password. The login's row ({ account_id, username, password_hash, salt, iterations }), or null.
async function checkPassword( { request, env, limits, now }, key, password, robot ) {

	const db = database( env );
	const ip = addressOf( request, 48 );
	const gate = await limits.passwordCheck( ip, key, { now, robot, addressFails: ADDRESS_FAILS, freeFails: FREE_FAILS, gap: FAIL_GAP } );
	if ( ! gate.ok ) {

		if ( gate.reason === 'robot' ) throw new HttpError( 403, 'Show you\'re not a robot first', { reason: 'robot' } );
		const message = gate.reason === 'address' ? 'Too many wrong passwords from here today. Try again tomorrow' : 'Wait a few seconds and try again';
		throw new HttpError( 429, message, { reason: gate.reason, retryAfter: gate.retryAfter }, { 'Retry-After': String( gate.retryAfter ) } );

	}

	const row = key ? await db.prepare( 'SELECT account_id, username, password_hash, salt, iterations FROM logins WHERE username_key = ?' ).bind( key ).first() : null;
	const good = await passwordMatches( password ?? '', row ?? standInFor( env ) ) && !! row && password !== null;
	if ( good ) return row;
	await limits.passwordFailed( ip, key, { now } );
	return null;

}

// The password hashed again with the count new hashes are made with, when its own is lower.
async function rehashIfOld( env, row, password, now ) {

	const iterations = iterationsFor( env );
	if ( row.iterations >= iterations ) return;
	const hash = await newHash( env, password );
	await database( env ).prepare( 'UPDATE logins SET password_hash = ?, salt = ?, iterations = ?, changed_at = ? WHERE account_id = ? AND iterations < ?' )
		.bind( hash.password_hash, hash.salt, hash.iterations, now, row.account_id, iterations ).run();

}

// POST /api/account/sign-up { username, password, token }: a new account with this username and
// password, signed in (as /api/session answers: /api/me's body and the session cookie). The rules
// are checked first (a 400 says which), then the robot check (token, from Turnstile's widget: a 403
// with reason 'robot' if it's missing or turned away), then the visitor's SIGN_UPS_DAILY (429), and
// a username someone has, whatever its case, is a 409.
export async function signUp( context ) {

	const { request, env, limits, now } = context;
	const db = checkOn( env );
	const sent = await body( request );
	const username = newUsername( sent.username );
	const password = newPassword( sent.password, username );
	if ( ! await robotPassed( env, request, sent.token ) ) throw new HttpError( 403, 'Show you\'re not a robot first', { reason: 'robot' } );
	await takeTurn( limits, request, 'sign-up', now, SIGN_UPS_DAILY, 48 );
	const key = usernameKey( username );
	if ( await db.prepare( 'SELECT 1 AS taken FROM logins WHERE username_key = ?' ).bind( key ).first() ) throw new HttpError( 409, 'That username is taken' );
	const hash = await newHash( env, password );
	// The account and its login at once; the login's UNIQUE key decides between two at the same time,
	// and the account made for the one that lost is taken back.
	const { id } = await db.prepare( 'INSERT INTO accounts ( google_sub, email, name, created_at, last_login_at ) VALUES ( ?, \'\', \'\', ?, ? ) RETURNING id' )
		.bind( NO_GOOGLE + randomToken( 16 ), now, now ).first();
	const [ added ] = await db.batch( [
		db.prepare( `INSERT INTO logins ( account_id, username, username_key, password_hash, salt, iterations, created_at, changed_at )
			VALUES ( ?, ?, ?, ?, ?, ?, ?, ? ) ON CONFLICT ( username_key ) DO NOTHING` ).bind( id, username, key, hash.password_hash, hash.salt, hash.iterations, now, now ),
		db.prepare( 'DELETE FROM accounts WHERE id = ?1 AND NOT EXISTS ( SELECT 1 FROM logins WHERE account_id = ?1 )' ).bind( id ),
	] );
	if ( ! added.meta.changes ) throw new HttpError( 409, 'That username is taken' );
	return signedIn( context, id );

}

// POST /api/account/sign-in { username, password, token? }: signed in to the username's account (as
// signUp answers). A wrong password and a username nobody has are the same 401, as alike in time as
// hashing makes them. DriveLimits may answer first: 429 (too many failures from this visitor today,
// or a username's try too soon after its last failure) or 403 with reason 'robot' (send a robot
// check's token with the next try).
export async function passwordSignIn( context ) {

	const { request, env, now } = context;
	const db = checkOn( env );
	const sent = await body( request );
	if ( typeof sent.username !== 'string' || typeof sent.password !== 'string' ) throw new HttpError( 400, 'Bad request' );
	const robot = await robotPassed( env, request, sent.token );
	const username = cleanUsername( sent.username );
	// A username that can't be one is tried, and counted, as one nobody has (under its lower case, so
	// its failures still slow it down as a real one's would).
	const key = username ? usernameKey( username ) : sent.username.slice( 0, 64 ).toLowerCase();
	const password = passwordText( sent.password );
	const row = await checkPassword( context, key, password, robot );
	if ( ! row ) throw new HttpError( 401, WRONG );
	// Each sign-in is a new session kept for 30 days, so a visitor's are counted, with Google's
	// (accounts.js's SIGN_INS_DAILY): someone who knows a password still can't fill the database with
	// sessions.
	await takeTurn( context.limits, request, 'sign-in', now, SIGN_INS_DAILY );
	await rehashIfOld( env, row, password, now );
	await db.prepare( 'UPDATE accounts SET last_login_at = ? WHERE id = ?' ).bind( now, row.account_id ).run();
	return signedIn( context, row.account_id );

}

// The signed-in account, or a 401.
async function signedInAccount( context ) {

	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	return account;

}

// One of the visitor's CHANGES_DAILY (a 429 past them), taken once a change has been checked.
function aChange( { limits, request, now } ) {

	return takeTurn( limits, request, 'account', now, CHANGES_DAILY, 48 );

}

// The signed-in account, with one of the visitor's changes taken.
async function changing( context ) {

	const account = await signedInAccount( context );
	await aChange( context );
	return account;

}

// POST /api/account/password { current, password, token? }, signed in: the account's password
// changed, which needs the current one (checked and counted as a sign-in is), and every other
// session of the account signed out (this browser stays signed in). Signed in with Google and no
// username yet: { username, password }, a username and password added (no current one to give).
// Answers /api/me's body.
export async function setPassword( context ) {

	const { request, env, url, now } = context;
	const db = checkOn( env );
	const sent = await body( request );
	const account = await signedInAccount( context );
	if ( ! account.username ) {

		const username = newUsername( sent.username );
		const password = newPassword( sent.password, username );
		await aChange( context );
		const hash = await newHash( env, password );
		const { meta } = await db.prepare( `INSERT INTO logins ( account_id, username, username_key, password_hash, salt, iterations, created_at, changed_at )
			VALUES ( ?, ?, ?, ?, ?, ?, ?, ? ) ON CONFLICT DO NOTHING` ).bind( account.id, username, usernameKey( username ), hash.password_hash, hash.salt, hash.iterations, now, now ).run();
		if ( ! meta.changes ) throw new HttpError( 409, 'That username is taken' );
		return json( await meFor( env, await accountById( db, account.id ) ) );

	}

	if ( typeof sent.current !== 'string' ) throw new HttpError( 400, 'Bad request' );
	const password = newPassword( sent.password, account.username );
	await aChange( context );
	const robot = await robotPassed( env, request, sent.token );
	const row = await checkPassword( context, usernameKey( account.username ), passwordText( sent.current ), robot );
	if ( ! row || row.account_id !== account.id ) throw new HttpError( 401, 'That isn\'t your current password' );
	const hash = await newHash( env, password );
	await db.batch( [
		db.prepare( 'UPDATE logins SET password_hash = ?, salt = ?, iterations = ?, changed_at = ? WHERE account_id = ?' ).bind( hash.password_hash, hash.salt, hash.iterations, now, account.id ),
		db.prepare( 'DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?' ).bind( account.id, await sessionHash( request, url ) ?? '' ),
	] );
	return json( await meFor( env, await accountById( db, account.id ) ) );

}

// DELETE /api/account/password, signed in: the username and password taken off the account, only
// while a Google account is linked to sign in with instead (else a 409). Answers /api/me's body.
export async function removePassword( context ) {

	const { env } = context;
	const db = checkOn( env );
	const account = await changing( context );
	if ( ! account.google ) throw new HttpError( 409, 'Link Google first: it\'s your only way to sign in' );
	await db.prepare( 'DELETE FROM logins WHERE account_id = ?' ).bind( account.id ).run();
	return json( await meFor( env, await accountById( db, account.id ) ) );

}

// POST /api/account/google { credential }, signed in: the Google account the ID token is for (from
// Google's button, checked as a sign-in's is) linked to this account, so either signs in. A Google
// account already with an account of its own here is only taken over when that account has nothing
// to lose (no username, no player linked to it and no purchase of its own): then it's deleted, and
// its sessions with it. Otherwise it's a 409 saying so, and nothing changes: nothing is merged, so
// no pass, level or time is ever dropped or doubled (docs/world-drive.md). An account with another
// Google account linked already is a 409 too. Answers /api/me's body.
export async function linkGoogle( context ) {

	const { request, env, now } = context;
	const db = checkOn( env );
	const clientId = googleClientId( env );
	if ( ! clientId ) throw new HttpError( 503, 'Sign-in isn\'t set up' );
	const sent = await body( request );
	const claims = await verifyIdToken( sent.credential, { clientId, certsUrl: testCertsUrl( env ) } );
	const account = await changing( context );
	const { sub, email, name } = profileFrom( claims );
	const other = await db.prepare( `SELECT a.id,
		EXISTS ( SELECT 1 FROM logins WHERE account_id = a.id ) OR EXISTS ( SELECT 1 FROM players WHERE account_id = a.id )
			OR EXISTS ( SELECT 1 FROM purchases WHERE account_id = a.id ) AS keeps FROM accounts a WHERE a.google_sub = ?` ).bind( sub ).first();
	if ( other?.id === account.id ) return json( await meFor( env, account ) );
	if ( account.google ) throw new HttpError( 409, 'This account has a Google account linked already. Unlink it first' );
	if ( other?.keeps ) throw new HttpError( 409, 'That Google account has its own World Drive account, with its own progress or pass. Sign in with Google to use that one' );
	await db.batch( [
		...( other ? [ db.prepare( 'DELETE FROM accounts WHERE id = ? AND google_sub = ?' ).bind( other.id, sub ) ] : [] ),
		db.prepare( 'UPDATE accounts SET google_sub = ?, email = ?, name = ?, last_login_at = ? WHERE id = ?' ).bind( sub, email, name, now, account.id ),
	] );
	return json( await meFor( env, await accountById( db, account.id ) ) );

}

// DELETE /api/account/google, signed in: the Google account unlinked, only while the account has a
// username and password to sign in with instead (else a 409). Its email and name go with it; a pass
// bought with that email before signing in (a purchase that's nobody's yet) becomes the account's
// first, so unlinking never loses a pass. One given by SUPPORTER_EMAILS goes with the email.
// Answers /api/me's body.
export async function unlinkGoogle( context ) {

	const { env } = context;
	const db = checkOn( env );
	const account = await changing( context );
	if ( ! account.google ) return json( await meFor( env, account ) );
	if ( ! account.username ) throw new HttpError( 409, 'Add a username and password first: Google is your only way to sign in' );
	await db.batch( [
		db.prepare( 'UPDATE purchases SET account_id = ?1 WHERE account_id IS NULL AND email = ?2 AND ?2 <> \'\'' ).bind( account.id, account.email ),
		db.prepare( 'UPDATE accounts SET google_sub = ?, email = \'\', name = \'\' WHERE id = ?' ).bind( NO_GOOGLE + randomToken( 16 ), account.id ),
	] );
	return json( await meFor( env, await accountById( db, account.id ) ) );

}

// POST /api/account/sign-out-everywhere, signed in: every session of the account deleted, this
// browser's too (and its cookie cleared).
export async function signOutEverywhere( context ) {

	const { env, url } = context;
	const db = checkOn( env );
	const account = await changing( context );
	await db.prepare( 'DELETE FROM sessions WHERE account_id = ?' ).bind( account.id ).run();
	return noContent( { 'Set-Cookie': signedOutCookie( url ) } );

}
