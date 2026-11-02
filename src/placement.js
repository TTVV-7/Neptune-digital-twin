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
	const fieldViews = new Map();

	function addEntry( entry ) {

		empty.hide();
		const { state } = entry;
		const folder = gui.addFolder( state.name ).close();
		const apply = () => models.apply( entry );

		const kind = getKind( entry.kind );
		// Kinds (areas, pits, piles) are sized by their own params rather than scaled, and their
		// size comes first, being what's changed most. Where they are and which way they face follow.
		if ( kind ) addKindControllers( entry, kind, folder );

		folder.add( state, 'east' ).step( 0.1 ).name( 'east (m)' ).onChange( apply );
		folder.add( state, 'north' ).step( 0.1 ).name( 'north (m)' ).onChange( apply );
		const up = folder.add( state, 'up' ).step( 0.05 ).name( 'up (m)' ).onChange( apply );
		folder.add( state, 'snap' ).name( 'snap to ground' ).onChange( v => {

			up.enable( ! v );
			apply();

		} );
		folder.add( state, 'heading', 0, 360, 0.1 ).name( 'heading (°)' ).onChange( apply );
		if ( ! kind ) {

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
		if ( kind ) fitKind( folder, kind, entry, paramViews.get( entry ) );

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

	// A kind's fields, size first, then its read-only figures and its buttons.
	function addKindControllers( entry, kind, folder ) {

		// The controllers edit a copy, so a value the kind clamps shows clamped. A field that shows
		// something other than the param itself (get: a stage slider whose last step is -1) edits a
		// view of its own instead.
		const params = { ...entry.params };
		const views = new Map(); // field -> { value }
		const valueOf = field => field.get ? field.get( entry.params, entry ) : entry.params[ field.key ];
		const set = field => {

			const view = views.get( field );
			const value = view ? view.value : params[ field.key ];
			// Leaving a field without changing it isn't an edit (and would rebuild the kind).
			if ( value === valueOf( field ) ) return;
			// A field may change other params with it (patch: a pit's method sets its support too).
			models.setParams( entry, field.patch ? field.patch( value, entry.params, entry ) : { [ field.key ]: value } );
			Object.assign( params, entry.params );
			for ( const [ f, v ] of views ) v.value = valueOf( f );
			folder.controllersRecursive().forEach( c => c.updateDisplay() );
			showFields();

		};
		// Fields in a group (a pit's sides) go in a sub-folder of their own, made where the first of
		// them comes.
		const groups = new Map(); // name -> sub-folder
		const parentOf = field => {

			if ( ! field.group ) return folder;
			if ( ! groups.has( field.group ) ) groups.set( field.group, folder.addFolder( field.group ) );
			return groups.get( field.group );

		};
		const fields = [ ...kind.fields.filter( f => f.size ), ...kind.fields.filter( f => ! f.size ) ];
		const made = [];
		for ( const field of fields ) {

			const parent = parentOf( field );
			let object = params;
			let property = field.key;
			if ( field.get ) {

				object = { value: valueOf( field ) };
				property = 'value';
				views.set( field, object );

			}

			let controller;
			if ( field.options ) controller = parent.add( object, property, field.options );
			else if ( field.type === 'color' ) controller = parent.addColor( object, property );
			else {

				controller = parent.add( object, property );
				// Ends that follow the params (a function of them) are set in showFields.
				if ( field.min !== undefined && typeof field.min !== 'function' ) controller.min( field.min );
				if ( field.max !== undefined && typeof field.max !== 'function' ) controller.max( field.max );
				if ( field.step !== undefined ) controller.step( field.step );

			}

			controller.name( labelOf( field, entry ) );
			// Text and colours apply when finished, numbers and choices as they change. A colour is
			// finished when its picker closes, as well as when it loses focus.
			if ( field.type === 'text' || field.type === 'color' ) controller.onFinishChange( () => set( field ) );
			else controller.onChange( () => set( field ) );
			if ( field.type === 'color' ) controller.$input.addEventListener( 'change', () => set( field ) );
			made.push( [ field, controller ] );

		}

		// Fields that don't apply to these params (a cone's width) are hidden, and a sub-folder with
		// none showing too. Labels and slider ends that follow the params (a side's compass point
		// once the pit is turned, the last dig stage) are brought up to date.
		const showFields = () => {

			for ( const [ field, controller ] of made ) {

				if ( field.when ) controller.show( !! field.when( entry.params, entry ) );
				if ( typeof field.label === 'function' ) {

					const name = labelOf( field, entry );
					if ( controller._name !== name ) controller.name( name );

				}

				for ( const end of [ 'min', 'max' ] ) {

					if ( typeof field[ end ] !== 'function' ) continue;
					const value = field[ end ]( entry.params, entry );
					if ( controller[ `_${ end }` ] !== value ) controller[ end ]( value );

				}

			}

			for ( const sub of groups.values() ) sub.show( sub.controllers.some( c => ! c._hidden ) );

		};
		showFields();
		fieldViews.set( entry, showFields );

		// Read-only figures, e.g. a stockpile's volume and weight, refreshed on every change.
		// Worked out before the controllers are made, which show them from the start.
		const readouts = {};
		const refresh = () => {

			for ( const readout of kind.readouts ?? [] ) readouts[ readout.label ] = String( readout.get( entry ) ?? '' );

		};
		refresh();
		for ( const readout of kind.readouts ?? [] ) folder.add( readouts, readout.label ).disable();
		readoutViews.set( entry, refresh );
		for ( const action of kind.actions ) folder.add( { run: () => action.run( entry ) }, 'run' ).name( action.label );
		// Keep the copy and the views in step when params change elsewhere (e.g. a pour finishing).
		paramViews.set( entry, { params, views: [ ...views ].map( ( [ field, view ] ) => [ view, () => valueOf( field ) ] ), fields: made } );

	}

	models.addEventListener( 'add', ( { entry } ) => {

		addEntry( entry );
		// Your own dropped models usually need lining up; library items are placed with the mouse.
		if ( ! entry.library ) focus( entry );

	} );
	models.addEventListener( 'change', ( { entry } ) => refresh( entry ) );
	models.addEventListener( 'remove', ( { entry } ) => {

		folders.get( entry )?.destroy();
		folders.delete( entry );
		paramViews.delete( entry );
		readoutViews.delete( entry );
		fieldViews.delete( entry );
		if ( folders.size === 0 ) empty.show();

	} );

	// Open just this entry's settings, and show the panel unless asked not to, scrolled to them
	// when there are many. A panel folded away by its title stays folded.
	function focus( entry, show = true ) {

		for ( const [ e, folder ] of folders ) folder.open( e === entry );
		if ( ! show ) return;
		gui.show();
		const folder = folders.get( entry );
		if ( ! folder ) return;
		// Scrolled by hand: scrollIntoView could scroll the page itself as well.
		const list = gui.$children.getBoundingClientRect();
		const top = folder.domElement.getBoundingClientRect().top;
		if ( top < list.top || top > list.bottom - 40 ) gui.$children.scrollTop += top - list.top;

	}

	// Capture phase, because lil-gui stops key events from bubbling out of its controls.
	window.addEventListener( 'keydown', e => {

		if ( e.code === 'KeyP' && ! e.repeat && ! isTyping( e ) && ! e.ctrlKey && ! e.metaKey && ! e.altKey ) gui.show( gui._hidden );

	}, true );

	// Refresh an entry's readouts and controllers, e.g. while a stockpile is being poured or an area
	// re-snaps to the ground, and its title if it was renamed (a laydown area takes its label as its
	// name). The field being typed in is left alone: until it's finished, what's typed so far is only
	// in that field and the copy, and lil-gui would overwrite a text field even while it has focus.
	function refresh( entry ) {

		const folder = folders.get( entry );
		if ( ! folder ) return;
		if ( folder._title !== entry.state.name ) folder.title( entry.state.name );
		const controllers = folder.controllersRecursive();
		const editing = controllers.find( c => c.domElement.contains( document.activeElement ) );
		const copy = paramViews.get( entry );
		if ( copy ) {

			const { params, views } = copy;
			const typed = editing?.object === params ? { [ editing.property ]: params[ editing.property ] } : {};
			Object.assign( params, entry.params, typed );
			for ( const [ view, value ] of views ) if ( editing?.object !== view ) view.value = value();

		}

		readoutViews.get( entry )?.();
		fieldViews.get( entry )?.();
		for ( const controller of controllers ) if ( controller !== editing ) controller.updateDisplay();

	}

	// Whether the panel is showing this entry's settings (its folder open), as when it's selected.
	function shows( entry ) {

		const folder = folders.get( entry );
		return !! folder && ! gui._hidden && ! gui._closed && ! folder._closed;

	}

	return { gui, focus, refresh, shows };

}

// Run fn whenever a controller shows its value afresh, as it does on every change to the entry.
function onDisplay( controller, fn ) {

	const display = controller.updateDisplay.bind( controller );
	controller.updateDisplay = () => {

		display();
		fn();
		return controller;

	};
	controller.updateDisplay();

}

// A kind's fields that don't apply for now (enabled( params ) false: a shored pit's side slope)
// are greyed out. Its readouts with nothing to say (no shoring, say) are left out, and notes
// (readouts marked `note`, e.g. a warning) are written out in full across the panel, where a field
// would cut them short. params: the copy the fields edit; fields: [ field, controller ] pairs.
function fitKind( folder, kind, entry, { params, fields } ) {

	for ( const [ field, controller ] of fields ) {

		if ( field.enabled ) onDisplay( controller, () => controller.enable( field.enabled( entry.params, entry ) ) );

	}

	const specs = kind.readouts ?? [];
	const controllers = folder.controllersRecursive();
	const readouts = controllers.find( c => c.object !== params && c.property === specs[ 0 ]?.label )?.object;
	for ( const controller of controllers.filter( c => c.object === readouts ) ) {

		let text = null;
		if ( specs.find( r => r.label === controller.property )?.note ) {

			text = document.createElement( 'div' );
			text.className = 'readout-note';
			controller.domElement.classList.add( 'note' );
			controller.$widget.replaceChildren( text );

		}

		onDisplay( controller, () => {

			const value = controller.getValue();
			if ( text ) text.textContent = value;
			controller.show( value !== '' );

		} );

	}

}

// A field's label: a function of the params and the entry when it follows them (a pit's sides,
// named by which way each faces).
function labelOf( field, entry ) {

	return typeof field.label === 'function' ? field.label( entry.params, entry ) : field.label ?? field.key;

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
