import { CircleGeometry, DoubleSide, ExtrudeGeometry, MathUtils, Matrix4, Path, RingGeometry, Shape, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';
import { person } from './people.js';

// A cross-country oil, gas or water transmission pipeline spread, built in code at the sizes of
// the common North American classes (no brands), for 36 in line pipe: the pipe itself (a coated
// joint strung on skids, a yard stack, the stringing truck that brings it), the front end (a
// bucket wheel ditcher, a field bending machine, a facing machine), the mainline (a welding shack,
// a rig welder, a vacuum lifter on an excavator, holiday testing), lowering in and backfill
// (sandbag pillows, set-on weights, a padding machine, a rubber-track carrier) and the hydrotest
// (a pump skid and a test head). Like the other built-in pieces each stands on y = 0 with its
// front facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const UP = new Vector3( 0, 1, 0 );
const _m = new Matrix4();

// 36 in line pipe: 914 mm outside, 80 ft (double random) joints.
const PIPE_R = 18 * IN;
const JOINT = 80 * FT;

export const PIPELINE_ITEMS = [
	// Line pipe.
	{ id: 'line-pipe-joint-on-skids', name: 'Line pipe joint on skids, coated (36 in × 80 ft, green FBE, timber skids)', category: 'Materials',
		keywords: 'line pipe pipeline joint strung pipe stringing skids skid pile fbe coated steel pipe 36 inch row right of way ditch',
		build: jointOnSkids, rowLength: JOINT + 1 * FT },
	{ id: 'pipe-yard-stack-36in', name: 'Pipe yard stack (15 joints of 36 in × 80 ft, 3 high on sand berms)', category: 'Materials',
		keywords: 'pipe yard pipe stack pipe pile stockpile line pipe storage berms chocks laydown pipeline 36 inch',
		build: yardStack },
	{ id: 'pipe-stringing-trailer', name: 'Pipe stringing truck and pole trailer (3 joints of 36 in × 80 ft)', category: 'Vehicles',
		keywords: 'pipe stringing truck stringer pipe hauler pipe truck pole trailer pole jinker dolly bolster line pipe delivery right of way',
		build: stringingTruck },
	// Front end.
	{ id: 'wheel-ditcher', name: 'Bucket wheel trencher / ditcher (to 8 ft deep, 36 in wide, tracked, wheel raised)', category: 'Heavy equipment',
		keywords: 'wheel ditcher wheel trencher bucket wheel trencher ditcher mainline pipeline trench digger',
		build: wheelDitcher },
	{ id: 'pipe-bending-machine-36in', name: 'Pipe bending machine, field (up to 36 in, tracked, with mandrel)', category: 'Heavy equipment',
		keywords: 'pipe bender bending machine cold bend field bend stiffback mandrel pin up shoe die pipeline crc',
		build: bendingMachine },
	{ id: 'internal-lineup-clamp-tractor', name: 'Pipe facing machine and internal line-up clamp on rubber-track carrier (36 in)', category: 'Heavy equipment',
		keywords: 'facing machine bevelling machine beveling end prep internal clamp line up clamp iuc pipeline front end tracked carrier',
		build: facingCarrier },
	// Mainline.
	{ id: 'pipe-welding-shack', name: 'Pipeline welding shack on skids (10 × 8 ft, straddles the pipe)', category: 'Temporary covers',
		keywords: 'welding shack weld shack weld tent tie in shack wind shelter habitat pipeline welding firing line',
		build: weldingShack },
	{ id: 'welding-rig-truck', name: 'Pipeline welding rig truck (1-ton dually, 2 engine-drive welders, bottle rack)', category: 'Vehicles',
		keywords: 'welding rig rig welder welder truck pipeline welder pickup 1 ton dually engine drive welder oxy acetylene bottles',
		build: weldingRig },
	{ id: 'pipe-vacuum-lifter-excavator', name: 'Excavator with pipe vacuum lifter (30 t class, 36 in pad)', category: 'Heavy equipment',
		keywords: 'vacuum lifter vacuworx pipe lifter vacuum pad excavator pipe handling stringing pipeline lifting attachment',
		build: vacuumExcavator },
	{ id: 'holiday-detector', name: 'Holiday detector ring on 36 in pipe with operator (20 ft of pipe on skids)', category: 'Utilities',
		keywords: 'holiday detector jeep jeeping ring coating inspection holiday test spark test pipeline qa qc',
		build: holidayDetector },
	{ id: 'holiday-detector-ring', name: 'Holiday detector ring and operator (for 36 in pipe; place on a strung joint)', category: 'Utilities',
		keywords: 'holiday detector jeep jeeping ring coating inspection holiday test spark test pipeline qa qc inspector',
		build: () => holidayDetector( false ) },
	// Lowering in and backfill.
	{ id: 'pipe-sandbag-pillows', name: 'Pipe support pillows, sandbag piers (4 at 20 ft, for 36 in pipe)', category: 'Utilities',
		keywords: 'sandbag pillows pipe pillows sand bags piers pipe supports ditch bottom lowering in pipeline padding',
		build: sandbagPillows },
	{ id: 'pipe-concrete-saddle-weight', name: 'Concrete set-on saddle weights (for 36 in pipe, 4 units on dunnage)', category: 'Materials',
		keywords: 'saddle weights set on weights river weights buoyancy control concrete weights pipeline wetland crossing swamp',
		build: saddleWeights },
	{ id: 'padding-machine', name: 'Padding machine, self-propelled (tracked, screen and side conveyor)', category: 'Heavy equipment',
		keywords: 'padding machine padder ozzie screening padding backfill pipeline ditch screen conveyor',
		build: paddingMachine },
	{ id: 'tracked-carrier-morooka', name: 'Rubber-track carrier / dumper (Morooka MST-2200 class, 11 t dump bed)', category: 'Vehicles',
		keywords: 'morooka rubber track carrier crawler carrier tracked dumper track truck wetland soft ground right of way swamp',
		build: trackedCarrier },
	// Hydrotest.
	{ id: 'hydrotest-pump-skid', name: 'Hydrostatic test pump skid, fill and pressure (8 × 6 ft, with chart recorder)', category: 'Dewatering & water treatment',
		keywords: 'hydrotest pump hydrostatic test pressure test pump triplex fill pump chart recorder deadweight pipeline',
		build: hydrotestSkid },
	{ id: 'pipe-test-head-pig-launcher', name: 'Temporary test head / pig launcher (36 in, on cribbing)', category: 'Utilities',
		keywords: 'test head pig launcher pig trap pig barrel end cap hydrotest cleaning pigging pipeline closure',
		build: testHead },
];

// --- shared colours ----------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xe2a41c );
const WHITE = () => paint( 0xe9e8e2 );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const TRACK = () => mat( 0x2a2a2b, { roughness: 0.8, metalness: 0.35 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GLASS = () => mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const BELT = () => mat( 0x1f2022, { roughness: 0.9 } );
const TIMBER = () => mat( 0x8a6a45, { roughness: 0.95 } );
const CONCRETE = () => mat( 0xa9a59c, { roughness: 0.95 } );
const SAND = () => mat( 0xc9b48a, { roughness: 1 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );
const HEADLAMP = () => mat( 0xfff3c9, { roughness: 0.3, emissive: 0x6b6040 } );
// Fusion-bonded epoxy coating, the bare steel of the cutbacks and bevels, and the inside of the pipe.
const FBE = () => mat( 0x3f7a4c, { roughness: 0.45, metalness: 0.1 } );
const BARE = () => mat( 0xa3a29d, { roughness: 0.45, metalness: 0.35 } );
const BARE_FACE = () => mat( 0xb4b3ae, { roughness: 0.45, metalness: 0.35, side: DoubleSide } );
const BORE = () => mat( 0x2e2925, { roughness: 0.9, side: DoubleSide } );

// --- shared pieces -----------------------------------------------------------------------------

const v = p => Array.isArray( p ) ? new Vector3( ...p ) : p.clone();

// A box section [ w across, h deep ] from a to b.
function member( parts, material, section, a, b ) {

	parts.add( material, memberGeometry( section, v( a ), v( b ) ) );

}

// A hydraulic cylinder: the barrel for the first 60%, the rod the rest of the way.
function ram( parts, radius, a, b ) {

	const split = v( a ).lerp( v( b ), 0.6 ).toArray();
	parts.rod( DARK(), v( a ).toArray(), split, radius, 10 );
	parts.rod( BRIGHT(), split, v( b ).toArray(), radius * 0.6, 8 );

}

// A cross-section (points [ x, y ]) extruded along z from z0 to z1.
function alongZ( parts, material, points, z0, z1 ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 } );
	parts.add( material, geometry, _m.makeTranslation( 0, 0, z0 ) );

}

// Points round an arc centred on [ cx, cy ] from angle a0 to a1 (degrees, anticlockwise from +x).
function arc( [ cx, cy ], r, a0, a1, steps = 12 ) {

	const points = [];
	for ( let i = 0; i <= steps; i ++ ) {

		const a = ( a0 + ( a1 - a0 ) * i / steps ) * DEG;
		points.push( [ cx + r * Math.cos( a ), cy + r * Math.sin( a ) ] );

	}

	return points;

}

// A rounded-end outline (points [ z, y ]) `length` long and `height` high, its bottom at y0.
function stadium( z0, y0, length, height, steps = 8 ) {

	const r = height / 2;
	const yc = y0 + r;
	const points = [];
	for ( let i = 0; i <= steps; i ++ ) {

		const a = - Math.PI / 2 + Math.PI * i / steps;
		points.push( [ z0 + length / 2 - r + r * Math.cos( a ), yc + r * Math.sin( a ) ] );

	}

	for ( let i = 0; i <= steps; i ++ ) {

		const a = Math.PI / 2 + Math.PI * i / steps;
		points.push( [ z0 - length / 2 + r + r * Math.cos( a ), yc + r * Math.sin( a ) ] );

	}

	return points;

}

// A crawler track along z: the track (steel, or rubber) round its frame, the idler and sprocket
// inside the ends, and the grousers along the top run.
function crawler( parts, frame, { length, height, width, x, z = 0, rubber = false } ) {

	const belt = rubber ? RUBBER() : TRACK();
	const t = Math.min( 0.09, height * 0.14 );
	const shape = new Shape( stadium( z, 0, length, height ).map( ( [ zz, y ] ) => new Vector2( zz, y ) ) );
	shape.holes.push( new Path( stadium( z, t, length - 2 * t, height - 2 * t ).map( ( [ zz, y ] ) => new Vector2( zz, y ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: width, bevelEnabled: false, curveSegments: 4 } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( x + width / 2, 0, 0 );
	parts.add( belt, geometry );
	parts.box( frame, [ width * 0.6, height - 2 * t - 0.1, length - height ], [ x, t + 0.05, z ] );
	const r = height / 2 - t - 0.015;
	for ( const end of [ - 1, 1 ] ) parts.rod( DARK(), [ x - width * 0.4, height / 2, z + end * ( length / 2 - height / 2 ) ], [ x + width * 0.4, height / 2, z + end * ( length / 2 - height / 2 ) ], r, 16 );
	if ( rubber ) return;
	const run = length - height;
	const pitch = Math.max( 0.15, height * 0.25 );
	const shoes = Math.floor( run / pitch );
	for ( let i = 0; i <= shoes; i ++ ) parts.box( TRACK(), [ width, 0.035, pitch * 0.25 ], [ x, height, z - shoes * pitch / 2 + i * pitch ] );

}

// A rubber tyre on its wheel, its axle across x, centred on the point.
function tyre( parts, radius, width, [ x, y, z ], rim = STEEL() ) {

	parts.rod( RUBBER(), [ x - width / 2, y, z ], [ x + width / 2, y, z ], radius, 20 );
	parts.rod( rim, [ x - width / 2 - 0.005, y, z ], [ x + width / 2 + 0.005, y, z ], radius * 0.55, 14 );

}

// An operator's seat facing -Z with its cushion top at y.
function seat( parts, [ x, y, z ], width = 0.5 ) {

	parts.box( BLACK(), [ width, 0.1, 0.48 ], [ x, y - 0.1, z ] );
	parts.block( BLACK(), [ width, 0.55, 0.1 ], [ x, y + 0.25, z + 0.24 ], [ - 10 * DEG, 0, 0 ] );

}

// A closed cab of [ width, height, length ] standing at (x, y0, z): panels to `sill`, glass all
// round above with corner posts, and the roof.
function cab( parts, material, [ w, h, l ], [ x, y0, z ], sill = 0.35 ) {

	const low = h * sill;
	parts.box( material, [ w, low, l ], [ x, y0, z ] );
	parts.box( GLASS(), [ w - 0.04, h - low - 0.1, l - 0.04 ], [ x, y0 + low, z ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( material, [ 0.07, h - low - 0.1, 0.07 ], [ x + sx * ( w / 2 - 0.035 ), y0 + low, z + sz * ( l / 2 - 0.035 ) ] );
	parts.box( material, [ w + 0.08, 0.1, l + 0.08 ], [ x, y0 + h - 0.1, z ] );

}

// A belt conveyor from tail to head: the belt, side frames under its edges, cross members and the
// drums at each end.
function conveyor( parts, tail, head, width, frame = DARK() ) {

	const a = v( tail );
	const b = v( head );
	const dir = b.clone().sub( a ).normalize();
	const side = new Vector3().crossVectors( dir, UP ).normalize();
	const up = new Vector3().crossVectors( side, dir ).normalize();
	member( parts, BELT(), [ width, 0.05 ], a, b );
	for ( const s of [ - 1, 1 ] ) {

		const off = side.clone().multiplyScalar( s * ( width / 2 + 0.05 ) ).addScaledVector( up, - 0.05 );
		member( parts, frame, [ 0.06, 0.25 ], a.clone().add( off ), b.clone().add( off ) );

	}

	const length = a.distanceTo( b );
	for ( let t = 0.6; t < length - 0.3; t += 1.0 ) {

		const p = a.clone().addScaledVector( dir, t ).addScaledVector( up, - 0.14 );
		parts.rod( frame, p.clone().addScaledVector( side, - width / 2 - 0.08 ).toArray(), p.clone().addScaledVector( side, width / 2 + 0.08 ).toArray(), 0.03, 5 );

	}

	for ( const p of [ a, b ] ) parts.rod( STEEL(), p.clone().addScaledVector( side, - width / 2 ).addScaledVector( up, - 0.08 ).toArray(), p.clone().addScaledVector( side, width / 2 ).addScaledVector( up, - 0.08 ).toArray(), 0.1, 12 );
	return { dir, side, up };

}

// A length of coated line pipe lying along z centred on [ x, y, z ]: the coating, the bare 6 in
// cutback at each end, the bevelled steel face and the dark bore just inside it.
function pipe( parts, [ x, y, z ], length, { r = PIPE_R, coat = FBE(), cutback = 6 * IN, segments = 28 } = {} ) {

	const z0 = z - length / 2;
	const z1 = z + length / 2;
	const wall = 0.016;
	parts.rod( coat, [ x, y, z0 + cutback ], [ x, y, z1 - cutback ], r, segments, true );
	for ( const [ end, s ] of [ [ z0, 1 ], [ z1, - 1 ] ] ) {

		parts.rod( BARE(), [ x, y, end ], [ x, y, end + s * cutback ], r - 0.002, segments, true );
		parts.add( BARE_FACE(), new RingGeometry( r - wall, r - 0.002, segments ), _m.makeTranslation( x, y, end ) );
		parts.rod( BORE(), [ x, y, end ], [ x, y, end + s * 0.6 ], r - wall, segments, true );
		parts.add( BORE(), new CircleGeometry( r - wall, segments ), _m.makeTranslation( x, y, end + s * 0.6 ) );

	}

}

// A skid pile under a pipe: three 6 × 8 in timbers 4 ft long across the pipe, stacked, with a
// wedge chock each side of the pipe on top. Returns the top.
function skid( parts, [ x, z ], layers = 3 ) {

	const t = 6 * IN;
	for ( let i = 0; i < layers; i ++ ) parts.box( TIMBER(), [ 4 * FT, t, 8 * IN ], [ x, i * t, z ] );
	const top = layers * t;
	for ( const s of [ - 1, 1 ] ) parts.prism( TIMBER(), [ [ z - 0.1, top ], [ z + 0.1, top ], [ z + 0.1, top + 0.06 ], [ z - 0.1, top + 0.12 ] ], 0.12, x + s * 0.42 );
	return top;

}

// A worker figure from people.js stood at [ x, z ], turned `turn` degrees clockwise, its meshes
// added to `group`.
function figure( group, id, [ x, z ], turn = 0 ) {

	const placed = new Matrix4().makeRotationY( - turn * DEG ).setPosition( x, 0, z );
	for ( const mesh of [ ...person( id ).children ] ) {

		mesh.geometry.applyMatrix4( placed );
		group.add( mesh );

	}

}

// --- line pipe ---------------------------------------------------------------------------------

// One 80 ft joint of 36 in line pipe in green fusion-bonded epoxy, strung along the ditch on two
// skid piles 15 ft in from its ends, its bevelled ends bare. A row (rows.js) strings them end to
// end a foot apart, ready for the welders.
function jointOnSkids() {

	const parts = new Parts();
	const inset = 15 * FT;
	let top = 0;
	for ( const z of [ - JOINT / 2 + inset, JOINT / 2 - inset ] ) top = skid( parts, [ 0, z ] );
	pipe( parts, [ 0, top + PIPE_R, 0 ], JOINT );
	return parts.build();

}

// A pipe yard pile of fifteen 80 ft joints of 36 in pipe, six, five and four high on three sand
// berms across them, with timber chocks nailed to the berm tops at the outside of the bottom row.
function yardStack() {

	const parts = new Parts();
	const pitch = 2 * PIPE_R + 0.01;
	const rise = Math.sqrt( pitch * pitch - pitch * pitch / 4 );
	const berm = 0.45;
	const width = 6 * pitch + 0.9;

	// The berms: sand, trapezoidal, their tops flat.
	for ( const z of [ - 10, 0, 10 ] ) {

		parts.prism( SAND(), [ [ z - 0.9, 0 ], [ z + 0.9, 0 ], [ z + 0.35, berm ], [ z - 0.35, berm ] ], width );
		for ( const s of [ - 1, 1 ] ) parts.prism( TIMBER(), [ [ z - 0.3, berm ], [ z + 0.3, berm ], [ z + 0.3, berm + 0.08 ], [ z - 0.3, berm + 0.18 ] ], 0.15, s * ( 3 * pitch + 0.08 ) );

	}

	// The pipe, each joint a little off the next along its length, as a loader sets them.
	const offsets = [ 0.12, - 0.08, 0.2, 0, - 0.15, 0.05, 0.1, - 0.2, 0.15, - 0.05, 0.08, - 0.1, 0.18, 0, - 0.12 ];
	let n = 0;
	for ( const [ row, count ] of [ 6, 5, 4 ].entries() ) {

		for ( let i = 0; i < count; i ++ ) {

			const x = ( i - ( count - 1 ) / 2 ) * pitch;
			pipe( parts, [ x, berm + PIPE_R + row * rise, offsets[ n ++ ] ], JOINT );

		}

	}

	return parts.build();

}

// --- pipe stringing truck ----------------------------------------------------------------------

const TRUCK_WIDTH = 2.59; // 8 ft 6 in
const R = 0.53; // 11R22.5 tyres

// A conventional day-cab tractor from its bumper at z = front: frame rails to `back`, the steer
// axle, two drive axles centred at `rear`, the hood, the cab and its exhaust stack.
function tractor( parts, { colour, front, rear, back } ) {

	const body = paint( colour );
	const frameTop = 1.08;

	for ( const x of [ - 0.43, 0.43 ] ) parts.box( DARK(), [ 0.1, 0.3, back - front - 0.25 ], [ x, frameTop - 0.3, ( front + back ) / 2 + 0.12 ] );
	parts.box( BRIGHT(), [ TRUCK_WIDTH - 0.1, 0.35, 0.22 ], [ 0, 0.5, front + 0.11 ] );
	for ( const s of [ - 1, 1 ] ) {

		// Fuel tank on its brackets behind the cab, and the step box under the door.
		parts.rod( BRIGHT(), [ s * 0.92, 0.75, front + 3.9 ], [ s * 0.92, 0.75, front + 4.6 ], 0.3, 16 );
		parts.box( DARK(), [ 0.36, 0.8, 0.5 ], [ s * 1.08, 0.5, front + 2.75 ] );
		for ( const y of [ 0.55, 0.92 ] ) parts.box( BRIGHT(), [ 0.04, 0.03, 0.45 ], [ s * 1.27, y, front + 2.75 ] );

	}

	// Wheels: singles on the steer axle, duals behind.
	const steer = front + 1.3;
	parts.rod( DARK(), [ - 0.95, R, steer ], [ 0.95, R, steer ], 0.07, 8 );
	for ( const s of [ - 1, 1 ] ) tyre( parts, R, 0.3, [ s * ( TRUCK_WIDTH / 2 - 0.16 ), R, steer ], BRIGHT() );
	for ( const z of [ rear - 0.66, rear + 0.66 ] ) {

		parts.rod( DARK(), [ - 0.95, R, z ], [ 0.95, R, z ], 0.07, 8 );
		for ( const s of [ - 1, 1 ] ) for ( const d of [ - 0.14, 0.14 ] ) tyre( parts, R, 0.26, [ s * ( TRUCK_WIDTH / 2 - 0.29 ) + d, R, z ] );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ 0.55, 0.65, 0.02 ], [ s * ( TRUCK_WIDTH / 2 - 0.3 ), 0.2, rear + 1.3 ] );

	// Hood with the grille and headlamps, and the fenders over the steer tyres.
	parts.box( body, [ 1.3, 1.3, 2.05 ], [ 0, 0.85, front + 1.27 ] );
	parts.box( BRIGHT(), [ 1.05, 1.15, 0.05 ], [ 0, 0.9, front + 0.23 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( HEADLAMP(), [ 0.22, 0.14, 0.04 ], [ s * 0.98, 1.12, front + 0.62 ] );
		parts.block( body, [ 0.62, 0.08, 0.5 ], [ s * 0.97, 1.08, front + 0.52 ], [ - 0.6, 0, 0 ] );
		parts.box( body, [ 0.62, 0.08, 1.1 ], [ s * 0.97, 1.2, steer + 0.15 ] );
		parts.box( body, [ 0.62, 0.45, 0.06 ], [ s * 0.97, 0.8, steer + 0.67 ] );

	}

	// Cab, glazed above the waist, with mirrors, a beacon bar and the exhaust stack behind it.
	const c0 = front + 2.3;
	const c1 = c0 + 1.75;
	parts.box( body, [ 2.35, 0.95, 1.75 ], [ 0, 1.15, ( c0 + c1 ) / 2 ] );
	parts.box( GLASS(), [ 2.27, 0.75, 1.67 ], [ 0, 2.1, ( c0 + c1 ) / 2 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const z of [ c0 + 0.04, c1 - 0.25 ] ) parts.box( body, [ 0.08, 0.75, z === c0 + 0.04 ? 0.08 : 0.5 ], [ sx * 1.14, 2.1, z ] );
	parts.box( body, [ 2.35, 0.75, 0.06 ], [ 0, 2.1, c1 - 0.03 ] );
	parts.box( body, [ 2.37, 0.2, 1.77 ], [ 0, 2.85, ( c0 + c1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( DARK(), [ 0.04, 0.34, 0.2 ], [ s * 1.33, 2.2, c0 + 0.1 ] );
		parts.rod( DARK(), [ s * 1.18, 2.4, c0 + 0.1 ], [ s * 1.31, 2.4, c0 + 0.1 ], 0.015, 5 );

	}

	parts.box( AMBER(), [ 0.8, 0.1, 0.14 ], [ 0, 3.05, ( c0 + c1 ) / 2 ] );
	parts.rod( BRIGHT(), [ 0.95, 1.3, c1 + 0.12 ], [ 0.95, 3.3, c1 + 0.12 ], 0.08, 12 );
	return { cabBack: c1, frameTop };

}

// A pipe bolster: a beam across with a stake at each end and a rubber pad, its top at y.
function bolster( parts, z, y ) {

	parts.box( DARK(), [ 2.44, 0.28, 0.3 ], [ 0, y - 0.28, z ] );
	parts.box( RUBBER(), [ 1.9, 0.03, 0.32 ], [ 0, y - 0.03, z ] );
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.12, 0.85, 0.14 ], [ s * 1.16, y - 0.1, z ] );

}

// A pipe stringing outfit: a tandem-axle day-cab tractor with a bolster on a turntable over its
// drive axles and a headache rack behind the cab, and a tandem pole trailer dolly 19.5 m behind
// it on its reach, carrying three 80 ft joints of 36 in pipe (two down, one nested on top) chained
// down at each bolster, with a red flag on the overhang. About 28.6 m long and 3.2 m high.
function stringingTruck() {

	const parts = new Parts();
	const front = - 14.3;
	const rear = front + 5.6;
	const { cabBack, frameTop } = tractor( parts, { colour: 0xb3262a, front, rear, back: rear + 1.2 } );

	// Headache rack behind the cab.
	const rack = cabBack + 0.25;
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.1, 3.35 - frameTop, 0.1 ], [ s * 1.05, frameTop, rack ] );
	for ( const y of [ 2.0, 3.25 ] ) parts.box( DARK(), [ 2.2, 0.1, 0.1 ], [ 0, y, rack ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( DARK(), [ 0.04, 1.25, 0.04 ], [ - 0.9 + i * 0.3, 2.05, rack ] );

	// The bolster on its turntable over the drives, the reach back to the dolly.
	const bed = 1.5;
	parts.cylinder( DARK(), 0.45, bed - 0.28 - frameTop, [ 0, frameTop, rear ], 18 );
	bolster( parts, rear, bed );
	const pipeFront = rack + 0.2;
	const dolly = pipeFront + 19.5;
	member( parts, DARK(), [ 0.2, 0.2 ], [ 0, frameTop - 0.05, rear + 0.3 ], [ 0, 0.95, dolly - 1.2 ] );

	// The dolly: a short frame, two axles of duals, its turntable and bolster, lamps and mud flaps.
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( DARK(), [ 0.12, 0.25, 2.8 ], [ x, 0.85, dolly ] );
	for ( const z of [ - 0.4, 0.4 ] ) parts.box( DARK(), [ 1.0, 0.15, 0.12 ], [ 0, 0.95, dolly + z ] );
	for ( const z of [ dolly - 0.66, dolly + 0.66 ] ) {

		parts.rod( DARK(), [ - 0.95, R, z ], [ 0.95, R, z ], 0.07, 8 );
		for ( const s of [ - 1, 1 ] ) for ( const d of [ - 0.14, 0.14 ] ) tyre( parts, R, 0.26, [ s * ( TRUCK_WIDTH / 2 - 0.29 ) + d, R, z ] );

	}

	for ( const s of [ - 1, 1 ] ) {

		parts.box( DARK(), [ 0.62, 0.06, 2.6 ], [ s * 0.97, 1.12, dolly ] );
		parts.box( BLACK(), [ 0.55, 0.65, 0.02 ], [ s * ( TRUCK_WIDTH / 2 - 0.3 ), 0.2, dolly + 1.3 ] );
		parts.box( RED_LAMP(), [ 0.14, 0.08, 0.03 ], [ s * 1.15, 1.0, dolly + 1.32 ] );

	}

	parts.cylinder( DARK(), 0.45, bed - 0.28 - 1.1, [ 0, 1.1, dolly ], 18 );
	bolster( parts, dolly, bed );

	// The pipe: two joints side by side and one nested on top, chained down at each bolster.
	const pitch = PIPE_R + 0.01;
	const yc = bed + PIPE_R;
	const yt = yc + Math.sqrt( ( 2 * pitch ) ** 2 - pitch ** 2 );
	const mid = pipeFront + JOINT / 2;
	for ( const x of [ - pitch, pitch ] ) pipe( parts, [ x, yc, mid ], JOINT );
	pipe( parts, [ 0, yt, mid ], JOINT );
	const o = PIPE_R + 0.02;
	const half = [ [ 1.16, bed + 0.2 ], [ pitch + o * Math.cos( 30 * DEG ), yc + o * Math.sin( 30 * DEG ) ], [ o * Math.cos( 60 * DEG ), yt + o * Math.sin( 60 * DEG ) ] ];
	const chain = [ ...half, [ 0, yt + o ], ...half.slice().reverse().map( ( [ x, y ] ) => [ - x, y ] ) ];
	for ( const z of [ rear + 0.25, dolly + 0.25 ] ) parts.path( STEEL(), chain.map( ( [ x, y ] ) => [ x, y, z ] ), 0.012, 5 );

	// The red flag tied to the end of the overhang.
	parts.box( paint( 0xd0202a ), [ 0.45, 0.45, 0.01 ], [ 0, yt + PIPE_R - 0.47, pipeFront + JOINT + 0.01 ] );
	return parts.build();

}

// --- wheel ditcher -----------------------------------------------------------------------------

// A large crawler bucket wheel trencher for mainline ditch, about 12 m long, 5.3 m across with
// its spoil conveyor out and 5.3 m high: the tractor with its engine and cab ahead, and behind it
// the rim-type digging wheel, 5 m across with 18 buckets and teeth for a 36 in ditch to 8 ft deep,
// in its frame on two lift rams, raised clear of the ground to travel. The cross conveyor runs
// through the open centre of the wheel and throws the spoil out to the right of the ditch.
function wheelDitcher() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();

	// Tractor: two crawler tracks, the main frame, the engine hood, radiator and stack, the cab.
	for ( const x of [ - 1.3, 1.3 ] ) crawler( parts, body, { length: 5.0, height: 1.1, width: 0.75, x, z: - 2.3 } );
	parts.box( dark, [ 1.85, 0.7, 6.0 ], [ 0, 0.6, - 2.0 ] );
	parts.box( body, [ 3.35, 0.15, 5.6 ], [ 0, 1.1, - 2.5 ] );
	parts.box( body, [ 1.9, 1.35, 3.0 ], [ 0.35, 1.25, - 4.0 ] );
	parts.box( dark, [ 1.6, 1.1, 0.05 ], [ 0.35, 1.35, - 5.52 ] );
	for ( let i = 0; i < 9; i ++ ) parts.box( STEEL(), [ 1.56, 0.03, 0.02 ], [ 0.35, 1.42 + i * 0.11, - 5.56 ] );
	parts.cylinder( dark, 0.09, 1.0, [ 0.9, 2.6, - 3.4 ], 12 );
	parts.box( dark, [ 0.9, 0.6, 1.2 ], [ 1.15, 1.25, - 1.6 ] ); // hydraulic tank
	cab( parts, body, [ 1.4, 2.1, 1.7 ], [ - 0.85, 1.25, - 1.6 ] );
	parts.sphere( AMBER(), 0.08, [ - 0.85, 3.42, - 1.2 ] );
	parts.box( dark, [ 3.0, 0.4, 0.3 ], [ 0, 0.7, - 5.6 ] ); // front bumper / tow beam

	// The wheel frame: a curved side frame each side round the front and top of the wheel carrying
	// the drive and guide rollers that bear on the rims, braced back to pivots behind the cab and
	// lifted by a ram each side.
	const hub = [ 0, 2.85, 3.5 ];
	const wheelR = 2.5;
	const half = 18 * IN; // the buckets cut a 36 in ditch
	const band = wheelR - 0.35;
	const onBand = ( x, a ) => [ x, hub[ 1 ] + Math.sin( a * DEG ) * band, hub[ 2 ] + Math.cos( a * DEG ) * band ];
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( half + 0.2 );
		for ( let a = 50; a < 215; a += 20 ) member( parts, body, [ 0.2, 0.35 ], onBand( x, a ), onBand( x, Math.min( 215, a + 20 ) ) );
		parts.box( dark, [ 0.3, 1.0, 0.6 ], [ x, 1.25, 0.0 ] );
		member( parts, body, [ 0.22, 0.4 ], [ x, 2.0, 0.0 ], onBand( x, 150 ) );
		member( parts, body, [ 0.22, 0.4 ], [ x, 1.5, 0.0 ], onBand( x, 205 ) );
		for ( const a of [ 70, 130, 190 ] ) {

			const [ , y, z ] = onBand( x, a );
			parts.rod( dark, [ x - 0.16, y, z ], [ x + 0.16, y, z ], 0.2, 12 );

		}

		ram( parts, 0.12, [ s * 0.6, 2.3, - 0.6 ], onBand( x, 115 ) );

	}

	// The wheel: two rims, buckets between them all round with teeth on their lips.
	const rimPoints = [];
	for ( let i = 0; i <= 36; i ++ ) {

		const a = i / 36 * Math.PI * 2;
		rimPoints.push( [ Math.cos( a ), Math.sin( a ) ] );

	}

	for ( const x of [ - half, half ] ) {

		for ( const r of [ wheelR - 0.12, wheelR - 0.4 ] ) parts.path( STEEL(), rimPoints.map( ( [ c, s ] ) => [ x, hub[ 1 ] + s * r, hub[ 2 ] + c * r ] ), 0.06, 6, false );

	}

	const buckets = 18;
	for ( let i = 0; i < buckets; i ++ ) {

		const a = i / buckets * Math.PI * 2;
		const [ c, s ] = [ Math.cos( a ), Math.sin( a ) ];
		const at = r => [ 0, hub[ 1 ] + s * r, hub[ 2 ] + c * r ];
		parts.block( body, [ 2 * half, 0.4, 0.5 ], at( wheelR - 0.2 ), [ - a, 0, 0 ] );
		// Teeth at the leading lip (the wheel turns up the back of the ditch, anticlockwise seen from +x).
		const lip = a + 0.11;
		for ( const x of [ - 0.4, 0, 0.4 ] ) {

			const p = [ x, hub[ 1 ] + Math.sin( lip ) * ( wheelR + 0.02 ), hub[ 2 ] + Math.cos( lip ) * ( wheelR + 0.02 ) ];
			parts.block( dark, [ 0.08, 0.1, 0.18 ], p, [ - lip, 0, 0 ] );

		}

	}

	// Cross conveyor through the open middle of the wheel, out to the right.
	conveyor( parts, [ - 1.2, hub[ 1 ] - 0.3, hub[ 2 ] ], [ 3.4, hub[ 1 ] + 0.5, hub[ 2 ] ], 0.75 );
	member( parts, dark, [ 0.1, 0.1 ], [ 1.1, hub[ 1 ] + 1.3, hub[ 2 ] ], [ 3.1, hub[ 1 ] + 0.55, hub[ 2 ] ] );
	parts.rod( dark, [ half + 0.2, hub[ 1 ] + 0.6, hub[ 2 ] ], [ 1.1, hub[ 1 ] + 1.3, hub[ 2 ] ], 0.05, 6 );
	return parts.build();

}

// --- bending machine ---------------------------------------------------------------------------

// A field cold-bend machine for pipe up to 36 in on its own crawler tracks, about 12.1 m long,
// 3.4 m wide and 3.4 m high: the pipe runs through it along its length between two heavy side
// plates holding the bending die overhead, clamped up into the die by the pin-up shoe at the
// front, and is bent by lifting its back end on the long truss stiffback with the two rams under
// it. The power pack on the right, the operator's station on the left, and the internal bending
// mandrel parked on its cradle ahead of the machine, where it goes into the pipe.
function bendingMachine() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const pipeY = 1.75;
	const pipeBottom = pipeY - PIPE_R;

	// Tracks and the deck.
	for ( const x of [ - 1.35, 1.35 ] ) crawler( parts, body, { length: 4.4, height: 0.85, width: 0.6, x, z: - 2.0 } );
	parts.box( dark, [ 2.1, 0.45, 4.6 ], [ 0, 0.4, - 2.0 ] );
	parts.box( body, [ 3.2, 0.15, 5.1 ], [ 0, 0.85, - 2.05 ] );

	// Side plates and the die between them, its underside curved up towards the back.
	const die = z => pipeY + PIPE_R + ( z + 4.0 ) ** 2 / 24;
	const sidePlate = [ [ - 4.3, 1.0 ], [ 0.3, 1.0 ], [ 0.3, 3.0 ], [ - 0.2, 3.3 ], [ - 4.3, 3.3 ] ];
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( body, sidePlate, 0.16, s * 0.76 );
		// Stiffening ribs on the outside.
		for ( const z of [ - 3.6, - 2.2, - 0.8 ] ) parts.box( body, [ 0.1, 2.1, 0.12 ], [ s * 0.89, 1.0, z ] );

	}

	const underside = [];
	for ( let i = 0; i <= 12; i ++ ) {

		const z = - 4.1 + 4.2 * i / 12;
		underside.push( [ z, die( z ) ] );

	}

	parts.prism( dark, [ ...underside, [ 0.1, 3.2 ], [ - 4.1, 3.2 ] ], 1.2 );
	for ( const z of [ - 4.0, 0.0 ] ) parts.rod( STEEL(), [ - 0.95, 2.95, z ], [ 0.95, 2.95, z ], 0.1, 12 );

	// The pin-up shoe under the front of the die on its two rams.
	parts.box( dark, [ 1.2, 0.25, 0.9 ], [ 0, pipeBottom - 0.25, - 3.6 ] );
	for ( const x of [ - 0.35, 0.35 ] ) ram( parts, 0.08, [ x, 1.0, - 3.6 ], [ x, pipeBottom - 0.25, - 3.6 ] );
	// The rear roller cradle at the back of the plates.
	parts.rod( RUBBER(), [ - 0.5, pipeBottom - 0.1, 0.0 ], [ 0.5, pipeBottom - 0.1, 0.0 ], 0.1, 12 );

	// The stiffback: a truss beam reaching back from a hinge at the deck, its shoe at the far end,
	// lifted by two rams from under the deck.
	const top = pipeBottom - 0.15;
	const z0 = 0.5;
	const z1 = 6.0;
	for ( const x of [ - 0.35, 0.35 ] ) {

		member( parts, body, [ 0.14, 0.2 ], [ x, top, z0 ], [ x, top, z1 ] );
		member( parts, body, [ 0.12, 0.14 ], [ x, 0.55, z0 + 0.2 ], [ x, top - 0.25, z1 ] );
		for ( let i = 0; i <= 6; i ++ ) {

			const z = z0 + 0.3 + i * ( z1 - z0 - 0.5 ) / 6;
			const y = 0.55 + ( top - 0.25 - 0.55 ) * ( z - z0 - 0.2 ) / ( z1 - z0 - 0.2 );
			parts.rod( body, [ x, y, z ], [ x, top, z ], 0.04, 6 );
			if ( i < 6 ) parts.rod( body, [ x, y, z ], [ x, top, z + ( z1 - z0 - 0.5 ) / 6 ], 0.03, 6 );

		}

		ram( parts, 0.1, [ x, 0.45, 0.0 ], [ x, top - 0.05, 2.0 ] );

	}

	for ( let z = z0 + 0.4; z < z1; z += 1.1 ) parts.box( body, [ 0.84, 0.1, 0.1 ], [ 0, top - 0.05, z ] );
	parts.box( dark, [ 0.6, 0.15, 0.6 ], [ 0, top - 0.02, z1 - 0.4 ] );
	parts.box( dark, [ 0.4, 0.5, 0.5 ], [ 0, 0.55, 0.45 ] ); // hinge

	// Power pack on the right with its louvres, exhaust and hydraulic tank.
	parts.box( body, [ 0.85, 1.3, 2.0 ], [ 1.3, 1.0, - 0.5 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 0.02, 0.04, 1.2 ], [ 1.73, 1.4 + i * 0.1, - 0.6 ] );
	parts.cylinder( dark, 0.06, 0.65, [ 1.45, 2.3, - 0.1 ], 10 );
	parts.box( dark, [ 0.7, 0.6, 0.8 ], [ 1.3, 1.0, - 2.2 ] );

	// Operator's station on the left: a platform, the seat facing across at the machine, levers
	// and a canopy.
	parts.box( body, [ 0.7, 0.08, 1.6 ], [ - 1.35, 1.0, - 0.7 ] );
	seat( parts, [ - 1.4, 1.55, - 0.4 ] );
	parts.box( dark, [ 0.45, 0.85, 0.3 ], [ - 1.25, 1.08, - 1.1 ] );
	for ( let i = 0; i < 4; i ++ ) parts.rod( BLACK(), [ - 1.4 + i * 0.1, 1.93, - 1.1 ], [ - 1.4 + i * 0.1, 2.15, - 1.18 ], 0.012, 5 );
	for ( const z of [ - 1.45, 0.05 ] ) parts.box( body, [ 0.07, 2.0, 0.07 ], [ - 1.65, 1.08, z ] );
	parts.box( body, [ 0.75, 0.06, 1.6 ], [ - 1.35, 3.05, - 0.7 ] );

	// The mandrel parked on its cradle ahead: a steel cylinder of shoes on rollers with its pull rod.
	for ( const x of [ - 0.35, 0.35 ] ) member( parts, body, [ 0.12, 0.16 ], [ x, 0.95, - 4.5 ], [ x, pipeY - 0.45, - 5.6 ] );
	parts.box( dark, [ 0.9, 0.1, 0.25 ], [ 0, pipeY - 0.5, - 5.55 ] );
	parts.box( dark, [ 0.9, 0.1, 0.25 ], [ 0, pipeY - 0.5, - 4.75 ] );
	parts.rod( dark, [ 0, pipeY, - 6.05 ], [ 0, pipeY, - 4.4 ], 0.38, 18 );
	for ( const z of [ - 5.75, - 5.3, - 4.85 ] ) parts.rod( STEEL(), [ 0, pipeY, z - 0.08 ], [ 0, pipeY, z + 0.08 ], 0.41, 18 );
	parts.rod( BRIGHT(), [ 0, pipeY, - 4.4 ], [ 0, pipeY, - 3.9 ], 0.06, 8 );
	return parts.build();

}

// --- facing machine on carrier -----------------------------------------------------------------

// A rubber-track carrier, about 6.7 m long, 2.5 m wide and 3.1 m high, set up for the front end
// crew: its cab and engine at the back, a hydraulic jib at the front holding the end facing
// (bevelling) machine for 36 in pipe ready to go into a pipe end (the clamp nose, the housing and
// the cutter head), and the internal line-up clamp and its reach rod on a cradle on the deck.
function facingCarrier() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();

	for ( const x of [ - 0.9, 0.9 ] ) crawler( parts, dark, { length: 4.2, height: 0.7, width: 0.6, x, z: 0.4, rubber: true } );
	parts.box( dark, [ 1.3, 0.35, 4.0 ], [ 0, 0.35, 0.4 ] );
	parts.box( body, [ 2.4, 0.15, 4.6 ], [ 0, 0.7, 0.3 ] );

	// Cab at the back left, engine at the back right.
	cab( parts, body, [ 1.05, 1.9, 1.2 ], [ - 0.65, 0.85, 1.9 ] );
	parts.box( body, [ 1.2, 1.1, 1.4 ], [ 0.58, 0.85, 1.85 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.02, 0.04, 0.9 ], [ 1.19, 1.2 + i * 0.1, 1.85 ] );
	parts.cylinder( dark, 0.05, 0.6, [ 0.85, 1.95, 2.2 ], 10 );
	parts.sphere( AMBER(), 0.07, [ - 0.65, 2.82, 2.2 ] );

	// The internal line-up clamp on its cradle: a long frame of rings with two rows of shoes, the
	// drive wheels and the reach rod back over the cab roof line.
	const clampY = 1.4;
	for ( const z of [ - 0.9, 0.5 ] ) parts.box( dark, [ 1.0, clampY - 0.85 - 0.35, 0.2 ], [ 0, 0.85, z ] );
	parts.rod( STEEL(), [ 0, clampY, - 1.3 ], [ 0, clampY, 0.9 ], 0.3, 16 );
	for ( const z of [ - 1.1, - 0.8, 0.4, 0.7 ] ) parts.rod( dark, [ 0, clampY, z - 0.06 ], [ 0, clampY, z + 0.06 ], 0.4, 16 );
	parts.rod( paint( 0x2e5aa8 ), [ 0, clampY, - 0.45 ], [ 0, clampY, 0.05 ], 0.36, 16 );
	parts.rod( BRIGHT(), [ 0, clampY, 0.9 ], [ 0, clampY, 1.1 ], 0.05, 8 );

	// The jib on the front: a post, a boom reaching forward and a hanger down to the machine.
	const post = - 1.7;
	parts.box( dark, [ 0.5, 0.3, 0.5 ], [ 0, 0.85, post ] );
	parts.box( body, [ 0.3, 1.5, 0.3 ], [ 0, 1.15, post ] );
	member( parts, body, [ 0.25, 0.3 ], [ 0, 2.55, post ], [ 0, 2.75, - 3.4 ] );
	ram( parts, 0.07, [ 0, 1.4, post - 0.1 ], [ 0, 2.55, - 2.7 ] );
	const hang = [ 0, 2.6, - 3.3 ];
	parts.rod( dark, hang, [ 0, 1.55, - 3.3 ], 0.05, 8 );

	// The facing machine: housing with its motor on top, the cutter head behind, the clamp nose
	// ahead (it goes into the pipe end).
	const y = 1.15;
	parts.rod( body, [ 0, y, - 3.75 ], [ 0, y, - 2.85 ], 0.42, 18 );
	parts.box( dark, [ 0.4, 0.3, 0.5 ], [ 0, y + 0.38, - 3.3 ] );
	parts.rod( BRIGHT(), [ 0, y, - 3.85 ], [ 0, y, - 3.75 ], 0.47, 20 );
	parts.rod( STEEL(), [ 0, y, - 4.6 ], [ 0, y, - 3.85 ], 0.36, 16 );
	for ( const z of [ - 4.45, - 4.1 ] ) parts.rod( dark, [ 0, y, z - 0.05 ], [ 0, y, z + 0.05 ], 0.395, 16 );
	parts.rod( dark, [ 0, y, - 2.85 ], [ 0, y, - 2.4 ], [ 0.22, 0.12 ], 12 );
	parts.path( BLACK(), [ [ 0.12, y + 0.68, - 3.15 ], [ 0.17, 2.55, - 3.0 ], [ 0.17, 2.6, - 1.9 ], [ 0.17, 1.3, - 1.85 ], [ 0.3, 0.86, - 1.4 ] ], 0.03, 6 );
	return parts.build();

}

// --- welding shack -----------------------------------------------------------------------------

// A pipeline welding shack: a steel-framed, sheeted box 10 ft long and 8 ft wide on two skid
// runners, open at the bottom of each end in an arch so it sits over a 36 in pipe on skids with
// the weld joint in the middle, a door on the right, a gently peaked roof with a light inside and
// a lifting bail on top for the sideboom that moves it joint to joint.
function weldingShack() {

	const parts = new Parts();
	const sheet = paint( 0xdad7cf );
	const frame = paint( 0x2f4f8f );
	const length = 10 * FT;
	const width = 8 * FT;
	const wall = 2.3;
	const peak = 2.55;
	const w = width / 2;
	const t = 0.03;

	// Skid runners and the frame: corner posts, top plates and bottom rails along the sides.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.12, 0.15, length + 0.3 ], [ s * ( w - 0.06 ), 0, 0 ] );
	// (The frame stands a little proud of the sheeting so the two don't flicker.)
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( frame, [ 0.09, wall, 0.09 ], [ sx * ( w - 0.04 ), 0.15, sz * ( length / 2 - 0.04 ) ] );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.1, 0.09, length + 0.01 ], [ s * ( w - 0.045 ), 0.15 + wall - 0.09, 0 ] );

	// The ends, each with the arch the pipe passes through.
	const opening = 0.68;
	const archTop = 1.55;
	const end = [ [ - w, 0.15 ], [ - opening, 0.15 ], [ - opening, archTop - opening ], ...arc( [ 0, archTop - opening ], opening, 180, 0, 10 ).slice( 1, - 1 ), [ opening, archTop - opening ], [ opening, 0.15 ], [ w, 0.15 ], [ w, wall + 0.15 ], [ 0, peak + 0.15 ], [ - w, wall + 0.15 ] ];
	for ( const z of [ - length / 2, length / 2 - t ] ) alongZ( parts, sheet, end, z, z + t );
	for ( const z of [ - length / 2 - 0.01, length / 2 + 0.01 ] ) parts.path( frame, [ [ - opening, 0.15, z ], [ - opening, archTop - opening, z ], ...arc( [ 0, archTop - opening ], opening, 180, 0, 10 ).map( ( [ x, y ] ) => [ x, y, z ] ), [ opening, 0.15, z ] ], 0.03, 6, false );

	// Sides: the left solid, the right with a door near the back.
	parts.box( sheet, [ t, wall, length ], [ - w + t / 2, 0.15, 0 ] );
	const door = [ 0.9, 2.0 ];
	const doorZ = 0.6;
	parts.box( sheet, [ t, wall, length / 2 + doorZ - door[ 0 ] / 2 ], [ w - t / 2, 0.15, - length / 4 + ( doorZ - door[ 0 ] / 2 ) / 2 ] );
	const behind = length / 2 - doorZ - door[ 0 ] / 2;
	parts.box( sheet, [ t, wall, behind ], [ w - t / 2, 0.15, length / 2 - behind / 2 ] );
	parts.box( sheet, [ t, wall - door[ 1 ], door[ 0 ] ], [ w - t / 2, 0.15 + door[ 1 ], doorZ ] );
	parts.box( paint( 0x9a2a22 ), [ t, door[ 1 ] - 0.02, door[ 0 ] - 0.04 ], [ w + 0.005, 0.16, doorZ ] );
	parts.box( DARK(), [ 0.03, 0.03, 0.15 ], [ w + 0.03, 1.1, doorZ - 0.3 ] );

	// The roof, peaked along the length, and the lifting bail.
	const slope = Math.atan2( peak - wall, w );
	const half = Math.hypot( w, peak - wall ) + 0.05;
	for ( const s of [ - 1, 1 ] ) parts.block( sheet, [ half, 0.03, length + 0.1 ], [ s * w / 2, 0.15 + ( wall + peak ) / 2 + 0.01, 0 ], [ 0, 0, - s * slope ] );
	for ( const z of [ - 0.7, 0.7 ] ) parts.path( frame, [ [ - 0.35, peak + 0.13, z ], [ - 0.1, peak + 0.45, z ], [ 0.1, peak + 0.45, z ], [ 0.35, peak + 0.13, z ] ], 0.025, 6 );
	parts.rod( frame, [ 0, peak + 0.45, - 0.7 ], [ 0, peak + 0.45, 0.7 ], 0.03, 6 );
	parts.box( HEADLAMP(), [ 0.6, 0.05, 0.12 ], [ 0, wall + 0.05, 0 ] );
	return parts.build();

}

// --- welding rig truck -------------------------------------------------------------------------

// A pipeline rig welder: a white 1-ton regular cab dually with a 9 ft steel rig bed, a headache
// rack with the welding leads coiled on it, two engine-drive welders side by side behind the
// cab, a bottle rack with oxygen and acetylene cylinders at the back left, a tool box at the back
// right and a vise on the tailgate. About 6.3 m long, 2.4 m wide and 2.4 m high.
function weldingRig() {

	const parts = new Parts();
	const body = paint( 0xeceae4 );
	const dark = DARK();
	const front = - 3.15;
	const r = 0.4;

	// Frame, bumpers and wheels: singles in front, duals at the back.
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( dark, [ 0.08, 0.22, 5.9 ], [ x, 0.55, front + 3.05 ] );
	parts.box( BRIGHT(), [ 2.0, 0.25, 0.2 ], [ 0, 0.42, front + 0.1 ] );
	const axles = [ front + 1.0, front + 4.65 ];
	for ( const z of axles ) parts.rod( dark, [ - 0.85, r, z ], [ 0.85, r, z ], 0.06, 8 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, r, 0.25, [ s * 0.86, r, axles[ 0 ] ], BRIGHT() );
		for ( const d of [ - 0.13, 0.13 ] ) tyre( parts, r, 0.23, [ s * 0.96 + d, r, axles[ 1 ] ], BRIGHT() );

	}

	// Hood, grille and lamps, front fenders.
	parts.prism( body, [ [ front + 0.2, 0.55 ], [ front + 0.2, 1.3 ], [ front + 0.3, 1.38 ], [ front + 1.75, 1.45 ], [ front + 1.75, 0.55 ] ], 1.95 );
	parts.box( dark, [ 1.3, 0.5, 0.04 ], [ 0, 0.75, front + 0.19 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( HEADLAMP(), [ 0.25, 0.15, 0.03 ], [ s * 0.78, 1.05, front + 0.2 ] );

	// Cab, glazed above the waist, mirrors and an amber beacon.
	const c0 = front + 1.75;
	const c1 = c0 + 1.5;
	parts.prism( body, [ [ c0, 0.55 ], [ c0, 1.45 ], [ c1, 1.45 ], [ c1, 0.55 ] ], 2.0 );
	parts.prism( GLASS(), [ [ c0 + 0.02, 1.45 ], [ c0 + 0.55, 2.0 ], [ c1 - 0.08, 2.0 ], [ c1 - 0.08, 1.45 ] ], 1.9 );
	parts.box( body, [ 1.96, 0.05, c1 - c0 - 0.55 ], [ 0, 2.0, ( c0 + 0.55 + c1 ) / 2 ] );
	parts.box( body, [ 1.94, 0.55, 0.06 ], [ 0, 1.45, c1 - 0.03 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.04, 0.3, 0.22 ], [ s * 1.15, 1.55, c0 + 0.25 ] );
		parts.rod( dark, [ s * 1.0, 1.75, c0 + 0.25 ], [ s * 1.14, 1.75, c0 + 0.25 ], 0.015, 5 );

	}

	parts.box( AMBER(), [ 0.2, 0.12, 0.2 ], [ 0, 2.05, c0 + 1.1 ] );

	// The rig bed: a flat steel deck with a rub rail, the headache rack with the leads on it.
	const b0 = c1 + 0.08;
	const b1 = b0 + 9 * FT;
	const deck = 1.0;
	parts.box( dark, [ 2.4, 0.12, b1 - b0 ], [ 0, deck - 0.12, ( b0 + b1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.5, 0.45, 1.25 ], [ s * 0.95, deck - 0.6, axles[ 1 ] - 1.25 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.15, 0.08, 0.03 ], [ s * 1.05, deck - 0.1, b1 + 0.015 ] );
	const rack = b0 + 0.08;
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.08, 1.3, 0.08 ], [ s * 1.12, deck, rack ] );
	parts.box( dark, [ 2.3, 0.08, 0.08 ], [ 0, deck + 1.25, rack ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.03, 1.2, 0.03 ], [ - 0.9 + i * 0.36, deck + 0.05, rack ] );
	for ( const s of [ - 1, 1 ] ) {

		// A coil of welding lead on a hanger each side of the rack.
		parts.add( RUBBER(), new TorusGeometry( 0.28, 0.05, 6, 18 ), _m.makeTranslation( s * 0.6, deck + 0.85, rack - 0.12 ) );

	}

	// Two engine-drive welders side by side: cabinet, control panel to the back, exhaust and lifting eye.
	const weld0 = b0 + 0.3;
	for ( const [ i, s ] of [ - 1, 1 ].entries() ) {

		const x = s * 0.43;
		const colour = paint( i ? 0x2e5aa8 : 0xb3262a );
		parts.box( dark, [ 0.7, 0.12, 1.5 ], [ x, deck, weld0 + 0.75 ] );
		parts.box( colour, [ 0.66, 0.85, 1.45 ], [ x, deck + 0.12, weld0 + 0.75 ] );
		parts.box( dark, [ 0.5, 0.4, 0.02 ], [ x, deck + 0.4, weld0 + 1.48 ] );
		for ( let j = 0; j < 5; j ++ ) parts.box( dark, [ 0.02, 0.03, 0.8 ], [ x + s * 0.335, deck + 0.4 + j * 0.08, weld0 + 0.6 ] );
		parts.cylinder( dark, 0.04, 0.2, [ x - s * 0.15, deck + 0.97, weld0 + 0.3 ], 8 );
		parts.box( STEEL(), [ 0.04, 0.12, 0.12 ], [ x, deck + 0.97, weld0 + 0.75 ] );

	}

	// Bottle rack at the back left with oxygen (green) and acetylene (red) cylinders chained in it.
	const rackZ = b1 - 0.35;
	parts.box( dark, [ 0.65, 0.05, 0.45 ], [ - 0.82, deck, rackZ ] );
	for ( const x of [ - 1.12, - 0.52 ] ) parts.box( dark, [ 0.04, 1.1, 0.04 ], [ x, deck, rackZ + 0.2 ] );
	for ( const y of [ 0.5, 1.05 ] ) parts.box( dark, [ 0.64, 0.04, 0.04 ], [ - 0.82, deck + y, rackZ + 0.2 ] );
	for ( const [ x, colour, h ] of [ [ - 0.98, 0x2f6b3a, 1.3 ], [ - 0.66, 0xa52a26, 1.05 ] ] ) {

		parts.cylinder( paint( colour ), 0.12, h, [ x, deck + 0.05, rackZ ], 14 );
		parts.sphere( paint( colour ), 0.12, [ x, deck + 0.05 + h, rackZ ], [ 12, 6 ] );
		parts.cylinder( BRIGHT(), 0.04, 0.12, [ x, deck + 0.15 + h, rackZ ], 8 );

	}

	// Tool box at the back right and a vise on a post at the back.
	parts.box( dark, [ 0.75, 0.55, 0.55 ], [ 0.75, deck, rackZ - 0.05 ] );
	parts.box( STEEL(), [ 0.76, 0.03, 0.56 ], [ 0.75, deck + 0.55, rackZ - 0.05 ] );
	parts.cylinder( dark, 0.05, 0.75, [ 0.05, deck, b1 - 0.12 ], 8 );
	parts.box( paint( 0x3b5c8c ), [ 0.25, 0.15, 0.18 ], [ 0.05, deck + 0.75, b1 - 0.12 ] );
	return parts.build();

}

// --- vacuum lifter excavator -------------------------------------------------------------------

// A crawler excavator's carrier without its front: tracks, the swing ring, the house (deck, the
// counterweight curved to the tail swing radius, the engine hood and the right-hand tank
// compartment) and the cab on the left. Front at -Z, the swing axis at x = z = 0.
function carrier( parts, body, { track, swing, width, front, tail, deck, hood, counterweight } ) {

	for ( const s of [ - 1, 1 ] ) crawler( parts, body, { length: track.length, height: track.height, width: track.shoe, x: s * ( track.width - track.shoe ) / 2 } );
	parts.box( DARK(), [ track.width - track.shoe * 1.5, track.height * 0.45, track.length * 0.35 ], [ 0, track.height * 0.3, 0 ] );
	parts.cylinder( BLACK(), width * 0.32, swing - track.height, [ 0, track.height, 0 ], 24 );
	parts.box( DARK(), [ width, deck - swing, tail - front - 0.4 ], [ 0, swing, ( front + tail - 0.4 ) / 2 ] );
	const W = width / 2;
	const back = Math.sqrt( tail * tail - W * W ) - 0.6;
	const outline = [ [ - W, back ], [ W, back ] ];
	for ( let i = 0; i <= 12; i ++ ) {

		const x = MathUtils.lerp( W, - W, i / 12 );
		outline.push( [ x, Math.sqrt( tail * tail - x * x ) ] );

	}

	const shape = new Shape( outline.map( ( [ x, z ] ) => new Vector2( x, - z ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: counterweight - swing, bevelEnabled: false, curveSegments: 6 } );
	geometry.rotateX( - Math.PI / 2 );
	geometry.translate( 0, swing, 0 );
	parts.add( body, geometry );
	parts.box( body, [ width, hood - deck, back - 0.4 ], [ 0, deck, back / 2 ] );
	parts.box( BLACK(), [ width * 0.5, 0.02, 1.0 ], [ width * 0.12, hood, back * 0.6 ] );
	parts.cylinder( BLACK(), 0.07, 0.45, [ width * 0.3, hood, back * 0.4 ], 10 );
	parts.box( body, [ W - 0.55, hood - deck - 0.3, - front - 0.2 ], [ ( W + 0.55 ) / 2, deck, front / 2 - 0.1 ] );

}

// A 30 t class crawler excavator (about 9.7 m long with its front out, 3.2 m wide) with a
// vacuum pipe lifter on a rotator at the end of its stick: the lifter's engine and vacuum pump
// in a yellow housing, its beam and the curved, rubber-sealed pad for 36 in pipe, held across
// the machine's front at the height of a joint strung on its skids, set down on the pipe to
// pick it.
function vacuumExcavator() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	carrier( parts, body, {
		track: { length: 4.65, width: 3.2, shoe: 0.7, height: 0.95 },
		swing: 1.05, width: 3.0, front: - 2.0, tail: 3.1, deck: 1.35, hood: 2.5, counterweight: 2.45,
	} );
	cab( parts, body, [ 1.0, 1.65, 1.9 ], [ - 0.98, 1.35, - 1.05 ] );

	// The front: boom (bent part way up), stick hanging nearly straight down, rams and hoses.
	const foot = new Vector3( 0.15, 2.1, - 1.0 );
	const dir = a => new Vector3( 0, Math.sin( a * DEG ), - Math.cos( a * DEG ) );
	const behind = a => new Vector3( 0, Math.cos( a * DEG ), Math.sin( a * DEG ) );
	const arm = 24; // the boom's upper part, raised so the pad comes down onto a strung joint
	const knee = foot.clone().addScaledVector( dir( 50 ), 3.6 );
	const tip = knee.clone().addScaledVector( dir( arm ), 2.7 );
	const end = tip.clone().addScaledVector( dir( - 82 ), 3.1 );
	member( parts, body, [ 0.55, 0.8 ], foot, knee );
	member( parts, body, [ 0.5, 0.7 ], knee, tip );
	member( parts, body, [ 0.4, 0.55 ], tip.clone().addScaledVector( dir( - 82 ), - 0.6 ), end );
	for ( const p of [ foot, tip, end ] ) parts.rod( STEEL(), [ p.x - 0.35, p.y, p.z ], [ p.x + 0.35, p.y, p.z ], 0.08, 10 );
	for ( const x of [ - 0.2, 0.5 ] ) parts.box( dark, [ 0.1, 0.9, 1.2 ], [ x, 1.35, - 1.0 ] );
	for ( const x of [ - 0.18, 0.48 ] ) ram( parts, 0.11, [ x, 1.5, - 2.0 ], knee.clone().add( new Vector3( x - 0.15, - 0.45, 0 ) ) );
	ram( parts, 0.11, knee.clone().addScaledVector( behind( arm ), 0.55 ), tip.clone().addScaledVector( dir( - 82 ), - 0.6 ).addScaledVector( behind( - 82 ), 0.35 ) );
	parts.path( BLACK(), [ [ 0.15, 2.3, - 1.8 ], knee.clone().addScaledVector( behind( 50 ), 0.45 ).toArray(), tip.clone().addScaledVector( behind( arm ), 0.45 ).toArray(), end.clone().addScaledVector( behind( - 82 ), 0.3 ).toArray() ], 0.035, 6 );

	// Rotator and link under the stick end, then the lifter: housing, beam and pad.
	const [ x0, y0, z0 ] = [ end.x, end.y, end.z ];
	parts.box( dark, [ 0.45, 0.25, 0.45 ], [ x0, y0 - 0.35, z0 ] );
	parts.cylinder( dark, 0.2, 0.18, [ x0, y0 - 0.53, z0 ], 16 );
	const housing = y0 - 0.53;
	parts.box( body, [ 1.15, 0.6, 0.75 ], [ x0, housing - 0.6, z0 ] );
	for ( let i = 0; i < 5; i ++ ) parts.box( dark, [ 0.7, 0.03, 0.02 ], [ x0, housing - 0.5 + i * 0.08, z0 - 0.385 ] );
	parts.cylinder( dark, 0.035, 0.25, [ x0 + 0.4, housing, z0 + 0.15 ], 8 );
	const beam = housing - 0.6;
	parts.box( dark, [ 2.3, 0.18, 0.2 ], [ x0, beam - 0.18, z0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.12, 0.12, 0.7 ], [ x0 + s * 0.95, beam - 0.3, z0 ] );

	// The pad: a steel shell curved to the pipe across it (the pipe would lie along x), its rubber seal.
	const padTop = beam - 0.3;
	const yc = padTop - 0.08 - PIPE_R;
	const shell = [ ...arc( [ z0, yc ], PIPE_R + 0.08, 125, 55, 10 ), ...arc( [ z0, yc ], PIPE_R + 0.02, 55, 125, 10 ) ];
	parts.prism( dark, shell, 2.0, x0 );
	const seal = [ ...arc( [ z0, yc ], PIPE_R + 0.025, 128, 52, 10 ), ...arc( [ z0, yc ], PIPE_R, 52, 128, 10 ) ];
	parts.prism( RUBBER(), seal, 2.05, x0 );
	parts.path( BLACK(), [ [ x0 + 0.3, housing - 0.3, z0 + 0.38 ], [ x0 + 0.45, beam - 0.1, z0 + 0.3 ], [ x0 + 0.6, padTop + 0.02, z0 + 0.15 ] ], 0.025, 6 );
	return parts.build();

}

// --- holiday detector --------------------------------------------------------------------------

// Holiday testing before lowering in: 20 ft of 36 in coated pipe on two skids, with the holiday
// detector's coil-spring electrode ring round it and its handle, the inspector walking beside it
// with the detector unit on its strap and the ground lead trailing behind on the ground. Without
// the pipe it is only the ring and the inspector, at the height of a joint strung on skids, to set
// on the string.
function holidayDetector( withPipe = true ) {

	const parts = new Parts();
	const length = 20 * FT;
	const yc = 3 * 6 * IN + PIPE_R; // a skid pile's top plus the pipe's radius
	if ( withPipe ) {

		for ( const z of [ - length / 2 + 0.9, length / 2 - 0.9 ] ) skid( parts, [ 0, z ] );
		pipe( parts, [ 0, yc, 0 ], length, { cutback: 0.01 } );

	}

	// The spring ring and its frame: two guide wheels on top, the handle out to the right.
	const ringZ = - 0.6;
	const spring = mat( 0xc4c8cb, { roughness: 0.3, metalness: 0.7 } );
	parts.add( spring, new TorusGeometry( PIPE_R + 0.012, 0.012, 6, 64 ), _m.makeTranslation( 0, yc, ringZ ) );
	for ( let i = 0; i < 32; i ++ ) {

		const a = i / 32 * Math.PI * 2;
		parts.add( spring, new TorusGeometry( 0.016, 0.004, 4, 8 ), new Matrix4().makeRotationZ( a ).premultiply( new Matrix4().makeTranslation( Math.cos( a ) * ( PIPE_R + 0.012 ), yc + Math.sin( a ) * ( PIPE_R + 0.012 ), ringZ ) ).multiply( new Matrix4().makeRotationY( Math.PI / 2 ) ) );

	}

	const frame = paint( 0xd8a21c );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( frame, [ s * 0.18, yc + PIPE_R + 0.1, ringZ ], [ s * 0.1, yc + PIPE_R + 0.02, ringZ ], 0.015, 6 );
		parts.rod( RUBBER(), [ s * 0.18 - 0.02, yc + PIPE_R + 0.05, ringZ ], [ s * 0.18 + 0.02, yc + PIPE_R + 0.05, ringZ ], 0.05, 12 );

	}

	parts.rod( frame, [ - 0.2, yc + PIPE_R + 0.1, ringZ ], [ 0.2, yc + PIPE_R + 0.1, ringZ ], 0.015, 6 );
	const grip = [ 0.95, 1.0, ringZ ];
	parts.rod( frame, [ 0.2, yc + PIPE_R + 0.1, ringZ ], grip, 0.015, 6 );
	parts.rod( BLACK(), grip, [ 1.08, 0.98, ringZ ], 0.02, 6 );

	// The detector unit on the inspector's hip and its leads: to the ring, and the ground lead back.
	const unit = [ 0.92, 0.95, ringZ + 0.3 ];
	parts.box( paint( 0xd23b2a ), [ 0.12, 0.22, 0.28 ], unit );
	parts.path( BLACK(), [ [ 0.88, 1.05, ringZ + 0.2 ], [ 0.7, 1.15, ringZ + 0.05 ], [ 0.45, yc + 0.35, ringZ ] ], 0.008, 4 );
	parts.path( paint( 0x2e7d32 ), [ [ 0.95, 0.95, ringZ + 0.42 ], [ 0.9, 0.3, ringZ + 0.7 ], [ 0.85, 0.01, ringZ + 1.2 ], [ 0.95, 0.01, ringZ + 3.0 ], [ 0.8, 0.01, 2.8 ] ], 0.007, 4 );

	const group = parts.build();
	figure( group, 'worker-walking', [ 1.15, ringZ + 0.25 ] );
	return group;

}

// --- sandbag pillows ---------------------------------------------------------------------------

// Four sandbag piers for the pipe to rest on at the bottom of the ditch, 20 ft apart: each four
// courses of filled woven bags, crossed course to course and stepped in at the top, about 1.4 m
// across the ditch and 0.6 m high.
function sandbagPillows() {

	const parts = new Parts();
	const bags = [ mat( 0xd9d2bf, { roughness: 0.95 } ), mat( 0xcfc6ae, { roughness: 0.95 } ) ];
	const bag = [ 0.66, 0.16, 0.38 ];
	const spacing = 20 * FT;
	for ( let p = 0; p < 4; p ++ ) {

		const z0 = ( p - 1.5 ) * spacing;
		let n = 0;
		const put = ( x, y, z, across ) => {

			const [ sx, sy, sz ] = across ? bag : [ bag[ 2 ], bag[ 1 ], bag[ 0 ] ];
			parts.add( bags[ n ++ % 2 ], pillowGeometry(), new Matrix4().makeScale( sx / 2, sy / 2, sz / 2 ).setPosition( x, y + sy / 2, z0 + z ) );

		};

		// Courses crossed one on the next: bags across the ditch, then along it, then across, then
		// two on top where the pipe sits.
		const c = bag[ 1 ] * 0.9;
		for ( const x of [ - 0.34, 0.34 ] ) for ( const z of [ - 0.2, 0.2 ] ) put( x, 0, z, true );
		for ( const x of [ - 0.57, - 0.19, 0.19, 0.57 ] ) put( x, c, 0, false );
		for ( const x of [ - 0.34, 0.34 ] ) for ( const z of [ - 0.2, 0.2 ] ) put( x, 2 * c, z, true );
		for ( const x of [ - 0.2, 0.2 ] ) put( x, 3 * c, 0, false );

	}

	return parts.build();

}

// A filled bag's shape, 2 across each way: a sphere squared off in plan, so it's flat-sided with
// rounded, bulging top and bottom.
let pillow = null;
function pillowGeometry() {

	if ( ! pillow ) {

		pillow = new SphereGeometry( 1, 12, 6 );
		const position = pillow.attributes.position;
		const square = t => Math.sign( t ) * Math.abs( t ) ** 0.4;
		for ( let i = 0; i < position.count; i ++ ) position.setXYZ( i, square( position.getX( i ) ), position.getY( i ), square( position.getZ( i ) ) );
		pillow.computeVertexNormals();

	}

	return pillow.clone();

}

// --- saddle weights ----------------------------------------------------------------------------

// Four precast concrete set-on weights for 36 in pipe on 4 × 4 dunnage, as delivered to a wet
// crossing: each an inverted U, 1.6 m across, 1.4 m high and 0.9 m long (about 2.7 t), its
// cut-out sized over the coated pipe and its crown rounded, two lifting loops cast in the top.
function saddleWeights() {

	const parts = new Parts();
	const across = 1.6;
	const high = 1.4;
	const long = 0.9;
	const inner = PIPE_R + 0.05;
	const dun = 4 * IN;
	const outer = across / 2;
	const spring = high - outer;
	const profile = [
		[ - outer, dun ], [ - inner, dun ], [ - inner, spring ],
		...arc( [ 0, spring ], inner, 180, 0, 12 ).slice( 1, - 1 ),
		[ inner, spring ], [ inner, dun ], [ outer, dun ],
		...arc( [ 0, spring ], outer, 0, 180, 16 ),
	];
	const pitch = 1.3;
	for ( let i = 0; i < 4; i ++ ) {

		const z = ( i - 1.5 ) * pitch;
		alongZ( parts, CONCRETE(), profile, z - long / 2, z + long / 2 );
		for ( const x of [ - 0.6, 0.6 ] ) parts.box( TIMBER(), [ 0.1, dun, long + 0.2 ], [ x, 0, z ] );
		for ( const dz of [ - 0.2, 0.2 ] ) parts.path( STEEL(), [ [ - 0.1, high - 0.01, z + dz ], [ - 0.06, high + 0.1, z + dz ], [ 0.06, high + 0.1, z + dz ], [ 0.1, high - 0.01, z + dz ] ], 0.015, 6 );

	}

	return parts.build();

}

// --- padding machine ---------------------------------------------------------------------------

// A self-propelled padding machine of the large tracked class, about 9 m long, 4.9 m across with
// its side conveyor out and 3.6 m high: the inclined pickup conveyor at the front with its cutter
// drum on the ground, lifting spoil from the windrow up to the vibrating screen on top; the screened
// padding drops onto the cross conveyor that throws it out to the right into the ditch, round the
// pipe. The cab at the back left, the engine at the back right.
function paddingMachine() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();

	for ( const x of [ - 1.2, 1.2 ] ) crawler( parts, body, { length: 4.2, height: 0.9, width: 0.6, x, z: 0.8 } );
	parts.box( dark, [ 1.8, 0.5, 4.4 ], [ 0, 0.45, 0.8 ] );
	parts.box( body, [ 3.0, 0.15, 5.0 ], [ 0, 0.95, 1.0 ] );

	// The pickup conveyor: from the cutter drum on the ground ahead up to the screen, on two rams.
	const foot = [ 0, 0.45, - 5.0 ];
	const headP = [ 0, 3.15, - 1.0 ];
	conveyor( parts, foot, headP, 1.2 );
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( body, [ [ - 5.2, 0.2 ], [ - 0.9, 3.25 ], [ - 0.9, 3.6 ], [ - 5.2, 0.7 ] ], 0.06, s * 0.72 );
		ram( parts, 0.08, [ s * 0.75, 1.1, - 1.3 ], [ s * 0.75, 1.5, - 3.0 ] );

	}

	parts.rod( dark, [ - 0.75, 0.42, - 5.1 ], [ 0.75, 0.42, - 5.1 ], 0.33, 14 );
	for ( let i = 0; i < 8; i ++ ) {

		const a = i / 8 * Math.PI * 2;
		parts.block( STEEL(), [ 1.45, 0.06, 0.1 ], [ 0, 0.42 + Math.sin( a ) * 0.34, - 5.1 + Math.cos( a ) * 0.34 ], [ - a, 0, 0 ] );

	}

	member( parts, body, [ 0.2, 0.2 ], [ 0, 1.05, - 1.5 ], [ 0, 2.4, - 1.6 ] );

	// The screen box on its tower, tilted down to the back, with the reject chute behind it.
	for ( const sx of [ - 1, 1 ] ) for ( const z of [ - 1.2, 1.0 ] ) parts.box( body, [ 0.15, 1.35, 0.15 ], [ sx * 1.0, 1.1, z ] );
	const screen = Math.atan2( 0.3, 2.4 );
	parts.block( body, [ 2.3, 0.9, 2.5 ], [ 0, 2.95, - 0.1 ], [ - screen, 0, 0 ] );
	parts.block( STEEL(), [ 2.1, 0.03, 2.3 ], [ 0, 3.42, - 0.1 ], [ - screen, 0, 0 ] );
	parts.prism( dark, [ [ 1.1, 2.4 ], [ 1.6, 2.4 ], [ 1.9, 1.5 ], [ 1.5, 1.5 ] ], 1.6 );

	// The cross conveyor under the screen, out to the right.
	conveyor( parts, [ - 0.9, 1.95, - 0.1 ], [ 3.3, 2.15, - 0.1 ], 0.8 );
	member( parts, dark, [ 0.08, 0.08 ], [ 1.05, 2.7, - 0.1 ], [ 3.0, 2.25, - 0.1 ] );

	// Cab at the back left, engine at the back right.
	cab( parts, body, [ 1.15, 1.9, 1.5 ], [ - 0.85, 1.1, 2.45 ] );
	parts.box( body, [ 1.6, 1.3, 2.1 ], [ 0.65, 1.1, 2.55 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 0.02, 0.04, 1.3 ], [ 1.46, 1.4 + i * 0.1, 2.6 ] );
	parts.box( dark, [ 1.4, 1.0, 0.05 ], [ 0.65, 1.2, 3.62 ] );
	parts.cylinder( dark, 0.07, 0.7, [ 1.0, 2.4, 2.1 ], 10 );
	parts.sphere( AMBER(), 0.08, [ - 0.85, 3.08, 2.9 ] );
	return parts.build();

}

// --- rubber-track carrier ----------------------------------------------------------------------

// A rubber-track crawler carrier of the 11 t class, about 6.1 m long, 2.7 m wide and 3.1 m high:
// two wide rubber tracks, the cab at the front left beside the engine, and a 3.6 m steel dump body
// behind with a tall headboard over the cab's back and a dump ram under its front.
function trackedCarrier() {

	const parts = new Parts();
	const body = paint( 0xd2512a );
	const dark = DARK();

	for ( const x of [ - 1.0, 1.0 ] ) crawler( parts, dark, { length: 4.7, height: 0.8, width: 0.7, x, z: 0.2, rubber: true } );
	parts.box( dark, [ 1.3, 0.45, 4.6 ], [ 0, 0.35, 0.2 ] );
	parts.box( dark, [ 2.6, 0.2, 5.6 ], [ 0, 0.82, 0.0 ] );

	// Cab front left, engine hood front right with its grille.
	cab( parts, body, [ 1.15, 2.05, 1.35 ], [ - 0.7, 1.02, - 2.25 ] );
	parts.box( body, [ 1.4, 1.1, 1.5 ], [ 0.6, 1.02, - 2.15 ] );
	parts.box( dark, [ 1.1, 0.7, 0.04 ], [ 0.6, 1.2, - 2.92 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( STEEL(), [ 1.06, 0.025, 0.02 ], [ 0.6, 1.25 + i * 0.1, - 2.95 ] );
	parts.cylinder( dark, 0.06, 0.6, [ 1.0, 2.12, - 1.7 ], 10 );
	for ( const s of [ - 1, 1 ] ) parts.box( HEADLAMP(), [ 0.18, 0.1, 0.03 ], [ s * 0.95, 1.3, - 2.98 ] );
	parts.sphere( AMBER(), 0.07, [ - 0.7, 3.15, - 1.9 ] );
	parts.box( dark, [ 2.4, 0.3, 0.2 ], [ 0, 0.82, - 2.9 ] );

	// The dump body: floor, sides, tailgate, the headboard and its cab guard, the dump ram.
	const b0 = - 0.75;
	const b1 = 2.95;
	const floor = 1.42;
	const w = 1.17;
	parts.box( dark, [ 0.25, floor - 1.02, 3.4 ], [ - 0.6, 1.02, ( b0 + b1 ) / 2 ] );
	parts.box( dark, [ 0.25, floor - 1.02, 3.4 ], [ 0.6, 1.02, ( b0 + b1 ) / 2 ] );
	parts.box( body, [ 2 * w, 0.08, b1 - b0 ], [ 0, floor, ( b0 + b1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 0.06, 0.6, b1 - b0 ], [ s * ( w - 0.03 ), floor + 0.08, ( b0 + b1 ) / 2 ] );
		for ( const z of [ b0 + 0.9, b0 + 1.9, b0 + 2.9 ] ) parts.box( body, [ 0.08, 0.6, 0.08 ], [ s * ( w + 0.01 ), floor + 0.08, z ] );

	}

	parts.box( body, [ 2 * w, 0.62, 0.06 ], [ 0, floor + 0.08, b1 - 0.03 ] );
	parts.box( body, [ 2 * w, 1.55, 0.08 ], [ 0, floor + 0.08, b0 + 0.04 ] );
	parts.box( body, [ 2 * w, 0.06, 0.45 ], [ 0, floor + 1.6, b0 - 0.15 ] );
	ram( parts, 0.08, [ 0, 0.95, b0 + 0.3 ], [ 0, floor - 0.02, b0 + 1.0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.15, 0.08, 0.03 ], [ s * 1.0, 1.15, b1 ] );
	return parts.build();

}

// --- hydrotest pump skid -----------------------------------------------------------------------

// A hydrostatic test pump skid, 8 ft long and 6 ft wide, about 2 m high to its lifting eyes: a
// diesel engine at the back driving the triplex pressure pump through a belt guard, a centrifugal
// fill pump beside it, the fuel tank in the skid, the discharge manifold across the front with
// its valves and gauges, the pressure chart recorder facing front on its post, and a roll cage.
function hydrotestSkid() {

	const parts = new Parts();
	const frame = paint( 0x2f4f8f );
	const red = paint( 0xb3262a );
	const dark = DARK();
	const length = 8 * FT;
	const width = 6 * FT;
	const l = length / 2;
	const w = width / 2;

	// Skid: two runners, the deck with the fuel tank under it, the roll cage and lifting eyes.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.12, 0.2, length ], [ s * ( w - 0.06 ), 0, 0 ] );
	parts.box( dark, [ width - 0.24, 0.16, length - 0.1 ], [ 0, 0.02, 0 ] );
	parts.box( STEEL(), [ width, 0.02, length ], [ 0, 0.2, 0 ] );
	const cage = 1.85;
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( frame, [ 0.08, cage - 0.22, 0.08 ], [ sx * ( w - 0.04 ), 0.22, sz * ( l - 0.04 ) ] );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.08, 0.08, length ], [ s * ( w - 0.04 ), cage - 0.08, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ width, 0.08, 0.08 ], [ 0, cage - 0.08, s * ( l - 0.04 ) ] );
	for ( const s of [ - 1, 1 ] ) parts.path( frame, [ [ - 0.12, cage, s * 0.5 ], [ 0, cage + 0.14, s * 0.5 ], [ 0.12, cage, s * 0.5 ] ], 0.02, 6 );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ width, 0.08, 0.08 ], [ 0, cage - 0.08, s * 0.5 ] );

	// Diesel engine at the back with its radiator, exhaust and air cleaner.
	parts.box( red, [ 0.7, 0.75, 0.95 ], [ - 0.15, 0.22, 0.55 ] );
	parts.box( dark, [ 0.75, 0.85, 0.12 ], [ - 0.15, 0.22, 1.1 ] );
	for ( let i = 0; i < 8; i ++ ) parts.box( STEEL(), [ 0.65, 0.02, 0.02 ], [ - 0.15, 0.3 + i * 0.09, 1.17 ] );
	parts.rod( dark, [ 0.15, 0.95, 0.4 ], [ 0.15, 1.75, 0.4 ], 0.05, 10 );
	parts.cylinder( dark, 0.1, 0.25, [ - 0.4, 0.97, 0.7 ], 12 );

	// Belt guard and the triplex pump ahead of the engine: crankcase and three plunger heads to the front.
	parts.box( paint( 0xf2b200 ), [ 0.15, 0.6, 0.6 ], [ - 0.55, 0.3, - 0.05 ] );
	parts.box( dark, [ 0.7, 0.45, 0.45 ], [ - 0.15, 0.22, - 0.35 ] );
	for ( let i = 0; i < 3; i ++ ) parts.rod( STEEL(), [ - 0.38 + i * 0.23, 0.48, - 0.58 ], [ - 0.38 + i * 0.23, 0.48, - 0.75 ], 0.07, 10 );
	parts.rod( STEEL(), [ - 0.5, 0.48, - 0.8 ], [ 0.2, 0.48, - 0.8 ], 0.06, 10 );

	// The fill pump on the right with its suction and discharge flanges.
	parts.box( red, [ 0.5, 0.55, 0.8 ], [ 0.6, 0.22, 0.55 ] );
	parts.rod( STEEL(), [ 0.6, 0.45, - 0.1 ], [ 0.6, 0.45, 0.15 ], 0.11, 14 );
	parts.rod( STEEL(), [ 0.6, 0.45, - 0.1 ], [ 0.6, 0.45, - 1.15 ], 0.08, 12 );

	// Discharge manifold across the front: the header with valve handwheels, a tee to the hose
	// connection and the gauges on their stand.
	const mz = - 1.0;
	parts.rod( STEEL(), [ - 0.75, 0.6, mz ], [ 0.75, 0.6, mz ], 0.05, 10 );
	parts.rod( STEEL(), [ - 0.3, 0.6, mz ], [ - 0.3, 0.6, - 1.2 ], 0.05, 10 );
	parts.rod( dark, [ - 0.3, 0.6, - 1.2 ], [ - 0.3, 0.6, - l + 0.02 ], 0.08, 12 );
	for ( const x of [ - 0.6, 0.0, 0.35 ] ) {

		parts.box( red, [ 0.14, 0.18, 0.14 ], [ x, 0.51, mz ] );
		parts.rod( dark, [ x, 0.69, mz ], [ x, 0.82, mz ], 0.015, 6 );
		parts.add( red, new TorusGeometry( 0.08, 0.012, 6, 14 ), new Matrix4().makeRotationX( Math.PI / 2 ).setPosition( x, 0.83, mz ) );

	}

	parts.rod( dark, [ - 0.75, 0.22, - 0.9 ], [ - 0.75, 1.2, - 0.9 ], 0.025, 6 );
	for ( const x of [ - 0.78, - 0.55 ] ) {

		parts.rod( dark, [ x, 1.2, - 0.88 ], [ x, 1.2, - 0.96 ], 0.075, 16 );
		parts.add( WHITE(), new CircleGeometry( 0.065, 16 ), new Matrix4().makeRotationY( Math.PI ).setPosition( x, 1.2, - 0.961 ) );

	}

	parts.box( dark, [ 0.3, 0.04, 0.04 ], [ - 0.66, 1.13, - 0.9 ] );

	// The chart recorder on its post at the front right, its round chart facing out.
	parts.rod( dark, [ 0.6, 0.22, - 1.05 ], [ 0.6, 1.0, - 1.05 ], 0.03, 8 );
	parts.box( paint( 0x5d6b78 ), [ 0.42, 0.42, 0.14 ], [ 0.6, 1.0, - 1.05 ] );
	parts.add( WHITE(), new CircleGeometry( 0.17, 24 ), new Matrix4().makeRotationY( Math.PI ).setPosition( 0.6, 1.21, - 1.125 ) );
	parts.box( RED_LAMP(), [ 0.15, 0.008, 0.005 ], [ 0.66, 1.21, - 1.13 ] );
	return parts.build();

}

// --- test head ---------------------------------------------------------------------------------

// A fabricated temporary test head and pig launcher for 36 in pipe on timber cribbing: the 42 in
// barrel with the domed, bolted closure at the front, the reducer down to the 36 in neck at the
// back (bevelled, to weld onto the line), the 6 in kicker valve and fill line on top, a vent
// valve and pressure gauges, the drain under it, and the lifting lugs.
function testHead() {

	const parts = new Parts();
	const paintColour = paint( 0x6e7378 );
	const red = paint( 0xb3262a );
	const dark = DARK();
	const barrelR = 21 * IN;
	const crib = 4 * 6 * IN;
	const yc = crib + barrelR;
	const head = - 1.95;
	const barrelEnd = 0.9;
	const reducerEnd = 1.45;
	const neckEnd = 2.3;

	// Cribbing: crossed stacks of 6 × 6 timbers, four high, under the barrel, and one under the
	// neck with a block on top to make up the smaller pipe.
	const t = 6 * IN;
	const stack = ( z, top ) => {

		for ( let i = 0; i < 4; i ++ ) {

			if ( i % 2 ) for ( const x of [ - 0.45, 0.45 ] ) parts.box( TIMBER(), [ t, t, 1.2 ], [ x, i * t, z ] );
			else for ( const dz of [ - 0.45, 0.45 ] ) parts.box( TIMBER(), [ 1.2, t, t ], [ 0, i * t, z + dz ] );

		}

		if ( top > 4 * t + 0.01 ) parts.box( TIMBER(), [ 0.7, top - 4 * t, 0.3 ], [ 0, 4 * t, z ] );

	};

	stack( - 1.0, crib );
	stack( 0.4, crib );
	stack( 1.9, yc - PIPE_R );

	// Barrel, closure flange and dome, reducer and neck.
	parts.rod( paintColour, [ 0, yc, head + 0.2 ], [ 0, yc, barrelEnd ], barrelR, 32 );
	parts.rod( paintColour, [ 0, yc, head + 0.05 ], [ 0, yc, head + 0.3 ], barrelR + 0.09, 32 );
	for ( let i = 0; i < 20; i ++ ) {

		const a = i / 20 * Math.PI * 2;
		parts.rod( dark, [ Math.cos( a ) * ( barrelR + 0.05 ), yc + Math.sin( a ) * ( barrelR + 0.05 ), head + 0.02 ], [ Math.cos( a ) * ( barrelR + 0.05 ), yc + Math.sin( a ) * ( barrelR + 0.05 ), head + 0.33 ], 0.022, 6 );

	}

	parts.sphere( paintColour, barrelR, [ 0, yc, head + 0.06 ], [ 32, 12 ], [ 1, 1, 0.45 ] );
	parts.rod( paintColour, [ 0, yc, barrelEnd ], [ 0, yc, reducerEnd ], [ barrelR, PIPE_R ], 32 );
	pipe( parts, [ 0, yc, ( reducerEnd + neckEnd ) / 2 ], neckEnd - reducerEnd, { coat: paintColour, cutback: 0.03 } );
	parts.box( BARE(), [ 0.2, 0.04, 0.3 ], [ 0, yc + barrelR, - 1.3 ] );
	for ( const z of [ - 1.3, 0.4 ] ) parts.box( dark, [ 0.05, 0.14, 0.2 ], [ 0, yc + barrelR, z ] );

	// Kicker line on top near the back with its big valve, the fill line off it, vent and gauges.
	const top = yc + barrelR;
	parts.rod( paintColour, [ 0, top - 0.05, 0.3 ], [ 0, top + 0.35, 0.3 ], 0.085, 14 );
	parts.box( red, [ 0.28, 0.28, 0.28 ], [ 0, top + 0.35, 0.3 ] );
	parts.rod( dark, [ 0, top + 0.63, 0.3 ], [ 0, top + 0.78, 0.3 ], 0.02, 6 );
	parts.add( red, new TorusGeometry( 0.15, 0.015, 6, 16 ), new Matrix4().makeRotationX( Math.PI / 2 ).setPosition( 0, top + 0.79, 0.3 ) );
	parts.rod( paintColour, [ 0, top + 0.35, 0.44 ], [ 0, top + 0.35, 0.8 ], 0.085, 14 );
	parts.rod( dark, [ 0, top + 0.35, 0.8 ], [ 0, top + 0.35, 0.86 ], 0.15, 16 );

	// Vent valve at the top front, two gauges, the drain valve under the barrel.
	parts.rod( STEEL(), [ 0, top - 0.02, - 1.6 ], [ 0, top + 0.25, - 1.6 ], 0.03, 8 );
	parts.box( red, [ 0.1, 0.1, 0.1 ], [ 0, top + 0.15, - 1.6 ] );
	for ( const [ x, z ] of [ [ - 0.12, - 1.4 ], [ 0.12, - 1.4 ] ] ) {

		parts.rod( STEEL(), [ x, top - 0.03, z ], [ x, top + 0.2, z ], 0.012, 6 );
		parts.rod( dark, [ x, top + 0.26, z + 0.03 ], [ x, top + 0.26, z - 0.03 ], 0.07, 14 );
		parts.add( WHITE(), new CircleGeometry( 0.06, 14 ), new Matrix4().makeRotationY( Math.PI ).setPosition( x, top + 0.26, z - 0.031 ) );

	}

	parts.rod( STEEL(), [ 0, yc - barrelR + 0.02, - 0.3 ], [ 0, yc - barrelR - 0.15, - 0.3 ], 0.04, 8 );
	parts.box( red, [ 0.12, 0.12, 0.12 ], [ 0, yc - barrelR - 0.2, - 0.3 ] );
	return parts.build();

}
