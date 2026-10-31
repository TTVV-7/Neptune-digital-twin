import { searchPlaces } from './api.js';
import { formatLatLon, parseLatLon, recentPlaces, SPOTS, storage } from './places.js';
import { openPass, proBadge } from './pass.js';
import { isPro, onProChange } from './pro.js';

// The globe's panel: search, the starting spots, recent places and the vehicle picker, and the
// card under the pin with "Drive here". Choosing a spot or a search result flies the globe there
// and pins it; a tap on the globe pins the spot tapped.

const VEHICLE_KEY = 'world-drive.vehicle';

// root: #globe-ui. vehicles: from loadVehicles(). flyTo( place ): fly the globe there and pin it.
// onDrive( place ): drop in at the pin.
export function setUpPanel( { root, vehicles, flyTo, onDrive, onClearPin } ) {

	const $ = selector => root.querySelector( selector );
	const form = $( '.search' );
	const input = form.elements.q;
	const status = $( '.search-status' );
	const results = $( '.results' );
	const card = $( '.pin-card' );
	let pinned = null;
	let searching = 0;

	// --- search: only on Enter (or Go), never as you type, as OpenStreetMap asks ---

	form.addEventListener( 'submit', async e => {

		e.preventDefault();
		const text = input.value.trim();
		if ( ! text ) return;
		input.blur();
		const typed = parseLatLon( text );
		if ( typed ) {

			showResults( [] );
			say( '' );
			flyTo( { name: formatLatLon( typed.lat, typed.lon ), region: 'Coordinates', ...typed } );
			return;

		}

		const ask = ++ searching;
		say( 'Searching...' );
		showResults( [] );
		try {

			const found = await searchPlaces( text );
			if ( ask !== searching ) return;
			say( found.length ? '' : `Nothing found for "${ text }". Try a city, a landmark or an address.` );
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

	// --- spots and recent places ---

	$( '.spots' ).replaceChildren( ...SPOTS.map( spot => item( spot.name, spot.region, () => flyTo( spot ) ) ) );

	function refreshRecent() {

		const recent = recentPlaces();
		$( '.recent' ).replaceChildren( ...recent.map( place => item( place.name, place.region || formatLatLon( place.lat, place.lon ), () => flyTo( place ) ) ) );
		$( '.recent-block' ).hidden = recent.length === 0;

	}

	refreshRecent();

	// --- vehicles ---

	const saved = storage( () => localStorage.getItem( VEHICLE_KEY ) );
	let picked = vehicles.find( v => v.id === saved ) ?? vehicles[ 0 ];
	const pickers = [];
	// A Supporter Pass ride (pro.js) is only driven with the pass; without it, the first ride is.
	const usable = () => picked.pro && ! isPro() ? vehicles[ 0 ] : picked;
	onProChange( () => mark() );

	// A row of vehicle cards in `parent` (the panel's, and the pause menu's); onPick( vehicle ).
	function vehiclePicker( parent, onPick = () => {} ) {

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
			if ( vehicle.pro ) button.append( proBadge() );
			button.addEventListener( 'click', () => {

				// Locked: what the pass is, instead.
				if ( vehicle.pro && ! isPro() ) return openPass();
				pick( vehicle );
				onPick( vehicle );

			} );
			return button;

		} );
		parent.replaceChildren( ...cards );
		pickers.push( parent );
		mark();

	}

	function pick( vehicle ) {

		picked = vehicle;
		storage( () => localStorage.setItem( VEHICLE_KEY, vehicle.id ) );
		mark();

	}

	function mark() {

		for ( const parent of pickers ) {

			for ( const button of parent.querySelectorAll( '.vehicle' ) ) {

				const on = button.dataset.id === usable().id;
				button.classList.toggle( 'picked', on );
				button.classList.toggle( 'locked', !! vehicles.find( v => v.id === button.dataset.id ).pro && ! isPro() );
				button.setAttribute( 'aria-checked', String( on ) );

			}

		}

		// The library's models are other people's work, under licences that ask for credit.
		const credit = usable().credit;
		$( '.credit' ).textContent = credit ? `Model: "${ credit.title }" by ${ credit.author }, ${ credit.license.replace( 'CC Attribution', 'CC BY 4.0' ) }; ${ usable().changes ?? 'resized and compressed' }.` : '';

	}

	vehiclePicker( $( '.vehicles' ) );

	// --- the pin and its card ---

	function setPin( place ) {

		pinned = place;
		card.hidden = ! place;
		if ( ! place ) return;
		card.querySelector( '.name' ).textContent = place.name ?? 'Dropped pin';
		card.querySelector( '.coords' ).textContent = place.region ? `${ place.region } · ${ formatLatLon( place.lat, place.lon ) }` : formatLatLon( place.lat, place.lon );

	}

	card.querySelector( '.go' ).addEventListener( 'click', () => pinned && onDrive( pinned ) );
	card.querySelector( '.clear' ).addEventListener( 'click', () => onClearPin() );

	return {
		setPin,
		refreshRecent,
		vehiclePicker,
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
