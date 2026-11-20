import { Group, LatheGeometry, MathUtils, Mesh, MeshStandardMaterial, Vector2 } from 'three';
import { BLACK, block, CHROME, DARK, driver, HEADLIGHT, mat, merge, paint, rod, TAILLIGHT, tube, wheel } from './parts.js';

// A lunar rover, drawn for World Drive (no space agency's rover): an open frame on six wire-mesh
// wheels, each on its own strut, two seats with an astronaut in a white suit and a gold visor, a
// dish antenna up front on a mast, a camera mast at the back, a fold of solar panel over the rear
// deck and a beacon on top. 3.6 m long, 2.3 m wide, 2.2 m tall to the top of the dish, on y = 0,
// facing -Z. Made for the Moon but it drives anywhere. As it goes (onDrive): its six wheels spin,
// the front and back pairs steer opposite ways, each wheel rides up and down over the bumps on its
// own, hanging down in the air and squashing as it lands, the dish turns slowly to keep its fix,
// the camera pans where it steers, and the beacon blinks.

const AXLES = [ - 1.2, 0, 1.2 ];
const TYRE = { radius: 0.4, width: 0.3, rim: 0.55, spokes: 8, grooves: 4, dish: 0.15, x: 1.0 };
const STEER_LOCK = 0.45;
const DECK = 0.78;
const BODY_COLOUR = 0xeef1f4;
// The struts: how far each wheel rides up and down over bumps at speed (m), how far they hang in
// the air (m), and how quickly they follow (1/s).
const STRUT = { bump: 0.07, droop: 0.16, follow: 10 };

// Tuning (see drive.js specFor and HANDLING): slow and floaty, as if the Moon's gravity came along
// with it. It takes ramps for a long ride and comes down gently, bouncing on its struts.
export const ROVER_DRIVE = {
	topSpeed: 75, accel: 5, brake: 9, reverse: 20,
	cab: { ahead: - 0.05, right: - 0.4, up: 1.95 },
	handling: { grip: 6, slip: 1.5, driftYaw: [ 30, 85 ], turn: [ 120, 70 ], lock: 40, gravity: 0.55, launch: 1.25, air: 1.4, landTilt: 50, squash: 1.2, rebound: 0.3, drag: 1.3 },
};

export function makeRover() {

	const rover = new Group();
	rover.name = 'Lunar rover';
	const shell = new Group();
	rover.add( shell );
	frame( shell );
	deck( shell );
	for ( const x of [ - 0.4, 0.4 ] ) seat( shell, x );
	driver( shell, { at: [ - 0.4, DECK + 0.22, 0.05 ], hands: [ - 0.12, DECK + 0.56, - 0.42 ], feet: - 0.7, suit: 0xe9ecef, helmet: 0xf4f6f8, visor: 0xc99a2e, lean: 0.12 } );
	controller( shell );
	merge( shell );

	// The six wheels, each on a strut from the frame, the front and back pairs on knuckles that steer.
	const wheels = [];
	for ( const z of AXLES ) {

		for ( const side of [ - 1, 1 ] ) {

			const strut = new Group();
			strut.position.set( side * TYRE.x, TYRE.radius, z );
			rover.add( strut );
			const knuckle = new Group();
			strut.add( knuckle );
			const spinner = wheel( knuckle, TYRE, side, { tyre: mat( 0x8f969d, { roughness: 0.55, metalness: 0.7 } ), hub: DARK() } );
			// A fender over it and the strut up to the frame, both riding with the wheel.
			block( knuckle, mat( BODY_COLOUR, { roughness: 0.4 } ), [ TYRE.width + 0.08, 0.025, 0.7 ], [ 0, TYRE.radius + 0.08, 0 ] );
			tube( strut, [ 0, 0, 0 ], [ - side * 0.3, DECK - TYRE.radius - 0.02, 0 ], 0.035, CHROME() );
			wheels.push( { strut, knuckle, spinner, z, phase: Math.random() * Math.PI * 2, rate: 1.7 + Math.random() * 0.8, offset: 0 } );

		}

	}

	// The dish on its mast, turning to keep its fix.
	const dish = new Group();
	dish.name = 'dish';
	dish.position.set( 0.55, 1.55, - 1.25 );
	rover.add( dish );
	antenna( dish );
	// The camera mast at the back, panning where it steers.
	const camera = new Group();
	camera.position.set( - 0.75, 1.62, 1.35 );
	rover.add( camera );
	cameraHead( camera );
	// A beacon on a whip, blinking: its own material, so each rover blinks on its own.
	const glow = new MeshStandardMaterial( { color: 0xffb02e, emissive: 0xff8a00, emissiveIntensity: 0.3, roughness: 0.3 } );
	tube( rover, [ 0.85, 1.05, 1.42 ], [ 0.85, 2.05, 1.42 ], 0.008, DARK() );
	rod( rover, glow, 0.045, 0.08, 'y', [ 0.85, 2.09, 1.42 ], 10 );

	rover.userData.decals = DECALS;
	rover.userData.decalParent = shell;
	let clock = 0;
	let roll = 0;
	let travelled = 0;
	let wasAirborne = false;
	let landing = 0;
	rover.userData.onDrive = ( { steer, speed, dt, airborne = false, vy = 0 } ) => {

		clock += dt;
		roll = ( roll + speed * dt / TYRE.radius ) % ( Math.PI * 2 );
		travelled += Math.abs( speed ) * dt;
		// Coming down, every strut squashes by how fast it lands, then springs back.
		if ( wasAirborne && ! airborne ) landing = Math.min( 0.18, Math.max( 0, - vy ) * 0.03 );
		wasAirborne = airborne;
		landing *= Math.max( 0, 1 - dt * 6 );
		const rough = MathUtils.clamp( Math.abs( speed ) / 6, 0, 1 );
		for ( const w of wheels ) {

			w.knuckle.rotation.y = w.z < 0 ? - steer * STEER_LOCK : w.z > 0 ? steer * STEER_LOCK * 0.8 : 0;
			w.spinner.rotation.x = - roll;
			// Over the bumps, each wheel on its own; hanging down in the air.
			const target = airborne ? - STRUT.droop : Math.sin( travelled * w.rate + w.phase ) * STRUT.bump * rough + Math.max( 0, Math.sin( travelled * w.rate * 2.3 + w.phase * 3 ) - 0.7 ) * STRUT.bump * rough;
			w.offset += ( target - w.offset ) * Math.min( 1, dt * STRUT.follow );
			w.strut.position.y = TYRE.radius + w.offset + landing * 0.4;

		}

		shell.position.y = - landing;

		dish.rotation.y = Math.sin( clock * 0.35 ) * 1.1 + steer * 0.2;
		dish.children[ 0 ].rotation.x = - 0.5 + Math.sin( clock * 0.8 ) * 0.08;
		camera.rotation.y += ( - steer * 0.8 + Math.sin( clock * 0.5 ) * 0.15 - camera.rotation.y ) * Math.min( 1, dt * 3 );
		// Two quick blinks every two seconds.
		const beat = clock % 2;
		glow.emissiveIntensity = beat < 0.12 || ( beat > 0.3 && beat < 0.42 ) ? 3 : 0.25;

	};

	return rover;

}

// Where the Garage's decals go (see paint.js): along the deck from front to back, on the side
// panels, and a number on the front panel.
const DECALS = {
	top: { at: [ 0, DECK + 0.04, - 0.95 ], size: [ 0.9, 0.9, 0.4 ] },
	side: { at: [ 0.68, DECK - 0.12, 0 ], size: [ 2.2, 0.18, 0.3 ] },
	bonnet: { at: [ 0, DECK + 0.05, - 1.2 ], size: 0.4 },
};

function bodyPaint() {

	return mat( BODY_COLOUR, { roughness: 0.4, metalness: 0.1 } );

}

const FOIL = () => mat( 0xe0b34a, { roughness: 0.35, metalness: 0.45 } );

// The frame: two rails down the sides joined across, and a nose bar.
function frame( parent ) {

	const struts = DARK();
	for ( const side of [ - 1, 1 ] ) tube( parent, [ side * 0.7, DECK - 0.1, - 1.65 ], [ side * 0.7, DECK - 0.1, 1.65 ], 0.045, CHROME() );
	for ( const z of [ - 1.65, - 0.6, 0.6, 1.65 ] ) tube( parent, [ - 0.7, DECK - 0.1, z ], [ 0.7, DECK - 0.1, z ], 0.035, struts );
	// Lights on the nose bar and the tail.
	for ( const side of [ - 1, 1 ] ) {

		rod( parent, HEADLIGHT(), 0.07, 0.06, 'z', [ side * 0.45, DECK, - 1.78 ], 12 );
		block( parent, TAILLIGHT(), [ 0.14, 0.05, 0.03 ], [ side * 0.55, DECK - 0.02, 1.78 ] );

	}

}

// The deck: painted side panels and floor, gold-foiled boxes front and back, and the solar panel.
function deck( parent ) {

	paint( block( parent, bodyPaint(), [ 1.45, 0.06, 3.5 ], [ 0, DECK - 0.04, 0 ] ) );
	for ( const side of [ - 1, 1 ] ) paint( block( parent, bodyPaint(), [ 0.04, 0.3, 3.3 ], [ side * 0.72, DECK - 0.15, 0 ] ) );
	// The front box, under the dish, and the battery boxes behind the seats.
	paint( block( parent, bodyPaint(), [ 1.3, 0.28, 0.75 ], [ 0, DECK + 0.14, - 1.3 ] ) );
	block( parent, FOIL(), [ 1.24, 0.06, 0.7 ], [ 0, DECK + 0.3, - 1.3 ] );
	block( parent, FOIL(), [ 1.3, 0.35, 0.6 ], [ 0, DECK + 0.18, 1.25 ] );
	block( parent, DARK(), [ 0.5, 0.2, 0.4 ], [ - 0.35, DECK + 0.45, 1.25 ] );
	// The solar panel over the rear boxes, tilted to the sun.
	const cells = mat( 0x1b2a55, { roughness: 0.15, metalness: 0.6 } );
	block( parent, cells, [ 1.5, 0.03, 0.9 ], [ 0.15, DECK + 0.68, 1.3 ], [ 0.25, 0, 0 ] );
	for ( let i = - 2; i <= 2; i ++ ) block( parent, CHROME(), [ 0.01, 0.035, 0.9 ], [ 0.15 + i * 0.3, DECK + 0.69, 1.3 ], [ 0.25, 0, 0 ] );
	tube( parent, [ 0.15, DECK + 0.35, 1.3 ], [ 0.15, DECK + 0.66, 1.3 ], 0.03, DARK() );
	// Tool racks down the sides behind the seats.
	for ( const side of [ - 1, 1 ] ) block( parent, FOIL(), [ 0.08, 0.2, 0.5 ], [ side * 0.66, DECK + 0.15, 0.7 ] );

}

// A tubular seat with a webbing back.
function seat( parent, x ) {

	block( parent, BLACK(), [ 0.5, 0.06, 0.5 ], [ x, DECK + 0.2, 0.05 ] );
	block( parent, BLACK(), [ 0.5, 0.55, 0.05 ], [ x, DECK + 0.48, 0.32 ], [ - 0.15, 0, 0 ] );
	for ( const side of [ - 1, 1 ] ) tube( parent, [ x + side * 0.25, DECK, 0.3 ], [ x + side * 0.25, DECK + 0.76, 0.36 ], 0.018, CHROME() );

}

// The hand controller between the seats, a T on a column.
function controller( parent ) {

	tube( parent, [ - 0.12, DECK, - 0.5 ], [ - 0.12, DECK + 0.52, - 0.42 ], 0.03, DARK() );
	block( parent, BLACK(), [ 0.12, 0.08, 0.06 ], [ - 0.12, DECK + 0.56, - 0.42 ] );
	// A little console with lit dials.
	block( parent, DARK(), [ 0.6, 0.3, 0.12 ], [ 0, DECK + 0.38, - 0.82 ], [ - 0.4, 0, 0 ] );
	for ( const x of [ - 0.15, 0, 0.15 ] ) rod( parent, mat( 0x7fe8c4, { emissive: 0x3fd8a0, emissiveIntensity: 0.8 } ), 0.035, 0.02, 'z', [ x, DECK + 0.4, - 0.88 ], 10 );

}

// The high-gain antenna: a mast, and on a yoke at its top a dish (its first child tilts).
function antenna( group ) {

	tube( group, [ 0, - 0.75, 0 ], [ 0, 0, 0 ], 0.025, CHROME() );
	const tilt = new Group();
	group.add( tilt );
	// A shallow mesh dish, turned on a lathe, its open side forward.
	const points = [];
	for ( let i = 0; i <= 8; i ++ ) {

		const r = 0.42 * i / 8;
		points.push( new Vector2( r, r * r * 0.9 ) );

	}

	for ( let i = 8; i >= 0; i -- ) {

		const r = 0.42 * i / 8;
		points.push( new Vector2( r, r * r * 0.9 - 0.015 ) );

	}

	const dish = new Mesh( new LatheGeometry( points, 24 ).rotateX( - Math.PI / 2 ), mat( 0xe8e2cf, { roughness: 0.45, metalness: 0.4 } ) );
	tilt.add( dish );
	// The feed on three legs at the dish's focus.
	rod( tilt, DARK(), 0.03, 0.08, 'z', [ 0, 0, - 0.3 ], 8 );
	for ( let i = 0; i < 3; i ++ ) {

		const a = i / 3 * Math.PI * 2;
		tube( tilt, [ Math.cos( a ) * 0.36, Math.sin( a ) * 0.36, - 0.12 ], [ 0, 0, - 0.28 ], 0.006, CHROME() );

	}

}

// The camera mast's head: a box with two lenses and a lens hood.
function cameraHead( group ) {

	tube( group, [ 0, - 0.85, 0 ], [ 0, 0, 0 ], 0.022, CHROME() );
	block( group, mat( BODY_COLOUR, { roughness: 0.4 } ), [ 0.26, 0.14, 0.18 ], [ 0, 0.06, 0 ] );
	for ( const x of [ - 0.07, 0.07 ] ) rod( group, mat( 0x0b1622, { roughness: 0.05, metalness: 0.9 } ), 0.035, 0.06, 'z', [ x, 0.06, - 0.11 ], 10 );

}
