import { CylinderGeometry, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { drawn, mat, Parts } from './parts.js';

// Construction workers to scale for showing how big things are: about 1.72 m tall, 1.8 m in a
// hard hat, in a hi-vis vest with reflective stripes (CSA Z96 style: a band round the waist,
// stripes over the shoulders, an X on the back). Low-poly figures posed by joint angles: standing,
// walking, and a traffic control person with a STOP/SLOW paddle. They face -Z, so heading 0 faces
// north.

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

const BOOTS = () => mat( 0x4a3424, { roughness: 0.8 } );
const GLOVES = () => mat( 0x8e8a78, { roughness: 0.9 } );
const TAPE = () => mat( 0xd9dde0, { roughness: 0.35, metalness: 0.3, emissive: 0x2a2a2a } );
const STAFF = () => mat( 0x1d1f21, { roughness: 0.6 } );

// Fluorescent cloth looks lit from within, so it gets a little emissive glow.
const LIME = () => mat( 0xc6ef1e, { roughness: 0.75, emissive: 0x2f3a00 } );
const ORANGE = () => mat( 0xff6a13, { roughness: 0.75, emissive: 0x401600 } );

const HATS = { white: 0xf2f2ee, yellow: 0xf2c318, orange: 0xf26a1b };

export const PEOPLE = {
	'worker-standing': { pose: 'stand', skin: 0xc8956c, hat: 'white', vest: LIME, shirt: 0x6f757c, pants: 0x2d3a52 },
	'worker-walking': { pose: 'walk', skin: 0x8d5a3b, hat: 'yellow', vest: LIME, shirt: 0x34465e, pants: 0x6e6249 },
	// Traffic control persons wear a hi-vis jacket and striped pants, as BC requires.
	'flagger': { pose: 'flag', skin: 0xe0b08f, hat: 'orange', vest: ORANGE, shirt: ORANGE, pants: 0x3a3d42, striped: true },
};

// Joint angles in radians. Legs: thigh swing (forward +) and knee bend. Arms: swing (forward +),
// abduction (out to the side +) and elbow flex (forward +).
const POSES = {
	stand: {
		legs: [ { thigh: 0, knee: 0.02 }, { thigh: 0, knee: 0.02 } ],
		arms: [ { swing: 0.05, out: 0.12, flex: 0.2 }, { swing: 0.05, out: 0.12, flex: 0.2 } ],
	},
	walk: {
		legs: [ { thigh: 0.38, knee: 0.08 }, { thigh: - 0.3, knee: 0.42 } ],
		arms: [ { swing: - 0.35, out: 0.1, flex: 0.25 }, { swing: 0.4, out: 0.1, flex: 0.55 } ],
	},
	flag: {
		legs: [ { thigh: 0, knee: 0.02 }, { thigh: 0, knee: 0.02 } ],
		// Left arm (-x) held out to the side, palm out; right hand on the paddle's staff.
		arms: [ { swing: 0.15, out: 1.45, flex: 0 }, { swing: 0.2, out: 0.35, flex: 0.9 } ],
	},
};

const HIP = 0.9;
const THIGH = 0.41;
const SHIN = 0.41;
const SHOULDER = [ 0.195, 1.42 ];
const UPPER_ARM = 0.29;
const FOREARM = 0.26;

export function person( id ) {

	const spec = PEOPLE[ id ];
	const { legs, arms } = POSES[ spec.pose ];
	const parts = new Parts();
	const skin = mat( spec.skin, { roughness: 0.7 } );
	const pants = mat( spec.pants, { roughness: 0.9 } );
	const shirt = typeof spec.shirt === 'function' ? spec.shirt() : mat( spec.shirt, { roughness: 0.85 } );
	const vest = spec.vest();
	const tape = TAPE();

	// Legs and boots. The figure's right is +x (it faces -Z).
	let lowest = Infinity;
	for ( const [ i, side ] of [ - 1, 1 ].entries() ) {

		const { thigh, knee } = legs[ i ];
		const hip = [ side * 0.09, HIP, 0 ];
		const kneeAt = along( hip, thigh, 0, side, THIGH );
		const ankle = along( kneeAt, thigh - knee, 0, side, SHIN );
		parts.rod( pants, hip, kneeAt, [ 0.078, 0.056 ], 10, true );
		parts.rod( pants, kneeAt, ankle, [ 0.056, 0.046 ], 10, true );
		parts.sphere( pants, 0.056, kneeAt, [ 10, 6 ] );
		if ( spec.striped ) for ( const t of [ 0.45, 0.7 ] ) parts.rod( tape, lerp( kneeAt, ankle, t ), lerp( kneeAt, ankle, t + 0.08 ), 0.054, 10, true );

		// The boot pitches with the shin, flat when standing: heel down in front, toe down behind.
		const pitch = thigh - knee;
		const boot = parts.block( BOOTS(), [ 0.115, 0.11, 0.28 ], [ ankle[ 0 ], ankle[ 1 ] - 0.035, ankle[ 2 ] - 0.06 ], [ pitch * 0.6, 0, 0 ] );
		boot.computeBoundingBox();
		lowest = Math.min( lowest, boot.boundingBox.min.y );

	}

	// Hips, torso, vest with its stripes.
	tapered( parts, pants, 0.15, 0.158, 0.86, 1.04, 0.68 );
	tapered( parts, shirt, 0.158, 0.18, 1.02, 1.4, 0.62 );
	parts.sphere( shirt, 0.18, [ 0, 1.4, 0 ], [ 16, 8 ], [ 1, 0.42, 0.62 ] );
	tapered( parts, vest, 0.168, 0.19, 1.04, 1.41, 0.66, true );
	tapered( parts, tape, 0.172, 0.174, 1.1, 1.15, 0.67, true );
	for ( const x of [ - 0.085, 0.085 ] ) parts.block( tape, [ 0.045, 0.27, 0.01 ], [ x, 1.28, - 0.112 ] );

	for ( const a of [ - 0.55, 0.55 ] ) parts.block( tape, [ 0.045, 0.34, 0.01 ], [ 0, 1.27, 0.122 ], [ 0, 0, a ] );

	// Arms with gloved hands, the right one returning where it ends up (for the paddle).
	const hands = [];
	for ( const [ i, side ] of [ - 1, 1 ].entries() ) {

		const { swing, out, flex } = arms[ i ];
		const shoulder = [ side * SHOULDER[ 0 ], SHOULDER[ 1 ], 0 ];
		const elbow = along( shoulder, swing, out, side, UPPER_ARM );
		const wrist = along( elbow, swing + flex, out, side, FOREARM );
		const hand = along( wrist, swing + flex, out, side, 0.06 );
		parts.sphere( shirt, 0.06, shoulder, [ 10, 6 ] );
		parts.rod( shirt, shoulder, elbow, [ 0.052, 0.042 ], 10, true );
		parts.rod( shirt, elbow, wrist, [ 0.042, 0.034 ], 10, true );
		parts.sphere( shirt, 0.042, elbow, [ 10, 6 ] );
		if ( spec.striped ) parts.rod( tape, lerp( shoulder, elbow, 0.55 ), lerp( shoulder, elbow, 0.72 ), 0.051, 10, true );
		parts.sphere( GLOVES(), 0.045, hand, [ 10, 6 ], [ 0.8, 1.3, 1 ] );
		hands.push( hand );

	}

	// Neck, head (with a nose, to show which way it faces) and hard hat with its brim and ridge.
	parts.cylinder( skin, 0.048, 0.1, [ 0, 1.44, 0.005 ], 10 );
	parts.sphere( skin, 1, [ 0, 1.615, - 0.005 ], [ 16, 12 ], [ 0.085, 0.112, 0.098 ] );
	parts.sphere( skin, 0.018, [ 0, 1.6, - 0.1 ], [ 8, 6 ] );
	for ( const x of [ - 0.085, 0.085 ] ) parts.sphere( skin, 0.022, [ x, 1.615, 0.005 ], [ 8, 6 ], [ 0.5, 1, 0.9 ] );
	const hat = mat( HATS[ spec.hat ], { roughness: 0.35 } );
	_m.compose( _p.set( 0, 1.665, 0 ), _q.identity(), _s.set( 1, 0.85, 1.12 ) );
	parts.add( hat, new SphereGeometry( 0.115, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2 ), _m );
	_m.compose( _p.set( 0, 1.66, - 0.035 ), _q.identity(), _s.set( 1, 1, 1.3 ) );
	parts.add( hat, new CylinderGeometry( 0.13, 0.135, 0.012, 18 ), _m );
	parts.block( hat, [ 0.03, 0.02, 0.24 ], [ 0, 1.758, 0 ] );

	if ( spec.pose === 'flag' ) paddle( parts, hands[ 1 ] );

	// Stand it on the ground however the pose leaves its feet.
	const group = parts.build();
	for ( const mesh of group.children ) mesh.geometry.translate( 0, - lowest, 0 );
	return group;

}

// From `from`, `length` along a limb swung forward by `swing` and out to the side by `out`.
function along( from, swing, out, side, length ) {

	const x = Math.sin( side * out );
	const y = - Math.cos( out );
	return [
		from[ 0 ] + length * x,
		from[ 1 ] + length * y * Math.cos( swing ),
		from[ 2 ] + length * y * Math.sin( swing ),
	];

}

function lerp( a, b, t ) {

	return a.map( ( v, i ) => v + ( b[ i ] - v ) * t );

}

// An upright, elliptical (flattened front to back by `depth`) tapered tube from y0 to y1.
function tapered( parts, material, r0, r1, y0, y1, depth, open = false ) {

	_m.compose( _p.set( 0, ( y0 + y1 ) / 2, 0 ), _q.identity(), _s.set( 1, 1, depth ) );
	return parts.add( material, new CylinderGeometry( r1, r0, y1 - y0, 18, 1, open ), _m );

}

// A STOP/SLOW paddle on a staff standing on the ground, through the right hand: an 18 in (450 mm)
// octagon, STOP facing the front (-Z) and SLOW the back.
function paddle( parts, [ x, , z ] ) {

	const size = 0.457;
	const staff = 1.65;
	parts.rod( STAFF(), [ x, 0, z ], [ x, staff + size / 2, z ], 0.016, 8 );
	const centre = staff + size / 2;
	parts.add( face( 'STOP', '#c8102e', '#ffffff' ), new PlaneGeometry( size, size ), _m.makeRotationY( Math.PI ).setPosition( x, centre, z - 0.02 ) );
	parts.add( face( 'SLOW', '#ff7a1a', '#111111' ), new PlaneGeometry( size, size ), _m.makeTranslation( x, centre, z - 0.012 ) );

}

function face( text, background, ink ) {

	return drawn( `paddle ${ text }`, [ 256, 256 ], ( ctx, w ) => {

		const octagon = r => {

			ctx.beginPath();
			for ( let i = 0; i < 8; i ++ ) {

				const a = ( i + 0.5 ) * Math.PI / 4;
				ctx[ i ? 'lineTo' : 'moveTo' ]( w / 2 + r * Math.cos( a ), w / 2 + r * Math.sin( a ) );

			}

			ctx.closePath();

		};

		const r = w / 2 / Math.cos( Math.PI / 8 );
		octagon( r );
		ctx.fillStyle = ink;
		ctx.fill();
		octagon( r * 0.9 );
		ctx.fillStyle = background;
		ctx.fill();
		ctx.fillStyle = ink;
		ctx.font = 'bold 86px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( text, w / 2, w / 2 + 4, w * 0.82 );

	} );

}
