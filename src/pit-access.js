import { GALVANISED, mat, Parts, RUBBER, STEEL } from './parts.js';

// The ways down into an excavation (earthworks.js's `access`): a scaffold stair tower or a
// construction hoist standing on the pit's floor and rising past its rim, or an earth ramp (cut into
// the pit's design in earthworks.js, not drawn here). Each is built with its base at 0, along x
// (the tower's flights) and centred on (0, 0), `height` from the floor to the rim's landing.

const TREAD = mat( 0x7f858a, { roughness: 0.6, metalness: 0.5 } );
const TOE = mat( 0xffc20e, { roughness: 0.6 } );
const CAGE = mat( 0xf2a900, { roughness: 0.55, metalness: 0.2 } );
const MESH = mat( 0x9aa1a6, { roughness: 0.5, metalness: 0.5, transparent: true, opacity: 0.45 } );

// Footprints (m): what earthworks.js keeps clear of the pit's walls.
export const STAIR_TOWER = { length: 4.6, width: 2.6 };
export const HOIST = { length: 3.6, width: 2.4 };

// A scaffold stair tower: four standards, a landing every LIFT metres, flights switching back
// between them, guardrails on the outside and a landing at the rim to step off.
const LIFT = 2;
export function stairTower( height ) {

	const parts = new Parts();
	const tube = GALVANISED();
	const { length: L, width: W } = STAIR_TOWER;
	const top = height + 1.1;
	for ( const x of [ - L / 2, L / 2 ] ) for ( const z of [ - W / 2, W / 2 ] ) {

		parts.rod( tube, [ x, 0, z ], [ x, top, z ], 0.024, 8 );
		parts.box( RUBBER(), [ 0.2, 0.06, 0.2 ], [ x, 0, z ] );

	}

	const lifts = Math.max( 1, Math.ceil( height / LIFT ) );
	const rise = height / lifts;
	for ( let i = 0; i <= lifts; i ++ ) {

		const y = i * rise;
		// Landings at each end; ledgers and guardrails all round.
		for ( const x of [ - L / 2 + 0.55, L / 2 - 0.55 ] ) parts.box( TREAD, [ 1.1, 0.05, W - 0.1 ], [ x, y, 0 ] );
		for ( const z of [ - W / 2, W / 2 ] ) {

			parts.rod( tube, [ - L / 2, y + 0.05, z ], [ L / 2, y + 0.05, z ], 0.02, 6 );
			if ( i > 0 ) for ( const h of [ 0.5, 1.0 ] ) parts.rod( tube, [ - L / 2, y + h, z ], [ L / 2, y + h, z ], 0.02, 6 );

		}

		for ( const x of [ - L / 2, L / 2 ] ) {

			parts.rod( tube, [ x, y + 0.05, - W / 2 ], [ x, y + 0.05, W / 2 ], 0.02, 6 );
			if ( i > 0 ) for ( const h of [ 0.5, 1.0 ] ) parts.rod( tube, [ x, y + h, - W / 2 ], [ x, y + h, W / 2 ], 0.02, 6 );
			parts.box( TOE, [ 0.03, 0.15, W ], [ x, y + 0.05, 0 ] );

		}

		if ( i === lifts ) break;
		// The flight up to the next landing, one side then the other.
		const z = ( i % 2 ? 1 : - 1 ) * W / 4;
		const [ x0, x1 ] = i % 2 ? [ L / 2 - 1.1, - L / 2 + 1.1 ] : [ - L / 2 + 1.1, L / 2 - 1.1 ];
		const run = Math.abs( x1 - x0 );
		const steps = Math.max( 3, Math.round( rise / 0.19 ) );
		for ( let s = 0; s < steps; s ++ ) {

			const t = ( s + 0.5 ) / steps;
			parts.box( TREAD, [ run / steps + 0.03, 0.04, W / 2 - 0.15 ], [ x0 + ( x1 - x0 ) * t, y + rise * ( s + 1 ) / steps - 0.04, z ] );

		}

		for ( const side of [ z - W / 4 + 0.05, z + W / 4 - 0.05 ] ) parts.rod( STEEL(), [ x0, y + 0.1, side ], [ x1, y + rise + 0.05, side ], 0.03, 6 );
		parts.rod( tube, [ x0, y + 1.0, z ], [ x1, y + rise + 1.0, z ], 0.02, 6 );

	}

	return parts.build();

}

// A rack-and-pinion construction hoist: a lattice mast in sections, tied off at the rim, its cage
// (personnel and material) at the floor beside it, a base enclosure and a gate at the rim's landing.
export function hoist( height ) {

	const parts = new Parts();
	const tube = STEEL();
	const mast = 0.65;
	const top = height + 4.5;
	const mx = - HOIST.length / 2 + mast / 2 + 0.1;
	for ( const dx of [ - mast / 2, mast / 2 ] ) for ( const dz of [ - mast / 2, mast / 2 ] ) parts.rod( tube, [ mx + dx, 0, dz ], [ mx + dx, top, dz ], 0.04, 8 );
	for ( let y = 0; y < top; y += 1.5 ) {

		for ( const dz of [ - mast / 2, mast / 2 ] ) {

			parts.rod( tube, [ mx - mast / 2, y, dz ], [ mx + mast / 2, y + 1.5, dz ], 0.018, 6 );
			parts.rod( tube, [ mx - mast / 2, y, dz ], [ mx + mast / 2, y, dz ], 0.018, 6 );

		}

		for ( const dx of [ - mast / 2, mast / 2 ] ) parts.rod( tube, [ mx + dx, y, - mast / 2 ], [ mx + dx, y + 1.5, mast / 2 ], 0.018, 6 );

	}

	// The cage, beside the mast, at the floor.
	const cx = mx + mast / 2 + 1.5;
	const [ cl, cw, ch ] = [ 2.9, 1.5, 2.3 ];
	parts.box( CAGE, [ cl, 0.12, cw ], [ cx, 0.25, 0 ] );
	parts.box( CAGE, [ cl, 0.1, cw ], [ cx, 0.25 + ch, 0 ] );
	for ( const x of [ cx - cl / 2, cx + cl / 2 ] ) for ( const z of [ - cw / 2, cw / 2 ] ) parts.box( CAGE, [ 0.08, ch, 0.08 ], [ x, 0.35, z ] );
	for ( const z of [ - cw / 2, cw / 2 ] ) parts.box( MESH, [ cl, ch - 0.1, 0.02 ], [ cx, 0.37, z ] );
	parts.box( MESH, [ 0.02, ch - 0.1, cw ], [ cx + cl / 2, 0.37, 0 ] );
	// Base enclosure round the foot, and the landing gate at the rim.
	const fence = [ [ - HOIST.length / 2, - HOIST.width / 2 ], [ HOIST.length / 2, - HOIST.width / 2 ], [ HOIST.length / 2, HOIST.width / 2 ], [ - HOIST.length / 2, HOIST.width / 2 ] ];
	for ( let i = 0; i < 4; i ++ ) {

		const [ ax, az ] = fence[ i ], [ bx, bz ] = fence[ ( i + 1 ) % 4 ];
		parts.rod( GALVANISED(), [ ax, 1.1, az ], [ bx, 1.1, bz ], 0.02, 6 );
		parts.rod( GALVANISED(), [ ax, 0, az ], [ ax, 1.1, az ], 0.02, 6 );

	}

	parts.box( TOE, [ 1.6, 1.1, 0.05 ], [ cx, height, cw / 2 + 0.3 ] );
	parts.box( TREAD, [ cl, 0.05, 1.2 ], [ cx, height - 0.05, cw / 2 + 0.9 ] );
	return parts.build();

}
