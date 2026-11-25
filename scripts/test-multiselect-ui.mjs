// npm run test:multiselect-ui: selecting several things at once, and copy and paste, in a real
// browser against the Vite dev server with no Google tiles (every request that isn't to the local
// server is blocked). Shift+click and a Shift+drag box select; dragging one moves them all,
// keeping where they are from each other; R and the ring's knob turn them about their middle;
// Delete takes them all and one Undo puts them all back; Ctrl+C and Ctrl+V paste them at the
// pointer laid out as they were, a step aside when pasted again; pasting in another tab (another
// project) from what this browser keeps; Ctrl+D duplicates and Ctrl+X cuts, each one step to undo
// and redo; a free account's paste leaves the Pro items out and says so; and the keys are left
// alone while typing in a field. Then: another layout opened in this one's place starts with no
// undo steps; undoing a move keeps a later P-panel change; undo never selects something hidden;
// Ctrl+V and Ctrl+Z do nothing with the library closed and nothing selected; cutting Pro items on
// a free account leaves them; and many selected aren't measured again every frame.
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
const PORT = Number( process.env.TEST_VITE_PORT ) || 5203;
const SHOTS = process.env.TEST_SCREENSHOTS;
// What's laid out to start with: [ library id, east, north, heading ].
const ITEMS = [
	[ 'container-20', 0, 0, 0 ],
	[ 'container-20', 12, 2, 30 ],
	[ 'office-trailer-8x20', 2, 14, 90 ],
	[ 'light-tower', 24, 16, 0 ],
];
// Metres: how close a position or offset must come out.
const NEAR = 0.03;

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
	page = await openApp();

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function openApp() {

	const p = await context.newPage();
	p.on( 'pageerror', e => errors.push( String( e ) ) );
	await p.goto( `${ base }/?prompt` );
	await p.click( '#skip' );
	await p.waitForFunction( () => window.twin?.sidebar && window.twin.layout && ! window.twin.layout.loading );
	await dropProjectModels( p );
	await p.evaluate( () => window.twin.layout.clear() );
	await p.evaluate( () => {

		if ( ! window.twin.sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();

	} );
	// Looking down on the layout from the south, high enough to see it all.
	await p.evaluate( () => {

		const { controls, camera } = window.twin;
		controls.setPose( camera.position.clone().set( - 12, 55, - 30 ), 0, - 55 );

	} );
	return p;

}

// Place the items (ITEMS) and a flatten area and a row of barriers, and wait for them.
async function layOut( p = page ) {

	await p.evaluate( async items => {

		const { models } = window.twin;
		const { loadLibrary, itemConfig } = await import( '/src/library.js' );
		const library = await loadLibrary();
		for ( const [ id, east, north, heading ] of items ) await models.load( itemConfig( library.find( i => i.id === id ), { east, north, heading } ) );
		await models.load( { kind: 'flatten-zone', params: { width: 10, length: 8 }, east: 26, north: 0, heading: 0, up: null } );
		await models.load( { kind: 'row', params: { item: 'jersey-barrier', points: [ [ - 6, 0 ], [ 6, 0 ] ] }, east: - 14, north: 8, heading: 0, up: null } );
		window.twin.sidebar.deselect();

	}, ITEMS );
	await settle( p );

}

async function clearAll( p = page ) {

	await p.evaluate( () => {

		window.twin.sidebar.deselect();
		for ( const entry of [ ...window.twin.models.entries ] ) window.twin.models.remove( entry );

	} );

}

// A few frames, for snapping and the handles to catch up.
async function settle( p = page, ms = 400 ) {

	await p.waitForTimeout( ms );

}

// Where each placed thing is: name, east, north, heading, up, kind.
async function placed( p = page ) {

	return p.evaluate( () => window.twin.models.entries.map( e => ( { name: e.state.name, east: e.state.east, north: e.state.north, heading: e.state.heading, up: e.state.up, kind: e.kind, library: e.library } ) ) );

}

async function selectedNames( p = page ) {

	return p.evaluate( () => window.twin.sidebar.getSelection().map( e => e.state.name ).sort() );

}

// Where an entry (by index in models.entries) is on screen: the middle of its box.
async function onScreen( index, p = page ) {

	return p.evaluate( i => {

		const { models, camera, renderer } = window.twin;
		const entry = models.entries[ i ];
		// A metre up its middle, on its sides or top.
		const centre = entry.pivot.position.clone().setY( entry.pivot.position.y + 1.2 );
		const v = centre.project( camera );
		const rect = renderer.domElement.getBoundingClientRect();
		return { x: rect.left + ( v.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - v.y ) / 2 * rect.height };

	}, index );

}

// Where a point on the ground (east, north) is on screen.
async function groundOnScreen( east, north, p = page ) {

	return p.evaluate( ( [ east, north ] ) => {

		const { camera, renderer } = window.twin;
		const v = camera.position.clone().set( - east, 0, north ).project( camera );
		const rect = renderer.domElement.getBoundingClientRect();
		return { x: rect.left + ( v.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - v.y ) / 2 * rect.height };

	}, [ east, north ] );

}

// The point on the ground under a point on the screen, as the editor finds it (east, north).
async function groundAt( x, y, p = page ) {

	return p.evaluate( ( [ x, y ] ) => {

		const { camera, renderer, scene } = window.twin;
		const rect = renderer.domElement.getBoundingClientRect();
		const ndc = { x: ( x - rect.left ) / rect.width * 2 - 1, y: - ( y - rect.top ) / rect.height * 2 + 1 };
		const origin = camera.position.clone();
		const dir = camera.position.clone().set( ndc.x, ndc.y, 0.5 ).unproject( camera ).sub( origin ).normalize();
		// The stand-in ground is flat at 0.
		const t = - origin.y / dir.y;
		const point = origin.addScaledVector( dir, t );
		void scene;
		return { east: - point.x, north: point.z };

	}, [ x, y ] );

}

async function clickAt( { x, y }, modifiers = [] ) {

	for ( const key of modifiers ) await page.keyboard.down( key );
	await page.mouse.click( x, y );
	for ( const key of modifiers ) await page.keyboard.up( key );
	await settle( page, 150 );

}

async function drag( from, to, modifiers = [], p = page ) {

	for ( const key of modifiers ) await p.keyboard.down( key );
	await p.mouse.move( from.x, from.y );
	await p.mouse.down();
	await p.mouse.move( ( from.x + to.x ) / 2, ( from.y + to.y ) / 2, { steps: 6 } );
	await p.mouse.move( to.x, to.y, { steps: 6 } );
	await p.mouse.up();
	for ( const key of modifiers ) await p.keyboard.up( key );
	await settle( p, 300 );

}

// Offsets of each from the first, as [ de, dn ].
function offsets( list ) {

	return list.map( e => [ e.east - list[ 0 ].east, e.north - list[ 0 ].north ] );

}

function assertNear( a, b, message, tolerance = NEAR ) {

	assert.ok( Math.abs( a - b ) <= tolerance, `${ message }: ${ a } vs ${ b }` );

}

async function shot( name, p = page ) {

	if ( SHOTS ) await p.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

test( 'Shift+click adds and takes out, a Shift+drag box selects what it covers', async () => {

	await layOut();
	const all = await placed();
	assert.equal( all.length, 6 );

	// A click selects one, Shift+click adds another and Ctrl+click a third.
	await clickAt( await onScreen( 0 ) );
	assert.deepEqual( await selectedNames(), [ all[ 0 ].name ] );
	await clickAt( await onScreen( 1 ), [ 'Shift' ] );
	await clickAt( await onScreen( 2 ), [ 'Control' ] );
	assert.equal( ( await selectedNames() ).length, 3 );
	// Shift+click on one already selected takes it out.
	await clickAt( await onScreen( 1 ), [ 'Shift' ] );
	assert.deepEqual( await selectedNames(), [ all[ 0 ].name, all[ 2 ].name ].sort() );
	await settle();
	// The toolbar and the edit bar say how many, the P panel has them as "2 items", and each is outlined.
	assert.equal( await page.locator( '.selection-toolbar .count' ).textContent(), '2 items' );
	assert.equal( await page.locator( '.edit-bar .count' ).textContent(), '2 selected' );
	assert.equal( await page.evaluate( () => window.twin.sidebar && document.querySelector( '.group-folder > .lil-title' )?.textContent ), '2 items' );
	assert.equal( await page.evaluate( () => window.twin.scene.children.filter( o => o.type === 'BoxHelper' && o.visible && o.material.color.getHex() === 0xffb02e ).length ), 2 );

	// Esc: nothing.
	await page.keyboard.press( 'Escape' );
	assert.deepEqual( await selectedNames(), [] );
	assert.equal( await page.locator( '.edit-bar .count' ).textContent(), 'Nothing selected' );

	// A box with Shift round the two containers and the trailer's corner (it crosses it), from empty ground.
	const a = await groundOnScreen( - 5, - 5 );
	const b = await groundOnScreen( 16, 11 );
	await drag( a, b, [ 'Shift' ] );
	assert.deepEqual( await selectedNames(), [ all[ 0 ].name, all[ 1 ].name, all[ 2 ].name ].sort() );
	await page.keyboard.press( 'Escape' );

	// The edit bar's Select: a drag (no Shift) selects a box, here the flatten area and the light tower.
	await page.locator( '.edit-bar .box' ).click();
	assert.equal( await page.evaluate( () => window.twin.sidebar.boxMode ), true );
	await drag( await groundOnScreen( 20, - 5 ), await groundOnScreen( 32, 18 ) );
	assert.deepEqual( await selectedNames(), [ all[ 3 ].name, all[ 4 ].name ].sort() );
	await page.locator( '.edit-bar .box' ).click();

	// Ctrl+A: everything shown. A hidden one isn't.
	await page.evaluate( () => window.twin.models.setHidden( window.twin.models.entries[ 3 ], true ) );
	await page.keyboard.press( 'Control+A' );
	assert.equal( ( await selectedNames() ).length, 5 );
	await page.evaluate( () => window.twin.models.setHidden( window.twin.models.entries[ 3 ], false ) );
	await page.keyboard.press( 'Escape' );

	// A box round the row's line selects it (its line, not the empty ground in its box).
	await drag( await groundOnScreen( - 10, 6 ), await groundOnScreen( - 7, 10 ), [ 'Shift' ] );
	assert.deepEqual( await selectedNames(), [ all[ 5 ].name ] );
	await page.keyboard.press( 'Escape' );

} );

test( 'dragging one of several moves them all, keeping their layout, and one Undo puts them back', async () => {

	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 6 ) ) );
	await settle();
	const before = await placed();
	const from = await onScreen( 1 );
	await drag( from, { x: from.x + 120, y: from.y - 60 } );
	const after = await placed();
	const de = after[ 1 ].east - before[ 1 ].east;
	const dn = after[ 1 ].north - before[ 1 ].north;
	assert.ok( Math.hypot( de, dn ) > 5, `it moved ${ de }, ${ dn }` );
	for ( let i = 0; i < before.length; i ++ ) {

		assertNear( after[ i ].east - before[ i ].east, de, `${ before[ i ].name } east` );
		assertNear( after[ i ].north - before[ i ].north, dn, `${ before[ i ].name } north` );
		assert.equal( after[ i ].heading, before[ i ].heading );

	}

	// Still all selected, still on the ground.
	assert.equal( ( await selectedNames() ).length, 6 );
	await settle( page, 800 );
	for ( const e of await placed() ) assert.ok( Math.abs( e.up ) < 0.5, `${ e.name } is at ${ e.up }` );
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), 'move 6 items' );

	await page.keyboard.press( 'Control+Z' );
	await settle();
	const back = await placed();
	for ( let i = 0; i < before.length; i ++ ) {

		assertNear( back[ i ].east, before[ i ].east, `${ before[ i ].name } back east` );
		assertNear( back[ i ].north, before[ i ].north, `${ before[ i ].name } back north` );

	}

	// Redo moves them again.
	await page.keyboard.press( 'Control+Shift+Z' );
	await settle();
	assertNear( ( await placed() )[ 1 ].east, after[ 1 ].east, 'redone' );
	await page.keyboard.press( 'Control+Z' );
	await settle();

} );

test( 'turning several turns each about their middle, as one step', async () => {

	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 3 ) ) );
	await settle();
	const before = ( await placed() ).slice( 0, 3 );
	const middle = { east: before.reduce( ( s, e ) => s + e.east, 0 ) / 3, north: before.reduce( ( s, e ) => s + e.north, 0 ) / 3 };
	// R twice: 30°, merged into one step.
	await page.keyboard.press( 'KeyR' );
	await page.keyboard.press( 'KeyR' );
	await settle();
	const after = ( await placed() ).slice( 0, 3 );
	const rad = 30 * Math.PI / 180;
	for ( let i = 0; i < 3; i ++ ) {

		const de = before[ i ].east - middle.east;
		const dn = before[ i ].north - middle.north;
		assertNear( after[ i ].east, middle.east + de * Math.cos( rad ) + dn * Math.sin( rad ), `${ before[ i ].name } east` );
		assertNear( after[ i ].north, middle.north - de * Math.sin( rad ) + dn * Math.cos( rad ), `${ before[ i ].name } north` );
		assertNear( after[ i ].heading, ( before[ i ].heading + 30 ) % 360, `${ before[ i ].name } heading` );

	}

	assert.equal( await page.evaluate( () => window.twin.sidebar.history.size.undo ), 1 );
	await page.keyboard.press( 'Control+Z' );
	await settle();
	const back = ( await placed() ).slice( 0, 3 );
	for ( let i = 0; i < 3; i ++ ) {

		assertNear( back[ i ].east, before[ i ].east, 'undone east' );
		assertNear( back[ i ].heading, before[ i ].heading, 'undone heading' );

	}

	// The ring's knob turns them too: dragged a quarter turn round the middle.
	const knob = await page.evaluate( () => window.twin.sidebar.handles.positions().find( h => h.type === 'turn' )?.screen );
	assert.ok( knob, 'no knob on the ring round them' );
	const centre = await groundOnScreen( middle.east, middle.north );
	const r = Math.hypot( knob.x - centre.x, knob.y - centre.y );
	await page.mouse.move( knob.x, knob.y );
	await page.mouse.down();
	for ( let a = 0; a <= 90; a += 10 ) {

		const start = Math.atan2( knob.y - centre.y, knob.x - centre.x );
		const t = start + a * Math.PI / 180;
		await page.mouse.move( centre.x + r * Math.cos( t ), centre.y + r * Math.sin( t ) );

	}

	await page.mouse.up();
	await settle();
	const turned = ( await placed() ).slice( 0, 3 );
	const by = ( ( turned[ 0 ].heading - before[ 0 ].heading ) % 360 + 360 ) % 360;
	assert.ok( by > 20 && by < 340, `the knob turned them ${ by }°` );
	for ( let i = 0; i < 3; i ++ ) {

		assertNear( ( ( turned[ i ].heading - before[ i ].heading ) % 360 + 360 ) % 360, by, `${ before[ i ].name } turned as much`, 0.02 );
		// Each as far from the middle as it was.
		assertNear( Math.hypot( turned[ i ].east - middle.east, turned[ i ].north - middle.north ), Math.hypot( before[ i ].east - middle.east, before[ i ].north - middle.north ), `${ before[ i ].name } radius` );

	}

	assert.match( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), /^turn 3 items$/ );
	await page.keyboard.press( 'Control+Z' );
	await settle();
	assertNear( ( await placed() )[ 0 ].heading, before[ 0 ].heading, 'knob undone' );

} );

test( 'Delete takes them all, and one Undo puts them all back', async () => {

	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 5 ) ) );
	await settle();
	const before = await placed();
	await page.keyboard.press( 'Delete' );
	await settle();
	assert.equal( ( await placed() ).length, 1 );
	await page.locator( '.undo-toast', { hasText: 'Deleted 5 items' } ).waitFor();
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( () => window.twin.models.entries.length === 6 );
	await settle();
	const back = await placed();
	for ( const e of before ) assert.ok( back.some( b => b.name === e.name && Math.abs( b.east - e.east ) < NEAR && Math.abs( b.north - e.north ) < NEAR && b.heading === e.heading ), `${ e.name } wasn't put back` );
	// Back and selected; redo deletes them again, undo brings them back again.
	assert.equal( ( await selectedNames() ).length, 5 );
	await page.keyboard.press( 'Control+Y' );
	await settle();
	assert.equal( ( await placed() ).length, 1 );
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( () => window.twin.models.entries.length === 6 );
	// A move recorded before the delete still undoes on the items put back.
	await page.evaluate( () => window.twin.sidebar.deselect() );

} );

test( 'Ctrl+C and Ctrl+V paste at the pointer, laid out as copied, and again beside it', async () => {

	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.filter( e => e.library === 'container-20' || e.kind === 'flatten-zone' ) ) );
	await settle();
	const copied = ( await page.evaluate( () => window.twin.sidebar.getSelection().map( e => ( { name: e.state.name, east: e.state.east, north: e.state.north, heading: e.state.heading } ) ) ) );
	await page.keyboard.press( 'Control+C' );
	await settle( page, 200 );
	const kept = await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive-build.clipboard' ) ) );
	assert.equal( kept.items.length, 3 );

	const spot = await groundOnScreen( - 20, 30 );
	await page.mouse.move( spot.x, spot.y );
	const at = await groundAt( spot.x, spot.y );
	await page.keyboard.press( 'Control+V' );
	await page.waitForFunction( () => window.twin.models.entries.length === 9 );
	await settle();
	const pasted = await page.evaluate( () => window.twin.sidebar.getSelection().map( e => ( { name: e.state.name, east: e.state.east, north: e.state.north, heading: e.state.heading, inConfig: e.inConfig, sharedId: e.sharedId } ) ) );
	assert.equal( pasted.length, 3 );
	// Laid out as copied, facing as they did, their middle at the pointer.
	const middle = list => ( { east: ( Math.min( ...list.map( e => e.east ) ) + Math.max( ...list.map( e => e.east ) ) ) / 2, north: ( Math.min( ...list.map( e => e.north ) ) + Math.max( ...list.map( e => e.north ) ) ) / 2 } );
	assertNear( middle( pasted ).east, at.east, 'pasted at the pointer (east)', 0.3 );
	assertNear( middle( pasted ).north, at.north, 'pasted at the pointer (north)', 0.3 );
	const want = offsets( copied );
	const got = offsets( pasted );
	for ( let i = 0; i < 3; i ++ ) {

		assertNear( got[ i ][ 0 ], want[ i ][ 0 ], 'offset east' );
		assertNear( got[ i ][ 1 ], want[ i ][ 1 ], 'offset north' );
		assert.equal( pasted[ i ].heading, copied[ i ].heading );
		assert.equal( pasted[ i ].inConfig, false );
		assert.equal( pasted[ i ].sharedId, null );

	}

	// Again without moving: a step aside, not on top.
	await page.keyboard.press( 'Control+V' );
	await page.waitForFunction( () => window.twin.models.entries.length === 12 );
	const again = await page.evaluate( () => window.twin.sidebar.getSelection().map( e => ( { east: e.state.east, north: e.state.north } ) ) );
	assert.ok( Math.hypot( again[ 0 ].east - pasted[ 0 ].east, again[ 0 ].north - pasted[ 0 ].north ) > 1, 'pasted on top of the last paste' );
	await shot( 'pasted' );

	// One Undo takes the second paste away, another the first.
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( () => window.twin.models.entries.length === 9 );
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( () => window.twin.models.entries.length === 6 );
	// Saved as part of the layout, like anything placed.
	await page.keyboard.press( 'Control+Shift+Z' );
	await page.waitForFunction( () => window.twin.models.entries.length === 9 );
	await page.waitForFunction( () => JSON.parse( localStorage.getItem( Object.keys( localStorage ).find( k => k.startsWith( 'neptune-twin.layout.' ) ) ) ).items.length === 9 );

} );

test( 'pasting in another tab: a project opened there gets what this one copied', async () => {

	const other = await openApp();
	await settle( other, 500 );
	assert.equal( await other.evaluate( () => window.twin.models.entries.length ), 0 );
	const spot = await groundOnScreen( 5, 5, other );
	await other.mouse.move( spot.x, spot.y );
	await other.keyboard.press( 'Control+V' );
	await other.waitForFunction( () => window.twin.models.entries.length === 3 );
	const what = await other.evaluate( () => window.twin.models.entries.map( e => e.kind ?? e.library ).sort() );
	assert.deepEqual( what, [ 'container-20', 'container-20', 'flatten-zone' ] );
	await other.close();

} );

test( 'Ctrl+D duplicates beside them, Ctrl+X cuts; each is one step to undo and redo', async () => {

	const containers = () => page.evaluate( () => window.twin.models.entries.filter( e => e.library === 'container-20' ).length );
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 2 ) ) );
	const before = ( await placed() ).slice( 0, 2 );
	const n = ( await placed() ).length;
	await page.keyboard.press( 'Control+D' );
	await page.waitForFunction( n => window.twin.models.entries.length === n + 2, n );
	const copies = await page.evaluate( () => window.twin.sidebar.getSelection().map( e => ( { east: e.state.east, north: e.state.north, heading: e.state.heading } ) ) );
	for ( let i = 0; i < 2; i ++ ) {

		assertNear( copies[ i ].east - before[ i ].east, 2, 'duplicate east' );
		assertNear( copies[ i ].north - before[ i ].north, - 2, 'duplicate north' );
		assert.equal( copies[ i ].heading, before[ i ].heading );

	}

	assert.match( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), /^duplicate 2 items$/ );
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( n => window.twin.models.entries.length === n, n );

	// Cut: gone, and on the clipboard; Undo puts them back; then pasted.
	const had = await containers();
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.filter( e => e.library === 'container-20' ).slice( 0, 2 ) ) );
	await page.keyboard.press( 'Control+X' );
	await page.waitForFunction( had => window.twin.models.entries.filter( e => e.library === 'container-20' ).length === had - 2, had );
	assert.equal( ( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive-build.clipboard' ) ) ) ).items.length, 2 );
	await page.locator( '.undo-toast', { hasText: 'Cut 2 items' } ).waitFor();
	await page.keyboard.press( 'Control+Z' );
	await page.waitForFunction( had => window.twin.models.entries.filter( e => e.library === 'container-20' ).length === had, had );
	await page.keyboard.press( 'Control+Y' );
	await page.waitForFunction( had => window.twin.models.entries.filter( e => e.library === 'container-20' ).length === had - 2, had );
	const spot = await groundOnScreen( 0, 30 );
	await page.mouse.move( spot.x, spot.y );
	await page.keyboard.press( 'Control+V' );
	await page.waitForFunction( had => window.twin.models.entries.filter( e => e.library === 'container-20' ).length === had, had );

	// The edit bar's buttons do the same, for touch.
	const count = ( await placed() ).length;
	await page.locator( '.edit-bar .duplicate' ).click();
	await page.waitForFunction( n => window.twin.models.entries.length === n + 2, count );
	await page.locator( '.edit-bar .undo' ).click();
	await page.waitForFunction( n => window.twin.models.entries.length === n, count );
	await page.locator( '.edit-bar .redo' ).click();
	await page.waitForFunction( n => window.twin.models.entries.length === n + 2, count );
	await page.locator( '.edit-bar .undo' ).click();
	await page.waitForFunction( n => window.twin.models.entries.length === n, count );

} );

test( 'a free account pasting Pro items: they are left out, saying how many', async () => {

	await clearAll();
	await page.evaluate( async () => {

		const { models, sidebar } = window.twin;
		const { loadLibrary, itemConfig } = await import( '/src/library.js' );
		const library = await loadLibrary();
		const pro = library.find( i => i.id === 'telehandler-12k' );
		if ( ! pro?.premium ) throw new Error( 'telehandler-12k is not a Pro item' );
		const a = await models.load( itemConfig( library.find( i => i.id === 'container-20' ), { east: 0, north: 0, heading: 0 } ) );
		const b = await models.load( itemConfig( pro, { east: 10, north: 0, heading: 0 } ) );
		const c = await models.load( itemConfig( pro, { east: 20, north: 0, heading: 0 } ) );
		sidebar.setSelection( [ a, b, c ] );
		sidebar.copy();
		// Signed out or free: Pro items locked, as premium.js's gate does.
		sidebar.setGate( { isLocked: () => true, onLocked: () => {} } );

	} );
	const spot = await groundOnScreen( 0, 30 );
	await page.mouse.move( spot.x, spot.y );
	await page.keyboard.press( 'Control+V' );
	await page.locator( '.toast', { hasText: '2 Pro items weren\'t pasted' } ).waitFor();
	await page.waitForFunction( () => window.twin.models.entries.length === 4 );
	assert.deepEqual( await page.evaluate( () => window.twin.sidebar.getSelection().map( e => e.library ) ), [ 'container-20' ] );
	// Duplicating them is the same.
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 3 ) ) );
	await page.keyboard.press( 'Control+D' );
	await page.waitForFunction( () => window.twin.models.entries.length === 5 );
	await page.evaluate( () => window.twin.sidebar.setGate( null ) );

} );

test( 'typing in a field keeps its own keys', async () => {

	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 2 ) ) );
	const before = await placed();
	const history = await page.evaluate( () => window.twin.sidebar.history.size );
	const search = page.locator( '#library input[type=search]' );
	await search.click();
	await page.keyboard.type( 'cone' );
	for ( const key of [ 'Control+A', 'Control+C', 'Control+X', 'Control+V', 'Control+D', 'Control+Z', 'Control+Y' ] ) await page.keyboard.press( key );
	await settle();
	assert.equal( ( await placed() ).length, before.length, 'a key in the search field pasted, cut or duplicated items' );
	assert.deepEqual( await page.evaluate( () => window.twin.sidebar.history.size ), history );
	assert.equal( ( await selectedNames() ).length, 2 );
	await search.fill( '' );
	await search.blur();

	// Text selected on the page: Ctrl+C copies that, not the items.
	const copiedAt = await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive-build.clipboard' ) ).copiedAt );
	await page.evaluate( () => {

		const range = document.createRange();
		range.selectNodeContents( document.querySelector( '#library .tip' ) );
		window.getSelection().removeAllRanges();
		window.getSelection().addRange( range );

	} );
	await page.keyboard.press( 'Control+C' );
	assert.equal( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive-build.clipboard' ) ).copiedAt ), copiedAt );
	await page.evaluate( () => window.getSelection().removeAllRanges() );

} );

test( 'undo steps stay with their layout: another opened in its place starts with none', async () => {

	await clearAll();
	await layOut();
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.filter( e => e.library === 'container-20' ) ) );
	await page.keyboard.press( 'Delete' );
	await settle();
	assert.ok( await page.evaluate( () => window.twin.sidebar.history.canUndo ) );
	// As cloud.js opens a project or a shared layout.
	await page.evaluate( () => window.twin.layout.replace( { items: [] } ) );
	await settle();
	assert.deepEqual( await page.evaluate( () => window.twin.sidebar.history.size ), { undo: 0, redo: 0 } );
	await clickAt( await groundOnScreen( 0, 40 ) );
	await page.keyboard.press( 'Control+Z' );
	await settle( page, 800 );
	assert.equal( ( await placed() ).length, 0, 'Ctrl+Z put the old layout\'s items into the new one' );

	// A delete being undone (loading back) as another layout opens: not loaded into that one.
	await layOut();
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 2 ) ) );
	await page.keyboard.press( 'Delete' );
	await settle();
	await page.evaluate( async () => {

		const undoing = window.twin.sidebar.history.undo();
		await window.twin.layout.replace( { items: [] } );
		await undoing;

	} );
	await settle( page, 800 );
	assert.equal( ( await placed() ).length, 0 );

} );

test( 'undoing a move leaves a later change in the P panel as it is', async () => {

	await clearAll();
	await layOut();
	const zone = () => page.evaluate( () => {

		const e = window.twin.models.entries.find( e => e.kind === 'flatten-zone' );
		return { east: e.state.east, north: e.state.north, width: e.params.width, length: e.params.length };

	} );
	const start = await zone();
	// Moved with a container, by dragging that.
	await page.evaluate( () => window.twin.sidebar.setSelection( [ window.twin.models.entries[ 1 ], window.twin.models.entries.find( e => e.kind === 'flatten-zone' ) ] ) );
	await settle();
	const from = await onScreen( 1 );
	await drag( from, { x: from.x + 60, y: from.y + 40 } );
	const moved = await zone();
	assert.ok( Math.hypot( moved.east - start.east, moved.north - start.north ) > 2, 'it did not move' );
	// The P panel's width field, as placement.js changes it.
	await page.evaluate( () => window.twin.models.setParams( window.twin.models.entries.find( e => e.kind === 'flatten-zone' ), { width: 20 } ) );
	await page.keyboard.press( 'Control+Z' );
	await settle();
	const back = await zone();
	assertNear( back.east, start.east, 'moved back (east)' );
	assertNear( back.north, start.north, 'moved back (north)' );
	assert.equal( back.width, 20, 'undoing the move undid the width typed after it' );
	assert.equal( back.length, 8 );
	await page.keyboard.press( 'Control+Shift+Z' );
	await settle();
	const again = await zone();
	assertNear( again.east, moved.east, 'moved again' );
	assert.equal( again.width, 20 );

	// Turned (R), then its length changed: undoing the turn keeps the length.
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'flatten-zone' ) ) );
	await page.keyboard.press( 'KeyR' );
	await page.evaluate( () => window.twin.models.setParams( window.twin.models.entries.find( e => e.kind === 'flatten-zone' ), { length: 12 } ) );
	await page.keyboard.press( 'Control+Z' );
	await settle();
	const unturned = await page.evaluate( () => {

		const e = window.twin.models.entries.find( e => e.kind === 'flatten-zone' );
		return { heading: e.state.heading, length: e.params.length, width: e.params.width };

	} );
	assert.deepEqual( unturned, { heading: 0, length: 12, width: 20 } );
	await page.evaluate( () => window.twin.sidebar.deselect() );

} );

test( 'undo never selects something hidden, so Delete can\'t take it unseen', async () => {

	await clearAll();
	await layOut();
	const n = ( await placed() ).length;
	const from = await onScreen( 0 );
	await drag( from, { x: from.x + 50, y: from.y } );
	await page.evaluate( () => {

		window.twin.models.setHidden( window.twin.models.entries[ 0 ], true );
		window.twin.sidebar.deselect();

	} );
	await page.keyboard.press( 'Control+Z' );
	await settle();
	assert.deepEqual( await selectedNames(), [] );
	assert.equal( await page.evaluate( () => window.twin.sidebar.getSelection().some( e => window.twin.models.isHidden( e ) ) ), false );
	await page.keyboard.press( 'Delete' );
	await settle();
	assert.equal( ( await placed() ).length, n, 'Delete took a hidden item' );
	await page.evaluate( () => window.twin.models.setHidden( window.twin.models.entries[ 0 ], false ) );

} );

test( 'with the library closed, Ctrl+V and Ctrl+Z leave the plan alone', async () => {

	await clearAll();
	await layOut();
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 2 ) ) );
	await page.keyboard.press( 'Control+C' );
	// A step to undo: one turned (R).
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries[ 3 ] ) );
	await page.keyboard.press( 'KeyR' );
	await page.evaluate( () => window.twin.sidebar.deselect() );
	await page.evaluate( () => document.getElementById( 'library-toggle' ).click() );
	assert.equal( await page.evaluate( () => window.twin.sidebar.isOpen() ), false );
	const before = await placed();
	const history = await page.evaluate( () => window.twin.sidebar.history.size );
	const spot = await groundOnScreen( 0, 30 );
	await page.mouse.move( spot.x, spot.y );
	for ( const key of [ 'Control+V', 'Control+Z', 'Control+Y', 'Control+Shift+Z' ] ) await page.keyboard.press( key );
	await settle( page, 800 );
	assert.deepEqual( await placed(), before );
	assert.deepEqual( await page.evaluate( () => window.twin.sidebar.history.size ), history );
	assert.deepEqual( await selectedNames(), [] );
	assert.equal( await page.locator( '.edit-bar' ).isVisible(), false );
	await shot( 'paste-library-closed' );
	await page.evaluate( () => document.getElementById( 'library-toggle' ).click() );
	// Open again, they work.
	await page.keyboard.press( 'Control+Z' );
	await settle();
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.size.undo ), history.undo - 1 );

} );

test( 'a free account cutting Pro items: they stay where they are, saying so', async () => {

	await clearAll();
	await page.evaluate( async () => {

		const { models, sidebar } = window.twin;
		const { loadLibrary, itemConfig } = await import( '/src/library.js' );
		const library = await loadLibrary();
		const a = await models.load( itemConfig( library.find( i => i.id === 'container-20' ), { east: 0, north: 0, heading: 0 } ) );
		const b = await models.load( itemConfig( library.find( i => i.id === 'telehandler-12k' ), { east: 10, north: 0, heading: 0 } ) );
		sidebar.setGate( { isLocked: item => !! item.premium, onLocked: () => {} } );
		sidebar.setSelection( [ a, b ] );

	} );
	await page.keyboard.press( 'Control+X' );
	await page.locator( '.undo-toast', { hasText: 'Cut 1 item (1 Pro item wasn\'t cut' } ).waitFor();
	assert.deepEqual( await page.evaluate( () => window.twin.models.entries.map( e => e.library ) ), [ 'telehandler-12k' ] );
	assert.equal( ( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive-build.clipboard' ) ) ) ).items.length, 1 );
	const spot = await groundOnScreen( 0, 30 );
	await page.mouse.move( spot.x, spot.y );
	await page.keyboard.press( 'Control+V' );
	await page.waitForFunction( () => window.twin.models.entries.length === 2 );
	// Only Pro items selected: nothing cut.
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.filter( e => e.library === 'telehandler-12k' ) ) );
	await page.keyboard.press( 'Control+X' );
	await page.locator( '.toast', { hasText: '1 Pro item wasn\'t cut' } ).last().waitFor();
	assert.equal( ( await placed() ).length, 2 );
	await page.evaluate( () => window.twin.sidebar.setGate( null ) );

} );

test( 'many selected: their outlines are measured when they change, not every frame', async () => {

	await clearAll();
	await page.evaluate( async () => {

		const { models } = window.twin;
		const { loadLibrary, itemConfig } = await import( '/src/library.js' );
		const library = await loadLibrary();
		const container = library.find( i => i.id === 'container-20' );
		const loads = [];
		for ( let i = 0; i < 80; i ++ ) loads.push( models.load( itemConfig( container, { east: ( i % 10 ) * 4 - 20, north: Math.floor( i / 10 ) * 8, heading: 0 } ) ) );
		await Promise.all( loads );

	} );
	await settle( page, 1500 );
	await page.keyboard.press( 'Control+A' );
	await settle( page, 800 );
	assert.equal( ( await selectedNames() ).length, 80 );
	// Box3's measuring of objects, counted over frames where nothing changes (snapping aside).
	const measure = () => page.evaluate( () => {

		const { models, sidebar } = window.twin;
		const proto = Object.getPrototypeOf( models.entries[ 0 ].footprint );
		const original = proto.expandByObject;
		let calls = 0;
		proto.expandByObject = function ( ...args ) {

			calls ++;
			return original.apply( this, args );

		};
		// No snapping between: only what the editor does itself.
		const update = models.update;
		models.update = () => {};
		const t = performance.now();
		for ( let i = 0; i < 20; i ++ ) sidebar.update();
		const ms = ( performance.now() - t ) / 20;
		models.update = update;
		proto.expandByObject = original;
		return { calls, ms };

	} );
	await settle( page, 1500 );
	const idle = await measure();
	assert.ok( idle.calls < 20, `measured ${ idle.calls } times in 20 frames with nothing changing (${ idle.ms.toFixed( 2 ) } ms a frame)` );
	// Turned (R), they're measured again: the outlines follow.
	await page.keyboard.press( 'KeyR' );
	await settle();
	const outlined = await page.evaluate( () => {

		const { scene, sidebar } = window.twin;
		const entry = sidebar.getSelection()[ 0 ];
		const box = Object.getPrototypeOf( entry.footprint ).constructor;
		const want = new box().setFromObject( entry.pivot );
		const outline = scene.children.filter( o => o.type === 'BoxHelper' && o.visible && o.material.color.getHex() === 0xffb02e )[ 0 ];
		outline.geometry.computeBoundingBox();
		const got = outline.geometry.boundingBox;
		return Math.max( got.min.distanceTo( want.min ), got.max.distanceTo( want.max ) );

	} );
	assert.ok( outlined < 0.05, `the outline is ${ outlined } m off its item after turning` );
	await page.keyboard.press( 'Escape' );

} );

test( 'a picture of several selected', async () => {

	await clearAll();
	await layOut();
	await page.evaluate( () => window.twin.sidebar.setSelection( window.twin.models.entries.slice( 0, 5 ) ) );
	await settle( page, 1200 );
	await shot( 'multi-select' );
	assert.deepEqual( errors, [] );

} );
