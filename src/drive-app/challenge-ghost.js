import { BufferAttribute, BufferGeometry, Euler, Group, MathUtils, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector2, Vector3 } from 'three';
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
// and its Garage look, see-through near your car or the camera, nothing in it to hit, its wheels
// turning and steering), in a group of its own that nothing casts rays at; replayed on the run's
// own clock from GO, between its samples, which are put into this scene once as the run starts.
// Each frame it's moved and turned, and its name placed over it: no new draws but its own. And its
// own are few: the model is made light once for each ride (lighten), its still parts merged into
// one mesh for each of their materials and their vertices into cells of a few centimetres, so the
// pickup, 219,000 triangles in 79 meshes as you drive it, races as a few thousand in a few draws.

// Within this of your car or the camera (m), it's see-through (as ghosts.js's are), and its name
// shows within TAG_RANGE.
const FADE_NEAR = 8;
const TAG_RANGE = 400;
const DEG = MathUtils.DEG2RAD;
// A ghost's model made light (lighten): its still parts' vertices merged within cells of its longest
// side over CELLS (the pickup's 5.4 m: 10 cm), those with their pictures' places within 1/UV_STEPS
// of each other (so a picture's seams stay where they are).
const CELLS = 56;
const UV_STEPS = 64;
// The light parts made, by the ride and which of its meshes went into each (the same ride in the same
// look: the same), kept for the page's life (a few rides' worth).
const lightened = new Map();

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
const _inverse = new Matrix4();
const _uv = new Vector2();
const _forward = new Vector3();

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
	// The run's clock at the frame before (ms), the way it faced then (rad) and its wheels' steer.
	let lastMs = null;
	let lastYaw = null;
	let steer = 0;

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
			lighten( model );
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
			turnWheels( i, t0, t1, ms );
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
		// For the tests: where it's drawn, whether it is, and see-through; and its triangles as drawn.
		get pivot() {

			return model?.pivot ?? null;

		},
		get triangles() {

			let n = 0;
			model?.pivot.traverse( o => {

				if ( o.isMesh && o.geometry ) n += ( o.geometry.index ?? o.geometry.attributes.position ).count / 3;

			} );
			return n;

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

	// Its wheels turned and steered by its ride's own animation (as ghosts.js's are): its speed along
	// the way it faces, from samples `i` and `i + 1` (at t0 and t1 ms), and its steer from how fast
	// it's turning, at the run's clock `ms`.
	function turnWheels( i, t0, t1, ms ) {

		const dt = lastMs === null ? 0 : ( ms - lastMs ) / 1000;
		lastMs = ms;
		const { pivot, animators } = model;
		_forward.set( 0, 0, - 1 ).applyQuaternion( pivot.quaternion );
		const yaw = Math.atan2( - _forward.x, _forward.z );
		const rate = lastYaw === null ? 0 : MathUtils.euclideanModulo( yaw - lastYaw + Math.PI, Math.PI * 2 ) - Math.PI;
		lastYaw = yaw;
		if ( ! animators.length || dt <= 0 ) return;
		const moving = ms > 0 && ms < ghost.ms && t1 > t0;
		const speed = moving ? ( ( places[ i * 3 + 3 ] - places[ i * 3 ] ) * _forward.x + ( places[ i * 3 + 4 ] - places[ i * 3 + 1 ] ) * _forward.y + ( places[ i * 3 + 5 ] - places[ i * 3 + 2 ] ) * _forward.z ) / ( ( t1 - t0 ) / 1000 ) : 0;
		const aim = MathUtils.clamp( rate / dt * 2 / Math.max( 2, Math.abs( speed ) ), - 1, 1 ) * Math.sign( speed || 1 );
		steer += ( aim - steer ) * Math.min( 1, dt * 8 );
		for ( const animate of animators ) animate( { steer, speed, dt, airborne: false, vy: 0, throttle: speed > 1 } );

	}

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

// A ghost's `model` (ghostModels' build) made light to draw, in place: its meshes merged into one
// for each material and painted part on whatever carries them (the model itself, or a part the
// ride's own animation moves, such as a wheel, found by running it once), their vertices merged
// within cells (CELLS) and the triangles left between three cells kept. Decals, the underglow, glass
// and a part moved by itself stay as they were; a skinned mesh is merged as its bones hold it (a
// ride's file's are never moved). Made once for each ride and grouping (lightened), shared by
// every ghost of it after.
function lighten( model ) {

	const { pivot, animators, vehicle } = model;
	pivot.updateMatrixWorld( true );
	const moving = movingParts( pivot, animators );
	const orders = new Map();
	const groups = new Map();
	pivot.traverse( o => {

		orders.set( o, orders.size );
		if ( moving.has( o ) || ! still( o, pivot ) ) return;
		let carrier = o.parent;
		while ( carrier !== pivot && ! moving.has( carrier ) ) carrier = carrier.parent;
		const uv = !! o.geometry.attributes.uv;
		const key = `${ orders.get( carrier ) }|${ o.material.uuid }|${ o.userData.paint ?? '' }|${ uv }`;
		if ( ! groups.has( key ) ) groups.set( key, { carrier, material: o.material, paint: o.userData.paint, uv, meshes: [] } );
		groups.get( key ).meshes.push( o );

	} );
	const size = Math.max( model.size.width, model.size.height, model.size.length );
	for ( const { carrier, material, paint, uv, meshes } of groups.values() ) {

		const key = `${ vehicle.id ?? vehicle.name }|${ orders.get( carrier ) }|${ meshes.map( mesh => orders.get( mesh ) ).join( ',' ) }`;
		let geometry = lightened.get( key );
		if ( ! geometry ) {

			_inverse.copy( carrier.matrixWorld ).invert();
			geometry = merged( meshes, uv, size / CELLS / carrier.getWorldScale( _p ).x );
			geometry.userData.shared = true;
			lightened.set( key, geometry );

		}

		for ( const mesh of meshes ) {

			mesh.removeFromParent();
			if ( ! mesh.geometry.userData.shared && ! mesh.geometry.userData.template ) mesh.geometry.dispose();
			mesh.skeleton?.dispose();

		}

		const part = new Mesh( geometry, material );
		part.name = 'ghost part';
		part.raycast = () => {};
		if ( paint ) part.userData.paint = paint;
		carrier.add( part );

	}

	pivot.updateMatrixWorld( true );

}

// The parts of `pivot` its `animators` move (a ride's wheels, a monster truck's body on its
// springs): run once, driving and steering, with what moved put back as it was.
function movingParts( pivot, animators ) {

	const before = new Map();
	pivot.traverse( o => before.set( o, [ o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.visible ] ) );
	for ( const animate of animators ) animate( { steer: 0.6, speed: 12, dt: 0.1, airborne: false, vy: 0, throttle: true } );
	const moving = new Set();
	for ( const [ o, [ position, quaternion, scale, visible ] ] of before ) {

		if ( o === pivot || ( o.position.equals( position ) && o.quaternion.equals( quaternion ) && o.scale.equals( scale ) && o.visible === visible ) ) continue;
		moving.add( o );
		o.position.copy( position );
		o.quaternion.copy( quaternion );
		o.scale.copy( scale );
		o.visible = visible;

	}

	pivot.updateMatrixWorld( true );
	return moving;

}

// Whether `o` is a mesh lighten can merge: a plain or skinned mesh of one opaque material, not a
// decal (in `pivot`'s decals) nor the underglow.
function still( o, pivot ) {

	if ( ( o.constructor !== Mesh && o.constructor !== SkinnedMesh ) || Array.isArray( o.material ) || ! o.material || o.material.transparent || o.name === 'underglow' ) return false;
	if ( ! o.geometry?.attributes.position || o.geometry.morphAttributes.position ) return false;
	for ( let up = o; up && up !== pivot; up = up.parent ) if ( up.name === 'decals' ) return false;
	return true;

}

// `meshes` as one geometry in the frame of what carries them (_inverse), their vertices merged
// within cells `cell` across (to the cell's middle, as many as fall in it) and, with `uv`, within
// 1/UV_STEPS of each other in their pictures; a triangle whose corners fall in fewer than three cells
// is left out. Its normals made afresh.
function merged( meshes, uv, cell ) {

	const cells = new Map();
	const sums = [];
	const placed = meshes.map( mesh => {

		_m.multiplyMatrices( _inverse, mesh.matrixWorld );
		const position = mesh.geometry.attributes.position;
		const at = new Float64Array( position.count * 3 );
		const into = new Int32Array( position.count );
		const skinned = mesh.isSkinnedMesh && mesh.geometry.attributes.skinIndex ? mesh : null;
		for ( let i = 0; i < position.count; i ++ ) {

			_p.fromBufferAttribute( position, i );
			skinned?.applyBoneTransform( i, _p );
			_p.applyMatrix4( _m ).toArray( at, i * 3 );
			const key = ( ( Math.floor( _p.x / cell ) + 1024 ) * 2048 + Math.floor( _p.y / cell ) + 1024 ) * 2048 + Math.floor( _p.z / cell ) + 1024;
			let slot = cells.get( key );
			if ( slot === undefined ) {

				slot = sums.length / 4;
				cells.set( key, slot );
				sums.push( 0, 0, 0, 0 );

			}

			sums[ slot * 4 ] += _p.x;
			sums[ slot * 4 + 1 ] += _p.y;
			sums[ slot * 4 + 2 ] += _p.z;
			sums[ slot * 4 + 3 ] ++;
			into[ i ] = slot;

		}

		return { mesh, into };

	} );
	const vertices = new Map();
	const positions = [];
	const uvs = [];
	const index = [];
	const corner = [ 0, 0, 0 ];
	for ( const { mesh, into } of placed ) {

		const { attributes, index: drawn } = mesh.geometry;
		const pictured = attributes.uv;
		const ids = new Int32Array( into.length );
		for ( let i = 0; i < into.length; i ++ ) {

			const slot = into[ i ];
			let key = slot;
			if ( uv ) {

				_uv.fromBufferAttribute( pictured, i );
				const u = MathUtils.euclideanModulo( Math.floor( _uv.x * UV_STEPS ), UV_STEPS );
				const v = MathUtils.euclideanModulo( Math.floor( _uv.y * UV_STEPS ), UV_STEPS );
				key = slot * UV_STEPS * UV_STEPS + u * UV_STEPS + v;

			}

			let id = vertices.get( key );
			if ( id === undefined ) {

				id = positions.length / 3;
				vertices.set( key, id );
				const n = sums[ slot * 4 + 3 ];
				positions.push( sums[ slot * 4 ] / n, sums[ slot * 4 + 1 ] / n, sums[ slot * 4 + 2 ] / n );
				if ( uv ) uvs.push( _uv.x, _uv.y );

			}

			ids[ i ] = id;

		}

		const triangles = ( drawn ? drawn.count : into.length ) / 3;
		for ( let t = 0; t < triangles; t ++ ) {

			for ( let k = 0; k < 3; k ++ ) corner[ k ] = ids[ drawn ? drawn.getX( t * 3 + k ) : t * 3 + k ];
			if ( into[ vertexOf( drawn, t, 0 ) ] === into[ vertexOf( drawn, t, 1 ) ] || into[ vertexOf( drawn, t, 1 ) ] === into[ vertexOf( drawn, t, 2 ) ] || into[ vertexOf( drawn, t, 0 ) ] === into[ vertexOf( drawn, t, 2 ) ] ) continue;
			index.push( corner[ 0 ], corner[ 1 ], corner[ 2 ] );

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	if ( uv ) geometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( uvs ), 2 ) );
	geometry.setIndex( new BufferAttribute( positions.length / 3 > 65535 ? new Uint32Array( index ) : new Uint16Array( index ), 1 ) );
	geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	return geometry;

}

// Triangle `t`'s `k`th corner's vertex in a geometry drawn by `index` (or none: in order).
function vertexOf( index, t, k ) {

	return index ? index.getX( t * 3 + k ) : t * 3 + k;

}
