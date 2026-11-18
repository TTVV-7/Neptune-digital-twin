import { HttpError, isObject, json, readJson, sha256Hex } from '../http.js';
import {
	ACHIEVEMENTS, ACHIEVEMENT_IDS, CHALLENGES_MOST, COUNTS, PLACINGS, RIDE_FEATS, TALLY_DAY,
	countsOf, readTallies, reached, rideFeat,
} from '../../src/drive-app/achievement-rules.js';
import { WORKS } from '../../src/drive-app/works.js';
import { adminAccount } from './admin.js';
import { dayOf } from '../../src/drive-app/levels.js';
import { keyedHex, lookKey } from './challenges.js';
import { VISITOR_PREFIX } from './dropins.js';
import { credentials, database, takeTurn } from './players.js';
import { setting } from './settings.js';

// Achievements (docs/world-drive.md, "Achievements and rewards"; the list and its rules are
// src/drive-app/achievement-rules.js, which the page shares): what a player has earned, kept in D1
// (`achievements`, one row an achievement a player, with when), and the construction rides those
// unlock, checked wherever a ride shows to others. Each is earned where its count changes:
//
// - the trusted counts (km, drives on the Moon, Mars, Vesta and Ceres, Garage changes, rides tried)
//   and the days in a row with the player's progress reports (progress.js), kept in
//   players.tallies, a day's worth at most each;
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
// A visitor's asks for their achievements a day (ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY), by the
// address's /48: the grid's, as it opens, so a few a visit. At about 410 rows an ask at most (21
// players' rows, their achievements as featRows reads them, their challenge times to 50: measured
// with D1's rows_read in test-drive-levels.mjs), a day's are 82,000 rows: under 2 % of the Free
// plan's 5 million.
const LOOKS_DAILY = 200;

// SQL for the ids of the player whose id is `id` (a parameter, '?1') and of their account's other
// players, PLAYERS_MOST at most: one look by key, and one in players_by_account that stops there,
// so an account with ever more players (links are cheap) costs no more rows to read.
export function playersOf( id ) {

	return `SELECT ${ id } UNION SELECT * FROM ( SELECT q.id FROM players q WHERE q.account_id = ( SELECT r.account_id FROM players r WHERE r.id = ${ id } ) LIMIT ${ PLAYERS_MOST } )`;

}

// SQL for the achievement rows (achievement, earned_at) of the player whose id is `id` and their
// account's players (playersOf): the player's own first, all of them (ACHIEVEMENTS' length at
// most), then the others' up to READ_MOST, read in the key's order and stopping there, so an ask
// reads at most about READ_MOST + 50 rows whatever the account. (An account whose other players
// have more than READ_MOST rows between them has them all several times over: what's past it is
// almost always already among them.)
export function featRows( id ) {

	return `SELECT achievement, earned_at FROM achievements WHERE player_id = ${ id }
		UNION ALL SELECT * FROM ( SELECT achievement, earned_at FROM achievements WHERE player_id IN ( ${ playersOf( id ) } ) AND player_id <> ${ id } LIMIT ${ READ_MOST } )`;

}

// SQL for the achievements (their ids, comma-separated, or NULL for none) the player in row `p` has
// with their account's players.
export function featsOf( p ) {

	return `( SELECT group_concat( DISTINCT achievement ) FROM ( ${ featRows( `${ p }.id` ) } ) )`;

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

// The parties a player's row remembers having counted (players.party_marks): the last PARTY_MARKS.
const PARTY_MARKS = 10;

// A party's mark in a player's row: a short HMAC of the player's id with the party's code, under the
// challenges' key derived from the Worker's secret (challenges.js's keyedHex), so the same party is
// known again for that player, and two players' marks for one party never match. Keyed, not a plain
// hash: party codes are few enough (32^7) that anyone with a copy of the table could otherwise try
// them all for each player and find who drove together; without the secret they can't.
export async function partyMark( env, id, code ) {

	return ( await keyedHex( env, `party:${ id }:${ code }` ) ).slice( 0, 16 );

}

// A party's room saw player `id` in party `code` with another player, or someone from another
// address (live.js's partied): counted once a party (a page reconnecting to the same party, or the
// player going back to one of their last PARTY_MARKS, isn't counted again), with the party
// achievements that reaches.
export async function creditParty( env, id, code, now ) {

	const db = database( env );
	const mark = await partyMark( env, id, code );
	const tiers = ACHIEVEMENTS.filter( a => a.count === 'parties' ).map( a => ( { id: a.id, n: a.target } ) );
	await db.batch( [
		db.prepare( `UPDATE players SET parties = parties + 1, party_marks = (
				SELECT json_group_array( value ) FROM ( SELECT ?2 AS value UNION ALL SELECT * FROM ( SELECT value FROM json_each( players.party_marks ) LIMIT ${ PARTY_MARKS - 1 } ) )
			) WHERE id = ?1 AND NOT EXISTS ( SELECT 1 FROM json_each( players.party_marks ) WHERE value = ?2 )` ).bind( id, mark ),
		db.prepare( `INSERT INTO achievements ( player_id, achievement, earned_at ) SELECT ?1, json_extract( value, '$.id' ), ?2 FROM json_each( ?3 )
			WHERE changes() = 1 AND json_extract( value, '$.n' ) <= ( SELECT parties FROM players WHERE id = ?1 ) ON CONFLICT DO NOTHING` ).bind( id, now, JSON.stringify( tiers ) ),
	] );

}

// Whether player `id` (or their account) may drive `vehicle` where others see it: a ride an
// achievement unlocks only with it, one look by key for that achievement (a few rows alone, about 60
// at most for an account, measured); for any other ride, true and nothing is read.
export async function hasRide( db, id, vehicle ) {

	const feat = rideFeat( vehicle );
	if ( ! feat ) return true;
	return !! await db.prepare( `SELECT 1 AS ok FROM achievements a WHERE a.achievement = ?2 AND a.player_id IN ( ${ playersOf( '?1' ) } ) LIMIT 1` ).bind( id, feat ).first();

}

// Every construction ride's achievement player `id` (or their account) has, as { feat: true or
// false } for each of RIDE_FEATS': one look by key for all of them at once, for a room (live.js),
// which asks once a connection whichever rides the page picks after.
export async function unlockedRides( db, id ) {

	const { results } = await db.prepare( ridesSql( '?1' ) ).bind( id ).all();
	const have = new Set( results.map( row => row.achievement ) );
	return Object.fromEntries( RIDE_FEAT_IDS.map( feat => [ feat, have.has( feat ) ] ) );

}

// The construction rides' achievements, each once.
const RIDE_FEAT_IDS = [ ...new Set( Object.values( RIDE_FEATS ).map( ride => ride.feat ) ) ];

// SQL for which of RIDE_FEAT_IDS the player whose id is `id` (a parameter, '?1') or their account
// has (unlockedRides): a look by key for each, for each of playersOf's players (14 rows read alone,
// 281 measured for an account of 20 players or more).
export function ridesSql( id ) {

	return `SELECT DISTINCT a.achievement FROM achievements a
		WHERE a.achievement IN ( ${ RIDE_FEAT_IDS.map( feat => `'${ feat }'` ).join( ', ' ) } ) AND a.player_id IN ( ${ playersOf( id ) } )`;

}

// hasRide, as a 403 (reason: 'ride', with what unlocks it) if not.
export async function checkRide( db, id, vehicle ) {

	if ( ! await hasRide( db, id, vehicle ) ) throw new HttpError( 403, 'That ride isn\'t unlocked yet', { reason: 'ride', unlock: RIDE_FEATS[ vehicle ].unlock } );

}

// POST /api/achievements { id, secret }: the player's achievements and the counts toward them, with
// their account's (the most any of its players has of each count): { achievements: [ { id, at } ],
// counts: { km, moon, mars, vesta, ceres, looks, rides, streak, parties, challenges }, own: { km,
// moon, mars, vesta, ceres, looks, rides } (this player's own trusted counts, which their reports
// add to), left: { km, moon, mars, vesta, ceres, looks, rides } (what more of each trusted count
// today will take from this player), rides:
// [ the construction rides unlocked ] }. Any challenges-finished achievement the times have reached
// and that isn't written yet (times from before achievements) is written as it's asked for. Held to
// ACHIEVEMENT_LOOKS a minute (Cloudflare's rate limiter, by the challenges' keyed hash of the
// address and the day) and ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY a day (DriveLimits, by the address's
// /48).
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
		db.prepare( `SELECT id, tallies, parties FROM players WHERE id IN ( ${ playersOf( '?1' ) } ) LIMIT ${ PLAYERS_MOST + 1 }` ).bind( id ),
		db.prepare( `SELECT achievement, MIN( earned_at ) AS at FROM ( ${ featRows( '?1' ) } ) GROUP BY achievement` ).bind( id ),
		db.prepare( `SELECT COUNT( * ) AS n FROM ( SELECT 1 FROM challenge_times WHERE player_id IN ( ${ playersOf( '?1' ) } ) LIMIT ${ CHALLENGES_MOST } )` ).bind( id ),
	] );
	if ( ! me.results.length ) throw new HttpError( 403, 'Forbidden', { reason: 'player' } );

	// The account's best of each count.
	const counts = { km: 0, moon: 0, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: 0, streak: 0, parties: 0, challenges: finished.results[ 0 ]?.n ?? 0 };
	for ( const row of players.results ) {

		const mine = countsOf( readTallies( row.tallies ), { parties: row.parties } );
		for ( const count of [ 'km', 'moon', 'mars', 'vesta', 'ceres', 'looks', 'rides', 'streak', 'parties' ] ) counts[ count ] = Math.max( counts[ count ], mine[ count ] );

	}

	const achievements = earned.results.filter( row => ACHIEVEMENT_IDS.has( row.achievement ) ).map( row => ( { id: row.achievement, at: row.at } ) );
	const have = new Set( achievements.map( a => a.id ) );
	const owed = reached( { challenges: counts.challenges } ).filter( a => ! have.has( a ) );
	if ( owed.length ) {

		await earnQuery( db, id, owed, now ).run();
		for ( const feat of owed ) achievements.push( { id: feat, at: now } );

	}

	// This player's own trusted counts, and what's left of today's TALLY_DAY for them: the grid adds
	// to their own no more of the page's counts than the Worker will take, and shows the more of that
	// and the account's best (so a count on a linked account never runs ahead and falls back).
	const own = readTallies( players.results.find( row => row.id === id )?.tallies );
	const taken = own.day === dayOf( now ) ? own.today : {};
	const left = Object.fromEntries( Object.keys( TALLY_DAY ).map( count => [ count, Math.max( 0, TALLY_DAY[ count ] - ( taken[ count ] ?? 0 ) ) ] ) );

	const order = ACHIEVEMENTS.map( a => a.id );
	achievements.sort( ( a, b ) => order.indexOf( a.id ) - order.indexOf( b.id ) );
	const mine = new Set( achievements.map( a => a.id ) );
	counts.km = Math.round( counts.km * 1000 ) / 1000;
	const ownCounts = { km: Math.round( own.km * 1000 ) / 1000, moon: own.moon, mars: own.mars, vesta: own.vesta, ceres: own.ceres, looks: own.looks, rides: own.rides.length };
	return json( { achievements, counts, own: ownCounts, left, rides: Object.keys( RIDE_FEATS ).filter( ride => mine.has( RIDE_FEATS[ ride ].feat ) ) } );

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
