import { Box3, MathUtils, Raycaster, Vector3 } from 'three';
import { enuToLocal, headingToYaw } from './geo.js';
import { blocks, isTyping } from './walk.js';
import { createDriveFx } from './drive-fx.js';

// Race mode: drive a placed vehicle at highway speeds. Arcade physics rather than a simulation:
// the vehicle follows the ground under its wheels, keeps its upward speed off ramps and crests so
// it can jump, and stops dead when it hits a wall or anything else solid.
//
// Three options, off unless an app asks (World Drive turns them on): `fly`, where holding Shift
// lifts the vehicle off and flies it, and letting go glides it back down; `booster`, a rocket on B
// that pushes well past the top speed while its gauge lasts; and `drift`, kart handling: sharp
// steering at low speed, and drifts on Space that pay out a boost.

const KMH = 3.6;
const GRAVITY = 9.81;
const JUMP_SPEED = 7;
// Ground this much below the wheels means the vehicle has left it (off a ramp or a crest).
const LEAVE_GROUND = 0.35;
// Hitting a wall faster than this (m/s) into it says "Crash!".
const CRASH_FLASH = 3;
// The cameras keep this far (m) in front of anything between them and the vehicle.
const CAMERA_CLEARANCE = 0.4;
// ...and the chase camera this far outside the vehicle's own box, boom and all. With less room
// than ROOM behind the vehicle (backed up to a wall) it looks on from above instead.
const OWN_CLEARANCE = 0.3;
const ROOM = 1;
// The wheel moves the chase camera nearer or farther, by this much a notch, between these shares
// of its usual distance (see zoomChase).
const CHASE_STEP = 1.15;
const CHASE_ZOOM = [ 0.5, 4 ];
// Bumper rays look for walls at these heights (m) over the ground under the vehicle, or lower on a
// small one. The low row catches a jersey barrier or a lock block (0.8 m), which a pickup's 0.9 m
// ray passed over, so it drove up and over them; the high one what stands on legs or wheels.
const BUMPERS = [ 0.5, 1.0 ];
// In the cab, the view starts just past (by CAB_MARGIN) a cab whose windscreen isn't see-through
// (painted on), if it's this near (m).
const CAB_SHELL = 1.6;
const CAB_MARGIN = 0.35;

// Flying: climb (m/s) while Shift is held, slowing to a hover this high (m) over the ground; glide
// down (m/s) once it's let go; turn rate (°/s) at full steer.
const FLY_CLIMB = 7;
const FLY_CEILING = 150;
const FLY_GLIDE = 3;
const FLY_YAW = 75;
// Booster: a full gauge fires for BOOST_TIME s and refills in BOOST_RECHARGE s; firing pushes at
// BOOST_ACCEL m/s² up to BOOST_SPEED times the top speed. It needs BOOST_MIN of the gauge to fire.
const BOOST_TIME = 2.5;
const BOOST_RECHARGE = 8;
const BOOST_ACCEL = 28;
const BOOST_SPEED = 2;
const BOOST_MIN = 0.15;
// Kart handling: the most it turns (°/s) at full lock, from walking pace to top speed.
const KART_YAW = [ 150, 55 ];
// Drifts start above DRIFT_MIN m/s, with a hop of DRIFT_HOP m/s. They turn at DRIFT_YAW °/s
// steering out of the turn to into it, and the way the kart travels follows its nose at
// DRIFT_SLIP (1/s) while sliding, GRIP when not. Drifting this long (s) earns each boost level,
// which pays out for `time` s up to `speed` times the top speed.
const DRIFT_MIN = 5;
const DRIFT_HOP = 2.4;
const DRIFT_YAW = [ 40, 110 ];
const DRIFT_SLIP = 2.4;
const GRIP = 12;
const DRIFT_LEVELS = [ 0.7, 1.5, 2.5 ];
const DRIFT_BOOSTS = [ { time: 0.6, speed: 1.2, name: 'Drift boost' }, { time: 1, speed: 1.3, name: 'Big drift boost' }, { time: 1.5, speed: 1.4, name: 'Mega drift boost' } ];
const DRIFT_BOOST_ACCEL = 18;
// R puts the vehicle back on the ground this far ahead (m). Pressing on for STUCK_TIME s at under
// STUCK_SPEED m/s says how to get unstuck.
const RESPAWN_AHEAD = 4;
const STUCK_TIME = 2;
const STUCK_SPEED = 0.3;

// Tuning per vehicle; others use the default. Speeds in km/h, acceleration in m/s².
const SPECS = {
	default: { topSpeed: 160, accel: 6, brake: 11, reverse: 30 },
	'semi-tractor-w900': { topSpeed: 120, accel: 2.8, brake: 7, reverse: 15 },
	'haul-truck-hd465': { topSpeed: 70, accel: 1.8, brake: 5, reverse: 12 },
	'flatbed-trailer': { topSpeed: 100, accel: 2.5, brake: 7, reverse: 10 },
};

const _origin = new Vector3();
const _dir = new Vector3();
const _box = new Box3();
const _size = new Vector3();
const _target = new Vector3();
const _look = new Vector3();
const _normal = new Vector3();
const _eye = new Vector3();
const _toCamera = new Vector3();
const _back = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const DOWN = new Vector3( 0, - 1, 0 );
const UP = new Vector3( 0, 1, 0 );

export class Driver {

	// fly, booster, drift: the options above, all off by default.
	constructor( { camera, models, controls, getColliders, hud, onStop, fly = false, booster = false, drift = false } ) {

		this.camera = camera;
		this.models = models;
		this.controls = controls;
		this.getColliders = getColliders;
		this.hud = hud;
		this.onStop = onStop;
		this.fly = fly;
		this.booster = booster;
		this.drift = drift;
		this.raycaster = new Raycaster();
		this.keys = new Set();
		this.active = false;
		this.cameraMode = 'chase';
		// How far the chase camera is, as a share of its usual distance: kept between drives.
		this.chaseZoom = 1;
		// Machines that aren't driven like a car bring their own controls (see addMachine).
		this.machines = new Map();
		this.machine = null;

		this.driveKeys = [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR', ...booster ? [ 'KeyB' ] : [] ];
		window.addEventListener( 'keydown', e => {

			// Browser shortcuts (Ctrl+R, Cmd+F...) are left to the browser, and don't drive or dig.
			if ( ! this.active || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
			if ( this.driveKeys.includes( e.code ) || this.machine?.keys.includes( e.code ) ) {

				e.preventDefault();
				if ( e.repeat ) this.keys.add( e.code );
				else this.press( e.code );

			}

			if ( e.code === 'KeyC' && ! e.repeat ) this.toggleCamera();
			if ( ( e.code === 'KeyV' || e.code === 'Escape' ) && ! e.repeat ) {

				// Stop here, so the same key press doesn't start driving again.
				e.stopImmediatePropagation();
				this.stop();

			}

		}, true );
		window.addEventListener( 'keyup', e => this.release( e.code ), true );
		window.addEventListener( 'blur', () => this.keys.clear() );
		// A HUD with buttons for touch screens (drive-hud.js) presses keys through press() and release().
		hud.attach?.( this );

	}

	// A key (or a HUD button standing in for one) goes down: held keys drive in update(), and some
	// act once as they go down.
	press( code ) {

		if ( ! this.active ) return;
		this.keys.add( code );
		if ( this.machine ) {

			this.machine.press( code );
			return;

		}

		if ( code === 'Space' && this.grounded ) this.hop();
		else if ( code === 'KeyB' && this.booster ) this.fireBooster();
		else if ( code === 'KeyR' ) this.respawn();

	}

	release( code ) {

		this.keys.delete( code );

	}

	// C: the chase camera, or the driver's seat (the bonnet on a vehicle that doesn't say where its cab is).
	toggleCamera() {

		this.cameraMode = this.cameraMode === 'chase' ? 'hood' : 'chase';

	}

	// A kind of machine, named by `type` in a vehicle's drive spec, that is driven with its own
	// controls rather than like a car: create( { driver, entry, spec } ) returns a controller
	// { keys: [ key codes it uses ], press( code ), update( dt ), stop(), panel } or null to drive it
	// like a car after all. Each frame its update() moves and poses the vehicle, keeps east, north,
	// y and heading here up to date (that's where it parks), shows its readouts in `panel` (an
	// element shown instead of the speedometer) and places the camera.
	addMachine( type, create ) {

		this.machines.set( type, create );

	}

	// The wheel while driving: the chase camera comes nearer (notches under 0) or goes farther.
	// Zooming out from the bonnet camera goes back to the chase camera.
	zoomChase( notches ) {

		if ( this.cameraMode === 'hood' ) {

			if ( notches > 0 ) this.cameraMode = 'chase';
			return;

		}

		this.chaseZoom = MathUtils.clamp( this.chaseZoom * CHASE_STEP ** notches, ...CHASE_ZOOM );

	}

	start( entry, spec ) {

		if ( this.active ) this.stop();
		this.entry = entry;
		this.spec = spec;
		entry.driving = true;

		// Measure the vehicle in its own frame: it faces -Z there once turned by its front axis.
		const { pivot, state } = entry;
		const rotation = pivot.rotation.clone();
		pivot.rotation.set( 0, 0, 0 );
		pivot.updateMatrixWorld( true );
		_box.setFromObject( pivot ).getSize( _size );
		// The same box in the pivot's own frame, for keeping the chase camera out of it.
		this.ownBox = _box.clone().translate( _origin.copy( pivot.position ).negate() );
		this.ownBox.min.divideScalar( pivot.scale.x );
		this.ownBox.max.divideScalar( pivot.scale.x );
		pivot.rotation.copy( rotation );
		pivot.updateMatrixWorld( true );
		this.length = _size.z;
		this.width = _size.x;
		this.height = _size.y;
		this.wheelbase = this.length * 0.6;
		this.bumpers = [ ...new Set( BUMPERS.map( up => Math.min( up, this.height * 0.4 ) ) ) ];
		// How far it reaches ahead of and behind where it stands (east, north), which for a crane is
		// its carrier rather than the middle of its box.
		this.front = pivot.position.z - _box.min.z;
		this.rear = _box.max.z - pivot.position.z;
		// Where the driver sits, if the library says (see specFor), from where it stands, and the
		// same point in the pivot's frame.
		const { cab } = spec;
		this.cab = cab ? { ahead: cab.ahead + ( this.front - this.rear ) / 2, right: cab.right + ( _box.min.x + _box.max.x ) / 2 - pivot.position.x, up: cab.up } : null;
		this.cabEye = this.cab ? new Vector3( this.cab.right, this.cab.up, - this.cab.ahead ).divideScalar( pivot.scale.x ) : null;

		this.east = state.east;
		this.north = state.north;
		this.y = state.up;
		this.heading = state.heading;
		// The way it's travelling, which only differs from the way it points while drifting.
		this.course = this.heading;
		this.speed = 0;
		this.steer = 0;
		this.vy = 0;
		// Tilted as it was parked (see models.park), so it doesn't jolt level first.
		this.pitch = rotation.x;
		this.roll = rotation.z;
		this.grounded = true;
		this.airTime = 0;
		this.bestAir = 0;
		this.topSpeed = 0;
		this.lastSafe = { east: this.east, north: this.north, y: this.y };
		this.flying = false;
		this.gauge = 1;
		this.firing = false;
		this.drifting = 0;
		this.driftTime = 0;
		this.driftLevel = 0;
		this.driftHop = false;
		this.boost = null;
		this.stuckTime = 0;
		// Where R puts it back when it can't go a little ahead: a spot it drove through freely.
		this.lastGood = { east: this.east, north: this.north, y: this.y };
		this.recentGood = this.lastGood;
		this.goodTimer = 0;

		// Parts that move as it drives (a kart's wheels: see kart.js), and what the cab view hides:
		// the driver's own head, and glass, which would only tint the view.
		this.animators = [];
		this.cabHidden = [];
		pivot.traverse( object => {

			if ( object.userData.onDrive ) this.animators.push( object.userData.onDrive );
			const glass = object.isMesh && [ object.material ].flat().every( m => m.transparent );
			if ( object.userData.hideInCab || glass ) this.cabHidden.push( object );

		} );
		this.near = this.camera.near;
		this.cabNear = this.cab ? this.measureCab() : null;
		this.cabShown = false;
		this.lastBase = null;
		this.fx = this.booster || this.drift ? createDriveFx( this.models.group.parent ?? this.models.group ) : null;

		this.keys.clear();
		this.controls.keys?.clear();
		this.controls.enabled = false;
		document.exitPointerLock?.();
		this.active = true;
		this.machine = this.machines.get( spec.type )?.( { driver: this, entry, spec } ) ?? null;
		this.hud.show( entry.state.name, this.machine?.panel );
		this.hud.setFlying?.( false );
		this.hud.setBoost?.( this.booster ? this.gauge : null );
		if ( this.machine ) this.machine.update( 0 );
		else this.placeCamera( 1 );

	}

	stop() {

		if ( ! this.active ) return;
		this.active = false;
		this.machine?.stop();
		this.machine = null;
		const { entry } = this;
		entry.driving = false;
		this.showCab( false );
		this.fx?.dispose();
		this.fx = null;

		// Park it where it stopped, as it stands: tilted on the ground under its wheels or tracks, up
		// a pile or down in a hole. If it's in the air it drops back onto the ground instead. Save that.
		entry.state.east = Math.round( this.east * 100 ) / 100;
		entry.state.north = Math.round( this.north * 100 ) / 100;
		entry.state.heading = Math.round( ( ( this.heading % 360 ) + 360 ) % 360 * 10 ) / 10;
		entry.state.up = this.y;
		const { x: pitch, z: roll } = entry.pivot.rotation;
		this.models.park( entry, this.grounded ? { pitch: pitch * MathUtils.RAD2DEG, roll: roll * MathUtils.RAD2DEG } : null );

		// Step out on the driver's side, facing the way the vehicle points.
		const rad = this.heading * Math.PI / 180;
		const side = this.width / 2 + 1.2;
		const { east, north } = { east: this.east - Math.cos( rad ) * side, north: this.north + Math.sin( rad ) * side };
		this.controls.setPose?.( enuToLocal( east, north, this.y + 1.7 + 0.5 ), this.heading, 0 );
		this.controls.setMode?.( 'walk' );
		this.controls.enabled = true;
		this.hud.hide();
		this.onStop?.( entry );

	}

	update( dt ) {

		if ( ! this.active ) return;
		if ( ! this.models.entries.includes( this.entry ) ) {

			this.stop();
			return;

		}

		if ( this.machine ) {

			this.machine.update( dt );
			return;

		}

		const { keys, spec } = this;
		const throttle = keys.has( 'KeyW' ) || keys.has( 'ArrowUp' );
		const brake = keys.has( 'KeyS' ) || keys.has( 'ArrowDown' );
		const steerInput = this.steerInput();
		const shift = keys.has( 'ShiftLeft' ) || keys.has( 'ShiftRight' );
		// With flying on, Shift lifts off; otherwise it boosts.
		const boost = shift && ! this.fly;
		if ( shift && this.fly && ! this.flying ) this.takeOff();
		const east = this.east;
		const north = this.north;

		// Speed. Boost raises the top speed by a third.
		const top = spec.topSpeed * ( boost ? 4 / 3 : 1 ) / KMH;
		if ( this.grounded || this.flying ) {

			if ( throttle && this.speed >= - 0.5 ) {

				this.speed += spec.accel * ( boost ? 1.6 : 1 ) * Math.max( 0, 1 - ( this.speed / top ) ** 2 ) * dt;

			} else if ( brake ) {

				if ( this.speed > 0.5 ) this.speed -= spec.brake * dt;
				else this.speed = Math.max( this.speed - spec.accel * 0.6 * dt, - spec.reverse / KMH );

			} else if ( throttle ) {

				this.speed += spec.brake * dt;

			} else {

				// Rolling resistance and air drag.
				const drag = ( 0.4 + 0.0009 * this.speed * this.speed ) * dt;
				this.speed = Math.abs( this.speed ) <= drag ? 0 : this.speed - Math.sign( this.speed ) * drag;

			}

		}

		if ( this.booster || this.drift ) this.thrust( dt, top );

		if ( this.flying ) {

			// In the air it turns like a hovercraft, at the same rate whatever its speed.
			this.steer += ( steerInput - this.steer ) * Math.min( 1, dt * 4 );
			this.heading += this.steer * FLY_YAW * dt;
			this.course = this.heading;

		} else if ( this.drift ) {

			this.kartSteer( dt, steerInput );

		} else {

			// Steering: smoothed, with less lock at speed (bicycle model).
			this.steer += ( steerInput - this.steer ) * Math.min( 1, dt * 4 );
			const maxAngle = MathUtils.lerp( 35, 3.5, MathUtils.clamp( Math.abs( this.speed ) / 40, 0, 1 ) ) * MathUtils.DEG2RAD;
			const yawRate = this.speed / this.wheelbase * Math.tan( this.steer * maxAngle ) * ( this.grounded ? 1 : 0.2 );
			this.heading += yawRate * MathUtils.RAD2DEG * dt;
			this.course = this.heading;

		}

		this.move( dt );

		// Ground under the front and rear axles and the left and right sides.
		const rad = this.heading * Math.PI / 180;
		const fx = Math.sin( rad ), fz = Math.cos( rad );
		const half = this.wheelbase / 2;
		const track = this.width * 0.4;
		const front = this.groundAt( this.east + fx * half, this.north + fz * half );
		const rear = this.groundAt( this.east - fx * half, this.north - fz * half );
		const left = this.groundAt( this.east - fz * track, this.north + fx * track );
		const right = this.groundAt( this.east + fz * track, this.north - fx * track );
		const heights = [ front, rear ].filter( h => h !== null );

		if ( this.flying ) {

			this.flyHeight( dt, shift, heights.length ? Math.max( ...heights ) : null );

		} else if ( heights.length === 0 ) {

			// Off the edge of the world: put it back where it last stood.
			if ( this.y < this.lastSafe.y - 200 ) Object.assign( this, this.lastSafe, { speed: 0, vy: 0 } );
			this.vy -= GRAVITY * dt;
			this.y += this.vy * dt;

		} else {

			// It rests on whichever axle is higher, tilted by the difference.
			const ground = Math.max( ...heights );
			const slope = front !== null && rear !== null ? ( front - rear ) / this.wheelbase : 0;

			if ( this.grounded && ground < this.y - LEAVE_GROUND ) {

				// The ground fell away (a ramp's end, a crest): keep flying with the upward speed we had.
				this.grounded = false;

			}

			if ( this.grounded ) {

				this.y = ground;
				// Climb rate from the slope under both axles. Once the front wheels hang over an edge,
				// keep the rate from the ramp so the vehicle carries it into the air.
				const frontSupported = front !== null && front > ground - LEAVE_GROUND;
				if ( frontSupported ) this.vy = this.speed * MathUtils.clamp( slope, - 1, 1 );
				this.pitch += ( Math.atan( frontSupported ? slope : this.vy / Math.max( 1, Math.abs( this.speed ) ) ) - this.pitch ) * Math.min( 1, dt * 10 );
				this.lastSafe = { east: this.east, north: this.north, y: this.y };

			} else {

				this.vy -= GRAVITY * dt;
				this.y += this.vy * dt;
				this.airTime += dt;
				this.pitch += ( MathUtils.clamp( this.vy / Math.max( 1, Math.abs( this.speed ) ), - 0.5, 0.5 ) - this.pitch ) * Math.min( 1, dt * 2 );
				if ( this.y <= ground ) {

					this.y = ground;
					// A drift's little hop isn't a jump.
					if ( this.airTime > 0.4 && ! this.driftHop ) this.hud.flash( `${ this.airTime.toFixed( 1 ) } s air` );
					if ( ! this.driftHop ) this.bestAir = Math.max( this.bestAir, this.airTime );
					if ( this.vy < - 12 ) this.speed *= 0.8;
					this.vy = 0;
					this.airTime = 0;
					this.grounded = true;
					this.driftHop = false;

				}

			}

		}

		// Level with the ground across the wheels; banked into the turn when flying, and leaning out
		// of a drift a little.
		const sideSlope = left !== null && right !== null ? ( right - left ) / ( track * 2 ) : 0;
		const lean = this.flying ? - this.steer * 0.3 : this.grounded ? Math.atan( sideSlope ) + this.drifting * 0.05 : this.roll;
		this.roll += ( lean - this.roll ) * Math.min( 1, dt * 8 );

		// Pose the model. It faces -Z in its pivot, so pitch is about X and roll about Z.
		const { pivot } = this.entry;
		enuToLocal( this.east, this.north, this.y, pivot.position );
		pivot.rotation.set( this.pitch, headingToYaw( this.heading ), this.roll, 'YXZ' );
		pivot.updateMatrixWorld( true );
		// Front wheels turned against a drift, as a kart's are.
		const wheels = this.drifting ? this.steer * 0.3 - this.drifting * 0.6 : this.steer;
		for ( const animate of this.animators ) animate( { steer: wheels, speed: this.speed, dt } );
		this.updateFx( dt );

		this.checkStuck( dt, throttle || brake, Math.hypot( this.east - east, this.north - north ) );
		this.topSpeed = Math.max( this.topSpeed, Math.abs( this.speed ) );
		this.hud.update( {
			kmh: Math.abs( this.speed ) * KMH, reverse: this.speed < - 0.3, top: this.topSpeed * KMH, bestAir: this.bestAir, air: this.grounded || this.flying ? 0 : this.airTime,
			boost: this.booster || this.drift ? this.firing || !! this.boost : boost,
			altitude: this.flying ? this.altitude : null, drift: this.drifting ? this.driftLevel : null,
		} );
		if ( this.booster ) this.hud.setBoost?.( this.gauge );
		this.placeCamera( dt );

	}

	steerInput() {

		const { keys } = this;
		return ( keys.has( 'KeyD' ) || keys.has( 'ArrowRight' ) ? 1 : 0 ) - ( keys.has( 'KeyA' ) || keys.has( 'ArrowLeft' ) ? 1 : 0 );

	}

	// Space on the ground: a hop. With kart handling, steering at speed, it's a little hop into a drift.
	hop() {

		const steer = this.steerInput();
		if ( this.drift && steer !== 0 && this.speed > DRIFT_MIN ) {

			this.vy = DRIFT_HOP;
			this.driftHop = true;
			this.startDrift( steer );

		} else {

			this.vy = JUMP_SPEED;
			this.driftHop = false;

		}

		this.grounded = false;

	}

	// Kart handling: sharp steering at low speed that eases off with speed, and drifts. Hold Space
	// while steering at speed and the kart slides round the turn nose-in for as long as it's held,
	// tighter steering into it and wider steering out; let go and it gets a boost that grows with
	// the drift's length.
	kartSteer( dt, steerInput ) {

		this.steer += ( steerInput - this.steer ) * Math.min( 1, dt * 10 );
		const space = this.keys.has( 'Space' );
		if ( ! this.drifting && space && steerInput !== 0 && this.grounded && this.speed > DRIFT_MIN ) this.startDrift( steerInput );
		if ( this.drifting && ! space ) this.endDrift( true );
		else if ( this.drifting && this.speed < DRIFT_MIN * 0.6 ) this.endDrift( false );

		let yawRate;
		if ( this.drifting ) {

			yawRate = this.drifting * MathUtils.lerp( ...DRIFT_YAW, ( this.steer * this.drifting + 1 ) / 2 );
			this.speed -= this.speed * 0.1 * dt;
			this.driftTime += dt;
			const level = DRIFT_LEVELS.filter( time => this.driftTime >= time ).length;
			if ( this.grounded ) this.driftLevel = Math.max( this.driftLevel, level );

		} else {

			// Full lock as a bicycle near standstill, capped at a rate that eases off with speed.
			const speed = Math.abs( this.speed );
			const lock = speed / this.wheelbase * Math.tan( 35 * MathUtils.DEG2RAD ) * MathUtils.RAD2DEG;
			const cap = MathUtils.lerp( ...KART_YAW, MathUtils.clamp( speed / ( this.spec.topSpeed / KMH ), 0, 1 ) );
			yawRate = Math.sign( this.speed ) * this.steer * Math.min( lock, cap );

		}

		this.heading += yawRate * ( this.grounded ? 1 : 0.5 ) * dt;
		// The way it travels follows the way it points: slowly while sliding, almost at once with grip.
		const slip = ( ( this.heading - this.course ) % 360 + 540 ) % 360 - 180;
		this.course += slip * Math.min( 1, dt * ( this.drifting ? DRIFT_SLIP : GRIP ) );

	}

	startDrift( direction ) {

		this.drifting = Math.sign( direction );
		this.driftTime = 0;
		this.driftLevel = 0;

	}

	// Out of the drift; let go of Space after a long enough one (`paid`) and it pays out its boost.
	endDrift( paid ) {

		if ( paid && this.driftLevel > 0 ) {

			const boost = DRIFT_BOOSTS[ this.driftLevel - 1 ];
			this.boost = { ...boost, left: boost.time };
			this.hud.flash( boost.name );

		}

		this.drifting = 0;
		this.driftLevel = 0;

	}

	fireBooster() {

		if ( this.firing || this.gauge < BOOST_MIN ) return;
		this.firing = true;

	}

	// The booster and drift boosts push past the top speed while they last; after them it comes
	// back down to the top speed.
	thrust( dt, top ) {

		const base = this.spec.topSpeed / KMH;
		if ( this.firing ) {

			this.gauge = Math.max( 0, this.gauge - dt / BOOST_TIME );
			if ( this.gauge === 0 ) this.firing = false;
			if ( this.speed < base * BOOST_SPEED ) this.speed = Math.min( this.speed + BOOST_ACCEL * dt, base * BOOST_SPEED );

		} else {

			this.gauge = Math.min( 1, this.gauge + dt / BOOST_RECHARGE );

		}

		if ( this.boost ) {

			if ( this.speed < base * this.boost.speed ) this.speed = Math.min( this.speed + DRIFT_BOOST_ACCEL * dt, base * this.boost.speed );
			this.boost.left -= dt;
			if ( this.boost.left <= 0 ) this.boost = null;

		} else if ( ! this.firing && this.speed > top && ( this.grounded || this.flying ) ) {

			this.speed = Math.max( top, this.speed - ( this.speed - top ) * Math.min( 1, dt * 1.2 ) - dt );

		}

	}

	// Shift held: off the ground and up. Steering, gas and brake keep working in the air.
	takeOff() {

		this.flying = true;
		this.grounded = false;
		this.airTime = 0;
		this.driftHop = false;
		if ( this.drifting ) this.endDrift( false );
		this.hud.setFlying?.( true );

	}

	// Height while flying: climbing toward a hover with Shift held, gliding down without it, never
	// below the ground and never up through a roof or a bridge. Touching down is gentle, whatever
	// the speed.
	flyHeight( dt, shift, ground ) {

		this.altitude = ground === null ? null : Math.max( 0, this.y - ground );
		const climb = shift ? FLY_CLIMB * MathUtils.clamp( 1 - ( this.altitude ?? 0 ) / FLY_CEILING, - 0.5, 1 ) : - FLY_GLIDE;
		this.vy += ( climb - this.vy ) * Math.min( 1, dt * 2.5 );
		if ( this.vy > 0 ) {

			enuToLocal( this.east, this.north, this.y + this.height / 2, _origin );
			if ( this.cast( _origin, UP, this.height / 2 + this.vy * dt + 0.2 ) ) this.vy = 0;

		}

		this.y += this.vy * dt;
		if ( ground !== null && this.y <= ground ) {

			this.y = ground;
			this.vy = Math.max( this.vy, 0 );
			if ( ! shift ) this.land();

		}

		this.pitch += ( MathUtils.clamp( this.vy / Math.max( 6, Math.abs( this.speed ) ), - 0.35, 0.35 ) - this.pitch ) * Math.min( 1, dt * 3 );

	}

	land() {

		this.flying = false;
		this.grounded = true;
		this.vy = 0;
		this.airTime = 0;
		this.hud.setFlying?.( false );

	}

	// R: back on the ground a few metres ahead, upright and stopped, or if that's blocked or there's
	// no ground there, at a spot it drove through freely a moment ago.
	respawn() {

		const rad = this.heading * Math.PI / 180;
		const de = Math.sin( rad ), dn = Math.cos( rad );
		let spot = null;
		if ( ! this.wallAhead( de, dn, RESPAWN_AHEAD ) ) {

			const east = this.east + de * RESPAWN_AHEAD;
			const north = this.north + dn * RESPAWN_AHEAD;
			const ground = this.groundAt( east, north );
			if ( ground !== null && Math.abs( ground - this.y ) < 3 ) spot = { east, north, y: ground };

		}

		Object.assign( this, spot ?? this.lastGood, { speed: 0, vy: 0, steer: 0, pitch: 0, roll: 0, course: this.heading, grounded: true, airTime: 0, stuckTime: 0, driftHop: false, boost: null } );
		if ( this.flying ) this.land();
		if ( this.drifting ) this.endDrift( false );
		this.recentGood = this.lastGood = { east: this.east, north: this.north, y: this.y };
		this.hud.flash( 'Back on the road' );

	}

	// Pressing on without getting anywhere says how to get unstuck. Meanwhile, remember where it
	// moves freely, for R.
	checkStuck( dt, pressing, moved ) {

		if ( pressing && moved < STUCK_SPEED * dt && ! this.flying ) this.stuckTime += dt;
		else this.stuckTime = Math.min( 0, this.stuckTime + dt );
		if ( this.stuckTime >= STUCK_TIME ) {

			this.hud.flash( this.fly ? 'Stuck? Hold Shift to fly or press R' : 'Stuck? Press R' );
			// Again in a few seconds if it's still stuck.
			this.stuckTime = - 2;

		}

		this.goodTimer += dt;
		if ( this.grounded && Math.abs( this.speed ) > 1 && moved > 0.5 * dt && this.goodTimer >= 0.5 ) {

			this.goodTimer = 0;
			this.lastGood = this.recentGood;
			this.recentGood = { east: this.east, north: this.north, y: this.y };

		}

	}

	updateFx( dt ) {

		if ( ! this.fx ) return;
		const { scale } = this.entry.pivot;
		const wheel = ( this.rear - this.length * 0.2 ) / scale.x;
		const track = this.width * 0.4 / scale.x;
		this.fx.update( {
			pivot: this.entry.pivot,
			size: { width: this.width, height: this.height, rear: this.rear, scale: scale.x },
			wheels: [ _a.set( - track, 0.05, wheel ), _b.set( track, 0.05, wheel ) ],
			velocity: _target.set( - Math.sin( this.course * Math.PI / 180 ) * this.speed, this.vy, Math.cos( this.course * Math.PI / 180 ) * this.speed ),
			flame: this.firing ? 1 : this.boost ? 0.55 : 0,
			drifting: !! this.drifting && this.grounded,
			level: this.driftLevel,
			dt,
		} );

	}

	// Drive on at this frame's speed, up to anything solid in the way at bumper height, and stop
	// there.
	move( dt ) {

		const rad = this.course * Math.PI / 180;
		const ve = Math.sin( rad ) * this.speed;
		const vn = Math.cos( rad ) * this.speed;
		const v = Math.hypot( ve, vn );
		if ( v * dt < 1e-6 ) return;

		const wall = this.wallAhead( ve / v, vn / v, v * dt );
		const travel = wall ? wall.travel : v * dt;
		this.east += ve / v * travel;
		this.north += vn / v * travel;
		if ( wall ) this.crash( ve, vn, wall );

	}

	// The nearest wall in the way of going `distance` metres east and north by ( de, dn ), as seen by
	// rows of rays at the bumper heights from the middle and both sides of the leading end: how far
	// the vehicle can go before touching it, and its normal (east, north) facing back at the vehicle.
	// The ground and ramps aren't walls, and nor is the side of a rib on a corrugated wall: a wall is
	// only one that is there looking straight at it from where the ray started.
	wallAhead( de, dn, distance ) {

		const rad = this.heading * Math.PI / 180;
		const along = de * Math.sin( rad ) + dn * Math.cos( rad );
		const reach = ( along >= 0 ? this.front : this.rear ) * Math.abs( along ) + this.width / 2 * Math.sqrt( Math.max( 0, 1 - along * along ) );
		const side = Math.max( 0, this.width / 2 - 0.1 );
		_dir.set( - de, 0, dn );
		let wall = null;
		for ( const up of this.bumpers ) for ( const right of [ 0, - side, side ] ) {

			enuToLocal( this.east + dn * right, this.north - de * right, this.y + up, _origin );
			const hit = this.cast( _origin, _dir, distance + reach );
			if ( ! hit?.face ) continue;
			_normal.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld );
			if ( Math.abs( _normal.y ) >= 0.5 ) continue;
			const travel = Math.max( 0, hit.distance - reach );
			if ( wall && travel >= wall.travel ) continue;
			const length = Math.hypot( _normal.x, _normal.z );
			const facing = - _normal.x * de + _normal.z * dn > 0 ? - 1 : 1;
			const east = - _normal.x / length * facing;
			const north = _normal.z / length * facing;
			_back.set( east, 0, - north );
			const ahead = this.cast( _origin, _back, hit.distance + 1 );
			if ( ! ahead?.face || Math.abs( _normal.copy( ahead.face.normal ).transformDirection( ahead.object.matrixWorld ).dot( _back ) ) < 0.7 ) continue;
			wall = { travel, east, north };

		}

		return wall;

	}

	// Hit a wall at ( ve, vn ) m/s east and north: the vehicle stops against it, where it is,
	// facing as it was. Backing away (or steering along it) drives off again. A drift or a drift
	// boost ends there too.
	crash( ve, vn, wall ) {

		const into = - ( ve * wall.east + vn * wall.north );
		if ( into <= 0 ) return;
		this.speed = 0;
		this.course = this.heading;
		this.boost = null;
		if ( this.drifting ) this.endDrift( false );
		if ( into > CRASH_FLASH ) this.hud.flash( 'Crash!' );

	}

	placeCamera( dt ) {

		const rad = this.heading * Math.PI / 180;
		const forward = _dir.set( - Math.sin( rad ), 0, Math.cos( rad ) );
		const base = enuToLocal( this.east, this.north, this.y, _origin );
		const { cab } = this;
		// The height the cameras frame: the vehicle's, or where its box is mostly boom or mast (a
		// crane), its cab's, so they show the carrier and the way ahead rather than the boom.
		const height = cab ? cab.up / 0.8 : this.height;
		const inCab = this.cameraMode === 'hood' && !! cab;
		this.showCab( inCab );
		// Where the chase camera last followed it from (see below); not while it's in another view.
		if ( this.cameraMode !== 'chase' ) this.lastBase = null;
		if ( inCab ) {

			// At the driver's eyes, turned and tilted with the vehicle, looking down the road ahead.
			const { pivot } = this.entry;
			pivot.localToWorld( this.camera.position.copy( this.cabEye ) );
			pivot.localToWorld( _look.set( 0, - 1.4, - 10 ).divideScalar( pivot.scale.x ).add( this.cabEye ) );

		} else if ( this.cameraMode === 'hood' ) {

			_target.copy( base ).addScaledVector( forward, this.length * 0.15 ).setY( base.y + height * 0.8 );
			this.camera.position.copy( _target );
			this.pullInFront( _eye.copy( base ).setY( base.y + height * 0.8 ), this.camera.position );
			_look.copy( base ).addScaledVector( forward, 8 ).setY( base.y + height * 0.6 );

		} else {

			// Never inside a building, a container or the vehicle itself: the camera heads for a spot
			// behind and above the vehicle's box (a crane's boom and all), in front of whatever is
			// behind it, and on the way there it keeps out of both. A small vehicle has it nearer.
			const reach = Math.min( 5, 1.5 + this.length );
			const lift = Math.min( 2.5, 0.6 + this.length * 0.4 ) * this.chaseZoom;
			const back = this.rear + ( this.length * 0.3 + reach ) * this.chaseZoom;
			_target.copy( base ).addScaledVector( forward, - back ).setY( base.y + height + lift );
			_eye.copy( base ).setY( base.y + height * 0.8 );
			this.clearView( _eye, _target, base, lift );
			// It moves with the vehicle and eases round after it as it turns, so it doesn't fall
			// behind at speed.
			if ( this.lastBase ) this.camera.position.add( _a.subVectors( base, this.lastBase ) );
			this.lastBase = ( this.lastBase ?? new Vector3() ).copy( base );
			this.camera.position.lerp( _target, 1 - Math.exp( - dt * 6 ) );
			this.keepOut( _eye, this.camera.position );
			_look.copy( base ).addScaledVector( forward, 8 ).setY( base.y + height * 0.6 );

		}

		this.camera.lookAt( _look );
		// Keep the walk controller's view direction in step for when we get out.
		this.controls.yaw = headingToYaw( this.heading );
		this.controls.pitch = 0;

	}

	// Bring the chase camera's `target` in front of anything solid between it and `eye` (a point
	// in the vehicle), but no nearer than just outside the vehicle's own box. With no room for it
	// behind the vehicle (backed up to a wall), it goes up over the vehicle instead.
	clearView( eye, target, base, lift ) {

		_toCamera.subVectors( target, eye );
		const distance = _toCamera.length();
		_toCamera.divideScalar( distance );
		const out = this.leaveOwnBox( eye, _toCamera, distance );
		const hit = this.cast( eye, _toCamera, Math.max( distance, out ) + CAMERA_CLEARANCE );
		const free = hit ? hit.distance - CAMERA_CLEARANCE : Infinity;
		if ( free >= out + ROOM ) {

			target.copy( eye ).addScaledVector( _toCamera, Math.min( Math.max( distance, out ), free ) );
			return;

		}

		target.copy( base ).setY( base.y + this.height + Math.max( lift, 1.5 ) );
		this.keepOut( eye, target );

	}

	// Keep `point` (the camera) outside the vehicle's own box, moving it out along the line from
	// `eye` (a point in the vehicle), and in front of anything solid along that line, but not back
	// inside the box for it.
	keepOut( eye, point ) {

		_toCamera.subVectors( point, eye );
		const distance = _toCamera.length();
		if ( distance < 1e-3 ) return;
		_toCamera.divideScalar( distance );
		const out = this.leaveOwnBox( eye, _toCamera, distance );
		const far = Math.max( distance, out );
		const hit = this.cast( eye, _toCamera, far + CAMERA_CLEARANCE );
		point.copy( eye ).addScaledVector( _toCamera, hit ? Math.max( out, Math.min( far, hit.distance - CAMERA_CLEARANCE ) ) : far );

	}

	// How far along `dir` from `origin` the line leaves the vehicle's box grown by OWN_CLEARANCE;
	// 0 if `origin` is outside it already.
	leaveOwnBox( origin, dir, distance ) {

		const { pivot } = this.entry;
		const scale = pivot.scale.x;
		pivot.worldToLocal( _a.copy( origin ) );
		pivot.worldToLocal( _b.copy( origin ).addScaledVector( dir, distance ) ).sub( _a );
		const grow = OWN_CLEARANCE / scale;
		const { min, max } = this.ownBox;
		let leave = Infinity;
		for ( const axis of [ 'x', 'y', 'z' ] ) {

			const lo = min[ axis ] - grow;
			const hi = max[ axis ] + grow;
			if ( _a[ axis ] < lo || _a[ axis ] > hi ) return 0;
			const d = _b[ axis ];
			if ( d > 1e-9 ) leave = Math.min( leave, ( hi - _a[ axis ] ) / d );
			else if ( d < - 1e-9 ) leave = Math.min( leave, ( lo - _a[ axis ] ) / d );

		}

		return leave === Infinity ? 0 : leave * distance;

	}

	// The driver's-seat view hides the driver's own head and the glass, and starts just past a cab
	// shell whose windows aren't see-through (cabNear, see measureCab).
	showCab( on ) {

		if ( on === this.cabShown ) return;
		this.cabShown = on;
		for ( const object of this.cabHidden ) object.visible = ! on;
		this.camera.near = on && this.cabNear ? this.cabNear : this.near;
		this.camera.updateProjectionMatrix();

	}

	// Where the driver's-seat view should start: just past the windscreen if the driver would see
	// the inside of it (a cab with painted-on windows), found by looking out a little above
	// straight ahead, where a see-through windscreen (hidden in this view) lets the eye out. Null
	// for a cab that has one, so its dashboard stays in view.
	measureCab() {

		const { pivot } = this.entry;
		pivot.localToWorld( _eye.copy( this.cabEye ) );
		pivot.localToWorld( _look.set( 0, 0.9, - 10 ).divideScalar( pivot.scale.x ).add( this.cabEye ) ).sub( _eye ).normalize();
		this.raycaster.set( _eye, _look );
		this.raycaster.far = CAB_SHELL;
		const hit = this.raycaster.intersectObject( pivot, true )
			.find( h => h.object.isMesh && ! this.cabHidden.some( hidden => isInside( h.object, hidden ) ) );
		return hit ? hit.distance + CAB_MARGIN : null;

	}

	// Move `point` toward `from` (on the vehicle) to just in front of anything solid between them.
	pullInFront( from, point ) {

		_toCamera.subVectors( point, from );
		const distance = _toCamera.length();
		if ( distance < 1e-3 ) return;
		_toCamera.divideScalar( distance );
		const hit = this.cast( from, _toCamera, distance + CAMERA_CLEARANCE );
		if ( hit ) point.copy( from ).addScaledVector( _toCamera, Math.max( 0, hit.distance - CAMERA_CLEARANCE ) );

	}

	groundAt( east, north ) {

		enuToLocal( east, north, this.y + 4, _origin );
		const hit = this.cast( _origin, DOWN, 400 );
		return hit ? hit.point.y : null;

	}

	// Nearest solid hit, ignoring the vehicle itself.
	cast( origin, direction, far ) {

		this.raycaster.set( origin, direction );
		this.raycaster.far = far;
		const { pivot } = this.entry;
		return this.raycaster.intersectObjects( this.getColliders(), true )
			.find( hit => blocks( hit ) && ! isInside( hit.object, pivot ) ) ?? null;

	}

}

// A library item can also give its own tuning as "drive": { topSpeed, accel, brake, reverse }
// in library.json, which makes it drivable whatever its category. It can also give "cab":
// { ahead, right, up }, where the driver's eyes are in metres from the middle of its box at ground
// level, for the driver's-seat camera (and a crane, whose box is mostly boom or mast, for framing
// the chase camera on its carrier); and "pivot": { ahead }, the point it stands and turns on in
// metres ahead of that middle (see itemConfig and models.js).
export function specFor( item ) {

	return { ...SPECS.default, ...SPECS[ item?.id ], ...item?.drive };

}

function isInside( object, ancestor ) {

	for ( let o = object; o; o = o.parent ) if ( o === ancestor ) return true;
	return false;

}

// The speedometer and race readouts.
export function createDriveHud() {

	const root = document.getElementById( 'drive-hud' );
	const gauge = root.querySelector( '.gauge' );
	const keys = root.querySelector( '.keys' );
	const speed = root.querySelector( '.speed' );
	const unit = root.querySelector( '.unit' );
	const needle = root.querySelector( '.needle' );
	const arc = root.querySelector( '.arc-fill' );
	const name = root.querySelector( '.vehicle' );
	const stats = root.querySelector( '.stats' );
	const flash = root.querySelector( '.flash' );
	const MAX = 220;
	const ARC = 270;
	let flashTimer;
	let panel = null;

	return {

		// A machine with its own readouts (an excavator) shows its panel instead of the speedometer.
		show( vehicleName, machinePanel = null ) {

			name.textContent = vehicleName;
			panel?.remove();
			panel = machinePanel;
			if ( panel ) name.after( panel );
			for ( const element of [ gauge, stats, keys ] ) element.hidden = !! panel;
			root.hidden = false;
			document.body.classList.add( 'driving' );

		},

		hide() {

			root.hidden = true;
			panel?.remove();
			panel = null;
			document.body.classList.remove( 'driving' );

		},

		update( { kmh, reverse, top, bestAir, air, boost } ) {

			speed.textContent = Math.round( kmh );
			unit.textContent = reverse ? 'km/h  R' : 'km/h';
			const angle = Math.min( kmh, MAX ) / MAX * ARC - ARC / 2;
			needle.setAttribute( 'transform', `rotate(${ angle.toFixed( 1 ) } 60 60)` );
			arc.style.strokeDashoffset = String( 100 - Math.min( kmh, MAX ) / MAX * 100 );
			root.classList.toggle( 'boost', boost );
			stats.textContent = `top ${ Math.round( top ) } km/h · best jump ${ bestAir.toFixed( 1 ) } s${ air > 0.2 ? ` · air ${ air.toFixed( 1 ) } s` : '' }`;

		},

		flash( message ) {

			flash.textContent = message;
			flash.hidden = false;
			clearTimeout( flashTimer );
			flashTimer = setTimeout( () => flash.hidden = true, 1500 );

		},

	};

}
