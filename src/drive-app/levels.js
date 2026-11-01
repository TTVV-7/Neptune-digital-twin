// Levels (docs/world-drive.md, "Levels"): what XP is earned for, the 50 levels it climbs, and what
// each level unlocks. Plain data and small functions, with nothing from three.js or the browser,
// so the Worker imports it too (worker/drive/progress.js), as it does catalog.js and
// live-protocol.js: the page shows what the Worker counts, by the same rules.
//
// XP comes from driving (each km, on the ground or flying), air time off jumps, drift boosts paid
// out, boost pads, minutes driving with others, the first drive in each area (live-protocol.js's
// cellOf) and at each start spot (places.js's SPOTS), the day's first drive (more for days in a
// row), and landed trick runs (each run as drive.js scores it). The page reports what it drove
// (POST /api/progress, a REPORT); the Worker caps each amount by the time since the player's last
// report (CAPS), works out the XP and keeps it with the leaderboard player. A supporter's XP counts
// SUPPORTER_XP times.
//
// The unlock track: about half of the Supporter Pass's Garage looks come with levels on the way to
// 40 (the pass still gives them all at once), and some rewards come only with levels, supporters
// included: titles for the nametag, the level badge's frame, and four colours. The pass's nine
// rides are never on it.

import { cellOf, parseRoom } from './live-protocol.js';
import { SPOTS } from './places.js';

export const LEVEL_MAX = 50;

// --- what XP is earned for ------------------------------------------------------------------

// Driving is the game, so its km earn the most of the steady sources: a kart flat out (110 km/h)
// makes about 37 XP a minute, a car about 50; a new area is worth a few minutes of driving, not
// more, so hopping between drop-ins doesn't beat driving by much.
export const XP = {
	km: 20, // each km driven, on the ground or flying
	air: 3, // each second in the air off a jump (not flying)
	drift: 8, // each drift boost paid out
	pad: 4, // each boost pad driven over
	together: 6, // each minute driving with others in your room
	area: 100, // the first drive in an area (about 11 km across)
	spot: 250, // each start spot, the first time
	daily: 100, // the day's first drive (UTC days)
	streak: 25, // and this much more for each day in a row before it...
	streakMax: 4, // ...counting at most this many: 200 at most, from the fifth day in a row
};
// The distances that make the first drive somewhere count: an area is discovered once you've driven
// DISCOVER_KM in it (a drop-in and a short hop aren't a drive), and the day's bonus comes once
// DAILY_KM has been driven that day.
export const DISCOVER_KM = 1;
export const DAILY_KM = 0.25;
// How near (m) a start spot you have to drive for it to count.
export const SPOT_RANGE = 300;
// Landed trick runs: TRICK.per XP for each square root of a run's points (the run's score, from
// dropping in until you change ride or place), so a run's later points count for less, and at
// most TRICK.max for a run however big its combos.
export const TRICK = { per: 0.5, max: 300 };
// What a supporter's XP counts for (the Worker's to say, from the pass of the account the player
// is linked to).
export const SUPPORTER_XP = 1.5;

// --- the caps -------------------------------------------------------------------------------

// What one report can carry, by the real time since the player's last: window, the most time (s)
// one report counts (a report every couple of minutes is the page's way); claim, the time (s) a
// player's first report counts (what was driven before picking a nickname, kept in the browser and
// claimed with it: an hour of these caps is several hours of real driving); kmh, faster than any
// ride goes flat out with the booster, flying or not (the night cruiser's 205 km/h doubled); air,
// seconds of air a second; drifts and pads, the most a second; rate, the most XP a minute from the
// continuous sources (km, air, drift boosts, pads, minutes together) all at once, which no driving
// comes near; places, new areas and spots a minute (whole ones: a report that comes sooner carries
// none, and they wait for the next); tricks, XP a minute from landed trick runs; gap, the least
// time (s) between two reports with anything in them (each is a row written: one sooner is turned
// away, and the page sends it later).
export const CAPS = {
	window: 5 * 60,
	claim: 60 * 60,
	kmh: 450,
	air: 1,
	drifts: 1 / 1.5,
	pads: 1 / 2,
	rate: 300,
	places: 1,
	tricks: 150,
	gap: 30,
};
// The most discoveries (areas and spots) kept for a player; the most places one report may list.
export const DISCOVERIES_MAX = 2000;
export const REPORT_PLACES = 200;
// A claim carries the days' bonuses this browser counted before the nickname (a REPORT's days), at
// most CLAIM_DAYS days' worth of the biggest bonus.
export const CLAIM_DAYS = 14;

// --- the curve ------------------------------------------------------------------------------

// XP to go from `level` to the next: quick at first (level 2 in a few minutes, 5 in a first
// session), then longer and longer, rounded to tidy numbers.
function step( level ) {

	const n = level;
	const raw = 100 + 100 * n + 0.9 * n ** 2.5;
	const to = n < 10 ? 50 : 100;
	return Math.round( raw / to ) * to;

}

// LEVEL_XP[ n ]: the XP that reaches level n (LEVEL_XP[ 1 ] is 0). Index 0 is unused.
export const LEVEL_XP = [ 0, 0 ];
for ( let n = 2; n <= LEVEL_MAX; n ++ ) LEVEL_XP[ n ] = LEVEL_XP[ n - 1 ] + step( n - 1 );

export function levelOf( xp ) {

	const total = Number.isFinite( xp ) && xp > 0 ? xp : 0;
	let level = 1;
	while ( level < LEVEL_MAX && total >= LEVEL_XP[ level + 1 ] ) level ++;
	return level;

}

// Where `xp` is on the way to the next level: { level, xp, floor (this level's XP), next (the next
// level's, or null at the top), into, span (XP from this level to the next, 0 at the top),
// fraction (0 to 1) }.
export function progressOf( xp ) {

	const total = Number.isFinite( xp ) && xp > 0 ? Math.floor( xp ) : 0;
	const level = levelOf( total );
	const floor = LEVEL_XP[ level ];
	const next = level < LEVEL_MAX ? LEVEL_XP[ level + 1 ] : null;
	const span = next === null ? 0 : next - floor;
	return { level, xp: total, floor, next, into: total - floor, span, fraction: next === null ? 1 : ( total - floor ) / span };

}

// --- the unlock track -----------------------------------------------------------------------

// Each reward: { level, kind, id, name, ... }. kind 'look' is a Garage choice (part and id as in
// paint.js and boosts.js), with pass: true when the Supporter Pass gives it too (the pass's looks
// on the track) and pass: false when only the level does (the level-only colours, in paint.js's
// SWATCHES with levelOnly); 'title' a title for your nametag; 'badge' the level badge's frame.
// Every level from 2 to 50 has something.
const look = ( level, part, id, name, pass = true ) => ( { level, kind: 'look', part, id, name, pass } );
const title = ( level, id, name ) => ( { level, kind: 'title', id, name } );
const badge = ( level, id, name ) => ( { level, kind: 'badge', id, name } );

export const REWARDS = [
	title( 1, 'rookie', 'Rookie' ),
	badge( 1, 'steel', 'Steel badge' ),
	look( 2, 'colour', 'sunburst', 'Sunburst paint' ),
	look( 3, 'boost', 'hearts', 'Hearts boost' ),
	title( 4, 'joyrider', 'Joyrider' ),
	look( 5, 'colour', 'lime', 'Lime paint' ),
	look( 6, 'rim', 'white', 'White rims' ),
	look( 7, 'boost', 'plasma', 'Plasma boost' ),
	title( 8, 'drifter', 'Drifter' ),
	look( 9, 'decal', 'stripes', 'Racing stripes' ),
	badge( 10, 'bronze', 'Bronze badge' ),
	look( 11, 'colour', 'teal', 'Teal paint' ),
	title( 12, 'street-racer', 'Street Racer' ),
	look( 13, 'boost', 'pixel', 'Pixel boost' ),
	look( 14, 'flame', 'blue', 'Blue flame' ),
	title( 15, 'stunt-ace', 'Stunt Ace' ),
	look( 16, 'trail', 'smoke', 'Smoke trail' ),
	title( 17, 'speedster', 'Speedster' ),
	look( 18, 'colour', 'electric', 'Electric blue paint' ),
	title( 19, 'trickster', 'Trickster' ),
	badge( 20, 'silver', 'Silver badge' ),
	look( 21, 'rim', 'red', 'Red rims' ),
	title( 22, 'explorer', 'Explorer' ),
	look( 23, 'boost', 'glitter', 'Glitter boost' ),
	title( 24, 'globetrotter', 'Globetrotter' ),
	look( 25, 'colour', 'copper', 'Copper paint', false ),
	look( 26, 'decal', 'number', 'Number decal' ),
	title( 27, 'road-warrior', 'Road Warrior' ),
	look( 28, 'flame', 'green', 'Green flame' ),
	title( 29, 'sky-pilot', 'Sky Pilot' ),
	badge( 30, 'gold', 'Gold badge' ),
	look( 31, 'finish', 'matte', 'Matte finish' ),
	title( 32, 'daredevil', 'Daredevil' ),
	title( 33, 'trailblazer', 'Trailblazer' ),
	look( 34, 'colour', 'violet', 'Violet paint' ),
	look( 35, 'colour', 'mint', 'Mint paint', false ),
	title( 36, 'pathfinder', 'Pathfinder' ),
	look( 37, 'rim', 'blue', 'Blue rims' ),
	title( 38, 'storm-chaser', 'Storm Chaser' ),
	title( 39, 'high-flyer', 'High Flyer' ),
	badge( 40, 'platinum', 'Platinum badge' ),
	look( 40, 'flame', 'purple', 'Purple flame' ),
	title( 41, 'thrill-seeker', 'Thrill Seeker' ),
	title( 42, 'wheel-wizard', 'Wheel Wizard' ),
	title( 43, 'night-owl', 'Night Owl' ),
	title( 44, 'road-captain', 'Road Captain' ),
	look( 45, 'colour', 'plum', 'Plum paint', false ),
	title( 46, 'cartographer', 'Cartographer' ),
	title( 47, 'supersonic', 'Supersonic' ),
	title( 48, 'world-tourer', 'World Tourer' ),
	title( 49, 'icon', 'Icon' ),
	title( 50, 'legend', 'Legend' ),
	badge( 50, 'legend', 'Legend badge' ),
	look( 50, 'colour', 'champion', 'Champion gold paint', false ),
];

export const TITLES = REWARDS.filter( reward => reward.kind === 'title' );
export const BADGES = REWARDS.filter( reward => reward.kind === 'badge' );

// What reaching `level` gives.
export function rewardsAt( level ) {

	return REWARDS.filter( reward => reward.level === level );

}

// What going from level `from` up to `to` gives: the levels after `from`, up to and including `to`.
export function rewardsBetween( from, to ) {

	return REWARDS.filter( reward => reward.level > from && reward.level <= to );

}

// The level that unlocks a Garage choice, or null when none does (a free one, or the pass's
// alone). A colour unlocked is a smoke colour too.
export function unlockLevel( part, id ) {

	const as = part === 'smoke' ? 'colour' : part;
	return REWARDS.find( reward => reward.kind === 'look' && reward.part === as && reward.id === id )?.level ?? null;

}

// Whether only levels give a Garage choice: the pass doesn't (the level-only colours).
export function levelOnly( part, id ) {

	const as = part === 'smoke' ? 'colour' : part;
	return REWARDS.some( reward => reward.kind === 'look' && reward.part === as && reward.id === id && ! reward.pass );

}

// The next reward after `level`, or null at the top. pro: for a supporter, whose pass has its looks
// already, the next that's new to them.
export function nextReward( level, { pro = false } = {} ) {

	return REWARDS.find( reward => reward.level > level && ! ( pro && reward.kind === 'look' && reward.pass ) ) ?? null;

}

// The title shown for a player at `level`: the one they picked (an id in TITLES, '' for none) if
// it's theirs at that level, else the newest they have.
export function titleOf( level, chosen = '' ) {

	const mine = TITLES.filter( reward => reward.level <= level );
	return mine.find( reward => reward.id === chosen ) ?? mine[ mine.length - 1 ];

}

// "Lv 12 · Drifter": a level, and the title its player picked (or the newest they have), as
// nametags and the leaderboard show them.
export function levelLine( level, title = '' ) {

	return `Lv ${ level } · ${ titleOf( level, title ?? '' ).name }`;

}

// Whether a title (an id) is unlocked at `level`.
export function titleUnlocked( id, level ) {

	return TITLES.some( reward => reward.id === id && reward.level <= level );

}

// The level badge's frame at `level`: { id, name, level } (the newest badge reward).
export function badgeOf( level ) {

	return BADGES.filter( reward => reward.level <= level ).pop();

}

// --- reports --------------------------------------------------------------------------------

// What the page reports with POST /api/progress, all since its last report: km driven, seconds in
// the air, drift boosts paid out, boost pads, minutes driving with others, the trick XP of the runs
// landed (trickXp, what each run's new points add), areas (cellOf's names) and spots (SPOTS' ids)
// first driven, and whether it's the day's first drive. Two more, that emptyReport leaves out: id,
// the page's own for the report (REPORT_ID), so one sent again whose answer never came is counted
// once; and only in a claim, days: { xp, streak, day }, the days' bonuses counted in this browser
// before the nickname (their XP together, and the streak they made, as of `day`).
export const REPORT_FIELDS = [ 'km', 'air', 'drifts', 'pads', 'together', 'tricks' ];
export const REPORT_ID = /^[\w-]{8,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function emptyReport() {

	return { km: 0, air: 0, drifts: 0, pads: 0, together: 0, tricks: 0, areas: [], spots: [], daily: false };

}

const SPOT_IDS = new Set( SPOTS.map( spot => spot.id ) );

// An area's name as cellOf gives it ('near:1277.1088'), or null.
export function checkArea( text ) {

	const room = parseRoom( text );
	return room?.kind === 'near' && room.shard === 0 && room.cell === text ? text : null;

}

// A report as sent, if it's one the page could send, else null: every amount a number of 0 or
// more (counts whole), places listed once, at most REPORT_PLACES of them, and id and days as said.
export function checkReport( raw ) {

	if ( ! raw || typeof raw !== 'object' || Array.isArray( raw ) ) return null;
	const report = emptyReport();
	for ( const field of REPORT_FIELDS ) {

		const value = raw[ field ] ?? 0;
		if ( typeof value !== 'number' || ! Number.isFinite( value ) || value < 0 || value > 1e7 ) return null;
		report[ field ] = value;

	}

	if ( ! Number.isInteger( report.drifts ) || ! Number.isInteger( report.pads ) ) return null;
	for ( const [ field, check ] of [ [ 'areas', checkArea ], [ 'spots', id => SPOT_IDS.has( id ) ? id : null ] ] ) {

		const list = raw[ field ] ?? [];
		if ( ! Array.isArray( list ) || list.length > REPORT_PLACES ) return null;
		for ( const item of list ) if ( typeof item !== 'string' || ! check( item ) ) return null;
		report[ field ] = [ ...new Set( list ) ];

	}

	if ( raw.daily !== undefined && typeof raw.daily !== 'boolean' ) return null;
	report.daily = raw.daily === true;
	if ( raw.id !== undefined ) {

		if ( typeof raw.id !== 'string' || ! REPORT_ID.test( raw.id ) ) return null;
		report.id = raw.id;

	}

	if ( raw.days !== undefined ) {

		const { xp, streak, day } = raw.days ?? {};
		if ( typeof xp !== 'number' || ! Number.isFinite( xp ) || xp < 0 || xp > 1e7 ) return null;
		if ( ! Number.isInteger( streak ) || streak < 0 || streak > 1e4 ) return null;
		if ( typeof day !== 'string' || ( day && ! DAY.test( day ) ) ) return null;
		report.days = { xp, streak, day };

	}

	return report;

}

// Whether a report has nothing in it (how the page asks where it stands).
export function isEmptyReport( report ) {

	return ! report.daily && ! report.areas.length && ! report.spots.length && ! ( report.days?.xp > 0 ) && REPORT_FIELDS.every( field => ! ( report[ field ] > 0 ) );

}

// `report` capped by `seconds` of real time: each amount to the most that time allows, the
// places to the first that many (the rest wait for the next report). Returns a new report.
export function capReport( report, seconds ) {

	const t = Math.max( 0, seconds );
	const places = Math.floor( t / 60 * CAPS.places );
	const spots = Math.min( report.spots.length, places );
	return {
		km: Math.min( report.km, t * CAPS.kmh / 3600 ),
		air: Math.min( report.air, t * CAPS.air ),
		drifts: Math.min( report.drifts, Math.floor( t * CAPS.drifts ) ),
		pads: Math.min( report.pads, Math.floor( t * CAPS.pads ) ),
		together: Math.min( report.together, t / 60 ),
		tricks: Math.min( report.tricks, t / 60 * CAPS.tricks ),
		spots: report.spots.slice( 0, spots ),
		areas: report.areas.slice( 0, Math.max( 0, places - spots ) ),
		daily: report.daily,
	};

}

// The XP of a report's driving (km, air, drift boosts, pads, minutes together), no more than
// CAPS.rate a minute of `seconds` when that's given.
export function drivingXp( report, seconds = Infinity ) {

	const xp = report.km * XP.km + report.air * XP.air + report.drifts * XP.drift + report.pads * XP.pad + report.together * XP.together;
	return Math.min( xp, seconds / 60 * CAPS.rate );

}

// The day's bonus for the `streak`th day in a row (1 for the first).
export function dailyXp( streak ) {

	return XP.daily + XP.streak * Math.min( Math.max( 0, streak - 1 ), XP.streakMax );

}

// The XP a trick run's score is worth, whole.
export function trickXp( score ) {

	return Number.isFinite( score ) && score > 0 ? Math.min( TRICK.max, Math.round( TRICK.per * Math.sqrt( score ) ) ) : 0;

}

// The area a spot (degrees) is in, as reports name it.
export function areaOf( lat, lon ) {

	return cellOf( lat, lon );

}

// The start spot within SPOT_RANGE of ( lat, lon ), or null.
export function spotAt( lat, lon ) {

	const rad = Math.PI / 180;
	for ( const spot of SPOTS ) {

		const north = ( lat - spot.lat ) * 111320;
		const east = ( lon - spot.lon ) * 111320 * Math.cos( spot.lat * rad );
		if ( Math.hypot( north, east ) <= SPOT_RANGE ) return spot;

	}

	return null;

}

// The UTC day (2026-11-01) of a time (ms), and the day before it, as the daily bonus counts days.
export function dayOf( time ) {

	return new Date( time ).toISOString().slice( 0, 10 );

}

export function dayBefore( day ) {

	return dayOf( Date.parse( `${ day }T12:00:00Z` ) - 24 * 60 * 60 * 1000 );

}
