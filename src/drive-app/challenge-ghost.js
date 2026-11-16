import { Euler, Group, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { OBJECT_FRAME } from '3d-tiles-renderer';
import { GHOST_BYTES, GHOST_EVERY, GHOST_SAMPLES, TURN, countFor, ghostText, packGhost, readGhost, sampleTime } from './ghost-rules.js';
import { cleanLook } from './paint.js';

// A challenge run's ghost in the page (docs/world-drive.md, "Challenges", "Ghosts"), in the
// challenges' own chunk: recording the run as it's driven (createRecorder), and racing one, drawn
// as a car beside you (createRaceGhost). The packing and the checks are ghost-rules.js's, shared
// with the Worker.
//
// Recording costs nothing a frame but a few numbers written into arrays made once: where the car's
// model is (its pivot) and which way it faces, at each GHOST_EVERY ms of the run's own clock (the
// frames' steps, as the time is), found between the frame before and this one. It's put into the
// ghost's frame (the route's start, ghost-rules.js) and packed only at the finish. A run long enough
// to fill GHOST_SAMPLES drops every other sample and goes on half as often, so it never takes more.
//
// A ghost raced is one model, drawn as the others' ghosts are (ghosts.js's ghostModels: the ride
// and its Garage look, see-through near your car or the camera, nothing in it to hit), in a group
// of its own that nothing casts rays at; replayed on the run's own clock from GO, between its
// samples, which are put into this scene once as the run starts. Each frame it's moved and turned,
// and its name placed over it: no new draws but its own.

// Within this of your car or the camera (m), it's see-through (as ghosts.js's are), and its name
// shows within TAG_RANGE.
const FADE_NEAR = 8;
const TAG_RANGE = 400;
const DEG = MathUtils.DEG2RAD;

const _p = new Vector3();
const _q = new Quaternion();
const _qa = new Quaternion();
const _m = new Matrix4();
const _frame = new Matrix4();
const _e = new Euler( 0, 0, 0, 'YXZ' );
const _s = new Vector3();
const _cam = new Vector3();
const _own = new Vector3();
const _tag = new Vector3();
const _quat = [ 0, 0, 0, 0 ];

// The matrix from this scene to the ghost's frame on `world`: the route's `start` on the globe's
// ellipsoid at height 0 (3d-tiles-renderer's object frame, as main.js centres the scene at a place:
// x west, y up, z north), through the Earth-centred one the globe's `earth` group sits in. Into
// `target`; its inverse goes the other way.
function sceneToStart( globe, start, target ) {

	globe.earth.updateWorldMatrix( true, false );
	globe.ellipsoid.getObjectFrame( start.lat * DEG, start.lon * DEG, 0, 0, 0, 0, _frame, OBJECT_FRAME );
	return target.copy( globe.earth.matrixWorld ).multiply( _frame ).invert();

}

// The run being recorded: start( pivot ) at GO, frame( ms, pivot ) every frame of the run after
// (its clock, ms), finish( ms, pivot ) with the time at the last pass, then pack( globe, start ) for
// what's posted (ghost-rules.js's text), or null if it couldn't be packed.
export function createRecorder() {

	const most = GHOST_SAMPLES + 1;
	// The samples as they were in the scene, and the frame before's.
	const xs = new Float64Array( most );
	const ys = new Float64Array( most );
	const zs = new Float64Array( most );
	const qs = new Float32Array( most * 4 );
	// As packed: centimetres and steps of a turn in the ghost's frame.
	const out = { east: new Int32Array( most ), north: new Int32Array( most ), up: new Int32Array( most ), yaw: new Int32Array( most ), pitch: new Int32Array( most ), roll: new Int32Array( most ) };
	const bytes = new Uint8Array( GHOST_BYTES );
	const before = { p: new Vector3(), q: new Quaternion(), ms: 0 };
	const now = { p: new Vector3(), q: new Quaternion() };
	// How many samples so far (at 0, every, 2 × every...), and the finish's (count: those and it).
	let n = 0;
	let every = GHOST_EVERY;
	let count = 0;

	// Sample `i` as `p` and `q`, or `u` of the way from the frame before to now.
	function put( i, u ) {

		_p.lerpVectors( before.p, now.p, u );
		_q.slerpQuaternions( before.q, now.q, u );
		xs[ i ] = _p.x;
		ys[ i ] = _p.y;
		zs[ i ] = _p.z;
		_q.toArray( qs, i * 4 );

	}

	// Every other sample dropped, and the rest of the run sampled half as often.
	function halve() {

		const kept = Math.ceil( n / 2 );
		for ( let i = 1; i < kept; i ++ ) {

			xs[ i ] = xs[ i * 2 ];
			ys[ i ] = ys[ i * 2 ];
			zs[ i ] = zs[ i * 2 ];
			qs.copyWithin( i * 4, i * 8, i * 8 + 4 );

		}

		n = kept;
		every *= 2;

	}

	// The samples due by `ms` (each GHOST_EVERY, or what it's grown to), found between the frame
	// before and now.
	function catchUp( ms ) {

		while ( n * every <= ms ) {

			if ( n === GHOST_SAMPLES ) {

				halve();
				continue;

			}

			put( n, ms > before.ms ? MathUtils.clamp( ( n * every - before.ms ) / ( ms - before.ms ), 0, 1 ) : 1 );
			n ++;

		}

	}

	function read( pivot ) {

		pivot.getWorldPosition( now.p );
		pivot.getWorldQuaternion( now.q );

	}

	return {
		start( pivot ) {

			[ n, every, count ] = [ 0, GHOST_EVERY, 0 ];
			read( pivot );
			before.p.copy( now.p );
			before.q.copy( now.q );
			before.ms = 0;
			catchUp( 0 );

		},
		frame( ms, pivot ) {

			read( pivot );
			catchUp( ms );
			before.p.copy( now.p );
			before.q.copy( now.q );
			before.ms = ms;

		},
		// The finish, at the last pass's `ms` (this frame's): any samples due by then, and the finish.
		finish( ms, pivot ) {

			read( pivot );
			before.p.copy( now.p );
			before.q.copy( now.q );
			catchUp( ms );
			put( n, 1 );
			count = n + 1;

		},
		// The run as it's posted, in the frame of `start` (the route's) on the world the globe is on.
		pack( globe, start ) {

			if ( ! count ) return null;
			sceneToStart( globe, start, _m );
			_m.decompose( _cam, _q, _s );
			const steps = radians => ( ( Math.round( radians / ( Math.PI * 2 ) * TURN ) % TURN ) + TURN ) % TURN;
			for ( let i = 0; i < count; i ++ ) {

				_p.set( xs[ i ], ys[ i ], zs[ i ] ).applyMatrix4( _m );
				out.east[ i ] = Math.round( - _p.x * 100 );
				out.north[ i ] = Math.round( _p.z * 100 );
				out.up[ i ] = Math.round( _p.y * 100 );
				_e.setFromQuaternion( _qa.fromArray( qs, i * 4 ).premultiply( _q ), 'YXZ' );
				out.yaw[ i ] = steps( _e.y );
				out.pitch[ i ] = steps( _e.x );
				out.roll[ i ] = steps( _e.z );

			}

			const length = packGhost( { every, count, ...out }, bytes );
			return length < 0 ? null : ghostText( bytes, length );

		},
		get count() {

			return count;

		},
		get every() {

			return every;

		},
	};

}

// A ghost to race, in `scene` with `models` (ghosts.js's ghostModels) and its name in `tags` (an
// element over the drive): load( data, vehicle ) with what the Worker keeps of it ({ run, ms,
// passes, vehicle, look, ghost }) and the ride it was driven in (vehicles.js's, or the kart); then
// start( globe, start ) as a run of its challenge starts (into this scene), and update( ms, shown,
// camera, own ) each frame with the run's clock (ms from GO). dispose() when it's done with.
export function createRaceGhost( { scene, models, tags, name } ) {

	const group = new Group();
	group.name = 'challenge-ghost';
	scene.add( group );
	const tag = document.createElement( 'div' );
	tag.className = 'ch-ghost-tag';
	tag.hidden = true;
	tag.textContent = name;
	tags.append( tag );
	let ghost = null;
	let model = null;
	let faded = false;
	let gone = false;
	// Its samples in this scene: positions and turns.
	let places = null;
	let turns = null;

	return {
		// Unpacked, and its model built (a promise of whether it's ready to race).
		async load( data, vehicle ) {

			ghost = readGhost( data.ghost );
			// (Only one as long as the time it's said to be of.)
			if ( ! ghost || ! Number.isSafeInteger( data.ms ) || ghost.count !== countFor( data.ms ) ) return false;
			ghost.ms = data.ms;
			const built = await models.build( vehicle, cleanLook( vehicle, data.look ) );
			if ( gone ) {

				models.dispose( built );
				return false;

			}

			model = built;
			model.pivot.visible = false;
			group.add( model.pivot );
			return true;

		},
		// Its samples into this scene, as a run of its challenge starts at `start`.
		start( globe, start ) {

			if ( ! ghost ) return;
			sceneToStart( globe, start, _m ).invert();
			_m.decompose( _cam, _q, _s );
			const { count, east, north, up, yaw, pitch, roll } = ghost;
			places = new Float64Array( count * 3 );
			turns = new Float32Array( count * 4 );
			const angle = steps => steps / TURN * Math.PI * 2;
			for ( let i = 0; i < count; i ++ ) {

				_p.set( - east[ i ] / 100, up[ i ] / 100, north[ i ] / 100 ).applyMatrix4( _m ).toArray( places, i * 3 );
				_qa.setFromEuler( _e.set( angle( pitch[ i ] ), angle( yaw[ i ] ), angle( roll[ i ] ), 'YXZ' ) ).premultiply( _q ).toArray( turns, i * 4 );

			}

		},
		// Where it is at `ms` of the run (between its samples; at its start before GO, at its finish
		// after), shown or not, see-through near the `camera` or your car (`own`, its pivot).
		update( ms, shown, camera, own ) {

			if ( ! model || ! places ) return;
			const on = shown && ! gone;
			model.pivot.visible = on;
			if ( ! on ) {

				tag.hidden = true;
				return;

			}

			const { count, every } = ghost;
			const at = MathUtils.clamp( ms, 0, ghost.ms );
			const i = Math.min( Math.floor( at / every ), count - 2 );
			const t0 = sampleTime( i, count, every, ghost.ms );
			const t1 = sampleTime( i + 1, count, every, ghost.ms );
			const u = t1 > t0 ? MathUtils.clamp( ( at - t0 ) / ( t1 - t0 ), 0, 1 ) : 1;
			const { pivot } = model;
			pivot.position.set(
				places[ i * 3 ] + ( places[ i * 3 + 3 ] - places[ i * 3 ] ) * u,
				places[ i * 3 + 1 ] + ( places[ i * 3 + 4 ] - places[ i * 3 + 1 ] ) * u,
				places[ i * 3 + 2 ] + ( places[ i * 3 + 5 ] - places[ i * 3 + 2 ] ) * u,
			);
			Quaternion.slerpFlat( _quat, 0, turns, i * 4, turns, i * 4 + 4, u );
			pivot.quaternion.fromArray( _quat );
			camera.getWorldPosition( _cam );
			const distance = pivot.position.distanceTo( _cam );
			const reach = faded ? FADE_NEAR + 2 : FADE_NEAR;
			const near = distance < reach || ( !! own && pivot.position.distanceTo( own.getWorldPosition( _own ) ) < reach );
			if ( near !== faded ) {

				faded = near;
				models.fade( model, near );

			}

			placeTag( distance < TAG_RANGE, camera, model.size.height );

		},
		// For the tests: where it's drawn, whether it is, and see-through.
		get pivot() {

			return model?.pivot ?? null;

		},
		get faded() {

			return faded;

		},
		get ready() {

			return !! model && !! places;

		},
		dispose() {

			gone = true;
			if ( model ) models.dispose( model );
			model = null;
			scene.remove( group );
			tag.remove();

		},
	};

	// Its name over it, on the screen, or hidden (too far, behind the camera, off the edge).
	function placeTag( near, camera, height ) {

		let on = near;
		if ( on ) {

			_tag.copy( model.pivot.position );
			_tag.y += height + 0.4;
			_tag.applyMatrix4( camera.matrixWorldInverse );
			on = _tag.z < 0;
			if ( on ) {

				_tag.applyMatrix4( camera.projectionMatrix );
				on = Math.abs( _tag.x ) < 1.1 && Math.abs( _tag.y ) < 1.1;

			}

		}

		if ( tag.hidden === on ) tag.hidden = ! on;
		if ( on ) tag.style.transform = `translate( ${ ( ( _tag.x + 1 ) / 2 * window.innerWidth ).toFixed( 1 ) }px, ${ ( ( 1 - _tag.y ) / 2 * window.innerHeight ).toFixed( 1 ) }px )`;

	}

}
