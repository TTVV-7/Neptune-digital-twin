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
	areaOf, badgeOf, capReport, checkReport, dailyXp, drivingXp, levelOf, nextReward, progressOf, rewardsAt, rewardsBetween, rideLevel, rideLocked, rideUnlock, titleOf, trickXp, unlockLevel,
} from '../src/drive-app/levels.js';
import { CARS } from '../src/drive-app/cars.js';
import { BOOSTS } from '../src/drive-app/boosts.js';
import { DECALS, FINISHES, FLAMES, GLOWS, HORNS, RIMS, SMOKES, SWATCHES, TRAILS, isLocked, lookFor, saveLook, unlockOf } from '../src/drive-app/paint.js';
import { SPOTS } from '../src/drive-app/places.js';
import { makeVisit } from '../worker/drive/visits.js';

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
		for ( const [ part, id ] of [ [ 'boost', 'lightning' ], [ 'boost', 'fireworks' ], [ 'boost', 'comet' ], [ 'trail', 'ribbon' ], [ 'flame', 'rainbow' ], [ 'rim', 'gold' ], [ 'finish', 'metallic' ], [ 'finish', 'chrome' ], [ 'finish', 'shift' ], [ 'glow', 'rainbow' ] ] ) assert.equal( unlockLevel( part, id ), null, id );
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
	const report = ( who, body, { time, after = 2 * MINUTE, visit = who.visit, secret = who.secret } = {} ) =>
		call( '/api/progress', { method: 'POST', body: { id: who.id, secret, visit, report: body }, time: time ?? who.at + after } );
	const row = who => server.d1( `SELECT xp, title, progress_at, streak_day, streak, discoveries FROM players WHERE id = '${ who.id }'` )[ 0 ];
	// A progress answer: nothing yet, with `fields`.
	const answer = ( fields = {} ) => ( { xp: 0, own: 0, level: 1, gained: 0, unlocked: [], supporter: false, title: 'rookie', chosen: '', streakDay: '', streak: 0, accepted: { areas: [], spots: [] }, ...fields } );

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

	test( 'a player removed takes their discoveries with them', async () => {

		const max = await player();
		await report( max, { km: 1, areas: [ AREAS[ 0 ] ] }, { after: 3 * MINUTE } );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM discoveries WHERE player_id = '${ max.id }'` )[ 0 ].n, 1 );
		server.d1( `DELETE FROM players WHERE id = '${ max.id }'` );
		assert.equal( server.d1( `SELECT COUNT(*) AS n FROM discoveries WHERE player_id = '${ max.id }'` )[ 0 ].n, 0 );

	} );

} );

// The spots all have ids a report may name.
test( 'the start spots are reportable', () => {

	assert.ok( SPOTS.length >= 10 );
	assert.deepEqual( checkReport( { spots: SPOTS.map( s => s.id ) } ).spots, SPOTS.map( s => s.id ) );

} );
