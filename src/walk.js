import { MathUtils, Raycaster, Vector3 } from 'three';
import { PLAYER } from './config.js';
import { headingToYaw } from './geo.js';

const UP = new Vector3( 0, 1, 0 );
const DOWN = new Vector3( 0, - 1, 0 );
const _origin = new Vector3();
const _dir = new Vector3();
const _move = new Vector3();
const _stepMove = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();
const _velocity = new Vector3();
const _rest = new Vector3();
const _normal = new Vector3();
const _tangent = new Vector3();
const _push = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const X_AXIS = new Vector3( 1, 0, 0 );

// Walk physics runs in sub-steps of at most this much horizontal movement, so slopes and
// ledges behave much the same at 10 fps as at 60 fps. Raycasts are cheap thanks to
// raycast.js, but the count is still capped.
const MAX_SUBSTEP_DISTANCE = 0.25;
const MAX_SUBSTEPS = 8;
// Look this far above the feet for a surface the player has ended up underneath, e.g. after
// flying into the ground or when sharper tiles load in higher up.
const RECOVERY_HEIGHT = 50;
// How long nothing may be under the feet before that counts as being buried rather than
// stepping over a crack in the mesh.
const NO_GROUND_GRACE = 0.3;
const HEAD_CLEARANCE = 0.1;

// Flying sweeps each move with a ray from the camera and a ring of four round it, so a fast move
// can't skip through a thin wall and edges can't slip between the rays into the clearance. The ring
// sits this far out, as a share of the clearance radius.
const RING = 0.7;
// A move that hits something slides along it, at most this many times a frame (into a corner).
const MAX_SLIDES = 3;
// Where the clearance check looks for anything too close: flying, along the six axes and to the
// eight corners between them; walking, eight ways round at eye height.
const FLY_AROUND = [];
for ( const x of [ - 1, 0, 1 ] ) for ( const y of [ - 1, 0, 1 ] ) for ( const z of [ - 1, 0, 1 ] ) {

	const n = Math.abs( x ) + Math.abs( y ) + Math.abs( z );
	if ( n === 1 || n === 3 ) FLY_AROUND.push( new Vector3( x, y, z ).normalize() );

}

const WALK_AROUND = Array.from( { length: 8 }, ( _, i ) => new Vector3( Math.cos( i * Math.PI / 4 ), 0, Math.sin( i * Math.PI / 4 ) ) );
// A surface whose normal points up (or down) more than this is ground or ceiling, not a wall.
const FLOOR = 0.6;
// How square on a hit has to be (the cosine between the way you were going and the surface's
// normal) to bounce you back, about 20° off the surface: shallower hits glide along it. And to
// turn the view, within about 37° of square on.
const GLANCING = 0.35;
const HEAD_ON = 0.8;
// Slower than this into a wall (m/s), you just stop: walking up to one doesn't bounce you.
const BOUNCE_MIN = { walk: 2, fly: 4 };
// The bounce (m/s) is capped, and dies away at this rate (1/s): a short push back, not a jump.
const BOUNCE_MAX = 14;
const BOUNCE_DECAY = 6;
// Touching a wall that faces the same way again this soon (s) isn't a new impact: pushing on a
// wall doesn't keep bouncing you or turning the view.
const REARM_TIME = 0.75;
// After a bounce the keys' push into the wall is held off while the wall is still within this
// many metres beyond the clearance radius, so you aren't straight back against it.
const REPEL_REACH = 4;
// Once the clearance check has pushed the camera off something, the keys' push back into it is
// held off while it's within this much (m) beyond the clearance radius: gliding along a corrugated
// container wall then keeps a steady distance instead of bobbing into the gap between each pair
// of ribs and being pushed out again, 2-6 cm a frame.
const TOUCH_REACH = 0.1;
// Slower than this into a wall (m/s), the view doesn't turn.
const TURN_MIN = 1.5;
// Flying, an impact is checked by looking straight at the surface from the camera, out to this
// many times the clearance radius.
const CONFIRM_REACH = 1.3;
// The view turn takes this long (s), the longer for a bigger turn. It only turns toward a way
// along the wall with at least this much room (m) beyond the clearance radius, walking with the
// ground checked every ROOM_STEP metres.
const TURN_TIME = [ 0.3, 0.5 ];
const TURN_ROOM = 2;
const ROOM_STEP = 0.5;
// Flying into the ground or a ceiling levels the view to this pitch off it.
const LEVEL_PITCH = 10 * MathUtils.DEG2RAD;
// Mouse movement (pixels) during a turn that hands the view back to the user. A turn doesn't start
// while the mouse has moved more than LOOK_BUSY pixels lately, fading over LOOK_FADE seconds.
const TURN_CANCEL = 4;
const LOOK_BUSY = 40;
const LOOK_FADE = 0.2;

// First-person controller. Walk mode has gravity and bumps into things; fly mode goes wherever
// you look and glides along whatever it meets. Running or flying into a wall bounces you back off
// it and turns the view along it. Ghost mode (G) walks and flies through walls.
export class WalkController {

	// getColliders: everything that blocks the player. getGround: the base terrain only (the
	// tiles), used to tell when the player has ended up underneath it. isInsideModel: true when
	// a point is within one of your own models, where being under a roof is expected.
	constructor( camera, domElement, { getColliders, getGround, isInsideModel } ) {

		this.camera = camera;
		this.domElement = domElement;
		this.getColliders = getColliders;
		this.getGround = getGround;
		this.isInsideModel = isInsideModel;

		this.mode = 'fly';
		this.yaw = 0;
		this.pitch = 0;
		this.velocityY = 0;
		this.grounded = false;
		this.groundFound = false;
		this.locked = false;
		// Off while driving: the controller then ignores keys and leaves the camera alone.
		this.enabled = true;
		// The mesh the player is standing on, and whether to check for being buried next step.
		this.standingOn = null;
		this.checkBuried = false;
		this.noGroundTime = 0;
		// G: walk and fly through walls, to look inside things. T: turn the view along walls.
		this.ghost = false;
		this.autoTurn = PLAYER.autoTurn;
		// After an impact: the push back off the wall (m/s), the wall's normal while the keys' push
		// into it is held off, and the view's turn along it.
		this.bounce = new Vector3();
		this.repel = null;
		this.turn = null;
		// What the clearance check last pushed the camera off, while it's still there (see keepOff).
		this.touching = null;
		this.touchNormal = new Vector3();
		this.clock = 0;
		this.lastContact = { time: - Infinity, normal: new Vector3() };
		// How fast the player really went last frame (m/s), for how hard they hit things.
		this.velocity = new Vector3();
		this.lastPosition = new Vector3();
		this.lastDt = 0;
		// What the full move ran into this frame, if anything, and the way back from it.
		this.wall = null;
		this.wallNormal = new Vector3();
		this.hitNormal = new Vector3();
		this.clearNormal = new Vector3();
		this.sweepHit = { travel: 0, normal: new Vector3() };
		// Recent mouse movement, in pixels.
		this.lookActivity = 0;

		this.keys = new Set();
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;

		// Wall probes just above step height, at the waist and at the top of the head. Thinner
		// things between them are caught by a downward ray where the body is going.
		const low = PLAYER.stepHeight + 0.05;
		const high = PLAYER.eyeHeight + HEAD_CLEARANCE;
		this.probeHeights = [ low, ( low + high ) / 2, high ];
		// The same from the eyes, and for flying the camera itself, to check impacts from.
		this.walkProbes = this.probeHeights.map( height => height - PLAYER.eyeHeight );
		this.flyProbes = [ 0 ];

		this._onKeyDown = e => {

			if ( e.key === 'Meta' ) this.keys.clear();
			if ( ! this.enabled || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;

			// Space would otherwise press whichever panel button or checkbox has focus.
			if ( e.code === 'Space' ) e.preventDefault();
			this.keys.add( e.code );
			if ( e.code === 'KeyF' && ! e.repeat ) this.toggleMode();
			if ( e.code === 'KeyG' && ! e.repeat ) this.setGhost( ! this.ghost );
			if ( e.code === 'KeyT' && ! e.repeat ) this.setAutoTurn( ! this.autoTurn );
			if ( e.code === 'Space' && this.mode === 'walk' && this.grounded ) {

				this.velocityY = PLAYER.jumpSpeed;
				this.grounded = false;

			}

		};
		this._onKeyUp = e => {

			if ( e.key === 'Meta' ) this.keys.clear();
			if ( e.code === 'Space' && ! isTyping( e ) ) e.preventDefault();
			this.keys.delete( e.code );

		};
		this._onBlur = () => this.keys.clear();
		// Clicking anything but the scene (the panel, a dropdown) can swallow key-ups, e.g. while a
		// dropdown's list is open, so forget held keys rather than walking on by themselves.
		this._onPointerDown = e => {

			if ( e.target !== domElement ) this.keys.clear();

		};
		// Return false to stop a click on the scene from capturing the mouse (e.g. while placing items).
		this.canLockPointer = () => true;
		this.dragLooking = false;
		this._onMouseMove = e => {

			if ( ! this.locked && ! this.dragLooking ) return;
			const moved = Math.abs( e.movementX ) + Math.abs( e.movementY );
			this.lookActivity += moved;
			// Looking round takes the view back from a turn along a wall.
			if ( this.turn && ( this.turn.mouse += moved ) > TURN_CANCEL ) this.turn = null;
			this.yaw -= e.movementX * 0.002;
			this.pitch -= e.movementY * 0.002;
			this.pitch = MathUtils.clamp( this.pitch, - Math.PI / 2 + 0.01, Math.PI / 2 - 0.01 );

		};
		this._onClick = e => {

			// Hand the keyboard back to the scene after using the panel.
			document.activeElement?.blur?.();
			if ( this.enabled && this.canLockPointer( e ) ) domElement.requestPointerLock();

		};
		// Holding the right mouse button looks around without capturing the mouse.
		this._onPointerDownLook = e => {

			if ( e.button !== 2 ) return;
			this.dragLooking = true;
			domElement.setPointerCapture( e.pointerId );

		};
		this._onPointerUpLook = e => {

			if ( e.button === 2 ) this.dragLooking = false;

		};
		this._onContextMenu = e => e.preventDefault();
		this._onLockChange = () => {

			this.locked = document.pointerLockElement === domElement;
			this.onLockChange?.( this.locked );

		};

		// Capture phase, because lil-gui stops key events from bubbling out of its controls.
		window.addEventListener( 'keydown', this._onKeyDown, true );
		window.addEventListener( 'keyup', this._onKeyUp, true );
		window.addEventListener( 'blur', this._onBlur );
		document.addEventListener( 'pointerdown', this._onPointerDown, true );
		document.addEventListener( 'mousemove', this._onMouseMove );
		document.addEventListener( 'pointerlockchange', this._onLockChange );
		domElement.addEventListener( 'click', this._onClick );
		domElement.addEventListener( 'pointerdown', this._onPointerDownLook );
		domElement.addEventListener( 'pointerup', this._onPointerUpLook );
		domElement.addEventListener( 'contextmenu', this._onContextMenu );

	}

	setPose( position, heading, pitch ) {

		this.camera.position.copy( position );
		this.yaw = headingToYaw( heading );
		this.pitch = pitch * MathUtils.DEG2RAD;
		this.settle();
		this.applyRotation();

	}

	setMode( mode ) {

		this.mode = mode;
		this.velocityY = 0;
		this.grounded = false;
		this.standingOn = null;
		this.settle();
		// The player may have flown into the ground as a ghost, or sharper tiles loaded in round them.
		this.checkBuried = mode === 'walk';
		this.onModeChange?.( mode );

	}

	toggleMode() {

		this.setMode( this.mode === 'fly' ? 'walk' : 'fly' );

	}

	setGhost( on ) {

		this.ghost = on;
		this.settle();
		this.onToggle?.( 'ghost', on );

	}

	setAutoTurn( on ) {

		this.autoTurn = on;
		if ( ! on ) this.turn = null;
		this.onToggle?.( 'autoTurn', on );

	}

	// Forget any bounce and turn, and how fast the player was going, e.g. after being moved.
	settle() {

		this.bounce.set( 0, 0, 0 );
		this.repel = null;
		this.turn = null;
		this.touching = null;
		this.velocity.set( 0, 0, 0 );
		this.lastDt = 0;

	}

	applyRotation() {

		this.camera.rotation.set( this.pitch, this.yaw, 0, 'YXZ' );

	}

	update( dt ) {

		const pos = this.camera.position;
		if ( this.lastDt > 0 ) this.velocity.subVectors( pos, this.lastPosition ).divideScalar( this.lastDt );
		this.lastPosition.copy( pos );
		this.lastDt = dt;
		this.clock += dt;
		this.lookActivity *= Math.exp( - dt / LOOK_FADE );
		this.advanceTurn( dt );
		this.applyRotation();

		const { keys } = this;
		const fwd = ( keys.has( 'KeyW' ) || keys.has( 'ArrowUp' ) ? 1 : 0 ) - ( keys.has( 'KeyS' ) || keys.has( 'ArrowDown' ) ? 1 : 0 );
		const strafe = ( keys.has( 'KeyD' ) || keys.has( 'ArrowRight' ) ? 1 : 0 ) - ( keys.has( 'KeyA' ) || keys.has( 'ArrowLeft' ) ? 1 : 0 );
		const fast = keys.has( 'ShiftLeft' ) || keys.has( 'ShiftRight' );

		if ( this.mode === 'fly' ) {

			const rise = ( keys.has( 'Space' ) || keys.has( 'KeyE' ) ? 1 : 0 ) - ( keys.has( 'KeyC' ) || keys.has( 'KeyQ' ) ? 1 : 0 );
			const speed = PLAYER.flySpeed * ( fast ? PLAYER.flyBoost : 1 );
			const cosPitch = Math.cos( this.pitch );
			_forward.set( - Math.sin( this.yaw ) * cosPitch, Math.sin( this.pitch ), - Math.cos( this.yaw ) * cosPitch );
			_right.set( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) );
			_move.set( 0, 0, 0 )
				.addScaledVector( _forward, fwd )
				.addScaledVector( _right, strafe );
			_move.y += rise;
			if ( _move.lengthSq() > 0 ) _move.normalize();
			_velocity.copy( _move ).multiplyScalar( speed );
			if ( this.ghost ) this.camera.position.addScaledVector( _velocity, dt );
			else this.fly( dt, _velocity );
			return;

		}

		// Walk mode.
		const speed = fast ? PLAYER.runSpeed : PLAYER.walkSpeed;
		_forward.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		_right.set( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) );
		_move.set( 0, 0, 0 )
			.addScaledVector( _forward, fwd )
			.addScaledVector( _right, strafe );
		if ( _move.lengthSq() > 0 ) _move.normalize();
		_velocity.copy( _move ).multiplyScalar( speed );
		if ( ! this.ghost ) {

			this.holdOff( _velocity, PLAYER.radius );
			this.keepOff( _velocity, PLAYER.radius );

		}

		_rest.copy( _velocity ).add( this.bounce );

		const moving = _rest.lengthSq() > 1e-6;
		const steps = moving ? MathUtils.clamp( Math.ceil( _rest.length() * dt / MAX_SUBSTEP_DISTANCE ), 1, MAX_SUBSTEPS ) : 1;
		const h = dt / steps;
		_stepMove.copy( _rest ).multiplyScalar( h );
		this.wall = null;
		for ( let i = 0; i < steps; i ++ ) this.stepWalk( h, moving ? _stepMove : null );

		if ( moving && ! this.ghost ) {

			const pushed = this.keepClear( PLAYER.radius, WALK_AROUND, true );
			if ( pushed ) this.touching = this.touchNormal.copy( pushed );
			const wall = this.wall ?? pushed;
			if ( wall ) this.impact( wall, _velocity, BOUNCE_MIN.walk );

		}

		this.fadeBounce( dt );

	}

	// Fly at `velocity` (m/s) for dt seconds, gliding along whatever's in the way and keeping the
	// clearance radius from it, so the camera never shows the inside of a wall.
	fly( dt, velocity ) {

		const radius = PLAYER.flyRadius;
		this.holdOff( velocity, radius );
		this.keepOff( velocity, radius );
		_rest.copy( velocity ).add( this.bounce ).multiplyScalar( dt );
		if ( _rest.lengthSq() > 0 ) {

			const hit = this.sweep( _rest, radius );
			const pushed = this.keepClear( radius, FLY_AROUND, false );
			if ( pushed ) this.touching = this.touchNormal.copy( pushed );
			if ( hit ?? pushed ) this.impact( hit ?? pushed, velocity, BOUNCE_MIN.fly );

		}

		this.fadeBounce( dt );

	}

	// Move the camera by `move`, stopping `radius` short of anything solid and sliding along it
	// with the rest. Returns the normal of the first surface it met, or null.
	sweep( move, radius ) {

		const pos = this.camera.position;
		let first = null;
		for ( let i = 0; i < MAX_SLIDES; i ++ ) {

			const length = move.length();
			if ( length < 1e-5 ) break;
			_dir.copy( move ).divideScalar( length );
			const hit = this.sweepAhead( _dir, length, radius );
			if ( ! hit ) {

				pos.add( move );
				break;

			}

			pos.addScaledVector( _dir, hit.travel );
			first ??= this.hitNormal.copy( hit.normal );
			move.addScaledVector( _dir, - hit.travel );
			move.addScaledVector( hit.normal, - move.dot( hit.normal ) );

		}

		return first;

	}

	// How far a ball of `radius` round the camera can go along `dir` (up to `length`) before it
	// touches something, and that surface's normal; null if nothing is in the way. Rays from the
	// ring start partway round the ball, so they reach less far ahead of the camera.
	sweepAhead( dir, length, radius ) {

		const pos = this.camera.position;
		_a.crossVectors( dir, Math.abs( dir.y ) < 0.9 ? UP : X_AXIS ).normalize();
		_b.crossVectors( dir, _a );
		const lead = radius * Math.sqrt( 1 - RING * RING );
		let best = null;
		for ( let i = 0; i < 5; i ++ ) {

			_origin.copy( pos );
			if ( i > 0 ) _origin.addScaledVector( i < 3 ? _a : _b, ( i % 2 ? 1 : - 1 ) * RING * radius );
			const reach = i === 0 ? radius : lead;
			const hit = this.cast( _origin, dir, length + reach );
			if ( ! hit ) continue;
			const travel = Math.max( 0, hit.distance - reach );
			if ( best && travel >= best.travel ) continue;
			best = this.sweepHit;
			best.travel = travel;
			surfaceNormal( hit, dir, best.normal );

		}

		return best;

	}

	// Push the camera out to `radius` from anything nearer, e.g. an edge that slipped between the
	// sweep's rays or a sharper tile that loaded in, so the near plane never cuts into a wall.
	// Walking, only sideways, which is also how walking slides along a wall at a shallow angle.
	// Returns the way it pushed, or null.
	keepClear( radius, directions, level ) {

		const pos = this.camera.position;
		_push.set( 0, 0, 0 );
		for ( const dir of directions ) {

			const hit = this.cast( pos, dir, radius );
			if ( ! hit ) continue;
			surfaceNormal( hit, dir, _normal );
			// How much further from the surface's plane the camera needs to be than it is or is going.
			const short = radius - hit.distance * - dir.dot( _normal ) - _push.dot( _normal );
			if ( short > 0 ) _push.addScaledVector( _normal, short );

		}

		if ( level ) _push.y = 0;
		const length = _push.length();
		if ( length < 1e-4 ) return null;
		// Not into something else, in a gap narrower than the clearance.
		_dir.copy( _push ).divideScalar( length );
		if ( this.cast( pos, _dir, length ) ) return null;
		pos.add( _push );
		return this.clearNormal.copy( _dir );

	}

	// A hit while the keys were moving the player at `velocity` (m/s), against a surface with this
	// normal. A square enough hit on a wall at speed bounces you back off it, and a head-on one turns
	// the view along it. Pushing on a wall just touched isn't a new impact, and nor is leaning on
	// one: how hard it is depends on how fast the player was really going.
	impact( normal, velocity, minSpeed ) {

		const speed = velocity.length();
		if ( speed === 0 || - velocity.dot( normal ) < speed * GLANCING || ! this.confirm( normal ) ) return;
		const last = this.lastContact;
		const fresh = this.clock - last.time > REARM_TIME || normal.dot( last.normal ) < 0.8;
		last.time = this.clock;
		last.normal.copy( normal );
		const square = - velocity.dot( normal ) / speed;
		const into = Math.min( speed * square, - this.velocity.dot( normal ) );
		if ( ! fresh || square < GLANCING || into <= 0 ) return;

		// Off walls only: the ground and ceilings just stop you.
		if ( Math.abs( normal.y ) < FLOOR && into > minSpeed ) {

			this.bounce.copy( normal ).multiplyScalar( Math.min( ( into - minSpeed ) * PLAYER.bounce, BOUNCE_MAX ) );
			if ( this.mode === 'walk' ) this.bounce.y = 0;
			this.repel = normal.clone();

		}

		if ( square > HEAD_ON && into > TURN_MIN ) this.turnAlong( normal, velocity );

	}

	// Whether the player really ran into a surface with this normal: there is one straight ahead
	// along it, not just the side of a rib on a corrugated wall or a corner that the edge of the
	// clearance clipped. Its normal then replaces the one given (level, walking).
	confirm( normal ) {

		const walking = this.mode === 'walk';
		const reach = walking ? PLAYER.radius + MAX_SUBSTEP_DISTANCE + 0.1 : PLAYER.flyRadius * CONFIRM_REACH;
		_dir.copy( normal ).negate();
		for ( const offset of walking ? this.walkProbes : this.flyProbes ) {

			_origin.copy( this.camera.position );
			_origin.y += offset;
			const hit = this.cast( _origin, _dir, reach );
			if ( ! hit || surfaceNormal( hit, _dir, _normal ).dot( normal ) < 0.7 ) continue;
			normal.copy( _normal );
			if ( walking ) normal.setY( 0 ).normalize();
			return true;

		}

		return false;

	}

	// While bouncing off a wall the keys' push into it is held off, as long as they still push into
	// it and it's still there, so the bounce isn't undone at once; the view turns along it meanwhile.
	holdOff( velocity, radius ) {

		const { repel } = this;
		if ( ! repel ) return;
		const into = - velocity.dot( repel );
		if ( into <= velocity.length() * 0.05 ) {

			this.repel = null;
			return;

		}

		// Walking, look for it where the body would meet it: low walls and barriers too.
		_origin.copy( this.camera.position );
		if ( this.mode === 'walk' ) _origin.y += this.probeHeights[ 0 ] - PLAYER.eyeHeight;
		_dir.copy( repel ).negate();
		if ( ! this.cast( _origin, _dir, radius + REPEL_REACH ) ) {

			this.repel = null;
			return;

		}

		velocity.addScaledVector( repel, into );

	}

	// The keys' push into what the clearance check last pushed the camera off is held off while it's
	// still there, so the camera glides along at a steady distance (see TOUCH_REACH).
	keepOff( velocity, radius ) {

		const { touching } = this;
		if ( ! touching ) return;
		const into = - velocity.dot( touching );
		if ( into <= 0 ) return;
		_dir.copy( touching ).negate();
		if ( this.cast( this.camera.position, _dir, radius + TOUCH_REACH ) ) velocity.addScaledVector( touching, into );
		else this.touching = null;

	}

	fadeBounce( dt ) {

		this.bounce.multiplyScalar( Math.exp( - BOUNCE_DECAY * dt ) );
		if ( this.bounce.lengthSq() < 0.01 ) this.bounce.set( 0, 0, 0 );

	}

	// Turn the view along a wall it was looking into, to whichever side is nearer where it was
	// looking (or going), unless another wall closes that way off close by (an inside corner) and
	// the other way is open: turning to face the other wall would only look into that instead. Shut
	// in both ways, the view stays. Flying into the ground or a ceiling levels it off instead.
	turnAlong( normal, velocity ) {

		if ( ! this.autoTurn || this.lookActivity > LOOK_BUSY ) return;
		let yaw = 0;
		let pitch = 0;
		_normal.set( normal.x, 0, normal.z );
		if ( _normal.lengthSq() > 0.25 ) {

			_normal.normalize();
			_forward.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
			if ( - _forward.dot( _normal ) > HEAD_ON ) {

				_tangent.set( _normal.z, 0, - _normal.x );
				let side = _forward.dot( _tangent );
				if ( Math.abs( side ) < 0.05 ) side = velocity.dot( _tangent ) || 1;
				if ( side < 0 ) _tangent.negate();
				let open = this.roomAlong( _tangent ) >= TURN_ROOM;
				if ( ! open ) open = this.roomAlong( _tangent.negate() ) >= TURN_ROOM;
				if ( open ) yaw = wrapAngle( Math.atan2( - _tangent.x, - _tangent.z ) - this.yaw );

			}

		}

		if ( this.mode === 'fly' && normal.y > FLOOR && this.pitch < - LEVEL_PITCH ) pitch = - LEVEL_PITCH - this.pitch;
		if ( this.mode === 'fly' && normal.y < - FLOOR && this.pitch > LEVEL_PITCH ) pitch = LEVEL_PITCH - this.pitch;
		const size = Math.max( Math.abs( yaw ), Math.abs( pitch ) );
		if ( size < 0.05 ) return;
		const time = MathUtils.lerp( TURN_TIME[ 0 ], TURN_TIME[ 1 ], Math.min( 1, size / ( Math.PI / 2 ) ) );
		this.turn = { yaw, pitch, time, t: 0, done: 0, mouse: 0 };

	}

	// How far the player could go along the level `dir` before keeping their clearance from
	// something, up to TURN_ROOM: from the camera flying, from the body's wall probes walking.
	// Walking, also only as far as the ground carries on without a drop, e.g. off the landing at a
	// site trailer's door: its guard rail is too thin for the probes, so the turn would walk you
	// through it and off the edge.
	roomAlong( dir ) {

		const walking = this.mode === 'walk';
		const radius = walking ? PLAYER.radius : PLAYER.flyRadius;
		let reach = radius + TURN_ROOM;
		for ( const offset of walking ? this.walkProbes : this.flyProbes ) {

			_origin.copy( this.camera.position );
			_origin.y += offset;
			const hit = this.cast( _origin, dir, reach );
			if ( hit ) reach = hit.distance;

		}

		if ( ! walking ) return reach - radius;
		let floor = this.camera.position.y - PLAYER.eyeHeight;
		for ( let along = ROOM_STEP; along < reach; along += ROOM_STEP ) {

			_origin.copy( this.camera.position ).addScaledVector( dir, along );
			_origin.y = floor + PLAYER.stepHeight;
			const ground = this.cast( _origin, DOWN, PLAYER.stepHeight * 2 );
			if ( ! ground ) return along - ROOM_STEP - radius;
			floor = ground.point.y;

		}

		return reach - radius;

	}

	// Ease the view round on its turn along a wall. Mouse movement adds to it as usual, and enough of
	// it ends the turn (see _onMouseMove).
	advanceTurn( dt ) {

		const { turn } = this;
		if ( ! turn ) return;
		turn.t = Math.min( 1, turn.t + dt / turn.time );
		const eased = MathUtils.smootherstep( turn.t, 0, 1 );
		this.yaw += turn.yaw * ( eased - turn.done );
		this.pitch = MathUtils.clamp( this.pitch + turn.pitch * ( eased - turn.done ), - Math.PI / 2 + 0.01, Math.PI / 2 - 0.01 );
		turn.done = eased;
		if ( turn.t === 1 ) this.turn = null;

	}

	stepWalk( h, move ) {

		const pos = this.camera.position;
		if ( move ) this.moveWithCollisions( move );

		if ( this.checkBuried ) {

			this.checkBuried = false;
			if ( this.liftIfBuried() ) return;

		}

		let feetY = pos.y - PLAYER.eyeHeight;
		const ground = this.groundHit( pos.x, feetY + PLAYER.stepHeight, pos.z );

		if ( ! ground ) {

			// Nothing under the feet: a crack in the mesh (keep going), the tiles still streaming
			// in (hover), or the feet are below the surface.
			this.velocityY = 0;
			this.noGroundTime += h;
			if ( this.noGroundTime >= NO_GROUND_GRACE ) this.groundFound = this.liftIfBuried();
			return;

		}

		this.noGroundTime = 0;
		const groundY = ground.point.y;

		// The floor dropped away under a standing player and a different mesh is below: usually the
		// tile was swapped for a sharper one whose surface is now above the feet. Google's mesh often
		// has a second layer underneath (water under the berth deck) that would otherwise catch them.
		if ( this.grounded && ground.object !== this.standingOn && groundY < feetY - PLAYER.stepHeight && this.liftIfBuried() ) return;

		this.groundFound = true;
		this.velocityY -= PLAYER.gravity * h;
		let newFeetY = feetY + this.velocityY * h;

		// Stop at ceilings when rising.
		if ( this.velocityY > 0 ) {

			_origin.set( pos.x, pos.y, pos.z );
			const hit = this.cast( _origin, UP, newFeetY - feetY + HEAD_CLEARANCE );
			if ( hit ) {

				newFeetY = Math.min( newFeetY, hit.point.y - PLAYER.eyeHeight - HEAD_CLEARANCE );
				this.velocityY = 0;

			}

		}

		const wasGrounded = this.grounded;
		if ( newFeetY <= groundY ) {

			newFeetY = groundY;
			this.velocityY = 0;
			this.grounded = true;

		} else if ( wasGrounded && this.velocityY <= 0 && feetY - groundY <= PLAYER.stepHeight ) {

			// Follow the ground down slopes and small steps instead of hopping off them.
			newFeetY = groundY;
			this.velocityY = 0;

		} else {

			this.grounded = false;

		}

		this.standingOn = this.grounded ? ground.object : null;
		feetY = newFeetY;
		pos.y = feetY + PLAYER.eyeHeight;

	}

	// Try the full move, then slide along each axis if something is in the way. The first wall the
	// full move runs into each frame is kept for the bounce (see update).
	moveWithCollisions( move ) {

		const pos = this.camera.position;
		const feetY = pos.y - PLAYER.eyeHeight;
		let wall = null;

		const tryMove = ( dx, dz ) => {

			const len = Math.hypot( dx, dz );
			if ( len === 0 ) return false;
			_dir.set( dx / len, 0, dz / len );
			wall = this.ghost ? null : this.wallAhead( feetY, len );
			if ( wall ) return false;
			pos.x += dx;
			pos.z += dz;
			return true;

		};

		if ( tryMove( move.x, move.z ) ) return;
		if ( wall && ! this.wall ) this.wall = levelNormal( wall, _dir, this.wallNormal );
		if ( tryMove( move.x, 0 ) ) return;
		tryMove( 0, move.z );

	}

	// What the body would walk into going `len` along _dir: a wall at one of the probes, or anything
	// with a top between step height and the head where the body is going: rails, pipes and beams
	// thin enough to pass between the probes, and slopes too steep to climb.
	wallAhead( feetY, len ) {

		const pos = this.camera.position;
		for ( const height of this.probeHeights ) {

			_origin.set( pos.x, feetY + height, pos.z );
			const hit = this.cast( _origin, _dir, len + PLAYER.radius );
			if ( hit ) return hit;

		}

		const top = feetY + PLAYER.eyeHeight + HEAD_CLEARANCE;
		_origin.set( pos.x, top, pos.z ).addScaledVector( _dir, len + PLAYER.radius );
		return this.cast( _origin, DOWN, top - feetY - PLAYER.stepHeight );

	}

	// If the feet are under a surface that can only be seen from above (the inside of the ground),
	// move up onto the nearest such surface. Only called when being buried is likely (after
	// flying, when the floor drops away, or when there's no ground), since a roof mesh without an
	// underside looks the same. A ceiling that faces down at the player, such as the underside of
	// a conveyor gallery, or being inside one of your own models, means they belong underneath.
	liftIfBuried() {

		const pos = this.camera.position;
		const feetY = pos.y - PLAYER.eyeHeight;
		const base = feetY + PLAYER.stepHeight;

		_origin.set( pos.x, base, pos.z );
		if ( this.isInsideModel( _origin ) ) return false;

		_origin.set( pos.x, feetY + RECOVERY_HEIGHT, pos.z );
		this.raycaster.firstHitOnly = false;
		const hits = this.castAll( _origin, DOWN, RECOVERY_HEIGHT - PLAYER.stepHeight, this.getGround() );
		this.raycaster.firstHitOnly = true;
		if ( hits.length === 0 ) return false;

		// Hits are sorted top-down, so the last one is the surface nearest above the feet. Only a
		// ceiling between the feet and that surface means the player belongs where they are; one
		// higher up, like a shiploader over the buried deck, doesn't.
		const surface = hits[ hits.length - 1 ];
		_origin.set( pos.x, base, pos.z );
		if ( this.cast( _origin, UP, surface.point.y - base ) ) return false;

		pos.y = surface.point.y + PLAYER.eyeHeight;
		this.velocityY = 0;
		this.grounded = true;
		this.standingOn = surface.object;
		return true;

	}

	groundHit( x, y, z ) {

		_origin.set( x, y, z );
		return this.cast( _origin, DOWN, 5000 );

	}

	cast( origin, direction, far ) {

		return this.castAll( origin, direction, far )[ 0 ] ?? null;

	}

	castAll( origin, direction, far, objects = this.getColliders() ) {

		this.raycaster.set( origin, direction );
		this.raycaster.far = far;
		// Lines and points in user models have fat pick thresholds; only solid meshes block.
		return this.raycaster.intersectObjects( objects, true ).filter( blocks );

	}

	dispose() {

		window.removeEventListener( 'keydown', this._onKeyDown, true );
		window.removeEventListener( 'keyup', this._onKeyUp, true );
		window.removeEventListener( 'blur', this._onBlur );
		document.removeEventListener( 'pointerdown', this._onPointerDown, true );
		document.removeEventListener( 'mousemove', this._onMouseMove );
		document.removeEventListener( 'pointerlockchange', this._onLockChange );
		this.domElement.removeEventListener( 'click', this._onClick );
		this.domElement.removeEventListener( 'pointerdown', this._onPointerDownLook );
		this.domElement.removeEventListener( 'pointerup', this._onPointerUpLook );
		this.domElement.removeEventListener( 'contextmenu', this._onContextMenu );

	}

}

// The normal of the surface a ray going along `dir` hit, in world space, facing back along the ray.
function surfaceNormal( hit, dir, target ) {

	if ( hit.face ) target.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld );
	else target.copy( dir ).negate();
	if ( target.dot( dir ) > 0 ) target.negate();
	return target;

}

// The level way back from what a walk along `dir` ran into: the wall's normal, or straight back
// off the top of a rail or a slope too steep to climb.
function levelNormal( hit, dir, target ) {

	surfaceNormal( hit, dir, target ).setY( 0 );
	if ( target.lengthSq() < 0.25 ) return target.copy( dir ).negate();
	return target.normalize();

}

function wrapAngle( angle ) {

	return MathUtils.euclideanModulo( angle + Math.PI, Math.PI * 2 ) - Math.PI;

}

// Whether a raycast hit is something solid. Flatten-zone outlines and the like opt out.
export function blocks( hit ) {

	return hit.object.isMesh && ! hit.object.userData.noCollide && passesHitFilters( hit );

}

// Other modules can rule hits out, e.g. Google's mesh where dug ground hides it.
const hitFilters = [];

export function addHitFilter( filter ) {

	hitFilters.push( filter );

}

export function passesHitFilters( hit ) {

	return hitFilters.every( filter => filter( hit ) );

}

// True while the user is typing in a text field or using a dropdown, where keys must not move
// the player. Buttons and checkboxes don't count: those keep focus after a click.
export function isTyping( e ) {

	const t = e.target;
	// A focused dropdown would also act on arrow and letter keys, changing its value.
	if ( t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable ) return true;
	return t instanceof HTMLInputElement && ! [ 'button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color' ].includes( t.type );

}
