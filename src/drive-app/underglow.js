import {
	AdditiveBlending,
	Box3,
	BufferGeometry,
	DataTexture,
	Float32BufferAttribute,
	LinearFilter,
	LinearMipmapLinearFilter,
	MathUtils,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
} from 'three';
import { FLAGS } from './live-protocol.js';

// The underglow (the Garage's, a look's `glow`, paint.js's GLOWS): a neon glow on the ground under
// a ride and round it. Not a light, which would cost every car a pass over the whole scene: one
// flat mesh in the ride's own frame, just over the ground its wheels stand on, drawn additively with
// a soft picture that's brightest at the edge of its footprint and fades out past it. One draw call,
// whatever the ride, the same on the go-kart, the rides, the cars and the library's trucks, on the
// Earth and the Moon, on the Garage's turntable and under other drivers' ghosts.
//
// Its size is the ride's own: its box in its own frame, sized whenever its look goes on. The mesh is
// nine pieces (the picture's corners round, its middle stretched along the sides), so the glow
// spreads the same distance past a kart as past a bus. Off the ground (a jump held a moment, or
// flying) it fades out, as the ground it lights falls away (liftGlow), and a rainbow one goes round
// the colours as it's drawn.

// How far the glow spreads past the footprint (m): a share of the ride's width, within these.
const SPREAD = 0.45;
const SPREAD_MOST = [ 0.6, 1.4 ];
// Where the brightest edge is in the picture, from its middle (0) to its edge (1): the footprint's
// edge, whose corners are rounded by INNER / ( 1 - INNER ) of the spread.
const INNER = 0.42;
// How high it floats over the ground (m), clear of the ground's bumps under the wheels.
const LIFT = 0.05;
// How bright it is at the footprint's edge, and how fast a rainbow goes round (turns a second).
const STRENGTH = 0.95;
const RAINBOW_SPEED = 0.25;
// Off the ground, it stays this long (s) before fading (so a bump in the road doesn't flicker it),
// then fades out over FADE; back on the ground, it's back this fast (a share a second).
const HOLD = 0.3;
const FADE = 0.6;
const RETURN = 8;

const _box = new Box3();
const _part = new Box3();
const _inverse = new Matrix4();
const _relative = new Matrix4();

// Put a glow of `colour` (a hex, or 'rainbow') under `model`, or none (null), in place of the one
// it had. The model is what's driven, looked at or drawn for someone else (a pivot, the turntable's
// model): its own frame faces -Z, standing on its lowest point.
export function setUnderglow( model, colour ) {

	const old = model.userData.glow;
	// The same again (another part of the look changed): left as it is, faded or not.
	if ( old && old.userData.colour === colour ) return;
	if ( old ) {

		old.removeFromParent();
		old.geometry.dispose();
		old.material.dispose();
		delete model.userData.glow;

	}

	if ( colour === null || colour === undefined ) return;
	const box = localBox( model );
	if ( box.isEmpty() ) return;
	const scale = model.scale.x || 1;
	const mesh = new Mesh( footprint( box, scale ), new MeshBasicMaterial( {
		map: glowPicture(), color: 0x000000, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
	} ) );
	mesh.name = 'underglow';
	mesh.renderOrder = 2;
	mesh.raycast = () => {};
	mesh.userData = { colour, lift: 1, off: 0 };
	mesh.position.y = box.min.y + LIFT / scale;
	// Its colour as it's drawn: the rainbow's of the moment, and as much of it as shows.
	mesh.onBeforeRender = ( renderer, scene, camera, geometry, material ) => {

		const { colour: hex, lift } = mesh.userData;
		if ( hex === 'rainbow' ) material.color.setHSL( performance.now() / 1000 * RAINBOW_SPEED % 1, 1, 0.5 );
		else material.color.setHex( hex );
		material.color.multiplyScalar( STRENGTH * lift );

	};
	model.add( mesh );
	model.userData.glow = mesh;

}

// How much of `model`'s glow shows, eased toward what `flags` (live-protocol.js's FLAGS, as a car
// sends them) say it's doing: all of it on the ground or parked, none sinking in water, and off the
// ground (a jump, flying) the same for HOLD s, then fading out over FADE s. dt: s since the last.
export function liftGlow( model, flags, dt ) {

	const glow = model.userData.glow;
	if ( ! glow ) return;
	const state = glow.userData;
	const down = !! ( flags & ( FLAGS.grounded | FLAGS.paused ) ) && ! ( flags & FLAGS.splash );
	state.off = down ? 0 : state.off + dt;
	if ( down ) state.lift += ( 1 - state.lift ) * Math.min( 1, dt * RETURN );
	else state.lift = Math.min( state.lift, 1 - MathUtils.smoothstep( state.off, HOLD, HOLD + FADE ) );
	glow.visible = state.lift > 0.01;

}

// `model`'s box in its own frame: every mesh in it but its glow (whose box is empty, see footprint)
// and its decals, where they are now. A skinned mesh (the pickup's) has a box of its own, as its
// bones place its points (its geometry's is in the file's packed units), as Box3.setFromObject
// takes it; drive.js has had it made already, measuring the ride, and the Garage and ghosts too.
function localBox( model ) {

	_box.makeEmpty();
	model.updateMatrixWorld( true );
	_inverse.copy( model.matrixWorld ).invert();
	model.traverse( o => {

		if ( ! o.isMesh || o === model.userData.glow || o.parent?.name === 'decals' ) return;
		if ( o.boundingBox !== undefined ) {

			if ( o.boundingBox === null ) o.computeBoundingBox();
			_part.copy( o.boundingBox );

		} else {

			if ( ! o.geometry.boundingBox ) o.geometry.computeBoundingBox();
			_part.copy( o.geometry.boundingBox );

		}

		_relative.multiplyMatrices( _inverse, o.matrixWorld );
		_box.union( _part.applyMatrix4( _relative ) );

	} );
	return _box;

}

// The glow's mesh over a footprint (`box`, in the model's frame, whose scale is `scale`): a grid of
// 4 × 4 points, its corners SPREAD past the footprint's and rounded by the picture, its middle
// pieces the picture's middle stretched. Its own box is left empty, so the ride is measured as it
// was (drive.js's size, the ghosts' and the turntable's) without it.
function footprint( box, scale ) {

	const width = box.max.x - box.min.x;
	const length = box.max.z - box.min.z;
	let spread = MathUtils.clamp( width * SPREAD, ...SPREAD_MOST );
	let round = spread * INNER / ( 1 - INNER );
	// A ride too small for the corners: both smaller.
	const fit = Math.min( 1, width / 2 / round, length / 2 / round );
	spread = spread * fit / scale;
	round = round * fit / scale;
	const xs = [ box.min.x - spread, box.min.x + round, box.max.x - round, box.max.x + spread ];
	const zs = [ box.min.z - spread, box.min.z + round, box.max.z - round, box.max.z + spread ];
	const uvs = [ 0, 0.5, 0.5, 1 ];
	const position = [];
	const uv = [];
	for ( let j = 0; j < 4; j ++ ) for ( let i = 0; i < 4; i ++ ) {

		position.push( xs[ i ], 0, zs[ j ] );
		uv.push( uvs[ i ], uvs[ j ] );

	}

	const index = [];
	for ( let j = 0; j < 3; j ++ ) for ( let i = 0; i < 3; i ++ ) {

		const a = j * 4 + i;
		// Facing up: (a, below it, beside it), then the other half.
		index.push( a, a + 4, a + 1, a + 1, a + 4, a + 5 );

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new Float32BufferAttribute( position, 3 ) );
	geometry.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	geometry.setIndex( index );
	geometry.boundingBox = new Box3();
	return geometry;

}

// The glow's picture, made once: white, its alpha how bright the glow is. Round its middle, out to
// INNER, the footprint (under the ride, mostly hidden), then a bright rim at its edge falling off
// to nothing at the picture's edge; the corners are rounded, as the distance is from the middle.
let picture = null;
function glowPicture() {

	if ( picture ) return picture;
	const size = 64;
	const data = new Uint8Array( size * size * 4 );
	for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

		const d = Math.hypot( ( x + 0.5 ) / size * 2 - 1, ( y + 0.5 ) / size * 2 - 1 );
		let alpha;
		if ( d <= INNER ) alpha = 0.75 + 0.25 * ( d / INNER ) ** 3;
		else {

			const t = Math.min( 1, ( d - INNER ) / ( 1 - INNER ) );
			alpha = ( 1 - t ) ** 1.6 * ( 0.45 + 0.55 * Math.exp( - 5 * t ) );

		}

		const i = ( y * size + x ) * 4;
		data[ i ] = data[ i + 1 ] = data[ i + 2 ] = 255;
		data[ i + 3 ] = Math.round( alpha * 255 );

	}

	picture = new DataTexture( data, size, size );
	picture.magFilter = LinearFilter;
	picture.minFilter = LinearMipmapLinearFilter;
	picture.generateMipmaps = true;
	picture.needsUpdate = true;
	return picture;

}
