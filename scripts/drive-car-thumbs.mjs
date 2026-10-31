// node scripts/drive-car-thumbs.mjs [id ...]: draws the ride picker's picture of each World Drive car
// (drive/public/cars/cars.json, see add-drive-car.mjs) into drive/public/cars/thumbs/<id>.webp:
// the car as World Drive shows it, from ahead and to its left, on nothing (see-through), so they all
// match whatever Sketchfab's own pictures were. Run it after adding a car.
//
// Needs Playwright with Chromium, as the tests do; it starts World Drive's dev server (with no Maps
// key) on TEST_VITE_PORT or 5539 and loads nothing from anywhere else.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5539;
const CARS = new URL( '../drive/public/cars/', import.meta.url );
// Drawn at twice the size it's kept at, for smooth edges.
const SIZE = [ 256, 176 ];
// Where the camera looks from: ahead (-z), to the left (-x) and above, as a direction.
const VIEW = [ - 0.85, 0.42, - 1 ];

const { chromium } = require( 'playwright' );
const listed = JSON.parse( readFileSync( new URL( 'cars.json', CARS ), 'utf8' ) );
const wanted = process.argv.slice( 2 );
const cars = wanted.length ? listed.filter( car => wanted.includes( car.id ) ) : listed;
const vite = await startVite( PORT, {}, 'vite.drive.config.js' );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
try {

	const page = await browser.newPage();
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
	await page.goto( `http://127.0.0.1:${ PORT }/` );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 60000 } );
	for ( const car of cars ) {

		const png = await page.evaluate( async ( { id, size, view } ) => {

			// three.js as the page has it: its classes from the objects window.drive holds.
			const { renderer: shown, scene: world, camera: worldCamera, models } = window.drive;
			const { loadCar, CARS: all } = await import( '/src/drive-app/cars.js' );
			const entry = ( await ( await fetch( '/cars/cars.json' ) ).json() ).find( item => item.id === id );
			const model = await loadCar( models.loader, all.find( c => c.id === id ) ?? { id, name: id }, entry );
			const renderer = new shown.constructor( { antialias: true, alpha: true, preserveDrawingBuffer: true } );
			renderer.setSize( size[ 0 ] * 2, size[ 1 ] * 2 );
			renderer.setClearColor( 0x000000, 0 );
			const scene = new world.constructor();
			for ( const light of world.children.filter( child => child.isLight ) ) {

				const copy = light.clone();
				scene.add( copy );
				if ( copy.target ) scene.add( copy.target );

			}

			scene.add( model );
			model.updateMatrixWorld( true );
			// Its bounding sphere, from every corner it has, so it fills the picture however it's shaped.
			const point = model.position.clone();
			const centre = model.position.clone();
			const corners = [];
			model.traverse( object => {

				if ( ! object.isMesh ) return;
				const positions = object.geometry.attributes.position;
				for ( let i = 0; i < positions.count; i ++ ) corners.push( point.fromBufferAttribute( positions, i ).applyMatrix4( object.matrixWorld ).clone() );

			} );
			for ( const corner of corners ) centre.add( corner );
			centre.divideScalar( corners.length );
			const radius = Math.max( ...corners.map( corner => corner.distanceTo( centre ) ) );
			const camera = new worldCamera.constructor( 28, size[ 0 ] / size[ 1 ], 0.05, 500 );
			const fit = radius / Math.sin( 14 * Math.PI / 180 ) * 0.82;
			camera.position.set( ...view ).normalize().multiplyScalar( fit ).add( centre );
			camera.lookAt( centre );
			renderer.render( scene, camera );
			const data = renderer.domElement.toDataURL( 'image/png' );
			renderer.dispose();
			return data;

		}, { id: car.id, size: SIZE, view: VIEW } );
		const file = new URL( `thumbs/${ car.id }.webp`, CARS );
		await sharp( Buffer.from( png.split( ',' )[ 1 ], 'base64' ) ).trim( { threshold: 1 } ).resize( ...SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } )
			.webp( { quality: 82, alphaQuality: 90 } ).toFile( file.pathname );
		console.log( `Drew thumbs/${ car.id }.webp` );

	}

} finally {

	await browser.close();
	vite.stop();

}
