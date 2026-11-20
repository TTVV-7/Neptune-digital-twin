import { AdditiveBlending, CircleGeometry, ConeGeometry, DoubleSide, Group, LatheGeometry, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { block, CHROME, DARK, driver, GLASS, mat, merge, paint, rod } from './parts.js';

// A flying saucer, drawn for World Drive: a classic disc with a glass dome on top and a pilot in
// it, a ring of lights round its rim and three landing pods under it. No wheels: it floats HOVER m
// up over a soft shadow, so roads, grass and water are all the same to it (it `floats`, as the
// hovercraft does, and throws up spray over water). 4.6 m across and 1.9 m tall, its bottom
// HOVER m over y = 0, facing -Z. As it goes (onDrive): the rim ring turns with the speed, its lights
// chase round it faster with the gas, it banks into turns and dips its nose as it speeds up, bobs
// as it hovers, and a tractor beam glows down from under it while it's slow, fading as it speeds up.

const HOVER = 0.5;
const RADIUS = 2.3;
const BODY_COLOUR = 0xb7c2cc;
const LIGHTS = 16;

// Tuning (see drive.js specFor and HANDLING): quick, and nothing holds it to the ground: it slides
// through turns and turns at much the same rate whatever its speed, glides on with the gas off,
// floats down gently and takes ramps for a long ride.
export const SAUCER_DRIVE = {
	topSpeed: 170, accel: 9, brake: 6, reverse: 25, floats: true,
	cab: { ahead: 0, right: 0, up: HOVER + 1.45 },
	handling: { grip: 2.2, slip: 1.2, driftYaw: [ 50, 115 ], turn: [ 120, 90 ], lock: 60, drag: 0.4, gravity: 0.65, launch: 1.1, air: 1.3, landTilt: 50, squash: 0.5, rebound: 0.35 },
};

export function makeSaucer() {

	const saucer = new Group();
	saucer.name = 'Flying saucer';

	// Its shadow stays on the ground, and the beam reaches down to it; everything else floats.
	const shadow = new Mesh( new CircleGeometry( RADIUS * 0.85, 32 ), new MeshBasicMaterial( { color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2 } ) );
	shadow.rotation.x = - Math.PI / 2;
	shadow.position.y = 0.01;
	ignore( shadow );
	saucer.add( shadow );

	const float = new Group();
	float.name = 'hover';
	float.position.y = HOVER;
	saucer.add( float );
	const shell = new Group();
	float.add( shell );
	hull( shell );
	pods( shell );
	driver( shell, { at: [ 0, 0.62, 0.15 ], hands: [ 0.22, 0.86, - 0.3 ], feet: - 0.35, suit: 0x2a2e36, helmet: 0x7fe8c4, visor: 0x0c1218, lean: 0.1 } );
	// The pilot's column and yoke.
	rod( shell, DARK(), 0.03, 0.3, 'y', [ 0, 0.7, - 0.35 ], 8 );
	block( shell, DARK(), [ 0.5, 0.04, 0.05 ], [ 0, 0.86, - 0.32 ] );
	merge( shell );

	// The glass dome over the pilot, on its own: see-through, so the cab view hides it.
	const dome = new Mesh( new SphereGeometry( 0.95, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2 ), GLASS() );
	dome.scale.y = 0.85;
	dome.position.y = 0.55;
	dome.name = 'dome';
	float.add( dome );

	// The rim ring and its lights, turning. Each light has its own material, so they chase.
	const ring = new Group();
	ring.position.y = 0.3;
	float.add( ring );
	const band = paint( new Mesh( new TorusGeometry( RADIUS - 0.05, 0.09, 8, 48 ).rotateX( Math.PI / 2 ), mat( 0xd5dbe1, { roughness: 0.25, metalness: 0.75 } ) ), 'rim' );
	ring.add( band );
	const lights = [];
	for ( let i = 0; i < LIGHTS; i ++ ) {

		const angle = i / LIGHTS * Math.PI * 2;
		const hue = i % 2 ? 0x7fe8ff : 0xff5cf0;
		const light = new Mesh( new SphereGeometry( 0.075, 10, 6 ), new MeshStandardMaterial( { color: hue, emissive: hue, emissiveIntensity: 0.5, roughness: 0.2 } ) );
		light.position.set( Math.sin( angle ) * ( RADIUS + 0.04 ), 0, Math.cos( angle ) * ( RADIUS + 0.04 ) );
		ring.add( light );
		lights.push( light.material );

	}

	// The glow under it and the tractor beam down to the ground: drawn added to what's behind,
	// never in the way of anything.
	const underGlow = new MeshBasicMaterial( { color: 0x7fe8ff, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false } );
	const glow = new Mesh( new CircleGeometry( 0.7, 24 ), underGlow );
	glow.rotation.x = Math.PI / 2;
	glow.position.y = - 0.01;
	ignore( glow );
	float.add( glow );
	const beamMaterial = new MeshBasicMaterial( { color: 0x9ff3ff, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide } );
	const beam = new Mesh( new ConeGeometry( 1.25, 1, 28, 1, true ).translate( 0, 0.5, 0 ), beamMaterial );
	beam.name = 'beam';
	ignore( beam );
	saucer.add( beam );

	saucer.userData.decals = DECALS;
	saucer.userData.decalParent = shell;
	let clock = 0;
	let spin = 0;
	let chase = 0;
	let chaseRate = 2;
	let lastSpeed = 0;
	let pitch = 0;
	let bank = 0;
	let beamOn = 1;
	saucer.userData.onDrive = ( { steer, speed, dt, throttle = false, airborne = false } ) => {

		clock += dt;
		spin = ( spin + ( 0.6 + Math.abs( speed ) * 0.12 ) * dt ) % ( Math.PI * 2 );
		ring.rotation.y = spin;
		// Its lights chasing round: a bright head with a fading tail, quicker with the gas.
		chaseRate += ( ( throttle ? 14 : 5 ) - chaseRate ) * Math.min( 1, dt * 3 );
		chase = ( chase + chaseRate * dt ) % LIGHTS;
		lights.forEach( ( light, i ) => {

			const behind = ( chase - i + LIGHTS ) % LIGHTS;
			light.emissiveIntensity = 0.35 + Math.max( 0, 1 - behind / 5 ) * 3;

		} );
		// Banking into turns, nose down speeding up and up slowing, bobbing on whatever holds it up.
		const accel = dt > 0 ? ( speed - lastSpeed ) / dt : 0;
		lastSpeed = speed;
		const ease = Math.min( 1, dt * 2.5 );
		pitch += ( MathUtils.clamp( - accel * 0.012, - 0.1, 0.1 ) - pitch ) * ease;
		bank += ( - steer * MathUtils.clamp( Math.abs( speed ) / 20, 0.2, 1 ) * 0.22 - bank ) * ease;
		float.position.y = HOVER + Math.sin( clock * 1.9 ) * 0.06 + Math.sin( clock * 4.7 ) * 0.012;
		float.rotation.x = pitch + Math.sin( clock * 1.3 ) * 0.015;
		float.rotation.z = bank + Math.sin( clock * 1.1 ) * 0.015;
		// The beam: on while it dawdles, off at speed or in the air, shimmering.
		const wanted = airborne ? 0 : 1 - MathUtils.smoothstep( Math.abs( speed ), 3, 12 );
		beamOn += ( wanted - beamOn ) * Math.min( 1, dt * 4 );
		beam.visible = beamOn > 0.02;
		beam.scale.set( 0.85 + beamOn * 0.15, float.position.y, 0.85 + beamOn * 0.15 );
		beam.rotation.y = clock * 0.8;
		beamMaterial.opacity = beamOn * ( 0.16 + Math.sin( clock * 9 ) * 0.04 + Math.sin( clock * 23 ) * 0.02 );
		underGlow.opacity = 0.35 + beamOn * 0.4 + Math.sin( clock * 6 ) * 0.08;

	};

	return saucer;

}

// Not hit, not measured, not looked through: the shadow, glow and beam.
function ignore( mesh ) {

	mesh.raycast = () => {};
	mesh.userData.noCollide = true;
	return mesh;

}

// Where the Garage's decals go (see paint.js): across the top of the disc, round its edge, and a
// number on its nose.
const DECALS = {
	top: { at: [ 0, 0.55, 0 ], size: [ 3.6, 3.6, 0.6 ] },
	side: { at: [ 2.05, 0.38, 0 ], size: [ 2.4, 0.22, 0.6 ] },
	bonnet: { at: [ 0, 0.52, - 1.5 ], size: 0.5 },
};

// The disc: turned on a lathe, a shallow dome on top and a flatter one under it, with a lip at its
// edge, painted; a dark band of vents underneath, and a seat well round the pilot.
function hull( parent ) {

	const top = [];
	for ( let i = 0; i <= 12; i ++ ) {

		const t = i / 12;
		top.push( new Vector2( RADIUS * ( 1 - t ) + 0.95 * t, 0.3 + Math.sin( t * Math.PI / 2 ) * 0.28 ) );

	}

	top.push( new Vector2( 0.95, 0.55 ) );
	const upper = new Mesh( new LatheGeometry( [ new Vector2( RADIUS + 0.02, 0.28 ), ...top ], 48 ), mat( BODY_COLOUR, { roughness: 0.25, metalness: 0.65 } ) );
	parent.add( paint( upper ) );
	const bottom = [ new Vector2( 0, 0 ), new Vector2( 0.7, 0.02 ), new Vector2( 1.4, 0.1 ), new Vector2( 2.0, 0.2 ), new Vector2( RADIUS + 0.02, 0.28 ) ];
	parent.add( new Mesh( new LatheGeometry( bottom, 48 ), mat( 0x3a4048, { roughness: 0.4, metalness: 0.7 } ) ) );
	// A ring of vents underneath, and the floor of the cockpit.
	const vents = new Mesh( new TorusGeometry( 1.25, 0.05, 4, 40 ).rotateX( Math.PI / 2 ), DARK() );
	vents.position.y = 0.06;
	parent.add( vents );
	parent.add( new Mesh( new CircleGeometry( 0.94, 28 ).rotateX( - Math.PI / 2 ).translate( 0, 0.555, 0 ), mat( 0x1d2128, { roughness: 0.7 } ) ) );
	block( parent, mat( 0x1d2128, { roughness: 0.7 } ), [ 0.5, 0.12, 0.5 ], [ 0, 0.6, 0.15 ] );

}

// Three landing pods under the disc, tucked up.
function pods( parent ) {

	for ( let i = 0; i < 3; i ++ ) {

		const angle = i / 3 * Math.PI * 2 + Math.PI / 3;
		const x = Math.sin( angle ) * 1.45;
		const z = Math.cos( angle ) * 1.45;
		rod( parent, CHROME(), 0.05, 0.22, 'y', [ x, 0.05, z ], 8 );
		const foot = new Mesh( new SphereGeometry( 0.13, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2 ), DARK() );
		foot.position.set( x, - 0.03, z );
		parent.add( foot );

	}

}
