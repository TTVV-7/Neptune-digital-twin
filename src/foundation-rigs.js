import { Vector3 } from 'three';
import { mat, Parts } from './parts.js';

// A foundations and deep-walls kit, built in code at real sizes: a cutter soil mixing (CSM) rig, a
// diaphragm-wall trench cutter on a crawler crane base, the bentonite plant that feeds them
// (desander, slurry tank, silo, mixer, pump), rebar cages lying on dunnage, a tremie pipe rack and
// guide wall sections. Like the other built-in pieces each stands on y = 0 with its front facing -Z.

export const FOUNDATION_ITEMS = [
	{ id: 'csm-rig-bg28', name: 'Cutter soil mixing (CSM) rig, 23 m mast, 2.4 m cutter (Bauer BG 28 type)', category: 'Shoring',
		keywords: 'csm cutter soil mixing rig mast kelly soil mix wall cutoff wall deep soil mixing dsm piling rig foundation',
		build: csmRig },
	{ id: 'trench-cutter-bc32', name: 'Trench cutter / hydromill, 2.8 m cutter on crawler crane base (Bauer BC 32 on MC 96 type)', category: 'Shoring',
		keywords: 'hydromill hydrofraise trench cutter diaphragm wall slurry wall d-wall cutter crane foundation',
		build: trenchCutter },
	{ id: 'slurry-desander', name: 'Slurry desander plant (screen and cyclones on 6 m skid)', category: 'Shoring',
		keywords: 'desander desilter shaker screen cyclones bentonite slurry plant mud cleaning separation',
		build: desander },
	{ id: 'slurry-tank-40m3', name: 'Slurry storage tank, vertical (40 m³, 3.2 m dia)', category: 'Shoring',
		keywords: 'slurry tank bentonite storage tank mud tank polymer tank',
		build: slurryTank },
	{ id: 'bentonite-silo', name: 'Bentonite silo on legs (18 m³, 7 m)', category: 'Shoring',
		keywords: 'bentonite silo powder silo cement silo screw conveyor slurry plant',
		build: bentoniteSilo },
	{ id: 'slurry-mixer-skid', name: 'Bentonite slurry mixer, high-shear (2 m³ tank, 3.6 m skid)', category: 'Shoring',
		keywords: 'slurry mixer colloidal mixer high shear bentonite grout mixer plant',
		build: slurryMixer },
	{ id: 'grout-pump-skid', name: 'Grout / slurry pump skid (piston pump, 2.6 m)', category: 'Shoring',
		keywords: 'grout pump slurry pump piston pump skid jet grouting',
		build: groutPump },
	{ id: 'rebar-cage-pile-1200', name: 'Rebar cage, bored pile (1.2 m dia x 12 m) on timber dunnage', category: 'Shoring',
		keywords: 'rebar cage pile cage reinforcing cage caisson drilled shaft bored pile steel',
		build: pileCage },
	{ id: 'rebar-cage-dwall', name: 'Rebar cage, diaphragm wall panel (2.5 x 0.8 x 12 m) on timber dunnage', category: 'Shoring',
		keywords: 'rebar cage diaphragm wall slurry wall d-wall reinforcing cage panel steel',
		build: wallCage },
	{ id: 'tremie-pipe-rack', name: 'Tremie pipe rack, 10 in x 3 m sections, with hopper', category: 'Shoring',
		keywords: 'tremie pipe hopper funnel rack concrete pour pile slurry wall',
		build: tremieRack },
	{ id: 'guide-wall-6m', name: 'Guide wall section (6 m, for a 1 m wall, 1.2 m deep)', category: 'Shoring',
		keywords: 'guide wall diaphragm wall slurry wall d-wall trench guide concrete',
		build: guideWall, rowLength: 6 },
];

// --- shared colours ----------------------------------------------------------------------------

const RIG = () => mat( 0xd9a21e, { roughness: 0.5, metalness: 0.2 } );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
const CUTTER = () => mat( 0x45494d, { roughness: 0.6, metalness: 0.4 } );
const HOSE = () => mat( 0x141516, { roughness: 0.8 } );
const RAIL = () => mat( 0xe8b923, { roughness: 0.5, metalness: 0.2 } );
const PLANT = () => mat( 0x3e6a8f, { roughness: 0.55, metalness: 0.25 } );
const TIMBER = () => mat( 0x8a6a45, { roughness: 0.95 } );
const REBAR = () => mat( 0x6e4632, { roughness: 0.85, metalness: 0.3 } );
const CONCRETE = () => mat( 0xa8a59d, { roughness: 0.95 } );

const TAU = Math.PI * 2;

// --- carriers ----------------------------------------------------------------------------------

// A pair of crawler tracks running along z, `length` long, `width` across the outsides, shoes
// `shoe` wide and `height` tall, with the car body joining them.
function tracks( parts, { length, width, shoe, height } ) {

	const gauge = width - shoe;
	const r = height / 2;
	const straight = length - height;
	for ( const x of [ - gauge / 2, gauge / 2 ] ) {

		// Track frame, the idler and sprocket at the ends, and the shoes round them.
		parts.box( DARK(), [ shoe * 0.55, height * 0.55, straight ], [ x, height * 0.22, 0 ] );
		for ( const z of [ - straight / 2, straight / 2 ] ) parts.rod( BLACK(), [ x - shoe / 2, r, z ], [ x + shoe / 2, r, z ], r, 14 );
		parts.box( BLACK(), [ shoe, 0.1, straight ], [ x, 0, 0 ] );
		parts.box( BLACK(), [ shoe, 0.1, straight ], [ x, height - 0.1, 0 ] );
		const pitch = 0.25;
		for ( let z = - straight / 2 + pitch / 2; z < straight / 2; z += pitch ) {

			parts.box( BLACK(), [ shoe, 0.04, 0.05 ], [ x, height, z ] );

		}

		// Bottom rollers seen under the frame.
		for ( let i = 0; i < 6; i ++ ) {

			const z = - straight / 2 + r + ( straight - 2 * r ) * i / 5;
			parts.rod( STEEL(), [ x - shoe * 0.3, 0.26, z ], [ x + shoe * 0.3, 0.26, z ], 0.14, 10 );

		}

	}

	parts.box( DARK(), [ gauge - shoe * 0.5, height * 0.45, length * 0.35 ], [ 0, height * 0.3, 0 ] );

}

// A cab of [ width, height, length ] standing at (x, y, z) (its middle at x, z), glazed at the
// front and sides.
function cab( parts, [ w, h, l ], [ x, y, z ], body ) {

	parts.box( body, [ w, h, l ], [ x, y, z ] );
	parts.box( GLASS(), [ w * 0.86, h * 0.5, 0.02 ], [ x, y + h * 0.38, z - l / 2 - 0.01 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( GLASS(), [ 0.02, h * 0.45, l * 0.7 ], [ x + s * ( w / 2 + 0.01 ), y + h * 0.42, z - l * 0.08 ] );
	parts.box( DARK(), [ w + 0.06, 0.06, l + 0.06 ], [ x, y + h, z ] );

}

// A cutter wheel pair on an axle along z through (x, y, zc): a gearbox shield plate in the middle
// and a toothed drum either side, `thickness` overall.
function cutterWheels( parts, [ x, y, zc ], radius, thickness, top ) {

	const shield = 0.14;
	const width = ( thickness - shield ) / 2;
	parts.box( CUTTER(), [ radius * 0.8, top - y, shield ], [ x, y, zc ] );
	parts.rod( CUTTER(), [ x, y, zc - shield / 2 - 0.01 ], [ x, y, zc + shield / 2 + 0.01 ], radius * 0.45, 12 );
	for ( const s of [ - 1, 1 ] ) {

		const z0 = zc + s * shield / 2;
		const z1 = zc + s * ( shield / 2 + width );
		parts.rod( mat( 0xb5452a, { roughness: 0.6, metalness: 0.3 } ), [ x, y, z0 ], [ x, y, z1 ], radius * 0.78, 14 );
		// Teeth round the drum in two staggered rows.
		const count = 12;
		for ( let row = 0; row < 2; row ++ ) {

			const z = z0 + s * width * ( row ? 0.72 : 0.28 );
			for ( let i = 0; i < count; i ++ ) {

				const a = ( i + row * 0.5 ) / count * TAU;
				const rr = radius * 0.86;
				parts.block( STEEL(), [ radius * 0.12, radius * 0.3, width * 0.32 ], [ x - Math.sin( a ) * rr, y + Math.cos( a ) * rr, z ], [ 0, 0, a ] );

			}

		}

	}

}

// --- CSM rig ------------------------------------------------------------------------------------

// A cutter soil mixing rig on a 28-class rotary drilling rig base: crawler tracks 5.9 m long and
// 4.4 m wide extended, the upper with its cab at the front left and the counterweight at the back,
// and a 23 m leader at the front held by its parallel linkage and backstay rams. The Kelly bar runs
// down the front of the leader to the cutter: a 2.4 m x 0.8 m frame with two pairs of toothed
// cutter wheels at its foot, shown just clear of the ground, the hoses looping over the mast head.
function csmRig() {

	const parts = new Parts();
	tracks( parts, { length: 5.9, width: 4.4, shoe: 0.8, height: 1.05 } );

	// Slewing ring and upper: deck, cab front left, engine house on the right, counterweight.
	const deck = 1.25;
	parts.cylinder( DARK(), 1.15, 0.2, [ 0, 1.05, 0.4 ], 20 );
	parts.box( RIG(), [ 3.0, 0.35, 5.4 ], [ 0, deck, 0.6 ] );
	const top = deck + 0.35;
	cab( parts, [ 1.0, 1.95, 1.8 ], [ - 1.0, top, - 1.15 ], RIG() );
	parts.box( RIG(), [ 1.85, 1.55, 4.6 ], [ 0.55, top, 0.7 ] );
	parts.box( DARK(), [ 1.2, 0.04, 1.6 ], [ 0.55, top + 1.55, 1.6 ] ); // engine grille
	parts.box( RIG(), [ 3.0, 1.75, 1.0 ], [ 0, deck, 3.7 ] );
	parts.box( DARK(), [ 3.02, 0.12, 1.02 ], [ 0, deck + 1.0, 3.7 ] );
	// Winches on the engine house.
	parts.rod( DARK(), [ 0.0, top + 1.95, 0.2 ], [ 1.2, top + 1.95, 0.2 ], 0.38, 14 );
	parts.rod( DARK(), [ 0.0, top + 1.85, 1.3 ], [ 1.2, top + 1.85, 1.3 ], 0.28, 14 );
	for ( const x of [ - 0.05, 1.25 ] ) parts.box( RIG(), [ 0.08, 0.6, 1.6 ], [ x, top + 1.55, 0.75 ] );

	// Leader: a box section from just above the ground to its head, at the front.
	const mz = - 2.75;
	const m = 0.8;
	const foot = 0.9;
	const head = 23.0;
	parts.box( RIG(), [ m, head - foot, m ], [ 0, foot, mz ] );
	for ( let y = foot + 1; y < head - 0.5; y += 2 ) parts.box( DARK(), [ m + 0.02, 0.06, m + 0.02 ], [ 0, y, mz ] ); // section joints
	// Guide rails down the leader's front.
	for ( const x of [ - 0.3, 0.3 ] ) parts.box( STEEL(), [ 0.1, head - foot - 0.4, 0.08 ], [ x, foot + 0.2, mz - m / 2 - 0.04 ] );

	// Parallel linkage from the deck to the leader, and the backstay rams.
	for ( const x of [ - 0.6, 0.6 ] ) {

		parts.rod( RIG(), [ x, deck + 0.2, - 2.0 ], [ x * 0.5, 2.2, mz + m / 2 ], 0.12, 8 );
		parts.rod( RIG(), [ x, top + 1.2, - 1.6 ], [ x * 0.5, 4.2, mz + m / 2 ], 0.12, 8 );
		parts.rod( RIG(), [ x * 1.4, top + 1.5, - 0.9 ], [ x * 0.5, 8.6, mz + m / 2 ], 0.16, 10 );
		parts.rod( BRIGHT(), [ x * 0.5, 8.6, mz + m / 2 ], [ x * 0.83, 5.8, mz + 0.95 ], 0.07, 8 );

	}

	// Leader head with the rope sheaves and the big hose guide wheel.
	parts.box( RIG(), [ 1.3, 1.0, 1.6 ], [ 0, head, mz - 0.2 ] );
	parts.rod( DARK(), [ - 0.55, head + 1.15, mz - 0.55 ], [ 0.55, head + 1.15, mz - 0.55 ], 0.45, 14 );
	parts.rod( DARK(), [ - 0.9, head + 0.6, mz - 0.1 ], [ - 0.65, head + 0.6, mz - 0.1 ], 0.9, 16 );

	// Kelly bar in front of the leader, with the drive sledge at its top riding the guide rails.
	const kz = mz - 0.85;
	const cutterTop = 4.0;
	parts.box( STEEL(), [ 0.4, 19.6 - cutterTop, 0.4 ], [ 0, cutterTop, kz ] );
	parts.box( RIG(), [ 1.2, 1.8, 0.7 ], [ 0, 19.6, kz + 0.1 ] );
	parts.box( DARK(), [ 0.8, 0.8, 0.5 ], [ 0, 21.4, kz + 0.15 ] );
	parts.rod( BRIGHT(), [ 0, 22.2, kz + 0.15 ], [ 0, head + 0.7, kz + 0.15 ], 0.025, 6 );

	// The cutter: frame, its mounting head, and the two pairs of wheels at its foot.
	const thickness = 0.8;
	const axle = 0.95;
	const frameBottom = 1.6;
	parts.box( CUTTER(), [ 2.3, cutterTop - frameBottom - 0.3, thickness - 0.1 ], [ 0, frameBottom, kz ] );
	for ( const x of [ - 1.1, 1.1 ] ) parts.box( CUTTER(), [ 0.2, cutterTop - frameBottom - 0.3, thickness ], [ x, frameBottom, kz ] );
	for ( const y of [ frameBottom, frameBottom + 1.1 ] ) parts.box( DARK(), [ 2.42, 0.14, thickness + 0.02 ], [ 0, y, kz ] );
	parts.box( RIG(), [ 0.8, 0.3, 0.7 ], [ 0, cutterTop - 0.3, kz ] );
	for ( const x of [ - 0.6, 0.6 ] ) cutterWheels( parts, [ x, axle, kz ], 0.6, thickness, frameBottom );

	// Hoses: off the upper, up the leader's left side, over the guide wheel and down to the cutter.
	for ( const dx of [ 0, 0.1, 0.2 ] ) {

		const x = - 0.5 - dx;
		parts.path( HOSE(), [
			[ - 0.4 - dx, top + 1.55, 0.2 ],
			[ x, top + 1.6, mz + 0.6 ],
			[ x, 4.2, mz + 0.3 ],
			[ x, head + 0.2, mz + 0.15 ],
			[ x - 0.05, head + 1.5, mz - 0.1 ],
			[ x - 0.05, head + 0.6, mz - 1.0 ],
			[ - 0.35 - dx, cutterTop, kz - 0.25 ],
		], 0.045, 6 );

	}

	return parts.build();

}

// --- trench cutter -----------------------------------------------------------------------------

// A diaphragm-wall trench cutter on a 90 t class duty-cycle crawler crane: 7.2 m tracks 4.8 m
// wide, the upper with its cab front left, gantry and counterweight at the back, and a 20 m
// lattice boom at 75 degrees. The cutter hangs from the boom head on its ropes: a frame 2.8 m long
// x 1.0 m thick and 11.5 m tall over the wheels, with twin hose drums on the boom feeding the
// hoses over the head to it.
function trenchCutter() {

	const parts = new Parts();
	tracks( parts, { length: 7.2, width: 4.8, shoe: 0.9, height: 1.25 } );

	const deck = 1.45;
	parts.cylinder( DARK(), 1.4, 0.2, [ 0, 1.25, 0.6 ], 20 );
	parts.box( RIG(), [ 3.5, 0.4, 6.6 ], [ 0, deck, 1.3 ] );
	const top = deck + 0.4;
	cab( parts, [ 1.1, 2.0, 2.0 ], [ - 1.15, top, - 1.0 ], RIG() );
	parts.box( RIG(), [ 2.2, 1.7, 5.4 ], [ 0.6, top, 1.6 ] );
	parts.box( DARK(), [ 1.4, 0.04, 1.8 ], [ 0.6, top + 1.7, 3.0 ] );
	parts.box( RIG(), [ 3.6, 2.0, 1.2 ], [ 0, deck, 5.0 ] );
	parts.box( DARK(), [ 3.62, 0.12, 1.22 ], [ 0, deck + 1.2, 5.0 ] );
	// Main hoist winches.
	parts.rod( DARK(), [ - 0.5, top + 0.6, 0.6 ], [ 1.6, top + 0.6, 0.6 ], 0.5, 16 );

	// Gantry (A-frame) at the back of the upper.
	const gantry = [ 0, 6.8, 3.4 ];
	for ( const x of [ - 1.3, 1.3 ] ) {

		parts.rod( RIG(), [ x, top + 1.7, 1.6 ], [ x * 0.55, gantry[ 1 ], gantry[ 2 ] ], 0.12, 8 );
		parts.rod( RIG(), [ x, top + 1.7, 4.6 ], [ x * 0.55, gantry[ 1 ], gantry[ 2 ] ], 0.12, 8 );

	}

	parts.rod( RIG(), [ - 0.8, gantry[ 1 ], gantry[ 2 ] ], [ 0.8, gantry[ 1 ], gantry[ 2 ] ], 0.14, 8 );

	// Lattice boom from its foot pin at the front of the upper.
	const angle = 75 * Math.PI / 180;
	const footPin = new Vector3( 0, 2.5, - 1.6 );
	const along = new Vector3( 0, Math.sin( angle ), - Math.cos( angle ) );
	const back = new Vector3( 0, Math.cos( angle ), Math.sin( angle ) );
	const length = 20;
	const half = 0.75;
	const at = ( t, x, n ) => footPin.clone().addScaledVector( along, t ).add( new Vector3( x, 0, 0 ) ).addScaledVector( back, n ).toArray();
	latticeBoom( parts, at, length, half );
	const headPoint = footPin.clone().addScaledVector( along, length );

	// Boom head with its rope and hose sheaves; pendants back to the gantry.
	parts.block( RIG(), [ 1.6, 1.4, 1.8 ], headPoint.clone().addScaledVector( along, 0.4 ).toArray(), [ - ( Math.PI / 2 - angle ), 0, 0 ] );
	const sheave = headPoint.clone().addScaledVector( along, 0.6 ).addScaledVector( back, - 1.0 );
	parts.rod( DARK(), [ - 0.6, sheave.y, sheave.z ], [ 0.6, sheave.y, sheave.z ], 0.55, 16 );
	const hoseWheel = headPoint.clone().addScaledVector( along, 0.9 ).addScaledVector( back, 0.6 );
	for ( const x of [ - 0.55, 0.55 ] ) parts.rod( DARK(), [ x - 0.15, hoseWheel.y, hoseWheel.z ], [ x + 0.15, hoseWheel.y, hoseWheel.z ], 1.0, 18 );
	for ( const x of [ - 0.6, 0.6 ] ) parts.rod( BRIGHT(), at( length, x, half ), [ x * 0.5, gantry[ 1 ], gantry[ 2 ] ], 0.04, 6 );

	// Twin hose drums on the boom's back, 4 m up it.
	const drum = footPin.clone().addScaledVector( along, 4.5 ).addScaledVector( back, half + 1.4 );
	for ( const x of [ - 0.6, 0.6 ] ) {

		parts.rod( DARK(), [ x - 0.48, drum.y, drum.z ], [ x + 0.48, drum.y, drum.z ], 1.3, 20 );
		parts.rod( HOSE(), [ x - 0.42, drum.y, drum.z ], [ x + 0.42, drum.y, drum.z ], 1.12, 20 );

	}

	parts.rod( STEEL(), [ - 1.15, drum.y, drum.z ], [ 1.15, drum.y, drum.z ], 0.2, 10 );
	for ( const x of [ - 1.15, 1.15 ] ) {

		parts.rod( RIG(), [ x, drum.y, drum.z ], at( 3.5, x * 0.65, half ), 0.1, 6 );
		parts.rod( RIG(), [ x, drum.y, drum.z ], at( 5.8, x * 0.65, half ), 0.1, 6 );

	}

	// The cutter, hanging under the main sheave.
	const cz = sheave.z - 0.5;
	const bottom = 0.5;
	const radius = 0.7;
	const axle = bottom + radius;
	const thickness = 1.0;
	const frameBottom = axle + radius + 0.4;
	const cutterTop = bottom + 11.5;
	// Frame: a closed body between two guide columns, ribbed, with the pump box low down.
	parts.box( CUTTER(), [ 2.4, cutterTop - frameBottom, thickness - 0.25 ], [ 0, frameBottom, cz ] );
	for ( const x of [ - 1.25, 1.25 ] ) parts.box( CUTTER(), [ 0.3, cutterTop - frameBottom, thickness ], [ x, frameBottom, cz ] );
	for ( let y = frameBottom + 1.2; y < cutterTop - 0.5; y += 1.6 ) parts.box( DARK(), [ 2.82, 0.14, thickness + 0.02 ], [ 0, y, cz ] );
	parts.box( DARK(), [ 2.0, 1.3, thickness + 0.06 ], [ 0, frameBottom + 0.1, cz ] );
	parts.box( RIG(), [ 1.4, 0.6, 1.0 ], [ 0, cutterTop, cz ] );
	parts.rod( DARK(), [ - 0.25, cutterTop + 0.95, cz ], [ 0.25, cutterTop + 0.95, cz ], 0.4, 14 );
	for ( const x of [ - 0.7, 0.7 ] ) cutterWheels( parts, [ x, axle, cz ], radius, thickness, frameBottom );

	// Hoist ropes from the boom head sheave to the cutter's sheave block.
	for ( const x of [ - 0.3, 0.3 ] ) parts.rod( BRIGHT(), [ x, sheave.y, sheave.z - 0.5 ], [ x * 0.8, cutterTop + 0.95, cz ], 0.025, 6 );

	// Hoses: off the drums, up along the boom's back to the hose wheels, then down to the cutter.
	for ( const x of [ - 0.75, - 0.45, 0.45, 0.75 ] ) {

		const r = Math.abs( x ) > 0.6 ? 0.07 : 0.05;
		const off = drum.clone().addScaledVector( back, 1.12 );
		parts.path( HOSE(), [
			[ x, off.y, off.z ],
			at( 9, x, half + 0.35 ),
			at( length - 0.5, x, half + 0.4 ),
			[ x, hoseWheel.y + 0.9, hoseWheel.z + 0.3 ],
			[ x, hoseWheel.y + 0.1, hoseWheel.z - 1.0 ],
			[ x * 0.9, cutterTop + 0.3, cz - 0.3 ],
		], r, 6 );

	}

	return parts.build();

}

// A square lattice boom section: four chords and zigzag lacing on each face. at( t, x, n ) is the
// point t along the boom, x across and n towards its back.
function latticeBoom( parts, at, length, half ) {

	const corners = [ [ - half, - half ], [ half, - half ], [ half, half ], [ - half, half ] ];
	for ( const [ x, n ] of corners ) parts.rod( RIG(), at( 0, x, n ), at( length, x, n ), 0.08, 6 );
	const bays = Math.round( length / 1.5 );
	const step = length / bays;
	for ( let i = 0; i < bays; i ++ ) {

		const t0 = i * step;
		const t1 = t0 + step;
		for ( let c = 0; c < 4; c ++ ) {

			const [ x0, n0 ] = corners[ c ];
			const [ x1, n1 ] = corners[ ( c + 1 ) % 4 ];
			const [ a, b ] = i % 2 ? [ t0, t1 ] : [ t1, t0 ];
			parts.rod( RIG(), at( a, x0, n0 ), at( b, x1, n1 ), 0.04, 5 );
			if ( i === 0 ) parts.rod( RIG(), at( t0, x0, n0 ), at( t0, x1, n1 ), 0.04, 5 );
			parts.rod( RIG(), at( t1, x0, n0 ), at( t1, x1, n1 ), 0.04, 5 );

		}

	}

}

// --- slurry plant ----------------------------------------------------------------------------

// Handrails round a rectangle at height y: posts and two rails along each side given.
function railing( parts, [ x0, x1 ], [ z0, z1 ], y, sides = [ 0, 1, 2, 3 ] ) {

	const corners = [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ];
	for ( const s of sides ) {

		const [ ax, az ] = corners[ s ];
		const [ bx, bz ] = corners[ ( s + 1 ) % 4 ];
		for ( const h of [ 0.55, 1.1 ] ) parts.rod( RAIL(), [ ax, y + h, az ], [ bx, y + h, bz ], 0.022, 5 );
		const span = Math.hypot( bx - ax, bz - az );
		const posts = Math.max( 1, Math.round( span / 1.5 ) );
		for ( let i = 0; i <= posts; i ++ ) {

			const t = i / posts;
			parts.rod( RAIL(), [ ax + ( bx - ax ) * t, y, az + ( bz - az ) * t ], [ ax + ( bx - ax ) * t, y + 1.1, az + ( bz - az ) * t ], 0.022, 5 );

		}

	}

}

// A ladder of `height` up from (x, y, z), its rungs running across x (or z when `alongZ`).
function ladder( parts, [ x, y, z ], height, alongZ = false ) {

	const w = 0.22;
	const side = alongZ ? [ 0, 0, w ] : [ w, 0, 0 ];
	for ( const s of [ - 1, 1 ] ) parts.rod( RAIL(), [ x + s * side[ 0 ], y, z + s * side[ 2 ] ], [ x + s * side[ 0 ], y + height, z + s * side[ 2 ] ], 0.025, 5 );
	for ( let h = 0.3; h < height; h += 0.3 ) parts.rod( RAIL(), [ x - side[ 0 ], y + h, z - side[ 2 ] ], [ x + side[ 0 ], y + h, z + side[ 2 ] ], 0.015, 4 );

}

// An upright cyclone: a short barrel with its feed inlet on top of a cone, the apex down at y.
function cyclone( parts, [ x, y, z ], radius, cone ) {

	parts.cylinder( STEEL(), radius * 0.25, cone, [ x, y, z ], 12, radius );
	parts.cylinder( STEEL(), radius, radius * 1.4, [ x, y + cone, z ], 12 );
	parts.rod( STEEL(), [ x, y + cone + radius * 1.4, z ], [ x, y + cone + radius * 2.2, z ], radius * 0.35, 8 );

}

// A 6 m desander skid: a slurry tank on runners, the shaker screen on top at the back with its
// vibrator motors, and the cyclones on a frame above it (two big desander cones and a bank of
// small desilters), the feed pump at the front, handrails and a ladder. 2.5 m wide, 4 m high.
function desander() {

	const parts = new Parts();
	const [ w, l ] = [ 2.5, 6.0 ];
	for ( const x of [ - 1.05, 1.05 ] ) parts.box( DARK(), [ 0.25, 0.2, l ], [ x, 0, 0 ] );
	const tankTop = 2.0;
	parts.box( PLANT(), [ w, tankTop - 0.2, l ], [ 0, 0.2, 0 ] );
	for ( let z = - 2.5; z <= 2.5; z += 1.25 ) for ( const x of [ - w / 2, w / 2 ] ) parts.box( DARK(), [ 0.04, tankTop - 0.3, 0.1 ], [ x, 0.25, z ] );
	parts.box( mat( 0x5d6266, { roughness: 0.8, metalness: 0.4 } ), [ w - 0.1, 0.04, 3.2 ], [ 0, tankTop, - 1.3 ] ); // grating

	// Shaker screen on springs over the back half: an open basket tilting down to its discharge lip,
	// wet sand on the mesh, a vibrator motor either side and the chute off the back.
	const deckY = tankTop + 0.25;
	const tilt = [ 0.06, 0, 0 ];
	for ( const x of [ - 0.9, 0.9 ] ) for ( const z of [ 0.6, 2.7 ] ) parts.cylinder( STEEL(), 0.1, 0.25, [ x, tankTop, z ], 8 );
	parts.block( PLANT(), [ 2.1, 0.06, 2.7 ], [ 0, deckY + 0.1, 1.7 ], tilt );
	parts.block( mat( 0x7c7468, { roughness: 1 } ), [ 1.95, 0.05, 2.65 ], [ 0, deckY + 0.15, 1.7 ], tilt );
	for ( const x of [ - 1.03, 1.03 ] ) parts.block( PLANT(), [ 0.06, 0.45, 2.7 ], [ x, deckY + 0.3, 1.7 ], tilt );
	parts.block( PLANT(), [ 2.1, 0.45, 0.06 ], [ 0, deckY + 0.38, 0.38 ], tilt );
	for ( const x of [ - 1.06, 1.06 ] ) parts.rod( DARK(), [ x, deckY + 0.3, 1.4 ], [ x + Math.sign( x ) * 0.3, deckY + 0.3, 1.4 ], 0.18, 12 );
	parts.prism( PLANT(), [ [ 3.0, deckY ], [ 3.45, 0.9 ], [ 3.45, 0.84 ], [ 3.0, deckY - 0.06 ] ], 1.6 ); // sand chute

	// Cyclone frame over the screen: two desander cones and a bank of six desilters, their apexes
	// over the mesh, fed by manifolds from the pump.
	const frameTop = 2.8;
	for ( const x of [ - 1.1, 1.1 ] ) for ( const z of [ 0.4, 2.9 ] ) parts.box( DARK(), [ 0.12, frameTop - tankTop, 0.12 ], [ x, tankTop, z ] );
	for ( const z of [ 0.4, 2.9 ] ) parts.box( DARK(), [ 2.32, 0.12, 0.12 ], [ 0, frameTop - 0.12, z ] );
	for ( const x of [ - 1.1, 1.1 ] ) parts.box( DARK(), [ 0.12, 0.12, 2.62 ], [ x, frameTop - 0.12, 1.65 ] );
	parts.box( DARK(), [ 2.32, 0.1, 0.1 ], [ 0, frameTop - 0.1, 1.0 ] );
	parts.box( DARK(), [ 2.32, 0.1, 0.1 ], [ 0, frameTop - 0.1, 2.3 ] );
	cyclone( parts, [ - 0.5, frameTop - 0.2, 1.0 ], 0.25, 1.0 );
	cyclone( parts, [ 0.5, frameTop - 0.2, 1.0 ], 0.25, 1.0 );
	for ( let i = 0; i < 6; i ++ ) cyclone( parts, [ - 0.75 + i * 0.3, frameTop - 0.2, 2.3 ], 0.1, 0.75 );
	const feed = frameTop + 0.95;
	parts.rod( STEEL(), [ - 1.0, feed, 0.68 ], [ 1.0, feed, 0.68 ], 0.11, 10 );
	parts.rod( STEEL(), [ - 1.0, frameTop + 0.69, 2.16 ], [ 1.0, frameTop + 0.69, 2.16 ], 0.07, 10 );
	parts.path( STEEL(), [ [ 0.65, tankTop + 0.5, - 2.4 ], [ 1.4, tankTop + 0.5, - 2.4 ], [ 1.4, feed, - 2.4 ], [ 1.4, feed, 0.68 ], [ 1.0, feed, 0.68 ] ], 0.1, 10 );
	parts.path( STEEL(), [ [ 1.4, feed, 1.5 ], [ 1.4, frameTop + 0.69, 2.16 ], [ 1.0, frameTop + 0.69, 2.16 ] ], 0.07, 8 );

	// Feed pump and motor at the front end of the tank top, and two agitators.
	parts.box( DARK(), [ 1.4, 0.2, 0.9 ], [ 0, tankTop, - 2.4 ] );
	parts.rod( PLANT(), [ - 0.6, tankTop + 0.5, - 2.4 ], [ 0.1, tankTop + 0.5, - 2.4 ], 0.3, 14 );
	parts.rod( mat( 0x2f5d3a, { roughness: 0.5, metalness: 0.3 } ), [ 0.1, tankTop + 0.5, - 2.4 ], [ 0.65, tankTop + 0.5, - 2.4 ], 0.35, 14 );
	for ( const z of [ - 1.2, - 0.1 ] ) parts.cylinder( mat( 0x2f5d3a, { roughness: 0.5, metalness: 0.3 } ), 0.2, 0.5, [ - 0.6, tankTop, z ], 12 );

	railing( parts, [ - w / 2 + 0.05, w / 2 - 0.05 ], [ - l / 2 + 0.05, 0.3 ], tankTop, [ 0, 1, 3 ] );
	ladder( parts, [ - 0.7, 0.2, - l / 2 - 0.05 ], tankTop + 0.9 - 0.2 );

	return parts.build();

}

// A vertical 40 m³ slurry storage tank 3.2 m across and 5 m high on a ring base: a shallow cone
// roof with its agitator drive and handrail, a caged ladder up the side, a manway and the
// suction and return nozzles low down at the front.
function slurryTank() {

	const parts = new Parts();
	const r = 1.6;
	const h = 5.0;
	const base = 0.2;
	parts.cylinder( DARK(), r + 0.05, base, [ 0, 0, 0 ], 24 );
	parts.cylinder( PLANT(), r, h, [ 0, base, 0 ], 24 );
	for ( const y of [ 1.6, 3.3 ] ) parts.cylinder( DARK(), r + 0.03, 0.08, [ 0, base + y, 0 ], 24 );
	const top = base + h;
	parts.cylinder( PLANT(), r, 0.35, [ 0, top, 0 ], 24, 0.3 );
	parts.box( DARK(), [ 0.5, 0.25, 0.5 ], [ 0, top + 0.35, 0 ] );
	parts.cylinder( mat( 0x2f5d3a, { roughness: 0.5, metalness: 0.3 } ), 0.2, 0.55, [ 0, top + 0.6, 0 ], 12 );

	// Handrail round the roof edge.
	for ( let i = 0; i < 12; i ++ ) {

		const a = i / 12 * TAU;
		const b = ( i + 1 ) / 12 * TAU;
		const rr = r - 0.1;
		parts.rod( RAIL(), [ Math.cos( a ) * rr, top, Math.sin( a ) * rr ], [ Math.cos( a ) * rr, top + 1.1, Math.sin( a ) * rr ], 0.022, 5 );
		parts.rod( RAIL(), [ Math.cos( a ) * rr, top + 1.1, Math.sin( a ) * rr ], [ Math.cos( b ) * rr, top + 1.1, Math.sin( b ) * rr ], 0.022, 5 );

	}

	// Caged ladder on the right side.
	ladder( parts, [ r + 0.2, base + 0.3, 0 ], h + 0.6, true );
	for ( let y = base + 2.4; y < top + 1; y += 0.9 ) {

		parts.path( RAIL(), [ [ r + 0.2, y, - 0.38 ], [ r + 0.8, y, - 0.38 ], [ r + 0.8, y, 0.38 ], [ r + 0.2, y, 0.38 ] ], 0.015, 4, false );

	}

	for ( const z of [ - 0.38, 0, 0.38 ] ) parts.rod( RAIL(), [ r + 0.8, base + 2.4, z ], [ r + 0.8, top + 0.9, z ], 0.015, 4 );

	// Manway and nozzles.
	parts.rod( DARK(), [ - 0.9, 0.95, - r + 0.3 ], [ - 0.9, 0.95, - r - 0.15 ], 0.32, 16 );
	for ( const x of [ 0.4, 0.9 ] ) {

		parts.rod( STEEL(), [ x, 0.6, - r + 0.3 ], [ x, 0.6, - r - 0.35 ], 0.1, 10 );
		parts.rod( DARK(), [ x, 0.6, - r - 0.3 ], [ x, 0.6, - r - 0.4 ], 0.16, 10 );

	}

	return parts.build();

}

// A bentonite powder silo of about 18 m³, 2.4 m across and 7 m tall: a barrel on four braced
// legs, the cone below with a screw conveyor out to the right (to the mixer's hopper), a fill pipe
// and caged ladder up the side, and the dust filter and handrail on the roof.
function bentoniteSilo() {

	const parts = new Parts();
	const r = 1.2;
	const coneBottom = 1.5;
	const coneTop = 3.0;
	const roof = 6.2;
	const white = mat( 0xd8d8d2, { roughness: 0.55, metalness: 0.2 } );
	parts.cylinder( white, r, roof - coneTop, [ 0, coneTop, 0 ], 24 );
	parts.cylinder( white, 0.15, coneTop - coneBottom, [ 0, coneBottom, 0 ], 24, r );
	parts.cylinder( white, r, 0.12, [ 0, roof, 0 ], 24, 0.4 );
	parts.cylinder( DARK(), 0.15, 0.4, [ 0, coneBottom - 0.4, 0 ], 10 );
	parts.cylinder( DARK(), 0.35, 0.5, [ 0, roof + 0.1, 0 ], 14 ); // dust filter

	// Legs and bracing.
	const legs = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ x, z ] ) => [ x * r * 0.75, z * r * 0.75 ] );
	for ( const [ x, z ] of legs ) {

		parts.box( DARK(), [ 0.16, coneTop + 0.4, 0.16 ], [ x, 0, z ] );
		parts.box( DARK(), [ 0.5, 0.03, 0.5 ], [ x, 0, z ] );

	}

	for ( let i = 0; i < 4; i ++ ) {

		const [ ax, az ] = legs[ i ];
		const [ bx, bz ] = legs[ ( i + 1 ) % 4 ];
		parts.rod( DARK(), [ ax, 0.2, az ], [ bx, coneTop - 0.2, bz ], 0.04, 5 );
		parts.rod( DARK(), [ ax, coneTop - 0.2, az ], [ bx, 0.2, bz ], 0.04, 5 );

	}

	// Screw conveyor from the cone outlet up and out to the right, with its drive motor.
	parts.rod( STEEL(), [ 0, coneBottom - 0.3, 0 ], [ 3.0, 2.2, 0 ], 0.13, 10 );
	parts.rod( DARK(), [ 3.0, 2.2, 0 ], [ 3.0, 1.9, 0 ], 0.12, 10 );
	parts.rod( mat( 0x2f5d3a, { roughness: 0.5, metalness: 0.3 } ), [ 3.0, 2.2, 0 ], [ 3.35, 2.3, 0 ], 0.15, 10 );

	// Fill pipe and caged ladder on the left.
	parts.path( STEEL(), [ [ - r - 0.12, 1.2, - 0.4 ], [ - r - 0.12, roof + 0.15, - 0.4 ], [ - 0.6, roof + 0.4, - 0.4 ] ], 0.055, 8 );
	ladder( parts, [ - r - 0.25, 0.3, 0.3 ], roof + 0.7, true );
	for ( let y = 2.4; y < roof + 1; y += 0.9 ) parts.path( RAIL(), [ [ - r - 0.25, y, - 0.08 ], [ - r - 0.85, y, - 0.08 ], [ - r - 0.85, y, 0.68 ], [ - r - 0.25, y, 0.68 ] ], 0.015, 4, false );
	for ( let i = 0; i < 10; i ++ ) {

		const a = i / 10 * TAU;
		const b = ( i + 1 ) / 10 * TAU;
		const rr = r - 0.08;
		parts.rod( RAIL(), [ Math.cos( a ) * rr, roof + 0.1, Math.sin( a ) * rr ], [ Math.cos( a ) * rr, roof + 1.1, Math.sin( a ) * rr ], 0.02, 5 );
		parts.rod( RAIL(), [ Math.cos( a ) * rr, roof + 1.1, Math.sin( a ) * rr ], [ Math.cos( b ) * rr, roof + 1.1, Math.sin( b ) * rr ], 0.02, 5 );

	}

	return parts.build();

}

// A skid-mounted high-shear bentonite mixer: the 2 m³ mixing tank at the back, the high-shear
// pump and its motor at the front, the bag hopper on its stand feeding the venturi, a control
// cabinet and the piping. 3.6 m long, 2.2 m wide.
function slurryMixer() {

	const parts = new Parts();
	for ( const x of [ - 0.95, 0.95 ] ) parts.box( DARK(), [ 0.2, 0.2, 3.6 ], [ x, 0, 0 ] );
	parts.box( mat( 0x5d6266, { roughness: 0.8, metalness: 0.4 } ), [ 2.2, 0.05, 3.6 ], [ 0, 0.2, 0 ] );

	// Mixing tank on its frame.
	for ( const x of [ - 0.6, 0.6 ] ) for ( const z of [ 0.4, 1.6 ] ) parts.box( DARK(), [ 0.1, 0.45, 0.1 ], [ x, 0.25, z ] );
	parts.cylinder( PLANT(), 0.8, 1.35, [ 0, 0.7, 1.0 ], 20 );
	parts.cylinder( PLANT(), 0.82, 0.05, [ 0, 2.05, 1.0 ], 20 );
	parts.box( DARK(), [ 1.7, 0.12, 0.15 ], [ 0, 2.1, 1.0 ] );
	parts.cylinder( mat( 0x2f5d3a, { roughness: 0.5, metalness: 0.3 } ), 0.16, 0.45, [ 0, 2.22, 1.0 ], 12 );

	// High-shear pump and motor along the front.
	parts.box( DARK(), [ 0.7, 0.3, 1.2 ], [ 0.3, 0.25, - 0.9 ] );
	parts.rod( mat( 0x2f5d3a, { roughness: 0.5, metalness: 0.3 } ), [ 0.3, 0.85, - 0.3 ], [ 0.3, 0.85, - 1.0 ], 0.3, 14 );
	parts.rod( PLANT(), [ 0.3, 0.85, - 1.0 ], [ 0.3, 0.85, - 1.45 ], 0.27, 14 );
	parts.path( STEEL(), [ [ 0.3, 0.85, - 1.45 ], [ 0.3, 0.85, - 1.65 ], [ 0.3, 2.15, - 1.65 ], [ 0.3, 2.15, 0.5 ], [ 0.3, 1.9, 0.6 ] ], 0.07, 8 );
	parts.path( STEEL(), [ [ 0.3, 0.85, - 1.0 ], [ 0.6, 0.6, - 0.6 ], [ 0.6, 0.6, 0.35 ], [ 0.4, 0.8, 0.5 ] ], 0.07, 8 );

	// Bag hopper on its stand at the front left, into the venturi.
	for ( const x of [ - 0.95, - 0.35 ] ) for ( const z of [ - 1.6, - 1.0 ] ) parts.box( DARK(), [ 0.06, 0.9, 0.06 ], [ x, 0.25, z ] );
	parts.cylinder( STEEL(), 0.08, 0.55, [ - 0.65, 1.0, - 1.3 ], 4, 0.6 );
	parts.box( DARK(), [ 0.9, 0.05, 0.9 ], [ - 0.65, 1.55, - 1.3 ] );
	parts.rod( STEEL(), [ - 0.65, 1.0, - 1.3 ], [ - 0.65, 0.7, - 1.3 ], 0.07, 8 );
	parts.rod( STEEL(), [ - 0.65, 0.7, - 1.3 ], [ 0.3, 0.7, - 1.3 ], 0.07, 8 );

	// Control cabinet at the back right.
	parts.box( mat( 0xd8d8d2, { roughness: 0.55, metalness: 0.2 } ), [ 0.35, 1.1, 0.7 ], [ 0.85, 0.25, - 0.1 ] );

	return parts.build();

}

// A grout or slurry pump skid: a duplex piston pump with its two cylinders, the electric motor and
// gearbox behind, suction and discharge pipes and a lifting frame. 2.6 m long, 1.2 m wide.
function groutPump() {

	const parts = new Parts();
	const orange = mat( 0xd8642a, { roughness: 0.55, metalness: 0.2 } );
	for ( const x of [ - 0.5, 0.5 ] ) parts.box( DARK(), [ 0.15, 0.15, 2.6 ], [ x, 0, 0 ] );
	parts.box( DARK(), [ 1.15, 0.03, 2.6 ], [ 0, 0.15, 0 ] );

	// Pump end at the front: fluid end block and two horizontal cylinders back to the power end.
	parts.box( orange, [ 0.8, 0.55, 0.45 ], [ 0, 0.18, - 1.0 ] );
	for ( const x of [ - 0.2, 0.2 ] ) parts.rod( BRIGHT(), [ x, 0.48, - 0.78 ], [ x, 0.48, - 0.1 ], 0.11, 12 );
	parts.box( orange, [ 0.8, 0.7, 0.6 ], [ 0, 0.18, 0.2 ] );
	// Gearbox and motor.
	parts.box( DARK(), [ 0.5, 0.45, 0.4 ], [ 0, 0.18, 0.7 ] );
	parts.rod( mat( 0x2f5d3a, { roughness: 0.5, metalness: 0.3 } ), [ 0, 0.5, 0.9 ], [ 0, 0.5, 1.25 ], 0.3, 14 );
	// Suction and discharge, and the air chamber.
	parts.path( STEEL(), [ [ - 0.4, 0.3, - 1.0 ], [ - 0.55, 0.3, - 1.0 ], [ - 0.55, 0.3, - 1.4 ] ], 0.07, 8 );
	parts.cylinder( orange, 0.1, 0.35, [ 0, 0.73, - 1.0 ], 12 );
	parts.sphere( orange, 0.1, [ 0, 1.08, - 1.0 ], [ 10, 6 ] );
	parts.path( HOSE(), [ [ 0.4, 0.4, - 1.0 ], [ 0.65, 0.3, - 1.0 ], [ 0.75, 0.06, - 1.3 ], [ 0.75, 0.06, - 1.6 ] ], 0.05, 6 );
	// Lifting frame over it.
	for ( const z of [ - 1.25, 1.25 ] ) parts.path( RAIL(), [ [ - 0.52, 0.15, z ], [ - 0.52, 1.3, z ], [ 0.52, 1.3, z ], [ 0.52, 0.15, z ] ], 0.03, 6 );
	parts.rod( RAIL(), [ 0, 1.3, - 1.25 ], [ 0, 1.3, 1.25 ], 0.03, 6 );

	return parts.build();

}

// --- rebar cages -------------------------------------------------------------------------------

// Timber dunnage across the length: 6 x 6 in blocks `span` long at each z.
function dunnage( parts, span, zs ) {

	for ( const z of zs ) parts.box( TIMBER(), [ span, 0.15, 0.15 ], [ 0, 0, z ] );
	return 0.15;

}

// A bored-pile cage 1.2 m across and 12 m long lying on three dunnage: 16 longitudinal bars,
// hoops every 250 mm and heavier stiffener rings every 3 m. Bars are four-sided to keep it light.
function pileCage() {

	const parts = new Parts();
	const length = 12;
	const r = 0.6;
	const base = dunnage( parts, 1.6, [ - 4.5, 0, 4.5 ] );
	const cy = base + r;
	const bars = 16;
	for ( let i = 0; i < bars; i ++ ) {

		const a = i / bars * TAU;
		const x = Math.cos( a ) * ( r - 0.03 );
		const y = cy + Math.sin( a ) * ( r - 0.03 );
		parts.rod( REBAR(), [ x, y, - length / 2 ], [ x, y, length / 2 ], 0.016, 4 );

	}

	const ring = ( z, radius, bar ) => {

		const n = 12;
		const points = [];
		for ( let i = 0; i <= n; i ++ ) points.push( [ Math.cos( i / n * TAU ) * radius, cy + Math.sin( i / n * TAU ) * radius, z ] );
		parts.path( REBAR(), points, bar, 4, false );

	};

	for ( let z = - length / 2 + 0.1; z <= length / 2; z += 0.25 ) ring( z, r, 0.007 );
	for ( let z = - 4.5; z <= 4.5; z += 3 ) ring( z, r - 0.06, 0.014 );

	return parts.build();

}

// A diaphragm-wall cage 2.5 m wide, 0.8 m deep and 12 m long, lying flat on dunnage: two mats of
// bars (longitudinal every 200 mm, cross bars every 250 mm) tied by links, with diagonal bracing
// trusses inside for lifting.
function wallCage() {

	const parts = new Parts();
	const [ w, d, length ] = [ 2.5, 0.8, 12 ];
	const base = dunnage( parts, 3.0, [ - 5, - 1.7, 1.7, 5 ] );
	const faces = [ base + 0.03, base + d - 0.03 ];
	for ( const y of faces ) {

		for ( let x = - w / 2 + 0.05; x <= w / 2; x += 0.2 ) parts.rod( REBAR(), [ x, y, - length / 2 ], [ x, y, length / 2 ], 0.016, 4 );
		for ( let z = - length / 2 + 0.1; z <= length / 2; z += 0.25 ) parts.rod( REBAR(), [ - w / 2, y + 0.03, z ], [ w / 2, y + 0.03, z ], 0.008, 4 );

	}

	// Links between the mats, and bracing trusses down the length.
	for ( let z = - length / 2 + 0.1; z <= length / 2; z += 1.0 ) {

		for ( const x of [ - w / 2 + 0.05, - 0.4, 0.4, w / 2 - 0.05 ] ) parts.rod( REBAR(), [ x, faces[ 0 ], z ], [ x, faces[ 1 ], z ], 0.01, 4 );

	}

	for ( const x of [ - 0.6, 0.6 ] ) {

		for ( let z = - length / 2 + 0.1; z < length / 2 - 0.5; z += 1.0 ) {

			parts.rod( REBAR(), [ x, faces[ 0 ], z ], [ x, faces[ 1 ], z + 1.0 ], 0.012, 4 );

		}

	}

	return parts.build();

}

// --- tremie pipe and guide wall ----------------------------------------------------------------

// A steel rack of 10 in tremie pipe sections, 3 m long, three layers of five with their coupling
// collars, and the tremie hopper on its stand beside it.
function tremieRack() {

	const parts = new Parts();
	const pipe = mat( 0x6c7176, { roughness: 0.6, metalness: 0.5 } );
	const r = 0.137;
	const span = 3.0;

	// Rack: two cradles of posts and bearers, joined along the bottom.
	const xs = [ - 1.2, 1.2 ];
	for ( const x of xs ) {

		parts.box( DARK(), [ 0.15, 0.12, 1.8 ], [ x, 0, 0 ] );
		for ( const z of [ - 0.85, 0.85 ] ) parts.box( DARK(), [ 0.1, 1.15, 0.1 ], [ x, 0.12, z ] );

	}

	for ( const z of [ - 0.85, 0.85 ] ) parts.box( DARK(), [ 2.5, 0.1, 0.1 ], [ 0, 0.12, z ] );

	// Pipes in three layers, each on a timber spacer.
	for ( let layer = 0; layer < 3; layer ++ ) {

		const y = 0.12 + layer * ( 2 * r + 0.06 );
		for ( const x of xs ) parts.box( TIMBER(), [ 0.12, 0.06, 1.6 ], [ x, y, 0 ] );
		for ( let i = 0; i < 5; i ++ ) {

			const z = - 0.6 + i * 0.3;
			const c = y + 0.06 + r;
			parts.rod( pipe, [ - span / 2, c, z ], [ span / 2, c, z ], r, 10 );
			parts.rod( DARK(), [ span / 2 - 0.12, c, z ], [ span / 2 + 0.02, c, z ], r + 0.02, 10 );

		}

	}

	// Hopper on a four-legged stand to the right, with a pipe stub under it.
	const hx = 2.6;
	for ( const dx of [ - 0.4, 0.4 ] ) for ( const dz of [ - 0.4, 0.4 ] ) parts.box( DARK(), [ 0.08, 1.0, 0.08 ], [ hx + dx, 0, dz ] );
	parts.box( DARK(), [ 0.9, 0.08, 0.9 ], [ hx, 0.92, 0 ] );
	parts.cylinder( pipe, 0.16, 0.75, [ hx, 1.0, 0 ], 16, 0.6 );
	parts.cylinder( DARK(), 0.62, 0.06, [ hx, 1.72, 0 ], 16 );
	parts.rod( pipe, [ hx, 1.0, 0 ], [ hx, 0.3, 0 ], r, 10 );

	return parts.build();

}

// A 6 m section of diaphragm-wall guide walls: two reinforced concrete walls 1.2 m deep with a
// 1.05 m gap between them (for a 1 m wall), each an inverted L (a 250 mm stem and a 600 mm top flange outward), shown
// at full depth to be set into the ground, with timber struts across the gap every 2 m. Rows lay
// sections end to end.
function guideWall() {

	const parts = new Parts();
	const length = 6;
	const gap = 1.05;
	const depth = 1.2;
	for ( const s of [ - 1, 1 ] ) {

		const inner = s * gap / 2;
		parts.box( CONCRETE(), [ 0.25, depth, length - 0.02 ], [ inner + s * 0.125, 0, 0 ] );
		parts.box( CONCRETE(), [ 0.6, 0.2, length - 0.02 ], [ inner + s * 0.55, depth - 0.2, 0 ] );

	}

	for ( const z of [ - 2, 0, 2 ] ) for ( const y of [ 0.3, 0.85 ] ) parts.box( TIMBER(), [ gap, 0.15, 0.15 ], [ 0, y, z ] );

	return parts.build();

}
