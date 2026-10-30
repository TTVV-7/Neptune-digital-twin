import {
	BoxGeometry,
	CapsuleGeometry,
	CatmullRomCurve3,
	CylinderGeometry,
	ExtrudeGeometry,
	Group,
	LatheGeometry,
	Mesh,
	MeshStandardMaterial,
	Shape,
	SphereGeometry,
	TorusGeometry,
	TubeGeometry,
	Vector2,
	Vector3,
} from 'three';

// A go-kart drawn in code: a tubular steel frame, four wide tyres on rims, side pods, a nose and a
// rear bumper in bright paint, a seat, a steering wheel, an engine beside the seat with its
// exhaust, and a driver in a helmet. About 1.6 m long and 1.2 m wide, standing on y = 0 with its
// front facing -Z like the other library pieces. Its front wheels steer and all four spin while
// it's driven (see onDrive, which drive.js calls each frame).

const LENGTH = 1.6;
const WIDTH = 1.2;
// Axles (z) and wheel centres (x). The rear track is wider, with the fatter tyres.
const FRONT_AXLE = - 0.5;
const REAR_AXLE = 0.47;
const FRONT_TYRE = { radius: 0.13, width: 0.13, x: 0.47 };
const REAR_TYRE = { radius: 0.14, width: 0.19, x: 0.505 };
// How far the front wheels turn at full lock, for show.
const STEER_LOCK = 0.45;
// Where the driver's eyes are (m, from the middle of the kart at ground level) for the in-seat
// camera, and the head that camera would otherwise be inside.
const EYE = { ahead: - 0.08, right: 0, up: 0.94 };

// Boxes in which decals are projected onto it (see src/drive-app/paint.js): over the nose, onto the
// side pods, and a number on the nose.
const KART_DECALS = {
	top: { at: [ 0, 0.2, - 0.61 ], size: [ 0.3, 0.42, 0.3 ] },
	side: { at: [ 0.6, 0.155, 0.01 ], size: [ 0.6, 0.17, 0.25 ] },
	bonnet: { at: [ 0, 0.2, - 0.62 ], size: 0.24, deep: 0.3 },
};

// Tuning for race mode (see drive.js specFor): light and quick.
export const KART_DRIVE = { topSpeed: 100, accel: 9, brake: 16, reverse: 25, cab: EYE };

// The library item, as procedural.js lists its pieces, so a kart can be placed and driven like
// any other vehicle.
export const KART_ITEM = { id: 'go-kart', name: 'Go-kart', category: 'Vehicles', build: makeKart, drive: KART_DRIVE };

// Materials are shared between karts, as procedural pieces' are, so removing one doesn't spoil the rest.
const materials = new Map();
function mat( color, { roughness = 0.5, metalness = 0, ...rest } = {} ) {

	const key = JSON.stringify( [ color, roughness, metalness, rest ] );
	if ( ! materials.has( key ) ) {

		const material = new MeshStandardMaterial( { color, roughness, metalness, ...rest } );
		material.userData.shared = true;
		materials.set( key, material );

	}

	return materials.get( key );

}

const PAINT = () => mat( 0xff4a1c, { roughness: 0.35, metalness: 0.1 } );
const TRIM = () => mat( 0xffd21f, { roughness: 0.4 } );
const STEEL = () => mat( 0xb9c0c7, { roughness: 0.3, metalness: 0.8 } );
const DARK = () => mat( 0x24272b, { roughness: 0.6, metalness: 0.3 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const RIM = () => mat( 0xe9edf1, { roughness: 0.25, metalness: 0.7 } );
const SUIT = () => mat( 0x1f5cff, { roughness: 0.7 } );
const GLOVE = () => mat( 0x202226, { roughness: 0.8 } );
const HELMET = () => mat( 0xf6f7f8, { roughness: 0.25, metalness: 0.1 } );
const VISOR = () => mat( 0x10161f, { roughness: 0.05, metalness: 0.9 } );

export function makeKart() {

	const kart = new Group();
	kart.name = 'Go-kart';

	frame( kart );
	bodywork( kart );
	seatAndControls( kart );
	engine( kart );
	const head = driver( kart );

	// Wheels: a turning knuckle for each front one, and a spinning hub inside each.
	const spinners = [];
	const knuckles = [];
	for ( const side of [ - 1, 1 ] ) {

		const knuckle = new Group();
		knuckle.position.set( side * FRONT_TYRE.x, FRONT_TYRE.radius, FRONT_AXLE );
		kart.add( knuckle );
		knuckles.push( knuckle );
		spinners.push( wheel( knuckle, FRONT_TYRE, side ) );

		const rear = new Group();
		rear.position.set( side * REAR_TYRE.x, REAR_TYRE.radius, REAR_AXLE );
		kart.add( rear );
		spinners.push( wheel( rear, REAR_TYRE, side ) );

	}

	// The in-seat camera sits inside the helmet: hide the head then (see drive.js).
	head.userData.hideInCab = true;

	// What World Drive's Garage repaints (src/drive-app/paint.js): the bodywork and the rims; and
	// where its decals go, on the nose and the side pods.
	kart.traverse( o => {

		if ( o.material === PAINT() && o.parent === kart ) o.userData.paint = 'body';
		else if ( o.material === RIM() ) o.userData.paint = 'rim';

	} );
	kart.userData.decals = KART_DECALS;

	let roll = 0;
	kart.userData.onDrive = ( { steer, speed, dt } ) => {

		for ( const knuckle of knuckles ) knuckle.rotation.y = - steer * STEER_LOCK;
		roll += speed * dt / ( ( FRONT_TYRE.radius + REAR_TYRE.radius ) / 2 );
		roll %= Math.PI * 2;
		// Forward is -Z, so rolling forward turns the top of the wheel toward -Z: negative about X.
		for ( const spinner of spinners ) spinner.rotation.x = - roll;

	};

	return kart;

}

// --- parts ------------------------------------------------------------------------------------

// A tube of steel between two points [ x, y, z ].
function tube( parent, a, b, radius = 0.016, material = STEEL() ) {

	const start = new Vector3( ...a );
	const end = new Vector3( ...b );
	const length = start.distanceTo( end );
	const mesh = new Mesh( new CylinderGeometry( radius, radius, length, 6, 1, true ), material );
	mesh.position.copy( start ).add( end ).multiplyScalar( 0.5 );
	mesh.quaternion.setFromUnitVectors( new Vector3( 0, 1, 0 ), end.sub( start ).normalize() );
	parent.add( mesh );
	return mesh;

}

// A bent tube through points, for bumpers and the exhaust.
function bent( parent, points, radius, material = STEEL(), segments = 12 ) {

	const curve = new CatmullRomCurve3( points.map( p => new Vector3( ...p ) ) );
	const mesh = new Mesh( new TubeGeometry( curve, segments, radius, 6, false ), material );
	parent.add( mesh );
	return mesh;

}

function block( parent, material, [ sx, sy, sz ], [ x, y, z ] ) {

	const mesh = new Mesh( new BoxGeometry( sx, sy, sz ), material );
	mesh.position.set( x, y, z );
	parent.add( mesh );
	return mesh;

}

// A side profile (points in [ z, y ]) extruded across x, with rounded edges, between x0 and x1.
function panel( parent, material, points, x0, x1, bevel = 0.02 ) {

	const shape = new Shape( points.map( ( [ z, y ] ) => new Vector2( z, y ) ) );
	const depth = Math.max( 0.001, x1 - x0 - bevel * 2 );
	const geometry = new ExtrudeGeometry( shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( x1 - bevel, 0, 0 );
	const mesh = new Mesh( geometry, material );
	parent.add( mesh );
	return mesh;

}

function frame( kart ) {

	const y = 0.075;
	// Two main rails, pinched in at the front where the feet go.
	for ( const side of [ - 1, 1 ] ) {

		bent( kart, [ [ side * 0.16, y, - 0.72 ], [ side * 0.2, y, - 0.45 ], [ side * 0.3, y, - 0.1 ], [ side * 0.32, y, 0.35 ], [ side * 0.3, y, 0.62 ] ], 0.017 );
		// Nerf bars between the wheels keep other karts' wheels out.
		bent( kart, [ [ side * 0.3, y, - 0.35 ], [ side * 0.52, 0.11, - 0.3 ], [ side * 0.55, 0.12, 0 ], [ side * 0.52, 0.11, 0.3 ], [ side * 0.32, y, 0.33 ] ], 0.013 );
		// Kingpin uprights for the front stub axles.
		tube( kart, [ side * 0.22, y, FRONT_AXLE ], [ side * ( FRONT_TYRE.x - 0.05 ), FRONT_TYRE.radius, FRONT_AXLE ], 0.014 );

	}

	// Cross members.
	for ( const z of [ - 0.6, - 0.3, 0.1, 0.55 ] ) tube( kart, [ - 0.3, y, z ], [ 0.3, y, z ], 0.014 );
	// The rear axle, live across the whole track.
	tube( kart, [ - REAR_TYRE.x, REAR_TYRE.radius, REAR_AXLE ], [ REAR_TYRE.x, REAR_TYRE.radius, REAR_AXLE ], 0.02, DARK() );
	// Floor tray.
	block( kart, DARK(), [ 0.36, 0.01, 0.75 ], [ 0, 0.06, - 0.3 ] );

}

function bodywork( kart ) {

	// Nose: a wedge over the front bumper, in front of the feet.
	panel( kart, PAINT(), [ [ - 0.8, 0.05 ], [ - 0.8, 0.13 ], [ - 0.72, 0.2 ], [ - 0.5, 0.24 ], [ - 0.42, 0.24 ], [ - 0.42, 0.05 ] ], - 0.3, 0.3, 0.03 );
	// Front panel rising to the steering column, with a number plate on it.
	panel( kart, PAINT(), [ [ - 0.5, 0.12 ], [ - 0.46, 0.4 ], [ - 0.4, 0.42 ], [ - 0.36, 0.14 ] ], - 0.2, 0.2, 0.015 );
	block( kart, TRIM(), [ 0.22, 0.16, 0.012 ], [ 0, 0.3, - 0.483 ] ).rotation.x = - 0.14;

	// Side pods between the wheels.
	for ( const side of [ - 1, 1 ] ) {

		const x0 = side > 0 ? 0.34 : - 0.6;
		const pod = panel( kart, PAINT(), [ [ - 0.3, 0.07 ], [ - 0.26, 0.2 ], [ - 0.1, 0.24 ], [ 0.26, 0.24 ], [ 0.32, 0.2 ], [ 0.32, 0.07 ] ], x0, x0 + 0.26, 0.03 );
		pod.name = 'side-pod';
		// A trim stripe along the top.
		block( kart, TRIM(), [ 0.2, 0.012, 0.42 ], [ side * 0.47, 0.25, 0.05 ] );

	}

	// Rear bumper behind the wheels.
	panel( kart, PAINT(), [ [ 0.66, 0.08 ], [ 0.68, 0.2 ], [ 0.76, 0.22 ], [ 0.79, 0.17 ], [ 0.79, 0.08 ] ], - 0.56, 0.56, 0.02 );
	block( kart, TRIM(), [ 0.96, 0.035, 0.012 ], [ 0, 0.14, 0.802 ] );

}

function seatAndControls( kart ) {

	// A moulded seat: the shell is a lathe turned on its side and cut open at the front.
	const profile = [ [ 0.02, - 0.2 ], [ 0.17, - 0.18 ], [ 0.2, 0 ], [ 0.19, 0.2 ], [ 0.17, 0.26 ] ].map( ( [ r, y ] ) => new Vector2( r, y ) );
	const shell = new Mesh( new LatheGeometry( profile, 14, Math.PI * 0.5, Math.PI ), DARK() );
	shell.rotation.x = - 0.35;
	shell.position.set( 0, 0.3, 0.3 );
	kart.add( shell );
	block( kart, DARK(), [ 0.34, 0.04, 0.3 ], [ 0, 0.12, 0.2 ] );

	// Steering column and wheel, leaning back toward the driver.
	const column = tube( kart, [ 0, 0.08, - 0.42 ], [ 0, 0.42, - 0.2 ], 0.012, DARK() );
	column.name = 'steering-column';
	const steering = new Group();
	steering.position.set( 0, 0.44, - 0.18 );
	steering.rotation.x = - 1.0;
	kart.add( steering );
	steering.add( new Mesh( new TorusGeometry( 0.13, 0.016, 5, 18 ), GLOVE() ) );
	const spoke = new Mesh( new BoxGeometry( 0.24, 0.025, 0.012 ), STEEL() );
	steering.add( spoke );
	steering.add( new Mesh( new CylinderGeometry( 0.035, 0.035, 0.03, 12 ).rotateX( Math.PI / 2 ), TRIM() ) );

	// Pedals.
	for ( const x of [ - 0.08, 0.08 ] ) block( kart, STEEL(), [ 0.05, 0.1, 0.015 ], [ x, 0.13, - 0.6 ] ).rotation.x = 0.4;

}

function engine( kart ) {

	// A single-cylinder engine beside the seat, on the right, driving the rear axle by chain.
	const x = 0.31;
	block( kart, DARK(), [ 0.16, 0.16, 0.2 ], [ x, 0.18, 0.4 ] );
	// Cooling fins on the cylinder.
	for ( let i = 0; i < 5; i ++ ) block( kart, STEEL(), [ 0.15, 0.012, 0.14 ], [ x, 0.28 + i * 0.022, 0.38 ] );
	// Air filter, out to the side.
	const filter = new Mesh( new CylinderGeometry( 0.06, 0.06, 0.1, 14 ).rotateZ( Math.PI / 2 ), TRIM() );
	filter.position.set( x + 0.13, 0.27, 0.32 );
	kart.add( filter );
	// Chain guard down to the axle.
	block( kart, DARK(), [ 0.02, 0.18, 0.2 ], [ x - 0.02, 0.14, REAR_AXLE ] );
	// Exhaust: a bent header to a silencer behind the engine.
	bent( kart, [ [ x, 0.3, 0.3 ], [ x + 0.08, 0.34, 0.22 ], [ x + 0.16, 0.32, 0.3 ], [ x + 0.16, 0.3, 0.5 ] ], 0.018, STEEL() );
	const silencer = new Mesh( new CylinderGeometry( 0.045, 0.045, 0.22, 14 ).rotateX( Math.PI / 2 ), STEEL() );
	silencer.position.set( x + 0.16, 0.3, 0.6 );
	kart.add( silencer );
	const tip = new Mesh( new CylinderGeometry( 0.022, 0.022, 0.05, 10, 1, true ).rotateX( Math.PI / 2 ), DARK() );
	tip.position.set( x + 0.16, 0.3, 0.73 );
	kart.add( tip );

}

// The driver, sitting back in the seat with hands on the wheel. Returns the head, for hiding.
function driver( kart ) {

	const body = new Group();
	kart.add( body );
	// Torso, leaning back with the seat.
	const torso = new Mesh( new CapsuleGeometry( 0.15, 0.24, 3, 10 ), SUIT() );
	torso.position.set( 0, 0.48, 0.24 );
	torso.rotation.x = - 0.3;
	body.add( torso );
	// Legs out along the floor to the pedals.
	for ( const side of [ - 1, 1 ] ) {

		limb( body, [ side * 0.09, 0.22, 0.14 ], [ side * 0.1, 0.27, - 0.2 ], 0.065, SUIT() );
		limb( body, [ side * 0.1, 0.27, - 0.2 ], [ side * 0.08, 0.16, - 0.55 ], 0.055, SUIT() );
		// Arms from the shoulders to the rim of the wheel.
		limb( body, [ side * 0.17, 0.6, 0.18 ], [ side * 0.15, 0.45, - 0.02 ], 0.045, SUIT() );
		limb( body, [ side * 0.15, 0.45, - 0.02 ], [ side * 0.11, 0.47, - 0.15 ], 0.04, SUIT() );
		const glove = new Mesh( new SphereGeometry( 0.04, 6, 4 ), GLOVE() );
		glove.position.set( side * 0.11, 0.47, - 0.16 );
		body.add( glove );

	}

	// Helmet with a dark visor and a stripe, on a short neck.
	const head = new Group();
	head.position.set( 0, 0.86, 0.2 );
	body.add( head );
	limb( head, [ 0, - 0.18, 0.04 ], [ 0, - 0.06, 0.01 ], 0.05, SUIT() );
	head.add( new Mesh( new SphereGeometry( 0.135, 16, 10 ), HELMET() ) );
	// Facing -Z, the front: SphereGeometry's phi of 1.5 pi points there.
	const visor = new Mesh( new SphereGeometry( 0.138, 12, 4, Math.PI * 1.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.24 ), VISOR() );
	head.add( visor );
	const stripe = new Mesh( new TorusGeometry( 0.136, 0.012, 4, 24, Math.PI ), PAINT() );
	stripe.rotation.y = Math.PI / 2;
	head.add( stripe );
	return head;

}

function limb( parent, a, b, radius, material ) {

	const start = new Vector3( ...a );
	const end = new Vector3( ...b );
	const length = start.distanceTo( end );
	const mesh = new Mesh( new CapsuleGeometry( radius, length, 2, 7 ), material );
	mesh.position.copy( start ).add( end ).multiplyScalar( 0.5 );
	mesh.quaternion.setFromUnitVectors( new Vector3( 0, 1, 0 ), end.sub( start ).normalize() );
	parent.add( mesh );
	return mesh;

}

// A tyre with a rounded shoulder on a rim with a hub, facing out on `side`; returns the part that spins.
function wheel( parent, { radius, width }, side ) {

	const spinner = new Group();
	parent.add( spinner );
	const half = width / 2;
	const inner = radius * 0.62;
	const shoulder = 0.03;
	// Profile in [ r, x ] from the inner bead round the tread to the outer bead, turned about the axle.
	const points = [
		[ inner, - half ], [ radius - shoulder, - half ], [ radius - shoulder * 0.3, - half + shoulder * 0.3 ], [ radius, - half + shoulder ],
		[ radius, half - shoulder ], [ radius - shoulder * 0.3, half - shoulder * 0.3 ], [ radius - shoulder, half ], [ inner, half ],
	].map( ( [ r, x ] ) => new Vector2( r, x ) );
	const tyre = new Mesh( new LatheGeometry( points, 18 ).rotateZ( Math.PI / 2 ), RUBBER() );
	spinner.add( tyre );
	// Rim: a dish with five spokes, on the outer face.
	const rim = new Mesh( new CylinderGeometry( inner, inner, width * 0.9, 14, 1, true ).rotateZ( Math.PI / 2 ), RIM() );
	spinner.add( rim );
	const face = new Mesh( new CylinderGeometry( inner * 0.35, inner * 0.35, 0.02, 12 ).rotateZ( Math.PI / 2 ), DARK() );
	face.position.x = side * half * 0.6;
	spinner.add( face );
	for ( let i = 0; i < 5; i ++ ) {

		const spoke = new Mesh( new BoxGeometry( 0.012, inner * 1.9, 0.022 ), RIM() );
		spoke.rotation.x = i / 5 * Math.PI;
		spoke.position.x = side * half * 0.55;
		spinner.add( spoke );

	}

	return spinner;

}
