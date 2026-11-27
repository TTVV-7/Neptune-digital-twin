import { metresOn, RADIUS } from './dropin-cells.js';
import { WORLD_IDS, WORLDS as WORLD_DATA } from './worlds.js';

// Challenges (docs/world-drive.md, "Challenges"): a weekly and a monthly challenge on each world
// (worlds.js: the Earth, the Moon, Mars, Vesta and Ceres, ten at once), each with its own
// board of the best times. What the page (the challenges' own chunk, challenges.js), the Worker
// (worker/drive/challenges.js) and the tests share: the periods, the kinds, how a route is laid out
// from a period's random numbers, and the rules a time is checked against. Plain data and small
// functions, no three.js.
//
// A challenge is a place and a route, the same for everyone in its period: a checkpoint sprint
// (gates in order, timed from the start to the last), collectibles (every item round the place, in
// any order) or a drive to a landmark (from a start a few kilometres off to a named place). The
// Worker lays the route out once, the first time the period's challenge is asked for, and keeps it
// in D1, so nothing here changing later changes a live challenge: its points are latitudes and
// longitudes, and only their heights are found by the page, on the ground it actually has.

// The worlds with challenges: every one (worlds.js). Each needs its SHAPES below, its places (the
// Worker's FEATURED) and its radius (dropin-cells.js's RADIUS), or no route can be laid out on it.
export const WORLDS = WORLD_IDS;
// Every kind of period, shortest first (the order lists are sorted in), and those there are
// challenges for: the Worker's CHALLENGE_PERIODS setting, by default PERIOD_KINDS. There were daily
// ones too until 2026-11-22 (too many at once, the owner found): 'day' is still a period everything
// here knows (periodOf, parsePeriod, its SHAPES and PICKS), so the daily boards and links from
// before go on working, and CHALLENGE_PERIODS "day,week,month" would bring them back.
export const PERIODS = [ 'day', 'week', 'month' ];
export const PERIOD_KINDS = [ 'week', 'month' ];
// The kinds of period a world of hoop runs has (since 2026-11-27: a month's alone, the owner finding
// a week's and a month's too many for worlds few play, so each board has a month to fill): the
// Earth has every kind live.
export const HOOP_PERIODS = [ 'month' ];

// The kinds of `kinds` (the live ones: the Worker's liveKinds) that `world` has challenges for: a
// world of hoop runs only `hoopKinds`' (HOOP_PERIODS, or the Worker's HOOP_PERIODS setting), or, with
// none of those live, the longest that is.
export function periodKindsOn( world, kinds = PERIOD_KINDS, hoopKinds = HOOP_PERIODS ) {

	if ( ! HOOP_WORLDS.includes( world ) ) return kinds;
	const own = kinds.filter( kind => hoopKinds.includes( kind ) );
	return own.length ? own : kinds.slice( - 1 );

}
export const KINDS = [ 'sprint', 'collect', 'landmark', 'hoops' ];
export const PERIOD_NAMES = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
export const KIND_NAMES = { sprint: 'Checkpoint sprint', collect: 'Collect them all', landmark: 'Drive to a landmark', hoops: 'Hoop run' };
// The worlds whose challenges are all hoop runs (the Moon's since 2026-11-26: few drove its
// challenges, and its open, airless ground suits the plane; Mars's, Vesta's and Ceres's since
// 2026-11-27, flying being more fun, each its own way: HOOP_FEEL): flown in the plane's course mode
// (src/plane.js) through hoops standing over the ground, rather than driven (docs/world-drive.md,
// "Hoop runs"). The Earth's are driven.
export const HOOP_WORLDS = [ 'moon', 'mars', 'vesta', 'ceres' ];

// The fastest anything in the game goes along the ground (m/s), which no leg of a route can be
// driven faster than: the fastest ride's top speed, the hypercar's 215 km/h (src/drive-app/cars.js),
// times the booster's, which pushes up to twice a ride's top speed (BOOST_SPEED in src/drive.js).
// Nothing beats that: a drift's mini-turbo is at most 1.5 times the top speed and a landed trick's
// burst 1.25 times (DRIFT_BOOSTS, TRICK_BOOST), a boost pad only fills the booster, flying goes at
// the ride's own speed, a hit keeps 85 % of the speed along the wall, R stops the car 4 m on,
// going downhill adds nothing along the ground (drive.js keeps upward speed apart), and a landing
// carried on down a slope never passes the booster's. (Plane mode is never a challenge run.) So
// 430 km/h, 119.4 m/s; scripts/test-drive-worker.mjs reads those numbers from the game's own files
// and fails if any of them changes.
export const TOP_SPEED = 215;
export const BOOSTED = 2;
export const FASTEST = TOP_SPEED * BOOSTED / 3.6;
// A hoop run is flown in the plane's course mode (src/plane.js's COURSE_KMH, a copy of these): it
// cruises at `cruise` km/h by itself, boosts to `boost` at most (nothing in course mode goes faster:
// a dive, a carve's burst and a boost all stop there) and brakes to `least`. Each world's own pace
// (COURSES): Mars slower and twisting, Vesta fastest with its hoops far apart, the Moon and Ceres
// between. So a hoop run's legs and its ghost are checked against its world's boost (fastestFor)
// instead of the ground's FASTEST. COURSE is the Moon's; COURSE_FASTEST the fastest of any world's.
export const COURSES = {
	moon: { cruise: 450, boost: 900, least: 220 },
	mars: { cruise: 380, boost: 780, least: 200 },
	vesta: { cruise: 650, boost: 1300, least: 300 },
	ceres: { cruise: 450, boost: 900, least: 220 },
};
export const COURSE = COURSES.moon;
export const COURSE_FASTEST = Math.max( ...Object.values( COURSES ).map( course => course.boost ) ) / 3.6;
// A hoop missed (flown past, or through a later one) puts this much (ms) on a hoop run's clock at
// once, and is posted as [ index, ms, 1 ]: so cutting straight to a later hoop doesn't pay.
export const HOOP_MISS = 3000;
// A missed hoop was still flown by: the run's ghost is within this (m) of it across the ground at the
// miss's time (ghost-rules.js), so a run can't skip a course by missing every hoop on the way to a
// finish near its start (a landing site's loop). More than any of the Moon's legs (900 m at most, a
// basin's 1.25 times that), as a hoop skipped is missed where the next is flown through; on a world
// with longer legs, hoopNear's (Vesta's).
export const HOOP_NEAR = 1500;

// The fastest (m/s) a challenge of `kind` on `world` can be gone round: the plane's course mode there
// for a hoop run (the fastest world's, not knowing which), the ground's for the rest.
export function fastestFor( kind, world = null ) {

	if ( kind !== 'hoops' ) return FASTEST;
	return COURSES[ world ] ? COURSES[ world ].boost / 3.6 : COURSE_FASTEST;

}
// A run's time is the game's own clock: the steps the frames drove the car by, each at most 0.1 s
// (main.js), so a pass is seen up to a step after the car got there. Each leg may be that much
// quicker than FASTEST allows (ms).
export const LEG_SLACK = 100;
// The drop-in finds the street (or a bridge's deck, the sea's surface) near the start's pin, up to
// about 50 m off it (spawn.js), and moves across the road from anything in front: the first leg is
// counted from anywhere this near the pin (m).
export const START_SLACK = 100;
// The longest run that's taken (ms): a monthly's route is a few minutes at most.
export const MAX_RUN = 2 * 60 * 60 * 1000;
// How long after a challenge's period ends (ms) a run finished in it is still taken (a run that
// started before the end, posted a moment after): the Worker's check, and the page's keeping of a
// time that couldn't be posted (challenges.js).
export const GRACE = 60 * 1000;
// A rank is found among a board's first this many times (the Worker keeps each board's order to
// this many, so reading it costs no more than this, however long the board): further down, it's
// "1000+".
export const RANK_MOST = 1000;
// The path a "challenge a friend" link is shared at (/c?challenge=<id>&vs=<handle>): the one page
// the Worker runs for, giving it a preview card of its own for chat apps, while the home page and
// the rest are files it never sees (wrangler.drive.jsonc).
export const LINK_PATH = '/c';
// A pass counts within a gate's radius across the ground, and up and down from its ground to its
// top (on the Earth the lowest and the highest of what rays down across its zone meet: the street
// beside a tower and the tower's roof, or the water under a bridge and its deck; on another world
// both its one height) and this many times its radius beyond them: so a gate is passed on the street,
// on the roof or deck over it, or flying low over it, and one whose ground hasn't loaded yet across
// the ground alone. (challenges.js.) The zone's middle is ZONE_UP m over its ground.
export const TALL = 2;
export const ZONE_UP = 2;

const DAY = 24 * 60 * 60 * 1000;
// The first Monday after 1 January 1970 (a Thursday), from which weeks are counted.
const FIRST_MONDAY = Date.UTC( 1970, 0, 5 );
const PERIOD_TEXT = /^(day|week):(\d{4}-\d{2}-\d{2})$|^month:(\d{4}-\d{2})$/;

// How each kind is laid out, for each world and length of period. A daily one is about 30 to 90 s
// for a good driver (a city's streets at 100 km/h or so, with the booster now and then), a weekly
// one longer and a monthly one longer still. On the Earth the tiles have no roads in them, so a
// sprint's gates follow the start's own road at first (a start spot's heading is the way along its
// road) and turn gently after, 200 to 450 m apart, each 30 m round: a parallel street, or driving
// (or flying) over whatever is in the way, passes it as well. Items are scattered in a disc round
// the place, apart from each other, 18 m round. A landmark's start is a few kilometres back along the
// road the place is on, so it's reached the way people drive to it. The Moon is open ground: longer
// legs, sharper turns, bigger radii; and Mars is too, cratered, dusty and roadless, laid out as the
// Moon's. Vesta and Ceres are the Moon's sizes with gentler turns: in their weak gravity a hop keeps
// the car in the air for 9 to 20 s, so a sharp turn can't be made where it's laid out.
//   sprint: { gates, spacing: [ m, m ], turn: ° either way, radius }
//   collect: { items, within: m, apart: m, radius }
//   landmark: { distance: [ m, m ], spread: ° either way, radius }
export const SHAPES = {
	earth: {
		day: { sprint: { gates: 6, spacing: [ 200, 300 ], turn: 30, radius: 30 }, collect: { items: 6, within: 260, apart: 70, radius: 18 }, landmark: { distance: [ 1200, 1800 ], spread: 25, radius: 45 } },
		week: { sprint: { gates: 9, spacing: [ 250, 380 ], turn: 35, radius: 30 }, collect: { items: 10, within: 450, apart: 90, radius: 18 }, landmark: { distance: [ 2500, 3500 ], spread: 25, radius: 45 } },
		month: { sprint: { gates: 14, spacing: [ 300, 450 ], turn: 40, radius: 30 }, collect: { items: 15, within: 700, apart: 110, radius: 18 }, landmark: { distance: [ 4500, 6500 ], spread: 25, radius: 45 } },
	},
	moon: {
		day: { sprint: { gates: 6, spacing: [ 280, 420 ], turn: 55, radius: 40 }, collect: { items: 6, within: 350, apart: 90, radius: 22 }, landmark: { distance: [ 1600, 2400 ], spread: 180, radius: 60 } },
		week: { sprint: { gates: 9, spacing: [ 350, 520 ], turn: 60, radius: 40 }, collect: { items: 10, within: 600, apart: 120, radius: 22 }, landmark: { distance: [ 3200, 4500 ], spread: 180, radius: 60 } },
		month: { sprint: { gates: 14, spacing: [ 400, 600 ], turn: 65, radius: 40 }, collect: { items: 15, within: 900, apart: 150, radius: 22 }, landmark: { distance: [ 6000, 8500 ], spread: 180, radius: 60 } },
	},
};
// A hoop run (the Moon's): `hoops` hoops `spacing` m apart (times its style's share, below), each
// `radius` m round, with `orbs` boost orbs off the line and `tricks` trick hoops. About 60 to 90 s for
// a good pilot a week's, two minutes or so a month's.
//   hoops: { hoops, spacing: [ m, m ], radius, orbs, tricks }
// (Each world's below, once all the worlds' shapes are made: HOOP_SHAPES.)
// How a hoop run is laid out at each kind of place (hoopStyle), so the course is the place's own:
//   turn: [ °, ° ] how sharp each turn is; pattern: 'weave' (left and right in turn), 'spiral' (one
//   way all round), 'wander' (either way), 'loop' (one way, coming back round to the start);
//   up: [ m, m ] how high each hoop's middle is over the ground under it; spacing: a share of the
//   shape's; dives: every DIVE_EVERY'th hoop down low (DIVE_UP m).
export const HOOP_STYLES = {
	crater: { turn: [ 20, 55 ], pattern: 'weave', up: [ 12, 60 ], spacing: 1 },
	mountain: { turn: [ 25, 40 ], pattern: 'spiral', up: [ 20, 90 ], spacing: 0.9 },
	valley: { turn: [ 5, 25 ], pattern: 'wander', up: [ 8, 30 ], spacing: 1.1 },
	sea: { turn: [ 35, 70 ], pattern: 'weave', up: [ 6, 25 ], spacing: 0.8 },
	landing: { turn: [ 0, 0 ], pattern: 'loop', up: [ 10, 45 ], spacing: 0.85 },
	basin: { turn: [ 10, 40 ], pattern: 'wander', up: [ 15, 140 ], spacing: 1.25, dives: true },
};
// A trick hoop is at least this high (m) over the ground, so a loop can be started under it
// (plane-tricks.js's loopGate at the cruise); a dive's hoop this low; orbs this far (m) off the line.
export const TRICK_UP = 70;
export const DIVE_UP = 6;
const DIVE_EVERY = 5;
const ORB_OFF = [ 60, 140 ];

// The kind of place `place` ({ id?, name, region? }) is, for its hoop run's style: by the words in
// its id, name and region (world-places.js's places, or a drop-in place's name). A crater by default.
export function hoopStyle( place ) {

	const text = `${ place.id ?? '' } ${ place.name ?? '' } ${ place.region ?? '' }`.toLowerCase();
	if ( /rille|vallis|valles|valley|chasma|fossae|catena|labyrinth|rupes|canyon|trough/.test( text ) ) return 'valley';
	if ( /apollo|lunokhod|chang'?e|chandrayaan|shiv shakti|tranquility base|ranger|surveyor|luna \d|curiosity|perseverance|opportunity|spirit|viking|pathfinder|sojourner|insight|zhurong|phoenix|beagle|bradbury/.test( text ) ) return 'landing';
	if ( /\bmons\b|montes|summit|highland|mountain|peak|tholus|tholi|terra\b|volcano|plateau/.test( text ) ) return 'mountain';
	if ( /pole|basin|aitken|orientale|lowest|deepest/.test( text ) ) return 'basin';
	if ( /\bmare\b|oceanus|sea of|ocean of|planitia|planum|plains/.test( text ) ) return 'sea';
	return 'crater';

}

SHAPES.mars = structuredClone( SHAPES.moon );
SHAPES.vesta = {
	day: { ...SHAPES.moon.day, sprint: { ...SHAPES.moon.day.sprint, turn: 35 } },
	week: { ...SHAPES.moon.week, sprint: { ...SHAPES.moon.week.sprint, turn: 40 } },
	month: { ...SHAPES.moon.month, sprint: { ...SHAPES.moon.month.sprint, turn: 45 } },
};
SHAPES.ceres = structuredClone( SHAPES.vesta );
// Each world's hoop runs: the Moon's the all-rounder; Mars's close together (and slower: COURSES);
// Vesta's far apart and bigger round, for its speed; Ceres's as the Moon's, its heights jumping
// (HOOP_FEEL).
// (A day's, a week's and a month's: how many hoops, and how far apart. Vesta's fewer, as each leg is
// long: about a minute and a half at its cruise either way.)
const HOOP_SHAPES = {
	moon: { hoops: [ 12, 18, 26 ], spacing: [ [ 450, 700 ], [ 500, 800 ], [ 600, 900 ] ], radius: 16 },
	mars: { hoops: [ 12, 18, 26 ], spacing: [ [ 300, 420 ], [ 320, 460 ], [ 350, 500 ] ], radius: 16 },
	vesta: { hoops: [ 8, 12, 16 ], spacing: [ [ 1100, 1600 ], [ 1200, 1800 ], [ 1300, 2000 ] ], radius: 24 },
	ceres: { hoops: [ 12, 18, 26 ], spacing: [ [ 450, 700 ], [ 500, 800 ], [ 600, 900 ] ], radius: 18 },
};
for ( const [ world, { hoops, spacing, radius } ] of Object.entries( HOOP_SHAPES ) ) {

	[ [ 'day', 3, 1 ], [ 'week', 4, 2 ], [ 'month', 6, 3 ] ].forEach( ( [ size, orbs, tricks ], i ) => {

		SHAPES[ world ][ size ].hoops = { hoops: hoops[ i ], spacing: spacing[ i ], radius, orbs, tricks };

	} );

}

// How each world's hoop runs feel on top of their places' styles (HOOP_STYLES): `turn` times as
// sharp, the hoops `up` times as high over the ground (or, as `upRange`, anywhere in it, for Ceres's
// dives and climbs).
export const HOOP_FEEL = {
	moon: { turn: 1, up: 1 },
	mars: { turn: 1.3, up: 0.6 },
	vesta: { turn: 0.5, up: 1.2 },
	ceres: { turn: 1, up: 1, upRange: [ 5, 150 ] },
};

// How near (m) a hoop run's ghost must have come to a hoop it missed on `world`: HOOP_NEAR, or more
// where its legs are longer (Vesta's, up to 2.5 km).
export function hoopNear( world ) {

	const longest = Math.max( ...PERIODS.map( size => SHAPES[ world ]?.[ size ]?.hoops?.spacing[ 1 ] ?? 0 ) ) * Math.max( ...Object.values( HOOP_STYLES ).map( style => style.spacing ) );
	return Math.max( HOOP_NEAR, Math.ceil( longest * 1.2 ) );

}
// The kinds a period's challenge is picked from, with how likely each is: a daily one is mostly a
// sprint or a hunt for items (a landmark's drive is the longest of the three), the others any.
export const KIND_ODDS = {
	day: [ [ 'sprint', 0.4 ], [ 'collect', 0.4 ], [ 'landmark', 0.2 ] ],
	week: [ [ 'sprint', 1 / 3 ], [ 'collect', 1 / 3 ], [ 'landmark', 1 / 3 ] ],
	month: [ [ 'sprint', 1 / 3 ], [ 'collect', 1 / 3 ], [ 'landmark', 1 / 3 ] ],
};
// Items are kept at least this far (m) from where the run starts, and a route laid out at most TRIES
// times when a check (the ground of a world made in the page, below) finds it wanting: the one with
// fewest faults is kept.
// A checked landmark's drive with no road to come along is tried from every BEARING_STEP degrees
// round it instead.
const CLEAR_START = 60;
const TRIES = 8;
const BEARING_STEP = 5;

// --- periods ---

// The period of `kind` ('day', 'week' or 'month') that `now` (ms) is in, by UTC: { kind, key,
// starts, ends } (ms; ends is the next one's start). Keys as the leaderboard's (boards.js):
// 'day:2026-11-16', 'week:2026-11-16' (the Monday it starts), and 'month:2026-11'.
export function periodOf( kind, now ) {

	const date = new Date( now );
	const midnight = Date.UTC( date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() );
	if ( kind === 'day' ) return { kind, key: `day:${ dayText( midnight ) }`, starts: midnight, ends: midnight + DAY };
	if ( kind === 'week' ) {

		const starts = midnight - ( ( date.getUTCDay() + 6 ) % 7 ) * DAY;
		return { kind, key: `week:${ dayText( starts ) }`, starts, ends: starts + 7 * DAY };

	}

	if ( kind === 'month' ) {

		const starts = Date.UTC( date.getUTCFullYear(), date.getUTCMonth(), 1 );
		return { kind, key: `month:${ dayText( starts ).slice( 0, 7 ) }`, starts, ends: Date.UTC( date.getUTCFullYear(), date.getUTCMonth() + 1, 1 ) };

	}

	throw new Error( `No period ${ kind }` );

}

// The live periods at `now` of the kinds `kinds` (by default PERIOD_KINDS: the week's and the
// month's), shortest first.
export function periodsAt( now, kinds = PERIOD_KINDS ) {

	return kinds.map( kind => periodOf( kind, now ) );

}

// The period after `period` (of the same kind).
export function nextPeriod( period ) {

	return periodOf( period.kind, period.ends );

}

// A period's key as written ('day:2026-11-16', 'week:2026-11-16', a Monday, or 'month:2026-11') as
// periodOf has it, or null for anything else.
export function parsePeriod( key ) {

	const match = typeof key === 'string' ? key.match( PERIOD_TEXT ) : null;
	if ( ! match ) return null;
	const kind = match[ 3 ] ? 'month' : match[ 1 ];
	const starts = Date.parse( `${ match[ 3 ] ? `${ match[ 3 ] }-01` : match[ 2 ] }T00:00:00Z` );
	if ( ! Number.isFinite( starts ) ) return null;
	const period = periodOf( kind, starts );
	return period.key === key && period.starts === starts ? period : null;

}

// The UTC date of `time` (ms), e.g. 2026-11-16.
function dayText( time ) {

	return new Date( time ).toISOString().slice( 0, 10 );

}

// Which of its kind `period` is, counted from 1970: its day, its week (from the first Monday) or
// its month. The rotation goes round the places by it.
export function periodIndex( period ) {

	if ( period.kind === 'day' ) return Math.round( period.starts / DAY );
	if ( period.kind === 'week' ) return Math.round( ( period.starts - FIRST_MONDAY ) / ( 7 * DAY ) );
	const date = new Date( period.starts );
	return ( date.getUTCFullYear() - 1970 ) * 12 + date.getUTCMonth();

}

// --- laying out a route ---

// Random numbers from 0 to 1 from `bytes` (16 or more: an HMAC of the period's key, so every Worker
// gives the same ones and nobody without the Worker's secret can work them out): sfc32.
export function randomFrom( bytes ) {

	const word = i => ( bytes[ i ] | bytes[ i + 1 ] << 8 | bytes[ i + 2 ] << 16 | bytes[ i + 3 ] << 24 ) | 0;
	let [ a, b, c, d ] = [ word( 0 ), word( 4 ), word( 8 ), word( 12 ) ];
	const next = () => {

		const t = ( ( a + b ) | 0 ) + d | 0;
		d = d + 1 | 0;
		a = b ^ b >>> 9;
		b = c + ( c << 3 ) | 0;
		c = c << 21 | c >>> 11;
		c = c + t | 0;
		return ( t >>> 0 ) / 4294967296;

	};

	// (Its first few numbers aren't well mixed yet.)
	for ( let i = 0; i < 12; i ++ ) next();
	return next;

}

// One of KIND_ODDS[ period kind ]'s kinds, for a random number `u`.
export function kindFor( periodKind, u, world = null ) {

	if ( HOOP_WORLDS.includes( world ) ) return 'hoops';
	let sum = 0;
	for ( const [ kind, odds ] of KIND_ODDS[ periodKind ] ) {

		sum += odds;
		if ( u < sum ) return kind;

	}

	return KIND_ODDS[ periodKind ].at( - 1 )[ 0 ];

}

// The route of a challenge of `kind` for a period of `size` ('day', 'week' or 'month') on `world`,
// at `place` ({ name, lat, lon, heading }: heading, if it's known, the way along its road), laid out
// with `random` (randomFrom's): { start: { lat, lon, heading }, points: [ [ lat, lon ] ], radius,
// goal } (goal: the landmark's name, for a drive to one). Sprints and collectibles start at the place
// itself; a landmark's drive starts a few kilometres off and ends at the place. `check( route, kind,
// enough )`, if given, says how many faults a route has (another world's ground too steep at its
// points or along its legs: worker/drive/challenges.js), or that it has `enough` at least (the fewest
// so far: it may stop counting there); then up to TRIES are laid out and the one with fewest kept.
// Positions are to 6 decimals (10 cm).
export function makeRoute( { kind, size, world, place }, random, check = null ) {

	const shape = SHAPES[ world ]?.[ size ]?.[ kind ];
	if ( ! shape ) throw new Error( `No ${ size } ${ kind } on ${ world }` );
	let best = null;
	const keep = route => {

		const faults = check ? check( route, kind, best?.faults ?? Infinity ) : 0;
		if ( ! best || faults < best.faults ) best = { route, faults };
		return faults;

	};
	if ( check && kind === 'landmark' && ! Number.isFinite( place.heading ) ) {

		// Checked, a landmark's drive with no road to come along: from every BEARING_STEP degrees round
		// it at one distance, the first with fewest faults from a bearing chosen at random (so a tie is
		// chosen at random too). On rough ground the way in that's clear may be narrow (at
		// Shackleton's rim, a window of 20 degrees or so either way along it), which a few bearings
		// spread round could miss. First each is only asked whether it has any fault (check's `enough`
		// of 1, which stops at the first), and the first with none is the one; only where none is clear
		// are they counted, the fewest kept. A few milliseconds at most, once a period.
		// (Whole degrees and metres: what's tried can be told again from the route, as the tests do.)
		const spin = Math.floor( random() * 360 );
		const distance = Math.round( between( shape.distance, random ) );
		const routes = [];
		for ( let turn = 0; turn < 360; turn += BEARING_STEP ) {

			const route = landmarkFrom( world, place, shape, spin + turn, distance );
			if ( ! check( route, kind, 1 ) ) return route;
			routes.push( route );

		}

		for ( const route of routes ) keep( route );
		return best.route;

	}

	for ( let i = 0; i < ( check ? TRIES : 1 ); i ++ ) if ( ! keep( layOut( kind, world, place, shape, random ) ) ) break;
	return best.route;

}

// A number from `range` ([ low, high ]) with `random`.
function between( [ low, high ], random ) {

	return low + ( high - low ) * random();

}

function layOut( kind, world, place, shape, random ) {

	const known = Number.isFinite( place.heading );
	const at = ( lat, lon ) => [ round( lat ), round( lon ) ];
	if ( kind === 'hoops' ) return layHoops( world, place, shape, random );
	if ( kind === 'sprint' ) {

		// Along the place's road first, then turning a little at each gate.
		let bearing = known ? place.heading : random() * 360;
		let [ lat, lon ] = [ place.lat, place.lon ];
		const points = [];
		for ( let i = 0; i < shape.gates; i ++ ) {

			if ( i ) bearing += ( random() * 2 - 1 ) * shape.turn;
			[ lat, lon ] = destination( world, lat, lon, bearing, between( shape.spacing, random ) );
			points.push( at( lat, lon ) );

		}

		return { start: start( place.lat, place.lon, known ? place.heading : bearingTo( world, place.lat, place.lon, ...points[ 0 ] ) ), points, radius: shape.radius };

	}

	if ( kind === 'collect' ) {

		// Anywhere in a disc round the place (as likely anywhere in it), apart from each other and
		// from the start; a little closer together if they won't fit.
		const points = [];
		let apart = shape.apart;
		let tries = 0;
		while ( points.length < shape.items ) {

			const [ lat, lon ] = destination( world, place.lat, place.lon, random() * 360, shape.within * Math.sqrt( random() ) );
			const clear = metresOn( world, place.lat, place.lon, lat, lon ) >= CLEAR_START && points.every( ( [ a, b ] ) => metresOn( world, a, b, lat, lon ) >= apart );
			if ( clear ) points.push( at( lat, lon ) );
			if ( ++ tries % 200 === 0 ) apart *= 0.8;

		}

		return { start: start( place.lat, place.lon, known ? place.heading : null ), points, radius: shape.radius };

	}

	// A landmark's drive: from a few kilometres back along the place's road (or, not knowing it, any
	// way).
	const back = known ? place.heading + 180 + ( random() * 2 - 1 ) * shape.spread : random() * 360;
	return landmarkFrom( world, place, shape, back, between( shape.distance, random ) );

}

// A hoop run at `place` (`shape` SHAPES' hoops): laid out in its style (hoopStyle, HOOP_STYLES) from
// the place, each hoop `up` m over the ground under it ([ lat, lon, up ], the page finding the ground
// on the heights it has), the last the finish. Trick hoops (route.tricks, their indices: never the
// first or the finish) stand high enough to loop under; orbs (route.orbs, [ lat, lon, up ]) beside
// legs spread along it, off the line to one side or the other.
function layHoops( world, place, shape, random ) {

	const style = hoopStyle( place );
	const { pattern, spacing, dives } = HOOP_STYLES[ style ];
	// (This world's feel on top: sharper or gentler, higher or lower.)
	const feel = HOOP_FEEL[ world ] ?? HOOP_FEEL.moon;
	const turn = HOOP_STYLES[ style ].turn.map( degrees => degrees * feel.turn );
	const up = feel.upRange ?? HOOP_STYLES[ style ].up.map( metres => metres * feel.up );
	const count = shape.hoops;
	let bearing = Number.isFinite( place.heading ) ? place.heading : random() * 360;
	const side = random() < 0.5 ? - 1 : 1;
	const loop = 360 / count;
	let [ lat, lon ] = [ place.lat, place.lon ];
	const spots = [];
	for ( let i = 0; i < count; i ++ ) {

		if ( i ) {

			const sharp = turn[ 0 ] + ( turn[ 1 ] - turn[ 0 ] ) * random();
			if ( pattern === 'weave' ) bearing += sharp * ( i % 2 ? side : - side );
			else if ( pattern === 'spiral' ) bearing += sharp * side;
			else if ( pattern === 'loop' ) bearing += ( loop + ( random() * 2 - 1 ) * loop * 0.15 ) * side;
			else bearing += sharp * ( random() < 0.5 ? - 1 : 1 );

		} else if ( pattern === 'loop' ) bearing += loop / 2 * side;

		[ lat, lon ] = destination( world, lat, lon, bearing, between( shape.spacing, random ) * spacing );
		let height = up[ 0 ] + ( up[ 1 ] - up[ 0 ] ) * random() ** 1.5;
		if ( dives && i % DIVE_EVERY === DIVE_EVERY - 1 ) height = DIVE_UP;
		spots.push( [ lat, lon, height ] );

	}

	// Trick hoops: spread along it, between the first and the finish.
	const tricks = [];
	for ( let k = 0; k < Math.min( shape.tricks, count - 2 ); k ++ ) {

		let index = 1 + Math.floor( ( k + 0.3 + random() * 0.4 ) * ( count - 2 ) / shape.tricks );
		while ( tricks.includes( index ) ) index = index % ( count - 2 ) + 1;
		tricks.push( index );
		spots[ index ][ 2 ] = Math.max( spots[ index ][ 2 ], TRICK_UP );

	}

	tricks.sort( ( a, b ) => a - b );
	// Orbs: beside legs spread along the run (from the start or a hoop to the next), off its line.
	const orbs = [];
	for ( let k = 0; k < shape.orbs; k ++ ) {

		const leg = Math.min( count - 1, Math.floor( ( k + 0.5 ) * count / shape.orbs ) );
		const [ aLat, aLon, aUp ] = leg ? spots[ leg - 1 ] : [ place.lat, place.lon, spots[ 0 ][ 2 ] ];
		const [ bLat, bLon, bUp ] = spots[ leg ];
		const along = bearingTo( world, aLat, aLon, bLat, bLon );
		const half = metresOn( world, aLat, aLon, bLat, bLon ) * ( 0.35 + random() * 0.3 );
		const [ mLat, mLon ] = destination( world, aLat, aLon, along, half );
		const [ oLat, oLon ] = destination( world, mLat, mLon, along + ( random() < 0.5 ? - 90 : 90 ), between( ORB_OFF, random ) );
		orbs.push( [ round( oLat ), round( oLon ), Math.round( ( aUp + bUp ) / 2 ) ] );

	}

	const points = spots.map( ( [ pLat, pLon, height ] ) => [ round( pLat ), round( pLon ), Math.round( height ) ] );
	return { start: start( place.lat, place.lon, bearingTo( world, place.lat, place.lon, points[ 0 ][ 0 ], points[ 0 ][ 1 ] ) ), points, radius: shape.radius, orbs, tricks, style };

}

// A drive to the landmark `place` from `distance` m off it on bearing `back` (degrees, from it),
// facing it.
function landmarkFrom( world, place, shape, back, distance ) {

	const [ lat, lon ] = destination( world, place.lat, place.lon, back % 360, distance );
	return { start: start( lat, lon, bearingTo( world, lat, lon, place.lat, place.lon ) ), points: [ [ round( place.lat ), round( place.lon ) ] ], radius: shape.radius, goal: place.name };

}

function start( lat, lon, heading ) {

	return { lat: round( lat ), lon: round( lon ), ...( Number.isFinite( heading ) ? { heading: Math.round( ( heading % 360 + 360 ) % 360 ) } : {} ) };

}

function round( degrees ) {

	return Math.round( degrees * 1e6 ) / 1e6;

}

// Where you'd be `metres` along the ground from ( lat, lon ) on `world`, setting off toward `bearing`
// (degrees from north): [ lat, lon ], on a sphere of the world's radius.
export function destination( world, lat, lon, bearing, metres ) {

	const rad = Math.PI / 180;
	const d = metres / RADIUS[ world ];
	const [ phi, lambda, theta ] = [ lat * rad, lon * rad, bearing * rad ];
	const to = Math.asin( Math.sin( phi ) * Math.cos( d ) + Math.cos( phi ) * Math.sin( d ) * Math.cos( theta ) );
	const across = lambda + Math.atan2( Math.sin( theta ) * Math.sin( d ) * Math.cos( phi ), Math.cos( d ) - Math.sin( phi ) * Math.sin( to ) );
	return [ to / rad, ( ( across / rad + 540 ) % 360 ) - 180 ];

}

// Which way (degrees from north) ( toLat, toLon ) is from ( lat, lon ).
export function bearingTo( world, lat, lon, toLat, toLon ) {

	const rad = Math.PI / 180;
	const y = Math.sin( ( toLon - lon ) * rad ) * Math.cos( toLat * rad );
	const x = Math.cos( lat * rad ) * Math.sin( toLat * rad ) - Math.sin( lat * rad ) * Math.cos( toLat * rad ) * Math.cos( ( toLon - lon ) * rad );
	return ( Math.atan2( y, x ) / rad + 360 ) % 360;

}

// How long the route is (m) as the crow flies, in its order (a sprint's gates, a landmark's goal;
// collectibles in the order they're listed, which is no particular one).
export function routeLength( world, route ) {

	let length = 0;
	let [ lat, lon ] = [ route.start.lat, route.start.lon ];
	for ( const [ toLat, toLon ] of route.points ) {

		length += metresOn( world, lat, lon, toLat, toLon );
		[ lat, lon ] = [ toLat, toLon ];

	}

	return length;

}

// --- checking a time ---

// A world whose ground lies deeper under its sphere than this share of its radius (worlds.js's
// `lowest`) has its legs measured on the sphere of that lowest ground (legMinimum): on Vesta (52 km
// under 263) and Ceres (29 under 470) a leg along a deep basin's floor or by a pole is a tenth or a
// twentieth shorter than metresOn's, more than LEG_SLACK on a sprint's leg. The Moon's and Mars's
// (under 1 %) are measured on their spheres as ever.
const DEEP = 0.01;
const LEG_SCALE = Object.fromEntries( WORLD_IDS.map( id => {

	const share = - ( WORLD_DATA[ id ].lowest ?? 0 ) / WORLD_DATA[ id ].radius;
	return [ id, share > DEEP ? 1 - share : 1 ];

} ) );

// The least time (ms) a leg can take: from within `fromRadius` of `from` ([ lat, lon ]) to within
// `toRadius` of `to`, along the ground at FASTEST (on the deepest ground the world has: LEG_SCALE).
export function legMinimum( world, from, fromRadius, to, toRadius, fastest = FASTEST ) {

	return Math.max( 0, metresOn( world, from[ 0 ], from[ 1 ], to[ 0 ], to[ 1 ] ) * ( LEG_SCALE[ world ] ?? 1 ) - fromRadius - toRadius ) / fastest * 1000;

}

// The least time (ms) a run with `passes` (checkPasses' kind, in the order passed) could take on
// `challenge`'s route ({ world, route }): each leg's legMinimum, added up. A time near it was driven
// as straight as the crow flies at the game's top speed, boosted all the way.
export function leastTime( { world, kind, route }, passes ) {

	let from = [ route.start.lat, route.start.lon ];
	let fromRadius = START_SLACK;
	let least = 0;
	const fastest = fastestFor( kind, world );
	for ( const [ index, , missed ] of passes ) {

		// (A hoop missed: wherever the plane was, so the next leg's from the last one hit; its penalty
		// is time it didn't fly.)
		if ( missed ) {

			least += HOOP_MISS;
			continue;

		}

		least += legMinimum( world, from, fromRadius, route.points[ index ], route.radius, fastest );
		from = route.points[ index ];
		fromRadius = route.radius;

	}

	return Math.floor( least );

}

// Whether a run of `ms` with `passes` ([ [ index, ms ] ]: each point's index in route.points and the
// run's time when it was passed, in the order passed) could have been driven on `challenge`'s route
// ({ world, kind, route }): every point once (a sprint's gates and a landmark's goal in their order,
// collectibles in any), times that never go back, each leg no quicker than legMinimum allows (less
// LEG_SLACK), the first from within START_SLACK of the start, and the run's time the last pass.
export function checkPasses( { world, kind, route }, ms, passes ) {

	const count = route.points.length;
	if ( ! Number.isSafeInteger( ms ) || ms <= 0 || ms > MAX_RUN || ! Array.isArray( passes ) || passes.length !== count ) return false;
	const hoops = kind === 'hoops';
	const fastest = fastestFor( kind, world );
	const seen = new Set();
	let from = [ route.start.lat, route.start.lon ];
	let fromRadius = START_SLACK;
	let fromAt = 0;
	let last = 0;
	for ( let i = 0; i < count; i ++ ) {

		const pass = passes[ i ];
		// A hoop run's missed hoop is [ index, ms, 1 ] (never its finish), its time at least HOOP_MISS
		// after the pass before (the penalty went on the clock as it was missed).
		const missed = hoops && Array.isArray( pass ) && pass.length === 3 && pass[ 2 ] === 1;
		if ( ! Array.isArray( pass ) || ( pass.length !== 2 && ! missed ) || ( missed && i === count - 1 ) ) return false;
		const [ index, at ] = pass;
		if ( ! Number.isInteger( index ) || index < 0 || index >= count || seen.has( index ) || ( kind !== 'collect' && index !== i ) ) return false;
		if ( ! Number.isSafeInteger( at ) || at < last || at > ms ) return false;
		seen.add( index );
		if ( missed ) {

			// (Wherever the plane was: the next leg is from the last hoop hit, with all the time since.)
			if ( at - last < HOOP_MISS - 1 ) return false;
			last = at;
			continue;

		}

		const point = route.points[ index ];
		if ( at - fromAt < legMinimum( world, from, fromRadius, point, route.radius, fastest ) - LEG_SLACK ) return false;
		from = point;
		fromRadius = route.radius;
		fromAt = last = at;

	}

	return last === ms;

}

// --- words ---

// A time as the boards show it: "0:42.37", "12:04.90", "1:02:03.40".
export function formatTime( ms ) {

	const hundredths = Math.floor( ms / 10 );
	const seconds = Math.floor( hundredths / 100 );
	const fraction = String( hundredths % 100 ).padStart( 2, '0' );
	const minutes = Math.floor( seconds / 60 );
	const hours = Math.floor( minutes / 60 );
	const ss = String( seconds % 60 ).padStart( 2, '0' );
	return hours ? `${ hours }:${ String( minutes % 60 ).padStart( 2, '0' ) }:${ ss }.${ fraction }` : `${ minutes }:${ ss }.${ fraction }`;

}

// A place on a board as the page shows it: past RANK_MOST rows ahead, "1000+".
export function rankText( rank ) {

	return rank > RANK_MOST ? `${ RANK_MOST }+` : String( rank );

}

// How long is left (ms) as the list says it: "2 d 5 h left", "5 h 12 m left", "12 m 30 s left",
// "45 s left".
export function timeLeft( ms ) {

	const seconds = Math.max( 0, Math.floor( ms / 1000 ) );
	const [ days, hours, minutes ] = [ Math.floor( seconds / 86400 ), Math.floor( seconds / 3600 ) % 24, Math.floor( seconds / 60 ) % 60 ];
	if ( days ) return `${ days } d ${ hours } h left`;
	if ( hours ) return `${ hours } h ${ minutes } m left`;
	if ( minutes ) return `${ minutes } m ${ seconds % 60 } s left`;
	return `${ seconds } s left`;

}

// What a challenge is, in a few words: "6 gates · 1.5 km", "6 stars · 260 m round", "To Tycho
// crater · 2.1 km".
export function describe( { world, kind, route } ) {

	const km = metres => metres >= 1000 ? `${ ( metres / 1000 ).toFixed( 1 ) } km` : `${ Math.round( metres / 10 ) * 10 } m`;
	if ( kind === 'sprint' ) return `${ route.points.length } gates · ${ km( routeLength( world, route ) ) }`;
	if ( kind === 'hoops' ) {

		const orbs = route.orbs?.length ?? 0;
		const tricks = route.tricks?.length ?? 0;
		return [ `${ route.points.length } hoops`, km( routeLength( world, route ) ), ...orbs ? [ `${ orbs } boost orbs` ] : [], ...tricks ? [ `${ tricks } trick hoop${ tricks === 1 ? '' : 's' }` ] : [] ].join( ' · ' );

	}
	if ( kind === 'collect' ) {

		const reach = Math.max( ...route.points.map( ( [ lat, lon ] ) => metresOn( world, route.start.lat, route.start.lon, lat, lon ) ) );
		return `${ route.points.length } stars · ${ km( reach ) } round`;

	}

	return `To ${ route.goal } · ${ km( routeLength( world, route ) ) }`;

}
