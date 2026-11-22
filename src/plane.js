import { AdditiveBlending, CylinderGeometry, Euler, ExtrudeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, Shape, Vector3 } from 'three';
import { enuToLocal } from './geo.js';
import { PLANE_TRICKS, countTricks, followLoop, loopGate, loopOffset, noseAngle, planeTricksOf } from './plane-tricks.js';

// Plane mode (World Drive): T turns the ride into a little plane. Wings swing down from its sides
// with a jet under each, a fin rises at the back and (on a ride whose wheels can, cars.js) the
// wheels fold flat as fans, and it lifts off. T again flies it down and folds it back into a car on
// the ground. It does tricks of its own: Q/E (or , and .) roll it, Z (or /) loops it nose up and
// over and X nose down and under (on a touch screen, the ↺ button is TRICK: tapped, a roll; held with
// UP or DOWN, a loop), scored as the car's tricks are, but bounded (plane-tricks.js), since a plane
// never has to land a trick. Nothing else of the car's scoring goes with it (no drifts or boost, no
// challenge runs), and the app keeps it out of the levels' distance. Its run carries on when it's
// down: the points it scored flying are kept.
//
// How fast it may go depends on how high it is (SPEEDS): a crawl just off the ground, for looking
// at a place, and faster the higher it climbs, as the ground below it gets further away. Climbing
// and coming down are quicker the higher it is too (CLIMB).
//
// Never slower than CAR_SHARE times the ride's own top speed, though: a plane's speed even low
// down. T again, flying, drops out of it: the kit folds away, the car falls (as fast as a skydiver,
// DROP, faster head-down with W, its speed across the ground shed quickly) and a parachute opens
// over it in good time before the ground (PARACHUTE), lowering it slowly, steered a little with A/D,
// S spilling air to come down faster, onto its wheels; T while dropping unfolds it again. Within
// DROP.low m of the ground it lands and folds back as it always did.
//
// It's made by the Driver it belongs to (the `plane` option) and drives that Driver's vehicle,
// using its position (east, north, y, heading, speed), its rays and its camera.

// How long (s) the kit takes to unfold and fold, and how high (m) it lifts as it unfolds.
export const UNFOLD = 0.9;
export const FOLD = 0.7;
const LIFT = 3;
// The lowest it flies over the ground (m), and the highest (m over the ground).
const CLEARANCE = 0.8;
const CEILING = 12000;
// The fastest it may go (km/h) at each height over the ground (m), and in between, on a log
// scale of the height: 60 km/h just off the ground, 325 km/h at 150 m, 1,700 km/h at 2 km, 5,000
// at 6 km and 12,000 km/h (3,333 m/s) at its ceiling. (Since 2026-11-22, the owner wanting 10,000
// km/h and more for the far places: it was 1,170 at 2 km, 2,340 at 6 and 3,500 at the ceiling; low
// down it's as it was. Faster over the Earth means more of Google's tiles fetched a minute: not more of Google's
// bill, which is by the session (main.js), but more for the device to download, and this table is
// the one place to turn it back.) The live protocol's top speed is over the last of these
// (live-protocol.js's TOP_SPEED, live.js's MAX_SPEED): they go up together.
const SPEEDS = [ [ 0, 60 ], [ 30, 130 ], [ 150, 325 ], [ 600, 700 ], [ 2000, 1700 ], [ 6000, 5000 ], [ 12000, 12000 ] ];
// Climbing or coming down (m/s): this much, plus this share of the height, up to the most.
const CLIMB = { base: 6, share: 0.12, most: 250 };
// Speeding up (m/s²): at least this, or this share of the top speed there a second; slowing down
// twice as fast.
const ACCEL = { least: 6, share: 0.35 };
// Turning (°/s) slow and at TURN_FAST km/h and over.
const TURN = [ 80, 28 ];
const TURN_FAST = 1170;
const KMH = 3.6;
const CAR_SHARE = 2;
// The parachute a plane's drop comes down under (here; drive.js's fallStep and airSpin read it
// too): opened PARACHUTE.open m over the ground, or on the Earth `floor` m (where the drop is
// fastest, and over buildings), or, coming at the ground faster, `lead` s of it out (see
// closingSpeed), it slows the fall at `settle` (1/s) to `sink` m/s times the square root of the
// gravity, but never slower than `sinkLeast` m/s (on Vesta and Ceres that would be minutes of
// hanging there), and S held spills air from it for `spill` times that. Its speed across the ground
// slows at `drag` (1/s), and it turns back upright at `right` (1/s), so it lands on its wheels.
// `size`: the canopy's radius as a share of the vehicle's width (at least `least` m). On the
// Earth that's 10 m/s (it was 2.5, a long, slow float): a few seconds down from 45 m.
export const PARACHUTE = { open: 25, floor: 45, lead: 0.3, sink: 10, sinkLeast: 3, settle: 6, spill: 2, drag: 0.25, right: 3, size: 1.3, least: 2.5 };
// The drop (T, flying): falling faster at `boost` times the gravity, and at `pull` m/s² at least (in
// weak gravity a fall would crawl), so it drops like a stone rather than drifting, and at most at
// `terminal` m/s on the Earth (well past a skydiver's: it's a game), `least` m/s on the Moon and
// lighter worlds, in between by the gravity, and `dive` times that head-down (W held). Above the
// ride's own top speed, its speed across the ground is shed at `shed` (1/s, gone in a couple of
// seconds after a bail-out at 3,500 km/h, so it reads as a fall); turned `steer` °/s with A/D;
// and under `low` m over the ground, no drop, it lands and folds as before. (There's no air on
// the Moon, Vesta or Ceres to set a falling speed: `least` is a game's cap there, which keeps the
// parachute's opening sane and everything far under the live protocol's top speed.)
// (Faster since 2026-11-22, the owner finding the fall far too slow: 300 m/s on the Earth, 200 on
// the Moon, reached at 5 times the gravity, 30 m/s² at least, where it was 160 and 100 at 2.5 times
// and 12; and the parachute opens later, `lead` 0.3 s of the fall over the ground where it was 0.7,
// and bites harder, `settle` 6 where it was 4, so it isn't a longer float down instead and still
// lands at its sink: about 5 s under it on the Earth.)
export const DROP = { terminal: 300, least: 200, dive: 1.6, pull: 30, boost: 5, shed: 1.5, steer: 30, low: 12 };
// The gravity (a share of the Earth's) from which a fall is the Earth's, and under which `least`.
const LIGHT = 0.165;

const _a = new Vector3();
const _b = new Vector3();
const _e = new Euler();
const DOWN = new Vector3( 0, - 1, 0 );
const UP = new Vector3( 0, 1, 0 );
// The parachute looks this far ahead (s, along the way the drop is going) for ground rising to
// meet it (see closingSpeed).
const AHEAD = 1;
// A ↺ (TRICK) tap rolls it this much of a whole turn under the key; it coasts on round the rest.
const TAP_ROLL = 0.9;

// The top speed (m/s) at `height` m over the ground.
export function planeTopSpeed( height ) {

	const h = Math.log1p( Math.max( 0, height ) );
	for ( let i = 1; i < SPEEDS.length; i ++ ) {

		const [ h1, s1 ] = SPEEDS[ i ];
		if ( h > Math.log1p( h1 ) && i < SPEEDS.length - 1 ) continue;
		const [ h0, s0 ] = SPEEDS[ i - 1 ];
		const t = MathUtils.clamp( ( h - Math.log1p( h0 ) ) / ( Math.log1p( h1 ) - Math.log1p( h0 ) ), 0, 1 );
		return MathUtils.lerp( s0, s1, t ) / KMH;

	}

	return SPEEDS[ SPEEDS.length - 1 ][ 1 ] / KMH;

}

// How fast (m/s) it climbs or comes down at `height` m over the ground.
export function planeClimbRate( height ) {

	return Math.min( CLIMB.most, CLIMB.base + Math.max( 0, height ) * CLIMB.share );

}

// The drop's falling speed at most (m/s) in `gravity` (a share of the Earth's), `diving` (W held)
// or spread out: 160 (256 diving) on the Earth, about 115 on Mars, 100 (160) on the Moon and lighter.
export function dropTerminal( gravity, diving = false ) {

	const earthly = MathUtils.clamp( ( gravity - LIGHT ) / ( 1 - LIGHT ), 0, 1 );
	return ( DROP.least + ( DROP.terminal - DROP.least ) * earthly ) * ( diving ? DROP.dive : 1 );

}

// How fast (m/s²) the drop falls faster, in `gravity`: DROP.boost times its own, but never under
// DROP.pull (49 on the Earth, 30 on the Moon and lighter).
export function dropPull( gravity ) {

	return Math.max( 9.81 * gravity * DROP.boost, DROP.pull );

}

// The speed (m/s, down) under the parachute in `gravity`, `spilling` air (S held) or not: 10 m/s
// on the Earth, about 6 on Mars, 4 on the Moon, 3 on Vesta and Ceres; twice that spilling.
export function chuteSink( gravity, spilling = false ) {

	return Math.max( PARACHUTE.sink * Math.sqrt( gravity ), PARACHUTE.sinkLeast ) * ( spilling ? PARACHUTE.spill : 1 );

}

// The height (m over the ground) the parachute opens at, coming at the ground at `closing` m/s, in
// `gravity`: PARACHUTE.open, PARACHUTE.floor on the Earth (gravity 1), or `lead` s of the closing
// speed out, whichever is highest.
export function chuteHeight( closing, gravity ) {

	return Math.max( PARACHUTE.open, gravity >= 1 ? PARACHUTE.floor : 0, PARACHUTE.lead * closing );

}

export class PlaneMode {

	constructor( driver ) {

		this.driver = driver;
		this.kit = null;
		this.reset();

	}

	// Whether it's a plane (unfolding, flying, coming down or folding back).
	get on() {

		return this.phase !== null;

	}

	// Off at once (a new drive, or getting out), with the kit gone, and a trick being flown with
	// it, unpaid.
	reset() {

		this.driver.showChute?.( false );
		if ( this.driver.air?.plane ) {

			this.driver.air = null;
			this.driver.hud?.setPending?.( null );

		}

		this.clearPass();
		this.counts = {};
		this.phase = null;
		this.deploy = 0;
		this.time = 0;
		this.vy = 0;
		this.steer = 0;
		this.ground = null;
		this.height = 0;
		this.thrust = 0;
		this.kit?.dispose();
		this.kit = null;

	}

	// T: into a plane from driving (or from flying on F), or, as one, down and back into a car; while
	// coming down, T flies on instead.
	toggle() {

		if ( this.phase === null ) this.begin();
		else if ( this.phase === 'flying' && this.height > DROP.low ) this.drop();
		else if ( this.phase === 'flying' ) this.phase = 'landing';
		else if ( this.phase === 'landing' ) this.phase = 'flying';
		else if ( this.phase === 'dropping' ) {

			// Back into a plane, from where it's falling.
			this.driver.showChute( false );
			this.phase = 'unfolding';
			this.time = 0;
			this.from = this.driver.y;
			this.driver.hud.flash( 'Plane!' );

		}

	}

	// Out of the plane, in the air: the kit folds away and it falls, the parachute to come. A trick
	// being flown is paid for its whole turns.
	drop() {

		this.endPass();
		this.phase = 'dropping';
		this.time = 0;
		this.vy = Math.min( this.vy, 0 );
		this.driver.chute = { open: false, t: 0 };
		this.driver.hud.flash( 'Freefall! W dive · A/D steer' );

	}

	begin() {

		const d = this.driver;
		// Whatever it was doing stops: a drift, the booster, a jump's tricks (not landed, so not scored).
		if ( d.drifting ) d.endDrift( false );
		d.cutBooster();
		d.boost = null;
		// Out of overdrive too: a plane never checks for it (updatePlane), so it would stay on, its
		// flame, streaks, warp and badge with it, for the whole flight.
		if ( d.supersonic ) d.hud.setSupersonic?.( false );
		d.supersonic = false;
		d.nearTop = 0;
		d.warp = 0;
		d.air = null;
		d.flying = false;
		d.grounded = false;
		d.airTime = 0;
		d.driftHop = false;
		if ( d.body ) for ( const spring of [ d.body.pitch, d.body.roll ] ) spring.value = spring.speed = 0;
		d.hud.setFlying?.( false );
		d.hud.setPlane?.( true );
		this.phase = 'unfolding';
		this.time = 0;
		this.vy = 0;
		this.steer = d.steer;
		this.from = d.y;
		this.kit = createPlaneKit( { pivot: d.entry.pivot, box: d.ownBox } );
		this.counts = {};
		d.speed = Math.max( 0, d.speed );
		// (Bailing out is the same key as this: T, or F too where F doesn't fly.)
		d.hud.flash( `Plane! Space up · Shift down · Q/E roll · Z loop · ${ d.fly ? 'T' : 'F/T' } to bail out` );
		d.onPlane?.( true );

	}

	// Back into a car, on the ground: it drives on from here, at what speed it landed with. Its run
	// carries on (what it scored flying is kept: drive.js's newRun isn't called), but a trick boost
	// paid in the air is dropped, or the car would shoot off as it lands.
	finish() {

		const d = this.driver;
		this.endPass();
		this.reset();
		d.boost = null;
		d.grounded = true;
		d.flying = false;
		d.vy = 0;
		d.pitch = 0;
		d.roll = 0;
		d.lastSafe = { east: d.east, north: d.north, y: d.y };
		d.lastGood = d.recentGood = { east: d.east, north: d.north, y: d.y };
		d.hud.setPlane?.( false );
		d.onPlane?.( false );

	}

	// The scene's frame moved under it (Driver.transform, which has carried the vehicle and its
	// velocity): the heights it keeps in the scene's frame (where it lifts off to while unfolding, and
	// the ground last found under it) go up or down by as much as the vehicle did (`dy` m), so a
	// recentre mid-unfold doesn't send it shooting up or diving to the ground; and its climb is the
	// vehicle's, turned with the frame.
	transform( dy ) {

		if ( ! this.on ) return;
		if ( this.from !== undefined ) this.from += dy;
		if ( this.ground !== null ) this.ground += dy;
		// (The driver's climb has the loop's hump in it, which isn't the plane's own: see update.)
		this.vy = this.driver.vy - this.loopVy;

	}

	// A key going down while it's a plane (drive.js's press: the car's own keys do nothing as one).
	// ↺ (R; TRICK on a touch screen), flying: a whole roll, toward the way it's steered (right if it
	// isn't), unless UP or DOWN is held with it, which loops it instead (see trickInput).
	press( code ) {

		if ( code !== 'KeyR' || this.phase !== 'flying' ) return;
		const { keys } = this.driver;
		if ( keys.has( 'Space' ) || downHeld( keys ) ) return;
		this.tapRoll = { dir: this.driver.steerInput() < 0 ? 1 : - 1, from: null };

	}

	// What the keys ask of a trick, each -1 to 1 about the plane's own axes (drive.js's turn): pitch,
	// + nose up (Z or /, or TRICK with UP: a loop) or - nose down (X, or TRICK with DOWN: an outside
	// loop); roll, + over to the left (Q or ,) or - to the right (E or .), or a TRICK tap's roll.
	trickInput( keys ) {

		const trick = keys.has( 'KeyR' );
		const tap = this.tapRoll?.dir ?? 0;
		const left = keys.has( 'KeyQ' ) || keys.has( 'Comma' ) || tap > 0;
		const right = keys.has( 'KeyE' ) || keys.has( 'Period' ) || tap < 0;
		const loop = keys.has( 'KeyZ' ) || keys.has( 'Slash' ) || trick && keys.has( 'Space' );
		const outside = keys.has( 'KeyX' ) || trick && downHeld( keys );
		return { yaw: 0, pitch: loop ? 1 : outside ? - 1 : 0, roll: left ? 1 : right ? - 1 : 0 };

	}

	// A frame of a trick (flying only), on top of how it flies (the driver's `air`, made by the first
	// trick key, so plain flying is untouched): turned by the keys and righted once they're let go
	// (Driver.planeSpin, as a car's tricks flying with F were), and over the loop's hump: this frame's
	// share of it (m) goes in `loopStep`, for update to move it by. Paid once the plane has settled
	// (see endPass).
	trick( dt, keys ) {

		const d = this.driver;
		this.loopStep = 0;
		const input = this.trickInput( keys );
		const asked = input.pitch !== 0 || input.roll !== 0;
		if ( ! d.air ) {

			if ( ! asked ) return;
			// (A pass from nothing: but a TRICK tap that asked for it stays asked.)
			const { tapRoll } = this;
			d.enterAir( true );
			d.air.plane = true;
			this.clearPass();
			this.tapRoll = tapRoll;
			this.passTop = this.height;

		}

		const { air } = d;
		// A TRICK tap rolls it until it's most of the way round; it coasts round the rest.
		if ( this.tapRoll ) {

			if ( this.tapRoll.from === null ) this.tapRoll.from = air.turned.z;
			if ( Math.abs( air.turned.z - this.tapRoll.from ) >= TAP_ROLL * 2 * Math.PI ) this.tapRoll = null;

		}

		// The loop's size: a circle of this radius (m) is what the nose turning at the trick's rate
		// traces at this speed (speed / ω; see loopOffset). Flat out (972 m/s) that's 177 m for a
		// kart (ω = 5.5 rad/s) and 321 m for the biggest rides (trickRate 0.55, ω = 3.0 rad/s); at
		// 325 km/h (150 m up) 16 to 30 m; at the 60 km/h crawl 3 to 6 m. The hump goes up (or down)
		// by as much as the radius at most (LOOP.lift).
		const radius = Math.max( 0, d.speed ) / d.loopRate;
		// Too low to start a loop that way: no nose up or down until it's higher, and righted twice as
		// fast. (Rolls go at any height; a loop already going carries on.)
		let righting = 1;
		if ( input.pitch && Math.abs( this.loop ) < 0.1 && this.height < loopGate( radius, input.pitch < 0 ) ) {

			input.pitch = 0;
			righting = 2;

		}

		d.planeSpin( dt, input, righting );
		this.loop = followLoop( this.loop, noseAngle( air.q ) );
		const lift = loopOffset( this.loop, radius );
		this.loopStep = lift - this.loopLift;
		this.loopLift = lift;
		this.passTop = Math.max( this.passTop, this.height - lift );

		// Settled: no trick key for a moment, and back about level.
		this.idle = asked ? 0 : this.idle + dt;
		const off = 2 * Math.acos( Math.min( 1, Math.abs( air.q.w ) ) ) * MathUtils.RAD2DEG;
		if ( this.idle >= PLANE_TRICKS.settle && off <= PLANE_TRICKS.level ) {

			this.endPass();
			return;

		}

		// What it's done so far, on the HUD, when that changes.
		const { lines } = planeTricksOf( air, { height: this.passTop, counts: this.counts } );
		const text = lines.join( '\n' );
		if ( text === this.pending ) return;
		this.pending = text;
		d.hud.setPending?.( lines.length ? lines : null );

	}

	// The end of a pass of tricks (settled, or cut short by bailing out, coming down to land or
	// getting out of the plane): its whole turns paid (drive.js's payTricks, with the combo bonus,
	// the multiplier, the leaderboard's best jump and the XP), counted for the repeats rule, and the
	// trick's turn handed to the plane's own pitch and roll, which ease back from there rather than
	// snapping level.
	endPass() {

		const d = this.driver;
		if ( ! d.air?.plane ) return;
		const { tricks, lines } = planeTricksOf( d.air, { height: this.passTop, counts: this.counts } );
		// The turn as a yaw, a pitch and a roll (YXZ, as pose() draws them). Each turn has two such
		// readings; the one with the smaller yaw is taken (half-way round a loop, nose up π rather
		// than turned round π and rolled over π), and that yaw goes into the heading, so cut short at
		// any attitude (a bail-out or a landing mid-loop) the plane is drawn as it was, not snapped
		// round. (A settled pass is within PLANE_TRICKS.level of level, so it's a few degrees at most.)
		_e.setFromQuaternion( d.air.q, 'YXZ' );
		let { x, y, z } = _e;
		if ( Math.abs( y ) > Math.PI / 2 ) {

			x = Math.PI - x;
			y -= Math.sign( y ) * Math.PI;
			z -= Math.sign( z || 1 ) * Math.PI;

		}

		d.pitch += x;
		d.roll += z;
		d.heading -= y * MathUtils.RAD2DEG;
		d.course = d.heading;
		d.air = null;
		d.hud.setPending?.( null );
		this.clearPass();
		if ( tricks.length === 0 ) {

			// Whole turns that pay nothing (repeated until they're worth nothing): the combo ends, as
			// it would on the ground, so the multiplier can't be held at its top all flight.
			if ( lines.length && d.mult > 1 ) {

				d.mult = 1;
				d.showScore();

			}

			return;

		}

		countTricks( this.counts, tricks );
		d.payTricks( tricks );

	}

	// A pass's own state back to nothing (its hump left where it is: the plane is where it is).
	clearPass() {

		this.loop = 0;
		this.loopLift = 0;
		this.loopStep = 0;
		this.loopVy = 0;
		this.idle = 0;
		this.passTop = 0;
		this.tapRoll = null;
		this.pending = '';

	}

	// Each frame while it's a plane: moves the vehicle (the Driver poses it and places the camera).
	update( dt ) {

		const d = this.driver;
		const { keys } = d;
		const forward = keys.has( 'KeyW' ) || keys.has( 'ArrowUp' );
		const back = keys.has( 'KeyS' ) || keys.has( 'ArrowDown' );
		// (F only climbs where it doesn't also turn the plane back into a car: the `fly` option on.
		// With TRICK held, UP and DOWN loop it instead: see trickInput.)
		const trick = keys.has( 'KeyR' );
		const up = ( keys.has( 'Space' ) || d.fly && keys.has( 'KeyF' ) ) && ! trick;
		const down = downHeld( keys ) && ! trick;
		const steerInput = d.steerInput();

		// The ground under it: looked for as far down as it may be, and remembered for when it can't
		// be found (tiles not in yet), so the height doesn't jump.
		const ground = this.groundUnder( d.east, d.north, d.y );
		if ( ground !== null ) this.ground = ground;
		if ( this.ground === null ) this.ground = d.y;
		this.height = Math.max( 0, d.y - this.ground );
		if ( this.phase === 'dropping' ) {

			this.fall( dt, steerInput );
			return;

		}

		const top = Math.max( planeTopSpeed( this.height ), d.spec.topSpeed / KMH * CAR_SHARE );
		const rate = planeClimbRate( this.height );

		// Unfolding (lifting off as it goes) and folding back (settling onto the ground).
		if ( this.phase === 'unfolding' ) {

			this.time += dt;
			this.deploy = MathUtils.smootherstep( this.time / UNFOLD, 0, 1 );
			if ( this.time >= UNFOLD ) this.phase = 'flying';

		} else if ( this.phase === 'folding' ) {

			this.time += dt;
			this.deploy = 1 - MathUtils.smootherstep( this.time / FOLD, 0, 1 );
			d.y += ( this.ground - d.y ) * Math.min( 1, dt * 10 );
			d.speed *= Math.max( 0, 1 - dt * 0.8 );
			if ( this.time >= FOLD ) {

				d.y = this.ground;
				this.finish();
				return;

			}

		}

		const flying = this.phase === 'flying' || this.phase === 'landing';
		if ( flying || this.phase === 'unfolding' ) {

			// Thrust: W speeds up, S slows down (to a hover), neither keeps the speed, as a plane
			// cruises. Never over the top speed for its height: coming down, it eases off to that.
			const accel = Math.max( ACCEL.least, top * ACCEL.share );
			if ( forward && d.speed < top ) d.speed = Math.min( top, d.speed + accel * dt );
			if ( back ) d.speed = Math.max( 0, d.speed - accel * 2 * dt );
			if ( d.speed > top ) d.speed = Math.max( top, d.speed - ( d.speed - top ) * Math.min( 1, dt * 1.5 ) - dt );
			this.thrust += ( ( forward ? 1 : back ? 0.15 : 0.5 ) - this.thrust ) * Math.min( 1, dt * 3 );

		}

		// Up and down: Space or F climbs, Shift comes down, neither holds the height; coming down to
		// land, it comes down by itself (steering and thrust still its own). Unfolding, it lifts off.
		let want = 0;
		if ( this.phase === 'unfolding' ) want = ( this.from + LIFT - d.y ) * 3;
		else if ( this.phase === 'landing' ) want = - rate;
		else if ( flying ) want = up ? rate : down ? - rate : 0;
		if ( this.height >= CEILING && want > 0 ) want = 0;
		// Over the ceiling, it comes back down to it: where the frame stays where it was dropped in (the
		// Moon, Mars, the Earth) the world curves away under a level flight, so in the end flying level
		// is climbing, up to where others would stop being sent it (live-protocol.js's STATE_RADII).
		if ( this.height > CEILING ) want = Math.min( want, - Math.min( rate, this.height - CEILING ) );
		this.vy += ( want - this.vy ) * Math.min( 1, dt * 2.5 );
		if ( this.vy > 0 ) {

			// Not up through a roof or a bridge.
			enuToLocal( d.east, d.north, d.y + d.height / 2, _a );
			if ( d.cast( _a, UP, d.height / 2 + this.vy * dt + 0.3 ) ) this.vy = 0;

		}

		// Turning: banked into it, quicker slow than fast.
		this.steer += ( steerInput - this.steer ) * Math.min( 1, dt * 3 );
		const turn = MathUtils.lerp( ...TURN, MathUtils.clamp( d.speed * KMH / TURN_FAST, 0, 1 ) );
		if ( this.phase !== 'folding' ) d.heading += this.steer * turn * dt;
		d.course = d.heading;
		d.steer = this.steer;

		// Tricks, flying (with stunts on: drive.js's crash: 'launch', World Drive's); anything else
		// (coming down to land, folding) ends a pass.
		this.loopStep = 0;
		if ( this.phase === 'flying' && d.launch ) this.trick( dt, keys );
		else this.endPass();
		if ( this.loopStep > 0 ) {

			// Not up through a roof or a bridge on a loop's hump either.
			enuToLocal( d.east, d.north, d.y + d.height / 2, _a );
			// What's blocked comes off the hump as well, so it comes down by only what it went up
			// (loopOffset's rule: a loop leaves the plane as high as it went in).
			if ( d.cast( _a, UP, d.height / 2 + this.loopStep + 0.3 ) ) {

				this.loopLift -= this.loopStep;
				this.loopStep = 0;

			}

		}

		this.move( dt );
		// Its own climb, and the loop's hump (not kept in this.vy: the climb is as it was).
		d.y += this.vy * dt + this.loopStep;
		this.loopVy = dt > 0 ? this.loopStep / dt : 0;

		// Never under the ground: kept CLEARANCE over it, or, coming down to land, down on it and
		// folding back into a car.
		const below = this.groundUnder( d.east, d.north, d.y );
		if ( below !== null ) {

			this.ground = below;
			const floor = below + ( this.phase === 'folding' ? 0 : CLEARANCE );
			if ( d.y < floor ) {

				d.y = floor;
				this.vy = Math.max( 0, this.vy );

			}

			if ( this.phase === 'landing' && d.y <= floor + 0.05 ) {

				this.phase = 'folding';
				this.time = 0;
				d.hud.flash( 'Landed' );

			}

		}

		this.height = Math.max( 0, d.y - this.ground );

		// Nose up climbing and down diving; banked into turns, more the faster it goes.
		const pitch = this.phase === 'unfolding' ? 0.12 * Math.sin( Math.PI * this.deploy ) : MathUtils.clamp( Math.atan2( this.vy, Math.max( 8, d.speed ) ), - 0.6, 0.6 );
		const roll = - this.steer * MathUtils.lerp( 0.25, 0.6, MathUtils.clamp( d.speed / 40, 0, 1 ) ) * this.deploy;
		d.pitch += ( pitch - d.pitch ) * Math.min( 1, dt * 3 );
		d.roll += ( roll - d.roll ) * Math.min( 1, dt * 3 );
		// The climb others are sent (live.js) has the hump in it, so they see the plane loop up and
		// over rather than flat.
		d.vy = this.vy + this.loopVy;

		this.kit?.update( dt, this.deploy, this.thrust );

	}

	// A frame of the drop: the kit folding away, falling (or under the parachute, once it's open),
	// steered a little, until it's down on its wheels and a car again.
	fall( dt, steerInput ) {

		const d = this.driver;
		const { keys } = d;
		const chute = d.chute ?? ( d.chute = { open: false, t: 0 } );
		this.time += dt;
		this.deploy = Math.max( 0, this.deploy - dt / FOLD );
		if ( ! chute.open && this.vy < 0 && this.height <= chuteHeight( this.closingSpeed(), d.gravity ) ) {

			chute.open = true;
			d.showChute( true );
			d.hud.flash( 'Parachute! A/D steer · S to drop faster' );

		}

		const top = d.spec.topSpeed / KMH;
		if ( chute.open ) {

			// Lowered slowly; S (or ↓) spills air from the canopy, to come down faster.
			chute.t += dt;
			const spilling = keys.has( 'KeyS' ) || keys.has( 'ArrowDown' );
			this.vy += ( - chuteSink( d.gravity, spilling ) - this.vy ) * Math.min( 1, dt * PARACHUTE.settle );
			d.speed *= Math.exp( - PARACHUTE.drag * dt );

		} else {

			// Falling faster up to a skydiver's speed (more head-down, W or ↑), and no faster: one
			// falling faster than that (out of a plane diving, or let go of W) eases back to it.
			const terminal = dropTerminal( d.gravity, keys.has( 'KeyW' ) || keys.has( 'ArrowUp' ) );
			if ( this.vy > - terminal ) this.vy = Math.max( - terminal, this.vy - dropPull( d.gravity ) * dt );
			else this.vy += ( - terminal - this.vy ) * Math.min( 1, dt * 2 );

		}

		// What's left of the plane's speed over the car's own is shed fast, chute or not.
		if ( d.speed > top ) d.speed = Math.max( top, d.speed * Math.exp( - DROP.shed * dt ) );

		d.heading += steerInput * DROP.steer * dt;
		d.course = d.heading;
		d.steer = steerInput;
		// (Where it was before this frame's fall: the ground is looked for from over that, below.)
		const before = d.y;
		this.move( dt );
		d.y += this.vy * dt;
		d.vy = this.vy;
		d.pitch += ( 0 - d.pitch ) * Math.min( 1, dt * PARACHUTE.right );
		d.roll += ( 0 - d.roll ) * Math.min( 1, dt * PARACHUTE.right );
		this.kit?.update( dt, this.deploy, 0 );
		// Looked for from over where it was before this frame's fall, not from where it is now: a free
		// fall goes metres a frame (160 m/s, 8 m a frame on a phone at 20 fps), and from under the
		// ground's surface the ray finds nothing (Google's map is a skin, seen only from above), so it
		// landed on the ground it had found before, under the road, and stood half in it.
		const below = this.groundUnder( d.east, d.north, Math.max( d.y, before ) );
		if ( below !== null ) this.ground = below;
		this.height = Math.max( 0, d.y - this.ground );
		if ( d.y > this.ground ) return;

		// Down: on its wheels, a car again, rolling on at no more than the booster would have it.
		d.y = this.ground;
		d.speed = Math.min( d.speed, top * 2 );
		d.hud.flash( 'Landed' );
		this.finish();

	}

	// How fast (m/s) it's coming at the ground: its fall, and the ground rising to meet it along the
	// way it's going, from the ground AHEAD s along it (a slope on Mars or Vesta, a hill). (Ground
	// ahead higher than it is isn't found, and counts as none: it would be a wall, which move()
	// stops it at.)
	closingSpeed() {

		const d = this.driver;
		const rad = d.heading * Math.PI / 180;
		const reach = Math.max( 0, d.speed ) * AHEAD;
		const ahead = this.groundUnder( d.east + Math.sin( rad ) * reach, d.north + Math.cos( rad ) * reach, d.y );
		const rise = ahead === null || this.ground === null ? 0 : ( ahead - this.ground ) / AHEAD;
		return Math.max( 0, - this.vy ) + Math.max( 0, rise );

	}

	// Along the way it points, stopped short of a wall (a building's side, a cliff): a slope is
	// flown up instead, by keeping over the ground.
	move( dt ) {

		const d = this.driver;
		const distance = d.speed * dt;
		if ( distance < 1e-6 ) return;
		const rad = d.heading * Math.PI / 180;
		const de = Math.sin( rad ), dn = Math.cos( rad );
		_b.set( - de, 0, dn );
		let travel = distance;
		for ( const share of [ 0.3, 0.7 ] ) {

			enuToLocal( d.east, d.north, d.y + d.height * share, _a );
			const hit = d.cast( _a, _b, distance + d.front );
			if ( ! hit?.face ) continue;
			const normal = _a.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld );
			if ( Math.abs( normal.y ) >= 0.5 ) continue;
			travel = Math.min( travel, Math.max( 0, hit.distance - d.front ) );

		}

		if ( travel < distance ) {

			if ( d.speed > 8 ) d.hud.flash( 'Bonk!' );
			d.speed = 0;

		}

		d.east += de * travel;
		d.north += dn * travel;

	}

	// The ground's height under ( east, north ), looked for from just over y as far down as it
	// could be: null if none is found.
	groundUnder( east, north, y ) {

		const d = this.driver;
		enuToLocal( east, north, y + 2, _a );
		const hit = d.cast( _a, DOWN, Math.max( 400, this.height + 3000 ) );
		return hit ? hit.point.y : null;

	}

}

// DOWN held (Shift, or B: the DOWN button on a touch screen).
function downHeld( keys ) {

	return keys.has( 'ShiftLeft' ) || keys.has( 'ShiftRight' ) || keys.has( 'KeyB' );

}

// The kit that makes a ride a plane, sized to it: wings that swing down from its sides with a jet
// under each, and a fin that rises at the back. On `pivot`, the ride's (facing -Z), sized to `box`,
// the ride's box in the pivot's own frame. update( dt, deploy, thrust ): deploy from 0 (folded away,
// hidden) to 1 (out), the jets' glow by the thrust. The ride's own parts that can join in (its
// wheels, folding flat as fans: cars.js, kart.js) do so through onDrive's `plane`. For a car seen
// driving with you (ghosts.js) too: `noRay` keeps rays off it there.
export function createPlaneKit( { pivot, box, noRay = null } ) {

	const width = box.max.x - box.min.x;
	const length = box.max.z - box.min.z;
	const height = box.max.y - box.min.y;
	const midX = ( box.min.x + box.max.x ) / 2;
	const midZ = ( box.min.z + box.max.z ) / 2;
	const kit = new Group();
	kit.name = 'plane kit';
	pivot.add( kit );

	const skin = new MeshStandardMaterial( { color: 0xdde3ea, metalness: 0.55, roughness: 0.35 } );
	const trim = new MeshStandardMaterial( { color: 0x3de0ff, emissive: 0x3de0ff, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.4 } );
	const glow = new MeshBasicMaterial( { color: 0x8ff0ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false } );
	const materials = [ skin, trim, glow ];
	const geometries = [];
	const keep = geometry => ( geometries.push( geometry ), geometry );

	// A wing: tapered and swept back, from its root at the body's side out along +X, lying flat.
	const span = Math.max( 0.9, width * 0.95 );
	const root = length * 0.34;
	const tip = length * 0.14;
	const sweep = length * 0.16;
	const thick = Math.max( 0.04, height * 0.04 );
	const shape = new Shape();
	shape.moveTo( 0, 0 );
	shape.lineTo( span, sweep );
	shape.lineTo( span, sweep + tip );
	shape.lineTo( 0, root );
	shape.closePath();
	// (Extruded along +Z and laid flat: the shape's y goes back along +Z, its depth down.)
	const wingGeometry = keep( new ExtrudeGeometry( shape, { depth: thick, bevelEnabled: false } ).rotateX( Math.PI / 2 ).translate( 0, thick, - root * 0.45 ) );
	const tipGeometry = keep( new CylinderGeometry( thick * 0.9, thick * 0.9, tip, 8 ).rotateX( Math.PI / 2 ) );
	const podRadius = Math.max( 0.08, Math.min( width, height ) * 0.09 );
	const podLength = root * 0.9;
	const podGeometry = keep( new CylinderGeometry( podRadius * 0.8, podRadius, podLength, 14 ).rotateX( Math.PI / 2 ) );
	const flameGeometry = keep( new CylinderGeometry( podRadius * 0.75, podRadius * 0.15, podLength * 0.9, 12, 1, true ).rotateX( - Math.PI / 2 ) );
	const wingY = box.min.y + height * 0.42;
	const wings = [ - 1, 1 ].map( side => {

		const hinge = new Group();
		hinge.position.set( midX + side * width * 0.45, wingY, midZ - length * 0.02 );
		const wing = new Group();
		wing.scale.x = side;
		hinge.add( wing );
		wing.add( new Mesh( wingGeometry, skin ) );
		const light = new Mesh( tipGeometry, trim );
		light.position.set( span, thick / 2, - root * 0.45 + sweep + tip / 2 );
		wing.add( light );
		const pod = new Mesh( podGeometry, skin );
		pod.position.set( span * 0.45, - podRadius * 0.6, - root * 0.45 + sweep * 0.45 + podLength * 0.45 );
		wing.add( pod );
		const flame = new Mesh( flameGeometry, glow );
		flame.position.set( 0, 0, podLength * 0.5 + podLength * 0.45 );
		pod.add( flame );
		kit.add( hinge );
		return { hinge, wing, side, flame };

	} );

	// The fin: a swept blade on the roof at the back.
	const finShape = new Shape();
	const finHeight = Math.max( 0.5, height * 0.55 );
	const finRoot = length * 0.26;
	finShape.moveTo( 0, 0 );
	finShape.lineTo( finRoot, 0 );
	finShape.lineTo( finRoot, finHeight );
	finShape.lineTo( finRoot * 0.55, finHeight );
	finShape.closePath();
	const finGeometry = keep( new ExtrudeGeometry( finShape, { depth: thick, bevelEnabled: false } ).rotateY( - Math.PI / 2 ).translate( thick / 2, 0, 0 ) );
	const fin = new Group();
	fin.position.set( midX, box.max.y - height * 0.08, box.max.z - finRoot * 1.05 );
	const blade = new Mesh( finGeometry, skin );
	fin.add( blade );
	const stripe = new Mesh( keep( new CylinderGeometry( thick * 0.8, thick * 0.8, finRoot * 0.45, 6 ).rotateX( Math.PI / 2 ) ), trim );
	stripe.position.set( 0, finHeight * 0.98, finRoot * 0.78 );
	fin.add( stripe );
	kit.add( fin );

	kit.traverse( object => {

		if ( ! object.isMesh ) return;
		object.castShadow = object.material !== glow;
		// Not something to stand on or bump into (see blocks in walk.js): it's part of the vehicle.
		object.userData.noCollide = true;
		if ( noRay ) object.raycast = noRay;

	} );

	let flicker = 0;
	const update = ( dt, deploy, thrust ) => {

		kit.visible = deploy > 0.01;
		// Out of the body's sides, folded up against them, then swung down flat.
		const out = MathUtils.smoothstep( deploy, 0, 0.55 );
		const down = MathUtils.smoothstep( deploy, 0.3, 1 );
		for ( const { hinge, side } of wings ) {

			hinge.scale.setScalar( Math.max( 0.001, 0.25 + 0.75 * out ) );
			hinge.rotation.z = side * ( 1 - down ) * 1.45;

		}

		fin.scale.set( 1, Math.max( 0.001, MathUtils.smoothstep( deploy, 0.45, 1 ) ), 1 );
		flicker += dt * 30;
		const burn = deploy * ( 0.35 + 0.65 * thrust ) * ( 0.9 + 0.1 * Math.sin( flicker ) );
		glow.opacity = burn;
		for ( const { flame } of wings ) flame.scale.set( 1, 1, 0.4 + burn );

	};

	update( 0, 0, 0 );
	return {
		group: kit,
		update,
		dispose() {

			kit.removeFromParent();
			for ( const geometry of geometries ) geometry.dispose();
			for ( const material of materials ) material.dispose();

		},
	};

}
