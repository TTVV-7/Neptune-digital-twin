import { DurableObject } from 'cloudflare:workers';
import { HttpError, isObject, json, randomToken, sha256Hex } from '../http.js';
import {
	BUDGET_SPENT, BURST, CLOSE, EARTH, FLUSH_MS, HELLO_MS, HONK_GAP, IDLE_MS, LIVE_WORLD_IDS, MAX_HELLO, MAX_MESSAGE, MOON_WORLD, NEARBY_MAX, ONLINE_AREAS, PARTY_MAX,
	PING, PONG, PROTOCOL, PROTOCOL_ALL, PROTOCOL_WORLDS, RATE, SHARE_SPENT, VIEW_RANGE, WORLD_OFF,
	boundsOf, cellOf, checkLook, checkPlace, checkState, checkTrick, checkVehicle, dotsOf, isLiveWorld, knows, parseRoom, placeWorld, shardOf, toFrame,
} from '../../src/drive-app/live-protocol.js';
import { dayOf } from './limits.js';
import { credentials, database, secretOk } from './players.js';
import { setting } from './settings.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';
import { standingOf, xpOf } from './progress.js';
import { creditParty, unlockedRides } from './achievements.js';
import { lookKey } from './challenges.js';
import { rideFeat } from '../../src/drive-app/achievement-rules.js';
import { DEFAULT_RIDE } from '../../src/drive-app/catalog.js';

// Driving with others (docs/world-drive.md): the rooms. src/drive-app/live-protocol.js says what a
// room is (a party, or the drivers in one area of one world: the Earth, the Moon, Mars, Vesta or
// Ceres) and what's said in one; this is the Worker's half.
// /api/live checks a connection (live) and hands it to its room, one Durable Object a room
// (DriveRoom), which tells everyone in it where the others are. An area's room also says where its
// drivers are in its reports to DriveLimits (see report), for the globe's dots of who's driving now,
// which /api/online hands out (online).
//
// What it costs, as Cloudflare's pages had it in November 2026
// (developers.cloudflare.com/durable-objects/platform/pricing/ and .../platform/limits/):
// - Requests: opening a WebSocket is one, and incoming messages count 20 to 1 (100 of them are 5
//   requests); outgoing messages are free, so a room's batches to everyone cost nothing. Each alarm
//   is a request, and so is each call to DriveLimits. The Free plan has 100,000 a day for all
//   Durable Objects together (DriveLimits' visits and scores included), Paid 1 million a month and
//   then $0.15 a million. A driver with others sends SEND_HZ (5) a second: 18,000 messages, 900
//   requests, an hour on the move; alone in its room, its page sends no states at all, only its
//   keepalive every KEEPALIVE_MS, 7 requests an hour. The room answers those itself rather than with
//   the runtime's auto-response: that would answer them without the room seeing them, so they could
//   be neither counted nor held to the rate, and the pricing doesn't say whether they're billed. Each
//   wakes the room for as long as it takes to answer.
// - The day's budget: on the Free plan, past 100,000 requests every Durable Object fails until
//   midnight UTC, DriveLimits too, and then nobody could start a drive. So driving with others
//   counts what it spends, in billed requests, and switches itself off for the rest of the UTC day
//   once that reaches the day's budget, each world's its own (DEFAULT_BUDGETS, BUDGET_VARS: the
//   Earth's LIVE_DAILY_BUDGET, 40,000 if unset; see the worlds below), leaving the rest for visits
//   and scores.
//   Each room counts its own (each connection's in its attachment: connecting and its messages,
//   keepalives included; and the room's alarms) and adds it to DriveLimits' count about once every
//   REPORT_MS while there's REPORT_LEAST or more to add, at least every REPORT_MOST while anyone's in
//   it, and as it empties; when that says the day's is spent it closes everyone (CLOSE.off,
//   BUDGET_SPENT). /api/live asks DriveLimits first (liveToday), and so does /api/config at most
//   once every OPEN_MS in each Worker instance (and one at a time; once the Earth's and the Moon's
//   days are both spent, at most once every FAR_OPEN_MS, and only while a far world's is open); those
//   asks count too, /api/config's against the Earth's (else the Moon's) and never a far world's. The
//   count
//   runs behind, a minute for rooms with drivers moving, up to REPORT_MOST (and under REPORT_LEAST)
//   for the others: the budget leaves room for that.
// - Who's driving now (the globe's dots): an area's room puts its dots in the reports it makes
//   anyway, so it costs no request of its own; only when they've changed does a report go with less
//   than REPORT_LEAST to add, REPORT_MS after the last as ever (each is a request and a row written,
//   one more in DriveLimits for the dots). /api/online is kept ONLINE_MS in each of Cloudflare's
//   locations (the Cache API), by each Worker instance and by browsers, so only an ask that finds
//   none kept asks DriveLimits, and only one at a time in each instance: a request, counted against
//   the day's budget like the others, the Earth's for the Earth's and the far worlds' (the Moon's when
//   the Earth's is spent, the world's own only when both are), the Moon's for the Moon's: watching a
//   far world's globe doesn't spend its small budget. One ask has every world's count (worlds). So
//   about two a minute in each Worker instance (those in one
//   location mostly share its cache), and a page on the globe alone in its location is one a
//   minute, about 60 an hour (it stops asking after a while without a touch).
// - Duration: 128 MB for as long as a room is running, or idle in memory but unable to hibernate.
//   A room that's only waiting for its WebSockets' next message can hibernate, and isn't charged
//   for that time at all, even before it does. A pending setTimeout keeps it from hibernating, so
//   there are none here: the batch every FLUSH_MS goes out with the next message to arrive after
//   it's due (see flush). Free: 13,000 GB-s a day (about 28 hours of a room kept awake); Paid:
//   400,000 GB-s a month and then $12.50 a million.
// - Storage: nothing is stored but the alarm (each setAlarm is a row written: Free 100,000 a day,
//   Paid 50 million a month and then $1 a million; one a minute in a room with anyone in it, and
//   each report is a row written in DriveLimits), and a room that empties deletes it all, so it
//   stops existing rather than being billed for its few kilobytes.
// - On the Free plan, past any of those limits Durable Objects fail with an error until midnight
//   UTC. LIVE=off (wrangler.drive.jsonc) switches driving with others off without touching the
//   rest; the budget does it for the day by itself.
// - The worlds: the Moon, Mars, Vesta and Ceres are never limited (they cost nothing to stream), so
//   their rooms are never shut by the Earth's visit caps nor by the Earth's budget. But the budget is
//   the Durable Objects bill itself (on the Free plan, the line past which DriveLimits fails for
//   everyone, every world's visits too), so each world's rooms keep a day's budget of their own
//   (dailyBudget: LIVE_MOON_DAILY_BUDGET, LIVE_MARS_DAILY_BUDGET, LIVE_VESTA_DAILY_BUDGET and
//   LIVE_CERES_DAILY_BUDGET, DEFAULT_BUDGETS if unset), counted the same way and apart in a
//   DriveLimits table of its own: spending one world's switches off only that world's rooms (and in a
//   party, only those driving on it). All five together are still well under the Free plan's
//   100,000 (70,000, leaving 30,000 for visits and scores). A far world's (Mars, Vesta, Ceres) pays
//   for its area rooms (an occupied room's alarm and report a minute: about 2,880 a day kept busy
//   all day) and its connections' asks and messages, never for anyone watching its globe (online) nor
//   for page loads (/api/config). A room's connections each count against the world they're on (in a
//   party, where their page last said it was), and the room's own alarms and reports against its
//   world (a party's against the one world everyone in it is on, else the Earth's, unless the
//   Earth's budget is 0: then the open world most of them are on; see worldOf). And as anyone may
//   have as many of the free worlds' visits as robot checks they pass (they aren't counted against
//   the Earth's caps), those visits are held to LIVE_ADDRESS_VISITS (ADDRESS_VISITS if unset) a day
//   from one address (an IPv6 one by its /48), as the Earth's are to its 8: each with the same
//   connections a minute and a day as any visit. But a visit count doesn't bound what each
//   connection spends (up to 20 messages a second, about 3,700 requests an hour, even alone), so
//   each address's connections, on any world and from any visit but the owner's, may spend only a
//   share of that world's budget in a day: the budget over LIVE_ADDRESS_SHARE (ADDRESS_SHARE, 8, if
//   unset), but never less than LIVE_ADDRESS_FLOOR (ADDRESS_FLOOR, 1,000, if unset), so a small
//   world's share is still a drive of a while (Vesta's 3,000 over 8 would be 375, under half an hour
//   with others in sight). Rooms report what each address's connections spent themselves (by `from`)
//   on the world they were on, DriveLimits adds it up, the room closes that address's connections on
//   that world once it's past (CLOSE.off with SHARE_SPENT to a v3 page, which then drives on alone
//   there and with others elsewhere; CLOSE.rate to an older one, as it always was) and /api/live
//   turns it away there for the rest of the day. What a connection that went had spent is kept in
//   the attachment of one still there (keepFrom's owed), so it outlasts hibernation, or reported as
//   the room empties, so leaving doesn't get round it. One address alone can't spend a world's day:
//   with what it can spend in the minute before a report closes it, it takes several. In a party,
//   where a page says it is would let a connection let in on one world drive on another: so a
//   party's room knows which worlds' days are spent (CLOSED, from /api/live, and its own reports) and
//   which its drivers' addresses are past their share of (OVER, from /api/live, and its own reports),
//   closes at once a driver who says it's on one (DriveRoom's stopped), and counts what a connection
//   that moved onto a spent world had spent against the world it was let in on (admitted).
// - Limits: a connection's attachment (what it keeps through hibernation) at most 16,384 bytes,
//   ours well under 2 KB; 32,768 WebSockets a Durable Object, far more than a room lets in.

// What /api/live checked, handed to the room in headers of its own, on a fresh request: a page's
// own headers never reach the room.
const VISIT = 'X-Live-Visit';
const EXPIRES = 'X-Live-Expires';
const ROOM = 'X-Live-Room';
// The protocol's version the page speaks (1, 2 or 3, see live-protocol.js), and the world the
// connection is on: an area's own, or for a party the one its page says it's on.
const VERSION = 'X-Live-Version';
const WORLD = 'X-Live-World';
// The connection's number among its visit's today (DriveLimits' liveOpen), and, alone, the visit a
// room is to let go of because it has connected to another room (with that connection's number).
const SEQ = 'X-Live-Seq';
const LEAVE = 'X-Live-Leave';
// Where the connection comes from, as the challenges' keyed hash of the address's /48 and the day
// (lookKey): only so a party knows whether two of its drivers are on one address (partied), never
// the address itself.
const FROM = 'X-Live-From';
// The worlds whose day's budget is spent (or switched off), as DriveLimits said when the connection
// was let in (live world ids, comma-separated; none, empty): a party's room lets nobody move onto
// one of them (DriveRoom's closedTo).
const CLOSED = 'X-Live-Closed';
// Present ('1') for the owner's visits, whose spend isn't held to an address's share (see report).
const UNCOUNTED = 'X-Live-Uncounted';
// The other worlds, for a party's room, whose day's share the connection's address is past, as
// DriveLimits said when it was let in (live world ids, comma-separated; none, empty): the room lets
// it drive on the world it was let in on, and not move onto those (DriveRoom's overTo).
const OVER = 'X-Live-Over';
// The parts of a driver only kept in memory, not in its attachment: when its car last moved and
// when it was last sent the others' (counts of the room's own, which start again when it wakes),
// when its state came in, and a hello being looked up with the messages that came in behind it.
const MEMORY = [ 'moved', 'sent', 'sAt', 'held', 'pending', 'queue', 'wantsLook' ];
const encoder = new TextEncoder();
// What a room counts of its spend, in billed Durable Object requests (see the costs above):
// connecting, each incoming message, each alarm, each report to DriveLimits.
const COST = { connect: 1, message: 1 / 20, alarm: 1, report: 1 };
// A room reports what it has spent at most REPORT_MS apart while anyone's in it: at the alarm, which
// is set no later than that. An alarm that comes for something else within REPORT_EARLY of the next
// report makes it then, so there aren't two alarms close together: as for a page sending only
// keepalives, whose idle check falls IDLE_MS - KEEPALIVE_MS (50 s) or more after the last alarm.
// But with less than REPORT_LEAST (billed requests) to report, as in a room of drivers each alone
// or parked, it waits, up to REPORT_MOST: the alarm and report would be nearly all it spends.
const REPORT_MS = 60000;
const REPORT_EARLY = 10000;
const REPORT_LEAST = 5;
const REPORT_MOST = 10 * 60000;
// Someone coming, going, dropping in or going back to the globe changes who's driving now: the room
// reports that DOTS_SOON after (an alarm then, so a few changes together make one report), but no
// sooner than DOTS_GAP after its last report, so a page coming and going can't have it report more
// than four times a minute (a room counts from its first connection as from a report, so its first
// is DOTS_GAP after that). The globe has a newcomer within about half a minute (online.js).
const DOTS_SOON = 3000;
const DOTS_GAP = 15000;
// The most addresses a report says what they spent (a room has at most a few dozen connections).
const ADDRESSES_MOST = 64;
// The most addresses one connection's attachment holds what others from them spent before they went
// (keepFrom's owed): each about 60 bytes, so an attachment stays well under 2 KB.
const OWED_MOST = 8;
// How long (ms) a room remembers a visit gone to another room (DriveRoom's moveOn).
const ELSEWHERE_MS = 60000;
// /api/online's answer is kept this long (ms), by Cloudflare's cache and by browsers; when
// DriveLimits couldn't be asked, only ONLINE_FAILED_MS. A room's dots in DriveLimits are left out
// once they're ONLINE_TTL old: a room that's still there reports at least every REPORT_MOST (and
// within a minute of that, at its next alarm), so only one that went without a word is.
const ONLINE_MS = 30000;
const ONLINE_FAILED_MS = 10000;
const ONLINE_TTL = 12 * 60000;
const DAY_MS = 24 * 60 * 60000;
// Each world's budget for the day (billed requests) when its setting (BUDGET_VARS) is unset. On
// the Free plan all five come to 70,000 of its 100,000, the rest for visits and scores
// (wrangler.drive.jsonc); a far world's is small, as only its own drivers spend it (see the costs
// above).
export const DEFAULT_BUDGETS = Object.freeze( { [ EARTH ]: 40000, [ MOON_WORLD ]: 20000, mars: 4000, vesta: 3000, ceres: 3000 } );
export const BUDGET_VARS = Object.freeze( {
	[ EARTH ]: 'LIVE_DAILY_BUDGET', [ MOON_WORLD ]: 'LIVE_MOON_DAILY_BUDGET', mars: 'LIVE_MARS_DAILY_BUDGET', vesta: 'LIVE_VESTA_DAILY_BUDGET', ceres: 'LIVE_CERES_DAILY_BUDGET',
} );
// The far worlds: those whose budgets are small, never charged for /api/config or /api/online.
const FAR = LIVE_WORLD_IDS.filter( w => w !== EARTH && w !== MOON_WORLD );
// The day (and budget) DriveLimits said was spent on each world, so this Worker instance doesn't ask
// again that day: an ask is a Durable Object request too. And when it last said the days were open,
// which /api/config takes for OPEN_MS: every page load asks, and anyone can ask without a visit, so
// each asking DriveLimits would let a loop of requests spend the day's budget by itself. Once the
// Earth's and the Moon's are both known spent here, the far worlds' state is asked again only every
// FAR_OPEN_MS (farDay: when it last was), and that ask is counted against the Earth's spent day,
// never theirs.
const spentDays = Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, null ] ) );
let openDay = null;
let farDay = null;
const OPEN_MS = 30000;
const FAR_OPEN_MS = 10 * 60000;
// Requests arriving together as what's kept runs out would each ask DriveLimits (Cloudflare's cache
// doesn't make them wait for one another's), so a burst of them could spend the day's budget by
// itself. So while this Worker instance has one ask out for /api/config (openAsking) or for
// /api/online (onlineAsking: { key, at }), the others are answered with what it last heard, a
// little old, rather than asking too. An ask is given up on after ASKING_MS, in case its request
// was cancelled before it came back. What it last heard for /api/online, onlineHeard, is kept for
// each world's address as plain values ({ key, answer, keep, at, date }), as a Response or a call's
// promise belongs to the request it was made in.
let openAsking = null;
let onlineAsking = null;
const onlineHeard = new Map();
const ASKING_MS = 5000;
// The most connections a visit makes in a day, unless LIVE_VISIT_CONNECTS says otherwise (a page
// makes one each time it changes room, or comes back after a dropped connection: a few dozen in six
// hours of driving from area to area). Past that DriveLimits turns it away, and this Worker
// instance remembers the visit until it runs out, rather than asking again.
const VISIT_CONNECTS = 200;
const refusedVisits = new Map();
// The most visits not counted against the Earth's caps (the free worlds') that connect to rooms from
// one address in a day, unless LIVE_ADDRESS_VISITS says otherwise (see DriveLimits' liveOpen).
const ADDRESS_VISITS = 20;
// And what one address's connections may spend in a day on each world: that world's budget over
// ADDRESS_SHARE (LIVE_ADDRESS_SHARE if set, and not 0), so it takes at least that many addresses to
// spend a day's budget, however their connections are used (see DriveLimits' liveSpent); but never
// less than ADDRESS_FLOOR (LIVE_ADDRESS_FLOOR if set; 0 for none), so on a small budget an address
// still has a drive of a while (it then takes fewer addresses to spend that world's day). An address
// turned away (by its keyed hash, `from`), past its share on a world or its visits, is remembered by
// this Worker instance until midnight UTC (refuseFrom), and turned away before DriveLimits is asked
// again: each ask is a Durable Object request.
const ADDRESS_SHARE = 8;
const ADDRESS_FLOOR = 1000;
const refusedFrom = new Map();

// GET /api/live?room=<room>: a WebSocket to the room. Everything is checked here, before the room
// is asked: a connection turned away costs a Worker request and nothing in a Durable Object.
export async function live( { request, env, url, limits, now } ) {

	if ( request.headers.get( 'Upgrade' )?.toLowerCase() !== 'websocket' ) throw new HttpError( 426, 'Expected a WebSocket', {}, { Upgrade: 'websocket' } );
	// Cross-site WebSocket hijacking: a page on any site may open a WebSocket here (WebSockets have no
	// CORS), but the browser always says whose page it is in Origin. A GET skips checkSameOrigin, so
	// it's checked here.
	if ( request.headers.get( 'Origin' ) !== url.origin ) throw new HttpError( 403, 'Forbidden' );
	if ( liveOff( env ) ) throw new HttpError( 503, 'Driving with others is off just now' );
	const room = parseRoom( url.searchParams.get( 'room' ) );
	if ( ! room ) throw new HttpError( 400, 'Bad request' );
	// The visit's token comes as the last subprotocol, after the protocol's versions, newest first
	// (v1's alone; v2's and then v1's; or v3's, v2's and v1's, see live-protocol.js): a browser can't
	// set headers on a WebSocket, and in the address it would end up in logs.
	const offered = ( request.headers.get( 'Sec-WebSocket-Protocol' ) ?? '' ).split( ',' ).map( part => part.trim() );
	const version = offeredVersion( offered );
	if ( ! version ) throw new HttpError( 400, 'Bad request' );
	const token = offered[ version ];
	// Which world the connection is on: an area's own; for a party, the one the page says (?world=,
	// none for the Earth). A page is never let into the areas of a world its version doesn't know (a
	// v1 page the Moon's, a v2 page Mars's, Vesta's or Ceres's): it would take their cars for the
	// Earth's; nor says it's on one.
	const asked = url.searchParams.get( 'world' );
	if ( asked !== null && ! knows( version, asked ) ) throw new HttpError( 400, 'Bad request' );
	const world = room.kind === 'near' ? room.world : asked ?? EARTH;
	if ( ! knows( version, world ) ) throw new HttpError( 400, 'Bad request' );
	if ( worldOff( env, world ) ) throw new HttpError( 503, 'Driving with others is off just now' );
	const visit = await readVisit( env, token, now );
	if ( ! visit ) throw new HttpError( 401, 'Unauthorized' );
	// Where it comes from (the challenges' keyed hash of the address's /48 and the day): an address
	// already past its share of the world's day, or (for a visit not counted against the Earth's
	// caps) its day's such visits, is turned away here as a visit is. Never the owner's.
	const from = await lookKey( env, request, now );
	const fromKeys = visit.owner ? [] : [ `${ from } ${ world }`, ...( visit.earth ? [] : [ `${ from } visits` ] ) ];
	if ( fromKeys.some( key => ( refusedFrom.get( key ) ?? 0 ) > now ) ) throw new HttpError( 429, 'Too many drivers from here today' );
	// A visit connecting over and over (a loop): at most LIVE_CONNECTS' limit a minute (20) get as
	// far as DriveLimits, on Cloudflare's rate limiter, which is no Durable Object request; and none
	// once DriveLimits has turned it away for the day. A page connects far less often than that.
	if ( refusedVisits.has( visit.id ) ) throw new HttpError( 429, 'Too many connections' );
	if ( env.LIVE_CONNECTS && ! ( await env.LIVE_CONNECTS.limit( { key: visit.id } ) ).success ) throw new HttpError( 429, 'Too many connections' );
	// Only then the day's budget (the world's): a request turned away above costs no Durable Object
	// request. Every visit but the owner's says where it connects from, so DriveLimits can hold each
	// address to its share of the world's day (spend), and a visit not counted against the Earth's
	// caps (a free world's) to its day's such visits too.
	const name = roomName( room );
	const connects = setting( env.LIVE_VISIT_CONNECTS, VISIT_CONNECTS );
	const counted = visit.owner ? {} : {
		address: from, share: addressShare( env ), floor: addressFloor( env ),
		...( visit.earth ? {} : { addressVisits: setting( env.LIVE_ADDRESS_VISITS, ADDRESS_VISITS ) } ),
	};
	const today = await liveToday( { env, limits, now, world, connection: { visit: visit.id, room: name, connects, ...counted } } );
	if ( today.reason === BUDGET_SPENT ) throw new HttpError( 503, 'Lots of drivers today: driving with others is back after midnight UTC', { reason: BUDGET_SPENT } );
	if ( ! today.open ) throw new HttpError( 503, 'Driving with others is off just now' );
	if ( today.refused ) {

		refuse( visit, now );
		if ( today.reason === 'share' ) refuseFrom( `${ from } ${ world }`, now );
		if ( today.reason === 'address' ) refuseFrom( `${ from } visits`, now );
		throw new HttpError( 429, today.reason === 'address' || today.reason === 'share' ? 'Too many drivers from here today' : 'Too many connections' );

	}

	// A visit is in one room at a time: the one it was in lets go of it first (a page moving on has
	// hung up there already; a page in many rooms at once, or another tab, hasn't).
	if ( today.was ) await leaveRoom( env, today.was, visit.id, today.seq );
	const headers = {
		Upgrade: 'websocket', [ VISIT ]: visit.id, [ EXPIRES ]: String( visit.expiresAt ), [ ROOM ]: name, [ SEQ ]: String( today.seq ), [ FROM ]: from,
		[ VERSION ]: String( version ), [ WORLD ]: world, [ CLOSED ]: today.closed.join( ',' ), [ OVER ]: visit.owner ? '' : today.over.join( ',' ),
		...( visit.owner ? { [ UNCOUNTED ]: '1' } : {} ),
	};
	return env.ROOMS.get( env.ROOMS.idFromName( name ) ).fetch( new Request( 'https://room.internal/', { headers } ) );

}

// The protocol's version a page's offered subprotocols ask for (live-protocol.js), as it offers them
// with its token last: exactly [ v1, token ], [ v2, v1, token ] or [ v3, v2, v1, token ] (the token
// at offered[ version ]); 0 for anything else.
function offeredVersion( offered ) {

	if ( offered[ 0 ] === PROTOCOL ) return 1;
	if ( offered[ 0 ] === PROTOCOL_WORLDS && offered[ 1 ] === PROTOCOL ) return 2;
	if ( offered[ 0 ] === PROTOCOL_ALL && offered[ 1 ] === PROTOCOL_WORLDS && offered[ 2 ] === PROTOCOL ) return 3;
	return 0;

}

// A visit DriveLimits has turned away for the day, remembered until it runs out (and those run out
// let go of, so the list stays short).
function refuse( visit, now ) {

	if ( refusedVisits.size >= 1000 ) for ( const [ id, until ] of refusedVisits ) if ( until <= now ) refusedVisits.delete( id );
	refusedVisits.set( visit.id, visit.expiresAt );

}

// An address DriveLimits has turned away for the day, as `key`: its keyed hash (`from`) and the
// world whose share it has spent, or 'visits' for its day's visits not counted against the Earth's
// caps. Remembered until midnight UTC, when its keyed hash changes anyway (and those gone let go of,
// so the list stays short).
function refuseFrom( key, now ) {

	if ( refusedFrom.size >= 1000 ) for ( const [ old, until ] of refusedFrom ) if ( until <= now ) refusedFrom.delete( old );
	refusedFrom.set( key, ( Math.floor( now / DAY_MS ) + 1 ) * DAY_MS );

}

// Room `name` letting go of `visit`'s connections from before its connection number `seq` (see
// DriveRoom's moveOn). If it can't be asked just now, they stay there until they go some other way
// (the page hanging up, being idle, its visit running out).
async function leaveRoom( env, name, visit, seq ) {

	try {

		await env.ROOMS.get( env.ROOMS.idFromName( name ) ).fetch( new Request( 'https://room.internal/leave', { headers: { [ LEAVE ]: visit, [ SEQ ]: String( seq ) } } ) );

	} catch ( err ) {

		console.error( 'Live leave', err?.name, err?.message );

	}

}

// Whether driving with others is open at `now`, for /api/live and /api/config.
// For a connection to a room on `world` (/api/live, `connection`: { visit, room, connects, address?,
// share?, floor?, addressVisits? }): { open: true, refused, reason, seq, was, closed, over } (see
// DriveLimits' liveOpen; closed, every other world whose day is spent or that's switched off; over,
// for a party, every other world whose share the address is past), or { open: false, reason } with
// 'off' (LIVE, or that world's budget of 0), BUDGET_SPENT (that world's is, today) or 'unknown'
// (DriveLimits couldn't say just now: closed, to be safe, and a page turned away asks /api/config
// again, and tries again, rather than giving up). It always asks, counted against `world`'s.
// For /api/config: every world at once, { open, reason, moon: { open, reason }, worlds: { [ world ]:
// { open, reason } } } (open and reason the Earth's, as they always were), taking an open answer
// heard here in the last OPEN_MS. Its ask is counted against the Earth's day (the Moon's once the
// Earth's is spent; the Earth's again once both are, as it's only a count), never a far world's, and
// once both are spent it's asked at most every FAR_OPEN_MS, and only while some far world isn't known
// here to be spent or off: with them all off, never again that day.
export async function liveToday( { env, limits, now, world = EARTH, connection = null } ) {

	const budgets = budgetsOf( env );
	const dayOn = w => `${ dayOf( now ) } ${ budgets[ w ] }`;
	// What's known here of a world without asking: off, or spent today; null if it has to be asked.
	const known = w => env.LIVE === 'off' || budgets[ w ] === 0 ? { open: false, reason: 'off' }
		: spentDays[ w ] === dayOn( w ) ? { open: false, reason: BUDGET_SPENT } : null;
	// (The Earth's and the Moon's budgets said apart too, for a DriveLimits from before the far worlds.)
	const ask = { now, budgets, budget: budgets[ EARTH ], moonBudget: budgets[ MOON_WORLD ] };
	// Today with every world's budget: an open answer heard on another day, or with other budgets, is
	// no answer.
	const day = `${ dayOf( now ) } ${ LIVE_WORLD_IDS.map( w => budgets[ w ] ).join( ' ' ) }`;

	if ( connection ) {

		const before = known( world );
		if ( before ) return before;
		try {

			const answer = await limits.liveOpen( { ...ask, world, ...connection } );
			if ( answer.open ) {

				// (An Earth room's open answer is an open day for /api/config too, as it always was.)
				if ( world === EARTH ) openDay = { day, at: now };
				// The other worlds closed, as DriveLimits says or as this instance knows already.
				const closed = [];
				for ( const other of LIVE_WORLD_IDS ) {

					if ( other === world ) continue;
					const heard = Array.isArray( answer.closed ) && answer.closed.includes( other );
					if ( heard && budgets[ other ] > 0 ) spentDays[ other ] = dayOn( other );
					if ( heard || known( other ) ) closed.push( other );

				}

				// (And which other worlds' share the connection's address is past.)
				const over = Array.isArray( answer.over ) ? LIVE_WORLD_IDS.filter( other => other !== world && answer.over.includes( other ) ) : [];
				return { open: true, refused: !! answer.refused, reason: answer.reason ?? null, seq: answer.seq ?? 0, was: answer.was ?? null, closed, over };

			}

			spentDays[ world ] = dayOn( world );
			return { open: false, reason: BUDGET_SPENT };

		} catch ( err ) {

			console.error( 'Live budget check', err?.name, err?.message );
			return { open: false, reason: 'unknown' };

		}

	}

	const all = () => {

		const worlds = Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, known( w ) ?? { open: true } ] ) );
		return { ...worlds[ EARTH ], moon: worlds[ MOON_WORLD ], worlds };

	};
	if ( LIVE_WORLD_IDS.every( known ) ) return all();
	// With the Earth's and the Moon's spent, the far worlds' days are asked after only every
	// FAR_OPEN_MS; otherwise as they always were, every OPEN_MS.
	const kept = known( EARTH ) && known( MOON_WORLD ) ? { heard: farDay, keep: FAR_OPEN_MS } : { heard: openDay, keep: OPEN_MS };
	if ( kept.heard?.day === day && now >= kept.heard.at && now < kept.heard.at + kept.keep ) return all();
	// Another page load here is asking just now: open, as it last heard today.
	if ( kept.heard?.day === day && asking( openAsking, now ) ) return all();
	const mine = openAsking = { at: now };
	try {

		const answer = await limits.liveOpen( ask );
		// (A DriveLimits from before the Moon had rooms says one for both; one from before the far
		// worlds had them says nothing of them, and they're taken as open, as their rooms ask anyway.)
		const heard = {
			[ EARTH ]: answer,
			[ MOON_WORLD ]: answer.moon ?? answer,
			...Object.fromEntries( FAR.map( w => [ w, answer.worlds?.[ w ] ?? { open: true } ] ) ),
		};
		for ( const w of LIVE_WORLD_IDS ) if ( heard[ w ]?.open === false && budgets[ w ] > 0 ) spentDays[ w ] = dayOn( w );
		openDay = { day, at: now };
		farDay = { day, at: now };
		return all();

	} catch ( err ) {

		console.error( 'Live budget check', err?.name, err?.message );
		// (What's known here without asking, a world switched off or spent today, is said as it is.)
		const worlds = Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, known( w ) ?? { open: false, reason: 'unknown' } ] ) );
		return { ...worlds[ EARTH ], moon: worlds[ MOON_WORLD ], worlds };

	} finally {

		if ( openAsking === mine ) openAsking = null;

	}

}

// Whether `ask` ({ at }, or null), one out to DriveLimits, is still waited for at `now` (see
// ASKING_MS).
function asking( ask, now ) {

	return ask !== null && now >= ask.at && now < ask.at + ASKING_MS;

}

// GET /api/online: where people are driving now on the Earth, for the globe's dots, and with
// ?world=<world> on another (any of LIVE_WORLD_IDS; anything else is the Earth's): { on, total, areas }
// (see live-protocol.js), how many are driving on every world (worlds), and for a page from before
// Mars had drivers how many on the other of the Earth and the Moon (moon on the Earth's, earth on the
// Moon's). Off on this world but not on every other, the answer says how many are driving elsewhere
// all the same, as the first other world that's open (in LIVE_WORLD_IDS' order) answers, kept as that
// is, so the page can still point to them. Kept ONLINE_MS in Cloudflare's cache (each of its
// locations has its own), under the address without its query but for which world it is, so a
// query can't get round it, and by browsers for what's left of that (its Date says when it was
// made), and by this Worker instance as well (onlineHeard). Only a request that finds none kept asks
// DriveLimits, which counts that against a day's budget: the Moon's for the Moon's, and the Earth's
// for the Earth's and the far worlds' (the Moon's when the Earth's is spent, the far world's own only
// when both are), so watching a far world's globe never spends its small budget; while one is asking,
// the others here are answered with what was last heard, a little old (see onlineAsking). Off (LIVE,
// a budget of 0, or the day's spent on that world, as this Worker instance remembers once it's
// heard), it's on: false, asking nothing for it. If DriveLimits can't say just now, it's nobody (on:
// true), kept ONLINE_FAILED_MS: never an error page. The tests (TEST_CLOCK) keep one for each time
// they say it is (X-Test-Time), so each of their times is asked afresh.
export async function online( { request, env, url, limits, now } ) {

	const asked = url.searchParams.get( 'world' );
	const world = isLiveWorld( asked ) ? asked : EARTH;
	// The one other world a page from before Mars had drivers hears of: the Moon on the Earth's
	// answer, the Earth on the Moon's, none on a far world's.
	const partner = world === EARTH ? MOON_WORLD : world === MOON_WORLD ? EARTH : null;
	const budgets = budgetsOf( env );
	const day = `${ dayOf( now ) } ${ budgets[ world ] }`;
	// Off for the rest of the day: kept no later than midnight UTC, when it's on again (a page that's
	// told it's off shows none of it for the rest of its visit on that world).
	const offToday = Math.min( ONLINE_MS, ( Math.floor( now / DAY_MS ) + 1 ) * DAY_MS - now );
	// How many are driving on the other worlds, for an answer that's off here: the first other world
	// that's open says (its own answer, from where that's kept, or asked for as a request to it would
	// be): its worlds, and its total as the partner's when it's that one; nothing while every other is
	// off too.
	const there = async () => {

		const other = LIVE_WORLD_IDS.find( w => w !== world && ! worldOff( env, w ) && spentDays[ w ] !== `${ dayOf( now ) } ${ budgets[ w ] }` );
		if ( ! other ) return {};
		const address = new URL( url );
		if ( other === EARTH ) address.searchParams.delete( 'world' );
		else address.searchParams.set( 'world', other );
		const answer = await ( await online( { request, env, url: address, limits, now } ) ).json();
		if ( answer.on !== true || ! Number.isInteger( answer.total ) ) return answer.worlds ? { worlds: answer.worlds } : {};
		return { ...( other === partner ? { [ partner ]: answer.total } : {} ), ...( answer.worlds ? { worlds: answer.worlds } : {} ) };

	};
	if ( worldOff( env, world ) ) return onlineAnswer( { on: false, total: 0, areas: [], ...await there() }, ONLINE_MS );
	if ( spentDays[ world ] === day ) return onlineAnswer( { on: false, total: 0, areas: [], ...await there() }, offToday );
	const tested = env.TEST_CLOCK === 'header' && request.headers.has( 'X-Test-Time' );
	const query = [ ...( world === EARTH ? [] : [ `world=${ world }` ] ), ...( tested ? [ `at=${ now }` ] : [] ) ];
	const key = new Request( `${ url.origin }${ url.pathname }${ query.length ? `?${ query.join( '&' ) }` : '' }` );
	// Heard here lately: as Cloudflare's cache would answer, the same Date and all.
	const heard = onlineHeard.get( key.url ) ?? null;
	if ( heard && now >= heard.at && now < heard.at + heard.keep ) return onlineAnswer( heard.answer, heard.keep, heard.date );
	const cache = globalThis.caches?.default;
	const kept = await cache?.match( key ).catch( () => null );
	if ( kept ) return kept;
	// Another request here is asking just now: what was last heard, kept nowhere.
	if ( heard && onlineAsking?.key === key.url && asking( onlineAsking, now ) ) return onlineAnswer( heard.answer, 0 );
	const mine = onlineAsking = { key: key.url, at: now };

	let answer;
	let keep = ONLINE_MS;
	try {

		const found = await limits.liveOnline( { now, budgets, budget: budgets[ EARTH ], moonBudget: budgets[ MOON_WORLD ], world, ttl: ONLINE_TTL, most: ONLINE_AREAS } );
		if ( found.open ) {

			answer = {
				on: true, total: found.total, areas: found.areas,
				...( partner ? { [ partner ]: Number.isInteger( found.elsewhere ) ? found.elsewhere : 0 } : {} ),
				...( isObject( found.worlds ) ? { worlds: worldsOf( found.worlds ) } : {} ),
			};

		} else {

			spentDays[ world ] = day;
			answer = { on: false, total: 0, areas: [], ...await there() };
			keep = offToday;

		}

	} catch ( err ) {

		console.error( 'Live online', err?.name, err?.message );
		answer = { on: true, total: 0, areas: [], ...( partner ? { [ partner ]: 0 } : {} ) };
		keep = ONLINE_FAILED_MS;

	}

	const response = onlineAnswer( answer, keep );
	// (Only a few addresses are ever asked for, but the tests' each time is one of its own.)
	if ( onlineHeard.size >= 8 ) onlineHeard.clear();
	onlineHeard.set( key.url, { key: key.url, answer, keep, at: now, date: response.headers.get( 'Date' ) } );
	if ( onlineAsking === mine ) onlineAsking = null;
	if ( keep >= 1000 ) await cache?.put( key, response.clone() ).catch( err => console.error( 'Live online cache', err?.name, err?.message ) );
	return response;

}

// Every world's { on, total } as DriveLimits' liveOnline says them, in LIVE_WORLD_IDS' order (a world
// it says nothing of is off, with none).
function worldsOf( found ) {

	return Object.fromEntries( LIVE_WORLD_IDS.map( w => {

		const one = isObject( found[ w ] ) ? found[ w ] : {};
		const on = one.on === true;
		return [ w, { on, total: on && Number.isInteger( one.total ) && one.total > 0 ? one.total : 0 } ];

	} ) );

}

// An answer for /api/online, kept `keep` ms (to the second) from `date` (an HTTP date: now, unless
// it's one heard before).
function onlineAnswer( answer, keep, date = new Date().toUTCString() ) {

	return json( answer, 200, { 'Cache-Control': `public, max-age=${ Math.floor( keep / 1000 ) }`, Date: date } );

}

// The day's budget for driving with others on `world` (one of LIVE_WORLD_IDS; any other throws), in
// billed Durable Object requests: its setting (BUDGET_VARS: the Earth's LIVE_DAILY_BUDGET, the
// Moon's LIVE_MOON_DAILY_BUDGET, Mars's LIVE_MARS_DAILY_BUDGET, ...), or DEFAULT_BUDGETS' when it's
// unset. 0 switches that world off.
export function dailyBudget( env, world = EARTH ) {

	if ( ! isLiveWorld( world ) ) throw new TypeError( `Not a world driving with others is on: ${ world }` );
	return setting( env[ BUDGET_VARS[ world ] ], DEFAULT_BUDGETS[ world ] );

}

// Every world's budget for the day: { [ world ]: budget }.
export function budgetsOf( env ) {

	return Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, dailyBudget( env, w ) ] ) );

}

// How many shares of each world's day there are, one address being let spend one (ADDRESS_SHARE).
function addressShare( env ) {

	return setting( env.LIVE_ADDRESS_SHARE, ADDRESS_SHARE ) || ADDRESS_SHARE;

}

// The least an address's share of a world's day is (ADDRESS_FLOOR; LIVE_ADDRESS_FLOOR, 0 for none).
function addressFloor( env ) {

	return setting( env.LIVE_ADDRESS_FLOOR, ADDRESS_FLOOR );

}

// Switched off: LIVE=off, or a budget of 0 on every world.
function liveOff( env ) {

	return env.LIVE === 'off' || LIVE_WORLD_IDS.every( w => dailyBudget( env, w ) === 0 );

}

// Switched off on `world`: LIVE=off, or that world's budget is 0.
function worldOff( env, world ) {

	return env.LIVE === 'off' || dailyBudget( env, world ) === 0;

}

// The reason CLOSE.off comes with to a connection whose world is switched off (worldOff): 'off'
// when it's switched off everywhere (liveOff), the end of driving with others for the visit, else
// WORLD_OFF, that world only.
function offReason( env ) {

	return liveOff( env ) ? 'off' : WORLD_OFF;

}

// A room's one name, whichever way it was written ('near:1277.01088#0' is 'near:1277.1088'; the
// other worlds' 'moon:...', 'mars:...' the same way).
function roomName( room ) {

	if ( room.kind === 'party' ) return `party:${ room.code }`;
	return room.shard ? shardOf( room.cell, room.shard ) : room.cell;

}

// One room. It uses the WebSocket Hibernation API: between messages it can be taken out of memory
// while its WebSockets stay connected, and it's woken (the constructor runs again) by the next
// message, close or alarm. So what it must know about each connection is in that connection's
// attachment (serializeAttachment), and what's only in memory (the counts flush keeps) is fine to
// lose: everyone's latest state goes again with their next message.
//
// An attachment, a driver: { visit, seq (its number among the visit's connections today), expires,
// from (where it connects from, FROM), room, at (connected), heard (last message, a keepalive included), tokens, filled (the rate's
// bucket and when it was counted), honk (the last), left (closed by the room), spent (billed
// requests the room hasn't reported yet), reported (when the room last reported), shown (the dots
// of who's driving now it reported then, see dots), version (the protocol's its page speaks: 1, 2
// since the Moon had drivers, 3 since Mars, Vesta and Ceres have), world (the one it's on: an area's
// own, or in a party where its page last said it was: see worldOf), and once it has said hello pid,
// name, star, level, title, vehicle, look, place, away, s, globe (on the globe, the world whose globe
// its page said it's looking at, v3; null otherwise); and when there's any, carry (spent for another
// world, see charge), owed (spent by others gone, by address, see keepFrom), closed (see closedTo)
// and over (see overTo) }. An attachment saved before the far worlds had rooms has only the Earth's
// and the Moon's in carry and owed: what's missing is none (Number( x ) || 0).
export class DriveRoom extends DurableObject {

	constructor( ctx, env ) {

		super( ctx, env );
		this.drivers = new Map();
		// Each connection's ask for its construction rides while D1 is answering it, and the
		// connections with a change of ride waiting on it (rideOf, lookLater): in memory only.
		this.asking = new Map();
		this.looking = new Set();
		// States taken (moves), and how many of them and when the last batch went out; whether the next
		// batch is to go now (a car's first state).
		this.moves = 0;
		this.flushed = 0;
		this.flushedAt = 0;
		this.urgent = false;
		// Spent by connections that went with nobody left to carry it (on each world, see charge):
		// reported as the room empties.
		this.leftover = zeros();
		// What connections that went had spent themselves since the last report, by where they came
		// from (`from`) and world, for the next report (see own), when nobody was left to hold it in
		// their attachment (keepFrom): in memory only, so the room reports it before it can hibernate.
		this.fromLeft = new Map();
		// Messages from each connection the room has closed that its page went on sending (unheeded),
		// and whether the room is resetting for one.
		this.unheard = new WeakMap();
		this.aborting = false;
		// Visits gone to another room lately (moveOn): { seq, at } by visit.
		this.elsewhere = new Map();
		// The room's name, and the dots it last reported (see shownKey), once they're known.
		this.name = null;
		this.shown = undefined;

	}

	async fetch( request ) {

		const now = Date.now();
		const leaving = request.headers.get( LEAVE );
		if ( leaving ) {

			this.moveOn( leaving, Number( request.headers.get( SEQ ) ) || 0, now );
			return new Response( null, { status: 204 } );

		}

		const room = parseRoom( request.headers.get( ROOM ) );
		const visit = request.headers.get( VISIT );
		const expires = Number( request.headers.get( EXPIRES ) );
		const seq = Number( request.headers.get( SEQ ) ) || 0;
		const from = request.headers.get( FROM ) ?? '';
		const spoken = request.headers.get( VERSION );
		const version = spoken === '3' ? 3 : spoken === '2' ? 2 : 1;
		const said = request.headers.get( WORLD );
		const world = room?.kind === 'near' ? room.world : knows( version, said ) ? said : EARTH;
		const closed = ( request.headers.get( CLOSED ) ?? '' ).split( ',' ).filter( isLiveWorld );
		const uncounted = request.headers.get( UNCOUNTED ) === '1';
		const overWorlds = uncounted ? [] : ( request.headers.get( OVER ) ?? '' ).split( ',' ).filter( isLiveWorld );
		if ( request.headers.get( 'Upgrade' ) !== 'websocket' || ! room || ! visit || ! Number.isFinite( expires ) ) return new Response( 'Bad request', { status: 400 } );

		const name = roomName( room );
		this.name = name;
		const here = this.sockets();
		// The same visit again (another tab, or the page reconnecting) takes its own place.
		const before = here.filter( ws => this.driver( ws ).visit === visit );
		const [ client, server ] = Object.values( new WebSocketPair() );
		this.ctx.acceptWebSocket( server );

		if ( this.movedOn( visit, seq, now ) ) {

			// Its visit is in another room already, from a connection made after this one.
			server.close( CLOSE.replaced, 'replaced' );
			this.charge( COST.connect, server, world );
			if ( ! uncounted ) this.keepFrom( from, world, COST.connect );

		} else if ( here.length - before.length >= this.max( room ) ) {

			// Accepted only to say so: the page then tries the area's next shard. Connecting was a
			// request all the same.
			send( server, { t: 'full', room: name, max: this.max( room ) } );
			server.close( CLOSE.full, 'full' );
			this.charge( COST.connect, server, world );
			if ( ! uncounted ) this.keepFrom( from, world, COST.connect );

		} else {

			// Its spend starts with connecting, and the room's reports go on as they were (or start).
			// Kept before the connection it replaces goes, so that one's unreported spend has this to go
			// with, and the room's last report is still known from it. The world it was let in on is
			// kept (admitted), which worlds were closed then, if any (closed, see closedTo), and which its
			// address was past its share of (over, see overTo). What it
			// spends itself (own), apart from what it carries for others, is held to its address's share
			// of the day (see report), unless it's the owner's (uncounted).
			const driver = {
				visit, seq, expires, from, room: name, version, world, admitted: world, at: now, heard: now, tokens: BURST, filled: now, honk: 0, pid: null,
				spent: COST.connect, own: COST.connect, reported: this.reportedAt( server ) ?? now, shown: this.shownKey(), moved: 0, sent: 0,
				...( closed.length ? { closed: { day: dayOf( now ), worlds: closed } } : {} ), ...( overWorlds.length ? { over: { day: dayOf( now ), worlds: overWorlds } } : {} ),
				...( uncounted ? { uncounted } : {} ),
			};
			this.drivers.set( server, driver );
			this.save( server, driver );
			for ( const ws of before ) this.shut( ws, CLOSE.replaced, 'replaced' );
			// (The room may have heard since /api/live asked that its world's day is spent.)
			if ( this.closedTo( world, now ) ) this.shutClosed( server, driver );
			await this.wake( Math.min( now + HELLO_MS, expires ) );

		}

		return new Response( null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': version >= 3 ? PROTOCOL_ALL : version >= 2 ? PROTOCOL_WORLDS : PROTOCOL } } );

	}

	async webSocketMessage( ws, message ) {

		const driver = this.driver( ws );
		if ( driver.left ) return this.unheeded( ws );
		await this.take( ws, driver, message );
		// Closed by the room for this message (or what came of it) with nobody left in it: what the room
		// spent, and what that connection spent itself (fromLeft), is reported now, as when the last
		// connection goes (gone). Kept in memory, it would be lost if the room hibernated before the page
		// answered the close, which a script needn't ever do.
		if ( driver.left && ! this.sockets().length && this.owing() + this.fromLeft.size > 0 ) await this.report( Date.now(), 0 );

	}

	// A message from a connection the room hasn't closed (webSocketMessage).
	async take( ws, driver, message ) {

		const now = Date.now();
		// Every message in is billed, whatever becomes of it (each way on from here saves it).
		driver.spent = ( driver.spent ?? 0 ) + COST.message;
		driver.own = ( driver.own ?? 0 ) + COST.message;
		if ( worldOff( this.env, this.worldOf( driver ) ) ) return this.shut( ws, CLOSE.off, offReason( this.env ) );
		if ( now >= driver.expires ) return this.shut( ws, CLOSE.expired, 'expired' );
		if ( typeof message !== 'string' ) return this.shut( ws, CLOSE.protocol, 'text only' );
		// The keepalive, answered here, before hello too: held to the rate as anything else is.
		if ( message === PING ) {

			driver.heard = now;
			if ( ! spend( driver, now ) ) return this.shut( ws, CLOSE.rate, 'too many messages' );
			send( ws, PONG );
			this.save( ws, driver );
			return this.flush( now );

		}

		if ( tooLong( message, driver.pid || driver.pending ? MAX_MESSAGE : MAX_HELLO ) ) return this.shut( ws, CLOSE.protocol, 'too long' );
		const m = parse( message );
		if ( ! m ) return this.shut( ws, CLOSE.protocol, 'bad message' );

		driver.heard = now;
		// (A honk too soon after the last is dropped by handle, after it's taken from the rate.)
		if ( ! spend( driver, now ) ) return this.shut( ws, CLOSE.rate, 'too many messages' );

		if ( m.t === 'hello' ) {

			if ( driver.pid || driver.pending ) return this.shut( ws, CLOSE.protocol, 'hello again' );
			return this.hello( ws, driver, m );

		}

		// What comes in behind a hello still being looked up waits for it, in order.
		if ( driver.pending ) {

			driver.queue.push( [ m, now ] );
			return this.save( ws, driver );

		}

		if ( ! driver.pid ) return this.shut( ws, CLOSE.protocol, 'hello first' );
		if ( ! this.handle( ws, driver, m, now ) ) return this.shut( ws, CLOSE.protocol, 'bad message' );
		this.save( ws, driver );
		this.flush( now );
		if ( ( m.t === 'place' || m.t === 'away' ) && ! driver.left ) await this.dotsSoon( now );

	}

	// hello: who's driving what, where. The name is the leaderboard's for a player whose id and
	// secret check out (never one the page sends), with a ⭐ for a supporter's and their level and
	// title (levels.js); anyone else, or everyone while the database can't say, is a guest.
	async hello( ws, driver, m ) {

		const vehicle = checkVehicle( m.vehicle );
		const look = checkLook( m.look );
		// No place: on the globe, not dropped in anywhere yet.
		const somewhere = m.place !== null && m.place !== undefined;
		let place = somewhere ? placeOf( m.place, driver ) : null;
		if ( ! vehicle || ! look || ( somewhere && ! place ) ) return this.shut( ws, CLOSE.protocol, 'bad hello' );
		// Which world it's on: where it dropped in, or on the globe the one it says (v2 and on: one its
		// version knows, as its place's is by now, see placeOf). An area's room is on its own world
		// whatever's said: a place on another is no place here.
		const room = parseRoom( driver.room );
		if ( room?.kind === 'near' ) {

			if ( place && placeWorld( place ) !== room.world ) place = null;

		} else driver.world = place ? placeWorld( place ) : saidWorld( m.world, driver ) ?? driver.world;
		if ( this.stopped( ws, driver, Date.now() ) ) return;

		driver.pending = true;
		driver.queue = [];
		this.save( ws, driver );
		const { name, star, level, title, player, account } = await this.nameOf( m.player, driver.visit );
		// Gone while it was looked up.
		if ( this.drivers.get( ws ) !== driver || driver.left || ws.readyState !== WebSocket.OPEN ) return;
		// The player and their account (for a party's count), and for a construction ride whether they
		// have the achievement that unlocks it (rideOf): without it (a page that's been changed) the
		// others see the default ride. (A ride unlocked later comes with the page's next hello.)
		Object.assign( driver, { player, account, wants: vehicle } );
		const shown = await this.rideOf( ws, driver, vehicle );
		if ( this.drivers.get( ws ) !== driver || driver.left || ws.readyState !== WebSocket.OPEN ) return;

		const taken = new Set( this.sockets().map( other => this.driver( other ).pid ) );
		let pid = randomToken( 6 );
		while ( taken.has( pid ) ) pid = randomToken( 6 );
		const away = m.away === true || ( somewhere && ! place );
		Object.assign( driver, { pid, name, star, level, title, vehicle: shown, look, place, away, globe: away ? saidWorld( m.globe, driver ) : null, s: null, pending: false } );
		const others = this.helloed().filter( other => other !== ws ).map( other => playerFor( this.driver( other ), driver ) );
		send( ws, { t: 'welcome', you: pid, name, star, room: driver.room, max: this.max( parseRoom( driver.room ) ), players: others } );
		driver.sent = this.moves;
		this.broadcast( to => ( { t: 'join', player: playerFor( driver, to ) } ), ws );

		const queue = driver.queue;
		driver.queue = null;
		for ( const [ next, at ] of queue ) {

			if ( ! this.handle( ws, driver, next, at ) ) return this.shut( ws, CLOSE.protocol, 'bad message' );
			if ( driver.left ) return;

		}

		this.partied( Date.now() );
		this.save( ws, driver );
		this.flush( Date.now() );
		await this.dotsSoon( Date.now() );

	}

	// In a party with someone else: each player there not yet counted for it who has another player
	// with them (not one of their own account's), or anyone connecting from another address, has the
	// party counted (achievements.js's creditParty: once a party, written after the answer), so both
	// whoever made it and whoever joined it get it. One person in two tabs (two visits, one player or
	// none, one address) is no one else. Nothing for an area's room.
	partied( now ) {

		const room = parseRoom( this.name );
		if ( room?.kind !== 'party' ) return;
		const here = this.helloed().map( ws => [ ws, this.driver( ws ) ] );
		for ( const [ ws, d ] of here ) {

			if ( ! d.player || d.partied ) continue;
			// Where the player is connected from here (all their tabs and devices in the party).
			const own = new Set( here.filter( ( [ , o ] ) => o.player && ( o.player === d.player || ( o.account && o.account === d.account ) ) ).map( ( [ , o ] ) => o.from ) );
			if ( ! here.some( ( [ , other ] ) => companion( d, other, own ) ) ) continue;
			d.partied = true;
			this.save( ws, d );
			const counting = creditParty( this.env, d.player, room.code, now ).catch( err => console.error( 'Party count', err?.name, err?.message ) );
			this.ctx.waitUntil?.( counting );

		}

	}

	// The ride the others see driver `driver` (on `ws`) in when they pick `vehicle`: theirs, or the
	// default ride for a construction ride whose achievement they don't have (a guest never has one).
	// Only a construction ride asks D1, and then once a connection for all of them (achievements.js's
	// unlockedRides: one look by key for every construction ride's achievement, for the player and
	// their account's players, 14 rows alone, about 280 at most for an account). The answer is
	// kept with the driver (in its attachment), so a page going back and forth between rides, or
	// trying each in turn, doesn't ask again; and while it's being asked, the ask itself is kept
	// (this.asking, in memory only), so a burst of looks or a hello and a look at once wait on that
	// one ask rather than each starting its own. Nothing is read for any other ride, so a hello
	// costs what it did before achievements.
	async rideOf( ws, driver, vehicle ) {

		const feat = rideFeat( vehicle );
		if ( ! feat ) return vehicle;
		if ( ! driver.player ) return DEFAULT_RIDE;
		if ( ! driver.rides ) {

			let asking = this.asking.get( ws );
			if ( ! asking ) {

				asking = unlockedRides( database( this.env ), driver.player );
				this.asking.set( ws, asking );
				// Settled: kept with the driver if it answered, and asked again next time if it didn't.
				asking.then( rides => driver.rides = rides, () => {} ).finally( () => this.asking.delete( ws ) );

			}

			try {

				await asking;

			} catch ( err ) {

				// No database just now: the default ride, and asked again next time.
				console.error( 'Live ride', err?.name, err?.message );
				return DEFAULT_RIDE;

			}

		}

		return this.shownRide( driver, vehicle );

	}

	// The ride the others see for `vehicle` from what's known of the driver's rides now (rideOf):
	// a construction ride not known to be unlocked is the default ride.
	shownRide( driver, vehicle ) {

		const feat = rideFeat( vehicle );
		return ! feat || ( driver.player && driver.rides?.[ feat ] ) ? vehicle : DEFAULT_RIDE;

	}

	// A ride changed (look) to a construction ride before this connection's rides are known: told to
	// the others once D1 has said (rideOf), in whatever ride and look the page has picked by then
	// (driver.wants, wantsLook). One at a time a connection: looks sent meanwhile only change what it
	// tells, so a burst of them is one ask and one message to the others.
	async lookLater( ws, driver ) {

		this.looking.add( ws );
		try {

			await this.rideOf( ws, driver, driver.wants );

		} finally {

			this.looking.delete( ws );

		}

		if ( this.drivers.get( ws ) !== driver || driver.left || ws.readyState !== WebSocket.OPEN ) return;
		const look = driver.wantsLook ?? driver.look;
		const shown = this.shownRide( driver, driver.wants );
		delete driver.wantsLook;
		Object.assign( driver, { vehicle: shown, look } );
		this.broadcast( { t: 'look', pid: driver.pid, vehicle: shown, look }, ws );
		this.save( ws, driver );

	}

	// { name, star, level, title, player, account } for hello's player: { id, secret } as the
	// leaderboard has them, or anything else from `visit`, a guest with no level (null). A guest's
	// four figures are its visit's, so they stay the same each time it connects (Hide, by name,
	// holds; a friend coming back is the same guest).
	async nameOf( player, visit ) {

		try {

			if ( isObject( player ) ) {

				const { id, secret } = credentials( player );
				const row = await database( this.env ).prepare( `SELECT p.name, ${ hasPass( 'p.account_id', '?3' ) } AS star, ${ xpOf( 'p' ) } AS xp, p.title, p.account_id
					FROM players p WHERE p.id = ?1 AND ${ secretOk( 'p', '?2' ) }` ).bind( id, await sha256Hex( secret ), supporterEmails( this.env ) ).first();
				if ( row ) return { name: row.name, star: !! row.star, ...standingOf( row.xp, row.title ), player: id, account: row.account_id ?? null };

			}

		} catch ( err ) {

			// Not a player's shape (credentials), or no database just now: a guest either way.
			if ( ! ( err instanceof HttpError ) ) console.error( 'Live name', err?.name, err?.message );

		}

		const number = parseInt( ( await sha256Hex( `guest ${ visit }` ) ).slice( 0, 8 ), 16 ) % 10000;
		return { name: `Guest ${ String( number ).padStart( 4, '0' ) }`, star: false, level: null, title: null, player: null, account: null };

	}

	// One message from a driver who has said hello; false for one it can't take. A state that isn't
	// one a car could be in is only dropped: a page's physics can blink out for a frame (a NaN, a fall
	// through the world), and that shouldn't cost it its place.
	handle( ws, driver, m, now ) {

		const { pid } = driver;
		switch ( m.t ) {

			case 's': {

				// (On its own world: no two worlds' frames overlap (STATE_RADII), so one in the
				// another's is no car's.)
				const s = checkState( m.s, this.worldOf( driver ) );
				// Alone in the room a page sends none (live-protocol.js): one that does anyway, or one
				// on its way as the last of the others left, is dropped, so whoever comes next isn't
				// shown where the car was a while ago. Its page sends it again as it hears them join.
				if ( ! s || this.alone( ws ) ) return true;
				// A car's first state (since it said hello, dropped in, or had the room to itself)
				// goes out at once: otherwise it would wait for the next message, which from cars
				// sitting still can be 1 / STILL_HZ away. And one held back for FLUSH_MS or more (see
				// flush) goes with this, rather than lost under it: at SEND_HZ, a gap of two.
				if ( ! driver.s ) this.urgent = true;
				else if ( driver.moved > this.flushed && now - driver.sAt >= FLUSH_MS ) driver.held = { s: driver.s, at: driver.sAt, moved: driver.moved };
				driver.s = s;
				driver.sAt = now;
				driver.moved = ++ this.moves;
				return true;

			}

			case 'look': {

				const vehicle = checkVehicle( m.vehicle );
				const look = checkLook( m.look );
				if ( ! vehicle || ! look ) return false;
				driver.wants = vehicle;
				// A construction ride before this connection's rides are known: the others hear once D1
				// says (lookLater), and while one is waiting, a look meanwhile only changes what it tells.
				const feat = rideFeat( vehicle );
				if ( this.looking.has( ws ) || ( feat && driver.player && ! driver.rides ) ) {

					driver.wantsLook = look;
					if ( this.looking.has( ws ) ) return true;
					const asking = this.lookLater( ws, driver ).catch( err => console.error( 'Live look', err?.name, err?.message ) );
					this.ctx.waitUntil?.( asking );
					return true;

				}

				const shown = this.shownRide( driver, vehicle );
				Object.assign( driver, { vehicle: shown, look } );
				this.broadcast( { t: 'look', pid, vehicle: shown, look }, ws );
				return true;

			}

			case 'place': {

				const place = placeOf( m.place, driver );
				if ( ! place ) return false;
				// A place on another world in an area's room isn't for it (the page moves on to that
				// world's room as it drops in): nothing changes here. In a party it's where the driver
				// is now, its world and all (one its version knows, see placeOf): a page whose version
				// doesn't know that world hears only that they're on the globe (seenBy).
				const room = parseRoom( this.name );
				if ( room?.kind === 'near' && placeWorld( place ) !== room.world ) return true;
				if ( room?.kind !== 'near' ) driver.world = placeWorld( place );
				// Onto a world whose day is spent: closed there and then, as the room would at its next
				// report, before anyone hears where.
				if ( this.stopped( ws, driver, now ) ) return true;
				// (A car's last state on the world it's left is no state on this one.)
				Object.assign( driver, { place, away: false, globe: null } );
				if ( driver.s && ! checkState( driver.s, this.worldOf( driver ) ) ) Object.assign( driver, { s: null, held: null } );
				this.broadcast( to => seenBy( to, driver ) ? { t: 'place', pid, place } : { t: 'away', pid }, ws );
				return true;

			}

			case 'away':
				// Back on the globe: no car where it last was, for anyone joining meanwhile. Which
				// world's rooms and budget it uses, if it says (world, v2 and on, in a party: its budget
				// is that world's), and whose globe it's looking at (globe, v3: only to show its party,
				// never charged; another than world when that one's closed, say).
				Object.assign( driver, { away: true, s: null, globe: saidWorld( m.globe, driver ) } );
				if ( parseRoom( this.name )?.kind !== 'near' ) driver.world = saidWorld( m.world, driver ) ?? driver.world;
				if ( this.stopped( ws, driver, now ) ) return true;
				this.broadcast( to => ( { t: 'away', pid, ...globeFor( driver, to ) } ), ws );
				return true;

			case 'trick': {

				const score = checkTrick( m.score );
				if ( ! score ) return false;
				this.broadcast( to => seenBy( to, driver ) ? { t: 'trick', pid, score } : null, ws );
				return true;

			}

			case 'honk':
				// (Queued behind a hello, it wasn't spaced as it came in: now is when it did.)
				if ( now - driver.honk < HONK_GAP ) return true;
				driver.honk = now;
				this.broadcast( to => seenBy( to, driver ) ? { t: 'honk', pid } : null, ws );
				return true;

			default:
				return false;

		}

	}

	// What's moved since the last batch, to each driver who has said hello: at most one batch every
	// FLUSH_MS, each with only the cars that moved since that driver's last, never its own, and in an
	// area only those within VIEW_RANGE of it (all of them until it has a car of its own), each with
	// how long it's been held here, so the page can tell when it was where it says. There's no
	// timer for it: one would keep the room from hibernating, and so charged for the whole time it
	// waits (see the costs above). It goes with the next message to arrive once it's due, which in a
	// room with cars moving is within a fraction of a second, and at the latest the held car's own
	// next (1 / SEND_HZ on the move; as a car stops its page sends once more at that rate, so where
	// it stopped isn't the one kept waiting 1 / STILL_HZ). A car's first goes at once (urgent).
	flush( now ) {

		if ( this.flushed === this.moves || ( now - this.flushedAt < FLUSH_MS && ! this.urgent ) ) return;
		const drivers = this.helloed().map( ws => [ ws, this.driver( ws ) ] );
		const area = parseRoom( this.name )?.kind === 'near';
		for ( const [ ws, to ] of drivers ) {

			const near = area && to.s;
			const s = [];
			for ( const [ other, from ] of drivers ) {

				if ( other === ws || ! from.s || from.moved <= to.sent || ! seenBy( to, from ) ) continue;
				if ( near && Math.hypot( from.s[ 0 ] - to.s[ 0 ], from.s[ 1 ] - to.s[ 1 ], from.s[ 2 ] - to.s[ 2 ] ) > VIEW_RANGE ) continue;
				if ( from.held && from.held.moved > to.sent ) s.push( [ from.pid, ...from.held.s, now - from.held.at ] );
				s.push( [ from.pid, ...from.s, now - ( from.sAt ?? now ) ] );

			}

			to.sent = this.moves;
			if ( s.length ) send( ws, { t: 'S', at: now, s } );

		}

		for ( const [ , from ] of drivers ) from.held = null;
		this.flushed = this.moves;
		this.flushedAt = now;
		this.urgent = false;

	}

	// The room's one alarm, set only while it has connections: the hello that hasn't come in
	// HELLO_MS, the connection with no word for IDLE_MS (a keepalive counts), the visit that has run
	// out, and the report of what the room has spent (see report). Then it's set for the next of
	// those: once a minute while everyone's there, the reports' REPORT_MS. An alarm is a request and
	// a row written, so no more often than that.
	async alarm() {

		const now = Date.now();
		let next = Infinity;
		// (Known before any of them is let go of below, as the last of them may be the one to know.)
		this.shownKey();
		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			const hello = driver.pid || driver.pending ? Infinity : driver.at + HELLO_MS;
			if ( worldOff( this.env, this.worldOf( driver ) ) ) this.shut( ws, CLOSE.off, offReason( this.env ) );
			else if ( now >= driver.expires ) this.shut( ws, CLOSE.expired, 'expired' );
			else if ( now >= hello ) this.shut( ws, CLOSE.hello, 'no hello' );
			else if ( now >= driver.heard + IDLE_MS ) this.shut( ws, CLOSE.idle, 'idle' );
			else next = Math.min( next, driver.expires, hello, driver.heard + IDLE_MS );

		}

		this.flush( now );
		// This alarm is a request too: in the report, if one's due (or nobody's left, for what the
		// last of them spent, and to take the room's dots off the globe), else counted for the next.
		if ( ! this.sockets().length ) {

			if ( this.owing() > 0 || this.fromLeft.size || this.shownKey() !== '' ) await this.report( now, COST.alarm );

		} else if ( this.reportDue( now ) ) await this.report( now, COST.alarm );
		else this.charge( COST.alarm );
		// Nobody left (or everyone closed by the report, for the budget): the room empties. Someone who
		// came while it was reporting set an alarm of their own, which is kept (wake).
		if ( ! this.sockets().length ) return this.empty();
		// The next report REPORT_MS after the last; one put off (reportDue) no sooner than it would
		// have been, so the alarm doesn't come straight back to put it off again.
		await this.wake( Math.min( next, Math.max( ( this.reportedAt() ?? now ) + REPORT_MS, now + REPORT_MS - REPORT_EARLY ) ) );
		// (Who's driving now changed since this report, or since the last if this one was put off.)
		await this.dotsSoon( now );

	}

	// An area's room whose dots have changed since it last reported (who's driving now): its alarm
	// DOTS_SOON from `now`, no sooner than DOTS_GAP after the last report, unless it's set sooner.
	async dotsSoon( now ) {

		if ( parseRoom( this.name )?.kind !== 'near' || ! this.sockets().length || ! this.dotsChanged() ) return;
		const reported = this.reportedAt();
		await this.wake( Math.max( now + DOTS_SOON, reported === null ? now : reported + DOTS_GAP ) );

	}

	// Whether the alarm at `now` reports: the first time, or from REPORT_EARLY before REPORT_MS since
	// the last, with REPORT_LEAST or more to report, with the room's dots changed since the last (see
	// dots: who's driving now goes on the globe within about a minute), or once it's been REPORT_MOST.
	reportDue( now ) {

		const reported = this.reportedAt();
		if ( reported === null ) return true;
		if ( now >= reported + DOTS_GAP && this.dotsChanged() ) return true;
		if ( now < reported + REPORT_MS - REPORT_EARLY ) return false;
		const unreported = this.sockets().reduce( ( sum, ws ) => sum + ( this.driver( ws ).spent ?? 0 ), this.owing() );
		return unreported >= REPORT_LEAST || now >= reported + REPORT_MOST || this.dotsChanged();

	}

	// The room's drivers as dots for the globe's who's driving now (live-protocol.js's dotsOf), or
	// null for a party, which is private and never says. Those who have said hello and aren't on the
	// globe (a paused driver is parked in the game, so counts), each where its car is; the room has no
	// word of a car alone in it (its page sends none), so then where its driver dropped in, if that's
	// in this area, or else the middle of the area (they drove in from another).
	dots() {

		const room = parseRoom( this.name );
		if ( room?.kind !== 'near' ) return null;
		const drivers = this.helloed().map( ws => this.driver( ws ) ).filter( driver => ! driver.away && ( driver.s || driver.place ) );
		drivers.sort( ( a, b ) => a.at - b.at || ( a.pid < b.pid ? - 1 : 1 ) );
		return dotsOf( drivers.map( ( { s, place } ) => s ? { x: s[ 0 ], y: s[ 1 ], z: s[ 2 ] } : spotIn( place, room.cell, room.world ) ), room.cell );

	}

	// Whether the room's dots aren't what it last reported.
	dotsChanged() {

		const dots = this.dots();
		return dots !== null && keyOf( dots ) !== this.shownKey();

	}

	// The dots the room last reported (keyOf's), kept with `reported` in its connections' attachments
	// so that it outlasts hibernation: '' for none (nothing in DriveLimits), null when the report
	// didn't get through (so the next goes as soon as it may). `also`: a connection that's going, not
	// among those still here.
	shownKey( also = null ) {

		if ( this.shown !== undefined ) return this.shown;
		let at = - Infinity;
		let shown = '';
		for ( const ws of also ? [ ...this.ctx.getWebSockets(), also ] : this.ctx.getWebSockets() ) {

			const driver = this.driver( ws );
			if ( Number.isFinite( driver.reported ) && driver.reported >= at && driver.shown !== undefined ) {

				at = driver.reported;
				shown = driver.shown;

			}

		}

		this.shown = shown;
		return shown;

	}

	shownAs( key ) {

		this.shown = key;
		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			driver.shown = key;
			this.save( ws, driver );

		}

	}

	// What the room has spent since it last said (each connection's, what those gone left, `extra`
	// for the alarm doing this, and this call), added to the day's in DriveLimits; if that's the day's
	// budget spent, everyone is closed with CLOSE.off and BUDGET_SPENT. It's all taken as it's sent,
	// so what comes in meanwhile is counted for the next. If DriveLimits can't be asked, the room
	// carries on as if it's open, and all of it goes with the next report, a minute on. An area's room
	// says where its drivers are too (dots), none once it's empty; and what each address's
	// connections spent themselves (addresses), those of an address past its share of a world's day
	// being closed there.
	async report( now, extra ) {

		const dots = this.dots();
		// Each world's share: each connection's on the world it's on, and what it carries for others
		// (charge), the room's own on its (worldOf).
		const amounts = { ...zeros(), ...this.leftover };
		amounts[ this.worldOf() ] += extra + COST.report;
		this.leftover = zeros();
		// And what each address's connections spent themselves, on the world each is on (own, and what
		// those gone left, owed and fromLeft), so DriveLimits can hold each address to its share of
		// each world's day.
		const spentFrom = this.fromLeft;
		this.fromLeft = new Map();
		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			amounts[ this.worldOf( driver ) ] += driver.spent ?? 0;
			for ( const [ w, carried ] of Object.entries( this.takeCarry( driver ) ) ) amounts[ w ] += carried;
			if ( ! driver.uncounted ) addFrom( spentFrom, driver.from, this.worldOf( driver ), driver.own ?? 0 );
			for ( const [ from, spent ] of this.takeOwed( driver ) ) for ( const w of LIVE_WORLD_IDS ) addFrom( spentFrom, from, w, spent[ w ] );
			Object.assign( driver, { spent: 0, own: 0, reported: now } );
			this.save( ws, driver );

		}

		const addresses = [ ...spentFrom ].slice( 0, ADDRESSES_MOST ).map( ( [ from, spent ] ) => ( { from, ...spent } ) );

		const open = Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, true ] ) );
		let over = null;
		try {

			// Every world's amount and budget (amounts, budgets), and the Earth's and the Moon's said
			// apart as well, as a DriveLimits from before the far worlds had rooms reads them.
			const limits = this.env.LIMITS.get( this.env.LIMITS.idFromName( 'global' ) );
			const budgets = budgetsOf( this.env );
			const answer = await limits.liveSpent( amounts[ EARTH ], {
				now, budget: budgets[ EARTH ], moon: amounts[ MOON_WORLD ], moonBudget: budgets[ MOON_WORLD ], amounts, budgets,
				...( dots ? { online: { room: this.name, dots } } : {} ),
				...( addresses.length ? { addresses, share: addressShare( this.env ), floor: addressFloor( this.env ) } : {} ),
			} );
			// (A DriveLimits from before the Moon had rooms says one for both; one from before the far
			// worlds had them says nothing of them: open, as the room carries on when it can't ask.)
			open[ EARTH ] = answer.open;
			open[ MOON_WORLD ] = answer.moon?.open ?? answer.open;
			for ( const w of FAR ) open[ w ] = answer.worlds?.[ w ]?.open ?? true;
			over = answer.over ?? null;

		} catch ( err ) {

			console.error( 'Live budget report', err?.name, err?.message );
			for ( const w of LIVE_WORLD_IDS ) this.charge( amounts[ w ], null, w );
			for ( const [ from, spent ] of spentFrom ) for ( const w of LIVE_WORLD_IDS ) this.keepFrom( from, w, spent[ w ] );
			if ( dots ) this.shownAs( null );
			return;

		}

		// (With the day's spent, DriveLimits has let go of them too.)
		if ( dots ) this.shownAs( open[ this.worldOf() ] ? keyOf( dots ) : '' );
		// A world whose day's budget is spent is kept as closed in everyone's attachment, so that in a
		// party nobody moves onto it after (closedTo). Those on it are closed (in a party, only them:
		// the others drive on), and what they had spent since is let go, rather than asking again to
		// add it to a spent day; but one let in on another world, still open, has it counted there
		// (shutClosed), so that world's budget bounds what its connections cost.
		const shut = LIVE_WORLD_IDS.filter( w => ! open[ w ] );
		if ( shut.length ) this.closeWorlds( shut, now );
		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			if ( open[ this.worldOf( driver ) ] ) continue;
			if ( open[ driver.admitted ] ) this.shutClosed( ws, driver );
			else {

				driver.spent = 0;
				this.shut( ws, CLOSE.off, BUDGET_SPENT );

			}

		}

		// The connections from an address past its share of their world's day (DriveLimits' over: {
		// earth: [ from ], moon: [ from ], ... }) are closed there (pastShare): a v3 page then drives
		// on alone on that world, and an older one tries again and /api/live turns it away there for
		// the day. Those from it on another world, in a party, keep that world as one they may not
		// move onto (overTo).
		for ( const ws of isObject( over ) ? this.sockets() : [] ) {

			const driver = this.driver( ws );
			if ( driver.uncounted ) continue;
			const past = LIVE_WORLD_IDS.filter( w => Array.isArray( over[ w ] ) && over[ w ].includes( driver.from ) );
			if ( ! past.length ) continue;
			this.overAt( ws, driver, past, now );
			if ( past.includes( this.worldOf( driver ) ) ) this.pastShare( ws, driver );

		}

		if ( ! this.sockets().length ) {

			this.leftover = zeros();
			this.fromLeft = new Map();

		}

	}

	// The world a connection's driver is on: an area's own; in a party where its page last said (one
	// its version knows: the Earth for a page from before the Moon had drivers). With no driver, the
	// room's own, for its alarms and reports (see report): an area's world; a party's the one world
	// everyone in it is on, else the Earth's, unless the Earth's budget is 0 (it would bound nothing):
	// then the open world (not switched off, its day not known spent here) most of them are on, the
	// first in LIVE_WORLD_IDS' order of those as many, and the Earth's if none is open.
	worldOf( driver = null ) {

		const room = parseRoom( this.name );
		if ( room?.kind === 'near' ) return room.world;
		if ( driver ) return isLiveWorld( driver.world ) ? driver.world : EARTH;
		const on = this.sockets().map( ws => this.worldOf( this.driver( ws ) ) );
		if ( on.length && on.every( w => w === on[ 0 ] ) ) return on[ 0 ];
		if ( ! worldOff( this.env, EARTH ) ) return EARTH;
		const now = Date.now();
		let most = null;
		let count = 0;
		for ( const w of LIVE_WORLD_IDS ) {

			if ( worldOff( this.env, w ) || this.closedTo( w, now ) ) continue;
			const here = on.filter( one => one === w ).length;
			if ( most === null || here > count ) [ most, count ] = [ w, here ];

		}

		return most ?? EARTH;

	}

	// `amount` (billed requests) spent on `world` (the room's own, worldOf, unless it says) for the
	// next report, always counted against that world's budget: on a connection still here (not
	// `except`) on that world, as its own spent; with none on that world but someone on another (a
	// party), kept apart in that one's attachment as carried for `world` (carry), so it outlasts
	// hibernation without being counted against the other world's; or with nobody, the room's
	// leftover on that world.
	charge( amount, except = null, world = null ) {

		if ( ! amount ) return;
		const on = world ?? this.worldOf();
		const here = this.sockets().filter( other => other !== except );
		const same = here.find( other => this.worldOf( this.driver( other ) ) === on );
		const ws = same ?? here[ 0 ];
		if ( ! ws ) {

			this.leftover[ on ] = ( this.leftover[ on ] ?? 0 ) + amount;
			return;

		}

		const driver = this.driver( ws );
		if ( same ) driver.spent = ( driver.spent ?? 0 ) + amount;
		else driver.carry = { ...driver.carry, [ on ]: ( driver.carry?.[ on ] ?? 0 ) + amount };
		this.save( ws, driver );

	}

	// What a connection carries for each world (charge), taken off it: { world: amount }.
	takeCarry( driver ) {

		const carry = {};
		for ( const w of LIVE_WORLD_IDS ) {

			const amount = driver.carry?.[ w ];
			if ( Number.isFinite( amount ) && amount > 0 ) carry[ w ] = amount;

		}

		delete driver.carry;
		return carry;

	}

	// `amount` that a connection from `from` (its address's keyed hash) spent itself, counted against
	// `world`'s share, for the next report: kept in the attachment of a connection still here (not
	// `except`) as owed ({ from: { earth, moon, ... } }), one that holds `from` already or fewer than
	// OWED_MOST addresses, so that it outlasts hibernation as what's carried for the budget does
	// (charge); with nobody here to hold it, in memory (fromLeft), which the room reports before it
	// can hibernate (gone, webSocketMessage).
	keepFrom( from, world, amount, except = null ) {

		if ( typeof from !== 'string' || ! from || ! ( amount > 0 ) ) return;
		const here = this.sockets().filter( other => other !== except );
		const ws = here.find( other => this.driver( other ).owed?.[ from ] ) ?? here.find( other => Object.keys( this.driver( other ).owed ?? {} ).length < OWED_MOST );
		if ( ! ws ) return addFrom( this.fromLeft, from, world, amount );
		const driver = this.driver( ws );
		const owed = new Map( Object.entries( driver.owed ?? {} ) );
		addFrom( owed, from, world, amount );
		driver.owed = Object.fromEntries( owed );
		this.save( ws, driver );

	}

	// What a connection holds for others gone (keepFrom's owed), taken off it: [ from, { earth, moon,
	// ... } ], every world's (none for one an attachment from before doesn't have).
	takeOwed( driver ) {

		const owed = Object.entries( driver.owed ?? {} ).filter( ( [ from, spent ] ) => typeof from === 'string' && spent && typeof spent === 'object' );
		delete driver.owed;
		return owed.map( ( [ from, spent ] ) => [ from, Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, Number( spent[ w ] ) || 0 ] ) ) ] );

	}

	// A connection going: what it spent that the room hasn't reported, and what it carried for
	// another world, carried by another (charge), each on the world it was spent on; and what it
	// spent itself, and what it held for others gone (owed), kept by address for the next report
	// (keepFrom).
	settle( ws, driver ) {

		if ( ! driver.uncounted ) this.keepFrom( driver.from, this.worldOf( driver ), driver.own ?? 0, ws );
		driver.own = 0;
		for ( const [ from, spent ] of this.takeOwed( driver ) ) for ( const w of LIVE_WORLD_IDS ) this.keepFrom( from, w, spent[ w ], ws );
		const amount = driver.spent ?? 0;
		driver.spent = 0;
		this.charge( amount, ws, this.worldOf( driver ) );
		for ( const [ w, carried ] of Object.entries( this.takeCarry( driver ) ) ) this.charge( carried, ws, w );

	}

	// What the room's leftover holds, on every world, and what its connections carry for a world
	// they aren't on (charge).
	owing() {

		const sum = held => LIVE_WORLD_IDS.reduce( ( total, w ) => total + ( Number( held?.[ w ] ) || 0 ), 0 );
		return sum( this.leftover ) + this.sockets().reduce( ( total, ws ) => total + sum( this.driver( ws ).carry ), 0 );

	}

	// Whether `world`'s day's budget is spent, as the room knows at `now`: as /api/live said when any
	// of its drivers connected (CLOSED) or a report since has said (each kept in their attachments,
	// so it outlasts hibernation). Only a party's drivers can move from world to world; an area's
	// room is on one, which /api/live checked as each came in.
	closedTo( world, now ) {

		const day = dayOf( now );
		return this.ctx.getWebSockets().some( ws => {

			const { closed } = this.driver( ws );
			return closed?.day === day && Array.isArray( closed.worlds ) && closed.worlds.includes( world );

		} );

	}

	// `worlds` closed for the rest of the day (`now`'s), kept in every connection's attachment.
	closeWorlds( worlds, now ) {

		const day = dayOf( now );
		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			const kept = driver.closed?.day === day ? driver.closed.worlds : [];
			if ( worlds.every( w => kept.includes( w ) ) ) continue;
			driver.closed = { day, worlds: [ ...new Set( [ ...kept, ...worlds ] ) ] };
			this.save( ws, driver );

		}

	}

	// Driver `driver` (on `ws`) just said which world it's on: closed if that world is switched off
	// (CLOSE.off, offReason) or its day is spent (shutClosed), so that nobody in a party drives on a world
	// that's closed, not even until the room's next report. Whether it was.
	stopped( ws, driver, now ) {

		const world = this.worldOf( driver );
		if ( worldOff( this.env, world ) ) this.shut( ws, CLOSE.off, offReason( this.env ) );
		else if ( this.closedTo( world, now ) ) this.shutClosed( ws, driver );
		else if ( this.overTo( driver, world, now ) ) this.pastShare( ws, driver );
		else return false;
		return true;

	}

	// Whether driver `driver`'s address is past its share of `world`'s day, as the room knows at
	// `now`: as /api/live said when it connected (OVER), or a report since has said of its address
	// (overAt), kept in its attachment. So in a party, a connection let in on one world's share,
	// untouched, can't drive on another once its address has spent that one's: it's closed there as
	// it would be at the next report (pastShare), and it can't come back in there.
	overTo( driver, world, now ) {

		const { over } = driver;
		return ! driver.uncounted && over?.day === dayOf( now ) && Array.isArray( over.worlds ) && over.worlds.includes( world );

	}

	// Driver `driver` (on `ws`), whose address is past its share of `worlds`' day (a report said),
	// keeps them in its attachment for the rest of the day (`now`'s).
	overAt( ws, driver, worlds, now ) {

		const day = dayOf( now );
		const kept = driver.over?.day === day ? driver.over.worlds : [];
		if ( worlds.every( w => kept.includes( w ) ) ) return;
		driver.over = { day, worlds: [ ...new Set( [ ...kept, ...worlds ] ) ] };
		this.save( ws, driver );

	}

	// A driver on a world that's closed (moved onto it, in a party, or there as its day was spent):
	// closed with CLOSE.off and BUDGET_SPENT, and what it hadn't reported counted against the world
	// it was let in on (admitted), whose budget /api/live asked, rather than the closed one's.
	shutClosed( ws, driver ) {

		if ( isLiveWorld( driver.admitted ) ) driver.world = driver.admitted;
		this.shut( ws, CLOSE.off, BUDGET_SPENT );

	}

	// A driver whose address is past its share of the world it's on (see report, overTo): to a v3 page
	// CLOSE.off with SHARE_SPENT, and it drives on alone on that world for the rest of its visit, and
	// with others on the rest; to an older page CLOSE.rate, as it always was (it tries again, and
	// /api/live turns it away there for the day).
	pastShare( ws, driver ) {

		if ( ( driver.version ?? 1 ) >= 3 ) this.shut( ws, CLOSE.off, SHARE_SPENT );
		else this.shut( ws, CLOSE.rate, 'too much from here today' );

	}

	// A message on a connection the room has closed (or turned away as full) whose page hasn't
	// answered the close and goes on sending: billed all the same, so counted. A browser stops once
	// it has the close, so a few are only what was on the way; past BURST, the client is ignoring
	// it, and as the runtime has no way to cut one connection off, the room resets, with what it has
	// spent reported first. Everyone's connection to it drops then, and their pages come back by
	// themselves; the one that wouldn't stop has to connect again (a request) to go on.
	async unheeded( ws ) {

		const driver = this.driver( ws );
		this.charge( COST.message, ws, this.worldOf( driver ) );
		if ( ! driver.uncounted ) this.keepFrom( driver.from, this.worldOf( driver ), COST.message, ws );
		const count = ( this.unheard.get( ws ) ?? 0 ) + 1;
		this.unheard.set( ws, count );
		if ( count <= BURST || this.aborting ) return;
		this.aborting = true;
		await this.report( Date.now(), 0 );
		this.ctx.abort( 'a closed connection kept talking' );

	}

	// `visit` gone to another room, with its connection number `seq` there (/api/live): its
	// connections here from before that one go, as one taking over in the room itself replaces them.
	// Kept for ELSEWHERE_MS, so one of them still on its way in (connected at the same moment) is
	// turned away as it comes; a later one, the page coming back here, isn't.
	moveOn( visit, seq, now ) {

		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			if ( driver.visit === visit && ( driver.seq ?? 0 ) < seq ) this.shut( ws, CLOSE.replaced, 'replaced' );

		}

		for ( const [ other, { at } ] of this.elsewhere ) if ( now - at >= ELSEWHERE_MS ) this.elsewhere.delete( other );
		this.elsewhere.set( visit, { seq, at: now } );

	}

	// Whether a connection of `visit` numbered `seq` comes after the visit went elsewhere (moveOn).
	movedOn( visit, seq, now ) {

		const gone = this.elsewhere.get( visit );
		return !! gone && seq < gone.seq && now - gone.at < ELSEWHERE_MS;

	}

	// When the room last reported, as its connections have it (null with none): the newest, as one
	// that came after takes the room's then.
	reportedAt( except = null ) {

		let at = null;
		for ( const ws of this.sockets() ) {

			const { reported } = this.driver( ws );
			if ( ws !== except && Number.isFinite( reported ) ) at = Math.max( at ?? reported, reported );

		}

		return at;

	}

	// Whether `ws` is the only one in the room who has said hello.
	alone( ws ) {

		return ! this.helloed().some( other => other !== ws );

	}

	// Someone gone (not `ws` any more): if that leaves one driver who has said hello, its page goes
	// quiet, so its last state is forgotten here (see handle's 's').
	quiet( ws ) {

		const left = this.helloed().filter( other => other !== ws );
		if ( left.length !== 1 ) return;
		const driver = this.driver( left[ 0 ] );
		if ( ! driver.s ) return;
		Object.assign( driver, { s: null, held: null } );
		this.save( left[ 0 ], driver );

	}

	async webSocketClose( ws, code, reason ) {

		// The close answered, so the page's closing handshake ends now. The runtime is to do that
		// itself since 2026-04-07 (web_socket_auto_reply_to_close), but wrangler dev's didn't (October
		// 2026), and once it's answered this does nothing. 1005 and 1006 (no code, or none sent) can't
		// be sent back.
		try {

			ws.close( code === 1005 || code === 1006 ? 1000 : code, reason );

		} catch {

			// Answered already.

		}

		await this.gone( ws );

	}

	async webSocketError( ws ) {

		await this.gone( ws );

	}

	// A connection closed by its page (or lost): the others are told, unless the room closed it and
	// told them then, and what it spent goes with another's. The last to go: the room reports what's
	// left and empties.
	async gone( ws ) {

		const now = Date.now();
		const driver = this.driver( ws );
		// (Known before it goes, as it may be the last to know.)
		this.shownKey( ws );
		if ( ! driver.left ) {

			// Gone first, so it isn't one of those still here below, and an error and then a close
			// for it don't count it twice.
			driver.left = true;
			try {

				this.save( ws, driver );

			} catch {

				// Gone too far to keep anything.

			}

			if ( driver.pid ) this.broadcast( { t: 'leave', pid: driver.pid }, ws );
			this.settle( ws, driver );
			this.quiet( ws );

		}

		this.drivers.delete( ws );
		if ( ! this.sockets().some( other => other !== ws ) ) {

			if ( this.owing() > 0 || this.fromLeft.size || this.shownKey() !== '' ) await this.report( now, 0 );
			// (Unless someone came while that was said.)
			if ( ! this.sockets().some( other => other !== ws ) ) await this.empty();

		} else await this.dotsSoon( now );

	}

	// The room closing a connection, with one of CLOSE's codes.
	shut( ws, code, reason ) {

		const driver = this.driver( ws );
		if ( driver.left ) return;
		if ( driver.pid ) this.broadcast( { t: 'leave', pid: driver.pid }, ws );
		driver.left = true;
		this.settle( ws, driver );
		this.quiet( ws );
		this.save( ws, driver );
		this.drivers.delete( ws );
		try {

			ws.close( code, reason );

		} catch {

			// Already closing.

		}

	}

	// Nobody left: the alarm and all else stored go, so the room stops existing (and being billed for
	// its storage) until someone next connects. Both at once, so nothing comes in between them.
	async empty() {

		await Promise.all( [ this.ctx.storage.deleteAlarm(), this.ctx.storage.deleteAll() ] );

	}

	// The alarm at `at` (ms), unless it's set sooner already.
	async wake( at ) {

		const set = await this.ctx.storage.getAlarm();
		if ( set === null || set > at ) await this.ctx.storage.setAlarm( at );

	}

	// The most a room lets in: party PARTY_MAX, an area NEARBY_MAX, unless LIVE_PARTY_MAX or
	// LIVE_NEARBY_MAX says otherwise.
	max( room ) {

		return room.kind === 'party' ? setting( this.env.LIVE_PARTY_MAX, PARTY_MAX ) : setting( this.env.LIVE_NEARBY_MAX, NEARBY_MAX );

	}

	// The room's connections still open, and not being closed by it.
	sockets() {

		return this.ctx.getWebSockets().filter( ws => ws.readyState === WebSocket.OPEN && ! this.driver( ws ).left );

	}

	// Those of them who have said hello.
	helloed() {

		return this.sockets().filter( ws => this.driver( ws ).pid );

	}

	// A connection's driver: from memory, or from its attachment when the room has just woken.
	driver( ws ) {

		let driver = this.drivers.get( ws );
		if ( ! driver ) {

			// (None for a connection turned away as the room was full: it's as good as closed.)
			const kept = ws.deserializeAttachment();
			driver = kept ? { ...kept, moved: 0, sent: 0 } : { left: true };
			if ( ! driver.left ) this.drivers.set( ws, driver );
			// Woken: the room's name is in each of its connections'.
			if ( typeof kept?.room === 'string' ) this.name ??= kept.room;

		}

		return driver;

	}

	save( ws, driver ) {

		const kept = { ...driver };
		for ( const key of MEMORY ) delete kept[ key ];
		ws.serializeAttachment( kept );

	}

	// To everyone else who has said hello: `message`, or for one that depends on who's told (whether
	// they hear of that driver's world, see seenBy), a function from their driver to it (null for nothing), each
	// different one made into text once.
	broadcast( message, except ) {

		const texts = new Map();
		for ( const ws of this.helloed() ) {

			if ( ws === except ) continue;
			const made = typeof message === 'function' ? message( this.driver( ws ) ) : message;
			if ( ! made ) continue;
			const key = typeof message === 'function' ? JSON.stringify( made ) : '';
			if ( ! texts.has( key ) ) texts.set( key, JSON.stringify( made ) );
			send( ws, texts.get( key ) );

		}

	}

}

// `amount` spent by connections from `from`, counted against `world`'s share (one of
// LIVE_WORLD_IDS: any other throws, never taken for the Earth), added to `spent` (a Map of { earth,
// moon, ... } by from: the Earth's and the Moon's always, as reports always said, the far worlds'
// only once they have any, so attachments and reports stay small).
function addFrom( spent, from, world, amount ) {

	if ( typeof from !== 'string' || ! from || ! ( amount > 0 ) ) return;
	if ( ! isLiveWorld( world ) ) throw new TypeError( `Not a world driving with others is on: ${ world }` );
	const kept = spent.get( from ) ?? { [ EARTH ]: 0, [ MOON_WORLD ]: 0 };
	kept[ world ] = ( kept[ world ] ?? 0 ) + amount;
	spent.set( from, kept );

}

// Nothing on each world: { earth: 0, moon: 0, ... }.
function zeros() {

	return Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, 0 ] ) );

}

// A room's dots as it reports them, as text to tell whether they've changed: '' for none.
function keyOf( dots ) {

	return dots.length ? JSON.stringify( dots ) : '';

}

// Where a driver whose car the room has no word of is, in `world`'s frame (toFrame's: Earth-centred,
// or its body frame): where they dropped in, if that's in the area `cell`, else the middle of it.
function spotIn( place, cell, world = EARTH ) {

	if ( cellOf( place.lat, place.lon, world ) === cell ) return toFrame( place.lat, place.lon, place.height, world );
	const { south, north, west, east } = boundsOf( cell );
	return toFrame( ( south + north ) / 2, ( west + east ) / 2, place.height, world );

}

// A PLACE as `driver`'s page sends it, checked (checkPlace), or null: on a world the page's version
// doesn't know (a v1 page's Moon, a v2 page's Mars, say: no page sends one, but anything may come),
// checked again as the Earth's, as a page from before the Moon had drivers was always on the Earth,
// whatever its place said.
function placeOf( place, driver ) {

	const checked = checkPlace( place );
	if ( ! checked || knows( driver.version ?? 1, placeWorld( checked ) ) ) return checked;
	// (Checked again as the Earth's: its heights are the Earth's.)
	const { world, ...earthly } = checked;
	return checkPlace( earthly );

}

// A world a message from `driver` says (hello's and away's world and globe): one of LIVE_WORLD_IDS
// that its page's version knows, else null (as if it weren't said).
function saidWorld( world, driver ) {

	return isLiveWorld( world ) && knows( driver.version ?? 1, world ) ? world : null;

}

// Whether driver `to` hears where driver `from` is: only on a world `to`'s page's version knows (v1
// the Earth, v2 the Earth and the Moon, v3 all five), as it would take a car or place on any other
// for one on a world it knows. To it, a driver on such a world is on the globe, with nothing more
// (playerFor).
function seenBy( to, from ) {

	return knows( to.version ?? 1, isLiveWorld( from.world ) ? from.world : EARTH );

}

// Whose globe driver `from`, on the globe, is looking at, for driver `to`: { globe } for a v3 page
// when it said and the page knows that world, else nothing.
function globeFor( from, to ) {

	return from.away && from.globe && ( to.version ?? 1 ) >= 3 && knows( to.version, from.globe ) ? { globe: from.globe } : {};

}

// The PLAYER driver `to` is told of for `from`: with its world when it isn't the Earth (to a page that
// knows that world: seenBy), and to a page that doesn't, as one on the globe; with whose globe it's
// looking at (globeFor) to a v3 page.
function playerFor( from, to ) {

	const player = playerOf( from );
	if ( ! seenBy( to, from ) ) return { ...player, place: null, away: true, s: null, ...globeFor( from, to ) };
	const world = isLiveWorld( from.world ) ? from.world : EARTH;
	return { ...player, ...( world === EARTH ? {} : { world } ), ...globeFor( from, to ) };

}

// Whether `other`, in a party with driver `d`, is someone else for its count (partied): another
// player, not of d's account, or a guest connecting from an address none of d's own connections
// there (`own`, the addresses of the player's and their account's) comes from. (The same player, or
// their account, on another device is still them, and so is a tab of theirs with no nickname.)
function companion( d, other, own ) {

	if ( other === d ) return false;
	if ( other.player ) return other.player !== d.player && ! ( other.account && other.account === d.account );
	return !! other.from && ! own.has( other.from );

}

// A PLAYER, as the others are told of one.
function playerOf( { pid, name, star, level = null, title = null, vehicle, look, place, away, s } ) {

	return { pid, name, star, level, title, vehicle, look, place, away, s };

}

function send( ws, message ) {

	try {

		ws.send( typeof message === 'string' ? message : JSON.stringify( message ) );

	} catch {

		// Closing: its close comes next.

	}

}

// Whether a message is longer than `limit` bytes as sent (UTF-8: never fewer bytes than characters).
function tooLong( text, limit ) {

	return text.length > limit || encoder.encode( text ).length > limit;

}

// A message as JSON, if it's an object with a t, else null.
function parse( text ) {

	try {

		const m = JSON.parse( text );
		return isObject( m ) && typeof m.t === 'string' ? m : null;

	} catch {

		return null;

	}

}

// The rate's token bucket: RATE a second, BURST at most; false once it's empty.
function spend( driver, now ) {

	driver.tokens = Math.min( BURST, driver.tokens + ( now - driver.filled ) * RATE / 1000 );
	driver.filled = now;
	if ( driver.tokens < 1 ) return false;
	driver.tokens -= 1;
	return true;

}
