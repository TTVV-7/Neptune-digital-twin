// The Controls panel, bottom right: the keys and mouse moves for what you're doing right now
// (walking, flying, the library, placing, drawing an area or a row, an item selected, driving, digging),
// changing as that changes. It folds away to a small Controls button; whether it's open is
// remembered in this browser. It opens by itself on a first visit, except on a phone, where it
// starts as the button. H (or its All controls button) opens the full help. The Show panel
// (layers.js) stands on top of it, in the same column (stack()), and is placed with it.

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
// Toasts (Undo, Before / After...) sit this high (px) off the bottom, in the middle (.toast in
// style.css), and are about this tall. They move left of the panels where the panels come down
// that far, if that leaves them at least TOAST_ROOM px, or else up over them if the panels are
// low down (their buttons, on a phone).
const TOAST_BOTTOM = 128;
const TOAST_HEIGHT = 64;
const TOAST_ROOM = 320;

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
// getLayers: the Show panel, once loaded. toggleHelp: shows or hides the full help.
export function createLegend( { controls, driver, models, getSidebar, getDriving, getLayers, toggleHelp } ) {

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
	// The panel standing on top of this one (stack()), as { root, panel, button, open, insist }.
	let other = null;

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
		const line = sidebar?.getLine();
		if ( line ) return lineRows( line );
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

	// Before / After (layers.js).
	function beforeRow() {

		return [ [ 'B' ], getLayers()?.before ? 'After: show your changes again' : 'Before: the site as Google captured it' ];

	}

	function walkRows() {

		return { title: 'Walking', rows: [
			[ [ 'W', 'A', 'S', 'D' ], 'Move · Shift runs' ],
			[ [ 'Space' ], 'Jump' ],
			[ [ 'F' ], 'Fly' ],
			...look(),
			...zoom,
			driveRow(),
			beforeRow(),
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
			beforeRow(),
			[ [ 'L' ], 'Library: place equipment' ],
		] };

	}

	function libraryRows() {

		return { title: 'Library', rows: [
			[ [ `~${ click }` ], 'An item, then the ground: place it' ],
			...mouse ? [ [ [ '~Drag' ], 'An item onto the map: place it' ] ] : [],
			[ [ `~${ click }` ], 'A tool, then drag on the ground: draw an area' ],
			[ [ '~Row' ], 'On a card: draw a line to place many' ],
			[ [ `~${ click }` ], 'Something placed: select it' ],
			[ [ '~Drag' ], 'Something placed: move it' ],
			...mouse ? [ [ [ '~Right-drag' ], 'Look around' ] ] : [],
			...zoom,
			[ [ 'W', 'A', 'S', 'D' ], 'Move' ],
			beforeRow(),
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

	// Drawing a row of items (rows.js): the line is clicked point by point.
	function lineRows( { name } ) {

		return { title: `Row: ${ name }`, rows: [
			[ [ `~${ click }` ], 'The ground: add a point, corners and all' ],
			[ [ `~${ click }` ], 'The first point again: close the loop' ],
			[ [ '~Drag' ], 'From the first point: a straight row' ],
			[ mouse ? [ '~Double-click', '/', 'Enter' ] : [ '~Done' ], 'Finish' ],
			[ mouse ? [ 'Backspace' ] : [ '~Undo point' ], 'Take the last point back' ],
			[ [ 'Esc' ], 'Cancel' ],
			...mouse ? [ [ [ '~Right-drag' ], 'Look around' ] ] : [],
			...zoom,
		], note: 'Spacing, line-up and ends are in the panel at the top.' };

	}

	function selectedRows( entry ) {

		// What its handles and toolbar (handles.js, toolbar.js) offer: areas, pits and piles (kinds
		// with `resize`) have a size to change and a pit a depth; a round pile doesn't turn. Kept
		// short, as the panel can cover the item's handles: R and Delete are on the buttons' tips.
		const kind = getKind( entry.kind );
		const shape = resizeShape( kind, entry.params );
		const turns = shape !== 'circle';
		const drivable = getDriving()?.isDrivable( entry );
		// Buttons other modules add (a row's Break apart, rows.js), as the toolbar shows them.
		const extras = getSidebar()?.toolbar.labels( entry ) ?? [];
		const buttons = [ turns && 'rotate', shape && 'size', drivable && 'drive', ...extras.map( text => text.toLowerCase() ), 'edit', 'hide', 'delete' ].filter( Boolean );
		const points = shape === 'points';
		return { title: `Selected: ${ entry.state.name ?? '' }`, rows: [
			[ [ '~Drag' ], 'Move it' ],
			...turns ? [ [ [ '~Drag' ], 'The round handle: rotate' ] ] : [],
			...points ? [
				[ [ '~Drag' ], 'A dot: move that point of the line' ],
				[ [ '~Drag' ], 'A plus: add a point there (or click it)' ],
				[ [ mouse ? '~Double-click' : '~Double-tap' ], 'A dot: take that point out' ],
			] : shape ? [ [ [ '~Drag' ], shape === 'rect' ? 'The square handles: resize' : 'The square handle: resize' ] ] : [],
			...kind?.resize?.depth ? [ [ [ '~Drag' ], 'The arrow in the middle: depth' ] ] : [],
			[ [ `~${ click }` ], `The buttons above it: ${ buttons.join( ', ' ) }` ],
			[ [ 'P' ], points ? 'Spacing, item and position' : shape ? 'Exact size and position' : 'Exact position' ],
			...drivable ? [ [ [ 'V' ], 'Drive it' ] ] : [],
			[ [ 'Esc' ], 'Deselect' ],
		] };

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
	// below or beside the P panel, with the other panel (the Show panel) on top of it in the same
	// column. Where there's no room for both, the other folds to its button first, then this one.
	// One opened by hand stays open over the P panel instead, until there's room again. On a phone
	// both fold while the library, a sheet over the bottom half there, is open: they would cover
	// most of the map left to place things on.
	function place() {

		const gui = visibleRect( document.querySelector( '.lil-gui.lil-root' ) );
		const sheet = visibleRect( library );
		const sheetUp = !! sheet && sheet.top > 1;
		const stacked = other && ! other.root.hidden ? other : null;
		const wanted = [ open, !! stacked?.open ];
		const tries = [ wanted, [ wanted[ 0 ], false ], [ false, wanted[ 1 ] ], [ false, false ] ]
			.filter( ( [ a, b ], i, all ) => ! ( sheetUp && ( a || b ) ) && all.findIndex( ( [ c, d ] ) => c === a && d === b ) === i );
		let column = null;
		for ( const [ a, b ] of tries ) {

			column = arrange( a, b, stacked, gui );
			if ( column ) break;

		}

		if ( column?.open[ 0 ] ) insist = false;
		if ( column?.open[ 1 ] ) stacked.insist = false;
		const forced = [ open && insist, !! stacked?.open && stacked.insist ];
		if ( forced.some( ( force, i ) => force && ! column?.open[ i ] ) ) {

			column = arrange( forced[ 0 ] || !! column?.open[ 0 ], forced[ 1 ] || !! column?.open[ 1 ], stacked, null ) ?? column;

		}

		column ??= arrange( false, false, stacked, gui ) ?? arrange( false, false, stacked, null );
		column ??= { ...arrange( false, false, stacked, null, true ), spot: { right: EDGE, bottom: EDGE, height: window.innerHeight - EDGE * 2 } };

		// Each panel gets the height it needs where there's room, else its least and a share of the rest.
		const { spot, sizes } = column;
		display( ...column.open, stacked );
		const least = sizes.reduce( ( sum, size ) => sum + size.least, 0 );
		const need = sizes.reduce( ( sum, size ) => sum + size.natural - size.least, 0 );
		const spare = Math.max( 0, spot.height - GAP * ( sizes.length - 1 ) - least );
		const share = need > 0 ? Math.min( 1, spare / need ) : 1;
		const heights = sizes.map( size => Math.floor( size.least + ( size.natural - size.least ) * share ) );
		root.style.right = `${ spot.right }px`;
		root.style.bottom = `${ spot.bottom }px`;
		panel.style.maxHeight = `${ heights[ 0 ] }px`;
		const folded = ! column.open[ 0 ];
		openButton.setAttribute( 'aria-expanded', String( ! folded ) );
		document.body.classList.toggle( 'legend-open', ! folded );
		if ( stacked ) {

			stacked.panel.style.maxHeight = `${ heights[ 1 ] }px`;
			stacked.root.style.right = `${ spot.right }px`;
			stacked.root.style.bottom = `${ spot.bottom + root.offsetHeight + GAP }px`;
			stacked.button.setAttribute( 'aria-expanded', String( column.open[ 1 ] ) );

		}

		clearToasts( stacked );

	}

	// Beside the P panel the column stands in from the right, where a toast in the middle of the
	// screen (the Undo after Hide or Delete) would cover it: toasts are then centred in the space
	// to its left (--toast-right in style.css), where there's room for them. On a phone, where
	// there isn't, they go up over the panels' buttons (--toast-bottom) rather than on them.
	function clearToasts( stacked ) {

		const top = window.innerHeight - TOAST_BOTTOM - TOAST_HEIGHT;
		const bottom = window.innerHeight - TOAST_BOTTOM;
		const rects = [ root, stacked?.root ]
			.map( visibleRect )
			.filter( rect => rect && rect.top < bottom && rect.bottom > top );
		const style = document.documentElement.style;
		style.removeProperty( '--toast-right' );
		style.removeProperty( '--toast-bottom' );
		if ( rects.length === 0 ) return;
		const right = window.innerWidth - Math.min( ...rects.map( rect => rect.left ) ) + GAP;
		const above = Math.min( ...rects.map( rect => rect.top ) );
		if ( window.innerWidth - right - EDGE >= TOAST_ROOM ) style.setProperty( '--toast-right', `${ right }px` );
		else if ( above > window.innerHeight / 2 ) style.setProperty( '--toast-bottom', `${ window.innerHeight - above + GAP }px` );

	}

	// The column with this panel open or folded to its button (a), and the other panel on top of it
	// (b), if there's a spot for it clear of the P panel (`gui`, if given; any spot if `anyway`): as
	// { spot, sizes: [ { natural, least } ] (heights in px), open: [ a, b ] }, or null.
	function arrange( a, b, stacked, gui, anyway = false ) {

		const boxes = display( a, b, stacked );

		// A panel can be squeezed down to MIN_HEIGHT (it scrolls); a button can't.
		const sizes = boxes.map( box => {

			const natural = box.scrollHeight;
			return { natural, least: box === panel || box === stacked?.panel ? Math.min( natural, MIN_HEIGHT ) : natural };

		} );
		const gaps = GAP * ( boxes.length - 1 );
		const sum = key => sizes.reduce( ( total, size ) => total + size[ key ], gaps );
		const spot = anyway ? null : spotFor( Math.max( ...boxes.map( box => box.offsetWidth ) ), sum( 'natural' ), sum( 'least' ), gui );
		return spot || anyway ? { spot, sizes, open: [ a, b ] } : null;

	}

	// Show each panel or its button, as a and b say; returns what's shown, bottom first.
	function display( a, b, stacked ) {

		panel.hidden = ! a;
		openButton.hidden = a;
		if ( ! stacked ) return [ a ? panel : openButton ];
		stacked.panel.hidden = ! b;
		stacked.button.hidden = b;
		return [ a ? panel : openButton, b ? stacked.panel : stacked.button ];

	}

	// Where a column `width` wide fits, as { right, bottom, height } (its insets from the right and
	// the bottom and the most height it has), clear of the P panel (`gui`) if given: at the right
	// edge, else beside the P panel; `natural` high if it can, else squeezed (but not under
	// `least`). Null if neither.
	function spotFor( width, natural, least, gui ) {

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
		return spots.find( spot => spot.height >= natural ) ?? spots.find( spot => spot.height >= least ) ?? null;

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

	return {
		update,
		isOpen: () => open,
		setOpen,
		// Another panel to stand on top of this one (see `other` above).
		stack( value ) {

			other = value;
			update();

		},
	};

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
