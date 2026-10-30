import { HttpError, checkSameOrigin, isObject, json, readJson } from '../http.js';
import { LIBRARY_VEHICLES } from '../../src/drive-app/catalog.js';
import { BOARD_CACHE, PERIODS, boardKey, dateOf, forgetBoards } from './boards.js';
import { cleanPlace, placeKey } from './names.js';
import { PLAYER_ID, authenticate, credentials, database, takeTurn } from './players.js';
import { setting } from './settings.js';
import { VISIT_HOURS, readVisit } from './visits.js';

// The leaderboard (docs/world-drive.md): each player's best stunt score today, this week and all
// time, everywhere and at each place. A score is a run's (src/drive.js: from dropping in to
// changing ride or place), posted by the page as it beats the player's best. Only each player's
// best on each board (boards.js) is kept.
//
// The page reports its own score, so the Worker can't know it's honest; what it can do is make
// cheating costly and keep the board believable:
// - a score comes with a visit token (visits.js), so it's from a visit that passed Turnstile and
//   was counted against the day's caps, in the last VISIT_HOURS; and one visit posts for one player
//   only, so one robot check can't fill the board with names;
// - the run can't be longer than the visit has lasted, and its score can't be more than RATE
//   points a second of it, three times the most the game can give (see maxRate below), nor more
//   than MAX_SCORE; the game's scores are always whole tens, its tricks always read as it writes
//   them, and the vehicle is one it offers;
// - one score every 10 s per player (SCORE_GAP), and SCORES_PER_VISITOR_DAILY a day per visitor.
// What gets through anyway, the owner deletes (docs/world-drive.md).

// The stunt scoring in src/drive.js, which the limits are worked out from (the tests check these
// still match it): points per trick (air: per second), the combo bonus, the top multiplier and the
// fastest the vehicle turns in the air (rad/s, a kart's; bigger vehicles turn more slowly).
export const SCORING = {
	points: { spin: 300, flip: 1000, roll: 800, bounce: 150, air: 300 },
	comboBonus: 1.5,
	multMax: 10,
	airRate: { yaw: 6.5, pitch: 5.5, roll: 6.5 },
};

// The most points a second of driving can earn: every second of it in the air, spinning (a half
// turn scores), flipping and rolling flat out all at once, in big air, with two wall bounces, as a
// combo at the top multiplier. About 44,000 a second; nobody keeps that up.
export function maxRate( { points, comboBonus, multMax, airRate } ) {

	const turns = points.spin * airRate.yaw / Math.PI + points.flip * airRate.pitch / ( 2 * Math.PI ) + points.roll * airRate.roll / ( 2 * Math.PI );
	return ( turns + points.air + 2 * points.bounce ) * comboBonus * multMax;

}

// Three times that, for what the reckoning misses (a trick counted a little short of a whole
// turn, a frame's worth of extra air).
export const RATE = 3 * maxRate( SCORING );
// No score is more than this: the most the game could give in a whole visit is under it.
export const MAX_SCORE = 1e9;
// The longest air (s) that counts: a fall from a skyscraper is under 10 s.
const MAX_AIR = 120;
// How much longer (s) a run may say it has lasted than the visit has, for the clocks of
// Cloudflare's machines and the page's frames.
const SLACK = 30;
// At most one score every SCORE_GAP ms from a player.
export const SCORE_GAP = 10 * 1000;
// Scores a visitor may post in a day (SCORES_PER_VISITOR_DAILY): one every 10 s for four hours.
const SCORES_DAILY = 1500;
const VEHICLES = new Set( [ 'go-kart', ...LIBRARY_VEHICLES ] );
// The tricks of a run's best jump, as drive.js names them (tricksOf), joined with " + ".
const TRICK = /^(?:(\d{3,5}) Spin!|(?:Back|Front)flip(?:!| ×\d{1,3})|Barrel roll(?:!| ×\d{1,3})|Wall bounce(?: ×\d{1,3})?|Big air \d{1,3}\.\d s)$/;
const MAX_TRICKS = 120;
// Kept: the log, and the day and week boards, for this long (ms).
const KEEP = 35 * 24 * 60 * 60 * 1000;
const TOP = 20;

// POST /api/score { id, secret, score, tricks, place, vehicle, airTime, runSeconds, visit }:
// { best, rank, isNewBest } for the all-time board, and the same as `today` and `week`.
export async function postScore( { request, env, url, limits, now } ) {

	checkSameOrigin( request, url );
	const db = database( env );
	const body = await readJson( request, 2048 );
	if ( ! isObject( body ) ) throw bad();
	const { id, secret } = credentials( body );
	const run = checkRun( body );

	const visit = await readVisit( env, body.visit, now );
	if ( ! visit ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	// No longer than the visit, and no more than the game could give in that time.
	if ( run.runSeconds > ( now - visit.issuedAt ) / 1000 + SLACK || run.score > RATE * run.runSeconds ) throw bad();

	const player = await authenticate( db, id, secret );
	// One visit, one player: the first to post with it has it.
	const [ , bound ] = await db.batch( [
		db.prepare( 'INSERT INTO visits ( id, player_id, expires_at ) VALUES ( ?, ?, ? ) ON CONFLICT ( id ) DO NOTHING' ).bind( visit.id, id, visit.expiresAt ),
		db.prepare( 'SELECT player_id FROM visits WHERE id = ?' ).bind( visit.id ),
	] );
	if ( bound.results[ 0 ]?.player_id !== id ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );

	// One score every SCORE_GAP, claimed in one statement so two at once can't both get in.
	const gap = await db.prepare( 'UPDATE players SET last_score_at = ?1, last_seen_at = ?1 WHERE id = ?2 AND last_score_at <= ?3' ).bind( now, id, now - SCORE_GAP ).run();
	if ( ! gap.meta.changes ) {

		const retryAfter = Math.max( 1, Math.ceil( ( player.last_score_at + SCORE_GAP - now ) / 1000 ) );
		throw new HttpError( 429, 'Too many scores. Try again in a moment', { retryAfter }, { 'Retry-After': String( retryAfter ) } );

	}

	await takeTurn( limits, request, 'score', now, setting( env.SCORES_PER_VISITOR_DAILY, SCORES_DAILY ) );

	// The player's best on each board it's on: this period and place, and anywhere.
	const boards = Object.values( PERIODS ).flatMap( period => [ [ period( now ), '' ], [ period( now ), run.placeKey ] ] );
	const results = await db.batch( [
		...boards.map( ( [ period, place ] ) => db.prepare( `INSERT INTO best_scores ( player_id, period, place_key, score, tricks, place, vehicle, air_time, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )
			ON CONFLICT ( player_id, period, place_key ) DO UPDATE SET score = excluded.score, tricks = excluded.tricks, place = excluded.place,
			vehicle = excluded.vehicle, air_time = excluded.air_time, created_at = excluded.created_at WHERE excluded.score > best_scores.score` )
			.bind( id, period, place, run.score, run.tricks, run.place, run.vehicle, run.airTime, now ) ),
		// Tidying up as it goes: the log and the day and week boards after KEEP, visits once over.
		db.prepare( 'DELETE FROM scores WHERE created_at < ?' ).bind( now - KEEP ),
		db.prepare( 'DELETE FROM best_scores WHERE period <> \'all\' AND created_at < ?' ).bind( now - KEEP ),
		db.prepare( 'DELETE FROM visits WHERE expires_at < ?' ).bind( now ),
	] );
	const changed = boards.filter( ( board, i ) => results[ i ].meta.changes > 0 );
	if ( changed.length ) {

		// The log only has what changed a board: what the owner looks through for a cheat.
		await db.prepare( 'INSERT INTO scores ( player_id, score, tricks, place, vehicle, air_time, run_seconds, visit, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
			.bind( id, run.score, run.tricks, run.place, run.vehicle, run.airTime, run.runSeconds, visit.id, now ).run();
		// So the player sees it straight away.
		await forgetBoards( url, changed, id );

	}

	const standing = await db.prepare( `SELECT b.period, b.score, ( SELECT COUNT(*) FROM best_scores o WHERE ${ ahead( 'o', 'b' ) } ) + 1 AS rank
		FROM best_scores b WHERE b.player_id = ? AND b.place_key = '' AND b.period IN ( ?, ?, ? )` ).bind( id, ...boards.filter( ( [ , place ] ) => ! place ).map( ( [ period ] ) => period ) ).all();
	const answer = {};
	for ( const [ name, period ] of Object.entries( PERIODS ) ) {

		const row = standing.results.find( r => r.period === period( now ) );
		answer[ name ] = { best: row?.score ?? 0, rank: row?.rank ?? null, isNewBest: changed.some( ( [ p, place ] ) => p === period( now ) && ! place ) };

	}

	const { all, ...rest } = answer;
	return json( { ...all, ...rest } );

}

// GET /api/leaderboard?period=today|week|all&place=...&id=...: the top TOP of a board, { period,
// place, total, rows: [ { rank, name, score, tricks, place, vehicle, airTime, date } ] }, and with
// an id, `me`: that player's { rank, name, score, ... } on it (or null if they aren't on it).
export async function leaderboard( { env, url, now } ) {

	const db = database( env );
	const { searchParams: params } = url;
	const name = params.get( 'period' ) ?? 'all';
	if ( ! Object.hasOwn( PERIODS, name ) ) throw bad();
	const asked = params.get( 'place' );
	const place = asked ? cleanPlace( asked ) : null;
	if ( asked && ! place ) throw bad();
	const id = params.get( 'id' );
	if ( id !== null && ! PLAYER_ID.test( id ) ) throw bad();

	const period = PERIODS[ name ]( now );
	const where = place ? placeKey( place ) : '';
	// (Cached without the player's id: their own row is kept apart, below.)
	const key = boardKey( url, period, where );
	const cached = await caches.default.match( key );
	let board;
	if ( cached ) board = await cached.json();
	else {

		const [ top, count ] = await db.batch( [
			db.prepare( `SELECT p.name, b.score, b.tricks, b.place, b.vehicle, b.air_time, b.created_at FROM best_scores b JOIN players p ON p.id = b.player_id
				WHERE b.period = ? AND b.place_key = ? ORDER BY b.score DESC, b.created_at, b.player_id LIMIT ?` ).bind( period, where, TOP ),
			db.prepare( 'SELECT COUNT(*) AS total FROM best_scores WHERE period = ? AND place_key = ?' ).bind( period, where ),
		] );
		board = { total: count.results[ 0 ].total, rows: top.results.map( ( row, i ) => ( { rank: i + 1, ...entry( row ) } ) ) };
		await caches.default.put( key, json( board, 200, { 'Cache-Control': `public, max-age=${ BOARD_CACHE }` } ) );

	}

	const answer = { period: name, place, ...board };
	const headers = { 'X-Board-Cache': cached ? 'hit' : 'miss' };
	if ( id ) {

		// The player's own row, kept as the board is (a new best or a rename clears it).
		const mine = boardKey( url, period, where, id );
		const kept = await caches.default.match( mine );
		if ( kept ) answer.me = ( await kept.json() ).me;
		else {

			const row = await db.prepare( `SELECT p.name, b.score, b.tricks, b.place, b.vehicle, b.air_time, b.created_at,
				( SELECT COUNT(*) FROM best_scores o WHERE ${ ahead( 'o', 'b' ) } ) + 1 AS rank
				FROM best_scores b JOIN players p ON p.id = b.player_id WHERE b.player_id = ? AND b.period = ? AND b.place_key = ?` ).bind( id, period, where ).first();
			answer.me = row ? { rank: row.rank, ...entry( row ) } : null;
			await caches.default.put( mine, json( { me: answer.me }, 200, { 'Cache-Control': `public, max-age=${ BOARD_CACHE }` } ) );

		}

		// The two kept a moment apart: never "#131 of 130".
		if ( answer.me ) answer.total = Math.max( answer.total, answer.me.rank );
		headers[ 'X-Player-Cache' ] = kept ? 'hit' : 'miss';

	}

	return json( answer, 200, headers );

}

// A row as the page shows it: the day it was set (UTC), not the time.
function entry( row ) {

	return { name: row.name, score: row.score, tricks: row.tricks, place: row.place, vehicle: row.vehicle, airTime: row.air_time, date: dateOf( row.created_at ) };

}

// SQL for "row `o` is ahead of row `b` on b's board": a higher score, or the same one set earlier.
function ahead( o, b ) {

	return `${ o }.period = ${ b }.period AND ${ o }.place_key = ${ b }.place_key AND ( ${ o }.score > ${ b }.score OR ( ${ o }.score = ${ b }.score
		AND ( ${ o }.created_at < ${ b }.created_at OR ( ${ o }.created_at = ${ b }.created_at AND ${ o }.player_id < ${ b }.player_id ) ) ) )`;

}

// The run as it's kept, or a 400 for anything the game wouldn't send.
function checkRun( body ) {

	const { score, runSeconds, airTime, vehicle } = body;
	if ( ! Number.isSafeInteger( score ) || score < 10 || score > MAX_SCORE || score % 10 !== 0 ) throw bad();
	if ( typeof runSeconds !== 'number' || ! ( runSeconds > 0 ) || runSeconds > VISIT_HOURS * 3600 ) throw bad();
	if ( typeof airTime !== 'number' || ! ( airTime >= 0 ) || airTime > Math.min( runSeconds, MAX_AIR ) ) throw bad();
	if ( typeof vehicle !== 'string' || ! VEHICLES.has( vehicle ) ) throw bad();
	const tricks = checkTricks( body.tricks );
	const place = cleanPlace( body.place );
	if ( ! tricks || ! place ) throw bad();
	return { score, runSeconds: Math.ceil( runSeconds ), airTime: Math.round( airTime * 10 ) / 10, vehicle, tricks, place, placeKey: placeKey( place ) };

}

function checkTricks( value ) {

	if ( typeof value !== 'string' || ! value || value.length > MAX_TRICKS ) return null;
	const parts = value.split( ' + ' );
	if ( parts.length > 5 ) return null;
	const good = parts.every( part => {

		const match = part.match( TRICK );
		return match && ( ! match[ 1 ] || Number( match[ 1 ] ) % 180 === 0 );

	} );
	return good ? value : null;

}

function bad() {

	return new HttpError( 400, 'Bad request' );

}
