import { isTyping } from './walk.js';
import { toast } from './placement.js';

// See through the ground (the Show panel's switch, or U): Google's mesh drawn see-through, so a
// model set below grade (a gallery, a pit, a tunnel: the B2D2 repair model) shows through the
// ground and the buildings over it. How see-through is the slider beside it. It only changes how
// the tiles are drawn: walking, driving, clicking and the ground under things are as ever.
//
// Each tile's material is made transparent, at the slider's opacity, and its meshes are drawn
// after everything else (XRAY_ORDER), nearest first, still writing depth: so models and the rest
// are drawn before it and show through it, and only the nearest of Google's surfaces is laid over
// them, not every roof, wall and the ground under them blended together. New tiles as they stream
// in are made the same way. Off puts each material and mesh back as they were. Up to each viewer,
// and not remembered: a reload shows the ground solid again.

const DEFAULT_OPACITY = 0.35;
const XRAY_ORDER = 1e6;

// three.js's own order for see-through things (WebGLRenderLists' reversePainterSortStable), but
// Google's meshes, drawn last, nearest first.
function transparentSort( a, b ) {

	if ( a.groupOrder !== b.groupOrder ) return a.groupOrder - b.groupOrder;
	if ( a.renderOrder !== b.renderOrder ) return a.renderOrder - b.renderOrder;
	if ( a.z !== b.z ) return a.renderOrder === XRAY_ORDER ? a.z - b.z : b.z - a.z;
	return a.id - b.id;

}

// tiles: world.js's TilesRenderer (none without Google's map: then there's nothing to see
// through, and the switch isn't shown); renderer: the scene's.
export function setUpXray( { tiles, renderer } ) {

	const root = document.querySelector( '#layers .xray' );
	if ( ! tiles || ! root ) return null;
	root.hidden = false;
	const box = root.querySelector( '.xray-on' );
	const slider = root.querySelector( '.xray-amount' );
	let on = false;
	let opacity = DEFAULT_OPACITY;

	function style( material ) {

		const kept = material.userData.xray;
		if ( on ) {

			if ( ! kept ) material.userData.xray = { transparent: material.transparent, opacity: material.opacity };
			if ( ! material.transparent ) material.needsUpdate = true;
			material.transparent = true;
			material.opacity = opacity;

		} else if ( kept ) {

			if ( material.transparent !== kept.transparent ) material.needsUpdate = true;
			Object.assign( material, kept );
			delete material.userData.xray;

		}

	}

	const restyle = scene => scene.traverse( object => {

		if ( ! object.isMesh ) return;
		if ( on ) {

			object.userData.xrayOrder ??= object.renderOrder;
			object.renderOrder = XRAY_ORDER;

		} else if ( object.userData.xrayOrder !== undefined ) {

			object.renderOrder = object.userData.xrayOrder;
			delete object.userData.xrayOrder;

		}

		[ object.material ].flat().forEach( style );

	} );
	tiles.addEventListener( 'load-model', ( { scene } ) => on && restyle( scene ) );

	function set( value, { say = false } = {} ) {

		on = value;
		box.checked = on;
		slider.disabled = ! on;
		root.classList.toggle( 'on', on );
		renderer.setTransparentSort( on ? transparentSort : null );
		tiles.forEachLoadedModel( restyle );
		if ( say ) toast( on ? 'Seeing through the ground: U to make it solid again' : 'The ground is solid again' );

	}

	box.addEventListener( 'change', () => set( box.checked ) );
	slider.addEventListener( 'input', () => {

		opacity = Number( slider.value );
		if ( on ) tiles.forEachLoadedModel( restyle );

	} );
	// U, wherever the panel is.
	window.addEventListener( 'keydown', e => {

		if ( e.code !== 'KeyU' || e.repeat || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		set( ! on, { say: true } );

	}, true );
	slider.value = String( opacity );
	set( false );

	return {
		get on() {

			return on;

		},
		set,
		get opacity() {

			return opacity;

		},
	};

}
