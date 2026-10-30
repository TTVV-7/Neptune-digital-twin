import './laydown.css';
import { Box3, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { registerKind } from './kinds.js';
import { ZONE_ID } from './flatten.js';
import { passesHitFilters } from './walk.js';

// Laydown areas: rectangles marked out on the map for where materials, trailers and equipment go.
// Each is a placed kind (kinds.js), so it is saved, moved, turned and deleted like any library
// item. It is draped over the ground (Google's mesh or the stand-in, plus anything added to the
// ground later such as dug earth) as a see-through fill with a crisp outline, and a label floats
// over its middle. Unlike flatten areas they show all the time, but they can only be clicked while
// the library is open, so a click on one otherwise still captures the mouse to look around.

export const LAYDOWN = 'laydown';

// What a click without a drag makes: width (across the view) and length (along it), in metres.
const DEFAULT_SIZE = [ 20, 15 ];
const MAX_SIZE = 1000;
// Clear colours that stand out on aerial imagery (concrete, asphalt, gravel, trees, water) and
// from each other, and stay clear of the flatten areas' red. A new area takes the one used least.
const PALETTE = [ '#ffd60a', '#00e0ff', '#ff4fd8', '#8cff3a', '#ff8a1f', '#a477ff', '#3d8bff' ];

// The ground is sampled on a grid this fine, made coarser for big areas so that no area takes
// more than about MAX_SAMPLES raycasts to drape.
const SPACING = 1.5;
const MAX_SAMPLES = 2500;
// Raised a little off the ground; the depth bias below does the rest.
const FILL_LIFT = 0.05;
const LINE_LIFT = 0.1;
const FILL_OPACITY = 0.25;
const LINE_WIDTH = 3; // pixels, at any distance

// Draping again: an area being dragged at most this often. The others check this often whether
// the ground under them changed (sharper tiles streaming in, flattening, digging), which is cheap,
// and drape again only if it did.
const MOVE_INTERVAL = 0.1;
const CHECK_INTERVAL = 0.5;
// How often "items inside" is recounted while things move.
const COUNT_INTERVAL = 0.25;

// Labels float this far above the middle of the area, and hide beyond this distance.
const LABEL_LIFT = 1.5;
const LABEL_RANGE = 1500;

// Fragments are drawn as if a little nearer the camera: ten centimetres plus a small share of the
// distance. That keeps the area on top of Google's mesh where it bulges between the samples
// (more so in the coarser tiles far away), while anything standing on the area only loses a pixel
// or two at its base. polygonOffset alone can't do this: the logarithmic depth buffer writes the
// depth itself, which skips the offset.
const DEPTH_SHARE = 0.003;
const DEPTH_FIXED = 0.1;
const BIASED_DEPTH = /* glsl */`
	#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )

		gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( max( 1.0, vFragDepth * ${ ( 1 - DEPTH_SHARE ).toFixed( 4 ) } - ${ DEPTH_FIXED.toFixed( 2 ) } ) ) * logDepthBufFC * 0.5;

	#endif
`;

export function biasDepth( shader ) {

	shader.fragmentShader = shader.fragmentShader.replace( '#include <logdepthbuf_fragment>', BIASED_DEPTH );

}

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><rect x="7" y="16" width="50" height="40" fill="#ffd60a" fill-opacity=".22" stroke="#ffd60a" stroke-width="2.5"/><rect x="13" y="31" width="18" height="7" fill="#c0563b"/><rect x="13" y="42" width="18" height="7" fill="#3b6fc0"/><rect x="37" y="33" width="14" height="16" fill="#9a958b"/><path d="M37 41h14M44 33v16" stroke="#6f6b63" stroke-width="1.5"/><rect x="12" y="6" width="30" height="13" rx="3" fill="#10161c" stroke="#ffd60a" stroke-width="1.5"/><path d="M17 12.5h20" stroke="#eef2f5" stroke-width="2.5"/></svg>';

const DOWN = new Vector3( 0, - 1, 0 );
const _point = new Vector3();
const _box = new Box3();
const _bounds = new Box3();
const _inverse = new Matrix4();
const _toLocal = new Matrix4();
// Ground meshes' vertices -> their version when the mesh's box was last worked out.
const measured = new WeakMap();

export function setUpLaydown( { camera, canvas, models, sidebar, panel, getGround, onUpdate } ) {

	const areas = new Map(); // entry -> { content, dirty, checkedAt, ground, inside }
	const labels = createLabels( { camera, canvas, isHidden: entry => models.isHidden( entry ) } );
	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	let clock = 0;
	let countDue = false;
	let countTimer = 0;

	const laydowns = () => models.entries.filter( entry => entry.kind === LAYDOWN );

	registerKind( LAYDOWN, {
		label: 'Laydown area',
		build: buildArea,
		normalize: normalizeArea,
		snap: 'median',
		solid: false,
		fields: [
			{ key: 'label', label: 'label', type: 'text' },
			{ key: 'colour', label: 'colour', type: 'color' },
			{ key: 'width', label: 'width (m)', min: 1, step: 0.5, size: true },
			{ key: 'length', label: 'length (m)', min: 1, step: 0.5, size: true },
			{ key: 'note', label: 'note', type: 'text' },
		],
		// Rebuilding drapes it again at once, which is quick enough to follow a handle.
		resize: {
			shape: 'rect',
			live: true,
			label: ( { width, length } ) => `${ width.toFixed( 1 ) } × ${ length.toFixed( 1 ) } m · ${ formatArea( width * length ) } m²`,
		},
		readouts: [
			{ label: 'area', get: ( { params } ) => `${ formatArea( params.width * params.length ) } m²` },
			{ label: 'perimeter', get: ( { params } ) => `${ format( 2 * ( params.width + params.length ) ) } m` },
			{ label: 'items inside', get: entry => String( countInside( entry ) ) },
		],
	} );

	const tool = sidebar.addTool( {
		name: 'Laydown area',
		hint: 'Mark out where things go',
		title: `Drag a rectangle on the ground to mark out where materials, trailers or equipment go; a click makes one ${ DEFAULT_SIZE[ 0 ] } × ${ DEFAULT_SIZE[ 1 ] } m. Press P to name it, colour it and add a note.`,
		icon: ICON,
		mode: 'rect',
		color: nextColour(),
		defaultSize: DEFAULT_SIZE,
		onDone: ( { east, north, heading, width, length } ) => {

			const label = nextLabel();
			return models.load( {
				kind: LAYDOWN,
				name: label,
				params: { label, colour: nextColour(), width, length },
				east,
				north,
				heading,
				up: null,
			} );

		},
	} );

	// "Laydown A", "B", ... "Z", "AA", ...: the first not already taken.
	function nextLabel() {

		const used = new Set( laydowns().map( entry => entry.params.label ) );
		for ( let i = 0; ; i ++ ) {

			const label = `Laydown ${ letters( i ) }`;
			if ( ! used.has( label ) ) return label;

		}

	}

	function nextColour() {

		const uses = PALETTE.map( colour => laydowns().filter( entry => entry.params.colour === colour ).length );
		return PALETTE[ uses.indexOf( Math.min( ...uses ) ) ];

	}

	// Placed library items (not other laydown or flatten areas) whose middle is inside the area.
	function countInside( area ) {

		const { width, length } = area.params;
		area.pivot.updateWorldMatrix( true, false );
		_inverse.copy( area.pivot.matrixWorld ).invert();
		return models.entries.filter( entry => {

			if ( entry === area || ! entry.library || entry.placing || entry.kind === LAYDOWN || entry.kind === ZONE_ID ) return false;
			entry.pivot.getWorldPosition( _point ).applyMatrix4( _inverse );
			return Math.abs( _point.x ) <= width / 2 && Math.abs( _point.z ) <= length / 2;

		} ).length;

	}

	// --- keeping areas draped, labelled and named ----------------------------------------

	models.addEventListener( 'add', ( { entry } ) => {

		countDue = true;
		if ( entry.kind !== LAYDOWN ) return;
		areas.set( entry, { content: null, dirty: false, checkedAt: - Infinity, ground: null, inside: 0 } );
		track( entry );

	} );

	models.addEventListener( 'change', ( { entry } ) => {

		countDue = true;
		const area = areas.get( entry );
		if ( ! area ) return;
		// New params rebuild the area flat, so drape it straight away; a move can wait a moment.
		if ( area.content !== entry.pivot.children[ 0 ] ) track( entry );
		else area.dirty = true;

	} );

	models.addEventListener( 'remove', ( { entry } ) => {

		countDue = true;
		if ( ! areas.delete( entry ) ) return;
		labels.remove( entry );
		tool.color = nextColour();

	} );

	// A new or rebuilt area: drape it, label it and name it after its label.
	function track( entry ) {

		const area = areas.get( entry );
		const content = entry.pivot.children[ 0 ];
		area.content = content;
		const { fill, outline } = content.userData.laydown;
		// The model manager gave every mesh a triangle raycast. The outline has no triangles to
		// hit, and the fill is only clickable in build mode.
		outline.raycast = () => {};
		const raycast = fill.raycast;
		fill.raycast = function ( ray, intersects ) {

			if ( models.buildMode ) raycast.call( this, ray, intersects );

		};

		drape( entry, true );
		const { label, colour, note, width, length } = entry.params;
		labels.set( entry, { label, colour, note, size: `${ format( width ) } × ${ format( length ) } m · ${ formatArea( width * length ) } m²` } );
		area.inside = countInside( entry );
		tool.color = nextColour();
		if ( entry.state.name !== label ) {

			entry.state.name = label;
			panel.refresh( entry );

		}

	}

	// Sample the ground under each grid point of the area and lay the fill and outline on it.
	// Unless forced (the area moved or was rebuilt), only if the ground under it changed.
	function drape( entry, force ) {

		const area = areas.get( entry );
		area.checkedAt = clock;
		const { fill, heights } = area.content.userData.laydown;
		const position = fill.geometry.attributes.position;
		entry.pivot.updateWorldMatrix( true, true );

		// Only the ground meshes under the area are tested, and their key tells whether anything changed.
		_bounds.copy( fill.geometry.boundingBox ).applyMatrix4( fill.matrixWorld );
		const { meshes, top, key: ground } = groundUnder( getGround(), _bounds );
		if ( ! force && ground === area.ground ) return;
		area.ground = ground;
		area.dirty = false;

		_toLocal.copy( fill.matrixWorld ).invert();
		for ( let i = 0; i < heights.length; i ++ ) {

			fill.localToWorld( _point.fromBufferAttribute( position, i ).setY( 0 ) );
			_point.y = top + 1;
			raycaster.set( _point, DOWN );
			const hit = meshes.length > 0 ? raycaster.intersectObjects( meshes, false ).find( passesHitFilters ) : null;
			// No ground (off the edge of the tiles): level with the area's base.
			heights[ i ] = hit ? _point.copy( hit.point ).applyMatrix4( _toLocal ).y : 0;

		}

		layOnHeights( area.content );

	}

	onUpdate( dt => {

		clock += dt;

		// One area a frame: a moved one first, else the one checked longest ago if it's due.
		let next = null;
		let nextArea = null;
		for ( const [ entry, area ] of areas ) {

			const age = clock - area.checkedAt;
			if ( age < ( area.dirty ? MOVE_INTERVAL : CHECK_INTERVAL ) ) continue;
			const better = ! nextArea || ( area.dirty && ! nextArea.dirty ) || ( area.dirty === nextArea.dirty && area.checkedAt < nextArea.checkedAt );
			if ( better ) {

				next = entry;
				nextArea = area;

			}

		}

		if ( next ) drape( next, nextArea.dirty );

		// Recount the items inside each area after things move, and only refresh a panel whose
		// count changed rather than redrawing every panel's fields each time.
		countTimer -= dt;
		if ( countDue && countTimer <= 0 ) {

			countDue = false;
			countTimer = COUNT_INTERVAL;
			for ( const [ entry, area ] of areas ) {

				const inside = countInside( entry );
				if ( inside === area.inside ) continue;
				area.inside = inside;
				panel.refresh( entry );

			}

		}

		for ( const [ entry, area ] of areas ) {

			const { heights, centre } = area.content.userData.laydown;
			entry.pivot.updateWorldMatrix( true, false );
			entry.pivot.localToWorld( labels.anchor( entry ).set( 0, heights[ centre ] + LABEL_LIFT, 0 ) );

		}

		labels.update( sidebar.getSelected() );

	} );

}

// The ground meshes (in `roots`) under a box in the scene, the top of the highest, and a key that
// changes when they do (sharper tiles, flattening, digging): only these are tested, rather than
// every tile in view. Rows of items (rows.js) sit on the ground found this way too.
export function groundUnder( roots, bounds ) {

	const meshes = [];
	let top = - Infinity;
	for ( const root of roots ) {

		root.traverseVisible( object => {

			if ( ! object.isMesh || object.userData.noCollide ) return;
			// The box is worked out again whenever the vertices change. Earth piled up after it was
			// measured (a pile pouring, a spoil heap) would otherwise stand above it, and rays
			// started under the pile's new top would miss it.
			const { geometry } = object;
			const { position } = geometry.attributes;
			if ( ! geometry.boundingBox || measured.get( position ) !== position.version ) {

				geometry.computeBoundingBox();
				measured.set( position, position.version );

			}

			_box.copy( geometry.boundingBox ).applyMatrix4( object.matrixWorld );
			if ( _box.max.x < bounds.min.x || _box.min.x > bounds.max.x || _box.max.z < bounds.min.z || _box.min.z > bounds.max.z ) return;
			meshes.push( object );
			top = Math.max( top, _box.max.y );

		} );

	}

	const key = meshes.map( ( { id, geometry } ) => `${ id }:${ geometry.id }:${ geometry.attributes.position.version }` ).join();
	return { meshes, top, key };

}

// --- the area as drawn -------------------------------------------------------------------

// A flat grid the size of the area, with an outline around its edge; draping (above) then lifts
// each grid point onto the ground. Centred on the origin, width along x and length along z.
function buildArea( { width, length, colour } ) {

	const spacing = Math.max( SPACING, Math.sqrt( width * length / MAX_SAMPLES ) );
	const nx = Math.ceil( width / spacing - 0.01 );
	const nz = Math.ceil( length / spacing - 0.01 );

	const group = new Group();
	group.name = 'Laydown area';

	const fill = new Mesh(
		new PlaneGeometry( width, length, nx, nz ).rotateX( - Math.PI / 2 ),
		new MeshBasicMaterial( {
			color: colour,
			transparent: true,
			opacity: FILL_OPACITY,
			depthWrite: false,
			// For a renderer without the logarithmic depth buffer.
			polygonOffset: true,
			polygonOffsetFactor: - 2,
			polygonOffsetUnits: - 4,
		} ),
	);
	fill.material.onBeforeCompile = biasDepth;

	// Around the edge of the grid, so the outline follows the same ground as the fill.
	const ring = [];
	for ( let i = 0; i < nx; i ++ ) ring.push( i );
	for ( let j = 0; j < nz; j ++ ) ring.push( j * ( nx + 1 ) + nx );
	for ( let i = nx; i > 0; i -- ) ring.push( nz * ( nx + 1 ) + i );
	for ( let j = nz; j > 0; j -- ) ring.push( j * ( nx + 1 ) );
	ring.push( 0 );

	const outline = new Line2(
		new LineGeometry().setPositions( new Float32Array( ring.length * 3 ) ),
		new LineMaterial( { color: colour, linewidth: LINE_WIDTH, transparent: true, depthWrite: false } ),
	);
	outline.material.onBeforeCompile = biasDepth;
	// Over the fill.
	outline.renderOrder = 1;

	for ( const mesh of [ fill, outline ] ) mesh.userData.noCollide = true;
	group.add( fill, outline );
	group.userData.laydown = {
		fill,
		outline,
		ring,
		// Ground height under each grid point, relative to the area's base.
		heights: new Float32Array( ( nx + 1 ) * ( nz + 1 ) ),
		centre: Math.round( nz / 2 ) * ( nx + 1 ) + Math.round( nx / 2 ),
	};
	layOnHeights( group );
	return group;

}

function layOnHeights( content ) {

	const { fill, outline, ring, heights } = content.userData.laydown;
	const position = fill.geometry.attributes.position;
	for ( let i = 0; i < heights.length; i ++ ) position.setY( i, heights[ i ] + FILL_LIFT );
	position.needsUpdate = true;
	fill.geometry.computeBoundingBox();
	fill.geometry.computeBoundingSphere();

	// Line2 keeps the outline as segments, each with both ends: write them in place.
	const segments = outline.geometry.attributes.instanceStart.data;
	const array = segments.array;
	for ( let k = 0; k < ring.length - 1; k ++ ) {

		for ( const [ offset, index ] of [ [ 0, ring[ k ] ], [ 3, ring[ k + 1 ] ] ] ) {

			array[ k * 6 + offset ] = position.getX( index );
			array[ k * 6 + offset + 1 ] = heights[ index ] + LINE_LIFT;
			array[ k * 6 + offset + 2 ] = position.getZ( index );

		}

	}

	segments.needsUpdate = true;
	outline.geometry.computeBoundingBox();
	outline.geometry.computeBoundingSphere();

}

function normalizeArea( p ) {

	const colour = typeof p.colour === 'number' ? `#${ p.colour.toString( 16 ).padStart( 6, '0' ) }` : String( p.colour ?? '' );
	return {
		label: String( p.label ?? '' ).trim().slice( 0, 60 ) || 'Laydown area',
		colour: /^#[0-9a-f]{6}$/i.test( colour ) ? colour.toLowerCase() : PALETTE[ 0 ],
		width: clampSize( p.width, DEFAULT_SIZE[ 0 ] ),
		length: clampSize( p.length, DEFAULT_SIZE[ 1 ] ),
		note: String( p.note ?? '' ).trim().slice( 0, 200 ),
	};

}

function clampSize( v, fallback ) {

	return Math.min( MAX_SIZE, Math.max( 1, Number( v ) || fallback ) );

}

function letters( i ) {

	return i < 26 ? String.fromCharCode( 65 + i ) : letters( Math.floor( i / 26 ) - 1 ) + letters( i % 26 );

}

function format( v, digits = 1 ) {

	return v.toLocaleString( 'en-CA', { maximumFractionDigits: digits } );

}

function formatArea( v ) {

	return format( v, v < 100 ? 1 : 0 );

}

// --- labels ------------------------------------------------------------------------------

// A label over each area, the same size on screen at any distance: its name, its size and its
// note. Where labels would overlap, the selected area's wins, then the nearest; labels behind the
// camera or far away hide, as do those of hidden areas (isHidden( entry )).
function createLabels( { camera, canvas, isHidden } ) {

	const root = document.createElement( 'div' );
	root.className = 'laydown-labels';
	// Straight after the scene, so the panels and overlays stay on top of the labels.
	document.getElementById( 'app' ).after( root );
	const items = new Map(); // entry -> { element, lines, anchor, width, height }
	const projected = new Vector3();

	return {

		set( entry, { label, colour, size, note } ) {

			let item = items.get( entry );
			if ( ! item ) {

				const element = document.createElement( 'div' );
				element.className = 'laydown-label';
				const lines = [ 'title', 'size', 'note' ].map( className => Object.assign( document.createElement( 'div' ), { className } ) );
				element.append( ...lines );
				root.append( element );
				item = { element, lines, anchor: new Vector3(), width: 0, height: 0 };
				items.set( entry, item );

			}

			const [ title, sizeLine, noteLine ] = item.lines;
			title.textContent = label;
			sizeLine.textContent = size;
			noteLine.textContent = note;
			noteLine.hidden = ! note;
			item.element.style.setProperty( '--colour', colour );
			// Measured again when next shown.
			item.width = 0;

		},

		remove( entry ) {

			items.get( entry )?.element.remove();
			items.delete( entry );

		},

		anchor: entry => items.get( entry ).anchor,

		update( selected ) {

			const rect = canvas.getBoundingClientRect();
			const shown = [];
			for ( const [ entry, item ] of items ) {

				projected.copy( item.anchor ).project( camera );
				const visible = ! isHidden( entry ) && projected.z < 1 && Math.abs( projected.x ) < 1.2 && Math.abs( projected.y ) < 1.2 &&
					camera.position.distanceTo( item.anchor ) < LABEL_RANGE;
				item.element.hidden = ! visible;
				if ( ! visible ) continue;
				if ( item.width === 0 ) {

					item.width = item.element.offsetWidth;
					item.height = item.element.offsetHeight;

				}

				shown.push( {
					item,
					first: entry === selected,
					x: rect.left + ( projected.x + 1 ) / 2 * rect.width,
					// The bottom of the label, above the pointer under it.
					y: rect.top + ( 1 - projected.y ) / 2 * rect.height - 7,
					depth: projected.z,
				} );

			}

			shown.sort( ( a, b ) => b.first - a.first || a.depth - b.depth );
			const placed = [];
			for ( const label of shown ) {

				const { item, x, y } = label;
				const clash = placed.some( p => Math.abs( p.x - x ) < ( p.item.width + item.width ) / 2 && y - item.height < p.y && p.y - p.item.height < y );
				item.element.hidden = clash;
				if ( clash ) continue;
				placed.push( label );
				item.element.style.transform = `translate( ${ x.toFixed( 1 ) }px, ${ y.toFixed( 1 ) }px ) translate( -50%, -100% )`;

			}

		},

	};

}
