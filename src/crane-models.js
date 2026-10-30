import { Box3, Group, MathUtils, Vector3 } from 'three';
import { buildTowerCrane, TOWER_CRANE, TOWER_CRANE_DEFAULTS } from './tower-crane.js';
import { AMBER_LAMP, across, beam, BLACK, box, BRIGHT, cabin, cylinder, DARK, hookBlock, mat, outrigger, paint, ram, RED_LAMP, rod, STEEL, telescopicBoom, wheel } from './plant-parts.js';

// Mobile cranes and telehandlers built in code, at the size of common machines of each class (no
// brand): a rough-terrain crane, a carry-deck crane, a boom truck, a spider crane, and a compact
// and a large telehandler. The cranes are set up for work like the downloaded ones: outriggers
// out and boom up, hook hanging. Each stands on y = 0 facing -Z, built round the point it stands
// and turns on (x = z = 0); their "drive" entries are worked out from that (see craneDrive).

const DEG = MathUtils.DEG2RAD;
const YELLOW = 0xf2b200;
const CARRIER = 0x3b3e42;

// A direction ahead (-Z) and up at `angle` above level, or behind (+Z) with `back`.
const boomDirection = ( angle, back = false ) => new Vector3( 0, Math.sin( angle * DEG ), ( back ? 1 : - 1 ) * Math.cos( angle * DEG ) );
const along = ( from, dir, distance ) => new Vector3().fromArray( from ).addScaledVector( dir, distance );

// Sizes are without forks; the forks stick out in front of that. Compact: a 5,500 lb, 19 ft
// class machine. Large: 12,000 lb with a 56 ft lift height, four-section boom and stabilisers.
const COMPACT_TELEHANDLER = {
	length: 3.86, width: 1.84, height: 1.94, wheelbase: 2.22, rear: 0.5, wheel: 0.46, tyre: 0.34,
	cab: 0.86, boom: { sections: 2, size: [ 0.3, 0.4 ] }, carriage: [ 1.1, 0.7 ], forks: 1.07, stabilisers: false,
};
const LARGE_TELEHANDLER = {
	length: 7.26, width: 2.49, height: 2.67, wheelbase: 3.58, rear: 1.25, wheel: 0.69, tyre: 0.5,
	cab: 0.98, boom: { sections: 4, size: [ 0.44, 0.62 ] }, carriage: [ 1.3, 0.95 ], forks: 1.22, stabilisers: true,
};

export const CRANE_ITEMS = [
	// Placed as a kind (tower-crane.js), so its height and jib can be changed once it's placed. Its
	// card shows it as placed, without the reach circle.
	{ id: TOWER_CRANE, name: 'Tower crane (hammerhead, adjustable)', category: 'Cranes & lifts', premium: true, kind: TOWER_CRANE, params: TOWER_CRANE_DEFAULTS,
		build: () => buildTowerCrane( { ...TOWER_CRANE_DEFAULTS, reach: false } ) },
	{ id: 'crane-rough-terrain-40t', name: 'Rough-terrain crane (40 t)', category: 'Cranes & lifts', premium: true, build: roughTerrainCrane,
		drive: measuredDrive( roughTerrainCrane, { topSpeed: 40, accel: 1.2, brake: 4, reverse: 10 }, [ - 0.87, 3.0, - 1.0 ] ) },
	{ id: 'crane-carry-deck-8t', name: 'Carry-deck crane (8.5 t)', category: 'Cranes & lifts', premium: true, build: carryDeckCrane,
		drive: measuredDrive( carryDeckCrane, { topSpeed: 27, accel: 1.5, brake: 4, reverse: 12 }, [ - 0.77, 2.15, - 1.65 ] ) },
	{ id: 'boom-truck-30t', name: 'Boom truck (30 t)', category: 'Cranes & lifts', premium: true, build: boomTruck,
		drive: measuredDrive( boomTruck, { topSpeed: 100, accel: 1.8, brake: 6, reverse: 12 }, [ - 0.5, 2.55, - 2.9 ] ) },
	{ id: 'crane-spider-3t', name: 'Spider crane (3 t, mini crawler)', category: 'Cranes & lifts', premium: true, build: spiderCrane,
		drive: measuredDrive( spiderCrane, { topSpeed: 2.5, accel: 0.4, brake: 1.5, reverse: 2.5 }, [ 0, 1.75, 1.1 ] ) },
	{ id: 'telehandler-compact-5500lb', name: 'Telehandler, compact (5,500 lb, 19 ft)', category: 'Material handling', premium: true, build: () => telehandler( COMPACT_TELEHANDLER ),
		drive: measuredDrive( () => telehandler( COMPACT_TELEHANDLER ), { topSpeed: 25, accel: 2, brake: 5, reverse: 15 }, telehandlerSeat( COMPACT_TELEHANDLER ) ) },
	{ id: 'telehandler-12k', name: 'Telehandler (12,000 lb, 56 ft)', category: 'Material handling', premium: true, build: () => telehandler( LARGE_TELEHANDLER ),
		drive: measuredDrive( () => telehandler( LARGE_TELEHANDLER ), { topSpeed: 29, accel: 1.6, brake: 5, reverse: 15 }, telehandlerSeat( LARGE_TELEHANDLER ) ) },
];

// Race-mode tuning for a machine built round the point it stands and turns on, whose box is mostly
// boom or forks: that point (pivot) and where the driver's eyes are (cab, given as a point
// [ x, y, z ] in the build), as drive.js takes them, in metres from the middle of its box (see
// specFor in drive.js and itemConfig in library.js). Measured from a build, so they follow any
// change to it.
function measuredDrive( build, spec, [ x, y, z ] ) {

	const { min, max } = new Box3().setFromObject( build() );
	const middle = { x: ( min.x + max.x ) / 2, z: ( min.z + max.z ) / 2 };
	const round = v => Math.round( v * 100 ) / 100;
	return {
		...spec,
		pivot: { ahead: round( middle.z ) },
		cab: { ahead: round( middle.z - z ), right: round( x - middle.x ), up: y },
	};

}

// --- rough-terrain crane ---------------------------------------------------------------------

// A 40 t (45 US ton) rough-terrain crane: two axles of big tyres on a short carrier, the cab on
// the left of the superstructure, a 4-section boom raised to 58° and run out to 22 m over the
// front, and outriggers set 6.4 m apart.
function roughTerrainCrane() {

	const group = new Group();
	const carrier = paint( CARRIER );
	const upper = paint( YELLOW );
	const length = 9.2;
	const width = 2.55;
	const r = 0.79;

	// Carrier: a narrow frame between the tyres, decks over them, outrigger boxes at both ends,
	// the engine at the back.
	box( group, carrier, [ 1.1, 0.8, length - 0.8 ], [ 0, 0.75, 0 ] );
	for ( const side of [ - 1, 1 ] ) box( group, carrier, [ 0.75, 0.08, 6.0 ], [ side * ( width / 2 - 0.375 ), 2 * r + 0.08, 0 ] );
	for ( const z of [ - 3.75, 3.75 ] ) box( group, carrier, [ width, 0.5, 0.65 ], [ 0, 0.85, z ] );
	for ( const end of [ - 1, 1 ] ) box( group, carrier, [ width - 0.1, 0.35, 0.3 ], [ 0, 0.7, end * ( length / 2 - 0.15 ) ] );
	box( group, carrier, [ 2.2, 0.5, 1.4 ], [ 0, 1.3, 3.65 ] );
	box( group, DARK(), [ 1.9, 0.36, 0.03 ], [ 0, 1.37, 4.36 ] );
	for ( const x of [ - 1.0, 1.0 ] ) box( group, RED_LAMP(), [ 0.18, 0.1, 0.04 ], [ x, 0.82, length / 2 + 0.02 ] );
	for ( const x of [ - 0.9, 0.9 ] ) box( group, mat( 0xfff3c9, { emissive: 0x6b6040 } ), [ 0.2, 0.12, 0.04 ], [ x, 0.82, - length / 2 - 0.02 ] );
	for ( const z of [ - 1.8, 1.8 ] ) {

		across( group, DARK(), 0.12, width - 1.0, [ 0, r, z ], 10 );
		for ( const side of [ - 1, 1 ] ) wheel( group, r, 0.6, [ side * ( width / 2 - 0.3 ), r, z ] );

	}

	for ( const side of [ - 1, 1 ] ) for ( const z of [ - 3.75, 3.75 ] ) outrigger( group, carrier, [ side * width / 2, 1.0, z ], { out: side * 1.95, pad: 0.6, beam: [ 0.32, 0.36 ] } );

	// Superstructure on its slewing ring: frame, counterweight, hoist drum and the cab.
	cylinder( group, DARK(), 1.05, 0.28, [ 0, 1.6, 0.2 ], 24 );
	box( group, upper, [ 1.65, 1.0, 4.2 ], [ 0.33, 1.88, 1.1 ] );
	box( group, upper, [ 2.4, 1.2, 0.9 ], [ 0.1, 1.9, 3.6 ] );
	across( group, DARK(), 0.36, 0.8, [ 0.33, 3.2, 2.75 ], 16 );
	cabin( group, upper, [ 0.8, 1.7, 1.6 ], [ - 0.87, 1.88, - 0.8 ], { sill: 0.35 } );
	cylinder( group, AMBER_LAMP(), 0.07, 0.12, [ - 0.87, 3.58, - 0.3 ], 10 );

	// Boom, its lift cylinder, the hoist rope and the hook block.
	const foot = [ 0.33, 3.0, 2.4 ];
	const dir = boomDirection( 58 );
	const head = telescopicBoom( group, upper, foot, along( foot, dir, 22 ), { sections: 4, size: [ 0.7, 1.0 ] } );
	across( group, STEEL(), 0.2, 0.9, foot, 12 );
	ram( group, 0.18, [ 0.33, 2.2, - 0.7 ], along( foot, dir, 6.2 ) );
	const hook = 7;
	for ( const dx of [ - 0.12, 0.12 ] ) rod( group, BLACK(), 0.018, [ head.x + dx, head.y, head.z ], [ head.x + dx, hook, head.z ], 6 );
	hookBlock( group, [ head.x, hook, head.z ], 0.9 );
	return group;

}

// --- carry-deck crane ------------------------------------------------------------------------

// An 8.5 t (9 US ton) carry-deck crane: a low four-wheel carrier with a flat deck behind, the
// turret at the front with the cab beside it, and a 3-section boom raised to 32° and run out to
// 8 m over the front to pick and carry.
function carryDeckCrane() {

	const group = new Group();
	const body = paint( YELLOW );
	const length = 5.33;
	const width = 2.24;
	const r = 0.5;

	// Carrier and deck.
	box( group, DARK(), [ 1.3, 0.55, length - 0.4 ], [ 0, 0.42, 0 ] );
	box( group, body, [ width, 0.12, length ], [ 0, 0.95, 0 ] );
	box( group, mat( 0x6b6f73, { roughness: 0.8, metalness: 0.4 } ), [ width - 0.1, 0.02, 3.1 ], [ 0, 1.07, 1.05 ] );
	for ( let z = - 0.4; z <= length / 2; z += 0.75 ) for ( const side of [ - 1, 1 ] ) box( group, DARK(), [ 0.06, 0.12, 0.08 ], [ side * ( width / 2 - 0.03 ), 1.07, z ] );
	box( group, DARK(), [ width, 0.3, 0.18 ], [ 0, 0.62, - length / 2 + 0.09 ] );
	box( group, DARK(), [ width, 0.3, 0.18 ], [ 0, 0.62, length / 2 - 0.09 ] );
	for ( const z of [ - 1.65, 1.65 ] ) for ( const side of [ - 1, 1 ] ) wheel( group, r, 0.32, [ side * ( width / 2 - 0.16 ), r, z ] );
	for ( const x of [ - 0.9, 0.9 ] ) box( group, RED_LAMP(), [ 0.14, 0.08, 0.03 ], [ x, 0.75, length / 2 + 0.01 ] );

	// Engine housing on the right, turret in the middle, cab on the left.
	box( group, body, [ 0.65, 0.6, 1.6 ], [ 0.78, 1.07, - 1.6 ] );
	cylinder( group, DARK(), 0.45, 0.15, [ 0, 1.07, - 1.35 ], 20 );
	box( group, body, [ 0.8, 0.6, 1.3 ], [ 0, 1.22, - 1.35 ] );
	cabin( group, body, [ 0.7, 1.4, 1.1 ], [ - 0.77, 1.07, - 1.65 ], { sill: 0.3 } );
	cylinder( group, AMBER_LAMP(), 0.06, 0.1, [ - 0.77, 2.47, - 1.4 ], 10 );

	const foot = [ 0, 1.85, - 0.75 ];
	const dir = boomDirection( 32 );
	const head = telescopicBoom( group, body, foot, along( foot, dir, 8 ), { sections: 3, size: [ 0.42, 0.55 ] } );
	ram( group, 0.1, [ 0, 1.35, - 1.9 ], along( foot, dir, 2.4 ) );
	const hook = 2.6;
	rod( group, BLACK(), 0.014, head, [ head.x, hook, head.z ], 6 );
	hookBlock( group, [ head.x, hook, head.z ], 0.55 );
	return group;

}

// --- boom truck ------------------------------------------------------------------------------

// A 30 t (33 US ton) boom truck: a crane on a tandem-axle truck behind its cab, outriggers set at
// the turret and the back, the boom raised to 58° and run out to 25 m over the flat deck.
function boomTruck() {

	const group = new Group();
	const truck = paint( 0xeceae4 );
	const crane = paint( 0xc8281e );
	const length = 11.6;
	const width = 2.59;
	const r = 0.52;

	// Chassis, wheels, fuel tanks and the deck.
	for ( const x of [ - 0.43, 0.43 ] ) box( group, DARK(), [ 0.1, 0.3, length - 0.5 ], [ x, 0.85, 0.25 ] );
	across( group, DARK(), 0.07, 1.9, [ 0, r, - 4.2 ], 8 );
	for ( const side of [ - 1, 1 ] ) wheel( group, r, 0.32, [ side * ( width / 2 - 0.16 ), r, - 4.2 ] );
	for ( const z of [ 2.6, 3.95 ] ) {

		across( group, DARK(), 0.07, 1.9, [ 0, r, z ], 8 );
		for ( const side of [ - 1, 1 ] ) wheel( group, r, 0.27, [ side * ( width / 2 - 0.29 ), r, z ], { dual: true } );

	}

	for ( const side of [ - 1, 1 ] ) across( group, BRIGHT(), 0.3, 1.0, [ side * 0.95, 0.75, - 2.9 ], 16 ).rotation.set( Math.PI / 2, 0, 0 );
	box( group, mat( 0x55595e, { roughness: 0.7, metalness: 0.4 } ), [ 2.44, 0.15, 6.2 ], [ 0, 1.15, 2.7 ] );
	for ( const side of [ - 1, 1 ] ) box( group, DARK(), [ 0.05, 0.25, 6.2 ], [ side * 1.22, 1.05, 2.7 ] );
	for ( const x of [ - 1.05, 1.05 ] ) box( group, RED_LAMP(), [ 0.16, 0.1, 0.04 ], [ x, 1.0, length / 2 + 0.02 ] );

	// Hood, grille, bumper, fenders and cab.
	box( group, truck, [ 1.25, 1.0, 2.2 ], [ 0, 1.15, - 4.65 ] );
	box( group, BRIGHT(), [ 1.0, 0.85, 0.05 ], [ 0, 1.2, - 5.77 ] );
	box( group, BRIGHT(), [ 2.5, 0.35, 0.22 ], [ 0, 0.5, - 5.69 ] );
	for ( const x of [ - 0.95, 0.95 ] ) box( group, mat( 0xfff3c9, { emissive: 0x6b6040 } ), [ 0.22, 0.14, 0.04 ], [ x, 1.3, - 5.77 ] );
	for ( const side of [ - 1, 1 ] ) box( group, truck, [ 0.6, 0.12, 1.3 ], [ side * 0.95, 1.12, - 4.2 ] );
	cabin( group, truck, [ 2.3, 1.9, 1.8 ], [ 0, 1.25, - 2.65 ], { sill: 0.35, rearGlass: false } );
	for ( const side of [ - 1, 1 ] ) box( group, DARK(), [ 0.04, 0.3, 0.2 ], [ side * 1.3, 2.4, - 3.4 ] );
	cylinder( group, AMBER_LAMP(), 0.07, 0.12, [ 0, 3.15, - 2.65 ], 10 );

	// The crane: pedestal, slewing ring, turret, outriggers.
	box( group, crane, [ 1.5, 0.55, 1.1 ], [ 0, 1.15, - 1.15 ] );
	cylinder( group, DARK(), 0.6, 0.18, [ 0, 1.7, - 1.15 ], 22 );
	box( group, crane, [ 1.2, 0.8, 1.6 ], [ 0, 1.88, - 1.0 ] );
	across( group, DARK(), 0.28, 0.7, [ 0, 2.45, - 0.1 ], 14 );
	for ( const side of [ - 1, 1 ] ) {

		outrigger( group, crane, [ side * 0.75, 1.0, - 1.15 ], { out: side * 2.45, pad: 0.55, beam: [ 0.26, 0.3 ] } );
		outrigger( group, crane, [ side * 0.75, 0.95, 5.45 ], { out: side * 2.15, pad: 0.5, beam: [ 0.24, 0.28 ] } );

	}

	const foot = [ 0, 2.75, - 1.6 ];
	const dir = boomDirection( 58, true );
	const head = telescopicBoom( group, crane, foot, along( foot, dir, 25 ), { sections: 4, size: [ 0.55, 0.75 ] } );
	across( group, STEEL(), 0.16, 0.7, foot, 12 );
	ram( group, 0.15, [ 0, 2.1, - 0.4 ], along( foot, dir, 5.5 ) );
	const hook = 8;
	for ( const dx of [ - 0.1, 0.1 ] ) rod( group, BLACK(), 0.016, [ head.x + dx, head.y, head.z ], [ head.x + dx, hook, head.z ], 6 );
	hookBlock( group, [ head.x, hook, head.z ], 0.75, 0xc8281e );
	return group;

}

// --- spider crane ----------------------------------------------------------------------------

// A 3 t mini crawler ("spider") crane, the kind that drives through a doorway: rubber tracks under
// a narrow body, four legs folded out and set on their pads, and a 4-section boom raised to 62°
// and run out to 8.2 m. It's driven from a seat at the back.
function spiderCrane() {

	const group = new Group();
	const body = paint( 0xe2591d );
	const boom = paint( 0xeeeeea );
	const inner = mat( 0xc9cbcd, { roughness: 0.4, metalness: 0.5 } );

	// Tracks, each a belt round two end drums.
	for ( const x of [ - 0.27, 0.27 ] ) {

		box( group, BLACK(), [ 0.2, 0.36, 1.84 ], [ x, 0, 0 ] );
		for ( const z of [ - 0.92, 0.92 ] ) across( group, BLACK(), 0.18, 0.2, [ x, 0.18, z ], 14 );

	}

	box( group, body, [ 0.74, 0.55, 2.5 ], [ 0, 0.36, 0 ] );
	cylinder( group, DARK(), 0.32, 0.12, [ 0, 0.91, - 0.15 ], 20 );
	box( group, body, [ 0.62, 0.4, 1.2 ], [ 0, 1.03, - 0.15 ] );
	// Seat and controls at the back.
	box( group, DARK(), [ 0.45, 0.12, 0.42 ], [ 0, 0.91, 0.95 ] );
	box( group, DARK(), [ 0.45, 0.45, 0.08 ], [ 0, 1.03, 1.2 ] );
	for ( const x of [ - 0.15, 0, 0.15 ] ) rod( group, BLACK(), 0.012, [ x, 0.91, 0.55 ], [ x, 1.25, 0.58 ], 6 );

	// Legs: hinged at the body's corners, out to a knee, then a jack down to the pad.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		const hinge = [ sx * 0.37, 0.78, sz * 1.0 ];
		const knee = [ sx * 2.1, 1.0, sz > 0 ? 2.0 : - 1.85 ];
		beam( group, body, [ 0.12, 0.15 ], hinge, knee );
		cylinder( group, DARK(), 0.055, 0.98, [ knee[ 0 ], 0.06, knee[ 2 ] ], 10 );
		cylinder( group, DARK(), 0.18, 0.06, [ knee[ 0 ], 0, knee[ 2 ] ], 16 );

	}

	const foot = [ 0, 1.35, 0.35 ];
	const dir = boomDirection( 62 );
	const head = telescopicBoom( group, boom, foot, along( foot, dir, 8.2 ), { sections: 4, size: [ 0.26, 0.32 ], inner } );
	ram( group, 0.07, [ 0, 1.05, - 0.65 ], along( foot, dir, 1.8 ) );
	const hook = 2.6;
	rod( group, BLACK(), 0.01, head, [ head.x, hook, head.z ], 6 );
	hookBlock( group, [ head.x, hook, head.z ], 0.4, 0xe2591d );
	return group;

}

// --- telehandlers ----------------------------------------------------------------------------

// Where a telehandler's driver's eyes are: in the cab, ahead of the seat.
function telehandlerSeat( { length, width, wheelbase, rear, wheel: r, cab } ) {

	const frontAxle = length / 2 - rear - wheelbase;
	const rearAxle = length / 2 - rear;
	return [ - width / 2 + cab / 2 + 0.03, r * 1.7 - 0.1 + 0.95, ( frontAxle + rearAxle ) / 2 - 0.25 ];

}

// A telehandler in travel position, boom down and forks a little off the ground: the cab on the
// left, the engine on the right, the boom pivoting at the back between them.
function telehandler( { length, width, height, wheelbase, rear, wheel: r, tyre, cab, boom, carriage: [ carriageWidth, carriageHeight ], forks, stabilisers } ) {

	const group = new Group();
	const body = paint( 0xf0a30a );
	const frontZ = - length / 2;
	const frontAxle = length / 2 - rear - wheelbase;
	const rearAxle = length / 2 - rear;
	const frameWidth = width - 2 * tyre - 0.1;
	const frameTop = r * 1.7;

	// Frame from just ahead of the front axle to the back, its sides in the body colour; axles,
	// wheels, mudguards over the front wheels.
	const frameFront = frontAxle - r * 0.7;
	const frameLength = length / 2 - 0.05 - frameFront;
	box( group, DARK(), [ frameWidth - 0.1, r * 0.5, frameLength ], [ 0, r * 0.55, frameFront + frameLength / 2 ] );
	for ( const side of [ - 1, 1 ] ) box( group, body, [ 0.06, frameTop - r * 0.75, frameLength ], [ side * ( frameWidth / 2 - 0.03 ), r * 0.75, frameFront + frameLength / 2 ] );
	box( group, body, [ frameWidth, 0.05, frameLength ], [ 0, frameTop - 0.05, frameFront + frameLength / 2 ] );
	for ( const z of [ frontAxle, rearAxle ] ) {

		across( group, DARK(), r * 0.22, frameWidth + 0.2, [ 0, r, z ], 10 );
		for ( const side of [ - 1, 1 ] ) wheel( group, r, tyre, [ side * ( width - tyre ) / 2, r, z ], { rim: paint( 0x9a9ea2 ) } );

	}

	for ( const side of [ - 1, 1 ] ) box( group, body, [ tyre + 0.08, 0.04, r * 1.6 ], [ side * ( width - tyre ) / 2, 2 * r + 0.05, frontAxle ] );

	// Engine bay on the right, clear of the boom, and a counterweight across the back.
	const boomX = - width / 2 + cab + 0.03 + boom.size[ 0 ] / 2 + 0.05;
	const engineWidth = width / 2 - 0.02 - ( boomX + boom.size[ 0 ] / 2 + 0.03 );
	box( group, body, [ engineWidth, r * 1.0, wheelbase * 0.75 ], [ width / 2 - engineWidth / 2 - 0.02, frameTop - 0.05, rearAxle - wheelbase * 0.35 ] );
	box( group, body, [ width - 0.2, r * 1.3, rear * 0.6 ], [ 0, r * 0.7, length / 2 - rear * 0.3 ] );
	for ( const x of [ - width / 2 + 0.25, width / 2 - 0.25 ] ) box( group, RED_LAMP(), [ 0.12, 0.07, 0.03 ], [ x, r * 1.6, length / 2 + 0.01 ] );

	// Cab on the left, over the frame between the axles.
	const cabBase = frameTop - 0.1;
	const cabLength = wheelbase * 0.62;
	cabin( group, body, [ cab, height - cabBase, cabLength ], [ - width / 2 + cab / 2 + 0.03, cabBase, ( frontAxle + rearAxle ) / 2 - 0.1 ], { sill: 0.32 } );
	cylinder( group, AMBER_LAMP(), 0.06, 0.1, [ - width / 2 + cab / 2 + 0.03, height, ( frontAxle + rearAxle ) / 2 + cabLength / 2 - 0.2 ], 10 );
	box( group, DARK(), [ 0.04, 0.22, 0.14 ], [ - width / 2 - 0.02, height - 0.6, ( frontAxle + rearAxle ) / 2 - cabLength / 2 + 0.1 ] );

	// Boom: pivoting on a tower at the back, sloping down to the carriage in front, lifted by a
	// cylinder from the frame. Inner sections a shade lighter.
	const pivot = new Vector3( boomX, height - boom.size[ 1 ] * 0.6, rearAxle + 0.1 );
	const forkY = 0.12 + 0.05;
	const tip = new Vector3( boomX, forkY + carriageHeight * 0.75, frontZ + 0.35 );
	box( group, body, [ boom.size[ 0 ] + 0.2, pivot.y - frameTop + 0.2, 0.5 ], [ boomX, frameTop - 0.1, pivot.z ] );
	telescopicBoom( group, body, pivot, tip, { sections: boom.sections, size: boom.size, inner: paint( 0xf4b73a ), head: false } );
	ram( group, boom.size[ 0 ] * 0.3, [ boomX, frameTop + 0.05, frontAxle + 0.25 ], pivot.clone().lerp( tip, 0.45 ) );

	// Carriage and forks.
	const face = frontZ + 0.1;
	box( group, DARK(), [ carriageWidth, carriageHeight, 0.08 ], [ boomX, forkY, face + 0.04 ] );
	for ( const x of [ - carriageWidth * 0.3, carriageWidth * 0.3 ] ) {

		box( group, STEEL(), [ 0.12, carriageHeight * 0.85, 0.05 ], [ boomX + x, forkY, face - 0.025 ] );
		box( group, STEEL(), [ 0.12, 0.05, forks ], [ boomX + x, forkY - 0.05, face - forks / 2 ] );

	}

	// Stabilisers, raised for travel, at the front corners of the frame.
	if ( stabilisers ) for ( const side of [ - 1, 1 ] ) {

		const hinge = [ side * frameWidth / 2, frameTop - 0.15, frontAxle - r - 0.2 ];
		const pad = [ side * ( width / 2 - 0.15 ), r * 0.8, frontAxle - r - 0.35 ];
		beam( group, body, [ 0.16, 0.2 ], hinge, pad );
		cylinder( group, DARK(), 0.2, 0.06, [ pad[ 0 ], pad[ 1 ] - 0.1, pad[ 2 ] ], 14 );

	}

	return group;

}
