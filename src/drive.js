import { Box3, MathUtils, Raycaster, Vector3 } from 'three';
import { enuToLocal, headingToYaw, localToEnu } from './geo.js';
import { blocks, isTyping } from './walk.js';

// Race mode: drive a placed vehicle at highway speeds. Arcade physics rather than a simulation:
// the vehicle follows the ground under its wheels, keeps its upward speed off ramps and crests so
// it can jump, and bounces off walls: scraping along them at a glancing angle, stopping and
// bouncing back a little head-on.

const KMH = 3.6;
const GRAVITY = 9.81;
const JUMP_SPEED = 7;
// Ground this much below the wheels means the vehicle has left it (off a ramp or a crest).
const LEAVE_GROUND = 0.35;
// Crashing: the vehicle keeps its speed along the wall less a scrape of SCRAPE times its speed
// into it, and bounces back with RESTITUTION times that; slower than CRASH_MIN (m/s) into the wall
// it just stops against it. It turns toward the wall's line by a share of the angle it hit at
// (the square of the angle's cosine): most of the way for a glancing blow, so it scrapes along,
// and hardly at all head-on. At 30° that's 22°, and the next touch turns it the rest of the way.
const RESTITUTION = 0.3;
const SCRAPE = 0.2;
const CRASH_MIN = 1.5;
// The sideways part of a bounce dies away at this rate (1/s), as the tyres grip again.
const GRIP = 4;
// The cameras keep this far (m) in front of anything between them and the vehicle.
const CAMERA_CLEARANCE = 0.4;
// Bumper rays look for walls at these heights (m) over the ground under the vehicle, or lower on a
// small one. The low row catches a jersey barrier or a lock block (0.8 m), which a pickup's 0.9 m
// ray passed over, so it drove up and over them; the high one what stands on legs or wheels.
const BUMPERS = [ 0.5, 1.0 ];

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
const _side = new Vector3();
const _normal = new Vector3();
const _eye = new Vector3();
const _toCamera = new Vector3();
const _back = new Vector3();
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
		this.bumpers = [ ...new Set( BUMPERS.map( up => Math.min( up, this.height * 0.4 ) ) ) ];
		// How far it reaches ahead of and behind where it stands (east, north), which for a crane is
		// its carrier rather than the middle of its box.
		this.front = pivot.position.z - _box.min.z;
		this.rear = _box.max.z - pivot.position.z;
		// Where the driver sits, if the library says (see specFor), from where it stands.
		const { cab } = spec;
		this.cab = cab ? { ahead: cab.ahead + ( this.front - this.rear ) / 2, right: cab.right + ( _box.min.x + _box.max.x ) / 2 - pivot.position.x, up: cab.up } : null;

		this.east = state.east;
		this.north = state.north;
		this.y = state.up;
		this.heading = state.heading;
		this.speed = 0;
		this.steer = 0;
		this.vy = 0;
		// Sideways after a crash, east and north (m/s).
		this.slide = { east: 0, north: 0 };
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

	// Drive on at this frame's speed and slide, up to anything solid in the way at bumper height,
	// and bounce off it.
	move( dt ) {

		const rad = this.heading * Math.PI / 180;
		const ve = Math.sin( rad ) * this.speed + this.slide.east;
		const vn = Math.cos( rad ) * this.speed + this.slide.north;
		const v = Math.hypot( ve, vn );
		const grip = Math.exp( - GRIP * dt );
		this.slide.east *= grip;
		this.slide.north *= grip;
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

	// Bounce off a wall at ( ve, vn ) m/s east and north: keep the speed along it less a scrape,
	// bounce back with a share of the speed into it, and turn toward its line (see RESTITUTION).
	// What's left is split into speed along the new heading and a sideways slide the tyres soon stop.
	crash( ve, vn, wall ) {

		const into = - ( ve * wall.east + vn * wall.north );
		if ( into <= 0 ) return;
		const te = ve + wall.east * into;
		const tn = vn + wall.north * into;
		const along = Math.hypot( te, tn );
		const keep = along > 0 ? Math.max( 0, along - SCRAPE * into ) / along : 0;
		const back = into > CRASH_MIN ? RESTITUTION * into : 0;
		const be = te * keep + wall.east * back;
		const bn = tn * keep + wall.north * back;

		if ( along > 0.1 ) {

			const angle = Math.asin( MathUtils.clamp( into / Math.hypot( ve, vn ), 0, 1 ) );
			const turn = Math.sign( vn * te - ve * tn );
			this.heading += turn * angle * Math.cos( angle ) ** 2 * MathUtils.RAD2DEG;

		}

		const rad = this.heading * Math.PI / 180;
		const fx = Math.sin( rad ), fz = Math.cos( rad );
		this.speed = be * fx + bn * fz;
		this.slide.east = be - fx * this.speed;
		this.slide.north = bn - fz * this.speed;
		if ( into > 3 ) this.hud.flash( 'Crash!' );

	}

	placeCamera( dt ) {

		const rad = this.heading * Math.PI / 180;
		const forward = _dir.set( - Math.sin( rad ), 0, Math.cos( rad ) );
		const base = enuToLocal( this.east, this.north, this.y, _origin );
		const { cab } = this;
		// The height the cameras frame: the vehicle's, or where its box is mostly boom or mast (a
		// crane), its cab's, so they show the carrier and the way ahead rather than the boom.
		const height = cab ? cab.up / 0.8 : this.height;
		const inCab = this.cameraMode === 'hood' && cab;
		if ( inCab ) {

			const right = _side.set( - Math.cos( rad ), 0, - Math.sin( rad ) );
			this.camera.position.copy( base ).addScaledVector( forward, cab.ahead ).addScaledVector( right, cab.right ).setY( base.y + cab.up );
			this.pullInFront( _eye.copy( base ).setY( base.y + cab.up ), this.camera.position );

		} else if ( this.cameraMode === 'hood' ) {

			_target.copy( base ).addScaledVector( forward, this.length * 0.15 ).setY( base.y + height * 0.8 );
			this.camera.position.copy( _target );
			this.pullInFront( _eye.copy( base ).setY( base.y + height * 0.8 ), this.camera.position );

		} else {

			// Never inside a building or a container: the camera heads for a spot clear of whatever is
			// behind the vehicle, and jumps in front of anything that comes between them on the way.
			const back = this.rear + this.length * 0.3 + 5;
			_target.copy( base ).addScaledVector( forward, - back ).setY( base.y + height + 2.5 );
			_eye.copy( base ).setY( base.y + height * 0.8 );
			this.pullInFront( _eye, _target );
			this.camera.position.lerp( _target, 1 - Math.exp( - dt * 6 ) );
			this.pullInFront( _eye, this.camera.position );

		}

		_look.copy( inCab ? this.camera.position : base ).addScaledVector( forward, 8 ).setY( base.y + height * 0.6 );
		this.camera.lookAt( _look );
		// Keep the walk controller's view direction in step for when we get out.
		this.controls.yaw = headingToYaw( this.heading );
		this.controls.pitch = 0;

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
// in library.json, which makes it drivable whatever its category. A machine whose box is mostly
// boom or mast (a crane) also gives "cab": { ahead, right, up }, where the driver's eyes are in
// metres from the middle of its box at ground level, for the cameras; and "pivot": { ahead }, the
// point it stands and turns on in metres ahead of that middle (see itemConfig and models.js).
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
