import {
	Color,
	DirectionalLight,
	GridHelper,
	Group,
	HemisphereLight,
	MathUtils,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	PlaneGeometry,
	Vector3,
} from 'three';
import { OBJECT_FRAME, TilesRenderer } from '3d-tiles-renderer';
import {
	GLTFExtensionsPlugin,
	GoogleCloudAuthPlugin,
	ReorientationPlugin,
	TileCompressionPlugin,
	TileFlatteningPlugin,
	TilesFadePlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { SITE } from './config.js';
import { enuToLocal } from './geo.js';

export const dracoLoader = new DRACOLoader().setDecoderPath( 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/' );

export function addLights( scene ) {

	scene.background = new Color( 0xbfd9ee );
	scene.add( new HemisphereLight( 0xffffff, 0x556655, 1.5 ) );

	const sun = new DirectionalLight( 0xffffff, 2 );
	sun.position.copy( enuToLocal( - 300, - 600, 800 ) );
	scene.add( sun );

}

// Google Photorealistic 3D Tiles, streamed and recentred on the terminal.
export function createGoogleTiles( { apiKey, camera, renderer, onError } ) {

	const tiles = new TilesRenderer();
	tiles.registerPlugin( new GoogleCloudAuthPlugin( { apiToken: apiKey, autoRefreshToken: true } ) );
	tiles.registerPlugin( new GLTFExtensionsPlugin( { dracoLoader } ) );
	tiles.registerPlugin( new TileCompressionPlugin() );
	tiles.registerPlugin( new TilesFadePlugin() );
	tiles.registerPlugin( new ReorientationPlugin( {
		lat: SITE.lat * MathUtils.DEG2RAD,
		lon: SITE.lon * MathUtils.DEG2RAD,
	} ) );

	tiles.setCamera( camera );
	tiles.setResolutionFromRenderer( camera, renderer );
	tiles.addEventListener( 'load-error', onError );

	return tiles;

}

// Presses Google's mesh flat under your models, so its blobby version of a building
// doesn't poke through your detailed one. Only what sits above the model's base is
// pushed down; water and ground below it are left alone.
export class GroundFlattener {

	constructor( tiles ) {

		this.tiles = tiles;
		this.plugin = null; // registered on first use: it keeps a copy of every tile's vertices

		// Shapes must be given in the tileset's own Earth-centred frame. The scene is the
		// east-north-up frame at SITE that ReorientationPlugin moves the tiles into.
		this.sceneToTiles = tiles.ellipsoid.getObjectFrame(
			SITE.lat * MathUtils.DEG2RAD, SITE.lon * MathUtils.DEG2RAD, 0, 0, 0, 0, new Matrix4(), OBJECT_FRAME,
		);
		this.down = new Vector3( 0, - 1, 0 ).transformDirection( this.sceneToTiles );
		this.shapes = new Map();

	}

	// `geometry` is a flat shape; `matrix` places it in the scene.
	set( key, geometry, matrix ) {

		if ( ! this.plugin ) {

			this.plugin = new UploadingFlatteningPlugin();
			this.tiles.registerPlugin( this.plugin );

		}

		let shape = this.shapes.get( key );
		if ( ! shape ) {

			shape = new Mesh( geometry );
			this.shapes.set( key, shape );

		}

		_matrix.multiplyMatrices( this.sceneToTiles, matrix );
		_matrix.decompose( shape.position, shape.quaternion, shape.scale );

		if ( this.plugin.hasShape( shape ) ) this.plugin.deleteShape( shape );
		// Vertices above the shape are pressed down onto it; anything below is out of reach.
		this.plugin.addShape( shape, this.down );

	}

	remove( key ) {

		const shape = this.shapes.get( key );
		if ( ! shape ) return;
		this.plugin.deleteShape( shape );
		this.shapes.delete( key );

	}

}

// The stock plugin only flags changed vertices for re-upload when it re-flattens a tile,
// assuming it saw every tile before it was first drawn. Registered late, it doesn't.
// A collision index on the tile also has to follow the moved vertices.
class UploadingFlatteningPlugin extends TileFlatteningPlugin {

	_updateTile( tile ) {

		super._updateTile( tile );
		tile.engineData.scene.traverse( c => {

			if ( ! c.geometry ) return;
			c.geometry.attributes.position.needsUpdate = true;
			c.geometry.boundsTree?.refit(); // collision index built for driving (drive.js)

		} );

	}

}

const _matrix = new Matrix4();

// Stand-in ground and water used when there is no Google API key.
export function createPlaceholderGround() {

	const group = new Group();
	group.name = 'placeholder-ground';

	// The terminal's south edge sits about 280 m south of SITE; Burrard Inlet is beyond it.
	const shoreline = - 280;

	const land = new Mesh(
		new PlaneGeometry( 4000, 2000 ),
		new MeshStandardMaterial( { color: 0x8a8f86, roughness: 1 } ),
	);
	land.rotation.x = - Math.PI / 2;
	land.position.copy( enuToLocal( 0, shoreline + 1000, 0 ) );

	const water = new Mesh(
		new PlaneGeometry( 4000, 2000 ),
		new MeshStandardMaterial( { color: 0x2f5d7a, roughness: 0.3 } ),
	);
	water.rotation.x = - Math.PI / 2;
	water.position.copy( enuToLocal( 0, shoreline - 1000, - 2 ) );

	const grid = new GridHelper( 4000, 80, 0x444444, 0x666666 );
	grid.position.y = 0.02;
	grid.raycast = () => {};

	group.add( land, water, grid );
	return group;

}
