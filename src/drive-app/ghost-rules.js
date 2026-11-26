import { HOOP_NEAR, START_SLACK, TALL, ZONE_UP, fastestFor } from './challenge-rules.js';
import { RADIUS } from './dropin-cells.js';
import { inFrame, levelFrame, levelled, pointOn } from './level.js';
import { EARTH, isWorld } from './worlds.js';

// A challenge run's ghost (docs/world-drive.md, "Challenges", "Ghosts"): the car's path from GO to
// the finish, sampled every GHOST_EVERY ms of the run's own clock and packed small, posted with the
// time and kept with the best, so the next run can race it. What the page (the challenges' chunk:
// challenges.js records and draws them) and the Worker (worker/drive/challenges.js checks and keeps
// them) share: the packing, where a route's points are in a ghost's frame, and the checks a ghost
// must pass for its time to be taken. Plain data and small functions, no three.js.
//
// A ghost's frame is the route's start (its pin) on the world's ellipsoid, at height 0 (the Earth's
// WGS84; every other world's a sphere of its radius, worlds.js): east, north and up in metres, as
// the scene's own frame is at a place (x west, y up, z north: the object frame 3d-tiles-renderer
// gives, which main.js recentres the scene on). On a world with a level spheroid (Vesta, Ceres:
// level.js) its up is that spheroid's normal at the pin, as the scene's is there, not straight out
// from the middle, so its ground's ups and downs are measured as the car drives them. Each sample
// is where the car's model was then (its pivot, as drawn) and which way it faced (yaw, pitch and
// roll), in that frame: centimetres and 1/TURN of a turn. Samples come at 0, every, 2 × every... ms and the last at the run's time itself
// (the finish), so a ghost of `count` samples is a run of a time it agrees with. Packed as a version
// byte, the interval and the count, then each sample's position as its second difference (the
// change in its step, which along a road is a few centimetres) and its angles as their change, each
// a zigzag varint: about six bytes a sample, so a minute is about 4 KB. A run longer than
// GHOST_SAMPLES samples is sampled half as often (and so on), so no ghost is longer than that,
// whatever the run, and its bytes stay under GHOST_BYTES.

export const GHOST_VERSION = 1;
// A sample every this many ms of the run's clock, at first.
export const GHOST_EVERY = 100;
// The most samples a ghost has at that interval before every other one is dropped and the interval
// doubles (a run of 6 min 49 s at 10 a second; a monthly's longest is a few minutes).
export const GHOST_SAMPLES = 4096;
// The most a ghost's bytes can be (and its base64url text 4 / 3 of that): the most samples, at the
// most each can take in practice (a turn's sharp change, a jump), well over what a run makes.
export const GHOST_BYTES = 48 * 1024;
export const GHOST_TEXT = Math.ceil( GHOST_BYTES / 3 ) * 4;
// The most bytes a ghost may take a sample on average (and HEADER for its version, interval and
// count): a run as it's driven packs into about six (its second differences a few centimetres, its
// turns a step or two), a crash or a jump more for a moment; one at the most each sample's numbers
// can be, about 12, is a run made up, packed as densely as the speed rule lets it be (metres of
// jitter a sample), which would take twice a real run's room of a challenge's ghosts
// (CHALLENGE_GHOST_BUDGET) and keep slower honest ghosts out with half as many.
export const GHOST_DENSITY = 10;
const HEADER = 8;
// Angles in 1/TURN of a turn (0.35°).
export const TURN = 1024;
// What a ghost is let off: a sample this far (m) past what FASTEST covers in its time (its
// rounding to the centimetre, the line between two frames' places), across the ground and up or down
// alike (nothing in the game climbs or falls faster than it drives: a fall is stopped at 200 m, by
// then about 63 m/s); a pass this far past its point's radius (the model's middle, which the ghost
// follows, is off the point the pass is told by in the air); and the jumps the game makes: R puts
// the car RESPAWN m on (and a little more by its model's tilt), or back where it drove before, as
// falling off the edge of the world does (back within BACK of the path it drove, however long ago:
// R goes back to where the car last drove freely on the ground, half a second to a second before
// mostly, but after a flight to where it took off, which can be minutes back), up or down as far
// as that is. At most JUMPS of them, and one more each JUMP_EVERY ms of the run, up to JUMPS_MOST:
// a driver pressing R now and then.
export const SAMPLE_SLACK = 0.3;
export const PASS_SLACK = 3;
const RESPAWN = 5.5;
const BACK = 4;
const JUMPS = 4;
const JUMP_EVERY = 15000;
const JUMPS_MOST = 32;
// How far (m) a ghost's samples may be from the start across the ground and up and down: no route
// is anywhere near this long, nor ground this high or low (Olympus Mons's top is 21.2 km over the
// sphere Mars's heights are on, so a run up there is that high in its frame; Vesta's ground is from
// 50.7 km under its sphere, Rheasilvia's floor, to 30.3 km over it, and under a level up leaning
// 12° from the sphere's a run deep in Rheasilvia is up to 10 km across the ground from its pin in
// its frame). Packed, the first sample's numbers are its place itself and the second's up to three
// times that, in centimetres: 18 million at most, a zigzag varint of 26 bits, within the 28 that
// readGhost reads.
const REACH = 60000;
const HEIGHT = 60000;
// The Earth's ellipsoid (WGS84, as Google's tiles are on); every other world is a sphere (body.js).
const WGS84_A = 6378137;
const WGS84_B = 6356752.314245179;
const E2 = 1 - WGS84_B * WGS84_B / ( WGS84_A * WGS84_A );
const RAD = Math.PI / 180;

// The interval (ms) a ghost of a run of `ms` is sampled at: GHOST_EVERY, doubled as often as the
// run needs to fit in GHOST_SAMPLES samples (and the finish).
export function everyFor( ms ) {

	let every = GHOST_EVERY;
	while ( Math.floor( ms / every ) + 1 > GHOST_SAMPLES ) every *= 2;
	return every;

}

// How many samples a ghost of a run of `ms` has: those at each `every` up to the time, and the
// finish.
export function countFor( ms ) {

	return Math.floor( ms / everyFor( ms ) ) + 2;

}

// When (ms) sample `i` of a ghost of `count` samples every `every` ms of a run of `ms` was.
export function sampleTime( i, count, every, ms ) {

	return i === count - 1 ? ms : i * every;

}

// --- where things are ---

// Where ( lat, lon, height ) on `world` is from `origin` ({ lat, lon }, on its ellipsoid at height
// 0): [ east, north, up ] (m), as the scene's frame there has it (main.js, 3d-tiles-renderer's object
// frame: up along the ellipsoid's normal there; on a world with a level spheroid, level.js's frame,
// up along that spheroid's normal). null on a world that isn't one (worlds.js).
export function localOf( world, origin, lat, lon, height = 0 ) {

	if ( ! isWorld( world ) ) return null;
	if ( levelled( world ) ) return inFrame( levelFrame( world, origin.lat, origin.lon, 0 ), pointOn( world, lat, lon, height ) );
	const [ ox, oy, oz ] = centred( world, origin.lat, origin.lon, 0 );
	const [ x, y, z ] = centred( world, lat, lon, height );
	const [ dx, dy, dz ] = [ x - ox, y - oy, z - oz ];
	const [ phi, lambda ] = [ origin.lat * RAD, origin.lon * RAD ];
	const [ sp, cp, sl, cl ] = [ Math.sin( phi ), Math.cos( phi ), Math.sin( lambda ), Math.cos( lambda ) ];
	return [
		- sl * dx + cl * dy,
		- sp * cl * dx - sp * sl * dy + cp * dz,
		cp * cl * dx + cp * sl * dy + sp * dz,
	];

}

// ( lat, lon, height ) on `world` (one of worlds.js's) as a point from its middle (m): on the
// Earth's ellipsoid, or on the sphere of another world's radius, as its globe has it (body.js).
function centred( world, lat, lon, height ) {

	const [ phi, lambda ] = [ lat * RAD, lon * RAD ];
	if ( world !== EARTH ) {

		const r = RADIUS[ world ] + height;
		return [ r * Math.cos( phi ) * Math.cos( lambda ), r * Math.cos( phi ) * Math.sin( lambda ), r * Math.sin( phi ) ];

	}

	const n = WGS84_A / Math.sqrt( 1 - E2 * Math.sin( phi ) ** 2 );
	return [ ( n + height ) * Math.cos( phi ) * Math.cos( lambda ), ( n + height ) * Math.cos( phi ) * Math.sin( lambda ), ( n * ( 1 - E2 ) + height ) * Math.sin( phi ) ];

}

// --- packing ---

// A ghost ({ every, count, east, north, up: centimetres, yaw, pitch, roll: 1/TURN of a turn, each
// an array of `count` integers }) packed into `out` (a Uint8Array): how many bytes it took, or -1
// if it doesn't fit.
export function packGhost( ghost, out ) {

	const { every, count, east, north, up, yaw, pitch, roll } = ghost;
	let at = 0;
	const put = value => {

		// Zigzag (small either way is small), then 7 bits a byte.
		let n = value < 0 ? - value * 2 - 1 : value * 2;
		do {

			if ( at >= out.length ) return false;
			const low = n % 128;
			n = Math.floor( n / 128 );
			out[ at ++ ] = n ? low | 128 : low;

		} while ( n );
		return true;

	};
	if ( out.length < 1 ) return - 1;
	out[ at ++ ] = GHOST_VERSION;
	if ( ! put( every ) || ! put( count ) ) return - 1;
	const step = [ 0, 0, 0 ];
	const last = [ 0, 0, 0 ];
	const turned = [ 0, 0, 0 ];
	for ( let i = 0; i < count; i ++ ) {

		const place = [ east[ i ], north[ i ], up[ i ] ];
		for ( let k = 0; k < 3; k ++ ) {

			const moved = place[ k ] - last[ k ];
			if ( ! put( moved - step[ k ] ) ) return - 1;
			step[ k ] = moved;
			last[ k ] = place[ k ];

		}

		const angles = [ yaw[ i ], pitch[ i ], roll[ i ] ];
		for ( let k = 0; k < 3; k ++ ) {

			if ( ! put( wrap( angles[ k ] - turned[ k ] ) ) ) return - 1;
			turned[ k ] = angles[ k ];

		}

	}

	return at;

}

// A packed ghost's bytes as they're posted and kept: base64url.
export function ghostText( bytes, length = bytes.length ) {

	let text = '';
	// (In pieces: one call with tens of thousands of arguments can be too many for a browser.)
	for ( let i = 0; i < length; i += 8192 ) text += String.fromCharCode( ...bytes.subarray( i, Math.min( length, i + 8192 ) ) );
	return btoa( text ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );

}

// A ghost from its text (ghostText's): { every, count, east, north, up, yaw, pitch, roll } (each an
// Int32Array of `count`, centimetres and 1/TURN of a turn, the angles 0 to TURN - 1), or null for
// anything that isn't one: too long, not base64url, another version, a count over the most there
// can be, a number too big for any sample, too few bytes or any left over.
export function readGhost( text ) {

	if ( typeof text !== 'string' || ! text.length || text.length > GHOST_TEXT ) return null;
	const bytes = fromText( text );
	if ( ! bytes || bytes[ 0 ] !== GHOST_VERSION ) return null;
	// Its numbers, each a zigzag varint of at most four bytes (28 bits: more than any sample needs),
	// read in one pass into one array; then as many as a ghost of its count has, no more, no fewer.
	const numbers = new Int32Array( bytes.length );
	let n = 0;
	let value = 0;
	let shift = 0;
	for ( let i = 1; i < bytes.length; i ++ ) {

		const byte = bytes[ i ];
		value |= ( byte & 127 ) << shift;
		if ( byte & 128 ) {

			shift += 7;
			if ( shift >= 28 ) return null;
			continue;

		}

		numbers[ n ++ ] = ( value >>> 1 ) ^ - ( value & 1 );
		value = 0;
		shift = 0;

	}

	const every = numbers[ 0 ];
	const count = numbers[ 1 ];
	if ( shift || n < 2 || every < GHOST_EVERY || count < 2 || count > GHOST_SAMPLES + 1 || n !== 2 + count * 6 ) return null;
	const ghost = { every, count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
	const { east, north, up, yaw, pitch, roll } = ghost;
	const reach = REACH * 100;
	const height = HEIGHT * 100;
	let [ x, y, z, dx, dy, dz, a, b, c ] = [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ];
	for ( let i = 0, at = 2; i < count; i ++, at += 6 ) {

		dx += numbers[ at ];
		dy += numbers[ at + 1 ];
		dz += numbers[ at + 2 ];
		x += dx;
		y += dy;
		z += dz;
		if ( x > reach || x < - reach || y > reach || y < - reach || z > height || z < - height ) return null;
		east[ i ] = x;
		north[ i ] = y;
		up[ i ] = z;
		a = ( ( a + numbers[ at + 3 ] ) % TURN + TURN ) % TURN;
		b = ( ( b + numbers[ at + 4 ] ) % TURN + TURN ) % TURN;
		c = ( ( c + numbers[ at + 5 ] ) % TURN + TURN ) % TURN;
		yaw[ i ] = a;
		pitch[ i ] = b;
		roll[ i ] = c;

	}

	return ghost;

}

// base64url `text`'s bytes, or null if it isn't base64url: through atob (the platform's own), then
// a character at a time into one array, with no function called for each (the Worker does this for
// every time posted, before anything else is checked).
function fromText( text ) {

	if ( text.length % 4 === 1 || ! /^[A-Za-z0-9_-]+$/.test( text ) ) return null;
	let raw;
	try {

		raw = atob( text.replace( /-/g, '+' ).replace( /_/g, '/' ) + '='.repeat( ( 4 - text.length % 4 ) % 4 ) );

	} catch {

		return null;

	}

	const bytes = new Uint8Array( raw.length );
	for ( let i = 0; i < raw.length; i ++ ) bytes[ i ] = raw.charCodeAt( i );
	return bytes;

}

// An angle's change in 1/TURN of a turn, the short way round.
function wrap( steps ) {

	return ( ( steps % TURN ) + TURN + TURN / 2 ) % TURN - TURN / 2;

}

// --- checking one ---

// What's wrong with the ghost `text` (ghostText's) of a run of `ms` with `passes` on `challenge`'s
// route ({ world, kind, route }), as the Worker checks it before a time is taken: '' for nothing.
//   'world': the challenge isn't on one of the worlds (worlds.js), so where its points are in the
//     ghost's frame can't be told, and nothing on it is taken.
//   'form': not a ghost (readGhost's null), sampled at another interval than everyFor( ms ), or
//     more than GHOST_DENSITY bytes a sample on average.
//   'time': not as long as the run (its count isn't countFor( ms )).
//   'start': its first sample (the car at GO) further from the start than START_SLACK across the
//     ground.
//   'speed': further between two samples, across the ground or up or down, than FASTEST goes in
//     the time between them (and SAMPLE_SLACK), other than the game's own jumps (R's few metres on,
//     or back onto the path it drove), and no more of those than a run of its length is let have.
//   'pass': a point not within its radius (and PASS_SLACK, and on a world with a level spheroid
//     what its zone's lean adds) at its pass time, nor at a sample either side of it; a hoop run's
//     missed hoop, not within HOOP_NEAR of it.
// Passes and the time are checkPasses' already (the Worker asks that first). In centimetres and
// their squares, a sample at a time, with nothing made on the way (but, on a world with a level
// spheroid, a few short arrays for the start and each pass): it's the Worker's to do for every time
// posted, within the Free plan's 10 ms of CPU.
export function ghostFault( { world, kind, route }, ms, passes, text ) {

	if ( ! isWorld( world ) ) return 'world';
	const ghost = readGhost( text );
	if ( ! ghost || ghost.every !== everyFor( ms ) ) return 'form';
	if ( ghost.count !== countFor( ms ) ) return 'time';
	// (Its bytes, from its text's length: base64url, 3 bytes in 4 characters.)
	if ( Math.floor( text.length * 3 / 4 ) > HEADER + GHOST_DENSITY * ghost.count ) return 'form';
	const { every, count, east, north, up } = ghost;
	// On a world with a level spheroid, its frame's up leans from the sphere's (level.js), so a point
	// straight over the pin is off it across the ground in that frame (by kilometres in Rheasilvia):
	// the first sample is measured from the pin at its own height (beside's).
	const frame = levelled( world ) ? levelFrame( world, route.start.lat, route.start.lon, 0 ) : null;
	const [ startEast, startNorth ] = frame ? beside( world, frame, route.start.lat, route.start.lon, up[ 0 ] / 100 ) : [ 0, 0 ];
	const [ dx0, dy0 ] = [ east[ 0 ] - startEast * 100, north[ 0 ] - startNorth * 100 ];
	if ( dx0 * dx0 + dy0 * dy0 > ( START_SLACK * 100 ) ** 2 ) return 'start';
	let jumps = 0;
	// (A hoop run's against the plane's course mode: fastestFor.)
	const fastest = fastestFor( kind );
	const allowed = Math.min( JUMPS_MOST, JUMPS + Math.floor( ms / JUMP_EVERY ) );
	for ( let i = 1; i < count; i ++ ) {

		const dx = east[ i ] - east[ i - 1 ];
		const dy = north[ i ] - north[ i - 1 ];
		const dz = up[ i ] - up[ i - 1 ];
		// (Centimetres, as the samples are.)
		const most = ( fastest * ( sampleTime( i, count, every, ms ) - sampleTime( i - 1, count, every, ms ) ) / 1000 + SAMPLE_SLACK ) * 100;
		const across = dx * dx + dy * dy;
		if ( across <= most * most && dz * dz <= most * most ) continue;
		if ( ++ jumps > allowed ) return 'speed';
		const on = most + RESPAWN * 100;
		if ( across > on * on && ! onPath( ghost, i ) ) return 'speed';

	}

	for ( const [ index, at, missed ] of passes ) {

		// (A hoop missed wasn't flown through, but it was flown by: within HOOP_NEAR of it.)
		const reach = missed ? HOOP_NEAR : route.radius;
		const [ lat, lon ] = route.points[ index ];
		const i = Math.min( Math.floor( at / every ), count - 2 );
		const t0 = sampleTime( i, count, every, ms );
		const t1 = sampleTime( i + 1, count, every, ms );
		const u = t1 > t0 ? ( at - t0 ) / ( t1 - t0 ) : 1;
		// (On a world with a level spheroid, the point's at the sample's height in the frame, and the
		// page's zone round it stands along the level up, which leans from the line out from the
		// middle the point is found on by up to `lean` m across the ground a metre up: what that can
		// put a pass the page took past the radius is let off as well.)
		const lean = frame ? leanAt( world, frame, lat, lon ) : 0;
		const slack = frame ? PASS_SLACK + route.radius * ( Math.sqrt( 1 + ( lean * TALL ) ** 2 ) - 1 ) + lean * ZONE_UP : PASS_SLACK;
		const near = ( x, y, z ) => {

			const [ e, n ] = frame ? beside( world, frame, lat, lon, z / 100 ) : localOf( world, route.start, lat, lon, z / 100 );
			return Math.hypot( x / 100 - e, y / 100 - n ) <= reach + slack;

		};
		const lerp = values => values[ i ] + ( values[ i + 1 ] - values[ i ] ) * u;
		if ( near( lerp( east ), lerp( north ), lerp( up ) ) ) continue;
		let found = false;
		for ( let k = Math.max( 0, i - 1 ); k <= Math.min( count - 1, i + 2 ) && ! found; k ++ ) {

			if ( Math.abs( sampleTime( k, count, every, ms ) - at ) <= every ) found = near( east[ k ], north[ k ], up[ k ] );

		}

		if ( ! found ) return 'pass';

	}

	return '';

}

// Where ( lat, lon ) is across the ground in `frame` (level.js's, a ghost's on a world with a level
// spheroid) at `up` (m) in it: [ east, north ] of the point on the line out from the world's middle
// through it that's that high in the frame. Along that line a point's place in the frame changes in
// step with its height over the sphere, so it's found in one go.
function beside( world, frame, lat, lon, up ) {

	const [ e, n, u ] = inFrame( frame, pointOn( world, lat, lon, 0 ) );
	const [ de, dn, du ] = outward( world, frame, lat, lon );
	const height = ( up - u ) / du;
	return [ e + de * height, n + dn * height ];

}

// How far (m) across the ground in `frame` the level up at ( lat, lon ) and the line out from the
// world's middle there part, a metre up: the page's zone round a point stands along the one, and
// beside finds the point along the other.
function leanAt( world, frame, lat, lon ) {

	const [ de, dn, du ] = outward( world, frame, lat, lon );
	const [ le, ln, lu ] = inFrame( { ...frame, origin: [ 0, 0, 0 ] }, levelFrame( world, lat, lon, 0 ).up );
	return Math.hypot( le / lu - de / du, ln / lu - dn / du );

}

// The way straight out from `world`'s middle at ( lat, lon ), in `frame`: [ east, north, up ].
function outward( world, frame, lat, lon ) {

	const [ x, y, z ] = pointOn( world, lat, lon, 0 );
	const r = Math.hypot( x, y, z );
	return inFrame( { ...frame, origin: [ 0, 0, 0 ] }, [ x / r, y / r, z / r ] );

}

// Whether sample `i` of `ghost` is back on the path it drove before the sample ahead of it (within
// BACK of a line between two samples there): where R puts the car when there's no way on, and
// falling off the edge of the world does. Looked for from the most recent back, where it nearly
// always is (a second or so), as far back as the start: after a flight, R puts the car back where
// it took off, however long it flew (drive.js's checkStuck keeps the last place it drove freely
// only on the ground). At most JUMPS_MOST looks of a ghost's samples each (GHOST_SAMPLES), about
// 130,000 lines measured against: well under a millisecond of the Worker's.
function onPath( { east, north }, i ) {

	const [ x, y ] = [ east[ i ], north[ i ] ];
	const reach = BACK * 100;
	for ( let k = i - 2; k >= 1; k -- ) {

		const ax = east[ k - 1 ];
		const ay = north[ k - 1 ];
		const dx = east[ k ] - ax;
		const dy = north[ k ] - ay;
		const length = dx * dx + dy * dy;
		const u = length ? Math.max( 0, Math.min( 1, ( ( x - ax ) * dx + ( y - ay ) * dy ) / length ) ) : 0;
		const ex = ax + dx * u - x;
		const ey = ay + dy * u - y;
		if ( ex * ex + ey * ey <= reach * reach ) return true;

	}

	return false;

}
