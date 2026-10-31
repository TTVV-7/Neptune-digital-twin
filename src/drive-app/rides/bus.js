import { CanvasTexture, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace } from 'three';
import { AMBER, arch, BLACK, block, DARK, driver, GLASS, HEADLIGHT, mat, merge, paint, profile, steeringWheel, TAILLIGHT, tube, wheel } from './parts.js';

// A low-floor city bus, drawn for World Drive (no real maker's bus or real city's livery): a long
// box with rounded ends, a band of windows down each side with passengers behind them, two doors
// on the kerb side, a big windscreen under a route sign, mirrors out front on arms, and twin wheels
// at the back. The driver sits up front on the left in a cap. 12 m long, 2.55 m wide, 3.2 m tall
// with its roof pods, on y = 0, facing -Z. Its front wheels steer and all six spin (onDrive).

const FRONT_AXLE = - 3.3;
const REAR_AXLE = 2.7;
const HALF = 1.275;
const FRONT_TYRE = { radius: 0.5, width: 0.3, rim: 0.6, spokes: 8, grooves: 1, dish: 0.15, segments: 16, x: 1.05 };
const REAR_TYRE = { radius: 0.5, width: 0.26, rim: 0.6, spokes: 8, grooves: 1, dish: 0.1, segments: 16 };
const REAR_X = [ 0.86, 1.13 ];
const STEER_LOCK = 0.55;
// The lower body's top (the window line), and the top of the windows (the roof's underside).
const SILL = 1.25;
const EAVES = 2.68;
const SEAT = { x: - 0.72, z: - 5.0 };
const BODY_COLOUR = 0x2440c9;

// Tuning (see drive.js specFor and HANDLING): slow to get going and slow to stop, rolling on and
// on once it's moving, turning wide; heavy in a crash: barely thrown up, ponderous in the air, and
// squashing and wobbling (and shaking the view) more than anything else.
export const BUS_DRIVE = {
	topSpeed: 90, accel: 2.1, brake: 6, reverse: 15,
	cab: { ahead: - SEAT.z + 0.15, right: SEAT.x, up: 2.2 },
	handling: { grip: 7, slip: 1.4, driftYaw: [ 22, 55 ], turn: [ 62, 24 ], lock: 32, drag: 0.4, gravity: 1.1, launch: 0.55, air: 0.8, kick: 0.6, landTilt: 35, squash: 1.8, shake: 1.6, rebound: 0.12 },
};

export function makeBus() {

	const bus = new Group();
	bus.name = 'City bus';
	const shell = new Group();
	bus.add( shell );
	bodywork( shell );
	windows( shell );
	front( shell );
	inside( shell );
	// The driver sits low behind the windscreen, on a seat of their own.
	driver( shell, { at: [ SEAT.x, 1.45, SEAT.z ], hands: [ SEAT.x + 0.2, 1.8, - 5.42 ], feet: - 5.7, suit: 0x23324a, cap: true, lean: 0.05 } );
	block( shell, BLACK(), [ 0.5, 0.12, 0.5 ], [ SEAT.x, 1.36, SEAT.z ] );
	steeringWheel( shell, [ SEAT.x, 1.78, - 5.48 ], 0.24, 0.5 );
	merge( shell );

	const spinners = [];
	const knuckles = [];
	for ( const side of [ - 1, 1 ] ) {

		const knuckle = new Group();
		knuckle.position.set( side * FRONT_TYRE.x, FRONT_TYRE.radius, FRONT_AXLE );
		bus.add( knuckle );
		knuckles.push( knuckle );
		spinners.push( wheel( knuckle, FRONT_TYRE, side ) );
		for ( const x of REAR_X ) {

			const rear = new Group();
			rear.position.set( side * x, REAR_TYRE.radius, REAR_AXLE );
			bus.add( rear );
			spinners.push( wheel( rear, REAR_TYRE, side ) );

		}

	}

	bus.userData.decals = DECALS;
	bus.userData.decalParent = shell;
	let roll = 0;
	bus.userData.onDrive = ( { steer, speed, dt } ) => {

		for ( const knuckle of knuckles ) knuckle.rotation.y = - steer * STEER_LOCK;
		roll = ( roll + speed * dt / FRONT_TYRE.radius ) % ( Math.PI * 2 );
		for ( const spinner of spinners ) spinner.rotation.x = - roll;

	};

	return bus;

}

// Where the Garage's decals go (see paint.js): along the roof (which is white, but takes them),
// down the sides between the wheels under the windows, and a number on the roof at the front.
const DECALS = {
	top: { at: [ 0, 3, 0 ], size: [ 1, 11.8, 0.5 ] },
	side: { at: [ HALF, 0.82, - 0.3 ], size: [ 4.6, 0.62, 0.5 ] },
	bonnet: { at: [ 0, 3, - 4.6 ], size: 0.9, deep: 0.5 },
};

function bodyPaint() {

	return mat( BODY_COLOUR, { roughness: 0.35, metalness: 0.15 } );

}

// The lower body to the window line, with its arches; the back end up to the roof; the roof in
// white with rounded ends, and pods on top.
function bodywork( parent ) {

	const lower = [
		[ - 5.88, 0.38 ], [ - 5.92, SILL ], [ 5.88, SILL ], [ 5.9, 0.4 ],
		...arch( REAR_AXLE, 0.5, 0.64, 0.38, 8 ),
		[ 2.0, 0.36 ], [ - 2.6, 0.36 ],
		...arch( FRONT_AXLE, 0.5, 0.62, 0.38, 8 ),
	];
	paint( profile( parent, bodyPaint(), lower, - HALF, HALF, { bevel: 0.08, segments: 2 } ) );
	// The back, engine and all, up to the roof, with a rear window in it.
	paint( profile( parent, bodyPaint(), [ [ 5.0, SILL - 0.05 ], [ 5.0, EAVES ], [ 5.88, EAVES ], [ 5.9, SILL - 0.05 ] ], - HALF, HALF, { bevel: 0.08, segments: 2 } ) );
	block( parent, BLACK(), [ 1.7, 0.8, 0.02 ], [ 0, 2.05, 5.985 ] );
	const white = mat( 0xf2f4f6, { roughness: 0.45 } );
	profile( parent, white, [ [ - 5.86, EAVES ], [ - 5.7, 2.92 ], [ 5.75, 2.92 ], [ 5.9, EAVES ] ], - HALF, HALF, { bevel: 0.08, segments: 2 } ).userData.decalable = true;
	block( parent, mat( 0xd9dde2, { roughness: 0.5 } ), [ 1.7, 0.22, 2.6 ], [ 0, 3.1, 0.9 ] );
	block( parent, mat( 0xd9dde2, { roughness: 0.5 } ), [ 1.4, 0.18, 1.2 ], [ 0, 3.08, 4.3 ] );
	// Bumpers, a skirt along the bottom, lights at the back.
	block( parent, BLACK(), [ 2.5, 0.32, 0.12 ], [ 0, 0.5, - 6.02 ] );
	block( parent, BLACK(), [ 2.5, 0.32, 0.12 ], [ 0, 0.5, 6.02 ] );
	for ( const side of [ - 1, 1 ] ) {

		block( parent, TAILLIGHT(), [ 0.22, 0.5, 0.04 ], [ side * 1.08, 1.0, 5.99 ] );
		block( parent, AMBER(), [ 0.22, 0.14, 0.04 ], [ side * 1.08, 1.33, 5.99 ] );
		block( parent, AMBER(), [ 0.04, 0.08, 0.2 ], [ side * ( HALF + 0.08 ), 0.9, - 4.2 ] );

	}

}

// A band of tinted glass down each side between black pillars, the windscreen, and the two doors
// on the right (kerb) side.
function windows( parent ) {

	const height = EAVES - SILL;
	const middle = ( SILL + EAVES ) / 2;
	for ( const side of [ - 1, 1 ] ) {

		const glass = new Mesh( new PlaneGeometry( 10.9, height ), GLASS() );
		glass.rotation.y = side * Math.PI / 2;
		glass.position.set( side * ( HALF - 0.02 ), middle, - 0.45 );
		parent.add( glass );
		// Pillars every 1.2 m or so, and a black band along the top of the glass.
		for ( let z = - 5.85; z <= 5.05; z += 1.21 ) block( parent, BLACK(), [ 0.06, height, 0.1 ], [ side * ( HALF - 0.01 ), middle, z ] );
		block( parent, BLACK(), [ 0.06, 0.12, 10.9 ], [ side * ( HALF - 0.01 ), EAVES - 0.06, - 0.45 ] );

	}

	// The doors: glass down to the step, in black frames, a line down the middle where they part.
	for ( const [ z0, z1 ] of [ [ - 5.55, - 4.35 ], [ 0.15, 1.35 ] ] ) {

		const z = ( z0 + z1 ) / 2;
		const door = new Mesh( new PlaneGeometry( z1 - z0, EAVES - 0.45 ), mat( 0x14202c, { roughness: 0.1, metalness: 0.5 } ) );
		door.rotation.y = Math.PI / 2;
		door.position.set( HALF + 0.085, ( EAVES + 0.45 ) / 2, z );
		parent.add( door );
		block( parent, BLACK(), [ 0.04, EAVES - 0.45, 0.05 ], [ HALF + 0.09, ( EAVES + 0.45 ) / 2, z ] );
		for ( const edge of [ z0, z1 ] ) block( parent, BLACK(), [ 0.05, EAVES - 0.4, 0.07 ], [ HALF + 0.09, ( EAVES + 0.45 ) / 2, edge ] );
		block( parent, BLACK(), [ 0.05, 0.07, z1 - z0 ], [ HALF + 0.09, 1.25, z ] );

	}

}

// The windscreen under the route sign, headlights, and mirrors out on arms.
function front( parent ) {

	const screen = new Mesh( new PlaneGeometry( 2.35, EAVES - SILL - 0.25 ), GLASS() );
	screen.position.set( 0, SILL + ( EAVES - SILL - 0.25 ) / 2, - 6.0 );
	screen.rotation.set( - 0.03, Math.PI, 0 );
	parent.add( screen );
	// The sign's frame and its lit words.
	block( parent, BLACK(), [ 2.3, 0.3, 0.06 ], [ 0, EAVES - 0.12, - 5.98 ] );
	const sign = new Mesh( new PlaneGeometry( 2.0, 0.22 ), routeSign() );
	sign.position.set( 0, EAVES - 0.12, - 6.02 );
	sign.rotation.y = Math.PI;
	parent.add( sign );
	// Corner posts each side of the windscreen.
	for ( const side of [ - 1, 1 ] ) {

		block( parent, BLACK(), [ 0.1, EAVES - SILL, 0.1 ], [ side * ( HALF - 0.06 ), ( SILL + EAVES ) / 2, - 5.96 ] );
		block( parent, HEADLIGHT(), [ 0.42, 0.16, 0.04 ], [ side * 0.88, 0.9, - 6.0 ] );
		block( parent, AMBER(), [ 0.16, 0.12, 0.04 ], [ side * 0.88, 1.08, - 6.0 ] );
		// A mirror arm curving out and down from the top corner, a mirror on its end.
		tube( parent, [ side * 1.2, 2.6, - 5.9 ], [ side * 1.45, 2.55, - 6.25 ], 0.025, BLACK() );
		tube( parent, [ side * 1.45, 2.55, - 6.25 ], [ side * 1.45, 2.2, - 6.3 ], 0.025, BLACK() );
		block( parent, BLACK(), [ 0.07, 0.36, 0.2 ], [ side * 1.46, 2.0, - 6.3 ] );

	}

	// The dashboard under the windscreen.
	block( parent, DARK(), [ 2.3, 0.3, 0.45 ], [ 0, SILL + 0.1, - 5.65 ] );

}

// Rows of seats down both sides, and a few passengers in them.
function inside( parent ) {

	const seat = mat( 0x283a63, { roughness: 0.8 } );
	for ( const side of [ - 1, 1 ] ) for ( let z = - 3.6; z <= 4.6; z += 0.82 ) {

		// No seats in the middle doorway.
		if ( side > 0 && z > - 0.1 && z < 1.6 ) continue;
		block( parent, seat, [ 0.9, 0.1, 0.45 ], [ side * 0.72, SILL + 0.15, z ] );
		block( parent, seat, [ 0.9, 0.6, 0.08 ], [ side * 0.72, SILL + 0.45, z + 0.24 ] );

	}

	const people = [ [ - 1, - 2.78, 0xd94a3a, 0x3b2a20 ], [ 1, - 1.96, 0x3ab06c, 0xe5c07a ], [ - 1, 0.5, 0xf2b632, 0x1d1d1d ], [ 1, 2.42, 0x7a5cd6, 0x8a5a33 ], [ - 1, 3.24, 0x2f8fd8, 0xc9c9c9 ] ];
	const skin = [ 0xe0ac86, 0x8d5a3b, 0xc68e6a, 0xf1c9a5, 0x5e3b25 ];
	people.forEach( ( [ side, z, shirt, hair ], i ) => {

		const torso = new Mesh( new CapsuleGeometry( 0.17, 0.3, 2, 7 ), mat( shirt, { roughness: 0.8 } ) );
		torso.position.set( side * 0.62, SILL + 0.55, z + 0.05 );
		parent.add( torso );
		const head = new Mesh( new SphereGeometry( 0.12, 8, 6 ), mat( skin[ i ], { roughness: 0.7 } ) );
		head.position.set( side * 0.62, SILL + 0.92, z + 0.02 );
		parent.add( head );
		const top = new Mesh( new SphereGeometry( 0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5 ), mat( hair, { roughness: 0.9 } ) );
		top.position.copy( head.position ).y += 0.02;
		parent.add( top );

	} );

}

// The route sign: a number and "World Drive" in amber dots on black, drawn once.
let sign = null;
function routeSign() {

	if ( sign ) return sign;
	const canvas = document.createElement( 'canvas' );
	canvas.width = 512;
	canvas.height = 56;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#0b0b0c';
	ctx.fillRect( 0, 0, 512, 56 );
	ctx.fillStyle = '#ffb21a';
	ctx.font = 'bold 40px system-ui, sans-serif';
	ctx.textBaseline = 'middle';
	ctx.fillText( '42', 18, 30 );
	ctx.font = 'bold italic 34px system-ui, sans-serif';
	ctx.fillText( 'WORLD DRIVE', 110, 30 );
	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	sign = new MeshStandardMaterial( { map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.8, roughness: 0.6 } );
	sign.userData.shared = true;
	return sign;

}
