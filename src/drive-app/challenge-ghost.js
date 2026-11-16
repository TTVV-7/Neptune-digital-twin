import { BufferAttribute, BufferGeometry, Euler, Group, MathUtils, Matrix3, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector3 } from 'three';
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
// one mesh for each of their materials and simplified (meshoptimizer's simplifier, loaded with the
// first ghost raced: its own chunk, on neither the first load nor the challenges'), which keeps
// each vertex it keeps as it was (its place, its normal, its place in its picture) and opens no
// holes, so the pickup, 219,000 triangles in 79 meshes as you drive it, races as about 90,000 in 25
// draws, and looks as it does close up. (Merging its vertices into cells of 10 cm instead, as this did
// first, made it 22,000 triangles but smeared its pictures, opened holes and bent its shading.)

// Within this of your car or the camera (m), it's see-through (as ghosts.js's are), and its name
// shows within TAG_RANGE.
const FADE_NEAR = 8;
const TAG_RANGE = 400;
const DEG = MathUtils.DEG2RAD;
// A ghost's model made light (lighten): each merged part simplified toward KEEP of its triangles,
// stopping where a place would move more than ERROR of the part's size (the pickup's body, 5.4 m: 2
// cm, under which a panel's layers stay in their order) or its normals or pictures' places would
// change more than NORMAL_WEIGHT and UV_WEIGHT weigh them (a tyre's tread, finer than the triangles
// left, isn't stretched); so a part with fine detail keeps more. Parts under SIMPLE_FROM triangles
// are only merged.
const KEEP = 0.1;
const ERROR = 0.004;
const NORMAL_WEIGHT = 1;
const UV_WEIGHT = 16;
const SIMPLE_FROM = 300;
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
const _normals = new Matrix3();
const _n = new Vector3();
const _forward = new Vector3();
// meshoptimizer's simplifier, once asked for (a promise of it, or of null where it can't run).
let simplifier = null;

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
			await lighten( model );
			// (Done with while it was made light: dispose() has let it go.)
			if ( gone ) return false;
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
// ride's own animation moves, such as a wheel, found by running it once), each simplified (merged).
// Decals, the underglow, glass and a part moved by itself stay as they were; a skinned mesh is
// merged as its bones hold it (a ride's file's are never moved). Made once for each ride and
// grouping (lightened), shared by every ghost of it after.
async function lighten( model ) {

	const { pivot, animators, vehicle } = model;
	const simplify = await loadSimplifier();
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
	for ( const { carrier, material, paint, uv, meshes } of groups.values() ) {

		const key = `${ vehicle.id ?? vehicle.name }|${ orders.get( carrier ) }|${ meshes.map( mesh => orders.get( mesh ) ).join( ',' ) }`;
		let geometry = lightened.get( key );
		if ( ! geometry ) {

			_inverse.copy( carrier.matrixWorld ).invert();
			geometry = merged( meshes, uv, simplify );
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

// meshoptimizer's simplifier, loaded once (a chunk of its own, about 20 KB gzipped with its
// WebAssembly), or null where it can't be (no WebAssembly, the chunk not loading): then a ghost's
// parts are only merged.
function loadSimplifier() {

	simplifier ??= import( 'meshoptimizer/simplifier' )
		.then( async ( { MeshoptSimplifier } ) => {

			if ( ! MeshoptSimplifier.supported ) return null;
			await MeshoptSimplifier.ready;
			return MeshoptSimplifier;

		} )
		.catch( () => null );
	return simplifier;

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

// `meshes` as one geometry in the frame of what carries them (_inverse): their places, normals and
// (with `uv`) pictures' places as they were, their triangles as drawn (a mirrored mesh's turned the
// right way round, as three.js draws it), simplified with `simplify` (meshoptimizer's, or null for
// none) to about KEEP of them, and only the vertices still used kept.
function merged( meshes, uv, simplify ) {

	let count = 0;
	let corners = 0;
	for ( const { geometry } of meshes ) {

		count += geometry.attributes.position.count;
		corners += ( geometry.index ?? geometry.attributes.position ).count;

	}

	const normaled = meshes.every( mesh => mesh.geometry.attributes.normal );
	const positions = new Float32Array( count * 3 );
	// Each vertex's normal and picture's place, together: what the simplifier weighs besides places.
	const stride = uv ? 5 : 3;
	const attributes = new Float32Array( count * stride );
	const index = new Uint32Array( corners );
	let first = 0;
	let at = 0;
	for ( const mesh of meshes ) {

		_m.multiplyMatrices( _inverse, mesh.matrixWorld );
		_normals.getNormalMatrix( _m );
		const { position, normal, uv: pictured } = mesh.geometry.attributes;
		const skinned = mesh.isSkinnedMesh && mesh.geometry.attributes.skinIndex ? mesh : null;
		for ( let i = 0; i < position.count; i ++ ) {

			const v = first + i;
			_p.fromBufferAttribute( position, i );
			skinned?.applyBoneTransform( i, _p );
			_p.applyMatrix4( _m ).toArray( positions, v * 3 );
			if ( normaled ) _n.fromBufferAttribute( normal, i ).applyMatrix3( _normals ).normalize().toArray( attributes, v * stride );
			if ( uv ) {

				attributes[ v * stride + 3 ] = pictured.getX( i );
				attributes[ v * stride + 4 ] = pictured.getY( i );

			}

		}

		const drawn = mesh.geometry.index;
		const n = ( drawn ?? position ).count;
		// (A mirrored mesh's second and third corners swapped, so its faces face out as three.js draws
		// them.)
		const mirrored = _m.determinant() < 0;
		for ( let k = 0; k < n; k ++ ) {

			const corner = mirrored && k % 3 ? ( k % 3 === 1 ? k + 1 : k - 1 ) : k;
			index[ at + k ] = first + ( drawn ? drawn.getX( corner ) : corner );

		}

		first += position.count;
		at += n;

	}

	let kept = index;
	if ( simplify && corners >= SIMPLE_FROM * 3 ) {

		const weights = [ NORMAL_WEIGHT, NORMAL_WEIGHT, NORMAL_WEIGHT, ...uv ? [ UV_WEIGHT, UV_WEIGHT ] : [] ];
		[ kept ] = simplify.simplifyWithAttributes( index, positions, 3, attributes, stride, normaled ? weights : weights.map( () => 0 ), null, Math.floor( corners * KEEP / 3 ) * 3, ERROR );

	}

	// Only the vertices still used, in the order they're first used.
	const remap = new Int32Array( count ).fill( - 1 );
	let used = 0;
	for ( let k = 0; k < kept.length; k ++ ) if ( remap[ kept[ k ] ] < 0 ) remap[ kept[ k ] ] = used ++;
	const place = new Float32Array( used * 3 );
	const facing = new Float32Array( used * 3 );
	const picture = uv ? new Float32Array( used * 2 ) : null;
	for ( let v = 0; v < count; v ++ ) {

		const to = remap[ v ];
		if ( to < 0 ) continue;
		place.set( positions.subarray( v * 3, v * 3 + 3 ), to * 3 );
		facing.set( attributes.subarray( v * stride, v * stride + 3 ), to * 3 );
		if ( picture ) picture.set( attributes.subarray( v * stride + 3, v * stride + 5 ), to * 2 );

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( place, 3 ) );
	if ( normaled ) geometry.setAttribute( 'normal', new BufferAttribute( facing, 3 ) );
	if ( picture ) geometry.setAttribute( 'uv', new BufferAttribute( picture, 2 ) );
	const drawn = used > 65535 ? new Uint32Array( kept.length ) : new Uint16Array( kept.length );
	for ( let k = 0; k < kept.length; k ++ ) drawn[ k ] = remap[ kept[ k ] ];
	geometry.setIndex( new BufferAttribute( drawn, 1 ) );
	if ( ! normaled ) geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	return geometry;

}
