// The AISStream feed without the connection itself: the subscription, what each message
// means for the table of vessels, the connection status the page shows, and snapshots.
// Shared by the dev server (server/ais.js, Node) and the hosted site's Worker
// (cloudflare/worker.js), which each hold the WebSocket their own way.

export const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const KEEP_HOURS = 48; // forget vessels not heard from for this long
const STOPPED_KNOTS = 0.5;
const RETRY_DELAYS = [ 5, 15, 60, 300 ]; // seconds, after consecutive failures
const SHORT_GAP_MS = 5 * 60 * 1000; // a reconnect within this keeps counting as listening

export class AisFeed {

	constructor( { apiKey, box, log = () => {} } ) {

		this.apiKey = apiKey;
		this.box = box;
		this.log = log;
		this.vessels = new Map(); // MMSI -> vessel
		// listeningSince: when the feed started receiving, kept across short reconnects. The page
		// only calls a berth free once it has been listening long enough to hear moored ships.
		this.status = { state: apiKey ? 'connecting' : 'no-key', message: '', since: Date.now(), listeningSince: null, lastMessageAt: 0, messages: 0 };
		this.confirmed = false;
		this.failures = 0;
		this.downSince = 0;

	}

	setStatus( state, message = '' ) {

		const { status } = this;
		if ( state === status.state && message === status.message ) return;
		Object.assign( status, { state, message, since: Date.now() } );
		if ( message ) this.log( `AIS: ${ message }` );

	}

	// --- connection lifecycle, called by the transport ---

	connecting() {

		this.confirmed = false;
		this.setStatus( 'connecting' );

	}

	// The message to send once the socket is open. It must arrive within 3 seconds or
	// AISStream drops the connection.
	subscription() {

		const { south, west, north, east } = this.box;
		return JSON.stringify( {
			APIKey: this.apiKey,
			BoundingBoxes: [ [ [ south, west ], [ north, east ] ] ],
			FilterMessageTypes: [ 'PositionReport', 'ShipStaticData', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'StaticDataReport' ],
		} );

	}

	received( text ) {

		let msg;
		try {

			msg = JSON.parse( text );

		} catch {

			return;

		}

		if ( msg.error ) {

			this.setStatus( 'error', `AISStream: ${ msg.error }` );
			return;

		}

		if ( ! this.confirmed ) {

			this.confirmed = true;
			this.failures = 0;
			const { status } = this;
			if ( ! status.listeningSince || Date.now() - this.downSince > SHORT_GAP_MS ) status.listeningSince = Date.now();
			this.setStatus( 'live', 'connected to AISStream' );

		}

		if ( msg.MessageType === 'SubscriptionConfirmation' ) return;

		this.status.lastMessageAt = Date.now();
		this.status.messages ++;
		this.handle( msg );

	}

	// Returns how many seconds to wait before reconnecting. `failure` is a network error, if any.
	closed( code, failure ) {

		if ( this.confirmed ) this.downSince = Date.now();
		this.failures ++;
		const delay = RETRY_DELAYS[ Math.min( this.failures - 1, RETRY_DELAYS.length - 1 ) ];

		if ( failure ) {

			this.setStatus( 'error', `Could not reach AISStream (${ failure }). Retrying in ${ delay } s.` );

		} else if ( ! this.confirmed ) {

			// AISStream gives no reason; a wrong key is by far the most common cause.
			this.setStatus( 'error', `AISStream closed the connection before accepting it (code ${ code }). Check the API key. Retrying in ${ delay } s.` );

		} else if ( this.status.state !== 'error' ) {

			this.setStatus( 'connecting', `AISStream connection closed (code ${ code }). Reconnecting in ${ delay } s.` );

		}

		this.confirmed = false;
		return delay;

	}

	// --- the table of vessels ---

	handle( msg ) {

		const body = msg.Message?.[ msg.MessageType ];
		const meta = msg.MetaData ?? {};
		const mmsi = String( meta.MMSI ?? body?.UserID ?? '' );
		if ( ! body || ! mmsi ) return;

		const now = Date.now();
		let v = this.vessels.get( mmsi );
		if ( ! v ) {

			v = { mmsi, firstSeen: now };
			this.vessels.set( mmsi, v );

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

	snapshot() {

		const now = Date.now();
		const vessels = [];
		for ( const v of this.vessels.values() ) {

			if ( v.lastPosition !== undefined ) vessels.push( { ...v, age: ( now - v.lastPosition ) / 1000 } );

		}

		return { now, status: { ...this.status }, vessels };

	}

	// For saving and loading the table between restarts.
	list() {

		this.prune();
		return [ ...this.vessels.values() ];

	}

	load( list ) {

		for ( const v of list ?? [] ) this.vessels.set( v.mmsi, v );
		this.prune();

	}

	prune() {

		const cutoff = Date.now() - KEEP_HOURS * 3600 * 1000;
		for ( const [ mmsi, v ] of this.vessels ) {

			if ( ( v.lastPosition ?? v.firstSeen ) < cutoff ) this.vessels.delete( mmsi );

		}

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

// AIS text fields are padded with spaces or '@'.
function clean( text ) {

	return typeof text === 'string' ? text.replace( /@+$/, '' ).trim() : '';

}
