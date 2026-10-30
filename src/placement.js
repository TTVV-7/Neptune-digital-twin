import GUI from 'lil-gui';
import { isTyping } from './walk.js';

// Common model units, as the scale that converts them to metres.
const UNITS = { metres: 1, centimetres: 0.01, millimetres: 0.001, feet: 0.3048, inches: 0.0254 };

// Panel (toggle with P) for fine-tuning placed models by the numbers and lining your own models
// up with the Google tiles. "Copy config" gives you an entry to paste into MODELS in src/config.js.
export function createPlacementPanel( models, { getPlayerPosition } ) {

	const gui = new GUI( { title: 'Model placement  (P)' } );
	gui.hide();

	const empty = gui.add( { hint: 'Drop a .glb file on the page' }, 'hint' ).name( 'No models yet' ).disable();
	const folders = new Map();

	function addEntry( entry ) {

		empty.hide();
		const { state } = entry;
		const folder = gui.addFolder( state.name ).close();
		const apply = () => models.apply( entry );

		folder.add( state, 'east' ).step( 0.1 ).name( 'east (m)' ).onChange( apply );
		folder.add( state, 'north' ).step( 0.1 ).name( 'north (m)' ).onChange( apply );
		const up = folder.add( state, 'up' ).step( 0.05 ).name( 'up (m)' ).onChange( apply );
		folder.add( state, 'snap' ).name( 'snap to ground' ).onChange( v => {

			up.enable( ! v );
			apply();

		} );
		folder.add( state, 'heading', 0, 360, 0.1 ).name( 'heading (°)' ).onChange( apply );
		if ( entry.zone ) {

			// A flatten zone is sized directly in metres rather than scaled.
			const size = { width: entry.zone.width, length: entry.zone.length };
			const resize = () => models.setZoneSize( entry, Math.max( 1, size.width ), Math.max( 1, size.length ) );
			folder.add( size, 'width' ).min( 1 ).step( 0.5 ).name( 'width (m)' ).onChange( resize );
			folder.add( size, 'length' ).min( 1 ).step( 0.5 ).name( 'length (m)' ).onChange( resize );

		} else {

			// Not explicitly stepped, so exact factors such as 0.0254 survive. No min() either: lil-gui
			// would step on a grid offset from it (1 -> 1.010001), so clamp here instead.
			const unitsState = { units: state.scale };
			const scale = folder.add( state, 'scale' ).step( 0.001, false ).onChange( () => {

				if ( ! ( state.scale > 0 ) ) {

					state.scale = 1;
					scale.updateDisplay();

				}

				unitsState.units = state.scale;
				units.updateDisplay();
				apply();

			} );
			const units = folder.add( unitsState, 'units', UNITS ).name( 'model units' ).onChange( v => {

				state.scale = v;
				scale.updateDisplay();
				apply();
				// Leave the keyboard to the scene; a focused dropdown also reacts to arrow keys.
				units.$select.blur();

			} );

		}

		up.enable( ! state.snap );

		const actions = {
			moveHere() {

				models.moveTo( entry, getPlayerPosition() );

			},
			copyConfig() {

				copyText( JSON.stringify( models.toConfig( entry ), null, '\t' ) + ',', entry.library && ! entry.inConfig );

			},
			remove() {

				models.remove( entry );

			},
		};
		folder.add( actions, 'moveHere' ).name( 'Move to where I am' );
		folder.add( actions, 'copyConfig' ).name( 'Copy config' );
		folder.add( actions, 'remove' ).name( 'Remove' );

		folders.set( entry, folder );

	}

	models.addEventListener( 'add', ( { entry } ) => {

		addEntry( entry );
		// Your own dropped models usually need lining up; library items are placed with the mouse.
		if ( ! entry.library ) focus( entry );

	} );
	models.addEventListener( 'change', ( { entry } ) => folders.get( entry )?.controllersRecursive().forEach( c => c.updateDisplay() ) );
	models.addEventListener( 'remove', ( { entry } ) => {

		folders.get( entry )?.destroy();
		folders.delete( entry );
		if ( folders.size === 0 ) empty.show();

	} );

	// Open just this entry's settings, and show the panel unless asked not to.
	function focus( entry, show = true ) {

		for ( const [ e, folder ] of folders ) folder.open( e === entry );
		if ( show ) gui.show();

	}

	// Capture phase, because lil-gui stops key events from bubbling out of its controls.
	window.addEventListener( 'keydown', e => {

		if ( e.code === 'KeyP' && ! e.repeat && ! isTyping( e ) && ! e.ctrlKey && ! e.metaKey && ! e.altKey ) gui.show( gui._hidden );

	}, true );

	return { gui, focus };

}

// alsoSaved: the item is also in this browser's saved layout, so pasting it would make two.
function copyText( text, alsoSaved ) {

	console.log( text );
	navigator.clipboard?.writeText( text ).then(
		() => toast( alsoSaved
			? 'Config copied. After pasting it into MODELS in src/config.js, remove this copy (it is also saved in this browser).'
			: 'Config copied — paste it into MODELS in src/config.js' ),
		() => window.prompt( 'Copy this into MODELS in src/config.js:', text ),
	) ?? window.prompt( 'Copy this into MODELS in src/config.js:', text );

}

export function toast( message ) {

	const el = document.createElement( 'div' );
	el.className = 'toast';
	el.textContent = message;
	document.body.appendChild( el );
	setTimeout( () => el.remove(), 3000 );

}
