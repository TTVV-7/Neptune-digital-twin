// npm run test:drive-plane: World Drive's plane (src/plane.js) and its tricks (src/plane-tricks.js),
// in node, no browser. The plane is flown on a stand-in for its Driver: drive.js's own Driver, made
// without its constructor (Object.create), so its trick methods (enterAir, turn, planeSpin,
// payTricks) are the real ones, over ground that is a plain function of where it is (flat, or a
// slope), with rays that find only that ground. Checks: the top speeds; the drop's falling speed
// on the Earth spread out and diving and on the Moon, and the plane's speed shed after a bail-out;
// the parachute's sink on the Earth, the Moon and Vesta, doubled spilling air, and opening earlier
// over ground rising along the way it's going; the tricks' names and scores (a roll, a loop, an
// outside loop, the caps, the repeats rule, the height rule) and a ↺ (TRICK) tap; the loop's hump
// (gone again once it's level, never under the floor, an outside loop refused too low); the
// leaderboard's TRICK pattern (worker/drive/scores.js) taking the plane's names; and the points
// and tolerance plane-tricks.js copies from drive.js still matching it.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Driver } from '../src/drive.js';
import { COURSE_KMH, COURSE_MODE, DROP, PARACHUTE, PlaneMode, chuteHeight, chuteSink, dropTerminal, planeTopSpeed } from '../src/plane.js';
import { COURSE, COURSE_FASTEST } from '../src/drive-app/challenge-rules.js';
import { HEIGHTS, LOOP, PLANE_POINTS, PLANE_TRICKS, TURN_TOL, loopGate, loopOffset, noseAngle, planeTricksOf } from '../src/plane-tricks.js';
import { TRICK } from '../worker/drive/scores.js';

const DT = 1 / 60;
const KMH = 3.6;
// The gravities (shares of the Earth's) of World Drive's worlds (worlds.js).
const G = { earth: 1, mars: 3.71 / 9.81, moon: 1.62 / 9.81, vesta: 0.25 / 9.81 };
// The ride's own top speed (km/h): 180 km/h, 50 m/s.
const CAR_TOP = 180;

// A Driver with a plane, over `ground` (east, north) => the ground's height, on a world of `gravity`.
function rig( { gravity = 1, ground = () => 0, y = 0, speed = 0, heading = 0, trickRate = 1 } = {} ) {

	const d = Object.create( Driver.prototype );
	const paid = [];
	const flashes = [];
	Object.assign( d, {
		keys: new Set(), pressedAt: new Map(), clock: 0, active: true, machine: null, fly: false, launch: true,
		east: 0, north: 0, y, heading, course: heading, speed, vy: 0, pitch: 0, roll: 0, steer: 0,
		gravity, trickRate, height: 1.5, front: 2, spec: { topSpeed: CAR_TOP },
		air: null, chute: null, boost: null, grounded: false, flying: false,
		score: 0, mult: 1, best: 0, bestJump: null, gauge: 0, runStart: 0, runAir: 0, bestAir: 0, lastTrick: - Infinity,
		hud: { flash: text => flashes.push( text ), setPending() {}, setPlane() {}, setScore() {}, tricks: shown => paid.push( shown ) },
		showChute() {},
		onPlane() {},
		onScore: null,
		// Only the ground is ever hit, and only looking down at it.
		cast( origin, dir, far ) {

			if ( dir.y > - 0.5 ) return null;
			const east = - origin.x, north = origin.z;
			const at = ground( east, north );
			const distance = origin.y - at;
			return distance >= 0 && distance <= far ? { point: { y: at }, distance } : null;

		},
	} );
	d.aircraft = new PlaneMode( d );
	return { d, plane: d.aircraft, paid, flashes, ground };

}

// The ground under it known, as it is by the time it's flown up there (the first ray looks only so
// far down: plane.js's groundUnder).
function settle( r ) {

	r.plane.ground = r.ground( r.d.east, r.d.north );
	r.plane.height = r.d.y - r.plane.ground;

}

// The plane flying (wings out) or dropping, from where the rig put it.
function flying( r ) {

	settle( r );
	r.plane.phase = 'flying';
	r.plane.deploy = 1;
	return r;

}

function dropping( r ) {

	settle( r );
	r.plane.phase = 'dropping';
	r.d.chute = { open: false, t: 0 };
	return r;

}

// Runs it for `seconds` (or until `until` says stop), calling `each` every frame.
function run( { d, plane }, seconds, { each = null, until = null } = {} ) {

	for ( let t = 0; t < seconds; t += DT ) {

		d.clock += DT;
		plane.update( DT );
		each?.( t );
		if ( until?.( t ) ) return t;
		if ( ! plane.on ) return t;

	}

	return seconds;

}

const over = ( { d, ground } ) => d.y - ground( d.east, d.north );

describe( 'plane speeds', () => {

	test( '12,000 km/h at the ceiling, 5,000 at 6 km, 1,700 at 2 km, still 60 km/h off the ground', () => {

		assert.ok( Math.abs( planeTopSpeed( 12000 ) - 12000 / KMH ) < 1e-9 );
		assert.ok( Math.abs( planeTopSpeed( 20000 ) - 12000 / KMH ) < 1e-9 );
		assert.ok( Math.abs( planeTopSpeed( 6000 ) - 5000 / KMH ) < 1e-9 );
		assert.ok( Math.abs( planeTopSpeed( 0 ) - 60 / KMH ) < 1e-9 );
		assert.ok( Math.abs( planeTopSpeed( 2000 ) - 1700 / KMH ) < 1e-9 );
		// Only ever faster higher up.
		for ( let h = 0; h < 12000; h += 50 ) assert.ok( planeTopSpeed( h + 50 ) >= planeTopSpeed( h ), `${ h } m` );

	} );

	test( 'the live protocol takes a plane flat out with a loop\'s hump on top; what\'s sent stays under old pages\' 800', () => {

		const protocol = readFileSync( new URL( '../src/drive-app/live-protocol.js', import.meta.url ), 'utf8' );
		const live = readFileSync( new URL( '../src/drive-app/live.js', import.meta.url ), 'utf8' );
		const top = Number( protocol.match( /^const TOP_SPEED = (\d+);$/m )[ 1 ] );
		const clamp = Number( live.match( /^const MAX_SPEED = (\d+);$/m )[ 1 ] );
		// (Flat out, and climbing at half that at the steepest of a loop.)
		const fastest = planeTopSpeed( 12000 ) * Math.hypot( 1, LOOP.lift );
		assert.ok( fastest < top, JSON.stringify( { fastest, top } ) );
		// What's sent stays under the 800 a page from before the faster plane still checks against
		// (live.js's MAX_SPEED); a plane faster than half again that is seen jumping word to word.
		assert.ok( clamp < 800, JSON.stringify( { fastest, clamp } ) );

	} );

} );

describe( 'the drop (bailing out)', () => {

	// The fastest it falls before the parachute opens.
	function freefall( r ) {

		let fastest = 0;
		run( r, 600, { each: () => fastest = Math.max( fastest, - r.d.vy ), until: () => r.d.chute.open } );
		return fastest;

	}

	test( 'on the Earth: 700 m/s spread out and never faster; 1,120 m/s diving; there in under 8 s; down from the 12 km ceiling in about 20 s', () => {

		assert.ok( Math.abs( freefall( dropping( rig( { y: 12000 } ) ) ) - 700 ) < 1, 'spread out' );
		const diving = dropping( rig( { y: 20000 } ) );
		diving.d.keys.add( 'KeyW' );
		assert.ok( Math.abs( freefall( diving ) - 1120 ) < 1, 'diving' );
		// Falling at 10 times the Earth's gravity: like a stone, not a drift.
		const r = dropping( rig( { y: 12000 } ) );
		assert.ok( run( r, 30, { until: () => - r.d.vy >= 699.9 } ) < 8 );
		// From the ceiling to the parachute in about 20 s.
		const ceiling = dropping( rig( { y: 12000 } ) );
		const down = run( ceiling, 60, { until: () => ceiling.d.chute.open } );
		assert.ok( down > 15 && down < 24, `${ down.toFixed( 1 ) } s` );
		assert.ok( Math.abs( dropTerminal( G.mars ) - ( 450 + 250 * ( G.mars - 0.165 ) / ( 1 - 0.165 ) ) ) < 0.5 );
		assert.ok( Math.abs( dropTerminal( G.moon, true ) - 720 ) < 0.1 );

	} );

	test( 'on the Moon it reaches 450 m/s within 8 s (falling at 60 m/s² at least)', () => {

		const r = dropping( rig( { gravity: G.moon, y: 12000 } ) );
		const t = run( r, 30, { until: () => - r.d.vy >= 449.9 } );
		assert.ok( t < 8, `took ${ t.toFixed( 1 ) } s` );
		assert.ok( Math.abs( freefall( r ) - 450 ) < 0.5 );

	} );

	test( 'out of a plane at 3,500 km/h, its speed across the ground is down to the car\'s own within 3 s', () => {

		const r = dropping( rig( { y: 6000, speed: 972 } ) );
		run( r, 3 );
		assert.ok( r.d.speed <= CAR_TOP / KMH + 1e-6, `${ r.d.speed } m/s` );
		assert.equal( r.flashes.length, 0 );

	} );

} );

describe( 'the parachute', () => {

	// The speed it comes down at (m/s) just before it lands, `spilling` air or not.
	function sink( gravity, spilling = false ) {

		const r = dropping( rig( { gravity, y: 400 } ) );
		if ( spilling ) r.d.keys.add( 'KeyS' );
		let last = 0;
		run( r, 2000, { each: () => r.plane.on && ( last = - r.d.vy ) } );
		assert.ok( ! r.plane.on, 'it never landed' );
		return last;

	}

	test( 'it lowers it briskly: 10 m/s on the Earth, about 4 on the Moon, 3 on Vesta, twice that spilling air', () => {

		assert.ok( Math.abs( sink( G.earth ) - 10 ) < 0.1 );
		assert.ok( Math.abs( sink( G.moon ) - 4.06 ) < 0.05 );
		assert.ok( Math.abs( sink( G.vesta ) - 3 ) < 0.05 );
		assert.ok( Math.abs( sink( G.earth, true ) - 20 ) < 0.5 );
		assert.ok( Math.abs( sink( G.moon, true ) - 8.13 ) < 0.1 );
		assert.ok( Math.abs( chuteSink( G.mars ) - PARACHUTE.sink * Math.sqrt( G.mars ) ) < 1e-9 );

	} );

	test( 'on the Earth it opens 135 m up spread out (as high as it takes to slow from 700 m/s, then 2 s at its sink), and it\'s down within 6 s of opening', () => {

		const r = dropping( rig( { y: 6000 } ) );
		let opened = null;
		run( r, 600, { until: () => r.d.chute.open && ( opened = over( r ) ) } );
		// (Within two frames of the fall: at 700 m/s a frame is 12 m.)
		assert.ok( Math.abs( opened - 135 ) < 25, `opened at ${ opened } m` );
		const down = run( r, 60, { until: () => ! r.plane.on } );
		assert.ok( down < 6, `${ down.toFixed( 1 ) } s under the parachute` );

	} );

	test( 'it opens earlier over ground rising along the way it\'s going than over flat ground', () => {

		const opensAt = ground => {

			const r = dropping( rig( { gravity: G.mars, y: 6000, speed: CAR_TOP / KMH, ground } ) );
			let opened = null;
			run( r, 600, { until: () => r.d.chute.open && ( opened = over( r ) ) } );
			return opened;

		};

		const flat = opensAt( () => 0 );
		// Rising two metres for each one north, the way it's going: 100 m/s coming up at it, so it
		// opens as much higher as slowing from that much more takes (100 / PARACHUTE.settle m, 17 m;
		// seen to within a frame of a 614 m/s fall, 10 m). (Ground rising ahead over the car itself
		// isn't found: a wall, closingSpeed.)
		const slope = opensAt( ( east, north ) => north * 2 );
		// (Within two frames of the fall: it's seen open a frame after it opens, at 514 m/s 9 m a frame.)
		assert.ok( Math.abs( flat - chuteHeight( dropTerminal( G.mars ), G.mars ) ) < 2 * dropTerminal( G.mars ) * DT + 1, `flat ${ flat }` );
		assert.ok( slope > flat + 100 / PARACHUTE.settle - 614 * DT, JSON.stringify( { flat, slope } ) );
		assert.ok( Math.abs( chuteHeight( 500, 1 ) - chuteHeight( 300, 1 ) - 200 / PARACHUTE.settle ) < 1e-9 );

	} );

	test( 'bailing out flashes how to dive; the parachute, how to steer and drop faster', () => {

		const r = flying( rig( { y: 500 } ) );
		r.plane.height = 500;
		r.plane.toggle();
		run( r, 600 );
		assert.deepEqual( r.flashes.slice( 0, 2 ), [ 'Freefall! W dive · A/D steer', 'Parachute! A/D steer · S to drop faster' ] );
		assert.equal( DROP.low, 12 );

	} );

} );

describe( 'plane tricks: the rules', () => {

	const air = ( x, z ) => ( { turned: { x: x * Math.PI / 180, y: 0, z: z * Math.PI / 180 } } );

	test( 'whole turns, give or take 40°, named as the car names them, or as loops', () => {

		assert.deepEqual( planeTricksOf( air( 0, 330 ) ).tricks, [ { name: 'Barrel roll!', points: 800, kind: 'roll' } ] );
		assert.deepEqual( planeTricksOf( air( 0, 310 ) ).tricks, [] );
		assert.deepEqual( planeTricksOf( air( 360, 0 ) ).tricks, [ { name: 'Loop!', points: 1000, kind: 'loop' } ] );
		assert.deepEqual( planeTricksOf( air( - 720, 0 ) ).tricks, [ { name: 'Outside loop ×2', points: 2000, kind: 'outside' } ] );
		assert.deepEqual( planeTricksOf( air( 360, - 360 ) ).tricks.map( t => t.name ), [ 'Barrel roll!', 'Loop!' ] );

	} );

	test( 'at most 3 rolls and 2 loops score in a pass; more still show', () => {

		const five = planeTricksOf( air( 0, 5 * 360 ) );
		assert.deepEqual( five.tricks, [ { name: 'Barrel roll ×3', points: 2400, kind: 'roll' } ] );
		assert.deepEqual( five.lines, [ 'Barrel roll ×5' ] );
		const three = planeTricksOf( air( 3 * 360, 0 ) );
		assert.deepEqual( three.tricks, [ { name: 'Loop ×2', points: 2000, kind: 'loop' } ] );
		assert.deepEqual( three.lines, [ 'Loop ×3' ] );
		assert.equal( PLANE_TRICKS.rolls, 3 );
		assert.equal( PLANE_TRICKS.loops, 2 );

	} );

	test( 'the same kind again in a flight is worth half each time; high up, a half or a tenth', () => {

		assert.equal( planeTricksOf( air( 360, 0 ), { counts: { loop: 1 } } ).tricks[ 0 ].points, 500 );
		assert.equal( planeTricksOf( air( 360, 0 ), { counts: { loop: 2 } } ).tricks[ 0 ].points, 250 );
		// An outside loop isn't a loop again.
		assert.equal( planeTricksOf( air( - 360, 0 ), { counts: { loop: 3 } } ).tricks[ 0 ].points, 1000 );
		assert.equal( planeTricksOf( air( 0, 360 ), { height: 300 } ).tricks[ 0 ].points, 800 );
		assert.equal( planeTricksOf( air( 0, 360 ), { height: 1000 } ).tricks[ 0 ].points, 400 );
		assert.equal( planeTricksOf( air( 0, 360 ), { height: 5000 } ).tricks[ 0 ].points, 80 );
		assert.deepEqual( HEIGHTS.map( ( [ , share ] ) => share ), [ 1, 0.5, 0.1 ] );

	} );

	test( 'a trick repeated until it rounds below 10 points scores nothing, so a flight can\'t be farmed', () => {

		// High up (a tenth), a roll's 80 halves to 40, 20, 10, 5 (10 to the nearest 10), then 2.5: nothing
		// from the sixth on.
		const worth = n => planeTricksOf( air( 0, 360 ), { height: 5000, counts: { roll: n } } );
		assert.equal( worth( 2 ).tricks[ 0 ].points, 20 );
		assert.deepEqual( worth( 6 ).tricks, [] );
		// It still shows.
		assert.deepEqual( worth( 6 ).lines, [ 'Barrel roll!' ] );
		// Each kind's worth over a whole flight is bounded.
		let total = 0;
		for ( let n = 0; n < 100; n ++ ) total += worth( n ).tricks[ 0 ]?.points ?? 0;
		assert.ok( total < 200, `${ total }` );

	} );

	test( 'the nose angle reads straight up as π/2 and upside down as π, either way round', () => {

		const about = angle => ( { x: Math.sin( angle / 2 ), y: 0, z: 0, w: Math.cos( angle / 2 ) } );
		assert.ok( Math.abs( noseAngle( about( Math.PI / 2 ) ) - Math.PI / 2 ) < 1e-9 );
		assert.ok( Math.abs( Math.abs( noseAngle( about( Math.PI ) ) ) - Math.PI ) < 1e-6 );
		assert.ok( Math.abs( noseAngle( about( - 0.4 ) ) + 0.4 ) < 1e-9 );
		// A roll alone doesn't put the nose up.
		assert.ok( Math.abs( noseAngle( { x: 0, y: 0, z: Math.sin( 1 ), w: Math.cos( 1 ) } ) ) < 1e-9 );
		assert.equal( loopOffset( Math.PI, 100 ), 100 );
		assert.equal( loopOffset( - Math.PI, 100 ), - 100 );
		assert.equal( loopGate( 100, false ), LOOP.climb );
		assert.equal( loopGate( 100, true ), 100 + LOOP.margin );

	} );

	test( 'the points and tolerance it copies are still drive.js\'s', () => {

		const source = readFileSync( new URL( '../src/drive.js', import.meta.url ), 'utf8' );
		const points = Function( `return ${ source.match( /^const POINTS = (\{[^}]*\});$/m )[ 1 ] }` )();
		assert.equal( PLANE_POINTS.roll, points.roll );
		assert.equal( PLANE_POINTS.loop, points.flip );
		assert.equal( TURN_TOL, Number( source.match( /^const FLIP_TOL = (\d+);$/m )[ 1 ] ) );

	} );

	test( 'the leaderboard takes a plane\'s tricks, and no more loops than a pass scores', () => {

		const takes = tricks => tricks.split( ' + ' ).every( part => TRICK.test( part ) );
		for ( const tricks of [ 'Loop!', 'Loop ×2', 'Outside loop!', 'Outside loop ×2', 'Barrel roll ×3', 'Barrel roll! + Loop!', 'Barrel roll ×2 + Outside loop ×2' ] ) assert.ok( takes( tricks ), tricks );
		for ( const tricks of [ 'Loop ×3', 'Outside loop ×10', 'Loop', 'Inside loop!', 'Loop! + ', 'loop!' ] ) assert.ok( ! takes( tricks ), tricks );

	} );

} );

describe( 'plane tricks: flown', () => {

	// Flying level at `height` m over flat ground, at `speed` m/s, nothing held.
	const level = ( height, speed, options = {} ) => {

		const r = flying( rig( { y: height, speed, ...options } ) );
		run( r, DT );
		return r;

	};

	// Holds `codes` for `seconds`, then lets go and flies on until the pass is paid (or `after` s).
	const fly = ( r, codes, seconds, after = 6 ) => {

		for ( const code of codes ) r.d.keys.add( code );
		run( r, seconds );
		for ( const code of codes ) r.d.keys.delete( code );
		run( r, after, { until: () => ! r.d.air } );
		return r;

	};

	test( 'Q for 1.2 s is a barrel roll, paid once it\'s level again, and the plane flies on', () => {

		const r = fly( level( 200, 60 ), [ 'KeyQ' ], 1.2 );
		assert.equal( r.d.air, null );
		assert.deepEqual( r.paid.map( p => p.lines ), [ [ 'Barrel roll!' ] ] );
		assert.equal( r.d.score, 800 );
		assert.ok( r.plane.on && r.plane.phase === 'flying' );

	} );

	test( 'Z is a loop and X an outside loop; the second loop in a flight is worth half', () => {

		const r = fly( level( 600, 60 ), [ 'KeyZ' ], 1.2 );
		fly( r, [ 'KeyX' ], 1.2 );
		fly( r, [ 'Slash' ], 1.2 );
		assert.deepEqual( r.paid.map( p => [ p.lines, p.points ] ), [ [ [ 'Loop!' ], 500 ], [ [ 'Outside loop!' ], 500 ], [ [ 'Loop!' ], 250 ] ] );

	} );

	test( 'a TRICK tap (↺, R) rolls it once, to the right with no steering', () => {

		const r = level( 200, 60 );
		r.d.press( 'KeyR' );
		r.d.keys.delete( 'KeyR' );
		run( r, 6, { until: () => r.paid.length } );
		assert.deepEqual( r.paid.map( p => p.lines ), [ [ 'Barrel roll!' ] ] );
		assert.ok( r.d.air === null || r.d.air.turned.z < 0 );

	} );

	test( 'TRICK held with UP loops it rather than climbing it', () => {

		const r = level( 200, 60 );
		const start = r.d.y;
		r.d.keys.add( 'KeyR' );
		r.d.keys.add( 'Space' );
		run( r, 1.3 );
		r.d.keys.clear();
		run( r, 6, { until: () => r.paid.length } );
		assert.deepEqual( r.paid.map( p => p.lines ), [ [ 'Loop!' ] ] );
		assert.ok( Math.abs( r.d.y - start ) < 3, `${ r.d.y - start } m` );

	} );

	test( 'a loop let go of part-way: once level, it\'s back within a few metres of where it was', () => {

		for ( const speed of [ 60, 97 ] ) {

			const r = level( 200, speed );
			const start = r.d.y;
			let top = start;
			r.d.keys.add( 'KeyZ' );
			run( r, 0.3, { each: () => top = Math.max( top, r.d.y ) } );
			r.d.keys.clear();
			run( r, 6, { each: () => top = Math.max( top, r.d.y ), until: () => ! r.d.air } );
			assert.equal( r.d.air, null );
			assert.ok( top > start + 1.5, `no hump (${ top - start } m)` );
			assert.ok( Math.abs( r.d.y - start ) < 3, `${ r.d.y - start } m off at ${ speed } m/s` );
			assert.equal( r.paid.length, 0 );

		}

	} );

	test( 'over a whole loop it rises by the loop\'s radius and comes back down; others are sent the hump', () => {

		const r = level( 600, 60 );
		const start = r.d.y;
		const radius = 60 / r.d.loopRate;
		let top = start;
		let fastestUp = 0;
		r.d.keys.add( 'KeyZ' );
		run( r, 1.2, { each: () => {

			top = Math.max( top, r.d.y );
			fastestUp = Math.max( fastestUp, r.d.vy );

		} } );
		r.d.keys.clear();
		run( r, 6, { until: () => ! r.d.air } );
		assert.ok( Math.abs( top - start - radius ) < 0.15 * radius, JSON.stringify( { rise: top - start, radius } ) );
		// (Climbing at most half its speed, at the steepest of the loop.)
		assert.ok( fastestUp > 0.8 * 60 * LOOP.lift && fastestUp <= 60 * LOOP.lift * 1.05, `sent ${ fastestUp } m/s` );
		assert.ok( Math.abs( r.d.y - start ) < 3, `${ r.d.y - start } m` );
		assert.deepEqual( r.paid.map( p => p.lines ), [ [ 'Loop!' ] ] );

	} );

	test( 'a loop started just over 40 m never goes under the floor; an outside loop is refused too low', () => {

		const r = level( 41, 60 );
		let lowest = Infinity;
		r.d.keys.add( 'KeyZ' );
		run( r, 3, { each: () => lowest = Math.min( lowest, over( r ) ) } );
		assert.ok( lowest >= 0.8 - 1e-6, `${ lowest } m` );
		assert.ok( r.d.air.turned.x > 2 * Math.PI, 'it didn\'t loop' );

		// At 60 m/s the outside loop's dip is 60 / 5.5 = 11 m: it needs 51 m.
		const low = level( 45, 60 );
		low.d.keys.add( 'KeyX' );
		run( low, 1 );
		assert.ok( Math.abs( low.d.air.turned.x ) < 1e-9, 'it nosed down' );
		assert.ok( Math.abs( over( low ) - 45 ) < 0.5 );
		const high = level( 60, 60 );
		high.d.keys.add( 'KeyX' );
		run( high, 0.5 );
		assert.ok( high.d.air.turned.x < - 1 );

	} );

	test( 'bailing out mid-roll pays its whole turns; landing keeps the run\'s score and drops the trick boost', () => {

		const r = level( 200, 60 );
		r.d.keys.add( 'KeyE' );
		run( r, 1.25 );
		r.d.keys.clear();
		r.plane.toggle();
		assert.equal( r.plane.phase, 'dropping' );
		assert.equal( r.d.air, null );
		assert.deepEqual( r.paid.map( p => p.lines ), [ [ 'Barrel roll!' ] ] );
		assert.ok( r.d.boost, 'a trick boost was given' );
		run( r, 600 );
		assert.ok( ! r.plane.on );
		assert.equal( r.d.score, 800 );
		assert.equal( r.d.boost, null );

	} );

	test( 'flown high, a roll is worth a tenth', () => {

		const r = fly( level( 5000, 600 ), [ 'KeyQ' ], 1.2 );
		assert.deepEqual( r.paid.map( p => [ p.lines, p.points ] ), [ [ [ 'Barrel roll!' ], 80 ] ] );

	} );

	test( 'without stunts (crash: \'stop\'), the trick keys do nothing', () => {

		const r = level( 200, 60 );
		r.d.launch = false;
		fly( r, [ 'KeyQ', 'KeyZ' ], 1.2 );
		assert.equal( r.d.air, null );
		assert.equal( r.paid.length, 0 );

	} );

} );

describe( 'course mode (a hoop run)', () => {

	// A plane on a hoop run over the Moon's flat ground, held `up` m over it, then (if `go`) away.
	const course = ( { up = 30, go = true, ground = () => 0 } = {} ) => {

		const r = flying( rig( { gravity: G.moon, y: up, ground } ) );
		r.plane.setCourse( up );
		run( r, DT );
		if ( go ) r.plane.courseGo();
		return r;

	};
	const hold = ( r, codes, seconds, options ) => {

		for ( const code of codes ) r.d.keys.add( code );
		const t = run( r, seconds, options );
		for ( const code of codes ) r.d.keys.delete( code );
		return t;

	};

	test( 'its speeds are challenge-rules.js\'s COURSE, whose boost a hoop run\'s time is checked against', () => {

		assert.deepEqual( COURSE_KMH, COURSE );
		assert.ok( Math.abs( COURSE_MODE.boost - COURSE_FASTEST ) < 1e-9 );

	} );

	test( 'held at its start till GO, whatever the keys: no speed, climbing to its height; then away at the cruise', () => {

		const r = flying( rig( { gravity: G.moon, y: 2 } ) );
		r.plane.setCourse( 40 );
		hold( r, [ 'KeyW', 'KeyD' ], 4 );
		assert.equal( r.d.speed, 0 );
		assert.equal( r.d.heading, 0 );
		assert.ok( Math.abs( over( r ) - 40 ) < 2, `${ over( r ) } m up` );
		r.plane.courseGo();
		run( r, 3 );
		assert.ok( Math.abs( r.d.speed - COURSE_MODE.cruise ) < 0.5 );
		assert.ok( r.d.north > 300 );

	} );

	test( 'every ride flies the same: the car\'s own top speed counts for nothing', () => {

		const slow = course();
		const fast = course();
		fast.d.spec = { topSpeed: 215 };
		slow.d.spec = { topSpeed: 40 };
		for ( const r of [ slow, fast ] ) hold( r, [ 'KeyW' ], 2 );
		assert.equal( slow.d.speed, fast.d.speed );
		assert.equal( slow.d.north, fast.d.north );

	} );

	test( 'W boosts to the top and no faster, burning a bar a second till it\'s empty; S brakes to its least, never a hover', () => {

		const r = course();
		let top = 0;
		hold( r, [ 'KeyW' ], 10, { each: () => {

			top = Math.max( top, r.d.speed );

		} } );
		assert.ok( Math.abs( top - COURSE_MODE.boost ) < 1e-6, `${ top }` );
		assert.equal( r.plane.course.tank, 0 );
		assert.ok( r.flashes.some( text => /Boost empty/.test( text ) ) );
		// Empty, it eases back to the cruise.
		run( r, 15 );
		assert.ok( Math.abs( r.d.speed - COURSE_MODE.cruise ) < 2, `${ r.d.speed }` );
		hold( r, [ 'KeyS' ], 5 );
		assert.ok( Math.abs( r.d.speed - COURSE_MODE.least ) < 1e-6 );
		// The tank refilled (an orb's): boost again, never past what it holds.
		r.plane.courseFill( 1 );
		r.plane.courseFill( 10 );
		assert.equal( r.plane.course.tank, COURSE_MODE.tank );

	} );

	test( 'a dive is speed and a climb costs it; never past the boost\'s top, never under its least', () => {

		const dive = course( { up: 550 } );
		let top = 0;
		hold( dive, [ 'ShiftLeft' ], 6, { each: () => {

			top = Math.max( top, dive.d.speed );

		} } );
		assert.ok( top > COURSE_MODE.cruise + 20, `${ top }` );
		assert.ok( top <= COURSE_MODE.boost );
		const climb = course( { up: 20 } );
		let low = Infinity;
		hold( climb, [ 'Space' ], 6, { each: () => {

			low = Math.min( low, climb.d.speed );

		} } );
		assert.ok( low < COURSE_MODE.cruise - 20, `${ low }` );
		assert.ok( low >= COURSE_MODE.least );
		// Never over its ceiling.
		assert.ok( over( climb ) <= COURSE_MODE.ceiling + 1 );

	} );

	test( 'a carve: held hard into a turn it charges yellow, teal, pink, turning tighter; let go, a burst over the cruise', () => {

		const r = course();
		const before = r.d.heading;
		hold( r, [ 'KeyD' ], 2.7 );
		assert.equal( r.plane.course.level, 3 );
		assert.deepEqual( r.flashes.filter( text => /^Carve!|^CARVE/.test( text ) ), [ 'Carve!', 'Carve!!', 'CARVE!!!' ] );
		// Tighter than a plain turn's top rate would take it.
		assert.ok( Math.abs( r.d.heading - before ) > COURSE_MODE.turn[ 1 ] * 2.7 );
		run( r, 0.6 );
		assert.ok( r.flashes.includes( 'Carve boost III!' ) );
		assert.ok( r.d.speed > COURSE_MODE.cruise * 1.25, `${ r.d.speed }` );
		run( r, 15 );
		assert.ok( Math.abs( r.d.speed - COURSE_MODE.cruise ) < 2 );
		// A turn too short to charge: no burst.
		const short = course();
		hold( short, [ 'KeyA' ], 0.4 );
		run( short, 1 );
		assert.ok( ! short.flashes.some( text => /Carve/.test( text ) ) );

	} );

	test( 'tricks soon after a hoop fill the tank (a trick hoop\'s twice as much); long after, nothing', () => {

		const r = course( { up: 120 } );
		r.plane.course.tank = 0;
		r.plane.courseHoop( false );
		hold( r, [ 'KeyQ' ], 1.2 );
		run( r, 4, { until: () => ! r.d.air } );
		assert.equal( r.plane.course.tank, COURSE_MODE.trick );
		assert.ok( r.flashes.includes( `Trick boost! +${ COURSE_MODE.trick } boost` ) );
		r.plane.courseHoop( true );
		hold( r, [ 'KeyE' ], 1.2 );
		run( r, 4, { until: () => ! r.d.air } );
		assert.equal( r.plane.course.tank, COURSE_MODE.trick + COURSE_MODE.trickHoop );
		// Long after a hoop.
		r.plane.courseHoop( false );
		run( r, COURSE_MODE.trickWindow + 1 );
		hold( r, [ 'KeyQ' ], 1.2 );
		run( r, 4, { until: () => ! r.d.air } );
		assert.equal( r.plane.course.tank, COURSE_MODE.trick + COURSE_MODE.trickHoop );

	} );

	test( 'no bailing out during a hoop run; off again, T works as ever', () => {

		const r = course();
		r.plane.toggle();
		assert.equal( r.plane.phase, 'flying' );
		assert.ok( r.flashes.includes( 'No bailing out during a hoop run' ) );
		r.plane.setCourse( null );
		r.plane.toggle();
		assert.equal( r.plane.phase, 'dropping' );

	} );

} );
