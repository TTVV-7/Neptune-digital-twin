// npm run test:markups-ui: site markups (src/markups.js) in a real browser against the Vite dev
// server with no Google tiles (every request that isn't to the local server is blocked). The
// Dimension tool: two clicks and a third for its line, labelled with the length on plan; Shift
// squares it to north or east; the Height tool (and Alt on the second click) measures height, here
// a container's; an arrow and a note with words typed in, and a note's words changed afterwards
// as one undo step, the camera left alone while typing; the Show panel's Markups row hides them
// all; saved and back after a reload; a point put on an item follows it when it's dragged (and
// back on Undo); several copied and pasted; deleted, undone and redone; Esc cancels one half
// drawn, or a note being typed; and a layout from before markups still opens.
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
// Metres: how close a position must come out.
const NEAR = 0.05;

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
	await page.evaluate( () => window.twin.layout.clear() );
	await page.evaluate( () => {

		if ( ! window.twin.sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();

	} );
	await lookDown();

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function ready( p = page ) {

	await p.waitForFunction( () => window.twin?.sidebar && window.twin.markups && window.twin.layout && ! window.twin.layout.loading, null, { timeout: 60000 } );
	await dropProjectModels( p );

}

// Straight down on the site from above (20, 10), 70 m up: the scene's left part, clear of the
// panels on the right.
async function lookDown( p = page ) {

	await p.evaluate( () => {

		const { controls, camera } = window.twin;
		controls.setPose( camera.position.clone().set( - 20, 70, 10 ), 0, - 89.9 );

	} );
	await settle( p );

}

async function settle( p = page, ms = 300 ) {

	await p.waitForTimeout( ms );

}

// Where a point on the site (east, north, up) is on screen.
async function screen( east, north, up = 0, p = page ) {

	return p.evaluate( ( [ east, north, up ] ) => {

		const { camera, renderer } = window.twin;
		const v = camera.position.clone().set( - east, up, north ).project( camera );
		const rect = renderer.domElement.getBoundingClientRect();
		return { x: rect.left + ( v.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - v.y ) / 2 * rect.height };

	}, [ east, north, up ] );

}

async function clickAt( { x, y }, modifiers = [], p = page ) {

	await p.mouse.move( x - 3, y - 3 );
	for ( const key of modifiers ) await p.keyboard.down( key );
	await p.mouse.move( x, y, { steps: 2 } );
	await p.mouse.down();
	await p.mouse.up();
	for ( const key of modifiers ) await p.keyboard.up( key );
	await settle( p, 150 );

}

async function startTool( name, p = page ) {

	await p.keyboard.press( 'Escape' );
	await p.evaluate( key => window.twin.markups.tools[ key ].card.click(), name );
	await settle( p, 100 );

}

// The markups placed: name, type, where on the site each point is, and their params.
async function markups( p = page ) {

	return p.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'markup' && ! e.placing ).map( e => {

		const { east, north, up, heading } = e.state;
		const rad = heading * Math.PI / 180;
		const points = e.params.points.map( ( [ pe, pn, pu ] ) => ( { east: east + pe * Math.cos( rad ) + pn * Math.sin( rad ), north: north - pe * Math.sin( rad ) + pn * Math.cos( rad ), up: up + pu } ) );
		return { name: e.state.name, type: e.params.type, points, params: e.params };

	} ) );

}

async function labels( p = page ) {

	return p.evaluate( () => [ ...document.querySelectorAll( '.markup-label' ) ].filter( l => ! l.hidden ).map( l => l.textContent ) );

}

async function clearMarkups( p = page ) {

	await p.evaluate( () => {

		window.twin.sidebar.deselect();
		for ( const entry of [ ...window.twin.models.entries ] ) window.twin.models.remove( entry );
		window.twin.sidebar.history.clear();

	} );

}

function near( a, b, message, tolerance = NEAR ) {

	assert.ok( Math.abs( a - b ) <= tolerance, `${ message }: ${ a } vs ${ b }` );

}

async function shot( name, p = page ) {

	if ( SHOTS ) await p.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

// A 20 ft container (2.59 m high) placed at a spot, facing north.
async function placeContainer( east, north ) {

	return page.evaluate( async ( [ east, north ] ) => {

		const { loadLibrary, itemConfig } = await import( '/src/library.js' );
		const library = await loadLibrary();
		const entry = await window.twin.models.load( itemConfig( library.find( i => i.id === 'container-20' ), { east, north, heading: 0 } ) );
		return window.twin.models.entries.indexOf( entry );

	}, [ east, north ] );

}

async function containerTop() {

	// Its footprint is its box, base at 0 (models.js).
	return page.evaluate( () => {

		const entry = window.twin.models.entries.find( e => e.library === 'container-20' );
		return { top: entry.state.up + entry.footprint.max.y * entry.state.scale, base: entry.state.up };

	} );

}

test( 'a dimension: A, B, then its line, labelled with the length on plan', async () => {

	await startTool( 'dimension' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.getTool()?.name ), 'Dimension' );
	await clickAt( await screen( 0, 0 ) );
	// Half drawn, it follows the pointer, labelled as it goes.
	await page.mouse.move( ( await screen( 10, 0 ) ).x, ( await screen( 10, 0 ) ).y, { steps: 3 } );
	await settle( page, 150 );
	assert.ok( ( await labels() ).some( t => /^\d+\.\d m$/.test( t ) ), JSON.stringify( await labels() ) );
	await clickAt( await screen( 24.6, 0 ) );
	await clickAt( await screen( 12, 4 ) );
	const [ dim ] = await markups();
	assert.equal( dim.name, 'Dimension' );
	near( dim.points[ 0 ].east, 0, 'A east', 0.15 );
	near( dim.points[ 1 ].east, 24.6, 'B east', 0.15 );
	// Its line 4 m to the left of A -> B (north), with extension lines back to the points.
	near( dim.params.offset, 4, 'offset', 0.15 );
	const length = Math.hypot( dim.points[ 1 ].east - dim.points[ 0 ].east, dim.points[ 1 ].north - dim.points[ 0 ].north );
	assert.deepEqual( await labels(), [ `${ length.toFixed( 1 ) } m` ] );
	// Placed by clicking the points exactly: 24.6 m.
	await page.evaluate( () => {

		const entry = window.twin.models.entries.find( e => e.kind === 'markup' );
		window.twin.models.setParams( entry, { points: [ [ - 12.3, 0, 0 ], [ 12.3, 0, 0 ] ] } );

	} );
	await settle( page, 100 );
	assert.deepEqual( await labels(), [ '24.6 m' ] );
	// Selected, with a dot on each point to drag (no pluses), and one step to undo.
	assert.deepEqual( await page.evaluate( () => window.twin.sidebar.getSelected()?.state.name ), 'Dimension' );
	assert.equal( await page.evaluate( () => document.querySelectorAll( '.handles .handle[data-handle=point]:not([hidden])' ).length ), 2 );
	assert.equal( await page.evaluate( () => document.querySelectorAll( '.handles .handle[data-handle=insert]:not([hidden])' ).length ), 0 );
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), 'add dimension' );
	await shot( 'dimension' );

} );

test( 'Shift squares B to A: due east here, however the pointer wanders', async () => {

	await startTool( 'dimension' );
	await clickAt( await screen( 0, 12 ) );
	await clickAt( await screen( 18, 14.5 ), [ 'Shift' ] );
	await clickAt( await screen( 9, 9 ) );
	const squared = ( await markups() ).at( - 1 );
	near( squared.points[ 1 ].north, squared.points[ 0 ].north, 'B squared to A', 0.001 );
	near( squared.points[ 1 ].east - squared.points[ 0 ].east, 18, 'its length', 0.15 );
	// Below the line this time: to the right of A -> B.
	assert.ok( squared.params.offset < - 2, `offset ${ squared.params.offset }` );
	assert.ok( ( await labels() ).includes( `${ ( squared.points[ 1 ].east - squared.points[ 0 ].east ).toFixed( 1 ) } m` ) );
	// Nearer north than east, it squares north instead.
	await startTool( 'dimension' );
	await clickAt( await screen( 30, 0 ) );
	await clickAt( await screen( 31.5, 12 ), [ 'Shift' ] );
	await clickAt( await screen( 33, 6 ) );
	const north = ( await markups() ).at( - 1 );
	near( north.points[ 1 ].east, north.points[ 0 ].east, 'B squared north', 0.001 );

} );

test( 'a height dimension: the Height tool, and Alt on the second click, from the ground to a container\'s top', async () => {

	await clearMarkups();
	await placeContainer( 10, 0 );
	await settle( page, 600 );
	const { top, base } = await containerTop();
	await startTool( 'height' );
	await clickAt( await screen( 4, - 4 ) );
	await clickAt( await screen( 10, 0, top ) );
	const [ height ] = await markups();
	assert.equal( height.name, 'Height' );
	assert.equal( height.params.vertical, true );
	near( height.points[ 1 ].up - height.points[ 0 ].up, top - base, 'height', 0.05 );
	assert.deepEqual( await labels(), [ `${ ( top - base ).toFixed( 1 ) } m` ] );
	assert.equal( ( await labels() )[ 0 ], '2.6 m' );
	// Its top is on the container: pinned to it, the container given an id to be found by.
	const pin = await page.evaluate( () => {

		const entry = window.twin.models.entries.find( e => e.kind === 'markup' );
		const item = window.twin.models.entries.find( e => e.library === 'container-20' );
		return { attach: entry.params.attach, id: item.id };

	} );
	assert.equal( pin.attach[ 0 ], null );
	assert.equal( pin.attach[ 1 ].item, pin.id );
	assert.ok( pin.id );

	// The Dimension tool with Alt on the second click: a height too.
	await startTool( 'dimension' );
	await clickAt( await screen( 16, - 4 ) );
	await clickAt( await screen( 10.5, 0.5, top ), [ 'Alt' ] );
	const alt = ( await markups() ).at( - 1 );
	assert.equal( alt.name, 'Height' );
	assert.equal( alt.params.vertical, true );
	assert.equal( ( await labels() ).filter( t => t === '2.6 m' ).length, 2 );
	await shot( 'height' );

} );

test( 'a point on an item follows it when it\'s dragged, and back with Undo', async () => {

	const before = await markups();
	const item = await page.evaluate( () => window.twin.models.entries.findIndex( e => e.library === 'container-20' ) );
	const was = await page.evaluate( i => window.twin.models.entries[ i ].state, item );
	await page.keyboard.press( 'Escape' );
	const { top } = await containerTop();
	// Dragged 8 m north, by a corner of its top (clear of the markups' labels and lines).
	const from = await screen( 9.3, - 2.3, top );
	const to = await screen( 9.3, 5.7, top );
	await page.mouse.move( from.x, from.y );
	await page.mouse.down();
	await page.mouse.move( ( from.x + to.x ) / 2, ( from.y + to.y ) / 2, { steps: 5 } );
	await page.mouse.move( to.x, to.y, { steps: 5 } );
	await page.mouse.up();
	await settle( page, 400 );
	const moved = await page.evaluate( i => window.twin.models.entries[ i ].state, item );
	assert.ok( moved.north > 5, `the container is at ${ moved.north } north` );
	const after = await markups();
	for ( let m = 0; m < before.length; m ++ ) {

		// The pinned top moved with it; the point on the ground stayed.
		near( after[ m ].points[ 1 ].north - before[ m ].points[ 1 ].north, moved.north - was.north, `markup ${ m }'s top north` );
		near( after[ m ].points[ 1 ].east - before[ m ].points[ 1 ].east, moved.east - was.east, `markup ${ m }'s top east` );
		near( after[ m ].points[ 0 ].north, before[ m ].points[ 0 ].north, `markup ${ m }'s foot` );

	}

	assert.match( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), /^move / );
	await page.keyboard.press( 'Control+Z' );
	await settle( page, 400 );
	const back = await markups();
	for ( let m = 0; m < before.length; m ++ ) near( back[ m ].points[ 1 ].north, before[ m ].points[ 1 ].north, `markup ${ m } back` );

	// Its own point dragged off the container lets go of it.
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'markup' ) ) );
	await settle( page, 300 );
	const dot = await page.evaluate( () => {

		const handles = [ ...document.querySelectorAll( '.handles .handle[data-handle=point]:not([hidden])' ) ].map( h => h.getBoundingClientRect() );
		return handles.map( r => ( { x: r.left + r.width / 2, y: r.top + r.height / 2 } ) );

	} );
	assert.equal( dot.length, 2 );
	const target = await screen( 20, 6 );
	await page.mouse.move( dot[ 1 ].x, dot[ 1 ].y );
	await page.mouse.down();
	await page.mouse.move( target.x, target.y, { steps: 6 } );
	await page.mouse.up();
	await settle( page, 300 );
	const loose = await page.evaluate( () => window.twin.models.entries.find( e => e.kind === 'markup' ).params.attach ?? null );
	assert.equal( loose, null );
	assert.match( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), /^change / );
	await page.keyboard.press( 'Control+Z' );
	await settle( page, 300 );
	assert.ok( await page.evaluate( () => window.twin.models.entries.find( e => e.kind === 'markup' ).params.attach?.[ 1 ]?.item ), 'pinned again on Undo' );

} );

test( 'an arrow and a note, typed; a note\'s words changed later is one undo step; typing leaves the camera alone', async () => {

	await clearMarkups();
	await startTool( 'arrow' );
	await clickAt( await screen( 0, 0 ) );
	await clickAt( await screen( 8, 6 ) );
	assert.equal( await page.evaluate( () => document.activeElement?.closest( '.markup-editor' ) !== null ), true );
	await page.keyboard.type( 'Gas main' );
	await page.keyboard.press( 'Enter' );
	await settle( page, 200 );
	const [ arrow ] = await markups();
	assert.equal( arrow.name, 'Arrow' );
	assert.equal( arrow.params.text, 'Gas main' );
	assert.equal( arrow.params.colour, 'red' );
	near( arrow.points[ 0 ].east, 0, 'tip', 0.15 );
	near( arrow.points[ 1 ].east, 8, 'tail', 0.15 );
	assert.deepEqual( await labels(), [ 'Gas main' ] );

	await startTool( 'note' );
	await clickAt( await screen( 20, 4 ) );
	const camera = await page.evaluate( () => window.twin.camera.position.toArray() );
	// W, A, S, D, R, F, Delete... typed are words, not moves or shortcuts.
	await page.keyboard.type( 'Watch for SWD trucks' );
	await page.locator( '.markup-editor .swatches button[data-colour=amber]' ).click();
	await settle( page, 200 );
	assert.deepEqual( await page.evaluate( () => window.twin.camera.position.toArray() ), camera );
	await page.keyboard.press( 'Enter' );
	await settle( page, 200 );
	const note = ( await markups() ).at( - 1 );
	assert.equal( note.name, 'Note' );
	assert.equal( note.params.text, 'Watch for SWD trucks' );
	assert.equal( note.params.colour, 'amber' );
	assert.equal( note.params.points.length, 1 );
	assert.equal( await page.evaluate( () => window.twin.models.entries.find( e => e.kind === 'markup' && e.params.type === 'note' ).state.heading ), 0 );
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), 'add note' );

	// Double-click its words: change them and its colour; Enter. One step back and forth.
	await page.keyboard.press( 'Escape' );
	const box = await page.locator( '.markup-label.note' ).boundingBox();
	await page.mouse.dblclick( box.x + box.width / 2, box.y + box.height / 2 );
	await settle( page, 200 );
	assert.equal( await page.evaluate( () => window.twin.markups.editing?.params.type ), 'note' );
	await page.keyboard.press( 'Control+A' );
	await page.keyboard.type( 'Hazard: open trench' );
	await page.locator( '.markup-editor .swatches button[data-colour=red]' ).click();
	await shot( 'note-editing' );
	await page.keyboard.press( 'Enter' );
	await settle( page, 200 );
	const edited = ( await markups() ).at( - 1 );
	assert.equal( edited.params.text, 'Hazard: open trench' );
	assert.equal( edited.params.colour, 'red' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), 'edit note' );
	assert.equal( ( await markups() ).length, 2 );
	await page.evaluate( () => window.twin.sidebar.history.undo() );
	await settle( page, 200 );
	assert.equal( ( await markups() ).at( - 1 ).params.text, 'Watch for SWD trucks' );
	assert.equal( ( await markups() ).at( - 1 ).params.colour, 'amber' );
	await page.evaluate( () => window.twin.sidebar.history.redo() );
	await settle( page, 200 );
	assert.equal( ( await markups() ).at( - 1 ).params.text, 'Hazard: open trench' );
	assert.ok( ( await labels() ).includes( 'Hazard: open trench' ) );

	// Esc while changing the words puts them back, with no step.
	await page.evaluate( () => window.twin.markups.editText( window.twin.models.entries.find( e => e.kind === 'markup' && e.params.type === 'note' ) ) );
	await settle( page, 150 );
	await page.keyboard.type( 'nonsense' );
	await page.keyboard.press( 'Escape' );
	await settle( page, 150 );
	assert.equal( ( await markups() ).at( - 1 ).params.text, 'Hazard: open trench' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.undoLabel ), 'edit note' );

} );

test( 'the Show panel\'s Markups row counts them and hides them all', async () => {

	await page.keyboard.press( 'Escape' );
	const row = page.locator( '#layers [data-layer="kind:markup"]' );
	await row.waitFor();
	assert.match( await row.textContent(), /Markups\s*2/ );
	await row.click();
	await settle( page, 200 );
	assert.deepEqual( await labels(), [] );
	assert.equal( await page.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'markup' ).every( e => ! e.pivot.visible ) ), true );
	await row.click();
	await settle( page, 200 );
	assert.equal( ( await labels() ).length, 2 );

} );

test( 'several copied and pasted, laid out as they were; deleted, undone and redone', async () => {

	await clearMarkups();
	await page.evaluate( async () => {

		const { models } = window.twin;
		await models.load( { kind: 'markup', name: 'Dimension', params: { type: 'dimension', points: [ [ - 5, 0, 0 ], [ 5, 0, 0 ] ], offset: 2 }, east: 5, north: 0, up: 0, heading: 0 } );
		await models.load( { kind: 'markup', name: 'Note', params: { type: 'note', points: [ [ 0, 0, 0 ] ], text: 'Keep clear', colour: 'red' }, east: 5, north: 8, up: 0, heading: 0 } );
		window.twin.sidebar.setSelection( models.entries.filter( e => e.kind === 'markup' ) );

	} );
	await settle( page, 200 );
	await page.keyboard.press( 'Control+C' );
	const spot = await screen( 25, 14 );
	await page.mouse.move( spot.x, spot.y );
	await page.keyboard.press( 'Control+V' );
	await settle( page, 600 );
	const all = await markups();
	assert.equal( all.length, 4 );
	const [ a, b, c, d ] = all;
	assert.deepEqual( [ c.params.text, d.params.text ], [ a.params.text, b.params.text ] );
	// Where they are from each other is as copied.
	near( d.points[ 0 ].east - c.points[ 0 ].east, b.points[ 0 ].east - a.points[ 0 ].east, 'east apart' );
	near( d.points[ 0 ].north - c.points[ 0 ].north, b.points[ 0 ].north - a.points[ 0 ].north, 'north apart' );
	assert.ok( Math.abs( c.points[ 0 ].east - a.points[ 0 ].east ) > 10, 'pasted elsewhere' );
	assert.deepEqual( await page.evaluate( () => window.twin.sidebar.getSelection().length ), 2 );
	assert.ok( ( await labels() ).filter( t => t === 'Keep clear' ).length === 2 );

	// Delete the pasted two; Undo puts them back, Redo takes them again.
	await page.keyboard.press( 'Delete' );
	await settle( page, 200 );
	assert.equal( ( await markups() ).length, 2 );
	await page.keyboard.press( 'Control+Z' );
	await settle( page, 400 );
	assert.equal( ( await markups() ).length, 4 );
	assert.ok( ( await labels() ).filter( t => t === 'Keep clear' ).length === 2 );
	await page.keyboard.press( 'Control+Shift+Z' );
	await settle( page, 400 );
	assert.equal( ( await markups() ).length, 2 );
	// And undoing the paste and adding: the toolbar's Delete is the same step.
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'markup' ) ) );
	await settle( page, 200 );
	await page.locator( '.selection-toolbar button.remove' ).click();
	await settle( page, 200 );
	assert.equal( ( await markups() ).length, 1 );
	await page.keyboard.press( 'Control+Z' );
	await settle( page, 400 );
	assert.equal( ( await markups() ).length, 2 );

} );

test( 'Esc cancels a markup half drawn, or a note being typed', async () => {

	await clearMarkups();
	await startTool( 'dimension' );
	await clickAt( await screen( 0, 0 ) );
	await page.mouse.move( ( await screen( 5, 5 ) ).x, ( await screen( 5, 5 ) ).y, { steps: 3 } );
	assert.equal( await page.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'markup' ).length ), 1 );
	await page.keyboard.press( 'Escape' );
	await settle( page, 150 );
	assert.equal( await page.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'markup' ).length ), 0 );
	assert.equal( await page.evaluate( () => window.twin.sidebar.getTool() ), null );
	assert.deepEqual( await labels(), [] );

	await startTool( 'arrow' );
	await clickAt( await screen( 0, 0 ) );
	await page.keyboard.press( 'Escape' );
	await settle( page, 150 );
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 0 );

	await startTool( 'note' );
	await clickAt( await screen( 3, 3 ) );
	await page.keyboard.type( 'Not this' );
	await page.keyboard.press( 'Escape' );
	await settle( page, 150 );
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 0 );
	assert.equal( await page.evaluate( () => window.twin.sidebar.history.size.undo ), 0 );
	assert.equal( await page.locator( '.markup-editor' ).isHidden(), true );

} );

test( 'saved with the layout, pinned to an item, and back after a reload', async () => {

	await clearMarkups();
	await placeContainer( 30, 0 );
	await settle( page, 600 );
	const { top } = await containerTop();
	await startTool( 'dimension' );
	await clickAt( await screen( 30, 0, top ) );
	await clickAt( await screen( 40, 0 ) );
	await clickAt( await screen( 35, - 3 ) );
	await startTool( 'note' );
	await clickAt( await screen( 20, 6 ) );
	await page.keyboard.type( 'Laydown starts here' );
	await page.keyboard.press( 'Enter' );
	await settle( page, 800 );
	const saved = await page.evaluate( () => window.twin.layout.getData().items );
	const dim = saved.find( i => i.kind === 'markup' && i.params.type === 'dimension' );
	const container = saved.find( i => i.library === 'container-20' );
	assert.ok( container.id, 'the container is saved with its id' );
	assert.equal( dim.params.attach[ 0 ].item, container.id );
	assert.equal( saved.find( i => i.kind === 'markup' && i.params.type === 'note' ).params.text, 'Laydown starts here' );
	// A note's saved without a dimension's offset.
	assert.ok( ! ( 'offset' in saved.find( i => i.params?.type === 'note' ).params ) );
	const before = await markups();

	await page.reload();
	await page.click( '#skip' );
	await ready();
	await page.waitForFunction( () => window.twin.models.entries.filter( e => e.kind === 'markup' ).length === 2 );
	await page.evaluate( () => {

		if ( ! window.twin.sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();

	} );
	await lookDown();
	await settle( page, 600 );
	const after = await markups();
	assert.deepEqual( after.map( m => m.params ), before.map( m => m.params ) );
	assert.ok( ( await labels() ).includes( 'Laydown starts here' ) );
	assert.ok( ( await labels() ).includes( `${ Math.abs( before[ 0 ].points[ 1 ].east - before[ 0 ].points[ 0 ].east ).toFixed( 1 ) } m` ) );
	// Still pinned: the container moved (by its P panel numbers here) takes the point with it.
	await page.evaluate( () => {

		const item = window.twin.models.entries.find( e => e.library === 'container-20' );
		item.state.east += 5;
		window.twin.models.apply( item );

	} );
	await settle( page, 300 );
	const pinned = await markups();
	near( pinned[ 0 ].points[ 0 ].east, before[ 0 ].points[ 0 ].east + 5, 'pinned point after the reload' );
	near( pinned[ 0 ].points[ 1 ].east, before[ 0 ].points[ 1 ].east, 'free point after the reload' );

} );

test( 'a layout from before markups still opens, and clearing the layout takes markups too', async () => {

	assert.ok( ( await markups() ).length > 0 );
	await page.evaluate( () => window.twin.layout.clear() );
	assert.equal( ( await markups() ).length, 0 );
	assert.deepEqual( await labels(), [] );
	const failed = await page.evaluate( () => window.twin.layout.replace( [ { name: 'Laydown A', kind: 'laydown', params: { label: 'Laydown A', colour: '#ffd60a', width: 20, length: 15 }, east: 0, north: 0, up: null, heading: 0, scale: 1 } ] ) );
	assert.equal( failed, 0 );
	assert.equal( await page.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'laydown' ).length ), 1 );
	assert.equal( await page.locator( '#layers [data-layer="kind:markup"]' ).count(), 0 );
	assert.deepEqual( errors, [] );

} );
