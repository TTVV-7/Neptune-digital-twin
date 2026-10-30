import './excavator.css';
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DoubleSide,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	Raycaster,
	Vector3,
} from 'three';
import { enuToLocal, headingToYaw, localToEnu } from './geo.js';
import { SWELL, findMaterial } from './terrain.js';
import { createPourStream } from './pour.js';

// Drive an excavator (V) and dig with it: hold Space or the left mouse button and it digs a
// bucketful out of the ground in front, swings round and dumps it on a spoil pile beside the hole,
// or into a dump truck or haul truck parked within reach. The ground is the earthworks terrain
// (terrain.js), so holes and piles are saved with the layout like any other earthworks.
//
// The machine is a built-in library item (excavator-model.js) whose drive spec has type
// 'excavator'; race mode (drive.js) hands it to the controller here instead of driving it like a car.

const DEG = MathUtils.DEG2RAD;
const KMH = 3.6;
// The dig cycle: phases the bucket moves through and how long each takes (seconds, 20 t).
const PHASES = { reach: 0.7, bite: 0.4, drag: 0.9, curl: 0.45, lift: 0.55, swing: 0.9, dump: 0.6, return: 0.8 };
// Which way the teeth point through the cycle (see rig.solve in excavator-model.js).
const OPEN = - 55 * DEG;
const BITE = - 95 * DEG;
const DRAG = - 150 * DEG;
const CURLED = - 200 * DEG;
const CARRY = - 190 * DEG;
// The bucket fills over this many bites while it drags.
const BITES = 3;
// A loaded bucket's underside clears the ground, the pile or the truck by this much (20 t; scaled).
const CLEARANCE = 0.4;
// Dumping into a truck: its bed must be this close to the dump direction.
const TRUCK_ANGLE = 50;
// Rates the arm follows the controls at while not digging.
const RATES = { swing: 70 * DEG, u: 3, v: 3, phi: 150 * DEG };
const SOIL = findMaterial( 'soil' );

const _p = new Vector3();
const _q = new Vector3();
const _offset = new Vector3();
const _dir = new Vector3();

export function setUpExcavator( { scene, canvas, models, layout, driver, onUpdate } ) {

	// The earthworks feature sets up the terrain (and puts it on window.twin) before this runs.
	const getTerrain = () => window.twin?.terrain ?? null;
	const markers = createMarkers( scene );
	const panel = createPanel();
	const trucks = createTruckLoads( { models, layout } );
	const stats = new Map(); // entry -> { cycles, dug, spoil, loaded } while the page is open
	const parking = new Map(); // rig -> { from, t }: arms settling back to rest after getting out
	let active = null;
	models.addEventListener( 'remove', ( { entry } ) => stats.delete( entry ) );

	// Falling soil while the bucket dumps. It lands on the earthworks, the truck's heap or the
	// ground the machine stands on.
	const stream = createPourStream( {
		scene,
		surfaceAt: ( x, z ) => active?.dropLevel ?? getTerrain()?.surfaceAt( x, z ) ?? active?.ground ?? null,
	} );

	driver.addMachine( 'excavator', ( { entry } ) => {

		const content = entry.pivot.children[ 0 ];
		const rig = content?.userData.rig;
		if ( ! rig ) return null;
		parking.delete( rig );
		if ( ! stats.has( entry ) ) stats.set( entry, { cycles: 0, dug: 0, spoil: 0, loaded: 0 } );
		active = new Excavator( {
			driver, entry, content, rig, getTerrain, markers, panel, stream, trucks,
			stats: stats.get( entry ),
			onStop: () => {

				active = null;
				parking.set( rig, { from: { ...rig.pose }, t: 0 } );

			},
		} );
		return active;

	} );

	// Hold the left mouse button to dig, the wheel sets the reach.
	canvas.addEventListener( 'pointerdown', e => {

		if ( active && e.button === 0 ) active.mouse = true;

	} );
	window.addEventListener( 'pointerup', e => {

		if ( active && e.button === 0 ) active.mouse = false;

	} );
	window.addEventListener( 'blur', () => {

		if ( active ) active.mouse = false;

	} );
	canvas.addEventListener( 'wheel', e => {

		if ( ! active ) return;
		e.preventDefault();
		active.setReach( active.reach - Math.sign( e.deltaY ) * 0.5 * active.size );

	}, { passive: false } );

	onUpdate( dt => {

		// Parked: the arm folds back to rest.
		for ( const [ rig, park ] of parking ) {

			park.t = Math.min( 1, park.t + dt / 1.5 );
			const e = MathUtils.smootherstep( park.t, 0, 1 );
			const pose = {};
			for ( const joint of [ 'boom', 'stick', 'bucket' ] ) pose[ joint ] = MathUtils.lerp( park.from[ joint ], rig.rest[ joint ], e );
			pose.swing = park.from.swing + angleTo( park.from.swing, rig.rest.swing ) * e;
			rig.setPose( pose );
			if ( park.t >= 1 ) parking.delete( rig );

		}

		stream.update( dt );

	} );

	// For tests and the browser console.
	if ( window.twin ) window.twin.excavator = { get active() {

		return active;

	}, trucks, stats, markers };
	return { trucks };

}

// --- the controller ------------------------------------------------------------------------

class Excavator {

	constructor( { driver, entry, content, rig, getTerrain, markers, panel, stream, trucks, stats, onStop } ) {

		Object.assign( this, { driver, entry, content, rig, getTerrain, markers, readouts: panel, stream, trucks, stats, onStop } );
		// Shown by the race-mode HUD instead of the speedometer.
		this.panel = panel.element;
		const { spec } = rig;
		this.tuning = spec.work;
		this.size = spec.boom / 5.7;
		this.track = spec.track;
		this.bucket = spec.bucket;
		this.drive = driver.spec;
		this.keys = [ 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyX' ];

		// Where the swing axis (the model's own origin) stands.
		entry.pivot.updateMatrixWorld( true );
		const axis = content.localToWorld( new Vector3() );
		const { east, north } = localToEnu( axis );
		this.east = east;
		this.north = north;
		this.ground = axis.y;
		this.heading = entry.state.heading;
		this.speed = 0;
		this.pitch = 0;
		this.roll = 0;
		this.first = true;

		// Where to dig: aim (degrees right of straight ahead over the tracks) and reach (metres from
		// the swing axis); which side the spoil goes.
		this.aim = 0;
		this.reach = ( this.tuning.reach[ 0 ] + this.tuning.reach[ 1 ] ) / 2;
		this.side = - 1;
		this.mouse = false;
		this.cycle = null;
		this.dropLevel = null;

		// The arm in its own terms: swing, where the tooth tips are (u ahead, v up) and their angle.
		const { pose } = rig;
		const [ u, v ] = rig.reach( pose );
		this.arm = { swing: pose.swing, u, v, phi: pose.boom + pose.stick + pose.bucket + rig.kin.delta };
		this.pose = { ...pose };
		this.look = new Vector3();
		this.hudText = '';
		this.markerTimer = 0;
		this.flashTimer = 0;

	}

	press( code ) {

		if ( code === 'KeyX' ) this.side = - this.side;

	}

	setReach( reach ) {

		this.reach = MathUtils.clamp( reach, ...this.tuning.reach );

	}

	update( dt ) {

		const { keys } = this.driver;
		const held = ( ...codes ) => codes.some( code => keys.has( code ) );
		this.aim = wrapDegrees( this.aim + ( held( 'KeyE' ) - held( 'KeyQ' ) ) * 60 * dt );
		this.setReach( this.reach + ( held( 'KeyR' ) - held( 'KeyF' ) ) * 2.5 * this.size * dt );
		this.flashTimer -= dt;

		this.move( dt, held( 'KeyW', 'ArrowUp' ) - held( 'KeyS', 'ArrowDown' ), held( 'KeyD', 'ArrowRight' ) - held( 'KeyA', 'ArrowLeft' ) );
		this.settle( dt );
		this.place();

		const digging = held( 'Space' ) || this.mouse;
		if ( ! this.cycle && digging ) this.startCycle();
		if ( this.cycle ) this.advance( dt, digging );
		else this.idle( dt );

		this.markerTimer -= dt;
		if ( this.markerTimer <= 0 || this.first ) {

			this.markerTimer = 0.2;
			this.showMarkers();

		}

		this.showReadouts();
		this.placeCamera( dt );
		this.first = false;

	}

	stop() {

		// Anything still in the bucket goes on the ground under it.
		if ( this.cycle?.load > 0 ) {

			const mouth = this.rig.mouth.getWorldPosition( _p );
			this.getTerrain()?.deposit( { x: mouth.x, z: mouth.z, volume: this.cycle.load * SWELL, material: SOIL.id, radius: 0.4 * this.size } );
			this.stats.spoil += this.cycle.load * SWELL;

		}

		this.cycle = null;
		this.rig.setLoad( false );
		this.stream.stop( this );
		this.markers.hide();
		this.onStop();

	}

	// --- tracks ------------------------------------------------------------------------------

	// Tracked: W/S forward and back, A/D turn on the spot (or steer while moving), the same way
	// round whichever way it's going.
	move( dt, throttle, turn ) {

		const top = this.drive.topSpeed / KMH;
		const target = throttle > 0 ? top : throttle < 0 ? - this.drive.reverse / KMH : 0;
		const rate = target === 0 || Math.sign( target ) !== Math.sign( this.speed ) ? this.drive.brake : this.drive.accel;
		this.speed += MathUtils.clamp( target - this.speed, - rate * dt, rate * dt );
		this.heading = wrapDegrees( this.heading + turn * this.tuning.turn * dt );

		const step = this.speed * dt;
		if ( step === 0 ) return;
		const rad = this.heading * DEG;
		const sign = Math.sign( step );
		_dir.set( - Math.sin( rad ) * sign, 0, Math.cos( rad ) * sign );
		enuToLocal( this.east, this.north, this.ground + this.track.height * 0.9, _p );
		const hit = this.driver.cast( _p, _dir, Math.abs( step ) + this.track.length / 2 + 0.1 );
		const wall = hit?.face && Math.abs( hit.face.normal.clone().transformDirection( hit.object.matrixWorld ).y ) < 0.5;
		if ( wall ) {

			this.speed = 0;
			this.flash( 'Blocked' );
			return;

		}

		this.east += Math.sin( rad ) * step;
		this.north += Math.cos( rad ) * step;

	}

	// Rest on the ground under the four ends of the tracks, tilted to fit, resting on the higher
	// corners where the ground isn't flat.
	settle( dt ) {

		const rad = this.heading * DEG;
		const fx = Math.sin( rad );
		const fz = Math.cos( rad );
		const along = this.track.length / 2 - this.track.height * 0.35;
		const across = ( this.track.width - this.track.shoe ) / 2;
		this.driver.y = this.ground;
		const corners = [ [ 1, - 1 ], [ 1, 1 ], [ - 1, - 1 ], [ - 1, 1 ] ].map( ( [ a, s ] ) =>
			this.driver.groundAt( this.east + fx * along * a + fz * across * s, this.north + fz * along * a - fx * across * s ) );
		const known = corners.filter( h => h !== null );
		if ( known.length === 0 ) return;
		const fill = known.reduce( ( a, b ) => a + b, 0 ) / known.length;
		const heights = corners.map( h => h ?? fill );
		const [ fl, fr, rl, rr ] = heights;
		const mean = ( fl + fr + rl + rr ) / 4;
		const pitch = ( fl + fr - rl - rr ) / 2;
		const roll = ( fr + rr - fl - rl ) / 2;
		// The plane through the averages leaves two corners in the air and two in the ground when the
		// ground is twisted: lift it onto the higher ones.
		const plane = [ mean + pitch / 2 - roll / 2, mean + pitch / 2 + roll / 2, mean - pitch / 2 - roll / 2, mean - pitch / 2 + roll / 2 ];
		const ground = mean + Math.max( 0, ...heights.map( ( h, i ) => h - plane[ i ] ) );
		const ease = this.first ? 1 : 1 - Math.exp( - dt * 8 );
		this.ground += ( ground - this.ground ) * ease;
		this.pitch += ( Math.atan( pitch / ( along * 2 ) ) - this.pitch ) * ease;
		this.roll += ( Math.atan( roll / ( across * 2 ) ) - this.roll ) * ease;

	}

	// Pose the model so its swing axis stands at east/north on the ground.
	place() {

		const { pivot, state } = this.entry;
		pivot.rotation.set( this.pitch, headingToYaw( this.heading ), this.roll, 'YXZ' );
		_offset.copy( this.content.position ).multiplyScalar( state.scale ).applyEuler( pivot.rotation );
		enuToLocal( this.east, this.north, this.ground, pivot.position ).sub( _offset );
		pivot.updateMatrixWorld( true );

		// Parks here (see Driver.stop).
		const { east, north } = localToEnu( pivot.position );
		Object.assign( this.driver, { east, north, y: pivot.position.y, heading: this.heading } );

	}

	// --- the arm -----------------------------------------------------------------------------

	// A world point in the arm's terms: the swing that brings it into the arm's plane (which is
	// beside the swing axis by the boom's offset), how far ahead and how high above the tracks.
	toArm( point ) {

		const p = this.content.worldToLocal( _q.copy( point ) );
		const x = this.rig.kin.x;
		const u = Math.sqrt( Math.max( p.x * p.x + p.z * p.z - x * x, 0 ) );
		return { swing: Math.atan2( - p.x, - p.z ) + Math.atan2( x, u ), u, v: p.y };

	}

	// The world point `distance` from the swing axis, `aim` degrees right of straight ahead.
	ahead( aim, distance, target = new Vector3() ) {

		return this.content.localToWorld( target.set( Math.sin( aim * DEG ) * distance, 0, - Math.cos( aim * DEG ) * distance ) );

	}

	surface( point ) {

		return this.getTerrain()?.heightAt( point.x, point.z ) ?? this.ground;

	}

	applyArm() {

		const { swing, u, v, phi } = this.arm;
		this.rig.solve( { u, v, phi }, this.pose );
		this.pose.swing = swing;
		this.rig.setPose( this.pose );

	}

	reachable( u, v, phi ) {

		const [ ru, rv ] = this.rig.reach( this.rig.solve( { u, v, phi }, {} ) );
		return Math.hypot( ru - u, rv - v ) < 0.08 * this.size;

	}

	// The lowest the tooth tips can go at `u` with the teeth at phi.
	lowest( u, phi ) {

		let ok = this.reachable( u, 0, phi ) ? 0 : 3 * this.size;
		if ( ! this.reachable( u, ok, phi ) ) return ok;
		let out = - 12 * this.size;
		for ( let i = 0; i < 18; i ++ ) {

			const mid = ( ok + out ) / 2;
			if ( this.reachable( u, mid, phi ) ) ok = mid;
			else out = mid;

		}

		return ok;

	}

	// How high the tooth tips must be at `u` for the bucket's underside to clear `top`, with the
	// teeth at phi or as near as the bucket's joint allows (curled right in, they point lower
	// when the stick is reaching out). ok is false if the arm can't lift it that high.
	lift( u, top, phi ) {

		let v = top;
		let pose = null;
		for ( let i = 0; i < 5; i ++ ) {

			pose = this.rig.solve( { u, v, phi }, {} );
			v += top - this.rig.bucketBottom( pose );

		}

		return { v, ok: this.rig.bucketBottom( pose ) > top - 0.05 * this.size };

	}

	// Not digging: hold the bucket curled, low in front, turned towards where it will dig.
	idle( dt ) {

		const u = Math.max( this.tuning.reach[ 0 ], this.reach * 0.7 );
		const target = { swing: this.swingFor( this.aim, u ), u, v: this.lift( u, 0.3 * this.size, CARRY ).v, phi: CARRY };
		const ease = this.first ? 1 : 1 - Math.exp( - dt * 5 );
		for ( const key of [ 'swing', 'u', 'v', 'phi' ] ) {

			const diff = key === 'swing' ? angleTo( this.arm[ key ], target[ key ] ) : target[ key ] - this.arm[ key ];
			const rate = RATES[ key ] * ( key === 'u' || key === 'v' ? this.size : 1 );
			this.arm[ key ] += MathUtils.clamp( diff * ease, - rate * dt, rate * dt );

		}

		this.applyArm();

	}

	swingFor( aim, u ) {

		return - aim * DEG + Math.atan2( this.rig.kin.x, u );

	}

	// Plan one dig cycle from where the controls point now.
	startCycle() {

		const s = this.size;
		const { drag, reach } = this.tuning;
		const r = MathUtils.clamp( this.reach, reach[ 0 ] + drag / 2, reach[ 1 ] - drag / 2 );
		const far = this.ahead( this.aim, r + drag / 2 );
		const near = this.ahead( this.aim, r - drag / 2 );
		far.y = this.surface( far );
		near.y = this.surface( near );
		const a = this.toArm( far );
		const b = this.toArm( near );

		// The bucket skims a bucketful off the drag: this deep if the ground were flat, and no deeper
		// than the arm reaches.
		let volume = this.bucket.volume;
		const depth = volume / ( this.bucket.width * drag );
		const surface = Math.min( a.v, b.v );
		const floor = Math.max( this.lowest( a.u, BITE ), this.lowest( b.u, DRAG ) );
		if ( surface - depth < floor ) volume *= MathUtils.clamp( ( surface - floor ) / depth, 0, 1 );
		const bottom = Math.max( surface - depth, floor );

		const dump = this.dumpTarget();
		const d = this.toArm( dump.point );
		// Carried high enough to clear the dig and what's at the dump, and raised a little as it opens.
		const top = Math.max( a.v, b.v, d.v ) + CLEARANCE * s;
		const carry = Math.max( this.lift( b.u + 0.3 * s, top, CURLED ).v, this.lift( d.u, top, CURLED ).v );
		const open = Math.max( carry + 0.2 * s, this.lift( d.u + 0.3 * s, d.v + CLEARANCE * s, OPEN ).v );
		const swing = a.swing;
		const at = ( u, v, phi, dumpSwing = false ) => ( { swing: dumpSwing ? d.swing : swing, u, v, phi } );
		const phases = [
			[ 'reach', at( a.u + 0.25 * s, a.v + 0.6 * s, OPEN ) ],
			[ 'bite', at( a.u, bottom + a.v - surface, BITE ) ],
			[ 'drag', at( b.u, bottom + b.v - surface, DRAG ) ],
			[ 'curl', at( b.u - 0.15 * s, b.v + 0.3 * s, CURLED ) ],
			[ 'lift', at( b.u + 0.3 * s, carry, CURLED ) ],
			[ 'swing', at( d.u, carry, CURLED, true ) ],
			[ 'dump', at( d.u + 0.3 * s, open, OPEN, true ) ],
			[ 'return', at( Math.max( reach[ 0 ], this.reach * 0.7 ), carry, DRAG ) ],
		].map( ( [ name, to ] ) => ( { name, to, time: PHASES[ name ] * this.tuning.time } ) );

		this.cycle = { phases, index: 0, t: 0, from: { ...this.arm }, volume, load: 0, bites: 0, dumped: false, truck: dump.truck, start: new Vector3() };
		if ( volume <= 0 ) this.flash( 'Too deep to reach: move closer or dig further out' );

	}

	advance( dt, digging ) {

		const cycle = this.cycle;
		const phase = cycle.phases[ cycle.index ];
		if ( cycle.t === 0 && phase.name === 'drag' ) this.rig.toothTip.getWorldPosition( cycle.start );
		cycle.t = Math.min( 1, cycle.t + dt / phase.time );
		const e = MathUtils.smoothstep( cycle.t, 0, 1 );
		const { from } = cycle;
		const { to } = phase;
		this.arm.swing = from.swing + angleTo( from.swing, to.swing ) * e;
		for ( const key of [ 'u', 'v', 'phi' ] ) this.arm[ key ] = MathUtils.lerp( from[ key ], to[ key ], e );
		this.applyArm();

		// The ground changes at the right moments: bites while the bucket drags, the dump halfway
		// through opening it.
		if ( phase.name === 'drag' ) while ( cycle.bites < BITES && cycle.t >= ( cycle.bites + 1 ) / BITES ) this.bite();
		if ( phase.name === 'dump' ) {

			if ( cycle.t >= 0.3 && cycle.t < 0.85 && ! cycle.pouring && cycle.load > 0 ) this.pour( true );
			if ( cycle.t >= 0.5 && ! cycle.dumped ) this.dump();
			if ( cycle.t >= 0.85 && cycle.pouring ) this.pour( false );

		}

		if ( cycle.t < 1 ) return;
		cycle.from = { ...this.arm };
		cycle.index ++;
		cycle.t = 0;
		if ( cycle.index < cycle.phases.length ) return;
		this.stats.cycles ++;
		this.cycle = null;
		if ( digging ) this.startCycle();

	}

	// Take a third of a bucketful from where the bucket has dragged so far.
	bite() {

		const cycle = this.cycle;
		cycle.bites ++;
		const terrain = this.getTerrain();
		if ( ! terrain || cycle.volume <= 0 ) return;
		const tip = this.rig.toothTip.getWorldPosition( _p );
		const start = cycle.start;
		const dx = start.x - tip.x;
		const dz = start.z - tip.z;
		const length = Math.hypot( dx, dz ) + 0.4 * this.size;
		const removed = terrain.dig( {
			x: ( start.x + tip.x ) / 2,
			z: ( start.z + tip.z ) / 2,
			// Compass heading of the drag, away from the machine (local x is west).
			heading: Math.atan2( - dx, dz ) / DEG,
			width: this.bucket.width,
			length,
			volume: cycle.volume / BITES,
			maxDepth: this.tuning.maxDepth,
		} );
		cycle.load += removed;
		this.stats.dug += removed;
		if ( removed > 0 ) this.rig.setLoad( true );
		if ( cycle.bites === BITES && cycle.load <= 0 && cycle.volume > 0 ) this.flash( 'Nothing to dig here' );

	}

	dump() {

		const cycle = this.cycle;
		cycle.dumped = true;
		this.rig.setLoad( false );
		const loose = cycle.load * SWELL;
		cycle.load = 0;
		if ( loose <= 0 ) return;
		if ( cycle.truck ) {

			this.trucks.add( cycle.truck, loose );
			this.stats.loaded += loose;
			if ( this.trucks.isFull( cycle.truck ) ) this.flash( 'Truck full' );
			return;

		}

		const mouth = this.rig.mouth.getWorldPosition( _p );
		this.getTerrain()?.deposit( { x: mouth.x, z: mouth.z, volume: loose, material: SOIL.id, radius: 0.4 * this.size } );
		this.stats.spoil += loose;

	}

	pour( on ) {

		const cycle = this.cycle;
		cycle.pouring = on;
		if ( ! on ) {

			this.stream.stop( this );
			this.dropLevel = null;
			return;

		}

		this.dropLevel = cycle.truck ? this.trucks.surface( cycle.truck ) : null;
		const mouth = new Vector3();
		this.stream.start( this, {
			colour: new Color( SOIL.colour ),
			rate: 120 * this.size,
			emitter: () => this.rig.mouth.getWorldPosition( mouth ),
		} );

	}

	// Where the spoil goes: into a truck whose bed is within reach on the dump side, or else onto a
	// pile on the ground. Returns { point (world, at the top of what's there), truck }.
	dumpTarget() {

		const { reach, dump } = this.tuning;
		const aim = this.aim + this.side * 90;
		let best = null;
		for ( const truck of this.trucks.list() ) {

			if ( this.trucks.isFull( truck ) ) continue;
			const centre = this.trucks.bedCentre( truck );
			const arm = this.toArm( centre );
			const off = Math.abs( angleTo( this.swingFor( aim, arm.u ), arm.swing ) ) / DEG;
			if ( off > TRUCK_ANGLE || arm.u < reach[ 0 ] * 0.8 || arm.u > reach[ 1 ] ) continue;
			// A small machine can't lift its bucket over a big truck's side.
			if ( ! this.lift( arm.u, arm.v + CLEARANCE * this.size, CURLED ).ok ) continue;
			if ( ! best || off < best.off ) best = { truck, off, centre };

		}

		if ( best ) {

			const centre = best.centre.clone();
			centre.y = this.trucks.surface( best.truck );
			return { point: centre, truck: best.truck };

		}

		const point = this.ahead( aim, dump );
		point.y = this.surface( point );
		return { point, truck: null };

	}

	// --- what you see ------------------------------------------------------------------------

	showMarkers() {

		const { drag, reach, dump } = this.tuning;
		const r = MathUtils.clamp( this.reach, reach[ 0 ] + drag / 2, reach[ 1 ] - drag / 2 );
		const centre = this.ahead( this.aim, r );
		const height = ( x, z ) => this.getTerrain()?.heightAt( x, z ) ?? this.ground;
		this.markers.dig( centre, ( this.heading + this.aim ) * DEG, this.bucket.width, drag, height, this.size );
		const target = this.dumpTarget();
		this.target = target;
		if ( target.truck ) this.markers.truck( this.trucks.bedOutline( target.truck ), this.size );
		else this.markers.pile( this.ahead( this.aim + this.side * 90, dump ), 1.2 * this.size, height, this.size );

	}

	showReadouts() {

		const { stats } = this;
		const target = this.target;
		const truck = target?.truck;
		const swing = Math.round( this.aim );
		const lines = [
			[ 'reach', `${ this.reach.toFixed( 1 ) } m` ],
			[ 'swing', swing === 0 ? 'ahead' : `${ Math.abs( swing ) }° ${ swing > 0 ? 'right' : 'left' }` ],
			[ 'dump', `${ this.side > 0 ? 'right' : 'left' } · ${ truck ? truck.state.name : 'spoil pile' }` ],
			[ 'cycles', `${ stats.cycles }` ],
			[ 'dug', `${ stats.dug.toFixed( 1 ) } m³ bank` ],
			[ 'spoil', `${ stats.spoil.toFixed( 1 ) } m³ loose` ],
		];
		if ( truck ) {

			const load = this.trucks.load( truck );
			lines.push( [ 'truck', `${ load.toFixed( 1 ) } / ${ Math.round( this.trucks.capacity( truck ) ) } m³ · ${ Math.round( load * SOIL.density ) } t` ] );

		} else if ( stats.loaded > 0 ) {

			lines.push( [ 'loaded', `${ stats.loaded.toFixed( 1 ) } m³ into trucks` ] );

		}

		const text = JSON.stringify( lines );
		if ( text === this.hudText ) return;
		this.hudText = text;
		this.readouts.show( lines );

	}

	flash( message ) {

		if ( this.flashTimer > 0 ) return;
		this.flashTimer = 2;
		this.driver.hud.flash( message );

	}

	// Chase: high up behind the machine on the dump side, where neither the cab nor the boom is in
	// the way, looking at the dig with the spoil pile in view. C switches to the operator's seat.
	placeCamera( dt ) {

		const { camera, controls } = this.driver;
		const ease = this.first ? 1 : 1 - Math.exp( - dt * 4 );
		// Not too close to a small machine.
		const s = Math.max( this.size, 0.65 );
		let view;
		if ( this.driver.cameraMode === 'hood' ) {

			const { cab, house } = this.rig.spec;
			this.rig.house.localToWorld( camera.position.set( - house.width / 2 + cab.width / 2, house.deck + 1.25, cab.front + cab.length * 0.45 ) );
			this.rig.toothTip.getWorldPosition( _p );
			// Look over the bucket rather than at it, so the view doesn't swing with every bite.
			this.look.lerp( _p.setY( Math.max( _p.y, this.ground ) ), ease );
			view = this.heading - this.arm.swing / DEG;

		} else {

			const rad = ( this.heading + this.aim ) * DEG;
			const fe = Math.sin( rad );
			const fn = Math.cos( rad );
			// Forward is ( fe, fn ) east and north, right is ( fn, - fe ).
			const at = ( ahead, right, up ) => enuToLocal( this.east + fe * ahead + fn * right, this.north + fn * ahead - fe * right, this.ground + up, _q );
			// A truck on the dump side would be in the way: look from the other side then.
			const side = this.target?.truck ? - this.side : this.side;
			camera.position.lerp( at( - 6 * s, side * 6.5 * s, 7 * s ), ease );
			this.look.lerp( at( this.reach * 0.7, this.side * this.tuning.dump * 0.3, 0.3 * s ), ease );
			view = Math.atan2( - ( this.look.x - camera.position.x ), this.look.z - camera.position.z ) / DEG;

		}

		camera.lookAt( this.look );
		// Keep the walk controller's view direction in step for when we get out.
		controls.yaw = headingToYaw( view );
		controls.pitch = 0;

	}

}

// --- HUD panel -------------------------------------------------------------------------------

function createPanel() {

	const element = document.createElement( 'div' );
	element.className = 'excavator-hud';
	const list = document.createElement( 'dl' );
	const keys = document.createElement( 'div' );
	keys.className = 'keys';
	keys.innerHTML = 'hold <b>Space</b> or the mouse: dig · <b>Q</b>/<b>E</b> swing · <b>R</b>/<b>F</b> or wheel: reach · <b>X</b> dump side · ' +
		'<b>W</b>/<b>S</b> <b>A</b>/<b>D</b> tracks · <b>C</b> camera · <b>V</b> get out';
	element.append( list, keys );
	return {
		element,
		show( lines ) {

			list.replaceChildren( ...lines.flatMap( ( [ label, value ] ) => [
				Object.assign( document.createElement( 'dt' ), { textContent: label } ),
				Object.assign( document.createElement( 'dd' ), { textContent: value } ),
			] ) );

		},
	};

}

// --- ground markers ----------------------------------------------------------------------------

// Outlines drawn on the ground: where the bucket will dig (orange) and where it will dump
// (yellow on the ground, green round a truck's bed).
function createMarkers( scene ) {

	const make = ( colour, points ) => {

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( ( points + 1 ) * 2 * 3 ), 3 ) );
		const index = [];
		for ( let i = 0; i < points; i ++ ) index.push( 2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2 );
		geometry.setIndex( index );
		const material = new MeshBasicMaterial( { color: colour, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: - 4 } );
		const mesh = new Mesh( geometry, material );
		mesh.name = 'excavator marker';
		mesh.frustumCulled = false;
		mesh.renderOrder = 5;
		mesh.visible = false;
		mesh.userData.noCollide = true;
		mesh.raycast = () => {};
		scene.add( mesh );
		return { mesh, points };

	};

	const dig = make( 0xff8a1a, 4 * 8 );
	const pile = make( 0xf2d21a, 40 );
	const bed = make( 0x4cd964, 4 * 8 );

	// A band `width` wide along a closed outline of [ x, z ] points at the given heights.
	const draw = ( marker, outline, heights, width ) => {

		const { mesh, points } = marker;
		const position = mesh.geometry.attributes.position;
		for ( let i = 0; i <= points; i ++ ) {

			const [ x, z ] = outline[ i % points ];
			const [ px, pz ] = outline[ ( i + points - 1 ) % points ];
			const [ nx, nz ] = outline[ ( i + 1 ) % points ];
			// Mitred corners: offset along the average of the two edges' normals.
			let ax = - ( z - pz ) - ( nz - z );
			let az = ( x - px ) + ( nx - x );
			const length = Math.hypot( ax, az ) || 1;
			ax /= length;
			az /= length;
			const y = heights[ i % points ] + 0.06;
			position.setXYZ( 2 * i, x + ax * width / 2, y, z + az * width / 2 );
			position.setXYZ( 2 * i + 1, x - ax * width / 2, y, z - az * width / 2 );

		}

		position.needsUpdate = true;
		mesh.visible = true;

	};

	const rectangle = ( centre, angle, width, length, count ) => {

		// angle: compass direction of `length` (radians); local x is west.
		const fx = - Math.sin( angle );
		const fz = Math.cos( angle );
		const corners = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ a, b ] ) => [
			centre.x + fx * length / 2 * b + fz * width / 2 * a,
			centre.z + fz * length / 2 * b - fx * width / 2 * a,
		] );
		const per = count / 4;
		const out = [];
		for ( let c = 0; c < 4; c ++ ) {

			const [ x0, z0 ] = corners[ c ];
			const [ x1, z1 ] = corners[ ( c + 1 ) % 4 ];
			for ( let i = 0; i < per; i ++ ) out.push( [ MathUtils.lerp( x0, x1, i / per ), MathUtils.lerp( z0, z1, i / per ) ] );

		}

		return out;

	};

	return {

		dig( centre, angle, width, length, height, size ) {

			const outline = rectangle( centre, angle, width, length, dig.points );
			draw( dig, outline, outline.map( ( [ x, z ] ) => height( x, z ) ), 0.14 * Math.max( size, 0.6 ) );

		},

		pile( centre, radius, height, size ) {

			const outline = [];
			for ( let i = 0; i < pile.points; i ++ ) {

				const a = i / pile.points * Math.PI * 2;
				outline.push( [ centre.x + Math.cos( a ) * radius, centre.z + Math.sin( a ) * radius ] );

			}

			draw( pile, outline, outline.map( ( [ x, z ] ) => height( x, z ) ), 0.14 * Math.max( size, 0.6 ) );
			bed.mesh.visible = false;

		},

		// A truck's bed: four corners [ x, y, z ] in the world.
		truck( corners, size ) {

			const per = bed.points / 4;
			const outline = [];
			const heights = [];
			for ( let c = 0; c < 4; c ++ ) {

				const a = corners[ c ];
				const b = corners[ ( c + 1 ) % 4 ];
				for ( let i = 0; i < per; i ++ ) {

					outline.push( [ MathUtils.lerp( a.x, b.x, i / per ), MathUtils.lerp( a.z, b.z, i / per ) ] );
					heights.push( MathUtils.lerp( a.y, b.y, i / per ) );

				}

			}

			draw( bed, outline, heights, 0.14 * Math.max( size, 0.6 ) );
			pile.mesh.visible = false;

		},

		hide() {

			for ( const { mesh } of [ dig, pile, bed ] ) mesh.visible = false;

		},

	};

}

// --- trucks you can load ---------------------------------------------------------------------

// Library vehicles with a bed to dump into, recognised by name: dump trucks, haul trucks, tippers
// and roll-off bins. The bed is roughly a share of the model's box (0 = front, 1 = back along its
// length; the rim as a share of its height), with a few known models measured; its floor is found
// by looking down into it. Capacity is heaped m³ loose; unknown trucks get what the bed holds.
const TRUCK_NAMES = /dump|haul|tipper|roll-?off/i;
const NOT_TRUCKS = /front-?load/i;
const BEDS = {
	'haul-truck-hd465': { from: 0.3, to: 0.97, width: 0.8, rim: 0.86, capacity: 34 },
	'rolloff-20': { from: 0.1, to: 0.99, width: 0.94, rim: 0.97, capacity: 15.3 },
	'rolloff-40': { from: 0.08, to: 0.99, width: 0.94, rim: 0.98, capacity: 30.6 },
};
const BED = { from: 0.38, to: 0.97, width: 0.88, rim: 0.85 };
// The bed's floor is sampled on this grid, which is also the heap's mesh.
const COLS = 9;
const ROWS = 13;
const DOWN = new Vector3( 0, - 1, 0 );

function createTruckLoads( { models, layout } ) {

	const loads = new Map(); // entry -> { loose, heap }
	const beds = new WeakMap(); // entry -> its measured bed
	const heapMaterial = new MeshStandardMaterial( { color: SOIL.colour, roughness: 1 } );
	heapMaterial.userData.shared = true;
	const raycaster = new Raycaster();

	const isTruck = entry => {

		const name = `${ entry.library ?? '' } ${ entry.state.name }`;
		return ! entry.kind && ! entry.placing && ! entry.driving && TRUCK_NAMES.test( name ) && ! NOT_TRUCKS.test( name );

	};

	// The bed in the truck's own frame (its pivot, front facing -Z), with the floor's height at each
	// point of a grid over it, found by looking down onto the model while it's parked upright.
	const bedOf = entry => {

		if ( beds.has( entry ) ) return beds.get( entry );
		const shares = BEDS[ entry.library ] ?? BED;
		const { min, max } = entry.footprint;
		const z0 = min.z + ( max.z - min.z ) * shares.from;
		const z1 = min.z + ( max.z - min.z ) * shares.to;
		const bed = {
			x: ( min.x + max.x ) / 2,
			z: ( z0 + z1 ) / 2,
			halfWidth: ( max.x - min.x ) * shares.width / 2,
			halfLength: ( z1 - z0 ) / 2,
			rim: min.y + ( max.y - min.y ) * shares.rim,
			floor: new Float32Array( COLS * ROWS ),
		};
		bed.cell = ( 2 * bed.halfWidth / ( COLS - 1 ) ) * ( 2 * bed.halfLength / ( ROWS - 1 ) );
		entry.pivot.updateMatrixWorld( true );
		raycaster.far = ( max.y - min.y + 2 ) * entry.state.scale;
		const origin = new Vector3();
		for ( let n = 0; n < COLS * ROWS; n ++ ) {

			const [ x, z ] = gridPoint( bed, n );
			raycaster.set( entry.pivot.localToWorld( origin.set( x, max.y + 1, z ) ), DOWN );
			const hit = raycaster.intersectObject( entry.pivot, true ).find( h => h.object.isMesh );
			bed.floor[ n ] = hit ? entry.pivot.worldToLocal( hit.point ).y : bed.rim;

		}

		const room = bed.floor.reduce( ( sum, h ) => sum + Math.max( 0, bed.rim - h ), 0 ) * bed.cell;
		bed.capacity = shares.capacity ?? room * 1.15;
		bed.peak = 0.15 * Math.min( 2 * bed.halfWidth, 2 * bed.halfLength );
		beds.set( entry, bed );
		return bed;

	};

	// Loose material fills the bed from its floor, heaped towards the middle: the level that holds
	// `volume`, and the heap's height at each grid point.
	const fill = ( bed, volume ) => {

		const heights = new Float32Array( COLS * ROWS );
		const at = level => {

			let total = 0;
			for ( let n = 0; n < COLS * ROWS; n ++ ) {

				const [ u, v ] = gridShare( n );
				heights[ n ] = level - bed.peak * ( u * u + v * v );
				total += Math.max( 0, heights[ n ] - bed.floor[ n ] );

			}

			return total * bed.cell;

		};

		let lo = Math.min( ...bed.floor );
		let hi = bed.rim + 3 * bed.peak;
		for ( let i = 0; i < 30; i ++ ) {

			const mid = ( lo + hi ) / 2;
			if ( at( mid ) < volume ) lo = mid;
			else hi = mid;

		}

		at( hi );
		return heights;

	};

	const showHeap = entry => {

		const load = loads.get( entry );
		const bed = bedOf( entry );
		if ( ! load.heap ) {

			load.heap = new Mesh( new PlaneGeometry( 2 * bed.halfWidth, 2 * bed.halfLength, COLS - 1, ROWS - 1 ).rotateX( - Math.PI / 2 ), heapMaterial );
			load.heap.name = 'load';
			load.heap.position.set( bed.x, 0, bed.z );
			load.heap.raycast = () => {};
			entry.pivot.add( load.heap );

		}

		// Below the floor where there's nothing yet, so the floor hides it.
		const heights = fill( bed, Math.min( load.loose, bed.capacity * 1.05 ) );
		const position = load.heap.geometry.attributes.position;
		for ( let n = 0; n < COLS * ROWS; n ++ ) {

			const [ x, z ] = gridPoint( bed, n );
			const above = heights[ n ] > bed.floor[ n ] + 0.02;
			position.setXYZ( n, x - bed.x, above ? heights[ n ] : bed.floor[ n ] - 0.05, z - bed.z );

		}

		position.needsUpdate = true;
		load.heap.geometry.computeVertexNormals();
		load.heap.geometry.computeBoundingSphere();
		load.heap.visible = load.loose > 0;
		load.top = Math.max( ...heights );

	};

	models.addEventListener( 'remove', ( { entry } ) => loads.delete( entry ) );

	// Saved as [ east, north, m³ ] per loaded truck and matched back up by position.
	layout.registerExtra( 'truck-loads', {
		save: () => {

			const list = [ ...loads ].filter( ( [ , l ] ) => l.loose > 0 ).map( ( [ e, l ] ) => [ e.state.east, e.state.north, Math.round( l.loose * 100 ) / 100 ] );
			return list.length ? list : null;

		},
		load: ( list, { merge = false } = {} ) => {

			if ( ! merge ) clear();
			for ( const [ east, north, loose ] of list ?? [] ) {

				const entry = models.entries.find( e => isTruck( e ) && Math.hypot( e.state.east - east, e.state.north - north ) < 0.5 );
				if ( entry ) add( entry, loose, false );

			}

		},
		clear: () => clear(),
	} );

	function clear() {

		for ( const load of loads.values() ) {

			load.loose = 0;
			if ( load.heap ) load.heap.visible = false;

		}

	}

	function add( entry, loose, save = true ) {

		if ( ! loads.has( entry ) ) loads.set( entry, { loose: 0, heap: null, top: 0 } );
		loads.get( entry ).loose += loose;
		showHeap( entry );
		if ( save ) layout.changed();

	}

	const _point = new Vector3();
	return {

		list: () => models.entries.filter( isTruck ),
		load: entry => loads.get( entry )?.loose ?? 0,
		capacity: entry => bedOf( entry ).capacity,
		isFull: entry => ( loads.get( entry )?.loose ?? 0 ) >= bedOf( entry ).capacity,
		add,

		bedCentre( entry ) {

			const bed = bedOf( entry );
			entry.pivot.updateMatrixWorld( true );
			return entry.pivot.localToWorld( new Vector3( bed.x, bed.rim, bed.z ) );

		},

		// What falling soil lands on in the middle of the bed: the heap, or the floor.
		surface( entry ) {

			const bed = bedOf( entry );
			const load = loads.get( entry );
			const top = load?.loose > 0 ? load.top : bed.floor[ Math.floor( COLS * ROWS / 2 ) ];
			return entry.pivot.localToWorld( _point.set( bed.x, top, bed.z ) ).y;

		},

		bedOutline( entry ) {

			const bed = bedOf( entry );
			return [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ a, b ] ) =>
				entry.pivot.localToWorld( new Vector3( bed.x + a * bed.halfWidth, bed.rim, bed.z + b * bed.halfLength ) ) );

		},

	};

}

// Grid point n over the bed, in the truck's frame, and as shares of the half sizes (-1 to 1).
function gridPoint( bed, n ) {

	const [ u, v ] = gridShare( n );
	return [ bed.x + u * bed.halfWidth, bed.z + v * bed.halfLength ];

}

function gridShare( n ) {

	return [ ( n % COLS ) / ( COLS - 1 ) * 2 - 1, Math.floor( n / COLS ) / ( ROWS - 1 ) * 2 - 1 ];

}

// --- helpers ---------------------------------------------------------------------------------

// The shortest turn from angle a to angle b (radians).
function angleTo( a, b ) {

	return MathUtils.euclideanModulo( b - a + Math.PI, Math.PI * 2 ) - Math.PI;

}

function wrapDegrees( degrees ) {

	return MathUtils.euclideanModulo( degrees + 180, 360 ) - 180;

}
