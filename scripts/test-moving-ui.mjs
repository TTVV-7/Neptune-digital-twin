// npm run test:moving-ui: walking and driving round the site in World Drive Build, in a real
// browser against the Vite dev server with no Google tiles; every request that isn't to the local
// server is blocked. Walking in third person, a click picks what's under it in the picture (drawn
// from behind his shoulder), and the camera doesn't go into a wall on his right. Getting out next
// to a container doesn't put him inside it, and he faces the way the vehicle did. A driven pickup
// goes under something overhead rather than up on top of it. V twice while a new pickup loads
// brings one; V while an item follows the pointer stops placing it. Right-drag looking ends with
// the last button let go, whichever it is.
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev server that's already running
// (started without a Maps key).

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5199;

let browser;
let vite;
let page;
let base;
const errors = [];

before( async () => {

	let chromium;
	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		throw new Error( 'Playwright is needed: npm i -D playwright && npx playwright install chromium' );

	}

	base = process.env.TEST_BASE;
	if ( ! base ) {

		vite = await startVite( PORT );
		base = vite.base;

	}

	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	page = await browser.newPage( { viewport: { width: 1280, height: 800 } } );
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	await page.route( '**/*', route => {

		const url = route.request().url();
		return url.startsWith( base ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

	} );
	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.player.loaded );
	await dropProjectModels( page );
	await page.evaluate( () => {

		const { models, renderer, camera } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );
		// Where each frame is drawn from.
		window.drawnFrom = camera.position.clone();
		const render = renderer.render.bind( renderer );
		renderer.render = ( scene, view ) => {

			if ( view === camera ) window.drawnFrom.copy( camera.position );
			render( scene, view );

		};

	} );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function clear() {

	await page.evaluate( () => {

		const { models, driver } = window.twin;
		if ( driver.active ) driver.stop();
		for ( const entry of [ ...models.entries ] ) models.remove( entry );

	} );

}

// Place library items from code, as the sidebar does: [ { id, east, north, heading } ].
async function place( items ) {

	return page.evaluate( async items => {

		const { models } = window.twin;
		const { itemConfig, loadLibrary } = await import( '/src/library.js' );
		const library = await loadLibrary();
		for ( const { id, east, north, heading } of items ) await models.load( itemConfig( library.find( i => i.id === id ), { east, north, heading, up: null } ) );

	}, items );

}

// Walk in third person from ( east, north ), facing `heading`, standing still.
async function walk( east, north, heading ) {

	await page.evaluate( ( { east, north, heading } ) => {

		const { controls, camera, player } = window.twin;
		controls.setMode( 'walk' );
		controls.enabled = true;
		player.setThirdPerson( true );
		controls.setPose( camera.position.clone().set( - east, 1.7, north ), heading, 0 );

	}, { east, north, heading } );
	await page.waitForTimeout( 1500 );

}

const frames = n => page.evaluate( n => new Promise( done => {

	const next = () => n -- > 0 ? requestAnimationFrame( next ) : done();
	next();

} ), n );

test( 'third person: a click picks what is under it in the picture', async () => {

	await clear();
	await place( [ { id: 'container-20-iso', east: 0, north: 8, heading: 90 } ] );
	await walk( 0, 0, 0 );
	// Points along the container's near side, `along` m in from its end on the left of the picture
	// (out past it if negative), on screen. Aimed from his eyes, 3.2 m nearer than where the frame
	// is drawn from, the ground just past that end would pick the container.
	const spot = along => page.evaluate( along => {

		const { models, camera, renderer } = window.twin;
		const entry = models.entries.find( e => e.library === 'container-20-iso' );
		const b = { min: camera.position.clone().setScalar( Infinity ), max: camera.position.clone().setScalar( - Infinity ) };
		entry.pivot.updateMatrixWorld( true );
		entry.pivot.traverse( o => {

			if ( ! o.isMesh ) return;
			o.geometry.computeBoundingBox();
			const g = o.geometry.boundingBox;
			for ( const x of [ g.min.x, g.max.x ] ) for ( const y of [ g.min.y, g.max.y ] ) for ( const z of [ g.min.z, g.max.z ] ) {

				const p = camera.position.clone().set( x, y, z ).applyMatrix4( o.matrixWorld );
				b.min.min( p );
				b.max.max( p );

			}

		} );
		const view = camera.clone();
		view.position.copy( window.drawnFrom );
		view.updateMatrixWorld();
		const y = ( b.min.y + b.max.y ) / 2;
		const ends = [ b.min.x, b.max.x ].map( x => camera.position.clone().set( x, y, b.min.z ) );
		const onScreen = p => p.clone().project( view );
		ends.sort( ( a, c ) => onScreen( a ).x - onScreen( c ).x );
		const [ left, right ] = ends;
		const p = onScreen( left.clone().addScaledVector( right.clone().sub( left ).normalize(), along ) );
		const rect = renderer.domElement.getBoundingClientRect();
		return { x: rect.left + ( p.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - p.y ) / 2 * rect.height };

	}, along );
	const click = async along => {

		const { x, y } = await spot( along );
		await page.mouse.click( x, y );
		const picked = await page.evaluate( () => window.twin.sidebar.getSelected()?.library ?? null );
		await page.evaluate( () => {

			window.twin.sidebar.deselect();
			if ( document.pointerLockElement ) document.exitPointerLock();

		} );
		await page.waitForTimeout( 300 );
		return picked;

	};
	assert.equal( await click( - 0.4 ), null, 'a click on the ground beside the container picks nothing' );
	assert.equal( await click( 0.2 ), 'container-20-iso', 'a click on the container picks it' );

} );

test( 'third person: the camera stays out of a wall on his right', async () => {

	await clear();
	// A container's long side 0.4 m to his right (east, facing north).
	await place( [ { id: 'container-20-iso', east: 0.4 + 1.22, north: 1, heading: 0 } ] );
	await walk( 0, 0, 0 );
	const { inside, at, box } = await page.evaluate( () => {

		const { models, camera } = window.twin;
		const entry = models.entries.find( e => e.library === 'container-20-iso' );
		const b = { min: camera.position.clone().setScalar( Infinity ), max: camera.position.clone().setScalar( - Infinity ) };
		entry.pivot.updateMatrixWorld( true );
		entry.pivot.traverse( o => {

			if ( ! o.isMesh ) return;
			o.geometry.computeBoundingBox();
			const g = o.geometry.boundingBox;
			for ( const x of [ g.min.x, g.max.x ] ) for ( const y of [ g.min.y, g.max.y ] ) for ( const z of [ g.min.z, g.max.z ] ) {

				const p = camera.position.clone().set( x, y, z ).applyMatrix4( o.matrixWorld );
				b.min.min( p );
				b.max.max( p );

			}

		} );
		const d = window.drawnFrom;
		const inside = d.x > b.min.x && d.x < b.max.x && d.y > b.min.y && d.y < b.max.y && d.z > b.min.z && d.z < b.max.z;
		return { inside, at: d.toArray(), box: [ b.min.toArray(), b.max.toArray() ] };

	} );
	assert.equal( inside, false, `the camera at ${ at } is outside the container ${ JSON.stringify( box ) }` );

} );

test( 'getting out next to a container: beside it, facing the way the vehicle did', async () => {

	await clear();
	// He last walked facing south; the pickup faces north, its driver's side (west) 0.5 m from a container.
	await walk( 0, - 10, 180 );
	await place( [ { id: 'pickup-truck', east: 0, north: 0, heading: 0 } ] );
	const half = await page.evaluate( () => window.twin.models.entries[ 0 ].footprint.max.x - window.twin.models.entries[ 0 ].footprint.min.x ) / 2;
	await place( [ { id: 'container-20-iso', east: - ( half + 0.5 + 1.22 ), north: 0, heading: 0 } ] );
	await page.evaluate( () => window.twin.startDriving( window.twin.models.entries.find( e => e.library === 'pickup-truck' ) ) );
	await page.waitForFunction( () => window.twin.driver.active );
	await frames( 10 );
	await page.keyboard.press( 'KeyV' );
	await page.waitForFunction( () => ! window.twin.driver.active );
	await frames( 10 );
	const result = await page.evaluate( () => {

		const { models, camera, controls, scene } = window.twin;
		const entry = models.entries.find( e => e.library === 'container-20-iso' );
		const b = { min: camera.position.clone().setScalar( Infinity ), max: camera.position.clone().setScalar( - Infinity ) };
		entry.pivot.traverse( o => {

			if ( ! o.isMesh ) return;
			o.geometry.computeBoundingBox();
			const g = o.geometry.boundingBox;
			for ( const x of [ g.min.x, g.max.x ] ) for ( const z of [ g.min.z, g.max.z ] ) {

				const p = camera.position.clone().set( x, 0, z ).applyMatrix4( o.matrixWorld );
				b.min.min( p );
				b.max.max( p );

			}

		} );
		const p = camera.position;
		let body = null;
		scene.traverse( o => {

			if ( o.name.startsWith( 'Player: ' ) && o.visible ) body = o;

		} );
		const facing = body.rotation.y - Math.PI - controls.yaw;
		return {
			inside: p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z,
			at: [ p.x, p.z ],
			turn: Math.abs( Math.atan2( Math.sin( facing ), Math.cos( facing ) ) ),
		};

	} );
	assert.equal( result.inside, false, `stepped out at ${ result.at }, not inside the container` );
	assert.ok( result.turn < 0.1, `he faces the way the vehicle did (off by ${ result.turn.toFixed( 2 ) } rad)` );

} );

test( 'a driven pickup goes under something overhead, not up onto it', async () => {

	await clear();
	await place( [ { id: 'pickup-truck', east: 30, north: 0, heading: 0 } ] );
	// A plate 2.65 to 2.95 m up over the way it drives, from 6 m to 40 m north.
	await page.evaluate( async () => {

		const { Mesh, BoxGeometry, MeshStandardMaterial } = await import( '/node_modules/.vite/deps/three.js' );
		const plate = new Mesh( new BoxGeometry( 6, 0.3, 34 ), new MeshStandardMaterial() );
		plate.position.set( - 30, 2.8, 23 );
		plate.name = 'test plate';
		window.twin.models.group.add( plate );
		plate.updateMatrixWorld();

	} );
	await page.evaluate( () => window.twin.startDriving( window.twin.models.entries.find( e => e.library === 'pickup-truck' ) ) );
	await page.waitForFunction( () => window.twin.driver.active );
	await page.evaluate( () => {

		window.highest = - Infinity;
		const watch = () => {

			if ( ! window.twin.driver.active ) return;
			window.highest = Math.max( window.highest, window.twin.driver.y );
			requestAnimationFrame( watch );

		};
		watch();

	} );
	await page.keyboard.down( 'KeyW' );
	await page.waitForFunction( () => window.twin.driver.north > 10, null, { timeout: 60000 } ).catch( () => {} );
	await page.keyboard.up( 'KeyW' );
	const { north, highest } = await page.evaluate( () => ( { north: window.twin.driver.north, highest: window.highest } ) );
	await page.evaluate( () => {

		const { models } = window.twin;
		models.group.remove( models.group.getObjectByName( 'test plate' ) );

	} );
	assert.ok( north > 10, `drove under it (to ${ north.toFixed( 1 ) } m north)` );
	assert.ok( highest < 1, `stayed on the ground (highest ${ highest.toFixed( 2 ) } m)` );

} );

test( 'V twice while a new pickup loads brings one; V while placing stops placing', async () => {

	await clear();
	await walk( 0, 0, 0 );
	await page.evaluate( () => Promise.all( [ window.twin.startDriving(), window.twin.startDriving() ] ) );
	assert.equal( await page.evaluate( () => window.twin.models.entries.filter( e => e.library === 'pickup-truck' ).length ), 1, 'one pickup' );
	await page.evaluate( () => window.twin.driver.stop() );

	await page.evaluate( () => {

		if ( ! window.twin.sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();

	} );
	await page.click( '#library .card[data-item="generator-20kva"]' );
	await page.mouse.move( 760, 420 );
	await page.waitForFunction( () => document.getElementById( 'library' ).classList.contains( 'placing' ) );
	await page.mouse.move( 760, 500 );
	await page.evaluate( () => window.twin.startDriving() );
	assert.equal( await page.evaluate( () => window.twin.driver.active ), true, 'driving' );
	assert.equal( await page.evaluate( () => document.getElementById( 'library' ).classList.contains( 'placing' ) ), false, 'not placing any more' );
	assert.equal( await page.evaluate( () => window.twin.models.entries.some( e => e.placing ) ), false, 'no item left following the pointer' );
	await page.evaluate( () => {

		window.twin.driver.stop();
		document.getElementById( 'library-toggle' ).click();

	} );

} );

test( 'right-drag looking ends when the last button is let go, whichever it is', async () => {

	await clear();
	await walk( 0, 0, 0 );
	await page.mouse.move( 900, 300 );
	await page.mouse.down( { button: 'right' } );
	await page.mouse.move( 920, 300 );
	assert.equal( await page.evaluate( () => window.twin.controls.dragLooking ), true, 'looking round' );
	await page.mouse.down( { button: 'left' } );
	await page.mouse.up( { button: 'right' } );
	await page.mouse.up( { button: 'left' } );
	await page.evaluate( () => document.pointerLockElement && document.exitPointerLock() );
	assert.equal( await page.evaluate( () => window.twin.controls.dragLooking ), false, 'not looking round any more' );
	const yaw = await page.evaluate( () => window.twin.controls.yaw );
	await page.mouse.move( 1100, 300, { steps: 5 } );
	assert.equal( await page.evaluate( () => window.twin.controls.yaw ), yaw, 'moving the mouse leaves the view alone' );
	assert.deepEqual( errors, [] );

} );
