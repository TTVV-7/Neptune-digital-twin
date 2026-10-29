import {
	Box3,
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Color,
	CylinderGeometry,
	EdgesGeometry,
	Group,
	LineBasicMaterial,
	LineSegments,
	MathUtils,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Raycaster,
	Vector3,
} from 'three';
import { headingToYaw } from './geo.js';

export const STATUS_COLORS = { clear: 0x3fbf6f, tight: 0xf0a030, touching: 0xe0483c };

const FLOOR = 0.3; // metres of the box above the ground left out of checks, where the wheels are
const SIDE_HEIGHT = 0.8; // lowest side clearance ray, above kerbs and ground bumps
const SAMPLE_STEP = 2; // metres between clearance rays along a body
const STEP = 0.05; // metres per simulation substep
const TRAIL_STEP = 0.25; // metres of travel between swept-path points
const TRAIL_MAX = 6000; // swept-path points kept per corner
const RANGE = { overhead: 30, side: 10, end: 30 };
const AXLE_SPREAD = 1.4; // metres between axles in a tandem or tridem group
const STEER_SPREAD = 1.9; // between the two axles of a tandem steer
const JACKKNIFE = 80; // degrees between neighbouring units

const UP = new Vector3( 0, 1, 0 );
const DOWN = new Vector3( 0, - 1, 0 );
// In a body's own frame, where forward is -z.
const LEFT = new Vector3( - 1, 0, 0 );
const RIGHT = new Vector3( 1, 0, 0 );
const AHEAD = new Vector3( 0, 0, - 1 );
const BEHIND = new Vector3( 0, 0, 1 );
const DIRECTIONS = [ 'overhead', 'left', 'right', 'ahead', 'behind' ];
const _v = new Vector3();
const _o = new Vector3();
const _d = new Vector3();
const _m = new Matrix4();
const _box = new Box3();

// Compass heading (degrees) -> unit vector in the scene (x west, z north).
function forward( heading, target = new Vector3() ) {

	const h = heading * MathUtils.DEG2RAD;
	return target.set( - Math.sin( h ), 0, Math.cos( h ) );

}

// A vehicle you drive around the site to see whether it fits: a car, truck or crane,
// optionally pulling a chain of trailers (a semi, a pup, a full trailer on its dolly, the two
// trailers of a B-train). Each unit is checked as a box against the obstacles.
export class Vehicle {

	constructor( { getGround, getObstacles } ) {

		this.getGround = getGround;
		this.getObstacles = getObstacles;
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;

		this.group = new Group();
		this.group.name = 'vehicle';
		this.trail = new SweptPath();

		this.speed = 0; // m/s, negative = reversing
		this.steer = 0; // degrees, positive = right
		this.margin = 0.5;
		this.bodies = [];
		this.result = null;

	}

	setSpec( spec ) {

		const old = this.bodies[ 0 ];
		const at = old ? { position: old.axle.clone(), heading: old.heading, groundY: old.groundY[ 2 ] ?? old.axle.y } : null;
		this.spec = spec;
		this.group.traverse( o => {

			if ( o.geometry ) o.geometry.dispose();
			if ( o.material && ! o.material.userData.shared ) o.material.dispose();

		} );
		this.group.clear();
		this.bodies = [ makeBody( spec, 0 ), ...( spec.trailers ?? [] ).map( ( trailer, i ) => makeBody( trailer, i + 1 ) ) ];
		for ( const body of this.bodies ) this.group.add( body.object );
		this.showBody( this.bodyVisible ?? true );
		if ( at ) this.placeAt( at.position.setY( at.groundY ), at.heading );

	}

	// Put the vehicle's rear axle at `position` (scene coordinates), facing `heading`.
	// `onGround` says position.y is the ground there, so it isn't looked for from above
	// (which would land it on a roof or conveyor).
	placeAt( position, heading, onGround = true ) {

		const [ truck, ...towed ] = this.bodies;
		for ( const body of this.bodies ) body.groundY = onGround ? [ position.y, position.y, position.y, position.y ] : [];
		truck.axle.copy( position );
		truck.heading = heading;
		for ( const body of towed ) {

			body.heading = heading;
			body.axle.copy( this.hitch( body.index ) ).addScaledVector( forward( heading, _v ), - body.spec.kingpinToAxle );

		}

		this.speed = 0;
		this.steer = 0;
		this.trail.clear();
		this.travelled = 0;
		this.pose( ! onGround );

	}

	// Where towed unit `index` hooks onto the unit in front: `hitch` metres ahead of that unit's
	// axle (group), negative for a pintle hook behind it.
	hitch( index, target = new Vector3() ) {

		const lead = this.bodies[ index - 1 ];
		return target.copy( lead.axle ).addScaledVector( forward( lead.heading, _v ), this.bodies[ index ].spec.hitch ?? 0 );

	}

	// input: { throttle: -1..1, steer: -1..1, brake: bool, crawl: bool }
	drive( dt, input ) {

		const { spec } = this;
		const top = spec.maxSpeed ?? 20; // km/h
		const maxForward = ( input.crawl ? 3 : top ) / 3.6;
		const maxReverse = ( input.crawl ? 2 : Math.min( 10, top / 3 ) ) / 3.6;
		const accel = top >= 40 ? 3 : 1.5; // m/s², cars pick up speed faster than loaded trucks

		// Speed: accelerate toward the pedal, brake hard on Space, roll to a stop otherwise.
		const target = input.throttle > 0 ? maxForward : input.throttle < 0 ? - maxReverse : 0;
		const rate = input.brake ? 6 : input.throttle !== 0 && Math.sign( target ) === Math.sign( this.speed || target ) ? accel : 3;
		this.speed = input.brake ? approach( this.speed, 0, rate * dt ) : approach( this.speed, target, rate * dt );

		// Steering: turn the wheels toward full lock while held, back to centre when let go.
		const steerTarget = input.steer * spec.maxSteer;
		this.steer = approach( this.steer, steerTarget, ( input.steer ? 40 : 60 ) * dt );

		// Bicycle model for the truck; each towed unit is dragged by its hitch, in turn.
		const distance = this.speed * dt;
		const steps = Math.max( 1, Math.ceil( Math.abs( distance ) / STEP ) );
		const { bodies } = this;
		const truck = bodies[ 0 ];
		for ( let i = 0; i < steps; i ++ ) {

			const d = distance / steps;
			truck.heading += MathUtils.RAD2DEG * d / spec.wheelbase * Math.tan( this.steer * MathUtils.DEG2RAD );
			truck.axle.addScaledVector( forward( truck.heading, _v ), d );

			for ( let j = 1; j < bodies.length; j ++ ) {

				const body = bodies[ j ];
				const hitch = this.hitch( j, _o );
				_d.subVectors( hitch, body.axle ).setY( 0 ).normalize();
				body.axle.copy( hitch ).addScaledVector( _d, - body.spec.kingpinToAxle );
				body.heading = Math.atan2( - _d.x, _d.z ) * MathUtils.RAD2DEG;

			}

		}

		for ( const body of bodies ) body.heading = ( body.heading % 360 + 360 ) % 360;
		this.pose();

		this.travelled += Math.abs( distance );
		if ( this.travelled >= TRAIL_STEP ) {

			this.travelled = 0;
			this.trail.add( this.bodies.filter( b => b.checked ), this.result?.status ?? 'clear' );

		}

	}

	// The driver's view looks out from inside, so only the outline is drawn there.
	showBody( visible ) {

		this.bodyVisible = visible;
		for ( const body of this.bodies ) body.solid.forEach( o => o.visible = visible );

	}

	get jackknifed() {

		return this.bodies.some( ( body, i ) => i > 0 && Math.abs( ( ( this.bodies[ i - 1 ].heading - body.heading ) % 360 + 540 ) % 360 - 180 ) > JACKKNIFE );

	}

	// Place each body on the ground under its wheels, tilted to match.
	pose( reset = false ) {

		for ( const body of this.bodies ) {

			const { spec, object } = body;
			const fwd = forward( body.heading, _v ).clone();
			const right = new Vector3( - fwd.z, 0, fwd.x ); // compass right of the heading
			const front = body.supportFront( this, fwd );
			const rear = body.supportRear( fwd );
			const track = spec.width * 0.4;

			const heights = [ front, rear ].flatMap( ( p, i ) => [ - 1, 1 ].map( ( side, j ) => {

				const key = i * 2 + j;
				_o.copy( p ).addScaledVector( right, side * track );
				const last = reset ? null : body.groundY[ key ];
				const y = this.groundAt( _o, last );
				if ( y !== null ) body.groundY[ key ] = y;
				return body.groundY[ key ] ?? 0;

			} ) );

			const [ fl, fr, rl, rr ] = heights;
			const yFront = ( fl + fr ) / 2, yRear = ( rl + rr ) / 2;
			const span = front.distanceTo( rear ) || 1;

			// The box sits at its centre, between the two supports.
			const centre = body.centre( this, fwd );
			const t = MathUtils.clamp( _v.subVectors( centre, rear ).dot( fwd ) / span, - 1, 2 );
			object.position.set( centre.x, yRear + ( yFront - yRear ) * t, centre.z );
			object.rotation.set(
				Math.atan2( yFront - yRear, span ),
				headingToYaw( body.heading ),
				Math.atan2( ( fr + rr ) / 2 - ( fl + rl ) / 2, track * 2 ),
				'YXZ',
			);
			object.updateMatrixWorld( true );
			body.steerWheels?.( this.steer );

		}

	}

	// Ground height below a point, looking down from a little above where it was last time,
	// so a conveyor or roof overhead isn't mistaken for the ground.
	groundAt( point, lastY ) {

		_o.copy( point ).setY( lastY == null ? 2000 : lastY + 1.5 );
		this.raycaster.set( _o, DOWN );
		this.raycaster.far = lastY == null ? 4000 : 60;
		const hit = this.raycaster.intersectObjects( this.getGround(), true )[ 0 ];
		return hit ? hit.point.y : null;

	}

	// --- fit checks ---

	// Clearance in each direction for every body, and whether anything touches the box
	// or comes within the margin. Rays go to `rays`; `exact` meshes (with a collision index)
	// are also tested against the whole box.
	check( { rays: obstacles, exact } = this.getObstacles() ) {

		const result = { overhead: none(), left: none(), right: none(), ahead: none(), behind: none(), status: 'clear', touching: null };
		const checked = this.bodies.filter( b => b.checked );

		checked.forEach( ( body, index ) => {

			const { spec, object, name } = body;
			const w = spec.width, h = spec.height, l = spec.length;
			const xs = [ - w / 2 + 0.1, 0, w / 2 - 0.1 ];
			const zs = range( - l / 2 + 0.2, l / 2 - 0.2, SAMPLE_STEP );
			const ys = [ ...new Set( [ Math.min( SIDE_HEIGHT, h - 0.1 ), h / 2, h - 0.1 ] ) ];

			// Overhead and side rays start inside the box and the box's own extent is taken off,
			// so an obstacle poking into the box gives a negative clearance: how far it overlaps
			// (a load 0.5 m too tall reads -0.5 m overhead).
			const cast = ( origin, direction, inside, far ) => {

				_o.copy( origin ).applyMatrix4( object.matrixWorld );
				_d.copy( direction ).transformDirection( object.matrixWorld );
				this.raycaster.set( _o, _d );
				this.raycaster.far = inside + far;
				return ( this.raycaster.intersectObjects( obstacles, true )[ 0 ]?.distance ?? Infinity ) - inside;

			};

			const record = ( key, distance ) => {

				if ( distance < result[ key ].distance ) result[ key ] = { distance, body: name };

			};

			for ( const z of zs ) {

				for ( const x of xs ) record( 'overhead', cast( _v.set( x, FLOOR, z ), UP, h - FLOOR, RANGE.overhead ) );

				for ( const y of ys ) {

					record( 'left', cast( _v.set( 0, y, z ), LEFT, w / 2, RANGE.side ) );
					record( 'right', cast( _v.set( 0, y, z ), RIGHT, w / 2, RANGE.side ) );

				}

			}

			for ( const x of xs ) {

				for ( const y of ys ) {

					// From the front and back faces: something inside the box already shows overhead or at the sides.
					if ( index === 0 ) record( 'ahead', cast( _v.set( x, y, - l / 2 ), AHEAD, 0, RANGE.end ) );
					if ( index === checked.length - 1 ) record( 'behind', cast( _v.set( x, y, l / 2 ), BEHIND, 0, RANGE.end ) );

				}

			}

			// Exact test against models that have a collision index.
			if ( ! result.touching && boxHits( object, w, h, l, 0, exact ) ) result.touching = name;
			body.tight = boxHits( object, w, h, l, this.margin, exact );

		} );

		const closest = DIRECTIONS.reduce( ( a, k ) => result[ k ].distance < a.distance ? result[ k ] : a, none() );
		if ( closest.distance < 0.02 ) result.touching ??= closest.body;
		result.status = result.touching ? 'touching' : closest.distance < this.margin || this.bodies.some( b => b.tight ) ? 'tight' : 'clear';
		this.result = result;

		const color = STATUS_COLORS[ result.status ];
		for ( const body of checked ) {

			body.material.color.setHex( color );
			body.fill.material.color.setHex( color );
			body.fill.visible = result.status !== 'clear';

		}
		return result;

	}

}

// --- bodies ---

function makeBody( spec, index ) {

	const { length: l, width: w, height: h } = spec;
	const object = new Group();
	const name = index === 0 ? 'truck' : spec.name ?? 'trailer';
	object.name = name;
	const look = spec.look ?? ( index === 0 ? 'dump' : 'trailer' );

	// A full trailer's dolly sits under the trailer's own box, so it isn't checked separately.
	const checked = look !== 'dolly';
	const body = { name, index, spec, object, checked, heading: 0, axle: new Vector3(), groundY: [], tight: false };

	// The fit envelope: an outline in the status colour, filled in when it's tight or touching.
	const outline = [];
	if ( checked ) {

		const envelope = new BoxGeometry( w, h, l ).translate( 0, h / 2, 0 );
		body.material = new LineBasicMaterial( { color: STATUS_COLORS.clear } );
		const edges = new LineSegments( new EdgesGeometry( envelope ), body.material );
		body.fill = new Mesh( envelope, new MeshStandardMaterial( { transparent: true, opacity: 0.35, depthWrite: false } ) );
		body.fill.visible = false;
		outline.push( edges, body.fill );
		for ( const o of outline ) o.raycast = () => {};
		object.add( ...outline );

	}

	drawBody( object, look, w, h, l );

	if ( index === 0 ) {

		// Box centre is this far ahead of the rear axle (group).
		const ahead = spec.wheelbase + spec.frontOverhang - l / 2;
		body.centre = ( vehicle, fwd ) => body.axle.clone().addScaledVector( fwd, ahead );
		body.supportFront = ( vehicle, fwd ) => body.axle.clone().addScaledVector( fwd, spec.wheelbase );
		body.supportRear = () => body.axle.clone();

		const small = look === 'car' || look === 'pickup';
		const size = small ? 0.7 : 1;
		const steered = axleGroup( object, w, ahead - spec.wheelbase, spec.steerAxles ?? 1, STEER_SPREAD, size, small ? 0.3 : 0.4 );
		axleGroup( object, w, ahead, spec.driveAxles ?? ( small ? 1 : 2 ), AXLE_SPREAD, size, small ? 0.3 : 0.6 );
		body.steerWheels = steer => steered.forEach( wh => wh.rotation.y = - steer * MathUtils.DEG2RAD );

	} else {

		// Towed: hitched `frontOverhang` behind its front (negative when a drawbar reaches out
		// ahead of it), axle group `kingpinToAxle` behind the hitch. A dolly is centred on its axle.
		const frontOverhang = look === 'dolly' ? l / 2 - spec.kingpinToAxle : spec.frontOverhang;
		const kingpinAhead = l / 2 - frontOverhang; // of the box centre
		body.centre = ( vehicle, fwd ) => vehicle.hitch( index ).addScaledVector( fwd, - kingpinAhead );
		body.supportFront = vehicle => vehicle.hitch( index );
		body.supportRear = () => body.axle.clone();
		axleGroup( object, w, spec.kingpinToAxle - kingpinAhead, spec.axles ?? 2, AXLE_SPREAD, 1, 0.6 );
		if ( kingpinAhead > l / 2 ) drawbar( object, - kingpinAhead, - l / 2 );

	}

	body.solid = object.children.filter( c => ! outline.includes( c ) ); // hidden in the driver's view
	return body;

}

const PAINT = {
	car: new MeshStandardMaterial( { color: 0xf1f3f4, roughness: 0.35, metalness: 0.2 } ),
	work: new MeshStandardMaterial( { color: 0xf2b632, roughness: 0.5 } ), // yellow site plant
	cab: new MeshStandardMaterial( { color: 0xd9dde0, roughness: 0.4 } ),
	glass: new MeshStandardMaterial( { color: 0x23303a, roughness: 0.1, metalness: 0.4 } ),
	steel: new MeshStandardMaterial( { color: 0x59636b, roughness: 0.7 } ),
	box: new MeshStandardMaterial( { color: 0xc9cdd0, roughness: 0.6 } ),
	load: new MeshStandardMaterial( { color: 0xe0782c, roughness: 0.6 } ), // the oversize load
};

// Solid shapes for each kind of vehicle, in the body's frame: x across, y up from the ground,
// z along it with the front at -l/2. Simple blocks, but enough to read what it is.
function drawBody( object, look, w, h, l ) {

	const part = ( material, x0, x1, y0, y1, z0, z1 ) => {

		const mesh = new Mesh( new BoxGeometry( x1 - x0, y1 - y0, z1 - z0 ), material );
		mesh.position.set( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 );
		mesh.raycast = () => {};
		object.add( mesh );

	};
	const front = - l / 2, rear = l / 2, side = w / 2;

	switch ( look ) {

		case 'car':
			part( PAINT.car, - side, side, 0.35, h * 0.55, front, rear ); // body
			part( PAINT.glass, - side + 0.12, side - 0.12, h * 0.55, h, front + l * 0.3, rear - l * 0.12 ); // cabin
			break;

		case 'pickup': {

			const cabEnd = front + l * 0.5;
			part( PAINT.car, - side, side, 0.4, h * 0.55, front, rear );
			part( PAINT.glass, - side + 0.1, side - 0.1, h * 0.55, h, front + l * 0.22, cabEnd );
			part( PAINT.steel, - side, side, h * 0.55, h * 0.62, cabEnd + 0.1, rear ); // bed rails
			break;

		}

		case 'tractor':
		case 'dump':
		case 'slinger':
		case 'crane': {

			const cabEnd = front + Math.min( 2.4, l * 0.3 );
			part( PAINT.cab, - side, side, 0.6, Math.min( h, 3.6 ) * 0.7, front, cabEnd );
			part( PAINT.glass, - side + 0.05, side - 0.05, Math.min( h, 3.6 ) * 0.7, Math.min( h, 3.6 ), front + 0.1, cabEnd );
			part( PAINT.steel, - side + 0.2, side - 0.2, 0.6, 1.2, cabEnd, rear ); // chassis
			if ( look === 'dump' ) part( PAINT.work, - side, side, 1.2, h, cabEnd + 0.3, rear ); // dump box
			if ( look === 'slinger' ) {

				part( PAINT.work, - side, side, 1.2, h, cabEnd + 0.3, rear - 1.2 ); // box
				part( PAINT.steel, - 0.45, 0.45, 1.0, 1.9, rear - 4, rear ); // conveyor, stowed

			}

			if ( look === 'crane' ) {

				part( PAINT.work, - side, side, 1.2, h * 0.6, cabEnd + 0.2, rear ); // carrier
				part( PAINT.work, - 0.5, 0.5, h * 0.6, h, front + 0.3, rear - 0.5 ); // boom, stowed
				part( PAINT.work, - side + 0.3, side - 0.3, h * 0.6, h * 0.95, rear - l * 0.25, rear ); // turntable

			}

			break;

		}

		case 'dump-trailer': // pup or full trailer
			part( PAINT.work, - side, side, 1.2, h, front, rear );
			break;

		case 'end-dump':
			part( PAINT.steel, - side + 0.3, side - 0.3, 1.0, 1.3, front, rear ); // frame
			part( PAINT.box, - side, side, 1.3, h, front + 0.2, rear ); // tub
			break;

		case 'belly-dump':
			part( PAINT.box, - side, side, 1.6, h, front, rear ); // tub
			part( PAINT.box, - side * 0.6, side * 0.6, 0.45, 1.6, front + l * 0.3, rear - l * 0.35 ); // hopper gates
			break;

		case 'dolly':
			part( PAINT.steel, - side + 0.3, side - 0.3, 0.7, 1.1, front, rear ); // frame and turntable
			break;

		case 'lowbed':
			part( PAINT.steel, - Math.min( side, 1.3 ), Math.min( side, 1.3 ), 0.5, 1.0, front, rear ); // deck
			part( PAINT.load, - side, side, 1.0, h, front + l * 0.15, rear - l * 0.1 );
			break;

		default: // box trailer
			part( PAINT.box, - side, side, 1.2, h, front, rear );

	}

}

const WHEEL_MATERIAL = new MeshStandardMaterial( { color: 0x1d2329, roughness: 0.9 } );
for ( const m of [ WHEEL_MATERIAL, ...Object.values( PAINT ) ] ) m.userData.shared = true;

// Wheels for a group of `count` axles centred at `z` (in the box's frame, where forward is -z),
// `spread` metres apart. `size` is the wheel's diameter, `thickness` its width (wider for duals).
function axleGroup( parent, w, z, count, spread, size, thickness ) {

	const wheels = [];
	for ( let i = 0; i < count; i ++ ) {

		for ( const side of [ - 1, 1 ] ) {

			const mesh = new Mesh( new CylinderGeometry( size / 2, size / 2, thickness, 16 ).rotateZ( Math.PI / 2 ), WHEEL_MATERIAL );
			mesh.position.set( side * ( w / 2 - thickness / 2 ), size / 2, z + ( i - ( count - 1 ) / 2 ) * spread );
			mesh.raycast = () => {};
			parent.add( mesh );
			wheels.push( mesh );

		}

	}

	return wheels;

}

// The tongue of a pup or a dolly, from the hitch eye at `z0` back to `z1`.
function drawbar( parent, z0, z1 ) {

	const mesh = new Mesh( new BoxGeometry( 0.25, 0.25, z1 - z0 ), PAINT.steel );
	mesh.position.set( 0, 0.8, ( z0 + z1 ) / 2 );
	mesh.raycast = () => {};
	parent.add( mesh );

}

// Does the body's box, grown by `grow` metres (but never below FLOOR), hit any mesh that has a
// collision index? Only your models have one, so this is the exact check for them.
function boxHits( object, w, h, l, grow, obstacles ) {

	_box.min.set( - w / 2 - grow, FLOOR, - l / 2 - grow );
	_box.max.set( w / 2 + grow, h + grow, l / 2 + grow );
	let hit = false;
	for ( const root of obstacles ) {

		root.traverse( mesh => {

			if ( hit || ! mesh.isMesh || ! mesh.geometry.boundsTree || ! mesh.visible ) return;
			const count = mesh.isInstancedMesh ? mesh.count : 1;
			for ( let i = 0; i < count && ! hit; i ++ ) {

				_m.copy( mesh.matrixWorld );
				if ( mesh.isInstancedMesh ) _m.multiply( mesh.getMatrixAt( i, new Matrix4() ) );
				_m.invert().multiply( object.matrixWorld );
				hit = mesh.geometry.boundsTree.intersectsBox( _box, _m );

			}

		} );

	}

	return hit;

}

// --- swept path ---

// Lines traced by the corners of each body, coloured by how tight it was at the time.
class SweptPath extends LineSegments {

	constructor() {

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( TRAIL_MAX * 8 * 2 * 3 ), 3 ) );
		geometry.setAttribute( 'color', new BufferAttribute( new Float32Array( TRAIL_MAX * 8 * 2 * 3 ), 3 ) );
		super( geometry, new LineBasicMaterial( { vertexColors: true } ) );
		this.name = 'swept path';
		this.frustumCulled = false;
		this.raycast = () => {};
		this.last = null;
		this.count = 0;
		this.clear();

	}

	clear() {

		this.last = null;
		this.count = 0;
		this.geometry.setDrawRange( 0, 0 );

	}

	add( bodies, status ) {

		const corners = bodies.flatMap( ( { object, spec } ) => [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ].map( ( [ x, z ] ) =>
			new Vector3( x * spec.width / 2, 0.15, z * spec.length / 2 ).applyMatrix4( object.matrixWorld ) ) );

		if ( this.last && this.last.length === corners.length && this.count + corners.length * 2 <= TRAIL_MAX * 16 ) {

			const position = this.geometry.attributes.position;
			const color = this.geometry.attributes.color;
			const c = new Color( STATUS_COLORS[ status ] );
			corners.forEach( ( p, i ) => {

				for ( const q of [ this.last[ i ], p ] ) {

					position.setXYZ( this.count, q.x, q.y, q.z );
					color.setXYZ( this.count, c.r, c.g, c.b );
					this.count ++;

				}

			} );
			position.needsUpdate = true;
			color.needsUpdate = true;
			this.geometry.setDrawRange( 0, this.count );

		}

		this.last = corners;

	}

}

// --- helpers ---

function approach( value, target, step ) {

	return value < target ? Math.min( value + step, target ) : Math.max( value - step, target );

}

function range( from, to, step ) {

	const n = Math.max( 1, Math.ceil( ( to - from ) / step ) );
	return Array.from( { length: n + 1 }, ( _, i ) => from + ( to - from ) * i / n );

}

function none() {

	return { distance: Infinity, body: null };

}
