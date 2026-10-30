import { Box3, Euler, MathUtils, Quaternion, Raycaster, Vector3 } from 'three';
import { enuToLocal, headingToYaw, localToEnu, yawToHeading } from './geo.js';
import { blocks, isTyping } from './walk.js';
import { createDriveFx } from './drive-fx.js';

// Race mode: drive a placed vehicle at highway speeds. Arcade physics rather than a simulation:
// the vehicle follows the ground under its wheels, keeps its upward speed off ramps and crests so
// it can jump, and stops dead when it hits a wall or anything else solid.
//
// Four options, off unless an app asks (World Drive turns them on): `fly`, where holding Shift
// lifts the vehicle off and flies it, and letting go glides it back down; `booster`, a rocket on B
// that pushes well past the top speed while its gauge lasts; `drift`, kart handling: sharp
// steering at low speed, and drifts on Space that pay out a boost; and `crash: 'launch'`, where
// hitting something bounces the vehicle off it and throws it into the air, and in the air it can
// spin, flip and roll for tricks that score when it lands on its wheels (crash: 'stop', the
// default, stops it dead).

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
// DRIFT_SLIP (1/s) while sliding, GRIP when not: sliding about 35° wide of its nose round a
// steady turn. Drifting this long (s) earns each boost level, which pays out at once with a kick
// of `kick` m/s and then pushes for `time` s up to `speed` times the top speed: strong and short.
// Space pressed without steering waits to see: held, then steered, it drifts with no hop (the
// DRIFT button is pressed before steering); let go within HOP_TAP s, it hops.
const DRIFT_MIN = 5;
const DRIFT_HOP = 2.4;
const DRIFT_YAW = [ 40, 110 ];
const DRIFT_SLIP = 2;
const GRIP = 12;
const DRIFT_LEVELS = [ 0.7, 1.5, 2.5 ];
const DRIFT_BOOSTS = [ { time: 0.4, speed: 1.3, kick: 2.5, name: 'Drift boost' }, { time: 0.6, speed: 1.4, kick: 3.5, name: 'Big drift boost' }, { time: 0.85, speed: 1.5, kick: 5, name: 'Mega drift boost' } ];
const DRIFT_BOOST_ACCEL = 24;
const HOP_TAP = 0.3;
// R puts the vehicle back on the ground this far ahead (m). Pressing on for STUCK_TIME s at under
// STUCK_SPEED m/s says how to get unstuck.
const RESPAWN_AHEAD = 4;
const STUCK_TIME = 2;
const STUCK_SPEED = 0.3;

// crash: 'launch'. Met at under SCRAPE_ANGLE° a wall is scraped along, losing SCRAPE_LOSS times
// the speed into it. Slower than BUMP_MIN m/s into it the vehicle stops against it as with 'stop',
// so pressing on into a wall never jitters. Harder, it keeps TANGENT_KEEP of its speed along the
// wall and bounces back with RESTITUTION of its speed into it (at most BOUNCE_MAX m/s across the
// ground, so it isn't flung far); slower than LAUNCH_MIN m/s that's a knock back along the ground,
// and from LAUNCH_MIN it's also thrown up at LAUNCH.base + LAUNCH.gain m/s for each m/s into the
// wall, at most LAUNCH.max: a 0.4 m hop at 22 km/h, 3.5 m at 80, 7.7 m at 120 and never more than
// 8.6 m. (Launched from LAUNCH_MIN of 3 m/s, holding the gas a couple of metres from a wall hopped
// against it over and over, a "Wall bounce" each time.) Only a hit of BOUNCE_SCORE m/s or more
// (BOING! and WHAM!) scores as a wall bounce.
const SCRAPE_ANGLE = 15;
const SCRAPE_LOSS = 0.25;
const BUMP_MIN = 3;
const LAUNCH_MIN = 6;
const BOUNCE_SCORE = 9;
const TANGENT_KEEP = 0.85;
const RESTITUTION = 0.4;
const BOUNCE_MAX = 16;
const LAUNCH = { base: 0.6, gain: 0.35, max: 13 };
// The hit sets it spinning: about the upright by the push at the corner that hit (YAW_KICK of what
// a rigid box would get, which is wilder than fun), nose up and over backwards by PITCH_KICK rad/s
// per m/s of a hit square on with its nose (a backflip, if it's helped round), and over sideways
// by ROLL_KICK per m/s of a hit on its side; each at most SPIN_MAX rad/s. A second hit in the same
// jump kicks half as hard. A wall it bounced off is kept clear of for WALL_GUARD s as it turns.
const YAW_KICK = 0.3;
const PITCH_KICK = 0.075;
const ROLL_KICK = 0.05;
const SPIN_MAX = 4.5;
const WALL_GUARD = 0.6;
// In the air it turns as it was set spinning, slowing by AIR_DAMP (1/s), and A/D spin it, W/S flip
// it and Q/E (or Space with A/D, for touch) roll it, at up to AIR_RATE rad/s reached at AIR_ACCEL
// rad/s², a big vehicle more slowly (see start). Let go of the key and that turn stops at AIR_STOP
// (1/s), going on about 45° from full speed, so a flip can be landed. Keys already held KEY_GRACE
// s before it left the ground count only once pressed again, so holding the gas off a ramp
// doesn't flip it. With nothing pressed and under ASSIST_TILT° from upright, it eases toward the
// way it's flying at ASSIST (1/s), as a plain jump does, and on the way down what's left of a hit's
// tumble (or of a flip let go of) dies away at STEADY (1/s), so it lands: a hit at up to 160 km/h
// tips it back 25° to 45° and it comes down on its wheels (left to spin on, one at 60 to 100 km/h
// came down at 43° to 50° and wiped out). A harder one (the booster) still turns it past
// ASSIST_TILT and over: finish the backflip, or wipe out. Spins about the upright carry on: they
// don't stop it landing.
const AIR_RATE = { yaw: 6.5, pitch: 5.5, roll: 6.5 };
const AIR_ACCEL = 22;
const AIR_DAMP = 0.6;
const AIR_STOP = 6;
const KEY_GRACE = 0.25;
const ASSIST = 1.5;
const ASSIST_TILT = 60;
const STEADY = 3;
// Flying (Shift), Space with W/S flips and with A/D (or Q/E) rolls; let go and it slows at
// FLIGHT_DAMP and rights itself at FLIGHT_RIGHTING (1/s).
const FLIGHT_DAMP = 4;
const FLIGHT_RIGHTING = 3;
// It lands within LAND_TILT° of upright. Past that it's a wipeout: a short tumble, thrown up at
// up to WIPE_HOP m/s and keeping WIPE_KEEP of its speed, then RIGHT_TIME s rolling back onto its
// wheels where it comes down.
const LAND_TILT = 40;
const WIPE_HOP = 3;
const WIPE_KEEP = 0.5;
const RIGHT_TIME = 0.55;
// Tricks are whole turns in the air, give or take SPIN_TOL° for spins (a 180 counts) and FLIP_TOL°
// for flips and rolls (as far off as it can land), and BIG_AIR s or more off the ground. POINTS
// for each (air: per second); two or more in one jump are a combo, COMBO_BONUS times the points.
// A jump's points are multiplied by the combo multiplier, which goes up by one for each trick
// landed, to MULT_MAX, and back to 1 on a wipeout or after CHAIN_TIME s without landing a trick.
// Landing tricks tops up the booster by TRICK_GAUGE each and, landing going forward, gives a burst
// of speed (TRICK_BOOST, as a drift boost: `time` s and `each` more per trick, at most `max`).
const SPIN_TOL = 25;
const FLIP_TOL = 40;
const BIG_AIR = 1.5;
const POINTS = { spin: 300, flip: 1000, roll: 800, bounce: 150, air: 300 };
const COMBO_BONUS = 1.5;
const MULT_MAX = 10;
const CHAIN_TIME = 6;
const TRICK_GAUGE = 0.2;
const TRICK_BOOST = { speed: 1.25, time: 0.3, each: 0.15, max: 0.9 };
const BEST_KEY = 'drive.stunt-best';
// Hits and landings squash the model, which springs back: a spring of `stiffness` (1/s²) and
// `damping` (1/s), kicked at `hit` per m/s into a wall and `land` per m/s coming down, so it's
// quick (about 0.3 s) and never more than `max` of its size. The camera shakes by SHAKE m per m/s
// into a wall, at most SHAKE_MAX, dying away at SHAKE_DECAY (1/s).
const SQUASH = { stiffness: 320, damping: 11, hit: 0.1, land: 0.2, max: 0.22 };
const SHAKE = 0.025;
const SHAKE_MAX = 0.8;
const SHAKE_DECAY = 6;
// The chase camera turns round after the vehicle at most this fast (°/s), so a wipeout that ends
// facing back the way it came swings it round in a second rather than whipping it. Thrown into the
// air, it eases up and down after the vehicle at AIR_CAMERA (1/s), at most AIR_LAG m behind it,
// so the vehicle is seen to fly up and come down. (With no limit, falling 40 m off a bridge left
// it 10 m above, looking down at a speck.)
const VIEW_TURN = 180;
const AIR_CAMERA = 3;
const AIR_LAG = 3;
// What a hit says, by how hard it was (m/s into it).
const WORDS = [ [ 18, 'WHAM!' ], [ 9, 'BOING!' ], [ 0, 'BONK!' ] ];
// Told once, the first time it's thrown into the air.
const AIR_HINT = 'In the air: A/D spin · W/S flip · Q/E roll';

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
const _c = new Vector3();
const _n = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _axis = new Vector3();
const _q = new Quaternion();
const _euler = new Euler();
const _attitude = new Quaternion();
const DOWN = new Vector3( 0, - 1, 0 );
const UP = new Vector3( 0, 1, 0 );
const LEVEL = new Quaternion();

export class Driver {

	// fly, booster, drift: the options above, all off by default; crash: 'stop' or 'launch'.
	// onScore( run ), with stunts on: called each time a jump's tricks are landed, with the run so
	// far (see runSoFar), for a leaderboard.
	constructor( { camera, models, controls, getColliders, hud, onStop, onScore = null, fly = false, booster = false, drift = false, crash = 'stop' } ) {

		this.camera = camera;
		this.models = models;
		this.controls = controls;
		this.getColliders = getColliders;
		this.hud = hud;
		this.onStop = onStop;
		this.onScore = onScore;
		this.fly = fly;
		this.booster = booster;
		this.drift = drift;
		this.launch = crash === 'launch';
		this.raycaster = new Raycaster();
		this.keys = new Set();
		// When each key last went down (by this.clock, the time driven), for the keys that count in
		// the air (see airKey), and a Space press that may yet be a hop (see release).
		this.pressedAt = new Map();
		this.clock = 0;
		this.spaceTap = null;
		// Stunts (crash: 'launch'): the score this run, its combo multiplier and the best ever; and
		// for onScore, when the run started (by this.clock), its longest air and its best jump.
		this.score = 0;
		this.mult = 1;
		this.best = this.launch ? loadBest() : 0;
		this.scored = null;
		this.runStart = 0;
		this.runAir = 0;
		this.bestAir = 0;
		this.bestJump = null;
		this.hinted = false;
		this.active = false;
		this.cameraMode = 'chase';
		// How far the chase camera is, as a share of its usual distance: kept between drives.
		this.chaseZoom = 1;
		// Machines that aren't driven like a car bring their own controls (see addMachine).
		this.machines = new Map();
		this.machine = null;

		this.driveKeys = [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR', ...booster ? [ 'KeyB' ] : [], ...this.launch ? [ 'KeyQ', 'KeyE' ] : [] ];
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
		this.pressedAt.set( code, this.clock );
		if ( this.machine ) {

			this.machine.press( code );
			return;

		}

		// With kart handling, Space without steering is a drift waiting for the steering, or a hop
		// if it's let go at once (see release).
		if ( code === 'Space' && this.grounded && this.drift && this.steerInput() === 0 ) this.spaceTap = this.clock;
		else if ( code === 'Space' && this.grounded ) this.hop();
		else if ( code === 'KeyB' && this.booster ) this.fireBooster();
		else if ( code === 'KeyR' ) this.respawn();

	}

	release( code ) {

		this.keys.delete( code );
		if ( code !== 'Space' || this.spaceTap === null ) return;
		const tapped = this.clock - this.spaceTap <= HOP_TAP;
		this.spaceTap = null;
		if ( tapped && this.active && this.grounded && ! this.drifting && ! this.machine ) this.hop();

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
		// For stunts: the middle of its box, which it turns about in the air, from where it stands
		// (in its own frame, in metres), and half the box's size.
		this.scale = pivot.scale.x;
		this.centre = this.ownBox.getCenter( new Vector3() ).multiplyScalar( this.scale );
		this.half = this.ownBox.getSize( new Vector3() ).multiplyScalar( this.scale / 2 );
		// A big vehicle turns more slowly in the air: a kart at the full rate, a pickup at 0.86 of it.
		this.trickRate = MathUtils.clamp( Math.sqrt( 4 / this.length ), 0.55, 1 );

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
		// (The best air is this drive's; the run's is kept across pauses.)
		this.runAir = Math.max( this.runAir, this.bestAir );
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
		// Stunts (crash: 'launch'): what it's doing in the air (see enterAir), the squash spring, the
		// camera's shake and the way the chase camera looks (see placeCamera).
		this.air = null;
		this.squash = { value: 0, speed: 0, along: 'hit' };
		this.shake = 0;
		this.view = this.heading;
		this.landedAt = - Infinity;
		this.lastTrick = - Infinity;
		this.scraping = 0;
		this.scrapeAt = { at: new Vector3(), normal: new Vector3() };
		this.spaceTap = null;
		// A new ride, or a new place, is a new run.
		if ( this.launch && this.scored !== entry ) {

			this.scored = entry;
			this.score = 0;
			this.mult = 1;
			this.runStart = this.clock;
			this.runAir = 0;
			this.bestJump = null;

		}

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
		this.fx = this.booster || this.drift || this.launch ? createDriveFx( this.models.group.parent ?? this.models.group ) : null;

		this.keys.clear();
		this.controls.keys?.clear();
		this.controls.enabled = false;
		document.exitPointerLock?.();
		this.active = true;
		this.machine = this.machines.get( spec.type )?.( { driver: this, entry, spec } ) ?? null;
		this.hud.show( entry.state.name, this.machine?.panel );
		this.hud.setFlying?.( false );
		this.hud.setBoost?.( this.booster ? this.gauge : null );
		if ( this.launch ) this.showScore();
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
		this.air = null;

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

		this.clock += dt;
		const { keys, spec } = this;
		// Flying with stunts on, holding Space turns W/S and A/D into flips and rolls (see airInput).
		const tricking = this.flying && !! this.air && this.airKey( 'Space' );
		const throttle = ! tricking && ( keys.has( 'KeyW' ) || keys.has( 'ArrowUp' ) );
		const brake = ! tricking && ( keys.has( 'KeyS' ) || keys.has( 'ArrowDown' ) );
		const steerInput = tricking ? 0 : this.steerInput();
		const shift = keys.has( 'ShiftLeft' ) || keys.has( 'ShiftRight' );
		// With flying on, Shift lifts off; otherwise it boosts. A wipeout rights itself first.
		const boost = shift && ! this.fly;
		if ( shift && this.fly && ! this.flying && ! this.air?.wipeout ) this.takeOff();
		// A drift carried off the ground, let go of in the air: free to turn from here.
		if ( this.launch && ! this.grounded && ! this.flying && ! this.air && ! this.driftHop && ! this.drifting ) this.enterAir();
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

		if ( this.booster || this.drift || this.launch ) this.thrust( dt, top );

		if ( this.flying ) {

			// In the air it turns like a hovercraft, at the same rate whatever its speed.
			this.steer += ( steerInput - this.steer ) * Math.min( 1, dt * 4 );
			this.heading += this.steer * FLY_YAW * dt;
			this.course = this.heading;
			if ( this.air ) this.flightSpin( dt );

		} else if ( this.air ) {

			this.airSpin( dt );

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
		if ( this.air && ! this.air.flight ) this.keepClear();

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

		} else if ( this.air ) {

			this.airStep( dt );

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
				// With stunts on it's free to turn from here, and goes up no faster than a hit throws it:
				// a steep lump in Google's mesh (a building's skirt) taken at 90 km/h climbs at 24 m/s,
				// which threw the kart 25 m into the sky.
				this.grounded = false;
				if ( this.launch ) this.vy = Math.min( this.vy, LAUNCH.max );
				if ( this.launch && ! this.driftHop && ! this.drifting ) this.enterAir();

			}

			if ( this.air ) {

				this.airStep( dt );

			} else if ( this.grounded ) {

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
					if ( this.launch ) this.squashBy( - this.vy * SQUASH.land, 'land' );
					this.vy = 0;
					this.airTime = 0;
					this.grounded = true;
					this.driftHop = false;

				}

			}

		}

		// Level with the ground across the wheels; banked into the turn when flying, and leaning out
		// of a drift a little. Turned any way in the air with stunts on, it keeps to that.
		if ( ! this.air || this.air.flight ) {

			const sideSlope = left !== null && right !== null ? ( right - left ) / ( track * 2 ) : 0;
			const lean = this.flying ? - this.steer * 0.3 : this.grounded ? Math.atan( sideSlope ) + this.drifting * 0.05 : this.roll;
			this.roll += ( lean - this.roll ) * Math.min( 1, dt * 8 );

		}

		const { pivot } = this.entry;
		this.pose();
		if ( this.launch ) this.springSquash( dt );
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
			driftCharge: this.drifting ? Math.min( 1, this.driftTime / DRIFT_LEVELS[ DRIFT_LEVELS.length - 1 ] ) : 0, driftHeld: this.drift && keys.has( 'Space' ),
		} );
		if ( this.booster ) this.hud.setBoost?.( this.gauge );
		if ( this.launch ) {

			// A combo lasts while tricks keep coming.
			if ( this.mult > 1 && this.grounded && this.clock - this.lastTrick > CHAIN_TIME ) {

				this.mult = 1;
				this.showScore();

			}

			this.turnView( dt );

		}

		this.placeCamera( dt );

	}

	// Pose the model. It faces -Z in its pivot, so pitch is about X and roll about Z. In the air with
	// stunts on it's turned any way, about the middle of its box; flying, a trick turns it about
	// that middle too.
	pose() {

		const { pivot } = this.entry;
		if ( this.air && ! this.air.flight ) {

			pivot.quaternion.copy( this.air.q );
			enuToLocal( this.east, this.north, this.y + this.centre.y, pivot.position ).sub( _c.copy( this.centre ).applyQuaternion( this.air.q ) );
			return;

		}

		enuToLocal( this.east, this.north, this.y, pivot.position );
		pivot.rotation.set( this.pitch, headingToYaw( this.heading ), this.roll, 'YXZ' );
		if ( ! this.air ) return;
		_c.copy( this.centre ).applyQuaternion( pivot.quaternion ).add( pivot.position );
		pivot.quaternion.multiply( this.air.q );
		pivot.position.copy( _c ).sub( _a.copy( this.centre ).applyQuaternion( pivot.quaternion ) );

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
		if ( this.launch && ! this.driftHop ) this.enterAir();

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
			// A kick at once, then the push (see thrust).
			this.speed = Math.max( this.speed, Math.min( this.speed + boost.kick, this.spec.topSpeed / KMH * boost.speed ) );
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
		if ( ! this.launch ) return;
		if ( ! this.air ) {

			this.enterAir( true );
			return;

		}

		// From a jump or a launch: it flies on as it's turned, heading the way its nose points (or
		// the way it's going, nose up or down), and rights itself from there (see flightSpin).
		const { air } = this;
		const middle = this.middle( _b );
		_z.set( 0, 0, - 1 ).applyQuaternion( air.q );
		if ( Math.hypot( _z.x, _z.z ) > 0.3 ) this.heading = ( Math.atan2( - _z.x, _z.z ) * MathUtils.RAD2DEG + 360 ) % 360;
		else this.heading = this.course;
		this.speed *= Math.cos( ( this.course - this.heading ) * MathUtils.DEG2RAD );
		this.course = this.heading;
		this.pitch = 0;
		this.roll = 0;
		const flown = _q.setFromEuler( _euler.set( 0, headingToYaw( this.heading ), 0, 'YXZ' ) );
		const at = localToEnu( middle.sub( _a.copy( this.centre ).applyQuaternion( flown ) ) );
		this.east = at.east;
		this.north = at.north;
		this.y = at.up;
		air.q.premultiply( flown.invert() );
		air.flight = true;
		air.flew = true;
		air.wall = null;

	}

	// Height while flying: climbing toward a hover with Shift held, gliding down without it, never
	// below the ground and never up through a roof or a bridge. Touching down is gentle, whatever
	// the speed. With no ground found under it (Google's tiles there still loading) it holds its
	// height instead of gliding down, so it can't sink through ground that arrives late.
	flyHeight( dt, shift, ground ) {

		this.altitude = ground === null ? null : Math.max( 0, this.y - ground );
		const glide = ground === null ? 0 : - FLY_GLIDE;
		const climb = shift ? FLY_CLIMB * MathUtils.clamp( 1 - ( this.altitude ?? 0 ) / FLY_CEILING, - 0.5, 1 ) : glide;
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
		if ( this.air ) this.landFlight();

	}

	// Down from flying with stunts on: the tricks done on the way pay out, unless a trick has it on
	// its roof or side, which is a wipeout as off a jump.
	landFlight() {

		const { air } = this;
		const q = this.attitude( new Quaternion() );
		if ( this.tilt( q ) <= LAND_TILT ) {

			const tricks = this.tricksOf( air );
			this.air = null;
			this.hud.setPending?.( null );
			this.landedAt = this.clock;
			this.payTricks( tricks );
			return;

		}

		const at = localToEnu( this.middle( _b ) );
		air.q.copy( q );
		air.flight = false;
		this.east = at.east;
		this.north = at.north;
		this.y = at.up - this.centre.y;
		this.grounded = false;
		this.wipeOut( this.groundAt( this.east, this.north, at.up + 0.3 ) ?? this.y );

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
		if ( this.air ) {

			// Out of whatever it was doing in the air.
			this.air = null;
			this.view = this.heading;
			this.hud.setPending?.( null );

		}

		// A bail: out of the combo too.
		if ( this.launch ) {

			this.mult = 1;
			this.showScore();

		}

		if ( this.flying ) this.land();
		if ( this.drifting ) this.endDrift( false );
		this.recentGood = this.lastGood = { east: this.east, north: this.north, y: this.y };
		this.hud.flash( 'Back on the road' );

	}

	// Pressing on without getting anywhere says how to get unstuck. Meanwhile, remember where it
	// moves freely, for R.
	checkStuck( dt, pressing, moved ) {

		if ( pressing && moved < STUCK_SPEED * dt && ! this.flying && ! this.air ) this.stuckTime += dt;
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
		// Its size as it was, not as a squash has it this moment.
		const { scale } = this;
		const wheel = ( this.rear - this.length * 0.2 ) / scale;
		const track = this.width * 0.4 / scale;
		this.scraping = Math.max( 0, this.scraping - dt );
		this.fx.update( {
			pivot: this.entry.pivot,
			size: { width: this.width, height: this.height, rear: this.rear, scale },
			wheels: [ _a.set( - track, 0.05, wheel ), _b.set( track, 0.05, wheel ) ],
			velocity: _target.set( - Math.sin( this.course * Math.PI / 180 ) * this.speed, this.vy, Math.cos( this.course * Math.PI / 180 ) * this.speed ),
			flame: this.firing ? 1 : this.boost ? 0.55 : 0,
			drifting: !! this.drifting && this.grounded,
			level: this.driftLevel,
			scrape: this.scraping > 0 ? this.scrapeAt : null,
			dt,
		} );

	}

	// Drive on at this frame's speed, up to anything solid in the way at bumper height, and stop
	// there (or, with crash: 'launch', bounce off it).
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
	//
	// In the air with stunts on, turned any way about the middle of its box, the rays start under
	// that middle, in rows up the height the box takes as it's turned, and reach as far as the box
	// does that way and across it.
	wallAhead( de, dn, distance ) {

		let reach, side, rows;
		if ( this.air && ! this.air.flight ) {

			const { q } = this.air;
			reach = this.extent( _a.set( - de, 0, dn ), q );
			side = this.extent( _a.set( - dn, 0, - de ), q );
			const middle = this.centre.y;
			const up = this.extent( UP, q ) * 0.6;
			rows = [ ...new Set( [ Math.max( this.bumpers[ 0 ], middle - up ), middle, middle + up ] ) ];

		} else if ( this.air?.flight ) {

			// Flying with stunts on, it's tipped by its climb or dive, or by a trick, about where it
			// stands: they reach as far as its box does that way, turned as it is. (Gliding nose down
			// into a wall, the top of the kart went 0.3 m into it.)
			const q = this.attitude( _attitude );
			_a.set( - de, 0, dn );
			reach = this.extent( _a, q ) + _c.copy( this.centre ).applyQuaternion( q ).dot( _a );
			side = this.extent( _a.set( - dn, 0, - de ), q );
			rows = this.bumpers;

		} else {

			const rad = this.heading * Math.PI / 180;
			const along = de * Math.sin( rad ) + dn * Math.cos( rad );
			reach = ( along >= 0 ? this.front : this.rear ) * Math.abs( along ) + this.width / 2 * Math.sqrt( Math.max( 0, 1 - along * along ) );
			// Just inside its sides, so a wall it drives alongside doesn't stop it; with stunts, right
			// at them, so a glancing blow finds the corner (a wall alongside is only scraped).
			side = Math.max( 0, this.width / 2 - ( this.launch ? 0 : 0.1 ) );
			rows = this.bumpers;

		}

		_dir.set( - de, 0, dn );
		let wall = null;
		for ( const up of rows ) for ( const right of [ 0, - side, side ] ) {

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
		if ( this.launch ) {

			this.bounce( ve, vn, wall, into );
			return;

		}

		this.speed = 0;
		this.course = this.heading;
		this.boost = null;
		if ( this.drifting ) this.endDrift( false );
		if ( into > CRASH_FLASH ) this.hud.flash( 'Crash!' );

	}

	// --- stunts (crash: 'launch') ---

	// Hit a wall at ( ve, vn ) m/s east and north, `into` of that into it: a glancing blow scrapes
	// along it, a nudge stops against it, and anything harder bounces off it and, from the ground,
	// throws the vehicle into the air, spinning. Flying, it bounces off and flies on.
	bounce( ve, vn, wall, into ) {

		const angle = Math.asin( MathUtils.clamp( into / Math.hypot( ve, vn ), 0, 1 ) );
		const te = ve + wall.east * into;
		const tn = vn + wall.north * into;
		const along = Math.hypot( te, tn );
		const inAir = !! this.air && ! this.air.flight;
		// Turned toward the wall's line, by more the more glancing the blow (all but square on).
		const turn = Math.sign( vn * te - ve * tn ) * angle * Math.cos( angle ) ** 2 * MathUtils.RAD2DEG;
		const contact = this.contact( wall );
		if ( this.drifting ) this.endDrift( false );

		if ( angle < SCRAPE_ANGLE * MathUtils.DEG2RAD ) {

			// Scraping along: a little slower, nudged off it so it doesn't grind, and in sparks.
			const keep = along > 0 ? Math.max( 0, along - SCRAPE_LOSS * into ) / along : 0;
			if ( ! inAir && along > 0.1 ) this.heading += turn;
			this.setVelocity( te * keep + wall.east * into * 0.1, tn * keep + wall.north * into * 0.1 );
			this.scraping = 0.15;
			this.scrapeAt.at.copy( contact.point );
			this.scrapeAt.normal.set( - wall.east, 0, wall.north );
			return;

		}

		this.boost = null;
		if ( into < BUMP_MIN ) {

			// Only a nudge: it stops against it as with crash: 'stop', so pressing on never jitters.
			// In the air it drops off it.
			if ( inAir ) this.setVelocity( te * TANGENT_KEEP + wall.east * into * 0.3, tn * TANGENT_KEEP + wall.north * into * 0.3 );
			else {

				this.speed = 0;
				this.course = this.heading;

			}

			return;

		}

		let be = te * TANGENT_KEEP + wall.east * into * RESTITUTION;
		let bn = tn * TANGENT_KEEP + wall.north * into * RESTITUTION;
		const across = Math.hypot( be, bn );
		if ( across > BOUNCE_MAX ) {

			be *= BOUNCE_MAX / across;
			bn *= BOUNCE_MAX / across;

		}

		this.impact( into, contact.point, wall );
		if ( this.flying ) {

			if ( along > 0.1 ) this.heading += turn;
			this.setVelocity( be, bn );
			return;

		}

		if ( ! inAir && into < LAUNCH_MIN ) {

			// A knock: back off it along the ground, still facing it (so it reverses away from it,
			// rather than a drift's slide turning it back into the wall).
			const rad = this.heading * Math.PI / 180;
			this.speed = be * Math.sin( rad ) + bn * Math.cos( rad );
			this.course = this.heading;
			return;

		}

		// The first hit since it left the ground throws it up as from the ground: on Google's mesh it
		// has often just come off a kerb or a bump when it meets a wall, and a building at 100 km/h
		// only added 0.5 m. Hits after that in the same jump add less, so it can't climb a wall in
		// bounces. Never faster up than LAUNCH.max: climbing a steep lump into a wall, it would have
		// kept the lump's 24 m/s.
		const first = ! inAir || ! this.air.wall;
		if ( ! inAir ) this.enterAir();
		const { air } = this;
		if ( into >= BOUNCE_SCORE ) air.hits ++;
		air.wall = { east: wall.east, north: wall.north, until: this.clock + WALL_GUARD };
		const hop = Math.min( LAUNCH.max, LAUNCH.base + LAUNCH.gain * into );
		this.vy = first ? Math.max( Math.min( this.vy, LAUNCH.max ), hop ) : this.vy + hop * 0.3;
		this.setVelocity( be, bn );
		this.kick( contact, wall, into, first ? 1 : 0.5 );

	}

	// Travel at ( ve, vn ) m/s east and north: in the air (not flying) any way at all, and on the
	// ground with kart handling any way a drift allows (a scrape stays within that); otherwise along
	// the way it points, losing what's sideways.
	setVelocity( ve, vn ) {

		if ( this.air && ! this.air.flight || this.drift && ! this.flying ) {

			this.speed = Math.hypot( ve, vn );
			if ( this.speed > 1e-6 ) this.course = Math.atan2( ve, vn ) * MathUtils.RAD2DEG;

		} else {

			const rad = this.heading * Math.PI / 180;
			this.speed = ve * Math.sin( rad ) + vn * Math.cos( rad );
			this.course = this.heading;

		}

	}

	// Where its box meets a wall facing ( wall.east, wall.north ): the corner, edge or (square on)
	// face middle farthest toward it, as a point in the scene, and as `lever`, from the box's middle.
	contact( wall ) {

		const q = this.attitude( _attitude );
		const toward = _n.set( wall.east, 0, - wall.north );
		const lever = new Vector3();
		for ( const [ axis, half ] of [ [ _x.set( 1, 0, 0 ), this.half.x ], [ _y.set( 0, 1, 0 ), this.half.y ], [ _z.set( 0, 0, 1 ), this.half.z ] ] ) {

			axis.applyQuaternion( q );
			lever.addScaledVector( axis, half * MathUtils.clamp( axis.dot( toward ) / 0.15, - 1, 1 ) );

		}

		return { lever, point: this.middle( new Vector3() ).add( lever ) };

	}

	// Set it spinning from a hit at `contact` on a wall facing ( wall.east, wall.north ), `into` m/s
	// into it, `share` as hard as from the ground: about the upright by the push at that corner, as a
	// box its size would (less: see YAW_KICK), nose up off a hit on its nose (over backwards, as the
	// launch throws it up), and over sideways off one on its side.
	kick( contact, wall, into, share ) {

		const { q, spin } = this.air;
		const normal = _n.set( - wall.east, 0, wall.north );
		const { lever } = contact;
		const length = this.half.z * 2;
		const width = this.half.x * 2;
		const yaw = YAW_KICK * into * ( 1 + RESTITUTION ) * ( lever.z * normal.x - lever.x * normal.z ) / ( ( length * length + width * width ) / 12 );
		_axis.set( 0, MathUtils.clamp( yaw, - SPIN_MAX, SPIN_MAX ), 0 ).applyQuaternion( _q.copy( q ).invert() );
		spin.addScaledVector( _axis, share );
		const nose = _z.set( 0, 0, 1 ).applyQuaternion( q ).dot( normal );
		const flank = - _x.set( 1, 0, 0 ).applyQuaternion( q ).dot( normal );
		spin.x += MathUtils.clamp( PITCH_KICK * into * nose, - SPIN_MAX, SPIN_MAX ) * share;
		spin.z += MathUtils.clamp( ROLL_KICK * into * flank, - SPIN_MAX, SPIN_MAX ) * share;
		spin.clampScalar( - SPIN_MAX, SPIN_MAX );

	}

	// How a hit looks and feels: the model squashed, sparks and bits flying off where it hit, the
	// camera shaken, and a word for it.
	impact( into, point, wall ) {

		const power = MathUtils.clamp( into / 30, 0, 1 );
		this.squashBy( into * SQUASH.hit, 'hit' );
		this.shake = Math.max( this.shake, Math.min( SHAKE_MAX, into * SHAKE ) );
		// From the top of where it hit, so the chase camera sees the burst over the vehicle.
		point.y = Math.max( point.y, this.middle( _c ).y + this.half.y * 0.6 );
		this.fx?.burst( point, _n.set( - wall.east, 0, wall.north ), power );
		this.hud.pop?.( WORDS.find( ( [ least ] ) => into >= least )[ 1 ], power );

	}

	// Off the ground with stunts on (thrown by a hit, off a ramp or a crest, or a hop): free to turn
	// any way about the middle of its box, which carries on from where it was. In the air east,
	// north and y are under that middle. `flight`: taking off with Shift, where it flies as it does
	// without stunts and a trick turns it only for a moment (see flightSpin).
	enterAir( flight = false ) {

		const q = new Quaternion().setFromEuler( _euler.set( this.pitch, headingToYaw( this.heading ), this.roll, 'YXZ' ) );
		if ( ! flight ) {

			const at = localToEnu( enuToLocal( this.east, this.north, this.y, _c ).add( _a.copy( this.centre ).applyQuaternion( q ) ) );
			this.east = at.east;
			this.north = at.north;
			this.y = at.up - this.centre.y;

		}

		this.air = {
			// How it's turned (flying: by a trick, on top of how it flies), how fast it's spinning about
			// its own axes (rad/s) and how far it has turned about each since it left the ground.
			// `steered`: which axes a key turned it about (see turn).
			q: flight ? new Quaternion() : q, spin: new Vector3(), turned: new Vector3(), steered: { x: false, y: false, z: false },
			since: this.clock, time: 0, hits: 0, flight, flew: flight, wipeout: false, righting: null, wall: null, pending: '',
		};
		this.grounded = false;

	}

	// A key that counts in the air: held, and pressed since a moment before it left the ground.
	airKey( code ) {

		return this.keys.has( code ) && ( this.pressedAt.get( code ) ?? - Infinity ) >= this.air.since - KEY_GRACE;

	}

	// What the keys ask of it in the air, each -1 to 1 about its own axes: yaw (+ to the left), pitch
	// (+ nose up) and roll (+ over to the left). Flying, A/D and W/S fly it unless Space is held, and
	// it doesn't spin: turning round in the air is flying, not a trick.
	airInput() {

		const key = code => this.airKey( code );
		const lr = ( key( 'KeyD' ) || key( 'ArrowRight' ) ? 1 : 0 ) - ( key( 'KeyA' ) || key( 'ArrowLeft' ) ? 1 : 0 );
		const fb = ( key( 'KeyW' ) || key( 'ArrowUp' ) ? 1 : 0 ) - ( key( 'KeyS' ) || key( 'ArrowDown' ) ? 1 : 0 );
		const qe = ( key( 'KeyE' ) ? 1 : 0 ) - ( key( 'KeyQ' ) ? 1 : 0 );
		const space = key( 'Space' );
		const roll = - ( qe || ( space ? lr : 0 ) );
		if ( this.flying ) return { yaw: 0, pitch: space ? - fb : 0, roll };
		return { yaw: space ? 0 : - lr, pitch: - fb, roll };

	}

	// Spin `air.q` for dt at `air.spin`, which heads for what the keys ask (`input`) or slows: by
	// `damp` (1/s), or quickly (AIR_STOP) about an axis a key was turning it about, and count the
	// turn in `air.turned`, which the tricks are read from.
	turn( dt, input, damp ) {

		const { q, spin, turned, steered } = this.air;
		for ( const [ axis, name ] of [ [ 'x', 'pitch' ], [ 'y', 'yaw' ], [ 'z', 'roll' ] ] ) {

			const want = input?.[ name ] ?? 0;
			if ( want ) {

				spin[ axis ] += MathUtils.clamp( want * AIR_RATE[ name ] * this.trickRate - spin[ axis ], - AIR_ACCEL * dt, AIR_ACCEL * dt );
				steered[ axis ] = true;

			} else {

				spin[ axis ] *= Math.exp( - ( steered[ axis ] ? Math.max( damp, AIR_STOP ) : damp ) * dt );
				if ( Math.abs( spin[ axis ] ) < 0.2 ) steered[ axis ] = false;

			}

		}

		const angle = spin.length() * dt;
		if ( angle > 1e-9 ) q.multiply( _q.setFromAxisAngle( _axis.copy( spin ).normalize(), angle ) ).normalize();
		turned.addScaledVector( spin, dt );

	}

	// In the air, not flying: spinning as it was set off and as the keys turn it (none in a wipeout).
	// Left alone and not far from upright, it steadies and eases toward the way it's flying, as a
	// plain jump does. Its heading is the way its nose points.
	airSpin( dt ) {

		const { air } = this;
		if ( air.righting ) return;
		const input = air.wipeout ? null : this.airInput();
		this.turn( dt, input, AIR_DAMP );
		const { q, spin } = air;
		const idle = input && ! input.yaw && ! input.pitch && ! input.roll;
		if ( idle && air.time > 0.15 && this.tilt( q ) < ASSIST_TILT ) {

			// Coming down, it steadies for the landing.
			if ( this.vy < 0 ) {

				const steady = Math.exp( - STEADY * dt );
				spin.x *= steady;
				spin.z *= steady;

			}

			_euler.setFromQuaternion( q, 'YXZ' );
			const along = this.speed * Math.cos( ( this.course - yawToHeading( _euler.y ) ) * MathUtils.DEG2RAD );
			const pitch = MathUtils.clamp( Math.atan2( this.vy, Math.abs( along ) + 3 ), - 0.5, 0.5 ) * ( along < 0 ? - 1 : 1 );
			q.slerp( _q.setFromEuler( _euler.set( pitch, _euler.y, 0, 'YXZ' ) ), 1 - Math.exp( - ASSIST * dt ) );

		}

		_euler.setFromQuaternion( q, 'YXZ' );
		this.heading = yawToHeading( _euler.y );
		this.showPending();
		if ( ! this.hinted && air.time > 0.5 && ! air.wipeout ) {

			this.hinted = true;
			this.hud.flash( AIR_HINT );

		}

	}

	// Tricks while flying: Space with W/S flips and Q/E (or Space with A/D) rolls; let go and it
	// rights itself.
	flightSpin( dt ) {

		const input = this.airInput();
		this.turn( dt, input, FLIGHT_DAMP );
		if ( ! input.pitch && ! input.roll ) this.air.q.slerp( LEVEL, 1 - Math.exp( - FLIGHT_RIGHTING * dt ) );
		this.showPending();

	}

	// Up and down in the air, not flying: gravity, the underside of a bridge or a roof overhead, and
	// coming down, on its wheels, in a wipeout, or rolling back onto them after one.
	airStep( dt ) {

		const { air } = this;
		air.time += dt;
		this.airTime += dt;
		const middle = this.y + this.centre.y;
		// The ground under its middle, looked for from just over it (before it moves, so it can't
		// drop through a roof), never a bridge or a roof overhead.
		const ground = this.groundAt( this.east, this.north, middle + 0.3 );
		if ( air.righting ) {

			this.rightStep( dt, ground );
			return;

		}

		this.vy -= GRAVITY * dt;
		const reach = this.extent( UP, air.q );
		if ( this.vy > 0 ) {

			enuToLocal( this.east, this.north, middle, _origin );
			if ( this.cast( _origin, UP, reach + this.vy * dt + 0.05 ) ) this.vy *= - 0.3;

		}

		this.y += this.vy * dt;
		if ( ground === null ) {

			// Off the edge of the world: put it back where it last stood.
			if ( this.y < this.lastSafe.y - 200 ) {

				Object.assign( this, this.lastSafe, { speed: 0, vy: 0, pitch: 0, roll: 0, grounded: true, airTime: 0 } );
				this.air = null;
				this.hud.setPending?.( null );

			}

			return;

		}

		// Down only coming down: thrown up off something low, the top of that thing can be under its
		// middle and over its wheels for a moment, and it isn't landing on it.
		if ( this.vy > 0 || this.y + this.centre.y - reach > ground ) return;
		this.y = ground + reach - this.centre.y;
		if ( air.wipeout ) this.startRighting();
		else if ( this.tilt( air.q ) <= LAND_TILT ) this.touchDown( ground );
		else this.wipeOut( ground );

	}

	// Down on its wheels: it goes the way it points, losing what was sideways, bounces on its
	// suspension, settles onto the ground's tilt (see update) and banks its tricks.
	touchDown( ground ) {

		const { air } = this;
		const { q } = air;
		const at = localToEnu( this.middle( _b ).sub( _a.copy( this.centre ).applyQuaternion( q ) ) );
		_euler.setFromQuaternion( q, 'YXZ' );
		this.east = at.east;
		this.north = at.north;
		this.y = ground;
		this.heading = yawToHeading( _euler.y );
		this.pitch = _euler.x;
		this.roll = _euler.z;
		this.speed *= Math.cos( ( this.course - this.heading ) * MathUtils.DEG2RAD );
		this.course = this.heading;
		if ( this.vy < - 12 ) this.speed *= 0.8;
		this.squashBy( - this.vy * SQUASH.land, 'land' );
		if ( this.vy < - 5 ) this.fx?.dust( enuToLocal( this.east, this.north, ground, _c ), MathUtils.clamp( - this.vy / 15, 0, 1 ), this.width );
		if ( ! air.flew ) this.bestAir = Math.max( this.bestAir, air.time );
		const tricks = this.tricksOf( air );
		this.vy = 0;
		this.airTime = 0;
		this.grounded = true;
		this.air = null;
		this.landedAt = this.clock;
		this.hud.setPending?.( null );
		this.payTricks( tricks );

	}

	// Down on its roof or side: a wipeout. It tumbles for a moment, losing the tricks it was doing and
	// the combo, then rolls back onto its wheels (see startRighting).
	wipeOut( ground ) {

		const { air } = this;
		const lost = this.tricksOf( air );
		const hard = Math.max( 0, - this.vy );
		air.wipeout = true;
		this.y = Math.max( this.y, ground + this.extent( UP, air.q ) - this.centre.y );
		if ( ! air.flew ) this.bestAir = Math.max( this.bestAir, air.time );
		this.vy = MathUtils.clamp( hard * 0.3, WIPE_HOP * 0.6, WIPE_HOP );
		this.speed *= WIPE_KEEP;
		air.spin.multiplyScalar( 0.5 );
		this.squashBy( Math.max( 2, hard * SQUASH.land ), 'land' );
		this.shake = Math.max( this.shake, Math.min( SHAKE_MAX, hard * SHAKE ) );
		const power = MathUtils.clamp( hard / 15, 0.3, 1 );
		enuToLocal( this.east, this.north, ground, _c );
		this.fx?.burst( _c, UP, power );
		this.fx?.dust( _c, power, this.width );
		this.hud.pop?.( 'WIPEOUT!', power, 'wipeout' );
		if ( lost.length || this.mult > 1 ) this.hud.tricks?.( { lines: lost.map( trick => trick.name ), mult: this.mult, lost: true } );
		this.mult = 1;
		this.lastTrick = - Infinity;
		this.showScore();
		this.hud.setPending?.( null );

	}

	// After a wipeout's tumble: back onto its wheels where it lies, facing the way its nose points
	// across the ground (nose up or down, the way it would face once tipped back).
	startRighting() {

		const { air } = this;
		const nose = _z.set( 0, 0, - 1 ).applyQuaternion( air.q );
		const facing = Math.hypot( nose.x, nose.z ) > 0.3 ? nose : _y.set( 0, 1, 0 ).applyQuaternion( air.q ).multiplyScalar( nose.y < 0 ? 1 : - 1 );
		const heading = ( Math.atan2( - facing.x, facing.z ) * MathUtils.RAD2DEG + 360 ) % 360;
		air.righting = { from: air.q.clone(), to: new Quaternion().setFromEuler( _euler.set( 0, headingToYaw( heading ), 0, 'YXZ' ) ), t: 0, heading };
		air.spin.set( 0, 0, 0 );
		this.vy = 0;

	}

	// Rolling back onto its wheels, as high as its box needs as it turns, with a little lift.
	rightStep( dt, ground ) {

		const { air } = this;
		const righting = air.righting;
		righting.t = Math.min( 1, righting.t + dt / RIGHT_TIME );
		const t = righting.t;
		air.q.slerpQuaternions( righting.from, righting.to, t * t * ( 3 - 2 * t ) );
		this.speed *= Math.exp( - 4 * dt );
		if ( ground !== null ) this.y = ground + this.extent( UP, air.q ) - this.centre.y + Math.sin( Math.PI * t ) * 0.15 * this.half.y;
		if ( t < 1 ) return;
		const at = localToEnu( this.middle( _b ).sub( _a.copy( this.centre ).applyQuaternion( air.q ) ) );
		this.east = at.east;
		this.north = at.north;
		this.y = ground ?? at.up;
		this.heading = righting.heading;
		this.pitch = 0;
		this.roll = 0;
		this.speed *= Math.cos( ( this.course - this.heading ) * MathUtils.DEG2RAD );
		this.course = this.heading;
		this.vy = 0;
		this.airTime = 0;
		this.grounded = true;
		this.air = null;
		this.landedAt = this.clock;
		this.squashBy( 1.2, 'land' );

	}

	// In the air, a corner turning toward the wall it bounced off could swing into it: for a moment
	// after (WALL_GUARD), keep the box clear of that wall.
	keepClear() {

		const { wall, q } = this.air;
		if ( ! wall || this.clock > wall.until ) return;
		const toward = _n.set( wall.east, 0, - wall.north );
		const reach = this.extent( toward, q );
		const middle = this.y + this.centre.y;
		let push = 0;
		for ( const up of [ middle, Math.max( this.y + this.bumpers[ 0 ], middle - this.extent( UP, q ) * 0.6 ) ] ) {

			enuToLocal( this.east, this.north, up, _origin );
			const hit = this.cast( _origin, toward, reach + 0.3 );
			if ( ! hit?.face ) continue;
			_normal.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld );
			if ( Math.abs( _normal.y ) >= 0.5 ) continue;
			push = Math.max( push, reach + 0.02 - hit.distance );

		}

		if ( push <= 0 ) return;
		this.east += wall.east * push;
		this.north += wall.north * push;
		// And nothing left of its speed into the wall.
		const rad = this.course * Math.PI / 180;
		const ve = Math.sin( rad ) * this.speed;
		const vn = Math.cos( rad ) * this.speed;
		const into = - ( ve * wall.east + vn * wall.north );
		if ( into > 0 ) this.setVelocity( ve + wall.east * into, vn + wall.north * into );

	}

	// The tricks in a jump so far: [ { name, points, pending } ], `pending` being how it reads while
	// still in the air.
	tricksOf( air ) {

		const { turned } = air;
		const degrees = angle => Math.abs( angle ) * MathUtils.RAD2DEG;
		const tricks = [];
		const halves = Math.floor( ( degrees( turned.y ) + SPIN_TOL ) / 180 );
		if ( halves > 0 ) tricks.push( { name: `${ halves * 180 } Spin!`, points: POINTS.spin * halves } );
		const flips = Math.floor( ( degrees( turned.x ) + FLIP_TOL ) / 360 );
		const flip = turned.x > 0 ? 'Backflip' : 'Frontflip';
		if ( flips > 0 ) tricks.push( { name: flips > 1 ? `${ flip } ×${ flips }` : `${ flip }!`, points: POINTS.flip * flips } );
		const rolls = Math.floor( ( degrees( turned.z ) + FLIP_TOL ) / 360 );
		if ( rolls > 0 ) tricks.push( { name: rolls > 1 ? `Barrel roll ×${ rolls }` : 'Barrel roll!', points: POINTS.roll * rolls } );
		if ( air.hits > 0 && ! air.flew ) tricks.push( { name: air.hits > 1 ? `Wall bounce ×${ air.hits }` : 'Wall bounce', points: POINTS.bounce * air.hits } );
		if ( air.time >= BIG_AIR && ! air.flew ) tricks.push( { name: `Big air ${ air.time.toFixed( 1 ) } s`, points: Math.round( air.time * POINTS.air ), pending: 'Big air' } );
		return tricks;

	}

	// What it's done in the air so far, for the HUD, when that changes.
	showPending() {

		const lines = this.tricksOf( this.air ).map( trick => trick.pending ?? trick.name );
		const text = lines.join( '\n' );
		if ( text === this.air.pending ) return;
		this.air.pending = text;
		this.hud.setPending?.( lines.length ? lines : null );

	}

	// Bank a jump's tricks: their points (more for a combo) times the combo multiplier, which then
	// goes up a step for each; a top-up for the booster and a burst of speed.
	payTricks( tricks ) {

		if ( tricks.length === 0 ) return;
		const combo = tricks.length > 1;
		// Shown as these points times the multiplier ("+1,310 ×2"), which is what's added: shown
		// already multiplied, "+2,620 ×2" read as if it were still to be doubled.
		const points = Math.round( tricks.reduce( ( sum, trick ) => sum + trick.points, 0 ) * ( combo ? COMBO_BONUS : 1 ) / 10 ) * 10;
		this.hud.tricks?.( { lines: tricks.map( trick => trick.name ), points, mult: this.mult, combo } );
		const gained = points * this.mult;
		this.score += gained;
		if ( gained > ( this.bestJump?.points ?? 0 ) ) this.bestJump = { lines: tricks.map( trick => trick.name ), points: gained };
		this.mult = Math.min( MULT_MAX, this.mult + tricks.length );
		this.lastTrick = this.clock;
		const newBest = this.score > this.best;
		if ( newBest ) {

			this.best = this.score;
			saveBest( this.best );

		}

		this.showScore();
		this.onScore?.( this.runSoFar( newBest ) );
		this.gauge = Math.min( 1, this.gauge + TRICK_GAUGE * tricks.length );
		// The burst only going forward: landed backwards off a wall, it would drive it straight back
		// into the wall, and round again.
		if ( this.speed <= 1 ) return;
		const time = Math.min( TRICK_BOOST.max, TRICK_BOOST.time + TRICK_BOOST.each * tricks.length );
		this.boost = { time, speed: TRICK_BOOST.speed, name: 'Trick boost', left: time };

	}

	showScore() {

		this.hud.setScore?.( { score: this.score, mult: this.mult, best: this.best } );

	}

	// The run so far, for onScore: { score, best, newBest (this score is a new best), tricks (the
	// best jump's, as "Backflip! + 360 Spin!"), runSeconds (driven, pauses left out), airTime (the
	// longest, s) }.
	runSoFar( newBest = false ) {

		return {
			score: this.score,
			best: this.best,
			newBest,
			tricks: this.bestJump?.lines.join( ' + ' ) ?? '',
			runSeconds: Math.max( 1, Math.ceil( this.clock - this.runStart ) ),
			airTime: Math.round( Math.max( this.runAir, this.bestAir ) * 10 ) / 10,
		};

	}

	// How it's turned: in the air its own attitude; on the ground or flying, as it stands, and
	// flying, turned by a trick on top of that.
	attitude( target ) {

		if ( this.air && ! this.air.flight ) return target.copy( this.air.q );
		target.setFromEuler( _euler.set( this.pitch, headingToYaw( this.heading ), this.roll, 'YXZ' ) );
		if ( this.air ) target.multiply( this.air.q );
		return target;

	}

	// The middle of its box, in the scene.
	middle( target ) {

		if ( this.air && ! this.air.flight ) return enuToLocal( this.east, this.north, this.y + this.centre.y, target );
		_q.setFromEuler( _euler.set( this.pitch, headingToYaw( this.heading ), this.roll, 'YXZ' ) );
		return enuToLocal( this.east, this.north, this.y, target ).add( _a.copy( this.centre ).applyQuaternion( _q ) );

	}

	// How far its box reaches from its middle along `dir` (a unit vector in the scene), turned by `q`.
	extent( dir, q ) {

		_x.set( 1, 0, 0 ).applyQuaternion( q );
		_y.set( 0, 1, 0 ).applyQuaternion( q );
		_z.set( 0, 0, 1 ).applyQuaternion( q );
		return this.half.x * Math.abs( _x.dot( dir ) ) + this.half.y * Math.abs( _y.dot( dir ) ) + this.half.z * Math.abs( _z.dot( dir ) );

	}

	// How far (°) `q` has it from upright.
	tilt( q ) {

		return Math.acos( MathUtils.clamp( _y.set( 0, 1, 0 ).applyQuaternion( q ).y, - 1, 1 ) ) * MathUtils.RAD2DEG;

	}

	// The squash: `speed` (1/s) squashing it along its length (`along` 'hit') or top to bottom
	// ('land'), which springs back (see springSquash).
	squashBy( speed, along ) {

		this.squash.speed -= speed;
		this.squash.along = along;

	}

	springSquash( dt ) {

		const { squash } = this;
		if ( squash.value === 0 && squash.speed === 0 ) return;
		// In small steps, so the stiff spring stays steady at a low frame rate.
		for ( let left = dt; left > 1e-6; left -= 1 / 120 ) {

			const step = Math.min( left, 1 / 120 );
			squash.speed -= ( SQUASH.stiffness * squash.value + SQUASH.damping * squash.speed ) * step;
			squash.value = MathUtils.clamp( squash.value + squash.speed * step, - SQUASH.max, SQUASH.max );

		}

		if ( Math.abs( squash.value ) < 1e-3 && Math.abs( squash.speed ) < 0.05 ) squash.value = squash.speed = 0;
		// Squashed one way, it bulges the others.
		const { scale } = this;
		const s = squash.value;
		if ( squash.along === 'land' ) this.entry.pivot.scale.set( scale * ( 1 - s * 0.45 ), scale * ( 1 + s ), scale * ( 1 - s * 0.45 ) );
		else this.entry.pivot.scale.set( scale * ( 1 - s * 0.5 ), scale * ( 1 - s * 0.5 ), scale * ( 1 + s ) );

	}

	// The way the chase camera looks: after the vehicle's heading, eased so that a spin or a bounce
	// doesn't whip it round, and slowly for a moment after landing. In the air it barely turns, and
	// only toward the line it's flying along, either way along it, so flying back off a wall doesn't
	// swing it round.
	turnView( dt ) {

		let target = this.heading;
		let rate = this.clock - this.landedAt < 1 ? 3 : 12;
		if ( this.air && ! this.air.flight ) {

			rate = 0.8;
			target = this.speed > 4 ? this.course : this.view;
			if ( Math.cos( ( target - this.view ) * MathUtils.DEG2RAD ) < 0 ) target += 180;

		}

		const turn = ( ( target - this.view ) % 360 + 540 ) % 360 - 180;
		this.view += MathUtils.clamp( turn * Math.min( 1, dt * rate ), - VIEW_TURN * dt, VIEW_TURN * dt );
		this.shake *= Math.exp( - SHAKE_DECAY * dt );

	}

	placeCamera( dt ) {

		// With stunts on, the way it looks is eased round after the vehicle (see turnView).
		const rad = ( this.launch ? this.view : this.heading ) * Math.PI / 180;
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
			// behind at speed. Thrown into the air with stunts on, it only eases up and down after it,
			// more slowly (AIR_CAMERA, AIR_LAG), so the throw is seen: moved up with it, the camera
			// kept the vehicle still on screen and only the scenery behind it dropped away.
			const thrown = !! this.air && ! this.air.flight;
			if ( this.lastBase ) {

				_a.subVectors( base, this.lastBase );
				if ( thrown ) _a.y = 0;
				this.camera.position.add( _a );

			}

			this.lastBase = ( this.lastBase ?? new Vector3() ).copy( base );
			const was = this.camera.position.y;
			this.camera.position.lerp( _target, 1 - Math.exp( - dt * 6 ) );
			if ( thrown ) this.camera.position.y = MathUtils.clamp( was + ( _target.y - was ) * ( 1 - Math.exp( - dt * AIR_CAMERA ) ), _target.y - AIR_LAG, _target.y + AIR_LAG );
			this.keepOut( _eye, this.camera.position );
			_look.copy( base ).addScaledVector( forward, 8 ).setY( base.y + height * 0.6 );

		}

		// Shaken by a hit: the view, not the camera, so the shake never puts it inside a wall.
		if ( this.shake > 0.01 ) {

			_look.x += Math.sin( this.clock * 47 ) * this.shake;
			_look.y += Math.sin( this.clock * 61 + 1 ) * this.shake * 0.7;
			_look.z += Math.sin( this.clock * 53 + 2 ) * this.shake;

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

	// The ground's height under ( east, north ), looked for down from `from` (m up).
	groundAt( east, north, from = this.y + 4 ) {

		enuToLocal( east, north, from, _origin );
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

// The best stunt score, kept in this browser (where it can be).
function loadBest() {

	try {

		return Math.max( 0, Number( localStorage.getItem( BEST_KEY ) ) || 0 );

	} catch {

		return 0;

	}

}

function saveBest( score ) {

	try {

		localStorage.setItem( BEST_KEY, String( score ) );

	} catch {

		// Storage blocked (a private window): it's kept for this visit only.

	}

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
