import { DurableObject } from 'cloudflare:workers';
import { sha256Hex } from '../http.js';

// One of these for everyone (named "global", see index.js): it counts the day's visits, in all and
// per visitor, and the leaderboard's new names and scores per visitor, and spaces out the searches
// sent on to OpenStreetMap. A Durable Object handles one call at a time, and each check-and-count
// below runs in one go with nothing in between, so two visits arriving together can't both take
// the last drive of the day. Counts are kept in its SQLite storage (on every plan, the free one
// too), so a restart doesn't hand out a fresh day. A day runs from midnight UTC; when a new one
// starts, the days before it are deleted.

const DAY = 24 * 60 * 60 * 1000;
// OpenStreetMap's Nominatim allows an application one request a second, from everyone together.
const SEARCH_GAP = 1000;
// A search waits at most this long (ms) for its turn; with a longer queue it's turned away.
const SEARCH_QUEUE = 3000;

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
		// When the next search may go out (ms). Only in memory: if this object is put to sleep,
		// more than a second has gone by anyway.
		this.nextSearch = 0;

	}

	// Count a visit from `ip` at `now` (ms) unless today's visits have reached `daily` or this
	// visitor's have reached `perVisitor`. Answers { ok: true, left } with the visits this visitor
	// has left today, or { ok: false, reason: 'daily' or 'visitor', retryAfter } with the seconds
	// until the counts start again.
	async visit( ip, { now, daily, perVisitor } ) {

		const day = dayOf( now );
		const salt = this.saltFor( day );
		const visitor = await sha256Hex( `${ salt }:${ ip }` );
		return this.ctx.storage.transactionSync( () => {

			const retryAfter = untilMidnight( now );
			const total = this.sql.exec( 'SELECT visits FROM days WHERE day = ?', day ).toArray()[ 0 ]?.visits ?? 0;
			if ( total >= daily ) return { ok: false, reason: 'daily', retryAfter };
			const mine = this.sql.exec( 'SELECT visits FROM visitors WHERE day = ? AND visitor = ?', day, visitor ).toArray()[ 0 ]?.visits ?? 0;
			if ( mine >= perVisitor ) return { ok: false, reason: 'visitor', retryAfter };

			// (An upsert, in case a call from just after midnight started the next day while this one hashed.)
			this.sql.exec( 'INSERT INTO days ( day, salt, visits ) VALUES ( ?, ?, 1 ) ON CONFLICT ( day ) DO UPDATE SET visits = visits + 1', day, salt );
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

			const count = this.sql.exec( 'SELECT count FROM turns WHERE day = ? AND kind = ? AND visitor = ?', day, kind, visitor ).toArray()[ 0 ]?.count ?? 0;
			if ( count >= limit ) return { ok: false, retryAfter: untilMidnight( now ) };
			this.sql.exec( 'INSERT INTO turns ( day, kind, visitor, count ) VALUES ( ?, ?, ?, 1 ) ON CONFLICT ( day, kind, visitor ) DO UPDATE SET count = count + 1', day, kind, visitor );
			return { ok: true };

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
			this.sql.exec( 'DELETE FROM days WHERE day < ?', day );
			this.sql.exec( 'INSERT OR IGNORE INTO days ( day, salt ) VALUES ( ?, ? )', day, salt );

		} );
		return this.sql.exec( 'SELECT salt FROM days WHERE day = ?', day ).one().salt;

	}

}

// Seconds (at least 1) from `now` to midnight UTC, when the counts start again.
function untilMidnight( now ) {

	return Math.max( 1, Math.ceil( ( ( Math.floor( now / DAY ) + 1 ) * DAY - now ) / 1000 ) );

}

// The UTC date, e.g. 2026-10-30.
function dayOf( time ) {

	return new Date( time ).toISOString().slice( 0, 10 );

}
