import {
	Box3,
	BoxHelper,
	BufferGeometry,
	LineBasicMaterial,
	LineDashedMaterial,
	LineLoop,
	DirectionalLight,
	HemisphereLight,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';
import { itemConfig } from './library.js';
import { buildProcedural } from './procedural.js';
import { localToEnu } from './geo.js';
import { isTyping, passesHitFilters } from './walk.js';
import { setFromView } from './view-ray.js';
import { ZONE_ID, defaultGrade, defaultSurface } from './flatten.js';
import { availableSets, memberPlacement } from './sets.js';
import { getKind } from './kinds.js';
import { createHandles, toScreen } from './handles.js';
import { createToolbar } from './toolbar.js';
import { createHistory } from './history.js';
import { createEditBar } from './edit-bar.js';
import { clipboardOf, clipboardText, libraryIdsOf, middleOf, parseClipboard, pastedConfig, readStoredClipboard, storeClipboard } from './clipboard.js';
import { resolveItem } from './layout.js';
import { toast } from './placement.js';
import { BUILD_APP } from './product.js';
import { canRaise, createRaising } from './raise.js';

const ROTATE_STEP = 15;
// The wheel turns what's being placed or moved by ROTATE_STEP per notch of a mouse wheel; a
// trackpad's small steps add up to one every WHEEL_STEP pixels.
const WHEEL_NOTCH = 40;
const WHEEL_STEP = 80;
const DRAG_TYPE = 'application/x-library-item';
// A press that moves less than this many pixels (a finger: TOUCH_SLOP) is a click, not a drag.
const CLICK_SLOP = 5;
const TOUCH_SLOP = 12;
// Drawing a line, a second click this soon (ms) where the last one was finishes it.
const DOUBLE_CLICK = 400;
// A first press dragged this far (pixels; a finger: twice as far) is a straight line at once, and
// less is a click, so that a shaky first click doesn't end the line before it's begun.
const LINE_DRAG = 24;
// The pointer this close to the first point (pixels; a finger: twice that) is on it: a click there
// closes the line into a loop.
const CLOSE_RADIUS = 12;
// Several selected together: their outlines (one box each), and at most this many of them.
const GROUP_COLOR = 0xffb02e;
const MAX_OUTLINES = 300;
// Duplicating puts the copies this far east and south (metres), and pasting again where the last
// paste went steps each one on as far again, so they don't land exactly on top of each other.
const PASTE_STEP = 2;
// Ctrl/Cmd+V waits this long (ms) for the browser's paste event, which brings what's on the system
// clipboard, before pasting what this browser keeps.
const PASTE_WAIT = 60;
// Why a Pro item copied by someone with Pro isn't pasted for someone without.
const BUILD_PRO_SAYING = BUILD_APP ? 'they need Build Pro' : 'they\'re in the Pro equipment pack';
// A phone: the library is a sheet over the bottom of the screen there (style.css).
const PHONE = window.matchMedia( '( max-width: 700px )' );
// The padlock on a locked premium item's Pro badge.
const LOCK_ICON = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3.5 5.5V3.5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="5.5" width="8" height="6" rx="1" fill="currentColor"/></svg>';
// Three in a line, on the Row button of a card.
const ROW_ICON = '<svg viewBox="0 0 14 10" width="13" height="9" aria-hidden="true"><path d="M1 8.5h12" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5"/><rect x="1" y="3" width="3" height="4" rx="0.6" fill="currentColor"/><rect x="5.5" y="3" width="3" height="4" rx="0.6" fill="currentColor"/><rect x="10" y="3" width="3" height="4" rx="0.6" fill="currentColor"/></svg>';

const _ndc = new Vector2();
const _offset = new Vector3();
const _size = new Vector3();
const _center = new Vector3();
const _box = new Box3();

// The library sidebar (L): pick an item and click the ground to place it, or drag it onto the
// scene. A see-through preview follows the mouse; R or the wheel rotates it, Esc cancels and
// Shift+click keeps placing more of the same. Placed items can be clicked to select, dragged to
// move, turned with R and removed with Delete. Tools at the top (addTool) draw areas or pick
// points on the ground instead: flatten areas, and whatever other modules add. The selected item
// has handles on the map to turn and resize it (handles.js) and a toolbar over it (toolbar.js).
//
// Premium items (library.json "premium": true) can be locked by a gate (setGate, from premium.js):
// their cards show a Pro badge, and picking one asks the gate instead of placing it. Only picking
// new ones is gated; placed items, and layouts that have them, load as always.
//
// Each card can also have a Row button (setRowMaker, from rows.js), which places a row of the item
// along a line drawn on the ground: startLine() draws the line, clicking point after point.
//
// Several things can be selected together: Shift+click (or Ctrl/Cmd+click) adds or takes out one,
// Shift+drag on the ground (or a drag with the edit bar's Select on) selects everything in the box,
// Ctrl/Cmd+A everything shown, Esc nothing. They're outlined, moved together by dragging any of
// them, turned together about their middle (the ring's knob, R, the toolbar), hidden and deleted
// together; the P panel has them as "N items". Copy, Cut, Paste and Duplicate (Ctrl/Cmd+C, X, V,
// D, and the edit bar's buttons) work on what's selected, through clipboard.js, and moving,
// turning, resizing, deleting, cutting, pasting and duplicating are steps to undo and redo
// (Ctrl/Cmd+Z, Shift+Z or Ctrl+Y; history.js).
export function createSidebar( { library, models, layout, scene, camera, canvas, controls, getGround, getPlayer, panel, isDriving, onError } ) {

	const root = document.getElementById( 'library' );
	const toggle = document.getElementById( 'library-toggle' );
	const list = root.querySelector( '.items' );
	const search = root.querySelector( 'input[type=search]' );
	const count = root.querySelector( '.count' );
	const raycaster = new Raycaster();
	const highlight = new BoxHelper( undefined, 0x3d9be9 );
	highlight.visible = false;
	scene.add( highlight );

	let open = false;
	let placing = null; // { item, entry, heading, cancelled }
	let selected = null;
	// Everything selected: [ selected ] or [], or several (selected is then the one picked last).
	let selection = [];
	// Several selected: one stand-in for them all, for the handles and the toolbar (see makeGroup).
	let group = null;
	const outlines = [];
	// Each of several selected's box in the scene, and round them all: worked out again only when
	// one has changed (models' 'change'), not every frame, as a few hundred selected would be slow.
	const memberBoxes = new Map();
	const groupBox = new Box3();
	let groupStale = true;
	// A box being dragged out to select what's in it: { start: { x, y }, end, add, element, pointerId }.
	let boxing = null;
	// The edit bar's Select: a drag on the ground selects a box, without Shift.
	let boxMode = false;
	// Where the last paste went ({ east, north, step }), so pasting there again steps aside.
	let lastPaste = null;
	// Ctrl/Cmd+V waiting for the browser's paste event: { timer, at }.
	let pasting = null;
	// What Ctrl/Cmd+C or X has just copied, for the copy event to put on the system clipboard.
	let copying = null;
	// This tab's clipboard, should the browser not keep it (clipboard.js).
	let clipboard = null;
	let dragging = null; // { entry, offset, press, slop, moved }
	let suppressClick = false;
	let pointer = null; // last pointer position over the scene, in client pixels
	let drawing = null; // { tool, start, heading, outline } while a tool is in use; a line: { tool, points, press, click, cursor }
	let gate = null; // { isLocked( item ), onLocked( item ) }
	let rowMaker = null; // item => starts a row of it (rows.js)
	let wheel = 0; // trackpad scrolling not yet turned into a turn, in pixels

	// Undo and redo (Ctrl/Cmd+Z, Shift+Z or Ctrl+Y; history.js): moves, turns, deletes, pastes, and
	// raising and lowering flatten areas (raise.js) by the arrow, the keys or the P panel.
	const history = createHistory( { models, onError } );
	const raising = createRaising( { models, history } );
	panel.onChangeParams = ( entry, patch, label ) => raising.change( entry, patch, label );
	// Another layout opened in this one's place (a project, a shared one): its steps would put the
	// old one's items into it, so they go, with what was selected and where the last paste went.
	layout.onReplace?.( () => {

		history.clear();
		lastPaste = null;
		select( null );

	} );
	// What a handle (turn, resize, a row's points) was pressed on, as it was then: a step once let go.
	let handleStart = null;
	const handles = createHandles( {
		scene,
		camera,
		canvas,
		models,
		onRaised: ( entry, before, after ) => raising.record( entry, before, after ),
		onPress: target => {

			const members = target.group ? target.members : [ target ];
			if ( target.group ) target.base = groupBase( target );
			handleStart = { target, members, before: members.map( stateOf ) };

		},
		onEnd: target => {

			if ( handleStart?.target !== target ) return;
			const { members, before } = handleStart;
			handleStart = null;
			if ( target.group ) target.base = null;
			recordTransform( target.group ? `turn ${ members.length } items` : `change ${ target.state.name }`, members, before );

		},
	} );
	const vehicles = new Set( library.filter( item => item.category === 'Vehicles' || item.drive ).map( item => item.id ) );
	const toolbar = createToolbar( {
		camera,
		canvas,
		models,
		panel,
		select: entry => select( entry ),
		rotate: degrees => rotateSelected( degrees ),
		drive,
		canDrive: entry => vehicles.has( entry.library ),
		hide: entry => models.setHidden( entry, true ),
		deleteItems: entries => deleteItems( entries ),
		copy: () => copySelection(),
		duplicate: () => duplicateSelection(),
		edit: target => target.group ? showGroupPanel( true ) : panel.focus( target, true ),
	} );
	// The P panel's Remove deletes as the toolbar does, with Undo, so a misclick there isn't final.
	panel.onRemove = entry => toolbar.remove( entry );
	const editBar = createEditBar( {
		toggleBox: () => setBoxMode( ! boxMode ),
		copy: () => copySelection(),
		cut: () => cutSelection(),
		paste: () => paste( null ),
		duplicate: () => duplicateSelection(),
		undo: () => history.undo(),
		redo: () => history.redo(),
	} );

	// --- the list ------------------------------------------------------------------------

	// Tools come first, in their own group, then the library by category.
	const toolsHeading = document.createElement( 'h3' );
	toolsHeading.textContent = 'Tools';
	const toolCards = document.createElement( 'div' );
	toolCards.className = 'tools';
	list.append( toolsHeading, toolCards );

	// A tool card. spec:
	//   name, hint (shown under the name), title (tooltip), icon (SVG markup, 64 x 64 viewBox)
	//   mode: 'rect' to drag out a rectangle lined up with the way you're looking (a click without
	//         a drag makes one defaultSize = [ width, length ] in metres), 'point' to click a spot,
	//         or 'custom' for a tool that takes the presses itself (markups.js): onStart() when it's
	//         picked, onPress( e ) and onMove( e ) with the scene's pointer events, onCancel() when
	//         it ends (Esc, another tool, or cancelDrawing() once it has done its work)
	//   color: outline colour while dragging
	//   onDone( shape ): called with { east, north, height, heading, width, length, dragged } (just
	//         east/north/height/heading for 'point'); may return a placed entry (or a promise of
	//         one), which is then selected.
	function addTool( spec ) {

		const card = document.createElement( 'button' );
		card.type = 'button';
		card.className = 'card tool';
		card.title = spec.title ?? spec.hint ?? '';
		const icon = document.createElement( 'img' );
		icon.alt = '';
		icon.src = 'data:image/svg+xml,' + encodeURIComponent( spec.icon );
		const name = document.createElement( 'span' );
		name.className = 'name';
		name.textContent = spec.name;
		const hint = document.createElement( 'span' );
		hint.className = 'dims';
		hint.textContent = spec.hint ?? '';
		card.append( icon, name, hint );
		const tool = { ...spec, mode: spec.mode ?? 'rect', card };
		card.addEventListener( 'click', () => startDrawing( tool ) );
		toolCards.append( card );
		return tool;

	}

	// The flatten tool clears Google's mesh (rail cars, trucks, sheds) from an area.
	addTool( {
		name: 'Flatten area',
		hint: 'Drag a rectangle to clear it and lay gravel, rock, asphalt or concrete',
		title: 'Drag a rectangle on the ground; everything in Google\'s 3D map inside it is pressed flat and surfaced (gravel to start), graded to follow the ground\'s slope with batters at its edges (make it level, one slope, crowned or terraced in the P panel)',
		icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M6 46h52" stroke="#8a8f86" stroke-width="3"/><rect x="14" y="30" width="18" height="16" fill="#8e3b2a" opacity=".45"/><rect x="34" y="34" width="16" height="12" fill="#2a4f8e" opacity=".45"/><rect x="10" y="20" width="44" height="28" fill="#ff5544" fill-opacity=".2" stroke="#ff3322" stroke-width="2.5" stroke-dasharray="5 3"/><path d="M32 8v10m-5-5 5 5 5-5" stroke="#eef2f5" stroke-width="2.5" fill="none"/></svg>',
		mode: 'rect',
		color: 0xff3322,
		onDone: ( { east, north, heading, width, length } ) => models.load( {
			kind: ZONE_ID,
			params: { width, length, surface: defaultSurface(), grade: defaultGrade() },
			east,
			north,
			heading,
			up: null,
		} ),
	} );

	for ( const item of library.filter( i => i.procedural ) ) item.dimensions = measure( buildProcedural( item.id ) );

	let category = null;
	const cards = [];

	// Sets come next, before the library: a few items that go together, placed in one go (sets.js).
	const sets = availableSets( library );
	if ( sets.length ) {

		const heading = document.createElement( 'h3' );
		heading.textContent = 'Sets';
		list.append( heading );

	}

	for ( const set of sets ) {

		const card = document.createElement( 'button' );
		card.type = 'button';
		card.className = 'card set';
		card.dataset.set = set.id;
		card.title = `Places ${ set.members.length } items together: ${ set.names.join( ', ' ) }. Each can then be moved or deleted on its own.`;
		// Up to four of its pieces' pictures, as a grid.
		const thumbs = document.createElement( 'span' );
		thumbs.className = 'set-thumbs';
		for ( const piece of [ ...new Set( set.members.map( m => m.libraryItem ) ) ].filter( i => i.thumb ).slice( 0, 4 ) ) {

			const img = document.createElement( 'img' );
			img.alt = '';
			img.loading = 'lazy';
			img.src = new URL( `library/${ piece.thumb }`, document.baseURI ).href;
			thumbs.append( img );

		}

		const name = document.createElement( 'span' );
		name.className = 'name';
		name.textContent = set.name;
		const dims = document.createElement( 'span' );
		dims.className = 'dims';
		dims.textContent = `${ set.members.length } items · about ${ Math.max( set.dimensions.width, set.dimensions.length ) } × ${ Math.min( set.dimensions.width, set.dimensions.length ) } m`;
		card.append( thumbs, name, dims );
		// A set with a locked piece (premium.js) is locked: picking it says what unlocks it.
		card.addEventListener( 'click', () => {

			const locked = set.members.find( m => isLocked( m.libraryItem ) );
			if ( locked ) pickLocked( locked.libraryItem );
			else startPlacingSet( set );

		} );
		list.append( card );
		cards.push( { card, item: { id: set.id, name: set.name, category: 'Sets', keywords: `${ set.keywords } ${ set.names.join( ' ' ) }` }, thumb: null, badge: null, row: null } );

	}

	for ( const item of library ) {

		if ( item.category !== category ) {

			category = item.category;
			const heading = document.createElement( 'h3' );
			heading.textContent = category;
			list.append( heading );

		}

		const card = document.createElement( 'button' );
		card.type = 'button';
		card.className = 'card';
		card.dataset.item = item.id;
		card.draggable = true;
		card.title = item.source ? `${ item.source.title } by ${ item.source.author } (${ item.source.license })` : item.own ? 'Our own model' : 'Built in';
		const thumb = document.createElement( 'img' );
		thumb.alt = '';
		thumb.loading = 'lazy';
		if ( item.thumb ) thumb.src = new URL( `library/${ item.thumb }`, document.baseURI ).href;
		const name = document.createElement( 'span' );
		name.className = 'name';
		name.textContent = item.name;
		const dims = document.createElement( 'span' );
		dims.className = 'dims';
		const d = item.dimensions;
		// Longest side first, whichever way the item faces.
		dims.textContent = d ? `${ Math.max( d.length, d.width ) } × ${ Math.min( d.length, d.width ) } × ${ d.height } m` : '';
		card.append( thumb, name, dims );
		// Inside the card, so it lines up with it in the grid; its click doesn't reach the card's.
		let row = null;
		if ( ! item.kind ) {

			row = document.createElement( 'span' );
			row.className = 'row-chip';
			row.innerHTML = `${ ROW_ICON }Row`;
			row.title = 'A row of these: draw a line on the ground, and they\'re placed along it, end to end or spaced as you choose';
			row.hidden = true;
			row.addEventListener( 'click', e => {

				e.stopPropagation();
				if ( isLocked( item ) ) pickLocked( item );
				else rowMaker?.( item );

			} );
			card.append( row );

		}

		let badge = null;
		if ( item.premium ) {

			badge = document.createElement( 'span' );
			badge.className = 'pro';
			badge.innerHTML = `${ LOCK_ICON }Pro`;
			badge.hidden = true;
			card.append( badge );

		}

		card.addEventListener( 'click', () => {

			if ( isLocked( item ) ) pickLocked( item );
			else startPlacing( item );

		} );
		card.addEventListener( 'dragstart', e => {

			if ( isLocked( item ) ) {

				e.preventDefault();
				pickLocked( item );
				return;

			}

			e.dataTransfer.setData( DRAG_TYPE, item.id );
			e.dataTransfer.effectAllowed = 'copy';
			startPlacing( item, { fromDrag: true } );

		} );
		card.addEventListener( 'dragend', () => {

			// Dropped somewhere other than the scene.
			if ( placing?.fromDrag ) cancelPlacing();

		} );
		list.append( card );
		cards.push( { card, item, thumb, badge, row } );

	}

	search.addEventListener( 'input', () => {

		const query = search.value.trim().toLowerCase();
		// Every word has to match somewhere, so "tridem dump" finds the tridem dump truck.
		const words = query.split( /\s+/ ).filter( Boolean );
		for ( const { card, item } of cards ) {

			const text = `${ item.name } ${ item.category } ${ item.keywords ?? '' }`.toLowerCase();
			card.hidden = words.length > 0 && ! words.every( word => text.includes( word ) );

		}
		for ( const heading of list.querySelectorAll( 'h3' ) ) {

			let next = heading.nextElementSibling;
			let any = false;
			while ( next && next.tagName !== 'H3' ) {

				any ||= ! next.hidden;
				next = next.nextElementSibling;

			}

			heading.hidden = ! any;

		}

	} );

	const hint = document.getElementById( 'hint' );
	const walkHint = hint.innerHTML;
	const editHint = 'Click an item to select it, drag to move &middot; drag its handles to turn or resize &middot; right-drag to look &middot; <b>L</b> closes';

	let thumbnailsRendered = false;
	function setOpen( value ) {

		open = value;
		root.hidden = ! open;
		hint.innerHTML = open ? editHint : walkHint;
		models.setBuildMode( open );
		toggle.setAttribute( 'aria-expanded', String( open ) );
		document.body.classList.toggle( 'library-open', open );
		if ( open ) {

			document.exitPointerLock?.();
			if ( ! thumbnailsRendered ) {

				thumbnailsRendered = true;
				renderThumbnails( cards.filter( c => c.item.procedural ) );

			}

		} else {

			cancelPlacing();
			cancelDrawing();
			// What only shows with the library open (an excavation, say) doesn't stay selected out of
			// sight, with its keys in the Controls panel and Delete removing it unseen.
			if ( selection.length > 1 ) setSelection( selection.filter( e => isVisible( e.pivot ) ), selected );
			else if ( selected && ! isVisible( selected.pivot ) ) select( null );
			setBoxMode( false );

		}

	}

	toggle.addEventListener( 'click', () => setOpen( ! open ) );
	root.querySelector( '.close' ).addEventListener( 'click', () => setOpen( false ) );
	root.querySelector( '.export' ).addEventListener( 'click', () => layout.export() );
	root.querySelector( '.clear' ).addEventListener( 'click', () => {

		if ( window.confirm( 'Remove every library item you have placed?' ) ) layout.clear();

	} );
	const fileInput = root.querySelector( 'input[type=file]' );
	root.querySelector( '.import' ).addEventListener( 'click', () => fileInput.click() );
	fileInput.addEventListener( 'change', () => {

		if ( fileInput.files[ 0 ] ) layout.import( fileInput.files[ 0 ] );
		fileInput.value = '';

	} );

	// A row of items counts as its copies.
	const updateCount = () => {

		const n = models.entries.filter( e => e.library && ! e.placing && ! e.inConfig ).reduce( ( sum, e ) => sum + ( getKind( e.kind )?.count?.( e ) ?? 1 ), 0 );
		count.textContent = n === 1 ? '1 item placed' : `${ n } items placed`;

	};

	models.addEventListener( 'add', updateCount );
	models.addEventListener( 'change', ( { entry } ) => {

		if ( getKind( entry.kind )?.count ) updateCount();

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		if ( selection.length > 1 && selection.includes( entry ) ) setSelection( selection.filter( e => e !== entry ), selected === entry ? null : selected );
		else if ( entry === selected ) select( null );
		// The preview was removed some other way, e.g. from the P panel.
		if ( entry === placing?.entry ) {

			placing = null;
			root.classList.remove( 'placing' );

		}

		updateCount();

	} );
	updateCount();
	// One of several selected moved, turned, resized or went: its box and theirs are measured again.
	for ( const type of [ 'change', 'remove' ] ) models.addEventListener( type, ( { entry } ) => {

		if ( memberBoxes.delete( entry ) ) groupStale = true;

	} );
	models.addEventListener( 'buildmode', () => {

		memberBoxes.clear();
		groupStale = true;

	} );
	// Hidden things can't stay selected (the Show panel, the toolbar's Hide, Before).
	models.addEventListener( 'visibility', () => {

		memberBoxes.clear();
		groupStale = true;
		if ( selection.length > 1 && selection.some( e => models.isHidden( e ) ) ) setSelection( selection.filter( e => ! models.isHidden( e ) ), selected );
		else if ( selected && models.isHidden( selected ) ) select( null );

	} );

	// --- premium items -------------------------------------------------------------------

	function isLocked( item ) {

		return !! item.premium && !! gate?.isLocked( item );

	}

	function pickLocked( item ) {

		cancelPlacing();
		cancelDrawing();
		select( null );
		gate.onLocked( item );

	}

	// The Row buttons on the cards start a row of their item with maker( item ).
	function setRowMaker( maker ) {

		rowMaker = maker;
		for ( const { row } of cards ) if ( row ) row.hidden = ! maker;

	}

	// null unlocks everything, as it is without premium.
	function setGate( value ) {

		gate = value;
		for ( const { card, item, badge } of cards ) {

			if ( ! badge ) continue;
			const locked = isLocked( item );
			badge.hidden = ! locked;
			card.classList.toggle( 'locked', locked );

		}

	}

	// --- placing -------------------------------------------------------------------------

	async function startPlacing( item, { fromDrag = false, heading } = {} ) {

		// Placing takes over from a tool in use, as a tool takes over from placing; otherwise the
		// tool would take the click meant to place the item.
		cancelDrawing();
		cancelPlacing();
		select( null );
		document.exitPointerLock?.();
		const player = getPlayer();
		// Face the player by default, so you see the front of what you place.
		const state = { item, entry: null, heading: heading ?? ( player.heading + 180 ) % 360, fromDrag, cancelled: false };
		placing = state;
		root.classList.add( 'placing' );

		const ahead = Math.max( item.dimensions?.length ?? 4, item.dimensions?.width ?? 0 ) / 2 + 6;
		const rad = player.heading * Math.PI / 180;
		const start = pointer && groundPoint( pointer.x, pointer.y );
		const { east, north } = start ? localToEnu( start ) : { east: player.east + Math.sin( rad ) * ahead, north: player.north + Math.cos( rad ) * ahead };

		try {

			const entry = await models.load( { ...itemConfig( item, { east, north, heading: state.heading } ), placing: true } );
			if ( state.cancelled ) {

				models.remove( entry );
				return;

			}

			state.entry = entry;
			setGhost( entry, true );
			if ( pointer ) followPointer();

		} catch ( err ) {

			if ( placing === state ) placing = null;
			root.classList.remove( 'placing' );
			onError( `Could not load ${ item.name }: ${ err.message }` );

		}

	}

	// A set (sets.js): all its pieces load as see-through previews and follow the pointer
	// together, turned about the set's middle; a click puts them all down as separate items.
	async function startPlacingSet( set, { heading } = {} ) {

		cancelDrawing();
		cancelPlacing();
		select( null );
		document.exitPointerLock?.();
		const player = getPlayer();
		const state = { item: set, set, entry: null, members: [], heading: heading ?? ( player.heading + 180 ) % 360, fromDrag: false, cancelled: false };
		placing = state;
		root.classList.add( 'placing' );

		const ahead = Math.max( set.dimensions.length, set.dimensions.width ) / 2 + 8;
		const rad = player.heading * Math.PI / 180;
		const start = pointer && groundPoint( pointer.x, pointer.y );
		const { east, north } = start ? localToEnu( start ) : { east: player.east + Math.sin( rad ) * ahead, north: player.north + Math.cos( rad ) * ahead };
		state.middle = { east, north };

		const results = await Promise.allSettled( set.members.map( member => models.load( {
			...itemConfig( member.libraryItem, memberPlacement( member, east, north, state.heading ) ),
			placing: true,
		} ) ) );
		const loaded = results.flatMap( ( r, i ) => r.status === 'fulfilled' ? [ { entry: r.value, member: set.members[ i ] } ] : [] );
		if ( state.cancelled ) {

			for ( const { entry } of loaded ) models.remove( entry );
			return;

		}

		const failed = results.filter( r => r.status === 'rejected' );
		if ( failed.length ) onError( `Could not load ${ failed.length } of the set's items: ${ failed[ 0 ].reason?.message ?? failed[ 0 ].reason }` );
		if ( loaded.length === 0 ) {

			if ( placing === state ) placing = null;
			root.classList.remove( 'placing' );
			return;

		}

		state.members = loaded;
		state.entry = loaded[ 0 ].entry;
		for ( const { entry } of loaded ) setGhost( entry, true );
		if ( pointer ) followPointer();

	}

	// The set's pieces where they stand round its middle, as it's turned now.
	function arrangeSet() {

		const { middle, heading, members } = placing;
		for ( const { entry, member } of members ) {

			const at = memberPlacement( member, middle.east, middle.north, heading );
			Object.assign( entry.state, at );
			models.apply( entry );

		}

	}

	function followPointer() {

		const { entry } = placing ?? {};
		if ( ! entry || ! pointer ) return;
		if ( placing.set ) {

			const point = groundPoint( pointer.x, pointer.y, placing.members.map( m => m.entry.pivot ) );
			if ( ! point ) return;
			placing.middle = localToEnu( point );
			arrangeSet();
			return;

		}

		const point = groundPoint( pointer.x, pointer.y, entry.pivot );
		if ( point ) models.moveTo( entry, point );

	}

	function rotatePlacing( degrees ) {

		if ( ! placing ) return;
		placing.heading = ( placing.heading + degrees + 360 ) % 360;
		if ( placing.set ) {

			if ( placing.entry ) arrangeSet();

		} else if ( placing.entry ) {

			placing.entry.state.heading = placing.heading;
			models.apply( placing.entry );

		}

	}

	function commitPlacing( keepPlacing, touch = false ) {

		const { entry, item, heading, set, members } = placing ?? {};
		if ( ! entry ) return;
		placing = null;
		root.classList.remove( 'placing' );
		for ( const placed of set ? members.map( m => m.entry ) : [ entry ] ) {

			placed.placing = false;
			setGhost( placed, false );
			models.apply( placed );

		}

		updateCount();
		if ( set ) {

			// Shift+click puts down another set; otherwise its first piece is selected.
			if ( keepPlacing ) startPlacingSet( set, { heading } );
			else select( entry, touch );
			return;

		}

		// Shift+click places another, unless it has been locked meanwhile (signed out, say).
		if ( keepPlacing && ! isLocked( item ) ) startPlacing( item, { heading } );
		else select( entry, touch );

	}

	function cancelPlacing() {

		if ( ! placing ) return;
		placing.cancelled = true;
		if ( placing.set ) for ( const { entry } of placing.members ) models.remove( entry );
		else if ( placing.entry ) models.remove( placing.entry );
		placing = null;
		root.classList.remove( 'placing' );

	}

	// See-through while it follows the mouse; materials are cloned because built-in pieces share them.
	// What's already more see-through (glass, a tower crane's reach circle) stays as it was.
	function setGhost( entry, on ) {

		entry.pivot.traverse( object => {

			if ( ! object.isMesh ) return;
			if ( on ) {

				object.userData.solidMaterial = object.material;
				object.material = [ object.material ].flat().map( m => Object.assign( m.clone(), { transparent: true, opacity: Math.min( m.opacity, 0.55 ) } ) );
				if ( object.material.length === 1 ) object.material = object.material[ 0 ];

			} else if ( object.userData.solidMaterial ) {

				[ object.material ].flat().forEach( m => m.dispose() );
				object.material = object.userData.solidMaterial;
				delete object.userData.solidMaterial;

			}

		} );

	}

	// --- selecting and moving ------------------------------------------------------------

	// Also opens the P panel at this entry. touch: picked with a finger, whose tap's click arrives
	// after the press and would land on whatever control had opened under it by then, so the panel
	// opens once that click has gone by (and on a phone not at all).
	function select( entry, touch = false ) {

		// Several: as one selection.
		if ( Array.isArray( entry ) ) {

			setSelection( entry );
			return;

		}

		const was = selection;
		selected = entry;
		selection = entry ? [ entry ] : [];
		if ( was.length > 1 ) groupChanged();
		// A row of items (rows.js) shows as its line with dots on it instead: a box round all of a
		// long or bent row would be mostly empty ground.
		highlight.visible = !! entry && getKind( entry.kind )?.resize?.shape !== 'points';
		if ( ! entry ) return;
		highlight.setFromObject( entry.pivot );
		panel.focus( entry, ! touch );
		// Not on a phone, where the panel would cover the toolbar and most of the map left above the
		// library: the toolbar's Edit opens it there.
		if ( touch && ! PHONE.matches ) showPanelAfterTap( entry );

	}

	function showPanelAfterTap( entry ) {

		const show = () => {

			clearTimeout( timer );
			window.removeEventListener( 'click', show, true );
			if ( selected === entry ) panel.focus( entry, true );

		};
		window.addEventListener( 'click', show, true );
		// A drag has no click.
		const timer = setTimeout( show, 600 );

	}

	function rotateSelected( degrees, entry = selected ) {

		if ( ! entry ) return;
		// Several selected: all of them, about their middle.
		if ( group && selection.includes( entry ) ) {

			const before = selection.map( stateOf );
			turnGroup( groupBase( group ), degrees );
			group.state.heading = ( group.state.heading + degrees + 360 ) % 360;
			if ( ! dragging ) recordTransform( `turn ${ selection.length } items`, selection, before, true );
			return;

		}

		const before = [ stateOf( entry ) ];
		entry.state.heading = ( entry.state.heading + degrees + 360 ) % 360;
		models.apply( entry );
		// Unless it's following the mouse (the wheel while it's dragged: the move is the step).
		if ( ! dragging ) recordTransform( `turn ${ entry.state.name }`, [ entry ], before, true );

	}

	// --- several selected together -----------------------------------------------------------

	// Select these (several, or one or none as select() does). `primary`: the one picked last.
	function setSelection( entries, primary = null ) {

		// Never what's hidden (undo touching a hidden one, say): it couldn't be seen to be selected,
		// and Delete would take it unseen.
		const list = [ ...new Set( entries ) ].filter( e => e && models.entries.includes( e ) && ! e.placing && ! models.isHidden( e ) );
		if ( list.length <= 1 ) {

			select( list[ 0 ] ?? null );
			return;

		}

		selection = list;
		selected = primary && list.includes( primary ) ? primary : list[ list.length - 1 ];
		highlight.visible = false;
		groupChanged();

	}

	// Shift+click: add it to what's selected, or take it out.
	function toggleSelected( entry ) {

		if ( selection.includes( entry ) ) setSelection( selection.filter( e => e !== entry ) );
		else setSelection( [ ...selection, entry ], entry );

	}

	// What's selected has changed between one or none and several, or which several.
	function groupChanged() {

		const several = selection.length > 1;
		const shown = several ? Math.min( selection.length, MAX_OUTLINES ) : 0;
		for ( let i = 0; i < Math.max( outlines.length, shown ); i ++ ) {

			if ( ! outlines[ i ] ) {

				outlines[ i ] = new BoxHelper( undefined, GROUP_COLOR );
				// Seen through what stands in front, like the handles.
				outlines[ i ].material.depthTest = false;
				outlines[ i ].material.transparent = true;
				outlines[ i ].renderOrder = 999;
				outlines[ i ].userData.noCollide = true;
				outlines[ i ].raycast = () => {};
				scene.add( outlines[ i ] );

			}

			outlines[ i ].visible = i < shown;

		}

		group = several ? makeGroup( selection ) : null;
		memberBoxes.clear();
		groupStale = true;
		showGroupPanel( false );

	}

	// The P panel's "N items", with what can be done to them all.
	function showGroupPanel( show ) {

		if ( ! group ) {

			panel.showGroup( null );
			return;

		}

		panel.showGroup( selection, {
			'Rotate left 15°': () => rotateSelected( - ROTATE_STEP ),
			'Rotate right 15°': () => rotateSelected( ROTATE_STEP ),
			'Copy': () => copySelection(),
			'Cut': () => cutSelection(),
			'Duplicate': () => duplicateSelection(),
			'Hide them': () => toolbar.hideTarget( group ),
			'Delete them': () => deleteItems( selection ),
		}, { open: show } );

	}

	// Several selected, as one for the handles (a ring round them all with a knob to turn them about
	// their middle) and the toolbar (over them all). Its heading is the knob's: turning the knob
	// turns every one of them by as much, about the middle of where they stand (base, while turning).
	function makeGroup( members ) {

		const stand = {
			group: true,
			members,
			kind: null,
			params: null,
			footprint: new Box3(),
			state: { name: `${ members.length } items`, east: 0, north: 0, up: 0, heading: 0, scale: 1 },
			base: null,
			apply() {

				if ( stand.base ) turnGroup( stand.base, stand.state.heading - stand.base.heading );

			},
		};
		return stand;

	}

	// The middle of the group (the mean of where they stand: turning about it leaves it where it is)
	// and how far out they reach, and the box round them all in the scene (into `box`).
	function measureGroup( stand, box ) {

		box.makeEmpty();
		let east = 0;
		let north = 0;
		for ( const member of stand.members ) {

			box.union( memberBox( member ) );
			east += member.state.east;
			north += member.state.north;

		}

		if ( ! stand.base ) {

			stand.state.east = east / stand.members.length;
			stand.state.north = north / stand.members.length;

		}

		// The furthest corner of the box from the middle, as the corner of a square footprint.
		const cx = - stand.state.east;
		const cz = stand.state.north;
		const reach = Math.max( ...[ [ box.min.x, box.min.z ], [ box.max.x, box.min.z ], [ box.max.x, box.max.z ], [ box.min.x, box.max.z ] ].map( ( [ x, z ] ) => Math.hypot( x - cx, z - cz ) ) );
		const half = Number.isFinite( reach ) ? reach / Math.SQRT2 : 1;
		stand.footprint.min.set( - half, 0, - half );
		stand.footprint.max.set( half, 1, half );
		stand.state.up = box.min.y;

	}

	function memberBox( entry ) {

		let box = memberBoxes.get( entry );
		if ( ! box ) {

			box = new Box3().setFromObject( entry.pivot );
			memberBoxes.set( entry, box );

		}

		return box;

	}

	// An outline (a BoxHelper) drawn round a box, as BoxHelper.update() draws round an object.
	function outlineBox( helper, box ) {

		if ( box.isEmpty() ) return;
		const { min, max } = box;
		const array = helper.geometry.attributes.position.array;
		array.set( [
			max.x, max.y, max.z, min.x, max.y, max.z, min.x, min.y, max.z, max.x, min.y, max.z,
			max.x, max.y, min.z, min.x, max.y, min.z, min.x, min.y, min.z, max.x, min.y, min.z,
		] );
		helper.geometry.attributes.position.needsUpdate = true;
		helper.geometry.computeBoundingSphere();

	}

	// Where each of the group stands now, and the middle and heading they're turned from.
	function groupBase( stand ) {

		return {
			heading: stand.state.heading,
			east: stand.state.east,
			north: stand.state.north,
			members: stand.members.map( entry => ( { entry, east: entry.state.east, north: entry.state.north, heading: entry.state.heading } ) ),
		};

	}

	// Turn the group from where it stood (base) by `degrees` about its middle: each one goes round
	// the middle, turned by as much itself, and settles on the ground where it lands.
	function turnGroup( base, degrees ) {

		const rad = degrees * Math.PI / 180;
		const cos = Math.cos( rad );
		const sin = Math.sin( rad );
		for ( const { entry, east, north, heading } of base.members ) {

			if ( ! models.entries.includes( entry ) ) continue;
			const de = east - base.east;
			const dn = north - base.north;
			entry.state.east = round2( base.east + de * cos + dn * sin );
			entry.state.north = round2( base.north - de * sin + dn * cos );
			entry.state.heading = round2( ( ( heading + degrees ) % 360 + 360 ) % 360 );
			models.apply( entry );

		}

	}

	// --- undo and redo -----------------------------------------------------------------------

	// What undo puts back: where it stands, which way it faces, its height and its params (a size).
	function stateOf( entry ) {

		const { east, north, heading, up, snap } = entry.state;
		return { east, north, heading, up, snap, params: entry.params ? { ...entry.params } : null };

	}

	// Put back `to` where it differs from `from` (the other end of the step), and nothing else: a
	// change made since that the step didn't make (a size or material typed in the P panel, the
	// "N items" fields) stays as it is.
	function putState( entry, to, from ) {

		const changes = {};
		for ( const key of [ 'east', 'north', 'heading', 'up', 'snap' ] ) if ( to[ key ] !== from[ key ] ) changes[ key ] = to[ key ];
		// A snapped height follows the ground: it isn't put back unless snapping changed.
		if ( to.snap && from.snap ) delete changes.up;
		Object.assign( entry.state, changes );
		const params = {};
		for ( const key of new Set( [ ...Object.keys( to.params ?? {} ), ...Object.keys( from.params ?? {} ) ] ) ) {

			if ( JSON.stringify( to.params?.[ key ] ) !== JSON.stringify( from.params?.[ key ] ) ) params[ key ] = to.params?.[ key ];

		}

		if ( entry.params && Object.keys( params ).length ) models.setParams( entry, params );
		else models.apply( entry );

	}

	// A step for having moved, turned or resized these from `before` to where they are now, if they
	// changed at all (snapped heights aside: they follow the ground). `merge`: one straight after
	// another on the same items (R, R, R) is one step.
	function recordTransform( label, entries, before, merge = false ) {

		const after = entries.map( stateOf );
		const moved = ( a, b ) => JSON.stringify( { ...a, up: a.snap ? 0 : a.up } ) !== JSON.stringify( { ...b, up: b.snap ? 0 : b.up } );
		if ( ! after.some( ( state, i ) => moved( state, before[ i ] ) ) ) return;
		const refs = [ ...entries ];
		const step = {
			label,
			refs,
			before,
			after,
			undo: () => putStates( refs, step.before, step.after ),
			redo: () => putStates( refs, step.after, step.before ),
		};
		if ( merge ) step.merge = top => {

			if ( top.label !== label || top.refs?.length !== refs.length || ! top.refs.every( ( e, i ) => history.resolve( e ) === refs[ i ] ) ) return false;
			step.before = top.before;
			return true;

		};
		history.push( step );

	}

	function putStates( refs, states, others ) {

		const entries = [];
		refs.forEach( ( ref, i ) => {

			const entry = history.resolve( ref );
			if ( ! entry ) return;
			putState( entry, states[ i ], others[ i ] );
			entries.push( entry );

		} );
		// Selected again, to see what moved back.
		if ( entries.length && ! entries.every( e => selection.includes( e ) ) ) setSelection( entries );

	}

	// Delete these, as one step with an Undo toast: undoing loads each back as it was.
	function deleteItems( entries ) {

		const targets = entries.filter( e => models.entries.includes( e ) );
		if ( targets.length === 0 ) return;
		const name = targets.length === 1 ? targets[ 0 ].state.name : itemCount( targets.length );
		const step = removalStep( `delete ${ name }`, targets );
		history.push( step );
		step.redo();
		toolbar.offerUndo( `Deleted ${ name }`, () => history.undo( step ) );

	}

	// A step that takes entries away (redo) and loads them back (undo). Configs are taken as each
	// goes, so it comes back as it was then; sharedId and inConfig too: without them an item put back
	// would no longer be the record saved for everyone, so its panel couldn't update or remove it.
	function removalStep( label, entries ) {

		const refs = [ ...entries ];
		let configs = [];
		return {
			label,
			refs,
			async undo() {

				const epoch = history.epoch;
				const results = await Promise.allSettled( configs.map( config => models.load( config ) ) );
				// Another layout was opened while they loaded: not into that one.
				if ( history.epoch !== epoch ) {

					for ( const r of results ) if ( r.status === 'fulfilled' ) models.remove( r.value );
					return;

				}

				const back = [];
				results.forEach( ( r, i ) => {

					if ( r.status !== 'fulfilled' ) return;
					history.replace( refs[ i ], r.value );
					back.push( r.value );

				} );
				updateCount();
				const failed = results.length - back.length;
				if ( failed ) onError( `${ failed } could not be put back: ${ results.find( r => r.status === 'rejected' ).reason?.message ?? '' }` );
				if ( back.length ) setSelection( back );

			},
			redo() {

				const gone = refs.map( ref => history.resolve( ref ) );
				// Deselected first, not one by one as each goes.
				if ( gone.some( e => e && selection.includes( e ) ) ) select( null );
				configs = gone.map( entry => entry ? { ...models.toConfig( entry ), inConfig: entry.inConfig, sharedId: entry.sharedId } : null );
				for ( const entry of gone ) if ( entry ) models.remove( entry );
				// Those already gone (deleted some other way) aren't put back.
				for ( let i = refs.length - 1; i >= 0; i -- ) if ( ! configs[ i ] ) {

					refs.splice( i, 1 );
					configs.splice( i, 1 );

				}

			},
		};

	}

	// --- copy and paste ----------------------------------------------------------------------

	function copySelection( { quiet = false } = {} ) {

		if ( selection.length === 0 ) return null;
		const data = clipboardOf( selection, models );
		clipboard = data;
		const kept = storeClipboard( data );
		copying = clipboardText( data );
		// The system clipboard too, where the browser lets it (for the keys, the copy event does it).
		navigator.clipboard?.writeText( copying ).catch( () => {} );
		if ( ! quiet ) toast( `Copied ${ itemCount( data.items.length ) }${ kept ? '' : ' (this tab only: the browser isn\'t keeping it)' }` );
		return data;

	}

	// Cut: copied and taken away. Pro items stay where they are while they're locked, as paste
	// wouldn't put them back (a free account would lose them); the rest are cut.
	function cutSelection() {

		const locked = selection.filter( entry => configLocked( models.toConfig( entry ) ) );
		const entries = selection.filter( entry => ! locked.includes( entry ) );
		const note = locked.length ? `${ locked.length === 1 ? '1 Pro item wasn\'t cut' : `${ locked.length } Pro items weren't cut` }: ${ BUILD_PRO_SAYING }` : '';
		if ( entries.length === 0 ) {

			if ( note ) toast( note );
			return;

		}

		if ( locked.length ) setSelection( entries );
		if ( ! copySelection( { quiet: true } ) ) return;
		const step = removalStep( `cut ${ itemCount( entries.length ) }`, entries );
		history.push( step );
		step.redo();
		toolbar.offerUndo( `Cut ${ itemCount( entries.length ) }${ note ? ` (${ note })` : '' }`, () => history.undo( step ) );

	}

	// Whether a saved item (a config) is Pro and locked for this account (premium.js's gate).
	function configLocked( config ) {

		return libraryIdsOf( config ).some( id => isLocked( library.find( i => i.id === id ) ?? {} ) );

	}

	// Duplicate: what's selected again, PASTE_STEP metres east and south, not on the clipboard.
	function duplicateSelection() {

		if ( selection.length === 0 ) return Promise.resolve( [] );
		const data = clipboardOf( selection, models );
		const middle = middleOf( selection );
		return placeCopies( data, { east: middle.east + PASTE_STEP, north: middle.north - PASTE_STEP }, 'duplicate' );

	}

	// The clipboard: what this browser keeps, or the system clipboard's if that's newer (copied in
	// another browser, say). `text`: what the paste event brought from the system clipboard.
	function currentClipboard( text = '' ) {

		const stored = readStoredClipboard();
		const system = text ? parseClipboard( text ) : null;
		const mine = [ stored, clipboard ].filter( Boolean ).sort( ( a, b ) => b.copiedAt - a.copiedAt )[ 0 ] ?? null;
		return system && ( ! mine || system.copiedAt > mine.copiedAt ) ? system : mine;

	}

	// Paste at a point on the screen ({ x, y }: the pointer), or with none in the middle of the view.
	function paste( at, text = '' ) {

		const data = currentClipboard( text );
		if ( ! data ) {

			toast( 'Nothing to paste: select something and copy it first (Ctrl+C)' );
			return Promise.resolve( [] );

		}

		const rect = canvas.getBoundingClientRect();
		const spot = at ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		const point = groundPoint( spot.x, spot.y );
		let middle;
		if ( point ) middle = localToEnu( point );
		else {

			const player = getPlayer();
			const rad = player.heading * Math.PI / 180;
			middle = { east: player.east + Math.sin( rad ) * 15, north: player.north + Math.cos( rad ) * 15 };

		}

		// Again where the last paste went: a step further along each time.
		if ( lastPaste && Math.hypot( middle.east - lastPaste.at.east, middle.north - lastPaste.at.north ) < 0.5 ) {

			lastPaste.step ++;
			middle = { east: lastPaste.at.east + PASTE_STEP * lastPaste.step, north: lastPaste.at.north - PASTE_STEP * lastPaste.step };

		} else lastPaste = { at: middle, step: 0 };

		return placeCopies( data, middle, 'paste' );

	}

	// Load the clipboard's items round `middle` as new items, as one step, and select them. Pro
	// items are left out while they're locked (premium.js's gate), saying how many.
	async function placeCopies( data, middle, verb ) {

		const allowed = [];
		let locked = 0;
		for ( const item of data.items ) {

			if ( configLocked( item.config ) ) locked ++;
			else allowed.push( item );

		}

		const pasted = verb === 'paste' ? 'pasted' : 'duplicated';
		if ( locked ) toast( `${ locked === 1 ? '1 Pro item wasn\'t' : `${ locked } Pro items weren't` } ${ pasted }: ${ BUILD_PRO_SAYING }` );
		if ( allowed.length === 0 ) return [];
		cancelPlacing();
		cancelDrawing();
		const configs = allowed.map( item => resolveItem( pastedConfig( item, { east: middle.east + item.east, north: middle.north + item.north } ), library ) );
		const epoch = history.epoch;
		const results = await Promise.allSettled( configs.map( config => models.load( config ) ) );
		if ( history.epoch !== epoch ) {

			for ( const r of results ) if ( r.status === 'fulfilled' ) models.remove( r.value );
			return [];

		}

		const placed = results.filter( r => r.status === 'fulfilled' ).map( r => r.value );
		const failed = results.length - placed.length;
		if ( failed ) onError( `${ failed } of ${ results.length } couldn't be ${ pasted }: ${ results.find( r => r.status === 'rejected' ).reason?.message ?? '' }` );
		if ( placed.length === 0 ) return [];
		updateCount();
		setSelection( placed );
		// Undone, they're taken away; redone, loaded again as they were.
		const removal = removalStep( '', placed );
		history.push( {
			label: `${ verb } ${ itemCount( placed.length ) }`,
			undo: () => removal.redo(),
			redo: () => removal.undo(),
		} );
		if ( verb === 'paste' && ! locked ) toast( `Pasted ${ itemCount( placed.length ) }` );
		return placed;

	}

	// --- selecting with a box ------------------------------------------------------------------

	function setBoxMode( on ) {

		boxMode = on;
		document.body.classList.toggle( 'box-select', on );

	}

	function startBox( e, add ) {

		const element = document.createElement( 'div' );
		element.className = 'select-box';
		document.body.append( element );
		boxing = { start: { x: e.clientX, y: e.clientY }, end: { x: e.clientX, y: e.clientY }, add, element };
		canvas.setPointerCapture( e.pointerId );
		drawBox();

	}

	function drawBox() {

		const { start, end, element } = boxing;
		element.style.transform = `translate( ${ Math.min( start.x, end.x ) }px, ${ Math.min( start.y, end.y ) }px )`;
		element.style.width = `${ Math.abs( end.x - start.x ) }px`;
		element.style.height = `${ Math.abs( end.y - start.y ) }px`;

	}

	// Let go: everything whose footprint is in the box or crosses it is selected (added to what was,
	// with Shift). A box too small to be one is a click on the ground: nothing selected, without Shift.
	function finishBox( e ) {

		const { start, add, element } = boxing;
		boxing = null;
		element.remove();
		const end = e ? { x: e.clientX, y: e.clientY } : start;
		const slop = e?.pointerType === 'touch' ? TOUCH_SLOP : CLICK_SLOP;
		if ( Math.hypot( end.x - start.x, end.y - start.y ) < slop ) {

			if ( ! add ) select( null );
			return;

		}

		const box = { left: Math.min( start.x, end.x ), right: Math.max( start.x, end.x ), top: Math.min( start.y, end.y ), bottom: Math.max( start.y, end.y ) };
		const found = selectable().filter( entry => inScreenBox( entry, box ) );
		setSelection( add ? [ ...selection, ...found ] : found );

	}

	function cancelBox() {

		boxing?.element.remove();
		boxing = null;

	}

	// What a box or Ctrl/Cmd+A can select: what's shown and placed in this layout, not what loads for
	// everyone (models from config.js, items saved for everyone), which Shift+click can still pick.
	function selectable() {

		return models.entries.filter( entry => ! entry.placing && ! entry.inConfig && ! models.isHidden( entry ) && isVisible( entry.pivot ) );

	}

	// Whether an entry's footprint on screen is in a box or crosses it: the rectangle round its box's
	// corners overlapping it, or for a row of items (rows.js) a point along its line in it, as a
	// row's box is mostly the ground between.
	function inScreenBox( entry, box ) {

		const rect = canvas.getBoundingClientRect();
		const kind = getKind( entry.kind );
		entry.pivot.updateWorldMatrix( true, false );
		const line = kind?.resize?.shape === 'points' ? kind.resize.points( entry.params ) : null;
		const points = [];
		// A single point (a note, markups.js): just that.
		if ( line?.length === 1 ) points.push( new Vector3( line[ 0 ][ 0 ], 0, - line[ 0 ][ 1 ] ) );
		if ( line ) {

			for ( let i = 0; i < line.length - 1; i ++ ) {

				const [ a, b ] = [ line[ i ], line[ i + 1 ] ];
				const n = Math.min( 50, Math.max( 1, Math.ceil( Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) ) ) );
				// In its own frame, as rows.js has them: ( east, 0, - north ).
				for ( let k = 0; k <= n; k ++ ) points.push( new Vector3( a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * k / n, 0, - ( a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * k / n ) ) );

			}

		} else {

			const { min, max } = entry.footprint;
			for ( const x of [ min.x, max.x ] ) for ( const y of [ min.y, max.y ] ) for ( const z of [ min.z, max.z ] ) points.push( new Vector3( x, y, z ) );

		}

		const screen = points.map( p => toScreen( entry.pivot.localToWorld( p ), camera, rect ) ).filter( p => p.visible );
		if ( screen.length === 0 ) return false;
		if ( line ) return screen.some( p => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom );
		const xs = screen.map( p => p.x );
		const ys = screen.map( p => p.y );
		return Math.min( ...xs ) <= box.right && Math.max( ...xs ) >= box.left && Math.min( ...ys ) <= box.bottom && Math.max( ...ys ) >= box.top;

	}

	// Whether this browser keeps a clipboard (read again at most once a second: it's JSON).
	let stored = { at: - Infinity, has: false };
	function hasStoredClipboard() {

		const now = performance.now();
		if ( now - stored.at > 1000 ) stored = { at: now, has: !! readStoredClipboard() };
		return stored.has;

	}

	function itemCount( n ) {

		return n === 1 ? '1 item' : `${ n } items`;

	}

	// Get in a vehicle or machine: main.js's startDriving if it has one, else as V does.
	function drive( entry ) {

		if ( window.twin?.startDriving ) {

			window.twin.startDriving( entry );
			return;

		}

		if ( selected !== entry ) select( entry );
		for ( const type of [ 'keydown', 'keyup' ] ) window.dispatchEvent( new KeyboardEvent( type, { code: 'KeyV', key: 'v' } ) );

	}

	// One turn per notch of a mouse wheel, or per WHEEL_STEP pixels of a trackpad's scrolling.
	function wheelTurn( e ) {

		const delta = e.deltaY * ( e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1 );
		if ( Math.abs( delta ) >= WHEEL_NOTCH ) wheel = 0;
		else {

			wheel += delta;
			if ( Math.abs( wheel ) < WHEEL_STEP ) return 0;
			wheel = 0;

		}

		return Math.sign( delta ) * ROTATE_STEP;

	}

	// --- pointer and keyboard ------------------------------------------------------------

	// The left button can be let go while another is still held (e.g. right-drag to look); that
	// arrives as a pointermove, not a pointerup, so presses end whenever it is no longer down.
	function endPress( e ) {

		finishDrag();
		if ( boxing ) finishBox( e );
		if ( drawing?.start ) finishDrawing( e );
		else if ( drawing?.press ) releaseLine( e );

	}

	canvas.addEventListener( 'pointermove', e => {

		pointer = { x: e.clientX, y: e.clientY };
		if ( ( dragging || boxing || drawing?.start || drawing?.press ) && ( e.buttons & 1 ) === 0 ) endPress( e );
		if ( boxing ) {

			boxing.end = { x: e.clientX, y: e.clientY };
			drawBox();

		}

		if ( drawing?.start ) updateDrawing();
		if ( drawing?.tool.mode === 'line' ) moveLine( e );
		if ( drawing?.tool.mode === 'custom' ) drawing.tool.onMove?.( e );
		if ( placing ) followPointer();
		// A press on an item selects it; it only moves once the pointer has gone further than a
		// click's slip, since from afar one pixel of jitter covers metres of ground.
		if ( dragging && ! dragging.moved && Math.hypot( e.clientX - dragging.press.x, e.clientY - dragging.press.y ) < dragging.slop ) return;
		if ( dragging ) {

			const { entry, members } = dragging;
			const point = groundPoint( e.clientX, e.clientY, members.map( m => m.pivot ) );
			if ( point ) {

				// Several: each moves as far as the one under the pointer, keeping where they are from
				// each other, and settles on the ground where it lands.
				const was = { east: entry.state.east, north: entry.state.north };
				models.moveTo( entry, point.add( dragging.offset ) );
				const de = entry.state.east - was.east;
				const dn = entry.state.north - was.north;
				for ( const member of members ) {

					if ( member === entry || ! models.entries.includes( member ) ) continue;
					member.state.east = round2( member.state.east + de );
					member.state.north = round2( member.state.north + dn );
					models.apply( member );

				}

				dragging.moved = true;

			}

		}

	} );

	canvas.addEventListener( 'pointerleave', () => {

		pointer = null;

	} );

	canvas.addEventListener( 'pointerdown', e => {

		if ( e.button !== 0 || controls.locked || isDriving() || handles.busy ) return;
		pointer = { x: e.clientX, y: e.clientY };

		if ( drawing?.tool.mode === 'line' ) {

			pressLine( e );
			suppressClick = true;
			return;

		}

		// A tool that takes the clicks itself (a markup, markups.js).
		if ( drawing?.tool.mode === 'custom' ) {

			drawing.tool.onPress?.( e );
			suppressClick = true;
			return;

		}

		if ( drawing ) {

			const start = groundPoint( e.clientX, e.clientY );
			if ( start && drawing.tool.mode === 'point' ) finishPoint( start, e.pointerType !== 'mouse' );
			else if ( start ) {

				drawing.start = start;
				drawing.press = { x: e.clientX, y: e.clientY };
				canvas.setPointerCapture( e.pointerId );

			}

			suppressClick = true;
			return;

		}

		const mouse = e.pointerType === 'mouse';
		if ( placing ) {

			followPointer();
			commitPlacing( e.shiftKey, ! mouse );
			suppressClick = true;
			return;

		}

		finishDrag();
		const hit = pick( e.clientX, e.clientY );
		// Shift (or Ctrl/Cmd) and a click on something: added to what's selected, or taken out.
		const adding = e.shiftKey || e.ctrlKey || e.metaKey;
		if ( hit && adding ) {

			toggleSelected( hit.entry );
			suppressClick = true;
			return;

		}

		if ( hit ) {

			// One of several selected: they all move together.
			const together = selection.length > 1 && selection.includes( hit.entry );
			if ( ! together && hit.entry !== selected ) select( hit.entry, ! mouse );
			const members = together ? [ ...selection ] : [ hit.entry ];
			const ground = groundPoint( e.clientX, e.clientY, members.map( m => m.pivot ) ) ?? hit.point;
			dragging = {
				entry: hit.entry,
				members,
				before: members.map( stateOf ),
				offset: _offset.copy( hit.entry.pivot.position ).sub( ground ).setY( 0 ).clone(),
				press: { x: e.clientX, y: e.clientY },
				slop: e.pointerType === 'touch' ? TOUCH_SLOP : CLICK_SLOP,
				moved: false,
			};
			canvas.setPointerCapture( e.pointerId );
			suppressClick = true;
			return;

		}

		// On the ground with Shift, or with the edit bar's Select on: a box to select what's in it.
		if ( boxMode || ( open && adding ) ) {

			startBox( e, adding );
			suppressClick = true;
			return;

		}

		if ( open ) {

			select( null );
			suppressClick = true;

		}

	} );

	canvas.addEventListener( 'pointerup', e => {

		if ( ( e.buttons & 1 ) === 0 ) endPress( e );

	} );

	// The browser took the touch over (scrolling, a system gesture) or capture was lost: stop
	// dragging, so the item doesn't later jump to wherever the next touch lands.
	canvas.addEventListener( 'pointercancel', () => {

		finishDrag();
		cancelBox();
		if ( drawing?.start ) cancelDrawing();
		// A press that turned out to be the browser's (a pinch, say) isn't a point.
		else if ( drawing?.press ) drawing.press = null;

	} );
	canvas.addEventListener( 'lostpointercapture', () => {

		finishDrag();
		cancelBox();

	} );

	// Let go of what was being moved: a step to undo, if it moved.
	function finishDrag() {

		if ( ! dragging ) return;
		const { members, before, moved } = dragging;
		dragging = null;
		if ( moved ) recordTransform( members.length === 1 ? `move ${ members[ 0 ].state.name }` : `move ${ members.length } items`, members, before );

	}

	// While editing, a click selects or places instead of capturing the mouse.
	controls.canLockPointer = () => {

		const allowed = ! suppressClick && ! placing && ! drawing;
		suppressClick = false;
		return allowed;

	};

	// The wheel turns what's being placed or moved, rather than whatever else it does over the scene
	// (zooming): taken here first, at the window, and marked as used.
	window.addEventListener( 'wheel', e => {

		if ( e.target !== canvas ) return;
		const turning = dragging?.entry;
		if ( ! placing && ! turning && ! handles.busy ) return;
		e.preventDefault();
		const degrees = handles.busy ? 0 : wheelTurn( e );
		if ( ! degrees ) return;
		if ( placing ) rotatePlacing( degrees );
		else rotateSelected( degrees, turning );

	}, { capture: true, passive: false } );

	// Dragging a card onto the scene. Only the scene takes the drop; let go anywhere else (over the
	// sidebar, say) and the card's dragend cancels it.
	window.addEventListener( 'dragover', e => {

		if ( ! e.dataTransfer?.types.includes( DRAG_TYPE ) || e.target !== canvas ) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		pointer = { x: e.clientX, y: e.clientY };
		followPointer();

	} );

	window.addEventListener( 'drop', e => {

		if ( ! e.dataTransfer?.types.includes( DRAG_TYPE ) || e.target !== canvas ) return;
		e.preventDefault();
		pointer = { x: e.clientX, y: e.clientY };
		followPointer();
		if ( placing?.entry ) commitPlacing( false );
		else if ( placing ) {

			// Still loading: place it when it arrives. No longer a drag, so dragend leaves it be.
			placing.fromDrag = false;
			placing.commitWhenLoaded = true;

		}

	} );

	window.addEventListener( 'keydown', e => {

		if ( isTyping( e ) || isDriving() ) return;
		// A selected flatten area: PageUp / PageDown raise and lower it (raise.js), with Ctrl, Cmd or
		// Alt too (a metre).
		if ( ( e.code === 'PageUp' || e.code === 'PageDown' ) && canRaise( selected ) && ! placing && ! drawing && ! handles.busy ) {

			e.preventDefault();
			raising.nudge( selected, e.code === 'PageUp' ? 1 : - 1, e );
			return;

		}

		if ( e.ctrlKey || e.metaKey || e.altKey ) return;
		if ( e.code === 'KeyL' && ! e.repeat ) setOpen( ! open );
		else if ( e.code === 'Escape' ) {

			if ( handles.busy ) handles.cancel();
			else if ( boxing ) cancelBox();
			else if ( drawing ) cancelDrawing();
			else if ( placing ) cancelPlacing();
			else if ( selection.length === 0 && boxMode ) setBoxMode( false );
			else select( null );

		} else if ( drawing?.tool.mode === 'line' && ( e.code === 'Enter' || e.code === 'NumpadEnter' ) ) {

			e.preventDefault();
			finishLine();

		} else if ( drawing?.tool.mode === 'line' && ( e.code === 'Backspace' || e.code === 'Delete' ) ) {

			e.preventDefault();
			undoPoint();

		} else if ( e.code === 'KeyR' ) {

			const step = e.shiftKey ? - ROTATE_STEP : ROTATE_STEP;
			if ( placing ) rotatePlacing( step );
			else rotateSelected( step );

		} else if ( ( e.code === 'Delete' || e.code === 'Backspace' ) && selected && ! placing && ! handles.busy ) {

			e.preventDefault();
			toolbar.remove( group ?? selected );

		}

	}, true );

	// Ctrl/Cmd with A, C, X, V, D, Z and Y: select all, copy, cut, paste, duplicate, undo and redo.
	// Not while typing (a field's own copy and paste, undo...), nor while text on the page is
	// selected (copying that), nor driving. Paste only while building (the library open), and undo
	// and redo only then or with something selected: pressed out of habit while just looking round,
	// they'd change the plan, and it saves itself.
	window.addEventListener( 'keydown', e => {

		if ( ! ( e.ctrlKey || e.metaKey ) || e.altKey || isTyping( e ) || isDriving() || dialogOpen() ) return;
		const textSelected = !! window.getSelection?.()?.toString();
		const busy = handles.busy || !! dragging || !! boxing;
		switch ( e.code ) {

			case 'KeyA':
				// Only while building, where there's nothing else to select.
				if ( ! open && selection.length === 0 ) return;
				e.preventDefault();
				cancelPlacing();
				cancelDrawing();
				setSelection( selectable() );
				break;
			case 'KeyC':
				if ( textSelected || selection.length === 0 ) return;
				// The browser's copy event follows, and puts it on the system clipboard (see below).
				copySelection();
				break;
			case 'KeyX':
				if ( textSelected || selection.length === 0 || busy ) return;
				cutSelection();
				break;
			case 'KeyV':
				if ( busy || ! open ) return;
				// The browser's paste event brings the system clipboard, if it will; else this browser's.
				startPaste();
				break;
			case 'KeyD':
				if ( selection.length === 0 || busy ) return;
				e.preventDefault();
				duplicateSelection();
				break;
			case 'KeyZ':
				if ( busy || ( ! open && selection.length === 0 ) ) return;
				e.preventDefault();
				if ( e.shiftKey ) history.redo();
				else history.undo();
				break;
			case 'KeyY':
				if ( busy || e.metaKey || ( ! open && selection.length === 0 ) ) return;
				e.preventDefault();
				history.redo();
				break;

		}

	}, true );

	// A modal dialog (a Pro dialog, a project's) has the keys.
	function dialogOpen() {

		return !! document.querySelector( 'dialog[open]' );

	}

	function startPaste() {

		clearTimeout( pasting?.timer );
		const at = pointer ? { ...pointer } : null;
		pasting = { at, timer: setTimeout( () => {

			pasting = null;
			paste( at );

		}, PASTE_WAIT ) };

	}

	document.addEventListener( 'copy', e => {

		if ( ! copying ) return;
		const text = copying;
		copying = null;
		if ( isTyping( e ) || window.getSelection?.()?.toString() ) return;
		e.clipboardData?.setData( 'text/plain', text );
		e.preventDefault();

	} );
	document.addEventListener( 'cut', e => {

		if ( ! copying ) return;
		const text = copying;
		copying = null;
		if ( isTyping( e ) || window.getSelection?.()?.toString() ) return;
		e.clipboardData?.setData( 'text/plain', text );
		e.preventDefault();

	} );
	document.addEventListener( 'paste', e => {

		if ( ! pasting || isTyping( e ) ) return;
		clearTimeout( pasting.timer );
		const { at } = pasting;
		pasting = null;
		e.preventDefault();
		paste( at, e.clipboardData?.getData( 'text/plain' ) ?? '' );

	} );

	// --- tools: drawing areas and picking points -------------------------------------------

	// Drag out a rectangle on the ground, lined up with the way you're looking, or pick a point.
	function startDrawing( tool ) {

		cancelPlacing();
		cancelDrawing();
		select( null );
		document.exitPointerLock?.();
		const outline = new LineLoop( new BufferGeometry(), new LineBasicMaterial( { color: tool.color ?? 0xff3322 } ) );
		outline.visible = false;
		scene.add( outline );
		drawing = { tool, start: null, heading: getPlayer().heading, outline };
		root.classList.add( 'placing' );
		tool.card.classList.add( 'active' );
		tool.onStart?.();

	}

	// The rectangle from the drag start to the pointer, in the drawing's own axes.
	function drawnRectangle() {

		const end = pointer && groundPoint( pointer.x, pointer.y );
		if ( ! end ) return null;
		const a = localToEnu( drawing.start );
		const b = localToEnu( end );
		const rad = drawing.heading * Math.PI / 180;
		const de = b.east - a.east;
		const dn = b.north - a.north;
		return {
			across: de * Math.cos( rad ) - dn * Math.sin( rad ),
			along: de * Math.sin( rad ) + dn * Math.cos( rad ),
			east: ( a.east + b.east ) / 2,
			north: ( a.north + b.north ) / 2,
			height: drawing.start.y,
		};

	}

	function updateDrawing() {

		const rect = drawnRectangle();
		if ( ! rect ) return;
		const rad = drawing.heading * Math.PI / 180;
		const corners = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ i, j ] ) => {

			const x = i * rect.across / 2;
			const y = j * rect.along / 2;
			const east = rect.east + x * Math.cos( rad ) + y * Math.sin( rad );
			const north = rect.north - x * Math.sin( rad ) + y * Math.cos( rad );
			return new Vector3( - east, rect.height + 0.2, north );

		} );
		drawing.outline.geometry.setFromPoints( corners );
		drawing.outline.visible = true;
		// What the tool makes of it, where that's more than the rectangle (an excavation drawn by its
		// floor reaches out to the top of its cut): outlined dashed, with its size by the pointer.
		const preview = drawing.tool.preview?.( { width: Math.abs( rect.across ), length: Math.abs( rect.along ) } );
		if ( preview ) showPreview( rect, preview );

	}

	// preview: { top: { u0, u1, v0, v1 } in the rectangle's frame (u across, v along), label }.
	function showPreview( rect, { top, label } ) {

		if ( top ) {

			if ( ! drawing.top ) {

				drawing.top = new LineLoop( new BufferGeometry(), new LineDashedMaterial( { color: drawing.tool.color ?? 0xff3322, dashSize: 0.8, gapSize: 0.5 } ) );
				scene.add( drawing.top );

			}

			const rad = drawing.heading * Math.PI / 180;
			const corners = [ [ top.u0, top.v0 ], [ top.u1, top.v0 ], [ top.u1, top.v1 ], [ top.u0, top.v1 ] ].map( ( [ u, v ] ) => new Vector3( - ( rect.east + u * Math.cos( rad ) + v * Math.sin( rad ) ), rect.height + 0.2, rect.north - u * Math.sin( rad ) + v * Math.cos( rad ) ) );
			drawing.top.geometry.setFromPoints( corners );
			drawing.top.computeLineDistances();
			drawing.top.visible = true;

		}

		if ( label && pointer ) {

			if ( ! drawing.label ) {

				drawing.label = document.createElement( 'div' );
				drawing.label.className = 'handle-label row-label drawing-label';
				document.body.append( drawing.label );

			}

			if ( drawing.label.textContent !== label ) drawing.label.textContent = label;
			drawing.label.style.transform = `translate( ${ pointer.x.toFixed( 1 ) }px, ${ ( pointer.y - 26 ).toFixed( 1 ) }px ) translate( -50%, -100% )`;

		}

	}

	// e is the pointer event that ended the press.
	async function finishDrawing( e ) {

		const { heading, tool, start, press } = drawing;
		// A click makes an area of the tool's default size where it was pressed. Whether the
		// pointer moved is judged on screen: from a distance one pixel covers metres of ground, so
		// a click that slipped a pixel would otherwise make a sliver.
		const slop = e.pointerType === 'touch' ? TOUCH_SLOP : CLICK_SLOP;
		const clicked = Math.hypot( e.clientX - press.x, e.clientY - press.y ) < slop;
		const { east, north } = localToEnu( start );
		const rect = clicked ? { across: 0, along: 0, east, north, height: start.y } : drawnRectangle();
		cancelDrawing();
		if ( ! rect ) return;
		// Close up, a drag can be under a metre: one that short both ways counts as a click too, and
		// one that short one way takes the tool's default size that way.
		const [ defaultWidth, defaultLength ] = tool.defaultSize ?? [ 10, 10 ];
		const dragged = Math.abs( rect.across ) >= 1 || Math.abs( rect.along ) >= 1;
		const width = Math.abs( rect.across ) < 1 ? defaultWidth : Math.round( Math.abs( rect.across ) * 10 ) / 10;
		const length = Math.abs( rect.along ) < 1 ? defaultLength : Math.round( Math.abs( rect.along ) * 10 ) / 10;
		await runTool( tool, {
			east: Math.round( rect.east * 100 ) / 100,
			north: Math.round( rect.north * 100 ) / 100,
			height: rect.height,
			heading: Math.round( heading * 10 ) / 10,
			width,
			length,
			dragged,
		}, e.pointerType !== 'mouse' );

	}

	async function finishPoint( point, touch ) {

		const { heading, tool } = drawing;
		cancelDrawing();
		const { east, north } = localToEnu( point );
		await runTool( tool, { east: Math.round( east * 100 ) / 100, north: Math.round( north * 100 ) / 100, height: point.y, heading: Math.round( heading * 10 ) / 10 }, touch );

	}

	async function runTool( tool, shape, touch ) {

		try {

			const entry = await tool.onDone( shape );
			if ( entry?.pivot ) select( entry, touch );

		} catch ( err ) {

			onError( `${ tool.name }: ${ err.message }` );

		}

	}

	function cancelDrawing() {

		const tool = drawing?.tool;
		stopDrawing();
		tool?.onCancel?.();

	}

	function stopDrawing() {

		if ( ! drawing ) return;
		for ( const line of [ drawing.outline, drawing.top ] ) {

			if ( ! line ) continue;
			scene.remove( line );
			line.geometry.dispose();
			line.material.dispose();

		}

		drawing.label?.remove();

		drawing.tool.card?.classList.remove( 'active' );
		drawing = null;
		root.classList.remove( 'placing' );
		document.body.classList.remove( 'drawing-line' );

	}

	// --- drawing a line: a row of items ------------------------------------------------------

	// Click points on the ground for a line, corners and all (rows.js): a double-click, Enter or
	// finishLine() ends it, a click on the first point closes it into a loop and ends it, Backspace
	// or undoPoint() takes the last point back and Esc cancels; on a finger each tap is a point. A
	// press dragged out before any point is clicked makes a straight line at once. spec: { name,
	// card (marked while drawing), points (any to start with), onChange( points, cursor ), onDone(
	// points, touch ) (may return a placed entry, which is then selected), onCancel() }. Points are
	// on the ground, as positions in the scene; cursor is the point on the ground under the pointer,
	// or null (none, or a finger that has been lifted); it is the first point itself while the
	// pointer is on that, about to close the loop.
	function startLine( spec ) {

		cancelPlacing();
		cancelDrawing();
		select( null );
		document.exitPointerLock?.();
		drawing = { tool: { ...spec, mode: 'line' }, points: [ ...( spec.points ?? [] ) ], press: null, click: null, cursor: null };
		root.classList.add( 'placing' );
		spec.card?.classList.add( 'active' );
		document.body.classList.add( 'drawing-line' );
		lineChanged();

	}

	function pressLine( e ) {

		const point = surfacePoint( e.clientX, e.clientY );
		if ( ! point ) return;
		drawing.press = { x: e.clientX, y: e.clientY, point, moved: false };
		canvas.setPointerCapture( e.pointerId );

	}

	function moveLine( e ) {

		const { press } = drawing;
		const slop = e.pointerType === 'touch' ? TOUCH_SLOP : CLICK_SLOP;
		if ( press && ! press.moved ) press.moved = Math.hypot( e.clientX - press.x, e.clientY - press.y ) >= slop;
		drawing.cursor = firstPointAt( e.clientX, e.clientY, e.pointerType !== 'mouse' ) ?? surfacePoint( e.clientX, e.clientY );
		lineChanged();

	}

	// The first point, if it's under the pointer and two or more have been added after it.
	function firstPointAt( x, y, touch ) {

		const [ first ] = drawing.points;
		if ( drawing.points.length < 3 ) return null;
		const spot = toScreen( first, camera, canvas.getBoundingClientRect() );
		return spot.visible && Math.hypot( spot.x - x, spot.y - y ) <= CLOSE_RADIUS * ( touch ? 2 : 1 ) ? first : null;

	}

	// A click adds a point, and a second one straight after it finishes; one on the first point
	// closes the loop. A drag adds the point it ends at, or, from the first press, is the whole line.
	function releaseLine( e ) {

		const { press, click } = drawing;
		drawing.press = null;
		const touch = e.pointerType !== 'mouse';
		const slop = touch ? TOUCH_SLOP : CLICK_SLOP;
		const now = performance.now();
		const first = firstPointAt( press.moved ? e.clientX : press.x, press.moved ? e.clientY : press.y, touch );
		// The first press dragged only a little was a click.
		if ( press.moved && drawing.points.length === 0 && Math.hypot( e.clientX - press.x, e.clientY - press.y ) < LINE_DRAG * ( touch ? 2 : 1 ) ) press.moved = false;
		if ( first ) {

			drawing.points.push( first.clone() );
			drawing.click = null;
			finishLine( touch );
			return;

		} else if ( press.moved ) {

			const end = surfacePoint( e.clientX, e.clientY ) ?? drawing.cursor;
			drawing.click = null;
			if ( end && drawing.points.length === 0 ) {

				drawing.points.push( press.point, end );
				finishLine( touch );
				return;

			}

			if ( end ) drawing.points.push( end );

		} else if ( click && now - click.time < DOUBLE_CLICK && Math.hypot( press.x - click.x, press.y - click.y ) < slop ) {

			drawing.click = null;
			if ( finishLine( touch ) ) return;

		} else {

			drawing.points.push( press.point );
			drawing.click = { x: press.x, y: press.y, time: now };

		}

		// A finger isn't over the ground once it's lifted.
		if ( touch ) drawing.cursor = null;
		lineChanged();

	}

	// End the line and hand it over, if it has two points or more (true then).
	function finishLine( touch = false ) {

		if ( drawing?.tool.mode !== 'line' || drawing.points.length < 2 ) return false;
		const { tool, points } = drawing;
		stopDrawing();
		// On a phone the library sheet stepped aside for the line (rows.css); it stays folded so that
		// the line just drawn, and the dots to change it, aren't under it. Library opens it again.
		if ( PHONE.matches ) setOpen( false );
		Promise.resolve()
			.then( () => tool.onDone( points, touch ) )
			.then( entry => entry?.pivot && select( entry, touch ), err => onError( `${ tool.name }: ${ err.message }` ) );
		return true;

	}

	function undoPoint() {

		if ( drawing?.tool.mode !== 'line' ) return;
		drawing.points.pop();
		drawing.click = null;
		lineChanged();

	}

	// While the first press is dragged out, the line runs from where it was pressed.
	function lineChanged() {

		const { points, press, cursor } = drawing;
		drawing.tool.onChange?.( press?.moved && points.length === 0 ? [ press.point ] : points, cursor );

	}

	// --- helpers -------------------------------------------------------------------------

	// The point on the ground (or on another model) under the cursor, skipping `exclude`.
	function groundPoint( x, y, exclude ) {

		// exclude: what's being placed (one pivot, or a set's), which the pointer looks through.
		const excluded = exclude ? [ exclude ].flat() : [];
		const hit = castFromScreen( x, y, [ ...getGround(), models.group ] )
			.find( h => ! excluded.some( pivot => isInside( h.object, pivot ) ) );
		return hit ? hit.point.clone() : null;

	}

	// The ground (Google's mesh, dug and piled earth) under the cursor, not what's placed on it.
	function surfacePoint( x, y ) {

		return castFromScreen( x, y, getGround() )[ 0 ]?.point.clone() ?? null;

	}

	// The placed model under the cursor, unless something else (a building) is in front of it.
	function pick( x, y ) {

		const hit = castFromScreen( x, y, [ ...getGround(), models.group ] )[ 0 ];
		const entry = hit && models.entryFor( hit.object );
		return entry && ! entry.placing ? { entry, point: hit.point } : null;

	}

	function castFromScreen( x, y, objects ) {

		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( x - rect.left ) / rect.width * 2 - 1, - ( y - rect.top ) / rect.height * 2 + 1 );
		setFromView( raycaster, _ndc, camera );
		// Hidden things (flatten zones outside build mode) can't be clicked.
		return raycaster.intersectObjects( objects, true ).filter( h => h.object.isMesh && isVisible( h.object ) && passesHitFilters( h ) );

	}

	return {
		update() {

			if ( group ) {

				if ( groupStale ) {

					groupStale = false;
					measureGroup( group, groupBox );
					selection.slice( 0, MAX_OUTLINES ).forEach( ( entry, i ) => outlineBox( outlines[ i ], memberBox( entry ) ) );

				}

				_box.copy( groupBox );

			} else if ( selected ) {

				_box.setFromObject( selected.pivot );
				highlight.setFromObject( selected.pivot );

			}

			// Handles and the toolbar are for the pointer: not while it's captured to look around,
			// or for something hidden (an excavation once the library closes).
			const target = group ?? selected;
			const seen = group ? selection.some( e => isVisible( e.pivot ) ) : selected && isVisible( selected.pivot );
			const shown = target && ! controls.locked && ! isDriving() && seen ? target : null;
			handles.update( shown, _box );
			// Out of the way while the item is moved or a handle dragged.
			toolbar.update( dragging?.moved || handles.busy ? null : shown, _box, handles.onScreen() );
			if ( placing?.entry && placing.commitWhenLoaded ) commitPlacing( false );
			editBar.update( {
				shown: ( open || selection.length > 1 ) && ! isDriving(),
				boxing: boxMode,
				selected: selection.length,
				canPaste: !! clipboard || hasStoredClipboard(),
				undo: history.undoLabel,
				redo: history.redoLabel,
			} );

		},
		isOpen: () => open,
		// The one selected; null with none, or with several (getSelection has those).
		getSelected: () => selection.length > 1 ? null : selected,
		getSelection: () => [ ...selection ],
		setSelection: ( entries, primary ) => setSelection( entries, primary ),
		deselect: () => select( null ),
		select: entry => select( entry ),
		copy: () => copySelection(),
		cut: () => cutSelection(),
		// Paste at a point on the screen ({ x, y }), or the middle of the view; resolves to what was placed.
		paste: at => paste( at ?? null ),
		duplicate: () => duplicateSelection(),
		deleteSelected: () => deleteItems( selection ),
		rotateSelected: degrees => rotateSelected( degrees ),
		setBoxMode: on => setBoxMode( on ),
		get boxMode() {

			return boxMode;

		},
		history,
		raising,
		editBar,
		addTool,
		setGate,
		setRowMaker,
		isLocked,
		pickLocked,
		startLine,
		finishLine,
		undoPoint,
		cancelPlacing,
		cancelDrawing,
		// The tool in use, if any (a markup's: markups.js).
		getTool: () => drawing?.tool ?? null,
		// The line being drawn, if any: { name, points } (how many).
		getLine: () => drawing?.tool.mode === 'line' ? { name: drawing.tool.name, points: drawing.points.length } : null,
		cardFor: id => cards.find( c => c.item.id === id )?.card ?? null,
		handles,
		toolbar,
	};

}

function round2( v ) {

	return Math.round( v * 100 ) / 100;

}

function isVisible( object ) {

	for ( let o = object; o; o = o.parent ) if ( ! o.visible ) return false;
	return true;

}

function isInside( object, ancestor ) {

	for ( let o = object; o; o = o.parent ) if ( o === ancestor ) return true;
	return false;

}

function measure( object ) {

	new Box3().setFromObject( object ).getSize( _size );
	const round = v => Math.round( v * 10 ) / 10;
	const [ length, width ] = _size.x >= _size.z ? [ _size.x, _size.z ] : [ _size.z, _size.x ];
	return { length: round( length ), width: round( width ), height: round( _size.y ) };

}

// Small renders of the built-in pieces for their cards, drawn once when the sidebar first opens.
function renderThumbnails( cards ) {

	const size = 128;
	const renderer = new WebGLRenderer( { antialias: true, alpha: true, preserveDrawingBuffer: true } );
	renderer.setSize( size, size );
	const scene = new Scene();
	scene.add( new HemisphereLight( 0xffffff, 0x667066, 2 ) );
	const sun = new DirectionalLight( 0xffffff, 2 );
	sun.position.set( - 3, 5, - 4 );
	scene.add( sun );
	const camera = new PerspectiveCamera( 30, 1, 0.01, 1000 );

	for ( const { item, thumb } of cards ) {

		const object = buildProcedural( item.id );
		scene.add( object );
		const box = new Box3().setFromObject( object );
		box.getCenter( _center );
		const radius = box.getSize( _size ).length() / 2;
		const distance = radius / Math.sin( camera.fov * Math.PI / 360 ) * 1.05;
		// Three-quarter view from the front-left, slightly above.
		camera.position.copy( _center ).add( new Vector3( - 0.6, 0.45, - 0.75 ).normalize().multiplyScalar( distance ) );
		camera.lookAt( _center );
		camera.updateProjectionMatrix();
		renderer.render( scene, camera );
		thumb.src = renderer.domElement.toDataURL();
		scene.remove( object );
		object.traverse( o => o.geometry?.dispose() );

	}

	renderer.dispose();
	renderer.forceContextLoss();

}
