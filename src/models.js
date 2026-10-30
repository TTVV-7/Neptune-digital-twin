import { Box3, EventDispatcher, Group, LoadingManager, Raycaster, REVISION, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { dracoLoader } from './world.js';
import { enuToLocal, headingToYaw, localToEnu } from './geo.js';
import { useFastRaycast } from './raycast.js';
import { frontToYaw } from './library.js';
import { buildProcedural } from './procedural.js';
import { buildZone, ZONE_ID } from './flatten.js';

const DOWN = new Vector3( 0, - 1, 0 );
const _box = new Box3();
const _center = new Vector3();
const _origin = new Vector3();
const _local = new Vector3();

// Snapped models re-check the ground this often, because sharper tiles keep loading in.
const SNAP_INTERVAL = 0.5;
// Ground is sampled on a 3x3 grid reaching this far outside the footprint, and the median
// height is used. A sample on the roof of Google's copy of the same building, or past the
// berth edge in the water, is outvoted by the ones on the surrounding ground.
const SNAP_MARGIN = 2;

// Loads your own glTF/GLB models and places them in the terminal frame.
// Each entry keeps an editable `state` that the placement panel changes.
// Dispatches 'add', 'change' and 'remove' events with the entry.
export class ModelManager extends EventDispatcher {

	constructor( { getGround, renderer } ) {

		super();

		this.group = new Group();
		this.group.name = 'models';
		this.entries = [];
		this.getGround = getGround;
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;
		this.clock = 0;

		this.ktx2Loader = new KTX2Loader()
			.setTranscoderPath( `https://cdn.jsdelivr.net/npm/three@0.${ REVISION }.0/examples/jsm/libs/basis/` )
			.detectSupport( renderer );
		this.loader = this.createLoader();

	}

	createLoader( manager ) {

		return new GLTFLoader( manager )
			.setDRACOLoader( dracoLoader )
			.setKTX2Loader( this.ktx2Loader )
			.setMeshoptDecoder( MeshoptDecoder );

	}

	// config: an entry like those in MODELS (config.js). Built-in library pieces have `procedural`
	// instead of a url, and flatten zones have `zone`. `url` and `loader` override where and how a
	// file is loaded (drag and drop).
	async load( config, url, loader = this.loader ) {

		let content;
		if ( config.zone ) content = buildZone( config.zone.width, config.zone.length );
		else if ( config.procedural ) content = buildProcedural( config.procedural );
		else content = ( await loader.loadAsync( url ?? new URL( config.url, document.baseURI ).href ) ).scene;
		useFastRaycast( content );

		// Turn the model so its front (if the config names one, as vehicles do) faces along the
		// heading. This happens before recentring, so the box below is measured the right way round.
		content.rotation.y = frontToYaw( config.front );
		content.updateMatrixWorld();

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
			front: config.front,
			library: config.zone ? ZONE_ID : config.library,
			zone: config.zone ? { width: config.zone.width, length: config.zone.length } : null,
			procedural: config.procedural,
			// Still following the mouse in the library sidebar; not saved until placed.
			placing: !! config.placing,
			// From MODELS in config.js, which loads every time, rather than placed in this browser.
			inConfig: !! config.inConfig,
			footprint: new Box3().setFromObject( content ),
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
			lastSnap: - Infinity,
		};

		this.entries.push( entry );
		this.apply( entry );
		this.dispatchEvent( { type: 'add', entry } );
		return entry;

	}

	// Drag-and-dropped files load from blob URLs; the config keeps the file name. A .gltf saved as
	// separate files is dropped together with its .bin and textures, which are looked up by name.
	loadFile( file, placement, companions = [] ) {

		const urls = new Map( [ file, ...companions ].map( f => [ f.name, URL.createObjectURL( f ) ] ) );
		const manager = new LoadingManager();
		manager.setURLModifier( url => urls.get( decodeURIComponent( url.split( /[?#]/ )[ 0 ].split( '/' ).pop() ) ) ?? url );

		const config = {
			name: file.name.replace( /\.(glb|gltf)$/i, '' ),
			url: `models/${ file.name }`,
			...placement,
			up: null,
		};
		return this.load( config, urls.get( file.name ), this.createLoader( manager ) )
			.finally( () => urls.forEach( url => URL.revokeObjectURL( url ) ) );

	}

	apply( entry ) {

		const { pivot, state } = entry;
		enuToLocal( state.east, state.north, state.up, pivot.position );
		pivot.rotation.set( 0, headingToYaw( state.heading ), 0 );
		pivot.scale.setScalar( state.scale );
		entry.snapped = false;
		if ( state.snap ) this.snap( entry );
		this.dispatchEvent( { type: 'change', entry } );

	}

	// Put the model's base on the ground around and under its footprint.
	snap( entry ) {

		const { pivot, state, footprint } = entry;
		pivot.updateMatrixWorld();

		const margin = SNAP_MARGIN / state.scale;
		const xs = [ footprint.min.x - margin, ( footprint.min.x + footprint.max.x ) / 2, footprint.max.x + margin ];
		const zs = [ footprint.min.z - margin, ( footprint.min.z + footprint.max.z ) / 2, footprint.max.z + margin ];
		const ground = this.getGround();

		const heights = [];
		for ( const x of xs ) {

			for ( const z of zs ) {

				pivot.localToWorld( _origin.set( x, 0, z ) );
				_origin.y = 2000;
				this.raycaster.set( _origin, DOWN );
				const hit = this.raycaster.intersectObjects( ground, true ).find( h => h.object.isMesh );
				if ( hit ) heights.push( hit.point.y );

			}

		}

		entry.lastSnap = this.clock;
		if ( heights.length === 0 ) return;

		heights.sort( ( a, b ) => a - b );
		const mid = heights.length >> 1;
		const median = heights.length % 2 ? heights[ mid ] : ( heights[ mid - 1 ] + heights[ mid ] ) / 2;
		// A flatten zone goes down to the lowest ground around it, so whatever stands in it is cleared.
		const up = Math.round( ( entry.zone ? heights[ 0 ] : median ) * 100 ) / 100;
		entry.snapped = true;
		if ( up !== state.up ) {

			state.up = up;
			pivot.position.y = up;
			this.dispatchEvent( { type: 'change', entry } );

		}

	}

	// Tiles stream in and sharpen after a model loads: snap as soon as there is ground, then
	// keep re-checking so the model follows the finer tiles. Only one model is checked per
	// frame, the one waiting longest, so many models don't all raycast in the same frame.
	update( dt ) {

		this.clock += dt;
		let next = null;
		for ( const entry of this.entries ) {

			if ( ! entry.state.snap || entry.driving ) continue;
			const due = ! entry.snapped || this.clock - entry.lastSnap >= SNAP_INTERVAL;
			if ( due && ( ! next || entry.lastSnap < next.lastSnap ) ) next = entry;

		}

		if ( next ) this.snap( next );

	}

	// The entry whose model contains this object (e.g. a raycast hit), if any.
	entryFor( object ) {

		for ( let o = object; o; o = o.parent ) {

			const entry = this.entries.find( e => e.pivot === o );
			if ( entry ) return entry;

		}

		return null;

	}

	// Whether a world-space point is inside one of the models' boxes, turned with the model.
	contains( point ) {

		return this.entries.some( entry => {

			if ( entry.zone ) return false;
			entry.pivot.updateWorldMatrix( true, false );
			return entry.footprint.containsPoint( entry.pivot.worldToLocal( _local.copy( point ) ) );

		} );

	}

	remove( entry ) {

		const index = this.entries.indexOf( entry );
		if ( index === - 1 ) return;
		this.entries.splice( index, 1 );
		this.group.remove( entry.pivot );
		entry.pivot.traverse( o => {

			o.geometry?.dispose();
			// Built-in pieces share materials between copies; those stay.
			const materials = Array.isArray( o.material ) ? o.material : [ o.material ];
			materials.forEach( m => m && ! m.userData.shared && m.dispose() );

		} );
		this.dispatchEvent( { type: 'remove', entry } );

	}

	// Resize a flatten zone.
	setZoneSize( entry, width, length ) {

		const old = entry.pivot.children[ 0 ];
		entry.pivot.remove( old );
		old.traverse( o => o.geometry?.dispose() );
		const content = buildZone( width, length );
		entry.footprint = new Box3().setFromObject( content );
		entry.pivot.add( content );
		entry.zone = { width, length };
		this.apply( entry );

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
			...( entry.zone ? { zone: { ...entry.zone } } : entry.procedural ? { procedural: entry.procedural } : { url: entry.url } ),
			east: round( state.east ),
			north: round( state.north ),
			up: state.snap ? null : round( state.up ),
			heading: round( state.heading ),
			scale: state.scale,
		};
		if ( ! entry.recenter ) config.recenter = false;
		if ( entry.front ) config.front = entry.front;
		if ( entry.library ) config.library = entry.library;
		return config;

	}

}

function round( v ) {

	return Math.round( v * 100 ) / 100;

}
