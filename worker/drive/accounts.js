import { verifyIdToken } from '../google.js';
import { HttpError, isObject, json, noContent, randomToken, readJson, sha256Hex } from '../http.js';
import { SESSION_SECONDS, profileFrom, sessionCookies, testCertsUrl } from '../sessions.js';
import { PERIODS, forgetBoards } from './boards.js';
import { authenticate, credentials, database, takeTurn } from './players.js';
import { readTallies } from '../../src/drive-app/achievement-rules.js';
import { purchaseFor, supporterPass } from './supporter.js';
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

// DELETE /api/session { key? }: signed out, here (other browsers stay signed in). `key`: the secret
// this browser was handed for the account's player (accountPlayer), which goes with the session,
// so a shared computer doesn't go on driving as them.
export async function signOut( { request, env, url } ) {

	const token = cookies.read( request, url );
	if ( token && env.DB ) {

		const body = await readJson( request, 1024 ).catch( () => null );
		const key = isObject( body ) && typeof body.key === 'string' && body.key.length <= 64 ? await sha256Hex( body.key ) : null;
		const hash = await sha256Hex( token );
		await env.DB.batch( [
			...key ? [ env.DB.prepare( 'DELETE FROM player_keys WHERE secret_hash = ?1 AND account_id = ( SELECT account_id FROM sessions WHERE token_hash = ?2 )' ).bind( key, hash ) ] : [],
			env.DB.prepare( 'DELETE FROM sessions WHERE token_hash = ?' ).bind( hash ),
		] );

	}

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

// GET /api/me: { signedIn, name?, email?, google?, username?, supporter, subscribed?, purchase:
// { enabled, link?, price?, manage?, clientReferenceId? } }. subscribed: the pass is a running
// subscription's (manage: Stripe's portal, to cancel it or change the card). google: whether a Google account is linked (name and email
// are its, '' without one); username: the account's own username, or null (it's shown to its owner
// only, never on the boards).
export async function getMe( context ) {

	return json( await meFor( context.env, await currentAccount( context ) ) );

}

export async function meFor( env, account ) {

	if ( ! account ) return { signedIn: false, supporter: false, purchase: purchaseFor( env, null ) };
	const pass = await supporterPass( env, account );
	return {
		signedIn: true, name: account.name, email: account.email, google: !! account.google, username: account.username ?? null,
		supporter: pass.supporter, ...( pass.subscribed ? { subscribed: true } : {} ), purchase: purchaseFor( env, account ),
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
	// A key handed to a browser as its account signed in there is for driving as that account's
	// player, never for giving it to another account.
	if ( player.by_key && player.account_id !== account.id ) throw new HttpError( 403, 'Forbidden', { reason: 'player' } );
	await takeTurn( limits, request, 'link', now, LINKS_DAILY, 48 );
	await db.prepare( 'UPDATE players SET account_id = ? WHERE id = ?' ).bind( account.id, id ).run();
	// The ⭐ on today's, this week's and the all-time boards straight away (the boards of one place
	// catch up within half a minute).
	await forgetBoards( url, Object.values( PERIODS ).map( period => [ period( now ), '' ] ), id );
	return json( { id, name: player.name } );

}

// POST /api/player/mine { id?, secret? }, signed in: the account's player for this browser, so it's
// the same player (nickname, level, achievements, scores) on every device the account signs in on.
// { player: { id, name, secret? } | null, merged? }.
//
// The account's player is its oldest (the first nickname picked). A browser that has it already is
// answered with it; one that doesn't is handed it with a secret of its own (player_keys: the
// player's own secret stays the browser's that made it, so that one carries on as it was). A player
// this browser has that isn't the account's (made here before signing in: a second nickname, "Tom
// 2") is folded into the account's and deleted (`merged`, see mergePlayers), unless it's another
// account's. With no player yet, the account takes this browser's (as /api/player/link does); with
// neither, null, and the page asks for a nickname as before, then calls here again.
export async function accountPlayer( context ) {

	const { request, env, url, limits, now } = context;
	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	const db = database( env );
	const body = await readJson( request, 1024 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );
	// This browser's player: none sent, or one the Worker no longer has (deleted, or the wrong
	// secret), is none.
	let here = null;
	if ( body.id !== undefined || body.secret !== undefined ) {

		const { id, secret } = credentials( body );
		here = await authenticate( db, id, secret ).catch( err => {

			if ( err instanceof HttpError && err.status === 403 ) return null;
			throw err;

		} );

	}

	await takeTurn( limits, request, 'link', now, LINKS_DAILY, 48 );
	const main = await db.prepare( 'SELECT id, name FROM players WHERE account_id = ? ORDER BY created_at, id LIMIT 1' ).bind( account.id ).first();
	const boards = Object.values( PERIODS ).map( period => [ period( now ), '' ] );
	// Another account's player stays theirs (`foreign`): this browser drives as this account's, or
	// with none, picks a nickname. (A key left in a browser, signed in there before by someone who
	// didn't sign out, never moves their player to whoever signs in next.)
	const foreign = !! here && here.account_id !== null && here.account_id !== account.id;
	if ( ! main && foreign ) return json( { player: null, foreign: true } );
	if ( ! main || main.id === here?.id ) {

		// The account's first player, or its own: linked (the ⭐ by its name straight away).
		if ( ! here ) return json( { player: null } );
		if ( here.account_id !== account.id ) {

			await db.prepare( 'UPDATE players SET account_id = ? WHERE id = ?' ).bind( account.id, here.id ).run();
			await forgetBoards( url, boards, here.id );

		}

		return json( { player: { id: here.id, name: here.name } } );

	}

	// Another account's player stays theirs: this browser only moves on to this account's.
	const merged = !! here && ! foreign;
	if ( merged ) await mergePlayers( db, here.id, main.id );
	const secret = randomToken( 24 );
	await db.prepare( 'INSERT INTO player_keys ( secret_hash, player_id, account_id, created_at ) VALUES ( ?, ?, ?, ? )' ).bind( await sha256Hex( secret ), main.id, account.id, now ).run();
	await forgetBoards( url, boards, main.id );
	if ( merged ) await forgetBoards( url, boards, here.id );
	return json( { player: { id: main.id, name: main.name, secret }, merged, ...foreign ? { foreign: true } : {} } );

}

// Player `from` folded into player `to` (the account's), then deleted, its nickname free again.
// `to` keeps its name, title, Garage and anything both have one of (an achievement keeps the
// earlier day it was earned; a best score on a board, the higher), and takes the rest of `from`'s:
// discoveries, achievements, best scores, scores, challenge times and their ghosts, and visits. Its
// XP is the higher of the two, never the sum (each player's caps are its own: added up, players
// made to be merged would pass them, as an account's players never add up, progress.js's xpOf);
// the same for the achievements' counts (the rides tried: all of both), and its streak whichever's
// day is later. All in one batch, so it's all or nothing.
async function mergePlayers( db, from, to ) {

	const rows = await db.prepare( 'SELECT * FROM players WHERE id IN ( ?1, ?2 )' ).bind( from, to ).all();
	const a = rows.results.find( row => row.id === to );
	const b = rows.results.find( row => row.id === from );
	if ( ! a || ! b ) return;
	const later = ( b.streak_day ?? '' ) > ( a.streak_day ?? '' ) || ( b.streak_day === a.streak_day && b.streak > a.streak );
	const [ streakDay, streak ] = later ? [ b.streak_day, b.streak ] : [ a.streak_day, a.streak ];
	const tallies = mergeTallies( readTallies( a.tallies ), readTallies( b.tallies ) );
	// A challenge both have a time on keeps `to`'s; it has one driver fewer (if `from`'s counted:
	// the owner's don't), and its ghosts' bytes lose `from`'s ghost there.
	const both = 'SELECT t.challenge_id FROM challenge_times t WHERE t.player_id = ?1 AND EXISTS ( SELECT 1 FROM challenge_times u WHERE u.challenge_id = t.challenge_id AND u.player_id = ?2 )';
	await db.batch( [
		// A challenge time and its ghost are keyed together (challenge_ghosts' foreign key): both
		// change hands in this batch, checked as it ends.
		db.prepare( 'PRAGMA defer_foreign_keys = ON' ),
		db.prepare( `UPDATE players SET xp = MAX( xp, ?3 ), streak_day = ?4, streak = ?5, tallies = ?6, parties = MAX( parties, ?7 ),
			progress_at = MAX( progress_at, ?8 ), last_score_at = MAX( last_score_at, ?9 ), last_time_at = MAX( last_time_at, ?10 ) WHERE id = ?2` )
			.bind( from, to, b.xp, streakDay, streak, JSON.stringify( tallies ), b.parties, b.progress_at, b.last_score_at, b.last_time_at ),
		db.prepare( `INSERT INTO best_scores ( player_id, period, place_key, score, tricks, place, vehicle, air_time, created_at )
			SELECT ?2, period, place_key, score, tricks, place, vehicle, air_time, created_at FROM best_scores WHERE player_id = ?1 AND true
			ON CONFLICT ( player_id, period, place_key ) DO UPDATE SET score = excluded.score, tricks = excluded.tricks, place = excluded.place,
				vehicle = excluded.vehicle, air_time = excluded.air_time, created_at = excluded.created_at WHERE excluded.score > best_scores.score` ).bind( from, to ),
		db.prepare( 'UPDATE scores SET player_id = ?2 WHERE player_id = ?1' ).bind( from, to ),
		db.prepare( 'INSERT INTO discoveries ( player_id, place, created_at ) SELECT ?2, place, created_at FROM discoveries WHERE player_id = ?1 AND true ON CONFLICT DO NOTHING' ).bind( from, to ),
		db.prepare( `INSERT INTO achievements ( player_id, achievement, earned_at ) SELECT ?2, achievement, earned_at FROM achievements WHERE player_id = ?1 AND true
			ON CONFLICT ( player_id, achievement ) DO UPDATE SET earned_at = MIN( achievements.earned_at, excluded.earned_at )` ).bind( from, to ),
		db.prepare( `UPDATE challenges SET drivers = MAX( 0, drivers - ( SELECT 1 - t.owner FROM challenge_times t WHERE t.challenge_id = challenges.id AND t.player_id = ?1 ) ),
			ghost_bytes = MAX( 0, ghost_bytes - COALESCE( ( SELECT g.bytes FROM challenge_ghosts g WHERE g.challenge_id = challenges.id AND g.player_id = ?1 ), 0 ) )
			WHERE id IN ( ${ both } )` ).bind( from, to ),
		db.prepare( `DELETE FROM challenge_ghosts WHERE player_id = ?1 AND challenge_id IN ( ${ both } )` ).bind( from, to ),
		db.prepare( `DELETE FROM challenge_times WHERE player_id = ?1 AND challenge_id IN ( ${ both } )` ).bind( from, to ),
		db.prepare( 'UPDATE challenge_times SET player_id = ?2 WHERE player_id = ?1' ).bind( from, to ),
		db.prepare( 'UPDATE challenge_ghosts SET player_id = ?2 WHERE player_id = ?1' ).bind( from, to ),
		db.prepare( 'UPDATE visits SET player_id = ?2 WHERE player_id = ?1' ).bind( from, to ),
		db.prepare( 'UPDATE players SET discoveries = ( SELECT COUNT( * ) FROM discoveries WHERE player_id = ?1 ) WHERE id = ?1' ).bind( to ),
		db.prepare( 'DELETE FROM players WHERE id = ?' ).bind( from ),
	] );

}

// Two players' achievement counts (readTallies') as one: the more of each (the rides, all of both),
// the longer streak, and the later run of days; today's counts are `a`'s (the player that stays).
function mergeTallies( a, b ) {

	const run = b.runDay > a.runDay || ( b.runDay === a.runDay && b.run > a.run ) ? { run: b.run, runDay: b.runDay } : { run: a.run, runDay: a.runDay };
	return {
		...a, ...run,
		km: Math.max( a.km, b.km ), moon: Math.max( a.moon, b.moon ), looks: Math.max( a.looks, b.looks ), streak: Math.max( a.streak, b.streak ),
		rides: [ ...new Set( [ ...a.rides, ...b.rides ] ) ],
	};

}
