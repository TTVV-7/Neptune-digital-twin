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
	Vector4,
} from 'three';

// Boost styles: what the booster leaves behind it besides drive-fx.js's classic flame (World
// Drive's Garage picks one for each ride), and the supersonic effects that any of them gets at the
// booster's top speed. Each style is particles drawn as quads from one picture sheet: a billboard
// facing the camera, a strip stretched along a line (a bolt, a streak, a comet's tail) or a quad
// lying flat across a normal (a ring, a splat of paint on the road), one batch in one draw (two for
// dragon fire and spooky: a glowing one added over what's behind, and one drawn over it).
//
// They're made to read from the chase camera at speed: most of what's thrown out keeps going with
// the vehicle (`inherit`, a share of its velocity), so it trails a few metres behind it rather than
// being left on the road at once, which at 150 km/h is behind the camera in a tenth of a second.
// And they're cheap: each batch has a fixed number of particles (a hard budget, the oldest reused
// when it's full), made once with its buffers, and each frame only the numbers in them change.

// The picture sheet: CELLS across and down, each CELL pixels. SHAPES names the cells.
const CELLS = 6;
const CELL = 128;
export const SHAPES = {
	soft: 0, glow: 1, star: 2, heart: 3, square: 4, pixel: 5, ring: 6, bubble: 7, splat: 8, drop: 11, streak: 12, bolt: 13, burst: 14, shock: 15, chevron: 16, flare: 17, spark: 18,
	diamond: 19, snowflake: 20, note: 21, notes: 22, petal: 23, ghost: 24, shard: 25, puff: 26, butterfly: 27, wisp: 28, blossom: 29, beam: 30,
};
// How each quad is drawn: facing the camera, stretched along its axis, or flat across it.
export const FACING = 0;
export const ALONG = 1;
export const FLAT = 2;
// Ink lies this far (m) over the road, so the road's own bumps don't cut it.
const INK_LIFT = 0.05;

const _p = new Vector3();
const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _r = new Vector3();
const _hue = new Color();
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
	// A chevron pointing up (a boost pad's), bright in the middle of its stroke with a soft glow round it.
	draw( SHAPES.chevron, m => {

		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for ( const [ width, alpha ] of [ [ 34, 0.18 ], [ 22, 0.45 ], [ 12, 1 ] ] ) {

			ctx.beginPath();
			ctx.moveTo( m - 40, m + 22 );
			ctx.lineTo( m, m - 18 );
			ctx.lineTo( m + 40, m + 22 );
			ctx.lineWidth = width;
			ctx.strokeStyle = `rgba(255,255,255,${ alpha })`;
			ctx.stroke();

		}

	} );
	// A flare: a hot point with a long thin streak through it, side to side, as a lens draws a flash.
	draw( SHAPES.flare, m => {

		radial( m, [ [ 0, 1 ], [ 0.1, 0.7 ], [ 0.3, 0.12 ], [ 1, 0 ] ], m * 0.5 );
		const gradient = ctx.createLinearGradient( 0, 0, CELL, 0 );
		for ( const [ at, alpha ] of [ [ 0, 0 ], [ 0.3, 0.25 ], [ 0.5, 1 ], [ 0.7, 0.25 ], [ 1, 0 ] ] ) gradient.addColorStop( at, `rgba(255,255,255,${ alpha })` );
		ctx.fillStyle = gradient;
		ctx.fillRect( 0, m - 3, CELL, 6 );

	} );
	// A spark, drawn along its axis: a white-hot head at the top and a tail tapering away under it.
	draw( SHAPES.spark, m => {

		const gradient = ctx.createLinearGradient( 0, CELL, 0, 0 );
		gradient.addColorStop( 0, 'rgba(255,255,255,0)' );
		gradient.addColorStop( 0.75, 'rgba(255,255,255,0.75)' );
		gradient.addColorStop( 1, 'rgba(255,255,255,1)' );
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.moveTo( m, CELL - 4 );
		ctx.lineTo( m + 14, 18 );
		ctx.arc( m, 18, 14, 0, Math.PI, true );
		ctx.closePath();
		ctx.fill();

	} );
	// A shock diamond, drawn along its axis: a tall, thin lozenge, white-hot in the middle, in a
	// soft glow.
	draw( SHAPES.diamond, m => {

		radial( m, [ [ 0, 0.45 ], [ 0.5, 0.12 ], [ 1, 0 ] ], m * 0.75 );
		const gradient = ctx.createRadialGradient( m, m, 0, m, m, m );
		gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
		gradient.addColorStop( 0.55, 'rgba(255,255,255,0.75)' );
		gradient.addColorStop( 1, 'rgba(255,255,255,0.25)' );
		ctx.fillStyle = gradient;
		ctx.shadowColor = '#fff';
		ctx.shadowBlur = 8;
		ctx.beginPath();
		ctx.moveTo( m, 6 );
		ctx.lineTo( m + 22, m );
		ctx.lineTo( m, CELL - 6 );
		ctx.lineTo( m - 22, m );
		ctx.closePath();
		ctx.fill();

	} );
	// A snowflake: six arms, each with two pairs of branches, in a faint glow.
	draw( SHAPES.snowflake, m => {

		radial( m, [ [ 0, 0.3 ], [ 0.5, 0.08 ], [ 1, 0 ] ], m - 4 );
		ctx.strokeStyle = '#fff';
		ctx.lineCap = 'round';
		ctx.lineWidth = 7;
		ctx.shadowColor = 'rgba(255,255,255,0.8)';
		ctx.shadowBlur = 5;
		ctx.beginPath();
		for ( let i = 0; i < 6; i ++ ) {

			const angle = i / 6 * Math.PI * 2;
			// `r` out along the arm and `side` across it.
			const at = ( r, side ) => [ m + Math.cos( angle ) * r - Math.sin( angle ) * side, m + Math.sin( angle ) * r + Math.cos( angle ) * side ];
			ctx.moveTo( m, m );
			ctx.lineTo( ...at( 54, 0 ) );
			for ( const [ r, reach ] of [ [ 22, 15 ], [ 37, 11 ] ] ) for ( const side of [ - 1, 1 ] ) {

				ctx.moveTo( ...at( r, 0 ) );
				ctx.lineTo( ...at( r + reach, side * reach ) );

			}

		}

		ctx.stroke();

	} );
	// Musical notes, white with a grey edge so they read against the sky: an eighth note (♪), and
	// two beamed together (♫). The edge is a thick stroke under the fill, so only its outer half
	// shows.
	const outlined = shape => {

		ctx.lineJoin = 'round';
		ctx.lineWidth = 10;
		ctx.strokeStyle = 'rgb(80,80,80)';
		ctx.fillStyle = '#fff';
		shape();
		ctx.stroke();
		shape();
		ctx.fill();

	};
	draw( SHAPES.note, () => outlined( () => {

		ctx.beginPath();
		ctx.ellipse( 50, 94, 22, 15, - 0.4, 0, Math.PI * 2 );
		ctx.rect( 63, 20, 9, 74 );
		ctx.moveTo( 63, 20 );
		ctx.bezierCurveTo( 72, 42, 106, 44, 98, 80 );
		ctx.bezierCurveTo( 94, 60, 84, 54, 70, 50 );
		ctx.closePath();

	} ) );
	draw( SHAPES.notes, () => outlined( () => {

		ctx.beginPath();
		ctx.ellipse( 34, 98, 19, 13, - 0.4, 0, Math.PI * 2 );
		ctx.ellipse( 90, 86, 19, 13, - 0.4, 0, Math.PI * 2 );
		ctx.rect( 45, 28, 8, 70 );
		ctx.rect( 101, 16, 8, 70 );
		ctx.moveTo( 45, 26 );
		ctx.lineTo( 109, 12 );
		ctx.lineTo( 109, 30 );
		ctx.lineTo( 45, 44 );
		ctx.closePath();

	} ) );
	// A cherry blossom's petal, notched at its tip, a little deeper at its base.
	draw( SHAPES.petal, m => {

		const gradient = ctx.createLinearGradient( 0, 12, 0, CELL - 8 );
		gradient.addColorStop( 0, '#fff' );
		gradient.addColorStop( 1, 'rgb(205,205,205)' );
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.moveTo( m, 120 );
		ctx.bezierCurveTo( 22, 98, 16, 42, 36, 18 );
		ctx.bezierCurveTo( 47, 6, 58, 12, m, 28 );
		ctx.bezierCurveTo( 70, 12, 81, 6, 92, 18 );
		ctx.bezierCurveTo( 112, 42, 106, 98, m, 120 );
		ctx.fill();

	} );
	// A little ghost: round on top, its hem in scallops, two dark eyes and a small "oo" of a mouth.
	// Only the white of it takes its colour: the eyes stay dark.
	draw( SHAPES.ghost, m => {

		ctx.beginPath();
		ctx.moveTo( 22, 112 );
		ctx.lineTo( 22, 58 );
		ctx.arc( m, 58, 42, Math.PI, 0 );
		ctx.lineTo( 106, 112 );
		for ( let i = 1; i <= 3; i ++ ) ctx.quadraticCurveTo( 106 - i * 28 + 14, 94, 106 - i * 28, 112 );
		ctx.closePath();
		ctx.lineJoin = 'round';
		ctx.lineWidth = 8;
		ctx.strokeStyle = 'rgb(150,150,150)';
		ctx.stroke();
		ctx.fillStyle = '#fff';
		ctx.fill();
		ctx.fillStyle = 'rgb(38,38,48)';
		for ( const [ x, y, rx, ry ] of [ [ m - 15, 58, 7, 10 ], [ m + 15, 58, 7, 10 ], [ m, 84, 6, 7 ] ] ) {

			ctx.beginPath();
			ctx.ellipse( x, y, rx, ry, 0, 0, Math.PI * 2 );
			ctx.fill();

		}

		ctx.fillStyle = '#fff';
		for ( const x of [ m - 13, m + 17 ] ) {

			ctx.beginPath();
			ctx.arc( x, 54, 2.5, 0, Math.PI * 2 );
			ctx.fill();

		}

	} );
	// A shard of ice, drawn along its axis: a long six-sided crystal, lit from one side, in a glow.
	draw( SHAPES.shard, m => {

		const gradient = ctx.createLinearGradient( m - 16, 0, m + 16, 0 );
		gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
		gradient.addColorStop( 0.5, 'rgba(255,255,255,0.75)' );
		gradient.addColorStop( 1, 'rgba(255,255,255,0.45)' );
		ctx.fillStyle = gradient;
		ctx.shadowColor = '#fff';
		ctx.shadowBlur = 8;
		ctx.beginPath();
		ctx.moveTo( m, 6 );
		ctx.lineTo( m + 16, 32 );
		ctx.lineTo( m + 16, 96 );
		ctx.lineTo( m, 122 );
		ctx.lineTo( m - 16, 96 );
		ctx.lineTo( m - 16, 32 );
		ctx.closePath();
		ctx.fill();
		ctx.shadowBlur = 0;
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo( m, 12 );
		ctx.lineTo( m, 116 );
		ctx.stroke();

	} );
	// A puff of cloud: soft round lumps run together, for smoke, mist and nebulae.
	draw( SHAPES.puff, m => {

		for ( const [ x, y, r ] of [ [ 0, 6, 40 ], [ - 22, - 4, 30 ], [ 22, - 8, 32 ], [ - 8, - 22, 28 ], [ 14, 18, 28 ], [ - 24, 18, 24 ] ] ) {

			const gradient = ctx.createRadialGradient( m + x, m + y, 0, m + x, m + y, r );
			gradient.addColorStop( 0, 'rgba(255,255,255,0.5)' );
			gradient.addColorStop( 0.6, 'rgba(255,255,255,0.28)' );
			gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
			ctx.fillStyle = gradient;
			ctx.fillRect( 0, 0, CELL, CELL );

		}

	} );
	// A butterfly, seen from above, its wings open: big upper wings, smaller lower ones, a pale spot
	// on each, and a dark body with its feelers. Squashed across, it flaps.
	draw( SHAPES.butterfly, m => {

		ctx.lineWidth = 4;
		ctx.strokeStyle = 'rgb(105,105,105)';
		for ( const side of [ - 1, 1 ] ) for ( const [ x, y, rx, ry, turn, shade ] of [ [ 27, - 16, 25, 33, 0.55, 255 ], [ 20, 24, 17, 22, - 0.45, 222 ] ] ) {

			ctx.fillStyle = `rgb(${ shade },${ shade },${ shade })`;
			ctx.beginPath();
			ctx.ellipse( m + side * x, m + y, rx, ry, side * turn, 0, Math.PI * 2 );
			ctx.fill();
			ctx.stroke();

		}

		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		for ( const side of [ - 1, 1 ] ) {

			ctx.beginPath();
			ctx.arc( m + side * 32, m - 24, 8, 0, Math.PI * 2 );
			ctx.fill();

		}

		ctx.fillStyle = 'rgb(55,50,50)';
		ctx.beginPath();
		ctx.ellipse( m, m + 4, 6, 30, 0, 0, Math.PI * 2 );
		ctx.fill();
		ctx.strokeStyle = 'rgb(55,50,50)';
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo( m - 2, m - 22 );
		ctx.quadraticCurveTo( m - 6, m - 40, m - 16, m - 50 );
		ctx.moveTo( m + 2, m - 22 );
		ctx.quadraticCurveTo( m + 6, m - 40, m + 16, m - 50 );
		ctx.stroke();

	} );
	// A wisp: a soft tongue of light, round at its foot and drawn up to a curling tip.
	draw( SHAPES.wisp, m => {

		const gradient = ctx.createRadialGradient( m, 86, 0, m, 86, 44 );
		gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
		gradient.addColorStop( 0.5, 'rgba(255,255,255,0.7)' );
		gradient.addColorStop( 1, 'rgba(255,255,255,0.2)' );
		ctx.fillStyle = gradient;
		ctx.shadowColor = '#fff';
		ctx.shadowBlur = 14;
		ctx.beginPath();
		ctx.moveTo( m + 8, 12 );
		ctx.bezierCurveTo( m + 2, 36, m + 32, 52, m + 28, 86 );
		ctx.arc( m, 86, 28, 0, Math.PI );
		ctx.bezierCurveTo( m - 30, 58, m - 6, 44, m + 8, 12 );
		ctx.fill();

	} );
	// A cherry blossom: five notched petals round a little golden middle.
	draw( SHAPES.blossom, m => {

		for ( let i = 0; i < 5; i ++ ) {

			ctx.save();
			ctx.translate( m, m );
			ctx.rotate( i / 5 * Math.PI * 2 );
			const gradient = ctx.createLinearGradient( 0, 0, 0, - 58 );
			gradient.addColorStop( 0, 'rgb(200,200,200)' );
			gradient.addColorStop( 0.5, '#fff' );
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.moveTo( 0, 0 );
			ctx.bezierCurveTo( - 28, - 14, - 30, - 50, - 11, - 58 );
			ctx.quadraticCurveTo( - 4, - 60, 0, - 51 );
			ctx.quadraticCurveTo( 4, - 60, 11, - 58 );
			ctx.bezierCurveTo( 30, - 50, 28, - 14, 0, 0 );
			ctx.fill();
			ctx.restore();

		}

		ctx.fillStyle = 'rgb(255,226,140)';
		ctx.beginPath();
		ctx.arc( m, m, 10, 0, Math.PI * 2 );
		ctx.fill();

	} );
	// A beam of light, drawn along its axis: sharp and bright down its middle, fading out towards its
	// far end (the top).
	draw( SHAPES.beam, () => {

		across( [ [ 0, 0 ], [ 0.3, 0.1 ], [ 0.44, 0.6 ], [ 0.5, 1 ], [ 0.56, 0.6 ], [ 0.7, 0.1 ], [ 1, 0 ] ] );
		ctx.globalCompositeOperation = 'destination-in';
		const along = ctx.createLinearGradient( 0, 0, 0, CELL );
		along.addColorStop( 0, 'rgba(255,255,255,0)' );
		along.addColorStop( 0.5, 'rgba(255,255,255,0.75)' );
		along.addColorStop( 1, 'rgba(255,255,255,1)' );
		ctx.fillStyle = along;
		ctx.fillRect( 0, 0, CELL, CELL );

	} );

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
uniform vec4 uFloor;
varying vec2 vUv;
varying vec4 vColour;
varying vec3 vWorld;
varying float vFloored;
varying float vDepth;

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
	vDepth = - mv.z;
	#include <logdepthbuf_vertex>
	// Where it is in the world (the batch's own frame), for the floor (see Batch.floor): back from
	// the view, which a camera's matrix, turning and moving only, gives straight back.
	vec3 rel = mv.xyz - viewMatrix[ 3 ].xyz;
	vWorld = vec3( dot( viewMatrix[ 0 ].xyz, rel ), dot( viewMatrix[ 1 ].xyz, rel ), dot( viewMatrix[ 2 ].xyz, rel ) );
	// Lying flat on it (a ring on the ground), it's drawn whole.
	vFloored = aAxis.w > 1.5 && abs( dot( normalize( aAxis.xyz ), uFloor.xyz ) ) > 0.9 ? 0.0 : 1.0;
	vec2 cell = vec2( mod( aShape.w, uCells ), floor( aShape.w / uCells ) );
	// A little inside the cell, so its edge never takes in the next one's.
	vUv = ( cell + vec2( corner.x, - corner.y ) * 0.485 + 0.5 ) / uCells;
	vColour = aColour;

}
`;

// Quads nearer the camera than NEAR_FADE's second (m) fade out, gone by its first.
const NEAR_FADE = [ 0.6, 2.2 ];
const FRAGMENT = /* glsl */`
#define NEAR_FADE vec2( ${ NEAR_FADE[ 0 ].toFixed( 2 ) }, ${ NEAR_FADE[ 1 ].toFixed( 2 ) } )
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec4 uFloor;
uniform vec4 uNear;
uniform float uSoft;
varying vec2 vUv;
varying vec4 vColour;
varying vec3 vWorld;
varying float vFloored;
varying float vDepth;

void main() {

	vec4 picture = texture2D( map, vUv );
	// Near the vehicle, fading out down to the floor, so the ground never cuts it off along a hard
	// line; further off, as it is (the floor under the vehicle isn't the ground there).
	float near = 1.0 - smoothstep( 0.6, 1.0, distance( vWorld, uNear.xyz ) / uNear.w );
	float floored = mix( 1.0, smoothstep( 0.0, uSoft, dot( uFloor.xyz, vWorld ) + uFloor.w ), near * vFloored );
	// Right in front of the camera (a piece that's caught up with it as the vehicle slows), faded
	// out rather than filling the view.
	float clear = smoothstep( NEAR_FADE.x, NEAR_FADE.y, vDepth );
	gl_FragColor = vec4( vColour.rgb * picture.rgb, vColour.a * picture.a * floored * clear );
	if ( gl_FragColor.a < 0.004 ) discard;
	#include <logdepthbuf_fragment>
	#include <colorspace_fragment>

}
`;

// `particles` that live, move and fade, and room for `quads` put down for one frame only. Made
// once; nothing in it is made again.
export class Batch {

	constructor( root, { particles, quads = 0, blending = NormalBlending } ) {

		this.items = Array.from( { length: particles }, () => ( {
			age: Infinity, life: 1, position: new Vector3(), velocity: new Vector3(), carry: new Vector3(), axis: new Vector3(), colour: new Color(),
			size: 1, grow: 0, aspect: 1, turn: 0, spin: 0, alpha: 1, frame: 0, mode: FACING, drag: 0, fall: 0, phase: 0, kind: 0, fresh: false,
		} ) );
		this.next = 0;
		// What its particles fall by (m/s², the world's own: drive-bursts.js has the Moon's there).
		this.gravity = 9.81;
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
			// No floor until one's given (see floor).
			uniforms: { map: { value: getSheet() }, uCells: { value: CELLS }, uFloor: { value: new Vector4( 0, 1, 0, 1e6 ) }, uNear: { value: new Vector4( 0, 0, 0, 1 ) }, uSoft: { value: 1 } },
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
		// So whoever made it can find it among the rest (drive-fx.js tells each where the ground is).
		this.mesh.userData.batch = this;
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

	// The ground under the vehicle, a plane through `at` square to `up` (world, unit), or null for
	// none: within `reach` m of `at` its quads fade out over the last `soft` m down to it rather than
	// being cut off where they go into the ground (a flash or a ring at a low exhaust, say). Those
	// lying flat on it are whole.
	floor( at, up, soft, reach ) {

		const { uFloor, uNear, uSoft } = this.mesh.material.uniforms;
		if ( at ) {

			uFloor.value.set( up.x, up.y, up.z, - up.dot( at ) );
			uNear.value.set( at.x, at.y, at.z, reach );

		} else uFloor.value.set( 0, 1, 0, 1e6 );
		uSoft.value = soft;

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

				p.velocity.y -= this.gravity * p.fall * dt;
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
// and its right), middle (the middle of its box, world), ground (on its wheels, a point a little
// over the ground under it, world), scale (1 for a kart, more for something bigger), hot (how far
// into overdrive the flame is, 0 to 1, eased in and out), lit (how big the flame burns, 0 to 1:
// dying down over a few hundredths of a second once it's let go, and stepping through its misfires
// while it coughs, run dry), dry (coughing now), calm (the visitor asked for less motion), detail
// (fewer particles on a phone, 0 to 1), air (false where there's none: World Drive's Moon) and
// gravity (the world's, a share of the Earth's) }. Each style's stream runs at flow( frame ) (see
// there), so it thins out with the flame as it's let go and sputters with its coughs; in overdrive
// each has a form of its own; and let go, cool( frame, dry, detail, calm ) gives it a moment of its
// own (run dry, a sputter).
//
// A style: `flame`, colours for the classic flame's cones and glow { outer, inner, halo } or just
// { halo } for a glow alone, with how long (`length`) and how wildly (`flicker`) it burns and
// whether its cone and glow are drawn over what's behind them (`deep`, as drive-fx.js's DEEP
// flames are) rather than added to it, or null for none; `tint`, the colour its ignition flashes
// in (see drive-bursts.js); and make( root ), its batches, update( frame ) and ignite( frame,
// detail, calm ): a burst of its own as the booster lights, `detail` of its usual count (fewer on a
// phone), with no flash of its own when `calm` (the visitor asked for less motion): no flare, bright
// core or flash at a bolt's end or in a rocket's burst, and any starburst or ring fainter. What a
// style does each frame is made once, in make(), so a frame makes nothing new; an ignition reuses
// its particles, the oldest first. A style may also cool its exhaust in colours of its own (`ember`
// and `ash`, see drive-bursts.js), keep the supersonic shock diamonds out of its flame
// (`flame.diamonds` false: it draws its own overdrive there) or burn them in a colour of its own
// (`flame.diamondTint`).

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

// Flung out of where it is any way at once, as a burst throws it: carried along at `inherit` of
// the vehicle's velocity, out at about `speed` m/s (half that to half as much again), and `back`
// m/s more out of its back and `up` m/s up.
function flung( frame, p, inherit, speed, back = 0, up = 0 ) {

	p.carry.copy( frame.velocity ).multiplyScalar( inherit );
	_a.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 );
	if ( _a.lengthSq() < 1e-6 ) _a.set( 0, 1, 0 );
	p.velocity.copy( _a.normalize() ).multiplyScalar( speed * ( 0.5 + Math.random() ) ).addScaledVector( frame.back, back ).addScaledVector( frame.up, up );

}

// The way `angle` (rad) round the back of it, across the way it points: 0 to its right, a quarter
// turn up. Into `target`.
function around( frame, angle, target ) {

	return target.copy( frame.right ).multiplyScalar( Math.cos( angle ) ).addScaledVector( frame.up, Math.sin( angle ) );

}

function pick( list ) {

	return list[ Math.floor( Math.random() * list.length ) ];

}

// A splat on the road behind it, `size` m across (times its scale), lasting `life` s: flat on the
// ground its wheels are on, left where it lands. Flung along the road the faster it goes, so at
// speed they join into a trail rather than dots too far apart. Flat on level ground the quad's own
// across is -Z and its up -X (see the shader), so that's the turn to the way it's going. Returns
// the particle, for its colour.
function onRoad( batch, f, size, life, cap = 3 ) {

	const { size: box } = f;
	const p = batch.spawn( life );
	f.pivot.localToWorld( p.position.set( ( Math.random() - 0.5 ) * box.width * 0.7 / box.scale, INK_LIFT / box.scale, ( box.rear + 0.3 + Math.random() * 1.2 ) / box.scale ) );
	lay( p, f, size, cap );
	return p;

}

// A splat as onRoad's, where `at` (world) comes down on the road: put on the ground under the
// vehicle, as onRoad's are (a drop landing, a blob of slime).
function splatAt( batch, f, at, size, life, cap = 3 ) {

	const p = batch.spawn( life );
	p.position.copy( at ).addScaledVector( f.up, INK_LIFT - _a.subVectors( at, f.ground ).dot( f.up ) );
	lay( p, f, size, cap );
	return p;

}

// Lying flat on the road, `size` m across (times its scale), stretched out along the way it's going
// (up to `cap` times) the faster it goes.
function lay( p, f, size, cap ) {

	p.axis.copy( f.up );
	p.mode = FLAT;
	p.frame = SHAPES.splat + Math.floor( Math.random() * 3 );
	const speed = Math.hypot( f.velocity.x, f.velocity.z );
	const stretch = Math.min( cap, 1 + speed / 15 );
	p.size = size * f.scale * stretch;
	p.aspect = 1 / stretch;
	p.turn = speed > 1 ? Math.atan2( - f.velocity.x, - f.velocity.z ) + ( Math.random() - 0.5 ) * 0.4 : Math.random() * Math.PI * 2;

}

// Particles that glow and fade in and out over their life (mist, nebulae, wisps), rather than
// starting at their brightest.
function swell( t ) {

	return Math.sin( t * Math.PI );

}

// A jagged line from `from` along `toward` (unit) for `length` m in `steps`, wandering up to
// `wander` m off it, as strips `width` m wide in two layers: a thin bright core and a wide glow (at
// `glowAlpha`). Its pieces are `kind` 1 (flickering, see makeFlicker) unless asked otherwise.
// Each piece keeps going with the vehicle for its short life, so the bolt stays on it. Returns
// where it ended (a vector of this module's own: copy it).
function bolt( batch, frame, from, toward, length, steps, wander, width, life, core, glow, glowAlpha = 0.45, kind = 1 ) {

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
			piece.alpha = layer ? glowAlpha : 1;
			piece.carry.copy( frame.velocity );
			piece.kind = kind;

		}

		_b.copy( _p );

	}

	return _b;

}

// A bolt flickers, on and off over its short life, rather than fading; for a visitor asking for less
// motion (the frame's `calm`) it only shimmers a little. `getFrame()`: the style's frame now.
function makeFlicker( getFrame ) {

	return {
		look( p, t, view ) {

			if ( p.kind !== 1 ) return;
			if ( getFrame()?.calm ) view.alpha = p.alpha * ( 0.8 + 0.2 * Math.sin( p.age * 12 + p.phase ) );
			else view.alpha = p.alpha * ( Math.sin( p.age * 90 + p.phase ) > - 0.3 ? 1 : 0.25 );

		},
	};

}

// A star twinkles as it turns.
const TWINKLE = {
	look( p, t, view ) {

		view.sx *= 0.4 + 0.6 * Math.abs( Math.sin( p.age * 28 + p.phase ) );
		view.sy = view.sx;

	},
};

// How hard a style's stream runs this frame (0 to 1), for its rates, sizes and brightness: what the
// booster asks while it's held, and once it's let go a little less than the flame's own dying down
// (frame.lit, see drive-fx.js's FLAME_FALL), so a stream thins out over about a quarter of a second
// with the flame rather than stopping in one frame; run dry, it sputters on the flame's own coughs.
// Held, the flame burns as hard as it's asked (a drift boost's half included), so that's as it was.
function flow( f ) {

	return Math.max( f.power, ( f.lit ?? 0 ) * 0.6 );

}

// How far into overdrive, for what changes in a step rather than a blend (a new kind of particle,
// a faster beat): nothing until the flame is a third of the way hot, then 0 to 1.
function overdrive( f ) {

	return f.hot > 0.3 ? ( f.hot - 0.3 ) / 0.7 : 0;

}

// With no air (the Moon) nothing floats: whatever of `p`'s own velocity is up is taken out.
function sink( p, f ) {

	const up = p.velocity.dot( f.up );
	if ( up > 0 ) p.velocity.addScaledVector( f.up, - up );

}

// Linear colours made once, for looks that change a particle's colour as it ages.
const PIXEL_RAMP = [ 0xffffff, 0xffe14d, 0xff9a1f, 0xff3b5c, 0xa866ff ].map( hex => new Color( hex ) );
const RAINBOW = [ 0xff3b3b, 0xff9a1f, 0xffe14d, 0x3ce05a, 0x2f8bff, 0xa866ff ];
// Colours picked from as particles are made, kept here so making one makes no list.
const DRAGON_EMBERS = [ 0xffa040, 0xffd070, 0xff6020 ];
const DRAGON_SMOKE = [ 0x3c3330, 0x544640, 0x2e2826 ];
const FOIL = [ 0xffd75e, 0xdfe6ee ];
const SPOOKY_WISPS = [ 0x5dffb4, 0xa98bff, 0x5dd8ff ];
const VACUUM_SIZE = [ 0.15, 0.3, 0.5 ];
const VACUUM_ALPHA = [ 0.5, 0.3, 0.15 ];

const STYLES = {

	// A blue-white electric flame that crackles with little arcs, pinched by magnetic rings, throwing
	// blue sparks. In overdrive a cage of arcs reaches back to it off the corners of the body; let go,
	// a ball of lightning hangs at the exhaust and pops.
	plasma: {
		flame: { outer: 0x2f8dff, inner: 0xf2fbff, halo: 0x7cc8ff, length: 1.15, flicker: 2.2 },
		tint: 0x7cc8ff,
		make( root ) {

			const PINCHES = 3;
			const batch = new Batch( root, { particles: 190, quads: PINCHES * 2, blending: AdditiveBlending } );
			const sparks = emitter();
			const out = new Vector3();
			const corner = new Vector3();
			const blue = new Color( 0x7cc8ff );
			const violet = new Color( 0xc9b8ff );
			const ring = new Color();
			let f = null;
			let arcDue = 0;
			let cageDue = 0;
			let cage = 0;
			const spark = k => {

				const p = batch.spawn( 0.3 + Math.random() * 0.25 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.5 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.88, 3 + Math.random() * 3, 0, 1.6 );
				p.mode = ALONG;
				p.frame = SHAPES.spark;
				p.size = ( 0.03 + Math.random() * 0.02 ) * f.scale;
				p.colour.set( Math.random() < 0.5 ? 0x9fdcff : 0xffffff );
				p.drag = 1.5;

			};
			const flicker = makeFlicker( () => f );
			const hooks = {
				look( p, t, view ) {

					// A spark is drawn along the way it flies, longer the faster.
					if ( p.kind === 0 && p.mode === ALONG ) {

						p.axis.copy( p.velocity ).multiplyScalar( 0.025 );
						if ( p.axis.lengthSq() < ( 0.04 * f.scale ) ** 2 ) p.axis.setLength( 0.04 * f.scale );

					} else if ( p.kind === 1 ) flicker.look( p, t, view );
					else if ( p.kind === 2 ) {

						// Ball lightning shrinks as it hangs, and pops into a starburst at the end.
						view.sx = view.sy = p.size * ( 1 - 0.5 * t );
						view.alpha = p.alpha;
						if ( t > 0.8 && ! f.calm ) {

							view.frame = SHAPES.burst;
							view.sx = view.sy = view.sx * 1.6;
							view.alpha = p.alpha * ( 1 - t ) * 5;

						}

					} else if ( p.kind === 3 ) view.alpha = p.alpha * swell( t );

				},
				// Popped: a few short arcs down off it.
				died( p ) {

					if ( p.kind !== 2 || f.calm ) return;
					for ( let i = 0; i < 3; i ++ ) {

						out.copy( f.back ).sub( f.up ).addScaledVector( f.right, ( i - 1 ) * 0.8 ).normalize();
						bolt( batch, f, p.position, out, 0.5 * f.scale, 2, 0.08 * f.scale, 0.04 * f.scale, 0.08, 0xf4fbff, 0x4aa8ff, 0.6 );

					}

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const { clock, dt, scale, hot } = frame;
					const fl = flow( frame );
					batch.begin();
					// Magnetic pinches down the flame: rings running back from the nozzle and narrowing as they
					// go, faster and tighter in overdrive.
					if ( fl > 0.01 ) {

						const length = 1.1 * scale;
						ring.lerpColors( blue, violet, hot );
						for ( let i = 0; i < PINCHES; i ++ ) {

							const d = ( ( clock * ( 2.2 + 2 * hot ) + i / PINCHES ) % 1 ) * length;
							const radius = ( 0.2 - 0.06 * hot ) * scale * ( 1 - 0.5 * d / length ) * ( 0.6 + 0.4 * fl );
							const throb = frame.calm ? 0.7 : 1 + 0.15 * Math.sin( clock * 40 + i );
							_v.copy( frame.nozzle ).addScaledVector( frame.back, d );
							batch.put( _v, frame.back, FLAT, radius, radius, 0, SHAPES.ring, ring, fl * ( 1 - d / length ) * 0.8 * throb );

						}

					}

					sparks( fl, dt, 90 * frame.detail, spark );
					// Every few hundredths of a second, a little arc off the flame (more often in overdrive).
					arcDue -= dt;
					while ( fl > 0.01 && arcDue <= 0 ) {

						arcDue += 0.025 / fl * ( 1 - 0.4 * hot );
						const angle = Math.random() * Math.PI * 2;
						const reach = 0.22 * scale;
						_v.copy( frame.nozzle ).addScaledVector( frame.back, Math.random() * 0.7 * scale )
							.addScaledVector( frame.right, Math.cos( angle ) * reach ).addScaledVector( frame.up, Math.sin( angle ) * reach );
						out.copy( frame.right ).multiplyScalar( Math.cos( angle ) ).addScaledVector( frame.up, Math.sin( angle ) ).addScaledVector( frame.back, 0.6 ).normalize();
						bolt( batch, frame, _v, out, ( 0.45 + Math.random() * 0.5 ) * scale, 3, 0.1 * scale, 0.055 * scale, 0.05 + Math.random() * 0.05, 0xf4fbff, 0x4aa8ff, 0.6 );

					}

					if ( fl <= 0.01 ) arcDue = 0;
					// Overdrive: a Tesla cage, arcs reaching in to the flame off the corners of its back.
					cageDue -= dt;
					if ( overdrive( frame ) > 0 && fl > 0.01 ) {

						const { width, height, rear, scale: own } = frame.size;
						while ( cageDue <= 0 ) {

							cageDue += frame.calm ? 0.12 : 0.06;
							const c = cage ++ % 4;
							frame.pivot.localToWorld( corner.set( ( c & 1 ? 0.5 : - 0.5 ) * width / own, height * ( c & 2 ? 0.8 : 0.2 ) / own, rear / own ) );
							out.copy( frame.nozzle ).addScaledVector( frame.back, scale ).sub( corner );
							const length = out.length();
							bolt( batch, frame, corner, out.divideScalar( length ), length, 4, 0.08 * scale, 0.045 * scale, 0.08, 0xffffff, 0x8a7dff, 0.6 );

						}

					} else cageDue = Math.max( cageDue, 0 );

					batch.update( dt, hooks );

				},
				// Lit: a crackle of arcs all round the exhaust at once, and a spray of sparks.
				ignite( frame, detail ) {

					f = frame;
					for ( let i = 0; i < 6; i ++ ) {

						around( frame, ( i + Math.random() * 0.6 ) / 6 * Math.PI * 2, out ).addScaledVector( frame.back, 0.5 ).normalize();
						bolt( batch, frame, frame.nozzle, out, ( 0.6 + Math.random() * 0.5 ) * frame.scale, 4, 0.12 * frame.scale, 0.04 * frame.scale, 0.1 + Math.random() * 0.08, 0xf4fbff, 0x4aa8ff );

					}

					for ( let i = Math.round( 28 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.3 + Math.random() * 0.3 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.85, 4, 2 );
						p.frame = SHAPES.glow;
						p.size = ( 0.09 + Math.random() * 0.08 ) * frame.scale;
						p.colour.set( Math.random() < 0.5 ? 0x9fdcff : 0xffffff );
						p.drag = 2;

					}

				},
				// Let go: a ball of lightning hangs at the exhaust, shrinking, and pops (for a visitor asking
				// for less motion it only shrinks away). Run dry, a whiff of ozone round it.
				cool( frame, dry, detail ) {

					f = frame;
					const ball = batch.spawn( 0.22 );
					ball.position.copy( frame.nozzle );
					ball.carry.copy( frame.velocity );
					ball.frame = SHAPES.glow;
					ball.size = 0.45 * frame.scale;
					ball.colour.set( 0xbfe6ff );
					ball.kind = 2;
					if ( ! dry || ! frame.air ) return;
					for ( let i = Math.round( 8 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.6 + Math.random() * 0.3 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.9, 0.8, 0.5, 0.3 );
						p.frame = SHAPES.soft;
						p.size = 0.12 * frame.scale;
						p.grow = 0.3 * frame.scale;
						p.colour.set( 0x9fc8ff );
						p.alpha = 0.25;
						p.drag = 1.5;
						p.kind = 3;

					}

				},
			};

		},
	},

	// Forked lightning crackling back from the exhaust: bolts with branches, gone in a flicker and
	// struck again, now and then grounding on the road with a scorch. In overdrive a steady return
	// stroke runs straight back from it and the forks crawl forward round its flanks.
	lightning: {
		flame: { outer: 0x7a4dff, inner: 0xffffff, halo: 0xb48cff, length: 0.55, flicker: 2 },
		tint: 0xc8b0ff,
		make( root ) {

			const batch = new Batch( root, { particles: 260, blending: AdditiveBlending } );
			const way = new Vector3();
			const fork = new Vector3();
			const tip = new Vector3();
			const crawl = new Vector3();
			const glow = new Color( 0x8a5cff );
			const purple = new Color( 0x8a5cff );
			const dull = new Color( 0x6a4dbf );
			let f = null;
			let due = 0;
			let returnDue = 0;
			let strikes = 0;
			const flicker = makeFlicker( () => f );
			// Where a strike ends: a hot point of light, a little star (it flickers; a visitor asking
			// for less motion only sees the core), round a little glow.
			const flash = ( at, life, size = 1 ) => {

				if ( ! f.calm ) {

					const spark = batch.spawn( life );
					spark.position.copy( at );
					spark.carry.copy( f.velocity );
					spark.frame = SHAPES.star;
					spark.size = 0.16 * f.scale * size;
					spark.turn = Math.random() * Math.PI;
					spark.colour.set( 0xf3eaff );
					spark.kind = 1;

				}

				const core = batch.spawn( life );
				core.position.copy( at );
				core.carry.copy( f.velocity );
				core.frame = SHAPES.glow;
				core.size = 0.12 * f.scale * size;
				core.colour.set( 0xc8b0ff );
				core.kind = 1;

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const { hot, scale } = frame;
					const fl = flow( frame );
					batch.begin();
					due -= frame.dt;
					while ( fl > 0.01 && due <= 0 ) {

						due += 0.055 - 0.015 * hot;
						for ( let n = 0; n < 2; n ++ ) {

							// Back and fanned out to one side or the other and up: crackling round the back
							// of it rather than reaching all the way back to the camera. In overdrive the forks
							// crawl forward round its flanks.
							let length = ( 1.3 + Math.random() ) * scale * ( 0.6 + 0.4 * fl );
							const side = Math.random() < 0.5 ? - 1 : 1;
							way.copy( frame.back ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 1.4 ).addScaledVector( frame.up, ( Math.random() - 0.15 ) * 0.9 ).normalize();
							if ( hot > 0 ) way.lerp( crawl.copy( frame.back ).multiplyScalar( - 0.3 ).addScaledVector( frame.right, side ).addScaledVector( frame.up, 0.5 ).normalize(), hot * 0.7 ).normalize();
							// Every third strike, on the ground, reaches down to the road behind it.
							const grounding = frame.grounded && strikes ++ % 3 === 0;
							if ( grounding ) {

								tip.copy( frame.nozzle ).addScaledVector( frame.back, ( 1 + Math.random() * 0.8 ) * scale ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 1.2 * scale );
								tip.addScaledVector( frame.up, - _a.subVectors( tip, frame.ground ).dot( frame.up ) );
								way.subVectors( tip, frame.nozzle );
								length = way.length();
								way.divideScalar( length );

							}

							const life = 0.07 + Math.random() * 0.06;
							// Sputtering out, its last forks dull as they die.
							glow.lerpColors( purple, dull, 1 - fl );
							tip.copy( bolt( batch, frame, frame.nozzle, way, length, 6, 0.16 * scale, 0.045 * scale, life, 0xf3eaff, glow ) );
							// A branch off it, from somewhere along its first half.
							fork.copy( frame.nozzle ).lerp( tip, 0.25 + Math.random() * 0.3 );
							way.addScaledVector( frame.right, side * 0.9 ).addScaledVector( frame.up, ( Math.random() - 0.5 ) * 0.8 ).normalize();
							bolt( batch, frame, fork, way, length * 0.5, 3, 0.1 * scale, 0.03 * scale, life * 0.8, 0xe4d6ff, 0x7a4dff );
							flash( tip, life );
							// Grounded, a scorch flashes on the road where it struck.
							if ( grounding && ! frame.calm ) {

								const scorch = batch.spawn( 0.12 );
								scorch.position.copy( tip ).addScaledVector( frame.up, INK_LIFT );
								scorch.carry.copy( frame.velocity ).multiplyScalar( 0.9 );
								scorch.axis.copy( frame.up );
								scorch.mode = FLAT;
								scorch.frame = SHAPES.burst;
								scorch.size = 0.35 * scale;
								scorch.colour.set( 0x8a5cff );
								scorch.alpha = 0.5;
								scorch.turn = Math.random() * Math.PI;

							}

						}

					}

					if ( fl <= 0.01 ) due = 0;
					// Overdrive: a return stroke, one straight bright channel back along its path, steady.
					returnDue -= frame.dt;
					if ( hot > 0.4 && fl > 0.01 ) {

						while ( returnDue <= 0 ) {

							returnDue += 0.08;
							bolt( batch, frame, frame.nozzle, frame.back, ( 2.5 + hot ) * scale, 8, 0.06 * scale, 0.07 * scale, 0.1, 0xffffff, 0xb48cff, 0.45, 0 );

						}

					} else returnDue = Math.max( returnDue, 0 );

					batch.update( frame.dt, flicker );

				},
				// Lit: a strike, four long forks thrown out behind and to both sides at once, each with a
				// flash where it ends (not for a visitor asking for less motion).
				ignite( frame, detail, calm ) {

					for ( let n = 0; n < 4; n ++ ) {

						const length = ( 2 + Math.random() ) * frame.scale;
						way.copy( frame.back ).addScaledVector( frame.right, ( n - 1.5 ) * 0.9 ).addScaledVector( frame.up, 0.2 + Math.random() * 0.6 ).normalize();
						const life = 0.16 + Math.random() * 0.08;
						tip.copy( bolt( batch, frame, frame.nozzle, way, length, 7, 0.2 * frame.scale, 0.06 * frame.scale, life, 0xf3eaff, 0x8a5cff ) );
						if ( calm ) continue;
						const flash = batch.spawn( life );
						flash.position.copy( tip );
						flash.carry.copy( frame.velocity );
						flash.frame = SHAPES.glow;
						flash.size = 0.45 * frame.scale;
						flash.colour.set( 0xc8b0ff );
						flash.kind = 1;

					}

				},
				// Let go: a last strike straight back, with a flash at its tip.
				cool( frame ) {

					f = frame;
					tip.copy( bolt( batch, frame, frame.nozzle, frame.back, 3 * frame.scale, 8, 0.18 * frame.scale, 0.05 * frame.scale, 0.16, 0xf3eaff, 0x8a5cff ) );
					flash( tip, 0.16, 1.4 );

				},
			};

		},
	},

	// Glitter: a corkscrew of twinkling stars in white, gold, pink, sky and lilac twisting back from
	// the exhaust in a scatter of more, now and then a big one catching the light. In overdrive it
	// tightens into a white-hot spiral of diamond dust with gems in it; let go, the glitter drifts
	// down.
	glitter: {
		flame: { halo: 0xfff3c4, length: 0.6, flicker: 1 },
		tint: 0xfff3c4,
		make( root ) {

			const batch = new Batch( root, { particles: 260, blending: AdditiveBlending } );
			const stars = emitter();
			const helices = [ emitter(), emitter() ];
			const gems = emitter();
			const colours = [ 0xffffff, 0xffe08a, 0xffb3ec, 0xa8f0ff, 0xd9b8ff ];
			const dust = [ 0xffffff, 0xfff6d0, 0xd8f4ff ];
			let f = null;
			let n = 0;
			let spin = 0;
			let pinches = 0;
			let pinchDue = 0;
			let strand = 0;
			// A star: every seventh a big one, which glints.
			const star = ( p, size ) => {

				p.frame = SHAPES.star;
				if ( n % 7 === 0 ) {

					p.size = ( 0.17 + Math.random() * 0.05 ) * f.scale;
					p.colour.set( Math.random() < 0.5 ? 0xffffff : 0xffe08a );
					p.life = 0.9;

				} else {

					p.size = size;
					p.colour.set( colours[ n % colours.length ] );

				}

				n ++;
				p.spin = ( Math.random() - 0.5 ) * 4;

			};
			const scatter = k => {

				const p = batch.spawn( 0.5 + Math.random() * 0.45 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.6, ( Math.random() - 0.3 ) * f.size.height * 0.5, p.position );
				thrown( f, p, 0.9, 2 + Math.random() * 2, 0.4, 1.8 );
				p.fall = 0.12;
				p.drag = 0.8;
				if ( overdrive( f ) > 0 ) {

					// Diamond dust: streaks of white-hot light.
					p.mode = ALONG;
					p.frame = SHAPES.spark;
					p.axis.copy( f.back ).multiplyScalar( 0.12 * f.scale * f.hot );
					p.size = ( 0.03 + Math.random() * 0.02 ) * f.scale;
					p.colour.set( pick( dust ) );
					p.kind = 1;

				} else star( p, ( 0.07 + Math.random() * 0.08 ) * f.scale );

			};
			// Two strands of a corkscrew, kept up with it so the twist reads at speed.
			const helix = k => {

				const p = batch.spawn( 0.7 );
				const angle = spin + strand * Math.PI;
				const radius = ( 0.28 - 0.1 * f.hot ) * f.scale;
				nozzleAt( f, k, Math.cos( angle ) * radius, Math.sin( angle ) * radius, p.position );
				thrown( f, p, 0.96, 1.2, 0, 0.2 );
				star( p, ( 0.06 + Math.random() * 0.04 ) * f.scale );
				if ( f.hot > 0.3 ) p.colour.set( pick( dust ) );

			};
			const gem = k => {

				const p = batch.spawn( 0.7 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, ( Math.random() - 0.5 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.95, 1.5, 0.2, 0.4 );
				p.frame = SHAPES.diamond;
				p.size = 0.16 * f.scale;
				p.colour.set( pick( dust ) );
				p.alpha = 0.8;
				p.spin = 6;
				p.kind = 2;

			};
			const pinch = size => {

				for ( let i = 0; i < 4; i ++ ) {

					const p = batch.spawn( 0.5 + Math.random() * 0.2 );
					p.position.copy( f.nozzle );
					flung( f, p, 0.9, 0.6, 0.5 );
					p.frame = SHAPES.star;
					p.size = size * f.scale;
					p.colour.set( 0xffe08a );
					p.fall = 0.3;
					p.drag = 1;

				}

			};
			const hooks = {
				look( p, t, view ) {

					if ( p.kind !== 0 ) return;
					TWINKLE.look( p, t, view );
					// A big star catches the light now and then: a cross glint.
					if ( ! f.calm && p.size > 0.16 * f.scale && Math.sin( p.age * 28 + p.phase ) > 0.96 ) {

						view.frame = SHAPES.flare;
						view.sx *= 1.4;
						view.sy = view.sx;

					}

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					spin += frame.dt * ( 14 + 8 * frame.hot );
					batch.begin();
					stars( fl, frame.dt, 160 * frame.detail, scatter );
					for ( strand = 0; strand < 2; strand ++ ) helices[ strand ]( fl, frame.dt, 50 * frame.detail, helix );
					gems( overdrive( frame ) > 0 ? fl : 0, frame.dt, 2, gem );
					// Run dry: the shaker running empty, three pinches, each smaller.
					if ( pinches > 0 ) {

						pinchDue -= frame.dt;
						if ( pinchDue <= 0 ) {

							pinch( [ 0.1, 0.07, 0.05 ][ 3 - pinches ] );
							pinches --;
							pinchDue = 0.12;

						}

					}

					batch.update( frame.dt, hooks );

				},
				// Lit: a puff of stars bursting out of the exhaust every way.
				ignite( frame, detail ) {

					for ( let i = Math.round( 60 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.5 + Math.random() * 0.5 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.85, 3.5, 1.5, 0.8 );
						p.frame = SHAPES.star;
						p.size = ( 0.08 + Math.random() * 0.1 ) * frame.scale;
						p.colour.set( colours[ n ++ % colours.length ] );
						p.fall = 0.1;
						p.drag = 2.2;
						p.spin = ( Math.random() - 0.5 ) * 4;

					}

				},
				// Let go: the glitter in the air slows and drifts down, and a last puff of it; run dry, the
				// shaker gives three pinches, each smaller, and is empty.
				cool( frame, dry, detail ) {

					f = frame;
					for ( const p of batch.items ) if ( p.age < p.life ) {

						p.drag = 3;
						p.fall = 0.15;

					}

					for ( let i = Math.round( 18 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.5 + Math.random() * 0.4 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.9, 1.5, 0.8 );
						star( p, ( 0.05 + Math.random() * 0.05 ) * frame.scale );
						p.drag = 3;
						p.fall = 0.15;

					}

					if ( dry ) {

						pinches = 3;
						pinchDue = 0;

					}

				},
			};

		},
	},

	// Soap bubbles blown out of a wand at the exhaust, one swelling there as it goes, floating up and
	// wobbling away, each popping into a ring and droplets at the end. In overdrive the jet goes fizzy:
	// a stream of little bubbles, and now and then a big one riding along with it.
	bubbles: {
		flame: null,
		tint: 0xbff3ff,
		make( root ) {

			const batch = new Batch( root, { particles: 170, quads: 2 } );
			const bubbles = emitter();
			const tints = [ 0xc4f6ff, 0xffd4f4, 0xe3d0ff, 0xd2ffe8, 0xfff4c4 ];
			const wand = new Color();
			let f = null;
			let since = 0;
			let rider = 0;
			// A bubble: wobbling up (kind 0); fizz (1) only streams back. With no air, nothing floats or
			// wobbles, and they don't last as long.
			const blow = ( p, size ) => {

				p.frame = SHAPES.bubble;
				p.size = size;
				p.grow = p.size * 0.25;
				p.colour.set( pick( tints ) );
				p.alpha = 0.95;
				p.fall = f.air ? - 0.05 : 0.4;
				p.drag = 0.9;
				if ( ! f.air ) {

					sink( p, f );
					p.life *= 0.5;

				}

			};
			const bubble = k => {

				since = 0;
				const fizz = overdrive( f ) > 0;
				const p = batch.spawn( fizz ? 0.35 : 0.9 + Math.random() * 0.6 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.4 ) * 0.3 * f.scale, p.position );
				if ( fizz ) {

					thrown( f, p, 0.95, 1.5 + Math.random(), 0.3, 0.2 );
					blow( p, ( 0.04 + Math.random() * 0.04 ) * f.scale );
					p.kind = 1;

				} else {

					thrown( f, p, 0.9, 1.5 + Math.random() * 1.5, 0.6, 0.6 );
					blow( p, ( 0.1 + Math.random() * 0.2 ) * f.scale );

				}

			};
			// Droplets of soap flung off a bubble as it pops.
			const droplets = ( from, count ) => {

				for ( let i = 0; i < count; i ++ ) {

					const p = batch.spawn( 0.2 );
					p.position.copy( from.position );
					p.carry.copy( from.carry );
					_a.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).normalize();
					p.velocity.copy( _a ).multiplyScalar( 1.2 );
					p.frame = SHAPES.drop;
					p.size = 0.03 * f.scale;
					p.colour.copy( from.colour );
					p.fall = 0.4;
					p.kind = 2;

				}

			};
			const hooks = {
				// Wobbling side to side as it rises.
				step( p, dt ) {

					if ( p.kind === 0 && f.air ) p.velocity.addScaledVector( f.right, Math.sin( p.age * 6 + p.phase ) * 1.6 * dt );

				},
				look( p, t, view ) {

					if ( p.kind === 2 ) return;
					// Clear until it pops: a ring, flicking out.
					const end = p.kind === 3 ? 0.7 : 0.9;
					if ( p.kind === 3 ) view.sx = view.sy = p.size * ( 1 + 2.5 * Math.min( 1, t / end ) );
					if ( t > end ) {

						view.frame = SHAPES.ring;
						view.sx *= 1.3;
						view.alpha = p.alpha * ( 1 - t ) / ( 1 - end ) * 0.6;

					} else view.alpha = p.alpha;
					view.sy = view.sx;

				},
				// A big bubble pops into droplets (not for a visitor asking for less motion).
				died( p ) {

					if ( f.calm ) return;
					if ( p.kind === 3 ) droplets( p, 5 );
					else if ( p.kind === 0 && p.size > 0.18 * f.scale ) droplets( p, 3 );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					const h = overdrive( frame );
					since += frame.dt;
					batch.begin();
					// The wand at the exhaust, slowly changing colour, with the next bubble swelling in it.
					if ( fl > 0.01 ) {

						wand.setHSL( frame.clock * 0.3 % 1, 0.6, 0.85 );
						const ring = 0.2 * frame.scale;
						batch.put( frame.nozzle, frame.back, FLAT, ring, ring, 0, SHAPES.ring, wand, 0.7 * fl );
						const swelling = ( 0.1 + 0.15 * Math.min( 1, since * 55 * fl ) ) * frame.scale;
						_v.copy( frame.nozzle ).addScaledVector( frame.back, swelling * 0.6 );
						batch.put( _v, frame.up, FACING, swelling, swelling, 0, SHAPES.bubble, wand, 0.9 * fl );

					}

					bubbles( fl, frame.dt, ( 55 + 85 * h ) * frame.detail, bubble );
					// Overdrive: now and then a big one riding along with it, over the fizz.
					rider -= frame.dt;
					if ( h > 0 && fl > 0.01 && rider <= 0 ) {

						rider = 0.4;
						const p = batch.spawn( 1.2 );
						p.position.copy( frame.nozzle ).addScaledVector( frame.back, 0.5 * frame.scale ).addScaledVector( frame.up, 0.1 * frame.scale );
						thrown( frame, p, 0.99, 2.5, 0.2, 0.2 );
						blow( p, 0.3 * frame.scale );

					}

					batch.update( frame.dt, hooks );

				},
				// Lit: a froth of big bubbles blown out round the exhaust, popping sooner.
				ignite( frame, detail ) {

					f = frame;
					for ( let i = Math.round( 16 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.6 + Math.random() * 0.5 );
						p.position.copy( frame.nozzle ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 0.8 * frame.scale ).addScaledVector( frame.up, ( Math.random() - 0.3 ) * 0.5 * frame.scale );
						flung( frame, p, 0.9, 2.2, 0.5, 1.2 );
						blow( p, ( 0.12 + Math.random() * 0.16 ) * frame.scale );
						p.grow = p.size * 0.3;
						p.drag = 1.6;

					}

				},
				// Let go: the wand lets go of one last big bubble; run dry, one swells at the exhaust and
				// pops at once.
				cool( frame, dry ) {

					f = frame;
					const p = batch.spawn( dry ? 0.15 : 1.6 );
					p.position.copy( frame.nozzle );
					thrown( frame, p, 0.93, dry ? 0.3 : 1, 0.2, 0 );
					blow( p, ( dry ? 0.1 : 0.45 ) * frame.scale );
					if ( dry ) {

						p.grow = 0;
						p.kind = 3;

					} else if ( frame.air ) p.fall = - 0.08;

				},
			};

		},
	},

	// Confetti: little paper rectangles in party colours shot out of two cannons at the corners of
	// its back, tumbling down as they flutter behind, with curling streamers. In overdrive, a ticker-
	// tape parade with flashing foil in it; let go, a last popper.
	confetti: {
		flame: null,
		tint: 0xffd84d,
		make( root ) {

			const batch = new Batch( root, { particles: 230 } );
			const pieces = emitter();
			const streamers = emitter();
			const colours = [ 0xff3b5c, 0xffc21a, 0x2fd06b, 0x2f9bff, 0xb05cff, 0xff7ad9, 0xffffff ];
			let f = null;
			let side = 1;
			// A piece of paper (kind 0), or of foil (2), which flashes as it turns to the light.
			const paper = ( p, size ) => {

				p.frame = SHAPES.square;
				p.size = size;
				p.aspect = 0.55;
				const foil = overdrive( f ) > 0 && Math.random() < 0.4;
				p.colour.set( foil ? pick( FOIL ) : pick( colours ) );
				p.kind = foil ? 2 : 0;
				p.fall = 0.3;
				p.drag = f.air ? 1.1 : 0;
				p.spin = ( Math.random() - 0.5 ) * 18;
				p.turn = Math.random() * Math.PI;

			};
			// Out of one corner cannon or the other: up and out, a V of confetti behind it.
			const cannon = ( p, k ) => {

				side = - side;
				nozzleAt( f, k, side * f.size.width * 0.45, f.size.height * 0.3, p.position );
				thrown( f, p, 0.93, 2 + Math.random() * 2, 2.8, 1.2 );
				p.velocity.addScaledVector( f.right, side * 1.5 );

			};
			const piece = k => {

				const p = batch.spawn( 1 + Math.random() * 0.5 );
				cannon( p, k );
				paper( p, ( 0.085 + Math.random() * 0.03 ) * f.scale );

			};
			// A streamer, curling as it flies (kind 1).
			const streamer = ( k, limp = false ) => {

				const p = batch.spawn( 1.4 );
				if ( limp ) {

					p.position.copy( f.nozzle );
					p.carry.copy( f.velocity ).multiplyScalar( 0.9 );
					p.velocity.copy( f.back ).multiplyScalar( 0.2 );
					p.fall = 0.6;

				} else {

					cannon( p, k );
					p.fall = 0.3;
					p.drag = f.air ? 1.1 : 0;

				}

				p.mode = ALONG;
				p.frame = SHAPES.streak;
				p.size = 0.04 * f.scale;
				p.axis.copy( limp ? f.up : p.velocity ).setLength( 0.35 * f.scale );
				p.colour.set( pick( colours ) );
				p.kind = 1;
				return p;

			};
			const hooks = {
				// A streamer curls one way and the other behind (not with no air), and lies along the way
				// it goes.
				step( p, dt ) {

					if ( p.kind !== 1 ) return;
					if ( f.air ) p.velocity.addScaledVector( f.right, Math.sin( p.age * 9 + p.phase ) * 3 * dt );
					if ( p.velocity.lengthSq() > 1e-4 ) p.axis.copy( p.velocity ).setLength( 0.35 * f.scale );

				},
				look( p, t, view ) {

					view.alpha = t < 0.8 ? 1 : ( 1 - t ) * 5;
					if ( p.kind === 1 ) return;
					// Turning over and over: edge on, then flat (with no air, it tumbles rigid).
					const face = Math.abs( Math.cos( p.age * 11 + p.phase ) );
					if ( f.air ) view.sy *= 0.15 + 0.85 * face;
					// Foil flashes as it faces the light (just a little brighter for a visitor asking for
					// less motion).
					if ( p.kind === 2 && face > 0.93 && ! f.calm ) {

						view.frame = SHAPES.flare;
						view.sx *= 1.8;
						view.sy = view.sx;

					}

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					const h = overdrive( frame );
					batch.begin();
					pieces( fl, frame.dt, ( 110 + 50 * h ) * frame.detail, piece );
					streamers( fl, frame.dt, ( 6 + 4 * h ) * frame.detail, streamer );
					batch.update( frame.dt, hooks );

				},
				// Lit: a party popper, a cone of confetti shot up and out behind (none so big or flung so
				// far back that it flies into the view).
				ignite( frame, detail ) {

					f = frame;
					for ( let i = Math.round( 70 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 1 + Math.random() * 0.6 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.95, 2.5, 0, 3.5 + Math.random() * 3 );
						paper( p, ( 0.07 + Math.random() * 0.02 ) * frame.scale );
						p.fall = 0.35;
						p.drag = frame.air ? 1.8 : 0;
						p.spin = ( Math.random() - 0.5 ) * 20;

					}

				},
				// Let go: a last little popper and a couple of streamers; run dry, one limp streamer flops
				// out.
				cool( frame, dry, detail ) {

					f = frame;
					if ( dry ) {

						streamer( 1, true );
						return;

					}

					for ( let i = Math.round( 24 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.9 + Math.random() * 0.4 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.93, 1.5, 0.5, 4 );
						paper( p, ( 0.07 + Math.random() * 0.02 ) * frame.scale );

					}

					for ( let i = 0; i < 2; i ++ ) streamer( 1 );

				},
			};

		},
	},

	// Hearts streaming out behind, big ones and little ones, all beating together, lub-dub. In
	// overdrive they spiral out in two strands and each beat sends a ring of heart out round it; let
	// go, they float up like a blown kiss.
	hearts: {
		flame: { halo: 0xff6fb5, length: 0.5, flicker: 0.6 },
		tint: 0xff6fb5,
		make( root ) {

			const batch = new Batch( root, { particles: 100 } );
			const hearts = emitter();
			const colours = [ 0xff3d7f, 0xff6fae, 0xff9ccc, 0xff2f6e ];
			let f = null;
			let n = 0;
			let phase = 0;
			let beat = 0;
			let beating = false;
			const pulse = x => Math.max( 0, Math.sin( 2 * Math.PI * x ) ) ** 8;
			const heart = k => {

				const p = batch.spawn( 1 + Math.random() * 0.5 );
				const big = n ++ % 4 === 0;
				p.frame = SHAPES.heart;
				p.colour.set( pick( colours ) );
				p.fall = - 0.08;
				p.drag = 1;
				if ( big ) {

					// Started a little behind the seat, so the big ones don't rise over the driver.
					nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.35, ( Math.random() - 0.2 ) * 0.15 * f.scale, p.position )
						.addScaledVector( f.back, 0.3 * f.scale );
					thrown( f, p, 0.97, 1.4 + Math.random() * 0.6, 1.2, 0.3 );
					p.size = ( 0.15 + Math.random() * 0.03 ) * f.scale;
					p.grow = p.size * 0.2;
					p.kind = 1;

				} else if ( overdrive( f ) > 0 ) {

					// Two strands spiralling out of the exhaust.
					const angle = f.clock * 10 + ( n & 1 ) * Math.PI;
					nozzleAt( f, k, Math.cos( angle ) * 0.35 * f.scale, Math.sin( angle ) * 0.35 * f.scale, p.position );
					thrown( f, p, 0.97, 1.5, 0.3, 0.2 );
					p.size = ( 0.08 + Math.random() * 0.04 ) * f.scale;
					p.colour.set( n & 1 ? 0xffe3f0 : 0xff3d7f );

				} else {

					nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.2 ) * 0.3 * f.scale, p.position );
					// (Kept up with it, a few metres of hearts behind it rather than a stream past the lens.)
					thrown( f, p, 0.97, 1.2 + Math.random() * 0.6, 1.1, 0.6 );
					p.size = ( 0.08 + Math.random() * 0.04 ) * f.scale;
					p.grow = p.size * 0.3;

				}

				return p;

			};
			const hooks = {
				step( p, dt ) {

					if ( p.kind < 2 ) p.velocity.addScaledVector( f.right, Math.sin( p.age * 4 + p.phase ) * 1.8 * dt );

				},
				look( p, t, view ) {

					if ( p.kind === 2 ) {

						// A burst of little hearts on the beat, shrinking away.
						view.sx *= 1 - t * t;
						view.sy = view.sx;
						view.alpha = 1;
						return;

					}

					// All beating together, the big ones harder; a broken heart doesn't.
					if ( p.kind < 2 ) view.sx *= 1 + beat * ( p.kind === 1 ? 0.18 : 0.12 );
					view.sy = view.sx;
					if ( p.kind < 3 ) view.turn = 0.3 * Math.sin( p.age * 3 + p.phase );
					// Going, a heart shrinks away rather than fading: see-through, its pink over the grey
					// road turns muddy. Shrunk away over the vehicle itself too, so it never hides the driver.
					let shrink = t < 0.7 ? 1 : ( 1 - t ) / 0.3;
					const near = view.position.distanceTo( f.middle ) / f.scale;
					if ( near < 1.2 ) shrink *= Math.max( 0, ( near - 0.55 ) / 0.65 );
					// And well behind it, before the chase camera's near fade turns it see-through.
					const behind = _a.subVectors( view.position, f.middle ).dot( f.back ) / f.scale;
					if ( behind > 2.4 ) shrink *= Math.max( 0, ( 3.4 - behind ) );
					view.sx *= shrink;
					view.sy *= shrink;
					view.alpha = shrink > 0.05 ? 1 : 0;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					// One heartbeat for all of them, lub-dub, quicker as it boosts harder and in overdrive
					// (gentler, a single beat, for a visitor asking for less motion).
					phase += frame.dt * ( 1.4 + 0.6 * fl + frame.hot );
					beat = frame.calm ? 0.3 * pulse( phase ) : pulse( phase ) + 0.6 * pulse( phase - 0.18 );
					// Overdrive: on each beat, a ring of heart blown out round it.
					const was = beating;
					beating = beat > 0.8 * ( frame.calm ? 0.3 : 1 );
					if ( beating && ! was && overdrive( frame ) > 0 && fl > 0.01 ) {

						// Little solid hearts, kept at the exhaust and gone quickly (a see-through ring of
						// heart, pink over the grey road, only turned muddy).
						const count = frame.calm ? 4 : 6;
						for ( let i = 0; i < count; i ++ ) {

							const p = batch.spawn( 0.4 );
							around( frame, ( i + 0.5 ) / count * Math.PI * 2, _v );
							p.position.copy( frame.nozzle ).addScaledVector( frame.back, 0.2 * frame.scale ).addScaledVector( _v, 0.15 * frame.scale );
							p.carry.copy( frame.velocity );
							p.velocity.copy( _v ).multiplyScalar( frame.calm ? 1.2 : 2 );
							p.drag = 2;
							p.frame = SHAPES.heart;
							p.size = 0.07 * frame.scale;
							p.colour.set( i & 1 ? 0xffe3f0 : 0xff3d7f );
							p.kind = 2;

						}

					}

					batch.begin();
					hearts( fl, frame.dt, ( 30 + 6 * frame.hot ) * frame.detail, heart );
					batch.update( frame.dt, hooks );

				},
				// Lit: a ring of hearts thrown out round the exhaust, then rising and swaying away.
				ignite( frame, detail ) {

					const count = Math.max( 6, Math.round( 10 * detail ) );
					for ( let i = 0; i < count; i ++ ) {

						const p = batch.spawn( 1 + Math.random() * 0.3 );
						around( frame, i / count * Math.PI * 2, _v );
						p.position.copy( frame.nozzle ).addScaledVector( _v, 0.2 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.85 );
						p.velocity.copy( _v ).multiplyScalar( 2.6 ).addScaledVector( frame.back, 1 ).addScaledVector( frame.up, 0.6 );
						p.frame = SHAPES.heart;
						p.size = ( 0.16 + Math.random() * 0.08 ) * frame.scale;
						p.grow = p.size * 0.3;
						p.colour.set( colours[ i % colours.length ] );
						p.fall = - 0.1;
						p.drag = 1.4;

					}

				},
				// Let go: a blown kiss, the hearts floating up and away. Run dry: heartbreak, three big
				// dull hearts drooping out of it.
				cool( frame, dry ) {

					f = frame;
					for ( const p of batch.items ) if ( p.age < p.life && p.kind < 2 ) {

						// Drifting back as they rise, not hanging over it: what's thrown them back is
						// kept (no more drag), and the stream carries them on a little less.
						p.fall = frame.air ? - 0.3 : 0;
						p.carry.multiplyScalar( 0.95 );
						p.velocity.addScaledVector( frame.up, frame.air ? 1.1 : 0 ).addScaledVector( frame.back, 0.8 );

					}

					if ( ! dry ) return;
					for ( let i = 0; i < 3; i ++ ) {

						const p = batch.spawn( 1 );
						p.position.copy( frame.nozzle ).addScaledVector( frame.right, ( i - 1 ) * 0.15 * frame.scale );
						thrown( frame, p, 0.9, 0.8, 0.4, 0.3 );
						p.frame = SHAPES.heart;
						p.size = 0.22 * frame.scale;
						p.colour.set( 0xb04a6e );
						p.fall = 0.6;
						p.spin = frame.calm ? 0 : ( i - 1 || 1 ) * 4;
						p.kind = 3;

					}

				},
			};

		},
	},

	// Pixels: chunky squares in three lanes, on a grid that moves with it, white-hot at the exhaust and
	// cooling through yellow, orange and red to purple, shrinking in steps and blinking out, as an old
	// game would draw them. In overdrive, a rainbow band of scan lines; let go, the trail powers down
	// in steps, and run dry it's game over.
	pixel: {
		flame: null,
		tint: 0xffe14d,
		make( root ) {

			const batch = new Batch( root, { particles: 190 } );
			const pixels = emitter();
			let f = null;
			let grid = 0.17;
			let n = 0;
			const pixel = k => {

				const p = batch.spawn( 0.7 + Math.random() * 0.35 );
				p.frame = SHAPES.pixel;
				p.size = grid;
				if ( overdrive( f ) > 0 ) {

					// A rainbow band lying across the road behind it, one pixel in each lane in turn, and now
					// and then a white one: stacked up, the chase camera sees it end on, a tower of cubes
					// straight down the view with the top ones over the driver's back.
					const row = n ++ % 6;
					nozzleAt( f, k, ( row - 2.5 ) * grid * 0.85, - 0.12 * f.scale, p.position ).addScaledVector( f.back, 0.2 * f.scale );
					thrown( f, p, 0.97, 2.2, 0, 0 );
					p.size = grid * 0.8;
					p.colour.set( RAINBOW[ row ] );
					p.kind = 2;
					if ( row === 5 && ( n / 6 | 0 ) % 4 === 0 && ! f.calm ) {

						const white = batch.spawn( p.life );
						nozzleAt( f, k, ( Math.floor( Math.random() * 6 ) - 2.5 ) * grid * 0.85, - 0.12 * f.scale, white.position ).addScaledVector( f.back, 0.2 * f.scale );
						white.carry.copy( p.carry );
						white.velocity.copy( p.velocity );
						white.frame = SHAPES.pixel;
						white.size = p.size;
						white.colour.setHex( 0xffffff );
						white.kind = 2;

					}

				} else {

					// (Out of the exhaust a little way back, so the white-hot ones aren't stuck on its rear,
					// and kept up with it, a trail behind it rather than big cubes flying past the lens.)
					nozzleAt( f, k, ( Math.floor( Math.random() * 3 ) - 1 ) * grid, ( Math.random() - 0.5 ) * 0.25 * f.scale, p.position ).addScaledVector( f.back, 0.15 * f.scale );
					thrown( f, p, 0.97, 1.6 + Math.random() * 0.8, 0.3, 0.3 );
					p.drag = 0.6;
					p.size = grid * 0.75;
					p.life *= 0.75;

				}

			};
			const hooks = {
				look( p, t, view ) {

					// On a grid that moves with it: from the exhaust, so many squares right, up and back.
					_v.subVectors( p.position, f.nozzle );
					const right = Math.round( _v.dot( f.right ) / grid ) * grid;
					const up = Math.round( _v.dot( f.up ) / grid ) * grid;
					const back = Math.round( _v.dot( f.back ) / grid ) * grid;
					view.position.copy( f.nozzle ).addScaledVector( f.right, right ).addScaledVector( f.up, up ).addScaledVector( f.back, back );
					view.turn = 0;
					if ( p.kind === 3 ) {

						// Game over: grey, blinking (only fading for a visitor asking for less motion).
						view.alpha = f.calm ? 1 - t : Math.floor( p.age * 16 ) % 2;
						return;

					}

					view.sx = view.sy = p.size * ( t < 0.4 ? 1 : t < 0.7 ? 0.66 : 0.4 );
					// Cooling in steps as it ages, as the palette of an old game would.
					if ( p.kind === 0 ) p.colour.copy( PIXEL_RAMP[ t < 0.15 ? 0 : t < 0.35 ? 1 : t < 0.55 ? 2 : t < 0.8 ? 3 : 4 ] );
					// Solid, then blinking out (a rainbow band, or for a visitor asking for less motion any
					// pixel, only fades).
					view.alpha = p.kind === 2 || f.calm ? Math.min( 1, ( 1 - t ) * 4 ) : t < 0.85 || Math.floor( p.age * 24 ) % 2 ? 1 : 0;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					grid = 0.17 * frame.scale;
					batch.begin();
					pixels( flow( frame ), frame.dt, ( overdrive( frame ) > 0 ? 110 : 60 ) * frame.detail, pixel );
					batch.update( frame.dt, hooks );

				},
				// Lit: an old game's explosion, pixels thrown out eight ways in rings, white-hot inside.
				ignite( frame, detail ) {

					const rings = detail < 1 ? 2 : 3;
					for ( let way = 0; way < 8; way ++ ) for ( let ring = 0; ring < rings; ring ++ ) {

						const p = batch.spawn( 0.45 + ring * 0.12 );
						around( frame, way / 8 * Math.PI * 2, _v );
						p.position.copy( frame.nozzle );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.85 );
						p.velocity.copy( _v ).multiplyScalar( 2 + ring * 1.6 ).addScaledVector( frame.back, 1.5 );
						p.frame = SHAPES.pixel;
						p.size = grid;
						p.colour.copy( PIXEL_RAMP[ ring ] );
						p.drag = 1.2;
						// Its own colours, not the cooling ones.
						p.kind = 1;

					}

				},
				// Let go: the trail powers down, every pixel shrinking to its next step at once, and the
				// last of it breaks up into a little puff of pixels, as an old game's sprite does. Run
				// dry: game over, grey pixels tumbling out of it, blinking.
				cool( frame, dry ) {

					f = frame;
					for ( const p of batch.items ) if ( p.age < p.life && p.kind !== 3 ) {

						const t = p.age / p.life;
						p.age = p.life * ( t < 0.4 ? 0.4 : t < 0.7 ? 0.7 : Math.max( t, 0.85 ) );

					}

					if ( ! dry ) {

						for ( let i = 0; i < 8; i ++ ) {

							const p = batch.spawn( 0.5 + Math.random() * 0.15 );
							around( frame, i / 8 * Math.PI * 2, _v );
							p.position.copy( frame.nozzle ).addScaledVector( frame.back, 0.2 * frame.scale );
							p.carry.copy( frame.velocity ).multiplyScalar( 0.95 );
							p.velocity.copy( _v ).multiplyScalar( 2.2 ).addScaledVector( frame.back, 0.8 );
							p.frame = SHAPES.pixel;
							p.size = grid * 0.8;
							p.colour.copy( PIXEL_RAMP[ 1 + i % 4 ] );
							p.drag = 2;
							p.kind = 1;

						}

						return;

					}

					for ( let i = 0; i < 14; i ++ ) {

						const p = batch.spawn( 1 + Math.random() * 0.3 );
						p.position.copy( frame.nozzle ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 0.5 * frame.scale );
						thrown( frame, p, 0.95, 1, 1.2, 0.8 );
						p.frame = SHAPES.pixel;
						p.size = grid * 0.8;
						p.colour.set( i % 4 ? 0x8a8a8a : 0xff3b5c );
						p.fall = 0.8;
						p.drag = 0.5;
						p.kind = 3;

					}

				},
			};

		},
	},

	// Fireworks: little rockets shot out behind on short arcs, trailing sparks, that burst just over
	// and behind it: peonies, rings and drooping golden willows, in colours that show in daylight. In
	// overdrive a grand finale, rockets in pairs bursting in rings; let go, a last salvo, and run dry,
	// a couple of duds.
	fireworks: {
		flame: { halo: 0xffe0a0, length: 0.5, flicker: 1 },
		tint: 0xffe0a0,
		make( root ) {

			// The rockets, flashes and embers glow (added over the scene); the bursts' stars are drawn over
			// it in their own colours, so a red or a blue one still reads against a bright daytime sky,
			// where added light would wash out to nothing.
			const batch = new Batch( root, { particles: 110, blending: AdditiveBlending } );
			const stars = new Batch( root, { particles: 210 } );
			const rockets = emitter();
			const colours = [ 0xff3355, 0xffb000, 0x22ff88, 0x33aaff, 0xcc55ff ];
			const CARRIED = 1;
			// (A burst's stars the same: they hang where they burst, in view, as they spread.)
			const STARS_CARRIED = 1;
			let f = null;
			let scale = 1;
			let pair = 1;
			// Where an ignition's starburst bursts from, as a rocket would.
			const shell = { position: new Vector3(), carry: new Vector3(), velocity: new Vector3() };
			// A rocket: kind 1, or 3 for one that bursts without its flash (a visitor asking for less
			// motion); 7 and 8 the same for a salvo's, which always bursts as a peony; 5 a dud.
			const launch = ( p, kind ) => {

				p.mode = ALONG;
				p.frame = SHAPES.spark;
				p.size = 0.05 * scale;
				p.colour.set( 0xfff0c0 );
				p.fall = 0.6;
				p.kind = kind;

			};
			const rocket = k => {

				// Straight up, kept up with it, so they burst a metre and a half over it just behind the
				// driver: the chase camera's only a few metres back, looking down, so anything lower or
				// further back is below the bottom of the view or right in front of the lens.
				const h = overdrive( f );
				const p = batch.spawn( 0.45 + Math.random() * 0.1 );
				nozzleAt( f, k, 0, 0, p.position );
				thrown( f, p, 1, 0.2 + Math.random() * 0.3, 4.6 + Math.random() * 0.6, 0.4 );
				launch( p, f.calm ? 3 : 1 );
				if ( h > 0 ) {

					// In pairs, out to both sides.
					pair = - pair;
					p.velocity.addScaledVector( f.right, pair * 1.8 );

				}

			};
			// A burst of sparks in one colour where `from` is, round a flash (unless not `bright`): a
			// peony every way (`peony`, as an ignition's always is), a ring or a golden willow drooping,
			// or in overdrive always a ring.
			const burst = ( from, bright = true, peony = false ) => {

				const form = peony ? 0 : overdrive( f ) > 0 ? 1 : Math.floor( Math.random() * 3 );
				const willow = form === 2;
				const colour = willow ? 0xffc04d : pick( colours );
				const count = form === 0 ? 14 : form === 1 ? 16 : 12;
				for ( let i = 0; i < count; i ++ ) {

					const spark = stars.spawn( willow ? 1.1 : 0.55 + Math.random() * 0.3 );
					spark.position.copy( from.position );
					if ( form === 1 ) around( f, ( i + Math.random() * 0.2 ) / count * Math.PI * 2, _v );
					else _v.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).normalize();
					// All round, carried on with the rocket: each star a bold streak of colour drawn back
					// along the way it flies out (see starHooks), wide enough to read in daylight.
					spark.carry.copy( from.carry );
					spark.velocity.copy( from.velocity ).multiplyScalar( 0.3 ).addScaledVector( _v, form === 1 ? 3 : 2.6 + Math.random() * 0.5 );
					spark.mode = ALONG;
					spark.frame = SHAPES.spark;
					spark.axis.copy( spark.velocity ).multiplyScalar( - 0.07 );
					spark.size = 0.1 * scale;
					spark.colour.set( colour );
					spark.fall = willow ? 0.9 : 0.45;
					// With no air, nothing slows them: perfect spheres widening as they fall.
					spark.drag = ! f.air ? 0 : willow ? 3 : 1.6;
					spark.kind = willow ? 4 : 2;

				}

				if ( ! bright ) return;
				const flash = batch.spawn( 0.14 );
				flash.position.copy( from.position );
				flash.carry.copy( from.carry );
				flash.frame = SHAPES.burst;
				flash.size = 0.25 * scale;
				flash.grow = 0.2 * scale;
				flash.colour.set( colour );
				if ( overdrive( f ) > 0 && ! peony ) {

					const flare = batch.spawn( 0.12 );
					flare.position.copy( from.position );
					flare.carry.copy( from.carry );
					flare.frame = SHAPES.flare;
					flare.size = 0.4 * scale;
					flare.aspect = 0.3;
					flare.colour.set( colour );

				}

			};
			// A dud fizzles out, a few dim embers dropping from it.
			const fizzle = from => {

				for ( let i = 0; i < 4; i ++ ) {

					const ember = batch.spawn( 0.6 );
					ember.position.copy( from.position );
					ember.carry.copy( from.carry );
					ember.velocity.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 );
					ember.mode = ALONG;
					ember.frame = SHAPES.spark;
					ember.axis.copy( f.up ).multiplyScalar( 0.04 * scale );
					ember.size = 0.03 * scale;
					ember.colour.set( 0x884422 );
					ember.fall = 1;
					ember.kind = 6;

				}

			};
			// Carried along at the vehicle's speed now, not what it was going as it was thrown:
			// out of a fast-gathering boost a rocket would otherwise fall metres behind before it burst,
			// out of the chase camera's view.
			const keepUp = {
				step( p ) {

					p.carry.copy( f.velocity ).multiplyScalar( CARRIED );

				},
			};
			const hooks = {
				step: keepUp.step,
				died( p ) {

					// Where it's got to this frame (it dies before it moves): a burst left where it was a
					// frame ago would start that far behind, a metre or two at speed.
					p.position.addScaledVector( p.velocity, f.dt ).addScaledVector( p.carry, f.dt );
					if ( p.kind === 1 || p.kind === 3 ) burst( p, p.kind === 1 );
					else if ( p.kind === 7 || p.kind === 8 ) burst( p, p.kind === 7, true );
					else if ( p.kind === 5 ) fizzle( p );

				},
				look( p, t, view ) {

					if ( p.kind === 1 || p.kind === 3 || p.kind === 5 || p.kind === 7 || p.kind === 8 ) {

						// A rocket trails sparks: drawn back along the way it flies.
						p.axis.copy( p.velocity ).multiplyScalar( - 0.05 );
						view.sx = 0.05 * scale;
						view.alpha = p.kind === 5 && ! f.calm ? 0.5 + 0.5 * Math.sin( p.age * 60 + p.phase ) : 1;

					}

				},
			};
			const starHooks = {
				step( p ) {

					p.carry.copy( f.velocity ).multiplyScalar( STARS_CARRIED );

				},
				look( p, t, view ) {

					// Drawn back along the way it flies, shortening as it slows (never shorter than a dot).
					p.axis.copy( p.velocity ).multiplyScalar( - 0.07 );
					const length = p.axis.length();
					if ( length < 0.06 * scale ) p.axis.multiplyScalar( length > 1e-6 ? 0.06 * scale / length : 0 ).add( length > 1e-6 ? _a.set( 0, 0, 0 ) : _a.copy( f.up ).multiplyScalar( - 0.06 * scale ) );
					// Crackling as it fades (only fading for a visitor asking for less motion).
					if ( p.kind === 2 && t > 0.5 ) {

						if ( ! f.calm ) view.alpha *= 0.5 + 0.5 * Math.sin( p.age * 50 + p.phase );

					// A willow droops, thinner as it slows.
					} else if ( p.kind === 4 && t > 0.5 ) view.sx = 0.06 * scale;

				},
			};
			// A salvo of three rockets that burst just over it.
			const salvo = ( frame, calm ) => {

				for ( let i = 0; i < 3; i ++ ) {

					const p = batch.spawn( 0.3 + i * 0.06 );
					p.position.copy( frame.nozzle );
					thrown( frame, p, 1, 0.3, 5.5 + Math.random(), 0.4 );
					p.velocity.addScaledVector( frame.right, ( i - 1 ) * 2.5 );
					launch( p, calm ? 8 : 7 );

				}

			};
			return {
				batches: [ batch, stars ],
				update( frame ) {

					f = frame;
					scale = frame.scale;
					batch.begin();
					stars.begin();
					const h = overdrive( frame );
					rockets( flow( frame ), frame.dt, ( h > 0 ? ( frame.calm ? 11 : 14 ) : 8 ) * frame.detail, rocket );
					batch.update( frame.dt, hooks );
					stars.update( frame.dt, starHooks );

				},
				// Lit: a starburst right at the exhaust, and a salvo of three rockets that burst just over
				// it (all without their flashes for a visitor asking for less motion).
				ignite( frame, detail, calm ) {

					f = frame;
					scale = frame.scale;
					shell.position.copy( frame.nozzle );
					shell.carry.copy( frame.velocity ).multiplyScalar( 0.9 );
					shell.velocity.copy( frame.back ).multiplyScalar( 1.5 );
					burst( shell, ! calm, true );
					salvo( frame, calm );

				},
				// Let go: a last salvo. Run dry: a couple of duds, fizzling out.
				cool( frame, dry, detail, calm ) {

					f = frame;
					scale = frame.scale;
					if ( ! dry ) {

						salvo( frame, calm );
						return;

					}

					for ( let i = 0; i < 2; i ++ ) {

						const p = batch.spawn( 0.3 );
						p.position.copy( frame.nozzle );
						thrown( frame, p, 0.95, 1, 2.5, 0.6 );
						p.velocity.addScaledVector( frame.right, ( i - 0.5 ) * 2 );
						launch( p, 5 );

					}

				},
			};

		},
	},

	// Ink: strings of bright paint flung out behind, splatting where they land on the road and staying
	// a few seconds, in one colour after another. In overdrive, twin pressure-washer jets painting two
	// lanes; let go, a drip and a last blot.
	ink: {
		flame: null,
		tint: 0xff4da6,
		make( root ) {

			const batch = new Batch( root, { particles: 240 } );
			const drops = emitter();
			const splats = emitter();
			const colours = [ 0xff2d95, 0x18d4ff, 0xffd400, 0x7cff2e, 0x9b5cff ];
			const grey = new Color( 0x666666 );
			let f = null;
			let colour = 0;
			let squirt = 0;
			let jet = 1;
			// How long a drop thrown up at `up` m/s takes to come down to the road from the exhaust (it
			// lands as it dies, see died).
			const landing = up => {

				const g = batch.gravity;
				const high = Math.max( 0.05, _a.subVectors( f.nozzle, f.ground ).dot( f.up ) );
				return Math.min( 0.8, Math.max( 0.15, ( up + Math.sqrt( up * up + 2 * g * high ) ) / g ) );

			};
			const drop = k => {

				const twin = overdrive( f ) > 0;
				const up = twin ? 0.3 : 1.4;
				const p = batch.spawn( landing( up ) );
				if ( twin ) {

					// Two tight ropes, one from each side, in two colours.
					jet = - jet;
					nozzleAt( f, k, jet * 0.3 * f.size.width, 0, p.position );
					thrown( f, p, 0.9, 6, up, 0.3 );
					p.colour.set( colours[ ( colour + ( jet > 0 ? 2 : 0 ) ) % colours.length ] );

				} else {

					nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, 0, p.position );
					thrown( f, p, 0.8, 3.5 + Math.random() * 2, up, 1 );
					p.colour.set( colours[ colour ] );

				}

				p.mode = ALONG;
				// Twin jets are tight ropes of it; otherwise strings of drops.
				p.frame = twin ? SHAPES.streak : SHAPES.drop;
				p.size = ( twin ? 0.05 : 0.06 + Math.random() * 0.03 ) * f.scale;
				p.fall = 1;
				return p;

			};
			const splat = () => {

				const p = onRoad( batch, f, 0.35 + Math.random() * 0.35, 5 );
				p.colour.set( colours[ colour ] );
				p.kind = 1;

			};
			const hooks = {
				look( p, t, view ) {

					// A drop is drawn as a string along the way it flies.
					if ( p.kind === 0 ) {

						p.axis.copy( p.velocity ).multiplyScalar( 0.035 );
						if ( p.axis.lengthSq() < 0.0036 ) p.axis.setLength( 0.06 );

					}

					// Splats stay as they are until their last second, then fade; drops don't fade.
					view.alpha = p.kind === 1 ? Math.min( 1, p.life - p.age ) : 1;

				},
				// A drop that comes down on the road it's on splats there.
				died( p ) {

					if ( p.kind !== 0 || ! f.grounded || _a.subVectors( p.position, f.ground ).dot( f.up ) > 0.35 ) return;
					const splat = splatAt( batch, f, p.position, 0.25, 4, overdrive( f ) > 0 ? 4.5 : 3 );
					splat.colour.copy( p.colour );
					splat.kind = 1;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					batch.begin();
					// A new colour every half a second or so of boosting.
					squirt += frame.dt * frame.power;
					if ( squirt > 0.55 ) {

						squirt = 0;
						colour = ( colour + 1 ) % colours.length;

					}

					drops( fl, frame.dt, ( overdrive( frame ) > 0 ? 70 : 46 ) * frame.detail, drop );
					splats( frame.grounded ? fl : 0, frame.dt, 7 * frame.detail, splat );
					batch.update( frame.dt, hooks );

				},
				// Lit: a big splash, blobs flung back and out in a fan, and on the road a few splats at once.
				ignite( frame, detail ) {

					f = frame;
					for ( let i = Math.round( 26 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.35 + Math.random() * 0.25 );
						p.position.copy( frame.nozzle );
						thrown( frame, p, 0.6, 3 + Math.random() * 3, 2 + Math.random() * 2, 0.5 );
						p.velocity.addScaledVector( frame.right, ( Math.random() - 0.5 ) * 6 );
						p.frame = SHAPES.drop;
						p.size = ( 0.08 + Math.random() * 0.08 ) * frame.scale;
						p.colour.set( colours[ colour ] );
						p.fall = 1;
						// Round blobs, not strings: a splash.
						p.kind = 2;

					}

					if ( frame.grounded ) for ( let i = 0; i < 3; i ++ ) splat();

				},
				// Let go: a drip, a few drops dribbling out, and a last blot on the road. Run dry, the
				// blot's half grey: the paint's run out.
				cool( frame, dry ) {

					f = frame;
					for ( let i = 0; i < 4; i ++ ) {

						const p = batch.spawn( Math.min( 0.6, landing( 0 ) + i * 0.05 ) );
						p.position.copy( frame.nozzle ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 0.2 * frame.scale );
						thrown( frame, p, 0.9, 0.3, 0, 0.2 );
						p.mode = ALONG;
						p.frame = SHAPES.drop;
						p.size = 0.05 * frame.scale;
						p.colour.set( colours[ colour ] );
						p.fall = 1;

					}

					if ( ! frame.grounded ) return;
					const blot = onRoad( batch, frame, 0.6, 5 );
					blot.colour.set( colours[ colour ] );
					if ( dry ) blot.colour.lerp( grey, 0.5 );
					blot.kind = 1;

				},
			};

		},
	},

	// Neon rings: glowing double hoops thrown out behind in threes, to a beat, flat across the way it's
	// going, so the camera looks through them, widening as they fade. In overdrive, a warp tunnel of
	// them walking through the hues; let go, the last hoops implode.
	rings: {
		flame: { halo: 0x6ff6ff, length: 0.5, flicker: 0.8 },
		tint: 0x6ff6ff,
		make( root ) {

			const batch = new Batch( root, { particles: 70, blending: AdditiveBlending } );
			const tunnel = emitter();
			const colours = [ 0x3df2ff, 0xff3df0, 0x9dff3d, 0x8f6bff ];
			let f = null;
			let n = 0;
			let group = 0;
			let groupDue = 0;
			let ringDue = 0;
			let left = 0;
			let shock = false;
			// A hoop (kind 0), with a thinner one inside it (1); in the tunnel (2) alone.
			const hoop = ( k, size, grow, inherit, back, life, alpha ) => {

				const p = batch.spawn( life );
				nozzleAt( f, k, 0, 0.32 * f.scale, p.position );
				thrown( f, p, inherit, back, 0, 0 );
				p.axis.copy( f.back );
				p.mode = FLAT;
				p.frame = SHAPES.ring;
				p.size = size * f.scale;
				p.grow = grow * f.scale;
				p.alpha = alpha;
				return p;

			};
			// (Slower, and lasting longer, for a visitor asking for less motion.)
			const double = alpha => {

				const colour = colours[ group % colours.length ];
				const life = f.calm ? 1 : 0.6;
				hoop( 1, 0.36, 0.9, 0.9, 3, life, alpha ).colour.set( colour );
				const inner = hoop( 1, 0.36 * 0.6, 0.9 * 0.6, 0.9, 3, life, 0.6 * alpha );
				inner.colour.set( colour );
				inner.kind = 1;

			};
			const warp = k => {

				// Ring and shock wave by turns (rings alone for a visitor asking for less motion), kept close
				// up with it (any further back and at overdrive's speed they'd pile up over the chase
				// camera and white out the view), fainter the more there are.
				shock = ! shock && ! f.calm;
				const p = hoop( k, 0.45, 0.1, 0.995, 1.5, 0.9, 0.4 );
				p.colour.setHSL( n ++ * 0.04 % 1, 1, 0.6 );
				if ( shock ) p.frame = SHAPES.shock;
				p.kind = 2;

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					const h = overdrive( frame );
					batch.begin();
					// To a beat: three hoops a few hundredths of a second apart, a little over twice a second
					// (slower for a visitor asking for less motion), each three in one colour.
					if ( fl > 0.01 && h === 0 ) {

						groupDue -= frame.dt;
						if ( groupDue <= 0 ) {

							groupDue += frame.calm ? 1 / 1.5 : 1 / 2.3;
							left = 3;
							ringDue = 0;
							group ++;

						}

					} else groupDue = left = 0;
					if ( left > 0 ) {

						ringDue -= frame.dt;
						if ( ringDue <= 0 ) {

							ringDue += 0.06;
							left --;
							double( fl );

						}

					}

					// Overdrive: a tunnel of them, walking through the hues.
					tunnel( h > 0 ? fl : 0, frame.dt, ( frame.calm ? 16 : 26 ) * frame.detail, warp );
					batch.update( frame.dt );

				},
				// Lit: three hoops at once, one inside the next, thrown out wider and faster than the rest.
				ignite( frame ) {

					for ( let i = 0; i < 3; i ++ ) {

						const p = batch.spawn( 0.45 + i * 0.1 );
						p.position.copy( frame.nozzle );
						thrown( frame, p, 0.93, 1 + i, 0, 0 );
						p.axis.copy( frame.back );
						p.mode = FLAT;
						p.frame = SHAPES.ring;
						p.size = ( 0.2 + i * 0.1 ) * frame.scale;
						p.grow = ( 0.8 + i * 0.35 ) * frame.scale;
						p.colour.set( colours[ n ++ % colours.length ] );

					}

				},
				// Let go: the last three hoops implode. Run dry, one big faint ring.
				cool( frame, dry ) {

					f = frame;
					for ( let i = 0; i < 3; i ++ ) {

						let youngest = null;
						for ( const p of batch.items ) if ( p.age < p.life && p.kind !== 3 && ( ! youngest || p.age < youngest.age ) ) youngest = p;
						if ( ! youngest ) break;
						youngest.grow = - youngest.size;
						youngest.life = youngest.age + 0.35;
						youngest.kind = 3;

					}

					if ( ! dry ) return;
					const p = batch.spawn( 0.7 );
					p.position.copy( frame.nozzle );
					thrown( frame, p, 0.95, 1, 0, 0 );
					p.axis.copy( frame.back );
					p.mode = FLAT;
					p.frame = SHAPES.ring;
					p.size = 0.3 * frame.scale;
					p.grow = 2.4 * frame.scale;
					p.colour.set( colours[ group % colours.length ] );
					p.alpha = 0.4;
					p.kind = 3;

				},
			};

		},
	},

	// A comet: a small bright head in a faint blue coma at the exhaust, a straight blue ion tail and
	// a long curving tail of dust that narrows and fades behind it, with a dust of sparks. In
	// overdrive, perihelion: the tails longer and brighter and a flare across the head; let go, it
	// breaks up.
	comet: {
		flame: { outer: 0x7fd8ff, inner: 0xffffff, halo: 0xd6f4ff, length: 0.45, flicker: 0.6 },
		tint: 0xd6f4ff,
		ember: 0x7fa8ff,
		ash: 0x2a3050,
		make( root ) {

			// The dust tail's points, round a ring: laid at the exhaust and drifting after the vehicle
			// for `life` s (longer in overdrive), as many as there are spread over that. The ion tail,
			// ION strips straight back.
			const TAIL = 40;
			const ION = 6;
			const batch = new Batch( root, { particles: 60, quads: 50, blending: AdditiveBlending } );
			const dust = emitter();
			const tail = Array.from( { length: TAIL }, () => ( { at: new Vector3(), velocity: new Vector3(), born: - Infinity, width: 0 } ) );
			const white = new Color( 0xeaffff );
			const pale = new Color( 0xcfe6ff );
			const blue = new Color( 0x4a6dff );
			const coma = new Color( 0x7fa8ff );
			const ionNear = new Color( 0x5a8cff );
			const ionFar = new Color( 0x2a46e0 );
			const ionHot = new Color( 0xdff4ff );
			const colour = new Color();
			const axis = new Vector3();
			const middle = new Vector3();
			let f = null;
			let head = 0;
			let due = 0;
			const speck = k => {

				const p = batch.spawn( 0.35 + Math.random() * 0.25 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.5 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.7 + 0.2 * f.hot, 3, 0, 1.2 );
				p.size = ( 0.05 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( Math.random() < 0.5 ? 0xbfe8ff : 0xffffff );

			};
			const hooks = {
				look( p, t, view ) {

					if ( p.kind === 1 ) TWINKLE.look( p, t, view );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const { clock, dt, scale, hot } = frame;
					const fl = flow( frame );
					const life = 0.7 + 0.35 * hot;
					batch.begin();
					for ( const point of tail ) point.at.addScaledVector( point.velocity, dt );
					if ( fl > 0.01 ) {

						due -= dt;
						if ( due <= 0 ) {

							due = life / ( TAIL - 4 );
							head = ( head + 1 ) % TAIL;
							const point = tail[ head ];
							point.born = clock;
							// Curving away behind it as the solar wind would have it.
							point.velocity.copy( frame.velocity ).multiplyScalar( 0.62 ).addScaledVector( frame.back, 5 )
								.addScaledVector( frame.right, 0.8 * Math.sin( clock * 1.3 ) ).addScaledVector( frame.up, 0.6 );
							point.width = 0.32 * scale * ( 0.5 + 0.5 * fl ) * ( 1 + 0.25 * hot );

						}

						// Kept at the exhaust until the next is laid, so the tail stays on it.
						tail[ head ].at.copy( frame.nozzle );
						// The head: a faint coma, a glow that throbs (steady for a visitor asking for less
						// motion) and a white nucleus.
						const throb = frame.calm ? 1 : 0.9 + 0.15 * Math.sin( clock * 31 );
						batch.put( frame.nozzle, frame.up, FACING, 0.55 * scale, 0.55 * scale, 0, SHAPES.soft, coma, 0.25 * fl );
						batch.put( frame.nozzle, frame.up, FACING, 0.34 * scale * throb, 0.34 * scale * throb, 0, SHAPES.glow, pale, 0.75 * fl );
						batch.put( frame.nozzle, frame.up, FACING, 0.12 * scale, 0.12 * scale, 0, SHAPES.glow, white, fl );
						// Overdrive: a flare across the head.
						if ( hot > 0 && ! frame.calm ) batch.put( frame.nozzle, frame.up, FACING, 0.7 * scale, 0.7 * scale * 0.25, 0, SHAPES.flare, white, 0.45 * hot * fl );
						// The ion tail: straight back, blue, deeper down it (paler and longer in overdrive).
						const length = ( 1.2 + 1.6 * fl + 1.5 * hot ) * scale / ION;
						for ( let i = 0; i < ION; i ++ ) {

							middle.copy( frame.nozzle ).addScaledVector( frame.back, length * ( i + 0.5 ) );
							axis.copy( frame.back ).multiplyScalar( length / 2 );
							colour.lerpColors( ionNear, ionFar, i / ( ION - 1 ) ).lerp( ionHot, hot * 0.7 );
							const shimmer = frame.calm ? 1 : 0.85 + 0.15 * Math.sin( clock * 40 + i );
							batch.put( middle, axis, ALONG, 0.07 * scale * ( 1 + 0.5 * hot ) * ( 1 - 0.5 * i / ION ), 1, 0, SHAPES.streak, colour, 0.55 * fl * shimmer * ( 1 - 0.6 * i / ION ) );

						}

					} else due = 0;

					// The dust tail, newest to oldest: a strip from each point to the next, narrowing and
					// going from white to blue as it ages (blue soon; sooner and fainter in overdrive, where
					// the ion tail is the white of it, so the two don't pile up to a white-out).
					for ( let i = 0; i < TAIL - 1; i ++ ) {

						const a = tail[ ( head - i + TAIL ) % TAIL ];
						const b = tail[ ( head - i - 1 + TAIL ) % TAIL ];
						const t = ( clock - b.born ) / life;
						if ( t > 1 ) break;
						middle.addVectors( a.at, b.at ).multiplyScalar( 0.5 );
						axis.subVectors( a.at, b.at ).multiplyScalar( 0.5 );
						colour.lerpColors( white, blue, Math.min( 1, Math.sqrt( t ) * ( 1 + hot ) ) );
						batch.put( middle, axis, ALONG, b.width * ( 1 - t ) ** 0.7, 1, 0, SHAPES.streak, colour, ( 1 - t ) * ( 0.95 - 0.3 * hot ) );

					}

					dust( fl, dt, ( 55 + 60 * hot ) * frame.detail, speck );
					batch.update( dt, hooks );

				},
				// Lit: its head flares up (not for a visitor asking for less motion), and a shower of
				// specks bursts off it.
				ignite( frame, detail, calm ) {

					if ( ! calm ) {

						const flare = batch.spawn( 0.3 );
						flare.position.copy( frame.nozzle );
						flare.carry.copy( frame.velocity );
						flare.frame = SHAPES.glow;
						flare.size = 0.45 * frame.scale;
						flare.grow = 0.3 * frame.scale;
						flare.colour.copy( white );

					}

					for ( let i = Math.round( 36 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.4 + Math.random() * 0.3 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.75, 4, 2 );
						p.size = ( 0.06 + Math.random() * 0.05 ) * frame.scale;
						p.colour.set( Math.random() < 0.5 ? 0xbfe8ff : 0xffffff );
						p.drag = 1.5;

					}

				},
				// Let go: it breaks up, twinkling fragments flung off its head as its tail drifts away.
				cool( frame, dry, detail ) {

					f = frame;
					for ( let i = Math.round( 5 + 3 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.6 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.85, 1.6, 1.5 );
						p.frame = SHAPES.star;
						p.size = ( 0.05 + Math.random() * 0.04 ) * frame.scale;
						p.colour.set( 0xdff4ff );
						p.kind = 1;

					}

				},
			};

		},
	},

	// Music notes: eighth notes and beamed pairs in bright colours rising and swaying away off a staff
	// that ripples out behind it, all bobbing together to one beat. In overdrive, double time and
	// chords, with a speaker's thump; let go, a fermata (run dry, a sour note). With no air there's
	// no sound: the notes are faint and hang still.
	notes: {
		flame: { halo: 0xfff0b0, length: 0.5, flicker: 0.6 },
		tint: 0xfff0b0,
		ember: 0xfff0b0,
		ash: 0x6a6050,
		make( root ) {

			// The staff's points, round a ring: one every STEP s, laid over the exhaust and drifting
			// after the vehicle for LIFE s; LINES lines along them.
			const STAFF = 12;
			const LIFE = 0.7;
			const STEP = LIFE / ( STAFF - 1 );
			const LINES = 5;
			const batch = new Batch( root, { particles: 90, quads: ( STAFF - 1 ) * LINES } );
			const notes = emitter();
			const colours = [ 0xff4d8d, 0x3dbdff, 0xffc21a, 0x4ddc6b, 0xa86bff, 0xff8a3d ];
			const staff = Array.from( { length: STAFF }, () => ( { at: new Vector3(), velocity: new Vector3(), born: - Infinity } ) );
			// Inked dark, so it reads on a light road or a pale sky alike.
			const ink = new Color( 0x2a2440 );
			const axis = new Vector3();
			const middle = new Vector3();
			const a = new Vector3();
			const b = new Vector3();
			let f = null;
			let n = 0;
			let beat = 0;
			let phase = 0;
			let beats = 0;
			let head = 0;
			let due = 0;
			const note = k => {

				const p = batch.spawn( 1.2 + Math.random() * 0.4 );
				// On a line or in a space of the staff.
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( 0.15 + ( Math.round( Math.random() * 8 ) - 4 ) * 0.0225 ) * f.scale, p.position );
				thrown( f, p, 0.88, 1.6 + Math.random(), f.air ? 1.1 : 0.3, 0.5 );
				p.frame = Math.random() < 0.6 ? SHAPES.note : SHAPES.notes;
				p.size = ( 0.12 + Math.random() * 0.06 ) * f.scale;
				p.colour.set( colours[ n ++ % colours.length ] );
				// Silent with no air: faint, and hanging where it's left.
				p.fall = f.air ? - 0.06 : 0;
				p.drag = f.air ? 1.1 : 0;
				p.alpha = f.air ? 1 : 0.35;
				return p;

			};
			const hooks = {
				step( p, dt ) {

					if ( p.kind === 0 && f.air ) p.velocity.addScaledVector( f.right, Math.sin( p.age * 3.5 + p.phase ) * 1.4 * dt );

				},
				look( p, t, view ) {

					if ( p.kind === 2 ) return;
					if ( p.kind === 4 ) {

						view.alpha = p.alpha * ( 1 - t ) ** 1.5;
						return;

					}

					if ( f.air && p.kind !== 3 ) view.sx *= 1 + beat * 0.25;
					view.sy = view.sx;
					// A sour note swings, sagging (not for a visitor asking for less motion).
					if ( p.kind === 3 ) view.turn = f.calm ? 0.3 : 0.6 * Math.sin( p.age * 5 + p.phase );
					else if ( p.kind === 0 && f.air ) view.turn = 0.3 * Math.sin( p.age * 3 + p.phase );
					view.alpha = p.alpha * ( t < 0.7 ? 1 : ( 1 - t ) / 0.3 );

				},
			};
			// Notes stacked as a chord, `count` of them.
			const chord = count => {

				for ( let i = 0; i < count; i ++ ) {

					const p = note( 1 );
					// Stacked a little behind it and drifting back, not piled on the driver.
					p.position.copy( f.nozzle ).addScaledVector( f.back, 0.4 * f.scale ).addScaledVector( f.up, ( 0.1 + i * 0.12 ) * f.scale );
					p.carry.copy( f.velocity ).multiplyScalar( 0.85 );
					p.velocity.copy( f.back ).multiplyScalar( 1.5 ).addScaledVector( f.up, f.air ? 0.3 : 0 );
					p.frame = SHAPES.note;
					p.size *= 1.25;
					p.colour.set( colours[ ( beats + i * 2 ) % colours.length ] );

				}

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const { clock, dt, scale, hot } = frame;
					const fl = flow( frame );
					// Two beats a second, a quick swell on each; double time in overdrive.
					const was = Math.floor( phase / ( Math.PI * 2 ) );
					phase += dt * Math.PI * ( 4 + 4 * hot );
					beat = Math.max( 0, Math.sin( phase ) ) ** 6;
					if ( Math.floor( phase / ( Math.PI * 2 ) ) !== was ) {

						beats ++;
						if ( hot > 0.5 && fl > 0.01 && frame.air ) {

							chord( frame.detail < 1 ? 2 : 3 );
							if ( ! frame.calm ) {

								const thump = batch.spawn( 0.3 );
								thump.position.copy( frame.nozzle );
								thump.carry.copy( frame.velocity ).multiplyScalar( 0.95 );
								thump.axis.copy( frame.back );
								thump.mode = FLAT;
								thump.frame = SHAPES.ring;
								thump.size = 0.2 * scale;
								thump.grow = 0.9 * scale;
								thump.colour.set( 0xfff0b0 );
								thump.alpha = 0.5;
								thump.kind = 4;

							}

						}

					}

					batch.begin();
					// The staff, laid just behind the exhaust and rippling out behind it (never carried on
					// faster than it's going now, so it can't overtake it as it slows).
					const ahead = _r.copy( frame.back ).negate();
					const most = Math.max( 0, frame.velocity.dot( ahead ) );
					for ( const point of staff ) {

						const over = point.velocity.dot( ahead ) - most;
						if ( over > 0 ) point.velocity.addScaledVector( ahead, - over );
						point.at.addScaledVector( point.velocity, dt );

					}
					if ( fl > 0.01 ) {

						due -= dt;
						if ( due <= 0 ) {

							due = STEP;
							head = ( head + 1 ) % STAFF;
							staff[ head ].born = clock;
							staff[ head ].velocity.copy( frame.velocity ).multiplyScalar( 0.97 ).addScaledVector( frame.back, 2 );

						}

						staff[ head ].at.copy( frame.nozzle ).addScaledVector( frame.back, 0.3 * scale ).addScaledVector( frame.up, 0.15 * scale );

					} else due = 0;
					const lines = frame.detail < 1 ? 3 : LINES;
					const width = ( 0.038 + 0.007 * hot ) * scale;
					const bright = 0.7 + 0.15 * hot;
					const wave = 0.12 * scale * ( frame.calm ? 0.5 : 1 );
					for ( let i = 0; i < STAFF - 1; i ++ ) {

						const p = staff[ ( head - i + STAFF ) % STAFF ];
						const q = staff[ ( head - i - 1 + STAFF ) % STAFF ];
						const t = ( clock - q.born ) / LIFE;
						if ( t > 1 ) break;
						// A ripple running back along it.
						const sp = wave * Math.sin( clock * 6 - ( clock - p.born ) * 10 );
						const sq = wave * Math.sin( clock * 6 - ( clock - q.born ) * 10 );
						for ( let j = 0; j < lines; j ++ ) {

							// Its lines side by side, lying back along the road like lanes, so the chase
							// camera, looking down on them, sees all five (stacked up, they'd be end on).
							const off = ( lines === LINES ? j - 2 : ( j - 1 ) * 2 ) * 0.08 * scale;
							a.copy( p.at ).addScaledVector( frame.right, off ).addScaledVector( frame.up, sp );
							b.copy( q.at ).addScaledVector( frame.right, off ).addScaledVector( frame.up, sq );
							middle.addVectors( a, b ).multiplyScalar( 0.5 );
							axis.subVectors( a, b ).multiplyScalar( 0.5 );
							batch.put( middle, axis, ALONG, width, 1, 0, SHAPES.streak, ink, bright * ( 1 - t ) * fl );

						}

					}

					notes( fl, dt, 24 * frame.detail, note );
					batch.update( dt, hooks );

				},
				// Lit: a chord, a ring of notes thrown out round the exhaust, then rising and swaying away.
				ignite( frame, detail ) {

					f = frame;
					const count = Math.max( 6, Math.round( 10 * detail ) );
					for ( let i = 0; i < count; i ++ ) {

						const p = note( 1 );
						around( frame, i / count * Math.PI * 2, _v );
						p.position.copy( frame.nozzle ).addScaledVector( _v, 0.2 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.85 );
						p.velocity.copy( _v ).multiplyScalar( 2.6 ).addScaledVector( frame.back, 1 ).addScaledVector( frame.up, 0.6 );
						p.size = ( 0.15 + Math.random() * 0.06 ) * frame.scale;
						p.drag = 1.4;

					}

				},
				// Let go: a fermata, a double bar line at the end of the staff, and the notes hold, rising
				// still. Run dry instead: a sour note, three grey notes drooping out of it.
				cool( frame, dry ) {

					f = frame;
					if ( dry ) {

						for ( let i = 0; i < 3; i ++ ) {

							const p = note( 1 );
							p.position.copy( frame.nozzle ).addScaledVector( frame.right, ( i - 1 ) * 0.12 * frame.scale );
							p.velocity.copy( frame.back ).multiplyScalar( 0.8 );
							p.colour.set( 0x8a8f99 );
							p.fall = 0.5;
							p.kind = 3;

						}

						return;

					}

					for ( const p of batch.items ) if ( p.age < p.life && p.kind === 0 ) {

						p.kind = 1;
						p.fall = frame.air ? - 0.15 : 0;

					}

					const end = staff[ head ];
					for ( let i = 0; i < 2; i ++ ) {

						const p = batch.spawn( 0.6 );
						p.position.copy( end.at ).addScaledVector( frame.back, ( 0.1 + i * 0.05 ) * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.9 );
						p.mode = ALONG;
						p.frame = SHAPES.streak;
						p.axis.copy( frame.up ).multiplyScalar( 0.11 * frame.scale );
						p.size = ( i ? 0.025 : 0.01 ) * frame.scale;
						p.colour.copy( ink );
						p.kind = 2;

					}

				},
			};

		},
	},

	// Cherry blossom: pink petals whirling out behind in a soft pink haze, tumbling over and over as
	// they drift down, and now and then a whole flower; a glow at the exhaust they blow out of. In
	// overdrive, a storm of blossom (hanafubuki) off the cone of the shock as well; let go, petals
	// settle round it and on the road.
	petals: {
		flame: null,
		tint: 0xffc4dc,
		ember: 0xffb3cf,
		ash: 0x7a4a5a,
		make( root ) {

			const batch = new Batch( root, { particles: 210, quads: 1 } );
			const petals = emitter();
			const storm = emitter();
			const hazes = emitter();
			const colours = [ 0xffc2da, 0xffadcc, 0xffe2ee, 0xfff4f8, 0xff97bf ];
			const glow = new Color( 0xffc4dc );
			const wilted = new Color( 0xc79aa8 );
			const out = new Vector3();
			const turn = new Vector3();
			const r = new Vector3();
			let f = null;
			const petal = k => {

				const p = batch.spawn( 1.3 + Math.random() * 0.6 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.7, ( Math.random() - 0.2 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.92, 1.5 + Math.random() * 1.5, 1.2, 1.4 );
				const flower = Math.random() < 0.12;
				p.frame = flower ? SHAPES.blossom : SHAPES.petal;
				p.size = ( flower ? 0.09 + Math.random() * 0.04 : 0.05 + Math.random() * 0.035 ) * f.scale;
				p.colour.set( pick( colours ) );
				p.fall = 0.1;
				p.drag = f.air ? 1.4 : 0;
				p.spin = ( Math.random() - 0.5 ) * ( flower ? 2 : 5 );
				p.turn = Math.random() * Math.PI * 2;
				p.kind = flower ? 1 : 0;
				// A storm of them in overdrive doesn't last as long.
				if ( f.hot > 0.3 ) p.life = Math.min( p.life, 1.1 );
				return p;

			};
			// Overdrive: petals peeling off the cone of the shock round its body.
			const gust = () => {

				const p = petal( 1 );
				const angle = Math.random() * Math.PI;
				p.position.copy( f.middle ).addScaledVector( f.right, Math.cos( angle ) * f.size.width * 0.7 ).addScaledVector( f.up, Math.sin( angle ) * f.size.height * 0.7 );
				thrown( f, p, 0.9, 1, 0.3, 0.8 );
				p.aspect = 0.5;

			};
			const haze = k => {

				const p = batch.spawn( 0.9 + Math.random() * 0.3 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, ( Math.random() - 0.3 ) * 0.2 * f.scale, p.position );
				thrown( f, p, 0.92, 1.5, 0.3, 0.4 );
				p.frame = SHAPES.puff;
				p.size = 0.18 * f.scale;
				p.grow = 0.5 * f.scale;
				p.colour.set( f.hot > 0.3 ? 0xff97bf : 0xffd6e6 );
				p.alpha = 0.22;
				p.drag = 1.2;
				p.turn = Math.random() * Math.PI * 2;
				p.kind = 2;

			};
			const hooks = {
				// Whirling round the exhaust's path as they drift back (with no air, they only fly).
				step( p, dt ) {

					if ( ! f.air || p.kind > 1 ) return;
					p.velocity.addScaledVector( f.right, Math.sin( p.age * 5 + p.phase ) * 2 * dt );
					r.subVectors( p.position, f.nozzle );
					r.addScaledVector( f.back, - r.dot( f.back ) );
					_a.crossVectors( f.back, r );
					if ( _a.lengthSq() > 1e-6 ) p.velocity.addScaledVector( _a.normalize(), 3.5 * dt );
					p.velocity.addScaledVector( r, - 0.6 * dt );

				},
				look( p, t, view ) {

					if ( p.kind === 2 ) {

						view.alpha = p.alpha * swell( t );
						return;

					}

					if ( p.kind === 3 ) {

						// Lying on the road, fading at the end.
						view.alpha = p.alpha * Math.min( 1, ( p.life - p.age ) / 0.6 );
						return;

					}

					// A petal tumbles over and over as it falls (twice as fast in a storm); a flower only
					// turns.
					const tumble = f.hot > 0.3 && ! f.calm ? 12 : 6;
					if ( p.kind === 0 ) view.sy *= 0.3 + 0.7 * Math.abs( Math.cos( p.age * tumble + p.phase ) );
					view.alpha = p.alpha * ( t < 0.75 ? 1 : ( 1 - t ) * 4 );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					const h = overdrive( frame );
					batch.begin();
					// A glow at the exhaust, so a boost with no flame reads at the vehicle.
					if ( fl > 0.01 ) batch.put( frame.nozzle, frame.up, FACING, 0.22 * frame.scale, 0.22 * frame.scale, 0, SHAPES.glow, glow, 0.6 * fl );
					petals( fl, frame.dt, ( 75 + 70 * h ) * frame.detail, petal );
					storm( h > 0 ? fl : 0, frame.dt, 25 * h, gust );
					hazes( frame.air ? fl : 0, frame.dt, 10 * frame.detail, haze );
					batch.update( frame.dt, hooks );

				},
				// Lit: a gust of blossom swirling out round the exhaust.
				ignite( frame, detail ) {

					f = frame;
					for ( let i = Math.round( 50 * detail ); i > 0; i -- ) {

						const angle = Math.random() * Math.PI * 2;
						around( frame, angle, out );
						around( frame, angle + Math.PI / 2, turn );
						const p = petal( 1 );
						p.position.copy( frame.nozzle ).addScaledVector( out, ( 0.1 + Math.random() * 0.2 ) * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.9 );
						p.velocity.copy( turn ).multiplyScalar( 2.5 + Math.random() ).addScaledVector( out, 1.5 ).addScaledVector( frame.back, 1 ).addScaledVector( frame.up, 1.2 );
						p.drag = 1.8;

					}

				},
				// Let go: petals settle in a ring round the exhaust, and on the road a few lie where they
				// fell. Run dry, one wilting flower drops out of it.
				cool( frame, dry, detail ) {

					f = frame;
					const count = Math.round( 8 + 4 * detail );
					for ( let i = 0; i < count; i ++ ) {

						around( frame, i / count * Math.PI * 2, out );
						const p = petal( 1 );
						p.position.copy( frame.nozzle ).addScaledVector( out, 0.25 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.92 );
						p.velocity.copy( out ).multiplyScalar( 0.8 );
						p.fall = 0.04;
						p.drag = 3;

					}

					if ( frame.grounded ) for ( let i = 0; i < 6; i ++ ) {

						const p = onRoad( batch, frame, 0.06, 2.2 );
						p.frame = i ? SHAPES.petal : SHAPES.blossom;
						p.size = ( i ? 0.06 : 0.1 ) * frame.scale;
						p.aspect = 1;
						p.colour.set( pick( colours ) );
						p.alpha = 0.8;
						p.kind = 3;

					}

					if ( ! dry ) return;
					const p = petal( 1 );
					p.position.copy( frame.nozzle );
					p.velocity.copy( frame.back ).multiplyScalar( 0.5 );
					p.frame = SHAPES.blossom;
					p.size = 0.12 * frame.scale;
					p.colour.lerp( wilted, 0.7 );
					p.fall = 0.2;
					p.spin = 1;
					p.kind = 1;

				},
			};

		},
	},

	// An afterburner: a jet's long blue-white cone with a row of shock diamonds burning in it, each
	// with its Mach disk, a rosy glow at its tail and a haze of blue sparks streaming off it. In
	// overdrive, reheat: more diamonds, further apart, a violet tail and a flare across the nozzle; let
	// go, they collapse tail first, and run dry it stalls with a bang or two. With no air, a rocket's
	// plume in a vacuum: no diamonds, a wide fading glow.
	afterburner: {
		flame: { outer: 0x2a46e0, inner: 0x4a6cf0, halo: 0x8fb0ff, length: 1.6, flicker: 0.35, diamonds: false },
		tint: 0xa8c4ff,
		make( root ) {

			// The diamonds, put down each frame along the cone where it is now: up to DIAMONDS of them,
			// each a lozenge along it, a glow and a ring across it (the Mach disk); and a flare.
			const DIAMONDS = 7;
			const batch = new Batch( root, { particles: 110, quads: DIAMONDS * 3 + 1, blending: AdditiveBlending } );
			const sparks = emitter();
			const tails = emitter();
			const white = new Color( 0xf6f9ff );
			const blue = new Color( 0x5f7dff );
			const violet = new Color( 0x8a6cff );
			const far = new Color();
			const colour = new Color();
			const at = new Vector3();
			const axis = new Vector3();
			let f = null;
			let bangs = 0;
			let bangDue = 0;
			// A spark, its head first the way it flies.
			const spark = k => {

				const p = batch.spawn( 0.22 + Math.random() * 0.18 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.35 * f.scale, ( Math.random() - 0.5 ) * 0.35 * f.scale, p.position );
				thrown( f, p, 0.9, 5 + 3 * f.hot + Math.random() * 4, 0, 1.4 );
				p.mode = ALONG;
				p.frame = SHAPES.spark;
				p.axis.copy( f.back ).multiplyScalar( ( 0.08 + Math.random() * 0.08 ) * f.scale );
				p.size = 0.025 * f.scale;
				p.colour.set( Math.random() < 0.5 ? 0xa8c8ff : 0xffffff );
				p.drag = f.air ? 1.5 : 0;

			};
			// The cone's far end, glowing rose and violet as it cools (violet in overdrive).
			const tail = k => {

				const p = batch.spawn( 0.2 + Math.random() * 0.1 );
				// Where the flame's tip is (drive-fx.js draws its cone 0.45 of the vehicle's scale wide and
				// 0.6 to 3.2 of that long as it burns, the afterburner's 1.6 times longer, 1.3 in overdrive).
				nozzleAt( f, k, 0, 0, p.position ).addScaledVector( f.back, 0.45 * f.scale * ( 0.6 + ( f.lit ?? f.power ) * 2.6 ) * 1.6 * 0.95 * ( 1 + 0.3 * f.hot ) );
				thrown( f, p, 0.95, 2, 0.2, 0.4 );
				p.frame = SHAPES.glow;
				p.size = ( 0.2 + 0.1 * f.hot ) * f.scale;
				p.grow = 0.25 * f.scale;
				p.colour.set( Math.random() < 0.5 - 0.4 * f.hot ? 0xff7a8a : 0xb07cff );
				p.alpha = 0.45;

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const { scale, hot, clock } = frame;
					const fl = flow( frame );
					batch.begin();
					if ( fl > 0.01 && frame.air ) {

						// Spaced down the cone, each a little smaller, bluer and fainter than the one before,
						// all throbbing a little (steady for a visitor asking for less motion), each with its
						// Mach disk; more of them in overdrive, further apart, the first pure white and the
						// last violet. Let go, they collapse tail first.
						const count = Math.min( frame.detail < 1 ? 6 : DIAMONDS, 5 + Math.round( 2 * hot ) );
						const spacing = 0.36 + 0.14 * hot;
						far.lerpColors( blue, violet, hot );
						for ( let i = 0; i < count && i < count * fl; i ++ ) {

							const k = i / ( count - 1 );
							at.copy( frame.nozzle ).addScaledVector( frame.back, ( 0.3 + i * spacing ) * scale * ( 0.55 + 0.45 * fl ) );
							axis.copy( frame.back ).multiplyScalar( 0.13 * scale * ( 1 - 0.3 * k ) );
							if ( i === 0 && hot > 0.3 ) colour.setHex( 0xffffff );
							else colour.lerpColors( white, far, k * 0.8 );
							const throb = frame.calm ? 1 : 0.8 + 0.2 * Math.sin( clock * 70 + i * 1.7 );
							const alpha = fl * ( 1 - 0.45 * k ) * throb;
							batch.put( at, axis, ALONG, 0.3 * scale * ( 1 - 0.3 * k ), 1, 0, SHAPES.diamond, colour, alpha );
							const glow = 0.11 * scale * ( 1 - 0.3 * k );
							batch.put( at, frame.up, FACING, glow, glow, 0, SHAPES.glow, colour, alpha * 0.7 );
							if ( frame.detail >= 1 || i % 2 === 0 ) batch.put( at, frame.back, FLAT, glow, glow, 0, SHAPES.ring, colour, alpha * 0.35 );

						}

						// Overdrive: a flare across the nozzle.
						if ( hot > 0 && ! frame.calm ) batch.put( frame.nozzle, frame.up, FACING, 0.8 * scale, 0.8 * scale * 0.2, 0, SHAPES.flare, white, 0.4 * hot * fl );

					} else if ( fl > 0.01 ) {

						// With no air: a plume in a vacuum, glows widening and fading out behind it.
						for ( let i = 0; i < 3; i ++ ) {

							at.copy( frame.nozzle ).addScaledVector( frame.back, ( 0.4 + 0.5 * i ) * scale );
							const glow = VACUUM_SIZE[ i ] * scale;
							batch.put( at, frame.up, FACING, glow, glow, 0, SHAPES.glow, far.lerpColors( white, blue, i / 2 ), VACUUM_ALPHA[ i ] * fl );

						}

					}

					sparks( fl, frame.dt, ( 70 + 50 * hot ) * frame.detail, spark );
					tails( frame.air ? fl : 0, frame.dt, 30 * frame.detail, tail );
					// Run dry: a compressor stall, a bang and another.
					if ( bangs > 0 ) {

						bangDue -= frame.dt;
						if ( bangDue <= 0 ) {

							bangs --;
							bangDue = 0.12;
							const bang = batch.spawn( 0.12 );
							bang.position.copy( frame.nozzle );
							bang.carry.copy( frame.velocity ).multiplyScalar( 0.95 );
							bang.frame = SHAPES.glow;
							bang.size = 0.5 * scale;
							bang.colour.set( 0xffb070 );
							if ( frame.air ) for ( let i = 0; i < 2; i ++ ) {

								const puff = batch.spawn( 0.6 + Math.random() * 0.3 );
								puff.position.copy( frame.nozzle );
								flung( frame, puff, 0.9, 0.8, 1 );
								puff.frame = SHAPES.puff;
								puff.size = 0.15 * scale;
								puff.grow = 0.6 * scale;
								puff.colour.set( 0x3a3f4a );
								puff.alpha = 0.35;
								puff.drag = 1.5;
								puff.turn = Math.random() * Math.PI * 2;

							}

						}

					}

					batch.update( frame.dt );

				},
				// Lit: a shock ring blown out behind it (fainter for a visitor asking for less motion), a
				// row of diamonds shot back down the cone, and a spray of sparks.
				ignite( frame, detail, calm ) {

					f = frame;
					const ring = batch.spawn( 0.35 );
					ring.position.copy( frame.nozzle ).addScaledVector( frame.back, 0.4 * frame.scale );
					ring.carry.copy( frame.velocity ).multiplyScalar( 0.97 );
					ring.velocity.copy( frame.back ).multiplyScalar( 4 );
					ring.axis.copy( frame.back );
					ring.mode = FLAT;
					ring.frame = SHAPES.shock;
					ring.size = 0.25 * frame.scale;
					ring.grow = 1.3 * frame.scale;
					ring.colour.set( 0xbfd2ff );
					ring.alpha = calm ? 0.6 : 1;
					for ( let i = 0; i < 4; i ++ ) {

						const p = batch.spawn( 0.3 );
						p.position.copy( frame.nozzle ).addScaledVector( frame.back, ( 0.3 + i * 0.4 ) * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.95 );
						p.velocity.copy( frame.back ).multiplyScalar( 4 + i * 2 );
						p.mode = ALONG;
						p.frame = SHAPES.diamond;
						p.axis.copy( frame.back ).multiplyScalar( 0.2 * frame.scale );
						p.size = 0.4 * frame.scale;
						p.colour.set( 0xeef4ff );

					}

					for ( let i = Math.round( 30 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.3 + Math.random() * 0.2 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.88, 5, 3 );
						p.mode = ALONG;
						p.frame = SHAPES.spark;
						p.axis.copy( p.velocity ).normalize().multiplyScalar( 0.12 * frame.scale );
						p.size = 0.03 * frame.scale;
						p.colour.set( Math.random() < 0.5 ? 0xa8c8ff : 0xffffff );
						p.drag = 2;

					}

				},
				// Run dry: a compressor stall, two bangs a little apart with a puff of smoke (not for a
				// visitor asking for less motion).
				cool( frame, dry, detail, calm ) {

					f = frame;
					if ( ! dry || calm ) return;
					bangs = 2;
					bangDue = 0;

				},
			};

		},
	},

	// Frost: snowflakes and glints of ice streaming out of a cold mist under a spinning crown of ice,
	// frosting the road behind it, as if the booster breathed out winter. In overdrive, a blizzard;
	// let go, the flakes freeze where they are and shatter. With no air, no mist: flash-frozen.
	frost: {
		flame: { halo: 0xc4f0ff, length: 0.5, flicker: 0.5 },
		tint: 0xc4f0ff,
		ember: 0x9fdcff,
		ash: 0x5a6470,
		make( root ) {

			const batch = new Batch( root, { particles: 240, quads: 1 } );
			const flakes = emitter();
			const mists = emitter();
			const glints = emitter();
			const rime = emitter();
			const colours = [ 0xffffff, 0xe6f8ff, 0xcdeeff ];
			const crown = new Color( 0xcdeeff );
			const way = new Vector3();
			let f = null;
			let spin = 0;
			let breaths = 0;
			let breathDue = 0;
			const flake = k => {

				const p = batch.spawn( 1 + Math.random() * 0.6 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.6, ( Math.random() - 0.3 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.88, 1.5 + Math.random() * 2, 0.5, 1 );
				p.colour.set( pick( colours ) );
				p.drag = f.air ? 1.1 : 0;
				if ( Math.random() < f.hot * 0.6 ) {

					// Driven snow: a streak of ice flying back.
					thrown( f, p, 0.85, 4 + Math.random() * 2, 0.2, 0.6 );
					p.life = 0.4;
					p.mode = ALONG;
					p.frame = SHAPES.shard;
					p.axis.copy( f.back ).multiplyScalar( 0.18 * f.scale );
					p.size = 0.05 * f.scale;
					return p;

				}

				p.frame = SHAPES.snowflake;
				p.size = ( 0.07 + Math.random() * 0.07 ) * f.scale;
				p.fall = 0.06;
				p.spin = ( Math.random() - 0.5 ) * 3;
				p.turn = Math.random() * Math.PI;
				return p;

			};
			const mist = k => {

				const p = batch.spawn( 0.7 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, ( Math.random() - 0.5 ) * 0.2 * f.scale, p.position );
				thrown( f, p, 0.9, 2 + Math.random(), 0.3, 0.5 );
				p.frame = SHAPES.puff;
				p.size = 0.16 * f.scale;
				p.grow = 0.7 * f.scale;
				p.colour.set( 0xeaf8ff );
				p.alpha = 0.6;
				p.drag = 1.5;
				p.spin = ( Math.random() - 0.5 ) * 1.2;
				p.turn = Math.random() * Math.PI * 2;
				p.kind = 1;
				return p;

			};
			const glint = k => {

				const p = batch.spawn( 0.35 + Math.random() * 0.3 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.3 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.9, 2 + Math.random() * 2, 0.2, 1.4 );
				p.frame = SHAPES.star;
				p.size = ( 0.05 + Math.random() * 0.04 ) * f.scale;
				p.colour.set( Math.random() < f.hot * 0.5 ? 0x9fe8ff : 0xffffff );
				p.drag = 1;
				p.kind = 2;

			};
			// Frost left on the road behind it.
			const hoar = () => {

				const p = onRoad( batch, f, 0.1, 1.4 );
				p.frame = Math.random() < 0.5 ? SHAPES.snowflake : SHAPES.shard;
				p.size = ( 0.08 + Math.random() * 0.06 ) * f.scale;
				p.aspect = 1;
				p.colour.set( 0xe6f8ff );
				p.alpha = 0.55;
				p.kind = 3;

			};
			const hooks = {
				look( p, t, view ) {

					if ( p.kind === 1 ) view.alpha = p.alpha * swell( t );
					else if ( p.kind === 2 ) TWINKLE.look( p, t, view );
					else if ( p.kind === 3 ) view.alpha = p.alpha * Math.min( 1, t * 8, ( 1 - t ) * 3 );
					else if ( p.kind === 4 ) {

						// Frozen where it was, then shattering into glints (fading, for a visitor asking for
						// less motion).
						const left = p.life - p.age;
						if ( left < 0.35 ) {

							if ( ! f.calm ) {

								view.frame = SHAPES.star;
								TWINKLE.look( p, t, view );

							}

							view.alpha = p.alpha * left / 0.35;

						} else view.alpha = p.alpha;

					// Flakes and shards stay white until they're nearly gone.
					} else view.alpha = p.alpha * ( t < 0.75 ? 1 : ( 1 - t ) * 4 );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					const { hot } = frame;
					batch.begin();
					// A crown of ice spinning across the exhaust, faster and bigger in overdrive (slower for a
					// visitor asking for less motion).
					spin += frame.dt * ( frame.calm ? 0.3 + 0.5 * hot : 0.8 + 2.2 * hot );
					if ( fl > 0.01 ) {

						const size = ( 0.16 + 0.1 * hot ) * frame.scale;
						batch.put( frame.nozzle, frame.back, FLAT, size, size, spin, SHAPES.snowflake, crown, 0.5 * fl );

					}

					mists( frame.air ? fl : 0, frame.dt, ( 28 + 20 * hot ) * frame.detail, mist );
					flakes( fl, frame.dt, ( 45 + 45 * hot ) * frame.detail, flake );
					glints( fl, frame.dt, 50 * ( frame.air ? 1 : 1.5 ) * frame.detail, glint );
					rime( frame.grounded ? fl : 0, frame.dt, 14 * frame.detail, hoar );
					// Run dry: a last cold breath, three little puffs and a big one.
					if ( breaths > 0 ) {

						breathDue -= frame.dt;
						if ( breathDue <= 0 ) {

							breathDue = 0.1;
							const p = mist( 1 );
							p.size = ( breaths === 1 ? 0.3 : 0.1 ) * frame.scale;
							p.grow = p.size * 2;
							breaths --;

						}

					}

					batch.update( frame.dt, hooks );

				},
				// Lit: shards of ice thrown out all round the exhaust, a cold puff and a flurry of snow.
				ignite( frame, detail ) {

					f = frame;
					const count = Math.max( 6, Math.round( 12 * detail ) );
					for ( let i = 0; i < count; i ++ ) {

						const p = batch.spawn( 0.45 + Math.random() * 0.15 );
						around( frame, ( i + Math.random() * 0.5 ) / count * Math.PI * 2, way ).addScaledVector( frame.back, 0.6 ).normalize();
						p.position.copy( frame.nozzle ).addScaledVector( way, 0.15 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.88 );
						p.velocity.copy( way ).multiplyScalar( 3.5 + Math.random() * 1.5 );
						p.mode = ALONG;
						p.frame = SHAPES.shard;
						p.axis.copy( way ).multiplyScalar( ( 0.14 + Math.random() * 0.08 ) * frame.scale );
						p.size = 0.12 * frame.scale;
						p.colour.set( 0xd8f4ff );
						p.drag = 2.5;

					}

					if ( frame.air ) for ( let i = Math.round( 8 * detail ); i > 0; i -- ) flung( frame, mist( 1 ), 0.9, 1.6, 1 );
					for ( let i = Math.round( 26 * detail ); i > 0; i -- ) {

						const p = flake( 1 );
						flung( frame, p, 0.88, 3, 1, 1 );
						p.drag = 1.8;

					}

				},
				// Let go: every flake freezes where it is, hangs a moment and shatters, and shards fly off
				// the exhaust. Run dry, a last cold breath.
				cool( frame, dry, detail ) {

					f = frame;
					for ( const p of batch.items ) if ( p.age < p.life && p.kind === 0 ) {

						p.kind = 4;
						p.drag = 6;
						p.fall = 0;
						p.spin = 0;
						p.life = p.age + 0.6;

					}

					for ( let i = Math.round( 6 + 4 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.4 + Math.random() * 0.15 );
						around( frame, Math.random() * Math.PI * 2, way ).addScaledVector( frame.back, 0.6 ).normalize();
						p.position.copy( frame.nozzle ).addScaledVector( way, 0.15 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.88 );
						p.velocity.copy( way ).multiplyScalar( 2 );
						p.mode = ALONG;
						p.frame = SHAPES.shard;
						p.axis.copy( way ).multiplyScalar( 0.12 * frame.scale );
						p.size = 0.1 * frame.scale;
						p.colour.set( 0xd8f4ff );
						p.drag = 2.5;

					}

					if ( dry && frame.air ) {

						breaths = 4;
						breathDue = 0;

					}

				},
			};

		},
	},

	// Galaxy: a violet flame streaming a two-armed spiral of twinkling stars through drifting clouds of
	// nebula, over a strip of night sky so they show on a bright road. The flame is deep, and violet to
	// its core: a paler core added to it, or the cone added to a bright sky or road, read as a white
	// flame with a violet edge. In overdrive, warp: the stars stretch into hyperspace lines round an
	// accretion disk; let go, the galaxy drifts on, and run dry, a star dies.
	galaxy: {
		flame: { outer: 0x6a2dff, inner: 0x8a4cff, halo: 0xa070ff, length: 0.85, flicker: 0.7, deep: true, diamonds: false },
		tint: 0xc08cff,
		ember: 0xb48cff,
		ash: 0x2a1050,
		make( root ) {

			// The night sky first, drawn under the stars.
			const voids = new Batch( root, { particles: 50 } );
			voids.mesh.renderOrder = - 1;
			const batch = new Batch( root, { particles: 240, quads: 2, blending: AdditiveBlending } );
			const stars = emitter();
			const clouds = emitter();
			const nights = emitter();
			const starColours = [ 0xffffff, 0xfff0c4, 0xc8dcff, 0xffd0f4 ];
			const cloudColours = [ 0x8a5cff, 0xff5ce0, 0x5c8aff ];
			const warpCloud = new Color( 0x9fb8ff );
			const disk = new Color();
			const violet = new Color( 0xa070ff );
			const white = new Color( 0xffffff );
			const out = new Vector3();
			const turn = new Vector3();
			let f = null;
			let n = 0;
			let spin = 0;
			// Two arms of a spiral, round the exhaust, swirling as they spread.
			const star = k => {

				const arm = n ++ & 1;
				const angle = spin + arm * Math.PI + k * 0.4;
				const glint = n % 5 === 0 && ! f.calm;
				const p = batch.spawn( glint ? 0.25 : 0.6 + Math.random() * 0.5 );
				nozzleAt( f, k, 0, 0, p.position ).addScaledVector( around( f, angle, out ), 0.12 * f.scale );
				thrown( f, p, 0.93, 2.2, 0.2, 0.4 );
				p.velocity.addScaledVector( around( f, angle + Math.PI / 2, turn ), 1.6 );
				p.colour.set( pick( starColours ) );
				p.drag = 1;
				if ( glint ) {

					p.frame = SHAPES.flare;
					p.size = 0.16 * f.scale;
					p.aspect = 0.3;
					p.kind = 3;

				} else {

					p.frame = SHAPES.star;
					p.size = ( 0.07 + Math.random() * 0.06 ) * f.scale;
					p.spin = ( Math.random() - 0.5 ) * 3;

				}

			};
			const cloud = k => {

				const p = batch.spawn( 0.9 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, ( Math.random() - 0.5 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.92, 1.5 + Math.random(), 0.2, 0.6 );
				p.frame = SHAPES.puff;
				p.size = 0.2 * f.scale;
				p.grow = 0.75 * f.scale;
				p.colour.set( pick( cloudColours ) ).lerp( warpCloud, f.hot * 0.7 );
				p.alpha = 0.5;
				p.drag = 1.2;
				p.spin = ( Math.random() - 0.5 ) * 0.8;
				p.turn = Math.random() * Math.PI * 2;
				p.kind = 1;
				return p;

			};
			const night = k => {

				const p = voids.spawn( 0.8 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, ( Math.random() - 0.5 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.92, 1.5 + Math.random(), 0.1, 0.4 );
				p.frame = SHAPES.puff;
				p.size = 0.16 * f.scale;
				p.grow = 0.5 * f.scale;
				p.colour.set( 0x140a33 );
				p.alpha = 0.4;
				p.drag = 1.2;
				p.turn = Math.random() * Math.PI * 2;

			};
			const hooks = {
				look( p, t, view ) {

					// Nebulae drift in and thin away; stars twinkle, and in overdrive stretch into lines of
					// hyperspace; a glint goes fast; the core's flash only fades.
					if ( p.kind === 1 ) view.alpha = p.alpha * swell( t );
					else if ( p.kind === 0 ) {

						if ( f.hot > 0.05 && p.velocity.lengthSq() > 1e-4 && p.phase < 4 ) {

							// All along the way it goes, so they stream past to a point ahead, as at warp: thin
							// lines, two in three of the stars (the rest still twinkle), and dimmer the longer
							// they draw out, so piled up over a bright sky they don't wash out to white.
							p.mode = ALONG;
							p.axis.copy( f.back ).multiplyScalar( ( 0.1 + 0.4 * f.hot ) * f.scale );
							view.frame = SHAPES.streak;
							view.sx *= 0.22;
							view.alpha *= 0.8 - 0.35 * f.hot;

						} else {

							p.mode = FACING;
							TWINKLE.look( p, t, view );

						}

					} else if ( p.kind === 3 ) view.alpha = p.alpha * ( 1 - t ) ** 2;
					else if ( p.kind === 5 ) view.alpha = p.alpha * ( 1 - t ) ** 1.5;

				},
			};
			const nightly = {
				look( p, t, view ) {

					view.alpha = p.alpha * swell( t );

				},
			};
			return {
				batches: [ voids, batch ],
				update( frame ) {

					f = frame;
					const { hot, scale } = frame;
					const fl = flow( frame );
					spin += frame.dt * 7;
					voids.begin();
					batch.begin();
					// Overdrive: an accretion disk turning across the exhaust round a white core (dimmer for a
					// visitor asking for less motion).
					if ( hot > 0.01 && fl > 0.01 ) {

						const size = ( 0.18 + 0.12 * hot ) * scale;
						disk.lerpColors( violet, white, hot );
						batch.put( frame.nozzle, frame.back, FLAT, size, size, frame.clock * 5, SHAPES.ring, disk, 0.8 * hot * fl );
						batch.put( frame.nozzle, frame.up, FACING, 0.3 * scale, 0.3 * scale, 0, SHAPES.glow, white, Math.min( frame.calm ? 0.35 : 1, 0.6 * hot ) * fl );

					}

					nights( fl, frame.dt, 14 * frame.detail, night );
					stars( fl, frame.dt, 150 * frame.detail, star );
					clouds( fl, frame.dt, 24 * frame.detail, cloud );
					voids.update( frame.dt, nightly );
					batch.update( frame.dt, hooks );

				},
				// Lit: a little spiral galaxy flung out round the exhaust, its two arms of stars swirling as
				// they spread, round a bright core (not for a visitor asking for less motion), in a puff of
				// nebula.
				ignite( frame, detail, calm ) {

					f = frame;
					const count = Math.max( 6, Math.round( 14 * detail ) );
					for ( let arm = 0; arm < 2; arm ++ ) for ( let i = 0; i < count; i ++ ) {

						const angle = arm * Math.PI + i * 0.45;
						around( frame, angle, out );
						around( frame, angle + Math.PI / 2, turn );
						const p = batch.spawn( 0.55 + i * 0.025 );
						p.position.copy( frame.nozzle ).addScaledVector( out, ( 0.06 + i * 0.04 ) * frame.scale ).addScaledVector( frame.back, 0.1 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.9 );
						p.velocity.copy( turn ).multiplyScalar( 2.4 ).addScaledVector( out, 1.2 + i * 0.12 ).addScaledVector( frame.back, 1 );
						p.frame = SHAPES.star;
						p.size = ( 0.05 + 0.05 * ( 1 - i / count ) ) * frame.scale;
						p.colour.set( pick( starColours ) );
						p.drag = 1.4;

					}

					if ( ! calm ) {

						const core = batch.spawn( 0.3 );
						core.position.copy( frame.nozzle );
						core.carry.copy( frame.velocity );
						core.frame = SHAPES.glow;
						core.size = 0.45 * frame.scale;
						core.grow = 0.3 * frame.scale;
						core.colour.set( 0xe0c8ff );
						core.kind = 2;

					}

					for ( let i = 0; i < 5; i ++ ) flung( frame, cloud( 1 ), 0.9, 1.5, 1 );

				},
				// Let go: the galaxy drifts on as it fades, a few slow clouds round it. Run dry: a dying star,
				// a red giant at the exhaust shrinking away, in a nova's shell (not for a visitor asking for
				// less motion).
				cool( frame, dry, detail, calm ) {

					f = frame;
					for ( const p of batch.items ) if ( p.age < p.life && p.kind === 0 ) p.drag = 0.4;
					for ( let i = 0; i < 6; i ++ ) flung( frame, cloud( 1 ), 0.9, 0.6 );
					if ( ! dry ) return;
					const giant = batch.spawn( 0.5 );
					giant.position.copy( frame.nozzle );
					giant.carry.copy( frame.velocity );
					giant.frame = SHAPES.glow;
					giant.size = 0.35 * frame.scale;
					giant.grow = - 0.3 * frame.scale;
					giant.colour.set( 0xff5a8a );
					giant.kind = 4;
					if ( calm ) return;
					const shell = batch.spawn( 0.45 );
					shell.position.copy( frame.nozzle );
					shell.carry.copy( frame.velocity );
					shell.axis.copy( frame.back );
					shell.mode = FLAT;
					shell.frame = SHAPES.ring;
					shell.size = 0.2 * frame.scale;
					shell.grow = 1.2 * frame.scale;
					shell.colour.set( 0xff8ab0 );
					shell.alpha = 0.6;
					shell.kind = 5;

				},
			};

		},
	},

	// Dragon fire: a deep red flame roaring out ragged tongues of fire that cool from orange to a deep
	// red, in breaths, throwing glowing embers that float up and curls of dark smoke. The flame, the
	// tongues and the smoke are drawn as they are, not added (glowing), so the fire stays red against a
	// bright sky rather than washing out to yellow; the embers glow. In overdrive, blue-hot breath and
	// volleys of fireballs; let go, a snort of smoke, and run dry, a choke.
	dragon: {
		// (A short, ragged cone: drawn over the scene, any longer it reads from the chase camera as a
		// flat red stick down the view; its tongues of fire carry the length.)
		flame: { outer: 0xc8160a, inner: 0xff6a14, halo: 0xff4a1a, length: 0.7, flicker: 2.2, deep: true, diamonds: false },
		tint: 0xff5a2a,
		make( root ) {

			const fire = new Batch( root, { particles: 150 } );
			const sparks = new Batch( root, { particles: 120, quads: 1, blending: AdditiveBlending } );
			const tongues = emitter();
			const embers = emitter();
			const puffs = emitter();
			const hot = new Color( 0xffbe3a );
			const whiteHot = new Color( 0xfff2c8 );
			const hottest = new Color();
			const warm = new Color( 0xff4210 );
			const dark = new Color( 0x7a1006 );
			const base = new Color( 0x7ab8ff );
			let f = null;
			let roar = 1;
			let fireballDue = 0;
			let chokes = 0;
			let chokeDue = 0;
			// A tongue of fire, drawn along the way it's swept, back and a little up: its round foot
			// first, its tip trailing. Under it, glowing, its heat.
			const tongue = k => {

				const p = fire.spawn( 0.3 + Math.random() * 0.15 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.25 * f.scale, ( Math.random() - 0.5 ) * 0.2 * f.scale, p.position );
				// (Kept up with it, a couple of metres of fire behind it, never thrown back at the lens.)
				thrown( f, p, 0.96, 3 + Math.random() * 1.5, 0.8, 1 );
				p.mode = ALONG;
				p.frame = SHAPES.wisp;
				p.axis.copy( f.back ).addScaledVector( f.up, 0.2 + Math.random() * 0.3 ).addScaledVector( f.right, ( Math.random() - 0.5 ) * 0.6 ).normalize();
				p.size = 0.16 * f.scale * roar;
				p.grow = 0.12 * f.scale;
				p.alpha = 0.85;
				p.kind = 1;
				const heat = sparks.spawn( p.life * 0.8 );
				heat.position.copy( p.position );
				heat.carry.copy( p.carry );
				heat.velocity.copy( p.velocity );
				heat.frame = SHAPES.glow;
				heat.size = 0.14 * f.scale;
				heat.grow = 0.16 * f.scale;
				heat.colour.set( 0xff5a14 );
				heat.alpha = 0.4;
				heat.kind = 1;
				return p;

			};
			// An ember, a spark streaking the way it floats (falling with no air to hold it up).
			const ember = k => {

				const p = sparks.spawn( 0.6 + Math.random() * 0.5 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.5 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.86, 2 + Math.random() * 2, 1.6, 1.8 );
				p.mode = ALONG;
				p.frame = SHAPES.spark;
				p.size = 0.025 * f.scale;
				p.colour.set( pick( DRAGON_EMBERS ) );
				p.fall = f.air ? - 0.12 : 1;
				p.drag = 1.2;
				return p;

			};
			const puff = ( k, colour = pick( DRAGON_SMOKE ) ) => {

				const p = fire.spawn( 1.1 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, 0.15 * f.scale, p.position );
				thrown( f, p, 0.95, 1.5 + Math.random(), 0.9, 0.5 );
				p.frame = SHAPES.puff;
				p.size = 0.15 * f.scale;
				p.grow = 0.4 * f.scale;
				p.colour.set( colour );
				p.alpha = 0.3;
				p.fall = - 0.06;
				p.drag = 1;
				p.spin = ( Math.random() < 0.5 ? - 1 : 1 ) * ( 0.8 + Math.random() );
				p.turn = Math.random() * Math.PI * 2;
				return p;

			};
			// A fireball thrown back out of it, in a glow, embers flying off it.
			const fireball = () => {

				// (Kept up with it, a couple of metres back, not flung back into the chase camera.)
				const p = fire.spawn( 0.4 );
				p.position.copy( f.nozzle );
				thrown( f, p, 0.97, 3, 0.4, 0.5 );
				p.mode = ALONG;
				p.frame = SHAPES.wisp;
				p.axis.copy( f.back ).multiplyScalar( 0.45 * f.scale );
				p.size = 0.26 * f.scale;
				p.alpha = 0.95;
				p.kind = 2;
				const glow = sparks.spawn( 0.4 );
				glow.position.copy( p.position );
				glow.carry.copy( p.carry );
				glow.velocity.copy( p.velocity );
				glow.frame = SHAPES.glow;
				glow.size = 0.3 * f.scale;
				glow.colour.set( 0xff7a2a );
				glow.alpha = 0.45;
				glow.kind = 1;
				for ( let i = 0; i < 4; i ++ ) {

					const spark = ember( 1 );
					spark.position.copy( p.position );
					flung( f, spark, 0.85, 3, 6 );

				}

			};
			const burning = {
				// Smoke curls as it rises (with no air, there's no smoke to).
				step( p, dt ) {

					if ( p.kind === 0 && f.air ) p.velocity.addScaledVector( f.right, Math.sin( p.age * 4 + p.phase ) * 1.4 * dt );

				},
				look( p, t, view ) {

					// A tongue of fire draws out longer as it goes, cooling from orange (near white in
					// overdrive) through red to a deep red; a fireball does too, holding its length; smoke
					// only shows once the fire's done with it.
					if ( p.kind >= 1 ) {

						if ( p.kind === 1 ) p.axis.setLength( ( 0.25 + 0.45 * t ) * f.scale );
						if ( t < 0.5 ) p.colour.lerpColors( hottest, warm, t / 0.5 );
						else p.colour.lerpColors( warm, dark, ( t - 0.5 ) / 0.5 );
						view.alpha = p.alpha * ( 1 - t );

					} else view.alpha = p.alpha * Math.min( 1, t * 5 ) * ( 1 - t );

				},
			};
			// An ember flickers, drawn along the way it flies; the heat under a tongue only fades.
			const flickering = {
				look( p, t, view ) {

					if ( p.kind !== 0 ) return;
					if ( p.mode === ALONG ) p.axis.copy( p.velocity ).add( p.carry ).sub( f.velocity ).setLength( 0.09 * f.scale );
					// (Only a gentle shimmer for a visitor asking for less motion.)
					view.alpha *= f.calm ? 0.9 + 0.1 * Math.sin( p.age * 6 + p.phase ) : 0.6 + 0.4 * Math.sin( p.age * 30 + p.phase );

				},
			};
			return {
				batches: [ fire, sparks ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					// Breathing: the roar swelling and easing a few times a second (gently, for a visitor
					// asking for less motion).
					roar = frame.calm ? 0.9 + 0.1 * Math.sin( frame.clock * 9 ) : 0.75 + 0.25 * Math.sin( frame.clock * 9 );
					hottest.lerpColors( hot, whiteHot, frame.hot );
					fire.begin();
					sparks.begin();
					// Overdrive: a blue-hot base to the flame, and volleys of fireballs.
					if ( frame.hot > 0.01 && fl > 0.01 ) {

						_v.copy( frame.nozzle ).addScaledVector( frame.back, 0.15 * frame.scale );
						const size = 0.22 * frame.scale * frame.hot;
						sparks.put( _v, frame.up, FACING, size, size, 0, SHAPES.glow, base, 0.7 * frame.hot * fl );

					}

					fireballDue -= frame.dt;
					if ( frame.hot > 0.5 && fl > 0.01 ) {

						if ( fireballDue <= 0 ) {

							fireballDue = frame.calm ? 0.25 : 0.12;
							fireball();

						}

					} else fireballDue = Math.max( fireballDue, 0 );
					puffs( frame.air ? fl : 0, frame.dt, 16 * frame.detail, puff );
					tongues( fl * roar, frame.dt, 55 * frame.detail, tongue );
					embers( fl, frame.dt, 60 * frame.detail, ember );
					// Run dry: it chokes, three black puffs a little apart, each with a few embers.
					if ( chokes > 0 ) {

						chokeDue -= frame.dt;
						if ( chokeDue <= 0 ) {

							chokes --;
							chokeDue = 0.12;
							if ( frame.air ) {

								const p = puff( 1, 0x2a1a14 );
								p.alpha = 0.45;
								p.life = 0.8;

							}

							for ( let i = 0; i < 3; i ++ ) flung( frame, ember( 1 ), 0.85, 2, 1, 1 );

						}

					}

					fire.update( frame.dt, burning );
					sparks.update( frame.dt, flickering );

				},
				// Lit: a roar, a fireball of tongues thrown back and out, a shower of embers and a ring of
				// smoke (none with no air).
				ignite( frame, detail ) {

					f = frame;
					if ( frame.air ) for ( let i = 0; i < 6; i ++ ) {

						const p = puff( 1 );
						p.velocity.addScaledVector( around( frame, i / 6 * Math.PI * 2, _v ), 2 );
						p.alpha = 0.4;

					}

					for ( let i = Math.round( 16 * detail ); i > 0; i -- ) {

						const p = tongue( 1 );
						p.life = 0.4 + Math.random() * 0.15;
						p.velocity.addScaledVector( frame.right, ( Math.random() - 0.5 ) * 5 ).addScaledVector( frame.up, ( Math.random() - 0.3 ) * 3 );
						p.axis.copy( p.velocity ).normalize();
						p.size = 0.2 * frame.scale;
						p.grow = 0.15 * frame.scale;
						p.drag = 2;

					}

					for ( let i = Math.round( 30 * detail ); i > 0; i -- ) flung( frame, ember( 1 ), 0.85, 4, 1.5, 1.5 );

				},
				// Let go: a snort, smoke out of both nostrils and a few embers. Run dry: a choke (see
				// update).
				cool( frame, dry ) {

					f = frame;
					if ( dry ) {

						chokes = 3;
						chokeDue = 0;
						return;

					}

					if ( frame.air ) for ( let side = - 1; side <= 1; side += 2 ) {

						const p = puff( 1 );
						p.position.copy( frame.nozzle ).addScaledVector( frame.right, side * 0.18 * frame.scale );
						p.velocity.copy( frame.right ).multiplyScalar( side * 2.5 ).addScaledVector( frame.up, 0.8 );
						p.size = 0.2 * frame.scale;
						p.grow = 0.6 * frame.scale;

					}

					for ( let i = 0; i < 6; i ++ ) flung( frame, ember( 1 ), 0.85, 2.5, 1, 1 );

				},
			};

		},
	},

	// Butterflies: clutches of bright wings fluttering up and away behind it, keeping up with it, each
	// wandering its own way with a little gold sparkle. In overdrive a migration of monarchs in V
	// formation; let go, they scatter. With no air they can't fly, and fall in long arcs.
	butterflies: {
		flame: { halo: 0xffe7a0, length: 0.45, flicker: 0.5 },
		tint: 0xffd27a,
		ember: 0xffe7a0,
		ash: 0x6a5a30,
		make( root ) {

			const batch = new Batch( root, { particles: 110 } );
			const colours = [ 0xff9a2e, 0x3dbdff, 0xffd21a, 0xff5ca8, 0x9b6bff, 0x4ddc6b ];
			const monarchs = [ 0xff8a1a, 0xffb02e, 0xff6a00 ];
			let f = null;
			let n = 0;
			let clutchDue = 0;
			let flockDue = 0;
			const butterfly = k => {

				// Kept up with it, and gone before they drift back to the camera.
				const p = batch.spawn( 1.1 + Math.random() * 0.3 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.6, ( Math.random() - 0.2 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.96, 0.8 + Math.random() * 0.6, 1.3, 0.8 );
				p.frame = SHAPES.butterfly;
				p.size = ( 0.12 + Math.random() * 0.04 ) * f.scale;
				p.colour.set( colours[ n ++ % colours.length ] );
				p.fall = f.air ? - 0.05 : 1;
				p.drag = f.air ? 1.3 : 0;
				return p;

			};
			// A little gold sparkle keeping it company.
			const sparkle = from => {

				const p = batch.spawn( 0.6 );
				p.position.copy( from.position );
				p.carry.copy( from.carry );
				p.velocity.copy( from.velocity ).multiplyScalar( 0.5 );
				p.frame = SHAPES.star;
				p.size = 0.035 * f.scale;
				p.colour.set( 0xfff1a8 );
				p.kind = 1;

			};
			// A clutch of them, in neighbouring colours, side by side.
			const clutch = () => {

				const count = f.detail < 1 ? 2 : 3;
				const first = n;
				for ( let i = 0; i < count; i ++ ) {

					const p = butterfly( 1 );
					p.position.addScaledVector( f.right, ( i - ( count - 1 ) / 2 ) * 0.15 * f.scale ).addScaledVector( f.up, 0.1 * f.scale );
					p.colour.set( colours[ ( first + i ) % colours.length ] );
					sparkle( p );

				}

				n = first + 1;

			};
			// Overdrive: a V of monarchs flying together.
			const flock = () => {

				for ( let i = 0; i < 5; i ++ ) {

					const p = batch.spawn( 1.2 + Math.random() * 0.2 );
					p.position.copy( f.nozzle ).addScaledVector( f.right, ( i - 2 ) * 0.22 * f.scale ).addScaledVector( f.back, Math.abs( i - 2 ) * 0.15 * f.scale ).addScaledVector( f.up, 0.15 * f.scale );
					thrown( f, p, 0.96, 1, 0.6, 0 );
					p.frame = SHAPES.butterfly;
					p.size = 0.13 * f.scale;
					p.colour.set( monarchs[ i % monarchs.length ] );
					p.turn = 0.5 * Math.sign( i - 2 );
					p.fall = f.air ? - 0.05 : 1;
					p.kind = 3;

				}

			};
			const hooks = {
				// Wandering, up and down and side to side, each its own way (not with no air to fly in, nor
				// in formation).
				step( p, dt ) {

					if ( p.kind !== 0 || ! f.air ) return;
					p.velocity.addScaledVector( f.right, Math.sin( p.age * 2.3 + p.phase ) * 2.2 * dt ).addScaledVector( f.up, Math.cos( p.age * 3.1 + p.phase ) * 1.5 * dt );

				},
				look( p, t, view ) {

					if ( p.kind === 1 ) {

						// A sparkle twinkles (slowly for a visitor asking for less motion).
						view.sx *= 0.4 + 0.6 * Math.abs( Math.sin( p.age * ( f.calm ? 10 : 28 ) + p.phase ) );
						view.sy = view.sx;
						return;

					}

					// Its wings beating: squashed across and open again, a few times a second; a tired one's
					// shut; in formation, quicker and banked.
					const rate = ! f.air ? 5 : p.kind === 3 ? ( f.calm ? 14 : 26 ) : 16;
					if ( p.kind === 2 ) view.sx *= 0.25;
					else view.sx *= ( p.kind === 3 ? 0.75 : 1 ) * ( 0.2 + 0.8 * Math.abs( Math.cos( p.age * rate + p.phase ) ) );
					if ( p.kind === 0 ) view.turn = 0.35 * Math.sin( p.age * 2 + p.phase );
					view.alpha = Math.min( 1, t * 10, ( 1 - t ) * 4 );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					batch.begin();
					clutchDue -= frame.dt * fl;
					if ( fl <= 0.01 ) clutchDue = Math.max( clutchDue, 0 );
					else while ( clutchDue <= 0 ) {

						clutchDue += 0.24;
						clutch();

					}

					flockDue -= frame.dt;
					if ( overdrive( frame ) > 0 && fl > 0.01 ) {

						if ( flockDue <= 0 ) {

							flockDue = 0.3;
							flock();

						}

					} else flockDue = Math.max( flockDue, 0 );
					batch.update( frame.dt, hooks );

				},
				// Lit: a flutter of butterflies bursting out every way.
				ignite( frame, detail ) {

					f = frame;
					for ( let i = Math.max( 5, Math.round( 12 * detail ) ); i > 0; i -- ) {

						const p = butterfly( 1 );
						flung( frame, p, 0.85, 2.5, 0.5, 1.5 );
						p.size = ( 0.14 + Math.random() * 0.05 ) * frame.scale;
						p.drag = 1.8;

					}

				},
				// Let go: they scatter, up and out every way. Run dry: three tired ones, wings shut,
				// spiralling down.
				cool( frame, dry ) {

					f = frame;
					for ( const p of batch.items ) if ( p.age < p.life && p.kind !== 1 ) {

						// Up and out to the sides, not back over the camera.
						_a.copy( f.right ).multiplyScalar( ( Math.random() - 0.5 ) * 2 ).addScaledVector( f.up, 0.3 + Math.random() ).normalize();
						p.velocity.addScaledVector( _a, 2 );
						p.drag = 0.6;

					}

					if ( ! dry ) return;
					for ( let i = 0; i < 3; i ++ ) {

						const p = butterfly( 1 );
						p.velocity.copy( frame.back ).multiplyScalar( 0.6 );
						p.fall = 0.25;
						p.spin = 3;
						p.kind = 2;

					}

				},
			};

		},
	},

	// Spooky: glowing wisps streaming and curling out of a ghostly green flame, and little ghosts
	// floating off behind, creeping after it, bobbing as they go. In overdrive a vortex of spirits
	// circles the exhaust and the shock diamonds burn green; let go, the ghosts vanish with a poof.
	spooky: {
		flame: { outer: 0x3dffa8, inner: 0xe8fff4, halo: 0x7dffc8, length: 0.6, flicker: 1.5, diamondTint: 0x7dffc8 },
		tint: 0x9dffd0,
		ember: 0x7dffc8,
		ash: 0x1e4a3a,
		make( root ) {

			const SPIRITS = 4;
			const glow = new Batch( root, { particles: 110, blending: AdditiveBlending } );
			const ghosts = new Batch( root, { particles: 36, quads: SPIRITS } );
			const wisps = emitter();
			const floats = emitter();
			const shades = [ 0xffffff, 0xe6fff4, 0xf0e8ff ];
			const pale = new Color( 0xe6fff4 );
			let f = null;
			let orbit = 0;
			const wisp = k => {

				const p = glow.spawn( 0.6 + Math.random() * 0.3 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.3 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.9, 2 + Math.random(), 1.2, 0.8 );
				p.mode = ALONG;
				p.frame = SHAPES.wisp;
				p.size = ( 0.09 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( pick( SPOOKY_WISPS ) );
				p.alpha = 0.85;
				p.fall = f.air ? - 0.2 : 0;
				p.drag = 1.2;
				return p;

			};
			const ghost = k => {

				const p = ghosts.spawn( 1.4 + Math.random() * 0.4 );
				// Out a little behind the exhaust, not over the driver.
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, 0.1 * f.scale, p.position ).addScaledVector( f.back, 0.3 * f.scale );
				thrown( f, p, 0.93, 1.6, 1, 0.3 );
				p.frame = SHAPES.ghost;
				p.size = ( 0.17 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( pick( shades ) );
				p.alpha = 0.92;
				p.fall = f.air ? - 0.08 : 0;
				p.drag = 1.4;
				return p;

			};
			const curling = {
				// Corkscrewing as it streams back (less for a visitor asking for less motion).
				step( p, dt ) {

					const curl = f.calm ? 0.5 : 1;
					p.velocity.addScaledVector( f.right, Math.sin( p.age * 7 + p.phase ) * 3 * curl * dt ).addScaledVector( f.up, Math.cos( p.age * 7 + p.phase ) * 1.5 * curl * dt );

				},
				look( p, t, view ) {

					view.alpha = p.alpha * swell( t );
					// Drawn trailing back from its round head, the way it flies.
					if ( p.mode === ALONG && p.velocity.lengthSq() > 1e-4 ) p.axis.copy( p.velocity ).normalize().multiplyScalar( - ( 0.14 + 0.1 * t ) * f.scale );
					else view.turn = 0.4 * Math.sin( p.age * 6 + p.phase );

				},
			};
			const floating = {
				// Drifting side to side, and creeping after it.
				step( p, dt ) {

					p.velocity.addScaledVector( f.right, Math.sin( p.age * 2 + p.phase ) * 1.2 * dt ).addScaledVector( f.back, - 0.8 * dt );

				},
				look( p, t, view ) {

					// Bobbing and rocking a little, fading in and away; vanishing with a poof (only fading
					// for a visitor asking for less motion).
					view.position.addScaledVector( f.up, Math.sin( p.age * 5 + p.phase ) * 0.06 * f.scale );
					view.turn = 0.25 * Math.sin( p.age * 3 + p.phase );
					if ( p.kind === 1 ) {

						const u = 1 - ( p.life - p.age ) / 0.35;
						if ( ! f.calm ) {

							view.sx *= 1 + u;
							view.sy *= 1 - 0.5 * u;

						}

						view.alpha = p.alpha * ( 1 - u ) ** 2;

					} else view.alpha = p.alpha * Math.min( 1, t / 0.15, ( 1 - t ) / 0.3 );
					// One that's crept up over the vehicle fades out there, so it never hides the driver.
					const near = view.position.distanceTo( f.middle ) / f.scale;
					if ( near < 1.1 ) view.alpha *= Math.max( 0, ( near - 0.5 ) / 0.6 );

				},
			};
			return {
				batches: [ glow, ghosts ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					glow.begin();
					ghosts.begin();
					// Overdrive: a vortex of spirits circling the exhaust (slower and fainter for a visitor
					// asking for less motion).
					orbit += frame.dt * ( frame.calm ? 2.5 : 5 );
					if ( frame.hot > 0.01 && fl > 0.01 ) for ( let i = 0; i < SPIRITS; i ++ ) {

						const angle = orbit + i * Math.PI / 2;
						_v.copy( frame.nozzle ).addScaledVector( around( frame, angle, _a ), 0.4 * frame.scale ).addScaledVector( frame.back, 0.3 * frame.scale );
						const size = 0.14 * frame.scale;
						ghosts.put( _v, frame.up, FACING, size, size, angle, SHAPES.ghost, pale, ( frame.calm ? 0.4 : 0.6 ) * frame.hot * fl );

					}

					wisps( fl, frame.dt, ( 45 + 25 * frame.hot ) * frame.detail, wisp );
					floats( fl, frame.dt, 7 * frame.detail, ghost );
					glow.update( frame.dt, curling );
					ghosts.update( frame.dt, floating );

				},
				// Lit: "Boo!", a ring of ghosts popping out round the exhaust, and a puff of wisps.
				ignite( frame, detail ) {

					f = frame;
					const count = Math.max( 4, Math.round( 6 * detail ) );
					for ( let i = 0; i < count; i ++ ) {

						const p = ghost( 1 );
						around( frame, ( i + 0.5 ) / count * Math.PI * 2, _v );
						p.position.copy( frame.nozzle ).addScaledVector( _v, 0.2 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.88 );
						p.velocity.copy( _v ).multiplyScalar( 2.2 ).addScaledVector( frame.back, 1 ).addScaledVector( frame.up, 0.8 );
						p.size = ( 0.2 + Math.random() * 0.04 ) * frame.scale;
						p.life = 1.2;

					}

					for ( let i = Math.round( 20 * detail ); i > 0; i -- ) {

						const p = wisp( 1 );
						flung( frame, p, 0.88, 2.5, 1, 1 );
						p.mode = FACING;

					}

				},
				// Let go: every ghost vanishes with a poof, leaving a wisp or two. Run dry: it gives up the
				// ghost, one big one rising out of it.
				cool( frame, dry ) {

					f = frame;
					for ( const p of ghosts.items ) if ( p.age < p.life && p.kind === 0 ) {

						p.life = p.age + 0.35;
						p.kind = 1;
						for ( let i = 0; i < 2; i ++ ) {

							const w = wisp( 1 );
							w.position.copy( p.position );
							w.carry.copy( p.carry );
							w.velocity.set( Math.random() - 0.5, Math.random(), Math.random() - 0.5 );

						}

					}

					if ( ! dry ) return;
					const p = ghost( 1 );
					// Rising up out of it fast, so it's seen over the driver's head rather than in front.
					p.position.copy( frame.nozzle ).addScaledVector( frame.back, 0.4 * frame.scale ).addScaledVector( frame.up, 1.1 * frame.scale );
					p.velocity.copy( frame.up ).multiplyScalar( 2.2 ).addScaledVector( frame.back, 0.8 );
					p.size = 0.3 * frame.scale;
					p.life = 1.2;
					p.fall = 0;
					p.drag = 0.5;

				},
			};

		},
	},

	// Neon laser: a laser show out of the exhaust, beams in cyan, pink, lime and blue sweeping side to
	// side and up and down, a flare at each one's end, bolts of light shot out along them and a scan
	// line swept across the road behind. In overdrive the beams close into a turning tunnel shot
	// through with hoops; let go, they retract, and run dry they drop out one by one.
	laser: {
		flame: { halo: 0xff6bf0, length: 0.5, flicker: 0.4 },
		tint: 0xff7cf4,
		make( root ) {

			const BEAMS = 4;
			const batch = new Batch( root, { particles: 120, quads: BEAMS * 3 + 2, blending: AdditiveBlending } );
			const bolts = emitter();
			const colours = [ 0x2df4ff, 0xff2df0, 0x8cff2d, 0x3d7dff ];
			const colour = new Color();
			const white = new Color( 0xffffff );
			const way = new Vector3();
			const cage = new Vector3();
			const half = new Vector3();
			const middle = new Vector3();
			const end = new Vector3();
			let f = null;
			let turn = 0;
			let hoopDue = 0;
			let hoops = 0;
			let pops = 0;
			let popDue = 0;
			let dropped = 0;
			// Where beam `b` points now: back, up and out, sweeping like a stage's lasers into the sky;
			// in overdrive closing into a cage turning round the way back.
			const aim = ( b, target ) => {

				const sweep = Math.sin( f.clock * 2.6 + b * 1.7 ) * 0.6 + ( b - ( BEAMS - 1 ) / 2 ) * 0.4;
				target.copy( f.back ).multiplyScalar( 0.75 ).addScaledVector( f.right, Math.sin( sweep ) * 0.9 ).addScaledVector( f.up, 0.6 + 0.3 * Math.sin( f.clock * 1.9 + b * 2.3 ) ).normalize();
				if ( f.hot > 0 ) target.lerp( cage.copy( f.back ).addScaledVector( around( f, turn + b * Math.PI / 2, _a ), 0.45 ).normalize(), f.hot ).normalize();
				return target;

			};
			// A bolt of light shot out along one of the beams, its head first.
			const bolt = k => {

				const b = Math.floor( Math.random() * BEAMS );
				if ( b < dropped ) return;
				aim( b, way );
				const p = batch.spawn( 0.2 );
				nozzleAt( f, k, 0, 0, p.position );
				p.carry.copy( f.velocity ).multiplyScalar( 0.97 );
				p.velocity.copy( way ).multiplyScalar( 18 );
				p.mode = ALONG;
				p.frame = SHAPES.spark;
				p.axis.copy( way ).multiplyScalar( 0.45 * f.scale );
				p.size = 0.06 * f.scale;
				p.colour.set( colours[ b ] );

			};
			// A hoop of light round the beams, in one of their colours.
			const hoop = ( b, size, grow, back, life, alpha ) => {

				const p = batch.spawn( life );
				p.position.copy( f.nozzle );
				thrown( f, p, 0.9, back, 0, 0 );
				p.axis.copy( f.back );
				p.mode = FLAT;
				p.frame = SHAPES.ring;
				p.size = size * f.scale;
				p.grow = grow * f.scale;
				p.colour.set( colours[ b % BEAMS ] );
				p.alpha = alpha;

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const { scale, hot, clock } = frame;
					const fl = flow( frame );
					if ( frame.power > 0 && pops === 0 ) dropped = 0;
					turn += frame.dt * ( frame.calm ? 1 : 3 );
					batch.begin();
					if ( fl > 0.01 ) {

						// Retracting into the exhaust as it's let go, and sputtering as it coughs.
						const length = ( 2.4 + 1.8 * hot ) * scale * ( 0.5 + 0.5 * frame.power ) * fl;
						for ( let b = dropped; b < BEAMS; b ++ ) {

							// Each a throbbing glow in its colour round a white-hot core (steady for a visitor
							// asking for less motion), a flare where it ends (none for them).
							aim( b, way );
							half.copy( way ).multiplyScalar( length / 2 );
							middle.copy( frame.nozzle ).add( half );
							colour.set( colours[ b ] );
							const throb = frame.calm ? 1 : 0.75 + 0.25 * Math.sin( clock * 40 + b * 2 );
							batch.put( middle, half, ALONG, 0.1 * scale, 1, 0, SHAPES.beam, colour, 0.7 * throb * fl );
							batch.put( middle, half, ALONG, ( 0.03 + 0.02 * hot ) * scale, 1, 0, SHAPES.beam, white, 0.85 * fl );
							if ( ! frame.calm ) batch.put( end.copy( middle ).add( half ), frame.up, FACING, 0.14 * scale, 0.14 * scale * 0.3, 0, SHAPES.flare, colour, 0.8 * fl );

						}

						// Where they come from: a glow in each of their colours in turn.
						colour.set( colours[ Math.floor( clock * 4 ) % BEAMS ] );
						const glow = 0.28 * scale;
						batch.put( frame.nozzle, frame.up, FACING, glow, glow, 0, SHAPES.glow, colour, 0.8 * fl );
						// A scan line swept across the road behind it, on the ground.
						if ( frame.grounded ) {

							_v.copy( frame.ground ).addScaledVector( frame.back, 1.2 * scale ).addScaledVector( frame.up, INK_LIFT );
							const heading = Math.atan2( - frame.back.x, - frame.back.z );
							batch.put( _v, frame.up, FLAT, 0.04 * scale, 1 * scale, heading + Math.sin( clock * 3 ) * 0.8, SHAPES.streak, colour, 0.8 * fl );

						}

					}

					// Overdrive: hoops of light shot back through the tunnel.
					hoopDue -= frame.dt;
					if ( hot > 0.3 && fl > 0.01 ) {

						if ( hoopDue <= 0 ) {

							hoopDue = frame.calm ? 0.3 : 0.14;
							hoop( hoops ++, 0.3, 0.4, 6, 0.5, 1 );

						}

					} else hoopDue = Math.max( hoopDue, 0 );
					// (As many on a phone: they're all its beams have to stream.)
					bolts( fl, frame.dt, 36, bolt );
					// Run dry: the beams drop out one by one, each with a ring popping in its colour.
					if ( pops > 0 ) {

						popDue -= frame.dt;
						if ( popDue <= 0 ) {

							popDue = 0.08;
							hoop( dropped, 0.2, 0.9, 1, 0.3, 0.9 );
							dropped ++;
							pops --;

						}

					}

					batch.update( frame.dt );

				},
				// Lit: a starburst of beams all round at once, and a hoop of light blown out behind. For a
				// visitor asking for less motion, half as many beams, dim, and a fainter hoop.
				ignite( frame, detail, calm ) {

					f = frame;
					pops = dropped = 0;
					const count = calm ? Math.max( 4, Math.round( 6 * detail ) ) : Math.max( 8, Math.round( 12 * detail ) );
					for ( let i = 0; i < count; i ++ ) {

						const p = batch.spawn( 0.28 );
						around( frame, i / count * Math.PI * 2, way ).addScaledVector( frame.back, 0.5 ).normalize();
						p.axis.copy( way ).multiplyScalar( 0.75 * frame.scale );
						p.position.copy( frame.nozzle ).add( p.axis );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.97 );
						p.mode = ALONG;
						p.frame = SHAPES.beam;
						p.size = 0.07 * frame.scale;
						p.colour.set( colours[ i % BEAMS ] );
						p.alpha = calm ? 0.35 : 1;

					}

					const hoop = batch.spawn( 0.4 );
					hoop.position.copy( frame.nozzle );
					thrown( frame, hoop, 0.95, 2, 0, 0 );
					hoop.axis.copy( frame.back );
					hoop.mode = FLAT;
					hoop.frame = SHAPES.ring;
					hoop.size = 0.25 * frame.scale;
					hoop.grow = 1.1 * frame.scale;
					hoop.colour.set( colours[ 1 ] );
					hoop.alpha = calm ? 0.6 : 1;

				},
				// Run dry: the beams drop out one by one (see update; not for a visitor asking for less
				// motion, whose beams only retract).
				cool( frame, dry, detail, calm ) {

					f = frame;
					if ( ! dry || calm ) return;
					pops = BEAMS;
					popDue = 0;

				},
			};

		},
	},

	// Slime: blobs of green goo flung out behind, wobbling as they fly and splatting where they land,
	// out of a gooey jet, bubbles that swell and pop, and puddles of it on the road for a couple of
	// seconds. In overdrive the rear wheels throw up rooster tails of it; let go, it drips, and run dry,
	// a last sploot.
	slime: {
		flame: null,
		tint: 0x9dff4d,
		ember: 0x9dff4a,
		ash: 0x2f4a10,
		make( root ) {

			const batch = new Batch( root, { particles: 210, quads: 1 } );
			const blobs = emitter();
			const wakes = emitter();
			const bubbles = emitter();
			const puddles = emitter();
			const greens = [ 0x7dff2e, 0x52e01a, 0xb8ff4d, 0x3dd65a ];
			const jet = new Color( 0x7dff2e );
			let f = null;
			let side = 1;
			let drip = 0;
			let dripDue = 0;
			const blob = k => {

				const p = batch.spawn( 0.35 + Math.random() * 0.2 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.4, 0, p.position );
				thrown( f, p, 0.7, 3 + Math.random() * 2, 1.3, 1 );
				p.frame = SHAPES.drop;
				p.size = ( 0.07 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( pick( greens ) );
				p.fall = 1;
				return p;

			};
			// Overdrive: a rooster tail of it off each rear wheel.
			const wake = () => {

				side = - side;
				const p = blob( 1 );
				p.position.copy( f.ground ).addScaledVector( f.right, side * f.size.width * 0.45 ).addScaledVector( f.up, 0.1 * f.scale );
				p.velocity.copy( f.right ).multiplyScalar( side * ( 2.5 + Math.random() * 1.5 ) ).addScaledVector( f.up, 2.5 ).addScaledVector( f.back, 2 );
				p.life = 0.7;

			};
			const bubble = k => {

				const p = batch.spawn( 0.5 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.4, Math.random() * 0.2 * f.scale, p.position );
				thrown( f, p, 0.88, 1.5 + Math.random(), f.air ? 0.7 : 0, 0.6 );
				p.frame = SHAPES.bubble;
				p.size = ( 0.07 + Math.random() * 0.05 ) * f.scale;
				p.grow = p.size * 0.4;
				p.colour.set( 0xd6ff9a );
				p.alpha = 1;
				p.fall = f.air ? - 0.05 : 1;
				p.drag = 1;
				p.kind = 1;
				return p;

			};
			const puddle = () => {

				const p = onRoad( batch, f, 0.3 + Math.random() * 0.25, 2.5, 3.5 );
				p.colour.set( pick( greens ) );
				p.kind = 2;

			};
			const hooks = {
				// A blob coming down on the road it's on splats there, a puddle where it landed.
				step( p ) {

					if ( p.kind !== 0 || ! f.grounded || p.velocity.dot( f.up ) >= 0 ) return;
					const high = _a.subVectors( p.position, f.ground ).dot( f.up );
					if ( high > 0.03 * f.scale ) return;
					p.kind = 2;
					p.mode = FLAT;
					p.axis.copy( f.up );
					p.frame = SHAPES.splat + Math.floor( Math.random() * 3 );
					p.size *= 2.2;
					p.aspect = 0.7;
					_a.copy( p.velocity ).add( p.carry );
					p.turn = Math.atan2( - _a.x, - _a.z );
					p.velocity.set( 0, 0, 0 );
					p.carry.set( 0, 0, 0 );
					p.fall = 0;
					p.life = p.age + 1.5;
					p.position.addScaledVector( f.up, INK_LIFT - high );

				},
				look( p, t, view ) {

					if ( p.kind === 0 ) {

						// A blob wobbles, squashing one way and then the other, and doesn't fade; just thrown,
						// it's drawn out along the way it flies.
						if ( p.age < 0.08 && p.velocity.lengthSq() > 1e-4 ) {

							p.mode = ALONG;
							p.axis.copy( p.velocity ).normalize().multiplyScalar( 0.12 * f.scale );

						} else p.mode = FACING;
						const wobble = 0.22 * Math.sin( p.age * 30 + p.phase );
						view.sx *= 1 + wobble;
						view.sy *= 1 - wobble;
						view.alpha = 1;

					} else if ( p.kind === 1 ) {

						// A bubble swells and pops.
						const pop = MathUtils.smoothstep( t, 0.85, 1 );
						view.sx *= 1 + pop * 0.6;
						view.sy = view.sx;
						view.alpha = p.alpha * ( 1 - pop );

					} else {

						// A puddle stays until its last moments.
						view.alpha = Math.min( 1, ( p.life - p.age ) / 0.8 );

					}

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					const fl = flow( frame );
					batch.begin();
					// A gooey jet out of the exhaust, pulsing (barely, for a visitor asking for less motion).
					if ( fl > 0.01 ) {

						const reach = 0.25 * frame.scale * ( 1 + ( frame.calm ? 0.05 : 0.15 ) * Math.sin( frame.clock * 20 ) );
						_v.copy( frame.nozzle ).addScaledVector( frame.back, reach );
						batch.put( _v, _b.copy( frame.back ).multiplyScalar( reach ), ALONG, 0.07 * frame.scale, 1, 0, SHAPES.streak, jet, 0.9 * fl );

					}

					blobs( fl, frame.dt, 36 * frame.detail, blob );
					wakes( frame.grounded && overdrive( frame ) > 0 ? fl : 0, frame.dt, 40 * frame.hot * frame.detail, wake );
					bubbles( fl, frame.dt, 30 * frame.detail, bubble );
					puddles( frame.grounded ? fl : 0, frame.dt, ( 10 + 15 * frame.hot ) * frame.detail, puddle );
					// Let go: it drips for a moment.
					if ( drip > 0 ) {

						drip -= frame.dt;
						dripDue -= frame.dt;
						while ( dripDue <= 0 ) {

							dripDue += 0.1;
							const p = blob( 1 );
							thrown( frame, p, 0.95, 0.3, 0, 0.2 );
							p.size = 0.06 * frame.scale;
							p.life = 0.6;

						}

					}

					batch.update( frame.dt, hooks );

				},
				// Lit: a splurt, blobs thrown back and up in a fan, a froth of bubbles and a puddle or two.
				ignite( frame, detail ) {

					f = frame;
					for ( let i = Math.round( 22 * detail ); i > 0; i -- ) {

						const p = blob( 1 );
						p.velocity.addScaledVector( frame.right, ( Math.random() - 0.5 ) * 6 ).addScaledVector( frame.up, Math.random() * 2 );
						p.size = ( 0.08 + Math.random() * 0.07 ) * frame.scale;

					}

					for ( let i = Math.round( 10 * detail ); i > 0; i -- ) flung( frame, bubble( 1 ), 0.88, 1.5, 0.5, frame.air ? 0.5 : 0 );
					if ( frame.grounded ) for ( let i = 0; i < 2; i ++ ) puddle();

				},
				// Let go: a drip. Run dry: a sploot, one big blob, a froth of bubbles popping at once and a
				// puddle.
				cool( frame, dry ) {

					f = frame;
					if ( ! dry ) {

						drip = 0.6;
						dripDue = 0;
						return;

					}

					const p = blob( 1 );
					thrown( frame, p, 0.7, 3, 1.5, 0 );
					p.size = 0.2 * frame.scale;
					p.life = 0.8;
					for ( let i = 0; i < 6; i ++ ) {

						const b = bubble( 1 );
						b.position.copy( frame.nozzle );
						b.life = 0.25;

					}

					if ( frame.grounded ) puddle();

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

// The colours a style's exhaust cools through once it's let go, { ember, ash } (hex, see
// drive-bursts.js), or undefined for the classic ember and ash.
export function styleEmber( id ) {

	const style = STYLES[ id ];
	return style?.ember ? { ember: style.ember, ash: style.ash } : undefined;

}

// The colour a style's ignition flashes in (see drive-bursts.js), or undefined for the classic
// flame, whose flash is its flame's.
export function styleTint( id ) {

	return STYLES[ id ]?.tint;

}

// Nothing a style's thrown out is carried on faster than the vehicle is going now: carried at
// nearly its speed, a trail would otherwise catch it up as it slows (out of overdrive, or braking)
// and fly on past it, through the chase camera. Only what's carried ahead of it is held back; what
// it's thrown out with besides (back, up, out) is as it was.
function keepBehind( batches, frame ) {

	const ahead = _r.copy( frame.back ).negate();
	const most = Math.max( 0, frame.velocity.dot( ahead ) );
	for ( const batch of batches ) for ( const p of batch.items ) {

		if ( p.age >= p.life ) continue;
		const over = p.carry.dot( ahead ) - most;
		if ( over > 0 ) p.carry.addScaledVector( ahead, - over );

	}

}

// The style `id`'s particles, in `root`: { update( frame ), ignite( frame, detail, calm ), cool(
// frame, dry, detail, calm ), gravity, alive, budget }, or null for the classic flame (or a name it
// doesn't know). Disposing of `root` disposes of them.
export function createBoostStyle( root, id ) {

	const style = STYLES[ id ];
	if ( ! style ) return null;
	const made = style.make( root );
	return {
		update( frame ) {

			made.update( frame );
			keepBehind( made.batches, frame );

		},
		// Its own burst as the booster lights, `detail` (0 to 1) of its usual count; `calm`, without
		// a flash (the visitor asked for less motion).
		ignite: ( frame, detail = 1, calm = false ) => made.ignite?.( frame, detail, calm ),
		// Let go (or run `dry`): a moment of its own as its stream dies down, or sputters out.
		cool: ( frame, dry = false, detail = 1, calm = false ) => made.cool?.( frame, dry, detail, calm ),
		// The world's gravity, a share of the Earth's (the Moon's 0.165): what its particles fall by.
		set gravity( g ) {

			for ( const batch of made.batches ) batch.gravity = 9.81 * g;

		},
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

// Going supersonic (see drive.js): a sonic boom once, shock rings blown out round the vehicle with
// a flash, the widest of them lingering as it spreads so it's seen from the chase camera, and a
// collar of condensation snapping out round its body; and while it lasts, streaks of air streaming
// back past it on the cone of the shock it drags behind it, and shock diamonds burning down its
// flame. Any style gets these. `tint`: the ride's colour (its flame's glow, or its style's), which
// the boom's rings and the streaks take on, or null for the default ice blue; `rainbow`: they run
// through the hues instead; `deep`: a deep flame (see drive-fx.js's DEEP), whose rings take less of
// its colour, so they still read as light; `diamonds`: the ride has a flame for them to burn in,
// `diamondTint` the colour they burn in instead of white (spooky's will-o'-wisps), or null;
// `effects`: drive-fx.js's, read as they're needed: `detail` and `calm` as the bursts have them, and
// `air` false where there's none (World Drive's Moon), with no vapour, no white shock and no
// diamonds, which all need air round the vehicle.
export function createSupersonic( root, { tint = null, rainbow = false, deep = false, diamonds = false, diamondTint = null, effects = {} } = {} ) {

	// (Room for the boom's longest ring to live out its life with the collar and the streaks after
	// it, on something big.)
	const batch = new Batch( root, { particles: 136, quads: DIAMONDS_OVER * 2, blending: AdditiveBlending } );
	const streaks = emitter();
	const travel = new Vector3();
	// The boom's colours, made once: white-hot, a pale wash of the ride's colour and a richer one.
	const white = new Color( 0xffffff );
	const pale = new Color( 0xbfe4ff );
	const rich = new Color( 0x9fd4ff );
	if ( tint ) {

		pale.copy( white ).lerp( tint, 0.4 );
		rich.copy( white ).lerp( tint, deep ? 0.45 : 0.65 );

	}

	const roles = { white, pale, rich };
	// The diamonds, white at the nozzle and fading down the flame towards its colour.
	const at = new Vector3();
	const axis = new Vector3();
	const diamond = new Color();
	const far = tint ?? pale;
	// Their hottest colour: white, or a style's own with a little white in it, so it still burns.
	const hottest = diamondTint === null ? white : new Color( diamondTint ).lerp( white, 0.3 );
	let f = null;
	let speed = 0;
	let clock = 0;
	const air = () => effects.air !== false;
	const streak = () => {

		const p = batch.spawn( 0.2 + Math.random() * 0.15 );
		const { width, height, length } = f.size;
		// On the cone of the shock it drags: peeling off just ahead of its nose (k 0) and back past
		// its tail (k 1), just clear of its body at the front (never drawn over its roof) and splaying
		// wider towards the rear, up its sides and over its top (never into the ground).
		const k = Math.random();
		const angle = Math.random() * Math.PI;
		const spread = 1 + 0.8 * k;
		const out = 0.15 * height + Math.random() * 0.3;
		_r.copy( f.right ).multiplyScalar( Math.cos( angle ) ).addScaledVector( f.up, Math.sin( angle ) );
		p.position.copy( f.middle ).addScaledVector( f.right, Math.cos( angle ) * ( width * 0.55 * spread + out ) )
			.addScaledVector( f.up, Math.sin( angle ) * ( height * 0.6 * spread + out ) - height * 0.1 )
			.addScaledVector( travel, ( 0.6 - 1.4 * k ) * length );
		// Slipping back past it, a little slower than it goes (not so slow they reach the camera),
		// leaning out as the cone does: hardly at the nose (any more, and those far ahead, seen end on
		// from the chase camera, stick out sideways like whiskers), more towards the tail.
		p.carry.copy( f.velocity ).multiplyScalar( 0.88 );
		p.mode = ALONG;
		p.frame = SHAPES.streak;
		p.axis.copy( travel ).addScaledVector( _r, - 0.08 - 0.22 * k ).normalize().multiplyScalar( Math.min( 2.2, 0.4 + speed * 0.025 ) * Math.sqrt( f.scale ) );
		// Those at the nose's shoulder, where the shock is strongest, brighter and fatter; thinner and
		// fainter towards the tail, where they're nearer the chase camera.
		const shoulder = k < 0.15;
		p.size = ( 0.035 + Math.random() * 0.02 ) * f.scale * ( shoulder ? 1.5 : 1 ) * ( 1 - 0.3 * k );
		// With no air, only faint streaks of its colour; otherwise white and a pale wash of it, or
		// shimmering through the hues.
		if ( ! air() ) p.colour.copy( pale );
		else if ( rainbow ) p.colour.copy( _hue.setHSL( ( clock / RAINBOW_TURN + Math.random() * 0.15 ) % 1, 1, 0.75 ) );
		else p.colour.copy( Math.random() >= 0.55 ? pale : white );
		p.alpha = ( shoulder ? 0.75 : 0.6 ) * ( 1 - 0.35 * k ) * ( effects.calm ? 0.65 : 1 ) * ( air() ? 1 : 0.75 );
		p.kind = 0;

	};
	const hooks = {
		look( p, t, view ) {

			// Streaks come and go; the boom's rings thin out as they spread, and its flashes go fast
			// and linger as they fade; the collar snaps out and thins away.
			if ( p.kind === 0 ) view.alpha = p.alpha * Math.sin( t * Math.PI );
			else if ( p.kind === 1 ) view.alpha = p.alpha * ( 1 - t ) ** 1.5;
			else if ( p.kind === 2 ) view.alpha = p.alpha * ( 1 - t ) ** 2;
			else if ( p.kind === 3 ) view.alpha = p.alpha * Math.sin( Math.min( 1, t * 4 ) * Math.PI / 2 ) * ( 1 - t ) ** 2;

		},
	};
	return {

		// Each frame, with the frame a style has (see above, and its `hot`: how far into overdrive
		// the flame is, 0 to 1) and whether it's supersonic now.
		update( frame, on ) {

			f = frame;
			clock += frame.dt;
			speed = frame.velocity.length();
			if ( speed > 1 ) travel.copy( frame.velocity ).divideScalar( speed );
			else travel.copy( frame.back ).negate();
			batch.begin();
			// Shock diamonds down the flame, put down each frame where it is now (as the afterburner's
			// are): fewer on a phone, and steady for a visitor asking for less motion.
			if ( diamonds && air() && frame.hot > 0.02 && frame.power > 0.5 ) {

				const n = ( effects.detail ?? 1 ) < 1 ? DIAMONDS_OVER - 1 : DIAMONDS_OVER;
				for ( let i = 0; i < n; i ++ ) {

					const k = i / ( DIAMONDS_OVER - 1 );
					at.copy( frame.nozzle ).addScaledVector( frame.back, ( 0.35 + i * 0.42 ) * frame.scale );
					axis.copy( frame.back ).multiplyScalar( 0.12 * frame.scale * ( 1 - 0.25 * k ) );
					diamond.lerpColors( hottest, far, k * 0.85 );
					const throb = effects.calm ? 1 : 0.85 + 0.15 * Math.sin( frame.clock * 70 + i * 1.7 );
					const alpha = frame.hot * frame.power * 0.8 * ( 1 - 0.45 * k ) * throb;
					batch.put( at, axis, ALONG, 0.26 * frame.scale * ( 1 - 0.25 * k ), 1, 0, SHAPES.diamond, diamond, alpha );
					const glow = 0.1 * frame.scale * ( 1 - 0.25 * k );
					batch.put( at, frame.up, FACING, glow, glow, 0, SHAPES.glow, diamond, alpha * 0.6 );

				}

			}

			// More round something bigger: about as thick on it as on a kart; fewer on a phone, and
			// fewer and fainter for a visitor asking for less motion.
			streaks( on ? 1 : 0, frame.dt, 80 * Math.sqrt( frame.scale ) * ( effects.detail ?? 1 ) * ( effects.calm ? 0.6 : 1 ), streak );
			batch.update( frame.dt, hooks );

		},

		// The boom, round the middle of its box, for a vehicle about `size` m across. `calm` (the
		// visitor asked for less motion): no flare, the rings fainter and the collar thinner.
		boom( frame, size, calm = false ) {

			const way = speed > 1 ? travel : frame.back;
			const airy = air();
			for ( let row = 0; row < BOOM.length; row ++ ) {

				const [ picture, life, inherit, start, spread, colour, alpha = 1, aspect = 1 ] = BOOM[ row ];
				if ( calm && picture === SHAPES.flare ) continue;
				// With no air there's no pressure wave to see: no white shock.
				if ( ! airy && row === 0 ) continue;
				const p = batch.spawn( life );
				p.position.copy( frame.middle );
				p.carry.copy( frame.velocity ).multiplyScalar( inherit );
				p.axis.copy( way );
				// The flashes face the camera; the rings lie across the way it's going.
				const facing = picture === SHAPES.glow || picture === SHAPES.flare;
				p.mode = facing ? FACING : FLAT;
				p.frame = picture;
				p.size = size * start;
				p.grow = size * spread;
				p.aspect = aspect;
				if ( rainbow && colour !== 'white' ) p.colour.copy( _hue.setHSL( ( clock / RAINBOW_TURN + row * 0.17 ) % 1, 1, 0.7 ) );
				else p.colour.copy( roles[ colour ] );
				p.alpha = alpha * ( calm && ! facing ? CALM_RINGS : 1 );
				p.kind = facing ? 2 : 1;

			}

			if ( ! airy ) return;
			// The collar: puffs of condensation round its body, out from it all the way round (those
			// below it fade out down to the ground, see Batch.floor), a little ahead of its middle.
			const n = Math.max( 4, Math.round( ( calm ? 8 : 14 ) * ( effects.detail ?? 1 ) ) );
			for ( let i = 0; i < n; i ++ ) {

				const a = ( i + Math.random() * 0.4 ) / n * Math.PI * 2;
				_r.copy( frame.right ).multiplyScalar( Math.cos( a ) ).addScaledVector( frame.up, Math.sin( a ) );
				const p = batch.spawn( 0.4 + Math.random() * 0.1 );
				p.position.copy( frame.middle ).addScaledVector( way, 0.15 * size ).addScaledVector( _r, 0.62 * size );
				// Kept up with it, as the rings are, so it never sweeps back through the camera.
				p.carry.copy( frame.velocity ).multiplyScalar( 0.97 );
				p.velocity.copy( _r ).multiplyScalar( 1.2 );
				p.drag = 2;
				p.mode = FACING;
				p.frame = SHAPES.puff;
				p.size = 0.22 * size;
				p.grow = 0.3 * size;
				p.turn = Math.random() * Math.PI * 2;
				p.colour.setHex( 0xf2f8ff );
				p.alpha = calm ? 0.22 : 0.35;
				p.kind = 3;

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

// The boom: a shock ring, a thinner ring inside it and a flash, kept small enough not to white out
// a phone's narrow view (World Drive flashes the edges of the view instead, screen-fx.js); a wide
// ring lingering as it spreads to seven times the vehicle's size, a second, richer one inside that,
// and a flare side to side. The leading shock and the flashes are white-hot, so it still reads as a
// pressure wave; the rings behind it take the ride's colour ('pale' or 'rich', see
// createSupersonic). Each [ picture, life (s), share of the vehicle's speed it keeps, size and
// growth (times the vehicle's size), colour, alpha, height for its width ]. The rings keep up with
// the vehicle (0.97 of its speed, drifting back a metre or few over their life): any slower and at
// overdrive's speed they fall back through the chase camera while still growing, and with the
// camera inside a ring's bright band the whole view goes white, twice. And none of them grows much
// past three times the vehicle's size: any wider, from the chase camera a few metres behind it, the
// rings stack into a pale tunnel over the whole of the view, sky and road washed out.
const BOOM = [
	[ SHAPES.shock, 0.42, 0.98, 0.6, 2, 'white', 0.6 ],
	[ SHAPES.ring, 0.34, 0.98, 0.4, 1.5, 'pale', 0.8 ],
	[ SHAPES.glow, 0.15, 1, 0.8, 0.5, 'white', 0.45 ],
	[ SHAPES.shock, 0.7, 0.98, 0.9, 2.4, 'rich', 0.32 ],
	[ SHAPES.ring, 0.6, 0.98, 0.7, 1.9, 'rich', 0.45 ],
	[ SHAPES.flare, 0.2, 1, 1.1, 0.8, 'white', 0.4, 0.25 ],
];
// How bright the boom's rings are for a visitor asking for less motion.
const CALM_RINGS = 0.6;
// Shock diamonds down the flame in overdrive (a phone's one fewer), each a lozenge and a glow.
const DIAMONDS_OVER = 4;
// A rainbow flame's turn through the hues (s), as drive-fx.js has it (which imports this file, so
// it can't be imported from there).
const RAINBOW_TURN = 1.6;
