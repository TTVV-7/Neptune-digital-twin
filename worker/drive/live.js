import { DurableObject } from 'cloudflare:workers';
import { HttpError, isObject, json, randomToken, sha256Hex } from '../http.js';
import {
	BUDGET_SPENT, BURST, CLOSE, FLUSH_MS, HELLO_MS, HONK_GAP, IDLE_MS, MAX_HELLO, MAX_MESSAGE, NEARBY_MAX, ONLINE_AREAS, PARTY_MAX, PING, PONG, PROTOCOL,
	RATE, VIEW_RANGE,
	boundsOf, cellOf, checkLook, checkPlace, checkState, checkTrick, checkVehicle, dotsOf, parseRoom, shardOf, toEcef,
} from '../../src/drive-app/live-protocol.js';
import { dayOf } from './limits.js';
import { credentials, database } from './players.js';
import { setting } from './settings.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';

// Driving with others (docs/world-drive.md): the rooms. src/drive-app/live-protocol.js says what a
// room is (a party, or the drivers in one area) and what's said in one; this is the Worker's half.
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
//   once every OPEN_MS in each Worker instance; those asks count too. The count runs behind, a
//   minute for rooms with drivers moving, up to REPORT_MOST (and under REPORT_LEAST) for the
//   others: the budget leaves room for that.
// - Who's driving now (the globe's dots): an area's room puts its dots in the reports it makes
//   anyway, so it costs no request of its own; only when they've changed does a report go with less
//   than REPORT_LEAST to add, REPORT_MS after the last as ever (each is a request and a row written,
//   one more in DriveLimits for the dots). /api/online is kept ONLINE_MS in each of Cloudflare's
//   locations (the Cache API) and by browsers, so only an ask that finds none kept asks
//   DriveLimits: a request, counted against the day's budget like the others.
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
// - Limits: a connection's attachment (what it keeps through hibernation) at most 16,384 bytes,
//   ours well under 2 KB; 32,768 WebSockets a Durable Object, far more than a room lets in.

// What /api/live checked, handed to the room in headers of its own, on a fresh request: a page's
// own headers never reach the room.
const VISIT = 'X-Live-Visit';
const EXPIRES = 'X-Live-Expires';
const ROOM = 'X-Live-Room';
// The connection's number among its visit's today (DriveLimits' liveOpen), and, alone, the visit a
// room is to let go of because it has connected to another room (with that connection's number).
const SEQ = 'X-Live-Seq';
const LEAVE = 'X-Live-Leave';
// The parts of a driver only kept in memory, not in its attachment: when its car last moved and
// when it was last sent the others' (counts of the room's own, which start again when it wakes),
// when its state came in, and a hello being looked up with the messages that came in behind it.
const MEMORY = [ 'moved', 'sent', 'sAt', 'held', 'pending', 'queue' ];
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
// The day's budget (billed requests) when LIVE_DAILY_BUDGET is unset.
const DAILY_BUDGET = 40000;
// The day (and budget) DriveLimits said was spent, so this Worker instance doesn't ask again that
// day: an ask is a Durable Object request too. And when it last said that day was open, which
// /api/config takes for OPEN_MS: every page load asks, and anyone can ask without a visit, so each
// asking DriveLimits would let a loop of requests spend the day's budget by itself.
let spentDay = null;
let openDay = null;
const OPEN_MS = 30000;
// The most connections a visit makes in a day, unless LIVE_VISIT_CONNECTS says otherwise (a page
// makes one each time it changes room, or comes back after a dropped connection: a few dozen in six
// hours of driving from area to area). Past that DriveLimits turns it away, and this Worker
// instance remembers the visit until it runs out, rather than asking again.
const VISIT_CONNECTS = 200;
const refusedVisits = new Map();

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
	// The visit's token comes as the second subprotocol: a browser can't set headers on a WebSocket,
	// and in the address it would end up in logs.
	const [ protocol, token ] = ( request.headers.get( 'Sec-WebSocket-Protocol' ) ?? '' ).split( ',' ).map( part => part.trim() );
	if ( protocol !== PROTOCOL ) throw new HttpError( 400, 'Bad request' );
	const visit = await readVisit( env, token, now );
	if ( ! visit ) throw new HttpError( 401, 'Unauthorized' );
	// A visit connecting over and over (a loop): at most LIVE_CONNECTS' limit a minute (20) get as
	// far as DriveLimits, on Cloudflare's rate limiter, which is no Durable Object request; and none
	// once DriveLimits has turned it away for the day. A page connects far less often than that.
	if ( refusedVisits.has( visit.id ) ) throw new HttpError( 429, 'Too many connections' );
	if ( env.LIVE_CONNECTS && ! ( await env.LIVE_CONNECTS.limit( { key: visit.id } ) ).success ) throw new HttpError( 429, 'Too many connections' );
	// Only then the day's budget: a request turned away above costs no Durable Object request.
	const name = roomName( room );
	const connects = setting( env.LIVE_VISIT_CONNECTS, VISIT_CONNECTS );
	const today = await liveToday( { env, limits, now, connection: { visit: visit.id, room: name, connects } } );
	if ( today.reason === BUDGET_SPENT ) throw new HttpError( 503, 'Lots of drivers today: driving with others is back after midnight UTC', { reason: BUDGET_SPENT } );
	if ( ! today.open ) throw new HttpError( 503, 'Driving with others is off just now' );
	if ( today.refused ) {

		refuse( visit, now );
		throw new HttpError( 429, 'Too many connections' );

	}

	// A visit is in one room at a time: the one it was in lets go of it first (a page moving on has
	// hung up there already; a page in many rooms at once, or another tab, hasn't).
	if ( today.was ) await leaveRoom( env, today.was, visit.id, today.seq );
	const headers = { Upgrade: 'websocket', [ VISIT ]: visit.id, [ EXPIRES ]: String( visit.expiresAt ), [ ROOM ]: name, [ SEQ ]: String( today.seq ) };
	return env.ROOMS.get( env.ROOMS.idFromName( name ) ).fetch( new Request( 'https://room.internal/', { headers } ) );

}

// A visit DriveLimits has turned away for the day, remembered until it runs out (and those run out
// let go of, so the list stays short).
function refuse( visit, now ) {

	if ( refusedVisits.size >= 1000 ) for ( const [ id, until ] of refusedVisits ) if ( until <= now ) refusedVisits.delete( id );
	refusedVisits.set( visit.id, visit.expiresAt );

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

// Whether driving with others is open at `now`, for /api/live and /api/config: { open: true }, or
// { open: false, reason } with 'off' (LIVE, or a budget of 0), BUDGET_SPENT (today's is) or
// 'unknown' (DriveLimits couldn't say just now: closed, to be safe, and a page turned away asks
// /api/config again, and tries again, rather than giving up). Each ask is counted with the day's
// spend. For a connection to a room (/api/live, `connection`: { visit, room, connects }) it always
// asks, and an open answer also has DriveLimits' refused, seq and was (see liveOpen); /api/config
// takes an open answer heard here in the last OPEN_MS.
export async function liveToday( { env, limits, now, connection = null } ) {

	const budget = dailyBudget( env );
	if ( liveOff( env ) ) return { open: false, reason: 'off' };
	const day = `${ dayOf( now ) } ${ budget }`;
	if ( spentDay === day ) return { open: false, reason: BUDGET_SPENT };
	if ( ! connection && openDay?.day === day && now >= openDay.at && now < openDay.at + OPEN_MS ) return { open: true };
	try {

		const answer = await limits.liveOpen( { now, budget, ...connection } );
		if ( answer.open ) {

			openDay = { day, at: now };
			return connection ? { open: true, refused: !! answer.refused, seq: answer.seq ?? 0, was: answer.was ?? null } : { open: true };

		}

		spentDay = day;
		return { open: false, reason: BUDGET_SPENT };

	} catch ( err ) {

		console.error( 'Live budget check', err?.name, err?.message );
		return { open: false, reason: 'unknown' };

	}

}

// GET /api/online: where people are driving now, for the globe's dots: { on, total, areas } (see
// live-protocol.js). Kept ONLINE_MS in Cloudflare's cache (each of its locations has its own), under
// the address without its query, so a query can't get round it, and by browsers for what's left of
// that (its Date says when it was made). Only a request that finds none kept asks DriveLimits, which
// counts that against the day's budget. Off (LIVE, a budget of 0, or the day's spent, as this Worker
// instance remembers once it's heard), it's on: false, asking nothing. If DriveLimits can't say just
// now, it's nobody (on: true), kept ONLINE_FAILED_MS: never an error page. The tests (TEST_CLOCK)
// keep one for each time they say it is (X-Test-Time), so each of their times is asked afresh.
export async function online( { request, env, url, limits, now } ) {

	const budget = dailyBudget( env );
	const day = `${ dayOf( now ) } ${ budget }`;
	// Off for the rest of the day: kept no later than midnight UTC, when it's on again (a page that's
	// told it's off shows none of it for the rest of its visit).
	const offToday = Math.min( ONLINE_MS, ( Math.floor( now / DAY_MS ) + 1 ) * DAY_MS - now );
	if ( liveOff( env ) ) return onlineAnswer( { on: false, total: 0, areas: [] }, ONLINE_MS );
	if ( spentDay === day ) return onlineAnswer( { on: false, total: 0, areas: [] }, offToday );
	const tested = env.TEST_CLOCK === 'header' && request.headers.has( 'X-Test-Time' );
	const key = new Request( `${ url.origin }${ url.pathname }${ tested ? `?at=${ now }` : '' }` );
	const cache = globalThis.caches?.default;
	const kept = await cache?.match( key ).catch( () => null );
	if ( kept ) return kept;

	let answer;
	let keep = ONLINE_MS;
	try {

		const found = await limits.liveOnline( { now, budget, ttl: ONLINE_TTL, most: ONLINE_AREAS } );
		if ( found.open ) answer = { on: true, total: found.total, areas: found.areas };
		else {

			spentDay = day;
			answer = { on: false, total: 0, areas: [] };
			keep = offToday;

		}

	} catch ( err ) {

		console.error( 'Live online', err?.name, err?.message );
		answer = { on: true, total: 0, areas: [] };
		keep = ONLINE_FAILED_MS;

	}

	const response = onlineAnswer( answer, keep );
	if ( keep >= 1000 ) await cache?.put( key, response.clone() ).catch( err => console.error( 'Live online cache', err?.name, err?.message ) );
	return response;

}

// An answer for /api/online, kept `keep` ms (to the second).
function onlineAnswer( answer, keep ) {

	return json( answer, 200, { 'Cache-Control': `public, max-age=${ Math.floor( keep / 1000 ) }`, Date: new Date().toUTCString() } );

}

// The day's budget for driving with others, in billed Durable Object requests: LIVE_DAILY_BUDGET,
// or DAILY_BUDGET when it's unset.
function dailyBudget( env ) {

	return setting( env.LIVE_DAILY_BUDGET, DAILY_BUDGET );

}

// Switched off: LIVE=off, or a budget of 0.
function liveOff( env ) {

	return env.LIVE === 'off' || dailyBudget( env ) === 0;

}

// A room's one name, whichever way it was written ('near:1277.01088#0' is 'near:1277.1088').
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
// room, at (connected), heard (last message, a keepalive included), tokens, filled (the rate's
// bucket and when it was counted), honk (the last), left (closed by the room), spent (billed
// requests the room hasn't reported yet), reported (when the room last reported), shown (the dots
// of who's driving now it reported then, see dots), and once it has said hello pid, name, star,
// vehicle, look, place, away, s }.
export class DriveRoom extends DurableObject {

	constructor( ctx, env ) {

		super( ctx, env );
		this.drivers = new Map();
		// States taken (moves), and how many of them and when the last batch went out; whether the next
		// batch is to go now (a car's first state).
		this.moves = 0;
		this.flushed = 0;
		this.flushedAt = 0;
		this.urgent = false;
		// Spent by connections that went with nobody left to carry it: reported as the room empties.
		this.leftover = 0;
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
			this.charge( COST.connect, server );

		} else if ( here.length - before.length >= this.max( room ) ) {

			// Accepted only to say so: the page then tries the area's next shard. Connecting was a
			// request all the same.
			send( server, { t: 'full', room: name, max: this.max( room ) } );
			server.close( CLOSE.full, 'full' );
			this.charge( COST.connect, server );

		} else {

			// Its spend starts with connecting, and the room's reports go on as they were (or start).
			// Kept before the connection it replaces goes, so that one's unreported spend has this to go
			// with, and the room's last report is still known from it.
			const driver = {
				visit, seq, expires, room: name, at: now, heard: now, tokens: BURST, filled: now, honk: 0, pid: null,
				spent: COST.connect, reported: this.reportedAt( server ) ?? now, shown: this.shownKey(), moved: 0, sent: 0,
			};
			this.drivers.set( server, driver );
			this.save( server, driver );
			for ( const ws of before ) this.shut( ws, CLOSE.replaced, 'replaced' );
			await this.wake( Math.min( now + HELLO_MS, expires ) );

		}

		return new Response( null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': PROTOCOL } } );

	}

	async webSocketMessage( ws, message ) {

		const driver = this.driver( ws );
		if ( driver.left ) return this.unheeded( ws );
		const now = Date.now();
		// Every message in is billed, whatever becomes of it (each way on from here saves it).
		driver.spent = ( driver.spent ?? 0 ) + COST.message;
		if ( liveOff( this.env ) ) return this.shut( ws, CLOSE.off, 'off' );
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
	// secret check out (never one the page sends), with a ⭐ for a supporter's; anyone else, or
	// everyone while the database can't say, is a guest.
	async hello( ws, driver, m ) {

		const vehicle = checkVehicle( m.vehicle );
		const look = checkLook( m.look );
		// No place: on the globe, not dropped in anywhere yet.
		const somewhere = m.place !== null && m.place !== undefined;
		const place = somewhere ? checkPlace( m.place ) : null;
		if ( ! vehicle || ! look || ( somewhere && ! place ) ) return this.shut( ws, CLOSE.protocol, 'bad hello' );

		driver.pending = true;
		driver.queue = [];
		this.save( ws, driver );
		const { name, star } = await this.nameOf( m.player, driver.visit );
		// Gone while it was looked up.
		if ( this.drivers.get( ws ) !== driver || driver.left || ws.readyState !== WebSocket.OPEN ) return;

		const taken = new Set( this.sockets().map( other => this.driver( other ).pid ) );
		let pid = randomToken( 6 );
		while ( taken.has( pid ) ) pid = randomToken( 6 );
		Object.assign( driver, { pid, name, star, vehicle, look, place, away: m.away === true, s: null, pending: false } );
		const others = this.helloed().filter( other => other !== ws ).map( other => playerOf( this.driver( other ) ) );
		send( ws, { t: 'welcome', you: pid, name, star, room: driver.room, max: this.max( parseRoom( driver.room ) ), players: others } );
		driver.sent = this.moves;
		this.broadcast( { t: 'join', player: playerOf( driver ) }, ws );

		const queue = driver.queue;
		driver.queue = null;
		for ( const [ next, at ] of queue ) {

			if ( ! this.handle( ws, driver, next, at ) ) return this.shut( ws, CLOSE.protocol, 'bad message' );

		}

		this.save( ws, driver );
		this.flush( Date.now() );

	}

	// { name, star } for hello's player: { id, secret } as the leaderboard has them, or anything else
	// from `visit`. A guest's four figures are its visit's, so they stay the same each time it
	// connects (Hide, by name, holds; a friend coming back is the same guest).
	async nameOf( player, visit ) {

		try {

			if ( isObject( player ) ) {

				const { id, secret } = credentials( player );
				const row = await database( this.env ).prepare( `SELECT p.name, ${ hasPass( 'p.account_id', '?3' ) } AS star FROM players p WHERE p.id = ?1 AND p.secret_hash = ?2` )
					.bind( id, await sha256Hex( secret ), supporterEmails( this.env ) ).first();
				if ( row ) return { name: row.name, star: !! row.star };

			}

		} catch ( err ) {

			// Not a player's shape (credentials), or no database just now: a guest either way.
			if ( ! ( err instanceof HttpError ) ) console.error( 'Live name', err?.name, err?.message );

		}

		const number = parseInt( ( await sha256Hex( `guest ${ visit }` ) ).slice( 0, 8 ), 16 ) % 10000;
		return { name: `Guest ${ String( number ).padStart( 4, '0' ) }`, star: false };

	}

	// One message from a driver who has said hello; false for one it can't take. A state that isn't
	// one a car could be in is only dropped: a page's physics can blink out for a frame (a NaN, a fall
	// through the world), and that shouldn't cost it its place.
	handle( ws, driver, m, now ) {

		const { pid } = driver;
		switch ( m.t ) {

			case 's': {

				const s = checkState( m.s );
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
				Object.assign( driver, { vehicle, look } );
				this.broadcast( { t: 'look', pid, vehicle, look }, ws );
				return true;

			}

			case 'place': {

				const place = checkPlace( m.place );
				if ( ! place ) return false;
				Object.assign( driver, { place, away: false } );
				this.broadcast( { t: 'place', pid, place }, ws );
				return true;

			}

			case 'away':
				// Back on the globe: no car where it last was, for anyone joining meanwhile.
				Object.assign( driver, { away: true, s: null } );
				this.broadcast( { t: 'away', pid }, ws );
				return true;

			case 'trick': {

				const score = checkTrick( m.score );
				if ( ! score ) return false;
				this.broadcast( { t: 'trick', pid, score }, ws );
				return true;

			}

			case 'honk':
				// (Queued behind a hello, it wasn't spaced as it came in: now is when it did.)
				if ( now - driver.honk < HONK_GAP ) return true;
				driver.honk = now;
				this.broadcast( { t: 'honk', pid }, ws );
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
		for ( const [ ws, to ] of drivers ) {

			const near = to.room.startsWith( 'near:' ) && to.s;
			const s = [];
			for ( const [ other, from ] of drivers ) {

				if ( other === ws || ! from.s || from.moved <= to.sent ) continue;
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
			if ( liveOff( this.env ) ) this.shut( ws, CLOSE.off, 'off' );
			else if ( now >= driver.expires ) this.shut( ws, CLOSE.expired, 'expired' );
			else if ( now >= hello ) this.shut( ws, CLOSE.hello, 'no hello' );
			else if ( now >= driver.heard + IDLE_MS ) this.shut( ws, CLOSE.idle, 'idle' );
			else next = Math.min( next, driver.expires, hello, driver.heard + IDLE_MS );

		}

		this.flush( now );
		// This alarm is a request too: in the report, if one's due (or nobody's left, for what the
		// last of them spent, and to take the room's dots off the globe), else counted for the next.
		if ( ! this.sockets().length ) {

			if ( this.leftover > 0 || this.shownKey() !== '' ) await this.report( now, COST.alarm );

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
		const unreported = this.sockets().reduce( ( sum, ws ) => sum + ( this.driver( ws ).spent ?? 0 ), this.leftover );
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
		return dotsOf( drivers.map( ( { s, place } ) => s ? { x: s[ 0 ], y: s[ 1 ], z: s[ 2 ] } : spotIn( place, room.cell ) ), room.cell );

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
	// says where its drivers are too (dots), none once it's empty.
	async report( now, extra ) {

		const dots = this.dots();
		let amount = this.leftover + extra + COST.report;
		this.leftover = 0;
		for ( const ws of this.sockets() ) {

			const driver = this.driver( ws );
			amount += driver.spent ?? 0;
			Object.assign( driver, { spent: 0, reported: now } );
			this.save( ws, driver );

		}

		let open = true;
		try {

			const limits = this.env.LIMITS.get( this.env.LIMITS.idFromName( 'global' ) );
			( { open } = await limits.liveSpent( amount, { now, budget: dailyBudget( this.env ), ...( dots ? { online: { room: this.name, dots } } : {} ) } ) );

		} catch ( err ) {

			console.error( 'Live budget report', err?.name, err?.message );
			this.charge( amount );
			if ( dots ) this.shownAs( null );
			return;

		}

		// (With the day's spent, DriveLimits has let go of them too.)
		if ( dots ) this.shownAs( open ? keyOf( dots ) : '' );
		if ( open ) return;
		for ( const ws of this.sockets() ) this.shut( ws, CLOSE.off, BUDGET_SPENT );
		// The day's spent: what they had spent since is let go, rather than asking again to add it.
		this.leftover = 0;

	}

	// `amount` (billed requests) for the next report: on a connection still here (not `except`),
	// or with nobody, the room's leftover.
	charge( amount, except = null ) {

		const ws = this.sockets().find( other => other !== except );
		if ( ! ws ) {

			this.leftover += amount;
			return;

		}

		const driver = this.driver( ws );
		driver.spent = ( driver.spent ?? 0 ) + amount;
		this.save( ws, driver );

	}

	// A connection going: what it spent that the room hasn't reported, carried by another (charge).
	settle( ws, driver ) {

		const amount = driver.spent ?? 0;
		driver.spent = 0;
		this.charge( amount, ws );

	}

	// A message on a connection the room has closed (or turned away as full) whose page hasn't
	// answered the close and goes on sending: billed all the same, so counted. A browser stops once
	// it has the close, so a few are only what was on the way; past BURST, the client is ignoring
	// it, and as the runtime has no way to cut one connection off, the room resets, with what it has
	// spent reported first. Everyone's connection to it drops then, and their pages come back by
	// themselves; the one that wouldn't stop has to connect again (a request) to go on.
	async unheeded( ws ) {

		this.charge( COST.message, ws );
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

			if ( this.leftover > 0 || this.shownKey() !== '' ) await this.report( now, 0 );
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

	// To everyone else who has said hello.
	broadcast( message, except ) {

		const text = JSON.stringify( message );
		for ( const ws of this.helloed() ) {

			if ( ws !== except ) send( ws, text );

		}

	}

}

// A room's dots as it reports them, as text to tell whether they've changed: '' for none.
function keyOf( dots ) {

	return dots.length ? JSON.stringify( dots ) : '';

}

// Where a driver whose car the room has no word of is, Earth-centred: where they dropped in, if
// that's in the area `cell`, else the middle of it.
function spotIn( place, cell ) {

	if ( cellOf( place.lat, place.lon ) === cell ) return toEcef( place.lat, place.lon, place.height );
	const { south, north, west, east } = boundsOf( cell );
	return toEcef( ( south + north ) / 2, ( west + east ) / 2, place.height );

}

// A PLAYER, as the others are told of one.
function playerOf( { pid, name, star, vehicle, look, place, away, s } ) {

	return { pid, name, star, vehicle, look, place, away, s };

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
