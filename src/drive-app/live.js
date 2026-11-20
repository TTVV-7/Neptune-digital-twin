import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import {
	BUDGET_SPENT, CLOSE, EARTH, FLAGS, HONK_GAP, KEEPALIVE_MS, LIVE_WORLD_IDS, MOON_WORLD, NEARBY_SHARDS, PAGE_PROTOCOLS, PARTY_MAX, PING, PONG, SEND_HZ, SHARE_SPENT,
	STALE_MS, WORLD_OFF, STILL_HZ, cellOf, checkLook, checkPlace, checkState, checkTrick, checkVehicle, cleanPartyCode, knows, makePartyCode, packState, placeWorld, shardOf,
	versionOf, worldOfRoom,
} from './live-protocol.js';
import { getConfig } from './api.js';
import { LEVEL_MAX, TITLES } from './levels.js';
import { storage } from './places.js';

// Driving with others (docs/world-drive.md): the page's side of live-protocol.js. One WebSocket to
// one room at a time: a party's (party:CODE, everyone who opened its link) whenever this page is in
// one, on the globe too and on any world; otherwise, with "Show me to drivers nearby" on, the area
// the car is in (near:BAND.COL on the Earth, moon:, mars:, vesta: or ceres:BAND.COL on the others,
// from a drop-in until a minute back on the globe, or at once on another world's globe), or the
// next of its shards when one is full. Each world's budget for the day is its own
// (worker/drive/live.js): one spent, this page drives on alone on that world (closed) and with
// others on the rest; a party is kept, through a world still open (here), while it looks at or
// drives alone on a closed one. It says where the car is in its world's own frame (Earth-centred,
// Moon-centred, Mars-centred...) so that pages centred on other places agree, up to SEND_HZ times a
// second while it moves and only while someone else is there to see it (each message is billed:
// alone it's quiet, with only those on the globe it's slow, and it sends the car as soon as someone
// comes); hands what the room says to whoever listens (ghosts.js draws the others, friends.js the
// list and the party); and comes back after a dropped connection, one that went quiet included.
//
// Events (on( type, fn )): 'status' (connecting, live...), 'party' (joined or left one), 'nearby'
// (the switch), 'welcome' { room, you, max, players }, 'join' PLAYER, 'leave' { pid, player },
// 'look' { pid, vehicle, look }, 'place' { pid, place }, 'away' { pid, globe }, 'states' { at,
// states: [ { pid, s, age } ] }, 'trick' { pid, score }, 'honk' { pid }, 'clear' (everyone's gone: a
// new room, or the connection dropped), 'full' { max } (a party with its most already), 'closed'
// { world, quiet, share } (that world's budget for the day is spent, or it's switched off there,
// quiet, or this address has had its share of it today, share, and some other world's isn't) and
// 'ended' (why: driving with others is over for this visit; 'budget' when it's off till midnight
// UTC on every world, 'refused' when the Worker kept turning it away on every world still open).

const NEARBY_KEY = 'world-drive.nearby';
// Seconds to wait before connecting again after a dropped connection: the first time, the
// second... and from then on the last.
const BACKOFF = [ 1, 2, 5, 10, 30 ];
// The car must have been in another area this long (ms) before the room follows it there, so
// driving along the edge of one doesn't hop between two.
const SWITCH_MS = 5000;
// How long (ms) an area's room is kept back on the globe, for a drop-in somewhere near again.
const AWAY_MS = 60000;
// A car that has moved less than this (m, or radians turned) since it was last sent, going slower
// than STILL_SPEED (m/s), is sitting still.
const STILL = 0.03;
const STILL_SPEED = 0.2;
// New flags go at once, but never sooner than this (ms) after the last state.
const FLAG_GAP = 60;
// What this page sends a second on average, and at most at once: under the room's RATE and BURST,
// whatever the flags do.
const BUDGET = { rate: 14, burst: 24 };
// Faster than this (m/s) goes as this: the room turns away anything over the protocol's top speed
// (live-protocol.js's TOP_SPEED, 1,100), and a plane goes up to 972 (src/plane.js), 1,087 over the
// top of a loop (its hump: src/plane-tricks.js), which has to arrive as it is for others to see it
// fly between words rather than jump (teleported) and to be carried on past the last word at its
// speed. A little under 1,100, for the rounding.
const MAX_SPEED = 1090;
// How often (ms) the car's area is worked out again.
const FOLLOW_MS = 500;
// Nothing heard this long (ms) after a keepalive: the connection has gone without a word (a network
// that drops everything), and is taken as dropped.
const SILENT_MS = 10000;
// Turned away at the door: /api/config is asked the first time in a row (and each time while it
// can't be reached), then at most this often (ms); and REFUSALS in a row on a world while the Worker
// says it's on there closes that world for the visit (and on every world still open, it's over).
const CONFIG_MS = 5 * 60000;
const REFUSALS = 8;

const _inverse = new Matrix4();
const _earth = new Quaternion();
const _p = new Vector3();
const _q = new Quaternion();
const _v = new Vector3();
const _last = new Vector3();
const _lastQ = new Quaternion();
const _carto = {};

// earth: the tiles' group (or the test globe's), whose matrixWorld takes Earth-centred positions
// into the scene; ellipsoid: its. bodies: { moon, mars, vesta, ceres: { group, ellipsoid } } the same
// for each other world (body.js's group, the one a recentre moves; moon: the Moon's alone, from
// before), and world(): which one the game is on. liveWorlds: the worlds with driving with others
// (main.js's LIVE_WORLDS). visit: the visit's token. player(): the leaderboard's player ({ id,
// secret, name }) or null. ride: { vehicle, look }, what's driven to begin with. closed: the worlds
// whose budget for the day /api/config said was spent (or switched off); config: what it said, if
// the page has it already.
export function createLive( {
	earth, ellipsoid, bodies = {}, moon = null, world = () => EARTH, liveWorlds = LIVE_WORLD_IDS, visit, player = () => null, ride: firstRide, closed: closedAtFirst = [],
	config: firstConfig = null,
} ) {

	const listeners = new Map();
	// The frame each world's positions are in: its group, whose matrixWorld takes them into the
	// scene, and its shape.
	const frames = { [ EARTH ]: { group: earth, ellipsoid } };
	for ( const id of LIVE_WORLD_IDS ) {

		const frame = bodies[ id ] ?? ( id === MOON_WORLD ? moon : null );
		if ( id !== EARTH && frame?.group && frame.ellipsoid ) frames[ id ] = frame;

	}

	// The worlds this page drives with others on (those it has a frame for), in LIVE_WORLD_IDS' order.
	const usable = LIVE_WORLD_IDS.filter( id => liveWorlds.includes( id ) && frames[ id ] );
	// Worlds whose budget for the day is spent (or switched off, or that kept turning this page
	// away): on them, this page drives alone.
	const closedWorlds = new Set( closedAtFirst );
	// Of those, the ones that kept turning it away while the Worker said they were on.
	const refusedWorlds = new Set();
	const open = id => usable.includes( id ) && ! closedWorlds.has( id );
	// Which world's rooms and budget this page uses (here): the game's world, when it has driving
	// with others and it's open; otherwise (on a closed world, or one without) the last world it was
	// on that's still open, else the first open one, else none: a party isn't dropped for a budget
	// it needn't use. (Its room is told this page is on the globe there: see shown.)
	let roomWorld = null;
	const here = () => {

		const on = world();
		if ( open( on ) ) return ( roomWorld = on );
		if ( roomWorld && open( roomWorld ) ) return roomWorld;
		return usable.find( open ) ?? null;

	};
	let party = null;
	let nearby = storage( () => localStorage.getItem( NEARBY_KEY ) ) !== 'off';
	// Why driving with others is over for this visit, or null while it isn't.
	let ended = null;
	let place = null;
	let away = true;
	let awaySince = performance.now();
	let ride = { vehicle: firstRide?.vehicle ?? 'go-kart', look: firstRide?.look ?? {} };
	// The area the car is in (its room's name for shard 0), which shard of it, and an area whose
	// shards were all full; another area it's been in since otherSince.
	let cell = null;
	let shard = 0;
	let busy = null;
	let other = null;
	let otherSince = 0;
	let followed = 0;
	// The room wanted (connected, connecting or waiting to try again), its socket, this page's pid
	// in it once welcomed and what the others there call it ({ name, star }), its most and everyone
	// else in it.
	let room = null;
	let socket = null;
	let you = null;
	let self = null;
	let max = 0;
	const players = new Map();
	let tries = 0;
	let retryTimer = null;
	let status = 'off';
	// Attempts in a row turned away at the door, on each world, what /api/config last said (null: it
	// couldn't be reached) and when (turnedAway).
	const refusals = {};
	let config = firstConfig;
	let configAt = - Infinity;
	// What the room has been told of this page (see tell), when anything last went, the last state
	// sent (when, its flags, where, whether the car was moving), the car's latest state (null without
	// a car), the budget left and the last honk.
	let told = null;
	// Which version of the protocol the room this page is in speaks (versionOf: 3 knows every world, 2
	// the Earth and the Moon, 1 the Earth): a room still running the code from before (for a few
	// minutes after a deploy) may speak an older one, and then this page is on the globe as far as
	// it's told while it's on a world that one doesn't know, as a page from before was; and the world
	// its socket's budget is (the area's, or here's for a party's).
	let version = 3;
	let socketWorld = null;
	let sentAt = 0;
	let stateAt = - Infinity;
	let flagsSent = - 1;
	let wasMoving = false;
	let latest = null;
	let tokens = BUDGET.burst;
	let tokensAt = performance.now();
	let honkAt = - Infinity;
	// When the room was last heard from, and the last keepalive sent.
	let heardAt = 0;
	let pingAt = - Infinity;
	// When the visit's token runs out (its third part, in seconds): the rooms turn it away after.
	const visitEnds = Number( String( visit ).split( '.' )[ 2 ] ) * 1000 || Infinity;

	// The keepalive, the minute back on the globe and the wait to try again run on a timer of their
	// own, so they go on while frames don't (a tab in the background).
	setInterval( tick, 1000 );
	// A page out of sight (another tab or window in front, minimised, a phone's screen off) draws no
	// frames, so update() stops and its car would be gone for the others STALE_MS later: as it
	// hides, its car is parked where it is instead, standing still and paused, so it stays there for
	// them ("paused" in their list) and is what a newcomer is sent. Its next frame, back in sight,
	// says otherwise at once. With no budget for it just then, tick tries again each second.
	let parking = false;
	if ( typeof document !== 'undefined' ) document.addEventListener( 'visibilitychange', () => {

		if ( document.visibilityState !== 'hidden' || ! latest ) return;
		latest = parked( latest ) ?? latest;
		parking = true;
		park();

	} );

	function park() {

		if ( ! parking || ! latest || ! ( latest[ 10 ] & FLAGS.paused ) ) {

			parking = false;
			return;

		}

		if ( ! isLive() || ! players.size || flagsSent === latest[ 10 ] ) return;
		if ( ! spend() ) return;
		sendState();
		parking = false;

	}

	function emit( type, data ) {

		for ( const fn of listeners.get( type ) ?? [] ) fn( data );

	}

	// --- which room ---

	function wanted() {

		const on = here();
		if ( ended || ! on ) return null;
		if ( party ) return `party:${ party }`;
		if ( ! nearby || ! cell || busy === cell ) return null;
		if ( away && performance.now() - awaySince >= AWAY_MS ) return null;
		// An area of another world (on its globe now, so not coming back near), or of a world closed
		// or without driving with others (here is another, for a party's sake).
		if ( worldOfRoom( cell ) !== on || on !== world() ) return null;
		// Shard 0 is the area's own name (cellOf's), the others '#1' to '#3' after it.
		return shard ? shardOf( cell, shard ) : cell;

	}

	function sync() {

		const target = wanted();
		if ( target !== room ) {

			leave();
			if ( target ) connect( target );

		}

		setStatus();

	}

	function setStatus() {

		// (Closed: alone on the game's world, with no party's room through another.)
		const next = ended ? 'ended' : ! here() || ( ! room && closedWorlds.has( world() ) ) ? 'closed'
			: ! room ? ( ! party && nearby && busy && busy === cell ? 'busy' : 'off' ) : you ? 'live' : retryTimer ? 'retrying' : 'connecting';
		if ( next === status ) return;
		status = next;
		emit( 'status', status );

	}

	// --- the connection ---

	function connect( name ) {

		room = name;
		// A run-out visit is turned away at the door, which looks no different here from a connection
		// that dropped: it's over, as the room would have said had it been connected.
		if ( Date.now() >= visitEnds ) {

			end( 'expired' );
			return;

		}

		const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
		let ws;
		try {

			// The visit's token goes as the last subprotocol, after the protocol's versions (the one
			// that knows every world, and those from before, for a room still running one): a browser
			// can't set headers on a WebSocket, and in the address it would end up in logs. The room's
			// name has a '#' for a shard; for a party, which world's budget this page uses (here's).
			socketWorld = worldOfRoom( name ) ?? here() ?? EARTH;
			const on = name.startsWith( 'party:' ) && socketWorld !== EARTH ? `&world=${ socketWorld }` : '';
			ws = new WebSocket( `${ scheme }://${ location.host }/api/live?room=${ encodeURIComponent( name ) }${ on }`, [ ...PAGE_PROTOCOLS, visit ] );

		} catch ( err ) {

			console.error( 'World Drive: driving with others couldn\'t connect.', err );
			end( 'protocol' );
			return;

		}

		socket = ws;
		let opened = false;
		ws.addEventListener( 'open', () => {

			opened = true;
			if ( socket !== ws ) return;
			refusals[ socketWorld ] = 0;
			heardAt = performance.now();
			pingAt = - Infinity;
			version = versionOf( ws.protocol ) || 1;
			const [ where, gone ] = shown();
			told = { ride: JSON.stringify( ride ), place: JSON.stringify( where ), away: gone, world: here(), globe: globeOf( gone ) };
			transmit( { t: 'hello', player: helloPlayer(), vehicle: ride.vehicle, look: ride.look, place: where, away: gone, ...worldOf( gone ) } );

		} );
		ws.addEventListener( 'message', e => {

			if ( socket !== ws ) return;
			heardAt = performance.now();
			receive( e.data );

		} );
		// Only the socket in use counts: one closed here on the way to another room, or the one a
		// reconnect replaced, says nothing.
		ws.addEventListener( 'close', e => socket === ws && closed( e.code, { opened, reason: e.reason } ) );

	}

	function helloPlayer() {

		const p = player();
		return p ? { id: p.id, secret: p.secret } : null;

	}

	// Hang up on the room (if any) and forget it.
	function leave() {

		clearTimeout( retryTimer );
		retryTimer = null;
		const ws = socket;
		socket = null;
		ws?.close( 1000 );
		room = null;
		forget();

	}

	function forget() {

		you = null;
		self = null;
		told = null;
		players.clear();
		emit( 'clear' );

	}

	// What the room is told of where this page is: [ place, away ]. To a room from before a world had
	// drivers (one that doesn't know it), a page there is on the globe; and so is a page driving on a
	// world other than here (closed, or without driving with others), in a party through here.
	function shown() {

		const on = placeWorld( place );
		return ! knows( version, on ) || on !== here() || on !== world() ? [ null, true ] : [ place, away ];

	}

	// What goes with hello and away of which world: here's (whose budget the room charges this page
	// to), to a room that knows of worlds and of it; and, on the globe, which world's globe this page
	// is on (the game's: only to be shown, never charged), to a room that knows of that.
	function worldOf( gone ) {

		const on = here();
		const globe = globeOf( gone );
		return { ...( version >= 2 && on && knows( version, on ) ? { world: on } : {} ), ...( globe ? { globe } : {} ) };

	}

	function globeOf( gone ) {

		const on = world();
		return gone && version >= 3 && knows( version, on ) ? on : null;

	}

	// A world's budget for the day is spent (the room said so as it closed it, or the Worker as it
	// turned it away), or it's switched off there (`quiet`: nothing's said of lots of drivers), or
	// this address has had its share of it today (`share`), or it kept turning this page away: it
	// drives alone there, and with others on the rest; with none of them left open, it's over for the
	// visit.
	function closeWorld( which, { quiet = false, share = false } = {} ) {

		if ( ended ) return;
		closedWorlds.add( which );
		if ( ! usable.some( open ) ) {

			end( refusedWorlds.has( which ) ? 'refused' : 'budget' );
			return;

		}

		// The room goes: a party's comes back at once through a world still open (see here).
		leave();
		sync();
		emit( 'closed', { world: which, quiet, share } );

	}

	// The room's socket closed with `code` and `reason`; opened: whether it ever got in (else the
	// Worker turned it away before the room, or couldn't be reached); max: the room's most, when it
	// was full.
	function closed( code, { opened = true, max: most = PARTY_MAX, reason = '' } = {} ) {

		socket = null;
		const name = room;
		// (The world whose budget that socket was: an area's; a party's, here's, as it connected if it
		// never got in, else as the room was last told.)
		const which = worldOfRoom( name ) ?? ( opened ? here() : socketWorld ) ?? EARTH;
		forget();
		if ( code === CLOSE.full ) {

			room = null;
			if ( party ) {

				// A party with its most already: drive on alone (or nearby).
				party = null;
				emit( 'full', { max: most } );
				emit( 'party', null );

			} else if ( shard + 1 < NEARBY_SHARDS ) shard ++;
			else {

				busy = cell;
				shard = 0;

			}

			sync();

		} else if ( code === CLOSE.replaced ) end( 'replaced' );
		else if ( code === CLOSE.expired ) end( 'expired' );
		else if ( code === CLOSE.off && reason === BUDGET_SPENT ) closeWorld( which );
		// This address has had its share of that world's budget today: that world only.
		else if ( code === CLOSE.off && reason === SHARE_SPENT ) closeWorld( which, { share: true } );
		// Switched off on that world only (its budget is 0): that world only, without a word, as
		// turnedAway does when /api/live turns it away there. Any other reason is off everywhere.
		else if ( code === CLOSE.off && reason === WORLD_OFF ) closeWorld( which, { quiet: true } );
		else if ( code === CLOSE.off ) end( 'off' );
		else if ( code === CLOSE.protocol ) {

			console.error( `World Drive: the room ${ name } turned away what this page said (close ${ code }); driving with others is off for this visit.` );
			end( 'protocol' );

		} else if ( ! opened ) turnedAway( name, which );
		else retry( name );
		setStatus();

	}

	// Never let in: the Worker said no before the room (as it does to everyone while LIVE is off, or
	// once that world's budget for the day is spent, and to a visit that keeps connecting; and a room
	// still on the code from before to an area of a world it doesn't know), or wasn't there to ask.
	// A browser doesn't say which, so its config does: switched off everywhere is over for this visit
	// (without a word); that world spent or switched off is alone there (and over for the visit with
	// every other spent or off too); anything else (DriveLimits not answering just then, with
	// liveReason 'unknown', included) is tried again as a dropped connection is. Each ask the Worker
	// answers is a request, so it's asked the first time in a row and then only every CONFIG_MS: a
	// network that blocks WebSockets would otherwise have it asked every 30 s for hours. While it
	// can't be reached (offline, or the Worker restarting), each time, to hear as soon as it's back
	// whether it's on. And turned away REFUSALS times in a row on a world the Worker last said was on
	// (never while it couldn't be reached), that world is closed for this visit; once every world it
	// says is on has, driving with others is over for the visit.
	async function turnedAway( name, which ) {

		const tried = refusals[ which ] = ( refusals[ which ] ?? 0 ) + 1;
		if ( tried === 1 || ! config || performance.now() - configAt >= CONFIG_MS ) {

			configAt = performance.now();
			config = await getConfig();
			if ( room !== name || socket || ended ) return;
			const state = worldsOf( config );
			const others = usable.filter( id => id !== which );
			if ( state[ which ] === 'off' && ! others.some( id => state[ id ] === 'open' && ! closedWorlds.has( id ) ) ) {

				end( 'off' );
				return;

			}

			if ( state[ which ] === 'spent' || state[ which ] === 'off' ) {

				// (The others it says are spent or off too, as they are: here won't go to one.)
				for ( const id of others ) if ( state[ id ] === 'spent' || state[ id ] === 'off' ) closedWorlds.add( id );
				closeWorld( which, { quiet: state[ which ] === 'off' } );
				return;

			}

		}

		const state = worldsOf( config );
		if ( state[ which ] === 'open' && tried >= REFUSALS ) {

			refusedWorlds.add( which );
			// Every world the Worker says is on has turned this page away: over for the visit.
			if ( usable.every( id => state[ id ] !== 'open' || closedWorlds.has( id ) || refusedWorlds.has( id ) ) ) end( 'refused' );
			else closeWorld( which, { quiet: true } );
			return;

		}

		retry( name );
		setStatus();

	}

	function retry( name ) {

		const wait = BACKOFF[ Math.min( tries, BACKOFF.length - 1 ) ];
		tries ++;
		retryTimer = setTimeout( () => {

			retryTimer = null;
			if ( room !== name || socket ) return;
			if ( wanted() === name ) connect( name );
			else {

				room = null;
				sync();

			}

			setStatus();

		}, wait * 1000 );

	}

	// Over for this visit: replaced by another tab, the visit run out, switched off (or for the rest of
	// the day, its budget spent), a message the room wouldn't take, or turned away again and again.
	function end( reason ) {

		if ( ended ) return;
		ended = reason;
		leave();
		setStatus();
		emit( 'ended', reason );

	}

	function isLive() {

		return !! socket && socket.readyState === WebSocket.OPEN && you !== null;

	}

	// Send a message (an object, or the keepalive's text), spending from the budget: states only
	// while there's some left, everything else regardless (they're few), so the budget only ever
	// holds states back.
	function transmit( message ) {

		if ( ! socket || socket.readyState !== WebSocket.OPEN ) return false;
		spend();
		tokens -= 1;
		socket.send( typeof message === 'string' ? message : JSON.stringify( message ) );
		sentAt = performance.now();
		return true;

	}

	function spend() {

		const now = performance.now();
		tokens = Math.min( BUDGET.burst, tokens + ( now - tokensAt ) / 1000 * BUDGET.rate );
		tokensAt = now;
		return tokens >= 1;

	}

	// Tell the room what's changed since hello (or since it was last told): the ride, a drop-in
	// somewhere, or back to the globe.
	function tell() {

		if ( ! isLive() || ! told ) return;
		const rideKey = JSON.stringify( ride );
		if ( told.ride !== rideKey ) {

			transmit( { t: 'look', vehicle: ride.vehicle, look: ride.look } );
			told.ride = rideKey;

		}

		const [ where, gone ] = shown();
		const placeKey = JSON.stringify( where );
		// Back on the globe; or on it still, turned to another world (a room that knows of worlds is
		// told which world's budget, for a party's, and which world's globe, for the others' lists).
		const extra = worldOf( gone );
		if ( gone && ( ! told.away || ( version >= 2 && ( told.world !== here() || told.globe !== ( extra.globe ?? null ) ) ) ) ) transmit( { t: 'away', ...extra } );
		else if ( ! gone && where && ( told.away || told.place !== placeKey ) ) transmit( { t: 'place', place: where } );
		told.away = gone;
		told.place = placeKey;
		told.world = here();
		told.globe = extra.globe ?? null;

	}

	// The car as it is now, to a room that has just had someone come after this page had it to itself
	// (and so had sent none): they see it at once, wherever it's got to, even with no frames coming
	// (a tab in the background). Not on the globe: that's no car.
	// A state `s` as its car parked: where it is, still, paused, its wheels on the ground if they were.
	function parked( s ) {

		if ( s.length !== 11 ) return null;
		return [ ...s.slice( 0, 7 ), 0, 0, 0, FLAGS.paused | ( s[ 10 ] & FLAGS.grounded ) ];

	}

	function sendState() {

		if ( ! latest || shown()[ 1 ] || ! isLive() ) return;
		transmit( { t: 's', s: latest } );
		stateAt = performance.now();
		flagsSent = latest[ 10 ];
		_last.set( latest[ 0 ], latest[ 1 ], latest[ 2 ] );
		_lastQ.set( latest[ 3 ], latest[ 4 ], latest[ 5 ], latest[ 6 ] );

	}

	function tick() {

		// Back on the globe for a minute: the area's room goes.
		if ( room && wanted() !== room ) sync();
		if ( ! isLive() ) return;
		park();
		const now = performance.now();
		// Nothing heard since a keepalive SILENT_MS ago: the way to the room has gone quiet (no word of
		// it closing gets through either), so it's a dropped connection, tried again as one.
		if ( pingAt > heardAt && now - pingAt > SILENT_MS ) {

			const ws = socket;
			closed( 1006 );
			ws.close();
			return;

		}

		// The keepalive, when nothing has been sent for KEEPALIVE_MS (the room's idle check counts
		// only what it hears) or nothing heard for that long (to know the way's still there), at most
		// one every KEEPALIVE_MS.
		if ( ( now - sentAt >= KEEPALIVE_MS || now - heardAt >= KEEPALIVE_MS ) && now - pingAt >= KEEPALIVE_MS ) {

			transmit( PING );
			pingAt = now;

		}

	}

	// --- what the room says ---

	function receive( data ) {

		if ( typeof data !== 'string' || data === PONG ) return;
		let message;
		try {

			message = JSON.parse( data );

		} catch {

			return;

		}

		if ( ! message || typeof message !== 'object' ) return;
		const { t } = message;
		if ( t === 'welcome' ) {

			you = typeof message.you === 'string' ? message.you : '';
			self = { name: cleanName( message.name ), star: message.star === true };
			max = Number( message.max ) || 0;
			tries = 0;
			refusals[ socketWorld ] = 0;
			stateAt = - Infinity;
			flagsSent = - 1;
			players.clear();
			version = versionOf( socket?.protocol ) || 1;
			for ( const raw of Array.isArray( message.players ) ? message.players : [] ) {

				const p = playerOf( raw );
				if ( p ) players.set( p.pid, p );

			}

			setStatus();
			emit( 'welcome', { room, you, max, players: [ ...players.values() ] } );
			// Anything that changed while it connected, and the car if there's anyone to see it.
			tell();
			if ( players.size ) sendState();
			return;

		}

		if ( t === 'full' ) {

			// Turned away, the room has its most: on to the next shard (or out of the party) now. The
			// close that follows can be a while coming, and this socket has nothing more to say.
			const ws = socket;
			closed( CLOSE.full, { max: Number( message.max ) || PARTY_MAX } );
			ws?.close();
			return;

		}

		if ( you === null ) return;
		const p = players.get( message.pid );
		if ( t === 'join' ) {

			const joined = playerOf( message.player );
			if ( ! joined ) return;
			// The first to come since this page had the room to itself: the car, at once.
			const first = ! players.size;
			players.set( joined.pid, joined );
			if ( first ) sendState();
			emit( 'join', joined );

		} else if ( t === 'leave' ) {

			if ( ! p ) return;
			players.delete( p.pid );
			emit( 'leave', { pid: p.pid, player: p } );

		} else if ( t === 'look' && p ) {

			p.vehicle = checkVehicle( message.vehicle ) ?? p.vehicle;
			p.look = checkLook( message.look ) ?? {};
			emit( 'look', { pid: p.pid, vehicle: p.vehicle, look: p.look } );

		} else if ( t === 'place' && p ) {

			const where = checkPlace( message.place );
			// (A place on a world this room's version doesn't know: none, as if it weren't said.)
			if ( ! where || ! knows( version, placeWorld( where ) ) ) return;
			// The first to drop in where only those on the globe were: the car, at once, as for a join.
			const was = watched();
			p.place = where;
			p.world = placeWorld( where );
			p.globe = null;
			p.away = false;
			p.s = null;
			emit( 'place', { pid: p.pid, place: where } );
			if ( ! was ) sendState();

		} else if ( t === 'away' && p ) {

			p.away = true;
			p.s = null;
			// Which world's globe they're on, if the room says (one this page's room knows).
			p.globe = knowable( message.globe );
			emit( 'away', { pid: p.pid, globe: p.globe } );

		} else if ( t === 'S' && Array.isArray( message.s ) && Number.isFinite( message.at ) ) {

			const states = [];
			for ( const entry of message.s ) {

				const who = Array.isArray( entry ) ? players.get( entry[ 0 ] ) : null;
				const s = who ? checkState( entry.slice( 1, 12 ), who.world ) : null;
				if ( ! s ) continue;
				who.s = s;
				who.away = false;
				// How long (ms) the room had held it before this batch went.
				states.push( { pid: who.pid, s, age: MathUtils.clamp( Number( entry[ 12 ] ) || 0, 0, STALE_MS ) } );

			}

			if ( states.length ) emit( 'states', { at: message.at, states } );

		} else if ( t === 'trick' && p ) {

			const score = checkTrick( message.score );
			if ( score ) emit( 'trick', { pid: p.pid, score } );

		} else if ( t === 'honk' && p ) emit( 'honk', { pid: p.pid } );

	}

	// Whether anyone else in the room can see this page's car: someone driving, not on the globe, on
	// the same world.
	function watched() {

		return [ ...players.values() ].some( p => ! p.away && p.world === here() );

	}

	// A PLAYER as the room describes one, checked as the room checks what it's sent: its name is
	// only ever shown as text.
	function playerOf( raw ) {

		if ( ! raw || typeof raw !== 'object' || typeof raw.pid !== 'string' || raw.pid === you ) return null;
		// Which world they're on (the room says, to a page that knows of worlds: one its version doesn't
		// know is none, the Earth), and so which frame their place and car are in; a place on a world
		// it doesn't know is no place (they're on the globe, as far as this page is told).
		const on = knowable( raw.world ) ?? EARTH;
		const said = checkPlace( raw.place );
		const place = said && knows( version, placeWorld( said ) ) ? said : null;
		const gone = raw.away === true || ( !! said && ! place );
		return {
			pid: raw.pid,
			name: cleanName( raw.name ),
			star: raw.star === true,
			// The leaderboard player's level and title (levels.js); none for a guest.
			level: Number.isInteger( raw.level ) && raw.level >= 1 && raw.level <= LEVEL_MAX ? raw.level : null,
			title: TITLES.some( reward => reward.id === raw.title ) ? raw.title : null,
			vehicle: checkVehicle( raw.vehicle ) ?? 'go-kart',
			look: checkLook( raw.look ) ?? {},
			place,
			world: place ? placeWorld( place ) : on,
			// On the globe: which world's, if the room says.
			globe: gone ? knowable( raw.globe ) : null,
			away: gone,
			s: gone ? null : checkState( raw.s, place ? placeWorld( place ) : on ),
		};

	}

	// A world as the room names one (world, globe), if it's one this room's version knows, else null.
	function knowable( id ) {

		return typeof id === 'string' && knows( version, id ) ? id : null;

	}

	// --- the car ---

	// The car's STATE in its world's own frame (Earth-centred, Moon-centred...): the pivot's position
	// and turn taken out of the scene by its world's group's matrix as it is now (recentring moves it),
	// and its velocity turned the same way. None on a world other than here (closed, or without
	// driving with others): the room isn't told of that car.
	function stateOf( { pivot, velocity, flags } ) {

		const on = world();
		if ( on !== here() || ! frames[ on ] ) return null;
		const { group } = frames[ on ];
		group.updateWorldMatrix( true, false );
		_inverse.copy( group.matrixWorld ).invert();
		_earth.setFromRotationMatrix( group.matrixWorld ).invert();
		pivot.updateWorldMatrix( true, false );
		_p.setFromMatrixPosition( pivot.matrixWorld ).applyMatrix4( _inverse );
		pivot.getWorldQuaternion( _q ).premultiply( _earth ).normalize();
		_v.copy( velocity ).applyQuaternion( _earth );
		if ( _v.length() > MAX_SPEED ) _v.setLength( MAX_SPEED );
		// Out of the protocol's bounds (flown far up): not sent.
		return checkState( packState( _p, _q, _v, flags ), on );

	}

	// Driving out of the area the room is for: after SWITCH_MS in another, the room follows.
	function follow( now ) {

		if ( party || ! nearby || ! cell ) return;
		const on = here();
		frames[ on ].ellipsoid.getPositionToCartographic( _p, _carto );
		const area = cellOf( _carto.lat * MathUtils.RAD2DEG, _carto.lon * MathUtils.RAD2DEG, on );
		if ( area === cell ) {

			other = null;
			return;

		}

		if ( area !== other ) {

			other = area;
			otherSince = now;

		} else if ( now - otherSince >= SWITCH_MS ) {

			cell = area;
			shard = 0;
			busy = null;
			other = null;
			sync();

		}

	}

	return {

		on( type, fn ) {

			if ( ! listeners.has( type ) ) listeners.set( type, new Set() );
			listeners.get( type ).add( fn );

		},

		// Each frame, with the car ({ pivot, velocity: m/s in the scene, flags: FLAGS }) while there is
		// one, or null (the globe, dropping in).
		update( car ) {

			if ( ended ) return;
			// Out of sight, a frame the browser still draws (one already asked for, or the slow ones
			// some keep drawing) says parked too, as the page did as it hid.
			const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
			const s = car ? ( hidden ? parked( stateOf( car ) ?? [] ) : stateOf( car ) ) : null;
			latest = s;
			if ( ! s ) return;
			const now = performance.now();
			if ( now - followed >= FOLLOW_MS ) {

				followed = now;
				follow( now );

			}

			// Nobody else here: nothing to send (see sendState for when someone comes). Nor to a room
			// this page is on the globe for (one from before the Moon had drivers, while it's on the Moon).
			if ( ! isLive() || ! players.size || shown()[ 1 ] ) return;
			const flags = s[ 10 ];
			_p.set( s[ 0 ], s[ 1 ], s[ 2 ] );
			_q.set( s[ 3 ], s[ 4 ], s[ 5 ], s[ 6 ] );
			const moving = Math.hypot( s[ 7 ], s[ 8 ], s[ 9 ] ) > STILL_SPEED || _p.distanceTo( _last ) > STILL || _q.angleTo( _lastQ ) > STILL;
			const gap = now - stateAt;
			// Still, at STILL_HZ; but once more at SEND_HZ as it stops, so where it stopped goes soon.
			// With only those on the globe there, who can't see it (only their Join needs to know where
			// it is), at STILL_HZ whatever it does.
			const seen = watched();
			const due = flags !== flagsSent && seen ? gap >= FLAG_GAP : gap >= 1000 / ( seen && ( moving || wasMoving ) ? SEND_HZ : STILL_HZ );
			if ( ! due || ! spend() ) return;
			transmit( { t: 's', s } );
			stateAt = now;
			flagsSent = flags;
			wasMoving = moving;
			_last.copy( _p );
			_lastQ.copy( _q );

		},

		// The ride (its id) and look (paint.js's) now driven.
		setRide( vehicle, look ) {

			ride = { vehicle, look };
			tell();

		},

		// Dropped in at `where` ({ name, lat, lon, height, world }: world 'moon', 'mars'... off the
		// Earth): there, and no longer on the globe. A new area's room straight away (the minute back on
		// the globe was for coming back near). On a world other than here (closed, or without driving
		// with others), a party's room is told this page is on the globe there (see shown).
		setPlace( where ) {

			place = checkPlace( where );
			if ( ! place ) return;
			away = false;
			// A new area, or one where this page isn't with others in a room of it (back on the globe past
			// the minute, alone in one of its shards, or it was busy): from the area's first room again.
			// With others in a shard, within the minute, it stays with them.
			const area = cellOf( place.lat, place.lon, placeWorld( place ) );
			if ( area !== cell || party || ! room || ! players.size ) {

				cell = area;
				shard = 0;
				busy = null;

			}

			other = null;
			sync();
			tell();

		},

		// Back on the globe.
		setAway() {

			if ( away ) return;
			away = true;
			awaySince = performance.now();
			tell();

		},

		// The globe turned to another world (main.js's world() says which now): the room goes or
		// comes as that world's budget allows (an area of another world's goes at once), and a party
		// is told which world's budget and globe this page is on.
		worldChanged() {

			sync();
			tell();

		},

		// A landed trick worth `score`.
		trick( score ) {

			const clean = checkTrick( Math.min( Math.round( score ), 1e7 ) );
			if ( clean && isLive() ) transmit( { t: 'trick', score: clean } );

		},

		// The horn: false if it went too soon after the last (the room drops those anyway). It's
		// heard here either way, connected or not.
		honk() {

			const now = performance.now();
			if ( ended || now - honkAt < HONK_GAP ) return false;
			honkAt = now;
			if ( isLive() ) transmit( { t: 'honk' } );
			return true;

		},

		// A party: this one's room only, from now on, the globe included. A new code for invite.
		joinParty( code ) {

			const clean = cleanPartyCode( code );
			if ( ! clean || clean === party || ended ) return clean;
			party = clean;
			sync();
			emit( 'party', party );
			return clean;

		},

		invite() {

			return this.joinParty( makePartyCode( bytes => crypto.getRandomValues( bytes ) ) );

		},

		leaveParty() {

			if ( ! party ) return;
			party = null;
			sync();
			emit( 'party', null );

		},

		// "Show me to drivers nearby".
		setNearby( on ) {

			nearby = !! on;
			storage( () => localStorage.setItem( NEARBY_KEY, nearby ? 'on' : 'off' ) );
			if ( nearby ) busy = null;
			sync();
			emit( 'nearby', nearby );

		},

		// Hello again (the leaderboard's player made or renamed): a fresh connection to the same room.
		rehello() {

			if ( ! room ) return;
			leave();
			sync();

		},

		get status() {

			return status;

		},
		// Whether the game's world's budget for the day is spent (or it's switched off there, or no world
		// is open at all): it drives alone there (in a party's room through another world, if in one).
		get closedHere() {

			return ! here() || closedWorlds.has( world() );

		},
		// Which world's rooms and budget this page uses (here): the game's, or the one a party goes
		// through while the game's is closed; null with none open.
		get world() {

			return here();

		},
		// The game's world, as this page was told (ghosts.js draws others only while it's here).
		get gameWorld() {

			return world();

		},
		// The worlds closed for this visit (spent, switched off, or turned away): read them, don't
		// change them.
		get closedWorlds() {

			return closedWorlds;

		},
		// The worlds still open, in WORLD_IDS' order.
		openWorlds() {

			return usable.filter( open );

		},
		get ended() {

			return ended;

		},
		// When the visit runs out (ms, Date.now()'s clock): driving with others is over then, though
		// this page only finds out as it next connects.
		get visitEnds() {

			return visitEnds;

		},
		get party() {

			return party;

		},
		get nearby() {

			return nearby;

		},
		get room() {

			return room;

		},
		get you() {

			return you;

		},
		// { name, star }: what the room's others call this page, once it's in.
		get self() {

			return self;

		},
		get max() {

			return max;

		},
		get players() {

			return players;

		},
		get away() {

			return away;

		},
		get place() {

			return place;

		},
		// The ride and look the others see now ({ vehicle, look }): your horn is the one in it.
		get ride() {

			return ride;

		},

	};

}

// What /api/config says of each world (null: it couldn't be reached): { earth, moon, mars, vesta,
// ceres }, each 'open', 'spent' (its budget for the day), 'off' (switched off there: LIVE, or a
// budget of 0) or 'unknown' (DriveLimits couldn't say, or the Worker couldn't be reached). From its
// liveWorlds ({ id: { open, reason } }); a Worker from before that says only the Earth's (live,
// liveReason) and the Moon's (liveMoon, liveMoonReason; one from before the Moon had rooms not even
// those, and then the Moon's is the Earth's), and the rest are off there.
export function worldsOf( config ) {

	const out = {};
	if ( ! config ) {

		for ( const id of LIVE_WORLD_IDS ) out[ id ] = 'unknown';
		return out;

	}

	const of = ( on, reason ) => on === true ? 'open' : on !== false ? 'unknown' : reason === BUDGET_SPENT ? 'spent' : reason === 'unknown' ? 'unknown' : 'off';
	if ( config.liveWorlds && typeof config.liveWorlds === 'object' ) {

		for ( const id of LIVE_WORLD_IDS ) {

			const entry = config.liveWorlds[ id ];
			out[ id ] = entry && typeof entry === 'object' ? of( entry.open, entry.reason ) : 'off';

		}

		return out;

	}

	const earth = of( config.live, config.liveReason );
	const moon = typeof config.liveMoon !== 'boolean' ? earth
		: of( config.liveMoon, config.liveMoonReason ?? ( config.liveReason === 'unknown' ? 'unknown' : null ) );
	for ( const id of LIVE_WORLD_IDS ) out[ id ] = 'off';
	return { ...out, [ EARTH ]: earth, [ MOON_WORLD ]: moon };

}

// A name as a room gives one, for showing as text: one line, 40 characters at most.
function cleanName( name ) {

	return ( typeof name === 'string' ? name.replace( /\s+/g, ' ' ).trim().slice( 0, 40 ) : '' ) || 'Guest';

}

// FLAGS for the car drive.js is driving, from its own fields (see Driver.updateFx), or parked
// where it stopped while paused.
export function flagsOf( driver, paused ) {

	if ( paused || ! driver.active ) return FLAGS.paused | FLAGS.grounded;
	const d = driver;
	let flags = 0;
	if ( d.firing ) flags |= FLAGS.firing;
	if ( d.boost ) flags |= FLAGS.boost;
	if ( d.drifting && d.grounded ) flags |= FLAGS.drift;
	if ( d.flying || d.aircraft?.on ) flags |= FLAGS.flying;
	// (Not while folding back into a car: others see it fold as it does.)
	if ( d.aircraft?.on && d.aircraft.phase !== 'folding' ) flags |= FLAGS.plane;
	if ( ! d.grounded && ! d.flying && ! d.aircraft?.on ) flags |= FLAGS.air;
	if ( d.supersonic ) flags |= FLAGS.supersonic;
	if ( d.grounded && ! d.flying && ! d.air ) flags |= FLAGS.grounded;
	if ( d.floats && d.onWater && d.grounded && ! d.flying ) flags |= FLAGS.spray;
	if ( d.drifting ) flags |= MathUtils.clamp( d.driftLevel | 0, 0, 3 ) << FLAGS.levelShift;
	return flags;

}

// The car's velocity in the scene (m/s), as drive.js moves it: along its course, and up or down.
export function velocityOf( driver, target ) {

	if ( ! driver.active ) return target.set( 0, 0, 0 );
	const rad = driver.course * MathUtils.DEG2RAD;
	return target.set( - Math.sin( rad ) * driver.speed, driver.vy, Math.cos( rad ) * driver.speed );

}
