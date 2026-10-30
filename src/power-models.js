import { BoxGeometry, Group, Mesh, TorusGeometry } from 'three';
import { across, beam, BLACK, box, cylinder, DARK, louvres, mat, merged, paint, RED_LAMP, rod, roundedTop, section, STEEL, wheel } from './plant-parts.js';

// Site power and air built in code: towable generators and compressors, a containerised genset
// and a double-walled fuel tank, at the sizes of common rental units (no brand). Each stands on
// y = 0 with its front facing -Z: the drawbar on the towed ones, the doors and control end on the
// others. Sizes are overall, drawbar included, from typical makers' sheets for each class.

const GENERATOR = 0xdad6cb;
const COMPRESSOR = 0xe9ad1a;
const TRIM = 0x2d3034;

export const POWER_ITEMS = [
	{ id: 'generator-20kva', name: 'Generator, towable (20 kVA)', category: 'Power & air', build: () => towedUnit( {
		type: 'generator', length: 3.0, width: 1.45, canopy: [ 1.9, 0.95, 1.0 ], base: 0.56, wheel: 0.3, axles: 1, color: GENERATOR,
	} ) },
	{ id: 'generator-60kva', name: 'Generator, towable (60 kVA)', category: 'Power & air', build: () => towedUnit( {
		type: 'generator', length: 3.85, width: 1.7, canopy: [ 2.5, 1.12, 1.3 ], base: 0.58, wheel: 0.33, axles: 1, color: GENERATOR,
	} ) },
	{ id: 'generator-150kva', name: 'Generator, towable (150 kVA)', category: 'Power & air', build: () => towedUnit( {
		type: 'generator', length: 5.0, width: 2.05, canopy: [ 3.5, 1.42, 1.55 ], base: 0.64, wheel: 0.36, axles: 2, color: GENERATOR,
	} ) },
	{ id: 'genset-500kva-container', name: 'Generator, containerised (500 kVA, 20 ft)', category: 'Power & air', build: containerGenset },
	{ id: 'fuel-tank-4000l', name: 'Fuel tank, double-walled (4,000 L)', category: 'Power & air', build: fuelTank },
	{ id: 'compressor-185cfm', name: 'Air compressor, towable (185 CFM)', category: 'Power & air', build: () => towedUnit( {
		type: 'compressor', length: 3.45, width: 1.55, canopy: [ 1.9, 1.12, 1.02 ], base: 0.44, wheel: 0.33, axles: 1, color: COMPRESSOR,
	} ) },
	{ id: 'compressor-375cfm', name: 'Air compressor, towable (375 CFM)', category: 'Power & air', build: () => towedUnit( {
		type: 'compressor', length: 4.2, width: 1.8, canopy: [ 2.45, 1.34, 1.24 ], base: 0.52, wheel: 0.36, axles: 1, color: COMPRESSOR,
	} ) },
	{ id: 'compressor-900cfm', name: 'Air compressor, towable (900 CFM)', category: 'Power & air', build: () => towedUnit( {
		type: 'compressor', length: 5.6, width: 2.1, canopy: [ 3.6, 1.68, 1.7 ], base: 0.62, wheel: 0.38, axles: 2, color: COMPRESSOR,
	} ) },
];

// --- towed generators and compressors --------------------------------------------------------

// A canopied unit on a road trailer: the canopy over the rear, an A-frame drawbar to the eye at
// the front with a jack stand, one axle or two under the canopy with mudguards over the wheels.
// canopy: [ length, width, height ] standing on `base`. A compressor's canopy has a rounded roof
// and service valves at the back; a generator's is square with an exhaust stack and an outlet
// panel of camlock sockets.
function towedUnit( { type, length, width, canopy: [ cl, cw, ch ], base, wheel: r, axles, color } ) {

	const group = new Group();
	const body = paint( color );
	const trim = paint( TRIM );
	const rear = length / 2;
	const front = rear - cl;
	const mid = ( front + rear ) / 2;

	// Chassis rails and the skid the canopy sits on (its fuel tank on a generator).
	for ( const x of [ - cw / 2 + 0.12, cw / 2 - 0.12 ] ) box( group, DARK(), [ 0.1, 0.16, cl + 0.3 ], [ x, base - 0.2, mid - 0.15 ] );
	box( group, trim, [ cw + 0.04, 0.14, cl + 0.04 ], [ 0, base - 0.06, mid ] );

	// Canopy.
	if ( type === 'compressor' ) section( group, body, roundedTop( cw, ch, ch * 0.3, base + 0.08 ), cl, front );
	else {

		box( group, body, [ cw, ch, cl ], [ 0, base + 0.08, mid ] );
		box( group, trim, [ cw + 0.05, 0.05, cl + 0.05 ], [ 0, base + 0.08 + ch, mid ] );

	}

	const top = base + 0.08 + ch;
	// Door outlines on both sides: two doors, or three on the big ones.
	const doors = cl > 3 ? 3 : 2;
	const seams = [];
	for ( const side of [ - 1, 1 ] ) {

		const x = side * ( cw / 2 + 0.006 );
		for ( let i = 0; i <= doors; i ++ ) seams.push( geometryAt( [ 0.012, ch * 0.72, 0.025 ], [ x, base + 0.08 + ch * 0.1, front + 0.1 + i * ( cl - 0.2 ) / doors ] ) );
		for ( const y of [ base + 0.08 + ch * 0.1, base + 0.08 + ch * 0.82 ] ) seams.push( geometryAt( [ 0.012, 0.025, cl - 0.2 ], [ x, y, mid ] ) );
		for ( let i = 0; i < doors; i ++ ) seams.push( geometryAt( [ 0.03, 0.04, 0.16 ], [ side * ( cw / 2 + 0.015 ), base + 0.08 + ch * 0.45, front + 0.1 + ( i + 0.8 ) * ( cl - 0.2 ) / doors ] ) );

	}

	merged( group, DARK(), seams );

	// Air in through the sides near the front, out through the back.
	for ( const side of [ - 1, 1 ] ) louvres( group, DARK(), 'x', [ Math.min( 0.6, cl * 0.22 ), ch * 0.4 ], [ side * ( cw / 2 + 0.014 ), base + 0.08 + ch * 0.55, front + 0.25 + Math.min( 0.6, cl * 0.22 ) / 2 ] );
	louvres( group, DARK(), 'z', [ cw * 0.62, ch * 0.42 ], [ 0, base + 0.08 + ch * 0.62, rear + 0.014 ] );

	// Lifting bail on the roof over the balance point.
	const bail = new Mesh( new TorusGeometry( 0.12, 0.025, 6, 12, Math.PI ), STEEL() );
	bail.position.set( 0, top + ( type === 'compressor' ? 0 : 0.05 ), mid - 0.1 );
	group.add( bail );

	if ( type === 'generator' ) {

		// Exhaust stack with a rain cap, at the back on the right; control panel door at the back;
		// outlet panel with a row of camlocks (green, white, black, red, blue) on the right side.
		cylinder( group, DARK(), 0.05, 0.22, [ cw * 0.3, top, rear - 0.35 ], 10 );
		box( group, DARK(), [ 0.13, 0.015, 0.13 ], [ cw * 0.3, top + 0.24, rear - 0.35 ] ).rotation.x = - 0.4;
		box( group, trim, [ cw * 0.5, ch * 0.28, 0.02 ], [ 0, base + 0.08 + ch * 0.08, rear + 0.01 ] );
		box( group, trim, [ 0.02, 0.28, 0.5 ], [ cw / 2 + 0.01, base + 0.14, front + 0.4 ] );
		[ 0x2f8f3a, 0xf2f2f2, 0x1d1f21, 0xc4202a, 0x2554b8 ].forEach( ( c, i ) => across( group, mat( c, { roughness: 0.5 } ), 0.025, 0.05, [ cw / 2 + 0.035, base + 0.28, front + 0.22 + i * 0.09 ], 8 ) );

	} else {

		// Exhaust out through the roof at the back; gauge window and service valves at the back.
		cylinder( group, DARK(), 0.055, 0.1, [ - cw * 0.25, top - 0.02, rear - 0.3 ], 10 );
		box( group, BLACK(), [ cw * 0.3, ch * 0.18, 0.02 ], [ cw * 0.12, base + 0.08 + ch * 0.12, rear + 0.01 ] );
		for ( const x of [ - cw * 0.3, - cw * 0.18 ] ) {

			across( group, STEEL(), 0.04, 0.09, [ x, base + 0.22, rear + 0.06 ], 8 ).rotation.set( Math.PI / 2, 0, 0 );
			box( group, mat( 0xc4202a, { roughness: 0.5 } ), [ 0.025, 0.12, 0.025 ], [ x, base + 0.22, rear + 0.12 ] );

		}

	}

	// Axles and wheels with mudguards.
	const wheelWidth = 0.16 + r * 0.12;
	const track = width - wheelWidth;
	const axleZ = axles === 2 ? [ mid - r - 0.06, mid + r + 0.06 ] : [ mid + 0.1 ];
	for ( const z of axleZ ) {

		across( group, DARK(), 0.04, track, [ 0, r, z ], 8 );
		for ( const x of [ - track / 2, track / 2 ] ) wheel( group, r, wheelWidth, [ x, r, z ] );

	}

	const guard = ( axleZ.at( - 1 ) - axleZ[ 0 ] ) + 2 * r + 0.2;
	const guardY = Math.max( 2 * r + 0.06, base - 0.06 );
	for ( const side of [ - 1, 1 ] ) {

		const x = side * track / 2;
		box( group, trim, [ wheelWidth + 0.08, 0.03, guard ], [ x, guardY, ( axleZ[ 0 ] + axleZ.at( - 1 ) ) / 2 ] );
		if ( Math.abs( x ) + wheelWidth / 2 > cw / 2 ) box( group, trim, [ 0.03, 0.18, guard ], [ side * ( track / 2 + wheelWidth / 2 + 0.03 ), guardY - 0.15, ( axleZ[ 0 ] + axleZ.at( - 1 ) ) / 2 ] );

	}

	// Drawbar: an A-frame from the canopy's front corners to a tube that ends in the towing eye.
	const hitch = 0.5;
	const tip = - length / 2;
	const neck = tip + Math.min( 0.9, ( front - tip ) * 0.45 );
	for ( const x of [ - cw / 2 + 0.12, cw / 2 - 0.12 ] ) beam( group, DARK(), [ 0.08, 0.1 ], [ x, base - 0.12, front + 0.15 ], [ 0, hitch, neck ] );
	beam( group, DARK(), [ 0.09, 0.1 ], [ 0, hitch, neck ], [ 0, hitch, tip + 0.14 ] );
	const eye = new Mesh( new TorusGeometry( 0.07, 0.022, 6, 14 ), STEEL() );
	eye.rotation.x = Math.PI / 2;
	eye.position.set( 0, hitch, tip + 0.08 );
	group.add( eye );

	// Jack stand, wound down, with its foot plate and crank.
	const jackZ = neck + 0.05;
	cylinder( group, STEEL(), 0.035, hitch + 0.22, [ 0.09, 0.05, jackZ ], 10 );
	box( group, DARK(), [ 0.16, 0.03, 0.16 ], [ 0.09, 0, jackZ ] );
	rod( group, STEEL(), 0.012, [ 0.09, hitch + 0.27, jackZ ], [ 0.24, hitch + 0.27, jackZ ] );

	// Tail lights.
	for ( const x of [ - cw / 2 + 0.1, cw / 2 - 0.1 ] ) box( group, RED_LAMP(), [ 0.12, 0.06, 0.03 ], [ x, base - 0.12, rear + 0.03 ] );
	return group;

}

function geometryAt( [ sx, sy, sz ], [ x, y0, z ] ) {

	return new BoxGeometry( sx, sy, sz ).translate( x, y0 + sy / 2, z );

}

// --- containerised genset --------------------------------------------------------------------

// A 500 kVA genset in a 20 ft high-cube container: corrugated walls, the radiator's louvred end
// at the back, the control and cable doors at the front, a personnel door on each side and the
// exhaust silencer on the roof.
function containerGenset() {

	const group = new Group();
	const length = 6.058;
	const width = 2.438;
	const height = 2.896;
	const body = paint( 0x3c5a48 );
	const frame = paint( 0x2c4337 );
	const door = paint( 0x34503f );

	box( group, body, [ width - 0.06, height - 0.04, length - 0.04 ], [ 0, 0.02, 0 ] );
	// Corrugation on the long sides.
	const ribs = [];
	for ( let z = - length / 2 + 0.35; z < length / 2 - 0.3; z += 0.28 ) {

		for ( const side of [ - 1, 1 ] ) ribs.push( geometryAt( [ 0.04, height - 0.36, 0.1 ], [ side * ( width / 2 - 0.03 ), 0.18, z ] ) );

	}

	merged( group, body, ribs );

	// Corner posts, rails and corner castings.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		box( group, frame, [ 0.16, height, 0.16 ], [ sx * ( width / 2 - 0.08 ), 0, sz * ( length / 2 - 0.08 ) ] );
		for ( const y of [ 0, height - 0.12 ] ) box( group, DARK(), [ 0.18, 0.12, 0.18 ], [ sx * ( width / 2 - 0.08 ), y, sz * ( length / 2 - 0.08 ) ] );

	}

	for ( const y of [ 0, height - 0.15 ] ) for ( const side of [ - 1, 1 ] ) box( group, frame, [ 0.1, 0.15, length ], [ side * ( width / 2 - 0.05 ), y, 0 ] );

	// Radiator end: a big louvre panel. Air comes in through louvres low on both sides.
	louvres( group, DARK(), 'z', [ width - 0.5, height - 0.7 ], [ 0, height / 2, length / 2 + 0.01 ], 0.09 );
	for ( const side of [ - 1, 1 ] ) louvres( group, DARK(), 'x', [ 1.2, 0.7 ], [ side * ( width / 2 + 0.03 ), 0.7, - 1.2 ], 0.09 );

	// Front: control door and cable door, with locking bars.
	const front = - length / 2 - 0.01;
	box( group, door, [ 1.2, 2.2, 0.03 ], [ - 0.5, 0.25, front ] );
	box( group, door, [ 0.7, 1.0, 0.03 ], [ 0.65, 0.3, front ] );
	box( group, paint( 0xf2b200 ), [ 0.5, 0.18, 0.02 ], [ 0.65, 1.42, front - 0.02 ] );
	for ( const x of [ - 0.8, - 0.2 ] ) cylinder( group, STEEL(), 0.02, 2.1, [ x, 0.3, front - 0.04 ], 8 );

	// A personnel door on each side, and the fuel fill box on the left.
	for ( const side of [ - 1, 1 ] ) {

		box( group, door, [ 0.04, 2.05, 0.95 ], [ side * ( width / 2 + 0.02 ), 0.15, 0.9 ] );
		box( group, STEEL(), [ 0.04, 0.04, 0.16 ], [ side * ( width / 2 + 0.05 ), 1.1, 0.6 ] );

	}

	box( group, frame, [ 0.06, 0.4, 0.5 ], [ - width / 2 - 0.03, 0.9, 2.2 ] );

	// Exhaust silencer on saddles, with its outlet turned up.
	const silencerY = height + 0.15 + 0.28;
	for ( const z of [ - 0.6, 0.9 ] ) box( group, DARK(), [ 0.5, 0.18, 0.12 ], [ 0.35, height, z ] );
	across( group, mat( 0x9da1a4, { roughness: 0.4, metalness: 0.7 } ), 0.28, 2.3, [ 0.35, silencerY, 0.15 ], 18 ).rotation.set( Math.PI / 2, 0, 0 );
	cylinder( group, DARK(), 0.1, 0.35, [ 0.35, silencerY, - 1.05 ], 12 );
	// Fan outlet guard over the radiator end.
	box( group, DARK(), [ 1.6, 0.08, 1.4 ], [ 0, height, 2.1 ] );
	return group;

}

// --- fuel tank -------------------------------------------------------------------------------

// A double-walled (self-bunded) diesel tank, 4,000 L: the tank inside a steel frame with lifting
// lugs on its top corners, fork pockets in its skid, a lockable cabinet for the pump and hose at
// the front, and a fill point, vent and gauge on top.
function fuelTank() {

	const group = new Group();
	const length = 2.45;
	const width = 1.65;
	const height = 1.9;
	const tank = paint( 0xc9cdd0 );
	const frame = paint( 0x5a6066 );
	const yellow = paint( 0xf2b200 );

	box( group, frame, [ width, 0.16, length ], [ 0, 0, 0 ] );
	for ( const side of [ - 1, 1 ] ) for ( const z of [ - 0.5, 0.5 ] ) box( group, BLACK(), [ 0.02, 0.1, 0.24 ], [ side * ( width / 2 + 0.005 ), 0.03, z ] );
	box( group, tank, [ width - 0.1, height - 0.26, length - 0.1 ], [ 0, 0.16, 0 ] );

	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		box( group, frame, [ 0.1, height, 0.1 ], [ sx * ( width / 2 - 0.05 ), 0, sz * ( length / 2 - 0.05 ) ] );
		const lug = box( group, yellow, [ 0.04, 0.14, 0.14 ], [ sx * ( width / 2 - 0.05 ), height, sz * ( length / 2 - 0.05 ) ] );
		lug.rotation.y = sx * sz * Math.PI / 4;

	}

	for ( const sz of [ - 1, 1 ] ) box( group, frame, [ width, 0.08, 0.08 ], [ 0, height - 0.08, sz * ( length / 2 - 0.04 ) ] );
	for ( const sx of [ - 1, 1 ] ) box( group, frame, [ 0.08, 0.08, length ], [ sx * ( width / 2 - 0.04 ), height - 0.08, 0 ] );

	// The pump cabinet's door, with hinges and a handle.
	const front = - length / 2 + 0.04;
	box( group, frame, [ width - 0.3, 1.05, 0.03 ], [ 0, 0.45, front - 0.015 ] );
	for ( const y of [ 0.6, 1.3 ] ) box( group, DARK(), [ 0.04, 0.12, 0.04 ], [ - width / 2 + 0.17, y, front - 0.04 ] );
	box( group, STEEL(), [ 0.16, 0.04, 0.04 ], [ width / 2 - 0.32, 0.95, front - 0.05 ] );

	// Fill point, vent with its cap, and contents gauge on top.
	const top = height - 0.1;
	cylinder( group, frame, 0.1, 0.12, [ 0.35, top, 0.5 ], 14 );
	cylinder( group, STEEL(), 0.03, 0.3, [ - 0.45, top, 0.7 ], 8 );
	cylinder( group, STEEL(), 0.07, 0.04, [ - 0.45, top + 0.3, 0.7 ], 10 );
	cylinder( group, DARK(), 0.08, 0.06, [ - 0.2, top, - 0.6 ], 14 );
	return group;

}
