import { Box3, BufferGeometry, Group, Matrix4, Mesh, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { dracoLoader } from './world.js';
import { enuToLocal, headingToYaw, localToEnu } from './geo.js';

// Raycasts against a model with millions of triangles would stall walking and snapping,
// so every model mesh gets a bounding volume hierarchy (meshes without one raycast as normal).
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

// Decode meshopt-compressed files off the main thread.
MeshoptDecoder.useWorkers( Math.min( 4, navigator.hardwareConcurrency || 2 ) );

const DOWN = new Vector3( 0, - 1, 0 );
const FLATTEN_MARGIN = 2; // metres flattened around the footprint when `flatten: true`
const SNAP_MARGIN = 3; // metres outside the footprint where the ground height is sampled
const _box = new Box3();
const _center = new Vector3();
const _origin = new Vector3();
const _matrix = new Matrix4();

// Loads your own glTF/GLB models and places them in the terminal frame.
// Each entry keeps an editable `state` that the placement panel changes.
export class ModelManager {

	constructor( { getGround, flattener = null } ) {

		this.group = new Group();
		this.group.name = 'models';
		this.entries = [];
		this.loading = new Set(); // { name, loaded, total, stage } while a file downloads and is prepared
		this.getGround = getGround;
		this.flattener = flattener;
		this.raycaster = new Raycaster();

		this.loader = new GLTFLoader()
			.setDRACOLoader( dracoLoader )
			.setMeshoptDecoder( MeshoptDecoder );

	}

	async load( config, url = new URL( config.url, document.baseURI ).href ) {

		const progress = { name: config.name ?? config.url, loaded: 0, total: 0, stage: 'downloading' };
		this.loading.add( progress );
		this.onLoading?.();

		try {

			const gltf = await this.loader.loadAsync( url, e => {

				progress.loaded = e.loaded;
				progress.total = e.lengthComputable ? e.total : 0;

			} );

			// Big models freeze the page for a moment here, so show it before starting.
			progress.stage = 'preparing';
			this.onLoading?.();
			await nextPaint();
			return this.add( config, gltf.scene );

		} finally {

			this.loading.delete( progress );
			this.onLoading?.();

		}

	}

	add( config, content ) {

		// Recentre so east/north refer to the middle of the footprint and up to its base.
		// CAD exports often carry huge offsets (e.g. UTM coordinates) that would put the model kilometres away.
		if ( config.recenter !== false ) {

			_box.setFromObject( content );
			_box.getCenter( _center );
			content.position.set( - _center.x, - _box.min.y, - _center.z );

		}

		content.traverse( o => {

			if ( o.isMesh && ! o.geometry.boundsTree ) o.geometry.computeBoundsTree();

		} );

		const pivot = new Group();
		pivot.name = config.name;
		pivot.add( content );
		this.group.add( pivot );

		const entry = {
			pivot,
			url: config.url,
			recenter: config.recenter !== false,
			footprint: footprintOf( content ),
			state: {
				name: config.name ?? 'Model',
				east: config.east ?? 0,
				north: config.north ?? 0,
				up: config.up ?? 0,
				snap: config.up == null,
				heading: config.heading ?? 0,
				scale: config.scale ?? 1,
				flatten: Boolean( config.flatten ),
			},
			flattenMargin: typeof config.flatten === 'number' ? config.flatten : FLATTEN_MARGIN,
			snapped: false,
		};

		this.entries.push( entry );
		this.apply( entry );
		this.onAdd?.( entry );
		return entry;

	}

	// Drag-and-dropped files load from a blob URL; the config keeps the file name.
	loadFile( file, placement ) {

		const url = URL.createObjectURL( file );
		const config = { name: file.name.replace( /\.(glb|gltf)$/i, '' ), url: `models/${ file.name }`, ...placement, up: null };
		return this.load( config, url ).finally( () => URL.revokeObjectURL( url ) );

	}

	apply( entry ) {

		const { pivot, state } = entry;
		enuToLocal( state.east, state.north, state.up, pivot.position );
		pivot.rotation.set( 0, headingToYaw( state.heading ), 0 );
		pivot.scale.setScalar( state.scale );
		pivot.updateMatrixWorld();
		entry.snapped = false;
		if ( state.snap ) this.snap( entry );
		this.updateFlattening( entry );

	}

	// Sit the model on the ground. The height is the median of the ground at the footprint's
	// corners (just outside it) and its centre, so Google's lumpy copy of the same building,
	// or a quay edge, doesn't lift or drop it.
	snap( entry ) {

		const { pivot, state, footprint } = entry;
		const { min, max } = footprint;
		const x0 = min.x - SNAP_MARGIN / state.scale, x1 = max.x + SNAP_MARGIN / state.scale;
		const z0 = min.z - SNAP_MARGIN / state.scale, z1 = max.z + SNAP_MARGIN / state.scale;
		const samples = [ [ x0, z0 ], [ x1, z0 ], [ x0, z1 ], [ x1, z1 ], [ ( x0 + x1 ) / 2, ( z0 + z1 ) / 2 ] ];

		const ground = this.getGround();
		const heights = [];
		for ( const [ x, z ] of samples ) {

			_origin.set( x, 0, z ).applyMatrix4( pivot.matrixWorld );
			_origin.y = 2000;
			this.raycaster.set( _origin, DOWN );
			const hit = this.raycaster.intersectObjects( ground, true )[ 0 ];
			if ( hit ) heights.push( hit.point.y );

		}

		if ( heights.length < 3 ) return;
		heights.sort( ( a, b ) => a - b );
		state.up = Math.round( heights[ Math.floor( heights.length / 2 ) ] * 100 ) / 100;
		pivot.position.y = state.up;
		pivot.updateMatrixWorld();
		entry.snapped = true;
		this.updateFlattening( entry );
		this.onChange?.( entry );

	}

	updateFlattening( entry ) {

		if ( ! this.flattener ) return;
		if ( ! entry.state.flatten ) {

			this.flattener.remove( entry );
			return;

		}

		// A flat rectangle at the model's base, a little bigger than its footprint.
		const { footprint, pivot, flattenMargin, state } = entry;
		const margin = flattenMargin / state.scale;
		entry.flattenShape ??= new PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 );
		footprint.getCenter( _center );
		_matrix.makeScale( footprint.max.x - footprint.min.x + 2 * margin, 1, footprint.max.z - footprint.min.z + 2 * margin )
			.setPosition( _center.x, footprint.min.y, _center.z )
			.premultiply( pivot.matrixWorld );
		this.flattener.set( entry, entry.flattenShape, _matrix );

	}

	// Tiles stream in after the model loads, so keep trying until the ground exists.
	update() {

		for ( const entry of this.entries ) {

			if ( entry.state.snap && ! entry.snapped ) this.snap( entry );

		}

	}

	remove( entry ) {

		this.flattener?.remove( entry );
		this.group.remove( entry.pivot );
		entry.pivot.traverse( o => {

			o.geometry?.disposeBoundsTree?.();
			o.geometry?.dispose();
			const materials = Array.isArray( o.material ) ? o.material : [ o.material ];
			materials.forEach( m => m?.dispose() );

		} );
		this.entries.splice( this.entries.indexOf( entry ), 1 );

	}

	moveTo( entry, position, heading ) {

		const { east, north } = localToEnu( position );
		entry.state.east = round( east );
		entry.state.north = round( north );
		if ( heading !== undefined ) entry.state.heading = round( heading );
		this.apply( entry );

	}

	toConfig( entry ) {

		const { state } = entry;
		const config = {
			name: state.name,
			url: entry.url,
			east: round( state.east ),
			north: round( state.north ),
			up: state.snap ? null : round( state.up ),
			heading: round( state.heading ),
			scale: state.scale,
		};
		if ( state.flatten ) config.flatten = entry.flattenMargin === FLATTEN_MARGIN ? true : entry.flattenMargin;
		if ( ! entry.recenter ) config.recenter = false;
		return config;

	}

}

// Bounding box of the content in the pivot's frame, i.e. before east/north/heading/scale.
function footprintOf( content ) {

	content.updateMatrixWorld( true );
	return new Box3().setFromObject( content );

}

// Resolves once the page has repainted (or after half a second in a background tab).
function nextPaint() {

	return new Promise( resolve => {

		requestAnimationFrame( () => requestAnimationFrame( resolve ) );
		setTimeout( resolve, 500 );

	} );

}

function round( v ) {

	return Math.round( v * 100 ) / 100;

}
