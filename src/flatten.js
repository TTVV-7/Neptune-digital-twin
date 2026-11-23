import {
	BoxGeometry,
	CanvasTexture,
	DoubleSide,
	EdgesGeometry,
	Group,
	LineBasicMaterial,
	LineSegments,
	MathUtils,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Raycaster,
	RepeatWrapping,
	SRGBColorSpace,
	Vector3,
} from 'three';
import { TileFlatteningPlugin } from '3d-tiles-renderer/plugins';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { registerKind } from './kinds.js';
import { biasDepth } from './laydown.js';

// Flatten areas: rectangles drawn in the library sidebar that press everything in Google's mesh
// inside them (rail cars, trucks, sheds) down flat onto the ground, to clear space for a layout.
// An area can stop at a height ("flatten up to"), so what passes overhead (a conveyor, a gantry,
// a bridge deck) is left standing while what's under it is cleared.
// An area can also be surfaced: gravel, asphalt or concrete laid over the flattened ground, so it
// reads as a finished pad instead of Google's photo of whatever stood there, smeared flat. The
// surface shows all the time, not only in build mode; the red box over it only in build mode.
// It only changes what's drawn here; Google's data isn't touched. An area is a placed kind (see
// kinds.js), so it is saved, moved, turned and deleted like the rest.
//
// Other modules press Google's mesh onto their own surfaces with setShape() (earthworks uses it
// for pits), and originalHeight() reads the ground as Google made it, ignoring all of this.
// setEnabled( false ) puts Google's mesh back as it was, for the Before view (layers.js), and
// setEnabled( true ) flattens it all again.

export const ZONE_ID = 'flatten-zone';
// The volume drawn for an area with no height limit.
const VOLUME_HEIGHT = 8;
const MAX_HEIGHT = 200;
// Re-flattening re-processes every tile under a zone, so moves are applied a few times a second.
const UPDATE_INTERVAL = 0.2;

const fillMaterial = new MeshBasicMaterial( { color: 0xff5544, transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false } );
const floorMaterial = new MeshBasicMaterial( { color: 0xff5544, transparent: true, opacity: 0.3, depthWrite: false } );
const edgeMaterial = new LineBasicMaterial( { color: 0xff3322 } );
// The top of an area with a height limit: nothing above it is touched.
const ceilingMaterial = new MeshBasicMaterial( { color: 0x7fd4ff, transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false } );
for ( const material of [ fillMaterial, floorMaterial, edgeMaterial, ceilingMaterial ] ) material.userData.shared = true;

// What a flattened area can be finished with. `tile` is how many metres one repeat of the texture
// covers; `colour` is the average, close to how each looks on Google's aerial photos.
const SURFACES = {
	gravel: { name: 'Gravel', tile: 3, colour: '#9a958b', grain: [ '#b8b2a6', '#7d786e', '#a9a294', '#6b665d', '#c9c3b6' ], speck: 0.55, size: [ 1, 3.2 ] },
	asphalt: { name: 'Asphalt', tile: 4, colour: '#4e5052', grain: [ '#5c5e60', '#424446', '#666769', '#393a3c' ], speck: 0.35, size: [ 0.6, 1.6 ] },
	concrete: { name: 'Concrete', tile: 6, colour: '#b4b1aa', grain: [ '#bdbab3', '#aaa7a0', '#c4c1ba' ], speck: 0.12, size: [ 0.6, 1.4 ], joints: true },
};
const SURFACE_OPTIONS = { gravel: 'gravel', asphalt: 'asphalt', concrete: 'concrete', 'none (just flatten)': 'none' };
// A little above the flattened ground, so the surface covers it; the depth bias does the rest.
const SURFACE_LIFT = 0.03;

const surfaceMaterials = new Map();
function surfaceMaterial( id ) {

	if ( surfaceMaterials.has( id ) ) return surfaceMaterials.get( id );
	const spec = SURFACES[ id ];
	const map = new CanvasTexture( drawSurface( spec ) );
	map.wrapS = map.wrapT = RepeatWrapping;
	map.colorSpace = SRGBColorSpace;
	map.anisotropy = 8;
	// Unlit, like Google's photo-textured mesh around it, so it matches by day and night alike.
	const material = new MeshBasicMaterial( { map } );
	material.onBeforeCompile = biasDepth;
	material.userData.shared = true;
	surfaceMaterials.set( id, material );
	return material;

}

// A seamless square of the surface: its average colour, then grains scattered over it (wrapped
// round the edges so repeats don't show a seam), and saw-cut joints for concrete.
function drawSurface( { colour, grain, speck, size, joints } ) {

	const N = 256;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = N;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = colour;
	ctx.fillRect( 0, 0, N, N );
	// The same pattern every time, so a layout looks the same on each load.
	let seed = 12345;
	const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const count = Math.round( N * N * speck * 0.12 );
	for ( let i = 0; i < count; i ++ ) {

		const x = random() * N;
		const y = random() * N;
		const r = size[ 0 ] + random() * ( size[ 1 ] - size[ 0 ] );
		ctx.fillStyle = grain[ Math.floor( random() * grain.length ) ];
		for ( const dx of [ - N, 0, N ] ) for ( const dy of [ - N, 0, N ] ) {

			if ( x + dx + r < 0 || x + dx - r > N || y + dy + r < 0 || y + dy - r > N ) continue;
			ctx.beginPath();
			ctx.arc( x + dx, y + dy, r, 0, Math.PI * 2 );
			ctx.fill();

		}

	}

	if ( joints ) {

		ctx.strokeStyle = 'rgba( 70, 68, 64, 0.55 )';
		ctx.lineWidth = 1.5;
		ctx.strokeRect( 0.75, 0.75, N - 1.5, N - 1.5 );

	}

	return canvas;

}

// The surface over an area's floor: one plane with its texture repeating every `tile` metres.
function buildSurface( width, length, id ) {

	const { tile } = SURFACES[ id ];
	const geometry = new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 );
	const uv = geometry.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * width / tile, uv.getY( i ) * length / tile );
	const mesh = new Mesh( geometry, surfaceMaterial( id ) );
	mesh.name = `${ SURFACES[ id ].name } surface`;
	mesh.position.y = SURFACE_LIFT;
	// Walked and driven on like the ground under it, which is flattened to the same height.
	mesh.userData.noCollide = true;
	return mesh;

}

// The zone as drawn in build mode: a see-through volume over the area, with a floor you can
// click to select it, up to its height limit if it has one (with a blue ceiling: what's above is
// left alone). None of it blocks walking or driving.
export function buildZone( width, length, height = 0, surface = 'none' ) {

	const group = new Group();
	group.name = SURFACES[ surface ] ? `${ SURFACES[ surface ].name } pad` : 'Flattened area';
	group.userData.zone = true;

	const top = height > 0 ? height : VOLUME_HEIGHT;
	const volume = new Mesh( new BoxGeometry( width, top, length ), fillMaterial );
	volume.position.y = top / 2;
	volume.raycast = () => {};
	const edges = new LineSegments( new EdgesGeometry( volume.geometry ), edgeMaterial );
	edges.position.copy( volume.position );
	edges.raycast = () => {};

	const floor = new Mesh( new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 ), floorMaterial );
	floor.position.y = 0.05;
	floor.renderOrder = 1;

	for ( const mesh of [ volume, edges, floor ] ) mesh.userData.noCollide = true;
	// The red box is only for laying the area out: shown in build mode (see models.js).
	for ( const mesh of [ volume, edges, floor ] ) mesh.userData.buildOnly = true;
	group.add( volume, edges, floor );
	if ( SURFACES[ surface ] ) group.add( buildSurface( width, length, surface ) );
	if ( height > 0 ) {

		const ceiling = new Mesh( new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 ), ceilingMaterial );
		ceiling.position.y = height;
		ceiling.raycast = () => {};
		ceiling.userData.noCollide = true;
		ceiling.userData.buildOnly = true;
		group.add( ceiling );

	}

	return group;

}

registerKind( ZONE_ID, {
	label: 'Flattened area',
	layer: 'Flatten areas',
	build: ( { width, length, height, surface } ) => buildZone( width, length, height, surface ),
	// Areas saved before surfaces existed have none, and are saved again without one.
	normalize: p => ( { width: clampSize( p.width ), length: clampSize( p.length ), height: clampHeight( p.height ), surface: SURFACES[ p.surface ] ? p.surface : 'none' } ),
	save: ( { surface, ...rest } ) => surface === 'none' ? rest : { ...rest, surface },
	// Down to the lowest ground around it as Google made it, so flattening doesn't drag it lower.
	snap: 'lowest-original',
	solid: false,
	buildOnly: true,
	// A surfaced area's gravel or asphalt stays in view outside build mode; its red box doesn't.
	shownOutsideBuild: params => params.surface !== 'none',
	altersMap: true,
	fields: [
		{ key: 'surface', label: 'surface', options: SURFACE_OPTIONS, size: true, editor: true },
		{ key: 'width', label: 'width (m)', min: 1, step: 0.5, size: true },
		{ key: 'length', label: 'length (m)', min: 1, step: 0.5, size: true },
		// 0 flattens everything above the floor, as areas always did (and saved ones still do).
		{ key: 'height', label: 'flatten up to (m, 0 = all)', min: 0, max: MAX_HEIGHT, step: 0.5, size: true },
	],
	// A box is cheap to rebuild, and the flattening itself catches up a few times a second.
	resize: {
		shape: 'rect',
		live: true,
		label: ( { width, length, height, surface } ) => `${ width.toFixed( 1 ) } × ${ length.toFixed( 1 ) } m · ${ Math.round( width * length ).toLocaleString( 'en-CA' ) } m²${ SURFACES[ surface ] ? ` · ${ SURFACES[ surface ].name.toLowerCase() }` : '' }${ height > 0 ? ` · up to ${ height.toFixed( 1 ) } m` : '' }`,
	},
} );

// The surface the next area drawn gets: the one last chosen for an area, gravel to begin with.
let nextSurface = 'gravel';
export function defaultSurface() {

	return nextSurface;

}

export function rememberSurface( surface ) {

	if ( SURFACES[ surface ] || surface === 'none' ) nextSurface = surface;

}

function clampSize( v ) {

	return Math.min( 2000, Math.max( 1, Number( v ) || 10 ) );

}

function clampHeight( v ) {

	return Math.min( MAX_HEIGHT, Math.max( 0, Number( v ) || 0 ) );

}

// The plugin raycasts its shapes once per tile vertex. A clone of a plain Mesh loses any
// per-object raycast override, so shapes with many triangles use this class to keep the BVH.
export class ShapeMesh extends Mesh {

	raycast( raycaster, intersects ) {

		if ( this.geometry.boundsTree ) acceleratedRaycast.call( this, raycaster, intersects );
		else super.raycast( raycaster, intersects );

	}

}

// Keeps TileFlatteningPlugin shapes in step with flatten areas and with shapes other modules set.
// Does nothing without Google tiles, apart from originalHeight().
export function setUpFlattening( { tiles, models } ) {

	const plugin = tiles ? new TileFlatteningPlugin() : null;
	if ( plugin ) tiles.registerPlugin( plugin );

	const shapes = new Map(); // key (an entry, or another module's key) -> shape in the tileset's frame
	const sources = new Map(); // other modules' key -> their mesh, in the scene's frame
	const dirty = new Set();
	const scale = new Matrix4();
	const down = new Vector3();
	// Where the tileset stood when the shapes were last made (see update()).
	const frame = new Matrix4();
	let timer = 0;
	// Off: no shape is in the plugin, which then gives every tile its original vertices back.
	// Shapes keep up with their areas meanwhile, and go back in when it's turned on.
	let enabled = true;

	const toTileset = () => {

		tiles.group.updateWorldMatrix( true, false );
		return scale.copy( tiles.group.matrixWorld ).invert();

	};

	// `threshold`: how far above the shape the plugin presses vertices down onto it (an area's
	// height limit); higher ones are left where they are.
	const commit = ( key, shape, threshold = Infinity ) => {

		// The plugin presses vertices along this direction onto the shape; pointing down, it
		// flattens what's above the floor and leaves what's below (e.g. water under a deck).
		down.set( 0, - 1, 0 ).transformDirection( toTileset() );
		const current = plugin.shapes.get( shape );
		if ( current && current.direction.distanceToSquared( down ) < 1e-12 && current.threshold === threshold ) {

			plugin.updateShape( shape );
			return;

		}

		// New, or the frame or the height limit has changed since (the plugin keeps both from
		// when the shape was added): add it afresh. A saved layout's areas are made before
		// Google's root tileset has loaded and been turned to the site, when "down" in the
		// tileset's frame points somewhere else entirely; update() makes them again once it is.
		if ( current ) plugin.deleteShape( shape );
		plugin.addShape( shape, down, { threshold } );
		shapes.set( key, shape );

	};

	const remove = key => {

		const shape = shapes.get( key );
		if ( ! shape ) return;
		if ( plugin.hasShape( shape ) ) plugin.deleteShape( shape );
		shapes.delete( key );

	};

	const sync = key => {

		if ( ! plugin || ! enabled ) return;
		const source = sources.get( key );
		if ( source !== undefined ) {

			if ( ! source ) {

				remove( key );
				sources.delete( key );
				return;

			}

			// The plugin works in the tileset's own frame, so bring the shape into it.
			const { geometry } = source;
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
			let shape = shapes.get( key );
			if ( ! shape || shape.geometry !== geometry ) {

				remove( key );
				shape = new ShapeMesh( geometry );
				shape.matrixAutoUpdate = false;

			}

			source.updateWorldMatrix( true, false );
			shape.matrix.multiplyMatrices( toTileset(), source.matrixWorld );
			shape.matrixWorld.copy( shape.matrix );
			commit( key, shape );
			return;

		}

		const entry = key;
		if ( ! models.entries.includes( entry ) ) return;
		let shape = shapes.get( entry );
		if ( ! shape ) {

			shape = new Mesh( new PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 ) );
			shape.matrixAutoUpdate = false;

		}

		// The area's floor, in the tileset's frame.
		const { pivot, params } = entry;
		pivot.updateWorldMatrix( true, false );
		shape.matrix.multiplyMatrices( toTileset(), pivot.matrixWorld )
			.multiply( new Matrix4().makeScale( params.width, 1, params.length ) );
		shape.matrixWorld.copy( shape.matrix );
		commit( entry, shape, params.height > 0 ? params.height : Infinity );

	};

	const mark = ( { entry } ) => {

		if ( entry.kind === ZONE_ID && ! entry.placing ) dirty.add( entry );

	};

	// An area's surface as last seen: when it's changed in the P panel, the next area drawn
	// gets the same (gravel, then asphalt all evening, say). Loading a layout doesn't count.
	const surfaces = new WeakMap();
	models.addEventListener( 'add', e => {

		mark( e );
		if ( e.entry.kind === ZONE_ID ) surfaces.set( e.entry, e.entry.params.surface );

	} );
	models.addEventListener( 'change', e => {

		mark( e );
		const { entry } = e;
		if ( entry.kind !== ZONE_ID ) return;
		const before = surfaces.get( entry );
		if ( before !== undefined && before !== entry.params.surface ) rememberSurface( entry.params.surface );
		surfaces.set( entry, entry.params.surface );

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		dirty.delete( entry );
		if ( plugin ) remove( entry );

	} );

	// Google's tiles as loaded, before any flattening: the plugin keeps each tile's original
	// vertex positions so it can redo the flattening. geometry -> original positions array.
	const originals = new WeakMap();
	const findOriginal = geometry => {

		if ( ! plugin ) return null;
		if ( ! originals.has( geometry ) ) {

			for ( const geomMap of plugin.positionsMap.values() ) for ( const [ g, buffer ] of geomMap ) originals.set( g, buffer );

		}

		return originals.get( geometry ) ?? null;

	};

	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	const DOWN = new Vector3( 0, - 1, 0 );
	const corners = [ new Vector3(), new Vector3(), new Vector3() ];
	const before = [ new Vector3(), new Vector3(), new Vector3() ];

	return {

		update( dt ) {

			// Whenever Google's tileset is turned to a site (when its root loads, or turned again
			// later), make every shape again in its new frame.
			if ( plugin && ! frame.equals( tiles.group.matrixWorld ) ) {

				frame.copy( tiles.group.matrixWorld );
				for ( const key of shapes.keys() ) dirty.add( key );

			}

			timer -= dt;
			if ( ! enabled || timer > 0 || dirty.size === 0 ) return;
			timer = UPDATE_INTERVAL;
			for ( const key of dirty ) sync( key );
			dirty.clear();

		},

		// Off puts Google's mesh back as it was everywhere; on flattens it again, at once. The plugin
		// keeps each tile's original vertices, so neither way loses anything.
		setEnabled( on ) {

			if ( on === enabled ) return;
			enabled = on;
			if ( ! plugin ) return;
			if ( on ) {

				// Made again from the areas and other modules' meshes as they are now.
				for ( const key of shapes.keys() ) dirty.add( key );
				for ( const key of sources.keys() ) dirty.add( key );
				for ( const key of dirty ) sync( key );
				dirty.clear();
				return;

			}

			for ( const shape of shapes.values() ) if ( plugin.hasShape( shape ) ) plugin.deleteShape( shape );

		},

		get enabled() {

			return enabled;

		},

		// How many shapes press Google's mesh flat now (none while it's turned off).
		get shapeCount() {

			return plugin ? plugin.shapes.size : 0;

		},

		// Press Google's mesh down onto `mesh` (in the scene's frame, e.g. the floor of a pit)
		// wherever the mesh lies under it; null removes it. Call again after changing the mesh
		// or moving it. Changes are applied a few times a second, as each one reworks every tile
		// under the shapes. Shapes with many triangles should be a ShapeMesh with a boundsTree.
		setShape( key, mesh ) {

			sources.set( key, mesh );
			dirty.add( key );

		},

		// Ground height at local (x, z) as Google (or the stand-in ground) made it, ignoring
		// flatten areas and pits. Null where there's no ground. With `detail`, detail.error says
		// how coarse that ground is: the geometric error in metres of the Google tile it's from
		// (0 for other ground, Infinity for none). Tiles far from the camera, and those that load
		// first, are coarse, and the ground can be metres out on them.
		originalHeight( x, z, ground = tiles?.group, detail = null ) {

			if ( detail ) detail.error = Infinity;
			if ( ! ground ) return null;
			raycaster.set( new Vector3( x, 5000, z ), DOWN );
			raycaster.far = 10000;
			const hit = raycaster.intersectObject( ground, true ).find( h => h.object.isMesh );
			if ( ! hit ) return null;
			if ( detail ) detail.error = hit.object.userData.tile?.geometricError ?? 0;
			const original = hit.face && findOriginal( hit.object.geometry );
			if ( ! original ) return hit.point.y;

			// Flattening only moves vertices up and down, so the hit's place across the triangle
			// is the same before and after; read the height there from the original corners.
			const { position } = hit.object.geometry.attributes;
			const ids = [ hit.face.a, hit.face.b, hit.face.c ];
			ids.forEach( ( id, i ) => {

				corners[ i ].fromBufferAttribute( position, id ).applyMatrix4( hit.object.matrixWorld );
				before[ i ].set( ...[ 0, 1, 2 ].map( k => readValue( original, id * 3 + k, position ) ) ).applyMatrix4( hit.object.matrixWorld );

			} );
			const w = barycentricXZ( hit.point, corners );
			if ( ! w ) return hit.point.y;
			return before[ 0 ].y * w[ 0 ] + before[ 1 ].y * w[ 1 ] + before[ 2 ].y * w[ 2 ];

		},

		get active() {

			return enabled && shapes.size > 0;

		},

	};

}

function readValue( array, index, attribute ) {

	const value = array[ index ];
	return attribute.normalized ? MathUtils.denormalize( value, array ) : value;

}

// Weights of p's position across triangle t, looking straight down, or null if t is a sliver.
function barycentricXZ( p, [ a, b, c ] ) {

	const d = ( b.z - c.z ) * ( a.x - c.x ) + ( c.x - b.x ) * ( a.z - c.z );
	if ( Math.abs( d ) < 1e-9 ) return null;
	const u = ( ( b.z - c.z ) * ( p.x - c.x ) + ( c.x - b.x ) * ( p.z - c.z ) ) / d;
	const v = ( ( c.z - a.z ) * ( p.x - c.x ) + ( a.x - c.x ) * ( p.z - c.z ) ) / d;
	return [ u, v, 1 - u - v ];

}
