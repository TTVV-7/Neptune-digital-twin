// Plane tricks (World Drive's plane, src/plane.js): barrel rolls and loops, flown on top of how the
// plane flies, and what they score. Kept apart from plane.js and drive.js, and importing nothing
// that needs a browser, so the rules can be tested in node on their own (scripts/test-drive-plane.mjs).
//
// What a trick is, is the car's: drive.js's `air` record, whose `turned` counts how far it has
// turned about its own axes (radians: x nose up, z over to the left) since the trick began. A plane
// turns about those axes on top of its flown attitude (Driver.enterAir( true ), which a car flying
// with F used), so the rolls and loops are drawn by pose() and sent to others in the car's
// quaternion like any other turn, with nothing new in the live protocol.
//
// Scoring is bounded, so the sky can't be farmed for points, which a car's jumps never could be
// (a jump ends when it lands): at most PLANE_TRICKS.rolls rolls and PLANE_TRICKS.loops loops score in
// one pass (more still show, scoring nothing); the same kind of trick again in the same flight is
// worth `repeat` times as much each time (1, 0.5, 0.25...), so variety pays; and flying high is worth
// less (HEIGHTS), since the skill is doing it near the ground, not holding Q at 12 km.

// Points for each, the car's own (drive.js's POINTS.roll and POINTS.flip: the test checks they
// still match): a roll scores as the car's barrel roll does and a loop as a flip.
export const PLANE_POINTS = { roll: 800, loop: 1000 };
// A whole turn give or take this many degrees counts (drive.js's FLIP_TOL).
export const TURN_TOL = 40;
// rolls, loops: the most of each that score in one pass. repeat: what each repeat of a kind of
// trick in one flight is worth, as a share of the last. settle: a pass ends (and is paid) once no
// trick key has been held for this long (s) and the plane is back within `level`° of level.
export const PLANE_TRICKS = { rolls: 3, loops: 2, repeat: 0.5, settle: 0.4, level: 15 };
// What a pass is worth by how high (m over the ground) it was flown at its highest: all of it
// within 300 m, half up to 2 km, a tenth over that.
export const HEIGHTS = [ [ 300, 1 ], [ 2000, 0.5 ], [ Infinity, 0.1 ] ];
// The loop's hump (see loopOffset): a loop lifts the plane over a circle of `lift` times the
// radius a nose turning at the trick's rate traces at its speed. Started from at least `climb` m
// over the ground for an inside loop (it climbs first), and for an outside loop (it dives first)
// from as far over it as the dip goes plus `margin` m.
export const LOOP = { lift: 0.5, climb: 40, margin: 40 };

// The share of a pass's points it keeps, flown at most `height` m over the ground.
export function heightShare( height ) {

	for ( const [ most, share ] of HEIGHTS ) if ( height <= most ) return share;
	return HEIGHTS[ HEIGHTS.length - 1 ][ 1 ];

}

const whole = radians => Math.floor( ( Math.abs( radians ) * 180 / Math.PI + TURN_TOL ) / 360 );
const tens = points => Math.max( 10, Math.round( points / 10 ) * 10 );

// The tricks in a pass so far, from its `air` record ({ turned }): { tricks, lines }. `tricks`, what
// it would score now, as drive.js's payTricks takes them ([ { name, points, kind } ], `kind` 'roll',
// 'loop' or 'outside' for countTricks); `lines`, what it reads as while it's being flown, with every
// whole turn made, scoring or not. `height`: the highest (m over the ground) the pass has been
// flown; `counts`: how many of each kind this flight has scored already ({ kind: n }).
//
// A trick's name says what it scored, never more than the caps ("Barrel roll ×3" after five), which
// is also what the leaderboard takes (worker/drive/scores.js's TRICK, which allows "Loop ×2" at most).
export function planeTricksOf( air, { height = 0, counts = {} } = {} ) {

	const { turned } = air;
	const tricks = [];
	const lines = [];
	const share = heightShare( height );
	const worth = ( kind, points ) => points * share * PLANE_TRICKS.repeat ** ( counts[ kind ] ?? 0 );
	const rolls = whole( turned.z );
	if ( rolls > 0 ) {

		const scored = Math.min( rolls, PLANE_TRICKS.rolls );
		const name = scored > 1 ? `Barrel roll ×${ scored }` : 'Barrel roll!';
		lines.push( rolls > 1 ? `Barrel roll ×${ rolls }` : 'Barrel roll!' );
		tricks.push( { name, points: tens( worth( 'roll', PLANE_POINTS.roll * scored ) ), kind: 'roll' } );

	}

	const loops = whole( turned.x );
	if ( loops > 0 ) {

		// Nose up and over (turned.x > 0, as a car's backflip) is a loop; nose down and under, an
		// outside loop.
		const kind = turned.x > 0 ? 'loop' : 'outside';
		const label = kind === 'loop' ? 'Loop' : 'Outside loop';
		const scored = Math.min( loops, PLANE_TRICKS.loops );
		lines.push( loops > 1 ? `${ label } ×${ loops }` : `${ label }!` );
		tricks.push( { name: scored > 1 ? `${ label } ×${ scored }` : `${ label }!`, points: tens( worth( kind, PLANE_POINTS.loop * scored ) ), kind } );

	}

	return { tricks, lines };

}

// Counts a pass's paid `tricks` into the flight's `counts` (for the repeats rule).
export function countTricks( counts, tricks ) {

	for ( const { kind } of tricks ) counts[ kind ] = ( counts[ kind ] ?? 0 ) + 1;
	return counts;

}

// How far (radians) the trick has the plane's nose up (+) or down (-), from `q` (the trick's
// turn on top of its flight, a quaternion { x, y, z, w }): the angle of where its nose points
// (-Z turned by q) between straight ahead and straight up, round the whole circle (-π to π), so
// upside down at the top of a loop is π. Read fresh from the turn each frame, not from how far it
// has turned in all (`turned`), which never unwinds: let go of a loop half-way and the plane rights,
// so this comes back to 0 with it.
export function noseAngle( q ) {

	// -Z turned by q: its up (y) and forward (-z) parts.
	const { x, y, z, w } = q;
	const up = - ( 2 * ( y * z - w * x ) );
	const ahead = 1 - 2 * ( x * x + y * y );
	return Math.atan2( up, ahead );

}

// The nose angle followed round past a whole turn (`was`, the last of it; `raw`, noseAngle now):
// continuous through upside down, so an inside loop counts 0 to 2π and an outside one 0 to -2π,
// back to 0 (from 2π or -2π) as each comes round, where the hump is nothing either way.
export function followLoop( was, raw ) {

	const step = Math.atan2( Math.sin( raw - was ), Math.cos( raw - was ) );
	let angle = was + step;
	if ( angle >= 2 * Math.PI ) angle -= 2 * Math.PI;
	if ( angle <= - 2 * Math.PI ) angle += 2 * Math.PI;
	return angle;

}

// The loop's hump (m, up + or down -) at `angle` (followLoop) round a loop of `radius` m (the speed
// over the trick's turn rate): the height a plane flying a circle that size would be at, by
// LOOP.lift. It rises with the nose and comes back down to nothing as the nose comes level, however
// the loop ends (all the way round, or let go of half-way and righted), so a loop never leaves the
// plane higher or lower than it went in. Up over an inside loop, down under an outside one.
export function loopOffset( angle, radius ) {

	return Math.sign( angle ) * LOOP.lift * radius * ( 1 - Math.cos( angle ) );

}

// The least height (m over the ground) a loop may start from at `radius` m: an inside loop climbs
// first, so needs only LOOP.climb; an outside loop dives first, by its whole dip, and needs that
// and LOOP.margin. `outside`: the outside loop's.
export function loopGate( radius, outside ) {

	return outside ? 2 * LOOP.lift * radius + LOOP.margin : LOOP.climb;

}
