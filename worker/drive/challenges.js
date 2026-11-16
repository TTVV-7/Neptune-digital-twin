import { HttpError, isObject, json, readJson } from '../http.js';
import { cellMiddle, cellOf, checkCell } from '../../src/drive-app/dropin-cells.js';
import {
	KINDS, PERIOD_KINDS, WORLDS, checkPasses, destination, kindFor, makeRoute, nextPeriod, parsePeriod, periodIndex, periodOf, periodsAt, randomFrom,
} from '../../src/drive-app/challenge-rules.js';
import { hasHeights, heightAt as moonHeightAt, setHeights } from '../../src/drive-app/moon-height.js';
import { MOON_PLACES } from '../../src/drive-app/moon-places.js';
import { SPOTS } from '../../src/drive-app/places.js';
import { PLACES } from '../../drive/site/places.js';
import { adminAccount } from './admin.js';
import { BOARD_CACHE, dateOf } from './boards.js';
import { nameCell, topPlaces, townsFor } from './dropins.js';
import { cleanPlace } from './names.js';
import { PLAYER_ID, authenticate, credentials, database, takeTurn } from './players.js';
import { standingOf, xpOf } from './progress.js';
import { VEHICLES } from './scores.js';
import { addressOf, setting } from './settings.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';

// Challenges (docs/world-drive.md, "Challenges"): each UTC day, week (from Monday, as the
// leaderboard's) and calendar month, one challenge on the Earth and one on the Moon, six live at
// once, each a place and a route the same for everyone (src/drive-app/challenge-rules.js lays it
// out), each with its own board of each player's best time.
//
// Picking them: by themselves, in a rotation round the featured places (the start spots, the places'
// pages, the Moon's places) and the busy drop-in places the owner has approved (dropins.js: part 1's
// ranking can be pushed by anyone with many addresses, so nothing it ranks goes in without the
// owner's say). The order and each period's kind and route come from HMACs of the period's key with
// a key derived from the Worker's secret, so every Worker instance agrees and nobody can work out
// next week's from the code. The owner can choose any period's challenge on either world by hand
// (the admin page, ADMIN_EMAILS only), and approve or unapprove busy places. A period's challenge is
// fixed in D1 the first time it's asked for, so nothing changing later (this code, the places, the
// approvals) changes a live one; the owner changing a live one starts a new board, the old one kept
// apart, after a warning (it changes what the times mean).
//
// Times: posted by the page as a run finishes, checked as scores are (scores.js): with a visit's
// token of the right kind (an Earth challenge needs an Earth visit; the Moon's takes any), from a
// player of the leaderboard's (id and secret), for a live challenge only, no longer than the visit
// has lasted, every point passed in order (collectibles in any) and no leg quicker than the fastest
// the game goes allows (challenge-rules.js's checkPasses), one every TIME_GAP from a player and
// CHALLENGE_TIMES_PER_VISITOR_DAILY a day from a visitor (DriveLimits, by the day's salt; a player
// whose visitor has had the day's is then held till midnight by their own gap, so their tries
// after it write nothing and ask DriveLimits nothing). Only each player's best is kept. The owner's
// runs (an 'o' visit) are taken and answered, but kept off the boards: the owner sees every route
// before it's live.
//
// Settings, none of which need setting: CHALLENGE_TIMES_PER_VISITOR_DAILY (TIMES_DAILY);
// CHALLENGE_LOOKS, the rate limiter binding for the lists and boards, by address; ADMIN_LOOKS the
// admin page's (admin.js).

// One time every TIME_GAP ms from a player; a visitor's times a day.
export const TIME_GAP = 10 * 1000;
const TIMES_DAILY = 300;
// How much longer (s) a run may say it lasted than its visit has (for clocks and frames), and how
// long after a challenge's period ends (ms) a run finished in it is still taken (a run that started
// before the end, posted a moment after).
const SLACK = 30;
export const GRACE = 60 * 1000;
// The boards: the top TOP, the list's top LIST_TOP for each challenge, and the finish screen's
// FINISH_TOP. Kept in Cloudflare's cache as the leaderboard's are, BOARD_CACHE s, a finished
// challenge's too: its times can't change, but its names can (a rename, or the owner removing a
// cheat or a rude name), and few look at an old board, so keeping it longer would save little.
const TOP = 20;
const LIST_TOP = 3;
const FINISH_TOP = 5;
// The six live challenges are kept in each Worker instance's memory this long (ms), so a list asks
// D1 for them at most once a minute; a challenge the owner replaces is seen everywhere within it (a
// time posted for the old one is checked against D1 itself).
const LIVE_KEPT = 60 * 1000;
// The admin page's busy places (dropins.js's topPlaces over the last BUSY_DAYS), kept BUSY_KEPT ms.
const BUSY_DAYS = 30;
const BUSY_KEPT = 10 * 60 * 1000;
// A pick can be made for a period up to AHEAD days ahead; at most APPROVED places a world.
const AHEAD = 400;
const APPROVED = 100;
// The Moon's routes are checked on its own heights (moon-height.js, from the site's
// /moon/height.bin): each point (and a landmark's start) on ground sloping under MOON_SLOPE degrees
// across ±SLOPE_REACH m, so no gate is on a crater's wall. Craters smaller than MOON_DETAIL m are
// left out of the check (the car drives over them), which keeps a check to a millisecond or so.
const MOON_SLOPE = 20;
const SLOPE_REACH = 15;
const MOON_DETAIL = 30;
const SEED_LABEL = 'world-drive challenges v1';
const SITE = 'https://worlddrive.app';
const RUN_ID = /^[A-Za-z0-9_-]{16,32}$/;
const DAY = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

// The places the rotation goes round: the game's own featured places, by an id of their own.
const FEATURED = {
	earth: [
		...SPOTS.map( spot => ( { id: `spot:${ spot.id }`, name: spot.name, region: spot.region, lat: spot.lat, lon: spot.lon, heading: spot.heading } ) ),
		...PLACES.filter( place => place.at ).map( place => ( { id: `page:${ place.slug }`, name: place.name, region: place.region, lat: place.at.lat, lon: place.at.lon, heading: place.at.heading } ) ),
	],
	moon: MOON_PLACES.map( place => ( { id: place.id, name: place.name, region: place.region, lat: place.lat, lon: place.lon } ) ),
};

// The derived key, made once per Worker instance; the live challenges ({ keys, at, rows }); the
// admin page's busy places ({ at, earth, moon }); the Moon's heights being fetched.
let seeding = null;
let live = null;
let busy = null;
let moonLoading = null;
// The rotation's choices worked out in this instance (rotationPick), by period, world and places,
// and its rounds' orders (orderOf), by round.
const picked = new Map();
const orders = new Map();

// --- the routes ---

// GET /api/challenges?id=: the six live challenges (the page puts the current world's first):
// { now, challenges: [ CHALLENGE + { total, top, me } ] }, top the LIST_TOP best ({ rank, name, ms,
// vehicle, level, title, supporter? }) and me, with a player's id, their best and rank there
// ({ ms, rank } or null). CHALLENGE: { id, period, key, world, kind, place, region, route, startsAt,
// endsAt }. The first ask in a period fixes its challenges in D1.
export async function listChallenges( context ) {

	const { env, request, url } = context;
	const id = askedPlayer( url );
	await looks( env, request );
	const db = database( env );
	const rows = await liveChallenges( context );
	const ids = rows.map( row => row.id );
	const listed = listKey( url, ids );
	const cached = await caches.default.match( listed );
	let tops;
	if ( cached ) tops = await cached.json();
	else {

		const results = await db.batch( [
			...ids.map( challenge => topQuery( db, env, challenge, LIST_TOP ) ),
			db.prepare( `SELECT id, drivers FROM challenges WHERE id IN ( ${ ids.map( () => '?' ).join( ', ' ) } )` ).bind( ...ids ),
		] );
		const drivers = new Map( results.at( - 1 ).results.map( row => [ row.id, row.drivers ] ) );
		tops = Object.fromEntries( ids.map( ( challenge, i ) => [ challenge, { total: drivers.get( challenge ) ?? 0, top: results[ i ].results.map( entryOf ) } ] ) );
		await caches.default.put( listed, json( tops, 200, { 'Cache-Control': `public, max-age=${ BOARD_CACHE }` } ) );

	}

	const mine = id ? await myStanding( db, url, ids, id ) : {};
	return json( {
		now: context.now,
		challenges: rows.map( row => ( { ...challengeOf( row ), ...tops[ row.id ], me: mine[ row.id ] ?? null } ) ),
	}, 200, { 'X-Board-Cache': cached ? 'hit' : 'miss' } );

}

// GET /api/challenges/board?challenge=&id=: a challenge's board, live or past (a finished one's is
// kept as it ended): { challenge: CHALLENGE + { replacedAt, finalAt }, total, rows: [ the TOP best ],
// me } (me with a player's id: their { rank, name, ms, ... }, or null; the owner's own row says
// owner: true and the rank it would have).
export async function challengeBoard( context ) {

	const { env, request, url } = context;
	const challenge = Number( url.searchParams.get( 'challenge' ) );
	if ( ! Number.isSafeInteger( challenge ) || challenge < 1 ) throw bad();
	const id = askedPlayer( url );
	await looks( env, request );
	const db = database( env );
	const key = boardKey( url, challenge );
	const cached = await caches.default.match( key );
	let board;
	if ( cached ) board = await cached.json();
	else {

		const [ found, top ] = await db.batch( [
			db.prepare( 'SELECT * FROM challenges WHERE id = ?' ).bind( challenge ),
			topQuery( db, env, challenge, TOP ),
		] );
		const row = found.results[ 0 ];
		if ( ! row ) throw new HttpError( 404, 'No such challenge' );
		board = { challenge: { ...challengeOf( row ), replacedAt: row.replaced_at, finalAt: row.final_at }, total: row.drivers, rows: top.results.map( entryOf ) };
		await caches.default.put( key, json( board, 200, { 'Cache-Control': `public, max-age=${ BOARD_CACHE }` } ) );

	}

	const answer = { ...board };
	const headers = { 'X-Board-Cache': cached ? 'hit' : 'miss' };
	if ( id ) {

		// The player's own row, kept as the board is (their new best clears it).
		const mine = boardKey( url, challenge, id );
		const kept = await caches.default.match( mine );
		headers[ 'X-Player-Cache' ] = kept ? 'hit' : 'miss';
		if ( kept ) return json( { ...answer, me: ( await kept.json() ).me }, 200, headers );
		const row = await db.prepare( `SELECT p.name, t.ms, t.vehicle, t.owner, t.created_at, ${ hasPass( 'p.account_id', '?3' ) } AS supporter, ${ xpOf( 'p' ) } AS xp, p.title,
			( SELECT COUNT(*) FROM challenge_times o WHERE ${ ahead( 'o', 't' ) } ) + 1 AS rank
			FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE t.challenge_id = ?1 AND t.player_id = ?2` ).bind( challenge, id, supporterEmails( env ) ).first();
		answer.me = row ? { ...entryOf( row ), ...( row.owner ? { owner: true } : {} ) } : null;
		await caches.default.put( mine, json( { me: answer.me }, 200, { 'Cache-Control': `public, max-age=${ BOARD_CACHE }` } ) );

	}

	return json( answer, 200, headers );

}

// POST /api/challenges/time { id, secret, visit, challenge, run, ms, passes, vehicle }: a run of a
// live challenge finished, ms its time and passes when each point was passed ([ [ index, ms ] ], in
// the order passed). { ms: the player's best, rank, total, isNewBest, top: [ the FINISH_TOP best ] }
// (rank among the players on the board; for the owner's runs, kept off it, the rank it would have,
// with owner: true). 400 for a run the game couldn't have driven, 403 for a visit, a player or a
// challenge that won't do, 429 too often (reason: 'daily' once the visitor's day is used up). The
// same run posted again (its answer lost on the way, so the page tries again) is answered as it was
// taken, nothing more written or counted.
export async function postTime( context ) {

	const { request, env, limits, now } = context;
	const db = database( env );
	const body = await readJson( request, 2048 );
	if ( ! isObject( body ) ) throw bad();
	const { id, secret } = credentials( body );
	const { challenge: challengeId, run, ms, passes, vehicle } = body;
	if ( ! Number.isSafeInteger( challengeId ) || challengeId < 1 || typeof run !== 'string' || ! RUN_ID.test( run ) ) throw bad();
	if ( typeof vehicle !== 'string' || ! VEHICLES.has( vehicle ) || ! Number.isSafeInteger( ms ) || ms <= 0 ) throw bad();
	if ( ! Array.isArray( passes ) || passes.length > 32 ) throw bad();

	const visit = await readVisit( env, body.visit, now );
	if ( ! visit ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	// The challenge itself, from D1 (one the owner has replaced in the last minute may still be in
	// some instance's list): live, or over a moment ago with the run begun before its end.
	const row = await db.prepare( 'SELECT * FROM challenges WHERE id = ?' ).bind( challengeId ).first();
	const open = row && row.replaced_at === null && row.final_at === null && now >= row.starts_at && ( now < row.ends_at || ( now < row.ends_at + GRACE && now - ms < row.ends_at ) );
	if ( ! open ) throw new HttpError( 403, 'That challenge is over', { reason: 'challenge' } );
	// An Earth challenge needs an Earth visit (one the Earth's caps let through, or the owner's): a
	// Moon visit costs nothing but a robot check. The Moon's takes any.
	if ( row.world === 'earth' && ! visit.earth && ! visit.owner ) throw new HttpError( 403, 'Forbidden', { reason: 'world' } );
	const challenge = challengeOf( row );
	// No longer than the visit has lasted, and possible on the route.
	if ( ms / 1000 > ( now - visit.issuedAt ) / 1000 + SLACK || ! checkPasses( challenge, ms, passes ) ) throw bad();

	const player = await authenticate( db, id, secret );
	// One visit, one player, as for scores.
	const [ , bound ] = await db.batch( [
		db.prepare( 'INSERT INTO visits ( id, player_id, expires_at ) VALUES ( ?, ?, ? ) ON CONFLICT ( id ) DO NOTHING' ).bind( visit.id, id, visit.expiresAt ),
		db.prepare( 'SELECT player_id FROM visits WHERE id = ?' ).bind( visit.id ),
	] );
	if ( bound.results[ 0 ]?.player_id !== id ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	const was = await db.prepare( 'SELECT ms, owner, run_id FROM challenge_times WHERE challenge_id = ? AND player_id = ?' ).bind( challengeId, id ).first();
	// The run that's already the best, posted again: its answer was lost on the way (a phone losing
	// its signal) and the page has tried again. Answered as it was taken, without the gap (it's
	// been taken) but held to CHALLENGE_LOOKS as a board's look is, since it's one.
	if ( was?.run_id === run && was.ms === ms ) {

		await looks( env, request );
		return answerTime( db, env, challengeId, id, true );

	}

	// One time every TIME_GAP from a player, claimed in one statement so two at once can't both get
	// in. A player held till midnight (their visitor's day used up, below) is turned away here.
	const gap = await db.prepare( 'UPDATE players SET last_time_at = ?1, last_seen_at = ?1 WHERE id = ?2 AND last_time_at <= ?3' ).bind( now, id, now - TIME_GAP ).run();
	if ( ! gap.meta.changes ) {

		const held = Math.ceil( ( player.last_time_at + TIME_GAP - now ) / 1000 );
		if ( held > TIME_GAP / 1000 ) throw new HttpError( 429, 'That\'s all for today. Try again tomorrow', { retryAfter: held, reason: 'daily' }, { 'Retry-After': String( held ) } );
		const retryAfter = Math.ceil( TIME_GAP / 1000 );
		throw new HttpError( 429, 'Too many times. Try again in a moment', { retryAfter }, { 'Retry-After': String( retryAfter ) } );

	}

	try {

		await takeTurn( limits, request, 'time', now, setting( env.CHALLENGE_TIMES_PER_VISITOR_DAILY, TIMES_DAILY ) );

	} catch ( err ) {

		// The visitor's day used up: this player's gap is set to run out at midnight UTC (when the
		// visitor's day starts again), so until then their tries stop at the gap above, before they
		// write anything or ask DriveLimits again. Each of a visitor's players costs one more try,
		// not one every TIME_GAP all day.
		if ( err.status === 429 ) await db.prepare( 'UPDATE players SET last_time_at = ? WHERE id = ?' ).bind( periodOf( 'day', now ).ends - TIME_GAP, id ).run();
		throw err;

	}

	const owner = visit.owner ? 1 : 0;
	const isNewBest = ! was || ms < was.ms;
	if ( isNewBest ) {

		// Only a better time replaces the best; the owner's mark stays once it's there. A new player
		// on the board (not the owner) counts in its drivers. Both only while the challenge isn't yet
		// finished or replaced, checked in the same writes: it was open when its row was read above,
		// but its final places may have been written since (a post in the minute after its end, as
		// finishEnded runs), and a time written after them would be one its places don't count.
		const [ written ] = await db.batch( [
			db.prepare( `INSERT INTO challenge_times ( challenge_id, player_id, ms, passes, vehicle, run_id, visit, owner, created_at, first_at ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9
				WHERE EXISTS ( SELECT 1 FROM challenges WHERE id = ?1 AND final_at IS NULL AND replaced_at IS NULL )
				ON CONFLICT ( challenge_id, player_id ) DO UPDATE SET ms = excluded.ms, passes = excluded.passes, vehicle = excluded.vehicle, run_id = excluded.run_id,
				visit = excluded.visit, owner = MAX( challenge_times.owner, excluded.owner ), created_at = excluded.created_at WHERE excluded.ms < challenge_times.ms` )
				.bind( challengeId, id, ms, JSON.stringify( passes ), vehicle, run, visit.id, owner, now ),
			...was || owner ? [] : [ db.prepare( 'UPDATE challenges SET drivers = drivers + 1 WHERE id = ? AND final_at IS NULL AND replaced_at IS NULL' ).bind( challengeId ) ],
		] );
		if ( ! written.meta.changes ) throw new HttpError( 403, 'That challenge is over', { reason: 'challenge' } );
		// So the player, and anyone asking here, sees it straight away (in this one of Cloudflare's
		// places; elsewhere within BOARD_CACHE s). Nothing going wrong in it turns the best that's now
		// kept into an error.
		await forgetTime( context, challengeId, id ).catch( err => console.error( 'Challenge caches', err?.name, err?.message ) );

	}

	return answerTime( db, env, challengeId, id, isNewBest );

}

// postTime's answer, for `player` on challenge `id`: their best, its rank, the board's count and
// top, and whether `isNewBest`.
async function answerTime( db, env, id, player, isNewBest ) {

	const [ standing, top ] = await db.batch( [
		db.prepare( `SELECT t.ms, t.owner, ( SELECT COUNT(*) FROM challenge_times o WHERE ${ ahead( 'o', 't' ) } ) + 1 AS rank, c.drivers
			FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id WHERE t.challenge_id = ? AND t.player_id = ?` ).bind( id, player ),
		topQuery( db, env, id, FINISH_TOP ),
	] );
	const mine = standing.results[ 0 ];
	return json( {
		ms: mine.ms, rank: mine.rank, total: mine.drivers, isNewBest, top: top.results.map( entryOf ),
		...( mine.owner ? { owner: true } : {} ),
	} );

}

// The cached rows a new best on challenge `id` by `player` changes: its board and the player's own
// row there, at once; and the list's tops and the player's rows on the six, with the six's ids
// this instance knows (or, if it doesn't just now, in the background: finding them may mean
// fixing a new period's six, which is no part of a time's answer).
async function forgetTime( context, id, player ) {

	const { url, ctx } = context;
	const lists = rows => {

		const ids = rows.map( row => row.id );
		return [ listKey( url, ids ), mineKey( url, ids, player ) ];

	};
	const known = liveKnown( context.now );
	await Promise.all( [ boardKey( url, id ), boardKey( url, id, player ), ...known ? lists( known ) : [] ].map( key => caches.default.delete( key ) ) );
	if ( ! known ) await later( ctx, liveChallenges( context ).then( rows => Promise.all( lists( rows ).map( key => caches.default.delete( key ) ) ) ), 'Challenge caches' );

}

// `work` left to finish after the answer has gone (ctx.waitUntil, as the visits' counts are), its
// failure logged, never the answer's; awaited where there's no ctx.
function later( ctx, work, what ) {

	const done = work.catch( err => console.error( what, err?.name, err?.message ) );
	if ( ctx?.waitUntil ) ctx.waitUntil( done );
	else return done;

}

// GET /api/admin/challenges, to an account in ADMIN_EMAILS (adminAccount: 401, 403, 429 past
// ADMIN_LOOKS): { now, current: [ CHALLENGE + { source, total, top } ], upcoming: [ { period, key,
// world, kind, place, region, lat, lon, source, startsAt } ], picks: [ the owner's picks from now on ],
// approved: [ { world, cell, name, region, lat, lon } ], featured: { earth: [ PLACE ], moon: [ PLACE ] },
// busy: { earth: [ part 1's top places that aren't featured ], moon: [...] } }, upcoming the next
// period of each kind on each world as it would be fixed (the owner's pick, or the rotation's).
export async function adminChallenges( context ) {

	await adminAccount( context );
	return adminAnswer( context );

}

// The admin page's answer (adminChallenges'), the account already checked.
async function adminAnswer( context ) {

	const { env, now } = context;
	const db = database( env );
	const rows = await liveChallenges( context );
	const ids = rows.map( row => row.id );
	const current = periodsAt( now );
	const [ picks, places, counts, ...tops ] = await db.batch( [
		db.prepare( 'SELECT * FROM challenge_picks WHERE period IN ( SELECT value FROM json_each( ? ) ) ORDER BY period, world' ).bind( JSON.stringify( nextPeriods( now, 40 ) ) ),
		db.prepare( 'SELECT * FROM challenge_places ORDER BY world, created_at' ),
		db.prepare( `SELECT id, drivers FROM challenges WHERE id IN ( ${ ids.map( () => '?' ).join( ', ' ) } )` ).bind( ...ids ),
		...ids.map( challenge => topQuery( db, env, challenge, LIST_TOP ) ),
	] );
	const drivers = new Map( counts.results.map( row => [ row.id, row.drivers ] ) );
	const approved = places.results;
	const upcoming = [];
	for ( const period of current.map( nextPeriod ) ) {

		for ( const world of WORLDS ) {

			const pick = picks.results.find( p => p.period === period.key && p.world === world );
			const chosen = pick ? pickedPlace( pick ) : await rotationPick( env, period, world, approved );
			upcoming.push( { period: period.kind, key: period.key, world, kind: chosen.kind, place: chosen.place.name, region: chosen.place.region, lat: chosen.place.lat, lon: chosen.place.lon, source: chosen.source, startsAt: period.starts } );

		}

	}

	return json( {
		now,
		current: rows.map( ( row, i ) => ( { ...challengeOf( row ), source: row.source, total: drivers.get( row.id ) ?? 0, top: tops[ i ].results.map( entryOf ) } ) ),
		upcoming,
		picks: picks.results.map( pick => ( { period: pick.period, world: pick.world, kind: pick.kind, place: pick.place, region: pick.region, lat: pick.lat, lon: pick.lon, heading: pick.heading } ) ),
		approved: approved.map( place => ( { world: place.world, cell: `${ place.world }:${ place.cell_row }:${ place.cell_column }`, name: place.name, region: place.region, lat: place.lat, lon: place.lon } ) ),
		featured: Object.fromEntries( WORLDS.map( world => [ world, FEATURED[ world ].map( ( { id, name, region, lat, lon } ) => ( { id, name, region, lat, lon } ) ) ] ) ),
		busy: await busyPlaces( context, db ),
	} );

}

// POST /api/admin/challenges, to an account in ADMIN_EMAILS, from the admin page (the same-origin
// and JSON checks every change has, index.js):
//   { action: 'pick', period, world, kind, place: { featured: id } | { cell } | { name, region, lat,
//     lon, heading }, live }: that period's challenge on that world (today's, this week's or this
//     month's, or one ahead, up to AHEAD days), a featured place, an approved or busy drop-in place
//     (its cell) or coordinates and a name. The live one, once anyone has a time on it, only with
//     live: true (else 409 { reason: 'live', drivers }): it's replaced, its board kept apart.
//   { action: 'unpick', period, world, live }: back to the rotation's (the live one, as for pick).
//   { action: 'approve', world, cell } and { action: 'unapprove', world, cell }: a busy drop-in
//     place in the rotation, or out of it.
// Answers as GET does, with what changed.
export async function adminChange( context ) {

	const { request, env, now } = context;
	await adminAccount( context );
	const db = database( env );
	const body = await readJson( request, 2048 );
	if ( ! isObject( body ) || ! WORLDS.includes( body.world ) ) throw bad();
	const { action, world } = body;
	if ( action === 'approve' || action === 'unapprove' ) {

		const cell = checkCell( body.cell );
		if ( ! cell || cell.world !== world ) throw bad();
		if ( action === 'unapprove' ) await db.prepare( 'DELETE FROM challenge_places WHERE world = ? AND cell_row = ? AND cell_column = ?' ).bind( world, cell.row, cell.column ).run();
		else {

			const { lat, lon } = cellMiddle( world, cell.row, cell.column );
			const named = nameCell( world, lat, lon, await townsFor( env, context.url ) );
			const added = await db.prepare( `INSERT INTO challenge_places ( world, cell_row, cell_column, name, region, lat, lon, created_at ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
				WHERE ( SELECT COUNT(*) FROM challenge_places WHERE world = ?1 ) < ?9 ON CONFLICT DO NOTHING` ).bind( world, cell.row, cell.column, named.name, named.region, lat, lon, now, APPROVED ).run();
			if ( ! added.meta.changes && ! await db.prepare( 'SELECT 1 FROM challenge_places WHERE world = ? AND cell_row = ? AND cell_column = ?' ).bind( world, cell.row, cell.column ).first() ) {

				throw new HttpError( 409, `At most ${ APPROVED } places a world`, { reason: 'full' } );

			}

		}

		return adminAnswer( context );

	}

	if ( action !== 'pick' && action !== 'unpick' ) throw bad();
	const period = parsePeriod( body.period );
	if ( ! period || period.ends <= now || period.starts > now + AHEAD * DAY ) throw bad();
	const pick = action === 'pick' ? await checkPick( context, db, body ) : null;
	const isLive = period.starts <= now;
	const fixed = isLive ? await db.prepare( 'SELECT * FROM challenges WHERE period = ? AND world = ? AND replaced_at IS NULL' ).bind( period.key, world ).first() : null;
	const writes = pick
		? [ db.prepare( `INSERT INTO challenge_picks ( period, world, kind, place, region, lat, lon, heading, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )
			ON CONFLICT ( period, world ) DO UPDATE SET kind = excluded.kind, place = excluded.place, region = excluded.region, lat = excluded.lat, lon = excluded.lon,
			heading = excluded.heading, created_at = excluded.created_at` ).bind( period.key, world, pick.kind, pick.name, pick.region, pick.lat, pick.lon, pick.heading ?? null, now ) ]
		: [ db.prepare( 'DELETE FROM challenge_picks WHERE period = ? AND world = ?' ).bind( period.key, world ) ];
	if ( fixed ) {

		// What it would be now: the pick, or the rotation's.
		const approved = ( await db.prepare( 'SELECT * FROM challenge_places' ).all() ).results;
		const chosen = pick ? { place: pick, kind: pick.kind, source: 'owner' } : await rotationPick( env, period, world, approved );
		const made = await challengeFor( env, period, world, chosen, now );
		if ( made.kind === fixed.kind && made.place === fixed.place && made.region === fixed.region && made.route === fixed.route ) {

			// The same challenge as the live one (back to the rotation on one the rotation chose, or a
			// pick of the place and kind it already is): nothing to replace, so its board goes on, with
			// no warning; only whose it's said to be changes.
			await db.batch( [ ...writes, db.prepare( 'UPDATE challenges SET source = ? WHERE id = ?' ).bind( made.source, fixed.id ) ] );
			live = null;
			return adminAnswer( context );

		}

		if ( fixed.drivers > 0 && body.live !== true ) {

			throw new HttpError( 409, 'That challenge is live: changing it starts a new board', { reason: 'live', drivers: fixed.drivers } );

		}

		// The live one replaced: kept, with its board (finished now: its final places written), and
		// the new one fixed from the pick (or the rotation) as the period's first ask would.
		await db.batch( [
			...writes,
			db.prepare( 'UPDATE challenges SET replaced_at = ? WHERE id = ? AND replaced_at IS NULL' ).bind( now, fixed.id ),
			...finishQueries( db, fixed.id, now ),
			insertQuery( db, made ),
		] );
		live = null;

	} else await db.batch( writes );

	return adminAnswer( context );

}

// --- the live challenges ---

// The six live challenges' rows (the day's, the week's and the month's on the Earth, then the
// Moon), fixed in D1 the first time each is asked for in its period (from the owner's pick, or the
// rotation's), kept LIVE_KEPT ms in this Worker instance. Challenges whose period ended at least
// GRACE ago are given their final places as this goes (finishEnded), in the background: it's no
// part of the answer, so it can neither slow one nor turn one into an error.
export async function liveChallenges( context ) {

	const { env, now } = context;
	const known = liveKnown( now );
	if ( known ) return known;
	const periods = periodsAt( now );
	const keys = periods.map( period => period.key ).join( ',' );
	const db = database( env );
	const select = () => db.prepare( `SELECT * FROM challenges WHERE period IN ( ?, ?, ? ) AND replaced_at IS NULL` ).bind( ...periods.map( period => period.key ) ).all();
	let rows = ( await select() ).results;
	const missing = periods.flatMap( period => WORLDS.map( world => ( { period, world } ) ) ).filter( ( { period, world } ) => ! rows.some( row => row.period === period.key && row.world === world ) );
	if ( missing.length ) {

		const [ picks, places ] = await db.batch( [
			db.prepare( 'SELECT * FROM challenge_picks WHERE period IN ( ?, ?, ? )' ).bind( ...periods.map( period => period.key ) ),
			db.prepare( 'SELECT * FROM challenge_places' ),
		] );
		const made = await Promise.all( missing.map( async ( { period, world } ) => {

			const pick = picks.results.find( p => p.period === period.key && p.world === world );
			return challengeFor( env, period, world, pick ? pickedPlace( pick ) : await rotationPick( env, period, world, places.results ), now );

		} ) );
		// (Two instances fixing the same period at once: the first one's row stays, and both read it.)
		await db.batch( made.map( challenge => insertQuery( db, challenge ) ) );
		rows = ( await select() ).results;

	}

	await later( context.ctx, finishEnded( db, now ), 'Finishing challenges' );
	rows.sort( ( a, b ) => WORLDS.indexOf( a.world ) - WORLDS.indexOf( b.world ) || PERIOD_KINDS.indexOf( periodKind( a.period ) ) - PERIOD_KINDS.indexOf( periodKind( b.period ) ) );
	live = { keys, at: now, rows };
	return rows;

}

// The six live challenges' rows as this instance has them for `now`, or null when it hasn't (none
// yet, from another period, or older than LIVE_KEPT).
function liveKnown( now ) {

	const keys = periodsAt( now ).map( period => period.key ).join( ',' );
	return live?.keys === keys && now >= live.at && now - live.at < LIVE_KEPT ? live.rows : null;

}

// A challenge to fix for `period` on `world`, chosen as `chosen` ({ place, kind, source }): its row's
// values, with its route laid out from the period's own random numbers.
export async function challengeFor( env, period, world, { place, kind, source }, now ) {

	const random = randomFrom( await seed( env, `route:${ period.key }:${ world }:${ kind }:${ place.lat },${ place.lon }` ) );
	const route = makeRoute( { kind, size: period.kind, world, place }, random, world === 'moon' ? await moonCheck( env ) : null );
	return { period: period.key, world, kind, place: place.name, region: place.region ?? '', route: JSON.stringify( route ), source, startsAt: period.starts, endsAt: period.ends, createdAt: now };

}

function insertQuery( db, c ) {

	return db.prepare( `INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ) ON CONFLICT DO NOTHING` )
		.bind( c.period, c.world, c.kind, c.place, c.region, c.route, c.source, c.startsAt, c.endsAt, c.createdAt );

}

// The rotation's choice for `period` on `world`: { place, kind, source: 'rotation' }. It goes round
// the places (the featured ones and `approved`, challenge_places' rows) in an order shuffled afresh
// each time round, by HMACs of the round and each place with the Worker's derived key, one a period
// (its own place, the next in the order): so every instance agrees, and each place comes about once
// a round. Two rules on top. The three live on a world are three places: a period never takes the
// rotation's pick for a longer period it's in (a day its week's or its month's; a week the month it
// starts in or the one it ends in). And no place comes twice in a row: a period never takes the
// period before's pick. One whose own place is ruled out steps aside to the place half a round on
// in the order, or the first free one after that, never the next or the last in the order (the
// periods either side's own places).
export async function rotationPick( env, period, world, approved ) {

	const places = candidates( world, approved );
	// (Kept for this instance: a day's asks for its week's and month's, and the admin page for six.)
	const key = `${ env.TURNSTILE_SECRET }:${ period.key }:${ world }:${ places.map( place => place.id ).join( ',' ) }`;
	if ( ! picked.has( key ) ) {

		if ( picked.size >= 256 ) picked.clear();
		picked.set( key, rotate( env, period, world, approved, places ).catch( err => {

			picked.delete( key );
			throw err;

		} ) );

	}

	return picked.get( key );

}

// The period before's pick is only worked out where it could be this one's own place: at a round's
// start (a new order, whose first may be the last round's last), and where this one steps aside
// anyway. Anywhere else it's the order's last place, or a step aside, which is never to the next
// place in the order: neither is this one's. So working back goes on only through periods that each
// start a round or step aside, and as a round's own places are all different, only a few of a
// round's periods can step aside (those whose own place is one of the few the longer periods over
// them took): it always ends within a round, a few periods back at most.
async function rotate( env, period, world, approved, places ) {

	const avoid = new Set();
	const longer = period.kind === 'day' ? [ periodOf( 'week', period.starts ), periodOf( 'month', period.starts ) ]
		: period.kind === 'week' ? [ periodOf( 'month', period.starts ), periodOf( 'month', period.ends - 1 ) ] : [];
	for ( const over of longer ) avoid.add( ( await rotationPick( env, over, world, approved ) ).place.id );
	const count = places.length;
	const index = periodIndex( period );
	const round = Math.floor( index / count );
	const order = await orderOf( env, period.kind, world, round, places );
	let at = index % count;
	if ( index > 0 && ( at === 0 || avoid.has( order[ at ].id ) ) ) avoid.add( ( await rotationPick( env, periodOf( period.kind, period.starts - 1 ), world, approved ) ).place.id );
	if ( avoid.has( order[ at ].id ) ) {

		const half = Math.floor( count / 2 );
		for ( let k = 0; k < count; k ++ ) {

			const next = ( at + half + k ) % count;
			if ( ! avoid.has( order[ next ].id ) && Math.abs( next - at ) > 1 ) {

				at = next;
				break;

			}

		}

	}

	const kind = kindFor( period.kind, randomFrom( await seed( env, `kind:${ period.key }:${ world }` ) )() );
	return { place: order[ at ], kind, source: 'rotation' };

}

// `places` in the order of `round` of `kind`'s periods on `world`: sorted by an HMAC of the round and
// each place's id. (Kept for this instance: a round's periods all ask for it.)
function orderOf( env, kind, world, round, places ) {

	const key = `${ env.TURNSTILE_SECRET }:${ kind }:${ world }:${ round }:${ places.map( place => place.id ).join( ',' ) }`;
	if ( ! orders.has( key ) ) {

		if ( orders.size >= 64 ) orders.clear();
		orders.set( key, Promise.all( places.map( place => seed( env, `order:${ kind }:${ world }:${ round }:${ place.id }` ).then( hex ) ) ).then( tags => places
			.map( ( place, i ) => [ tags[ i ], place ] ).sort( ( a, b ) => a[ 0 ] < b[ 0 ] ? - 1 : a[ 0 ] > b[ 0 ] ? 1 : 0 ).map( ( [ , place ] ) => place ) ).catch( err => {

			orders.delete( key );
			throw err;

		} ) );

	}

	return orders.get( key );

}

// The places the rotation goes round on `world`: the featured ones, then the approved drop-in places.
function candidates( world, approved ) {

	return [
		...FEATURED[ world ],
		...approved.filter( place => place.world === world ).map( place => ( { id: `cell:${ place.world }:${ place.cell_row }:${ place.cell_column }`, name: place.name, region: place.region, lat: place.lat, lon: place.lon } ) ),
	];

}

// An owner's pick (challenge_picks' row) as rotationPick's choice is.
function pickedPlace( pick ) {

	return { place: { name: pick.place, region: pick.region, lat: pick.lat, lon: pick.lon, ...( pick.heading === null ? {} : { heading: pick.heading } ) }, kind: pick.kind, source: 'owner' };

}

// What an admin's pick says: { kind, name, region, lat, lon, heading }, or a 400.
async function checkPick( context, db, body ) {

	const { world, kind, place } = body;
	if ( ! KINDS.includes( kind ) || ! isObject( place ) ) throw bad();
	if ( typeof place.featured === 'string' ) {

		const found = FEATURED[ world ].find( p => p.id === place.featured );
		if ( ! found ) throw bad();
		return { kind, name: found.name, region: found.region, lat: found.lat, lon: found.lon, heading: found.heading };

	}

	if ( typeof place.cell === 'string' ) {

		const cell = checkCell( place.cell );
		if ( ! cell || cell.world !== world ) throw bad();
		const { lat, lon } = cellMiddle( world, cell.row, cell.column );
		const approved = await db.prepare( 'SELECT name, region FROM challenge_places WHERE world = ? AND cell_row = ? AND cell_column = ?' ).bind( world, cell.row, cell.column ).first();
		const named = approved ?? nameCell( world, lat, lon, await townsFor( context.env, context.url ) );
		return { kind, name: named.name, region: named.region ?? '', lat, lon };

	}

	const name = cleanPlace( place.name );
	const region = place.region === undefined || place.region === '' ? '' : cleanPlace( place.region );
	const { lat, lon, heading } = place;
	if ( ! name || region === null || ! Number.isFinite( lat ) || ! Number.isFinite( lon ) || Math.abs( lat ) > 89.9 || Math.abs( lon ) > 180 ) throw bad();
	if ( heading !== undefined && heading !== null && ! ( Number.isFinite( heading ) && heading >= 0 && heading < 360 ) ) throw bad();
	return { kind, name, region, lat: round6( lat ), lon: round6( lon ), ...( Number.isFinite( heading ) ? { heading } : {} ) };

}

// Challenges over at least GRACE ago and not yet given their final places: their final_rank written
// into each player's time (1 the fastest, the owner's left out), and final_at. One indexed look
// (challenges_unfinished) when there are none.
async function finishEnded( db, now ) {

	const ended = ( await db.prepare( 'SELECT id FROM challenges WHERE final_at IS NULL AND ends_at <= ? LIMIT 12' ).bind( now - GRACE ).all() ).results;
	if ( ended.length ) await db.batch( ended.flatMap( row => finishQueries( db, row.id, now ) ) );

}

function finishQueries( db, id, now ) {

	return [
		db.prepare( `UPDATE challenge_times SET final_rank = ranked.place FROM (
			SELECT player_id, ROW_NUMBER() OVER ( ORDER BY ms, created_at, player_id ) AS place FROM challenge_times WHERE challenge_id = ?1 AND owner = 0
		) AS ranked WHERE challenge_times.challenge_id = ?1 AND challenge_times.player_id = ranked.player_id` ).bind( id ),
		db.prepare( 'UPDATE challenges SET final_at = ? WHERE id = ? AND final_at IS NULL' ).bind( now, id ),
	];

}

// The next `count` periods' keys of every kind from now (the day's, the week's and the month's
// included): which of the owner's picks the admin page is shown.
function nextPeriods( now, count ) {

	return periodsAt( now ).flatMap( period => {

		const keys = [];
		for ( let p = period, i = 0; i < count; i ++, p = nextPeriod( p ) ) keys.push( p.key );
		return keys;

	} );

}

// --- boards ---

// The top `most` on challenge `id`'s board (the owner's runs left out), fastest first, with what a
// row shows.
function topQuery( db, env, id, most ) {

	return db.prepare( `SELECT p.name, t.ms, t.vehicle, t.created_at, ${ hasPass( 'p.account_id', '?3' ) } AS supporter, ${ xpOf( 'p' ) } AS xp, p.title
		FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE t.challenge_id = ?1 AND t.owner = 0 ORDER BY t.ms, t.created_at, t.player_id LIMIT ?2` ).bind( id, most, supporterEmails( env ) );

}

// The player's best and rank on each of the challenges `ids` ({ [ id ]: { ms, rank, owner? } }),
// kept as the boards are.
async function myStanding( db, url, ids, player ) {

	const key = mineKey( url, ids, player );
	const kept = await caches.default.match( key );
	if ( kept ) return kept.json();
	const rows = ( await db.prepare( `SELECT t.challenge_id, t.ms, t.owner, ( SELECT COUNT(*) FROM challenge_times o WHERE ${ ahead( 'o', 't' ) } ) + 1 AS rank
		FROM challenge_times t WHERE t.player_id = ? AND t.challenge_id IN ( ${ ids.map( () => '?' ).join( ', ' ) } )` ).bind( player, ...ids ).all() ).results;
	const mine = Object.fromEntries( rows.map( row => [ row.challenge_id, { ms: row.ms, rank: row.rank, ...( row.owner ? { owner: true } : {} ) } ] ) );
	await caches.default.put( key, json( mine, 200, { 'Cache-Control': `public, max-age=${ BOARD_CACHE }` } ) );
	return mine;

}

// SQL for "row `o` is ahead of row `t` on t's board": a quicker time, or the same set earlier, and
// not the owner's.
function ahead( o, t ) {

	return `${ o }.challenge_id = ${ t }.challenge_id AND ${ o }.owner = 0 AND ( ${ o }.ms < ${ t }.ms OR ( ${ o }.ms = ${ t }.ms
		AND ( ${ o }.created_at < ${ t }.created_at OR ( ${ o }.created_at = ${ t }.created_at AND ${ o }.player_id < ${ t }.player_id ) ) ) )`;

}

// A board's row as the page shows it: the name, the time, the ride, the day it was set, the player's
// level and title as they are now, supporter only for a supporter.
function entryOf( row, i ) {

	const shown = { name: row.name, ms: row.ms, vehicle: row.vehicle, date: dateOf( row.created_at ), ...standingOf( row.xp, row.title ) };
	if ( Number.isInteger( i ) ) shown.rank = i + 1;
	else if ( row.rank ) shown.rank = row.rank;
	return row.supporter ? { ...shown, supporter: true } : shown;

}

// A challenge's row as the page has it.
function challengeOf( row ) {

	return {
		id: row.id, period: periodKind( row.period ), key: row.period, world: row.world, kind: row.kind,
		place: row.place, region: row.region, route: JSON.parse( row.route ), startsAt: row.starts_at, endsAt: row.ends_at,
	};

}

function periodKind( key ) {

	return key.slice( 0, key.indexOf( ':' ) );

}

// Where the list's tops for the challenges `ids`, a board, and a player's own rows are kept in the
// cache.
function listKey( url, ids ) {

	return new Request( `${ url.origin }/api/challenges/list?ids=${ ids.join( ',' ) }` );

}

function mineKey( url, ids, player ) {

	return new Request( `${ url.origin }/api/challenges/list?ids=${ ids.join( ',' ) }&player=${ player }` );

}

function boardKey( url, challenge, player = '' ) {

	return new Request( `${ url.origin }/api/challenges/board?challenge=${ challenge }${ player ? `&player=${ player }` : '' }` );

}

// The player asked about (?id=), or null; a 400 if it isn't one.
function askedPlayer( url ) {

	const id = url.searchParams.get( 'id' );
	if ( id !== null && ! PLAYER_ID.test( id ) ) throw bad();
	return id;

}

// CHALLENGE_LOOKS (Cloudflare's rate limiter, by address: no Durable Object request) for the lists
// and boards: a burst of them (a script) is turned away before it reads anything.
async function looks( env, request ) {

	if ( env.CHALLENGE_LOOKS && ! ( await env.CHALLENGE_LOOKS.limit( { key: addressOf( request ) } ) ).success ) {

		throw new HttpError( 429, 'Too many. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

}

// --- the admin page's busy places ---

// Part 1's top places over the last BUSY_DAYS on each world that aren't featured ones (topPlaces), for
// the owner to choose from or approve, with each one's cell: kept BUSY_KEPT ms in this instance.
async function busyPlaces( context, db ) {

	const { env, url, now } = context;
	if ( busy && now >= busy.at && now - busy.at < BUSY_KEPT ) return busy.places;
	const from = dateOf( now - ( BUSY_DAYS - 1 ) * DAY );
	const to = dateOf( now );
	const towns = await townsFor( env, url );
	const places = {};
	for ( const world of WORLDS ) {

		const top = await topPlaces( db, { world, from, to, most: 25 }, towns );
		places[ world ] = top.filter( place => ! place.featured ).map( place => ( { name: place.name, region: place.region, lat: place.lat, lon: place.lon, n: place.n, days: place.days, cell: cellOf( world, place.lat, place.lon ) } ) );

	}

	busy = { at: now, places };
	return places;

}

// --- the Moon's ground ---

// A check of a Moon route's faults for makeRoute, on the Moon's own heights (fetched from the site's
// files once per Worker instance), or null if they can't be had just now (the route is laid out
// unchecked, as the Earth's are).
async function moonCheck( env ) {

	if ( ! hasHeights() ) {

		moonLoading ??= ( async () => {

			try {

				const res = await env.ASSETS?.fetch( new Request( `${ SITE }/moon/height.bin` ) );
				if ( res?.ok ) setHeights( new Int16Array( await res.arrayBuffer() ) );

			} catch ( err ) {

				console.error( 'Moon heights', err?.name, err?.message );

			}

		} )();
		await moonLoading;
		moonLoading = null;

	}

	return hasHeights() ? moonFaults : null;

}

// How many of a route's points (and its start) are on ground sloping MOON_SLOPE degrees or more. (The
// place itself, a sprint's or collectibles' start and a landmark's goal, is where it is: it counts
// the same in every one laid out.)
export function moonFaults( route ) {

	return [ [ route.start.lat, route.start.lon ], ...route.points ].filter( ( [ lat, lon ] ) => moonSteep( lat, lon ) ).length;

}

// Whether the Moon's ground at ( lat, lon ) slopes MOON_SLOPE degrees or more across ±SLOPE_REACH m
// (craters under MOON_DETAIL m left out).
export function moonSteep( lat, lon ) {

	const [ n, e, s, w ] = [ 0, 90, 180, 270 ].map( bearing => moonHeightAt( ...destination( 'moon', lat, lon, bearing, SLOPE_REACH ), MOON_DETAIL ) );
	return Math.hypot( n - s, e - w ) / ( 2 * SLOPE_REACH ) >= Math.tan( MOON_SLOPE * Math.PI / 180 );

}

// --- the period's random numbers ---

// The HMAC-SHA256 of `text` with a key derived (HKDF) from TURNSTILE_SECRET with a label of its own:
// the same in every Worker instance, and not to be worked out without the secret.
async function seed( env, text ) {

	if ( typeof env.TURNSTILE_SECRET !== 'string' || ! env.TURNSTILE_SECRET ) throw new HttpError( 503, 'Not set up yet' );
	if ( seeding?.secret !== env.TURNSTILE_SECRET ) {

		const base = await crypto.subtle.importKey( 'raw', encoder.encode( env.TURNSTILE_SECRET ), 'HKDF', false, [ 'deriveKey' ] );
		const key = crypto.subtle.deriveKey( { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array( 0 ), info: encoder.encode( SEED_LABEL ) }, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, [ 'sign' ] );
		seeding = { secret: env.TURNSTILE_SECRET, key };

	}

	return new Uint8Array( await crypto.subtle.sign( 'HMAC', await seeding.key, encoder.encode( text ) ) );

}

function hex( bytes ) {

	return [ ...bytes ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

function round6( degrees ) {

	return Math.round( degrees * 1e6 ) / 1e6;

}

function bad() {

	return new HttpError( 400, 'Bad request' );

}
