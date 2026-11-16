import { FASTEST, START_SLACK } from './challenge-rules.js';
import { RADIUS } from './dropin-cells.js';

// A challenge run's ghost (docs/world-drive.md, "Challenges", "Ghosts"): the car's path from GO to
// the finish, sampled every GHOST_EVERY ms of the run's own clock and packed small, posted with the
// time and kept with the best, so the next run can race it. What the page (the challenges' chunk:
// challenges.js records and draws them) and the Worker (worker/drive/challenges.js checks and keeps
// them) share: the packing, where a route's points are in a ghost's frame, and the checks a ghost
// must pass for its time to be taken. Plain data and small functions, no three.js.
//
// A ghost's frame is the route's start (its pin) on the world's ellipsoid, at height 0: east,
// north and up in metres, as the scene's own frame is at a place (x west, y up, z north: the object
// frame 3d-tiles-renderer gives, which main.js recentres the scene on). Each sample is where the
// car's model was then (its pivot, as drawn) and which way it faced (yaw, pitch and roll), in that
// frame: centimetres and 1/TURN of a turn. Samples come at 0, every, 2 × every... ms and the last
// at the run's time itself (the finish), so a ghost of `count` samples is a run of a time it
// agrees with. Packed as a version byte, the interval and the count, then each sample's position as
// its second difference (the change in its step, which along a road is a few centimetres) and its
// angles as their change, each a zigzag varint: about six bytes a sample, so a minute is about 4
// KB. A run longer than GHOST_SAMPLES samples is sampled half as often (and so on), so no ghost is
// longer than that, whatever the run, and its bytes stay under GHOST_BYTES.

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
// Angles in 1/TURN of a turn (0.35°).
export const TURN = 1024;
// What a ghost is let off: a sample this far (m) past what FASTEST covers in its time (its
// rounding to the centimetre, the line between two frames' places); a pass this far past its
// point's radius (the model's middle, which the ghost follows, is off the point the pass is told by
// in the air); and the jumps the game makes: R puts the car RESPAWN m on (and a little more by its
// model's tilt), or back where it drove a moment ago, as falling off the edge of the world does
// (back within BACK of the path it drove). At most JUMPS of them, and one more each JUMP_EVERY ms
// of the run, up to JUMPS_MOST: a driver pressing R now and then.
export const SAMPLE_SLACK = 0.3;
export const PASS_SLACK = 3;
const RESPAWN = 5.5;
const BACK = 4;
const JUMPS = 4;
const JUMP_EVERY = 15000;
const JUMPS_MOST = 32;
// How far (m) a ghost's samples may be from the start across the ground and up and down: no route
// is anywhere near this long, nor ground this high or low.
const REACH = 60000;
const HEIGHT = 20000;
// The Earth's ellipsoid (WGS84, as Google's tiles are on); the Moon is a sphere (moon.js).
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
// frame: up along the ellipsoid's normal there).
export function localOf( world, origin, lat, lon, height = 0 ) {

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

// ( lat, lon, height ) on `world` as a point from its middle (m).
function centred( world, lat, lon, height ) {

	const [ phi, lambda ] = [ lat * RAD, lon * RAD ];
	if ( world === 'moon' ) {

		const r = RADIUS.moon + height;
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

	if ( typeof text !== 'string' || ! text.length || text.length > GHOST_TEXT || ! /^[A-Za-z0-9_-]+$/.test( text ) ) return null;
	let bytes;
	try {

		const raw = atob( text.replace( /-/g, '+' ).replace( /_/g, '/' ) + '='.repeat( ( 4 - text.length % 4 ) % 4 ) );
		bytes = Uint8Array.from( raw, c => c.charCodeAt( 0 ) );

	} catch {

		return null;

	}

	let at = 0;
	let bad = false;
	// At most four bytes a number (28 bits: more than any sample needs).
	const get = () => {

		let n = 0;
		for ( let k = 0; k < 4; k ++ ) {

			if ( at >= bytes.length ) break;
			const byte = bytes[ at ++ ];
			n += ( byte & 127 ) * 128 ** k;
			if ( ! ( byte & 128 ) ) return n % 2 ? - ( n + 1 ) / 2 : n / 2;

		}

		bad = true;
		return 0;

	};
	if ( bytes[ at ++ ] !== GHOST_VERSION ) return null;
	const every = get();
	const count = get();
	if ( bad || ! Number.isInteger( every ) || every < GHOST_EVERY || count < 2 || count > GHOST_SAMPLES + 1 ) return null;
	const ghost = { every, count, east: new Int32Array( count ), north: new Int32Array( count ), up: new Int32Array( count ), yaw: new Int32Array( count ), pitch: new Int32Array( count ), roll: new Int32Array( count ) };
	const places = [ ghost.east, ghost.north, ghost.up ];
	const angles = [ ghost.yaw, ghost.pitch, ghost.roll ];
	const step = [ 0, 0, 0 ];
	const last = [ 0, 0, 0 ];
	const turned = [ 0, 0, 0 ];
	for ( let i = 0; i < count; i ++ ) {

		for ( let k = 0; k < 3; k ++ ) {

			step[ k ] += get();
			last[ k ] += step[ k ];
			if ( Math.abs( last[ k ] ) > ( k === 2 ? HEIGHT : REACH ) * 100 ) return null;
			places[ k ][ i ] = last[ k ];

		}

		for ( let k = 0; k < 3; k ++ ) {

			turned[ k ] = ( ( turned[ k ] + get() ) % TURN + TURN ) % TURN;
			angles[ k ][ i ] = turned[ k ];

		}

		if ( bad ) return null;

	}

	return at === bytes.length ? ghost : null;

}

// An angle's change in 1/TURN of a turn, the short way round.
function wrap( steps ) {

	return ( ( steps % TURN ) + TURN + TURN / 2 ) % TURN - TURN / 2;

}

// --- checking one ---

// What's wrong with the ghost `text` (ghostText's) of a run of `ms` with `passes` on `challenge`'s
// route ({ world, kind, route }), as the Worker checks it before a time is taken: '' for nothing.
//   'form': not a ghost (readGhost's null), or sampled at another interval than everyFor( ms ).
//   'time': not as long as the run (its count isn't countFor( ms )).
//   'start': its first sample (the car at GO) further from the start than START_SLACK.
//   'speed': further between two samples than FASTEST goes in the time between them (and
//     SAMPLE_SLACK), other than the game's own jumps (R's few metres on, or back onto the path it
//     drove), and no more of those than a run of its length is let have.
//   'pass': a point not within its radius (and PASS_SLACK) at its pass time, nor at a sample either
//     side of it.
// Passes and the time are checkPasses' already (the Worker asks that first).
export function ghostFault( { world, route }, ms, passes, text ) {

	const ghost = readGhost( text );
	if ( ! ghost || ghost.every !== everyFor( ms ) ) return 'form';
	if ( ghost.count !== countFor( ms ) ) return 'time';
	const { every, count, east, north, up } = ghost;
	if ( Math.hypot( east[ 0 ], north[ 0 ] ) / 100 > START_SLACK ) return 'start';
	let jumps = 0;
	const allowed = Math.min( JUMPS_MOST, JUMPS + Math.floor( ms / JUMP_EVERY ) );
	for ( let i = 1; i < count; i ++ ) {

		const metres = Math.hypot( east[ i ] - east[ i - 1 ], north[ i ] - north[ i - 1 ] ) / 100;
		const most = FASTEST * ( sampleTime( i, count, every, ms ) - sampleTime( i - 1, count, every, ms ) ) / 1000 + SAMPLE_SLACK;
		if ( metres <= most ) continue;
		if ( ++ jumps > allowed ) return 'speed';
		if ( metres > most + RESPAWN && ! onPath( ghost, i ) ) return 'speed';

	}

	for ( const [ index, at ] of passes ) {

		const [ lat, lon ] = route.points[ index ];
		const i = Math.min( Math.floor( at / every ), count - 2 );
		const t0 = sampleTime( i, count, every, ms );
		const t1 = sampleTime( i + 1, count, every, ms );
		const u = t1 > t0 ? ( at - t0 ) / ( t1 - t0 ) : 1;
		const near = ( x, y, z ) => {

			const [ e, n ] = localOf( world, route.start, lat, lon, z / 100 );
			return Math.hypot( x / 100 - e, y / 100 - n ) <= route.radius + PASS_SLACK;

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

// Whether sample `i` of `ghost` is back on the path it drove before the sample ahead of it (within
// BACK of a line between two samples there): where R puts the car when there's no way on, and
// falling off the edge of the world does.
function onPath( { east, north }, i ) {

	const [ x, y ] = [ east[ i ] / 100, north[ i ] / 100 ];
	for ( let k = 1; k < i - 1; k ++ ) {

		const [ ax, ay, bx, by ] = [ east[ k - 1 ] / 100, north[ k - 1 ] / 100, east[ k ] / 100, north[ k ] / 100 ];
		const [ dx, dy ] = [ bx - ax, by - ay ];
		const length = dx * dx + dy * dy;
		const u = length ? Math.max( 0, Math.min( 1, ( ( x - ax ) * dx + ( y - ay ) * dy ) / length ) ) : 0;
		if ( Math.hypot( ax + dx * u - x, ay + dy * u - y ) <= BACK ) return true;

	}

	return false;

}
