import {
	AdditiveBlending,
	BufferAttribute,
	CanvasTexture,
	Color,
	DoubleSide,
	DynamicDrawUsage,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	LinearFilter,
	MathUtils,
	Mesh,
	NormalBlending,
	ShaderMaterial,
	SRGBColorSpace,
	Vector3,
} from 'three';

// Boost styles: what the booster leaves behind it besides drive-fx.js's classic flame (World
// Drive's Garage picks one for each ride), and the supersonic effects that any of them gets at the
// booster's top speed. Each style is particles drawn as quads from one picture sheet: a billboard
// facing the camera, a strip stretched along a line (a bolt, a streak, a comet's tail) or a quad
// lying flat across a normal (a ring, a splat of paint on the road), all of one batch in one draw.
//
// They're made to read from the chase camera at speed: most of what's thrown out keeps going with
// the vehicle (`inherit`, a share of its velocity), so it trails a few metres behind it rather than
// being left on the road at once, which at 150 km/h is behind the camera in a tenth of a second.
// And they're cheap: each batch has a fixed number of particles (a hard budget, the oldest reused
// when it's full), made once with its buffers, and each frame only the numbers in them change.

// The picture sheet: CELLS across and down, each CELL pixels. SHAPES names the cells.
const CELLS = 4;
const CELL = 128;
const SHAPES = { soft: 0, glow: 1, star: 2, heart: 3, square: 4, pixel: 5, ring: 6, bubble: 7, splat: 8, drop: 11, streak: 12, bolt: 13, burst: 14, shock: 15 };
// How each quad is drawn: facing the camera, stretched along its axis, or flat across it.
const FACING = 0;
const ALONG = 1;
const FLAT = 2;
// Ink lies this far (m) over the road, so the road's own bumps don't cut it.
const INK_LIFT = 0.05;

const _p = new Vector3();
const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
// A batch's update() with nothing of a style's own.
const NO_HOOKS = {};

// --- the picture sheet -------------------------------------------------------------------------

let sheet = null;
function getSheet() {

	if ( sheet ) return sheet;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = CELLS * CELL;
	const ctx = canvas.getContext( '2d' );
	// The same splats every time.
	let seed = 7;
	const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const draw = ( cell, paint ) => {

		ctx.save();
		ctx.translate( cell % CELLS * CELL, Math.floor( cell / CELLS ) * CELL );
		ctx.beginPath();
		ctx.rect( 0, 0, CELL, CELL );
		ctx.clip();
		paint( CELL / 2 );
		ctx.restore();

	};
	const radial = ( m, stops, r = m ) => {

		const gradient = ctx.createRadialGradient( m, m, 0, m, m, r );
		for ( const [ at, alpha ] of stops ) gradient.addColorStop( at, `rgba(255,255,255,${ alpha })` );
		ctx.fillStyle = gradient;
		ctx.fillRect( 0, 0, CELL, CELL );

	};
	const across = ( stops ) => {

		const gradient = ctx.createLinearGradient( 0, 0, CELL, 0 );
		for ( const [ at, alpha ] of stops ) gradient.addColorStop( at, `rgba(255,255,255,${ alpha })` );
		ctx.fillStyle = gradient;
		ctx.fillRect( 0, 0, CELL, CELL );

	};
	const points = ( m, count, out, inner ) => {

		ctx.beginPath();
		for ( let i = 0; i < count * 2; i ++ ) {

			const angle = i / ( count * 2 ) * Math.PI * 2 - Math.PI / 2;
			const reach = i % 2 ? inner : out;
			ctx.lineTo( m + Math.cos( angle ) * reach, m + Math.sin( angle ) * reach );

		}

		ctx.closePath();

	};

	draw( SHAPES.soft, m => radial( m, [ [ 0, 1 ], [ 0.4, 0.55 ], [ 1, 0 ] ], m - 2 ) );
	draw( SHAPES.glow, m => radial( m, [ [ 0, 1 ], [ 0.12, 0.9 ], [ 0.35, 0.35 ], [ 0.7, 0.08 ], [ 1, 0 ] ], m - 2 ) );
	draw( SHAPES.star, m => {

		radial( m, [ [ 0, 1 ], [ 0.25, 0.4 ], [ 1, 0 ] ], m * 0.45 );
		ctx.fillStyle = '#fff';
		points( m, 4, m - 4, m * 0.09 );
		ctx.fill();

	} );
	draw( SHAPES.heart, m => {

		ctx.beginPath();
		ctx.moveTo( m, 110 );
		ctx.bezierCurveTo( 22, 82, 8, 56, 22, 34 );
		ctx.bezierCurveTo( 36, 14, 60, 18, m, 40 );
		ctx.bezierCurveTo( 68, 18, 92, 14, 106, 34 );
		ctx.bezierCurveTo( 120, 56, 106, 82, m, 110 );
		ctx.closePath();
		ctx.fillStyle = 'rgb(232,232,232)';
		ctx.fill();
		ctx.lineWidth = 5;
		ctx.strokeStyle = 'rgb(120,120,120)';
		ctx.stroke();
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.ellipse( 38, 40, 9, 6, - 0.6, 0, Math.PI * 2 );
		ctx.fill();

	} );
	draw( SHAPES.square, () => {

		ctx.fillStyle = '#fff';
		ctx.fillRect( 12, 12, CELL - 24, CELL - 24 );

	} );
	// A pixel: flat, with a lighter edge on top and a darker one under it.
	draw( SHAPES.pixel, () => {

		ctx.fillStyle = 'rgb(105,105,105)';
		ctx.fillRect( 10, 10, 108, 108 );
		ctx.fillStyle = 'rgb(255,255,255)';
		ctx.fillRect( 10, 10, 98, 98 );
		ctx.fillStyle = 'rgb(215,215,215)';
		ctx.fillRect( 22, 22, 86, 86 );

	} );
	draw( SHAPES.ring, m => {

		for ( const [ width, alpha ] of [ [ 26, 0.12 ], [ 16, 0.3 ], [ 8, 1 ] ] ) {

			ctx.beginPath();
			ctx.arc( m, m, 44, 0, Math.PI * 2 );
			ctx.lineWidth = width;
			ctx.strokeStyle = `rgba(255,255,255,${ alpha })`;
			ctx.stroke();

		}

	} );
	// A soap bubble: nearly clear in the middle, a bright rim, a window's highlight.
	draw( SHAPES.bubble, m => {

		radial( m, [ [ 0, 0.08 ], [ 0.7, 0.16 ], [ 0.88, 0.75 ], [ 0.95, 0.9 ], [ 1, 0 ] ], m - 6 );
		ctx.fillStyle = 'rgba(255,255,255,0.95)';
		ctx.beginPath();
		ctx.ellipse( m - 22, m - 24, 13, 7, - 0.7, 0, Math.PI * 2 );
		ctx.fill();
		ctx.beginPath();
		ctx.arc( m + 20, m + 22, 4, 0, Math.PI * 2 );
		ctx.fill();

	} );
	// Splats of paint: a lumpy blob with drops flung round it, three of them.
	for ( let n = 0; n < 3; n ++ ) draw( SHAPES.splat + n, m => {

		ctx.fillStyle = '#fff';
		ctx.beginPath();
		const lumps = [ 3 + Math.floor( random() * 4 ), 7 + Math.floor( random() * 4 ) ];
		const phase = [ random() * 6, random() * 6 ];
		for ( let i = 0; i <= 64; i ++ ) {

			const angle = i / 64 * Math.PI * 2;
			const r = 34 * ( 1 + 0.18 * Math.sin( lumps[ 0 ] * angle + phase[ 0 ] ) + 0.1 * Math.sin( lumps[ 1 ] * angle + phase[ 1 ] ) );
			ctx.lineTo( m + Math.cos( angle ) * r, m + Math.sin( angle ) * r );

		}

		ctx.fill();
		for ( let i = 0; i < 7; i ++ ) {

			const angle = random() * Math.PI * 2;
			const reach = 44 + random() * 14;
			ctx.beginPath();
			ctx.arc( m + Math.cos( angle ) * reach, m + Math.sin( angle ) * reach, 2.5 + random() * 5, 0, Math.PI * 2 );
			ctx.fill();

		}

	} );
	draw( SHAPES.drop, m => {

		ctx.fillStyle = 'rgb(230,230,230)';
		ctx.beginPath();
		ctx.arc( m, m, 40, 0, Math.PI * 2 );
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.ellipse( m - 14, m - 14, 10, 6, - 0.7, 0, Math.PI * 2 );
		ctx.fill();

	} );
	// Strips: soft across, the same all along, so pieces end to end make one line.
	draw( SHAPES.streak, () => across( [ [ 0, 0 ], [ 0.3, 0.22 ], [ 0.5, 1 ], [ 0.7, 0.22 ], [ 1, 0 ] ] ) );
	draw( SHAPES.bolt, () => across( [ [ 0, 0 ], [ 0.3, 0.08 ], [ 0.43, 0.5 ], [ 0.5, 1 ], [ 0.57, 0.5 ], [ 0.7, 0.08 ], [ 1, 0 ] ] ) );
	draw( SHAPES.burst, m => {

		radial( m, [ [ 0, 1 ], [ 0.3, 0.45 ], [ 1, 0 ] ], m * 0.6 );
		ctx.fillStyle = '#fff';
		points( m, 8, m - 4, m * 0.16 );
		ctx.fill();

	} );
	draw( SHAPES.shock, m => radial( m, [ [ 0, 0 ], [ 0.55, 0 ], [ 0.78, 0.55 ], [ 0.87, 1 ], [ 0.93, 0.45 ], [ 1, 0 ] ], m - 2 ) );

	sheet = new CanvasTexture( canvas );
	sheet.colorSpace = SRGBColorSpace;
	// Upright as drawn: the shader turns each cell's v round itself.
	sheet.flipY = false;
	// No mipmaps, so a small particle never picks up its neighbour's picture.
	sheet.generateMipmaps = false;
	sheet.minFilter = LinearFilter;
	return sheet;

}

// --- a batch of quads --------------------------------------------------------------------------

const VERTEX = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aCentre;
attribute vec4 aAxis;
attribute vec4 aShape;
attribute vec4 aColour;
uniform float uCells;
varying vec2 vUv;
varying vec4 vColour;

vec2 turn( vec2 p, float angle ) {

	float s = sin( angle );
	float c = cos( angle );
	return vec2( p.x * c - p.y * s, p.x * s + p.y * c );

}

void main() {

	vec2 corner = position.xy;
	vec4 mv;
	if ( aAxis.w < 0.5 ) {

		mv = modelViewMatrix * vec4( aCentre, 1.0 );
		mv.xy += turn( corner * aShape.xy, aShape.z );

	} else if ( aAxis.w < 1.5 ) {

		// Along the axis (half its length), and across it as wide as it is, square to the view.
		mv = modelViewMatrix * vec4( aCentre, 1.0 );
		vec3 along = ( modelViewMatrix * vec4( aAxis.xyz, 0.0 ) ).xyz;
		vec3 side = cross( along, normalize( mv.xyz ) );
		float l = length( side );
		side = l > 1e-6 ? side / l : vec3( 1.0, 0.0, 0.0 );
		mv.xyz += along * corner.y + side * corner.x * aShape.x;

	} else {

		vec3 n = normalize( aAxis.xyz );
		vec3 t = normalize( cross( n, abs( n.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
		vec3 b = cross( n, t );
		vec2 q = turn( corner * aShape.xy, aShape.z );
		mv = modelViewMatrix * vec4( aCentre + t * q.x + b * q.y, 1.0 );

	}

	gl_Position = projectionMatrix * mv;
	#include <logdepthbuf_vertex>
	vec2 cell = vec2( mod( aShape.w, uCells ), floor( aShape.w / uCells ) );
	// A little inside the cell, so its edge never takes in the next one's.
	vUv = ( cell + vec2( corner.x, - corner.y ) * 0.485 + 0.5 ) / uCells;
	vColour = aColour;

}
`;

const FRAGMENT = /* glsl */`
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColour;

void main() {

	vec4 picture = texture2D( map, vUv );
	gl_FragColor = vec4( vColour.rgb * picture.rgb, vColour.a * picture.a );
	if ( gl_FragColor.a < 0.004 ) discard;
	#include <logdepthbuf_fragment>
	#include <colorspace_fragment>

}
`;

// `particles` that live, move and fade, and room for `quads` put down for one frame only. Made
// once; nothing in it is made again.
class Batch {

	constructor( root, { particles, quads = 0, blending = NormalBlending } ) {

		this.items = Array.from( { length: particles }, () => ( {
			age: Infinity, life: 1, position: new Vector3(), velocity: new Vector3(), carry: new Vector3(), axis: new Vector3(), colour: new Color(),
			size: 1, grow: 0, aspect: 1, turn: 0, spin: 0, alpha: 1, frame: 0, mode: FACING, drag: 0, fall: 0, phase: 0, kind: 0, fresh: false,
		} ) );
		this.next = 0;
		this.capacity = particles + quads;
		this.count = 0;
		// What a style's look() may change about how a particle shows this frame (see update).
		this.view = { position: new Vector3(), sx: 1, sy: 1, turn: 0, alpha: 1, frame: 0 };

		const geometry = new InstancedBufferGeometry();
		geometry.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
		geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( [ - 1, - 1, 0, 1, - 1, 0, 1, 1, 0, - 1, 1, 0 ] ), 3 ) );
		const attribute = ( name, size ) => {

			const value = new InstancedBufferAttribute( new Float32Array( this.capacity * size ), size ).setUsage( DynamicDrawUsage );
			geometry.setAttribute( name, value );
			return value;

		};
		this.centres = attribute( 'aCentre', 3 );
		this.axes = attribute( 'aAxis', 4 );
		this.shapes = attribute( 'aShape', 4 );
		this.colours = attribute( 'aColour', 4 );
		this.attributes = [ [ this.centres, 3 ], [ this.axes, 4 ], [ this.shapes, 4 ], [ this.colours, 4 ] ];
		geometry.instanceCount = 0;
		const material = new ShaderMaterial( {
			uniforms: { map: { value: getSheet() }, uCells: { value: CELLS } },
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			transparent: true,
			depthWrite: false,
			// A strip or a flat quad may be seen from either side.
			side: DoubleSide,
			blending,
		} );
		this.mesh = new Mesh( geometry, material );
		this.mesh.name = 'boost-batch';
		// Its quads are all over the place and change every frame; it's never far from the vehicle.
		this.mesh.frustumCulled = false;
		this.mesh.raycast = () => {};
		this.mesh.visible = false;
		root.add( this.mesh );

	}

	// The next particle, ready to be set up: the oldest one if they're all in use.
	spawn( life ) {

		const p = this.items[ this.next ];
		this.next = ( this.next + 1 ) % this.items.length;
		p.age = 0;
		p.life = life;
		p.velocity.set( 0, 0, 0 );
		p.carry.set( 0, 0, 0 );
		p.axis.set( 0, 1, 0 );
		p.size = 1;
		p.grow = 0;
		p.aspect = 1;
		p.turn = 0;
		p.spin = 0;
		p.alpha = 1;
		p.frame = SHAPES.soft;
		p.mode = FACING;
		p.drag = 0;
		p.fall = 0;
		p.phase = Math.random() * Math.PI * 2;
		p.kind = 0;
		// Shown where it's put down this frame, and only moved from the next.
		p.fresh = true;
		return p;

	}

	// Write one quad: at `at`, `axis` (its half length stretched ALONG, its normal FLAT), sx by sy
	// (half sizes, m), turned by `turn`, picture `frame`, in `colour` (linear) at `alpha`.
	put( at, axis, mode, sx, sy, turn, frame, colour, alpha ) {

		if ( this.count >= this.capacity ) return;
		const i = this.count ++;
		at.toArray( this.centres.array, i * 3 );
		const axes = this.axes.array;
		axes[ i * 4 ] = axis.x;
		axes[ i * 4 + 1 ] = axis.y;
		axes[ i * 4 + 2 ] = axis.z;
		axes[ i * 4 + 3 ] = mode;
		const shapes = this.shapes.array;
		shapes[ i * 4 ] = sx;
		shapes[ i * 4 + 1 ] = sy;
		shapes[ i * 4 + 2 ] = turn;
		shapes[ i * 4 + 3 ] = frame;
		const colours = this.colours.array;
		colours[ i * 4 ] = colour.r;
		colours[ i * 4 + 1 ] = colour.g;
		colours[ i * 4 + 2 ] = colour.b;
		colours[ i * 4 + 3 ] = alpha;

	}

	// Start the frame's quads: those put down for this frame alone come first, then the particles.
	begin() {

		this.count = 0;

	}

	// Age and move the particles and write the live ones: carried along at `carry` (m/s, the share
	// of the vehicle's speed it was thrown out with) and moving at its own `velocity` besides, which
	// falls by `fall` of gravity and is slowed by `drag` (1/s): air slowing what's thrown about in
	// the stream behind the vehicle, not the stream itself, so at speed it stays in view rather than
	// being left behind at once. Growing by `grow` and fading over its life unless `look( p, t, view
	// )` (the style's) says otherwise; `step( p, dt )` moves it its own way first; `died( p )` hears
	// of each one whose time is up. Then draw what was written.
	update( dt, hooks = NO_HOOKS ) {

		const { view } = this;
		const { step, look, died } = hooks;
		for ( const p of this.items ) {

			if ( p.age >= p.life ) continue;
			if ( p.fresh ) p.fresh = false;
			else {

				p.age += dt;
				if ( p.age >= p.life ) {

					died?.( p );
					continue;

				}

				p.velocity.y -= 9.81 * p.fall * dt;
				if ( p.drag ) p.velocity.multiplyScalar( Math.max( 0, 1 - p.drag * dt ) );
				step?.( p, dt );
				p.position.addScaledVector( p.velocity, dt ).addScaledVector( p.carry, dt );
				p.turn += p.spin * dt;

			}

			const t = p.age / p.life;
			view.position.copy( p.position );
			view.sx = p.size + p.grow * t;
			view.sy = view.sx * p.aspect;
			view.turn = p.turn;
			view.alpha = p.alpha * ( 1 - t );
			view.frame = p.frame;
			if ( look?.( p, t, view ) === false ) continue;
			this.put( view.position, p.axis, p.mode, view.sx, view.sy, view.turn, view.frame, p.colour, view.alpha );

		}

		const { count } = this;
		this.mesh.visible = count > 0;
		this.mesh.geometry.instanceCount = count;
		if ( count === 0 ) return;
		for ( const [ attribute, size ] of this.attributes ) {

			attribute.clearUpdateRanges();
			attribute.addUpdateRange( 0, count * size );
			attribute.needsUpdate = true;

		}

	}

	// How many particles are alive.
	get alive() {

		let alive = 0;
		for ( const p of this.items ) if ( p.age < p.life ) alive ++;
		return alive;

	}

}

// --- what each style does ----------------------------------------------------------------------

// Each frame drive-fx.js hands a style `frame` (one object, filled in again each frame): { pivot,
// size: { width, height, length, rear, scale }, velocity (m/s, world), power (0 to 1: the booster
// 1, a drift boost about half, 0 when off), grounded, dt, clock (s), nozzle and lastNozzle (the
// exhaust, world, now and a frame ago), back, up and right (unit, world: out of its back, its up
// and its right), middle (the middle of its box, world), scale (1 for a kart, more for something
// bigger) }.
//
// A style: `flame`, colours for the classic flame's cones and glow { outer, inner, halo } or just
// { halo } for a glow alone, with how long (`length`) and how wildly (`flicker`) it burns, or null
// for none; and make( root ), its batches and update( frame ). What a style does each frame is
// made once, in make(), so a frame makes nothing new.

// Particles emitted at `rate` a second (times power), spread along the exhaust's path this frame
// so a fast vehicle doesn't leave them in clumps a frame apart. fn( k ) sets each up, `k` from 0 (a
// frame ago) to 1 (now).
function emitter() {

	let due = 0;
	return ( power, dt, rate, fn ) => {

		if ( power <= 0 ) {

			due = 0;
			return;

		}

		due += rate * power * dt;
		const count = Math.floor( due );
		due -= count;
		for ( let i = 0; i < count; i ++ ) fn( ( i + 1 ) / count );

	};

}

// Somewhere in the exhaust's path `k` of the way through the frame, `across` (m) to the right and
// `up` (m) up from it: into `target`.
function nozzleAt( frame, k, across, up, target ) {

	return target.lerpVectors( frame.lastNozzle, frame.nozzle, k ).addScaledVector( frame.right, across ).addScaledVector( frame.up, up );

}

// Thrown out: carried along at `inherit` of the vehicle's velocity, and moving `back` m/s out of
// its back, `up` m/s up and `jitter` m/s any way besides.
function thrown( frame, p, inherit, back, up = 0, jitter = 0 ) {

	p.carry.copy( frame.velocity ).multiplyScalar( inherit );
	p.velocity.copy( frame.back ).multiplyScalar( back ).addScaledVector( frame.up, up )
		.add( _a.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( jitter * 2 ) );

}

function pick( list ) {

	return list[ Math.floor( Math.random() * list.length ) ];

}

// A jagged line from `from` along `toward` (unit) for `length` m in `steps`, wandering up to
// `wander` m off it, as strips `width` m wide in two layers: a thin bright core and a wide glow.
// Each piece keeps going with the vehicle for its short life, so the bolt stays on it. Returns
// where it ended (a vector of this module's own: copy it).
function bolt( batch, frame, from, toward, length, steps, wander, width, life, core, glow ) {

	_b.copy( from );
	for ( let i = 1; i <= steps; i ++ ) {

		// Wandering all along, and nearly back to the line at its end.
		const off = i === steps ? 0.2 : 1;
		_p.copy( from ).addScaledVector( toward, length * i / steps )
			.addScaledVector( frame.right, ( Math.random() - 0.5 ) * 2 * wander * off )
			.addScaledVector( frame.up, ( Math.random() - 0.5 ) * 2 * wander * off );
		for ( let layer = 0; layer < 2; layer ++ ) {

			const piece = batch.spawn( life );
			piece.mode = ALONG;
			piece.frame = SHAPES.bolt;
			piece.position.addVectors( _b, _p ).multiplyScalar( 0.5 );
			piece.axis.subVectors( _p, _b ).multiplyScalar( 0.5 );
			piece.size = layer ? width * 2.5 : width;
			piece.colour.set( layer ? glow : core );
			piece.alpha = layer ? 0.45 : 1;
			piece.carry.copy( frame.velocity );
			piece.kind = 1;

		}

		_b.copy( _p );

	}

	return _b;

}

// A bolt flickers, on and off over its short life, rather than fading.
const FLICKER = {
	look( p, t, view ) {

		if ( p.kind === 1 ) view.alpha = p.alpha * ( Math.sin( p.age * 90 + p.phase ) > - 0.3 ? 1 : 0.25 );

	},
};

// A star twinkles as it turns.
const TWINKLE = {
	look( p, t, view ) {

		view.sx *= 0.4 + 0.6 * Math.abs( Math.sin( p.age * 28 + p.phase ) );
		view.sy = view.sx;

	},
};

const STYLES = {

	// A blue-white electric flame that crackles with little arcs, throwing blue sparks.
	plasma: {
		flame: { outer: 0x2f8dff, inner: 0xf2fbff, halo: 0x7cc8ff, length: 1.15, flicker: 2.2 },
		make( root ) {

			const batch = new Batch( root, { particles: 150, blending: AdditiveBlending } );
			const sparks = emitter();
			const out = new Vector3();
			let f = null;
			let arcDue = 0;
			const spark = k => {

				const p = batch.spawn( 0.3 + Math.random() * 0.25 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.5 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.88, 3 + Math.random() * 3, 0, 1.6 );
				p.frame = SHAPES.glow;
				p.size = ( 0.08 + Math.random() * 0.08 ) * f.scale;
				p.colour.set( Math.random() < 0.5 ? 0x9fdcff : 0xffffff );
				p.drag = 1.5;

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					sparks( frame.power, frame.dt, 90, spark );
					// Every few hundredths of a second, a little arc off the flame.
					arcDue -= frame.dt;
					while ( frame.power > 0 && arcDue <= 0 ) {

						arcDue += 0.025 / frame.power;
						const angle = Math.random() * Math.PI * 2;
						const reach = 0.22 * frame.scale;
						_v.copy( frame.nozzle ).addScaledVector( frame.back, Math.random() * 0.7 * frame.scale )
							.addScaledVector( frame.right, Math.cos( angle ) * reach ).addScaledVector( frame.up, Math.sin( angle ) * reach );
						out.copy( frame.right ).multiplyScalar( Math.cos( angle ) ).addScaledVector( frame.up, Math.sin( angle ) ).addScaledVector( frame.back, 0.6 ).normalize();
						bolt( batch, frame, _v, out, ( 0.45 + Math.random() * 0.5 ) * frame.scale, 3, 0.1 * frame.scale, 0.035 * frame.scale, 0.05 + Math.random() * 0.05, 0xf4fbff, 0x4aa8ff );

					}

					if ( frame.power <= 0 ) arcDue = 0;
					batch.update( frame.dt, FLICKER );

				},
			};

		},
	},

	// Forked lightning crackling back from the exhaust: bolts with branches, gone in a flicker and
	// struck again.
	lightning: {
		flame: { outer: 0x7a4dff, inner: 0xffffff, halo: 0xb48cff, length: 0.55, flicker: 2 },
		make( root ) {

			const batch = new Batch( root, { particles: 220, blending: AdditiveBlending } );
			const way = new Vector3();
			const fork = new Vector3();
			const tip = new Vector3();
			let due = 0;
			return {
				batches: [ batch ],
				update( frame ) {

					batch.begin();
					due -= frame.dt;
					while ( frame.power > 0 && due <= 0 ) {

						due += 0.055;
						for ( let n = 0; n < 2; n ++ ) {

							// Back and fanned out to one side or the other and up: crackling round the back
							// of it rather than reaching all the way back to the camera.
							const length = ( 1.3 + Math.random() ) * frame.scale * ( 0.6 + 0.4 * frame.power );
							way.copy( frame.back ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 1.4 ).addScaledVector( frame.up, ( Math.random() - 0.15 ) * 0.9 ).normalize();
							const life = 0.07 + Math.random() * 0.06;
							tip.copy( bolt( batch, frame, frame.nozzle, way, length, 6, 0.16 * frame.scale, 0.045 * frame.scale, life, 0xf3eaff, 0x8a5cff ) );
							// A branch off it, from somewhere along its first half.
							fork.copy( frame.nozzle ).lerp( tip, 0.25 + Math.random() * 0.3 );
							way.addScaledVector( frame.right, ( Math.random() < 0.5 ? - 1 : 1 ) * 0.9 ).addScaledVector( frame.up, ( Math.random() - 0.5 ) * 0.8 ).normalize();
							bolt( batch, frame, fork, way, length * 0.5, 3, 0.1 * frame.scale, 0.03 * frame.scale, life * 0.8, 0xe4d6ff, 0x7a4dff );
							// A flash where it ends.
							const flash = batch.spawn( life );
							flash.position.copy( tip );
							flash.carry.copy( frame.velocity );
							flash.frame = SHAPES.glow;
							flash.size = 0.28 * frame.scale;
							flash.colour.set( 0xc8b0ff );
							flash.alpha = 0.8;
							flash.kind = 1;

						}

					}

					if ( frame.power <= 0 ) due = 0;
					batch.update( frame.dt, FLICKER );

				},
			};

		},
	},

	// Glitter: a stream of tiny twinkling stars in white, gold, pink, sky and lilac.
	glitter: {
		flame: { halo: 0xfff3c4, length: 0.6, flicker: 1 },
		make( root ) {

			const batch = new Batch( root, { particles: 230, blending: AdditiveBlending } );
			const stars = emitter();
			const colours = [ 0xffffff, 0xffe08a, 0xffb3ec, 0xa8f0ff, 0xd9b8ff ];
			let f = null;
			let n = 0;
			const star = k => {

				const p = batch.spawn( 0.5 + Math.random() * 0.45 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.6, ( Math.random() - 0.3 ) * f.size.height * 0.5, p.position );
				thrown( f, p, 0.9, 2 + Math.random() * 2, 0.4, 1.8 );
				p.frame = SHAPES.star;
				p.size = ( 0.07 + Math.random() * 0.08 ) * f.scale;
				p.colour.set( colours[ n ++ % colours.length ] );
				p.fall = 0.12;
				p.drag = 0.8;
				p.spin = ( Math.random() - 0.5 ) * 4;

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					stars( frame.power, frame.dt, 260, star );
					batch.update( frame.dt, TWINKLE );

				},
			};

		},
	},

	// Soap bubbles floating up and wobbling away, each popping at the end.
	bubbles: {
		flame: null,
		make( root ) {

			const batch = new Batch( root, { particles: 110 } );
			const bubbles = emitter();
			const tints = [ 0xc4f6ff, 0xffd4f4, 0xe3d0ff, 0xd2ffe8, 0xfff4c4 ];
			let f = null;
			const bubble = k => {

				const p = batch.spawn( 0.9 + Math.random() * 0.6 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.4 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.9, 1.5 + Math.random() * 1.5, 0.6, 0.6 );
				p.frame = SHAPES.bubble;
				p.size = ( 0.1 + Math.random() * 0.2 ) * f.scale;
				p.grow = p.size * 0.25;
				p.colour.set( pick( tints ) );
				p.alpha = 0.95;
				p.fall = - 0.05;
				p.drag = 0.9;

			};
			const hooks = {
				// Wobbling side to side as it rises.
				step: ( p, dt ) => p.velocity.addScaledVector( f.right, Math.sin( p.age * 6 + p.phase ) * 1.6 * dt ),
				look( p, t, view ) {

					// Clear until it pops: a quick swell, and gone.
					const pop = MathUtils.smoothstep( t, 0.88, 1 );
					view.sx *= 1 + pop * 0.6;
					view.sy = view.sx;
					view.alpha = p.alpha * ( 1 - pop );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					bubbles( frame.power, frame.dt, 55, bubble );
					batch.update( frame.dt, hooks );

				},
			};

		},
	},

	// Confetti: little paper rectangles in party colours, tumbling down as they flutter behind.
	confetti: {
		flame: null,
		make( root ) {

			const batch = new Batch( root, { particles: 180 } );
			const pieces = emitter();
			const colours = [ 0xff3b5c, 0xffc21a, 0x2fd06b, 0x2f9bff, 0xb05cff, 0xff7ad9, 0xffffff ];
			let f = null;
			const piece = k => {

				const p = batch.spawn( 1 + Math.random() * 0.5 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.6, ( Math.random() - 0.3 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.85, 2 + Math.random() * 2, 2.2, 2 );
				p.frame = SHAPES.square;
				p.size = ( 0.06 + Math.random() * 0.03 ) * f.scale;
				p.aspect = 0.55;
				p.colour.set( pick( colours ) );
				p.fall = 0.3;
				p.drag = 1.6;
				p.spin = ( Math.random() - 0.5 ) * 18;
				p.turn = Math.random() * Math.PI;

			};
			const hooks = {
				look( p, t, view ) {

					// Turning over and over: edge on, then flat.
					view.sy *= 0.15 + 0.85 * Math.abs( Math.cos( p.age * 11 + p.phase ) );
					view.alpha = t < 0.8 ? 1 : ( 1 - t ) * 5;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					pieces( frame.power, frame.dt, 110, piece );
					batch.update( frame.dt, hooks );

				},
			};

		},
	},

	// Hearts rising and swaying away, beating as they go.
	hearts: {
		flame: { halo: 0xff6fb5, length: 0.5, flicker: 0.6 },
		make( root ) {

			const batch = new Batch( root, { particles: 70 } );
			const hearts = emitter();
			const colours = [ 0xff3d7f, 0xff6fae, 0xff9ccc, 0xe0245e ];
			let f = null;
			const heart = k => {

				const p = batch.spawn( 1 + Math.random() * 0.5 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.2 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.88, 1.8 + Math.random() * 1.2, 1.1, 0.6 );
				p.frame = SHAPES.heart;
				p.size = ( 0.13 + Math.random() * 0.1 ) * f.scale;
				p.grow = p.size * 0.4;
				p.colour.set( pick( colours ) );
				p.fall = - 0.08;
				p.drag = 1;

			};
			const hooks = {
				step: ( p, dt ) => p.velocity.addScaledVector( f.right, Math.sin( p.age * 4 + p.phase ) * 1.8 * dt ),
				look( p, t, view ) {

					// A heartbeat: a quick swell, and a rest.
					const beat = Math.max( 0, Math.sin( p.age * 9 + p.phase ) ) ** 6;
					view.sx *= 1 + beat * 0.22;
					view.sy = view.sx;
					view.turn = 0.3 * Math.sin( p.age * 3 + p.phase );
					view.alpha = t < 0.7 ? 1 : ( 1 - t ) / 0.3;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					hearts( frame.power, frame.dt, 30, heart );
					batch.update( frame.dt, hooks );

				},
			};

		},
	},

	// Pixels: chunky squares in a bright palette, on a grid in the world, shrinking in steps and
	// blinking out, as an old game would draw them.
	pixel: {
		flame: null,
		make( root ) {

			const batch = new Batch( root, { particles: 150 } );
			const pixels = emitter();
			const colours = [ 0xff3b5c, 0xff9a1f, 0xffe14d, 0x3ce05a, 0x2fb6ff, 0xa866ff ];
			let f = null;
			let grid = 0.17;
			const pixel = k => {

				const p = batch.spawn( 0.7 + Math.random() * 0.35 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.4 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.88, 3 + Math.random() * 2, 0.3, 1.2 );
				p.frame = SHAPES.pixel;
				p.size = grid;
				// Hottest nearest the exhaust: the first colours most often.
				p.colour.set( colours[ Math.floor( Math.random() ** 1.6 * colours.length ) ] );
				p.drag = 0.6;

			};
			const hooks = {
				look( p, t, view ) {

					view.position.set( Math.round( p.position.x / grid ) * grid, Math.round( p.position.y / grid ) * grid, Math.round( p.position.z / grid ) * grid );
					view.sx = view.sy = p.size * ( t < 0.4 ? 1 : t < 0.7 ? 0.66 : 0.4 );
					view.turn = 0;
					// Solid, then blinking out.
					view.alpha = t < 0.85 || Math.floor( p.age * 24 ) % 2 ? 1 : 0;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					grid = 0.17 * frame.scale;
					batch.begin();
					pixels( frame.power, frame.dt, 85, pixel );
					batch.update( frame.dt, hooks );

				},
			};

		},
	},

	// Fireworks: little rockets shot out behind that burst into balls of sparks in one colour,
	// which fall and twinkle out.
	fireworks: {
		flame: { halo: 0xffe0a0, length: 0.5, flicker: 1 },
		make( root ) {

			const batch = new Batch( root, { particles: 280, blending: AdditiveBlending } );
			const rockets = emitter();
			const colours = [ 0xff4d6d, 0xffd23f, 0x4dff9a, 0x4dc3ff, 0xc77dff, 0xffffff ];
			let f = null;
			let scale = 1;
			const rocket = k => {

				// Up and only a little back, so they burst over the vehicle rather than by the camera.
				const p = batch.spawn( 0.32 + Math.random() * 0.12 );
				nozzleAt( f, k, 0, 0, p.position );
				thrown( f, p, 0.97, 1.5 + Math.random(), 5 + Math.random() * 1.5, 1.4 );
				p.frame = SHAPES.glow;
				p.size = 0.12 * f.scale;
				p.colour.set( 0xfff0c0 );
				p.fall = 0.6;
				p.kind = 1;

			};
			const burst = from => {

				const colour = pick( colours );
				for ( let i = 0; i < 14; i ++ ) {

					const spark = batch.spawn( 0.55 + Math.random() * 0.3 );
					spark.position.copy( from.position );
					// All round, carried on with the rocket.
					_v.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).normalize();
					spark.carry.copy( from.carry );
					spark.velocity.copy( from.velocity ).multiplyScalar( 0.3 ).addScaledVector( _v, ( 2.2 + Math.random() * 0.6 ) * scale );
					spark.frame = SHAPES.star;
					spark.size = 0.065 * scale;
					spark.colour.set( colour );
					spark.fall = 0.45;
					spark.drag = 1.6;
					spark.kind = 2;

				}

				const flash = batch.spawn( 0.14 );
				flash.position.copy( from.position );
				flash.carry.copy( from.carry );
				flash.frame = SHAPES.burst;
				flash.size = 0.25 * scale;
				flash.grow = 0.2 * scale;
				flash.colour.set( colour );

			};
			const hooks = {
				died: p => p.kind === 1 && burst( p ),
				look( p, t, view ) {

					if ( p.kind === 1 ) view.alpha = 1;
					// Sparks twinkle as they go out.
					else if ( p.kind === 2 && t > 0.5 ) view.alpha *= 0.5 + 0.5 * Math.sin( p.age * 50 + p.phase );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					scale = frame.scale;
					batch.begin();
					rockets( frame.power, frame.dt, 8, rocket );
					batch.update( frame.dt, hooks );

				},
			};

		},
	},

	// Ink: blobs of bright paint flung out behind, leaving splats on the road that stay a few
	// seconds, in one colour after another.
	ink: {
		flame: null,
		make( root ) {

			const batch = new Batch( root, { particles: 210 } );
			const drops = emitter();
			const splats = emitter();
			const colours = [ 0xff2d95, 0x18d4ff, 0xffd400, 0x7cff2e, 0x9b5cff ];
			let f = null;
			let colour = 0;
			let squirt = 0;
			const drop = k => {

				const p = batch.spawn( 0.3 + Math.random() * 0.2 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, 0, p.position );
				thrown( f, p, 0.65, 3.5 + Math.random() * 2, 1.4, 1 );
				p.frame = SHAPES.drop;
				p.size = ( 0.07 + Math.random() * 0.06 ) * f.scale;
				p.colour.set( colours[ colour ] );
				p.fall = 1;

			};
			// On the road behind it: flat on the ground its wheels are on, left where it lands.
			const splat = () => {

				const { size } = f;
				const p = batch.spawn( 5 );
				f.pivot.localToWorld( p.position.set( ( Math.random() - 0.5 ) * size.width * 0.7 / size.scale, INK_LIFT / size.scale, ( size.rear + 0.3 + Math.random() * 1.2 ) / size.scale ) );
				p.axis.copy( f.up );
				p.mode = FLAT;
				p.frame = SHAPES.splat + Math.floor( Math.random() * 3 );
				p.size = ( 0.35 + Math.random() * 0.35 ) * f.scale;
				// Flung along the road the faster it goes, so at speed they join into a trail of
				// paint rather than dots too far apart. Flat on level ground the quad's own across
				// is -Z and its up -X (see the shader), so that's the turn to the way it's going.
				const speed = Math.hypot( f.velocity.x, f.velocity.z );
				const stretch = Math.min( 3, 1 + speed / 15 );
				p.size *= stretch;
				p.aspect = 1 / stretch;
				p.turn = speed > 1 ? Math.atan2( - f.velocity.x, - f.velocity.z ) + ( Math.random() - 0.5 ) * 0.4 : Math.random() * Math.PI * 2;
				p.colour.set( colours[ colour ] );
				p.kind = 1;

			};
			const hooks = {
				look( p, t, view ) {

					// Splats stay as they are until their last second, then fade; drops don't fade.
					view.alpha = p.kind === 1 ? Math.min( 1, p.life - p.age ) : 1;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					// A new colour every half a second or so of boosting.
					squirt += frame.dt * frame.power;
					if ( squirt > 0.55 ) {

						squirt = 0;
						colour = ( colour + 1 ) % colours.length;

					}

					drops( frame.power, frame.dt, 46, drop );
					splats( frame.grounded ? frame.power : 0, frame.dt, 13, splat );
					batch.update( frame.dt, hooks );

				},
			};

		},
	},

	// Neon rings: glowing hoops thrown out behind, flat across the way it's going, so the camera
	// looks through them, widening as they fade.
	rings: {
		flame: { halo: 0x6ff6ff, length: 0.5, flicker: 0.8 },
		make( root ) {

			const batch = new Batch( root, { particles: 40, blending: AdditiveBlending } );
			const rings = emitter();
			const colours = [ 0x3df2ff, 0xff3df0, 0x9dff3d, 0x8f6bff ];
			let f = null;
			let n = 0;
			const ring = k => {

				const p = batch.spawn( 0.6 );
				nozzleAt( f, k, 0, 0, p.position );
				thrown( f, p, 0.9, 3, 0, 0 );
				p.axis.copy( f.back );
				p.mode = FLAT;
				p.frame = SHAPES.ring;
				p.size = 0.3 * f.scale;
				p.grow = 0.9 * f.scale;
				p.colour.set( colours[ n ++ % colours.length ] );

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					rings( frame.power, frame.dt, 15, ring );
					batch.update( frame.dt );

				},
			};

		},
	},

	// A comet: a bright white-blue head at the exhaust and a long glowing tail that narrows and
	// fades behind it, with a dust of sparks.
	comet: {
		flame: { outer: 0x7fd8ff, inner: 0xffffff, halo: 0xd6f4ff, length: 0.45, flicker: 0.6 },
		make( root ) {

			// The tail's points, round a ring: one every STEP s, laid at the exhaust and drifting
			// after the vehicle for LIFE s.
			const TAIL = 40;
			const STEP = 1 / 50;
			const LIFE = 0.7;
			const batch = new Batch( root, { particles: 60, quads: TAIL + 1, blending: AdditiveBlending } );
			const dust = emitter();
			const tail = Array.from( { length: TAIL }, () => ( { at: new Vector3(), velocity: new Vector3(), born: - Infinity, width: 0 } ) );
			const white = new Color( 0xeaffff );
			const blue = new Color( 0x4a6dff );
			const colour = new Color();
			const axis = new Vector3();
			const middle = new Vector3();
			let f = null;
			let head = 0;
			let due = 0;
			const speck = k => {

				const p = batch.spawn( 0.35 + Math.random() * 0.25 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.5 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.7, 3, 0, 1.2 );
				p.size = ( 0.05 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( Math.random() < 0.5 ? 0xbfe8ff : 0xffffff );

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const { clock, dt } = frame;
					batch.begin();
					for ( const point of tail ) point.at.addScaledVector( point.velocity, dt );
					if ( frame.power > 0 ) {

						due -= dt;
						if ( due <= 0 ) {

							due = STEP;
							head = ( head + 1 ) % TAIL;
							tail[ head ].born = clock;
							tail[ head ].velocity.copy( frame.velocity ).multiplyScalar( 0.62 ).addScaledVector( frame.back, 5 );
							tail[ head ].width = 0.32 * frame.scale * ( 0.5 + 0.5 * frame.power );

						}

						// Kept at the exhaust until the next is laid, so the tail stays on it.
						tail[ head ].at.copy( frame.nozzle );
						// The head: a glow that throbs.
						const throb = 0.6 * frame.scale * ( 0.9 + 0.15 * Math.sin( clock * 31 ) );
						batch.put( frame.nozzle, frame.up, FACING, throb, throb, 0, SHAPES.glow, white, 0.9 * frame.power );

					} else due = 0;

					// The tail, newest to oldest: a strip from each point to the next, narrowing and
					// going from white to blue as it ages.
					for ( let i = 0; i < TAIL - 1; i ++ ) {

						const a = tail[ ( head - i + TAIL ) % TAIL ];
						const b = tail[ ( head - i - 1 + TAIL ) % TAIL ];
						const t = ( clock - b.born ) / LIFE;
						if ( t > 1 ) break;
						middle.addVectors( a.at, b.at ).multiplyScalar( 0.5 );
						axis.subVectors( a.at, b.at ).multiplyScalar( 0.5 );
						colour.lerpColors( white, blue, t );
						batch.put( middle, axis, ALONG, b.width * ( 1 - t ) ** 0.7, 1, 0, SHAPES.streak, colour, ( 1 - t ) * 0.95 );

					}

					dust( frame.power, dt, 55, speck );
					batch.update( dt );

				},
			};

		},
	},

};

// The styles there are besides the classic flame, by id.
export const BOOST_STYLES = Object.keys( STYLES );

// A style's flame colours and length (see STYLES), or null for none; undefined for the classic
// flame (or a name it doesn't know), which drive-fx.js draws as it always has.
export function styleFlame( id ) {

	return STYLES[ id ]?.flame;

}

// The style `id`'s particles, in `root`: { update( frame ), alive, budget }, or null for the
// classic flame (or a name it doesn't know). Disposing of `root` disposes of them.
export function createBoostStyle( root, id ) {

	const style = STYLES[ id ];
	if ( ! style ) return null;
	const made = style.make( root );
	return {
		update: frame => made.update( frame ),
		// How many particles are alive, and the most there can be.
		get alive() {

			return made.batches.reduce( ( sum, batch ) => sum + batch.alive, 0 );

		},
		get budget() {

			return made.batches.reduce( ( sum, batch ) => sum + batch.capacity, 0 );

		},
	};

}

// --- supersonic --------------------------------------------------------------------------------

// Going supersonic (see drive.js): a sonic boom once, a shock ring blown out round the vehicle with
// a flash; and while it lasts, streaks of air streaming back past its body. Any style gets these.
export function createSupersonic( root ) {

	const batch = new Batch( root, { particles: 120, blending: AdditiveBlending } );
	const streaks = emitter();
	const travel = new Vector3();
	let f = null;
	let speed = 0;
	const streak = () => {

		const p = batch.spawn( 0.2 + Math.random() * 0.15 );
		const { width, height, length } = f.size;
		// Round its body, a little out from it: up its sides and over its top.
		const angle = Math.random() * Math.PI;
		p.position.copy( f.middle ).addScaledVector( f.right, Math.cos( angle ) * ( width * 0.55 + Math.random() * 0.5 ) )
			.addScaledVector( f.up, Math.sin( angle ) * ( height * 0.55 + Math.random() * 0.4 ) - height * 0.1 )
			.addScaledVector( travel, ( Math.random() - 0.3 ) * length );
		// Slipping back past it, a little slower than it goes (not so slow they reach the camera).
		p.carry.copy( f.velocity ).multiplyScalar( 0.88 );
		p.mode = ALONG;
		p.frame = SHAPES.streak;
		p.axis.copy( travel ).multiplyScalar( Math.min( 2.2, 0.4 + speed * 0.025 ) * Math.sqrt( f.scale ) );
		p.size = ( 0.035 + Math.random() * 0.02 ) * f.scale;
		p.colour.set( Math.random() < 0.6 ? 0xffffff : 0xbfe4ff );
		p.alpha = 0.6;

	};
	const hooks = {
		look( p, t, view ) {

			// Streaks come and go; the boom's rings thin out as they spread.
			if ( p.kind === 0 ) view.alpha = p.alpha * Math.sin( t * Math.PI );
			else if ( p.kind === 1 ) view.alpha = p.alpha * ( 1 - t ) ** 1.5;

		},
	};
	return {

		// Each frame, with the frame a style has (see above) and whether it's supersonic now.
		update( frame, on ) {

			f = frame;
			speed = frame.velocity.length();
			if ( speed > 1 ) travel.copy( frame.velocity ).divideScalar( speed );
			else travel.copy( frame.back ).negate();
			batch.begin();
			// More round something bigger: about as thick on it as on a kart.
			streaks( on ? 1 : 0, frame.dt, 80 * Math.sqrt( frame.scale ), streak );
			batch.update( frame.dt, hooks );

		},

		// The boom, round the middle of its box, for a vehicle about `size` m across.
		boom( frame, size ) {

			const way = speed > 1 ? travel : frame.back;
			for ( const [ picture, life, inherit, start, spread, colour ] of BOOM ) {

				const p = batch.spawn( life );
				p.position.copy( frame.middle );
				p.carry.copy( frame.velocity ).multiplyScalar( inherit );
				p.axis.copy( way );
				// The flash faces the camera; the rings lie across the way it's going.
				p.mode = picture === SHAPES.glow ? FACING : FLAT;
				p.frame = picture;
				p.size = size * start;
				p.grow = size * spread;
				p.colour.set( colour );
				p.kind = picture === SHAPES.glow ? 2 : 1;

			}

		},

		get alive() {

			return batch.alive;

		},

		get budget() {

			return batch.capacity;

		},

	};

}

// The boom: a shock ring, a thinner ring inside it and a flash, each [ picture, life (s), share of
// the vehicle's speed it keeps, size and growth (times the vehicle's size), colour ].
const BOOM = [
	[ SHAPES.shock, 0.5, 0.6, 0.6, 4.5, 0xffffff ],
	[ SHAPES.ring, 0.4, 0.75, 0.4, 3, 0xcfeaff ],
	[ SHAPES.glow, 0.18, 1, 1.6, 1.4, 0xffffff ],
];
