import './excavation-section.css';
import { Box3, DoubleSide, Group, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, Raycaster, Shape, ShapeGeometry, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { compareMethods, comparisonText, pitFrame, pitToEnu, planExcavation, sideLabel } from './excavation-design.js';
import {
	comparisonRows,
	conflictsText,
	cutPoint,
	cutSides,
	designCutText,
	findConflicts,
	footprintText,
	quantityRows,
	sectionDrawing,
	sectionRange,
	sideMethodText,
	volumeText,
	zoneRects,
} from './excavation-section-drawing.js';
import { PAINT } from './shoring-models.js';
import { planShoring } from './shoring.js';
import { rectsOverlap } from './terrain.js';
import { addHitFilter, isTyping, passesHitFilters } from './walk.js';
import { LAYDOWN, biasDepth, groundUnder } from './laydown.js';
import { ZONE_ID } from './flatten.js';
import { headingToYaw } from './geo.js';

// The section view and quantities for excavations: a cut through a pit with its dimensions, what
// it takes (cut, footprint, walls, piles, members), how the other methods would compare, and
// what's placed where its footprint reaches. The design itself comes from excavation-design.js and
// the drawing from excavation-section-drawing.js; this draws them and keeps them up to date.
//
// earthworks.js wires this in: the excavation kind's P panel lists SECTION_READOUTS and
// SECTION_ACTIONS after its own and the shoring's, every Google tile material is passed to
// clipTileMaterial() as it loads (beside hideUnderEarthworks), and setUpSection() is called once
// the shoring is set up. docs/excavation-section.md explains it for users.
//
// Section across or along opens a card with the section drawn to scale (an SVG, from the design,
// so it's exact and doesn't wait for tiles), the quantities, the comparison and the checks. With
// its 3D cut-away on (the default) the scene is cut too: the terrain, the tiles, the shoring and
// placed models are clipped away on the camera's side of the cut, in a box no bigger than the pit
// and a metre round it, the cut face is filled in (the ground being a surface, not a solid), the
// dimensions are drawn over it, and the camera looks at it side on. Esc or the card's close button
// puts everything back as it was.

// Clipping planes shared by every material that's cut away: the cut, the near end of the box, its
// two ends along the cut and its top. Nothing has them until the first cut-away (each clipped
// fragment costs a little), and then they stay: always five, so turning the cut-away on and off
// never compiles a shader again; off, they're moved where they clip nothing.
const OFF = 1e9;
const planes = Array.from( { length: 5 }, () => new Plane( new Vector3( 0, 1, 0 ), OFF ) );
let armed = false;
// The box cut away reaches this far past the top of the cut (and past the camera), and this high
// above the rim.
const APRON = 1;
const BOX_TOP = 200;
// The ground along the box's other faces is read this often, metres.
const FACE_STEP = 3;
// The camera: this far down onto the cut, framing the top of the cut and this much more.
const PITCH = 10;
const FRAME_MORE = 6;
// The card's drawing: padding and the most it may be tall, px, and a line of its text.
const PAD = 14;
const MAX_HEIGHT = 440;
const TEXT = 15;
// What's placed nearby is checked again this often while things move, seconds; the ground
// along an open cut is read afresh this often, as sharper tiles may have come in.
const CHECK_INTERVAL = 0.25;
const GROUND_INTERVAL = 2;
// No-dig zones: draped on the ground like laydown areas, sampled this finely.
const ZONE_SPACING = 1.5;
const ZONE_SAMPLES = 1500;
const ZONE_LIFT = 0.05;
const ZONE_LINE_LIFT = 0.1;
const ZONE_COLOUR = '#ff5a36';
const ZONE_RECHECK = 0.5;

const DEG = Math.PI / 180;
const UP = new Vector3( 0, 1, 0 );
const DOWN = new Vector3( 0, - 1, 0 );

// The cut face as filled in: soil, and the walls and members the cut goes through.
const CAP_COLOURS = { soil: 0x6b5640, steel: 0x8d969e, concrete: 0xa9a49a, timber: 0xa87f4a, panel: 0xe6b52a, member: 0xc9d1d8, kicker: 0xa9a49a };
let capMaterials = null;

let section = null; // what setUpSection made, for the readouts and actions

function clip( material ) {

	if ( ! material || material.clippingPlanes === planes ) return;
	material.clippingPlanes = planes;
	material.clipIntersection = true;

}

// A Google tile material, cut away with a pit in its section view. It's given the planes as it
// loads: until the first cut-away turns the renderer's local clipping on they're ignored (no shader
// change, no cost), and a tile loaded earlier can't be missed then. The tiles renderer takes a tile
// out of the scene while it's inactive and puts it back without loading it again, so one that's out
// when the first cut-away opens (as the camera moves to frame the cut) wouldn't be found by
// looking through the scene.
export function clipTileMaterial( material ) {

	clip( material );

}

// The other methods for the same floor, worked out once for each set of params (the readouts
// are read every frame while a pit digs).
const compared = new Map();
function comparison( params ) {

	const design = planExcavation( params );
	const key = JSON.stringify( design.params );
	let list = compared.get( key );
	if ( ! list ) {

		if ( compared.size > 200 ) compared.clear();
		list = compareMethods( design.params );
		compared.set( key, list );

	}

	return list;

}

// Added to the excavation's readouts (kinds.js) after its own and the shoring's.
export const SECTION_READOUTS = [
	{ label: 'design cut (flat ground)', get: entry => designCutText( planExcavation( entry.params ) ) },
	{ label: 'footprint', get: entry => footprintText( planExcavation( entry.params ) ) },
	{ label: 'compared', note: true, get: entry => comparisonText( comparison( entry.params ) ) },
	{ label: 'nearby', note: true, get: entry => section?.nearbyText( entry ) ?? '' },
];

// Esc closes an open section, and only that: not also deselecting the pit, which the library's
// own Esc (sidebar.js) would do. Listened for from when this module loads, before the library
// listens, so it comes first; the help (main.js) still closes first when it's open.
if ( typeof window !== 'undefined' ) window.addEventListener( 'keydown', e => {

	if ( ! section?.view || e.code !== 'Escape' || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
	if ( document.getElementById( 'help' )?.hidden === false ) return;
	e.stopImmediatePropagation();
	section.close();

}, true );

export const SECTION_ACTIONS = [
	{ label: 'Section across', run: entry => section?.open( entry, false ) },
	{ label: 'Section along', run: entry => section?.open( entry, true ) },
];

// context: { scene, camera, renderer, canvas, controls, models, terrain, layers, panel, onUpdate,
// toast, kind, designs, rimOf }.
export function setUpSection( { scene, camera, renderer, canvas, controls, models, terrain, layers, panel, onUpdate, kind, rimOf } ) {

	// The first cut-away gives the planes to what it cuts: the shoring's paint, the terrain, the
	// ground (Google's tiles, or the stand-in), and from then on every tile as it loads. Placed
	// models get them when they're first in a cut-away box.
	const arm = () => {

		if ( armed ) return;
		armed = true;
		renderer.localClippingEnabled = true;
		for ( const material of Object.values( PAINT ) ) clip( material );
		clip( terrain.material );
		for ( const root of terrain.getGround() ) root.traverse( o => o.isMesh && ( o.userData.googleTile || terrain.standIn ) && [ o.material ].flat().forEach( clip ) );

	};

	const card = createCard();
	const overlay = document.createElement( 'div' );
	overlay.className = 'section-overlay';
	overlay.hidden = true;
	overlay.innerHTML = `<svg xmlns="${ SVG }"></svg>`;
	document.body.append( overlay );
	const cap = new Group();
	cap.name = 'section cap';
	scene.add( cap );

	let view = null; // { entry, along, at, cutaway, pose, framed, design, drawing, rim, ... }
	let checkTimer = 0;
	let checkDue = false;
	let version = 0;
	const nearbyCache = new Map(); // pit -> { key, list, text }
	const shownNearby = new Map(); // pit -> the text its panel shows

	// --- what's placed nearby ----------------------------------------------------------------

	const pits = () => models.entries.filter( entry => entry.kind === kind && ! entry.placing );

	// A placed item's footprint on the map: its box, turned with it (rectFrame's shape).
	function itemRect( entry ) {

		const { min, max } = entry.footprint;
		if ( ! Number.isFinite( min.x ) || ! Number.isFinite( max.x ) ) return null;
		const k = entry.state.scale;
		const frame = pitFrame( entry.state );
		const { east, north } = pitToEnu( frame, ( min.x + max.x ) / 2 * k, - ( min.z + max.z ) / 2 * k );
		return { east, north, sin: frame.sin, cos: frame.cos, hw: ( max.x - min.x ) / 2 * k, hl: ( max.z - min.z ) / 2 * k };

	}

	// Library items placed on the map (as laydown areas count them), not laydown or flatten areas.
	function itemsAround( pit ) {

		const items = [];
		for ( const entry of models.entries ) {

			if ( entry === pit || ! entry.library || entry.placing || entry.kind === LAYDOWN || entry.kind === ZONE_ID ) continue;
			const rect = itemRect( entry );
			if ( rect ) items.push( { name: entry.state.name, kind: entry.kind, rect } );

		}

		return items;

	}

	function nearby( pit ) {

		const { state } = pit;
		const key = `${ version }|${ JSON.stringify( pit.params ) }|${ state.east },${ state.north },${ state.heading }`;
		let item = nearbyCache.get( pit );
		if ( item?.key !== key ) {

			const design = planExcavation( pit.params );
			const list = findConflicts( design, state, itemsAround( pit ), rectsOverlap );
			item = { key, list, text: conflictsText( list, design ) };
			nearbyCache.set( pit, item );

		}

		return item;

	}

	// --- no-dig zones on the ground ----------------------------------------------------------

	const zoneRoot = new Group();
	zoneRoot.name = 'no-dig zones';
	scene.add( zoneRoot );
	const zones = new Map(); // pit -> { key, group, areas }
	let zonesOn = true;
	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	const zoneFill = new MeshBasicMaterial( { color: ZONE_COLOUR, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 4 } );
	zoneFill.onBeforeCompile = biasDepth;
	const zoneLine = new LineMaterial( { color: ZONE_COLOUR, linewidth: 2, transparent: true, depthWrite: false } );
	zoneLine.onBeforeCompile = biasDepth;

	function updateZones( pit ) {

		const design = planExcavation( pit.params );
		const { east, north, heading } = pit.state;
		const key = JSON.stringify( [ design.params, east, north, heading ] );
		if ( zones.get( pit )?.key === key ) return;
		removeZones( pit );
		const rects = zoneRects( design, pit.state ).filter( z => z.zone === 'anchors' );
		if ( ! rects.length ) return;
		const group = new Group();
		group.name = `no-dig zones: ${ pit.state.name }`;
		const areas = rects.map( ( { rect } ) => zoneArea( rect, heading ) );
		group.add( ...areas.map( a => a.mesh ), ...areas.map( a => a.outline ) );
		zoneRoot.add( group );
		zones.set( pit, { key, group, areas, checkedAt: - Infinity } );
		layers.update?.();

	}

	function removeZones( pit ) {

		const item = zones.get( pit );
		if ( ! item ) return;
		zoneRoot.remove( item.group );
		item.group.traverse( o => o.geometry?.dispose() );
		zones.delete( pit );
		layers.update?.();

	}

	// A rectangle (rectFrame's shape) as a grid to lay on the ground, with an outline round it.
	function zoneArea( rect, heading ) {

		const [ width, length ] = [ 2 * rect.hw, 2 * rect.hl ];
		const spacing = Math.max( ZONE_SPACING, Math.sqrt( width * length / ZONE_SAMPLES ) );
		const nx = Math.max( 1, Math.ceil( width / spacing - 0.01 ) );
		const nz = Math.max( 1, Math.ceil( length / spacing - 0.01 ) );
		const geometry = new PlaneGeometry( width, length, nx, nz ).rotateX( - Math.PI / 2 );
		const mesh = new Mesh( geometry, zoneFill );
		mesh.position.set( - rect.east, 0, rect.north );
		mesh.rotation.y = headingToYaw( heading );
		mesh.raycast = () => {};
		mesh.userData.noCollide = true;
		const ring = [];
		for ( let i = 0; i < nx; i ++ ) ring.push( i );
		for ( let j = 0; j < nz; j ++ ) ring.push( j * ( nx + 1 ) + nx );
		for ( let i = nx; i > 0; i -- ) ring.push( nz * ( nx + 1 ) + i );
		for ( let j = nz; j > 0; j -- ) ring.push( j * ( nx + 1 ) );
		ring.push( 0 );
		const outline = new Line2( new LineGeometry().setPositions( new Float32Array( ring.length * 3 ) ), zoneLine );
		outline.position.copy( mesh.position );
		outline.rotation.copy( mesh.rotation );
		outline.renderOrder = 1;
		outline.raycast = () => {};
		outline.userData.noCollide = true;
		return { mesh, outline, ring, heights: new Float32Array( ( nx + 1 ) * ( nz + 1 ) ), ground: null };

	}

	// Lay each zone's grid on the ground under it, if the ground there changed (or forced).
	const _point = new Vector3();
	const _bounds = new Box3();
	function drape( area, force ) {

		const { mesh, outline, ring, heights } = area;
		mesh.updateMatrixWorld();
		const position = mesh.geometry.attributes.position;
		mesh.geometry.computeBoundingBox();
		_bounds.copy( mesh.geometry.boundingBox ).applyMatrix4( mesh.matrixWorld );
		const { meshes, top, key } = groundUnder( terrain.getGround(), _bounds );
		if ( ! force && key === area.ground ) return;
		area.ground = key;
		for ( let i = 0; i < heights.length; i ++ ) {

			mesh.localToWorld( _point.fromBufferAttribute( position, i ).setY( 0 ) );
			_point.y = top + 1;
			raycaster.set( _point, DOWN );
			const hit = meshes.length ? raycaster.intersectObjects( meshes, false ).find( passesHitFilters ) : null;
			// Never below the ground as it was: the zone is ground that isn't dug, and along its edge
			// the pit's wall is eased across the grid.
			const ground = terrain.groundAt( _point.x, _point.z );
			if ( hit ) heights[ i ] = ground === null ? hit.point.y : Math.max( hit.point.y, ground );

		}

		for ( let i = 0; i < heights.length; i ++ ) position.setY( i, heights[ i ] + ZONE_LIFT );
		position.needsUpdate = true;
		mesh.geometry.computeBoundingBox();
		mesh.geometry.computeBoundingSphere();
		const segments = outline.geometry.attributes.instanceStart.data;
		for ( let k = 0; k < ring.length - 1; k ++ ) {

			for ( const [ offset, index ] of [ [ 0, ring[ k ] ], [ 3, ring[ k + 1 ] ] ] ) {

				segments.array[ k * 6 + offset ] = position.getX( index );
				segments.array[ k * 6 + offset + 1 ] = heights[ index ] + ZONE_LINE_LIFT;
				segments.array[ k * 6 + offset + 2 ] = position.getZ( index );

			}

		}

		segments.needsUpdate = true;
		outline.geometry.computeBoundingBox();
		outline.geometry.computeBoundingSphere();

	}

	layers.addLayer( 'no-dig', {
		name: 'Tieback no-dig zones',
		count: () => [ ...zones.values() ].reduce( ( sum, z ) => sum + z.areas.length, 0 ),
		setShown: on => {

			zonesOn = on;

		},
	} );

	// --- keeping up with the pits and what's round them ------------------------------------

	models.addEventListener( 'add', ( { entry } ) => {

		version ++;
		checkDue = true;
		if ( entry.kind === kind && ! entry.placing ) updateZones( entry );

	} );
	models.addEventListener( 'change', ( { entry } ) => {

		version ++;
		checkDue = true;
		if ( entry.kind !== kind ) return;
		if ( ! entry.placing ) updateZones( entry );
		if ( view?.entry === entry ) view.dirty = true;

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		version ++;
		checkDue = true;
		removeZones( entry );
		nearbyCache.delete( entry );
		shownNearby.delete( entry );
		if ( view?.entry === entry ) close();

	} );
	terrain.addEventListener( 'change', ( { designs: changed } ) => {

		if ( view && changed.includes( view.entry ) ) view.groundDue = true;

	} );

	// --- the section card --------------------------------------------------------------------

	function createCard() {

		const element = document.createElement( 'section' );
		element.className = 'section-card';
		element.hidden = true;
		element.setAttribute( 'aria-label', 'Excavation section' );
		element.innerHTML = `
			<header>
				<div class="title"></div>
				<div class="cuts" role="group" aria-label="Cut">
					<button type="button" data-cut="across" title="Cut across the width: sides 4 and 2 in profile">Across</button>
					<button type="button" data-cut="along" title="Cut along the length: sides 3 and 1 in profile">Along</button>
				</div>
				<label class="cutaway" title="Cut the scene away on the camera's side and look at it side on"><input type="checkbox" checked> 3D</label>
				<button type="button" class="close" title="Close the section (Esc)" aria-label="Close the section">✕</button>
			</header>
			<p class="where"></p>
			<div class="drawing"></div>
			<label class="at"><span>Cut at</span><input type="range" step="0.1"><output></output></label>
			<details class="quantities" open><summary>Quantities</summary><table></table></details>
			<details class="compare" open><summary>Compared, for the same floor</summary><table></table></details>
			<details class="checks"><summary>Checks</summary><ul></ul></details>
			<p class="planning">A planning aid with WorkSafeBC flags, not engineering design: walls, support levels and anchors are a professional engineer's to design.</p>`;
		document.body.append( element );
		element.querySelector( '.close' ).addEventListener( 'click', () => close() );
		for ( const button of element.querySelectorAll( '[data-cut]' ) ) button.addEventListener( 'click', () => view && open( view.entry, button.dataset.cut === 'along' ) );
		element.querySelector( '.cutaway input' ).addEventListener( 'change', e => setCutaway( e.target.checked ) );
		const slider = element.querySelector( '.at input' );
		slider.addEventListener( 'input', () => {

			if ( ! view ) return;
			view.at = Number( slider.value );
			render();

		} );
		// Hand the keys back to the scene once the slider's let go.
		slider.addEventListener( 'change', () => slider.blur() );
		return element;

	}

	// Open the section through a pit: across its width (along false) or along its length. Opening
	// another cut of the same pit keeps the view it was opened from, to go back to.
	function open( entry, along ) {

		if ( view && view.entry !== entry ) close();
		if ( ! view ) {

			view = { entry, along, at: 0, cutaway: card.querySelector( '.cutaway input' ).checked, pose: null, framed: false, groundKey: null, ground: new Map(), groundTime: 0 };

		} else if ( view.along !== along ) {

			view.along = along;
			view.at = 0;

		}

		card.hidden = false;
		render();
		if ( view.cutaway ) frameCamera();

	}

	// Put everything back as it was before the section opened.
	function close() {

		if ( ! view ) return;
		const { pose, framed } = view;
		view = null;
		card.hidden = true;
		update3d();
		if ( framed ) restorePose( pose );

	}

	function setCutaway( on ) {

		if ( ! view ) return;
		view.cutaway = on;
		update3d();
		if ( on ) frameCamera();
		else if ( view.framed ) {

			restorePose( view.pose );
			view.framed = false;

		}

	}

	// The ground along the cut, metres up from the rim: as it was before anything was dug, from
	// the terrain where it has chunks and Google's mesh (or the stand-in) elsewhere. Remembered
	// while the cut stays put, and read afresh when the terrain changes or every few seconds.
	function groundReader( entry, along, at, rim ) {

		const { east, north, heading } = entry.state;
		const key = JSON.stringify( [ east, north, heading, along, at, rim ] );
		if ( view.groundKey !== key || view.groundDue ) {

			view.groundKey = key;
			view.groundDue = false;
			view.ground.clear();
			view.groundTime = 0;

		}

		const frame = pitFrame( entry.state );
		return s => {

			const k = s.toFixed( 3 );
			if ( view.ground.has( k ) ) return view.ground.get( k );
			const [ u, v ] = cutPoint( along, at, s );
			const p = pitToEnu( frame, u, v );
			const y = terrain.groundAt( - p.east, p.north ) ?? models.originalHeight?.( - p.east, p.north );
			const value = Number.isFinite( y ) ? y - rim : null;
			view.ground.set( k, value );
			return value;

		};

	}

	// Draw the section in the card, its tables, and the cut-away to match.
	function render() {

		if ( ! view ) return;
		view.dirty = false;
		const { entry } = view;
		const design = planExcavation( entry.params );
		const { geom } = design;
		const { range, left, right, far } = cutSides( geom, view.along );
		view.at = Math.min( range[ 1 ], Math.max( range[ 0 ], view.at ) );
		const rim = rimOf( entry ) ?? entry.state.up;
		const groundAt = groundReader( entry, view.along, view.at, rim );
		const host = card.querySelector( '.drawing' );
		const width = Math.max( 240, host.clientWidth || 560 );
		const { from, to } = sectionRange( design, view.along );
		const options = { along: view.along, at: view.at, groundAt, heading: entry.state.heading };
		// Fitted to the card's width, or its height if that's less: dimensions stack a line of text apart.
		let k = ( width - 2 * PAD ) / ( to - from );
		let drawing = sectionDrawing( design, { ...options, unit: TEXT / k } );
		const tall = ( MAX_HEIGHT - 2 * PAD ) / ( drawing.top - drawing.bottom );
		if ( tall < k ) {

			k = tall;
			drawing = sectionDrawing( design, { ...options, unit: TEXT / k } );
			k = Math.min( k, ( MAX_HEIGHT - 2 * PAD ) / ( drawing.top - drawing.bottom ) );

		}

		Object.assign( view, { design, drawing, rim } );
		const height = Math.ceil( ( drawing.top - drawing.bottom ) * k + 2 * PAD );
		const x0 = ( width - ( to - from ) * k ) / 2;
		const map = ( s, y ) => [ x0 + ( s - from ) * k, PAD + ( drawing.top - y ) * k ];
		host.innerHTML = cardSvg( drawing, map, { width, height, k } ) + legend( drawing );

		const name = entry.state.name;
		card.querySelector( '.title' ).textContent = `Section ${ view.along ? 'along' : 'across' } · ${ name }`;
		const heading = entry.state.heading;
		const axis = view.along ? 'u' : 'v';
		card.querySelector( '.where' ).textContent = `Looking toward ${ sideLabel( heading, far.n ) }: ${ sideLabel( heading, left.n ) } (${ sideMethodText( left ) }) on the left, ${ sideLabel( heading, right.n ) } (${ sideMethodText( right ) }) on the right. Cut ${ axis } = ${ view.at.toFixed( 1 ) } m from the middle.`;
		for ( const button of card.querySelectorAll( '[data-cut]' ) ) button.setAttribute( 'aria-pressed', String( ( button.dataset.cut === 'along' ) === view.along ) );
		const slider = card.querySelector( '.at input' );
		slider.min = range[ 0 ].toFixed( 2 );
		slider.max = range[ 1 ].toFixed( 2 );
		if ( document.activeElement !== slider ) slider.value = String( view.at );
		card.querySelector( '.at output' ).textContent = `${ view.at.toFixed( 1 ) } m`;
		renderTables();
		update3d();

	}

	function renderTables() {

		if ( ! view ) return;
		const { entry } = view;
		const design = planExcavation( entry.params );
		card.querySelector( '.quantities table' ).innerHTML = quantityRows( design, planShoring( entry.params ).piles ).map( ( [ what, value ] ) => `<tr><th>${ escape( what ) }</th><td>${ escape( value ) }</td></tr>` ).join( '' );
		const rows = comparisonRows( comparison( entry.params ) );
		card.querySelector( '.compare' ).hidden = rows.length < 2;
		card.querySelector( '.compare table' ).innerHTML = '<tr><th></th><th>cut</th><th>vs plan</th><th>top</th></tr>' + rows.map( r => `<tr class="${ r.current ? 'current' : '' }" data-method="${ escape( r.label ) }"><th>${ escape( r.label ) }</th><td data-volume="${ r.volume }">${ volumeText( r.volume ) } m³</td><td>${ r.change === null ? '' : Math.abs( r.change ) < 0.5 ? 'the same' : `${ r.change < 0 ? '−' : '+' }${ volumeText( Math.abs( r.change ) ) } m³` }</td><td>${ escape( r.top ) }</td></tr>` ).join( '' );
		const checks = [
			...nearby( entry ).list.length ? [ { level: 'warn', text: nearby( entry ).text, source: 'what\'s placed on the map' } ] : [],
			...design.flags,
		];
		const list = card.querySelector( '.checks ul' );
		list.innerHTML = checks.length ? checks.map( f => `<li class="${ f.level }">${ escape( f.text ) } <span class="source">${ escape( f.source ) }</span></li>` ).join( '' ) : '<li class="note">Nothing to flag.</li>';
		card.querySelector( '.checks summary' ).textContent = `Checks (${ checks.length })`;

	}

	// --- the 3D cut-away -------------------------------------------------------------------------

	// The cut in the scene: its middle at the rim, the way along it (s), and the way to the
	// camera's side of it, which is cut away.
	function cutFrame() {

		const { entry, along, at, rim } = view;
		const frame = pitFrame( entry.state );
		const uHat = new Vector3( - frame.cos, 0, - frame.sin );
		const vHat = new Vector3( - frame.sin, 0, frame.cos );
		const along3 = along ? vHat : uHat;
		const toCamera = along ? uHat.clone() : vHat.clone().negate();
		const centre = new Vector3( - entry.state.east, rim, entry.state.north ).addScaledVector( along ? uHat : vHat, at );
		return { along3, toCamera, centre, world: ( s, y ) => centre.clone().addScaledVector( along3, s ).addScaledVector( UP, y ) };

	}

	function update3d() {

		disposeCap();
		const on = !! view?.cutaway && !! view.drawing;
		overlay.hidden = ! on;
		// The pit's toolbar, handles, label and side numbers would sit on the cut face, some for a
		// side that's cut away: out of the way while the scene is cut (excavation-section.css).
		document.body.classList.toggle( 'section-cutaway', on );
		if ( ! on ) {

			for ( const plane of planes ) plane.set( UP, OFF );
			return;

		}

		arm();
		const { design, along, at, drawing } = view;
		const { near } = cutSides( design.geom, along );
		const { along3, toCamera, centre, world } = cutFrame();
		// Along the cut: as far as the drawing goes, and past where the camera stands, so it looks
		// straight down an open cut rather than at the side of one.
		const s0 = Math.min( drawing.from, ( view.cameraS ?? 0 ) - 3 );
		const s1 = Math.max( drawing.to, ( view.cameraS ?? 0 ) + 3 );
		// To the near top edge, or as far as the camera when it's been framed, so the ground in
		// front doesn't hide the cut below it.
		const depth = Math.max( near.top + ( along ? - at : at ) + APRON, view.reach ?? 0 );
		const set = ( i, normal, point ) => planes[ i ].setFromNormalAndCoplanarPoint( normal, point );
		set( 0, toCamera.clone().negate(), centre );
		set( 1, toCamera, centre.clone().addScaledVector( toCamera, depth ) );
		set( 2, along3.clone().negate(), centre.clone().addScaledVector( along3, s0 ) );
		set( 3, along3, centre.clone().addScaledVector( along3, s1 ) );
		set( 4, UP, centre.clone().addScaledVector( UP, BOX_TOP ) );
		clipModels( world, s0, s1, depth, toCamera );
		buildCap( drawing, world, s0, s1, toCamera );
		buildBox( drawing, world, s0, s1, depth, toCamera );
		view.overlayKey = null;

	}

	// Placed models in the box get the planes too (once: their shaders compile again then).
	function clipModels( world, s0, s1, depth, toCamera ) {

		const box = new Box3();
		const bottom = view.drawing.bottom;
		for ( const [ s, y ] of [ [ s0, bottom ], [ s1, bottom ], [ s0, BOX_TOP ], [ s1, BOX_TOP ] ] ) {

			box.expandByPoint( world( s, y ) );
			box.expandByPoint( world( s, y ).addScaledVector( toCamera, depth ) );

		}

		const _box = new Box3();
		models.group.traverse( object => {

			if ( ! object.isMesh ) return;
			if ( ! _box.setFromObject( object ).intersectsBox( box ) ) return;
			[ object.material ].flat().forEach( clip );

		} );
		scene.getObjectByName( 'shoring' )?.traverse( o => o.isMesh && [ o.material ].flat().forEach( clip ) );

	}

	// The cut face filled in: the soil from the surface down past the toes, and the walls and
	// members the cut goes through, within the box that's cut away.
	function buildCap( drawing, world, s0, s1, toCamera ) {

		capMaterials ??= Object.fromEntries( Object.entries( CAP_COLOURS ).map( ( [ name, color ] ) => {

			const material = new MeshBasicMaterial( { color, side: DoubleSide } );
			// Drawn as if a little nearer, over the edges of what's clipped at the cut.
			material.onBeforeCompile = biasDepth;
			material.userData.shared = true;
			return [ name, material ];

		} ) );
		// Past the ends of the drawing the ground is taken as level with its ends.
		const line = drawing.lines.find( l => l.kind === 'surface' ).points;
		const surface = [ [ Math.min( s0, line[ 0 ][ 0 ] ), line[ 0 ][ 1 ] ], ...line, [ Math.max( s1, line[ line.length - 1 ][ 0 ] ), line[ line.length - 1 ][ 1 ] ] ];
		const soil = [ ...clipLine( surface, s0, s1 ), [ s1, drawing.bottom ], [ s0, drawing.bottom ] ];
		const shapes = [ { kind: 'soil', points: soil, lift: 0 } ];
		for ( const fill of drawing.fills ) {

			if ( fill.beyond || ! capMaterials[ fill.kind ] || fill.kind === 'soil' ) continue;
			if ( fill.points.some( ( [ s ] ) => s < s0 - 1e-6 || s > s1 + 1e-6 ) ) continue;
			shapes.push( { kind: fill.kind, points: fill.points, lift: fill.kind === 'member' || fill.kind === 'kicker' ? 0.02 : 0.01 } );

		}

		for ( const { kind: what, points, lift } of shapes ) addFace( what, points, ( a, b ) => world( a, b ).addScaledVector( toCamera, lift ) );

	}

	// A flat polygon given in its own ( a, b ) coordinates, placed by place( a, b ) -> a point in
	// the scene, filled in a cap colour.
	function addFace( what, points, place ) {

		const geometry = new ShapeGeometry( new Shape( points.map( ( [ a, b ] ) => ( { x: a, y: b } ) ) ) );
		const position = geometry.attributes.position;
		for ( let i = 0; i < position.count; i ++ ) {

			const p = place( position.getX( i ), position.getY( i ) );
			position.setXYZ( i, p.x, p.y, p.z );

		}

		geometry.computeBoundingSphere();
		const mesh = new Mesh( geometry, capMaterials[ what ] );
		mesh.name = `section cap: ${ what }`;
		mesh.renderOrder = what === 'soil' ? 0 : 1;
		mesh.raycast = () => {};
		mesh.userData.noCollide = true;
		cap.add( mesh );

	}

	// The box's other faces below the ground, soil all through: its two ends along the cut, the
	// end nearest the camera and its bottom, so the cut-away reads as a block taken out of the
	// ground rather than a hole in a surface.
	function buildBox( drawing, world, s0, s1, depth, toCamera ) {

		const { bottom } = drawing;
		const rim = view.rim;
		const groundAt = p => {

			const y = terrain.surfaceAt( p.x, p.z ) ?? models.originalHeight?.( p.x, p.z );
			return Number.isFinite( y ) ? y - rim : 0;

		};

		const line = ( length, point ) => {

			const n = Math.max( 1, Math.ceil( length / FACE_STEP ) );
			return Array.from( { length: n + 1 }, ( _, i ) => {

				const a = length * i / n;
				return [ a, groundAt( point( a ) ) ];

			} );

		};

		for ( const s of [ s0, s1 ] ) {

			const place = ( a, b ) => world( s, b ).addScaledVector( toCamera, a );
			addFace( 'soil', [ ...line( depth, a => place( a, 0 ) ), [ depth, bottom ], [ 0, bottom ] ], place );

		}

		const near = ( a, b ) => world( s0 + a, b ).addScaledVector( toCamera, depth );
		addFace( 'soil', [ ...line( s1 - s0, a => near( a, 0 ) ), [ s1 - s0, bottom ], [ 0, bottom ] ], near );
		addFace( 'soil', [ [ s0, 0 ], [ s1, 0 ], [ s1, depth ], [ s0, depth ] ], ( a, b ) => world( a, bottom ).addScaledVector( toCamera, b ) );

	}

	function disposeCap() {

		for ( const mesh of [ ...cap.children ] ) {

			cap.remove( mesh );
			mesh.geometry.dispose();

		}

	}

	// Look at the cut side on from the side that's cut away, a little from above, with the cut in
	// the part of the view the card and the P panel leave clear.
	function frameCamera() {

		if ( ! view?.drawing || ! controls.enabled ) return;
		const { design, along } = view;
		const { left, right } = cutSides( design.geom, along );
		const { toCamera, along3, world } = cutFrame();
		const D = design.geom.depth;
		const width = left.top + right.top + FRAME_MORE;
		const height = D + ( design.plan.walls.length ? design.plan.toe : 0 ) + 2;
		const target = world( ( right.top - left.top ) / 2, - D / 2 );

		const area = canvas.getBoundingClientRect();
		let [ x0, x1, y0, y1 ] = [ area.left, area.right, area.top, area.bottom ];
		const c = card.getBoundingClientRect();
		if ( c.width < area.width * 0.6 ) x0 = Math.max( x0, c.right );
		else y1 = Math.min( y1, c.top );
		const gui = document.querySelector( '.lil-gui.lil-root' );
		if ( gui && gui.style.display !== 'none' ) {

			const g = gui.getBoundingClientRect();
			if ( g.width > 0 && g.left > x0 + 200 ) x1 = Math.min( x1, g.left );

		}

		const fx = Math.max( 0.2, ( x1 - x0 ) / area.width );
		const fy = Math.max( 0.2, ( y1 - y0 ) / area.height );
		const nx = ( ( x0 + x1 ) / 2 - area.left ) / area.width * 2 - 1;
		const ny = 1 - ( ( y0 + y1 ) / 2 - area.top ) / area.height * 2;
		const vfov = camera.fov * DEG;
		const hfov = 2 * Math.atan( Math.tan( vfov / 2 ) * camera.aspect );
		const distance = Math.max( width / 2 / ( Math.tan( hfov / 2 ) * fx ), height / 2 / ( Math.tan( vfov / 2 ) * fy ) );
		// Square to the cut, moved sideways and up or down (not turned, which would make the cut
		// recede) so it sits in the middle of the clear part of the view.
		const position = target.clone()
			.addScaledVector( toCamera, distance * Math.cos( PITCH * DEG ) )
			.addScaledVector( UP, distance * Math.sin( PITCH * DEG ) )
			.addScaledVector( along3, - nx * distance * Math.tan( hfov / 2 ) )
			.addScaledVector( UP, - ny * distance * Math.tan( vfov / 2 ) );
		// The compass heading looking back at the cut (scene x is west).
		const look = toCamera.clone().negate();
		const heading = Math.atan2( - look.x, look.z ) / DEG;
		const pitch = - PITCH;
		// Where the view was before it was first moved, to go back to.
		if ( ! view.framed ) view.pose = savePose();
		if ( controls.mode === 'walk' ) controls.setMode( 'fly' );
		controls.setPose( position, ( heading + 360 ) % 360, pitch );
		view.framed = true;
		// The box reaches past the camera, so nothing between it and the cut is in the way.
		view.reach = distance * Math.cos( PITCH * DEG ) + 10;
		view.cameraS = ( right.top - left.top ) / 2 - nx * distance * Math.tan( hfov / 2 );
		update3d();

	}

	function savePose() {

		return { position: camera.position.clone(), yaw: controls.yaw, pitch: controls.pitch, mode: controls.mode };

	}

	function restorePose( pose ) {

		if ( ! controls.enabled ) return;
		if ( controls.mode !== pose.mode ) controls.setMode( pose.mode );
		camera.position.copy( pose.position );
		controls.yaw = pose.yaw;
		controls.pitch = pose.pitch;
		controls.settle();
		controls.applyRotation();

	}

	// The dimensions and labels over the cut face in the scene, wherever the camera is: each point
	// is projected as the camera moves.
	const _projected = new Vector3();
	function drawOverlay() {

		if ( ! view?.cutaway || ! view.drawing ) return;
		camera.updateMatrixWorld();
		const key = camera.matrixWorld.elements.map( v => v.toFixed( 4 ) ).join() + camera.projectionMatrix.elements[ 0 ];
		if ( key === view.overlayKey ) return;
		view.overlayKey = key;
		const area = canvas.getBoundingClientRect();
		const { world } = cutFrame();
		const project = ( s, y ) => {

			_projected.copy( world( s, y ) ).project( camera );
			if ( _projected.z > 1 || _projected.z < - 1 ) return null;
			return [ area.left + ( _projected.x + 1 ) / 2 * area.width, area.top + ( 1 - _projected.y ) / 2 * area.height ];

		};

		const svg = overlay.firstElementChild;
		svg.setAttribute( 'viewBox', `0 0 ${ window.innerWidth } ${ window.innerHeight }` );
		svg.innerHTML = overlaySvg( view.drawing, project );

	}

	// Rays through what's cut away miss it: clicks and walking go through to what's left.
	addHitFilter( hit => ! ( view?.cutaway && planes.every( plane => plane.distanceToPoint( hit.point ) < 0 ) ) );

	let zoneClock = 0;
	onUpdate( dt => {

		// What's placed nearby, checked again after things move.
		checkTimer -= dt;
		if ( checkDue && checkTimer <= 0 ) {

			checkDue = false;
			checkTimer = CHECK_INTERVAL;
			for ( const pit of pits() ) {

				const { text } = nearby( pit );
				if ( shownNearby.get( pit ) === text ) continue;
				shownNearby.set( pit, text );
				panel.refresh( pit );

			}

			if ( view ) renderTables();

		}

		// No-dig zones: shown in build mode, draped again where the ground under them changed.
		zoneRoot.visible = zonesOn && models.buildMode;
		zoneClock += dt;
		for ( const [ pit, item ] of zones ) {

			item.group.visible = ! models.isHidden( pit );
			if ( zoneRoot.visible && zoneClock - item.checkedAt >= ZONE_RECHECK ) {

				item.checkedAt = zoneClock;
				for ( const area of item.areas ) drape( area, false );

			}

		}

		if ( view ) {

			view.groundTime += dt;
			if ( view.groundTime > GROUND_INTERVAL ) view.groundDue = true;
			if ( view.dirty || view.groundDue ) render();
			drawOverlay();

		}

	} );

	section = {
		open,
		close,
		nearbyText: entry => nearby( entry ).text,
		get view() {

			return view;

		},
		planes,
		cap,
		card,
		overlay,
		zones,
		frameCamera,
		nearby,
	};
	if ( window.twin ) window.twin.section = section;
	return section;

}

// The part of a polyline (sorted by s, with steps) from s0 to s1, its ends cut where they cross.
function clipLine( points, s0, s1 ) {

	const out = [];
	for ( let i = 0; i < points.length; i ++ ) {

		const [ s, y ] = points[ i ];
		const prev = points[ i - 1 ];
		for ( const edge of [ s0, s1 ] ) {

			if ( prev && ( prev[ 0 ] - edge ) * ( s - edge ) < 0 ) out.push( [ edge, prev[ 1 ] + ( y - prev[ 1 ] ) * ( edge - prev[ 0 ] ) / ( s - prev[ 0 ] ) ] );

		}

		if ( s >= s0 && s <= s1 ) out.push( [ s, y ] );

	}

	return out;

}

// --- drawing it as SVG -------------------------------------------------------------------------------

const SVG = 'http://www.w3.org/2000/svg';
const pathOf = ( points, close = false ) => points.map( ( [ x, y ], i ) => `${ i ? 'L' : 'M' }${ x.toFixed( 1 ) } ${ y.toFixed( 1 ) }` ).join( '' ) + ( close ? 'Z' : '' );

// The section in the card: fills, lines, dimensions and labels, mapped to the card by map( s, y ),
// with a scale bar. Every dimension and label carries its id and value, for the tests.
function cardSvg( drawing, map, { width, height, k } ) {

	const parts = [ `<svg xmlns="${ SVG }" class="section-svg" width="${ width }" height="${ height }" viewBox="0 0 ${ width } ${ height }" role="img" aria-label="Section drawing">` ];
	parts.push( '<defs><pattern id="xs-soil" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect width="8" height="8" class="xs-soil-ground"/><line x1="0" y1="0" x2="0" y2="8" class="xs-soil-hatch"/></pattern><pattern id="xs-todo" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" class="xs-todo-hatch"/></pattern></defs>' );
	for ( const fill of drawing.fills ) parts.push( `<path class="xs-fill xs-${ fill.kind }${ fill.beyond ? ' xs-beyond' : '' }"${ fill.member ? ` data-member="${ fill.member }"` : '' }${ fill.cut ? ' data-cut' : '' } d="${ pathOf( fill.points.map( p => map( ...p ) ), true ) }"/>` );
	for ( const line of drawing.lines ) parts.push( `<path class="xs-line xs-${ line.kind }${ line.dashed ? ' xs-dashed' : '' }" d="${ pathOf( line.points.map( p => map( ...p ) ) ) }"/>` );
	for ( const dim of drawing.dims ) parts.push( dimSvg( dim, map ) );
	for ( const label of drawing.labels ) parts.push( labelSvg( label, map ) );
	parts.push( scaleBar( k, height ) );
	parts.push( '</svg>' );
	return parts.join( '' );

}

// Over the scene: the surface, the groundwater, the dimensions and labels, each point projected;
// what's behind the camera is left out.
function overlaySvg( drawing, project ) {

	const parts = [];
	for ( const line of drawing.lines ) {

		if ( line.kind !== 'surface' && line.kind !== 'groundwater' ) continue;
		const points = line.points.map( p => project( ...p ) );
		if ( points.some( p => ! p ) ) continue;
		parts.push( `<path class="xs-line xs-${ line.kind }${ line.dashed ? ' xs-dashed' : '' }" d="${ pathOf( points ) }"/>` );

	}

	for ( const dim of drawing.dims ) parts.push( dimSvg( dim, project ) );
	for ( const label of drawing.labels ) parts.push( labelSvg( label, project ) );
	return parts.join( '' );

}

// A dimension: extension lines from what's measured, the line with ticks at its ends, and its
// text along it, kept upright.
function dimSvg( dim, map ) {

	const [ p1, p2, a, b ] = dim.kind === 'h'
		? [ [ dim.from, dim.base[ 0 ] ], [ dim.to, dim.base[ 1 ] ], [ dim.from, dim.at ], [ dim.to, dim.at ] ]
		: [ [ dim.base, dim.from ], [ dim.base, dim.to ], [ dim.at, dim.from ], [ dim.at, dim.to ] ];
	const [ P1, P2, A, B ] = [ p1, p2, a, b ].map( p => map( ...p ) );
	if ( ! P1 || ! P2 || ! A || ! B ) return '';
	const [ dx, dy ] = [ B[ 0 ] - A[ 0 ], B[ 1 ] - A[ 1 ] ];
	const length = Math.hypot( dx, dy );
	if ( length < 2 ) return '';
	const [ ux, uy ] = [ dx / length, dy / length ];
	// Extension lines run from near the measured point to just past the dimension line.
	const extension = ( P, Q ) => {

		const [ ex, ey ] = [ Q[ 0 ] - P[ 0 ], Q[ 1 ] - P[ 1 ] ];
		const e = Math.hypot( ex, ey );
		if ( e < 4 ) return '';
		const [ nx, ny ] = [ ex / e, ey / e ];
		return `M${ ( P[ 0 ] + nx * 2 ).toFixed( 1 ) } ${ ( P[ 1 ] + ny * 2 ).toFixed( 1 ) }L${ ( Q[ 0 ] + nx * 3 ).toFixed( 1 ) } ${ ( Q[ 1 ] + ny * 3 ).toFixed( 1 ) }`;

	};

	// Ticks: short slashes at 45 degrees across the line.
	const tick = ( [ x, y ] ) => {

		const [ tx, ty ] = [ ( ux - uy ) * 3.5, ( uy + ux ) * 3.5 ];
		return `M${ ( x - tx ).toFixed( 1 ) } ${ ( y - ty ).toFixed( 1 ) }L${ ( x + tx ).toFixed( 1 ) } ${ ( y + ty ).toFixed( 1 ) }`;

	};

	let angle = Math.atan2( dy, dx ) / DEG;
	if ( angle > 90 ) angle -= 180;
	if ( angle <= - 90 ) angle += 180;
	const r = angle * DEG;
	// Above the middle of the line as read (overhanging its ends if it's short).
	const [ tx, ty ] = [ ( A[ 0 ] + B[ 0 ] ) / 2 + Math.sin( r ) * 4, ( A[ 1 ] + B[ 1 ] ) / 2 - Math.cos( r ) * 4 ];
	return `<g class="xs-dim" data-id="${ dim.id }" data-value="${ dim.value }"><path class="xs-dim-line" d="${ extension( P1, A ) }${ extension( P2, B ) }M${ A[ 0 ].toFixed( 1 ) } ${ A[ 1 ].toFixed( 1 ) }L${ B[ 0 ].toFixed( 1 ) } ${ B[ 1 ].toFixed( 1 ) }${ tick( A ) }${ tick( B ) }"/><text class="xs-dim-text" x="${ tx.toFixed( 1 ) }" y="${ ty.toFixed( 1 ) }" text-anchor="middle" transform="rotate(${ angle.toFixed( 1 ) } ${ tx.toFixed( 1 ) } ${ ty.toFixed( 1 ) })">${ escape( dim.text ) }</text></g>`;

}

// What the lines and fills in a drawing mean, for those it has.
const LEGEND = [
	[ 'ground', 'line', 'the ground before digging' ],
	[ 'surface', 'line', 'the cut' ],
	[ 'final', 'line', 'still to dig' ],
	[ 'groundwater', 'line', 'groundwater (assumed)' ],
	[ 'wedge', 'line', 'active wedge, 45° + φ/2' ],
	[ 'bond', 'fill', 'tieback bond (free length thin)' ],
	[ 'beyond', 'fill', 'seen beyond the cut' ],
];
function legend( drawing ) {

	const has = {
		bond: drawing.fills.some( f => f.member === 'bond' ),
		beyond: drawing.fills.some( f => f.beyond ),
	};
	for ( const line of drawing.lines ) has[ line.kind ] = true;
	const items = LEGEND.filter( ( [ id ] ) => has[ id ] ).map( ( [ id, type, text ] ) => {

		const swatch = type === 'line'
			? `<path class="xs-line xs-${ id }${ id === 'ground' || id === 'final' || id === 'groundwater' ? ' xs-dashed' : '' }" d="M1 6H23"/>`
			: id === 'bond' ? '<path class="xs-fill xs-member" data-member="bond" d="M1 4H23V8H1Z"/>' : '<path class="xs-fill xs-steel xs-beyond" d="M2 2H22V10H2Z"/>';
		return `<span data-legend="${ id }"><svg width="24" height="12" class="section-svg" aria-hidden="true">${ swatch }</svg>${ text }</span>`;

	} );
	return `<div class="legend">${ items.join( '' ) }</div>`;

}

function labelSvg( label, map ) {

	const p = map( label.s, label.y );
	if ( ! p ) return '';
	const value = label.value === undefined ? '' : ` data-value="${ label.value }"`;
	return `<text class="xs-label xs-${ label.kind }" data-id="${ label.id }"${ value } x="${ p[ 0 ].toFixed( 1 ) }" y="${ p[ 1 ].toFixed( 1 ) }" text-anchor="${ label.align }" dominant-baseline="middle">${ escape( label.text ) }</text>`;

}

// A bar of a round length, about 60 to 140 px long, bottom left.
function scaleBar( k, height ) {

	const metres = [ 0.5, 1, 2, 5, 10, 20, 50, 100 ].find( m => m * k >= 60 ) ?? 100;
	const w = metres * k;
	const [ x, y ] = [ PAD, height - PAD + 2 ];
	return `<g class="xs-scale" data-metres="${ metres }" data-k="${ k }"><path d="M${ x } ${ y - 4 }V${ y }H${ ( x + w ).toFixed( 1 ) }V${ y - 4 }M${ ( x + w / 2 ).toFixed( 1 ) } ${ y }V${ y - 2.5 }"/><text x="${ ( x + w + 5 ).toFixed( 1 ) }" y="${ y }" dominant-baseline="auto">${ metres } m · 1 : 1</text></g>`;

}

function escape( text ) {

	return String( text ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' } )[ c ] );

}
