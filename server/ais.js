// Live ship positions from AISStream (https://aisstream.io), for the dev server.
//
// AISStream doesn't accept connections from browsers and the key must stay private, so
// this runs in Node: it holds one connection, keeps the latest state of every vessel in
// the area, and the page polls a snapshot of it from /api/ais (see vite.config.js).
// The table is saved to .cache/ so a restart doesn't wait minutes for ships to report again.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import WebSocket from 'ws';

const DEFAULT_URL = 'wss://stream.aisstream.io/v0/stream';
const KEEP_HOURS = 48; // forget vessels not heard from for this long
const STOPPED_KNOTS = 0.5;
const SAVE_EVERY_MS = 60 * 1000;
const RETRY_DELAYS = [ 5, 15, 60, 300 ]; // seconds, after consecutive failures
const SHORT_GAP_MS = 5 * 60 * 1000; // a reconnect within this keeps counting as listening

export function createAisFeed( { apiKey, box, cacheFile, url = DEFAULT_URL, log = console.log } ) {

	const vessels = new Map(); // MMSI -> vessel
	// listeningSince: when the feed started receiving, kept across short reconnects. The page
	// only calls a berth free once it has been listening long enough to hear moored ships.
	const status = { state: apiKey ? 'connecting' : 'no-key', message: '', since: Date.now(), listeningSince: null, lastMessageAt: 0, messages: 0 };
	let downSince = 0;
	let socket = null;
	let retryTimer = null;
	let saveTimer = null;
	let failures = 0;
	let stopped = false;

	// Without a key nothing is live, so old ships aren't shown either.
	if ( apiKey ) load();

	function setStatus( state, message = '' ) {

		if ( state !== status.state || message !== status.message ) {

			Object.assign( status, { state, message, since: Date.now() } );
			if ( message ) log( `AIS: ${ message }` );

		}

	}

	function start() {

		if ( ! apiKey || stopped ) return;
		setStatus( 'connecting' );

		const ws = socket = new WebSocket( url, { perMessageDeflate: true } );
		let confirmed = false;
		let failure = null;

		ws.on( 'open', () => {

			// Must arrive within 3 seconds or AISStream drops the connection.
			ws.send( JSON.stringify( {
				APIKey: apiKey,
				BoundingBoxes: [ [ [ box.south, box.west ], [ box.north, box.east ] ] ],
				FilterMessageTypes: [ 'PositionReport', 'ShipStaticData', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'StaticDataReport' ],
			} ) );

		} );

		ws.on( 'message', data => {

			let msg;
			try {

				msg = JSON.parse( data.toString() );

			} catch {

				return;

			}

			if ( msg.error ) {

				setStatus( 'error', `AISStream: ${ msg.error }` );
				return;

			}

			if ( ! confirmed ) {

				confirmed = true;
				failures = 0;
				if ( ! status.listeningSince || Date.now() - downSince > SHORT_GAP_MS ) status.listeningSince = Date.now();
				setStatus( 'live', 'connected to AISStream' );

			}

			if ( msg.MessageType === 'SubscriptionConfirmation' ) return;

			status.lastMessageAt = Date.now();
			status.messages ++;
			handle( msg );

		} );

		ws.on( 'error', err => failure = err.message );

		ws.on( 'close', code => {

			if ( socket === ws ) socket = null;
			if ( stopped ) return;
			if ( confirmed ) downSince = Date.now();

			failures ++;
			const delay = RETRY_DELAYS[ Math.min( failures - 1, RETRY_DELAYS.length - 1 ) ];
			if ( failure ) {

				setStatus( 'error', `Could not reach AISStream (${ failure }). Retrying in ${ delay } s.` );

			} else if ( ! confirmed ) {

				// AISStream gives no reason; a wrong key is by far the most common cause.
				setStatus( 'error', `AISStream closed the connection before accepting it (code ${ code }). Check the API key. Retrying in ${ delay } s.` );

			} else if ( status.state !== 'error' ) {

				setStatus( 'connecting', `AISStream connection closed (code ${ code }). Reconnecting in ${ delay } s.` );

			}

			retryTimer = setTimeout( start, delay * 1000 );

		} );

	}

	function handle( msg ) {

		const body = msg.Message?.[ msg.MessageType ];
		const meta = msg.MetaData ?? {};
		const mmsi = String( meta.MMSI ?? body?.UserID ?? '' );
		if ( ! body || ! mmsi ) return;

		const now = Date.now();
		let v = vessels.get( mmsi );
		if ( ! v ) {

			v = { mmsi, firstSeen: now };
			vessels.set( mmsi, v );

		}

		const name = clean( meta.ShipName );
		if ( name && ! v.name ) v.name = name;

		switch ( msg.MessageType ) {

			case 'PositionReport':
				v.class = 'A';
				v.navStatus = body.NavigationalStatus;
				position( v, body, now );
				break;

			case 'StandardClassBPositionReport':
				v.class = 'B';
				position( v, body, now );
				break;

			case 'ExtendedClassBPositionReport':
				v.class = 'B';
				position( v, body, now );
				details( v, { name: body.Name, type: body.Type, dimension: body.Dimension }, now );
				break;

			case 'ShipStaticData':
				details( v, {
					name: body.Name,
					type: body.Type,
					dimension: body.Dimension,
					callSign: body.CallSign,
					imo: body.ImoNumber,
					destination: body.Destination,
					eta: body.Eta,
					draught: body.MaximumStaticDraught,
				}, now );
				break;

			case 'StaticDataReport':
				if ( body.ReportA?.Valid ) details( v, { name: body.ReportA.Name }, now );
				if ( body.ReportB?.Valid ) details( v, { type: body.ReportB.ShipType, dimension: body.ReportB.Dimension, callSign: body.ReportB.CallSign }, now );
				break;

		}

	}

	function position( v, body, now ) {

		const { Latitude: lat, Longitude: lon } = body;
		if ( ! ( Math.abs( lat ) <= 90 && Math.abs( lon ) <= 180 ) ) return; // 91 / 181 mean "not available"

		v.lat = lat;
		v.lon = lon;
		v.sog = body.Sog < 102.3 ? body.Sog : null; // knots; 102.3 = not available
		v.cog = body.Cog < 360 ? body.Cog : null;
		v.heading = body.TrueHeading < 360 ? body.TrueHeading : null; // 511 = not available
		v.lastPosition = now;

		// Remember since when it has been sitting still, for "moored since".
		if ( v.sog !== null && v.sog < STOPPED_KNOTS ) v.stoppedSince ??= now;
		else v.stoppedSince = null;

	}

	function details( v, d, now ) {

		const name = clean( d.name );
		if ( name ) v.name = name;
		if ( d.type ) v.type = d.type;
		if ( d.dimension && d.dimension.A + d.dimension.B > 0 ) {

			const { A, B, C, D } = d.dimension;
			v.dimension = { a: A, b: B, c: C, d: D };

		}

		if ( clean( d.callSign ) ) v.callSign = clean( d.callSign );
		if ( d.imo ) v.imo = d.imo;
		if ( d.destination !== undefined ) v.destination = clean( d.destination );
		if ( d.eta?.Month ) v.eta = d.eta;
		if ( d.draught ) v.draught = d.draught;
		v.lastStatic = now;

	}

	function snapshot() {

		const now = Date.now();
		const list = [];
		for ( const v of vessels.values() ) {

			if ( v.lastPosition === undefined ) continue;
			list.push( { ...v, age: ( now - v.lastPosition ) / 1000 } );

		}

		return { now, status: { ...status }, vessels: list };

	}

	function prune() {

		const cutoff = Date.now() - KEEP_HOURS * 3600 * 1000;
		for ( const [ mmsi, v ] of vessels ) {

			if ( ( v.lastPosition ?? v.firstSeen ) < cutoff ) vessels.delete( mmsi );

		}

	}

	function load() {

		if ( ! cacheFile ) return;
		try {

			for ( const v of JSON.parse( readFileSync( cacheFile, 'utf8' ) ) ) vessels.set( v.mmsi, v );
			prune();

		} catch {

			// No cache yet, or unreadable: start empty.

		}

	}

	function save() {

		if ( ! cacheFile ) return;
		prune();
		try {

			mkdirSync( dirname( cacheFile ), { recursive: true } );
			writeFileSync( cacheFile + '.tmp', JSON.stringify( [ ...vessels.values() ] ) );
			renameSync( cacheFile + '.tmp', cacheFile );

		} catch ( err ) {

			log( `AIS: could not save ${ cacheFile }: ${ err.message }` );

		}

	}

	if ( apiKey ) {

		start();
		saveTimer = setInterval( save, SAVE_EVERY_MS );

	}

	return {
		snapshot,
		stop() {

			stopped = true;
			clearTimeout( retryTimer );
			clearInterval( saveTimer );
			socket?.close();
			if ( apiKey ) save();

		},
		// For tests: feed a message as if it came from AISStream.
		handle,
	};

}

// AIS text fields are padded with spaces or '@'.
function clean( text ) {

	return typeof text === 'string' ? text.replace( /@+$/, '' ).trim() : '';

}
