import { verifyIdToken } from '../google.js';
import { HttpError, base64url, fromBase64url, isObject, json, noContent, randomToken, readJson } from '../http.js';
import { profileFrom, testCertsUrl } from '../sessions.js';
import { cleanUsername, passwordProblem, passwordText, usernameKey } from '../../src/drive-app/password-rules.js';
import { SIGN_INS_DAILY, accountById, currentAccount, meFor, sessionHash, signedIn, signedOutCookie } from './accounts.js';
import { isAdmin } from './admin.js';
import { lookKey } from './challenges.js';
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
// Guessing is held back by DriveLimits (limits.js's passwordCheck), which counts each try as it's
// checked (so tries sent all at once are counted as one after another) and gives back the ones that
// got in: once a username has had FREE_FAILS tries in a day, or a visitor (an address, an IPv6 one
// by its /48) ADDRESS_FAILS, each further try needs a robot check (Turnstile) and waits FAIL_GAP
// after the visitor's last try at that username; past HARD_FAILS a visitor tries no more that day.
// Nothing locks a username, and tries from elsewhere never make its owner wait, so a stranger can't
// keep the owner out. Making an account always needs a robot check, and a visitor makes
// SIGN_UPS_DAILY a day at most.
//
// Each of those checks is a Durable Object request, and the Free plan's 100,000 a day are shared
// with every visit, Earth drive and room, so before any of them a visitor's sign-ins, checks of a
// password and changes are held to PASSWORD_TRIES' 10 a minute (Cloudflare's rate limiter: no
// Durable Object request), counted by challenges.js's lookKey (an HMAC of the day and the address,
// an IPv6 one by its /48, never the address itself). And what DriveLimits has said of a visitor for
// the rest of the day (every try, or every try at one username, needs a robot check now; no more
// tries today; its sign-ins or changes for the day used up) is remembered in this Worker instance
// (refused), so a script trying on without robot checks, past HARD_FAILS, or signing in again and
// again with a password it knows, is turned away here, not by another Durable Object request (and
// hash) each time. A sign-in costs two Durable Object requests (the check, and the try given back
// with the day's sign-in taken), a refusal one.
//
// What changes how an account signs in needs fresh proof, not only the session, so a borrowed
// browser or a copied cookie can't take an account over: adding a username and password to a Google
// account needs Google's ID token for it, linking Google to a username's account needs the password,
// unlinking Google needs Google's ID token and taking the password off needs it or Google's. The
// owner's accounts (ADMIN_EMAILS) sign in with Google only: no password is ever added to one.
//
// Settings: PASSWORD_ACCOUNTS 'off' switches it off (anything else, or unset, is on, given the
// database and Turnstile's secret); PASSWORD_ITERATIONS (tests only, or to lower the count on the
// Free plan if sign-ins were ever cut off for CPU) the iterations new hashes are made with, from
// MIN_ITERATIONS to ITERATIONS. PASSWORD_TRIES: the rate limiter binding for a visitor's password
// checks, sign-ins and changes (wrangler.drive.jsonc).

export const ITERATIONS = 100000;
const MIN_ITERATIONS = 10000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
// A Google id for an account with no Google account linked (see migration 0008).
export const NO_GOOGLE = 'none:';
// Tries that didn't get in from one visitor in a day before each needs a robot check, and before it
// tries no more that day; a username's before each try needs a robot check; and then the least time
// between one visitor's tries at a username (ms).
export const ADDRESS_FAILS = 20;
export const HARD_FAILS = 200;
export const FREE_FAILS = 5;
export const FAIL_GAP = 5000;
// Accounts a visitor may make in a day; and changes (a password set or changed, Google linked or
// unlinked, signing out everywhere) a visitor may make in a day.
const SIGN_UPS_DAILY = 10;
const CHANGES_DAILY = 30;
const WRONG = 'Wrong username or password';
// The most a post's body may be (bytes): a robot check's token (up to MAX_TOKEN, 2,048 characters),
// a password (128 bytes, up to 768 as JSON escapes it), a username and the keys fit in BODY; one
// that carries Google's ID token as well (adding a password, linking or unlinking Google, taking
// the password off) in CREDENTIAL_BODY, as /api/session takes a token in (accounts.js).
const BODY = 4096;
const CREDENTIAL_BODY = 16 * 1024;
// The most visitors this Worker instance remembers DriveLimits' word for (refused) before it
// forgets them all and starts again.
const REMEMBERED = 10000;
const encoder = new TextEncoder();

// A salt and a hash that stand in for an account's when the username has none, so a sign-in for a
// username nobody has is hashed just as one with the wrong password is, and takes as long. Both are
// random bytes, never a hash of anything, so no password can match them (made once per Worker
// instance, and costing nothing to make: no hashing, so even the first stranger's try takes one
// hash's time, as everyone's does). Always at ITERATIONS, the most any stored hash can have.
let standIn = null;
// What DriveLimits has said of a visitor today, by its lookKey (which is the day's): 'robot' (every
// try from it needs a robot check now) or { until } (no more tries till then, ms), forgotten the
// moment a try from it gets in. And, under the lookKey with a word after it, what lasts the day
// whatever gets in: '<lookKey> sign-in' and '<lookKey> account' the time (ms) the visitor's day of
// sign-ins (SIGN_INS_DAILY) or changes (CHANGES_DAILY) is used up till, so a script signing in
// again and again with a password it knows costs no hash and no Durable Object request past them;
// and '<lookKey> <username key>' 'robot', a username asking this visitor for a robot check (from
// its FREE_FAILS). Only a shortcut: another instance asks DriveLimits, and is told the same; and a
// 'robot' gone stale (it never does within the day) would only ask for a robot check that then goes
// on to DriveLimits.
const refused = new Map();

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

// The stand-in's row.
function standInRow() {

	const random = bytes => base64url( crypto.getRandomValues( new Uint8Array( bytes ) ) );
	standIn ??= { salt: random( SALT_BYTES ), iterations: ITERATIONS, password_hash: random( HASH_BITS / 8 ) };
	return standIn;

}

// The request's body as an object of at most `most` bytes (a 413 past it), or a 400.
async function body( request, most = BODY ) {

	const value = await readJson( request, most );
	if ( ! isObject( value ) ) throw new HttpError( 400, 'Bad request' );
	return value;

}

function checkOn( env ) {

	if ( ! passwordsOn( env ) ) throw new HttpError( 503, 'Not set up yet' );
	return database( env );

}

// One of the visitor's PASSWORD_TRIES a minute, taken once a request (whatever it goes on to check)
// and before anything costs a Durable Object request: a 429 past them. The visitor's lookKey.
function tryGate( context ) {

	return context.tried ??= ( async () => {

		const { env, request, now } = context;
		const key = await lookKey( env, request, now );
		if ( env.PASSWORD_TRIES && ! ( await env.PASSWORD_TRIES.limit( { key } ) ).success ) {

			throw new HttpError( 429, 'Too many tries. Wait a minute and try again', { reason: 'busy', retryAfter: 60 }, { 'Retry-After': '60' } );

		}

		return key;

	} )();

}

function addressRefusal( retryAfter ) {

	return new HttpError( 429, 'Too many wrong passwords from here today. Try again tomorrow', { reason: 'address', retryAfter }, { 'Retry-After': String( retryAfter ) } );

}

// A 429 for a day's turns used up (as players.js's takeTurn says it), `retryAfter` seconds till
// midnight UTC.
function allForToday( retryAfter ) {

	return new HttpError( 429, 'That\'s all for today. Try again tomorrow', { retryAfter }, { 'Retry-After': String( retryAfter ) } );

}

// Remembers in refused that the visitor's day of `what` ('sign-in' or 'account') is used up for
// `retryAfter` seconds from `now`.
function spent( visitor, what, now, retryAfter ) {

	if ( refused.size >= REMEMBERED ) refused.clear();
	refused.set( `${ visitor } ${ what }`, now + retryAfter * 1000 );

}

// A 429 if refused remembers the visitor's day of `what` as used up.
function notSpent( visitor, what, now ) {

	const until = refused.get( `${ visitor } ${ what }` );
	if ( until > now ) throw allForToday( Math.ceil( ( until - now ) / 1000 ) );

}

function robotRefusal() {

	return new HttpError( 403, 'Show you\'re not a robot first', { reason: 'robot' } );

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
// check first (a 429, or a 403 asking for a robot check), which counts the try, given back if it
// gets in; before that the visitor's PASSWORD_TRIES (tryGate), and what DriveLimits has said of it
// today (refused), so a refusal it would give again costs no Durable Object request. A username
// nobody has is hashed against the stand-in, so it takes as long and says the same as a wrong
// password; and a wrong password for a hash made with fewer iterations than the
// stand-in's (PASSWORD_ITERATIONS lowered) is made up to the stand-in's with more hashing, so a
// refusal always costs ITERATIONS and its time never says whether the username is someone's.
// For a sign-in, `turn` ({ kind: 'sign-in', limit: SIGN_INS_DAILY }) has DriveLimits say first
// whether the visitor has a sign-in left today (a 429 if not, remembered in refused, before any
// hashing), and a success gives the try back and takes that turn in one request
// (passwordSignedIn), so a sign-in costs two Durable Object requests and a refusal one.
// The login's row ({ account_id, username, password_hash, salt, iterations }), or null.
async function checkPassword( context, key, password, robot, turn = null ) {

	const { request, env, limits, now } = context;
	const db = database( env );
	const ip = addressOf( request, 48 );
	const visitor = await tryGate( context );
	const known = refused.get( visitor );
	if ( known?.until > now ) throw addressRefusal( Math.ceil( ( known.until - now ) / 1000 ) );
	if ( ! robot && ( known === 'robot' || refused.get( `${ visitor } ${ key }` ) === 'robot' ) ) throw robotRefusal();
	const gate = await limits.passwordCheck( ip, key, { now, robot, addressFails: ADDRESS_FAILS, hardFails: HARD_FAILS, freeFails: FREE_FAILS, gap: FAIL_GAP, turn } );
	if ( ! gate.ok ) {

		// Remembered for the rest of the day: the visitor's own answers under its lookKey, a
		// username's robot check under the visitor's and that username's together (its next try
		// from here may be at another username, which is asked about afresh).
		if ( refused.size >= REMEMBERED ) refused.clear();
		if ( gate.reason === 'turns' ) {

			spent( visitor, 'sign-in', now, gate.retryAfter );
			throw allForToday( gate.retryAfter );

		}

		if ( gate.reason === 'address' ) refused.set( visitor, { until: now + gate.retryAfter * 1000 } );
		if ( gate.reason === 'robot' ) refused.set( gate.visitor ? visitor : `${ visitor } ${ key }`, 'robot' );
		if ( gate.reason === 'robot' ) throw robotRefusal();
		if ( gate.reason === 'address' ) throw addressRefusal( gate.retryAfter );
		throw new HttpError( 429, 'Wait a few seconds and try again', { reason: gate.reason, retryAfter: gate.retryAfter }, { 'Retry-After': String( gate.retryAfter ) } );

	}

	const row = key ? await db.prepare( 'SELECT account_id, username, password_hash, salt, iterations FROM logins WHERE username_key = ?' ).bind( key ).first() : null;
	const standing = standInRow();
	const good = await passwordMatches( password ?? '', row ?? standing ) && !! row && password !== null;
	if ( good ) {

		refused.delete( visitor );
		refused.delete( `${ visitor } ${ key }` );
		if ( ! turn ) {

			await limits.passwordSucceeded( ip, key, { now } );
			return row;

		}

		const signed = await limits.passwordSignedIn( ip, key, { now, ...turn } );
		if ( signed.ok ) return row;
		spent( visitor, 'sign-in', now, signed.retryAfter );
		throw allForToday( signed.retryAfter );

	}

	if ( row && row.iterations < standing.iterations ) await hashPassword( password ?? '', fromBase64url( standing.salt ), standing.iterations - row.iterations );
	return null;

}

// The password hashed again with the count new hashes are made with, when its own is another (lower
// when that's been raised, higher when PASSWORD_ITERATIONS has lowered it to spare CPU).
async function rehashIfOld( env, row, password, now ) {

	const iterations = iterationsFor( env );
	if ( row.iterations === iterations ) return;
	const hash = await newHash( env, password );
	await database( env ).prepare( 'UPDATE logins SET password_hash = ?, salt = ?, iterations = ?, changed_at = ? WHERE account_id = ? AND iterations <> ?' )
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
	const id = await newAccount( db, { username, key, hash: await newHash( env, password ), now } );
	if ( ! id ) throw new HttpError( 409, 'That username is taken' );
	return signedIn( context, id );

}

// A new account with a login for `username` (its `key`, `hash` as newHash makes it): its id, or null
// when the username was taken first. The account and its login in one batch (one transaction: if it
// fails, neither is kept), found by its new random Google id; the login's UNIQUE key decides between
// two at the same time, and the account made for the one that lost is taken back in the same go.
export async function newAccount( db, { username, key, hash, now } ) {

	const sub = NO_GOOGLE + randomToken( 16 );
	const [ , added ] = await db.batch( [
		db.prepare( 'INSERT INTO accounts ( google_sub, email, name, created_at, last_login_at ) VALUES ( ?, \'\', \'\', ?, ? )' ).bind( sub, now, now ),
		db.prepare( `INSERT INTO logins ( account_id, username, username_key, password_hash, salt, iterations, created_at, changed_at )
			SELECT id, ?, ?, ?, ?, ?, ?, ? FROM accounts WHERE google_sub = ? ON CONFLICT ( username_key ) DO NOTHING RETURNING account_id` )
			.bind( username, key, hash.password_hash, hash.salt, hash.iterations, now, now, sub ),
		db.prepare( 'DELETE FROM accounts WHERE google_sub = ? AND NOT EXISTS ( SELECT 1 FROM logins WHERE account_id = accounts.id )' ).bind( sub ),
	] );
	return added.results?.[ 0 ]?.account_id ?? null;

}

// POST /api/account/sign-in { username, password, token? }: signed in to the username's account (as
// signUp answers). A wrong password and a username nobody has are the same 401, as alike in time as
// hashing makes them. DriveLimits may answer first: 429 (too many failures from this visitor today,
// a username's try too soon after its last failure, or the visitor's day of sign-ins used up, even
// with the right password) or 403 with reason 'robot' (send a robot check's token with the next
// try); and before it PASSWORD_TRIES, a 429 with reason 'busy'.
export async function passwordSignIn( context ) {

	const { request, env, now } = context;
	const db = checkOn( env );
	const sent = await body( request );
	if ( typeof sent.username !== 'string' || typeof sent.password !== 'string' ) throw new HttpError( 400, 'Bad request' );
	// A visitor whose sign-ins today are used up (as this instance has heard) is turned away first,
	// before a robot check, a hash or a Durable Object request.
	notSpent( await tryGate( context ), 'sign-in', now );
	const robot = await robotPassed( env, request, sent.token );
	const username = cleanUsername( sent.username );
	// A username that can't be one is tried, and counted, as one nobody has (under its lower case, so
	// its failures still slow it down as a real one's would).
	const key = username ? usernameKey( username ) : sent.username.slice( 0, 64 ).toLowerCase();
	const password = passwordText( sent.password );
	// Each sign-in is a new session kept for 30 days, so a visitor's are counted, with Google's
	// (accounts.js's SIGN_INS_DAILY), an IPv6 one by its /48 (as its tries are: a /48 holds 65,536
	// /64s): someone who knows a password still can't fill the database with sessions. The turn is
	// asked about with the check and taken with the success (checkPassword's `turn`).
	const row = await checkPassword( context, key, password, robot, { kind: 'sign-in', limit: SIGN_INS_DAILY } );
	if ( ! row ) throw new HttpError( 401, WRONG );
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

// One of the visitor's CHANGES_DAILY (a 429 past them), taken once a change has been checked, after
// one of its PASSWORD_TRIES (tryGate). Once DriveLimits has said they're used up, this instance
// remembers it till midnight UTC (refused), and asks no more.
async function aChange( context ) {

	const { limits, request, now } = context;
	const visitor = await tryGate( context );
	notSpent( visitor, 'account', now );
	const turn = await limits.take( 'account', addressOf( request, 48 ), { now, limit: CHANGES_DAILY } );
	if ( turn.ok ) return;
	spent( visitor, 'account', now, turn.retryAfter );
	throw allForToday( turn.retryAfter );

}

// The signed-in account, with one of the visitor's changes taken.
async function changing( context ) {

	const account = await signedInAccount( context );
	await aChange( context );
	return account;

}

// The Google account the ID token `credential` is for (from Google's button, checked as a
// sign-in's is): { sub, email, name }, or a 401 for a token that doesn't pass.
async function googleClaims( env, credential ) {

	const clientId = googleClientId( env );
	if ( ! clientId ) throw new HttpError( 503, 'Sign-in isn\'t set up' );
	return profileFrom( await verifyIdToken( credential, { clientId, certsUrl: testCertsUrl( env ) } ) );

}

// Fresh proof that whoever's asking has the Google account linked to `account`: its ID token, or a
// 401 (a token that doesn't pass) or 403 (another Google account's). The Google id ({ sub }).
async function googleProof( env, account, credential ) {

	const { sub } = await googleClaims( env, credential );
	const row = await database( env ).prepare( 'SELECT 1 AS linked FROM accounts WHERE id = ? AND google_sub = ?' ).bind( account.id, sub ).first();
	if ( ! row ) throw new HttpError( 403, 'That\'s another Google account. Use the one linked here' );
	return { sub };

}

// Fresh proof that whoever's asking knows `account`'s password (`sent.password`, with a robot
// check's `sent.token` when DriveLimits asks for one), checked and counted as a sign-in is: a 401
// for a wrong one.
async function passwordProof( context, account, sent ) {

	if ( typeof sent.password !== 'string' ) throw new HttpError( 400, 'Bad request' );
	const robot = await robotPassed( context.env, context.request, sent.token );
	const row = await checkPassword( context, usernameKey( account.username ), passwordText( sent.password ), robot );
	if ( ! row || row.account_id !== account.id ) throw new HttpError( 401, 'That isn\'t your current password' );

}

// The owner's accounts (admin.js's ADMIN_EMAILS) sign in with Google only, so the admin page never
// rests on a password: none is added to one, nor is one's Google account linked to a username's.
function notTheOwners( env, email ) {

	if ( isAdmin( env, { email } ) ) throw new HttpError( 403, 'The owner\'s accounts sign in with Google only' );

}

// POST /api/account/password { current, password, token? }, signed in: the account's password
// changed, which needs the current one (checked and counted as a sign-in is), and every other
// session of the account signed out (this browser stays signed in). Signed in with Google and no
// username yet: { username, password, credential }, a username and password added, with Google's
// ID token for the account's own Google account as fresh proof (the session alone isn't enough:
// a borrowed browser could otherwise add a way in for someone else). Adding one is counted as one
// of the visitor's SIGN_UPS_DAILY, as making an account is, since a taken username says so.
// Answers /api/me's body.
export async function setPassword( context ) {

	const { request, env, url, limits, now } = context;
	const db = checkOn( env );
	const sent = await body( request, CREDENTIAL_BODY );
	const account = await signedInAccount( context );
	if ( ! account.username ) {

		notTheOwners( env, account.email );
		const username = newUsername( sent.username );
		const password = newPassword( sent.password, username );
		await aChange( context );
		await googleProof( env, account, sent.credential );
		await takeTurn( limits, request, 'sign-up', now, SIGN_UPS_DAILY, 48 );
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

// DELETE /api/account/password { password, token? } or { credential }, signed in: the username and
// password taken off the account, with fresh proof: the password itself (checked and counted as a
// sign-in is), or Google's ID token for the account's Google account (so its owner can always take
// off a password they've forgotten, or didn't set). Only while a Google account is linked to sign
// in with instead (else a 409), which the delete itself checks, so two changes at once can't leave
// the account with no way in. The account's other sessions are signed out. Answers /api/me's body.
export async function removePassword( context ) {

	const { request, env, url } = context;
	const db = checkOn( env );
	const sent = await body( request, CREDENTIAL_BODY );
	const account = await changing( context );
	if ( ! account.username ) return json( await meFor( env, account ) );
	if ( ! account.google ) throw new HttpError( 409, 'Link Google first: it\'s your only way to sign in' );
	if ( sent.credential !== undefined ) await googleProof( env, account, sent.credential );
	else await passwordProof( context, account, sent );
	const [ removed ] = await db.batch( [
		db.prepare( 'DELETE FROM logins WHERE account_id = ?1 AND EXISTS ( SELECT 1 FROM accounts WHERE id = ?1 AND google_sub NOT LIKE \'none:%\' )' ).bind( account.id ),
		db.prepare( 'DELETE FROM sessions WHERE account_id = ?1 AND token_hash <> ?2 AND NOT EXISTS ( SELECT 1 FROM logins WHERE account_id = ?1 )' ).bind( account.id, await sessionHash( request, url ) ?? '' ),
	] );
	if ( ! removed.meta.changes ) throw new HttpError( 409, 'Link Google first: it\'s your only way to sign in' );
	return json( await meFor( env, await accountById( db, account.id ) ) );

}

// POST /api/account/google { credential, password, token? }, signed in with a username: the Google
// account the ID token is for (from Google's button, checked as a sign-in's is) linked to this
// account, so either signs in. It needs the account's password too (checked and counted as a
// sign-in is), so a borrowed browser can't link someone else's Google account. A Google account
// already with an account of its own here is only taken over when that account has nothing to lose
// (no username, no player linked to it and no purchase of its own): then it's deleted, and its
// sessions with it, in the same go as the link, by a delete that checks that again, so a player
// linked or a pass bought in between is never cut loose. Otherwise it's a 409 saying so, and nothing
// changes: nothing is merged, so no pass, level or time is ever dropped or doubled
// (docs/world-drive.md). An account with another Google account linked already is a 409 too, and
// an owner's Google account (ADMIN_EMAILS) a 403. Answers /api/me's body.
export async function linkGoogle( context ) {

	const { request, env, now } = context;
	const db = checkOn( env );
	const sent = await body( request, CREDENTIAL_BODY );
	const { sub, email, name } = await googleClaims( env, sent.credential );
	const account = await changing( context );
	const KEEPS = `EXISTS ( SELECT 1 FROM logins WHERE account_id = accounts.id ) OR EXISTS ( SELECT 1 FROM players WHERE account_id = accounts.id )
		OR EXISTS ( SELECT 1 FROM purchases WHERE account_id = accounts.id )`;
	const other = await db.prepare( `SELECT id, ${ KEEPS } AS keeps FROM accounts WHERE google_sub = ?` ).bind( sub ).first();
	if ( other?.id === account.id ) return json( await meFor( env, account ) );
	if ( account.google ) throw new HttpError( 409, 'This account has a Google account linked already. Unlink it first' );
	notTheOwners( env, email );
	await passwordProof( context, account, sent );
	const KEPT = 'That Google account has its own World Drive account, with its own progress or pass. Sign in with Google to use that one';
	if ( other?.keeps ) throw new HttpError( 409, KEPT );
	const [ , linked ] = await db.batch( [
		db.prepare( `DELETE FROM accounts WHERE google_sub = ? AND id <> ? AND NOT ( ${ KEEPS } )` ).bind( sub, account.id ),
		db.prepare( `UPDATE accounts SET google_sub = ?1, email = ?2, name = ?3, last_login_at = ?4 WHERE id = ?5 AND google_sub LIKE 'none:%'
			AND NOT EXISTS ( SELECT 1 FROM accounts WHERE google_sub = ?1 )` ).bind( sub, email, name, now, account.id ),
	] );
	if ( ! linked.meta.changes ) throw new HttpError( 409, KEPT );
	return json( await meFor( env, await accountById( db, account.id ) ) );

}

// DELETE /api/account/google { credential }, signed in: the Google account unlinked, with Google's
// ID token for it as fresh proof (the session alone isn't enough: a borrowed browser could
// otherwise add a password and unlink the owner's Google, taking the account and its pass). Only
// while the account has a username and password to sign in with instead (else a 409), which the
// update itself checks, so two changes at once can't leave it with no way in. Its email and name go
// with it; a pass bought with that email before signing in (a purchase that's nobody's yet) becomes
// the account's first, so unlinking never loses a pass. One given by SUPPORTER_EMAILS goes with the
// email. The account's other sessions are signed out. Answers /api/me's body.
export async function unlinkGoogle( context ) {

	const { request, env, url } = context;
	const db = checkOn( env );
	const sent = await body( request, CREDENTIAL_BODY );
	const account = await changing( context );
	if ( ! account.google ) return json( await meFor( env, account ) );
	if ( ! account.username ) throw new HttpError( 409, 'Add a username and password first: Google is your only way to sign in' );
	const { sub } = await googleProof( env, account, sent.credential );
	const none = NO_GOOGLE + randomToken( 16 );
	const unlinked = 'EXISTS ( SELECT 1 FROM accounts WHERE id = ?1 AND google_sub = ?2 )';
	const [ changed ] = await db.batch( [
		db.prepare( 'UPDATE accounts SET google_sub = ?1, email = \'\', name = \'\' WHERE id = ?2 AND google_sub = ?3 AND EXISTS ( SELECT 1 FROM logins WHERE account_id = ?2 )' ).bind( none, account.id, sub ),
		db.prepare( `UPDATE purchases SET account_id = ?1 WHERE account_id IS NULL AND email = ?3 AND ?3 <> '' AND ${ unlinked }` ).bind( account.id, none, account.email ),
		db.prepare( `DELETE FROM sessions WHERE account_id = ?1 AND token_hash <> ?3 AND ${ unlinked }` ).bind( account.id, none, await sessionHash( request, url ) ?? '' ),
	] );
	if ( ! changed.meta.changes ) throw new HttpError( 409, 'Add a username and password first: Google is your only way to sign in' );
	return json( await meFor( env, await accountById( db, account.id ) ) );

}

// POST /api/account/sign-out-everywhere, signed in: every session of the account deleted, this
// browser's too (and its cookie cleared).
export async function signOutEverywhere( context ) {

	const { env, url } = context;
	const db = checkOn( env );
	const account = await changing( context );
	// And every key to its player handed to a browser as it signed in (accounts.js's accountPlayer):
	// those browsers pick a nickname, or sign in again for the player.
	await db.batch( [
		db.prepare( 'DELETE FROM sessions WHERE account_id = ?' ).bind( account.id ),
		db.prepare( 'DELETE FROM player_keys WHERE account_id = ?' ).bind( account.id ),
	] );
	return noContent( { 'Set-Cookie': signedOutCookie( url ) } );

}
