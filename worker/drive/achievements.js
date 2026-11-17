import { HttpError, isObject, json, readJson, sha256Hex } from '../http.js';
import {
	ACHIEVEMENTS, ACHIEVEMENT_IDS, CHALLENGES_MOST, COUNTS, PLACINGS, RIDE_FEATS,
	countsOf, readTallies, reached, rideFeat,
} from '../../src/drive-app/achievement-rules.js';
import { WORKS } from '../../src/drive-app/works.js';
import { adminAccount } from './admin.js';
import { lookKey } from './challenges.js';
import { VISITOR_PREFIX } from './dropins.js';
import { credentials, database, takeTurn } from './players.js';
import { setting } from './settings.js';

// Achievements (docs/world-drive.md, "Achievements and rewards"; the list and its rules are
// src/drive-app/achievement-rules.js, which the page shares): what a player has earned, kept in D1
// (`achievements`, one row an achievement a player, with when), and the construction rides those
// unlock, checked wherever a ride shows to others. Each is earned where its count changes:
//
// - the trusted counts (km, Moon drives, Garage changes, rides tried) and the days in a row with the
//   player's progress reports (progress.js), kept in players.tallies, a day's worth at most each;
// - challenges finished as a player's first time on a challenge is written (finishedQuery, from
//   challenges.js's postTime), and places on a board as its final places are (placingQuery, with
//   challenges.js's finishQueries), from the Worker's own times and final_rank, never the page's word;
// - parties by the party's room, when someone else is in it with them (creditParty, from live.js).
//
// A player linked to an account has what any of the account's players has earned, so they follow
// the player as they sign in (with Google or a password) on another device, either way round: as
// levels show the account's best player. The routes here: POST /api/achievements (a player's own,
// for the grid on their profile card) and GET /api/admin/achievements (how many players have each,
// for the owner's page, nothing of who).

// The most of a player's own rows, and of an account's players, one ask reads.
const READ_MOST = 200;
const PLAYERS_MOST = 20;
// A visitor's asks for their achievements a day (ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY): a page asks
// as the grid opens, so a few a visit.
const LOOKS_DAILY = 200;

// SQL for the ids of the player whose id is `id` (a parameter, '?1') and of every player of their
// account: one look by key, and one in players_by_account.
export function playersOf( id ) {

	return `SELECT ${ id } UNION SELECT q.id FROM players q WHERE q.account_id = ( SELECT r.account_id FROM players r WHERE r.id = ${ id } )`;

}

// SQL for the achievements (their ids, comma-separated, or NULL for none) the player in row `p` has
// with their account's players.
export function featsOf( p ) {

	return `( SELECT group_concat( DISTINCT a.achievement ) FROM achievements a WHERE a.player_id IN ( ${ playersOf( `${ p }.id` ) } ) )`;

}

// featsOf's text as a sorted list of ids.
export function featList( text ) {

	return typeof text === 'string' && text ? [ ...new Set( text.split( ',' ) ) ].filter( id => ACHIEVEMENT_IDS.has( id ) ).sort() : [];

}

// A statement writing achievements `ids` for player `id` at `now` (those they have already stay as
// they were), only if `guard` (SQL, with ?1 the player and ?2 the time) holds as it runs.
export function earnQuery( db, id, ids, now, guard = '1' ) {

	return db.prepare( `INSERT INTO achievements ( player_id, achievement, earned_at ) SELECT ?1, value, ?2 FROM json_each( ?3 ) WHERE ${ guard }
		ON CONFLICT DO NOTHING` ).bind( id, now, JSON.stringify( ids ) );

}

// As a player's first time on a challenge is written: the "challenges finished" achievements their
// times have reached, each by whether their nth time is there (one look by the player's key, n rows
// at most: nothing counts the rows).
export function finishedQuery( db, id, now ) {

	const tiers = ACHIEVEMENTS.filter( a => a.count === 'challenges' );
	const has = n => `EXISTS ( SELECT 1 FROM challenge_times WHERE player_id = ?1 LIMIT 1 OFFSET ${ Math.max( 0, Math.floor( n ) - 1 ) } )`;
	return db.prepare( `INSERT INTO achievements ( player_id, achievement, earned_at ) SELECT ?1, value, ?2 FROM json_each( ?3 )
		WHERE CASE value ${ tiers.map( a => `WHEN '${ a.id }' THEN ${ has( a.target ) }` ).join( ' ' ) } ELSE 0 END
		ON CONFLICT DO NOTHING` ).bind( id, now, JSON.stringify( tiers.map( a => a.id ) ) );

}

// With challenge `challenge`'s final places (after challenges.js's finishQueries has written them):
// each placing its players' final_rank reaches (on any board, or on the period's whose board this
// is), written for them. The owner's times have no final_rank, so they're never among them.
export function placingQuery( db, challenge, now ) {

	const placings = PLACINGS.map( a => ( { id: a.id, rank: a.target, period: a.period ?? null } ) );
	return db.prepare( `INSERT INTO achievements ( player_id, achievement, earned_at )
		SELECT t.player_id, json_extract( a.value, '$.id' ), ?2 FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id, json_each( ?3 ) a
		WHERE t.challenge_id = ?1 AND t.final_rank IS NOT NULL AND t.final_rank <= json_extract( a.value, '$.rank' )
			AND ( json_extract( a.value, '$.period' ) IS NULL OR c.period LIKE json_extract( a.value, '$.period' ) || ':%' )
		ON CONFLICT DO NOTHING` ).bind( challenge, now, JSON.stringify( placings ) );

}

// A party's room saw player `id` in party `code` with someone else: counted once a party (a page
// reconnecting to the same party isn't counted again), with the party achievements that reaches.
export async function creditParty( env, id, code, now ) {

	const db = database( env );
	const tiers = ACHIEVEMENTS.filter( a => a.count === 'parties' ).map( a => ( { id: a.id, n: a.target } ) );
	await db.batch( [
		db.prepare( 'UPDATE players SET parties = parties + 1 WHERE id = ?1 AND last_party <> ?2' ).bind( id, code ),
		db.prepare( `INSERT INTO achievements ( player_id, achievement, earned_at ) SELECT ?1, json_extract( value, '$.id' ), ?2 FROM json_each( ?3 )
			WHERE changes() = 1 AND json_extract( value, '$.n' ) <= ( SELECT parties FROM players WHERE id = ?1 ) ON CONFLICT DO NOTHING` ).bind( id, now, JSON.stringify( tiers ) ),
		db.prepare( 'UPDATE players SET last_party = ?2 WHERE id = ?1' ).bind( id, code ),
	] );

}

// Whether player `id` (or their account) may drive `vehicle` where others see it: a ride an
// achievement unlocks only with it. A 403 (reason: 'ride') if not; for any other ride, nothing is read.
export async function checkRide( db, id, vehicle ) {

	const feat = rideFeat( vehicle );
	if ( ! feat ) return;
	const row = await db.prepare( `SELECT 1 AS ok FROM achievements a WHERE a.achievement = ?2 AND a.player_id IN ( ${ playersOf( '?1' ) } ) LIMIT 1` ).bind( id, feat ).first();
	if ( ! row ) throw new HttpError( 403, 'That ride isn\'t unlocked yet', { reason: 'ride', unlock: RIDE_FEATS[ vehicle ].unlock } );

}

// POST /api/achievements { id, secret }: the player's achievements and the counts toward them, with
// their account's (the most any of its players has of each count): { achievements: [ { id, at } ],
// counts: { km, moon, looks, rides, streak, parties, challenges }, rides: [ the construction rides
// unlocked ] }. Any challenges-finished achievement the times have reached and that isn't written
// yet (times from before achievements) is written as it's asked for. Held to ACHIEVEMENT_LOOKS a
// minute (Cloudflare's rate limiter, by the challenges' keyed hash of the address and the day) and
// ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY a day (DriveLimits, by the address's /48).
export async function postAchievements( { request, env, limits, now } ) {

	const db = database( env );
	if ( env.ACHIEVEMENT_LOOKS && ! ( await env.ACHIEVEMENT_LOOKS.limit( { key: await lookKey( env, request, now ) } ) ).success ) {

		throw new HttpError( 429, 'Too many. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

	const body = await readJson( request, 1024 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );
	const { id, secret } = credentials( body );
	await takeTurn( limits, request, 'achievements', now, setting( env.ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY, LOOKS_DAILY ), VISITOR_PREFIX );
	const [ me, players, earned, finished ] = await db.batch( [
		db.prepare( 'SELECT id FROM players WHERE id = ? AND secret_hash = ?' ).bind( id, await sha256Hex( secret ) ),
		db.prepare( `SELECT tallies, parties, streak FROM players WHERE id IN ( ${ playersOf( '?1' ) } ) LIMIT ${ PLAYERS_MOST }` ).bind( id ),
		db.prepare( `SELECT achievement, MIN( earned_at ) AS at FROM achievements WHERE player_id IN ( ${ playersOf( '?1' ) } ) GROUP BY achievement LIMIT ${ READ_MOST }` ).bind( id ),
		db.prepare( `SELECT COUNT( * ) AS n FROM ( SELECT 1 FROM challenge_times WHERE player_id IN ( ${ playersOf( '?1' ) } ) LIMIT ${ CHALLENGES_MOST } )` ).bind( id ),
	] );
	if ( ! me.results.length ) throw new HttpError( 403, 'Forbidden', { reason: 'player' } );

	// The account's best of each count.
	const counts = { km: 0, moon: 0, looks: 0, rides: 0, streak: 0, parties: 0, challenges: finished.results[ 0 ]?.n ?? 0 };
	for ( const row of players.results ) {

		const mine = countsOf( readTallies( row.tallies ), { parties: row.parties, streak: row.streak } );
		for ( const count of [ 'km', 'moon', 'looks', 'rides', 'streak', 'parties' ] ) counts[ count ] = Math.max( counts[ count ], mine[ count ] );

	}

	const achievements = earned.results.filter( row => ACHIEVEMENT_IDS.has( row.achievement ) ).map( row => ( { id: row.achievement, at: row.at } ) );
	const have = new Set( achievements.map( a => a.id ) );
	const owed = reached( { challenges: counts.challenges } ).filter( a => ! have.has( a ) );
	if ( owed.length ) {

		await earnQuery( db, id, owed, now ).run();
		for ( const feat of owed ) achievements.push( { id: feat, at: now } );

	}

	const order = ACHIEVEMENTS.map( a => a.id );
	achievements.sort( ( a, b ) => order.indexOf( a.id ) - order.indexOf( b.id ) );
	const mine = new Set( achievements.map( a => a.id ) );
	counts.km = Math.round( counts.km * 1000 ) / 1000;
	return json( { achievements, counts, rides: Object.keys( RIDE_FEATS ).filter( ride => mine.has( RIDE_FEATS[ ride ].feat ) ) } );

}

// GET /api/admin/achievements, to an account in ADMIN_EMAILS (adminAccount: 401, 403, 429 past
// ADMIN_LOOKS): { players, earners, achievements: [ { id, name, goal, checked, ride, players } ] }:
// how many players there are, how many have any achievement, and for each in the game's order, its
// words, whether the Worker checks its count, the ride it unlocks and how many players have it.
// Nothing of who.
export async function adminAchievements( context ) {

	await adminAccount( context );
	const db = database( context.env );
	const [ counts, totals ] = await db.batch( [
		db.prepare( 'SELECT achievement, COUNT( * ) AS n FROM achievements GROUP BY achievement' ),
		db.prepare( 'SELECT ( SELECT COUNT( * ) FROM players ) AS players, ( SELECT COUNT( DISTINCT player_id ) FROM achievements ) AS earners' ),
	] );
	const byId = new Map( counts.results.map( row => [ row.achievement, row.n ] ) );
	const { players, earners } = totals.results[ 0 ];
	return json( {
		players, earners,
		achievements: ACHIEVEMENTS.map( a => {

			const ride = Object.keys( RIDE_FEATS ).find( id => RIDE_FEATS[ id ].feat === a.id );
			return { id: a.id, name: a.name, goal: a.goal, checked: COUNTS[ a.count ] === 'checked', ride: ride ? WORKS.find( work => work.id === ride ).name : null, players: byId.get( a.id ) ?? 0 };

		} ),
	} );

}
