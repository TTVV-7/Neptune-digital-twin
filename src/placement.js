import GUI from 'lil-gui';
import { isTyping } from './walk.js';

// Common model units, as the scale that converts them to metres.
const UNITS = { metres: 1, centimetres: 0.01, millimetres: 0.001, feet: 0.3048, inches: 0.0254 };

// Panel (toggle with P) for lining your models up with the Google tiles.
// "Copy config" gives you an entry to paste into MODELS in src/config.js.
export function createPlacementPanel( models, { getPlayerPosition } ) {

	const gui = new GUI( { title: 'Model placement  (P)' } );
	gui.hide();

	const empty = gui.add( { hint: 'Drop a .glb file on the page' }, 'hint' ).name( 'No models yet' ).disable();
	const folders = new Map();

	function addEntry( entry ) {

		empty.hide();
		const { state } = entry;
		const folder = gui.addFolder( state.name );
		const apply = () => models.apply( entry );

		folder.add( state, 'east' ).step( 0.1 ).name( 'east (m)' ).onChange( apply );
		folder.add( state, 'north' ).step( 0.1 ).name( 'north (m)' ).onChange( apply );
		const up = folder.add( state, 'up' ).step( 0.05 ).name( 'up (m)' ).onChange( apply );
		folder.add( state, 'snap' ).name( 'snap to ground' ).onChange( v => {

			up.enable( ! v );
			apply();

		} );
		folder.add( state, 'heading', 0, 360, 0.1 ).name( 'heading (°)' ).onChange( apply );
		// Not explicitly stepped, so exact factors such as 0.0254 survive.
		const scale = folder.add( state, 'scale' ).min( 0.000001 ).step( 0.001, false ).onChange( apply );
		folder.add( { units: state.scale }, 'units', UNITS ).name( 'model units' ).onChange( v => {

			state.scale = v;
			scale.updateDisplay();
			apply();

		} );
		up.enable( ! state.snap );

		const actions = {
			moveHere() {

				models.moveTo( entry, getPlayerPosition() );
				folder.controllers.forEach( c => c.updateDisplay() );

			},
			copyConfig() {

				copyText( JSON.stringify( models.toConfig( entry ), null, '\t' ) + ',' );

			},
			remove() {

				models.remove( entry );
				folder.destroy();
				folders.delete( entry );
				if ( folders.size === 0 ) empty.show();

			},
		};
		folder.add( actions, 'moveHere' ).name( 'Move to where I am' );
		folder.add( actions, 'copyConfig' ).name( 'Copy config' );
		folder.add( actions, 'remove' ).name( 'Remove' );

		folders.set( entry, folder );

	}

	models.onAdd = entry => {

		addEntry( entry );
		gui.show();

	};
	models.onChange = entry => folders.get( entry )?.controllers.forEach( c => c.updateDisplay() );

	// Capture phase, because lil-gui stops key events from bubbling out of its controls.
	window.addEventListener( 'keydown', e => {

		if ( e.code === 'KeyP' && ! e.repeat && ! isTyping( e ) && ! e.ctrlKey && ! e.metaKey && ! e.altKey ) gui.show( gui._hidden );

	}, true );

	return gui;

}

function copyText( text ) {

	console.log( text );
	navigator.clipboard?.writeText( text ).then(
		() => toast( 'Config copied — paste it into MODELS in src/config.js' ),
		() => window.prompt( 'Copy this into MODELS in src/config.js:', text ),
	) ?? window.prompt( 'Copy this into MODELS in src/config.js:', text );

}

function toast( message ) {

	const el = document.createElement( 'div' );
	el.className = 'toast';
	el.textContent = message;
	document.body.appendChild( el );
	setTimeout( () => el.remove(), 3000 );

}
