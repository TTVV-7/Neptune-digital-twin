import { BoxGeometry, BufferGeometry, EdgesGeometry, Group, Line, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Vector2, Vector3 } from 'three';
import { loadConfig } from './cloud.js';
import { sendForEveryone } from './placements.js';
import { useFastRaycast } from './raycast.js';
import { coplanarFace, triangleAt, triNormal } from './repair-geometry.js';
import { isTyping } from './walk.js';

// Changing the B2D2 model's structure in the twin: adding beams, and painting walls, floors and
// soffits. "Edit model" in the views bar, beside "Edit areas" (repair-areas.js, whose models
// these are: `host` is what it shares of them), opens a panel:
//
// - Add beam: click where one end meets a wall and it runs straight across to the wall facing it
//   (or, with "straight across" off, click each end). A picked beam takes a name, width, depth,
//   length and colour, moves as you see it, goes up to the soffit or down to the floor, or is
//   deleted. It's part of the model: solid to walk into, moved and hidden with it.
// - Paint: pick a colour and click a wall, floor or soffit; the whole face takes it (the face as
//   the model has it: a wall from end to end). "Original" gives a face its own colour back.
//
// "Save for everyone" sends the changes to the server (worker/model-edits.js) with the admin's
// passcode; everyone who opens the site then sees them. Everything is kept in the model's markup
// frame (repair-geometry.js), so it stays put wherever the model is moved.

const API = new URL( 'api/model-edits/', document.baseURI );
const TIMEOUT = 15000;
const HIGHLIGHT = 0xffd21f;
const STEPS = [ [ '1 cm', 0.01 ], [ '5 cm', 0.05 ], [ '10 cm', 0.1 ], [ '25 cm', 0.25 ], [ '1 m', 1 ] ];
const BEAM_COLOURS = [ [ 'Concrete', '#aab1b9' ], [ 'New concrete', '#cfcdc6' ], [ 'Steel', '#5b6570' ], [ 'Primer red', '#a5482f' ], [ 'Safety yellow', '#f2c14e' ] ];
const PAINT_COLOURS = [ [ 'Light grey', '#d5d8dc' ], [ 'Dark grey', '#5a616b' ], [ 'White', '#f1f1ee' ], [ 'Sand', '#d9c9a3' ], [ 'Yellow', '#f2c14e' ], [ 'Red', '#c8553d' ], [ 'Blue', '#4f7cac' ], [ 'Green', '#5b8e7d' ] ];
// A beam's ends this close (m) aren't a beam; its sides at least and at most this.
const SHORTEST = 0.05;
const SIZE = { min: 0.01, max: 20 };

const _raycaster = new Raycaster();
const _ndc = new Vector2();

const round = v => Math.round( v * 1e4 ) / 1e4;
const newId = prefix => `${ prefix }-${ Array.from( crypto.getRandomValues( new Uint8Array( 8 ) ), b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' ) }`;

// Along a beam (x), the way its depth goes (y: up, for a beam that isn't standing on end) and
// across it (z: its width).
function beamBasis( a, b ) {

	const x = b.clone().sub( a ).normalize();
	const up = Math.abs( x.y ) > 0.9 ? new Vector3( 1, 0, 0 ) : new Vector3( 0, 1, 0 );
	const z = new Vector3().crossVectors( x, up ).normalize();
	return { x, y: new Vector3().crossVectors( z, x ), z };

}

export function setUpModelEdits( { host, models, controls, onUpdate, toast, bar } ) {

	const camera = controls.camera;
	const canvas = controls.domElement;
	// Per model (a state of repair-areas.js's): { saved, local, beams, group }. saved: what's on the
	// server, id -> edit; local: changes here not saved yet, id -> edit, or 'removed'.
	const stores = new Map();
	let editing = false;
	let tool = null; // 'beam' or 'paint'
	let selected = null; // a beam: { s, id }
	let pending = null; // a beam's first end, waiting for the other: { s, a, line }
	const history = []; // { s, id, had, value }, for Undo
	const defaults = { width: 0.4, depth: 0.6, colour: BEAM_COLOURS[ 0 ][ 1 ], across: true, paint: PAINT_COLOURS[ 3 ][ 1 ] };

	// ---------- The button and the panel ----------

	const toggle = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'edit-model', textContent: 'Edit model', hidden: true } );
	toggle.title = 'Add beams and paint walls';
	toggle.addEventListener( 'click', () => setEditing( ! editing ) );
	bar?.append( toggle );

	const swatches = ( list, extra = '' ) => `${ list.map( ( [ name, colour ] ) => `<button type="button" class="swatch-button" data-colour="${ colour }" title="${ name }" style="background:${ colour }"></button>` ).join( '' ) }${ extra }`;
	const panel = document.createElement( 'section' );
	panel.id = 'model-editor';
	panel.hidden = true;
	panel.setAttribute( 'aria-label', 'Edit the model' );
	panel.innerHTML = `
		<header><h2>Edit model</h2><button type="button" class="done" title="Stop editing">Done</button></header>
		<div class="row">
			<button type="button" class="add-beam wide" title="Then click where it meets a wall">+ Add beam</button>
			<button type="button" class="paint wide" title="Then click walls, floors or soffits">Paint</button>
		</div>
		<div class="beam-options">
			<label class="check"><input type="checkbox" class="across" checked> Straight across to the facing wall</label>
		</div>
		<div class="paint-options">
			<div class="row swatches paint-swatches">${ swatches( PAINT_COLOURS, '<button type="button" class="original" data-colour="" title="Give a face its own colour back">Original</button>' ) }</div>
			<label class="row"><span class="label">Colour</span><input type="color" class="paint-colour"></label>
		</div>
		<p class="what"></p>
		<div class="tools">
			<div class="details">
				<label><span>Name</span><input data-field="name" maxlength="100" placeholder="Beam"></label>
				<label><span>Width (m)</span><input data-field="width" type="number" min="${ SIZE.min }" max="${ SIZE.max }" step="0.05"></label>
				<label><span>Depth (m)</span><input data-field="depth" type="number" min="${ SIZE.min }" max="${ SIZE.max }" step="0.05"></label>
				<label><span>Length (m)</span><input data-field="length" type="number" min="${ SHORTEST }" step="0.05"></label>
				<label><span>Colour</span><input data-field="colour" type="color"></label>
				<div class="row swatches beam-swatches">${ swatches( BEAM_COLOURS ) }</div>
			</div>
			<div class="row"><span class="label">Move</span>
				<button type="button" data-move="left" title="Move left">←</button>
				<button type="button" data-move="right" title="Move right">→</button>
				<button type="button" data-move="up" title="Move up">↑</button>
				<button type="button" data-move="down" title="Move down">↓</button>
				<select class="step" aria-label="Move by">${ STEPS.map( ( [ name, v ], i ) => `<option value="${ v }"${ i === 1 ? ' selected' : '' }>${ name }</option>` ).join( '' ) }</select>
			</div>
			<div class="row">
				<button type="button" class="to-soffit wide" title="Up until its top meets the soffit above">Up to the soffit</button>
				<button type="button" class="to-floor wide" title="Down until it stands on the floor below">Down to the floor</button>
			</div>
			<div class="row"><button type="button" class="delete wide">Delete beam</button></div>
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
	$( '.add-beam' ).addEventListener( 'click', () => setTool( tool === 'beam' ? null : 'beam' ) );
	$( '.paint' ).addEventListener( 'click', () => setTool( tool === 'paint' ? null : 'paint' ) );
	$( '.across' ).addEventListener( 'change', () => {

		defaults.across = $( '.across' ).checked;
		render();

	} );
	$( '.paint-colour' ).addEventListener( 'input', () => {

		defaults.paint = $( '.paint-colour' ).value;
		render();

	} );
	for ( const button of panel.querySelectorAll( '.paint-swatches [data-colour]' ) ) button.addEventListener( 'click', () => {

		defaults.paint = button.dataset.colour;
		render();

	} );
	for ( const button of panel.querySelectorAll( '.beam-swatches [data-colour]' ) ) button.addEventListener( 'click', () => setBeam( 'colour', button.dataset.colour ) );
	for ( const field of panel.querySelectorAll( '[data-field]' ) ) field.addEventListener( 'change', () => setBeam( field.dataset.field, field.value.trim() ) );
	for ( const button of panel.querySelectorAll( '[data-move]' ) ) button.addEventListener( 'click', () => nudge( button.dataset.move ) );
	$( '.to-soffit' ).addEventListener( 'click', () => settle( 1 ) );
	$( '.to-floor' ).addEventListener( 'click', () => settle( - 1 ) );
	$( '.delete' ).addEventListener( 'click', () => {

		if ( ! selected ) return;
		const { s, id } = selected;
		select( null );
		change( s, id, 'removed' );

	} );
	$( '.undo' ).addEventListener( 'click', undo );
	$( '.save' ).addEventListener( 'click', save );

	function render() {

		toggle.hidden = host.states().length === 0;
		toggle.classList.toggle( 'active', editing );
		panel.hidden = ! editing;
		canvas?.classList.toggle( 'picking-surface', editing && !! tool );
		if ( ! editing ) return;

		const beam = selected && effective( selected.s, selected.id );
		$( '.add-beam' ).classList.toggle( 'active', tool === 'beam' );
		$( '.paint' ).classList.toggle( 'active', tool === 'paint' );
		$( '.beam-options' ).hidden = tool !== 'beam';
		$( '.paint-options' ).hidden = tool !== 'paint';
		$( '.across' ).checked = defaults.across;
		if ( defaults.paint ) $( '.paint-colour' ).value = defaults.paint;
		for ( const button of panel.querySelectorAll( '.paint-swatches [data-colour]' ) ) button.classList.toggle( 'active', button.dataset.colour.toLowerCase() === defaults.paint.toLowerCase() );
		$( '.tools' ).hidden = ! beam || !! tool;
		$( '.what' ).hidden = !! tool;
		$( '.what' ).textContent = beam ? `${ beam.name || 'Beam' } · ${ beam.width } × ${ beam.depth } m, ${ length( beam ).toFixed( 2 ) } m long` : 'Add a beam, paint a wall, or click a beam to change it.';
		if ( beam ) {

			const values = { ...beam, length: +length( beam ).toFixed( 3 ) };
			for ( const field of panel.querySelectorAll( '[data-field]' ) ) if ( document.activeElement !== field ) field.value = values[ field.dataset.field ] ?? '';

		}

		const counts = host.states().reduce( ( n, s ) => {

			for ( const id of ids( s ) ) {

				const edit = effective( s, id );
				if ( edit ) n[ edit.kind ] ++;

			}

			return n;

		}, { beam: 0, paint: 0 } );
		$( '.hint' ).textContent = tool === 'beam'
			? pending ? 'Now click where its other end goes. Esc: cancel.'
				: defaults.across ? 'Click where the beam meets a wall: it runs straight across to the wall facing it. Esc: cancel.' : 'Click where one end of the beam goes, then the other. Esc: cancel.'
			: tool === 'paint'
				? defaults.paint ? 'Click a wall, floor or soffit to paint the whole face. Esc: done.' : 'Click a painted face to give it its own colour back. Esc: done.'
				: beam
					? `${ isDirty( selected.s, selected.id ) ? 'Not saved yet. ' : 'Saved for everyone. ' }Its top can go up to the soffit, or it can stand on the floor.`
					: `${ counts.beam } beam${ counts.beam === 1 ? '' : 's' } added, ${ counts.paint } face${ counts.paint === 1 ? '' : 's' } painted. Right-drag to look round, WASD to move.`;
		const count = changes();
		$( '.save' ).textContent = count ? `Save for everyone (${ count })` : 'Save for everyone';
		$( '.save' ).disabled = count === 0;
		$( '.undo' ).disabled = history.length === 0;

	}

	function setEditing( on ) {

		if ( on === editing ) return;
		editing = on;
		setTool( null, false );
		if ( on ) {

			// One editor at a time has the clicks.
			host.stop();
			if ( controls.locked ) document.exitPointerLock?.();
			for ( const s of host.states() ) host.ensureData( s ).then( () => storeOf( s ) ).catch( () => toast?.( 'Couldn\'t load the model\'s data, so it can\'t be changed.' ) );

		} else {

			select( null );
			const count = changes();
			if ( count ) toast?.( `${ count } change${ count === 1 ? ' to the model isn\'t' : 's to the model aren\'t' } saved for everyone yet: only you see ${ count === 1 ? 'it' : 'them' }, until the page is reloaded` );

		}

		render();

	}

	host.onEditing( () => setEditing( false ) );

	function setTool( next, draw = true ) {

		tool = next;
		pending?.line?.removeFromParent();
		pending?.line?.geometry.dispose();
		pending = null;
		if ( next ) select( null, false );
		if ( draw ) render();

	}

	// ---------- What's changed ----------

	function storeOf( s ) {

		if ( ! stores.has( s ) ) stores.set( s, { saved: new Map(), local: new Map(), beams: new Map(), group: null } );
		return stores.get( s );

	}

	function effective( s, id ) {

		const store = storeOf( s );
		if ( store.local.has( id ) ) {

			const value = store.local.get( id );
			return value === 'removed' ? null : value;

		}

		return store.saved.get( id ) ?? null;

	}

	const ids = s => [ ...new Set( [ ...storeOf( s ).saved.keys(), ...storeOf( s ).local.keys() ] ) ];
	const same = ( a, b ) => JSON.stringify( a ?? null ) === JSON.stringify( b ?? null );
	const isDirty = ( s, id ) => storeOf( s ).local.has( id ) && ! same( effective( s, id ), storeOf( s ).saved.get( id ) );
	const dirtyIds = s => [ ...storeOf( s ).local.keys() ].filter( id => isDirty( s, id ) );
	const changes = () => host.states().reduce( ( n, s ) => n + dirtyIds( s ).length, 0 );
	const length = beam => Math.hypot( beam.a[ 0 ] - beam.b[ 0 ], beam.a[ 1 ] - beam.b[ 1 ], beam.a[ 2 ] - beam.b[ 2 ] );

	// What an id was or is, whichever says: redrawn after any change to it.
	function redraw( s, id, before ) {

		const now = effective( s, id );
		if ( before?.kind === 'paint' || now?.kind === 'paint' ) repaint( s );
		if ( before?.kind === 'beam' || now?.kind === 'beam' ) drawBeam( s, id );

	}

	// value: an edit, or 'removed'.
	function change( s, id, value, record = true ) {

		const before = effective( s, id );
		const store = storeOf( s );
		if ( record ) history.push( { s, id, had: store.local.has( id ), value: store.local.get( id ) } );
		store.local.set( id, value );
		redraw( s, id, before );
		render();

	}

	function undo() {

		const last = history.pop();
		if ( ! last ) return;
		const { s, id, had, value } = last;
		const before = effective( s, id );
		if ( had ) storeOf( s ).local.set( id, value );
		else storeOf( s ).local.delete( id );
		redraw( s, id, before );
		if ( selected?.s === s && selected.id === id && effective( s, id )?.kind !== 'beam' ) select( null );
		else if ( selected ) outline();
		render();

	}

	// ---------- Beams ----------

	const materials = new Map();
	const materialOf = colour => {

		if ( ! materials.has( colour ) ) materials.set( colour, new MeshStandardMaterial( { color: colour, roughness: 0.85, metalness: 0.05 } ) );
		return materials.get( colour );

	};

	function drawBeam( s, id ) {

		const store = storeOf( s );
		const old = store.beams.get( id );
		old?.removeFromParent();
		old?.geometry.dispose();
		store.beams.delete( id );
		const beam = effective( s, id );
		if ( beam?.kind !== 'beam' || ! s.origin ) return;
		if ( ! store.group ) {

			store.group = new Group();
			store.group.name = 'Added members';
			// In the model's own frame, beside its structure.
			( s.group?.parent ?? s.content ).add( store.group );

		}

		const a = new Vector3( ...beam.a ), b = new Vector3( ...beam.b );
		const { x, y, z } = beamBasis( a, b );
		const mesh = new Mesh( new BoxGeometry( a.distanceTo( b ), beam.depth, beam.width ), materialOf( beam.colour ) );
		mesh.position.copy( a ).add( b ).multiplyScalar( 0.5 ).sub( s.origin );
		mesh.quaternion.setFromRotationMatrix( new Matrix4().makeBasis( x, y, z ) );
		mesh.name = beam.name || 'Beam';
		mesh.userData = { beam: id };
		useFastRaycast( mesh );
		store.group.add( mesh );
		mesh.updateMatrixWorld( true );
		store.beams.set( id, mesh );
		if ( selected?.s === s && selected.id === id ) outline();

	}

	// A picked beam's edges, bright, seen through whatever's in front.
	let edges = null;
	function outline() {

		edges?.removeFromParent();
		edges?.geometry.dispose();
		edges = null;
		const mesh = selected && storeOf( selected.s ).beams.get( selected.id );
		if ( ! mesh ) return;
		edges = new LineSegments( new EdgesGeometry( mesh.geometry ), new LineBasicMaterial( { color: HIGHLIGHT, depthTest: false, transparent: true } ) );
		edges.renderOrder = 999;
		edges.raycast = () => {};
		edges.userData.noCollide = true;
		mesh.add( edges );

	}

	function select( pick, draw = true ) {

		selected = pick;
		outline();
		if ( draw ) render();

	}

	function addBeam( s, a, b ) {

		if ( a.distanceTo( b ) < SHORTEST ) {

			toast?.( 'Too short for a beam: its ends are in the same spot' );
			return;

		}

		const id = newId( 'beam' );
		change( s, id, { kind: 'beam', a: a.toArray().map( round ), b: b.toArray().map( round ), width: defaults.width, depth: defaults.depth, colour: defaults.colour } );
		setTool( null, false );
		select( { s, id } );

	}

	// A field of the picked beam.
	function setBeam( field, value ) {

		if ( ! selected ) return;
		const { s, id } = selected;
		const beam = effective( s, id );
		if ( ! beam ) return;
		const next = { ...beam };
		if ( field === 'name' ) {

			if ( value ) next.name = value;
			else delete next.name;

		} else if ( field === 'colour' ) {

			if ( ! /^#[0-9a-f]{6}$/i.test( value ) ) return;
			next.colour = defaults.colour = value.toLowerCase();

		} else {

			const number = Number( value );
			if ( ! Number.isFinite( number ) ) return render();
			if ( field === 'length' ) {

				// About its middle.
				const a = new Vector3( ...beam.a ), b = new Vector3( ...beam.b );
				const middle = a.clone().add( b ).multiplyScalar( 0.5 );
				const half = b.clone().sub( a ).normalize().multiplyScalar( Math.max( SHORTEST, number ) / 2 );
				next.a = middle.clone().sub( half ).toArray().map( round );
				next.b = middle.clone().add( half ).toArray().map( round );

			} else next[ field ] = defaults[ field ] = round( Math.min( SIZE.max, Math.max( SIZE.min, number ) ) );

		}

		if ( same( next, beam ) ) return render();
		change( s, id, next );

	}

	const shiftedBeam = ( beam, by ) => ( { ...beam, a: new Vector3( ...beam.a ).add( by ).toArray().map( round ), b: new Vector3( ...beam.b ).add( by ).toArray().map( round ) } );

	// Left, right, up or down as you see it: along the beam, its depth or its width, whichever
	// goes most nearly that way on the screen.
	function nudge( way ) {

		if ( ! selected ) return;
		const { s, id } = selected;
		const beam = effective( s, id );
		const a = new Vector3( ...beam.a ), b = new Vector3( ...beam.b );
		const { x, y, z } = beamBasis( a, b );
		const middle = a.clone().add( b ).multiplyScalar( 0.5 );
		const onScreen = p => host.toScene( s, p ).project( camera );
		const from = onScreen( middle );
		const want = { left: [ - 1, 0 ], right: [ 1, 0 ], up: [ 0, 1 ], down: [ 0, - 1 ] }[ way ];
		let best = null;
		for ( const d of [ x, y, z ].flatMap( v => [ v, v.clone().negate() ] ) ) {

			const to = onScreen( middle.clone().addScaledVector( d, 0.1 ) );
			const dx = ( to.x - from.x ) * camera.aspect, dy = to.y - from.y;
			const score = ( dx * want[ 0 ] + dy * want[ 1 ] ) / ( Math.hypot( dx, dy ) || 1 );
			if ( ! best || score > best.score ) best = { d, score };

		}

		change( s, id, shiftedBeam( beam, best.d.clone().multiplyScalar( Number( $( '.step' ).value ) ) ) );

	}

	// Up until its top meets the soffit above its middle (way 1), or down onto the floor (-1).
	function settle( way ) {

		if ( ! selected ) return;
		const { s, id } = selected;
		const beam = effective( s, id );
		const a = new Vector3( ...beam.a ), b = new Vector3( ...beam.b );
		const { x, y, z } = beamBasis( a, b );
		// How far the beam reaches above and below its middle.
		const reach = Math.abs( x.y ) * a.distanceTo( b ) / 2 + Math.abs( y.y ) * beam.depth / 2 + Math.abs( z.y ) * beam.width / 2;
		const middle = host.toScene( s, a.clone().add( b ).multiplyScalar( 0.5 ) );
		const hit = host.concreteAlong( s, middle, new Vector3( 0, way, 0 ) );
		if ( ! hit ) {

			toast?.( way > 0 ? 'No soffit above the middle of it' : 'No floor below the middle of it' );
			return;

		}

		const by = hit.distance - reach;
		if ( Math.abs( by ) < 1e-4 ) return;
		change( s, id, shiftedBeam( beam, new Vector3( 0, way * by, 0 ) ) );

	}

	// ---------- Paint ----------

	// Every painted face's triangles, by layer, in their colours: the concrete is cut again with them.
	function repaint( s ) {

		if ( ! s.triangles ) return;
		const painted = new Map();
		for ( const id of ids( s ) ) {

			const edit = effective( s, id );
			const triangles = edit?.kind === 'paint' && s.triangles[ edit.layer ];
			if ( ! triangles ) continue;
			const seed = triangleAt( triangles, edit.at, edit.n );
			if ( seed < 0 ) continue;
			if ( ! painted.has( edit.layer ) ) painted.set( edit.layer, new Map() );
			for ( const triangle of coplanarFace( triangles, seed ) ) painted.get( edit.layer ).set( triangle, edit.colour );

		}

		s.painted = painted;
		host.recut( s );

	}

	// The face under the click takes the colour chosen ('' for its own back).
	function paintAt( s, hit ) {

		const layer = hit.object.userData.layer;
		const triangles = s.triangles[ layer ];
		const face = new Set( coplanarFace( triangles, hit.faceIndex ) );
		// The paint already on this face, if any: changed rather than added to.
		const on = ids( s ).find( id => {

			const edit = effective( s, id );
			return edit?.kind === 'paint' && edit.layer === layer && face.has( triangleAt( triangles, edit.at, edit.n ) );

		} );
		if ( ! defaults.paint ) {

			if ( on ) change( s, on, 'removed' );
			else toast?.( 'That face has its own colour already' );
			return;

		}

		const { a, b, c } = triangles[ hit.faceIndex ];
		const at = a.clone().add( b ).add( c ).divideScalar( 3 ).toArray().map( round );
		const n = triNormal( a, b, c ).toArray().map( v => Math.round( v * 1e6 ) / 1e6 );
		change( s, on ?? newId( 'paint' ), { kind: 'paint', layer, at, n, colour: defaults.paint.toLowerCase() } );

	}

	// ---------- Saving and loading ----------

	async function save() {

		const jobs = host.states().flatMap( s => dirtyIds( s ).map( id => ( { s, id } ) ) );
		if ( ! jobs.length ) return;
		$( '.save' ).disabled = true;
		let done = 0;
		for ( const { s, id } of jobs ) {

			const edit = effective( s, id );
			const url = new URL( `${ s.model }/${ id }`, API );
			const result = edit ? await sendForEveryone( 'PUT', url, edit ) : await sendForEveryone( 'DELETE', url );
			if ( ! result.ok ) {

				toast?.( done ? `Saved ${ done } of ${ jobs.length }. ${ result.message }` : result.message );
				render();
				return;

			}

			const store = storeOf( s );
			if ( edit ) store.saved.set( id, edit );
			else store.saved.delete( id );
			store.local.delete( id );
			done ++;

		}

		toast?.( `Saved for everyone: ${ done } change${ done === 1 ? '' : 's' } to the model` );
		render();

	}

	// What the admin changed, for everyone; tried again when the answer is slow or fails.
	async function load( s ) {

		if ( ! await loadConfig() ) return;
		for ( let attempt = 0; attempt < 4; attempt ++ ) {

			if ( attempt ) await new Promise( resolve => setTimeout( resolve, 2000 * attempt ) );
			if ( ! host.states().includes( s ) ) return;
			try {

				const res = await fetch( new URL( s.model, API ), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout( TIMEOUT ) } );
				if ( ! res.ok || ! /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ) {

					if ( res.status >= 500 ) continue;
					return;

				}

				const { edits } = await res.json();
				if ( ! edits?.length || ! host.states().includes( s ) ) return;
				const store = storeOf( s );
				for ( const { id, updatedAt, ...edit } of edits ) store.saved.set( id, edit );
				await host.ensureData( s );
				for ( const id of store.saved.keys() ) if ( effective( s, id )?.kind === 'beam' ) drawBeam( s, id );
				if ( [ ...store.saved.values() ].some( edit => edit.kind === 'paint' ) ) repaint( s );
				render();
				return;

			} catch {

				// Tried again.

			}

		}

	}

	// ---------- Clicks while editing ----------

	const ray = e => {

		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( e.clientX - rect.left ) / rect.width * 2 - 1, - ( e.clientY - rect.top ) / rect.height * 2 + 1 );
		_raycaster.setFromCamera( _ndc, camera );
		return _raycaster;

	};

	// The concrete under the pointer, of whichever model: { s, hit }.
	function concrete( e ) {

		let best = null;
		for ( const s of host.states() ) {

			if ( ! s.triangles || ! s.entry.pivot.visible ) continue;
			const hit = host.concreteAt( s, e );
			if ( hit && ( ! best || hit.distance < best.hit.distance ) ) best = { s, hit };

		}

		return best;

	}

	// Why a click found no concrete.
	const missed = () => host.states().some( s => ! s.triangles ) ? 'The model\'s data is still loading: try again in a moment' : 'Click a wall, floor or soffit of the model';

	function beamAt( e ) {

		const r = ray( e );
		let best = null;
		for ( const s of host.states() ) {

			const hit = r.intersectObjects( [ ...storeOf( s ).beams.values() ], false )[ 0 ];
			if ( hit && ( ! best || hit.distance < best.hit.distance ) ) best = { s, id: hit.object.userData.beam, hit };

		}

		return best;

	}

	function beamClick( e ) {

		const under = concrete( e );
		if ( ! under ) {

			toast?.( missed() );
			return;

		}

		const { s, hit } = under;
		const { at, N } = host.faceHit( s, hit );
		if ( pending ) {

			if ( pending.s === s ) addBeam( s, pending.a, at );
			return;

		}

		if ( defaults.across ) {

			// From just off the face, the way it faces, to the next concrete.
			const out = N.clone().transformDirection( s.content.matrixWorld );
			const across = host.concreteAlong( s, hit.point.clone().addScaledVector( out, 0.02 ), out );
			if ( across ) {

				addBeam( s, at, host.toModelPoint( s, across.point ) );
				return;

			}

			toast?.( 'Nothing straight across from there: click where its other end goes' );

		}

		pending = { s, a: at, line: null };
		render();

	}

	const ours = e => editing && e.target === canvas && e.button === 0;

	window.addEventListener( 'pointerdown', e => {

		if ( ! ours( e ) ) return;
		// Not the model picked up or the mouse captured: the editor's.
		e.stopImmediatePropagation();
		if ( tool === 'beam' ) return beamClick( e );
		if ( tool === 'paint' ) {

			const under = concrete( e );
			if ( under ) paintAt( under.s, under.hit );
			else toast?.( missed() );
			return;

		}

		const at = beamAt( e );
		select( at ? { s: at.s, id: at.id } : null );

	}, true );

	// A line from a beam's first end to where its other would go.
	window.addEventListener( 'pointermove', e => {

		if ( ! editing || ! pending || e.target !== canvas ) return;
		const under = concrete( e );
		pending.line?.removeFromParent();
		pending.line?.geometry.dispose();
		pending.line = null;
		if ( ! under || under.s !== pending.s ) return;
		const { s } = pending;
		const to = host.toModelPoint( s, under.hit.point );
		pending.line = new Line( new BufferGeometry().setFromPoints( [ pending.a.clone().sub( s.origin ), to.sub( s.origin ) ] ), new LineBasicMaterial( { color: HIGHLIGHT, depthTest: false, transparent: true } ) );
		pending.line.renderOrder = 999;
		pending.line.raycast = () => {};
		( s.group?.parent ?? s.content ).add( pending.line );

	}, true );

	for ( const type of [ 'click', 'dblclick' ] ) window.addEventListener( type, e => {

		if ( ours( e ) ) e.stopImmediatePropagation();

	}, true );

	window.addEventListener( 'keydown', e => {

		if ( ! editing || isTyping( e ) || e.key !== 'Escape' ) return;
		if ( tool ) setTool( null );
		else if ( selected ) select( null );

	} );

	window.addEventListener( 'beforeunload', e => {

		if ( changes() ) e.preventDefault();

	} );

	// ---------- Models coming and going ----------

	function sync() {

		const states = host.states();
		for ( const s of states ) if ( ! stores.has( s ) ) {

			storeOf( s );
			load( s );

		}

		for ( const s of [ ...stores.keys() ] ) if ( ! states.includes( s ) ) {

			stores.delete( s );
			if ( selected?.s === s ) selected = null;
			for ( let i = history.length - 1; i >= 0; i -- ) if ( history[ i ].s === s ) history.splice( i, 1 );

		}

		if ( ! states.length && editing ) setEditing( false );
		render();

	}

	for ( const type of [ 'add', 'remove' ] ) models.addEventListener( type, sync );
	sync();
	// The panel sits under the status lines, which grow and shrink, on a wide screen.
	const status = document.getElementById( 'status' );
	onUpdate?.( () => {

		if ( ! editing || ! status || window.innerWidth <= 700 ) return;
		const top = status.hidden ? 12 : Math.round( status.getBoundingClientRect().bottom + 10 );
		if ( panel.style.top !== `${ top }px` ) panel.style.top = `${ top }px`;

	} );

	return {
		get editing() {

			return editing;

		},
		setEditing, setTool,
		// For tests and the console: a model's beams and painted faces as they are now.
		edits( entry ) {

			const s = host.states().find( s => ! entry || s.entry === entry );
			return s ? ids( s ).map( id => ( { id, ...effective( s, id ), dirty: isDirty( s, id ) } ) ).filter( edit => edit.kind ) : [];

		},
		select( id ) {

			const s = host.states().find( s => storeOf( s ).beams.has( id ) );
			if ( s ) select( { s, id } );

		},
		setBeam, nudge, settle, undo, save,
	};

}
