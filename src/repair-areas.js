import './repair-areas.css';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineLoop, Matrix3, Matrix4, Mesh, Plane, PropertyBinding, Raycaster, Vector2, Vector3 } from 'three';
import { loadConfig } from './cloud.js';
import { sendForEveryone } from './placements.js';
import { useFastRaycast } from './raycast.js';
import { areaExtras, areaName, areaParts, basisOf, cutOut, outlineNormal, trianglesOf } from './repair-geometry.js';
import { isTyping } from './walk.js';

// Moving the B2D2 model's repair areas in the twin, for areas drawn in the wrong spot or turned
// the wrong way. A model whose glTF scene extras name its area data (`repairs`, a .json next to
// it that scripts/b2d2-repair-model.mjs writes) gets "Edit areas" in the views bar. In it, a click
// picks an area and dragging moves it along its face; the panel nudges it (left, right, up and
// down as you look at it), turns it in its face, or moves it onto another wall, floor or soffit
// you click. The area is rebuilt where it goes with the build's own code (repair-geometry.js),
// chipped recess, rebar and all, and the concrete it's cut out of is cut again.
//
// "Save for everyone" sends the moved areas to the server (worker/area-edits.js) with the admin's
// passcode, as models' positions are; everyone who opens the site then sees them where they were
// put. "Back to the drawing" puts an area back where the markups have it. Without a server, areas
// can be moved but not saved.

const API = new URL( 'api/area-edits/', document.baseURI );
const TIMEOUT = 15000;
// While dragging, the concrete is cut again at most this often (seconds), and once it stops.
const RECUT = 0.12;
// A press moves this far (px) before it's a drag rather than a click.
const DRAG = 4;
const HIGHLIGHT = 0xffd21f;
const STEPS = [ [ '1 cm', 0.01 ], [ '5 cm', 0.05 ], [ '10 cm', 0.1 ], [ '25 cm', 0.25 ], [ '1 m', 1 ] ];
const TURNS = [ [ '1°', 1 ], [ '5°', 5 ], [ '15°', 15 ], [ '90°', 90 ] ];

const _raycaster = new Raycaster();
const _ndc = new Vector2();
const _inverse = new Matrix4();
const _normal = new Matrix3();

export function setUpRepairAreas( { models, controls, onUpdate, toast, bar } ) {

	const camera = controls.camera;
	const canvas = controls.domElement;
	// One per model with areas: see track().
	const states = new Map();
	let editing = false;
	let selected = null; // { s, id }
	let picking = false; // the next click puts the selected area on the surface clicked
	let press = null; // a press on an area: { s, id, x, y, plane, start, pts, dragging }
	let dirtyCut = null; // a state whose concrete needs cutting again
	let sinceCut = 0;
	const history = []; // { s, id, had, value }, for Undo

	// ---------- The button and the panel ----------

	const toggle = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'edit-areas', textContent: 'Edit areas', hidden: true } );
	toggle.title = 'Move repair areas that are in the wrong spot';
	toggle.addEventListener( 'click', () => setEditing( ! editing ) );
	bar?.append( toggle );

	const panel = document.createElement( 'section' );
	panel.id = 'area-editor';
	panel.hidden = true;
	panel.setAttribute( 'aria-label', 'Edit repair areas' );
	panel.innerHTML = `
		<header><h2>Edit repair areas</h2><button type="button" class="done" title="Stop editing">Done</button></header>
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
			<div class="row">
				<button type="button" class="drawing wide" title="Put it back where the drawing has it">Back to the drawing</button>
			</div>
		</div>
		<p class="hint"></p>
		<footer>
			<button type="button" class="undo">Undo</button>
			<button type="button" class="save primary">Save for everyone</button>
		</footer>
	`;
	document.body.append( panel );
	const $ = selector => panel.querySelector( selector );
	$( '.done' ).addEventListener( 'click', () => setEditing( false ) );
	for ( const button of panel.querySelectorAll( '[data-move]' ) ) button.addEventListener( 'click', () => nudge( button.dataset.move ) );
	for ( const button of panel.querySelectorAll( '[data-turn]' ) ) button.addEventListener( 'click', () => turn( Number( button.dataset.turn ) * Number( $( '.turn' ).value ) ) );
	$( '.surface' ).addEventListener( 'click', () => {

		picking = ! picking;
		render();

	} );
	$( '.drawing' ).addEventListener( 'click', () => {

		if ( ! selected ) return;
		change( selected.s, selected.id, 'drawing' );

	} );
	$( '.undo' ).addEventListener( 'click', undo );
	$( '.save' ).addEventListener( 'click', save );

	function render() {

		toggle.hidden = states.size === 0;
		toggle.classList.toggle( 'active', editing );
		panel.hidden = ! editing;
		document.body.classList.toggle( 'editing-areas', editing );
		canvas?.classList.toggle( 'picking-surface', editing && picking );
		if ( ! editing ) return;

		const m = selected && markupOf( selected.s, selected.id );
		$( '.what' ).textContent = m ? `${ areaName( m ) }${ m.grid ? ` · grid ${ m.grid }` : '' }` : 'Click a repair area to move it.';
		$( '.tools' ).hidden = ! m;
		$( '.surface' ).classList.toggle( 'active', picking );
		$( '.surface' ).textContent = picking ? 'Click the surface it goes on (Esc: cancel)' : 'Move to another surface…';
		const where = selected && effective( selected.s, selected.id );
		const dirty = selected && isDirty( selected.s, selected.id );
		$( '.drawing' ).disabled = ! where;
		$( '.hint' ).textContent = m
			? `${ dirty ? 'Moved, not saved yet. ' : where ? 'Moved, and saved for everyone. ' : 'Where the drawing has it. ' }Drag it to slide it along its face.`
			: 'Right-drag to look round, and WASD or the arrow keys to move, as usual.';
		const count = [ ...states.values() ].reduce( ( n, s ) => n + dirtyIds( s ).length, 0 );
		$( '.save' ).textContent = count ? `Save for everyone (${ count })` : 'Save for everyone';
		$( '.save' ).disabled = count === 0;
		$( '.undo' ).disabled = history.length === 0;

	}

	function setEditing( on ) {

		if ( on === editing ) return;
		editing = on;
		picking = false;
		press = null;
		if ( on ) {

			if ( controls.locked ) document.exitPointerLock?.();
			for ( const s of states.values() ) ensureData( s ).catch( () => toast?.( 'Couldn\'t load the repair areas\' data, so they can\'t be moved.' ) );

		} else {

			select( null );
			const count = [ ...states.values() ].reduce( ( n, s ) => n + dirtyIds( s ).length, 0 );
			if ( count ) toast?.( `${ count } moved area${ count === 1 ? ' isn\'t' : 's aren\'t' } saved for everyone yet: only you see ${ count === 1 ? 'it' : 'them' } moved, until the page is reloaded` );

		}

		render();

	}

	// ---------- Models with areas ----------

	// s: { entry, content, model, dataUrl, data, base, order, triangles, all, saved, local, planes,
	// nodes, mats, shared, layerMeshes, highlight }
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
			saved: new Map(),
			// Changes in this browser not saved yet: id -> { pts, n }, or 'drawing' for back to the drawing.
			local: new Map(),
			planes: new Map(),
			nodes: new Map(),
		};
		states.set( entry, s );
		render();
		loadSaved( s );

	}

	// Where the admin moved areas to, for everyone. A slow or failed answer is tried again, so a
	// busy moment as the site opens doesn't leave the areas where the drawing has them.
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
				for ( const { id, pts, n } of edits ) s.saved.set( id, { pts, n } );
				await ensureData( s );
				for ( const id of s.saved.keys() ) if ( s.base.has( id ) && ! s.local.has( id ) ) rebuild( s, id );
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
			s.data = data;
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
			s.shared = { fill: named.get( 'Repair area' ), edge: named.get( 'Repair area outline' ), rebar: named.get( 'Exposed rebar' ), recess: named.get( 'Chipped concrete' ) };
			// Each area's own: its rim is coloured by when it was chipped.
			s.mats = new Map( [ ...s.nodes ].map( ( [ id, node ] ) => {

				const mats = {};
				node.traverse( object => {

					if ( ! object.isMesh ) return;
					const name = object.material.name;
					if ( name === 'Chipped concrete' ) mats.recess = object.material;
					else if ( name === 'Exposed rebar' ) mats.rebar = object.material;
					else if ( name.startsWith( 'Chipped' ) ) mats.rim = object.material;

				} );
				return [ id, mats ];

			} ) );
			for ( const m of data.markups ) s.planes.set( m.id, areaParts( markupOf( s, m.id ), s.all ).plane );

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

	// ---------- Where an area is ----------

	// Where it is now in this browser: its edit, or null where the drawing has it.
	function effective( s, id ) {

		if ( s.local.has( id ) ) {

			const value = s.local.get( id );
			return value === 'drawing' ? null : value;

		}

		return s.saved.get( id ) ?? null;

	}

	function markupOf( s, id ) {

		const base = s.base?.get( id );
		if ( ! base ) return null;
		const where = effective( s, id );
		return where ? { ...base, pts: where.pts, n: where.n } : base;

	}

	const same = ( a, b ) => JSON.stringify( a ?? null ) === JSON.stringify( b ?? null );
	const isDirty = ( s, id ) => s.local.has( id ) && ! same( effective( s, id ), s.saved.get( id ) );
	const dirtyIds = s => [ ...s.local.keys() ].filter( id => isDirty( s, id ) );

	// value: { pts, n }, or 'drawing'. `record`: for Undo (a drag records once, when it starts).
	function change( s, id, value, record = true ) {

		if ( record ) history.push( { s, id, had: s.local.has( id ), value: s.local.get( id ) } );
		s.local.set( id, value );
		rebuild( s, id );
		dirtyCut = s;
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
		if ( states.get( s.entry ) === s ) select( { s, id } );
		render();

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

	function rebuild( s, id ) {

		const m = markupOf( s, id );
		const old = s.nodes.get( id );
		if ( ! m || ! s.group ) return;
		const { plane, parts } = areaParts( m, s.all );
		s.planes.set( id, plane );

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
		const mats = s.mats.get( id ) ?? {};
		const node = new Group();
		node.name = areaName( m );
		node.userData = { ...areaExtras( m ), moved: !! effective( s, id ) };
		if ( plane ) {

			node.add( new Mesh( geometry( parts.recess ), mats.recess ?? s.shared.recess ) );
			if ( mats.rim ) node.add( new Mesh( geometry( parts.rim, parts.rim.normal ), mats.rim ) );
			if ( parts.rebar.idx.length ) node.add( new Mesh( geometry( parts.rebar ), mats.rebar ?? s.shared.rebar ) );

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
		const planes = s.order.map( id => s.planes.get( id ) ).filter( Boolean );
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

	// A bright outline round the selected area, seen through whatever's in front of it.
	function highlight( s, id ) {

		s.highlight?.removeFromParent();
		s.highlight?.geometry.dispose();
		const m = markupOf( s, id );
		const plane = s.planes.get( id );
		const points = plane
			? plane.poly.map( ( [ u, v ] ) => new Vector3().addScaledVector( plane.U, u ).addScaledVector( plane.V, v ).addScaledVector( plane.N, plane.h + 0.006 ) )
			: m.pts.map( p => new Vector3( ...p ).addScaledVector( new Vector3( ...m.n ).normalize(), 0.04 ) );
		const line = new LineLoop(
			new BufferGeometry().setFromPoints( points.map( p => p.sub( s.origin ) ) ),
			new LineBasicMaterial( { color: HIGHLIGHT, depthTest: false, transparent: true } ),
		);
		line.renderOrder = 999;
		line.raycast = () => {};
		line.userData.noCollide = true;
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
	const moved = ( m, by ) => ( { pts: m.pts.map( p => new Vector3( ...p ).add( by ).toArray().map( round ) ), n: m.n } );
	const round = v => Math.round( v * 1e4 ) / 1e4;

	// The model's frame from the scene's: a direction.
	const toModel = ( s, direction ) => direction.clone().transformDirection( _inverse.copy( s.content.matrixWorld ).invert() );
	const toModelPoint = ( s, point ) => s.content.worldToLocal( point.clone() ).add( s.origin );

	// Left, right, up or down as you see it: along whichever way across its face goes most nearly
	// that way on the screen (a wall seen side-on goes away from you to the left, say).
	function nudge( way ) {

		if ( ! selected ) return;
		const { s, id } = selected;
		const m = markupOf( s, id );
		const { U, V } = faceOf( s, id );
		const c = centroid( m.pts );
		const onScreen = p => s.content.localToWorld( p.clone().sub( s.origin ) ).project( camera );
		const from = onScreen( c );
		const want = { left: [ - 1, 0 ], right: [ 1, 0 ], up: [ 0, 1 ], down: [ 0, - 1 ] }[ way ];
		let best = null;
		for ( const d of [ U, U.clone().negate(), V, V.clone().negate() ] ) {

			const to = onScreen( c.clone().addScaledVector( d, 0.1 ) );
			const dx = ( to.x - from.x ) * camera.aspect, dy = to.y - from.y;
			const score = ( dx * want[ 0 ] + dy * want[ 1 ] ) / ( Math.hypot( dx, dy ) || 1 );
			if ( ! best || score > best.score ) best = { d, score };

		}

		change( s, id, moved( m, best.d.clone().multiplyScalar( Number( $( '.step' ).value ) ) ) );

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
		change( s, id, { pts: m.pts.map( p => new Vector3( ...p ).sub( c ).applyAxisAngle( N, angle ).add( c ).toArray().map( round ) ), n: m.n } );

	}

	// Onto the surface hit, its middle where it was clicked, the same way up on it as it can be.
	function onto( s, id, hit ) {

		const m = markupOf( s, id );
		const from = faceOf( s, id );
		const normal = hit.face.normal.clone().applyMatrix3( _normal.getNormalMatrix( hit.object.matrixWorld ) ).normalize();
		// Facing whoever clicked it: the side it was seen from.
		if ( normal.dot( camera.position.clone().sub( hit.point ) ) < 0 ) normal.negate();
		const N = toModel( s, normal ).normalize();
		const { U, V } = basisOf( N );
		const at = toModelPoint( s, hit.point );
		const c = centroid( m.pts );
		const pts = m.pts.map( p => {

			const d = new Vector3( ...p ).sub( c );
			return at.clone().addScaledVector( U, d.dot( from.U ) ).addScaledVector( V, d.dot( from.V ) ).toArray().map( round );

		} );
		change( s, id, { pts, n: N.toArray().map( v => Math.round( v * 1e6 ) / 1e6 ) } );

	}

	// ---------- Saving ----------

	async function save() {

		const jobs = [ ...states.values() ].flatMap( s => dirtyIds( s ).map( id => ( { s, id } ) ) );
		if ( ! jobs.length ) return;
		$( '.save' ).disabled = true;
		let done = 0;
		for ( const { s, id } of jobs ) {

			const where = effective( s, id );
			const url = new URL( `${ s.model }/${ encodeURIComponent( id ) }`, API );
			const result = where ? await sendForEveryone( 'PUT', url, where ) : await sendForEveryone( 'DELETE', url );
			if ( ! result.ok ) {

				toast?.( done ? `Saved ${ done } of ${ jobs.length }. ${ result.message }` : result.message );
				render();
				return;

			}

			if ( where ) s.saved.set( id, where );
			else s.saved.delete( id );
			s.local.delete( id );
			done ++;

		}

		toast?.( `Saved for everyone: ${ done } area${ done === 1 ? '' : 's' } where you put ${ done === 1 ? 'it' : 'them' }` );
		render();

	}

	// ---------- Clicks while editing ----------

	const ray = e => {

		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( e.clientX - rect.left ) / rect.width * 2 - 1, - ( e.clientY - rect.top ) / rect.height * 2 + 1 );
		_raycaster.setFromCamera( _ndc, camera );
		return _raycaster;

	};

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

	window.addEventListener( 'pointerdown', e => {

		if ( ! ours( e ) ) return;
		// Not the model picked up, the mouse captured or the view's glide stopped: the editor's.
		e.stopImmediatePropagation();
		if ( picking && selected ) {

			const { s } = selected;
			const hits = ray( e ).intersectObjects( Object.values( s.layerMeshes ), false );
			if ( hits.length ) {

				onto( s, selected.id, hits[ 0 ] );
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

		if ( ! press ) return;
		e.stopImmediatePropagation();
		if ( ! press.dragging && Math.hypot( e.clientX - press.x, e.clientY - press.y ) < DRAG ) return;
		const point = ray( e ).ray.intersectPlane( press.plane, new Vector3() );
		if ( ! point ) return;
		const { s, id } = press;
		const by = toModelPoint( s, point ).sub( toModelPoint( s, press.start ) );
		change( s, id, moved( press.m, by ), ! press.dragging );
		press.dragging = true;

	}, true );

	const release = e => {

		if ( ! press ) return;
		e.stopImmediatePropagation();
		if ( press.dragging ) cut( press.s );
		press = null;
		render();

	};
	window.addEventListener( 'pointerup', release, true );
	window.addEventListener( 'pointercancel', release, true );
	// The click that ends a press is the editor's too: it doesn't capture the mouse.
	for ( const type of [ 'click', 'dblclick' ] ) window.addEventListener( type, e => {

		if ( ours( e ) ) e.stopImmediatePropagation();

	}, true );

	window.addEventListener( 'keydown', e => {

		if ( ! editing || isTyping( e ) || e.key !== 'Escape' ) return;
		if ( picking ) {

			picking = false;
			render();

		} else if ( selected ) select( null );

	} );

	// Leaving with areas moved but not saved: the browser asks first.
	window.addEventListener( 'beforeunload', e => {

		if ( [ ...states.values() ].some( s => dirtyIds( s ).length ) ) e.preventDefault();

	} );

	// ---------- Models coming and going ----------

	models.addEventListener( 'add', ( { entry } ) => track( entry ) );
	models.addEventListener( 'remove', ( { entry } ) => {

		const s = states.get( entry );
		if ( ! s ) return;
		states.delete( entry );
		if ( selected?.s === s ) select( null );
		if ( dirtyCut === s ) dirtyCut = null;
		for ( let i = history.length - 1; i >= 0; i -- ) if ( history[ i ].s === s ) history.splice( i, 1 );
		if ( ! states.size && editing ) setEditing( false );
		render();

	} );
	for ( const entry of models.entries ) track( entry );
	render();

	return {
		get editing() {

			return editing;

		},
		setEditing,
		// For tests and the console: the areas of a model by id, where they are now.
		areas( entry = [ ...states.keys() ][ 0 ] ) {

			const s = states.get( entry );
			return s?.base ? s.order.map( id => ( { id, ...markupOf( s, id ), moved: !! effective( s, id ), dirty: isDirty( s, id ) } ) ) : [];

		},
		select( id, entry = [ ...states.keys() ][ 0 ] ) {

			const s = states.get( entry );
			if ( s?.base?.has( id ) ) select( { s, id } );

		},
		ready: entry => {

			const s = states.get( entry ?? [ ...states.keys() ][ 0 ] );
			return s ? ensureData( s ) : Promise.resolve();

		},
		nudge, turn, undo, save,
	};

}
