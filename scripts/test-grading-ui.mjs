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
// Round 1000 m east, 170 m south the ground is a hillside that isn't a plane (rising 3% to the east
// at one end of an 80 m area, 15% at the other, turning as it goes, with a 1.2 m hump, a 2 m shed
// and an 8 m tree on it): following the ground stays within 0.3 m of the bare ground where the best-fit plane is
// metres out; the smoothing changes how closely it hugs it; the steepest caps it; it saves and loads.
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
		// The hillside's bare ground: 3% up to the east at 960 m east, steepening to 15% at 1040 m,
		// turning as it goes (6% down to the north at the west end, 6% up at the east end), with a
		// hump 1.2 m high and about 16 m across at (1010, -165).
		window.hillAt = ( east, north ) => {

			const u = east - 960;
			return 0.03 * u + 0.00075 * u * u + 0.0015 * ( east - 1000 ) * ( north + 170 ) + 1.2 * Math.exp( - ( ( east - 1010 ) ** 2 + ( north + 165 ) ** 2 ) / 128 );

		};
		// And what stands on it: a 2 m shed (975..979 east, -160..-156 north) and an 8 m tree 5 m
		// across at (1025, -185).
		window.onHill = ( east, north ) => ( east > 975 && east < 979 && north > - 160 && north < - 156 ? 2 : 0 ) + ( Math.hypot( east - 1025, north + 185 ) < 2.5 ? 8 : 0 );
		terrain.standIn.height = ( x, z ) => {

			const y = flat( x, z );
			if ( y === null ) return null;
			const east = - x, north = z;
			if ( east > 900 && east < 1100 && north > - 260 && north < - 80 ) return y + window.hillAt( east, north ) + window.onHill( east, north );
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

// The ground the walker stands on over an area (every 2 m, 0.5 m in from its edges): the worst
// difference from the area's floor, and how much of it is fill (the stand-in's slope below the floor).
async function walkedOn( i ) {

	return page.evaluate( i => {

		const entry = window.areas[ i ];
		const { controls } = window.twin;
		const { east, north, up } = entry.state;
		const { width, length } = entry.params;
		let worst = 0, fill = 0, n = 0;
		for ( let de = - width / 2 + 0.5; de <= width / 2 - 0.5; de += 2 ) for ( let dn = - length / 2 + 0.5; dn <= length / 2 - 0.5; dn += 2 ) {

			const hit = controls.groundHit( - ( east + de ), up + 3, north + dn );
			worst = Math.max( worst, hit ? Math.abs( hit.point.y - up ) : Infinity );
			if ( window.slopeAt( east + de, north + dn ) < up - 0.3 ) fill ++;
			n ++;

		}

		return { worst, fill: fill / n };

	}, i );

}

test( 'a level area is level, saves as before, and is walked on at its floor, fill and all', async () => {

	const i = await area( { params: { width: 20, length: 14, surface: 'gravel' }, east: - 60, north: 0 } );
	const out = await page.evaluate( i => {

		const entry = window.areas[ i ];
		const { models, terrain } = window.twin;
		return { params: entry.params, saved: models.toConfig( entry ).params, holds: terrain.zones.get( entry )?.chunks?.size ?? 0, up: entry.state.up };

	}, i );
	assert.equal( out.params.grade, 'level' );
	assert.deepEqual( out.saved, { width: 20, length: 14, height: 0, surface: 'gravel' }, 'nothing about grading is saved' );
	// Its floor is held in chunks of its own, with or without Google's tiles.
	assert.ok( out.holds > 0, 'it holds its floor' );
	// At the ground's median under it, as surfaced areas always snapped: about half of it is built up.
	near( out.up, - 4.8, 0.4, 'its height' );
	const walked = await walkedOn( i );
	assert.ok( walked.fill > 0.3, `${ ( walked.fill * 100 ).toFixed( 0 ) }% of it is over lower ground` );
	near( walked.worst, 0, 0.02, 'the ground walked on, from its floor' );
	// Beside it the slope is as it was.
	near( await heightAt( - 75, 0 ), 0.08 * - 75, 0.05, 'the slope beside it' );

	// One with no surface, set above the ground (not snapped down to its lowest): the same.
	const bare = await page.evaluate( async () => {

		const { models, terrain } = window.twin;
		const entry = await models.load( { kind: 'flatten-zone', heading: 0, east: - 100, north: 40, up: - 6.6, params: { width: 16, length: 12 } } );
		for ( let t = 0; t < 100 && ! terrain.zones.has( entry ); t ++ ) await new Promise( resolve => setTimeout( resolve, 50 ) );
		terrain.flush();
		window.areas.push( entry );
		return window.areas.length - 1;

	} );
	const bareWalked = await walkedOn( bare );
	assert.ok( bareWalked.fill > 0.3, `${ ( bareWalked.fill * 100 ).toFixed( 0 ) }% of the bare one is over lower ground` );
	near( bareWalked.worst, 0, 0.02, 'the ground walked on over the bare one, from its floor' );
	await page.evaluate( () => window.twin.models.remove( window.areas.pop() ) );

} );

test( 'round a level area its edge is the ground beside it, kept above a height or not, and a tree beside it is no spike', async () => {

	// On the slope (8% up to the east), its uphill edge at east -50, dug about a metre into it there.
	const i = await area( { params: { width: 20, length: 14, surface: 'gravel', keep: 'height', height: 5 }, east: - 60, north: 60 } );
	for ( const out of [ 0.5, 0.75 ] ) near( await heightAt( - 50 + out, 60 ), 0.08 * ( - 50 + out ) + 0.03 * 60, 0.05, `${ out } m outside its uphill edge` );
	const ring = await page.evaluate( i => {

		const { terrain } = window.twin;
		const entry = window.areas[ i ];
		const node = ( east, north ) => {

			const a = Math.round( - east / 0.5 ), b = Math.round( north / 0.5 );
			const chunk = terrain.owner( a, b );
			return { chunk, k: ( b - chunk.j0 ) * 65 + a - chunk.i0 };

		};
		// Google's mesh just outside it isn't hidden up to its height limit (it's not in the area).
		const outside = node( - 49.5, 60 );
		const ceiling = outside.chunk.ceiling[ outside.k ];
		// A tree's crown read as the ground at a node just outside it: drawn (with Google's tiles) no
		// higher than the ground round it, and the ground beside it as it is.
		const { chunk, k } = outside;
		const saved = [ chunk.surface[ k ], chunk.base[ k ] ];
		chunk.surface[ k ] = chunk.base[ k ] = saved[ 0 ] + 6;
		const changed = new Uint8Array( 65 * 65 );
		for ( let n = 0; n < changed.length; n ++ ) changed[ n ] = Math.abs( chunk.surface[ n ] - chunk.base[ n ] ) > 0.02 || chunk.graded[ n ] ? 1 : 0;
		const drawn = terrain.lipHeights( chunk, changed, chunk.shown );
		const beside = node( - 49.5, 62 );
		const out = { ceiling, shown: chunk.shown[ k ], ground: saved[ 0 ], tree: drawn[ k ], beside: drawn[ beside.k ], besideGround: chunk.surface[ beside.k ], floor: entry.state.up };
		[ chunk.surface[ k ], chunk.base[ k ] ] = saved;
		return out;

	}, i );
	assert.equal( ring.ceiling, Infinity, 'nothing hidden up to its height limit outside it' );
	assert.equal( ring.shown, 1, 'the node is in the ring drawn round it' );
	assert.ok( ring.tree < ring.ground + 0.3, `the tree beside it drawn ${ ( ring.tree - ring.ground ).toFixed( 2 ) } m above the ground, not 6 m` );
	assert.ok( ring.tree > ring.floor, 'nor down to its floor (it\'s dug in there)' );
	near( ring.beside, ring.besideGround, 0.3, 'the ground beside it as it is' );
	await page.evaluate( () => window.twin.models.remove( window.areas.pop() ) );

} );

test( 'the walking character is drawn after the ground and a pad\'s surface', async () => {

	const orders = await page.evaluate( async () => {

		const { player, scene } = window.twin;
		const end = performance.now() + 20000;
		while ( ! player.loaded && performance.now() < end ) await new Promise( resolve => setTimeout( resolve, 100 ) );
		const { PLACED_ORDER } = await import( '/src/models.js' );
		const out = [];
		scene.traverse( o => {

			let named = false;
			for ( let p = o; p; p = p.parent ) if ( p.name?.startsWith( 'Player:' ) ) named = true;
			if ( named && o.isMesh ) out.push( o.renderOrder - PLACED_ORDER );

		} );
		return out;

	} );
	assert.ok( orders.length > 0, 'the character is in the scene' );
	assert.ok( orders.every( d => d >= 0 ), `render orders less PLACED_ORDER: ${ orders.join() }` );

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
	assert.match( out.grade, /follows the ground, smoothed over 10 m: 8\.5% down to the west/ );
	assert.match( out.label, /follows the ground, smoothed over 10 m: 8\.5% down to the west/ );
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

// Wait until an area changed has snapped again and the ground under it is worked out.
async function settle( i ) {

	await page.evaluate( async i => {

		const { terrain } = window.twin;
		const entry = window.areas[ i ];
		const end = performance.now() + 15000;
		while ( performance.now() < end ) {

			terrain.flush();
			const ready = [ ...terrain.chunks.values() ].every( c => c.ready ) && terrain.pending.length === 0;
			if ( entry.snapped && ready && entry.gradeVolume ) break;
			await new Promise( resolve => setTimeout( resolve, 50 ) );

		}

		await new Promise( resolve => setTimeout( resolve, 300 ) );
		terrain.flush();

	}, i );

}

// How far the drawn ground is off the hillside's bare ground over the 80 × 50 m area at (1000, -170),
// every 2 m, away from the shed and the tree: the worst, and the worst within `inner` m of the hump.
async function hillError() {

	return page.evaluate( () => {

		const { terrain } = window.twin;
		let worst = 0, at = null, sum = 0, n = 0;
		for ( let e = 961; e <= 1039; e += 2 ) for ( let nn = - 194; nn <= - 146; nn += 2 ) {

			if ( Math.hypot( e - 977, nn + 158 ) < 5 || Math.hypot( e - 1025, nn + 185 ) < 5 ) continue;
			const d = terrain.heightAt( - e, nn ) - window.hillAt( e, nn );
			sum += d * d;
			n ++;
			if ( Math.abs( d ) > Math.abs( worst ) ) {

				worst = d;
				at = [ e, nn ];

			}

		}

		return { worst: Math.abs( worst ), signed: worst, at, rms: Math.sqrt( sum / n ) };

	} );

}

// The steepest the drawn ground is over the area (2 m apart, along and across it).
async function steepest() {

	return page.evaluate( () => {

		const { terrain } = window.twin;
		let worst = 0;
		for ( let e = 961; e <= 1037; e += 2 ) for ( let nn = - 194; nn <= - 148; nn += 2 ) {

			const h = terrain.heightAt( - e, nn );
			const ge = ( terrain.heightAt( - e - 2, nn ) - h ) / 2, gn = ( terrain.heightAt( - e, nn + 2 ) - h ) / 2;
			worst = Math.max( worst, Math.hypot( ge, gn ) );

		}

		return worst;

	} );

}

test( 'on a hillside that isn\'t a plane, following the ground stays on it where one plane is metres out', async () => {

	const i = await area( { params: { width: 80, length: 50, grade: 'follow' }, east: 1000, north: - 170 } );
	const follow = await hillError();
	const out = await page.evaluate( async i => {

		const entry = window.areas[ i ];
		const { getKind } = await import( '/src/kinds.js' );
		const kind = getKind( 'flatten-zone' );
		return { grade: kind.readouts[ 0 ].get( entry ), volume: { ...entry.gradeVolume }, saved: window.twin.models.toConfig( entry ).params, grid: entry.params.fit?.grid && [ entry.params.fit.grid.nx, entry.params.fit.grid.nz ], up: entry.state.up };

	}, i );
	console.log( 'follow (10 m):', JSON.stringify( { follow, ...out } ) );
	assert.ok( follow.worst < 0.3, `follow: worst ${ follow.worst.toFixed( 3 ) } m at ${ follow.at }` );
	assert.match( out.grade, /^follows the ground, smoothed over 10 m: \d+-\d+% down to the west$/ );
	assert.deepEqual( out.saved, { width: 80, length: 50, height: 0, grade: 'follow', batter: 2 } );
	assert.ok( out.grid[ 0 ] <= 33 && out.grid[ 1 ] <= 33, `read on a grid of at most 33 × 33: ${ out.grid }` );

	// The best-fit plane through the same ground.
	await page.evaluate( i => window.twin.models.setParams( window.areas[ i ], { grade: 'plane' } ), i );
	await settle( i );
	const plane = await hillError();
	const planeOut = await page.evaluate( async i => {

		const entry = window.areas[ i ];
		const { getKind } = await import( '/src/kinds.js' );
		return { grade: getKind( 'flatten-zone' ).readouts[ 0 ].get( entry ), volume: { ...entry.gradeVolume }, grid: !! entry.params.fit?.grid };

	}, i );
	console.log( 'plane:', JSON.stringify( { plane, ...planeOut } ) );
	assert.ok( plane.worst > 1, `the plane is metres out: ${ plane.worst.toFixed( 2 ) } m` );
	assert.match( planeOut.grade, /^one slope from the ground: [\d.]+% down to the west$/ );
	assert.equal( planeOut.grid, false );
	assert.ok( out.volume.cut + out.volume.fill < ( planeOut.volume.cut + planeOut.volume.fill ) / 3, `earth moved: follow ${ JSON.stringify( out.volume ) }, plane ${ JSON.stringify( planeOut.volume ) }` );

	// The smoothing: 5 m hugs it closer, 40 m is gentler (further off, over the hump).
	const errors = {};
	for ( const smoothing of [ 5, 40 ] ) {

		await page.evaluate( ( [ i, smoothing ] ) => window.twin.models.setParams( window.areas[ i ], { grade: 'follow', smoothing } ), [ i, smoothing ] );
		await settle( i );
		errors[ smoothing ] = await hillError();

	}

	console.log( 'smoothing 5 / 10 / 40 m:', [ errors[ 5 ], follow, errors[ 40 ] ].map( e => `${ e.worst.toFixed( 3 ) } (rms ${ e.rms.toFixed( 3 ) })` ).join( ', ' ) );
	assert.ok( errors[ 5 ].rms < follow.rms && follow.rms < errors[ 40 ].rms, 'the smaller the smoothing, the closer it hugs' );
	assert.ok( errors[ 5 ].worst < 0.15, `5 m: ${ errors[ 5 ].worst }` );
	const saved = await page.evaluate( i => window.twin.models.toConfig( window.areas[ i ] ).params, i );
	assert.equal( saved.smoothing, 40, 'a smoothing other than 10 m is saved' );

	// No steeper than 8% anywhere: the steep end is eased, the rest still follows the ground.
	const before = await steepest();
	await page.evaluate( i => window.twin.models.setParams( window.areas[ i ], { smoothing: 10, maxGrade: 8 } ), i );
	await settle( i );
	const capped = await steepest();
	const cappedGrade = await page.evaluate( async i => ( await import( '/src/kinds.js' ) ).getKind( 'flatten-zone' ).readouts[ 0 ].get( window.areas[ i ] ), i );
	const gentle = await page.evaluate( () => window.twin.terrain.heightAt( - 970, - 180 ) - window.hillAt( 970, - 180 ) );
	console.log( 'steepest:', before.toFixed( 3 ), '→', capped.toFixed( 3 ), cappedGrade, 'off the ground at the gentle end', gentle.toFixed( 2 ) );
	assert.ok( before > 0.12, `the ground is steeper than that: ${ before }` );
	assert.ok( capped < 0.085, `capped at 8%: ${ capped }` );
	assert.match( cappedGrade, /smoothed over 10 m: \d+-8% down to the west/ );

	// Saved and loaded again: the same surface.
	const again = await page.evaluate( async i => {

		const { models, terrain } = window.twin;
		const { sameFit } = await import( '/src/grade.js' );
		const entry = window.areas[ i ];
		const config = models.toConfig( entry );
		const before = terrain.heightAt( - 1030, - 160 );
		models.remove( entry );
		const loaded = await models.load( config );
		const end = performance.now() + 15000;
		while ( performance.now() < end && ! ( loaded.snapped && loaded.gradeVolume && terrain.pending.length === 0 ) ) {

			terrain.flush();
			await new Promise( resolve => setTimeout( resolve, 50 ) );

		}

		terrain.flush();
		window.areas[ i ] = loaded;
		return { saved: config.params, params: models.toConfig( loaded ).params, same: sameFit( entry.params.fit, loaded.params.fit ), before, after: terrain.heightAt( - 1030, - 160 ) };

	}, i );
	assert.deepEqual( again.saved, { width: 80, length: 50, height: 0, grade: 'follow', batter: 2, maxGrade: 8 } );
	assert.deepEqual( again.params, again.saved );
	assert.ok( again.same, 'the same surface fitted' );
	near( again.after, again.before, 0.02, 'loaded, the ground there' );
	await page.evaluate( i => window.twin.models.remove( window.areas[ i ] ), i );

} );

test( 'keeping what\'s overhead: under a stand-in overpass its curtains are hidden and walked through, its deck kept', async () => {

	// A deck 10 m wide running north-south, its underside 6 m over a level area 24 × 20 m on the
	// slope at (300, -100), with curtains hanging from both its edges down past the ground (as Google's
	// photogrammetry hangs them), standing in for Google's mesh: its own ground for walking, its
	// material hidden by the earthworks' mask, read for what's overhead.
	const out = await page.evaluate( async () => {

		const { Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial, DoubleSide, Group } = await import( '/node_modules/.vite/deps/three.js' );
		const { hideUnderEarthworks } = await import( '/src/terrain.js' );
		const { models, terrain, flattening, controls } = window.twin;
		const east = 300, north = - 100;
		const up = window.slopeAt( east, north );
		const deck = up + 6;
		const bridge = new Group();
		bridge.name = 'stand-in overpass';
		const material = new MeshStandardMaterial( { color: 0x999999, side: DoubleSide } );
		hideUnderEarthworks( material, terrain.mask );
		const slab = new Mesh( new BoxGeometry( 10, 1, 40 ), material );
		slab.position.set( - east, deck + 0.5, north );
		bridge.add( slab );
		for ( const side of [ - 5, 5 ] ) {

			const curtain = new Mesh( new PlaneGeometry( 40, 14 ).rotateY( Math.PI / 2 ), material );
			curtain.position.set( - ( east + side ), deck - 7, north );
			bridge.add( curtain );

		}

		bridge.traverse( o => o.userData.googleTile = true );
		controls.getColliders()[ 0 ].add( bridge );
		bridge.updateMatrixWorld( true );
		flattening.addOverheadRoot( bridge );
		const entry = await models.load( { kind: 'flatten-zone', heading: 0, east, north, up, params: { width: 24, length: 20, keep: 'auto' } } );
		const end = performance.now() + 20000;
		while ( performance.now() < end && ! ( terrain.zones.has( entry ) && flattening.overheadsRead ) ) await new Promise( resolve => setTimeout( resolve, 50 ) );
		await new Promise( resolve => setTimeout( resolve, 300 ) );
		terrain.flush();
		terrain.updateMask();
		const node = ( e, n ) => {

			const i = Math.round( - e / 0.5 ), j = Math.round( n / 0.5 );
			const chunk = terrain.owner( i, j );
			return chunk.ceiling[ ( j - chunk.j0 ) * 65 + i - chunk.i0 ];

		};
		const V = controls.camera.position.constructor;
		window.overpass = { entry, up, deck, bridge };
		return {
			read: flattening.overheadsRead, up, deck,
			saved: models.toConfig( entry ).params,
			keepUnder: flattening.keepAbove( entry, - east, north ), keepBeside: flattening.keepAbove( entry, - ( east - 9 ), north ),
			ceilingUnder: node( east, north ), ceilingBeside: node( east - 9, north ),
			curtainCovered: terrain.covers( new V( - ( east - 5 ), up + 2, north + 3 ) ),
			deckCovered: terrain.covers( new V( - east, deck, north ) ),
			groundUnder: controls.groundHit( - east, up + 3, north )?.point.y,
		};

	} );
	assert.ok( out.read, 'what\'s overhead has been read' );
	assert.deepEqual( out.saved, { width: 24, length: 20, height: 0, keep: 'auto' } );
	near( out.keepUnder, 6 - 0.3, 0.05, 'kept from under the deck\'s underside' );
	assert.equal( out.keepBeside, Infinity, 'beside the deck everything is flattened (Infinity)' );
	near( out.ceilingUnder, out.up + 5.7, 0.05, 'Google\'s mesh hidden up to there under the deck' );
	assert.equal( out.ceilingBeside, Infinity, 'and all of it beside the deck' );
	assert.ok( out.curtainCovered, 'a curtain is hidden and passed through' );
	assert.ok( ! out.deckCovered, 'the deck is not' );
	near( out.groundUnder, out.up, 0.02, 'the ground under the deck' );

	// Walk east from beside the deck, through its curtain, under it; then jump there.
	await page.evaluate( () => {

		const { controls } = window.twin;
		const { up } = window.overpass;
		controls.setMode( 'walk' );
		controls.setPose( controls.camera.position.clone().set( - 293.5, up + 1.7, - 100 ), 90, 0 );

	} );
	await page.waitForTimeout( 500 );
	await page.keyboard.down( 'KeyW' );
	await page.waitForFunction( () => - window.twin.camera.position.x > 298, null, { timeout: 15000 } ).catch( () => {} );
	await page.keyboard.up( 'KeyW' );
	await page.waitForTimeout( 300 );
	const walked = await page.evaluate( () => {

		const { camera, controls } = window.twin;
		return { east: - camera.position.x, feet: camera.position.y - 1.7, mode: controls.mode };

	} );
	assert.equal( walked.mode, 'walk' );
	assert.ok( walked.east > 297, `walked through the curtain at 295 m east, to ${ walked.east.toFixed( 1 ) }` );
	near( walked.feet, out.up, 0.1, 'feet on the floor under the deck' );
	const top = await page.evaluate( async () => {

		const { camera, controls } = window.twin;
		controls.velocityY = 15;
		controls.grounded = false;
		let top = camera.position.y;
		const end = performance.now() + 1500;
		while ( performance.now() < end ) {

			top = Math.max( top, camera.position.y );
			await new Promise( resolve => requestAnimationFrame( resolve ) );

		}

		return top;

	} );
	assert.ok( top < out.deck, `a jump under the deck stops under it (head at most ${ ( top - out.deck ).toFixed( 2 ) } m from it)` );
	await look( { east: 300, north: - 100, distance: 45, from: 220, elevation: 20 } );
	await shot( 'grading-overpass' );

	// Read again only near it, and never forgotten for a coarser read: with the camera 5 km away
	// and the overpass gone (as Google's tiles there are coarse or unloaded), it isn't read again;
	// back over it, it is, and what was found stands.
	const reread = await page.evaluate( async () => {

		const { flattening, controls, camera } = window.twin;
		const { entry, bridge } = window.overpass;
		const wait = async ( ms, until = () => false ) => {

			const end = performance.now() + ms;
			while ( performance.now() < end && ! until() ) await new Promise( resolve => setTimeout( resolve, 50 ) );

		};
		const keep = () => flattening.keepAbove( entry, - 300, - 100 );
		const reads = flattening.overheadReads;
		controls.setPose( camera.position.clone().set( - 5300, 200, - 100 ), 90, 0 );
		bridge.visible = false;
		flattening.overheadChanged();
		await wait( 4500 );
		const away = { reads: flattening.overheadReads - reads, keep: keep() };
		controls.setPose( camera.position.clone().set( - 330, 40, - 100 ), 90, - 20 );
		await wait( 6000, () => flattening.overheadReads > reads );
		await wait( 6000, () => flattening.overheadsRead );
		const back = { reads: flattening.overheadReads - reads, keep: keep() };
		bridge.visible = true;
		flattening.overheadChanged();
		await wait( 6000, () => flattening.overheadReads > reads + back.reads );
		await wait( 6000, () => flattening.overheadsRead );
		return { away, back, again: { reads: flattening.overheadReads - reads, keep: keep() } };

	} );
	assert.equal( reread.away.reads, 0, 'not read again from 5 km away' );
	near( reread.away.keep, 5.7, 0.05, 'what was found, from 5 km away' );
	assert.equal( reread.back.reads, 1, 'read again back over it' );
	near( reread.back.keep, 5.7, 0.05, 'what was found stands over a coarser read' );
	assert.equal( reread.again.reads, 2, 'and again as more loads' );
	near( reread.again.keep, 5.7, 0.05, 'what\'s found with the overpass there again' );
	await page.evaluate( () => {

		const { models, controls } = window.twin;
		controls.setMode( 'fly' );
		models.remove( window.overpass.entry );
		window.overpass.bridge.removeFromParent();

	} );

} );

test( 'no page errors', () => {

	assert.deepEqual( errors, [] );

} );
