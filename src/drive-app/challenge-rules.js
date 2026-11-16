import { metresOn, RADIUS } from './dropin-cells.js';

// Challenges (docs/world-drive.md, "Challenges"): a daily, a weekly and a monthly challenge on the
// Earth and on the Moon, six at once, each with its own board of the best times. What the page (the
// challenges' own chunk, challenges.js), the Worker (worker/drive/challenges.js) and the tests share:
// the periods, the kinds, how a route is laid out from a period's random numbers, and the rules a
// time is checked against. Plain data and small functions, no three.js.
//
// A challenge is a place and a route, the same for everyone in its period: a checkpoint sprint
// (gates in order, timed from the start to the last), collectibles (every item round the place, in
// any order) or a drive to a landmark (from a start a few kilometres off to a named place). The
// Worker lays the route out once, the first time the period's challenge is asked for, and keeps it
// in D1, so nothing here changing later changes a live challenge: its points are latitudes and
// longitudes, and only their heights are found by the page, on the ground it actually has.

export const WORLDS = [ 'earth', 'moon' ];
export const PERIOD_KINDS = [ 'day', 'week', 'month' ];
export const KINDS = [ 'sprint', 'collect', 'landmark' ];
export const PERIOD_NAMES = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
export const KIND_NAMES = { sprint: 'Checkpoint sprint', collect: 'Collect them all', landmark: 'Drive to a landmark' };

// The fastest anything in the game goes along the ground (m/s), which no leg of a route can be
// driven faster than: the fastest ride's top speed, the hypercar's 215 km/h (src/drive-app/cars.js),
// times the booster's, which pushes up to twice a ride's top speed (BOOST_SPEED in src/drive.js).
// Nothing beats that: a drift's mini-turbo is at most 1.5 times the top speed and a landed trick's
// burst 1.25 times (DRIFT_BOOSTS, TRICK_BOOST), a boost pad only fills the booster, flying goes at
// the ride's own speed, a hit keeps 85 % of the speed along the wall, R stops the car 4 m on, and
// going downhill or falling adds nothing along the ground (drive.js keeps upward speed apart). So
// 430 km/h, 119.4 m/s; scripts/test-drive-worker.mjs reads those numbers from the game's own files
// and fails if any of them changes.
export const TOP_SPEED = 215;
export const BOOSTED = 2;
export const FASTEST = TOP_SPEED * BOOSTED / 3.6;
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
// beside a tower and the tower's roof, or the water under a bridge and its deck; on the Moon both
// its one height) and this many times its radius beyond them: so a gate is passed on the street,
// on the roof or deck over it, or flying low over it, and one whose ground hasn't loaded yet across
// the ground alone. (challenges.js.)
export const TALL = 2;

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
// legs, sharper turns, bigger radii.
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
// The kinds a period's challenge is picked from, with how likely each is: a daily one is mostly a
// sprint or a hunt for items (a landmark's drive is the longest of the three), the others any.
export const KIND_ODDS = {
	day: [ [ 'sprint', 0.4 ], [ 'collect', 0.4 ], [ 'landmark', 0.2 ] ],
	week: [ [ 'sprint', 1 / 3 ], [ 'collect', 1 / 3 ], [ 'landmark', 1 / 3 ] ],
	month: [ [ 'sprint', 1 / 3 ], [ 'collect', 1 / 3 ], [ 'landmark', 1 / 3 ] ],
};
// Items are kept at least this far (m) from where the run starts, and a route laid out at most TRIES
// times when a check (the Moon's ground, below) finds it wanting: the one with fewest faults is kept.
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

// The day's, the week's and the month's periods at `now`.
export function periodsAt( now ) {

	return PERIOD_KINDS.map( kind => periodOf( kind, now ) );

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
export function kindFor( periodKind, u ) {

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
// enough )`, if given, says how many faults a route has (the Moon's ground too steep at its points or
// along its legs: worker/drive/challenges.js), or that it has `enough` at least (the fewest so far: it
// may stop counting there); then up to TRIES are laid out and the one with fewest kept.
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

// The least time (ms) a leg can take: from within `fromRadius` of `from` ([ lat, lon ]) to within
// `toRadius` of `to`, along the ground at FASTEST.
export function legMinimum( world, from, fromRadius, to, toRadius ) {

	return Math.max( 0, metresOn( world, from[ 0 ], from[ 1 ], to[ 0 ], to[ 1 ] ) - fromRadius - toRadius ) / FASTEST * 1000;

}

// Whether a run of `ms` with `passes` ([ [ index, ms ] ]: each point's index in route.points and the
// run's time when it was passed, in the order passed) could have been driven on `challenge`'s route
// ({ world, kind, route }): every point once (a sprint's gates and a landmark's goal in their order,
// collectibles in any), times that never go back, each leg no quicker than legMinimum allows (less
// LEG_SLACK), the first from within START_SLACK of the start, and the run's time the last pass.
export function checkPasses( { world, kind, route }, ms, passes ) {

	const count = route.points.length;
	if ( ! Number.isSafeInteger( ms ) || ms <= 0 || ms > MAX_RUN || ! Array.isArray( passes ) || passes.length !== count ) return false;
	const seen = new Set();
	let from = [ route.start.lat, route.start.lon ];
	let fromRadius = START_SLACK;
	let last = 0;
	for ( let i = 0; i < count; i ++ ) {

		const pass = passes[ i ];
		if ( ! Array.isArray( pass ) || pass.length !== 2 ) return false;
		const [ index, at ] = pass;
		if ( ! Number.isInteger( index ) || index < 0 || index >= count || seen.has( index ) || ( kind !== 'collect' && index !== i ) ) return false;
		if ( ! Number.isSafeInteger( at ) || at < last || at > ms ) return false;
		const point = route.points[ index ];
		if ( at - last < legMinimum( world, from, fromRadius, point, route.radius ) - LEG_SLACK ) return false;
		seen.add( index );
		from = point;
		fromRadius = route.radius;
		last = at;

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
	if ( kind === 'collect' ) {

		const reach = Math.max( ...route.points.map( ( [ lat, lon ] ) => metresOn( world, route.start.lat, route.start.lon, lat, lon ) ) );
		return `${ route.points.length } stars · ${ km( reach ) } round`;

	}

	return `To ${ route.goal } · ${ km( routeLength( world, route ) ) }`;

}
