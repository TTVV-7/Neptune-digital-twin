// npm run test:grade-surface: the smoothed ground a flatten area that follows the ground takes
// (src/grade.js fitSurface), in Node on heights made here, no browser.
//
// - A small smoothing on a large area, where the grid's readings are further apart than the
//   smoothing: still on the ground (it once fell back to one plane under the whole area there and
//   was metres out on a curved hillside or a valley).
// - Ground that rounds over (a crest, a dome, the rim of a road cut) is followed as closely as
//   ground that dips the same way (a valley): it isn't taken for something standing on the ground
//   and cut into.
// - What does stand on it (a shed, a car, a stand of trees, a building as wide as 30 m) is still
//   left out, on flat ground, a 30% slope, a curved hillside and a crest.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fitSurface, gridAt, surfaceLayout, surfacePoints } from '../src/grade.js';

// The worst and RMS difference (m) between the fitted surface and the bare ground over a width ×
// length area smoothed over `smoothing` m, with boxes [ { x, z, w, d, h } ] standing on the ground.
function error( ground, width, length, smoothing, boxes = [] ) {

	const layout = surfaceLayout( width, length, smoothing );
	const heights = surfacePoints( layout ).map( ( [ x, z ] ) => {

		let y = ground( x, z );
		for ( const b of boxes ) if ( Math.abs( x - b.x ) <= b.w / 2 && Math.abs( z - b.z ) <= b.d / 2 ) y += b.h;
		return y;

	} );
	const fit = fitSurface( layout, heights, smoothing, width, length );
	let worst = 0, sum = 0, count = 0;
	for ( let x = - width / 2; x <= width / 2; x ++ ) for ( let z = - length / 2; z <= length / 2; z ++ ) {

		const e = fit.c + gridAt( fit.fit.grid, x, z ) - ground( x, z );
		if ( Math.abs( e ) > Math.abs( worst ) ) worst = e;
		sum += e * e;
		count ++;

	}

	return { worst, rms: Math.sqrt( sum / count ), dx: layout.dx };

}

const hill = ( x, z ) => 0.03 * z + 0.0015 * z * z + 0.001 * x * x;
const valley = ( x, z ) => - 6 * Math.exp( - x * x / ( 2 * 12 * 12 ) );
// A ridge along the area, its sides falling `s` (50% = 0.5), its top rounded over 2 m.
const crest = s => ( x, z ) => - s * Math.sqrt( x * x + 4 );
const dome = ( x, z ) => 8.24 * Math.exp( - ( x * x + z * z ) / 200 );
// A road cut 4 m deep, 12 m wide at the bottom and 20 m at the top, on a 5% grade.
const cut = ( x, z ) => 0.05 * z - 4 * Math.max( 0, Math.min( 1, ( 10 - Math.abs( x ) ) / 4 ) );
const slope = ( x, z ) => 0.3 * x + 0.1 * z;

describe( 'the smoothed ground (src/grade.js fitSurface)', () => {

	test( 'a small smoothing on a large area stays on the ground, though the readings are further apart than it', () => {

		for ( const [ width, length, smoothing ] of [ [ 80, 60, 2 ], [ 80, 60, 3 ], [ 120, 80, 2 ], [ 120, 80, 3 ], [ 120, 80, 4 ] ] ) {

			const h = error( hill, width, length, smoothing );
			assert.ok( h.dx > smoothing / 4 + 0.5, `the readings ${ h.dx.toFixed( 2 ) } m apart: wider than the smoothing asks` );
			assert.ok( Math.abs( h.worst ) < 0.1, `hill, ${ width } × ${ length } at ${ smoothing } m: worst ${ h.worst.toFixed( 2 ) } m` );
			const v = error( valley, width, length, smoothing );
			assert.ok( Math.abs( v.worst ) < 0.3, `6 m valley, ${ width } × ${ length } at ${ smoothing } m: worst ${ v.worst.toFixed( 2 ) } m` );

		}

	} );

	test( 'ground that rounds over is followed as a valley is, not cut into', () => {

		for ( const s of [ 0.3, 0.5 ] ) {

			const up = error( crest( s ), 80, 60, 10 ), down = error( ( x, z ) => - crest( s )( x, z ), 80, 60, 10 );
			assert.ok( up.worst < 0 && down.worst > 0, 'below a crest, above a valley' );
			assert.ok( Math.abs( up.worst + down.worst ) < 0.1, `${ s * 100 }% sides: crest ${ up.worst.toFixed( 2 ) } m, valley ${ down.worst.toFixed( 2 ) } m` );

		}

		const ridge = error( crest( 0.5 ), 80, 60, 10 );
		assert.ok( ridge.worst > - 1, `50% ridge at 10 m: worst ${ ridge.worst.toFixed( 2 ) } m` );
		const top = error( dome, 80, 60, 20 );
		assert.ok( top.worst > - 3, `8 m dome at 20 m: worst ${ top.worst.toFixed( 2 ) } m` );
		const road = error( cut, 80, 60, 10 );
		assert.ok( Math.abs( road.worst ) < 1.3, `road cut at 10 m: worst ${ road.worst.toFixed( 2 ) } m` );

	} );

	test( 'what stands on the ground is still left out', () => {

		const things = {
			shed: [ { x: 3, z: 2, w: 6, d: 4, h: 3 } ],
			car: [ { x: 10, z: - 5, w: 4.5, d: 2, h: 1.5 } ],
			trees: [ { x: - 15, z: 5, w: 15, d: 15, h: 10 } ],
			building: [ { x: 5, z: 0, w: 30, d: 25, h: 5 } ],
			all: [ { x: 10, z: 0, w: 20, d: 15, h: 6 }, { x: - 20, z: 10, w: 6, d: 6, h: 8 }, { x: - 5, z: - 15, w: 4, d: 2, h: 1.5 } ],
		};
		for ( const [ name, ground ] of Object.entries( { flat: () => 0, slope, hill } ) ) for ( const [ what, boxes ] of Object.entries( things ) ) for ( const smoothing of [ 5, 10 ] ) {

			const bare = error( ground, 80, 60, smoothing ), with_ = error( ground, 80, 60, smoothing, boxes );
			assert.ok( Math.abs( with_.worst - bare.worst ) < 0.5, `${ what } on ${ name } ground at ${ smoothing } m: worst ${ with_.worst.toFixed( 2 ) } m, bare ${ bare.worst.toFixed( 2 ) } m` );

		}

		// On a crest too: a shed, a car and a stand of trees on top of it aren't followed up.
		for ( const what of [ 'shed', 'car', 'trees' ] ) {

			const e = error( crest( 0.3 ), 80, 60, 10, things[ what ] );
			assert.ok( e.worst < 0.3, `${ what } on a crest: worst ${ e.worst.toFixed( 2 ) } m` );

		}

	} );

} );
