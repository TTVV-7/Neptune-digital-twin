// node --test scripts/test-drive-lens.mjs: the data lens's numbers (src/drive-app/lens-heights.js,
// src/drive-app/level.js's levelRadius; docs/world-drive.md, "Data lens"), on the worlds' own
// height.bin files, so no browser: the lens on the page is test-drive-lens-ui.mjs's. Every expected
// height here is computed from the grid itself, never typed in from a doc.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { DataUtils } from 'three';
import { levelRadius } from '../src/drive-app/level.js';
import { hasLens, heightWords, hereLine, LENS_WORDS, lensHeightAt, lensRange, lensTexels, lensTicks, NEAR, RAMP, STEPS, tickLabel, whatLine } from '../src/drive-app/lens-heights.js';
import { WORLDS } from '../src/drive-app/worlds.js';

const ROOT = new URL( '../', import.meta.url );

// A world's grid as body.js hands it over (body-height.js's heightsTable).
function tableOf( world ) {

	const { url, columns, rows, step = 1 } = WORLDS[ world ].heights;
	const buffer = readFileSync( new URL( `drive/public${ url }`, ROOT ) );
	return { data: new Int16Array( buffer.buffer, buffer.byteOffset, buffer.length / 2 ), columns, rows, step };

}

// The cell (row from 90° N, column from 180° W) whose middle is nearest ( lat, lon ).
function cellOf( table, lat, lon ) {

	const row = Math.min( table.rows - 1, Math.max( 0, Math.floor( ( 90 - lat ) * table.rows / 180 ) ) );
	const column = ( ( Math.floor( ( lon + 180 ) * table.columns / 360 ) % table.columns ) + table.columns ) % table.columns;
	return { row, column };

}

const tables = {};
const texels = {};
const table = world => tables[ world ] ??= tableOf( world );
const texelsOf = world => texels[ world ] ??= lensTexels( world, table( world ) );

describe( 'levelRadius: how far out a world\'s level is', () => {

	test( 'a world without a level spheroid: its sphere, at every latitude', () => {

		for ( const world of [ 'earth', 'moon', 'mars' ] ) {

			for ( const lat of [ - 90, - 33, 0, 45, 90 ] ) assert.equal( levelRadius( world, lat ), WORLDS[ world ].radius );

		}

	} );

	test( 'Vesta and Ceres: the spheroid\'s equatorial radius at the equator, its polar radius at the poles, between them on the surface', () => {

		for ( const world of [ 'vesta', 'ceres' ] ) {

			const [ a, c ] = WORLDS[ world ].level;
			assert.ok( Math.abs( levelRadius( world, 0 ) - a ) < 1e-6 );
			assert.ok( Math.abs( levelRadius( world, 90 ) - c ) < 1e-6 );
			assert.ok( Math.abs( levelRadius( world, - 90 ) - c ) < 1e-6 );
			for ( const lat of [ - 70, - 20, 35, 60 ] ) {

				// The point that far out along that direction is on x²/a² + z²/c² = 1.
				const r = levelRadius( world, lat );
				const phi = lat * Math.PI / 180;
				const on = ( r * Math.cos( phi ) / a ) ** 2 + ( r * Math.sin( phi ) / c ) ** 2;
				assert.ok( Math.abs( on - 1 ) < 1e-12, `${ world } ${ lat }: ${ on }` );

			}

		}

	} );

	test( 'over Vesta\'s spheroid, its heights span about 19.6 km over to 22.4 km under (not the sphere\'s 30 and 51)', () => {

		const { low, high } = texelsOf( 'vesta' );
		assert.ok( high > 19000 && high < 20200, `highest ${ high }` );
		assert.ok( low < - 21800 && low > - 23000, `lowest ${ low }` );

	} );

} );

describe( 'lensTexels: the texture the ground is coloured from', () => {

	test( 'it is one half float per cell of the grid', () => {

		for ( const world of [ 'moon', 'mars' ] ) {

			const t = texelsOf( world );
			assert.equal( t.columns, WORLDS[ world ].heights.columns );
			assert.equal( t.rows, WORLDS[ world ].heights.rows );
			assert.equal( t.half.length, t.columns * t.rows );
			assert.ok( t.half instanceof Uint16Array );

		}

	} );

	test( 'Mars: its highest is at Olympus Mons, its lowest in Hellas, and the grid\'s own values there', () => {

		const t = texelsOf( 'mars' );
		const grid = table( 'mars' );
		// The grid's own highest and lowest, found here independently.
		let high = - Infinity;
		let low = Infinity;
		for ( const v of grid.data ) {

			high = Math.max( high, v );
			low = Math.min( low, v );

		}

		assert.equal( t.high, high );
		assert.equal( t.low, low );
		// Olympus Mons's summit is near 18.65° N 133.8° W, Hellas round 42° S 70° E: the cells found are
		// on each (a few degrees: the 7.4 km grid's top cell and the deepest of Hellas's floor).
		assert.ok( Math.abs( t.highAt.lat - 18.4 ) < 2 && Math.abs( t.highAt.lon + 133.5 ) < 2, JSON.stringify( t.highAt ) );
		assert.ok( t.lowAt.lat < - 25 && t.lowAt.lat > - 50 && t.lowAt.lon > 50 && t.lowAt.lon < 85, JSON.stringify( t.lowAt ) );

	} );

	test( 'rows are written south first (a DataTexture\'s first row is v = 0, body.js\'s south pole)', () => {

		const t = texelsOf( 'mars' );
		const grid = table( 'mars' );
		const { row, column } = cellOf( grid, t.highAt.lat, t.highAt.lon );
		const stored = grid.data[ row * grid.columns + column ];
		assert.equal( stored, t.high );
		// In the texture, that cell is ( rows − 1 − row ) rows up from the bottom, within 50 m (a half
		// float near 21 km is good to 16 m).
		const flipped = DataUtils.fromHalfFloat( t.half[ ( grid.rows - 1 - row ) * grid.columns + column ] );
		assert.ok( Math.abs( flipped - stored ) < 50, `${ flipped } vs ${ stored }` );
		// And not where an unflipped texture would have it.
		const unflipped = DataUtils.fromHalfFloat( t.half[ row * grid.columns + column ] );
		assert.ok( Math.abs( unflipped - stored ) > 1000, `${ unflipped }` );
		// The texture's first row is the grid's last (the southmost).
		for ( const c of [ 0, 777, 2000 ] ) assert.ok( Math.abs( DataUtils.fromHalfFloat( t.half[ c ] ) - grid.data[ ( grid.rows - 1 ) * grid.columns + c ] ) < 20 );

	} );

	test( 'Vesta: heights are over the spheroid (radius from the sphere, less the level there) and in its 2 m steps', () => {

		const grid = table( 'vesta' );
		const t = texelsOf( 'vesta' );
		const { radius } = WORLDS.vesta;
		for ( const [ row, column ] of [ [ 100, 10 ], [ 720, 1440 ], [ 1300, 2500 ] ] ) {

			const lat = 90 - ( row + 0.5 ) * 180 / grid.rows;
			const expected = radius + grid.data[ row * grid.columns + column ] * 2 - levelRadius( 'vesta', lat );
			const got = DataUtils.fromHalfFloat( t.half[ ( grid.rows - 1 - row ) * grid.columns + column ] );
			assert.ok( Math.abs( got - expected ) < 20, `${ row },${ column }: ${ got } vs ${ expected }` );

		}

	} );

} );

describe( 'lensHeightAt: the readout under the car', () => {

	test( 'at a cell\'s middle it is that cell\'s height; between cells, between them', () => {

		const grid = table( 'mars' );
		const t = texelsOf( 'mars' );
		assert.equal( Math.round( lensHeightAt( 'mars', grid, t.highAt.lat, t.highAt.lon ) ), t.high );
		const { row, column } = cellOf( grid, 0.0625, 0.0625 );
		const a = grid.data[ row * grid.columns + column ];
		const b = grid.data[ row * grid.columns + column + 1 ];
		const mid = lensHeightAt( 'mars', grid, 0.0625, 0.125 );
		assert.ok( Math.abs( mid - ( a + b ) / 2 ) < 1e-6, `${ mid } vs ${ a } and ${ b }` );

	} );

	test( 'round the 180th meridian and right by the poles, it still reads', () => {

		const grid = table( 'moon' );
		const east = lensHeightAt( 'moon', grid, 10, 179.99 );
		const west = lensHeightAt( 'moon', grid, 10, - 179.99 );
		assert.ok( Number.isFinite( east ) && Math.abs( east - west ) < 50 );
		assert.ok( Number.isFinite( lensHeightAt( 'moon', grid, 90, 0 ) ) );
		assert.ok( Number.isFinite( lensHeightAt( 'moon', grid, - 90, 0 ) ) );

	} );

	test( 'on Ceres it agrees with the texture (over the spheroid)', () => {

		const grid = table( 'ceres' );
		const t = texelsOf( 'ceres' );
		const { row, column } = cellOf( grid, 20.0625, - 120.0625 );
		const lat = 90 - ( row + 0.5 ) * 180 / grid.rows;
		const lon = - 180 + ( column + 0.5 ) * 360 / grid.columns;
		const texel = DataUtils.fromHalfFloat( t.half[ ( grid.rows - 1 - row ) * grid.columns + column ] );
		assert.ok( Math.abs( lensHeightAt( 'ceres', grid, lat, lon ) - texel ) < 10 );

	} );

} );

describe( 'the scale, its labels and the words', () => {

	test( 'the ramp is viridis\'s ten stops, dark violet to yellow', () => {

		assert.equal( RAMP.length, 10 );
		assert.equal( RAMP[ 0 ], '#440154' );
		assert.equal( RAMP.at( - 1 ), '#fde725' );
		for ( const stop of RAMP ) assert.match( stop, /^#[0-9a-f]{6}$/ );

	} );

	test( 'whole world: the measured lowest to highest; around me: NEAR either side, moving a kilometre at a time', () => {

		const whole = { low: - 8135, high: 21159 };
		assert.deepEqual( lensRange( 'world', whole, 1234 ), [ whole.low, whole.high ] );
		assert.deepEqual( lensRange( 'near', whole, 1234 ), [ 1000 - NEAR, 1000 + NEAR ] );
		assert.deepEqual( lensRange( 'near', whole, - 1930 ), [ - 2000 - NEAR, - 2000 + NEAR ] );
		assert.deepEqual( lensRange( 'near', whole, 1499 ), lensRange( 'near', whole, 1234 ) );
		assert.equal( STEPS.world, 1000 );
		assert.equal( STEPS.near, 250 );

	} );

	test( 'ticks: the ends, the datum when it\'s inside, a round middle, none crowding', () => {

		const t = texelsOf( 'mars' );
		const ticks = lensTicks( t.low, t.high );
		assert.equal( ticks[ 0 ], t.low );
		assert.equal( ticks.at( - 1 ), t.high );
		assert.ok( ticks.includes( 0 ) );
		for ( let i = 1; i < ticks.length; i ++ ) assert.ok( ticks[ i ] - ticks[ i - 1 ] > ( t.high - t.low ) / 8 );
		const near = lensTicks( ...lensRange( 'near', t, 3000 ) );
		assert.deepEqual( near, [ - 2000, 0, 3000, 8000 ] );
		assert.deepEqual( lensTicks( ...lensRange( 'near', t, 12000 ) ), [ 7000, 12000, 17000 ] );
		// All above the datum: no 0.
		assert.ok( ! lensTicks( 1000, 11000 ).includes( 0 ) );

	} );

	test( 'labels: thousands separated, to 10 m, a true minus sign; words say "below", never a negative', () => {

		assert.equal( tickLabel( - 8135 ), '−8,140 m' );
		assert.equal( tickLabel( 21159 ), '21,160 m' );
		assert.equal( tickLabel( 0 ), '0 m' );
		assert.equal( heightWords( - 1930, 'the datum' ), '1,930 m below the datum' );
		assert.equal( heightWords( 1934, 'the datum' ), '1,930 m above the datum' );
		assert.equal( heightWords( 3, 'the datum' ), 'at the datum' );
		assert.equal( hereLine( 'mars', - 1930 ), 'Here: 1,930 m below the datum · MOLA' );
		assert.doesNotMatch( hereLine( 'moon', - 1930 ), /−|-\d/ );
		assert.equal( whatLine( 'mars', 'world' ), 'Height above Mars\'s datum (the areoid) · lines every 1,000 m' );
		assert.match( whatLine( 'vesta', 'near' ), /285 × 229 km.*every 250 m/ );

	} );

	test( 'every far world has its words and names its dataset; the Earth has no lens', () => {

		assert.equal( hasLens( 'earth' ), false );
		const datasets = { moon: /LOLA/, mars: /MOLA/, vesta: /Dawn.*HAMO/, ceres: /Dawn.*HAMO/ };
		for ( const world of [ 'moon', 'mars', 'vesta', 'ceres' ] ) {

			assert.ok( hasLens( world ) );
			const words = LENS_WORDS[ world ];
			for ( const key of [ 'short', 'datum', 'here', 'source' ] ) assert.ok( words[ key ], `${ world } ${ key }` );
			assert.match( words.source, datasets[ world ] );
			assert.match( words.source, /resampled|grid/ );

		}

		assert.match( LENS_WORDS.mars.source, /areoid/ );

	} );

} );
