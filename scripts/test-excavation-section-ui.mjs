// npm run test:excavation-section-ui: an excavation's section view, quantities, comparison and
// nearby check in a real browser, against the Vite dev server with no Google tiles; every request
// that isn't to the local server is blocked. Nothing is clipped until a section is cut away; an old
// pit's readouts and section, its params left alone; the section's dimensions against the design
// (walls with struts, slopes, tiebacks, benches, a dig stage, the cut moved along); the 3D cut-away
// clipped, filled in, framed side on and everything put back (button, 3D toggle, Esc, the pit
// removed); the quantities and comparison against the shared module; what's placed in the cut,
// over the tiebacks, in the spoil set-back and in the adjacent band, and the no-dig zones drawn.
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
const PORT = Number( process.env.TEST_VITE_PORT ) || 5740;
const SHOTS = process.env.TEST_SCREENSHOTS;

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

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
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
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.section && window.twin.terrain );
	await dropProjectModels( page );
	await clear();

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function clear() {

	await page.evaluate( () => {

		const { models, section } = window.twin;
		section.close();
		for ( const entry of [ ...models.entries ] ) models.remove( entry );
		window.pits = [];

	} );

}

// A pit at (east, north), selected (which opens its P panel); returns its index in window.pits.
async function pit( params, east, north = 0, heading = 0 ) {

	return page.evaluate( async ( { params, east, north, heading } ) => {

		const { models, sidebar } = window.twin;
		const entry = await models.load( { kind: 'excavation', params, east, north, heading, up: null } );
		window.pits.push( entry );
		sidebar.select( entry );
		return window.pits.length - 1;

	}, { params, east, north, heading } );

}

// The section open on pit i, across or along, with its 3D cut-away on or off.
async function section( i, along = false, cutaway = false ) {

	await page.evaluate( ( { i, along, cutaway } ) => {

		const { section } = window.twin;
		section.card.querySelector( '.cutaway input' ).checked = cutaway;
		section.open( window.pits[ i ], along );

	}, { i, along, cutaway } );

}

// What the card shows: its dimensions and labels by id ({ value, text }), fills by kind and member,
// and the surface line, as drawn from the design; and what the design says.
async function read( i ) {

	return page.evaluate( async i => {

		const { section } = window.twin;
		const { planExcavation } = await import( '/src/excavation-design.js' );
		const entry = window.pits[ i ];
		const design = planExcavation( entry.params );
		const card = section.card;
		const dims = Object.fromEntries( [ ...card.querySelectorAll( '.xs-dim' ) ].map( d => [ d.dataset.id, { value: Number( d.dataset.value ), text: d.querySelector( 'text' ).textContent } ] ) );
		const labels = Object.fromEntries( [ ...card.querySelectorAll( '.xs-label' ) ].map( l => [ l.dataset.id, { value: l.dataset.value === undefined ? null : Number( l.dataset.value ), text: l.textContent } ] ) );
		const fills = [ ...card.querySelectorAll( '.xs-fill' ) ].map( f => ( { kind: [ ...f.classList ].find( c => c.startsWith( 'xs-' ) && c !== 'xs-fill' && c !== 'xs-beyond' ).slice( 3 ), member: f.dataset.member ?? null, cut: f.hasAttribute( 'data-cut' ), beyond: f.classList.contains( 'xs-beyond' ) } ) );
		const { drawing } = section.view;
		return {
			hidden: card.hidden,
			title: card.querySelector( '.title' ).textContent,
			dims,
			labels,
			fills,
			surface: drawing.lines.find( l => l.kind === 'surface' ).points,
			legend: [ ...card.querySelectorAll( '[data-legend]' ) ].map( l => l.dataset.legend ),
			plan: { levels: design.plan.levels, toe: design.plan.toe, pileLength: design.plan.pileLength, struts: design.plan.struts, anchors: design.plan.anchors },
			stage: design.stage,
			stages: design.stages.length,
			sides: design.geom.sides.map( s => ( { top: s.top, toe: s.toe, slope: s.slope, rise: s.rise, benchWidth: s.benchWidth, steps: s.steps } ) ),
			depth: design.geom.depth,
		};

	}, i );

}

// The open Excavation folder of the P panel: readouts by name (notes' text), and buttons.
async function panelOf() {

	return page.evaluate( () => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		const rows = {};
		for ( const c of folder.querySelectorAll( '.lil-controller' ) ) {

			const name = c.querySelector( '.lil-name' )?.textContent;
			const note = c.querySelector( '.readout-note' );
			rows[ name ] = { value: note ? note.textContent : c.querySelector( 'input' )?.value ?? null, shown: c.style.display !== 'none', button: c.classList.contains( 'lil-function' ) };

		}

		return rows;

	} );

}

async function clickPanel( name ) {

	await page.evaluate( name => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		[ ...folder.querySelectorAll( '.lil-controller.lil-function' ) ].find( c => c.querySelector( '.lil-name' ).textContent === name ).querySelector( 'button' ).click();

	}, name );

}

async function shot( name ) {

	await page.waitForTimeout( 600 );
	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

const near = ( a, b, tol = 1e-6 ) => Math.abs( a - b ) <= tol;

test( 'nothing is clipped until a section is cut away', async () => {

	const r = await page.evaluate( async () => {

		const { renderer, terrain, scene, section } = window.twin;
		const { PAINT } = await import( '/src/shoring-models.js' );
		const { clipTileMaterial } = await import( '/src/excavation-section.js' );
		let ground = 0;
		scene.traverse( o => o.isMesh && o.parent?.name === 'placeholder-ground' && o.material.clippingPlanes && ground ++ );
		// A Google tile's material is given the planes as it loads (earthworks.js), so a tile that's
		// out of the scene when the first cut-away opens isn't missed; they do nothing till then.
		const tile = new ( Object.values( PAINT )[ 0 ].constructor )();
		clipTileMaterial( tile );
		return { local: renderer.localClippingEnabled, terrain: terrain.material.clippingPlanes, paint: Object.values( PAINT ).filter( m => m.clippingPlanes ).length, ground, tile: tile.clippingPlanes === section.planes && tile.clipIntersection };

	} );
	assert.deepEqual( r, { local: false, terrain: null, paint: 0, ground: 0, tile: true } );

} );

test( 'an old pit: its readouts, its section from the P panel, and its params left alone', async () => {

	const i = await pit( { width: 12, length: 16, depth: 5, slope: 1, support: 'sheet-piles' }, 60, 0, 0 );
	const before = await page.evaluate( i => JSON.stringify( [ window.pits[ i ].params, window.twin.models.toConfig( window.pits[ i ] ).params ] ), i );
	const expected = await page.evaluate( async i => {

		const { planExcavation, compareMethods, comparisonText } = await import( '/src/excavation-design.js' );
		const { designCutText, footprintText } = await import( '/src/excavation-section-drawing.js' );
		const design = planExcavation( window.pits[ i ].params );
		return { cut: designCutText( design ), footprint: footprintText( design ), compared: comparisonText( compareMethods( design.params ) ), volume: design.quantities.volume };

	}, i );
	const rows = await panelOf();
	// 12 × 16 × 5 m with vertical sides. The design's cut and the top's area are said once: in the
	// pit's own readouts (cut, top of the cut) and the card's quantities, not again here.
	assert.equal( expected.volume, 960 );
	assert.match( expected.cut, /^960 m³ · 1,200 m³ loose · about 120 loads$/ );
	assert.equal( rows[ 'design cut (flat ground)' ], undefined );
	assert.equal( rows.footprint, undefined );
	assert.equal( rows[ 'top of the cut' ].value, '12.0 × 16.0 m, 192 m²' );
	// Every pit says what the figures are, under a heading, as every note has one.
	assert.match( rows[ 'planning aid' ].value, /^A planning aid, not a design or a compliance check/ );
	assert.equal( await page.evaluate( () => [ ...document.querySelectorAll( '.lil-controller.note' ) ].find( c => c.querySelector( '.lil-name' ).textContent === 'planning aid' && c.style.display !== 'none' ).querySelector( '.lil-name' ).getBoundingClientRect().height > 0 ), true );
	// The section's buttons come before the readouts.
	assert.equal( await page.evaluate( () => {

		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent === 'Excavation' );
		const names = [ ...folder.querySelectorAll( '.lil-controller' ) ].map( c => c.querySelector( '.lil-name' )?.textContent );
		return names.indexOf( 'Section across' ) < names.indexOf( 'cut (bank)' );

	} ), true );
	// The walls and what's in them are the shoring's readouts, not repeated here.
	assert.equal( rows.quantities, undefined );
	assert.match( rows.shoring.value, /^94 sheets, 56 m of wall, 9\.0 m long each/ );
	assert.equal( rows.compared.value, expected.compared );
	assert.ok( rows.compared.value.startsWith( 'Sloped (1.5 : 1, soil C) instead: ' ), rows.compared.value );
	// Nothing placed near it: the note is left out.
	assert.equal( rows.nearby.shown, false );
	assert.ok( rows[ 'Section across' ].button && rows[ 'Section along' ].button );

	await clickPanel( 'Section across' );
	const r = await read( i );
	assert.equal( r.hidden, false );
	assert.equal( r.title, 'Section across · Excavation, top 12.0 × 16.0 m, 5.0 m deep' );
	assert.equal( r.dims.depth.value, 5 );
	assert.equal( r.dims.top.value, 12 );
	assert.equal( r.dims.floor.value, 12 );
	// The first shoring's single waler 0.7 m down, and its toe: max( 1.5, 5 × 0.6 ) under struts.
	assert.deepEqual( r.plan.levels, [ 0.7 ] );
	assert.equal( r.dims[ 'level-1' ].value, 0.7 );
	assert.ok( near( r.dims[ 'level-floor' ].value, 4.3 ) );
	assert.equal( r.dims.toe.value, 3 );
	assert.equal( r.labels[ 'side-4' ].value, 9 );
	assert.equal( r.labels[ 'side-2' ].value, 9 );
	assert.match( r.labels[ 'side-4' ].text, /^side 4 \(W\) · sheet piles, 9\.0 m sheets$/ );
	assert.equal( r.labels[ 'level-4-1' ].text, 'L1' );
	await shot( 'old-sheet-piles-across' );

	await page.click( '.section-card .close' );
	assert.equal( await page.evaluate( () => window.twin.section.card.hidden && window.twin.section.view === null ), true );
	const after = await page.evaluate( i => JSON.stringify( [ window.pits[ i ].params, window.twin.models.toConfig( window.pits[ i ] ).params ] ), i );
	assert.equal( after, before );
	// An old pit saved before any of this has the five keys it always had.
	assert.deepEqual( Object.keys( JSON.parse( after )[ 1 ] ), [ 'width', 'length', 'depth', 'slope', 'support' ] );

} );

test( 'the section\'s dimensions are the design\'s: walls with struts, slopes, tiebacks, benches, a stage, the cut moved', async () => {

	await clear();

	// Floor 12 × 20 m, 8 m deep, sheet piles on sides 1 and 3, sides 2 and 4 sloped for soil C.
	const mixed = { width: 12, length: 20, depth: 8, outline: 'floor', method: 'sides', side1: 'sheet-piles', side3: 'sheet-piles', side2: 'slope', side4: 'slope', slopeBy: 'soil', bracing: 'auto' };
	const a = await pit( mixed, 0, 0, 0 );
	await section( a, false );
	let r = await read( a );
	assert.equal( r.title, 'Section across · Excavation, top 36.0 × 20.0 m, 8.0 m deep' );
	assert.equal( r.dims.depth.value, 8 );
	assert.equal( r.dims.top.value, 36 );
	assert.equal( r.dims.floor.value, 12 );
	assert.equal( r.labels[ 'slope-4' ].value, 1.5 );
	assert.equal( r.labels[ 'slope-2' ].value, 1.5 );
	assert.equal( r.labels[ 'slope-2' ].text, '1.5 : 1' );
	// Exactly the design: top edges 18 m out, the floor's corners 6 m out, 8 m down.
	for ( const [ s, y ] of [ [ - 18, 0 ], [ - 6, - 8 ], [ 6, - 8 ], [ 18, 0 ] ] ) assert.ok( r.surface.some( p => near( p[ 0 ], s, 1e-9 ) && near( p[ 1 ], y, 1e-9 ) ), `surface through ${ s }, ${ y }` );
	// Struts run from side 1 to side 3, across this cut: one cut through at each place and level,
	// the king post under each in the middle.
	const struts = r.plan.struts.positions.length * r.plan.levels.length;
	assert.equal( struts, 9 );
	assert.equal( r.fills.filter( f => f.member === 'strut' && f.cut ).length, struts );
	assert.equal( r.fills.filter( f => f.member === 'kingpost' && ! f.beyond ).length, r.plan.struts.positions.length );
	assert.ok( r.fills.some( f => f.kind === 'steel' && f.beyond ), 'side 1\'s sheet piles seen beyond' );
	assert.deepEqual( r.legend, [ 'ground', 'surface', 'groundwater', 'beyond' ] );
	await shot( 'mixed-across' );

	await page.click( '.section-card [data-cut="along"]' );
	r = await read( a );
	assert.equal( r.title, 'Section along · Excavation, top 36.0 × 20.0 m, 8.0 m deep' );
	assert.equal( r.dims.top.value, 20 );
	assert.equal( r.dims.floor.value, 20 );
	assert.deepEqual( r.plan.levels, [ 1.5, 3.65, 5.85 ] );
	const chain = [ 'level-1', 'level-2', 'level-3', 'level-floor' ].map( id => r.dims[ id ].value );
	const stops = [ 0, ...r.plan.levels, 8 ];
	chain.forEach( ( v, k ) => assert.ok( near( v, stops[ k + 1 ] - stops[ k ] ), `${ k }: ${ v }` ) );
	assert.deepEqual( chain.map( v => v.toFixed( 2 ) ), [ '1.50', '2.15', '2.20', '2.15' ] );
	assert.equal( r.dims.toe.value, r.plan.toe );
	assert.equal( r.plan.toe, 4 );
	assert.equal( r.labels[ 'side-1' ].value, r.plan.pileLength[ 'sheet-piles' ] );
	assert.equal( r.labels[ 'side-1' ].value, 13 );
	for ( const k of [ 1, 2, 3 ] ) assert.equal( r.labels[ `level-1-${ k }` ].value, r.plan.levels[ k - 1 ] );
	// The struts lie along this cut now: the one in it drawn, the ones beyond it dashed.
	assert.ok( r.fills.some( f => f.member === 'strut' && ! f.beyond && ! f.cut ) );
	assert.ok( r.fills.some( f => f.member === 'strut' && f.beyond ) );
	assert.equal( r.fills.filter( f => f.member === 'waler' && f.cut ).length, 6 );
	await shot( 'mixed-along' );

	// Part way: dug to 0.6 m below the first level, nothing in yet.
	await page.evaluate( i => window.twin.models.setParams( window.pits[ i ], { stage: 1 } ), a );
	await page.waitForFunction( () => ! window.twin.section.view.dirty );
	r = await read( a );
	assert.equal( r.stage.label, 'Dig to 2.1 m' );
	assert.match( r.labels.stage.text, /^Stage 2 of 8: Dig to 2\.1 m$/ );
	assert.equal( r.dims.dug.value, 2.1 );
	assert.ok( near( Math.min( ...r.surface.map( p => p[ 1 ] ) ), - 2.1, 1e-9 ) );
	assert.equal( r.fills.filter( f => f.member === 'waler' ).length, 0 );
	assert.ok( r.fills.some( f => f.kind === 'todo' ) );
	assert.ok( r.legend.includes( 'final' ) );

	// Secant piles all round with tiebacks at 20°: the research's worked example (10 m deep, top
	// row 1.5 m down), with the heads on the walers: 6.49 m free, its bond's middle 5.26 m down.
	const anchored = await pit( { width: 24, length: 40, depth: 10, outline: 'floor', method: 'shore', support: 'secant-piles', bracing: 'tiebacks', anchorAngle: 20 }, 200, 0, 0 );
	await section( anchored, false );
	r = await read( anchored );
	assert.equal( r.dims.toe.value, r.plan.toe );
	for ( const n of [ 2, 4 ] ) {

		const { reach, rows } = r.plan.anchors[ n ];
		assert.ok( near( r.dims[ `reach-${ n }` ].value, reach ) );
		assert.equal( r.dims[ `reach-${ n }` ].text, `no-dig ${ reach.toFixed( 1 ) } m` );
		rows.forEach( ( row, k ) => assert.ok( near( r.labels[ `free-${ n }-${ k + 1 }` ].value, row.free ), `free ${ n } ${ k }` ) );
		assert.equal( r.labels[ `bond-${ n }-1` ].value, 9 );
		assert.equal( r.labels[ `angle-${ n }-1` ].value, 20 );
		assert.ok( near( r.dims[ `cover-${ n }` ].value, rows[ 0 ].bondCentre ) );

	}

	assert.equal( r.labels[ 'free-2-1' ].text, 'free 6.49 m' );
	assert.equal( r.dims[ 'cover-2' ].text, '5.26 cover' );
	// A tieback is at the middle of this one's sides: the cut goes through it.
	assert.equal( await page.evaluate( () => window.twin.section.view.at ), 0 );
	assert.ok( r.fills.some( f => f.member === 'bond' && ! f.beyond ) );
	// This one's are 1.2 m either side of the middle: it opens where a row is in the cut, so their
	// bonds are drawn in it rather than faintly beyond it.
	const offset = await pit( { width: 12, length: 20, depth: 8, outline: 'floor', method: 'shore', support: 'sheet-piles', bracing: 'tiebacks' }, 250, 0, 0 );
	await section( offset, false );
	const opened = await page.evaluate( () => window.twin.section.view.at );
	assert.ok( Math.abs( Math.abs( opened ) - 1.2 ) < 0.11, `cut at ${ opened }` );
	assert.ok( ( await read( offset ) ).fills.some( f => f.member === 'bond' && ! f.beyond ) );
	assert.ok( r.legend.includes( 'wedge' ) && r.legend.includes( 'bond' ) );
	await shot( 'tiebacks-across' );

	// Benches: 4.8 m deep, four 1.2 m risers with 1.8 m benches, the top 5.4 m out from the toe.
	const benched = await pit( { width: 10, length: 10, depth: 4.8, outline: 'floor', method: 'bench', benchWidth: 1.8 }, 300, 0, 0 );
	await section( benched, false );
	r = await read( benched );
	assert.equal( r.dims[ 'riser-2' ].value, 1.2 );
	assert.equal( r.dims[ 'bench-2' ].value, 1.8 );
	assert.ok( near( r.dims.top.value, 20.8 ) );
	assert.equal( r.labels[ 'steps-4' ].text, '4 steps of 1.20 m × 1.80 m' );
	await shot( 'benched-across' );

	// An old 20 × 10 m pit, 3 m deep at 1 : 1, cut across 1 m inside its front edge: only 1 m deep
	// there, with no floor.
	const old = await pit( { width: 20, length: 10, depth: 3, slope: 1, support: 'none' }, 400, 0, 0 );
	await section( old, false );
	await page.evaluate( () => {

		const slider = window.twin.section.card.querySelector( '.at input' );
		slider.value = '4';
		slider.dispatchEvent( new Event( 'input' ) );

	} );
	r = await read( old );
	assert.equal( await page.evaluate( () => window.twin.section.view.at ), 4 );
	assert.equal( await page.evaluate( () => window.twin.section.card.querySelector( '.at output' ).textContent ), '4.0 m' );
	assert.ok( near( Math.min( ...r.surface.map( p => p[ 1 ] ) ), - 1, 1e-9 ) );
	assert.equal( r.dims.floor, undefined );
	await page.evaluate( () => window.twin.section.close() );

} );

test( 'the 3D cut-away: clipped, filled in, framed side on, and everything put back', async () => {

	await clear();
	const i = await pit( { width: 12, length: 16, depth: 5, slope: 1, support: 'sheet-piles' }, 60, 20, 30 );
	await page.waitForTimeout( 300 );
	const pose = () => page.evaluate( () => {

		const { camera, controls } = window.twin;
		return { position: camera.position.toArray(), yaw: controls.yaw, pitch: controls.pitch, mode: controls.mode };

	} );
	// Flying, so the view stays put by itself: looking at the pit from the south-west.
	await page.evaluate( () => {

		const { controls, camera } = window.twin;
		controls.setMode( 'fly' );
		controls.setPose( camera.position.clone().set( - 20, 30, - 40 ), 45, - 25 );

	} );
	const start = await pose();
	await page.evaluate( () => {

		window.twin.section.card.querySelector( '.cutaway input' ).checked = true;

	} );
	await clickPanel( 'Section across' );
	await page.waitForTimeout( 300 );
	const r = await page.evaluate( async i => {

		const { section, terrain, camera, controls, renderer, scene, shoring } = window.twin;
		const { headingToYaw } = await import( '/src/geo.js' );
		const { passesHitFilters } = await import( '/src/walk.js' );
		const { PAINT } = await import( '/src/shoring-models.js' );
		const entry = window.pits[ i ];
		const { planes, cap, overlay } = section;
		const rim = section.view.rim;
		// Points in the pit's frame: u across, v along (the heading), y up from the rim.
		const r = 30 * Math.PI / 180;
		const point = ( u, v, y ) => camera.position.clone().set( - ( entry.state.east + u * Math.cos( r ) + v * Math.sin( r ) ), rim + y, entry.state.north - u * Math.sin( r ) + v * Math.cos( r ) );
		const hit = p => passesHitFilters( { point: p, object: { userData: {} } } );
		let shoringClipped = 0;
		shoring.shown.get( entry ).group.traverse( o => o.isMesh && o.material.clippingPlanes === planes && shoringClipped ++ );
		let ground = 0;
		scene.traverse( o => o.isMesh && o.name === 'stand-in land' && o.material.clippingPlanes === planes && ground ++ );

		// The soil filled in below the floor, square in front of the camera.
		renderer.render( scene, camera );
		const soil = point( 0, 0, - 6.5 ).project( camera );
		const gl = renderer.getContext();
		const pixel = new Uint8Array( 4 );
		gl.readPixels( Math.round( ( soil.x + 1 ) / 2 * gl.drawingBufferWidth ), Math.round( ( soil.y + 1 ) / 2 * gl.drawingBufferHeight ), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel );
		return {
			local: renderer.localClippingEnabled,
			on: planes.every( p => p.constant !== 1e9 ),
			terrain: terrain.material.clippingPlanes === planes && terrain.material.clipIntersection,
			paint: Object.values( PAINT ).every( m => m.clippingPlanes === planes ),
			shoringClipped,
			ground,
			cap: cap.children.map( m => m.name ),
			overlay: ! overlay.hidden && overlay.querySelectorAll( '.xs-dim' ).length,
			// The near half of the pit (v < 0) is cut away, the far half isn't, nor what's beyond the box.
			cut: hit( point( 0, - 2, - 1 ) ),
			kept: hit( point( 0, 2, - 1 ) ),
			beside: hit( point( 40, - 2, - 1 ) ),
			yaw: controls.yaw - headingToYaw( 30 ),
			pitch: controls.pitch * 180 / Math.PI,
			mode: controls.mode,
			// The camera on the near side, looking along the heading.
			behind: ( - camera.position.x - entry.state.east ) * Math.sin( r ) + ( camera.position.z - entry.state.north ) * Math.cos( r ),
			pixel: [ ...pixel.slice( 0, 3 ) ],
		};

	}, i );
	assert.equal( r.local, true );
	assert.equal( r.on, true );
	assert.equal( r.terrain, true );
	assert.equal( r.paint, true );
	assert.ok( r.shoringClipped > 0 );
	assert.equal( r.ground, 1 );
	assert.ok( r.cap.includes( 'section cap: soil' ) && r.cap.includes( 'section cap: steel' ), r.cap.join() );
	assert.ok( r.overlay > 5 );
	assert.deepEqual( [ r.cut, r.kept, r.beside ], [ false, true, true ] );
	assert.ok( Math.abs( Math.atan2( Math.sin( r.yaw ), Math.cos( r.yaw ) ) ) < 1e-6, `yaw ${ r.yaw }` );
	assert.ok( near( r.pitch, - 10, 1e-6 ) );
	assert.equal( r.mode, 'fly' );
	assert.ok( r.behind < - 8, `camera ${ r.behind } m along` );
	// The soil's colour (0x6b5640), drawn unlit.
	assert.ok( Math.abs( r.pixel[ 0 ] - 0x6b ) < 14 && Math.abs( r.pixel[ 1 ] - 0x56 ) < 14 && Math.abs( r.pixel[ 2 ] - 0x40 ) < 14, `pixel ${ r.pixel }` );
	// Nothing of the selection drawn over the cut: the toolbar, the handles, the labels and side numbers.
	const overlays = () => page.evaluate( () => [ '.selection-toolbar', '.handles', '.earthworks-labels' ].map( q => getComputedStyle( document.querySelector( q ) ).display === 'none' && document.body.classList.contains( 'section-cutaway' ) ) );
	assert.deepEqual( await overlays(), [ true, true, true ] );
	await shot( 'cut-away' );

	// The 3D off: the scene as it was, the card still open; on again: framed again.
	await page.click( '.section-card .cutaway input' );
	let s = await page.evaluate( () => ( { off: window.twin.section.planes.every( p => p.constant === 1e9 ), cap: window.twin.section.cap.children.length, open: ! window.twin.section.card.hidden } ) );
	assert.deepEqual( s, { off: true, cap: 0, open: true } );
	assert.deepEqual( await pose(), start );
	assert.deepEqual( await overlays(), [ false, false, false ] );
	await page.click( '.section-card .cutaway input' );
	assert.equal( await page.evaluate( () => window.twin.section.planes[ 0 ].constant !== 1e9 ), true );

	// Esc: closed, everything back, and the pit still selected.
	await page.evaluate( () => document.activeElement?.blur() );
	await page.keyboard.press( 'Escape' );
	s = await page.evaluate( i => {

		const { section, sidebar } = window.twin;
		return { closed: section.card.hidden && section.view === null, off: section.planes.every( p => p.constant === 1e9 ), cap: section.cap.children.length, overlay: section.overlay.hidden, selected: sidebar.getSelected() === window.pits[ i ] };

	}, i );
	assert.deepEqual( s, { closed: true, off: true, cap: 0, overlay: true, selected: true } );
	assert.deepEqual( await pose(), start );
	assert.deepEqual( await overlays(), [ false, false, false ] );

	// Opened while walking: flying while it's open, walking again after.
	await page.evaluate( () => window.twin.controls.setMode( 'walk' ) );
	await section( i, true, true );
	assert.equal( ( await pose() ).mode, 'fly' );
	await page.evaluate( () => window.twin.section.close() );
	assert.equal( ( await pose() ).mode, 'walk' );
	await page.evaluate( () => window.twin.controls.setMode( 'fly' ) );

	// The pit taken away while it's open closes it too.
	const again = await pose();
	await section( i, true, true );
	await page.evaluate( i => window.twin.models.remove( window.pits[ i ] ), i );
	s = await page.evaluate( () => ( { closed: window.twin.section.view === null, off: window.twin.section.planes.every( p => p.constant === 1e9 ) } ) );
	assert.deepEqual( s, { closed: true, off: true } );
	assert.deepEqual( await pose(), again );

} );

test( 'the quantities and the comparison are the shared module\'s', async () => {

	await clear();
	const i = await pit( { width: 12, length: 20, depth: 8, outline: 'floor', method: 'sides', side1: 'sheet-piles', side3: 'sheet-piles', side2: 'slope', side4: 'slope', slopeBy: 'soil', bracing: 'auto' }, 0, 0, 0 );
	await section( i, false );
	const r = await page.evaluate( async i => {

		const { section } = window.twin;
		const { planExcavation, compareMethods, comparisonText } = await import( '/src/excavation-design.js' );
		const design = planExcavation( window.pits[ i ].params );
		const list = compareMethods( design.params );
		const rows = Object.fromEntries( [ ...section.card.querySelectorAll( '.quantities tr' ) ].map( tr => [ tr.querySelector( 'th' ).textContent, tr.querySelector( 'td' ).textContent ] ) );
		const compared = [ ...section.card.querySelectorAll( '.compare tr[data-method]' ) ].map( tr => ( { method: tr.dataset.method, volume: Number( tr.querySelector( '[data-volume]' ).dataset.volume ), current: tr.classList.contains( 'current' ) } ) );
		return { q: design.quantities, piles: window.twin.shoring.planShoring( window.pits[ i ].params ).piles, rows, compared, list, text: comparisonText( list ), checks: section.card.querySelector( '.checks summary' ).textContent, flags: design.flags.length };

	}, i );
	assert.equal( r.q.volume, 3840 );
	assert.equal( r.rows[ 'Cut (bank, flat ground)' ], '3,840 m³' );
	assert.equal( r.rows[ 'Loose (× 1.25)' ], '4,800 m³' );
	assert.equal( r.rows[ 'Truck loads' ], 'about 480 (tandem, 10 m³)' );
	assert.equal( r.rows[ 'Top of the cut' ], '36.0 × 20.0 m, 720 m²' );
	assert.equal( r.rows[ 'Floor' ], '12.0 × 20.0 m' );
	assert.equal( r.rows[ 'Wall area' ], `${ Math.round( r.q.wallArea ) } m²` );
	assert.equal( r.rows[ 'Sheet piles' ], `${ r.piles[ 'sheet-piles' ] } sheets, 13.0 m long (sides 1, 3)` );
	assert.equal( r.rows[ 'Struts' ], `${ r.q.struts.count }, ${ Math.round( r.q.struts.metres ) } m in all` );
	assert.equal( r.rows[ 'King posts' ], String( r.q.kingPosts ) );
	assert.equal( r.compared.length, r.list.length );
	r.compared.forEach( ( row, k ) => assert.equal( row.volume, r.list[ k ].volume ) );
	assert.equal( r.compared[ 0 ].current, true );
	// Gravest first, opened while any is a warning, the worst counted in the summary.
	assert.match( r.checks, new RegExp( `^Checks \\(${ r.flags } · \\d+ warnings?\\)$` ) );
	const order = await page.evaluate( () => ( { levels: [ ...window.twin.section.card.querySelectorAll( '.checks li' ) ].map( li => li.className ), open: window.twin.section.card.querySelector( '.checks' ).open } ) );
	assert.deepEqual( order.levels, [ ...order.levels ].sort( ( a, b ) => [ 'stop', 'warn', 'note' ].indexOf( a ) - [ 'stop', 'warn', 'note' ].indexOf( b ) ) );
	assert.equal( order.open, true );
	// The design's example: shored instead of half sloped, 1,920 m³ less.
	assert.match( r.text, /Sloped \(1\.5 : 1, soil C\) instead: 2,688 m³ more cut, top 36\.0 × 44\.0 m\./ );
	assert.match( r.text, /Shored instead: 1,920 m³ less cut, top 12\.0 × 20\.0 m\./ );
	const rows = await panelOf();
	assert.equal( rows.compared.value, r.text );

	// The research's: a 10 × 20 m floor 4 m deep at 1.5 : 1 cuts 1,712 m³, shored 800 m³.
	await page.evaluate( () => window.twin.section.close() );
	await pit( { width: 10, length: 20, depth: 4, outline: 'floor', slopeBy: 'soil', soil: 'C' }, 100, 0, 0 );
	const panel = await panelOf();
	assert.equal( panel[ 'top of the cut' ].value, '22.0 × 32.0 m, 704 m²' );
	assert.match( panel.compared.value, /Shored instead: 912 m³ less cut, top 10\.0 × 20\.0 m\./ );
	assert.equal( panel.quantities, undefined );

	// Piles are counted as the shoring draws them: soldier piles meeting contiguous piles at every
	// corner each have their own end pile there, and a ring of secant piles needs more round the
	// outside of its corners than along the floor's edges.
	await page.evaluate( () => window.twin.section.close() );
	for ( const [ params, east, expected ] of [
		[ { width: 12, length: 20, depth: 8, outline: 'floor', method: 'sides', side1: 'soldier-piles', side2: 'contiguous-piles', side3: 'soldier-piles', side4: 'contiguous-piles', bracing: 'auto' }, 200, { 'Soldier piles + lagging': '14 piles', 'Contiguous pile wall': '58 piles' } ],
		[ { width: 24, length: 40, depth: 10, outline: 'floor', support: 'secant-piles', bracing: 'tiebacks' }, 300, { 'Secant pile wall': '182 piles' } ],
	] ) {

		const k = await pit( params, east, 0, 0 );
		await section( k, false );
		const got = await page.evaluate( async k => {

			const { section, shoring } = window.twin;
			const rows = Object.fromEntries( [ ...section.card.querySelectorAll( '.quantities tr' ) ].map( tr => [ tr.querySelector( 'th' ).textContent, tr.querySelector( 'td' ).textContent ] ) );
			return { rows, summary: shoring.planShoring( window.pits[ k ].params ).summary };

		}, k );
		for ( const [ what, n ] of Object.entries( expected ) ) {

			assert.ok( got.rows[ what ].startsWith( `${ n }, ` ), `${ what }: ${ got.rows[ what ] }` );
			assert.ok( got.summary.includes( n.replace( 'piles', '' ) ), got.summary );

		}

		await page.evaluate( () => window.twin.section.close() );

	}

} );

test( 'what\'s placed nearby: in the cut, over the tiebacks, in the spoil set-back and the adjacent band; no-dig zones drawn', async () => {

	await clear();
	// Sheet piles with tiebacks all round: a no-dig zone behind each wall.
	const anchored = await pit( { width: 12, length: 20, depth: 8, outline: 'floor', method: 'shore', support: 'sheet-piles', bracing: 'tiebacks' }, 500, 0, 0 );
	const reach = await page.evaluate( async i => {

		const { planExcavation } = await import( '/src/excavation-design.js' );
		return planExcavation( window.pits[ i ].params ).plan.anchors[ 2 ].reach;

	}, anchored );
	const place = ( config ) => page.evaluate( async config => {

		const entry = await window.twin.models.load( { up: null, heading: 0, ...config } );
		window.items = { ...window.items, [ config.name ]: entry };

	}, config );
	const move = ( name, east, north = 0 ) => page.evaluate( ( { name, east, north } ) => {

		const entry = window.items[ name ];
		entry.state.east = east;
		entry.state.north = north;
		window.twin.models.apply( entry );

	}, { name, east, north } );
	const nearby = i => page.evaluate( i => window.twin.section.nearby( window.pits[ i ] ).text, i );

	// A site office behind side 2 (east), over its tiebacks but past the adjacent band.
	await place( { name: 'Site office', procedural: 'office-trailer-8x20', library: 'office-trailer-8x20', east: 500 + 6 + reach - 2, north: 0 } );
	// A laydown area over the cut doesn't count.
	await place( { name: 'Laydown A', kind: 'laydown', params: { label: 'Laydown A', width: 6, length: 6 }, east: 500, north: 0 } );
	// Over the tiebacks, and within the adjacent band too: both said, a PE's as the pit is shored.
	assert.equal( await nearby( anchored ), 'Tiebacks on side 2 run under Site office: consent, or steeper or shorter anchors (FHWA GEC 4 5.3.6). Within 8.0 m of the toe (adjacent): Site office. A structure there means a PE\'s written instructions, as it\'s shored (WorkSafeBC 20.78(1)(b), (2)).' );
	// The P panel says so once it's checked again.
	await page.waitForFunction( () => [ ...document.querySelectorAll( '.lil-controller.note' ) ].some( c => c.querySelector( '.lil-name' )?.textContent === 'nearby' && c.style.display !== 'none' && c.querySelector( '.readout-note' ).textContent.startsWith( 'Tiebacks on side 2 run under Site office' ) ) );

	await move( 'Site office', 500 );
	assert.equal( await nearby( anchored ), 'The cut reaches Site office.' );
	await move( 'Site office', 800 );
	assert.equal( await nearby( anchored ), '' );

	// An old 12 × 12 m pit 5 m deep in sheet piles: a stockpile just out from its edge is in the
	// spoil set-back, the office a few metres out is in the band WorkSafeBC calls adjacent.
	const old = await pit( { width: 12, length: 12, depth: 5, slope: 1, support: 'sheet-piles' }, 600, 0, 0 );
	await place( { name: 'Stockpile 1', kind: 'stockpile', params: { shape: 'ridge', width: 1, length: 4, material: 'gravel' }, east: 600 + 6 + 0.75, north: 0 } );
	await move( 'Site office', 600, - 6 - 3 - 1.2 );
	assert.equal( await nearby( old ), 'Stockpile 1 is inside the spoil set-back (1.2 m, WorkSafeBC 20.90). Stockpile 1 is beside the shoring on side 2: over 0.6 m deep on average, the shoring must allow for it (WorkSafeBC 20.86). Within 5.0 m of the toe (adjacent): Site office. A structure there means a PE\'s written instructions, as it\'s shored (WorkSafeBC 20.78(1)(b), (2)).' );
	// Beside a sloped pit, spoil in its set-back has no shoring to load.
	const sloped = await pit( { width: 12, length: 12, depth: 3, outline: 'floor', slopeBy: 'soil' }, 700, 0, 0 );
	await move( 'Stockpile 1', 700 + 6 + 4.5 + 0.75 );
	await move( 'Site office', 900 );
	assert.equal( await nearby( sloped ), 'Stockpile 1 is inside the spoil set-back (1.2 m, WorkSafeBC 20.90).' );
	await move( 'Stockpile 1', 600 + 6 + 0.75 );

	// The no-dig zones: one behind each wall, draped on the ground, shown in build mode.
	const zones = await page.evaluate( async ( { i, reach } ) => {

		const { section, models, sidebar } = window.twin;
		if ( ! sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();
		const item = section.zones.get( window.pits[ i ] );
		await new Promise( r => setTimeout( r, 1200 ) );
		const east = item.areas.map( a => - a.mesh.position.x );
		const heights = item.areas[ 0 ].mesh.geometry.attributes.position;
		let low = Infinity;
		let high = - Infinity;
		for ( let k = 0; k < heights.count; k ++ ) {

			low = Math.min( low, heights.getY( k ) );
			high = Math.max( high, heights.getY( k ) );

		}

		return { count: item.areas.length, east, low, high, oldZones: section.zones.has( window.pits[ 1 ] ), build: models.buildMode, root: item.group.parent.visible, side2: 500 + 6 + reach / 2 };

	}, { i: anchored, reach } );
	assert.equal( zones.count, 4 );
	assert.ok( zones.east.some( e => near( e, zones.side2, 1e-6 ) ), `${ zones.east } ${ zones.side2 }` );
	assert.ok( zones.low > 0 && zones.high < 0.2, `${ zones.low } ${ zones.high }` );
	assert.equal( zones.oldZones, false );
	assert.equal( zones.root, zones.build );
	await shot( 'nearby' );

} );

test( 'the card and the cut-away share the screen: panels folded, help on top, keys, another pit', async () => {

	await clear();
	// Build mode with the library open, as excavations are made, and the P panel showing the pit.
	await page.evaluate( () => {

		if ( ! window.twin.sidebar.isOpen() ) document.getElementById( 'library-toggle' ).click();

	} );
	const a = await pit( { width: 12, length: 20, depth: 8, outline: 'floor', method: 'sides', side1: 'sheet-piles', side3: 'sheet-piles', side2: 'slope', side4: 'slope', slopeBy: 'soil', bracing: 'auto' }, 0, 0, 0 );
	const b = await pit( { width: 10, length: 10, depth: 3, outline: 'floor', slopeBy: 'soil' }, 120, 0, 0 );
	await page.evaluate( i => window.twin.sidebar.select( window.pits[ i ] ), a );
	const panels = () => page.evaluate( () => ( {
		layers: ! document.querySelector( '#layers .layers-panel' ).hidden,
		legend: ! document.querySelector( '#legend .legend-panel' ).hidden,
		saved: [ localStorage.getItem( 'neptune-twin.legend' ), localStorage.getItem( 'neptune-twin.layers' ) ],
	} ) );
	const before = await panels();
	await section( a, false, true );
	await page.waitForTimeout( 300 );
	const r = await page.evaluate( i => {

		const { section, camera } = window.twin;
		const { view } = section;
		const rect = el => {

			if ( ! el || el.hidden || el.getClientRects().length === 0 ) return null;
			const b = el.getBoundingClientRect();
			return b.width > 0 && b.height > 0 ? b : null;

		};
		// The middle of the cut face and the floor's corners there, on the screen.
		const entry = window.pits[ i ];
		const screen = ( u, y ) => {

			const p = camera.position.clone().set( - ( entry.state.east + u ), view.rim + y, entry.state.north + view.at ).project( camera );
			return [ ( p.x + 1 ) / 2 * innerWidth, ( 1 - p.y ) / 2 * innerHeight ];

		};
		const points = [ screen( 0, - 4 ), screen( - 6, - 8 ), screen( 6, - 8 ) ];
		const covers = [ section.card, document.querySelector( '.lil-gui.lil-root' ), document.querySelector( '#layers .layers-panel' ), document.querySelector( '#legend .legend-panel' ), document.getElementById( 'library' ) ].map( rect ).filter( Boolean );
		const under = points.filter( ( [ x, y ] ) => x < 0 || y < 0 || x > innerWidth || y > innerHeight || covers.some( c => x >= c.left && x <= c.right && y >= c.top && y <= c.bottom ) );
		const card = section.card.getBoundingClientRect();
		const library = document.getElementById( 'library' ).getBoundingClientRect();
		return { under, sheet: section.card.classList.contains( 'sheet' ), overLibrary: card.left < library.right && card.top < library.bottom, esc: [ ...document.querySelectorAll( '#legend dd' ) ].map( d => d.textContent ) };

	}, a );
	// At 1280 × 800 there's no room beside the library for the card and the cut: a sheet along the
	// bottom, the cut framed clear of it, the library and the P panel; the Show and Controls panels
	// folded meanwhile, not as saved.
	assert.equal( r.sheet, true );
	assert.equal( r.overLibrary, false );
	assert.deepEqual( r.under, [] );
	const held = await panels();
	assert.deepEqual( [ held.layers, held.legend ], [ false, false ] );
	assert.deepEqual( held.saved, before.saved );
	// Esc closes the section first, and the Controls say so.
	assert.ok( r.esc.includes( 'Close the section' ), r.esc.join( ' / ' ) );

	// The help opens over the card.
	await page.evaluate( () => document.activeElement?.blur() );
	await page.keyboard.press( 'KeyH' );
	const help = await page.evaluate( () => {

		const h = document.getElementById( 'help' ).getBoundingClientRect();
		return document.elementFromPoint( h.left + 60, h.top + 60 )?.closest( '#help' ) !== null;

	} );
	assert.equal( help, true );
	await page.keyboard.press( 'Escape' );
	assert.equal( await page.evaluate( () => window.twin.section.view !== null ), true );

	// The Cut at slider keeps the keys, and the camera stays put.
	const keys = await page.evaluate( async () => {

		const { section, camera } = window.twin;
		const slider = section.card.querySelector( '.at input' );
		slider.focus();
		return { at: section.view.at, camera: camera.position.toArray() };

	} );
	for ( let k = 0; k < 3; k ++ ) await page.keyboard.press( 'ArrowRight' );
	await page.waitForTimeout( 200 );
	const moved = await page.evaluate( () => ( { at: window.twin.section.view.at, camera: window.twin.camera.position.toArray(), focused: document.activeElement === window.twin.section.card.querySelector( '.at input' ) } ) );
	assert.ok( near( moved.at, keys.at + 0.3, 1e-9 ), `${ keys.at } -> ${ moved.at }` );
	assert.equal( moved.focused, true );
	assert.deepEqual( moved.camera, keys.camera );
	await page.evaluate( () => document.activeElement?.blur() );

	// Selecting another pit: the section follows it.
	await page.evaluate( i => window.twin.sidebar.select( window.pits[ i ] ), b );
	await page.waitForFunction( i => window.twin.section.view?.entry === window.pits[ i ], b );
	assert.match( await page.evaluate( () => window.twin.section.card.querySelector( '.title' ).textContent ), /top 19\.0 × 19\.0 m, 3\.0 m deep$/ );

	// Closed: the panels as they were.
	await page.evaluate( () => window.twin.section.close() );
	const after = await panels();
	assert.deepEqual( after, before );

} );

test( 'no errors on the page', () => {

	assert.deepEqual( errors, [] );

} );
