import {
	Color,
	DirectionalLight,
	GridHelper,
	Group,
	HemisphereLight,
	MathUtils,
	Mesh,
	MeshStandardMaterial,
	PlaneGeometry,
} from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import {
	GLTFExtensionsPlugin,
	GoogleCloudAuthPlugin,
	ReorientationPlugin,
	TileCompressionPlugin,
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

	// The fast bounding-volume raycast can miss Google geometry that pokes outside its tile's
	// bounds, which would let you fall through the ground or walk through walls.
	tiles.accelerateRaycast = false;

	tiles.setCamera( camera );
	tiles.setResolutionFromRenderer( camera, renderer );
	tiles.addEventListener( 'load-error', onError );

	return tiles;

}

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
