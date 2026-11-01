import { FLAGS, PARTY_MAX } from './live-protocol.js';
import { storage } from './places.js';
import { hideKeys, toast } from './screens.js';

// Driving with others on screen (live.js has the connection, ghosts.js the cars): the chip by the
// place's name while driving ("Party · 3", "Nearby · just you") and the list of drivers it opens,
// each with "Go to" and "Hide"; "Drive with friends" on the globe's panel and in the pause menu
// (inviting friends with a link, the party's members, leaving it, and the switches); the banner
// on the globe while in a party; the toasts as people come, go and drop in somewhere; and the horn
// (H, or its button on a touch screen), with a soft beep for yours and those near.

const HORN_KEY = 'world-drive.horn';
// Other cars' horns are heard this near (m).
const HEAR_RANGE = 150;
// In an area, a toast for someone new at most this often (ms).
const NEARBY_TOASTS = 10000;

// live, ghosts: live.js's and ghosts.js's; vehicles: loadVehicles()', for the rides' names; mode():
// main.js's mode; goTo( pid ): drive to where that driver is (next to them, or dropping in there).
export function setUpFriends( { live, ghosts, vehicles, mode, goTo } ) {

	const $ = id => document.getElementById( id );
	const driveUi = $( 'drive-ui' );
	const chip = driveUi.querySelector( '.live-chip' );
	const list = driveUi.querySelector( '.players' );
	const horn = driveUi.querySelector( '.horn' );
	const hornKey = driveUi.querySelector( '.live-key' );
	const banner = $( 'globe-ui' ).querySelector( '.party-banner' );
	const rides = new Map( vehicles.map( vehicle => [ vehicle.id, vehicle.name ] ) );
	let hornOn = storage( () => localStorage.getItem( HORN_KEY ) ) !== 'off';
	const areas = [
		makeArea( $( 'globe-ui' ).querySelector( '.friends' ), false ),
		makeArea( $( 'pause' ).querySelector( '.friends' ), true ),
	];
	let audio = null;
	let beeps = 0;
	let lastMode = null;
	let nearbyToast = - Infinity;

	chip.addEventListener( 'click', () => openList( list.hidden ) );
	horn.addEventListener( 'click', () => honk() );
	// The list closes on a click anywhere else.
	window.addEventListener( 'pointerdown', e => {

		if ( ! list.hidden && ! list.contains( e.target ) && ! chip.contains( e.target ) ) openList( false );

	}, true );

	// Sound needs a click or a key first; the horn's beep is made as it's needed, nothing to load.
	const unlock = () => {

		if ( audio ) return;
		try {

			audio = new AudioContext();

		} catch {

			return;

		}

		window.removeEventListener( 'pointerdown', unlock, true );
		window.removeEventListener( 'keydown', unlock, true );

	};
	window.addEventListener( 'pointerdown', unlock, true );
	window.addEventListener( 'keydown', unlock, true );

	// --- what the room says ---

	const inParty = () => !! live.party;
	for ( const type of [ 'status', 'party', 'nearby', 'welcome', 'clear', 'look', 'away' ] ) live.on( type, refresh );
	live.on( 'party', code => {

		// The party stays in the address while you're in it, so a reload (or the link copied from the
		// address bar) keeps you in it.
		const url = new URL( location.href );
		if ( code ) url.searchParams.set( 'party', code );
		else url.searchParams.delete( 'party' );
		history.replaceState( history.state, '', url );

	} );
	live.on( 'join', p => {

		refresh();
		if ( inParty() ) toast( `${ p.name } joined the party.`, 4000 );
		else if ( mode() === 'driving' && performance.now() - nearbyToast > NEARBY_TOASTS ) {

			nearbyToast = performance.now();
			toast( `${ p.name } is driving nearby.`, 3500 );

		}

	} );
	live.on( 'leave', ( { player } ) => {

		refresh();
		if ( inParty() ) toast( `${ player.name } left the party.`, 4000 );

	} );
	live.on( 'place', ( { pid, place } ) => {

		refresh();
		const p = live.players.get( pid );
		if ( inParty() && p ) toast( `${ p.name } went to ${ place.name || 'a new place' }.`, 8000, { label: 'Join', onClick: () => goTo( pid ) } );

	} );
	live.on( 'full', () => toast( `That party is full: ${ PARTY_MAX } drivers at most.`, 6000 ) );
	live.on( 'ended', reason => {

		refresh();
		if ( reason === 'replaced' ) toast( 'Driving with others moved to another tab.', 8000 );
		else if ( reason === 'expired' ) toast( 'Driving with others has ended for this visit. Reload for a fresh drive.', 10000 );

	} );
	live.on( 'honk', ( { pid } ) => {

		const distance = ghosts.distanceTo( pid );
		if ( distance !== null && distance <= HEAR_RANGE ) beep( 1 - 0.7 * distance / HEAR_RANGE );

	} );

	// The list's distances, and the banner and chip as the mode changes.
	setInterval( () => {

		if ( mode() !== lastMode || ! list.hidden ) refresh();

	}, 500 );

	// --- showing it all ---

	function refresh() {

		lastMode = mode();
		// Switched off on the Worker (or for this visit): none of it shows.
		const off = live.ended === 'off' || live.ended === 'protocol';
		for ( const area of areas ) area.refresh( off );
		hornKey.hidden = horn.hidden = !! live.ended;
		showChip();
		showBanner();
		// The list is for driving: paused or gone, it closes.
		if ( lastMode !== 'driving' ) openList( false );
		if ( ! list.hidden ) showList();

	}

	function showChip() {

		const { status } = live;
		chip.hidden = !! live.ended || status === 'off';
		if ( chip.hidden ) {

			openList( false );
			return;

		}

		const count = live.players.size + 1;
		const where = inParty() ? 'Party' : 'Nearby';
		chip.textContent = status === 'busy' ? 'Nearby is busy'
			: status !== 'live' ? `${ where } · connecting`
				: ! inParty() && count === 1 ? 'Nearby · just you' : `${ where } · ${ count }`;
		chip.classList.toggle( 'on', status === 'live' );

	}

	function openList( open ) {

		list.hidden = ! open;
		chip.setAttribute( 'aria-expanded', String( open ) );
		if ( ! open ) return;
		hideKeys();
		showList();

	}

	// Everyone else in the room, nearest first, those on the globe last.
	function others() {

		const all = [ ...live.players.values() ].map( p => ( { p, distance: ghosts.distanceTo( p.pid ) } ) );
		return all.sort( ( a, b ) => ( a.p.away - b.p.away ) || ( a.distance ?? Infinity ) - ( b.distance ?? Infinity ) || a.p.name.localeCompare( b.p.name ) );

	}

	// The list's parts, made once; its rows by pid, kept and filled in again as it refreshes, so a
	// button being pressed is never swapped for another under the finger.
	const heading = document.createElement( 'h3' );
	const empty = Object.assign( document.createElement( 'p' ), { className: 'empty' } );
	const rows = document.createElement( 'ul' );
	const rowOf = new Map();
	list.append( heading, empty, rows );

	function showList() {

		heading.textContent = inParty() ? `Party ${ live.party }` : 'Drivers nearby';
		const shown = others();
		empty.hidden = shown.length > 0;
		empty.textContent = inParty() ? 'Nobody else here yet. Invite friends from the pause menu.' : 'Nobody else driving near here yet.';
		for ( const [ pid, row ] of rowOf ) {

			if ( live.players.has( pid ) ) continue;
			row.li.remove();
			rowOf.delete( pid );

		}

		for ( const { p, distance } of shown ) {

			if ( ! rowOf.has( p.pid ) ) rowOf.set( p.pid, makeRow( p.pid ) );
			const row = rowOf.get( p.pid );
			row.fill( p, distance );
			rows.append( row.li );

		}

	}

	function makeRow( pid ) {

		const li = document.createElement( 'li' );
		const who = Object.assign( document.createElement( 'div' ), { className: 'who' } );
		const what = Object.assign( document.createElement( 'span' ), { className: 'what' } );
		who.append( document.createElement( 'b' ), what );
		let name = '';
		const go = button( 'Go to', 'go', () => {

			openList( false );
			goTo( pid );

		} );
		const hide = button( 'Hide', 'hide', () => {

			ghosts.hide( name, ! ghosts.isHidden( name ) );
			showList();

		} );
		li.append( who, go, hide );
		return {
			li,
			fill( p, distance ) {

				if ( p.name !== name ) who.firstChild.replaceWith( nameOf( p ) );
				name = p.name;
				const paused = p.s && p.s[ 10 ] & FLAGS.paused;
				const where = p.away ? 'on the globe' : paused ? 'paused' : distance !== null ? far( distance ) : p.place?.name ? `at ${ p.place.name }` : 'driving';
				what.textContent = `${ rides.get( p.vehicle ) ?? 'Go-kart' } · ${ where }`;
				go.disabled = p.away || ( ! p.s && ! p.place );
				const hiddenHere = ghosts.isHidden( name );
				hide.textContent = hiddenHere ? 'Show' : 'Hide';
				hide.title = hiddenHere ? 'Show them again' : 'Hide them for this visit';

			},
		};

	}

	function showBanner() {

		const show = inParty() && mode() === 'globe' && ! live.ended;
		banner.hidden = ! show;
		if ( ! show ) return;
		const driving = [ ...live.players.values() ].find( p => ! p.away && ( p.s || p.place ) );
		if ( ! driving ) {

			banner.replaceChildren( Object.assign( document.createElement( 'span' ), { textContent: 'Waiting for your friends: pick a place and they can join you.' } ) );
			return;

		}

		const text = document.createElement( 'span' );
		text.append( nameOf( driving ), ` is driving at ${ driving.place?.name || 'a spot on the map' }` );
		banner.replaceChildren( text, button( 'Join', 'primary join', () => goTo( driving.pid ) ) );

	}

	// "Drive with friends": inviting, the party, leaving it, and the switches.
	function makeArea( root, inPause ) {

		const title = Object.assign( document.createElement( inPause ? 'h3' : 'h2' ), { textContent: 'Drive with friends' } );
		const invite = button( 'Invite friends', 'invite', () => live.invite() );
		const party = Object.assign( document.createElement( 'div' ), { className: 'party' } );
		const code = Object.assign( document.createElement( 'p' ), { className: 'code' } );
		const link = Object.assign( document.createElement( 'input' ), { className: 'link-text', readOnly: true, type: 'text' } );
		link.setAttribute( 'aria-label', 'The party\'s link' );
		link.addEventListener( 'focus', () => link.select() );
		const copy = button( 'Copy', 'copy', () => copyLink( link, copy ) );
		const share = button( 'Share', 'share', () => navigator.share?.( { title: 'World Drive', text: 'Drive with me in World Drive', url: link.value } ).catch( () => {} ) );
		share.hidden = typeof navigator.share !== 'function';
		const row = Object.assign( document.createElement( 'div' ), { className: 'link-row' } );
		row.append( link, copy, share );
		const members = Object.assign( document.createElement( 'ul' ), { className: 'members' } );
		const leave = button( 'Leave party', 'link leave', () => live.leaveParty() );
		party.append( code, row, members, leave );
		const nearby = setting( 'Show me to drivers nearby', live.nearby, on => live.setNearby( on ) );
		const parts = [ title, invite, party, nearby.label ];
		const hornSetting = inPause ? setting( 'Horn sounds', hornOn, on => {

			hornOn = on;
			storage( () => localStorage.setItem( HORN_KEY, on ? 'on' : 'off' ) );

		} ) : null;
		if ( hornSetting ) parts.push( hornSetting.label );
		root.replaceChildren( ...parts );

		return {
			refresh( off ) {

				root.hidden = off;
				if ( off ) return;
				const over = !! live.ended;
				invite.hidden = inParty() || over;
				party.hidden = ! inParty() || over;
				nearby.input.checked = live.nearby;
				nearby.label.hidden = over;
				if ( hornSetting ) hornSetting.input.checked = hornOn;
				if ( party.hidden ) return;
				code.textContent = `Your party: ${ live.party }. Anyone with the link can join you.`;
				link.value = `${ location.origin }/?party=${ live.party }`;
				const you = Object.assign( document.createElement( 'li' ), { textContent: 'You' } );
				members.replaceChildren( you, ...[ ...live.players.values() ].map( p => {

					const li = document.createElement( 'li' );
					li.append( nameOf( p ), ` · ${ p.away ? 'on the globe' : p.place?.name ? `at ${ p.place.name }` : 'driving' }` );
					return li;

				} ) );

			},
		};

	}

	async function copyLink( input, copy ) {

		let done = false;
		try {

			await navigator.clipboard.writeText( input.value );
			done = true;

		} catch {

			input.select();
			done = document.execCommand?.( 'copy' ) ?? false;

		}

		copy.textContent = done ? 'Copied' : 'Select it to copy';
		setTimeout( () => copy.textContent = 'Copy', 2000 );

	}

	// --- the horn ---

	function honk() {

		if ( mode() !== 'driving' || ! live.honk() ) return;
		ghosts.honkSelf();
		beep( 1 );

	}

	// A soft two-note beep, made here: no file to load.
	function beep( volume ) {

		if ( ! hornOn || ! audio ) return;
		if ( audio.state === 'suspended' ) audio.resume();
		const t = audio.currentTime + 0.01;
		const peak = 0.12 * volume;
		const gain = audio.createGain();
		gain.gain.setValueAtTime( 0.0001, t );
		gain.gain.exponentialRampToValueAtTime( peak, t + 0.03 );
		gain.gain.setValueAtTime( peak, t + 0.16 );
		gain.gain.exponentialRampToValueAtTime( 0.0001, t + 0.38 );
		gain.connect( audio.destination );
		for ( const frequency of [ 415, 523 ] ) {

			const tone = audio.createOscillator();
			tone.type = 'triangle';
			tone.frequency.value = frequency;
			tone.connect( gain );
			tone.start( t );
			tone.stop( t + 0.4 );

		}

		beeps ++;

	}

	refresh();

	return {
		honk,
		joinParty: code => live.joinParty( code ),
		refresh,
		// How many beeps have sounded, for the tests.
		get beeps() {

			return beeps;

		},
	};

}

// A driver's name, as text, with their ⭐ if they have the Supporter Pass.
function nameOf( p ) {

	const name = Object.assign( document.createElement( 'b' ), { textContent: p.name } );
	if ( ! p.star ) return name;
	const span = document.createElement( 'span' );
	span.append( name, Object.assign( document.createElement( 'span' ), { className: 'star', textContent: ' ⭐', title: 'Supporter' } ) );
	return span;

}

function far( metres ) {

	return metres < 1000 ? `${ Math.round( metres ) } m` : `${ ( metres / 1000 ).toFixed( metres < 10000 ? 1 : 0 ) } km`;

}

function button( text, className, onClick ) {

	const b = Object.assign( document.createElement( 'button' ), { type: 'button', className, textContent: text } );
	b.addEventListener( 'click', onClick );
	return b;

}

function setting( text, checked, onChange ) {

	const label = Object.assign( document.createElement( 'label' ), { className: 'setting' } );
	const input = Object.assign( document.createElement( 'input' ), { type: 'checkbox', checked } );
	input.addEventListener( 'change', () => onChange( input.checked ) );
	label.append( input, ` ${ text }` );
	return { label, input };

}
