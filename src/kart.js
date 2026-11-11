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

// A go-kart drawn in code: a tubular steel frame, four wide tyres on six-spoke rims, rounded
// bodywork in bright paint (a wide front spoiler, a nose narrowing to the front, a shield with a
// number plate, side pods with a scoop and a swoosh, a rear bumper with fins), a moulded seat, a
// butterfly steering wheel, an engine beside the seat with its airbox, chain and exhaust, and a
// driver in a striped suit, a harness and a helmet with a visor. About 1.6 m long and 1.2 m wide, standing on y = 0 with its
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

const PAINT = () => mat( 0xff4a1c, { roughness: 0.3, metalness: 0.1 } );
const TRIM = () => mat( 0xffd21f, { roughness: 0.35 } );
const ACCENT = () => mat( 0xf2f4f6, { roughness: 0.5 } );
const STEEL = () => mat( 0xc3c9cf, { roughness: 0.25, metalness: 0.85 } );
const ALLOY = () => mat( 0x9aa1a8, { roughness: 0.4, metalness: 0.7 } );
const DARK = () => mat( 0x24272b, { roughness: 0.6, metalness: 0.3 } );
const CARBON = () => mat( 0x16181b, { roughness: 0.35, metalness: 0.25 } );
const SEAT = () => mat( 0x1b1d21, { roughness: 0.75 } );
const RUBBER = () => mat( 0x141516, { roughness: 0.92 } );
const LETTERING = () => mat( 0xd9dde1, { roughness: 0.8 } );
const RIM = () => mat( 0xe9edf1, { roughness: 0.22, metalness: 0.75 } );
const SUIT = () => mat( 0x1f5cff, { roughness: 0.65 } );
const GLOVE = () => mat( 0x202226, { roughness: 0.8 } );
const HELMET = () => mat( 0xf6f7f8, { roughness: 0.2, metalness: 0.1 } );
const VISOR = () => mat( 0x16263e, { roughness: 0.04, metalness: 0.9 } );

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

	// What World Drive's Garage repaints (src/drive-app/paint.js): the bodywork (and the stripe on
	// the helmet, tagged where it's made) and the rims; and where its decals go, on the nose and the
	// side pods.
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

// A side profile (a shape in [ z, y ], or its points) extruded across x, with rounded edges,
// between x0 and x1.
function panel( parent, material, profile, x0, x1, bevel = 0.02 ) {

	const shape = Array.isArray( profile ) ? new Shape( profile.map( ( [ z, y ] ) => new Vector2( z, y ) ) ) : profile;
	const depth = Math.max( 0.001, x1 - x0 - bevel * 2 );
	const geometry = new ExtrudeGeometry( shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 } );
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

	// The front spoiler: a wide, flat fairing ahead of the front wheels, rounded at its ends, its top
	// sloping down toward the front.
	const spoiler = plan( kart, PAINT(), roundedOutline( 0.47, 0.08, 0.07 ), 0.045, 0.14, - 0.735, 0.02 );
	slope( spoiler, z => z < - 0.735 ? ( z + 0.735 ) * 0.55 : 0 );
	// Its dark lip underneath.
	plan( kart, CARBON(), roundedOutline( 0.45, 0.065, 0.06 ), 0.03, 0.05, - 0.74, 0.01 );

	// The nose between the front wheels, rising from the spoiler to the front panel, narrower at
	// the front.
	const nose = panel( kart, PAINT(), curve( [ [ - 0.7, 0.07 ], [ - 0.7, 0.13 ], [ - 0.62, 0.2, - 0.68, 0.19 ], [ - 0.42, 0.235, - 0.5, 0.235 ], [ - 0.4, 0.07 ] ] ), - 0.3, 0.3, 0.025 );
	taper( nose, z => 0.78 + 0.22 * clamp( ( z + 0.7 ) / 0.28 ) );

	// The front panel, a shield rising to the steering column, narrower at the top, with a number
	// plate on it.
	const shield = panel( kart, PAINT(), curve( [ [ - 0.5, 0.12 ], [ - 0.455, 0.41, - 0.49, 0.3 ], [ - 0.42, 0.425 ], [ - 0.395, 0.14 ] ] ), - 0.22, 0.22, 0.015 );
	widen( shield, y => 1 - 0.3 * clamp( ( y - 0.15 ) / 0.27 ) );
	const face = new Group();
	face.position.set( 0, 0.28, - 0.503 );
	face.rotation.x = 0.16;
	kart.add( face );
	const plate = new Mesh( new ExtrudeGeometry( rounded( 0.21, 0.15, 0.035 ), { depth: 0.008, bevelEnabled: false, curveSegments: 6 } ), TRIM() );
	face.add( plate );
	const disc = new Mesh( new CylinderGeometry( 0.05, 0.05, 0.004, 24 ).rotateX( Math.PI / 2 ), ACCENT() );
	disc.position.z = - 0.002;
	face.add( disc );

	// Side pods between the wheels: a scoop in front, a rounded top sweeping back, and a stripe
	// along each.
	for ( const side of [ - 1, 1 ] ) {

		const x0 = side > 0 ? 0.34 : - 0.595;
		const pod = panel( kart, PAINT(), curve( [ [ - 0.3, 0.07 ], [ - 0.3, 0.13 ], [ - 0.2, 0.225, - 0.28, 0.21 ], [ 0.22, 0.245, 0.02, 0.25 ], [ 0.33, 0.2, 0.32, 0.24 ], [ 0.33, 0.07 ] ] ), x0, x0 + 0.255, 0.025 );
		pod.name = 'side-pod';
		// Tucked in toward the frame at the front, as the scoop is.
		taper( pod, z => 1, ( x, z ) => side * x > 0.5 ? x - side * 0.06 * clamp( ( - 0.12 - z ) / 0.18 ) : x );
		// The stripe: a swoosh on the outside, from low at the front to high at the back.
		const swoosh = new Mesh( new ExtrudeGeometry( curve( [ [ - 0.26, 0.12 ], [ 0.3, 0.19, 0.0, 0.13 ], [ 0.31, 0.215 ], [ - 0.2, 0.15, 0.02, 0.17 ] ] ), { depth: 0.004, bevelEnabled: false, curveSegments: 10 } ).rotateY( - Math.PI / 2 ), TRIM() );
		swoosh.position.x = side * 0.597;
		if ( side < 0 ) swoosh.scale.x = - 1;
		kart.add( swoosh );
		// A dark intake in the scoop.
		block( kart, CARBON(), [ 0.12, 0.05, 0.01 ], [ side * 0.46, 0.13, - 0.315 ] );

	}

	// The rear bumper behind the wheels, full width, rounded, with a dark step and two small fins.
	panel( kart, PAINT(), curve( [ [ 0.645, 0.075 ], [ 0.655, 0.17, 0.645, 0.14 ], [ 0.715, 0.215, 0.665, 0.21 ], [ 0.78, 0.185, 0.775, 0.215 ], [ 0.785, 0.075 ] ] ), - 0.56, 0.56, 0.025 );
	for ( const side of [ - 1, 1 ] ) panel( kart, PAINT(), curve( [ [ 0.665, 0.2 ], [ 0.695, 0.268, 0.675, 0.26 ], [ 0.775, 0.2 ] ] ), side * 0.5 - 0.012, side * 0.5 + 0.012, 0.006 );
	// On its back: a stripe, a dark diffuser along the bottom and two red reflectors.
	block( kart, TRIM(), [ 0.86, 0.02, 0.006 ], [ 0, 0.17, 0.81 ] );
	block( kart, CARBON(), [ 0.96, 0.04, 0.012 ], [ 0, 0.075, 0.806 ] );
	for ( const side of [ - 1, 1 ] ) {

		const reflector = new Mesh( new CylinderGeometry( 0.028, 0.028, 0.006, 18 ).rotateX( Math.PI / 2 ), mat( 0xd8231b, { roughness: 0.3, emissive: 0x4a0703 } ) );
		reflector.position.set( side * 0.36, 0.125, 0.808 );
		kart.add( reflector );

	}

}

function seatAndControls( kart ) {

	// A moulded seat: the shell is a lathe turned on its side and cut open at the front.
	const profile = [ [ 0.02, - 0.2 ], [ 0.15, - 0.19 ], [ 0.19, - 0.1 ], [ 0.2, 0.05 ], [ 0.19, 0.2 ], [ 0.175, 0.27 ] ].map( ( [ r, y ] ) => new Vector2( r, y ) );
	const shell = new Mesh( new LatheGeometry( profile, 20, Math.PI * 0.5, Math.PI ), SEAT() );
	shell.rotation.x = - 0.35;
	shell.position.set( 0, 0.3, 0.3 );
	kart.add( shell );
	block( kart, SEAT(), [ 0.34, 0.04, 0.3 ], [ 0, 0.12, 0.2 ] );

	// Steering column and a butterfly wheel, leaning back toward the driver: two grips on a dark
	// plate, a hub in the trim colour.
	const column = tube( kart, [ 0, 0.08, - 0.42 ], [ 0, 0.42, - 0.2 ], 0.012, CARBON() );
	column.name = 'steering-column';
	const steering = new Group();
	steering.position.set( 0, 0.44, - 0.18 );
	steering.rotation.x = - 1.0;
	kart.add( steering );
	const plate = new Mesh( new ExtrudeGeometry( rounded( 0.2, 0.08, 0.035 ), { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 6 } ).rotateX( Math.PI / 2 ), CARBON() );
	plate.position.y = - 0.006;
	steering.add( plate );
	for ( const side of [ - 1, 1 ] ) {

		const grip = new Mesh( new TorusGeometry( 0.115, 0.018, 8, 14, Math.PI * 0.55 ), GLOVE() );
		grip.rotation.set( Math.PI / 2, 0, side > 0 ? - Math.PI * 0.275 : Math.PI * 0.725 );
		steering.add( grip );

	}

	const hub = new Mesh( new CylinderGeometry( 0.03, 0.03, 0.03, 16 ), TRIM() );
	steering.add( hub );

	// Pedals.
	for ( const x of [ - 0.08, 0.08 ] ) block( kart, STEEL(), [ 0.05, 0.1, 0.015 ], [ x, 0.13, - 0.6 ] ).rotation.x = 0.4;

}

function engine( kart ) {

	// A single-cylinder engine beside the seat, on the right, driving the rear axle by chain.
	const x = 0.31;
	const crankcase = new Mesh( new CapsuleGeometry( 0.075, 0.09, 4, 12 ).rotateX( Math.PI / 2 ), ALLOY() );
	crankcase.position.set( x, 0.2, 0.42 );
	kart.add( crankcase );
	// The cylinder with its cooling fins, and a spark plug's red cap on top.
	for ( let i = 0; i < 6; i ++ ) {

		const fin = new Mesh( new CylinderGeometry( 0.07, 0.07, 0.01, 16 ), ALLOY() );
		fin.position.set( x, 0.27 + i * 0.02, 0.4 );
		kart.add( fin );

	}

	const barrel = new Mesh( new CylinderGeometry( 0.045, 0.045, 0.12, 12 ), DARK() );
	barrel.position.set( x, 0.32, 0.4 );
	kart.add( barrel );
	const plug = new Mesh( new CapsuleGeometry( 0.016, 0.03, 2, 8 ), mat( 0xd22a1e, { roughness: 0.5 } ) );
	plug.position.set( x, 0.41, 0.4 );
	kart.add( plug );
	// The airbox: a rounded dark box out to the side, with a trim band.
	const airbox = new Mesh( new CapsuleGeometry( 0.055, 0.12, 4, 12 ).rotateX( Math.PI / 2 ), CARBON() );
	airbox.position.set( x + 0.12, 0.28, 0.3 );
	kart.add( airbox );
	const band = new Mesh( new CylinderGeometry( 0.057, 0.057, 0.03, 16 ).rotateX( Math.PI / 2 ), TRIM() );
	band.position.set( x + 0.12, 0.28, 0.3 );
	kart.add( band );
	// Chain guard down to the axle, the sprocket on the axle inside it.
	block( kart, CARBON(), [ 0.02, 0.18, 0.2 ], [ x - 0.02, 0.14, REAR_AXLE ] );
	const sprocket = new Mesh( new CylinderGeometry( 0.085, 0.085, 0.008, 24 ).rotateZ( Math.PI / 2 ), STEEL() );
	sprocket.position.set( x - 0.045, REAR_TYRE.radius, REAR_AXLE );
	kart.add( sprocket );
	// The brake disc on the other side, by the seat.
	const brake = new Mesh( new CylinderGeometry( 0.075, 0.075, 0.008, 24 ).rotateZ( Math.PI / 2 ), STEEL() );
	brake.position.set( - 0.25, REAR_TYRE.radius, REAR_AXLE );
	kart.add( brake );
	block( kart, TRIM(), [ 0.03, 0.05, 0.05 ], [ - 0.25, REAR_TYRE.radius + 0.06, REAR_AXLE - 0.02 ] );
	// Exhaust: a bent header to a silencer behind the engine, a heat shield over it.
	bent( kart, [ [ x, 0.33, 0.36 ], [ x + 0.08, 0.36, 0.26 ], [ x + 0.17, 0.33, 0.32 ], [ x + 0.17, 0.3, 0.48 ] ], 0.018, STEEL(), 16 );
	const silencer = new Mesh( new CapsuleGeometry( 0.048, 0.18, 4, 14 ).rotateX( Math.PI / 2 ), STEEL() );
	silencer.position.set( x + 0.17, 0.3, 0.6 );
	kart.add( silencer );
	const shield = new Mesh( new CylinderGeometry( 0.054, 0.054, 0.14, 14, 1, true, - Math.PI * 0.6, Math.PI * 1.2 ).rotateX( Math.PI / 2 ), CARBON() );
	shield.position.set( x + 0.17, 0.3, 0.58 );
	kart.add( shield );
	const tip = new Mesh( new CylinderGeometry( 0.022, 0.026, 0.05, 12, 1, true ).rotateX( Math.PI / 2 ), DARK() );
	tip.position.set( x + 0.17, 0.3, 0.72 );
	kart.add( tip );

}

// The driver, sitting back in the seat with hands on the wheel: a race suit with a stripe across
// the chest and down each arm and leg, a harness, boots and gloves, and a helmet with a tinted
// visor and a stripe in the kart's paint. Returns the head, for hiding.
function driver( kart ) {

	const body = new Group();
	kart.add( body );
	// Torso, leaning back with the seat: broader at the shoulders than it's deep.
	const torso = new Mesh( new CapsuleGeometry( 0.14, 0.22, 4, 14 ), SUIT() );
	torso.position.set( 0, 0.48, 0.24 );
	torso.rotation.x = - 0.3;
	torso.scale.set( 1.12, 1, 0.82 );
	body.add( torso );
	const chest = new Mesh( new CylinderGeometry( 0.143, 0.143, 0.04, 18, 1, true ), ACCENT() );
	chest.position.set( 0, 0.52, 0.225 );
	chest.rotation.x = - 0.3;
	chest.scale.set( 1.12, 1, 0.82 );
	body.add( chest );
	// The harness: two straps over the shoulders.
	for ( const side of [ - 1, 1 ] ) {

		const strap = new Mesh( new BoxGeometry( 0.035, 0.22, 0.012 ), CARBON() );
		strap.position.set( side * 0.065, 0.49, 0.118 );
		strap.rotation.x = - 0.3;
		body.add( strap );

	}

	for ( const side of [ - 1, 1 ] ) {

		// Legs out along the floor to the pedals, a stripe down each, and boots.
		limb( body, [ side * 0.09, 0.22, 0.14 ], [ side * 0.1, 0.27, - 0.2 ], 0.062, SUIT() );
		limb( body, [ side * 0.1, 0.27, - 0.2 ], [ side * 0.085, 0.17, - 0.5 ], 0.052, SUIT() );
		limb( body, [ side * 0.15, 0.24, 0.1 ], [ side * 0.155, 0.285, - 0.18 ], 0.012, ACCENT() );
		const boot = new Mesh( new CapsuleGeometry( 0.045, 0.06, 3, 8 ).rotateX( Math.PI / 2 - 0.3 ), CARBON() );
		boot.position.set( side * 0.08, 0.15, - 0.57 );
		body.add( boot );
		// Arms from the shoulders to the grips, a stripe along each, and gloves.
		limb( body, [ side * 0.17, 0.6, 0.18 ], [ side * 0.15, 0.45, - 0.02 ], 0.044, SUIT() );
		limb( body, [ side * 0.15, 0.45, - 0.02 ], [ side * 0.115, 0.47, - 0.14 ], 0.04, SUIT() );
		limb( body, [ side * 0.205, 0.6, 0.17 ], [ side * 0.185, 0.46, - 0.01 ], 0.01, ACCENT() );
		const glove = new Mesh( new SphereGeometry( 0.04, 10, 8 ), GLOVE() );
		glove.scale.set( 1, 0.85, 1.25 );
		glove.position.set( side * 0.11, 0.47, - 0.16 );
		body.add( glove );

	}

	// The helmet, on a neck with a collar.
	const head = new Group();
	head.position.set( 0, 0.86, 0.2 );
	body.add( head );
	limb( head, [ 0, - 0.18, 0.04 ], [ 0, - 0.06, 0.01 ], 0.05, SUIT() );
	const collar = new Mesh( new TorusGeometry( 0.06, 0.018, 8, 18 ), CARBON() );
	collar.rotation.x = Math.PI / 2 - 0.2;
	collar.position.set( 0, - 0.12, 0.02 );
	head.add( collar );
	const shell = new Mesh( new SphereGeometry( 0.13, 24, 16 ), HELMET() );
	shell.scale.set( 1, 0.97, 1.08 );
	head.add( shell );
	// Facing -Z, the front: SphereGeometry's phi of 1.5 pi points there. The visor, a band across
	// the front, and the chin bar under it.
	const visor = new Mesh( new SphereGeometry( 0.134, 24, 8, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.36, Math.PI * 0.22 ), VISOR() );
	visor.scale.set( 1, 0.97, 1.08 );
	head.add( visor );
	// The stripe, over the top front to back, in the kart's paint.
	const stripe = new Mesh( new TorusGeometry( 0.128, 0.013, 6, 32, Math.PI * 0.9 ), PAINT() );
	stripe.rotation.y = Math.PI / 2;
	stripe.scale.set( 1, 0.97, 1.08 );
	// (Painted with the bodywork in the Garage, see makeKart.)
	stripe.userData.paint = 'body';
	head.add( stripe );
	return head;

}

function limb( parent, a, b, radius, material ) {

	const start = new Vector3( ...a );
	const end = new Vector3( ...b );
	const length = start.distanceTo( end );
	const mesh = new Mesh( new CapsuleGeometry( radius, length, 3, 10 ), material );
	mesh.position.copy( start ).add( end ).multiplyScalar( 0.5 );
	mesh.quaternion.setFromUnitVectors( new Vector3( 0, 1, 0 ), end.sub( start ).normalize() );
	parent.add( mesh );
	return mesh;

}

// A tyre with a rounded shoulder, a pale ring on its sidewall, on a rim with a lip and six spokes
// round a hub nut, facing out on `side`; returns the part that spins.
function wheel( parent, { radius, width }, side ) {

	const spinner = new Group();
	parent.add( spinner );
	const half = width / 2;
	const inner = radius * 0.62;
	const shoulder = 0.032;
	// Profile in [ r, x ] from the inner bead round the tread to the outer bead, turned about the axle.
	const points = [
		[ inner, - half ], [ radius - shoulder, - half ], [ radius - shoulder * 0.45, - half + shoulder * 0.15 ], [ radius - shoulder * 0.12, - half + shoulder * 0.55 ], [ radius, - half + shoulder ],
		[ radius, half - shoulder ], [ radius - shoulder * 0.12, half - shoulder * 0.55 ], [ radius - shoulder * 0.45, half - shoulder * 0.15 ], [ radius - shoulder, half ], [ inner, half ],
	].map( ( [ r, x ] ) => new Vector2( r, x ) );
	const tyre = new Mesh( new LatheGeometry( points, 28 ).rotateZ( Math.PI / 2 ), RUBBER() );
	spinner.add( tyre );
	// The sidewall's ring, as a maker's lettering would be from a distance.
	const ring = new Mesh( new TorusGeometry( ( inner + radius ) / 2, 0.0035, 4, 36 ).rotateY( Math.PI / 2 ), LETTERING() );
	ring.position.x = side * ( half - 0.003 );
	spinner.add( ring );
	// Rim: a barrel with a lip on the outer face, six spokes, and a hub nut in the trim colour.
	const rim = new Mesh( new CylinderGeometry( inner, inner, width * 0.9, 20, 1, true ).rotateZ( Math.PI / 2 ), RIM() );
	spinner.add( rim );
	const lip = new Mesh( new TorusGeometry( inner * 0.97, 0.006, 6, 24 ).rotateY( Math.PI / 2 ), RIM() );
	lip.position.x = side * half * 0.88;
	spinner.add( lip );
	const face = new Mesh( new CylinderGeometry( inner * 0.3, inner * 0.34, 0.025, 16 ).rotateZ( side * Math.PI / 2 ), DARK() );
	face.position.x = side * half * 0.6;
	spinner.add( face );
	const nut = new Mesh( new CylinderGeometry( inner * 0.14, inner * 0.14, 0.02, 6 ).rotateZ( Math.PI / 2 ), TRIM() );
	nut.position.x = side * ( half * 0.6 + 0.012 );
	spinner.add( nut );
	for ( let i = 0; i < 6; i ++ ) {

		const spoke = new Mesh( new BoxGeometry( 0.012, inner * 0.72, 0.018 ), RIM() );
		spoke.geometry.translate( 0, inner * 0.5, 0 );
		spoke.rotation.x = i / 6 * Math.PI * 2;
		spoke.position.x = side * half * 0.62;
		spinner.add( spoke );

	}

	return spinner;

}

// --- shaping ----------------------------------------------------------------------------------

// A closed outline through points [ a, b ]; a point with four numbers [ a, b, ca, cb ] is reached
// by a curve bent toward ( ca, cb ).
function curve( points ) {

	const shape = new Shape();
	shape.moveTo( points[ 0 ][ 0 ], points[ 0 ][ 1 ] );
	for ( const [ a, b, ca, cb ] of points.slice( 1 ) ) {

		if ( ca === undefined ) shape.lineTo( a, b );
		else shape.quadraticCurveTo( ca, cb, a, b );

	}

	shape.closePath();
	return shape;

}

// A rectangle w × h with corners rounded by r, centred on the origin.
function rounded( w, h, r ) {

	const x = w / 2;
	const y = h / 2;
	return curve( [ [ - x + r, - y ], [ x - r, - y ], [ x, - y + r, x, - y ], [ x, y - r ], [ x - r, y, x, y ], [ - x + r, y ], [ - x, y - r, - x, y ], [ - x, - y + r ], [ - x + r, - y, - x, - y ] ] );

}

// An outline seen from above, as [ x, z ] in a shape's [ x, y ]: half-width w and half-depth d
// round 0, its ends rounded by r.
function roundedOutline( w, d, r ) {

	return rounded( w * 2, d * 2, r );

}

// A shape seen from above (see roundedOutline) made solid between heights y0 and y1, its middle at
// z, with rounded edges.
function plan( parent, material, shape, y0, y1, z, bevel = 0.02 ) {

	const depth = Math.max( 0.001, y1 - y0 - bevel * 2 );
	const geometry = new ExtrudeGeometry( shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 8 } );
	// The shape's y is -z; the extrusion goes up.
	geometry.rotateX( - Math.PI / 2 );
	geometry.translate( 0, y0 + bevel, z );
	const mesh = new Mesh( geometry, material );
	parent.add( mesh );
	return mesh;

}

// Move a mesh's top down by drop( z ) (m, at its points' z), its bottom kept: for a slope.
function slope( mesh, drop ) {

	const position = mesh.geometry.attributes.position;
	mesh.geometry.computeBoundingBox();
	const { min, max } = mesh.geometry.boundingBox;
	for ( let i = 0; i < position.count; i ++ ) {

		const share = ( position.getY( i ) - min.y ) / ( max.y - min.y );
		position.setY( i, position.getY( i ) + drop( position.getZ( i ) ) * share );

	}

	mesh.geometry.computeVertexNormals();

}

// Narrow a mesh across (x) by width( z ), about its middle; or move each point's x by move( x, z ).
function taper( mesh, width, move = null ) {

	const position = mesh.geometry.attributes.position;
	mesh.geometry.computeBoundingBox();
	const middle = ( mesh.geometry.boundingBox.min.x + mesh.geometry.boundingBox.max.x ) / 2;
	for ( let i = 0; i < position.count; i ++ ) {

		const x = position.getX( i );
		const z = position.getZ( i );
		position.setX( i, move ? move( x, z ) : middle + ( x - middle ) * width( z ) );

	}

	mesh.geometry.computeVertexNormals();

}

// Narrow a mesh across (x) by width( y ), about its middle: narrower toward the top.
function widen( mesh, width ) {

	const position = mesh.geometry.attributes.position;
	for ( let i = 0; i < position.count; i ++ ) position.setX( i, position.getX( i ) * width( position.getY( i ) ) );
	mesh.geometry.computeVertexNormals();

}

function clamp( t ) {

	return Math.max( 0, Math.min( 1, t ) );

}
