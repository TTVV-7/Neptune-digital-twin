// npm run test:earthworks-slope-ui: excavations and stockpiles on sloping ground, and hidden, in a
// real browser against the Vite dev server with no Google tiles; every request that isn't to the
// local server is blocked. The stand-in ground is tilted up 8% to the east. A pit's fence doesn't
// change the ground it snaps to, and stands on the ground uphill; a pit deeper on its uphill side
// than set says so in its P panel; a hidden pit or pile leaves the ground as it was (and a hidden
// pit's shoring goes too); a ramp can't come up through a shored front; the spoil pile isn't
// poured across a ramp.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port, or TEST_BASE=<url> uses a dev
// server that's already running (started without a Maps key).

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5188;

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
	await page.goto( `${ base }/?prompt` );
	await page.click( '#skip' );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout && window.twin.terrain );
	await dropProjectModels( page );
	await page.evaluate( async () => {

		const { models, terrain } = window.twin;
		for ( const entry of [ ...models.entries ] ) models.remove( entry );
		const flat = terrain.standIn.height.bind( terrain.standIn );
		terrain.standIn.height = ( x, z ) => {

			const y = flat( x, z );
			return y === null ? null : y + 0.08 * - x;

		};
		window.kinds = await import( '/src/kinds.js' );

	} );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

// Place a kind and wait until it has snapped and the ground under it is worked out.
async function place( config ) {

	return page.evaluate( async config => {

		const { models } = window.twin;
		const entry = await models.load( { heading: 0, up: null, ...config } );
		window.placed ??= [];
		window.placed.push( entry );
		await window.settle( entry );
		return window.placed.length - 1;

	}, config );

}

// Wait for an entry to snap again and the terrain to catch up.
async function settleFn() {

	await page.evaluate( () => {

		window.settle = async entry => {

			const { terrain } = window.twin;
			const end = performance.now() + 15000;
			entry.snapped = false;
			window.twin.models.snap( entry );
			while ( performance.now() < end ) {

				terrain.flush();
				if ( entry.snapped && [ ...terrain.chunks.values() ].every( c => c.ready ) ) break;
				await new Promise( resolve => setTimeout( resolve, 50 ) );

			}

			await new Promise( resolve => setTimeout( resolve, 100 ) );
			terrain.flush();

		};

	} );

}

test( 'a pit\'s fence leaves its rim and cut alone, and stands on the ground uphill', async () => {

	await settleFn();
	const i = await place( { kind: 'excavation', east: - 60, north: 0, params: { width: 20, length: 20, depth: 2 } } );
	const out = await page.evaluate( async i => {

		const { models, earthworks, terrain } = window.twin;
		const entry = window.placed[ i ];
		const before = { up: entry.state.up, cut: terrain.designVolume( entry ).cut };
		models.setParams( entry, { fence: 'mesh' } );
		await window.settle( entry );
		const fenced = { up: entry.state.up, cut: terrain.designVolume( entry ).cut };
		// The fence's top along its uphill (east, -x) side and its downhill side.
		const fence = entry.pivot.getObjectByName( 'Temporary fence' );
		fence.updateWorldMatrix( true, true );
		const tops = { east: - Infinity, west: - Infinity };
		const m = fence.matrixWorld.clone();
		const p = fence.position.clone();
		fence.traverse( o => {

			if ( ! o.isInstancedMesh ) return;
			for ( let k = 0; k < o.count; k ++ ) {

				o.getMatrixAt( k, m );
				p.setFromMatrixPosition( m ).applyMatrix4( o.matrixWorld );
				// Only the east and west sides themselves, 11.3 m out.
				const out = - p.x - entry.state.east;
				if ( Math.abs( out ) < 10.5 ) continue;
				const side = out > 0 ? 'east' : 'west';
				tops[ side ] = Math.max( tops[ side ], p.y );

			}

		} );
		const rim = earthworks.designs.get( entry ).rim;
		return { before, fenced, rim, tops };

	}, i );
	assert.equal( out.fenced.up, out.before.up, 'the fence doesn\'t move the rim' );
	assert.ok( Math.abs( out.fenced.cut - out.before.cut ) < 1, `nor the cut: ${ out.before.cut } then ${ out.fenced.cut } m³` );
	// About 0.08 × 24 m higher on the east side than the west.
	assert.ok( out.tops.east - out.tops.west > 1.2, `the fence climbs the slope: west ${ out.tops.west.toFixed( 2 ) }, east ${ out.tops.east.toFixed( 2 ) } (rim ${ out.rim })` );

} );

test( 'a pit deeper uphill than set says so in its P panel', async () => {

	const out = await page.evaluate( () => {

		const entry = window.placed[ 0 ];
		const note = window.kinds.getKind( 'excavation' ).readouts.find( r => r.label === 'sloping ground' );
		return note.get( entry );

	} );
	const deep = Number( out.match( /about ([\d.]+) m/ )?.[ 1 ] );
	assert.ok( deep > 3 && deep < 5, `deepest side about 2 + 0.08 × 22..24 m: ${ out }` );

} );

test( 'a hidden pit or pile leaves the ground as it was, and a hidden pit\'s shoring goes too', async () => {

	const p = await place( { kind: 'excavation', east: 60, north: 60, params: { width: 10, length: 10, depth: 3, method: 'shore', support: 'sheet-piles' } } );
	const s = await place( { kind: 'stockpile', east: 60, north: - 60, params: { material: 'gravel', shape: 'cone', volume: 50 } } );
	const out = await page.evaluate( async ( [ p, s ] ) => {

		const { models, terrain, shoring } = window.twin;
		const pit = window.placed[ p ];
		const pile = window.placed[ s ];
		const read = () => {

			terrain.flush();
			return {
				pit: terrain.heightAt( - 60, 60 ) - terrain.groundAt( - 60, 60 ),
				pile: terrain.heightAt( - 60, - 60 ) - terrain.groundAt( - 60, - 60 ),
				shoring: shoring.shown.get( pit )?.group.visible,
			};

		};
		const shown = read();
		models.setHidden( pit, true );
		models.setHidden( pile, true );
		const hidden = read();
		const cut = window.kinds.getKind( 'excavation' ).readouts.find( r => r.label === 'cut (bank)' ).get( pit );
		models.setHidden( pit, false );
		models.setHidden( pile, false );
		await new Promise( resolve => setTimeout( resolve, 300 ) );
		return { shown, hidden, cut, again: read() };

	}, [ p, s ] );
	assert.ok( out.shown.pit < - 2.5, `the pit is dug: ${ out.shown.pit }` );
	assert.ok( out.shown.pile > 1, `the pile is up: ${ out.shown.pile }` );
	assert.equal( out.shown.shoring, true );
	assert.ok( Math.abs( out.hidden.pit ) < 0.05, `hidden, no hole: ${ out.hidden.pit }` );
	assert.ok( Math.abs( out.hidden.pile ) < 0.05, `hidden, no pile: ${ out.hidden.pile }` );
	assert.equal( out.hidden.shoring, false, 'a hidden pit\'s shoring is hidden' );
	assert.ok( parseFloat( out.cut ) > 250, `a hidden pit's P panel still gives its cut: ${ out.cut }` );
	assert.ok( out.again.pit < - 2.5 && out.again.pile > 1 && out.again.shoring === true, `shown again: ${ JSON.stringify( out.again ) }` );

} );

test( 'a ramp can\'t come up through a shored front, and the spoil pile keeps off a ramp', async () => {

	const out = await page.evaluate( () => {

		const kind = window.kinds.getKind( 'excavation' );
		return {
			shored: kind.normalize( { width: 20, length: 12, depth: 3, method: 'shore', support: 'sheet-piles', access: 'ramp' } ).access,
			sloped: kind.normalize( { width: 20, length: 12, depth: 3, method: 'slope', access: 'ramp' } ).access,
		};

	} );
	assert.equal( out.shored, 'none' );
	assert.equal( out.sloped, 'ramp' );

	// A pit wider than long, with a ramp out of its front (north): the pile goes off the back.
	const i = await place( { kind: 'excavation', east: - 60, north: - 80, params: { width: 20, length: 12, depth: 2, method: 'slope', access: 'ramp' } } );
	const north = await page.evaluate( async i => {

		const pile = await window.twin.earthworks.spoil( window.placed[ i ] );
		return pile.state.north;

	}, i );
	assert.ok( north < - 80 - 6, `the spoil pile is south of the pit, away from the ramp: ${ north }` );
	assert.deepEqual( errors, [] );

} );
