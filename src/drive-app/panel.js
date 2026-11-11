import { searchPlaces } from './api.js';
import { formatLatLon, parseLatLon, recentPlaces, SPOTS, storage } from './places.js';
import { MOON, MOON_SPOTS, searchMoon } from './moon-places.js';
import { openPass, proBadge } from './pass.js';
import { onProChange } from './pro.js';
import { getLevel, onLevelChange } from './progress.js';
import { rideLocked, rideUnlock, unlockChip } from './vehicles.js';
import { drivers } from './online.js';

// The globe's panel: the Earth or the Moon, search, the starting spots, recent places, the vehicle
// picker and who's driving now (online.js), and the card under the pin with "Drive here". Choosing
// a spot, a search result or an area where people are driving flies the globe there and pins it; a
// tap on the globe pins the spot tapped. On the Moon (main.js, moon.js) the search, spots and recent
// places are the Moon's (moon-places.js), and who's driving now isn't shown.

const VEHICLE_KEY = 'world-drive.vehicle';
// The ride picked until one is chosen (and while the one chosen is locked): the pickup, or where
// the site hasn't got it (its model is the library's, vehicles.js), the first ride, the kart.
const DEFAULT_RIDE = 'pickup-truck';

// What the panel says on each world: its tagline and the search's hint.
const WORDS = {
	earth: { tagline: 'Pick anywhere on Earth. Drop in. Drive.', placeholder: 'A place, an address, or lat, lon', label: 'Search for a place', none: 'Try a city, a landmark or an address.' },
	moon: { tagline: 'Pick anywhere on the Moon. Drop in. Drive.', placeholder: 'A crater, a sea, or lat, lon', label: 'Search the Moon', none: 'Try a crater, a sea or a landing site (Tycho, Apollo 11), or lat, lon.' },
};

// root: #globe-ui. vehicles: from loadVehicles(). flyTo( place ): fly the globe there and pin it.
// onDrive( place ): drop in at the pin. onWorld( world ): the Earth or the Moon picked ('earth' or
// 'moon'); main.js turns the globe and calls setWorld once it's there. onSearch( kind ): a search
// made, for the play stats: 'earth' (the map asked), 'moon' (the Moon's places), 'coordinates'
// (typed), and 'nothing' as well for one that found nothing; never what was typed.
export function setUpPanel( { root, vehicles, flyTo, onDrive, onClearPin, onWorld = () => {}, onSearch = () => {} } ) {

	const $ = selector => root.querySelector( selector );
	const form = $( '.search' );
	const input = form.elements.q;
	const status = $( '.search-status' );
	const results = $( '.results' );
	const card = $( '.pin-card' );
	let pinned = null;
	let searching = 0;
	let world = 'earth';
	// The other world while it's loading (main.js's setWorld), so a click on this one stays here.
	let busy = null;

	// --- the Earth or the Moon ---

	const worlds = [ ...root.querySelectorAll( '.worlds button' ) ];
	for ( const button of worlds ) button.addEventListener( 'click', () => ( button.dataset.world !== world || busy ) && onWorld( button.dataset.world ) );

	// The panel for `which` world: its switch, words, spots and recent places. While `busy` (the
	// Moon loading), its button says so.
	function setWorld( which, { busy: loading = null } = {} ) {

		busy = loading;
		for ( const button of worlds ) {

			button.setAttribute( 'aria-checked', String( button.dataset.world === which ) );
			if ( button.dataset.world === busy ) button.setAttribute( 'aria-busy', 'true' );
			else button.removeAttribute( 'aria-busy' );

		}

		if ( busy || which === world ) return;
		world = which;
		// (A search of the other world's still on its way is no use here.)
		searching ++;
		document.body.dataset.world = world;
		const words = WORDS[ world ];
		$( '.tagline' ).textContent = words.tagline;
		input.placeholder = words.placeholder;
		input.setAttribute( 'aria-label', words.label );
		input.value = '';
		showResults( [] );
		say( '' );
		showSpots();
		refreshRecent();

	}

	// --- search: only on Enter (or Go), never as you type, as OpenStreetMap asks ---

	form.addEventListener( 'submit', async e => {

		e.preventDefault();
		const text = input.value.trim();
		if ( ! text ) return;
		input.blur();
		const typed = parseLatLon( text );
		if ( typed ) {

			onSearch( 'coordinates' );
			showResults( [] );
			say( '' );
			flyTo( world === MOON
				? { name: formatLatLon( typed.lat, typed.lon ), region: 'Moon coordinates', ...typed, world: MOON }
				: { name: formatLatLon( typed.lat, typed.lon ), region: 'Coordinates', ...typed } );
			return;

		}

		// The Moon's places are all here (moon-places.js): no asking anyone.
		if ( world === MOON ) {

			searching ++;
			const found = searchMoon( text );
			onSearch( MOON );
			if ( ! found.length ) onSearch( 'nothing' );
			say( found.length ? '' : `Nothing found for "${ text }". ${ WORDS.moon.none }` );
			results.replaceChildren( ...found.map( place => item( place.name, place.region, () => {

				showResults( [] );
				flyTo( place );

			} ) ) );
			results.hidden = found.length === 0;
			return;

		}

		const ask = ++ searching;
		say( 'Searching...' );
		showResults( [] );
		onSearch( 'earth' );
		try {

			const found = await searchPlaces( text );
			if ( ask !== searching ) return;
			if ( ! found.length ) onSearch( 'nothing' );
			say( found.length ? '' : `Nothing found for "${ text }". ${ WORDS.earth.none }` );
			showResults( found );

		} catch ( err ) {

			if ( ask === searching ) say( err.message );

		}

	} );

	function say( text ) {

		status.textContent = text;
		status.hidden = ! text;

	}

	function showResults( found ) {

		results.replaceChildren( ...found.map( result => {

			const [ name, ...rest ] = result.name.split( ', ' );
			return item( name, rest.slice( 0, 3 ).join( ', ' ) || result.type, () => {

				showResults( [] );
				// A bridge: start on its deck (see spawn.js).
				flyTo( { name, region: rest.slice( 0, 2 ).join( ', ' ), lat: result.lat, lon: result.lon, deck: result.type === 'bridge' } );

			} );

		} ) );
		results.hidden = found.length === 0;

	}

	// --- spots and recent places, the world's ---

	function showSpots() {

		$( '.spots' ).replaceChildren( ...( world === MOON ? MOON_SPOTS : SPOTS ).map( spot => item( spot.name, spot.region, () => flyTo( spot ) ) ) );

	}

	function refreshRecent() {

		const recent = recentPlaces( world );
		$( '.recent' ).replaceChildren( ...recent.map( place => item( place.name, place.region || formatLatLon( place.lat, place.lon ), () => flyTo( place ) ) ) );
		$( '.recent-block' ).hidden = recent.length === 0;

	}

	showSpots();
	refreshRecent();

	// --- vehicles ---

	const saved = storage( () => localStorage.getItem( VEHICLE_KEY ) );
	const fallback = vehicles.find( v => v.id === DEFAULT_RIDE ) ?? vehicles[ 0 ];
	let picked = vehicles.find( v => v.id === saved ) ?? fallback;
	const pickers = [];
	const notes = [];
	// A Supporter Pass ride (pro.js) is only driven with the pass, and a level's (levels.js) from
	// that level or with the pass (vehicles.js's rideLocked); while it's locked, the default one is.
	const usable = () => rideLocked( picked ) ? fallback : picked;
	// What's being driven, if it isn't the ride picked (the go-kart when the picked one's model didn't
	// load, main.js): shown picked meanwhile, without changing what's kept.
	let driven = null;
	const shown = () => driven ?? usable();
	onProChange( () => mark() );
	onLevelChange( () => mark() );

	// A row of vehicle cards in `parent` (the panel's, and the pause menu's); onPick( vehicle ).
	// Under it, what a locked level's ride needs, when it's picked.
	function vehiclePicker( parent, onPick = () => {} ) {

		const note = Object.assign( document.createElement( 'p' ), { className: 'ride-note small', hidden: true } );
		note.setAttribute( 'role', 'status' );
		parent.after( note );
		notes.push( note );

		const cards = vehicles.map( vehicle => {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'vehicle';
			button.setAttribute( 'role', 'radio' );
			button.dataset.id = vehicle.id;
			const picture = vehicle.thumb
				? Object.assign( document.createElement( 'img' ), { src: vehicle.thumb, alt: '', loading: 'lazy' } )
				: vehicle.icon ? Object.assign( document.createElement( 'span' ), { className: 'ride-icon', innerHTML: vehicle.icon } ) : kartIcon();
			const name = Object.assign( document.createElement( 'b' ), { textContent: vehicle.name } );
			const blurb = Object.assign( document.createElement( 'span' ), { textContent: `${ vehicle.blurb } · ${ vehicle.topSpeed } km/h` } );
			button.append( picture, name, blurb );
			// A pass ride wears the pass's badge; a level's, while it's locked, the level (and "or Pass").
			const unlock = rideUnlock( vehicle );
			if ( vehicle.pro ) button.append( proBadge() );
			else if ( unlock ) button.append( Object.assign( document.createElement( 'span' ), { className: 'pro-badge level-chip', textContent: unlockChip( unlock ) } ) );
			button.addEventListener( 'click', () => {

				note.hidden = true;
				if ( rideLocked( vehicle ) ) {

					// Locked: what the pass is, or for a level's ride which level (and that the pass has it).
					if ( vehicle.pro ) return openPass();
					// The link and its full stop kept together, so the stop never wraps onto a line of its own.
					const link = Object.assign( document.createElement( 'span' ), { className: 'pass-link' } );
					link.append( Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link', textContent: 'Supporter Pass', onclick: () => openPass() } ), '.' );
					note.replaceChildren( `The ${ vehicle.name.toLowerCase() } comes at level ${ unlock.level }: you're level ${ getLevel() }. Drive on, or get it now with the `, link );
					note.hidden = false;
					// Under three rows of rides it can be below the panel's fold: brought into view.
					note.scrollIntoView( { block: 'nearest' } );
					return;

				}

				pick( vehicle );
				onPick( vehicle );

			} );
			return button;

		} );
		parent.replaceChildren( ...cards );
		pickers.push( parent );
		mark();
		// The rides scroll sideways: the one picked in view, without moving anything else.
		requestAnimationFrame( () => {

			const card = parent.querySelector( '.vehicle.picked' );
			if ( card ) parent.scrollLeft += card.getBoundingClientRect().left - parent.getBoundingClientRect().left - ( parent.clientWidth - card.offsetWidth ) / 2;

		} );

	}

	function pick( vehicle ) {

		picked = vehicle;
		driven = null;
		storage( () => localStorage.setItem( VEHICLE_KEY, vehicle.id ) );
		mark();

	}

	function mark() {

		for ( const parent of pickers ) {

			for ( const button of parent.querySelectorAll( '.vehicle' ) ) {

				const on = button.dataset.id === shown().id;
				const shut = rideLocked( vehicles.find( v => v.id === button.dataset.id ) );
				button.classList.toggle( 'picked', on );
				button.classList.toggle( 'locked', shut );
				button.setAttribute( 'aria-checked', String( on ) );
				const chip = button.querySelector( '.level-chip' );
				if ( chip ) chip.hidden = ! shut;

			}

		}

		// A ride picked, a level reached or the pass: what a note said may not hold now.
		for ( const note of notes ) note.hidden = true;

		// The library's models are other people's work, under licences that ask for credit.
		const credit = usable().credit;
		$( '.credit' ).textContent = credit ? `Model: "${ credit.title }" by ${ credit.author }, ${ credit.license.replace( 'CC Attribution', 'CC BY 4.0' ) }; ${ usable().changes ?? 'resized and compressed' }.` : '';

	}

	vehiclePicker( $( '.vehicles' ) );

	// --- who's driving now (online.js): how many, and the busiest areas, each like a spot ---

	// { summary, areas: [ { title, subtitle, place } ] }, or null for none of it. The list is made
	// again only when it changes, so a row being pressed isn't swapped for another under the finger.
	let onlineKey = null;
	function setOnline( online ) {

		const section = $( '.online' );
		section.hidden = ! online;
		if ( ! online ) return;
		section.querySelector( '.summary' ).textContent = online.summary;
		const key = JSON.stringify( online.areas.map( ( { title, subtitle, place } ) => [ title, subtitle, place.lat, place.lon ] ) );
		if ( key === onlineKey ) return;
		onlineKey = key;
		const list = section.querySelector( '.areas' );
		list.replaceChildren( ...online.areas.map( area => item( area.title, area.subtitle, () => flyTo( area.place ) ) ) );
		list.hidden = online.areas.length === 0;

	}

	// --- the pin and its card ---

	// A pin on an area where people are driving (online.js) says how many, place.drivers, and which
	// start spot it's near, place.near.
	function setPin( place ) {

		pinned = place;
		card.hidden = ! place;
		if ( ! place ) return;
		const where = formatLatLon( place.lat, place.lon );
		const count = place.drivers;
		if ( count ) {

			card.querySelector( '.name' ).textContent = `${ drivers( count ) } here`;
			card.querySelector( '.coords' ).textContent = place.near ? `${ place.near } · ${ where }` : where;
			return;

		}

		card.querySelector( '.name' ).textContent = place.near || place.name || 'Dropped pin';
		const region = place.region || ( place.world === MOON ? 'The Moon' : '' );
		card.querySelector( '.coords' ).textContent = region ? `${ region } · ${ where }` : where;

	}

	card.querySelector( '.go' ).addEventListener( 'click', () => pinned && onDrive( pinned ) );
	card.querySelector( '.clear' ).addEventListener( 'click', () => onClearPin() );

	return {
		setPin,
		setOnline,
		refreshRecent,
		vehiclePicker,
		setWorld,
		// The ride being driven (null: off driving), for the pickers to show.
		setDriven( vehicle ) {

			driven = vehicle && vehicle !== usable() ? vehicle : null;
			mark();

		},
		get world() {

			return world;

		},
		get vehicle() {

			return usable();

		},
		get pinned() {

			return pinned;

		},
		closeResults() {

			const open = ! results.hidden || ! status.hidden;
			showResults( [] );
			say( '' );
			return open;

		},
		focusSearch() {

			input.focus();
			input.select();

		},
	};

}

function item( title, subtitle, onClick ) {

	const li = document.createElement( 'li' );
	const button = document.createElement( 'button' );
	button.type = 'button';
	button.append( Object.assign( document.createElement( 'b' ), { textContent: title } ) );
	if ( subtitle ) button.append( Object.assign( document.createElement( 'span' ), { textContent: subtitle } ) );
	button.addEventListener( 'click', onClick );
	li.append( button );
	return li;

}

// The kart has no photo: a little drawing instead.
function kartIcon() {

	const span = document.createElement( 'span' );
	span.className = 'kart-icon';
	span.innerHTML = `<svg viewBox="0 0 64 40" aria-hidden="true">
		<path d="M8 26h42l6-6h-9l-4-6H26l-6 6H10z" fill="#ffd23f"/>
		<path d="M27 14h14l3 6H24z" fill="#1d2633"/>
		<circle cx="35" cy="9" r="5" fill="#f4f6f8"/><rect x="33" y="8" width="7" height="2.4" rx="1" fill="#12161c"/>
		<circle cx="15" cy="29" r="6" fill="#111317"/><circle cx="47" cy="29" r="7" fill="#111317"/>
		<circle cx="15" cy="29" r="2" fill="#6b7686"/><circle cx="47" cy="29" r="2.4" fill="#6b7686"/>
	</svg>`;
	return span;

}
