import GUI from 'lil-gui';

// Panel (toggle with P) for lining your models up with the Google tiles.
// "Copy config" gives you an entry to paste into MODELS in src/config.js.
export function createPlacementPanel( models, { getPlayerPose } ) {

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
		folder.add( state, 'scale', 0.001, 10, 0.001 ).onChange( apply );
		up.enable( ! state.snap );

		const actions = {
			moveHere() {

				const { position, heading } = getPlayerPose();
				models.moveTo( entry, position, heading );
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

	window.addEventListener( 'keydown', e => {

		if ( e.code === 'KeyP' && ! e.repeat && ! ( e.target instanceof HTMLInputElement ) ) gui.show( gui._hidden );

	} );

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
