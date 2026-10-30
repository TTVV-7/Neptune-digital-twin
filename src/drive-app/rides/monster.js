import { BoxGeometry, Group, LatheGeometry, MathUtils, Mesh, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { AMBER, arch, BLACK, block, CHROME, DARK, driver, GLASS, HEADLIGHT, mat, merge, paint, profile, RIM, rod, RUBBER, steeringWheel, TAILLIGHT, tube } from './parts.js';

// A monster truck, drawn for World Drive (no real team's truck): a pickup-style shell riding high
// over a tube chassis on four huge lugged tyres, with long shocks you can see, a blower through the
// bonnet, a roll bar and a light bar, and a driver in a helmet in the cab. 5.4 m long, 3.5 m wide
// over the tyres and 3.4 m tall, on y = 0, facing -Z. All four wheels steer (the back ones the other
// way) and spin, and the body rides on soft springs (onDrive): it sinks and rebounds as it lands,
// leans out of turns, and in the air the wheels hang down.

const AXLE = 1.6;
const TYRE = { radius: 0.86, tread: 0.8, width: 0.8, x: 1.36 };
const STEER_LOCK = 0.42;
const SEAT = { x: - 0.42, z: 0.05 };
const BODY_COLOUR = 0x7ed321;
// The springs: stiffness (1/s²) and damping (1/s); how far the wheels hang down in the air (m);
// how much of the speed it lands at goes into the springs; the most they move (m).
const SPRING = { stiffness: 55, damping: 6, droop: 0.28, land: 0.06, most: 0.38 };

// Tuning (see drive.js specFor and HANDLING): the stunt machine. Thrown higher by hits and ramps
// and slower to fall, quick to flip and forgiving to land, bouncing on its springs; its bumpers
// are over a car's roof, so it drives up over cars and barriers.
export const MONSTER_DRIVE = {
	topSpeed: 125, accel: 7.5, brake: 12, reverse: 25,
	cab: { ahead: - SEAT.z + 0.1, right: SEAT.x, up: 3.07 },
	handling: { grip: 9, slip: 1.8, driftYaw: [ 34, 95 ], turn: [ 125, 50 ], lock: 34, gravity: 0.75, launch: 1.3, air: 1.35, landTilt: 55, squash: 1.4, rebound: 0.22, bumpers: [ 1.5, 2.2 ], drag: 1.1 },
};

export function makeMonster() {

	const truck = new Group();
	truck.name = 'Monster truck';

	// What rides on the springs: the shell, the chassis and the driver.
	const sprung = new Group();
	sprung.name = 'springs';
	truck.add( sprung );
	const shell = new Group();
	sprung.add( shell );
	bodywork( shell );
	cab( shell );
	chassis( shell );
	driver( shell, { at: [ SEAT.x, 2.32, SEAT.z ], hands: [ SEAT.x + 0.18, 2.7, - 0.4 ], feet: - 0.85, suit: 0xd8262f, helmet: 0xffd21f, lean: 0.15 } );
	steeringWheel( shell, [ SEAT.x, 2.72, - 0.45 ], 0.19, 1.25 );
	merge( shell );

	// The axles, with their wheels, shocks and links, stay on the ground.
	const spinners = [];
	const knuckles = [];
	for ( const end of [ - 1, 1 ] ) {

		const axle = new Group();
		axle.position.z = end * AXLE;
		truck.add( axle );
		axleParts( axle );
		for ( const side of [ - 1, 1 ] ) {

			const knuckle = new Group();
			knuckle.position.set( side * TYRE.x, TYRE.radius, 0 );
			axle.add( knuckle );
			knuckles.push( { knuckle, end } );
			spinners.push( tyre( knuckle, side ) );

		}

	}

	truck.userData.decals = DECALS;
	truck.userData.decalParent = shell;
	let roll = 0;
	// The springs: `travel` is how far the body has sunk onto them (m, up is negative), and its speed.
	let travel = 0;
	let rate = 0;
	let wasAirborne = false;
	// How fast it was coming down: by the frame it lands the driver has already stopped it.
	let falling = 0;
	let lastSpeed = 0;
	let lean = 0;
	let nod = 0;
	truck.userData.onDrive = ( { steer, speed, dt, airborne = false, vy = 0 } ) => {

		for ( const { knuckle, end } of knuckles ) knuckle.rotation.y = - steer * STEER_LOCK * ( end < 0 ? 1 : - 0.6 );
		roll = ( roll + speed * dt / TYRE.radius ) % ( Math.PI * 2 );
		for ( const spinner of spinners ) spinner.rotation.x = - roll;
		if ( dt <= 0 ) return;

		// Coming down onto the springs sinks the body by how fast it lands; in the air the wheels hang.
		if ( wasAirborne && ! airborne ) rate += falling * SPRING.land * 10;
		falling = airborne ? Math.max( 0, - vy ) : 0;
		wasAirborne = airborne;
		const target = airborne ? - SPRING.droop : 0;
		for ( let left = dt; left > 1e-6; left -= 1 / 120 ) {

			const step = Math.min( left, 1 / 120 );
			rate += ( - SPRING.stiffness * ( travel - target ) - SPRING.damping * rate ) * step;
			travel = MathUtils.clamp( travel + rate * step, - SPRING.most, SPRING.most );

		}

		// Leaning out of a turn, and nodding as it speeds up or brakes.
		const accel = ( speed - lastSpeed ) / dt;
		lastSpeed = speed;
		lean += ( - steer * MathUtils.clamp( Math.abs( speed ) / 20, 0, 1 ) * 0.07 * ( airborne ? 0 : 1 ) - lean ) * Math.min( 1, dt * 4 );
		nod += ( MathUtils.clamp( accel * 0.006, - 0.05, 0.05 ) - nod ) * Math.min( 1, dt * 3 );
		sprung.position.y = - travel;
		sprung.rotation.z = lean;
		sprung.rotation.x = nod;

	};

	return truck;

}

// Where the Garage's decals go (see paint.js): over the bonnet and roof, down the doors and the
// bed's sides, and on the bonnet in front of the blower.
const DECALS = {
	top: { at: [ 0, 2.95, 0 ], size: [ 0.7, 5.4, 1.1 ] },
	side: { at: [ 1.2, 2.1, 0 ], size: [ 3.6, 0.6, 0.6 ] },
	bonnet: { at: [ 0, 2.66, - 2.08 ], size: 0.56 },
};

function bodyPaint() {

	return mat( BODY_COLOUR, { roughness: 0.3, metalness: 0.2 } );

}

// The shell seen from the side: a blunt nose, the bonnet up to the cab, the bed behind it, and
// arches cut high for the tyres to come up into.
function bodywork( parent ) {

	const points = [
		[ - 2.58, 1.62 ], [ - 2.64, 2.2 ], [ - 2.52, 2.5 ], [ - 1.15, 2.6 ],
		[ 0.72, 2.64 ], [ 2.42, 2.62 ], [ 2.55, 2.48 ], [ 2.55, 1.62 ],
		...arch( AXLE, TYRE.radius, 1.02, 1.55, 10 ),
		[ 0.45, 1.55 ], [ - 0.45, 1.55 ],
		...arch( - AXLE, TYRE.radius, 1.02, 1.55, 10 ),
		[ - 2.5, 1.6 ],
	];
	const warp = v => {

		const nose = MathUtils.smoothstep( v.z, - 1.9, - 2.7 );
		v.x *= 1 - nose * 0.08 - MathUtils.clamp( ( v.y - 2.3 ) * 0.2, 0, 0.06 );

	};
	paint( profile( parent, bodyPaint(), points, - 1.18, 1.18, { bevel: 0.07, segments: 2, warp, step: 0.45 } ) );
	// The bed's floor, sunk between its sides, with a tailgate stripe.
	block( parent, BLACK(), [ 1.95, 0.04, 1.62 ], [ 0, 2.7, 1.58 ] );
	for ( const side of [ - 1, 1 ] ) paint( block( parent, bodyPaint(), [ 0.16, 0.14, 1.75 ], [ side * 1.0, 2.73, 1.58 ] ) );
	// A blower and its scoop up through the bonnet.
	block( parent, CHROME(), [ 0.62, 0.22, 0.7 ], [ 0, 2.74, - 1.55 ] );
	block( parent, DARK(), [ 0.7, 0.3, 0.42 ], [ 0, 2.98, - 1.6 ] );
	block( parent, BLACK(), [ 0.6, 0.2, 0.05 ], [ 0, 3.0, - 1.82 ] );
	// Grille, headlights, a bumper bar; tail lights; black rockers between the wheels with a step.
	block( parent, BLACK(), [ 1.2, 0.42, 0.06 ], [ 0, 2.12, - 2.71 ] );
	for ( let i = 0; i < 4; i ++ ) block( parent, CHROME(), [ 1.16, 0.035, 0.03 ], [ 0, 1.96 + i * 0.1, - 2.74 ] );
	for ( const side of [ - 1, 1 ] ) {

		block( parent, HEADLIGHT(), [ 0.3, 0.22, 0.05 ], [ side * 0.82, 2.16, - 2.71 ] );
		block( parent, TAILLIGHT(), [ 0.14, 0.42, 0.05 ], [ side * 0.98, 2.15, 2.63 ] );
		block( parent, BLACK(), [ 0.06, 0.22, 1.05 ], [ side * 1.23, 1.68, 0 ] );
		tube( parent, [ side * 1.3, 1.5, - 0.5 ], [ side * 1.3, 1.5, 0.5 ], 0.045, CHROME(), 6 );

	}

	tube( parent, [ - 1.25, 1.62, - 2.72 ], [ 1.25, 1.62, - 2.72 ], 0.07, CHROME(), 8 );
	tube( parent, [ - 1.2, 1.62, 2.62 ], [ 1.2, 1.62, 2.62 ], 0.07, CHROME(), 8 );

}

// The cab: big tinted windows under a painted roof and pillars, a roll bar behind it and a light bar
// on top.
function cab( parent ) {

	const warp = v => {

		v.x *= 1 - MathUtils.clamp( ( v.y - 2.6 ) * 0.14, 0, 0.1 );

	};
	profile( parent, GLASS(), [ [ - 1.18, 2.58 ], [ - 0.58, 3.22 ], [ 0.52, 3.24 ], [ 0.7, 2.62 ] ], - 1.02, 1.02, { bevel: 0.03, warp } );
	paint( profile( parent, bodyPaint(), [ [ - 0.62, 3.2 ], [ 0.55, 3.22 ], [ 0.6, 3.29 ], [ - 0.58, 3.27 ] ], - 0.96, 0.96, { bevel: 0.03, warp } ) );
	for ( const side of [ - 1, 1 ] ) {

		paint( tube( parent, [ side * 1.02, 2.6, - 1.17 ], [ side * 0.95, 3.22, - 0.6 ], 0.045, bodyPaint() ) );
		paint( tube( parent, [ side * 1.02, 2.62, 0.68 ], [ side * 0.95, 3.22, 0.52 ], 0.06, bodyPaint() ) );
		paint( tube( parent, [ side * 1.02, 2.6, - 0.1 ], [ side * 0.96, 3.22, - 0.1 ], 0.035, bodyPaint() ) );
		// Mirrors.
		block( parent, BLACK(), [ 0.08, 0.22, 0.16 ], [ side * 1.3, 2.86, - 0.95 ] );
		tube( parent, [ side * 1.05, 2.75, - 0.95 ], [ side * 1.28, 2.82, - 0.95 ], 0.02, BLACK() );

	}

	// A roll bar over the bed, just behind the cab.
	const bar = [ [ - 0.95, 2.66, 0.95 ], [ - 0.9, 3.3, 0.95 ], [ - 0.6, 3.48, 0.95 ], [ 0.6, 3.48, 0.95 ], [ 0.9, 3.3, 0.95 ], [ 0.95, 2.66, 0.95 ] ];
	tube( parent, ...bar.slice( 0, 2 ), 0.06, CHROME(), 8 );
	tube( parent, bar[ 1 ], bar[ 2 ], 0.06, CHROME(), 8 );
	tube( parent, bar[ 2 ], bar[ 3 ], 0.06, CHROME(), 8 );
	tube( parent, bar[ 3 ], bar[ 4 ], 0.06, CHROME(), 8 );
	tube( parent, ...bar.slice( 4 ), 0.06, CHROME(), 8 );
	for ( const side of [ - 1, 1 ] ) tube( parent, [ side * 0.75, 3.42, 0.95 ], [ side * 0.85, 2.7, 2.1 ], 0.05, CHROME(), 8 );
	// The light bar on the roof: lamps in a row, ambers at the ends.
	block( parent, BLACK(), [ 1.5, 0.1, 0.16 ], [ 0, 3.36, - 0.2 ] );
	for ( let i = 0; i < 6; i ++ ) block( parent, i === 0 || i === 5 ? AMBER() : HEADLIGHT(), [ 0.18, 0.08, 0.03 ], [ - 0.6 + i * 0.24, 3.36, - 0.29 ] );

	// Seats inside.
	for ( const x of [ SEAT.x, - SEAT.x ] ) {

		block( parent, BLACK(), [ 0.5, 0.12, 0.5 ], [ x, 2.27, SEAT.z - 0.05 ] );
		block( parent, BLACK(), [ 0.5, 0.75, 0.12 ], [ x, 2.66, SEAT.z + 0.28 ], [ - 0.12, 0, 0 ] );

	}

	block( parent, BLACK(), [ 1.9, 0.18, 0.4 ], [ 0, 2.62, - 0.9 ] );

}

// Under the shell: two frame rails with cross tubes, a cage in the arches, and the engine's sump.
function chassis( parent ) {

	const steel = mat( 0x30343a, { roughness: 0.5, metalness: 0.6 } );
	for ( const side of [ - 1, 1 ] ) {

		tube( parent, [ side * 0.55, 1.35, - 2.5 ], [ side * 0.55, 1.35, 2.45 ], 0.07, steel, 6 );
		tube( parent, [ side * 0.55, 1.35, - 2.2 ], [ side * 0.9, 1.6, - 2.45 ], 0.05, steel, 6 );
		tube( parent, [ side * 0.55, 1.35, 2.2 ], [ side * 0.9, 1.6, 2.4 ], 0.05, steel, 6 );

	}

	for ( const z of [ - 2.3, - 0.9, 0, 0.9, 2.3 ] ) tube( parent, [ - 0.55, 1.35, z ], [ 0.55, 1.35, z ], 0.05, steel, 6 );
	block( parent, DARK(), [ 0.7, 0.4, 1.0 ], [ 0, 1.42, - 1.1 ] );
	// The tops of the shocks, up into the body where they're bolted on.
	for ( const z of [ - AXLE, AXLE ] ) for ( const side of [ - 1, 1 ] ) for ( const along of [ - 0.28, 0.28 ] ) {

		rod( parent, CHROME(), 0.05, 0.5, 'y', [ side * 0.78, 1.55, z + along ], 8 );

	}

}

// A solid axle across the truck at its wheels: the tube, the differential, the links up to the
// frame and the shocks' bodies (whose shafts slide up into the tops on the chassis).
function axleParts( axle ) {

	const steel = mat( 0x3a3f46, { roughness: 0.45, metalness: 0.7 } );
	tube( axle, [ - TYRE.x + 0.3, TYRE.radius, 0 ], [ TYRE.x - 0.3, TYRE.radius, 0 ], 0.09, steel, 8 );
	const pumpkin = new Mesh( new SphereGeometry( 0.26, 10, 8 ), steel );
	pumpkin.position.set( 0.15, TYRE.radius, 0 );
	axle.add( pumpkin );
	tube( axle, [ 0.15, TYRE.radius, 0 ], [ 0.1, 1.3, - Math.sign( axle.position.z || 1 ) * 0.9 ], 0.06, steel, 6 );
	const spring = mat( 0xff5a1f, { roughness: 0.4, metalness: 0.3 } );
	for ( const side of [ - 1, 1 ] ) {

		tube( axle, [ side * 0.62, TYRE.radius - 0.05, 0 ], [ side * 0.55, 1.33, side * 0.6 ], 0.045, steel, 6 );
		for ( const along of [ - 0.28, 0.28 ] ) {

			rod( axle, spring, 0.1, 0.42, 'y', [ side * 0.78, TYRE.radius + 0.3, along ], 10 );
			rod( axle, CHROME(), 0.035, 0.5, 'y', [ side * 0.78, TYRE.radius + 0.65, along ], 6 );
			block( axle, steel, [ 0.12, 0.1, 0.12 ], [ side * 0.78, TYRE.radius + 0.06, along ] );

		}

	}

	merge( axle );

}

// A monster tyre on a beadlock rim: a fat lathe-turned carcass with chevron lugs round its tread,
// and a deep dish with six spokes, a bolted ring and a hub. Returns the part that spins.
function tyre( parent, side ) {

	const spinner = new Group();
	parent.add( spinner );
	const { radius, tread, width } = TYRE;
	const half = width / 2;
	const bead = radius * 0.5;
	const carcass = [ [ bead, - half * 0.92 ], [ tread * 0.84, - half ], [ tread * 0.96, - half * 0.9 ], [ tread, - half * 0.7 ], [ tread, half * 0.7 ], [ tread * 0.96, half * 0.9 ], [ tread * 0.84, half ], [ bead, half * 0.92 ] ]
		.map( ( [ r, x ] ) => new Vector2( r, x ) );
	spinner.add( new Mesh( new LatheGeometry( carcass, 18 ).rotateZ( Math.PI / 2 ), RUBBER() ) );
	// Lugs: two rows staggered round the tread, each leaning one way, so they make chevrons.
	const LUGS = 16;
	for ( let i = 0; i < LUGS; i ++ ) for ( const row of [ - 1, 1 ] ) {

		const angle = ( i + ( row > 0 ? 0.5 : 0 ) ) / LUGS * Math.PI * 2;
		const lug = new Mesh( new BoxGeometry( width * 0.46, radius - tread + 0.03, 0.15 ), RUBBER() );
		lug.position.set( row * width * 0.24, Math.cos( angle ) * ( tread + radius ) / 2, Math.sin( angle ) * ( tread + radius ) / 2 );
		lug.rotation.set( angle, row * 0.35, 0, 'XYZ' );
		spinner.add( lug );

	}

	// The rim, dished in from the outer face, its spokes and beadlock ring tagged for the Garage.
	const face = side * half * 0.55;
	spinner.add( paint( new Mesh( new LatheGeometry( [ [ bead * 0.98, - half * 0.9 ], [ bead, half * 0.9 ] ].map( ( [ r, x ] ) => new Vector2( r, x ) ), 14 ).rotateZ( Math.PI / 2 ), RIM() ), 'rim' ) );
	const ring = paint( new Mesh( new TorusGeometry( bead * 0.97, 0.035, 4, 16 ).rotateY( Math.PI / 2 ), RIM() ), 'rim' );
	ring.position.x = side * half * 0.88;
	spinner.add( ring );
	spinner.add( new Mesh( new LatheGeometry( [ [ 0.001, 0 ], [ bead * 0.95, 0 ] ].map( ( [ r, x ] ) => new Vector2( r, x ) ), 14 ).rotateZ( Math.PI / 2 ).translate( face - side * 0.06, 0, 0 ), DARK() ) );
	for ( let i = 0; i < 6; i ++ ) {

		const angle = i / 6 * Math.PI * 2;
		const spoke = paint( new Mesh( new BoxGeometry( 0.07, bead * 0.9, 0.11 ), RIM() ), 'rim' );
		spoke.position.set( face, Math.cos( angle ) * bead * 0.48, Math.sin( angle ) * bead * 0.48 );
		spoke.rotation.x = angle;
		spinner.add( spoke );

	}

	rod( spinner, CHROME(), 0.12, 0.16, 'x', [ face, 0, 0 ], 8 );
	merge( spinner );
	return spinner;

}
