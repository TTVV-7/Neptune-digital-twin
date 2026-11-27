import { BoxGeometry, CylinderGeometry, DoubleSide, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';
import { stationHead, tripod } from './civil-pieces.js';

// Construction workers to scale for showing how big things are: about 1.72 m tall, 1.8 m in a
// hard hat, in a hi-vis vest with reflective stripes (CSA Z96 style: a band round the waist,
// stripes over the shoulders, an X on the back). Low-poly figures posed by joint angles: standing,
// walking, a traffic control person with a STOP/SLOW paddle, and workers at their jobs (kneeling
// at rebar, shovelling, at a total station, signalling a crane, on a break, carrying lumber,
// pushing a wheelbarrow, on a jackhammer, holding a grade rod) with what they're working with,
// and a crew of three talking. They face -Z, so heading 0 faces north.

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

const BOOTS = () => mat( 0x4a3424, { roughness: 0.8 } );
const GLOVES = () => mat( 0x8e8a78, { roughness: 0.9 } );
const TAPE = () => mat( 0xd9dde0, { roughness: 0.35, metalness: 0.3, emissive: 0x2a2a2a } );
const STAFF = () => mat( 0x1d1f21, { roughness: 0.6 } );

// Fluorescent cloth looks lit from within, so it gets a little emissive glow.
const LIME = () => mat( 0xc6ef1e, { roughness: 0.75, emissive: 0x2f3a00 } );
const ORANGE = () => mat( 0xff6a13, { roughness: 0.75, emissive: 0x401600 } );

const HATS = { white: 0xf2f2ee, yellow: 0xf2c318, orange: 0xf26a1b, blue: 0x2459b0 };

// What the workers hold and work with.
const WOOD = () => mat( 0xb48a58, { roughness: 0.8 } );
const LUMBER = () => mat( 0xd8bb8a, { roughness: 0.9 } );
const STEEL = () => mat( 0x8a8f94, { roughness: 0.5, metalness: 0.6 } );
const DARK = () => mat( 0x2a2c2f, { roughness: 0.6, metalness: 0.3 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const REBAR = () => mat( 0x6b4a36, { roughness: 0.85, metalness: 0.3 } );

export const PEOPLE = {
	'worker-standing': { pose: 'stand', skin: 0xc8956c, hat: 'white', vest: LIME, shirt: 0x6f757c, pants: 0x2d3a52 },
	'worker-walking': { pose: 'walk', skin: 0x8d5a3b, hat: 'yellow', vest: LIME, shirt: 0x34465e, pants: 0x6e6249 },
	// Traffic control persons wear a hi-vis jacket and striped pants, as BC requires.
	'flagger': { pose: 'flag', skin: 0xe0b08f, hat: 'orange', vest: ORANGE, shirt: ORANGE, pants: 0x3a3d42, striped: true },
	'worker-kneeling': { pose: 'kneel', skin: 0x6b4630, hat: 'yellow', vest: LIME, shirt: 0x3c4a3a, pants: 0x3b3f45, prop: 'rebar' },
	'worker-shovelling': { pose: 'shovel', skin: 0xd8a47f, hat: 'orange', vest: ORANGE, shirt: 0x5a6470, pants: 0x2d3a52, prop: 'shovel' },
	'worker-surveyor': { pose: 'survey', skin: 0xa8734f, hat: 'blue', vest: LIME, shirt: 0xd8d4ca, pants: 0x6e6249, prop: 'totalStation' },
	'worker-crane-signaller': { pose: 'signal', skin: 0x4e3324, hat: 'white', vest: ORANGE, shirt: 0x2f3338, pants: 0x2d3a52 },
	'worker-sitting-bucket': { pose: 'sit', skin: 0xe6bc9a, hat: 'yellow', vest: LIME, shirt: 0x8a2f2a, pants: 0x3a5a80, prop: 'bucket' },
	'worker-carrying-lumber': { pose: 'carry', skin: 0x9a6644, hat: 'white', vest: LIME, shirt: 0x4b5560, pants: 0x6e6249, prop: 'lumber' },
	'worker-wheelbarrow': { pose: 'push', skin: 0xc8956c, hat: 'orange', vest: LIME, shirt: 0x2f4a6a, pants: 0x3b3f45, prop: 'wheelbarrow' },
	'worker-jackhammer': { pose: 'breaker', skin: 0x5c3b28, hat: 'yellow', vest: ORANGE, shirt: 0x5a6470, pants: 0x2d3a52, prop: 'jackhammer' },
	'worker-grade-rod': { pose: 'rod', skin: 0xd8a47f, hat: 'blue', vest: LIME, shirt: 0x6f757c, pants: 0x6e6249, prop: 'gradeRod' },
};

// The crew of three standing in a ring talking (crew()): one explaining with a hand out, one with
// a tablet, one with a coffee.
const CREW = [
	{ pose: 'gesture', skin: 0x8d5a3b, hat: 'white', vest: LIME, shirt: 0xd8d4ca, pants: 0x2d3a52 },
	{ pose: 'tablet', skin: 0xe0b08f, hat: 'blue', vest: LIME, shirt: 0x34465e, pants: 0x6e6249, prop: 'tablet' },
	{ pose: 'cup', skin: 0x6b4630, hat: 'yellow', vest: ORANGE, shirt: 0x5a6470, pants: 0x3b3f45, prop: 'cup' },
];

// The library entries (procedural.js spreads them in after the first three).
const ITEM = ( id, name, keywords ) => ( { id, name, category: 'People', keywords: `${ keywords } construction worker person people human figure scale`, build: () => person( id ) } );
export const PEOPLE_ITEMS = [
	ITEM( 'worker-kneeling', 'Construction worker, kneeling tying rebar (1.75 m)', 'kneeling kneel rebar tying ironworker rodbuster tie wire mat slab labourer' ),
	ITEM( 'worker-shovelling', 'Construction worker, shovelling (1.75 m)', 'shovel shovelling shoveling digging dig spade labourer laborer' ),
	ITEM( 'worker-surveyor', 'Surveyor at a total station on tripod (1.75 m)', 'surveyor survey total station tripod layout instrument man transit theodolite' ),
	ITEM( 'worker-crane-signaller', 'Crane signaller giving hand signals, arm raised (1.75 m)', 'signaller signalman signalperson signal person rigger crane hand signals hoist spotter banksman' ),
	ITEM( 'worker-sitting-bucket', 'Construction worker, sitting on a bucket on break (1.75 m)', 'sitting sit bucket pail break coffee lunch rest seated' ),
	ITEM( 'worker-carrying-lumber', 'Construction worker, carrying 2×4 lumber on shoulder (1.75 m)', 'carrying lumber 2x4 two by four boards wood framing carpenter shoulder' ),
	ITEM( 'worker-wheelbarrow', 'Construction worker, pushing a wheelbarrow (1.75 m)', 'wheelbarrow barrow pushing labourer laborer concrete gravel' ),
	ITEM( 'worker-jackhammer', 'Construction worker, with jackhammer (1.75 m)', 'jackhammer jack hammer breaker pneumatic chipping demolition concrete' ),
	ITEM( 'worker-grade-rod', 'Construction worker, laser receiver on grade rod (1.75 m)', 'grade rod laser receiver grade checker grade setter survey rod level elevation' ),
	ITEM( 'crew-talking-3', 'Construction crew of 3, standing talking (1.75 m)', 'crew group team three people talking meeting toolbox talk foreman tailgate' ),
];

// Joint angles in radians. Legs: thigh swing (forward +), knee bend, and optionally out to the
// side (`out`) and the boot's pitch (`foot`, toe down -) where the shin doesn't set it. Arms: swing
// (forward +), abduction (out to the side +) and elbow flex (forward +), or the forearm's own
// direction as [ swing, out ] (`fore`) where it bends some other way. `lean` tips everything above
// the hips forward. Arms are measured from the torso, so leaning takes them with it.
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
	// Down on the right knee, toes tucked under, the left foot flat in front and both hands down at
	// the rebar.
	kneel: {
		lean: 0.75,
		legs: [ { thigh: 1.7, knee: 1.7, out: 0.2 }, { thigh: 0, knee: 2.0, foot: - 1.0 } ],
		arms: [ { swing: 0.9, out: 0.05, flex: 0.35 }, { swing: 0.85, out: 0.02, flex: 0.45 } ],
	},
	// Left foot forward, leaning into the shovel: right hand high on the grip, left down the shaft.
	shovel: {
		lean: 0.6,
		legs: [ { thigh: 0.55, knee: 0.6, out: 0.06 }, { thigh: - 0.35, knee: 0.3, out: 0.06 } ],
		arms: [ { to: [ 0, 0.78, - 0.56 ] }, { to: [ 0.04, 1.05, - 0.32 ] } ],
	},
	// Bent a little to the eyepiece, right hand up on the instrument.
	survey: {
		lean: 0.15,
		legs: [ { thigh: 0.05, knee: 0.04, out: 0.06 }, { thigh: - 0.05, knee: 0.04, out: 0.06 } ],
		arms: [ { swing: 0.05, out: 0.12, flex: 0.25 }, { swing: 0.6, out: 0.08, fore: [ Math.PI + 0.15, - 0.3 ] } ],
	},
	// The crane "hoist" signal: right upper arm out level, forearm straight up, finger pointing up.
	signal: {
		legs: [ { thigh: 0, knee: 0.02, out: 0.06 }, { thigh: 0, knee: 0.02, out: 0.06 } ],
		arms: [ { swing: 0.05, out: 0.12, flex: 0.2 }, { swing: 0.1, out: 1.5, fore: [ 0.1, 3.0 ] } ],
	},
	// On a bucket, knees up, forearms on the thighs, a coffee in the right hand.
	sit: {
		lean: 0.5,
		legs: [ { thigh: 1.7, knee: 1.7, out: 0.14 }, { thigh: 1.7, knee: 1.7, out: 0.14 } ],
		arms: [ { to: [ - 0.15, 0.55, - 0.55 ] }, { to: [ 0.14, 0.62, - 0.5 ] } ],
	},
	// Walking with the right hand up at the shoulder steadying the boards.
	carry: {
		lean: 0.04,
		legs: [ { thigh: 0.32, knee: 0.08 }, { thigh: - 0.26, knee: 0.38 } ],
		arms: [ { swing: - 0.3, out: 0.1, flex: 0.3 }, { to: [ 0.2, 1.47, - 0.26 ], bend: [ 0.4, - 1, - 0.2 ] } ],
	},
	// Walking, leaning on the handles.
	push: {
		lean: 0.25,
		legs: [ { thigh: 0.32, knee: 0.1 }, { thigh: - 0.28, knee: 0.4 } ],
		arms: [ { to: [ - 0.29, 0.86, - 0.28 ] }, { to: [ 0.29, 0.86, - 0.28 ] } ],
	},
	// Feet apart over the breaker, both hands on its T-handle.
	breaker: {
		lean: 0.18,
		legs: [ { thigh: 0.08, knee: 0.12, out: 0.12 }, { thigh: - 0.04, knee: 0.12, out: 0.12 } ],
		arms: [ { to: [ - 0.27, 0.95, - 0.42 ] }, { to: [ 0.27, 0.95, - 0.42 ] } ],
	},
	// Standing, the grade rod held upright in the right hand.
	rod: {
		legs: [ { thigh: 0, knee: 0.02, out: 0.05 }, { thigh: 0, knee: 0.02, out: 0.05 } ],
		arms: [ { swing: 0.05, out: 0.12, flex: 0.2 }, { to: [ 0.3, 1.1, - 0.3 ] } ],
	},
	// The crew: a hand out explaining, a tablet held in both hands, a coffee.
	gesture: {
		legs: [ { thigh: 0.05, knee: 0.03, out: 0.05 }, { thigh: - 0.03, knee: 0.03, out: 0.05 } ],
		arms: [ { swing: 0.05, out: 0.12, flex: 0.25 }, { swing: 0.25, out: 0.2, flex: 1.2 } ],
	},
	tablet: {
		legs: [ { thigh: 0, knee: 0.02, out: 0.04 }, { thigh: 0, knee: 0.02, out: 0.04 } ],
		arms: [ { swing: 0.15, out: 0.0, flex: 1.25 }, { swing: 0.15, out: 0.0, flex: 1.25 } ],
	},
	cup: {
		legs: [ { thigh: 0.02, knee: 0.02, out: 0.07 }, { thigh: 0, knee: 0.02, out: 0.04 } ],
		arms: [ { swing: 0.05, out: 0.12, flex: 0.2 }, { swing: 0.1, out: 0.1, flex: 1.75 } ],
	},
};

const HIP = 0.9;
const THIGH = 0.41;
const SHIN = 0.41;
const SHOULDER = [ 0.195, 1.42 ];
const UPPER_ARM = 0.29;
const FOREARM = 0.26;

export function person( id ) {

	if ( id === 'crew-talking-3' ) return crew();
	const { parts, ground } = figure( PEOPLE[ id ] );

	// Stand it on the ground however the pose leaves its feet.
	const group = parts.build();
	for ( const mesh of group.children ) mesh.geometry.translate( 0, - ground, 0 );
	return group;

}

// Three of the crew in a ring about 1.5 m across, each facing the middle.
function crew() {

	const parts = new Parts();
	for ( const [ i, spec ] of CREW.entries() ) {

		const { parts: one, ground } = figure( spec );
		const a = ( i / 3 ) * Math.PI * 2;
		_q.setFromAxisAngle( _y.set( 0, 1, 0 ), a );
		_m.compose( _p.set( 0.75 * Math.sin( a ), - ground, 0.75 * Math.cos( a ) ), _q, _s.set( 1, 1, 1 ) );
		merge( parts, one, _m );

	}

	return parts.build();

}

// One posed worker with what they hold, as parts, and the height of the ground under their feet
// (the lowest point of a boot or knee).
function figure( spec ) {

	const { legs, arms, lean = 0 } = POSES[ spec.pose ];
	const parts = new Parts();
	const top = new Parts();
	const skin = mat( spec.skin, { roughness: 0.7 } );
	const pants = mat( spec.pants, { roughness: 0.9 } );
	const shirt = typeof spec.shirt === 'function' ? spec.shirt() : mat( spec.shirt, { roughness: 0.85 } );
	const vest = spec.vest();
	const tape = TAPE();

	// Legs and boots. The figure's right is +x (it faces -Z).
	let lowest = Infinity;
	for ( const [ i, side ] of [ - 1, 1 ].entries() ) {

		const { thigh, knee, out = 0, foot } = legs[ i ];
		const hip = [ side * 0.09, HIP, 0 ];
		const kneeAt = along( hip, thigh, out, side, THIGH );
		const ankle = along( kneeAt, thigh - knee, out, side, SHIN );
		parts.rod( pants, hip, kneeAt, [ 0.078, 0.056 ], 10, true );
		parts.rod( pants, kneeAt, ankle, [ 0.056, 0.046 ], 10, true );
		parts.sphere( pants, 0.056, kneeAt, [ 10, 6 ] );
		lowest = Math.min( lowest, kneeAt[ 1 ] - 0.056 );
		if ( spec.striped ) for ( const t of [ 0.45, 0.7 ] ) parts.rod( tape, lerp( kneeAt, ankle, t ), lerp( kneeAt, ankle, t + 0.08 ), 0.054, 10, true );

		// The boot pitches with the shin, flat when standing: heel down in front, toe down behind.
		// A kneeling leg's boot is turned about the ankle instead, toes down on the ground.
		let boot;
		if ( foot === undefined ) boot = parts.block( BOOTS(), [ 0.115, 0.11, 0.28 ], [ ankle[ 0 ], ankle[ 1 ] - 0.035, ankle[ 2 ] - 0.06 ], [ ( thigh - knee ) * 0.6, 0, 0 ] );
		else {

			const [ dy, dz ] = [ - 0.035, - 0.06 ];
			const centre = [ ankle[ 0 ], ankle[ 1 ] + dy * Math.cos( foot ) - dz * Math.sin( foot ), ankle[ 2 ] + dy * Math.sin( foot ) + dz * Math.cos( foot ) ];
			boot = parts.block( BOOTS(), [ 0.115, 0.11, 0.28 ], centre, [ foot, 0, 0 ] );

		}

		boot.computeBoundingBox();
		lowest = Math.min( lowest, boot.boundingBox.min.y );

	}

	// Hips, torso, vest with its stripes.
	tapered( top, pants, 0.15, 0.158, 0.86, 1.04, 0.68 );
	tapered( top, shirt, 0.158, 0.18, 1.02, 1.4, 0.62 );
	top.sphere( shirt, 0.18, [ 0, 1.4, 0 ], [ 16, 8 ], [ 1, 0.42, 0.62 ] );
	tapered( top, vest, 0.168, 0.19, 1.04, 1.41, 0.66, true );
	tapered( top, tape, 0.172, 0.174, 1.1, 1.15, 0.67, true );
	for ( const x of [ - 0.085, 0.085 ] ) top.block( tape, [ 0.045, 0.27, 0.01 ], [ x, 1.28, - 0.112 ] );

	for ( const a of [ - 0.55, 0.55 ] ) top.block( tape, [ 0.045, 0.34, 0.01 ], [ 0, 1.27, 0.122 ], [ 0, 0, a ] );

	// Everything above the hips leans forward about them.
	const tilt = new Matrix4().makeTranslation( 0, HIP, 0 ).multiply( new Matrix4().makeRotationX( - lean ) ).multiply( new Matrix4().makeTranslation( 0, - HIP, 0 ) );
	const untilt = tilt.clone().invert();

	// Arms with gloved hands, keeping where each hand ends up (for what it holds). An arm given a
	// place for its hand (`to`, metres right, up from the ground and forward-negative, as the
	// figure stands) reaches there, its elbow bent out and down.
	const hands = [];
	for ( const [ i, side ] of [ - 1, 1 ].entries() ) {

		const { swing, out, flex = 0, fore = [ swing + flex, out ], to, bend } = arms[ i ];
		const shoulder = [ side * SHOULDER[ 0 ], SHOULDER[ 1 ], 0 ];
		let elbow, wrist, hand;
		if ( to ) {

			hand = _p.set( to[ 0 ], to[ 1 ] + lowest, to[ 2 ] ).applyMatrix4( untilt ).toArray();
			elbow = reach( shoulder, hand, side, bend );
			wrist = lerp( elbow, hand, FOREARM / ( FOREARM + 0.06 ) );

		} else {

			elbow = along( shoulder, swing, out, side, UPPER_ARM );
			wrist = along( elbow, fore[ 0 ], fore[ 1 ], side, FOREARM );
			hand = along( wrist, fore[ 0 ], fore[ 1 ], side, 0.06 );

		}

		top.sphere( shirt, 0.06, shoulder, [ 10, 6 ] );
		top.rod( shirt, shoulder, elbow, [ 0.052, 0.042 ], 10, true );
		top.rod( shirt, elbow, wrist, [ 0.042, 0.034 ], 10, true );
		top.sphere( shirt, 0.042, elbow, [ 10, 6 ] );
		if ( spec.striped ) top.rod( tape, lerp( shoulder, elbow, 0.55 ), lerp( shoulder, elbow, 0.72 ), 0.051, 10, true );
		top.sphere( GLOVES(), 0.045, hand, [ 10, 6 ], [ 0.8, 1.3, 1 ] );
		hands.push( hand );

	}

	// Neck, head (with a nose, to show which way it faces) and hard hat with its brim and ridge.
	top.cylinder( skin, 0.048, 0.1, [ 0, 1.44, 0.005 ], 10 );
	top.sphere( skin, 1, [ 0, 1.615, - 0.005 ], [ 16, 12 ], [ 0.085, 0.112, 0.098 ] );
	top.sphere( skin, 0.018, [ 0, 1.6, - 0.1 ], [ 8, 6 ] );
	for ( const x of [ - 0.085, 0.085 ] ) top.sphere( skin, 0.022, [ x, 1.615, 0.005 ], [ 8, 6 ], [ 0.5, 1, 0.9 ] );
	const hat = mat( HATS[ spec.hat ], { roughness: 0.35 } );
	_m.compose( _p.set( 0, 1.665, 0 ), _q.identity(), _s.set( 1, 0.85, 1.12 ) );
	top.add( hat, new SphereGeometry( 0.115, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2 ), _m );
	_m.compose( _p.set( 0, 1.66, - 0.035 ), _q.identity(), _s.set( 1, 1, 1.3 ) );
	top.add( hat, new CylinderGeometry( 0.13, 0.135, 0.012, 18 ), _m );
	top.block( hat, [ 0.03, 0.02, 0.24 ], [ 0, 1.758, 0 ] );

	merge( parts, top, tilt );
	const at = point => _p.fromArray( point ).applyMatrix4( tilt ).toArray();
	const held = hands.map( at );
	const body = { ground: lowest, hands: held, at };

	if ( spec.pose === 'flag' ) paddle( parts, held[ 1 ] );
	if ( spec.prop ) PROPS[ spec.prop ]( parts, body );
	return { parts, ground: lowest };

}

// Every part of `from` added to `into`, moved by `matrix`.
function merge( into, from, matrix ) {

	for ( const [ material, list ] of from.lists ) for ( const geometry of list ) into.add( material, geometry, matrix );
	from.lists.clear();

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

// Where the elbow goes for the hand to reach `hand` from `shoulder` (as near as the arm allows),
// bent out to the side, down and back (or towards `bend`).
function reach( shoulder, hand, side, [ bx, by, bz ] = [ 1, - 0.6, 0.7 ] ) {

	const upper = UPPER_ARM;
	const lower = FOREARM + 0.06;
	const u = _x.fromArray( hand ).sub( _y.fromArray( shoulder ) );
	const d = Math.min( u.length(), ( upper + lower ) * 0.999 );
	u.normalize();
	const a = ( d * d + upper * upper - lower * lower ) / ( 2 * d );
	const h = Math.sqrt( Math.max( 0, upper * upper - a * a ) );
	const bend = _z.set( side * bx, by, bz ).addScaledVector( u, - _z.dot( u ) ).normalize();
	return shoulder.map( ( v, k ) => v + u.getComponent( k ) * a + bend.getComponent( k ) * h );

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

// --- what they're working with -----------------------------------------------------------------

// Each is added round the posed body: `ground` is the height of the ground under it (before it's
// stood up), `hands` where its hands are [ left, right ], and at( point ) where a point on the
// upper body ends up once it leans.
const PROPS = {

	// The corner of a slab's bottom mat in front of the kneeling worker: #5 bars at 12 in each way on
	// 3 in chairs, a tie being twisted at the crossing under the hands.
	rebar( parts, { ground, hands } ) {

		const bar = REBAR();
		const r = 0.008;
		const spacing = 12 * IN;
		const [ cx, cz ] = [ ( hands[ 0 ][ 0 ] + hands[ 1 ][ 0 ] ) / 2, ( hands[ 0 ][ 2 ] + hands[ 1 ][ 2 ] ) / 2 ];
		const near = cz + 0.02;
		const low = ground + 3 * IN;
		for ( let i = 0; i < 4; i ++ ) parts.rod( bar, [ cx - 0.06, low + r, near - i * spacing ], [ cx + 1.5, low + r, near - i * spacing ], r, 6 );
		for ( let i = 0; i <= 4; i ++ ) parts.rod( bar, [ cx + i * spacing, low + 3 * r, near + 0.08 ], [ cx + i * spacing, low + 3 * r, near - 3 * spacing - 0.15 ], r, 6 );
		const chair = mat( 0x9a9690, { roughness: 0.9 } );
		for ( const i of [ 0, 4 ] ) for ( const j of [ 0, 3 ] ) parts.box( chair, [ 0.05, 3 * IN, 0.05 ], [ cx + i * spacing, ground, near - j * spacing ] );
		parts.sphere( mat( 0x9c9c9a, { roughness: 0.5, metalness: 0.6 } ), 0.014, [ cx, low + 2 * r, near ], [ 8, 4 ] );

	},

	// A round-point shovel along the line through both hands, D-grip at the top, its blade pushed
	// into the ground.
	shovel( parts, { ground, hands } ) {

		const [ low, high ] = hands[ 0 ][ 1 ] < hands[ 1 ][ 1 ] ? hands : [ hands[ 1 ], hands[ 0 ] ];
		const d = _z.fromArray( low ).sub( _x.fromArray( high ) ).normalize().toArray();
		const point = t => high.map( ( v, k ) => v + d[ k ] * t );
		const grip = point( - 0.1 );
		const tip = ( ground - 0.06 - high[ 1 ] ) / d[ 1 ];
		const socket = point( tip - 0.3 );
		parts.rod( WOOD(), grip, socket, 0.017, 8 );
		parts.rod( DARK(), [ grip[ 0 ] - 0.06, grip[ 1 ], grip[ 2 ] ], [ grip[ 0 ] + 0.06, grip[ 1 ], grip[ 2 ] ], 0.014, 6 );
		for ( const s of [ - 1, 1 ] ) parts.rod( DARK(), [ grip[ 0 ] + s * 0.06, grip[ 1 ], grip[ 2 ] ], point( 0.02 ), 0.008, 6 );
		parts.rod( STEEL(), socket, point( tip - 0.22 ), [ 0.022, 0.03 ], 8 );
		oriented( parts, STEEL(), [ 0.24, 0.24, 0.006 ], point( tip - 0.12 ), d );

	},

	// A total station on its tripod in front, the eyepiece at the surveyor's eye.
	totalStation( parts, { ground, at } ) {

		const eye = at( [ 0, 1.625, - 0.09 ] );
		const head = eye[ 1 ] - ground - 0.252;
		const instrument = new Parts();
		tripod( instrument, head, 0.5, undefined, Math.PI / 3 );
		stationHead( instrument, head );
		merge( parts, instrument, _m.makeTranslation( eye[ 0 ], ground, eye[ 2 ] - 0.1 ) );

	},

	// An upturned 5 gallon pail under the seat, and a coffee in the right hand.
	bucket( parts, { ground, hands } ) {

		const pail = mat( 0xe86a1c, { roughness: 0.55 } );
		parts.cylinder( pail, 0.151, 0.368, [ 0, ground, 0.02 ], 20, 0.131 );
		parts.cylinder( pail, 0.158, 0.035, [ 0, ground, 0.02 ], 20 );
		parts.cylinder( pail, 0.146, 0.02, [ 0, ground + 0.1, 0.02 ], 20 );
		PROPS.cup( parts, { hands } );

	},

	// A disposable coffee cup with its lid, in the right hand.
	cup( parts, { hands } ) {

		const [ x, y, z ] = hands[ 1 ];
		parts.cylinder( mat( 0xf2efe8, { roughness: 0.7 } ), 0.03, 0.11, [ x, y - 0.06, z - 0.035 ], 12, 0.04 );
		parts.cylinder( mat( 0x2a2420, { roughness: 0.6 } ), 0.042, 0.012, [ x, y + 0.05, z - 0.035 ], 12 );

	},

	// A tablet held in both hands, its screen to the face.
	tablet( parts, { hands } ) {

		const c = lerp( hands[ 0 ], hands[ 1 ], 0.5 );
		parts.block( DARK(), [ 0.25, 0.012, 0.18 ], [ c[ 0 ], c[ 1 ] + 0.03, c[ 2 ] - 0.05 ], [ 0.6, 0, 0 ] );

	},

	// Two 10 ft 2×4s flat on the right shoulder, the hand steadying them.
	lumber( parts, { hands, at } ) {

		const shoulder = at( [ SHOULDER[ 0 ], SHOULDER[ 1 ] + 0.06, 0 ] );
		const x = Math.max( hands[ 1 ][ 0 ] - 0.06, shoulder[ 0 ] - 0.03 );
		for ( let i = 0; i < 2; i ++ ) parts.box( LUMBER(), [ 3.5 * IN, 1.5 * IN, 10 * FT ], [ x, shoulder[ 1 ] + i * 1.5 * IN, shoulder[ 2 ] - 0.25 ] );

	},

	// A contractor wheelbarrow (6 cu ft steel tray, 16 in tyre) with its handles in the hands,
	// lifted so the legs are off the ground.
	wheelbarrow( parts, { ground, hands } ) {

		const r = 0.2;
		const back = ( hands[ 0 ][ 2 ] + hands[ 1 ][ 2 ] ) / 2;
		const axle = [ 0, ground + r, back - 1.38 ];
		const handle = WOOD();
		const frame = mat( 0x2a2c2f, { roughness: 0.5, metalness: 0.4 } );
		let front;
		for ( const [ i, side ] of [ - 1, 1 ].entries() ) {

			const grip = hands[ i ];
			front = [ side * 0.07, axle[ 1 ] + 0.06, axle[ 2 ] + 0.06 ];
			parts.rod( handle, [ grip[ 0 ], grip[ 1 ], grip[ 2 ] + 0.08 ], front, 0.021, 8 );
			parts.rod( RUBBER(), [ grip[ 0 ], grip[ 1 ], grip[ 2 ] + 0.09 ], lerp( grip, front, 0.1 ), 0.025, 8 );
			parts.rod( frame, front, [ side * 0.06, axle[ 1 ], axle[ 2 ] ], 0.012, 6 );

			// The leg under the back of the tray, off the ground while it's pushed.
			const hinge = lerp( grip, front, 0.38 );
			parts.rod( frame, hinge, [ hinge[ 0 ] * 0.9, hinge[ 1 ] - 0.28, hinge[ 2 ] - 0.08 ], 0.011, 6 );

		}

		// The tray sits on the handles, sloping with them: open at the top, wider than its floor.
		const grip = lerp( hands[ 0 ], hands[ 1 ], 0.5 );
		const pitch = Math.atan2( grip[ 1 ] - front[ 1 ], grip[ 2 ] - front[ 2 ] );
		const middle = lerp( grip, [ 0, front[ 1 ], front[ 2 ] ], 0.62 );
		const tray = new CylinderGeometry( 0.58, 0.32, 0.3, 4, 1, true );
		tray.rotateY( Math.PI / 4 );
		tray.scale( 0.62 / 0.82, 1, 1 );
		tray.rotateX( - pitch * 0.5 );
		tray.translate( middle[ 0 ], middle[ 1 ] + 0.18, middle[ 2 ] );
		parts.add( mat( 0x2f6d3a, { roughness: 0.5, metalness: 0.3, side: DoubleSide } ), tray );

		// The wheel: a 16 in tyre on its rim, between the fork arms.
		_m.makeRotationZ( Math.PI / 2 ).setPosition( ...axle );
		parts.add( RUBBER(), new CylinderGeometry( r, r, 0.1, 18 ), _m );
		_m.makeRotationZ( Math.PI / 2 ).setPosition( ...axle );
		parts.add( mat( 0xb32a20, { roughness: 0.5 } ), new CylinderGeometry( 0.09, 0.09, 0.104, 14 ), _m );
		parts.rod( STEEL(), [ - 0.07, axle[ 1 ], axle[ 2 ] ], [ 0.07, axle[ 1 ], axle[ 2 ] ], 0.01, 6 );

	},

	// A 60 lb pneumatic breaker (jackhammer) under the hands, its chisel in the ground and the air
	// hose off behind.
	jackhammer( parts, { ground, hands } ) {

		const [ l, rt ] = hands;
		const c = lerp( l, rt, 0.5 );
		const body = mat( 0x3a3d42, { roughness: 0.5, metalness: 0.5 } );
		parts.rod( RUBBER(), [ l[ 0 ] - 0.03, l[ 1 ], l[ 2 ] ], [ rt[ 0 ] + 0.03, rt[ 1 ], rt[ 2 ] ], 0.017, 8 );
		parts.cylinder( body, 0.045, 0.1, [ c[ 0 ], c[ 1 ] - 0.1, c[ 2 ] ], 10 );
		parts.cylinder( body, 0.068, c[ 1 ] - 0.1 - ( ground + 0.42 ), [ c[ 0 ], ground + 0.42, c[ 2 ] ], 14 );
		parts.box( mat( 0xd9a520, { roughness: 0.5 } ), [ 0.07, 0.12, 0.05 ], [ c[ 0 ] + 0.07, c[ 1 ] - 0.36, c[ 2 ] ] );
		parts.cylinder( body, 0.05, 0.08, [ c[ 0 ], ground + 0.34, c[ 2 ] ], 12 );
		parts.cylinder( STEEL(), 0.016, 0.36, [ c[ 0 ], ground - 0.02, c[ 2 ] ], 8 );
		parts.cylinder( mat( 0x8c8780, { roughness: 1 } ), 0.12, 0.012, [ c[ 0 ], ground, c[ 2 ] ], 10, 0.05 );
		parts.path( mat( 0xd8c41c, { roughness: 0.7 } ), [
			[ c[ 0 ] + 0.1, c[ 1 ] - 0.3, c[ 2 ] ], [ c[ 0 ] + 0.28, ground + 0.35, c[ 2 ] + 0.12 ], [ c[ 0 ] + 0.4, ground + 0.018, c[ 2 ] + 0.5 ],
			[ c[ 0 ] + 0.5, ground + 0.018, c[ 2 ] + 1.4 ], [ c[ 0 ] + 0.35, ground + 0.018, c[ 2 ] + 2.2 ],
		], 0.018, 8 );

	},

	// A fibreglass grade rod (extended to 7 ft) upright in the right hand with a laser receiver
	// clamped on it.
	gradeRod( parts, { ground, hands } ) {

		const [ x, , z ] = hands[ 1 ];
		const rod = mat( 0xf0e6b8, { roughness: 0.6 } );
		const black = mat( 0x1d1f21, { roughness: 0.6 } );
		parts.cylinder( rod, 0.02, 1.25, [ x, ground, z ], 10 );
		parts.cylinder( rod, 0.016, 0.88, [ x, ground + 1.25, z ], 10 );
		for ( let y = 0.1; y < 2.1; y += 0.1 ) parts.cylinder( black, y < 1.25 ? 0.0205 : 0.0165, 0.012, [ x, ground + y, z ], 10 );
		parts.cylinder( black, 0.024, 0.03, [ x, ground, z ], 10 );
		parts.box( black, [ 0.04, 0.06, 0.04 ], [ x, ground + 1.47, z - 0.03 ] );
		parts.box( mat( 0xf2c318, { roughness: 0.5 } ), [ 0.075, 0.17, 0.035 ], [ x, ground + 1.415, z - 0.065 ] );
		parts.box( mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } ), [ 0.055, 0.1, 0.004 ], [ x, ground + 1.45, z - 0.084 ] );

	},

};

// A box of `size` centred on `centre`, its height along the direction `up` and its width kept
// level, as a shovel's blade along its shaft.
function oriented( parts, material, size, centre, up ) {

	_y.fromArray( up ).normalize();
	_x.set( 1, 0, 0 ).addScaledVector( _y, - _y.x ).normalize();
	_z.crossVectors( _x, _y );
	_m.makeBasis( _x, _y, _z ).setPosition( ...centre );
	return parts.add( material, new BoxGeometry( ...size ), _m );

}
