import { hornAudio, hornsOn, playHorn, setHornsOn } from './horns.js';
import { FLAGS, cellOf } from './live-protocol.js';
import { hideKeys, toast } from './screens.js';

// Driving with others on screen (live.js has the connection, ghosts.js the cars): the chip by the
// place's name while driving ("Party · 3", "Nearby · just you") and the list of drivers it opens,
// each with "Go to" and "Hide"; "Drive with friends" on the globe's panel and in the pause menu
// (inviting friends with a link, the party's members, leaving it, and the switches); the banner
// on the globe while in a party; the toasts as people come, go and drop in somewhere; and the horn
// (H, or its button on a touch screen), heard for yours and those near, each in its driver's horn
// from the Garage (horns.js), which travels with their look.

// Driving with others off for the rest of the day, its budget spent (worker/drive/live.js).
export const BUDGET_TOAST = 'Lots of drivers today: driving with others is back after midnight UTC.';
// Other cars' horns are heard this near (m).
const HEAR_RANGE = 150;
// In an area, a toast for someone new at most this often (ms).
const NEARBY_TOASTS = 10000;

// live, ghosts: live.js's and ghosts.js's; vehicles: loadVehicles()', for the rides' names; mode():
// main.js's mode; goTo( pid ): drive to where that driver is (next to them, or dropping in there);
// onInvite(): Invite friends made a party (for the play stats).
export function setUpFriends( { live, ghosts, vehicles, mode, goTo, onInvite = () => {} } ) {

	const $ = id => document.getElementById( id );
	const driveUi = $( 'drive-ui' );
	const chip = driveUi.querySelector( '.live-chip' );
	const list = driveUi.querySelector( '.players' );
	const horn = driveUi.querySelector( '.horn' );
	const hornKey = driveUi.querySelector( '.live-key' );
	const banner = $( 'globe-ui' ).querySelector( '.party-banner' );
	const rides = new Map( vehicles.map( vehicle => [ vehicle.id, vehicle.name ] ) );
	const areas = [
		makeArea( $( 'globe-ui' ).querySelector( '.friends' ), false ),
		makeArea( $( 'pause' ).querySelector( '.friends' ), true ),
	];
	let audio = null;
	let beeps = 0;
	let lastHorn = null;
	let lastMode = null;
	let nearbyToast = - Infinity;
	// Who the party's banner names (their pid, or null), and what it says.
	let bannerPid = null;
	let bannerKey = null;

	chip.addEventListener( 'click', () => openList( list.hidden ) );
	horn.addEventListener( 'click', () => honk() );
	// The list closes on a click anywhere else.
	window.addEventListener( 'pointerdown', e => {

		if ( ! list.hidden && ! list.contains( e.target ) && ! chip.contains( e.target ) ) openList( false );

	}, true );

	// Sound needs a click or a key first; the horns are made as they're needed, nothing to load.
	const unlock = () => {

		if ( audio ) return;
		audio = hornAudio();
		if ( ! audio ) return;
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
		if ( ! inParty() || ! p ) return;
		// A friend dropping in where you're driving (as Join does, beside you) needs no Join; on the
		// globe, the banner says it already if it's them.
		const here = ! live.away && live.place && cellOf( place.lat, place.lon ) === cellOf( live.place.lat, live.place.lon );
		if ( here ) toast( `${ p.name } dropped in near you.`, 4000 );
		else if ( mode() !== 'globe' || bannerPid !== pid ) toast( `${ p.name } went to ${ place.name || 'a new place' }.`, 8000, { label: 'Join', onClick: () => goTo( pid ) } );

	} );
	live.on( 'full', ( { max } ) => toast( `That party is full: ${ max } drivers at most.`, 6000 ) );
	live.on( 'ended', reason => {

		refresh();
		if ( reason === 'replaced' ) toast( 'Driving with others moved to another tab.', 8000 );
		// (Not "reload": that's a new visit, one of the day's free drives.)
		else if ( reason === 'expired' ) toast( 'Driving with others has ended for this visit (after 6 hours). It\'s on again on your next visit.', 10000 );
		else if ( reason === 'budget' ) toast( BUDGET_TOAST, 10000 );
		else if ( reason === 'refused' ) toast( 'Driving with others couldn\'t connect from here, so you\'re driving on your own.', 8000 );

	} );
	live.on( 'honk', ( { pid } ) => {

		const distance = ghosts.distanceTo( pid );
		if ( distance !== null && distance <= HEAR_RANGE ) beep( 1 - 0.7 * distance / HEAR_RANGE, live.players.get( pid )?.look?.horn );

	} );

	// The list's distances, and the banner and chip as the mode changes.
	setInterval( () => {

		if ( mode() !== lastMode || ! list.hidden ) refresh();

	}, 500 );

	// --- showing it all ---

	function refresh() {

		lastMode = mode();
		// Over for this visit, whatever ended it (the toast said why): none of it shows. Nor the horn
		// with nearby off and no party, as there's nobody to hear it.
		const off = !! live.ended;
		for ( const area of areas ) area.refresh( off );
		hornKey.hidden = horn.hidden = off || live.status === 'off';
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
		const label = status === 'busy' ? 'Nearby is busy'
			: status !== 'live' ? `${ where } · connecting`
				: ! inParty() && count === 1 ? 'Nearby · just you' : `${ where } · ${ count }`;
		// The words, and on a phone only the count (style.css), so the place's name keeps its room.
		if ( label !== chip.getAttribute( 'aria-label' ) ) {

			chip.replaceChildren(
				Object.assign( document.createElement( 'span' ), { className: 'long', textContent: label } ),
				Object.assign( document.createElement( 'span' ), { className: 'short', textContent: status === 'live' ? String( count ) : '' } ),
			);
			chip.setAttribute( 'aria-label', label );

		}

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
		empty.textContent = inParty() ? 'Nobody else here yet. Invite friends from the pause menu.'
			: live.status === 'busy' ? 'This area is full just now, so you\'re driving on your own here.'
				: 'Nobody else driving near here yet.';
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
				// Whose, for a screen reader: otherwise a column of the same two words.
				go.setAttribute( 'aria-label', `Go to ${ name }` );
				hide.setAttribute( 'aria-label', `${ hide.textContent } ${ name }` );

			},
		};

	}

	// Made again only when what it says changes: it's a live region, read out each time it is.
	function showBanner() {

		const show = inParty() && mode() === 'globe' && ! live.ended;
		banner.hidden = ! show;
		const driving = show ? [ ...live.players.values() ].find( p => ! p.away && ( p.s || p.place ) ) : null;
		bannerPid = driving?.pid ?? null;
		const key = show && JSON.stringify( driving ? [ driving.pid, driving.name, driving.star, driving.place?.name ] : null );
		if ( ! show || key === bannerKey ) return;
		bannerKey = key;
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
		const invite = button( 'Invite friends', 'invite', () => live.invite() && onInvite() );
		const party = Object.assign( document.createElement( 'div' ), { className: 'party' } );
		const code = Object.assign( document.createElement( 'p' ), { className: 'code' } );
		const link = Object.assign( document.createElement( 'input' ), { className: 'link-text', readOnly: true, type: 'text' } );
		link.setAttribute( 'aria-label', 'The party\'s link' );
		link.addEventListener( 'focus', () => link.select() );
		const copy = button( 'Copy', 'copy', () => copyLink( link, copy ) );
		const share = button( 'Share', 'share', () => navigator.share?.( { title: 'World Drive', text: shareText(), url: link.value } ).catch( () => {} ) );
		share.hidden = typeof navigator.share !== 'function';
		const row = Object.assign( document.createElement( 'div' ), { className: 'link-row' } );
		row.append( link, copy, share );
		const members = Object.assign( document.createElement( 'ul' ), { className: 'members' } );
		const leave = button( 'Leave party', 'link leave', () => live.leaveParty() );
		party.append( code, row, members, leave );
		const nearby = setting( 'Show me to drivers nearby', live.nearby, on => live.setNearby( on ) );
		// Being shown nearby is being counted on the globe too (online.js): the switch says so.
		const counted = Object.assign( document.createElement( 'p' ), { className: 'note', textContent: 'Also counts you, with no name, on the globe\'s map of who\'s driving.' } );
		const parts = [ title, invite, party, nearby.label, counted ];
		const hornSetting = inPause ? setting( 'Horn sounds', hornsOn(), setHornsOn ) : null;
		if ( hornSetting ) parts.push( hornSetting.label );
		root.replaceChildren( ...parts );

		return {
			refresh( off ) {

				root.hidden = off;
				if ( off ) return;
				invite.hidden = inParty();
				party.hidden = ! inParty();
				nearby.input.checked = live.nearby;
				if ( hornSetting ) hornSetting.input.checked = hornsOn();
				if ( party.hidden ) return;
				code.textContent = `Your party: ${ live.party }. Anyone with the link can join you.`;
				link.value = `${ location.origin }/?party=${ live.party }`;
				// You, by the name the others see (a guest has no other way to know it).
				const you = document.createElement( 'li' );
				you.append( 'You' );
				if ( live.self ) you.append( ' (', nameOf( live.self ), ')' );
				members.replaceChildren( you, ...[ ...live.players.values() ].map( p => {

					const li = document.createElement( 'li' );
					li.append( nameOf( p ), ` · ${ p.away ? 'on the globe' : p.place?.name ? `at ${ p.place.name }` : 'driving' }` );
					return li;

				} ) );

			},
		};

	}

	// What a shared party link says with it: where you're driving, by its name (not a dropped pin's
	// coordinates). The link itself unfurls with the home page's card and words (its og: tags).
	function shareText() {

		const where = mode() !== 'globe' ? live.place?.name : null;
		return where && ! /°/.test( where ) ? `Drive with me at ${ where } in World Drive` : 'Drive with me in World Drive';

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

	// (Not with nearby off and no party: nobody's there to hear it.)
	function honk() {

		if ( mode() !== 'driving' || live.status === 'off' || ! live.honk() ) return;
		ghosts.honkSelf();
		beep( 1, live.ride?.look?.horn );

	}

	// A horn (horns.js: an id from a look, the beep for one this page doesn't know), unless horn
	// sounds are off. Counted, for the tests, with the last one's id.
	function beep( volume, horn ) {

		if ( ! hornsOn() || ! audio ) return;
		lastHorn = playHorn( audio, horn, volume );
		beeps ++;

	}

	refresh();

	return {
		honk,
		joinParty: code => live.joinParty( code ),
		refresh,
		// How many horns have sounded, and the last one's, for the tests.
		get beeps() {

			return beeps;

		},
		get lastHorn() {

			return lastHorn;

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
