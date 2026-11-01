// Driving with others (docs/world-drive.md): what the page (live.js, ghosts.js) and the Worker's
// rooms (worker/drive/live.js) say to each other over a WebSocket, and the limits both keep to.
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

import { DRIVE_CARS, LIBRARY_VEHICLES, PASS_RIDES } from './catalog.js';

export const PROTOCOL = 'worlddrive-live.v1';

// --- rooms ---------------------------------------------------------------------------------------

// Party codes: 7 of these (no I, O, 0 or 1 to misread), 32^7 ≈ 3.4e10 of them.
export const PARTY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PARTY_CODE_LENGTH = 7;
const PARTY_CODE = new RegExp( `^[${ PARTY_ALPHABET }]{${ PARTY_CODE_LENGTH }}$` );
// The most in a room at once; a nearby area that's full has up to NEARBY_SHARDS rooms (#0 to #3).
export const PARTY_MAX = 8;
export const NEARBY_MAX = 20;
export const NEARBY_SHARDS = 4;
// Nearby areas: bands CELL_DEG of latitude tall, cut into columns about as wide.
export const CELL_DEG = 0.1;
const BANDS = Math.round( 180 / CELL_DEG );
const NEAR = /^near:(\d{1,4})\.(\d{1,5})(?:#(\d))?$/;
const PARTY = /^party:([A-Z0-9]+)$/;

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

// The width (degrees of longitude) of the columns in a band.
function columnDeg( band ) {

	const middle = ( band + 0.5 ) * CELL_DEG - 90;
	return CELL_DEG / Math.max( Math.cos( middle * Math.PI / 180 ), 0.05 );

}

function columns( band ) {

	return Math.ceil( 360 / columnDeg( band ) );

}

// The nearby room for a spot (degrees), shard 0: e.g. 'near:1277.1088'.
export function cellOf( lat, lon ) {

	const band = Math.min( BANDS - 1, Math.max( 0, Math.floor( ( lat + 90 ) / CELL_DEG ) ) );
	const wrapped = ( ( lon + 180 ) % 360 + 360 ) % 360;
	const col = Math.min( columns( band ) - 1, Math.floor( wrapped / columnDeg( band ) ) );
	return `near:${ band }.${ col }`;

}

// Another shard of the same area: 'near:1277.1088#2'.
export function shardOf( room, shard ) {

	return `${ room.split( '#' )[ 0 ]}#${ shard }`;

}

// { kind: 'party', code, max } or { kind: 'near', cell, shard, max } for a room's name, or null
// for anything that isn't one.
export function parseRoom( text ) {

	if ( typeof text !== 'string' || text.length > 40 ) return null;
	const party = text.match( PARTY );
	if ( party ) return PARTY_CODE.test( party[ 1 ] ) ? { kind: 'party', code: party[ 1 ], max: PARTY_MAX } : null;
	const near = text.match( NEAR );
	if ( ! near ) return null;
	const band = Number( near[ 1 ] );
	const col = Number( near[ 2 ] );
	const shard = near[ 3 ] === undefined ? 0 : Number( near[ 3 ] );
	if ( band >= BANDS || col >= columns( band ) || shard >= NEARBY_SHARDS ) return null;
	return { kind: 'near', cell: `near:${ band }.${ col }`, shard, max: NEARBY_MAX };

}

// --- timing and limits ---------------------------------------------------------------------------

// The page sends its car SEND_HZ times a second while it moves, STILL_HZ while it sits still, and
// straight away when its flags change. The room sends everyone what's new at most every FLUSH_MS.
export const SEND_HZ = 8;
export const STILL_HZ = 1;
export const FLUSH_MS = 100;
// Other cars are drawn this far (ms) behind the latest word of them, so there's a position on each
// side of now to move between; a jump of more than TELEPORT m from one to the next is a jump (R,
// a splash's way back, a new drop-in), not a drive. A car with no word for STALE_MS is taken away.
export const INTERP_MS = 250;
export const TELEPORT = 60;
export const STALE_MS = 15000;
// In an area, a car only goes to those within VIEW_RANGE m of it.
export const VIEW_RANGE = 5000;
// The page sends PING every KEEPALIVE_MS while it has nothing else to say; the room answers PONG
// without waking up (an auto-response). A connection with no word at all for IDLE_MS is closed.
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
// Honks: one per HONK_GAP ms per driver (more are dropped, not counted against the rate).
export const HONK_GAP = 800;

// WebSocket close codes the room uses.
export const CLOSE = {
	protocol: 4000, // a message it can't take (shape, size, order)
	full: 4001, // the room has its most already
	replaced: 4002, // the same visit connected again (another tab, or a reconnect)
	hello: 4003, // no hello in time
	rate: 4004, // too many messages
	expired: 4005, // the visit's token ran out (VISIT_HOURS after it was handed out)
	off: 4006, // driving with others is switched off (LIVE)
	idle: 4007, // nothing heard for IDLE_MS
};

// --- what's said ---------------------------------------------------------------------------------
//
// Page → room (JSON text, one message each):
//   { t: 'hello', player: { id, secret } | null, vehicle, look, place: PLACE | null, away: bool }
//        first, once. player is the leaderboard's (its name is looked up; without one the room
//        names you "Guest 1234"). away: on the globe, not driving yet.
//   { t: 's', s: STATE }        where the car is (see packState)
//   { t: 'look', vehicle, look }   a new ride or look
//   { t: 'place', place: PLACE }   dropped in somewhere (and so not away)
//   { t: 'away' }               back on the globe
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
//        next message to arrive once FLUSH_MS has passed, so a car's state may be new or a while old
//   { t: 'trick', pid, score }   { t: 'honk', pid }
//   then a close with one of CLOSE's codes when it's over.
//
// PID: the room's own id for a connection (8 characters), never the leaderboard's player id.
// PLAYER: { pid, name, star (a Supporter Pass), vehicle, look, place, away, s: STATE | null }.
// PLACE: { name, lat, lon, height } (degrees, and the ground's height there in metres above the
//   ellipsoid): where its driver dropped in.
// STATE: [ x, y, z, qx, qy, qz, qw, vx, vy, vz, flags ]: the car's pivot (ECEF metres, 2
//   decimals), its orientation (an ECEF-frame quaternion, 4 decimals), its velocity (ECEF m/s, 2
//   decimals) and FLAGS.

export const MAX_TRICK = 1e7;

// What a car is doing, for drawing it: its flame, trail, smoke and spray as drive-fx.js would.
export const FLAGS = {
	firing: 1, // the booster's firing
	boost: 2, // a drift boost or a pad pushing it
	drift: 4, // drifting on its wheels
	flying: 8, // flying (F)
	air: 16, // in the air off a jump or a bounce (tricks)
	supersonic: 32,
	splash: 64, // sinking in water
	grounded: 128, // its wheels on the ground (ink, dust)
	paused: 256, // its driver paused: parked where it is
	spray: 512, // a hovercraft on water
	// The drift's boost level, 0 to 3, in these two bits.
	levelShift: 10,
	levelMask: 3 << 10,
};
const FLAG_LIMIT = 1 << 12;

// Earth-centred positions a car can be at: from the Dead Sea's shore under the polar radius to
// well over Everest at the equator, flying.
const NEAR_EARTH = [ 6340000, 6400000 ];
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

// A STATE as sent, if it's one a real car could be in, else null.
export function checkState( s ) {

	if ( ! Array.isArray( s ) || s.length !== 11 || ! s.every( Number.isFinite ) ) return null;
	const [ x, y, z, qx, qy, qz, qw, vx, vy, vz, flags ] = s;
	const r = Math.hypot( x, y, z );
	if ( r < NEAR_EARTH[ 0 ] || r > NEAR_EARTH[ 1 ] ) return null;
	const q = Math.hypot( qx, qy, qz, qw );
	if ( q < 0.9 || q > 1.1 ) return null;
	if ( Math.hypot( vx, vy, vz ) > TOP_SPEED ) return null;
	if ( ! Number.isInteger( flags ) || flags < 0 || flags >= FLAG_LIMIT ) return null;
	return packState( { x, y, z }, { x: qx, y: qy, z: qz, w: qw }, { x: vx, y: vy, z: vz }, flags );

}

// The rides anyone may be seen in (the same list the leaderboard takes).
const VEHICLES = new Set( [ 'go-kart', ...LIBRARY_VEHICLES, ...DRIVE_CARS, ...PASS_RIDES ] );

export function checkVehicle( id ) {

	return typeof id === 'string' && VEHICLES.has( id ) ? id : null;

}

// The parts of a look (paint.js), each an id; number 0 to 99. Ids the page doesn't know are its
// defaults there (paint.js), so the room only checks their shape.
export const LOOK_PARTS = [ 'colour', 'finish', 'decal', 'rim', 'boost', 'flame', 'trail', 'smoke' ];
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

export function checkPlace( place ) {

	if ( ! place || typeof place !== 'object' ) return null;
	const { lat, lon, height } = place;
	if ( ! Number.isFinite( lat ) || Math.abs( lat ) > 90 || ! Number.isFinite( lon ) || Math.abs( lon ) > 180 ) return null;
	if ( ! Number.isFinite( height ) || height < - 2000 || height > 10000 ) return null;
	const name = [ ...String( place.name ?? '' ).replace( PLACE_TEXT, ' ' ).replace( /\s+/g, ' ' ).trim() ].slice( 0, PLACE_LENGTH ).join( '' ).trim();
	return { name, lat: round( lat, 6 ), lon: round( lon, 6 ), height: round( height, 1 ) };

}

export function checkTrick( score ) {

	return Number.isInteger( score ) && score >= 1 && score <= MAX_TRICK ? score : null;

}
