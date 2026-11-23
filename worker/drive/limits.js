import { DurableObject } from 'cloudflare:workers';
import { isObject, sha256Hex } from '../http.js';
import { busiest, checkDot, EARTH, isLiveWorld, LIVE_WORLD_IDS, MOON_WORLD, parseRoom, ROOM_DOTS, worldOfRoom } from '../../src/drive-app/live-protocol.js';
import { WORLD_IDS } from '../../src/drive-app/worlds.js';

// One of these for everyone (named "global", see index.js): it counts the day's visits, in all and
// per visitor, the leaderboard's new names and scores per visitor, and what driving with others has
// spent of its budget (and each address's share of it) and which room each visit is in (liveOpen,
// liveSpent), where people are driving now for the globe (liveSpent, liveOnline), which drop-in
// places may be counted (places), and spaces out the searches sent on to OpenStreetMap.
// A Durable Object handles one call at a time, and each check-and-count below runs in one go with
// nothing in between, so two visits arriving together can't both take the last drive of the day.
// Counts are kept in its SQLite storage (on every plan, the free one too), so a restart doesn't
// hand out a fresh day. A day runs from midnight UTC; when a new one starts, the days before it are
// deleted.

const DAY = 24 * 60 * 60 * 1000;
// OpenStreetMap's Nominatim allows an application one request a second, from everyone together.
const SEARCH_GAP = 1000;
// A search waits at most this long (ms) for its turn; with a longer queue it's turned away.
const SEARCH_QUEUE = 3000;
// The drop-in places' HMAC key's label (placesKey), so it's a key of its own, not the visit tokens'.
const PLACES_LABEL = 'world-drive drop-in places v1';
// The most addresses a room's report may say what they spent (see liveSpent).
const ADDRESSES_MOST = 64;
// Driving with others' spend on each world is in a table of its own (liveTable): the Earth's in live
// and the Moon's in live_moon, as they always were, and the far worlds' in theirs.
const LIVE_TABLES = Object.freeze( { [ EARTH ]: 'live', [ MOON_WORLD ]: 'live_moon', mars: 'live_mars', vesta: 'live_vesta', ceres: 'live_ceres' } );
// The worlds a caller from before the far worlds had rooms knows (no `budgets`): only the Earth's and
// the Moon's are answered for it, as they always were.
const LEGACY_WORLDS = Object.freeze( [ EARTH, MOON_WORLD ] );
const encoder = new TextEncoder();

export class DriveLimits extends DurableObject {

	constructor( ctx, env ) {

		super( ctx, env );
		this.sql = ctx.storage.sql;
		// Visitors are a hash of their IP address with the day's salt: never the address itself.
		// The salt is made at random each day and deleted with it, so the hashes can't be traced back
		// to addresses, nor linked from one day to the next, once the day is over.
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS days ( day TEXT PRIMARY KEY, salt TEXT NOT NULL, visits INTEGER NOT NULL DEFAULT 0 )' );
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS visitors ( day TEXT NOT NULL, visitor TEXT NOT NULL, visits INTEGER NOT NULL, PRIMARY KEY ( day, visitor ) )' );
		// The leaderboard's turns (see take): how many of each kind each visitor has had today.
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS turns ( day TEXT NOT NULL, kind TEXT NOT NULL, visitor TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY ( day, kind, visitor ) )' );
		// Driving with others' spend each day, in billed Durable Object requests (worker/drive/live.js
		// counts them): a fraction, as incoming WebSocket messages are billed 20 to a request.
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS live ( day TEXT PRIMARY KEY, spent REAL NOT NULL )' );
		// And each other world's, apart (its rooms have a budget of their own: spending another's never
		// shuts them, see worker/drive/live.js), the same way: the Moon's, Mars's, Vesta's, Ceres's.
		for ( const world of LIVE_WORLD_IDS ) this.sql.exec( `CREATE TABLE IF NOT EXISTS ${ liveTable( world ) } ( day TEXT PRIMARY KEY, spent REAL NOT NULL )` );
		// The visits connecting to rooms today that weren't counted against the Earth's caps (the free
		// worlds', never limited: anyone can have as many of those as robot checks they pass), by the
		// address they connect from (see liveOpen): each only as a hash of the day's salt and it (the
		// address being already the challenges' keyed hash of its /48 and the day), so neither an
		// address nor a visit's id is kept, nor can be linked from one day to the next.
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS live_addresses ( day TEXT NOT NULL, address TEXT NOT NULL, visit TEXT NOT NULL, PRIMARY KEY ( day, address, visit ) ) WITHOUT ROWID' );
		// What each address's connections have spent themselves today on each world (billed requests,
		// as the rooms report them, see liveSpent), by the same salted hash of the address: each address
		// may spend only its share of a world's day (liveOpen, liveSpent).
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS live_address_spent ( day TEXT NOT NULL, address TEXT NOT NULL, world TEXT NOT NULL, spent REAL NOT NULL, PRIMARY KEY ( day, address, world ) ) WITHOUT ROWID' );
		// And each visit's connections to its rooms today (see liveOpen): the room it's in now, and how
		// many it has made. A visit's id is a random one of its own (visits.js), never its address.
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS live_visits ( day TEXT NOT NULL, visit TEXT NOT NULL, room TEXT NOT NULL, connects INTEGER NOT NULL, PRIMARY KEY ( day, visit ) )' );
		// Who's driving now, for the globe (/api/online): each area's room's dots (live-protocol.js) as
		// its latest report had them, and when (ms). One row a room, deleted as it reports none; a row
		// older than the asker's TTL is from a room that went without a word (a restart, say), left out
		// and deleted. Positions and counts only, never who.
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS live_online ( room TEXT PRIMARY KEY, dots TEXT NOT NULL, at INTEGER NOT NULL )' );
		// Drop-in places today (see places): which cells have been counted for each visitor and for
		// each visit (place_seen), and how many places have been counted today on each world
		// (place_totals), for each visitor (place_visitors) and for each visit, with how many times it
		// has asked (place_visits). A visitor (an address), a visit and a cell are only ever kept here
		// as an HMAC of the day's salt and them, keyed by a key that isn't in this storage (placesKey:
		// derived from the Worker's secret), so whoever has this storage alone can't test an address,
		// a visit's id or a cell against it, nor tell which visitor or visit a row is, nor which cell.
		// Without rowids, so the order rows went in doesn't pair a visit's row with its visitor's.
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS place_seen ( day TEXT NOT NULL, seen TEXT NOT NULL, PRIMARY KEY ( day, seen ) ) WITHOUT ROWID' );
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS place_totals ( day TEXT NOT NULL, world TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY ( day, world ) ) WITHOUT ROWID' );
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS place_visitors ( day TEXT NOT NULL, visitor TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY ( day, visitor ) ) WITHOUT ROWID' );
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS place_visits ( day TEXT NOT NULL, visit TEXT NOT NULL, count INTEGER NOT NULL, asks INTEGER NOT NULL, PRIMARY KEY ( day, visit ) ) WITHOUT ROWID' );
		// Tries with a password today that didn't get in (see passwordCheck): for each visitor (an
		// address, an IPv6 one by its /48), for each username and for each visitor and username together,
		// each as a hash of the day's salt and it, so neither an address nor a username is kept, nor can
		// be linked from one day to the next. last_at: when its latest try was (ms).
		this.sql.exec( 'CREATE TABLE IF NOT EXISTS password_fails ( day TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY ( day, key ) ) WITHOUT ROWID' );
		// The key for those HMACs, once it's made (placesKey).
		this.placeKey = null;
		// When the next search may go out (ms). Only in memory: if this object is put to sleep,
		// more than a second has gone by anyway.
		this.nextSearch = 0;

	}

	// Count a visit from `ip` at `now` (ms) unless today's visits have reached `daily` or this
	// visitor's have reached `perVisitor`. Answers { ok: true, left } with the visits this visitor
	// has left today, or { ok: false, reason: 'daily' or 'visitor', retryAfter } with the seconds
	// until the counts start again. `daily` null: a visit outside the day's cap for everyone (a
	// supporter's, who has paid for theirs), neither held by it nor counted towards it.
	async visit( ip, { now, daily, perVisitor } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const visitor = await sha256Hex( `${ salt }:${ ip }` );
		return this.ctx.storage.transactionSync( () => {

			const retryAfter = untilMidnight( now );
			const total = this.sql.exec( 'SELECT visits FROM days WHERE day = ?', day ).toArray()[ 0 ]?.visits ?? 0;
			if ( daily !== null && total >= daily ) return { ok: false, reason: 'daily', retryAfter };
			const mine = this.sql.exec( 'SELECT visits FROM visitors WHERE day = ? AND visitor = ?', day, visitor ).toArray()[ 0 ]?.visits ?? 0;
			if ( mine >= perVisitor ) return { ok: false, reason: 'visitor', retryAfter };

			// (An upsert, in case a call from just after midnight started the next day while this one hashed.)
			if ( daily !== null ) this.sql.exec( 'INSERT INTO days ( day, salt, visits ) VALUES ( ?, ?, 1 ) ON CONFLICT ( day ) DO UPDATE SET visits = visits + 1', day, salt );
			this.sql.exec( 'INSERT INTO visitors ( day, visitor, visits ) VALUES ( ?, ?, 1 ) ON CONFLICT ( day, visitor ) DO UPDATE SET visits = visits + 1', day, visitor );
			return { ok: true, left: perVisitor - mine - 1 };

		} );

	}

	// One of today's turns at `kind` ('name': a new player or a rename; 'score': a score posted) for
	// `ip` at `now` (ms), unless it has had `limit` of them: { ok: true }, or { ok: false, retryAfter }
	// with the seconds until midnight UTC. Visitors are hashed with the day's salt, as for visits.
	async take( kind, ip, { now, limit } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const visitor = await sha256Hex( `${ salt }:${ ip }` );
		return this.ctx.storage.transactionSync( () => {

			if ( turnsTaken( this.sql, day, kind, visitor ) >= limit ) return { ok: false, retryAfter: untilMidnight( now ) };
			this.sql.exec( 'INSERT INTO turns ( day, kind, visitor, count ) VALUES ( ?, ?, ?, 1 ) ON CONFLICT ( day, kind, visitor ) DO UPDATE SET count = count + 1', day, kind, visitor );
			return { ok: true };

		} );

	}

	// Whether a sign-in with a password (or anything else that proves one: a password change, linking
	// Google, taking the password off) for the username `user` (its key, logins.js) from `ip` (an
	// address, an IPv6 one by its /48) may be tried at `now` (ms): { ok: true }, with the try counted
	// already, or { ok: false, reason, retryAfter? } with nothing counted:
	// - 'address': this visitor has tried `hardFails` times today without getting in (whatever the
	//   usernames), so it tries no more until midnight UTC (retryAfter): a script on one address
	//   can't guess for long.
	// - 'robot': the username has had `freeFails` such tries today (from anywhere), or this visitor
	//   `addressFails`, and this try has no robot check passed (`robot`): from then on each try needs
	//   one (Turnstile), so a script can't guess from many addresses, nor long from one, while the
	//   owner, with a click, still signs in (one stranger on a shared address, a school's or a phone
	//   carrier's, doesn't keep everyone else there out for the day).
	// - 'wait': past those, a try within `gap` ms of this visitor's last try at this username,
	//   retryAfter the seconds left. That slows one address's guessing; it's keyed by the visitor
	//   and the username together, so tries from other addresses never make the owner wait, and
	//   nothing ever locks a username.
	// - 'turns': for a sign-in (`turn`, { kind, limit }: one of take's kinds, 'sign-in'), the visitor
	//   has had `limit` of today's turns at it already, so even the right password wouldn't sign in
	//   till midnight UTC (retryAfter): the Worker says so before any hashing, and remembers it.
	// The try is counted here, in the same go as the check (a Durable Object answers one call at a
	// time and nothing here waits between reading and writing), so requests sent all at once can't
	// all pass before any is counted; passwordSucceeded gives a try that got in back (and
	// passwordSignedIn, for a sign-in, takes its turn in the same go). Hashed with the day's salt, as
	// visits.
	async passwordCheck( ip, user, { now, robot = false, addressFails, hardFails, freeFails, gap, turn = null } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const [ visitor, name, pair ] = await passwordKeys( salt, ip, user );
		// The visitor as take counts its turns.
		const taker = turn ? await sha256Hex( `${ salt }:${ ip }` ) : null;
		return this.ctx.storage.transactionSync( () => {

			if ( turn && turnsTaken( this.sql, day, turn.kind, taker ) >= turn.limit ) return { ok: false, reason: 'turns', retryAfter: untilMidnight( now ) };
			const count = key => this.sql.exec( 'SELECT count, last_at FROM password_fails WHERE day = ? AND key = ?', day, key ).toArray()[ 0 ];
			const mine = count( visitor )?.count ?? 0;
			if ( mine >= hardFails ) return { ok: false, reason: 'address', retryAfter: untilMidnight( now ) };
			if ( mine >= addressFails || ( count( name )?.count ?? 0 ) >= freeFails ) {

				// visitor: whether it's this visitor's tries that ask for it (so every try from it will,
				// till midnight), not only this username's.
				if ( ! robot ) return { ok: false, reason: 'robot', visitor: mine >= addressFails };
				const wait = ( count( pair )?.last_at ?? - Infinity ) + gap - now;
				if ( wait > 0 ) return { ok: false, reason: 'wait', retryAfter: Math.max( 1, Math.ceil( wait / 1000 ) ) };

			}

			for ( const key of [ visitor, name, pair ] ) this.sql.exec( 'INSERT INTO password_fails ( day, key, count, last_at ) VALUES ( ?, ?, 1, ? ) ON CONFLICT ( day, key ) DO UPDATE SET count = count + 1, last_at = excluded.last_at', day, key, now );
			return { ok: true };

		} );

	}

	// A try passwordCheck counted that got in (the right password for `user` from `ip`, on the day of
	// `now`), given back: the owner signing in a few times a day never comes near the robot check.
	async passwordSucceeded( ip, user, { now } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const keys = await passwordKeys( salt, ip, user );
		this.ctx.storage.transactionSync( () => {

			for ( const key of keys ) this.sql.exec( 'UPDATE password_fails SET count = MAX( 0, count - 1 ) WHERE day = ? AND key = ?', day, key );

		} );

	}

	// passwordSucceeded and take together, in one call (one Durable Object request, not two), for a
	// sign-in that got in: the try given back, and one of the visitor's `limit` turns at `kind` taken,
	// as take answers ({ ok: true }, or { ok: false, retryAfter } when another sign-in took the last
	// since passwordCheck said there was one left).
	async passwordSignedIn( ip, user, { now, kind, limit } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const keys = await passwordKeys( salt, ip, user );
		const taker = await sha256Hex( `${ salt }:${ ip }` );
		return this.ctx.storage.transactionSync( () => {

			for ( const key of keys ) this.sql.exec( 'UPDATE password_fails SET count = MAX( 0, count - 1 ) WHERE day = ? AND key = ?', day, key );
			if ( turnsTaken( this.sql, day, kind, taker ) >= limit ) return { ok: false, retryAfter: untilMidnight( now ) };
			this.sql.exec( 'INSERT INTO turns ( day, kind, visitor, count ) VALUES ( ?, ?, ?, 1 ) ON CONFLICT ( day, kind, visitor ) DO UPDATE SET count = count + 1', day, kind, taker );
			return { ok: true };

		} );

	}

	// Which of `cells` (drop-in places, "<world>:<row>:<column>": worker/drive/dropins.js) a post from
	// `ip` (an address, an IPv6 one by its /48: dropins.js's VISITOR_PREFIX) for `visit` (its id, and
	// `since` when it began, ms) at `now` adds to today's counts, in
	// order: { cells, full, done }, full: { earth, moon, ... } whether each world's places today have
	// reached `daily`, and done whether this visit can add no more today (the Worker then asks no
	// more for it). A cell counts once a day for each visitor, whichever of their visits posts it, and
	// once for each visit, whichever address it posts from (one visit's token sent from many
	// addresses adds a cell once); and none is counted past `daily` on its world, `perVisitor` for the
	// visitor or `perVisit` for the visit, nor faster than one each `gap` ms of the visit (a drop-in
	// takes a while: a script posting a visit's worth at once is held to what it could have driven).
	// A visit is heard `asks` times a day at most (an honest page asks once a post that has new
	// places), so a script posting places it can't add gets nothing for it but done. Visitors, visits
	// and cells are kept only as HMACs (see the constructor).
	async places( ip, { now, visit, since, cells, daily, perVisitor, perVisit, gap, asks } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const key = await this.placesKey();
		const tag = text => hmacHex( key, `${ salt }:${ text }` );
		const [ visitor, visitTag, ...seen ] = await Promise.all( [
			tag( `visitor:${ ip }` ), tag( `visit:${ visit }` ),
			...cells.flatMap( cell => [ tag( `visitor:${ ip }:${ cell }` ), tag( `visit:${ visit }:${ cell }` ) ] ),
		] );
		return this.ctx.storage.transactionSync( () => {

			const one = ( sql, ...values ) => this.sql.exec( sql, ...values ).toArray()[ 0 ];
			const totals = Object.fromEntries( WORLD_IDS.map( world => [ world, one( 'SELECT count FROM place_totals WHERE day = ? AND world = ?', day, world )?.count ?? 0 ] ) );
			let mine = one( 'SELECT count FROM place_visitors WHERE day = ? AND visitor = ?', day, visitor )?.count ?? 0;
			const row = one( 'SELECT count, asks FROM place_visits WHERE day = ? AND visit = ?', day, visitTag );
			let theirs = row?.count ?? 0;
			const asked = Math.min( asks + 1, ( row?.asks ?? 0 ) + 1 );
			const paced = Math.min( perVisit, 1 + Math.floor( Math.max( 0, now - since ) / gap ) );
			const taken = [];
			if ( asked <= asks ) cells.forEach( ( cell, i ) => {

				const world = cell.slice( 0, cell.indexOf( ':' ) );
				if ( ! Object.hasOwn( totals, world ) || totals[ world ] >= daily || mine >= perVisitor || theirs >= paced ) return;
				const hashes = seen.slice( 2 * i, 2 * i + 2 );
				if ( hashes.some( hash => one( 'SELECT 1 AS seen FROM place_seen WHERE day = ? AND seen = ?', day, hash ) ) ) return;
				for ( const hash of hashes ) this.sql.exec( 'INSERT INTO place_seen ( day, seen ) VALUES ( ?, ? )', day, hash );
				totals[ world ] ++;
				mine ++;
				theirs ++;
				taken.push( cell );

			} );
			this.sql.exec( 'INSERT INTO place_visits ( day, visit, count, asks ) VALUES ( ?, ?, ?, ? ) ON CONFLICT ( day, visit ) DO UPDATE SET count = excluded.count, asks = excluded.asks', day, visitTag, theirs, asked );
			if ( taken.length ) {

				this.sql.exec( 'INSERT INTO place_visitors ( day, visitor, count ) VALUES ( ?, ?, ? ) ON CONFLICT ( day, visitor ) DO UPDATE SET count = excluded.count', day, visitor, mine );
				for ( const world of new Set( taken.map( cell => cell.slice( 0, cell.indexOf( ':' ) ) ) ) ) {

					this.sql.exec( 'INSERT INTO place_totals ( day, world, count ) VALUES ( ?, ?, ? ) ON CONFLICT ( day, world ) DO UPDATE SET count = excluded.count', day, world, totals[ world ] );

				}

			}

			return {
				cells: taken,
				full: Object.fromEntries( WORLD_IDS.map( world => [ world, totals[ world ] >= daily ] ) ),
				done: theirs >= perVisit || mine >= perVisitor || asked >= asks,
			};

		} );

	}

	// The key the drop-in places' HMACs are made with (see the constructor), derived (HKDF) from the
	// Worker's TURNSTILE_SECRET with a label of its own, so it's never in this object's storage and
	// can't be made without the secret. With no secret (nothing can post places without one), a
	// random key for as long as this object is in memory.
	async placesKey() {

		if ( this.placeKey ) return this.placeKey;
		const secret = typeof this.env?.TURNSTILE_SECRET === 'string' ? this.env.TURNSTILE_SECRET : '';
		this.placeKey = secret
			? await crypto.subtle.deriveKey(
				{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array( 0 ), info: encoder.encode( PLACES_LABEL ) },
				await crypto.subtle.importKey( 'raw', encoder.encode( secret ), 'HKDF', false, [ 'deriveKey' ] ),
				{ name: 'HMAC', hash: 'SHA-256', length: 256 },
				false,
				[ 'sign' ],
			)
			: await crypto.subtle.generateKey( { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, [ 'sign' ] );
		return this.placeKey;

	}

	// Driving with others, asked at `now` whether it's open today on each world: each while what it
	// has spent today (billed requests, in its own table, liveTable) is under its budget, `budgets`
	// ({ earth, moon, mars, vesta, ceres }). A caller from before the far worlds had rooms says only
	// the Earth's `budget` and the Moon's `moonBudget` (the Earth's when it doesn't say, as one from
	// before the Moon had rooms doesn't), and is answered only of those two, as it always was. The
	// Worker asks on each connection to a room and for /api/config; each ask is a Durable Object
	// request itself, so it counts as one.
	// /api/config's ask (no `visit`) answers { open, spent, moon: { open, spent }, worlds: { [ world ]:
	// { open, spent } } } (worlds only with `budgets`): counted against the Earth's while that's open,
	// else the Moon's while that is, else the Earth's again (with both spent it's only a count: never a
	// far world's small budget); the rest looked at, not counted.
	// A connection's ask (/api/live) is for a room on `world` (one of LIVE_WORLD_IDS: the room's, or
	// for a party the world its page is on), counted against that world's: { open, spent }. It also
	// says its `visit` and the `room` it's for, which is then the visit's room: { open, spent, seq, was }
	// with seq its number among the visit's connections today, and was the room it was in before if
	// that's another (the Worker has that room let go of it, so a visit is in one room at a time: a
	// request, counted here too), else null. Past `connects` connections today it's { open, spent,
	// refused: true }, and nothing is kept of it. A visit that wasn't counted against the Earth's caps
	// comes with the `address` it connects from (the challenges' lookKey: a keyed hash of its /48 and
	// the day): at most `addressVisits` such visits from one address connect today (it's { open,
	// spent, refused: true, reason: 'address' } for the next, with nothing kept), as at most the
	// Earth's 8 a day come from one: a script passing robot checks on one address can't open rooms
	// without end. And which other worlds' days are spent too (`closed`: [ world... ], else []), looked
	// at and not counted: a party's room lets nobody move onto a world that's closed (see DriveRoom's
	// closedTo), so a connection let in on one world's budget can't drive on a spent one.
	// Any visit but the owner's comes with its `address` and `share` (and `floor`): an address whose
	// connections have spent a world's budget over `share` (but never less than `floor`) today (see
	// liveSpent) is turned away on that world, { open, spent, refused: true, reason: 'share' },
	// whatever its visits. And for a party's room (`room` 'party:...'), which other worlds' shares it's
	// past too (`over`: [ world... ], left out if none), looked at and not counted: the room lets it
	// drive on its own world but not move onto those (DriveRoom's overTo), so being let in on one
	// world's share isn't a way onto another's once that's spent.
	async liveOpen( { now, budgets = null, budget, moonBudget = budget, world = EARTH, visit = null, room = null, connects = Infinity, address = null, addressVisits = null, share = null, floor = 0 } ) {

		if ( ! isLiveWorld( world ) ) throw new TypeError( `Not a world driving with others is on: ${ world }` );
		const day = dayOf( now );
		const salt = this.saltFor( day );
		const [ addressKey, visitKey ] = address !== null && visit !== null
			? await Promise.all( [ addressHash( salt, address ), sha256Hex( `${ salt }:live-visit:${ visit }` ) ] )
			: [ null, null ];
		const all = isObject( budgets );
		const worlds = all ? LIVE_WORLD_IDS : LEGACY_WORLDS;
		const own = budgetsFrom( budgets, budget, moonBudget );
		return this.ctx.storage.transactionSync( () => {

			if ( visit === null ) {

				const states = Object.fromEntries( worlds.map( w => [ w, peekLive( this.sql, day, own[ w ], w ) ] ) );
				const counted = states[ EARTH ].open ? EARTH : states[ MOON_WORLD ].open ? MOON_WORLD : EARTH;
				states[ counted ] = addLive( this.sql, day, 1, own[ counted ], counted );
				return { ...states[ EARTH ], moon: states[ MOON_WORLD ], ...( all ? { worlds: states } : {} ) };

			}

			const today = addLive( this.sql, day, 1, own[ world ], world );
			if ( ! today.open ) return today;
			const others = worlds.filter( w => w !== world );
			today.closed = others.filter( w => ! peekLive( this.sql, day, own[ w ], w ).open );
			const row = this.sql.exec( 'SELECT room, connects FROM live_visits WHERE day = ? AND visit = ?', day, visit ).toArray()[ 0 ];
			const seq = ( row?.connects ?? 0 ) + 1;
			if ( seq > connects ) return { ...today, refused: true };
			const past = w => addressKey && share > 0 && Number.isFinite( own[ w ] ) && addressSpent( this.sql, day, addressKey, w ) >= shareOf( own[ w ], share, floor );
			if ( past( world ) ) return { ...today, refused: true, reason: 'share' };
			const party = typeof room === 'string' && room.startsWith( 'party:' );
			const over = party ? others.filter( past ) : [];
			if ( over.length ) today.over = over;
			if ( addressKey && Number.isFinite( addressVisits ) ) {

				const known = this.sql.exec( 'SELECT 1 AS known FROM live_addresses WHERE day = ? AND address = ? AND visit = ?', day, addressKey, visitKey ).toArray()[ 0 ];
				if ( ! known ) {

					const count = this.sql.exec( 'SELECT COUNT( * ) AS count FROM live_addresses WHERE day = ? AND address = ?', day, addressKey ).one().count;
					if ( count >= addressVisits ) return { ...today, refused: true, reason: 'address' };
					this.sql.exec( 'INSERT INTO live_addresses ( day, address, visit ) VALUES ( ?, ?, ? )', day, addressKey, visitKey );

				}

			}

			this.sql.exec( 'INSERT INTO live_visits ( day, visit, room, connects ) VALUES ( ?, ?, ?, ? ) ON CONFLICT ( day, visit ) DO UPDATE SET room = excluded.room, connects = excluded.connects', day, visit, room, seq );
			if ( ! row || row.room === room ) return { ...today, seq, was: null };
			return { ...addLive( this.sql, day, 1, own[ world ], world ), closed: today.closed, ...( today.over ? { over: today.over } : {} ), seq, was: row.room };

		} );

	}

	// A room adding what it has spent since it last said (billed requests), at `now`: on each world
	// `amounts` ({ [ world ]: amount }) against `budgets` ({ [ world ]: budget }), or, from a room
	// from before the far worlds had rooms, `amount` on the Earth's `budget` and `moon` on the Moon's
	// `moonBudget` (a room from before the Moon had rooms says only amount, and no moonBudget: the
	// Earth's for both). { open, spent, moon: { open, spent }, worlds: { [ world ]: { open, spent } } }
	// with today's spends after it (open and spent the Earth's; worlds only with `budgets`). The
	// Earth's and the Moon's are added to every report, as they always were; a far world's only when
	// it has something to add (each is a row written, which the Free plan counts), and otherwise looked
	// at. A world not open, the room closes everyone in it on that world. An area's room says where its
	// drivers are too, `online`: { room, dots }, kept for the globe (liveOnline) with the time, or let
	// go of with no dots (and with its world's budget for the day spent, as the room is about to close
	// everyone).
	// It says too what each address's connections spent themselves, `addresses`: [ { from, earth,
	// moon, ... } ] with from the challenges' lookKey (kept only as a hash of the day's salt and it, as
	// in liveOpen), each added to that address's today; those whose spend on a world comes to its
	// budget over `share` (but never less than `floor`) or more are in the answer's over: { earth: [
	// from ], moon: [ from ], ... }, and the room closes their connections there (and liveOpen turns
	// them away for the rest of the day).
	async liveSpent( amount, { now, budget, moon = 0, moonBudget = null, amounts = null, budgets = null, online = null, addresses = null, share = null, floor = 0 } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const add = value => Number.isFinite( value ) && value > 0 ? value : 0;
		const spenders = Array.isArray( addresses ) && share > 0
			? addresses.slice( 0, ADDRESSES_MOST ).filter( a => isObject( a ) && typeof a.from === 'string' && a.from.length > 0 && a.from.length <= 128 )
			: [];
		const keys = await Promise.all( spenders.map( a => addressHash( salt, a.from ) ) );
		const all = isObject( budgets );
		const worlds = all ? LIVE_WORLD_IDS : LEGACY_WORLDS;
		// What's added on each world, and against what (as a room from before says it, when it does).
		const own = all ? budgetsFrom( budgets, budget, moonBudget ) : { [ EARTH ]: budget, [ MOON_WORLD ]: moonBudget ?? budget };
		const adding = all && isObject( amounts )
			? Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, add( amounts[ w ] ) ] ) )
			: { [ EARTH ]: add( amount ), [ MOON_WORLD ]: add( moon ) };
		return this.ctx.storage.transactionSync( () => {

			const states = {};
			states[ EARTH ] = addLive( this.sql, day, adding[ EARTH ], own[ EARTH ], EARTH );
			states[ MOON_WORLD ] = ! all && moonBudget === null ? states[ EARTH ] : addLive( this.sql, day, adding[ MOON_WORLD ], own[ MOON_WORLD ], MOON_WORLD );
			for ( const w of worlds ) {

				if ( w === EARTH || w === MOON_WORLD ) continue;
				states[ w ] = adding[ w ] > 0 ? addLive( this.sql, day, adding[ w ], own[ w ], w ) : peekLive( this.sql, day, own[ w ], w );

			}

			const said = w => ( { open: states[ w ].open, spent: states[ w ].spent } );
			const today = { ...states[ EARTH ], moon: said( MOON_WORLD ), ...( all ? { worlds: Object.fromEntries( worlds.map( w => [ w, said( w ) ] ) ) } : {} ) };
			if ( spenders.length ) {

				const over = Object.fromEntries( worlds.map( w => [ w, [] ] ) );
				spenders.forEach( ( a, i ) => {

					for ( const w of worlds ) {

						const spent = add( a[ w ] );
						if ( ! spent || ! Number.isFinite( own[ w ] ) ) continue;
						this.sql.exec( 'INSERT INTO live_address_spent ( day, address, world, spent ) VALUES ( ?, ?, ?, ? ) ON CONFLICT ( day, address, world ) DO UPDATE SET spent = spent + excluded.spent', day, keys[ i ], w, spent );
						if ( addressSpent( this.sql, day, keys[ i ], w ) >= shareOf( own[ w ], share, floor ) ) over[ w ].push( a.from );

					}

				} );
				if ( worlds.some( w => over[ w ].length ) ) today.over = over;

			}

			const room = typeof online?.room === 'string' ? parseRoom( online.room ) : null;
			if ( room?.kind !== 'near' ) return today;
			// (A room on a world the caller says nothing of: not kept, no budget bounding it.)
			const open = states[ room.world ]?.open === true;
			const dots = ( Array.isArray( online.dots ) ? online.dots.slice( 0, ROOM_DOTS ) : [] ).map( checkDot ).filter( Boolean );
			if ( open && dots.length ) this.sql.exec( 'INSERT INTO live_online ( room, dots, at ) VALUES ( ?, ?, ? ) ON CONFLICT ( room ) DO UPDATE SET dots = excluded.dots, at = excluded.at', online.room, JSON.stringify( dots ), now );
			else this.sql.exec( 'DELETE FROM live_online WHERE room = ?', online.room );
			return today;

		} );

	}

	// Where people are driving now on `world` (one of LIVE_WORLD_IDS), for /api/online at `now`: its
	// rooms' dots no older than `ttl` (ms), those at the same spot as one, busiest first, at most
	// `most` of them: { open: true, total, areas, elsewhere, worlds }, total counting them all,
	// elsewhere how many are driving on the other of the Earth and the Moon (for an ask for either;
	// none for a far world's: a page from before Mars had drivers counts no far world's), and worlds,
	// with `budgets`, every world's { on, total }: on whether it's open today, total how many are
	// driving there (0 when it isn't). This ask is a Durable Object request, so it's counted against a
	// day's budget, as liveOpen's are, in the same go: an ask for the Earth's against the Earth's, for
	// the Moon's against the Moon's, and for a far world's against the Earth's while that's open, else
	// the Moon's while that is, else the world's own (watching a far world's globe never spends its
	// small budget while either is open). Once the asked world's day is spent it's { open: false }
	// and nothing more. (A caller from before the far worlds had rooms says only `budget` and
	// `moonBudget`, and is answered as it always was, with no worlds.)
	liveOnline( { now, budgets = null, budget, moonBudget = budget, world = EARTH, ttl, most } ) {

		if ( ! isLiveWorld( world ) ) throw new TypeError( `Not a world driving with others is on: ${ world }` );
		const day = dayOf( now );
		this.saltFor( day );
		const all = isObject( budgets );
		const worlds = all ? LIVE_WORLD_IDS : LEGACY_WORLDS;
		const own = budgetsFrom( budgets, budget, moonBudget );
		return this.ctx.storage.transactionSync( () => {

			const states = Object.fromEntries( worlds.map( w => [ w, peekLive( this.sql, day, own[ w ], w ) ] ) );
			const counted = world === EARTH || world === MOON_WORLD ? world : states[ EARTH ]?.open ? EARTH : states[ MOON_WORLD ]?.open ? MOON_WORLD : world;
			states[ counted ] = addLive( this.sql, day, 1, own[ counted ], counted );
			if ( ! states[ world ]?.open ) return { open: false };
			const rows = this.sql.exec( 'SELECT room, dots, at FROM live_online' ).toArray();
			const stale = now - ttl;
			if ( rows.some( row => row.at < stale ) ) this.sql.exec( 'DELETE FROM live_online WHERE at < ?', stale );
			const areas = new Map();
			const totals = Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, 0 ] ) );
			for ( const row of rows ) {

				if ( row.at < stale ) continue;
				const on = worldOfRoom( row.room );
				if ( ! on ) continue;
				for ( const dot of JSON.parse( row.dots ) ) {

					totals[ on ] += dot.count;
					if ( on !== world ) continue;
					const key = `${ dot.lat },${ dot.lon }`;
					const area = areas.get( key );
					if ( area ) area.count += dot.count;
					else areas.set( key, { ...dot } );

				}

			}

			const partner = world === EARTH ? MOON_WORLD : world === MOON_WORLD ? EARTH : null;
			return {
				open: true, total: totals[ world ], areas: [ ...areas.values() ].sort( busiest ).slice( 0, most ), elsewhere: partner ? totals[ partner ] : 0,
				...( all ? { worlds: Object.fromEntries( LIVE_WORLD_IDS.map( w => [ w, { on: states[ w ].open, total: states[ w ].open ? totals[ w ] : 0 } ] ) ) } : {} ),
			};

		} );

	}

	// When a search may go on to OpenStreetMap: { wait } in ms (0 for straight away), with that
	// turn now taken, or { busy: true, retryAfter } in seconds when the queue is already full.
	searchSlot() {

		const now = Date.now();
		const at = Math.max( now, this.nextSearch );
		if ( at - now > SEARCH_QUEUE ) return { busy: true, retryAfter: Math.ceil( ( at - now ) / 1000 ) };
		this.nextSearch = at + SEARCH_GAP;
		return { wait: at - now };

	}

	// Today's salt, starting the day (and forgetting the days before it) if it's new.
	saltFor( day ) {

		const row = this.sql.exec( 'SELECT salt FROM days WHERE day = ?', day ).toArray()[ 0 ];
		if ( row ) return row.salt;
		const salt = [ ...crypto.getRandomValues( new Uint8Array( 16 ) ) ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
		this.ctx.storage.transactionSync( () => {

			this.sql.exec( 'DELETE FROM visitors WHERE day < ?', day );
			this.sql.exec( 'DELETE FROM turns WHERE day < ?', day );
			for ( const table of [ ...LIVE_WORLD_IDS.map( liveTable ), 'live_visits', 'live_addresses', 'live_address_spent' ] ) this.sql.exec( `DELETE FROM ${ table } WHERE day < ?`, day );
			for ( const table of [ 'place_seen', 'place_totals', 'place_visitors', 'place_visits', 'password_fails' ] ) this.sql.exec( `DELETE FROM ${ table } WHERE day < ?`, day );
			this.sql.exec( 'DELETE FROM days WHERE day < ?', day );
			this.sql.exec( 'INSERT OR IGNORE INTO days ( day, salt ) VALUES ( ?, ? )', day, salt );

		} );
		return this.sql.exec( 'SELECT salt FROM days WHERE day = ?', day ).one().salt;

	}

}

// The table driving with others' spend on `world` is kept in (LIVE_TABLES); a world that isn't one
// of LIVE_WORLD_IDS throws, never taken for the Earth.
export function liveTable( world ) {

	if ( ! isLiveWorld( world ) ) throw new TypeError( `Not a world driving with others is on: ${ world }` );
	return LIVE_TABLES[ world ];

}

// `amount` (billed requests) added to driving with others' spend on `day` on `world` (its table,
// liveTable): { open, spent } with the day's spend there after it, open while that's under `budget`
// (never with no budget: null, a world the caller doesn't know of).
export function addLive( sql, day, amount, budget, world ) {

	const table = liveTable( world );
	sql.exec( `INSERT INTO ${ table } ( day, spent ) VALUES ( ?, ? ) ON CONFLICT ( day ) DO UPDATE SET spent = spent + excluded.spent`, day, amount );
	const spent = sql.exec( `SELECT spent FROM ${ table } WHERE day = ?`, day ).one().spent;
	return { open: Number.isFinite( budget ) && spent < budget, spent };

}

// An address (the challenges' lookKey) as DriveLimits keeps it for driving with others: a hash of
// the day's `salt` and it.
function addressHash( salt, address ) {

	return sha256Hex( `${ salt }:live-address:${ address }` );

}

// What the address kept as `key` (addressHash) has spent itself today (`day`) on `world`.
function addressSpent( sql, day, key, world ) {

	return sql.exec( 'SELECT spent FROM live_address_spent WHERE day = ? AND address = ? AND world = ?', day, key, world ).toArray()[ 0 ]?.spent ?? 0;

}

// What addLive would answer, adding nothing and writing nothing.
export function peekLive( sql, day, budget, world ) {

	const spent = sql.exec( `SELECT spent FROM ${ liveTable( world ) } WHERE day = ?`, day ).toArray()[ 0 ]?.spent ?? 0;
	return { open: Number.isFinite( budget ) && spent < budget, spent };

}

// Each world's budget for a call: `budgets` ({ [ world ]: n }) where it says, the Earth's `budget` and
// the Moon's `moonBudget` where it doesn't (as a caller from before the far worlds had rooms says
// them), and null (none: never open) for a world it says nothing of.
function budgetsFrom( budgets, budget, moonBudget ) {

	const said = isObject( budgets ) ? budgets : {};
	const legacy = { [ EARTH ]: budget, [ MOON_WORLD ]: moonBudget };
	return Object.fromEntries( LIVE_WORLD_IDS.map( w => {

		const value = Number.isFinite( said[ w ] ) ? said[ w ] : legacy[ w ];
		return [ w, Number.isFinite( value ) ? value : null ];

	} ) );

}

// What one address may spend on a world whose budget is `budget` in a day: that over `share`, but
// never less than `floor` (0 for none).
function shareOf( budget, share, floor ) {

	return Math.max( budget / share, Number.isFinite( floor ) && floor > 0 ? floor : 0 );

}

// The turns at `kind` the visitor (as take hashes it) has had on `day`.
function turnsTaken( sql, day, kind, visitor ) {

	return sql.exec( 'SELECT count FROM turns WHERE day = ? AND kind = ? AND visitor = ?', day, kind, visitor ).toArray()[ 0 ]?.count ?? 0;

}

// The keys passwordCheck counts a try under, hashed with the day's `salt`: the visitor (`ip`), the
// username (`user`) and the two together.
function passwordKeys( salt, ip, user ) {

	return Promise.all( [ sha256Hex( `${ salt }:password:${ ip }` ), sha256Hex( `${ salt }:username:${ user }` ), sha256Hex( `${ salt }:pair:${ ip }:${ user }` ) ] );

}

// The HMAC-SHA256 of `text` with `key`, in hex.
async function hmacHex( key, text ) {

	const signature = await crypto.subtle.sign( 'HMAC', key, encoder.encode( text ) );
	return [ ...new Uint8Array( signature ) ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

// Seconds (at least 1) from `now` to midnight UTC, when the counts start again.
function untilMidnight( now ) {

	return Math.max( 1, Math.ceil( ( ( Math.floor( now / DAY ) + 1 ) * DAY - now ) / 1000 ) );

}

// The UTC date, e.g. 2026-10-30.
export function dayOf( time ) {

	return new Date( time ).toISOString().slice( 0, 10 );

}
