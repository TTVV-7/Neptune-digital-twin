// The Controls panel, bottom right: the keys and mouse moves for what you're doing right now
// (walking, flying, the library, placing, drawing an area, an item selected, driving, digging),
// changing as that changes. It folds away to a small Controls button; whether it's open is
// remembered in this browser. It opens by itself on a first visit, except on a phone, where it
// starts as the button. H (or its All controls button) opens the full help.

import { getKind, resizeShape } from './kinds.js';

const STORAGE_KEY = 'neptune-twin.legend';
// Narrower than this (px) counts as a phone: the panel starts folded away.
const PHONE_WIDTH = 700;
// Space (px) kept between the panel and the screen's edges and anything it steps round.
const GAP = 8;
const EDGE = 12;
// Squeezed shorter than this (px), the panel scrolls; with less room still it folds to its button.
const MIN_HEIGHT = 140;
const KEYS_TOAST_TIME = 4000;

// A row is [ chips, text ]. A chip is a key, or a mouse move written with a leading '~'; '/' and
// '+' go between chips as they are.
const DRIVE = [
	[ [ 'W', '/', 'S' ], 'Gas · brake, hold S to reverse' ],
	[ [ 'A', '/', 'D' ], 'Steer' ],
	[ [ 'Shift' ], 'Boost' ],
	[ [ 'Space' ], 'Hop' ],
	[ [ 'R' ], 'Stuck? Back on the ground' ],
	[ [ 'C' ], 'Camera: chase or driver\'s seat' ],
	[ [ '~Wheel' ], 'Camera nearer or farther' ],
	[ [ 'V', '/', 'Esc' ], 'Get out' ],
];

const EXCAVATOR = [
	[ [ 'Space' ], 'Dig (hold), or hold the mouse button' ],
	[ [ 'Q', '/', 'E' ], 'Swing' ],
	[ [ 'R', '/', 'F' ], 'Reach, or the wheel' ],
	[ [ 'X' ], 'Dump side' ],
	[ [ 'W', 'A', 'S', 'D' ], 'Drive the tracks' ],
	[ [ 'C' ], 'Camera' ],
	[ [ 'V', '/', 'Esc' ], 'Get out' ],
];

// controls, driver, models: the walk controller, race mode and what's placed. getSidebar: the
// library sidebar, once loaded. getDriving: what V does (drive-prompt.js), once loaded.
// toggleHelp: shows or hides the full help.
export function createLegend( { controls, driver, models, getSidebar, getDriving, toggleHelp } ) {

	const root = document.getElementById( 'legend' );
	const openButton = root.querySelector( '.legend-open' );
	const panel = root.querySelector( '.legend-panel' );
	const mode = panel.querySelector( '.mode' );
	const rows = panel.querySelector( '.rows' );
	const note = panel.querySelector( '.note' );
	const library = document.getElementById( 'library' );
	const obstacles = [ 'hint', 'drive-prompt', 'drive-hud', 'library', 'library-toggle' ].map( id => document.getElementById( id ) );
	// Without a mouse (a phone or tablet), mouse moves aren't listed and clicks are taps.
	const mouse = window.matchMedia( '(any-pointer: fine)' ).matches;

	const saved = storage( () => localStorage.getItem( STORAGE_KEY ) );
	let open = saved ? saved === 'open' : window.innerWidth >= PHONE_WIDTH;
	let shown = '';
	// Opened by hand while there's no room for it (a phone with the P panel open): it then stays
	// open over the P panel, until there's room again.
	let insist = false;

	function setOpen( value ) {

		open = value;
		insist = value;
		storage( () => localStorage.setItem( STORAGE_KEY, open ? 'open' : 'closed' ) );
		update();

	}

	openButton.addEventListener( 'click', () => setOpen( true ) );
	panel.querySelector( '.hide' ).addEventListener( 'click', () => setOpen( false ) );
	panel.querySelector( '.all' ).addEventListener( 'click', () => toggleHelp() );

	// What the player is doing, as { title, rows, note }.
	function current() {

		if ( driver.active ) {

			const name = driver.entry?.state.name ?? '';
			return { title: `Driving ${ name }`.trim(), rows: driver.machine ? EXCAVATOR : DRIVE };

		}

		const sidebar = getSidebar();
		const tool = library.querySelector( '.card.tool.active' );
		if ( tool ) return drawingRows( tool.querySelector( '.name' )?.textContent ?? '' );
		if ( library.classList.contains( 'placing' ) ) return placingRows( models.entries.find( entry => entry.placing )?.state.name ?? '' );
		const selected = sidebar?.getSelected();
		if ( selected ) return selectedRows( selected );
		if ( sidebar?.isOpen() ) return libraryRows();
		return controls.mode === 'walk' ? walkRows() : flyRows();

	}

	const click = mouse ? 'Click' : 'Tap';
	const look = () => controls.locked
		? [ [ [ '~Mouse' ], 'Look around' ], [ [ 'Esc' ], 'Free the mouse' ] ]
		: mouse ? [ [ [ '~Click' ], 'Look · Esc frees the mouse' ], [ [ '~Right-drag' ], 'Look around' ] ] : [];
	const zoom = mouse ? [ [ [ '~Wheel' ], 'Zoom to the cursor' ] ] : [];

	function driveRow() {

		const target = getDriving()?.target();
		return [ [ 'V' ], target ? `Drive the ${ target.entry.state.name }` : 'Drive a pickup' ];

	}

	function walkRows() {

		return { title: 'Walking', rows: [
			[ [ 'W', 'A', 'S', 'D' ], 'Move · Shift runs' ],
			[ [ 'Space' ], 'Jump' ],
			[ [ 'F' ], 'Fly' ],
			...look(),
			...zoom,
			driveRow(),
			[ [ 'L' ], 'Library: place equipment' ],
		] };

	}

	function flyRows() {

		return { title: 'Flying', rows: [
			[ [ 'W', 'A', 'S', 'D' ], 'Move · Shift for faster' ],
			[ [ 'E', '/', 'Q' ], 'Up · down' ],
			[ [ 'F' ], 'Walk on the ground' ],
			...look(),
			...zoom,
			[ [ 'G' ], controls.ghost ? 'Ghost is on: G to bump into walls' : 'Ghost: fly through walls' ],
			driveRow(),
			[ [ 'L' ], 'Library: place equipment' ],
		] };

	}

	function libraryRows() {

		return { title: 'Library', rows: [
			[ [ `~${ click }` ], 'An item, then the ground: place it' ],
			...mouse ? [ [ [ '~Drag' ], 'An item onto the map: place it' ] ] : [],
			[ [ `~${ click }` ], 'A tool, then drag on the ground: draw an area' ],
			[ [ `~${ click }` ], 'Something placed: select it' ],
			[ [ '~Drag' ], 'Something placed: move it' ],
			...mouse ? [ [ [ '~Right-drag' ], 'Look around' ] ] : [],
			...zoom,
			[ [ 'W', 'A', 'S', 'D' ], 'Move' ],
			[ [ 'L' ], 'Close the library' ],
		] };

	}

	function placingRows( name ) {

		return { title: `Placing ${ name }`.trim(), rows: [
			[ [ `~${ click }` ], 'The ground: put it there' ],
			[ [ 'Shift', '+', `~${ click }` ], 'Put it there and place another' ],
			[ mouse ? [ 'R', '/', '~Wheel' ] : [ 'R' ], 'Turn it' ],
			[ [ 'Esc' ], 'Cancel' ],
			...mouse ? [ [ [ '~Right-drag' ], 'Look around' ] ] : [],
			[ [ 'W', 'A', 'S', 'D' ], 'Move' ],
		] };

	}

	function drawingRows( name ) {

		return { title: name ? `New ${ name.toLowerCase() }` : 'New area', rows: [
			[ [ '~Drag' ], 'Draw it on the ground' ],
			[ [ `~${ click }` ], 'Make one of the usual size' ],
			[ [ 'Esc' ], 'Cancel' ],
			...mouse ? [ [ [ '~Right-drag' ], 'Look around' ] ] : [],
			[ [ 'W', 'A', 'S', 'D' ], 'Move' ],
		], note: 'Afterwards, drag its handles to resize it.' };

	}

	function selectedRows( entry ) {

		// What its handles and toolbar (handles.js, toolbar.js) offer: areas, pits and piles (kinds
		// with `resize`) have a size to change and a pit a depth; a round pile doesn't turn.
		const kind = getKind( entry.kind );
		const shape = resizeShape( kind, entry.params );
		const turns = shape !== 'circle';
		const drivable = getDriving()?.isDrivable( entry );
		const buttons = [ turns && 'rotate', shape && 'size', drivable && 'drive', 'edit', 'delete' ].filter( Boolean );
		return { title: `Selected: ${ entry.state.name ?? '' }`, rows: [
			[ [ '~Drag' ], 'Move it' ],
			...turns ? [ [ [ '~Drag' ], 'The round handle: rotate' ] ] : [],
			...shape ? [ [ [ '~Drag' ], shape === 'rect' ? 'The square handles: resize' : 'The square handle: resize' ] ] : [],
			...kind?.resize?.depth ? [ [ [ '~Drag' ], 'The arrow in the middle: depth' ] ] : [],
			[ [ `~${ click }` ], `The buttons above it: ${ buttons.join( ', ' ) }` ],
			...turns ? [ [ [ 'R', '/', 'Shift', '+', 'R' ], 'Turn 15°' ] ] : [],
			[ [ 'Delete' ], 'Remove it' ],
			[ [ 'P' ], shape ? 'Exact size and position' : 'Exact position' ],
			...drivable ? [ [ [ 'V' ], 'Drive it' ] ] : [],
			[ [ 'Esc' ], 'Deselect' ],
		], note: shape && mouse ? 'Sizes snap to 0.5 m: hold Shift for any size.' : '' };

	}

	// Called a few times a second and after key presses and clicks: redraws only what changed,
	// and keeps clear of the other panels, which come and go and change size.
	function update() {

		const now = current();
		const key = JSON.stringify( [ open, now ] );
		if ( key !== shown ) {

			shown = key;
			mode.textContent = now.title;
			rows.replaceChildren( ...now.rows.flatMap( ( [ chips, text ] ) => [
				Object.assign( document.createElement( 'dt' ), { innerHTML: chipsHtml( chips ) } ),
				Object.assign( document.createElement( 'dd' ), { textContent: text } ),
			] ) );
			note.textContent = now.note ?? '';
			note.hidden = ! now.note;

		}

		root.hidden = false;
		place();

	}

	// Bottom right, above whatever else is at the bottom of the screen there (Google's attribution,
	// the hint, the drive prompt and HUD, the library on a phone), below the status readout, and
	// below or beside the P panel. Where there's no room for the panel (a phone with the P panel
	// open), it folds to its button until there is. So it does on a phone while the library, a sheet
	// over the bottom half there, is open: it would cover most of the map left to place things on.
	function place() {

		const gui = visibleRect( document.querySelector( '.lil-gui.lil-root' ) );
		const sheet = visibleRect( library );
		let folded = ! open;
		let spot = null;
		if ( open ) {

			show( panel );
			spot = sheet && sheet.top > 1 ? null : spotFor( panel, gui );
			if ( spot ) insist = false;
			else if ( insist ) spot = spotFor( panel, null );
			else folded = true;

		}

		if ( folded ) {

			show( openButton );
			spot = spotFor( openButton, gui ) ?? spotFor( openButton, null );

		}

		spot ??= { right: EDGE, bottom: EDGE, height: window.innerHeight - EDGE * 2 };
		root.style.right = `${ spot.right }px`;
		root.style.bottom = `${ spot.bottom }px`;
		panel.style.maxHeight = `${ spot.height }px`;
		openButton.setAttribute( 'aria-expanded', String( ! folded ) );
		document.body.classList.toggle( 'legend-open', ! folded );

	}

	function show( box ) {

		panel.hidden = box !== panel;
		openButton.hidden = box !== openButton;

	}

	// Where `box` fits, as { right, bottom, height } (its insets from the right and the bottom and
	// the most height it has), clear of the P panel (`gui`) if given: at the right edge, else beside
	// the P panel; in full if it can, else squeezed (but not under MIN_HEIGHT). Null if neither.
	function spotFor( box, gui ) {

		const width = box.offsetWidth;
		const natural = box.scrollHeight;
		const sidebar = visibleRect( library );
		const leftLimit = sidebar && sidebar.top < 1 ? sidebar.right + GAP : EDGE;
		const rights = [ EDGE ];
		if ( gui ) rights.push( window.innerWidth - gui.left + GAP );
		const spots = rights
			.filter( right => window.innerWidth - right - width >= leftLimit || right === EDGE )
			.map( right => {

				const bottom = clearBelow( right, width );
				return { right, bottom, height: window.innerHeight - bottom - clearAbove( right, width, gui ) };

			} );
		return spots.find( spot => spot.height >= natural ) ?? spots.find( spot => spot.height >= Math.min( natural, MIN_HEIGHT ) ) ?? null;

	}

	// How far down (px from the top) the panel must start to clear the status readout and the P
	// panel above it, given its right inset and width.
	function clearAbove( right, width, gui ) {

		const left = window.innerWidth - right - width;
		const spans = [ visibleRect( document.getElementById( 'status' ) ), gui ]
			.filter( rect => rect && rect.right > left && rect.left < window.innerWidth - right );
		return Math.max( EDGE, ...spans.map( rect => rect.bottom + GAP ) );

	}

	// How high (px from the bottom) the panel must sit to clear what's at the bottom of the screen
	// under it, given its right inset and width.
	function clearBelow( right, width ) {

		const left = window.innerWidth - right - width;
		const spans = [ ...obstacles, ...document.querySelectorAll( '#attribution img, #attribution .credits' ) ]
			.map( visibleRect )
			.filter( rect => rect && rect.right > left && rect.left < window.innerWidth - right && rect.top > window.innerHeight / 3 );
		return Math.max( EDGE, ...spans.map( rect => window.innerHeight - rect.top + GAP ) );

	}

	// Refresh soon after anything that may change what you're doing.
	let pending = false;
	const soon = () => {

		if ( pending ) return;
		pending = true;
		requestAnimationFrame( () => {

			pending = false;
			update();

		} );

	};

	for ( const type of [ 'keydown', 'keyup', 'pointerup', 'click' ] ) window.addEventListener( type, soon, true );
	window.addEventListener( 'resize', soon );
	update();

	return { update, isOpen: () => open, setOpen };

}

// A short toast of the keys for a drive ('drive') or an excavator ('excavator'), when one starts.
export function showDrivingKeys( which ) {

	const toast = document.createElement( 'div' );
	toast.className = 'toast keys-toast';
	toast.innerHTML = ( which === 'excavator' ? EXCAVATOR : DRIVE )
		.map( ( [ chips, text ] ) => `<span>${ chipsHtml( chips ) } ${ escape( text.split( ',' )[ 0 ] ) }</span>` )
		.join( '' );
	document.body.append( toast );
	setTimeout( () => toast.remove(), KEYS_TOAST_TIME );

}

function chipsHtml( chips ) {

	return chips.map( chip => {

		if ( chip === '/' || chip === '+' ) return `<span class="sep">${ chip }</span>`;
		if ( chip.startsWith( '~' ) ) return `<span class="gesture">${ escape( chip.slice( 1 ) ) }</span>`;
		return `<kbd>${ escape( chip ) }</kbd>`;

	} ).join( '' );

}

function escape( text ) {

	return text.replace( /[&<>"]/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } )[ c ] );

}

// A fixed element's box on screen, or null while it isn't shown.
function visibleRect( element ) {

	if ( ! element || element.getClientRects().length === 0 ) return null;
	const rect = element.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0 ? rect : null;

}

// localStorage can throw in private windows; the panel still works without it.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
