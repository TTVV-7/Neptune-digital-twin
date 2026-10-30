import {
	Box3,
	BoxHelper,
	BufferGeometry,
	LineBasicMaterial,
	LineLoop,
	DirectionalLight,
	HemisphereLight,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';
import { itemConfig } from './library.js';
import { buildProcedural } from './procedural.js';
import { localToEnu } from './geo.js';
import { isTyping } from './walk.js';
import { ZONE_ID } from './flatten.js';

const ROTATE_STEP = 15;
const DRAG_TYPE = 'application/x-library-item';

const _ndc = new Vector2();
const _offset = new Vector3();
const _size = new Vector3();
const _center = new Vector3();

// The library sidebar (L): pick an item and click the ground to place it, or drag it onto the
// scene. A see-through preview follows the mouse; R or the wheel rotates it, Esc cancels and
// Shift+click keeps placing more of the same. Placed items can be clicked to select, dragged to
// move, turned with R and removed with Delete. Tools at the top (addTool) draw areas or pick
// points on the ground instead: flatten areas, and whatever other modules add.
export function createSidebar( { library, models, layout, scene, camera, canvas, controls, getGround, getPlayer, panel, isDriving, onError } ) {

	const root = document.getElementById( 'library' );
	const toggle = document.getElementById( 'library-toggle' );
	const list = root.querySelector( '.items' );
	const search = root.querySelector( 'input[type=search]' );
	const count = root.querySelector( '.count' );
	const raycaster = new Raycaster();
	const highlight = new BoxHelper( undefined, 0x3d9be9 );
	highlight.visible = false;
	scene.add( highlight );

	let open = false;
	let placing = null; // { item, entry, heading, cancelled }
	let selected = null;
	let dragging = null; // { entry, moved }
	let suppressClick = false;
	let pointer = null; // last pointer position over the scene, in client pixels
	let drawing = null; // { tool, start, heading, outline } while a tool is in use

	// --- the list ------------------------------------------------------------------------

	// Tools come first, in their own group, then the library by category.
	const toolsHeading = document.createElement( 'h3' );
	toolsHeading.textContent = 'Tools';
	const toolCards = document.createElement( 'div' );
	toolCards.className = 'tools';
	list.append( toolsHeading, toolCards );

	// A tool card. spec:
	//   name, hint (shown under the name), title (tooltip), icon (SVG markup, 64 x 64 viewBox)
	//   mode: 'rect' to drag out a rectangle lined up with the way you're looking (a click without
	//         a drag makes one defaultSize = [ width, length ] in metres), or 'point' to click a spot
	//   color: outline colour while dragging
	//   onDone( shape ): called with { east, north, height, heading, width, length, dragged } (just
	//         east/north/height/heading for 'point'); may return a placed entry (or a promise of
	//         one), which is then selected.
	function addTool( spec ) {

		const card = document.createElement( 'button' );
		card.type = 'button';
		card.className = 'card tool';
		card.title = spec.title ?? spec.hint ?? '';
		const icon = document.createElement( 'img' );
		icon.alt = '';
		icon.src = 'data:image/svg+xml,' + encodeURIComponent( spec.icon );
		const name = document.createElement( 'span' );
		name.className = 'name';
		name.textContent = spec.name;
		const hint = document.createElement( 'span' );
		hint.className = 'dims';
		hint.textContent = spec.hint ?? '';
		card.append( icon, name, hint );
		const tool = { ...spec, mode: spec.mode ?? 'rect', card };
		card.addEventListener( 'click', () => startDrawing( tool ) );
		toolCards.append( card );
		return tool;

	}

	// The flatten tool clears Google's mesh (rail cars, trucks, sheds) from an area.
	addTool( {
		name: 'Flatten area',
		hint: 'Drag a rectangle to clear it',
		title: 'Drag a rectangle on the ground; everything in Google\'s 3D map inside it is pressed flat',
		icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M6 46h52" stroke="#8a8f86" stroke-width="3"/><rect x="14" y="30" width="18" height="16" fill="#8e3b2a" opacity=".45"/><rect x="34" y="34" width="16" height="12" fill="#2a4f8e" opacity=".45"/><rect x="10" y="20" width="44" height="28" fill="#ff5544" fill-opacity=".2" stroke="#ff3322" stroke-width="2.5" stroke-dasharray="5 3"/><path d="M32 8v10m-5-5 5 5 5-5" stroke="#eef2f5" stroke-width="2.5" fill="none"/></svg>',
		mode: 'rect',
		color: 0xff3322,
		onDone: ( { east, north, heading, width, length } ) => models.load( {
			kind: ZONE_ID,
			params: { width, length },
			east,
			north,
			heading,
			up: null,
		} ),
	} );

	for ( const item of library.filter( i => i.procedural ) ) item.dimensions = measure( buildProcedural( item.id ) );

	let category = null;
	const cards = [];
	for ( const item of library ) {

		if ( item.category !== category ) {

			category = item.category;
			const heading = document.createElement( 'h3' );
			heading.textContent = category;
			list.append( heading );

		}

		const card = document.createElement( 'button' );
		card.type = 'button';
		card.className = 'card';
		card.draggable = true;
		card.title = item.source ? `${ item.source.title } by ${ item.source.author } (${ item.source.license })` : 'Built in';
		const thumb = document.createElement( 'img' );
		thumb.alt = '';
		thumb.loading = 'lazy';
		if ( item.thumb ) thumb.src = new URL( `library/${ item.thumb }`, document.baseURI ).href;
		const name = document.createElement( 'span' );
		name.className = 'name';
		name.textContent = item.name;
		const dims = document.createElement( 'span' );
		dims.className = 'dims';
		const d = item.dimensions;
		// Longest side first, whichever way the item faces.
		dims.textContent = d ? `${ Math.max( d.length, d.width ) } × ${ Math.min( d.length, d.width ) } × ${ d.height } m` : '';
		card.append( thumb, name, dims );
		card.addEventListener( 'click', () => startPlacing( item ) );
		card.addEventListener( 'dragstart', e => {

			e.dataTransfer.setData( DRAG_TYPE, item.id );
			e.dataTransfer.effectAllowed = 'copy';
			startPlacing( item, { fromDrag: true } );

		} );
		card.addEventListener( 'dragend', () => {

			// Dropped somewhere other than the scene.
			if ( placing?.fromDrag ) cancelPlacing();

		} );
		list.append( card );
		cards.push( { card, item, thumb } );

	}

	search.addEventListener( 'input', () => {

		const query = search.value.trim().toLowerCase();
		for ( const { card, item } of cards ) card.hidden = query && ! `${ item.name } ${ item.category }`.toLowerCase().includes( query );
		for ( const heading of list.querySelectorAll( 'h3' ) ) {

			let next = heading.nextElementSibling;
			let any = false;
			while ( next && next.tagName !== 'H3' ) {

				any ||= ! next.hidden;
				next = next.nextElementSibling;

			}

			heading.hidden = ! any;

		}

	} );

	const hint = document.getElementById( 'hint' );
	const walkHint = hint.innerHTML;
	const editHint = 'Click an item to select it, drag to move &middot; <b>R</b> rotates &middot; <b>Delete</b> removes &middot; right-drag to look &middot; <b>L</b> closes';

	let thumbnailsRendered = false;
	function setOpen( value ) {

		open = value;
		root.hidden = ! open;
		hint.innerHTML = open ? editHint : walkHint;
		models.setBuildMode( open );
		toggle.setAttribute( 'aria-expanded', String( open ) );
		document.body.classList.toggle( 'library-open', open );
		if ( open ) {

			document.exitPointerLock?.();
			if ( ! thumbnailsRendered ) {

				thumbnailsRendered = true;
				renderThumbnails( cards.filter( c => c.item.procedural ) );

			}

		} else {

			cancelPlacing();
			cancelDrawing();

		}

	}

	toggle.addEventListener( 'click', () => setOpen( ! open ) );
	root.querySelector( '.close' ).addEventListener( 'click', () => setOpen( false ) );
	root.querySelector( '.export' ).addEventListener( 'click', () => layout.export() );
	root.querySelector( '.clear' ).addEventListener( 'click', () => {

		if ( window.confirm( 'Remove every library item you have placed?' ) ) layout.clear();

	} );
	const fileInput = root.querySelector( 'input[type=file]' );
	root.querySelector( '.import' ).addEventListener( 'click', () => fileInput.click() );
	fileInput.addEventListener( 'change', () => {

		if ( fileInput.files[ 0 ] ) layout.import( fileInput.files[ 0 ] );
		fileInput.value = '';

	} );

	const updateCount = () => {

		const n = models.entries.filter( e => e.library && ! e.placing && ! e.inConfig ).length;
		count.textContent = n === 1 ? '1 item placed' : `${ n } items placed`;

	};

	models.addEventListener( 'add', updateCount );
	models.addEventListener( 'remove', ( { entry } ) => {

		if ( entry === selected ) select( null );
		// The preview was removed some other way, e.g. from the P panel.
		if ( entry === placing?.entry ) {

			placing = null;
			root.classList.remove( 'placing' );

		}

		updateCount();

	} );
	updateCount();

	// --- placing -------------------------------------------------------------------------

	async function startPlacing( item, { fromDrag = false, heading } = {} ) {

		// Placing takes over from a tool in use, as a tool takes over from placing; otherwise the
		// tool would take the click meant to place the item.
		cancelDrawing();
		cancelPlacing();
		select( null );
		document.exitPointerLock?.();
		const player = getPlayer();
		// Face the player by default, so you see the front of what you place.
		const state = { item, entry: null, heading: heading ?? ( player.heading + 180 ) % 360, fromDrag, cancelled: false };
		placing = state;
		root.classList.add( 'placing' );

		const ahead = Math.max( item.dimensions?.length ?? 4, item.dimensions?.width ?? 0 ) / 2 + 6;
		const rad = player.heading * Math.PI / 180;
		const start = pointer && groundPoint( pointer.x, pointer.y );
		const { east, north } = start ? localToEnu( start ) : { east: player.east + Math.sin( rad ) * ahead, north: player.north + Math.cos( rad ) * ahead };

		try {

			const entry = await models.load( { ...itemConfig( item, { east, north, heading: state.heading } ), placing: true } );
			if ( state.cancelled ) {

				models.remove( entry );
				return;

			}

			state.entry = entry;
			setGhost( entry, true );
			if ( pointer ) followPointer();

		} catch ( err ) {

			if ( placing === state ) placing = null;
			root.classList.remove( 'placing' );
			onError( `Could not load ${ item.name }: ${ err.message }` );

		}

	}

	function followPointer() {

		const { entry } = placing ?? {};
		if ( ! entry || ! pointer ) return;
		const point = groundPoint( pointer.x, pointer.y, entry.pivot );
		if ( point ) models.moveTo( entry, point );

	}

	function rotatePlacing( degrees ) {

		if ( ! placing ) return;
		placing.heading = ( placing.heading + degrees + 360 ) % 360;
		if ( placing.entry ) {

			placing.entry.state.heading = placing.heading;
			models.apply( placing.entry );

		}

	}

	function commitPlacing( keepPlacing, showPanel = true ) {

		const { entry, item, heading } = placing ?? {};
		if ( ! entry ) return;
		placing = null;
		root.classList.remove( 'placing' );
		entry.placing = false;
		setGhost( entry, false );
		models.apply( entry );
		updateCount();
		if ( keepPlacing ) startPlacing( item, { heading } );
		else select( entry, showPanel );

	}

	function cancelPlacing() {

		if ( ! placing ) return;
		placing.cancelled = true;
		if ( placing.entry ) models.remove( placing.entry );
		placing = null;
		root.classList.remove( 'placing' );

	}

	// See-through while it follows the mouse; materials are cloned because built-in pieces share them.
	function setGhost( entry, on ) {

		entry.pivot.traverse( object => {

			if ( ! object.isMesh ) return;
			if ( on ) {

				object.userData.solidMaterial = object.material;
				object.material = [ object.material ].flat().map( m => Object.assign( m.clone(), { transparent: true, opacity: 0.55 } ) );
				if ( object.material.length === 1 ) object.material = object.material[ 0 ];

			} else if ( object.userData.solidMaterial ) {

				[ object.material ].flat().forEach( m => m.dispose() );
				object.material = object.userData.solidMaterial;
				delete object.userData.solidMaterial;

			}

		} );

	}

	// --- selecting and moving ------------------------------------------------------------

	// showPanel: also open the P panel at this entry. Not for touch: the tap's click arrives after
	// the panel has opened and would land on whatever control is now under the finger.
	function select( entry, showPanel = true ) {

		selected = entry;
		highlight.visible = !! entry;
		if ( entry ) {

			highlight.setFromObject( entry.pivot );
			panel.focus( entry, showPanel );

		}

	}

	function rotateSelected( degrees ) {

		if ( ! selected ) return;
		selected.state.heading = ( selected.state.heading + degrees + 360 ) % 360;
		models.apply( selected );

	}

	// --- pointer and keyboard ------------------------------------------------------------

	// The left button can be let go while another is still held (e.g. right-drag to look); that
	// arrives as a pointermove, not a pointerup, so presses end whenever it is no longer down.
	function endPress( e ) {

		dragging = null;
		if ( drawing?.start ) finishDrawing( e.pointerType === 'mouse' );

	}

	canvas.addEventListener( 'pointermove', e => {

		pointer = { x: e.clientX, y: e.clientY };
		if ( ( dragging || drawing?.start ) && ( e.buttons & 1 ) === 0 ) endPress( e );
		if ( drawing?.start ) updateDrawing();
		if ( placing ) followPointer();
		if ( dragging ) {

			const point = groundPoint( e.clientX, e.clientY, dragging.entry.pivot );
			if ( point ) {

				models.moveTo( dragging.entry, point.add( dragging.offset ) );
				dragging.moved = true;

			}

		}

	} );

	canvas.addEventListener( 'pointerleave', () => {

		pointer = null;

	} );

	canvas.addEventListener( 'pointerdown', e => {

		if ( e.button !== 0 || controls.locked || isDriving() ) return;
		pointer = { x: e.clientX, y: e.clientY };

		if ( drawing ) {

			const start = groundPoint( e.clientX, e.clientY );
			if ( start && drawing.tool.mode === 'point' ) finishPoint( start, e.pointerType === 'mouse' );
			else if ( start ) {

				drawing.start = start;
				canvas.setPointerCapture( e.pointerId );

			}

			suppressClick = true;
			return;

		}

		const mouse = e.pointerType === 'mouse';
		if ( placing ) {

			followPointer();
			commitPlacing( e.shiftKey, mouse );
			suppressClick = true;
			return;

		}

		dragging = null;
		const hit = pick( e.clientX, e.clientY );
		if ( hit ) {

			select( hit.entry, mouse );
			const ground = groundPoint( e.clientX, e.clientY, hit.entry.pivot ) ?? hit.point;
			dragging = { entry: hit.entry, offset: _offset.copy( hit.entry.pivot.position ).sub( ground ).setY( 0 ).clone(), moved: false };
			canvas.setPointerCapture( e.pointerId );
			suppressClick = true;
			return;

		}

		if ( open ) {

			select( null );
			suppressClick = true;

		}

	} );

	canvas.addEventListener( 'pointerup', e => {

		if ( ( e.buttons & 1 ) === 0 ) endPress( e );

	} );

	// The browser took the touch over (scrolling, a system gesture) or capture was lost: stop
	// dragging, so the item doesn't later jump to wherever the next touch lands.
	canvas.addEventListener( 'pointercancel', () => {

		dragging = null;
		if ( drawing?.start ) cancelDrawing();

	} );
	canvas.addEventListener( 'lostpointercapture', () => {

		dragging = null;

	} );

	// While editing, a click selects or places instead of capturing the mouse.
	controls.canLockPointer = () => {

		const allowed = ! suppressClick && ! placing && ! drawing;
		suppressClick = false;
		return allowed;

	};

	canvas.addEventListener( 'wheel', e => {

		if ( ! placing ) return;
		e.preventDefault();
		rotatePlacing( Math.sign( e.deltaY ) * ROTATE_STEP );

	}, { passive: false } );

	// Dragging a card onto the scene. Only the scene takes the drop; let go anywhere else (over the
	// sidebar, say) and the card's dragend cancels it.
	window.addEventListener( 'dragover', e => {

		if ( ! e.dataTransfer?.types.includes( DRAG_TYPE ) || e.target !== canvas ) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		pointer = { x: e.clientX, y: e.clientY };
		followPointer();

	} );

	window.addEventListener( 'drop', e => {

		if ( ! e.dataTransfer?.types.includes( DRAG_TYPE ) || e.target !== canvas ) return;
		e.preventDefault();
		pointer = { x: e.clientX, y: e.clientY };
		followPointer();
		if ( placing?.entry ) commitPlacing( false );
		else if ( placing ) {

			// Still loading: place it when it arrives. No longer a drag, so dragend leaves it be.
			placing.fromDrag = false;
			placing.commitWhenLoaded = true;

		}

	} );

	window.addEventListener( 'keydown', e => {

		if ( isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey || isDriving() ) return;
		if ( e.code === 'KeyL' && ! e.repeat ) setOpen( ! open );
		else if ( e.code === 'Escape' ) {

			if ( drawing ) cancelDrawing();
			else if ( placing ) cancelPlacing();
			else select( null );

		} else if ( e.code === 'KeyR' ) {

			const step = e.shiftKey ? - ROTATE_STEP : ROTATE_STEP;
			if ( placing ) rotatePlacing( step );
			else rotateSelected( step );

		} else if ( ( e.code === 'Delete' || e.code === 'Backspace' ) && selected && ! placing ) {

			e.preventDefault();
			models.remove( selected );

		}

	}, true );

	// --- tools: drawing areas and picking points -------------------------------------------

	// Drag out a rectangle on the ground, lined up with the way you're looking, or pick a point.
	function startDrawing( tool ) {

		cancelPlacing();
		cancelDrawing();
		select( null );
		document.exitPointerLock?.();
		const outline = new LineLoop( new BufferGeometry(), new LineBasicMaterial( { color: tool.color ?? 0xff3322 } ) );
		outline.visible = false;
		scene.add( outline );
		drawing = { tool, start: null, heading: getPlayer().heading, outline };
		root.classList.add( 'placing' );
		tool.card.classList.add( 'active' );

	}

	// The rectangle from the drag start to the pointer, in the drawing's own axes.
	function drawnRectangle() {

		const end = pointer && groundPoint( pointer.x, pointer.y );
		if ( ! end ) return null;
		const a = localToEnu( drawing.start );
		const b = localToEnu( end );
		const rad = drawing.heading * Math.PI / 180;
		const de = b.east - a.east;
		const dn = b.north - a.north;
		return {
			across: de * Math.cos( rad ) - dn * Math.sin( rad ),
			along: de * Math.sin( rad ) + dn * Math.cos( rad ),
			east: ( a.east + b.east ) / 2,
			north: ( a.north + b.north ) / 2,
			height: drawing.start.y,
		};

	}

	function updateDrawing() {

		const rect = drawnRectangle();
		if ( ! rect ) return;
		const rad = drawing.heading * Math.PI / 180;
		const corners = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ i, j ] ) => {

			const x = i * rect.across / 2;
			const y = j * rect.along / 2;
			const east = rect.east + x * Math.cos( rad ) + y * Math.sin( rad );
			const north = rect.north - x * Math.sin( rad ) + y * Math.cos( rad );
			return new Vector3( - east, rect.height + 0.2, north );

		} );
		drawing.outline.geometry.setFromPoints( corners );
		drawing.outline.visible = true;

	}

	async function finishDrawing( showPanel = true ) {

		const rect = drawnRectangle();
		const { heading, tool } = drawing;
		cancelDrawing();
		if ( ! rect ) return;
		// A click without much of a drag makes an area of the tool's default size there.
		const [ defaultWidth, defaultLength ] = tool.defaultSize ?? [ 10, 10 ];
		const dragged = Math.abs( rect.across ) >= 1 || Math.abs( rect.along ) >= 1;
		const width = Math.abs( rect.across ) < 1 ? defaultWidth : Math.round( Math.abs( rect.across ) * 10 ) / 10;
		const length = Math.abs( rect.along ) < 1 ? defaultLength : Math.round( Math.abs( rect.along ) * 10 ) / 10;
		await runTool( tool, {
			east: Math.round( rect.east * 100 ) / 100,
			north: Math.round( rect.north * 100 ) / 100,
			height: rect.height,
			heading: Math.round( heading * 10 ) / 10,
			width,
			length,
			dragged,
		}, showPanel );

	}

	async function finishPoint( point, showPanel ) {

		const { heading, tool } = drawing;
		cancelDrawing();
		const { east, north } = localToEnu( point );
		await runTool( tool, { east: Math.round( east * 100 ) / 100, north: Math.round( north * 100 ) / 100, height: point.y, heading: Math.round( heading * 10 ) / 10 }, showPanel );

	}

	async function runTool( tool, shape, showPanel ) {

		try {

			const entry = await tool.onDone( shape );
			if ( entry?.pivot ) select( entry, showPanel );

		} catch ( err ) {

			onError( `${ tool.name }: ${ err.message }` );

		}

	}

	function cancelDrawing() {

		if ( ! drawing ) return;
		scene.remove( drawing.outline );
		drawing.outline.geometry.dispose();
		drawing.outline.material.dispose();
		drawing.tool.card.classList.remove( 'active' );
		drawing = null;
		root.classList.remove( 'placing' );

	}

	// --- helpers -------------------------------------------------------------------------

	// The point on the ground (or on another model) under the cursor, skipping `exclude`.
	function groundPoint( x, y, exclude ) {

		const hit = castFromScreen( x, y, [ ...getGround(), models.group ] )
			.find( h => ! exclude || ! isInside( h.object, exclude ) );
		return hit ? hit.point.clone() : null;

	}

	// The placed model under the cursor, unless something else (a building) is in front of it.
	function pick( x, y ) {

		const hit = castFromScreen( x, y, [ ...getGround(), models.group ] )[ 0 ];
		const entry = hit && models.entryFor( hit.object );
		return entry && ! entry.placing ? { entry, point: hit.point } : null;

	}

	function castFromScreen( x, y, objects ) {

		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( x - rect.left ) / rect.width * 2 - 1, - ( y - rect.top ) / rect.height * 2 + 1 );
		raycaster.setFromCamera( _ndc, camera );
		// Hidden things (flatten zones outside build mode) can't be clicked.
		return raycaster.intersectObjects( objects, true ).filter( h => h.object.isMesh && isVisible( h.object ) );

	}

	return {
		update() {

			if ( selected ) highlight.setFromObject( selected.pivot );
			if ( placing?.entry && placing.commitWhenLoaded ) commitPlacing( false );

		},
		isOpen: () => open,
		getSelected: () => selected,
		deselect: () => select( null ),
		select: entry => select( entry ),
		addTool,
	};

}

function isVisible( object ) {

	for ( let o = object; o; o = o.parent ) if ( ! o.visible ) return false;
	return true;

}

function isInside( object, ancestor ) {

	for ( let o = object; o; o = o.parent ) if ( o === ancestor ) return true;
	return false;

}

function measure( object ) {

	new Box3().setFromObject( object ).getSize( _size );
	const round = v => Math.round( v * 10 ) / 10;
	const [ length, width ] = _size.x >= _size.z ? [ _size.x, _size.z ] : [ _size.z, _size.x ];
	return { length: round( length ), width: round( width ), height: round( _size.y ) };

}

// Small renders of the built-in pieces for their cards, drawn once when the sidebar first opens.
function renderThumbnails( cards ) {

	const size = 128;
	const renderer = new WebGLRenderer( { antialias: true, alpha: true, preserveDrawingBuffer: true } );
	renderer.setSize( size, size );
	const scene = new Scene();
	scene.add( new HemisphereLight( 0xffffff, 0x667066, 2 ) );
	const sun = new DirectionalLight( 0xffffff, 2 );
	sun.position.set( - 3, 5, - 4 );
	scene.add( sun );
	const camera = new PerspectiveCamera( 30, 1, 0.01, 1000 );

	for ( const { item, thumb } of cards ) {

		const object = buildProcedural( item.id );
		scene.add( object );
		const box = new Box3().setFromObject( object );
		box.getCenter( _center );
		const radius = box.getSize( _size ).length() / 2;
		const distance = radius / Math.sin( camera.fov * Math.PI / 360 ) * 1.05;
		// Three-quarter view from the front-left, slightly above.
		camera.position.copy( _center ).add( new Vector3( - 0.6, 0.45, - 0.75 ).normalize().multiplyScalar( distance ) );
		camera.lookAt( _center );
		camera.updateProjectionMatrix();
		renderer.render( scene, camera );
		thumb.src = renderer.domElement.toDataURL();
		scene.remove( object );
		object.traverse( o => o.geometry?.dispose() );

	}

	renderer.dispose();
	renderer.forceContextLoss();

}
