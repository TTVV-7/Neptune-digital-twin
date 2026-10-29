import GUI from 'lil-gui';
import { PLACES } from './config.js';

const STORAGE_KEY = 'neptune-twin.places';

// Panel (toggle with M) for naming places on site. Changes are kept in this browser;
// "Copy all places" gives a list to paste into PLACES in src/config.js (or send to Claude)
// so that everyone sees them.
export function createPlacesPanel( places, { getLookPoint, goTo } ) {

	const gui = new GUI( { title: 'Places  (M)', container: document.getElementById( 'right' ) } );
	gui.hide();
	const folders = new Map();

	const save = () => storage( () => localStorage.setItem( STORAGE_KEY, JSON.stringify( places.entries.map( e => places.toConfig( e ) ) ) ) );

	function addFolder( entry ) {

		const { state } = entry;
		const folder = gui.addFolder( state.name );
		const apply = () => {

			places.apply( entry );
			folder.title( state.name );
			save();

		};

		folder.add( state, 'name' ).onFinishChange( apply );
		folder.add( state, 'east' ).step( 0.5 ).name( 'east (m)' ).onFinishChange( apply );
		folder.add( state, 'north' ).step( 0.5 ).name( 'north (m)' ).onFinishChange( apply );
		folder.add( state, 'heading', 0, 360, 1 ).name( 'heading (°)' ).onFinishChange( apply );
		folder.add( state, 'length', 0, 200, 0.1 ).name( 'block length (m)' ).onFinishChange( apply );
		folder.add( state, 'width', 0, 100, 0.1 ).name( 'block width (m)' ).onFinishChange( apply );
		folder.add( state, 'height', 0, 50, 0.1 ).name( 'block height (m)' ).onFinishChange( apply );

		const actions = {
			go: () => goTo( entry ),
			here: () => {

				const point = getLookPoint();
				if ( ! point ) return;
				places.moveTo( entry, point );
				folder.controllers.forEach( c => c.updateDisplay() );
				save();

			},
			remove: () => {

				places.remove( entry );
				folder.destroy();
				folders.delete( entry );
				save();

			},
		};
		folder.add( actions, 'go' ).name( 'Go there' );
		folder.add( actions, 'here' ).name( 'Move to where I\'m looking' );
		folder.add( actions, 'remove' ).name( 'Remove' );
		folder.close();
		folders.set( entry, folder );
		return folder;

	}

	function load( list ) {

		for ( const folder of folders.values() ) folder.destroy();
		folders.clear();
		places.clear();
		for ( const config of list ) addFolder( places.add( config ) );

	}

	const top = {
		add: () => {

			const point = getLookPoint();
			const entry = places.add( { name: `Place ${ places.entries.length + 1 }` } );
			if ( point ) places.moveTo( entry, point );
			addFolder( entry ).open();
			save();

		},
		copy: () => copyText( JSON.stringify( places.entries.map( e => places.toConfig( e ) ), null, '\t' ) ),
		reset: () => {

			storage( () => localStorage.removeItem( STORAGE_KEY ) );
			load( PLACES );

		},
	};
	gui.add( { hint: 'Blocks: set length, width and height; 0 = label only' }, 'hint' ).name( 'Tip' ).disable();
	gui.add( top, 'add' ).name( 'Add a place where I\'m looking' );
	gui.add( top, 'copy' ).name( 'Copy all places' );
	gui.add( top, 'reset' ).name( 'Reset to the shared list' );

	let saved = null;
	storage( () => saved = JSON.parse( localStorage.getItem( STORAGE_KEY ) ) );
	load( Array.isArray( saved ) ? saved : PLACES );

	// Clicking a label opens its settings.
	places.onClick = entry => {

		gui.show();
		folders.get( entry )?.open();

	};

	window.addEventListener( 'keydown', e => {

		const t = e.target;
		if ( e.code === 'KeyM' && ! e.repeat && ! ( t instanceof HTMLInputElement || t instanceof HTMLSelectElement ) ) gui.show( gui._hidden );

	} );

	return gui;

}

function copyText( text ) {

	console.log( text );
	navigator.clipboard?.writeText( text ).then(
		() => toast( 'Places copied. Paste them into PLACES in src/config.js, or send them to Claude.' ),
		() => window.prompt( 'Copy this:', text ),
	);

}

function toast( message ) {

	const el = document.createElement( 'div' );
	el.className = 'toast';
	el.textContent = message;
	document.body.appendChild( el );
	setTimeout( () => el.remove(), 4000 );

}

// localStorage can throw in private windows; the panel still works for this visit.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
