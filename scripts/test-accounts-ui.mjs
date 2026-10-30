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
import { CLIENT_ID, GOOGLE_STUB, makeKey, makeToken, serveKeys, startVite, startWorker } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const VITE_PORT = Number( process.env.TEST_VITE_PORT ) || 5199;
const WORKER_PORT = Number( process.env.TEST_WORKER_PORT ) || 8788;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ VITE_PORT }`;
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const MAPS_KEY = 'test-maps-key-not-real';
const LAYOUT_KEY = 'neptune-twin.layout.Neptune Terminals';

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
	worker = await startWorker( { port: WORKER_PORT, vars: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_JWKS_URL: keys.url, GOOGLE_MAPS_API_KEY: MAPS_KEY, ALLOWED_EMAILS: '', ALLOWED_DOMAINS: '' } } );
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

async function openApp( target, url = `${ BASE }/?prompt` ) {

	await target.goto( url );
	await target.locator( '#skip' ).click();
	await target.waitForFunction( () => window.twin?.sidebar, null, { timeout: 60000 } );
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
