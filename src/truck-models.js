import { Box3, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, Shape, Vector3 } from 'three';
import { across, AMBER_LAMP, BLACK, box, BRIGHT, cabin, DARK, mat, paint, RED_LAMP, rod, wheel } from './plant-parts.js';

// Gravel trucks and trailers built in code, as there are no clean downloads of them: the dump
// trucks and pups seen hauling aggregate in western Canada, at the size of common ones of each
// configuration (no brand).
//
// - Tandem and tridem dump trucks: a conventional cab with a steel box, two or three drive axles.
// - Pups: a box trailer on a drawbar hitched to the truck's pintle, tandem or tridem.
// - Transfer trailer: its own box on rails, rolled forward into the truck's emptied box to dump.
// - Truck and pup, truck and transfer, tri-tri (tridem truck and tridem pup): hitched up, as one
//   item, about 19 to 23 m long.
// - End dump, belly dump and lowboy trailers, for a semi tractor from the library.
//
// Each stands on y = 0 facing -Z, with +X on its right, centred on the middle of its box.

const FT = 0.3048;
const WIDTH = 2.59; // 8 ft 6 in, the legal width
const R = 0.53; // 11R22.5 tyres
const SPREAD = 1.37; // 54 in between axles in a group
const BOX_STEEL = 0x8f959a;

const lamp = () => mat( 0xfff3c9, { emissive: 0x6b6040 } );

// Wheels and axles for a group of axles centred at z: duals unless `single`.
function axles( group, count, z, { single = false, spread = SPREAD, r = R } = {} ) {

	for ( let i = 0; i < count; i ++ ) {

		const at = z + ( i - ( count - 1 ) / 2 ) * spread;
		across( group, DARK(), 0.07, 1.9, [ 0, r, at ], 8 );
		for ( const side of [ - 1, 1 ] ) {

			if ( single ) wheel( group, r, 0.3, [ side * ( WIDTH / 2 - 0.16 ), r, at ] );
			else wheel( group, r, 0.27, [ side * ( WIDTH / 2 - 0.29 ), r, at ], { dual: true } );

		}

	}

}

// Mud flaps behind a group of axles ending at z.
function flaps( group, z, y = 0.2 ) {

	for ( const side of [ - 1, 1 ] ) box( group, BLACK(), [ 0.55, 0.65, 0.02 ], [ side * ( WIDTH / 2 - 0.3 ), y, z ] );

}

// An open steel box from z0 (front) to z1 (back), its floor at y0: floor, ribbed sides, a
// headboard and a tailgate, with red lamps on the back.
function dumpBox( group, material, z0, z1, y0, high = 1.5 ) {

	const length = z1 - z0;
	const mid = ( z0 + z1 ) / 2;
	const t = 0.06;
	box( group, material, [ WIDTH - 0.1, 0.12, length ], [ 0, y0, mid ] );
	for ( const side of [ - 1, 1 ] ) {

		box( group, material, [ t, high, length ], [ side * ( WIDTH / 2 - 0.05 - t / 2 ), y0, mid ] );
		// Top rail and upright ribs.
		box( group, material, [ 0.1, 0.1, length + 0.04 ], [ side * ( WIDTH / 2 - 0.05 ), y0 + high - 0.1, mid ] );
		const ribs = Math.max( 2, Math.round( length / 0.9 ) );
		for ( let i = 0; i <= ribs; i ++ ) box( group, material, [ 0.1, high - 0.1, 0.08 ], [ side * ( WIDTH / 2 - 0.03 ), y0, z0 + 0.04 + i * ( length - 0.08 ) / ribs ] );

	}

	box( group, material, [ WIDTH - 0.1, high + 0.25, t ], [ 0, y0, z0 + t / 2 ] );
	box( group, material, [ WIDTH - 0.1, high, 0.1 ], [ 0, y0, z1 - 0.05 ] );
	// Long-floor frame under it.
	for ( const x of [ - 0.45, 0.45 ] ) box( group, DARK(), [ 0.14, 0.25, length ], [ x, y0 - 0.25, mid ] );
	for ( const x of [ - 1.05, 1.05 ] ) box( group, RED_LAMP(), [ 0.16, 0.1, 0.04 ], [ x, y0 - 0.12, z1 + 0.01 ] );

}

// --- dump trucks -----------------------------------------------------------------------------

// A conventional-cab dump truck with `count` drive axles (2: tandem, 3: tridem). Returns the
// group and where its pintle hook is, for a pup or transfer behind it.
function dumpTruck( count, { cabColour = 0xb4231b, boxColour = BOX_STEEL } = {} ) {

	const group = new Group();
	const cab = paint( cabColour );
	const steel = mat( boxColour, { roughness: 0.55, metalness: 0.45 } );
	const front = - 5.25;
	const rear = count === 3 ? 3.7 : 3.2; // middle of the drive axles
	const back = rear + ( count - 1 ) / 2 * SPREAD + 0.75;

	// Frame rails, bumper, fuel tanks and steps.
	for ( const x of [ - 0.43, 0.43 ] ) box( group, DARK(), [ 0.1, 0.3, back - front - 0.25 ], [ x, 0.8, ( front + back ) / 2 + 0.1 ] );
	box( group, BRIGHT(), [ WIDTH - 0.1, 0.35, 0.22 ], [ 0, 0.45, front + 0.12 ] );
	for ( const side of [ - 1, 1 ] ) across( group, BRIGHT(), 0.32, 1.05, [ side * 0.92, 0.75, - 1.75 ], 16 ).rotation.set( Math.PI / 2, 0, 0 );
	axles( group, 1, - 4.0, { single: true } );
	axles( group, count, rear );
	flaps( group, back - 0.15 );

	// Hood, grille, headlamps, fenders and cab, an exhaust stack and a beacon.
	box( group, cab, [ 1.3, 1.05, 2.25 ], [ 0, 1.1, front + 1.37 ] );
	box( group, BRIGHT(), [ 1.05, 0.95, 0.05 ], [ 0, 1.15, front + 0.25 ] );
	for ( const x of [ - 0.98, 0.98 ] ) box( group, lamp(), [ 0.22, 0.14, 0.04 ], [ x, 1.3, front + 0.27 ] );
	for ( const side of [ - 1, 1 ] ) box( group, cab, [ 0.62, 0.14, 1.35 ], [ side * 0.97, 1.08, - 4.0 ] );
	cabin( group, cab, [ 2.35, 1.85, 1.75 ], [ 0, 1.3, - 2.45 ], { sill: 0.38, rearGlass: false } );
	for ( const side of [ - 1, 1 ] ) box( group, DARK(), [ 0.04, 0.32, 0.22 ], [ side * 1.33, 2.45, - 3.2 ] );
	const stack = new Mesh( new CylinderGeometry( 0.09, 0.09, 2.3, 12 ), BRIGHT() );
	stack.position.set( 1.05, 2.25, - 1.45 );
	group.add( stack );
	box( group, AMBER_LAMP(), [ 0.8, 0.1, 0.12 ], [ 0, 3.15, - 2.45 ] );

	// The box, starting behind the cab, with a cab shield reaching forward over its roof.
	dumpBox( group, steel, - 1.25, back + 0.05, 1.5 );
	box( group, steel, [ WIDTH - 0.3, 0.05, 0.8 ], [ 0, 3.22, - 1.55 ] );

	return { group, hitch: back + 0.15 };

}

// A pup: a box trailer on a drawbar. Its drawbar eye is at z = 0 and it runs back along +Z.
function pup( count, { boxColour = BOX_STEEL, boxLength = count === 3 ? 7.6 : 6.4 } = {} ) {

	const group = new Group();
	const steel = mat( boxColour, { roughness: 0.55, metalness: 0.45 } );
	const drawbar = 3.4;
	const z0 = drawbar;
	const z1 = z0 + boxLength;
	// A tridem pup's axles sit under the middle of its box; a tandem pup's a little back of it.
	const axleZ = count === 3 ? ( z0 + z1 ) / 2 + 0.3 : ( z0 + z1 ) / 2 + 0.6;

	// The A-frame drawbar from the eye to the front of the frame.
	for ( const side of [ - 1, 1 ] ) {

		rod( group, DARK(), 0.06, [ 0, 0.85, 0.2 ], [ side * 0.5, 0.95, drawbar ] );

	}

	box( group, DARK(), [ 0.18, 0.12, 0.25 ], [ 0, 0.8, 0.12 ] );
	axles( group, count, axleZ );
	flaps( group, z1 - 0.2 );
	dumpBox( group, steel, z0, z1, 1.45 );
	return group;

}

// A transfer trailer: a frame with rails along its top on which its own box rolls, so it can be
// run forward into the truck's box once that's empty. Drawbar eye at z = 0, running back along +Z.
function transfer( { boxColour = BOX_STEEL } = {} ) {

	const group = new Group();
	const steel = mat( boxColour, { roughness: 0.55, metalness: 0.45 } );
	const drawbar = 2.6;
	const frameLength = 8.4;
	const z0 = drawbar;
	const z1 = z0 + frameLength;

	for ( const side of [ - 1, 1 ] ) {

		rod( group, DARK(), 0.06, [ 0, 0.85, 0.2 ], [ side * 0.5, 0.95, drawbar ] );
		// The frame rails, and the rails the box runs on.
		box( group, DARK(), [ 0.16, 0.35, frameLength ], [ side * 0.5, 0.95, ( z0 + z1 ) / 2 ] );
		box( group, STEEL_RAIL(), [ 0.12, 0.1, frameLength ], [ side * 1.05, 1.45, ( z0 + z1 ) / 2 ] );

	}

	for ( let z = z0 + 0.3; z < z1; z += 1.4 ) box( group, DARK(), [ 2.2, 0.14, 0.12 ], [ 0, 1.3, z ] );
	box( group, DARK(), [ 0.18, 0.12, 0.25 ], [ 0, 0.8, 0.12 ] );
	axles( group, 3, z1 - 1.9 );
	flaps( group, z1 - 0.2 );
	// The box, sitting at the back of the frame ready to roll forward, on its own small wheels.
	const boxZ0 = z1 - 6.4;
	dumpBox( group, steel, boxZ0, z1 - 0.05, 1.68, 1.45 );
	for ( const side of [ - 1, 1 ] ) for ( const z of [ boxZ0 + 0.5, z1 - 0.5 ] ) across( group, DARK(), 0.12, 0.12, [ side * 1.05, 1.62, z ], 10 );
	return group;

}

const STEEL_RAIL = () => mat( 0x7d8287, { roughness: 0.45, metalness: 0.6 } );

// A truck with a trailer hitched behind it, the drawbar eye on its pintle.
function hitched( truck, trailer ) {

	const group = new Group();
	group.add( truck.group );
	trailer.position.z = truck.hitch;
	group.add( trailer );
	return centred( group );

}

// The group moved so the middle of its box is over the origin, as items are placed by.
function centred( group ) {

	const { min, max } = new Box3().setFromObject( group );
	const offset = new Vector3( - ( min.x + max.x ) / 2, 0, - ( min.z + max.z ) / 2 );
	const outer = new Group();
	group.position.add( offset );
	outer.add( group );
	return outer;

}

// --- semi trailers ---------------------------------------------------------------------------

// The front of a semi trailer: its kingpin plate and landing gear. The kingpin is 0.9 m behind z0.
function semiFront( group, material, z0, deck ) {

	box( group, material, [ WIDTH - 0.3, 0.15, 1.6 ], [ 0, deck - 0.15, z0 + 0.8 ] );
	box( group, DARK(), [ 0.12, 0.12, 0.12 ], [ 0, deck - 0.27, z0 + 0.9 ] );
	for ( const side of [ - 1, 1 ] ) {

		box( group, DARK(), [ 0.12, deck - 0.3, 0.12 ], [ side * 0.85, 0.15, z0 + 2.4 ] );
		box( group, DARK(), [ 0.3, 0.06, 0.3 ], [ side * 0.85, 0.0, z0 + 2.4 ] );

	}

}

// A half-round end dump trailer, 38 ft, tri-axle: the tub sits low, its tailgate hinged at the top.
function endDump() {

	const group = new Group();
	const tub = mat( 0xc3c7ca, { roughness: 0.35, metalness: 0.65 } );
	const length = 38 * FT;
	const z0 = - length / 2;
	const z1 = length / 2;
	const floor = 1.35;
	const radius = WIDTH / 2 - 0.05;

	semiFront( group, DARK(), z0, floor );
	for ( const x of [ - 0.45, 0.45 ] ) box( group, DARK(), [ 0.14, 0.3, length - 1 ], [ x, floor - 0.3, 0.4 ] );
	// The tub: a half cylinder along the trailer, open on top, with its front and tailgate.
	// The half of a cylinder on -Z, turned to lie along the trailer, is its lower half.
	const shell = new Mesh( new CylinderGeometry( radius, radius, length - 0.2, 28, 1, true, Math.PI / 2, Math.PI ), mat( 0xc3c7ca, { roughness: 0.35, metalness: 0.65, side: DoubleSide } ) );
	shell.rotation.x = - Math.PI / 2;
	shell.position.set( 0, floor + radius, 0 );
	group.add( shell );
	const end = new Mesh( new CylinderGeometry( radius, radius, 0.06, 28, 1, false, Math.PI / 2, Math.PI ), tub );
	for ( const z of [ z0 + 0.1, z1 - 0.1 ] ) {

		const cap = end.clone();
		cap.rotation.x = - Math.PI / 2;
		cap.position.set( 0, floor + radius, z );
		group.add( cap );

	}

	// Its top rails, the hoist at the front and a tarp roll.
	for ( const side of [ - 1, 1 ] ) box( group, tub, [ 0.12, 0.1, length - 0.2 ], [ side * radius, floor + radius - 0.05, 0 ] );
	box( group, DARK(), [ 0.35, floor + radius - 0.4, 0.35 ], [ 0, 0.4, z0 - 0.1 ] );
	across( group, mat( 0x1c3a5c, { roughness: 0.9 } ), 0.12, WIDTH - 0.3, [ 0, floor + radius + 0.15, z0 + 0.3 ], 10 );
	axles( group, 3, z1 - 1.9 );
	flaps( group, z1 - 0.15 );
	for ( const x of [ - 1.05, 1.05 ] ) box( group, RED_LAMP(), [ 0.16, 0.1, 0.04 ], [ x, floor - 0.1, z1 + 0.02 ] );
	return group;

}

// A belly (bottom) dump trailer, 40 ft, tandem: a hopper whose sides slope down to gates between
// the kingpin and the axles.
function bellyDump() {

	const group = new Group();
	const body = mat( 0xd7d9db, { roughness: 0.4, metalness: 0.55 } );
	const length = 40 * FT;
	const z0 = - length / 2;
	const z1 = length / 2;
	const top = 3.0;

	// The hopper's cross-section, extruded along its length; the ends slope in to the gates too.
	const section = new Shape();
	section.moveTo( - WIDTH / 2, top );
	section.lineTo( WIDTH / 2, top );
	section.lineTo( WIDTH / 2, top - 0.9 );
	section.lineTo( 0.45, 0.55 );
	section.lineTo( - 0.45, 0.55 );
	section.lineTo( - WIDTH / 2, top - 0.9 );
	section.closePath();
	const hopperLength = length - 4.6;
	const hopper = new Mesh( new ExtrudeGeometry( section, { depth: hopperLength, bevelEnabled: false } ), body );
	hopper.position.z = z0 + 1.1;
	group.add( hopper );
	// Its ends, front and back.
	for ( const z of [ z0 + 1.1, z0 + 1.1 + hopperLength ] ) {

		const end = new Mesh( new ExtrudeGeometry( section, { depth: 0.06, bevelEnabled: false } ), body );
		end.position.z = z - 0.03;
		group.add( end );

	}

	// The gates' rams under the middle, the deck at the front and the axles behind.
	box( group, DARK(), [ 0.2, 0.2, hopperLength - 1 ], [ 0, 0.4, z0 + 1.1 + hopperLength / 2 ] );
	box( group, body, [ WIDTH - 0.1, 0.12, 0.25 ], [ 0, top - 0.05, z0 + 0.1 ] );
	semiFront( group, DARK(), z0, 1.35 );
	axles( group, 2, z1 - 1.3 );
	box( group, DARK(), [ 2.3, 0.25, 3 ], [ 0, 1.05, z1 - 1.4 ] );
	flaps( group, z1 - 0.15 );
	for ( const x of [ - 1.05, 1.05 ] ) box( group, RED_LAMP(), [ 0.16, 0.1, 0.04 ], [ x, 1.15, z1 + 0.02 ] );
	return group;

}

// A lowboy (lowbed) for moving machines: a gooseneck over the tractor's fifth wheel, a drop deck
// 0.6 m off the ground between the neck and three rear axles. 53 ft overall.
function lowboy() {

	const group = new Group();
	const frame = paint( 0x1f2328 );
	const deckWood = mat( 0x7a5a3a, { roughness: 0.9 } );
	const length = 53 * FT;
	const z0 = - length / 2;
	const z1 = length / 2;
	const neck = 3.6;
	const well = 8.4;
	const deck = 0.6;

	// Gooseneck: high at the front over the fifth wheel, stepping down into the well.
	box( group, frame, [ WIDTH - 0.2, 0.35, neck ], [ 0, 1.25, z0 + neck / 2 ] );
	box( group, frame, [ WIDTH - 0.2, 1.0, 0.5 ], [ 0, deck, z0 + neck + 0.25 ] );
	box( group, DARK(), [ 0.12, 0.12, 0.12 ], [ 0, 1.13, z0 + 0.9 ] );
	// The well: steel side beams and a wooden deck.
	const wellZ0 = z0 + neck + 0.5;
	for ( const side of [ - 1, 1 ] ) box( group, frame, [ 0.2, 0.45, well ], [ side * ( WIDTH / 2 - 0.1 ), deck - 0.3, wellZ0 + well / 2 ] );
	box( group, deckWood, [ WIDTH - 0.4, 0.08, well ], [ 0, deck, wellZ0 + well / 2 ] );
	// Rear deck over the axles.
	const rearZ0 = wellZ0 + well;
	box( group, frame, [ WIDTH - 0.1, 0.4, z1 - rearZ0 ], [ 0, 1.0, ( rearZ0 + z1 ) / 2 ] );
	box( group, deckWood, [ WIDTH - 0.4, 0.06, z1 - rearZ0 ], [ 0, 1.4, ( rearZ0 + z1 ) / 2 ] );
	axles( group, 3, z1 - 1.85, { r: 0.42 } );
	for ( const x of [ - 1.05, 1.05 ] ) box( group, RED_LAMP(), [ 0.16, 0.1, 0.04 ], [ x, 1.1, z1 + 0.02 ] );
	flaps( group, z1 - 0.15 );
	return group;

}

// --- the items -------------------------------------------------------------------------------

const tandem = () => dumpTruck( 2 );
const tridem = () => dumpTruck( 3 );

export const TRUCK_ITEMS = [
	{ id: 'dump-truck-tridem', name: 'Dump truck, tridem (3 drive axles, ~15 m³)', category: 'Vehicles', build: () => centred( tridem().group ) },
	{ id: 'truck-and-pup', name: 'Truck and pup (tandem dump truck, tandem pup)', category: 'Vehicles', build: () => hitched( tandem(), pup( 2 ) ) },
	{ id: 'truck-and-transfer', name: 'Truck and transfer (tridem dump truck, transfer trailer)', category: 'Vehicles', build: () => hitched( tridem(), transfer() ) },
	{ id: 'tri-tri', name: 'Tri-tri (tridem dump truck, tridem pup)', category: 'Vehicles', build: () => hitched( tridem(), pup( 3 ) ) },
	{ id: 'pup-trailer-tandem', name: 'Pup trailer, tandem (6.4 m box)', category: 'Vehicles', build: () => centred( pup( 2 ) ) },
	{ id: 'pup-trailer-tridem', name: 'Pup trailer, tridem (7.6 m box)', category: 'Vehicles', build: () => centred( pup( 3 ) ) },
	{ id: 'transfer-trailer', name: 'Transfer trailer (box on rails, tri-axle)', category: 'Vehicles', build: () => centred( transfer() ) },
	{ id: 'end-dump-trailer', name: 'End dump trailer, half-round (38 ft, tri-axle)', category: 'Vehicles', build: () => centred( endDump() ) },
	{ id: 'belly-dump-trailer', name: 'Belly dump trailer (40 ft, tandem)', category: 'Vehicles', build: () => centred( bellyDump() ) },
	{ id: 'lowboy-trailer', name: 'Lowboy trailer, gooseneck (53 ft, tri-axle)', category: 'Vehicles', build: () => centred( lowboy() ) },
];
