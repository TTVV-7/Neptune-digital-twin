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

const FRAGMENT = /* glsl */`
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec4 uFloor;
uniform vec4 uNear;
uniform float uSoft;
varying vec2 vUv;
varying vec4 vColour;
varying vec3 vWorld;
varying float vFloored;

void main() {

	vec4 picture = texture2D( map, vUv );
	// Near the vehicle, fading out down to the floor, so the ground never cuts it off along a hard
	// line; further off, as it is (the floor under the vehicle isn't the ground there).
	float near = 1.0 - smoothstep( 0.6, 1.0, distance( vWorld, uNear.xyz ) / uNear.w );
	float floored = mix( 1.0, smoothstep( 0.0, uSoft, dot( uFloor.xyz, vWorld ) + uFloor.w ), near * vFloored );
	gl_FragColor = vec4( vColour.rgb * picture.rgb, vColour.a * picture.a * floored );
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
// and its right), middle (the middle of its box, world), ground (on its wheels, a point a little
// over the ground under it, world), scale (1 for a kart, more for something bigger) }.
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
// its particles, the oldest first.

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
function onRoad( batch, f, size, life ) {

	const { size: box } = f;
	const p = batch.spawn( life );
	f.pivot.localToWorld( p.position.set( ( Math.random() - 0.5 ) * box.width * 0.7 / box.scale, INK_LIFT / box.scale, ( box.rear + 0.3 + Math.random() * 1.2 ) / box.scale ) );
	p.axis.copy( f.up );
	p.mode = FLAT;
	p.frame = SHAPES.splat + Math.floor( Math.random() * 3 );
	const speed = Math.hypot( f.velocity.x, f.velocity.z );
	const stretch = Math.min( 3, 1 + speed / 15 );
	p.size = size * f.scale * stretch;
	p.aspect = 1 / stretch;
	p.turn = speed > 1 ? Math.atan2( - f.velocity.x, - f.velocity.z ) + ( Math.random() - 0.5 ) * 0.4 : Math.random() * Math.PI * 2;
	return p;

}

// Particles that glow and fade in and out over their life (mist, nebulae, wisps), rather than
// starting at their brightest.
function swell( t ) {

	return Math.sin( t * Math.PI );

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
		tint: 0x7cc8ff,
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
			};

		},
	},

	// Forked lightning crackling back from the exhaust: bolts with branches, gone in a flicker and
	// struck again.
	lightning: {
		flame: { outer: 0x7a4dff, inner: 0xffffff, halo: 0xb48cff, length: 0.55, flicker: 2 },
		tint: 0xc8b0ff,
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
			};

		},
	},

	// Glitter: a stream of tiny twinkling stars in white, gold, pink, sky and lilac.
	glitter: {
		flame: { halo: 0xfff3c4, length: 0.6, flicker: 1 },
		tint: 0xfff3c4,
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
			};

		},
	},

	// Soap bubbles floating up and wobbling away, each popping at the end.
	bubbles: {
		flame: null,
		tint: 0xbff3ff,
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
				// Lit: a froth of big bubbles blown out round the exhaust, popping sooner.
				ignite( frame, detail ) {

					for ( let i = Math.round( 16 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 0.6 + Math.random() * 0.5 );
						p.position.copy( frame.nozzle ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 0.8 * frame.scale ).addScaledVector( frame.up, ( Math.random() - 0.3 ) * 0.5 * frame.scale );
						flung( frame, p, 0.9, 2.2, 0.5, 1.2 );
						p.frame = SHAPES.bubble;
						p.size = ( 0.12 + Math.random() * 0.16 ) * frame.scale;
						p.grow = p.size * 0.3;
						p.colour.set( pick( tints ) );
						p.alpha = 0.95;
						p.fall = - 0.05;
						p.drag = 1.6;

					}

				},
			};

		},
	},

	// Confetti: little paper rectangles in party colours, tumbling down as they flutter behind.
	confetti: {
		flame: null,
		tint: 0xffd84d,
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
				// Lit: a party popper, a cone of confetti shot up and out behind.
				ignite( frame, detail ) {

					for ( let i = Math.round( 70 * detail ); i > 0; i -- ) {

						const p = batch.spawn( 1 + Math.random() * 0.6 );
						p.position.copy( frame.nozzle );
						flung( frame, p, 0.95, 2.5, Math.random(), 3.5 + Math.random() * 3 );
						p.frame = SHAPES.square;
						p.size = ( 0.07 + Math.random() * 0.04 ) * frame.scale;
						p.aspect = 0.55;
						p.colour.set( pick( colours ) );
						p.fall = 0.35;
						p.drag = 1.8;
						p.spin = ( Math.random() - 0.5 ) * 20;
						p.turn = Math.random() * Math.PI;

					}

				},
			};

		},
	},

	// Hearts rising and swaying away, beating as they go.
	hearts: {
		flame: { halo: 0xff6fb5, length: 0.5, flicker: 0.6 },
		tint: 0xff6fb5,
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
			};

		},
	},

	// Pixels: chunky squares in a bright palette, on a grid in the world, shrinking in steps and
	// blinking out, as an old game would draw them.
	pixel: {
		flame: null,
		tint: 0xffe14d,
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
						p.colour.set( [ 0xffffff, 0xffe14d, 0xff9a1f ][ ring ] );
						p.drag = 1.2;

					}

				},
			};

		},
	},

	// Fireworks: little rockets shot out behind that burst into balls of sparks in one colour,
	// which fall and twinkle out.
	fireworks: {
		flame: { halo: 0xffe0a0, length: 0.5, flicker: 1 },
		tint: 0xffe0a0,
		make( root ) {

			const batch = new Batch( root, { particles: 280, blending: AdditiveBlending } );
			const rockets = emitter();
			const colours = [ 0xff4d6d, 0xffd23f, 0x4dff9a, 0x4dc3ff, 0xc77dff, 0xffffff ];
			let f = null;
			let scale = 1;
			// Where an ignition's starburst bursts from, as a rocket would.
			const shell = { position: new Vector3(), carry: new Vector3(), velocity: new Vector3() };
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
			// A ball of sparks in one colour where `from` is, round a flash (unless not `bright`).
			const burst = ( from, bright = true ) => {

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

				if ( ! bright ) return;
				const flash = batch.spawn( 0.14 );
				flash.position.copy( from.position );
				flash.carry.copy( from.carry );
				flash.frame = SHAPES.burst;
				flash.size = 0.25 * scale;
				flash.grow = 0.2 * scale;
				flash.colour.set( colour );

			};
			// A rocket (kind 1, or 3 for one of a calm ignition's salvo, which bursts without its flash)
			// bursts as it dies; its sparks (2) twinkle out.
			const hooks = {
				died: p => ( p.kind === 1 || p.kind === 3 ) && burst( p, p.kind === 1 ),
				look( p, t, view ) {

					if ( p.kind === 1 || p.kind === 3 ) view.alpha = 1;
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
				// Lit: a starburst right at the exhaust, and a salvo of three rockets that burst just over
				// it (all without their flashes for a visitor asking for less motion).
				ignite( frame, detail, calm ) {

					f = frame;
					scale = frame.scale;
					shell.position.copy( frame.nozzle );
					shell.carry.copy( frame.velocity ).multiplyScalar( 0.9 );
					shell.velocity.copy( frame.back ).multiplyScalar( 1.5 );
					burst( shell, ! calm );
					for ( let i = 0; i < 3; i ++ ) {

						const p = batch.spawn( 0.18 + i * 0.05 );
						p.position.copy( frame.nozzle );
						thrown( frame, p, 0.95, 1.2, 4.5 + Math.random(), 1 );
						p.velocity.addScaledVector( frame.right, ( i - 1 ) * 2.5 );
						p.frame = SHAPES.glow;
						p.size = 0.12 * frame.scale;
						p.colour.set( 0xfff0c0 );
						p.fall = 0.6;
						p.kind = calm ? 3 : 1;

					}

				},
			};

		},
	},

	// Ink: blobs of bright paint flung out behind, leaving splats on the road that stay a few
	// seconds, in one colour after another.
	ink: {
		flame: null,
		tint: 0xff4da6,
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
			const splat = () => {

				const p = onRoad( batch, f, 0.35 + Math.random() * 0.35, 5 );
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

					}

					if ( frame.grounded ) for ( let i = 0; i < 3; i ++ ) splat();

				},
			};

		},
	},

	// Neon rings: glowing hoops thrown out behind, flat across the way it's going, so the camera
	// looks through them, widening as they fade.
	rings: {
		flame: { halo: 0x6ff6ff, length: 0.5, flicker: 0.8 },
		tint: 0x6ff6ff,
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
			};

		},
	},

	// A comet: a bright white-blue head at the exhaust and a long glowing tail that narrows and
	// fades behind it, with a dust of sparks.
	comet: {
		flame: { outer: 0x7fd8ff, inner: 0xffffff, halo: 0xd6f4ff, length: 0.45, flicker: 0.6 },
		tint: 0xd6f4ff,
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
				// Lit: its head flares up (not for a visitor asking for less motion), and a shower of
				// specks bursts off it.
				ignite( frame, detail, calm ) {

					if ( ! calm ) {

						const flare = batch.spawn( 0.3 );
						flare.position.copy( frame.nozzle );
						flare.carry.copy( frame.velocity );
						flare.frame = SHAPES.glow;
						flare.size = 0.7 * frame.scale;
						flare.grow = 0.4 * frame.scale;
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
			};

		},
	},

	// Music notes: eighth notes and beamed pairs in bright colours, rising and swaying away and all
	// bobbing together to one beat.
	notes: {
		flame: { halo: 0xfff0b0, length: 0.5, flicker: 0.6 },
		tint: 0xfff0b0,
		make( root ) {

			const batch = new Batch( root, { particles: 70 } );
			const notes = emitter();
			const colours = [ 0xff4d8d, 0x3dbdff, 0xffc21a, 0x4ddc6b, 0xa86bff, 0xff8a3d ];
			let f = null;
			let n = 0;
			let beat = 0;
			const note = k => {

				const p = batch.spawn( 1.2 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.2 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.88, 1.6 + Math.random(), 1.1, 0.5 );
				p.frame = Math.random() < 0.6 ? SHAPES.note : SHAPES.notes;
				p.size = ( 0.12 + Math.random() * 0.06 ) * f.scale;
				p.colour.set( colours[ n ++ % colours.length ] );
				p.fall = - 0.06;
				p.drag = 1.1;
				return p;

			};
			const hooks = {
				step: ( p, dt ) => p.velocity.addScaledVector( f.right, Math.sin( p.age * 3.5 + p.phase ) * 1.4 * dt ),
				look( p, t, view ) {

					view.sx *= 1 + beat * 0.25;
					view.sy = view.sx;
					view.turn = 0.3 * Math.sin( p.age * 3 + p.phase );
					view.alpha = t < 0.7 ? 1 : ( 1 - t ) / 0.3;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					// Two beats a second, a quick swell on each.
					beat = Math.max( 0, Math.sin( frame.clock * Math.PI * 4 ) ) ** 6;
					batch.begin();
					notes( frame.power, frame.dt, 24, note );
					batch.update( frame.dt, hooks );

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
			};

		},
	},

	// Cherry blossom: pink petals fluttering out behind, tumbling over and over as they drift down,
	// and now and then a whole flower.
	petals: {
		flame: null,
		tint: 0xffc4dc,
		make( root ) {

			const batch = new Batch( root, { particles: 170 } );
			const petals = emitter();
			const colours = [ 0xffc2da, 0xffadcc, 0xffe2ee, 0xfff4f8, 0xff97bf ];
			const out = new Vector3();
			const turn = new Vector3();
			let f = null;
			const petal = k => {

				const p = batch.spawn( 1.3 + Math.random() * 0.6 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.7, ( Math.random() - 0.2 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.86, 1.5 + Math.random() * 1.5, 1.2, 1.4 );
				const flower = Math.random() < 0.12;
				p.frame = flower ? SHAPES.blossom : SHAPES.petal;
				p.size = ( flower ? 0.09 + Math.random() * 0.04 : 0.05 + Math.random() * 0.035 ) * f.scale;
				p.colour.set( pick( colours ) );
				p.fall = 0.1;
				p.drag = 1.4;
				p.spin = ( Math.random() - 0.5 ) * ( flower ? 2 : 5 );
				p.turn = Math.random() * Math.PI * 2;
				p.kind = flower ? 1 : 0;
				return p;

			};
			const hooks = {
				step: ( p, dt ) => p.velocity.addScaledVector( f.right, Math.sin( p.age * 5 + p.phase ) * 2 * dt ),
				look( p, t, view ) {

					// A petal tumbles over and over as it falls; a flower only turns.
					if ( p.kind === 0 ) view.sy *= 0.3 + 0.7 * Math.abs( Math.cos( p.age * 6 + p.phase ) );
					view.alpha = t < 0.75 ? 1 : ( 1 - t ) * 4;

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					petals( frame.power, frame.dt, 75, petal );
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
			};

		},
	},

	// An afterburner: a jet's long blue-white cone with a row of shock diamonds burning in it, a rosy
	// glow at its tail and a haze of blue sparks streaming off it.
	afterburner: {
		flame: { outer: 0x2a46e0, inner: 0x4a6cf0, halo: 0x8fb0ff, length: 1.6, flicker: 0.35 },
		tint: 0xa8c4ff,
		make( root ) {

			// The diamonds, put down each frame along the cone where it is now: DIAMONDS of them, each a
			// lozenge along it and a glow.
			const DIAMONDS = 5;
			const batch = new Batch( root, { particles: 110, quads: DIAMONDS * 2, blending: AdditiveBlending } );
			const sparks = emitter();
			const tails = emitter();
			const white = new Color( 0xf6f9ff );
			const blue = new Color( 0x5f7dff );
			const colour = new Color();
			const at = new Vector3();
			const axis = new Vector3();
			let f = null;
			// A spark, its head first the way it flies.
			const spark = k => {

				const p = batch.spawn( 0.22 + Math.random() * 0.18 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.35 * f.scale, ( Math.random() - 0.5 ) * 0.35 * f.scale, p.position );
				thrown( f, p, 0.9, 5 + Math.random() * 4, 0, 1.4 );
				p.mode = ALONG;
				p.frame = SHAPES.spark;
				p.axis.copy( f.back ).multiplyScalar( ( 0.08 + Math.random() * 0.08 ) * f.scale );
				p.size = 0.025 * f.scale;
				p.colour.set( Math.random() < 0.5 ? 0xa8c8ff : 0xffffff );
				p.drag = 1.5;

			};
			// The cone's far end, glowing rose and violet as it cools.
			const tail = k => {

				const p = batch.spawn( 0.2 + Math.random() * 0.1 );
				nozzleAt( f, k, 0, 0, p.position ).addScaledVector( f.back, 1.7 * f.scale * f.power );
				thrown( f, p, 0.95, 2, 0.2, 0.4 );
				p.frame = SHAPES.glow;
				p.size = 0.2 * f.scale;
				p.grow = 0.25 * f.scale;
				p.colour.set( Math.random() < 0.5 ? 0xff7a8a : 0xb07cff );
				p.alpha = 0.45;

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					if ( frame.power > 0 ) for ( let i = 0; i < DIAMONDS; i ++ ) {

						// Spaced down the cone, each a little smaller, bluer and fainter than the one before,
						// and all throbbing a little.
						const k = i / ( DIAMONDS - 1 );
						at.copy( frame.nozzle ).addScaledVector( frame.back, ( 0.3 + i * 0.36 ) * frame.scale * ( 0.55 + 0.45 * frame.power ) );
						axis.copy( frame.back ).multiplyScalar( 0.13 * frame.scale * ( 1 - 0.3 * k ) );
						colour.lerpColors( white, blue, k * 0.8 );
						const alpha = frame.power * ( 1 - 0.45 * k ) * ( 0.8 + 0.2 * Math.sin( frame.clock * 70 + i * 1.7 ) );
						batch.put( at, axis, ALONG, 0.3 * frame.scale * ( 1 - 0.3 * k ), 1, 0, SHAPES.diamond, colour, alpha );
						const glow = 0.11 * frame.scale * ( 1 - 0.3 * k );
						batch.put( at, frame.up, FACING, glow, glow, 0, SHAPES.glow, colour, alpha * 0.7 );

					}

					sparks( frame.power, frame.dt, 70, spark );
					tails( frame.power, frame.dt, 30, tail );
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
			};

		},
	},

	// Frost: snowflakes and glints of ice streaming out of a cold mist, as if the booster breathed out
	// winter.
	frost: {
		flame: { halo: 0xc4f0ff, length: 0.5, flicker: 0.5 },
		tint: 0xc4f0ff,
		make( root ) {

			const batch = new Batch( root, { particles: 210 } );
			const flakes = emitter();
			const mists = emitter();
			const glints = emitter();
			const colours = [ 0xffffff, 0xe6f8ff, 0xcdeeff ];
			const way = new Vector3();
			let f = null;
			const flake = k => {

				const p = batch.spawn( 1 + Math.random() * 0.6 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.6, ( Math.random() - 0.3 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.88, 1.5 + Math.random() * 2, 0.5, 1 );
				p.frame = SHAPES.snowflake;
				p.size = ( 0.07 + Math.random() * 0.07 ) * f.scale;
				p.colour.set( pick( colours ) );
				p.fall = 0.06;
				p.drag = 1.1;
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
				p.grow = 0.5 * f.scale;
				p.colour.set( 0xdcf4ff );
				p.alpha = 0.45;
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
				p.colour.set( 0xffffff );
				p.drag = 1;
				p.kind = 2;

			};
			const hooks = {
				look( p, t, view ) {

					if ( p.kind === 1 ) view.alpha = p.alpha * swell( t );
					else if ( p.kind === 2 ) TWINKLE.look( p, t, view );
					// Flakes and shards stay white until they're nearly gone.
					else view.alpha = p.alpha * ( t < 0.75 ? 1 : ( 1 - t ) * 4 );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					mists( frame.power, frame.dt, 28, mist );
					flakes( frame.power, frame.dt, 45, flake );
					glints( frame.power, frame.dt, 50, glint );
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

					for ( let i = Math.round( 8 * detail ); i > 0; i -- ) flung( frame, mist( 1 ), 0.9, 1.6, 1 );
					for ( let i = Math.round( 26 * detail ); i > 0; i -- ) {

						const p = flake( 1 );
						flung( frame, p, 0.88, 3, 1, 1 );
						p.drag = 1.8;

					}

				},
			};

		},
	},

	// Galaxy: a violet flame streaming twinkling stars through drifting clouds of nebula. The flame is
	// deep, and violet to its core: a paler core added to it, or the cone added to a bright sky or
	// road, read as a white flame with a violet edge.
	galaxy: {
		flame: { outer: 0x6a2dff, inner: 0x8a4cff, halo: 0xa070ff, length: 0.85, flicker: 0.7, deep: true },
		tint: 0xc08cff,
		make( root ) {

			const batch = new Batch( root, { particles: 240, blending: AdditiveBlending } );
			const stars = emitter();
			const clouds = emitter();
			const starColours = [ 0xffffff, 0xfff0c4, 0xc8dcff, 0xffd0f4 ];
			const cloudColours = [ 0x5a2dff, 0xc42dff, 0x2d5aff, 0xff3dbd ];
			const out = new Vector3();
			const turn = new Vector3();
			let f = null;
			const star = k => {

				const p = batch.spawn( 0.6 + Math.random() * 0.5 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, ( Math.random() - 0.4 ) * 0.4 * f.scale, p.position );
				thrown( f, p, 0.92, 2 + Math.random() * 2, 0.3, 1.4 );
				p.frame = SHAPES.star;
				p.size = ( 0.045 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( pick( starColours ) );
				p.drag = 1;
				p.spin = ( Math.random() - 0.5 ) * 3;

			};
			const cloud = k => {

				const p = batch.spawn( 0.9 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, ( Math.random() - 0.5 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.92, 1.5 + Math.random(), 0.2, 0.6 );
				p.frame = SHAPES.puff;
				p.size = 0.2 * f.scale;
				p.grow = 0.7 * f.scale;
				p.colour.set( pick( cloudColours ) );
				p.alpha = 0.3;
				p.drag = 1.2;
				p.spin = ( Math.random() - 0.5 ) * 0.8;
				p.turn = Math.random() * Math.PI * 2;
				p.kind = 1;
				return p;

			};
			const hooks = {
				look( p, t, view ) {

					// Nebulae drift in and thin away; stars twinkle; the core's flash only fades.
					if ( p.kind === 1 ) view.alpha = p.alpha * swell( t );
					else if ( p.kind === 0 ) TWINKLE.look( p, t, view );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					stars( frame.power, frame.dt, 150, star );
					clouds( frame.power, frame.dt, 24, cloud );
					batch.update( frame.dt, hooks );

				},
				// Lit: a little spiral galaxy flung out round the exhaust, its two arms of stars swirling as
				// they spread, round a bright core (not for a visitor asking for less motion), in a puff of
				// nebula.
				ignite( frame, detail, calm ) {

					f = frame;
					const n = Math.max( 6, Math.round( 14 * detail ) );
					for ( let arm = 0; arm < 2; arm ++ ) for ( let i = 0; i < n; i ++ ) {

						const angle = arm * Math.PI + i * 0.45;
						around( frame, angle, out );
						around( frame, angle + Math.PI / 2, turn );
						const p = batch.spawn( 0.55 + i * 0.025 );
						p.position.copy( frame.nozzle ).addScaledVector( out, ( 0.06 + i * 0.04 ) * frame.scale ).addScaledVector( frame.back, 0.1 * frame.scale );
						p.carry.copy( frame.velocity ).multiplyScalar( 0.9 );
						p.velocity.copy( turn ).multiplyScalar( 2.4 ).addScaledVector( out, 1.2 + i * 0.12 ).addScaledVector( frame.back, 1 );
						p.frame = SHAPES.star;
						p.size = ( 0.05 + 0.05 * ( 1 - i / n ) ) * frame.scale;
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
			};

		},
	},

	// Dragon fire: a deep red flame roaring out tongues of fire that cool from orange to a deep red,
	// throwing glowing embers that float up and curls of dark smoke. The tongues and the smoke are
	// drawn as they are, not added (glowing), so the fire stays red against a bright sky rather than
	// washing out to yellow; the embers glow.
	dragon: {
		flame: { outer: 0xc8160a, inner: 0xff6a14, halo: 0xff4a1a, length: 1.35, flicker: 1.8 },
		tint: 0xff5a2a,
		make( root ) {

			const fire = new Batch( root, { particles: 150 } );
			const sparks = new Batch( root, { particles: 100, blending: AdditiveBlending } );
			const tongues = emitter();
			const embers = emitter();
			const puffs = emitter();
			const hot = new Color( 0xffbe3a );
			const warm = new Color( 0xff4210 );
			const dark = new Color( 0x7a1006 );
			let f = null;
			// A tongue of fire, drawn along the way it's swept, back and a little up: its round foot
			// first, its tip trailing. Under it, glowing, its heat.
			const tongue = k => {

				const p = fire.spawn( 0.22 + Math.random() * 0.12 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.25 * f.scale, ( Math.random() - 0.5 ) * 0.2 * f.scale, p.position );
				thrown( f, p, 0.9, 4.5 + Math.random() * 2, 0.8, 1 );
				p.mode = ALONG;
				p.frame = SHAPES.wisp;
				p.axis.copy( f.back ).addScaledVector( f.up, 0.2 + Math.random() * 0.3 ).addScaledVector( f.right, ( Math.random() - 0.5 ) * 0.6 ).normalize();
				p.size = 0.1 * f.scale;
				p.grow = 0.06 * f.scale;
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
			const ember = k => {

				const p = sparks.spawn( 0.6 + Math.random() * 0.5 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.5 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.86, 2 + Math.random() * 2, 1.6, 1.8 );
				p.frame = SHAPES.glow;
				p.size = ( 0.035 + Math.random() * 0.035 ) * f.scale;
				p.colour.set( pick( [ 0xffa040, 0xffd070, 0xff6020 ] ) );
				p.fall = - 0.12;
				p.drag = 1.2;
				return p;

			};
			const puff = k => {

				const p = fire.spawn( 1.1 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.3 * f.scale, 0.15 * f.scale, p.position );
				thrown( f, p, 0.9, 1.5 + Math.random(), 0.9, 0.5 );
				p.frame = SHAPES.puff;
				p.size = 0.15 * f.scale;
				p.grow = 0.5 * f.scale;
				p.colour.set( pick( [ 0x3c3330, 0x544640, 0x2e2826 ] ) );
				p.alpha = 0.38;
				p.fall = - 0.06;
				p.drag = 1;
				p.spin = ( Math.random() < 0.5 ? - 1 : 1 ) * ( 0.8 + Math.random() );
				p.turn = Math.random() * Math.PI * 2;
				return p;

			};
			const burning = {
				// Smoke curls as it rises.
				step( p, dt ) {

					if ( p.kind === 0 ) p.velocity.addScaledVector( f.right, Math.sin( p.age * 4 + p.phase ) * 1.4 * dt );

				},
				look( p, t, view ) {

					// A tongue of fire draws out longer as it goes, cooling from orange through red to a
					// deep red; smoke only shows once the fire's done with it.
					if ( p.kind === 1 ) {

						p.axis.setLength( ( 0.16 + 0.3 * t ) * f.scale );
						if ( t < 0.5 ) p.colour.lerpColors( hot, warm, t / 0.5 );
						else p.colour.lerpColors( warm, dark, ( t - 0.5 ) / 0.5 );
						view.alpha = p.alpha * ( 1 - t );

					} else view.alpha = p.alpha * Math.min( 1, t * 5 ) * ( 1 - t );

				},
			};
			// An ember flickers; the heat under a tongue only fades.
			const flickering = {
				look( p, t, view ) {

					if ( p.kind === 0 ) view.alpha *= 0.6 + 0.4 * Math.sin( p.age * 30 + p.phase );

				},
			};
			return {
				batches: [ fire, sparks ],
				update( frame ) {

					f = frame;
					fire.begin();
					sparks.begin();
					puffs( frame.power, frame.dt, 16, puff );
					tongues( frame.power, frame.dt, 55, tongue );
					embers( frame.power, frame.dt, 45, ember );
					fire.update( frame.dt, burning );
					sparks.update( frame.dt, flickering );

				},
				// Lit: a roar, a fireball of tongues thrown back and out, a shower of embers and a ring of
				// smoke.
				ignite( frame, detail ) {

					f = frame;
					for ( let i = 0; i < 6; i ++ ) {

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
			};

		},
	},

	// Butterflies: bright wings fluttering up and away behind it, each wandering its own way.
	butterflies: {
		flame: { halo: 0xffe7a0, length: 0.45, flicker: 0.5 },
		tint: 0xffd27a,
		make( root ) {

			const batch = new Batch( root, { particles: 60 } );
			const flutter = emitter();
			const colours = [ 0xff9a2e, 0x3dbdff, 0xffd21a, 0xff5ca8, 0x9b6bff, 0x4ddc6b ];
			let f = null;
			let n = 0;
			const butterfly = k => {

				const p = batch.spawn( 1.5 + Math.random() * 0.6 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.6, ( Math.random() - 0.2 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.86, 1.2 + Math.random() * 0.8, 1.3, 0.8 );
				p.frame = SHAPES.butterfly;
				p.size = ( 0.11 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( colours[ n ++ % colours.length ] );
				p.fall = - 0.05;
				p.drag = 1.3;
				return p;

			};
			const hooks = {
				// Wandering, up and down and side to side, each its own way.
				step: ( p, dt ) => p.velocity.addScaledVector( f.right, Math.sin( p.age * 2.3 + p.phase ) * 2.2 * dt ).addScaledVector( f.up, Math.cos( p.age * 3.1 + p.phase ) * 1.5 * dt ),
				look( p, t, view ) {

					// Its wings beating: squashed across and open again, a few times a second.
					view.sx *= 0.2 + 0.8 * Math.abs( Math.cos( p.age * 16 + p.phase ) );
					view.turn = 0.35 * Math.sin( p.age * 2 + p.phase );
					view.alpha = Math.min( 1, t * 10, ( 1 - t ) * 4 );

				},
			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					flutter( frame.power, frame.dt, 15, butterfly );
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
			};

		},
	},

	// Spooky: glowing wisps curling up out of a ghostly green flame, and now and then a little ghost
	// floating off behind, bobbing as it goes.
	spooky: {
		flame: { outer: 0x3dffa8, inner: 0xe8fff4, halo: 0x7dffc8, length: 0.6, flicker: 1.5 },
		tint: 0x9dffd0,
		make( root ) {

			const glow = new Batch( root, { particles: 110, blending: AdditiveBlending } );
			const ghosts = new Batch( root, { particles: 30 } );
			const wisps = emitter();
			const floats = emitter();
			const shades = [ 0xffffff, 0xe6fff4, 0xf0e8ff ];
			let f = null;
			const wisp = k => {

				const p = glow.spawn( 0.6 + Math.random() * 0.3 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * 0.4 * f.scale, ( Math.random() - 0.3 ) * 0.3 * f.scale, p.position );
				thrown( f, p, 0.9, 2 + Math.random(), 1.2, 0.8 );
				p.frame = SHAPES.wisp;
				p.size = ( 0.09 + Math.random() * 0.05 ) * f.scale;
				p.aspect = 1.3;
				p.colour.set( pick( [ 0x5dffb4, 0xa98bff, 0x5dd8ff ] ) );
				p.alpha = 0.85;
				p.fall = - 0.2;
				p.drag = 1.2;
				return p;

			};
			const ghost = k => {

				const p = ghosts.spawn( 1.4 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.5, 0.1 * f.scale, p.position );
				thrown( f, p, 0.88, 1.3, 1.2, 0.4 );
				p.frame = SHAPES.ghost;
				p.size = ( 0.15 + Math.random() * 0.05 ) * f.scale;
				p.colour.set( pick( shades ) );
				p.alpha = 0.92;
				p.fall = - 0.08;
				p.drag = 1.4;
				return p;

			};
			const curling = {
				look( p, t, view ) {

					view.alpha = p.alpha * swell( t );
					view.turn = 0.4 * Math.sin( p.age * 6 + p.phase );

				},
			};
			const floating = {
				step: ( p, dt ) => p.velocity.addScaledVector( f.right, Math.sin( p.age * 2 + p.phase ) * 1.2 * dt ),
				look( p, t, view ) {

					// Bobbing and rocking a little, fading in and away.
					view.position.addScaledVector( f.up, Math.sin( p.age * 5 + p.phase ) * 0.06 * f.scale );
					view.turn = 0.25 * Math.sin( p.age * 3 + p.phase );
					view.alpha = p.alpha * Math.min( 1, t / 0.15, ( 1 - t ) / 0.3 );

				},
			};
			return {
				batches: [ glow, ghosts ],
				update( frame ) {

					f = frame;
					glow.begin();
					ghosts.begin();
					wisps( frame.power, frame.dt, 45, wisp );
					floats( frame.power, frame.dt, 5, ghost );
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

					for ( let i = Math.round( 20 * detail ); i > 0; i -- ) flung( frame, wisp( 1 ), 0.88, 2.5, 1, 1 );

				},
			};

		},
	},

	// Neon laser: a laser show out of the exhaust, beams in cyan, pink, lime and blue sweeping side to
	// side and up and down, with bolts of light shot out along them.
	laser: {
		flame: { halo: 0xff6bf0, length: 0.5, flicker: 0.4 },
		tint: 0xff7cf4,
		make( root ) {

			const BEAMS = 4;
			const batch = new Batch( root, { particles: 120, quads: BEAMS * 2 + 1, blending: AdditiveBlending } );
			const bolts = emitter();
			const colours = [ 0x2df4ff, 0xff2df0, 0x8cff2d, 0x3d7dff ];
			const colour = new Color();
			const white = new Color( 0xffffff );
			const way = new Vector3();
			const half = new Vector3();
			const middle = new Vector3();
			let f = null;
			// Where beam `b` points now: back, up and out, sweeping like a stage's lasers into the sky.
			const aim = ( b, target ) => {

				const sweep = Math.sin( f.clock * 2.6 + b * 1.7 ) * 0.6 + ( b - ( BEAMS - 1 ) / 2 ) * 0.4;
				return target.copy( f.back ).multiplyScalar( 0.75 ).addScaledVector( f.right, Math.sin( sweep ) * 0.9 ).addScaledVector( f.up, 0.6 + 0.3 * Math.sin( f.clock * 1.9 + b * 2.3 ) ).normalize();

			};
			// A bolt of light shot out along one of the beams, its head first.
			const bolt = k => {

				const b = Math.floor( Math.random() * BEAMS );
				aim( b, way );
				const p = batch.spawn( 0.2 );
				nozzleAt( f, k, 0, 0, p.position );
				p.carry.copy( f.velocity ).multiplyScalar( 0.97 );
				p.velocity.copy( way ).multiplyScalar( 13 );
				p.mode = ALONG;
				p.frame = SHAPES.spark;
				p.axis.copy( way ).multiplyScalar( 0.2 * f.scale );
				p.size = 0.06 * f.scale;
				p.colour.set( colours[ b ] );

			};
			return {
				batches: [ batch ],
				update( frame ) {

					f = frame;
					batch.begin();
					if ( frame.power > 0 ) {

						const length = 2.4 * frame.scale * ( 0.5 + 0.5 * frame.power );
						for ( let b = 0; b < BEAMS; b ++ ) {

							// Each a throbbing glow in its colour round a white-hot core.
							aim( b, way );
							half.copy( way ).multiplyScalar( length / 2 );
							middle.copy( frame.nozzle ).add( half );
							colour.set( colours[ b ] );
							const throb = 0.75 + 0.25 * Math.sin( frame.clock * 40 + b * 2 );
							batch.put( middle, half, ALONG, 0.1 * frame.scale, 1, 0, SHAPES.beam, colour, 0.7 * throb * frame.power );
							batch.put( middle, half, ALONG, 0.03 * frame.scale, 1, 0, SHAPES.beam, white, 0.85 * frame.power );

						}

						// Where they come from: a glow in each of their colours in turn.
						colour.set( colours[ Math.floor( frame.clock * 4 ) % BEAMS ] );
						const glow = 0.28 * frame.scale;
						batch.put( frame.nozzle, frame.up, FACING, glow, glow, 0, SHAPES.glow, colour, 0.8 * frame.power );

					}

					bolts( frame.power, frame.dt, 36, bolt );
					batch.update( frame.dt );

				},
				// Lit: a starburst of beams all round at once, and a hoop of light blown out behind. For a
				// visitor asking for less motion, half as many beams, dim, and a fainter hoop.
				ignite( frame, detail, calm ) {

					f = frame;
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
			};

		},
	},

	// Slime: blobs of green goo flung out behind, wobbling as they fly, bubbles that swell and pop,
	// and puddles of it on the road for a couple of seconds.
	slime: {
		flame: null,
		tint: 0x9dff4d,
		make( root ) {

			const batch = new Batch( root, { particles: 190 } );
			const blobs = emitter();
			const bubbles = emitter();
			const puddles = emitter();
			const greens = [ 0x7dff2e, 0x52e01a, 0xb8ff4d, 0x3dd65a ];
			let f = null;
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
			const bubble = k => {

				const p = batch.spawn( 0.5 + Math.random() * 0.4 );
				nozzleAt( f, k, ( Math.random() - 0.5 ) * f.size.width * 0.4, Math.random() * 0.2 * f.scale, p.position );
				thrown( f, p, 0.88, 1.5 + Math.random(), 0.7, 0.6 );
				p.frame = SHAPES.bubble;
				p.size = ( 0.05 + Math.random() * 0.05 ) * f.scale;
				p.grow = p.size * 0.4;
				p.colour.set( 0xb8ff6a );
				p.alpha = 0.95;
				p.fall = - 0.05;
				p.drag = 1;
				p.kind = 1;
				return p;

			};
			const puddle = () => {

				const p = onRoad( batch, f, 0.3 + Math.random() * 0.25, 2.5 );
				p.colour.set( pick( greens ) );
				p.kind = 2;

			};
			const hooks = {
				look( p, t, view ) {

					if ( p.kind === 0 ) {

						// A blob wobbles, squashing one way and then the other, and doesn't fade.
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
					batch.begin();
					blobs( frame.power, frame.dt, 36, blob );
					bubbles( frame.power, frame.dt, 30, bubble );
					puddles( frame.grounded ? frame.power : 0, frame.dt, 10, puddle );
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

					for ( let i = Math.round( 10 * detail ); i > 0; i -- ) flung( frame, bubble( 1 ), 0.88, 1.5, 0.5, 0.5 );
					if ( frame.grounded ) for ( let i = 0; i < 2; i ++ ) puddle();

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

// The colour a style's ignition flashes in (see drive-bursts.js), or undefined for the classic
// flame, whose flash is its flame's.
export function styleTint( id ) {

	return STYLES[ id ]?.tint;

}

// The style `id`'s particles, in `root`: { update( frame ), ignite( frame, detail, calm ), alive,
// budget }, or null for the classic flame (or a name it doesn't know). Disposing of `root` disposes
// of them.
export function createBoostStyle( root, id ) {

	const style = STYLES[ id ];
	if ( ! style ) return null;
	const made = style.make( root );
	return {
		update: frame => made.update( frame ),
		// Its own burst as the booster lights, `detail` (0 to 1) of its usual count; `calm`, without
		// a flash (the visitor asked for less motion).
		ignite: ( frame, detail = 1, calm = false ) => made.ignite?.( frame, detail, calm ),
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
// a flash, the widest of them lingering as it spreads so it's seen from the chase camera; and while
// it lasts, streaks of air streaming back past its body. Any style gets these.
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

		// The boom, round the middle of its box, for a vehicle about `size` m across. `calm` (the
		// visitor asked for less motion): no flare, and the rings fainter.
		boom( frame, size, calm = false ) {

			const way = speed > 1 ? travel : frame.back;
			for ( const [ picture, life, inherit, start, spread, colour, alpha = 1, aspect = 1 ] of BOOM ) {

				if ( calm && picture === SHAPES.flare ) continue;
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
				p.colour.set( colour );
				p.alpha = alpha * ( calm && ! facing ? CALM_RINGS : 1 );
				p.kind = facing ? 2 : 1;

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
// a phone's narrow view (World Drive flashes the edges of the view white instead, screen-fx.js); a
// wide ring lingering as it spreads to seven times the vehicle's size, a second, bluer one inside
// that, and a flare side to side. Each [ picture, life (s), share of the vehicle's speed it keeps,
// size and growth (times the vehicle's size), colour, alpha, height for its width ]. The rings keep
// up with the vehicle (0.97 of its speed, drifting back a metre or few over their life): any
// slower and at overdrive's speed they fall back through the chase camera while still growing, and
// with the camera inside a ring's bright band the whole view goes white, twice.
const BOOM = [
	[ SHAPES.shock, 0.5, 0.97, 0.6, 4.5, 0xffffff ],
	[ SHAPES.ring, 0.4, 0.97, 0.4, 3, 0xcfeaff ],
	[ SHAPES.glow, 0.18, 1, 1.1, 1, 0xffffff, 0.75 ],
	[ SHAPES.shock, 0.95, 0.97, 1, 6, 0xeaf6ff, 0.6 ],
	[ SHAPES.ring, 0.75, 0.97, 0.8, 4, 0x9fd4ff, 0.6 ],
	[ SHAPES.flare, 0.22, 1, 1.4, 1.2, 0xffffff, 0.5, 0.25 ],
];
// How bright the boom's rings are for a visitor asking for less motion.
const CALM_RINGS = 0.6;
