import GUI from 'lil-gui';
import { isTyping } from './walk.js';
import { getKind } from './kinds.js';

// Common model units, as the scale that converts them to metres.
const UNITS = { metres: 1, centimetres: 0.01, millimetres: 0.001, feet: 0.3048, inches: 0.0254 };

// Panel (toggle with P) for fine-tuning placed models by the numbers and lining your own models
// up with the Google tiles. "Copy config" gives you an entry to paste into MODELS in src/config.js.
export function createPlacementPanel( models, { getPlayerPosition } ) {

	const gui = new GUI( { title: 'Model placement  (P)' } );
	gui.hide();

	const empty = gui.add( { hint: 'Drop a .glb file on the page' }, 'hint' ).name( 'No models yet' ).disable();
	const folders = new Map();
	const paramViews = new Map();
	const readoutViews = new Map();

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
		const kind = getKind( entry.kind );
		if ( kind ) {

			// Kinds (flatten areas, stockpiles...) are sized by their own params rather than scaled.
			// The controllers edit a copy, so a value the kind clamps shows clamped.
			const params = { ...entry.params };
			const set = key => {

				models.setParams( entry, { [ key ]: params[ key ] } );
				Object.assign( params, entry.params );
				folder.controllersRecursive().forEach( c => c.updateDisplay() );

			};
			for ( const field of kind.fields ) {

				let controller;
				if ( field.options ) controller = folder.add( params, field.key, field.options );
				else if ( field.type === 'color' ) controller = folder.addColor( params, field.key );
				else {

					controller = folder.add( params, field.key );
					if ( field.min !== undefined ) controller.min( field.min );
					if ( field.max !== undefined ) controller.max( field.max );
					if ( field.step !== undefined ) controller.step( field.step );

				}

				controller.name( field.label ?? field.key );
				// Text and colours apply when finished, numbers and choices as they change.
				if ( field.type === 'text' || field.type === 'color' ) controller.onFinishChange( () => set( field.key ) );
				else controller.onChange( () => set( field.key ) );

			}

			// Read-only figures, e.g. a stockpile's volume and weight, refreshed on every change.
			const readouts = {};
			for ( const readout of kind.readouts ?? [] ) {

				readouts[ readout.label ] = '';
				folder.add( readouts, readout.label ).disable();

			}

			const refresh = () => {

				for ( const readout of kind.readouts ?? [] ) readouts[ readout.label ] = String( readout.get( entry ) ?? '' );

			};
			refresh();
			readoutViews.set( entry, refresh );
			for ( const action of kind.actions ) folder.add( { run: () => action.run( entry ) }, 'run' ).name( action.label );
			// Keep the copy in step when params change elsewhere (e.g. a pour finishing).
			paramViews.set( entry, params );

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
	models.addEventListener( 'change', ( { entry } ) => {

		if ( paramViews.has( entry ) ) Object.assign( paramViews.get( entry ), entry.params );
		readoutViews.get( entry )?.();
		folders.get( entry )?.controllersRecursive().forEach( c => c.updateDisplay() );

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		folders.get( entry )?.destroy();
		folders.delete( entry );
		paramViews.delete( entry );
		readoutViews.delete( entry );
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

	// Refresh an entry's readouts and controllers, e.g. while a stockpile is being poured.
	function refresh( entry ) {

		if ( paramViews.has( entry ) ) Object.assign( paramViews.get( entry ), entry.params );
		readoutViews.get( entry )?.();
		folders.get( entry )?.controllersRecursive().forEach( c => c.updateDisplay() );

	}

	return { gui, focus, refresh };

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
