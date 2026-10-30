import { Box3, MathUtils, Raycaster, Vector3 } from 'three';
import { enuToLocal, headingToYaw, localToEnu } from './geo.js';
import { blocks, isTyping } from './walk.js';

// Race mode: drive a placed vehicle at highway speeds. Arcade physics rather than a simulation:
// the vehicle follows the ground under its wheels, keeps its upward speed off ramps and crests so
// it can jump, and stops (with a bounce) when it hits a wall.

const KMH = 3.6;
const GRAVITY = 9.81;
const JUMP_SPEED = 7;
// Ground this much below the wheels means the vehicle has left it (off a ramp or a crest).
const LEAVE_GROUND = 0.35;

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
const DOWN = new Vector3( 0, - 1, 0 );

export class Driver {

	constructor( { camera, models, controls, getColliders, hud, onStop } ) {

		this.camera = camera;
		this.models = models;
		this.controls = controls;
		this.getColliders = getColliders;
		this.hud = hud;
		this.onStop = onStop;
		this.raycaster = new Raycaster();
		this.keys = new Set();
		this.active = false;
		this.cameraMode = 'chase';
		// Machines that aren't driven like a car bring their own controls (see addMachine).
		this.machines = new Map();
		this.machine = null;

		const driveKeys = [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight' ];
		window.addEventListener( 'keydown', e => {

			// Browser shortcuts (Ctrl+R, Cmd+F...) are left to the browser, and don't drive or dig.
			if ( ! this.active || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
			if ( driveKeys.includes( e.code ) || this.machine?.keys.includes( e.code ) ) {

				e.preventDefault();
				this.keys.add( e.code );
				if ( e.code === 'Space' && ! e.repeat && this.grounded && ! this.machine ) {

					this.vy = JUMP_SPEED;
					this.grounded = false;

				}

				if ( ! e.repeat ) this.machine?.press( e.code );

			}

			if ( e.code === 'KeyC' && ! e.repeat ) this.cameraMode = this.cameraMode === 'chase' ? 'hood' : 'chase';
			if ( ( e.code === 'KeyV' || e.code === 'Escape' ) && ! e.repeat ) {

				// Stop here, so the same key press doesn't start driving again.
				e.stopImmediatePropagation();
				this.stop();

			}

		}, true );
		window.addEventListener( 'keyup', e => this.keys.delete( e.code ), true );
		window.addEventListener( 'blur', () => this.keys.clear() );

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
		pivot.rotation.copy( rotation );
		this.length = _size.z;
		this.width = _size.x;
		this.height = _size.y;
		this.wheelbase = this.length * 0.6;

		this.east = state.east;
		this.north = state.north;
		this.y = state.up;
		this.heading = state.heading;
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

		this.keys.clear();
		this.controls.keys.clear();
		this.controls.enabled = false;
		document.exitPointerLock?.();
		this.active = true;
		this.machine = this.machines.get( spec.type )?.( { driver: this, entry, spec } ) ?? null;
		this.hud.show( entry.state.name, this.machine?.panel );
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
		this.controls.setPose( enuToLocal( east, north, this.y + 1.7 + 0.5 ), this.heading, 0 );
		this.controls.setMode( 'walk' );
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
		const steerInput = ( keys.has( 'KeyD' ) || keys.has( 'ArrowRight' ) ? 1 : 0 ) - ( keys.has( 'KeyA' ) || keys.has( 'ArrowLeft' ) ? 1 : 0 );
		const boost = keys.has( 'ShiftLeft' ) || keys.has( 'ShiftRight' );

		// Speed. Boost raises the top speed by a third.
		const top = spec.topSpeed * ( boost ? 4 / 3 : 1 ) / KMH;
		if ( this.grounded ) {

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

		// Steering: smoothed, with less lock at speed (bicycle model).
		this.steer += ( steerInput - this.steer ) * Math.min( 1, dt * 4 );
		const maxAngle = MathUtils.lerp( 35, 3.5, MathUtils.clamp( Math.abs( this.speed ) / 40, 0, 1 ) ) * MathUtils.DEG2RAD;
		const yawRate = this.speed / this.wheelbase * Math.tan( this.steer * maxAngle ) * ( this.grounded ? 1 : 0.2 );
		this.heading += yawRate * MathUtils.RAD2DEG * dt;

		// Move, unless something solid is in the way at bumper height.
		const rad = this.heading * Math.PI / 180;
		const step = this.speed * dt;
		if ( step !== 0 ) {

			const sign = Math.sign( step );
			_dir.set( - Math.sin( rad ) * sign, 0, Math.cos( rad ) * sign );
			enuToLocal( this.east, this.north, this.y + Math.min( 1.0, this.height * 0.4 ), _origin );
			const hit = this.cast( _origin, _dir, Math.abs( step ) + this.length / 2 );
			const wall = hit && hit.face && Math.abs( hit.face.normal.clone().transformDirection( hit.object.matrixWorld ).y ) < 0.5;
			if ( wall ) {

				this.hud.flash( 'Crash!' );
				this.speed *= - 0.25;

			} else {

				this.east += Math.sin( rad ) * step;
				this.north += Math.cos( rad ) * step;

			}

		}

		// Ground under the front and rear axles and the left and right sides.
		const fx = Math.sin( rad ), fz = Math.cos( rad );
		const half = this.wheelbase / 2;
		const track = this.width * 0.4;
		const front = this.groundAt( this.east + fx * half, this.north + fz * half );
		const rear = this.groundAt( this.east - fx * half, this.north - fz * half );
		const left = this.groundAt( this.east - fz * track, this.north + fx * track );
		const right = this.groundAt( this.east + fz * track, this.north - fx * track );
		const heights = [ front, rear ].filter( h => h !== null );

		if ( heights.length === 0 ) {

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
					if ( this.airTime > 0.4 ) this.hud.flash( `${ this.airTime.toFixed( 1 ) } s air` );
					this.bestAir = Math.max( this.bestAir, this.airTime );
					if ( this.vy < - 12 ) this.speed *= 0.8;
					this.vy = 0;
					this.airTime = 0;
					this.grounded = true;

				}

			}

		}

		const sideSlope = left !== null && right !== null ? ( right - left ) / ( track * 2 ) : 0;
		this.roll += ( ( this.grounded ? Math.atan( sideSlope ) : this.roll ) - this.roll ) * Math.min( 1, dt * 8 );

		// Pose the model. It faces -Z in its pivot, so pitch is about X and roll about Z.
		const { pivot } = this.entry;
		enuToLocal( this.east, this.north, this.y, pivot.position );
		pivot.rotation.set( this.pitch, headingToYaw( this.heading ), this.roll, 'YXZ' );
		pivot.updateMatrixWorld( true );

		this.topSpeed = Math.max( this.topSpeed, Math.abs( this.speed ) );
		this.hud.update( { kmh: Math.abs( this.speed ) * KMH, reverse: this.speed < - 0.3, top: this.topSpeed * KMH, bestAir: this.bestAir, air: this.grounded ? 0 : this.airTime, boost } );
		this.placeCamera( dt );

	}

	placeCamera( dt ) {

		const rad = this.heading * Math.PI / 180;
		const forward = _dir.set( - Math.sin( rad ), 0, Math.cos( rad ) );
		const base = enuToLocal( this.east, this.north, this.y, _origin );
		if ( this.cameraMode === 'hood' ) {

			_target.copy( base ).addScaledVector( forward, this.length * 0.15 ).setY( base.y + this.height * 0.8 );
			this.camera.position.copy( _target );

		} else {

			const back = this.length * 0.8 + 5;
			_target.copy( base ).addScaledVector( forward, - back ).setY( base.y + this.height + 2.5 );
			this.camera.position.lerp( _target, 1 - Math.exp( - dt * 6 ) );

		}

		_look.copy( base ).addScaledVector( forward, 8 ).setY( base.y + this.height * 0.6 );
		this.camera.lookAt( _look );
		// Keep the walk controller's view direction in step for when we get out.
		this.controls.yaw = headingToYaw( this.heading );
		this.controls.pitch = 0;

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
// in library.json, which makes it drivable whatever its category.
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
