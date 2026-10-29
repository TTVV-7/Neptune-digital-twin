import {
	Box3,
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Color,
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

// A vehicle you drive around the site to see whether it fits: a truck, crane or similar,
// optionally pulling a trailer. Each is checked as a box against the obstacles.
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
			if ( o.material && o.material !== WHEEL_MATERIAL ) o.material.dispose();

		} );
		this.group.clear();
		this.bodies = [ makeBody( 'truck', spec ) ];
		if ( spec.trailer ) this.bodies.push( makeBody( 'trailer', spec.trailer ) );
		for ( const body of this.bodies ) this.group.add( body.object );
		if ( at ) this.placeAt( at.position.setY( at.groundY ), at.heading );

	}

	// Put the vehicle's rear axle at `position` (scene coordinates), facing `heading`.
	// `onGround` says position.y is the ground there, so it isn't looked for from above
	// (which would land it on a roof or conveyor).
	placeAt( position, heading, onGround = true ) {

		const [ truck, trailer ] = this.bodies;
		for ( const body of this.bodies ) body.groundY = onGround ? [ position.y, position.y, position.y, position.y ] : [];
		truck.axle.copy( position );
		truck.heading = heading;
		if ( trailer ) {

			trailer.heading = heading;
			trailer.axle.copy( this.hitch() ).addScaledVector( forward( heading, _v ), - this.spec.trailer.kingpinToAxle );

		}

		this.speed = 0;
		this.steer = 0;
		this.trail.clear();
		this.travelled = 0;
		this.pose( ! onGround );

	}

	hitch( target = new Vector3() ) {

		const truck = this.bodies[ 0 ];
		return target.copy( truck.axle ).addScaledVector( forward( truck.heading, _v ), this.spec.trailer?.hitch ?? 0 );

	}

	// input: { throttle: -1..1, steer: -1..1, brake: bool, crawl: bool }
	drive( dt, input ) {

		const { spec } = this;
		const maxForward = ( input.crawl ? 3 : 20 ) / 3.6;
		const maxReverse = ( input.crawl ? 2 : 6 ) / 3.6;

		// Speed: accelerate toward the pedal, brake hard on Space, roll to a stop otherwise.
		const target = input.throttle > 0 ? maxForward : input.throttle < 0 ? - maxReverse : 0;
		const rate = input.brake ? 6 : input.throttle !== 0 && Math.sign( target ) === Math.sign( this.speed || target ) ? 1.5 : 3;
		this.speed = input.brake ? approach( this.speed, 0, rate * dt ) : approach( this.speed, target, rate * dt );

		// Steering: turn the wheels toward full lock while held, back to centre when let go.
		const steerTarget = input.steer * spec.maxSteer;
		this.steer = approach( this.steer, steerTarget, ( input.steer ? 40 : 60 ) * dt );

		// Bicycle model for the truck; the trailer is dragged by its kingpin.
		const distance = this.speed * dt;
		const steps = Math.max( 1, Math.ceil( Math.abs( distance ) / STEP ) );
		const [ truck, trailer ] = this.bodies;
		for ( let i = 0; i < steps; i ++ ) {

			const d = distance / steps;
			truck.heading += MathUtils.RAD2DEG * d / spec.wheelbase * Math.tan( this.steer * MathUtils.DEG2RAD );
			truck.axle.addScaledVector( forward( truck.heading, _v ), d );

			if ( trailer ) {

				const hitch = this.hitch( _o );
				_d.subVectors( hitch, trailer.axle ).setY( 0 ).normalize();
				trailer.axle.copy( hitch ).addScaledVector( _d, - spec.trailer.kingpinToAxle );
				trailer.heading = Math.atan2( - _d.x, _d.z ) * MathUtils.RAD2DEG;

			}

		}

		truck.heading = ( truck.heading % 360 + 360 ) % 360;
		if ( trailer ) trailer.heading = ( trailer.heading % 360 + 360 ) % 360;
		this.pose();

		this.travelled += Math.abs( distance );
		if ( this.travelled >= TRAIL_STEP ) {

			this.travelled = 0;
			this.trail.add( this.bodies, this.result?.status ?? 'clear' );

		}

	}

	get jackknifed() {

		const [ truck, trailer ] = this.bodies;
		if ( ! trailer ) return false;
		const angle = Math.abs( ( ( truck.heading - trailer.heading ) % 360 + 540 ) % 360 - 180 );
		return angle > 80;

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

		this.bodies.forEach( ( body, index ) => {

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
					if ( index === this.bodies.length - 1 ) record( 'behind', cast( _v.set( x, y, l / 2 ), BEHIND, 0, RANGE.end ) );

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
		for ( const body of this.bodies ) body.material.color.setHex( color );
		return result;

	}

}

// --- bodies ---

function makeBody( name, spec ) {

	const { length: l, width: w, height: h } = spec;
	const object = new Group();
	object.name = name;

	// Translucent, so you can see what it runs into.
	const material = new MeshStandardMaterial( { color: STATUS_COLORS.clear, transparent: true, opacity: 0.55, depthWrite: false } );
	const geometry = new BoxGeometry( w, h, l ).translate( 0, h / 2, 0 );
	const box = new Mesh( geometry, material );
	box.raycast = () => {};
	const edges = new LineSegments( new EdgesGeometry( geometry ), new LineBasicMaterial( { color: 0x1d2329 } ) );
	edges.raycast = () => {};
	object.add( box, edges );

	const body = { name, spec, object, material, heading: 0, axle: new Vector3(), groundY: [], tight: false };

	if ( name === 'truck' ) {

		// Box centre is this far ahead of the rear axle.
		const ahead = spec.wheelbase + spec.frontOverhang - l / 2;
		body.centre = ( vehicle, fwd ) => body.axle.clone().addScaledVector( fwd, ahead );
		body.supportFront = ( vehicle, fwd ) => body.axle.clone().addScaledVector( fwd, spec.wheelbase );
		body.supportRear = () => body.axle.clone();

		const frontWheels = [ - 1, 1 ].map( side => wheel( object, side * ( w / 2 - 0.25 ), ahead - spec.wheelbase ) );
		wheel( object, - ( w / 2 - 0.25 ), ahead, 1.4 );
		wheel( object, w / 2 - 0.25, ahead, 1.4 );
		body.steerWheels = steer => frontWheels.forEach( wh => wh.rotation.y = - steer * MathUtils.DEG2RAD );

	} else {

		// Trailer: kingpin `frontOverhang` behind the front, axle `kingpinToAxle` behind that.
		const kingpinAhead = l / 2 - spec.frontOverhang;
		body.centre = ( vehicle, fwd ) => vehicle.hitch().addScaledVector( fwd, - kingpinAhead );
		body.supportFront = vehicle => vehicle.hitch();
		body.supportRear = () => body.axle.clone();
		wheel( object, - ( w / 2 - 0.25 ), spec.kingpinToAxle - kingpinAhead, 2.6 );
		wheel( object, w / 2 - 0.25, spec.kingpinToAxle - kingpinAhead, 2.6 );

	}

	return body;

}

const WHEEL_MATERIAL = new MeshStandardMaterial( { color: 0x1d2329, roughness: 0.9 } );

// `z` is in the box's frame, where forward is -z.
function wheel( parent, x, z, length = 1 ) {

	const mesh = new Mesh( new BoxGeometry( 0.45, 1, length ), WHEEL_MATERIAL );
	mesh.position.set( x, 0.5, z );
	mesh.raycast = () => {};
	parent.add( mesh );
	return mesh;

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
