import './views.css';
import { MathUtils, Vector3 } from 'three';
import { yawToHeading } from './geo.js';
import { isTyping } from './walk.js';

// Preset views of your models: a bar at the top with a button for each view a model carries (its
// glTF scene's extras: views: [ { name, from: [ x, y, z ], at: [ x, y, z ], underground } ], in the
// model's own frame), which glides the camera there, flying, wherever the model has been placed.
// With `underground`, Google's ground is cut away over your models for it (underground.js), as
// for an overview of something that's mostly below the map; views from inside a model below the
// map have it cut away by themselves. More than one model with views: a list to pick the model.
// A key, a click or the wheel stops a glide where it is.

const GLIDE_MIN = 0.7; // seconds
const GLIDE_MAX = 2.5;
const GLIDE_SPEED = 300; // metres a second, past the shortest glide

export function setUpViews( { models, controls, onUpdate, getUnderground, toast } ) {

	const bar = document.createElement( 'nav' );
	bar.id = 'views';
	bar.setAttribute( 'aria-label', 'Preset views' );
	bar.hidden = true;
	const picker = document.createElement( 'select' );
	picker.setAttribute( 'aria-label', 'Model' );
	const label = document.createElement( 'span' );
	label.className = 'model';
	const buttons = document.createElement( 'div' );
	buttons.className = 'buttons';
	bar.append( label, picker, buttons );
	document.body.append( bar );

	let current = null; // the entry whose views are shown
	let glide = null;

	const viewsOf = entry => entry.pivot.children[ 0 ]?.userData?.views?.filter( v => v?.name && v.from?.length === 3 && v.at?.length === 3 ) ?? [];
	const withViews = () => models.entries.filter( entry => ! entry.placing && viewsOf( entry ).length );

	function render() {

		const list = withViews();
		bar.hidden = list.length === 0;
		document.body.classList.toggle( 'has-views', ! bar.hidden );
		if ( bar.hidden ) {

			current = null;
			return;

		}

		if ( ! list.includes( current ) ) current = list[ 0 ];
		label.textContent = current.state.name;
		label.hidden = list.length > 1;
		picker.hidden = list.length < 2;
		picker.replaceChildren( ...list.map( ( entry, i ) => Object.assign( document.createElement( 'option' ), { value: String( i ), textContent: entry.state.name, selected: entry === current } ) ) );
		buttons.replaceChildren( ...viewsOf( current ).map( view => {

			const button = Object.assign( document.createElement( 'button' ), { type: 'button', textContent: view.name } );
			button.title = `Go to the ${ view.name } view of ${ current.state.name }`;
			button.addEventListener( 'click', () => go( current, view ) );
			return button;

		} ) );

	}

	picker.addEventListener( 'change', () => {

		current = withViews()[ Number( picker.value ) ] ?? null;
		render();

	} );
	for ( const type of [ 'add', 'remove' ] ) models.addEventListener( type, render );
	render();

	// The view in the scene's frame: the model's own frame through where it's placed now. Worked out
	// afresh every frame of a glide, so a model that settles onto sharper ground meanwhile (it
	// snaps as the map's tiles load) is still where the glide ends up.
	function pose( entry, view ) {

		const content = entry.pivot.children[ 0 ];
		content.updateWorldMatrix( true, false );
		const to = content.localToWorld( new Vector3( ...view.from ) );
		const at = content.localToWorld( new Vector3( ...view.at ) );
		const d = at.clone().sub( to );
		const heading = ( Math.atan2( - d.x, d.z ) * MathUtils.RAD2DEG + 360 ) % 360;
		const pitch = Math.asin( MathUtils.clamp( d.y / d.length(), - 1, 1 ) ) * MathUtils.RAD2DEG;
		return { to, heading, pitch };

	}

	function go( entry, view ) {

		const { to, heading } = pose( entry, view );
		if ( view.underground ) {

			const underground = getUnderground();
			if ( underground && ! underground.on ) underground.set( true );

		}

		if ( controls.mode !== 'fly' ) controls.setMode( 'fly' );
		const from = controls.camera.position.clone();
		const startHeading = yawToHeading( controls.yaw );
		const distance = from.distanceTo( to );
		glide = {
			entry, view, from, t: 0,
			duration: Math.min( GLIDE_MAX, GLIDE_MIN + distance / GLIDE_SPEED ),
			// The heading turned the short way round.
			heading: startHeading + ( ( heading - startHeading + 540 ) % 360 - 180 ) - heading,
			startHeading,
			startPitch: controls.pitch * MathUtils.RAD2DEG,
		};
		for ( const b of buttons.children ) b.classList.toggle( 'active', b.textContent === view.name );

	}

	onUpdate( dt => {

		if ( ! glide ) return;
		if ( ! models.entries.includes( glide.entry ) ) {

			glide = null;
			return;

		}

		glide.t = Math.min( 1, glide.t + dt / glide.duration );
		const e = glide.t * glide.t * ( 3 - 2 * glide.t );
		const { to, heading, pitch } = pose( glide.entry, glide.view );
		const end = heading + glide.heading;
		controls.setPose(
			glide.from.clone().lerp( to, e ),
			( MathUtils.lerp( glide.startHeading, end, e ) % 360 + 360 ) % 360,
			MathUtils.lerp( glide.startPitch, pitch, e ),
		);
		if ( glide.t >= 1 ) glide = null;

	} );

	// Taking over stops a glide where it is.
	const stop = () => {

		glide = null;

	};
	window.addEventListener( 'keydown', e => {

		if ( ! isTyping( e ) && ! e.repeat ) stop();

	} );
	controls.domElement?.addEventListener( 'pointerdown', stop );
	controls.domElement?.addEventListener( 'wheel', stop, { passive: true } );

	return {
		go: ( name, entry = current ) => {

			const view = entry && viewsOf( entry ).find( v => v.name === name );
			if ( ! view ) {

				toast?.( `No view called ${ name }` );
				return false;

			}

			go( entry, view );
			return true;

		},
		get gliding() {

			return !! glide;

		},
		update: render,
		// For a model's other tools to sit in (repair-areas.js's Edit areas).
		bar,
	};

}
