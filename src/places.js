import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { enuToLocal, headingToYaw, localToEnu } from './geo.js';

const DOWN = new Vector3( 0, - 1, 0 );
const BLOCK_MATERIAL = new MeshStandardMaterial( { color: 0xe9e4d8, roughness: 0.8 } );
const EDGE_MATERIAL = new LineBasicMaterial( { color: 0x39434c } );

// Named places on site: a label, and for things Google's mesh doesn't show (a site trailer,
// a laydown area) a simple block. Blocks count as obstacles for the vehicle fit check.
export class PlaceLayer {

	constructor( { getGround } ) {

		this.group = new Group();
		this.group.name = 'places';
		this.getGround = getGround;
		this.entries = [];
		this.raycaster = new Raycaster();

	}

	add( config ) {

		const element = document.createElement( 'div' );
		element.className = 'place-label';
		const entry = {
			state: {
				name: config.name ?? 'New place',
				east: config.east ?? 0,
				north: config.north ?? 0,
				heading: config.heading ?? 0,
				length: config.length ?? 0,
				width: config.width ?? 0,
				height: config.height ?? 0,
			},
			object: new Group(),
			label: new CSS2DObject( element ),
			groundY: null,
		};
		element.addEventListener( 'click', () => this.onClick?.( entry ) );
		entry.object.add( entry.label );
		this.group.add( entry.object );
		this.entries.push( entry );
		this.apply( entry );
		return entry;

	}

	// Rebuild the block and label after the state changes.
	apply( entry ) {

		const { state, object, label } = entry;
		entry.block?.geometry.dispose();
		entry.edges?.geometry.dispose();
		if ( entry.block ) object.remove( entry.block, entry.edges );
		entry.block = entry.edges = null;

		if ( state.length > 0 && state.width > 0 && state.height > 0 ) {

			const geometry = new BoxGeometry( state.width, state.height, state.length ).translate( 0, state.height / 2, 0 );
			geometry.computeBoundsTree();
			entry.block = new Mesh( geometry, BLOCK_MATERIAL );
			entry.edges = new LineSegments( new EdgesGeometry( geometry ), EDGE_MATERIAL );
			entry.edges.raycast = () => {};
			object.add( entry.block, entry.edges );

		}

		label.element.textContent = state.name;
		label.position.y = ( state.height || 0 ) + 6;
		object.rotation.y = headingToYaw( state.heading );
		entry.groundY = null;
		this.place( entry );

	}

	// Sit on the ground, found by looking straight down (retried until the tiles have loaded).
	// A block takes the median height around it, so it doesn't land on the roof of Google's
	// copy of the same building.
	place( entry ) {

		const { state, object } = entry;
		const h = state.heading * Math.PI / 180;
		const half = [ state.width / 2 + 2, state.length / 2 + 2 ];
		const offsets = entry.block ? [ [ 0, 0 ], [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] : [ [ 0, 0 ] ];
		const heights = [];
		for ( const [ x, z ] of offsets ) {

			// x across the block, z along it (compass heading)
			const along = z * half[ 1 ], across = x * half[ 0 ];
			const east = state.east + Math.sin( h ) * along + Math.cos( h ) * across;
			const north = state.north + Math.cos( h ) * along - Math.sin( h ) * across;
			this.raycaster.set( enuToLocal( east, north, 1000 ), DOWN );
			this.raycaster.far = 1600; // the site is within a few hundred metres of sea level
			const hit = this.raycaster.intersectObjects( this.getGround(), true )[ 0 ];
			if ( hit ) heights.push( hit.point.y );

		}

		if ( heights.length === offsets.length ) {

			heights.sort( ( p, q ) => p - q );
			entry.groundY = heights[ Math.floor( heights.length / 2 ) ];

		}

		enuToLocal( state.east, state.north, entry.groundY ?? 0, object.position );
		object.updateMatrixWorld( true );

	}

	// The tiles under a place sharpen as they stream in, so keep it on the ground every couple of seconds.
	update( dt ) {

		this.timer = ( this.timer ?? 0 ) - dt;
		if ( this.timer > 0 ) return;
		this.timer = 2;
		for ( const entry of this.entries ) this.place( entry );

	}

	remove( entry ) {

		this.group.remove( entry.object );
		entry.label.element.remove();
		entry.block?.geometry.dispose();
		entry.edges?.geometry.dispose();
		this.entries.splice( this.entries.indexOf( entry ), 1 );

	}

	clear() {

		for ( const entry of [ ...this.entries ] ) this.remove( entry );

	}

	moveTo( entry, position ) {

		const { east, north } = localToEnu( position );
		entry.state.east = Math.round( east * 10 ) / 10;
		entry.state.north = Math.round( north * 10 ) / 10;
		this.apply( entry );

	}

	// A camera pose looking at the place from the south-south-west.
	viewOf( entry ) {

		const { east, north, height } = entry.state;
		const y = ( entry.groundY ?? 0 ) + ( height || 0 );
		return { position: enuToLocal( east - 25, north - 70, y + 45 ), heading: 20, pitch: - 30 };

	}

	toConfig( entry ) {

		const { state } = entry;
		const config = { name: state.name, east: state.east, north: state.north };
		if ( state.length && state.width && state.height ) Object.assign( config, { heading: state.heading, length: state.length, width: state.width, height: state.height } );
		return config;

	}

}
