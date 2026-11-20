// Driving with others (docs/world-drive.md): what the page (live.js, ghosts.js) and the Worker's
// rooms (worker/drive/live.js) say to each other over a WebSocket, and the limits both keep to; and
// at the end, the dots of who's driving now that the rooms report and the globe shows (online.js).
// Plain data and small functions, with nothing from three.js or the browser, so the Worker
// imports it too.
//
// A room is one Durable Object: a party (party:CODE, the friends who opened its link) or the
// drivers in one area of one world (near:BAND.COL on the Earth, moon:, mars:, vesta: or ceres:
// BAND.COL on the others, each about 11 km across, with up to NEARBY_SHARDS of it when one is full).
// A page is in one room at a time. Everyone is a ghost: cars pass through each other.
//
// The page connects to /api/live?room=<room> with the subprotocols [ ...PAGE_PROTOCOLS, <visit
// token> ] (the token /api/visit handed out: a browser can't set headers on a WebSocket, and a token
// in the address would end up in logs), from worlddrive.app itself (its Origin). The Worker checks
// both before the room is touched, and the room answers with the protocol of the version it speaks.
//
// Positions are in the driver's world's own frame: on the Earth Earth-centred (ECEF, metres), and on
// every other world centred on it in its body frame (body.js, level.js: Z through its north pole, X
// through 0° N 0° E, a sphere of WORLDS[ world ].radius, planetocentric); orientations a quaternion
// in that same frame. So two pages centred on different places (each recentres its scene where it
// dropped in, and Vesta and Ceres as the car drives on, in a levelled frame) agree on where a car is:
// each turns them into its own scene with that world's group's (or the tiles') matrixWorld, read
// afresh every frame. Which world a driver is on goes with where they dropped in (PLACE's world), and
// each world's areas are rooms of their own, so a driver only ever shares an area's room with
// drivers on its world; a party has all five.
//
// Versions (see versionOf): a page from before the Moon had drivers speaks PROTOCOL (v1) and offers
// [ PROTOCOL, token ]; one from when the Moon had them PROTOCOL_WORLDS (v2), offering [
// PROTOCOL_WORLDS, PROTOCOL, token ]; and one since Mars, Vesta and Ceres have them PROTOCOL_ALL
// (v3), offering [ PROTOCOL_ALL, PROTOCOL_WORLDS, PROTOCOL, token ]. Each version knows the worlds
// in KNOWN_WORLDS (a literal, never worlds.js's list: a sixth world's drivers need a v4, as no page
// already out there could tell where they are). A room still running older code (for a few minutes
// after a deploy) answers with the newest it speaks, and the page then behaves as that version for
// the connection: alone on any world that version doesn't know. A room tells a page nothing of a
// world its version doesn't know: a driver there in its party is on the globe to it, with no place,
// car, trick or honk (see worker/drive/live.js's seenBy); and a page is never let into one of such
// a world's areas.

import { DRIVE_CARS, LIBRARY_VEHICLES, PASS_RIDES, WORKS_RIDES } from './catalog.js';
import { WORLDS } from './worlds.js';

export const PROTOCOL = 'worlddrive-live.v1';
export const PROTOCOL_WORLDS = 'worlddrive-live.v2';
export const PROTOCOL_ALL = 'worlddrive-live.v3';
// What a page from now offers, newest first (then its visit's token).
export const PAGE_PROTOCOLS = Object.freeze( [ PROTOCOL_ALL, PROTOCOL_WORLDS, PROTOCOL ] );

// The version (1, 2 or 3) a protocol's name is, or 0 for none of them.
export function versionOf( protocol ) {

	return protocol === PROTOCOL_ALL ? 3 : protocol === PROTOCOL_WORLDS ? 2 : protocol === PROTOCOL ? 1 : 0;

}

// The worlds there are, as places and rooms name them (worlds.js's ids).
export const EARTH = 'earth';
export const MOON_WORLD = 'moon';
// The Moon's radius (m), as moon-height.js's MOON_RADIUS: its frame's sphere.
export const MOON_RADIUS = 1737400;
// The worlds driving with others is on, in worlds.js's order: a literal, as KNOWN_WORLDS is.
export const LIVE_WORLD_IDS = Object.freeze( [ EARTH, MOON_WORLD, 'mars', 'vesta', 'ceres' ] );
// The worlds each version of the protocol knows of: literals, so a world added to worlds.js later
// isn't taken by a page already out there for one it knows (its drivers need a new version).
export const KNOWN_WORLDS = Object.freeze( {
	1: Object.freeze( [ EARTH ] ),
	2: Object.freeze( [ EARTH, MOON_WORLD ] ),
	3: LIVE_WORLD_IDS,
} );

export function isLiveWorld( id ) {

	return typeof id === 'string' && LIVE_WORLD_IDS.includes( id );

}

// Whether a page (or room) speaking `version` knows of `world`: one it doesn't is dropped as if it
// weren't said (its driver is away, on the globe, to that page).
export function knows( version, world ) {

	return typeof world === 'string' && ( KNOWN_WORLDS[ version ] ?? KNOWN_WORLDS[ 1 ] ).includes( world );

}

// The error for a world that driving with others isn't on (never taken for the Earth).
function unknownWorld( world ) {

	return new TypeError( `Not a world driving with others is on: ${ world }` );

}

// --- rooms ---------------------------------------------------------------------------------------

// Party codes: 7 of these (no I, O, 0 or 1 to misread), 32^7 ≈ 3.4e10 of them.
export const PARTY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PARTY_CODE_LENGTH = 7;
const PARTY_CODE = new RegExp( `^[${ PARTY_ALPHABET }]{${ PARTY_CODE_LENGTH }}$` );
// The most in a room at once; a nearby area that's full has up to NEARBY_SHARDS rooms (#0 to #3).
export const PARTY_MAX = 8;
export const NEARBY_MAX = 20;
export const NEARBY_SHARDS = 4;
// Nearby areas: bands CELL_DEGS[ world ] of latitude tall, cut into columns about as wide, so an area
// is about 11 km across on each world: on the Earth CELL_DEG, 0.1° (11.1 km); on the Moon
// MOON_CELL_DEG, 0.36° of 1,737.4 km (10.9 km); on Mars 0.18° of 3,389.5 km (10.6 km); on Vesta 2.4°
// of its 262.7 km sphere (11.0 km); on Ceres 1.25° of 470 km (10.3 km). Each a whole number of bands
// in 180°. Near the poles a column is held to 20 times a band's width (columnDeg), wide on Vesta;
// its rooms stay small all the same. Each world's areas are named by a prefix of their own: near:
// BAND.COL on the Earth, and the world's id on the others (moon:126.330, vesta:30.12).
export const CELL_DEG = 0.1;
export const MOON_CELL_DEG = 0.36;
export const CELL_DEGS = Object.freeze( { [ EARTH ]: CELL_DEG, [ MOON_WORLD ]: MOON_CELL_DEG, mars: 0.18, vesta: 2.4, ceres: 1.25 } );
const GRIDS = Object.fromEntries( LIVE_WORLD_IDS.map( world => [ world, { prefix: world === EARTH ? 'near' : world, deg: CELL_DEGS[ world ], bands: Math.round( 180 / CELL_DEGS[ world ] ) } ] ) );
const NEAR = /^(near|moon|mars|vesta|ceres):(\d{1,4})\.(\d{1,5})(?:#(\d))?$/;
const PARTY = /^party:([A-Z0-9]+)$/;
// Which world each prefix is.
const WORLD_OF = Object.fromEntries( LIVE_WORLD_IDS.map( world => [ GRIDS[ world ].prefix, world ] ) );

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

// The nearby room for a spot (degrees, planetocentric off the Earth) on `world` (one of
// LIVE_WORLD_IDS: any other throws, never taken for the Earth), shard 0: e.g. 'near:1277.1088', or
// on the Moon 'moon:126.330'.
export function cellOf( lat, lon, world = EARTH ) {

	const grid = GRIDS[ world ];
	if ( ! isLiveWorld( world ) ) throw unknownWorld( world );
	const band = Math.min( grid.bands - 1, Math.max( 0, Math.floor( ( lat + 90 ) / grid.deg ) ) );
	const wrapped = ( ( lon + 180 ) % 360 + 360 ) % 360;
	const col = Math.min( columns( band, grid ) - 1, Math.floor( wrapped / columnDeg( band, grid ) ) );
	return `${ grid.prefix }:${ band }.${ col }`;

}

// Which world an area's room (any shard) is on: one of LIVE_WORLD_IDS; null for anything else (a
// party's too).
export function worldOfRoom( room ) {

	if ( typeof room !== 'string' ) return null;
	const prefix = room.slice( 0, room.indexOf( ':' ) );
	return Object.hasOwn( WORLD_OF, prefix ) ? WORLD_OF[ prefix ] : null;

}

// Another shard of the same area: 'near:1277.1088#2'.
export function shardOf( room, shard ) {

	return `${ room.split( '#' )[ 0 ]}#${ shard }`;

}

// The edges (degrees) of an area, shard 0's name: { south, north, west, east }. The last column of a
// band stops at 180°.
export function boundsOf( cell ) {

	const world = worldOfRoom( cell );
	if ( ! world ) throw unknownWorld( cell );
	const grid = GRIDS[ world ];
	const [ band, col ] = cell.slice( cell.indexOf( ':' ) + 1 ).split( '#' )[ 0 ].split( '.' ).map( Number );
	const width = columnDeg( band, grid );
	const west = col * width - 180;
	return { south: band * grid.deg - 90, north: ( band + 1 ) * grid.deg - 90, west, east: Math.min( 180, west + width ) };

}

// { kind: 'party', code, max, world: null } or { kind: 'near', world, cell, shard, max } for a
// room's name (world: 'earth' for near:..., and the prefix's world for moon:, mars:, vesta: and
// ceres:), or null for anything that isn't one.
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

// Whether a car went from snapshot `a` to `b` ({ p, v, at } in ms) all at once rather than by
// driving or flying there: further than TELEPORT, and further than half again what it was going
// (a plane at 750 m/s covers more than TELEPORT between two words).
export function teleported( a, b ) {

	const flown = Math.max( a.v.length(), b.v.length() ) * Math.abs( b.at - a.at ) / 1000 * 1.5;
	return a.p.distanceTo( b.p ) > Math.max( TELEPORT, flown );

}
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
	off: 4006, // driving with others is switched off (LIVE), or till midnight UTC on this world (its reason)
	idle: 4007, // nothing heard for IDLE_MS
};
// The day's budget for driving with others on a world is spent (worker/drive/live.js): the reason
// CLOSE.off comes with, /api/live's 503 says in `reason` and /api/config in `liveReason` (with live:
// false), `liveMoonReason` and each world's `liveWorlds[ world ].reason`. It's back after midnight
// UTC.
export const BUDGET_SPENT = 'budget';
// The connection's address has spent its share of its world's day (worker/drive/live.js): the
// reason CLOSE.off comes with to a v3 page, which then drives on alone on that world for the rest of
// its visit and with others on the rest (a v1 or v2 page is closed with CLOSE.rate instead, as it
// always was, tries again and is turned away there).
export const SHARE_SPENT = 'share';
// Driving with others is switched off on the connection's world only (its budget is 0, while some
// other world's isn't and LIVE isn't 'off'): the reason CLOSE.off comes with then, so that a v3 page
// closes that world alone and drives with others on the rest, as it does when /api/live turns it
// away there. Switched off everywhere (LIVE=off, or every budget 0) stays reason 'off', the end of
// driving with others for the visit (and a page from before v3 reads this one as that too).
export const WORLD_OFF = 'world off';

// --- what's said ---------------------------------------------------------------------------------
//
// A WORLD below is one of LIVE_WORLD_IDS, said only to (and only taken from) a page whose version
// knows it (knows): anything else is as if it weren't said. The Earth is said as no world at all
// wherever a page from before the Moon had drivers would read it.
//
// Page → room (JSON text, one message each):
//   { t: 'hello', player: { id, secret } | null, vehicle, look, place: PLACE | null, away: bool,
//        world?, globe? }
//        first, once. player is the leaderboard's (its name is looked up; without one the room
//        names you "Guest 1234"). away: on the globe, not driving yet. world (v2 and on): the
//        WORLD whose rooms and budget it uses while on the globe (otherwise its place's; v2 sends
//        only 'moon'); globe (v3): the WORLD whose globe it's looking at, which may be another,
//        shown to its party and never charged.
//   { t: 's', s: STATE }        where the car is (see packState), while anyone else is there
//   { t: 'look', vehicle, look }   a new ride or look
//   { t: 'place', place: PLACE }   dropped in somewhere (and so not away)
//   { t: 'away', world?, globe? }   back on the globe: world (v2 and on) the WORLD whose budget it
//                               uses (v2: the Moon's with world 'moon'), globe (v3) the WORLD whose
//                               globe it's looking at; a page turning its globe says so again
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
//   { t: 'look', pid, vehicle, look }   { t: 'place', pid, place }   { t: 'away', pid, globe? }
//        (globe, to a v3 page: the WORLD whose globe they're looking at, when they said)
//   { t: 'S', at: ms, s: [ [ PID, ...STATE, AGE ]... ] }   what's moved since the last of these, at
//        the room's clock, each with how long (AGE, ms) the room had held it: a batch goes with the
//        next message to arrive once FLUSH_MS has passed, so a car's state may be new or a while old.
//        A car can be in one twice, oldest first: a state that was held back, and its next if
//        that came FLUSH_MS or more after it (closer together, only the later goes)
//   { t: 'trick', pid, score }   { t: 'honk', pid }
//   then a close with one of CLOSE's codes when it's over (CLOSE.off with BUDGET_SPENT, WORLD_OFF
//   or, to a v3 page, SHARE_SPENT: only for the world it was on; with 'off': every world).
//
// PID: the room's own id for a connection (8 characters), never the leaderboard's player id.
// PLAYER: { pid, name, star (a Supporter Pass), level, title, vehicle, look, place, away, s: STATE |
//   null, world?, globe? }. level (1 to 50) and title (an id in levels.js's TITLES) are the
//   leaderboard player's, null for a guest. s is null on the globe, and for a driver who was alone in
//   the room: its page sends its car as it hears the join. world: the driver's WORLD when it isn't
//   the Earth (dropped in there, or using its rooms on the globe), and then their place and s are
//   that world's; a driver on a world the page doesn't know is on the globe to it (away, no place,
//   no s, no world). globe (to a v3 page, for a driver on the globe who said): the WORLD whose globe
//   they're looking at.
// PLACE: { name, lat, lon, height, world? } (degrees, planetocentric off the Earth, and the ground's
//   height there in metres above the ellipsoid, or off the Earth above its world's sphere; world the
//   WORLD for any but the Earth, none for the Earth): where its driver dropped in.
// STATE: [ x, y, z, qx, qy, qz, qw, vx, vy, vz, flags ]: the car's pivot (in its world's frame,
//   metres, 2 decimals: ECEF on the Earth, its body frame on the others, see toFrame), its
//   orientation (a quaternion in that frame, 4 decimals), its velocity (m/s in that frame, 2
//   decimals) and FLAGS. Which world a state is in is its driver's (the room only takes one that's on
//   its driver's world, STATE_RADII: no two worlds' can be mistaken, as their shells don't overlap).

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
	plane: 4096, // a plane (T, src/plane.js): its wings out, or on their way out
	// The drift's boost level, 0 to 3, in these two bits.
	levelShift: 10,
	levelMask: 3 << 10,
};
const FLAG_LIMIT = 1 << 13;

// The distances (m) from its world's middle a car on each can be at (STATE): on the Earth from the
// Dead Sea's shore under the polar radius to well over Everest at the equator, flying; on the Moon
// from under the floor of Antoniadi crater (8.9 km down) to well over the Selenean summit (10.5 km
// up), flying, with room to spare. On the others, its sphere's radius with its lowest ground less
// 3 km to its highest plus FLY_MARGIN (worlds.js): Mars 30 km, Vesta and Ceres 40 km (in their weak
// gravity a boosted car climbs higher; how high isn't measured). A plane flies at most 12 km over
// the ground (src/plane.js CEILING), which fits under every world's top: on the Earth, Chimborazo's
// summit (6,384 km out) plus 12 km is under 6,400 km. Literals, as a world's radius and
// heights never change once anything's been counted on it. No two worlds' overlap (Vesta's up to
// 0.33 Mm, Ceres's 0.44 to 0.53, the Moon's 1.73 to 1.77, Mars's 3.38 to 3.44, the Earth's 6.34
// to 6.40), so a state can't be taken for another world's.
export const STATE_RADII = Object.freeze( {
	[ EARTH ]: Object.freeze( [ 6340000, 6400000 ] ),
	[ MOON_WORLD ]: Object.freeze( [ MOON_RADIUS - 12000, MOON_RADIUS + 30000 ] ),
	mars: Object.freeze( [ 3377000, 3442000 ] ),
	vesta: Object.freeze( [ 207700, 334700 ] ),
	ceres: Object.freeze( [ 438000, 528500 ] ),
} );
// The heights a PLACE can be at (m), over the Earth's ellipsoid or the other worlds' spheres: each
// world's lowest to highest ground (worlds.js).
export const PLACE_HEIGHTS = Object.freeze( {
	[ EARTH ]: Object.freeze( [ - 2000, 10000 ] ),
	[ MOON_WORLD ]: Object.freeze( [ - 12000, 12000 ] ),
	mars: Object.freeze( [ - 9500, 22500 ] ),
	vesta: Object.freeze( [ - 52000, 32000 ] ),
	ceres: Object.freeze( [ - 29000, 18500 ] ),
} );
// Faster than any ride goes, booster and all, and a plane at its ceiling (2,700 km/h: src/plane.js)
// (m/s).
const TOP_SPEED = 800;

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

// A STATE as sent, if it's one a real car on `world` (one of LIVE_WORLD_IDS) could be in, else null
// (null too on any other world: none is taken for the Earth's).
export function checkState( s, world = EARTH ) {

	if ( ! isLiveWorld( world ) || ! Array.isArray( s ) || s.length !== 11 || ! s.every( Number.isFinite ) ) return null;
	const [ x, y, z, qx, qy, qz, qw, vx, vy, vz, flags ] = s;
	const r = Math.hypot( x, y, z );
	const [ low, high ] = STATE_RADII[ world ];
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

// A PLACE as sent, if it's one, else null. Its world is one of the others than the Earth (moon,
// mars, vesta, ceres) only as that world's id, its height checked against that world's ground;
// anything else is the Earth's (as a page from before the Moon had drivers sends no world), and an
// Earth place has none, so it's as it always was.
export function checkPlace( place ) {

	if ( ! place || typeof place !== 'object' ) return null;
	const { lat, lon, height } = place;
	const world = isLiveWorld( place.world ) && place.world !== EARTH ? place.world : EARTH;
	const [ low, high ] = PLACE_HEIGHTS[ world ];
	if ( ! Number.isFinite( lat ) || Math.abs( lat ) > 90 || ! Number.isFinite( lon ) || Math.abs( lon ) > 180 ) return null;
	if ( ! Number.isFinite( height ) || height < low || height > high ) return null;
	// Only a string: anything else (an object with its own toString) is no name.
	const name = [ ...( typeof place.name === 'string' ? place.name : '' ).replace( PLACE_TEXT, ' ' ).replace( /\s+/g, ' ' ).trim() ].slice( 0, PLACE_LENGTH ).join( '' ).trim();
	return { name, lat: round( lat, 6 ), lon: round( lon, 6 ), height: round( height, 1 ), ...( world === EARTH ? {} : { world } ) };

}

// Which world a PLACE is on: its world when that's one of LIVE_WORLD_IDS, else 'earth'.
export function placeWorld( place ) {

	return isLiveWorld( place?.world ) ? place.world : EARTH;

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
// GET /api/online hands out the Earth's, and GET /api/online?world=<WORLD> another world's (each kept
// under an address of its own):
//   { on, total, areas: [ DOT... ], moon?, earth?, worlds? }
// on: false while driving with others is off on that world (LIVE, its budget of 0, or its budget for
// the day spent), with total 0 and no areas; total: how many are driving in all on that world;
// areas: at most ONLINE_AREAS dots, busiest first. moon, on the Earth's answer only (and earth on the
// Moon's only), as a page from before Mars had drivers reads it: how many are driving on that one
// other world, as its rooms last said (on an answer that's off, too, unless that world is off as
// well: then it's left out). worlds: { earth: { on, total }, moon, mars, vesta, ceres }, every
// world's at once from the same look (on whether it's open there today, total how many are driving
// there), on an answer that's off too (as the first other world that's open says), so a page can
// show them all from the one ask; left out when every world is off. A page from before the Moon had
// drivers reads none of it but on, total and areas.
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

// A world's body frame (any but the Earth): metres ({ x, y, z }) from its middle, Z through its
// north pole and X through 0° N 0° E, for a spot (planetocentric degrees, and metres over its sphere
// of WORLDS[ world ].radius), as level.js's pointOn has it (the same sums in the same order), and
// back.
export function toBodyFrame( lat, lon, height = 0, world = MOON_WORLD ) {

	if ( ! isLiveWorld( world ) || world === EARTH ) throw unknownWorld( world );
	const r = WORLDS[ world ].radius + height;
	const [ phi, lambda ] = [ lat * DEG, lon * DEG ];
	return { x: r * Math.cos( phi ) * Math.cos( lambda ), y: r * Math.cos( phi ) * Math.sin( lambda ), z: r * Math.sin( phi ) };

}

export function fromBodyFrame( x, y, z, world = MOON_WORLD ) {

	if ( ! isLiveWorld( world ) || world === EARTH ) throw unknownWorld( world );
	const r = Math.hypot( x, y, z );
	return { lat: Math.asin( Math.max( - 1, Math.min( 1, z / r ) ) ) / DEG, lon: Math.atan2( y, x ) / DEG, height: r - WORLDS[ world ].radius };

}

// The Moon's frame (its body frame, a sphere of MOON_RADIUS), either way.
export function toMoonFrame( lat, lon, height = 0 ) {

	return toBodyFrame( lat, lon, height, MOON_WORLD );

}

export function fromMoonFrame( x, y, z ) {

	return fromBodyFrame( x, y, z, MOON_WORLD );

}

// A world's frame either way: positions ({ x, y, z }) for spots, and spots for positions. The
// Earth's is ECEF (WGS84); every other's its body frame. A world that isn't one of LIVE_WORLD_IDS
// throws: none is taken for the Earth.
export function toFrame( lat, lon, height, world = EARTH ) {

	return world === EARTH ? toEcef( lat, lon, height ) : toBodyFrame( lat, lon, height, world );

}

export function fromFrame( x, y, z, world = EARTH ) {

	return world === EARTH ? toGeodetic( x, y, z ) : fromBodyFrame( x, y, z, world );

}

// A nearby room's drivers as dots: `points`, their positions ({ x, y, z }) in its world's frame
// (toFrame's), in an order that doesn't change from one call to the next, in the
// area `cell` (shard 0's name, whose prefix says which world), which the dots are kept inside.
// [ DOT... ], busiest first.
export function dotsOf( points, cell ) {

	const world = worldOfRoom( cell );
	if ( ! world ) throw unknownWorld( cell );

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
