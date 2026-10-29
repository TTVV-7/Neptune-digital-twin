// The "Ships" panel (berth status from live AIS) and the card for a clicked ship.
// AIS names and destinations are typed in by ships' crews, so they only ever go in as text.

import { SETTLE_SECONDS } from './vessels.js';

const $ = id => document.getElementById( id );

const NAV_STATUS = [ 'under way', 'at anchor', 'not under command', 'restricted manoeuvrability', 'constrained by draught', 'moored', 'aground', 'fishing', 'under way, sailing' ];
const STATE_TEXT = {
	loading: 'connecting...',
	connecting: 'connecting to AISStream...',
	'no-key': 'off: no AISStream key (see "Live ships" in the README)',
	unavailable: 'off: live ships need the dev server (npm run dev)',
};

export function createShipPanel( layer, { goTo } ) {

	const panel = $( 'ships' );
	const status = $( 'ships-status' );
	const berthList = $( 'berth-list' );
	const summary = $( 'ships-summary' );
	const card = $( 'vessel-card' );
	panel.hidden = false;

	let lastBerths = '';
	function render() {

		status.textContent = statusText( layer );
		status.classList.toggle( 'warn', layer.status.state !== 'live' );

		// Only rebuild the list when it changes, so a click on a ship name isn't lost.
		const berths = JSON.stringify( layer.berths.map( b => [ b.state, b.occupant?.data.mmsi, b.occupant?.data.name, b.occupant?.data.type, b.occupant?.data.stoppedSince, b.occupant?.stale && Math.floor( b.occupant.data.age / 300 ) ] ) );
		if ( berths !== lastBerths ) renderBerths();
		lastBerths = berths;

		const fresh = [ ...layer.vessels.values() ].filter( v => ! v.stale );
		const anchored = fresh.filter( v => v.data.navStatus === 1 ).length;
		const moving = fresh.filter( v => v.data.sog >= 0.5 ).length;
		summary.textContent = layer.status.state === 'live' || fresh.length
			? `${ fresh.length } vessels in the area: ${ moving } moving, ${ anchored } at anchor. V hides ships.`
			: '';

		renderCard();

	}

	function renderBerths() {

		berthList.replaceChildren( ...layer.berths.map( berth => {

			const row = document.createElement( 'tr' );
			const name = cell( berth.name );
			const what = document.createElement( 'td' );
			what.dataset.state = berth.state;
			const v = berth.occupant;
			if ( v ) {

				what.append( link( v.data.name || `MMSI ${ v.data.mmsi }`, () => select( v ) ) );
				const since = v.data.stoppedSince;
				what.append( ` ${ typeName( v.data.type ) }${ since ? `, here since ${ since === v.data.firstSeen ? 'at least ' : '' }${ clock( since ) }` : '' }` );
				if ( v.stale ) what.append( ` (last heard ${ ago( v.data.age ) })` );

			} else {

				what.textContent = { free: 'free', checking: 'checking...', unknown: 'unknown' }[ berth.state ] ?? '';

			}

			row.append( name, what );
			return row;

		} ) );

	}

	function select( v ) {

		layer.select( v.data.mmsi );
		goTo( v );

	}

	function renderCard() {

		const v = layer.selected && layer.vessels.get( layer.selected );
		card.hidden = ! v;
		if ( ! v ) return;

		const d = v.data;
		card.querySelector( 'h3' ).textContent = d.name || 'Name not received yet';
		const rows = [
			[ 'Type', typeName( d.type ) ],
			[ 'Status', d.navStatus !== undefined ? NAV_STATUS[ d.navStatus ] ?? 'not given' : ( d.class === 'B' ? 'small craft (class B)' : '' ) ],
			[ 'At', v.berth ? v.berth.name : '' ],
			[ 'Size', `${ Math.round( v.length ) } × ${ Math.round( v.beam ) } m${ v.sizeKnown ? '' : ' (not received yet, guessed)' }` ],
			[ 'Speed', d.sog === null ? 'not given' : `${ d.sog.toFixed( 1 ) } kn` ],
			[ 'Heading', `${ Math.round( v.heading ) }°${ d.heading === null ? ' (estimated)' : '' }` ],
			[ 'Destination', d.destination ?? '' ],
			[ 'ETA', d.eta ? eta( d.eta ) : '' ],
			[ 'Draught', d.draught ? `${ d.draught } m` : '' ],
			[ 'MMSI', d.mmsi ],
			[ 'IMO', d.imo ?? '' ],
			[ 'Call sign', d.callSign ?? '' ],
			[ 'Last position', ago( d.age + ( performance.now() - layer.receivedAt ) / 1000 ) ],
		];
		card.querySelector( 'table' ).replaceChildren( ...rows.filter( r => r[ 1 ] !== '' ).map( ( [ k, val ] ) => {

			const row = document.createElement( 'tr' );
			row.append( cell( k ), cell( String( val ) ) );
			return row;

		} ) );
		card.classList.toggle( 'stale', v.stale );

	}

	card.querySelector( '.close' ).addEventListener( 'click', () => layer.select( null ) );
	card.querySelector( '.goto' ).addEventListener( 'click', () => {

		const v = layer.vessels.get( layer.selected );
		if ( v ) goTo( v );

	} );

	window.addEventListener( 'keydown', e => {

		if ( e.code === 'KeyV' && ! e.repeat && ! ( e.target instanceof HTMLInputElement ) ) {

			layer.visible = ! layer.visible;
			panel.classList.toggle( 'collapsed', ! layer.visible );

		}

	} );

	layer.onUpdate = render;
	layer.onSelect = render;
	setInterval( render, 1000 ); // keeps the "x min ago" text current
	render();

}

function statusText( layer ) {

	const { state, message } = layer.status;
	if ( state === 'live' ) {

		if ( layer.quietFor > 120 ) return `live, but quiet: last message ${ ago( layer.quietFor ) }`;
		if ( ! layer.settled ) return `live: listening for ${ Math.floor( layer.listenedFor / 60 ) } min; berths show free after ${ SETTLE_SECONDS / 60 }`;
		return 'live AIS';

	}

	if ( state === 'error' ) return message;
	return STATE_TEXT[ state ] ?? state;

}

function typeName( t ) {

	if ( ! t ) return 'type not received';
	const named = { 30: 'fishing', 31: 'towing', 32: 'towing', 33: 'dredger', 34: 'diving', 35: 'military', 36: 'sailing', 37: 'pleasure craft', 50: 'pilot', 51: 'search and rescue', 52: 'tug', 53: 'port tender', 54: 'anti-pollution', 55: 'law enforcement', 58: 'medical' };
	if ( named[ t ] ) return named[ t ];
	if ( t >= 40 && t < 50 ) return 'high-speed craft';
	if ( t >= 60 && t < 70 ) return 'passenger';
	if ( t >= 70 && t < 80 ) return 'cargo';
	if ( t >= 80 && t < 90 ) return 'tanker';
	return 'other';

}

function cell( text ) {

	const td = document.createElement( 'td' );
	td.textContent = text;
	return td;

}

function link( text, onClick ) {

	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'link';
	button.textContent = text;
	button.addEventListener( 'click', onClick );
	return button;

}

function ago( seconds ) {

	if ( seconds < 90 ) return 'just now';
	if ( seconds < 90 * 60 ) return `${ Math.round( seconds / 60 ) } min ago`;
	return `${ ( seconds / 3600 ).toFixed( seconds < 36000 ? 1 : 0 ) } h ago`;

}

// Local time, with the day when it isn't today.
function clock( ms ) {

	const date = new Date( ms );
	const time = date.toLocaleTimeString( [], { hour: '2-digit', minute: '2-digit' } );
	const days = Math.round( ( new Date().setHours( 0, 0, 0, 0 ) - new Date( ms ).setHours( 0, 0, 0, 0 ) ) / 864e5 );
	if ( days === 0 ) return time;
	if ( days === 1 ) return `yesterday ${ time }`;
	return `${ date.toLocaleDateString( [], { month: 'short', day: 'numeric' } ) } ${ time }`;

}

// AIS ETAs are month, day, hour and minute in UTC, typed in by the crew.
function eta( { Month, Day, Hour, Minute } ) {

	const month = new Date( Date.UTC( 2000, Month - 1, 1 ) ).toLocaleDateString( [], { month: 'short', timeZone: 'UTC' } );
	const pad = n => String( n ).padStart( 2, '0' );
	return `${ month } ${ Day }${ Hour < 24 ? ` ${ pad( Hour ) }:${ pad( Minute < 60 ? Minute : 0 ) } UTC` : '' }`;

}
