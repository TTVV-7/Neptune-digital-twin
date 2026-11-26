// npm run test:sides-ui: the faces of earth drawn round flatten areas (terrain.js sideClip, and the
// Show panel's 'Cut & fill sides', layers.js) in a real browser, against the Vite dev server with no
// Google tiles; every request that isn't to the local server is blocked. The stand-in ground is
// level for the test. A pad laid at about the ground's height (within a metre) has no band of earth
// round it: what's drawn, and what of Google's mesh is hidden, ends exactly on its outline, a
// straight edge at a heading of 53 degrees, not the grid's steps. Raised 3 m, or dug 1.5 m in, its
// sides are drawn: a face of earth standing straight up along its outline, and nothing past it. A
// graded area's batters are drawn as before. The Show panel's 'Cut & fill sides' hides them all (a graded area's
// batters too), and is remembered in this browser.
//
// The stand-in draws the chunks' whole surface (it has gaps for them), so what's drawn with Google's
// tiles is worked out here as terrain.js does it there: sideClip over the ring each chunk shows.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev
// server that's already running (started without a Maps key); TEST_SCREENSHOTS=<folder> saves
// pictures.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5214;
const PAD = { east: 30, north: 20, heading: 53, width: 5.5, length: 30 };

let browser;
let vite;
let page;
let base;
const errors = [];

before( async () => {

	const { chromium } = require( 'playwright' );
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
	await open();

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

async function open() {

	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout && window.twin.terrain && window.twin.layers );
	await dropProjectModels( page );
	await page.evaluate( () => {

		const { models, terrain } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );
		// Level ground, at 2 m, with something 5 m tall, 8 m across and 9 m long (a few rail cars) standing just off
		// the east edge of where the second test's pad by it goes (6 m wide at 100 m east).
		terrain.standIn.height = ( x, z ) => - x > 103.2 && - x < 111 && z > - 4.5 && z < 4.5 ? 7 : 2;

	} );

}

// Place a flatten area and wait until the ground under it is worked out.
async function place( config ) {

	await page.evaluate( async config => {

		const { models, terrain } = window.twin;
		const entry = await models.load( { kind: 'flatten-zone', ...config } );
		const end = performance.now() + 15000;
		while ( performance.now() < end ) {

			terrain.flush();
			const ready = terrain.zones.get( entry )?.chunks && [ ...terrain.chunks.values() ].every( c => c.ready ) && terrain.pending.length === 0;
			if ( ready && ( ! entry.state.snap || entry.snapped ) && ( entry.params.grade === 'level' || entry.gradeVolume ) ) break;
			await new Promise( resolve => setTimeout( resolve, 50 ) );

		}

		window.areas ??= [];
		window.areas.push( entry );

	}, config );

}

async function clear() {

	await page.evaluate( () => {

		const { models, terrain } = window.twin;
		for ( const entry of window.areas ?? [] ) models.remove( entry );
		window.areas = [];
		terrain.flush();

	} );

}

// What's drawn round area `i` as with Google's tiles: sideClip over each chunk's ring (shown).
// Returns the nodes of the ring outside it (how many, and how many are cut away), clipAt read
// across its outline (inside it a little, outside it a little, and how far off a straight edge),
// and its faces (faceSamples, and what updateFaces draws).
function round( i = 0 ) {

	return page.evaluate( i => {

		const { terrain } = window.twin;
		const entry = window.areas[ i ];
		const zone = terrain.zones.get( entry );
		for ( const chunk of terrain.chunks.values() ) {

			if ( ! chunk.shown ) continue;
			const changed = new Uint8Array( 65 * 65 );
			for ( let k = 0; k < changed.length; k ++ ) changed[ k ] = Math.abs( chunk.surface[ k ] - chunk.base[ k ] ) > 0.02 || chunk.graded[ k ] ? 1 : 0;
			chunk.drawn = terrain.lipHeights( chunk, changed, chunk.shown );
			chunk.sides = terrain.sideClip( chunk, changed, chunk.shown );

		}

		const { hw, hl } = zone.frame;
		const inside = ( x, z ) => {

			const de = - x - zone.frame.east, dn = z - zone.frame.north;
			const u = de * zone.frame.cos - dn * zone.frame.sin, v = de * zone.frame.sin + dn * zone.frame.cos;
			return Math.min( hw - Math.abs( u ), hl - Math.abs( v ) );

		};
		let ring = 0, cut = 0, batters = 0, battersCut = 0, floorOff = 0;
		for ( const chunk of terrain.chunks.values() ) {

			for ( let k = 0; k < 65 * 65; k ++ ) {

				if ( chunk.graded[ k ] === 2 ) {

					batters ++;
					if ( chunk.clip[ k ] < 0 ) battersCut ++;

				}

				if ( ! chunk.shown?.[ k ] ) continue;
				const d = inside( chunk.x( k ), chunk.z( k ) );
				if ( d >= 0 || d < - 1.5 ) continue;
				ring ++;
				if ( chunk.clip[ k ] < 0 ) cut ++;

			}

			// The floor's last nodes, moved onto the outline.
			for ( let k = 0; k < 65 * 65; k ++ ) {

				const x = chunk.sides?.moves[ k * 2 ], z = chunk.sides?.moves[ k * 2 + 1 ];
				if ( x !== undefined && ! Number.isNaN( x ) && Math.abs( inside( x, z ) ) > 0.001 ) floorOff ++;

			}

		}

		// The faces: how many samples round it have one, how high, and whether one is drawn.
		const samples = terrain.faceSamples( zone );
		const tops = samples.filter( s => ! Number.isNaN( s.top ) ).map( s => s.top );
		terrain.facesDirty = true;
		terrain.updateFaces();
		const drawnFaces = terrain.faces.visible ? terrain.faces.geometry.attributes.position.count / 6 : 0;
		const faceOff = terrain.faces.visible ? Math.max( ...Array.from( { length: terrain.faces.geometry.attributes.position.count }, ( _, n ) => Math.abs( inside( terrain.faces.geometry.attributes.position.getX( n ), terrain.faces.geometry.attributes.position.getZ( n ) ) - 0.02 ) ) ) : 0;

		// Along each long side, 0.05 m in and out of the outline, away from the corners: the edge
		// as clipAt has it (the mask and the surface's shader mix it the same way).
		const r = entry.state.heading * Math.PI / 180;
		const across = [ Math.cos( r ), - Math.sin( r ) ], along = [ Math.sin( r ), Math.cos( r ) ];
		const at = ( u, v ) => [ - ( entry.state.east + u * across[ 0 ] + v * along[ 0 ] ), entry.state.north + u * across[ 1 ] + v * along[ 1 ] ];
		let wrongIn = 0, wrongOut = 0, worst = 0, n = 0;
		for ( const side of [ - 1, 1 ] ) for ( let v = - hl + 1; v <= hl - 1; v += 0.137 ) {

			for ( const off of [ - 0.05, 0.05 ] ) {

				const [ x, z ] = at( side * ( hw + off ), v );
				const c = terrain.clipAt( x, z );
				if ( off < 0 && c <= 0 ) wrongIn ++;
				if ( off > 0 && c >= 0 ) wrongOut ++;
				worst = Math.max( worst, Math.abs( c - inside( x, z ) ) );
				n ++;

			}

		}

		return { ring, cut, batters, battersCut, floorOff, wrongIn, wrongOut, worst, n, samples: samples.length, faces: tops.length, highest: Math.max( ...tops ), lowest: Math.min( ...tops ), drawnFaces, faceOff };

	}, i );

}

const pad = ( up, more = {} ) => place( { name: 'Pad', east: PAD.east, north: PAD.north, heading: PAD.heading, up, params: { width: PAD.width, length: PAD.length, surface: 'asphalt', keep: 'auto', grade: 'level' }, ...more } );

test( 'a pad at about the ground\'s height has no band of earth round it, and its edge is straight', async () => {

	for ( const up of [ 2, 2.2, 1.8, 2.6, 1.4, 2.9, 1.1 ] ) {

		await pad( up );
		const out = await round();
		assert.ok( out.ring > 50, `a ring of nodes round it (${ out.ring })` );
		assert.equal( out.cut, out.ring, `at ${ up } m (the ground at 2 m) every node round it is cut away (${ out.cut } of ${ out.ring })` );
		assert.equal( out.wrongIn, 0, `just inside its outline it's drawn (${ out.wrongIn } of ${ out.n / 2 } not)` );
		assert.equal( out.wrongOut, 0, `just outside its outline nothing is (${ out.wrongOut } of ${ out.n / 2 } is)` );
		assert.ok( out.worst < 0.01, `the edge follows its outline, not the grid: ${ out.worst.toFixed( 3 ) } m off` );
		assert.equal( out.floorOff, 0, 'its floor\'s last nodes on its outline' );
		assert.equal( out.faces, 0, 'and no face of earth round it' );
		assert.equal( out.drawnFaces, 0, 'none drawn' );
		await clear();

	}

} );

test( 'a pad well off the ground has its cut or fill sides as before', async () => {

	for ( const up of [ 5, 0.5 ] ) {

		await pad( up );
		const out = await round();
		assert.ok( out.ring > 50, `a ring of nodes round it (${ out.ring })` );
		// Its faces stand straight up along its outline, from its floor to the ground, and nothing
		// is drawn past it.
		assert.equal( out.faces, out.samples, `at ${ up } m (the ground at 2 m) a face of earth all round it (${ out.faces } of ${ out.samples })` );
		assert.ok( Math.abs( out.highest - 2 ) < 0.05 && Math.abs( out.lowest - 2 ) < 0.05, `up or down to the ground: ${ out.lowest.toFixed( 2 ) } to ${ out.highest.toFixed( 2 ) } m` );
		assert.equal( out.drawnFaces, out.samples, `drawn all round (${ out.drawnFaces } quads)` );
		assert.ok( out.faceOff < 0.001, `on its outline, just inside: ${ out.faceOff.toFixed( 4 ) } m off` );
		assert.equal( out.wrongIn + out.wrongOut, 0, 'drawn up to its outline and not past it' );
		assert.ok( out.worst < 0.01, `its outline straight: ${ out.worst.toFixed( 3 ) } m off` );
		await clear();

	}

	// Dug 1.5 m in beside a rail car (read from above, its roof is the ground there): the face is as
	// high as the ground each side of it, not up to the roof in a hump.
	await place( { name: 'By the car', east: 100, north: 0, heading: 0, up: 0.5, params: { width: 6, length: 30, surface: 'asphalt', grade: 'level' } } );
	const car = await round();
	assert.equal( car.faces, car.samples, `a face all round it (${ car.faces } of ${ car.samples })` );
	assert.ok( car.highest < 2.05, `its top at the ground (2 m) beside the car too: ${ car.highest.toFixed( 2 ) } m` );
	await clear();

	// A graded area raised 2 m over the ground: its embankment's batters are drawn.
	await place( { name: 'Graded', east: - 40, north: 20, heading: 20, up: null, params: { width: 16, length: 12, grade: 'slope', fall: 0.5, toward: 'front', batter: 2, raise: 2 } } );
	const graded = await round();
	assert.ok( graded.batters > 50, `it has batters (${ graded.batters } nodes)` );
	assert.equal( graded.battersCut, 0, 'none of them cut away' );
	await clear();
	assert.deepEqual( errors, [] );

} );

test( 'the Show panel\'s Cut & fill sides hides them all, and is remembered', async () => {

	await pad( 5 );
	await place( { name: 'Graded', east: - 40, north: 20, heading: 20, up: null, params: { width: 16, length: 12, grade: 'slope', fall: 0.5, toward: 'front', batter: 2, raise: 2 } } );
	const row = page.locator( '#layers [data-layer="cut-fill-sides"]' );
	await row.waitFor();
	assert.match( await row.textContent(), /Cut & fill sides/ );
	assert.equal( await row.getAttribute( 'aria-pressed' ), 'true' );
	await row.click();
	assert.equal( await row.getAttribute( 'aria-pressed' ), 'false' );
	assert.equal( await page.evaluate( () => window.twin.terrain.sidesShown ), false );
	const raised = await round( 0 );
	assert.equal( raised.cut, raised.ring, `the raised pad's sides are cut away (${ raised.cut } of ${ raised.ring })` );
	assert.equal( raised.wrongOut, 0, 'nothing drawn outside its outline' );
	assert.equal( raised.wrongIn, 0, 'its floor drawn up to it' );
	assert.equal( raised.drawnFaces, 0, 'and no face of earth drawn round it' );
	const graded = await round( 1 );
	assert.ok( graded.batters > 50 && graded.battersCut === graded.batters, `the graded area's batters cut away (${ graded.battersCut } of ${ graded.batters })` );
	// The pads themselves are still there.
	assert.ok( await page.evaluate( () => window.areas[ 0 ].pivot.visible ), 'the pad (its asphalt) is still shown' );

	// Remembered in this browser.
	assert.ok( await page.evaluate( () => JSON.parse( localStorage.getItem( 'neptune-twin.layers' ) ).hidden.includes( 'cut-fill-sides' ) ) );
	await open();
	assert.equal( await page.evaluate( () => window.twin.terrain.sidesShown ), false, 'still hidden after a reload' );
	await pad( 5 );
	await row.waitFor();
	assert.equal( await row.getAttribute( 'aria-pressed' ), 'false' );
	await row.click();
	assert.equal( await page.evaluate( () => window.twin.terrain.sidesShown ), true, 'shown again' );
	const back = await round( 0 );
	assert.ok( back.drawnFaces > 50, `its sides drawn again (${ back.drawnFaces })` );
	await clear();
	assert.deepEqual( errors, [] );

} );
