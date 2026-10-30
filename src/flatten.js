import {
	BoxGeometry,
	DoubleSide,
	EdgesGeometry,
	Group,
	LineBasicMaterial,
	LineSegments,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Vector3,
} from 'three';
import { TileFlatteningPlugin } from '3d-tiles-renderer/plugins';

// Flatten zones: rectangles drawn in the library sidebar that press everything in Google's mesh
// inside them (rail cars, trucks, sheds) down flat onto the ground, to clear space for a layout.
// It only changes what's drawn here; Google's data isn't touched. A zone is an ordinary placed
// item (entry.zone = { width, length }), so it is saved, moved, turned and deleted like the rest.

export const ZONE_ID = 'flatten-zone';
const VOLUME_HEIGHT = 8;
// Re-flattening re-processes every tile under a zone, so moves are applied a few times a second.
const UPDATE_INTERVAL = 0.2;

const fillMaterial = new MeshBasicMaterial( { color: 0xff5544, transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false } );
const floorMaterial = new MeshBasicMaterial( { color: 0xff5544, transparent: true, opacity: 0.3, depthWrite: false } );
const edgeMaterial = new LineBasicMaterial( { color: 0xff3322 } );
for ( const material of [ fillMaterial, floorMaterial, edgeMaterial ] ) material.userData.shared = true;

// The zone as drawn in build mode: a see-through volume over the area, with a floor you can
// click to select it. None of it blocks walking or driving.
export function buildZone( width, length ) {

	const group = new Group();
	group.name = 'Flattened area';
	group.userData.zone = true;

	const volume = new Mesh( new BoxGeometry( width, VOLUME_HEIGHT, length ), fillMaterial );
	volume.position.y = VOLUME_HEIGHT / 2;
	volume.raycast = () => {};
	const edges = new LineSegments( new EdgesGeometry( volume.geometry ), edgeMaterial );
	edges.position.copy( volume.position );
	edges.raycast = () => {};

	const floor = new Mesh( new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 ), floorMaterial );
	floor.position.y = 0.05;
	floor.renderOrder = 1;

	for ( const mesh of [ volume, edges, floor ] ) mesh.userData.noCollide = true;
	group.add( volume, edges, floor );
	return group;

}

// Keeps a TileFlatteningPlugin shape in step with each zone. Does nothing without Google tiles.
export function setUpFlattening( { tiles, models } ) {

	const plugin = tiles ? new TileFlatteningPlugin() : null;
	if ( plugin ) tiles.registerPlugin( plugin );

	const shapes = new Map(); // entry -> shape mesh in the tileset's frame
	const dirty = new Set();
	const scale = new Matrix4();
	const down = new Vector3();
	let timer = 0;

	const sync = entry => {

		if ( ! plugin ) return;
		let shape = shapes.get( entry );
		if ( ! shape ) {

			shape = new Mesh( new PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 ) );
			shape.matrixAutoUpdate = false;
			shapes.set( entry, shape );

		}

		// The plugin works in the tileset's own frame, so bring the zone's floor into it.
		const { pivot, zone } = entry;
		pivot.updateWorldMatrix( true, false );
		tiles.group.updateWorldMatrix( true, false );
		shape.matrix.copy( tiles.group.matrixWorld ).invert()
			.multiply( pivot.matrixWorld )
			.multiply( scale.makeScale( zone.width, 1, zone.length ) );
		shape.matrixWorld.copy( shape.matrix );

		if ( plugin.hasShape( shape ) ) {

			plugin.updateShape( shape );

		} else {

			// The plugin presses vertices along this direction onto the shape; pointing down, it
			// flattens everything above the floor and leaves what's below (e.g. water under a deck).
			down.set( 0, - 1, 0 ).transformDirection( tiles.group.matrixWorld.clone().invert() );
			plugin.addShape( shape, down, { threshold: Infinity } );

		}

	};

	let visible = false;
	const mark = ( { entry } ) => {

		if ( entry.zone && ! entry.placing ) dirty.add( entry );

	};

	models.addEventListener( 'add', ( { entry } ) => {

		if ( entry.zone ) entry.pivot.visible = visible;
		mark( { entry } );

	} );
	models.addEventListener( 'change', mark );
	models.addEventListener( 'remove', ( { entry } ) => {

		dirty.delete( entry );
		const shape = shapes.get( entry );
		if ( shape ) {

			plugin.deleteShape( shape );
			shapes.delete( entry );

		}

	} );

	return {

		update( dt ) {

			timer -= dt;
			if ( timer > 0 || dirty.size === 0 ) return;
			timer = UPDATE_INTERVAL;
			for ( const entry of dirty ) if ( models.entries.includes( entry ) ) sync( entry );
			dirty.clear();

		},

		// Zones are only drawn in build mode; their effect on the tiles always shows.
		setVisible( value ) {

			visible = value;
			for ( const entry of models.entries ) if ( entry.zone ) entry.pivot.visible = visible;

		},

		get active() {

			return shapes.size > 0;

		},

	};

}
