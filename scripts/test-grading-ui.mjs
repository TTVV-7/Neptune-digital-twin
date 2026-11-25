// npm run test:grading-ui: graded flatten areas (grade.js, flatten.js, terrain.js) in a real
// browser, against the Vite dev server with no Google tiles; every request that isn't to the local
// server is blocked. The stand-in ground is tilted for the test (8% up to the east, 3% up to the
// north, with a 2 m "shed" on it), so there is a slope to grade against. A level area is as it
// always was and saves as before; following the ground lies on the plane through it with the shed
// smoothed away; one slope, a crown, a swale and terraces give the heights they should; a pad
// built up on the slope has an embankment at its batter ratio, and a cut slope where it's dug in;
// the earth moved is worked out; what's saved loads again the same; a pit's floor comes from the
// graded shape, and its rim from the pad or the embankment where it's built up. The Before view
// leaves the earth moved as it was; 'flatten up to' bounds what's hidden over the area; a cut slope
// meeting another area's embankment leaves no cliff; a large area's chunks are made over the next
// frames, and a huge one is only pressed down. The resize label names the downhill side when turned.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev
// server that's already running (started without a Maps key); TEST_SCREENSHOTS=<folder> saves
// pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5187;
const SHOTS = process.env.TEST_SCREENSHOTS;

let browser;
let vite;
let page;
let base;
const errors = [];

before( async () => {

	const { chromium } = require( 'playwright' );
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
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout && window.twin.terrain );
	await dropProjectModels( page );
	await page.evaluate( () => {

		const { models, terrain } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );
		// The test's ground: a slope, and a 2 m shed standing on it (14..18 m east, 2..6 m north of
		// the follow area's middle, at 40 m east).
		const flat = terrain.standIn.height.bind( terrain.standIn );
		window.slopeAt = ( east, north ) => 0.08 * east + 0.03 * north;
		terrain.standIn.height = ( x, z ) => {

			const y = flat( x, z );
			if ( y === null ) return null;
			const east = - x, north = z;
			const shed = east > 42 && east < 46 && north > 2 && north < 6 ? 2 : 0;
			return y + window.slopeAt( east, north ) + shed;

		};

	} );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function look( { east, north, distance, from, elevation } ) {

	await page.evaluate( ( { east, north, distance, from, elevation } ) => {

		const { controls, camera } = window.twin;
		const r = Math.PI / 180;
		const h = distance * Math.cos( elevation * r );
		const ce = east + h * Math.sin( from * r );
		const cn = north + h * Math.cos( from * r );
		const heading = ( Math.atan2( east - ce, north - cn ) / r + 360 ) % 360;
		controls.setPose( camera.position.clone().set( - ce, distance * Math.sin( elevation * r ) + 0.08 * east, cn ), heading, - elevation );

	}, { east, north, distance, from, elevation } );

}

async function shot( name ) {

	await page.waitForTimeout( 1200 );
	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

// Place an area and wait until it has snapped and the ground under it is worked out.
async function area( config ) {

	return page.evaluate( async config => {

		const { models, terrain } = window.twin;
		const entry = await models.load( { kind: 'flatten-zone', heading: 0, up: null, ...config } );
		const end = performance.now() + 15000;
		while ( performance.now() < end ) {

			terrain.flush();
			const ready = [ ...terrain.chunks.values() ].every( c => c.ready ) && terrain.pending.length === 0;
			if ( entry.snapped && ready && ( entry.params.grade === 'level' || entry.gradeVolume ) ) break;
			await new Promise( resolve => setTimeout( resolve, 50 ) );

		}

		window.areas ??= [];
		window.areas.push( entry );
		return window.areas.length - 1;

	}, config );

}

// The ground as drawn and walked on at (east, north).
const heightAt = ( east, north ) => page.evaluate( ( [ east, north ] ) => window.twin.terrain.heightAt( - east, north ), [ east, north ] );

const near = ( actual, expected, tolerance, what ) => assert.ok( Math.abs( actual - expected ) <= tolerance, `${ what }: ${ actual?.toFixed?.( 3 ) ?? actual } m, expected ${ expected.toFixed( 3 ) } ± ${ tolerance }` );

test( 'a level area is as it was, and saves as before', async () => {

	const i = await area( { params: { width: 20, length: 14, surface: 'gravel' }, east: - 60, north: 0 } );
	const out = await page.evaluate( i => {

		const entry = window.areas[ i ];
		const { models, terrain } = window.twin;
		return { params: entry.params, saved: models.toConfig( entry ).params, zone: terrain.zones.has( entry ), up: entry.state.up };

	}, i );
	assert.equal( out.params.grade, 'level' );
	assert.deepEqual( out.saved, { width: 20, length: 14, height: 0, surface: 'gravel' }, 'nothing about grading is saved' );
	// Without Google's tiles a level area presses nothing, as before.
	assert.equal( out.zone, false );
	// At the ground's median under it, as surfaced areas always snapped.
	near( out.up, - 4.8, 0.4, 'its height' );

} );

test( 'new areas follow the ground: the plane through it, the shed smoothed away', async () => {

	const grade = await page.evaluate( async () => ( await import( '/src/flatten.js' ) ).defaultGrade() );
	assert.equal( grade, 'follow', 'new areas follow the ground to begin with' );
	const i = await area( { params: { width: 24, length: 16, surface: 'gravel', grade }, east: 40, north: 0 } );
	const out = await page.evaluate( async i => {

		const entry = window.areas[ i ];
		const { getKind } = await import( '/src/kinds.js' );
		const kind = getKind( 'flatten-zone' );
		const { describeGrade } = await import( '/src/grade.js' );
		return {
			up: entry.state.up, slope: entry.groundSlope, fit: entry.params.fit, grade: kind.readouts[ 0 ].get( entry ), saved: window.twin.models.toConfig( entry ).params, label: kind.resize.label( entry.params, 0 ),
			// Turned to face east, the label names the downhill side as the P panel does.
			turned: kind.resize.label( entry.params, 90 ), turnedGrade: describeGrade( entry.params, entry.params.fit, 90 ),
		};

	}, i );
	// The area's frame: x is east and z is south when it faces north.
	near( out.slope.gx, 0.08, 0.01, 'slope east' );
	near( out.slope.gz, - 0.03, 0.01, 'slope along' );
	assert.deepEqual( out.fit, out.slope, 'built on the slope fitted' );
	near( out.up, window_slope( 40, 0 ), 0.1, 'height at the middle' );
	assert.match( out.grade, /follows the ground: 8\.5% down to the west/ );
	assert.match( out.label, /follows the ground: 8\.5% down to the west/ );
	assert.ok( out.turned.includes( out.turnedGrade ), `${ out.turned } names ${ out.turnedGrade }` );
	assert.doesNotMatch( out.turnedGrade, /to the west/ );
	assert.deepEqual( out.saved, { width: 24, length: 16, height: 0, surface: 'gravel', grade: 'follow', batter: 2 } );
	// On the plane, over the shed too.
	for ( const [ e, n ] of [ [ 30, - 6 ], [ 50, 6 ], [ 44, 4 ], [ 40, 0 ] ] ) near( await heightAt( e, n ), window_slope( e, n ), 0.08, `ground at ${ e }, ${ n }` );
	await look( { east: 40, north: 0, distance: 45, from: 200, elevation: 35 } );
	await shot( 'grading-follow' );

} );

function window_slope( east, north ) {

	return 0.08 * east + 0.03 * north;

}

test( 'one slope, a crown, a swale and terraces give the heights they should', async () => {

	// 4% falling to the front (north, as it faces north), pivoting about its middle.
	const slope = await area( { params: { width: 20, length: 20, grade: 'slope', fall: 4, toward: 'front' }, east: 120, north: 0 } );
	const up = await page.evaluate( i => window.areas[ i ].state.up, slope );
	near( up, window_slope( 120, 0 ), 0.1, 'the slope\'s middle' );
	near( await heightAt( 120, 0 ), up, 0.03, 'slope, middle' );
	near( await heightAt( 120, 8 ), up - 0.32, 0.03, 'slope, 8 m to the front' );
	near( await heightAt( 120, - 8 ), up + 0.32, 0.03, 'slope, 8 m back' );
	near( await heightAt( 128, 0 ), up, 0.03, 'slope, across' );

	// Crowned 3% along its length: the crown 3% × 5 m above the middle, the sides as far below.
	const ridge = await area( { params: { width: 20, length: 30, grade: 'ridge', fall: 3, ridgeAlong: 'length' }, east: 200, north: 0 } );
	const ridgeUp = await page.evaluate( i => window.areas[ i ].state.up, ridge );
	near( await heightAt( 200, 5 ), ridgeUp + 0.15, 0.03, 'crown' );
	near( await heightAt( 209.5, 5 ), ridgeUp + 0.15 - 0.285, 0.03, 'crown, 9.5 m east' );
	near( await heightAt( 190.5, - 5 ), ridgeUp + 0.15 - 0.285, 0.03, 'crown, 9.5 m west' );

	// The same as a swale.
	await page.evaluate( i => window.twin.models.setParams( window.areas[ i ], { grade: 'valley' } ), ridge );
	await page.evaluate( () => window.twin.terrain.flush() );
	near( await heightAt( 200, 5 ), ridgeUp - 0.15, 0.03, 'swale' );
	near( await heightAt( 209.5, 5 ), ridgeUp - 0.15 + 0.285, 0.03, 'swale, 9.5 m east' );

	// Three terraces stepping down the 8% to the west, 10 m each: level, 0.8 m apart.
	const terraces = await area( { params: { width: 30, length: 12, grade: 'terraces', steps: 3 }, east: 300, north: 0 } );
	const t = await page.evaluate( i => window.areas[ i ].state.up, terraces );
	near( await heightAt( 300, 0 ), t, 0.04, 'middle bench' );
	near( await heightAt( 302.5, 3 ), t, 0.04, 'middle bench, elsewhere on it' );
	near( await heightAt( 310, 0 ), t + 0.8, 0.05, 'upper bench' );
	near( await heightAt( 313, - 4 ), t + 0.8, 0.05, 'upper bench, elsewhere on it' );
	near( await heightAt( 290, 0 ), t - 0.8, 0.05, 'lower bench' );
	// The batter between benches: 0.8 m over 1.6 m at 2 : 1, half way at the bench's edge.
	near( await heightAt( 305, 0 ), t + 0.4, 0.06, 'between benches' );
	await look( { east: 300, north: 0, distance: 50, from: 170, elevation: 30 } );
	await shot( 'grading-terraces' );

} );

test( 'a pad built up on the slope has an embankment at its batter, and a cut slope where it\'s dug in', async () => {

	// Nearly level (0.5% to the front), 20 m across the 8% slope: 0.8 m above the ground at its west
	// edge and 0.8 m below at its east edge.
	const i = await area( { params: { width: 20, length: 16, surface: 'gravel', grade: 'slope', fall: 0.5, toward: 'front', batter: 2 }, east: 400, north: 0 } );
	const up = await page.evaluate( i => window.areas[ i ].state.up, i );
	const west = [];
	const east = [];
	for ( const d of [ 0, 0.5, 1, 1.5 ] ) {

		west.push( await heightAt( 390 - d, 0 ) );
		east.push( await heightAt( 410 + d, 0 ) );

	}

	near( west[ 0 ], up, 0.03, 'west edge' );
	// Falls away 1 in 2 from the edge.
	near( west[ 0 ] - west[ 2 ], 0.5, 0.03, 'embankment over 1 m' );
	near( west[ 1 ] - west[ 3 ], 0.5, 0.03, 'embankment, the next metre' );
	// and climbs 1 in 2.
	near( east[ 2 ] - east[ 0 ], 0.5, 0.03, 'cut slope over 1 m' );
	// Until each meets the ground: 0.8 m / (0.5 + 0.08) about 1.4 m west, about 1.9 m east.
	near( await heightAt( 386, 0 ), window_slope( 386, 0 ), 0.03, 'the ground beyond the embankment' );
	near( await heightAt( 414, 0 ), window_slope( 414, 0 ), 0.03, 'the ground beyond the cut' );
	const out = await page.evaluate( async i => {

		const entry = window.areas[ i ];
		const { getKind } = await import( '/src/kinds.js' );
		const { rectFrame } = await import( '/src/terrain.js' );
		const kind = getKind( 'flatten-zone' );
		const readouts = Object.fromEntries( kind.readouts.map( r => [ r.label, r.get( entry ) ] ) );
		// A pit inside its west half: its floor is the graded shape's lowest there.
		const floor = window.twin.terrain.floorUnder( rectFrame( 395, 0, 0, 3, 3 ) );
		// A pit at its west edge, where it's built up, starts from the pad, not the ground under it;
		// one on the embankment beyond, from the embankment.
		const original = window.slopeAt( 391, 0 );
		const rim = window.twin.terrain.rimUnder( rectFrame( 393, 0, 0, 2, 2 ), rectFrame( 393, 0, 0, 4, 4 ), original );
		const bankRim = window.twin.terrain.rimUnder( rectFrame( 389.4, 0, 0, 0.3, 0.3 ), rectFrame( 389.4, 0, 0, 2.3, 2.3 ), window.slopeAt( 389.1, 0 ) );
		const bank = window.twin.terrain.heightAt( - 389.1, 0.3 );
		// Drawn there, over the stand-in's own ground.
		const drawn = [ ...window.twin.terrain.chunks.values() ].some( c => c.mesh.visible && c.graded.some( v => v ) );
		return { volume: entry.gradeVolume, readouts, floor, drawn, rim, original, bankRim, bank };

	}, i );
	// Cut and fill about balanced: half the pad is in each, 0.4 m deep on average, plus the batters.
	assert.ok( out.volume.cut > 50 && out.volume.cut < 90 && out.volume.fill > 50 && out.volume.fill < 90, JSON.stringify( out.volume ) );
	assert.match( out.readouts.grade, /0\.5% fall to the front/ );
	assert.match( out.readouts[ 'cut (bank)' ], /^\d+ m³$/ );
	assert.match( out.readouts[ 'fill (compacted)' ], /^\d+ m³$/ );
	near( out.floor, up - 0.015, 0.01, 'a pit\'s floor in it (its front edge, 3 m north)' );
	near( out.rim, up - 0.01, 0.01, 'a pit\'s rim on its fill (its front edge, 2 m north)' );
	assert.ok( out.rim > out.original + 0.4, `rim ${ out.rim } above the ground ${ out.original }` );
	near( out.bankRim, out.bank, 0.08, 'a pit\'s rim on its embankment' );
	assert.ok( out.drawn, 'the graded ground is drawn' );
	await look( { east: 400, north: 0, distance: 40, from: 200, elevation: 25 } );
	await shot( 'grading-batters' );

} );

test( 'what\'s saved loads again the same, and the grade chosen is the next area\'s', async () => {

	const out = await page.evaluate( async () => {

		const { models } = window.twin;
		const { defaultGrade } = await import( '/src/flatten.js' );
		const configs = window.areas.map( entry => models.toConfig( entry ) );
		const again = [];
		for ( const config of configs ) {

			const entry = await models.load( { ...config, east: config.east, north: config.north + 100 } );
			again.push( models.toConfig( entry ).params );
			models.remove( entry );

		}

		// Changed in the P panel (as setParams does): the next area drawn gets it.
		models.setParams( window.areas[ 2 ], { grade: 'terraces' } );
		return { saved: configs.map( c => c.params ), again, next: defaultGrade() };

	} );
	assert.deepEqual( out.again, out.saved );
	assert.deepEqual( out.saved[ 2 ], { width: 20, length: 20, height: 0, grade: 'slope', batter: 2, fall: 4, toward: 'front' } );
	assert.deepEqual( out.saved[ 3 ], { width: 20, length: 30, height: 0, grade: 'valley', batter: 2, fall: 3, ridgeAlong: 'length' } );
	assert.equal( out.next, 'terraces' );

} );

test( 'taking an area away puts the ground back', async () => {

	const out = await page.evaluate( () => {

		const { models, terrain } = window.twin;
		for ( const entry of window.areas ) models.remove( entry );
		terrain.flush();
		return { zones: terrain.zones.size, height: terrain.heightAt( - 400, 0 ) };

	} );
	assert.equal( out.zones, 0 );
	near( out.height, window_slope( 400, 0 ), 0.05, 'the ground under the pad' );

} );

test( 'the Before view leaves a graded area\'s cut and fill as they were', async () => {

	const i = await area( { params: { width: 20, length: 16, grade: 'slope', fall: 0.5, toward: 'front', batter: 2 }, east: 600, north: 0 } );
	const out = await page.evaluate( i => {

		const entry = window.areas[ i ];
		const { terrain } = window.twin;
		const before = { ...entry.gradeVolume };
		terrain.setUntouched( true );
		const during = { ...entry.gradeVolume };
		terrain.setUntouched( false );
		const after = { ...entry.gradeVolume };
		window.twin.models.remove( entry );
		return { before, during, after };

	}, i );
	assert.ok( out.before.cut > 10 && out.before.fill > 10, JSON.stringify( out.before ) );
	assert.deepEqual( out.during, out.before );
	near( out.after.cut, out.before.cut, 0.1, 'cut after' );

} );

test( 'flatten up to: Google\'s mesh is hidden over a graded area only up to that height above it', async () => {

	const i = await area( { params: { width: 20, length: 16, grade: 'slope', fall: 0.5, toward: 'front', batter: 2, height: 5 }, east: 700, north: 0 } );
	const out = await page.evaluate( i => {

		const entry = window.areas[ i ];
		const { models, terrain } = window.twin;
		const node = () => {

			const chunk = terrain.owner( Math.round( - 700 / 0.5 ), 0 );
			const k = ( 0 - chunk.j0 ) * 65 + Math.round( - 700 / 0.5 ) - chunk.i0;
			return { base: chunk.base[ k ], ceiling: chunk.ceiling[ k ], finite: Number.isFinite( chunk.ceiling[ k ] ) };

		};
		const limited = node();
		models.setParams( entry, { height: 0 } );
		terrain.flush();
		const all = node();
		models.remove( entry );
		return { limited, all };

	}, i );
	near( out.limited.ceiling, out.limited.base + 5, 0.01, 'the ceiling' );
	assert.equal( out.all.finite, false, 'with no limit, everything above is hidden' );

} );

test( 'where one area\'s cut slope meets another\'s embankment there is no cliff at either edge', async () => {

	const heights = await page.evaluate( async () => {

		const { models, terrain } = window.twin;
		const params = { width: 10, length: 10, grade: 'slope', fall: 0.5, toward: 'front', batter: 2 };
		// 4 m apart: A 2 m above the ground at its east edge, B 2 m below at its west edge.
		const a = await models.load( { kind: 'flatten-zone', heading: 0, east: 800, north: 0, up: window.slopeAt( 805, 0 ) + 2, params } );
		const b = await models.load( { kind: 'flatten-zone', heading: 0, east: 814, north: 0, up: window.slopeAt( 809, 0 ) - 2, params } );
		const end = performance.now() + 15000;
		while ( performance.now() < end && ( terrain.pending.length || ! [ ...terrain.chunks.values() ].every( c => c.ready ) ) ) await new Promise( resolve => setTimeout( resolve, 50 ) );
		terrain.flush();
		const out = [];
		for ( let e = 804; e <= 810.01; e += 0.5 ) out.push( terrain.heightAt( - e, 0 ) );
		models.remove( a );
		models.remove( b );
		return out;

	} );
	near( heights[ 2 ], window_slope( 805, 0 ) + 2, 0.05, 'A\'s edge' );
	near( heights[ 10 ], window_slope( 809, 0 ) - 2, 0.05, 'B\'s edge' );
	const steps = heights.slice( 1 ).map( ( h, n ) => Math.abs( h - heights[ n ] ) );
	// 4.3 m down over 4 m: about 0.55 m a node on average; a cut slope winning outright dropped
	// more than 2 m in one.
	assert.ok( Math.max( ...steps ) < 1.2, `steps ${ steps.map( v => v.toFixed( 2 ) ).join( ' ' ) }` );

} );

test( 'a large graded area makes its chunks over the next frames, and a huge one is only pressed down', async () => {

	const out = await page.evaluate( async () => {

		const { models, terrain } = window.twin;
		const { getKind } = await import( '/src/kinds.js' );
		const kind = getKind( 'flatten-zone' );
		const chunks = terrain.chunks.size;
		const huge = await models.load( { kind: 'flatten-zone', heading: 0, east: 0, north: 900, up: 0, params: { width: 1500, length: 1500, grade: 'follow' } } );
		terrain.flush();
		const hugeOut = { zone: terrain.zones.has( huge ), made: terrain.chunks.size - chunks, grade: kind.readouts[ 0 ].get( huge ) };
		models.remove( huge );
		const start = performance.now();
		const large = await models.load( { kind: 'flatten-zone', heading: 0, east: 0, north: 900, up: 0, params: { width: 250, length: 250, grade: 'slope', fall: 1, toward: 'front' } } );
		const took = performance.now() - start;
		const zone = terrain.zones.get( large );
		const waiting = terrain.pending.length;
		const end = performance.now() + 30000;
		while ( performance.now() < end && terrain.pending.length ) await new Promise( resolve => setTimeout( resolve, 50 ) );
		const all = [ ...zone.chunks ].every( key => terrain.chunks.has( key ) );
		terrain.flush();
		const middle = terrain.heightAt( 0, 900 );
		models.remove( large );
		return { hugeOut, took, waiting, wanted: zone.chunks.size, all, middle };

	} );
	assert.equal( out.hugeOut.zone, false, 'too large to grade: without Google\'s tiles nothing to press' );
	assert.equal( out.hugeOut.made, 0, 'no chunks made for it' );
	assert.match( out.hugeOut.grade, /pressed down only/ );
	assert.ok( out.waiting > 0 && out.waiting < out.wanted, `${ out.waiting } of ${ out.wanted } left for later` );
	assert.ok( out.all, 'all made in the end' );
	near( out.middle, 0, 0.05, 'the graded ground in the middle' );

} );

test( 'no page errors', () => {

	assert.deepEqual( errors, [] );

} );
