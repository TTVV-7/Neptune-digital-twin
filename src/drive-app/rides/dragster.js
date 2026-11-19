import { AdditiveBlending, ConeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from 'three';
import { BLACK, block, CHROME, DARK, driver, GLASS, mat, merge, paint, profile, rod, tube, wheel } from './parts.js';

// A rocket dragster, drawn for World Drive (no real team's car): a needle of a body on spindly front
// wheels, huge slicks at the back, a cockpit with a roll cage and a bubble canopy just ahead of
// them, and a rocket over the rear axle with a wing on struts above it, a parachute pack and a
// wheelie bar behind. 6.8 m long, 2.2 m wide over the slicks and 1.9 m tall to the wing, on y = 0,
// facing -Z. As it goes (onDrive): the slicks spin, the front wheels steer, the rocket's flame
// roars out long and bright with the gas and drops to a flicker without it, the nozzle glows hot
// and cools, and the nose lifts as it launches.

const FRONT_AXLE = - 2.75;
const REAR_AXLE = 1.75;
const FRONT_TYRE = { radius: 0.27, width: 0.1, rim: 0.75, spokes: 10, grooves: 0, dish: 0.1, x: 0.5 };
const REAR_TYRE = { radius: 0.62, width: 0.55, rim: 0.55, spokes: 6, grooves: 0, dish: 0.35, x: 0.82 };
const STEER_LOCK = 0.32;
const SEAT = { y: 0.42, z: 0.55 };
const BODY_COLOUR = 0xd81e2c;
// The rocket: its nozzle's centre and size, and how long its flame gets (m) idling and floored.
const NOZZLE = { y: 0.92, z: 2.55, radius: 0.2 };
const FLAME = { idle: 0.35, full: 2.6 };

// Tuning (see drive.js specFor and HANDLING): the straight-line monster. Quickest off the line of
// all and as fast as the hypercar (the most the challenges' rules allow, challenge-rules.js's
// TOP_SPEED), but it turns like a train and doesn't drift so much as wander; it stops fast,
// as if its parachute were out.
export const DRAGSTER_DRIVE = {
	topSpeed: 215, accel: 17, brake: 22, reverse: 20,
	cab: { ahead: - SEAT.z + 0.15, right: 0, up: 1.08 },
	handling: { grip: 14, slip: 3, driftYaw: [ 25, 70 ], turn: [ 90, 32 ], lock: 26, drag: 0.6, launch: 0.9, air: 0.9 },
};

export function makeDragster() {

	const car = new Group();
	car.name = 'Rocket dragster';
	// What lifts at the nose as it launches: everything but the wheels.
	const body = new Group();
	body.position.set( 0, REAR_TYRE.radius, REAR_AXLE );
	car.add( body );
	const shell = new Group();
	shell.position.set( 0, - REAR_TYRE.radius, - REAR_AXLE );
	body.add( shell );
	bodywork( shell );
	cockpit( shell );
	rocket( shell );
	wing( shell );
	driver( shell, { at: [ 0, SEAT.y, SEAT.z ], hands: [ 0.15, 0.78, 0.0 ], feet: - 0.6, suit: 0xf4f6f8, helmet: 0x111317, visor: 0xff7a1a, lean: 0.55, size: 0.95 } );
	merge( shell );

	// The flame, three cones one inside another, drawn added to what's behind, with a few shock
	// diamonds down its middle; and the nozzle's hot glow. Their own materials, so each car's
	// flame burns on its own.
	const flame = new Group();
	flame.name = 'flame';
	flame.position.set( 0, NOZZLE.y, NOZZLE.z + 0.18 );
	shell.add( flame );
	const layers = [ [ 0x2a6bff, 1, 0.5 ], [ 0xff8a1a, 0.7, 0.75 ], [ 0xfff1c2, 0.38, 0.95 ] ].map( ( [ color, width, opacity ] ) => {

		const material = new MeshBasicMaterial( { color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false } );
		const cone = new Mesh( new ConeGeometry( NOZZLE.radius * 0.95 * width, 1, 16, 1, true ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.5 ), material );
		ignore( cone );
		flame.add( cone );
		return { cone, material, width };

	} );
	const diamonds = [ 0.25, 0.5, 0.75 ].map( along => {

		const diamond = new Mesh( new SphereGeometry( NOZZLE.radius * 0.45, 10, 6 ), new MeshBasicMaterial( { color: 0xfff6dc, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false } ) );
		diamond.scale.z = 1.8;
		ignore( diamond );
		flame.add( diamond );
		return { diamond, along };

	} );
	const hot = new MeshStandardMaterial( { color: 0x4a4f56, roughness: 0.4, metalness: 0.8, emissive: 0xff4a10, emissiveIntensity: 0.1 } );
	const lip = new Mesh( new ConeGeometry( NOZZLE.radius * 1.15, 0.3, 18, 1, true ).rotateX( - Math.PI / 2 ), hot );
	lip.position.set( 0, NOZZLE.y, NOZZLE.z + 0.02 );
	shell.add( lip );

	const spinners = [];
	const knuckles = [];
	for ( const side of [ - 1, 1 ] ) {

		const knuckle = new Group();
		knuckle.position.set( side * FRONT_TYRE.x, FRONT_TYRE.radius, FRONT_AXLE );
		car.add( knuckle );
		knuckles.push( knuckle );
		spinners.push( { spinner: wheel( knuckle, FRONT_TYRE, side ), radius: FRONT_TYRE.radius } );
		const rear = new Group();
		rear.position.set( side * REAR_TYRE.x, REAR_TYRE.radius, REAR_AXLE );
		car.add( rear );
		spinners.push( { spinner: wheel( rear, REAR_TYRE, side ), radius: REAR_TYRE.radius } );

	}

	car.userData.decals = DECALS;
	car.userData.decalParent = shell;
	let clock = 0;
	let burn = 0;
	let lift = 0;
	let lastSpeed = 0;
	const rolls = spinners.map( () => 0 );
	car.userData.onDrive = ( { steer, speed, dt, throttle = false } ) => {

		clock += dt;
		for ( const knuckle of knuckles ) knuckle.rotation.y = - steer * STEER_LOCK;
		spinners.forEach( ( { spinner, radius }, i ) => {

			rolls[ i ] = ( rolls[ i ] + speed * dt / radius ) % ( Math.PI * 2 );
			spinner.rotation.x = - rolls[ i ];

		} );
		// The burn comes up fast with the gas and dies back slower.
		const want = throttle ? 1 : 0;
		burn += ( want - burn ) * Math.min( 1, dt * ( throttle ? 8 : 2.5 ) );
		const flicker = 1 + Math.sin( clock * 47 ) * 0.08 + Math.sin( clock * 83 + 1 ) * 0.06 + ( Math.random() - 0.5 ) * 0.12;
		const length = MathUtils.lerp( FLAME.idle, FLAME.full, burn ) * flicker;
		layers.forEach( ( { cone, material, width }, i ) => {

			cone.scale.set( 1 + burn * 0.15, 1 + burn * 0.15, length * ( 1 - i * 0.22 ) );
			material.opacity = ( 0.35 + burn * 0.6 ) * ( i === 0 ? 0.55 : 1 ) * Math.min( 1, flicker );

		} );
		for ( const { diamond, along } of diamonds ) {

			diamond.position.z = length * along * 0.7;
			diamond.visible = burn > 0.35;
			diamond.material.opacity = ( burn - 0.35 ) * 1.2 * ( 1 - along * 0.6 );

		}

		hot.emissiveIntensity = 0.1 + burn * 1.6;
		// The nose lifts as it launches (the harder it speeds up, the more), then settles.
		const accel = dt > 0 ? ( speed - lastSpeed ) / dt : 0;
		lastSpeed = speed;
		lift += ( MathUtils.clamp( accel * 0.004, 0, 0.06 ) - lift ) * Math.min( 1, dt * 4 );
		body.rotation.x = lift;

	};

	return car;

}

function ignore( mesh ) {

	mesh.raycast = () => {};
	mesh.userData.noCollide = true;
	return mesh;

}

// Where the Garage's decals go (see paint.js): down the length of the nose, along its sides, and a
// number on the nose.
const DECALS = {
	top: { at: [ 0, 0.5, - 1.2 ], size: [ 0.5, 3.6, 0.6 ] },
	side: { at: [ 0.28, 0.4, - 0.8 ], size: [ 3, 0.2, 0.4 ] },
	bonnet: { at: [ 0, 0.48, - 2.0 ], size: 0.3 },
};

function bodyPaint() {

	return mat( BODY_COLOUR, { roughness: 0.25, metalness: 0.3 } );

}

// The body seen from the side: a needle nose rising to the cockpit and the engine bay behind it,
// narrowed to a point at the front.
function bodywork( parent ) {

	const points = [
		[ - 3.4, 0.22 ], [ - 3.35, 0.3 ], [ - 2.2, 0.42 ], [ - 0.6, 0.52 ], [ 0.05, 0.6 ],
		[ 0.05, 0.55 ], [ 1.1, 0.62 ], [ 1.9, 0.7 ], [ 2.5, 0.68 ], [ 2.55, 0.3 ], [ 1.2, 0.2 ], [ - 2.0, 0.18 ],
	];
	const warp = v => {

		const nose = MathUtils.smoothstep( v.z, - 0.4, - 3.4 );
		v.x *= 1 - nose * 0.7;

	};
	paint( profile( parent, bodyPaint(), points, - 0.32, 0.32, { bevel: 0.05, segments: 2, warp } ) );
	// Side pods either side of the cockpit, and the front wing at the nose.
	for ( const side of [ - 1, 1 ] ) paint( block( parent, bodyPaint(), [ 0.14, 0.2, 1.4 ], [ side * 0.38, 0.32, 0.9 ] ) );
	block( parent, BLACK(), [ 1.2, 0.03, 0.22 ], [ 0, 0.2, - 3.25 ] );
	for ( const side of [ - 1, 1 ] ) block( parent, BLACK(), [ 0.02, 0.12, 0.3 ], [ side * 0.6, 0.24, - 3.25 ] );
	// The front axle's beam and struts out to the little wheels.
	for ( const side of [ - 1, 1 ] ) tube( parent, [ side * 0.12, 0.3, FRONT_AXLE ], [ side * 0.42, FRONT_TYRE.radius, FRONT_AXLE ], 0.02, CHROME() );
	// The wheelie bar out the back on two little wheels, and the parachute pack.
	for ( const side of [ - 1, 1 ] ) {

		tube( parent, [ side * 0.25, 0.3, 2.4 ], [ side * 0.2, 0.12, 3.3 ], 0.025, CHROME() );
		rod( parent, DARK(), 0.07, 0.05, 'x', [ side * 0.2, 0.07, 3.32 ], 10 );

	}

	block( parent, mat( 0x15171b, { roughness: 0.8 } ), [ 0.36, 0.22, 0.3 ], [ 0, 0.42, 2.65 ] );
	block( parent, mat( 0xffc21a, { roughness: 0.6 } ), [ 0.37, 0.04, 0.31 ], [ 0, 0.42, 2.65 ] );

}

// The cockpit: a roll cage, the seat, a bubble canopy over it and the steering wheel.
function cockpit( parent ) {

	const cage = CHROME();
	for ( const side of [ - 1, 1 ] ) {

		tube( parent, [ side * 0.28, 0.55, SEAT.z + 0.35 ], [ side * 0.22, 1.12, SEAT.z + 0.25 ], 0.025, cage );
		tube( parent, [ side * 0.28, 0.55, SEAT.z - 0.55 ], [ side * 0.2, 1.05, SEAT.z - 0.2 ], 0.022, cage );

	}

	tube( parent, [ - 0.22, 1.12, SEAT.z + 0.25 ], [ 0.22, 1.12, SEAT.z + 0.25 ], 0.025, cage );
	block( parent, BLACK(), [ 0.45, 0.6, 0.1 ], [ 0, 0.75, SEAT.z + 0.3 ], [ - 0.3, 0, 0 ] );
	const canopy = new Mesh( new SphereGeometry( 0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2 ), GLASS() );
	canopy.scale.set( 0.75, 0.75, 1.5 );
	canopy.position.set( 0, 0.6, SEAT.z - 0.2 );
	canopy.name = 'canopy';
	parent.add( canopy );
	rod( parent, DARK(), 0.12, 0.03, 'z', [ 0, 0.78, SEAT.z - 0.55 ], 12 );

}

// The rocket over the rear axle: a long tank in two colours, rings round it, and its nozzle.
function rocket( parent ) {

	rod( parent, mat( 0xe8edf2, { roughness: 0.2, metalness: 0.85 } ), 0.24, 1.6, 'z', [ 0, NOZZLE.y, NOZZLE.z - 0.95 ], 20 );
	const cap = new Mesh( new SphereGeometry( 0.24, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2 ).rotateX( - Math.PI / 2 ), CHROME() );
	cap.position.set( 0, NOZZLE.y, NOZZLE.z - 1.75 );
	parent.add( cap );
	for ( const z of [ - 1.5, - 0.95, - 0.4 ] ) paint( rod( parent, bodyPaint(), 0.255, 0.08, 'z', [ 0, NOZZLE.y, NOZZLE.z + z ], 20 ) );
	rod( parent, DARK(), 0.18, 0.2, 'z', [ 0, NOZZLE.y, NOZZLE.z - 0.1 ], 16 );
	// Its cradle down to the frame.
	for ( const side of [ - 1, 1 ] ) for ( const z of [ - 1.4, - 0.4 ] ) tube( parent, [ side * 0.2, NOZZLE.y - 0.15, NOZZLE.z + z ], [ side * 0.28, 0.6, NOZZLE.z + z ], 0.02, DARK() );

}

// A big wing on two struts over the rocket, with end plates painted body colour.
function wing( parent ) {

	const carbon = mat( 0x1c1e22, { roughness: 0.35, metalness: 0.5 } );
	block( parent, carbon, [ 1.7, 0.04, 0.55 ], [ 0, 1.82, 2.2 ], [ - 0.18, 0, 0 ] );
	block( parent, carbon, [ 1.7, 0.03, 0.3 ], [ 0, 1.72, 2.45 ], [ - 0.4, 0, 0 ] );
	for ( const side of [ - 1, 1 ] ) {

		paint( block( parent, bodyPaint(), [ 0.03, 0.4, 0.75 ], [ side * 0.86, 1.75, 2.3 ] ) );
		tube( parent, [ side * 0.35, 1.18, 2.15 ], [ side * 0.4, 1.8, 2.2 ], 0.03, carbon );

	}

}
