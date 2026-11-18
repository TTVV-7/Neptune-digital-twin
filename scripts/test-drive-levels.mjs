// npm run test:drive-levels: World Drive's levels (src/drive-app/levels.js, worker/drive/progress.js,
// docs/world-drive.md). The curve as a simulated regular climbs it, and the unlock track as it's
// written (every level from 2 to 50 gives something, six cars come with it and the pass's own rides
// never do, a level's car locked until then unless with the pass, about half the pass's looks are
// on it, the level-only rewards never come with the pass, every look on it is one the Garage has);
// then the Worker under `wrangler dev` on this machine, with a throwaway D1
// database: reports of what was driven and the XP they earn, every cap (too much for the time since
// the last report, a report sent again, at most five minutes' worth), a forged, changed, expired or
// someone else's visit, the wrong secret, reports the page couldn't send, areas and spots only once
// (and those over the cap taken by the next report, and two reports at once), the day's bonus once a
// UTC day and its streak, a supporter's XP ×1.5 (SUPPORTER_EMAILS and an account signed in with test
// keys standing in for Google's, and the player linked to it), an account showing its best player
// (never its players added up), trick XP in reports, what was driven before a nickname claimed with
// the first report (an hour of it however old the visit, with the days' bonuses), a report sent
// again counted once, the title check, the leaderboard's rows, the cap on discoveries and
// Cloudflare's rate limiter (no Durable Object asked). Visit tokens are made here with Turnstile's
// documented test secret, as /api/visit makes them.
//
// TEST_DRIVE_LEVELS_PORT picks the Worker's port (9200).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { CLIENT_ID, makeKey, makeToken, serveKeys, startWorker } from './worker-harness.mjs';
import { DRIVE_CARS, PASS_RIDES } from '../src/drive-app/catalog.js';
import {
	CAPS, CLAIM_DAYS, DISCOVERIES_MAX, LEVEL_MAX, LEVEL_XP, REWARDS, RIDES, SUPPORTER_XP, TITLES, TRICK, XP,
	areaOf, badgeOf, capReport, checkReport, dailyXp, dayBefore, dayOf, drivingXp, levelOf, nextReward, progressOf, rewardsAt, rewardsBetween, rideLevel, rideLocked, rideUnlock, titleOf, trickXp, unlockLevel,
} from '../src/drive-app/levels.js';
import { CARS } from '../src/drive-app/cars.js';
import { BOOSTS } from '../src/drive-app/boosts.js';
import { DECALS, FINISHES, FLAMES, GLOWS, HORNS, RIMS, SMOKES, SWATCHES, TRAILS, isLocked, lookFor, saveLook, unlockOf } from '../src/drive-app/paint.js';
import { SPOTS } from '../src/drive-app/places.js';
import { makeVisit } from '../worker/drive/visits.js';
import { featList, featRows, featsOf, playersOf, ridesSql } from '../worker/drive/achievements.js';
import {
	ACHIEVEMENTS, CLAIM_TALLY, COUNTS, PLACINGS, RIDE_FEATS, TALLY_DAY,
	addTallies, checkTallies, claimTallies, crossed, countsOf, hasTallies, mergeTallies, progressLine, readTallies, rideFeat,
} from '../src/drive-app/achievement-rules.js';
import { LIBRARY_VEHICLES, WORKS_RIDES } from '../src/drive-app/catalog.js';

const PORT = Number( process.env.TEST_DRIVE_LEVELS_PORT ) || 9200;
// Turnstile's documented test secret, which always passes: the Worker's here.
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// 1 November 2026, noon UTC: the tests' clock (TEST_CLOCK), moved on as they need.
const NOON = Date.UTC( 2026, 10, 1, 12 );
const KART = { id: 'go-kart', colour: 'blaze' };
const pick = ( { colour, boost, rim, trail } ) => ( { colour, boost, rim, trail } );
// The Garage's lists, by part (paint.js, boosts.js).
const LISTS = { colour: SWATCHES, finish: FINISHES, decal: DECALS, rim: RIMS, glow: GLOWS, boost: BOOSTS, flame: FLAMES, trail: TRAILS, horn: HORNS };
const PLACES = [ [ 46.5725, 8.4153 ], [ 49.30653, - 123.04957 ], [ 37.8199, - 122.4783 ], [ 40.75765, - 73.98577 ], [ 43.73658, 7.42144 ], [ 35.6595, 139.7005 ], [ - 33.8523, 151.2108 ] ];
const AREAS = PLACES.map( ( [ lat, lon ] ) => areaOf( lat, lon ) );

// A regular's play, as the Worker counts it: 30 minutes a day at about 72 km/h on average (1.2 km a
// minute, with its stops and crashes), 4 s of air, a drift boost and half a pad a minute, a
// 10,000-point trick run every 5 minutes; the day's bonus each day (days in a row), a start spot each
// of the first 12 days, and two new areas a day for the first 10, then one. The minutes of play to
// reach each of `levels`.
function simulate( levels, { minutes = 30, perMinute = { km: 1.2, air: 4, drifts: 1, pads: 0.5, together: 0 }, runEvery = 5, runScore = 10000 } = {} ) {

	const reached = {};
	let xp = 0;
	let played = 0;
	for ( let day = 1; Object.keys( reached ).length < levels.length; day ++ ) {

		for ( let m = 0; m < minutes; m ++ ) {

			played ++;
			xp += drivingXp( perMinute );
			if ( m === 0 ) xp += dailyXp( day );
			if ( m === 1 && day <= 12 ) xp += XP.spot;
			if ( m === 2 || ( m === 12 && day <= 10 ) ) xp += XP.area;
			if ( ( m + 1 ) % runEvery === 0 ) xp += trickXp( runScore );
			for ( const level of levels ) if ( ! reached[ level ] && xp >= LEVEL_XP[ level ] ) reached[ level ] = played;

		}

	}

	return reached;

}

// --- the curve and the track, as written ---------------------------------------------------------

describe( 'Levels: the curve and the unlock track', () => {

	test( 'the curve: 50 levels, quick at first, a long way to the top', () => {

		assert.equal( LEVEL_XP.length, LEVEL_MAX + 1 );
		assert.equal( LEVEL_XP[ 1 ], 0 );
		for ( let n = 2; n <= LEVEL_MAX; n ++ ) {

			assert.ok( LEVEL_XP[ n ] > LEVEL_XP[ n - 1 ], `level ${ n }` );
			// Each level takes longer than the last.
			if ( n > 2 ) assert.ok( LEVEL_XP[ n ] - LEVEL_XP[ n - 1 ] >= LEVEL_XP[ n - 1 ] - LEVEL_XP[ n - 2 ], `level ${ n } is quicker than ${ n - 1 }` );

		}

		// A regular (simulate): level 2 in the first few minutes, 5 in a first session, 10 in a few,
		// 30 for regulars and 50 a long goal. Driving earns about 46 XP a minute of it, tricks 10.
		assert.ok( LEVEL_XP[ 2 ] <= XP.daily + XP.area, 'level 2 takes more than the first drive\'s bonuses' );
		const minutes = simulate( [ 2, 5, 10, 30, 50 ] );
		console.log( `    a regular: ${ Object.entries( minutes ).map( ( [ level, m ] ) => `level ${ level } in ${ m < 120 ? `${ m } min` : `${ ( m / 60 ).toFixed( 1 ) } h` }` ).join( ', ' ) }` );
		assert.ok( minutes[ 2 ] <= 5, `level 2 takes ${ minutes[ 2 ] } minutes` );
		assert.ok( minutes[ 5 ] >= 10 && minutes[ 5 ] <= 30, `level 5 takes ${ minutes[ 5 ] } minutes` );
		assert.ok( minutes[ 10 ] > 60 && minutes[ 10 ] < 120, `level 10 takes ${ minutes[ 10 ] } minutes` );
		assert.ok( minutes[ 30 ] / 60 > 15 && minutes[ 30 ] / 60 < 30, `level 30 takes ${ minutes[ 30 ] / 60 } hours` );
		assert.ok( minutes[ 50 ] / 60 > 70 && minutes[ 50 ] / 60 < 110, `level 50 takes ${ minutes[ 50 ] / 60 } hours` );
		// Driving is worth driving: a kart flat out (110 km/h) earns over 35 XP a minute, and a new
		// area (a km's drive, and the globe between) no more than a few minutes of that.
		assert.ok( 110 / 60 * XP.km > 35, 'a kart flat out earns too little' );
		assert.ok( XP.area <= 3 * 110 / 60 * XP.km, 'a new area is worth too much driving' );
		assert.equal( levelOf( 0 ), 1 );
		assert.equal( levelOf( LEVEL_XP[ 7 ] - 1 ), 6 );
		assert.equal( levelOf( LEVEL_XP[ 7 ] ), 7 );
		assert.equal( levelOf( 1e12 ), LEVEL_MAX );
		assert.equal( levelOf( NaN ), 1 );
		assert.deepEqual( progressOf( LEVEL_XP[ 3 ] + 100 ), { level: 3, xp: LEVEL_XP[ 3 ] + 100, floor: LEVEL_XP[ 3 ], next: LEVEL_XP[ 4 ], into: 100, span: LEVEL_XP[ 4 ] - LEVEL_XP[ 3 ], fraction: 100 / ( LEVEL_XP[ 4 ] - LEVEL_XP[ 3 ] ) } );
		assert.equal( progressOf( 1e9 ).next, null );
		assert.equal( progressOf( 1e9 ).fraction, 1 );

	} );

	test( 'every level from 2 to 50 gives something; titles, badges and the level-only colours', () => {

		for ( let n = 2; n <= LEVEL_MAX; n ++ ) assert.ok( rewardsAt( n ).length > 0, `level ${ n } gives nothing` );
		assert.deepEqual( rewardsAt( 1 ).map( r => r.id ), [ 'rookie', 'steel' ] );
		// Titles: Rookie at 1, each unique, and a Legend at the top.
		assert.equal( TITLES[ 0 ].name, 'Rookie' );
		assert.equal( TITLES.at( - 1 ).name, 'Legend' );
		assert.equal( TITLES.at( - 1 ).level, 50 );
		assert.equal( new Set( TITLES.map( t => t.id ) ).size, TITLES.length );
		assert.equal( new Set( TITLES.map( t => t.name ) ).size, TITLES.length );
		for ( const name of [ 'Drifter', 'Stunt Ace', 'Globetrotter', 'Road Warrior' ] ) assert.ok( TITLES.some( t => t.name === name ), name );
		// The badge's frame changes at 10, 20, 30, 40 and 50.
		assert.deepEqual( REWARDS.filter( r => r.kind === 'badge' ).map( r => r.level ), [ 1, 10, 20, 30, 40, 50 ] );
		assert.equal( badgeOf( 9 ).id, 'steel' );
		assert.equal( badgeOf( 10 ).id, 'bronze' );
		assert.equal( badgeOf( 49 ).id, 'platinum' );
		assert.equal( badgeOf( 50 ).id, 'legend' );
		// Four colours only levels give, in the Garage's swatches as level-only, at 25, 35, 45 and 50.
		const levelOnly = REWARDS.filter( r => r.kind === 'look' && ! r.pass );
		assert.deepEqual( levelOnly.map( r => [ r.part, r.level ] ), [ [ 'colour', 25 ], [ 'colour', 35 ], [ 'colour', 45 ], [ 'colour', 50 ] ] );
		assert.deepEqual( SWATCHES.filter( s => s.levelOnly ).map( s => s.id ), levelOnly.map( r => r.id ) );
		// A title chosen is shown only once it's yours.
		assert.equal( titleOf( 3, 'drifter' ).id, 'rookie' );
		assert.equal( titleOf( 9, '' ).id, 'drifter' );
		assert.equal( titleOf( 9, 'joyrider' ).id, 'joyrider' );
		assert.deepEqual( rewardsBetween( 1, 3 ).map( r => r.id ), [ 'sunburst', 'hearts' ] );
		// What's next: for a supporter, whose pass has the track's pass looks, the next that's new.
		assert.equal( nextReward( 1 ).id, 'sunburst' );
		assert.equal( nextReward( 1, { pro: true } ).id, 'joyrider' );
		assert.equal( nextReward( 8, { pro: true } ).id, 'bronze' );
		assert.equal( nextReward( 50, { pro: true } ), null );
		// A level's car is next like anything else, and a supporter has it already.
		assert.equal( nextReward( 4 ).id, 'golf-cart' );
		assert.equal( nextReward( 4, { pro: true } ).id, 'drifter' );

	} );

	test( 'about half the pass\'s looks are on the track, by level 49; six cars are, and the pass\'s own rides never', () => {

		// Every look on the track is a choice the Garage has.
		for ( const reward of REWARDS.filter( r => r.kind === 'look' ) ) assert.ok( LISTS[ reward.part ]?.some( choice => choice.id === reward.id ), `${ reward.part } ${ reward.id }` );
		// The pass's looks: everything that isn't free or level-only.
		const passLooks = Object.entries( LISTS ).flatMap( ( [ part, list ] ) => list.filter( choice => ! choice.free && ! choice.levelOnly ).map( choice => `${ part }:${ choice.id }` ) );
		const onTrack = REWARDS.filter( r => r.kind === 'look' && r.pass );
		const share = onTrack.length / passLooks.length;
		console.log( `    ${ onTrack.length } of the pass's ${ passLooks.length } looks on the track (${ Math.round( share * 100 ) } %)` );
		assert.ok( share >= 0.4 && share <= 0.6, `${ share }` );
		assert.ok( onTrack.every( r => r.level >= 2 && r.level <= 49 ) );
		for ( const reward of onTrack ) assert.ok( passLooks.includes( `${ reward.part }:${ reward.id }` ), reward.id );
		// The showiest stay the pass's alone.
		for ( const [ part, id ] of [ [ 'boost', 'lightning' ], [ 'boost', 'fireworks' ], [ 'boost', 'comet' ], [ 'boost', 'galaxy' ], [ 'boost', 'laser' ], [ 'trail', 'ribbon' ], [ 'trail', 'neon' ], [ 'flame', 'rainbow' ], [ 'rim', 'gold' ], [ 'finish', 'metallic' ], [ 'finish', 'chrome' ], [ 'finish', 'shift' ], [ 'glow', 'rainbow' ] ] ) assert.equal( unlockLevel( part, id ), null, id );
		// The Garage's later looks on the track (the underglow, horns, more paint, finishes, decals and
		// rims), each where the track had only a title or a badge, and the only look there.
		for ( const [ level, part, id ] of [
			[ 10, 'glow', 'blue' ], [ 17, 'colour', 'sky' ], [ 20, 'decal', 'bolts' ], [ 24, 'rim', 'black' ], [ 29, 'finish', 'satin' ], [ 32, 'horn', 'air' ], [ 36, 'colour', 'candy' ],
			[ 38, 'glow', 'green' ], [ 41, 'decal', 'camo' ], [ 42, 'rim', 'chrome' ], [ 44, 'colour', 'gunmetal' ], [ 46, 'finish', 'pearl' ], [ 48, 'horn', 'fanfare' ], [ 49, 'glow', 'purple' ],
		] ) {

			assert.equal( unlockLevel( part, id ), level, id );
			assert.equal( rewardsAt( level ).filter( r => r.kind === 'look' ).length, 1, id );
			assert.ok( rewardsAt( level ).some( r => r.kind === 'title' || r.kind === 'badge' ), id );

		}
		// Six cars, from the golf cart at 5 to the formula racer at 40, each a car World Drive has and
		// the leaderboard takes, with the pass too; never the pass's own (its first nine rides and
		// its showpieces), and nothing else named after a ride.
		assert.deepEqual( RIDES.map( r => [ r.level, r.id ] ), [ [ 5, 'golf-cart' ], [ 8, 'tuk-tuk' ], [ 15, 'ice-cream-van' ], [ 22, 'lawn-tractor' ], [ 30, 'retro-wedge' ], [ 40, 'formula-racer' ] ] );
		const passOnly = new Set( [ ...PASS_RIDES, ...CARS.filter( car => car.pro ).map( car => car.id ) ] );
		const rides = new Set( [ ...PASS_RIDES, ...DRIVE_CARS ] );
		for ( const reward of REWARDS ) {

			assert.ok( [ 'look', 'ride', 'title', 'badge' ].includes( reward.kind ), reward.kind );
			if ( reward.kind !== 'ride' ) assert.ok( ! rides.has( reward.id ), reward.id );
			else {

				assert.ok( DRIVE_CARS.includes( reward.id ) && ! passOnly.has( reward.id ), reward.id );
				assert.equal( CARS.find( car => car.id === reward.id ).name, reward.name );
				assert.equal( reward.pass, true, reward.id );

			}

		}

		// Spread out: the first in a first session (level 5), then none within three levels of the last.
		const gaps = RIDES.map( ( r, i ) => r.level - ( RIDES[ i - 1 ]?.level ?? 0 ) );
		assert.ok( RIDES[ 0 ].level === 5 && gaps.every( gap => gap >= 3 ), JSON.stringify( gaps ) );

	} );

	test( 'a level\'s car: locked until that level unless with the pass; the pass\'s own whatever the level; the free ones never', () => {

		const tuk = CARS.find( car => car.id === 'tuk-tuk' );
		assert.equal( rideLevel( 'tuk-tuk' ), 8 );
		assert.deepEqual( rideUnlock( tuk ), { level: 8, pass: true } );
		assert.equal( rideLocked( tuk, { level: 7 } ), true );
		assert.equal( rideLocked( tuk, { level: 8 } ), false );
		assert.equal( rideLocked( tuk, { level: 1, pro: true } ), false );
		// The pass's showpieces and first cars: only with it.
		for ( const car of CARS.filter( c => c.pro ) ) {

			assert.equal( rideLevel( car.id ), null, car.id );
			assert.deepEqual( rideUnlock( car ), { level: null, pass: true }, car.id );
			assert.equal( rideLocked( car, { level: 50 } ), true, car.id );
			assert.equal( rideLocked( car, { pro: true } ), false, car.id );

		}

		// Free: the kart, the pickup, the muscle car.
		for ( const id of [ 'go-kart', 'pickup-truck', 'muscle-car' ] ) {

			assert.equal( rideUnlock( { id } ), null, id );
			assert.equal( rideLocked( { id } ), false, id );

		}

		// Every level's car, at its level and the one before.
		for ( const reward of RIDES ) {

			const car = CARS.find( c => c.id === reward.id );
			assert.equal( rideLocked( car, { level: reward.level - 1 } ), true, reward.id );
			assert.equal( rideLocked( car, { level: reward.level } ), false, reward.id );

		}

	} );

	test( 'the Garage\'s locks: the pass unlocks its looks at once, levels some of them, and only levels the level-only ones', () => {

		// A track look: either.
		assert.equal( isLocked( KART, 'colour', 'sunburst', { level: 1 } ), true );
		assert.equal( isLocked( KART, 'colour', 'sunburst', { level: 2 } ), false );
		assert.equal( isLocked( KART, 'colour', 'sunburst', { pro: true, level: 1 } ), false );
		assert.deepEqual( unlockOf( KART, 'boost', 'plasma' ), { level: 7, pass: true } );
		// The pass's alone: whatever the level.
		assert.equal( isLocked( KART, 'boost', 'lightning', { level: 50 } ), true );
		assert.equal( isLocked( KART, 'boost', 'lightning', { pro: true } ), false );
		// Level-only: never with the pass.
		for ( const swatch of SWATCHES.filter( s => s.levelOnly ) ) {

			const level = unlockLevel( 'colour', swatch.id );
			assert.equal( isLocked( KART, 'colour', swatch.id, { pro: true, level: level - 1 } ), true, swatch.id );
			assert.equal( isLocked( KART, 'colour', swatch.id, { pro: false, level } ), false, swatch.id );
			assert.deepEqual( unlockOf( KART, 'colour', swatch.id ), { level, pass: false } );

		}

		// The look driven with: what's locked put back to the ride's own.
		const saved = { colour: 'copper', boost: 'plasma', rim: 'white', trail: 'smoke' };
		saveLook( KART, saved );
		assert.deepEqual( pick( lookFor( KART, { level: 1 } ) ), { colour: 'blaze', boost: 'classic', rim: 'silver', trail: 'none' } );
		assert.deepEqual( pick( lookFor( KART, { level: 7 } ) ), { colour: 'blaze', boost: 'plasma', rim: 'white', trail: 'none' } );
		assert.deepEqual( pick( lookFor( KART, { pro: true, level: 1 } ) ), { colour: 'blaze', boost: 'plasma', rim: 'white', trail: 'smoke' } );
		assert.deepEqual( pick( lookFor( KART, { level: 25 } ) ), saved );
		// (true alone, as callers said it before levels, is the pass.)
		assert.deepEqual( pick( lookFor( KART, true ) ), pick( lookFor( KART, { pro: true } ) ) );
		// Free looks, and the colour a ride comes in, are never locked.
		assert.equal( isLocked( KART, 'colour', 'blaze' ), false );
		assert.equal( isLocked( { id: 'x', colour: 'violet' }, 'colour', 'violet' ), false );
		// A colour unlocked is a smoke colour too.
		assert.equal( SMOKES.some( s => s.id === 'sunburst' ), true );
		assert.equal( isLocked( KART, 'smoke', 'sunburst', { level: 2 } ), false );

	} );

	test( 'reports: what the page may send, and the caps by time', () => {

		assert.equal( checkReport( null ), null );
		assert.equal( checkReport( [] ), null );
		assert.deepEqual( checkReport( {} ), { km: 0, air: 0, drifts: 0, pads: 0, together: 0, tricks: 0, areas: [], spots: [], daily: false } );
		for ( const bad of [ { km: - 1 }, { km: '3' }, { air: Infinity }, { drifts: 1.5 }, { pads: 2.2 }, { km: 1e8 }, { areas: [ 'near:1.1#1' ] }, { areas: [ 'party:ABCDEFG' ] }, { areas: 'near:1.1' },
			{ spots: [ 'nowhere' ] }, { daily: 'yes' }, { areas: Array.from( { length: 201 }, () => AREAS[ 0 ] ) } ] ) assert.equal( checkReport( bad ), null, JSON.stringify( bad ).slice( 0, 60 ) );
		assert.deepEqual( checkReport( { areas: [ AREAS[ 0 ], AREAS[ 0 ] ], spots: [ 'furka' ] } ).areas, [ AREAS[ 0 ] ] );
		// A report's id, and a claim's days.
		assert.equal( checkReport( { id: 'a1b2c3d4e5' } ).id, 'a1b2c3d4e5' );
		assert.deepEqual( checkReport( { days: { xp: 375, streak: 3, day: '2026-11-01' } } ).days, { xp: 375, streak: 3, day: '2026-11-01' } );
		assert.deepEqual( checkReport( { days: { xp: 0, streak: 0, day: '' } } ).days, { xp: 0, streak: 0, day: '' } );
		for ( const bad of [ { id: 'short' }, { id: 'no spaces here' }, { id: 7 }, { days: 3 }, { days: { xp: - 1, streak: 1, day: '' } }, { days: { xp: 1, streak: 1.5, day: '' } }, { days: { xp: 1, streak: 1, day: 'today' } } ] ) {

			assert.equal( checkReport( bad ), null, JSON.stringify( bad ) );

		}

		// Two minutes: 15 km at most (450 km/h), 120 s of air, 80 drift boosts, 60 pads, 2 minutes
		// together, two places (spots first), 300 trick XP.
		const capped = capReport( { km: 100, air: 500, drifts: 500, pads: 500, together: 9, tricks: 1e4, areas: AREAS, spots: [ 'furka' ], daily: true }, 120 );
		assert.deepEqual( capped, { km: 15, air: 120, drifts: 80, pads: 60, together: 2, tricks: 300, spots: [ 'furka' ], areas: [ AREAS[ 0 ] ], daily: true } );
		// And no more than CAPS.rate XP a minute from all the driving together.
		assert.equal( drivingXp( capped, 120 ), 2 * CAPS.rate );
		assert.equal( drivingXp( { km: 1, air: 2, drifts: 1, pads: 1, together: 1 } ), XP.km + 2 * XP.air + XP.drift + XP.pad + XP.together );
		assert.deepEqual( [ 1, 2, 3, 5, 9 ].map( dailyXp ), [ 100, 125, 150, 200, 200 ] );
		assert.deepEqual( [ 0, 100, 10000, 1e9 ].map( trickXp ), [ 0, 5, 50, TRICK.max ] );

	} );

	test( 'reporting asks no Durable Object: Cloudflare\'s rate limiter instead', () => {

		const source = readFileSync( new URL( '../worker/drive/progress.js', import.meta.url ), 'utf8' );
		assert.doesNotMatch( source, /takeTurn|limits\.|LIMITS|\.take\(/ );
		assert.match( source, /PROGRESS_POSTS\.limit\(/ );
		const config = readFileSync( new URL( '../wrangler.drive.jsonc', import.meta.url ), 'utf8' );
		assert.match( config, /"name": "PROGRESS_POSTS", "namespace_id": "\d+", "simple": \{ "limit": 10, "period": 60 \}/ );

	} );

} );

// --- the Worker --------------------------------------------------------------------------------

describe( 'Levels: the Worker', () => {

	let server;
	let keys;
	let googleKey;
	let addresses = 0;
	const nextIp = () => `198.18.40.${ ++ addresses }`;

	before( async () => {

		googleKey = await makeKey( 'levels-test-key' );
		keys = await serveKeys( [ googleKey.jwk ] );
		server = await startWorker( {
			port: PORT,
			config: 'wrangler.drive.jsonc',
			vars: {
				GOOGLE_MAPS_API_KEY: 'test-maps-key-not-real',
				TURNSTILE_SECRET: PASS_SECRET,
				TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
				TEST_CLOCK: 'header',
				GOOGLE_CLIENT_ID: CLIENT_ID,
				GOOGLE_JWKS_URL: keys.url,
				SUPPORTER_EMAILS: 'fan@example.com',
				NAMES_PER_VISITOR_DAILY: '1000',
				ADMIN_EMAILS: 'boss@example.com',
				ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY: '3',
			},
		} );

	} );

	after( () => {

		server?.stop();
		keys?.close();

	} );

	async function call( path, { method = 'GET', body, time = NOON, ip = nextIp(), cookie } = {} ) {

		const headers = { 'X-Test-Time': String( time ), 'CF-Connecting-IP': ip };
		if ( method !== 'GET' ) Object.assign( headers, { Origin: server.base, 'Content-Type': 'application/json' } );
		if ( cookie ) headers.Cookie = cookie;
		const res = await fetch( server.base + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify( body ) } );
		const text = await res.text();
		let json = null;
		try {

			json = JSON.parse( text );

		} catch {

			// Not JSON.

		}

		return { status: res.status, headers: res.headers, text, json };

	}

	const visitAt = time => makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, time );
	let names = 0;
	// A new player, made with a visit of its own at `time`: { id, secret, name, visit, at }.
	async function player( { time = NOON } = {} ) {

		const visit = await visitAt( time );
		const name = `Driver ${ ++ names }`;
		const made = await call( '/api/player', { method: 'POST', body: { name, visit }, time } );
		assert.equal( made.status, 201, made.text );
		return { ...made.json, visit, at: time };

	}

	// A report from `who`, `after` ms after their visit began (or at `time`).
	// (ask: with feats: true, asking for every achievement the player has; ip: from that address.)
	const report = ( who, body, { time, after = 2 * MINUTE, visit = who.visit, secret = who.secret, ask = false, ip } = {} ) =>
		call( '/api/progress', { method: 'POST', body: { id: who.id, secret, visit, report: body, ...ask ? { feats: true } : {} }, time: time ?? who.at + after, ...ip ? { ip } : {} } );
	const row = who => server.d1( `SELECT xp, title, progress_at, streak_day, streak, discoveries FROM players WHERE id = '${ who.id }'` )[ 0 ];
	// A progress answer: nothing yet, with `fields`.
	const answer = ( fields = {} ) => ( { xp: 0, own: 0, level: 1, gained: 0, unlocked: [], supporter: false, title: 'rookie', chosen: '', streakDay: '', streak: 0, accepted: { areas: [], spots: [] }, earned: [], ...fields } );

	test( 'a report earns its XP, and says where the player stands', async () => {

		const ana = await player();
		// Before anything's reported: an empty report asks, and changes nothing.
		const asked = await report( ana, {}, { after: 30 * SECOND } );
		assert.equal( asked.status, 200, asked.text );
		assert.equal( asked.headers.get( 'Cache-Control' ), 'no-store' );
		assert.deepEqual( asked.json, answer() );
		assert.equal( row( ana ).progress_at, 0 );
		// 2.5 km, 10 s of air, 3 drift boosts, 4 pads, a minute with others, a new area, a spot and
		// the day's first drive.
		const first = await report( ana, { km: 2.5, air: 10, drifts: 3, pads: 4, together: 1, areas: [ AREAS[ 0 ] ], spots: [ 'furka' ], daily: true } );
		assert.equal( first.status, 200, first.text );
		const xp = 2.5 * XP.km + 10 * XP.air + 3 * XP.drift + 4 * XP.pad + XP.together + XP.area + XP.spot + XP.daily;
		assert.equal( first.json.gained, xp );
		assert.equal( first.json.xp, xp );
		assert.equal( first.json.own, xp );
		assert.deepEqual( [ first.json.streakDay, first.json.streak ], [ '2026-11-01', 1 ] );
		assert.equal( first.json.level, levelOf( xp ) );
		assert.deepEqual( first.json.unlocked.map( r => r.id ), rewardsBetween( 1, levelOf( xp ) ).map( r => r.id ) );
		assert.deepEqual( first.json.accepted, { areas: [ AREAS[ 0 ] ], spots: [ 'furka' ] } );
		assert.deepEqual( first.json.daily, { streak: 1, xp: XP.daily } );
		assert.equal( first.json.supporter, false );
		assert.deepEqual( row( ana ), { xp, title: '', progress_at: ana.at + 2 * MINUTE, streak_day: '2026-11-01', streak: 1, discoveries: 2 } );
		assert.deepEqual( server.d1( `SELECT place FROM discoveries WHERE player_id = '${ ana.id }' ORDER BY place` ).map( r => r.place ), [ AREAS[ 0 ], 'spot:furka' ].sort() );
		// Two minutes more of driving.
		const next = await report( ana, { km: 3 }, { after: 4 * MINUTE } );
		assert.equal( next.json.gained, 3 * XP.km );
		assert.equal( next.json.xp, xp + 3 * XP.km );

	} );

	test( 'every amount capped by the time since the last report, five minutes at most; none sooner than half a minute after the last', async () => {

		const bo = await player();
		// The first report claims what was driven before (below): from then on, the time since.
		assert.equal( ( await report( bo, { km: 1 }, { after: MINUTE } ) ).status, 200 );
		const at = bo.at + MINUTE;
		// A minute: no more than 7.5 km, 60 s of air, 40 drift boosts, 30 pads, a minute together.
		const minute = await report( bo, { km: 50 }, { time: at + MINUTE } );
		assert.equal( minute.json.gained, 7.5 * XP.km );
		const air = await report( bo, { km: 1, air: 200 }, { time: at + 2 * MINUTE } );
		assert.equal( air.json.gained, XP.km + 60 * XP.air );
		const drifts = await report( bo, { drifts: 500, pads: 500, together: 10 }, { time: at + 3 * MINUTE } );
		// 40 drift boosts, 30 pads and a minute together: 320 + 120 + 6, held to CAPS.rate a minute.
		assert.equal( drifts.json.gained, CAPS.rate );
		// The same report again, at once, or a second later: each would be a row written, so it's
		// turned away until CAPS.gap has passed (the page keeps it for later); asking where the
		// player stands (an empty report) isn't.
		const again = await report( bo, { km: 50, air: 200 }, { time: at + 3 * MINUTE } );
		assert.equal( again.status, 429 );
		assert.equal( again.headers.get( 'Retry-After' ), String( CAPS.gap ) );
		const soon = await report( bo, { km: 50 }, { time: at + 3 * MINUTE + SECOND } );
		assert.equal( soon.status, 429 );
		assert.equal( soon.json.retryAfter, CAPS.gap - 1 );
		assert.equal( ( await report( bo, {}, { time: at + 3 * MINUTE + SECOND } ) ).status, 200 );
		// Half a minute later, half a minute's worth.
		const half = await report( bo, { km: 50 }, { time: at + 3 * MINUTE + CAPS.gap * SECOND } );
		assert.equal( half.status, 200 );
		assert.equal( half.json.gained, CAPS.gap * 450 / 3600 * XP.km );
		// An hour after: five minutes' worth at most (37.5 km).
		const late = await report( bo, { km: 100 }, { time: at + HOUR } );
		assert.equal( late.json.gained, 37.5 * XP.km );
		assert.equal( row( bo ).xp, late.json.xp );

	} );

	test( 'what was driven before the nickname: claimed with the first report, up to an hour of it', async () => {

		const cy = await player();
		// Ten minutes into the visit (made with it): an hour's worth at most, all of this.
		const claim = await report( cy, { km: 40, air: 120, drifts: 30, pads: 25, tricks: 200, areas: AREAS.slice( 0, 3 ), spots: [ 'furka', 'monaco' ], daily: true }, { after: 10 * MINUTE } );
		assert.equal( claim.status, 200, claim.text );
		const expected = 40 * XP.km + 120 * XP.air + 30 * XP.drift + 25 * XP.pad + 200 + 3 * XP.area + 2 * XP.spot + XP.daily;
		assert.equal( claim.json.gained, expected );
		assert.deepEqual( claim.json.accepted, { areas: AREAS.slice( 0, 3 ), spots: [ 'furka', 'monaco' ] } );
		// The next report counts only the time since.
		const after = await report( cy, { km: 40 }, { after: 11 * MINUTE } );
		assert.equal( after.json.gained, 7.5 * XP.km );
		// More than an hour's worth isn't taken.
		const dee = await player();
		const big = await report( dee, { km: 1000, air: 10000, drifts: 10000 }, { after: 5 * MINUTE } );
		assert.equal( big.json.gained, 60 * CAPS.rate );
		// However old the visit: an hour, not the six hours a visit lasts. (A visit made at noon,
		// its nickname made with it nearly six hours later.)
		const late = NOON + 5 * HOUR + 50 * MINUTE;
		const visit = await visitAt( NOON );
		const made = await call( '/api/player', { method: 'POST', body: { name: `Driver ${ ++ names }`, visit }, time: late } );
		assert.equal( made.status, 201, made.text );
		const old = { ...made.json, visit, at: late };
		const most = await report( old, { km: 1e6, air: 1e6, drifts: 1e6, pads: 1e6, together: 1e6, tricks: 1e7 }, { after: 5 * MINUTE } );
		assert.equal( most.json.gained, 60 * CAPS.rate + 60 * CAPS.tricks );
		// And no more tricks than the time since the last report allows, after the claim.
		const tricks = await report( old, { tricks: 1e7 }, { after: 7 * MINUTE } );
		assert.equal( tricks.json.gained, 2 * CAPS.tricks );

	} );

	test( 'the claim brings the days\' bonuses counted before the nickname, and the streak they made', async () => {

		// Three days in a row in this browser (100, 125 and 150), the last of them today.
		const eli = await player();
		const claim = await report( eli, { km: 1, days: { xp: 375, streak: 3, day: '2026-11-01' } }, { after: 10 * MINUTE } );
		assert.equal( claim.json.gained, XP.km + 375 );
		assert.deepEqual( [ claim.json.streakDay, claim.json.streak, claim.json.daily ], [ '2026-11-01', 3, undefined ] );
		// Tomorrow's is the fourth in a row.
		const tomorrow = Date.UTC( 2026, 10, 2, 12 );
		const next = await report( eli, { km: 0.5, daily: true }, { time: tomorrow, visit: await visitAt( tomorrow - MINUTE ) } );
		assert.deepEqual( next.json.daily, { streak: 4, xp: dailyXp( 4 ) } );
		// The last of them yesterday, and today's in the claim too: the fourth.
		const fia = await player();
		const both = await report( fia, { km: 1, daily: true, days: { xp: 375, streak: 3, day: '2026-10-31' } }, { after: 10 * MINUTE } );
		assert.equal( both.json.gained, XP.km + 375 + dailyXp( 4 ) );
		assert.deepEqual( both.json.daily, { streak: 4, xp: dailyXp( 4 ) } );
		// A streak that's over (its last day before yesterday) starts again; the bonuses still count,
		// CLAIM_DAYS of the biggest at most; and only in a claim.
		const gil = await player();
		const over = await report( gil, { km: 1, daily: true, days: { xp: 1e6, streak: 30, day: '2026-10-20' } }, { after: 10 * MINUTE } );
		assert.equal( over.json.gained, XP.km + CLAIM_DAYS * dailyXp( 5 ) + XP.daily );
		assert.deepEqual( over.json.daily, { streak: 1, xp: XP.daily } );
		const again = await report( gil, { km: 1, days: { xp: 1e6, streak: 30, day: '2026-11-01' } }, { after: 12 * MINUTE } );
		assert.equal( again.json.gained, XP.km );

	} );

	test( 'a report sent again (its answer lost) is counted once', async () => {

		const ike = await player();
		const sent = { id: 'report-one-0001', km: 2, areas: [ AREAS[ 1 ] ] };
		const first = await report( ike, sent, { after: 2 * MINUTE } );
		assert.equal( first.json.gained, 2 * XP.km + XP.area );
		// The same id again, a little later or much later: nothing more, and where the player stands.
		for ( const after of [ 2 * MINUTE + 5 * SECOND, 9 * MINUTE ] ) {

			const again = await report( ike, sent, { after } );
			assert.equal( again.status, 200, again.text );
			// (Without the achievements' whole list: only an empty report asking for it has that.)
			assert.deepEqual( again.json, answer( { xp: first.json.xp, own: first.json.xp, level: first.json.level, accepted: { areas: [], spots: [] }, repeated: true } ) );

		}

		// A new id is a new report.
		const next = await report( ike, { ...sent, id: 'report-two-0002' }, { after: 10 * MINUTE } );
		assert.equal( next.json.gained, 2 * XP.km );
		assert.equal( row( ike ).xp, first.json.xp + 2 * XP.km );

	} );

	test( 'two reports at once: one counts, and the other\'s places aren\'t kept without it', async () => {

		const jan = await player();
		await report( jan, { km: 1 }, { after: MINUTE } );
		// Five at the same moment, each with its own place: one is taken, the rest are a 409 (or a 429,
		// those that looked after it was).
		const at = jan.at + 20 * MINUTE;
		const results = await Promise.all( AREAS.slice( 0, 5 ).map( area => report( jan, { km: 1, areas: [ area ] }, { time: at } ) ) );
		assert.equal( results.filter( r => r.status === 200 ).length, 1, results.map( r => r.status ).join() );
		assert.ok( results.every( r => [ 200, 409, 429 ].includes( r.status ) ), results.map( r => r.status ).join() );
		assert.equal( row( jan ).discoveries, 1 );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM discoveries WHERE player_id = '${ jan.id }'` )[ 0 ].n, 1 );

	} );

	test( 'a forged, changed, expired or someone else\'s visit; the wrong secret; reports it can\'t take', async () => {

		const eve = await player();
		const other = await player();
		const [ v, id, expires, signature ] = eve.visit.split( '.' );
		const visits = {
			none: null,
			'not a token': 'hello',
			forged: `${ v }.${ id }.${ expires }.${ 'A'.repeat( 43 ) }`,
			changed: `${ v }.${ id }.${ Number( expires ) + 3600 }.${ signature }`,
			expired: await visitAt( NOON - 7 * HOUR ),
			'another player\'s': other.visit,
		};
		// The other player's visit is theirs once they've reported with it.
		assert.equal( ( await report( other, { km: 1 } ) ).status, 200 );
		for ( const [ what, visit ] of Object.entries( visits ) ) {

			const res = await report( eve, { km: 1 }, { visit } );
			assert.equal( res.status, 403, what );
			assert.deepEqual( res.json, { error: 'Forbidden', reason: 'visit' }, what );

		}

		const wrong = await report( eve, { km: 1 }, { secret: 'W'.repeat( 32 ) } );
		assert.equal( wrong.status, 403 );
		assert.deepEqual( wrong.json, { error: 'Forbidden', reason: 'player' } );
		const nobody = await call( '/api/progress', { method: 'POST', body: { id: 'N'.repeat( 16 ), secret: 'S'.repeat( 32 ), visit: eve.visit, report: {} } } );
		assert.equal( nobody.status, 403 );
		for ( const body of [ { km: - 5 }, { km: 'lots' }, { drifts: 0.5 }, { areas: [ 'near:9999.1' ] }, { spots: [ 'atlantis' ] }, { daily: 1 }, 'nothing' ] ) {

			const res = await report( eve, body );
			assert.equal( res.status, 400, JSON.stringify( body ) );

		}

		for ( const body of [ { id: eve.id, secret: eve.secret, visit: eve.visit }, { id: eve.id, visit: eve.visit, report: {} }, { id: 'short', secret: eve.secret, visit: eve.visit, report: {} } ] ) {

			assert.equal( ( await call( '/api/progress', { method: 'POST', body } ) ).status, 400 );

		}

		// From another site, or not JSON: as every post.
		const res = await fetch( `${ server.base }/api/progress`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' } );
		assert.equal( res.status, 403 );
		assert.equal( row( eve ).xp, 0 );

	} );

	test( 'areas and spots: XP only the first time, and those over the cap taken by the next report', async () => {

		const fay = await player();
		await report( fay, {}, { after: 5 * SECOND } );
		await report( fay, { km: 0.5 }, { after: 10 * SECOND } );
		const at = fay.at + 10 * SECOND;
		// Three minutes: three places at most (spots first).
		const many = await report( fay, { areas: AREAS.slice( 0, 4 ), spots: [ 'furka' ] }, { time: at + 3 * MINUTE } );
		assert.deepEqual( many.json.accepted, { areas: AREAS.slice( 0, 2 ), spots: [ 'furka' ] } );
		assert.equal( many.json.gained, XP.spot + 2 * XP.area );
		// The rest with the next, and those known already for nothing.
		const rest = await report( fay, { areas: AREAS.slice( 0, 4 ), spots: [ 'furka' ] }, { time: at + 8 * MINUTE } );
		assert.deepEqual( rest.json.accepted, { areas: AREAS.slice( 0, 4 ), spots: [ 'furka' ] } );
		assert.equal( rest.json.gained, 2 * XP.area );
		const known = await report( fay, { areas: AREAS.slice( 0, 4 ), spots: [ 'furka' ] }, { time: at + 13 * MINUTE } );
		assert.equal( known.json.gained, 0 );
		assert.equal( row( fay ).discoveries, 5 );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM discoveries WHERE player_id = '${ fay.id }'` )[ 0 ].n, 5 );
		// No more than DISCOVERIES_MAX a player.
		server.d1( `UPDATE players SET discoveries = ${ DISCOVERIES_MAX - 1 } WHERE id = '${ fay.id }'` );
		const full = await report( fay, { areas: AREAS.slice( 4, 6 ) }, { time: at + 18 * MINUTE } );
		assert.equal( full.json.gained, XP.area );
		assert.equal( row( fay ).discoveries, DISCOVERIES_MAX );

	} );

	test( 'the day\'s bonus once a UTC day, more for days in a row, and back to the start after a day off', async () => {

		const gus = await player();
		const day = n => Date.UTC( 2026, 10, 1 + n, 12 );
		// A visit lasts six hours: each day's drive is a visit of its own.
		const at = async time => ( await report( gus, { km: 0.5, daily: true }, { time, visit: time - gus.at < 6 * HOUR ? gus.visit : await visitAt( time - MINUTE ) } ) ).json;
		const daily = ( n, minutes = 0 ) => at( day( n ) + minutes * MINUTE );
		// (The first report, ten minutes in, claims an hour's worth: half a km is all it has.)
		assert.deepEqual( ( await daily( 0, 10 ) ).daily, { streak: 1, xp: 100 } );
		assert.equal( ( await daily( 0, 20 ) ).daily, undefined, 'twice in a day' );
		assert.deepEqual( ( await daily( 1 ) ).daily, { streak: 2, xp: 125 } );
		assert.deepEqual( ( await daily( 2 ) ).daily, { streak: 3, xp: 150 } );
		// Just before midnight UTC, and just after: two days.
		assert.deepEqual( ( await at( Date.UTC( 2026, 10, 4, 23, 59 ) ) ).daily, { streak: 4, xp: 175 } );
		assert.deepEqual( ( await at( Date.UTC( 2026, 10, 5, 0, 1 ) ) ).daily, { streak: 5, xp: 200 } );
		assert.deepEqual( ( await daily( 5 ) ).daily, { streak: 6, xp: 200 } );
		// A day off: from the start.
		assert.deepEqual( ( await daily( 7 ) ).daily, { streak: 1, xp: 100 } );
		assert.equal( row( gus ).streak, 1 );

	} );

	test( 'trick XP comes with reports, every landed run whether the leaderboard takes it or not, held to the time\'s cap', async () => {

		const hal = await player();
		await report( hal, { km: 1 }, { after: MINUTE } );
		// What the runs' new points added (the page works it out: levels.js's trickXp).
		const runs = await report( hal, { tricks: trickXp( 10000 ) + trickXp( 40000 ) }, { after: 3 * MINUTE } );
		assert.equal( runs.json.gained, 150 );
		// No more than CAPS.tricks a minute since the last report.
		const most = await report( hal, { tricks: 5000 }, { after: 4 * MINUTE } );
		assert.equal( most.json.gained, CAPS.tricks );
		// A score the leaderboard takes earns no XP of its own (it came with the report).
		const scored = await call( '/api/score', {
			method: 'POST',
			body: { id: hal.id, secret: hal.secret, visit: hal.visit, score: 40000, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1.2, runSeconds: 160 },
			time: hal.at + 5 * MINUTE,
		} );
		assert.equal( scored.status, 200, scored.text );
		assert.equal( 'xp' in scored.json, false );
		assert.equal( row( hal ).xp, XP.km + 150 + CAPS.tricks );

	} );

	test( 'a supporter\'s XP counts ×1.5, by the account the player is linked to; an account shows its best player', async () => {

		const ida = await player();
		const jo = await player();
		// Signed in with an email in SUPPORTER_EMAILS, and both players linked to the account.
		const session = await call( '/api/session', { method: 'POST', body: { credential: await makeToken( googleKey, { sub: 'fan-1', email: 'fan@example.com' } ) } } );
		assert.equal( session.status, 200, session.text );
		assert.equal( session.json.supporter, true );
		const cookie = `__Host-wd_session=${ /__Host-wd_session=([\w-]{43})/.exec( session.headers.get( 'Set-Cookie' ) )[ 1 ] }`;
		// Before: as anyone, whatever the page says (there's nothing in a report for it).
		assert.equal( ( await report( ida, { km: 2, supporter: true }, { after: MINUTE } ) ).json.gained, 2 * XP.km );
		for ( const who of [ ida, jo ] ) assert.equal( ( await call( '/api/player/link', { method: 'POST', body: { id: who.id, secret: who.secret }, cookie } ) ).status, 200 );
		const boosted = await report( ida, { km: 2, air: 10 }, { after: 2 * MINUTE } );
		assert.equal( boosted.json.supporter, true );
		assert.equal( boosted.json.gained, Math.round( ( 2 * XP.km + 10 * XP.air ) * SUPPORTER_XP ) );
		assert.equal( ( await report( jo, { km: 2 }, { after: MINUTE } ) ).json.gained, 2 * XP.km * SUPPORTER_XP );
		// Jo's level is the account's: the best of its players (Ida's), Jo's own XP beside it.
		const both = await report( jo, {}, { after: 90 * SECOND } );
		assert.deepEqual( [ both.json.xp, both.json.own ], [ row( ida ).xp, row( jo ).xp ] );
		// Trick XP too.
		const trick = await report( jo, { tricks: 50 }, { after: 3 * MINUTE } );
		assert.equal( trick.json.gained, 75 );
		assert.equal( trick.json.supporter, true );

	} );

	test( 'an account\'s players don\'t add up: each claims its own hour, and the account shows the best', async () => {

		// Three new players, each claiming an hour of every cap, then linked to one account.
		const most = { km: 1e6, air: 1e6, drifts: 1e6, pads: 1e6, together: 1e6, tricks: 1e7 };
		const crew = [ await player(), await player(), await player() ];
		for ( const who of crew ) assert.equal( ( await report( who, most, { after: 5 * MINUTE } ) ).json.gained, 60 * CAPS.rate + 60 * CAPS.tricks );
		const session = await call( '/api/session', { method: 'POST', body: { credential: await makeToken( googleKey, { sub: 'crew-1', email: 'crew@example.com' } ) } } );
		const cookie = `__Host-wd_session=${ /__Host-wd_session=([\w-]{43})/.exec( session.headers.get( 'Set-Cookie' ) )[ 1 ] }`;
		for ( const who of crew ) assert.equal( ( await call( '/api/player/link', { method: 'POST', body: { id: who.id, secret: who.secret }, cookie } ) ).status, 200 );
		const one = 60 * CAPS.rate + 60 * CAPS.tricks;
		const asked = await report( crew[ 0 ], {}, { after: 6 * MINUTE } );
		assert.deepEqual( [ asked.json.xp, asked.json.level ], [ one, levelOf( one ) ] );
		// A little more for one of them: the account's is theirs, and the others' answers say so
		// without a level-up of their own.
		const more = await report( crew[ 1 ], { km: 1 }, { after: 7 * MINUTE } );
		assert.deepEqual( [ more.json.xp, more.json.own, more.json.unlocked ], [ one + XP.km, one + XP.km, [] ] );
		const other = await report( crew[ 2 ], { km: 1 }, { after: 7 * MINUTE } );
		assert.deepEqual( [ other.json.xp, other.json.own, other.json.gained ], [ one + XP.km, one + XP.km, XP.km ] );
		// The level that unlocks a title is the account's best, and a higher one is still refused.
		const title = await call( '/api/player/title', { method: 'POST', body: { id: crew[ 0 ].id, secret: crew[ 0 ].secret, title: 'legend' }, time: crew[ 0 ].at + 8 * MINUTE } );
		assert.equal( title.status, 403 );

	} );

	test( 'titles: only one that\'s yours at your level, on the leaderboard\'s rows', async () => {

		const kim = await player();
		assert.equal( ( await report( kim, { km: 1 } ) ).status, 200 );
		const title = ( id, time = kim.at + 3 * MINUTE ) => call( '/api/player/title', { method: 'POST', body: { id: kim.id, secret: kim.secret, title: id }, time } );
		const locked = await title( 'drifter' );
		assert.equal( locked.status, 403 );
		assert.deepEqual( locked.json, { error: 'That title comes at a higher level', reason: 'title' } );
		assert.equal( ( await title( 'not-a-title' ) ).status, 400 );
		assert.equal( ( await title( 42 ) ).status, 400 );
		assert.equal( ( await call( '/api/player/title', { method: 'POST', body: { id: kim.id, secret: 'W'.repeat( 32 ), title: '' } } ) ).status, 403 );
		// Level 9 (the owner's console), and Joyrider picked.
		server.d1( `UPDATE players SET xp = ${ LEVEL_XP[ 9 ] } WHERE id = '${ kim.id }'` );
		const picked = await title( 'joyrider' );
		assert.equal( picked.status, 200, picked.text );
		assert.deepEqual( picked.json, { level: 9, title: 'joyrider', chosen: 'joyrider' } );
		// A report's answer says which was picked, as well as the one shown.
		const standing = await report( kim, {}, { after: 3 * MINUTE + 10 * SECOND } );
		assert.deepEqual( [ standing.json.title, standing.json.chosen ], [ 'joyrider', 'joyrider' ] );
		assert.equal( row( kim ).title, 'joyrider' );
		// On the leaderboard with a score: the level, and the title.
		const scored = await call( '/api/score', { method: 'POST', body: { id: kim.id, secret: kim.secret, visit: kim.visit, score: 777770, tricks: 'Backflip!', place: 'Furka Pass', vehicle: 'go-kart', airTime: 1, runSeconds: 200 }, time: kim.at + 4 * MINUTE } );
		assert.equal( scored.status, 200, scored.text );
		const board = await call( `/api/leaderboard?period=all&id=${ kim.id }`, { time: kim.at + 5 * MINUTE } );
		const mine = board.json.rows.find( r => r.score === 777770 );
		assert.equal( mine.level, 9 );
		assert.equal( mine.title, 'joyrider' );
		assert.equal( board.json.me.level, 9 );
		// '' is the newest they have, and a report's answer says '' was picked.
		assert.deepEqual( ( await title( '' ) ).json, { level: 9, title: 'drifter', chosen: '' } );
		const newest = await report( kim, {}, { after: 5 * MINUTE } );
		assert.deepEqual( [ newest.json.title, newest.json.chosen ], [ 'drifter', '' ] );

	} );

	test( 'no more than 10 reports a minute from a player (Cloudflare\'s rate limiter)', async () => {

		const lou = await player();
		const statuses = [];
		for ( let i = 0; i < 12; i ++ ) statuses.push( ( await report( lou, {}, { after: ( i + 1 ) * SECOND } ) ).status );
		assert.deepEqual( statuses.slice( 0, 10 ), Array( 10 ).fill( 200 ) );
		assert.deepEqual( statuses.slice( 10 ), [ 429, 429 ] );
		const limited = await report( lou, {} );
		assert.equal( limited.headers.get( 'Retry-After' ), '60' );
		// Others carry on.
		assert.equal( ( await report( await player(), {} ) ).status, 200 );

	} );

	// --- achievements (worker/drive/achievements.js, src/drive-app/achievement-rules.js) ---

	const feats = who => server.d1( `SELECT achievement FROM achievements WHERE player_id = '${ who.id }' ORDER BY achievement` ).map( r => r.achievement );
	const tallies = who => readTallies( server.d1( `SELECT tallies FROM players WHERE id = '${ who.id }'` )[ 0 ].tallies );
	const mine = ( who, { ip = nextIp(), time = who.at + 10 * MINUTE, secret = who.secret } = {} ) => call( '/api/achievements', { method: 'POST', body: { id: who.id, secret }, ip, time } );
	const cookieOf = session => `__Host-wd_session=${ /__Host-wd_session=([\w-]{43})/.exec( session.headers.get( 'Set-Cookie' ) )[ 1 ] }`;
	const signIn = async ( sub, email ) => cookieOf( await call( '/api/session', { method: 'POST', body: { credential: await makeToken( googleKey, { sub, email } ) } } ) );
	const scoreIn = ( who, vehicle, time ) => call( '/api/score', { method: 'POST', body: { id: who.id, secret: who.secret, visit: who.visit, score: 12340, tricks: 'Backflip!', place: 'Furka Pass', vehicle, airTime: 1, runSeconds: 100 }, time } );

	test( 'achievements: the migration\'s columns and table', () => {

		const columns = table => server.d1( `SELECT name FROM pragma_table_info( '${ table }' )` ).map( r => r.name );
		for ( const column of [ 'tallies', 'parties', 'party_marks' ] ) assert.ok( columns( 'players' ).includes( column ), column );
		assert.deepEqual( columns( 'achievements' ), [ 'player_id', 'achievement', 'earned_at' ] );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM d1_migrations WHERE name = \'0009_achievements.sql\'' )[ 0 ].n, 1 );

	} );

	test( 'achievements: trusted counts come with reports, each held to a day\'s worth (and a claim\'s to CLAIM_TALLY), and are earned as they\'re reached', async () => {

		const al = await player();
		// The claim (a new nickname's first report): an hour of driving at most (450 km) for XP, and of
		// that CLAIM_TALLY's 25 km, 2 Moon drives, 5 looks and 3 rides for the achievements, whatever it
		// says: the 10 km's skid steer, not the 100 km's wheel loader.
		const rides = [ 'go-kart', ...LIBRARY_VEHICLES, ...DRIVE_CARS.slice( 0, 7 ) ];
		const first = await report( al, { km: 1e6, feats: { moon: 50, looks: 30, rides } }, { after: 5 * MINUTE } );
		assert.equal( first.status, 200, first.text );
		assert.deepEqual( first.json.earned, [ 'first-drive', 'km-10', 'moon-1', 'look-1', 'rides-3' ] );
		assert.equal( 'feats' in first.json, false );
		assert.deepEqual( feats( al ), [ 'first-drive', 'km-10', 'look-1', 'moon-1', 'rides-3' ] );
		assert.deepEqual( [ tallies( al ).km, tallies( al ).moon, tallies( al ).looks, tallies( al ).rides.length ], [ CLAIM_TALLY.km, CLAIM_TALLY.moon, CLAIM_TALLY.looks, CLAIM_TALLY.rides ] );
		assert.equal( ( await scoreIn( al, 'wheel-loader', al.at + 6 * MINUTE ) ).status, 403 );
		// The rest of the day, report by report: 37.5 km more (five minutes' worth), and of the others
		// what's left of TALLY_DAY's 10, 10 and 4.
		const more = await report( al, { km: 1e6, feats: { moon: 50, looks: 50, rides } }, { after: 30 * MINUTE } );
		assert.deepEqual( more.json.earned, [ 'moon-10' ] );
		assert.deepEqual( [ tallies( al ).km, tallies( al ).moon, tallies( al ).looks, tallies( al ).rides.length ], [ 62.5, TALLY_DAY.moon, TALLY_DAY.looks, TALLY_DAY.rides ] );
		// Near the day's 500 km (the owner's console): only what's left of the day is taken.
		server.d1( `UPDATE players SET tallies = json_set( tallies, '$.km', 900, '$.today.km', 495 ) WHERE id = '${ al.id }'` );
		const capped = await report( al, { km: 1e6 }, { after: 40 * MINUTE } );
		assert.deepEqual( [ capped.json.earned, tallies( al ).km, tallies( al ).today.km ], [ [], 905, TALLY_DAY.km ] );
		// The next UTC day takes another day's worth: so 1,000 km, 8 rides, 20 Moon drives and looks.
		server.d1( `UPDATE players SET tallies = json_set( tallies, '$.km', 999 ) WHERE id = '${ al.id }'` );
		const tomorrow = await visitAt( NOON + DAY );
		const next = await report( al, { km: 1e6, feats: { moon: 50, looks: 30, rides } }, { time: NOON + DAY + 2 * HOUR, visit: tomorrow } );
		assert.equal( next.status, 200, next.text );
		assert.deepEqual( next.json.earned, [ 'km-1000', 'rides-8' ] );
		assert.deepEqual( [ tallies( al ).km, tallies( al ).moon, tallies( al ).looks, tallies( al ).rides.length ], [ 1036.5, 20, 20, 8 ] );
		// Earned once: a report that gets there again earns nothing new.
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM achievements WHERE player_id = '${ al.id }' AND achievement = 'km-10'` )[ 0 ].n, 1 );
		// What the page can't send: a ride that isn't one, a count that isn't whole or is negative.
		for ( const bad of [ { rides: [ 'tank' ] }, { moon: 1.5 }, { looks: - 1 }, { rides: 'go-kart' }, [] ] ) assert.equal( ( await report( al, { feats: bad }, { time: NOON + DAY + 3 * HOUR, visit: tomorrow } ) ).status, 400, JSON.stringify( bad ) );
		// An empty report that asks says every one they have; one that doesn't, none (it reads only the
		// player's own row).
		const asked = await report( al, {}, { time: NOON + DAY + 3 * HOUR, visit: tomorrow, ask: true } );
		assert.deepEqual( asked.json.feats, [ 'first-drive', 'km-10', 'km-1000', 'look-1', 'moon-1', 'moon-10', 'rides-3', 'rides-8' ] );
		assert.equal( 'feats' in ( await report( al, {}, { time: NOON + DAY + 3 * HOUR, visit: tomorrow } ) ).json, false );

	} );

	test( 'achievements on Mars: Mars drives come with reports as the Moon\'s do, held to a day\'s worth and a claim\'s, and earned as they\'re reached; tallies kept from before Mars count none there', async () => {

		const ma = await player();
		// The claim: CLAIM_TALLY's 2 Mars drives (and 2 Moon drives), whatever it says.
		const first = await report( ma, { km: 1, feats: { moon: 50, mars: 50 } }, { after: 5 * MINUTE } );
		assert.equal( first.status, 200, first.text );
		assert.deepEqual( first.json.earned, [ 'first-drive', 'moon-1', 'mars-1' ] );
		assert.deepEqual( [ tallies( ma ).moon, tallies( ma ).mars ], [ CLAIM_TALLY.moon, CLAIM_TALLY.mars ] );
		// Then the rest of the day's ten, each count its own.
		const more = await report( ma, { feats: { mars: 50 } }, { after: 30 * MINUTE } );
		assert.deepEqual( more.json.earned, [ 'mars-10' ] );
		assert.deepEqual( [ tallies( ma ).moon, tallies( ma ).mars, tallies( ma ).today.mars ], [ CLAIM_TALLY.moon, TALLY_DAY.mars, TALLY_DAY.mars ] );
		assert.equal( ( await report( ma, { feats: { mars: 5 } }, { after: 40 * MINUTE } ) ).json.earned.length, 0 );
		assert.equal( tallies( ma ).mars, TALLY_DAY.mars );
		// The grid says so: the account's best, the player's own, and what's left of today's.
		const grid = ( await mine( ma, { time: ma.at + 45 * MINUTE } ) ).json;
		assert.deepEqual( [ grid.counts.mars, grid.own.mars, grid.left.mars ], [ TALLY_DAY.mars, TALLY_DAY.mars, 0 ] );
		assert.deepEqual( grid.achievements.map( a => a.id ), [ 'first-drive', 'moon-1', 'mars-1', 'mars-10' ] );
		// What the page can't send.
		for ( const bad of [ { mars: 1.5 }, { mars: - 1 }, { mars: '3' } ] ) assert.equal( ( await report( ma, { feats: bad }, { after: 50 * MINUTE } ) ).status, 400, JSON.stringify( bad ) );
		// A player whose tallies were kept before Mars (no mars in them, nor in today's): none there, and
		// the next report's Mars drives counted from none, a day's worth, the Moon's as they were.
		const old = await player();
		await report( old, { km: 1, feats: { moon: 1 } }, { after: 5 * MINUTE } );
		server.d1( `UPDATE players SET tallies = json_remove( tallies, '$.mars', '$.today.mars' ) WHERE id = '${ old.id }'` );
		assert.ok( ! server.d1( `SELECT tallies FROM players WHERE id = '${ old.id }'` )[ 0 ].tallies.includes( 'mars' ) );
		assert.deepEqual( [ tallies( old ).moon, tallies( old ).mars, tallies( old ).today.mars ], [ 1, 0, 0 ] );
		const back = await report( old, { feats: { mars: 3 } }, { after: 30 * MINUTE } );
		assert.equal( back.status, 200, back.text );
		assert.deepEqual( back.json.earned, [ 'mars-1' ] );
		assert.deepEqual( [ tallies( old ).moon, tallies( old ).mars, tallies( old ).today.mars ], [ 1, 3, 3 ] );

	} );

	test( 'achievements on Vesta and Ceres: their drives come with reports as Mars\'s do, each held to a day\'s worth and a claim\'s, and earned as they\'re reached', async () => {

		const vc = await player();
		const first = await report( vc, { km: 1, feats: { vesta: 50, ceres: 50 } }, { after: 5 * MINUTE } );
		assert.equal( first.status, 200, first.text );
		assert.deepEqual( first.json.earned, [ 'first-drive', 'vesta-1', 'ceres-1' ] );
		assert.deepEqual( [ tallies( vc ).vesta, tallies( vc ).ceres, tallies( vc ).mars ], [ CLAIM_TALLY.vesta, CLAIM_TALLY.ceres, 0 ] );
		const more = await report( vc, { feats: { vesta: 50 } }, { after: 30 * MINUTE } );
		assert.deepEqual( more.json.earned, [ 'vesta-10' ] );
		assert.deepEqual( [ tallies( vc ).vesta, tallies( vc ).today.vesta, tallies( vc ).ceres ], [ TALLY_DAY.vesta, TALLY_DAY.vesta, CLAIM_TALLY.ceres ] );
		const grid = ( await mine( vc, { time: vc.at + 45 * MINUTE } ) ).json;
		assert.deepEqual( [ grid.counts.vesta, grid.own.vesta, grid.left.vesta, grid.counts.ceres, grid.left.ceres ], [ TALLY_DAY.vesta, TALLY_DAY.vesta, 0, CLAIM_TALLY.ceres, TALLY_DAY.ceres - CLAIM_TALLY.ceres ] );
		assert.deepEqual( grid.achievements.map( a => a.id ), [ 'first-drive', 'vesta-1', 'vesta-10', 'ceres-1' ] );
		for ( const bad of [ { vesta: 1.5 }, { ceres: - 1 }, { vesta: '3' } ] ) assert.equal( ( await report( vc, { feats: bad }, { after: 50 * MINUTE } ) ).status, 400, JSON.stringify( bad ) );

	} );

	test( 'achievements: an empty report has the whole list once a visit (the page\'s ask as it starts), and is answered all the same after', async () => {

		const ash = await player();
		await report( ash, { km: 1 }, { after: 3 * MINUTE } );
		const first = await report( ash, {}, { after: 4 * MINUTE, ask: true } );
		assert.equal( first.status, 200, first.text );
		assert.deepEqual( first.json.feats, [ 'first-drive' ] );
		// The same visit asking again: the report's answer without it (nothing more read).
		const again = await report( ash, {}, { after: 5 * MINUTE, ask: true } );
		assert.deepEqual( [ again.status, 'feats' in again.json, again.json.xp > 0 ], [ 200, false, true ] );
		assert.deepEqual( server.d1( `SELECT listed FROM visits WHERE id = '${ ash.visit.split( '.' )[ 1 ] }'` ), [ { listed: 1 } ] );
		// A new visit (a page load: a robot check, and a few a day on the Earth) has it again.
		const later = await visitAt( ash.at + 6 * MINUTE );
		assert.deepEqual( ( await report( ash, {}, { after: 7 * MINUTE, ask: true, visit: later } ) ).json.feats, [ 'first-drive' ] );
		// And one that isn't the player's (another's visit) has nothing.
		const other = await player();
		assert.equal( ( await report( ash, {}, { after: 8 * MINUTE, ask: true, visit: other.visit } ) ).status, 403 );

	} );

	test( 'achievements: days in a row by the Worker\'s clock, earned on the third', async () => {

		const bea = await player();
		for ( let day = 0; day < 3; day ++ ) {

			const time = NOON + ( 10 + day ) * DAY;
			const res = await report( bea, { km: 1, daily: true }, { time, visit: await visitAt( time - MINUTE ) } );
			assert.equal( res.status, 200, res.text );
			assert.equal( res.json.streak, day + 1 );
			assert.deepEqual( res.json.earned.filter( id => id.startsWith( 'streak' ) ), day === 2 ? [ 'streak-3' ] : [] );

		}

		assert.equal( tallies( bea ).streak, 3 );
		// A day off: back to 1, the best kept.
		const time = NOON + 14 * DAY;
		assert.equal( ( await report( bea, { km: 1, daily: true }, { time, visit: await visitAt( time ) } ) ).json.streak, 1 );
		assert.deepEqual( [ tallies( bea ).streak, tallies( bea ).run ], [ 3, 1 ] );

	} );

	test( 'achievements: a claim\'s streak counts for XP, never for the days in a row (the telehandler stays locked)', async () => {

		const cal = await player();
		const today = dayOf( cal.at + 5 * MINUTE );
		// A new nickname's first report says it's been driven 10,000 days in a row, today among them.
		const claim = await report( cal, { km: 1, daily: true, days: { xp: 0, streak: 10000, day: dayBefore( today ) } }, { after: 5 * MINUTE } );
		assert.equal( claim.status, 200, claim.text );
		// The XP's streak goes on from it (as before achievements, capped by streakMax's bonus)...
		assert.equal( claim.json.streak, 10001 );
		// ...but the Worker has seen one day: no streak achievement, and no telehandler.
		assert.deepEqual( claim.json.earned.filter( id => id.startsWith( 'streak' ) ), [] );
		assert.deepEqual( [ tallies( cal ).streak, tallies( cal ).run, tallies( cal ).runDay ], [ 1, 1, today ] );
		assert.equal( ( await scoreIn( cal, 'telehandler-10k-stowed', cal.at + 6 * MINUTE ) ).status, 403 );
		assert.equal( ( await mine( cal ) ).json.counts.streak, 1 );
		// The next two days the Worker sees itself: three in a row, and it's theirs.
		for ( const day of [ 1, 2 ] ) {

			const time = cal.at + day * DAY;
			const res = await report( cal, { km: 1, daily: true }, { time, visit: await visitAt( time - MINUTE ) } );
			assert.deepEqual( res.json.earned.filter( id => id.startsWith( 'streak' ) ), day === 2 ? [ 'streak-3' ] : [], String( day ) );

		}

		assert.ok( ( await mine( cal, { time: cal.at + 2 * DAY + MINUTE } ) ).json.rides.includes( 'telehandler-10k-stowed' ) );
		// A player who reported before achievements starts from the streak they had then (their tallies
		// never written): 6 days in a row, and the 7th today.
		// (Made a week before: the Worker could have seen all six.)
		const dot = await player();
		await report( dot, { km: 1 }, { after: 5 * MINUTE } );
		server.d1( `UPDATE players SET tallies = '{}', streak = 6, streak_day = '${ dayOf( dot.at + DAY - HOUR ) }', created_at = ${ dot.at - 7 * DAY } WHERE id = '${ dot.id }'` );
		const seventh = await report( dot, { km: 1, daily: true }, { time: dot.at + 2 * DAY - HOUR, visit: await visitAt( dot.at + 2 * DAY - 2 * HOUR ) } );
		assert.equal( seventh.status, 200, seventh.text );
		assert.deepEqual( seventh.json.earned.filter( id => id.startsWith( 'streak' ) ), [ 'streak-3', 'streak-7' ] );
		// But a streak from before achievements is believed only as far as the Worker could have seen
		// it: one claimed at 10,000 days (as a nickname's claim could, taken for XP before achievements)
		// by a player made two days ago is three days at most with today's (the telehandler's, which
		// three real days earn), never the 7 or 30 days' achievements.
		const eli = await player();
		await report( eli, { km: 1 }, { after: 5 * MINUTE } );
		const day = eli.at + 2 * DAY;
		server.d1( `UPDATE players SET tallies = '{}', streak = 10000, streak_day = '${ dayOf( day - DAY ) }', created_at = ${ eli.at - 10 * MINUTE } WHERE id = '${ eli.id }'` );
		const next = await report( eli, { km: 1, daily: true }, { time: day, visit: await visitAt( day - MINUTE ) } );
		assert.equal( next.status, 200, next.text );
		assert.deepEqual( next.json.earned.filter( id => id.startsWith( 'streak' ) ), [ 'streak-3' ] );
		assert.deepEqual( [ tallies( eli ).streak, tallies( eli ).run ], [ 3, 3 ] );
		assert.deepEqual( feats( eli ).filter( id => id.startsWith( 'streak' ) ), [ 'streak-3' ] );
		// And one whose last day is long gone keeps only that capped best, with no run to add to.
		const fay = await player();
		await report( fay, { km: 1 }, { after: 5 * MINUTE } );
		server.d1( `UPDATE players SET tallies = '{}', streak = 10000, streak_day = '${ dayOf( fay.at + DAY ) }', created_at = ${ fay.at - 10 * MINUTE } WHERE id = '${ fay.id }'` );
		const later = fay.at + 5 * DAY;
		const back = await report( fay, { km: 1, daily: true }, { time: later, visit: await visitAt( later - MINUTE ) } );
		assert.equal( back.status, 200, back.text );
		assert.deepEqual( back.json.earned.filter( id => id.startsWith( 'streak' ) ), [] );
		assert.deepEqual( [ tallies( fay ).streak, tallies( fay ).run ], [ 2, 1 ] );
		const refused = await scoreIn( { ...fay, visit: await visitAt( later ) }, 'telehandler-10k-stowed', later + 2 * MINUTE );
		assert.deepEqual( [ refused.status, refused.json.reason ], [ 403, 'ride' ] );

	} );

	test( 'achievements: construction rides refused where others see them until earned, then let through', async () => {

		const cy = await player();
		// (One a SCORE_GAP apart: a score refused for its ride takes the gap as any other.)
		for ( const [ i, vehicle ] of WORKS_RIDES.entries() ) {

			const res = await scoreIn( cy, vehicle, cy.at + 6 * MINUTE + i * 11 * SECOND );
			assert.deepEqual( [ res.status, res.json.reason, res.json.unlock ], [ 403, 'ride', RIDE_FEATS[ vehicle ].unlock ], vehicle );

		}

		// 10 km driven: the skid steer is theirs.
		assert.deepEqual( ( await report( cy, { km: 10 }, { after: 5 * MINUTE } ) ).json.earned, [ 'first-drive', 'km-10' ] );
		assert.equal( ( await scoreIn( cy, 'skid-steer-loader-cad', cy.at + 10 * MINUTE ) ).status, 200 );
		assert.equal( ( await scoreIn( cy, 'wheel-loader', cy.at + 11 * MINUTE ) ).status, 403 );
		// Any other ride as before.
		assert.equal( ( await scoreIn( cy, 'go-kart', cy.at + 12 * MINUTE ) ).status, 200 );

	} );

	test( 'achievements: a score refused for its ride costs what any other does: after the score gap and the visitor\'s day, never a loop of lookups', async () => {

		const gus = await player();
		const at = gus.at + 10 * MINUTE;
		// Forty at once in a locked ride: the first is looked at (and refused for its ride), the rest
		// turned away at the gap before anything more is read, as forty in the go-kart would be.
		const statuses = [];
		for ( let i = 0; i < 40; i ++ ) statuses.push( ( await scoreIn( gus, 'wheel-loader', at + i * 100 ) ).status );
		assert.deepEqual( statuses, [ 403, ...Array( 39 ).fill( 429 ) ] );
		// After the gap, the go-kart's as ever.
		assert.equal( ( await scoreIn( gus, 'go-kart', at + 11 * SECOND ) ).status, 200 );
		assert.equal( ( await scoreIn( gus, 'go-kart', at + 12 * SECOND ) ).status, 429 );
		// The ride is checked after the gap and the visitor's daily turn (scores.js).
		const source = readFileSync( new URL( '../worker/drive/scores.js', import.meta.url ), 'utf8' );
		const post = source.slice( source.indexOf( 'export async function postScore' ) );
		assert.ok( post.indexOf( 'checkRide(' ) > post.indexOf( 'last_score_at <= ?3' ) && post.indexOf( 'checkRide(' ) > post.indexOf( 'takeTurn(' ) );

	} );

	test( 'achievements follow the player as they sign in, both ways: an account has what any of its players earned', async () => {

		const dee = await player();
		const eve = await player();
		assert.deepEqual( ( await report( dee, { km: 11 }, { after: 5 * MINUTE } ) ).json.earned, [ 'first-drive', 'km-10' ] );
		assert.deepEqual( ( await report( eve, { km: 0.1, feats: { moon: 1 } }, { after: 5 * MINUTE } ) ).json.earned, [ 'moon-1' ] );
		// Not yet linked: each has their own.
		assert.equal( ( await scoreIn( eve, 'skid-steer-loader-cad', eve.at + 10 * MINUTE ) ).status, 403 );
		const cookie = await signIn( 'both-ways-1', 'both@example.com' );
		for ( const who of [ dee, eve ] ) assert.equal( ( await call( '/api/player/link', { method: 'POST', body: { id: who.id, secret: who.secret }, cookie } ) ).status, 200 );
		// Eve (signing in on another device) has Dee's, and Dee has Eve's.
		assert.deepEqual( ( await report( eve, {}, { after: 6 * MINUTE, ask: true } ) ).json.feats, [ 'first-drive', 'km-10', 'moon-1' ] );
		assert.deepEqual( ( await mine( dee ) ).json.achievements.map( a => a.id ), [ 'first-drive', 'km-10', 'moon-1' ] );
		assert.equal( ( await scoreIn( eve, 'skid-steer-loader-cad', eve.at + 11 * MINUTE ) ).status, 200 );
		// The grid's counts are the account's best of each, and with them the player's own (which the
		// page's driving since adds to, so a count doesn't run ahead of the account's and fall back).
		const grid = ( await mine( eve ) ).json;
		assert.deepEqual( [ grid.counts.km, grid.counts.moon ], [ 11, 1 ] );
		assert.deepEqual( grid.own, { km: 0.1, moon: 1, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: 0 } );
		assert.deepEqual( ( await mine( dee ) ).json.own, { km: 11, moon: 0, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: 0 } );
		// The rows stay each player's own (the owner's counts are players').
		assert.deepEqual( feats( eve ), [ 'moon-1' ] );

	} );

	test( 'achievements: the grid\'s route checks its player and is held to its limits', async () => {

		const fay = await player();
		await report( fay, { km: 0.5 }, { after: 3 * MINUTE } );
		const ok = await mine( fay );
		assert.equal( ok.status, 200, ok.text );
		assert.equal( ok.headers.get( 'Cache-Control' ), 'no-store' );
		assert.deepEqual( ok.json.achievements.map( a => a.id ), [ 'first-drive' ] );
		assert.equal( ok.json.achievements[ 0 ].at, fay.at + 3 * MINUTE );
		assert.deepEqual( ok.json.counts, { km: 0.5, moon: 0, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: 0, streak: 0, parties: 0, challenges: 0 } );
		// What more of the trusted counts today takes from this player (the grid adds no more).
		assert.deepEqual( ok.json.left, { km: TALLY_DAY.km - 0.5, moon: TALLY_DAY.moon, mars: TALLY_DAY.mars, vesta: TALLY_DAY.vesta, ceres: TALLY_DAY.ceres, looks: TALLY_DAY.looks, rides: TALLY_DAY.rides } );
		assert.deepEqual( ok.json.rides, [] );
		assert.equal( ( await mine( fay, { secret: 'W'.repeat( 32 ) } ) ).status, 403 );
		for ( const body of [ '[]', '{}', '{"id":"short","secret":"x"}', 'not json' ] ) assert.equal( ( await call( '/api/achievements', { method: 'POST', body } ) ).status, 400, body );
		assert.equal( ( await call( '/api/achievements', { method: 'POST', body: 'x'.repeat( 2000 ) } ) ).status, 413 );
		assert.equal( ( await call( '/api/achievements' ) ).status, 405 );
		// Another site's page can't ask.
		const res = await fetch( `${ server.base }/api/achievements`, { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify( { id: fay.id, secret: fay.secret } ) } );
		assert.equal( res.status, 403 );
		// ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY (3 here) a day from one address, then till midnight.
		const ip = nextIp();
		const statuses = [];
		for ( let i = 0; i < 4; i ++ ) statuses.push( ( await mine( fay, { ip } ) ).status );
		assert.deepEqual( statuses, [ 200, 200, 200, 429 ] );
		// And ACHIEVEMENT_LOOKS, 6 a minute (Cloudflare's rate limiter), before anything's read.
		const config = readFileSync( new URL( '../wrangler.drive.jsonc', import.meta.url ), 'utf8' );
		assert.match( config, /"name": "ACHIEVEMENT_LOOKS", "namespace_id": "\d+", "simple": \{ "limit": 6, "period": 60 \}/ );
		const source = readFileSync( new URL( '../worker/drive/achievements.js', import.meta.url ), 'utf8' );
		assert.ok( source.indexOf( 'ACHIEVEMENT_LOOKS.limit(' ) < source.indexOf( 'readJson(' ) );

	} );

	test( 'achievements: the rows an ask reads stay bounded however many players an account has (D1\'s rows_read)', async () => {

		// Two players alike, 8 achievements each: one alone, one in an account (made at the console) of
		// 80 players with 8 each, as a month of links (20 a day) could make.
		const alone = await player();
		const lead = await player();
		// (The same eight as before Mars's were among the first: three of them unlock construction rides.)
		const EIGHT = [ 'first-drive', 'km-10', 'km-100', 'km-1000', 'moon-1', 'moon-10', 'moon-50', 'challenges-1' ];
		const eight = JSON.stringify( EIGHT );
		server.d1( 'INSERT INTO accounts ( id, google_sub, email, name, created_at, last_login_at ) VALUES ( 880, \'many-players\', \'many@example.com\', \'Many\', 0, 0 )' );
		server.d1( `WITH RECURSIVE n( i ) AS ( SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 79 )
			INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at, account_id ) SELECT printf( 'many-%04d-xxxxxxxxxxxxx', i ), 'Many ' || i, 'many ' || i, 'x', 0, 0, 880 FROM n` );
		server.d1( `UPDATE players SET account_id = 880 WHERE id = '${ lead.id }'` );
		server.d1( `INSERT INTO achievements ( player_id, achievement, earned_at ) SELECT p.id, a.value, 1 FROM players p, json_each( '${ eight }' ) a WHERE p.account_id = 880 OR p.id = '${ alone.id }'` );
		assert.equal( server.d1( 'SELECT COUNT(*) AS n FROM achievements a JOIN players p ON p.id = a.player_id WHERE p.account_id = 880' )[ 0 ].n, 640 );
		// What the Worker asks (achievements.js's SQL), for each: an empty report's list (featsOf), the
		// grid's (featRows), and a ride shown to others (hasRide's: scores, times, a room's hello or ride
		// changed to a construction ride).
		const asks = id => ( {
			feats: `SELECT ${ featsOf( 'p' ) } AS feats FROM players p WHERE p.id = '${ id }'`,
			grid: `SELECT achievement, MIN( earned_at ) AS at FROM ( ${ featRows( `'${ id }'` ) } ) GROUP BY achievement`,
			ride: `SELECT 1 AS ok FROM achievements a WHERE a.achievement = 'winner' AND a.player_id IN ( ${ playersOf( `'${ id }'` ) } ) LIMIT 1`,
			// (And a room's, once a connection for every construction ride: unlockedRides.)
			rides: ridesSql( `'${ id }'` ),
		} );
		const measure = async id => {

			const sqls = asks( id );
			const counted = await server.d1Read( Object.values( sqls ) );
			return Object.fromEntries( Object.keys( sqls ).map( ( ask, i ) => [ ask, counted[ i ] ] ) );

		};
		const reads = { alone: await measure( alone.id ), lead: await measure( lead.id ) };
		// 80 players more in the account, 8 achievements each: not a row more read.
		server.d1( `WITH RECURSIVE n( i ) AS ( SELECT 80 UNION ALL SELECT i + 1 FROM n WHERE i < 159 )
			INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at, account_id ) SELECT printf( 'many-%04d-xxxxxxxxxxxxx', i ), 'Many ' || i, 'many ' || i, 'x', 0, 0, 880 FROM n` );
		server.d1( `INSERT INTO achievements ( player_id, achievement, earned_at ) SELECT p.id, a.value, 1 FROM players p, json_each( '${ eight }' ) a WHERE p.account_id = 880 ON CONFLICT DO NOTHING` );
		reads.more = await measure( lead.id );
		assert.deepEqual( reads.more, reads.lead, JSON.stringify( reads ) );
		// At most READ_MOST (200) rows of the others' achievements and PLAYERS_MOST (20) players, each
		// counted again as it's grouped: a few hundred rows an ask, whatever the account (a tenth of the
		// Free plan's 5 million a day is 1,000 of them an hour). Alone, a few dozen; a ride's check, a
		// row a player.
		for ( const ask of [ 'feats', 'grid' ] ) assert.ok( reads.lead[ ask ] <= 500, `${ ask }: ${ JSON.stringify( reads ) }` );
		assert.ok( reads.lead.ride <= 70, JSON.stringify( reads ) );
		// A room's ask for all eight construction rides at once: a look by key for each of them for each
		// of the account's players (281 measured), so a connection costs no more than its first
		// construction ride's look did for five of them.
		assert.ok( reads.lead.rides <= 300, JSON.stringify( reads ) );
		for ( const ask of [ 'feats', 'grid', 'ride', 'rides' ] ) assert.ok( reads.alone[ ask ] <= 40, `${ ask } alone: ${ JSON.stringify( reads ) }` );
		// And the answers are still right: the lead has the account's (all 8, theirs included).
		assert.deepEqual( featList( server.d1( asks( lead.id ).feats )[ 0 ].feats ), [ ...EIGHT ].sort() );
		assert.equal( server.d1( asks( lead.id ).grid ).length, 8 );
		assert.deepEqual( server.d1( asks( lead.id ).rides ).map( r => r.achievement ).sort(), [ 'challenges-1', 'km-10', 'km-100' ] );

	} );

	test( 'achievements: the docs\' console SQL writes every placing of a board finished before achievements, from its final ranks', async () => {

		// A weekly board finished before achievements (no placings written), its places 1, 3 and 11.
		const [ first, third, eleventh ] = [ await player(), await player(), await player() ];
		server.d1( `INSERT INTO challenges ( id, period, world, kind, place, route, source, starts_at, ends_at, created_at, final_at )
			VALUES ( 9901, 'week:2026-10-05', 'earth', 'sprint', 'Old place', '{}', 'rotation', 0, 1, 0, 2 )` );
		for ( const [ who, rank ] of [ [ first, 1 ], [ third, 3 ], [ eleventh, 11 ] ] ) {

			server.d1( `INSERT INTO challenge_times ( challenge_id, player_id, ms, passes, vehicle, run_id, visit, created_at, first_at, final_rank )
				VALUES ( 9901, '${ who.id }', ${ 60000 + rank }, '[]', 'go-kart', 'run-${ rank }-${ who.id }', 'v', 0, 0, ${ rank } )` );

		}

		const docs = readFileSync( new URL( '../docs/world-drive.md', import.meta.url ), 'utf8' );
		const from = docs.indexOf( '-- Write the placings of boards finished before achievements' );
		assert.ok( from > 0 );
		const sql = docs.slice( docs.indexOf( 'INSERT INTO achievements', from ), docs.indexOf( 'ON CONFLICT DO NOTHING;', from ) + 'ON CONFLICT DO NOTHING;'.length );
		server.d1( sql );
		// Every placing each reached, as placingQuery would have written them: the weekly podium's vac
		// truck among them; none for a daily or a monthly board.
		assert.deepEqual( feats( first ), [ 'podium', 'top-10', 'weekly-podium', 'winner' ] );
		assert.deepEqual( feats( third ), [ 'podium', 'top-10', 'weekly-podium' ] );
		assert.deepEqual( feats( eleventh ), [] );
		assert.deepEqual( server.d1( `SELECT DISTINCT earned_at FROM achievements WHERE player_id = '${ first.id }'` ), [ { earned_at: 2 } ] );
		// Run again: nothing more.
		server.d1( sql );
		assert.equal( feats( first ).length, 4 );

	} );

	test( 'achievements: the owner\'s counts of players with each, nothing of who', async () => {

		const boss = await signIn( 'boss-1', 'boss@example.com' );
		const res = await call( '/api/admin/achievements', { cookie: boss } );
		assert.equal( res.status, 200, res.text );
		assert.deepEqual( Object.keys( res.json ).sort(), [ 'achievements', 'earners', 'players' ] );
		assert.deepEqual( res.json.achievements.map( a => a.id ), ACHIEVEMENTS.map( a => a.id ) );
		const counted = Object.fromEntries( server.d1( 'SELECT achievement, COUNT(*) AS n FROM achievements GROUP BY achievement' ).map( r => [ r.achievement, r.n ] ) );
		for ( const a of res.json.achievements ) assert.equal( a.players, counted[ a.id ] ?? 0, a.id );
		const byId = id => res.json.achievements.find( a => a.id === id );
		assert.ok( byId( 'km-10' ).players >= 3 );
		assert.deepEqual( [ byId( 'km-10' ).name, byId( 'km-10' ).checked, byId( 'km-10' ).ride ], [ '10 km driven', false, 'Skid steer' ] );
		assert.deepEqual( [ byId( 'weekly-podium' ).checked, byId( 'weekly-podium' ).ride ], [ true, 'Vac truck' ] );
		assert.equal( res.json.earners, server.d1( 'SELECT COUNT( DISTINCT player_id ) AS n FROM achievements' )[ 0 ].n );
		assert.equal( res.json.players, server.d1( 'SELECT COUNT(*) AS n FROM players' )[ 0 ].n );
		// Nothing of who: no player's id or nickname (the players here are "Driver 1" and on).
		assert.doesNotMatch( res.text, /player_id|Driver \d|"secret"|[A-Za-z0-9_-]{16}"/ );
		assert.equal( ( await call( '/api/admin/achievements' ) ).status, 401 );
		assert.equal( ( await call( '/api/admin/achievements', { cookie: await signIn( 'not-boss', 'nobody@example.com' ) } ) ).status, 403 );

	} );

	test( 'a player removed takes their discoveries with them', async () => {

		const max = await player();
		await report( max, { km: 1, areas: [ AREAS[ 0 ] ] }, { after: 3 * MINUTE } );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM discoveries WHERE player_id = '${ max.id }'` )[ 0 ].n, 1 );
		server.d1( `DELETE FROM players WHERE id = '${ max.id }'` );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM discoveries WHERE player_id = '${ max.id }'` )[ 0 ].n, 0 );

	} );

} );

// --- achievements, as written ---------------------------------------------------------------------

describe( 'Achievements: the rules', () => {

	test( 'the list: each count known, every construction ride unlocked by one of them, and nothing by the pass', () => {

		assert.ok( ACHIEVEMENTS.length >= 20 );
		assert.equal( new Set( ACHIEVEMENTS.map( a => a.id ) ).size, ACHIEVEMENTS.length );
		for ( const a of ACHIEVEMENTS ) assert.ok( a.count in COUNTS && a.target > 0 && a.name && a.goal, a.id );
		for ( const kind of [ 'km', 'moon', 'mars', 'vesta', 'ceres', 'challenges', 'placing', 'parties', 'looks', 'rides', 'streak' ] ) assert.ok( ACHIEVEMENTS.some( a => a.count === kind ), kind );
		// Mars's three, as the Moon's, after them.
		const ids = ACHIEVEMENTS.map( a => a.id );
		assert.deepEqual( ids.slice( ids.indexOf( 'moon-1' ), ids.indexOf( 'moon-1' ) + 6 ), [ 'moon-1', 'moon-10', 'moon-50', 'mars-1', 'mars-10', 'mars-50' ] );
		assert.deepEqual( ACHIEVEMENTS.filter( a => a.count === 'mars' ).map( a => [ a.name, a.goal, a.target ] ), [ [ 'Touchdown', 'Drive on Mars', 1 ], [ 'Red regular', 'Drive on Mars 10 times', 10 ], [ 'Martian', 'Drive on Mars 50 times', 50 ] ] );
		assert.deepEqual( [ COUNTS.mars, TALLY_DAY.mars, CLAIM_TALLY.mars ], [ 'trusted', TALLY_DAY.moon, CLAIM_TALLY.moon ] );
		// Vesta's three and Ceres's, as Mars's, after them.
		assert.deepEqual( ids.slice( ids.indexOf( 'mars-50' ) + 1, ids.indexOf( 'mars-50' ) + 7 ), [ 'vesta-1', 'vesta-10', 'vesta-50', 'ceres-1', 'ceres-10', 'ceres-50' ] );
		assert.deepEqual( ACHIEVEMENTS.filter( a => a.count === 'vesta' ).map( a => [ a.goal, a.target ] ), [ [ 'Drive on Vesta', 1 ], [ 'Drive on Vesta 10 times', 10 ], [ 'Drive on Vesta 50 times', 50 ] ] );
		assert.deepEqual( ACHIEVEMENTS.filter( a => a.count === 'ceres' ).map( a => [ a.goal, a.target ] ), [ [ 'Drive on Ceres', 1 ], [ 'Drive on Ceres 10 times', 10 ], [ 'Drive on Ceres 50 times', 50 ] ] );
		for ( const world of [ 'vesta', 'ceres' ] ) assert.deepEqual( [ COUNTS[ world ], TALLY_DAY[ world ], CLAIM_TALLY[ world ] ], [ 'trusted', TALLY_DAY.moon, CLAIM_TALLY.moon ], world );
		assert.deepEqual( ACHIEVEMENTS.filter( a => a.count === 'streak' ).map( a => a.target ), [ 3, 7, 30 ] );
		assert.deepEqual( PLACINGS.map( a => [ a.target, a.period ?? 'any' ] ), [ [ 10, 'any' ], [ 3, 'any' ], [ 1, 'any' ], [ 1, 'day' ], [ 3, 'week' ], [ 10, 'month' ] ] );
		assert.deepEqual( Object.keys( RIDE_FEATS ).sort(), [ ...WORKS_RIDES ].sort() );
		for ( const id of WORKS_RIDES ) assert.ok( ACHIEVEMENTS.some( a => a.id === RIDE_FEATS[ id ].feat ), id );
		assert.equal( RIDE_FEATS[ 'hydrovac-truck' ].feat, 'weekly-podium' );
		// The rides levels or the pass give aren't these, nor the pickup.
		for ( const id of WORKS_RIDES ) assert.ok( ! RIDES.some( r => r.id === id ) && ! LIBRARY_VEHICLES.includes( id ), id );
		// (What the Worker asks of a ride: its achievement, or none for any other ride.)
		assert.equal( rideFeat( 'hydrovac-truck' ), 'weekly-podium' );
		assert.equal( rideFeat( 'go-kart' ), null );
		assert.equal( rideFeat( 'pickup-truck' ), null );

	} );

	test( 'tallies: what a report may carry, a day\'s worth taken, and what\'s reached', () => {

		assert.deepEqual( checkTallies( {} ), { moon: 0, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: [] } );
		assert.deepEqual( checkTallies( { rides: [ 'go-kart', 'go-kart' ] } ).rides, [ 'go-kart' ] );
		for ( const bad of [ null, [], { moon: 1.5 }, { looks: - 1 }, { rides: [ 'tank' ] }, { rides: 'go-kart' }, { moon: 1e9 }, { mars: 1.5 }, { mars: 1e9 }, { vesta: 1.5 }, { ceres: - 1 }, { vesta: '3' }, { ceres: 1e9 } ] ) assert.equal( checkTallies( bad ), null, JSON.stringify( bad ) );
		assert.deepEqual( checkReport( { feats: { moon: 2 } } ).feats, { moon: 2, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: [] } );
		assert.deepEqual( checkReport( { feats: { mars: 3 } } ).feats, { moon: 0, mars: 3, vesta: 0, ceres: 0, looks: 0, rides: [] } );
		assert.deepEqual( checkReport( { feats: { vesta: 2, ceres: 5 } } ).feats, { moon: 0, mars: 0, vesta: 2, ceres: 5, looks: 0, rides: [] } );
		assert.equal( 'feats' in checkReport( { feats: {} } ), false );
		assert.equal( checkReport( { feats: { moon: - 2 } } ), null );
		const none = readTallies( 'not json' );
		assert.deepEqual( none, { km: 0, moon: 0, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: [], streak: 0, run: 0, runDay: '', day: '', today: { km: 0, moon: 0, mars: 0, vesta: 0, ceres: 0, looks: 0, rides: 0 } } );
		const { tallies, taken } = addTallies( none, { km: 900, feats: { moon: 12, looks: 2, rides: [ 'go-kart', 'golf-cart', 'tuk-tuk', 'hypercar', 'city-bus' ] }, daily: true }, '2026-11-01' );
		assert.deepEqual( [ taken.km, taken.moon, taken.looks, taken.rides.length ], [ TALLY_DAY.km, TALLY_DAY.moon, 2, TALLY_DAY.rides ] );
		assert.deepEqual( [ tallies.km, tallies.streak, tallies.run, tallies.runDay, tallies.day ], [ TALLY_DAY.km, 1, 1, '2026-11-01', '2026-11-01' ] );
		// Days in a row only as the daily bonus is given: the next day's makes two, the same day's
		// again nothing, a day missed starts again (the best kept), and none without the bonus.
		const second = addTallies( tallies, { daily: true }, '2026-11-02' ).tallies;
		assert.deepEqual( [ second.run, second.streak ], [ 2, 2 ] );
		assert.deepEqual( [ addTallies( second, { daily: true }, '2026-11-02' ).tallies.run, addTallies( second, {}, '2026-11-03' ).tallies.run ], [ 2, 2 ] );
		assert.deepEqual( [ addTallies( second, { daily: true }, '2026-11-04' ).tallies.run, addTallies( second, { daily: true }, '2026-11-04' ).tallies.streak ], [ 1, 2 ] );
		assert.deepEqual( addTallies( none, { daily: true }, '2026-03-01' ).tallies.runDay, '2026-03-01' );
		assert.equal( addTallies( { ...none, run: 4, runDay: '2026-02-28' }, { daily: true }, '2026-03-01' ).tallies.run, 5 );
		// A claim's: CLAIM_TALLY at most of each.
		assert.deepEqual( claimTallies( { km: 400, feats: { moon: 9, looks: 9, rides: [ 'go-kart', 'golf-cart', 'tuk-tuk', 'hypercar' ] } } ), { km: CLAIM_TALLY.km, feats: { moon: CLAIM_TALLY.moon, mars: 0, vesta: 0, ceres: 0, looks: CLAIM_TALLY.looks, rides: [ 'go-kart', 'golf-cart', 'tuk-tuk' ] } } );
		assert.deepEqual( claimTallies( { km: 0, feats: { moon: 0, mars: 9, looks: 0, rides: [] } } ).feats.mars, CLAIM_TALLY.mars );
		assert.ok( CLAIM_TALLY.km < ACHIEVEMENTS.find( a => a.id === 'km-100' ).target );
		// The same day: nothing more; the next: a day's worth again.
		assert.equal( addTallies( tallies, { km: 10 }, '2026-11-01' ).taken.km, 0 );
		assert.equal( addTallies( tallies, { km: 10 }, '2026-11-02' ).taken.km, 10 );
		assert.deepEqual( crossed( countsOf( none ), countsOf( tallies ) ), [ 'first-drive', 'km-10', 'km-100', 'moon-1', 'moon-10', 'look-1', 'rides-3' ] );
		assert.equal( progressLine( ACHIEVEMENTS.find( a => a.id === 'km-100' ), { km: 34.56 } ), '34.5 / 100 km' );
		assert.equal( progressLine( ACHIEVEMENTS.find( a => a.id === 'first-drive' ), { km: 0.12 } ), '120 / 250 m' );
		assert.equal( progressLine( ACHIEVEMENTS.find( a => a.id === 'challenges-10' ), { challenges: 4 } ), '4 / 10 finished' );
		// Mars's drives, as the Moon's: a day's worth taken, its own; reached, and said.
		const mars = addTallies( tallies, { feats: { mars: 12 } }, '2026-11-01' );
		assert.deepEqual( [ mars.taken.mars, mars.tallies.mars, mars.tallies.today.mars, mars.tallies.moon ], [ TALLY_DAY.mars, TALLY_DAY.mars, TALLY_DAY.mars, TALLY_DAY.moon ] );
		assert.equal( addTallies( mars.tallies, { feats: { mars: 1 } }, '2026-11-01' ).taken.mars, 0 );
		assert.equal( addTallies( mars.tallies, { feats: { mars: 1 } }, '2026-11-02' ).taken.mars, 1 );
		assert.deepEqual( crossed( countsOf( tallies ), countsOf( mars.tallies ) ), [ 'mars-1', 'mars-10' ] );
		assert.equal( progressLine( ACHIEVEMENTS.find( a => a.id === 'mars-50' ), { mars: 12 } ), '12 / 50 drives' );
		assert.ok( hasTallies( { mars: 1 } ) && ! hasTallies( { mars: 0, moon: 0, looks: 0, rides: [] } ) );
		assert.deepEqual( mergeTallies( { moon: 1, looks: 0, rides: [] }, { mars: 2, moon: 0, looks: 0, rides: [ 'go-kart' ] } ), { moon: 1, mars: 2, vesta: 0, ceres: 0, looks: 0, rides: [ 'go-kart' ] } );
		assert.deepEqual( mergeTallies( { mars: 0, moon: 0, looks: 0, rides: [] }, undefined ), undefined );
		// Vesta's and Ceres's drives, as Mars's: each its own day's worth and claim, reached and said.
		for ( const world of [ 'vesta', 'ceres' ] ) {

			const on = addTallies( tallies, { feats: { [ world ]: 12 } }, '2026-11-01' );
			assert.deepEqual( [ on.taken[ world ], on.tallies[ world ], on.tallies.today[ world ], on.tallies.mars, on.tallies.moon ], [ TALLY_DAY[ world ], TALLY_DAY[ world ], TALLY_DAY[ world ], 0, TALLY_DAY.moon ], world );
			assert.equal( addTallies( on.tallies, { feats: { [ world ]: 1 } }, '2026-11-01' ).taken[ world ], 0 );
			assert.equal( addTallies( on.tallies, { feats: { [ world ]: 1 } }, '2026-11-02' ).taken[ world ], 1 );
			assert.deepEqual( crossed( countsOf( tallies ), countsOf( on.tallies ) ), [ `${ world }-1`, `${ world }-10` ] );
			assert.equal( progressLine( ACHIEVEMENTS.find( a => a.id === `${ world }-50` ), { [ world ]: 12 } ), '12 / 50 drives' );
			assert.equal( claimTallies( { km: 0, feats: { ...checkTallies( {} ), [ world ]: 9 } } ).feats[ world ], CLAIM_TALLY[ world ] );
			assert.ok( hasTallies( { [ world ]: 1 } ) );
			assert.equal( mergeTallies( { [ world ]: 1, rides: [] }, { [ world ]: 2, rides: [] } )[ world ], 3 );
			// Kept before Vesta and Ceres (none of theirs, today's neither): none there, added from none.
			const old = readTallies( JSON.stringify( { km: 12, moon: 3, mars: 2, looks: 1, rides: [], day: '2026-11-01', today: { km: 2, moon: 1, mars: 1, looks: 1, rides: 0 } } ) );
			assert.deepEqual( [ old[ world ], old.today[ world ], countsOf( old )[ world ] ], [ 0, 0, 0 ] );
			const taken = addTallies( old, { feats: { [ world ]: 4 } }, '2026-11-01' ).tallies;
			assert.deepEqual( [ taken[ world ], taken.today[ world ], taken.mars, taken.today.mars ], [ 4, 4, 2, 1 ] );

		}

		// Tallies kept before Mars (a player's row from then, today's too): none on Mars, and its drives
		// added from none; a report from a page before Mars (no mars) still taken.
		const before = readTallies( JSON.stringify( { km: 12, moon: 3, looks: 1, rides: [ 'go-kart' ], streak: 2, run: 2, runDay: '2026-11-01', day: '2026-11-01', today: { km: 2, moon: 1, looks: 1, rides: 1 } } ) );
		assert.deepEqual( [ before.mars, before.today.mars, countsOf( before ).mars ], [ 0, 0, 0 ] );
		const added = addTallies( before, { feats: { mars: 4, moon: 1 } }, '2026-11-01' );
		assert.deepEqual( [ added.tallies.mars, added.tallies.today.mars, added.tallies.moon, added.tallies.today.moon ], [ 4, 4, 4, 2 ] );
		const unread = { km: 1, moon: 0, looks: 0, rides: [], streak: 0, run: 0, runDay: '', day: '2026-11-01', today: { km: 1, moon: 0, looks: 0, rides: 0 } };
		assert.deepEqual( [ addTallies( unread, { feats: { mars: 2 } }, '2026-11-01' ).tallies.mars, addTallies( unread, { feats: checkTallies( { moon: 1 } ) }, '2026-11-01' ).tallies.mars ], [ 2, 0 ] );

	} );

} );

// The spots all have ids a report may name.
test( 'the start spots are reportable', () => {

	assert.ok( SPOTS.length >= 10 );
	assert.deepEqual( checkReport( { spots: SPOTS.map( s => s.id ) } ).spots, SPOTS.map( s => s.id ) );

} );
