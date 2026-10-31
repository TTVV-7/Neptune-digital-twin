import { Group, MathUtils } from 'three';
import { arch, BLACK, block, DARK, driver, GLASS, HEADLIGHT, mat, merge, paint, profile, rod, steeringWheel, TAILLIGHT, tube, wheel } from './parts.js';

// A low two-seat sports coupe, drawn for World Drive (no real maker's car): a long bonnet, a
// fastback roof, a ducktail with a wing on it, wide wheels filling their arches and a driver in a
// helmet behind tinted glass. 4.4 m long and 1.9 m wide, 1.3 m tall, on y = 0, facing -Z. Its front
// wheels steer and all four spin (onDrive).

const FRONT_AXLE = - 1.36;
const REAR_AXLE = 1.3;
const FRONT_TYRE = { radius: 0.335, width: 0.25, rim: 0.7, spokes: 5, x: 0.8 };
const REAR_TYRE = { radius: 0.34, width: 0.29, rim: 0.7, spokes: 5, x: 0.81 };
const STEER_LOCK = 0.5;
// The driver sits on the left (-x), well back and low, hips SEAT.y up, and a little smaller than the
// kart's (DRIVER), so the helmet clears the roof.
const SEAT = { x: - 0.36, y: 0.34, z: 0.28 };
const DRIVER = 0.92;
const BODY_COLOUR = 0x2d6bff;

// Tuning (see drive.js specFor and HANDLING): far quicker than the kart, gripping hard, turning in
// sharply and drifting long and wide.
export const COUPE_DRIVE = {
	topSpeed: 195, accel: 12, brake: 20, reverse: 30,
	cab: { ahead: - SEAT.z + 0.08, right: SEAT.x, up: 1.08 },
	handling: { grip: 18, slip: 2.6, driftYaw: [ 48, 128 ], turn: [ 170, 72 ], lock: 38, drag: 0.8 },
};

export function makeCoupe() {

	const car = new Group();
	car.name = 'Sports coupe';
	const shell = new Group();
	car.add( shell );
	bodywork( shell );
	cabin( shell );
	details( shell );
	driver( shell, { at: [ SEAT.x, SEAT.y, SEAT.z ], hands: [ SEAT.x + 0.17, 0.8, - 0.22 ], feet: - 1.05, suit: 0x1b1d22, helmet: 0xf4f6f8, lean: 0.4, size: DRIVER } );
	steeringWheel( shell, [ SEAT.x, 0.8, - 0.25 ], 0.17, 1.15 );
	merge( shell );

	const spinners = [];
	const knuckles = [];
	for ( const side of [ - 1, 1 ] ) {

		const knuckle = new Group();
		knuckle.position.set( side * FRONT_TYRE.x, FRONT_TYRE.radius, FRONT_AXLE );
		car.add( knuckle );
		knuckles.push( knuckle );
		spinners.push( wheel( knuckle, FRONT_TYRE, side ) );
		brake( knuckle, FRONT_TYRE, side );

		const rear = new Group();
		rear.position.set( side * REAR_TYRE.x, REAR_TYRE.radius, REAR_AXLE );
		car.add( rear );
		spinners.push( wheel( rear, REAR_TYRE, side ) );
		brake( rear, REAR_TYRE, side );

	}

	car.userData.decals = DECALS;
	car.userData.decalParent = shell;
	let roll = 0;
	car.userData.onDrive = ( { steer, speed, dt } ) => {

		for ( const knuckle of knuckles ) knuckle.rotation.y = - steer * STEER_LOCK;
		roll = ( roll + speed * dt / FRONT_TYRE.radius ) % ( Math.PI * 2 );
		for ( const spinner of spinners ) spinner.rotation.x = - roll;

	};

	return car;

}

// Where the Garage's decals go (see paint.js): over the top from the nose to the tail, along the
// doors, and on the bonnet.
const DECALS = {
	top: { at: [ 0, 0.95, 0 ], size: [ 0.62, 4.6, 1 ] },
	side: { at: [ 0.95, 0.52, - 0.1 ], size: [ 2.2, 0.4, 0.5 ] },
	bonnet: { at: [ 0, 0.8, - 1.3 ], size: 0.55 },
};

// The bodywork as one piece seen from the side: low nose, long bonnet to the windscreen, the deck
// behind the cabin up to a ducktail, and two arches. Narrowed toward the nose and tail, and tucked in
// along the top.
function bodywork( parent ) {

	const points = [
		[ - 2.12, 0.22 ], [ - 2.17, 0.38 ], [ - 2.1, 0.54 ], [ - 1.85, 0.65 ], [ - 1.3, 0.75 ], [ - 0.72, 0.83 ],
		[ 0.9, 0.91 ], [ 1.8, 0.94 ], [ 2.12, 0.96 ], [ 2.17, 0.8 ], [ 2.15, 0.45 ], [ 2.07, 0.22 ],
		...arch( REAR_AXLE, REAR_TYRE.radius, 0.405, 0.2 ),
		[ 0.8, 0.19 ], [ - 0.92, 0.19 ],
		...arch( FRONT_AXLE, FRONT_TYRE.radius, 0.4, 0.21 ),
		[ - 1.85, 0.22 ],
	];
	const warp = v => {

		// Narrower at the nose and a little at the tail, and tucked in above the shoulder.
		const nose = MathUtils.smoothstep( v.z, - 1.5, - 2.2 );
		const tail = MathUtils.smoothstep( v.z, 1.5, 2.25 );
		const tuck = MathUtils.clamp( ( v.y - 0.7 ) * 0.5, 0, 0.12 );
		// Haunches swelling out over the rear wheels.
		const haunch = Math.exp( - ( ( ( v.z - REAR_AXLE ) / 0.55 ) ** 2 ) ) * MathUtils.smoothstep( v.y, 0.25, 0.5 ) * ( 1 - MathUtils.smoothstep( v.y, 0.75, 0.95 ) );
		v.x *= 1 - nose * 0.13 - tail * 0.09 - tuck + haunch * 0.05;
		// The bonnet's middle stands a little proud of its sides.
		if ( v.y > 0.6 && v.z < - 0.7 ) v.y -= Math.abs( v.x ) * 0.06;

	};
	paint( profile( parent, bodyPaint(), points, - 0.92, 0.92, { bevel: 0.05, segments: 2, warp } ) );

}

function bodyPaint() {

	return mat( BODY_COLOUR, { roughness: 0.3, metalness: 0.2 } );

}

// The glasshouse: windscreen, side windows and a fastback rear window as one tinted piece, under
// a painted roof and pillars.
function cabin( parent ) {

	const warp = v => {

		v.x *= 1 - MathUtils.clamp( ( v.y - 0.85 ) * 0.55, 0, 0.3 );

	};
	profile( parent, GLASS(), [ [ - 0.8, 0.82 ], [ - 0.06, 1.24 ], [ 0.55, 1.26 ], [ 1.32, 0.95 ], [ 1.2, 0.86 ], [ - 0.8, 0.8 ] ], - 0.74, 0.74, { bevel: 0.03, warp } );
	// The roof, a little over the glass and wider than its top, so it reads as a roof rather than a
	// plank laid on a bubble.
	paint( profile( parent, bodyPaint(), [ [ - 0.14, 1.215 ], [ - 0.06, 1.272 ], [ 0.56, 1.29 ], [ 0.9, 1.15 ], [ 0.8, 1.13 ], [ 0.52, 1.245 ], [ - 0.04, 1.228 ] ], - 0.77, 0.77, { bevel: 0.025, warp } ) );
	// Pillars up the windscreen's sides and behind the doors, leaning in with the glass.
	for ( const side of [ - 1, 1 ] ) {

		paint( tube( parent, [ side * 0.72, 0.83, - 0.79 ], [ side * 0.6, 1.24, - 0.08 ], 0.03, bodyPaint() ) );
		paint( tube( parent, [ side * 0.74, 0.88, 0.62 ], [ side * 0.62, 1.24, 0.5 ], 0.035, bodyPaint() ) );

	}

}

function details( parent ) {

	const carbon = mat( 0x1c1e22, { roughness: 0.35, metalness: 0.5 } );
	// Lights: slim headlights swept back along the nose, a tail light right across the back.
	for ( const side of [ - 1, 1 ] ) {

		block( parent, HEADLIGHT(), [ 0.36, 0.04, 0.26 ], [ side * 0.56, 0.6, - 1.97 ], [ - 0.42, side * 0.3, 0 ] );
		block( parent, TAILLIGHT(), [ 0.46, 0.07, 0.04 ], [ side * 0.5, 0.86, 2.2 ], [ - 0.3, 0, 0 ] );
		// Side mirrors on short stalks.
		block( parent, DARK(), [ 0.1, 0.03, 0.04 ], [ side * 0.9, 0.9, - 0.62 ] );
		paint( block( parent, bodyPaint(), [ 0.1, 0.08, 0.14 ], [ side * 0.97, 0.92, - 0.6 ] ) );
		// Side skirts and an air intake ahead of each rear wheel.
		block( parent, carbon, [ 0.05, 0.08, 1.75 ], [ side * 0.9, 0.23, - 0.05 ] );
		block( parent, BLACK(), [ 0.02, 0.1, 0.3 ], [ side * 0.87, 0.47, 0.64 ], [ 0.35, 0, 0 ] );
		// Exhausts out of the diffuser.
		rod( parent, mat( 0x9aa1a8, { roughness: 0.25, metalness: 0.9 } ), 0.05, 0.14, 'z', [ side * 0.36, 0.3, 2.14 ], 12 );

	}

	block( parent, TAILLIGHT(), [ 0.56, 0.035, 0.04 ], [ 0, 0.865, 2.205 ] );
	// The nose's intake and a splitter under it; a diffuser under the tail.
	block( parent, BLACK(), [ 1.2, 0.17, 0.05 ], [ 0, 0.34, - 2.13 ], [ 0.2, 0, 0 ] );
	block( parent, carbon, [ 1.62, 0.025, 0.24 ], [ 0, 0.17, - 2.02 ] );
	block( parent, carbon, [ 1.3, 0.1, 0.16 ], [ 0, 0.22, 2.1 ] );
	// A wing on two stays over the ducktail.
	block( parent, carbon, [ 1.56, 0.03, 0.27 ], [ 0, 1.14, 1.96 ], [ - 0.08, 0, 0 ] );
	for ( const side of [ - 1, 1 ] ) {

		block( parent, carbon, [ 0.03, 0.2, 0.1 ], [ side * 0.5, 1.03, 1.95 ] );
		block( parent, carbon, [ 0.02, 0.11, 0.3 ], [ side * 0.78, 1.15, 1.96 ] );

	}

	// Two seats, low, and a dashboard.
	for ( const x of [ SEAT.x, - SEAT.x ] ) {

		block( parent, BLACK(), [ 0.48, 0.12, 0.52 ], [ x, SEAT.y - 0.06, SEAT.z - 0.05 ] );
		block( parent, BLACK(), [ 0.48, 0.62, 0.12 ], [ x, SEAT.y + 0.26, SEAT.z + 0.22 ], [ - 0.25, 0, 0 ] );

	}

	block( parent, BLACK(), [ 1.3, 0.12, 0.36 ], [ 0, 0.8, - 0.56 ] );

}

// A brake disc and calliper inside the rim, which stays put as the wheel turns.
function brake( parent, tyre, side ) {

	rod( parent, mat( 0x6f757c, { roughness: 0.4, metalness: 0.8 } ), tyre.radius * tyre.rim * 0.82, 0.03, 'x', [ - side * tyre.width * 0.1, 0, 0 ], 16 );
	block( parent, mat( 0xe02b2b, { roughness: 0.4 } ), [ 0.06, 0.1, 0.16 ], [ - side * tyre.width * 0.08, tyre.radius * 0.36, - 0.04 ] );

}
