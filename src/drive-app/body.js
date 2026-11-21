import {
	BackSide,
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	Color,
	CustomBlending,
	DataTexture,
	EquirectangularReflectionMapping,
	FrontSide,
	Group,
	LinearFilter,
	LinearMipmapLinearFilter,
	MathUtils,
	Matrix4,
	Mesh,
	OneMinusSrcAlphaFactor,
	RedFormat,
	RepeatWrapping,
	ShaderMaterial,
	SphereGeometry,
	SrcAlphaFactor,
	SRGBColorSpace,
	TextureLoader,
	UnsignedByteType,
	Vector3,
	Vector4,
} from 'three';
import { Ellipsoid } from '3d-tiles-renderer';
import { useFastRaycast } from '../raycast.js';
import { createGround } from './body-height.js';
import { moonGround } from './moon-height.js';
import { MOON, WORLDS } from './worlds.js';

// A world made in the page (docs/world-drive.md, "The Moon", "Mars", "Vesta" and "Ceres"): a whole
// world to see from space, pick a spot on and drive, made here rather than streamed. Its shapes are
// NASA's (body-height.js: the real heights at a grid of points, and made-up craters and rolling
// ground below that), its colours a mosaic of photographs of the whole world (drive/public/<world>/
// colour.webp, scripts/make-moon.mjs, make-mars.mjs, make-asteroids.mjs), and what's close by is shaded with fine grit so the ground
// is seen to move under you. What the world is (its size, files and made-up ground) is worlds.js's;
// how it looks (its light, its sky, what hangs in it) is LOOKS's, below.
//
// The ground is a cube of six faces blown up into a sphere, each face a quadtree: a square of 32 × 32
// squares of ground is split into four of half the size where it's near the camera, so it's fine by
// the vehicle (a point every 1.3 m) and coarse far off, down to six squares for the whole world from
// space. Each square is a plain mesh with its own little bounding volume hierarchy (raycast.js), so
// the Driver, Ground and the globe's taps hit it as they hit Google's tiles; its corners are in the
// world's frame (`group`, recentred by main.js as the Earth is, so the place being driven is at the
// origin), each square's points kept round its own middle so they're precise to the millimetre.
// Squares are only in `terrain` (what's raycast) while they're drawn: three.js's raycasts don't look
// at `visible`, and the coarse square under four fine ones would otherwise be hit too. Where a fine
// square meets a coarse one their edges needn't agree: each square has a skirt hanging down from its
// edges that fills the gap.

// How each world looks, here in the page (the Worker needs none of it).
// - horizon: how much lower (m) than under the camera ground may be all the way to a square for
//   the square to count as surely over the horizon (more for a world with deep canyons).
// - shade: the ground's light: the sun's, the light from all round where the sun doesn't reach (from
//   the Earth on the Moon, from the dusty sky on Mars, a little starlight and light off the hills on
//   Vesta and Ceres) as [ r, g, b ], and the share of Lommel-Seeliger's light (how bare dust scatters
//   it: a full Moon's edge as bright as its middle); and `tint`, [ r, g, b ] times the picture's
//   colours (the Viking mosaic's Mars is pinker and bluer than the butterscotch ground the rovers
//   see; Dawn's pictures of Vesta and Ceres are grey and evened out alike, to the Moon's picture's
//   spread, so the tint is what makes Vesta's pale rock a little brighter than the Moon's and
//   Ceres's dark ground darker).
// - haze: on a world with air, how far off (m) its dust hides half of what's there, and its colour,
//   seen from the ground (none from high up); null for none.
// - sky: on a world with air, its sky's colours, overhead and at the horizon, round the sun, and the
//   heights over the ground (m) it fades to space between; null for none (the stars, day and night).
// - sun: where the sun is while dropping in and driving: [ east, north, up ], fixed in the scene,
//   low enough that every rim and rock has its light and its shade.
// - lights: the vehicles' light, the sun's and the sky's ([ sky, ground ] colours, or null to keep
//   the Earth's).
// - air: the glow round the world seen from space (the globe's), its colour and how far it reaches
//   (a share of the radius); null for none.
// - dust: the colour of the dust a landing throws up (drive-fx.js).
// - inSky: what hangs in its sky: 'earth' (the Moon's, over the near side) or 'phobos' (Mars's
//   nearer moon), or null.
export const LOOKS = {
	moon: {
		horizon: 150,
		shade: { sun: 2.2, ambient: [ 0.035, 0.035, 0.035 ], lommel: 0.15 },
		haze: null,
		sky: null,
		sun: [ - 0.7, - 0.62, 0.34 ],
		lights: { sun: 3, sky: 0.3, colours: null },
		air: null,
		dust: 0xcfc8bc,
		inSky: 'earth',
	},
	mars: {
		horizon: 400,
		shade: { sun: 2.0, ambient: [ 0.2, 0.135, 0.085 ], lommel: 0.05, tint: [ 1.08, 0.97, 0.78 ] },
		haze: { half: 30000, colour: 0xc7a07a },
		sky: { overhead: 0x8c6a52, horizon: 0xd6b28c, sun: 0xe6ddd0, below: [ 8000, 70000 ] },
		sun: [ - 0.66, - 0.5, 0.56 ],
		lights: { sun: 2.6, sky: 0.75, colours: [ 0xe0b48a, 0x6e4430 ] },
		air: { colour: [ 0.86, 0.6, 0.42 ], reach: 0.012 },
		dust: 0xb87a55,
		inSky: 'phobos',
	},
	// The asteroids: no air, so the stars day and night, and a sun smaller and dimmer than ours (2.4
	// and 2.8 times as far off), kept near the Moon's here so the ground can be seen. Their
	// horizons are close and their relief huge for their size (Vesta's ground is 50 km under its
	// sphere in Rheasilvia and 30 km over it), so a square is only surely over the horizon if it's
	// kilometres lower than the ground under the camera all the way.
	vesta: {
		horizon: 3000,
		shade: { sun: 2.2, ambient: [ 0.03, 0.03, 0.03 ], lommel: 0.15, tint: [ 1.06, 1.03, 0.97 ] },
		haze: null,
		sky: null,
		sun: [ - 0.62, - 0.66, 0.42 ],
		lights: { sun: 2.6, sky: 0.2, colours: null },
		air: null,
		dust: 0xb4ab9c,
		inSky: null,
	},
	ceres: {
		horizon: 2000,
		shade: { sun: 2.2, ambient: [ 0.025, 0.025, 0.025 ], lommel: 0.12, tint: [ 0.6, 0.6, 0.62 ] },
		haze: null,
		sky: null,
		sun: [ - 0.72, - 0.55, 0.42 ],
		lights: { sun: 2.6, sky: 0.2, colours: null },
		air: null,
		dust: 0x5f5d59,
		inSky: null,
	},
};

export const MOON_ELLIPSOID = new Ellipsoid( WORLDS.moon.radius, WORLDS.moon.radius, WORLDS.moon.radius );
export const MOON_RADIUS = WORLDS.moon.radius;

// Squares across each square of ground.
const SEGMENTS = 32;
// The finest squares' points are about this far apart (m).
const FINEST = 1.3;
// A square is split when the camera is nearer its middle than SPLIT times its size, and joined up
// again past JOIN times (a little further, so it doesn't flicker between the two): a point every 1.3
// to 2.6 m 100 m off, every 13 to 26 m a kilometre off. About 14 squares of each size are drawn
// round the camera. Not split when it's surely over the horizon, even for ground the look's
// `horizon` m lower than under the camera all the way (it's still drawn, only coarser).
const SPLIT = 1.2;
const JOIN = 1.4;
// Building squares: this long (ms) a frame at most, more while the loading screen is up.
const BUDGET = 5;
const RUSH = 40;
// The grit close by: a tile of it this many metres across, and a coarser one (each dividing REPEAT,
// below, so neighbouring squares' grit meets); they fade out by this distance (m).
const GRIT = 4;
const GRAVEL = 32;
const GRIT_FAR = 220;
// The Earth in the Moon's sky, over the middle of the near side (0° N 0° E, which always faces it):
// 1.9° across as it really is, drawn at 2.5°, as big as it looks to someone standing there (a body
// low in the sky looks bigger than it is, as the Moon does from the Earth).
const EARTH_ACROSS = 2.5 * MathUtils.DEG2RAD;
// Phobos in Mars's sky: 0.21° across overhead (22 km across, 6,000 km up), drawn at 0.32°; it's
// where PHOBOS_AT says in the scene (as the sun is, fixed), lit by the same sun, and only where it
// can be seen at all (it orbits over Mars's equator so low that from past 69° of latitude it's
// always under the horizon).
const PHOBOS_ACROSS = 0.32 * MathUtils.DEG2RAD;
const PHOBOS_AT = [ 0.62, 0.55, 0.56 ];
const PHOBOS_LATITUDE = 69;

const _cam = new Vector3();
const _inverse = new Matrix4();
const _a = new Vector3();
const _sun = new Vector3();

// The stars and the grit: made the first time a world needs them (the stars are a picture of 4096 ×
// 2048, 32 MB, which nobody staying on the Earth should pay for), then shared by every world.
let stars = null;
let grit = null;

// `id`: a world made in the page, one of worlds.js's but the Earth.
export function createBody( id ) {

	const world = WORLDS[ id ];
	const look = LOOKS[ id ];
	const ground = id === MOON ? moonGround : createGround( world );
	const { radius: RADIUS } = world;
	// A face of the cube spans this far (m) along the surface; squares are split this deep at most,
	// for a point every FINEST m or so (the Moon's 16 splits, 41.6 m squares; Mars's 17). A world far
	// from round (one with a `level`) has ground well out past its sphere (Vesta's equator is 22 km
	// out), where its squares are that much bigger: it's split until its points are no more than a
	// quarter more than FINEST apart even there (Vesta's 14 splits, a point every 0.85 m at its
	// equator: 13 would be every 1.7 m; Ceres's 14, every 1.44 m).
	const FACE = RADIUS * Math.PI / 2;
	const DEEPEST = world.level
		? Math.ceil( Math.log2( world.level[ 0 ] * Math.PI / 2 / SEGMENTS / ( FINEST * 1.25 ) ) )
		: Math.round( Math.log2( FACE / SEGMENTS / FINEST ) );
	// (lumpy: its relief is a good share of its radius, so a square's bounds are measured once it's
	// built, see squareOf.)
	const space = { id, radius: RADIUS, face: FACE, ground, top: RADIUS + world.highest, look, lumpy: !! world.level };

	const group = new Group();
	group.name = id;
	const terrain = new Group();
	terrain.name = `${ id }-terrain`;
	group.add( terrain );
	const material = makeMaterial( look );
	const roots = Array.from( { length: 6 }, ( _, face ) => new Node( space, face, 0, - 1, - 1, 2 ) );
	const drawn = new Set();
	let loading = null;
	let ready = false;
	let pending = 0;
	let progress = 1;
	let rush = false;

	// What hangs in its sky: the Earth over the Moon's near side, Phobos over Mars.
	const inSky = look.inSky === 'earth' ? makeEarth() : look.inSky === 'phobos' ? makePhobos() : null;
	if ( inSky ) inSky.visible = false;
	// Its own sky, round the camera, over the stars (null for a world with no air).
	const sky = look.sky ? makeSky( look.sky ) : null;
	if ( sky ) sky.visible = false;

	// Fetch the heights and the picture (once). Resolves when the world can be shown.
	function load() {

		loading ??= Promise.all( [
			fetch( world.heights.url ).then( response => response.ok ? response.arrayBuffer() : Promise.reject( new Error( `${ world.the }'s heights didn't load (${ response.status })` ) ) ),
			// (An image that doesn't load rejects with its error event, which says nothing.)
			new TextureLoader().loadAsync( world.picture ).catch( () => Promise.reject( new Error( `${ world.the }'s picture didn't load` ) ) ),
		] ).then( ( [ buffer, picture ] ) => {

			ground.setHeights( new Int16Array( buffer ) );
			picture.colorSpace = SRGBColorSpace;
			picture.anisotropy = 4;
			material.uniforms.picture.value = picture;
			material.uniforms.grit.value = grit ??= gritTexture();
			stars ??= starTexture();
			for ( const root of roots ) build( root );
			ready = true;

		} ).catch( err => {

			loading = null;
			throw err;

		} );
		return loading;

	}

	// Let go of every square but the six roots (what's built near where it was driven): for a world
	// left for another, which builds again from those when it's back.
	function release() {

		for ( const root of roots ) if ( root.children ) root.join();
		for ( const mesh of drawn ) terrain.remove( mesh );
		drawn.clear();

	}

	// Split and join squares for where the camera is (and `focus`, a point in the scene that must be
	// sharp: the vehicle), build a few, and put just the drawn ones in `terrain`.
	function update( camera, focus = null ) {

		if ( ! ready || ! group.visible ) return;
		group.updateMatrixWorld();
		_inverse.copy( group.matrixWorld ).invert();
		camera.getWorldPosition( _cam ).applyMatrix4( _inverse );
		const near = focus ? _a.copy( focus ).applyMatrix4( _inverse ) : null;
		const queue = [];
		const want = new Set();
		// The sphere nothing can be seen through: the ground under the camera, less the look's horizon.
		const length = _cam.length();
		const below = RADIUS + ground.groundAt( _cam.x / length, _cam.y / length, _cam.z / length, 50, _ground ).height - look.horizon;
		const horizon = { radius: below, reach: Math.sqrt( Math.max( 0, length * length - below * below ) ) };
		for ( const root of roots ) visit( root, _cam, near, queue, want, horizon );

		// The most wanted first: big squares before small, near before far.
		queue.sort( ( a, b ) => a.urgency - b.urgency );
		const start = performance.now();
		const budget = rush ? RUSH : BUDGET;
		let built = 0;
		for ( const node of queue ) {

			if ( built > 0 && performance.now() - start > budget ) break;
			build( node );
			built ++;

		}

		// Anything wanted this frame means more is to come: children are only looked into once all
		// four are built, so the squares come down a size a frame, and a frame that built all it
		// queued isn't one with nothing left to do.
		pending = queue.length;
		progress = want.size / ( want.size + pending );
		for ( const mesh of drawn ) {

			if ( want.has( mesh ) ) continue;
			terrain.remove( mesh );
			drawn.delete( mesh );

		}

		for ( const mesh of want ) {

			if ( drawn.has( mesh ) ) continue;
			terrain.add( mesh );
			drawn.add( mesh );

		}

		terrain.updateMatrixWorld();

	}

	// Into `node`: split or join it, queue what's missing, and say which meshes to draw.
	function visit( node, camera, focus, queue, want, horizon ) {

		const distance = Math.min( node.centre.distanceTo( camera ), focus ? node.centre.distanceTo( focus ) : Infinity );
		const size = FACE / 2 ** node.level;
		const hidden = node.hiddenFrom( camera, horizon );
		if ( node.children && ( distance > JOIN * size || hidden ) ) node.join();
		else if ( ! node.children && node.level < DEEPEST && distance < SPLIT * size && ! hidden ) node.split();

		if ( node.children ) {

			const missing = node.children.filter( child => ! child.mesh );
			for ( const child of missing ) {

				child.urgency = child.level * 1e7 + distance;
				queue.push( child );

			}

			if ( missing.length === 0 ) {

				for ( const child of node.children ) visit( child, camera, focus, queue, want, horizon );
				return;

			}

		}

		if ( node.mesh ) want.add( node.mesh );

	}

	function build( node ) {

		node.mesh = new Mesh( squareOf( node ), material );
		node.mesh.position.copy( node.centre );
		node.mesh.matrixAutoUpdate = false;
		node.mesh.updateMatrix();
		node.mesh.name = `${ id }-${ node.face }-${ node.level }`;
		useFastRaycast( node.mesh );

	}

	const ellipsoid = id === MOON ? MOON_ELLIPSOID : new Ellipsoid( RADIUS, RADIUS, RADIUS );

	return {
		id,
		world,
		look,
		group,
		terrain,
		// What hangs in its sky (the Earth over the Moon, Phobos over Mars), and its own sky (Mars's):
		// each null for none.
		inSky,
		// (The Moon's Earth by its old name.)
		earth: look.inSky === 'earth' ? inSky : null,
		sky,
		ellipsoid,
		radius: RADIUS,
		material,
		load,
		release,
		update,
		get ready() {

			return ready;

		},
		// Squares wanted this frame (0 once the ground is as fine as it's going to be), and how much of
		// what's wanted is drawn (0 to 1).
		get pending() {

			return pending;

		},
		get progress() {

			return progress;

		},
		// The stars all round, in the world's frame (main.js turns them with it); null until loaded.
		get stars() {

			return stars;

		},
		// While the loading screen is up, build squares faster.
		set rush( on ) {

			rush = on;

		},
		// The measured heights as they loaded ({ data, columns, rows, step }: body-height.js's
		// heightsTable), or null before: what the data lens (lens.js) paints.
		heights() {

			return ground.heightsTable();

		},
		// Metres over its sphere at latitude and longitude (degrees), all the detail in.
		heightAt( lat, lon ) {

			return ground.hasHeights() ? ground.heightAt( lat, lon ) : null;

		},
		// The sun's direction (in the scene, toward the sun), on the ground and what hangs in the sky.
		setSun( direction ) {

			material.uniforms.sun.value.copy( direction ).normalize();
			if ( inSky ) inSky.material.uniforms.sun.value.copy( direction ).normalize();
			if ( sky ) sky.material.uniforms.sun.value.copy( direction ).normalize();

		},
		// What hangs in the sky, drawn `distance` m from the camera in its direction, its size as it
		// looks from the ground: the Earth over the Moon's near side (along its frame's X, 0° N 0° E);
		// Phobos where PHOBOS_AT says in the scene (as the sun is, fixed), unless the place driven
		// (`lat`, degrees) is too far north or south to see it.
		placeInSky( camera, distance, lat = 0 ) {

			if ( ! inSky ) return;
			if ( look.inSky === 'earth' ) {

				group.updateMatrixWorld();
				_sun.set( 1, 0, 0 ).transformDirection( group.matrixWorld );
				inSky.scale.setScalar( distance * Math.tan( EARTH_ACROSS / 2 ) );

			} else {

				inSky.visible = Math.abs( lat ) < PHOBOS_LATITUDE;
				// (The scene's frame: [ - east, up, north ].)
				_sun.set( - PHOBOS_AT[ 0 ], PHOBOS_AT[ 2 ], PHOBOS_AT[ 1 ] ).normalize();
				inSky.scale.setScalar( distance * Math.tan( PHOBOS_ACROSS / 2 ) );

			}

			camera.getWorldPosition( inSky.position ).addScaledVector( _sun, distance );
			inSky.updateMatrixWorld();

		},
		// (The Moon's Earth by its old name.)
		placeEarth( camera, distance ) {

			this.placeInSky( camera, distance );

		},
		// Its sky round the camera, `up` the scene's up there (a unit vector), as much of it as `day`
		// (0 to 1: none from space, all of it by the ground), and how much of its haze the ground has
		// (the same, from the camera's height).
		placeSky( camera, up, day ) {

			if ( look.haze ) material.uniforms.haze.value.w = day;
			if ( ! sky ) return;
			sky.visible = day > 0;
			camera.getWorldPosition( sky.position );
			sky.scale.setScalar( camera.far * 0.9 );
			sky.material.uniforms.up.value.copy( up );
			sky.material.uniforms.day.value = day;
			sky.updateMatrixWorld();

		},
		// How many squares are drawn now, and built in all (for the tests).
		stats() {

			let built = 0;
			const count = node => {

				if ( node.mesh ) built ++;
				node.children?.forEach( count );

			};

			roots.forEach( count );
			const levels = {};
			for ( const mesh of drawn ) {

				const level = mesh.name.split( '-' )[ 2 ];
				levels[ level ] = ( levels[ level ] ?? 0 ) + 1;

			}

			return { drawn: drawn.size, built, levels };

		},
	};

}

// A square of ground: on cube face `face` (0 to 5: +X, -X, +Y, -Y, +Z, -Z), `level` splits deep,
// from ( a, b ) across `size` in the face's own coordinates (-1 to 1 each way).
class Node {

	// `space`: its world's { radius, face, ground, top, lumpy }, as createBody has them.
	constructor( space, face, level, a, b, size ) {

		this.space = space;
		this.face = face;
		this.level = level;
		this.a = a;
		this.b = b;
		this.size = size;
		this.children = null;
		this.mesh = null;
		this.urgency = 0;
		// Its middle on the ground (m, in the world's frame) and how far its corners are from it: from
		// the heights without craters until it's built, then exactly.
		const { radius, face: across, ground } = space;
		const middle = direction( face, a + size / 2, b + size / 2, new Vector3() );
		this.centre = middle.clone().multiplyScalar( radius + ( ground.hasHeights() ? ground.heightAt( lat( middle ), lon( middle ), across / 2 ** level / SEGMENTS ) : 0 ) );
		// Half the diagonal (on a lumpy world, how far its furthest point is from its middle once it's
		// built), and how far from the world's middle its highest ground is: the whole world's highest
		// until it's built (then exactly, its squares' no higher than it).
		const corner = direction( face, a, b, new Vector3() ).multiplyScalar( radius );
		this.radius = corner.distanceTo( middle.multiplyScalar( radius ) );
		this.top = space.top;

	}

	// Whether the square is surely over the horizon from `point` (in the world's frame): further off
	// than the camera's horizon on the sphere horizon.radius plus its own highest ground's.
	hiddenFrom( point, horizon ) {

		const { top } = this;
		const own = Math.sqrt( Math.max( 0, top * top - horizon.radius * horizon.radius ) );
		return point.distanceTo( this.centre ) - this.radius > horizon.reach + own;

	}

	split() {

		const half = this.size / 2;
		const level = this.level + 1;
		this.children = [
			new Node( this.space, this.face, level, this.a, this.b, half ),
			new Node( this.space, this.face, level, this.a + half, this.b, half ),
			new Node( this.space, this.face, level, this.a, this.b + half, half ),
			new Node( this.space, this.face, level, this.a + half, this.b + half, half ),
		];
		// (Their ground is no higher than this square's, give or take the detail they add.)
		for ( const child of this.children ) child.top = this.top + this.space.face / 2 ** level / SEGMENTS;

	}

	join() {

		for ( const child of this.children ) child.dispose();
		this.children = null;

	}

	dispose() {

		this.children?.forEach( child => child.dispose() );
		this.children = null;
		if ( this.mesh ) {

			this.mesh.removeFromParent();
			this.mesh.geometry.boundsTree = null;
			this.mesh.geometry.dispose();
			this.mesh = null;

		}

	}

}

// The unit direction to ( a, b ) on cube face `face`: the cube point at the tangent of each (an
// equal-angle cube, so squares are nearly the same size all over a face), made unit length.
const FACES = [
	[ [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ],
	[ [ - 1, 0, 0 ], [ 0, 0, 1 ], [ 0, 1, 0 ] ],
	[ [ 0, 1, 0 ], [ 0, 0, 1 ], [ 1, 0, 0 ] ],
	[ [ 0, - 1, 0 ], [ 1, 0, 0 ], [ 0, 0, 1 ] ],
	[ [ 0, 0, 1 ], [ 1, 0, 0 ], [ 0, 1, 0 ] ],
	[ [ 0, 0, - 1 ], [ 0, 1, 0 ], [ 1, 0, 0 ] ],
];

function direction( face, a, b, target ) {

	const [ n, u, v ] = FACES[ face ];
	const ta = Math.tan( a * Math.PI / 4 );
	const tb = Math.tan( b * Math.PI / 4 );
	return target.set( n[ 0 ] + u[ 0 ] * ta + v[ 0 ] * tb, n[ 1 ] + u[ 1 ] * ta + v[ 1 ] * tb, n[ 2 ] + u[ 2 ] * ta + v[ 2 ] * tb ).normalize();

}

const lat = d => Math.asin( MathUtils.clamp( d.z, - 1, 1 ) ) * MathUtils.RAD2DEG;
const lon = d => Math.atan2( d.y, d.x ) * MathUtils.RAD2DEG;

// The grid of a square, with a ring of points round it for its edges' normals: ( SEGMENTS + 3 )²
// directions and heights, then the mesh's (SEGMENTS + 1)² points, each relative to the square's
// middle, and a skirt round the edge.
const RING = SEGMENTS + 3;
const POINTS = ( SEGMENTS + 1 ) ** 2;
const SKIRT = 4 * ( SEGMENTS + 1 );
const _dir = new Vector3();
const _ground = { height: 0, shade: 1 };
const _grid = new Float64Array( RING * RING * 3 );
const _dirs = new Float64Array( RING * RING * 3 );
const _shade = new Float32Array( RING * RING );
const INDEX = makeIndex();
// The grit's tiles repeat every so many metres; each square's grit is measured from a corner of
// that grid, so neighbours' grit meets.
const REPEAT = 512;

function squareOf( node ) {

	const { space, face, level, a, b, size, centre } = node;
	const { radius, ground } = space;
	const spacing = space.face / 2 ** level / SEGMENTS;
	const step = size / SEGMENTS;
	for ( let j = 0; j < RING; j ++ ) {

		for ( let i = 0; i < RING; i ++ ) {

			direction( face, a + ( i - 1 ) * step, b + ( j - 1 ) * step, _dir );
			ground.groundAt( _dir.x, _dir.y, _dir.z, spacing, _ground );
			const r = radius + _ground.height;
			const k = j * RING + i;
			_dirs[ k * 3 ] = _dir.x;
			_dirs[ k * 3 + 1 ] = _dir.y;
			_dirs[ k * 3 + 2 ] = _dir.z;
			_grid[ k * 3 ] = _dir.x * r;
			_grid[ k * 3 + 1 ] = _dir.y * r;
			_grid[ k * 3 + 2 ] = _dir.z * r;
			_shade[ k ] = _ground.shade;

		}

	}

	// The middle, exactly on the ground now, and how far out the highest ground is.
	const m = ( ( SEGMENTS / 2 + 1 ) * RING + SEGMENTS / 2 + 1 ) * 3;
	centre.set( _grid[ m ], _grid[ m + 1 ], _grid[ m + 2 ] );
	let top = 0;
	for ( let k = 0; k < RING * RING; k ++ ) top = Math.max( top, Math.hypot( _grid[ k * 3 ], _grid[ k * 3 + 1 ], _grid[ k * 3 + 2 ] ) );
	node.top = top;
	// On a lumpy world a coarse square's ground can be tens of kilometres higher or lower than its
	// middle (Rheasilvia's wall), which the half diagonal on the sphere doesn't reach: its bounds are
	// how far its furthest point really is (never less), so it's never taken for over the horizon
	// while some of it can still be seen. (The Moon's and Mars's stay the half diagonal.)
	if ( space.lumpy ) {

		let reach = node.radius;
		for ( let k = 0; k < RING * RING; k ++ ) reach = Math.max( reach, Math.hypot( _grid[ k * 3 ] - centre.x, _grid[ k * 3 + 1 ] - centre.y, _grid[ k * 3 + 2 ] - centre.z ) );
		node.radius = reach;

	}
	const ox = Math.round( centre.x / REPEAT ) * REPEAT;
	const oy = Math.round( centre.y / REPEAT ) * REPEAT;
	const oz = Math.round( centre.z / REPEAT ) * REPEAT;

	const count = POINTS + SKIRT;
	const position = new Float32Array( count * 3 );
	const normal = new Float32Array( count * 3 );
	const dir = new Float32Array( count * 3 );
	const grit = new Float32Array( count * 3 );
	const shade = new Float32Array( count );
	const skirt = spacing * 3 + 2;
	let p = 0;
	normals();
	const put = ( k, drop ) => {

		const nx = _normals[ k * 3 ];
		const ny = _normals[ k * 3 + 1 ];
		const nz = _normals[ k * 3 + 2 ];
		const x = _grid[ k * 3 ] - _dirs[ k * 3 ] * drop;
		const y = _grid[ k * 3 + 1 ] - _dirs[ k * 3 + 1 ] * drop;
		const z = _grid[ k * 3 + 2 ] - _dirs[ k * 3 + 2 ] * drop;
		position[ p * 3 ] = x - centre.x;
		position[ p * 3 + 1 ] = y - centre.y;
		position[ p * 3 + 2 ] = z - centre.z;
		normal[ p * 3 ] = nx;
		normal[ p * 3 + 1 ] = ny;
		normal[ p * 3 + 2 ] = nz;
		dir[ p * 3 ] = _dirs[ k * 3 ];
		dir[ p * 3 + 1 ] = _dirs[ k * 3 + 1 ];
		dir[ p * 3 + 2 ] = _dirs[ k * 3 + 2 ];
		grit[ p * 3 ] = x - ox;
		grit[ p * 3 + 1 ] = y - oy;
		grit[ p * 3 + 2 ] = z - oz;
		shade[ p ] = _shade[ k ];
		p ++;

	};

	for ( let j = 0; j <= SEGMENTS; j ++ ) for ( let i = 0; i <= SEGMENTS; i ++ ) put( ( j + 1 ) * RING + i + 1, 0 );
	// The skirt: the edge again, hanging down. Along j = 0, i = SEGMENTS, j = SEGMENTS, i = 0.
	for ( let i = 0; i <= SEGMENTS; i ++ ) put( 1 * RING + i + 1, skirt );
	for ( let j = 0; j <= SEGMENTS; j ++ ) put( ( j + 1 ) * RING + SEGMENTS + 1, skirt );
	for ( let i = 0; i <= SEGMENTS; i ++ ) put( ( SEGMENTS + 1 ) * RING + i + 1, skirt );
	for ( let j = 0; j <= SEGMENTS; j ++ ) put( ( j + 1 ) * RING + 1, skirt );

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( position, 3 ) );
	geometry.setAttribute( 'normal', new BufferAttribute( normal, 3 ) );
	geometry.setAttribute( 'worldDir', new BufferAttribute( dir, 3 ) );
	geometry.setAttribute( 'grit', new BufferAttribute( grit, 3 ) );
	geometry.setAttribute( 'shade', new BufferAttribute( shade, 1 ) );
	// Its own copy: building the bounding volume hierarchy reorders it.
	geometry.setIndex( new BufferAttribute( INDEX.slice(), 1 ) );
	geometry.computeBoundingSphere();
	return geometry;

}

// The normals of the grid's points (not the ring round it), from their neighbours either way.
const _normals = new Float32Array( RING * RING * 3 );
function normals() {

	for ( let j = 1; j < RING - 1; j ++ ) {

		for ( let i = 1; i < RING - 1; i ++ ) {

			const left = ( j * RING + i - 1 ) * 3;
			const right = ( j * RING + i + 1 ) * 3;
			const down = ( ( j - 1 ) * RING + i ) * 3;
			const up = ( ( j + 1 ) * RING + i ) * 3;
			const ux = _grid[ right ] - _grid[ left ];
			const uy = _grid[ right + 1 ] - _grid[ left + 1 ];
			const uz = _grid[ right + 2 ] - _grid[ left + 2 ];
			const vx = _grid[ up ] - _grid[ down ];
			const vy = _grid[ up + 1 ] - _grid[ down + 1 ];
			const vz = _grid[ up + 2 ] - _grid[ down + 2 ];
			const x = uy * vz - uz * vy;
			const y = uz * vx - ux * vz;
			const z = ux * vy - uy * vx;
			const length = Math.sqrt( x * x + y * y + z * z ) || 1;
			const k = ( j * RING + i ) * 3;
			_normals[ k ] = x / length;
			_normals[ k + 1 ] = y / length;
			_normals[ k + 2 ] = z / length;

		}

	}

}

// Every square's triangles (the same for all): the grid's, facing out, then the skirt's.
function makeIndex() {

	const row = SEGMENTS + 1;
	const index = [];
	for ( let j = 0; j < SEGMENTS; j ++ ) {

		for ( let i = 0; i < SEGMENTS; i ++ ) {

			const k = j * row + i;
			index.push( k, k + 1, k + row + 1, k, k + row + 1, k + row );

		}

	}

	// Each edge's skirt hangs from the edge's points (top) to their copies (bottom), facing out.
	const edge = side => {

		const ring = [];
		for ( let s = 0; s <= SEGMENTS; s ++ ) {

			if ( side === 0 ) ring.push( s );
			else if ( side === 1 ) ring.push( s * row + SEGMENTS );
			else if ( side === 2 ) ring.push( SEGMENTS * row + s );
			else ring.push( s * row );

		}

		return ring;

	};

	for ( let side = 0; side < 4; side ++ ) {

		const top = edge( side );
		const bottom = top.map( ( _, s ) => POINTS + side * row + s );
		// The bottom (j = 0) and right (i = SEGMENTS) edges' outsides are to the right of their way
		// along; the top's and left's to the left.
		for ( let s = 0; s < SEGMENTS; s ++ ) {

			const [ a, b, c, d ] = [ top[ s ], top[ s + 1 ], bottom[ s + 1 ], bottom[ s ] ];
			if ( side < 2 ) index.push( a, d, c, a, c, b );
			else index.push( a, b, c, a, c, d );

		}

	}

	return new Uint16Array( index );

}

// The ground's look: the world's colours by where on it it is (from each point's direction, so the
// picture has no seam where squares meet), brighter or darker as body-height.js says (fresh
// craters), the sun's light on the slopes (Lambert's, with a share of Lommel-Seeliger's, which is
// how bare dust really scatters: a full Moon's edge as bright as its middle), the light from all
// round where the sun doesn't reach (the earthshine on the Moon, the dusty sky's on Mars), close by
// fine grit and gravel (triplanar, by the world's own axes) so the ground is seen to move under you,
// and on a world with air, its haze far off.
function makeMaterial( look ) {

	const { shade, haze } = look;
	return new ShaderMaterial( {
		uniforms: {
			picture: { value: blank() },
			// (Made when the world loads, see load.)
			grit: { value: blank() },
			sun: { value: new Vector3( 0.3, 0.8, - 0.5 ).normalize() },
			sunLight: { value: shade.sun },
			ambient: { value: new Vector3( ...shade.ambient ) },
			lommel: { value: shade.lommel },
			tint: { value: new Vector3( ...shade.tint ?? [ 1, 1, 1 ] ) },
			gritScale: { value: new Vector3( 1 / GRIT, 1 / GRAVEL, GRIT_FAR ) },
			// The haze's colour, and how much of it there is (set as the camera climbs: placeSky); and
			// how far off (m) it hides half of what's there (0 for none).
			haze: { value: haze ? new Vector4( ...new Color( haze.colour ).toArray(), 1 ) : new Vector4( 0, 0, 0, 0 ) },
			hazeHalf: { value: haze ? haze.half : 0 },
			// The data lens (lens.js): how much of it is on (0 to 1, eased in and out), the measured
			// heights as a texture (m, over the world's datum, in the picture's columns and rows), the
			// colour ramp they're painted with, the heights at its two ends (m), and how far apart (m)
			// its contour lines are. Off, it costs one uniform test.
			lensAmount: { value: 0 },
			lensHeights: { value: blank() },
			lensRamp: { value: blank() },
			lensLow: { value: 0 },
			lensHigh: { value: 1 },
			lensStep: { value: 1000 },
		},
		vertexShader: /* glsl */ `
			attribute vec3 worldDir;
			attribute vec3 grit;
			attribute float shade;
			varying vec3 vDir;
			varying vec3 vGrit;
			varying vec3 vNormal;
			varying vec3 vMoonNormal;
			varying vec3 vWorld;
			varying float vShade;
			#include <common>
			#include <logdepthbuf_pars_vertex>
			void main() {
				vDir = worldDir;
				vGrit = grit;
				vShade = shade;
				vMoonNormal = normal;
				vNormal = normalize( mat3( modelMatrix ) * normal );
				vec4 world = modelMatrix * vec4( position, 1.0 );
				vWorld = world.xyz;
				gl_Position = projectionMatrix * viewMatrix * world;
				#include <logdepthbuf_vertex>
			}
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D picture;
			uniform sampler2D grit;
			uniform vec3 sun;
			uniform float sunLight;
			uniform vec3 ambient;
			uniform float lommel;
			uniform vec3 tint;
			uniform vec3 gritScale;
			uniform vec4 haze;
			uniform float hazeHalf;
			uniform float lensAmount;
			uniform sampler2D lensHeights;
			uniform sampler2D lensRamp;
			uniform float lensLow;
			uniform float lensHigh;
			uniform float lensStep;
			varying vec3 vDir;
			varying vec3 vGrit;
			varying vec3 vNormal;
			varying vec3 vMoonNormal;
			varying vec3 vWorld;
			varying float vShade;
			#include <common>
			#include <logdepthbuf_pars_fragment>

			float triplanar( vec3 p, vec3 w ) {
				return texture2D( grit, p.yz ).r * w.x + texture2D( grit, p.zx ).r * w.y + texture2D( grit, p.xy ).r * w.z;
			}

			void main() {
				#include <logdepthbuf_fragment>
				vec3 d = normalize( vDir );
				float lon = atan( d.y, d.x );
				float lat = asin( clamp( d.z, - 1.0, 1.0 ) );
				vec2 uv = vec2( lon / PI2 + 0.5, lat / PI + 0.5 );
				// Across the 180th meridian u jumps from 1 to 0: the gradients of a copy that doesn't.
				float u2 = fract( uv.x + 0.5 ) - 0.5;
				vec2 dx = vec2( dFdx( uv.x ), dFdx( uv.y ) );
				vec2 dy = vec2( dFdy( uv.x ), dFdy( uv.y ) );
				if ( abs( dFdx( u2 ) ) + abs( dFdy( u2 ) ) < abs( dx.x ) + abs( dy.x ) ) {
					dx.x = dFdx( u2 );
					dy.x = dFdy( u2 );
				}
				vec3 albedo = textureGrad( picture, uv, dx, dy ).rgb * tint * vShade;
				// The data lens: the ground's colour by its measured height (only the grid NASA's map
				// has, never the made-up craters, which are in the shape but not in this texture), with
				// thin contour lines that fade out where they'd crowd closer than a few pixels. The
				// picture's brightness is kept a little, and the light below still falls on the slopes,
				// so the relief reads under the colours.
				if ( lensAmount > 0.0 ) {
					float h = texture( lensHeights, uv ).r;
					float t = clamp( ( h - lensLow ) / ( lensHigh - lensLow ), 0.0, 1.0 );
					vec3 c = texture( lensRamp, vec2( t, 0.5 ) ).rgb;
					float f = fract( h / lensStep );
					float fw = fwidth( h / lensStep );
					float line = ( 1.0 - smoothstep( 0.0, 1.5 * fw, min( f, 1.0 - f ) ) ) * ( 1.0 - smoothstep( 0.2, 0.5, fw ) );
					albedo = mix( albedo, c * mix( 1.0, 0.6, line ) * ( 0.75 + 0.5 * dot( albedo, vec3( 0.333 ) ) ), lensAmount );
				}

				vec3 n = normalize( vNormal );
				vec3 view = normalize( cameraPosition - vWorld );
				float distance = length( cameraPosition - vWorld );
				// The grit, fading out with distance.
				vec3 w = pow( abs( normalize( vMoonNormal ) ), vec3( 4.0 ) );
				w /= w.x + w.y + w.z;
				float near = 1.0 - smoothstep( gritScale.z * 0.25, gritScale.z, distance );
				if ( near > 0.0 ) {
					float fine = triplanar( vGrit * gritScale.x, w );
					float coarse = triplanar( vGrit * gritScale.y, w );
					albedo *= mix( 1.0, ( 0.78 + 0.44 * fine ) * ( 0.88 + 0.24 * coarse ), near );
				}

				float mu0 = max( dot( n, sun ), 0.0 );
				float mu = max( dot( n, view ), 0.0 );
				float dust = 2.0 * mu0 / ( mu0 + mu + 1e-3 );
				vec3 light = mix( mu0, min( dust, 1.6 ), lommel ) * sunLight + ambient;
				vec3 colour = albedo * light;
				if ( hazeHalf > 0.0 ) colour = mix( colour, haze.rgb, ( 1.0 - exp2( - distance / hazeHalf ) ) * haze.w );
				gl_FragColor = vec4( colour, 1.0 );
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		side: FrontSide,
	} );

}

// Until the picture arrives: an even grey.
function blank() {

	const texture = new DataTexture( new Uint8Array( [ 140, 140, 140, 255 ] ), 1, 1 );
	texture.needsUpdate = true;
	return texture;

}

// The grit: a tile of grey speckle (small stones and their shadows on fine dust), seamless, made
// once.
function gritTexture() {

	const size = 256;
	const data = new Uint8Array( size * size );
	let seed = 12345;
	const random = () => ( ( seed = Math.imul( seed ^ ( seed >>> 15 ), 0x2c1b3c6d ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 0x100000000;
	const field = new Float32Array( size * size );
	// Soft blotches, then pebbles: bright tops and dark undersides.
	for ( let octave = 0; octave < 4; octave ++ ) {

		const cells = 4 << octave;
		const values = Array.from( { length: cells * cells }, random );
		for ( let y = 0; y < size; y ++ ) {

			for ( let x = 0; x < size; x ++ ) {

				const fx = x / size * cells;
				const fy = y / size * cells;
				const ix = Math.floor( fx );
				const iy = Math.floor( fy );
				const tx = fx - ix;
				const ty = fy - iy;
				const v = ( i, j ) => values[ ( ( iy + j ) % cells ) * cells + ( ix + i ) % cells ];
				const sx = tx * tx * ( 3 - 2 * tx );
				const sy = ty * ty * ( 3 - 2 * ty );
				const value = ( v( 0, 0 ) * ( 1 - sx ) + v( 1, 0 ) * sx ) * ( 1 - sy ) + ( v( 0, 1 ) * ( 1 - sx ) + v( 1, 1 ) * sx ) * sy;
				field[ y * size + x ] += value / ( 2 ** octave ) * 0.53;

			}

		}

	}

	for ( let i = 0; i < 900; i ++ ) {

		const cx = random() * size;
		const cy = random() * size;
		const r = 0.8 + random() ** 3 * 3.5;
		for ( let y = Math.floor( cy - r - 2 ); y <= cy + r + 2; y ++ ) {

			for ( let x = Math.floor( cx - r - 2 ); x <= cx + r + 2; x ++ ) {

				const d = Math.hypot( x - cx, y - cy ) / r;
				const k = ( ( y + size ) % size ) * size + ( x + size ) % size;
				if ( d < 1 ) field[ k ] += 0.35 * ( 1 - d * d ) * ( 1 - 0.6 * ( y - cy ) / r );
				else if ( d < 1.6 && y > cy ) field[ k ] -= 0.18 * ( 1.6 - d );

			}

		}

	}

	for ( let i = 0; i < data.length; i ++ ) data[ i ] = MathUtils.clamp( Math.round( field[ i ] * 170 ), 0, 255 );
	const texture = new DataTexture( data, size, size, RedFormat, UnsignedByteType );
	texture.wrapS = texture.wrapT = RepeatWrapping;
	texture.minFilter = LinearMipmapLinearFilter;
	// (A DataTexture's own is nearest, which close up draws its pebbles as squares.)
	texture.magFilter = LinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 8;
	texture.needsUpdate = true;
	return texture;

}

// The stars: a few thousand, most faint, a few bright, and the Milky Way's glow along a band, as a
// picture all round (equirectangular), made once.
function starTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 4096;
	canvas.height = 2048;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#000';
	ctx.fillRect( 0, 0, canvas.width, canvas.height );
	let seed = 99;
	const random = () => ( ( seed = Math.imul( seed ^ ( seed >>> 15 ), 0x2c1b3c6d ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 0x100000000;
	// The Milky Way: a band of faint dust, tilted across the sky.
	for ( let i = 0; i < 60000; i ++ ) {

		const x = random() * canvas.width;
		const y = canvas.height / 2 + Math.sin( x / canvas.width * Math.PI * 2 ) * 420 + ( random() + random() + random() + random() - 2 ) * 110;
		ctx.fillStyle = `rgba( 205, 212, 240, ${ 0.05 + random() * 0.1 } )`;
		ctx.fillRect( x, y, 1.5, 1.5 );

	}

	for ( let i = 0; i < 9000; i ++ ) {

		// Even over the sphere, not crowded at the poles.
		const x = random() * canvas.width;
		const y = Math.acos( 2 * random() - 1 ) / Math.PI * canvas.height;
		const bright = random() ** 6;
		const tint = random();
		const colour = tint < 0.15 ? '255, 214, 180' : tint < 0.3 ? '190, 210, 255' : '255, 255, 255';
		ctx.fillStyle = `rgba( ${ colour }, ${ 0.25 + 0.75 * bright } )`;
		ctx.beginPath();
		// Wider toward the poles, where the picture is stretched across.
		const stretch = 1 / Math.max( 0.15, Math.sin( y / canvas.height * Math.PI ) );
		ctx.ellipse( x, y, ( 0.7 + bright * 1.8 ) * stretch, 0.7 + bright * 1.8, 0, 0, Math.PI * 2 );
		ctx.fill();

	}

	const texture = new CanvasTexture( canvas );
	texture.mapping = EquirectangularReflectionMapping;
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

// The Earth as seen from the Moon: blue oceans, white cloud and ice, a thin bright rim of air, lit
// by the same sun as the ground (so it shows a phase). Drawn far off behind everything.
function makeEarth() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 512;
	canvas.height = 256;
	const ctx = canvas.getContext( '2d' );
	const ocean = ctx.createLinearGradient( 0, 0, 0, 256 );
	ocean.addColorStop( 0, '#e8f0f8' );
	ocean.addColorStop( 0.1, '#2a5c9a' );
	ocean.addColorStop( 0.5, '#1d4f8f' );
	ocean.addColorStop( 0.9, '#2a5c9a' );
	ocean.addColorStop( 1, '#f2f6fa' );
	ctx.fillStyle = ocean;
	ctx.fillRect( 0, 0, 512, 256 );
	// Land: a few soft blotches of green and tan.
	let seed = 7;
	const random = () => ( ( seed = Math.imul( seed ^ ( seed >>> 15 ), 0x2c1b3c6d ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 0x100000000;
	for ( let i = 0; i < 40; i ++ ) {

		ctx.fillStyle = random() < 0.5 ? 'rgba( 92, 120, 70, 0.8 )' : 'rgba( 168, 140, 96, 0.75 )';
		ctx.beginPath();
		ctx.ellipse( random() * 512, 50 + random() * 156, 8 + random() * 34, 6 + random() * 22, random() * Math.PI, 0, Math.PI * 2 );
		ctx.fill();

	}

	// Cloud: swirls and bands.
	for ( let i = 0; i < 160; i ++ ) {

		ctx.strokeStyle = `rgba( 255, 255, 255, ${ 0.25 + random() * 0.5 } )`;
		ctx.lineWidth = 2 + random() * 7;
		ctx.beginPath();
		const y = random() * 256;
		const x = random() * 512;
		ctx.ellipse( x, y, 10 + random() * 40, 3 + random() * 10, ( random() - 0.5 ) * 0.6, 0, Math.PI * ( 0.6 + random() ) );
		ctx.stroke();

	}

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	const material = new ShaderMaterial( {
		uniforms: { map: { value: texture }, sun: { value: new Vector3( 1, 0, 0 ) }, glow: { value: new Color( 0x8fc4ff ) } },
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			varying vec3 vNormal;
			varying vec3 vView;
			#include <common>
			#include <logdepthbuf_pars_vertex>
			void main() {
				vUv = uv;
				vNormal = normalize( mat3( modelMatrix ) * normal );
				vec4 world = modelMatrix * vec4( position, 1.0 );
				vView = normalize( cameraPosition - world.xyz );
				gl_Position = projectionMatrix * viewMatrix * world;
				#include <logdepthbuf_vertex>
			}
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D map;
			uniform vec3 sun;
			uniform vec3 glow;
			varying vec2 vUv;
			varying vec3 vNormal;
			varying vec3 vView;
			#include <common>
			#include <logdepthbuf_pars_fragment>
			void main() {
				#include <logdepthbuf_fragment>
				vec3 n = normalize( vNormal );
				float day = smoothstep( - 0.08, 0.2, dot( n, sun ) );
				float rim = pow( 1.0 - max( dot( n, normalize( vView ) ), 0.0 ), 3.0 );
				vec3 colour = texture2D( map, vUv ).rgb * ( 0.03 + 1.4 * day ) + glow * rim * day * 0.8;
				gl_FragColor = vec4( colour, 1.0 );
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		depthWrite: false,
	} );
	const mesh = new Mesh( new SphereGeometry( 1, 48, 24 ), material );
	// three.js puts a sphere's poles on Y, the Moon's frame its north on Z: near enough the Earth's.
	mesh.rotation.x = Math.PI / 2;
	mesh.renderOrder = - 1;
	mesh.name = 'earth-in-the-sky';
	mesh.raycast = () => {};
	mesh.frustumCulled = false;
	return mesh;

}


// A world's own sky (Mars's, look.sky): a sphere round the camera, drawn first, over the stars, as
// much of it as `day` (none from space: placeSky). Darker overhead and pale toward the horizon, and
// round the sun a paler, bluer glow, as the fine dust in Mars's air scatters the sun's light
// forward (its sunsets are blue). Never hit: it's sky.
function makeSky( { overhead, horizon, sun } ) {

	const material = new ShaderMaterial( {
		uniforms: {
			overhead: { value: new Color( overhead ) },
			horizon: { value: new Color( horizon ) },
			glow: { value: new Color( sun ) },
			sun: { value: new Vector3( 0, 1, 0 ) },
			up: { value: new Vector3( 0, 1, 0 ) },
			day: { value: 1 },
		},
		vertexShader: /* glsl */ `
			varying vec3 vWorld;
			#include <common>
			#include <logdepthbuf_pars_vertex>
			void main() {
				vec4 world = modelMatrix * vec4( position, 1.0 );
				vWorld = world.xyz;
				gl_Position = projectionMatrix * viewMatrix * world;
				#include <logdepthbuf_vertex>
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 overhead;
			uniform vec3 horizon;
			uniform vec3 glow;
			uniform vec3 sun;
			uniform vec3 up;
			uniform float day;
			varying vec3 vWorld;
			#include <common>
			#include <logdepthbuf_pars_fragment>
			void main() {
				#include <logdepthbuf_fragment>
				vec3 d = normalize( vWorld - cameraPosition );
				float high = dot( d, up );
				vec3 colour = mix( horizon, overhead, smoothstep( - 0.02, 0.75, high ) );
				float toward = max( dot( d, normalize( sun ) ), 0.0 );
				colour = mix( colour, glow, pow( toward, 10.0 ) * 0.55 + pow( toward, 400.0 ) * 0.4 );
				gl_FragColor = vec4( colour, day );
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		side: BackSide,
		// Over the stars by its share (`day`), before everything else, and behind it all: blended
		// without being sorted with what's see-through.
		blending: CustomBlending,
		blendSrc: SrcAlphaFactor,
		blendDst: OneMinusSrcAlphaFactor,
		depthWrite: false,
		depthTest: false,
	} );
	const mesh = new Mesh( new SphereGeometry( 1, 48, 24 ), material );
	mesh.renderOrder = - 2;
	mesh.name = 'sky';
	mesh.raycast = () => {};
	mesh.frustumCulled = false;
	return mesh;

}

// Phobos as seen from Mars: a lumpy grey-brown potato of a moon (27 × 22 × 18 km, the darkest of
// grey: it reflects 7 % of the light that falls on it), lit by the same sun as the ground, so it
// shows a phase. Drawn far off behind everything, over the sky.
function makePhobos() {

	const geometry = new SphereGeometry( 1, 32, 16 );
	const position = geometry.attributes.position;
	let seed = 11;
	const random = () => ( ( seed = Math.imul( seed ^ ( seed >>> 15 ), 0x2c1b3c6d ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 0x100000000;
	// Its shape: stretched along one axis, a few dents (Stickney, its great crater, the biggest).
	const dents = Array.from( { length: 9 }, ( _, i ) => ( { at: new Vector3( random() - 0.5, random() - 0.5, random() - 0.5 ).normalize(), size: i === 0 ? 0.55 : 0.18 + random() * 0.2, depth: i === 0 ? 0.16 : 0.05 + random() * 0.05 } ) );
	const p = new Vector3();
	for ( let i = 0; i < position.count; i ++ ) {

		p.fromBufferAttribute( position, i );
		let r = 1;
		for ( const dent of dents ) {

			const d = p.distanceTo( dent.at ) / dent.size;
			if ( d < 1 ) r -= dent.depth * ( 1 - d * d ) ** 2;

		}

		p.multiplyScalar( r );
		position.setXYZ( i, p.x * 1.2, p.y * 0.97, p.z * 0.8 );

	}

	geometry.computeVertexNormals();
	const material = new ShaderMaterial( {
		uniforms: { sun: { value: new Vector3( 1, 0, 0 ) }, colour: { value: new Color( 0x6f655c ) } },
		vertexShader: /* glsl */ `
			varying vec3 vNormal;
			#include <common>
			#include <logdepthbuf_pars_vertex>
			void main() {
				vNormal = normalize( mat3( modelMatrix ) * normal );
				gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position, 1.0 );
				#include <logdepthbuf_vertex>
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 sun;
			uniform vec3 colour;
			varying vec3 vNormal;
			#include <common>
			#include <logdepthbuf_pars_fragment>
			void main() {
				#include <logdepthbuf_fragment>
				float day = max( dot( normalize( vNormal ), sun ), 0.0 );
				gl_FragColor = vec4( colour * ( 0.04 + 1.8 * day ), 1.0 );
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		depthWrite: false,
	} );
	const mesh = new Mesh( geometry, material );
	mesh.rotation.set( 0.4, 1.1, 0.2 );
	mesh.renderOrder = - 1;
	mesh.name = 'phobos-in-the-sky';
	mesh.raycast = () => {};
	mesh.frustumCulled = false;
	return mesh;

}
