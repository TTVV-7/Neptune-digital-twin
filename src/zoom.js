import { MathUtils, Raycaster, Vector2, Vector3 } from 'three';
import { ZOOM } from './config.js';
import { blocks } from './walk.js';

// Wheel movement (pixels) that makes one notch of a mouse wheel. A trackpad sends many small
// movements instead, which zoom smoothly. Wheels that count in lines (Firefox) count LINE pixels a line.
const NOTCH = 100;
const LINE = 16;
// A trackpad pinch arrives as the wheel with Ctrl, in smaller movements: they count this many times.
const PINCH = 4;
// One event never zooms more than this many notches, however hard the wheel was flicked.
const MAX_NOTCHES = 3;
// Nothing under the cursor (the sky): zoom along its ray as if there were ground this many times
// the camera's height away, and at least SKY_NEAREST metres.
const SKY_SCALE = 2;
const SKY_NEAREST = 50;

const _ndc = new Vector2();
const _point = new Vector3();

// The mouse wheel, a trackpad's scroll and its pinch zoom the view like Google Earth: toward the
// point under the cursor or away from it (see WalkController.zoom), with Shift for bigger steps.
// While driving a car they move the chase camera nearer or farther instead.
//
// Others use the wheel first and say so with preventDefault, which this leaves alone: turning an
// item being placed (sidebar.js) and an excavator's reach (excavator.js). That's why this listens on
// the window, after them, rather than on the canvas. Over the sidebar, the panels and dialogs the
// wheel scrolls them as usual.
export function setUpZoom( { canvas, camera, controls, driver, getColliders } ) {

	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;

	// The point the zoom heads for: what's under the cursor, or the middle of the view while the
	// mouse is captured (it has no cursor then).
	function pointAt( x, y ) {

		const rect = canvas.getBoundingClientRect();
		if ( controls.locked ) _ndc.set( 0, 0 );
		else _ndc.set( ( x - rect.left ) / rect.width * 2 - 1, - ( y - rect.top ) / rect.height * 2 + 1 );
		raycaster.setFromCamera( _ndc, camera );
		raycaster.far = Infinity;
		const hit = raycaster.intersectObjects( getColliders(), true ).find( h => blocks( h ) && isVisible( h.object ) );
		if ( hit ) return _point.copy( hit.point );
		const distance = Math.max( SKY_NEAREST, Math.abs( camera.position.y ) * SKY_SCALE );
		return _point.copy( raycaster.ray.origin ).addScaledVector( raycaster.ray.direction, distance );

	}

	// notches over 0 zoom out, as scrolling down does on a map.
	function zoomAt( x, y, notches, bigger ) {

		if ( driver.active ) {

			if ( ! driver.machine ) driver.zoomChase( notches );
			return;

		}

		if ( ! controls.enabled ) return;
		const step = bigger ? ZOOM.shiftStep : ZOOM.step;
		controls.zoom( pointAt( x, y ), ( 1 - step ) ** - notches );

	}

	window.addEventListener( 'wheel', e => {

		if ( e.defaultPrevented ) return;
		if ( e.target !== canvas ) {

			// A pinch over the sidebar or a panel would zoom the whole page, squashing the view.
			if ( e.ctrlKey ) e.preventDefault();
			return;

		}

		// On the view the wheel never scrolls or zooms the page.
		e.preventDefault();
		// Some systems turn the wheel sideways while Shift is held.
		const delta = e.deltaY || ( e.shiftKey ? e.deltaX : 0 );
		if ( delta === 0 ) return;
		const pixels = delta * ( e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? window.innerHeight : 1 );
		const notches = MathUtils.clamp( pixels / NOTCH * ( e.ctrlKey ? PINCH : 1 ), - MAX_NOTCHES, MAX_NOTCHES );
		zoomAt( e.clientX, e.clientY, notches, e.shiftKey );

	}, { passive: false } );

	// Safari sends a trackpad pinch as gesture events instead of the wheel.
	let scale = 1;
	window.addEventListener( 'gesturestart', e => {

		if ( e.target !== canvas ) return;
		e.preventDefault();
		scale = 1;

	} );
	window.addEventListener( 'gesturechange', e => {

		if ( e.target !== canvas ) return;
		e.preventDefault();
		const notches = Math.log( scale / e.scale ) / - Math.log( 1 - ZOOM.step );
		scale = e.scale;
		zoomAt( e.clientX, e.clientY, notches, false );

	} );

}

// Hidden things (flatten areas outside the library, say) aren't zoomed to.
function isVisible( object ) {

	for ( let o = object; o; o = o.parent ) if ( ! o.visible ) return false;
	return true;

}
