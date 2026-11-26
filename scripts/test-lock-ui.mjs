// npm run test:lock-ui: locking placed things in the editor so they aren't changed by accident, in
// a real browser against the Vite dev server with no Google tiles (every request that isn't to the
// local server is blocked). Ctrl+L, the toolbar's and the edit bar's Lock and the P panel's Locked
// lock and unlock, each a step to undo; a locked thing is outlined red, has no handles and only
// Edit, Unlock and Hide on its toolbar, and dragging, R, Delete, Ctrl+X, PageUp and driving it leave
// it be, saying it's locked; its P panel fields are read-only; of several selected the locked ones
// stay while the rest move, turn and go, saying how many stayed; copies aren't locked; the Show
// panel counts them and unlocks them all; and it's saved with the layout, old saves loading
// unlocked.
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev server that's already running
// (started without a Maps key); TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5211;
const SHOTS = process.env.TEST_SCREENSHOTS;
// What's laid out to start with: [ library id, east, north, heading ].
const ITEMS = [
	[ 'container-20', 0, 0, 0 ],
	[ 'container-20', 12, 2, 30 ],
	[ 'office-trailer-8x20', 2, 14, 90 ],
	[ 'pickup-truck', 24, 16, 0 ],
];
const NEAR = 0.03;
const LOCKED_COLOR = 0xe5484d;
// The P panel's folder that's open: the selected item's.
const OPEN = '.lil-gui.lil-root > .lil-children > .lil-gui:not(.lil-closed)';

let browser;
let context;
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

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	base = process.env.TEST_BASE;
	if ( ! base ) {

		vite = await startVite( PORT );
		base = vite.base;

	}

	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	context = await browser.newContext( { viewport: { width: 1280, height: 800 } } );
	await context.route( '**/*', route => {

		const url = route.request().url();
		return url.startsWith( base ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

	} );
	page = await context.newPage();
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await ready();
	await dropProjectModels( page );
	await page.evaluate( () => window.twin.layout.clear() );
	await openLibrary();
	await layOut();
	await noteToasts();

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function ready() {

	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout && ! window.twin.layout.loading );

}

// The library open, looking down on the layout from the south, high enough to see it all.
async function openLibrary() {

	await page.evaluate( () => {

		if ( ! window.twin.sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();
		const { controls, camera } = window.twin;
		controls.setPose( camera.position.clone().set( - 12, 55, - 30 ), 0, - 55 );

	} );

}

// The items (ITEMS) and a flatten area.
async function layOut() {

	await page.evaluate( async items => {

		const { models } = window.twin;
		const { loadLibrary, itemConfig } = await import( '/src/library.js' );
		const library = await loadLibrary();
		for ( const [ id, east, north, heading ] of items ) await models.load( itemConfig( library.find( i => i.id === id ), { east, north, heading } ) );
		await models.load( { kind: 'flatten-zone', params: { width: 10, length: 8 }, east: 26, north: 0, heading: 0, up: null } );
		window.twin.sidebar.deselect();

	}, ITEMS );
	await settle();

}

async function settle( ms = 400 ) {

	await page.waitForTimeout( ms );

}

async function placed() {

	return page.evaluate( () => window.twin.models.entries.map( e => ( { name: e.state.name, east: e.state.east, north: e.state.north, heading: e.state.heading, locked: e.locked, params: e.params ? { ...e.params } : null } ) ) );

}

async function select( indexes ) {

	await page.evaluate( list => window.twin.sidebar.setSelection( list.map( i => window.twin.models.entries[ i ] ) ), indexes );
	await settle( 200 );

}

async function onScreen( index ) {

	return page.evaluate( i => {

		const { models, camera, renderer } = window.twin;
		const centre = models.entries[ i ].pivot.position.clone();
		centre.y += 1.2;
		const v = centre.project( camera );
		const rect = renderer.domElement.getBoundingClientRect();
		return { x: rect.left + ( v.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - v.y ) / 2 * rect.height };

	}, index );

}

async function drag( from, to ) {

	await page.mouse.move( from.x, from.y );
	await page.mouse.down();
	await page.mouse.move( ( from.x + to.x ) / 2, ( from.y + to.y ) / 2, { steps: 6 } );
	await page.mouse.move( to.x, to.y, { steps: 6 } );
	await page.mouse.up();
	await settle( 300 );

}

// The toasts shown since the last look (each is up for 3 s, which a slow software-drawn frame or
// two can outlast, so they're noted as they come).
async function toasts() {

	return page.evaluate( () => {

		const said = window.toastsSaid ?? [];
		window.toastsSaid = [];
		return said;

	} );

}

async function noteToasts() {

	await page.evaluate( () => {

		window.toastsSaid = [];
		new MutationObserver( records => {

			for ( const record of records ) for ( const node of record.addedNodes ) if ( node.classList?.contains( 'toast' ) ) window.toastsSaid.push( node.firstChild?.nodeType === 3 ? node.textContent : node.querySelector( 'span' )?.textContent ?? node.textContent );

		} ).observe( document.body, { childList: true } );

	} );

}

// The selection toolbar's buttons that show, by their text.
async function toolbarButtons() {

	return page.evaluate( () => [ ...document.querySelectorAll( '.selection-toolbar .row button' ) ].filter( b => ! b.hidden ).map( b => b.textContent ) );

}

const undoLabel = () => page.evaluate( () => window.twin.sidebar.history.undoLabel );

async function shot( name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

test( 'Ctrl+L locks what\'s selected: outlined red, no handles, only Edit, Unlock and Hide; Ctrl+Z unlocks', async () => {

	await toasts();

	await page.mouse.click( ( await onScreen( 0 ) ).x, ( await onScreen( 0 ) ).y );
	await settle();
	assert.equal( await page.evaluate( () => window.twin.sidebar.getSelected() === window.twin.models.entries[ 0 ] ), true );
	assert.ok( ( await page.evaluate( () => window.twin.sidebar.handles.positions().length ) ) > 0, 'an unlocked container has handles' );
	const buttons = await toolbarButtons();
	for ( const name of [ 'Rotate left', 'Rotate right', 'Edit', 'Lock', 'Hide', 'Delete' ] ) assert.ok( buttons.includes( name ), `${ name } in ${ buttons }` );

	await page.keyboard.press( 'Control+L' );
	await settle();
	assert.equal( ( await placed() )[ 0 ].locked, true );
	assert.match( await undoLabel(), /^lock Shipping container/ );
	assert.ok( ( await toasts() ).some( t => /^Locked Shipping container.*until unlocked \(Ctrl\+L\)/.test( t ) ) );
	assert.deepEqual( await toolbarButtons(), [ 'Edit', 'Unlock', 'Hide' ] );
	assert.equal( await page.locator( '.selection-toolbar .lock' ).getAttribute( 'aria-pressed' ), 'true' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.handles.positions().length ), 0 );
	assert.equal( await page.evaluate( c => window.twin.scene.children.some( o => o.type === 'BoxHelper' && o.visible && o.material.color.getHex() === c ), LOCKED_COLOR ), true );
	// The edit bar's Lock says Unlock, pressed.
	assert.equal( await page.locator( '.edit-bar .lock' ).textContent(), 'Unlock' );
	assert.equal( await page.locator( '.edit-bar .lock' ).getAttribute( 'aria-pressed' ), 'true' );
	// The Controls panel says it's locked.
	assert.match( await page.evaluate( () => document.querySelector( '#legend .mode' )?.textContent ?? '' ), /^Locked: Shipping container/ );
	await shot( 'locked-selected' );

	await page.keyboard.press( 'Control+Z' );
	await settle();
	assert.equal( ( await placed() )[ 0 ].locked, false );
	assert.ok( ( await toolbarButtons() ).includes( 'Delete' ) );
	assert.equal( await page.locator( '.edit-bar .lock' ).textContent(), 'Lock' );
	await page.keyboard.press( 'Control+Shift+Z' );
	await settle();
	assert.equal( ( await placed() )[ 0 ].locked, true );
	await toasts();

} );

test( 'a locked thing isn\'t dragged, turned, deleted, cut, raised or driven, and says so', async () => {

	await toasts();

	const before = ( await placed() )[ 0 ];
	const from = await onScreen( 0 );
	await drag( from, { x: from.x + 140, y: from.y - 40 } );
	let now = ( await placed() )[ 0 ];
	assert.equal( now.east, before.east );
	assert.equal( now.north, before.north );
	assert.deepEqual( await toasts(), [ 'Locked: unlock it to move it (Ctrl+L)' ] );
	// Still selected, to unlock it.
	assert.equal( await page.evaluate( () => window.twin.sidebar.getSelected() === window.twin.models.entries[ 0 ] ), true );

	await page.keyboard.press( 'KeyR' );
	await settle( 150 );
	assert.equal( ( await placed() )[ 0 ].heading, before.heading );
	assert.deepEqual( await toasts(), [ 'Locked: unlock it to turn it (Ctrl+L)' ] );
	await page.keyboard.press( 'Delete' );
	await settle( 150 );
	assert.equal( ( await placed() ).length, 5 );
	assert.deepEqual( await toasts(), [ 'Locked: unlock it to delete it (Ctrl+L)' ] );
	await page.keyboard.press( 'Control+X' );
	await settle( 150 );
	assert.equal( ( await placed() ).length, 5 );
	assert.deepEqual( await toasts(), [ 'Locked: unlock it to cut it (Ctrl+L)' ] );
	// The P panel's Remove, which goes through the same delete.
	await page.evaluate( () => window.twin.sidebar.toolbar.remove( window.twin.models.entries[ 0 ] ) );
	assert.equal( ( await placed() ).length, 5 );
	await toasts();
	now = ( await placed() )[ 0 ];
	assert.equal( now.heading, before.heading );

	// A locked flatten area: PageUp doesn't raise it.
	await page.evaluate( () => window.twin.sidebar.setLocked( [ window.twin.models.entries[ 4 ] ], true ) );
	await select( [ 4 ] );
	const raise = ( await placed() )[ 4 ].params.raise;
	await page.keyboard.press( 'PageUp' );
	await settle( 150 );
	assert.equal( ( await placed() )[ 4 ].params.raise, raise );
	assert.deepEqual( await toasts(), [ 'Locked: unlock it to raise or lower it (Ctrl+L)' ] );
	await page.keyboard.press( 'Control+Z' );
	await settle( 150 );
	assert.equal( ( await placed() )[ 4 ].locked, false );

	// A locked pickup can't be driven (it would move): no Drive, and V doesn't get in it.
	await page.evaluate( () => window.twin.sidebar.setLocked( [ window.twin.models.entries[ 3 ] ], true ) );
	await select( [ 3 ] );
	assert.equal( await page.evaluate( () => window.twin.isDrivable( window.twin.models.entries[ 3 ] ) ), false );
	assert.ok( ! ( await toolbarButtons() ).includes( 'Drive' ) );
	await page.evaluate( () => window.twin.sidebar.setLocked( [ window.twin.models.entries[ 3 ] ], false ) );
	await settle( 150 );
	assert.equal( await page.evaluate( () => window.twin.isDrivable( window.twin.models.entries[ 3 ] ) ), true );
	assert.ok( ( await toolbarButtons() ).includes( 'Drive' ) );

} );

test( 'its P panel fields are read-only while it\'s locked; the Locked tick box unlocks it, as a step', async () => {

	await toasts();

	await select( [ 0 ] );
	await page.evaluate( () => window.twin.panel.focus( window.twin.models.entries[ 0 ], true ) );
	await settle( 200 );
	const fields = () => page.evaluate( OPEN => {

		const folder = document.querySelector( OPEN );
		return [ ...folder.querySelectorAll( '.lil-controller' ) ].map( c => ( { name: c.querySelector( '.lil-name' )?.textContent, inert: c.inert } ) );

	}, OPEN );
	let list = await fields();
	assert.equal( list[ 0 ].name, 'Locked (Ctrl+L)' );
	assert.equal( list[ 0 ].inert, false );
	for ( const { name, inert } of list.slice( 1 ) ) assert.equal( inert, name !== 'Copy config', `${ name } inert` );
	await shot( 'locked-panel' );
	// Typing into east is out of reach: it can't take the focus.
	const east = page.locator( `${ OPEN } .lil-controller.locked-field input` ).first();
	await east.focus().catch( () => {} );
	assert.equal( await page.evaluate( () => !! document.activeElement?.closest( '.locked-field' ) ), false );

	// Unticked: unlocked, everything works again, and Ctrl+Z locks it back.
	await page.locator( `${ OPEN } .lock-toggle input` ).click();
	await settle( 200 );
	assert.equal( ( await placed() )[ 0 ].locked, false );
	assert.match( await undoLabel(), /^unlock Shipping container/ );
	list = await fields();
	assert.ok( list.every( f => ! f.inert ) );
	await page.locator( `${ OPEN } .lock-toggle input` ).blur();
	await page.keyboard.press( 'Control+Z' );
	await settle( 200 );
	assert.equal( ( await placed() )[ 0 ].locked, true );
	assert.equal( await page.locator( `${ OPEN } .lock-toggle input` ).isChecked(), true );
	await page.evaluate( () => window.twin.panel.gui.hide() );

} );

test( 'of several selected, the locked ones stay while the rest move, turn and are deleted', async () => {

	await toasts();

	// Ctrl+A selects the locked one too.
	await page.evaluate( () => window.twin.sidebar.deselect() );
	await page.keyboard.press( 'Control+A' );
	await settle();
	assert.equal( await page.evaluate( () => window.twin.sidebar.getSelection().length ), 5 );
	// Its outline is red among the amber ones.
	const colours = await page.evaluate( () => window.twin.scene.children.filter( o => o.type === 'BoxHelper' && o.visible ).map( o => o.material.color.getHex() ) );
	assert.equal( colours.filter( c => c === LOCKED_COLOR ).length, 1 );
	assert.equal( colours.filter( c => c === 0xffb02e ).length, 4 );
	assert.equal( await page.locator( '.edit-bar .lock' ).textContent(), 'Lock' );
	await shot( 'several-one-locked' );

	const before = await placed();
	const from = await onScreen( 1 );
	await drag( from, { x: from.x + 120, y: from.y - 50 } );
	const after = await placed();
	assert.equal( after[ 0 ].east, before[ 0 ].east );
	assert.equal( after[ 0 ].north, before[ 0 ].north );
	const de = after[ 1 ].east - before[ 1 ].east;
	assert.ok( Math.abs( de ) > 3, `moved ${ de }` );
	for ( const i of [ 2, 3, 4 ] ) assert.ok( Math.abs( after[ i ].east - before[ i ].east - de ) < NEAR, `${ before[ i ].name } moved with them` );
	assert.deepEqual( await toasts(), [ '1 locked item stays where it is' ] );
	assert.equal( await undoLabel(), 'move 4 items' );
	await page.keyboard.press( 'Control+Z' );
	await settle();
	await toasts();

	await page.keyboard.press( 'KeyR' );
	await settle( 200 );
	const turned = await placed();
	assert.equal( turned[ 0 ].heading, before[ 0 ].heading );
	assert.equal( turned[ 2 ].heading, ( before[ 2 ].heading + 15 ) % 360 );
	assert.deepEqual( await toasts(), [ '1 locked item wasn\'t turned' ] );
	assert.equal( await undoLabel(), 'turn 4 items' );
	await page.keyboard.press( 'Control+Z' );
	await settle( 200 );
	await toasts();

	await page.keyboard.press( 'Delete' );
	await settle();
	assert.deepEqual( ( await placed() ).map( e => e.name ), [ before[ 0 ].name ] );
	assert.deepEqual( await toasts(), [ 'Deleted 4 items (1 locked item wasn\'t deleted)' ] );
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( () => window.twin.models.entries.length === 5 );
	await settle();

	// The edit bar's Lock locks them all (Unlock then), and again unlocks them all, each one step.
	await page.keyboard.press( 'Control+A' );
	await settle( 200 );
	await page.locator( '.edit-bar .lock' ).click();
	await settle( 200 );
	assert.ok( ( await placed() ).every( e => e.locked ) );
	assert.equal( await undoLabel(), 'lock 4 items' );
	assert.equal( await page.locator( '.edit-bar .lock' ).textContent(), 'Unlock' );
	assert.deepEqual( await toolbarButtons(), [ 'Copy', 'Duplicate', 'Edit', 'Unlock', 'Hide' ] );
	assert.equal( await page.evaluate( () => window.twin.sidebar.handles.positions().length ), 0 );
	await shot( 'edit-bar-unlock' );
	await page.locator( '.edit-bar .lock' ).click();
	await settle( 200 );
	assert.ok( ( await placed() ).every( e => ! e.locked ) );
	assert.equal( await undoLabel(), 'unlock 5 items' );
	await page.keyboard.press( 'Control+Z' );
	await page.keyboard.press( 'Control+Z' );
	await settle( 200 );
	assert.deepEqual( ( await placed() ).map( e => e.locked ), [ true, false, false, false, false ] );
	await toasts();

} );

test( 'copies of a locked thing aren\'t locked', async () => {

	await toasts();

	await select( [ 0 ] );
	await page.keyboard.press( 'Control+C' );
	assert.equal( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive-build.clipboard' ) ).items[ 0 ].config.locked ), undefined );
	await page.keyboard.press( 'Control+D' );
	await page.waitForFunction( () => window.twin.models.entries.length === 6 );
	await settle();
	const list = await placed();
	assert.equal( list[ 0 ].locked, true );
	assert.equal( list[ 5 ].locked, false );
	assert.equal( list[ 5 ].name, list[ 0 ].name );
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( () => window.twin.models.entries.length === 5 );
	await toasts();

} );

test( 'the Show panel counts what\'s locked and unlocks it all, as a step', async () => {

	await toasts();

	await page.evaluate( () => window.twin.sidebar.deselect() );
	await page.evaluate( () => window.twin.layers.setOpen( true ) );
	await page.evaluate( () => window.twin.sidebar.setLocked( [ window.twin.models.entries[ 2 ] ], true ) );
	await settle( 200 );
	assert.equal( await page.locator( '#layers .locked-items' ).isVisible(), true );
	assert.equal( await page.locator( '#layers .locked-items .heading' ).textContent(), 'Locked items (2)' );
	await shot( 'show-panel-locked' );
	await page.locator( '#layers .unlock-all' ).click();
	await settle( 200 );
	assert.ok( ( await placed() ).every( e => ! e.locked ) );
	assert.deepEqual( await toasts(), [ '2 items unlocked' ] );
	assert.equal( await page.locator( '#layers .locked-items' ).isVisible(), false );
	assert.equal( await undoLabel(), 'unlock 2 items' );
	await page.keyboard.press( 'Control+Z' );
	await settle( 200 );
	assert.deepEqual( ( await placed() ).map( e => e.locked ), [ true, false, true, false, false ] );
	await page.evaluate( () => window.twin.layers.setOpen( false ) );

} );

test( 'locked is saved with the layout and loads again; old saves load unlocked', async () => {

	await toasts();

	const config = await page.evaluate( () => window.twin.models.toConfig( window.twin.models.entries[ 0 ] ) );
	assert.equal( config.locked, true );
	assert.equal( 'locked' in await page.evaluate( () => window.twin.models.toConfig( window.twin.models.entries[ 1 ] ) ), false );
	const { locked, ...old } = config;
	assert.equal( locked, true );
	assert.equal( await page.evaluate( async c => ( await window.twin.models.load( c ) ).locked, { ...old, east: 60 } ), false );
	await page.evaluate( () => window.twin.models.remove( window.twin.models.entries.at( - 1 ) ) );

	// Reloaded, the layout this browser saved has the two locked.
	await settle( 800 );
	await page.reload();
	await page.click( '#skip' );
	await ready();
	await page.waitForFunction( () => window.twin.models.entries.filter( e => ! e.inConfig ).length >= 5 );
	await dropProjectModels( page );
	const back = await page.evaluate( () => window.twin.models.entries.filter( e => ! e.inConfig ).map( e => [ e.state.name, e.locked ] ) );
	assert.equal( back.filter( ( [ , l ] ) => l ).length, 2, JSON.stringify( back ) );
	await openLibrary();
	await settle();
	await select( [ back.findIndex( ( [ , l ] ) => l ) ] );
	assert.deepEqual( await toolbarButtons(), [ 'Edit', 'Unlock', 'Hide' ] );
	assert.deepEqual( errors, [] );

} );
