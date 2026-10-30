import { BackSide, BoxGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, Shape, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { BLACK, block, CHROME, DARK, driver, GLASS, HEADLIGHT, mat, merge, paint, profile, rod, TAILLIGHT, tube } from './parts.js';

// A sport hovercraft, drawn for World Drive (no real maker's craft): a pointed hull riding on a
// black rubber skirt, an open cockpit with a low windscreen and handlebars, and a big ducted fan at
// the back with rudders behind it. No wheels: it floats HOVER m over the ground, bobbing a little,
// over a soft shadow, so roads, grass and water are all the same to it. 4.2 m long and 2.1 m wide,
// 1.9 m tall to the top of the duct, on y = 0, facing -Z. The fan spins faster with the gas and
// the speed, and the rudders swing with the steering (onDrive).

const HOVER = 0.16;
const BODY_COLOUR = 0xffc21a;
// The fan's centre and size, and the rudders behind it.
const FAN = { y: 1.26, z: 1.52, radius: 0.7, depth: 0.5 };
const RUDDERS = [ - 0.4, 0, 0.4 ];
const RUDDER_LOCK = 0.55;

// Tuning (see drive.js specFor and HANDLING): nothing holds it to the ground, so it slides wide
// through every turn and slides on after it, turns at much the same rate whatever its speed,
// glides on with the gas off and takes a long way to stop; it floats down gently and bounces on
// its cushion of air.
export const HOVERCRAFT_DRIVE = {
	topSpeed: 135, accel: 6.5, brake: 3.5, reverse: 18,
	cab: { ahead: - 0.2, right: 0, up: 1.38 },
	handling: { grip: 1.4, slip: 1.1, driftYaw: [ 55, 120 ], turn: [ 105, 78 ], lock: 60, drag: 0.35, gravity: 0.9, launch: 0.9, air: 1.1, landTilt: 45, squash: 0.6, rebound: 0.3 },
};

export function makeHovercraft() {

	const craft = new Group();
	craft.name = 'Hovercraft';

	// Its shadow stays on the ground; everything else floats.
	const shadow = new Mesh( new CircleGeometry( 1, 28 ), new MeshBasicMaterial( { color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2 } ) );
	shadow.rotation.x = - Math.PI / 2;
	shadow.scale.set( 1.15, 2.2, 1 );
	shadow.position.y = 0.01;
	shadow.raycast = () => {};
	shadow.userData.noCollide = true;
	craft.add( shadow );

	const float = new Group();
	float.name = 'hover';
	float.position.y = HOVER;
	craft.add( float );
	const shell = new Group();
	float.add( shell );
	skirt( shell );
	hull( shell );
	cockpit( shell );
	duct( shell );
	driver( shell, { at: [ 0, 0.8, 0.25 ], hands: [ 0.3, 1.08, - 0.3 ], feet: - 0.5, suit: 0x16181d, helmet: 0xff3d6e, lean: 0.2 } );
	merge( shell );

	// The fan, spinning in its duct.
	const fan = new Group();
	fan.position.set( 0, FAN.y, FAN.z );
	float.add( fan );
	blades( fan );

	// Rudders, each turning about its front edge.
	const rudders = RUDDERS.map( x => {

		const rudder = new Group();
		rudder.position.set( x, FAN.y, FAN.z + FAN.depth / 2 + 0.08 );
		float.add( rudder );
		paint( block( rudder, trim(), [ 0.03, FAN.radius * 1.45, 0.3 ], [ 0, 0, 0.15 ] ), 'rim' );
		return rudder;

	} );

	craft.userData.decals = DECALS;
	craft.userData.decalParent = shell;
	let clock = 0;
	let spin = 0;
	let fanRate = 8;
	let lastSpeed = 0;
	let pitch = 0;
	craft.userData.onDrive = ( { steer, speed, dt, throttle = false } ) => {

		clock += dt;
		fanRate += ( ( throttle ? 40 : 14 ) + Math.abs( speed ) * 0.8 - fanRate ) * Math.min( 1, dt * 2 );
		spin = ( spin + fanRate * dt ) % ( Math.PI * 2 );
		fan.rotation.z = spin;
		for ( const rudder of rudders ) rudder.rotation.y = - steer * RUDDER_LOCK;
		// Bobbing on its cushion, nose up a touch as it speeds up and down as it slows.
		const accel = dt > 0 ? ( speed - lastSpeed ) / dt : 0;
		lastSpeed = speed;
		pitch += ( MathUtils.clamp( accel * 0.012, - 0.06, 0.06 ) - pitch ) * Math.min( 1, dt * 2 );
		float.position.y = HOVER + Math.sin( clock * 2.4 ) * 0.025 + Math.sin( clock * 5.3 ) * 0.008;
		float.rotation.x = pitch + Math.sin( clock * 1.7 ) * 0.01;
		float.rotation.z = Math.sin( clock * 1.3 ) * 0.012 - steer * 0.03;

	};

	return craft;

}

// Where the Garage's decals go (see paint.js): over the bow, along the bulwarks, and a number on
// the bow.
const DECALS = {
	top: { at: [ 0, 0.8, - 1.35 ], size: [ 0.5, 1.4, 0.7 ] },
	side: { at: [ 0.98, 0.71, 0.2 ], size: [ 3, 0.28, 0.4 ] },
	bonnet: { at: [ 0, 0.85, - 1.4 ], size: 0.4 },
};

function bodyPaint() {

	return mat( BODY_COLOUR, { roughness: 0.3, metalness: 0.2 } );

}

function trim() {

	return mat( 0xd5dbe1, { roughness: 0.3, metalness: 0.6 } );

}

// The hull's outline from above: square at the back, coming to a rounded point at the bow.
function outline( inset = 0 ) {

	const w = 0.98 - inset;
	const back = 1.95 - inset;
	const shoulder = - 0.9;
	const bow = - 2.05 + inset;
	// In plan, as [ x, z ] round from the back right.
	return [ [ w, back ], [ w, shoulder ], [ w * 0.8, - 1.55 ], [ w * 0.45, - 1.9 + inset * 0.5 ], [ 0, bow ], [ - w * 0.45, - 1.9 + inset * 0.5 ], [ - w * 0.8, - 1.55 ], [ - w, shoulder ], [ - w, back ] ];

}

// The skirt: a fat black tube round the hull, a little flattened, its bottom just over the ground.
function skirt( parent ) {

	const points = outline( 0.12 ).map( ( [ x, z ] ) => new Vector3( x * 1.04, 0.2, z * 1.02 ) );
	const curve = new CatmullRomCurve3( points, true, 'centripetal' );
	const rubber = new Mesh( new TubeGeometry( curve, 56, 0.22, 7, true ), mat( 0x1c1e21, { roughness: 0.75 } ) );
	rubber.scale.y = 0.85;
	parent.add( rubber );

}

// The hull: a deck pushed up from the outline, with bulwarks along its sides and a rub rail.
function hull( parent ) {

	const shape = new Shape();
	outline().forEach( ( [ x, z ], i ) => i ? shape.lineTo( x, - z ) : shape.moveTo( x, - z ) );
	const deck = new ExtrudeGeometry( shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 } );
	// Shape y is forward; the depth goes up.
	deck.rotateX( - Math.PI / 2 );
	deck.translate( 0, 0.33, 0 );
	parent.add( paint( new Mesh( deck, bodyPaint() ) ) );
	// Bulwarks down each side, sloping down to the bow.
	for ( const side of [ - 1, 1 ] ) {

		const x0 = side > 0 ? 0.8 : - 0.98;
		paint( profile( parent, bodyPaint(), [ [ - 1.55, 0.55 ], [ - 1.2, 0.86 ], [ 1.9, 0.86 ], [ 1.94, 0.55 ] ], x0, x0 + 0.18, { bevel: 0.03 } ) );

	}

	block( parent, BLACK(), [ 1.96, 0.05, 0.08 ], [ 0, 0.56, 1.98 ] );
	// Lights: two on the bow, two at the back.
	for ( const side of [ - 1, 1 ] ) {

		block( parent, HEADLIGHT(), [ 0.22, 0.07, 0.05 ], [ side * 0.38, 0.62, - 1.86 ], [ 0, side * 0.5, 0 ] );
		block( parent, TAILLIGHT(), [ 0.16, 0.08, 0.04 ], [ side * 0.88, 0.76, 1.96 ] );

	}

}

// The cockpit: a cowl over the bow with a windscreen, a saddle seat, and handlebars on a column.
function cockpit( parent ) {

	paint( profile( parent, bodyPaint(), [ [ - 1.95, 0.52 ], [ - 1.05, 0.82 ], [ - 0.72, 0.92 ], [ - 0.62, 0.86 ], [ - 0.62, 0.55 ] ], - 0.72, 0.72, { bevel: 0.04, segments: 2, warp: v => {

		v.x *= 1 - MathUtils.smoothstep( v.z, - 1.0, - 2.0 ) * 0.45;

	} } ) );
	const screen = profile( parent, GLASS(), [ [ - 0.74, 0.9 ], [ - 0.5, 1.22 ], [ - 0.46, 1.2 ], [ - 0.66, 0.88 ] ], - 0.6, 0.6, { bevel: 0.01 } );
	screen.name = 'windscreen';
	// The saddle, its back, and the floor round it.
	block( parent, BLACK(), [ 0.5, 0.2, 1.0 ], [ 0, 0.7, 0.25 ] );
	block( parent, BLACK(), [ 0.6, 0.35, 0.12 ], [ 0, 0.95, 0.82 ], [ 0.2, 0, 0 ] );
	block( parent, DARK(), [ 1.55, 0.04, 2.3 ], [ 0, 0.59, 0.3 ] );
	// The engine's housing behind the seat, under the duct.
	paint( profile( parent, bodyPaint(), [ [ 0.86, 0.58 ], [ 0.95, 0.88 ], [ 1.3, 0.98 ], [ 1.9, 0.98 ], [ 1.9, 0.58 ] ], - 0.62, 0.62, { bevel: 0.04, segments: 2 } ) );
	// Handlebars on a column.
	tube( parent, [ 0, 0.62, - 0.5 ], [ 0, 1.05, - 0.34 ], 0.035, DARK() );
	tube( parent, [ - 0.34, 1.07, - 0.3 ], [ 0.34, 1.07, - 0.3 ], 0.022, CHROME() );
	for ( const side of [ - 1, 1 ] ) rod( parent, BLACK(), 0.03, 0.12, 'x', [ side * 0.33, 1.07, - 0.3 ], 8 );

}

// The fan's duct: a ring standing on the housing, a guard across its front, and struts to the deck.
function duct( parent ) {

	const { y, z, radius, depth } = FAN;
	const ring = paint( new Mesh( new CylinderGeometry( radius, radius, depth, 28, 1, true ).rotateX( Math.PI / 2 ), trim() ), 'rim' );
	ring.position.set( 0, y, z );
	parent.add( ring );
	// The inside, dark, so it isn't see-through from behind.
	const lining = new Mesh( new CylinderGeometry( radius - 0.02, radius - 0.02, depth, 28, 1, true ).rotateX( Math.PI / 2 ), mat( 0x2a2d31, { roughness: 0.6, side: BackSide } ) );
	lining.position.set( 0, y, z );
	parent.add( lining );
	for ( const end of [ - 1, 1 ] ) {

		const lip = paint( new Mesh( new TorusGeometry( radius, 0.05, 5, 28 ), trim() ), 'rim' );
		lip.position.set( 0, y, z + end * depth / 2 );
		parent.add( lip );

	}

	// The guard: two rings and a cross over the front of the duct.
	for ( const r of [ radius * 0.45, radius * 0.8 ] ) {

		const guard = new Mesh( new TorusGeometry( r, 0.012, 3, 24 ), CHROME() );
		guard.position.set( 0, y, z - depth / 2 - 0.02 );
		parent.add( guard );

	}

	block( parent, CHROME(), [ radius * 2, 0.025, 0.025 ], [ 0, y, z - depth / 2 - 0.02 ] );
	block( parent, CHROME(), [ 0.025, radius * 2, 0.025 ], [ 0, y, z - depth / 2 - 0.02 ] );
	// Struts from the housing to the duct's sides.
	for ( const side of [ - 1, 1 ] ) tube( parent, [ side * 0.5, 0.95, z - 0.1 ], [ side * radius * 0.95, y - 0.2, z ], 0.04, DARK() );

}

// Six blades round a hub, pitched like a propeller's.
function blades( fan ) {

	rod( fan, DARK(), 0.1, 0.22, 'z', [ 0, 0, 0 ], 12 );
	for ( let i = 0; i < 6; i ++ ) {

		const blade = new Mesh( new BoxGeometry( 0.13, FAN.radius * 0.86, 0.025 ), mat( 0x30343a, { roughness: 0.5, metalness: 0.4 } ) );
		const angle = i / 6 * Math.PI * 2;
		blade.position.set( Math.sin( angle ) * FAN.radius * 0.47, Math.cos( angle ) * FAN.radius * 0.47, 0 );
		blade.rotation.set( 0, 0.5, - angle, 'ZYX' );
		fan.add( blade );

	}

	merge( fan );

}
