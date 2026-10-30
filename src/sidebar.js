import {
	Box3,
	BoxHelper,
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

const ROTATE_STEP = 15;
const DRAG_TYPE = 'application/x-library-item';

const _ndc = new Vector2();
const _offset = new Vector3();
const _size = new Vector3();
const _center = new Vector3();

// The library sidebar (L): pick an item and click the ground to place it, or drag it onto the
// scene. A see-through preview follows the mouse; R or the wheel rotates it, Esc cancels and
// Shift+click keeps placing more of the same. Placed items can be clicked to select, dragged to
// move, turned with R and removed with Delete.
export function createSidebar( { library, models, layout, scene, camera, canvas, controls, getGround, getPlayer, panel, onError } ) {

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

	// --- the list ------------------------------------------------------------------------

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

	function commitPlacing( keepPlacing ) {

		const { entry, item, heading } = placing ?? {};
		if ( ! entry ) return;
		placing = null;
		root.classList.remove( 'placing' );
		entry.placing = false;
		setGhost( entry, false );
		models.apply( entry );
		updateCount();
		if ( keepPlacing ) startPlacing( item, { heading } );
		else select( entry );

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

	function select( entry ) {

		selected = entry;
		highlight.visible = !! entry;
		if ( entry ) {

			highlight.setFromObject( entry.pivot );
			panel.focus( entry );

		}

	}

	function rotateSelected( degrees ) {

		if ( ! selected ) return;
		selected.state.heading = ( selected.state.heading + degrees + 360 ) % 360;
		models.apply( selected );

	}

	// --- pointer and keyboard ------------------------------------------------------------

	canvas.addEventListener( 'pointermove', e => {

		pointer = { x: e.clientX, y: e.clientY };
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

		if ( e.button !== 0 || controls.locked ) return;
		pointer = { x: e.clientX, y: e.clientY };

		if ( placing ) {

			followPointer();
			commitPlacing( e.shiftKey );
			suppressClick = true;
			return;

		}

		const hit = pick( e.clientX, e.clientY );
		if ( hit ) {

			select( hit.entry );
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

		if ( e.button === 0 ) dragging = null;

	} );

	// While editing, a click selects or places instead of capturing the mouse.
	controls.canLockPointer = () => {

		const allowed = ! suppressClick && ! placing;
		suppressClick = false;
		return allowed;

	};

	canvas.addEventListener( 'wheel', e => {

		if ( ! placing ) return;
		e.preventDefault();
		rotatePlacing( Math.sign( e.deltaY ) * ROTATE_STEP );

	}, { passive: false } );

	// Dragging a card onto the scene.
	window.addEventListener( 'dragover', e => {

		if ( ! e.dataTransfer?.types.includes( DRAG_TYPE ) ) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		pointer = { x: e.clientX, y: e.clientY };
		followPointer();

	} );

	window.addEventListener( 'drop', e => {

		if ( ! e.dataTransfer?.types.includes( DRAG_TYPE ) ) return;
		e.preventDefault();
		pointer = { x: e.clientX, y: e.clientY };
		followPointer();
		if ( placing?.entry ) commitPlacing( false );
		else if ( placing ) placing.commitWhenLoaded = true;

	} );

	window.addEventListener( 'keydown', e => {

		if ( isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		if ( e.code === 'KeyL' && ! e.repeat ) setOpen( ! open );
		else if ( e.code === 'Escape' ) {

			if ( placing ) cancelPlacing();
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
		return raycaster.intersectObjects( objects, true ).filter( h => h.object.isMesh );

	}

	return {
		update() {

			if ( selected ) highlight.setFromObject( selected.pivot );
			if ( placing?.entry && placing.commitWhenLoaded ) commitPlacing( false );

		},
		isOpen: () => open,
	};

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
