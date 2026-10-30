import './handles.css';
import { MathUtils, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { getKind, kindParams, resizeShape } from './kinds.js';
import { headingToYaw } from './geo.js';

// On-map handles for the selected item (sidebar.js): a ring round its footprint with a knob in
// front of it to turn it, and for areas (kinds with `resize`, see kinds.js) squares on the corners
// and edges to resize them, one on the edge of a round pile, and an arrow in the middle of a pit to
// set its depth. A row of items (rows.js) has a dot on each point of its line to move it, a plus
// halfway along each stretch to add a point there, and its line drawn through them. The handles
// are elements over the canvas, so they are the same size on screen at any distance, stay on top
// of the map and the models, and a press on one never reaches the scene (where it would move the
// item instead). The ring and the outlines are lines drawn over everything.

// Pixels from the footprint's furthest corner out to the ring, which the knob sits on.
const RING_GAP = 34;
// Sizes snap to SIZE_STEP metres, or to FREE_STEP with Shift; depths likewise.
const SIZE_STEP = 0.5;
const FREE_STEP = 0.1;
const DEPTH_STEP = 0.1;
const DEPTH_FREE = 0.01;
// Dragging the depth arrow takes at least this many pixels per metre.
const MIN_PER_METRE = 16;
// Shift snaps the knob to this many degrees; otherwise it turns in whole degrees.
const TURN_SNAP = 15;
// Kinds that are quick to rebuild follow a handle at most this often (ms).
const LIVE_INTERVAL = 100;
// Handles closer than this on screen (pixels) would be hard to tell apart, so some step aside:
// edge handles on shorter sides, then the corners, and the depth arrow in a small pit.
const EDGE_ROOM = 64;
const CORNER_ROOM = 24;
const DEPTH_ROOM = 56;
// The arc of the ring either side of the knob drawn in the accent colour, in degrees.
const ARC = 22;
// A point handle moves once the pointer has gone this many pixels (a finger: TOUCH_SLOP), so a
// click on it doesn't nudge it; two clicks this close together (ms) take the point out.
const CLICK_SLOP = 5;
const TOUCH_SLOP = 12;
const DOUBLE_CLICK = 400;
// A plus to add a point shows on stretches at least this long on screen (pixels).
const INSERT_ROOM = 56;
const LIFT = 0.08;
const ACCENT = 0x3d9be9;
const DEG = MathUtils.DEG2RAD;

const TURN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/></svg>';
const DEPTH_ICON = '<svg viewBox="0 0 24 24" width="16" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/></svg>';
const INSERT_ICON = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2v8M2 6h8"/></svg>';

const UP = new Vector3( 0, 1, 0 );
const _ndc = new Vector2();
const _point = new Vector3();
const _projected = new Vector3();

// Where a point in the scene is on screen, in client pixels, and whether it's in view.
export function toScreen( point, camera, rect, target = {} ) {

	_projected.copy( point ).project( camera );
	target.x = rect.left + ( _projected.x + 1 ) / 2 * rect.width;
	target.y = rect.top + ( 1 - _projected.y ) / 2 * rect.height;
	target.visible = _projected.z < 1 && Math.abs( _projected.x ) < 1.1 && Math.abs( _projected.y ) < 1.1;
	return target;

}

export function createHandles( { scene, camera, canvas, models } ) {

	const root = document.createElement( 'div' );
	root.className = 'handles';
	root.hidden = true;
	// Straight after the scene, under the panels and overlays.
	document.getElementById( 'app' ).after( root );
	const label = document.createElement( 'div' );
	label.className = 'handle-label';
	label.hidden = true;
	root.append( label );

	const handles = [
		{ type: 'turn', className: 'knob', html: TURN_ICON, title: 'Drag to turn it. Shift snaps to 15°' },
		...[ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ sx, sy ] ) => ( { type: 'corner', sx, sy, className: 'grip' } ) ),
		...[ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ].map( ( [ sx, sy ] ) => ( { type: 'edge', sx, sy, className: 'grip edge' } ) ),
		{ type: 'radius', sx: 1, sy: 0, className: 'grip', title: 'Drag to make it bigger or smaller. Shift for any size' },
		{ type: 'depth', className: 'depth', html: DEPTH_ICON, title: 'Drag down to dig deeper, up for shallower. Shift for any depth' },
	];
	for ( const handle of handles ) makeHandle( handle );

	function makeHandle( handle ) {

		const element = document.createElement( 'div' );
		element.className = `handle ${ handle.className }`;
		element.dataset.handle = handle.type;
		element.innerHTML = handle.html ?? '';
		element.title = handle.title ?? 'Drag to resize. Shift for any size';
		element.hidden = true;
		element.addEventListener( 'pointerdown', e => press( e, handle ) );
		element.addEventListener( 'pointermove', move );
		element.addEventListener( 'pointerup', release );
		element.addEventListener( 'pointercancel', cancel );
		element.addEventListener( 'lostpointercapture', cancel );
		// Wheel over a handle still reaches the scene (to zoom, say).
		element.addEventListener( 'wheel', e => {

			e.preventDefault();
			canvas.dispatchEvent( new WheelEvent( 'wheel', e ) );

		}, { passive: false } );
		root.append( element );
		Object.assign( handle, { element, world: new Vector3(), screen: { x: 0, y: 0, visible: false }, active: false } );
		return handle;

	}

	const knob = handles[ 0 ];
	// A row's points and the pluses between them, made as many as are needed: { type: 'point' or
	// 'insert', index, ... } like the handles above. A plus at index i adds a point after point i.
	const points = [];
	const inserts = [];
	const pointHandle = ( list, i, type ) => list[ i ] ??= makeHandle( type === 'point'
		? { type, index: i, className: 'point', title: 'Drag to move this point. Double-click to take it out' }
		: { type, index: i, className: 'insert', html: INSERT_ICON, title: 'Drag, or click, to add a point here' } );
	// The last click on a point, to tell a double-click: { entry, index, time }.
	let lastClick = null;

	// The ring (a dark halo under a light line, to show on bright concrete and dark water alike),
	// the accent arc either side of the knob, the outline a resize will give, the floor of a pit
	// being deepened and a line down to it.
	const circle = Array.from( { length: 65 }, ( _, i ) => new Vector3( Math.sin( i / 32 * Math.PI ), 0, - Math.cos( i / 32 * Math.PI ) ) );
	const arc = Array.from( { length: 9 }, ( _, i ) => {

		const a = ( i / 4 - 1 ) * ARC * DEG;
		return new Vector3( Math.sin( a ), 0, - Math.cos( a ) );

	} );
	const square = [ [ - 0.5, - 0.5 ], [ 0.5, - 0.5 ], [ 0.5, 0.5 ], [ - 0.5, 0.5 ], [ - 0.5, - 0.5 ] ].map( ( [ x, z ] ) => new Vector3( x, 0, z ) );
	const ringHalo = overlayLine( scene, circle, 5, 0x000000, 0.35, 1000 );
	const ring = overlayLine( scene, circle, 1.5, 0xffffff, 0.9, 1001 );
	const ringArc = overlayLine( scene, arc, 3.5, ACCENT, 1, 1002 );
	const outline = overlayLine( scene, square, 2.5, ACCENT, 1, 1002 );
	const roundOutline = overlayLine( scene, circle, 2.5, ACCENT, 1, 1002 );
	const floor = overlayLine( scene, square, 2, ACCENT, 0.8, 1002 );
	const plumb = overlayLine( scene, [ new Vector3(), new Vector3( 0, - 1, 0 ) ], 2, ACCENT, 0.8, 1002 );
	// A row's line, through its points.
	const path = overlayLine( scene, [ new Vector3(), new Vector3( 0, 0, 1 ) ], 2.5, ACCENT, 0.9, 1002 );
	let pathKey = '';
	const lines = [ ringHalo, ring, ringArc, outline, roundOutline, floor, plumb, path ];

	const raycaster = new Raycaster();
	const plane = new Plane();
	const centre = new Vector3();
	const front = new Vector3();
	const right = new Vector3();
	const middle = { x: 0, y: 0, visible: false };
	let target = null;
	// While a handle is held: { handle, entry, kind, pointerId, start, base, draft, applied, ... }
	let drag = null;
	let base = 0;

	// --- dragging ----------------------------------------------------------------------------

	function press( e, handle ) {

		if ( ! target || drag || ( e.pointerType === 'mouse' && e.button !== 0 ) ) return;
		// Not a text selection, and not a press on the scene (which would move the item).
		e.preventDefault();
		e.stopPropagation();
		document.activeElement?.blur?.();
		handle.element.setPointerCapture( e.pointerId );
		const { state, params } = target;
		drag = {
			handle,
			entry: target,
			kind: getKind( target.kind ),
			pointerId: e.pointerId,
			start: { east: state.east, north: state.north, heading: state.heading, params: { ...params } },
			// Pointers are followed on a level plane through the item's base, which is steadier than
			// the ground itself (with models and buildings standing on it) and what sizes are measured on.
			base,
			draft: null,
			applied: 0,
			press: { x: e.clientX, y: e.clientY },
		};
		if ( handle.type === 'depth' ) measureDepthDrag( drag );
		// A point is moved on a level plane through where it is, rather than the item's base.
		if ( handle.type === 'point' || handle.type === 'insert' ) drag.base = handle.world.y;
		root.classList.add( 'dragging' );
		handle.element.classList.add( 'active' );
		showLabel( e, handle.type === 'turn' ? `${ Math.round( state.heading ) }°` : drag.kind.resize.label( params ) );

	}

	function move( e ) {

		if ( ! drag || e.pointerId !== drag.pointerId ) return;
		const { handle, entry, kind, start } = drag;
		if ( handle.type === 'depth' ) {

			// Pixels moved along the way down the pit looks on screen, in metres at its floor.
			const { axis, perMetre } = drag;
			const along = ( e.clientX - drag.press.x ) * axis.x + ( e.clientY - drag.press.y ) * axis.y;
			const depth = snap( start.params.depth + along / perMetre, e.shiftKey ? DEPTH_FREE : DEPTH_STEP );
			setDraft( e, { east: start.east, north: start.north, heading: start.heading, params: kindParams( kind, { ...start.params, depth: Math.max( DEPTH_FREE, depth ) } ) } );
			return;

		}

		if ( handle.type === 'point' || handle.type === 'insert' ) {

			const slop = e.pointerType === 'touch' ? TOUCH_SLOP : CLICK_SLOP;
			if ( ! drag.moved && Math.hypot( e.clientX - drag.press.x, e.clientY - drag.press.y ) < slop ) return;
			drag.moved = true;

		}

		const point = planePoint( e.clientX, e.clientY, drag.base );
		if ( ! point ) return;
		const de = - point.x - start.east;
		const dn = point.z - start.north;

		if ( handle.type === 'turn' ) {

			// Its front points at the pointer.
			if ( Math.hypot( de, dn ) < 1e-3 ) return;
			const raw = Math.atan2( de, dn ) / DEG;
			const heading = ( ( e.shiftKey ? Math.round( raw / TURN_SNAP ) * TURN_SNAP : Math.round( raw ) ) + 360 ) % 360;
			if ( heading !== entry.state.heading ) {

				entry.state.heading = heading;
				models.apply( entry );

			}

			showLabel( e, `${ heading }°` );
			return;

		}

		if ( handle.type === 'point' || handle.type === 'insert' ) {

			// Into its own frame, as if it faced north: across (east) and along (north).
			const rad = start.heading * DEG;
			const at = [ de * Math.cos( rad ) - dn * Math.sin( rad ), de * Math.sin( rad ) + dn * Math.cos( rad ) ];
			const list = kind.resize.points( start.params );
			const next = handle.type === 'point' ? list.map( ( p, i ) => i === handle.index ? at : p ) : [ ...list.slice( 0, handle.index + 1 ), at, ...list.slice( handle.index + 1 ) ];
			setDraft( e, withPoints( next ) );
			return;

		}

		const step = e.shiftKey ? FREE_STEP : SIZE_STEP;
		if ( handle.type === 'radius' ) {

			const diameter = Math.max( step, snap( 2 * Math.hypot( de, dn ), step ) );
			const params = kindParams( kind, { ...start.params, ...kind.resize.withRadius( start.params, diameter / 2 ) } );
			setDraft( e, { east: start.east, north: start.north, heading: start.heading, params } );
			return;

		}

		// Across (width) and along (length) the area as it was when pressed. The opposite corner or
		// edge stays put, so the middle moves by half of what the size changes by.
		const rad = start.heading * DEG;
		const cos = Math.cos( rad );
		const sin = Math.sin( rad );
		const u = de * cos - dn * sin;
		const v = de * sin + dn * cos;
		const { sx, sy } = handle;
		const fixedU = - sx * start.params.width / 2;
		const fixedV = - sy * start.params.length / 2;
		const width = sx ? Math.max( step, snap( ( u - fixedU ) * sx, step ) ) : start.params.width;
		const length = sy ? Math.max( step, snap( ( v - fixedV ) * sy, step ) ) : start.params.length;
		const params = kindParams( kind, { ...start.params, width, length } );
		const cu = sx ? fixedU + sx * params.width / 2 : 0;
		const cv = sy ? fixedV + sy * params.length / 2 : 0;
		setDraft( e, {
			east: round( start.east + cu * cos + cv * sin ),
			north: round( start.north - cu * sin + cv * cos ),
			heading: start.heading,
			params,
		} );

	}

	function setDraft( e, draft ) {

		drag.draft = draft;
		showLabel( e, drag.kind.resize.label( draft.params ) );
		// Quick kinds follow the handle; the rest show the outline until it's let go.
		if ( drag.kind.resize.live && performance.now() - drag.applied >= LIVE_INTERVAL ) {

			drag.applied = performance.now();
			place( drag.entry, draft );

		}

	}

	function release( e ) {

		if ( ! drag || e.pointerId !== drag.pointerId ) return;
		const { entry, draft, handle, moved } = drag;
		if ( ( handle.type === 'point' || handle.type === 'insert' ) && ! moved ) {

			clickPoint( handle );
			return;

		}

		end();
		if ( draft ) place( entry, draft );

	}

	// A click on a plus adds a point there; a second click on a point straight after the first
	// takes it out, leaving at least two.
	function clickPoint( handle ) {

		const { entry, kind, start } = drag;
		end();
		const list = kind.resize.points( start.params );
		const now = performance.now();
		if ( handle.type === 'insert' ) {

			const [ a, b ] = [ list[ handle.index ], list[ handle.index + 1 ] ];
			const middle = [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2 ];
			place( entry, withPoints( [ ...list.slice( 0, handle.index + 1 ), middle, ...list.slice( handle.index + 1 ) ], { entry, kind, start } ) );
			lastClick = null;

		} else if ( lastClick?.entry === entry && lastClick.index === handle.index && now - lastClick.time < DOUBLE_CLICK ) {

			lastClick = null;
			if ( list.length > 2 ) place( entry, withPoints( list.filter( ( _, i ) => i !== handle.index ), { entry, kind, start } ) );

		} else lastClick = { entry, index: handle.index, time: now };

	}

	// A placement with these points (in its frame as when the drag began), its origin moved to the
	// middle of them so that it keeps turning about its middle. The drag's kind and start, or another's.
	function withPoints( list, { kind, start } = drag ) {

		const middle = [ 0, 1 ].map( k => ( Math.min( ...list.map( p => p[ k ] ) ) + Math.max( ...list.map( p => p[ k ] ) ) ) / 2 );
		const rad = start.heading * DEG;
		const cos = Math.cos( rad );
		const sin = Math.sin( rad );
		return {
			east: round( start.east + middle[ 0 ] * cos + middle[ 1 ] * sin ),
			north: round( start.north - middle[ 0 ] * sin + middle[ 1 ] * cos ),
			heading: start.heading,
			params: kindParams( kind, kind.resize.withPoints( start.params, list.map( ( [ e, n ] ) => [ round( e - middle[ 0 ] ), round( n - middle[ 1 ] ) ] ) ) ),
		};

	}

	// Esc, or the browser taking the pointer: put it back as it was.
	function cancel( e ) {

		if ( ! drag || ( e?.pointerId !== undefined && e.pointerId !== drag.pointerId ) ) return;
		const { entry, start } = drag;
		end();
		if ( models.entries.includes( entry ) ) place( entry, start );

	}

	function end() {

		const { handle, pointerId } = drag;
		drag = null;
		if ( handle.element.hasPointerCapture( pointerId ) ) handle.element.releasePointerCapture( pointerId );
		handle.element.classList.remove( 'active' );
		root.classList.remove( 'dragging' );
		label.hidden = true;

	}

	// Move, turn and resize an entry to a placement { east, north, heading, params }.
	function place( entry, { east, north, heading, params } ) {

		Object.assign( entry.state, { east, north, heading } );
		if ( JSON.stringify( params ) === JSON.stringify( entry.params ) ) models.apply( entry );
		else models.setParams( entry, params );

	}

	// How a drag on the depth arrow maps to metres: the way a metre down the pit runs on screen
	// at its floor, so the arrow follows the pointer, or straight down the screen when looking down
	// into it (where depth doesn't show).
	function measureDepthDrag( d ) {

		const rect = canvas.getBoundingClientRect();
		const top = toScreen( d.handle.world, camera, rect, {} );
		_point.copy( d.handle.world ).y -= 1;
		const below = toScreen( _point, camera, rect, {} );
		const dx = below.x - top.x;
		const dy = below.y - top.y;
		const length = Math.hypot( dx, dy );
		const square = 1 / worldPerPixel( d.handle.world );
		const shows = length > square / 4;
		d.axis = shows ? { x: dx / length, y: dy / length } : { x: 0, y: 1 };
		// From afar a metre is only a few pixels: slower then, for depths to the decimetre.
		d.perMetre = Math.max( MIN_PER_METRE, shows ? length : square );

	}

	// The readout beside the handle while dragging, above the pointer so a finger doesn't hide it.
	function showLabel( e, text ) {

		label.hidden = false;
		if ( label.textContent !== text ) label.textContent = text;
		label.style.transform = `translate( ${ e.clientX.toFixed( 1 ) }px, ${ ( e.clientY - 26 ).toFixed( 1 ) }px ) translate( -50%, -100% )`;

	}

	// --- drawing -----------------------------------------------------------------------------

	// Where the handles go, and what they look like, for `entry` (null hides them). `box` is the
	// entry's bounding box in the scene, for the height of its base.
	function update( entry, box ) {

		if ( entry !== target && drag ) cancel();
		target = entry;
		root.hidden = ! entry;
		for ( const line of lines ) line.visible = false;
		if ( ! entry ) return;

		const kind = getKind( entry.kind );
		const { east, north, heading, params } = drag?.draft ?? { ...entry.state, params: entry.params };
		const shape = resizeShape( kind, params );
		if ( ! drag ) base = box.min.y;
		centre.set( - east, base, north );
		const rad = heading * DEG;
		front.set( - Math.sin( rad ), 0, Math.cos( rad ) );
		right.set( - Math.cos( rad ), 0, - Math.sin( rad ) );
		const yaw = headingToYaw( heading );
		const rect = canvas.getBoundingClientRect();
		toScreen( centre, camera, rect, middle );

		// Metres from the middle to the furthest corner of the footprint, and out to the ring.
		const radius = shape === 'circle' ? kind.resize.radius( params ) : null;
		const reach = shape === 'rect' ? Math.hypot( params.width, params.length ) / 2 : radius ?? footprintReach( entry );
		const ringRadius = radius ?? reach + RING_GAP * worldPerPixel( centre );
		for ( const line of [ ringHalo, ring, ringArc ] ) {

			line.position.copy( centre ).y += LIFT;
			line.rotation.y = yaw;
			line.scale.setScalar( ringRadius );
			line.visible = true;

		}

		// A round pile looks the same any way round, so it doesn't turn.
		ringArc.visible = shape !== 'circle';

		for ( const handle of handles ) handle.active = false;
		knob.active = shape !== 'circle';
		knob.world.copy( centre ).addScaledVector( front, ringRadius );
		if ( shape === 'rect' ) {

			for ( const handle of handles ) {

				if ( handle.type !== 'corner' && handle.type !== 'edge' ) continue;
				handle.active = true;
				handle.world.copy( centre ).addScaledVector( right, handle.sx * params.width / 2 ).addScaledVector( front, handle.sy * params.length / 2 );

			}

		}

		const radiusHandle = handles.find( h => h.type === 'radius' );
		if ( shape === 'circle' ) {

			radiusHandle.active = true;
			radiusHandle.world.copy( centre ).addScaledVector( right, radius );

		}

		const depthHandle = handles.find( h => h.type === 'depth' );
		if ( kind?.resize?.depth ) {

			depthHandle.active = true;
			depthHandle.world.copy( centre ).y -= params.depth;

		}

		placePoints( entry, kind, shape === 'points' ? kind.resize.points( params ) : [], { east, north }, rect );
		for ( const handle of handles ) if ( handle.active ) toScreen( handle.world, camera, rect, handle.screen );
		if ( shape === 'rect' ) makeRoom( depthHandle );

		for ( const handle of [ ...handles, ...points, ...inserts ] ) {

			const { element, screen } = handle;
			// The one being dragged stays, even off screen: hiding it would lose the pointer.
			const shown = drag?.handle === handle || ( handle.active && screen.visible && ! ( drag && handle.type === 'turn' ) );
			if ( element.hidden !== ! shown ) element.hidden = ! shown;
			if ( ! shown ) continue;
			element.style.transform = `translate( ${ screen.x.toFixed( 1 ) }px, ${ screen.y.toFixed( 1 ) }px ) translate( -50%, -50% )`;
			if ( handle.type === 'corner' || handle.type === 'edge' || handle.type === 'radius' ) {

				const cursor = resizeCursor( screen.x - middle.x, screen.y - middle.y );
				if ( element.style.cursor !== cursor ) element.style.cursor = cursor;

			}

		}

		// The size being dragged out.
		const resizing = drag && drag.handle.type !== 'turn';
		if ( resizing && shape === 'rect' ) {

			outline.position.copy( centre ).y += LIFT;
			outline.rotation.y = yaw;
			outline.scale.set( params.width, 1, params.length );
			outline.visible = true;

		} else if ( resizing && shape === 'circle' ) {

			roundOutline.position.copy( centre ).y += LIFT;
			roundOutline.scale.setScalar( radius );
			roundOutline.visible = true;

		}

		if ( resizing && kind.resize.depth ) {

			plumb.position.copy( centre );
			plumb.scale.set( 1, params.depth, 1 );
			plumb.visible = true;
			// The floor, smaller than the top by the side slopes, while there is one.
			const inset = 2 * ( params.slope ?? 0 ) * params.depth;
			if ( params.width > inset && params.length > inset ) {

				floor.position.copy( centre ).y -= params.depth;
				floor.rotation.y = yaw;
				floor.scale.set( params.width - inset, 1, params.length - inset );
				floor.visible = true;

			}

		}

	}

	// A row's points (`line`, in its frame as if it faced north) sit on the ground under them, the
	// pluses halfway between them where there's room on screen, and the line is drawn through them.
	// While a plus is dragged it is the new point. `at`: where its origin is.
	function placePoints( entry, kind, line, at, rect ) {

		const heights = line.length > 0 ? kind.resize.heights?.( entry ) : null;
		const adding = drag?.handle.type === 'insert' ? drag.handle.index + 1 : - 1;
		for ( const handle of [ ...points, ...inserts ] ) handle.active = false;
		line.forEach( ( [ e, n ], i ) => {

			const handle = pointHandle( points, i, 'point' );
			handle.active = i !== adding;
			handle.world.set( - at.east, entry.state.up + ( heights?.[ i ] ?? 0 ), at.north ).addScaledVector( right, e ).addScaledVector( front, n );
			toScreen( handle.world, camera, rect, handle.screen );

		} );
		for ( let i = 0; i < line.length - 1; i ++ ) {

			const handle = pointHandle( inserts, i, 'insert' );
			const [ a, b ] = [ points[ i ], points[ i + 1 ] ];
			if ( drag?.handle === handle ) handle.world.copy( points[ adding ].world );
			else handle.world.addVectors( a.world, b.world ).multiplyScalar( 0.5 );
			toScreen( handle.world, camera, rect, handle.screen );
			handle.active = ! drag && Math.hypot( a.screen.x - b.screen.x, a.screen.y - b.screen.y ) >= INSERT_ROOM;

		}

		if ( line.length < 2 ) return;
		const positions = line.flatMap( ( _, i ) => [ points[ i ].world.x, points[ i ].world.y + LIFT, points[ i ].world.z ] );
		const key = positions.map( v => v.toFixed( 2 ) ).join();
		if ( key !== pathKey ) {

			pathKey = key;
			path.geometry.setPositions( positions );

		}

		path.visible = true;

	}

	// Hide handles that would crowd each other on screen: a far-off or narrow area keeps its
	// corners, and a small one just the knob. The one being dragged always shows.
	function makeRoom( depthHandle ) {

		const corner = ( sx, sy ) => handles.find( h => h.type === 'corner' && h.sx === sx && h.sy === sy ).screen;
		const gap = ( a, b ) => Math.hypot( a.x - b.x, a.y - b.y );
		const across = gap( corner( - 1, - 1 ), corner( 1, - 1 ) );
		const along = gap( corner( 1, - 1 ), corner( 1, 1 ) );
		for ( const handle of handles ) {

			if ( drag?.handle === handle ) continue;
			if ( handle.type === 'edge' ) handle.active = ( handle.sx ? along : across ) >= EDGE_ROOM;
			else if ( handle.type === 'corner' ) handle.active = Math.max( across, along ) >= CORNER_ROOM;

		}

		if ( depthHandle.active && drag?.handle !== depthHandle ) depthHandle.active = Math.min( across, along ) >= DEPTH_ROOM;

	}

	function planePoint( x, y, height ) {

		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( x - rect.left ) / rect.width * 2 - 1, - ( y - rect.top ) / rect.height * 2 + 1 );
		raycaster.setFromCamera( _ndc, camera );
		plane.set( UP, - height );
		return raycaster.ray.intersectPlane( plane, _point );

	}

	// Metres across one pixel of the screen at `point`.
	function worldPerPixel( point ) {

		const distance = camera.position.distanceTo( point );
		return 2 * distance * Math.tan( camera.fov * DEG / 2 ) / camera.zoom / ( canvas.clientHeight || 1 );

	}

	return {

		update,
		cancel,
		// A handle is being dragged.
		get busy() {

			return drag !== null;

		},
		// The handles on screen now, as { x, y, r } in client pixels, for the toolbar to keep clear of.
		onScreen: () => [ ...handles, ...points, ...inserts ].filter( h => ! h.element.hidden ).map( h => {

			// Measured once: reading it every frame would make the page lay itself out again.
			h.radius ||= h.element.offsetHeight / 2;
			return { x: h.screen.x, y: h.screen.y, r: h.radius };

		} ),
		// Each handle shown now, with where it is in the scene and on screen (for tests).
		positions: () => [ ...handles, ...points, ...inserts ].filter( h => ! h.element.hidden ).map( ( { type, sx, sy, index, world, screen } ) => ( { type, sx, sy, index, world: world.clone(), screen: { ...screen } } ) ),
		label: () => label.hidden ? null : label.textContent,

	};

}

// A line drawn over everything (no depth test, drawn last), its width in pixels.
function overlayLine( scene, points, width, color, opacity, order ) {

	const geometry = new LineGeometry().setPositions( points.flatMap( p => [ p.x, p.y, p.z ] ) );
	const line = new Line2( geometry, new LineMaterial( { color, linewidth: width, transparent: true, opacity, depthTest: false, depthWrite: false } ) );
	line.renderOrder = order;
	line.frustumCulled = false;
	line.visible = false;
	line.raycast = () => {};
	line.userData.noCollide = true;
	scene.add( line );
	return line;

}

// Metres from an entry's pivot to the furthest corner of its footprint.
function footprintReach( { footprint: { min, max }, state } ) {

	return Math.max( ...[ [ min.x, min.z ], [ max.x, min.z ], [ max.x, max.z ], [ min.x, max.z ] ].map( ( [ x, z ] ) => Math.hypot( x, z ) ) ) * state.scale;

}

// The resize cursor that points the way a handle is from the middle on screen.
function resizeCursor( dx, dy ) {

	const sector = ( ( Math.round( Math.atan2( dy, dx ) / ( Math.PI / 4 ) ) % 4 ) + 4 ) % 4;
	return [ 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize' ][ sector ];

}

function snap( value, step ) {

	return Math.round( Math.round( value / step ) * step * 100 ) / 100;

}

function round( value ) {

	return Math.round( value * 100 ) / 100;

}
