import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import {
	CLOSE, FLAGS, HONK_GAP, KEEPALIVE_MS, NEARBY_SHARDS, PARTY_MAX, PING, PONG, PROTOCOL, SEND_HZ, STALE_MS, STILL_HZ,
	cellOf, checkLook, checkPlace, checkState, checkTrick, checkVehicle, cleanPartyCode, makePartyCode, packState, shardOf,
} from './live-protocol.js';
import { getConfig } from './api.js';
import { storage } from './places.js';

// Driving with others (docs/world-drive.md): the page's side of live-protocol.js. One WebSocket to
// one room at a time: a party's (party:CODE, everyone who opened its link) whenever this page is in
// one, on the globe too; otherwise, with "Show me to drivers nearby" on, the area the car is in
// (near:BAND.COL, from a drop-in until a minute back on the globe), or the next of its shards when
// one is full. It says where the car is, Earth-centred so that pages centred on other places agree,
// up to SEND_HZ times a second while it moves; hands what the room says to whoever listens (ghosts.js
// draws the others, friends.js the list and the party); and comes back after a dropped connection.
//
// Events (on( type, fn )): 'status' (connecting, live...), 'party' (joined or left one), 'nearby'
// (the switch), 'welcome' { room, you, max, players }, 'join' PLAYER, 'leave' { pid, player },
// 'look' { pid, vehicle, look }, 'place' { pid, place }, 'away' { pid }, 'states' { at, states:
// [ { pid, s, age } ] }, 'trick' { pid, score }, 'honk' { pid }, 'clear' (everyone's gone: a new
// room, or the connection dropped), 'full' { max } (a party with its most already) and 'ended'
// (why: driving with others is over for this visit).

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
// Faster than this (m/s) goes as this: the room turns away anything over the protocol's top speed.
const MAX_SPEED = 450;
// How often (ms) the car's area is worked out again.
const FOLLOW_MS = 500;

const _inverse = new Matrix4();
const _earth = new Quaternion();
const _p = new Vector3();
const _q = new Quaternion();
const _v = new Vector3();
const _last = new Vector3();
const _lastQ = new Quaternion();
const _carto = {};

// earth: the tiles' group (or the test globe's), whose matrixWorld takes Earth-centred positions
// into the scene; ellipsoid: its. visit: the visit's token. player(): the leaderboard's player ({ id,
// secret, name }) or null. ride: { vehicle, look }, what's driven to begin with.
export function createLive( { earth, ellipsoid, visit, player = () => null, ride: firstRide } ) {

	const listeners = new Map();
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
	// What the room has been told of this page (see tell), when anything last went, the last state
	// sent (when, its flags, where), the budget left and the last honk.
	let told = null;
	let sentAt = 0;
	let stateAt = - Infinity;
	let flagsSent = - 1;
	let tokens = BUDGET.burst;
	let tokensAt = performance.now();
	let honkAt = - Infinity;
	// When the visit's token runs out (its third part, in seconds): the rooms turn it away after.
	const visitEnds = Number( String( visit ).split( '.' )[ 2 ] ) * 1000 || Infinity;

	// The keepalive, the minute back on the globe and the wait to try again run on a timer of their
	// own, so they go on while frames don't (a tab in the background).
	setInterval( tick, 1000 );

	function emit( type, data ) {

		for ( const fn of listeners.get( type ) ?? [] ) fn( data );

	}

	// --- which room ---

	function wanted() {

		if ( ended ) return null;
		if ( party ) return `party:${ party }`;
		if ( ! nearby || ! cell || busy === cell ) return null;
		if ( away && performance.now() - awaySince >= AWAY_MS ) return null;
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

		const next = ended ? 'ended' : ! room ? ( ! party && nearby && busy && busy === cell ? 'busy' : 'off' ) : you ? 'live' : retryTimer ? 'retrying' : 'connecting';
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

			// The visit's token goes as a subprotocol: a browser can't set headers on a WebSocket,
			// and in the address it would end up in logs. The room's name has a '#' for a shard.
			ws = new WebSocket( `${ scheme }://${ location.host }/api/live?room=${ encodeURIComponent( name ) }`, [ PROTOCOL, visit ] );

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
			told = { ride: JSON.stringify( ride ), place: JSON.stringify( place ), away };
			transmit( { t: 'hello', player: helloPlayer(), vehicle: ride.vehicle, look: ride.look, place, away } );

		} );
		ws.addEventListener( 'message', e => socket === ws && receive( e.data ) );
		// Only the socket in use counts: one closed here on the way to another room, or the one a
		// reconnect replaced, says nothing.
		ws.addEventListener( 'close', e => socket === ws && closed( e.code, { opened } ) );

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

	// The room's socket closed with `code`; opened: whether it ever got in (else the Worker turned
	// it away before the room, or couldn't be reached); max: the room's most, when it was full.
	function closed( code, { opened = true, max: most = PARTY_MAX } = {} ) {

		socket = null;
		const name = room;
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
		else if ( code === CLOSE.off ) end( 'off' );
		else if ( code === CLOSE.protocol ) {

			console.error( `World Drive: the room ${ name } turned away what this page said (close ${ code }); driving with others is off for this visit.` );
			end( 'protocol' );

		} else if ( ! opened ) turnedAway( name );
		else retry( name );
		setStatus();

	}

	// Never let in: the Worker said no before the room (as it does to everyone while LIVE is off),
	// or wasn't there to ask. A browser doesn't say which, so its config does: switched off is over
	// for this visit, without a word; anything else is tried again as a dropped connection is.
	async function turnedAway( name ) {

		const config = await getConfig();
		if ( room !== name || socket || ended ) return;
		if ( config?.live === false ) end( 'off' );
		else {

			retry( name );
			setStatus();

		}

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

	// Over for this visit: replaced by another tab, the visit run out, switched off, or a message the
	// room wouldn't take.
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

		const placeKey = JSON.stringify( place );
		if ( away && ! told.away ) transmit( { t: 'away' } );
		else if ( ! away && place && ( told.away || told.place !== placeKey ) ) transmit( { t: 'place', place } );
		told.away = away;
		told.place = placeKey;

	}

	function tick() {

		// Back on the globe for a minute: the area's room goes.
		if ( room && wanted() !== room ) sync();
		if ( isLive() && performance.now() - sentAt >= KEEPALIVE_MS ) transmit( PING );

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
			stateAt = - Infinity;
			flagsSent = - 1;
			players.clear();
			for ( const raw of Array.isArray( message.players ) ? message.players : [] ) {

				const p = playerOf( raw );
				if ( p ) players.set( p.pid, p );

			}

			setStatus();
			emit( 'welcome', { room, you, max, players: [ ...players.values() ] } );
			// Anything that changed while it connected.
			tell();
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
			players.set( joined.pid, joined );
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
			if ( ! where ) return;
			p.place = where;
			p.away = false;
			p.s = null;
			emit( 'place', { pid: p.pid, place: where } );

		} else if ( t === 'away' && p ) {

			p.away = true;
			p.s = null;
			emit( 'away', { pid: p.pid } );

		} else if ( t === 'S' && Array.isArray( message.s ) && Number.isFinite( message.at ) ) {

			const states = [];
			for ( const entry of message.s ) {

				const who = Array.isArray( entry ) ? players.get( entry[ 0 ] ) : null;
				const s = who ? checkState( entry.slice( 1, 12 ) ) : null;
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

	// A PLAYER as the room describes one, checked as the room checks what it's sent: its name is
	// only ever shown as text.
	function playerOf( raw ) {

		if ( ! raw || typeof raw !== 'object' || typeof raw.pid !== 'string' || raw.pid === you ) return null;
		return {
			pid: raw.pid,
			name: cleanName( raw.name ),
			star: raw.star === true,
			vehicle: checkVehicle( raw.vehicle ) ?? 'go-kart',
			look: checkLook( raw.look ) ?? {},
			place: checkPlace( raw.place ),
			away: raw.away === true,
			s: checkState( raw.s ),
		};

	}

	// --- the car ---

	// The car's STATE, Earth-centred: the pivot's position and turn taken out of the scene by the
	// earth's matrix as it is now (recentring moves it), and its velocity turned the same way.
	function stateOf( { pivot, velocity, flags } ) {

		earth.updateWorldMatrix( true, false );
		_inverse.copy( earth.matrixWorld ).invert();
		_earth.setFromRotationMatrix( earth.matrixWorld ).invert();
		pivot.updateWorldMatrix( true, false );
		_p.setFromMatrixPosition( pivot.matrixWorld ).applyMatrix4( _inverse );
		pivot.getWorldQuaternion( _q ).premultiply( _earth ).normalize();
		_v.copy( velocity ).applyQuaternion( _earth );
		if ( _v.length() > MAX_SPEED ) _v.setLength( MAX_SPEED );
		// Out of the protocol's bounds (flown far up): not sent.
		return checkState( packState( _p, _q, _v, flags ) );

	}

	// Driving out of the area the room is for: after SWITCH_MS in another, the room follows.
	function follow( now ) {

		if ( party || ! nearby || ! cell ) return;
		ellipsoid.getPositionToCartographic( _p, _carto );
		const here = cellOf( _carto.lat * MathUtils.RAD2DEG, _carto.lon * MathUtils.RAD2DEG );
		if ( here === cell ) {

			other = null;
			return;

		}

		if ( here !== other ) {

			other = here;
			otherSince = now;

		} else if ( now - otherSince >= SWITCH_MS ) {

			cell = here;
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

			if ( ended || ! car ) return;
			const s = stateOf( car );
			if ( ! s ) return;
			const now = performance.now();
			if ( now - followed >= FOLLOW_MS ) {

				followed = now;
				follow( now );

			}

			if ( ! isLive() ) return;
			const flags = s[ 10 ];
			_p.set( s[ 0 ], s[ 1 ], s[ 2 ] );
			_q.set( s[ 3 ], s[ 4 ], s[ 5 ], s[ 6 ] );
			const moving = Math.hypot( s[ 7 ], s[ 8 ], s[ 9 ] ) > STILL_SPEED || _p.distanceTo( _last ) > STILL || _q.angleTo( _lastQ ) > STILL;
			const gap = now - stateAt;
			const due = flags !== flagsSent ? gap >= FLAG_GAP : gap >= 1000 / ( moving ? SEND_HZ : STILL_HZ );
			if ( ! due || ! spend() ) return;
			transmit( { t: 's', s } );
			stateAt = now;
			flagsSent = flags;
			_last.copy( _p );
			_lastQ.copy( _q );

		},

		// The ride (its id) and look (paint.js's) now driven.
		setRide( vehicle, look ) {

			ride = { vehicle, look };
			tell();

		},

		// Dropped in at `where` ({ name, lat, lon, height }): there, and no longer on the globe. A new
		// area's room straight away (the minute back on the globe was for coming back near).
		setPlace( where ) {

			place = checkPlace( where );
			if ( ! place ) return;
			away = false;
			const here = cellOf( place.lat, place.lon );
			if ( here !== cell ) {

				cell = here;
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
		get ended() {

			return ended;

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

	};

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
	if ( d.flying ) flags |= FLAGS.flying;
	if ( ! d.grounded && ! d.flying ) flags |= FLAGS.air;
	if ( d.supersonic ) flags |= FLAGS.supersonic;
	if ( d.splash ) flags |= FLAGS.splash;
	if ( d.grounded && ! d.flying && ! d.air && ! d.splash ) flags |= FLAGS.grounded;
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
