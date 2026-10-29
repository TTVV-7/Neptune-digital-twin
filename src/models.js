import { Box3, Group, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { dracoLoader } from './world.js';
import { enuToLocal, headingToYaw, localToEnu } from './geo.js';

const DOWN = new Vector3( 0, - 1, 0 );
const _box = new Box3();
const _center = new Vector3();
const _origin = new Vector3();

// Loads your own glTF/GLB models and places them in the terminal frame.
// Each entry keeps an editable `state` that the placement panel changes.
export class ModelManager {

	constructor( { getGround } ) {

		this.group = new Group();
		this.group.name = 'models';
		this.entries = [];
		this.getGround = getGround;
		this.raycaster = new Raycaster();

		this.loader = new GLTFLoader()
			.setDRACOLoader( dracoLoader )
			.setMeshoptDecoder( MeshoptDecoder );

	}

	async load( config, url = new URL( config.url, document.baseURI ).href ) {

		const gltf = await this.loader.loadAsync( url );
		const content = gltf.scene;

		// Recentre so east/north refer to the middle of the footprint and up to its base.
		// CAD exports often carry huge offsets (e.g. UTM coordinates) that would put the model kilometres away.
		if ( config.recenter !== false ) {

			_box.setFromObject( content );
			_box.getCenter( _center );
			content.position.set( - _center.x, - _box.min.y, - _center.z );

		}

		const pivot = new Group();
		pivot.name = config.name;
		pivot.add( content );
		this.group.add( pivot );

		const entry = {
			pivot,
			url: config.url,
			recenter: config.recenter !== false,
			state: {
				name: config.name ?? 'Model',
				east: config.east ?? 0,
				north: config.north ?? 0,
				up: config.up ?? 0,
				snap: config.up == null,
				heading: config.heading ?? 0,
				scale: config.scale ?? 1,
			},
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
		entry.snapped = false;
		if ( state.snap ) this.snap( entry );

	}

	snap( entry ) {

		const { pivot, state } = entry;
		_origin.copy( pivot.position );
		_origin.y = 2000;
		this.raycaster.set( _origin, DOWN );
		const hits = this.raycaster.intersectObjects( this.getGround(), true );
		if ( hits.length ) {

			state.up = Math.round( hits[ 0 ].point.y * 100 ) / 100;
			pivot.position.y = state.up;
			entry.snapped = true;
			this.onChange?.( entry );

		}

	}

	// Tiles stream in after the model loads, so keep trying until the ground exists.
	update() {

		for ( const entry of this.entries ) {

			if ( entry.state.snap && ! entry.snapped ) this.snap( entry );

		}

	}

	remove( entry ) {

		this.group.remove( entry.pivot );
		entry.pivot.traverse( o => {

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
		if ( ! entry.recenter ) config.recenter = false;
		return config;

	}

}

function round( v ) {

	return Math.round( v * 100 ) / 100;

}
