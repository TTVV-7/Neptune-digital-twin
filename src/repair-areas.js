import './repair-areas.css';
import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, LineLoop, Matrix3, Matrix4, Mesh, MeshBasicMaterial, DoubleSide, Plane, PropertyBinding, Raycaster, Vector2, Vector3 } from 'three';
import { loadConfig } from './cloud.js';
import { sendForEveryone } from './placements.js';
import { useFastRaycast } from './raycast.js';
import { areaExtras, areaName, areaParts, basisOf, CHIPPED, cutOut, describeArea, outlineNormal, trianglesOf } from './repair-geometry.js';
import { isTyping } from './walk.js';

// Fixing the B2D2 model's repair areas in the twin: moving areas drawn in the wrong spot or turned
// the wrong way, drawing new ones, changing an area's details and taking areas away. A model whose
// glTF scene extras name its area data (`repairs`, a .json next to it that
// scripts/b2d2-repair-model.mjs writes) gets "Edit areas" in the views bar. In it, a click picks
// an area and dragging moves it along its face; the panel nudges it (left, right, up and down as
// you look at it), turns it in its face, or moves it onto another wall, floor or soffit you click.
// "Add area" draws one on the wall, floor or soffit you start on: drag a box, or click its corners.
// Every area is built with the build's own code (repair-geometry.js), chipped recess, rebar and
// all, and the concrete it's cut out of is cut again.
//
// "Save for everyone" sends the changes to the server (worker/area-edits.js) with the admin's
// passcode, as models' positions are; everyone who opens the site then sees them. "Back to the
// drawing" puts one of the drawing's areas back as the markups have it. Without a server, areas
// can be changed but not saved.

const API = new URL( 'api/area-edits/', document.baseURI );
const TIMEOUT = 15000;
// While dragging, the concrete is cut again at most this often (seconds), and once it stops.
const RECUT = 0.12;
// A press moves this far (px) before it's a drag rather than a click.
const DRAG = 4;
// A click this close (px) to the first corner closes the outline.
const CLOSE = 12;
// Smaller than this (m², or m a side for a box) isn't an area.
const SMALLEST = 0.005;
const HIGHLIGHT = 0xffd21f;
const STEPS = [ [ '1 cm', 0.01 ], [ '5 cm', 0.05 ], [ '10 cm', 0.1 ], [ '25 cm', 0.25 ], [ '1 m', 1 ] ];
const TURNS = [ [ '1°', 1 ], [ '5°', 5 ], [ '15°', 15 ], [ '90°', 90 ] ];
const MARKED = 'Marked, not chipped yet';
const STATUSES = [ CHIPPED, MARKED ];
const TYPES = [ 'Exposed rebar', 'Spall', 'Delamination', 'Crack', 'Honeycombing', 'Corroded rebar' ];
// The rims of chipped areas, by when they were chipped: the progress drawings' colours, then
// others for later dates.
const CHIPPED_COLOURS = { '2026-11-02': '#22c55e', '2026-11-03': '#06b6d4', '2026-11-04': '#f97316', '2026-11-05/08': '#ec4899' };
const MORE_COLOURS = [ '#eab308', '#8b5cf6', '#ef4444', '#3b82f6', '#84cc16', '#f43f5e', '#14b8a6', '#a855f7' ];
const UNDATED = '#94a3b8';
// An area marked but not chipped yet: the artifact's colours.
const AREA_COLOUR = '#0e8fa8';
const EDGE_COLOUR = '#06414d';

const _raycaster = new Raycaster();
const _ndc = new Vector2();
const _inverse = new Matrix4();
const _normal = new Matrix3();

const today = () => {

	const d = new Date();
	return `${ d.getFullYear() }-${ String( d.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( d.getDate() ).padStart( 2, '0' ) }`;

};

export function rimColour( date ) {

	if ( ! date ) return UNDATED;
	if ( CHIPPED_COLOURS[ date ] ) return CHIPPED_COLOURS[ date ];
	const h = [ ...date ].reduce( ( h, c ) => ( h * 31 + c.charCodeAt( 0 ) ) >>> 0, 7 );
	return MORE_COLOURS[ h % MORE_COLOURS.length ];

}

export function setUpRepairAreas( { models, controls, onUpdate, toast, bar } ) {

	const camera = controls.camera;
	const canvas = controls.domElement;
	// One per model with areas: see track().
	const states = new Map();
	let editing = false;
	let selected = null; // { s, id }
	let picking = false; // the next click puts the selected area on the surface clicked
	let press = null; // a press on an area: { s, id, x, y, plane, start, m, dragging }
	// Drawing a new area: { s, corners, face, down, box, preview }; see the clicks below.
	let drawing = null;
	let dirtyCut = null; // a state whose concrete needs cutting again
	let sinceCut = 0;
	const history = []; // { s, id, had, value }, for Undo
	// What a new area is, as the last one drawn was.
	const defaults = { status: CHIPPED, chipped: today(), type: 'Exposed rebar', text: '' };

	// ---------- The button and the panel ----------

	const toggle = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'edit-areas', textContent: 'Edit areas', hidden: true } );
	toggle.title = 'Move, add or take away repair areas';
	toggle.addEventListener( 'click', () => setEditing( ! editing ) );
	bar?.append( toggle );

	const options = list => list.map( v => `<option value="${ v }">${ v }</option>` ).join( '' );
	const panel = document.createElement( 'section' );
	panel.id = 'area-editor';
	panel.hidden = true;
	panel.setAttribute( 'aria-label', 'Edit repair areas' );
	panel.innerHTML = `
		<header><h2>Edit repair areas</h2><button type="button" class="done" title="Stop editing">Done</button></header>
		<div class="row"><button type="button" class="add wide" title="Then drag a box on a wall, floor or soffit, or click its corners">+ Add area</button></div>
		<p class="what"></p>
		<div class="tools">
			<div class="row"><span class="label">Move</span>
				<button type="button" data-move="left" title="Move left">←</button>
				<button type="button" data-move="right" title="Move right">→</button>
				<button type="button" data-move="up" title="Move up (away from you on a floor)">↑</button>
				<button type="button" data-move="down" title="Move down (toward you on a floor)">↓</button>
				<select class="step" aria-label="Move by">${ STEPS.map( ( [ name, v ], i ) => `<option value="${ v }"${ i === 1 ? ' selected' : '' }>${ name }</option>` ).join( '' ) }</select>
			</div>
			<div class="row"><span class="label">Turn</span>
				<button type="button" data-turn="1" title="Turn anticlockwise">⟲</button>
				<button type="button" data-turn="-1" title="Turn clockwise">⟳</button>
				<select class="turn" aria-label="Turn by">${ TURNS.map( ( [ name, v ], i ) => `<option value="${ v }"${ i === 1 ? ' selected' : '' }>${ name }</option>` ).join( '' ) }</select>
			</div>
			<div class="row">
				<button type="button" class="surface wide" title="Then click the wall, floor or soffit it belongs on">Move to another surface…</button>
			</div>
			<div class="details">
				<label><span>Status</span><select data-field="status">${ options( STATUSES ) }</select></label>
				<label class="date"><span>Chipped</span><input data-field="chipped" list="area-dates" placeholder="2026-11-09" maxlength="40"><i class="swatch" title="Its rim's colour"></i></label>
				<label><span>Defect</span><input data-field="type" list="area-types" maxlength="100"></label>
				<label class="notes"><span>Notes</span><textarea data-field="text" rows="2" maxlength="1000"></textarea></label>
			</div>
			<div class="row">
				<button type="button" class="drawing wide" title="Put it back as the drawing has it">Back to the drawing</button>
				<button type="button" class="delete wide" title="Take this area away">Delete area</button>
			</div>
		</div>
		<p class="hint"></p>
		<p class="taken" hidden><span></span> <button type="button" class="restore">Bring back</button></p>
		<footer>
			<button type="button" class="undo">Undo</button>
			<button type="button" class="save primary">Save for everyone</button>
		</footer>
		<datalist id="area-types">${ options( TYPES ) }</datalist>
		<datalist id="area-dates"></datalist>
	`;
	document.body.append( panel );
	const $ = selector => panel.querySelector( selector );
	$( '.done' ).addEventListener( 'click', () => setEditing( false ) );
	$( '.add' ).addEventListener( 'click', () => drawing ? stopDrawing() : startDrawing() );
	for ( const button of panel.querySelectorAll( '[data-move]' ) ) button.addEventListener( 'click', () => nudge( button.dataset.move ) );
	for ( const button of panel.querySelectorAll( '[data-turn]' ) ) button.addEventListener( 'click', () => turn( Number( button.dataset.turn ) * Number( $( '.turn' ).value ) ) );
	$( '.surface' ).addEventListener( 'click', () => {

		stopDrawing();
		picking = ! picking;
		render();

	} );
	$( '.drawing' ).addEventListener( 'click', () => {

		if ( selected ) change( selected.s, selected.id, 'drawing' );

	} );
	$( '.delete' ).addEventListener( 'click', () => {

		if ( ! selected ) return;
		const { s, id } = selected;
		change( s, id, { deleted: true } );
		select( null );

	} );
	$( '.restore' ).addEventListener( 'click', () => {

		for ( const s of states.values() ) for ( const id of takenAway( s ) ) change( s, id, 'drawing', true, false );
		for ( const s of states.values() ) cut( s );
		render();

	} );
	for ( const field of panel.querySelectorAll( '[data-field]' ) ) field.addEventListener( 'change', () => setDetail( field.dataset.field, field.value.trim() ) );
	$( '.undo' ).addEventListener( 'click', undo );
	$( '.save' ).addEventListener( 'click', save );

	function render() {

		toggle.hidden = states.size === 0;
		toggle.classList.toggle( 'active', editing );
		panel.hidden = ! editing;
		document.body.classList.toggle( 'editing-areas', editing );
		canvas?.classList.toggle( 'picking-surface', editing && ( picking || !! drawing ) );
		if ( ! editing ) return;

		const m = selected && markupOf( selected.s, selected.id );
		$( '.add' ).classList.toggle( 'active', !! drawing );
		$( '.add' ).textContent = drawing ? 'Drawing… (Esc: cancel)' : '+ Add area';
		$( '.what' ).textContent = m ? `${ areaName( m ) }${ m.grid ? ` · ${ m.grid }` : '' }` : drawing ? '' : 'Click a repair area to change it, or add one.';
		$( '.what' ).hidden = !! drawing;
		$( '.tools' ).hidden = ! m || !! drawing;
		$( '.surface' ).classList.toggle( 'active', picking );
		$( '.surface' ).textContent = picking ? 'Click the surface it goes on (Esc: cancel)' : 'Move to another surface…';
		const added = m && ! selected.s.base.has( selected.id );
		const where = selected && effective( selected.s, selected.id );
		const dirty = selected && isDirty( selected.s, selected.id );
		$( '.drawing' ).hidden = added;
		$( '.drawing' ).disabled = ! where;
		if ( m ) {

			const f = m.f ?? {};
			for ( const field of panel.querySelectorAll( '[data-field]' ) ) if ( document.activeElement !== field ) field.value = f[ field.dataset.field ] ?? '';
			if ( ! STATUSES.includes( f.status ) ) $( '[data-field=status]' ).value = MARKED;
			$( '.date' ).hidden = f.status !== CHIPPED;
			$( '.swatch' ).style.background = rimColour( f.chipped );
			$( '#area-dates' ).innerHTML = options( [ ...new Set( [ ...Object.keys( CHIPPED_COLOURS ), ...allDates(), today() ] ) ].sort() );

		}

		$( '.hint' ).textContent = drawing
			? drawing.corners.length
				? `${ drawing.corners.length } corner${ drawing.corners.length === 1 ? '' : 's' }: click the next. Click the first corner, double-click or Enter to finish; Backspace takes the last back.`
				: 'Drag a box on a wall, floor or soffit of the model, or click its first corner to draw it corner by corner.'
			: m
				? `${ added
					? dirty ? 'Added, not saved yet. ' : 'Added in the twin, saved for everyone. '
					: dirty ? 'Changed, not saved yet. ' : where ? 'Changed, and saved for everyone. ' : 'As the drawing has it. ' }Drag it to slide it along its face.`
				: 'Right-drag to look round, and WASD or the arrow keys to move, as usual.';
		const taken = [ ...states.values() ].reduce( ( n, s ) => n + takenAway( s ).length, 0 );
		$( '.taken' ).hidden = taken === 0 || !! drawing;
		$( '.taken span' ).textContent = `${ taken } of the drawing's areas taken away.`;
		const count = changes();
		$( '.save' ).textContent = count ? `Save for everyone (${ count })` : 'Save for everyone';
		$( '.save' ).disabled = count === 0;
		$( '.undo' ).disabled = history.length === 0;

	}

	function setEditing( on ) {

		if ( on === editing ) return;
		editing = on;
		picking = false;
		press = null;
		stopDrawing( false );
		if ( on ) {

			if ( controls.locked ) document.exitPointerLock?.();
			for ( const s of states.values() ) ensureData( s ).catch( () => toast?.( 'Couldn\'t load the repair areas\' data, so they can\'t be changed.' ) );

		} else {

			select( null );
			const count = changes();
			if ( count ) toast?.( `${ count } change${ count === 1 ? ' to the repair areas isn\'t' : 's to the repair areas aren\'t' } saved for everyone yet: only you see ${ count === 1 ? 'it' : 'them' }, until the page is reloaded` );

		}

		render();

	}

	// ---------- Models with areas ----------

	// s: { entry, content, model, dataUrl, data, base, order, triangles, all, saved, local, planes,
	// nodes, mats, shared, rims, layerMeshes, group, highlight }
	function track( entry ) {

		const content = entry.pivot.children[ 0 ];
		const file = content?.userData?.repairs;
		if ( ! file || ! entry.url || states.has( entry ) ) return;
		const model = entry.url.split( '/' ).pop().replace( /\.(glb|gltf)$/i, '' );
		if ( ! /^[A-Za-z0-9_-]{1,64}$/.test( model ) ) return;
		const s = {
			entry, content, model,
			dataUrl: new URL( file, new URL( entry.url, document.baseURI ) ),
			data: null, loading: null,
			// On the server: id -> an edit (see effective()).
			saved: new Map(),
			// Changes in this browser not saved yet: id -> an edit, or 'drawing' for back to the drawing.
			local: new Map(),
			planes: new Map(),
			nodes: new Map(),
		};
		states.set( entry, s );
		render();
		loadSaved( s );

	}

	// What the admin changed, for everyone. A slow or failed answer is tried again, so a busy
	// moment as the site opens doesn't leave the areas as the drawing has them.
	async function loadSaved( s ) {

		if ( ! await loadConfig() ) return;
		for ( let attempt = 0; attempt < 4; attempt ++ ) {

			if ( attempt ) await new Promise( resolve => setTimeout( resolve, 2000 * attempt ) );
			if ( states.get( s.entry ) !== s ) return;
			try {

				const res = await fetch( new URL( s.model, API ), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout( TIMEOUT ) } );
				// No such API here (an older server): nothing to load.
				if ( ! res.ok || ! /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ) {

					if ( res.status >= 500 ) continue;
					return;

				}

				const { edits } = await res.json();
				if ( ! edits?.length || states.get( s.entry ) !== s ) return;
				for ( const { id, updatedAt, ...edit } of edits ) s.saved.set( id, edit );
				await ensureData( s );
				for ( const id of s.saved.keys() ) if ( ! s.local.has( id ) ) rebuild( s, id );
				cut( s );
				render();
				return;

			} catch {

				// Tried again.

			}

		}

	}

	// The areas as drawn and the concrete they're cut out of; the materials the model has for them.
	function ensureData( s ) {

		s.loading ??= ( async () => {

			const res = await fetch( s.dataUrl, { signal: AbortSignal.timeout( TIMEOUT * 3 ) } );
			if ( ! res.ok ) throw new Error( `${ res.status }` );
			const data = await res.json();
			s.origin = new Vector3( ...data.origin );
			s.base = new Map( data.markups.map( m => [ m.id, m ] ) );
			s.order = data.markups.map( m => m.id );
			s.triangles = Object.fromEntries( Object.entries( data.layers ).map( ( [ key, { positions, index } ] ) => [ key, trianglesOf( { positions, index } ) ] ) );
			s.all = Object.values( s.triangles ).flat();

			s.layerMeshes = {};
			s.group = null;
			const named = new Map();
			s.content.traverse( object => {

				if ( object.name === gltfName( 'Repair areas' ) ) s.group = object;
				if ( object.userData?.id && object.userData.xraySolid ) s.nodes.set( object.userData.id, object );
				if ( object.isMesh ) for ( const material of [ object.material ].flat() ) if ( ! named.has( material.name ) ) named.set( material.name, material );
				for ( const [ key, layer ] of Object.entries( data.layers ) ) if ( object.isMesh && meshName( object ) === gltfName( layer.name ) ) s.layerMeshes[ key ] ??= object;

			} );
			// A model with only chipped areas has no flat patches' materials: made as the build makes them.
			s.shared = {
				fill: named.get( 'Repair area' ) ?? Object.assign( new MeshBasicMaterial( { color: AREA_COLOUR, transparent: true, opacity: 0.7, side: DoubleSide } ), { name: 'Repair area' } ),
				edge: named.get( 'Repair area outline' ) ?? Object.assign( new MeshBasicMaterial( { color: EDGE_COLOUR, side: DoubleSide } ), { name: 'Repair area outline' } ),
				rebar: named.get( 'Exposed rebar' ), recess: named.get( 'Chipped concrete' ),
			};
			// Chipped areas' rims, by date: "Chipped 2026-11-02" in the model, more made as needed.
			s.rims = new Map();
			for ( const [ name, material ] of named ) if ( name.startsWith( 'Chipped' ) && name !== 'Chipped concrete' ) s.rims.set( name.slice( 8 ), material );
			s.data = data;
			for ( const id of ids( s ) ) s.planes.set( id, partsOf( s, id )?.plane ?? null );

		} )();
		// A failed load can be tried again.
		s.loading.catch( () => {

			s.loading = null;

		} );
		return s.loading;

	}

	// What three.js's loader names a node: spaces and some marks are taken out of names.
	const gltfName = name => PropertyBinding.sanitizeNodeName( name );
	// A mesh's name in the glTF: three.js names a node's only mesh after the node.
	const meshName = object => object.name || object.parent?.name;

	function rimFor( s, date ) {

		const key = date ?? '';
		if ( ! s.rims.has( key ) ) {

			const like = s.rims.values().next().value;
			// Like the model's own rims (unlit), in its own colour.
			const material = like ? like.clone() : new MeshBasicMaterial( { side: DoubleSide } );
			material.color.set( rimColour( date ) );
			material.name = `Chipped ${ key }`.trim();
			s.rims.set( key, material );

		}

		return s.rims.get( key );

	}

	// ---------- What an area is now ----------

	// An edit is { deleted: true }, or where the area is, { pts, n }, with its details for one added
	// in the twin (added: true) or changed: f { status, chipped, type, text }, zone, face, grid, area.
	// effective(): the one that counts in this browser now, or null for as the drawing has it.
	function effective( s, id ) {

		if ( s.local.has( id ) ) {

			const value = s.local.get( id );
			return value === 'drawing' ? null : value;

		}

		return s.saved.get( id ) ?? null;

	}

	// The area as a markup, or null if there's none (taken away, or not loaded).
	function markupOf( s, id ) {

		const base = s.base?.get( id );
		const edit = effective( s, id );
		if ( edit?.deleted || ( ! base && ! edit ) ) return null;
		if ( ! edit ) return base;
		return { ...base, src: base?.src ?? 'twin', ...edit, id, f: { ...base?.f, ...edit.f } };

	}

	// The drawing's areas, then those added here, in the order they came.
	const ids = s => [ ...new Set( [ ...( s.order ?? [] ), ...s.saved.keys(), ...s.local.keys() ] ) ];
	const takenAway = s => s.base ? s.order.filter( id => effective( s, id )?.deleted ) : [];
	const allDates = () => [ ...states.values() ].flatMap( s => ids( s ).map( id => markupOf( s, id )?.f?.chipped ) ).filter( Boolean );

	const same = ( a, b ) => JSON.stringify( a ?? null ) === JSON.stringify( b ?? null );
	function isDirty( s, id ) {

		if ( ! s.local.has( id ) ) return false;
		const now = effective( s, id );
		// Added and taken away again before it was ever saved: nothing to send.
		if ( now?.deleted && ! s.base?.has( id ) && ! s.saved.has( id ) ) return false;
		return ! same( now, s.saved.get( id ) );

	}

	const dirtyIds = s => [ ...s.local.keys() ].filter( id => isDirty( s, id ) );
	const changes = () => [ ...states.values() ].reduce( ( n, s ) => n + dirtyIds( s ).length, 0 );

	// The edit for an area at pts, facing n, keeping what else it has. An added area's names follow
	// it to where it goes.
	function placed( s, id, pts, n ) {

		const edit = effective( s, id );
		const value = { ...( edit?.deleted ? {} : edit ), pts, n };
		if ( value.added ) Object.assign( value, describeArea( pts, n ) );
		return value;

	}

	// value: an edit, or 'drawing'. `record`: for Undo (a drag records once, when it starts).
	function change( s, id, value, record = true, recut = true ) {

		if ( record ) history.push( { s, id, had: s.local.has( id ), value: s.local.get( id ) } );
		s.local.set( id, value );
		rebuild( s, id );
		if ( recut ) dirtyCut = s;
		render();

	}

	function undo() {

		const last = history.pop();
		if ( ! last ) return;
		const { s, id, had, value } = last;
		if ( had ) s.local.set( id, value );
		else s.local.delete( id );
		rebuild( s, id );
		cut( s );
		if ( states.get( s.entry ) === s ) select( markupOf( s, id ) ? { s, id } : null );
		render();

	}

	// A detail of the selected area: status, chipped, type or text (notes).
	function setDetail( field, value ) {

		if ( ! selected ) return;
		const { s, id } = selected;
		const m = markupOf( s, id );
		if ( ! m || ( m.f?.[ field ] ?? '' ) === value ) return;
		const edit = placed( s, id, m.pts, m.n );
		// Just the details kept for an area (worker/area-edits.js); an empty one stays empty.
		edit.f = Object.fromEntries( [ 'status', 'chipped', 'type', 'text' ].filter( key => m.f?.[ key ] != null ).map( key => [ key, m.f[ key ] ] ) );
		edit.f[ field ] = value;
		// What the next one drawn is.
		defaults[ field ] = value;
		change( s, id, edit );

	}

	// ---------- Building ----------

	const shifted = ( s, list ) => {

		const out = new Float32Array( list.length );
		for ( let i = 0; i < list.length; i += 3 ) {

			out[ i ] = list[ i ] - s.origin.x;
			out[ i + 1 ] = list[ i + 1 ] - s.origin.y;
			out[ i + 2 ] = list[ i + 2 ] - s.origin.z;

		}

		return out;

	};

	const partsOf = ( s, id ) => {

		const m = markupOf( s, id );
		return m && { m, ...areaParts( m, s.all ) };

	};

	function rebuild( s, id ) {

		if ( ! s.data || ! s.group ) return;
		const old = s.nodes.get( id );
		const built = partsOf( s, id );
		s.planes.set( id, built?.plane ?? null );
		if ( ! built ) {

			// Taken away.
			old?.removeFromParent();
			old?.traverse( object => object.geometry?.dispose() );
			s.nodes.delete( id );
			if ( selected?.s === s && selected.id === id ) select( null );
			return;

		}

		const { m, plane, parts } = built;
		const geometry = ( { pos, idx, nor, uv }, normal ) => {

			const g = new BufferGeometry();
			g.setAttribute( 'position', new BufferAttribute( shifted( s, pos ), 3 ) );
			if ( nor ) g.setAttribute( 'normal', new BufferAttribute( new Float32Array( nor ), 3 ) );
			else if ( normal ) g.setAttribute( 'normal', new BufferAttribute( new Float32Array( pos.length ).map( ( _, i ) => normal[ i % 3 ] ), 3 ) );
			if ( uv ) g.setAttribute( 'uv', new BufferAttribute( new Float32Array( uv ), 2 ) );
			if ( idx ) g.setIndex( idx );
			// Triangles listed one by one: each its own flat normal.
			if ( ! nor && ! normal ) g.computeVertexNormals();
			return g;

		};
		const node = new Group();
		node.name = areaName( m );
		node.userData = { ...areaExtras( m ), changed: !! effective( s, id ), added: ! s.base.has( id ) };
		if ( plane ) {

			node.add( new Mesh( geometry( parts.recess ), s.shared.recess ) );
			node.add( new Mesh( geometry( parts.rim, parts.rim.normal ), rimFor( s, m.f?.chipped ) ) );
			if ( parts.rebar.idx.length ) node.add( new Mesh( geometry( parts.rebar ), s.shared.rebar ) );

		} else {

			node.add( new Mesh( geometry( parts.fill, parts.normal ), s.shared.fill ) );
			node.add( new Mesh( geometry( parts.edge, parts.normal ), s.shared.edge ) );

		}

		useFastRaycast( node );
		if ( old?.parent ) {

			old.parent.children.splice( old.parent.children.indexOf( old ), 1, node );
			node.parent = old.parent;
			old.parent = null;
			old.traverse( object => object.geometry?.dispose() );

		} else s.group.add( node );
		node.updateMatrixWorld( true );
		s.nodes.set( id, node );
		if ( selected?.s === s && selected.id === id ) highlight( s, id );

	}

	// The concrete the areas are cut out of, cut again where they are now.
	function cut( s ) {

		if ( ! s.data ) return;
		const planes = ids( s ).map( id => s.planes.get( id ) ).filter( Boolean );
		for ( const [ key, mesh ] of Object.entries( s.layerMeshes ) ) {

			const { positions } = cutOut( s.triangles[ key ], planes );
			const g = new BufferGeometry();
			g.setAttribute( 'position', new BufferAttribute( shifted( s, positions ), 3 ) );
			const old = mesh.geometry;
			mesh.geometry = g;
			old.dispose();
			// The model's file may carry a transform for its compressed vertices: these have none.
			mesh.position.set( 0, 0, 0 );
			mesh.quaternion.identity();
			mesh.scale.set( 1, 1, 1 );
			mesh.updateMatrix();
			mesh.updateMatrixWorld( true );

		}

		if ( dirtyCut === s ) dirtyCut = null;
		sinceCut = 0;

	}

	// Under the status lines, which grow and shrink (underground, loading tiles), on a wide screen.
	const status = document.getElementById( 'status' );
	onUpdate?.( dt => {

		if ( editing && status && window.innerWidth > 700 ) {

			const top = status.hidden ? 12 : Math.round( status.getBoundingClientRect().bottom + 10 );
			if ( panel.style.top !== `${ top }px` ) panel.style.top = `${ top }px`;

		}

		sinceCut += dt;
		if ( dirtyCut && ( ! press?.dragging || sinceCut > RECUT ) ) cut( dirtyCut );

	} );

	// ---------- The selection ----------

	function select( pick ) {

		for ( const s of states.values() ) {

			s.highlight?.removeFromParent();
			s.highlight?.geometry.dispose();
			s.highlight = null;

		}

		selected = pick;
		picking = false;
		if ( pick ) highlight( pick.s, pick.id );
		render();

	}

	const outline = ( points, closed ) => {

		const line = new ( closed ? LineLoop : Line )(
			new BufferGeometry().setFromPoints( points ),
			new LineBasicMaterial( { color: HIGHLIGHT, depthTest: false, transparent: true } ),
		);
		line.renderOrder = 999;
		line.raycast = () => {};
		line.userData.noCollide = true;
		return line;

	};

	// A bright outline round the selected area, seen through whatever's in front of it.
	function highlight( s, id ) {

		s.highlight?.removeFromParent();
		s.highlight?.geometry.dispose();
		s.highlight = null;
		const m = markupOf( s, id );
		if ( ! m ) return;
		const plane = s.planes.get( id );
		const points = plane
			? plane.poly.map( ( [ u, v ] ) => new Vector3().addScaledVector( plane.U, u ).addScaledVector( plane.V, v ).addScaledVector( plane.N, plane.h + 0.006 ) )
			: m.pts.map( p => new Vector3( ...p ).addScaledVector( new Vector3( ...m.n ).normalize(), 0.04 ) );
		const line = outline( points.map( p => p.sub( s.origin ) ), true );
		// In the same frame as the areas (the model's own).
		( s.group?.parent ?? s.content ).add( line );
		s.highlight = line;

	}

	// ---------- Moving ----------

	// The face an area is on, in the model's markup frame: its normal and U, V across it.
	function faceOf( s, id ) {

		const plane = s.planes.get( id );
		const m = markupOf( s, id );
		const N = plane?.N.clone() ?? outlineNormal( m );
		return { N, ...basisOf( N ) };

	}

	const centroid = pts => pts.reduce( ( c, p ) => c.add( new Vector3( ...p ) ), new Vector3() ).divideScalar( pts.length );
	const round = v => Math.round( v * 1e4 ) / 1e4;
	const moved = ( s, id, m, by ) => placed( s, id, m.pts.map( p => new Vector3( ...p ).add( by ).toArray().map( round ) ), m.n );

	// The model's frame from the scene's: a direction, and a point.
	const toModel = ( s, direction ) => direction.clone().transformDirection( _inverse.copy( s.content.matrixWorld ).invert() );
	const toModelPoint = ( s, point ) => s.content.worldToLocal( point.clone() ).add( s.origin );
	const toScene = ( s, point ) => s.content.localToWorld( point.clone().sub( s.origin ) );

	// Left, right, up or down as you see it: along whichever way across its face goes most nearly
	// that way on the screen (a wall seen side-on goes away from you to the left, say).
	function nudge( way ) {

		if ( ! selected ) return;
		const { s, id } = selected;
		const m = markupOf( s, id );
		const { U, V } = faceOf( s, id );
		const c = centroid( m.pts );
		const onScreen = p => toScene( s, p ).project( camera );
		const from = onScreen( c );
		const want = { left: [ - 1, 0 ], right: [ 1, 0 ], up: [ 0, 1 ], down: [ 0, - 1 ] }[ way ];
		let best = null;
		for ( const d of [ U, U.clone().negate(), V, V.clone().negate() ] ) {

			const to = onScreen( c.clone().addScaledVector( d, 0.1 ) );
			const dx = ( to.x - from.x ) * camera.aspect, dy = to.y - from.y;
			const score = ( dx * want[ 0 ] + dy * want[ 1 ] ) / ( Math.hypot( dx, dy ) || 1 );
			if ( ! best || score > best.score ) best = { d, score };

		}

		change( s, id, moved( s, id, m, best.d.clone().multiplyScalar( Number( $( '.step' ).value ) ) ) );

	}

	// Turned in its face about its middle; positive anticlockwise as you look at it.
	function turn( degrees ) {

		if ( ! selected ) return;
		const { s, id } = selected;
		const m = markupOf( s, id );
		const { N } = faceOf( s, id );
		// Seen from in front, anticlockwise is about the normal toward you.
		const toward = toModel( s, camera.getWorldDirection( new Vector3() ) ).dot( N ) < 0 ? 1 : - 1;
		const c = centroid( m.pts );
		const angle = degrees * Math.PI / 180 * toward;
		change( s, id, placed( s, id, m.pts.map( p => new Vector3( ...p ).sub( c ).applyAxisAngle( N, angle ).add( c ).toArray().map( round ) ), m.n ) );

	}

	// The face of the concrete a ray hits: where, and its normal toward whoever's looking, both in
	// the model's markup frame, and its plane in the scene.
	function faceHit( s, hit ) {

		const normal = hit.face.normal.clone().applyMatrix3( _normal.getNormalMatrix( hit.object.matrixWorld ) ).normalize();
		// Facing whoever clicked it: the side it was seen from.
		if ( normal.dot( camera.position.clone().sub( hit.point ) ) < 0 ) normal.negate();
		return {
			at: toModelPoint( s, hit.point ),
			N: toModel( s, normal ).normalize(),
			plane: new Plane().setFromNormalAndCoplanarPoint( normal, hit.point ),
		};

	}

	const unit = N => N.toArray().map( v => Math.round( v * 1e6 ) / 1e6 );

	// Onto the surface hit, its middle where it was clicked, the same way up on it as it can be.
	function onto( s, id, hit ) {

		const m = markupOf( s, id );
		const from = faceOf( s, id );
		const { at, N } = faceHit( s, hit );
		const { U, V } = basisOf( N );
		const c = centroid( m.pts );
		const pts = m.pts.map( p => {

			const d = new Vector3( ...p ).sub( c );
			return at.clone().addScaledVector( U, d.dot( from.U ) ).addScaledVector( V, d.dot( from.V ) ).toArray().map( round );

		} );
		change( s, id, placed( s, id, pts, unit( N ) ) );

	}

	// ---------- Drawing a new area ----------

	async function startDrawing() {

		const s = [ ...states.values() ][ 0 ];
		if ( ! s ) return;
		try {

			await ensureData( s );

		} catch {

			toast?.( 'Couldn\'t load the repair areas\' data, so areas can\'t be added.' );
			return;

		}

		if ( ! editing ) return;
		select( null );
		picking = false;
		drawing = { s, corners: [], face: null, down: null, box: null, preview: null };
		render();

	}

	function stopDrawing( say = true ) {

		if ( ! drawing ) return;
		drawing.preview?.removeFromParent();
		drawing.preview?.geometry.dispose();
		drawing = null;
		if ( say ) render();

	}

	// Where the pointer is on the face being drawn on, in the markup frame.
	const onFace = e => {

		const point = ray( e ).ray.intersectPlane( drawing.face.plane, new Vector3() );
		return point && toModelPoint( drawing.s, point );

	};

	// A box from one corner to the other, square to the face (level on a wall).
	function boxCorners( a, b ) {

		const { U, V, N } = { ...basisOf( drawing.face.N ), N: drawing.face.N };
		const h = a.dot( N );
		const [ s0, t0, s1, t1 ] = [ a.dot( U ), a.dot( V ), b.dot( U ), b.dot( V ) ];
		const at = ( u, v ) => new Vector3().addScaledVector( U, u ).addScaledVector( V, v ).addScaledVector( N, h );
		return { corners: [ at( s0, t0 ), at( s1, t0 ), at( s1, t1 ), at( s0, t1 ) ], width: Math.abs( s1 - s0 ), height: Math.abs( t1 - t0 ) };

	}

	function showDrawing( points, closed ) {

		const { s } = drawing;
		drawing.preview?.removeFromParent();
		drawing.preview?.geometry.dispose();
		const N = drawing.face.N;
		drawing.preview = outline( points.map( p => p.clone().addScaledVector( N, 0.01 ).sub( s.origin ) ), closed );
		( s.group?.parent ?? s.content ).add( drawing.preview );

	}

	function finishDrawing( corners ) {

		const { s, face } = drawing;
		// Corners clicked twice (a double-click) count once.
		const pts = corners.filter( ( p, i ) => i === 0 || p.distanceTo( corners[ i - 1 ] ) > 0.01 );
		if ( pts.length > 3 && pts[ 0 ].distanceTo( pts.at( - 1 ) ) <= 0.01 ) pts.pop();
		const n = unit( face.N );
		const outlinePts = pts.map( p => p.toArray().map( round ) );
		const described = pts.length >= 3 && describeArea( outlinePts, n );
		stopDrawing( false );
		if ( ! described || described.area < SMALLEST ) {

			toast?.( 'Too small for an area: drag a bigger box, or click at least three corners apart' );
			render();
			return;

		}

		const id = `twin-${ Array.from( crypto.getRandomValues( new Uint8Array( 8 ) ), b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' ) }`;
		const f = { status: defaults.status, type: defaults.type, ...( defaults.status === CHIPPED && defaults.chipped ? { chipped: defaults.chipped } : {} ), ...( defaults.text ? { text: defaults.text } : {} ) };
		change( s, id, { pts: outlinePts, n, added: true, f, ...described } );
		cut( s );
		select( { s, id } );

	}

	// ---------- Saving ----------

	async function save() {

		const jobs = [ ...states.values() ].flatMap( s => dirtyIds( s ).map( id => ( { s, id } ) ) );
		if ( ! jobs.length ) return;
		$( '.save' ).disabled = true;
		let done = 0;
		for ( const { s, id } of jobs ) {

			const edit = effective( s, id );
			const url = new URL( `${ s.model }/${ encodeURIComponent( id ) }`, API );
			// Back as drawn, or one added here taken away again: nothing kept for it.
			const gone = ! edit || ( edit.deleted && ! s.base.has( id ) );
			const result = gone ? await sendForEveryone( 'DELETE', url ) : await sendForEveryone( 'PUT', url, edit );
			if ( ! result.ok ) {

				toast?.( done ? `Saved ${ done } of ${ jobs.length }. ${ result.message }` : result.message );
				render();
				return;

			}

			if ( gone ) s.saved.delete( id );
			else s.saved.set( id, edit );
			s.local.delete( id );
			done ++;

		}

		toast?.( `Saved for everyone: ${ done } change${ done === 1 ? '' : 's' } to the repair areas` );
		render();

	}

	// ---------- Clicks while editing ----------

	const ray = e => {

		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( e.clientX - rect.left ) / rect.width * 2 - 1, - ( e.clientY - rect.top ) / rect.height * 2 + 1 );
		_raycaster.setFromCamera( _ndc, camera );
		return _raycaster;

	};

	// The concrete under the pointer: a wall, floor or soffit areas can go on.
	const concreteAt = ( s, e ) => ray( e ).intersectObjects( Object.values( s.layerMeshes ), false )[ 0 ] ?? null;

	// The area under the pointer, through walls: in here you pick areas, not concrete.
	function areaAt( e ) {

		const r = ray( e );
		let best = null;
		for ( const s of states.values() ) {

			if ( ! s.data || ! s.entry.pivot.visible ) continue;
			const hits = r.intersectObjects( [ ...s.nodes.values() ], true );
			if ( hits.length && ( ! best || hits[ 0 ].distance < best.hit.distance ) ) {

				let node = hits[ 0 ].object;
				while ( node && ! node.userData?.xraySolid ) node = node.parent;
				if ( node ) best = { s, id: node.userData.id, hit: hits[ 0 ] };

			}

		}

		return best;

	}

	const ours = e => editing && e.target === canvas && e.button === 0;
	const screenOf = p => {

		const v = toScene( drawing.s, p ).project( camera );
		const rect = canvas.getBoundingClientRect();
		return [ rect.left + ( v.x + 1 ) / 2 * rect.width, rect.top + ( 1 - v.y ) / 2 * rect.height ];

	};

	function drawPress( e ) {

		const { s, corners } = drawing;
		if ( corners.length === 0 ) {

			const hit = concreteAt( s, e );
			if ( ! hit ) {

				toast?.( 'Start on a wall, floor or soffit of the model' );
				return;

			}

			drawing.face = faceHit( s, hit );
			drawing.down = { x: e.clientX, y: e.clientY, at: drawing.face.at.clone() };
			canvas.setPointerCapture?.( e.pointerId );
			return;

		}

		const point = onFace( e );
		if ( ! point ) return;
		const [ x, y ] = screenOf( corners[ 0 ] );
		if ( corners.length >= 3 && Math.hypot( e.clientX - x, e.clientY - y ) < CLOSE ) {

			finishDrawing( corners );
			return;

		}

		corners.push( point );
		showDrawing( corners, false );
		render();

	}

	function drawMove( e ) {

		const { down, corners } = drawing;
		if ( down && corners.length === 0 ) {

			if ( ! drawing.box && Math.hypot( e.clientX - down.x, e.clientY - down.y ) < DRAG ) return;
			const point = onFace( e );
			if ( ! point ) return;
			drawing.box = boxCorners( down.at, point );
			showDrawing( drawing.box.corners, true );

		} else if ( corners.length ) {

			const point = onFace( e );
			if ( point ) showDrawing( [ ...corners, point ], false );

		}

	}

	function drawRelease() {

		const { down, box } = drawing;
		if ( ! down ) return;
		drawing.down = null;
		if ( box ) {

			if ( box.width < 0.05 || box.height < 0.05 ) {

				drawing.box = null;
				showDrawing( [], false );
				toast?.( 'Too small for an area: drag a bigger box' );
				return;

			}

			finishDrawing( box.corners );
			return;

		}

		// A click, not a drag: the first corner of an outline drawn corner by corner.
		drawing.corners.push( down.at );
		showDrawing( drawing.corners, false );
		render();

	}

	window.addEventListener( 'pointerdown', e => {

		if ( ! ours( e ) ) return;
		// Not the model picked up, the mouse captured or the view's glide stopped: the editor's.
		e.stopImmediatePropagation();
		if ( drawing ) {

			drawPress( e );
			return;

		}

		if ( picking && selected ) {

			const { s } = selected;
			const hit = concreteAt( s, e );
			if ( hit ) {

				onto( s, selected.id, hit );
				picking = false;
				cut( s );
				render();

			} else toast?.( 'That isn\'t a wall, floor or soffit of the model: click one, or Esc to cancel' );
			return;

		}

		const at = areaAt( e );
		if ( ! at ) {

			select( null );
			return;

		}

		if ( selected?.s !== at.s || selected.id !== at.id ) select( { s: at.s, id: at.id } );
		const { N } = faceOf( at.s, at.id );
		const normal = N.transformDirection( at.s.content.matrixWorld );
		press = {
			s: at.s, id: at.id, x: e.clientX, y: e.clientY, dragging: false,
			plane: new Plane().setFromNormalAndCoplanarPoint( normal, at.hit.point ),
			start: at.hit.point.clone(),
			m: markupOf( at.s, at.id ),
		};
		canvas.setPointerCapture?.( e.pointerId );

	}, true );

	window.addEventListener( 'pointermove', e => {

		if ( drawing && editing ) {

			if ( drawing.down ) e.stopImmediatePropagation();
			if ( drawing.face ) drawMove( e );
			return;

		}

		if ( ! press ) return;
		e.stopImmediatePropagation();
		if ( ! press.dragging && Math.hypot( e.clientX - press.x, e.clientY - press.y ) < DRAG ) return;
		const point = ray( e ).ray.intersectPlane( press.plane, new Vector3() );
		if ( ! point ) return;
		const { s, id } = press;
		const by = toModelPoint( s, point ).sub( toModelPoint( s, press.start ) );
		change( s, id, moved( s, id, press.m, by ), ! press.dragging );
		press.dragging = true;

	}, true );

	const release = e => {

		if ( drawing?.down ) {

			e.stopImmediatePropagation();
			drawRelease();
			return;

		}

		if ( ! press ) return;
		e.stopImmediatePropagation();
		if ( press.dragging ) cut( press.s );
		press = null;
		render();

	};
	window.addEventListener( 'pointerup', release, true );
	window.addEventListener( 'pointercancel', release, true );
	// The click that ends a press is the editor's too: it doesn't capture the mouse. A double-click
	// finishes an outline drawn corner by corner.
	window.addEventListener( 'click', e => {

		if ( ours( e ) ) e.stopImmediatePropagation();

	}, true );
	window.addEventListener( 'dblclick', e => {

		if ( ! ours( e ) ) return;
		e.stopImmediatePropagation();
		if ( drawing?.corners.length >= 3 ) finishDrawing( drawing.corners );

	}, true );

	window.addEventListener( 'keydown', e => {

		if ( ! editing || isTyping( e ) ) return;
		if ( e.key === 'Escape' ) {

			if ( drawing ) stopDrawing();
			else if ( picking ) {

				picking = false;
				render();

			} else if ( selected ) select( null );

		} else if ( drawing && e.key === 'Enter' && drawing.corners.length >= 3 ) finishDrawing( drawing.corners );
		else if ( drawing && e.key === 'Backspace' && drawing.corners.length ) {

			drawing.corners.pop();
			if ( drawing.corners.length === 0 ) drawing.face = null;
			showDrawing( drawing.corners, false );
			render();

		}

	} );

	// Leaving with changes not saved: the browser asks first.
	window.addEventListener( 'beforeunload', e => {

		if ( changes() ) e.preventDefault();

	} );

	// ---------- Models coming and going ----------

	models.addEventListener( 'add', ( { entry } ) => track( entry ) );
	models.addEventListener( 'remove', ( { entry } ) => {

		const s = states.get( entry );
		if ( ! s ) return;
		states.delete( entry );
		if ( selected?.s === s ) select( null );
		if ( drawing?.s === s ) stopDrawing();
		if ( dirtyCut === s ) dirtyCut = null;
		for ( let i = history.length - 1; i >= 0; i -- ) if ( history[ i ].s === s ) history.splice( i, 1 );
		if ( ! states.size && editing ) setEditing( false );
		render();

	} );
	for ( const entry of models.entries ) track( entry );
	render();

	const first = () => [ ...states.keys() ][ 0 ];
	return {
		get editing() {

			return editing;

		},
		get drawing() {

			return !! drawing;

		},
		setEditing,
		// For tests and the console: a model's areas by id as they are now, taken away ones too.
		areas( entry = first() ) {

			const s = states.get( entry );
			return s?.base ? ids( s ).map( id => ( { id, ...( markupOf( s, id ) ?? { deleted: true } ), changed: !! effective( s, id ), added: ! s.base.has( id ), dirty: isDirty( s, id ) } ) ) : [];

		},
		select( id, entry = first() ) {

			const s = states.get( entry );
			if ( s && markupOf( s, id ) ) select( { s, id } );

		},
		ready: entry => {

			const s = states.get( entry ?? first() );
			return s ? ensureData( s ) : Promise.resolve();

		},
		startDrawing, nudge, turn, undo, save,
	};

}
