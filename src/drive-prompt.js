import { Vector3 } from 'three';
import { itemConfig } from './library.js';
import { specFor } from './drive.js';
import { isTyping } from './walk.js';
import { showDrivingKeys } from './legend.js';

// V drives the selected vehicle or machine, else the nearest one within V_REACH metres, else a new
// pickup in front of you. Walking or flying within PROMPT_REACH metres of one, a prompt near the
// bottom of the screen says so, with a Drive button for touch screens and the mouse; starting a
// drive shows its keys for a few seconds.
const V_REACH = 25;
const PROMPT_REACH = 12;

const _point = new Vector3();

export function setUpDriving( { driver, models, library, camera, getSidebar, getPlayer, onError } ) {

	// The same rule as ever: the library's Vehicles, and anything else with its own "drive" tuning.
	const vehicles = new Map( library.filter( item => item.category === 'Vehicles' || item.drive ).map( item => [ item.id, item ] ) );
	const isDrivable = entry => !! entry && vehicles.has( entry.library ) && ! entry.placing && models.entries.includes( entry );

	const prompt = document.getElementById( 'drive-prompt' );
	const promptName = prompt.querySelector( '.name' );
	const sidebarElement = document.getElementById( 'library' );
	let promptFor = null;
	prompt.querySelector( 'button' ).addEventListener( 'click', () => {

		if ( promptFor ) startDriving( promptFor );

	} );

	// How far the camera is (m) from the outside of the entry's box, turned with it: from its middle
	// a long semi or a crane would have to be walked right up to.
	function distanceTo( entry ) {

		entry.pivot.updateWorldMatrix( true, false );
		entry.footprint.clampPoint( entry.pivot.worldToLocal( _point.copy( camera.position ) ), _point );
		return entry.pivot.localToWorld( _point ).distanceTo( camera.position );

	}

	// What V would drive now, as { entry, distance, selected }; null when it would bring a new pickup.
	function target() {

		const selected = getSidebar()?.getSelected();
		if ( isDrivable( selected ) ) return { entry: selected, distance: distanceTo( selected ), selected: true };
		let nearest = null;
		for ( const entry of models.entries ) {

			if ( ! isDrivable( entry ) ) continue;
			const distance = distanceTo( entry );
			if ( distance < V_REACH && ( ! nearest || distance < nearest.distance ) ) nearest = { entry, distance, selected: false };

		}

		return nearest;

	}

	// Drive `entry`, or with none what V would drive (bringing a pickup if need be). Also what the
	// selection's Drive button calls. Resolves to the entry being driven, or null.
	async function startDriving( entry = target()?.entry ) {

		if ( driver.active ) return null;
		if ( entry && ! isDrivable( entry ) ) return null;
		entry ??= await newPickup();
		if ( ! entry || driver.active ) return null;
		getSidebar()?.deselect();
		driver.start( entry, specFor( vehicles.get( entry.library ) ) );
		showDrivingKeys( driver.machine ? 'excavator' : 'drive' );
		update();
		return entry;

	}

	async function newPickup() {

		const pickup = library.find( item => item.id === 'pickup-truck' );
		if ( ! pickup ) return null;
		const player = getPlayer();
		const rad = player.heading * Math.PI / 180;
		try {

			return await models.load( itemConfig( pickup, { east: player.east + Math.sin( rad ) * 6, north: player.north + Math.cos( rad ) * 6, heading: player.heading } ) );

		} catch ( err ) {

			onError( `Could not load the pickup: ${ err.message }` );
			return null;

		}

	}

	// What V does, for the status readout.
	function describe() {

		if ( driver.active ) return 'V or Esc: get out';
		const near = target();
		if ( ! near ) return 'V: drive a new pickup';
		return `V: drive the ${ near.selected ? 'selected ' : '' }${ near.entry.state.name }, ${ Math.round( near.distance ) } m away`;

	}

	// The prompt shows while walking or flying near something to drive, not while placing an item
	// or drawing an area (V does nothing different then, but the prompt would be in the way).
	function update() {

		const near = driver.active || sidebarElement.classList.contains( 'placing' ) ? null : target();
		promptFor = near && near.distance <= PROMPT_REACH ? near.entry : null;
		prompt.hidden = ! promptFor;
		document.body.classList.toggle( 'drive-prompt', !! promptFor );
		if ( promptFor ) promptName.textContent = promptFor.state.name;

	}

	window.addEventListener( 'keydown', e => {

		if ( e.code !== 'KeyV' || e.repeat || driver.active || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		startDriving();

	}, true );

	return { target, isDrivable, startDriving, describe, update };

}
