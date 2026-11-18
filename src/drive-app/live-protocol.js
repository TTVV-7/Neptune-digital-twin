// Driving with others (docs/world-drive.md): what the page (live.js, ghosts.js) and the Worker's
// rooms (worker/drive/live.js) say to each other over a WebSocket, and the limits both keep to; and
// at the end, the dots of who's driving now that the rooms report and the globe shows (online.js).
// Plain data and small functions, with nothing from three.js or the browser, so the Worker
// imports it too.
//
// A room is one Durable Object: a party (party:CODE, the friends who opened its link) or the
// drivers in one area (near:BAND.COL, about 11 km across, with up to NEARBY_SHARDS of it when one
// is full). A page is in one room at a time. Everyone is a ghost: cars pass through each other.
//
// The page connects to /api/live?room=<room> with the subprotocols [ PROTOCOL, <visit token> ]
// (the token /api/visit handed out: a browser can't set headers on a WebSocket, and a token in the
// address would end up in logs), from worlddrive.app itself (its Origin). The Worker checks both
// before the room is touched, and the room answers with PROTOCOL.
//
// Positions are Earth-centred (ECEF, metres) and orientations a quaternion in that same frame, so
// two pages centred on different places (each recentres the scene where it dropped in) agree on
// where a car is: each turns them into its own scene with the tiles' (or test globe's) matrixWorld.
// On the Moon they're Moon-centred instead, in the Moon's own frame (moon.js: Z through its north
// pole, X through 0° N 0° E, a sphere of MOON_RADIUS), and the page turns them into its scene with
// the Moon's group's matrixWorld. Which world a driver is on goes with where they dropped in
// (PLACE's world), and the Moon's areas are rooms of their own (moon:BAND.COL), so a Moon driver
// only ever shares an area's room with Moon drivers; a party has both.
//
// Versions: a page from before the Moon had drivers speaks PROTOCOL (v1) and offers
// [ PROTOCOL, token ]; a page since speaks PROTOCOL_WORLDS (v2) and offers [ PROTOCOL_WORLDS,
// PROTOCOL, token ], so a room still running the old code (for a few minutes after a deploy) can
// answer it with v1, and the page then stays alone on the Moon as an old page does. A room tells a
// v1 page nothing of the Moon: a Moon driver in its party is on the globe to it, with no place,
// car, trick or honk (see worker/drive/live.js's seenBy); and a v1 page is never let into one of
// the Moon's areas.

import { DRIVE_CARS, LIBRARY_VEHICLES, PASS_RIDES, WORKS_RIDES } from './catalog.js';

export const PROTOCOL = 'worlddrive-live.v1';
export const PROTOCOL_WORLDS = 'worlddrive-live.v2';

// The worlds there are, as places and rooms name them ('moon' is moon-places.js's MOON).
export const EARTH = 'earth';
export const MOON_WORLD = 'moon';
// The Moon's radius (m), as moon-height.js's MOON_RADIUS: its frame's sphere.
export const MOON_RADIUS = 1737400;

// --- rooms ---------------------------------------------------------------------------------------

// Party codes: 7 of these (no I, O, 0 or 1 to misread), 32^7 ≈ 3.4e10 of them.
export const PARTY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PARTY_CODE_LENGTH = 7;
const PARTY_CODE = new RegExp( `^[${ PARTY_ALPHABET }]{${ PARTY_CODE_LENGTH }}$` );
// The most in a room at once; a nearby area that's full has up to NEARBY_SHARDS rooms (#0 to #3).
export const PARTY_MAX = 8;
export const NEARBY_MAX = 20;
export const NEARBY_SHARDS = 4;
// Nearby areas: bands CELL_DEG of latitude tall, cut into columns about as wide: on the Earth 0.1°
// (11.1 km), and on the Moon MOON_CELL_DEG, which is as many kilometres on its smaller sphere (0.36°
// of 1,737.4 km is 10.9 km), so a Moon area is the size of an Earth one. Each world's areas are
// named by a prefix of their own: near:BAND.COL on the Earth, moon:BAND.COL on the Moon.
export const CELL_DEG = 0.1;
export const MOON_CELL_DEG = 0.36;
const GRIDS = {
	[ EARTH ]: { prefix: 'near', deg: CELL_DEG, bands: Math.round( 180 / CELL_DEG ) },
	[ MOON_WORLD ]: { prefix: 'moon', deg: MOON_CELL_DEG, bands: Math.round( 180 / MOON_CELL_DEG ) },
};
const NEAR = /^(near|moon):(\d{1,4})\.(\d{1,5})(?:#(\d))?$/;
const PARTY = /^party:([A-Z0-9]+)$/;
// Which world each prefix is.
const WORLD_OF = { near: EARTH, moon: MOON_WORLD };

// A new party code from `random`, a function filling a Uint8Array and returning it: bytes =>
// crypto.getRandomValues( bytes ) (passed bare, getRandomValues has lost its crypto and throws).
export function makePartyCode( random ) {

	const bytes = random( new Uint8Array( PARTY_CODE_LENGTH ) );
	return [ ...bytes ].map( b => PARTY_ALPHABET[ b % PARTY_ALPHABET.length ] ).join( '' );

}

// A code as typed or pasted (any case, spaces round it), or null if it isn't one.
export function cleanPartyCode( text ) {

	const code = typeof text === 'string' ? text.trim().toUpperCase() : '';
	return PARTY_CODE.test( code ) ? code : null;

}

// The width (degrees of longitude) of the columns in a band of a world's grid.
function columnDeg( band, grid = GRIDS[ EARTH ] ) {

	const middle = ( band + 0.5 ) * grid.deg - 90;
	return grid.deg / Math.max( Math.cos( middle * Math.PI / 180 ), 0.05 );

}

function columns( band, grid = GRIDS[ EARTH ] ) {

	return Math.ceil( 360 / columnDeg( band, grid ) );

}

// The nearby room for a spot (degrees) on `world` (the Earth unless it's 'moon'), shard 0: e.g.
// 'near:1277.1088', or on the Moon 'moon:126.330'.
export function cellOf( lat, lon, world = EARTH ) {

	const grid = GRIDS[ world === MOON_WORLD ? MOON_WORLD : EARTH ];
	const band = Math.min( grid.bands - 1, Math.max( 0, Math.floor( ( lat + 90 ) / grid.deg ) ) );
	const wrapped = ( ( lon + 180 ) % 360 + 360 ) % 360;
	const col = Math.min( columns( band, grid ) - 1, Math.floor( wrapped / columnDeg( band, grid ) ) );
	return `${ grid.prefix }:${ band }.${ col }`;

}

// Which world an area's room (any shard) is on: 'earth' or 'moon'; null for anything else.
export function worldOfRoom( room ) {

	return typeof room === 'string' ? WORLD_OF[ room.slice( 0, room.indexOf( ':' ) ) ] ?? null : null;

}

// Another shard of the same area: 'near:1277.1088#2'.
export function shardOf( room, shard ) {

	return `${ room.split( '#' )[ 0 ]}#${ shard }`;

}

// The edges (degrees) of an area, shard 0's name: { south, north, west, east }. The last column of a
// band stops at 180°.
export function boundsOf( cell ) {

	const grid = GRIDS[ worldOfRoom( cell ) ?? EARTH ];
	const [ band, col ] = cell.slice( cell.indexOf( ':' ) + 1 ).split( '#' )[ 0 ].split( '.' ).map( Number );
	const width = columnDeg( band, grid );
	const west = col * width - 180;
	return { south: band * grid.deg - 90, north: ( band + 1 ) * grid.deg - 90, west, east: Math.min( 180, west + width ) };

}

// { kind: 'party', code, max, world: null } or { kind: 'near', world, cell, shard, max } for a
// room's name (world: 'earth' for near:..., 'moon' for moon:...), or null for anything that isn't
// one.
export function parseRoom( text ) {

	if ( typeof text !== 'string' || text.length > 40 ) return null;
	const party = text.match( PARTY );
	if ( party ) return PARTY_CODE.test( party[ 1 ] ) ? { kind: 'party', code: party[ 1 ], max: PARTY_MAX, world: null } : null;
	const near = text.match( NEAR );
	if ( ! near ) return null;
	const world = WORLD_OF[ near[ 1 ] ];
	const grid = GRIDS[ world ];
	const band = Number( near[ 2 ] );
	const col = Number( near[ 3 ] );
	const shard = near[ 4 ] === undefined ? 0 : Number( near[ 4 ] );
	if ( band >= grid.bands || col >= columns( band, grid ) || shard >= NEARBY_SHARDS ) return null;
	return { kind: 'near', world, cell: `${ grid.prefix }:${ band }.${ col }`, shard, max: NEARBY_MAX };

}

// --- timing and limits ---------------------------------------------------------------------------

// The page sends its car SEND_HZ times a second while it moves, STILL_HZ while it sits still (once
// more at SEND_HZ as it stops, so where it stopped isn't held back), and straight away when its
// flags change. But none at all while nobody else who has said hello is in its room: a state is
// only for the others, and each one the room is sent is billed (see worker/drive/live.js). It
// sends its car at once when someone comes (a join, or a welcome with others in it). The room
// sends everyone what's new at most every FLUSH_MS.
export const SEND_HZ = 5;
export const STILL_HZ = 0.5;
export const FLUSH_MS = 100;
// Other cars are drawn this far (ms) behind the latest word of them, so there's a position on each
// side of now to move between: words come 1000 / SEND_HZ ms apart (a frame more as they fall), and
// one the room held back comes with the next. A jump of more than TELEPORT m from one to the next
// is a jump (R, a new drop-in), not a drive. A car with no word for STALE_MS
// (seven still states running) is taken away.
export const INTERP_MS = 300;
export const TELEPORT = 60;
export const STALE_MS = 15000;
// In an area, a car only goes to those within VIEW_RANGE m of it.
export const VIEW_RANGE = 5000;
// The page sends PING every KEEPALIVE_MS while it has nothing else to say (or has heard nothing
// for that long), and the room answers PONG: itself, not as the runtime's auto-response, so it's
// counted and held to the rate as any message is. A connection with no word at all for IDLE_MS is
// closed, and a page that hears nothing back for a while after its PING takes it as dropped.
export const PING = 'ping';
export const PONG = 'pong';
export const KEEPALIVE_MS = 25000;
export const IDLE_MS = 75000;
// hello must come within HELLO_MS of connecting.
export const HELLO_MS = 10000;
// Each connection may send RATE messages a second on average, BURST at once; more closes it.
export const RATE = 20;
export const BURST = 40;
// The longest message (bytes, as sent): hello, then everything else.
export const MAX_HELLO = 1024;
export const MAX_MESSAGE = 512;
// Honks: one per HONK_GAP ms per driver (more are dropped).
export const HONK_GAP = 800;

// WebSocket close codes the room uses.
export const CLOSE = {
	protocol: 4000, // a message it can't take (shape, size, order)
	full: 4001, // the room has its most already
	replaced: 4002, // the same visit connected again (another tab, or a reconnect)
	hello: 4003, // no hello in time
	rate: 4004, // too many messages
	expired: 4005, // the visit's token ran out (VISIT_HOURS after it was handed out)
	off: 4006, // driving with others is switched off (LIVE), or till midnight UTC (BUDGET_SPENT)
	idle: 4007, // nothing heard for IDLE_MS
};
// The day's budget for driving with others is spent (worker/drive/live.js): the reason CLOSE.off
// comes with, /api/live's 503 says in `reason` and /api/config in `liveReason` (with live: false).
// It's back after midnight UTC.
export const BUDGET_SPENT = 'budget';

// --- what's said ---------------------------------------------------------------------------------
//
// Page → room (JSON text, one message each):
//   { t: 'hello', player: { id, secret } | null, vehicle, look, place: PLACE | null, away: bool,
//        world? }
//        first, once. player is the leaderboard's (its name is looked up; without one the room
//        names you "Guest 1234"). away: on the globe, not driving yet. world (v2): 'moon' while
//        its globe is the Moon's (otherwise the Earth's, or its place's).
//   { t: 's', s: STATE }        where the car is (see packState), while anyone else is there
//   { t: 'look', vehicle, look }   a new ride or look
//   { t: 'place', place: PLACE }   dropped in somewhere (and so not away)
//   { t: 'away', world? }       back on the globe (v2: the Moon's, with world 'moon'; a page
//                               turning its globe to the other world says so again)
//   { t: 'trick', score }       landed a trick worth this (a whole number, 1 to MAX_TRICK)
//   { t: 'honk' }
//   'ping'                      (plain text) keepalive
//
// Room → page:
//   { t: 'welcome', you: PID, name, star, room, max, players: [ PLAYER... ] }   you as the others
//        see you (your name, which a guest has no other way to learn, and ⭐), and everyone else
//   { t: 'full', room, max }   the room has its most already: sent just before CLOSE.full, which
//        can be slow to arrive, so the page moves on as soon as it hears this
//   { t: 'join', player: PLAYER }   { t: 'leave', pid }
//   { t: 'look', pid, vehicle, look }   { t: 'place', pid, place }   { t: 'away', pid }
//   { t: 'S', at: ms, s: [ [ PID, ...STATE, AGE ]... ] }   what's moved since the last of these, at
//        the room's clock, each with how long (AGE, ms) the room had held it: a batch goes with the
//        next message to arrive once FLUSH_MS has passed, so a car's state may be new or a while old.
//        A car can be in one twice, oldest first: a state that was held back, and its next if
//        that came FLUSH_MS or more after it (closer together, only the later goes)
//   { t: 'trick', pid, score }   { t: 'honk', pid }
//   then a close with one of CLOSE's codes when it's over.
//
// PID: the room's own id for a connection (8 characters), never the leaderboard's player id.
// PLAYER: { pid, name, star (a Supporter Pass), level, title, vehicle, look, place, away, s: STATE |
//   null, world? }. level (1 to 50) and title (an id in levels.js's TITLES) are the leaderboard
//   player's, null for a guest. s is null on the globe, and for a driver who was alone in the room:
//   its page sends its car as it hears the join. world (to a v2 page only): 'moon' for a driver on
//   the Moon (dropped in there, or on its globe), and then their place and s are the Moon's.
// PLACE: { name, lat, lon, height, world? } (degrees, and the ground's height there in metres above
//   the ellipsoid, or on the Moon above its sphere; world 'moon' for the Moon, none for the Earth):
//   where its driver dropped in.
// STATE: [ x, y, z, qx, qy, qz, qw, vx, vy, vz, flags ]: the car's pivot (ECEF metres, 2
//   decimals; on the Moon, Moon-centred metres in its frame), its orientation (a quaternion in that
//   frame, 4 decimals), its velocity (m/s in that frame, 2 decimals) and FLAGS. Which world a state
//   is in is its driver's (the room only takes one that's on its driver's world: the two can't be
//   mistaken, as no point is near both the Earth's ground and the Moon's).

export const MAX_TRICK = 1e7;

// What a car is doing, for drawing it: its flame, trail, smoke and spray as drive-fx.js would.
export const FLAGS = {
	firing: 1, // the booster's firing
	boost: 2, // a drift boost or a pad pushing it
	drift: 4, // drifting on its wheels
	flying: 8, // flying (F)
	air: 16, // in the air off a jump or a bounce (tricks)
	supersonic: 32,
	splash: 64, // sinking in water (only from an older page: World Drive no longer splashes)
	grounded: 128, // its wheels on the ground (ink, dust)
	paused: 256, // its driver paused: parked where it is
	spray: 512, // a hovercraft on water
	// The drift's boost level, 0 to 3, in these two bits.
	levelShift: 10,
	levelMask: 3 << 10,
};
const FLAG_LIMIT = 1 << 12;

// Earth-centred positions a car can be at: from the Dead Sea's shore under the polar radius to
// well over Everest at the equator, flying. And Moon-centred ones: from under the floor of Antoniadi
// crater (8.9 km down) to well over the Selenean summit (10.5 km up), flying, with room to spare.
const NEAR_EARTH = [ 6340000, 6400000 ];
const NEAR_MOON = [ MOON_RADIUS - 12000, MOON_RADIUS + 30000 ];
// The heights a PLACE can be at (m), over the ellipsoid or the Moon's sphere.
const PLACE_HEIGHTS = { [ EARTH ]: [ - 2000, 10000 ], [ MOON_WORLD ]: [ - 12000, 12000 ] };
// Faster than any ride goes, booster and all (m/s).
const TOP_SPEED = 500;

const round = ( value, places ) => Math.round( value * 10 ** places ) / 10 ** places;

// A STATE from a car's position, quaternion and velocity (ECEF: { x, y, z } and { x, y, z, w })
// and flags.
export function packState( position, quaternion, velocity, flags ) {

	return [
		round( position.x, 2 ), round( position.y, 2 ), round( position.z, 2 ),
		round( quaternion.x, 4 ), round( quaternion.y, 4 ), round( quaternion.z, 4 ), round( quaternion.w, 4 ),
		round( velocity.x, 2 ), round( velocity.y, 2 ), round( velocity.z, 2 ),
		flags | 0,
	];

}

// A STATE as sent, if it's one a real car on `world` (the Earth unless it's 'moon') could be in,
// else null.
export function checkState( s, world = EARTH ) {

	if ( ! Array.isArray( s ) || s.length !== 11 || ! s.every( Number.isFinite ) ) return null;
	const [ x, y, z, qx, qy, qz, qw, vx, vy, vz, flags ] = s;
	const r = Math.hypot( x, y, z );
	const [ low, high ] = world === MOON_WORLD ? NEAR_MOON : NEAR_EARTH;
	if ( r < low || r > high ) return null;
	const q = Math.hypot( qx, qy, qz, qw );
	if ( q < 0.9 || q > 1.1 ) return null;
	if ( Math.hypot( vx, vy, vz ) > TOP_SPEED ) return null;
	if ( ! Number.isInteger( flags ) || flags < 0 || flags >= FLAG_LIMIT ) return null;
	return packState( { x, y, z }, { x: qx, y: qy, z: qz, w: qw }, { x: vx, y: vy, z: vz }, flags );

}

// The rides anyone may be seen in (the same list the leaderboard takes).
const VEHICLES = new Set( [ 'go-kart', ...LIBRARY_VEHICLES, ...WORKS_RIDES, ...DRIVE_CARS, ...PASS_RIDES ] );

export function checkVehicle( id ) {

	return typeof id === 'string' && VEHICLES.has( id ) ? id : null;

}

// The parts of a look (paint.js), each an id; number 0 to 99. Ids the page doesn't know are its
// defaults there (paint.js), so the room only checks their shape. The underglow and the horn came
// later: a page from before them leaves them out of the look it sends, and one that has them ignores
// a part it doesn't know (paint.js's cleanLook), so they mix.
export const LOOK_PARTS = [ 'colour', 'finish', 'decal', 'rim', 'glow', 'boost', 'flame', 'trail', 'smoke', 'horn' ];
const LOOK_ID = /^[a-z0-9-]{1,24}$/;

export function checkLook( look ) {

	if ( ! look || typeof look !== 'object' || Array.isArray( look ) ) return null;
	const clean = {};
	for ( const part of LOOK_PARTS ) {

		if ( look[ part ] === undefined ) continue;
		if ( typeof look[ part ] !== 'string' || ! LOOK_ID.test( look[ part ] ) ) return null;
		clean[ part ] = look[ part ];

	}

	if ( look.number !== undefined ) {

		if ( ! Number.isInteger( look.number ) || look.number < 0 || look.number > 99 ) return null;
		clean.number = look.number;

	}

	return clean;

}

// What a place's name may hold (as main.js's placeLabel and the leaderboard take it), and how long.
const PLACE_TEXT = /[^\p{L}\p{M}\p{N} .,'’\-#&/()°]+/gu;
export const PLACE_LENGTH = 60;

// A PLACE as sent, if it's one, else null. Its world is the Moon's only as world: 'moon' (anything
// else is the Earth, as a page from before the Moon had drivers sends no world), and an Earth place
// has none, so it's as it always was.
export function checkPlace( place ) {

	if ( ! place || typeof place !== 'object' ) return null;
	const { lat, lon, height } = place;
	const moon = place.world === MOON_WORLD;
	const [ low, high ] = PLACE_HEIGHTS[ moon ? MOON_WORLD : EARTH ];
	if ( ! Number.isFinite( lat ) || Math.abs( lat ) > 90 || ! Number.isFinite( lon ) || Math.abs( lon ) > 180 ) return null;
	if ( ! Number.isFinite( height ) || height < low || height > high ) return null;
	// Only a string: anything else (an object with its own toString) is no name.
	const name = [ ...( typeof place.name === 'string' ? place.name : '' ).replace( PLACE_TEXT, ' ' ).replace( /\s+/g, ' ' ).trim() ].slice( 0, PLACE_LENGTH ).join( '' ).trim();
	return { name, lat: round( lat, 6 ), lon: round( lon, 6 ), height: round( height, 1 ), ...( moon ? { world: MOON_WORLD } : {} ) };

}

// Which world a PLACE is on: 'moon' or 'earth'.
export function placeWorld( place ) {

	return place?.world === MOON_WORLD ? MOON_WORLD : EARTH;

}

export function checkTrick( score ) {

	return Number.isInteger( score ) && score >= 1 && score <= MAX_TRICK ? score : null;

}

// --- who's driving now, on the globe -------------------------------------------------------------
//
// The globe shows where people are driving just now (docs/world-drive.md, "On the globe: who's
// driving now"). Each area's room adds its drivers to the reports of what it has spent that it
// already makes to DriveLimits (worker/drive/live.js), as dots: positions and counts, never who. A
// party is private and never says; those on the globe aren't counted (paused drivers are: they're
// parked in the game), nor anyone with "Show me to drivers nearby" off, who isn't in an area's room.
// GET /api/online hands out the Earth's, and GET /api/online?world=moon the Moon's (kept under an
// address of its own):
//   { on, total, areas: [ DOT... ], moon }      the Earth's
//   { on, total, areas: [ DOT... ], earth }     the Moon's
// on: false while driving with others is off on that world (LIVE, its budget of 0, or its budget for
// the day spent), with total 0 and no areas; total: how many are driving in all on that world;
// areas: at most ONLINE_AREAS dots, busiest first; moon (or earth): how many are driving on the
// other world, as its rooms last said (on an answer that's off, too, unless the other world is off
// as well: then it's left out). A page from before the Moon had drivers reads none of it.
// DOT: { lat, lon, height, count }: where (degrees, to DOT_PLACES decimals: about a kilometre; and
//   metres above the ellipsoid, to DOT_HEIGHT), and how many are driving there.

// The drivers in a room this near each other (m) are one dot (greedily: each joins the nearest dot
// begun within this of it, or begins one), with at most ROOM_DOTS a room (past that, each joins the
// nearest). A dot is at its drivers' mean position, rounded.
export const DOT_SPREAD = 2000;
export const ROOM_DOTS = 3;
export const DOT_PLACES = 2;
export const DOT_HEIGHT = 10;
export const ONLINE_AREAS = 200;
// A dot is kept this far (degrees) inside its room's area, so dropping in on it (which starts on a
// street near it) puts you in that room.
const DOT_INSIDE = 0.002;
// More drivers than this in one dot is no count anyone made.
const DOT_MOST = 100000;

// WGS84, as Google's tiles and the test globe have the Earth: the equator's radius (m), the
// flattening, and the square of the eccentricity.
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * ( 2 - WGS84_F );
const DEG = Math.PI / 180;

// Earth-centred metres ({ x, y, z }) for a spot: degrees, and metres above the ellipsoid.
export function toEcef( lat, lon, height = 0 ) {

	const sin = Math.sin( lat * DEG );
	const cos = Math.cos( lat * DEG );
	const n = WGS84_A / Math.sqrt( 1 - WGS84_E2 * sin * sin );
	return { x: ( n + height ) * cos * Math.cos( lon * DEG ), y: ( n + height ) * cos * Math.sin( lon * DEG ), z: ( n * ( 1 - WGS84_E2 ) + height ) * sin };

}

// The spot at Earth-centred metres ( x, y, z ): { lat, lon } in degrees and its height in metres
// above the ellipsoid, exact to far under a millimetre from below the ground to well out in space.
// The latitude starts from the one a point on the ellipsoid there would have, and each round of
// tan φ = ( z + e² N sin φ ) / p (N the radius of curvature at φ) cuts what's left of its error by a
// factor of e² (1/150) or more; the height comes from φ as p cos φ + z sin φ − a² / N, which holds at
// the poles as well.
export function toGeodetic( x, y, z ) {

	const p = Math.hypot( x, y );
	let lat = Math.atan2( z, p * ( 1 - WGS84_E2 ) );
	for ( let i = 0; i < 5; i ++ ) {

		const sin = Math.sin( lat );
		lat = Math.atan2( z + WGS84_E2 * WGS84_A / Math.sqrt( 1 - WGS84_E2 * sin * sin ) * sin, p );

	}

	const sin = Math.sin( lat );
	const n = WGS84_A / Math.sqrt( 1 - WGS84_E2 * sin * sin );
	return { lat: lat / DEG, lon: Math.atan2( y, x ) / DEG, height: p * Math.cos( lat ) + z * sin - WGS84_A * WGS84_A / n };

}

// The Moon's frame: Moon-centred metres ({ x, y, z }) for a spot (degrees, and metres over its
// sphere), and back.
export function toMoonFrame( lat, lon, height = 0 ) {

	const r = MOON_RADIUS + height;
	const cos = Math.cos( lat * DEG );
	return { x: r * cos * Math.cos( lon * DEG ), y: r * cos * Math.sin( lon * DEG ), z: r * Math.sin( lat * DEG ) };

}

export function fromMoonFrame( x, y, z ) {

	const r = Math.hypot( x, y, z );
	return { lat: Math.asin( Math.max( - 1, Math.min( 1, z / r ) ) ) / DEG, lon: Math.atan2( y, x ) / DEG, height: r - MOON_RADIUS };

}

// A world's frame either way: positions ({ x, y, z }) for spots, and spots for positions.
export function toFrame( lat, lon, height, world = EARTH ) {

	return world === MOON_WORLD ? toMoonFrame( lat, lon, height ) : toEcef( lat, lon, height );

}

export function fromFrame( x, y, z, world = EARTH ) {

	return world === MOON_WORLD ? fromMoonFrame( x, y, z ) : toGeodetic( x, y, z );

}

// A nearby room's drivers as dots: `points`, their positions ({ x, y, z }) in its world's frame
// (Earth-centred, or the Moon's), in an order that doesn't change from one call to the next, in the
// area `cell` (shard 0's name, whose prefix says which world), which the dots are kept inside.
// [ DOT... ], busiest first.
export function dotsOf( points, cell ) {

	const world = worldOfRoom( cell ) ?? EARTH;

	const groups = [];
	for ( const point of points ) {

		let nearest = null;
		let gap = Infinity;
		for ( const group of groups ) {

			const d = Math.hypot( group.first.x - point.x, group.first.y - point.y, group.first.z - point.z );
			if ( d < gap ) {

				nearest = group;
				gap = d;

			}

		}

		if ( nearest && ( gap <= DOT_SPREAD || groups.length >= ROOM_DOTS ) ) nearest.points.push( point );
		else groups.push( { first: point, points: [ point ] } );

	}

	return groups.map( ( { points: members } ) => {

		const n = members.length;
		const mean = members.reduce( ( sum, p ) => ( { x: sum.x + p.x / n, y: sum.y + p.y / n, z: sum.z + p.z / n } ), { x: 0, y: 0, z: 0 } );
		const { lat, lon, height } = fromFrame( mean.x, mean.y, mean.z, world );
		const { south, north, west, east } = boundsOf( cell );
		// Its longitude taken round to the area's side of 180° first: a car just over it, in the area
		// west of it still, is at -179.99°, by the area's east edge rather than its west.
		const unwrapped = lon - 360 * Math.round( ( lon - ( west + east ) / 2 ) / 360 );
		return { lat: within( lat, south, north ), lon: within( unwrapped, west, east ), height: toTens( height ), count: n };

	} ).sort( busiest );

}

// Busiest first, then from the south-west, so the same dots are always in the same order.
export function busiest( a, b ) {

	return b.count - a.count || a.lat - b.lat || a.lon - b.lon;

}

// `value` (degrees) to DOT_PLACES decimals, and at least DOT_INSIDE inside low to high (never -0).
function within( value, low, high ) {

	const steps = 10 ** DOT_PLACES;
	const least = Math.ceil( ( low + DOT_INSIDE ) * steps - 1e-6 );
	const most = Math.floor( ( high - DOT_INSIDE ) * steps + 1e-6 );
	return Math.min( Math.max( Math.round( value * steps ), least ), most ) / steps || 0;

}

// A height to DOT_HEIGHT m (and never -0, which isn't 0 to a deep comparison).
function toTens( height ) {

	return Math.round( height / DOT_HEIGHT ) * DOT_HEIGHT || 0;

}

// A DOT as sent, if it's one, rounded as dots are, else null.
export function checkDot( dot ) {

	if ( ! dot || typeof dot !== 'object' ) return null;
	const { lat, lon, height, count } = dot;
	if ( ! Number.isFinite( lat ) || Math.abs( lat ) > 90 || ! Number.isFinite( lon ) || Math.abs( lon ) > 180 ) return null;
	if ( ! Number.isFinite( height ) || Math.abs( height ) > 100000 ) return null;
	if ( ! Number.isInteger( count ) || count < 1 || count > DOT_MOST ) return null;
	return { lat: round( lat, DOT_PLACES ) || 0, lon: round( lon, DOT_PLACES ) || 0, height: toTens( height ), count };

}
