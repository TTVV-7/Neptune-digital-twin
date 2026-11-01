import { HttpError, isObject, json, readJson, sha256Hex } from '../http.js';
import {
	CAPS, DISCOVERIES_MAX, SUPPORTER_XP, TITLES, XP,
	capReport, checkReport, dailyXp, dayBefore, dayOf, drivingXp, levelOf, rewardsBetween, titleOf, titleUnlocked, trickXp,
} from '../../src/drive-app/levels.js';
import { PERIODS, forgetBoards } from './boards.js';
import { credentials, database } from './players.js';
import { hasPass, supporterEmails } from './supporter.js';
import { VISIT_HOURS, readVisit } from './visits.js';

// Levels (docs/world-drive.md, "Levels"; the rules are src/drive-app/levels.js, which the page
// shares): each leaderboard player's XP, kept in D1 with the player, so it goes wherever their
// nickname does; a player linked to a Google account (accounts.js's linkPlayer) counts with all of
// that account's players together, so a supporter's level is the same on every device they sign in
// on. The page reports what it drove every couple of minutes (POST /api/progress, with the visit's
// token and the player's secret, as scores are posted), and trick runs earn theirs as the
// leaderboard takes them (postScore, scores.js, calls trickProgress).
//
// The page says what it drove, so the Worker can't know it's true; what it does is keep it to what
// could be: every amount capped by the real time since the player's last report (levels.js's CAPS:
// no faster than any ride goes, a minute of air a minute, and so on, at most CAPS.window of it in
// one report), areas and spots only the first time (kept in `discoveries`), the day's bonus once a
// UTC day, and one visit for one player. A supporter's XP counts SUPPORTER_XP times, by the pass of
// the account the player is linked to, never by anything the page says. None of it asks a Durable
// Object: the free plan's 100,000 requests a day are for the visit caps and driving with others.
// Reports are held to PROGRESS_POSTS (Cloudflare's rate limiter, by player) instead.

// SQL for the XP the player in row `p` counts with: their own, or with an account, all of the
// account's players' together (one look in players_by_account).
export function xpOf( p ) {

	return `CASE WHEN ${ p }.account_id IS NULL THEN ${ p }.xp ELSE ( SELECT SUM( q.xp ) FROM players q WHERE q.account_id = ${ p }.account_id ) END`;

}

// { level, title } shown for a player whose XP (xpOf) and picked title are these.
export function standingOf( xp, title ) {

	const level = levelOf( xp );
	return { level, title: titleOf( level, title ).id };

}

// POST /api/progress { id, secret, visit, report }: what was driven since the last report (a
// REPORT, levels.js). { xp, level, gained, unlocked: [ rewards ], supporter, title, accepted: {
// areas, spots }, daily?: { streak, xp } }: xp and level the player's (with their account's), gained
// what this report earned, unlocked what the levels it climbed gave, accepted the places it took
// (new or already known: those over the cap aren't, and are for the next report). A report with
// nothing in it changes nothing: it's how the page asks where it stands.
export async function postProgress( { request, env, now } ) {

	const db = database( env );
	const body = await readJson( request, 8192 );
	if ( ! isObject( body ) ) throw bad();
	const { id, secret } = credentials( body );
	const report = checkReport( body.report );
	if ( ! report ) throw bad();
	const visit = await readVisit( env, body.visit, now );
	if ( ! visit ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	await limitReports( env, id );
	const player = await playerFor( db, env, id, secret );

	// One visit, one player, as for scores; and which of the places it lists are known already.
	const listed = [ ...report.spots.map( spot => `spot:${ spot }` ), ...report.areas ];
	const [ , bound, known ] = await db.batch( [
		db.prepare( 'INSERT INTO visits ( id, player_id, expires_at ) VALUES ( ?, ?, ? ) ON CONFLICT ( id ) DO NOTHING' ).bind( visit.id, id, visit.expiresAt ),
		db.prepare( 'SELECT player_id FROM visits WHERE id = ?' ).bind( visit.id ),
		db.prepare( 'SELECT place FROM discoveries WHERE player_id = ? AND place IN ( SELECT value FROM json_each( ? ) )' ).bind( id, JSON.stringify( listed ) ),
	] );
	if ( bound.results[ 0 ]?.player_id !== id ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );

	// Everything capped by the time since the last report (the first: what was driven before the
	// nickname, a while of it).
	const seconds = sinceLast( player.progress_at, visit, now );
	const capped = capReport( report, seconds );
	const tricks = Math.min( report.tricks, trickAllowance( player.trick_at, visit, now ) );
	const old = new Set( known.results.map( row => row.place ) );
	const taken = [ ...capped.spots.map( spot => `spot:${ spot }` ), ...capped.areas ];
	const fresh = taken.filter( place => ! old.has( place ) ).slice( 0, Math.max( 0, DISCOVERIES_MAX - player.discoveries ) );
	const spots = fresh.filter( place => place.startsWith( 'spot:' ) ).length;
	const today = dayOf( now );
	const daily = report.daily && player.streak_day !== today ? { streak: player.streak_day === dayBefore( today ) ? player.streak + 1 : 1 } : null;
	if ( daily ) daily.xp = dailyXp( daily.streak );

	const multiplier = player.supporter ? SUPPORTER_XP : 1;
	const earned = drivingXp( capped, seconds ) + ( fresh.length - spots ) * XP.area + spots * XP.spot + ( daily?.xp ?? 0 ) + tricks;
	const gained = Math.round( earned * multiplier );
	const anything = gained > 0 || fresh.length > 0 || daily || [ 'km', 'air', 'drifts', 'pads', 'together' ].some( field => report[ field ] > 0 );
	if ( anything ) {

		// Claimed in one statement against the last report's time, so two at once can't both count
		// the same minutes; the places only with it.
		const [ update ] = await db.batch( [
			db.prepare( `UPDATE players SET xp = xp + ?1, progress_at = ?2, last_seen_at = ?2, streak_day = ?3, streak = ?4, discoveries = discoveries + ?5,
				trick_at = CASE WHEN ?6 > 0 THEN ?2 ELSE trick_at END WHERE id = ?7 AND progress_at = ?8` )
				.bind( gained, now, daily ? today : player.streak_day, daily ? daily.streak : player.streak, fresh.length, tricks, id, player.progress_at ),
			...fresh.length ? [ db.prepare( `INSERT INTO discoveries ( player_id, place, created_at ) SELECT ?1, value, ?2 FROM json_each( ?3 )
				WHERE ( SELECT progress_at FROM players WHERE id = ?1 ) = ?2 ON CONFLICT DO NOTHING` ).bind( id, now, JSON.stringify( fresh ) ) ] : [],
		] );
		if ( ! update.meta.changes ) throw new HttpError( 409, 'Another report came in at once. Try again', { retryAfter: 1 }, { 'Retry-After': '1' } );

	}

	const xp = player.total + gained;
	const answer = {
		...standing( player, xp, gained ),
		accepted: { areas: capped.areas, spots: capped.spots },
	};
	if ( daily && anything ) answer.daily = { streak: daily.streak, xp: Math.round( daily.xp * multiplier ) };
	return json( answer );

}

// A trick run's XP, as the leaderboard takes its score (postScore, under its checks): the square
// root of its points (levels.js's trickXp, at most TRICK.max a run) less what this run has had
// already, no more than CAPS.tricks a minute since the player's last trick XP (what doesn't fit
// comes with the run's next score). A run is its visit, place and ride while its time goes on: a
// new drop-in there starts another. { gained, xp, level, unlocked, supporter, title }.
export async function trickProgress( db, env, { id, run, visit, now } ) {

	const player = await db.prepare( `SELECT p.xp, p.title, p.trick_run, p.trick_seconds, p.trick_xp, p.trick_at, ${ xpOf( 'p' ) } AS total,
		${ hasPass( 'p.account_id', '?2' ) } AS supporter FROM players p WHERE p.id = ?1` ).bind( id, supporterEmails( env ) ).first();
	if ( ! player ) throw new HttpError( 403, 'Forbidden', { reason: 'player' } );
	const key = `${ visit.id } ${ run.placeKey } ${ run.vehicle }`;
	const same = player.trick_run === key && run.runSeconds >= player.trick_seconds;
	const had = same ? player.trick_xp : 0;
	const granted = Math.floor( Math.min( Math.max( 0, trickXp( run.score ) - had ), trickAllowance( player.trick_at, visit, now ) ) );
	const gained = Math.round( granted * ( player.supporter ? SUPPORTER_XP : 1 ) );
	if ( granted > 0 || ! same || run.runSeconds !== player.trick_seconds ) {

		await db.prepare( `UPDATE players SET xp = xp + ?1, trick_run = ?2, trick_seconds = ?3, trick_xp = ?4, trick_at = CASE WHEN ?5 > 0 THEN ?6 ELSE trick_at END WHERE id = ?7` )
			.bind( gained, key, run.runSeconds, had + granted, granted, now, id ).run();

	}

	return standing( player, player.total + gained, gained );

}

// POST /api/player/title { id, secret, title }: the title on the player's nametag and leaderboard
// rows, one they have at their level ('' for the newest they have). { level, title }.
export async function setTitle( { request, env, url, now } ) {

	const db = database( env );
	const body = await readJson( request, 1024 );
	if ( ! isObject( body ) ) throw bad();
	const { id, secret } = credentials( body );
	const { title } = body;
	if ( typeof title !== 'string' || ( title && ! TITLES.some( reward => reward.id === title ) ) ) throw bad();
	await limitReports( env, id );
	const player = await playerFor( db, env, id, secret );
	const level = levelOf( player.total );
	if ( title && ! titleUnlocked( title, level ) ) throw new HttpError( 403, 'That title comes at a higher level', { reason: 'title' } );
	await db.prepare( 'UPDATE players SET title = ? WHERE id = ?' ).bind( title, id ).run();
	// On today's, this week's and the all-time boards straight away (one place's within half a minute).
	await forgetBoards( url, Object.values( PERIODS ).map( period => [ period( now ), '' ] ), id );
	return json( standingOf( player.total, title ) );

}

// The player with this id and secret, with what levels need: their XP (and their account's
// together, `total`), title, last report, streak, discoveries, trick run and whether they're a
// supporter. A 403 for an unknown id or the wrong secret, as authenticate says.
async function playerFor( db, env, id, secret ) {

	const player = await db.prepare( `SELECT p.xp, p.title, p.progress_at, p.streak_day, p.streak, p.discoveries, p.trick_at, ${ xpOf( 'p' ) } AS total,
		${ hasPass( 'p.account_id', '?3' ) } AS supporter FROM players p WHERE p.id = ?1 AND p.secret_hash = ?2` ).bind( id, await sha256Hex( secret ), supporterEmails( env ) ).first();
	if ( ! player ) throw new HttpError( 403, 'Forbidden', { reason: 'player' } );
	return player;

}

// What a progress answer says of where the player stands, at `xp` (theirs with their account's),
// having gained `gained`.
function standing( player, xp, gained ) {

	const before = levelOf( player.total );
	const { level, title } = standingOf( xp, player.title );
	return { xp, level, gained, unlocked: rewardsBetween( before, level ), supporter: !! player.supporter, title };

}

// The seconds a report counts: since the player's last (at most CAPS.window), or for their first,
// how long this visit has lasted, CAPS.claim at least (what was driven before the nickname, in this
// visit or before it) and the visit's hours at most.
function sinceLast( at, visit, now ) {

	if ( at ) return Math.max( 0, Math.min( ( now - at ) / 1000, CAPS.window ) );
	return Math.min( Math.max( ( now - visit.issuedAt ) / 1000, CAPS.claim ), VISIT_HOURS * 3600 );

}

// The trick XP that may be given now: CAPS.tricks a minute of the time since the last was.
function trickAllowance( at, visit, now ) {

	return sinceLast( at, visit, now ) / 60 * CAPS.tricks;

}

// Reports and titles: PROGRESS_POSTS' limit a minute for each player (10, on Cloudflare's rate
// limiter, which costs no Durable Object request). A page reports every couple of minutes.
async function limitReports( env, id ) {

	if ( env.PROGRESS_POSTS && ! ( await env.PROGRESS_POSTS.limit( { key: id } ) ).success ) {

		throw new HttpError( 429, 'Too many reports. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

}

function bad() {

	return new HttpError( 400, 'Bad request' );

}
