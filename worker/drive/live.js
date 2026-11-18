import { DurableObject } from 'cloudflare:workers';
import { HttpError, isObject, json, randomToken, sha256Hex } from '../http.js';
import {
	BUDGET_SPENT, BURST, CLOSE, EARTH, FLUSH_MS, HELLO_MS, HONK_GAP, IDLE_MS, MAX_HELLO, MAX_MESSAGE, MOON_WORLD, NEARBY_MAX, ONLINE_AREAS, PARTY_MAX, PING, PONG,
	PROTOCOL, PROTOCOL_WORLDS, RATE, VIEW_RANGE,
	boundsOf, cellOf, checkLook, checkPlace, checkState, checkTrick, checkVehicle, dotsOf, parseRoom, placeWorld, shardOf, toFrame,
} from '../../src/drive-app/live-protocol.js';
import { dayOf } from './limits.js';
import { credentials, database } from './players.js';
import { setting } from './settings.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';
import { standingOf, xpOf } from './progress.js';
import { creditParty, unlockedRides } from './achievements.js';
import { lookKey } from './challenges.js';
import { rideFeat } from '../../src/drive-app/achievement-rules.js';
import { DEFAULT_RIDE } from '../../src/drive-app/catalog.js';

// Driving with others (docs/world-drive.md): the rooms. src/drive-app/live-protocol.js says what a
// room is (a party, or the drivers in one area of the Earth or of the Moon) and what's said in one;
// this is the Worker's half.
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
//   once that reaches LIVE_DAILY_BUDGET (40,000 if unset), leaving the rest for visits and scores.
//   Each room counts its own (each connection's in its attachment: connecting and its messages,
//   keepalives included; and the room's alarms) and adds it to DriveLimits' count about once every
//   REPORT_MS while there's REPORT_LEAST or more to add, at least every REPORT_MOST while anyone's in
//   it, and as it empties; when that says the day's is spent it closes everyone (CLOSE.off,
//   BUDGET_SPENT). /api/live asks DriveLimits first (liveToday), and so does /api/config at most
//   once every OPEN_MS in each Worker instance (and one at a time); those asks count too. The count
//   runs behind, a minute for rooms with drivers moving, up to REPORT_MOST (and under REPORT_LEAST)
//   for the others: the budget leaves room for that.
// - Who's driving now (the globe's dots): an area's room puts its dots in the reports it makes
//   anyway, so it costs no request of its own; only when they've changed does a report go with less
//   than REPORT_LEAST to add, REPORT_MS after the last as ever (each is a request and a row written,
//   one more in DriveLimits for the dots). /api/online is kept ONLINE_MS in each of Cloudflare's
//   locations (the Cache API), by each Worker instance and by browsers, so only an ask that finds
//   none kept asks DriveLimits, and only one at a time in each instance: a request, counted against
//   the day's budget like the others. So about two a minute in each Worker instance (those in one
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
// - The Moon: the Moon is never limited (it costs nothing to stream), so its rooms are never shut
//   by the Earth's visit caps nor by the Earth's budget. But the budget is the Durable Objects bill
//   itself (on the Free plan, the line past which DriveLimits fails for everyone, the Moon's
//   visits too), so the Moon's rooms keep a day's budget of their own, LIVE_MOON_DAILY_BUDGET
//   (MOON_DAILY_BUDGET if unset), counted the same way and apart: spending either world's switches
//   off only that world's rooms (and in a party, only those driving on it). Both together are
//   still well under the Free plan's 100,000, leaving the rest for visits and scores. A room's
//   connections each count against the world they're on (in a party, where their page last said
//   it was), and the room's own alarms and reports against its world (a party's against the
//   Earth's, unless everyone in it is on the Moon). And as anyone may have as many of the Moon's
//   visits as robot checks they pass (they aren't counted against the Earth's caps), those visits
//   are held to LIVE_ADDRESS_VISITS (ADDRESS_VISITS if unset) a day from one address (an IPv6 one by
//   its /48), as the Earth's are to its 8: each with the same connections a minute and a day as any
//   visit. But a visit count doesn't bound what each connection spends (up to 20 messages a second,
//   about 3,700 requests an hour, even alone), so each address's connections, on either world and
//   from any visit but the owner's, may spend only that world's budget over LIVE_ADDRESS_SHARE
//   (ADDRESS_SHARE, 8, if unset) in a day: rooms report what each address's connections spent
//   themselves (by `from`), DriveLimits adds it up, the room closes that address's connections on
//   that world once it's past (CLOSE.rate) and /api/live turns it away there for the rest of the day.
//   One address alone can't spend either world's day: it takes eight. In a party, where a page says
//   it is would let a connection let in on one world's budget drive on the other: so a party's room
//   knows which worlds' days are spent (CLOSED, from /api/live, and its own reports), closes at once
//   a driver who says it's on one (DriveRoom's stopped), and counts what that connection spent
//   against the world it was let in on (admitted).
// - Limits: a connection's attachment (what it keeps through hibernation) at most 16,384 bytes,
//   ours well under 2 KB; 32,768 WebSockets a Durable Object, far more than a room lets in.

// What /api/live checked, handed to the room in headers of its own, on a fresh request: a page's
// own headers never reach the room.
const VISIT = 'X-Live-Visit';
const EXPIRES = 'X-Live-Expires';
const ROOM = 'X-Live-Room';
// The protocol's version the page speaks (1 or 2, see live-protocol.js), and the world the
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
// was let in ('earth', 'moon', or both, comma-separated; none, empty): a party's room lets nobody
// move onto one of them (DriveRoom's closedTo).
const CLOSED = 'X-Live-Closed';
// Present ('1') for the owner's visits, whose spend isn't held to an address's share (see report).
const UNCOUNTED = 'X-Live-Uncounted';
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
// The most addresses a report says what they spent (a room has at most a few dozen connections).
const ADDRESSES_MOST = 64;
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
// The day's budget (billed requests) when LIVE_DAILY_BUDGET is unset, and the Moon's when
// LIVE_MOON_DAILY_BUDGET is.
const DAILY_BUDGET = 40000;
const MOON_DAILY_BUDGET = 20000;
// The day (and budget) DriveLimits said was spent on each world, so this Worker instance doesn't ask
// again that day: an ask is a Durable Object request too. And when it last said the day was open,
// which /api/config takes for OPEN_MS: every page load asks, and anyone can ask without a visit, so
// each asking DriveLimits would let a loop of requests spend the day's budget by itself.
const spentDays = { [ EARTH ]: null, [ MOON_WORLD ]: null };
let openDay = null;
const OPEN_MS = 30000;
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
// The most visits not counted against the Earth's caps (the Moon's) that connect to rooms from one
// address in a day, unless LIVE_ADDRESS_VISITS says otherwise (see DriveLimits' liveOpen).
const ADDRESS_VISITS = 20;
// And what one address's connections may spend in a day on each world: that world's budget over
// ADDRESS_SHARE (LIVE_ADDRESS_SHARE if set, and not 0), so it takes at least that many addresses to
// spend a day's budget, however their connections are used (see DriveLimits' liveSpent). An address
// turned away (by its keyed hash, `from`), past its share on a world or its visits, is remembered by
// this Worker instance until midnight UTC (refuseFrom), and turned away before DriveLimits is asked
// again: each ask is a Durable Object request.
const ADDRESS_SHARE = 8;
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
	// The visit's token comes as the last subprotocol, after the protocol's version (v1's alone, or
	// v2's and then v1's, see live-protocol.js): a browser can't set headers on a WebSocket, and in
	// the address it would end up in logs.
	const offered = ( request.headers.get( 'Sec-WebSocket-Protocol' ) ?? '' ).split( ',' ).map( part => part.trim() );
	const version = offered[ 0 ] === PROTOCOL ? 1 : offered[ 0 ] === PROTOCOL_WORLDS && offered[ 1 ] === PROTOCOL ? 2 : 0;
	if ( ! version ) throw new HttpError( 400, 'Bad request' );
	const token = offered[ version ];
	// Which world the connection is on: an area's own; for a party, the one the page says (?world=,
	// v2 only: a v1 page is always on the Earth). A v1 page is never let into the Moon's areas: it
	// would take their cars for the Earth's.
	const asked = url.searchParams.get( 'world' );
	if ( asked !== null && asked !== EARTH && asked !== MOON_WORLD ) throw new HttpError( 400, 'Bad request' );
	const world = room.kind === 'near' ? room.world : version >= 2 && asked === MOON_WORLD ? MOON_WORLD : EARTH;
	if ( world === MOON_WORLD && version < 2 ) throw new HttpError( 400, 'Bad request' );
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
	// caps (the Moon's) to its day's such visits too.
	const name = roomName( room );
	const connects = setting( env.LIVE_VISIT_CONNECTS, VISIT_CONNECTS );
	const counted = visit.owner ? {} : {
		address: from, share: addressShare( env ),
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
		[ VERSION ]: String( version ), [ WORLD ]: world, [ CLOSED ]: today.closed.join( ',' ), ...( visit.owner ? { [ UNCOUNTED ]: '1' } : {} ),
	};
	return env.ROOMS.get( env.ROOMS.idFromName( name ) ).fetch( new Request( 'https://room.internal/', { headers } ) );

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
// addressVisits? }): { open: true, refused, reason, seq, was, closed } (see DriveLimits' liveOpen;
// closed, the other world if its day is spent or it's switched off), or
// { open: false, reason } with 'off' (LIVE, or that world's budget of 0), BUDGET_SPENT (that world's
// is, today) or 'unknown' (DriveLimits couldn't say just now: closed, to be safe, and a page turned
// away asks /api/config again, and tries again, rather than giving up). It always asks.
// For /api/config: both worlds at once, { open, reason, moon: { open, reason } }, taking an open
// answer heard here in the last OPEN_MS. Each ask is counted with the day's spend.
export async function liveToday( { env, limits, now, world = EARTH, connection = null } ) {

	const budgets = { [ EARTH ]: dailyBudget( env, EARTH ), [ MOON_WORLD ]: dailyBudget( env, MOON_WORLD ) };
	const dayOn = w => `${ dayOf( now ) } ${ budgets[ w ] }`;
	// What's known here of a world without asking: off, or spent today; null if it has to be asked.
	const known = w => env.LIVE === 'off' || budgets[ w ] === 0 ? { open: false, reason: 'off' }
		: spentDays[ w ] === dayOn( w ) ? { open: false, reason: BUDGET_SPENT } : null;
	const ask = { now, budget: budgets[ EARTH ], moonBudget: budgets[ MOON_WORLD ] };

	if ( connection ) {

		const before = known( world );
		if ( before ) return before;
		try {

			const answer = await limits.liveOpen( { ...ask, world, ...connection } );
			if ( answer.open ) {

				// (An Earth room's open answer is an open day for /api/config too, as it always was.)
				if ( world === EARTH ) openDay = { day: `${ dayOn( EARTH ) } ${ budgets[ MOON_WORLD ] }`, at: now };
				// The other world closed, as DriveLimits says or as this instance knows already.
				const other = world === MOON_WORLD ? EARTH : MOON_WORLD;
				const heard = Array.isArray( answer.closed ) && answer.closed.includes( other );
				if ( heard && budgets[ other ] > 0 ) spentDays[ other ] = dayOn( other );
				const closed = heard || known( other ) ? [ other ] : [];
				return { open: true, refused: !! answer.refused, reason: answer.reason ?? null, seq: answer.seq ?? 0, was: answer.was ?? null, closed };

			}

			spentDays[ world ] = dayOn( world );
			return { open: false, reason: BUDGET_SPENT };

		} catch ( err ) {

			console.error( 'Live budget check', err?.name, err?.message );
			return { open: false, reason: 'unknown' };

		}

	}

	const both = () => {

		const earth = known( EARTH ) ?? { open: true };
		return { ...earth, moon: known( MOON_WORLD ) ?? { open: true } };

	};
	if ( known( EARTH ) && known( MOON_WORLD ) ) return both();
	const day = `${ dayOn( EARTH ) } ${ budgets[ MOON_WORLD ] }`;
	if ( openDay?.day === day && now >= openDay.at && now < openDay.at + OPEN_MS ) return both();
	// Another page load here is asking just now: open, as it last heard today.
	if ( openDay?.day === day && asking( openAsking, now ) ) return both();
	const mine = openAsking = { at: now };
	try {

		const answer = await limits.liveOpen( ask );
		// (A DriveLimits from before the Moon had rooms says one for both.)
		const lunar = answer.moon ?? answer;
		if ( ! answer.open ) spentDays[ EARTH ] = dayOn( EARTH );
		if ( ! lunar.open ) spentDays[ MOON_WORLD ] = dayOn( MOON_WORLD );
		openDay = { day, at: now };
		return both();

	} catch ( err ) {

		console.error( 'Live budget check', err?.name, err?.message );
		const unknown = { open: false, reason: 'unknown' };
		return { ...unknown, moon: unknown };

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
// ?world=moon on the Moon: { on, total, areas } (see live-protocol.js) and how many are driving on the
// other world (moon, or earth). Off on this world but not the other, the answer says how many are
// driving there all the same (as the other world's own answer says, kept as that is), so the page
// can still point to them. Kept ONLINE_MS in Cloudflare's cache (each of its locations has its
// own), under the address without its query but for which world it is, so a query can't get round
// it, and by browsers for what's left of that (its Date says when it was made), and by this Worker
// instance as well (onlineHeard). Only a request that finds none kept asks DriveLimits, which counts
// that against that world's budget for the day; while one is asking, the others here are answered
// with what was last heard, a little old (see onlineAsking). Off (LIVE, a budget of 0, or the day's
// spent on that world, as this Worker instance remembers once it's heard), it's on: false, asking
// nothing. If DriveLimits can't say just now, it's nobody (on: true), kept ONLINE_FAILED_MS: never an
// error page. The tests (TEST_CLOCK) keep one for each time they say it is (X-Test-Time), so each of
// their times is asked afresh.
export async function online( { request, env, url, limits, now } ) {

	const world = url.searchParams.get( 'world' ) === MOON_WORLD ? MOON_WORLD : EARTH;
	const other = world === MOON_WORLD ? EARTH : MOON_WORLD;
	const budget = dailyBudget( env, world );
	const day = `${ dayOf( now ) } ${ budget }`;
	// Off for the rest of the day: kept no later than midnight UTC, when it's on again (a page that's
	// told it's off shows none of it for the rest of its visit on that world).
	const offToday = Math.min( ONLINE_MS, ( Math.floor( now / DAY_MS ) + 1 ) * DAY_MS - now );
	// How many are driving on the other world, for an answer that's off here: its own answer's total
	// (from where that's kept, or asked for as a request to it would be); none while it's off too.
	const there = async () => {

		if ( worldOff( env, other ) || spentDays[ other ] === `${ dayOf( now ) } ${ dailyBudget( env, other ) }` ) return {};
		const address = new URL( url );
		if ( other === MOON_WORLD ) address.searchParams.set( 'world', MOON_WORLD );
		else address.searchParams.delete( 'world' );
		const answer = await ( await online( { request, env, url: address, limits, now } ) ).json();
		return answer.on === true && Number.isInteger( answer.total ) ? { [ other ]: answer.total } : {};

	};
	if ( worldOff( env, world ) ) return onlineAnswer( { on: false, total: 0, areas: [], ...await there() }, ONLINE_MS );
	if ( spentDays[ world ] === day ) return onlineAnswer( { on: false, total: 0, areas: [], ...await there() }, offToday );
	const tested = env.TEST_CLOCK === 'header' && request.headers.has( 'X-Test-Time' );
	const query = [ ...( world === MOON_WORLD ? [ `world=${ MOON_WORLD }` ] : [] ), ...( tested ? [ `at=${ now }` ] : [] ) ];
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

		const found = await limits.liveOnline( { now, budget: dailyBudget( env, EARTH ), moonBudget: dailyBudget( env, MOON_WORLD ), world, ttl: ONLINE_TTL, most: ONLINE_AREAS } );
		if ( found.open ) answer = { on: true, total: found.total, areas: found.areas, [ other ]: Number.isInteger( found.elsewhere ) ? found.elsewhere : 0 };
		else {

			spentDays[ world ] = day;
			answer = { on: false, total: 0, areas: [], ...await there() };
			keep = offToday;

		}

	} catch ( err ) {

		console.error( 'Live online', err?.name, err?.message );
		answer = { on: true, total: 0, areas: [], [ other ]: 0 };
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

// An answer for /api/online, kept `keep` ms (to the second) from `date` (an HTTP date: now, unless
// it's one heard before).
function onlineAnswer( answer, keep, date = new Date().toUTCString() ) {

	return json( answer, 200, { 'Cache-Control': `public, max-age=${ Math.floor( keep / 1000 ) }`, Date: date } );

}

// The day's budget for driving with others on `world`, in billed Durable Object requests: the
// Earth's LIVE_DAILY_BUDGET, or DAILY_BUDGET when it's unset; the Moon's LIVE_MOON_DAILY_BUDGET, or
// MOON_DAILY_BUDGET.
function dailyBudget( env, world = EARTH ) {

	return world === MOON_WORLD ? setting( env.LIVE_MOON_DAILY_BUDGET, MOON_DAILY_BUDGET ) : setting( env.LIVE_DAILY_BUDGET, DAILY_BUDGET );

}

// How many shares of each world's day there are, one address being let spend one (ADDRESS_SHARE).
function addressShare( env ) {

	return setting( env.LIVE_ADDRESS_SHARE, ADDRESS_SHARE ) || ADDRESS_SHARE;

}

// Switched off: LIVE=off, or a budget of 0 on both worlds.
function liveOff( env ) {

	return env.LIVE === 'off' || ( dailyBudget( env, EARTH ) === 0 && dailyBudget( env, MOON_WORLD ) === 0 );

}

// Switched off on `world`: LIVE=off, or that world's budget is 0.
function worldOff( env, world ) {

	return env.LIVE === 'off' || dailyBudget( env, world ) === 0;

}

// A room's one name, whichever way it was written ('near:1277.01088#0' is 'near:1277.1088'; the
// Moon's 'moon:...' the same way).
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
// of who's driving now it reported then, see dots), version (the protocol's its page speaks: 1, or 2
// since the Moon had drivers), world (the one it's on: an area's own, or in a party where its page
// last said it was: see worldOf), and once it has said hello pid, name, star, level, title, vehicle,
// look, place, away, s }.
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
		this.leftover = { [ EARTH ]: 0, [ MOON_WORLD ]: 0 };
		// What connections that went had spent themselves since the last report, by where they came
		// from (`from`) and world, for the next report (see own): in memory only, so what one leaves
		// just before the room hibernates isn't held to its address's share, only to the budget.
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
		const version = request.headers.get( VERSION ) === '2' ? 2 : 1;
		const world = room?.kind === 'near' ? room.world : request.headers.get( WORLD ) === MOON_WORLD && version >= 2 ? MOON_WORLD : EARTH;
		const closed = ( request.headers.get( CLOSED ) ?? '' ).split( ',' ).filter( w => w === EARTH || w === MOON_WORLD );
		const uncounted = request.headers.get( UNCOUNTED ) === '1';
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
			// kept (admitted), and which worlds were closed then, if any (closed, see closedTo). What it
			// spends itself (own), apart from what it carries for others, is held to its address's share
			// of the day (see report), unless it's the owner's (uncounted).
			const driver = {
				visit, seq, expires, from, room: name, version, world, admitted: world, at: now, heard: now, tokens: BURST, filled: now, honk: 0, pid: null,
				spent: COST.connect, own: COST.connect, reported: this.reportedAt( server ) ?? now, shown: this.shownKey(), moved: 0, sent: 0,
				...( closed.length ? { closed: { day: dayOf( now ), worlds: closed } } : {} ), ...( uncounted ? { uncounted } : {} ),
			};
			this.drivers.set( server, driver );
			this.save( server, driver );
			for ( const ws of before ) this.shut( ws, CLOSE.replaced, 'replaced' );
			// (The room may have heard since /api/live asked that its world's day is spent.)
			if ( this.closedTo( world, now ) ) this.shutClosed( server, driver );
			await this.wake( Math.min( now + HELLO_MS, expires ) );

		}

		return new Response( null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': version >= 2 ? PROTOCOL_WORLDS : PROTOCOL } } );

	}

	async webSocketMessage( ws, message ) {

		const driver = this.driver( ws );
		if ( driver.left ) return this.unheeded( ws );
		const now = Date.now();
		// Every message in is billed, whatever becomes of it (each way on from here saves it).
		driver.spent = ( driver.spent ?? 0 ) + COST.message;
		driver.own = ( driver.own ?? 0 ) + COST.message;
		if ( worldOff( this.env, this.worldOf( driver ) ) ) return this.shut( ws, CLOSE.off, 'off' );
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
		// Which world it's on: where it dropped in, or on the globe the one it says (v2). An area's
		// room is on its own world whatever's said: a place on the other is no place here.
		const room = parseRoom( driver.room );
		if ( room?.kind === 'near' ) {

			if ( place && placeWorld( place ) !== room.world ) place = null;

		} else if ( driver.version >= 2 ) driver.world = place ? placeWorld( place ) : m.world === MOON_WORLD ? MOON_WORLD : m.world === EARTH ? EARTH : driver.world;
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
		Object.assign( driver, { pid, name, star, level, title, vehicle: shown, look, place, away: m.away === true || ( somewhere && ! place ), s: null, pending: false } );
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
					FROM players p WHERE p.id = ?1 AND p.secret_hash = ?2` ).bind( id, await sha256Hex( secret ), supporterEmails( this.env ) ).first();
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

				// (On its own world: the Earth's frame and the Moon's are far apart, so one in the
				// other's is no car's.)
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
				// A place on the other world in an area's room isn't for it (the page moves on to that
				// world's room as it drops in): nothing changes here. In a party it's where the driver
				// is now, its world and all: a page from before the Moon had drivers hears only that
				// they're on the globe (seenBy).
				const room = parseRoom( this.name );
				if ( room?.kind === 'near' && placeWorld( place ) !== room.world ) return true;
				if ( room?.kind !== 'near' && driver.version >= 2 ) driver.world = placeWorld( place );
				// Onto a world whose day is spent: closed there and then, as the room would at its next
				// report, before anyone hears where.
				if ( this.stopped( ws, driver, now ) ) return true;
				// (A car's last state on the world it's left is no state on this one.)
				Object.assign( driver, { place, away: false } );
				if ( driver.s && ! checkState( driver.s, this.worldOf( driver ) ) ) Object.assign( driver, { s: null, held: null } );
				this.broadcast( to => seenBy( to, driver ) ? { t: 'place', pid, place } : { t: 'away', pid }, ws );
				return true;

			}

			case 'away':
				// Back on the globe: no car where it last was, for anyone joining meanwhile. On which
				// world's globe, if it says (v2, in a party: its budget is that world's).
				Object.assign( driver, { away: true, s: null } );
				if ( parseRoom( this.name )?.kind !== 'near' && driver.version >= 2 && ( m.world === EARTH || m.world === MOON_WORLD ) ) driver.world = m.world;
				if ( this.stopped( ws, driver, now ) ) return true;
				this.broadcast( { t: 'away', pid }, ws );
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
			if ( worldOff( this.env, this.worldOf( driver ) ) ) this.shut( ws, CLOSE.off, 'off' );
			else if ( now >= driver.expires ) this.shut( ws, CLOSE.expired, 'expired' );
			else if ( now >= hello ) this.shut( ws, CLOSE.hello, 'no hello' );
			else if ( now >= driver.heard + IDLE_MS ) this.shut( ws, CLOSE.idle, 'idle' );
			else next = Math.min( next, driver.expires, hello, driver.heard + IDLE_MS );

		}

		this.flush( now );
		// This alarm is a request too: in the report, if one's due (or nobody's left, for what the
		// last of them spent, and to take the room's dots off the globe), else counted for the next.
		if ( ! this.sockets().length ) {

			if ( this.owing() > 0 || this.shownKey() !== '' ) await this.report( now, COST.alarm );

		} else if ( this.reportDue( now ) ) await this.report( now, COST.alarm );
		else this.charge( COST.alarm );
		// Nobody left (or everyone closed by the report, for the budget): the room empties. Someone who
		// came while it was reporting set an alarm of their own, which is kept (wake).
		if ( ! this.sockets().length ) return this.empty();
		// The next report REPORT_MS after the last; one put off (reportDue) no sooner than it would
		// have been, so the alarm doesn't come straight back to put it off again.
		await this.wake( Math.min( next, Math.max( ( this.reportedAt() ?? now ) + REPORT_MS, now + REPORT_MS - REPORT_EARLY ) ) );

	}

	// Whether the alarm at `now` reports: the first time, or from REPORT_EARLY before REPORT_MS since
	// the last, with REPORT_LEAST or more to report, with the room's dots changed since the last (see
	// dots: who's driving now goes on the globe within about a minute), or once it's been REPORT_MOST.
	reportDue( now ) {

		const reported = this.reportedAt();
		if ( reported === null ) return true;
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
		// Each world's share: each connection's on the world it's on, and what it carries for the other
		// (charge), the room's own on its (worldOf).
		const amounts = { ...this.leftover };
		amounts[ this.worldOf() ] += extra + COST.report;
		this.leftover = { [ EARTH ]: 0, [ MOON_WORLD ]: 0 };
		// And what each address's connections spent themselves, on each world (own, added to fromLeft
		// for those gone), so DriveLimits can hold each address to its share of each world's day.
		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			amounts[ this.worldOf( driver ) ] += driver.spent ?? 0;
			for ( const [ w, carried ] of Object.entries( this.takeCarry( driver ) ) ) amounts[ w ] += carried;
			if ( ! driver.uncounted ) this.keepFrom( driver.from, this.worldOf( driver ), driver.own ?? 0 );
			Object.assign( driver, { spent: 0, own: 0, reported: now } );
			this.save( ws, driver );

		}

		const spentFrom = this.fromLeft;
		this.fromLeft = new Map();
		const addresses = [ ...spentFrom ].slice( 0, ADDRESSES_MOST ).map( ( [ from, spent ] ) => ( { from, ...spent } ) );

		const open = { [ EARTH ]: true, [ MOON_WORLD ]: true };
		let over = null;
		try {

			const limits = this.env.LIMITS.get( this.env.LIMITS.idFromName( 'global' ) );
			const answer = await limits.liveSpent( amounts[ EARTH ], {
				now, budget: dailyBudget( this.env, EARTH ), moon: amounts[ MOON_WORLD ], moonBudget: dailyBudget( this.env, MOON_WORLD ),
				...( dots ? { online: { room: this.name, dots } } : {} ), ...( addresses.length ? { addresses, share: addressShare( this.env ) } : {} ),
			} );
			open[ EARTH ] = answer.open;
			// (A DriveLimits from before the Moon had rooms says one for both.)
			open[ MOON_WORLD ] = answer.moon?.open ?? answer.open;
			over = answer.over ?? null;

		} catch ( err ) {

			console.error( 'Live budget report', err?.name, err?.message );
			for ( const w of [ EARTH, MOON_WORLD ] ) this.charge( amounts[ w ], null, w );
			for ( const [ from, spent ] of spentFrom ) for ( const w of [ EARTH, MOON_WORLD ] ) this.keepFrom( from, w, spent[ w ] );
			if ( dots ) this.shownAs( null );
			return;

		}

		// (With the day's spent, DriveLimits has let go of them too.)
		if ( dots ) this.shownAs( open[ this.worldOf() ] ? keyOf( dots ) : '' );
		// A world whose day's budget is spent is kept as closed in everyone's attachment, so that in a
		// party nobody moves onto it after (closedTo). Those on it are closed (in a party, only them:
		// the others drive on), and what they had spent since is let go, rather than asking again to
		// add it to a spent day; but one let in on the other world, still open, has it counted there
		// (shutClosed), so that world's budget bounds what its connections cost.
		const shut = [ EARTH, MOON_WORLD ].filter( w => ! open[ w ] );
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
		// earth: [ from ], moon: [ from ] }) are closed as too many messages are (CLOSE.rate), as any
		// page takes that: it tries again, and /api/live turns it away for the day.
		for ( const ws of over ? this.sockets() : [] ) {

			const driver = this.driver( ws );
			const past = over[ this.worldOf( driver ) ];
			if ( ! driver.uncounted && Array.isArray( past ) && past.includes( driver.from ) ) this.shut( ws, CLOSE.rate, 'too much from here today' );

		}

		if ( ! this.sockets().length ) {

			this.leftover = { [ EARTH ]: 0, [ MOON_WORLD ]: 0 };
			this.fromLeft = new Map();

		}

	}

	// The world a connection's driver is on: an area's own; in a party where its page last said, the
	// Earth for a page from before the Moon had drivers. With no driver, the room's own: an area's
	// world, and a party's the Earth's, unless everyone in it is on the Moon (for its alarms and
	// reports, see report).
	worldOf( driver = null ) {

		const room = parseRoom( this.name );
		if ( room?.kind === 'near' ) return room.world;
		if ( driver ) return driver.world === MOON_WORLD ? MOON_WORLD : EARTH;
		const here = this.sockets();
		return here.length && here.every( ws => this.driver( ws ).world === MOON_WORLD ) ? MOON_WORLD : EARTH;

	}

	// `amount` (billed requests) spent on `world` (the room's own, worldOf, unless it says) for the
	// next report, always counted against that world's budget: on a connection still here (not
	// `except`) on that world, as its own spent; with none on that world but someone on the other (a
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

			this.leftover[ on ] += amount;
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
		for ( const w of [ EARTH, MOON_WORLD ] ) {

			const amount = driver.carry?.[ w ];
			if ( Number.isFinite( amount ) && amount > 0 ) carry[ w ] = amount;

		}

		delete driver.carry;
		return carry;

	}

	// `amount` that a connection from `from` (its address's keyed hash) spent itself on `world`, kept
	// for the next report (fromLeft: { earth, moon } by from).
	keepFrom( from, world, amount ) {

		if ( typeof from !== 'string' || ! from || ! ( amount > 0 ) ) return;
		const spent = this.fromLeft.get( from ) ?? { [ EARTH ]: 0, [ MOON_WORLD ]: 0 };
		spent[ world === MOON_WORLD ? MOON_WORLD : EARTH ] += amount;
		this.fromLeft.set( from, spent );

	}

	// A connection going: what it spent that the room hasn't reported, and what it carried for
	// another world, carried by another (charge), each on the world it was spent on; and what it
	// spent itself kept by its address for the next report (keepFrom).
	settle( ws, driver ) {

		if ( ! driver.uncounted ) this.keepFrom( driver.from, this.worldOf( driver ), driver.own ?? 0 );
		driver.own = 0;
		const amount = driver.spent ?? 0;
		driver.spent = 0;
		this.charge( amount, ws, this.worldOf( driver ) );
		for ( const [ w, carried ] of Object.entries( this.takeCarry( driver ) ) ) this.charge( carried, ws, w );

	}

	// What the room's leftover holds, on both worlds, and what its connections carry for a world
	// they aren't on (charge).
	owing() {

		const carried = this.sockets().reduce( ( sum, ws ) => {

			const carry = this.driver( ws ).carry;
			return sum + ( carry?.[ EARTH ] ?? 0 ) + ( carry?.[ MOON_WORLD ] ?? 0 );

		}, 0 );
		return this.leftover[ EARTH ] + this.leftover[ MOON_WORLD ] + carried;

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
	// (CLOSE.off, 'off') or its day is spent (shutClosed), so that nobody in a party drives on a world
	// that's closed, not even until the room's next report. Whether it was.
	stopped( ws, driver, now ) {

		const world = this.worldOf( driver );
		if ( worldOff( this.env, world ) ) this.shut( ws, CLOSE.off, 'off' );
		else if ( this.closedTo( world, now ) ) this.shutClosed( ws, driver );
		else return false;
		return true;

	}

	// A driver on a world that's closed (moved onto it, in a party, or there as its day was spent):
	// closed with CLOSE.off and BUDGET_SPENT, and what it hadn't reported counted against the world
	// it was let in on (admitted), whose budget /api/live asked, rather than the closed one's.
	shutClosed( ws, driver ) {

		if ( driver.admitted === EARTH || driver.admitted === MOON_WORLD ) driver.world = driver.admitted;
		this.shut( ws, CLOSE.off, BUDGET_SPENT );

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
		if ( ! driver.uncounted ) this.keepFrom( driver.from, this.worldOf( driver ), COST.message );
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

			if ( this.owing() > 0 || this.shownKey() !== '' ) await this.report( now, 0 );
			// (Unless someone came while that was said.)
			if ( ! this.sockets().some( other => other !== ws ) ) await this.empty();

		}

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
	// they hear of the Moon, see seenBy), a function from their driver to it (null for nothing), each
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

// A room's dots as it reports them, as text to tell whether they've changed: '' for none.
function keyOf( dots ) {

	return dots.length ? JSON.stringify( dots ) : '';

}

// Where a driver whose car the room has no word of is, in `world`'s frame (Earth-centred, or the
// Moon's): where they dropped in, if that's in the area `cell`, else the middle of it.
function spotIn( place, cell, world = EARTH ) {

	if ( cellOf( place.lat, place.lon, world ) === cell ) return toFrame( place.lat, place.lon, place.height, world );
	const { south, north, west, east } = boundsOf( cell );
	return toFrame( ( south + north ) / 2, ( west + east ) / 2, place.height, world );

}

// A PLACE as `driver`'s page sends it, checked (checkPlace), or null: a page from before the Moon had
// drivers (v1) is always on the Earth, whatever its place says.
function placeOf( place, driver ) {

	const checked = checkPlace( place );
	if ( ! checked || ( driver.version ?? 1 ) >= 2 || ! checked.world ) return checked;
	// (Checked again as the Earth's: its heights are the Earth's.)
	const { world, ...earthly } = checked;
	return checkPlace( earthly );

}

// Whether driver `to` hears where driver `from` is: always for a page that knows of the Moon (v2);
// for one from before (v1), only of a driver on the Earth, as it would take a Moon car or place for
// the Earth's. To it, a driver on the Moon is on the globe, with nothing more (playerFor).
function seenBy( to, from ) {

	return ( to.version ?? 1 ) >= 2 || from.world !== MOON_WORLD;

}

// The PLAYER driver `to` is told of for `from`: with its world for a v2 page when it's the Moon's,
// and for a v1 page a Moon driver as one on the globe.
function playerFor( from, to ) {

	const player = playerOf( from );
	if ( ! seenBy( to, from ) ) return { ...player, place: null, away: true, s: null };
	return from.world === MOON_WORLD && ( to.version ?? 1 ) >= 2 ? { ...player, world: MOON_WORLD } : player;

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
