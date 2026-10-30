// npm run test:rows-ui: rows of library items (src/rows.js) in a real browser, against the Vite dev
// server with no Google tiles; every request that isn't to the local server is blocked. Drawing
// with the mouse (a drag, clicks and a double-click, Enter, Backspace, Esc) and with a finger on a
// phone; end to end and every so many metres, round corners; a cone taper; a fence closed into a
// loop; across the line; on a ramp; 300 cones as instances; walking into a row; saved and
// reloaded; points, spacing and the item changed; broken apart and deleted with Undo; hidden; Pro
// items locked.
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev server that's already running
// (started without a Maps key); TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5196;
const SHOTS = process.env.TEST_SCREENSHOTS;

let chromium;
let browser;
let vite;
let page;
let base;
const errors = [];

before( async () => {

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
	page = await newPage( { viewport: { width: 1280, height: 800 } } );
	await openApp( page, true );
	await page.evaluate( () => {

		// Folded, so the mouse can reach the map at the bottom right.
		window.twin.layers.setOpen( false );
		window.twin.legend.setOpen( false );

	} );
	await page.keyboard.press( 'KeyL' );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

// Each test starts with nothing placed, nothing selected and the camera flying.
beforeEach( async () => {

	await page?.evaluate( () => {

		window.twin.sidebar.cancelDrawing();
		window.twin.sidebar.deselect();
		window.twin.layout.clear();
		window.twin.controls.setMode( 'fly' );

	} );

} );

// A page in a browser context of its own (options), or another tab in a context.
async function newPage( options, context = null ) {

	const p = await ( context ?? await browser.newContext( options ) ).newPage();
	p.on( 'pageerror', e => errors.push( String( e ) ) );
	await p.route( '**/*', route => {

		const url = route.request().url();
		return url.startsWith( base ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

	} );
	return p;

}

async function openApp( p, clear = false ) {

	await p.goto( `${ base }/?prompt` );
	if ( clear ) await p.evaluate( () => localStorage.clear() );
	await p.click( '#skip' );
	await p.waitForFunction( () => window.twin?.sidebar && window.twin.rows && ! window.twin.layout.loading, null, { timeout: 120000 } );
	await p.addStyleTag( { content: '#banner { display: none !important; }' } );

}

// Fly, looking from (east, north, up) along a heading, pitched down (degrees, negative).
async function pose( east, north, up, heading, pitch, p = page ) {

	await p.evaluate( ( [ east, north, up, heading, pitch ] ) => {

		const { controls, camera } = window.twin;
		controls.setMode( 'fly' );
		controls.setPose( camera.position.clone().set( - east, up, north ), heading, pitch );

	}, [ east, north, up, heading, pitch ] );
	await frames( 3, p );

}

function frames( n = 2, p = page ) {

	return p.evaluate( n => new Promise( resolve => {

		const step = () => n -- <= 0 ? resolve() : requestAnimationFrame( step );
		step();

	} ), n );

}

// Where a point (east, north, up) is on screen, in client pixels.
function screenOf( east, north, up = 0, p = page ) {

	return p.evaluate( ( [ east, north, up ] ) => {

		const { camera, renderer } = window.twin;
		camera.updateMatrixWorld();
		const v = camera.position.clone().set( - east, up, north ).project( camera );
		const rect = renderer.domElement.getBoundingClientRect();
		return { x: rect.left + ( v.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - v.y ) / 2 * rect.height };

	}, [ east, north, up ] );

}

async function clickAt( east, north, up = 0 ) {

	const s = await screenOf( east, north, up );
	await page.mouse.click( s.x, s.y );

}

// The Row button on an item's card, as a person would find it.
async function rowButton( id ) {

	const card = page.locator( `#library .card[data-item="${ id }"]` );
	await card.scrollIntoViewIfNeeded();
	await card.hover();
	await card.locator( '.row-chip' ).click();

}

// Click points on the ground, then double-click the last.
async function drawLine( points ) {

	for ( const [ e, n ] of points.slice( 0, - 1 ) ) await clickAt( e, n );
	const s = await screenOf( ...points[ points.length - 1 ] );
	await page.mouse.move( s.x, s.y, { steps: 3 } );
	await page.mouse.dblclick( s.x, s.y );
	await frames( 4 );

}

// A row put down directly, for what isn't about drawing it.
function placeRow( id, points, settings = {}, at = {} ) {

	return page.evaluate( async ( [ id, points, settings, at ] ) => {

		const { models, rows } = window.twin;
		await rows.template( id );
		const name = `Row: ${ document.querySelector( `#library .card[data-item="${ id }"] .name` ).textContent }`;
		await models.load( { kind: 'row', name, params: { item: id, points, ...settings }, east: at.east ?? 0, north: at.north ?? 0, heading: at.heading ?? 0, up: null } );

	}, [ id, points, settings, at ] );

}

// The rows placed: each one's config, and its copies in the scene with their ends along the line
// (a, b, in its frame) and how far along the line those are (sa, sb).
function rows( p = page ) {

	return p.evaluate( () => {

		const { models } = window.twin;
		return models.entries.filter( e => e.kind === 'row' ).map( entry => {

			const content = entry.pivot.children[ 0 ];
			const { layout, t } = content.userData.row;
			entry.pivot.updateMatrixWorld( true );
			const copies = layout.copies.map( ( copy, i ) => {

				const at = entry.pivot.localToWorld( entry.pivot.position.clone().set( copy.x, entry.params.heights[ i ] ?? 0, copy.z ) );
				return { east: - at.x, north: at.z, yaw: copy.yaw + copy.offset, a: copy.a, b: copy.b, sa: copy.sa, sb: copy.sb };

			} );
			return { config: models.toConfig( entry ), count: copies.length, copies, size: { x: t.size.x, y: t.size.y, z: t.size.z } };

		} );

	} );

}

const lineLength = points => points.reduce( ( sum, p, i ) => i ? sum + Math.hypot( p[ 0 ] - points[ i - 1 ][ 0 ], p[ 1 ] - points[ i - 1 ][ 1 ] ) : 0, 0 );
// From each copy's end to the next one's start.
const gaps = copies => copies.slice( 1 ).map( ( c, i ) => Math.hypot( c.a[ 0 ] - copies[ i ].b[ 0 ], c.a[ 1 ] - copies[ i ].b[ 1 ] ) );
// Between copies' middles, along the line.
const steps = copies => copies.slice( 1 ).map( ( c, i ) => ( c.sa + c.sb - copies[ i ].sa - copies[ i ].sb ) / 2 );
const near = ( a, b, tolerance ) => Math.abs( a - b ) <= tolerance;

async function shot( name, p = page ) {

	if ( ! SHOTS ) return;
	await frames( 3, p );
	await p.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

test( 'a drag makes a straight row of jersey barriers, end to end along it', async () => {

	await pose( 0, - 30, 90, 0, - 55 );
	await rowButton( 'jersey-barrier' );
	const on = await page.evaluate( () => [ ...document.querySelectorAll( '.row-panel .switch button[aria-checked="true"]' ) ].map( b => b.dataset.value ) );
	assert.deepEqual( on, [ 'end', 'along', 'ends' ] );
	const a = await screenOf( - 50, 40 );
	const b = await screenOf( 50, 40 );
	await page.mouse.move( a.x, a.y );
	await page.mouse.down();
	await page.mouse.move( b.x, b.y, { steps: 8 } );
	// The copies show while it's drawn, with what they come to.
	const preview = await page.evaluate( () => document.querySelector( '.row-label' ).textContent );
	assert.match( preview, /^3\d copies · \d+\.\d m · ≈ [\d.]+ t$/ );
	await page.mouse.up();
	await frames( 4 );
	let [ row ] = await rows();
	const length = lineLength( row.config.params.points );
	assert.equal( row.config.params.points.length, 2 );
	assert.ok( near( length, 100, 0.6 ), `${ length } m` );
	assert.equal( row.count, Math.floor( length / row.size.x + 1e-9 ) );

	// Exactly 100 m: 32 of them, touching; then 0.1 m apart: 31.
	await page.evaluate( () => window.twin.models.setParams( window.twin.models.entries.find( e => e.kind === 'row' ), { points: [ [ - 50, 0 ], [ 50, 0 ] ] } ) );
	[ row ] = await rows();
	assert.equal( row.count, 32 );
	assert.ok( Math.max( ...gaps( row.copies ) ) < 0.01 );
	await page.evaluate( () => window.twin.models.setParams( window.twin.models.entries.find( e => e.kind === 'row' ), { gap: 0.1 } ) );
	[ row ] = await rows();
	assert.equal( row.count, Math.floor( 100.1 / ( row.size.x + 0.1 ) ) );
	assert.ok( gaps( row.copies ).every( g => near( g, 0.1, 0.01 ) ) );
	// Each one's long side runs east-west, as the line does.
	assert.ok( row.copies.every( c => near( Math.abs( Math.cos( c.yaw ) ), 1, 1e-6 ) ) );
	// Counted as barriers, in the Show panel (a moment after a change) and the library's footer.
	await page.waitForTimeout( 400 );
	const counted = await page.evaluate( () => [ ...document.querySelectorAll( '#layers .layer' ) ].map( r => `${ r.querySelector( '.name' ).textContent } ${ r.querySelector( '.count' ).textContent }` ) );
	assert.ok( counted.includes( `Barriers & fencing ${ row.count }` ), counted.join() );
	assert.equal( await page.locator( '#library .count' ).textContent(), `${ row.count } items placed` );

} );

test( 'cones every 3 m round two corners: spaced along the line, none doubled', async () => {

	await pose( 0, - 40, 110, 0, - 60 );
	await rowButton( 'traffic-cone' );
	assert.equal( await page.locator( '.row-panel .amount input' ).inputValue(), '3' );
	// 30 + 24 + 30 = 84 m.
	await drawLine( [ [ - 30, 10 ], [ 0, 10 ], [ 0, 34 ], [ 30, 34 ] ] );
	let [ row ] = await rows();
	assert.equal( row.config.params.points.length, 4 );
	assert.equal( row.count, 29 );
	assert.ok( steps( row.copies ).every( s => near( s, 3, 0.02 ) ), steps( row.copies ).join() );
	const nearest = Math.min( ...row.copies.flatMap( ( c, i ) => row.copies.slice( i + 1 ).map( d => Math.hypot( c.east - d.east, c.north - d.north ) ) ) );
	assert.ok( nearest > 2, `${ nearest } m` );
	// Centred, exactly 3 m.
	await page.evaluate( () => window.twin.models.setParams( window.twin.models.entries.find( e => e.kind === 'row' ), { fit: 'centred' } ) );
	[ row ] = await rows();
	assert.ok( steps( row.copies ).every( s => near( s, 3, 0.001 ) ) );

} );

test( 'a cone taper has a cone on each point, none further apart than asked', async () => {

	// A 30 m taper over a 3.6 m lane, then 25 m along it; every 4 m.
	await placeRow( 'traffic-cone', [ [ 0, - 30 ], [ 3.6, 0 ], [ 3.6, 25 ] ], { spacing: 'every', every: 4 }, { north: 30 } );
	const [ row ] = await rows();
	const corner = Math.hypot( 3.6, 30 );
	// One at each end and on the corner where the taper meets the lane.
	for ( const s of [ 0, corner, corner + 25 ] ) assert.ok( row.copies.some( c => near( ( c.sa + c.sb ) / 2, s, 0.001 ) ), `none at ${ s } m` );
	// 30.2 m in 8 spaces and 25 m in 7: 3.78 and 3.57 m apart.
	assert.equal( row.count, 16 );
	assert.ok( steps( row.copies ).every( s => s <= 4 + 1e-6 ), steps( row.copies ).join() );

} );

test( 'a fence round an area: the first point closes the loop, panels 10 ft apart, none doubled', async () => {

	await pose( 0, 20, 110, 0, - 89 );
	await rowButton( 'fence-panel' );
	assert.deepEqual( await page.evaluate( () => [ ...document.querySelectorAll( '.row-panel .switch button[aria-checked="true"]' ) ].map( b => b.dataset.value ) ), [ 'end', 'along', 'ends' ] );
	// A shaky first click (6 px) is still a click, not a one-panel row.
	const first = await screenOf( - 15, 10 );
	await page.mouse.move( first.x, first.y );
	await page.mouse.down();
	await page.mouse.move( first.x + 4, first.y + 4, { steps: 2 } );
	await page.mouse.up();
	await frames( 2 );
	assert.equal( ( await page.evaluate( () => window.twin.sidebar.getLine() ) ).points, 1 );
	for ( const [ e, n ] of [ [ 15, 10 ], [ 15, 30 ], [ - 15, 30 ] ] ) {

		await clickAt( e, n );
		await page.waitForTimeout( 450 );

	}

	// Over the first point its dot grows, and a click there closes the loop and finishes.
	await page.mouse.move( first.x + 2, first.y - 2, { steps: 3 } );
	assert.ok( await page.evaluate( () => document.querySelector( '.row-dot' ).classList.contains( 'closing' ) ) );
	await page.mouse.click( first.x + 2, first.y - 2 );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'row' ), null, { timeout: 20000 } );
	let [ row ] = await rows();
	const { points } = row.config.params;
	assert.equal( points.length, 5 );
	assert.deepEqual( points[ 0 ], points[ 4 ] );
	// 100 m: panels 10 ft apart, sharing the foot at each joint, cut across the four corners.
	assert.ok( row.copies.every( c => near( Math.hypot( c.b[ 0 ] - c.a[ 0 ], c.b[ 1 ] - c.a[ 1 ] ), 3.048, 0.001 ) ) );
	assert.equal( row.count, 32 );
	assert.ok( Math.max( ...gaps( row.copies ) ) < 0.01 );

	// Every 2.5 m round it: 40, the last 2.5 m from the first.
	await page.evaluate( () => window.twin.models.setParams( window.twin.models.entries.find( e => e.kind === 'row' ), { spacing: 'every', every: 2.5 } ) );
	[ row ] = await rows();
	assert.equal( row.count, 40 );
	const nearest = Math.min( ...row.copies.flatMap( ( c, i ) => row.copies.slice( i + 1 ).map( d => Math.hypot( c.east - d.east, c.north - d.north ) ) ) );
	assert.ok( nearest > 1.7, `${ nearest } m` );

	// Its corner has one dot; dragged, both ends go with it and the loop stays closed.
	// (The handles follow the selection a frame later.)
	await page.waitForFunction( () => window.twin.sidebar.handles.positions().some( h => h.type === 'point' ), null, { timeout: 5000 } );
	const dots = await page.evaluate( () => window.twin.sidebar.handles.positions().filter( h => h.type === 'point' ).map( h => ( { index: h.index, ...h.screen } ) ) );
	assert.deepEqual( dots.map( d => d.index ), [ 0, 1, 2, 3 ] );
	await page.mouse.move( dots[ 0 ].x, dots[ 0 ].y );
	await page.mouse.down();
	await page.mouse.move( dots[ 0 ].x - 30, dots[ 0 ].y + 20, { steps: 6 } );
	await page.mouse.up();
	await frames( 3 );
	[ row ] = await rows();
	assert.equal( row.config.params.points.length, 5 );
	assert.deepEqual( row.config.params.points[ 0 ], row.config.params.points[ 4 ] );
	assert.ok( ! near( lineLength( row.config.params.points ), 100, 0.5 ), `${ lineLength( row.config.params.points ) } m` );

} );

test( 'trucks across the line stand side by side', async () => {

	await placeRow( 'dump-truck-tandem', [ [ - 20, 0 ], [ 20, 0 ] ], { align: 'across', gap: 1 }, { north: 60 } );
	const [ row ] = await rows();
	const width = Math.min( row.size.x, row.size.z );
	assert.equal( row.count, Math.floor( 41 / ( width + 1 ) ) );
	// Each one's front points north or south, square to the line.
	assert.ok( row.copies.every( c => near( Math.abs( Math.cos( c.yaw ) ), 1, 1e-6 ) ) );
	await pose( 0, 38, 14, 0, - 25 );
	await shot( 'trucks-across' );

} );

test( 'on a ramp, none floats or digs in more than 5 cm: barriers tilt with it, cones stand level', async () => {

	await page.evaluate( () => {

		const { scene, models } = window.twin;
		// three.js's classes, from the stand-in ground (a plane).
		const plane = models.getGround()[ 0 ].children.find( o => o.isMesh );
		const geometry = new ( Object.getPrototypeOf( plane.geometry.constructor ) )();
		// 10 % up from north 0 to 30 (3 m), then level to north 50, east -20 to 20.
		const v = [];
		const P = ( e, n, h ) => [ - e, h, n ];
		const quad = ( a, b, c, d ) => v.push( ...a, ...b, ...c, ...a, ...c, ...d );
		quad( P( - 20, 0, 0 ), P( - 20, 30, 3 ), P( 20, 30, 3 ), P( 20, 0, 0 ) );
		quad( P( - 20, 30, 3 ), P( - 20, 50, 3 ), P( 20, 50, 3 ), P( 20, 30, 3 ) );
		geometry.setAttribute( 'position', new plane.geometry.attributes.position.constructor( new Float32Array( v ), 3 ) );
		geometry.computeVertexNormals();
		const ramp = new plane.constructor( geometry, plane.material.clone() );
		ramp.material.color.set( 0x9a8f6e );
		ramp.material.side = 2;
		ramp.updateMatrixWorld( true );
		scene.add( ramp );
		models.getGround().push( ramp );
		window.ramp = ramp;

	} );
	await placeRow( 'jersey-barrier', [ [ 0, - 10 ], [ 0, 45 ] ], {}, { east: 5 } );
	await placeRow( 'traffic-cone', [ [ 0, - 10 ], [ 0, 45 ] ], { spacing: 'every', every: 1.3 }, { east: - 5 } );
	await placeRow( 'water-barrier', [ [ - 12, - 6 ], [ - 6, 24 ], [ 6, 38 ] ], {}, { east: 12 } );
	await frames( 6 );
	// Each copy's bottom, from its own lowest vertices at either end, against the ground under it at
	// seven points from end to end: how far the closest is above it (floating) and how far the ground
	// is above the bottom anywhere (dug in).
	const fits = await page.evaluate( () => {

		const { models } = window.twin;
		const ground = models.getGround();
		const V = models.entries[ 0 ].pivot.position.constructor;
		const M = models.entries[ 0 ].pivot.matrixWorld.constructor;
		const { raycaster } = models;
		const groundAt = ( x, z ) => {

			raycaster.set( new V( x, 100, z ), new V( 0, - 1, 0 ) );
			return raycaster.intersectObjects( ground, true ).find( h => h.object.isMesh )?.point.y ?? null;

		};
		return models.entries.filter( e => e.kind === 'row' ).map( entry => {

			entry.pivot.updateMatrixWorld( true );
			const content = entry.pivot.children[ 0 ];
			const worst = { floating: - Infinity, buried: - Infinity };
			content.userData.row.layout.copies.forEach( ( copy, i ) => {

				const a = entry.pivot.localToWorld( new V( copy.a[ 0 ], 0, copy.a[ 1 ] ) );
				const b = entry.pivot.localToWorld( new V( copy.b[ 0 ], 0, copy.b[ 1 ] ) );
				const axis = b.clone().sub( a ).setY( 0 ).normalize();
				const middle = a.clone().add( b ).multiplyScalar( 0.5 );
				const half = a.distanceTo( b ) / 2;
				const ends = [ Infinity, Infinity ];
				for ( const mesh of content.children ) {

					const instance = new M();
					mesh.getMatrixAt( i, instance );
					const world = mesh.matrixWorld.clone().multiply( instance );
					const position = mesh.geometry.attributes.position;
					const p = new V();
					for ( let k = 0; k < position.count; k ++ ) {

						p.fromBufferAttribute( position, k ).applyMatrix4( world );
						const u = p.clone().sub( middle ).setY( 0 ).dot( axis );
						if ( u < - half / 2 ) ends[ 0 ] = Math.min( ends[ 0 ], p.y );
						if ( u > half / 2 ) ends[ 1 ] = Math.min( ends[ 1 ], p.y );

					}

				}

				let closest = Infinity;
				let deepest = - Infinity;
				for ( let s = 0; s <= 6; s ++ ) {

					const u = half * ( s / 3 - 1 ) * 0.9;
					const at = middle.clone().addScaledVector( axis, u );
					const bottom = ends[ 0 ] + ( ends[ 1 ] - ends[ 0 ] ) * ( u + half ) / ( 2 * half );
					const g = groundAt( at.x, at.z );
					closest = Math.min( closest, bottom - g );
					deepest = Math.max( deepest, g - bottom );

				}

				worst.floating = Math.max( worst.floating, closest );
				worst.buried = Math.max( worst.buried, deepest );

			} );
			return { item: entry.params.item, ...worst, tilts: [ Math.min( ...entry.params.tilts ), Math.max( ...entry.params.tilts ) ] };

		} );

	} );
	for ( const fit of fits ) assert.ok( fit.floating <= 0.05 && fit.buried <= 0.05, JSON.stringify( fit ) );
	const [ barriers, cones ] = fits;
	assert.ok( near( barriers.tilts[ 1 ], 5.7, 0.2 ), barriers.tilts.join() );
	assert.deepEqual( cones.tilts, [ 0, 0 ] );
	await pose( 30, 8, 8, 300, - 12 );
	await shot( 'ramp' );
	await page.evaluate( () => {

		const { scene, models } = window.twin;
		const ground = models.getGround();
		ground.splice( ground.indexOf( window.ramp ), 1 );
		scene.remove( window.ramp );

	} );

} );

test( '300 cones are drawn as instances: one more draw call', async () => {

	await pose( 0, - 160, 200, 0, - 50 );
	const before = await page.evaluate( () => window.twin.renderer.info.render.calls );
	await placeRow( 'traffic-cone', [ [ 0, - 149.5 ], [ 0, 149.5 ] ], { spacing: 'every', every: 1, fit: 'centred' } );
	await frames( 3 );
	const after = await page.evaluate( () => window.twin.renderer.info.render.calls );
	const [ row ] = await rows();
	assert.equal( row.count, 300 );
	const parts = await page.evaluate( () => window.twin.models.entries.find( e => e.kind === 'row' ).pivot.children[ 0 ].children.length );
	assert.ok( after - before <= parts, `${ before } -> ${ after } draw calls, ${ parts } part(s)` );

} );

test( 'walking into a row of barriers stops at them; between cones is open', async () => {

	await placeRow( 'jersey-barrier', [ [ - 15, 0 ], [ 15, 0 ] ], {}, { north: 20 } );
	await placeRow( 'traffic-cone', [ [ - 15, 0 ], [ 15, 0 ] ], { spacing: 'every', every: 3 }, { north: 30 } );
	const inside = await page.evaluate( () => {

		const { models, camera } = window.twin;
		const V = camera.position.constructor;
		return { barrier: models.contains( new V( 0.3, 0.4, 20 ) ), cone: models.contains( new V( 0, 0.3, 30 ) ), between: models.contains( new V( - 1.5, 0.3, 30 ) ) };

	} );
	assert.deepEqual( inside, { barrier: true, cone: true, between: false } );
	await page.evaluate( () => {

		const { controls, camera } = window.twin;
		controls.setMode( 'walk' );
		controls.setPose( camera.position.clone().set( - 1.3, 1.7, 16 ), 0, 0 );

	} );
	await frames( 5 );
	await page.keyboard.down( 'KeyW' );
	await page.waitForTimeout( 5000 );
	await page.keyboard.up( 'KeyW' );
	const north = await page.evaluate( () => window.twin.camera.position.z );
	assert.ok( north > 18 && north < 19.7, `stopped at north ${ north }` );

} );

test( 'saved and opened again, rows are as they were', async () => {

	await pose( 0, - 30, 90, 0, - 55 );
	await rowButton( 'lock-block' );
	await drawLine( [ [ - 30, 10 ], [ 0, 30 ], [ 30, 10 ] ] );
	await placeRow( 'traffic-drum', [ [ - 20, 0 ], [ 20, 0 ] ], { spacing: 'every', every: 4, flip: true }, { north: - 10, heading: 30 } );
	await page.waitForTimeout( 800 );
	const saved = await page.evaluate( () => JSON.parse( localStorage.getItem( Object.keys( localStorage ).find( k => k.startsWith( 'neptune-twin.layout.' ) ) ) ).items );
	const other = await newPage( null, page.context() );
	await openApp( other );
	await other.waitForFunction( () => window.twin.models.entries.filter( e => e.kind === 'row' ).length === 2, null, { timeout: 60000 } );
	await frames( 6, other );
	const opened = await other.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'row' ).map( e => window.twin.models.toConfig( e ) ) );
	await other.close();
	const sorted = list => [ ...list ].sort( ( a, b ) => a.params.item.localeCompare( b.params.item ) );
	assert.equal( saved.length, 2 );
	assert.deepEqual( sorted( opened ), sorted( saved ) );

} );

test( 'edited: dots and pluses move, add and take out points; spacing in the Size editor; the item in the P panel', async () => {

	await pose( 0, - 30, 80, 0, - 60 );
	await placeRow( 'jersey-barrier', [ [ - 25, 0 ], [ 25, 0 ] ], {}, { north: 30 } );
	// A click on any copy selects the row.
	await clickAt( - 10, 30, 0.6 );
	await frames( 3 );
	assert.equal( await page.evaluate( () => window.twin.sidebar.getSelected()?.kind ), 'row' );
	await page.evaluate( () => document.querySelector( '.lil-gui.lil-root' ).style.display = 'none' );
	const handles = type => page.evaluate( type => window.twin.sidebar.handles.positions().filter( h => h.type === type ).map( h => ( { index: h.index, x: h.screen.x, y: h.screen.y } ) ), type );
	assert.equal( ( await handles( 'point' ) ).length, 2 );
	assert.equal( ( await handles( 'insert' ) ).length, 1 );
	await shot( 'edit-points-before' );

	// The east end, dragged 15 m north.
	const end = ( await handles( 'point' ) ).find( h => h.index === 1 );
	const to = await screenOf( 25, 45 );
	await page.mouse.move( end.x, end.y );
	await page.mouse.down();
	await page.mouse.move( to.x, to.y, { steps: 6 } );
	await page.mouse.up();
	await frames( 3 );
	let [ row ] = await rows();
	const world = row.config.params.points.map( ( [ e, n ] ) => [ e + row.config.east, n + row.config.north ] );
	assert.ok( near( world[ 0 ][ 0 ], - 25, 0.01 ) && near( world[ 0 ][ 1 ], 30, 0.01 ), world.join( ' ' ) );
	assert.ok( near( world[ 1 ][ 0 ], 25, 0.3 ) && near( world[ 1 ][ 1 ], 45, 0.3 ), world.join( ' ' ) );

	// A click on the plus adds a point; dragging it bends the row; a double-click takes it out.
	const plus = ( await handles( 'insert' ) )[ 0 ];
	await page.mouse.click( plus.x, plus.y );
	await frames( 3 );
	[ row ] = await rows();
	assert.equal( row.config.params.points.length, 3 );
	const straight = row.count;
	const middle = ( await handles( 'point' ) ).find( h => h.index === 1 );
	const bend = await screenOf( 2, 22 );
	await page.mouse.move( middle.x, middle.y );
	await page.mouse.down();
	await page.mouse.move( bend.x, bend.y, { steps: 6 } );
	await page.mouse.up();
	await frames( 3 );
	await shot( 'edit-points-after' );
	[ row ] = await rows();
	assert.notEqual( row.count, straight );
	const bent = ( await handles( 'point' ) ).find( h => h.index === 1 );
	await page.mouse.dblclick( bent.x, bent.y );
	await frames( 3 );
	[ row ] = await rows();
	assert.equal( row.config.params.points.length, 2 );

	// Every 4 m, in the toolbar's Size editor.
	await page.locator( '.selection-toolbar .size' ).click();
	await page.locator( '.size-editor select[name="spacing"]' ).selectOption( { label: 'Every … m' } );
	await page.locator( '.size-editor input[name="every"]' ).fill( '4' );
	await page.locator( '.size-editor button[type="submit"]' ).click();
	[ row ] = await rows();
	const length = lineLength( row.config.params.points );
	assert.equal( row.config.params.spacing, 'every' );
	// No further apart than 4 m: a copy on each end, and the rest evenly between.
	assert.equal( row.count, Math.ceil( length / 4 - 0.02 ) + 1 );

	// Lock blocks end to end, from the P panel's dropdowns.
	await page.evaluate( () => {

		document.querySelector( '.lil-gui.lil-root' ).style.display = '';
		window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'row' ) );
		const folder = [ ...document.querySelectorAll( '.lil-gui.lil-root .lil-gui' ) ].find( f => ! f.classList.contains( 'lil-closed' ) && f.querySelector( '.lil-title' )?.textContent.startsWith( 'Row:' ) );
		const choose = ( name, text ) => {

			const select = [ ...folder.querySelectorAll( '.lil-controller' ) ].find( c => c.querySelector( '.lil-name' )?.textContent === name ).querySelector( 'select' );
			select.selectedIndex = [ ...select.options ].findIndex( o => o.textContent === text );
			select.dispatchEvent( new Event( 'change' ) );

		};
		choose( 'spacing', 'End to end' );
		choose( 'item', 'Concrete lock block (5 x 2.5 ft, ~2.1 t)' );

	} );
	await page.waitForFunction( () => window.twin.models.entries.find( e => e.kind === 'row' )?.params.item === 'lock-block', null, { timeout: 20000 } );
	[ row ] = await rows();
	assert.equal( row.count, Math.floor( length / row.size.x + 1e-9 ) );
	assert.equal( await page.evaluate( () => window.twin.models.entries.find( e => e.kind === 'row' ).state.name ), 'Row: Concrete lock block (5 x 2.5 ft, ~2.1 t)' );

} );

test( 'broken apart into single items where the copies stood, and Undo; deleted, and Undo', async () => {

	await placeRow( 'jersey-barrier', [ [ - 15, 0 ], [ 10, 0 ], [ 15, 8 ] ], { gap: 0.2 }, { north: 30, heading: 15 } );
	const [ row ] = await rows();
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'row' ) ) );
	await pose( 0, - 30, 80, 0, - 60 );
	await page.locator( '.selection-toolbar .split' ).click();
	await page.waitForFunction( n => window.twin.models.entries.filter( e => e.library === 'jersey-barrier' ).length === n, row.count, { timeout: 30000 } );
	const singles = await page.evaluate( () => window.twin.models.entries.filter( e => e.library === 'jersey-barrier' ).map( e => e.state ) );
	assert.equal( await page.evaluate( () => window.twin.models.entries.some( e => e.kind === 'row' ) ), false );
	// Each where its copy was, facing its way: the row's heading less its turn in the row.
	const heading = c => ( ( ( 15 - c.yaw * 180 / Math.PI ) % 360 ) + 360 ) % 360;
	const apart = ( a, b ) => Math.abs( ( ( a - b ) % 360 + 540 ) % 360 - 180 );
	for ( const copy of row.copies ) assert.ok( singles.some( s => near( s.east, copy.east, 0.01 ) && near( s.north, copy.north, 0.01 ) && apart( s.heading, heading( copy ) ) < 0.5 ), JSON.stringify( copy ) );
	await page.locator( '.undo-toast button' ).click();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'row' ) && ! window.twin.models.entries.some( e => e.library === 'jersey-barrier' ), null, { timeout: 20000 } );

	// A downloaded model's copies are clones of it, sharing one geometry: 200 cones in moments.
	await placeRow( 'traffic-cone', [ [ - 298.5, 0 ], [ 298.5, 0 ] ], { spacing: 'every', every: 3 }, { north: - 40 } );
	const broken = await page.evaluate( async () => {

		const { models, rows } = window.twin;
		const t0 = performance.now();
		await rows.breakApart( models.entries.find( e => e.kind === 'row' && e.params.item === 'traffic-cone' ) );
		const cones = models.entries.filter( e => e.library === 'traffic-cone' );
		const geometries = new Set();
		for ( const cone of cones ) cone.pivot.traverse( o => o.isMesh && geometries.add( o.geometry ) );
		models.remove( cones[ 0 ] );
		const kept = [ ...geometries ].every( g => g.attributes.position.count > 0 );
		for ( const cone of cones.slice( 1 ) ) models.remove( cone );
		return { count: cones.length, ms: performance.now() - t0, geometries: geometries.size, kept };

	} );
	assert.equal( broken.count, 200 );
	assert.ok( broken.geometries <= 3 && broken.kept, JSON.stringify( broken ) );
	assert.ok( broken.ms < 3000, `${ broken.ms } ms` );

	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'row' ) ) );
	await page.keyboard.press( 'Delete' );
	assert.equal( await page.evaluate( () => window.twin.models.entries.some( e => e.kind === 'row' ) ), false );
	await page.locator( '.undo-toast button' ).click();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'row' ), null, { timeout: 20000 } );
	const [ back ] = await rows();
	assert.equal( back.count, row.count );
	assert.deepEqual( back.config.params.points, row.config.params.points );

} );

test( 'hidden by hand, by Before and by its category: not drawn and not solid', async () => {

	await placeRow( 'jersey-barrier', [ [ - 15, 0 ], [ 15, 0 ] ], {}, { north: 20 } );
	await pose( 0, - 30, 80, 0, - 60 );
	await page.evaluate( () => window.twin.sidebar.select( window.twin.models.entries.find( e => e.kind === 'row' ) ) );
	await frames( 2 );
	await page.locator( '.selection-toolbar .hide' ).click();
	const state = () => page.evaluate( () => {

		const { models, camera } = window.twin;
		return { drawn: models.entries.find( e => e.kind === 'row' ).pivot.visible, solid: models.contains( new camera.position.constructor( 0.3, 0.4, 20 ) ) };

	} );
	assert.deepEqual( await state(), { drawn: false, solid: false } );
	assert.equal( await page.evaluate( () => document.querySelector( '#layers .hidden-items' ).hidden ), false );
	await page.evaluate( () => window.twin.layers.showAll() );
	assert.deepEqual( await state(), { drawn: true, solid: true } );
	await page.keyboard.press( 'KeyB' );
	assert.deepEqual( await state(), { drawn: false, solid: false } );
	await page.keyboard.press( 'KeyB' );
	await page.evaluate( () => window.twin.layers.setLayerShown( 'category:Barriers & fencing', false ) );
	assert.deepEqual( await state(), { drawn: false, solid: false } );
	await page.evaluate( () => window.twin.layers.setLayerShown( 'category:Barriers & fencing', true ) );
	assert.deepEqual( await state(), { drawn: true, solid: true } );

} );

test( 'Pro items stay locked for new rows; one already placed still opens', async () => {

	await placeRow( 'telehandler-12k', [ [ - 10, 0 ], [ 10, 0 ] ], {}, { north: 50 } );
	await placeRow( 'jersey-barrier', [ [ - 10, 0 ], [ 10, 0 ] ], {}, { north: 20 } );
	// The pack locked, as premium.js locks it while it isn't bought.
	await page.evaluate( () => {

		window.picked = [];
		window.twin.sidebar.setGate( { isLocked: () => true, onLocked: item => window.picked.push( item.id ) } );

	} );
	try {

		await rowButton( 'telehandler-12k' );
		assert.deepEqual( await page.evaluate( () => ( { picked: window.picked, drawing: !! window.twin.sidebar.getLine() } ) ), { picked: [ 'telehandler-12k' ], drawing: false } );
		// A row can't be changed to one either.
		await page.evaluate( () => window.twin.models.setParams( window.twin.models.entries.find( e => e.params?.item === 'jersey-barrier' ), { item: 'forklift-5000lb' } ) );
		await frames( 2 );
		assert.deepEqual( await page.evaluate( () => window.twin.models.entries.filter( e => e.kind === 'row' ).map( e => e.params.item ).sort() ), [ 'jersey-barrier', 'telehandler-12k' ] );
		assert.deepEqual( await page.evaluate( () => window.picked ), [ 'telehandler-12k', 'forklift-5000lb' ] );
		assert.ok( ( await rows() ).find( r => r.config.params.item === 'telehandler-12k' ).count >= 2 );

	} finally {

		await page.evaluate( () => window.twin.sidebar.setGate( null ) );

	}

} );

test( 'made from a placed item; Enter, Backspace and Esc; the spacing remembered', async () => {

	await pose( 0, - 30, 80, 0, - 60 );
	await page.evaluate( async () => {

		const { models, sidebar } = window.twin;
		const library = await import( '/src/library.js' );
		const item = ( await library.loadLibrary() ).find( i => i.id === 'jersey-barrier' );
		window.single = await models.load( library.itemConfig( item, { east: - 20, north: 20, heading: 0 } ) );
		sidebar.select( window.single );

	} );
	await frames( 3 );
	await page.locator( '.selection-toolbar .make-row' ).click();
	assert.equal( ( await page.evaluate( () => window.twin.sidebar.getLine() ) ).points, 1 );
	await clickAt( 20, 20 );
	await page.keyboard.press( 'Enter' );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'row' ), null, { timeout: 20000 } );
	const [ made ] = await rows();
	// It takes the barrier's place, its first copy where that one stood.
	assert.equal( await page.evaluate( () => window.twin.models.entries.includes( window.single ) ), false );
	assert.ok( near( made.copies[ 0 ].east, - 20, 0.05 ) && near( made.copies[ 0 ].north, 20, 0.05 ), JSON.stringify( made.copies[ 0 ] ) );
	await page.evaluate( () => {

		window.twin.sidebar.deselect();
		window.twin.layout.clear();

	} );

	await rowButton( 'traffic-drum' );
	await clickAt( - 20, 10 );
	await page.keyboard.press( 'Escape' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.getLine() ), null );
	assert.equal( await page.locator( '.row-panel' ).isVisible(), false );
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 0 );

	await rowButton( 'traffic-drum' );
	await page.locator( '.row-panel .amount input' ).fill( '5' );
	await page.locator( '.row-panel .amount input' ).press( 'Enter' );
	for ( const [ e, n ] of [ [ - 20, 10 ], [ 0, 10 ], [ 0, 30 ] ] ) await clickAt( e, n );
	await page.keyboard.press( 'Backspace' );
	assert.equal( ( await page.evaluate( () => window.twin.sidebar.getLine() ) ).points, 2 );
	await page.keyboard.press( 'Enter' );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'row' ), null, { timeout: 20000 } );
	const [ drums ] = await rows();
	assert.equal( drums.config.params.points.length, 2 );
	assert.equal( drums.config.params.every, 5 );
	assert.equal( drums.count, 5 );
	await page.evaluate( () => window.twin.sidebar.deselect() );
	await rowButton( 'traffic-drum' );
	assert.equal( await page.locator( '.row-panel .amount input' ).inputValue(), '5' );
	await page.keyboard.press( 'Escape' );

} );

test( 'on a phone: Row without hovering, the sheet out of the way, taps and Done, the row\'s dots clear of it', async () => {

	const phone = await newPage( { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } );
	try {

		await openApp( phone );
		await pose( 0, - 20, 60, 0, - 60, phone );
		await phone.locator( '#library-toggle' ).tap();
		const card = phone.locator( '#library .card[data-item="jersey-barrier"]' );
		await card.scrollIntoViewIfNeeded();
		assert.ok( await card.locator( '.row-chip' ).isVisible() );
		await card.locator( '.row-chip' ).tap();
		const laidOut = await phone.evaluate( () => ( { library: getComputedStyle( document.getElementById( 'library' ) ).display, panel: document.querySelector( '.row-panel' ).getBoundingClientRect().toJSON() } ) );
		assert.equal( laidOut.library, 'none' );
		assert.ok( laidOut.panel.left >= 0 && laidOut.panel.right <= 390, JSON.stringify( laidOut.panel ) );
		for ( const [ e, n ] of [ [ - 12, 25 ], [ 6, 25 ], [ 12, 40 ] ] ) {

			const s = await screenOf( e, n, 0, phone );
			await phone.touchscreen.tap( s.x, s.y );
			// Apart, so two taps aren't a double-tap.
			await phone.waitForTimeout( 450 );

		}

		assert.equal( ( await phone.evaluate( () => window.twin.sidebar.getLine() ) ).points, 3 );
		await shot( 'phone-drawing', phone );
		await phone.locator( '.row-panel .done' ).tap();
		await phone.waitForFunction( () => window.twin.models.entries.some( e => e.kind === 'row' ), null, { timeout: 20000 } );
		const [ row ] = await rows( phone );
		assert.equal( row.config.params.points.length, 3 );
		// The sheet stays folded, so that the new row and the dots to change it aren't under it.
		assert.equal( await phone.evaluate( () => document.getElementById( 'library' ).hidden ), true );
		await phone.waitForFunction( () => window.twin.sidebar.handles.positions().filter( h => h.type === 'point' ).length === 3, null, { timeout: 5000 } );

	} finally {

		await phone.context().close();

	}

} );

test( 'no page errors', () => {

	assert.deepEqual( errors, [] );

} );
