import { HttpError, isObject, json, readJson, sha256Hex } from '../http.js';
import {
	CAPS, CLAIM_DAYS, DISCOVERIES_MAX, SUPPORTER_XP, TITLES, XP,
	capReport, checkReport, dailyXp, dayBefore, dayOf, drivingXp, isEmptyReport, levelOf, rewardsBetween, titleOf, titleUnlocked,
} from '../../src/drive-app/levels.js';
import { addTallies, claimTallies, countsOf, crossed, hasTallies, readTallies } from '../../src/drive-app/achievement-rules.js';
import { earnQuery, featList, featsOf } from './achievements.js';
import { PERIODS, forgetBoards } from './boards.js';
import { credentials, database, secretMatches } from './players.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';

// A UTC day (ms).
const DAY = 24 * 60 * 60 * 1000;

// Levels (docs/world-drive.md, "Levels"; the rules are src/drive-app/levels.js, which the page
// shares): each leaderboard player's XP, kept in D1 with the player, so it goes wherever their
// nickname does; a player linked to a Google account (accounts.js's linkPlayer) shows the level of
// the account's best player, so a supporter's level is the same on every device they sign in on.
// The page reports what it drove every couple of minutes (POST /api/progress, with the visit's
// token and the player's secret, as scores are posted), trick runs included.
//
// The page says what it drove, so the Worker can't know it's true; what it does is keep it to what
// could be: every amount capped by the real time since the player's last report (levels.js's CAPS:
// no faster than any ride goes, a minute of air a minute, and so on, at most CAPS.window of it in
// one report, CAPS.claim for the first, and no sooner than CAPS.gap after the last, which keeps the
// rows written down), areas and spots only the first time (kept in
// `discoveries`), the day's bonus once a UTC day, and one visit for one player. An account counts
// its best player, not all of them together: each player's caps are its own, so players added to
// an account mustn't add up. A supporter's XP counts SUPPORTER_XP times, by the pass of the account
// the player is linked to, never by anything the page says. None of it asks a Durable Object: the
// free plan's 100,000 requests a day are for the visit caps and driving with others. Reports are
// held to PROGRESS_POSTS (Cloudflare's rate limiter, by player) instead.

// SQL for the XP the player in row `p` shows: their own, or with an account, the most any of the
// account's players has (one look in players_by_account).
export function xpOf( p ) {

	return `CASE WHEN ${ p }.account_id IS NULL THEN ${ p }.xp ELSE ( SELECT MAX( q.xp ) FROM players q WHERE q.account_id = ${ p }.account_id ) END`;

}

// { level, title } shown for a player whose XP (xpOf) and picked title are these.
export function standingOf( xp, title ) {

	const level = levelOf( xp );
	return { level, title: titleOf( level, title ).id };

}

// POST /api/progress { id, secret, visit, report }: what was driven since the last report (a
// REPORT, levels.js). { xp, own, level, gained, unlocked: [ rewards ], supporter, title, chosen,
// streakDay, streak, accepted: { areas, spots }, daily?: { streak, xp }, repeated? }: xp and level
// the player's (their account's best), own their own XP, gained what this report earned, unlocked
// what the levels it climbed gave, title the one shown and chosen the one picked ('' for the
// newest), streakDay and streak their last daily bonus's day and its days in a row, accepted the
// places it took (new or already known: those over the cap aren't, and are for the next report).
// earned: the achievements this report's counts reached (achievements.js); and with a report with
// nothing in it whose body asks for them (feats: true, as the page does once as it starts), feats:
// every achievement the player and their account have, the first time the visit asks (visits.listed:
// a visit takes a robot check, and the Earth's are a few a day an address), so empty reports, which
// only PROGRESS_POSTS holds, otherwise read no more than the player's own row.
// A report with nothing in it changes nothing: it's how the page asks where it stands. A report
// with the id of the last one taken is that one sent again (its answer never came): repeated, and
// counted once.
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
	if ( report.id && report.id === player.progress_id ) {

		return json( { ...standing( player, player.total, player.xp, 0 ), streakDay: player.streak_day, streak: player.streak, accepted: { areas: [], spots: [] }, earned: [], repeated: true } );

	}

	// Each report with something in it is a row written: no sooner than CAPS.gap after the last (the
	// page keeps it for later).
	const early = CAPS.gap * 1000 - ( now - player.progress_at );
	if ( player.progress_at && early > 0 && ! isEmptyReport( report ) ) {

		const wait = String( Math.ceil( early / 1000 ) );
		throw new HttpError( 429, 'Too soon after the last report. Try again shortly', { retryAfter: Number( wait ) }, { 'Retry-After': wait } );

	}

	// Everything capped by the time since the last report (the first, the claim: what was driven
	// before the nickname, an hour of it); only the places that fit are looked up.
	const claim = ! player.progress_at;
	const seconds = sinceLast( player.progress_at, now );
	const capped = capReport( report, seconds );
	const taken = [ ...capped.spots.map( spot => `spot:${ spot }` ), ...capped.areas ];

	// One visit, one player, as for scores; and which of those places are known already.
	const [ , bound, known ] = await db.batch( [
		db.prepare( 'INSERT INTO visits ( id, player_id, expires_at ) VALUES ( ?, ?, ? ) ON CONFLICT ( id ) DO NOTHING' ).bind( visit.id, id, visit.expiresAt ),
		db.prepare( 'SELECT player_id FROM visits WHERE id = ?' ).bind( visit.id ),
		...taken.length ? [ db.prepare( 'SELECT place FROM discoveries WHERE player_id = ? AND place IN ( SELECT value FROM json_each( ? ) )' ).bind( id, JSON.stringify( taken ) ) ] : [],
	] );
	if ( bound.results[ 0 ]?.player_id !== id ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	// The whole list of achievements, asked for with nothing reported: once a visit.
	const listed = body.feats === true && isEmptyReport( report ) ? await listOnce( db, visit.id, id ) : null;

	const old = new Set( ( known?.results ?? [] ).map( row => row.place ) );
	const fresh = taken.filter( place => ! old.has( place ) ).slice( 0, Math.max( 0, DISCOVERIES_MAX - player.discoveries ) );
	const spots = fresh.filter( place => place.startsWith( 'spot:' ) ).length;
	const today = dayOf( now );
	// A claim brings the days' bonuses the browser counted before the nickname (CLAIM_DAYS' worth at
	// most), and the streak they made if it's still going (its last day today or yesterday).
	const days = claim && report.days ? report.days : null;
	const earlier = days ? Math.min( days.xp, CLAIM_DAYS * dailyXp( XP.streakMax + 1 ) ) : 0;
	let { streak_day: streakDay, streak } = player;
	if ( days && ! streakDay && ( days.day === today || days.day === dayBefore( today ) ) ) [ streakDay, streak ] = [ days.day, Math.max( 1, days.streak ) ];
	const daily = report.daily && streakDay !== today ? { streak: streakDay === dayBefore( today ) ? streak + 1 : 1 } : null;
	if ( daily ) {

		daily.xp = dailyXp( daily.streak );
		[ streakDay, streak ] = [ today, daily.streak ];

	}

	// Achievements (achievements.js): the report's km and trusted counts added to the player's, a
	// day's worth of each at most (and the claim's to CLAIM_TALLY), and a day in a row if the Worker
	// gave the day's bonus (the streak a claim brings is for XP alone); those the counts have just
	// reached are written with the report (a party's or a challenge's are written where they're
	// counted, so they're left as they were here). A player who reported before achievements starts
	// from the streak they had then (fromBefore).
	const kept = readTallies( player.tallies );
	if ( ! claim && ! kept.day && player.streak_day ) fromBefore( kept, player, today );
	const counted = claim ? claimTallies( { km: capped.km, feats: report.feats } ) : { km: capped.km, feats: report.feats };
	const { tallies } = addTallies( kept, { ...counted, daily: !! daily }, today );
	const feats = crossed( countsOf( readTallies( player.tallies ), { parties: player.parties } ), countsOf( tallies, { parties: player.parties } ) );

	const multiplier = player.supporter ? SUPPORTER_XP : 1;
	const earned = drivingXp( capped, seconds ) + ( fresh.length - spots ) * XP.area + spots * XP.spot + ( daily?.xp ?? 0 ) + earlier + capped.tricks;
	const gained = Math.round( earned * multiplier );
	const anything = gained > 0 || fresh.length > 0 || streakDay !== player.streak_day || [ 'km', 'air', 'drifts', 'pads', 'together' ].some( field => report[ field ] > 0 ) || hasTallies( report.feats );
	if ( anything ) {

		// Claimed in one statement against the last report's time, so two at once can't both count
		// the same minutes; the places only with it (changes(): that statement's, just before).
		const [ update ] = await db.batch( [
			db.prepare( `UPDATE players SET xp = xp + ?1, progress_at = ?2, last_seen_at = ?2, streak_day = ?3, streak = ?4, discoveries = discoveries + ?5, progress_id = ?6, tallies = ?9
				WHERE id = ?7 AND progress_at = ?8` )
				.bind( gained, now, streakDay, streak, fresh.length, report.id ?? '', id, player.progress_at, JSON.stringify( tallies ) ),
			...fresh.length ? [ db.prepare( `INSERT INTO discoveries ( player_id, place, created_at ) SELECT ?1, value, ?2 FROM json_each( ?3 )
				WHERE changes() = 1 ON CONFLICT DO NOTHING` ).bind( id, now, JSON.stringify( fresh ) ) ] : [],
			// (Only with the report's own update: its time is the player's now.)
			...feats.length ? [ earnQuery( db, id, feats, now, '( SELECT progress_at FROM players WHERE id = ?1 ) = ?2' ) ] : [],
		] );
		if ( ! update.meta.changes ) throw new HttpError( 409, 'Another report came in at once. Try again', { retryAfter: 1 }, { 'Retry-After': '1' } );

	}

	// The account's best: this player's new XP, or another's.
	const own = player.xp + ( anything ? gained : 0 );
	const answer = {
		...standing( player, Math.max( player.total, own ), own, gained ),
		streakDay: anything ? streakDay : player.streak_day,
		streak: anything ? streak : player.streak,
		accepted: { areas: capped.areas, spots: capped.spots },
		// The achievements this report earned; and asked for with nothing reported, once a visit, all
		// the player's and their account's.
		earned: anything ? feats : [],
		...listed ? { feats: listed } : {},
	};
	if ( daily && anything ) answer.daily = { streak: daily.streak, xp: Math.round( daily.xp * multiplier ) };
	return json( answer );

}

// POST /api/player/title { id, secret, title }: the title on the player's nametag and leaderboard
// rows, one they have at their level ('' for the newest they have). { level, title (the one shown),
// chosen (the one picked) }.
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
	return json( { ...standingOf( player.total, title ), chosen: title } );

}

// A player who reported before achievements (their tallies never written): `kept` (readTallies')
// starts from the streak they had then, but no longer than the Worker could have seen it, the days
// from the player's first (created_at) to the streak's last. The streak in their row may have come
// from their nickname's claim (the page's word, up to 10,000 days, taken for XP before achievements
// as it still is), so only those days are believed: a player made two days ago has three in a row at
// most, never the 7 or 30 days' achievements. Still going (its last day today or yesterday), it's
// also the run the next day's bonus adds to; otherwise only the best is kept.
function fromBefore( kept, player, today ) {

	const number = day => Math.floor( Date.parse( `${ day }T00:00:00Z` ) / DAY );
	const seen = number( player.streak_day ) - Math.floor( ( player.created_at ?? 0 ) / DAY ) + 1;
	const best = Math.max( 0, Math.min( player.streak ?? 0, seen ) );
	kept.streak = Math.max( kept.streak, best );
	if ( best && ( player.streak_day === today || player.streak_day === dayBefore( today ) ) ) Object.assign( kept, { run: best, runDay: player.streak_day } );

}

// The player with this id and secret, with what levels need: their XP (and their account's best,
// `total`), title, last report (its time and id), streak, discoveries, achievements' tallies and
// parties, when they were made, and whether they're a supporter. A 403 for an unknown id or the
// wrong secret, as authenticate says.
async function playerFor( db, env, id, secret ) {

	const player = await db.prepare( `SELECT p.xp, p.title, p.progress_at, p.progress_id, p.streak_day, p.streak, p.discoveries, p.tallies, p.parties, p.created_at, ${ xpOf( 'p' ) } AS total,
		${ hasPass( 'p.account_id', '?3' ) } AS supporter FROM players p WHERE p.id = ?1 AND ${ secretMatches( 'p', '?2' ) }` ).bind( id, await sha256Hex( secret ), supporterEmails( env ) ).first();
	if ( ! player ) throw new HttpError( 403, 'Forbidden', { reason: 'player' } );
	return player;

}

// Every achievement player `id` and their account have (achievements.js's featsOf), as a list, if
// visit `visit` (theirs) hasn't had it yet; null if it has.
async function listOnce( db, visit, id ) {

	const [ , row ] = await db.batch( [
		db.prepare( 'UPDATE visits SET listed = 1 WHERE id = ?1 AND player_id = ?2 AND listed = 0' ).bind( visit, id ),
		db.prepare( `SELECT ${ featsOf( 'p' ) } AS feats FROM players p WHERE p.id = ?1 AND changes() = 1` ).bind( id ),
	] );
	return row.results.length ? featList( row.results[ 0 ].feats ) : null;

}

// What a progress answer says of where the player stands, at `xp` (the account's best), their own
// XP `own`, having gained `gained`.
function standing( player, xp, own, gained ) {

	const before = levelOf( player.total );
	const { level, title } = standingOf( xp, player.title );
	return { xp, own, level, gained, unlocked: rewardsBetween( before, level ), supporter: !! player.supporter, title, chosen: player.title ?? '' };

}

// The seconds a report counts: since the player's last, at most CAPS.window; for their first (the
// claim of what was driven before the nickname), CAPS.claim.
function sinceLast( at, now ) {

	if ( ! at ) return CAPS.claim;
	return Math.max( 0, Math.min( ( now - at ) / 1000, CAPS.window ) );

}

// Reports and titles: PROGRESS_POSTS' limit a minute for each player (10, on Cloudflare's rate
// limiter, which costs no Durable Object request). A page reports every couple of minutes, and as
// a drive pauses or ends; one turned away keeps what it had for the next.
async function limitReports( env, id ) {

	if ( env.PROGRESS_POSTS && ! ( await env.PROGRESS_POSTS.limit( { key: id } ) ).success ) {

		throw new HttpError( 429, 'Too many reports. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

}

function bad() {

	return new HttpError( 400, 'Bad request' );

}
