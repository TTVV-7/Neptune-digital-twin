import './layers.css';
import { CATEGORY_ORDER } from './library.js';
import { listKinds } from './kinds.js';
import { isTyping } from './walk.js';
import { toast } from './placement.js';

// The Show panel, on the right on top of the Controls panel (legend.js places the two together):
// what's drawn. Each layer has an eye to hide it: the flatten areas' red boxes, the excavations'
// and stockpiles' outlines and labels, laydown areas, the shoring in pits, all the floating
// labels, and each library category with something placed (they come and go by themselves as
// things are placed). Before / After (B) shows the site as Google captured it, with nothing
// flattened, dug, piled or placed, or with all of it. Items hidden by hand (the selection
// toolbar's Hide) are listed, to show them again. It folds away to a small eye button; whether
// it's open is remembered in this browser.
//
// Layers and Before / After are up to each viewer, and remembered in this browser. Items hidden by
// hand are part of the plan: saved with the layout, and hidden on its share link too (models.js).
// Whatever is hidden isn't drawn, clicked or bumped into; nothing is moved or deleted.
//
// Other modules add layers of their own with addLayer( id, { name, count(), setShown( on ) } ),
// and follow Before / After with onBeforeAfter( before => ... ).

const STORAGE_KEY = 'neptune-twin.layers';
// Narrower than this (px) counts as a phone: the panel starts folded away, as the Controls do.
const PHONE_WIDTH = 700;
// Placed models that aren't library items: dropped on the page or listed in config.js.
const YOUR_MODELS = 'Your models';
const OTHER = 'Other';
const LABELS = 'labels';
// What the Labels layer counts and hides (earthworks.js, laydown.js).
const LABEL_ELEMENTS = '.earthworks-labels .label, .laydown-label';
// Counts that change as things move (a pit given shoring) are looked at again this often (ms).
const CHANGE_DELAY = 300;

const icon = paths => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ paths }</svg>`;
const EYE_PATHS = '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>';
const EYE = icon( EYE_PATHS );
const EYE_OFF = icon( `${ EYE_PATHS }<path d="M4 20 20 4"/>` );

// models, layout, library: what's placed, the saved layout and the library's items. flattening:
// flatten.js, turned off for Before. isDriving: Before / After waits until you get out. legend:
// the Controls panel, which this one stands on.
export function createLayers( { models, layout, library, flattening, isDriving, legend } ) {

	const root = document.getElementById( 'layers' );
	const panel = root.querySelector( '.layers-panel' );
	const button = root.querySelector( '.layers-open' );
	const rowsElement = panel.querySelector( '.rows' );
	const hiddenElement = panel.querySelector( '.hidden-items' );
	const hiddenHeading = hiddenElement.querySelector( '.heading' );
	const hiddenList = hiddenElement.querySelector( 'ul' );
	const views = [ ...panel.querySelectorAll( '[data-view]' ) ];
	const beforeNote = panel.querySelector( '.before-note' );
	const badge = button.querySelector( '.badge' );
	const buttonIcon = button.querySelector( '.icon' );
	const categories = new Map( library.map( item => [ item.id, item.category ] ) );
	// Library items placed as a kind (the tower crane, set up in the P panel) go in their category's
	// row with the other cranes, not with the site's areas; their layouts don't save the item's id.
	const kindCategories = new Map( library.filter( item => item.kind ).map( item => [ item.kind, item.category ] ) );

	const saved = storage( () => JSON.parse( localStorage.getItem( STORAGE_KEY ) ) ) ?? {};
	const hiddenLayers = new Set( Array.isArray( saved.hidden ) ? saved.hidden.filter( id => typeof id === 'string' ) : [] );
	let before = saved.before === true;
	// What legend.js needs to stack this panel on the Controls: open is what the viewer chose, and
	// insist says it was opened by hand, so it shows even where there's no room for it.
	const dock = { root, panel, button, open: typeof saved.open === 'boolean' ? saved.open : window.innerWidth >= PHONE_WIDTH, insist: false };

	const custom = new Map(); // id -> { name, count(), setShown( on ) }
	const beforeAfter = [];
	// Being placed: once put down it shows, whatever its layer said (see reveal()).
	const placing = new WeakSet();
	// The hidden items as last listed, to find the one whose Show was pressed.
	let listed = [];
	let shown = '';

	const categoryOf = entry => kindCategories.get( entry.kind ) ?? categories.get( entry.library ) ?? ( entry.library ? OTHER : YOUR_MODELS );
	const layerOf = entry => entry.kind && ! kindCategories.has( entry.kind ) ? `kind:${ entry.kind }` : `category:${ categoryOf( entry ) }`;
	const drawn = id => ! before && ! hiddenLayers.has( id );
	models.concealed = entry => before || hiddenLayers.has( layerOf( entry ) );

	function layerName( id ) {

		if ( custom.has( id ) ) return custom.get( id ).name;
		if ( id.startsWith( 'category:' ) ) return id.slice( 'category:'.length );
		const kind = listKinds().find( k => `kind:${ k.name }` === id );
		return kind ? kind.layer ?? `${ kind.label }s` : id;

	}

	function save() {

		storage( () => localStorage.setItem( STORAGE_KEY, JSON.stringify( { open: dock.open, hidden: [ ...hiddenLayers ], before } ) ) );

	}

	// Draw what the layers and Before / After now say, and the panel with them.
	function apply() {

		models.refreshHidden();
		for ( const [ id, layer ] of custom ) layer.setShown( drawn( id ) );
		render();

	}

	function setLayerShown( id, on ) {

		if ( on !== hiddenLayers.has( id ) ) return;
		if ( on ) hiddenLayers.delete( id );
		else hiddenLayers.add( id );
		save();
		apply();

	}

	// Before: the site as Google captured it. Not while driving, where the ground you're on would
	// change under you (and an excavator would dig into ground that isn't drawn).
	function setBefore( on, say = false ) {

		if ( on === before ) return;
		if ( isDriving() ) {

			toast( 'Get out first (V or Esc): then B shows the site before or after your changes' );
			return;

		}

		before = on;
		save();
		flattening.setEnabled( ! on );
		for ( const fn of beforeAfter ) fn( on );
		apply();
		if ( say ) toast( on ? 'Before: the site as Google captured it. B shows your changes' : 'After: with your changes' );

	}

	// Something put down while it would be hidden (its layer off, or Before on) brings that back
	// rather than vanishing as it's placed.
	function reveal( entry ) {

		if ( entry.hidden ) return;
		if ( before ) {

			setBefore( false );
			toast( 'Showing your changes again' );

		}

		const id = layerOf( entry );
		if ( ! hiddenLayers.has( id ) ) return;
		setLayerShown( id, true );
		toast( `${ layerName( id ) } shown again` );

	}

	// Show an item hidden by hand, and its layer if that's off: Show is for seeing it.
	function showItems( entries ) {

		for ( const entry of entries ) {

			models.setHidden( entry, false );
			setLayerShown( layerOf( entry ), true );

		}

	}

	models.addEventListener( 'add', ( { entry } ) => {

		if ( entry.placing ) placing.add( entry );
		else if ( ! layout.loading ) reveal( entry );
		soon();

	} );
	models.addEventListener( 'change', ( { entry } ) => {

		later();
		if ( ! placing.has( entry ) || entry.placing ) return;
		placing.delete( entry );
		reveal( entry );

	} );
	// Hidden or shown by hand, or deleted: the panel says so straight away.
	for ( const type of [ 'remove', 'hide', 'visibility' ] ) models.addEventListener( type, () => render() );

	// --- the panel ---------------------------------------------------------------------------

	button.addEventListener( 'click', () => setOpen( true ) );
	panel.querySelector( '.hide' ).addEventListener( 'click', () => setOpen( false ) );
	for ( const view of views ) view.addEventListener( 'click', () => setBefore( view.dataset.view === 'before', true ) );
	rowsElement.addEventListener( 'click', e => {

		const row = e.target.closest( '[data-layer]' );
		if ( row ) setLayerShown( row.dataset.layer, hiddenLayers.has( row.dataset.layer ) );

	} );
	hiddenElement.addEventListener( 'click', e => {

		if ( e.target.closest( '.show-all' ) ) showItems( listed );
		const item = e.target.closest( '[data-item]' );
		if ( item ) showItems( [ listed[ Number( item.dataset.item ) ] ].filter( Boolean ) );

	} );

	function setOpen( value ) {

		dock.open = value;
		dock.insist = value;
		save();
		render();

	}

	// The rows, as { site, items }: [ { id, name, count } ]. A layer shows while something is in
	// it, or while it's switched off (to switch it back on).
	function rows() {

		const placed = models.entries.filter( entry => ! entry.placing );
		const counts = new Map();
		for ( const entry of placed ) counts.set( layerOf( entry ), ( counts.get( layerOf( entry ) ) ?? 0 ) + 1 );
		const row = ( id, name, count = counts.get( id ) ?? 0 ) => ( { id, name, count, shown: ! hiddenLayers.has( id ) } );
		const keep = r => r.count > 0 || ! r.shown;

		// The Labels layer goes last.
		const others = [ ...custom ].sort( ( [ a ], [ b ] ) => ( a === LABELS ) - ( b === LABELS ) );
		const site = [
			...listKinds().filter( kind => ! kindCategories.has( kind.name ) ).map( kind => row( `kind:${ kind.name }`, kind.layer ?? `${ kind.label }s` ) ),
			...others.map( ( [ id, layer ] ) => row( id, layer.name, layer.count() ) ),
		].filter( keep );

		const names = new Set( placed.map( layerOf ).filter( id => id.startsWith( 'category:' ) ).map( id => id.slice( 'category:'.length ) ) );
		for ( const id of hiddenLayers ) if ( id.startsWith( 'category:' ) ) names.add( id.slice( 'category:'.length ) );
		const rank = name => {

			const i = CATEGORY_ORDER.indexOf( name );
			return name === YOUR_MODELS ? Infinity : name === OTHER ? CATEGORY_ORDER.length + 1 : i === - 1 ? CATEGORY_ORDER.length : i;

		};
		const items = [ ...names ]
			.sort( ( a, b ) => rank( a ) - rank( b ) || a.localeCompare( b ) )
			.map( name => row( `category:${ name }`, name ) )
			.filter( keep );
		return { site, items };

	}

	// Redraws only what changed. Then the Controls panel places the two of them again.
	function render() {

		const { site, items } = rows();
		listed = models.entries.filter( entry => entry.hidden && ! entry.placing )
			.sort( ( a, b ) => a.state.name.localeCompare( b.state.name ) );
		const hidden = listed.map( entry => [ entry.state.name, layerName( layerOf( entry ) ) ] );
		const key = JSON.stringify( [ dock.open, before, site, items, hidden ] );
		if ( key !== shown ) {

			shown = key;
			for ( const view of views ) view.setAttribute( 'aria-checked', String( ( view.dataset.view === 'before' ) === before ) );
			panel.classList.toggle( 'before', before );
			beforeNote.hidden = ! before;
			rowsElement.replaceChildren( ...group( 'On the site', site, items.length > 0 ), ...group( 'Placed items', items, site.length > 0 ) );
			if ( site.length + items.length === 0 ) {

				const empty = document.createElement( 'p' );
				empty.className = 'empty';
				empty.textContent = 'Nothing placed yet. What you place can be hidden here.';
				rowsElement.append( empty );

			}

			hiddenElement.hidden = listed.length === 0;
			hiddenHeading.textContent = `Hidden items (${ listed.length })`;
			hiddenList.replaceChildren( ...hidden.map( ( [ name, what ], i ) => {

				const item = document.createElement( 'li' );
				const label = Object.assign( document.createElement( 'span' ), { className: 'name', textContent: name, title: `${ name } · ${ what }` } );
				const kind = Object.assign( document.createElement( 'span' ), { className: 'what', textContent: what } );
				const show = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'show', textContent: 'Show', title: `Show ${ name }` } );
				show.dataset.item = String( i );
				item.append( label, kind, show );
				return item;

			} ) );

			// Folded, the button says whether anything is hidden, and when it's showing Before.
			const hiding = hiddenLayers.size > 0 || listed.length > 0;
			buttonIcon.innerHTML = hiding ? EYE_OFF : EYE;
			badge.hidden = ! before;
			button.title = `Show panel: what's drawn, and before / after your changes${ before ? '. Showing before' : hiding ? '. Some things are hidden' : '' }`;

		}

		root.hidden = false;
		legend.update();

	}

	// A heading (when the other group has rows too) and a row per layer: its eye, name and count.
	function group( title, list, headed ) {

		if ( list.length === 0 ) return [];
		const elements = list.map( ( { id, name, count, shown: on } ) => {

			const row = document.createElement( 'button' );
			row.type = 'button';
			row.className = 'layer';
			row.dataset.layer = id;
			row.setAttribute( 'aria-pressed', String( on ) );
			row.title = on ? `Hide ${ name.toLowerCase() }` : `Show ${ name.toLowerCase() }`;
			row.innerHTML = `${ on ? EYE : EYE_OFF }<span class="name"></span><span class="count">${ count }</span>`;
			row.querySelector( '.name' ).textContent = name;
			return row;

		} );
		if ( ! headed ) return elements;
		return [ Object.assign( document.createElement( 'h3' ), { textContent: title } ), ...elements ];

	}

	let pending = false;
	function soon() {

		if ( pending ) return;
		pending = true;
		requestAnimationFrame( () => {

			pending = false;
			render();

		} );

	}

	let timer = null;
	function later() {

		if ( timer !== null ) return;
		timer = setTimeout( () => {

			timer = null;
			render();

		}, CHANGE_DELAY );

	}

	// B switches between before and after, wherever the panel is.
	window.addEventListener( 'keydown', e => {

		if ( e.code !== 'KeyB' || e.repeat || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		setBefore( ! before, true );

	}, true );

	const api = {

		addLayer( id, spec ) {

			custom.set( id, spec );
			spec.setShown( drawn( id ) );
			soon();

		},

		// fn( before ) now and whenever Before / After is switched.
		onBeforeAfter( fn ) {

			beforeAfter.push( fn );
			fn( before );

		},

		get before() {

			return before;

		},

		setBefore,
		isLayerShown: id => ! hiddenLayers.has( id ),
		setLayerShown,
		layerOf,
		showItems,
		showAll: () => showItems( models.entries.filter( entry => entry.hidden ) ),
		update: render,
		isOpen: () => dock.open,
		setOpen,

	};

	// Every floating label (laydown areas, pits, piles): drawn by the page, hidden by a class.
	api.addLayer( LABELS, {
		name: 'Labels',
		count: () => document.querySelectorAll( LABEL_ELEMENTS ).length,
		setShown: on => document.body.classList.toggle( 'labels-hidden', ! on ),
	} );

	// A saved Before turns the flattening off from the start (earthworks follows onBeforeAfter).
	flattening.setEnabled( ! before );
	models.refreshHidden();
	legend.stack( dock );
	render();
	return api;

}

// localStorage can throw in private windows; the panel still works without it.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
