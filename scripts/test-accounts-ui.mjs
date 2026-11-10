// npm run test:accounts-ui: signs in, saves, opens, autosaves and shares a layout in a real
// browser, against `wrangler dev` and the Vite dev server on this machine, and checks that the
// premium items place as usual while premium isn't set up. Google's sign-in script is replaced by
// a stand-in that signs in with a test token, and every request that isn't to the local server is
// blocked, so nothing reaches Google or Cloudflare.
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// TEST_VITE_PORT and TEST_WORKER_PORT pick the ports; TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { CLIENT_ID, GOOGLE_STUB, dropProjectModels, makeKey, makeToken, serveKeys, startVite, startWorker } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const VITE_PORT = Number( process.env.TEST_VITE_PORT ) || 5199;
const WORKER_PORT = Number( process.env.TEST_WORKER_PORT ) || 8788;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ VITE_PORT }`;
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const MAPS_KEY = 'test-maps-key-not-real';
const LAYOUT_KEY = 'neptune-twin.layout.Neptune Terminals';
const PASSCODE = 'admin passcode for tests';

let chromium;
let browser;
let worker;
let keys;
let vite;
let googleKey;
let page;
let layoutId;
let shareLink;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		throw new Error( 'Playwright is needed: npm i -D playwright && npx playwright install chromium' );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	googleKey = await makeKey( 'ui-key' );
	keys = await serveKeys( [ googleKey.jwk ] );
	worker = await startWorker( { port: WORKER_PORT, vars: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_JWKS_URL: keys.url, GOOGLE_MAPS_API_KEY: MAPS_KEY, ALLOWED_EMAILS: '', ALLOWED_DOMAINS: '', PLACEMENT_KEY: PASSCODE } } );
	vite = await startVite( VITE_PORT, { TWIN_API: worker.base } );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );

} );

after( async () => {

	await browser?.close();
	vite?.stop();
	worker?.stop();
	keys?.close();

} );

// What the page asked with window.confirm; every question is answered yes.
const asked = [];
// Requests the pages tried to make to anywhere but the local server.
const blocked = [];

test( 'signed out, the library offers Google sign-in', async () => {

	page = await newPage();
	page.on( 'dialog', d => {

		asked.push( d.message() );
		d.accept();

	} );
	await openApp( page );
	await placeItems( page, [ 'jersey-barrier', 'container-20', 'rolloff-20' ] );
	await page.keyboard.press( 'KeyL' );
	await page.locator( '.cloud-account .stub-google' ).waitFor();
	assert.match( await page.locator( '.cloud-account .signed-out .note' ).textContent(), /Sign in to keep layouts/ );
	await shot( page.locator( '#library' ), 'signed-out' );

} );

test( 'with premium not set up, the Pro equipment places like everything else', async () => {

	// This Worker has no Stripe settings (scripts/test-premium-ui.mjs has them).
	assert.deepEqual( ( await api( page, 'GET', '/api/config' ) ).premium, { enabled: false } );
	assert.equal( await page.locator( '#library .card.locked' ).count(), 0 );
	assert.equal( await page.locator( '#library .card .pro:visible' ).count(), 0 );
	await page.locator( '#library .card', { hasText: 'Scissor lift' } ).click();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.placing && e.library === 'scissor-lift-32ft' ) );
	assert.equal( await page.locator( '.premium-dialog' ).count(), 0 );
	await page.keyboard.press( 'Escape' );
	await page.waitForFunction( () => window.twin.models.entries.length === 3 );

} );

test( 'sign in and save what\'s placed as a new layout', async () => {

	await page.evaluate( token => window.testCredential = token, await makeToken( googleKey ) );
	await page.locator( '.stub-google' ).click();
	await page.locator( '.cloud-account .who', { hasText: 'Alice' } ).waitFor();
	await page.locator( '.cloud-status', { hasText: 'only in this browser' } ).waitFor();
	// Started without Google's tiles, and the account comes with a key.
	await page.locator( '.cloud-account' ).getByRole( 'button', { name: 'Reload to show them' } ).waitFor();

	await page.getByRole( 'button', { name: 'Layouts' } ).click();
	const dialog = page.locator( '.cloud-dialog' );
	await dialog.locator( '.empty', { hasText: 'Nothing saved yet' } ).waitFor();
	await dialog.getByLabel( 'Save what\'s placed now as a new layout' ).fill( 'Laydown A' );
	await dialog.getByLabel( 'Save what\'s placed now as a new layout' ).press( 'Enter' );
	await dialog.locator( 'li.current', { hasText: 'Laydown A' } ).waitFor();
	assert.match( await dialog.locator( '.message' ).textContent(), /Saved "Laydown A"/ );

	const layouts = await api( page, 'GET', '/api/layouts?site=Neptune%20Terminals' );
	assert.deepEqual( layouts.layouts.map( l => l.name ), [ 'Laydown A' ] );
	layoutId = layouts.layouts[ 0 ].id;
	assert.equal( ( await api( page, 'GET', `/api/layouts/${ layoutId }` ) ).data.items.length, 3 );
	await shot( dialog, 'dialog-saved' );

} );

test( 'keys in the dialog stay in the dialog, and Esc closes it', async () => {

	const dialog = page.locator( '.cloud-dialog' );
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries[ 0 ] ) );
	await dialog.getByRole( 'button', { name: 'Open Laydown A' } ).focus();
	for ( const key of [ 'Delete', 'KeyR', 'KeyL', 'KeyW' ] ) await page.keyboard.press( key );
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 3, 'Delete in the dialog removed an item' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.isOpen() ), true, 'L in the dialog closed the library' );
	assert.equal( await page.evaluate( () => window.twin.models.entries[ 0 ].state.heading ), 0, 'R in the dialog turned an item' );

	await page.keyboard.press( 'Escape' );
	await dialog.waitFor( { state: 'hidden' } );
	assert.equal( await page.evaluate( () => document.activeElement.textContent ), 'Layouts' );
	await page.evaluate( () => window.twin.sidebar.deselect() );

} );

test( 'after a reload you\'re still signed in and still saving to the layout', async () => {

	await openApp( page );
	await page.keyboard.press( 'KeyL' );
	await page.locator( '.cloud-account .who', { hasText: 'Alice' } ).waitFor();
	await page.locator( '.cloud-status', { hasText: '"Laydown A": Saved' } ).waitFor();
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 3 );
	// Signed in, the Worker hands over the Maps key (here a fake one; ?prompt kept it unused).
	assert.equal( await page.evaluate( () => import( '/src/cloud.js' ).then( m => m.accountMapsKey() ) ), MAPS_KEY );

} );

test( 'on a browser with nothing saved, opening the layout brings it back', async () => {

	// As on another computer: nothing placed, no current layout, but signed in.
	await page.evaluate( () => localStorage.clear() );
	await openApp( page );
	await page.keyboard.press( 'KeyL' );
	await page.locator( '.cloud-status', { hasText: 'only in this browser' } ).waitFor();
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 0 );

	await page.getByRole( 'button', { name: 'Layouts' } ).click();
	await page.getByRole( 'button', { name: 'Open Laydown A' } ).click();
	await page.locator( '.cloud-dialog' ).waitFor( { state: 'hidden' } );
	await page.waitForFunction( () => window.twin.models.entries.length === 3 );
	await page.locator( '.cloud-status', { hasText: '"Laydown A": Saved' } ).waitFor();
	assert.deepEqual( asked, [], 'asked before opening with nothing placed' );
	await shot( page.locator( '#library' ), 'signed-in' );

} );

test( 'moving an item saves it to the account', async () => {

	await moveItem( page, 'container-20', 5 );
	await page.locator( '.cloud-status', { hasText: 'Saving...' } ).waitFor();
	await page.locator( '.cloud-status', { hasText: '"Laydown A": Saved' } ).waitFor( { timeout: 15000 } );
	const saved = await api( page, 'GET', `/api/layouts/${ layoutId }` );
	assert.equal( saved.data.items.length, 3 );
	assert.equal( saved.data.items.find( i => i.library === 'container-20' ).east, 23 );

} );

test( 'a change saved elsewhere isn\'t overwritten without asking', async () => {

	const elsewhere = await api( page, 'GET', `/api/layouts/${ layoutId }` );
	await api( page, 'PUT', `/api/layouts/${ layoutId }`, { data: { ...elsewhere.data, items: elsewhere.data.items.slice( 0, 1 ) } } );
	await moveItem( page, 'rolloff-20', 2 );
	await page.locator( '.cloud-status', { hasText: 'changed somewhere else' } ).waitFor( { timeout: 15000 } );
	assert.equal( ( await api( page, 'GET', `/api/layouts/${ layoutId }` ) ).data.items.length, 1 );

	await page.locator( '.cloud-status' ).getByRole( 'button', { name: 'Keep mine' } ).click();
	await page.locator( '.cloud-status', { hasText: '"Laydown A": Saved' } ).waitFor();
	assert.equal( ( await api( page, 'GET', `/api/layouts/${ layoutId }` ) ).data.items.length, 3 );

} );

test( 'share a link and copy it', async () => {

	await page.getByRole( 'button', { name: 'Layouts' } ).click();
	const dialog = page.locator( '.cloud-dialog' );
	await dialog.getByRole( 'button', { name: 'Share Laydown A by link' } ).click();
	const input = dialog.getByLabel( 'Share link for Laydown A' );
	await input.waitFor();
	shareLink = await input.inputValue();
	assert.match( shareLink, /\?view=[A-Za-z0-9_-]{22}$/ );
	assert.equal( await page.evaluate( () => navigator.clipboard.readText() ), shareLink );
	assert.match( await dialog.locator( '.message' ).textContent(), /copied/ );
	await shot( dialog, 'dialog-shared' );
	await page.keyboard.press( 'Escape' );

} );

test( 'the link opens the layout read-only, without touching the viewer\'s own', async () => {

	// A layout can name models anywhere; a shared one may only load them from this site.
	const saved = await api( page, 'GET', `/api/layouts/${ layoutId }` );
	const tracker = { name: 'Tracker', url: 'https://tracker.example/pixel.glb', east: 0, north: 0, up: null, heading: 0, scale: 1 };
	await api( page, 'PUT', `/api/layouts/${ layoutId }`, { data: { ...saved.data, items: [ ...saved.data.items, tracker ] } } );

	const viewer = await newPage();
	await openApp( viewer );
	await placeItems( viewer, [ 'pallet' ] );
	const own = await localLayout( viewer );
	assert.equal( own.items.length, 1 );

	await openApp( viewer, `${ shareLink }&prompt` );
	const banner = viewer.locator( '.cloud-banner' );
	await banner.waitFor();
	assert.equal( await banner.locator( 'span' ).textContent(), 'Viewing "Laydown A", shared by Alice. Changes aren\'t saved.' );
	await viewer.waitForFunction( () => window.twin.models.entries.length === 3 );
	assert.match( await viewer.locator( '#banner' ).textContent(), /Left out 1 item of the shared layout/ );
	assert.ok( ! blocked.some( url => url.includes( 'tracker.example' ) ), 'the shared layout fetched a model from another site' );
	assert.equal( await viewer.evaluate( () => import( '/src/cloud.js' ).then( m => m.accountMapsKey() ) ), MAPS_KEY );

	await moveItem( viewer, 'container-20', 10 );
	await viewer.waitForTimeout( 1000 );
	assert.deepEqual( await localLayout( viewer ), own, 'viewing changed the viewer\'s own layout' );
	await shot( viewer, 'shared-view' );

	// Save a copy (signed out): it becomes their layout in this browser, after asking.
	const questions = [];
	viewer.on( 'dialog', d => {

		questions.push( d.message() );
		d.accept();

	} );
	await banner.getByRole( 'button', { name: 'Save a copy' } ).click();
	await banner.waitFor( { state: 'hidden' } );
	assert.match( questions[ 0 ], /replaces the layout saved in this browser \(1 item\)/ );
	assert.equal( new URL( viewer.url() ).searchParams.has( 'view' ), false );
	await viewer.waitForFunction( key => JSON.parse( localStorage.getItem( key ) ).items.length === 3, LAYOUT_KEY );
	await viewer.context().close();

} );

test( 'stop sharing turns the link off', async () => {

	await page.getByRole( 'button', { name: 'Layouts' } ).click();
	const dialog = page.locator( '.cloud-dialog' );
	await dialog.getByRole( 'button', { name: 'Stop sharing Laydown A' } ).click();
	await dialog.getByRole( 'button', { name: 'Share Laydown A by link' } ).waitFor();
	const token = new URL( shareLink ).searchParams.get( 'view' );
	assert.equal( ( await page.request.get( `${ BASE }/api/shared/${ token }` ) ).status(), 404 );
	await page.keyboard.press( 'Escape' );

} );

test( 'sign out keeps the layout in this browser', async () => {

	await page.locator( '.cloud-account' ).getByRole( 'button', { name: 'Sign out' } ).click();
	await page.locator( '.cloud-account .stub-google' ).waitFor();
	assert.equal( ( await page.request.get( `${ BASE }/api/me` ) ).status(), 401 );
	assert.equal( ( await localLayout( page ) ).items.length, 3 );
	assert.equal( await page.evaluate( () => localStorage.getItem( 'neptune-twin.cloud.Neptune Terminals' ) ), null );
	await page.context().close();

} );

test( 'the admin saves an item for everyone with the passcode; everyone sees it; removed, it\'s gone', async () => {

	const admin = await newPage();
	const answers = [ 'not it', PASSCODE ];
	admin.on( 'dialog', d => d.accept( answers.shift() ) );
	await openApp( admin );
	await admin.evaluate( () => localStorage.removeItem( 'neptune-twin.layout.Neptune Terminals' ) );
	await placeItems( admin, [ 'jersey-barrier' ] );
	const save = async label => {

		await admin.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.library === 'jersey-barrier' ) ) );
		await admin.locator( '.lil-gui .lil-controller.lil-function:visible', { hasText: label } ).click();
		await admin.waitForFunction( () => document.querySelector( '.toast' ) );
		const text = await admin.evaluate( () => [ ...document.querySelectorAll( '.toast' ) ].pop().textContent );
		await admin.evaluate( () => document.querySelectorAll( '.toast' ).forEach( t => t.remove() ) );
		return text;

	};
	const listed = () => admin.evaluate( async () => ( await ( await fetch( '/api/shared-items' ) ).json() ).items );

	assert.match( await save( 'Save for everyone' ), /Wrong passcode/ );
	assert.deepEqual( await listed(), [] );
	assert.match( await save( 'Save for everyone' ), /^Saved for everyone: / );
	const [ item ] = await listed();
	assert.equal( item.config.library, 'jersey-barrier' );
	// Out of the admin's own layout, so it isn't there twice after a reload.
	await admin.waitForFunction( () => JSON.parse( localStorage.getItem( 'neptune-twin.layout.Neptune Terminals' ) )?.items.length === 0 );

	// Someone else sees it, as part of the site rather than their own layout.
	const viewer = await newPage();
	await openApp( viewer );
	await viewer.waitForFunction( () => window.twin.models.entries.some( e => e.sharedId && e.library === 'jersey-barrier' ), null, { timeout: 30000 } );
	assert.deepEqual( await viewer.evaluate( () => window.twin.layout.getData().items ), [] );

	// Moved and saved again, then removed for everyone.
	await moveItem( admin, 'jersey-barrier', 5 );
	assert.match( await save( 'Save for everyone' ), /as it is now/ );
	assert.equal( ( await listed() )[ 0 ].config.east, item.config.east + 5 );
	assert.match( await save( 'Remove for everyone' ), /^Removed for everyone: / );
	assert.deepEqual( await listed(), [] );
	await viewer.reload();
	await viewer.locator( '#skip' ).click();
	await viewer.waitForFunction( () => window.twin?.sidebar && ! window.twin.layout.loading, null, { timeout: 60000 } );
	await viewer.waitForTimeout( 1500 );
	assert.equal( await viewer.evaluate( () => window.twin.models.entries.some( e => e.library === 'jersey-barrier' ) ), false );
	await admin.context().close();
	await viewer.context().close();

} );

test( 'the admin moves and adds B2D2 repair areas and saves them for everyone; put back, they\'re as the drawing has them', async () => {

	const admin = await newPage();
	const answers = [ PASSCODE ];
	admin.on( 'dialog', d => d.type() === 'prompt' && d.accept( answers.shift() ) );
	await openApp( admin, undefined, { keepProjectModels: true } );
	await admin.waitForFunction( () => window.twin.repairAreas?.areas && window.twin.models.entries.some( e => e.url?.endsWith( 'b2d2-repair.glb' ) && ! e.placing ), null, { timeout: 60000 } );
	await admin.evaluate( () => window.twin.views.go( 'C31' ) );
	await admin.waitForFunction( () => ! window.twin.views.gliding );
	await admin.locator( '#views .edit-areas' ).click();
	await admin.evaluate( () => window.twin.repairAreas.ready() );
	const area = id => admin.evaluate( id => window.twin.repairAreas.areas().find( a => a.id === id ), id );

	// A click on the nearest area in view picks it: not the model, and not the mouse captured.
	const target = await admin.evaluate( () => {

		const { models, camera, renderer } = window.twin;
		const found = [];
		models.group.traverse( node => {

			if ( ! node.userData.xraySolid || ! node.userData.id ) return;
			const mesh = node.children.find( o => o.isMesh );
			mesh.geometry.computeBoundingBox();
			const at = mesh.localToWorld( mesh.geometry.boundingBox.getCenter( mesh.position.clone() ) );
			const distance = at.distanceTo( camera.position );
			at.project( camera );
			const rect = renderer.domElement.getBoundingClientRect();
			if ( at.z < 1 && Math.abs( at.x ) < 0.5 && Math.abs( at.y ) < 0.5 ) found.push( { id: node.userData.id, distance, x: rect.left + ( at.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - at.y ) / 2 * rect.height } );

		} );
		return found.sort( ( a, b ) => a.distance - b.distance )[ 0 ];

	} );
	assert.ok( target, 'an area in view' );
	await admin.mouse.click( target.x, target.y );
	assert.match( await admin.locator( '#area-editor .what' ).textContent(), /C31 gallery/ );
	assert.equal( await admin.evaluate( () => !! document.pointerLockElement ), false );
	const drawn = await area( target.id );

	// Dragged along its face, then nudged and turned.
	await admin.mouse.move( target.x, target.y );
	await admin.mouse.down();
	await admin.mouse.move( target.x + 60, target.y - 20, { steps: 8 } );
	await admin.mouse.up();
	const dragged = await area( target.id );
	assert.ok( dragged.dirty && dragged.changed );
	assert.notDeepEqual( dragged.pts, drawn.pts );
	// Still on its face: the same normal, every corner the same distance along it.
	assert.deepEqual( dragged.n, drawn.n );
	const along = a => a.pts.map( p => p.reduce( ( s, v, i ) => s + v * a.n[ i ], 0 ) );
	along( dragged ).forEach( ( d, i ) => assert.ok( Math.abs( d - along( drawn )[ i ] ) < 1e-3 ) );
	await admin.locator( '#area-editor [data-move=up]' ).click();
	await admin.locator( '#area-editor [data-turn="1"]' ).click();
	await admin.locator( '#area-editor .undo' ).click();
	const moved = await area( target.id );
	assert.ok( Math.abs( moved.pts[ 0 ][ 1 ] - dragged.pts[ 0 ][ 1 ] - 0.05 ) < 1e-6, 'up 5 cm' );
	assert.equal( await admin.locator( '#area-editor .save' ).textContent(), 'Save for everyone (1)' );

	const saved = () => admin.evaluate( async () => ( await ( await fetch( '/api/area-edits/b2d2-repair' ) ).json() ).edits );
	await admin.locator( '#area-editor .save' ).click();
	await admin.waitForFunction( () => [ ...document.querySelectorAll( '.toast' ) ].some( t => /^Saved for everyone: 1 change/.test( t.textContent ) ) );
	const [ edit ] = await saved();
	assert.equal( edit.id, target.id );
	assert.deepEqual( edit.pts, moved.pts );

	// Someone else sees it where the admin put it.
	const viewer = await newPage();
	await openApp( viewer, undefined, { keepProjectModels: true } );
	await viewer.waitForFunction( id => window.twin.repairAreas?.areas().find( a => a.id === id )?.changed, target.id, { timeout: 60000 } );
	assert.deepEqual( ( await viewer.evaluate( id => window.twin.repairAreas.areas().find( a => a.id === id ), target.id ) ).pts, moved.pts );
	assert.equal( await viewer.locator( '#area-editor' ).isVisible(), false );

	// Back to the drawing, saved: gone from the server.
	await admin.locator( '#area-editor .drawing' ).click();
	assert.deepEqual( ( await area( target.id ) ).pts, drawn.pts );
	await admin.evaluate( () => document.querySelectorAll( '.toast' ).forEach( t => t.remove() ) );
	await admin.locator( '#area-editor .save' ).click();
	await admin.waitForFunction( () => [ ...document.querySelectorAll( '.toast' ) ].some( t => /^Saved for everyone: 1 change/.test( t.textContent ) ) );
	assert.deepEqual( await saved(), [] );

	// A new area: a box dragged on the concrete in the middle of the view, dated, saved.
	await admin.locator( '#area-editor .add' ).click();
	await admin.waitForFunction( () => window.twin.repairAreas.drawing );
	const spot = await admin.evaluate( () => {

		// Somewhere on the concrete near the middle of the screen, clear of the panels.
		const { models, camera, renderer } = window.twin;
		const rect = renderer.domElement.getBoundingClientRect();
		const ray = new camera.position.constructor();
		for ( const [ x, y ] of [ [ 0.5, 0.8 ], [ 0.55, 0.75 ], [ 0.45, 0.85 ], [ 0.6, 0.6 ] ] ) {

			const raycaster = new ( models.raycaster.constructor )();
			raycaster.setFromCamera( { x: x * 2 - 1, y: - ( y * 2 - 1 ) }, camera );
			const hit = raycaster.intersectObject( models.group, true ).find( h => /gallery|pit|tunnel/i.test( h.object.name ) );
			if ( hit ) return { x: rect.left + x * rect.width, y: rect.top + y * rect.height };

		}

		return null;

	} );
	assert.ok( spot, 'concrete in view to draw on' );
	// Messages over the view would take the press.
	await admin.evaluate( () => document.querySelectorAll( '.toast' ).forEach( t => t.remove() ) );
	await admin.mouse.move( spot.x - 40, spot.y - 20 );
	await admin.mouse.down();
	await admin.mouse.move( spot.x + 40, spot.y + 20, { steps: 6 } );
	await admin.mouse.up();
	const made = ( await admin.evaluate( () => window.twin.repairAreas.areas() ) ).filter( a => a.added );
	assert.equal( made.length, 1 );
	assert.equal( made[ 0 ].pts.length, 4 );
	assert.ok( made[ 0 ].area > 0.01 && made[ 0 ].grid.startsWith( 'Grid ' ), JSON.stringify( made[ 0 ] ) );
	// Numbered, and on to the next stage, on a day of its own.
	await admin.locator( '#area-editor [data-field=no]' ).fill( 'C31-01' );
	await admin.locator( '#area-editor [data-field=no]' ).press( 'Enter' );
	await admin.locator( '#area-editor [data-field=status]' ).selectOption( 'Sandblasted' );
	assert.equal( await admin.locator( '#area-editor .date span' ).textContent(), 'Sandblasted' );
	await admin.locator( '#area-editor [data-field=date]' ).fill( '2026-11-09' );
	await admin.locator( '#area-editor [data-field=date]' ).press( 'Tab' );
	await admin.evaluate( () => document.querySelectorAll( '.toast' ).forEach( t => t.remove() ) );
	await admin.locator( '#area-editor .save' ).click();
	await admin.waitForFunction( () => [ ...document.querySelectorAll( '.toast' ) ].some( t => /^Saved for everyone: 1 change/.test( t.textContent ) ) );
	const [ added ] = await saved();
	assert.equal( added.id, made[ 0 ].id );
	assert.equal( added.added, true );
	assert.equal( added.no, 'C31-01' );
	assert.equal( added.f.status, 'Sandblasted' );
	assert.equal( added.f.sandblasted, '2026-11-09' );
	await viewer.reload();
	await viewer.locator( '#skip' ).click();
	await viewer.waitForFunction( id => window.twin.repairAreas?.areas().some( a => a.id === id ), added.id, { timeout: 60000 } );
	// Drawn at its stage, with its number floating on it.
	const drawn3d = await viewer.evaluate( id => {

		let node;
		window.twin.models.group.traverse( o => {

			if ( o.userData.id === id ) node = o;

		} );
		return { materials: node.children.filter( o => o.isMesh ).map( o => o.material.name ), numbers: node.children.filter( o => o.isSprite ).length, no: node.userData.no };

	}, added.id );
	assert.deepEqual( drawn3d, { materials: [ 'Sandblasted concrete', 'Sandblasted rim', 'Sandblasted rebar' ], numbers: 1, no: 'C31-01' } );
	await shot( admin, 'area-editor' );

	// A photo of it: kept on the site at the stage the panel is at, for everyone to see.
	const picture = await sharp( { create: { width: 1600, height: 1200, channels: 3, background: '#8a6a4a' } } ).jpeg().toBuffer();
	await admin.evaluate( () => document.querySelectorAll( '.toast' ).forEach( t => t.remove() ) );
	await admin.locator( '#area-editor .photos input[type=file]' ).setInputFiles( { name: 'panel.jpg', mimeType: 'image/jpeg', buffer: picture } );
	await admin.waitForFunction( () => [ ...document.querySelectorAll( '.toast' ) ].some( t => /^1 photo added/.test( t.textContent ) ), null, { timeout: 60000 } );
	const shots = () => admin.evaluate( async () => ( await ( await fetch( '/api/area-photos/b2d2-repair' ) ).json() ).photos );
	const [ shot1 ] = await shots();
	assert.deepEqual( [ shot1.area, shot1.stage, shot1.width, shot1.height, shot1.size ], [ added.id, 'Sandblasted', 1600, 1200, picture.length ] );
	await admin.locator( '#area-editor .photos .strip button' ).click();
	await admin.waitForFunction( () => document.querySelector( '#area-photo img' )?.naturalWidth === 1600 );
	await admin.keyboard.press( 'Escape' );
	assert.equal( await admin.locator( '#area-photo' ).isVisible(), false );
	assert.match( await admin.locator( '#area-editor .what' ).textContent(), /C31-01/, 'the area is still picked' );

	// Deleted, it's gone for everyone, its photo with it.
	admin.on( 'dialog', d => d.type() === 'confirm' && d.accept() );
	await admin.locator( '#area-editor .delete' ).click();
	await admin.evaluate( () => document.querySelectorAll( '.toast' ).forEach( t => t.remove() ) );
	await admin.locator( '#area-editor .save' ).click();
	await admin.waitForFunction( () => [ ...document.querySelectorAll( '.toast' ) ].some( t => /^Saved for everyone: 1 change/.test( t.textContent ) ) );
	assert.deepEqual( await saved(), [] );
	await admin.waitForFunction( async () => ( await ( await fetch( '/api/area-photos/b2d2-repair' ) ).json() ).photos.length === 0 );
	await admin.locator( '#area-editor .done' ).click();
	assert.equal( await admin.locator( '#area-editor' ).isVisible(), false );
	await admin.context().close();
	await viewer.context().close();

} );

test( 'the timeline plays the B2D2 repairs back: no area before its day, each at the stage it had reached, and as now again when editing starts', async () => {

	const page = await newPage();
	await openApp( page, undefined, { keepProjectModels: true } );
	await page.waitForFunction( () => window.twin.repairTimeline && window.twin.models.entries.some( e => e.url?.endsWith( 'b2d2-repair.glb' ) && ! e.placing ), null, { timeout: 60000 } );
	await page.evaluate( () => window.twin.repairAreas.ready() );
	// The areas drawn in the model, and what the bar says of them.
	const drawn = () => page.evaluate( () => {

		const ids = new Set();
		window.twin.models.group.traverse( node => node.userData.xraySolid && node.userData.id && ids.add( node.userData.id ) );
		return ids.size;

	} );
	const counts = () => page.evaluate( () => Object.fromEntries( window.twin.repairAreas.timeline.summary().filter( row => row.count ).map( row => [ row.stage, row.count ] ) ) );
	const label = () => page.locator( '#repair-timeline .day' ).textContent();
	// The slider put on a day (its last stop is now), as dragging it does.
	const to = async day => {

		const i = await page.evaluate( day => day ? window.twin.repairTimeline.days.indexOf( day ) : window.twin.repairTimeline.days.length, day );
		assert.ok( i >= 0, `${ day } is on the slider` );
		await page.locator( '#repair-timeline .days' ).fill( String( i ) );
		await page.waitForFunction( day => window.twin.repairAreas.timeline.day === day, day );

	};
	const areas = await page.evaluate( () => window.twin.repairAreas.areas() );
	const total = await drawn();
	assert.equal( total, areas.length );
	// The day each was chipped: a span of days is its last.
	const chipped = a => a.f.chipped.replace( /^(\d{4}-\d{2}-)\d{2}\/(\d{2})$/, '$1$2' );
	const first = areas.map( chipped ).sort()[ 0 ];
	assert.equal( first, '2026-11-02' );

	// One area taken on two stages, not saved: sandblasted on the 6th, epoxy coated today.
	const taken = areas.find( a => chipped( a ) === first );
	await page.locator( '#views .edit-areas' ).click();
	await page.evaluate( id => window.twin.repairAreas.select( id ), taken.id );
	await page.locator( '#area-editor [data-field=status]' ).selectOption( 'Sandblasted' );
	await page.locator( '#area-editor [data-field=date]' ).fill( '2026-11-06' );
	await page.locator( '#area-editor [data-field=date]' ).press( 'Enter' );
	await page.locator( '#area-editor [data-field=status]' ).selectOption( 'Shotcreted' );
	// Put back a stage, it loses the later stage's day; on again, it reached that one today.
	await page.locator( '#area-editor [data-field=status]' ).selectOption( 'Epoxy coated' );
	const today = await page.evaluate( () => {

		const d = new Date();
		return `${ d.getFullYear() }-${ String( d.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( d.getDate() ).padStart( 2, '0' ) }`;

	} );
	const { f } = await page.evaluate( id => window.twin.repairAreas.areas().find( a => a.id === id ), taken.id );
	assert.deepEqual( { chipped: f.chipped, sandblasted: f.sandblasted, epoxy: f.epoxy, shotcreted: f.shotcreted }, { chipped: taken.f.chipped, sandblasted: '2026-11-06', epoxy: today, shotcreted: undefined } );

	// Opened, the editor stops and it's at now; the day before the first chipping there's no area.
	await page.locator( '#views .timeline-toggle' ).click();
	await page.locator( '#repair-timeline' ).waitFor();
	assert.equal( await page.locator( '#area-editor' ).isVisible(), false );
	assert.match( await label(), / · now$/ );
	assert.deepEqual( await counts(), { Chipped: total - 1, 'Epoxy coated': 1 } );
	await to( '2026-11-01' );
	assert.equal( await drawn(), 0 );
	assert.equal( await page.locator( '#repair-timeline .counts' ).textContent(), 'Nothing chipped yet' );
	assert.match( await label(), /Nov 1, 2026$/ );
	// Then those chipped by the end of each day, the one taken on at the stage it had reached.
	const by = day => areas.filter( a => chipped( a ) <= day ).length;
	assert.ok( by( '2026-11-02' ) > 0 && by( '2026-11-02' ) < by( '2026-11-04' ) && by( '2026-11-04' ) < total );
	await to( '2026-11-02' );
	assert.equal( await drawn(), by( '2026-11-02' ) );
	assert.deepEqual( await counts(), { Chipped: by( '2026-11-02' ) } );
	await to( '2026-11-04' );
	assert.equal( await drawn(), by( '2026-11-04' ) );
	await to( '2026-11-06' );
	assert.deepEqual( await counts(), { Chipped: by( '2026-11-06' ) - 1, Sandblasted: 1 } );
	assert.match( await page.locator( '#repair-timeline .counts' ).textContent(), /Sandblasted 1 · \d+\.\d m²/ );

	// Played from the end, it starts over and runs to now.
	await to( null );
	assert.equal( await drawn(), total );
	await page.locator( '#repair-timeline .speed' ).selectOption( { label: 'Fast' } );
	await page.locator( '#repair-timeline .play' ).click();
	await page.waitForFunction( () => window.twin.repairAreas.timeline.day !== null );
	assert.equal( await page.locator( '#repair-timeline .play' ).textContent(), '❚❚' );
	await page.waitForFunction( () => window.twin.repairAreas.timeline.day === null && document.querySelector( '#repair-timeline .play' ).textContent === '▶', null, { timeout: 30000 } );
	assert.deepEqual( await counts(), { Chipped: total - 1, 'Epoxy coated': 1 } );

	// Looking back, then editing: the bar closes and the areas are as they are now.
	await to( '2026-11-02' );
	await page.locator( '#views .edit-areas' ).click();
	assert.equal( await page.locator( '#repair-timeline' ).isVisible(), false );
	assert.equal( await page.evaluate( () => window.twin.repairAreas.timeline.day ), null );
	assert.equal( await drawn(), total );
	// So does editing the model, and × on the bar.
	await page.locator( '#views .timeline-toggle' ).click();
	await to( '2026-11-02' );
	await page.locator( '#views .edit-model' ).click();
	assert.equal( await page.locator( '#repair-timeline' ).isVisible(), false );
	assert.equal( await drawn(), total );
	await page.locator( '#views .timeline-toggle' ).click();
	assert.equal( await page.locator( '#model-editor' ).isVisible(), false );
	await to( '2026-11-01' );
	await page.locator( '#repair-timeline .close' ).click();
	assert.equal( await page.locator( '#repair-timeline' ).isVisible(), false );
	assert.equal( await drawn(), total );
	await page.context().close();

} );

test( 'the admin adds a beam to the B2D2 model and paints a wall, for everyone; removed, they\'re gone', async () => {

	const admin = await newPage();
	admin.on( 'dialog', d => d.accept( PASSCODE ) );
	await openApp( admin, undefined, { keepProjectModels: true } );
	await admin.waitForFunction( () => window.twin.modelEdits && window.twin.models.entries.some( e => e.url?.endsWith( 'b2d2-repair.glb' ) && ! e.placing ), null, { timeout: 60000 } );
	await admin.evaluate( () => window.twin.views.go( 'C31' ) );
	await admin.waitForFunction( () => ! window.twin.views.gliding );
	await admin.locator( '#views .edit-model' ).click();
	await admin.evaluate( () => window.twin.repairAreas.ready() );
	const edits = () => admin.evaluate( () => window.twin.modelEdits.edits() );
	const saved = () => admin.evaluate( async () => ( await ( await fetch( '/api/model-edits/b2d2-repair' ) ).json() ).edits );
	const size = admin.viewportSize();

	// A click on a side wall of the gallery: a beam straight across to the wall facing it.
	let wall = null;
	const canvasAt = ( x, y ) => admin.evaluate( ( [ x, y ] ) => document.elementFromPoint( x, y ) === window.twin.renderer.domElement, [ x, y ] );
	// (Between the panels at the sides of the page, which would take the click.)
	for ( const [ x, y ] of [ [ 0.62, 0.44 ], [ 0.38, 0.44 ], [ 0.64, 0.5 ], [ 0.36, 0.5 ] ] ) {

		if ( ! await canvasAt( x * size.width, y * size.height ) ) continue;
		await admin.locator( '#model-editor .add-beam' ).click();
		await admin.mouse.click( x * size.width, y * size.height );
		if ( ( await edits() ).length ) {

			wall = { x: x * size.width, y: y * size.height };
			break;

		}

		await admin.keyboard.press( 'Escape' );

	}

	assert.ok( wall, 'a wall in view to hang a beam from' );
	const [ beam ] = await edits();
	assert.equal( beam.kind, 'beam' );
	const span = Math.hypot( ...beam.a.map( ( v, i ) => v - beam.b[ i ] ) );
	assert.ok( span > 1 && span < 12, `across the gallery: ${ span } m` );
	assert.ok( Math.abs( beam.a[ 1 ] - beam.b[ 1 ] ) < 0.01, 'level' );
	assert.match( await admin.locator( '#model-editor .what' ).textContent(), /0\.4 × 0\.6 m/ );
	await admin.locator( '#model-editor [data-field=depth]' ).fill( '0.8' );
	await admin.locator( '#model-editor [data-field=depth]' ).press( 'Enter' );
	await admin.locator( '#model-editor [data-field=name]' ).fill( 'B-01' );
	await admin.locator( '#model-editor [data-field=name]' ).press( 'Enter' );
	const high = ( await edits() )[ 0 ].a[ 1 ];
	await admin.locator( '#model-editor .to-floor' ).click();
	assert.ok( ( await edits() )[ 0 ].a[ 1 ] < high, 'down to the floor' );
	await admin.locator( '#model-editor .undo' ).click();
	assert.equal( ( await edits() )[ 0 ].a[ 1 ], high );

	// The wall it hangs from, painted: the whole face.
	await admin.locator( '#model-editor .paint' ).click();
	await admin.locator( '#model-editor .paint-swatches [title="Yellow"]' ).click();
	await admin.mouse.click( wall.x, wall.y );
	const painted = ( await edits() ).find( e => e.kind === 'paint' );
	assert.ok( painted, 'a face painted' );
	assert.equal( painted.colour, '#f2c14e' );
	// Again in another colour: the same face, not a second coat.
	await admin.locator( '#model-editor .paint-swatches [title="Blue"]' ).click();
	await admin.mouse.click( wall.x, wall.y );
	assert.deepEqual( ( await edits() ).filter( e => e.kind === 'paint' ).map( e => [ e.id, e.colour ] ), [ [ painted.id, '#4f7cac' ] ] );
	await admin.keyboard.press( 'Escape' );

	await admin.locator( '#model-editor .save' ).click();
	await admin.waitForFunction( () => [ ...document.querySelectorAll( '.toast' ) ].some( t => /^Saved for everyone: 2 changes to the model/.test( t.textContent ) ) );
	assert.deepEqual( ( await saved() ).map( e => [ e.kind, e.name ?? e.colour ] ).sort(), [ [ 'beam', 'B-01' ], [ 'paint', '#4f7cac' ] ] );

	// Someone else sees the beam, solid, and the wall in its colour; the areas' editor leaves both be.
	const viewer = await newPage();
	await openApp( viewer, undefined, { keepProjectModels: true } );
	await viewer.waitForFunction( () => window.twin.modelEdits?.edits().length === 2, null, { timeout: 60000 } );
	const seen = () => viewer.evaluate( () => {

		const found = { beams: [], painted: 0 };
		window.twin.models.group.traverse( o => {

			if ( o.userData.beam ) found.beams.push( [ o.name, o.geometry.parameters.height ] );
			if ( o.isMesh && o.geometry.attributes.color ) found.painted ++;

		} );
		return found;

	} );
	assert.deepEqual( await seen(), { beams: [ [ 'B-01', 0.8 ] ], painted: 1 } );
	await viewer.locator( '#views .edit-areas' ).click();
	await viewer.evaluate( () => window.twin.repairAreas.ready() );
	await viewer.evaluate( () => {

		const { repairAreas } = window.twin;
		repairAreas.select( repairAreas.areas().find( a => ! a.deleted ).id );
		repairAreas.nudge( 'right' );

	} );
	assert.deepEqual( await seen(), { beams: [ [ 'B-01', 0.8 ] ], painted: 1 } );

	// The beam deleted and the wall given its own colour back.
	await admin.evaluate( id => window.twin.modelEdits.select( id ), beam.id );
	await admin.locator( '#model-editor .delete' ).click();
	await admin.locator( '#model-editor .paint' ).click();
	await admin.locator( '#model-editor .paint-swatches .original' ).click();
	await admin.mouse.click( wall.x, wall.y );
	await admin.keyboard.press( 'Escape' );
	assert.deepEqual( await edits(), [] );
	await admin.evaluate( () => document.querySelectorAll( '.toast' ).forEach( t => t.remove() ) );
	await admin.locator( '#model-editor .save' ).click();
	await admin.waitForFunction( () => [ ...document.querySelectorAll( '.toast' ) ].some( t => /^Saved for everyone: 2 changes to the model/.test( t.textContent ) ) );
	assert.deepEqual( await saved(), [] );
	await shot( admin, 'model-editor' );
	await admin.context().close();
	await viewer.context().close();

} );

test( 'without the Worker the app is as before: no account, one failed request', async () => {

	vite.stop();
	vite = await startVite( VITE_PORT );
	const plain = await newPage();
	const problems = [];
	plain.on( 'console', message => message.type() === 'error' && problems.push( message.text() ) );
	plain.on( 'pageerror', err => problems.push( err.message ) );
	await openApp( plain );
	await plain.waitForTimeout( 1500 );
	assert.equal( await plain.locator( '.cloud-account' ).count(), 0 );
	assert.ok( problems.length <= 1, problems.join( '\n' ) );
	await plain.context().close();

} );

// --- helpers -------------------------------------------------------------------------------

async function newPage() {

	const context = await browser.newContext( { viewport: { width: 1000, height: 700 }, permissions: [ 'clipboard-read', 'clipboard-write' ] } );
	// Only the local server answers; Google's sign-in script is the stand-in; the rest is blocked.
	await context.route( '**/*', route => {

		const url = route.request().url();
		if ( url.startsWith( BASE ) ) return route.continue();
		if ( url.startsWith( GOOGLE_SCRIPT ) ) return route.fulfill( { contentType: 'text/javascript', body: GOOGLE_STUB } );
		blocked.push( url );
		return route.abort();

	} );
	return context.newPage();

}

async function openApp( target, url = `${ BASE }/?prompt`, { keepProjectModels = false } = {} ) {

	await target.goto( url );
	await target.locator( '#skip' ).click();
	await target.waitForFunction( () => window.twin?.sidebar, null, { timeout: 60000 } );
	if ( ! keepProjectModels ) await dropProjectModels( target );
	await target.waitForTimeout( 500 );

}

async function placeItems( target, ids ) {

	await target.evaluate( async list => {

		for ( const [ i, id ] of list.entries() ) await window.twin.models.load( { name: id, library: id, procedural: id, east: 10 + i * 8, north: 20, heading: 0, up: null } );

	}, ids );
	await target.waitForFunction( n => JSON.parse( localStorage.getItem( 'neptune-twin.layout.Neptune Terminals' ) )?.items.length === n, ids.length );

}

function moveItem( target, id, metres ) {

	return target.evaluate( ( [ library, by ] ) => {

		const entry = window.twin.models.entries.find( e => e.library === library );
		entry.state.east += by;
		window.twin.models.apply( entry );

	}, [ id, metres ] );

}

function localLayout( target ) {

	return target.evaluate( key => JSON.parse( localStorage.getItem( key ) ), LAYOUT_KEY );

}

// The API as the page's signed-in user (Playwright shares the page's cookies).
async function api( target, method, path, body ) {

	const res = await target.request.fetch( BASE + path, { method, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: body } );
	assert.ok( res.ok(), `${ method } ${ path }: ${ res.status() }` );
	return res.status() === 204 ? null : res.json();

}

async function shot( target, name ) {

	if ( SHOTS ) await target.screenshot( { path: join( SHOTS, `${ name }.png` ), timeout: 150000 } );

}
